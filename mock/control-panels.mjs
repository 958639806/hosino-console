// Development-only fixtures. All writes stay in memory and every upstream is fake.
import { makeAllowlist } from "../allowlist.mjs";
import { makeSecrets } from "../secrets.mjs";
import { makeMemorySearch } from "../memory-search.mjs";
import { makeModelAuth } from "../model-auth.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const NOTE = "MOCK 演示：只操作内存假数据，不连接真实服务，重启后重置。";
const error = (http, code, message) => Object.assign(new Error(message), { http, code });
const diffPaths = (a, b, prefix = "", out = []) => {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[key], b[key], prefix ? prefix + "." + key : key, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix);
  return out;
};

export function makeControlPanels({ memories, initialConfig = {}, initialModels = [], initialAuth = {} }) {
  const config = clone(initialConfig);
  config.channels ??= {};
  config.channels.qqbot ??= {};
  Object.assign(config.channels.qqbot, { allowFrom: ["mock-owner"], groupAllowFrom: ["mock-group"] });
  config.tools = { ...(config.tools || {}), allow: ["group:fs", "web_search"], deny: ["exec"] };
  config.models ??= {};
  config.models.providers ??= {};
  config.models.providers["mock-provider"] = { apiKey: "${MOCK_IN_USE_KEY}", baseUrl: "https://example.invalid/mock-api", api: "openai-completions", models: [{ id: "mock-model", name: "MOCK 模型" }] };
  const store = new Map([
    ["MOCK_DEMO_KEY", { value: "mock-unused-value", kind: "env", updatedAt: Date.now() }],
    ["MOCK_IN_USE_KEY", { value: "mock-referenced-value", kind: "env", updatedAt: Date.now() }]
  ]);
  const authStatus = { ...clone(initialAuth), providers: [...clone(initialAuth.providers || []), { provider: "mock-provider", authProvider: "mock-provider", status: "ok", profiles: [{ profileId: "mock-provider:demo-1", type: "oauth", status: "ok" }, { profileId: "mock-provider:demo-2", type: "oauth", status: "ok" }] }],
    providerCapabilities: [{ provider: "mock-provider", loginOptions: [{ id: "mock-provider/oauth", brandId: "mock-provider", label: "MOCK OAuth 演示（不做真实授权）", kind: "oauth" }] }] };
  const authRow = authStatus.providers.at(-1), wizards = new Map();
  const wizardView = wizard => {
    if (wizard.status !== "running") return { done: true, status: wizard.status };
    return { done: false, status: "running", step: wizard.index === 0
      ? { id: "mock-disclaimer", type: "note", title: "MOCK 授权演示", message: "这里只演示登录步骤，不做真实授权。链接使用 example.invalid，无需打开，不要提供真实密钥。", externalUrl: "https://example.invalid/mock-authorization" }
      : { id: "mock-confirm", type: "confirm", title: "MOCK：创建演示账号", message: "确认只会在当前 dev 服务内存中新增一个假账号，重启后消失。" } };
  };
  let revision = 1;
  const call = async (method, params = {}) => {
    if (method === "config.get") return { config: clone(config), valid: true, hash: "mock-h" + revision };
    if (method === "config.schema.lookup") return { reloadKind: "hot", schema: { type: "array", items: { type: "string" } } };
    if (method === "config.patch") {
      if (params.baseHash !== "mock-h" + revision) throw error(409, "CONFLICT", "config base hash changed");
      const merge = (dst, src) => { for (const [key, value] of Object.entries(src)) { if (["__proto__", "prototype", "constructor"].includes(key)) throw error(400, "bad_request", "MOCK 不支持此字段"); if (value && typeof value === "object" && !Array.isArray(value)) merge(dst[key] ??= {}, value); else dst[key] = value; } };
      merge(config, JSON.parse(params.raw)); revision++;
      return { ok: true, hash: "mock-h" + revision, restart: { required: false } };
    }
    if (method === "secrets.store.list") return { entries: [...store].map(([name, entry]) => ({ name, kind: entry.kind, set: true, updatedAt: entry.updatedAt })) };
    if (method === "secrets.store.set") { store.set(params.name, { value: params.value, kind: params.kind, updatedAt: Date.now() }); return { ok: true, reloaded: true }; }
    if (method === "secrets.store.delete") { store.delete(params.name); return { ok: true }; }
    if (method === "models.authStatus") return clone(authStatus);
    if (method === "models.authOrderSet") { const row = authStatus.providers.find(p => p.provider === params.provider); if (!row) throw error(404, "not_found", "MOCK 供应商不存在"); row.profileOrder = [...params.profileIds]; return { ok: true }; }
    if (method === "models.authLogin") {
      if (params.authChoice !== "mock-provider/oauth") throw error(400, "bad_request", "MOCK 登录方式不支持");
      const wizard = { status: "running", index: 0 }; wizards.set(params.sessionId, wizard);
      return { sessionId: params.sessionId, ...wizardView(wizard) };
    }
    if (["wizard.next", "wizard.cancel"].includes(method)) {
      const wizard = wizards.get(params.sessionId); if (!wizard) throw error(404, "not_found", "MOCK 登录向导不存在");
      if (method === "wizard.cancel" && wizard.status === "running") wizard.status = "cancelled";
      if (method === "wizard.next" && wizard.status === "running" && params.answer) {
        const step = wizardView(wizard).step;
        if (params.answer.stepId !== step.id) throw error(409, "step_changed", "MOCK 登录步骤已变化");
        if (wizard.index === 0) wizard.index++;
        else if (params.answer.value !== true) wizard.status = "cancelled";
        else {
          wizard.status = "done";
          authRow.profiles.push({ profileId: "mock-provider:demo-" + (authRow.profiles.length + 1), type: "oauth", status: "ok" });
        }
      }
      return wizardView(wizard);
    }
    throw error(501, "METHOD_NOT_FOUND", "MOCK 未模拟此网关方法");
  };
  const allowlist = makeAllowlist({ call, reloadPlan: async (before, after) => ({ paths: diffPaths(before, after).map(path => ({ path, kind: "hot", label: "reload" })), restartRequired: false }) });
  const secrets = makeSecrets({ call });
  const auth = makeModelAuth({ call });

  // The real memory module supplies validation, filters, cache and rate limits.
  // Its injected fetch never performs network I/O. Scores below are illustrative.
  const queries = new Map(); let vectorId = 0;
  const memory = makeMemorySearch({
    readCfg: () => ({ plugins: { entries: { "openclaw-mem0": { config: { oss: { embedder: { config: { apiKey: "mock-embedding-key", model: "MOCK-keyword-demo", baseURL: "https://embedding.example.invalid" } } } } } } } }),
    qdrantUrl: "https://qdrant.example.invalid", collection: "mock-memory",
    fetchImpl: async (url, options) => {
      const b = JSON.parse(options.body || "{}");
      const response = value => ({ ok: true, status: 200, json: async () => value });
      if (url === "https://embedding.example.invalid/embeddings") {
        const id = ++vectorId; queries.set(id, b.input[0]);
        if (queries.size > 600) queries.delete(queries.keys().next().value);
        return response({ data: [{ embedding: [id] }] });
      }
      if (url.endsWith("/facet")) {
        const counts = new Map(); for (const m of memories()) if (m.user_id) counts.set(m.user_id, (counts.get(m.user_id) || 0) + 1);
        return response({ result: { hits: [...counts].map(([value, count]) => ({ value, count })) } });
      }
      if (url.endsWith("/points/query")) {
        const q = String(queries.get(b.query[0]) || "").toLowerCase();
        const matches = (m, f) => f.key === "user_id" ? (f.match?.any || []).includes(m.user_id) : f.key === "oc_visibility" ? (m.subj?.startsWith("group:") ? "group" : "private") === f.match?.value : f.key === "createdAt" ? m.createdAt >= Date.parse(f.range.gte) : true;
        const points = memories().filter(m => (b.filter?.must || []).every(f => matches(m, f)) && (b.filter?.must_not || []).every(f => !matches(m, f)))
          .map((m, i) => ({ id: m.id, score: m.data.toLowerCase().includes(q) ? 0.97 : Math.max(0.3, 0.74 - i * 0.03), payload: { data: "[MOCK 示例] " + m.data, user_id: m.user_id, createdAt: new Date(m.createdAt).toISOString(), oc_visibility: m.subj?.startsWith("group:") ? "group" : "private", oc_source_channel: "qqbot" } }))
          .filter(m => m.score >= (b.score_threshold || 0)).sort((a, b) => b.score - a.score).slice(0, b.limit);
        return response({ result: { points } });
      }
      throw error(502, "upstream", "MOCK 未模拟此向量请求");
    }
  });
  const routes = {
    "GET /api/allowlist": async () => { const r = await allowlist.read(); return { ...r, lists: r.lists.map(l => ({ ...l, label: "MOCK · " + l.label })) }; },
    "POST /api/allowlist/preview": allowlist.preview,
    "POST /api/allowlist/apply": allowlist.apply,
    "GET /api/secrets": secrets.list,
    "POST /api/secrets/set": secrets.set,
    "POST /api/secrets/clear": secrets.clear,
    "GET /api/memory/users": memory.users,
    "POST /api/memory/search": body => memory.search(body, "mock-owner"),
    "GET /api/models/auth": async () => clone(authStatus),
    "GET /api/models/manage": async () => ({ baseHash: "mock-h" + revision, primary: "xai/grok-4", fallbacks: [], apiTypes: ["openai-completions", "openai-responses", "anthropic-messages"],
      providers: [...new Set([...initialModels.map(m => m.provider), "mock-provider"])].map(provider => ({ provider, configured: true, baseUrl: "https://example.invalid/mock-api", api: "openai-completions", credential: { kind: "oauth", editable: false, note: "MOCK 演示" },
        ...auth.describe(authStatus, provider), models: (provider === "mock-provider" ? [{ id: "mock-model", name: "MOCK 模型" }] : initialModels.filter(m => m.provider === provider)).map(m => ({ ref: provider + "/" + m.id, id: m.id, name: m.name, inProvider: true, inAllowlist: true, inGateway: false, isPrimary: provider === "xai" && m.id === "grok-4", fallbackIndex: -1 })) })) }),
    "POST /api/models/auth/login": body => auth.start(body, "mock-owner"),
    "POST /api/models/auth/order": auth.order
  };
  const knownPaths = new Set(Object.keys(routes).map(key => key.slice(key.indexOf(" ") + 1)));
  return {
    config,
    logout: () => auth.closeOwner("mock-owner"),
    handles: (method, pathname) => knownPaths.has(pathname) || pathname.startsWith("/api/models/auth/login/"),
    async handle(method, pathname, body) {
      let fn = routes[method + " " + pathname];
      const flow = /^\/api\/models\/auth\/login\/([a-f0-9]{48})(?:\/(answer|cancel))?$/.exec(pathname);
      if (flow) {
        if (method === "GET" && !flow[2]) fn = () => auth.poll(flow[1], "mock-owner");
        if (method === "POST" && flow[2] === "answer") fn = b => auth.answer(flow[1], b, "mock-owner");
        if (method === "POST" && flow[2] === "cancel") fn = b => auth.cancel(flow[1], b, "mock-owner");
      }
      if (!fn) throw error(405, "method_not_allowed", "MOCK：请求方法不支持");
      return { ...await fn(body), mock: true, note: NOTE };
    }
  };
}
