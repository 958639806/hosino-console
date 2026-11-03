// Console secret-store access is write-only: never forward store values or RPC diagnostics.
const NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const NEW_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const err = (http, code, message, body) => Object.assign(new Error(message), { http, code, ...(body ? { body } : {}) });
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function input(body, withValue = false) {
  if (!object(body)) throw err(400, "bad_request", "请求体必须是对象");
  if (typeof body.name !== "string" || !NAME.test(body.name)) throw err(400, "invalid_name", "密钥名格式无效；新增名称应为 2–64 位大写字母、数字或下划线，并以字母开头");
  if (withValue && (typeof body.value !== "string" || !body.value.trim() || body.value.length > 8192)) throw err(400, "invalid_value", "密钥值应为 1–8192 字符的非空字符串");
  if (body.confirm !== true) throw err(400, "confirm_required", "需要 confirm:true 确认");
  return body.name;
}

function stamp(entry) {
  const value = entry.updatedAt ?? entry.updatedAtMs ?? entry.updated_at_ms;
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 253402300799999)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

// Used only for names in the store, and returns config paths, never config values.
function references(configs, names) {
  const used = new Map([...names].map(name => [name, new Set()]));
  const segment = key => /^[A-Za-z0-9_.:@/+-]{1,128}$/.test(key) ? key : "[字段]";
  const add = (name, path) => { if (used.has(name)) used.get(name).add(path || "配置"); };
  const walk = (value, path = "") => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\$\{([A-Z][A-Z0-9_]{0,127})\}/g)) add(match[1], path);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const keys = Object.keys(value);
      const ref = ["env", "secret", "secret-store", "store"].includes(value.source) ||
        ["env", "secret", "secret-store"].includes(value.type) ||
        keys.every(key => ["source", "provider", "id", "name"].includes(key));
      if (ref) { add(value.id, path); add(value.name, path); }
      if (typeof value.secretName === "string") add(value.secretName, path);
    }
    for (const [key, child] of Object.entries(value)) walk(child, Array.isArray(value) ? `${path}[${key}]` : path ? `${path}.${segment(key)}` : segment(key));
  };
  for (const cfg of configs) {
    walk(cfg);
    // The existing MiMo adapter also uses this store entry when no explicit apiKey is set.
    if (cfg.models?.providers?.["xiaomi-token-plan"] && !cfg.models.providers["xiaomi-token-plan"].apiKey) add("XIAOMI_MIMO_API_KEY", "models.providers.xiaomi-token-plan");
    if (!cfg.models?.providers?.["xiaomi-token-plan"] && Object.keys(cfg.agents?.defaults?.models || {}).some(ref => ref.startsWith("xiaomi-token-plan/"))) add("XIAOMI_MIMO_API_KEY", "agents.defaults.models");
  }
  return used;
}

export function makeSecrets({ call, onChanged = () => {} } = {}) {
  if (typeof call !== "function") throw new TypeError("call is required");
  // Only a local write queue. External config changes remain guarded by the gateway.
  let pending = Promise.resolve();
  const write = action => {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  };
  const rpc = async (method, params, timeout = 15000) => {
    try {
      const result = await call(method, params, timeout);
      if (result?.ok === false) throw err(502, "upstream", "网关密钥操作失败，请稍后重试");
      return result;
    }
    catch (e) {
      if (["UNKNOWN_METHOD", "METHOD_NOT_FOUND", "NOT_IMPLEMENTED"].includes(e?.code)) throw err(501, "not_ready", "网关暂不支持密钥管理");
      throw err(502, "secret_upstream", /^(?:secrets\.store\.set|secrets\.store\.delete)$/.test(method) ? "密钥写入或运行时刷新未确认，请检查当前状态；旧值不会自动恢复" : "网关密钥操作失败，请稍后重试");
    }
  };
  const entries = async () => {
    const result = await rpc("secrets.store.list", {}, 10000);
    if (!Array.isArray(result?.entries)) throw err(502, "upstream", "网关未返回密钥列表");
    const found = new Map();
    for (const entry of result.entries) if (object(entry) && typeof entry.name === "string" && NAME.test(entry.name) && !entry.deletedAt && !entry.deleted_at_ms) {
      // Keep the minimum metadata; do not retain the original entry or its value.
      found.set(entry.name, { name: entry.name, kind: entry.kind, set: entry.set !== false, updatedAt: stamp(entry) });
    }
    return found;
  };
  const configs = async () => {
    const result = await rpc("config.get", {});
    if (result?.valid === false) throw err(409, "config_invalid", "当前配置校验不通过，请先修好配置再清除密钥");
    const found = [];
    for (const cfg of [result?.config, result?.parsed]) if (object(cfg)) found.push(cfg);
    if (typeof result?.raw === "string") {
      try { const cfg = JSON.parse(result.raw); if (object(cfg)) found.push(cfg); }
      catch { throw err(502, "upstream", "无法核对配置中的密钥引用，暂不允许清除"); }
    }
    if (!found.length) throw err(502, "upstream", "无法核对配置中的密钥引用，暂不允许清除");
    return found;
  };
  const changed = () => { try { onChanged(); } catch {} };
  return {
    async list() {
      const all = await entries();
      // A config outage must not stop replacing a key; only clearing requires this check.
      let used;
      try { used = references(await configs(), all.keys()); } catch { /* No values or diagnostics leave this method. */ }
      return { secrets: [...all.values()].sort((a, b) => a.name.localeCompare(b.name)).map(entry => ({
        name: entry.name, set: entry.set,
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
        ...(used?.get(entry.name)?.size ? { usedBy: [...used.get(entry.name)].sort() } : {}),
      })) };
    },
    async set(body) {
      const name = input(body, true), value = body.value;
      return write(async () => {
        const all = await entries(), existing = all.get(name);
        if (!existing && !NEW_NAME.test(name)) throw err(400, "invalid_name", "新增密钥名应为 2–64 位大写字母、数字或下划线，并以字母开头");
        if (existing?.kind && !["env", "secret"].includes(existing.kind)) throw err(409, "unsupported_kind", "该密钥类型暂不支持在控制台替换");
        const result = await rpc("secrets.store.set", { name, value, kind: existing?.kind || "env" }, 20000);
        changed();
        return { ok: true, name, set: true, reloaded: result?.reloaded === true, ...(result?.reloaded === false ? { warning: "密钥已保存，但运行时生效状态尚未确认，请刷新状态检查" } : {}) };
      });
    },
    async clear(body) {
      const name = input(body);
      return write(async () => {
        const all = await entries();
        if (!all.has(name)) throw err(404, "not_found", "密钥不存在");
        const usedBy = [...references(await configs(), [name]).get(name)].sort();
        if (usedBy.length) throw err(409, "in_use", "配置还在引用这个密钥，不能清除", { usedBy });
        const result = await rpc("secrets.store.delete", { name }, 20000);
        changed();
        return { ok: true, name, set: false, reloaded: result?.reloaded === true, ...(result?.reloaded === false ? { warning: "密钥已清除，但运行时生效状态尚未确认，请刷新状态检查" } : {}) };
      });
    },
  };
}
