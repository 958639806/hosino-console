// chat-actions v1：聊天页单条操作——QQ 撤回（self/admin）+ 重新生成
// 只读 qqbot 投递回执（~/.openclaw/qqbot/delivery-receipts）与 openclaw.json；不写 ~/.openclaw，不订阅会话消息事件。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RECALL_WINDOW_MS = 120000;
const SAFETY_MS = 3000; // 本地时钟/网络余量，宁可早一点判过期
const sha = v => crypto.createHash("sha256").update(String(v)).digest("hex");
const E = (http, code, msg, extra) => Object.assign(new Error(msg), { http, code, ...extra });
const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.filter(b => b?.type === "text").map(b => b.text).join("\n") : "";
const norm = s => String(s || "").replace(/\[[^\]\n]{1,40}\]/g, "").replace(/\s+/g, "");

export function makeChatActions({ call, readCfg, receiptsDir, fetchImpl = fetch, now = Date.now, qqApi = "https://api.sgroup.qq.com", qqTokenUrl = "https://bots.qq.com/app/getAppAccessToken", enabled = () => true }) {
  let tok = null; // { v, exp }
  async function token() {
    if (tok && tok.exp > now() + 60e3) return tok.v;
    const q = readCfg()?.channels?.qqbot || {};
    if (!q.appId || !q.clientSecret) throw E(503, "qq_not_configured", "QQ 机器人凭据未配置");
    const r = await fetchImpl(qqTokenUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ appId: String(q.appId), clientSecret: String(q.clientSecret) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw E(502, "qq_error", "获取 QQ 访问令牌失败", { detail: { status: r.status, code: j.code } });
    tok = { v: j.access_token, exp: now() + (+j.expires_in || 7200) * 1000 }; return tok.v;
  }
  async function qqDelete(scope, targetId, messageId) {
    const p = (scope === "c2c" ? `/v2/users/${encodeURIComponent(targetId)}/messages/` : `/v2/groups/${encodeURIComponent(targetId)}/messages/`) + encodeURIComponent(messageId);
    const r = await fetchImpl(qqApi + p, { method: "DELETE", headers: { authorization: "QQBot " + await token() } });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({})); const c = +j.code || +j.err_code || 0;
    if (c === 40064004) return { ok: false, code: "window_expired", http: 410 };
    if (c === 40062003 || r.status === 403) return { ok: false, code: "no_permission", http: 403, detail: c || r.status };
    return { ok: false, code: "qq_error", http: 502, detail: c || r.status };
  }
  async function load(key, id) {
    if (!key || !id) throw E(400, "bad_request", "缺少参数：key 或 id");
    const raw = await call("chat.history", { sessionKey: key, limit: 1000 }, 20000);
    const msgs = raw?.messages || [];
    const i = msgs.findIndex(m => m?.__openclaw?.id === id);
    if (i < 0) throw E(404, "message_not_found", "会话里没有这条消息");
    let sess = null; try { sess = ((await call("sessions.list", { limit: 500 })).sessions || []).find(s => s.key === key) || null; } catch {}
    const dc = sess?.deliveryContext || {};
    const to = (dc.channel || sess?.channel) === "qqbot" && typeof dc.to === "string" ? dc.to : null;
    const m = /^qqbot:(group|c2c):([A-Za-z0-9_-]{6,80})$/i.exec(to || "");
    return { msgs, i, msg: msgs[i], to, accountId: dc.accountId || "default", scope: m ? m[1].toLowerCase() : null, targetId: m ? m[2] : null };
  }
  const userBefore = (msgs, i) => { for (let k = i; k >= 0; k--) if (msgs[k]?.role === "user") return { k, m: msgs[k] }; return null; };
  function readLedger(accountId, to, sourceId) {
    const key = sha(JSON.stringify([accountId.trim(), to.trim().toLowerCase(), sourceId.trim()]));
    try { const j = JSON.parse(fs.readFileSync(path.join(receiptsDir, key + ".json"), "utf8")); return j?.v === 1 && j.key === key ? j : null; } catch { return null; }
  }
  // 返回 { parts:[{messageId, at}], reason }
  function selfParts(ctx) {
    const { msgs, i, msg } = ctx;
    if (msg.role !== "assistant") return { parts: [], reason: "wrong_role" };
    if (!ctx.to || !ctx.scope) return { parts: [], reason: "not_qq_session" };
    const u = userBefore(msgs, i); const src = u?.m?.__openclaw?.transport?.messageId;
    if (!src) return { parts: [], reason: "no_message_id" };
    const led = readLedger(ctx.accountId, ctx.to, src);
    const ops = Object.values(led?.operations || {}).filter(o => o.type === "delivery" && o.state === "confirmed" && o.messageId).sort((a, b) => a.preparedAt - b.preparedAt);
    if (!ops.length) return { parts: [], reason: "no_message_id" };
    const body = norm(textOf(msg.content));
    let hit = ops.filter(o => typeof o.text === "string" && norm(o.text) && body.includes(norm(o.text)));
    const turnAssist = msgs.slice(u.k + 1).findIndex((m, k) => m.role === "user" && k > 0);
    const assistantsInTurn = msgs.slice(u.k + 1, turnAssist < 0 ? undefined : u.k + 1 + turnAssist).filter(m => m.role === "assistant" && norm(textOf(m.content))).length;
    if (!hit.length && assistantsInTurn <= 1) hit = ops; // 一轮只有一条可见回复：整轮回执都属于它（含语音/图片）
    if (!hit.length) return { parts: [], reason: "no_message_id" };
    return { parts: hit.map(o => ({ messageId: o.messageId, at: o.preparedAt || o.confirmedAt })), reason: null };
  }
  function adminParts(ctx) {
    const { msg } = ctx;
    if (msg.role !== "user") return { parts: [], reason: "wrong_role" };
    if (!ctx.to || !ctx.scope) return { parts: [], reason: "not_qq_session" };
    if (ctx.scope !== "group") return { parts: [], reason: "not_group" };
    const id = msg.__openclaw?.transport?.messageId; if (!id) return { parts: [], reason: "no_message_id" };
    return { parts: [{ messageId: id, at: +msg.timestamp || 0 }], reason: null };
  }
  const left = parts => parts.length ? Math.floor((Math.min(...parts.map(p => p.at)) + RECALL_WINDOW_MS - SAFETY_MS - now()) / 1000) : 0;
  const view = (r, noWindow = false) => { if (noWindow) { const reason = r.reason; return { available: !reason, parts: r.parts.length, secondsLeft: null, reason }; } const s = Math.max(0, left(r.parts)); const reason = r.reason || (s <= 0 ? "window_expired" : null); return { available: !reason, parts: r.parts.length, secondsLeft: reason ? 0 : s, reason }; }; // 管理员撤回群成员消息：QQ 无 2 分钟限制
  const MSG = { wrong_role: "self 只能撤回星野的消息，admin 只能撤回群成员的消息", not_qq_session: "不是 QQ 会话，没有可撤回的 QQ 消息", not_group: "admin 模式只支持群聊；QQ 私聊无法撤回对方消息", no_message_id: "找不到对应的 QQ 消息 id，无法撤回", window_expired: "已超过 QQ 的 2 分钟撤回时限" };
  const HTTP = { wrong_role: 400, not_qq_session: 400, not_group: 400, no_message_id: 409, window_expired: 410 };
  return {
    async recallable(key, id) {
      const ctx = await load(key, id);
      if (!enabled()) return { ok: true, self: { available: false, parts: 0, secondsLeft: 0, reason: "disabled" }, admin: { available: false, parts: 0, secondsLeft: 0, reason: "disabled" } };
      return { ok: true, self: view(selfParts(ctx)), admin: view(adminParts(ctx), true) };
    },
    async recall(b) {
      if (b?.confirm !== true) throw E(400, "confirm_required", "需要 confirm:true 确认");
      if (b.mode !== "self" && b.mode !== "admin") throw E(400, "bad_mode", "mode 只能是 self 或 admin");
      if (!enabled()) throw E(403, "recall_disabled", "撤回功能未开启");
      const ctx = await load(b.key, b.id);
      const r = b.mode === "self" ? selfParts(ctx) : adminParts(ctx);
      const v = view(r, b.mode === "admin"); if (!v.available) throw E(HTTP[v.reason] || 400, v.reason, MSG[v.reason] || v.reason);
      const parts = [];
      for (const p of r.parts) { try { parts.push(await qqDelete(ctx.scope, ctx.targetId, p.messageId)); } catch (e) { parts.push({ ok: false, code: e.code || "qq_error", http: e.http || 502 }); } }
      const ok = parts.filter(p => p.ok).length;
      if (!ok) { const f = parts[0]; throw E(f.http || 502, f.code, f.code === "no_permission" ? "QQ 拒绝撤回：星野不是群管理员，或对方是群主/管理员" : f.code === "window_expired" ? MSG.window_expired : "QQ 撤回失败，请稍后重试", { detail: f.detail }); }
      return { ok: ok === parts.length, mode: b.mode, recalled: ok, failed: parts.length - ok, parts: parts.map(p => p.ok ? { ok: true } : { ok: false, code: p.code }) };
    },
    async regenerate(b) {
      if (b?.confirm !== true) throw E(400, "confirm_required", "需要 confirm:true 确认");
      const ctx = await load(b.key, b.id);
      const u = userBefore(ctx.msgs, ctx.i); const uid = u?.m?.__openclaw?.id;
      if (!uid) throw E(400, "no_user_turn", "找不到触发这条回复的用户消息");
      let rw;
      try { rw = await call("sessions.rewind", { sessionKey: b.key, entryId: uid }, 30000); }
      catch (e) { const m = String(e.message || ""); throw /working|initializing/i.test(m) ? E(409, "busy", "星野正在回复，稍后再试") : /changed/i.test(m) ? E(409, "session_changed", "会话刚变过，刷新后重试") : /external agent|does not support|not a user message|not on the active path/i.test(m) ? E(400, "unsupported_session", "这个会话不支持重新生成") : E(502, "gateway_error", "网关错误：" + m.slice(0, 200)); }
      const text = rw?.editorText || textOf(u.m.content);
      const atts = (rw?.editorAttachments || []).map(a => ({ type: /^image\//.test(a.mimeType) ? "image" : "file", mimeType: a.mimeType, content: a.data }));
      const r = await call("chat.send", { sessionKey: b.key, message: text, deliver: b.deliver === true, idempotencyKey: crypto.randomUUID(), ...(atts.length ? { attachments: atts } : {}) }, atts.length ? 120000 : 30000);
      return { ok: true, runId: r?.runId || null, deliver: b.deliver === true, rewoundTo: uid };
    },
  };
}
