// 凭证 / 登录适配层（唯一改这里）：后端字段若变，只改本文件的请求与返回映射。
// 依据：model-manage/API.md §4（凭证字段已确认）+ console-5feat/API-PROPOSAL.md §5（登录向导、同供应商内 profile 排序）。
// 约定：key 只写不读；调用方提交后立刻清空输入框；这里不缓存、不打印任何 key。
// 不自己 import api.js（避免版本号不同步导致两份模块实例）：由 app.js 注入 rawReq。
const loginResult = r => ({
  state: r?.state || r?.status || (r?.done ? "done" : "pending"),
  ...(r?.flow ? { flow: r.flow } : {}), ...(r?.url != null ? { url: r.url } : {}),
  ...(r?.userCode != null ? { userCode: r.userCode } : {}), ...(r?.step !== undefined ? { step: r.step } : {}),
  error: r?.error || "", message: r?.message || r?.warning || "",
});
export const makeCred = rawReq => ({
  // 预览会用哪种方式写（secrets.store.set / models.authSetApiKey）→ { method, target }
  async preview(provider) { const r = await rawReq("POST", "/api/models/manage/credential", { provider, dryRun: true }); return { method: r?.method || "", target: r?.target || "" }; },
  // 写入 → { keyHint:"…abcd", method, reloaded, pingRefs, restart }
  async setKey(provider, apiKey) { const r = await rawReq("POST", "/api/models/manage/credential", { provider, apiKey, confirm: true }); return { keyHint: r?.keyHint || "", method: r?.method || "", reloaded: !!r?.reloaded, pingRefs: r?.pingRefs || [], restart: r?.restart || "none", warning: r?.warning || null }; },
  // OAuth 登录向导：开始 → { flow:"url"|"device", url, userCode, pollId }；轮询 → { state:"pending"|"done"|"error"|"cancelled", error }
  async loginStart(provider, method) { const r = await rawReq("POST", "/api/models/auth/login", { provider, ...(method ? { method } : {}), confirm: true }); if (!r?.pollId) throw new Error("登录服务没有返回查询标识，请稍后重试。"); return { ...loginResult(r), pollId: r.pollId }; },
  async loginPoll(pollId) { return loginResult(await rawReq("GET", `/api/models/auth/login/${encodeURIComponent(pollId)}`)); },
  async loginAnswer(pollId, stepId, value) { return loginResult(await rawReq("POST", `/api/models/auth/login/${encodeURIComponent(pollId)}/answer`, { stepId, ...(value !== undefined ? { value } : {}), confirm: true })); },
  async loginCancel(pollId) { return loginResult(await rawReq("POST", `/api/models/auth/login/${encodeURIComponent(pollId)}/cancel`, { confirm: true })); },
  // 同一供应商内的 profile 顺序：必须传全量列表（跨供应商顺序用 setFallbacks）
  async setOrder(provider, profileIds) { return rawReq("POST", "/api/models/auth/order", { provider, profileIds: [...profileIds], confirm: true }); },
});
