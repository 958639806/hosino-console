// HOSINO-VOICE-PARAMS v1 offline tests: extracts mediaHint region from gate index.js and simulates turns.
import fs from "fs"; import path from "path"; import vm from "vm"; import os from "os"; import assert from "assert";
const [,, PATCHED, ORIG, QQ] = process.argv;
const region = (src) => { const a = src.indexOf("// ---- sticker / voice tag hint"); const b = src.indexOf("\n}\n", src.indexOf("function mediaHint(")); return src.slice(a, b + 3); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hsv-")); const ws = path.join(tmp, "workspace"), sd = path.join(ws, "stickers");
fs.mkdirSync(sd, { recursive: true }); for (const k of ["开心", "晚安", "卖萌"]) fs.writeFileSync(path.join(sd, k + "-a.png"), "x");
fs.writeFileSync(path.join(tmp, "openclaw.json"), JSON.stringify({ channels: { qqbot: { mediaTags: { voice: true } } }, agents: { defaults: { workspace: ws } } }));
fs.writeFileSync(path.join(sd, "manifest.json"), JSON.stringify({ categories: {} }));
const baseParams = JSON.parse(fs.readFileSync(path.join(path.dirname(PATCHED), "../../workspace/stickers/params.json"), "utf8"));
let clock = Date.parse("2026-12-01T12:00:00+08:00");
class FakeDate extends Date { constructor(...a) { a.length ? super(...a) : super(clock); } static now() { return clock; } }
function load(src) {
  const ctx = { fs, path, resolveStateDir: () => tmp, Date: FakeDate, Intl, Math, JSON, Number, String, Object, Array, Set, Map, Symbol, globalThis: null, console };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(region(src) + "\n;this.mediaHint = mediaHint; this.MT_KEY = MT_KEY;", ctx);
  return ctx;
}
const GID = "379363A480715DFC01F13AAF92571111", SK = "agent:main:qqbot:group:" + GID.toLowerCase();
function setParams(p) { fs.writeFileSync(path.join(sd, "params.json"), JSON.stringify(p)); clock += 6000; } // pass 5s cache
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new FakeDate());
function sim(ctx, n, { stepMs = 60_000, comply = 1 } = {}) {
  const st = { replies: 0, lastVoiceReply: null, lastStickerReply: null }; ctx.globalThis[ctx.MT_KEY] = { groups: { [GID]: st } };
  const r = { turns: n, voice: 0, sticker: 0, both: 0, gaps: [], last: null, perDay: {}, quietVoice: 0, hints: new Set() };
  for (let i = 0; i < n; i++) {
    clock += stepMs; const h = ctx.mediaHint(SK); const v = h.includes("这一轮请发一句语音"), s = h.includes("这一轮请带一个表情包");
    r.hints.add(h.replace(/（[^）]*）/g, "")); st.replies++;
    if (v && s) r.both++;
    if (v && Math.random() < comply) { r.voice++; if (r.last != null) r.gaps.push(st.replies - r.last); r.last = st.replies; st.lastVoiceReply = st.replies; const d = day(); if (st.voiceDay !== d) { st.voiceDay = d; st.voiceDayCount = 0; } st.voiceDayCount++; r.perDay[d] = (r.perDay[d] || 0) + 1;
      const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hourCycle: "h23" }).format(new FakeDate()); if (+hm < 8) r.quietVoice++; }
    else if (s) { r.sticker++; st.lastStickerReply = st.replies; }
  }
  return r;
}
const out = []; const log = (...a) => { console.log(...a); out.push(a.join(" ")); };
const P = (voice) => ({ ...baseParams, voice: { ...baseParams.voice, ...voice } });
const ctx = load(fs.readFileSync(PATCHED, "utf8"));
// T1 rates with defaults (prob .12, cooldown 4, limit 20, quiet 00-08) over 20000 turns, 1 turn/min
setParams(P({}));
let r = sim(ctx, 20000);
const maxDay = Math.max(...Object.values(r.perDay));
log(`T1 默认参数 20000 轮: 语音 ${r.voice} (${(r.voice / r.turns * 100).toFixed(2)}%) 表情 ${r.sticker} (${(r.sticker / r.turns * 100).toFixed(2)}%) 同轮两者=${r.both} 最小间隔=${Math.min(...r.gaps)} 单日最多=${maxDay} 静默时段语音=${r.quietVoice}`);
assert.equal(r.both, 0); assert.ok(Math.min(...r.gaps) >= 4 + 1 - 1); assert.ok(maxDay <= 20); assert.equal(r.quietVoice, 0);
// T2 no quiet/limit, rate check vs theory: renewal rate = p/(1+p*(c-1))... measure only, cooldown gap>=c
setParams(P({ quietHours: [], dailyLimit: 0, probability: 0.12, cooldownReplies: 4 }));
r = sim(ctx, 50000, { stepMs: 1000 });
const theo = 0.12 / (1 + 0.12 * 4); // gate gap counts replies before the current one
log(`T2 无静默无上限 50000 轮: 语音率 ${(r.voice / r.turns * 100).toFixed(2)}%（理论 ${(theo * 100).toFixed(2)}%，冷却 4）最小间隔=${Math.min(...r.gaps)} 同轮两者=${r.both}`);
assert.ok(Math.abs(r.voice / r.turns - theo) < 0.01); assert.ok(Math.min(...r.gaps) >= 4); assert.equal(r.both, 0);
// T3 daily limit: prob 1, cooldown 0, limit 5, 2000 turns at 1/min (~1.4 days)
setParams(P({ quietHours: [], dailyLimit: 5, probability: 1, cooldownReplies: 0 }));
r = sim(ctx, 2000);
log(`T3 每日上限 5（概率1/冷却0）: 每天 ${JSON.stringify(r.perDay)}`);
assert.ok(Object.values(r.perDay).every((x) => x === 5));
// T4 quiet hours multiple ranges
setParams(P({ quietHours: [{ start: "00:00", end: "08:00" }, { start: "13:00", end: "14:00" }], dailyLimit: 0, probability: 1, cooldownReplies: 0 }));
clock = Date.parse("2027-01-22T13:30:00+08:00") - 60_000 - 6000; setParams(P({ quietHours: [{ start: "00:00", end: "08:00" }, { start: "13:00", end: "14:00" }], dailyLimit: 0, probability: 1, cooldownReplies: 0 }));
clock = Date.parse("2027-01-22T13:30:00+08:00") - 60_000; r = sim(ctx, 1); const q1 = r.voice;
clock = Date.parse("2027-01-22T03:00:00+08:00") - 60_000; r = sim(ctx, 1); const q2 = r.voice;
clock = Date.parse("2027-01-22T14:00:00+08:00") - 60_000; r = sim(ctx, 1); const q3 = r.voice;
log(`T4 多段静默: 13:30=${q1} 03:00=${q2} 14:00=${q3}（期望 0 0 1）`); assert.deepEqual([q1, q2, q3], [0, 0, 1]);
// T5 per-conversation toggle / defaultEnabled / per-conv probability
clock = Date.parse("2027-01-23T12:00:00+08:00");
setParams(P({ quietHours: [], perConversation: { ["group:" + GID.toLowerCase()]: { enabled: false } }, probability: 1, cooldownReplies: 0 }));
r = sim(ctx, 200); const off = r.voice;
setParams(P({ quietHours: [], perConversation: {}, defaultEnabled: false, probability: 1 })); r = sim(ctx, 200); const defOff = r.voice;
setParams(P({ quietHours: [], dailyLimit: 0, cooldownReplies: 0, perConversation: { ["group:" + GID.toLowerCase()]: { enabled: true, probability: 0.5 } }, probability: 0.01 })); r = sim(ctx, 20000, { stepMs: 1000 }); const pc = r.voice / r.turns;
setParams(P({ enabled: false, quietHours: [], probability: 1 })); r = sim(ctx, 200); const allOff = r.voice;
log(`T5 会话关=${off} 未列出且defaultEnabled=false=${defOff} 会话概率0.5→实测${(pc * 100).toFixed(1)}% 总开关关=${allOff}`);
assert.equal(off, 0); assert.equal(defOff, 0); assert.ok(Math.abs(pc - 0.5) < 0.02); assert.equal(allOff, 0);
// T6 exclusivity off: independent rolls allowed
setParams(P({ quietHours: [], dailyLimit: 0, cooldownReplies: 0, probability: 0.5, exclusiveWithSticker: false }));
const p2 = { ...P({ quietHours: [], dailyLimit: 0, cooldownReplies: 0, probability: 0.5, exclusiveWithSticker: false }), quietHours: null, cooldownReplies: 0, attachProbability: 0.5 }; setParams(p2);
r = sim(ctx, 5000, { stepMs: 1000 }); log(`T6 exclusiveWithSticker=false: 同轮两者被要求=${r.both}（>0 正常，发送端仍只发 1 个媒体）`); assert.ok(r.both > 0);
const p3 = { ...p2, voice: { ...p2.voice, exclusiveWithSticker: true } }; setParams(p3); r = sim(ctx, 5000, { stepMs: 1000 }); log(`T6b exclusive=true 同参数: 同轮两者=${r.both} 语音率=${(r.voice / 5000 * 100).toFixed(1)}% 表情率=${(r.sticker / 5000 * 100).toFixed(1)}%（期望约 50% / 25%）`); assert.equal(r.both, 0);
// T7 wording: no 少用 when voice section exists
setParams(P({})); clock = Date.parse("2027-01-24T12:00:00+08:00"); r = sim(ctx, 300);
const anyShao = [...r.hints].some((h) => h.includes("少用")); log(`T7 有 voice 段时提示里出现“少用”: ${anyShao}；提示样例:`); for (const h of [...r.hints].slice(0, 3)) log("   · " + h);
assert.equal(anyShao, false);
// T8 backward compat: no voice section -> identical to original code given same randomness
const { voice, ...noVoice } = baseParams; setParams(noVoice);
const ctxO = load(fs.readFileSync(ORIG, "utf8")); let diff = 0;
for (let i = 0; i < 2000; i++) { const st = { replies: i, lastVoiceReply: i % 7 ? i - (i % 37) : null, lastStickerReply: i - (i % 5) };
  for (const c of [ctx, ctxO]) c.globalThis[c.MT_KEY] = { groups: { [GID]: { ...st } } };
  const seed = (i * 9301 + 49297) % 233280 / 233280; ctx.Math = ctxO.Math = Math; const mr = Math.random; Math.random = () => seed;
  const a = ctx.mediaHint(SK), b = ctxO.mediaHint(SK); Math.random = mr; if (a !== b) diff++; clock += 1000; }
log(`T8 没有 voice 段时与原版输出不同的轮数: ${diff}/2000`); assert.equal(diff, 0);
// T9 qqbot backstop helpers
const q = fs.readFileSync(QQ, "utf8"); const grab = (name) => { const i = q.indexOf("function " + name + "("); let d = 0, j = q.indexOf("{", i); for (; j < q.length; j++) { if (q[j] === "{") d++; else if (q[j] === "}" && --d === 0) break; } return q.slice(i, j + 1); };
const qsrc = ["var __hsStkC = { at: 0, dir: \"\", params: null, manifest: null, pm: -1, mm: -1, syn: new Map() };", "function __qqMtNorm(s){return String(s);}", grab("__hsStk"), grab("__hsQuiet"), grab("__hsVoice"), grab("__hsVDay"), grab("__hsVoiceBlock")].join("\n");
const qc = { __qqMtFs: fs, __qqMtPath: path, Date: FakeDate, Intl, Math, JSON, Number, String, Object, Array, Map }; vm.createContext(qc); vm.runInContext(qsrc + ";this.B=__hsVoiceBlock;", qc);
const qt = (p, when, g) => { setParams(p); clock = Date.parse(when); qc.__hsStkC.at = 0; qc.__hsStkC.pm = -1; return qc.B(sd, GID, g); };
const res = [
  qt(P({}), "2027-01-25T03:00:00+08:00", {}), qt(P({}), "2027-01-25T12:00:00+08:00", {}),
  qt(P({ dailyLimit: 2 }), "2027-01-25T12:00:00+08:00", { voiceDay: "2027-01-25", voiceDayCount: 2 }),
  qt(P({ dailyLimit: 2 }), "2027-01-26T12:00:00+08:00", { voiceDay: "2027-01-25", voiceDayCount: 2 }),
  qt(P({ enabled: false }), "2027-01-25T12:00:00+08:00", {}), qt(P({ perConversation: {} }), "2027-01-25T12:00:00+08:00", {}), qt(noVoice, "2027-01-25T12:00:00+08:00", {})];
log(`T9 qqbot 发送端兜底: ${JSON.stringify(res)}（期望 quiet-hours,"",daily-limit,"",off,session-off,""）`);
assert.deepEqual(res, ["quiet-hours", "", "daily-limit", "", "off", "session-off", ""]);
log("全部通过");
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results.txt"), out.join("\n") + "\n");
