import fs from "fs"; import vm from "vm"; import path from "path"; import os from "os"; import assert from "assert";
const s = fs.readFileSync(process.argv[2], "utf8");
const blk = s.slice(s.indexOf("// ---------- v2.12"), s.indexOf("function send(res, code"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hsf-")); const WS = tmp + "/workspace"; fs.mkdirSync(WS);
const httpErr = (c, m) => Object.assign(new Error(m), { http: c });
const ops = [];
const ctx = { fs, path, Intl, JSON, Number, Object, Array, String, Date, Set, Map, process: { env: {}, pid: 1 }, httpErr, WORKSPACE: WS, R: {} };
ctx.W = (ep, target, fn, { confirm = false } = {}) => async (u, b, req) => { b = b || {}; try { if (confirm && b.confirm !== true) throw httpErr(400, "需要 confirm:true 确认"); const r = await fn(b, u, req); ops.push([ep, true]); return r ?? { ok: true }; } catch (e) { ops.push([ep, false]); throw e; } };
vm.createContext(ctx); vm.runInContext(blk, ctx);
const R = ctx.R, U = q => new URL("http://x/api/fun" + (q || "")); const FD = WS + "/fun"; const ok = [];
const expect400 = async (k, b) => { try { await R[k](U(), b); assert.fail("未拦截 " + JSON.stringify(b)); } catch (e) { if (e.code === "ERR_ASSERTION") throw e; assert.equal(e.http, 400, e.message); return e.message; } };
// 1 默认全关
let g = await R["GET /api/fun/params"](U()); assert.ok(g.requires.all && /只存不生效/.test(g.note)); assert.equal(g.params.enabled, false); for (const f of ["grudge", "gag", "jealousy"]) assert.equal(g.params[f].enabled, false);
assert.equal(g.params.grudge.recallProbability, 0.1); assert.equal(g.params.grudge.recallCooldownDays, 7); assert.equal(g.params.gag.minScore, 4); assert.equal(g.params.gag.minDistinctPeople, 2); assert.equal(g.params.gag.requireApproval, true);
assert.equal(g.params.jealousy.otherBots[0].id, "A6902CCDF6FD63D47AC7B9A6BD44E201"); assert.equal(g.params.jealousy.tierB, false); assert.equal(fs.existsSync(FD), false); ok.push("默认值全关、读取不建目录");
// 2 部分合并 + 按群 + 退出
const G = "group:379363a480715dfc01f13aaf92571111", P = "7FE244B1202CD602DDA2C06B29C62F50";
let r = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { grudge: { enabled: true, perGroup: { [G]: { enabled: true, recallProbability: 0.2 } } }, optOut: { [P.toLowerCase()]: ["grudge", "grudge"] }, killPhrase: "星野认真点" } });
assert.equal(r.params.grudge.enabled, true); assert.equal(r.params.grudge.recallCooldownDays, 7); assert.equal(r.params.grudge.perGroup[G].recallProbability, 0.2); assert.deepEqual(r.params.optOut[P], ["grudge"]); assert.equal(r.backup, null); ok.push("部分合并/按群覆盖/退出名单（openid 转大写去重）");
// 3 第二次写有备份；null 删除
r = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { grudge: { perGroup: { [G]: null } }, optOut: { [P]: null }, killPhrase: null } });
assert.ok(r.backup && fs.existsSync(FD + "/.trash/" + r.backup)); assert.deepEqual(r.params.grudge.perGroup, {}); assert.deepEqual(r.params.optOut, {}); assert.equal(r.params.killPhrase, "星野正经点"); ok.push("写前备份进 .trash、null 删除群/人/字段");
r = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { grudge: null, jealousy: { otherBots: [{ id: "a6902ccdf6fd63d47ac7b9a6bd44e201", name: "芙芙" }] } } });
assert.equal(r.params.grudge.enabled, false); assert.equal(r.params.jealousy.otherBots[0].name, "芙芙"); r = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { jealousy: { otherBots: null } } }); assert.equal(r.params.jealousy.otherBots[0].name, "芙宁娜"); ok.push("整段 null 回默认；otherBots 可改可还原");
// 4 非法输入
const bads = [{ params: { grudge: { recallProbability: 2 } } }, { params: { grudge: { recallCooldownDays: 0 } } }, { params: { gag: { minScore: 1.5 } } }, { params: { gag: { perGroup: { "group:ABC": { enabled: true } } } } }, { params: { gag: { perGroup: { [G]: { enabled: true, maxUses: 3 } } } } }, { params: { jealousy: { perGroup: { [G]: { tierB: true } } } } }, { params: { jealousy: { otherBots: [{ id: "x", name: "a" }] } } }, { params: { optOut: { [P]: ["foo"] } } }, { params: { optOut: { bad: ["all"] } } }, { params: { foo: 1 } }, { params: { grudge: { foo: 1 } } }, { params: { killPhrase: "撕本本" } }, { params: { enabled: "yes" } }, { params: { grudge: { clearPhrase: "a\nb" } } }];
for (const b of bads) await expect400("POST /api/fun/params/set", { confirm: true, ...b });
const m = await expect400("POST /api/fun/params/set", { params: { enabled: true } }); assert.match(m, /confirm/); ok.push(bads.length + " 种非法输入 + 缺 confirm 均 400（中文）");
// 5 grudges
fs.writeFileSync(FD + "/grudges.json", JSON.stringify({ version: 1, people: { [P]: { entries: [{ id: "g1", group: G, quote: "星野胖", at: 1 }, { id: "g2", group: G, quote: "星野笨", at: 2 }] }, "249BDB147AE23FACCE0F2D0BAFD1579B": { entries: [{ id: "g3", group: G, quote: "x", at: 3 }] } } }));
await R["POST /api/fun/params/set"](U(), { confirm: true, params: { optOut: { [P]: ["all"] } } });
let gr = await R["GET /api/fun/grudges"](U()); assert.equal(gr.people.length, 2); assert.equal(gr.people.find(p => p.id === P).optOut, true);
r = await R["POST /api/fun/grudges/delete"](U(), { confirm: true, person: P, entryId: "g1" }); assert.ok(fs.existsSync(FD + "/.trash/" + r.backup)); assert.match(r.backup, /delete-grudges/);
r = await R["POST /api/fun/grudges/clear"](U(), { confirm: true, person: P }); assert.equal(r.removed, 1); gr = await R["GET /api/fun/grudges"](U()); assert.equal(gr.people.length, 1);
await expect400("POST /api/fun/grudges/clear", { confirm: true, person: "nope" });
try { await R["POST /api/fun/grudges/clear"](U(), { confirm: true, person: P }); assert.fail(); } catch (e) { assert.equal(e.http, 404); }
ok.push("小本本：读、删一条、撕本本，均先备份；空本本 404");
// 6 gags
fs.writeFileSync(FD + "/gags.json", JSON.stringify({ version: 1, groups: { [G]: { items: [{ id: "m1", quote: "奶茶要去冰", context: "点外卖", keywords: ["外卖"], score: 6, addedAt: 1 }] } } }));
let gg = await R["GET /api/fun/gags"](U("?group=" + G)); assert.equal(gg.groups[0].items[0].uses, 0);
await expect400("GET /api/fun/gags", undefined).catch(() => {});
try { await R["GET /api/fun/gags"](U("?group=bad")); assert.fail(); } catch (e) { assert.equal(e.http, 400); }
r = await R["POST /api/fun/gags/delete"](U(), { confirm: true, group: G, id: "m1" }); assert.ok(r.backup); gg = await R["GET /api/fun/gags"](U()); assert.equal(gg.groups[0].items.length, 0);
ok.push("梗：按群读、删除先备份、非法 group 400");
const t = await R["GET /api/fun/trash"](U()); assert.ok(t.items.length >= 6); ok.push(`.trash 共 ${t.items.length} 份备份`);
assert.ok(ops.some(o => o[0] === "fun.params.set" && o[1] === false)); ok.push("失败也写操作日志");

// 7 拟人化
let h = await R["GET /api/fun/humanlike"](U()); assert.equal(h.params.enabled, false); assert.equal(h.consumers, false); assert.equal(h.params.proactive.mode, "off"); assert.equal(h.params.sensitive.mode, "never"); assert.deepEqual(h.params.quirk.phrases, []); assert.equal(h.suggestions.quirkPhrases.length, 3); assert.ok(h.requires.all);
for (const f of ["followup", "opinion", "dontKnow", "quirk", "mood"]) assert.equal(h.params[f].enabled, false);
assert.equal(h.params.proactive.triggerProbability, 0.2); assert.equal(h.params.proactive.minIntervalMin, 180); assert.equal(h.params.proactive.perGroupDailyCap, 2); assert.equal(h.params.proactive.requireReason, true); assert.ok(!JSON.stringify(h.params).match(/delay/i)); ok.push("拟人化默认全关、mode=off、never、口癖空+3 条建议、无延迟项");
r = await R["POST /api/fun/humanlike/set"](U(), { confirm: true, params: { proactive: { mode: "passive", triggerProbability: 0.3 }, quirk: { phrases: ["嗯……", "算了"], probability: 0.1 }, sensitive: { mode: "dmOnly", topics: ["医疗"] }, perGroup: { [G]: { enabled: true, mood: false } }, optOut: { [P.toLowerCase()]: ["quirk", "all"] } } });
assert.equal(r.params.proactive.mode, "passive"); assert.equal(r.params.proactive.minIntervalMin, 180); assert.deepEqual(r.params.quirk.phrases, ["嗯……", "算了"]); assert.equal(r.params.sensitive.mode, "dmOnly"); assert.deepEqual(r.params.optOut[P], ["all"]); assert.equal(r.params.perGroup[G].mood, false); assert.ok(JSON.parse(fs.readFileSync(FD + "/humanlike.json")).proactive);
r = await R["POST /api/fun/humanlike/set"](U(), { confirm: true, params: { proactive: { mode: "heartbeat", heartbeatIntervalMin: 120 }, quirk: { phrases: null }, sensitive: null } });
assert.ok(r.backup && fs.existsSync(FD + "/.trash/" + r.backup)); assert.deepEqual(r.params.quirk.phrases, []); assert.equal(r.params.sensitive.mode, "never"); assert.equal(r.params.proactive.heartbeatIntervalMin, 120); ok.push("拟人化部分合并、null 回默认、备份、openid 大写、all 收拢");
const hb = [{ proactive: { mode: "on" } }, { proactive: { triggerProbability: 1.5 } }, { proactive: { minIntervalMin: 5 } }, { proactive: { perGroupDailyCap: 11 } }, { proactive: { quietHoursStart: 3, quietHoursEnd: 3 } }, { sensitive: { mode: "sometimes" } }, { sensitive: { topics: "医疗" } }, { quirk: { phrases: ["算了", " 算 了 "] } }, { quirk: { phrases: ["一二三四五六七八九十一二三四五六七八九十一"] } }, { quirk: { delayMs: 100 } }, { techMode: { keywords: ["Error", "error"] } }, { optOutPhrase: "技术模式" }, { optOutPhrase: "别整我" }, { perGroup: { [G]: { mood: true } } }, { perGroup: { [G]: { enabled: true, techMode: false } } }, { optOut: { [P]: ["foo"] } }, { foo: 1 }, { opinion: "x" }];
for (const b of hb) await expect400("POST /api/fun/humanlike/set", { confirm: true, params: b });
assert.match(await expect400("POST /api/fun/humanlike/set", { params: { enabled: true } }), /confirm/); ok.push(hb.length + " 种拟人化非法输入 + 缺 confirm 均 400（含与小脾气口令撞车、去重忽略空白大小写、无延迟字段）");
assert.deepEqual((await R["GET /api/fun/humanlike/followups"](U())).items, []); assert.ok(ops.some(o => o[0] === "fun.humanlike.set" && o[1] === false)); ok.push("followups 只读空列表；fun.humanlike.set 失败也记日志");

// 8 护短 / 抢早安
h = await R["GET /api/fun/humanlike"](U()); assert.equal(h.params.protect.enabled, false); assert.equal(h.params.morning.enabled, false); assert.equal(h.params.morning.mode, "passive"); assert.ok(h.requires.all);
r = await R["POST /api/fun/humanlike/set"](U(), { confirm: true, params: { protect: { enabled: true, probability: 0.3 }, morning: { enabled: true, habitMinDays: 3 }, perGroup: { [G]: { enabled: true, morning: false } } } });
assert.equal(r.params.protect.perTargetDailyCap, 1); assert.equal(r.params.morning.habitMinDays, 3); assert.equal(r.params.perGroup[G].morning, false);
for (const b of [{ morning: { mode: "cron" } }, { morning: { windowStartHour: 11, windowEndHour: 9 } }, { morning: { habitMinDays: 30, habitWindowDays: 7 } }, { morning: { perGroupDailyCap: 2 } }, { protect: { probability: -1 } }, { protect: { roastKeywords: ["菜", " 菜"] } }]) await expect400("POST /api/fun/humanlike/set", { confirm: true, params: b });
ok.push("护短/抢早安：默认关、部分合并、按群关、6 种非法输入 400");

// 9 人机破防 / 盲猜 MBTI
h = await R["GET /api/fun/humanlike"](U()); assert.equal(h.params.robotBit.enabled, false); assert.equal(h.params.mbti.enabled, false); assert.equal(h.params.mbti.includeZodiac, false); assert.ok(h.params.mbti.forbiddenTopics.includes("性取向")); assert.ok(h.requires.all);
r = await R["POST /api/fun/humanlike/set"](U(), { confirm: true, params: { robotBit: { enabled: true, segmentGapMin: 60 }, mbti: { enabled: true }, perGroup: { [G]: { enabled: true, mbti: false } }, optOut: { [P]: ["robotBit"] } } });
assert.equal(r.params.robotBit.perGroupDailyCap, 3); assert.equal(r.params.perGroup[G].mbti, false); assert.deepEqual(r.params.optOut[P], ["robotBit"]);
for (const b of [{ robotBit: { segmentGapMin: 1 } }, { robotBit: { sincereKeywords: ["人机"] } }, { mbti: { includeZodiac: "yes" } }, { mbti: { forbiddenTopics: ["健康", "健康 "] } }, { mbti: { newMem0: true } }]) await expect400("POST /api/fun/humanlike/set", { confirm: true, params: b });
ok.push("人机破防/盲猜MBTI：默认关、合并、按群/个人退出、5 种非法输入 400");
r = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { lexicon: { enabled: true, perGroup: { [G]: { enabled: true, maxSlang: 5 } } } } }); assert.equal(r.params.lexicon.perGroup[G].maxSlang, 5); assert.equal(r.params.lexicon.includeDerogatory, false);
await expect400("POST /api/fun/params/set", { confirm: true, params: { lexicon: { maxSlang: 99 } } }); ok.push("黑话/称呼注入开关（lexicon）：默认关、按群覆盖、范围校验");
{ const pd = tmp + "/plugins/qq-group-followup-gate"; fs.mkdirSync(pd, { recursive: true }); fs.writeFileSync(pd + "/index.js", "x"); fs.writeFileSync(pd + "/fun-context.mjs", "x"); assert.equal((await R["GET /api/fun/params"](U())).consumers, false); fs.writeFileSync(pd + "/index.js", "/* HOSINO-FUN-CONTEXT v1 */"); assert.equal((await R["GET /api/fun/params"](U())).consumers, true); assert.equal((await R["GET /api/fun/humanlike"](U())).consumers, true); ok.push("consumers：gate 补丁装好后自动变 true"); }
{ const gq = await R["GET /api/fun/params"](U()); assert.ok(gq.requires.gag && !gq.requires["jealousy.tierB"] && !gq.requires.all); const sq = await R["POST /api/fun/params/set"](U(), { confirm: true, params: { enabled: false, jealousy: { tierB: true, tierBProbability: 0.5, perGroup: { [G]: { enabled: true, tierBProbability: 0.2 } } } } }); assert.equal(sq.params.jealousy.tierBProbability, 0.5); assert.equal(sq.params.jealousy.perGroup[G].tierBProbability, 0.2); assert.ok(sq.requires.lexicon);
  const hq = await R["GET /api/fun/humanlike"](U()); assert.ok(hq.requires["morning.mode=heartbeat"] && hq.requires["proactive.mode=heartbeat"] && !hq.requires.all);
  for (const x of [gq, sq, hq]) { assert.ok(!/不生效/.test(JSON.stringify(x.requires) + x.note), "已安装时不能出现“不生效”"); }
  await expect400("POST /api/fun/params/set", { confirm: true, params: { jealousy: { tierBProbability: 2 } } });
  ok.push("已安装时 requires 只剩信息提示、不出现“不生效”；tierBProbability 可调可按群覆盖"); }
console.log("console v2.12 fun:\n- " + ok.join("\n- ") + "\n全部通过"); fs.rmSync(tmp, { recursive: true });
