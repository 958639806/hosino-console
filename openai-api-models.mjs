// HOSINO-OPENAI-API-MODELS v1：openai-api（OpenAI 官方 API）可用模型 = 控制台直连 GET /v1/models（不经网关，避免插件发现卡 30 秒）。
// key 只从 openclaw.json 里 openai-api 的 SecretRef 指向的文件读（与网关同一份），只读不落盘、不进日志/响应；10 分钟缓存，失败返回空列表 + 错误说明。
export const OA_PROVIDER = "openai-api";
export const OA_SUFFIX = " · OpenAI 官方 API";
const BASE_DEFAULT = "https://api.openai.com/v1";
const TTL = 10 * 60e3, FAIL_TTL = 60e3;

// 过滤：只留能走 Responses/Chat 的文本模型
export const OA_DROP = [
  /embedding/, /(^|-)tts(-|$)/, /whisper/, /transcribe/, /(^|-)audio(-|$)/, /realtime/, /(^|-)live(-|$)/,
  /image/, /dall-e/, /moderation/, /search/, /computer-use/, /^chat-latest$/, /^(babbage|davinci)/,
];
const DATED = /-\d{4}-\d{2}-\d{2}$/; // 带日期的快照与别名重复，只留别名
export function oaUsable(id) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(id)) return false;
  if (!/^(gpt-|o\d)/.test(id)) return false;
  if (DATED.test(id)) return false;
  return !OA_DROP.some(r => r.test(id));
}
// 命名：gpt-6.1-sol → “GPT-6.1 Sol · OpenAI 官方 API”；gpt-4o-mini → “GPT-4o Mini”；o3 → “o3”
export function oaPretty(id) {
  const parts = String(id).split("-");
  let head;
  if (parts[0] === "gpt" && parts.length > 1) { head = "GPT-" + parts[1]; parts.splice(0, 2); } else { head = parts.shift(); }
  const rest = parts.map(w => /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1));
  return [head, ...rest].join(" ") + OA_SUFFIX;
}
const REASONING = id => /^o\d/.test(id) || /^gpt-([5-9]|\d{2})/.test(id);
// 与现有 gpt-6-luna 条目同形状的最小 provider 模型条目（只填能确定的字段，不猜上下文/价格）
export function oaProviderEntry(id) { return { id, name: oaPretty(id), reasoning: REASONING(id), input: ["text", "image"] }; }

export function makeOpenaiApiModels({ fs, cfgPath, fetchImpl = fetch, now = Date.now, timeoutMs = 15000 }) {
  let cache = null, inflight = null;
  const secretsDir = cfgPath.replace(/[^/]*$/, "") + "secrets/"; // 配置文件同级的 secrets/（与网关 file SecretRef 同一目录）
  const keyAndBase = () => {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const pc = cfg?.models?.providers?.[OA_PROVIDER];
    if (!pc) return { error: "没有配置 openai-api 供应商" };
    const base = String(pc.baseUrl || BASE_DEFAULT).replace(/\/+$/, "");
    const ref = pc.apiKey;
    let key = "";
    if (ref && typeof ref === "object" && ref.source === "file") {
      const sp = cfg?.secrets?.providers?.[ref.provider];
      const file = sp?.source === "file" && typeof sp.path === "string" ? sp.path : null;
      if (!file || !file.startsWith(secretsDir) || file.includes("..")) return { error: "openai-api 的 key 文件路径不在允许范围" };
      try { key = fs.readFileSync(file, "utf8").trim(); } catch { return { error: "读不到 openai-api 的 key 文件" }; }
    } else if (typeof ref === "string" && ref && !/^\$\{/.test(ref)) key = ref.trim();
    if (!key) return { error: "没找到 openai-api 的 key" };
    return { key, base };
  };
  const load = async () => {
    const kb = keyAndBase(); if (kb.error) return { models: [], error: kb.error };
    let r; try { r = await fetchImpl(kb.base + "/models", { headers: { authorization: "Bearer " + kb.key, accept: "application/json", "user-agent": "hosino-console" }, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { return { models: [], error: e?.name === "TimeoutError" ? "OpenAI /v1/models 超时" : "连不上 OpenAI" }; }
    if (!r.ok) return { models: [], error: "OpenAI /v1/models 返回 HTTP " + r.status };
    let j; try { j = await r.json(); } catch { return { models: [], error: "OpenAI 返回了无法解析的响应" }; }
    const ids = [...new Set((Array.isArray(j?.data) ? j.data : []).map(m => m?.id))].filter(oaUsable).sort();
    return { models: ids.map(id => ({ id, provider: OA_PROVIDER, name: oaPretty(id), available: true, source: "openai-direct" })), error: null };
  };
  return {
    async list() {
      if (cache && cache.until > now()) return cache.v;
      if (inflight) return inflight;
      inflight = load().catch(() => ({ models: [], error: "拉取 OpenAI 模型失败" })).then(v => { cache = { v: { ...v, fetchedAt: now() }, until: now() + (v.error ? FAIL_TTL : TTL) }; return cache.v; }).finally(() => { inflight = null; });
      return inflight;
    },
    drop() { cache = null; },
  };
}
