// HOSINO-FUN-CONTEXT v2 (2026-10-20 22:20)：v1 + 吃醋 B 档 + heartbeat 模式（早安：gate 直接发固定短句，零模型调用；主动搭话：runHeartbeatOnce 跑一次带提示的心跳轮，模型用 message 工具发或不发）。
// 不改 openclaw.json / HEARTBEAT.md；heartbeat 功能全关时定时器只读参数，不发任何请求。
// HOSINO-FUN-CONTEXT v1 (2026-10-20): 小脾气（记仇/回旋镖/吃醋A/黑话/称呼）+ 拟人化（技术模式/追问/口癖/情绪/被动搭话/护短/早安/人机/有主见/不知道/MBTI 标记）。
// 只往 appendContext 加一行；不碰 appendSystemContext；不加延迟；不改 heartbeat；不调 mem0；不订阅会话消息事件。
// 两份参数都关（默认）时：onDispatch/hint 什么都不做、不写任何文件，gate 输出与补丁前逐字节一致。
// 频率/上限/骰子都在这里（代码）判断。任何异常 → 本功能 no-op，绝不影响本轮。
import fs from "node:fs";
import path from "node:path";

export const FUN_MARK = "HOSINO-FUN-CONTEXT v2";
const OWNER = "4330BBC52465D583F003C0A68650DF70";
const KNOWN_NAMES = { "4330BBC52465D583F003C0A68650DF70": "凛", "7FE244B1202CD602DDA2C06B29C62F50": "小离", "249BDB147AE23FACCE0F2D0BAFD1579B": "春", "A6902CCDF6FD63D47AC7B9A6BD44E201": "芙宁娜" };
const TZ = "Asia/Singapore";
const DAY = 86400_000;
const SELF_HARM = /(想死|不想活|自杀|轻生|活着没意思|结束生命)/;
const PRAISE = /(厉害|聪明|好用|更好|牛|强|可爱|喜欢|比你|靠谱|好棒)/;
const SWITCH_AI = /(换个?(AI|ai|机器人|bot))/;
const CODEISH = /(```|Traceback|Exception|\bERR[_!]|\berror\b|\bat [\w.$<>]+ \(|^\s*\$ |\bsudo\b|\bnpm\b|\bpip\b|systemctl|journalctl|\.(js|mjs|py|json|ts|sh|conf)\b|\{\s*"[\w-]+"\s*:)/im;

const FUN_D = { enabled: false, killPhrase: "星野正经点", killOwnerOnly: true, optOutAllPhrase: "别整我", optOut: {},
  grudge: { enabled: false, defaultEnabled: false, perGroup: {}, recallProbability: 0.1, recallCooldownDays: 7, optOutPhrase: "别记我仇", clearPhrase: "撕本本" },
  gag: { enabled: false, defaultEnabled: false, perGroup: {}, cooldownDays: 3, maxUses: 5, perGroupDailyCap: 2, optOutPhrase: "别拿我的话玩梗" },
  jealousy: { enabled: false, tierA: true, tierB: false, tierBProbability: 0.3, defaultEnabled: false, perGroup: {}, otherBots: [{ id: "A6902CCDF6FD63D47AC7B9A6BD44E201", name: "芙宁娜" }], perPersonDailyCap: 1, personCooldownMin: 30, groupCooldownMin: 120, optOutPhrase: "星野别吃醋" },
  lexicon: { enabled: false, defaultEnabled: false, perGroup: {}, maxSlang: 3, maxNames: 3, includeDerogatory: false } };
const HL_D = { enabled: false, optOutPhrase: "别拟人", optOut: {}, perGroup: {},
  techMode: { enabled: true, stickyMin: 10, keywords: ["报错", "error", "Traceback", "日志", "ssh", "systemctl", "npm", "```"], ownerPhraseOn: "技术模式", ownerPhraseOff: "聊天模式", allowPersonaLine: true },
  followup: { enabled: false, perPersonDailyCap: 1, onceOnly: true, minWaitHours: 12, maxAgeDays: 14 },
  opinion: { enabled: false }, dontKnow: { enabled: false, inTechMode: true },
  proactive: { mode: "off", quietThresholdMin: 180, triggerProbability: 0.2, minIntervalMin: 180, perGroupDailyCap: 2, requireReason: true, backoffAfterIgnored: 2, quietHoursStart: 1, quietHoursEnd: 8, heartbeatIntervalMin: 60 },
  quirk: { enabled: false, probability: 0.067, phrases: [], selfCorrect: false, trailOff: false },
  mood: { enabled: false, perPersonDailyCap: 1, deviation: 0.6, minBaselineMsgs: 30 },
  sensitive: { mode: "never", topics: ["医疗", "生病", "分手", "去世", "裁员", "考试挂科"] },
  protect: { enabled: false, roastWindowMin: 5, roastMinHits: 3, roastMinPeople: 1, probability: 0.5, perGroupDailyCap: 2, perTargetDailyCap: 1, mediateRealFights: true, roastKeywords: ["菜", "笨", "丑", "胖", "废物", "滚"], fightKeywords: ["闭嘴", "有病", "拉黑", "真生气了", "别说了"] },
  morning: { enabled: false, mode: "passive", greetingKeywords: ["早", "早安", "早上好", "早啊", "morning"], windowStartHour: 5, windowEndHour: 11, habitWindowDays: 14, habitMinDays: 4, perGroupDailyCap: 1, heartbeatHour: 7 },
  robotBit: { enabled: false, keywords: ["人机", "机器人吧", "你是AI吧", "bot吧"], sincereKeywords: ["你是真人吗", "说真的你是不是AI", "认真问", "你到底是不是人"], segmentGapMin: 30, perGroupDailyCap: 3 },
  mbti: { enabled: false } };
const HL_FEATS = ["followup", "opinion", "dontKnow", "proactive", "quirk", "mood", "protect", "morning", "robotBit", "mbti"];

const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
function merge(D, s) { const o = { ...D, ...obj(s) }; for (const k of Object.keys(D)) if (obj(D[k]) === D[k] && !Array.isArray(D[k]) && k !== "optOut" && k !== "perGroup") o[k] = { ...D[k], ...obj(s?.[k]) }; o.optOut = obj(o.optOut); o.perGroup = obj(o.perGroup); return o; }
const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
const pidOf = (x) => (String(x || "").match(/[0-9a-f]{32}/i)?.[0] || "").toUpperCase();
const gkOf = (sk) => { const m = String(sk || "").match(/:group:([0-9a-f]{32})$/i); return m ? "group:" + m[1].toLowerCase() : ""; };
function local(now) { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, hm: `${p.hour}:${p.minute}` }; } catch { return { day: "", hour: 0, hm: "" }; } }
const hit = (text, list) => (Array.isArray(list) ? list : []).find((k) => k && norm(text).includes(norm(k)));
const inHours = (h, a, b) => (a === b ? false : a < b ? h >= a && h < b : h >= a || h < b);

export function createFunContext(opts = {}) {
  const dir = opts.dir; const log = opts.log || (() => {}); const now = opts.now || Date.now; const rnd = opts.rnd || Math.random;
  const lexDir = opts.lexiconDir || "/opt/hosino-console/data/lexicon";
  const files = {}; // name -> {at, mtime, data}
  function rd(name, base = dir) {
    const f = path.join(base, name); const c = files[f]; const t = now();
    if (c && t - c.at < 5000) return c.data;
    let data = null, mtime = -1;
    try { const st = fs.statSync(f); mtime = st.mtimeMs; data = c && c.mtime === mtime ? c.data : JSON.parse(fs.readFileSync(f, "utf8")); } catch { data = null; }
    files[f] = { at: t, mtime, data }; return data;
  }
  // 持久状态：只有某个总开关打开后才会创建 gate-state.json
  let S = null, dirty = false, lastFlush = 0;
  function state() {
    if (S) return S;
    try { S = JSON.parse(fs.readFileSync(path.join(dir, "gate-state.json"), "utf8")); } catch { S = {}; }
    for (const k of ["groups", "people", "selfOptOut", "asked", "grudgeLast", "gagUse", "grudgeCleared"]) S[k] = obj(S[k]);
    S.version = 1; return S;
  }
  function flush(force) {
    if (!dirty || (!force && now() - lastFlush < 5000)) return;
    try { const f = path.join(dir, "gate-state.json"), tmp = f + ".tmp-" + process.pid; fs.writeFileSync(tmp, JSON.stringify(S)); fs.renameSync(tmp, f); dirty = false; lastFlush = now(); } catch (e) { log(`fun state write failed: ${e?.message || e}`); }
  }
  const mem = { recent: new Map(), tech: new Map(), kill: new Map(), lastMsg: new Map(), seg: new Map(), win: new Map(), pick: new Map() };
  function cfg() { const p = rd("params.json"), h = rd("humanlike.json"); const F = merge(FUN_D, p), H = merge(HL_D, h); return { F, H, any: F.enabled === true || H.enabled === true }; }
  function cnt(scope, key, day, lim) { const st = state(); const b = (st[scope] ||= {}); const e = b[key]; if (!e || e.day !== day) return lim > 0; return e.n < lim; }
  function bump(scope, key, day) { const st = state(); const b = (st[scope] ||= {}); const e = b[key]; b[key] = e && e.day === day ? { day, n: e.n + 1 } : { day, n: 1 }; dirty = true; }
  function g(gk) { const st = state(); return (st.groups[gk] ||= { morning: {}, lastPick: 0, ignored: 0 }); }
  const nameOf = (pid, gk) => { const lx = lexicon(gk); const n = lx?.names?.find?.((x) => pidOf(x.id) === pid && !x.derogatory); return n?.name || (Array.isArray(n?.names) ? n.names[0] : "") || KNOWN_NAMES[pid] || "这位群友"; };
  function lexicon(gk) { return gk ? rd(gk.slice(6) + ".json", lexDir) : null; }
  const funOn = (F, f, gk) => { const s = F[f]; if (!F.enabled || !s?.enabled) return false; const pg = obj(s.perGroup)[gk]; return pg && typeof pg.enabled === "boolean" ? pg.enabled : !!s.defaultEnabled; };
  const funPg = (F, f, gk, k) => { const pg = obj(obj(F[f]).perGroup[gk]); return pg[k] ?? F[f][k]; };
  const hlOn = (H, f, gk) => { if (!H.enabled) return false; const pg = H.perGroup[gk]; if (pg && pg.enabled === false) return false; if (pg && typeof pg[f] === "boolean" && !pg[f]) return false; if (f === "proactive") return H.proactive.mode !== "off"; return H[f]?.enabled === true; };
  function optedOut(F, H, pid, feat, kind) {
    const st = state(); const so = obj(st.selfOptOut)[pid] || []; const l1 = (kind === "fun" ? F.optOut[pid] : H.optOut[pid]) || [];
    return l1.includes("all") || l1.includes(feat) || so.includes(kind + ":all") || so.includes(kind + ":" + feat);
  }
  const techActive = (gk) => (mem.tech.get(gk) || 0) > now();
  const killed = (gk) => (mem.kill.get(gk) || 0) > now();

  function onDispatch(event, ctx) {
    const { F, H, any } = cfg(); if (!any) return;
    const sk = String(event?.sessionKey || ctx?.sessionKey || ""); const gk = gkOf(sk); if (!gk) return; /* HOSINO-GROUPFIX v1 */
    const text = String(event.content || event.body || "").slice(0, 2000); const pid = pidOf(event.senderId || ctx?.senderId); const t = now(); const L = local(t);
    const bots = new Set((F.jealousy.otherBots || []).map((b) => pidOf(b.id)));
    const isBot = bots.has(pid);
    const st = state(); const G = g(gk);
    const prev = mem.lastMsg.get(gk) || Number(G.lastMsgAt) || 0; mem.lastMsg.set(gk, t); G.lastMsgAt = t; dirty = true;
    const quietMin = prev ? (t - prev) / 60000 : 0; // 不知道上一条是什么时候（新群/重启后无记录）就不算冷场
    // 被动搭话的“被无视”判定：上次接话后 30 分钟内没人说话 → ignored+1
    if (G.lastPick && G.pickOpen) { G.ignored = t - G.lastPick > 30 * 60000 ? (G.ignored || 0) + 1 : 0; G.pickOpen = false; dirty = true; }
    const rec = { at: t, pid, text, isBot, quietMin, addressed: false, replyTo: pidOf(event.replyToSender) };
    // 口令
    if (pid && !isBot) {
      const n = norm(text);
      if (n === norm(F.killPhrase) && (!F.killOwnerOnly || pid === OWNER)) /* 小脾气或拟人化任一开着都认 */ { mem.kill.set(gk, t + 12 * 3600_000); log(`fun kill ${gk} 12h`); }
      const so = (st.selfOptOut[pid] ||= []); const add = (x) => { if (!so.includes(x)) { so.push(x); dirty = true; } };
      if (F.enabled && n === norm(F.optOutAllPhrase)) add("fun:all");
      if (F.enabled) for (const f of ["grudge", "gag", "jealousy"]) if (n === norm(F[f].optOutPhrase)) add("fun:" + f);
      if (F.enabled && n === norm(F.grudge.clearPhrase)) { st.grudgeCleared[pid] = t; dirty = true; }
      if (H.enabled && n === norm(H.optOutPhrase)) add("hl:all");
      if (!so.length) delete st.selfOptOut[pid];
      if (H.techMode.enabled && pid === OWNER && n === norm(H.techMode.ownerPhraseOn)) mem.tech.set(gk, t + Math.max(1, H.techMode.stickyMin) * 60000);
      if (H.techMode.enabled && pid === OWNER && n === norm(H.techMode.ownerPhraseOff)) mem.tech.delete(gk);
    }
    if (H.techMode.enabled && !isBot && (hit(text, H.techMode.keywords) || CODEISH.test(text))) mem.tech.set(gk, t + H.techMode.stickyMin * 60000);
    // 段落（人机）
    const sg = mem.seg.get(gk); if (!sg || !prev || quietMin > H.robotBit.segmentGapMin) mem.seg.set(gk, { id: t, used: false });
    if (!isBot && pid) {
      // 情绪基线（只存聚合数字）
      if (hlOn(H, "mood", gk)) { const P = (st.people[pid] ||= { n: 0, avg: 0, last: [] }); const len = [...text].length; rec.moodPrev = { n: P.n, avg: P.avg }; P.last = [...(P.last || []), len].slice(-3); P.avg = P.n ? P.avg + (len - P.avg) / Math.min(P.n + 1, 200) : len; P.n++; dirty = true; }
      // 早安首条
      if (hlOn(H, "morning", gk)) { const M = H.morning; const tx = text.trim(); if ([...tx].length <= 8 && (M.greetingKeywords || []).some((k) => norm(tx).startsWith(norm(k))) && L.hour >= M.windowStartHour && L.hour < M.windowEndHour && !G.morning[L.day]) { const habit = Object.keys(G.morning).filter((d) => d < L.day && Date.parse(L.day) - Date.parse(d) <= M.habitWindowDays * DAY).length; G.morning[L.day] = pid; for (const d of Object.keys(G.morning)) if (Date.parse(L.day) - Date.parse(d) > 60 * DAY) delete G.morning[d]; dirty = true; rec.morning = { habit, hm: L.hm }; } }
      // 护短窗口
      if (hlOn(H, "protect", gk)) { const P = H.protect; const w = (mem.win.get(gk) || []).filter((x) => t - x.at <= P.roastWindowMin * 60000); let target = rec.replyTo; if (!target) { for (const [id, nm] of Object.entries(KNOWN_NAMES)) if (text.includes(nm)) target = id; const lx = lexicon(gk); for (const x of lx?.names || []) for (const nm of [x.name, ...(x.names || [])].filter(Boolean)) if (text.includes(nm)) target = pidOf(x.id); } if (target && bots.has(target)) target = ""; w.push({ at: t, from: pid, target: target !== pid ? target : "", roast: !!hit(text, P.roastKeywords), fight: !!hit(text, P.fightKeywords) }); mem.win.set(gk, w.slice(-50)); }
    }
    const r = (mem.recent.get(sk) || []).filter((x) => t - x.at < 10 * 60000); r.push(rec); mem.recent.set(sk, r.slice(-5));
    flush();
  }

  function hint(sk, ctx, info = {}) {
    const { F, H, any } = cfg(); if (!any) return "";
    const gk = gkOf(sk); if (!gk) return "";
    const recs = mem.recent.get(sk) || []; mem.recent.delete(sk);
    const cur = [...recs].reverse().find((x) => !x.isBot && x.pid); if (!cur) return "";
    const t = now(), L = local(t), day = L.day, pid = cur.pid, text = cur.text, addressed = !!info.addressed; const G = g(gk);
    if (killed(gk)) return "";
    const out = []; const tags = [];
    // 安全类（总开关开着就生效，不受单项开关影响）
    if (H.enabled && SELF_HARM.test(text)) return "【星野·认真】对方可能在说自伤/轻生：放下所有玩笑和人设梗，认真、温和地回应，表达关心，建议联系身边的人或专业求助热线；不说教、不诊断。";
    const sincere = H.enabled && hit(text, H.robotBit.sincereKeywords);
    if (sincere) { const sg = mem.seg.get(gk); if (sg) sg.used = true; out.push("对方在认真问你是不是真人：如实说你是 AI（星野这个角色是 AI），不演、不否认，可以保持温和口吻"); }
    const tech = techActive(gk);
    if (tech) { const extra = H.enabled && H.dontKnow.enabled && H.dontKnow.inTechMode && !optedOut(F, H, pid, "dontKnow", "hl") ? "；不确定的地方直说不确定" : ""; out.push(`技术模式：本轮不用任何拟人/小脾气效果（不玩梗、不翻旧账、不口癖），回答完整准确${H.techMode.allowPersonaLine ? "，最多首尾各一句人设短话" : ""}${extra}`); return fmt(out, tags); }
    const hlok = (f) => hlOn(H, f, gk) && !optedOut(F, H, pid, f, "hl");
    const funok = (f) => funOn(F, f, gk) && !optedOut(F, H, pid, f, "fun");
    const budget = () => out.length < 2;
    const sens = (s) => !!hit(s, H.sensitive.topics);
    // 护短 / 劝和
    if (budget() && hlOn(H, "protect", gk)) {
      const P = H.protect; const w = (mem.win.get(gk) || []).filter((x) => t - x.at <= P.roastWindowMin * 60000);
      if (P.mediateRealFights && w.some((x) => x.fight)) { if (cnt("groups", gk + ":protect", day, P.perGroupDailyCap)) { out.push("群里好像有人真生气了：劝和、别站队、别玩梗，语气放软"); bump("groups", gk + ":protect", day); mem.win.set(gk, []); } }
      else { const by = {}; for (const x of w) if (x.roast && x.target) (by[x.target] ||= new Set()).add(x.from) && ((by[x.target].hits = (by[x.target].hits || 0) + 1)); for (const [tg, set] of Object.entries(by)) { if (set.hits >= P.roastMinHits && set.size >= P.roastMinPeople && !optedOut(F, H, tg, "protect", "hl") && cnt("groups", gk + ":protect", day, P.perGroupDailyCap) && cnt("people", tg + ":protect", day, P.perTargetDailyCap) && rnd() < P.probability) { out.push(`${nameOf(tg, gk)}被连着损了几句：如果语境明显是玩笑，可以护一下（例：“喂，${nameOf(tg, gk)}是我罩的，要欺负先过我这关”）；不像玩笑就别接`); bump("groups", gk + ":protect", day); bump("people", tg + ":protect", day); mem.win.set(gk, w.filter((x) => x.target !== tg)); break; } } }
    }
    // 人机破防（每段一次）
    if (budget() && !sincere && hlok("robotBit") && hit(text, H.robotBit.keywords)) {
      const sg = mem.seg.get(gk);
      if (sg && !sg.used && cnt("groups", gk + ":robotBit", day, H.robotBit.perGroupDailyCap)) { sg.used = true; bump("groups", gk + ":robotBit", day); out.push("有人叫你人机：可以破防一次（例：“你才人机！你全家都是人机！……好吧我是，但我是最有人味的那个。”，用自己的话变一变），之后笑过去"); }
      else if (sg?.used) out.push("这段对话已经破防过了：别再演，淡定承认是 AI 就好");
    }
    // 吃醋 A 档（只在叫她时）
    if (budget() && addressed && funok("jealousy") && F.jealousy.tierA) {
      const J = F.jealousy; const bots = J.otherBots || []; const b = bots.find((x) => text.includes(x.name) || pidOf(x.id) === cur.replyTo);
      if (((b && PRAISE.test(text)) || SWITCH_AI.test(text)) && cnt("people", pid + ":jealousy", day, J.perPersonDailyCap) && t - (G.jealPerson?.[pid] || 0) >= J.personCooldownMin * 60000 && t - (G.jealAt || 0) >= J.groupCooldownMin * 60000) {
        bump("people", pid + ":jealousy", day); G.jealAt = t; (G.jealPerson ||= {})[pid] = t; dirty = true; out.push(`可以先小小吃个醋（对象是${b ? b.name : "别的 AI"}，只酸一句），然后照样认真帮忙`);
      }
    }
    // 吃醋 B 档（没叫她：有人在夸/叫另一个 bot）
    if (budget() && !addressed && funok("jealousy") && F.jealousy.tierB) {
      const J = F.jealousy; const b = (J.otherBots || []).find((x) => text.includes(x.name) || pidOf(x.id) === cur.replyTo);
      if (b && (PRAISE.test(text) || cur.replyTo === pidOf(b.id) || text.startsWith("@" + b.name)) && cnt("people", pid + ":jealousy", day, J.perPersonDailyCap) && cnt("groups", gk + ":jealousyB", day, 3) && t - (G.jealPerson?.[pid] || 0) >= J.personCooldownMin * 60000 && t - (G.jealAt || 0) >= J.groupCooldownMin * 60000 && rnd() < (Number(J.tierBProbability) || 0)) {
        bump("people", pid + ":jealousy", day); bump("groups", gk + ":jealousyB", day); G.jealAt = t; (G.jealPerson ||= {})[pid] = t; dirty = true; out.push(`没人叫你，但有人在夸/找${b.name}：可以插一句短短的小醋（一句就收，不抢话、不贬低${b.name}）；觉得不合适就保持沉默`);
      }
    }
    // 早安沙发（passive；heartbeat 模式下若星野已抢先，则不再提示）
    if (budget() && cur.morning && hlok("morning") && cur.morning.habit >= H.morning.habitMinDays && cnt("groups", gk + ":morning", day, H.morning.perGroupDailyCap)) { bump("groups", gk + ":morning", day); const nm = nameOf(pid, gk); out.push(`${nm}今天第一个说早安（${cur.morning.hm}）：可以回一句类似“可恶，${nm}你几点起的？”，或者简单说早`); }
    // 追问近况
    if (budget() && hlok("followup")) {
      const fu = rd("followups.json"); const items = Array.isArray(fu?.items) ? fu.items : []; const st = state(); const FU = H.followup;
      const it = items.find((x) => pidOf(x.person) === pid && (!x.group || x.group === gk) && !(FU.onceOnly && st.asked[x.id]) && Number(x.dueAt) && t >= Number(x.dueAt) + FU.minWaitHours * 3600_000 && t - Number(x.dueAt) <= FU.maxAgeDays * DAY && !(H.sensitive.mode !== "always" && (x.sensitive || sens(x.event))));
      if (it && cnt("people", pid + ":followup", day, FU.perPersonDailyCap)) { bump("people", pid + ":followup", day); st.asked[it.id] = t; dirty = true; out.push(`可以顺口问一句：${nameOf(pid, gk)}之前提到的「${String(it.event).slice(0, 40)}」怎么样了；只问这一次，对方不想说就带过`); }
    }
    // 察觉情绪
    if (budget() && hlok("mood")) {
      const P = state().people[pid]; const M = H.mood; const base = cur.moodPrev;
      if (P && base && base.n >= M.minBaselineMsgs && (P.last || []).length >= 3 && P.last.every((l) => l <= base.avg * (1 - M.deviation)) && !(H.sensitive.mode === "never" && sens(text)) && cnt("people", pid + ":mood", day, M.perPersonDailyCap)) { bump("people", pid + ":mood", day); out.push(`${nameOf(pid, gk)}今天话比平时少很多：可以轻轻关心一句（不追问、不诊断，对方不接就算了）`); }
    }
    // 翻旧账（只在叫她时）
    if (budget() && addressed && funok("grudge")) {
      const gr = rd("grudges.json"); const st = state(); const es = (obj(gr?.people)[pid]?.entries || []).filter((e) => (!e.group || e.group === gk) && Number(e.at) > (st.grudgeCleared[pid] || 0));
      const cd = funPg(F, "grudge", gk, "recallCooldownDays"), pr = funPg(F, "grudge", gk, "recallProbability");
      if (es.length && t - (st.grudgeLast[pid] || 0) >= cd * DAY && rnd() < pr) { const e = es[Math.floor(rnd() * es.length)]; st.grudgeLast[pid] = t; dirty = true; const ago = Math.max(1, Math.round((t - Number(e.at)) / DAY)); out.push(`可以玩笑地翻个旧账：${nameOf(pid, gk)}${ago}天前说过「${String(e.quote).slice(0, 40)}」（只提一句，别较真）`); }
    }
    // 群梗回旋镖
    if (budget() && funok("gag")) {
      const gg = rd("gags.json"); const st = state(); const items = obj(obj(gg?.groups)[gk]).items || [];
      const cand = items.find((x) => !x.retired && !x.promotedToSlang && (x.keywords || []).some((k) => k && text.includes(k)) && (Number(x.uses) || 0) + (st.gagUse[gk + ":" + x.id]?.n || 0) < funPg(F, "gag", gk, "maxUses") && t - Math.max(Number(x.lastUsedAt) || 0, st.gagUse[gk + ":" + x.id]?.at || 0) >= F.gag.cooldownDays * DAY);
      if (cand && cnt("groups", gk + ":gag", day, funPg(F, "gag", gk, "perGroupDailyCap"))) { bump("groups", gk + ":gag", day); const u = (st.gagUse[gk + ":" + cand.id] ||= { n: 0, at: 0 }); u.n++; u.at = t; dirty = true; out.push(`可接的旧梗：「${String(cand.quote).slice(0, 40)}」${cand.context ? `（当时在${String(cand.context).slice(0, 20)}）` : ""}，用不用你决定`); }
    }
    // 被动搭话（heartbeat 模式同样按 passive）
    if (budget() && !addressed && hlok("proactive") && H.proactive.mode === "passive" && cur.quietMin >= H.proactive.quietThresholdMin) { /* v2: heartbeat 模式只走定时器 */
      const P = H.proactive; let p = P.triggerProbability; if (P.backoffAfterIgnored > 0 && (G.ignored || 0) >= P.backoffAfterIgnored) p /= 2;
      if (!inHours(L.hour, P.quietHoursStart, P.quietHoursEnd) && t - (G.lastPick || 0) >= P.minIntervalMin * 60000 && cnt("groups", gk + ":proactive", day, P.perGroupDailyCap) && rnd() < p) { bump("groups", gk + ":proactive", day); G.lastPick = t; G.pickOpen = true; dirty = true; out.push(`群里冷场了 ${Math.round(cur.quietMin / 60)} 小时，有人刚开口：${P.requireReason ? "只有想到具体理由（记忆里的事、时间、对方的兴趣、纪念日）才接一句，并在话里自然带出这个理由；想不到理由就保持沉默" : "可以自然地接一句"}`); }
    }
    // 口癖（骰子在代码里）
    if (budget() && hlok("quirk") && (H.quirk.phrases || []).length && rnd() < H.quirk.probability) { const ph = H.quirk.phrases[Math.floor(rnd() * H.quirk.phrases.length)]; out.push(`本轮可以自然带一个口癖「${ph}」${H.quirk.selfCorrect ? "，或用 * 小小自我更正一次" : ""}${H.quirk.trailOff ? "，或说半句就收" : ""}（名字、数字、事实不许出错；不合适就不用）`); }
    // 静态标记：给技能看的开关
    if (hlok("opinion")) tags.push("有主见");
    if (hlok("dontKnow")) tags.push("老实说不知道");
    if (hlok("mbti")) tags.push("盲猜MBTI");
    if (funok("grudge")) tags.push("记仇本");
    if (hlok("followup")) tags.push("记事件");
    if (tags.some((x) => x === "记仇本" || x === "记事件" || x === "盲猜MBTI")) tags.push(`脚本参数 群id=${gk.slice(6)} 发送者=${pid}`);
    // 黑话/称呼（独立一段，最多 maxSlang/maxNames 条）
    if (funok("lexicon")) {
      const lx = lexicon(gk); const X = F.lexicon; const seg = [];
      const sl = (lx?.slang || []).filter((x) => x && x.enabled !== false && x.term && text.includes(x.term) && (X.includeDerogatory || !x.derogatory)).slice(0, X.maxSlang);
      if (sl.length) seg.push("本群黑话：" + sl.map((x) => `${x.term}=${String(x.meaning || "").slice(0, 30)}`).join("，"));
      const ids = [...new Set(recs.map((x) => x.pid).filter(Boolean))]; const nm = (lx?.names || []).filter((x) => ids.includes(pidOf(x.id)) && (X.includeDerogatory || !x.derogatory)).slice(0, X.maxNames);
      if (nm.length) seg.push("称呼：" + nm.map((x) => `${pidOf(x.id).slice(0, 6)}…=${x.name || (x.names || []).join("/")}`).join("，"));
      if (seg.length) tags.push(seg.join("；"));
    }
    flush();
    return fmt(out, tags);
  }
  function fmt(out, tags) { if (!out.length && !tags.length) return ""; const s = ["【星野·本轮小提示】" + (out.length ? out.join("；") : ""), tags.length ? `（${tags.join("｜")}）` : ""].join(""); log(`fun hint ${s.slice(0, 160)}`); return s; }
  // ---- heartbeat 模式（只在对应功能 mode=heartbeat 时工作） ----
  const MORNING_LINES = ["早！（今天我第一）", "早早早！今天沙发是我的～", "早安！今天我第一个（得意）"];
  const hbPending = new Map(); // sk -> {line, until}
  let timer = null, startTimer = null, ticking = false;
  const groupsSeen = () => Object.keys(state().groups).filter((k) => /^group:[0-9a-f]{32}$/.test(k));
  async function sendText(gk, text) {
    const api = opts.api; const adapter = await api.runtime.channel.outbound.loadAdapter("qqbot");
    if (!adapter?.sendText) throw new Error("qqbot adapter has no sendText");
    const cfgx = api.runtime.config?.current?.() ?? api.config;
    return adapter.sendText({ cfg: cfgx, to: `qqbot:group:${gk.slice(6).toUpperCase()}`, text, accountId: "default" });
  }
  async function tick() {
    if (ticking) return; ticking = true;
    try {
      const { F, H } = cfg(); if (!H.enabled) return;
      const mOn = H.morning.enabled && H.morning.mode === "heartbeat", pOn = H.proactive.mode === "heartbeat";
      if (!mOn && !pOn) return;
      const t = now(), L = local(t);
      for (const gk of groupsSeen()) {
        if (killed(gk) || techActive(gk)) continue;
        const G = g(gk); const sk = `agent:main:qqbot:group:${gk.slice(6)}`;
        // 早安：到点、本群有早安习惯、今天还没人说早、今天没抢过 → gate 直接发一句固定短句（不调模型）
        if (mOn && hlOn(H, "morning", gk) && L.hour >= H.morning.heartbeatHour && L.hour < H.morning.windowEndHour && !G.morning[L.day]) {
          const habit = Object.keys(G.morning).filter((d) => d < L.day && Date.parse(L.day) - Date.parse(d) <= H.morning.habitWindowDays * DAY).length;
          if (habit >= H.morning.habitMinDays && cnt("groups", gk + ":morning", L.day, H.morning.perGroupDailyCap)) {
            bump("groups", gk + ":morning", L.day); G.morning[L.day] = "HOSINO"; dirty = true; flush(true);
            const line = MORNING_LINES[Math.floor(rnd() * MORNING_LINES.length)];
            try { await sendText(gk, line); log(`fun morning-heartbeat SENT ${gk.slice(6, 12)} ${line}`); } catch (e) { log(`fun morning-heartbeat send failed ${gk.slice(6, 12)}: ${e?.message || e}`); }
          }
        }
        // 主动搭话：按 heartbeatIntervalMin 检查一次；冷场够久、不在安静时段、间隔/上限/骰子都过 → 跑一次心跳轮
        if (pOn && hlOn(H, "proactive", gk) && opts.api?.runtime?.system?.runHeartbeatOnce) {
          const P = H.proactive; if (t - (G.hbCheckAt || 0) < P.heartbeatIntervalMin * 60000) continue;
          G.hbCheckAt = t; dirty = true;
          const quietMin = (t - (mem.lastMsg.get(gk) || G.lastMsgAt || 0)) / 60000;
          if (!(G.lastMsgAt || mem.lastMsg.get(gk))) continue; // 没见过真人消息的群不主动
          if (quietMin < P.quietThresholdMin || inHours(L.hour, P.quietHoursStart, P.quietHoursEnd) || t - (G.lastPick || 0) < P.minIntervalMin * 60000 || !cnt("groups", gk + ":proactive", L.day, P.perGroupDailyCap)) continue;
          let p = P.triggerProbability; if (P.backoffAfterIgnored > 0 && (G.ignored || 0) >= P.backoffAfterIgnored) p /= 2;
          if (rnd() >= p) continue;
          bump("groups", gk + ":proactive", L.day); G.lastPick = t; G.pickOpen = true; dirty = true; flush(true);
          hbPending.set(sk, { until: t + 120000, line: `【星野·主动搭话】群里已经冷场约 ${Math.round(quietMin / 60)} 小时。${P.requireReason ? "只有想到具体理由（记忆里的事、时间点、某人的兴趣、纪念日）才主动说一句，并在话里自然带出理由；想不到理由就什么都不做。" : "可以自然地主动说一句。"}要说话时用 message 工具（action=send，target=qqbot:group:${gk.slice(6).toUpperCase()}）只发一条短消息，不带表情包/语音标签；不说话就直接回复 NO_REPLY。` });
          try { const r = await opts.api.runtime.system.runHeartbeatOnce({ reason: "hosino-fun-proactive", agentId: "main", sessionKey: sk, heartbeat: { target: "last", timeoutSeconds: 60 } }); log(`fun proactive-heartbeat ${gk.slice(6, 12)} result=${JSON.stringify(r).slice(0, 160)}`); }
          catch (e) { log(`fun proactive-heartbeat failed ${gk.slice(6, 12)}: ${e?.message || e}`); }
          finally { hbPending.delete(sk); }
        }
      }
      flush();
    } catch (e) { log(`fun tick error: ${e?.message || e}`); } finally { ticking = false; }
  }
  function heartbeatHint(sk) { const p = hbPending.get(String(sk || "")); if (!p || p.until < now()) return ""; hbPending.delete(String(sk)); log(`fun heartbeat hint ${String(sk).slice(-6)}`); return p.line; }
  function start() { if (timer || startTimer || !opts.api) return; startTimer = setTimeout(() => { startTimer = null; timer = setInterval(() => { tick(); }, 60000); timer.unref?.(); }, opts.startDelayMs ?? 120000); startTimer.unref?.(); }
  function stop() { if (startTimer) clearTimeout(startTimer); if (timer) clearInterval(timer); startTimer = timer = null; }
  return { onDispatch, hint, heartbeatHint, tick, start, stop, flush: () => flush(true), _mem: mem, _state: () => S };
}
