// HOSINO-PRIVATE-COMPANION v1 (2026-11-10)：私聊拟人化（只对__HS_OWNER_NAME__的 QQ 私聊）。
// 思路参考 AstrBot 插件「我会永远陪着你」(menglimi/astrbot_plugin_private_companion，该仓库没有开源许可证)；
// 本文件是重新实现，没有复制其代码。
// - 连发合并：__HS_OWNER_NAME__连发纯文字时等她说完再合成一轮（qqbot 中间件调用 ingress）。
// - 收尾不复读：星野已收尾、__HS_OWNER_NAME__又只回晚安/嗯/好的 → 不调模型。
// - 打字节奏：__HS_OWNER_NAME__一开口就显示“正在输入”（含合并等待期间）；关着时和现在一样，只在开始回复时显示（qqbot SDK 自带）。
// - 群聊转私聊接上话、私聊追问近况：只往 appendContext 加一行。
// - 私聊主动找__HS_OWNER_NAME__：自己的定时器 + runHeartbeatOnce（target=none，只能用 message 工具发），带免打扰、上限、没回就停、QQ 拒发熔断。
// 只读 workspace/fun/humanlike.json、followups.json、c2c-resume.json；只写 workspace/fun/c2c-state.json。
// 不改 openclaw.json；不调 mem0；不订阅会话消息事件；c2c.enabled=false 时除了记录“上一句”外什么都不做。
import fs from "node:fs";
import path from "node:path";

export const PC_MARK = "HOSINO-PRIVATE-COMPANION v1";
export const OWNER = "__HS_OWNER_OPENID__";
export const MAIN_SK = "agent:main:main";
const TZ_OFFSET_H = 8; // Asia/Singapore，无夏令时
const DAY = 86400_000;

export const PC_DEFAULTS = {
  c2c: { enabled: false, respectTechMode: true },
  c2cMerge: { enabled: false, minMs: 1500, maxMs: 4000, totalMs: 8000 },
  c2cClosing: { enabled: false, windowMin: 30, hint: true },
  c2cTyping: { enabled: false },
  c2cContinuity: { enabled: false, lookbackMin: 30, maxLines: 3 },
  c2cFollowup: { enabled: false },
  c2cProactive: { enabled: false, quietThresholdMin: 240, minIntervalMin: 360, dailyCap: 1, quietHoursStart: 0, quietHoursEnd: 9, checkEveryMin: 30, pauseAfterUnanswered: 2, requireReason: true },
};
const TECH_D = { enabled: true, stickyMin: 10, keywords: ["报错", "error", "Traceback", "日志", "ssh", "systemctl", "npm", "```"], ownerPhraseOn: "技术模式", ownerPhraseOff: "聊天模式" };
const CODEISH = /(```|Traceback|Exception|\bERR[_!]|\berror\b|\bat [\w.$<>]+ \(|^\s*\$ |\bsudo\b|\bnpm\b|\bpip\b|systemctl|journalctl|\.(js|mjs|cjs|py|json|ts|sh|conf)\b|\{\s*"[\w-]+"\s*:)/im;
const CIRCUIT_FAILS = 2, CIRCUIT_WINDOW = 10 * 60_000, CIRCUIT_COOLDOWN = 2 * 3600_000;

const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
const isInt = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;

// ---------- 配置 ----------
// 只认合法值；不合法就退回默认（网关侧永远不因为配置坏了而报错）。
const LIMITS = {
  "c2cMerge.minMs": [300, 10000], "c2cMerge.maxMs": [500, 15000], "c2cMerge.totalMs": [1000, 30000],
  "c2cClosing.windowMin": [1, 120], "c2cContinuity.lookbackMin": [5, 180], "c2cContinuity.maxLines": [1, 6],
  "c2cProactive.quietThresholdMin": [60, 4320], "c2cProactive.minIntervalMin": [60, 4320], "c2cProactive.dailyCap": [0, 4],
  "c2cProactive.quietHoursStart": [0, 23], "c2cProactive.quietHoursEnd": [0, 23], "c2cProactive.checkEveryMin": [10, 240],
  "c2cProactive.pauseAfterUnanswered": [1, 10],
};
export function pcConfig(raw) {
  const H = obj(raw); const out = { enabled: H.enabled === true };
  for (const [sec, D] of Object.entries(PC_DEFAULTS)) {
    const s = obj(H[sec]); const o = {};
    for (const [k, dv] of Object.entries(D)) {
      const v = s[k]; const lim = LIMITS[sec + "." + k];
      o[k] = typeof dv === "boolean" ? (typeof v === "boolean" ? v : dv) : lim && isInt(v, lim[0], lim[1]) ? v : dv;
    }
    out[sec] = o;
  }
  const m = out.c2cMerge; if (m.maxMs < m.minMs || m.totalMs < m.maxMs) out.c2cMerge = { ...PC_DEFAULTS.c2cMerge, enabled: m.enabled };
  const p = out.c2cProactive; if (p.quietHoursStart === p.quietHoursEnd) { p.quietHoursStart = PC_DEFAULTS.c2cProactive.quietHoursStart; p.quietHoursEnd = PC_DEFAULTS.c2cProactive.quietHoursEnd; }
  out.techMode = { ...TECH_D, ...obj(H.techMode) };
  out.sensitive = { mode: "never", topics: [], ...obj(H.sensitive) };
  out.followup = { enabled: false, perPersonDailyCap: 1, onceOnly: true, minWaitHours: 12, maxAgeDays: 14, ...obj(H.followup) };
  out.optedOut = (Array.isArray(obj(H.optOut)[OWNER]) && H.optOut[OWNER].includes("all")) || false;
  out.on = (sec) => out.enabled && out.c2c.enabled && !out.optedOut && out[sec]?.enabled === true;
  return out;
}

// ---------- 连发合并：等待时长 ----------
const visible = (t) => Math.max(1, [...String(t || "")].filter((c) => !/\s/.test(c)).length);
export function quietMs(text, m) {
  // 越长越像说完了；句末标点再微调。结果夹在 [minMs, maxMs]。
  const span = Math.max(0, m.maxMs - m.minMs);
  let q = m.maxMs - span * Math.min(1, visible(text) / 50);
  const tail = String(text || "").trimEnd();
  if (/[。！？!?~～）)]$/.test(tail)) q -= 300; else if (/[，,、；;：:…]$|\.\.\.$/.test(tail)) q += 400; else q += 150;
  return Math.round(Math.min(m.maxMs, Math.max(m.minMs, q)));
}

// ---------- 收尾不复读 ----------
// 词表按“整句只由这些词和语气词组成”来判断；任何别的字都会让它不算收尾。
const CLOSE = {
  night: ["晚安", "安安", "好梦", "做个好梦", "梦里见", "睡了", "睡啦", "去睡了", "睡觉了", "睡觉去了", "我睡了", "先睡了", "要睡了", "该睡了", "困了", "早点睡", "早点休息", "好好休息", "休息了", "gn", "goodnight", "night"],
  bye: ["拜拜", "拜", "88", "再见", "回见", "明天见", "下次聊", "回头聊", "先这样", "不聊了", "下线了", "去忙了", "先忙了", "走了", "bye", "byebye", "seeyou"],
  thanks: ["谢谢", "谢啦", "谢了", "多谢", "感谢", "辛苦了", "辛苦啦", "thanks", "thx", "ty"],
  ack: ["嗯", "嗯嗯", "嗯呢", "好", "好的", "好滴", "好嘞", "好哒", "好吧", "行", "行吧", "可以", "收到", "知道了", "明白", "明白了", "了解", "ok", "okk", "okay", "哦", "噢", "喔", "没事", "没事了"],
  love: ["爱你", "么么", "么么哒", "亲亲", "抱抱", "mua"],
  morning: ["早", "早安", "早上好", "morning"],
};
const STRONG = new Set(["night", "bye", "thanks", "love", "morning"]);
const FILL = ["啦", "呀", "啊", "呢", "吧", "哈", "嘛", "咯", "喽", "哒", "嘞", "哟", "了", "的", "我", "你", "也", "那", "那我", "那就", "就", "先", "宝", "宝贝", "亲爱的", "星野", "小星"];
const TOK = Object.entries(CLOSE).flatMap(([k, ws]) => ws.map((w) => [w, k])).sort((a, b) => b[0].length - a[0].length);
const FIL = [...FILL].sort((a, b) => b.length - a.length);
const QUESTIONISH = /[?？]|吗|么$|呢[?？]?$|几点|要不要|好不好|能不能|是不是|有没有|怎么|为什么|为啥|帮我|提醒|记得|告诉我|陪我/;
const compact = (t) => String(t || "").normalize("NFKC").toLowerCase().replace(/\[[^\]]{0,12}\]/g, "").replace(/[\s\p{P}\p{S}]/gu, "");
export function closingKinds(text) {
  const raw = String(text || ""); if (!raw.trim() || raw.length > 40 || QUESTIONISH.test(raw)) return null;
  let s = compact(raw); if (!s) return null;
  const kinds = new Set(); let guard = 0;
  while (s && guard++ < 40) {
    const t = TOK.find(([w]) => s.startsWith(w)); if (t) { kinds.add(t[1]); s = s.slice(t[0].length); continue; }
    const f = FIL.find((w) => s.startsWith(w)); if (f) { s = s.slice(f.length); continue; }
    return null;
  }
  return kinds.size ? [...kinds] : null;
}
export function botClosed(text) {
  const raw = String(text || "").trim(); if (!raw || raw.length > 120) return false;
  const lastSentence = raw.split(/[。！？!?\n]+/).map((x) => x.trim()).filter(Boolean).pop() || "";
  if (QUESTIONISH.test(lastSentence)) return false;
  const tail = compact(lastSentence).slice(-12);
  for (let i = 0; i < tail.length; i++) { const k = closingKinds(tail.slice(i)); if (k && k.some((x) => STRONG.has(x))) return true; }
  return false;
}
// 返回 { silent, reason, botClosed, userClosed }
export function closingDecision({ text, hasMedia, lastBot, lastUserPrev, now, windowMin }) {
  const kinds = closingKinds(text);
  if (hasMedia) return { silent: false, reason: "media" };
  const within = lastBot && now - lastBot.at >= 0 && now - lastBot.at <= windowMin * 60_000;
  const bc = !!(within && botClosed(lastBot.text));
  const uc = !!(within && lastUserPrev && lastUserPrev.at <= lastBot.at && closingKinds(lastUserPrev.text));
  if (!kinds) return { silent: false, reason: "not_closing", botClosed: bc, userClosed: uc };
  if (!lastBot) return { silent: false, reason: "no_bot_reply" };
  if (!within) return { silent: false, reason: "outside_window" };
  if (bc) return { silent: true, reason: "bot_already_closed", botClosed: bc };
  if (uc) return { silent: true, reason: "user_closed_twice", userClosed: uc };
  return { silent: false, reason: "bot_not_closed", botClosed: bc, userClosed: uc, kinds };
}

// ---------- 时间 ----------
const sgParts = (t) => { const d = new Date(t + TZ_OFFSET_H * 3600_000); return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; };
const inHours = (h, a, b) => (a === b ? false : a < b ? h >= a && h < b : h >= a || h < b);

// ---------- 主体 ----------
export function createPrivateCompanion(opts = {}) {
  const dir = opts.dir; const log = opts.log || (() => {}); const now = opts.now || Date.now;
  const setT = opts.setTimeout || setTimeout, clearT = opts.clearTimeout || clearTimeout;
  const files = {};
  function rd(name) {
    const f = path.join(dir, name); const c = files[f]; const t = now();
    if (c && t - c.at < 5000) return c.data;
    let data = null, mtime = -1;
    try { const st = fs.statSync(f); mtime = st.mtimeMs; data = c && c.mtime === mtime ? c.data : JSON.parse(fs.readFileSync(f, "utf8")); } catch { data = null; }
    files[f] = { at: t, mtime, data }; return data;
  }
  // 退出名单：控制台 optOut[__HS_OWNER_NAME__]=["all"] 或__HS_OWNER_NAME__自己说过「别拟人」类口令（gate-state.json selfOptOut 里有 hl:all）→ 私聊各项全关
  const cfg = () => { const C = pcConfig(rd("humanlike.json")); const so = obj(obj(rd("gate-state.json")).selfOptOut)[OWNER]; if (Array.isArray(so) && so.includes("hl:all")) C.optedOut = true; return C; };
  // 持久状态
  let S = null, dirty = false, lastFlush = 0;
  function st() {
    if (S) return S;
    try { S = JSON.parse(fs.readFileSync(path.join(dir, "c2c-state.json"), "utf8")); } catch { S = {}; }
    S = obj(S); S.version = 1; S.pro = obj(S.pro); S.pro.days = obj(S.pro.days); S.pro.fails = Array.isArray(S.pro.fails) ? S.pro.fails : [];
    S.counts = obj(S.counts); return S;
  }
  function flush(force) {
    if (!dirty || (!force && now() - lastFlush < 5000)) return;
    try { const f = path.join(dir, "c2c-state.json"), tmp = f + ".tmp-" + process.pid; fs.writeFileSync(tmp, JSON.stringify(S)); fs.renameSync(tmp, f); dirty = false; lastFlush = now(); } catch (e) { log(`pc state write failed: ${e?.message || e}`); }
  }
  function count(k) { const s = st(); const d = sgParts(now()).day; const c = (s.counts[k] = obj(s.counts[k])); c[d] = (c[d] || 0) + 1; for (const x of Object.keys(c)) if (x < sgParts(now() - 8 * DAY).day) delete c[x]; dirty = true; }
  const mem = { pending: new Map(), techUntil: 0, consoleAt: 0, group: [], hb: null };

  // 技术模式（私聊自己的，沿用 humanlike.techMode 的关键词与分钟数）
  function noteTech(text, C) {
    const T = C.techMode; if (!T.enabled) return; const n = norm(text);
    if (n && n === norm(T.ownerPhraseOff)) { mem.techUntil = 0; if (C.enabled && C.c2c.enabled) { st().techUntil = 0; dirty = true; } log("pc tech off"); return; }
    if ((n && n === norm(T.ownerPhraseOn)) || (Array.isArray(T.keywords) && T.keywords.some((k) => k && n.includes(norm(k)))) || CODEISH.test(String(text || ""))) {
      mem.techUntil = now() + Math.max(1, Number(T.stickyMin) || 10) * 60_000;
    }
    if (C.enabled && C.c2c.enabled && st().techUntil !== mem.techUntil) { S.techUntil = mem.techUntil; dirty = true; } // 只给控制台显示用
  }
  const techActive = (C) => C.c2c.respectTechMode && mem.techUntil > now();

  function recordUser(text, at, C) {
    if (!(C?.enabled && C?.c2c?.enabled) || C.optedOut) return; // 没开就不建状态文件
    const s = st(); s.prevUser = s.lastUser || null; s.lastUser = { at, text: String(text || "").slice(0, 120) };
    if (s.pro.unanswered) log(`pc proactive answered after ${s.pro.unanswered}`);
    s.pro.unanswered = 0; dirty = true; flush();
  }

  // ---- 1) qqbot 中间件入口 ----
  // msg: { key, senderId, text, plain, command }
  // 返回 Promise<{action:"proceed", text?, merged} | {action:"absorbed"} | {action:"silent", reason}>
  function ingress(msg) {
    const at = now();
    let C; try { C = cfg(); } catch { return Promise.resolve({ action: "proceed", merged: 1 }); }
    const owner = String(msg.senderId || "").toUpperCase() === OWNER;
    if (!owner) return Promise.resolve({ action: "proceed", merged: 1 });
    const text = String(msg.text || "");
    const key = String(msg.key || OWNER);
    noteTech(text, C);
    const pend = mem.pending.get(key);
    if (!msg.plain || msg.command || !C.on("c2cMerge")) {
      if (pend) fire(key, "interrupted");
      recordUser(text, at, C);
      if (!msg.plain || msg.command) return Promise.resolve({ action: "proceed", merged: 1 });
      return Promise.resolve(decideClosing(text, false, C, at));
    }
    return new Promise((resolve) => {
      const p = pend || { first: at, entries: [], timer: null };
      p.entries.push({ text, at, resolve });
      if (p.timer) clearT(p.timer);
      const m = C.c2cMerge; const wait = Math.max(0, Math.min(at + quietMs(text, m), p.first + m.totalMs) - at);
      p.timer = setT(() => fire(key, "quiet"), wait); p.timer?.unref?.();
      mem.pending.set(key, p);
    });
  }
  function fire(key, why) {
    const p = mem.pending.get(key); if (!p) return; mem.pending.delete(key); if (p.timer) clearT(p.timer);
    const texts = p.entries.map((e) => e.text.trim()).filter(Boolean);
    const merged = texts.join("\n").slice(-4000);
    const last = p.entries[p.entries.length - 1];
    for (const e of p.entries.slice(0, -1)) e.resolve({ action: "absorbed" });
    let C; try { C = cfg(); } catch { C = null; }
    recordUser(merged, last.at, C);
    if (p.entries.length > 1) { count("merge"); log(`pc merge n=${p.entries.length} waitedMs=${now() - p.first} why=${why}`); }
    const d = C ? decideClosing(merged, false, C, last.at) : { action: "proceed" };
    last.resolve(d.action === "silent" ? d : { action: "proceed", text: p.entries.length > 1 ? merged : undefined, merged: p.entries.length });
  }
  function decideClosing(text, hasMedia, C, at) {
    if (!C.on("c2cClosing")) return { action: "proceed", merged: 1 };
    const s = st();
    const d = closingDecision({ text, hasMedia, lastBot: s.lastBot, lastUserPrev: s.prevUser, now: at, windowMin: C.c2cClosing.windowMin });
    mem.lastClosing = d;
    if (d.silent) { count("closing"); dirty = true; flush(); log(`pc closing silent reason=${d.reason}`); return { action: "silent", reason: d.reason }; }
    return { action: "proceed", merged: 1 };
  }
  // 打字节奏：__HS_OWNER_NAME__这一串的第一条到达时就该显示“正在输入”吗？（同一串后面几条不重复发）
  function typingEarly(senderId, key) {
    try { if (String(senderId || "").toUpperCase() !== OWNER || mem.pending.has(String(key || OWNER))) return false; return cfg().on("c2cTyping"); } catch { return false; }
  }

  // ---- 2) 出站：记住星野上一句（收尾判断、主动结果） ----
  const c2cTo = (to) => (String(to || "").match(/c2c:([0-9a-f]{32})/i)?.[1] || "").toUpperCase();
  function onSent(event) {
    try {
      if (c2cTo(event?.to) !== OWNER) return;
      const C = cfg(); if (!(C.enabled && C.c2c.enabled) && !mem.hb) return;
      const ok = event?.success !== false; const s = st(); const t = now();
      const hb = mem.hb && mem.hb.until > t ? mem.hb : null;
      if (ok && String(event?.content || "").trim()) { s.lastBot = { at: t, text: String(event.content).slice(-120) }; dirty = true; }
      if (hb) {
        if (ok) { if (!hb.sent) { hb.sent = true; const d = sgParts(t).day; s.pro.days[d] = (s.pro.days[d] || 0) + 1; s.pro.lastSentAt = t; s.pro.unanswered = (s.pro.unanswered || 0) + 1; count("proactive"); log(`pc proactive SENT unanswered=${s.pro.unanswered}`); } }
        else { s.pro.fails = [...s.pro.fails.filter((x) => t - x < CIRCUIT_WINDOW), t]; log(`pc proactive send failed ${String(event?.error || "").slice(0, 80)}`); if (s.pro.fails.length >= CIRCUIT_FAILS) { s.pro.circuitUntil = t + CIRCUIT_COOLDOWN; s.pro.fails = []; log("pc proactive circuit open 120min"); } }
        dirty = true;
      }
      flush(true);
    } catch { /* observe only */ }
  }

  // ---- 3) 群聊转私聊：只记__HS_OWNER_NAME__自己的群发言、和紧跟着的星野回复 ----
  function noteGroup(gk, who, text) {
    try {
      const t = now(); const g = mem.group;
      if (who === "owner") g.push({ gk, who, at: t, text: String(text || "").replace(/\s+/g, " ").slice(0, 80) });
      else if (who === "bot") { const lastOwner = [...g].reverse().find((x) => x.gk === gk && x.who === "owner"); if (lastOwner && t - lastOwner.at < 3 * 60_000) g.push({ gk, who, at: t, text: String(text || "").replace(/\s+/g, " ").slice(0, 80) }); }
      while (g.length > 40 || (g[0] && t - g[0].at > 3 * 3600_000)) g.shift();
    } catch { /* optional */ }
  }

  // ---- 4) 每轮提示（只给 QQ 私聊里__HS_OWNER_NAME__的 user 轮） ----
  function hint(sk, ctx) {
    try {
      if (String(sk) !== MAIN_SK) return "";
      const ch = String(ctx?.channelId || ctx?.messageProvider || ctx?.channel || "");
      if (ch !== "qqbot") { mem.consoleAt = now(); return ""; } // 控制台/其它入口：只记一下“最近在用”，不加任何提示
      if (ctx?.trigger && ctx.trigger !== "user") return "";
      const sender = String(ctx?.senderId || ctx?.requesterSenderId || "").toUpperCase();
      if (sender && sender !== OWNER) return "";
      const C = cfg(); if (!(C.enabled && C.c2c.enabled) || C.optedOut) return "";
      const out = []; const t = now(); const tech = techActive(C);
      const d = mem.lastClosing; mem.lastClosing = null;
      if (C.on("c2cClosing") && C.c2cClosing.hint && d && !d.silent && (d.botClosed || d.userClosed)) out.push(d.botClosed ? "【私聊·收尾】你上一句已经道别/道晚安了；__HS_OWNER_NAME__这句如果还只是收尾或应声，就不要再补一条同样的道别，也别另起话题追问，让对话停在这里；有新问题或明显情绪再正常接" : "【私聊·收尾】__HS_OWNER_NAME__上一句已经在收尾；这句如果仍只是收尾，不用为了礼貌再追一句");
      if (!tech && C.on("c2cContinuity")) {
        const L = C.c2cContinuity; const xs = mem.group.filter((x) => t - x.at <= L.lookbackMin * 60_000).slice(-L.maxLines * 2);
        const own = xs.filter((x) => x.who === "owner");
        if (own.length) { const lines = xs.slice(-L.maxLines).map((x) => `${x.who === "owner" ? "__HS_OWNER_NAME__" : "你"}：${x.text}`).join(" / "); const mins = Math.max(1, Math.round((t - own[own.length - 1].at) / 60000)); out.push(`【私聊·接上话】__HS_OWNER_NAME__ ${mins} 分钟前在群里和你聊过（只是她自己的话和你的回复）：${lines}。如果她现在问的是同一件事，保持同样的说法自然接上，不要当第一次听说；别在私聊里转述其他群友`); count("continuity"); }
      }
      if (!tech && C.on("c2cFollowup") && C.followup.enabled) {
        const s = st(); const fu = rd("followups.json"); const items = Array.isArray(fu?.items) ? fu.items : []; const FU = C.followup;
        const gs = rd("gate-state.json"); const asked = obj(gs?.asked); const mine = obj(s.asked);
        const sensOk = (x) => C.sensitive.mode !== "never" || !(x.sensitive || (Array.isArray(C.sensitive.topics) && C.sensitive.topics.some((k) => k && String(x.event || "").includes(k))));
        const day = sgParts(t).day;
        const it = items.find((x) => String(x.person || "").toUpperCase() === OWNER && !(FU.onceOnly && (asked[x.id] || mine[x.id])) && Number(x.dueAt) && t >= Number(x.dueAt) + FU.minWaitHours * 3600_000 && t - Number(x.dueAt) <= FU.maxAgeDays * DAY && sensOk(x));
        if (it && (s.fuDay !== day || (s.fuN || 0) < Math.max(1, FU.perPersonDailyCap))) { s.asked = { ...mine, [it.id]: t }; s.fuN = s.fuDay === day ? (s.fuN || 0) + 1 : 1; s.fuDay = day; dirty = true; flush(true); count("followup"); out.push(`可以顺口问一句：__HS_OWNER_NAME__之前提到的「${String(it.event).slice(0, 40)}」怎么样了；只问这一次，她不想说就带过`); }
      }
      if (out.length) log(`pc hint ${out.map((x) => x.slice(0, 12)).join(" | ")}`);
      return out.join("\n");
    } catch (e) { log(`pc hint error: ${e?.message || e}`); return ""; }
  }

  // ---- 5) 私聊主动 ----
  function proactiveBlock(C, t) {
    const P = C.c2cProactive; const s = st(); const L = sgParts(t);
    if (!C.on("c2cProactive")) return "off";
    if (s.pro.circuitUntil && s.pro.circuitUntil > t) return "circuit";
    applyResume(s);
    if ((s.pro.unanswered || 0) >= P.pauseAfterUnanswered) return "unanswered";
    if (techActive(C)) return "tech";
    if (t - mem.consoleAt < 60 * 60_000) return "console_active";
    if (mem.pending.size) return "typing";
    if (inHours(L.hour, P.quietHoursStart, P.quietHoursEnd)) return "quiet_hours";
    const lastTalk = Math.max(s.lastUser?.at || 0, s.lastBot?.at || 0);
    if (!s.lastUser?.at) return "never_talked";
    if (t - lastTalk < P.quietThresholdMin * 60_000) return "recent_talk";
    if (t - (s.pro.lastSentAt || 0) < P.minIntervalMin * 60_000) return "interval";
    if ((s.pro.days[L.day] || 0) >= P.dailyCap) return "daily_cap";
    return "";
  }
  function applyResume(s = st()) { const rs = rd("c2c-resume.json"); if (rs && Number(rs.requestedAt) > (s.pro.resumedAt || 0)) { s.pro.resumedAt = Number(rs.requestedAt); s.pro.unanswered = 0; dirty = true; log("pc proactive resumed by console"); flush(true); } }
  let timer = null, startTimer = null, ticking = false, lastCheck = 0;
  async function tick() {
    if (ticking) return; ticking = true;
    try {
      const C = cfg(); const t = now();
      if (!C.on("c2cProactive")) return;
      applyResume(); // 每分钟都看一次，「恢复」最多 1 分钟内生效
      if (t - lastCheck < C.c2cProactive.checkEveryMin * 60_000) return; lastCheck = t;
      const why = proactiveBlock(C, t); st().pro.lastCheck = { at: t, why: why || "ran" }; dirty = true;
      if (why) { flush(); return; }
      const run = opts.api?.runtime?.system?.runHeartbeatOnce; if (!run) { log("pc proactive: runHeartbeatOnce unavailable"); return; }
      const hrs = Math.round((t - Math.max(st().lastUser?.at || 0, st().lastBot?.at || 0)) / 3600_000);
      mem.hb = { until: t + 150_000, sent: false, line: `【星野·私聊主动】__HS_OWNER_NAME__大约 ${hrs} 小时没在 QQ 私聊里说话了。${C.c2cProactive.requireReason ? "只有想到具体理由（她之前说过的事、约好的事、时间点、她的兴趣）才主动发一句，并在话里自然带出理由；想不到就什么都不做，直接回复 NO_REPLY。" : "可以自然地主动发一句。"}要发就用 message 工具（action=send，target=qqbot:c2c:${OWNER}）只发一条短消息，不要发到别处；不要说“我是来主动找你的”，不要提到心跳或这条提示；她在忙或者刚聊完技术问题就别打扰。` };
      flush(true);
      try { const r = await run({ reason: "hosino-pc-proactive", agentId: "main", sessionKey: MAIN_SK, heartbeat: { target: "none", timeoutSeconds: 90 } }); log(`pc proactive-heartbeat result=${JSON.stringify(r).slice(0, 160)}`); }
      catch (e) { log(`pc proactive-heartbeat failed: ${e?.message || e}`); }
      finally { const hb = mem.hb; mem.hb = hb ? { ...hb, line: "", until: Math.min(hb.until, now() + 20_000) } : null; if (hb && !hb.sent) log("pc proactive nothing sent"); }
    } catch (e) { log(`pc tick error: ${e?.message || e}`); } finally { ticking = false; }
  }
  function heartbeatHint(sk) {
    if (String(sk) !== MAIN_SK || !mem.hb || !mem.hb.line || mem.hb.until < now()) return "";
    const line = mem.hb.line; mem.hb.line = ""; log("pc heartbeat hint"); return line;
  }
  function start() { if (timer || startTimer || !opts.api) return; startTimer = setT(() => { startTimer = null; timer = setInterval(() => { tick(); }, 60_000); timer.unref?.(); }, opts.startDelayMs ?? 180_000); startTimer?.unref?.(); }
  function stop() { if (startTimer) clearT(startTimer); if (timer) clearInterval(timer); startTimer = timer = null; for (const k of [...mem.pending.keys()]) fire(k, "stop"); flush(true); }
  function status() { const s = st(); return { techUntil: mem.techUntil > now() ? mem.techUntil : null, pro: s.pro, counts: s.counts, pending: mem.pending.size }; }

  return { ingress, typingEarly, onSent, noteGroup, hint, heartbeatHint, tick, start, stop, status, flush: () => flush(true), _mem: mem, _proactiveBlock: (t) => proactiveBlock(cfg(), t ?? now()) };
}
