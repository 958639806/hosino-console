// Native OpenClaw inventory/config review, not an AstrBot runtime or SDK shim.
// Verified against openclaw@2026.9.8: plugins lifecycle RPCs have no dryRun,
// baseHash or noRestart admission. They can reload all channels, including QQ.
// Never call them here. A config write additionally needs a locally audited
// plugin, complete empty runtime surfaces, and BOTH live and local `none` rules.
import crypto from "node:crypto";
import path from "node:path";

const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => o != null && Object.hasOwn(o, k);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const BAD_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SECRET = /token|secret|password|passwd|api[-_]?key|apikey|authorization|credential|private[-_]?key|cookie/i;
const SENTINEL = "__OPENCLAW_REDACTED__";
const HIDDEN = "（只写，不导出）";
const MAINTENANCE = "本次只生成变更单，未改运行中的插件；此操作可能重载 QQ 或网关，请在维护时处理。";
const fail = (http, code, message, body) => Object.assign(new Error(message), { http, code, ...(body ? { body } : {}) });
const stale = () => fail(409, "baseHash_mismatch", "配置已被别处修改，请重新载入后再预览");
const plain = v => typeof v === "string" && v.length <= 512 && !/[\x00-\x1f\x7f]/.test(v);
const text = v => String(v ?? "").replace(/\b(?:sk-[\w-]{8,}|xai-[\w-]{8,}|gh[pousr]_[\w]{16,})/g, "••••••")
  .replace(/\b(?:Bearer|Basic)\s+[\w.~+/=-]{6,}/gi, "••••••")
  .replace(/((?:api[_-]?key|token|secret|password|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi, "$1••••••").slice(0, 1000);
function checkJson(value, depth = 0, budget = { n: 0 }) {
  if (++budget.n > 5000 || depth > 12) throw fail(400, "invalid_config", "配置层级或字段数量过多");
  if (typeof value === "number" && !Number.isFinite(value) || value === undefined || typeof value === "function") throw fail(400, "invalid_config", "配置必须是有效 JSON");
  if (typeof value === "string" && value.length > 8192) throw fail(400, "invalid_config", "配置字符串不能超过 8192 字符");
  if (value && typeof value === "object") for (const [k, child] of Object.entries(value)) {
    if (BAD_KEYS.has(k)) throw fail(400, "invalid_config", "配置含不允许的字段名");
    checkJson(child, depth + 1, budget);
  }
}
function merge(a, b) {
  const out = obj(a) ? clone(a) : {};
  for (const [k, v] of Object.entries(b)) out[k] = obj(v) ? merge(out[k], v) : clone(v);
  return out;
}
const DECLARED = ["channels", "providers", "tools", "contracts", "hooks", "mcpServers", "cliCommands", "cliBackends", "skills", "dangerousConfigFlags"];
const COMPONENTS = ["mapped", "skills", "mcpServers", "commands", "hooks", "lspServers"];
function surfaceBlocked(info) {
  if (!obj(info?.declared) || !obj(info?.components)) return true;
  for (const k of DECLARED) if (!Array.isArray(info.declared[k]) || info.declared[k].length) return true;
  for (const k of COMPONENTS) if (!Array.isArray(info.components[k]) || info.components[k].length) return true;
  const missing = info.components.unavailable;
  return !obj(missing) || ["capabilities", "mcpServers", "lspServers"].some(k => !Array.isArray(missing[k]) || missing[k].length);
}
function projectSurface(value, keys) {
  const out = {};
  for (const k of keys) if (Array.isArray(value?.[k])) out[k] = value[k].filter(plain).map(text).slice(0, 200);
  return out;
}
function cleanSchema(schema, depth = 0, secret = false, hints = new Set(), keys = []) {
  if (!obj(schema) || depth > 12) return null;
  const out = {};
  for (const key of ["type", "title", "description", "format", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "writeOnly", "readOnly", "sensitive", "additionalProperties", "required", "enum"]) {
    if (schema[key] !== undefined && !(secret && key === "enum") && !(key === "additionalProperties" && obj(schema[key]))) out[key] = clone(schema[key]);
  }
  if (obj(schema.properties)) out.properties = Object.fromEntries(Object.entries(schema.properties).filter(([k]) => !BAD_KEYS.has(k)).map(([k, s]) => [k, cleanSchema(s, depth + 1, secret || sensitive(k, s, hints, [...keys, k]), hints, [...keys, k])]));
  if (obj(schema.items)) out.items = cleanSchema(schema.items, depth + 1, secret, hints, keys);
  return out;
}
function sensitive(key, schema, hints, keys) {
  return SECRET.test(key) || schema?.writeOnly === true || schema?.sensitive === true || schema?.hint?.sensitive === true || schema?.format === "password" || schema?.items?.writeOnly === true || schema?.items?.sensitive === true || hints.has(JSON.stringify(keys));
}
function publicConfig(value, schema, hints, secrets, keys = []) {
  if (Array.isArray(value)) {
    if (value.some(v => obj(v) || Array.isArray(v))) { secrets.push({ path: keys.join("."), keys, configured: value.length > 0, reason: "structured_array" }); return undefined; }
    return clone(value);
  }
  if (!obj(value)) return clone(value);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (BAD_KEYS.has(k)) continue;
    const next = [...keys, k], field = schema?.properties?.[k];
    if (sensitive(k, field, hints, next) || v === SENTINEL || obj(v) && [v.id, v.name].includes(SENTINEL)) {
      secrets.push({ path: next.join("."), keys: next, configured: v !== null && v !== "" });
    } else {
      const projected = publicConfig(v, field, hints, secrets, next);
      if (projected !== undefined) out[k] = projected;
    }
  }
  return out;
}
function schemaSecrets(schema, value, hints, secrets, keys = [], depth = 0) {
  if (!obj(schema?.properties) || depth > 12) return;
  for (const [k, field] of Object.entries(schema.properties)) {
    if (BAD_KEYS.has(k)) continue;
    const next = [...keys, k], existing = value?.[k];
    if (sensitive(k, field, hints, next)) {
      if (!secrets.some(s => equal(s.keys, next))) secrets.push({ path: next.join("."), keys: next, configured: existing !== undefined && existing !== null && existing !== "" });
    } else schemaSecrets(field, existing, hints, secrets, next, depth + 1);
  }
}
function validate(value, schema, partial = false) {
  if (!obj(schema) || schema.$ref || schema.anyOf || schema.oneOf || schema.allOf || schema.not || schema.pattern || schema.patternProperties) throw fail(409, "schema_unsupported", "此配置 schema 暂不支持安全编辑，可查看当前配置后在维护时处理");
  const type = schema.type;
  if (!type || Array.isArray(type)) throw fail(409, "schema_unsupported", "此字段的类型尚不能确认，暂不允许保存");
  const valid = type === "object" ? obj(value) : type === "array" ? Array.isArray(value) : type === "integer" ? Number.isSafeInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : type === "null" ? value === null : typeof value === type;
  if (!valid || value === null) throw fail(400, "invalid_config", "配置值的类型不符合 schema；本轮不支持删除字段");
  if (schema.enum && (!Array.isArray(schema.enum) || !schema.enum.some(v => equal(v, value)))) throw fail(400, "invalid_config", "配置值不在允许的选项内");
  if (typeof value === "string" && (value.length < (schema.minLength || 0) || value.length > (schema.maxLength ?? 8192))) throw fail(400, "invalid_config", "配置字符串长度不符合要求");
  if (typeof value === "number" && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw fail(400, "invalid_config", "配置数值超出允许范围");
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? 1000)) throw fail(400, "invalid_config", "配置列表长度不符合要求");
    if (!obj(schema.items) || !["string", "number", "integer", "boolean"].includes(schema.items.type) || value.some(v => obj(v) || Array.isArray(v))) throw fail(409, "schema_unsupported", "结构化列表暂只支持查看，请在维护时编辑");
    for (const item of value) validate(item, schema.items, partial);
  }
  if (obj(value)) {
    if (!obj(schema.properties)) throw fail(409, "schema_unsupported", "网关没有返回可编辑字段");
    for (const [k, v] of Object.entries(value)) {
      if (!own(schema.properties, k)) throw fail(400, "invalid_config", "配置含 schema 未声明的字段");
      if (schema.properties[k]?.readOnly) throw fail(403, "config_read_only", "此配置字段只能查看");
      validate(v, schema.properties[k], partial);
    }
    if (!partial && schema.required?.some(k => !own(value, k))) throw fail(400, "invalid_config", "配置缺少必填字段");
  }
}
function requiredFields(value, schema) {
  if (!obj(value) || !obj(schema?.properties)) return;
  if (schema.required?.some(k => !own(value, k))) throw fail(400, "invalid_config", "配置缺少必填字段");
  for (const [k, child] of Object.entries(value)) if (obj(child)) requiredFields(child, schema.properties[k]);
}

export function makePluginCenter({ call, reloadPlan, protectedPlugins = () => new Map(), quietGuard = () => {}, onChanged = () => {}, safeConfigPlugins = new Set(), now = Date.now, ttlMs = 5 * 60e3 } = {}) {
  if (typeof call !== "function" || typeof reloadPlan !== "function") throw new TypeError("call and reloadPlan are required");
  const plans = new Map(); let writing = false;
  const ownerHash = owner => crypto.createHash("sha256").update(owner == null ? "local-module-owner" : String(owner)).digest("hex");
  const prune = () => { for (const [id, p] of plans) if (p.expiresAt <= now()) plans.delete(id); };
  const rpc = async (method, params, timeout = 15000) => {
    try { const result = await call(method, params, timeout); if (!obj(result) || result.ok === false) throw new Error(); return result; }
    catch (e) {
      if (["UNKNOWN_METHOD", "METHOD_NOT_FOUND", "NOT_IMPLEMENTED"].includes(e?.code)) throw fail(501, "not_ready", "当前网关尚不支持此原生插件接口");
      if (method === "config.patch" && /hash|stale|revision|changed/i.test(String(e?.code || "") + String(e?.message || ""))) throw stale();
      throw fail(502, "plugin_upstream", "网关操作状态尚未确认，请刷新后检查；不自动重试写入");
    }
  };
  async function snapshot() {
    const [raw, list] = await Promise.all([rpc("config.get", {}), rpc("plugins.list", {})]);
    let cfg = raw.config || raw.parsed;
    if (!cfg && typeof raw.raw === "string") try { cfg = JSON.parse(raw.raw); } catch {}
    if (!obj(cfg) || !Array.isArray(list.plugins)) throw fail(502, "plugin_upstream", "网关没有返回有效插件或配置数据");
    const hash = raw.hash || raw.baseHash;
    if (!plain(hash) || !hash) throw fail(502, "plugin_upstream", "网关没有返回配置版本，暂时无法生成变更单");
    const plugins = list.plugins.filter(p => obj(p) && plain(p.id) && p.id).slice(0, 1000);
    const protectedMap = new Map([...["openclaw-mem0", "openclaw-qqbot", "qq-group-owner-guard", "qq-group-followup-gate"].map(id => [id, "核心渠道、记忆或本地守卫"])]);
    let extra; try { extra = typeof protectedPlugins === "function" ? await protectedPlugins(cfg, plugins) : protectedPlugins; } catch { throw fail(502, "plugin_upstream", "暂时无法核对受保护插件"); }
    for (const [id, why] of extra instanceof Map ? extra : Object.entries(extra || {})) protectedMap.set(id, text(why));
    for (const [slot, id] of Object.entries(cfg.plugins?.slots || {})) if (typeof id === "string") protectedMap.set(id, `槽位：${text(slot)}`);
    const channels = new Set(Object.keys(cfg.channels || {}));
    for (const p of plugins) if ((Array.isArray(p.channelIds) ? p.channelIds : []).some(ch => channels.has(ch)) || channels.has(p.id) || channels.has(p.id.replace(/^openclaw-/, ""))) protectedMap.set(p.id, "已配置的消息渠道");
    for (const src of cfg.plugins?.load?.paths || []) if (typeof src === "string") protectedMap.set(path.basename(src.replace(/\/+$/, "")), "本地加载的插件");
    for (const p of plugins) if (protectedMap.has(p.id)) for (const sibling of plugins) if (p.packageName && p.packageName === sibling.packageName || p.clawhubPackage && p.clawhubPackage === sibling.clawhubPackage) protectedMap.set(sibling.id, "与受保护插件属于同一安装包");
    return { cfg, hash, plugins, protectedMap, valid: raw.valid === true, mutationAllowed: list.mutationAllowed === true };
  }
  const find = (s, id) => { const p = s.plugins.find(p => p.id === id); if (!p) throw fail(404, "plugin_not_found", "插件不存在"); return p; };
  const caps = (s, p) => ({ configure: false, previewConfig: ID.test(p.id) && !s.protectedMap.has(p.id), enable: false, disable: false, uninstall: false });
  const projected = (s, p) => ({ id: p.id, name: text(p.name || p.id), description: text(p.description), version: text(p.version), origin: text(p.origin), installed: p.installed === true, enabled: p.enabled === true,
    runtime: text(typeof p.runtime === "string" ? p.runtime : p.runtime?.state || p.state || "unknown"), error: p.runtime?.error || p.error ? "插件报告运行异常，请在受控诊断中检查" : null,
    protected: s.protectedMap.has(p.id), protectedReason: s.protectedMap.get(p.id) || null, capabilities: caps(s, p), kind: Array.isArray(p.kind) ? p.kind.filter(plain).map(text) : [] });
  async function inspection(s, id) {
    const p = find(s, id), info = await rpc("plugins.inspect", { pluginId: id });
    if (!obj(info.plugin) || info.plugin.id !== id) throw fail(502, "plugin_upstream", "网关返回的插件详情不匹配");
    let lookup = null;
    if (ID.test(id)) try { lookup = await rpc("config.schema.lookup", { path: `plugins.entries.${id}.config` }, 8000); } catch {}
    const schema = obj(lookup?.schema) ? lookup.schema : null, hints = new Set();
    for (const c of Array.isArray(lookup?.children) ? lookup.children : []) if (c?.hint?.sensitive && typeof c.key === "string") hints.add(JSON.stringify([c.key]));
    const config = s.cfg.plugins?.entries?.[id]?.config;
    return { p, info, lookup, schema, hints, config: obj(config) ? config : {}, hasConfig: (config === undefined || obj(config)) && lookup?.hint?.sensitive !== true };
  }
  function admission(s, d, secretChanged = false) {
    if (s.protectedMap.has(d.p.id)) return { code: "plugin_protected", reason: "此插件保护现有 QQ、记忆或本地守卫，只能查看" };
    if (!s.valid || !s.mutationAllowed) return { code: "read_only", reason: "网关当前不允许插件配置写入" };
    if (!d.schema || !d.hasConfig) return { code: "schema_unavailable", reason: "无法确认完整配置 schema，只能查看" };
    if (secretChanged) return { code: "secret_write_required", reason: "本次包含只写密钥，变更单不保存密钥原值；请在密钥中心维护" };
    if (!safeConfigPlugins.has(d.p.id) || surfaceBlocked(d.info)) return { code: "maintenance_required", reason: MAINTENANCE };
    if (d.lookup?.reloadKind !== "none") return { code: "channel_restart_required", reason: MAINTENANCE };
    return null;
  }
  async function detail(id) {
    if (!plain(id) || !id) throw fail(400, "bad_request", "需要插件 ID");
    const s = await snapshot(), d = await inspection(s, id), secretFields = [];
    const values = d.lookup?.hint?.sensitive ? {} : publicConfig(d.config, d.schema, d.hints, secretFields), why = admission(s, d);
    if (d.lookup?.hint?.sensitive) secretFields.push({ path: "配置", keys: [], configured: Object.keys(d.config).length > 0 });
    else schemaSecrets(d.schema, d.config, d.hints, secretFields);
    const previewable = !s.protectedMap.has(id) && !!d.schema && d.hasConfig && ID.test(id);
    const plugin = projected(s, d.p); plugin.capabilities.previewConfig = previewable; plugin.capabilities.configure = previewable && !why;
    return { plugin, baseHash: s.hash, readme: null, readmeUrl: null, declared: projectSurface(d.info.declared, DECLARED), components: projectSurface(d.info.components, COMPONENTS),
      config: { values, schema: cleanSchema(d.schema, 0, d.lookup?.hint?.sensitive === true, d.hints), secretFields, previewable, writable: plugin.capabilities.configure, blockedReason: why?.reason || null }, capabilities: plugin.capabilities };
  }
  async function list() {
    const s = await snapshot();
    return { baseHash: s.hash, plugins: s.plugins.filter(p => p.installed || p.enabled).map(p => projected(s, p)), capabilities: { install: false, installPreview: true }, blockedReasons: { lifecycle: MAINTENANCE } };
  }
  async function plan(body, owner) {
    if (!obj(body) || !["config", "install", "enable", "disable", "uninstall"].includes(body.action) || !plain(body.baseHash) || !body.baseHash) throw fail(400, "bad_request", "需要操作类型和当前配置版本");
    prune(); if (plans.size >= 64) throw fail(429, "rate_limited", "变更单过多，请稍后再试");
    const s = await snapshot(); if (body.baseHash !== s.hash) throw stale();
    let diff = [], payload = null, why, apply = "reload", id = body.id, secretChanged = false;
    if (body.action === "install") {
      const source = body.source, spec = body.spec;
      if (!["npm", "official", "clawhub"].includes(source) || !plain(spec) || !spec || /astrbot|\.zip(?:$|\?)|\.py$|https?:|file:|\s|\.\./i.test(spec) || !(source === "official" ? ID.test(spec) : /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?(?:@[A-Za-z0-9][A-Za-z0-9.+_-]*)?$/.test(spec))) throw fail(400, "unsupported_source", "仅接受原生 OpenClaw 包标识，不接受 AstrBot、Python ZIP、URL 或本地路径");
      diff = [{ path: "原生安装候选", before: null, after: { source, spec } }]; why = { code: "maintenance_required", reason: MAINTENANCE };
    } else {
      const p = find(s, id);
      if (s.protectedMap.has(id)) throw fail(403, "plugin_protected", "此插件或同安装包成员受保护，不能生成修改计划");
      if (body.action === "config") {
        const d = await inspection(s, id);
        if (!obj(body.config) || !d.schema || !d.hasConfig || !ID.test(id)) throw fail(409, "schema_unavailable", "无法安全预览此配置");
        checkJson(body.config); validate(body.config, d.schema, true);
        const nextConfig = merge(d.config, body.config), delta = {};
        requiredFields(nextConfig, d.schema);
        const walk = (before, patch, schema, keys = [], out = delta) => {
          for (const [k, value] of Object.entries(patch)) {
            const nextKeys = [...keys, k], field = schema?.properties?.[k], old = before?.[k];
            if (equal(old, value)) continue;
            if (Array.isArray(old) && old.some(v => obj(v) || Array.isArray(v))) throw fail(409, "schema_unsupported", "结构化列表暂只支持查看，请在维护时编辑");
            if (value === SENTINEL || typeof value === "string" && /[•●]{2,}/.test(value)) throw fail(400, "invalid_config", "隐藏占位符不能作为真实配置值提交");
            if (sensitive(k, field, d.hints, nextKeys) || old === SENTINEL) { secretChanged = true; diff.push({ path: nextKeys.join("."), keys: nextKeys, before: old ? "已设置" : "未设置", after: HIDDEN, secretChanged: true }); continue; }
            if (obj(value)) { const child = {}; walk(old, value, field, nextKeys, child); if (Object.keys(child).length) out[k] = child; }
            else { out[k] = clone(value); diff.push({ path: nextKeys.join("."), keys: nextKeys, before: clone(old) ?? null, after: clone(value) }); }
          }
        };
        walk(d.config, body.config, d.schema);
        if (!diff.length) throw fail(400, "no_changes", "没有实际改动");
        why = admission(s, d, secretChanged);
        const next = clone(s.cfg); next.plugins ??= {}; next.plugins.entries ??= {}; next.plugins.entries[id] ??= {}; next.plugins.entries[id].config = nextConfig;
        let rp; try { rp = await reloadPlan(s.cfg, next); } catch { why = { code: "reload_unverified", reason: MAINTENANCE }; }
        apply = rp?.label || "reload";
        if (rp?.restartRequired || apply === "restart") why = { code: "restart_required", reason: MAINTENANCE };
        else if (apply !== "immediate" || (rp?.paths || []).some(p => p.kind !== "none")) why ??= { code: "channel_restart_required", reason: MAINTENANCE };
        payload = { action: "config", id, config: delta };
      } else { why = { code: "maintenance_required", reason: MAINTENANCE }; diff = [{ path: `plugins.${text(id)}.${body.action}`, before: p.enabled, after: body.action === "enable" ? true : body.action === "disable" ? false : "卸载候选" }]; }
    }
    const planId = "pc_" + crypto.randomBytes(16).toString("hex"), expiresAt = now() + ttlMs;
    const verification = body.action === "install" ? { verification: "identifier-only", verifiedNative: false, verificationNote: "仅校验包标识，未下载或验证包类型与兼容性" } : {};
    const result = { planId, baseHash: s.hash, diff, apply, canApply: !why, blockedCode: why?.code || null, blockedReason: why?.reason || null, warning: why ? MAINTENANCE : "仅保存无需重载的已审核配置", secretChanged, expiresAt, ...verification };
    result.export = { format: "json", content: JSON.stringify({ format: "hosino-native-plugin-change-v1", action: body.action, id: id || null, baseHash: s.hash, diff, apply, executable: false, note: MAINTENANCE, ...verification }, null, 2) };
    // Blocked plans retain only safe public facts, never submitted secrets.
    plans.set(planId, { expiresAt, owner: ownerHash(owner), baseHash: s.hash, canApply: !why, code: why?.code, reason: why?.reason, payload: !why ? payload : null });
    return result;
  }
  async function apply(body, owner) {
    if (body?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    prune(); const saved = plans.get(body.planId);
    if (!saved) throw fail(410, "plan_expired", "变更单已过期，请重新预览");
    if (saved.owner !== ownerHash(owner)) throw fail(404, "plan_not_found", "变更单不存在或不属于当前登录会话");
    if (body.baseHash !== saved.baseHash) throw stale();
    if (!saved.canApply) throw fail(saved.code === "plugin_protected" ? 403 : 409, saved.code || "maintenance_required", saved.reason || MAINTENANCE);
    if (writing) throw fail(409, "busy", "另一个插件配置正在保存，请稍后重试");
    writing = true;
    try {
      quietGuard("plugin-center.apply");
      const current = await plan({ ...saved.payload, baseHash: saved.baseHash }, owner);
      plans.delete(current.planId);
      if (!current.canApply) throw fail(409, current.blockedCode || "maintenance_required", current.blockedReason || MAINTENANCE);
      quietGuard("plugin-center.apply"); plans.delete(body.planId);
      const id = saved.payload.id, raw = JSON.stringify({ plugins: { entries: { [id]: { config: saved.payload.config } } } });
      let result; try { result = await rpc("config.patch", { raw, baseHash: saved.baseHash, replacePaths: [], note: "hosino-console: audited native plugin config" }, 30000); } catch (e) { if (e?.code === "baseHash_mismatch") throw stale(); throw e; }
      try { await onChanged(); } catch {}
      return { ok: true, id, applied: true, pendingRestart: result.restart?.scheduled === true || result.restartRequired === true, ...(result.restart?.scheduled || result.restartRequired ? { warning: "网关返回了非预期生效状态，请立即检查；控制台未主动请求重启" } : {}) };
    } finally { writing = false; }
  }
  return { list, detail, plan, apply };
}
