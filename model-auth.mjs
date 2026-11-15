// Bridge the official gateway wizard protocol; no credentials or auth URLs are logged here.
import crypto from "node:crypto";

const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FLOW_ID = /^[a-f0-9]{48}$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const err = (http, code, message, body) => Object.assign(new Error(message), { http, code, ...(body ? { body } : {}) });
const shortString = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normalizedEscapes = value => value.replace(/%[\da-f]{2}/gi, part => part.toUpperCase()).replace(/\\u([\da-f]{4})/gi, (_, code) => "\\u" + code.toUpperCase());
const redactExact = (value, secrets = []) => {
  let text = normalizedEscapes(String(value ?? "")); const variants = new Set();
  for (const secret of secrets) if (secret) {
    const forms = [secret, JSON.stringify(secret).slice(1, -1), secret.split("").map(char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")).join("")];
    try { forms.push(encodeURIComponent(secret), encodeURI(secret), new URLSearchParams({ v: secret }).toString().slice(2)); } catch {}
    const base64 = Buffer.from(secret).toString("base64"); forms.push(base64, base64.replace(/=+$/, ""), Buffer.from(secret).toString("base64url"));
    for (const form of forms) { variants.add(normalizedEscapes(form)); variants.add(normalizedEscapes(JSON.stringify(form).slice(1, -1))); variants.add(normalizedEscapes(form.replace(/\//g, "\\/"))); }
  }
  for (const variant of [...variants].sort((a, b) => b.length - a.length)) text = text.split(variant).join("••••••");
  return text;
};
const cleanText = (value, secrets = [], max = 4000) => redactExact(value, secrets).replace(/\b(?:sk-[\w-]{6,}|xai-[\w-]{6,}|gh[pousr]_[\w]{16,}|github_pat_[\w]{16,})/g, "••••••")
    .replace(/\b(?:Bearer|Basic)\s+[\w.~+/=-]{6,}/gi, "••••••")
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|authorization|token)\s*["']?\s*[:=]\s*["']?)[^\s"',;&}]{2,}/gi, "$1••••••")
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, "••••••").slice(0, max);
function safeUrl(value, secrets = []) {
  if (!shortString(value, 8192)) return null;
  if (redactExact(value, secrets).includes("••••••")) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return url.href;
  } catch { return null; }
}
function confirmed(body) {
  if (!object(body)) throw err(400, "bad_request", "请求体必须是对象");
  if (body.confirm !== true) throw err(400, "confirm_required", "需要 confirm:true 确认");
}
function providerOf(body) {
  confirmed(body);
  if (typeof body.provider !== "string" || !PROVIDER.test(body.provider)) throw err(400, "bad_request", "供应商名称无效");
  return body.provider;
}

export function makeModelAuth({ call, onChanged = () => {}, quietGuard = () => {}, now = Date.now, ttlMs = 15 * 60e3, maxSessions = 32 } = {}) {
  if (typeof call !== "function") throw new TypeError("call is required");
  const flows = new Map(); let starting = null;
  const changed = () => { try { onChanged(); } catch {} };
  const ownerOf = sid => {
    if (!shortString(sid, 512)) throw err(401, "unauthorized", "请先登录");
    return crypto.createHash("sha256").update(sid).digest("hex");
  };
  const describe = (auth, provider) => {
    const all = Array.isArray(auth?.providers) ? auth.providers : [];
    const row = all.find(p => p?.provider === provider) || all.find(p => p?.authProvider === provider);
    const authProvider = PROVIDER.test(row?.authProvider || "") ? row.authProvider : provider;
    const profiles = [...new Set((Array.isArray(row?.profiles) ? row.profiles : []).map(p => p?.profileId ?? p?.id).filter(p => shortString(p, 512)))];
    const preferred = Array.isArray(row?.profileOrder) ? row.profileOrder.filter(p => profiles.includes(p)) : [];
    const ordered = [...new Set([...preferred, ...profiles])];
    const options = (Array.isArray(auth?.providerCapabilities) ? auth.providerCapabilities : []).filter(c => c?.provider === authProvider || c?.provider === provider)
      .flatMap(c => Array.isArray(c.loginOptions) ? c.loginOptions : []).filter(o => ["oauth", "device-code"].includes(o?.kind) && shortString(o.id, 1024));
    const loginMethods = [...new Map(options.map(o => [o.id, { id: o.id, label: cleanText(o.label || provider, [], 200), kind: o.kind }])).values()];
    const orderLocked = !!row?.profileOrderLocked;
    return { capabilities: { login: loginMethods.length > 0, order: ordered.length > 1 && !orderLocked }, loginMethods, profiles: ordered, orderLocked, authProvider };
  };
  const rpc = async (method, params, timeout = 20000) => {
    try {
      const result = await call(method, params, timeout);
      if (result?.ok === false) throw err(502, "upstream", "网关认证操作失败");
      return result;
    } catch (e) {
      if (["UNKNOWN_METHOD", "METHOD_NOT_FOUND", "NOT_IMPLEMENTED"].includes(e?.code) || /unknown method|method not found|not implemented/i.test(e?.message || "")) throw err(501, "not_ready", "网关暂不支持这个认证操作");
      if (method === "models.authOrderSet" && /priority.*controlled|controlled by.*configuration/i.test(e?.message || "")) throw err(409, "order_locked", "账号顺序受配置管理，控制台不能修改");
      throw err(502, "auth_upstream", "网关认证操作未完成，请刷新模型状态后重试；已经保存的凭据不会自动撤销");
    }
  };
  const terminate = async flow => {
    try {
      const result = await rpc("wizard.cancel", { sessionId: flow.sessionId }, 15000);
      if (["done", "cancelled", "error"].includes(result?.status)) {
        flow.state = result.status;
        flow.step = null;
        if (result.status === "error") flow.error = "登录未完成，请检查模型登录状态后重试";
        if (result.status === "done") changed();
      }
      return result;
    } catch { return null; }
  };
  const retire = flow => {
    clearTimeout(flow.timer);
    flows.delete(flow.id);
    flow.redactions.length = 0; flow.optionValues?.clear(); flow.step = null; flow.url = null; flow.userCode = null;
    if (flow.state === "pending") void terminate(flow);
  };
  const prune = () => {
    for (const flow of flows.values()) if (now() >= flow.expiresAt) retire(flow);
  };
  const get = (id, sid) => {
    const owner = ownerOf(sid); prune();
    const flow = FLOW_ID.test(id || "") && flows.get(id);
    if (!flow || flow.owner !== owner) throw err(404, "not_found", "登录向导不存在或已经过期，请重新开始");
    return flow;
  };
  const normalizeStep = (step, flow) => {
    if (!object(step) || !shortString(step.id, 128) || !["note", "progress", "text", "select", "confirm", "multiselect", "action"].includes(step.type)) throw err(502, "auth_upstream", "网关返回了无法显示的登录步骤");
    const normalized = { id: step.id, type: step.type, requiresAnswer: !["progress"].includes(step.type) && !(step.type === "action" && step.executor !== "client") };
    for (const key of ["title", "message", "placeholder"]) if (typeof step[key] === "string") normalized[key] = cleanText(step[key], flow.redactions);
    if (step.sensitive === true) normalized.sensitive = true;
    if (["client", "gateway"].includes(step.executor)) normalized.executor = step.executor;
    const url = safeUrl(step.externalUrl, flow.redactions);
    if (url) { normalized.externalUrl = url; flow.url = url; }
    if (object(step.deviceCode) && shortString(step.deviceCode.code, 128) && !redactExact(step.deviceCode.code, flow.redactions).includes("••••••")) {
      normalized.deviceCode = { code: step.deviceCode.code };
      if (Number.isInteger(step.deviceCode.expiresInMinutes) && step.deviceCode.expiresInMinutes > 0 && step.deviceCode.expiresInMinutes <= 1440) normalized.deviceCode.expiresInMinutes = step.deviceCode.expiresInMinutes;
      flow.userCode = normalized.deviceCode.code;
    }
    if (["select", "multiselect"].includes(step.type)) {
      if (!Array.isArray(step.options) || step.options.length > 500) throw err(502, "auth_upstream", "网关返回的登录选项无效");
      flow.optionValues = new Map();
      normalized.options = step.options.map(option => {
        let encoded; try { encoded = JSON.stringify(option?.value); } catch {}
        if (!object(option) || !encoded || encoded.length > 4096 || typeof option.label !== "string") throw err(502, "auth_upstream", "网关返回的登录选项无效");
        const id = "option-" + crypto.randomBytes(12).toString("hex");
        flow.optionValues.set(id, JSON.parse(encoded));
        return { value: id, label: cleanText(option.label, flow.redactions, 300), ...(typeof option.hint === "string" ? { hint: cleanText(option.hint, flow.redactions, 500) } : {}) };
      });
    }
    return normalized;
  };
  const accept = (flow, result) => {
    if (flow.state !== "pending" || !flows.has(flow.id)) return;
    if (!object(result)) throw err(502, "auth_upstream", "网关没有返回登录状态");
    if (["done", "error", "cancelled"].includes(result.status)) {
      flow.state = result.status; flow.step = null; flow.url = null; flow.userCode = null; flow.redactions.length = 0;
      flow.optionValues?.clear();
      if (flow.state === "error") flow.error = "登录没有完成，请检查模型登录状态后重试；已经保存的凭据不会自动撤销";
      if (flow.state === "done") changed();
      return;
    }
    if (result.status !== "running" || result.done === true) throw err(502, "auth_upstream", "网关返回了无法识别的登录状态");
    flow.step = result.step ? normalizeStep(result.step, flow) : null;
  };
  const view = flow => ({
    pollId: flow.id, state: flow.state, flow: flow.userCode ? "device" : "url", step: flow.step,
    ...(flow.url ? { url: flow.url } : {}), ...(flow.userCode ? { userCode: flow.userCode } : {}),
    ...(flow.error ? { error: flow.error } : {}),
  });
  const kick = (flow, answer) => {
    quietGuard("models.auth.login.poll");
    if (flow.pending || flow.state !== "pending") return;
    const remaining = Math.max(1, flow.expiresAt - now());
    flow.pending = rpc("wizard.next", { sessionId: flow.sessionId, ...(answer ? { answer } : {}) }, remaining)
      .then(result => accept(flow, result)).catch(() => {
        if (flow.state !== "pending" || !flows.has(flow.id)) return;
        flow.state = "error"; flow.step = null; flow.error = "查询登录状态失败，请刷新模型状态后重试；已经保存的凭据不会自动撤销";
        void terminate(flow);
      }).finally(() => { flow.pending = null; });
  };
  return {
    describe,
    async start(body, sid) {
      const provider = providerOf(body), owner = ownerOf(sid); prune();
      if (starting || [...flows.values()].some(flow => flow.state === "pending")) throw err(429, "auth_busy", "已有登录向导正在运行，请先完成或取消它");
      if (flows.size >= maxSessions) throw err(429, "rate_limited", "登录向导过多，请稍后再试");
      const admission = { owner, cancelled: false }; starting = admission; let flow;
      try {
        quietGuard("models.auth.login");
        const auth = await rpc("models.authStatus", {}), metadata = describe(auth, provider);
        if (admission.cancelled) throw err(404, "not_found", "登录会话已结束，请重新登录控制台后再试");
        const chosen = body.method === undefined && metadata.loginMethods.length === 1 ? metadata.loginMethods[0] : metadata.loginMethods.find(method => method.id === body.method);
        if (!chosen) throw err(409, "login_unavailable", "登录方式不可用，请刷新后选择当前可用的登录方式");
        quietGuard("models.auth.login");
        const id = crypto.randomBytes(24).toString("hex");
        flow = { id, owner, sessionId: crypto.randomUUID(), expiresAt: now() + ttlMs, state: "pending", step: null, redactions: [], pending: null };
        flows.set(id, flow);
        flow.timer = setTimeout(() => retire(flow), Math.max(1, ttlMs)); flow.timer.unref?.();
        const result = await rpc("models.authLogin", { sessionId: flow.sessionId, authChoice: chosen.id }, 30000);
        if (!flows.has(id)) { void terminate(flow); throw err(404, "not_found", "登录向导已结束或过期，请重新开始"); }
        accept(flow, result);
        return view(flow);
      } catch (e) {
        if (flow && flows.has(flow.id)) retire(flow);
        throw e;
      } finally { if (starting === admission) starting = null; }
    },
    poll(id, sid) {
      const flow = get(id, sid);
      if (flow.state === "pending" && !flow.pending && !flow.step?.requiresAnswer) kick(flow);
      return view(flow);
    },
    answer(id, body, sid) {
      confirmed(body); const flow = get(id, sid), step = flow.step;
      if (flow.state !== "pending" || flow.pending || !step?.requiresAnswer || body.stepId !== step.id) throw err(409, "step_changed", "登录步骤已经变化，请重新获取当前步骤");
      const value = body.value; let gatewayValue = value;
      if (step.type === "text" && (typeof value !== "string" || value.length > 8192)) throw err(400, "invalid_value", "输入应为不超过 8192 字符的文本");
      if (step.type === "confirm" && typeof value !== "boolean") throw err(400, "invalid_value", "请选择确认或拒绝");
      if (step.type === "select" && !step.options.some(option => same(option.value, value))) throw err(400, "invalid_value", "请选择当前列表中的选项");
      if (step.type === "multiselect" && (!Array.isArray(value) || value.length > step.options.length || new Set(value.map(v => JSON.stringify(v))).size !== value.length || !value.every(v => step.options.some(option => same(option.value, v))))) throw err(400, "invalid_value", "请选择当前列表中的选项");
      if (step.type === "select") gatewayValue = flow.optionValues.get(value);
      if (step.type === "multiselect") gatewayValue = value.map(id => flow.optionValues.get(id));
      if (["note", "action"].includes(step.type) && value !== undefined && value !== true) throw err(400, "invalid_value", "请确认继续当前步骤");
      quietGuard("models.auth.login.answer");
      if (step.type === "text" && value) {
        flow.redactions.push(value);
        try { for (const [key, part] of new URL(value).searchParams) if (/code|token|secret|password/i.test(key) && part) flow.redactions.push(part); } catch {}
        flow.redactions = flow.redactions.slice(-64);
      }
      kick(flow, { stepId: step.id, ...(gatewayValue !== undefined ? { value: gatewayValue } : {}) });
      flow.step = null;
      flow.optionValues?.clear();
      return view(flow);
    },
    async cancel(id, body, sid) {
      confirmed(body); const flow = get(id, sid);
      if (flow.state !== "pending") return view(flow);
      const result = await terminate(flow);
      if (!result) throw err(502, "auth_upstream", "未能确认登录已取消，请刷新模型状态后再检查");
      if (flow.state === "pending") return { ...view(flow), warning: "凭据保存已进入不能取消的阶段，请等待结果；关闭页面不会撤销已保存的账号" };
      flow.url = null; flow.userCode = null; flow.redactions.length = 0;
      return view(flow);
    },
    async order(body) {
      const provider = providerOf(body), ids = body.profileIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => shortString(id, 512)) || new Set(ids).size !== ids.length) throw err(400, "bad_request", "账号顺序应为不重复的完整账号列表");
      quietGuard("models.auth.order");
      const auth = await rpc("models.authStatus", {}), metadata = describe(auth, provider);
      if (metadata.orderLocked) throw err(409, "order_locked", "账号顺序受配置管理，控制台不能修改");
      if (!metadata.profiles.length) throw err(404, "not_found", "这个供应商没有可排序的账号");
      if (ids.length !== metadata.profiles.length || ids.some(id => !metadata.profiles.includes(id))) throw err(409, "baseHash_mismatch", "账号列表已经变化，请刷新后重新排序");
      quietGuard("models.auth.order");
      const result = await rpc("models.authOrderSet", { provider, profileIds: [...ids] }, 30000);
      changed();
      return { ok: true, provider, profileIds: [...ids], ...(result?.warning ? { warning: "账号顺序已保存，但运行时生效状态尚未确认，请刷新模型状态检查" } : {}) };
    },
    closeOwner(sid) {
      let owner; try { owner = ownerOf(sid); } catch { return; }
      if (starting?.owner === owner) starting.cancelled = true;
      for (const [id, flow] of flows) if (flow.owner === owner) {
        retire(flow);
      }
    },
  };
}
