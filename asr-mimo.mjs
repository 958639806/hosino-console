// HOSINO-ASR-MIMO v2 reviewed —— 小米 MiMo 语音转文字代理（只转写，不发消息、不落盘音频）
// 板子/网页把 16kHz 单声道 16bit WAV（或 MP3）原始字节 POST 上来，服务端 base64 后转发 mimo-v2.5-asr。
// 日志只记字节数/时长/状态/耗时；绝不记录 key、音频、识别文本。
export const ASR_DEFAULTS = Object.freeze({
  model: "mimo-v2.5-asr",
  maxBytes: 1048576,      // 1MB 原始音频（15s 16k/16bit/mono WAV ≈ 480KB）
  maxSec: 16,             // 时长上限（板子按 15s 录，留 1s 余量）
  minSec: 0.2,
  timeoutMs: 20000,
  perMin: 6,
  perDay: 200,
  auth: "bearer",         // bearer | api-key（官方文档两种都支持；OpenClaw 现用 Bearer）
});

const LANGS = new Set(["auto", "zh", "en"]);
const err = (status, code, error, extra) => ({ status, body: { error, code, ...(extra || {}) } });

// ---------- 音频校验（纯函数，可单测） ----------
export function inspectWav(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12, fmt = null, dataLen = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4), sz = buf.readUInt32LE(off + 4), body = off + 8;
    if (id === "fmt " && sz >= 16 && body + 16 <= buf.length) {
      fmt = { audioFormat: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), byteRate: buf.readUInt32LE(body + 8), blockAlign: buf.readUInt16LE(body + 12), bits: buf.readUInt16LE(body + 14) };
      if (fmt.audioFormat === 0xfffe && sz >= 40 && body + 26 <= buf.length) fmt.audioFormat = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE 子格式
    } else if (id === "data") {
      // 流式录音常把 data 长度写成 0 / 0xFFFFFFFF：按实际剩余字节算
      dataLen = (sz === 0 || sz === 0xffffffff || body + sz > buf.length) ? buf.length - body : sz;
      break;
    }
    off = body + sz + (sz & 1);
  }
  if (!fmt || dataLen == null) return { ok: false, reason: "WAV 缺少 fmt 或 data 块" };
  if (fmt.audioFormat !== 1) return { ok: false, reason: "WAV 只支持 PCM（audioFormat=1）" };
  if (!fmt.channels || !fmt.sampleRate || ![8, 16, 24, 32].includes(fmt.bits)) return { ok: false, reason: "WAV 参数无效" };
  const byteRate = fmt.sampleRate * fmt.channels * (fmt.bits / 8);
  const durationMs = Math.round(dataLen / byteRate * 1000);
  const recommended = fmt.sampleRate === 16000 && fmt.channels === 1 && fmt.bits === 16;
  return { ok: true, format: "wav", mime: "audio/wav", durationMs, sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits, recommended };
}

const MP3_BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
export function inspectMp3(buf) {
  let off = 0;
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "ID3") off = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const lim = Math.min(buf.length - 4, off + 8192);
  for (let i = off; i < lim; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3, bri = buf[i + 2] >> 4, sri = (buf[i + 2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) continue; // 只认 Layer III
    const kbps = MP3_BR[ver === 3 ? 1 : 2][bri];
    // 按首帧码率估算（CBR 准确，VBR 近似）
    const durationMs = Math.round((buf.length - i) * 8 / kbps);
    return { ok: true, format: "mp3", mime: "audio/mpeg", durationMs, kbps, recommended: false, estimated: true };
  }
  return null;
}

export function inspectAudio(buf, contentType = "") {
  const ct = String(contentType).split(";")[0].trim().toLowerCase();
  if (!["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "application/octet-stream", ""].includes(ct)) return { ok: false, reason: "Content-Type 只支持 audio/wav 或 audio/mpeg" };
  const r = inspectWav(buf) || inspectMp3(buf); // 按内容判断，不信 Content-Type
  return r || { ok: false, reason: "不是可识别的 WAV（RIFF/WAVE PCM）或 MP3" };
}

// ---------- 限流（按登录会话 sid，内存，重启清零） ----------
export function makeLimiter({ perMin, perDay, now = Date.now }) {
  const m = new Map(); // sid -> { min: [ts...], day, dayKey, busy }
  const dayKey = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 新加坡日
  setInterval(() => { const k = dayKey(now()); for (const [s, v] of m) if (v.dayKey !== k && !v.busy) m.delete(s); }, 3600e3).unref?.();
  return {
    take(sid) {
      const t = now(), k = dayKey(t); let v = m.get(sid);
      if (!v) { v = { min: [], day: 0, dayKey: k, busy: false }; m.set(sid, v); }
      // Keep the object captured by an in-flight request's release() across midnight.
      if (v.dayKey !== k) { v.day = 0; v.dayKey = k; }
      if (v.busy) return { ok: false, code: "asr_busy", error: "上一段还在识别，请稍候", retryAfterMs: 1000 };
      v.min = v.min.filter(x => t - x < 60e3);
      if (v.min.length >= perMin) return { ok: false, code: "rate_limited", error: `每分钟最多 ${perMin} 次`, retryAfterMs: 60e3 - (t - v.min[0]) };
      if (v.day >= perDay) return { ok: false, code: "rate_limited", error: `今天已用满 ${perDay} 次`, retryAfterMs: null };
      v.min.push(t); v.day++; v.busy = true;
      return { ok: true, release: () => { v.busy = false; }, remainingToday: perDay - v.day };
    },
  };
}

// ---------- 读原始请求体（带上限，不落盘） ----------
function readRaw(req, max) {
  return new Promise(resolve => {
    const len = +req.headers["content-length"];
    if (len > max) { req.resume(); return resolve({ tooLarge: true }); }
    const chunks = []; let n = 0, done = false;
    const fin = v => { if (!done) { done = true; resolve(v); } };
    req.on("data", c => { if (done) return; n += c.length; if (n > max) { fin({ tooLarge: true }); req.resume(); return; } chunks.push(c); });
    req.on("end", () => fin({ buf: Buffer.concat(chunks) }));
    req.on("error", () => fin({ aborted: true })); req.on("aborted", () => fin({ aborted: true }));
  });
}

export const ASR_DEFAULT_BASE = "https://api.xiaomimimo.com/v1";
export const ASR_MAX_RESPONSE_BYTES = 65536;

// Count streamed (decoded) response bytes; Content-Length alone is not a bound.
async function readUpstreamJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_upstream_body");
  const chunks = []; let bytes = 0, completed = false;
  try {
    if (Number(response.headers.get("content-length")) > ASR_MAX_RESPONSE_BYTES) throw new Error("upstream_response_too_large");
    while (true) {
      const part = await reader.read();
      if (part.done) { completed = true; break; }
      bytes += part.value.byteLength;
      if (bytes > ASR_MAX_RESPONSE_BYTES) throw new Error("upstream_response_too_large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } finally {
    if (!completed) { try { await reader.cancel(); } catch {} }
    reader.releaseLock();
  }
}

// ---------- 工厂 ----------
// 凭据：只用独立环境变量 HS_ASR_API_KEY（按量付费 sk- key）；不读、不回退 Token Plan 的 XIAOMI_MIMO_API_KEY。缺 key → 503 asr_not_configured
// 上游：HS_ASR_BASE，默认 https://api.xiaomimimo.com/v1
// getKey 仅供测试注入；生产不传
// log: (req, target, ok, status) => void（生产：opLog(req, "asr.transcribe", …)）
export function makeAsr({ getKey, log = () => {}, env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const cfg = {
    model: env.HS_ASR_MODEL || ASR_DEFAULTS.model,
    maxBytes: +env.HS_ASR_MAX_BYTES || ASR_DEFAULTS.maxBytes,
    maxSec: +env.HS_ASR_MAX_SEC || ASR_DEFAULTS.maxSec,
    timeoutMs: +env.HS_ASR_TIMEOUT_MS || ASR_DEFAULTS.timeoutMs,
    perMin: +env.HS_ASR_PER_MIN || ASR_DEFAULTS.perMin,
    perDay: +env.HS_ASR_PER_DAY || ASR_DEFAULTS.perDay,
    auth: env.HS_ASR_AUTH === "api-key" ? "api-key" : ASR_DEFAULTS.auth,
    enabled: env.HS_ASR !== "off",
  };
  if (!getKey) getKey = async () => String(env.HS_ASR_API_KEY || "").trim() || null;
  const base = () => String(env.HS_ASR_BASE || ASR_DEFAULT_BASE).replace(/\/+$/, "");
  const limiter = makeLimiter({ perMin: cfg.perMin, perDay: cfg.perDay, now });

  async function status() {
    let configured = false; try { configured = cfg.enabled && !!(await getKey()); } catch {}
    return { ok: true, configured, model: cfg.model, formats: ["wav", "mp3"], recommended: "16kHz 单声道 16bit PCM WAV", maxBytes: cfg.maxBytes, maxSec: cfg.maxSec, perMin: cfg.perMin, perDay: cfg.perDay, timeoutMs: cfg.timeoutMs };
  }

  // 返回 { status, body }；调用方负责 send()
  async function transcribe(req, sid, u) {
    const t0 = now(); let bytes = 0, durationMs = null;
    const done = (r, upstreamMs) => { log(req, `bytes=${bytes} dur=${durationMs ?? "-"}ms status=${r.status}${r.body.code ? " code=" + r.body.code : ""} ms=${now() - t0}${upstreamMs != null ? " up=" + upstreamMs : ""}`, r.status === 200, r.status); return r; };
    if (!cfg.enabled) { req.resume(); return done(err(503, "asr_not_configured", "语音识别已关闭")); }
    const lang = (u?.searchParams?.get("lang") || "auto").toLowerCase();
    if (!LANGS.has(lang)) { req.resume(); return done(err(400, "bad_request", "lang 只能是 auto / zh / en")); }
    const raw = await readRaw(req, cfg.maxBytes);
    if (raw.tooLarge) return done(err(413, "too_large", `音频不能超过 ${Math.round(cfg.maxBytes / 1024)}KB`));
    if (raw.aborted) return done(err(400, "bad_audio", "上传中断"));
    const buf = raw.buf; bytes = buf.length;
    if (!bytes) return done(err(400, "bad_audio", "空音频"));
    const a = inspectAudio(buf, req.headers["content-type"]);
    if (!a.ok) return done(err(a.reason?.startsWith("Content-Type") ? 415 : 400, "bad_audio", a.reason));
    durationMs = a.durationMs;
    if (durationMs > cfg.maxSec * 1000) return done(err(400, "too_long", `音频不能超过 ${cfg.maxSec} 秒`, { durationMs }));
    if (durationMs < ASR_DEFAULTS.minSec * 1000) return done(err(400, "too_short", "音频太短", { durationMs }));
    let key = null; try { key = await getKey(); } catch {}
    if (!key) return done(err(503, "asr_not_configured", "服务器没配置 MiMo 语音识别凭据"));
    const lim = limiter.take(sid || "anon");
    if (!lim.ok) return done(err(429, lim.code, lim.error, { retryAfterMs: lim.retryAfterMs }));
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), cfg.timeoutMs); const tu = now();
    try {
      const payload = { model: cfg.model, messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${a.mime};base64,${buf.toString("base64")}`, format: a.format } }] }], asr_options: { language: lang }, stream: false };
      const headers = { "content-type": "application/json", accept: "application/json", ...(cfg.auth === "api-key" ? { "api-key": key } : { authorization: `Bearer ${key}` }) };
      let r; try { r = await fetchImpl(base() + "/chat/completions", { method: "POST", headers, body: JSON.stringify(payload), signal: ac.signal, redirect: "error" }); }
      catch (e) { return done(ac.signal.aborted ? err(504, "upstream_timeout", `识别超时（${Math.round(cfg.timeoutMs / 1000)} 秒）`) : err(502, "upstream_error", "连不上语音识别服务"), now() - tu); }
      if (!r.ok) {
        // 只透出上游状态码，不透出上游正文（可能回显请求片段）
        const s = r.status;
        try { await r.body?.cancel(); } catch {}
        const code = s === 401 || s === 403 ? "upstream_auth" : s === 429 ? "upstream_rate_limited" : "upstream_error";
        return done(err(502, code, `语音识别服务返回 ${s}`, { upstreamStatus: s }), now() - tu);
      }
      let j;
      try { j = await readUpstreamJson(r); }
      catch (e) {
        return done(ac.signal.aborted ? err(504, "upstream_timeout", `识别超时（${Math.round(cfg.timeoutMs / 1000)} 秒）`) : err(502, "upstream_error", e.message === "upstream_response_too_large" ? "语音识别服务响应过大" : "语音识别服务返回格式不对"), now() - tu);
      }
      const upMs = now() - tu;
      const c = j?.choices?.[0]?.message?.content;
      const text = typeof c === "string" ? c.trim() : Array.isArray(c) ? c.map(p => typeof p === "string" ? p : p?.text || "").join("").trim() : null;
      if (text == null) return done(err(502, "upstream_error", "语音识别服务返回格式不对"), upMs);
      return done({ status: 200, body: { ok: true, text, model: cfg.model, durationMs, latencyMs: now() - t0, ...(j?.usage?.seconds != null ? { billedSec: j.usage.seconds } : {}), ...(a.recommended || a.format !== "wav" ? {} : { warning: "建议 16kHz 单声道 16bit" }) } }, upMs);
    } finally { clearTimeout(timer); lim.release(); }
  }
  return { status, transcribe, cfg };
}
