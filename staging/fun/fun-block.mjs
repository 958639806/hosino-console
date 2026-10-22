// ---------- v2.12：小脾气参数（记仇小本本 / 群梗回旋镖 / 吃醋；写 workspace/fun：params.json / grudges.json / gags.json / .trash/；需要单元 drop-in 40-fun-rw.conf） ----------
// 注意：消费这些参数的技能、脚本和 gate 补丁还没做；在它们上线前，这里只负责存设置，不改变星野的行为。
const FUN_DIR = process.env.HS_FUN_DIR || path.join(WORKSPACE, "fun");
const FUN_TRASH = path.join(FUN_DIR, ".trash");
const FUN_GK = /^group:[0-9a-f]{32}$/;
const FUN_PID = /^[0-9A-F]{32}$/;
const FUN_FEATS = ["grudge", "gag", "jealousy"];
const FUN_DEFAULTS = {
  enabled: false, killPhrase: "星野正经点", killOwnerOnly: true, optOutAllPhrase: "别整我", optOut: {},
  grudge: { enabled: false, defaultEnabled: false, perGroup: {}, recallProbability: 0.10, recallCooldownDays: 7, maxEntriesPerPerson: 20, maxQuoteChars: 40, optOutPhrase: "别记我仇", clearPhrase: "撕本本" },
  gag: { enabled: false, defaultEnabled: false, perGroup: {}, minScore: 4, minDistinctPeople: 2, windowMin: 3, requireApproval: true, cooldownDays: 3, maxUses: 5, perGroupDailyCap: 2, optOutPhrase: "别拿我的话玩梗", deletePhrase: "这梗删了" },
  jealousy: { enabled: false, tierA: true, tierB: false, defaultEnabled: false, perGroup: {}, otherBots: [{ id: "A6902CCDF6FD63D47AC7B9A6BD44E201", name: "芙宁娜" }], perPersonDailyCap: 1, personCooldownMin: 30, groupCooldownMin: 120, optOutPhrase: "星野别吃醋" },
};
// 类型：b=布尔 p=0–1 i:min:max=整数 s:max=非空短文本
const FUN_SPEC = {
  grudge: { enabled: "b", defaultEnabled: "b", recallProbability: "p", recallCooldownDays: "i:1:365", maxEntriesPerPerson: "i:1:200", maxQuoteChars: "i:10:200", optOutPhrase: "s:20", clearPhrase: "s:20" },
  gag: { enabled: "b", defaultEnabled: "b", minScore: "i:1:50", minDistinctPeople: "i:1:20", windowMin: "i:1:60", requireApproval: "b", cooldownDays: "i:0:365", maxUses: "i:1:100", perGroupDailyCap: "i:0:50", optOutPhrase: "s:20", deletePhrase: "s:20" },
  jealousy: { enabled: "b", tierA: "b", tierB: "b", defaultEnabled: "b", perPersonDailyCap: "i:0:20", personCooldownMin: "i:0:1440", groupCooldownMin: "i:0:1440", optOutPhrase: "s:20" },
};
// 按群覆盖允许改的字段（enabled 必填）
const FUN_GROUP_KEYS = { grudge: ["recallProbability", "recallCooldownDays"], gag: ["minScore", "minDistinctPeople", "requireApproval", "perGroupDailyCap"], jealousy: ["tierA", "tierB", "groupCooldownMin"] };
function funVal(where, t, x) {
  const [k, a, b] = t.split(":");
  if (k === "b") { if (typeof x !== "boolean") throw httpErr(400, `${where} 必须是布尔值`); return x; }
  if (k === "p") { if (typeof x !== "number" || !(x >= 0 && x <= 1)) throw httpErr(400, `${where} 应在 0–1`); return x; }
  if (k === "i") { if (!Number.isInteger(x) || x < +a || x > +b) throw httpErr(400, `${where} 应为 ${a}–${b} 的整数`); return x; }
  if (k === "s") { if (typeof x !== "string" || !x.trim() || x.length > +a || /[\r\n]/.test(x)) throw httpErr(400, `${where} 应为 1–${a} 字的单行文本`); return x.trim(); }
  throw httpErr(500, "spec 错误");
}
function funReadJ(name, init) { try { return JSON.parse(fs.readFileSync(path.join(FUN_DIR, name), "utf8")); } catch (e) { if (e.code === "ENOENT") return init(); throw httpErr(500, name + " 读取失败：" + e.message); } }
function funTrashCopy(name, tag) { const f = path.join(FUN_DIR, name); if (!fs.existsSync(f)) return null; fs.mkdirSync(FUN_TRASH, { recursive: true, mode: 0o755 }); const ts = new Date().toISOString().replace(/[:.]/g, "-"); const dst = path.join(FUN_TRASH, `${ts}-${tag ? tag + "-" : ""}${name}`); fs.copyFileSync(f, dst, fs.constants.COPYFILE_EXCL); return path.basename(dst); }
function funWriteJ(name, obj, tag) {
  fs.mkdirSync(FUN_DIR, { recursive: true, mode: 0o755 });
  const backup = funTrashCopy(name, tag); // 先备份，备份失败直接报错，不写
  obj.updatedAt = Date.now(); const f = path.join(FUN_DIR, name), tmp = path.join(FUN_DIR, `.${name}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o644 }); fs.renameSync(tmp, f); return backup;
}
const funStored = () => funReadJ("params.json", () => ({ version: 1 }));
function funEffective(s) {
  const o = { ...FUN_DEFAULTS, ...s, optOut: { ...(s.optOut || {}) } };
  for (const f of FUN_FEATS) o[f] = { ...FUN_DEFAULTS[f], ...(s[f] && typeof s[f] === "object" ? s[f] : {}) };
  delete o.updatedAt; return o;
}
function funMergeFeat(f, cur, v) {
  if (v === null) return undefined; // null = 删除整段，回到默认（默认关闭）
  if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, `${f} 必须是对象或 null`);
  const o = { ...(cur && typeof cur === "object" ? cur : {}) };
  for (const [k, x] of Object.entries(v)) {
    if (k === "perGroup") {
      if (!x || typeof x !== "object" || Array.isArray(x)) throw httpErr(400, `${f}.perGroup 必须是对象`); const pg = { ...(o.perGroup || {}) };
      for (const [gk, gv] of Object.entries(x)) {
        if (!FUN_GK.test(gk)) throw httpErr(400, `群键应为 group:<32位小写hex>：${gk}`);
        if (gv === null) { delete pg[gk]; continue; }
        if (!gv || typeof gv !== "object" || typeof gv.enabled !== "boolean") throw httpErr(400, `${f}.perGroup.${gk}.enabled 必须是布尔值`);
        const e = { enabled: gv.enabled };
        for (const [gk2, gx] of Object.entries(gv)) { if (gk2 === "enabled" || gx == null) continue; if (!FUN_GROUP_KEYS[f].includes(gk2)) throw httpErr(400, `${f} 的按群覆盖不支持：${gk2}`); e[gk2] = funVal(`${f}.perGroup.${gk}.${gk2}`, FUN_SPEC[f][gk2], gx); }
        pg[gk] = e;
      }
      o.perGroup = pg;
    } else if (f === "jealousy" && k === "otherBots") {
      if (x === null) { delete o.otherBots; continue; } // 回到默认（芙宁娜）
      if (!Array.isArray(x) || x.length > 20) throw httpErr(400, "jealousy.otherBots 应为最多 20 项的数组 [{id,name}]，或 null");
      const seen = new Set(); o.otherBots = x.map((b, i) => { const id = String(b?.id || "").toUpperCase(); if (!FUN_PID.test(id)) throw httpErr(400, `jealousy.otherBots[${i}].id 应为 32 位 QQ openid`); if (seen.has(id)) throw httpErr(400, `jealousy.otherBots 里 id 重复：${id}`); seen.add(id); return { id, name: funVal(`jealousy.otherBots[${i}].name`, "s:20", b?.name) }; });
    } else if (FUN_SPEC[f][k]) { if (x === null) delete o[k]; else o[k] = funVal(`${f}.${k}`, FUN_SPEC[f][k], x); }
    else throw httpErr(400, `不支持的 ${f} 参数：${k}`);
  }
  return o;
}
function funMerge(stored, inP) {
  if (!inP || typeof inP !== "object" || Array.isArray(inP)) throw httpErr(400, "需要 params 对象");
  const s = { ...stored };
  for (const [k, v] of Object.entries(inP)) {
    if (FUN_FEATS.includes(k)) { const m = funMergeFeat(k, s[k], v); if (m === undefined) delete s[k]; else s[k] = m; }
    else if (k === "enabled" || k === "killOwnerOnly") { if (v === null) delete s[k]; else s[k] = funVal(k, "b", v); }
    else if (k === "killPhrase" || k === "optOutAllPhrase") { if (v === null) delete s[k]; else s[k] = funVal(k, "s:20", v); }
    else if (k === "optOut") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw httpErr(400, "optOut 必须是对象 {<openid>: [\"all\"|\"grudge\"|\"gag\"|\"jealousy\"] | null}");
      const oo = { ...(s.optOut || {}) };
      for (const [pid0, list] of Object.entries(v)) {
        const pid = pid0.toUpperCase(); if (!FUN_PID.test(pid)) throw httpErr(400, `optOut 的键应为 32 位 QQ openid：${pid0}`);
        if (list === null) { delete oo[pid]; continue; }
        if (!Array.isArray(list) || !list.length || list.some(x => !["all", ...FUN_FEATS].includes(x))) throw httpErr(400, `optOut.${pid} 应为非空数组，元素取 all/grudge/gag/jealousy`);
        oo[pid] = [...new Set(list)];
      }
      s.optOut = oo;
    } else throw httpErr(400, "不支持的参数：" + k);
  }
  // 交叉检查：同一功能里的各口令不能重复
  const e = funEffective(s); const ph = [e.killPhrase, e.optOutAllPhrase, e.grudge.optOutPhrase, e.grudge.clearPhrase, e.gag.optOutPhrase, e.gag.deletePhrase, e.jealousy.optOutPhrase];
  if (new Set(ph).size !== ph.length) throw httpErr(400, "各口令不能重复");
  return s;
}
const funGrudges = () => funReadJ("grudges.json", () => ({ version: 1, people: {} }));
const funGags = () => funReadJ("gags.json", () => ({ version: 1, groups: {} }));
function funPidArg(b) { const p = String(b?.person || "").toUpperCase(); if (!FUN_PID.test(p)) throw httpErr(400, "person 应为 32 位 QQ openid"); return p; }

Object.assign(R, {
  "GET /api/fun/params": async () => { const s = funStored(); return { params: funEffective(s), stored: s, defaults: FUN_DEFAULTS, consumers: false, note: "技能、脚本和 gate 补丁还没上线，这里的设置暂时只存不生效" }; },
  "POST /api/fun/params/set": W("fun.params.set", b => Object.keys(b.params || {}).join(","), async b => {
    const s = funMerge(funStored(), b.params); s.version = 1; const backup = funWriteJ("params.json", s);
    return { ok: true, params: funEffective(s), backup };
  }, { confirm: true }),
  "GET /api/fun/grudges": async () => {
    const g = funGrudges(), oo = funEffective(funStored()).optOut;
    return { people: Object.entries(g.people || {}).map(([id, p]) => ({ id, name: p.name || null, entries: (p.entries || []).map(e => ({ id: e.id, group: e.group, quote: e.quote, at: e.at, count: e.count || 1 })), lastRecallAt: p.lastRecallAt || null, optOut: !!(oo[id] && (oo[id].includes("all") || oo[id].includes("grudge"))) })), updatedAt: g.updatedAt || null };
  },
  "POST /api/fun/grudges/delete": W("fun.grudges.delete", b => `${b.person} ${b.entryId}`, async b => {
    const pid = funPidArg(b); if (typeof b.entryId !== "string" || !b.entryId) throw httpErr(400, "需要 entryId");
    const g = funGrudges(); const p = g.people?.[pid]; const i = (p?.entries || []).findIndex(e => e.id === b.entryId); if (i < 0) throw httpErr(404, "条目不存在");
    p.entries.splice(i, 1); if (!p.entries.length) delete g.people[pid]; const backup = funWriteJ("grudges.json", g, "delete");
    return { ok: true, backup };
  }, { confirm: true }),
  // 撕本本：清空某人的全部条目
  "POST /api/fun/grudges/clear": W("fun.grudges.clear", b => String(b.person), async b => {
    const pid = funPidArg(b); const g = funGrudges(); const n = g.people?.[pid]?.entries?.length || 0; if (!g.people?.[pid]) throw httpErr(404, "这个人的本本是空的");
    delete g.people[pid]; const backup = funWriteJ("grudges.json", g, "clear"); return { ok: true, removed: n, backup };
  }, { confirm: true }),
  "GET /api/fun/gags": async u => {
    const grp = u.searchParams.get("group"); if (grp && !FUN_GK.test(grp)) throw httpErr(400, "group 应为 group:<32位小写hex>");
    const gg = funGags().groups || {}; const keys = grp ? [grp] : Object.keys(gg);
    return { groups: keys.map(k => ({ group: k, items: (gg[k]?.items || []).map(x => ({ id: x.id, quote: x.quote, context: x.context, keywords: x.keywords || [], score: x.score, addedAt: x.addedAt, uses: x.uses || 0, lastUsedAt: x.lastUsedAt || null, retired: !!x.retired, promotedToSlang: !!x.promotedToSlang })) })) };
  },
  "POST /api/fun/gags/delete": W("fun.gags.delete", b => `${b.group} ${b.id}`, async b => {
    if (!FUN_GK.test(String(b.group || ""))) throw httpErr(400, "group 应为 group:<32位小写hex>"); if (typeof b.id !== "string" || !b.id) throw httpErr(400, "需要 id");
    const g = funGags(); const arr = g.groups?.[b.group]?.items || []; const i = arr.findIndex(x => x.id === b.id); if (i < 0) throw httpErr(404, "梗不存在");
    arr.splice(i, 1); const backup = funWriteJ("gags.json", g, "delete"); return { ok: true, backup };
  }, { confirm: true }),
  "GET /api/fun/trash": async () => { let fs_ = []; try { fs_ = fs.readdirSync(FUN_TRASH).filter(f => !f.startsWith(".")).sort().reverse(); } catch {} return { items: fs_.map(f => { let s = null; try { s = fs.statSync(path.join(FUN_TRASH, f)); } catch {} return { file: f, size: s?.size ?? null, mtime: s?.mtimeMs ?? null }; }) }; },
});

