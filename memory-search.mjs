// HOSINO-MEMORY-SEARCH v1：直查 Qdrant 只读语义搜索（仅登录管理员）。不写 Qdrant，不改 openclaw.json。
import crypto from "node:crypto";

const UID_RE = /^[\w:.@-]{1,128}$/;
const SECRET_PATTERNS = [
  /Bearer\s+[\w.~+\/=-]+/gi,
  /\bsk-[\w-]{6,}/g,
  /\bbce-v3\/[\w\/-]+/gi,
  /(\\?"?(?:api[_-]?key|apikey|access[_-]?token|key|token|secret|password|authorization|value)\\?"?\s*[:=]\s*)(\\?"[^"\\]*\\?"|[^\s,;&}]+)/gi,
];
export function redact(s, secrets = []) {
  let out = String(s ?? "");
  for (const v of secrets) if (v && String(v).length >= 4) out = out.split(String(v)).join("<redacted>");
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m, a) => (a !== undefined && typeof a === "string" && m.startsWith(a) ? a + "<redacted>" : "<redacted>"));
  return out.slice(0, 300);
}
const err = (http, msg, code) => Object.assign(new Error(msg), { http, code });

export function validateSearch(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw err(400, "请求体必须是对象", "bad_params");
  if (b.q !== undefined && b.query !== undefined && b.q !== b.query) throw err(400, "q 和 query 只能给一个", "bad_params");
  const raw = b.q ?? b.query; const query = typeof raw === "string" ? raw.trim() : "";
  if (!query || [...query].length > 500) throw err(400, "q 必填，1-500 字", "bad_params");
  const scope = b.scope ?? "all";
  if (!["all", "users"].includes(scope)) throw err(400, "scope 只能是 all 或 users", "bad_params");
  let user_ids = [];
  if (scope === "users") {
    if (!Array.isArray(b.user_ids) || !b.user_ids.length || b.user_ids.length > 50) throw err(400, "scope=users 时 user_ids 需 1-50 个", "bad_params");
    if (!b.user_ids.every(x => typeof x === "string" && UID_RE.test(x))) throw err(400, "user_ids 格式无效", "bad_params");
    user_ids = [...new Set(b.user_ids)];
  } else if (b.user_ids !== undefined && !(Array.isArray(b.user_ids) && !b.user_ids.length)) throw err(400, "scope=all 不接受 user_ids", "bad_params");
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

export function makeMemorySearch({ readCfg, qdrantUrl, collection, fetchImpl = fetch, now = Date.now, log = () => {},
  rate = { max: 30, windowMs: 60e3 }, cacheTtlMs: CACHE_TTL = 5 * 60e3, timeoutMs = 15000 } = {}) {
  const vcache = new Map(); // sha(model|query) -> {t, vec}
  const buckets = new Map(); // sid -> [timestamps]
  const embedCfg = () => {
    const e = readCfg()?.plugins?.entries?.["openclaw-mem0"]?.config?.oss?.embedder;
    const c = e?.config || {};
    if (!c.apiKey || !c.baseURL || !c.model) throw err(502, "记忆 embedding 配置缺失", "upstream");
    return { apiKey: c.apiKey, baseURL: String(c.baseURL).replace(/\/+$/, ""), model: c.model, dims: c.embeddingDims };
  };
  const take = sid => {
    const t = now(), arr = (buckets.get(sid) || []).filter(x => x > t - rate.windowMs);
    if (arr.length >= rate.max) { buckets.set(sid, arr); const retry = Math.ceil((arr[0] + rate.windowMs - t) / 1000); throw Object.assign(err(429, "搜索太频繁，请稍后再试", "rate_limited"), { body: { retryAfterSec: retry } }); }
    arr.push(t); buckets.set(sid, arr); return t;
  };
  const refund = (sid, t) => { const arr = buckets.get(sid); if (!arr) return; const i = arr.lastIndexOf(t); if (i >= 0) arr.splice(i, 1); };
  async function upstream(name, url, init, secrets) {
    let r;
    try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { throw err(502, `${name} 连接失败：${e?.name === "TimeoutError" ? "超时" : redact(e?.message, secrets)}`, "upstream"); }
    let j = null; try { j = await r.json(); } catch {}
    if (name === "Qdrant" && r.status === 404) throw err(502, "记忆库集合不存在或未就绪", "collection_missing");
    if (!r.ok) throw err(502, `${name} 返回 ${r.status}${j ? "：" + redact(JSON.stringify(j?.error ?? j?.status ?? j), secrets) : ""}`, "upstream");
    return j;
  }
  async function embed(query) {
    const c = embedCfg();
    const k = crypto.createHash("sha256").update(c.model + "\0" + query).digest("hex");
    const hit = vcache.get(k);
    if (hit && hit.t + CACHE_TTL > now()) return { vec: hit.vec, cached: true };
    const j = await upstream("Embedding", c.baseURL + "/embeddings", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.apiKey }, body: JSON.stringify({ model: c.model, input: [query] }) }, [c.apiKey]);
    const vec = j?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || !vec.length || (c.dims && vec.length !== c.dims)) throw err(502, "Embedding 返回维度异常", "upstream");
    vcache.set(k, { t: now(), vec });
    if (vcache.size > 500) for (const [kk, v] of vcache) if (v.t + CACHE_TTL <= now() || vcache.size > 500) vcache.delete(kk);
    return { vec, cached: false };
  }
  async function search(b, sid = "anon") {
    const p = validateSearch(b);
    const slot = take(sid);
    try {
      const t0 = now(); const { vec, cached } = await embed(p.query); const t1 = now();
      const filter = buildFilter(p);
      const j = await upstream("Qdrant", `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: vec, limit: p.limit, ...(p.minScore > 0 ? { score_threshold: p.minScore } : {}), ...(filter ? { filter } : {}), with_vector: false,
          with_payload: ["data", "createdAt", "user_id", "oc_visibility", "oc_source_channel"] }) }, []);
      const t2 = now();
      const pts = j?.result?.points ?? (Array.isArray(j?.result) ? j.result : []);
      const results = pts.filter(x => typeof x?.score === "number" && x.score >= p.minScore).map(x => ({ id: String(x.id), score: x.score, memory: String(x.payload?.data ?? ""),
        user_id: x.payload?.user_id ?? null, createdAt: x.payload?.createdAt ?? null, visibility: x.payload?.oc_visibility ?? null, channel: x.payload?.oc_source_channel ?? null }));
      log("memory.search", `scope=${p.scope} users=${p.user_ids.length} limit=${p.limit} n=${results.length} cached=${cached}`, true);
      return { results, count: results.length, scope: p.scope, tookMs: { embed: t1 - t0, search: t2 - t1 }, cached };
    } catch (e) {
      refund(sid, slot);
      log("memory.search", `scope=${p.scope} users=${p.user_ids.length}`, false, redact(e?.message));
      throw e;
    }
  }
  async function users() {
    const j = await upstream("Qdrant", `${qdrantUrl}/collections/${encodeURIComponent(collection)}/facet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "user_id", limit: 1000, exact: true }) }, []);
    const hits = (j?.result?.hits || []).map(h => ({ user_id: String(h.value), count: h.count }));
    return { users: hits, count: hits.length };
  }
  return { search, users, _state: { vcache, buckets } };
}
