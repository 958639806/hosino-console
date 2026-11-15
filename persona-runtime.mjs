// HOSINO-PERSONA-RUNTIME v1 (2026-11-10)：拟人化「到底有没有在跑」的只读证据。
// 只读：网关日志 /tmp/openclaw/openclaw-YYYY-MM-DD.log 里 [qq-group-followup-gate] fun … 行、workspace/fun/*.json、
// 两个网关插件源码（只做字符串探测，判断已知的卡点还在不在）。唯一写的是控制台自己的 data/persona-runtime.json（累计计数，
// 因为网关日志只留两天）。不调网关 RPC、不发消息、不改 ~/.openclaw。
import fs from "node:fs";
import path from "node:path";

const TAG = "[qq-group-followup-gate] fun";
const NEEDLE = Buffer.from(TAG);
const PC_TAG = "[qq-group-followup-gate] p"; const PC_NEEDLE = Buffer.from(PC_TAG); // HOSINO-PRIVATE-COMPANION v1：私聊行（"pc …" 和 "private-companion …"）
const DAY = 864e5;
const sgDay = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
export const sgText = ms => (ms ? new Date(ms + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") + "（新加坡时间）" : null);

// 提示句 → 功能（句子都是 fun-context.mjs 里写死的，日志里只记前 160 字）
const HINT_RULES = [
  ["safety", /【星野·认真】/], ["sincere", /认真问你是不是真人/], ["techMode", /技术模式：本轮/],
  ["mediate", /真生气了：劝和/], ["protect", /被连着损了几句/], ["robotBit", /叫你人机：可以破防|已经破防过了/],
  ["jealousy", /吃个醋|小醋/], ["morning", /第一个说早安/], ["followup", /可以顺口问一句/], ["mood", /话比平时少很多/],
  ["grudge", /翻个旧账/], ["gag", /可接的旧梗/], ["proactive", /冷场了 \d+ 小时，有人刚开口/], ["quirk", /口癖「/],
  ["opinion", /有主见：/], ["dontKnow", /拿不准就直说/],
];
export function classifyPc(msg) {
  const m = String(msg || ""); if (!m.startsWith(PC_TAG)) return [];
  const r = m.slice(PC_TAG.length - 1);
  if (r.startsWith("private-companion load failed")) return ["c2c.loadFailed"];
  if (!r.startsWith("pc ")) return [];
  const x = r.slice(3);
  if (x.startsWith("merge ")) return ["c2c.merge"];
  if (x.startsWith("closing silent")) return ["c2c.closing"];
  if (x.startsWith("hint error")) return ["c2c.error"];
  if (x.startsWith("hint ")) { const o = ["c2c.hint"]; if (/私聊·收尾/.test(x)) o.push("c2c.closingHint"); if (/私聊·接上话/.test(x)) o.push("c2c.continuity"); if (/可以顺口问一句/.test(x)) o.push("c2c.followup"); return o; }
  if (x.startsWith("proactive SENT")) return ["c2c.proactive.sent"];
  if (x.startsWith("proactive circuit open")) return ["c2c.proactive.circuit"];
  if (x.startsWith("proactive send failed") || x.startsWith("proactive-heartbeat failed")) return ["c2c.proactive.failed"];
  if (x.startsWith("proactive nothing sent")) return ["c2c.proactive.skipped"];
  if (x.startsWith("tick error")) return ["c2c.error"];
  return [];
}
export function classify(msg) {
  const m = String(msg || ""); if (m.startsWith(PC_TAG) && !m.startsWith(TAG)) return classifyPc(m); if (!m.startsWith(TAG)) return [];
  const r = m.slice(TAG.length).trimStart();
  if (r.startsWith("hint ")) { const out = HINT_RULES.filter(([, re]) => re.test(r)).map(([k]) => "hint." + k); return out.length ? ["hint", ...out] : ["hint"]; }
  if (r.startsWith("heartbeat hint")) return ["proactive.hb.hinted"];
  if (r.startsWith("proactive-heartbeat failed")) return ["proactive.hb.failed"];
  if (r.startsWith("proactive-heartbeat")) { const st = /"status":"([a-z-]+)"/.exec(r)?.[1]; return [st === "ran" ? "proactive.hb.ran" : st === "skipped" ? "proactive.hb.skipped" : "proactive.hb.failed"]; }
  if (r.startsWith("morning-heartbeat SENT")) return ["morning.hb.sent"];
  if (r.startsWith("morning-heartbeat send failed")) return ["morning.hb.failed"];
  if (r.startsWith("cap refunded")) return ["refunded"];
  if (r.startsWith("kill ")) return ["kill"];
  if (r.startsWith("-context load failed") || r.startsWith("context load failed")) return ["loadFailed"];
  if (/(dispatch|hint|tick|heartbeat hint) error/.test(r)) return ["error"];
  return [];
}
const lineTime = line => { const t = /"time": *"([^"]+)"/.exec(line)?.[1] || /"date": *"([^"]+)"/.exec(line)?.[1]; const at = t ? Date.parse(t) : NaN; return Number.isFinite(at) ? at : null; };
const lineMsg = line => { try { const j = JSON.parse(line); return String(j.message ?? j["1"] ?? ""); } catch { const m = /"message": *"((?:[^"\\]|\\.)*)"/.exec(line); try { return m ? JSON.parse(`"${m[1]}"`) : ""; } catch { return ""; } } };

/* HOSINO-PERSONA-FIX3 v1（控制台说明）：和网关 fun-context.mjs isMorningGreeting 一致：≤30 字、早安词在前 4 个字内（跳过开头的 @ 和标点，「早点睡/太早/早餐」不算）、在 windowStartHour–windowEndHour 点（新加坡时间）内。 */
export function morningWindow(m) { /* HOSINO-MORNING-STATUS v1：抽出来给 morningStatus 共用 */
  const hr = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  let ws = hr(m?.windowStartHour, 0, 23, 5), we = hr(m?.windowEndHour, 1, 24, 11); if (ws >= we) { ws = 5; we = 11; }
  return [ws, we];
}
export function morningRuleText(m) {
  const [ws, we] = morningWindow(m);
  return `30 字以内、早安词出现在前 4 个字里（会跳过开头的 @ 和标点，「早点睡」「太早了」「早餐」这类不算）、在 ${ws}–${we} 点（新加坡时间）之间`;
}
/* HOSINO-MORNING-STATUS v1：抢早安的真实状态（纯函数，便于测试）。算法和网关 fun-context.mjs 一致：
   habit = gate-state.json 里该群 morning 记录中「今天以前、且距今天不超过 habitWindowDays 天」的天数；星野自己抢到的那天（值为 HOSINO）也算。 */
export function morningStatus({ h, groups, gate, names = {}, today }) {
  const M = h?.morning || {};
  const intOr = (v, lo, hi, d) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  const minD = intOr(M.habitMinDays, 0, 60, 4), win = intOr(M.habitWindowDays, 3, 60, 14); /* HOSINO-MORNING-MIN0 v1：0 是合法值，不能再用 || 4 */
  const nm = (gk) => { const id = gk.slice(6); const n = names[id] || names[id.toLowerCase()]; return n ? String(n) : "群" + id.slice(0, 6); };
  const habit = (groups || []).map(([gk, g]) => { const ds = Object.keys(g?.morning || {}).filter((d) => d < today && Date.parse(today) - Date.parse(d) <= win * 864e5); return { group: gk, name: nm(gk), days: ds.length, lastDay: ds.sort().pop() || null }; });
  const list = habit.map((x) => minD === 0 ? `${x.name} 不需攒天数` : `${x.name} ${Math.min(x.days, minD)}/${minD} 天`).join("、") || "还没有群";
  const mode = M.mode === "heartbeat" ? `每天 ${Number.isInteger(M.heartbeatHour) ? M.heartbeatHour : 7} 点起抢先道早` : "有人先说早安时接一句";
  const notes = minD === 0 ? [`不需要先攒早安天数，${mode}`] : [`各群最近 ${win} 天记到的早安天数：${list}（够 ${minD} 天才会${mode}）`];
  if (gate && gate.morningRuleNew === false) return { code: "notWorking", label: "🔴 没生效", habit, notes, blockers: [`网关里的早安记录规则还是旧版（字数卡得太死、必须以早安开头），群里的早安基本记不上，攒不够天数就永远不会抢`] };
  if (habit.some((x) => x.days >= minD)) return { code: null, label: null, habit, notes, blockers: [] };
  if (!habit.length || habit.every((x) => x.days === 0)) return { code: "notWorking", label: "🔴 没生效", habit, notes, blockers: [`最近 ${win} 天${habit.length > 1 ? "所有群" : "群里"}一天都没记到有人在早上 ${morningWindow(M).join("–")} 点（新加坡时间）说早安。记录规则没问题，是群里早上没人说早安，攒不到 ${minD} 天，所以一次都不会抢`] };
  return { code: "collecting", label: `🟡 攒早安记录中：${list}`, habit, notes, blockers: [] };
}
export function makePersonaRuntime({ logDir = "/tmp/openclaw", funDir, pluginsDir, dataFile, aliasesFile, now = Date.now, keepDays = 30, minScanGapMs = 30e3, ownerId = process.env.HOSINO_OWNER_OPENID || "" } = {}) {
  let S = null, scannedAt = 0;
  function load() {
    if (S) return S;
    try { S = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch { S = {}; }
    if (!S || typeof S !== "object") S = {};
    S.version = 1; S.off ||= {}; S.c ||= {}; S.seen ||= {}; return S;
  }
  function save() { try { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); const tmp = dataFile + ".tmp-" + process.pid; fs.writeFileSync(tmp, JSON.stringify(S)); fs.renameSync(tmp, dataFile); } catch { /* 计数只是展示用，写不了就只在内存里 */ } }
  function bump(k, at) {
    const c = (S.c[k] ||= { n: 0, last: null, days: {} }); c.n++; if (at && (!c.last || at > c.last)) c.last = at;
    const d = sgDay(at || now()); c.days[d] = (c.days[d] || 0) + 1;
  }
  function prune() {
    const cut = sgDay(now() - keepDays * DAY);
    for (const c of Object.values(S.c)) for (const d of Object.keys(c.days || {})) if (d < cut) delete c.days[d];
    for (const f of Object.keys(S.off)) if (!fs.existsSync(path.join(logDir, f))) delete S.off[f];
    for (const k of Object.keys(S.seen)) if (k < cut) delete S.seen[k];
  }
  function scan() {
    load(); let changed = false;
    let files = []; try { files = fs.readdirSync(logDir).filter(x => /^openclaw-\d{4}-\d\d-\d\d\.log$/.test(x)).sort(); } catch { files = []; }
    for (const name of files) {
      const f = path.join(logDir, name); let fd;
      try {
        const size = fs.statSync(f).size; let pos = S.off[name] || 0; if (pos > size) pos = 0; if (pos === size) continue;
        fd = fs.openSync(f, "r"); const CH = 8 << 20; let carry = Buffer.alloc(0);
        while (pos < size) {
          const n = Math.min(CH, size - pos), buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, pos); pos += n;
          const all = carry.length ? Buffer.concat([carry, buf]) : buf, lastNl = all.lastIndexOf(10);
          const body = lastNl < 0 ? Buffer.alloc(0) : all.subarray(0, lastNl + 1); carry = lastNl < 0 ? all : all.subarray(lastNl + 1);
          for (const ND of [NEEDLE, PC_NEEDLE]) { let i = 0; while ((i = body.indexOf(ND, i)) >= 0) { /* HOSINO-PRIVATE-COMPANION v1：两种行各扫一遍（"fun " 行不以 "p" 开头，不会重复算） */
            const ls = body.lastIndexOf(10, i) + 1, le = body.indexOf(10, i), line = body.subarray(ls, le < 0 ? body.length : le).toString("utf8"); i = le < 0 ? body.length : le + 1;
            const msg = lineMsg(line), at = lineTime(line), ks = classify(msg); if (!ks.length) continue;
            for (const k of ks) bump(k, at); changed = true;
          } }
        }
        S.off[name] = pos - carry.length; changed = true;
      } catch { /* 读不到就跳过这一份 */ } finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
    }
    prune(); if (changed) { S.updatedAt = now(); save(); }
    scannedAt = now(); return S;
  }
  const rdJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const rdT = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
  // 已知卡点探测：插件源码改了（补丁上线）后自动消失
  function probes() {
    const gate = rdT(path.join(pluginsDir, "qq-group-followup-gate", "fun-context.mjs")) || "";
    const gateIdx = rdT(path.join(pluginsDir, "qq-group-followup-gate", "index.js")) || "";
    const guard = rdT(path.join(pluginsDir, "qq-group-owner-guard", "execution-policy.mjs"));
    return {
      gateInstalled: !!gate && gateIdx.includes("HOSINO-FUN-CONTEXT v"),
      guardKnown: guard != null,
      followupScriptAllowed: guard == null ? null : guard.includes("fun_followup.py"),
      mbtiScriptAllowed: guard == null ? null : guard.includes("fun_mbti.py"),
      tildeScriptPath: gate.includes("python3 ~/.openclaw/workspace/scripts/fun_"),
      mbtiTopicsHardcoded: !gate.includes("HOSINO-MBTI-CFG v1") && gate.includes("不涉及健康、性取向、宗教、政治、家庭、收入"),
      dmCovered: gate.includes("HOSINO-FUN-DM v") && gateIdx.includes("HOSINO-FUN-DM v"),
      dmOnlyFixed: gate.includes("HOSINO-SENSITIVE-DMONLY v"),
      morningRuleNew: gate.includes("export function isMorningGreeting"), /* HOSINO-MORNING-STATUS v1 */
      pcInstalled: gateIdx.includes("HOSINO-PRIVATE-COMPANION v1") && (rdT(path.join(pluginsDir, "qq-group-followup-gate", "private-companion.mjs")) || "").includes("HOSINO-PRIVATE-COMPANION v1"),
    };
  }
  function count(k, days = 7) { const c = S.c[k]; if (!c) return { n7: 0, total: 0, last: null }; const cut = sgDay(now() - (days - 1) * DAY); let n7 = 0; for (const [d, n] of Object.entries(c.days || {})) if (d >= cut) n7 += n; return { n7, total: c.n, last: c.last }; }
  const aliases = () => rdJ(aliasesFile || path.join(path.dirname(dataFile || "."), "aliases.json")) || {}; /* HOSINO-MORNING-STATUS v1：群名 */
  function view(H) {
    if (now() - scannedAt > minScanGapMs) scan(); else load();
    const P = probes(); P.gateSrc = { morningRuleNew: P.morningRuleNew }; const st = rdJ(path.join(funDir, "gate-state.json")) || {}; const fu = rdJ(path.join(funDir, "followups.json")); const mu = rdJ(path.join(funDir, "mbti-usage.json"));
    const h = H || {}; const on = f => h.enabled === true && (f === "proactive" ? h.proactive?.mode && h.proactive.mode !== "off" : f === "sensitive" || f === "techMode" ? true : h[f]?.enabled === true);
    const hint = count("hint"), loadFailed = count("loadFailed");
    const live = { gateInstalled: P.gateInstalled, lastHintAt: hint.last, lastHintText: sgText(hint.last), hints7d: hint.n7, loadFailed: loadFailed.n7 > 0, running: P.gateInstalled && !!hint.last && now() - hint.last < 3 * DAY, scope: P.dmCovered ? "群聊 + 私聊" : "只在群聊（私聊里这些都不生效）", countingSince: S.since || null };
    if (!S.since) { S.since = now(); save(); live.countingSince = S.since; }
    const groups = Object.entries(st.groups || {}).filter(([k]) => /^group:[0-9a-f]{32}$/.test(k));
    const people = Object.entries(st.people || {}).filter(([k]) => /^[0-9A-F]{32}$/.test(k));
    const F = {};
    const mk = (f, fired, extra = {}) => { const enabled = !!on(f); const blockers = (extra.blockers || []).filter(Boolean); const notes = (extra.notes || []).filter(Boolean);
      const status = !P.gateInstalled ? "notInstalled" : h.enabled !== true && f !== "techMode" ? "off" : !enabled ? "off" : blockers.length ? (fired && fired.n7 ? "partial" : "blocked") : fired && fired.last ? "active" : "idle";
      F[f] = { enabled, status, fired: fired ? { n7: fired.n7, total: fired.total, last: fired.last, lastText: sgText(fired.last) } : null, notes, blockers }; };
    const dmNote = P.dmCovered ? "" : "只在群聊里生效，私聊不读这项";
    mk("techMode", count("hint.techMode"), { notes: [dmNote] });
    { const items = Array.isArray(fu?.items) ? fu.items : [];
      mk("followup", count("hint.followup"), { notes: [`待追问 ${items.length} 条`], blockers: [
        P.followupScriptAllowed === false ? "记录脚本 fun_followup.py 不在群成员命令白名单里：群友提到的事记不下来，所以「待追问」一直是空的" : "",
        P.tildeScriptPath ? "提示里给的脚本路径带 ~，白名单按真实路径校验，会被拦" : ""] }); }
    mk("opinion", count("hint.opinion"), { notes: ["每轮常驻规则", dmNote] });
    mk("dontKnow", count("hint.dontKnow"), { notes: ["每轮常驻规则（日志只记前 160 字，计数偏少）", dmNote] });
    { const ran = count("proactive.hb.ran"), hinted = count("proactive.hb.hinted"), failed = count("proactive.hb.failed"), skipped = count("proactive.hb.skipped"), refunded = count("refunded");
      const mode = h.proactive?.mode || "off"; const pas = count("hint.proactive");
      const fired = mode === "heartbeat" ? hinted : pas;
      const ign = groups.map(([, g]) => g.ignored || 0);
      mk("proactive", fired, { notes: [mode === "heartbeat" ? `近 7 天心跳检查跑了 ${ran.n7} 次、带上搭话提示 ${hinted.n7} 次、跳过 ${skipped.n7} 次、失败 ${failed.n7} 次；没真发出去而归还上限 ${refunded.n7} 次` : "", ign.some(x => x > 0) ? `连续没人理：${ign.join(" / ")} 次（到「连续几次没人理」后概率减半）` : "", "主动搭话是模型自己决定说不说；开着「没有理由就不接」时她多半选择不说"] }); }
    { const ph = Array.isArray(h.quirk?.phrases) ? h.quirk.phrases.length : 0; mk("quirk", count("hint.quirk"), { notes: [dmNote], blockers: [on("quirk") && !ph ? "口癖表是空的：开着也不会出现" : ""] }); }
    { const minB = Number(h.mood?.minBaselineMsgs) || 30; const ready = people.filter(([, p]) => (p.n || 0) >= minB).length; mk("mood", count("hint.mood"), { notes: [`已攒够基线的人：${ready} / ${people.length}`, dmNote] }); }
    { const s = h.sensitive || {}; F.sensitive = { enabled: true, status: P.gateInstalled && h.enabled === true ? (s.mode === "dmOnly" && !P.dmOnlyFixed ? "partial" : "active") : "off", fired: null, notes: [`现在：${({ never: "从不", dmOnly: "只在私聊", always: "都可以" })[s.mode] || "从不"}；影响「追问近况」和「察觉情绪」`, Array.isArray(s.topics) && !s.topics.length ? "敏感话题列表是空的：等于不拦任何话题" : ""].filter(Boolean), blockers: [s.mode === "dmOnly" && !P.dmOnlyFixed ? "「只在私聊」现在没意义：拟人化只在群里跑；群里追问会被拦，但察觉情绪不会被拦（两处判断不一致）" : ""].filter(Boolean) }; }
    mk("protect", (() => { const a = count("hint.protect"), b = count("hint.mediate"); return { n7: a.n7 + b.n7, total: a.total + b.total, last: Math.max(a.last || 0, b.last || 0) || null }; })(), { notes: ["要窗口内同一个人被连着损够条数才会出手，平时安静是正常的"] });
    { /* HOSINO-MORNING-STATUS v1 (2026-11-11)：不再笼统写「开着但卡住了」。按网关的算法（habitWindowDays 天内、今天以前）数每个群真记到的早安天数：
         够天数 → 照常 active/idle；有群记到过但不够 → 「攒早安记录中：群A 2/4 天」；一个群都没记到 → 「没生效」并写清原因；记录规则还是旧版 → 「没生效：记录规则太严」。 */
      const ms = morningStatus({ h, groups, gate: P.gateSrc, names: aliases(), today: sgDay(now()) });
      const sent = count("morning.hb.sent"), pas = count("hint.morning"), failed = count("morning.hb.failed");
      mk("morning", { n7: sent.n7 + pas.n7, total: sent.total + pas.total, last: Math.max(sent.last || 0, pas.last || 0) || null }, { notes: [...ms.notes, failed.n7 ? `近 7 天心跳抢早安发送失败 ${failed.n7} 次` : ""], blockers: ms.blockers });
      if (F.morning.enabled && F.morning.status !== "off" && F.morning.status !== "notInstalled" && ms.code) { F.morning.code = ms.code; F.morning.status = ms.label; F.morning.statusText = ms.label; F.morning.habit = ms.habit; } }
    mk("robotBit", count("hint.robotBit"), { notes: ["被认真问是不是真人时一律如实回答（不受开关影响）"] });
    mk("mbti", null, { notes: [mu ? `今天已猜：${Object.values(mu.people || {}).reduce((a, b) => a + b, 0)} 次` : "还没真正猜过（没有用量记录）"], blockers: [
      P.mbtiScriptAllowed === false ? "检查脚本 fun_mbti.py 不在群成员命令白名单里：上限、星座开关、素材门槛都没法生效" : "",
      P.mbtiTopicsHardcoded ? "「绝不涉及的话题」没读你的设置：提示里写死了 7 个话题" : "",
      P.tildeScriptPath ? "提示里给的脚本路径带 ~，白名单按真实路径校验，会被拦" : ""] });
    const so = Object.values(st.selfOptOut || {}).filter(a => Array.isArray(a) && a.some(x => String(x).startsWith("hl:"))).length;
    const top = { optOut: { status: P.gateInstalled ? "active" : "notInstalled", notes: [`自己用口令退出的人：${so}`] }, perGroup: { status: P.gateInstalled ? "active" : "notInstalled" } };
    let c2c = null; try { c2c = c2cView(h, P); } catch { c2c = null; } /* HOSINO-PRIVATE-COMPANION v1 */
    return { live, features: F, top, probes: P, c2c };
  }
  // HOSINO-PRIVATE-COMPANION v1：私聊各项的状态（字段见 FRONTEND-SPEC v1）
  const PC_OWNER = /^[0-9a-f]{32}$/i.test(ownerId) ? ownerId.toLowerCase() : null;
  const PC_FEATS = ["c2cMerge", "c2cClosing", "c2cTyping", "c2cContinuity", "c2cFollowup", "c2cProactive"];
  const PC_WHY = { off: "没开", circuit: "QQ 连续拒发，暂停中", unanswered: "连着没回，已暂停", tech: "技术模式中", console_active: "控制台 1 小时内用过，不打扰", typing: "凛正在连发", quiet_hours: "免打扰时段", never_talked: "还没在私聊里聊过", recent_talk: "最近刚聊过", interval: "离上次主动还不够久", daily_cap: "今天的条数用完了", ran: "跑过一次" };
  const TXT = { active: "在生效", idle: "开着，最近没触发", blocked: "卡住了", off: "没开", pending: "网关补丁没装，设置只保存" };
  function c2cView(h, P) {
    const g = (k) => ({ ...(h[k] || {}) }); const gs = rdJ(path.join(funDir, "gate-state.json")) || {};
    const optedOut = (Array.isArray((h.optOut || {})[PC_OWNER]) && h.optOut[PC_OWNER].includes("all")) || (Array.isArray((gs.selfOptOut || {})[PC_OWNER]) && gs.selfOptOut[PC_OWNER].includes("hl:all"));
    const master = !!PC_OWNER && h.enabled === true && g("c2c").enabled === true && !optedOut;
    const ps = rdJ(path.join(funDir, "c2c-state.json")) || {}; const pro = ps.pro && typeof ps.pro === "object" ? ps.pro : {}; const t = now();
    const PP = { pauseAfterUnanswered: 2, checkEveryMin: 30, ...g("c2cProactive") };
    const day = sgDay(t); const paused = (pro.unanswered || 0) >= PP.pauseAfterUnanswered; const circuitOpen = Number(pro.circuitUntil) > t;
    const cnt = { c2cMerge: count("c2c.merge"), c2cClosing: count("c2c.closing"), c2cContinuity: count("c2c.continuity"), c2cFollowup: count("c2c.followup"), c2cProactive: count("c2c.proactive.sent") };
    const features = {};
    for (const f of PC_FEATS) {
      const on = master && g(f).enabled === true; const c = cnt[f]; let status, detail = "";
      if (!PC_OWNER) { status = "pending"; detail = "未配置 HOSINO_OWNER_OPENID，无法核对私聊对象及退出状态"; } else if (!P.pcInstalled) status = "pending"; else if (!on) status = "off";
      else if (f === "c2cTyping") status = "active";
      else if (f === "c2cProactive" && (paused || circuitOpen)) { status = "blocked"; detail = circuitOpen ? `QQ 连续拒发，${sgText(Number(pro.circuitUntil))}前暂停` : `连着 ${pro.unanswered} 次没回，已暂停`; }
      else if (f === "c2cFollowup" && h.followup?.enabled !== true) { status = "blocked"; detail = "上面的「追问近况」没开，私聊里没有可问的事"; }
      else status = c && c.n7 ? "active" : "idle";
      if (status === "off" && optedOut) detail = "凛在退出名单里（「别拟人」或控制台退出），私聊各项都不跑";
      if (!detail && f === "c2cMerge" && c?.n7) detail = `近 7 天合并了 ${c.n7} 次`;
      if (!detail && f === "c2cClosing" && c?.n7) detail = `近 7 天少回了 ${c.n7} 句收尾`;
      if (!detail && f === "c2cProactive" && on && pro.lastCheck?.why) detail = `上次检查：${PC_WHY[pro.lastCheck.why] || pro.lastCheck.why}`;
      features[f] = { status, text: PC_OWNER ? TXT[status] : "未配置私聊对象", n7d: c ? c.n7 : null, last: c ? sgText(c.last) : null, detail };
    }
    const rs = rdJ(path.join(funDir, "c2c-resume.json")); const resumePending = !!(rs && Number(rs.requestedAt) > (Number(pro.resumedAt) || 0));
    const fails = Array.isArray(pro.fails) ? pro.fails.filter((x) => t - x < 10 * 60e3).length : 0;
    return {
      ownerConfigured: !!PC_OWNER, installed: !!P.pcInstalled, techUntil: Number(ps.techUntil) > t ? sgText(Number(ps.techUntil)) : null, features,
      optedOut: PC_OWNER ? !!optedOut : null,
      proactive: { unanswered: pro.unanswered || 0, paused, resumePending, lastSentAt: sgText(Number(pro.lastSentAt) || 0), todayCount: (pro.days || {})[day] || 0,
        circuit: { open: circuitOpen, until: circuitOpen ? sgText(Number(pro.circuitUntil)) : null, recentFailures: fails },
        nextCheckAt: pro.lastCheck?.at && master && g("c2cProactive").enabled === true ? sgText(Number(pro.lastCheck.at) + PP.checkEveryMin * 60e3) : null },
      errors7d: count("c2c.error").n7 + count("c2c.loadFailed").n7,
    };
  }
  return { scan, view, classify, _state: () => S };
}
