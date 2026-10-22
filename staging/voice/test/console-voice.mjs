import fs from "fs"; import vm from "vm"; import path from "path"; import os from "os"; import assert from "assert";
const s = fs.readFileSync(process.argv[2], "utf8");
const blk = s.slice(s.indexOf("// ---------- v2.11"), s.indexOf("const STK_PARAM_KEYS"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-")); fs.mkdirSync(tmp + "/qqbot"); fs.mkdirSync(tmp + "/workspace");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
fs.writeFileSync(tmp + "/qqbot/media-tag-state.json", JSON.stringify({ groups: { "379363A480715DFC01F13AAF92571111": { replies: 50, lastVoiceReply: 45, voiceDay: day, voiceDayCount: 3, lastVoiceAt: 1 } } }));
const ctx = { fs, path, Intl, JSON, Number, Object, Array, String, Date, httpErr: (c, m) => Object.assign(new Error(m), { status: c }), isHM: (x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x || "")), WORKSPACE: tmp + "/workspace" };
vm.createContext(ctx); vm.runInContext(blk + ";this.voiceMerge=voiceMerge;this.voiceToday=voiceToday;", ctx);
const ok = [], bad = [];
const m1 = ctx.voiceMerge(undefined, { probability: 0.2, quietHours: [{ start: "23:00", end: "07:30" }], perConversation: { "group:379363a480715dfc01f13aaf92571111": { enabled: true, probability: 0.3 } } });
assert.equal(m1.probability, 0.2); assert.equal(m1.maxChars, 40); assert.equal(m1.perConversation["group:379363a480715dfc01f13aaf92571111"].probability, 0.3); ok.push("合并+默认值");
const m2 = ctx.voiceMerge(m1, { perConversation: { "group:379363a480715dfc01f13aaf92571111": null }, quietHours: null }); assert.deepEqual(Object.keys(m2.perConversation), []); assert.deepEqual(m2.quietHours, []); ok.push("null 删除会话/清空静默");
assert.equal(ctx.voiceMerge(m1, null), null); ok.push("voice:null 删除整段");
for (const b of [{ probability: 2 }, { maxChars: 0 }, { dailyLimit: 1.5 }, { quietHours: [{ start: "25:00", end: "01:00" }] }, { perConversation: { "c2c:abc": { enabled: true } } }, { foo: 1 }, { tz: "Mars/Base" }, { enabled: "yes" }])
  { try { ctx.voiceMerge(m1, b); bad.push("未拦截 " + JSON.stringify(b)); } catch (e) { assert.equal(e.status, 400); } }
assert.equal(bad.length, 0); ok.push("8 种非法输入均 400");
const vt = ctx.voiceToday({ voice: m1 }); assert.equal(vt.perConversation["group:379363a480715dfc01f13aaf92571111"].count, 3); assert.equal(vt.perConversation["group:379363a480715dfc01f13aaf92571111"].repliesSinceVoice, 5);
assert.deepEqual(ctx.voiceToday({}), { configured: false }); ok.push("voiceToday 读计数");
console.log("console v2.11 voice: " + ok.join("；") + " —— 全部通过");
