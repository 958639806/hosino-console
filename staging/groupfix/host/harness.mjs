// 离线测试：node test/harness.mjs（在 gate/ 目录下运行）
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import assert from "node:assert"; import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname), GATE = path.dirname(HERE);
const T = fs.mkdtempSync(path.join(os.tmpdir(), "hsfun-")); const STATE = T + "/state", WS = T + "/ws", FUN = WS + "/fun", LEX = T + "/lexicon";
fs.mkdirSync(STATE, { recursive: true }); fs.mkdirSync(WS + "/stickers", { recursive: true }); fs.mkdirSync(LEX);
fs.writeFileSync(STATE + "/openclaw.json", JSON.stringify({ agents: { defaults: { workspace: WS } }, messages: { groupChat: { mentionPatterns: ["星野"] } } }));
process.env.OPENCLAW_STATE_DIR = STATE;
function mkPlugin(name, indexSrc) {
  const d = T + "/" + name; fs.mkdirSync(d + "/node_modules/openclaw", { recursive: true });
  fs.writeFileSync(d + "/node_modules/openclaw/package.json", JSON.stringify({ name: "openclaw", type: "module", exports: { "./plugin-sdk/plugin-entry": "./pe.mjs" } }));
  fs.writeFileSync(d + "/node_modules/openclaw/pe.mjs", "export const definePluginEntry = (x) => x;");
  fs.writeFileSync(d + "/package.json", JSON.stringify({ type: "module" }));
  fs.writeFileSync(d + "/controlled-media-plugin.mjs", "export function registerControlledMediaJobs(){}");
  fs.writeFileSync(d + "/qq-tool-path-hint.mjs", "export function buildToolPathHint(){ return ''; }");
  fs.writeFileSync(d + "/keepalive.js", "export const resolveKeepaliveConfig=()=>({enabled:false}); export const resolveLurkConfig=()=>({}); export const createKeepalive=()=>null;");
  fs.writeFileSync(d + "/index.js", indexSrc); fs.copyFileSync(GATE + "/fun-context.mjs", d + "/fun-context.mjs"); return d;
}
async function load(d) {
  const mod = (await import(pathToFileURL(d + "/index.js").href)).default; const H = {}; const logs = [];
  mod.register({ pluginConfig: { warmup: false }, logger: { info: (m) => logs.push(m) }, on: (n, f) => (H[n] ||= []).push(f), registerTool: () => {} });
  await new Promise((r) => setTimeout(r, 50)); return { H, logs };
}
const O = await load(mkPlugin("orig", fs.readFileSync(GATE + "/orig/index.js", "utf8")));
const Pp = await load(mkPlugin("patched", fs.readFileSync(GATE + "/patched/index.js", "utf8")));
const ok = [];
const GA = "379363a480715dfc01f13aaf92571111", GB = "0123456789abcdef0123456789abcdef", GC = "fedcba9876543210fedcba9876543210";
const SK = (g) => `agent:main:qqbot:group:${g}`;
const RIN = "4330BBC52465D583F003C0A68650DF70", LI = "7FE244B1202CD602DDA2C06B29C62F50", HARU = "249BDB147AE23FACCE0F2D0BAFD1579B", FURINA = "A6902CCDF6FD63D47AC7B9A6BD44E201";
function turn(P, g, sender, content, extra = {}) {
  const ev = { channel: "qqbot", isGroup: true, sessionKey: SK(g), senderId: sender, content, ...extra };
  for (const f of P.H.before_dispatch || []) f(ev, { channelId: "qqbot", sessionKey: SK(g) });
  const r = P.H.before_prompt_build.map((f) => f({}, { sessionKey: SK(g), trigger: "user", channelId: "qqbot" })).find(Boolean);
  return r;
}
const both = (g, s, c, e) => [turn(O, g, s, c, e), turn(Pp, g, s, c, e)];
const BATTERY = [[GA, LI, "大家好"], [GA, RIN, "@星野 你好"], [GB, LI, "早"], [GB, HARU, "你是人机吧"], [GA, LI, "报错了 Traceback xxx"], [GA, HARU, "小离好菜"], [GA, LI, "芙宁娜好厉害 星野你看看"], [GB, RIN, "星野正经点"], [GA, LI, "你是真人吗"], [GA, LI, "想死了"]];
// 1 默认（无 fun 目录）逐字节一致
for (const b of BATTERY) { const [a, p] = both(...b); assert.deepEqual(p, a, "默认输出不同：" + b[2]); }
const hb = (P, g) => P.H.before_prompt_build.map((f) => f({}, { sessionKey: SK(g), trigger: "heartbeat", channelId: "qqbot" })).find(Boolean);
for (const g of [GA, GB]) { assert.equal(hb(O, g), undefined); assert.equal(hb(Pp, g), undefined); }
assert.equal(fs.existsSync(FUN), false); ok.push("群心跳轮（keepalive）补丁前后都跳过，无提示；");ok.push(`默认（无 fun 文件）${BATTERY.length} 种消息输出与补丁前逐字节一致，不建目录`);
// 2 参数文件存在但总开关关
fs.mkdirSync(FUN); fs.writeFileSync(FUN + "/params.json", JSON.stringify({ version: 1, grudge: { enabled: true, defaultEnabled: true } })); fs.writeFileSync(FUN + "/humanlike.json", JSON.stringify({ version: 1, quirk: { enabled: true, probability: 1, phrases: ["嗯……"] }, protect: { enabled: true } }));
for (const b of BATTERY) { const [a, p] = both(...b); assert.deepEqual(p, a); }
assert.equal(fs.existsSync(FUN + "/gate-state.json"), false); ok.push("单项开但总开关关：输出一致，不写 gate-state.json");
// 3 全开：appendSystemContext 逐字节不变，appendContext = 原内容 + 一行
fs.writeFileSync(FUN + "/humanlike.json", JSON.stringify({ version: 1, enabled: true, quirk: { enabled: true, probability: 1, phrases: ["嗯……怎么说呢"] }, robotBit: { enabled: true } }));
await new Promise((r) => setTimeout(r, 5100));
let sys = 0;
for (const b of BATTERY) { const [a, p] = both(...b); assert.equal(p.appendSystemContext, a.appendSystemContext); if (a.appendSystemContext) sys++; if (p.appendContext !== a.appendContext) { assert.ok(p.appendContext.startsWith(a.appendContext || ""), "原 appendContext 必须是前缀"); const add = p.appendContext.slice((a.appendContext || "").length).replace(/^\n/, ""); assert.ok(add.startsWith("【星野·") && !add.includes("\n"), add); } }
for (const g of [GA, GB]) assert.equal(hb(Pp, g), undefined); assert.ok(sys >= 5); ok.push("全开但没有 fun 心跳待办时，群心跳轮照旧跳过"); ok.push(`全开：${sys} 个稳定包装群轮次 appendSystemContext 逐字节不变；新增内容只在 appendContext 末尾一行`);
{ const [a, p] = both(GC, LI, "今天吃什么"); assert.ok(p.appendContext.includes("口癖「嗯……怎么说呢」")); }
{ const [, p] = both(GC, HARU, "你是真人吗"); assert.match(p.appendContext, /如实说你是 AI/); }
{ const [, p] = both(GA, HARU, "想死了"); assert.match(p.appendContext, /自伤/); assert.ok(!/口癖/.test(p.appendContext)); }
ok.push("经 index.js：口癖、认真问必须如实、自伤走认真模式");
// 4 出错不影响本轮：fun-context 抛异常
fs.writeFileSync(FUN + "/humanlike.json", "{坏的json"); await new Promise((r) => setTimeout(r, 5100));
{ const [a, p] = both(GA, LI, "大家好"); assert.deepEqual(p, a); }
mkPlugin("broken", fs.readFileSync(GATE + "/patched/index.js", "utf8")); fs.writeFileSync(T + "/broken/fun-context.mjs", "export function createFunContext(){ return { onDispatch(){ throw new Error('boom') }, hint(){ throw new Error('boom2') }, flush(){ throw 1 } }; }");
const P3 = await load(mkPlugin("broken2", fs.readFileSync(GATE + "/patched/index.js", "utf8").replace("./fun-context.mjs", "./missing.mjs")));
{ const a = turn(O, GA, LI, "x"); const b3 = turn(P3, GA, LI, "x"); assert.deepEqual(b3, a); assert.ok(P3.logs.some((l) => l.includes("fun-context load failed"))); }
ok.push("坏 JSON、模块缺失：输出与补丁前一致，只记日志");
// 直接测 fun-context.mjs
const { createFunContext } = await import(pathToFileURL(GATE + "/fun-context.mjs").href);
{ const P4 = { H: {} }; const mod = (await import(pathToFileURL(T + "/broken/index.js").href)).default; const logs = []; mod.register({ pluginConfig: { warmup: false }, logger: { info: (m) => logs.push(m) }, on: (n, f) => (P4.H[n] ||= []).push(f), registerTool: () => {} }); await new Promise((r) => setTimeout(r, 50)); const a = turn(O, GA, LI, "y"); const b = turn(P4, GA, LI, "y"); assert.deepEqual(b, a); assert.ok(logs.some((l) => l.includes("fun hint error")) && logs.some((l) => l.includes("fun dispatch error"))); ok.push("fun 代码运行时抛异常：被吞掉，本轮输出与补丁前一致"); }
let clock = Date.parse("2026-10-21T00:30:00Z"); /* 08:30 SGT */ let dice = 0; const D = T + "/unit"; fs.mkdirSync(D);
const W = (f, o) => fs.writeFileSync(D + "/" + f, JSON.stringify(o));
const mk = (keep) => { if (!keep) fs.rmSync(D + "/gate-state.json", { force: true }); return mk0(); }; const mk0 = () => createFunContext({ dir: D, now: () => clock, rnd: () => dice, lexiconDir: LEX });
const say = (C, g, s, text, addressed = false, extra = {}) => { C.onDispatch({ isGroup: true, sessionKey: SK(g), senderId: s, content: text, ...extra }, {}); return C.hint(SK(g), {}, { addressed }); };
const adv = (min) => { clock += min * 60000; };
// 技术模式
W("humanlike.json", { enabled: true, quirk: { enabled: true, probability: 1, phrases: ["嗯"] } }); let C = mk();
assert.match(say(C, GB, LI, "systemctl restart 报错了"), /技术模式/); adv(5); assert.match(say(C, GB, LI, "那现在呢"), /技术模式/); adv(11); assert.match(say(C, GB, LI, "吃饭去"), /口癖/);
assert.match(say(C, GB, RIN, "技术模式"), /技术模式/); adv(1); assert.match(say(C, GB, RIN, "聊天模式"), /口癖/); ok.push("技术模式：关键词触发、粘滞 10 分钟、凛口令开关；期间屏蔽口癖");
// 退出：参数 + 自助口令
W("humanlike.json", { enabled: true, quirk: { enabled: true, probability: 1, phrases: ["嗯"] }, optOut: { [HARU]: ["quirk"] } }); C = mk();
assert.equal(say(C, GB, HARU, "随便聊聊"), ""); assert.match(say(C, GB, LI, "随便聊聊"), /口癖/); say(C, GB, LI, "别拟人"); assert.equal(say(C, GB, LI, "随便聊聊"), ""); ok.push("退出：控制台名单 + “别拟人”自助口令");
// 按群关
W("humanlike.json", { enabled: true, quirk: { enabled: true, probability: 1, phrases: ["嗯"] }, perGroup: { ["group:" + GB]: { enabled: true, quirk: false } } }); C = mk(); assert.equal(say(C, GB, HARU, "聊"), ""); assert.match(say(C, GA, HARU, "聊"), /口癖/); ok.push("按群关单项");
// 口癖骰子
W("humanlike.json", { enabled: true, quirk: { enabled: true, probability: 0.067, phrases: ["嗯"] } }); C = mk(); dice = 0.5; assert.equal(say(C, GB, HARU, "聊"), ""); dice = 0.01; assert.match(say(C, GB, HARU, "聊"), /口癖/); ok.push("口癖概率在代码里掷骰");
// 人机：每段一次 + 认真问
W("humanlike.json", { enabled: true, robotBit: { enabled: true } }); C = mk(); dice = 0;
assert.match(say(C, GB, HARU, "你是人机吧"), /破防一次/); adv(1); assert.match(say(C, GB, LI, "就是人机"), /别再演/); adv(31); assert.match(say(C, GB, LI, "人机人机"), /破防一次/);
adv(40); assert.match(say(C, GB, HARU, "说真的你是不是AI"), /如实说你是 AI/); adv(1); assert.match(say(C, GB, HARU, "人机"), /别再演/);
W("humanlike.json", { enabled: true, robotBit: { enabled: false } }); C = mk(); assert.match(say(C, GB, HARU, "你是真人吗"), /如实/); ok.push("人机：每段一次、30 分钟沉默算新段、认真问一律如实（单项关也如实）");
for (let i = 0; i < 5; i++) { adv(31); say(C, GB, HARU, "x"); } W("humanlike.json", { enabled: true, robotBit: { enabled: true, perGroupDailyCap: 1 } }); C = mk(); adv(31); say(C, GB, HARU, "人机"); adv(31); assert.ok(!/破防一次/.test(say(C, GB, HARU, "人机"))); ok.push("人机：每群每天上限");
// 护短 + 劝和
W("humanlike.json", { enabled: true, protect: { enabled: true, probability: 1 } }); C = mk();
say(C, GA, HARU, "小离好菜"); say(C, GA, RIN, "小离真笨"); const ph = say(C, GA, HARU, "小离废物哈哈"); assert.match(ph, /小离是我罩的/);
say(C, GA, HARU, "小离好菜"); say(C, GA, RIN, "小离真笨"); assert.ok(!/罩/.test(say(C, GA, HARU, "小离废物"))); ok.push("护短：5 分钟内 3 条损话触发；同一人每天 1 次");
C = mk(); say(C, GB, HARU, "小离好菜"); assert.match(say(C, GB, LI, "闭嘴吧你有病"), /劝和/); ok.push("护短：命中吵架词转劝和");
C = mk(); say(C, GB, HARU, "芙宁娜好菜"); say(C, GB, RIN, "芙宁娜笨"); assert.ok(!/罩/.test(say(C, GB, HARU, "芙宁娜废物"))); ok.push("护短：不护机器人");
// 早安
W("humanlike.json", { enabled: true, morning: { enabled: true, habitMinDays: 2 } }); C = mk(); const st0 = Date.parse("2026-10-21T00:30:00Z");
for (const d of [3, 2]) { clock = st0 - d * 86400000; say(C, GB, HARU, "早"); }
clock = st0; const m1 = say(C, GB, LI, "早安"); assert.match(m1, /小离今天第一个说早安（08:30）/); adv(1); assert.ok(!/早安/.test(say(C, GB, HARU, "早"))); 
C = mk(); clock = st0; assert.ok(!/早安/.test(say(C, GA, LI, "早")));  ok.push("早安：有习惯（近 14 天 ≥N 天）才触发、每天只第一条、无习惯群不触发");
clock = st0 + 5 * 3600000; C = mk(); assert.ok(!/早安/.test(say(C, GB, HARU, "早"))); ok.push("早安：时段外不触发");
// 被动搭话
clock = Date.parse("2026-10-21T06:00:00Z"); W("humanlike.json", { enabled: true, proactive: { mode: "passive", triggerProbability: 0.2 } }); C = mk(); dice = 0.1;
say(C, GA, HARU, "a"); adv(60); assert.equal(say(C, GA, HARU, "b"), ""); adv(200); assert.match(say(C, GA, HARU, "c"), /冷场了 3 小时.*理由/); adv(200); dice = 0.3; assert.equal(say(C, GA, HARU, "d"), "");
dice = 0.1; adv(10); assert.equal(say(C, GA, HARU, "e"), ""); ok.push("被动搭话：冷场阈值、概率、最小间隔");
W("humanlike.json", { enabled: true, proactive: { mode: "heartbeat", triggerProbability: 1 } }); C = mk(); clock = Date.parse("2026-10-22T02:00:00Z"); say(C, GB, HARU, "a"); adv(300); assert.equal(say(C, GB, HARU, "x"), "", "heartbeat 模式不走被动接话");
W("humanlike.json", { enabled: true, proactive: { mode: "passive", triggerProbability: 1 } }); C = mk(); clock = Date.parse("2026-10-22T02:00:00Z"); assert.equal(say(C, GB, HARU, "第一条"), "", "重启后第一条不算冷场"); adv(300); assert.match(say(C, GB, HARU, "x"), /冷场了 5 小时/);
C = mk(); clock = Date.parse("2026-10-22T14:00:00Z"); say(C, GB, HARU, "a"); adv(300); assert.equal(say(C, GB, HARU, "x"), "", "安静时段");
ok.push("被动接话只在 passive 模式；重启后第一条不算冷场；安静时段（凌晨）不接");
// 追问
W("humanlike.json", { enabled: true, followup: { enabled: true } }); W("followups.json", { items: [{ id: "f1", person: LI, group: "group:" + GB, event: "周四面试", dueAt: clock - 20 * 3600000 }, { id: "f2", person: LI, event: "去医院复查", dueAt: clock - 20 * 3600000 }] }); C = mk();
assert.match(say(C, GB, LI, "嗨"), /周四面试/); adv(5); assert.ok(!/面试|医院/.test(say(C, GB, LI, "嗨"))); ok.push("追问：到期才问、只问一次、敏感话题（never）不问");
// 情绪
W("humanlike.json", { enabled: true, mood: { enabled: true, minBaselineMsgs: 5 } }); C = mk();
for (let i = 0; i < 6; i++) say(C, GA, HARU, "今天又刷到一个超级好笑的视频哈哈哈哈哈你们快看");
say(C, GA, HARU, "嗯"); say(C, GA, HARU, "哦"); assert.match(say(C, GA, HARU, "嗯"), /话比平时少/); assert.ok(!/话比平时少/.test(say(C, GA, HARU, "嗯"))); ok.push("情绪：基线足够才判断、每人每天 1 次");
// 吃醋 A 档
W("params.json", { enabled: true, jealousy: { enabled: true, defaultEnabled: true } }); W("humanlike.json", {}); C = mk();
assert.equal(say(C, GA, LI, "芙宁娜好厉害", false), ""); assert.match(say(C, GA, LI, "星野，芙宁娜比你厉害", true), /吃个醋/); adv(40); assert.ok(!/吃醋/.test(say(C, GA, LI, "芙宁娜好厉害 星野", true))); ok.push("吃醋 A 档：只在叫她时；每人每天 1 次");
// 翻旧账
W("params.json", { enabled: true, grudge: { enabled: true, defaultEnabled: true, recallProbability: 1 } }); W("grudges.json", { people: { [HARU]: { entries: [{ id: "g1", group: "group:" + GA, quote: "星野胖", at: clock - 3 * 86400000 }] } } }); C = mk();
assert.ok(!/旧账/.test(say(C, GA, HARU, "聊天", false))); assert.match(say(C, GA, HARU, "星野在吗", true), /3天前说过「星野胖」/); assert.ok(!/旧账/.test(say(C, GA, HARU, "星野", true)));
C = mk(); say(C, GA, HARU, "撕本本"); assert.ok(!/旧账/.test(say(C, GA, HARU, "星野", true))); ok.push("翻旧账：只在叫她时、冷却 7 天、“撕本本”后旧条目失效");
W("params.json", { enabled: true, grudge: { enabled: true, defaultEnabled: true, recallProbability: 1 }, optOut: { [HARU]: ["all"] } }); C = mk(); assert.equal(say(C, GA, HARU, "星野", true), ""); assert.match(say(C, GA, LI, "星野", false), /记仇本/);
W("params.json", { enabled: true, grudge: { enabled: true, defaultEnabled: true, recallProbability: 1 } }); C = mk(); say(C, GA, HARU, "别整我"); assert.equal(say(C, GA, HARU, "星野", true), ""); ok.push("小脾气退出：控制台 all + “别整我”");
// 回旋镖
W("params.json", { enabled: true, gag: { enabled: true, defaultEnabled: true, perGroupDailyCap: 1 } }); W("gags.json", { groups: { ["group:" + GA]: { items: [{ id: "m1", quote: "奶茶要去冰", context: "点外卖", keywords: ["外卖"] }] } } }); C = mk();
assert.match(say(C, GA, LI, "点外卖了"), /奶茶要去冰/); assert.ok(!/奶茶/.test(say(C, GA, LI, "外卖到了"))); ok.push("回旋镖：关键词命中、每群每天上限、冷却");
// kill
W("params.json", { enabled: true, gag: { enabled: true, defaultEnabled: true } }); W("gags.json", { groups: { ["group:" + GB]: { items: [{ id: "m2", quote: "梗", keywords: ["外卖"] }, { id: "m3", quote: "梗二", keywords: ["外卖"] }] } } }); C = mk();
say(C, GB, LI, "星野正经点"); assert.match(say(C, GB, LI, "外卖"), /梗/); say(C, GB, RIN, "星野正经点"); assert.equal(say(C, GB, LI, "外卖"), ""); ok.push("“星野正经点”只认凛，生效后本群全关 12 小时");
// 黑话/称呼
W("params.json", { enabled: true, lexicon: { enabled: true, defaultEnabled: true } }); fs.writeFileSync(LEX + "/" + GA + ".json", JSON.stringify({ slang: [{ term: "开香槟", meaning: "提前庆祝" }, { term: "坏词", meaning: "x", derogatory: true }], names: [{ id: LI, name: "小离" }] })); C = mk();
const lx = say(C, GA, LI, "先别开香槟 坏词"); assert.match(lx, /开香槟=提前庆祝/); assert.ok(!lx.includes("坏词=")); assert.match(lx, /称呼：7FE244…=小离/); ok.push("黑话/称呼：命中注入，贬义默认不注入");
// 静态标记 + 预算
W("params.json", {}); W("humanlike.json", { enabled: true, opinion: { enabled: true }, dontKnow: { enabled: true }, mbti: { enabled: true } }); C = mk(); assert.match(say(C, GA, LI, "x"), /（有主见｜老实说不知道｜盲猜MBTI｜脚本参数 群id=/); W("params.json", { enabled: true, grudge: { enabled: true, defaultEnabled: true, recallProbability: 0 } }); W("humanlike.json", { enabled: true, followup: { enabled: true } }); C = mk(); assert.match(say(C, GA, LI, "x"), new RegExp("（记仇本｜记事件｜脚本参数 群id=" + GA + " 发送者=" + LI + "）")); W("params.json", {});
W("humanlike.json", { enabled: true, quirk: { enabled: true, probability: 1, phrases: ["嗯"] }, robotBit: { enabled: true }, proactive: { mode: "passive", triggerProbability: 1 }, protect: { enabled: true, probability: 1 } }); C = mk(); dice = 0; adv(500); say(C, GA, HARU, "小离菜"); say(C, GA, HARU, "小离笨"); const many = say(C, GA, HARU, "人机 小离废物"); assert.ok(/罩/.test(many) && /破防/.test(many) && !/口癖|冷场/.test(many), many); ok.push("静态标记给技能用；每轮最多 2 条提示");

// v2：吃醋 B 档
W("params.json", { enabled: true, jealousy: { enabled: true, defaultEnabled: true, tierB: true, tierBProbability: 0.3 } }); W("humanlike.json", {}); C = mk(); clock = Date.parse("2026-10-23T06:00:00Z");
dice = 0.5; assert.equal(say(C, GA, LI, "芙宁娜好厉害"), ""); dice = 0.1; assert.match(say(C, GA, HARU, "芙宁娜好厉害"), /小醋/); adv(5); assert.ok(!/醋/.test(say(C, GA, LI, "芙宁娜真聪明")), "群冷却 120 分钟");
adv(130); assert.ok(!/醋/.test(say(C, GA, HARU, "芙宁娜好厉害")), "每人每天 1 次"); assert.match(say(C, GA, LI, "芙宁娜好可爱"), /小醋/);
adv(130); assert.equal(say(C, GA, FURINA, "我芙宁娜最厉害"), "", "机器人自己说不触发");
W("params.json", { enabled: true, jealousy: { enabled: true, defaultEnabled: true, tierB: false } }); C = mk(); adv(300); assert.equal(say(C, GA, RIN, "芙宁娜好厉害"), "");
W("params.json", { enabled: true, jealousy: { enabled: true, defaultEnabled: true, tierB: true, tierBProbability: 1 } }); C = mk(); adv(300); say(C, GA, RIN, "Traceback error"); assert.ok(!/醋/.test(say(C, GA, RIN, "芙宁娜好厉害")));
C = mk(); adv(300); say(C, GA, RIN, "星野别吃醋"); assert.equal(say(C, GA, RIN, "芙宁娜好厉害"), ""); ok.push("吃醋 B 档：没叫她也可触发；概率、群冷却、每人每天上限、机器人自己不触发、关闭时不触发、技术模式和“星野别吃醋”屏蔽");
// v2：心跳调度
const calls = []; const fakeApi = { config: {}, runtime: { config: { current: () => ({}) }, channel: { outbound: { loadAdapter: async () => ({ sendText: async (x) => { calls.push(["send", x.to, x.text]); return { messageId: "m" }; } }) } }, system: { runHeartbeatOnce: async (x) => { calls.push(["hb", x.sessionKey, x.reason, Ctx.heartbeatHint(x.sessionKey)]); return { status: "ran" }; } } } };
let Ctx; const mkh = () => { fs.rmSync(D + "/gate-state.json", { force: true }); Ctx = createFunContext({ dir: D, now: () => clock, rnd: () => dice, lexiconDir: LEX, api: fakeApi }); return Ctx; };
W("params.json", {}); W("humanlike.json", {}); C = mkh(); clock = Date.parse("2026-10-24T00:00:00Z"); say(C, GA, LI, "hi"); await C.tick(); assert.equal(calls.length, 0);
W("humanlike.json", { enabled: true, proactive: { mode: "passive" }, morning: { enabled: true, mode: "passive" } }); C = mkh(); say(C, GA, LI, "hi"); adv(600); await C.tick(); assert.equal(calls.length, 0); ok.push("心跳调度：默认关或 passive 模式时零调用");
// 早安心跳
W("humanlike.json", { enabled: true, morning: { enabled: true, mode: "heartbeat", habitMinDays: 2 } }); C = mkh(); const base = Date.parse("2026-10-24T00:30:00Z"); /* 08:30 SGT */
for (const d of [3, 2]) { clock = base - d * 86400000; say(C, GB, HARU, "早"); }
clock = base - 2 * 3600000; /* 06:30 */ await C.tick(); assert.equal(calls.length, 0, "未到 7 点不发");
clock = base - 1800000; /* 08:00 */ await C.tick(); assert.equal(calls.length, 1); assert.equal(calls[0][0], "send"); assert.equal(calls[0][1], "qqbot:group:" + GB.toUpperCase()); assert.match(calls[0][2], /早|今天我第一/);
await C.tick(); assert.equal(calls.length, 1, "每天一次"); clock = base; assert.ok(!/早安/.test(say(C, GB, LI, "早")), "她已抢先，不再提示别人抢到沙发");
C = mkh(); for (const d of [3, 2]) { clock = base - d * 86400000; say(C, GB, HARU, "早"); } clock = base - 1800000; say(C, GB, LI, "早"); await C.tick(); assert.equal(calls.length, 1, "已有人说早就不发");
calls.length = 0; C = mkh(); clock = base - 1800000; say(C, GA, LI, "hi"); await C.tick(); assert.equal(calls.length, 0, "没有早安习惯的群不发"); ok.push("早安心跳：7 点后、有习惯、今天没人说早才由 gate 直接发一句（不调模型），每天一次");
// 主动搭话心跳
W("humanlike.json", { enabled: true, proactive: { mode: "heartbeat", heartbeatIntervalMin: 60, quietThresholdMin: 180, triggerProbability: 0.2, minIntervalMin: 180, perGroupDailyCap: 2 } }); C = mkh(); calls.length = 0;
clock = Date.parse("2026-10-24T02:00:00Z"); /* 10:00 */ say(C, GA, LI, "hi"); dice = 0.1;
adv(60); await C.tick(); assert.equal(calls.length, 0, "冷场不够");
adv(130); await C.tick(); assert.equal(calls.length, 1); assert.equal(calls[0][0], "hb"); assert.equal(calls[0][2], "hosino-fun-proactive"); assert.match(calls[0][3], /主动搭话.*message 工具.*NO_REPLY/); assert.equal(C.heartbeatHint(SK(GA)), "", "提示只给这一次心跳轮");
adv(60); await C.tick(); assert.equal(calls.length, 1, "最小间隔 180 分钟"); adv(130); dice = 0.5; await C.tick(); assert.equal(calls.length, 1, "骰子没过");
dice = 0.1; adv(60); await C.tick(); assert.equal(calls.length, 2); adv(200); await C.tick(); assert.equal(calls.length, 2, "每群每天上限 2");
C = mkh(); calls.length = 0; clock = Date.parse("2026-10-24T17:00:00Z"); /* 01:00 */ say(C, GA, LI, "hi"); adv(200); await C.tick(); assert.equal(calls.length, 0, "安静时段不发");
C = mkh(); clock = Date.parse("2026-10-25T02:00:00Z"); say(C, GA, LI, "Traceback error"); adv(5); say(C, GA, RIN, "星野正经点"); adv(200); await C.tick(); assert.equal(calls.length, 0, "凛 kill 后不发"); ok.push("主动搭话心跳：冷场阈值、检查间隔、骰子、最小间隔、每天上限、安静时段、kill；提示只注入那一次心跳轮");
// 心跳轮经过 index.js：有待办才放行，并且只给 appendContext
{ const holder = {}; const mod = (await import(pathToFileURL(T + "/patched/index.js").href)).default; const HH = {}; mod.register({ pluginConfig: { warmup: false }, logger: { info: () => {} }, on: (n, f) => (HH[n] ||= []).push(f), registerTool: () => {}, runtime: fakeApi.runtime, config: {} });
  await new Promise((r) => setTimeout(r, 50)); const r0 = HH.before_prompt_build.map((f) => f({}, { sessionKey: SK(GA), trigger: "heartbeat" })).find(Boolean); assert.equal(r0, undefined); ok.push("index.js 心跳分支：没有 fun 待办时返回 undefined（与补丁前一致）"); }
// 状态落盘
C.flush(); assert.ok(JSON.parse(fs.readFileSync(D + "/gate-state.json", "utf8")).version === 1); ok.push("gate-state.json 原子落盘");
// HOSINO-GROUPFIX v1：QQ 真实事件不带 isGroup，只靠群 sessionKey 也要进 fun / addressed
{ C = mkh(); clock += 3600_000; C.onDispatch({ sessionKey: SK(GA), senderId: LI, content: "无 isGroup 的群消息" }, {}); C.flush(true);
  const st = JSON.parse(fs.readFileSync(D + "/gate-state.json", "utf8")); assert.ok(st.groups && st.groups["group:" + GA], "无 isGroup 时 onDispatch 应记录群");
  C.onDispatch({ sessionKey: "agent:main:qqbot:direct:abc", senderId: LI, content: "私聊" }, {}); C.flush(true);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(D + "/gate-state.json", "utf8")).groups).length, 1, "私聊不应记成群");
  const n0 = Pp.logs.filter((m) => m.includes("addressed session=")).length;
  for (const fn of Pp.H.before_dispatch) fn({ channel: "qqbot", sessionKey: SK(GB), senderId: RIN, content: "@星野 在吗" }, { channelId: "qqbot", sessionKey: SK(GB) });
  assert.equal(Pp.logs.filter((m) => m.includes("addressed session=")).length, n0 + 1, "index.js 无 isGroup 也应识别 @");
  for (const fn of Pp.H.before_dispatch) fn({ channel: "qqbot", sessionKey: "agent:main:qqbot:direct:x", senderId: RIN, content: "@星野 在吗" }, { channelId: "qqbot" });
  assert.equal(Pp.logs.filter((m) => m.includes("addressed session=")).length, n0 + 1, "私聊不应触发群 addressed");
  ok.push("GROUPFIX：事件不带 isGroup、sessionKey 是群 → fun 记录群、index.js 识别 @；私聊不受影响"); }
console.log("HOSINO-FUN-CONTEXT v1 harness:\n- " + ok.join("\n- ") + `\n共 ${ok.length} 组，全部通过`); fs.rmSync(T, { recursive: true });
