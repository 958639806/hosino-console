// 统一的接口层：与 server.mjs 路由一一对应
// 所有请求携带 Cookie（credentials:'include'）与 CSRF 头 X-HS: 1
const CSRF = { "X-HS": "1" };
export class ApiError extends Error { constructor(msg, status, code, detail, data) { super(msg); this.status = status; this.code = code; this.detail = detail; this.data = data; } }
let onUnauthed = () => {};
let authEpoch = 0;
const notifyUnauthed = epoch => { if (epoch === authEpoch) onUnauthed(); };
export const setUnauthedHandler = fn => { onUnauthed = fn; };

async function req(method, path, body) {
  const epoch = authEpoch;
  let r;
  try {
    r = await fetch(path, {
      method, credentials: "include", cache: "no-store",
      headers: { ...CSRF, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError("网络好像断开了，稍后再试试", 0); }
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== "/api/login") notifyUnauthed(epoch);
  if (!r.ok) throw new ApiError(data?.error || `请求失败（${r.status}）`, r.status, data?.code, data?.detail, data);
  if (path === "/api/login" || path === "/api/logout") ++authEpoch;
  return data;
}
const get = (p, q) => req("GET", p + (q ? "?" + new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "")) : ""));
const post = (p, b) => req("POST", p, b || {});
// 给独立适配层（cred-adapter.js）用的原始请求：同样带 X-HS:1 和统一错误
export const rawReq = (method, path, body) => req(method, path, body);

export const api = {
  // v2.12 小脾气参数（POST 全部带 confirm:true）
  funParams: () => get("/api/fun/params"),
  funSet: params => post("/api/fun/params/set", { params, confirm: true }),
  funGrudges: () => get("/api/fun/grudges"),
  funGrudgeDel: (person, entryId) => post("/api/fun/grudges/delete", { person, entryId, confirm: true }),
  funGrudgeClear: person => post("/api/fun/grudges/clear", { person, confirm: true }),
  funGags: group => get("/api/fun/gags", group ? { group } : null),
  funGagDel: (group, id) => post("/api/fun/gags/delete", { group, id, confirm: true }),
  funTrash: () => get("/api/fun/trash"),
  hlGet: () => get("/api/fun/humanlike"),
  hlSet: params => post("/api/fun/humanlike/set", { params, confirm: true }),
  vtGet: () => get("/api/fun/voice-tts"),
  vtOptions: () => get("/api/fun/voice-tts/options"),
  vtSet: params => post("/api/fun/voice-tts/set", { params, confirm: true }),
  // 音色库（预览两步：先不带 confirm 拿预览，确认后带 confirm:true）
  vvList: () => get("/api/fun/voices"),
  vvSearch: (title, language, page_size = 20) => get("/api/fun/voices/search", { title, language, page_size }),
  vvAdd: (b, confirm) => post("/api/fun/voices/add", confirm ? { ...b, confirm: true } : b),
  vvDel: (alias, confirm) => post("/api/fun/voices/delete", confirm ? { alias, confirm: true } : { alias }),
  vvRegen: confirm => post("/api/fun/voices/regen-manual", confirm ? { confirm: true } : {}),
  // 试听（每次真合成都花 Fish 额度）：只在用户点击时调用；fetch 拿 blob，失败读 JSON 中文提示（429 rate_session/hour/day）
  vvPreviewBlob: async (id, text) => {
    const epoch = authEpoch;
    const url = "/api/fun/voices/preview?" + new URLSearchParams(text ? { id, text } : { id });
    let r; try { r = await fetch(url, { credentials: "include", cache: "no-store", headers: { ...CSRF } }); } catch { throw new ApiError("网络好像断开了，稍后再试试", 0); }
    if (r.status === 401) notifyUnauthed(epoch);
    if (!r.ok) { let d = null; try { d = await r.json(); } catch {} throw new ApiError(d?.error || `试听失败（${r.status}）`, r.status, d?.code); }
    return r.blob();
  },
  hlFollowups: () => get("/api/fun/humanlike/followups"),
  // v2.9 原生 CLI
  cliTools: refresh => get("/api/cli/tools", refresh ? { refresh: 1 } : null),
  cliSessions: () => get("/api/cli/sessions"),
  cliCreate: (tool, title, model) => post("/api/cli/sessions", { tool, ...(title ? { title } : {}), ...(model ? { model } : {}) }),
  cliGet: id => get(`/api/cli/sessions/${encodeURIComponent(id)}`),
  cliDelete: id => req("DELETE", `/api/cli/sessions/${encodeURIComponent(id)}?confirm=1`),
  cliCancel: id => post(`/api/cli/sessions/${encodeURIComponent(id)}/cancel`),
  // POST + SSE：fetch + ReadableStream 解析；onEvent(name, data)。开始前的错误照常抛 ApiError
  // v2.10 上传：原始字节；返回 { promise, abort }，onProgress(0..1)
  uploadLimits: () => get("/api/uploads/limits"),
  uploadDelete: id => req("DELETE", `/api/uploads/${encodeURIComponent(id)}`),
  upload: (blob, { scope, session, name }, onProgress) => {
    const epoch = authEpoch;
    const x = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      x.open("POST", `/api/uploads?${new URLSearchParams({ scope, session, name })}`);
      x.withCredentials = true; x.setRequestHeader("X-HS", "1"); x.setRequestHeader("Content-Type", "application/octet-stream");
      x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch {} if (x.status === 401) notifyUnauthed(epoch); x.status >= 200 && x.status < 300 ? resolve(d) : reject(new ApiError(d?.error || `上传失败（${x.status}）`, x.status, d?.code)); };
      x.onerror = () => reject(new ApiError("网络好像断开了，稍后再试试", 0));
      x.onabort = () => reject(new ApiError("已取消", -1, "aborted"));
      x.send(blob);
    });
    return { promise, abort: () => x.abort() };
  },
  cliRun: async (id, prompt, onEvent, signal, attachments) => {
    const epoch = authEpoch;
    let r;
    try { r = await fetch(`/api/cli/sessions/${encodeURIComponent(id)}/run`, { method: "POST", credentials: "include", cache: "no-store", signal, headers: { ...CSRF, "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ prompt, ...(attachments?.length ? { attachments } : {}) }) }); }
    catch (e) { if (e.name === "AbortError") return; throw new ApiError("网络好像断开了，稍后再试试", 0); }
    if (!r.ok || !/event-stream/.test(r.headers.get("content-type") || "")) { let d = null; try { d = await r.json(); } catch {} if (r.status === 401) notifyUnauthed(epoch); throw new ApiError(d?.error || `请求失败（${r.status}）`, r.status, d?.code); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    const flush = blk => { let ev = "message", data = ""; for (const ln of blk.split("\n")) { if (!ln || ln.startsWith(":")) continue; const i = ln.indexOf(":"), k = i < 0 ? ln : ln.slice(0, i), v = i < 0 ? "" : ln.slice(i + 1).replace(/^ /, ""); if (k === "event") ev = v; else if (k === "data") data += (data ? "\n" : "") + v; } if (!data && ev === "message") return; let j = data; try { j = JSON.parse(data); } catch {} onEvent(ev, j); };
    try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n"); let i; while ((i = buf.indexOf("\n\n")) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 2); } } if (buf.trim()) flush(buf); }
    catch (e) { if (e.name !== "AbortError") throw new ApiError("连接断开了，结果仍会写进会话记录，稍后刷新看看", 0); }
  },
  me: () => get("/api/me"),
  login: password => post("/api/login", { password }),
  logout: () => post("/api/logout"),
  overview: () => get("/api/overview"),
  sessions: (offset = 0, q) => get("/api/sessions", { offset, q }), // 每条含 alias / displayName / gatewayDisplayName
  // v2.4：before = 消息 id 或 index；返回 {messages, hasMore, nextBefore, gatewayHasMore, windowCount, totalMessages, sendLogFrom}
  history: (key, limit = 60, before) => get("/api/history", { key, limit: Math.max(1, Math.min(200, limit)), before }),
  send: (key, message, deliver = false, attachments) => post("/api/send", { key, message, deliver, ...(attachments?.length ? { attachments } : {}) }),
  abort: key => post("/api/abort", { key }),
  patch: (key, fields) => post("/api/patch", { key, ...fields }), // model / agentRuntime / thinkingLevel / label / pinned / fastMode
  models: () => get("/api/models"),
  usage: () => get("/api/usage"),
  channels: () => get("/api/channels"),
  plugins: () => get("/api/plugins"),
  skills: () => get("/api/skills"),
  cron: () => get("/api/cron"),
  logs: (limit = 200, level) => get("/api/logs", { limit, level }), // level：TRACE/DEBUG/INFO/WARN/ERROR/FATAL，返回该级别及以上
  // v2.8 记忆管理（POST 全部带 confirm:true）
  memSubjects: () => get("/api/mem/subjects"),
  memList: ({ subject, q, offset = 0, limit = 50 } = {}) => get("/api/mem/list", { subject, q, offset, limit: Math.min(200, limit) }),
  memGet: id => get("/api/mem/get", { id }),
  memFiles: () => get("/api/mem/files"),
  memFile: file => get("/api/mem/file", { file }),
  memFlags: () => get("/api/mem/flags"),
  memFlag: (id, wrong, note) => post("/api/mem/flag", { id, wrong, ...(note ? { note: String(note).slice(0, 500) } : {}), confirm: true }),
  memDelete: (id, reason, dryRun) => post("/api/mem/delete", { id, ...(reason ? { reason: String(reason).slice(0, 300) } : {}), ...(dryRun ? { dryRun: true } : {}), confirm: true }),
  memRestore: file => post("/api/mem/restore", { file, confirm: true }),
  memBackups: () => get("/api/mem/backups"),
  config: () => get("/api/config"),

  // ---------- v2（对接 API.md「v2」章节；危险操作带 confirm:true） ----------
  cronStatus: () => get("/api/cron/status"),
  cronGet: id => get("/api/cron/get", { id }),
  cronAdd: job => post("/api/cron/add", job),
  cronUpdate: (id, patch) => post("/api/cron/update", { id, patch }),
  cronRemove: id => post("/api/cron/remove", { id, confirm: true }),
  cronRun: (id, mode = "force") => post("/api/cron/run", { id, mode }),
  cronRuns: (id, limit = 20, offset = 0) => get("/api/cron/runs", { id, limit, offset }),
  sessionCreate: fields => post("/api/sessions/create", fields),
  sessionReset: key => post("/api/sessions/reset", { key, confirm: true, reason: "reset" }),
  sessionCompact: key => post("/api/sessions/compact", { key }),
  sessionDelete: key => post("/api/sessions/delete", { key, confirm: true, deleteTranscript: true }),
  approvals: () => get("/api/approvals"), // { pending:[…], grants:[…] }
  approvalResolve: (id, decision) => post("/api/approvals/resolve", { id, decision }),
  grantRevoke: grantId => post("/api/approvals/revoke-grant", { grantId, confirm: true }),
  usageCost: (days = 30) => get("/api/usage/cost", { days }),
  modelAuth: () => get("/api/models/auth"),
  modelProbe: (provider, profileId) => post("/api/models/probe", { provider, profileId, timeoutMs: 30000 }), // 慢：实测约 30+ 秒
  skillDetail: slug => get("/api/skills/detail", { slug }),
  // skills install / update / pin：后台不开放（API.md「不开放的项目」），前端只读
  pairing: () => get("/api/pairing"),
  pairingApprove: (channel, accountId, requestId) => post("/api/pairing/approve", { channel, accountId, requestId }),
  pairingDismiss: (channel, accountId, requestId) => post("/api/pairing/dismiss", { channel, accountId, requestId }),
  tools: (key = "agent:main:main") => get("/api/tools", { key }), // 网关目前常返回 UNAVAILABLE
  mcpTools: (key, viewId) => get("/api/mcp/tools", { key, viewId }), // 需 MCP 视图 id，前端暂未使用
  hooks: () => get("/api/hooks"),
  audit: (limit = 50, cursor) => get("/api/audit", { limit, cursor }),
  opsLog: (limit = 100) => get("/api/ops-log", { limit }),
  stability: () => get("/api/diagnostics/stability"),
  lanes: () => get("/api/diagnostics/lanes"),
  agentFiles: (agentId = "main") => get("/api/agent-files", { agentId }),
  agentFile: (name, agentId = "main") => get("/api/agent-files/get", { agentId, name }),
  agentFileSet: (name, content, agentId = "main") => post("/api/agent-files/set", { agentId, name, content, confirm: true }),

  // ---------- v2.1（API.md v2.1） ----------
  features: () => get("/api/features"), // { qqSend, 媒体中转开关, mediaRemoteHosts }
  // 以星野のねこ身份直发到 QQ（不触发 agent 回合）。危险操作，必须 confirm:true
  // chat-actions v1（staging/chat-actions/API.md）：撤回 / 重新生成，都带 confirm:true
  recallable: (key, id) => get("/api/chat/recallable", { key, id }),
  recall: (key, id, mode) => post("/api/chat/recall", { key, id, mode, confirm: true }),
  regenerate: (key, id, deliver) => post("/api/chat/regenerate", { key, id, deliver: deliver === true, confirm: true }),
  // 模型 ping（model-ping/FRONTEND-SPEC.md）：CLI 运行时最长 60 秒，前端 75 秒超时，可用 signal 取消
  modelPing: async (modelRef, signal) => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort("timeout"), 75000);
    const stop = () => ac.abort("cancel"); signal?.addEventListener("abort", stop);
    try {
      const r = await fetch("/api/models/ping", { method: "POST", credentials: "include", cache: "no-store", headers: { ...CSRF, "Content-Type": "application/json" }, body: JSON.stringify({ modelRef }), signal: ac.signal });
      let d = null; try { d = await r.json(); } catch {}
      if (r.status === 401) notifyUnauthed(authEpoch);
      if (!r.ok) throw new ApiError(d?.error || `请求失败（${r.status}）`, r.status, d?.code);
      return d;
    } catch (e) { if (e instanceof ApiError) throw e; if (ac.signal.aborted) throw new ApiError(ac.signal.reason === "cancel" ? "已取消" : "等了 75 秒还没回来，算超时", 0, ac.signal.reason === "cancel" ? "cancelled" : "client_timeout"); throw new ApiError("网络好像断开了，稍后再试试", 0); }
    finally { clearTimeout(t); signal?.removeEventListener("abort", stop); }
  },
  // 模型管理（model-manage/API.md + console-5feat/API-PROPOSAL.md）：plan → 确认 → apply（confirm:true + planId）
  manage: () => get("/api/models/manage"),
  managePlan: ops => post("/api/models/manage/plan", { ops }),
  manageBackups: () => get("/api/models/manage/backups"),
  manageRollback: (backupId, opts) => post("/api/models/manage/rollback", { backupId, ...opts }),
  manageApply: (planId, baseHash) => post("/api/models/manage/apply", { planId, baseHash, confirm: true }),
  qqSend: (sessionKey, text) => post("/api/qq/send", { sessionKey, text, confirm: true }),
  // 会话别名（API.md v2.2，存控制台 aliases.json）：key = 会话 key 或 32 位 QQ id；alias 空串 = 清除；≤40 字
  aliases: () => get("/api/aliases"),
  // v2.4 个人档案（id = 小写 32 位十六进制 openid）
  profiles: () => get("/api/profiles"),
  profile: id => get("/api/profiles/" + encodeURIComponent(String(id).toLowerCase())),
  profileSet: (id, name, note) => post("/api/profiles/set", { id: String(id).toLowerCase(), name: String(name ?? "").slice(0, 40), note: String(note ?? "").slice(0, 4000) }),
  // v2.4 全文搜索（网关 sessions.search）
  search: (q, limit = 10, sessionKey) => get("/api/search", { q: String(q).slice(0, 4096), limit: Math.max(1, Math.min(25, limit)), sessionKey }),
  // v2.4 会话分组：set 有 id 时整体替换 name/sessionKeys；一个会话只属于一个组
  groups: () => get("/api/groups"),
  groupSet: (g) => post("/api/groups/set", { ...(g.id ? { id: g.id } : {}), name: String(g.name ?? "").slice(0, 40), sessionKeys: g.sessionKeys || [], ...(g.order != null ? { order: g.order } : {}) }),
  groupDelete: id => post("/api/groups/delete", { id, confirm: true }),
  // v2.6 群报 / 互动统计 / 表情库 / 主动行为（只读）
  digestSettings: () => get("/api/digest/settings"),
  digestSet: body => post("/api/digest/settings/set", { ...body, confirm: true }), // {sessionKey+enabled} | {time} | {globalEnabled}
  digests: (key, limit = 30) => get("/api/digests", { key, limit }),
  digest: id => get("/api/digests/get", { id }),
  digestImage: id => `/api/digests/image?id=${encodeURIComponent(id)}`,
  digestRunNow: sessionKey => post("/api/digests/run-now", { sessionKey, confirm: true }), // 会消耗额度！
  interactions: key => get("/api/interactions", { key }),
  stickers: () => get("/api/stickers"),
  stickerImage: file => `/api/stickers/image?file=${encodeURIComponent(file)}`,
  behavior: () => get("/api/behavior"),
  // v2.7 表情库管理
  stickerRename: (file, category) => post("/api/stickers/rename", { file, category, confirm: true }),
  stickerDelete: file => post("/api/stickers/delete", { file, confirm: true }),
  stickerTrash: () => get("/api/stickers/trash"),
  stickerParams: () => get("/api/stickers/params"),
  stickerParamsSet: params => post("/api/stickers/params/set", { params, confirm: true }),
  stickerManifest: () => get("/api/stickers/manifest"),
  stickerManifestSet: body => post("/api/stickers/manifest/set", { ...body, confirm: true }),
  stickerGenerate: category => post("/api/stickers/generate", { category }), // 不要 confirm（凛的要求）
  stickerGenStatus: id => get("/api/stickers/generate/status", { id }),
  // 导入：原始字节，XHR 以便拿上传进度；onProgress(0..1)
  stickerImport: (blob, category, onProgress) => new Promise((resolve, reject) => {
    const epoch = authEpoch;
    const x = new XMLHttpRequest();
    x.open("POST", `/api/stickers/import?category=${encodeURIComponent(category)}&confirm=1`);
    x.withCredentials = true; x.setRequestHeader("X-HS", "1"); x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch {} if (x.status === 401) notifyUnauthed(epoch); x.status >= 200 && x.status < 300 ? resolve(d) : reject(new ApiError(d?.error || `请求失败（${x.status}）`, x.status, d?.code)); };
    x.onerror = () => reject(new ApiError("网络好像断开了，稍后再试试", 0));
    x.send(blob);
  }),
  link: () => get("/api/link"), // 线路状态：只读，缓存 30s
  setAlias: (key, alias) => post("/api/aliases/set", { key, alias: String(alias ?? "").slice(0, 40) }),
};
// ---------- 媒体：按 API.md v2.1「前端映射规则」从消息文本里提取 ----------
const LOCAL = /\/home\/ubuntu\/\.openclaw\/media\/[^\s"'\\)\]]+\.(jpe?g|png|gif|webp|bmp|mp4|webm|mov|mp3|wav|ogg|m4a|amr|silk|txt|md|pdf|zip)/gi;
const REMOTE = /https:\/\/qqbot\.ugcimg\.cn\/[^\s"'\\)\]]+/gi;
export const mediaUrl = m => m.startsWith("http") ? `/api/media?url=${encodeURIComponent(m)}` : `/api/media?path=${encodeURIComponent(m)}`;
const kindOf = p => { const e = (/\.(\w+)$/.exec(p.split("?")[0]) || [])[1]?.toLowerCase() || ""; return /^(jpe?g|png|gif|webp|bmp)$/.test(e) || p.startsWith("https://qqbot.ugcimg.cn") && !e ? "image" : /^(mp4|webm|mov)$/.test(e) ? "video" : /^(mp3|wav|ogg|m4a)$/.test(e) ? "audio" : "file"; };
function textsOf(m) {
  const out = []; const c = m.content;
  const push = v => { if (v == null) return; out.push((typeof v === "string" ? v : JSON.stringify(v)).replace(/\\\//g, "/")); };
  if (typeof c === "string") push(c);
  else if (Array.isArray(c)) for (const p of c) { if (typeof p === "string") push(p); else { push(p?.text); push(p?.arguments ?? p?.input); if (p?.type === "tool_result" || p?.type === "toolResult") push(p.content); } }
  else push(c);
  for (const t of m.tools || []) { push(t?.args?.text); push(t?.result?.text); }
  return out.join("\n");
}
// 返回 [{ kind:"image"|"audio"|"video"|"file", url, name, src }]
export function mediaOf(m) {
  const t = textsOf(m), seen = new Set(), out = [];
  for (const re of [LOCAL, REMOTE]) for (const x of t.matchAll(re)) { const src = x[0]; if (seen.has(src)) continue; seen.add(src);
    out.push({ kind: kindOf(src), url: mediaUrl(src), src, name: decodeURIComponent(src.split("/").pop().replace(/^[0-9A-F]{32}---/, "")) }); }
  return out;
}
// 接口还没开放（404 / 501）
export const notReady = e => e?.status === 404 || e?.status === 501;
