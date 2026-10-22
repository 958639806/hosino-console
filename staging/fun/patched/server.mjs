// 星野控制台 hosino-console — 轻量后端：密码登录 + 网关 WS 代理（令牌只在服务端）
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const PORT = +process.env.PORT || 18890;
const HASH = process.env.LOGIN_HASH;
const CFG = process.env.OPENCLAW_CONFIG || "/home/ubuntu/.openclaw/openclaw.json";
const GW = process.env.GATEWAY_URL || "wss://127.0.0.1:18789";
const QDRANT = process.env.QDRANT_URL || "http://127.0.0.1:6333";
const MEMCOL = process.env.MEM_COLLECTION || "mem0_full_timestamped_20260926";
const PUB = path.join(path.dirname(new URL(import.meta.url).pathname), "public");
// 网关自签证书：只对这一条 wss 连接做证书固定（CA=该证书 + SHA-256 指纹比对），不再全局关闭 TLS 校验
const WS = require("ws");
const GW_CERT = process.env.GATEWAY_CERT || path.join(path.dirname(new URL(import.meta.url).pathname), "gateway-cert.pem");
const GW_FP = (process.env.GATEWAY_FP || "").toUpperCase();
const gwTls = () => { const ca = fs.readFileSync(GW_CERT, "utf8"); const fp = GW_FP || new crypto.X509Certificate(ca).fingerprint256; return { ca, checkServerIdentity: (h, cert) => cert.fingerprint256 === fp ? undefined : new Error("网关证书指纹不匹配") }; };

// ---------- 登录 / 会话 ----------
const sessions = new Map(); // sid -> expires
const fails = new Map();    // ip -> {n, first, lockUntil}
const TTL = 7 * 864e5, WIN = 15 * 60e3, MAXF = 5;
const ipOf = r => (r.headers["x-real-ip"] || r.socket.remoteAddress || "").toString();
const cookieSid = r => (/(?:^|;\s*)hs_sid=([a-f0-9]{64})/.exec(r.headers.cookie || "") || [])[1];
const authed = r => { const s = cookieSid(r); const e = s && sessions.get(s); if (e && e > Date.now()) return s; if (s) sessions.delete(s); return null; };
setInterval(() => { const n = Date.now(); for (const [k, v] of sessions) if (v < n) sessions.delete(k); for (const [k, v] of fails) if (v.first + WIN < n && v.lockUntil < n) fails.delete(k); }, 60e3).unref();

// ---------- 网关客户端（单连接，自动重连） ----------
let ws = null, ready = null, seq = 0; const pend = new Map(); let gwHello = null;
const token = () => JSON.parse(fs.readFileSync(CFG, "utf8")).gateway.auth.token;
function connect() {
  if (ready) return ready;
  ready = new Promise((res, rej) => {
    const s = new WS(GW, gwTls()); let done = false;
    const fail = e => { if (!done) { done = true; rej(e); } ready = null; ws = null; for (const [, p] of pend) p.rej(new Error("网关连接断开")); pend.clear(); };
    const t = setTimeout(() => { fail(new Error("网关握手超时")); try { s.close(); } catch {} }, 8000);
    s.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.event === "connect.challenge") {
        const id = "c" + (++seq);
        pend.set(id, { res: p => { clearTimeout(t); gwHello = p; ws = s; done = true; res(s); }, rej: fail });
        s.send(JSON.stringify({ type: "req", id, method: "connect", params: { minProtocol: 4, maxProtocol: 4, client: { id: "gateway-client", displayName: "hosino-console", version: "1.0", platform: "linux", mode: "backend" }, role: "operator", scopes: ["operator.admin"], auth: { token: token() } } }));
        return;
      }
      if (d.type === "res" && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.ok ? p.res(d.payload) : p.rej(Object.assign(new Error(d.error?.message || "网关错误"), { code: d.error?.code })); }
    };
    s.onclose = () => fail(new Error("网关连接关闭"));
    s.onerror = () => {};
  });
  return ready;
}
async function call(method, params = {}, timeout = 15000) {
  const s = await connect(); const id = "r" + (++seq);
  return new Promise((res, rej) => {
    const t = setTimeout(() => { pend.delete(id); rej(new Error("网关调用超时：" + method)); }, timeout);
    pend.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    s.send(JSON.stringify({ type: "req", id, method, params }));
  });
}
const cache = new Map();
async function cached(key, ttl, fn) { const c = cache.get(key); if (c && c.t + ttl > Date.now()) return c.v; if (c?.p) return c.p; const p = fn().then(v => { cache.set(key, { t: Date.now(), v }); return v; }).catch(e => { cache.delete(key); throw e; }); cache.set(key, { ...(c || { t: 0 }), p, t: c?.t || 0 }); return p; }

// ---------- 脱敏 ----------
const SECRET = /(token|secret|password|passwd|api[-_]?key|apikey|cookie|private|credential|authorization|bearer|appsecret|clientsecret)/i;
function redact(v, k = "") {
  if (Array.isArray(v)) return v.map(x => redact(x, k));
  if (v && typeof v === "object") { const o = {}; for (const [kk, vv] of Object.entries(v)) o[kk] = redact(vv, kk); return o; }
  if (typeof v === "string" && SECRET.test(k) && v.length) return "••••••（已隐藏）";
  if (typeof v === "string" && /^(sk-|xai-|ghp_|eyJ)[A-Za-z0-9._-]{16,}/.test(v)) return "••••••（已隐藏）";
  return v;
}

// ---------- 聊天记录 v2.3：工具调用链 + 投递标注 ----------
const SECRET_TXT = [
  [/\b(sk-[A-Za-z0-9_-]{12,}|xai-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abposr]-[A-Za-z0-9-]{10,})/g, "••••••"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "••••••"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "••••••(私钥已隐藏)"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{8,}/gi, "$1 ••••••"],
  [/((?:^|[\s"'{,;])(?:set-)?cookie["']?\s*[:=]\s*["']?)[^\n"']{4,}/gi, "$1••••••"],
  [/((?:access_?token|refresh_?token|id_?token|api[_-]?key|apikey|secret|password|passwd|client_?secret|app_?secret|authorization|private_?key|token)["']?\s*[:=]\s*["']?)[^\s"',;&}]{4,}/gi, "$1••••••"],
];
const redactText = s => { for (const [re, to] of SECRET_TXT) s = s.replace(re, to); return s; };
const clip = (v, n) => { let s = typeof v === "string" ? v : JSON.stringify(v, null, 1); if (s === undefined) s = ""; s = redactText(s); return s.length > n ? { text: s.slice(0, n), truncated: true, length: s.length } : { text: s, truncated: false, length: s.length }; };
const resultText = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(b => b?.type === "text" ? b.text : b?.type === "image" ? "[图片]" : JSON.stringify(b)).join("\n") : JSON.stringify(c);
const isToolBlock = b => b && ["toolCall", "toolcall", "tool_use", "toolUse", "functionCall"].includes(b.type);
const isResBlock = b => b && ["tool_result", "toolResult"].includes(b.type);
const textOf = m => typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter(b => b?.type === "text").map(b => b.text).join("\n") : "";
// qq-send-ok 日志（网关 /tmp/openclaw/*.log，只读，只覆盖日志保留期内的群聊回复）
let sendOkCache = { t: 0, ids: new Set(), seen: new Set(), from: null };
function sendOkIds() {
  if (Date.now() - sendOkCache.t < 60e3) return sendOkCache;
  const ids = new Set(), seen = new Set(); let from = null;
  try {
    const dir = "/tmp/openclaw"; for (const f of fs.readdirSync(dir).filter(x => /^openclaw-\d{4}-\d\d-\d\d\.log$/.test(x)).sort()) {
      if (!from) from = f.slice(9, 19);
      const txt = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of txt.matchAll(/\[qq-latency\] id=(\S+) [^"]*?phase=([a-z-]+)/g)) { seen.add(m[1]); if (m[2] === "qq-send-ok") ids.add(m[1]); }
    }
  } catch {}
  return (sendOkCache = { t: Date.now(), ids, seen, from });
}
function buildHistory(raw, sess) {
  const qq = /:qqbot:/.test(raw.sessionKey || "") || sess?.deliveryContext?.channel === "qqbot" || sess?.lastChannel === "qqbot";
  const log = qq ? sendOkIds() : null;
  const out = [], byCall = new Map(); let turn = null, tn = 0;
  const trigs = new Map(); const newTurn = trig => { turn = { id: "t" + (++tn), msgs: [] }; trigs.set(turn.id, trig); };
  for (const m of raw.messages || []) {
    const o = m.__openclaw || {};
    const blocks = Array.isArray(m.content) ? m.content : null;
    // 工具结果：独立 toolResult 消息 / user 里的 tool_result 块 → 挂回对应调用
    const resBlocks = blocks ? blocks.filter(isResBlock) : [];
    if (m.role === "toolResult" || (m.role === "user" && blocks && resBlocks.length && resBlocks.length === blocks.length)) {
      const list = m.role === "toolResult" ? [{ id: m.toolCallId, content: m.content, isError: m.isError, name: m.toolName }] : resBlocks.map(b => ({ id: b.tool_use_id || b.toolCallId, content: b.content, isError: b.is_error ?? b.isError, name: b.name }));
      for (const r of list) { const c = byCall.get(r.id); if (c) { c.result = clip(resultText(r.content), 4096); c.isError = !!r.isError; c.status = r.isError ? "error" : "ok"; if (c._ts && m.timestamp) c.durationMs = Math.max(0, m.timestamp - c._ts); if (o.truncated) c.result.gatewayTruncated = true; } }
      continue;
    }
    if (m.role === "user" || m.role === "system") newTurn(m);
    if (!turn) newTurn(null);
    const e = { id: o.id, ...(m.role === "user" && (o.idempotencyKey || m.idempotencyKey) ? { idempotencyKey: o.idempotencyKey || m.idempotencyKey } : {}), ...(m.role === "user" && o.runId ? { runId: o.runId } : {}), role: m.role, content: m.content, ts: m.timestamp, model: m.model, provider: m.provider, toolName: m.toolName, isError: m.isError, owner: o.senderIsOwner, sender: m.role === "user" ? senderOf(o) : undefined, senderId: o.senderId, senderName: o.senderName, kind: o.kind || m.customType, turnId: turn.id };
    if (m.role === "assistant" && blocks) {
      e.content = blocks.filter(b => !isToolBlock(b) && !isResBlock(b));
      e.tools = [];
      for (const b of blocks) {
        if (isToolBlock(b)) { const c = { id: b.id, name: b.name, args: clip(b.arguments ?? b.input ?? b.args ?? {}, 2048), result: null, isError: false, status: "pending", durationMs: null, _ts: m.timestamp }; e.tools.push(c); byCall.set(b.id, c); }
        else if (isResBlock(b)) { const c = byCall.get(b.tool_use_id); if (c) { c.result = clip(resultText(b.content), 4096); c.isError = !!(b.is_error ?? b.isError); c.status = c.isError ? "error" : "ok"; } }
      }
      turn.msgs.push(e);
    }
    out.push(e);
  }
  // 投递判定
  const turns = new Map(); for (const e of out) if (e.role === "assistant") { (turns.get(e.turnId) || turns.set(e.turnId, []).get(e.turnId)).push(e); }
  const trigOf = trigs;
  const silentTurns = new Set(); for (const e of out) if (e.tools?.some(t => /stay_silent$/.test(t.name || ""))) silentTurns.add(e.turnId);
  for (const [tid, list] of turns) {
    const trig = trigOf.get(tid); const tr = trig?.__openclaw?.transport; const runId = tr?.messageId;
    const trigText = typeof trig?.content === "string" ? trig.content : "";
    const texts = list.filter(e => e.model !== "delivery-mirror" && textOf(e).trim());
    const final = texts[texts.length - 1];
    for (const e of list) {
      const t = textOf(e).trim(); const set = (d, r, c) => { e.delivery = d; e.deliveryReason = r; e.deliveryConfidence = c; };
      if (!t) { e.delivery = null; continue; }               // 纯工具调用消息，无可投递文本
      if (e.model === "delivery-mirror") { /not confirmed/i.test(t) ? set("unknown", "mirror-unconfirmed", "low") : set("sent", "delivery-mirror", "high"); continue; }
      if (!qq) { set("silent", "no-channel", "high"); continue; }
      if (/^(NO_REPLY|HEARTBEAT_OK|No response requested\.?)$/i.test(t)) { set("silent", "silent-token", "high"); continue; }
      if (silentTurns.has(tid)) { set("silent", "stay_silent", "high"); continue; }
      if (!tr) { /^Cache keepalive only/.test(trigText) ? set("silent", "keepalive", "high") : set("unknown", "non-channel-trigger", "low"); continue; }
      if (e !== final) { set("unknown", "intermediate-text", "low"); continue; }
      if (runId && log.ids.has(runId)) { set("sent", "qq-send-ok", "high"); continue; }
      if (runId && log.seen.has(runId)) { set("unknown", "no-send-ok-log", "low"); continue; }
      set("sent", "final-reply-inferred", "medium");
    }
  }
  for (const e of out) if (e.role === "custom" && e.kind === "run-failed-before-reply") { e.delivery = "silent"; e.deliveryReason = "run-failed"; e.deliveryConfidence = "high"; }
  for (const e of out) for (const c of e.tools || []) delete c._ts;
  return { sessionKey: raw.sessionKey, channel: qq ? "qqbot" : null, sendLogFrom: log?.from || null, hasMore: raw.hasMore, totalMessages: raw.totalMessages, messages: out };
}

// ---------- 主机指标 ----------
let lastCpu = null;
function cpuPct() { const l = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].split(/\s+/).slice(1).map(Number); const idle = l[3] + l[4], tot = l.reduce((a, b) => a + b, 0); let p = null; if (lastCpu) p = 100 * (1 - (idle - lastCpu.idle) / Math.max(1, tot - lastCpu.tot)); lastCpu = { idle, tot }; return p; }
cpuPct();
function mem() { const m = {}; for (const l of fs.readFileSync("/proc/meminfo", "utf8").split("\n")) { const [k, v] = l.split(/:\s+/); if (v) m[k] = parseInt(v) * 1024; } return { total: m.MemTotal, available: m.MemAvailable, swapTotal: m.SwapTotal, swapFree: m.SwapFree }; }
function disk() { const s = fs.statfsSync("/"); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; }
const gwUnit = () => new Promise(r => execFile("ps", ["-o", "pid=,etimes=,rss=,%cpu=", "-p", String(gwHello?.server?.pid || sysPid || 0)], (e, o) => { const [pid, et, rss, cpu] = (o || "").trim().split(/\s+/); r(pid ? { pid: +pid, uptimeSec: +et, rssBytes: rss * 1024, cpu: +cpu } : null); }));
let sysPid = 0;

// ---------- 记忆（Qdrant 只读） ----------
async function q(p, body) { const r = await fetch(QDRANT + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}); if (!r.ok) throw new Error("Qdrant " + r.status); return (await r.json()).result; }
const runX = (cmd, args, t = 5000) => new Promise(r => execFile(cmd, args, { timeout: t, maxBuffer: 1 << 20 }, (e, o, er) => r({ e: e ? (String(er || e.message).trim().slice(0, 200)) : null, o: o || "" })));
const VPN_UNITS = ["openclaw-xray-reality", "openclaw-wireguard-la", "openclaw-wireguard-phone"];
const vpnStatus = () => cached("vpn", 30e3, async () => {
  const errors = [], now = Math.floor(Date.now() / 1000);
  const services = await Promise.all(VPN_UNITS.map(async name => { const x = await runX("systemctl", ["show", name, "-p", "ActiveState,SubState,ActiveEnterTimestamp"]); const kv = Object.fromEntries(x.o.trim().split("\n").filter(Boolean).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])); if (x.e) errors.push(name + ": " + x.e); const since = kv.ActiveEnterTimestamp ? Date.parse(kv.ActiveEnterTimestamp.replace(/ [A-Z]+$/, "")) || null : null; return { name, active: kv.ActiveState === "active", state: kv.ActiveState || null, sub: kv.SubState || null, since: kv.ActiveEnterTimestamp || null, sinceMs: since }; }));
  let wireguard = null, wgJson = null; const w = await runX("sudo", ["-n", "/usr/local/sbin/hosino-wg-status"]);
  if (w.e) errors.push("wg: " + w.e); else try { const j = JSON.parse(w.o); wgJson = j; const ifs = (j.interfaces || []).map(i => ({ ...i, peers: (i.peers || []).map(p => ({ ...p, online: !!p.latestHandshake && now - p.latestHandshake < 180, handshakeAgoSec: p.latestHandshake ? now - p.latestHandshake : null })) })); wireguard = { interfaces: ifs, onlinePeers: ifs.reduce((a, i) => a + i.peers.filter(p => p.online).length, 0), totalPeers: ifs.reduce((a, i) => a + i.peers.length, 0) }; } catch (e) { errors.push("wg parse: " + e.message); }
  const l = await runX("ss", ["-Hltnu"]); if (l.e) errors.push("ss -l: " + l.e);
  const listening = [...new Set(l.o.split("\n").map(x => x.trim().split(/\s+/)).filter(a => a.length > 4).map(a => a[0] + ":" + a[4].split(":").pop()))].filter(x => /:(8443|51820|51821)$/.test(x));
  const c = await runX("ss", ["-Htn", "state", "established", "( sport = :8443 )"]); if (c.e) errors.push("ss est: " + c.e);
  const xs = services.find(s => s.name === "openclaw-xray-reality");
  const wgOnline = n => { const svc = services.find(s => s.name === n); const i = (wireguard?.interfaces || []).find(i => i.name === n.replace("openclaw-wireguard-", "wg-")); return { name: i?.name || n, unit: n, port: n.endsWith("-la") ? 51820 : 51821, online: !!svc?.active && !!i, peerOnline: i ? i.peers.some(p => p.online) : false }; };
  const hx = wgJson?.xray || null;
  return { services, listening, wireguard, wg: [wgOnline("openclaw-wireguard-la"), wgOnline("openclaw-wireguard-phone")], xray: { active: !!xs?.active, since: xs?.since || null, port: 8443, connections: c.e ? null : c.o.split("\n").filter(x => x.trim()).length, ...(hx ? { sub: hx.sub, uptimeSec: hx.uptimeSec, restarts: hx.restarts, memoryBytes: hx.memoryBytes, cpuSec: hx.cpuSec, uniqueClients: hx.uniqueClients, listening: hx.listening, version: hx.version, config: hx.config } : {}), note: "连接数含探测/回落，不等于用户数" }, error: errors.length ? errors.join("; ") : null, ts: Date.now() };
});
const memAll = () => cached("memall", 10 * 60e3, async () => {
  const out = []; let off = null;
  do { const r = await q(`/collections/${MEMCOL}/points/scroll`, { limit: 1000, offset: off, with_vector: false, with_payload: ["data", "createdAt", "updatedAt", "user_id", "oc_visibility", "oc_source_channel", "oc_stated_by", "oc_subject_id"] }); for (const p of r.points) out.push({ id: p.id, ...p.payload }); off = r.next_page_offset; } while (off);
  out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))); return out;
});

// ---------- Claude 用量（只读 CLI 凭据，绝不刷新/写入/输出令牌） ----------
const CLAUDE_CRED = process.env.CLAUDE_CREDENTIALS || "/home/ubuntu/.claude/.credentials.json";
const clampP = n => Math.max(0, Math.min(100, Number(n)));
const tsOf = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; };
function claudeWin(w, label, reset = true) { if (!w || typeof w !== "object" || !Number.isFinite(Number(w.utilization)) || w.utilization === null) return null; return { label, usedPercent: clampP(w.utilization), ...(reset && w.resets_at ? { resetAt: tsOf(w.resets_at) } : {}) }; }
const claudeUsage = () => cached("claude", 120e3, async () => {
  const base = { provider: "anthropic", displayName: "Claude" };
  const na = why => ({ ...base, windows: [], error: why, summary: "暂不可用" });
  let o; try { o = JSON.parse(fs.readFileSync(CLAUDE_CRED, "utf8")).claudeAiOauth || {}; } catch { return na("读取 CLI 凭据失败"); }
  const tok = typeof o.accessToken === "string" ? o.accessToken : "";
  if (!tok) return na("CLI 未登录");
  if (o.expiresAt && +o.expiresAt < Date.now()) return na("令牌已过期，等待 Claude CLI 自行刷新");
  try {
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: "Bearer " + tok, "User-Agent": "hosino-console", Accept: "application/json", "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return na("Anthropic 返回 HTTP " + r.status);
    const u = await r.json();
    const windows = [claudeWin(u.five_hour, "5h"), claudeWin(u.seven_day, "Week"), claudeWin(u.seven_day_sonnet, "Sonnet") || claudeWin(u.seven_day_opus, "Opus")].filter(Boolean);
    const plan = o.subscriptionType ? o.subscriptionType[0].toUpperCase() + o.subscriptionType.slice(1) : undefined;
    const ex = u.extra_usage;
    const billing = ex?.is_enabled && Number.isFinite(ex.used_credits) && Number.isFinite(ex.monthly_limit) ? [{ type: "budget", used: ex.used_credits / 100, limit: ex.monthly_limit / 100, unit: (ex.currency || "USD").toUpperCase(), period: "month" }] : undefined;
    const summary = windows.map(w => `${w.label} ${Math.round(w.usedPercent)}%`).join(" · ") || "暂无额度窗口";
    return { ...base, windows, ...(plan ? { plan } : {}), ...(billing ? { billing } : {}), summary };
  } catch (e) { return na(e?.name === "TimeoutError" ? "请求超时" : "网络错误"); }
});

// ---------- 小米 MiMo Token Plan 用量（控制台 Cookie，非公开接口；绝不输出/记录 Cookie，不用 tp- Key） ----------
const MIMO_BASE = "https://platform.xiaomimimo.com/api/v1";
const mimoNum = v => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
const mimoTs = v => { if (v == null || v === "") return undefined; const n = Number(v); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n; const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; };
const MIMO_LABEL = { plan_total_token: "套餐总额度", month_total_token: "本月额度" };
const mimoUsage = () => cached("mimo", 10 * 60e3, async () => {
  const na = why => ({ windows: [], error: why, summary: "暂不可用（Cookie 过期，请重新粘贴）" });
  const ck = (process.env.MIMO_COOKIE || "").trim().replace(/^cookie:\s*/i, "");
  if (!ck || !/api-platform_serviceToken=/.test(ck)) return na("未配置 MiMo Cookie");
  const get = async p => { const r = await fetch(MIMO_BASE + p, { headers: { Cookie: ck, Accept: "application/json", "Accept-Language": "zh-CN", "User-Agent": "hosino-console" }, signal: AbortSignal.timeout(10000), redirect: "manual" }); if (!r.ok) return { _status: r.status }; try { return await r.json(); } catch { return { _status: "非 JSON" }; } };
  try {
    const [u, d] = await Promise.all([get("/tokenPlan/usage"), get("/tokenPlan/detail").catch(() => null)]);
    if (u._status || (u.code != null && u.code !== 0)) return na(u._status ? "MiMo 返回 " + u._status : "MiMo 错误码 " + u.code);
    const usage = u.data?.usage || u.data?.monthUsage || {};
    const dd = d && !d._status && (d.code == null || d.code === 0) ? (d.data || {}) : {};
    const resetAt = mimoTs(typeof dd.currentPeriodEnd === "string" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(dd.currentPeriodEnd) ? dd.currentPeriodEnd.replace(" ", "T") + "+08:00" : dd.currentPeriodEnd) ?? mimoTs(dd.periodEndTime ?? dd.periodEnd ?? dd.expireTime ?? dd.expiredTime ?? dd.endTime ?? dd.expireAt);
    const plan = dd.planName || dd.planCode || dd.plan || undefined;
    const windows = []; const parts = [];
    for (const it of Array.isArray(usage.items) ? usage.items : []) {
      const used = mimoNum(it.used), limit = mimoNum(it.limit); if (!limit) continue;
      const label = MIMO_LABEL[it.name] || it.name || "额度";
      windows.push({ label, usedPercent: clampP(100 * used / limit), used, limit, ...(resetAt ? { resetAt } : {}) });
      parts.push(`${label} ${(used / 1e8).toFixed(2)} / ${(limit / 1e8).toFixed(2)} 亿 Credits`);
    }
    if (!windows.length) return { windows: [], summary: "MiMo 未返回额度数据", ...(plan ? { plan } : {}) };
    return { windows, ...(plan ? { plan: String(plan) } : {}), summary: parts.join(" · ") };
  } catch (e) { return na(e?.name === "TimeoutError" ? "请求超时" : "网络错误"); }
});

// ---------- v2：写操作审计 / 确认 ----------
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OPSLOG = path.join(ROOT, "logs", "ops.log"), BACKUPS = path.join(ROOT, "backups");
const httpErr = (code, msg) => Object.assign(new Error(msg), { http: code });
const need = (b, ...ks) => { for (const k of ks) if (b?.[k] == null || b[k] === "") throw httpErr(400, "缺少参数：" + k); };
const confirmOk = b => { if (b?.confirm !== true) throw httpErr(400, "需要 confirm:true 确认"); };
function opLog(req, ep, target, ok, err) {
  try { fs.mkdirSync(path.dirname(OPSLOG), { recursive: true, mode: 0o700 }); const line = JSON.stringify({ t: new Date().toISOString(), ip: req ? ipOf(req) : "", ep, target: String(target ?? "").slice(0, 200), ok, ...(err ? { err: String(err).slice(0, 300) } : {}) }) + "\n"; fs.appendFileSync(OPSLOG, line, { mode: 0o600 }); fs.chmodSync(OPSLOG, 0o600); } catch {}
}
const dropCache = (...pre) => { for (const k of [...cache.keys()]) if (pre.some(p => k.startsWith(p))) cache.delete(k); };
// 包装写操作：确认、审计、清缓存
const W = (ep, target, fn, { confirm = false, drop = [] } = {}) => async (u, b, req) => {
  b = b || {}; const tg = typeof target === "function" ? target(b) : target;
  try { if (confirm) confirmOk(b); const r = await fn(b, u, req); dropCache(...drop); opLog(req, ep, tg, true); return r ?? { ok: true }; }
  catch (e) { opLog(req, ep, tg, false, e.message); throw e; }
};
const qi = (u, k, d, max) => { const v = parseInt(u.searchParams.get(k)); return Number.isFinite(v) && v > 0 ? Math.min(max || v, v) : d; };

// ---------- v2.1：媒体预览 / QQ 直发 ----------
const MEDIA_ROOT = process.env.MEDIA_ROOT || "/home/ubuntu/.openclaw/media";
const MEDIA_HOSTS = new Set((process.env.MEDIA_HOSTS || "qqbot.ugcimg.cn").split(",").map(x => x.trim()).filter(Boolean));
const MEDIA_MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".amr": "audio/amr", ".silk": "application/octet-stream", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".json": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".zip": "application/zip" };
const inlineOk = ct => /^(image\/(jpeg|png|gif|webp|bmp)|audio\/|video\/)/.test(ct);
let mediaRootReal = null;
function mediaHeaders(ct, name, len) { const inl = inlineOk(ct); return { "content-type": inl ? ct : (ct.startsWith("text/plain") ? ct : "application/octet-stream"), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "content-disposition": `${inl ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`, ...(len != null ? { "content-length": String(len) } : {}) }; }
async function serveMedia(req, res, u) {
  const p = u.searchParams.get("path"), url = u.searchParams.get("url");
  if (p) {
    if (!path.isAbsolute(p) || p.includes("\0")) return send(res, 400, { error: "path 必须是绝对路径" });
    try { mediaRootReal ??= fs.realpathSync(MEDIA_ROOT); } catch { return send(res, 404, { error: "媒体目录不存在" }); }
    let real; try { real = fs.realpathSync(p); } catch { return send(res, 404, { error: "文件不存在" }); }
    if (!real.startsWith(mediaRootReal + path.sep)) return send(res, 403, { error: "只允许访问网关媒体目录" });
    const st = fs.statSync(real); if (!st.isFile()) return send(res, 404, { error: "不是文件" });
    const ct = MEDIA_MIME[path.extname(real).toLowerCase()] || "application/octet-stream";
    const h = mediaHeaders(ct, path.basename(real)); h["accept-ranges"] = "bytes";
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      let a = m[1] ? +m[1] : st.size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (a < 0) a = 0; if (a > b || a >= st.size) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, "content-range": `bytes ${a}-${b}/${st.size}`, "content-length": String(b - a + 1) }); return fs.createReadStream(real, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...h, "content-length": String(st.size) }); return fs.createReadStream(real).pipe(res);
  }
  if (url) {
    let t; try { t = new URL(url); } catch { return send(res, 400, { error: "url 无效" }); }
    if (!/^https?:$/.test(t.protocol) || !MEDIA_HOSTS.has(t.hostname) || t.port || t.username) return send(res, 403, { error: "该域名不在允许列表" });
    const r = await fetch(t, { redirect: "error", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r || !r.ok) return send(res, 502, { error: "远程获取失败" });
    let ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!inlineOk(ct)) ct = "application/octet-stream";
    const len = +r.headers.get("content-length"); if (len > 20e6) return send(res, 413, { error: "文件过大" });
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 20e6) return send(res, 413, { error: "文件过大" });
    res.writeHead(200, mediaHeaders(ct, path.basename(t.pathname) || "media", buf.length)); return res.end(buf);
  }
  return send(res, 400, { error: "需要 path 或 url" });
}
const QQ_SEND = () => /^(1|true|on|yes)$/i.test(process.env.QQ_SEND_ENABLED || "");

// ---------- v2.2：会话别名（控制台自有文件，不写网关） ----------
const ALIASES = path.join(ROOT, "data", "aliases.json");
const ALIAS_DEFAULT = { "4330bbc52465d583f003c0a68650df70": "凛", "249bdb147ae23facce0f2d0bafd1579b": "春", "7fe244b1202cd602dda2c06b29c62f50": "离" };
let aliasMem = null;
function loadAliases() { if (aliasMem) return aliasMem; try { aliasMem = JSON.parse(fs.readFileSync(ALIASES, "utf8")); } catch { aliasMem = { ...ALIAS_DEFAULT }; saveAliases(aliasMem); } return aliasMem; }
function saveAliases(a) {
  fs.mkdirSync(path.dirname(ALIASES), { recursive: true, mode: 0o700 });
  try { if (fs.existsSync(ALIASES)) fs.copyFileSync(ALIASES, ALIASES + ".bak"); fs.chmodSync(ALIASES + ".bak", 0o600); } catch {}
  const tmp = ALIASES + ".tmp-" + process.pid; fs.writeFileSync(tmp, JSON.stringify(a, null, 1), { mode: 0o600 }); fs.renameSync(tmp, ALIASES); fs.chmodSync(ALIASES, 0o600); aliasMem = a;
}
const qqIdOf = k => { const m = /([0-9a-f]{32})$/i.exec(String(k || "")); return m ? m[1].toLowerCase() : null; };
function aliasFor(key) { const a = loadAliases(); return a[key] || (qqIdOf(key) && a[qqIdOf(key)]) || null; }
const normAliasKey = k => { k = String(k || "").trim(); return /^[0-9a-f]{32}$/i.test(k) ? k.toLowerCase() : k; };

// ---------- v2.4：控制台自有 JSON 存储（data/*.json，600，原子写 + .bak） ----------
const DATA = path.join(ROOT, "data");
function jsonStore(file, init) {
  const f = path.join(DATA, file); let mem = null;
  const save = v => {
    fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
    try { if (fs.existsSync(f)) { fs.copyFileSync(f, f + ".bak"); fs.chmodSync(f + ".bak", 0o600); } } catch {}
    const tmp = f + ".tmp-" + process.pid; fs.writeFileSync(tmp, JSON.stringify(v, null, 1), { mode: 0o600 }); fs.renameSync(tmp, f); fs.chmodSync(f, 0o600); mem = v;
  };
  const load = () => { if (mem) return mem; try { mem = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw httpErr(500, file + " 读取失败"); mem = init(); } return mem; };
  return { load, save, file: f };
}
const isOpenId = s => /^[0-9a-f]{32}$/i.test(String(s || ""));
// 发言人：网关 senderName 优先；缺名字用别名（32 位十六进制 openid，大小写不敏感）；记住每个 openid 最近一次的网关名字
const seenNames = new Map();
function senderOf(o) {
  const id = o.senderId ? String(o.senderId) : null; if (!id) return null;
  const name = typeof o.senderName === "string" && o.senderName.trim() ? o.senderName.trim() : null;
  if (name && isOpenId(id)) seenNames.set(id.toLowerCase(), name);
  if (name) return { id, name, source: "gateway" };
  const al = isOpenId(id) ? loadAliases()[id.toLowerCase()] : null;
  if (al) return { id, name: al, source: "alias" };
  return { id, name: null, source: null };
}
const profiles = jsonStore("profiles.json", () => ({}));
const groups = jsonStore("groups.json", () => ({ groups: [] }));
function groupOf(key) { for (const g of groups.load().groups) if (g.sessionKeys.includes(key)) return g.id; return null; }
const strLen = v => [...String(v ?? "")].length;

// ---------- 路由 ----------
const R = {



  // ===== v2.4 个人档案 / 搜索 / 分组 =====
  "GET /api/profiles": async () => { const p = profiles.load(); return { profiles: Object.entries(p).map(([id, v]) => ({ id, ...v, alias: loadAliases()[id] || null, lastSeenName: seenNames.get(id) || null })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) }; },
  "GET /api/profiles/:id": async (u, id) => { if (!isOpenId(id)) throw httpErr(400, "id 应为 32 位十六进制 QQ openid"); id = id.toLowerCase(); const p = profiles.load()[id]; return { id, profile: p || null, alias: loadAliases()[id] || null, lastSeenName: seenNames.get(id) || null }; },
  "POST /api/profiles/set": W("profiles.set", b => `${String(b.id || "").slice(0, 40)} name=${strLen(b.name)} note=${strLen(b.note)}`, async b => {
    need(b, "id"); if (!isOpenId(b.id)) throw httpErr(400, "id 应为 32 位十六进制 QQ openid");
    if (b.name != null && typeof b.name !== "string" || b.note != null && typeof b.note !== "string") throw httpErr(400, "name/note 必须是字符串");
    const id = b.id.toLowerCase(), name = String(b.name ?? "").trim(), note = String(b.note ?? "").trim();
    if (strLen(name) > 40) throw httpErr(400, "名字最多 40 个字"); if (note.length > 4000) throw httpErr(400, "备注最多 4000 字符");
    const p = { ...profiles.load() };
    if (!name && !note) { const existed = id in p; delete p[id]; profiles.save(p); return { ok: true, id, deleted: existed }; }
    p[id] = { name: name || null, note, updatedAt: Date.now() }; profiles.save(p); return { ok: true, id, profile: p[id] };
  }),
  "GET /api/search": async u => {
    const q = (u.searchParams.get("q") || "").trim(); if (!q) throw httpErr(400, "缺少参数：q"); if (q.length > 4096) throw httpErr(400, "q 过长（≤4096）");
    const limit = Math.min(25, qi(u, "limit", 10, 25)); const sk = u.searchParams.get("sessionKey");
    const p = { query: q, limit }; if (sk) { if (sk.length > 300) throw httpErr(400, "sessionKey 过长"); p.sessionKeys = [sk]; }
    const r = await call("sessions.search", p, 20000);
    return { truncated: !!r.truncated, results: (r.results || []).map(x => { const alias = aliasFor(x.sessionKey); return { ...x, alias, displayName: alias || qqIdOf(x.sessionKey) || x.sessionKey, groupId: groupOf(x.sessionKey) }; }) };
  },
  "GET /api/groups": async () => ({ groups: [...groups.load().groups].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt) }),
  "POST /api/groups/set": W("groups.set", b => `${b.id || "new"} name=${strLen(b.name)} keys=${Array.isArray(b.sessionKeys) ? b.sessionKeys.length : "?"}`, async b => {
    if (typeof b.name !== "string" || !b.name.trim()) throw httpErr(400, "缺少参数：name"); const name = b.name.trim(); if (strLen(name) > 40) throw httpErr(400, "分组名最多 40 个字");
    if (!Array.isArray(b.sessionKeys) || b.sessionKeys.length > 500 || b.sessionKeys.some(k => typeof k !== "string" || !k || k.length > 300)) throw httpErr(400, "sessionKeys 应为字符串数组（≤500 项）");
    if (b.order != null && !Number.isInteger(b.order)) throw httpErr(400, "order 应为整数");
    if (b.id != null && !/^g_[0-9a-f]{8}$/.test(b.id)) throw httpErr(400, "id 格式不对");
    const keys = [...new Set(b.sessionKeys)]; const st = groups.load(); const all = st.groups.map(g => ({ ...g, sessionKeys: g.sessionKeys.filter(k => !keys.includes(k) || g.id === b.id) }));
    let g = b.id ? all.find(x => x.id === b.id) : null; if (b.id && !g) throw httpErr(404, "分组不存在");
    if (!g) { if (all.length >= 50) throw httpErr(400, "分组最多 50 个"); g = { id: "g_" + crypto.randomBytes(4).toString("hex"), createdAt: Date.now(), order: all.length ? Math.max(...all.map(x => x.order)) + 1 : 0 }; all.push(g); }
    Object.assign(g, { name, sessionKeys: keys, updatedAt: Date.now() }); if (b.order != null) g.order = b.order;
    groups.save({ ...st, groups: all }); return { ok: true, group: g };
  }),
  "POST /api/groups/delete": W("groups.delete", b => String(b.id || "").slice(0, 20), async b => {
    need(b, "id"); const st = groups.load(); if (!st.groups.some(g => g.id === b.id)) throw httpErr(404, "分组不存在");
    groups.save({ ...st, groups: st.groups.filter(g => g.id !== b.id) }); return { ok: true, id: b.id };
  }, { confirm: true }),
  // ===== v2.2 别名 =====
  "GET /api/aliases": async () => ({ aliases: loadAliases() }),
  "POST /api/aliases/set": W("aliases.set", b => `${b.key} len=${String(b.alias || "").length}`, async b => {
    need(b, "key"); const key = normAliasKey(b.key); if (key.length > 200) throw httpErr(400, "key 过长");
    const alias = String(b.alias ?? "").trim(); if ([...alias].length > 40) throw httpErr(400, "别名最多 40 个字");
    const a = { ...loadAliases() }; if (alias) a[key] = alias; else delete a[key]; saveAliases(a); return { ok: true, key, alias: alias || null };
  }),
  // ===== v2.1 =====
  "GET /api/features": async () => ({ qqSend: QQ_SEND(), mediaProxy: true, mediaRemoteHosts: [...MEDIA_HOSTS] }),
  "POST /api/qq/send": async (u, b, req) => {
    b = b || {}; if (b.attachments != null && !(Array.isArray(b.attachments) && !b.attachments.length)) throw Object.assign(httpErr(400, "QQ 直发不支持附件"), { code: "attachments_unsupported" }); const text = typeof b.text === "string" ? b.text : ""; let tg = b.target || b.sessionKey || "";
    try {
      if (!QQ_SEND()) throw httpErr(403, "QQ 直发功能未开启");
      confirmOk(b);
      if (!text.trim()) throw httpErr(400, "缺少参数：text"); if (text.length > 4000) throw httpErr(400, "内容过长（≤4000 字）");
      let to = null, accountId = "default", sessionKey;
      if (b.sessionKey) {
        const r = await call("sessions.list", { limit: 500 }); const s = (r.sessions || []).find(x => x.key === b.sessionKey);
        if (!s) throw httpErr(400, "会话不存在");
        const dc = s.deliveryContext || {}; if ((dc.channel || s.channel) !== "qqbot" || !dc.to) throw httpErr(400, "该会话不是 QQ 会话或没有投递目标");
        to = dc.to; accountId = dc.accountId || "default"; sessionKey = s.key;
      } else if (b.target) {
        if (!/^qqbot:(group|c2c|user|channel|dm):[A-Za-z0-9_-]{6,80}$/.test(b.target)) throw httpErr(400, "target 格式应为 qqbot:group:<ID> 等");
        to = b.target;
      } else throw httpErr(400, "需要 sessionKey 或 target");
      tg = to;
      const r = await call("send", { to, channel: "qqbot", accountId, message: text, ...(sessionKey ? { sessionKey } : {}), idempotencyKey: crypto.randomUUID() }, 30000);
      dropCache("ss:"); opLog(req, "qq.send", `${to} len=${text.length}`, true); return r;
    } catch (e) { opLog(req, "qq.send", `${tg} len=${text.length}`, false, e.message); throw e; }
  },
  // ===== v2 批次二：7 技能详情 / 8 QQ 配对 / 9 工具·MCP·Hooks / 10 审计·诊断 / 11 Agent 文件 =====
  "GET /api/skills/detail": async u => { const slug = u.searchParams.get("slug"); need({ slug }, "slug"); return cached("skd:" + slug, 600e3, () => call("skills.detail", { slug }, 20000)); },
  "GET /api/pairing": async () => call("channels.pairing.list", {}),
  "POST /api/pairing/approve": W("channels.pairing.approve", b => `${b.channel}/${b.accountId}/${b.requestId}`, async b => { need(b, "channel", "accountId", "requestId"); return call("channels.pairing.approve", { channel: b.channel, accountId: b.accountId, requestId: b.requestId, notify: false }); }),
  "POST /api/pairing/dismiss": W("channels.pairing.dismiss", b => `${b.channel}/${b.accountId}/${b.requestId}`, async b => { need(b, "channel", "accountId", "requestId"); return call("channels.pairing.dismiss", { channel: b.channel, accountId: b.accountId, requestId: b.requestId }); }),
  "GET /api/tools": async u => { const key = u.searchParams.get("key") || "agent:main:main"; return cached("tools:" + key, 60e3, () => call("tools.effective", { sessionKey: key }, 20000)); },
  "GET /api/mcp/tools": async u => { const sessionKey = u.searchParams.get("key"), viewId = u.searchParams.get("viewId"); need({ sessionKey, viewId }, "sessionKey", "viewId"); return call("mcp.app.listTools", { sessionKey, viewId }, 20000); },
  "GET /api/mcp/resources": async u => { const sessionKey = u.searchParams.get("key"), viewId = u.searchParams.get("viewId"); need({ sessionKey, viewId }, "sessionKey", "viewId"); return call("mcp.app.listResources", { sessionKey, viewId }, 20000); },
  "GET /api/hooks": async () => cached("hooks", 60e3, () => call("hooks.status", {}).then(redact)),
  "GET /api/audit": async u => { const p = { limit: qi(u, "limit", 50, 500) }; for (const k of ["cursor", "kind", "status", "sessionKey", "runId"]) if (u.searchParams.get(k)) p[k] = u.searchParams.get(k); return call("audit.list", p, 20000); },
  "GET /api/audit/activity": async u => { const p = { limit: qi(u, "limit", 50, 500) }; if (u.searchParams.get("cursor")) p.cursor = u.searchParams.get("cursor"); return call("audit.activity.list", p, 20000); },
  "GET /api/diagnostics/stability": async () => cached("diag:st", 8000, () => call("diagnostics.stability", {})),
  "GET /api/diagnostics/lanes": async () => cached("diag:ln", 8000, () => call("diagnostics.lanes", {})),
  "GET /api/agent-files": async u => call("agents.files.list", { agentId: u.searchParams.get("agentId") || "main" }),
  "GET /api/agent-files/get": async u => { const name = u.searchParams.get("name"); need({ name }, "name"); return call("agents.files.get", { agentId: u.searchParams.get("agentId") || "main", name }); },
  "POST /api/agent-files/set": W("agents.files.set", b => `${b.agentId || "main"}/${b.name}`, async b => {
    need(b, "name"); if (typeof b.content !== "string") throw httpErr(400, "缺少参数：content"); if (b.content.length > 1e6) throw httpErr(400, "内容过大");
    const agentId = b.agentId || "main";
    const cur = await call("agents.files.get", { agentId, name: b.name });
    const f = cur.file || {};
    let backup = null;
    if (!f.missing) {
      if (typeof f.content !== "string") throw httpErr(502, "读取旧内容失败，未写入");
      fs.mkdirSync(BACKUPS, { recursive: true, mode: 0o700 });
      const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");
      backup = path.join(BACKUPS, `${agentId}__${path.basename(b.name).replace(/[^\w.-]/g, "_")}__${ts}`);
      fs.writeFileSync(backup, f.content, { mode: 0o600, flag: "wx" });
    }
    const p = { agentId, name: b.name, content: b.content, ...(f.missing ? { expectedMissing: true } : f.hash ? { expectedHash: f.hash } : {}) };
    const r = await call("agents.files.set", p, 20000);
    return { ok: true, file: r.file ? { ...r.file, content: undefined } : undefined, backup };
  }, { confirm: true }),
  // ===== v2 批次一：1 cron / 2 会话 / 3 审批 / 4 费用 / 5 模型认证 =====
  "GET /api/cron/status": async () => cached("cron:status", 15e3, () => call("cron.status")),
  "GET /api/cron/get": async u => { need({ id: u.searchParams.get("id") }, "id"); return redact(await call("cron.get", { id: u.searchParams.get("id") })); },
  "GET /api/cron/runs": async u => { const p = { scope: u.searchParams.get("id") ? "job" : "all", limit: qi(u, "limit", 20, 200), offset: +u.searchParams.get("offset") || 0 }; if (u.searchParams.get("id")) p.id = u.searchParams.get("id"); const st = u.searchParams.get("status"); if (st) p.status = st; return redact(await call("cron.runs", p)); },
  "GET /api/cron/history": async u => { const id = u.searchParams.get("id"), runId = u.searchParams.get("runId"), runAtMs = +u.searchParams.get("runAtMs"); need({ id }, "id"); if (!runId && !runAtMs) throw httpErr(400, "需要 runId 或 runAtMs"); return call("cron.history", { id, ...(runId ? { runId } : { runAtMs }), limit: qi(u, "limit", 100, 200) }, 20000); },
  "POST /api/cron/add": W("cron.add", b => b.name, async b => { need(b, "name", "schedule", "sessionTarget", "wakeMode", "payload"); const p = {}; for (const k of ["name", "displayName", "description", "enabled", "schedule", "sessionTarget", "wakeMode", "payload", "delivery", "agentId", "deleteAfterRun"]) if (k in b) p[k] = b[k]; if (!p.delivery) p.delivery = { mode: "none" }; return call("cron.add", p); }, { drop: ["cron"] }),
  "POST /api/cron/update": W("cron.update", b => b.id, async b => { need(b, "id", "patch"); return call("cron.update", { id: b.id, patch: b.patch }); }, { drop: ["cron"] }),
  "POST /api/cron/remove": W("cron.remove", b => b.id, async b => { need(b, "id"); return call("cron.remove", { id: b.id }); }, { confirm: true, drop: ["cron"] }),
  "POST /api/cron/run": W("cron.run", b => b.id, async b => { need(b, "id"); return call("cron.run", { id: b.id, mode: ["force", "if-enabled", "due"].includes(b.mode) ? b.mode : "force" }, 30000); }, { drop: ["cron"] }),
  "POST /api/sessions/create": W("sessions.create", b => b.label || b.displayName || "", async b => { const p = {}; for (const k of ["label", "displayName", "model", "agentRuntime", "thinkingLevel", "agentId"]) if (b[k]) p[k] = b[k]; return call("sessions.create", p); }, { drop: ["ss:"] }),
  "POST /api/sessions/reset": W("sessions.reset", b => b.key, async b => { need(b, "key"); return call("sessions.reset", { key: b.key, reason: b.reason === "new" ? "new" : "reset" }, 30000); }, { confirm: true, drop: ["ss:"] }),
  "POST /api/sessions/compact": W("sessions.compact", b => b.key, async b => { need(b, "key"); const p = { key: b.key }; if (Number.isInteger(b.maxLines) && b.maxLines > 0) p.maxLines = b.maxLines; return call("sessions.compact", p, 120000); }, { drop: ["ss:"] }),
  "POST /api/sessions/delete": W("sessions.delete", b => b.key, async b => { need(b, "key"); return call("sessions.delete", { key: b.key, deleteTranscript: b.deleteTranscript === true }, 30000); }, { confirm: true, drop: ["ss:"] }),
  "GET /api/approvals": async () => { const [pending, g] = await Promise.all([call("exec.approval.list"), call("exec.approval.grants.list", { limit: 500 })]); return { pending: redact(pending || []), grants: g?.grants || [] }; },
  "POST /api/approvals/resolve": W("exec.approval.resolve", b => `${b.id} ${b.decision}`, async b => { need(b, "id", "decision"); if (!["allow-once", "allow-always", "deny"].includes(b.decision)) throw httpErr(400, "decision 只能是 allow-once / allow-always / deny"); const p = { id: b.id, decision: b.decision }; if (Number.isInteger(b.grantExpiresInDays)) p.grantExpiresInDays = b.grantExpiresInDays; return call("exec.approval.resolve", p); }),
  "POST /api/approvals/revoke-grant": W("exec.approval.grants.revoke", b => b.grantId, async b => { need(b, "grantId"); return call("exec.approval.grants.revoke", { grantId: b.grantId }); }, { confirm: true }),
  "GET /api/usage/cost": async u => { const sd = u.searchParams.get("startDate"), ed = u.searchParams.get("endDate"); const p = sd && ed ? { startDate: sd, endDate: ed } : { days: qi(u, "days", 30, 366) }; return cached("cost:" + JSON.stringify(p), 120e3, () => call("usage.cost", p, 30000)); },
  "GET /api/models/auth": async () => cached("mauth", 60e3, () => call("models.authStatus", {}, 20000).then(redact)),
  "POST /api/models/probe": W("models.probe", b => `${b.provider}${b.profileId ? "/" + b.profileId : ""}`, async b => { need(b, "provider"); const p = { provider: b.provider }; if (b.profileId) p.profileId = b.profileId; p.timeoutMs = Number.isInteger(b.timeoutMs) ? Math.min(30000, b.timeoutMs) : 20000; return redact(await call("models.probe", p, 45000)); }, { drop: ["mauth"] }),
  "GET /api/ops-log": async u => { let t = ""; try { t = fs.readFileSync(OPSLOG, "utf8"); } catch {} const lines = t.trim().split("\n").filter(Boolean).slice(-qi(u, "limit", 200, 2000)).reverse().map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }); return { lines }; },

  "GET /api/overview": async () => cached("ov", 8000, async () => {
    const [info, health, status] = await Promise.all([call("system.info"), call("health"), call("status")]);
    sysPid = info.pid;
    return { info: { ...info, env: undefined }, health: redact(health), status: redact(status), host: { cpu: cpuPct(), load: fs.readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).map(Number), mem: mem(), disk: disk(), uptime: +fs.readFileSync("/proc/uptime", "utf8").split(" ")[0] }, gw: await gwUnit(), server: gwHello?.server };
  }),
  "GET /api/sessions": async u => { const r = await R["__sessionsRaw"](u); const q = (u.searchParams.get("q") || "").trim().toLowerCase(); const ss = r.sessions.map(x => { const alias = aliasFor(x.key); return { ...x, alias, groupId: groupOf(x.key), gatewayDisplayName: x.displayName, displayName: alias || qqIdOf(x.key) || x.displayName || x.key }; }); return { ...r, sessions: q ? ss.filter(x => [x.alias, x.displayName, x.label, x.key].some(v => String(v || "").toLowerCase().includes(q))) : ss }; },
  "__sessionsRaw": async u => cached("ss:" + u.searchParams.get("offset"), 4000, async () => {
    const r = await call("sessions.list", { limit: 200, offset: +u.searchParams.get("offset") || 0 });
    return { totalCount: r.totalCount, defaults: r.defaults, sessions: r.sessions.map(s => ({ key: s.key, displayName: s.displayName, label: s.label, kind: s.kind, chatType: s.chatType, channel: s.channel, updatedAt: s.updatedAt, pinned: s.pinned, unread: s.unread, archived: s.archived, status: s.status, hasActiveRun: s.hasActiveRun, model: s.model, modelProvider: s.modelProvider, modelOverrideSource: s.modelOverrideSource, agentRuntime: s.agentRuntime?.id, thinkingLevel: s.thinkingLevel, thinkingDefault: s.thinkingDefault, thinkingOptions: s.thinkingOptions, totalTokens: s.totalTokens, contextTokens: s.contextTokens, participantCount: s.participantCount, isMain: s.isMain, sessionId: s.sessionId, runtimeMs: s.runtimeMs })) };
  }),
  "GET /api/history": async u => {
    const key = u.searchParams.get("key"); need({ key }, "key"); const limit = qi(u, "limit", 60, 200); const bf = u.searchParams.get("before");
    // 网关 chat.history 实测会忽略 limit/offset、不返回游标（见 API.md v2.4），故一次取最多 1000 条后在本地切片
    const raw = await cached("hist:" + key, 3000, () => call("chat.history", { sessionKey: key, limit: 1000 }, 20000));
    let sess = null; try { sess = (await cached("hist-sess", 30e3, () => call("sessions.list", { limit: 500 }))).sessions?.find(x => x.key === key); } catch {}
    const h = buildHistory(raw, sess); const all = h.messages; let end = all.length;
    if (bf != null && bf !== "") { const ix = all.findIndex(m => m.id === bf); if (ix >= 0) end = ix; else if (/^\d+$/.test(bf)) end = Math.min(all.length, +bf); else throw httpErr(400, "before 无效（消息 id 或序号）"); }
    const start = Math.max(0, end - limit); const page = chatAttIdx.merge(key, all.slice(start, end).map((m, k) => ({ ...m, index: start + k })));
    return { ...h, messages: page, windowCount: all.length, gatewayHasMore: !!raw.hasMore, hasMore: start > 0 || !!raw.hasMore, nextBefore: start > 0 ? (all[start].id ?? String(start)) : null };
  },
  "POST /api/send": async (u, b, req) => {
    const ups = upResolve(b.attachments, "chat"); if (!b.key || (!b.message?.trim() && !ups.length)) throw httpErr(400, "缺少会话或内容");
    if (ups.some(m => m.session !== b.key)) throw httpErr(403, "附件是为别的会话上传的");
    const atts = ups.length ? chatAttachments(ups) : undefined; cache.clear();
    const idem = crypto.randomUUID();
    const r = await call("chat.send", { sessionKey: b.key, message: b.message || "", deliver: !!b.deliver, idempotencyKey: idem, ...(atts ? { attachments: atts } : {}) }, ups.length ? 120000 : 30000);
    if (ups.length) { opLog(req, "chat.send.attachments", `${b.key} ${ups.map(m => m.id).join(",")}`, true); upMarkAttached(ups); chatAttIdx.add({ key: b.key, ts: Date.now(), idem, runId: r?.runId || null, text: String(b.message || ""), ids: ups.map(m => m.id) }); }
    return ups.length ? { ...r, attachments: ups.map(upPub) } : r;
  },
  "POST /api/abort": async (u, b) => call("chat.abort", { sessionKey: b.key }),
  "POST /api/patch": async (u, b) => { const p = { key: b.key }; for (const k of ["model", "agentRuntime", "thinkingLevel", "label", "pinned", "fastMode"]) if (k in b) p[k] = b[k]; cache.clear(); return call("sessions.patch", p); },
  "GET /api/models": async () => cached("models", 60e3, async () => { const r = await call("models.list"); return { models: r.models.map(m => ({ id: m.id, name: m.name, alias: m.alias, provider: m.provider, contextWindow: m.contextWindow, reasoning: m.reasoning, tags: m.tags, available: m.available, runtime: m.agentRuntime?.id, thinkingDefault: m.thinkingDefault })) }; }),
  "GET /api/usage": async () => cached("usage", 120e3, async () => { const [u, c, mi] = await Promise.all([call("usage.status").then(redact), claudeUsage(), mimoUsage()]); const providers = (u.providers || []).filter(p => p.provider !== "anthropic"); providers.push(c); const xi = providers.findIndex(p => p.provider === "xiaomi-token-plan"); if (xi >= 0) providers[xi] = { ...providers[xi], ...mi }; else providers.push({ provider: "xiaomi-token-plan", displayName: "Xiaomi MiMo Token Plan", ...mi }); return { ...u, providers }; }),
  "GET /api/vpn": async () => vpnStatus(),
  "GET /api/link": async () => vpnStatus(), // 线路状态（与旧接口同一份数据）
  "GET /api/channels": async () => cached("ch", 8000, () => call("channels.status").then(redact)),
  "GET /api/plugins": async () => cached("pl", 60e3, async () => { const r = await call("plugins.list"); return { plugins: r.plugins.filter(p => p.installed || p.enabled).map(p => ({ id: p.id, name: p.name, description: p.description, version: p.version, origin: p.origin, enabled: p.enabled, state: p.state, runtime: p.runtime?.state })) }; }),
  "GET /api/skills": async () => cached("sk", 60e3, () => call("skills.status").then(redact)),
  "GET /api/cron": async () => cached("cron", 15e3, () => call("cron.list").then(redact)),
  "GET /api/logs": async u => { const r = await call("logs.tail", { limit: Math.min(500, +u.searchParams.get("limit") || 200) }, 20000); const LV = ["TRACE","DEBUG","INFO","WARN","ERROR","FATAL"]; const min = LV.indexOf(String(u.searchParams.get("level") || "").toUpperCase()); return { file: r.file, lines: (r.lines || []).map(l => { try { const j = JSON.parse(l); let sub = ""; try { sub = JSON.parse(j[0]).subsystem; } catch {} return { t: j.time || j._meta?.date, lv: j._meta?.logLevelName, sub, msg: String(j.message ?? j[1] ?? "").slice(0, 2000) }; } catch { return { msg: String(l).slice(0, 2000) }; } }).filter(x => min < 0 || (x.lv && LV.indexOf(String(x.lv).toUpperCase()) >= min)) }; },
  "GET /api/config": async () => cached("cfg", 30e3, async () => { const r = await call("config.get"); let c = r.config || r.parsed; if (!c && r.raw) try { c = JSON.parse(r.raw); } catch { c = null; } return { path: r.path, config: redact(c) }; }),
  "GET /api/memory": async u => {
    const all = await memAll(); const qs = (u.searchParams.get("q") || "").trim().toLowerCase(); const off = +u.searchParams.get("offset") || 0;
    const hit = qs ? all.filter(m => String(m.data || "").toLowerCase().includes(qs)) : all;
    const info = await cached("memcol", 60e3, () => q(`/collections/${MEMCOL}`));
    return { collection: MEMCOL, points: info.points_count, total: hit.length, items: hit.slice(off, off + 50) };
  },
};

// ---------- v2.6：每日群报 / 星野日记 / 互动统计 / 表情库 / 主动行为参数 ----------
// 全部不向 QQ 发送：不调用 chat.send / send / qq 相关写方法。生图与总结走本机 CLI `openclaw infer`（一次性推理，无会话、无投递）。
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || "/home/ubuntu/.openclaw/workspace";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/home/ubuntu/.npm-global/bin/openclaw";
const DIGEST_IMAGE_MODEL = process.env.DIGEST_IMAGE_MODEL || "openai/gpt-6-luna";
const DIGEST_TEXT_MODEL = process.env.DIGEST_TEXT_MODEL || ""; // 空 = 网关默认模型
const TZ = "Asia/Singapore";
const DIGEST_DIR = path.join(DATA, "digests");
const sgParts = (ms = Date.now()) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map(x => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` }; };
const sgDayOf = ms => sgParts(ms).day;
const atomicWrite = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); const tmp = f + ".tmp-" + process.pid; fs.writeFileSync(tmp, data, { mode: 0o600 }); fs.renameSync(tmp, f); fs.chmodSync(f, 0o600); };
const digestSettings = jsonStore("digest-settings.json", () => ({ enabled: true, time: "22:00", sessions: {}, lastRun: {} }));
const isHM = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const runCli = (args, t) => new Promise(r => execFile(OPENCLAW_BIN, args, { timeout: t, maxBuffer: 8 << 20, env: { ...process.env, NO_COLOR: "1" } }, (e, o, er) => r({ e: e ? String(er || e.message).trim().slice(-400) : null, o: o || "" })));
const lastJson = s => { const i = s.indexOf("{"); if (i < 0) return null; try { return JSON.parse(s.slice(i)); } catch { for (const l of s.trim().split("\n").reverse()) { try { return JSON.parse(l); } catch {} } return null; } };
const usageOf = j => { if (!j || typeof j !== "object") return null; const u = j.usage || j.result?.usage || j.meta?.usage || j.attempts?.find?.(a => a.usage)?.usage || null; const cost = j.cost ?? j.usage?.cost ?? j.meta?.cost ?? null; return u || cost != null ? { ...(u || {}), ...(cost != null ? { cost } : {}) } : null; };
const textOfJson = j => j?.outputs?.map?.(o => o?.text).filter(Boolean).join("\n") || j?.text || j?.output || j?.payloads?.map?.(p => p.text).filter(Boolean).join("\n") || j?.result?.text || null;
const digestRunning = new Set();
async function runDigest(key, day) {
  if (digestRunning.has(key + day)) throw httpErr(409, "该会话当天群报正在生成");
  digestRunning.add(key + day); const t0 = Date.now();
  const id = `${day}__${crypto.createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
  const rec = { id, sessionKey: key, name: aliasFor(key) || key, day, startedAt: t0, status: "running", messageCount: 0, text: null, image: null, usage: { text: null, image: null }, errors: [] };
  const save = () => atomicWrite(path.join(DIGEST_DIR, id + ".json"), JSON.stringify(rec, null, 1));
  try {
    const raw = await call("chat.history", { sessionKey: key, limit: 1000 }, 20000);
    const h = buildHistory(raw, null);
    const lines = [];
    for (const m of h.messages) {
      if (!m.ts || sgDayOf(m.ts) !== day) continue; const t = textOf(m).trim(); if (!t) continue;
      if (m.role === "user") lines.push(`[${sgParts(m.ts).hm}] ${m.sender?.name || aliasFor(m.senderId || "") || "群友"}: ${t.slice(0, 400)}`);
      else if (m.role === "assistant" && m.delivery === "sent" && m.model !== "delivery-mirror") lines.push(`[${sgParts(m.ts).hm}] 星野: ${t.slice(0, 400)}`);
    }
    rec.messageCount = lines.length;
    let notes = ""; try { for (const f of fs.readdirSync(path.join(WORKSPACE, "memory")).filter(f => f.startsWith(day) && f.endsWith(".md")).sort()) notes += fs.readFileSync(path.join(WORKSPACE, "memory", f), "utf8").slice(0, 3000) + "\n"; } catch {}
    rec.notesUsed = !!notes;
    if (!lines.length) { rec.status = "empty"; rec.text = "今天这个会话没有消息。"; return rec; }
    const chat = lines.join("\n").slice(-16000);
    const prompt = `你是群聊日报编辑。下面是 QQ 会话「${rec.name}」在 ${day}（${TZ}）的聊天记录${notes ? "和当天的记忆小结" : ""}。请用中文写一份简短有趣的“今日群报”：标题一行、3–6 条要点（谁聊了什么、有趣瞬间）、一句总结。不要编造记录里没有的内容，不要输出 QQ openid。最后单独一行以“画面：”开头，用一句话描述一张适合作为今日群报插图的可爱插画场景（不出现真实人名和文字）。\n\n【聊天记录】\n${chat}\n${notes ? "\n【记忆小结】\n" + notes.slice(0, 4000) : ""}`;
    const tr = await runCli(["infer", "model", "run", "--local", "--json", ...(DIGEST_TEXT_MODEL ? ["--model", DIGEST_TEXT_MODEL] : []), "--prompt", prompt], 180e3);
    if (tr.e) throw new Error("总结失败：" + tr.e);
    const tj = lastJson(tr.o); const text = (textOfJson(tj) || tr.o).trim(); rec.usage.text = usageOf(tj); rec.textModel = tj?.model || tj?.provider ? `${tj.provider || ""}/${tj.model || ""}` : null;
    const sm = /^画面[:：]\s*(.+)$/m.exec(text); rec.text = text.replace(/^画面[:：].*$/m, "").trim(); rec.imagePrompt = sm ? sm[1].trim().slice(0, 500) : `一只可爱的星野猫娘在群聊里和大家热闹聊天，${day} 夜晚，温暖插画风`;
    const out = path.join(DIGEST_DIR, id + ".png");
    const ir = await runCli(["infer", "image", "generate", "--model", DIGEST_IMAGE_MODEL, "--prompt", rec.imagePrompt + "。温暖可爱的日系插画风格，画面中不要出现文字。", "--size", "1024x1024", "--output", out, "--json"], 300e3);
    if (ir.e || !fs.existsSync(out)) rec.errors.push("生图失败：" + (ir.e || "未生成文件"));
    else { fs.chmodSync(out, 0o600); rec.image = path.basename(out); rec.usage.image = usageOf(lastJson(ir.o)); rec.imageModel = DIGEST_IMAGE_MODEL; }
    rec.status = rec.errors.length ? "partial" : "ok"; return rec;
  } catch (e) { rec.status = "error"; rec.errors.push(String(e.message || e).slice(0, 400)); return rec; }
  finally { rec.finishedAt = Date.now(); rec.durationMs = rec.finishedAt - t0; try { save(); } catch (e) { console.error("digest save", e.message); } digestRunning.delete(key + day); }
}
// 调度：每分钟检查；到点后对每个启用会话每天只跑一次（错过时间点的当天会补跑，比如控制台在 22:00 时正在重启）
let digestTick = false;
setInterval(async () => {
  if (digestTick) return; digestTick = true;
  try {
    const s = digestSettings.load(); if (!s.enabled) return; const { day, hm } = sgParts(); if (hm < s.time) return;
    for (const [key, on] of Object.entries(s.sessions || {})) {
      if (!on || s.lastRun?.[key] === day) continue;
      const cur = digestSettings.load(); digestSettings.save({ ...cur, lastRun: { ...(cur.lastRun || {}), [key]: day } });
      await runDigest(key, day);
    }
  } catch (e) { console.error("digest tick", e.message); } finally { digestTick = false; }
}, 60e3).unref();
const listDigests = () => { let fsx = []; try { fsx = fs.readdirSync(DIGEST_DIR).filter(f => f.endsWith(".json")); } catch {} return fsx.map(f => { try { return JSON.parse(fs.readFileSync(path.join(DIGEST_DIR, f), "utf8")); } catch { return null; } }).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt); };
const isDigestId = s => /^\d{4}-\d\d-\d\d__[0-9a-f]{10}$/.test(String(s || ""));

// 表情库（只读 workspace/stickers）+ 控制台自己从现在开始累计的使用排行
const STICKER_DIR = path.join(WORKSPACE, "stickers");
const stickerStats = jsonStore("sticker-stats.json", () => ({ since: Date.now(), counts: {}, seen: [], lastScan: null }));
const stickerFiles = () => { try { return fs.readdirSync(STICKER_DIR).filter(f => !f.startsWith(".") && /\.(png|jpe?g|gif|webp)$/i.test(f)).sort(); } catch { return []; } };
const stickerMeta = f => { const b = f.replace(/\.[^.]+$/, ""); const i = b.indexOf("-"); return { file: f, emotion: i > 0 ? b.slice(0, i) : b, source: i > 0 ? b.slice(i + 1) : null }; };
async function scanStickers() {
  const st = stickerStats.load(); const files = stickerFiles(); const byEmo = new Map(files.map(f => [stickerMeta(f).emotion, f]));
  const seen = new Set(st.seen), counts = { ...st.counts }; let added = 0;
  const hit = (uid, f, via, ts) => { if (!f || seen.has(uid) || (ts && ts < st.since)) return; seen.add(uid); counts[f] = counts[f] || { total: 0, byVia: {} }; counts[f].total++; counts[f].byVia[via] = (counts[f].byVia[via] || 0) + 1; counts[f].last = ts || Date.now(); added++; };
  // 1) 网关日志里的潜水表情（插件直发，不进会话历史）
  try { for (const lf of fs.readdirSync("/tmp/openclaw").filter(x => /^openclaw-\d{4}-\d\d-\d\d\.log$/.test(x))) { const txt = fs.readFileSync(path.join("/tmp/openclaw", lf), "utf8"); for (const l of txt.split("\n")) { const m = /lurk sticker SENT.*?file=(\S+)/.exec(l); if (!m) continue; const f = path.basename(m[1].replace(/["',]+$/, "")); const tm = /"time":"([^"]+)"/.exec(l) || /^(\d{4}-\d\d-\d\dT[\d:.]+Z?)/.exec(l); hit("log:" + crypto.createHash("sha1").update(l).digest("hex").slice(0, 16), files.includes(f) ? f : f, "lurk", tm ? Date.parse(tm[1]) : null); } } } catch {}
  // 2) QQ 会话历史：工具 media:"stickers/xxx" 与 &&分类&& 标签
  try {
    const ss = (await call("sessions.list", { limit: 500 })).sessions || [];
    for (const s of ss.filter(x => /:qqbot:/.test(x.key))) {
      let raw; try { raw = await call("chat.history", { sessionKey: s.key, limit: 1000 }, 20000); } catch { continue; }
      for (const m of buildHistory(raw, s).messages) {
        if (m.role !== "assistant" || !m.ts || m.ts < st.since) continue;
        for (const c of m.tools || []) { const a = JSON.stringify(c.args || ""); for (const mm of a.matchAll(/stickers\/([^"\\]+?\.(?:png|jpe?g|gif|webp))/gi)) hit(`h:${m.id}:${c.id}:${mm[1]}`, mm[1], "tool", m.ts); }
        if (m.delivery === "sent") for (const mm of textOf(m).matchAll(/&&([^&\s]{1,8})&&/g)) hit(`t:${m.id}:${mm[1]}`, byEmo.get(mm[1]) || mm[1], "tag", m.ts);
      }
    }
  } catch {}
  stickerStats.save({ ...st, counts, seen: [...seen].slice(-20000), lastScan: Date.now() }); return added;
}
setTimeout(() => scanStickers().catch(() => {}), 30e3).unref(); setInterval(() => scanStickers().catch(() => {}), 10 * 60e3).unref();

// 互动统计：群会话里每个发言人的消息数、她回复数（本轮有确认/推断已发出的回复）、静默数、最近互动
async function interactions(key) {
  const raw = await cached("hist:" + key, 3000, () => call("chat.history", { sessionKey: key, limit: 1000 }, 20000));
  const h = buildHistory(raw, null); const per = new Map(); const turnSender = new Map();
  for (const m of h.messages) {
    if (m.role === "user" && m.senderId) { const id = String(m.senderId).toLowerCase(); const p = per.get(id) || { id, name: null, messages: 0, replies: 0, silences: 0, unknown: 0, lastAt: 0 }; p.messages++; p.name = m.sender?.name || p.name; p.lastAt = Math.max(p.lastAt, m.ts || 0); per.set(id, p); turnSender.set(m.turnId, id); }
  }
  const turnOutcome = new Map(); for (const m of h.messages) if (m.role === "assistant" && m.delivery) { const cur = turnOutcome.get(m.turnId); if (m.delivery === "sent") turnOutcome.set(m.turnId, "sent"); else if (cur !== "sent") turnOutcome.set(m.turnId, m.delivery === "silent" && cur !== "unknown" ? "silent" : "unknown"); }
  for (const [tid, id] of turnSender) { const p = per.get(id), o = turnOutcome.get(tid); if (!o) continue; if (o === "sent") p.replies++; else if (o === "silent") p.silences++; else p.unknown++; }
  const first = h.messages.find(m => m.ts)?.ts || null;
  return { sessionKey: key, name: aliasFor(key) || key, windowFrom: first, windowCount: h.messages.length, note: "只统计网关返回的最近一个历史窗口（最多约 1000 条）；回复/静默按“轮”计，归给触发该轮的发言人", people: [...per.values()].map(p => ({ ...p, alias: loadAliases()[p.id] || null })).sort((a, b) => b.messages - a.messages) };
}

// 主动行为参数（只读 openclaw.json，敏感字段打码）
const maskCfg = o => Array.isArray(o) ? o.map(maskCfg) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /key|token|secret|password|hash/i.test(k) ? (v ? "已设置" : "未设置") : maskCfg(v)])) : o;
const serveFile = (res, f, ct) => { const st = fs.statSync(f); res.writeHead(200, { "content-type": ct, "content-length": String(st.size), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" }); fs.createReadStream(f).pipe(res); };

Object.assign(R, {
  "GET /api/digest/settings": async () => {
    const s = digestSettings.load(); let ss = []; try { ss = (await cached("hist-sess", 30e3, () => call("sessions.list", { limit: 500 }))).sessions || []; } catch {}
    const keys = new Set([...ss.map(x => x.key), ...Object.keys(s.sessions || {})]);
    return { enabled: !!s.enabled, time: s.time, timeZone: TZ, imageModel: DIGEST_IMAGE_MODEL, sessions: [...keys].map(k => ({ sessionKey: k, name: aliasFor(k) || ss.find(x => x.key === k)?.displayName || k, kind: /:group:/.test(k) && !/:c2c:/.test(k) ? "group" : "other", enabled: !!s.sessions?.[k], lastRunDay: s.lastRun?.[k] || null })) };
  },
  "POST /api/digest/settings/set": W("digest.settings.set", b => `${b.sessionKey || "global"} enabled=${b.enabled} time=${b.time ?? ""} global=${b.globalEnabled ?? ""}`, async b => {
    const s = { ...digestSettings.load() }; s.sessions = { ...(s.sessions || {}) };
    if (b.time != null) { if (!isHM(b.time)) throw httpErr(400, "time 格式应为 HH:MM（24 小时制）"); s.time = b.time; }
    if (b.globalEnabled != null) { if (typeof b.globalEnabled !== "boolean") throw httpErr(400, "globalEnabled 必须是布尔值"); s.enabled = b.globalEnabled; }
    if (b.sessionKey != null) { if (typeof b.sessionKey !== "string" || !b.sessionKey || b.sessionKey.length > 300) throw httpErr(400, "sessionKey 无效"); if (typeof b.enabled !== "boolean") throw httpErr(400, "enabled 必须是布尔值"); if (b.enabled) s.sessions[b.sessionKey] = true; else delete s.sessions[b.sessionKey]; }
    if (b.sessionKey == null && b.time == null && b.globalEnabled == null) throw httpErr(400, "没有要修改的项");
    digestSettings.save(s); return { ok: true, enabled: s.enabled, time: s.time, sessions: s.sessions };
  }, { confirm: true }),
  "GET /api/digests": async u => { const k = u.searchParams.get("key"); const all = listDigests().filter(d => !k || d.sessionKey === k); const lim = qi(u, "limit", 30, 200); return { digests: all.slice(0, lim).map(({ text, ...d }) => ({ ...d, preview: String(text || "").slice(0, 120) })), total: all.length }; },
  "POST /api/digests/run-now": W("digest.run-now", b => b.sessionKey, async b => { need(b, "sessionKey"); if (!digestSettings.load().sessions?.[b.sessionKey]) throw httpErr(400, "该会话没有开启群报"); const day = sgParts().day; runDigest(b.sessionKey, day).catch(() => {}); return { ok: true, started: true, day }; }, { confirm: true }),
  "GET /api/digests/get": async u => { const id = u.searchParams.get("id"); if (!isDigestId(id)) throw httpErr(400, "id 无效"); try { return JSON.parse(fs.readFileSync(path.join(DIGEST_DIR, id + ".json"), "utf8")); } catch { throw httpErr(404, "群报不存在"); } },
  "GET /api/diary": async () => cached("diary", 60e3, async () => { const r = await call("doctor.memory.dreamDiary", { agentId: "main" }, 15000); return { agentId: r.agentId || "main", found: !!r.found, path: r.path || null, content: r.content || "", updatedAtMs: r.updatedAtMs || null }; }),
  "GET /api/interactions": async u => {
    const key = u.searchParams.get("key");
    if (key) return cached("ia:" + key, 60e3, () => interactions(key));
    const ss = (await cached("hist-sess", 30e3, () => call("sessions.list", { limit: 500 }))).sessions || [];
    const gs = ss.filter(x => /:qqbot:/.test(x.key) && /:group:/.test(x.key) && !/:c2c:/.test(x.key));
    return { groups: await Promise.all(gs.map(g => cached("ia:" + g.key, 60e3, () => interactions(g.key)).catch(e => ({ sessionKey: g.key, error: e.message })))) };
  },
  "GET /api/stickers": async () => { const st = stickerStats.load(); const items = stickerFiles().map(f => { let s = null; try { s = fs.statSync(path.join(STICKER_DIR, f)); } catch {} return { ...stickerMeta(f), size: s?.size ?? null, mtime: s?.mtimeMs ?? null, uses: st.counts[f]?.total || 0, byVia: st.counts[f]?.byVia || {}, lastUsed: st.counts[f]?.last || null }; }); const extra = Object.entries(st.counts).filter(([f]) => !items.some(i => i.file === f)).map(([f, c]) => ({ file: f, missing: true, uses: c.total, byVia: c.byVia, lastUsed: c.last })); return { since: st.since, lastScan: st.lastScan, items, ranking: [...items, ...extra].filter(i => i.uses).sort((a, b) => b.uses - a.uses), note: "排行从 since 起由控制台累计；来源：tool=她用工具发表情，tag=回复里的 &&分类&& 标签，lurk=插件潜水表情（网关日志，只保留约两天，控制台每 10 分钟扫描）" }; },
  "GET /api/behavior": async () => cached("behavior", 30e3, async () => {
    const c = JSON.parse(fs.readFileSync(CFG, "utf8")); const gate = c.plugins?.entries?.["qq-group-followup-gate"] || {};
    let last = null; try { last = await call("last-heartbeat", {}, 8000); } catch (e) { last = { error: e.message }; }
    return { heartbeat: maskCfg(c.agents?.defaults?.heartbeat || null), lastHeartbeat: maskCfg(last), mediaTags: maskCfg(c.channels?.qqbot?.mediaTags || null), followupGate: { enabled: gate.enabled !== false, keepalive: maskCfg(gate.config?.keepalive || null), lurkSticker: maskCfg(gate.config?.lurkSticker || null) }, groupNames: loadAliases(), readOnly: true };
  }),
});

// ---------- v2.7：表情库管理（写 workspace/stickers：manifest.json / params.json / .trash/；需要单元 drop-in 放开该目录） ----------
const STK_TRASH = path.join(STICKER_DIR, ".trash");
const STK_MANUAL = "手动入库";
const STK_EXT = { png: "png", jpg: "jpg", webp: "webp", gif: "gif" };
const isCat = s => /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(String(s || ""));
const sniff = b => b.length > 12 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG" ? "png" : b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpg" : b.toString("latin1", 0, 4) === "GIF8" ? "gif" : b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" ? "webp" : null;
const sha256f = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const stkCatOf = f => f.replace(/\.[^.]+$/, "").split("-")[0];
function stkReadJ(name, init) { try { return JSON.parse(fs.readFileSync(path.join(STICKER_DIR, name), "utf8")); } catch (e) { if (e.code === "ENOENT") return init(); throw httpErr(500, name + " 读取失败：" + e.message); } }
function stkTrashCopy(f, tag) { fs.mkdirSync(STK_TRASH, { recursive: true, mode: 0o755 }); const ts = new Date().toISOString().replace(/[:.]/g, "-"); const dst = path.join(STK_TRASH, `${ts}-${tag || ""}${path.basename(f)}`); fs.copyFileSync(f, dst, fs.constants.COPYFILE_EXCL); return path.basename(dst); }
function stkWriteJ(name, obj) {
  const f = path.join(STICKER_DIR, name); try { if (fs.existsSync(f)) stkTrashCopy(f); } catch {}
  obj.updatedAt = Date.now(); const tmp = path.join(STICKER_DIR, `.${name}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o644 }); fs.renameSync(tmp, f);
}
const stkManifest = () => stkReadJ("manifest.json", () => ({ version: 1, categories: {}, files: {} }));
const stkParams = () => stkReadJ("params.json", () => ({ version: 1 }));
function stkFreeName(cat, ext) { const used = new Set(stickerFiles().map(f => f.replace(/\.[^.]+$/, ""))); for (let n = 1; n < 1000; n++) { const stem = n === 1 ? `${cat}-${STK_MANUAL}` : `${cat}-${STK_MANUAL}${n}`; if (!used.has(stem)) return `${stem}.${ext}`; } throw httpErr(409, "序号用完了"); }
function stkDup(hash) { const m = stkManifest(); for (const [f, v] of Object.entries(m.files || {})) if (v.sha256 === hash && fs.existsSync(path.join(STICKER_DIR, f))) return f; for (const f of stickerFiles()) if (!m.files?.[f]) { try { if (sha256f(path.join(STICKER_DIR, f)) === hash) return f; } catch {} } return null; }
async function stkImport(req, u) {
  const cat = u.searchParams.get("category"); if (!isCat(cat)) throw httpErr(400, "category 需为 1–16 个中文/字母/数字（不能含 -）");
  if (u.searchParams.get("confirm") !== "1") throw httpErr(400, "需要 confirm=1 确认");
  const chunks = []; let n = 0;
  await new Promise((r, j) => { req.on("data", c => { n += c.length; if (n > 5 * 1024 * 1024) { j(httpErr(413, "图片不能超过 5MB")); req.destroy(); } else chunks.push(c); }); req.on("end", r); req.on("error", j); });
  const buf = Buffer.concat(chunks); if (!buf.length) throw httpErr(400, "空文件");
  const ext = sniff(buf); if (!ext) throw httpErr(415, "只支持 png / jpg / webp / gif（按文件内容判断）");
  const hash = crypto.createHash("sha256").update(buf).digest("hex"); const dup = stkDup(hash);
  if (dup) throw Object.assign(httpErr(409, `和已有表情重复：${dup}`), { code: "DUPLICATE" });
  const name = stkFreeName(cat, STK_EXT[ext]); const f = path.join(STICKER_DIR, name);
  const tmp = path.join(STICKER_DIR, `.import-${process.pid}-${Date.now()}.${ext}`); fs.writeFileSync(tmp, buf, { mode: 0o664 });
  try { fs.linkSync(tmp, f); } finally { try { fs.unlinkSync(tmp); } catch {} }
  const m = stkManifest(); m.categories ||= {}; m.files ||= {}; const isNewCat = !m.categories[cat];
  if (!m.categories[cat]) m.categories[cat] = { desc: "", scene: "", synonyms: [], enabled: true };
  m.files[name] = { category: cat, sha256: hash, size: buf.length, source: "manual", addedAt: Date.now() }; stkWriteJ("manifest.json", m);
  return { ok: true, file: name, category: cat, sha256: hash, size: buf.length, format: ext, newCategory: isNewCat };
}
const stkGenJobs = new Map();
function stkGenState() { const p = stkParams(); const tz = p.quietHours?.tz || "Asia/Singapore"; const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); let s = {}; try { s = JSON.parse(fs.readFileSync(path.join(STICKER_DIR, ".gen-state.json"), "utf8")); } catch {} const cap = Number.isFinite(+p.genDailyCap) ? +p.genDailyCap : 10; return { day, count: s.day === day ? s.count || 0 : 0, cap, enabled: p.genEnabled !== false }; }
function stkGenBump() { const g = stkGenState(); const f = path.join(STICKER_DIR, ".gen-state.json"), t = f + ".tmp-c"; fs.writeFileSync(t, JSON.stringify({ day: g.day, count: g.count + 1 })); fs.renameSync(t, f); }
// ---------- v2.11：语音参数（params.json 的 voice 段，HOSINO-VOICE-PARAMS v1） ----------
const QQ_MT_STATE = path.join(path.dirname(WORKSPACE), "qqbot", "media-tag-state.json");
const VOICE_DEFAULTS = { enabled: true, probability: 0.12, cooldownReplies: 4, tz: "Asia/Singapore", quietHours: [{ start: "00:00", end: "08:00" }], defaultEnabled: false, perConversation: {}, maxChars: 40, dailyLimit: 20, exclusiveWithSticker: true };
const isTZ = s => { try { new Intl.DateTimeFormat("en-CA", { timeZone: s }); return true; } catch { return false; } };
function voiceMerge(cur, v) {
  if (v === null) return null; // 传 null = 删除 voice 段，回到旧行为（模型自己决定）
  if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, "voice 必须是对象或 null");
  const o = { ...VOICE_DEFAULTS, ...(cur && typeof cur === "object" ? cur : {}) };
  for (const [k, x] of Object.entries(v)) {
    if (["enabled", "defaultEnabled", "exclusiveWithSticker"].includes(k)) { if (typeof x !== "boolean") throw httpErr(400, `voice.${k} 必须是布尔值`); o[k] = x; }
    else if (k === "probability") { if (typeof x !== "number" || !(x >= 0 && x <= 1)) throw httpErr(400, "voice.probability 应在 0–1"); o[k] = x; }
    else if (k === "cooldownReplies") { if (!Number.isInteger(x) || x < 0 || x > 100) throw httpErr(400, "voice.cooldownReplies 应为 0–100 的整数"); o[k] = x; }
    else if (k === "maxChars") { if (!Number.isInteger(x) || x < 1 || x > 200) throw httpErr(400, "voice.maxChars 应为 1–200 的整数"); o[k] = x; }
    else if (k === "dailyLimit") { if (!Number.isInteger(x) || x < 0 || x > 1000) throw httpErr(400, "voice.dailyLimit 应为 0–1000 的整数（0=不限）"); o[k] = x; }
    else if (k === "tz") { if (typeof x !== "string" || !isTZ(x)) throw httpErr(400, "voice.tz 不是有效时区"); o[k] = x; }
    else if (k === "quietHours") {
      if (x === null) { o.quietHours = []; continue; }
      if (!Array.isArray(x) || x.length > 6) throw httpErr(400, "voice.quietHours 应为最多 6 段的数组 [{start,end}]，或 null");
      o.quietHours = x.map((q, i) => { if (!isHM(q?.start) || !isHM(q?.end)) throw httpErr(400, `voice.quietHours[${i}] 需要 start/end（HH:MM）`); return { start: q.start, end: q.end }; });
    } else if (k === "perConversation") {
      if (!x || typeof x !== "object" || Array.isArray(x)) throw httpErr(400, "voice.perConversation 必须是对象"); const pc = { ...(o.perConversation || {}) };
      for (const [ck, cv] of Object.entries(x)) {
        if (!/^group:[0-9a-f]{32}$/.test(ck)) throw httpErr(400, `会话键应为 group:<32位小写hex>（私聊第二期）：${ck}`);
        if (cv === null) { delete pc[ck]; continue; }
        if (typeof cv?.enabled !== "boolean") throw httpErr(400, `${ck}.enabled 必须是布尔值`); const e = { enabled: cv.enabled };
        if (cv.probability != null) { if (typeof cv.probability !== "number" || !(cv.probability >= 0 && cv.probability <= 1)) throw httpErr(400, `${ck}.probability 应在 0–1`); e.probability = cv.probability; }
        pc[ck] = e;
      }
      o.perConversation = pc;
    } else throw httpErr(400, "不支持的语音参数：" + k);
  }
  return o;
}
function voiceToday(p) {
  const v = p?.voice; if (!v || typeof v !== "object") return { configured: false };
  const tz = v.tz || "Asia/Singapore"; const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  let groups = {}; try { groups = JSON.parse(fs.readFileSync(QQ_MT_STATE, "utf8"))?.groups || {}; } catch {}
  const limit = Number.isFinite(+v.dailyLimit) ? +v.dailyLimit : 20; const per = {};
  for (const [gid, g] of Object.entries(groups)) per["group:" + gid.toLowerCase()] = { count: g.voiceDay === day ? g.voiceDayCount || 0 : 0, lastVoiceAt: g.lastVoiceAt || null, repliesSinceVoice: g.lastVoiceReply == null ? null : (g.replies || 0) - g.lastVoiceReply };
  return { configured: true, day, tz, limit, perConversation: per };
}
const STK_PARAM_KEYS = { enabled: "bool", attachProbability: "prob", cooldownReplies: "int", defaultEnabled: "bool", genEnabled: "bool", genDailyCap: "int" };

Object.assign(R, {
  "GET /api/stickers/manifest": async () => ({ manifest: stkManifest(), genToday: stkGenState() }),
  "GET /api/stickers/params": async () => { const p = stkParams(); return { params: p, genToday: stkGenState(), voiceToday: voiceToday(p), voiceDefaults: VOICE_DEFAULTS }; },
  "POST /api/stickers/params/set": W("stickers.params.set", b => Object.keys(b.params || {}).join(","), async b => {
    const inP = b.params; if (!inP || typeof inP !== "object") throw httpErr(400, "需要 params 对象");
    const p = { ...stkParams() };
    for (const [k, v] of Object.entries(inP)) {
      const t = STK_PARAM_KEYS[k];
      if (t === "bool") { if (typeof v !== "boolean") throw httpErr(400, `${k} 必须是布尔值`); p[k] = v; }
      else if (t === "prob") { if (typeof v !== "number" || v < 0 || v > 1) throw httpErr(400, `${k} 应在 0–1`); p[k] = v; }
      else if (t === "int") { if (!Number.isInteger(v) || v < 0 || v > 1000) throw httpErr(400, `${k} 应为 0–1000 的整数`); p[k] = v; }
      else if (k === "quietHours") { if (v === null) p.quietHours = null; else { if (!isHM(v?.start) || !isHM(v?.end)) throw httpErr(400, "quietHours 需要 start/end（HH:MM）"); p.quietHours = { start: v.start, end: v.end, tz: typeof v.tz === "string" && v.tz ? v.tz : "Asia/Singapore" }; } }
      else if (k === "sessions") {
        if (!v || typeof v !== "object") throw httpErr(400, "sessions 必须是对象"); const ss = { ...(p.sessions || {}) };
        for (const [sk, sv] of Object.entries(v)) { if (!/^(group|c2c):[0-9a-f]{32}$/.test(sk)) throw httpErr(400, `会话键应为 group:<32位小写hex> 或 c2c:<openid>：${sk}`); if (sv === null) { delete ss[sk]; continue; } if (typeof sv?.enabled !== "boolean") throw httpErr(400, `${sk}.enabled 必须是布尔值`); const e = { enabled: sv.enabled }; if (sv.probability != null) { if (typeof sv.probability !== "number" || sv.probability < 0 || sv.probability > 1) throw httpErr(400, `${sk}.probability 应在 0–1`); e.probability = sv.probability; } ss[sk] = e; }
        p.sessions = ss;
      } else if (k === "voice") { const nv = voiceMerge(p.voice, v); if (nv === null) delete p.voice; else p.voice = nv; } /* v2.11 */
      else throw httpErr(400, "不支持的参数：" + k);
    }
    stkWriteJ("params.json", p); return { ok: true, params: p, voiceToday: voiceToday(p) };
  }, { confirm: true }),
  "POST /api/stickers/manifest/set": W("stickers.manifest.set", b => `look=${b.look != null} style=${b.style != null} cats=${Object.keys(b.categories || {}).join(",")}`, async b => {
    const m = stkManifest();
    if (b.look != null) { if (typeof b.look !== "string" || strLen(b.look) > 2000) throw httpErr(400, "look 最长 2000 字"); m.look = b.look; }
    if (b.style != null) { if (typeof b.style !== "string" || strLen(b.style) > 1000) throw httpErr(400, "style 最长 1000 字"); m.style = b.style; }
    if (b.categories != null) {
      if (typeof b.categories !== "object") throw httpErr(400, "categories 必须是对象"); m.categories ||= {};
      for (const [c, v] of Object.entries(b.categories)) {
        if (!isCat(c)) throw httpErr(400, "分类名无效：" + c);
        if (v === null) { if (stickerFiles().some(f => stkCatOf(f) === c)) throw httpErr(409, `分类 ${c} 下还有图片，不能删除分类`); delete m.categories[c]; continue; }
        const cur = { desc: "", scene: "", synonyms: [], enabled: true, ...(m.categories[c] || {}) };
        if (v.desc != null) { if (typeof v.desc !== "string" || strLen(v.desc) > 40) throw httpErr(400, "desc 最长 40 字"); cur.desc = v.desc; }
        if (v.scene != null) { if (typeof v.scene !== "string" || strLen(v.scene) > 40) throw httpErr(400, "scene 最长 40 字"); cur.scene = v.scene; }
        if (v.synonyms != null) { if (!Array.isArray(v.synonyms) || v.synonyms.length > 40 || v.synonyms.some(x => typeof x !== "string" || !x.trim() || strLen(x) > 16)) throw httpErr(400, "synonyms 最多 40 个、每个 ≤16 字"); cur.synonyms = [...new Set(v.synonyms.map(x => x.trim()))]; }
        if (v.enabled != null) { if (typeof v.enabled !== "boolean") throw httpErr(400, "enabled 必须是布尔值"); cur.enabled = v.enabled; }
        m.categories[c] = cur;
      }
    }
    stkWriteJ("manifest.json", m); return { ok: true, manifest: m };
  }, { confirm: true }),
  "POST /api/stickers/rename": W("stickers.rename", b => `${b.file} -> ${b.category}`, async b => {
    need(b, "file", "category"); if (!stickerFiles().includes(b.file)) throw httpErr(404, "表情不存在"); if (!isCat(b.category)) throw httpErr(400, "category 无效");
    const old = b.file, oldCat = stkCatOf(old); if (oldCat === b.category) throw httpErr(400, "分类没变");
    const ext = old.split(".").pop().toLowerCase(); const rest = old.slice(oldCat.length + 1).replace(/\.[^.]+$/, "");
    let nn;
    if (rest.startsWith(STK_MANUAL)) nn = stkFreeName(b.category, ext);
    else { const used = new Set(stickerFiles()); nn = `${b.category}-${rest.replace(/-v\d+$/, "")}.${ext}`; for (let i = 2; used.has(nn); i++) nn = `${b.category}-${rest.replace(/-v\d+$/, "")}-v${i}.${ext}`; }
    const backup = stkTrashCopy(path.join(STICKER_DIR, old), "rename-");
    fs.linkSync(path.join(STICKER_DIR, old), path.join(STICKER_DIR, nn)); fs.unlinkSync(path.join(STICKER_DIR, old));
    const m = stkManifest(); m.files ||= {}; m.categories ||= {}; const e = m.files[old] || { sha256: sha256f(path.join(STICKER_DIR, nn)), source: rest.startsWith(STK_MANUAL) ? "manual" : "generated:" + rest };
    delete m.files[old]; m.files[nn] = { ...e, category: b.category, renamedFrom: old, renamedAt: Date.now() };
    if (!m.categories[b.category]) m.categories[b.category] = { desc: "", scene: "", synonyms: [], enabled: true };
    stkWriteJ("manifest.json", m); return { ok: true, from: old, to: nn, backup };
  }, { confirm: true }),
  "POST /api/stickers/delete": W("stickers.delete", b => b.file, async b => {
    need(b, "file"); if (!stickerFiles().includes(b.file)) throw httpErr(404, "表情不存在");
    fs.mkdirSync(STK_TRASH, { recursive: true, mode: 0o755 }); const ts = new Date().toISOString().replace(/[:.]/g, "-"); const dst = `${ts}-deleted-${b.file}`;
    fs.renameSync(path.join(STICKER_DIR, b.file), path.join(STK_TRASH, dst));
    const m = stkManifest(); if (m.files?.[b.file]) { delete m.files[b.file]; stkWriteJ("manifest.json", m); }
    return { ok: true, movedTo: ".trash/" + dst };
  }, { confirm: true }),
  "GET /api/stickers/trash": async () => { let fs_ = []; try { fs_ = fs.readdirSync(STK_TRASH).filter(f => !f.startsWith(".")).sort().reverse(); } catch {} return { items: fs_.map(f => { let s = null; try { s = fs.statSync(path.join(STK_TRASH, f)); } catch {} return { file: f, size: s?.size ?? null, mtime: s?.mtimeMs ?? null }; }) }; },
  // 生成：不弹确认（李的要求），只要 X-HS；受 genEnabled / genDailyCap 约束（与群聊自动生图共用当天计数 .gen-state.json）
  "POST /api/stickers/generate": W("stickers.generate", b => b.category, async b => {
    if (!isCat(b.category)) throw httpErr(400, "category 无效"); const g = stkGenState();
    if (!g.enabled) throw httpErr(403, "params.genEnabled 已关闭");
    if (g.count >= g.cap) throw httpErr(429, `今天已生成 ${g.count}/${g.cap} 张（genDailyCap）`);
    if ([...stkGenJobs.values()].some(j => j.status === "running")) throw httpErr(409, "已有一张正在生成");
    stkGenBump(); const id = crypto.randomBytes(6).toString("hex"); const job = { id, category: b.category, status: "running", startedAt: Date.now() }; stkGenJobs.set(id, job);
    execFile("python3", [path.join(WORKSPACE, "scripts", "sticker_manager.py"), "get", b.category, "--new"], { cwd: WORKSPACE, timeout: 300e3, maxBuffer: 1 << 20, env: { ...process.env, PATH: "/home/ubuntu/.npm-global/bin:/home/ubuntu/.local/bin:" + (process.env.PATH || "/usr/local/bin:/usr/bin:/bin") } }, (e, o, er) => {
      let j = null; try { j = JSON.parse(String(o || "").trim().split("\n").pop()); } catch {}
      Object.assign(job, { finishedAt: Date.now(), durationMs: Date.now() - job.startedAt });
      if (e || j?.status !== "ok") Object.assign(job, { status: "error", error: String(j?.error || er || e?.message || "失败").slice(-400), attempts: j?.attempts });
      else Object.assign(job, { status: "ok", file: path.basename(j.path), model: j.model, source: j.source, fallbackFrom: j.chain_tried?.length ? j.chain_tried : undefined });
      if (stkGenJobs.size > 50) stkGenJobs.delete(stkGenJobs.keys().next().value);
    });
    return { ok: true, jobId: id, genToday: { ...g, count: g.count + 1 } };
  }),
  "GET /api/stickers/generate/status": async u => { const id = u.searchParams.get("id"); if (id) { const j = stkGenJobs.get(id); if (!j) throw httpErr(404, "任务不存在（控制台重启会清空）"); return j; } return { jobs: [...stkGenJobs.values()].reverse(), genToday: stkGenState() }; },
});

// ---------- v2.8：记忆浏览 / 标错 / 先备份再删除 / 还原（直接 Qdrant REST；不重算向量；不碰 mem0-history.db 和向量模型配置） ----------
const MEM_ENT = MEMCOL + "_entities";
const MEM_BK = path.join(DATA, "memory-backup");
const MEM_BK_DAYS = 90, MEM_BK_MAX = 500;
const MEM_FILES = path.join(WORKSPACE, "memory");
const memFlags = jsonStore("memory-flags.json", () => ({}));
async function qx(method, p, body) { const r = await fetch(QDRANT + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) }); const j = await r.json().catch(() => ({})); if (!r.ok || j.status && j.status !== "ok" && typeof j.status !== "object") throw httpErr(502, `Qdrant ${r.status} ${JSON.stringify(j.status || "").slice(0, 200)}`); return j.result; }
const isPointId = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "")) || /^\d{1,19}$/.test(String(s || ""));
const MEM_IDX_FIELDS = ["user_id", "source_session_key", "source_openid_or_peer", "channel", "createdAt", "attributedTo", "data"];
// v2.8.2: mem0 插件配置里的 userId（如“凛”）是整个共享库的桶名，不是某个人
const MEM_BUCKET_DEFAULT = process.env.MEM0_USER_ID || "凛";
const memBucketId = () => cached("mem0uid", 10 * 60e3, async () => { try { const r = await call("config.get"); let c = r.config || r.parsed; if (!c && r.raw) c = JSON.parse(r.raw); const u = c?.plugins?.entries?.["openclaw-mem0"]?.config?.userId; return typeof u === "string" && u.trim() ? u.trim() : MEM_BUCKET_DEFAULT; } catch { return MEM_BUCKET_DEFAULT; } });
const MEM_PREFIX_RE = /^\[\s*(?:([^\]\(\)]{0,40}?)\s*\(\s*)?([0-9a-f]{32})\s*\)?\s*\]/i;
const memPrefix = d => { const m = MEM_PREFIX_RE.exec(String(d || "")); return m ? { id: m[2].toLowerCase(), name: (m[1] || "").trim() || null } : null; };
const MEM_UNATTR = "unattributed";
const memIndex = () => cached("memidx", 5 * 60e3, async () => {
  const out = []; let off = null;
  do { const r = await qx("POST", `/collections/${MEMCOL}/points/scroll`, { limit: 1000, offset: off, with_vector: false, with_payload: MEM_IDX_FIELDS }); for (const p of r.points) { const { data, ...rest } = p.payload || {}; const pf = memPrefix(data); out.push({ id: p.id, ...rest, _prefix: pf }); } off = r.next_page_offset; } while (off);
  return out;
});
function memNameToId() { const m = new Map(); for (const [k, v] of Object.entries(loadAliases())) if (isOpenId(k) && v) m.set(String(v).trim(), k.toLowerCase()); for (const [k, v] of Object.entries(profiles.load())) if (v?.name) m.set(String(v.name).trim(), k.toLowerCase()); for (const [k, v] of seenNames) if (v && !m.has(v)) m.set(v, k); return m; }
// 归属：会话/来源字段（source）给出群和私聊对象；非共享库桶的 user_id（peer:/openid）给出说话人；
// 都没有“人”时，才用正文开头 [名字 (OPENID)] 推断（prefix）；什么都没有 → 未归属（共享库）。
// attrSrc 表示“人”是怎么定的：user_id | source | prefix | group（只知道群）| none
function memAttr(p, n2i, bucket) {
  const s = new Set(); const uid = String(p.user_id || "").trim(), sk = String(p.source_session_key || ""), src = String(p.source_openid_or_peer || "");
  let m, attrSrc = null, inferredName;
  if ((m = /:group:([0-9a-f]{32})$/i.exec(sk))) s.add("group:" + m[1].toLowerCase());
  if ((m = /:direct:([0-9a-f]{32})$/i.exec(sk))) s.add("person:" + m[1].toLowerCase());
  if (isOpenId(src)) s.add((p.channel === "group" && !/:direct:/.test(sk) ? "group:" : "person:") + src.toLowerCase());
  const srcPerson = [...s].some(k => k.startsWith("person:"));
  if (uid && uid !== bucket) {
    const n = s.size;
    if ((m = /^peer:group:([0-9a-f]+)$/i.exec(uid))) s.add("group:" + m[1].toLowerCase());
    else if ((m = /^peer:(.+)$/i.exec(uid))) { const v = m[1].trim(); if (isOpenId(v)) s.add("person:" + v.toLowerCase()); else if (n2i.get(v)) s.add("person:" + n2i.get(v)); else s.add("name:" + v); attrSrc = "user_id"; }
    else if (isOpenId(uid)) { s.add("person:" + uid.toLowerCase()); attrSrc = "user_id"; }
    else { s.add("name:" + uid); attrSrc = "user_id"; } // 裸 user_id 不按别名映射
  }
  if (!attrSrc && srcPerson) attrSrc = "source";
  if (!attrSrc) { const pf = p._prefix !== undefined ? p._prefix : memPrefix(p.data); if (pf) { s.add("person:" + pf.id); attrSrc = "prefix"; inferredName = pf.name; } }
  if (!attrSrc) attrSrc = s.size ? "group" : "none";
  if (!s.size) s.add(MEM_UNATTR);
  return { keys: [...s], attrSrc, inferredName };
}
const memSubjects = (p, n2i, bucket) => memAttr(p, n2i, bucket).keys;
async function memSubjectMap() {
  const idx = await memIndex(), n2i = memNameToId(), bucket = await memBucketId(); const map = new Map();
  for (const p of idx) { const a = memAttr(p, n2i, bucket); for (const k of a.keys) { let e = map.get(k); if (!e) map.set(k, e = { key: k, count: 0, lastAt: null, attr: { user_id: 0, source: 0, prefix: 0, group: 0, none: 0 }, raw: { user_id: new Map(), source_session_key: new Map(), source_openid_or_peer: new Map() }, ids: [] }); e.count++; e.attr[a.attrSrc]++; e.ids.push({ id: p.id, createdAt: p.createdAt || "" }); if ((p.createdAt || "") > (e.lastAt || "")) e.lastAt = p.createdAt; for (const f of ["user_id", "source_session_key", "source_openid_or_peer"]) if (p[f] != null) { const v = String(p[f]); e.raw[f].set(v, (e.raw[f].get(v) || 0) + 1); } } }
  return map;
}
function memSubjectName(k) { const [t, v] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)]; if (t === "person" || t === "group") return loadAliases()[v] || profiles.load()[v]?.name || seenNames.get(v) || null; if (t === "name") return v; if (k === MEM_UNATTR) return "未归属（共享库）"; return null; }
const memPublic = (pt, ctx) => { const p = pt.payload || {}; const { textLemmatized, ...rest } = p; const o = { id: pt.id, ...rest, flag: memFlags.load()[String(pt.id)] || null }; if (ctx) { const a = memAttr(p, ctx.n2i, ctx.bucket); o.subjects = a.keys; o.attrSrc = a.attrSrc; o.attrInferred = a.attrSrc === "prefix"; if (a.inferredName) o.inferredName = a.inferredName; } return o; };
async function memGetPoints(col, ids, withVector) { if (!ids.length) return []; return await qx("POST", `/collections/${col}/points`, { ids, with_payload: true, with_vector: !!withVector }); }
const bkFile = id => path.join(MEM_BK, `${MEMCOL}__${String(id).replace(/[^0-9a-zA-Z-]/g, "")}.json`);
function memPruneBackups() {
  let fsx = []; try { fsx = fs.readdirSync(MEM_BK).filter(f => f.endsWith(".json")).map(f => ({ f, t: fs.statSync(path.join(MEM_BK, f)).mtimeMs })).sort((a, b) => b.t - a.t); } catch { return 0; }
  let n = 0; const cut = Date.now() - MEM_BK_DAYS * 864e5;
  fsx.forEach((x, i) => { if (i >= MEM_BK_MAX || x.t < cut) { try { fs.unlinkSync(path.join(MEM_BK, x.f)); n++; } catch {} } });
  return n;
}
async function memDelete(id, reason, dryRun) {
  const [pt] = await memGetPoints(MEMCOL, [id], true); if (!pt) throw httpErr(404, "记忆不存在（可能已删除）");
  if (!Array.isArray(pt.vector) || !pt.vector.length) throw httpErr(500, "取不到向量，为安全起见不删除");
  const ents = (await qx("POST", `/collections/${MEM_ENT}/points/scroll`, { limit: 1000, with_vector: true, with_payload: true, filter: { must: [{ key: "linkedMemoryIds", match: { any: [String(id)] } }] } }).catch(e => { if (/404/.test(e.message)) return { points: [] }; throw e; })).points || [];
  const rec = { v: 1, collection: MEMCOL, entitiesCollection: MEM_ENT, id: pt.id, vector: pt.vector, payload: pt.payload, entities: ents.map(e => ({ id: e.id, vector: e.vector, payload: e.payload })), backedUpAt: Date.now(), reason: String(reason || "").slice(0, 300), vectorDims: pt.vector.length };
  const body = JSON.stringify(rec); const hash = crypto.createHash("sha256").update(body).digest("hex");
  if (dryRun) return { ok: true, dryRun: true, id: pt.id, backup: path.basename(bkFile(pt.id)), backupExists: fs.existsSync(bkFile(pt.id)), entities: ents.length, backupBytes: body.length, vectorDims: pt.vector.length };
  fs.mkdirSync(MEM_BK, { recursive: true, mode: 0o700 }); const f = bkFile(pt.id);
  if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.json$/, `.prev-${Date.now()}.json`));
  atomicWrite(f, body);
  const back = fs.readFileSync(f, "utf8"); if (crypto.createHash("sha256").update(back).digest("hex") !== hash) throw httpErr(500, "备份校验失败，未删除");
  try { const chk = JSON.parse(back); if (chk.vector.length !== pt.vector.length || chk.id !== pt.id) throw 0; } catch { throw httpErr(500, "备份内容校验失败，未删除"); }
  await qx("POST", `/collections/${MEMCOL}/points/delete?wait=true`, { points: [pt.id] });
  let entFixed = 0;
  for (const e of ents) { const ids = (e.payload?.linkedMemoryIds || []).filter(x => String(x) !== String(pt.id)); await qx("POST", `/collections/${MEM_ENT}/points/payload?wait=true`, { payload: { linkedMemoryIds: ids }, points: [e.id] }); entFixed++; }
  dropCache("memidx", "memall"); const pruned = memPruneBackups();
  return { ok: true, id: pt.id, backup: path.basename(f), sha256: hash, entitiesUpdated: entFixed, prunedBackups: pruned };
}
async function memRestore(file) {
  if (!/^[\w-]+__[0-9a-zA-Z-]+(\.prev-\d+)?\.json$/.test(String(file || ""))) throw httpErr(400, "备份文件名无效");
  let rec; try { rec = JSON.parse(fs.readFileSync(path.join(MEM_BK, file), "utf8")); } catch { throw httpErr(404, "备份不存在或损坏"); }
  if (rec.collection !== MEMCOL) throw httpErr(409, `备份属于集合 ${rec.collection}，当前在用 ${MEMCOL}，拒绝还原`);
  if (!Array.isArray(rec.vector) || rec.vector.length !== rec.vectorDims) throw httpErr(500, "备份向量不完整");
  const [cur] = await memGetPoints(MEMCOL, [rec.id], false); if (cur) throw httpErr(409, "这条记忆现在还在库里，不需要还原");
  await qx("PUT", `/collections/${MEMCOL}/points?wait=true`, { points: [{ id: rec.id, vector: rec.vector, payload: rec.payload }] });
  let ent = 0;
  for (const e of rec.entities || []) {
    const [ce] = await memGetPoints(MEM_ENT, [e.id], false);
    if (ce) { const ids = [...new Set([...(ce.payload?.linkedMemoryIds || []).map(String), String(rec.id)])]; await qx("POST", `/collections/${MEM_ENT}/points/payload?wait=true`, { payload: { linkedMemoryIds: ids }, points: [e.id] }); }
    else await qx("PUT", `/collections/${MEM_ENT}/points?wait=true`, { points: [{ id: e.id, vector: e.vector, payload: e.payload }] });
    ent++;
  }
  rec.restoredAt = Date.now(); atomicWrite(path.join(MEM_BK, file), JSON.stringify(rec)); dropCache("memidx", "memall");
  return { ok: true, id: rec.id, entitiesRestored: ent };
}

Object.assign(R, {
  "GET /api/mem/subjects": async () => {
    const map = await memSubjectMap(); const flags = memFlags.load();
    return { collection: MEMCOL, bucket: await memBucketId(), subjects: [...map.values()].map(e => ({ key: e.key, type: e.key.split(":")[0], name: memSubjectName(e.key), count: e.count, attr: e.attr, lastAt: e.lastAt, flagged: e.ids.filter(x => flags[String(x.id)]).length, raw: Object.fromEntries(Object.entries(e.raw).map(([f, m]) => [f, [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([value, count]) => ({ value, count }))])) })).sort((a, b) => b.count - a.count), note: "一条记忆可能同时出现在“人”和“群”下；raw 是原始字段值（最多 20 个）；attr 是各归属来源的条数；unattributed = 未归属（共享库）" };
  },
  "GET /api/mem/list": async u => {
    const key = u.searchParams.get("subject"); need({ subject: key }, "subject"); const map = await memSubjectMap(); const e = map.get(key); if (!e) return { subject: key, total: 0, items: [] };
    const qs = (u.searchParams.get("q") || "").trim().toLowerCase(), onlyFlagged = u.searchParams.get("flagged") === "1";
    let ids = e.ids.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => x.id);
    if (onlyFlagged) { const fl = memFlags.load(); ids = ids.filter(i => fl[String(i)]); }
    const off = Math.max(0, +u.searchParams.get("offset") || 0), lim = qi(u, "limit", 50, 200);
    if (qs) { const all = await memAll(); const hit = new Set(all.filter(m => String(m.data || "").toLowerCase().includes(qs)).map(m => String(m.id))); ids = ids.filter(i => hit.has(String(i))); }
    const page = ids.slice(off, off + lim); const ctx = { n2i: memNameToId(), bucket: await memBucketId() }; const pts = await memGetPoints(MEMCOL, page, false); const byId = new Map(pts.map(p => [String(p.id), p]));
    return { subject: key, name: memSubjectName(key), total: ids.length, offset: off, items: page.map(i => byId.get(String(i))).filter(Boolean).map(pt => memPublic(pt, ctx)) };
  },
  "GET /api/mem/get": async u => { const id = u.searchParams.get("id"); if (!isPointId(id)) throw httpErr(400, "id 无效"); const [pt] = await memGetPoints(MEMCOL, [id], false); if (!pt) throw httpErr(404, "记忆不存在"); return memPublic(pt, { n2i: memNameToId(), bucket: await memBucketId() }); },
  "GET /api/mem/files": async () => { const out = []; const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of es) { if (x.name.startsWith(".")) continue; const p = path.join(d, x.name), r = rel ? rel + "/" + x.name : x.name; if (x.isDirectory()) walk(p, r); else if (x.isFile() && x.name.endsWith(".md")) { const st = fs.statSync(p); out.push({ file: r, size: st.size, mtime: st.mtimeMs }); } } }; walk(MEM_FILES, ""); return { root: "workspace/memory", files: out.sort((a, b) => b.mtime - a.mtime) }; },
  "GET /api/mem/file": async u => { const f = u.searchParams.get("file") || ""; if (!/^[\w./-]+\.md$/.test(f) || f.split("/").some(s => s === ".." || s.startsWith("."))) throw httpErr(400, "文件名无效"); const p = path.join(MEM_FILES, f); let real; try { real = fs.realpathSync(p); } catch { throw httpErr(404, "文件不存在"); } if (!real.startsWith(fs.realpathSync(MEM_FILES) + path.sep)) throw httpErr(403, "拒绝"); const st = fs.statSync(real); if (st.size > 512 * 1024) throw httpErr(413, "文件过大"); return { file: f, size: st.size, mtime: st.mtimeMs, content: fs.readFileSync(real, "utf8") }; },
  "GET /api/mem/flags": async () => ({ flags: memFlags.load() }),
  "POST /api/mem/flag": W("mem.flag", b => `${b.id} ${b.wrong === false ? "unmark" : "mark"}`, async b => {
    if (!isPointId(b.id)) throw httpErr(400, "id 无效"); const f = { ...memFlags.load() }; const k = String(b.id);
    if (b.wrong === false) delete f[k]; else { if (b.note != null && (typeof b.note !== "string" || strLen(b.note) > 500)) throw httpErr(400, "note 最长 500 字"); f[k] = { wrong: true, note: b.note || "", at: Date.now() }; }
    memFlags.save(f); return { ok: true, id: k, flag: f[k] || null };
  }, { confirm: true }),
  "POST /api/mem/delete": W("mem.delete", b => `${b.id}${b.dryRun ? " dry-run" : ""}`, async b => { if (!isPointId(b.id)) throw httpErr(400, "id 无效"); return memDelete(b.id, b.reason, b.dryRun === true); }, { confirm: true }),
  "POST /api/mem/restore": W("mem.restore", b => b.file, async b => memRestore(b.file), { confirm: true }),
  "GET /api/mem/backups": async () => { let fsx = []; try { fsx = fs.readdirSync(MEM_BK).filter(f => f.endsWith(".json")); } catch {} return { retention: { days: MEM_BK_DAYS, maxFiles: MEM_BK_MAX }, backups: fsx.map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(MEM_BK, f), "utf8")); return { file: f, id: r.id, backedUpAt: r.backedUpAt, restoredAt: r.restoredAt || null, reason: r.reason, entities: (r.entities || []).length, preview: String(r.payload?.data || "").slice(0, 80), user_id: r.payload?.user_id ?? null, source_session_key: r.payload?.source_session_key ?? null }; } catch { return { file: f, error: "损坏" }; } }).sort((a, b) => (b.backedUpAt || 0) - (a.backedUpAt || 0)) }; },
});

// ---------- v2.9：原生 CLI（Claude Code / Codex / Gemini），无记忆无人设，完整权限 ----------
// 子进程通过 `sudo -n systemd-run` 启动为独立的瞬态单元（hs-cli-<runId>），跳出控制台自身的 systemd 沙箱，
// 因此权限与 ubuntu 终端一致（可写家目录、可 sudo），控制台本身的 ProtectSystem 加固保持不变。
// CLI_LAUNCH=direct 时直接 spawn（需要 staging/30-native-cli.conf 放开写权限）。
const CLI_HOME = "/home/ubuntu";
const CLI_ROOT = process.env.CLI_ROOT || path.join(CLI_HOME, "cli-sandbox");
const CLI_DATA = path.join(ROOT, "data", "cli");
const CLI_AUDIT = path.join(ROOT, "logs", "cli-audit.log");
const CLI_TIMEOUT = +process.env.CLI_TIMEOUT_MS || 10 * 60e3;
const CLI_MAX_RUNS = +process.env.CLI_MAX_RUNS || 1;
const CLI_MAX_PROMPT = +process.env.CLI_MAX_PROMPT || 32000;
const CLI_LAUNCH = process.env.CLI_LAUNCH || "systemd-run";
const CLI_PATH = `${CLI_HOME}/.npm-global/bin:${CLI_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin`;
const CLI_TOOLS = {
  claude: { name: "Claude Code", bin: `${CLI_HOME}/.local/bin/claude` },
  codex: { name: "Codex", bin: `${CLI_HOME}/.npm-global/bin/codex` },
  gemini: { name: "Gemini CLI", bin: `${CLI_HOME}/.npm-global/bin/gemini` },
  antigravity: { name: "Antigravity", bin: `${CLI_HOME}/.local/bin/agy`, timeout: +process.env.CLI_TIMEOUT_AGY_MS || 15 * 60e3, defaultModel: process.env.AGY_DEFAULT_MODEL || "gemini-3.8-flash-medium" },
};
const cliTimeout = tool => CLI_TOOLS[tool]?.timeout || CLI_TIMEOUT;
const isModelId = s => typeof s === "string" && /^[\w.:-]{1,80}$/.test(s);
let agyModelsCache = null; // agy models：10 分钟缓存
async function agyModels() {
  if (agyModelsCache && agyModelsCache.at > Date.now() - 600e3) return agyModelsCache.v;
  const r = await run1(CLI_TOOLS.antigravity.bin, ["models"], 30000);
  const v = r.ok ? r.out.split("\n").map(l => l.split("\t")).filter(x => x.length >= 2 && isModelId(x[0].trim())).map(([id, name]) => ({ id: id.trim(), name: name.trim() })) : [];
  agyModelsCache = { at: Date.now(), v, ok: r.ok && v.length > 0, err: r.ok ? null : r.out.trim().slice(-300) }; return v;
}
const { spawn } = await import("node:child_process");
const cliRuns = new Map(); // sessionId -> { child, unit, runId, started, cancel }
const isCliId = s => /^[a-f0-9]{16}$/.test(s || "");
const cliMetaFile = id => path.join(CLI_DATA, id + ".json");
const cliMsgFile = id => path.join(CLI_DATA, id + ".jsonl");
function cliAudit(req, o) { try { fs.mkdirSync(path.dirname(CLI_AUDIT), { recursive: true, mode: 0o700 }); fs.appendFileSync(CLI_AUDIT, JSON.stringify({ t: new Date().toISOString(), ip: req ? ipOf(req) : "", ...o }) + "\n", { mode: 0o600 }); } catch {} }
const cliLoad = id => { try { return JSON.parse(fs.readFileSync(cliMetaFile(id), "utf8")); } catch { return null; } };
const cliDeleted = new Set(); // 已删除会话：运行中的进程收尾时不再写回
const cliSave = m => cliDeleted.has(m.id) ? null : atomicWrite(cliMetaFile(m.id), JSON.stringify(m));
const cliPush = (id, msg) => { if (cliDeleted.has(id)) return; fs.mkdirSync(CLI_DATA, { recursive: true, mode: 0o700 }); fs.appendFileSync(cliMsgFile(id), JSON.stringify(msg) + "\n", { mode: 0o600 }); };
const cliPub = m => ({ id: m.id, tool: m.tool, title: m.title, model: m.model || null, createdAt: m.createdAt, updatedAt: m.updatedAt, running: cliRuns.has(m.id) });
// 干净的环境：不继承控制台的 LOGIN_HASH / MiMo 密钥 / OPENCLAW_* 等
const cliEnv = () => ({ HOME: CLI_HOME, USER: "ubuntu", LOGNAME: "ubuntu", SHELL: "/bin/bash", PATH: CLI_PATH, LANG: "C.UTF-8", TERM: "dumb", NO_COLOR: "1", GEMINI_CLI_TRUST_WORKSPACE: "true" });
const run1 = (cmd, args, ms = 8000) => new Promise(r => execFile(cmd, args, { timeout: ms, env: cliEnv(), cwd: "/tmp" }, (e, so, se) => r({ ok: !e, out: String(so || "") + String(se || "") })));
let cliToolsCache = null;
async function cliTools(force) {
  if (!force && cliToolsCache && cliToolsCache.at > Date.now() - 60e3) return cliToolsCache.v;
  const v = await Promise.all(Object.entries(CLI_TOOLS).map(async ([id, t]) => {
    if (id === "gemini") return { id, name: t.name, version: fs.existsSync(t.bin) ? "0.63.0" : null, available: false, authed: false, reason: "Google 已于 2026-06-18 停止个人账号登录 Gemini CLI（IneligibleTierError），请改用 Antigravity", models: [] };
    const available = fs.existsSync(t.bin); if (!available) return { id, name: t.name, version: null, available: false, authed: false, reason: "未安装", models: [] };
    const ver = await run1(t.bin, ["--version"]); const version = (ver.out.match(/\d+\.\d+\.\d+[\w.-]*/) || [null])[0];
    let authed = false, reason = null;
    if (id === "claude") { authed = fs.existsSync(`${CLI_HOME}/.claude/.credentials.json`) || fs.existsSync(`${CLI_HOME}/.claude.json`); reason = authed ? null : "未登录（在服务器上运行 claude 登录）"; }
    if (id === "codex") { const s = await run1(t.bin, ["login", "status"]); authed = s.ok && !/not logged in/i.test(s.out); reason = authed ? null : "未登录（在服务器上运行 codex login）"; }
    if (id === "gemini") { authed = false; reason = "Google 拒绝登录：IneligibleTierError（免费版 Code Assist 个人 OAuth 已不再支持，需改用 API Key 或付费账号）"; if (process.env.GEMINI_API_KEY_FILE && fs.existsSync(process.env.GEMINI_API_KEY_FILE)) { authed = true; reason = null; } }
    let models = [];
    if (id === "antigravity") { models = await agyModels(); authed = agyModelsCache.ok; reason = authed ? null : "未登录或拉不到模型列表" + (agyModelsCache.err ? "：" + agyModelsCache.err : "（在服务器上运行 agy 登录）"); }
    return { id, name: t.name, version, available, authed, reason, models, ...(t.defaultModel ? { defaultModel: t.defaultModel } : {}) };
  }));
  cliToolsCache = { at: Date.now(), v }; return v;
}
function cliArgs(m, prompt) {
  if (m.tool === "antigravity") return ["-p", prompt, "--output-format", "stream-json", "--dangerously-skip-permissions", "--disable-slash-commands", "--model", m.model || CLI_TOOLS.antigravity.defaultModel, ...(m.cliSessionId ? ["--conversation", m.cliSessionId] : [])];
  const mm = m.model ? [m.tool === "claude" ? "--model" : "-m", m.model] : [];
  const a = cliArgs0(m, prompt); if (m.tool === "codex" && mm.length) a.splice(a.length - 1, 0, ...mm); else a.push(...mm); return a;
}
function cliArgs0(m, prompt) {
  if (m.tool === "claude") return ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", ...(m.cliSessionId ? ["--resume", m.cliSessionId] : [])];
  if (m.tool === "codex") return m.cliSessionId ? ["exec", "resume", m.cliSessionId, "--json", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", prompt] : ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", prompt];
  if (m.tool === "gemini") return ["-p", prompt, "--yolo", "--skip-trust", "--output-format", "stream-json", ...(m.cliSessionId ? ["--resume", "latest"] : [])];
}
const txt = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x?.text ?? (typeof x === "string" ? x : "")).join("") : c == null ? "" : JSON.stringify(c);
// 每行 JSON → 统一事件 [{type:'delta'|'tool'|'session'|'error', ...}]
function cliParse(tool, o, st) {
  const ev = [];
  if (tool === "claude") {
    if (o.type === "system" && o.subtype === "init" && o.session_id) ev.push({ type: "session", id: o.session_id });
    if (o.type === "assistant") for (const b of o.message?.content || []) { if (b.type === "text" && b.text) ev.push({ type: "delta", text: b.text }); if (b.type === "tool_use") st.pend.set(b.id, { name: b.name, input: b.input }); }
    if (o.type === "user") for (const b of o.message?.content || []) if (b.type === "tool_result") { const p = st.pend.get(b.tool_use_id) || { name: "tool", input: null }; st.pend.delete(b.tool_use_id); ev.push({ type: "tool", name: p.name, input: p.input, output: txt(b.content).slice(0, 20000) }); }
    if (o.type === "result" && o.is_error) ev.push({ type: "error", message: String(o.result || o.subtype || "失败").slice(0, 2000) });
  } else if (tool === "codex") {
    if (o.type === "thread.started" && o.thread_id) ev.push({ type: "session", id: o.thread_id });
    const it = o.item; if (o.type === "item.completed" && it) {
      if (it.type === "agent_message") ev.push({ type: "delta", text: it.text || "" });
      else if (it.type === "command_execution") ev.push({ type: "tool", name: "shell", input: it.command, output: String(it.aggregated_output ?? "").slice(0, 20000) });
      else if (it.type === "file_change") ev.push({ type: "tool", name: "file_change", input: it.changes, output: it.status || "" });
      else if (it.type === "mcp_tool_call" || it.type === "web_search") ev.push({ type: "tool", name: it.tool || it.type, input: it.arguments || it.query, output: txt(it.result).slice(0, 20000) });
      else if (it.type === "error" && !/^(Reconnecting|Falling back)/.test(it.message || "")) ev.push({ type: "error", message: it.message });
    }
    if ((o.type === "turn.failed" || o.type === "error") && !/^(Reconnecting|Falling back)/.test(o.error?.message || o.message || "")) ev.push({ type: "error", message: String(o.error?.message || o.message || "失败").slice(0, 2000) });
  } else if (tool === "antigravity") {
    if (o.event === "init" && o.conversation_id) ev.push({ type: "session", id: o.conversation_id });
    const su = o.step_update;
    if (o.event === "step_update" && su) {
      if (su.step_type === "agent_response" && su.text_delta) ev.push({ type: "delta", text: su.text_delta });
      if (su.step_type === "tool" && su.state === "DONE") { const ti = su.tool_info || {}; ev.push({ type: "tool", name: su.tool_name || ti.name || "tool", input: ti.parameters ?? null, output: txt(ti.output ?? ti.error ?? "").slice(0, 20000) }); }
      if (su.state === "ERROR" || su.state === "FAILED") ev.push({ type: "error", message: String(su.error?.message || su.error || `${su.step_type || "step"} 失败`).slice(0, 2000) });
    }
    if (o.event === "result" && o.result && o.result.status !== "SUCCESS") ev.push({ type: "error", message: String(o.result.error?.message || o.result.error || o.result.response || o.result.status).slice(0, 2000) });
  } else if (tool === "gemini") {
    if (o.type === "init" && o.session_id) ev.push({ type: "session", id: o.session_id });
    if (o.type === "message" && o.role === "assistant" && o.content) ev.push({ type: "delta", text: o.content });
    if (o.type === "tool_use") st.pend.set(o.tool_id, { name: o.tool_name, input: o.parameters });
    if (o.type === "tool_result") { const p = st.pend.get(o.tool_id) || { name: "tool", input: null }; st.pend.delete(o.tool_id); ev.push({ type: "tool", name: p.name, input: p.input, output: txt(o.output ?? o.error?.message).slice(0, 20000) }); }
    if (o.type === "error" || (o.type === "result" && o.status === "error")) ev.push({ type: "error", message: String(o.message || o.error?.message || "失败").slice(0, 2000) });
  }
  return ev;
}
async function cliRun(req, res, id) {
  const m = cliLoad(id); if (!m) return send(res, 404, { error: "会话不存在" });
  const b = await body(req); const hasAtt = Array.isArray(b.attachments) && b.attachments.length > 0;
  if (Array.isArray(b.attachments) && b.attachments.length > UP_MAX_PER_MSG) return send(res, 400, { error: `每条最多 ${UP_MAX_PER_MSG} 个附件`, code: "too_many_attachments" });
  let prompt = typeof b.prompt === "string" ? b.prompt : ""; if (!prompt.trim() && hasAtt) prompt = "请看看我上传的附件。";
  if (!prompt.trim()) return send(res, 400, { error: "缺少参数：prompt" });
  if (strLen(prompt) > CLI_MAX_PROMPT) return send(res, 413, { error: `prompt 最长 ${CLI_MAX_PROMPT} 字` });
  if (cliRuns.has(id)) return send(res, 409, { error: "这个会话正在运行" });
  if (cliRuns.size >= CLI_MAX_RUNS) return send(res, 429, { error: `同时只能运行 ${CLI_MAX_RUNS} 个` });
  let ups; try { ups = upResolve(b.attachments, "cli", id); } catch (e) { return send(res, e.http || 400, { error: e.message }); }
  const t = (await cliTools()).find(x => x.id === m.tool); if (!t?.available) return send(res, 409, { error: t?.reason || `${m.tool} 未安装`, code: "not_installed" }); if (!t.authed) return send(res, 409, { error: t.reason || `${m.tool} 未登录`, code: "not_authed" });
  const dir = path.join(CLI_ROOT, id); const runId = crypto.randomBytes(6).toString("hex"); const unit = `hs-cli-${runId}`;
  upMarkAttached(ups); const files = ups.map(x => ({ up: x, src: upFile(x), rel: `uploads/${x.id.slice(0, 6)}-${x.name}` }));
  const imgs = files.filter(f => f.up.kind === "image");
  const fullPrompt = files.length ? `${prompt}\n\n[用户上传的附件，已放在当前工作目录下]\n${files.map(f => `- ${f.rel}（${f.up.mime}，${f.up.size} 字节）`).join("\n")}` : prompt;
  const claudeImgs = m.tool === "claude" ? imgs.filter(f => f.up.size <= 5 * 1024 * 1024) : [];
  let args = cliArgs(m, fullPrompt), stdinData = null; const bin = CLI_TOOLS[m.tool].bin; const started = Date.now();
  if (claudeImgs.length) { // Claude：stream-json 输入，图片以 base64 内容块直接给模型
    const i = args.indexOf("-p"); args.splice(i, 2, "-p", "--input-format", "stream-json");
    stdinData = JSON.stringify({ type: "user", message: { role: "user", content: [...claudeImgs.map(f => ({ type: "image", source: { type: "base64", media_type: f.up.mime, data: fs.readFileSync(f.src).toString("base64") } })), { type: "text", text: fullPrompt }] } }) + "\n";
  }
  if (m.tool === "codex" && imgs.length) args.splice(args.length - 1, 0, ...imgs.map(f => `--image=${f.rel}`));
  let child;
  const stdio = [stdinData ? "pipe" : "ignore", "pipe", "pipe"];
  if (CLI_LAUNCH === "direct") { fs.mkdirSync(path.join(dir, "uploads"), { recursive: true, mode: 0o700 }); for (const f of files) fs.copyFileSync(f.src, path.join(dir, f.rel)); child = spawn(bin, args, { cwd: dir, env: cliEnv(), detached: true, stdio }); }
  else child = spawn("sudo", ["-n", "/usr/bin/systemd-run", "--quiet", "--collect", "--wait", "--pipe", "--uid=ubuntu", "--gid=ubuntu", `--unit=${unit}`, `-p`, `RuntimeMaxSec=${Math.ceil(cliTimeout(m.tool) / 1000) + 30}`, ...Object.entries(cliEnv()).map(([k, v]) => `--setenv=${k}=${v}`), "/bin/bash", "-c", 'd=$0; n=$1; shift; mkdir -p -m 700 "$d/uploads" && cd "$d" || exit 97; while [ "$n" -gt 0 ]; do cp -f -- "$1" "$2" || exit 98; shift 2; n=$((n-1)); done; exec "$@"', dir, String(files.length), ...files.flatMap(f => [f.src, f.rel]), bin, ...args], { env: { PATH: CLI_PATH }, detached: true, stdio });
  if (stdinData) { child.stdin.on("error", () => {}); child.stdin.end(stdinData); }
  const run = { child, unit, runId, started, reason: null }; cliRuns.set(id, run);
  const kill = why => { if (run.reason) return; run.reason = why; if (CLI_LAUNCH !== "direct") execFile("sudo", ["-n", "/usr/bin/systemctl", "kill", "--signal=SIGKILL", unit], () => {}); try { process.kill(-child.pid, "SIGTERM"); } catch {} setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000).unref(); };
  run.cancel = () => kill("cancelled");
  const TMO = cliTimeout(m.tool); const timer = setTimeout(() => kill("timeout"), TMO);
  m.updatedAt = Date.now(); if (m.title === "新会话") m.title = prompt.replace(/\s+/g, " ").slice(0, 40); cliSave(m);
  cliPush(id, { role: "user", text: prompt, ts: started, ...(files.length ? { attachments: files.map(f => ({ ...upPub(f.up), path: f.rel })) } : {}) });
  cliAudit(req, { ev: "start", session: id, tool: m.tool, model: m.model || null, runId, prompt: prompt.slice(0, 4000), promptLen: strLen(prompt), ...(files.length ? { attachments: files.map(f => `${f.up.id} ${f.up.name} ${f.up.size}B ${f.up.mime}`) } : {}) });
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", connection: "keep-alive" });
  let open = true; res.on("close", () => { open = false; }); // 断开不杀进程：结果照样写进会话记录
  const sse = (event, data) => { if (open) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const ping = setInterval(() => { if (open) res.write(": ping\n\n"); }, 15e3);
  sse("start", { sessionId: id, runId, tool: m.tool, ts: started });
  const st = { pend: new Map() }; let answer = "", buf = "", errTail = "";
  const flushAns = () => { if (answer) { cliPush(id, { role: "assistant", text: answer, ts: Date.now() }); answer = ""; } };
  const onLine = line => {
    if (!line.trim()) return; let o; try { o = JSON.parse(line); } catch { errTail = (errTail + line + "\n").slice(-4000); return; }
    for (const e of cliParse(m.tool, o, st)) {
      if (e.type === "session") { if (!m.cliSessionId) { m.cliSessionId = e.id; cliSave(m); } }
      else if (e.type === "delta") { answer += e.text; sse("delta", { text: e.text }); }
      else if (e.type === "tool") { e.name = String(e.name || "tool"); e.input = e.input == null ? "" : typeof e.input === "string" ? e.input : JSON.stringify(e.input); e.output = e.output == null ? "" : String(e.output); flushAns(); cliPush(id, { role: "tool", text: `${e.name}: ${e.input}\n${e.output}`.slice(0, 20000), name: e.name, input: e.input, output: e.output, ts: Date.now() }); sse("tool", { name: e.name, input: e.input, output: e.output }); }
      else if (e.type === "error") { flushAns(); cliPush(id, { role: "error", text: e.message, ts: Date.now() }); sse("error", { message: e.message }); }
    }
  };
  child.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  child.stderr.on("data", d => { errTail = (errTail + d).slice(-4000); });
  child.on("close", (code, sig) => {
    clearTimeout(timer); clearInterval(ping); if (buf) onLine(buf); flushAns(); cliRuns.delete(id);
    const durationMs = Date.now() - started, exitCode = code ?? null;
    if (!run.reason && exitCode !== 0) { const msg = run.reason === "timeout" ? `超时（${TMO >= 60e3 ? Math.round(TMO / 60e3) + " 分钟" : Math.round(TMO / 1000) + " 秒"}）已终止` : run.reason === "cancelled" ? "已取消" : `退出码 ${exitCode}${sig ? " " + sig : ""}${errTail.trim() ? "：" + errTail.trim().slice(-1500) : ""}`; cliPush(id, { role: "error", text: msg, ts: Date.now() }); sse("error", { message: msg }); }
    m.updatedAt = Date.now(); cliSave(m);
    cliAudit(req, { ev: "end", session: id, tool: m.tool, runId, exitCode, signal: sig, reason: run.reason, durationMs });
    sse("done", { exitCode, durationMs, ...(run.reason ? { reason: run.reason } : {}) }); if (open) res.end();
  });
  child.on("error", e => { cliPush(id, { role: "error", text: "启动失败：" + e.message, ts: Date.now() }); sse("error", { message: "启动失败：" + e.message }); });
}
async function cliRoute(req, res, u) {
  const p = u.pathname, M = req.method; let mt;
  if (p === "/api/cli/tools" && M === "GET") return send(res, 200, await cliTools(u.searchParams.get("refresh") === "1"));
  if (p === "/api/cli/sessions" && M === "GET") { let fsx = []; try { fsx = fs.readdirSync(CLI_DATA).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch {} return send(res, 200, fsx.map(f => cliLoad(f.slice(0, 16))).filter(Boolean).map(cliPub).sort((a, b) => b.updatedAt - a.updatedAt)); }
  if (p === "/api/cli/sessions" && M === "POST") { const b = await body(req); if (!CLI_TOOLS[b.tool]) return send(res, 400, { error: "tool 只能是 claude / codex / gemini / antigravity" });
    { const t = (await cliTools()).find(x => x.id === b.tool); if (!t?.available) return send(res, 409, { error: t?.reason || "未安装", code: "not_installed" }); }
    let model = null; if (b.model != null && b.model !== "") { if (!isModelId(b.model)) return send(res, 400, { error: "model 无效" }); if (b.tool === "antigravity") { const ms = await agyModels(); if (ms.length && !ms.some(x => x.id === b.model)) return send(res, 400, { error: "Antigravity 没有这个模型：" + b.model }); } model = b.model; }
    if (b.tool === "antigravity" && !model) model = CLI_TOOLS.antigravity.defaultModel;
    const now = Date.now(); const m = { id: crypto.randomBytes(8).toString("hex"), tool: b.tool, title: typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, 60) : "新会话", createdAt: now, updatedAt: now, cliSessionId: null, model }; cliSave(m); cliAudit(req, { ev: "create", session: m.id, tool: m.tool, model }); return send(res, 200, cliPub(m)); }
  if ((mt = /^\/api\/cli\/sessions\/([a-f0-9]{16})(\/run|\/cancel)?$/.exec(p))) {
    const id = mt[1], act = mt[2];
    if (!act && M === "GET") { const m = cliLoad(id); if (!m) return send(res, 404, { error: "会话不存在" }); let msgs = []; try { msgs = fs.readFileSync(cliMsgFile(id), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)); } catch {} return send(res, 200, { session: cliPub(m), messages: msgs }); }
    if (!act && M === "DELETE") { req.resume(); const m = cliLoad(id); if (!m) return send(res, 404, { error: "会话不存在" }); cliDeleted.add(id); cliRuns.get(id)?.cancel(); for (const f of [cliMetaFile(id), cliMsgFile(id)]) fs.rmSync(f, { force: true }); try { for (const d of fs.readdirSync(UP_DIR)) { const um = upMeta(d); if (um?.scope === "cli" && um.session === id) fs.rmSync(path.join(UP_DIR, d), { recursive: true, force: true }); } } catch {} cliAudit(req, { ev: "delete", session: id, tool: m.tool }); return send(res, 200, { ok: true }); }
    if (act === "/run" && M === "POST") return cliRun(req, res, id);
    if (act === "/cancel" && M === "POST") { const r = cliRuns.get(id); if (!r) return send(res, 409, { error: "没有在运行" }); r.cancel(); cliAudit(req, { ev: "cancel", session: id, runId: r.runId }); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: "接口不存在" });
}

// ---------- v2.10：上传文件 / 图片（聊天页 + 原生 CLI 页） ----------
// 原始请求体流式写盘（不走 JSON/base64）；文件存在 data/uploads/<id>/，meta.json 记录类型与归属。
const UP_DIR = path.join(ROOT, "data", "uploads");
const UP_MAX = +process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024;
const UP_TTL = (+process.env.UPLOAD_TTL_DAYS || 30) * 864e5;
const UP_MAX_PER_MSG = 10;
const CHAT_IMG_MAX = 6 * 1024 * 1024; // 网关 agent-hydration 上限
const isUpId = s => /^[a-f0-9]{24}$/.test(s || "");
const safeName = n => { let s = String(n || "").split(/[\\/]/).pop().normalize("NFC").replace(/[\u0000-\u001f\u007f"'`$<>|:*?\\]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, ""); if (!s) s = "file"; if ([...s].length > 100) { const e = path.extname(s).slice(0, 12); s = [...s].slice(0, 100 - e.length).join("") + e; } return s; };
const UP_EXT_MIME = { ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv", ".json": "application/json", ".log": "text/plain", ".py": "text/x-python", ".js": "text/javascript", ".ts": "text/plain", ".html": "text/html", ".xml": "application/xml", ".yaml": "text/yaml", ".yml": "text/yaml", ".sh": "text/x-shellscript" };
function upSniff(buf, name) {
  const img = sniff(buf); if (img) return { mime: img === "jpg" ? "image/jpeg" : "image/" + img, kind: "image" };
  const h = buf.toString("latin1", 0, 8);
  if (h.startsWith("%PDF-")) return { mime: "application/pdf", kind: "file" };
  if (h.startsWith("PK\u0003\u0004")) { const e = path.extname(name).toLowerCase(); return { mime: { ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation" }[e] || "application/zip", kind: "file" }; }
  if (h.startsWith("\u001f\u008b")) return { mime: "application/gzip", kind: "file" };
  if (/^(ID3|OggS|fLaC)/.test(h) || h.startsWith("RIFF") && buf.toString("latin1", 8, 12) === "WAVE") return { mime: h.startsWith("ID3") ? "audio/mpeg" : h.startsWith("OggS") ? "audio/ogg" : h.startsWith("fLaC") ? "audio/flac" : "audio/wav", kind: "file" };
  if (buf.toString("latin1", 4, 8) === "ftyp") return { mime: "video/mp4", kind: "file" };
  const head = buf.subarray(0, 64 * 1024); let text = !head.includes(0); if (text) try { new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(0, head.length - 4 > 0 ? head.length - 4 : head.length)); } catch { text = false; }
  if (text) return { mime: UP_EXT_MIME[path.extname(name).toLowerCase()] || "text/plain", kind: "file" };
  return { mime: "application/octet-stream", kind: "file" };
}
const upMeta = id => { if (!isUpId(id)) return null; try { return JSON.parse(fs.readFileSync(path.join(UP_DIR, id, "meta.json"), "utf8")); } catch { return null; } };
const upFile = m => path.join(UP_DIR, m.id, "f");
const upPub = m => ({ id: m.id, name: m.name, mime: m.mime, kind: m.kind, size: m.size, url: `/api/uploads/${m.id}`, createdAt: m.createdAt, attachedAt: m.attachedAt || null, expiresAt: (m.attachedAt || m.createdAt) + (m.attachedAt ? UP_TTL : UP_TTL_UNATTACHED) });
async function upReceive(req, u) {
  const scope = u.searchParams.get("scope"), session = u.searchParams.get("session") || null;
  if (scope !== "chat" && scope !== "cli") throw httpErr(400, "scope 只能是 chat / cli");
  if (scope === "cli" && (!isCliId(session) || !cliLoad(session))) throw httpErr(404, "CLI 会话不存在");
  if (scope === "chat" && (!session || session.length > 300)) throw httpErr(400, "缺少参数：session（会话 key）");
  const name = safeName(u.searchParams.get("name") || req.headers["x-filename"] && decodeURIComponent(String(req.headers["x-filename"])));
  const len = +req.headers["content-length"]; if (len > UP_MAX) { req.resume(); throw httpErr(413, `文件不能超过 ${Math.round(UP_MAX / 1048576)}MB`); }
  const id = crypto.randomBytes(12).toString("hex"), dir = path.join(UP_DIR, id); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, "f"), out = fs.createWriteStream(f, { mode: 0o600 }); const hash = crypto.createHash("sha256"); let n = 0, head = [];
  try {
    await new Promise((r, j) => {
      req.on("data", c => { n += c.length; if (n > UP_MAX) { j(httpErr(413, `文件不能超过 ${Math.round(UP_MAX / 1048576)}MB`)); req.destroy(); return; } hash.update(c); if (head.reduce((a, b) => a + b.length, 0) < 65536) head.push(c); if (!out.write(c)) { req.pause(); out.once("drain", () => req.resume()); } });
      req.on("end", () => out.end(r)); req.on("error", j); req.on("aborted", () => j(httpErr(400, "上传中断")));
    });
    if (!n) throw httpErr(400, "空文件");
  } catch (e) { out.destroy(); fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  const { mime, kind } = upSniff(Buffer.concat(head), name);
  const m = { id, scope, session, name, mime, kind, size: n, sha256: hash.digest("hex"), createdAt: Date.now() };
  atomicWrite(path.join(dir, "meta.json"), JSON.stringify(m)); return upPub(m);
}
const UP_TTL_UNATTACHED = (+process.env.UPLOAD_TTL_UNATTACHED_HOURS || 24) * 3600e3;
function upMarkAttached(ups) { const t = Date.now(); for (const m of ups) if (!m.attachedAt) { m.attachedAt = t; try { atomicWrite(path.join(UP_DIR, m.id, "meta.json"), JSON.stringify(m)); } catch {} } }
const upExpired = (m, now) => m.attachedAt ? m.attachedAt + UP_TTL < now : m.createdAt + UP_TTL_UNATTACHED < now;
const upSweep = () => { try { const now = Date.now(); for (const d of fs.readdirSync(UP_DIR)) { const m = upMeta(d); if (!m || upExpired(m, now)) fs.rmSync(path.join(UP_DIR, d), { recursive: true, force: true }); } } catch {} };
setTimeout(upSweep, 60e3).unref();
setInterval(() => { try { const now = Date.now(); for (const d of fs.readdirSync(UP_DIR)) { const m = upMeta(d); if (!m || upExpired(m, now)) fs.rmSync(path.join(UP_DIR, d), { recursive: true, force: true }); } } catch {} }, 3600e3).unref();
// 取一组上传，校验归属
function upResolve(ids, scope, session) {
  if (ids == null) return []; if (!Array.isArray(ids)) throw httpErr(400, "attachments 需为上传 id 数组"); if (ids.length > UP_MAX_PER_MSG) throw Object.assign(httpErr(400, `每条最多 ${UP_MAX_PER_MSG} 个附件`), { code: "too_many_attachments" });
  return ids.map(id => { const m = upMeta(id); if (!m || !fs.existsSync(upFile(m)) || upExpired(m, Date.now())) throw httpErr(404, "上传不存在或已过期：" + id); if (m.scope !== scope || (scope === "cli" ? m.session !== session : false)) throw httpErr(403, "这个上传不属于当前会话"); return m; });
}
// 控制台发出的附件索引：网关 chat.history 的用户消息里不带附件信息，这里按 会话+时间+文本 合并回去
const CHAT_ATT_IDX = path.join(ROOT, "data", "chat-attachments.jsonl");
const chatAttIdx = {
  add(rec) { try { fs.mkdirSync(path.dirname(CHAT_ATT_IDX), { recursive: true, mode: 0o700 }); fs.appendFileSync(CHAT_ATT_IDX, JSON.stringify(rec) + "\n", { mode: 0o600 }); } catch {} },
  load(key) { try { return fs.readFileSync(CHAT_ATT_IDX, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(x => x && x.key === key); } catch { return []; } },
  // 1) 稳定 id：用户消息上的 idempotencyKey / runId（网关已提交的消息带 __openclaw.idempotencyKey/runId）
  // 2) 兜底（仅限没有 idempotencyKey 的消息）：一对一匹配——文本完全相同、时间差 ≤ 5 秒、取时间最接近的记录，每条记录最多用一次
  merge(key, msgs) {
    const recs = this.load(key); if (!recs.length) return msgs; const usedRec = new Set(), usedMsg = new Set(); const hit = new Map();
    const byIdem = new Map(), byRun = new Map(); recs.forEach((x, i) => { if (x.idem) byIdem.set(x.idem, i); if (x.runId) byRun.set(x.runId, i); });
    msgs.forEach((m, j) => { if (m.role !== "user") return; const ik = String(m.idempotencyKey || "").replace(/:user$/, ""); const i = byIdem.get(ik) ?? byRun.get(m.runId) ?? byRun.get(ik); if (i != null && !usedRec.has(i)) { usedRec.add(i); usedMsg.add(j); hit.set(j, recs[i]); } });
    const norm = m => (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter(c => c?.type === "text").map(c => c.text || "").join("") : "").trim();
    msgs.forEach((m, j) => { if (m.role !== "user" || usedMsg.has(j) || m.idempotencyKey) return; const t = norm(m); let best = -1, bd = 5e3 + 1; recs.forEach((x, i) => { const d = Math.abs((m.ts || 0) - x.ts); if (!usedRec.has(i) && d < bd && String(x.text || "").trim() === t) { best = i; bd = d; } }); if (best >= 0) { usedRec.add(best); usedMsg.add(j); hit.set(j, recs[best]); } });
    // 3) 网关把“忙时排队”的多条消息合并成一条 followup-collect 用户消息：把文本出现在其中、且在它之前 120 秒内发出的未匹配记录全部挂上
    msgs.forEach((m, j) => { if (m.role !== "user" || usedMsg.has(j) || !/^followup-collect:/.test(String(m.idempotencyKey || ""))) return; const t = norm(m); const xs = recs.filter((x, i) => !usedRec.has(i) && x.ts <= (m.ts || 0) + 5e3 && x.ts >= (m.ts || 0) - 120e3 && x.text.trim() && t.includes(x.text.trim()) && (usedRec.add(i), true)); if (xs.length) { usedMsg.add(j); hit.set(j, { ids: xs.flatMap(x => x.ids) }); } });
    return msgs.map((m, j) => { const rec = hit.get(j); if (!rec) return m; return { ...m, attachments: rec.ids.map(id => { const um = upMeta(id); return um ? upPub(um) : { id, expired: true }; }) }; });
  },
};
// 聊天：按网关原生方式随 chat.send 发送（图片内联，其他文件由网关存入媒体库并在消息里附 [media attached: …]）
function chatAttachments(ups) {
  const maxPayload = +gwHello?.policy?.maxPayload || 25 * 1024 * 1024, maxBytes = +gwHello?.policy?.attachments?.maxBytes || 20 * 1024 * 1024, maxImg = +gwHello?.policy?.attachments?.maxImageBytes || CHAT_IMG_MAX;
  let total = 0; const out = ups.map(m => {
    if (m.kind === "image" && m.size > maxImg) throw httpErr(413, `图片 ${m.name} 超过网关上限 ${Math.round(maxImg / 1048576)}MB`);
    if (m.size > maxBytes) throw httpErr(413, `文件 ${m.name} 超过网关上限 ${Math.round(maxBytes / 1048576)}MB`);
    const content = fs.readFileSync(upFile(m)).toString("base64"); total += content.length + 512;
    return { type: m.kind === "image" ? "image" : "file", mimeType: m.mime, fileName: m.name, origin: "file", sizeBytes: m.size, content };
  });
  if (total > maxPayload - 256 * 1024) throw httpErr(413, `附件合计太大（base64 后约 ${Math.round(total / 1048576)}MB，网关单帧上限 ${Math.round(maxPayload / 1048576)}MB）`);
  return out;
}
async function upRoute(req, res, u) {
  if (u.pathname === "/api/uploads" && req.method === "POST") { try { const r = await upReceive(req, u); opLog(req, "uploads.put", `${r.id} ${u.searchParams.get("scope")}:${u.searchParams.get("session")} ${r.name} ${r.size}B ${r.mime}`, true); return send(res, 200, r); } catch (e) { opLog(req, "uploads.put", `${u.searchParams.get("scope")}:${u.searchParams.get("session")} ${u.searchParams.get("name")}`, false, e.message); return send(res, e.http || 500, { error: e.message, code: e.http === 413 ? "too_large" : undefined }); } }
  if (u.pathname === "/api/uploads/limits" && req.method === "GET") { try { await connect(); } catch {} const p = gwHello?.policy || {}; return send(res, 200, { maxBytes: UP_MAX, maxPerMessage: UP_MAX_PER_MSG, ttlDays: UP_TTL / 864e5, chat: { maxBytes: Math.min(UP_MAX, +p.attachments?.maxBytes || 20971520), maxImageBytes: +p.attachments?.maxImageBytes || CHAT_IMG_MAX, maxPayload: +p.maxPayload || 26214400, fromGateway: !!p.attachments }, cli: { maxBytes: UP_MAX, claudeInlineImageMax: 5242880 } }); }
  const mt = /^\/api\/uploads\/([a-f0-9]{24})$/.exec(u.pathname); const m = mt && upMeta(mt[1]); if (!m) return send(res, 404, { error: "上传不存在或已过期" });
  if (req.method === "GET") { const f = upFile(m); const inl = u.searchParams.get("download") !== "1"; return fs.createReadStream(f).on("error", () => send(res, 404, {})).once("open", function () { res.writeHead(200, mediaHeaders(inl ? m.mime : "application/octet-stream", m.name, m.size)); this.pipe(res); }); }
  if (req.method === "DELETE") { req.resume(); fs.rmSync(path.join(UP_DIR, m.id), { recursive: true, force: true }); opLog(req, "uploads.delete", m.id, true); return send(res, 200, { ok: true }); }
  return send(res, 404, { error: "接口不存在" });
}

// ---------- v2.12：小脾气参数（记仇小本本 / 群梗回旋镖 / 吃醋；写 workspace/fun：params.json / grudges.json / gags.json / .trash/；需要单元 drop-in 40-fun-rw.conf） ----------
// 注意：消费这些参数的技能、脚本和 gate 补丁还没做；在它们上线前，这里只负责存设置，不改变星野的行为。
const FUN_DIR = process.env.HS_FUN_DIR || path.join(WORKSPACE, "fun");
const FUN_TRASH = path.join(FUN_DIR, ".trash");
const FUN_GK = /^group:[0-9a-f]{32}$/;
const FUN_PID = /^[0-9A-F]{32}$/;
const FUN_FEATS = ["grudge", "gag", "jealousy", "lexicon"];
const FUN_DEFAULTS = {
  enabled: false, killPhrase: "星野正经点", killOwnerOnly: true, optOutAllPhrase: "别整我", optOut: {},
  grudge: { enabled: false, defaultEnabled: false, perGroup: {}, recallProbability: 0.10, recallCooldownDays: 7, maxEntriesPerPerson: 20, maxQuoteChars: 40, optOutPhrase: "别记我仇", clearPhrase: "撕本本" },
  gag: { enabled: false, defaultEnabled: false, perGroup: {}, minScore: 4, minDistinctPeople: 2, windowMin: 3, requireApproval: true, cooldownDays: 3, maxUses: 5, perGroupDailyCap: 2, optOutPhrase: "别拿我的话玩梗", deletePhrase: "这梗删了" },
  jealousy: { enabled: false, tierA: true, tierB: false, tierBProbability: 0.3, defaultEnabled: false, perGroup: {}, otherBots: [{ id: "A6902CCDF6FD63D47AC7B9A6BD44E201", name: "芙宁娜" }], perPersonDailyCap: 1, personCooldownMin: 30, groupCooldownMin: 120, optOutPhrase: "星野别吃醋" },
  lexicon: { enabled: false, defaultEnabled: false, perGroup: {}, maxSlang: 3, maxNames: 3, includeDerogatory: false },
};
// 类型：b=布尔 p=0–1 i:min:max=整数 s:max=非空短文本
const FUN_SPEC = {
  grudge: { enabled: "b", defaultEnabled: "b", recallProbability: "p", recallCooldownDays: "i:1:365", maxEntriesPerPerson: "i:1:200", maxQuoteChars: "i:10:200", optOutPhrase: "s:20", clearPhrase: "s:20" },
  gag: { enabled: "b", defaultEnabled: "b", minScore: "i:1:50", minDistinctPeople: "i:1:20", windowMin: "i:1:60", requireApproval: "b", cooldownDays: "i:0:365", maxUses: "i:1:100", perGroupDailyCap: "i:0:50", optOutPhrase: "s:20", deletePhrase: "s:20" },
  jealousy: { enabled: "b", tierA: "b", tierB: "b", tierBProbability: "p", defaultEnabled: "b", perPersonDailyCap: "i:0:20", personCooldownMin: "i:0:1440", groupCooldownMin: "i:0:1440", optOutPhrase: "s:20" },
  lexicon: { enabled: "b", defaultEnabled: "b", maxSlang: "i:0:10", maxNames: "i:0:10", includeDerogatory: "b" },
};
// 按群覆盖允许改的字段（enabled 必填）
const FUN_GROUP_KEYS = { grudge: ["recallProbability", "recallCooldownDays"], gag: ["minScore", "minDistinctPeople", "requireApproval", "perGroupDailyCap"], jealousy: ["tierA", "tierB", "tierBProbability", "groupCooldownMin"], lexicon: ["maxSlang", "maxNames"] };
function funVal(where, t, x) {
  const [k, a, b] = t.split(":");
  if (k === "b") { if (typeof x !== "boolean") throw httpErr(400, `${where} 必须是布尔值`); return x; }
  if (k === "p") { if (typeof x !== "number" || !(x >= 0 && x <= 1)) throw httpErr(400, `${where} 应在 0–1`); return x; }
  if (k === "i") { if (!Number.isInteger(x) || x < +a || x > +b) throw httpErr(400, `${where} 应为 ${a}–${b} 的整数`); return x; }
  if (k === "s") { if (typeof x !== "string" || !x.trim() || x.length > +a || /[\r\n]/.test(x)) throw httpErr(400, `${where} 应为 1–${a} 字的单行文本`); return x.trim(); }
  throw httpErr(500, "spec 错误");
}
function funReadJ(name, init) { try { return JSON.parse(fs.readFileSync(path.join(FUN_DIR, name), "utf8")); } catch (e) { if (e.code === "ENOENT") return init(); throw httpErr(500, name + " 读取失败：" + e.message); } }
function funTrashCopy(name, tag) { const f = path.join(FUN_DIR, name); if (!fs.existsSync(f)) return null; fs.mkdirSync(FUN_TRASH, { recursive: true, mode: 0o755 }); const ts = new Date().toISOString().replace(/[:.]/g, "-"); for (let n = 0; ; n++) { const dst = path.join(FUN_TRASH, `${ts}${n ? "-" + n : ""}-${tag ? tag + "-" : ""}${name}`); try { fs.copyFileSync(f, dst, fs.constants.COPYFILE_EXCL); return path.basename(dst); } catch (e) { if (e.code !== "EEXIST" || n >= 50) throw e; } } }
function funWriteJ(name, obj, tag) {
  fs.mkdirSync(FUN_DIR, { recursive: true, mode: 0o755 });
  const backup = funTrashCopy(name, tag); // 先备份，备份失败直接报错，不写
  obj.updatedAt = Date.now(); const f = path.join(FUN_DIR, name), tmp = path.join(FUN_DIR, `.${name}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o644 }); fs.renameSync(tmp, f); return backup;
}
const funStored = () => funReadJ("params.json", () => ({ version: 1 }));
function funEffective(s) {
  const o = { ...FUN_DEFAULTS, ...s, optOut: { ...(s.optOut || {}) } };
  for (const f of FUN_FEATS) o[f] = { ...FUN_DEFAULTS[f], ...(s[f] && typeof s[f] === "object" ? s[f] : {}) };
  delete o.updatedAt; return o;
}
function funMergeFeat(f, cur, v) {
  if (v === null) return undefined; // null = 删除整段，回到默认（默认关闭）
  if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, `${f} 必须是对象或 null`);
  const o = { ...(cur && typeof cur === "object" ? cur : {}) };
  for (const [k, x] of Object.entries(v)) {
    if (k === "perGroup") {
      if (!x || typeof x !== "object" || Array.isArray(x)) throw httpErr(400, `${f}.perGroup 必须是对象`); const pg = { ...(o.perGroup || {}) };
      for (const [gk, gv] of Object.entries(x)) {
        if (!FUN_GK.test(gk)) throw httpErr(400, `群键应为 group:<32位小写hex>：${gk}`);
        if (gv === null) { delete pg[gk]; continue; }
        if (!gv || typeof gv !== "object" || typeof gv.enabled !== "boolean") throw httpErr(400, `${f}.perGroup.${gk}.enabled 必须是布尔值`);
        const e = { enabled: gv.enabled };
        for (const [gk2, gx] of Object.entries(gv)) { if (gk2 === "enabled" || gx == null) continue; if (!FUN_GROUP_KEYS[f].includes(gk2)) throw httpErr(400, `${f} 的按群覆盖不支持：${gk2}`); e[gk2] = funVal(`${f}.perGroup.${gk}.${gk2}`, FUN_SPEC[f][gk2], gx); }
        pg[gk] = e;
      }
      o.perGroup = pg;
    } else if (f === "jealousy" && k === "otherBots") {
      if (x === null) { delete o.otherBots; continue; } // 回到默认（芙宁娜）
      if (!Array.isArray(x) || x.length > 20) throw httpErr(400, "jealousy.otherBots 应为最多 20 项的数组 [{id,name}]，或 null");
      const seen = new Set(); o.otherBots = x.map((b, i) => { const id = String(b?.id || "").toUpperCase(); if (!FUN_PID.test(id)) throw httpErr(400, `jealousy.otherBots[${i}].id 应为 32 位 QQ openid`); if (seen.has(id)) throw httpErr(400, `jealousy.otherBots 里 id 重复：${id}`); seen.add(id); return { id, name: funVal(`jealousy.otherBots[${i}].name`, "s:20", b?.name) }; });
    } else if (FUN_SPEC[f][k]) { if (x === null) delete o[k]; else o[k] = funVal(`${f}.${k}`, FUN_SPEC[f][k], x); }
    else throw httpErr(400, `不支持的 ${f} 参数：${k}`);
  }
  return o;
}
function funMerge(stored, inP) {
  if (!inP || typeof inP !== "object" || Array.isArray(inP)) throw httpErr(400, "需要 params 对象");
  const s = { ...stored };
  for (const [k, v] of Object.entries(inP)) {
    if (FUN_FEATS.includes(k)) { const m = funMergeFeat(k, s[k], v); if (m === undefined) delete s[k]; else s[k] = m; }
    else if (k === "enabled" || k === "killOwnerOnly") { if (v === null) delete s[k]; else s[k] = funVal(k, "b", v); }
    else if (k === "killPhrase" || k === "optOutAllPhrase") { if (v === null) delete s[k]; else s[k] = funVal(k, "s:20", v); }
    else if (k === "optOut") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, "optOut 必须是对象 {<openid>: [\"all\"|\"grudge\"|\"gag\"|\"jealousy\"] | null}");
      const oo = { ...(s.optOut || {}) };
      for (const [pid0, list] of Object.entries(v)) {
        const pid = pid0.toUpperCase(); if (!FUN_PID.test(pid)) throw httpErr(400, `optOut 的键应为 32 位 QQ openid：${pid0}`);
        if (list === null) { delete oo[pid]; continue; }
        if (!Array.isArray(list) || !list.length || list.some(x => !["all", ...FUN_FEATS].includes(x))) throw httpErr(400, `optOut.${pid} 应为非空数组，元素取 all/grudge/gag/jealousy/lexicon`);
        oo[pid] = list.includes("all") ? ["all"] : [...new Set(list)];
      }
      s.optOut = oo;
    } else throw httpErr(400, "不支持的参数：" + k);
  }
  // 交叉检查：同一功能里的各口令不能重复
  const e = funEffective(s); const ph = [e.killPhrase, e.optOutAllPhrase, e.grudge.optOutPhrase, e.grudge.clearPhrase, e.gag.optOutPhrase, e.gag.deletePhrase, e.jealousy.optOutPhrase];
  const phn = ph.map(x => String(x).replace(/\s+/g, "").toLowerCase()); if (new Set(phn).size !== phn.length) throw httpErr(400, "各口令不能重复");
  return s;
}
const funGrudges = () => funReadJ("grudges.json", () => ({ version: 1, people: {} }));
const funGags = () => funReadJ("gags.json", () => ({ version: 1, groups: {} }));
// gate 补丁已装（fun-context.mjs 存在且 index.js 带标记）→ consumers:true；网关重启后才真正生效
function funConsumers() { try { const d = path.join(WORKSPACE, "..", "plugins", "qq-group-followup-gate"); return fs.existsSync(path.join(d, "fun-context.mjs")) && fs.readFileSync(path.join(d, "index.js"), "utf8").includes("HOSINO-FUN-CONTEXT v"); } catch { return false; } }
// 未安装 gate 补丁时：说明什么都还不生效；已安装：只保留纯信息（候选统计这类还没做的周边），不写“不生效”
const FUN_REQUIRES_PENDING = { "all": "gate 补丁 HOSINO-FUN-CONTEXT 还没安装，这里的设置暂时只保存" };
const FUN_INFO = {
  "gag": "提示：梗的候选统计（ref-index 扫描）还没做，回旋镖只会用 gags.json 里已有的条目",
  "lexicon": "提示：黑话/称呼的候选统计和确认页还没做；gate 读取 /opt/hosino-console/data/lexicon/<群hex>.json（有这个文件才会注入）",
};
const funRequires = () => (funConsumers() ? FUN_INFO : FUN_REQUIRES_PENDING);
function funPidArg(b) { const p = String(b?.person || "").toUpperCase(); if (!FUN_PID.test(p)) throw httpErr(400, "person 应为 32 位 QQ openid"); return p; }

Object.assign(R, {
  "GET /api/fun/params": async () => { const s = funStored(); return { params: funEffective(s), stored: s, defaults: FUN_DEFAULTS, requires: funRequires(), ...(funConsumers() ? { consumers: true, note: "gate 补丁已安装，改参数约 5 秒内生效" } : { consumers: false, note: "技能、脚本和 gate 补丁还没上线，这里的设置暂时只存不生效" }) }; },
  "POST /api/fun/params/set": W("fun.params.set", b => Object.keys(b.params || {}).join(","), async b => {
    const s = funMerge(funStored(), b.params); s.version = 1; const backup = funWriteJ("params.json", s);
    return { ok: true, params: funEffective(s), requires: funRequires(), backup };
  }, { confirm: true }),
  "GET /api/fun/grudges": async () => {
    const g = funGrudges(), oo = funEffective(funStored()).optOut;
    return { people: Object.entries(g.people || {}).map(([id, p]) => ({ id, name: p.name || null, entries: (p.entries || []).map(e => ({ id: e.id, group: e.group, quote: e.quote, at: e.at, count: e.count || 1 })), lastRecallAt: p.lastRecallAt || null, optOut: !!(oo[id] && (oo[id].includes("all") || oo[id].includes("grudge"))) })), updatedAt: g.updatedAt || null };
  },
  "POST /api/fun/grudges/delete": W("fun.grudges.delete", b => `${b.person} ${b.entryId}`, async b => {
    const pid = funPidArg(b); if (typeof b.entryId !== "string" || !b.entryId) throw httpErr(400, "需要 entryId");
    const g = funGrudges(); const p = g.people?.[pid]; const i = (p?.entries || []).findIndex(e => e.id === b.entryId); if (i < 0) throw httpErr(404, "条目不存在");
    p.entries.splice(i, 1); if (!p.entries.length) delete g.people[pid]; const backup = funWriteJ("grudges.json", g, "delete");
    return { ok: true, backup };
  }, { confirm: true }),
  // 撕本本：清空某人的全部条目
  "POST /api/fun/grudges/clear": W("fun.grudges.clear", b => String(b.person), async b => {
    const pid = funPidArg(b); const g = funGrudges(); const n = g.people?.[pid]?.entries?.length || 0; if (!g.people?.[pid]) throw httpErr(404, "这个人的本本是空的");
    delete g.people[pid]; const backup = funWriteJ("grudges.json", g, "clear"); return { ok: true, removed: n, backup };
  }, { confirm: true }),
  "GET /api/fun/gags": async u => {
    const grp = u.searchParams.get("group"); if (grp && !FUN_GK.test(grp)) throw httpErr(400, "group 应为 group:<32位小写hex>");
    const gg = funGags().groups || {}; const keys = grp ? [grp] : Object.keys(gg);
    return { groups: keys.map(k => ({ group: k, items: (gg[k]?.items || []).map(x => ({ id: x.id, quote: x.quote, context: x.context, keywords: x.keywords || [], score: x.score, addedAt: x.addedAt, uses: x.uses || 0, lastUsedAt: x.lastUsedAt || null, retired: !!x.retired, promotedToSlang: !!x.promotedToSlang })) })) };
  },
  "POST /api/fun/gags/delete": W("fun.gags.delete", b => `${b.group} ${b.id}`, async b => {
    if (!FUN_GK.test(String(b.group || ""))) throw httpErr(400, "group 应为 group:<32位小写hex>"); if (typeof b.id !== "string" || !b.id) throw httpErr(400, "需要 id");
    const g = funGags(); const arr = g.groups?.[b.group]?.items || []; const i = arr.findIndex(x => x.id === b.id); if (i < 0) throw httpErr(404, "梗不存在");
    arr.splice(i, 1); const backup = funWriteJ("gags.json", g, "delete"); return { ok: true, backup };
  }, { confirm: true }),
  "GET /api/fun/trash": async () => { let fs_ = []; try { fs_ = fs.readdirSync(FUN_TRASH).filter(f => !f.startsWith(".")).sort().reverse(); } catch {} return { items: fs_.map(f => { let s = null; try { s = fs.statSync(path.join(FUN_TRASH, f)); } catch {} return { file: f, size: s?.size ?? null, mtime: s?.mtimeMs ?? null }; }) }; },
});

// ---------- v2.12：拟人化参数（写 workspace/fun/humanlike.json；和小脾气共用 .trash/ 与 40-fun-rw.conf） ----------
const HL_FEATS = ["techMode", "followup", "opinion", "dontKnow", "proactive", "quirk", "mood", "sensitive", "protect", "morning", "robotBit", "mbti"];
const HL_QUIRK_SUGGESTIONS = ["嗯……怎么说呢", "算了不说了", "就那种感觉你懂吧"];
const HL_DEFAULTS = {
  enabled: false, optOutPhrase: "别拟人", optOut: {}, perGroup: {},
  techMode: { enabled: true, stickyMin: 10, keywords: ["报错", "error", "Traceback", "日志", "ssh", "systemctl", "npm", "```"], ownerPhraseOn: "技术模式", ownerPhraseOff: "聊天模式", allowPersonaLine: true },
  followup: { enabled: false, perPersonDailyCap: 1, onceOnly: true, minWaitHours: 12, maxAgeDays: 14 },
  opinion: { enabled: false, strength: "gentle", yieldWhenCares: true, techDisagree: true },
  dontKnow: { enabled: false, maxHedgePerReply: 1, inTechMode: true },
  proactive: { mode: "off", quietThresholdMin: 180, triggerProbability: 0.2, minIntervalMin: 180, perGroupDailyCap: 2, requireReason: true, backoffAfterIgnored: 2, quietHoursStart: 1, quietHoursEnd: 8, heartbeatIntervalMin: 60 },
  quirk: { enabled: false, probability: 0.067, phrases: [], selfCorrect: false, trailOff: false },
  mood: { enabled: false, perPersonDailyCap: 1, deviation: 0.6, minBaselineMsgs: 30 },
  sensitive: { mode: "never", topics: ["医疗", "生病", "分手", "去世", "裁员", "考试挂科"] },
  protect: { enabled: false, roastWindowMin: 5, roastMinHits: 3, roastMinPeople: 1, probability: 0.5, perGroupDailyCap: 2, perTargetDailyCap: 1, mediateRealFights: true, roastKeywords: ["菜", "笨", "丑", "胖", "废物", "滚"], fightKeywords: ["闭嘴", "有病", "拉黑", "真生气了", "别说了"] },
  morning: { enabled: false, mode: "passive", greetingKeywords: ["早", "早安", "早上好", "早啊", "morning"], windowStartHour: 5, windowEndHour: 11, habitWindowDays: 14, habitMinDays: 4, perGroupDailyCap: 1, heartbeatHour: 7 },
  robotBit: { enabled: false, keywords: ["人机", "机器人吧", "你是AI吧", "bot吧"], sincereKeywords: ["你是真人吗", "说真的你是不是AI", "认真问", "你到底是不是人"], segmentGapMin: 30, perGroupDailyCap: 3 },
  mbti: { enabled: false, includeZodiac: false, minPublicMsgs: 20, perPersonDailyCap: 1, perGroupDailyCap: 5, forbiddenTopics: ["健康", "疾病", "性取向", "宗教", "政治", "家庭", "收入"] },
};
// 类型：b p i:min:max s:max e:a|b l:最多条数:每条最长（字符串数组，去重忽略空白/大小写）
const HL_SPEC = {
  techMode: { enabled: "b", stickyMin: "i:0:240", keywords: "l:50:40", ownerPhraseOn: "s:20", ownerPhraseOff: "s:20", allowPersonaLine: "b" },
  followup: { enabled: "b", perPersonDailyCap: "i:0:5", onceOnly: "b", minWaitHours: "i:0:168", maxAgeDays: "i:1:90" },
  opinion: { enabled: "b", strength: "e:gentle|firm", yieldWhenCares: "b", techDisagree: "b" },
  dontKnow: { enabled: "b", maxHedgePerReply: "i:1:3", inTechMode: "b" },
  proactive: { mode: "e:off|passive|heartbeat", quietThresholdMin: "i:10:4320", triggerProbability: "p", minIntervalMin: "i:10:4320", perGroupDailyCap: "i:0:10", requireReason: "b", backoffAfterIgnored: "i:0:10", quietHoursStart: "i:0:23", quietHoursEnd: "i:0:23", heartbeatIntervalMin: "i:10:1440" },
  quirk: { enabled: "b", probability: "p", phrases: "l:10:20", selfCorrect: "b", trailOff: "b" },
  mood: { enabled: "b", perPersonDailyCap: "i:0:3", deviation: "p", minBaselineMsgs: "i:5:500" },
  sensitive: { mode: "e:never|dmOnly|always", topics: "l:50:20" },
  protect: { enabled: "b", roastWindowMin: "i:1:60", roastMinHits: "i:1:20", roastMinPeople: "i:1:10", probability: "p", perGroupDailyCap: "i:0:10", perTargetDailyCap: "i:0:5", mediateRealFights: "b", roastKeywords: "l:50:20", fightKeywords: "l:50:20" },
  morning: { enabled: "b", mode: "e:passive|heartbeat", greetingKeywords: "l:20:20", windowStartHour: "i:0:23", windowEndHour: "i:1:24", habitWindowDays: "i:3:60", habitMinDays: "i:1:60", perGroupDailyCap: "i:0:1", heartbeatHour: "i:0:23" },
  robotBit: { enabled: "b", keywords: "l:30:20", sincereKeywords: "l:30:30", segmentGapMin: "i:5:720", perGroupDailyCap: "i:0:20" },
  mbti: { enabled: "b", includeZodiac: "b", minPublicMsgs: "i:0:500", perPersonDailyCap: "i:0:5", perGroupDailyCap: "i:0:20", forbiddenTopics: "l:30:20" },
};
const HL_GROUP_KEYS = ["followup", "opinion", "dontKnow", "proactive", "quirk", "mood", "protect", "morning", "robotBit", "mbti"];
const hlNorm = x => String(x).replace(/\s+/g, "").toLowerCase();
function hlVal(where, t, x) {
  const [k, a, b] = t.split(":");
  if (k === "e") { const opts = a.split("|"); if (!opts.includes(x)) throw httpErr(400, `${where} 只能取 ${opts.join("/")}`); return x; }
  if (k === "l") {
    if (!Array.isArray(x) || x.length > +a) throw httpErr(400, `${where} 应为最多 ${a} 条的数组`);
    const out = x.map((y, i) => funVal(`${where}[${i}]`, "s:" + b, y)); const n = out.map(hlNorm);
    if (new Set(n).size !== n.length) throw httpErr(400, `${where} 有重复项（忽略空白和大小写）`); return out;
  }
  return funVal(where, t, x);
}
function hlEffective(s) {
  const o = { ...HL_DEFAULTS, ...s, optOut: { ...(s.optOut || {}) }, perGroup: { ...(s.perGroup || {}) } };
  for (const f of HL_FEATS) o[f] = { ...HL_DEFAULTS[f], ...(s[f] && typeof s[f] === "object" ? s[f] : {}) };
  return o;
}
const hlStored = () => funReadJ("humanlike.json", () => ({ version: 1 }));
function hlMerge(stored, inP) {
  if (!inP || typeof inP !== "object" || Array.isArray(inP)) throw httpErr(400, "需要 params 对象");
  const s = { ...stored };
  for (const [k, v] of Object.entries(inP)) {
    if (HL_FEATS.includes(k)) {
      if (v === null) { delete s[k]; continue; }
      if (typeof v !== "object" || Array.isArray(v)) throw httpErr(400, `${k} 必须是对象或 null`);
      const o = { ...(s[k] || {}) };
      for (const [kk, x] of Object.entries(v)) { if (!HL_SPEC[k][kk]) throw httpErr(400, `${k} 不支持的参数：${kk}`); if (x === null) delete o[kk]; else o[kk] = hlVal(`${k}.${kk}`, HL_SPEC[k][kk], x); }
      if (Object.keys(o).length) s[k] = o; else delete s[k];
    } else if (k === "enabled") { if (v === null) delete s[k]; else s[k] = funVal(k, "b", v); }
    else if (k === "optOutPhrase") { if (v === null) delete s[k]; else s[k] = funVal(k, "s:20", v); }
    else if (k === "perGroup") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, "perGroup 必须是对象 {group:<hex>: {enabled, 各功能开关} | null}");
      const pg = { ...(s.perGroup || {}) };
      for (const [gk, gv] of Object.entries(v)) {
        if (!FUN_GK.test(gk)) throw httpErr(400, `群键应为 group:<32位小写hex>：${gk}`);
        if (gv === null) { delete pg[gk]; continue; }
        if (!gv || typeof gv.enabled !== "boolean") throw httpErr(400, `perGroup.${gk}.enabled 必填（布尔）`);
        const e = { enabled: gv.enabled };
        for (const [f, x] of Object.entries(gv)) { if (f === "enabled" || x == null) continue; if (!HL_GROUP_KEYS.includes(f)) throw httpErr(400, `按群覆盖不支持：${f}`); e[f] = funVal(`perGroup.${gk}.${f}`, "b", x); }
        pg[gk] = e;
      }
      s.perGroup = pg;
    } else if (k === "optOut") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, "optOut 必须是对象 {<openid>: [\"all\"|功能名] | null}");
      const oo = { ...(s.optOut || {}) };
      for (const [pid0, list] of Object.entries(v)) {
        const pid = pid0.toUpperCase(); if (!FUN_PID.test(pid)) throw httpErr(400, `optOut 的键应为 32 位 QQ openid：${pid0}`);
        if (list === null) { delete oo[pid]; continue; }
        if (!Array.isArray(list) || !list.length || list.some(x => !["all", ...HL_GROUP_KEYS].includes(x))) throw httpErr(400, `optOut.${pid} 应为非空数组，元素取 all/${HL_GROUP_KEYS.join("/")}`);
        oo[pid] = list.includes("all") ? ["all"] : [...new Set(list)];
      }
      s.optOut = oo;
    } else throw httpErr(400, "不支持的参数：" + k);
  }
  const e = hlEffective(s);
  if (e.proactive.quietHoursStart === e.proactive.quietHoursEnd && s.proactive && ("quietHoursStart" in s.proactive || "quietHoursEnd" in s.proactive)) throw httpErr(400, "proactive.quietHoursStart 和 quietHoursEnd 不能相同");
  if (e.morning.windowStartHour >= e.morning.windowEndHour) throw httpErr(400, "morning.windowStartHour 必须小于 windowEndHour");
  if (e.morning.habitMinDays > e.morning.habitWindowDays) throw httpErr(400, "morning.habitMinDays 不能大于 habitWindowDays");
  { const a = e.robotBit.keywords.map(hlNorm), b2 = e.robotBit.sincereKeywords.map(hlNorm); if (a.some(x => b2.includes(x))) throw httpErr(400, "robotBit.keywords 和 sincereKeywords 不能有相同项"); }
  const ph = [e.optOutPhrase, e.techMode.ownerPhraseOn, e.techMode.ownerPhraseOff].map(hlNorm);
  if (new Set(ph).size !== ph.length) throw httpErr(400, "各口令不能重复（忽略空白和大小写）");
  try { const fp = funEffective(funStored()); const others = [fp.killPhrase, fp.optOutAllPhrase, fp.grudge.optOutPhrase, fp.grudge.clearPhrase, fp.gag.optOutPhrase, fp.gag.deletePhrase, fp.jealousy.optOutPhrase].map(hlNorm); if (ph.some(p => others.includes(p))) throw httpErr(400, "拟人化口令不能和小脾气口令重复"); } catch (err) { if (err.http === 400) throw err; }
  return s;
}
const HL_REQUIRES_PENDING = { "all": "gate 补丁 HOSINO-FUN-CONTEXT 还没安装，这里的设置暂时只保存" };
const HL_INFO = {
  "proactive.mode=heartbeat": "提示：心跳模式由 gate 自带的定时器按 heartbeatIntervalMin 检查，条件都满足才跑一次心跳轮（会用一次模型调用），没理由就不说话；没开时不产生任何调用",
  "morning.mode=heartbeat": "提示：心跳模式到 heartbeatHour 时由 gate 直接发一句固定的“早！（今天我第一）”类短句（不调用模型）；当天已经有人说过早就不发",
  "robotBit": "提示：认真问是不是真人时一律如实回答，不受开关影响",
};
const hlRequires = () => (funConsumers() ? HL_INFO : HL_REQUIRES_PENDING);
function hlView(s) { return { params: hlEffective(s), stored: s, defaults: HL_DEFAULTS, suggestions: { quirkPhrases: HL_QUIRK_SUGGESTIONS }, requires: hlRequires(), ...(funConsumers() ? { consumers: true, note: "gate 补丁已安装，改参数约 5 秒内生效；不提供任何延迟类设置" } : { consumers: false, note: "技能和 gate 补丁还没上线，这里的设置暂时只存不生效；不提供任何延迟类设置" }) }; }
Object.assign(R, {
  "GET /api/fun/humanlike": async () => hlView(hlStored()),
  "POST /api/fun/humanlike/set": W("fun.humanlike.set", b => Object.keys(b.params || {}).join(","), async b => {
    const s = hlMerge(hlStored(), b.params); s.version = 1; const backup = funWriteJ("humanlike.json", s);
    return { ok: true, ...hlView(s), backup };
  }, { confirm: true }),
  "GET /api/fun/humanlike/followups": async () => { const d = funReadJ("followups.json", () => ({ version: 1, items: [] })); return { items: Array.isArray(d.items) ? d.items : [], updatedAt: d.updatedAt ?? null }; },
});

function send(res, code, obj, h = {}) { const b = JSON.stringify(obj); res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h }); res.end(b); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const SEC = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" };
const body = req => new Promise((r, j) => { let d = ""; req.on("data", c => { d += c; if (d.length > 2e5) { j(new Error("请求过大")); req.destroy(); } }); req.on("end", () => { try { r(d ? JSON.parse(d) : {}); } catch { j(new Error("JSON 无效")); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname.startsWith("/api/") && req.method === "POST" && req.headers["x-hs"] !== "1") return send(res, 403, { error: "拒绝跨站请求" });
    if (u.pathname === "/api/login" && req.method === "POST") {
      const ip = ipOf(req), f = fails.get(ip) || { n: 0, first: Date.now(), lockUntil: 0 };
      if (f.lockUntil > Date.now()) return send(res, 429, { error: `尝试次数过多，请 ${Math.ceil((f.lockUntil - Date.now()) / 60e3)} 分钟后再试` });
      const b = await body(req);
      if (typeof b.password === "string" && b.password.length < 200 && HASH && await bcrypt.compare(b.password, HASH)) {
        fails.delete(ip); const sid = crypto.randomBytes(32).toString("hex"); sessions.set(sid, Date.now() + TTL);
        return send(res, 200, { ok: true }, { "set-cookie": `hs_sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL / 1000}` });
      }
      if (f.first + WIN < Date.now()) { f.n = 0; f.first = Date.now(); }
      f.n++; if (f.n >= MAXF) f.lockUntil = Date.now() + WIN; fails.set(ip, f);
      await new Promise(r => setTimeout(r, 600));
      return send(res, 401, { error: f.lockUntil > Date.now() ? "密码错误次数过多，已锁定 15 分钟" : `密码不对（还可再试 ${MAXF - f.n} 次）` });
    }
    if (u.pathname === "/api/logout") { const s = cookieSid(req); if (s) sessions.delete(s); return send(res, 200, { ok: true }, { "set-cookie": "hs_sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" }); }
    if (u.pathname === "/api/me") { const a = !!authed(req); return send(res, 200, { authed: a, isOwner: a }); } // 单密码登录：登录即主人
    if (u.pathname.startsWith("/api/cli/") && !authed(req)) return send(res, 403, { error: "仅主人可用", code: "forbidden" });
    if (u.pathname.startsWith("/api/")) {
      if (!authed(req)) return send(res, 401, { error: "请先登录" });
      if (u.pathname === "/api/media" && req.method === "GET") return await serveMedia(req, res, u);
      if (u.pathname === "/api/digests/image" && req.method === "GET") { const id = u.searchParams.get("id"); if (!isDigestId(id)) return send(res, 400, { error: "id 无效" }); const f = path.join(DIGEST_DIR, id + ".png"); if (!fs.existsSync(f)) return send(res, 404, { error: "没有图片" }); return serveFile(res, f, "image/png"); }
      if (u.pathname === "/api/stickers/import" && req.method === "POST") { if (req.headers["x-hs"] !== "1") return send(res, 403, { error: "拒绝跨站请求" }); const cat = u.searchParams.get("category"); try { const r = await stkImport(req, u); opLog(req, "stickers.import", `${cat} ${r.file}`, true); return send(res, 200, r); } catch (e) { opLog(req, "stickers.import", cat, false, e.message); return send(res, e.http || 500, { error: e.message, code: e.code }); } }
      if (u.pathname === "/api/stickers/image" && req.method === "GET") { const n = u.searchParams.get("file"); if (!stickerFiles().includes(n)) return send(res, 404, { error: "表情不存在" }); const real = fs.realpathSync(path.join(STICKER_DIR, n)); if (!real.startsWith(fs.realpathSync(STICKER_DIR) + path.sep)) return send(res, 403, { error: "拒绝" }); return serveFile(res, real, MEDIA_MIME[path.extname(n).toLowerCase()] || "application/octet-stream"); }
      if (req.method === "POST" && req.headers["x-hs"] !== "1") return send(res, 403, { error: "拒绝跨站请求" });
      if (u.pathname === "/api/uploads" || u.pathname.startsWith("/api/uploads/")) { if (req.method === "DELETE" && req.headers["x-hs"] !== "1") return send(res, 403, { error: "拒绝跨站请求" }); return await upRoute(req, res, u); }
      if (u.pathname.startsWith("/api/cli/")) { if (req.method === "DELETE" && req.headers["x-hs"] !== "1") return send(res, 403, { error: "拒绝跨站请求" }); return await cliRoute(req, res, u); }
      const pm = req.method === "GET" && /^\/api\/profiles\/([^/]+)$/.exec(u.pathname); const h = pm ? (u2 => R["GET /api/profiles/:id"](u2, decodeURIComponent(pm[1]))) : R[req.method + " " + u.pathname]; if (!h) return send(res, 404, { error: "接口不存在" });
      const b = req.method === "POST" ? await body(req) : null;
      return send(res, 200, await h(u, b, req));
    }
    let p = path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ""); if (p === "/" || !path.extname(p)) p = "/index.html";
    const fp = path.join(PUB, p); if (!fp.startsWith(PUB)) return send(res, 403, {});
    fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": MIME[path.extname(fp)] || "application/octet-stream", "cache-control": p === "/index.html" ? "no-cache" : "max-age=3600", ...SEC }); res.end(d); });
  } catch (e) { send(res, e.http || 502, { error: e.message, code: e.code }); }
}).listen(PORT, "127.0.0.1", () => console.log("hosino-console on", PORT));
