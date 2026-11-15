// 记忆语义搜索适配层（唯一改这里）。FRONTEND-SPEC v2 + M7 全部用户：
//   GET  /api/memory/status（只读）
//   GET  /api/memory/users → {users:[{user_id,count,name,subjectKey}], count}
//   POST /api/memory/search
//     指定人：{q, user_ids, limit, minScore}（scope:"users"）
//     全部：  {q, all:true, limit, minScore}（推荐；勿同时带 user_ids）
// 默认仍选「凛」。全部是可选项。旧后端若 400 user_required，界面提示并退回凛。
// 约定：只在点「搜索」/回车时调用；不缓存到 localStorage；不打印查询内容。
export const ALL = "__all__";
export const DEFAULT_USER = "凛";
const mask = id => { const s = String(id || ""); return s.length > 10 ? "…" + s.slice(-6) : s; };
const tailOf = id => { const s = String(id || ""); return s.length > 6 ? s.slice(-6) : s; };
const isWanted = (s, want) => s.id === want || s.name === want || s.label === want;
export const pickDefaultScope = (scopes, want = DEFAULT_USER) => {
  const list = scopes || [];
  return (list.find(s => isWanted(s, want)) || list[0] || {}).id || "";
};
export const makeMemSearch = rawReq => ({
  async status() {
    try { return await rawReq("GET", "/api/memory/status"); }
    catch (e) { if ((e.status === 404 || e.status === 501) && !e.code) return null; throw e; }
  },
  async scopes() {
    try {
      const r = await rawReq("GET", "/api/memory/users");
      return (r?.users || []).map(u => {
        const id = String(u.user_id ?? "");
        const name = u.name != null && String(u.name).trim() ? String(u.name).trim() : "";
        const tail = tailOf(id);
        const label = name ? (name === id ? name : `${name} · …${tail}`) : mask(id);
        return { id, name, label, count: u.count ?? null, tail, subjectKey: u.subjectKey || null };
      }).filter(s => s.id);
    } catch (e) { if (e.status === 404 && !e.code) return []; throw e; }
  },
  async search({ q, scope, limit = 20, minScore = 0 }) {
    const body = { q, limit: Math.max(1, Math.min(50, limit | 0)), minScore: Math.max(0, Math.min(1, +minScore || 0)) };
    if (!scope || scope === ALL) body.all = true;
    else { body.scope = "users"; body.user_ids = [scope]; }
    const r = await rawReq("POST", "/api/memory/search", body);
    return {
      model: "", cached: !!r?.cached, count: r?.count ?? (r?.results || []).length, scope: r?.scope || (body.all ? "all" : body.scope), tookMs: r?.tookMs || null,
      items: (r?.results || []).map(x => {
        const id = x.user_id == null ? "" : String(x.user_id);
        return {
          id: x.id, text: x.memory ?? "", score: typeof x.score === "number" ? x.score : null,
          category: x.visibility === "group" ? "群聊" : x.visibility === "private" ? "私聊" : "",
          createdAt: x.createdAt ?? null, channel: x.channel ?? "",
          scope: id ? mask(id) : "", who: id ? { name: "", tail: tailOf(id), id } : null,
        };
      }),
    };
  },
});
