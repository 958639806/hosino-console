// 记忆语义搜索适配层（唯一改这里）。按 memory-search/API.md（staging）：
//   POST /api/memory/search {q, scope:"all"|"users", user_ids?, limit, minScore} → {results:[{id,score,memory,user_id,createdAt,visibility,channel}], count, scope, tookMs, cached}
//   GET  /api/memory/users → {users:[{user_id,count}], count}
// 「全部」= scope:"all"，不带 user_ids；选了人 = scope:"users" + user_ids:[id]。
// 约定：只在用户点「搜索」/回车时调用；不缓存到 localStorage；不打印查询内容。
export const ALL = "__all__";
// 界面上不露完整 id（可能是 openid）：只留末 6 位
const mask = id => id.length > 10 ? "…" + id.slice(-6) : id;
export const makeMemSearch = rawReq => ({
  // 范围列表 → [{ id, label, count }]；接口没有时返回 []（界面只剩「全部」）
  async scopes() {
    try { const r = await rawReq("GET", "/api/memory/users"); return (r?.users || []).map(u => ({ id: String(u.user_id ?? ""), label: mask(String(u.user_id ?? "")), count: u.count ?? null })).filter(s => s.id); }
    catch (e) { if (e.status === 404) return []; throw e; }
  },
  // 搜索 → { items:[{ id, text, score, category, createdAt, scope }], model, cached }
  async search({ q, scope, limit = 20, minScore = 0 }) {
    const body = { q, limit: Math.max(1, Math.min(50, limit | 0)), minScore: Math.max(0, Math.min(1, +minScore || 0)) };
    if (!scope || scope === ALL) body.scope = "all"; else { body.scope = "users"; body.user_ids = [scope]; }
    const r = await rawReq("POST", "/api/memory/search", body);
    return { model: "", cached: !!r?.cached, items: (r?.results || []).map(x => ({ id: x.id, text: x.memory ?? "", score: typeof x.score === "number" ? x.score : null, category: x.visibility === "group" ? "群聊" : x.visibility === "private" ? "私聊" : "", createdAt: x.createdAt ?? null, scope: x.user_id ? mask(String(x.user_id)) : "" })) };
  },
});
