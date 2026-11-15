// HOSINO-MEMORY-SEARCH v1：直查 Qdrant 只读语义搜索（仅登录管理员）。不写 Qdrant，不改 openclaw.json。
import crypto from "node:crypto";
import fs from "node:fs";

const UID_RE = /^[\p{L}\p{N}_:.@-]{1,128}$/u;
const SECRET_PATTERNS = [
  /Bearer\s+[\w.~+\/=-]+/gi,
  /\bsk-[\w-]{6,}/g,
  /\bbce-v3\/[\w\/-]+/gi,
  /(\\?"?(?:api[_-]?key|apikey|access[_-]?token|key|token|secret|password|authorization|bearer|value|ak|sk|[A-Za-z0-9]+[_-](?:key|ak|sk))\\?"?\s*[:=]\s*)(\\?"[^"\\]*\\?"|[^\s,;&}]+)/gi,
];
export function redact(s, secrets = []) {
  let out = String(s ?? "");
  const forms = new Set();
  for (const v of secrets) if (v != null && String(v)) {
    const raw = String(v), escaped = JSON.stringify(raw).slice(1, -1);
    for (const value of [raw, escaped, JSON.stringify(escaped).slice(1, -1), Buffer.from(raw).toString("base64"), Buffer.from(raw).toString("base64url")]) forms.add(value);
    try { forms.add(encodeURIComponent(raw)); forms.add(encodeURI(raw)); } catch {} // 畸形 Unicode 也不能使脱敏失败
  }
  for (const value of [...forms].sort((a, b) => b.length - a.length)) out = out.split(value).join("<redacted>");
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m, a) => (a !== undefined && typeof a === "string" && m.startsWith(a) ? a + "<redacted>" : "<redacted>"));
  return out.slice(0, 300);
}
const err = (http, msg, code) => Object.assign(new Error(msg), { http, code });

export function validateSearch(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw err(400, "请求体必须是对象", "bad_params");
  if (b.q !== undefined && b.query !== undefined && b.q !== b.query) throw err(400, "q 和 query 只能给一个", "bad_params");
  const raw = b.q ?? b.query; const query = typeof raw === "string" ? raw.trim() : "";
  if (!query || [...query].length > 500) throw err(400, "q 必填，1-500 字", "bad_params");
  if (b.all !== undefined && typeof b.all !== "boolean") throw err(400, "all 只能是 true 或 false", "bad_params");
  let scope = b.scope ?? "users";
  if (!["all", "users"].includes(scope)) throw err(400, "scope 只能是 all 或 users", "bad_params");
  let user_ids = [];
  // M7（凛已同意）：没给 user_ids、空数组、all:true、scope=all → 跨全部用户搜，不加 user_id 过滤。指定 id 仍走 UID_RE。
  const idsGiven = b.user_ids !== undefined && !(Array.isArray(b.user_ids) && !b.user_ids.length);
  if ((b.all === true || scope === "all") && idsGiven) throw err(400, "搜全部时不接受 user_ids", "bad_params");
  if (b.all === true || scope === "all" || !idsGiven) {
    if (b.user_ids !== undefined && !Array.isArray(b.user_ids)) throw err(400, "user_ids 需为数组", "bad_params");
    scope = "all";
    user_ids = [];
  } else {
    if (!Array.isArray(b.user_ids) || b.user_ids.length > 50) throw err(400, "user_ids 需 1-50 个", "bad_params");
    if (!b.user_ids.every(x => typeof x === "string" && UID_RE.test(x))) throw err(400, "user_ids 格式无效", "bad_params");
    user_ids = [...new Set(b.user_ids)];
    scope = "users";
  }
  const limit = b.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw err(400, "limit 为 1-50 的整数", "bad_params");
  const minScore = b.minScore ?? 0;
  if (typeof minScore !== "number" || !Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw err(400, "minScore 为 0 到 1", "bad_params");
  const visibility = b.visibility ?? null;
  if (visibility !== null && !["private", "group"].includes(visibility)) throw err(400, "visibility 只能是 private 或 group", "bad_params");
  let since = b.since ?? null;
  if (since !== null) { const t = typeof since === "string" ? Date.parse(since) : NaN; if (!Number.isFinite(t)) throw err(400, "since 需 ISO 时间", "bad_params"); since = new Date(t).toISOString(); }
  return { query, scope, user_ids, limit, minScore, visibility, since };
}

export function buildFilter({ scope, user_ids, visibility, since }) {
  const must = [], must_not = [];
  if (scope === "users") must.push({ key: "user_id", match: { any: user_ids } });
  if (visibility === "group") must.push({ key: "oc_visibility", match: { value: "group" } });
  if (visibility === "private") must_not.push({ key: "oc_visibility", match: { value: "group" } }); // 旧记忆无该字段，按私聊算
  if (since) must.push({ key: "createdAt", range: { gte: since } });
  return must.length || must_not.length ? { ...(must.length ? { must } : {}), ...(must_not.length ? { must_not } : {}) } : undefined;
}

// HOSINO-MEMSEARCH-ENVREF v1：mem0 embedder 的 apiKey 是 "${QIANFAN_API_KEY}" 这样的环境变量引用（网关启动时展开）。
// v1 把引用原文当 Bearer 发给千帆 → 401 invalid_iam_token。这里按网关同样的来源展开：先进程环境，再 ~/.openclaw/.env（只读，只取被引用的那一个名字）。
const ENV_REF = /^\$\{([A-Z][A-Z0-9_]{0,127})\}$/;
export function readEnvValue(name, { env = process.env, envFile = null, readFile = f => fs.readFileSync(f, "utf8") } = {}) {
  if (typeof env?.[name] === "string" && env[name]) return env[name];
  if (!envFile) return null;
  let text; try { text = readFile(envFile); } catch { return null; }
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== name) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v || null;
  }
  return null;
}
export function makeMemorySearch({ readCfg, qdrantUrl, collection, fetchImpl = fetch, now = Date.now, log = () => {},
  rate = { max: 30, windowMs: 60e3 }, cacheTtlMs: CACHE_TTL = 5 * 60e3, timeoutMs = 15000, env = process.env, envFile = null, readFile, onSecret = () => {} } = {}) {
  const vcache = new Map(); // sha(embedding configuration|query) -> {t, vec}
  const buckets = new Map(); // sid -> [timestamps]
  const embedCfg = () => {
    let cfg;
    try { cfg = readCfg(); } catch { throw err(502, "记忆 embedding 配置无法读取", "embed_config_unreadable"); }
    const e = cfg?.plugins?.entries?.["openclaw-mem0"]?.config?.oss?.embedder;
    const c = e?.config || {};
    if (!c.apiKey || !c.baseURL || !c.model) throw err(502, "记忆 embedding 配置缺失", "embed_config_missing");
    let apiKey = c.apiKey, keyRef = null;
    if (typeof apiKey === "string" && ENV_REF.test(apiKey)) {
      keyRef = ENV_REF.exec(apiKey)[1];
      apiKey = readEnvValue(keyRef, { env, envFile, ...(readFile ? { readFile } : {}) });
      if (!apiKey) throw err(502, `记忆 embedding 密钥引用 ${keyRef} 在控制台进程里解析不到`, "embed_key_unresolved");
    } else if (typeof apiKey !== "string") throw err(502, "记忆 embedding 密钥是控制台不支持的引用格式", "embed_key_unresolved");
    return { apiKey, keyRef, baseURL: String(c.baseURL).replace(/\/+$/, ""), model: c.model, dims: c.embeddingDims };
  };
  const take = sid => {
    const t = now(), arr = (buckets.get(sid) || []).filter(x => x > t - rate.windowMs);
    if (arr.length >= rate.max) { buckets.set(sid, arr); const retry = Math.ceil((arr[0] + rate.windowMs - t) / 1000); throw Object.assign(err(429, "搜索太频繁，请稍后再试", "rate_limited"), { body: { retryAfterSec: retry } }); }
    arr.push(t); buckets.set(sid, arr); return t;
  };
  const refund = (sid, t) => { const arr = buckets.get(sid); if (!arr) return; const i = arr.lastIndexOf(t); if (i >= 0) arr.splice(i, 1); };
  // HOSINO-MEMSEARCH-ERRORS v2：上游（千帆 / Qdrant）的错误正文一律不回给浏览器、不写日志，只给固定错误码。
  // 码：embed_upstream_<HTTP 状态> / embed_timeout / embed_unreachable / embed_bad_response / qdrant_upstream_<状态> / qdrant_timeout / qdrant_unreachable / qdrant_bad_response / collection_missing
  const MSG = { embed: "记忆搜索的 embedding 服务出错了", qdrant: "记忆库（Qdrant）出错了" };
  async function upstream(name, url, init) {
    const tag = name === "Qdrant" ? "qdrant" : "embed";
    let r;
    try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { const code = `${tag}_${e?.name === "TimeoutError" ? "timeout" : "unreachable"}`; throw err(502, `${MSG[tag]}（${code}）`, code); }
    let j = null; try { j = await r.json(); } catch {}
    if (tag === "qdrant" && r.status === 404) throw err(502, "记忆库集合不存在或未就绪", "collection_missing");
    if (!r.ok) { const code = `${tag}_upstream_${Number.isInteger(r.status) ? r.status : "error"}`; throw err(502, `${MSG[tag]}（${code}）`, code); }
    if (j === null) { const code = `${tag}_bad_response`; throw err(502, `${MSG[tag]}（${code}）`, code); }
    return j;
  }
  async function embed(query) {
    const c = embedCfg();
    // 同名模型在不同端点/账号或维度下不一定使用同一个向量空间。
    const k = crypto.createHash("sha256").update(JSON.stringify([c.baseURL, c.model, c.dims ?? null, c.apiKey, query])).digest("hex");
    const hit = vcache.get(k);
    if (hit && hit.t + CACHE_TTL > now()) return { vec: hit.vec, cached: true };
    try { onSecret(c.apiKey); } catch {}
    const j = await upstream("Embedding", c.baseURL + "/embeddings", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.apiKey }, body: JSON.stringify({ model: c.model, input: [query] }) });
    const vec = j?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || !vec.length || !vec.every(x => typeof x === "number" && Number.isFinite(x)) || (c.dims && vec.length !== c.dims)) throw err(502, "记忆搜索的 embedding 返回维度异常（embed_bad_response）", "embed_bad_response");
    vcache.set(k, { t: now(), vec });
    if (vcache.size > 500) for (const [kk, v] of vcache) if (v.t + CACHE_TTL <= now() || vcache.size > 500) vcache.delete(kk);
    return { vec, cached: false };
  }
  async function search(b, sid = "anon") {
    const p = validateSearch(b);
    const slot = take(sid);
    const t0 = now(); let t1 = null;
    try {
      const { vec, cached } = await embed(p.query); t1 = now();
      const filter = buildFilter(p);
      const j = await upstream("Qdrant", `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: vec, limit: p.limit, ...(p.minScore > 0 ? { score_threshold: p.minScore } : {}), ...(filter ? { filter } : {}), with_vector: false,
          with_payload: ["data", "createdAt", "user_id", "oc_visibility", "oc_source_channel"] }) });
      const t2 = now();
      const pts = j?.result?.points ?? (Array.isArray(j?.result) ? j.result : null);
      if (!Array.isArray(pts)) throw err(502, "记忆库返回格式异常（qdrant_bad_response）", "qdrant_bad_response");
      const results = pts.filter(x => typeof x?.score === "number" && Number.isFinite(x.score) && x.score >= p.minScore).map(x => ({ id: String(x.id), score: x.score, memory: String(x.payload?.data ?? ""),
        user_id: x.payload?.user_id ?? null, createdAt: x.payload?.createdAt ?? null, visibility: x.payload?.oc_visibility ?? null, channel: x.payload?.oc_source_channel ?? null }));
      log("memory.search", `scope=${p.scope} users=${p.user_ids.length} limit=${p.limit} n=${results.length} cached=${cached}`, true);
      return { results, count: results.length, scope: p.scope, tookMs: { embed: t1 - t0, search: t2 - t1 }, cached };
    } catch (e) {
      refund(sid, slot);
      const tk = t1 === null ? { embed: now() - t0, embedFailed: true } : { embed: t1 - t0, search: now() - t1, embedFailed: false };
      e.body = { ...(e.body || {}), tookMs: tk };
      // 日志只记固定错误码，不记上游正文
      log("memory.search", `scope=${p.scope} users=${p.user_ids.length}`, false, /^[a-z0-9_]{1,40}$/.test(String(e?.code || "")) ? e.code : "error");
      throw e;
    }
  }
  async function users() {
    const j = await upstream("Qdrant", `${qdrantUrl}/collections/${encodeURIComponent(collection)}/facet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "user_id", limit: 1000, exact: true }) });
    if (!Array.isArray(j?.result?.hits)) throw err(502, "记忆库返回格式异常（qdrant_bad_response）", "qdrant_bad_response");
    const hits = j.result.hits.map(h => ({ user_id: String(h.value), count: h.count }));
    return { users: hits, count: hits.length };
  }
  // 只读状态：后端是什么、集合有多少点、密钥引用能否解析（只给名字和布尔，不给值）。不调用 embedding，不花钱。
  async function status() {
    let cfg = null; try { cfg = readCfg(); } catch {}
    const pl = cfg?.plugins || {}, mem0 = pl.entries?.["openclaw-mem0"], oss = mem0?.config?.oss || {}, ec = oss.embedder?.config || {};
    let embed = { ok: false, code: null };
    try { const c = embedCfg(); embed = { ok: true, keyRef: c.keyRef, model: c.model, dims: c.dims ?? null }; }
    catch (e) { embed = { ok: false, code: e.code || "upstream", keyRef: ENV_REF.exec(String(ec.apiKey ?? ""))?.[1] ?? null, model: ec.model ?? null, dims: ec.embeddingDims ?? null }; }
    let qd = { ok: false };
    try {
      const j = await upstream("Qdrant", `${qdrantUrl}/collections/${encodeURIComponent(collection)}`, { method: "GET" });
      const r = j?.result || {};
      qd = { ok: true, status: r.status ?? null, points: r.points_count ?? null, indexed: r.indexed_vectors_count ?? null, dims: r.config?.params?.vectors?.size ?? null, distance: r.config?.params?.vectors?.distance ?? null };
    } catch (e) { qd = { ok: false, code: e.code || "upstream" }; }
    return {
      backend: "mem0+qdrant", memorySlot: pl.slots?.memory ?? null, mem0Enabled: mem0?.enabled === true, mem0Mode: mem0?.config?.mode ?? null,
      memoryCoreEnabled: pl.entries?.["memory-core"]?.enabled === true, nativeMemorySearch: false,
      collection, vectorStoreCollection: oss.vectorStore?.config?.collectionName ?? null, qdrant: qd, embedding: embed,
      searchable: qd.ok && embed.ok && (qd.points ?? 0) > 0,
    };
  }
  return { search, users, status, _state: { vcache, buckets } };
}
