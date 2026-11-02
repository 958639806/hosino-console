import { api, setUnauthedHandler, notReady, mediaOf } from "./api.js?v=2026.11.3";
import { md } from "./md.js?v=2026.11.3";

// ---------- 小工具 ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (strs, ...vals) => strs.reduce((a, s, i) => a + s + (i < vals.length ? (vals[i]?.__raw ?? esc(vals[i])) : ""), "");
const raw = s => ({ __raw: s });
const bytes = n => { if (n == null || isNaN(n)) return "—"; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i]; };
const dur = s => { if (s == null) return "—"; s = Math.floor(s); const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} 天 ${hh} 小时` : hh ? `${hh} 小时 ${m} 分` : m ? `${m} 分钟` : `${s} 秒`; };
const toMs = t => t == null ? null : typeof t === "number" ? (t < 1e12 ? t * 1000 : t) : Date.parse(t);
const fmtTime = t => { const ms = toMs(t); if (!ms || isNaN(ms)) return ""; const d = new Date(ms), now = new Date(); const p = n => String(n).padStart(2, "0"); const hm = `${p(d.getHours())}:${p(d.getMinutes())}`; if (d.toDateString() === now.toDateString()) return hm; const y = new Date(now - 864e5); if (d.toDateString() === y.toDateString()) return "昨天 " + hm; return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`; };
const ago = t => { const ms = toMs(t); if (!ms) return ""; const s = (Date.now() - ms) / 1000; if (s < 0) return "即将"; if (s < 60) return "刚刚"; if (s < 3600) return Math.floor(s / 60) + " 分钟前"; if (s < 86400) return Math.floor(s / 3600) + " 小时前"; return Math.floor(s / 86400) + " 天前"; };
const until = t => { const ms = toMs(t); if (!ms) return ""; const s = (ms - Date.now()) / 1000; if (s <= 0) return "马上"; if (s < 3600) return Math.ceil(s / 60) + " 分钟后"; if (s < 86400) return Math.round(s / 3600) + " 小时后"; return Math.round(s / 86400) + " 天后"; };
const num = n => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
const pct = (a, b) => b ? Math.max(0, Math.min(100, a / b * 100)) : 0;
const barCls = p => p > 90 ? "bad" : p > 75 ? "warn" : "";
const jsonView = o => h`<pre class="code">${JSON.stringify(o, null, 2)}</pre>`;
const asArr = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => (x && typeof x === "object" ? { id: k, ...x } : { id: k, value: x })) : [];
function findKey(o, re, depth = 0) { if (!o || typeof o !== "object" || depth > 4) return null; for (const [k, v] of Object.entries(o)) { if (re.test(k)) return v; const r = findKey(v, re, depth + 1); if (r != null) return r; } return null; }
const pick = (o, ...ks) => { for (const k of ks) if (o?.[k] != null) return o[k]; };
let toastT; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
const pill = (txt, cls = "", live) => h`<span class="pill ${cls}"><span class="dot ${live ? "live" : ""}"></span>${txt}</span>`;
const stateOf = o => { if (o == null) return ["未知", ""]; if (typeof o === "boolean") return o ? ["正常", "ok"] : ["未连接", "bad"]; const c = pick(o, "connected", "ok", "running", "healthy", "enabled"); const st = String(pick(o, "status", "state") || "").toLowerCase(); if (o.lastError || o.error || /error|fail|down/.test(st)) return ["异常", "bad"]; if (c === true || /ok|run|connect|ready|online|loaded|active/.test(st)) return ["在线", "ok"]; if (c === false || /stop|off|disconn|idle/.test(st)) return ["离线", "warn"]; return [st || "未知", ""]; };

// ---------- 图标 ----------
const I = {
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.6 2 3 0-3 0-5.5.5-8z"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  digest: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  model: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  channel: '<path d="M4 12a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="13" r="1.6"/><path d="M12 15v6"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logs: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  out: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  tune: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13a6 6 0 0 1-8 1l-6 6a2 2 0 1 1-3-3l6-6a6 6 0 0 1 1-8l1.7 1.3a4 4 0 0 0 2 3z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

const ROUTES = [
  ["overview", "概览", "home"], ["sessions", "会话", "chat"], ["models", "模型与用量", "model"], ["channels", "渠道", "channel"],
  ["plugins", "插件与技能", "plug"], ["cron", "定时任务", "clock"], ["approvals", "审批与配对", "shield"], ["tools", "工具与扩展", "wrench"],
  ["digest", "群报", "digest"], ["interactions", "互动统计", "people"], ["stickers", "表情库", "smile"], ["behavior", "主动行为参数", "bolt"], ["fun", "小脾气参数", "flame"], ["humanlike", "拟人化", "people"],
  ["files", "人设文件", "file"], ["audit", "审计与诊断", "pulse"], ["logs", "日志", "logs"], ["memory", "记忆", "brain"], ["config", "配置", "gear"], ["cli", "原生 CLI", "term"],
];
// ---------- 会话别名（显示顺序：别名 → 网关 label → displayName → 原始 id） ----------
let ALIAS = {};
const loadAliases = () => api.aliases().then(d => { ALIAS = d?.aliases || d || {}; }).catch(() => {});
function aliasFor(id) {
  if (!id) return ""; if (ALIAS[id]) return ALIAS[id];
  const up = String(id).toUpperCase();
  for (const [k, v] of Object.entries(ALIAS)) if (k.length >= 6 && up.includes(k.toUpperCase())) return v;
  return "";
}
// v2.4：m.sender 由字符串变为 {id,name,source}；旧 id 在 m.senderId。两种形状都兼容
const senderId = m => (m?.sender && typeof m.sender === "object" ? m.sender.id : typeof m?.sender === "string" ? m.sender : null) || m?.senderId || null;
const senderLabel = m => { const id = senderId(m), so = m?.sender && typeof m.sender === "object" ? m.sender : null; return aliasFor(id) || so?.name || m?.senderName || (id ? shortId(id) : ""); };
const isOpenId = id => /^[0-9a-f]{32}$/i.test(id || "");
const qqTarget = key => { const m = /qqbot:(group|c2c|direct|dm):([^:]+)/i.exec(key || ""); return m ? { kind: m[1].toLowerCase() === "group" ? "group" : "c2c", id: m[2] } : null; };
const shortId = id => String(id || "").length > 14 ? String(id).slice(0, 6) + "…" + String(id).slice(-4) : String(id || "");
const rawId = x => { const t = qqTarget(x.key); return t ? (t.kind === "group" ? "群 " : "私聊 ") + shortId(t.id) : x.key; };
const isGroupNoName = x => !(x.alias || aliasFor(x.key)) && !x.label && qqTarget(x.key)?.kind === "group";
const sessName = x => x.alias || aliasFor(x.key) || x.label || (isGroupNoName(x) ? "未命名的群" : "") || x.displayName || rawId(x);
const nameHtml = x => `${esc(sessName(x))}${isGroupNoName(x) ? `<span class="namehint">点这里起个名字</span>` : ""}<span class="pen" aria-hidden="true">✎</span>`;
function inlineRename(el, x, after) {
  if (el.querySelector("input")) return;
  const old = x.alias || aliasFor(x.key);
  el.innerHTML = `<input class="input rename" value="${esc(old)}" placeholder="给「${esc(rawId(x))}」起个名字" aria-label="别名" maxlength="40">`;
  const inp = el.querySelector("input"); inp.focus(); inp.select();
  let done = false;
  const finish = async save => { if (done) return; done = true;
    const v = inp.value.trim();
    if (save && v !== old) { const ok = await act(() => api.setAlias(x.key, v), v ? `已改名为「${v}」` : "已清除别名"); if (ok) { if (v) ALIAS[x.key] = v; else delete ALIAS[x.key]; x.alias = v || null; searchIdx = null; } }
    after(); };
  inp.onkeydown = e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); };
  inp.onblur = () => finish(true);
  inp.onclick = e => { e.preventDefault(); e.stopPropagation(); };
}

const TABS0 = ["overview", "sessions", "cli", "models", "logs"];
// v2.9.1 原生 CLI 仅 owner：判断字段待 API.md 最终确定。这里是唯一开关点——
// 目前 /api/me 只有 {authed}，没有角色字段 → 默认显示；一旦带了 role/isOwner 就按它来
let CAN_CLI = true;
const cliAllowed = me => me?.isOwner != null ? !!me.isOwner : me?.role != null ? me.role === "owner" : true;
const hidden = k => k === "cli" && !CAN_CLI;
const TABS = new Proxy([], { get: (_, k) => { const a = TABS0.filter(x => !hidden(x)); const v = a[k]; return typeof v === "function" ? v.bind(a) : v; } });

// ---------- 主题 ----------
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
function toggleTheme() { const n = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = n; localStorage.setItem("hs-theme", n); renderChrome(); }

// ---------- 外壳 ----------
const app = $("#app");
let current = null, timers = [], routeGeneration = 0;
const timerSpecs = new Map();
const stopViewInterval = id => { clearInterval(id); timerSpecs.delete(id); };
const clearTimers = () => { timers.forEach(stopViewInterval); timers = []; };
// A delayed view must not start polling after navigation has detached its owner.
function viewInterval(owner, fn, ms) {
  if (!owner.isConnected) return null;
  const id = setInterval(() => { if (!owner.isConnected) return stopViewInterval(id); fn(); }, ms);
  timerSpecs.set(id, { owner, fn, ms });
  timers.push(id); return id;
}
function replaceView() {
  const old = $("#view"); if (!old) return null;
  const next = old.cloneNode(false); old.replaceWith(next); return next;
}

function shell() {
  app.innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><img src="icon.svg" alt=""><div><b>星野のねこ</b><small>凛的控制台</small></div></div>
      <nav class="nav">${ROUTES.filter(r => !hidden(r[0])).map(([k, t, i]) => `<a href="#/${k}" data-r="${k}">${ic(i)}${t}</a>`).join("")}</nav>
      <div class="foot"><button class="iconbtn" data-act="theme" aria-label="切换深浅色"></button><button class="iconbtn" data-act="logout" aria-label="退出登录">${ic("out")}</button></div>
    </aside>
    <main class="main" id="view"></main>
    <nav class="tabbar">${TABS.map(k => { const [, t, i] = ROUTES.find(r => r[0] === k); return `<a class="tab" href="#/${k}" data-r="${k}">${ic(i)}<span>${t.replace("与用量", "")}</span></a>`; }).join("")}<a class="tab" href="#/more" data-r="more">${ic("more")}<span>更多</span></a></nav>
  </div>`;
  // 注意：#app 是常驻节点，shell() 每次登录/过期重登都会再跑一遍；监听只能绑一次，否则「更多」会叠出多层
  if (!app.dataset.bound) { app.dataset.bound = "1";
  app.addEventListener("click", e => { const a = e.target.closest("[data-act]"); if (!a) return; const act = a.dataset.act; if (act === "theme") toggleTheme(); if (act === "logout") logout(); if (act === "search") searchSheet(); if (act === "newsess") newSessionSheet(); });
  }
  renderChrome();
}
function renderChrome() {
  document.querySelectorAll("[data-act=theme]").forEach(b => b.innerHTML = ic(isDark() ? "sun" : "moon"));
  document.querySelectorAll("[data-r]").forEach(a => { const on = a.dataset.r === current || (a.dataset.r === "more" && current && !TABS.includes(current)); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
}
function top(title, sub, extra = "") { const back = current && current !== "more" && !TABS.includes(current) ? `<a class="iconbtn back" href="#/more" aria-label="返回更多">${ic("back")}</a>` : ""; return `<header class="top">${back}<h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>${extra}<button class="iconbtn" data-act="search" aria-label="全局搜索">${ic("search")}</button><button class="iconbtn" data-act="theme" aria-label="切换深浅色">${ic(isDark() ? "sun" : "moon")}</button></header>`; }

const inertBeforeSheets = new Map();
const topSheet = () => [...document.querySelectorAll("[data-v3sheet], .lightbox")].at(-1);
function syncSheetInert() {
  const top = topSheet();
  if (!top) { for (const [node, inert] of inertBeforeSheets) node.inert = inert; inertBeforeSheets.clear(); return; }
  for (const node of document.body.children) {
    if (!inertBeforeSheets.has(node)) inertBeforeSheets.set(node, node.inert);
    node.inert = node !== top;
  }
}
const sheetTabStops = host => [...host.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest("[hidden],[inert]") && node.getClientRects().length);
function focusSheet(host, preferred) {
  const dialog = host.querySelector(".sheet") || host;
  const target = preferred && host.contains(preferred) && !preferred.closest("[hidden],[inert]") && preferred.getClientRects().length ? preferred : sheetTabStops(host)[0] || dialog;
  target?.focus();
}
function sheet(html, onMount, kind) {
  // 同一种面板已经开着就不再叠一层（防重复绑定/双击/触摸+点击双触发）
  if (kind) { const ex = document.querySelector(`[data-sheet="${kind}"]`); if (ex) return ex._v3close; }
  const previousFocus = document.activeElement;
  const s = document.createElement("div"); if (kind) s.dataset.sheet = kind; s.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  s.dataset.v3sheet = "1"; document.body.append(s);
  history.pushState({ ...(history.state || {}), sheet: 1 }, "");
  // 界面关掉：不调 history.back（避免和随后的跳转抢历史），留下的空历史由 popstate 跳过
  const snap = new WeakMap(); const valueOf = t => t.type === "checkbox" || t.type === "radio" ? t.checked : t.value;
  const take = e => { const t = e.target; if (t.matches?.("input,textarea,select") && !snap.has(t)) snap.set(t, valueOf(t)); };
  for (const ev of ["focusin", "pointerdown", "keydown", "beforeinput"]) s.addEventListener(ev, take, true);
  s._v3dirty = () => !s.dataset.confirm && !s.querySelector("#gq") && ([...s.querySelectorAll("[data-save]:not([disabled])")].some(b => !b.closest("[hidden]")) || [...s.querySelectorAll("input:not([readonly]),textarea:not([readonly]),select")].some(t => snap.has(t) && snap.get(t) !== valueOf(t)));
  let closing = null, dismissed = false;
  const dismiss = () => {
    if (!dismissed) {
      dismissed = true; s.remove(); s._onclose?.(); syncSheetInert();
      const top = topSheet();
      if (top) focusSheet(top, previousFocus);
      else if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus();
    }
    return true;
  };
  const close = force => {
    if (s._authSuspended && force !== true) return Promise.resolve(false);
    if (force === true || !s.isConnected || !s._v3dirty()) return Promise.resolve(dismiss());
    if (!closing) closing = confirmDialog({ title: "还有改动没保存", body: "确定关掉吗？改动会丢掉。", ok: "关掉", danger: true }).then(ok => ok ? dismiss() : false).finally(() => { closing = null; });
    return closing;
  };
  close.markSaved = values => s.querySelectorAll("input,textarea,select").forEach(t => snap.set(t, values?.has(t) ? values.get(t) : valueOf(t)));
  s._v3close = close;
  s.querySelector(".scrim").onclick = () => close();
  s.addEventListener("click", async e => { const a = e.target.closest("a[href^=\"#/\"]"); if (!a || e.defaultPrevented) return; e.preventDefault(); if (await close()) location.hash = a.getAttribute("href"); });
  onMount?.(s.querySelector(".sheet"), close);
  syncSheetInert(); if (s === topSheet()) focusSheet(s);
  return close;
}
document.addEventListener("keydown", e => {
  const host = topSheet(); if (!host) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); host._v3close(); }
  if (e.key === "Tab") {
    const stops = sheetTabStops(host), first = stops[0], last = stops.at(-1), active = document.activeElement;
    if (!first || !host.contains(active) || (e.shiftKey ? active === first : active === last)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); if (!first) focusSheet(host); }
  }
});
document.addEventListener("focusin", e => { const host = topSheet(); if (host && !host.contains(e.target)) focusSheet(host); });
let suspendedUi = null, loggingOut = false;
const authOverlays = "[data-v3sheet], .lightbox, .undo";
function discardSuspendedUi() {
  if (!suspendedUi) return;
  for (const node of [...suspendedUi.overlays.childNodes].reverse()) { if (node._v3close) node._v3close(true); else node.remove(); }
  suspendedUi = null;
}
function restoreSuspendedUi() {
  const saved = suspendedUi; suspendedUi = null;
  app.replaceChildren(saved.content); document.body.append(saved.overlays);
  for (const node of document.querySelectorAll(authOverlays)) node._authSuspended = false;
  history.replaceState(saved.history, "", saved.hash); current = saved.current;
  for (const spec of saved.intervals) viewInterval(spec.owner, spec.fn, spec.ms);
  syncSheetInert();
  const host = topSheet(); if (host) focusSheet(host, saved.focus); else if (saved.focus?.isConnected) saved.focus.focus();
  window.scrollTo(0, saved.scrollY); renderChrome();
}
async function logout() {
  if (loggingOut) return; loggingOut = true;
  try { await api.logout(); showLogin({ preserve: false }); }
  catch (error) { toast(error.message); }
  finally { loggingOut = false; }
}

// ---------- 登录 ----------
function showLogin({ preserve = true } = {}) {
  if (preserve && $(".login", app)) return;
  if (preserve && $(".shell", app)) {
    const content = document.createDocumentFragment(), overlays = document.createDocumentFragment();
    suspendedUi = { content, overlays, focus: document.activeElement, current, hash: location.hash, history: history.state, scrollY, canCli: CAN_CLI, intervals: [...timerSpecs.values()] };
    content.append(...app.childNodes);
    for (const node of document.querySelectorAll(authOverlays)) { node._authSuspended = true; overlays.append(node); }
  } else if (!preserve) {
    discardSuspendedUi();
    for (const node of [...document.querySelectorAll(authOverlays)].reverse()) { if (node._v3close) node._v3close(true); else node.remove(); }
    V3 = null; v3pageHash = "";
  }
  ++routeGeneration; clearTimers(); current = null;
  clearTimeout(toastT); $("#toast").textContent = ""; $("#toast").classList.remove("show");
  app.innerHTML = `<div class="login"><form class="view" autocomplete="on">
    <img src="icon.svg" alt=""><h1>欢迎回来，凛</h1><p>星野のねこ 在等你哦</p>
    <input class="input" type="password" name="password" autocomplete="current-password" placeholder="输入密码" aria-label="密码" required autofocus>
    <button class="btn primary" type="submit">进入控制台</button><div class="err" aria-live="polite"></div></form></div>`;
  const f = $("form", app);
  f.onsubmit = async e => {
    e.preventDefault(); const b = $("button", f), err = $(".err", f); b.disabled = true; b.textContent = "正在验证…"; err.textContent = "";
    try { await api.login(f.password.value); if (!suspendedUi) location.hash = location.hash && location.hash !== "#/login" ? location.hash : "#/overview"; await boot(); }
    catch (x) { err.textContent = x.message; f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake"); f.password.select(); b.disabled = false; b.textContent = "进入控制台"; }
    finally { if (f.isConnected) { b.disabled = false; b.textContent = "进入控制台"; } }
  };
  syncSheetInert(); f.password.focus();
}

// ---------- 路由 ----------
async function route() {
  const generation = ++routeGeneration;
  v3stamp();
  const h = location.hash || "#/overview", p = v3parse(h);
  const prevName = v3parse(v3pageHash).name;
  // 系统返回/手势离开时，有没保存的改动先问一句
  if (v3pageHash && h !== v3pageHash && !v3skip && v3dirty() && v3parse(v3pageHash).name !== p.name) {
    const ok = await confirmDialog({ title: "还有改动没保存", body: "确定离开吗？没保存的改动会丢掉。", ok: "离开", danger: true });
    if (generation !== routeGeneration) return;
    if (!ok) { history.replaceState(history.state, "", v3pageHash); return; }
  }
  v3skip = false;
  if (V3 && document.contains(V3.el) && v3parse(v3pageHash).name !== p.name) v3saveScroll();
  if (prevName !== p.name) sessionStorage.setItem("v3prev", prevName || "");
  if (p.name !== (V3?.k) || !document.contains(V3?.el)) {
    const closed = await v3closeAll();
    if (generation !== routeGeneration) return;
    if (!closed) { history.replaceState(history.state, "", v3pageHash); return; }
  }
  if (TOPIC[p.name] && !p.rest) { const redraw = h === v3pageHash; current = p.name; renderChrome(); clearTimers(); v3pageHash = h; return v3topic(TOPIC[p.name], p.sec, { redraw }); }
  const al = v3alias(p.name, p.rest);
  if (al) { history.replaceState(history.state, "", `#/${al.t}#${al.sec}`); const same = V3?.k === al.t && document.contains(V3?.el); current = al.t; renderChrome(); if (!same) clearTimers(); v3pageHash = location.hash; await v3topic(TOPIC[al.t], al.sec); if (generation === routeGeneration && al.d) v3detail(al.d); return; }
  V3 = null; v3pageHash = h;
  return routeBase(generation);
}
async function routeBase(generation) {
  clearTimers();
  const [, name = "overview", ...rest] = location.hash.replace(/^#/, "").split("/");
  const r = VIEWS[name] ? name : "overview"; current = r; renderChrome();
  const v = replaceView(); if (!v) return;
  v.innerHTML = `<div class="view">${top(routeTitle(r))}<div class="grid g2"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></div>`;
  try { await VIEWS[r](v, decodeURIComponent(rest.join("/"))); }
  catch (e) { if (e.status === 401 || generation !== routeGeneration || !v.isConnected) return; v.innerHTML = `<div class="view">${top(routeTitle(r))}<div class="card empty"><b>😿</b>出了点小状况：${esc(e.message)}<br><br><button class="btn" data-retry>再试一次</button></div></div>`; }
  if (generation !== routeGeneration || !v.isConnected) return;
  window.scrollTo(0, 0);
  const rb = v.querySelector("[data-retry]"); if (rb) rb.onclick = route;
}
const routeTitle = r => r === "more" ? "更多" : ROUTES.find(x => x[0] === r)?.[1] || "";
const paint = (v, html) => { v.innerHTML = `<div class="view">${html}</div>`; return v.firstChild; };

// ---------- 视图 ----------
const VIEWS = {};

// 「更多」列表页（替代旧的弹出菜单）
const MORE_GROUPS = [
  ["聊天与人设", [["files", "人设、说话风格这些文件"], ["memory", "她记住的事，可以查和改"], ["interactions", "谁常和她聊、她回了多少"], ["digest", "每个群的每日小结"]]],
  ["玩法", [["humanlike", "追问、主见、口癖、护短…"], ["fun", "记仇、复读梗、吃醋"], ["behavior", "主动搭话等参数，只读"]]],
  ["素材与表情", [["stickers", "表情库、生成新表情、语音参数"]]],
  ["系统与线路", [["channels", "QQ 等渠道的连接状态"], ["approvals", "需要你点头的事情"], ["cron", "定时让她做事"], ["plugins", "装了哪些插件和技能"], ["tools", "她能用的工具"], ["config", "网关配置"], ["audit", "审计记录和自检"]]],
];
VIEWS.more = async v => {
  const used = new Set(MORE_GROUPS.flatMap(g => g[1].map(x => x[0])));
  const rest = ROUTES.filter(r => !TABS.includes(r[0]) && !hidden(r[0]) && !used.has(r[0])).map(r => [r[0], ""]);
  const groups = MORE_GROUPS.concat(rest.length ? [["其他", rest]] : []);
  const row = (href, icon, t, d, extra = "") => `<a class="mrow" href="${href}" ${extra}><span class="mic">${ic(icon)}</span><span class="grow"><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span><span class="mchev">${ic("chev")}</span></a>`;
  const body = groups.map(([g, items]) => { const rows = items.filter(([k]) => ROUTES.some(r => r[0] === k) && !hidden(k) && !TABS.includes(k)).map(([k, d]) => { const [, t, i] = ROUTES.find(r => r[0] === k); return row(`#/${k}`, i, t, d); }).join("");
    return rows ? `<div class="section">${esc(g)}</div><div class="card mlist">${rows}</div>` : ""; }).join("");
  const root = paint(v, top("更多") + body + `<div class="section">外观与账号</div><div class="card mlist">${row("#", isDark() ? "sun" : "moon", isDark() ? "切换到浅色" : "切换到深色", "跟随你的选择保存在这台设备", 'data-mx="theme"')}${row("#", "out", "退出登录", "", 'data-mx="out"')}</div>`);
  root.addEventListener("click", e => { const a = e.target.closest("[data-mx]"); if (!a) return; e.preventDefault(); if (a.dataset.mx === "theme") { toggleTheme(); route(); } else logout(); });
};

VIEWS.overview = async v => {
  let linkHtml = `<div class="card link"><div class="link-h"><div class="avatar">🛡️</div><div class="grow"><b>线路状态</b><div class="faint" style="font-size:13px"><span class="spin-dot"></span> 正在看看线路的情况…</div></div></div></div>`;
  const loadLink = async () => { try { linkHtml = linkCard(await api.link()); } catch (x) { linkHtml = linkCard({ error: notReady(x) ? "后台还没开放这个接口" : scrub(x.message), __fail: true }); } const el = $("#linkst"); if (v.isConnected && el && current === "overview") el.innerHTML = linkHtml; };
  loadLink(); viewInterval(v, loadLink, 30000);
  const load = async first => {
    const [o, ch] = await Promise.all([api.overview(), api.channels().catch(() => null)]);
    const hs = o.host || {}, m = hs.mem || {}, d = hs.disk || {};
    const memUsed = (m.total || 0) - (m.available || 0), diskUsed = (d.total || 0) - (d.free || 0);
    const qq = ch?.channels?.qqbot ?? ch?.channelAccounts?.qqbot?.[0] ?? o.health?.channels?.qqbot ?? null;
    const [qt, qc] = stateOf(qq);
    const ok = o.health?.ok !== false;
    const hour = new Date().getHours(); const hi = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const ver = pick(o.server, "version") || pick(o.status, "runtimeVersion") || pick(o.info, "version") || "";
    const card = (title, val, unit, p, sub) => `<div class="card"><h3>${title}</h3><div class="big">${val}<small>${unit}</small></div>${p != null ? `<div class="bar ${barCls(p)}"><i style="width:${p.toFixed(1)}%"></i></div>` : ""}<div class="faint" style="font-size:12.5px;margin-top:8px">${sub}</div></div>`;
    const html = top("概览", "") + `
      <div class="card hero"><div class="hi">${hi}，凛 ✨</div><div class="muted" style="margin:4px 0 14px">${ok ? "星野のねこ 一切安好，正在认真值班。" : "网关好像不太舒服，去日志看看吧。"}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${pill(ok ? "网关运行中" : "网关异常", ok ? "ok" : "bad", ok)}${pill("QQ " + qt, qc, qc === "ok")}${ver ? pill("版本 " + ver) : ""}</div></div>
      <div class="section">主机</div>
      <div class="grid g4">
        ${card("CPU", hs.cpu != null ? hs.cpu.toFixed(0) : "—", "%", hs.cpu, "负载 " + (hs.load || []).map(x => x.toFixed(2)).join(" · "))}
        ${card("内存", bytes(memUsed).split(" ")[0], bytes(memUsed).split(" ")[1] || "", pct(memUsed, m.total), "共 " + bytes(m.total))}
        ${card("磁盘", bytes(diskUsed).split(" ")[0], bytes(diskUsed).split(" ")[1] || "", pct(diskUsed, d.total), "剩余 " + bytes(d.free))}
        ${card("开机时长", dur(hs.uptime).split(" ")[0], dur(hs.uptime).split(" ").slice(1).join(" "), null, "主机持续运行")}
      </div>
      <div class="section">网关进程</div>
      <div class="card"><dl class="kv">
        <dt>状态</dt><dd>${ok ? "运行中" : "异常"}</dd>
        <dt>进程号</dt><dd class="tnum">${esc(o.gw?.pid ?? "—")}</dd>
        <dt>已运行</dt><dd>${dur(o.gw?.uptimeSec)}</dd>
        <dt>内存占用</dt><dd class="tnum">${bytes(o.gw?.rssBytes)}</dd>
        <dt>CPU</dt><dd class="tnum">${o.gw?.cpu != null ? o.gw.cpu + "%" : "—"}</dd>
        ${ver ? `<dt>版本</dt><dd>${esc(ver)}</dd>` : ""}
      </dl></div>
      <div class="section">线路</div>
      <div id="linkst">${linkHtml}</div>
      <div class="section">QQ</div>
      <div class="card"><div style="display:flex;align-items:center;gap:12px"><div class="avatar">Q</div><div class="grow" style="flex:1"><b>QQ 机器人</b><div class="faint" style="font-size:13px">${qq?.lastError ? esc(qq.lastError) : qc === "ok" ? "连接稳定，消息收发正常" + (qq?.lastConnectedAt ? " · " + ago(qq.lastConnectedAt) + "连上" : "") : "暂时没有连接上"}</div></div>${pill(qt, qc, qc === "ok")}</div></div>`;
    if (first || current === "overview") paint(v, html);
  };
  await load(true); viewInterval(v, () => load().catch(() => {}), 10000);
};

// 会话
let sessCache = null;
VIEWS.sessions = async (v, key) => {
  const [s, models] = await Promise.all([api.sessions(), api.models().catch(() => ({ models: [] }))]);
  sessCache = s;
  const list = (s.sessions || []).filter(x => !x.archived).sort((a, b) => (b.pinned - a.pinned) || ((b.updatedAt || 0) > (a.updatedAt || 0) ? 1 : -1));
  const wide = matchMedia("(min-width:880px)").matches;
  await loadAliases();
  const name = sessName;
  await loadGroups();
  const rowHtml = x => `<a class="row" href="#/sessions/${encodeURIComponent(x.key)}" ${x.key === key ? 'style="background:var(--accent-soft)"' : ""}>
      <div class="avatar">${esc([...name(x)][0] || "猫")}</div>
      <div class="grow"><div class="t"><span class="nm" data-rename="${esc(x.key)}" title="点击改名" role="button" tabindex="0" aria-label="改名：${esc(sessName(x))}">${x.pinned ? "📌 " : ""}${nameHtml(x)}</span></div><div class="rid mono">${esc(rawId(x))}</div><div class="d">${esc([x.channel, x.chatType === "group" ? "群聊" : x.chatType === "direct" ? "私聊" : x.chatType, x.model].filter(Boolean).join(" · "))}</div></div>
      <div class="r">${fmtTime(x.updatedAt)}<br>${x.hasActiveRun ? pill("思考中", "ac", 1) : x.unread ? pill(x.unread, "ac") : ""}</div></a>`;
  const col = collapsed(), byG = new Map([[null, []], ...GROUPS.map(g => [g.id, []])]);
  for (const x of list) { const g = groupOf(x); (byG.has(g) ? byG.get(g) : byG.get(null)).push(x); }
  const secs = [...GROUPS.map(g => ({ g, items: byG.get(g.id) })), { g: null, items: byG.get(null) }].filter(o => o.g || o.items.length);
  const listHtml = list.length || GROUPS.length ? `<div class="sesslist grouped">${secs.map(({ g, items }) => `<details class="grp" data-gid="${esc(g?.id || "")}" ${col.has(g?.id || "_") ? "" : "open"}><summary><span class="gname">${esc(g ? g.name : GROUPS.length ? "未分组" : "全部会话")}</span><span class="gcount">${items.length}</span>${g ? `<button type="button" class="gmenu iconbtn" data-gmenu="${esc(g.id)}" aria-label="分组操作">⋯</button>` : ""}</summary><div class="list">${items.length ? items.map(rowHtml).join("") : `<div class="gempty faint">还没有会话，去会话设置里把它移进来吧</div>`}</div></details>`).join("")}<button type="button" class="newgroup" data-newgroup>＋ 新建分组</button></div>` : `<div class="card empty"><b>🐾</b>还没有会话呢</div>`;
  if (!key) {
    paint(v, top("会话", `共 ${s.totalCount ?? list.length} 个`, `<button class="iconbtn" data-act="newsess" aria-label="新建会话">${ic("plus")}</button>`) + (wide ? `<div class="split">${listHtml}<div class="card empty" style="align-self:start"><b>💬</b>选一个会话，看看大家在聊什么</div></div>` : listHtml));
    return;
  }
  const sess = list.find(x => x.key === key) || (s.sessions || []).find(x => x.key === key) || { key };
  const root = paint(v, (wide ? `<div class="split">${listHtml}<div class="chatpane">` : "") + `
    <div class="chat">
      <div class="chathead">${wide ? "" : `<a class="iconbtn" href="#/sessions" aria-label="返回">${ic("back")}</a>`}
        <div class="grow"><div class="t"><span class="nm" data-rename="${esc(sess.key)}" title="点击改名" role="button" tabindex="0" aria-label="改名：${esc(sessName(sess))}">${nameHtml(sess)}</span></div><div class="sub" title="${esc(rawId(sess))}">${esc([sess.chatType === "group" ? "群聊" : sess.chatType === "direct" ? "私聊" : "", sess.model, sess.thinkingLevel && "思考 " + sess.thinkingLevel].filter(Boolean).join(" · "))}</div></div>
        <button class="iconbtn" data-x="tune" aria-label="会话设置">${ic("tune")}</button>
        <button class="iconbtn" data-x="theme2" aria-label="切换深浅色">${ic(isDark() ? "sun" : "moon")}</button></div>
      <div class="msgs" id="msgs"><div class="skel"></div></div>
      <form class="composer" id="comp">
        <div class="att-tray" id="tray" hidden></div><div class="att-drop" aria-hidden="true">松手就能添加附件</div>
        <textarea rows="1" placeholder="以凛的身份说点什么…" aria-label="消息"></textarea>
        <div class="qqwarn" hidden>⚠️ 现在发出的内容会<b>以星野のねこ的身份</b>直接发到 ${qqDest(sess)}</div>
        <div class="ctl"><button type="button" class="iconbtn optb" id="optb" aria-label="发送选项" aria-expanded="false">${ic("plus")}</button><div class="tgs"><label class="tg"><span class="switch"><input type="checkbox" id="deliver"><i></i></span>同时发送到 QQ</label>
          <label class="tg tg-bot" hidden><span class="switch warn"><input type="checkbox" id="asbot"><i></i></span>以星野のねこ身份发到 QQ</label></div>
          ${attBtns()}<button type="button" class="btn danger" id="abort" aria-label="中止" ${sess.hasActiveRun ? "" : "hidden"}>${ic("stop")}中止</button>
          <button class="btn primary" id="sendb">${ic("send")}发送</button></div>
      </form>
    </div>` + (wide ? "</div></div>" : ""));
  const msgs = $("#msgs", root), ta = $("textarea", root), form = $("#comp", root), abortB = $("#abort", root);
  const asbot = $("#asbot", root), deliverC = $("#deliver", root);
  const optb = $("#optb", root); optb.onclick = () => { const o = form.classList.toggle("opts"); optb.setAttribute("aria-expanded", o); };
  const tray = attachTray({ scope: "chat", ensureSession: async () => key, onChange: () => { const sb = $("#sendb", root); if (sb) { sb.disabled = tray.busy(); sb.title = tray.busy() ? "附件还在上传" : ""; } } }); tray.mount($("#tray", root)); tray.bind(form, ta); loadLimits();
  api.features().then(f => { if (f?.qqSend === true) $(".tg-bot", root).hidden = false; }).catch(() => {});
  asbot.onchange = () => { const on = asbot.checked; form.querySelector(".att-btns").hidden = on; form.classList.toggle("botmode", on); if (on) { form.classList.add("opts"); optb.setAttribute("aria-expanded", true); } $(".qqwarn", root).hidden = !on; deliverC.disabled = on; if (on) deliverC.checked = false; ta.placeholder = on ? "以星野のねこ的身份说…" : "以凛的身份说点什么…"; $("#sendb", root).innerHTML = ic("send") + (on ? "发到 QQ" : "发送"); };
  msgs.addEventListener("click", e => { const im = e.target.closest("[data-full]"); if (im) lightbox(im.dataset.full, im.getAttribute("aria-label")); });
  let lastSig = "", older = [], olderNext, olderMore; const openK = new Set(), revealK = new Set(), isGroup = sess.chatType === "group" || qqTarget(key)?.kind === "group";
  msgs.addEventListener("toggle", e => { const k = e.target.dataset?.k; if (k) e.target.open ? openK.add(k) : openK.delete(k); }, true);
  msgs.addEventListener("click", async e => {
    const cp = e.target.closest("[data-copy]");
    if (cp) { const ok = await copyText(cp.closest(".codewrap")?.querySelector("code")?.textContent || ""); toast(ok ? "已复制" : "复制没成功，可以长按选中后再复制"); if (ok) { const sp = cp.querySelector("span"); sp.textContent = "已复制 ✓"; cp.classList.add("done"); setTimeout(() => { sp.textContent = "复制"; cp.classList.remove("done"); }, 1800); } return; }
    const pf = e.target.closest("[data-prof]"); if (pf) return profileSheet(pf.dataset.prof, () => { lastSig = ""; loadHist(true); }, isGroup ? key : null);
    const ob = e.target.closest("[data-older]"); if (!ob) return; ob.disabled = true; ob.textContent = "正在翻找…";
    try { const r = await api.history(key, 60, ob.dataset.older); older = [...(r.messages || []), ...older]; olderNext = r.nextBefore ?? null; olderMore = !!r.hasMore; const h = msgs.scrollHeight; lastSig = ""; await loadHist(true); msgs.scrollTop += msgs.scrollHeight - h; }
    catch (x) { toast(x.message); ob.disabled = false; ob.textContent = "加载更早的消息"; }
  });
  const loadHist = async keep => {
    const hst = await api.history(key, 80); const latest = hst.messages || [];
    const seen = new Set(latest.map(m => m.id).filter(Boolean)), ms = [...older.filter(m => !m.id || !seen.has(m.id)), ...latest];
    const sig = JSON.stringify([ms, hst.hasMore, hst.nextBefore, hst.gatewayHasMore, hst.totalMessages, hst.windowCount, hst.sendLogFrom]); if (sig === lastSig) return; lastSig = sig;
    const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const ctx = { sendLogFrom: hst.sendLogFrom, openK, revealK, group: isGroup };
    const more = older.length ? olderMore : !!hst.hasMore, next = older.length ? olderNext : hst.nextBefore ?? null;
    const head = (more && next != null ? `<button type="button" class="older" data-older="${esc(next)}">加载更早的消息</button>`
      : more || hst.gatewayHasMore ? `<div class="oldnote">🌙 网关只保留最近一个窗口的记录，更早的聊天在这里翻不到了</div>` : ms.length ? `<div class="oldnote">这就是最早的消息啦</div>` : "")
      + (ms.length ? `<div class="histnote faint">共 ${hst.totalMessages ?? ms.length} 条消息${hst.windowCount ? `，网关窗口内 ${hst.windowCount} 条` : ""}，已显示 ${ms.length} 条${hst.sendLogFrom ? ` · 发送日志从 ${esc(hst.sendLogFrom)} 起才有，更早的「已发到 QQ」是推断的` : ""}</div>` : "");
    ctx.model = sess.model;
    msgs.innerHTML = ms.length ? head + renderList(ms, ctx) : `<div class="empty"><b>🌙</b>这里还很安静</div>`; wrapCode(msgs);
    if (!keep && (atBottom || !msgs.dataset.init)) msgs.scrollTop = msgs.scrollHeight; msgs.dataset.init = 1;
  };
  // 内部通知「查看原文」：先二次确认；原文只在内存里，确认后才渲染进页面；收起 / 切走 / 离开页面就清掉
  msgs.addEventListener("click", async e => {
    const hd = e.target.closest("[data-unreveal]"); if (hd) { revealK.delete(hd.dataset.unreveal); lastSig = ""; loadHist(true); return; }
    const rv = e.target.closest("[data-reveal]"); if (!rv) return;
    const ok = await confirmDialog({ title: "这是一条内部通知", body: "这是系统内部使用的内容，里面可能带着路径、记录，甚至敏感信息。我会先把密码、密钥这类内容打码；看完记得收起，切走页面也会自动收起。", ok: "确认查看" });
    if (!ok) return; revealK.add(rv.dataset.reveal); lastSig = ""; loadHist(true);
  });
  ["copy", "cut", "dragstart"].forEach(t => msgs.addEventListener(t, e => { if (e.target.closest?.(".annbox")) e.preventDefault(); }, true));
  const wipeRaw = e => { if (!msgs.isConnected) { document.removeEventListener("visibilitychange", wipeRaw); removeEventListener("pagehide", wipeRaw); return; } if (!revealK.size || (e.type === "visibilitychange" && !document.hidden)) return; revealK.clear(); msgs.querySelectorAll(".annraw").forEach(n => n.remove()); lastSig = ""; loadHist(true).catch(() => {}); };
  document.addEventListener("visibilitychange", wipeRaw); addEventListener("pagehide", wipeRaw);
  // 搜索跳转：先试 before=messageId，400 等失败就只打开会话
  let jump = null; try { jump = JSON.parse(sessionStorage.getItem("hs-before") || "null"); } catch {} sessionStorage.removeItem("hs-before");
  if (jump && jump.href === location.hash && jump.mid) {
    try { const r = await api.history(key, 60, jump.mid); older = r.messages || []; olderNext = r.nextBefore ?? null; olderMore = !!r.hasMore; }
    catch (x) { if (x.status !== 400) toast("没能定位到那条消息，先帮你打开会话"); }
  }
  await loadHist(!!older.length);
  if (older.length) { const ids = new Set(older.map(m => m.id)); const els = [...msgs.querySelectorAll(".msg")]; void ids; const el = els[Math.max(0, Math.min(older.length, els.length) - 1)]; el?.scrollIntoView({ block: "center" }); el?.classList.add("flash"); }
  viewInterval(v, async () => { try { await loadHist(); const ss = await api.sessions(); const x = ss.sessions.find(y => y.key === key); abortB.hidden = !x?.hasActiveRun; } catch {} }, 4000);
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && wide) { e.preventDefault(); form.requestSubmit(); } });
  form.onsubmit = async e => {
    e.preventDefault(); const text = ta.value.trim(); if (!text && !tray.count()) return;
    if (asbot.checked && tray.count()) return toast("以星野のねこ身份发到 QQ 暂不支持附件，先移除附件");
    const blk = tray.blocker(); if (blk) return toast(blk);
    const b = $("#sendb", root); b.disabled = true;
    const deliver = deliverC.checked;
    if (asbot.checked) {
      b.disabled = false;
      if (!await confirmDialog({ title: "以星野のねこ身份发到 QQ？", body: `这条消息会<b>以机器人的身份</b>直接发出，<b>不会</b>经过星野のねこ思考，发出后无法撤回。<div class="dest">${qqDest(sess, true)}</div><div class="quote">${esc(text.slice(0, 300))}</div>`, ok: "确认发送", danger: true })) return;
      b.disabled = true;
      try { const rr = await api.qqSend(key, text); void rr; ta.value = ""; ta.style.height = ""; toast("已以星野のねこ的身份发到 QQ"); asbot.checked = false; asbot.onchange(); lastSig = ""; await loadHist(); msgs.scrollTop = msgs.scrollHeight; }
      catch (x) { toast(x.code === "attachments_unsupported" ? "以星野のねこ身份发到 QQ 不支持附件" : notReady(x) ? "这个功能后台还没开放" : x.message); } finally { b.disabled = false; }
      return;
    }
    try { await api.send(key, text, deliver, tray.ids()); tray.clear(); ta.value = ""; ta.style.height = ""; toast(deliver ? "已发送，也同步到 QQ 了" : "已发送（仅在控制台）"); abortB.hidden = false; lastSig = ""; await loadHist(); msgs.scrollTop = msgs.scrollHeight; }
    catch (x) { if (x.status === 404 && tray.count()) tray.expire();
      toast(x.status === 404 && tray.count() ? "附件已过期，点 ↻ 重新上传后再发" : x.code === "too_many_attachments" ? `附件太多了，每条最多 ${(LIMITS || LIMITS0).maxPerMessage} 个` : x.status === 413 ? "附件太大了，网关收不下，删掉几个再试" : x.status === 403 ? "有附件不属于这个会话，移除后重新添加" : x.message); } finally { b.disabled = false; }
  };
  abortB.onclick = async () => { try { await api.abort(key); toast("已经让它停下来了"); abortB.hidden = true; } catch (x) { toast(x.message); } };
  root.addEventListener("click", e => { const b = e.target.closest("[data-x]"); if (!b) return; if (b.dataset.x === "theme2") { toggleTheme(); b.innerHTML = ic(isDark() ? "sun" : "moon"); } if (b.dataset.x === "tune") tuneSheet(sess, models.models || [], s.defaults); });
};
document.addEventListener("click", e => {
  const gm = e.target.closest("[data-gmenu]"), ng = e.target.closest("[data-newgroup]");
  if (gm) { e.preventDefault(); e.stopPropagation(); const g = GROUPS.find(x => x.id === gm.dataset.gmenu); if (g) groupMenu(g, () => route()); return; }
  if (ng) { e.preventDefault(); groupEdit(null, () => route()); return; }
}, true);
document.addEventListener("toggle", e => { const d = e.target; if (!d.classList?.contains("grp")) return; const c = collapsed(), k = d.dataset.gid || "_"; d.open ? c.delete(k) : c.add(k); localStorage.setItem("hs-gcol", JSON.stringify([...c])); }, true);
document.addEventListener("click", e => {
  const n = e.target.closest("[data-rename]"); if (!n || !sessCache) return;
  e.preventDefault(); e.stopPropagation();
  const x = (sessCache.sessions || []).find(s => s.key === n.dataset.rename) || { key: n.dataset.rename };
  inlineRename(n, x, () => { document.querySelectorAll(`[data-rename="${CSS.escape(x.key)}"]`).forEach(o => o.innerHTML = nameHtml(x)); });
}, true);
function textOf(c) { if (typeof c === "string") return c; if (Array.isArray(c)) return c.map(p => p?.type === "text" ? p.text : p?.type === "toolCall" || p?.type === "tool_use" ? `🔧 ${p.name || ""} ${JSON.stringify(p.arguments ?? p.input ?? "").slice(0, 300)}` : p?.type === "thinking" ? "" : p?.type === "image" ? "[图片]" : typeof p === "string" ? p : "").filter(Boolean).join("\n"); return c ? JSON.stringify(c) : ""; }
// 解析 QQ 发送目标：按 API.md v2.1，带 sessionKey 时后端取会话的 deliveryContext.to（REAL_SHAPES 另见 origin.to / lastTo）。原样展示，不做特殊命名。
function qqDest(sess, detail) {
  const to = sess.deliveryContext?.to || sess.origin?.to || sess.lastTo || "";
  const dn = sess.displayName || sess.key;
  if (!to) return detail ? `<div class="dest-k">发送到</div><div class="dest-v">⚠️ 未能解析投递目标</div><div class="dest-s mono">${esc(sess.key)} · 会话没有 deliveryContext.to，后端会拒绝</div>` : `「<b>${esc(dn)}</b>」（投递目标未知）`;
  const t = qqTarget(to), kind = t ? (t.kind === "group" ? "QQ 群" : "QQ 私聊") : "目标";
  return detail ? `<div class="dest-k">发送到</div><div class="dest-v">${t?.kind === "group" ? "👥" : "👤"} ${kind}「${esc(dn)}」</div><div class="dest-s mono">${esc(to)}</div><div class="dest-s mono">会话 ${esc(sess.key)}</div>` : `${kind}「<b>${esc(dn)}</b>」<span class="mono">${esc(to)}</span>`;
}
function renderMedia(list, seen) {
  if (!list.length) return "";
  return `<div class="media">${list.map(x => x.kind === "image" ? `<figure class="mfig"><button type="button" class="thumb" data-full="${esc(x.url)}" aria-label="${esc(x.name)}"><img src="${esc(x.url)}" alt="${esc(x.name)}" loading="lazy" decoding="async"></button>${seen?.has(x.src) ? "" : `<figcaption class="mpath mcap">${esc(x.src)}</figcaption>`}</figure>`
    : x.kind === "audio" ? `<audio controls preload="none" src="${esc(x.url)}"></audio>`
    : x.kind === "video" ? `<video controls preload="metadata" playsinline src="${esc(x.url)}"></video>`
    : `<a class="filelink" href="${esc(x.url)}" download="${esc(x.name)}">📎 ${esc(x.name)}${x.size ? ` <span class="faint">${bytes(x.size)}</span>` : ""}</a>`).join("")}</div>`;
}
function lightbox(url, name) {
  const previousFocus = document.activeElement;
  const d = document.createElement("div"); d.className = "lightbox"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", name || "图片"); d.tabIndex = -1;
  d.innerHTML = `<img src="${esc(url)}" alt="${esc(name || "")}"><a class="iconbtn lb-dl" href="${esc(url)}" download aria-label="下载">⤓</a>`;
  const finish = () => { d.remove(); syncSheetInert(); const host = topSheet(); if (host) focusSheet(host, previousFocus); else if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus(); };
  const close = force => { if (d._authSuspended && force !== true) return; d.classList.add("out"); if (force === true) finish(); else setTimeout(finish, 200); };
  d._v3close = close;
  d.onclick = e => { if (!e.target.closest(".lb-dl")) close(); }; document.body.append(d); syncSheetInert(); focusSheet(d);
}
const DR = { "delivery-mirror": "网关确认已投递", "mirror-unconfirmed": "网关未确认投递", "no-channel": "这个会话不连 QQ", "silent-token": "静默回复（NO_REPLY 等）", "stay_silent": "这一轮选择了不说话（stay_silent）", "keepalive": "只是缓存保活", "run-failed": "回复前运行失败了", "non-channel-trigger": "这一轮不是 QQ 消息触发的", "intermediate-text": "中间段文本，不一定发出", "qq-send-ok": "网关日志有 qq-send-ok", "no-send-ok-log": "日志里没有发送成功记录", "final-reply-inferred": "按最终回复推断，没有日志可证" };
const tdur = ms => ms == null ? "" : ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s";
// 投递状态：只画一个小点（绿 已发 / 红 没发 / 黄 无法确认），点开才显示一句话原因；点击区用透明伪元素扩到 44px
const DRS = { "delivery-mirror": "网关确认已投递", "mirror-unconfirmed": "网关没有确认投递", "no-channel": "这个会话不连 QQ", "silent-token": "静默回复，没有发出", "stay_silent": "这一轮选择了不说话", "keepalive": "只是缓存保活", "run-failed": "回复前运行失败了", "non-channel-trigger": "这一轮不是 QQ 消息触发的", "intermediate-text": "中间段文字，不一定发出", "qq-send-ok": "日志里有发送成功记录", "no-send-ok-log": "日志里没有发送成功记录", "final-reply-inferred": "按最终回复推断，没有日志可证" };
function deliveryBadge(m, ctx) {
  const d = m.delivery; if (!d) return "";
  const r = m.deliveryReason || "", why = DRS[r] || DR[r] || r;
  const inf = d === "sent" && m.deliveryConfidence !== "high";
  const st = d === "sent" ? { c: "ok", t: inf ? "已发到 QQ（推断）" : "已发到 QQ" } : d === "silent" ? { c: "bad", t: "没发到 QQ" } : { c: "warn", t: "无法确认是否发到 QQ" };
  const k = "dv" + (m.id || m.ts);
  return `<details class="dvd" data-k="${esc(k)}" ${ctx.openK.has(k) ? "open" : ""}><summary role="button" aria-label="${esc(st.t)}，点开看原因" title="${esc(st.t)}"><i class="dot ${st.c}" aria-hidden="true"></i></summary><span class="dvn" role="note"><b>${esc(st.t)}</b>${why ? "：" + esc(why) : ""}</span></details>`;
}
function blk(label, o, k, ctx) {
  if (!o || o.text == null || o.text === "") return "";
  const kk = k + label; let t = o.text; try { if (/^[\[{]/.test(t) && !o.truncated) t = JSON.stringify(JSON.parse(t), null, 2); } catch {}
  return `<details class="blk" data-k="${esc(kk)}" ${ctx.openK.has(kk) ? "open" : ""}><summary>${label}<span class="faint"> · ${o.length ?? t.length} 字</span></summary><pre>${esc(t)}</pre>${o.truncated || o.gatewayTruncated ? `<div class="trunc">⚠️ 内容太长，只显示了前 ${label === "参数" ? 2048 : 4096} 字（共 ${o.length ?? "?"} 字）${o.gatewayTruncated ? "，网关本身也截断过" : ""}</div>` : ""}</details>`;
}
function chainHtml(m, ctx, compact) {
  const ts = m.tools || []; if (!ts.length) return "";
  const k = "c" + (m.id || m.ts), total = ts.reduce((a, t) => a + (t.durationMs || 0), 0), errs = ts.filter(t => t.isError || t.status === "error").length, pend = ts.some(t => t.status === "pending");
  const icon = t => t.status === "pending" ? `<span class="spin-dot"></span>` : t.isError || t.status === "error" ? `<span class="st err">✕</span>` : `<span class="st ok">✓</span>`;
  const short = n => String(n || "工具").replace(/^mcp__[^_]+__/, "");
  return `<details class="chain ${compact ? "compact" : ""}" data-k="${esc(k)}" title="${esc(ts.map(t => short(t.name)).join("、") + (total ? " · 工具合计 " + tdur(total) : ""))}" ${ctx.openK.has(k) ? "open" : ""}><summary><span class="ch-ic">🔧</span><span class="ch-sum">调用了 ${ts.length} 个工具${errs ? `，<span class="ch-err">${errs} 个出错</span>` : ""}${pend ? "，还在进行" : ""}</span>${pend ? `<span class="spin-dot"></span>` : ""}</summary><ol>${ts.map((t, i) => `<li class="step ${t.status || ""}"><div class="step-h">${icon(t)}<b class="mono" title="${esc(t.name)}">${esc(short(t.name))}</b><span class="faint">${t.status === "pending" ? "进行中…" : tdur(t.durationMs)}</span></div>${blk("参数", t.args, k + i, ctx)}${t.result ? blk(t.isError ? "错误" : "结果", t.result, k + i, ctx) : t.status === "pending" ? "" : `<div class="faint small">没有返回结果</div>`}</li>`).join("")}</ol></details>`;
}
// ---------- v2.10 附件（上传托盘：点选 / 相册 / 粘贴 / 拖拽，进度、重试、移除） ----------
const MB = 1024 * 1024;
let LIMITS = null;
const LIMITS0 = { maxBytes: 20 * MB, maxPerMessage: 10, chat: { maxBytes: 20 * MB, maxImageBytes: 6 * MB, maxPayload: 25 * MB }, cli: { maxBytes: 20 * MB } };
const loadLimits = async () => { if (LIMITS) return LIMITS; try { const d = await api.uploadLimits(); LIMITS = { ...LIMITS0, ...d, chat: { ...LIMITS0.chat, ...d?.chat }, cli: { ...LIMITS0.cli, ...d?.cli } }; } catch { LIMITS = LIMITS0; } return LIMITS; };
const isImgType = t => /^image\/(png|jpe?g|gif|webp)$/i.test(t || "");
const fileIcon = (mime = "", name = "") => /pdf/.test(mime) || /\.pdf$/i.test(name) ? "📕" : /zip|gzip|compress|tar/.test(mime) || /\.(zip|gz|tgz|7z|rar)$/i.test(name) ? "🗜️" : /audio/.test(mime) ? "🎵" : /video/.test(mime) ? "🎬" : /word|document/.test(mime) || /\.docx?$/i.test(name) ? "📝" : /sheet|excel/.test(mime) || /\.xlsx?$/i.test(name) ? "📊" : /text|json/.test(mime) ? "📄" : "📎";
// 历史里的附件：图片 → <img>（同源，符合 img-src 'self'），点开大图；文件 → 卡片，下载走 ?download=1；过期 → 提示
function attHtml(list, cap) {
  if (!Array.isArray(list) || !list.length) return "";
  return `<div class="att-hist">${list.map(a => a?.expired ? `<span class="att-exp">🕰️ 附件已过期${a.name ? "：" + esc(a.name) : ""}</span>`
    : a.kind === "image" ? (cap ? `<figure class="mfig">` : "") + `<button type="button" class="thumb att-img" data-full="${esc(a.url)}" aria-label="${esc(a.name || "图片")}"><img src="${esc(a.url)}" alt="${esc(a.name || "图片")}" loading="lazy" decoding="async"></button>` + (cap ? `${a.path || a.name ? `<figcaption class="mpath mcap">${esc(a.path || a.name)}</figcaption>` : ""}</figure>` : "")
    : `<a class="att-file" href="${esc(a.url)}?download=1" download="${esc(a.name || "")}"><span class="att-ic">${fileIcon(a.mime, a.name)}</span><span class="att-nm"><b>${esc(a.name || "文件")}</b><span class="faint">${esc([a.size != null ? bytes(a.size) : "", a.path || "", a.expiresAt ? "保留到 " + fmtTime(a.expiresAt) : ""].filter(Boolean).join(" · "))}</span></span><span class="att-dl" aria-hidden="true">⬇</span></a>`).join("")}</div>`;
}
const attBtns = () => `<span class="att-btns"><button type="button" class="iconbtn att-b" data-att="img" aria-label="从相册选图片" title="图片">🖼️</button><button type="button" class="iconbtn att-b" data-att="file" aria-label="选择文件" title="文件">📎</button><input type="file" hidden multiple accept="image/*" data-pick="img"><input type="file" hidden multiple data-pick="file"></span>`;
async function thumbOf(file) {
  try { const bm = await createImageBitmap(file); const k = Math.min(1, 160 / Math.max(bm.width, bm.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k)); c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height); bm.close?.(); return c.toDataURL("image/jpeg", .8); } catch { return null; }
}
function attachTray({ scope, ensureSession, onChange }) {
  const items = []; let el = null, seq = 0;
  const lim = () => LIMITS || LIMITS0;
  const capOf = f => scope === "chat" ? (isImgType(f.type) ? lim().chat.maxImageBytes : Math.min(lim().maxBytes, lim().chat.maxBytes || lim().maxBytes)) : (lim().cli.maxBytes || lim().maxBytes);
  const errTxt = x => x.code === "too_large" || x.status === 413 ? "文件超过上限了" : x.status === 404 ? "会话已经不在了" : x.status === 403 ? (x.code === "forbidden" ? "没有权限" : "这个附件不属于当前会话") : x.status === 400 ? "文件是空的或参数不对" : x.message;
  const render = () => {
    if (!el) return;
    el.hidden = !items.length;
    el.innerHTML = items.map(it => `<div class="att-chip ${it.st}" data-k="${it.k}">${it.thumb ? `<img src="${it.thumb}" alt="">` : `<span class="att-ic">${fileIcon(it.res?.mime || it.file.type, it.file.name)}</span>`}
      <span class="att-nm"><b>${esc(it.file.name || "粘贴的图片")}</b><span class="faint">${it.st === "up" ? (it.pct >= 1 ? "处理中…" : `上传中 ${Math.round(it.pct * 100)}%`) : it.st === "err" ? esc(it.err) : bytes(it.file.size)}</span></span>
      ${it.st === "up" ? `<i class="att-bar" style="--p:${Math.round(it.pct * 100)}%"></i>` : ""}${it.st === "ok" ? `<span class="att-ok" aria-label="已上传">✓</span>` : ""}
      ${it.st === "err" && it.retry !== false ? `<button type="button" class="att-x" data-retry="${it.k}" aria-label="重试">↻</button>` : ""}<button type="button" class="att-x" data-rm="${it.k}" aria-label="移除 ${esc(it.file.name || "附件")}">✕</button></div>`).join("");
    (self.onChange || onChange)?.();
  };
  const up = async it => {
    it.st = "up"; it.pct = 0; it.err = ""; render();
    try {
      const session = await ensureSession();
      it.x = api.upload(it.file, { scope, session, name: it.file.name || `paste-${Date.now()}.png` }, p => { it.pct = p; render(); });
      it.res = await it.x.promise; it.st = "ok";
      if (it.res?.kind === "image" && !it.thumb) it.thumb = await thumbOf(it.file);
    } catch (x) { if (x.code === "aborted") return; it.st = "err"; it.err = errTxt(x); it.retry = !(x.code === "too_large" || x.status === 413); }
    render();
  };
  const add = async files => {
    await loadLimits();
    for (const f of [...files]) {
      if (items.length >= lim().maxPerMessage) { toast(`每条消息最多 ${lim().maxPerMessage} 个附件`); break; }
      if (!f.size) { toast(`「${f.name}」是空文件`); continue; }
      const cap = capOf(f); if (f.size > cap) { toast(`「${f.name || "图片"}」有 ${bytes(f.size)}，超过${scope === "chat" && isImgType(f.type) ? "聊天图片" : "单个文件"}上限 ${bytes(cap)}`); continue; }
      const it = { k: ++seq, file: f, st: "up", pct: 0, thumb: isImgType(f.type) ? await thumbOf(f) : null };
      items.push(it); up(it);
    }
  };
  const remove = k => { const i = items.findIndex(x => x.k === +k); if (i < 0) return; const it = items[i]; it.x?.abort(); if (it.res?.id) api.uploadDelete(it.res.id).catch(() => {}); items.splice(i, 1); render(); };
  const self = {
    items, add,
    mount(container) { el = container; el.classList.add("att-tray"); el.onclick = e => { const r = e.target.closest("[data-rm]"), t = e.target.closest("[data-retry]"); if (r) remove(r.dataset.rm); if (t) { const it = items.find(x => x.k === +t.dataset.retry); if (it) up(it); } }; render(); },
    bind(form, ta) {
      form.querySelectorAll("[data-att]").forEach(b => b.onclick = () => form.querySelector(`[data-pick=${b.dataset.att}]`).click());
      form.querySelectorAll("[data-pick]").forEach(i => i.onchange = () => { add(i.files); i.value = ""; });
      ta?.addEventListener("paste", e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); add(fs); } });
      form.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); form.classList.add("dropping"); } });
      form.addEventListener("dragleave", e => { if (!form.contains(e.relatedTarget)) form.classList.remove("dropping"); });
      form.addEventListener("drop", e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); form.classList.remove("dropping"); add(e.dataTransfer.files); });
    },
    ids: () => items.filter(x => x.st === "ok").map(x => x.res.id),
    busy: () => items.some(x => x.st === "up"),
    failed: () => items.some(x => x.st === "err"),
    count: () => items.length,
    payload: () => items.reduce((a, x) => a + Math.ceil(x.file.size / 3) * 4, 0),
    clear() { items.splice(0); render(); },
    expire() { for (const it of items) if (it.st === "ok") { it.st = "err"; it.err = "已过期，点 ↻ 重新上传"; it.retry = true; it.res = null; } render(); },
    // 发送前检查：上传中 / 失败 / 合计超限 → 返回提示文字
    blocker() { if (items.some(x => x.st === "up")) return "附件还在上传，等它传完再发"; if (items.some(x => x.st === "err")) return "有附件没传上去，重试或移除后再发"; if (scope === "chat" && this.payload() > lim().chat.maxPayload) return `附件合计太大了（编码后超过 ${bytes(lim().chat.maxPayload)}），删掉几个再发`; return ""; },
  };
  return self;
}
// 代码块：包一层带「语言 + 复制」的条；复制先用 navigator.clipboard，失败（非 https / 权限）回退 execCommand
function wrapCode(root) {
  root.querySelectorAll("pre.md-code").forEach(pre => {
    if (pre.parentElement?.classList.contains("codewrap")) return;
    const w = document.createElement("div"); w.className = "codewrap";
    w.innerHTML = `<div class="codebar"><span class="cl">${esc(pre.dataset.lang || "代码")}</span><button type="button" class="cp" data-copy aria-label="复制这段代码"><span>复制</span></button></div>`;
    pre.replaceWith(w); w.appendChild(pre);
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
const DAY = ms => { const d = new Date(ms), n = new Date(), y = new Date(n - 864e5); return d.toDateString() === n.toDateString() ? "今天" : d.toDateString() === y.toDateString() ? "昨天" : `${d.getMonth() + 1}月${d.getDate()}日`; };
const HM = ms => { const d = new Date(ms), p = x => String(x).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
// 这一轮的反应耗时（估算）：助手消息 ts − 触发这一轮的那条用户 / 系统消息 ts。接口没有「整轮用时」字段，所以一律标「约」；
// 拿不到触发消息（在翻页之外）、时间倒挂、超过 30 分钟（多半是排队 / 恢复）、投递镜像消息，都不显示，绝不编数字。
const costText = (m, ctx) => {
  if (m.role !== "assistant" || m.model === "delivery-mirror") return "";
  const t0 = ctx.trig?.get(m.turnId), t1 = toMs(m.ts); if (t0 == null || t1 == null) return "";
  const d = t1 - t0; if (!(d >= 0) || d > 30 * 60e3) return "";
  const sec = Math.round(d / 1000); if (sec < 1) return "用时不到 1 秒";
  return sec < 60 ? `用时约 ${sec} 秒` : `用时约 ${Math.floor(sec / 60)} 分${sec % 60 ? " " + (sec % 60) + " 秒" : ""}`;
};
// 凛的消息来源（只看网关给的标识，不再「有 senderId 就是 QQ」）：
//  1) idempotencyKey 以 channel-user: 开头，或 senderId 是 32 位 openid → QQ；
//  2) idempotencyKey 是 <uuid>:user → 控制台（控制台消息的 senderId 可能没有，也可能是 gateway-owner，都不影响）；
//  保活轮 / 内部 announce / 其他不认识的来源一律不贴标签。
const HB_RE = /^\s*\[OpenClaw heartbeat/i;
const srcOf = m => {
  if (m.role !== "user" || !m.owner) return "";
  if (HB_RE.test(textOf(m.content))) return "";
  const k = String(m.idempotencyKey || "");
  if (/^channel-user:/i.test(k) || isOpenId(m.senderId)) return "QQ";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:user$/i.test(k) ? "控制台" : "";
};
const MPATH = /\/home\/ubuntu\/\.openclaw\/media\/[^\s"'\\)\]<>]+\.(?:jpe?g|png|gif|webp|bmp|mp4|webm|mov|mp3|wav|ogg|m4a|amr|silk|txt|md|pdf|zip)/gi;
// 仅展示用：把正文里的本地媒体路径包成灰字（只改渲染出来的 HTML，不碰要发送的内容；代码块里不动）
const grayPaths = (html, seen) => { let pre = 0; return html.split(/(<[^>]+>)/).map(seg => { if (seg[0] === "<") { if (/^<pre\b/i.test(seg)) pre++; else if (/^<\/pre>/i.test(seg)) pre--; return seg; } return pre > 0 ? seg : seg.replace(MPATH, p => (seen?.add(p), `<span class="mpath">${p}</span>`)); }).join(""); };
const gkey = m => m.role === "user" ? (m.owner ? "me" + srcOf(m) : "u:" + (senderId(m) || "")) : m.role === "assistant" ? "bot" : "t";
// ---------- 折叠：连续工具调用 / 内部通知 / 保活 ----------
// 内部通知（announce）的正文永远不进 DOM：折叠和点开都只有固定文案。
const ANN_MARK = "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>";
const isAnn = m => m.role === "user" && !m.owner && (/^announce:v1:/i.test(String(m.idempotencyKey || "")) || textOf(m.content).includes(ANN_MARK));
const isHb = m => m.role === "user" && !m.owner && !isAnn(m) && HB_RE.test(textOf(m.content));
const isNoReply = m => m.role === "assistant" && !m.tools?.length && /^\s*(NO_REPLY|HEARTBEAT_OK)\s*$/.test(textOf(m.content));
function foldMsgs(ms, ctx) {
  const out = []; let tr = [], hb = null;
  const hbTurns = new Set(ms.filter(isHb).map(m => m.turnId).filter(t => t != null));
  const flushT = () => { if (tr.length > 1) out.push({ role: "_fold", _fold: "tools", id: tr[0].id, ts: tr[0].ts, ts2: tr[tr.length - 1].ts, tools: tr.flatMap(x => x.tools || []) }); else if (tr.length) out.push(tr[0]); tr = []; };
  const flushH = () => { if (hb) out.push({ role: "_fold", _fold: "hb", id: hb.id, ts: hb.ts, ts2: hb.polls[hb.polls.length - 1], polls: hb.polls }); hb = null; };
  for (const m of ms) {
    if (isAnn(m)) { flushT(); flushH(); out.push({ role: "_fold", _fold: "ann", id: m.id || m.ts, ts: m.ts, src: m }); continue; }
    if (isHb(m)) { flushT(); if (!hb) hb = { id: m.id || m.ts, ts: m.ts, polls: [] }; hb.polls.push(m.ts); continue; }
    if (hb && isNoReply(m) && hbTurns.has(m.turnId)) continue;
    const h = renderMsg(m, ctx, { first: true, last: true });
    if (!h) { out.push(m); continue; }
    if (h.startsWith('<div class="chainrow">')) { flushH(); tr.push(m); continue; }
    flushT(); flushH(); out.push(m);
  }
  flushT(); flushH(); return out;
}

// 打码：密码 / 密钥 / token / secret / apikey / Authorization / Bearer / sk- 开头等。只用于「查看原文」的显示，纯函数、不记录、不上传。
const MASK = "••••••";
const SECRET_KEY = "pass(?:word|wd)?|pwd|secret|token|api[-_ ]?key|apikey|access[-_ ]?key|private[-_ ]?key|client[-_ ]?secret|credential|authorization|cookie|session[-_ ]?id|密码|密钥|口令|令牌";
function maskSecrets(t) {
  let s = String(t ?? "");
  s = s.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "［已打码的私钥］");
  s = s.replace(/\b(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+)?[^\s,;"'&}]+/gi, (_, a) => a + MASK);
  s = s.replace(/\b(bearer\s+)[A-Za-z0-9._~+\/=-]{6,}/gi, (_, a) => a + MASK);
  s = s.replace(new RegExp(`(["']?(?:[\\w.-]*?(?:${SECRET_KEY})[\\w.-]*)["']?\\s*[:=：]\\s*)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;"'&}\\]]+)`, "gi"), (_, a, v) => a + (v[0] === '"' || v[0] === "'" ? v[0] + MASK + v[0] : MASK));
  s = s.replace(new RegExp(`(--[\\w-]*(?:${SECRET_KEY})[\\w-]*[ =])("[^"\\n]*"|'[^'\\n]*'|\\S+)`, "gi"), (_, a) => a + MASK);
  s = s.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, "sk-" + MASK);
  s = s.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g, MASK);
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, MASK);
  s = s.replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/g, MASK);
  return s;
}
const ANN_MAX = 6000;
const annText = m => { const r = scrub(maskSecrets(textOf(m.content))); return r.length > ANN_MAX ? r.slice(0, ANN_MAX) + "\n…（内容很长，只显示前 " + ANN_MAX + " 字）" : r; };
const foldTimes = (a, b) => { const x = toMs(a), y = toMs(b); if (!x) return ""; const same = !y || new Date(x).toDateString() === new Date(y).toDateString(); return (DAY(x) === "今天" ? "" : DAY(x) + " ") + HM(x) + (y && HM(y) !== HM(x) ? "–" + (same ? "" : DAY(y) + " ") + HM(y) : ""); };
function foldHtml(m, ctx) {
  const t = foldTimes(m.ts, m.ts2);
  if (m._fold === "tools") return `<div class="chainrow">${chainHtml({ id: m.id + "~f", tools: m.tools }, ctx, true)}<span class="meta">${esc(t)}</span></div>`;
  const k = (m._fold === "ann" ? "a" : "h") + (m.id || m.ts);
  if (m._fold === "ann") {
    const on = !!ctx.revealK?.has(k);
    return `<div class="chainrow annrow"><details class="chain fold" data-k="${esc(k)}" ${on || ctx.openK.has(k) ? "open" : ""}><summary><span class="ch-ic">🔔</span><span class="ch-sum">一条内部通知</span></summary>${on ? `<div class="foldbody annraw"><div class="annnote">已把密码、密钥这类内容打码。只能在这里看，不能复制或引用。</div><div class="annbox" draggable="false">${esc(annText(m.src))}</div></div>` : `<div class="foldbody">内部内容已隐藏</div>`}</details>${on ? `<button type="button" class="btn rvl" data-unreveal="${esc(k)}">收起原文</button>` : `<button type="button" class="btn rvl" data-reveal="${esc(k)}">查看原文</button>`}<span class="meta">${esc(t)}</span></div>`;
  }
  const first = toMs(m.polls[0]);
  return `<div class="chainrow"><details class="chain fold" data-k="${esc(k)}" ${ctx.openK.has(k) ? "open" : ""}><summary><span class="ch-ic">💤</span><span class="ch-sum">保活 ${m.polls.length} 次</span></summary><div class="foldbody tchips">${m.polls.map(p => { const x = toMs(p); return `<span class="tchip">${x ? esc((new Date(x).toDateString() === new Date(first).toDateString() ? "" : DAY(x) + " ") + HM(x)) : "—"}</span>`; }).join("")}</div></details><span class="meta">${esc(t)}</span></div>`;
}
function renderList(ms, ctx) {
  let out = "", prev = null, open = false;
  ctx.trig = new Map(); for (const m of ms) if ((m.role === "user" || m.role === "system") && m.turnId != null && !ctx.trig.has(m.turnId) && toMs(m.ts) != null) ctx.trig.set(m.turnId, toMs(m.ts));
  ms = foldMsgs(ms, ctx);
  const close = () => { if (open) { out += "</section>"; open = false; } };
  ms.forEach((m, i) => {
    const html0 = renderMsg(m, ctx, { first: true, last: true }); if (!html0) return;
    if (html0.startsWith('<div class="chainrow">')) { close(); out += html0; if (prev) prev.k = "~"; return; }
    const ts = toMs(m.ts); let sep = "";
    if (ts && (!prev || new Date(ts).toDateString() !== new Date(prev.ts).toDateString())) sep = `<div class="dsep"><span>${DAY(ts)}</span></div>`;
    else if (ts && prev && ts - prev.ts > 20 * 60e3) sep = `<div class="dsep t"><span>${HM(ts)}</span></div>`;
    const same = prev && !sep && prev.k === gkey(m) && ts - prev.ts <= 3 * 60e3;
    if (!same) close();
    out += sep;
    let nx = null; for (let j = i + 1; j < ms.length; j++) { const h = renderMsg(ms[j], ctx, { first: true, last: true }); if (h) { nx = h.startsWith('<div class="chainrow">') ? null : ms[j]; break; } }
    const nts = nx && toMs(nx.ts), last = !(nx && gkey(nx) === gkey(m) && nts - ts <= 3 * 60e3 && new Date(nts).toDateString() === new Date(ts).toDateString());
    if (!same) { out += `<section class="mg ${gkey(m).startsWith("me") ? "me" : gkey(m) === "bot" ? "bot" : "oth"}">`; open = true; }
    out += renderMsg(m, ctx, { first: !same, last });
    prev = { k: gkey(m), ts: ts || 0 };
  });
  close(); return out;
}
function renderMsg(m, ctx = { openK: new Set() }, pos = { first: true, last: true }) {
  if (m._fold) return foldHtml(m, ctx);
  const media = mediaOf(m);
  const t = textOf(m.content).replace(/^\s*-?\s*Attachment origins \(host metadata[^\n]*$/gim, "").replace(/^\[图片\]$/gm, media.some(x => x.kind === "image") ? "" : "[图片]");
  const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "tool";
  const hasTools = role === "assistant" && m.tools?.length;
  const atts = attHtml(m.attachments, true);
  if (!t.trim() && !media.length && !atts) return hasTools ? `<div class="chainrow">${chainHtml(m, ctx, true)}<span class="meta">${fmtTime(m.ts)}</span></div>` : "";
  const cost = costText(m, ctx), src = srcOf(m);
  const metaParts = role === "assistant" ? [m.model, cost] : role === "tool" ? [m.kind || m.role || "系统"] : [];
  const showMeta = role === "assistant" || pos.last, seen = new Set();
  const sid = senderId(m), spk = !pos.first ? "" : role === "user" && m.owner ? `<span class="speaker me">凛${src ? `<small>${src}</small>` : ""}</span>` : !ctx.group ? "" : role === "assistant" ? `<span class="speaker bot">星野のねこ</span>` : role === "user" ? `<button type="button" class="speaker" ${isOpenId(sid) ? `data-prof="${esc(sid)}"` : "disabled"} title="${esc(sid || "")}">${esc(senderLabel(m) || (m.owner ? "凛" : "未知发言人"))}</button>` : "";
  return spk + `<div class="msg ${role} ${pos.first ? "gf" : ""} ${pos.last ? "gl" : ""} ${role === "user" && !m.owner ? "other" : ""} ${m.isError ? "err" : ""} ${role === "tool" ? "" : "md"}">${hasTools ? chainHtml(m, ctx) : ""}${role === "tool" ? esc(t.slice(0, 2000)) : t.trim() ? grayPaths(md(t), seen) : ""}${renderMedia(media, seen)}${atts}${showMeta ? `<span class="meta">${metaParts.filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}<span class="tm">${HM(toMs(m.ts))}</span>${deliveryBadge(m, ctx)}</span>` : ""}</div>`;
}
function tuneSheet(sess, models, defaults) {
  const runtimes = [...new Set([sess.agentRuntime, ...models.map(m => m.runtime)].filter(Boolean))];
  const thinks = sess.thinkingOptions?.length ? sess.thinkingOptions : ["off", "minimal", "low", "medium", "high"];
  const thinkZh = { off: "关闭", minimal: "极少", low: "少量", medium: "适中", high: "深度", xhigh: "极深", adaptive: "自适应" };
  const curModel = sess.modelProvider && sess.model && !String(sess.model).includes("/") ? sess.modelProvider + "/" + sess.model : sess.model;
  sheet(`<h2>会话设置</h2><form id="tf">
    <label class="field"><span>模型</span><select class="select" name="model"><option value="">跟随默认${defaults?.model ? "（" + esc(defaults.model) + "）" : ""}</option>${models.map(m => { const id = m.provider ? `${m.provider}/${m.id}` : m.id; return `<option value="${esc(id)}" ${id === curModel || m.id === sess.model ? "selected" : ""} ${m.available === false ? "disabled" : ""}>${esc(m.alias || m.name || m.id)}${m.provider ? " · " + esc(m.provider) : ""}</option>`; }).join("")}</select></label>
    <label class="field"><span>运行时</span><select class="select" name="agentRuntime"><option value="">跟随默认</option>${runtimes.map(r => `<option ${r === sess.agentRuntime ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label>
    <label class="field"><span>思考强度</span><div class="seg" role="group">${thinks.map(t => `<button type="button" data-t="${esc(t)}" aria-pressed="${t === (sess.thinkingLevel || sess.thinkingDefault)}">${esc(thinkZh[t] || t)}</button>`).join("")}</div></label>
    <div style="display:flex;gap:10px;margin-top:20px"><button type="button" class="btn" data-close style="flex:1">取消</button><button class="btn primary" style="flex:2">保存</button></div></form>
    <label class="field" style="margin-top:18px"><span>分组</span><select class="select" id="mvg"><option value="">未分组</option>${GROUPS.map(g => `<option value="${esc(g.id)}" ${g.id === groupOf(sess) ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
    <div class="section" style="margin:24px 0 10px">会话操作</div>
    <div class="grid g3"><button class="btn" data-op="compact">压缩上下文</button><button class="btn" data-op="reset">重置会话</button><button class="btn danger" data-op="delete">${ic("trash")}删除会话</button></div>
    ${sess.chatType === "group" || qqTarget(sess.key)?.kind === "group" ? `<div class="grid g2" style="margin-top:10px"><a class="btn" href="#/interactions/${encodeURIComponent(sess.key)}" data-close>${ic("people")}互动统计</a><a class="btn" href="#/digest" data-close>${ic("digest")}群报设置</a></div>` : ""}`, (el, close) => {
    el.querySelectorAll("[data-op]").forEach(b => b.onclick = () => sessionOp(b.dataset.op, sess, close));
    el.querySelector("#mvg").onchange = e => moveToGroup(sess.key, e.target.value || null, () => { close(true); route(); });
    let think = sess.thinkingLevel || sess.thinkingDefault;
    el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { think = b.dataset.t; el.querySelectorAll("[data-t]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    el.querySelector("[data-close]").onclick = close;
    el.querySelector("#tf").onsubmit = async e => {
      e.preventDefault(); const f = e.target, patch = {};
      if (f.model.value !== (curModel || "")) patch.model = f.model.value || null;
      if (f.agentRuntime.value !== (sess.agentRuntime || "")) patch.agentRuntime = f.agentRuntime.value || null;
      if (think && think !== sess.thinkingLevel) patch.thinkingLevel = think;
      if (!Object.keys(patch).length) return close();
      try { await api.patch(sess.key, patch); toast("设置已保存 ✓"); close(true); route(); } catch (x) { toast(x.message); }
    };
  });
}

const CUR = { CNY: "¥", USD: "$", EUR: "€" };
const SUMZH = { Granted: "赠送", "Topped up": "充值", Balance: "余额", Used: "已用", Remaining: "剩余" };
const trSum = x => x.replace(/^(Granted|Topped up|Balance|Used|Remaining)/i, m => SUMZH[Object.keys(SUMZH).find(k => k.toLowerCase() === m.toLowerCase())] || m);
const winLabel = l => String(l || "用量").replace(/^(\d+)\s*h$/i, "$1 小时").replace(/^week(ly)?$/i, "本周").replace(/^month(ly)?$/i, "本月").replace(/^day|daily$/i, "今日");
// 统一的额度卡片：表头 / 主指标 / 进度条或基线 / 次要信息
// 线路状态卡片（API.md v2.4 补充 + v2.5，接口 /api/link）。规则：不显示任何流量；连接数含探测/回落、来源 IP 数都不是在线用户；可见文字里不出现敏感词
const scrub = t => String(t ?? "").replace(/hosino-wg-status|vpn|翻墙|代理|proxy|xray|wireguard|vless|reality|\bwg\b|wg-/gi, "线路");
function linkCard(d) {
  d = d || {}; const { xray: main = null, wg: bakArr, wireguard: bakOld } = d; const xr = main, cf = xr?.config || {}, svcs = Array.isArray(d.services) ? d.services : [];
  const has = v => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);
  // 备用线路：优先 v2.5 数组；没有就从旧字段的 interfaces 推出来
  const baks = Array.isArray(bakArr) ? bakArr : (bakOld?.interfaces || []).map(i => ({ name: i.name, port: i.listenPort, online: true, peerOnline: (i.peers || []).some(p => p.online) }));
  const bakName = (w, i) => { const s = `${w.name || ""} ${w.unit || ""}`.toLowerCase(); return "备用线路 " + (/\bla\b|-la\b|_la\b/.test(s) ? "LA" : /phone|mobile/.test(s) ? "手机" : String.fromCharCode(65 + i)); };
  const xOn = xr ? (xr.active === true || xr.active === "active" ? true : xr.active === false || /fail|dead|inactive/.test(xr.active || "") ? false : null) : null;
  const allDown = d.__fail || (!xr && !baks.length && !svcs.length);
  const bakBad = baks.some(w => w.online === false);
  const overall = allDown ? ["连不上", "bad"] : xOn === false ? ["主线路停了", "bad"] : bakBad ? ["部分异常", "warn"] : d.error ? ["部分数据缺失", "warn"] : ["运行中", "ok"];
  const errBox = d.error ? `<div class="link-err">⚠️ ${allDown ? "暂时拿不到线路状态" : "有一部分信息没取到"}：${esc(scrub(d.error))}</div>` : "";
  const head = sub => `<div class="link-h"><div class="avatar">🛡️</div><div class="grow"><b>线路状态</b><div class="faint" style="font-size:13px">${sub}</div></div>${pill(overall[0], overall[1], overall[1] === "ok")}</div>`;
  if (allDown) return `<div class="card link">${head("先别担心，可能只是查询超时，过一会儿会自动再看")}${errBox}</div>`;
  const up = s => { if (!has(s)) return null; const dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return dd ? `${dd} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`; };
  const kv = (k, v, mono) => has(v) ? `<dt>${k}</dt><dd${mono ? ' class="mono"' : ""}>${v}</dd>` : "";
  const list = a => Array.isArray(a) ? a.map(x => esc(scrub(typeof x === "object" ? x.tag || JSON.stringify(x) : x))).join("、") : esc(scrub(a));
  const port = xr?.port ?? cf.port;
  const mainHtml = xr ? `<div class="ln">
      <div class="ln-top"><span class="link-dot big ${xOn ? "on" : xOn === false ? "off" : ""}"></span><div class="grow"><b>主线路</b><div class="faint" style="font-size:12.5px">${[xOn ? "运行中" : xOn === false ? "没在运行" : "状态未知", xr.sub && xr.sub !== "running" ? xr.sub : "", has(port) ? "端口 " + port : "", xr.version ? "v" + String(xr.version).replace(/^v/i, "") : ""].filter(Boolean).map(esc).join(" · ")}</div></div></div>
      <div class="grid g2 ln-stats">
        <div class="link-m"><h3>当前连接（含探测）</h3><div class="big tnum">${xr.connections ?? "—"}<small> 条</small></div><div class="faint" style="font-size:12px">${esc(xr.note || "连接数含探测/回落，不等于用户数")}</div></div>
        <div class="link-m"><h3>不同来源 IP（含探测）</h3><div class="big tnum">${xr.uniqueClients ?? "—"}<small> 个</small></div><div class="faint" style="font-size:12px">只是来源地址的数量，不等于在线人数</div></div>
      </div>
      <dl class="kv ln-kv">${kv("已运行", up(xr.uptimeSec))}${kv("重启次数", has(xr.restarts) ? xr.restarts + " 次" : null)}${kv("内存", has(xr.memoryBytes) ? bytes(xr.memoryBytes) : null)}${kv("CPU 累计", has(xr.cpuSec) ? (xr.cpuSec < 60 ? xr.cpuSec.toFixed(1) + " 秒" : (xr.cpuSec / 60).toFixed(1) + " 分钟") : null)}${kv("启动于", xr.since ? esc(fmtTime(xr.since)) : null)}${kv("监听", has(xr.listening) ? list(xr.listening) : null, 1)}</dl>
      ${Object.keys(cf).length ? `<div class="ln-cfg"><div class="ln-cfg-h">配置</div><div class="ln-tags">${[has(cf.protocol) && "协议已配置", has(cf.network) && "传输 " + String(cf.network).toUpperCase(), has(cf.security) && "加密握手已启用"].filter(Boolean).map(t => `<span class="ln-tag">${esc(scrub(t))}</span>`).join("")}</div>
        <dl class="kv ln-kv">${kv("伪装域名", has(cf.serverNames) ? list(cf.serverNames) : null, 1)}${kv("回落目标", has(cf.target) ? esc(scrub(cf.target)) : null, 1)}${kv("客户端", has(cf.clients) ? (Array.isArray(cf.clients) ? cf.clients.length : cf.clients) + " 个" : null)}${kv("流控", has(cf.flows) ? (Array.isArray(cf.flows) ? cf.flows.length : 1) + " 种" : null)}${kv("shortId", has(cf.shortIdCount) ? cf.shortIdCount + " 个" : null)}${kv("出站", has(cf.outbounds) ? list(cf.outbounds) : null, 1)}${kv("路由规则", has(cf.routingRules) ? (Array.isArray(cf.routingRules) ? cf.routingRules.length : cf.routingRules) + " 条" : null)}${kv("日志级别", has(cf.logLevel) ? esc(scrub(cf.logLevel)) : null, 1)}${kv("统计 API", cf.statsApi === true ? "开" : cf.statsApi === false ? "关" : null)}</dl></div>` : ""}
    </div>` : `<div class="link-m"><h3>主线路</h3><div class="big">—</div><div class="faint" style="font-size:12.5px">这次没取到主线路的数据</div></div>`;
  const bakHtml = baks.length ? `<div class="bak-row"><span class="faint" style="font-size:12.5px">备用线路</span>${baks.map((w, i) => { const st = w.online === false ? ["off", "离线"] : w.peerOnline ? ["on", "在线"] : w.online ? ["idle", "在线 · 暂无设备握手"] : ["", "未知"]; return `<span class="bak-chip" title="${esc(bakName(w, i) + (w.port ? " · 端口 " + w.port : ""))}"><span class="link-dot ${st[0]}"></span>${esc(bakName(w, i).replace("备用线路 ", ""))}<span class="faint">${st[1]}</span></span>`; }).join("")}</div>` : "";
  return `<div class="card link">${head(d.ts ? "更新于 " + fmtTime(d.ts) : "线路状态")}${mainHtml}${bakHtml}${errBox}</div>`;
}
function usageCard(p) {
  const name = p.displayName || p.provider || p.id;
  const wins = (p.windows || []).filter(w => (w.usedPercent ?? w.percent) != null).sort((a, b) => +(b.usedPercent ?? b.percent) - +(a.usedPercent ?? a.percent));
  const fp = v => v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
  const bal = (p.billing || []).find(b => b.type === "balance");
  const parts = (p.summary || "").split("·").map(x => x.trim()).filter(Boolean);
  let tag, metric, bar, sub, extra = "", cls = "";
  if (wins.length) {
    const w = wins[0], used = +(w.usedPercent ?? w.percent);
    tag = pill(winLabel(w.label || w.window), barCls(used) === "bad" ? "bad" : barCls(used) === "warn" ? "warn" : "ac");
    metric = `<div class="big tnum">${fp(used)}<small>% 已用</small></div>`;
    bar = `<div class="bar ${barCls(used)}"><i style="width:${Math.min(100, used)}%"></i></div>`;
    sub = [w.resetAt ? `${until(w.resetAt)}重置` : "", p.summary ? `<span class="uc-sum">${esc(p.summary)}</span>` : ""].filter(Boolean).join("<br>") || "用量窗口";
    extra = wins.slice(1).map(x => { const u2 = +(x.usedPercent ?? x.percent); return `<div class="uc-mini"><span>${esc(winLabel(x.label || x.window))}</span><div class="bar thin ${barCls(u2)}"><i style="width:${Math.min(100, u2)}%"></i></div><b class="tnum">${fp(u2)}%</b>${x.resetAt ? `<i class="uc-rs">${until(x.resetAt)}重置</i>` : ""}</div>`; }).join("");
  } else if (bal) {
    const amt = +bal.amount || 0, sym = CUR[bal.unit] || "", empty = amt <= 0;
    cls = empty ? "uc-empty" : "";
    tag = pill(empty ? "余额已用完" : "余额", empty ? "" : "ok");
    metric = `<div class="big tnum">${sym ? `<span class="uc-sym">${esc(sym)}</span>` : ""}${esc(amt.toFixed(2))}<small>${sym ? esc(bal.unit) : esc(bal.unit || "")}</small></div>`;
    bar = `<div class="uc-base"></div>`;
    const rest = parts.filter(x => !/^balance/i.test(x)).map(trSum);
    sub = empty ? (rest.length ? rest.map(esc).join(" · ") + " · " : "") + "需要时记得去充值哦" : rest.length ? rest.map(esc).join(" · ") : "按量计费";
  } else {
    cls = "uc-empty"; tag = pill("未知");
    metric = `<div class="big">—</div>`; bar = `<div class="uc-base"></div>`;
    sub = p.summary ? esc(p.summary) : "暂无额度信息";
  }
  return `<div class="card uc ${cls}"><div class="uc-head"><b>${esc(name)}</b>${p.plan && String(p.plan).toLowerCase() !== String(name).toLowerCase() ? pill(p.plan) : ""}${tag}</div>${metric}${bar}<div class="uc-sub">${sub}</div>${extra}${p.error ? `<div class="uc-sub" style="color:var(--bad)">${esc(p.error)}</div>` : ""}</div>`;
}
VIEWS.models = async v => {
  const [m, u] = await Promise.all([api.models(), api.usage().catch(e => ({ __err: e.message }))]);
  const providers = asArr(u?.providers ?? u?.usage ?? u);
  const usageHtml = u?.__err ? `<div class="card muted">用量暂时取不到：${esc(u.__err)}</div>` : providers.length && providers.some(p => p.provider || p.displayName) ? `<div class="grid g2 g3w">${providers.map(usageCard).join("")}</div>` : `<div class="tree list"><details><summary>原始用量数据</summary>${jsonView(u)}</details></div>`;
  const groups = {}; for (const x of m.models || []) (groups[x.provider || "其他"] ||= []).push(x);
  paint(v, top("模型与用量", `可用模型 ${(m.models || []).filter(x => x.available !== false).length} 个`) + `<div class="section">额度</div>${usageHtml}` +
    Object.entries(groups).map(([g, xs]) => `<div class="section">${esc(g)}</div><div class="list">${xs.map(x => `<div class="row"><div class="grow"><div class="t">${esc(x.alias || x.name || x.id)}</div><div class="d mono">${esc(x.id)}${x.contextWindow ? " · 上下文 " + num(x.contextWindow) : ""}${x.runtime ? " · " + esc(x.runtime) : ""}</div></div><div class="r">${x.reasoning ? pill("推理", "ac") : ""} ${x.available === false ? pill("不可用", "warn") : ""}</div></div>`).join("")}</div>`).join("") + `<div id="cost"></div><div id="auth"></div>`);
  costSection($("#cost", v)); authSection($("#auth", v));
};

VIEWS.channels = async v => {
  const c = await api.channels();
  const chans = asArr(c.channels ?? c);
  const accounts = c.channelAccounts || {}, labels = c.channelLabels || {};
  paint(v, top("渠道", "消息从这些地方进出") + (chans.length ? `<div class="grid g2">${chans.map(ch => {
    const [t, cls] = stateOf(ch); const accs = asArr(accounts[ch.id]);
    return `<div class="card"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><div class="avatar">${esc((labels[ch.id] || ch.label || ch.id || "?")[0].toUpperCase())}</div><div style="flex:1"><b>${esc(labels[ch.id] || ch.label || ch.id)}</b><div class="faint" style="font-size:12.5px">${ch.configured === false ? "尚未配置" : ch.lastInboundAt ? "最近收信 " + ago(ch.lastInboundAt) : ch.lastConnectedAt ? ago(ch.lastConnectedAt) + "连上" : "已配置"}</div></div>${pill(t, cls, cls === "ok")}</div>
      ${ch.lastError ? `<div class="pill bad" style="white-space:normal">${esc(ch.lastError)}</div>` : ""}
      ${accs.length ? `<dl class="kv" style="margin-top:8px">${accs.map(a => `<dt>${esc(a.name || a.accountId || a.id)}</dt><dd>${esc(stateOf(a)[0])}</dd>`).join("")}</dl>` : ""}</div>`;
  }).join("")}</div>` : "") + `<div class="section">详细数据</div><div class="tree list"><details><summary>原始状态</summary>${jsonView(c)}</details></div>`);
};

VIEWS.plugins = async v => {
  const [p, s] = await Promise.all([api.plugins(), api.skills().catch(() => null)]);
  const skills = asArr(s?.skills ?? s);
  let tab = "plugins", q = "";
  const root = paint(v, top("插件与技能") + `<div class="toolbar"><div class="seg"><button data-tab="plugins" aria-pressed="true">插件 ${p.plugins.length}</button><button data-tab="skills" aria-pressed="false">技能 ${skills.length}</button></div><div class="search" style="flex:1;min-width:180px">${ic("search")}<input class="input" placeholder="搜一搜" aria-label="搜索"></div></div><div id="pl"></div>`);
  const draw = () => {
    const f = x => !q || JSON.stringify([x.name, x.id, x.description]).toLowerCase().includes(q);
    $("#pl", root).innerHTML = tab === "plugins"
      ? `<div class="list">${p.plugins.filter(f).map(x => `<div class="row"><div class="grow"><div class="t">${esc(x.name || x.id)} <span class="faint mono">${esc(x.version || "")}</span></div><div class="d">${esc(x.description || x.origin || "")}</div></div><div class="r">${x.enabled ? pill(x.runtime === "error" || x.state === "error" ? "出错" : "已启用", x.runtime === "error" || x.state === "error" ? "bad" : "ok") : pill("已停用")}</div></div>`).join("") || `<div class="empty">没有找到</div>`}</div>`
      : `<div class="list">${skills.filter(f).map(x => { const on = x.eligible !== false && !x.disabled; return `<button class="row" data-skill="${esc(x.name || x.id)}"><div class="grow"><div class="t">${x.pinned ? "📌 " : ""}${x.emoji ? esc(x.emoji) + " " : ""}${esc(x.name || x.id)}</div><div class="d">${esc(x.description || x.source || "")}</div></div><div class="r">${pill(x.disabled ? "已停用" : on ? "可用" : "缺依赖", x.disabled ? "" : on ? "ok" : "warn")}</div></button>`; }).join("") || `<div class="empty">没有找到</div>`}</div>`;
  };
  root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; root.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
  $("input", root).oninput = e => { q = e.target.value.toLowerCase().trim(); draw(); };
  root.addEventListener("click", e => { const b = e.target.closest("[data-skill]"); if (b) skillSheet(b.dataset.skill, skills.find(x => (x.name || x.id) === b.dataset.skill)); });
  draw();
};

VIEWS.cron = async v => {
  const [c, o] = await Promise.all([api.cron(), api.overview().catch(() => null)]);
  const jobs = asArr(c.jobs ?? c);
  const hbs = o?.status?.heartbeat; const hb = hbs?.agents?.find(a => a.agentId === hbs.defaultAgentId) || hbs?.agents?.[0];
  const hbJob = jobs.find(j => j.declarationKey === "heartbeat:" + (hb?.agentId || "main") || j.payload?.kind === "heartbeat");
  if (hb && hbJob) { hb.lastRunAt = hbJob.state?.lastRunAtMs ?? hbJob.lastRunAtMs; hb.nextRunAt = hbJob.state?.nextRunAtMs; }
  const sched = s => !s ? "" : typeof s === "string" ? s : s.kind === "cron" || s.expr ? `cron ${s.expr}${s.tz ? " (" + s.tz + ")" : ""}` : s.everyMs ? `每 ${dur(s.everyMs / 1000)}` : s.at || s.atMs ? `单次 · ${fmtTime(s.at || s.atMs)}` : JSON.stringify(s);
  const root = paint(v, top("定时任务", `${jobs.length} 个任务`, `<button class="iconbtn" data-x="newcron" aria-label="新建任务">${ic("plus")}</button>`) +
    `<div class="section">心跳</div><div class="card">${hb ? `<div style="display:flex;align-items:center;gap:12px"><div class="avatar">💓</div><div style="flex:1"><b>定时心跳${hbs.agents.length > 1 ? " · " + esc(hb.agentId) : ""}</b><div class="faint" style="font-size:13px">${esc(hb.everyMs ? "每 " + dur(hb.everyMs / 1000) : hb.every ? "每 " + hb.every : "")}${hb.lastRunAt ? " · 上次 " + ago(hb.lastRunAt) : ""}${hb.nextRunAt ? " · 下次 " + until(hb.nextRunAt) : ""}</div></div>${pill(hb.enabled === false ? "已关闭" : "运行中", hb.enabled === false ? "" : "ok", hb.enabled !== false)}</div>` : `<div class="muted">没有拿到心跳信息</div>`}</div>
    <div class="section">任务</div>` + (jobs.length ? `<div class="list">${jobs.map(j => { const st = j.state || {}; const last = st.lastStatus || st.lastRunStatus || j.lastRunStatus; return `<button class="row" data-job="${esc(j.id)}"><div class="grow"><div class="t">${esc(j.displayName || j.name || j.id)}</div><div class="d mono">${esc(sched(j.schedule))}</div><div class="d">${st.nextRunAtMs ? "下次 " + until(st.nextRunAtMs) : ""}${st.lastRunAtMs ? " · 上次 " + ago(st.lastRunAtMs) : ""}</div></div><div class="r">${j.enabled === false ? pill("已停用") : last === "error" ? pill("上次失败", "bad") : pill("已启用", "ok")}</div></button>`; }).join("")}</div>` : `<div class="card empty"><b>⏰</b>还没有定时任务</div>`));
  root.addEventListener("click", e => { const b = e.target.closest("[data-job]"); if (b) cronSheet(jobs.find(j => String(j.id) === b.dataset.job), sched); if (e.target.closest("[data-x=newcron]")) cronEdit(null); });
};

VIEWS.logs = async v => {
  let lv = localStorage.getItem("hs-lv") || "ALL", q = "", data = await api.logs(300, lv === "ALL" || lv === "DEBUG" ? undefined : lv);
  const LV = [["ALL", "全部"], ["ERROR", "错误"], ["WARN", "警告"], ["INFO", "信息"], ["DEBUG", "调试"]];
  const rank = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };
  const root = paint(v, top("日志", data.file || "", `<button class="iconbtn" data-x="rf" aria-label="刷新">${ic("refresh")}</button>`) + `<div class="toolbar"><div class="seg">${LV.map(([k, t]) => `<button data-lv="${k}" aria-pressed="${k === lv}">${t}</button>`).join("")}</div><div class="search" style="flex:1;min-width:180px">${ic("search")}<input class="input" placeholder="筛选关键字" aria-label="筛选"></div><label class="tg muted" style="display:flex;gap:8px;align-items:center;font-size:13px"><span class="switch"><input type="checkbox" id="live" checked><i></i></span>实时</label></div><div class="logs" id="lg"></div>`);
  const draw = () => {
    const min = lv === "ALL" ? -1 : rank[lv];
    const rows = data.lines.filter(l => (min < 0 || (lv === "DEBUG" ? rank[l.lv] <= 1 : (rank[l.lv] ?? 2) >= min)) && (!q || (l.msg + l.sub).toLowerCase().includes(q))).slice(-400);
    const lg = $("#lg", root), stick = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 60;
    lg.innerHTML = rows.length ? rows.map(l => `<div class="log"><span class="tm faint">${esc(fmtTime(l.t))}</span><span class="lv ${esc(l.lv || "")}">${esc(l.lv || "—")}</span><span class="msgt">${l.sub ? `<span class="faint">[${esc(l.sub)}]</span> ` : ""}${esc(l.msg)}</span></div>`).join("") : `<div class="empty">这个级别下暂时没有日志</div>`;
    if (stick || !lg.dataset.i) lg.scrollTop = lg.scrollHeight; lg.dataset.i = 1;
  };
  root.querySelectorAll("[data-lv]").forEach(b => b.onclick = () => { lv = b.dataset.lv; localStorage.setItem("hs-lv", lv); root.querySelectorAll("[data-lv]").forEach(x => x.setAttribute("aria-pressed", x === b)); refresh().catch(e => toast(e.message)); });
  $("input", root).oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  const refresh = async () => { data = await api.logs(300, lv === "ALL" || lv === "DEBUG" ? undefined : lv); draw(); };
  root.querySelector("[data-x=rf]").onclick = () => refresh().then(() => toast("已刷新")).catch(e => toast(e.message));
  viewInterval(v, () => $("#live", root)?.checked && refresh().catch(() => {}), 5000);
  draw();
};

// ---------- v2.8 记忆管理 ----------
const MEM_TABS = [["", "按人看"], ["flags", "记错的"], ["files", "记忆文件"], ["backups", "删除备份"]];
const SUBJ_T = { person: "人", group: "群", name: "名字", unknown: "说不清", unattributed: "共享库" };
const ATTR_T = { user_id: "按用户 ID", source: "按来源会话", prefix: "按前缀", group: "按群", none: "没法归属" };
// 共享库名 + 主体名缓存（来自 /api/mem/subjects），用于把 subjects[] 的 key 解析成名字
const MEMCTX = { bucket: null, names: {} };
const memCtx = async () => { try { const d = await api.memSubjects(); MEMCTX.bucket = d.bucket ?? null; for (const s of d.subjects || []) MEMCTX.names[s.key] = s.name; return d; } catch { return {}; } };
const subjName = k => k === "unattributed" ? "未归属（共享库）" : aliasFor(k) || MEMCTX.names[k] || shortId(k);
const subjNames = m => (m.subjects || []).map(s => typeof s === "string" ? subjName(s) : s.key === "unattributed" ? "未归属（共享库）" : aliasFor(s.key) || MEMCTX.names[s.key] || s.name || shortId(s.key)).filter(Boolean);
const uidTxt = u => MEMCTX.bucket != null && u === MEMCTX.bucket ? `共享库标签：${u}` : aliasFor(u) || shortId(u);
const attrTag = m => m.attrSrc ? `<span class="pill attr">${esc(ATTR_T[m.attrSrc] || m.attrSrc)}</span>${m.attrInferred ? ` <span class="pill warn">推断${m.inferredName ? "：" + esc(m.inferredName) : ""}</span>` : ""}` : "";
const attrCounts = a => a ? Object.entries(ATTR_T).filter(([k]) => a[k]).map(([k, t]) => `${t.replace("按", "")} ${a[k]}`).join(" · ") : "";
const memText = m => m.data ?? "";
const memWhen = m => m.createdAt;
const memTabs = cur => `<div class="toolbar"><div class="seg stk-tabs" role="tablist">${MEM_TABS.map(([k, t]) => `<a role="tab" href="#/memory${k ? "/" + k : ""}" aria-pressed="${k === cur}">${t}</a>`).join("")}</div></div>`;
function memRow(m) {
  const w = memWhen(m);
  return `<button type="button" class="row mem-row ${m.flag?.wrong ? "wrong" : ""}" data-mem="${esc(m.id)}"><div class="grow"><div class="mem-t">${esc(memText(m))}</div><div class="d">${m.flag?.wrong ? `<span class="pill bad">记错了</span> ` : ""}${attrTag(m)}${m.attrSrc ? " " : ""}${w ? fmtTime(w) : ""}${subjNames(m).length ? " · 关于 " + esc(subjNames(m).join("、")) : m.user_id ? " · " + esc(uidTxt(m.user_id)) : ""}</div></div><span class="faint">›</span></button>`;
}
VIEWS.memory = async (v, sub) => {
  const [kind, ...rest] = (sub || "").split("/"); const arg = rest.join("/");
  if (kind === "s") return memSubject(v, arg);
  if (kind === "flags") return memFlagged(v);
  if (kind === "files") return memFilesView(v, arg);
  if (kind === "backups") return memBackupsView(v);
  const d = await memCtx(); await loadAliases();
  const ss = (d.subjects || []).slice().sort((a, b) => (a.key === "unattributed") - (b.key === "unattributed") || (b.lastAt || 0) - (a.lastAt || 0));
  const root = paint(v, top("记忆", d.collection ? `${ss.reduce((a, s) => a + (s.count || 0), 0)} 条` : "") + memTabs("") + `
    <div class="faint fs" style="margin:0 0 10px">星野のねこ记得的事，按“关于谁”分好了。同一个人的不同写法已经合并在一起。${d.bucket ? `<br>「${esc(d.bucket)}」是共享记忆库的名字，不代表某个人；只写着这个名字的记忆会放进「未归属」。` : ""}</div>
    <div class="search" style="margin-bottom:12px">${ic("search")}<input class="input" type="search" id="sq" placeholder="找人或群…" aria-label="找人或群"></div>
    <div id="sl"></div>`);
  const draw = () => { const q = $("#sq", root).value.trim().toLowerCase(); const l = ss.filter(s => !q || [s.name, s.key, aliasFor(s.key)].some(x => String(x || "").toLowerCase().includes(q)));
    const una = l.filter(s => s.key === "unattributed"), rest = l.filter(s => s.key !== "unattributed");
    const rowOf = s => { const un = s.key === "unattributed"; const nm = un ? "未归属（共享库）" : aliasFor(s.key) || s.name || shortId(s.key); const ac = attrCounts(s.attr); return `<a class="row${un ? " mem-una" : ""}" href="#/memory/s/${encodeURIComponent(s.key)}"><div class="avatar">${un ? "📦" : esc([...nm][0] || "?")}</div><div class="grow"><div class="t">${esc(nm)} <span class="faint fs" style="font-weight:400">${SUBJ_T[s.type] || ""}</span></div><div class="d">${s.count ?? 0} 条${s.flagged ? ` · <span style="color:var(--bad)">${s.flagged} 条记错</span>` : ""}${s.lastAt ? " · 最近 " + ago(s.lastAt) : ""}</div>${ac ? `<div class="d faint mem-ac">${esc(ac)}</div>` : ""}</div><span class="faint">›</span></a>`; };
    $("#sl", root).innerHTML = l.length ? (rest.length ? `<div class="list">${rest.map(rowOf).join("")}</div>` : "") + (una.length ? `<div class="faint fs" style="margin:16px 0 6px">认不出是谁的</div><div class="list">${una.map(rowOf).join("")}</div>` : "") : `<div class="card empty"><b>🧠</b>${q ? "没找到" : "还没有记忆"}</div>`; };
  $("#sq", root).oninput = draw; draw();
};
async function memListPage(v, title, sub, tab, opts, intro = "") {
  let off = 0, q = "", items = [], total = 0, seq = 0;
  const root = paint(v, top("记忆", sub, tab == null ? `<a class="iconbtn" href="#/memory" aria-label="返回">${ic("back")}</a>` : "") + (tab != null ? memTabs(tab) : "") + intro + `
    <div class="search" style="margin-bottom:10px">${ic("search")}<input class="input" type="search" id="mq" placeholder="在${esc(title)}里找…" aria-label="搜索记忆"></div>
    <div class="faint fs" id="mc" style="margin-bottom:8px"></div><div id="ml"></div><button class="btn" id="mm" hidden style="margin-top:10px;width:100%">再看 50 条</button>`);
  const load = async more => { const my = ++seq; const d = await api.memList({ ...opts, q, offset: off }); if (my !== seq) return; total = d.total ?? 0; items = more ? items.concat(d.items || []) : d.items || [];
    $("#mc", root).textContent = q ? `找到 ${total} 条` : `共 ${total} 条`; $("#ml", root).innerHTML = items.length ? `<div class="list">${items.map(memRow).join("")}</div>` : `<div class="card empty">${q ? "没找到相关的记忆" : opts.flagged ? "没有标记为记错的记忆 🎉" : "这里还没有记忆"}</div>`; $("#mm", root).hidden = items.length >= total; };
  let t; $("#mq", root).oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); off = 0; load(); }, 280); };
  $("#mm", root).onclick = () => { off += 50; load(true); };
  root.addEventListener("click", e => { const b = e.target.closest("[data-mem]"); if (b) memSheet(b.dataset.mem, () => { off = 0; load(); }); });
  await load();
}
async function memSubject(v, key) {
  const s = (await memCtx()).subjects?.find(x => x.key === key);
  const nm = key === "unattributed" ? "未归属（共享库）" : aliasFor(key) || s?.name || shortId(key);
  const ac = attrCounts(s?.attr);
  const intro0 = (key === "unattributed" ? `<div class="faint fs" style="margin:0 0 10px">这些记忆没写清是谁说的、也看不出来自哪个会话，所以先放在共享库里。</div>` : "") + (ac ? `<div class="faint fs" style="margin:0 0 10px">归属方式：${esc(ac)}</div>` : "");
  const raw = s?.raw; const rawTxt = raw ? Object.entries(raw).filter(([, a]) => a?.length).map(([k, a]) => `<dt class="mono">${esc(k)}</dt><dd class="mono">${a.map(esc).join("<br>")}</dd>`).join("") : "";
  return memListPage(v, nm, nm, null, { subject: key }, intro0 + (rawTxt ? `<details class="quiet" style="margin:0 0 12px"><summary>原始写法（已合并）</summary><dl class="kv" style="margin-top:8px;font-size:12.5px">${rawTxt}</dl></details>` : ""));
}
async function memFlagged(v) {
  await memCtx();
  const d = await api.memFlags(); const fl = Object.entries(d.flags || {}).filter(([, f]) => f?.wrong).sort(([, a], [, b]) => (b.at || 0) - (a.at || 0));
  const root = paint(v, top("记忆", "记错的") + memTabs("flags") + `<div class="faint fs" style="margin:0 0 10px">这里的标记只记在控制台，星野のねこ回忆时仍然会用到它们。真要她忘掉，请在详情里删除。</div><div class="faint fs" id="fc" style="margin-bottom:8px">共 ${fl.length} 条</div><div id="fl">${fl.length ? `<div class="skel" style="height:120px"></div>` : `<div class="card empty">没有标记为记错的记忆 🎉</div>`}</div>`);
  if (!fl.length) return;
  const out = new Array(fl.length); let i = 0;
  const worker = async () => { while (i < fl.length) { const k = i++; const [id, f] = fl[k]; try { out[k] = { ...(await api.memGet(id)), flag: f }; } catch (x) { out[k] = { id, flag: f, __err: x.status === 404 ? "这条记忆已经不在了" : "暂时读不到" }; } } };
  await Promise.all(Array.from({ length: Math.min(4, fl.length) }, worker));
  $("#fl", root).innerHTML = `<div class="list">${out.map(m => m.__err ? `<div class="row mem-row wrong"><div class="grow"><div class="mem-t mono" style="font-size:13px">${esc(m.id)}</div><div class="d"><span class="pill bad">记错了</span> ${esc(m.__err)}${m.flag.note ? " · " + esc(m.flag.note) : ""}</div></div></div>` : memRow(m).replace('</div></div><span class="faint">›</span>', `${m.flag.note ? `<div class="d">📝 ${esc(m.flag.note)}</div>` : ""}</div></div><span class="faint">›</span>`)).join("")}</div>`;
  root.addEventListener("click", e => { const b = e.target.closest("[data-mem]"); if (b) memSheet(b.dataset.mem, route); });
}
async function memSheet(id, after) {
  if (!Object.keys(MEMCTX.names).length) await memCtx();
  let m; try { m = await api.memGet(id); } catch (x) { return toast(x.status === 404 ? "这条记忆已经不在了" : x.message); }
  const subj = subjNames(m);
  const meta = ["createdAt", "user_id", "source_session_key", "source_openid_or_peer", "channel", "attributedTo"].filter(k => m[k] != null && m[k] !== "").map(k => [k, typeof m[k] === "object" ? JSON.stringify(m[k]) : m[k]]).map(([k, val]) => k === "user_id" && MEMCTX.bucket != null && val === MEMCTX.bucket ? ["bucket", val] : [k, val]);
  sheet(`<h2>这条记忆</h2><div class="mem-full ${m.flag?.wrong ? "wrong" : ""}">${esc(memText(m))}</div>
    ${m.flag?.wrong ? `<div class="link-err">已标记为记错${m.flag.note ? "：" + esc(m.flag.note) : ""}${m.flag.at ? " · " + fmtTime(m.flag.at) : ""}</div>` : ""}
    <dl class="kv" style="margin:12px 0;font-size:13px">${subj.length ? `<dt>关于</dt><dd>${subj.map(esc).join("、")}</dd>` : ""}${m.attrSrc ? `<dt>怎么认出来的</dt><dd>${attrTag(m)}${m.attrInferred ? `<div class="faint fs" style="margin-top:4px">是从记忆开头的名字猜的，不一定准。</div>` : ""}</dd>` : ""}${meta.map(([k, val]) => `<dt>${esc({ createdAt: "记下时间", bucket: "共享库标签", user_id: "用户", source_session_key: "来自会话", source_openid_or_peer: "来自", channel: "渠道", attributedTo: "归属" }[k] || k)}</dt><dd class="mono" style="overflow-wrap:anywhere">${esc(k === "createdAt" ? fmtTime(val) : val)}</dd>`).join("")}<dt>编号</dt><dd class="mono" style="overflow-wrap:anywhere">${esc(m.id)}</dd></dl>
    ${m.flag?.wrong ? `<button class="btn" data-x="unflag" style="width:100%">↩︎ 撤销「记错」标记</button>` : `<label class="field"><span>哪里记错了？<span class="faint fs">（可不填）</span></span><input class="input" id="fnote" maxlength="500" placeholder="比如：她不喝咖啡，是乌龙茶"></label><button class="btn" data-x="flag" style="width:100%">🏷️ 标记为记错</button>`}
    <div class="faint fs" style="margin:6px 0 14px">“记错”只是个标记，不会改动她的记忆。</div>
    <button class="btn danger" data-x="del" style="width:100%">${ic("trash")}删除这条记忆…</button>`, (el, close) => {
    el.querySelector("[data-x=flag]")?.addEventListener("click", async e => { e.target.disabled = true; if (await act(() => api.memFlag(id, true, el.querySelector("#fnote").value.trim()), "已标记为记错")) { close(true); after?.(); toastUndo(id, after); } else e.target.disabled = false; });
    el.querySelector("[data-x=unflag]")?.addEventListener("click", async () => { if (await act(() => api.memFlag(id, false, ""), "已撤销标记")) { close(true); after?.(); } });
    el.querySelector("[data-x=del]").onclick = async () => { if (await close()) memDeleteFlow(m, after); };
  });
}
function toastUndo(id, after) {
  const t = document.createElement("div"); t.className = "undo"; t.innerHTML = `<span>已标记为记错</span><button type="button">撤销</button>`; document.body.append(t);
  const kill = setTimeout(() => t.remove(), 6000);
  t.querySelector("button").onclick = async () => { clearTimeout(kill); t.remove(); if (await act(() => api.memFlag(id, false, ""), "已撤销")) after?.(); };
}
async function memDeleteFlow(m, after) {
  const reason = await promptSheet("为什么要删掉它？（建议写一句）", "", "比如：信息过时了 / 记错了");
  if (reason == null) return; const rs = reason.trim().slice(0, 300);
  let dr; try { dr = await api.memDelete(m.id, rs, true); } catch (x) { return toast(x.message); }
  const col = (await api.memSubjects().catch(() => ({}))).collection || "";
  const backup = dr.backup || `${col ? col + "__" : ""}${m.id}.json`;
  const n = typeof dr.entities === "number" ? dr.entities : Array.isArray(dr.entities) ? dr.entities.length : 0;
  if (!await confirmDialog({ title: "删除前先看看影响", body: `<div class="mem-quote">${esc(memText(m))}</div>
    <dl class="kv impact"><dt>会删掉</dt><dd>这 1 条记忆</dd><dt>会改动</dt><dd>影响 ${n} 条实体（把这条从它们的关联里去掉）</dd><dt>先备份为</dt><dd class="mono">${esc(backup)}</dd>${dr.backupExists ? `<dt></dt><dd class="faint">已有同名备份，旧的会改名为 .prev-&lt;时间&gt;.json 保留</dd>` : ""}<dt>备份大小</dt><dd>${dr.backupBytes != null ? bytes(dr.backupBytes) : "—"}${dr.vectorDims ? ` · 含 ${dr.vectorDims} 维向量` : ""}</dd><dt>原因</dt><dd>${rs ? esc(rs) : `<span class="faint">没写</span>`}</dd></dl>
    <div class="faint fs">这一步还什么都没动。备份会校验后才删除，之后可以在「删除备份」里恢复。</div>`, ok: "继续" })) return;
  if (!await confirmDialog({ title: "确定删除这条记忆？", body: `先备份，再从她的记忆里删掉。大约 30 秒后她就不会再想起这件事。`, ok: "备份并删除", danger: true })) return;
  try { const r = await api.memDelete(m.id, rs, false); toast(`已删除，备份为 ${r.backup || backup}${r.entitiesUpdated != null ? `，更新了 ${r.entitiesUpdated} 条实体` : ""}`); after?.(); }
  catch (x) { toast(x.message); }
}
async function memFilesView(v, file) {
  if (file) { let d; try { d = await api.memFile(file); } catch (x) { const msg = { 400: "文件名不太对", 403: "这个文件不让看", 404: "这个文件不在了", 413: "文件太大了（超过 512KB），这里放不下" }[x.status] || x.message; return paint(v, top("记忆", file, `<a class="iconbtn" href="#/memory/files" aria-label="返回">${ic("back")}</a>`) + `<div class="card empty"><b>📄</b>${esc(msg)}</div>`); } const txt = d.content ?? "";
    return paint(v, top("记忆", file, `<a class="iconbtn" href="#/memory/files" aria-label="返回">${ic("back")}</a>`) + `<article class="card md" style="overflow-wrap:anywhere">${/\.md$/i.test(file) ? md(txt) : `<pre class="code">${esc(txt)}</pre>`}</article>`); }
  const d = await api.memFiles(); const fs = (d.files || []).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  paint(v, top("记忆", "记忆文件") + memTabs("files") + `<div class="faint fs" style="margin:0 0 10px">${esc(d.root || "workspace/memory")} 里的文件，只能看。</div>` + (fs.length ? `<div class="list">${fs.map(f => { const n = f.file; return `<a class="row" href="#/memory/files/${encodeURIComponent(n)}"><span class="stk-s ph">📄</span><div class="grow"><div class="t mono" style="font-size:13.5px;overflow-wrap:anywhere">${esc(n)}</div><div class="d">${f.size != null ? bytes(f.size) : ""}${f.mtime ? " · " + fmtTime(f.mtime) : ""}</div></div><span class="faint">›</span></a>`; }).join("")}</div>` : `<div class="card empty">没有记忆文件</div>`));
}
async function memBackupsView(v) {
  await memCtx();
  const d = await api.memBackups(); const bs = d.backups || []; const rt = d.retention || {};
  const root = paint(v, top("记忆", "删除备份") + memTabs("backups") + `<div class="faint fs" style="margin:0 0 10px">删掉的记忆都先备份在这里，可以原样恢复。备份保留 ${rt.days ?? 90} 天、最多 ${rt.maxFiles ?? 500} 份，更早的会在下次删除时清掉。</div>` +
    (bs.length ? `<div class="list">${bs.map(b => b.error ? `<div class="row mem-bk"><span class="stk-s ph">⚠️</span><div class="grow"><div class="t">这份备份读不出来（${esc(b.error)}）</div><div class="d mono" style="font-size:11.5px;overflow-wrap:anywhere">${esc(b.file)}</div></div></div>` : `<div class="row mem-bk"><div class="grow"><div class="mem-t">${esc(b.preview || "")}</div><div class="d">${b.backedUpAt ? "删于 " + fmtTime(b.backedUpAt) : ""}${b.reason ? " · " + esc(b.reason) : ""}${b.user_id ? " · " + esc(uidTxt(b.user_id)) : ""}${b.entities ? ` · 影响 ${b.entities} 条实体` : ""}</div><div class="d mono" style="font-size:11.5px;overflow-wrap:anywhere">${esc(b.file)}</div></div>${b.restoredAt ? `<span class="pill ok">已恢复 · ${fmtTime(b.restoredAt)}</span>` : `<button class="btn sm" data-rs="${esc(b.file)}">恢复</button>`}</div>`).join("")}</div>` : `<div class="card empty"><b>🗂️</b>还没有删除过记忆</div>`));
  root.addEventListener("click", async e => { const b = e.target.closest("[data-rs]"); if (!b) return; const x = bs.find(y => y.file === b.dataset.rs);
    if (!await confirmDialog({ title: "恢复这条记忆？", body: `<div class="mem-quote">${esc(x?.preview || "")}</div>会按备份原样放回（不重新计算），并重新关联到 ${x?.entities ?? 0} 条实体。大约 30 秒后她就能想起来。`, ok: "恢复" })) return;
    b.disabled = true; try { const r = await api.memRestore(b.dataset.rs); toast(`已恢复${r?.entitiesRestored != null ? `，重新关联了 ${r.entitiesRestored} 条实体` : ""}`); route(); } catch (x2) { b.disabled = false; toast(x2.status === 400 ? "这条记忆还在，不用恢复" : x2.status === 409 ? "这份备份来自另一个记忆库，不能恢复到这里" : x2.message); } });
}

// ---------- v2.9 原生 CLI（无记忆、无人设；完整权限） ----------
const CLI_MAX = 32000;
const cliDenied = `<div class="card empty"><b>🔒</b>原生 CLI 只有主人能用，你的账号没有这个权限。</div>`;
const cliModels = t => (t?.models || []).map(m => typeof m === "string" ? { id: m, name: m } : { id: m.id ?? m.value ?? m.name, name: m.name || m.label || m.id, def0: !!(m.default || m.isDefault) }).filter(m => m.id).map((m, _, a) => ({ ...m, def: t.defaultModel ? m.id === t.defaultModel : m.def0 }));
// 快慢按模型 id 匹配（API.md v2.9.1 速度说明）
const cliSpeed = (tool, model) => tool !== "antigravity" ? null : /gpt-oss/i.test(model || "") ? { tag: "快 · 几秒", wait: "这个模型很快，通常几秒就好" } : { tag: "慢 · 约 20–120 秒", wait: "Antigravity 比较慢，这个模型一般要 20 秒到 2 分钟，请耐心等等" };
const cliWaitTxt = s => cliSpeed(s.tool, s.model || CLI_TOOLS?.find(t => t.id === s.tool)?.defaultModel)?.wait || (s.tool === "antigravity" ? "Antigravity 比较慢，一般要 1–2 分钟，请耐心等等" : "稍等一下，结果会一点点出来");
const CLI_TOOL_NM = { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI", antigravity: "Antigravity" };
let CLI_TOOLS = null;
const cliTools = async refresh => { try { const d = await api.cliTools(refresh); CLI_TOOLS = Array.isArray(d) ? d : d?.tools || []; } catch (e) { if (!CLI_TOOLS) CLI_TOOLS = []; if (refresh) toast(e.message); } return CLI_TOOLS; };
const cliToolNm = id => CLI_TOOLS?.find(t => t.id === id)?.name || CLI_TOOL_NM[id] || id;
const cliState = t => !t.available ? ["不可用", "bad"] : t.authed === false ? ["未登录", "warn"] : ["可用", "ok"];
const cliWarn = `<div class="cli-warn" role="alert">⚠️ <b>完整权限 · 可执行服务器命令</b><span>这里没有记忆和人设，指令会直接在服务器上运行，请看清再发。</span></div>`;
const cliStr = x => x == null ? "" : typeof x === "string" ? x : JSON.stringify(x, null, 2);
function cliMsg(m) {
  if (m.role === "user") return `<div class="msg user cli-u"><div class="who">你</div>${m.text ? `<div class="body">${esc(m.text)}</div>` : ""}${attHtml(m.attachments)}</div>`;
  if (m.role === "tool") { const out = cliStr(m.output); return `<details class="cli-tool"><summary>🔧 <b>${esc(m.name || "工具")}</b> <span class="faint">${esc(cliStr(m.input).replace(/\s+/g, " ").slice(0, 80))}</span></summary>${!m.input && !out ? `<div class="faint fs">（没有输入和输出）</div>` : ""}${m.input ? `<div class="faint fs">输入</div><pre>${esc(cliStr(m.input))}</pre>` : ""}${out ? `<div class="faint fs">输出</div><pre>${esc(out)}</pre>` : ""}</details>`; }
  if (m.role === "error") return `<div class="cli-err">${esc(m.text || "出错了")}</div>`;
  return `<div class="msg assistant md cli-a">${md(m.text || "")}</div>`;
}
function cliNewSheet(after) {
  const draw = (el, tools) => { el.querySelector("#ct").innerHTML = tools.length ? tools.map(t => { const [st, cls] = cliState(t); const ok = t.available && t.authed !== false; return `<button type="button" class="row cli-pick" data-tool="${esc(t.id)}" ${ok ? "" : "disabled aria-disabled=\"true\""}><div class="grow"><div class="t">${esc(t.name || cliToolNm(t.id))} <span class="faint fs">${esc(t.version || "")}</span></div>${!ok && t.reason ? `<div class="d">${esc(t.reason)}</div>` : ""}</div><span class="pill ${cls}">${st}</span></button>`; }).join("") : `<div class="card empty">读不到工具列表</div>`; };
  sheet(`<h2>新建 CLI 会话</h2>${cliWarn}<label class="field"><span>标题 <span class="faint fs">（可不填，首次运行后自动取）</span></span><input class="input" id="cti" maxlength="80" placeholder="新会话"></label>
    <div class="row-h"><span class="faint fs">选一个工具</span><button type="button" class="btn sm" data-x="rf">↻ 刷新状态</button></div><div class="list" id="ct"><div class="skel" style="height:120px"></div></div>
    <div id="cmw" hidden><label class="field" style="margin-top:12px"><span>模型</span><select class="input" id="cmd"></select></label><button type="button" class="btn primary" data-x="go" style="width:100%">用 <span id="cmt"></span> 开始</button></div>`, async (el, close) => {
    let pick = null;
    const create = async (tool, btn) => { btn.disabled = true; const act = async fn => { try { return await fn(); } catch (x) { toast(x.code === "forbidden" ? "原生 CLI 只有主人能用" : x.code === "not_installed" ? `「${cliToolNm(tool)}」未安装或不可用` : x.code === "not_authed" ? `「${cliToolNm(tool)}」未登录` : x.status === 400 ? "这个模型不在可选列表里，点「刷新状态」后再选一次" : x.message); return null; } }; const md0 = el.querySelector("#cmd").value; const s = await act(() => api.cliCreate(tool, el.querySelector("#cti").value.trim(), cliModels(CLI_TOOLS.find(t => t.id === tool)).length ? md0 : undefined)); if (s) { close(true); location.hash = `#/cli/${s.id}`; after?.(); } else btn.disabled = false; };
    draw(el, await cliTools());
    el.querySelector("[data-x=rf]").onclick = async e => { e.target.disabled = true; draw(el, await cliTools(true)); e.target.disabled = false; toast("已刷新"); };
    el.addEventListener("click", async e => {
      if (e.target.closest("[data-x=go]")) return pick && create(pick, e.target.closest("button"));
      const b = e.target.closest("[data-tool]"); if (!b || b.disabled) return;
      const t = CLI_TOOLS.find(x => x.id === b.dataset.tool), ms = cliModels(t);
      if (!ms.length) return create(t.id, b);
      pick = t.id; el.querySelectorAll("[data-tool]").forEach(x => x.toggleAttribute("aria-current", x === b));
      el.querySelector("#cmd").innerHTML = ms.map(m => `<option value="${esc(m.id)}" ${m.def ? "selected" : ""}>${esc(m.name)}${m.def ? "（默认）" : ""}${cliSpeed(t.id, m.id) ? " — " + cliSpeed(t.id, m.id).tag : ""}</option>`).join("");
      el.querySelector("#cmt").textContent = t.name || cliToolNm(t.id); el.querySelector("#cmw").hidden = false;
    });
  }, "clinew");
}
VIEWS.cli = async (v, id) => {
  if (!CAN_CLI) return paint(v, top("原生 CLI") + cliDenied);
  let list; try { [list] = await Promise.all([api.cliSessions(), cliTools()]); } catch (e) { if (e.status === 403 && e.code === "forbidden") return paint(v, top("原生 CLI") + cliDenied); throw e; }
  const ss = Array.isArray(list) ? list : list?.sessions || [];
  const root = paint(v, top("原生 CLI", "", `<button class="iconbtn" data-x="new" aria-label="新建会话">＋</button>`) + cliWarn + `
    <div class="cli ${id ? "has-sel" : ""}"><aside class="cli-list"><div class="row-h"><span class="faint fs">${ss.length} 个会话</span><button type="button" class="btn sm primary" data-x="new">＋ 新建</button></div><div id="cl"></div></aside><section class="cli-pane" id="cp"></section></div>`);
  const drawList = () => { $("#cl", root).innerHTML = ss.length ? `<div class="list">${ss.map(s => `<a class="row cli-s" href="#/cli/${esc(s.id)}" ${s.id === id ? 'aria-current="page"' : ""}><div class="grow"><div class="t">${s.running ? `<span class="dot run"></span>` : ""}${esc(s.title || "新会话")}</div><div class="d">${esc(cliToolNm(s.tool))}${s.model ? " · " + esc(s.model) : ""} · ${s.updatedAt ? ago(s.updatedAt) : ""}${s.running ? " · 运行中" : ""}</div></div><span class="faint">›</span></a>`).join("")}</div>` : `<div class="card empty"><b>⌨️</b>还没有会话，点「新建」开始</div>`; };
  drawList();
  root.addEventListener("click", e => { if (e.target.closest("[data-x=new]")) cliNewSheet(); });
  const pane = $("#cp", root);
  if (!id) return cliQuick(pane, { ss, drawList });
  return cliPane(pane, id, { ss, drawList });
};
// 还没选会话：可以直接开始——第一次加附件或发送时才创建会话，然后切到完整会话视图（附件和文字原样带过去）
function cliQuick(pane, ctx) {
  const usable = (CLI_TOOLS || []).filter(t => t.available && t.authed !== false);
  if (!usable.length) { pane.innerHTML = `<div class="card empty cli-ph"><b>⌨️</b>选一个会话，或者新建一个</div>`; return; }
  pane.innerHTML = `<div class="cli-h"><div class="grow"><b>新的 CLI 会话</b><div class="faint fs">直接输入就开始，发送或加附件时自动创建</div></div></div>
    <div class="cli-msgs"><div class="faint fs cli-ph">⌨️ 也可以在左边选一个已有会话</div></div>
    <form class="cli-comp" id="cf"><label class="field cli-tsel"><span>工具</span><select class="input" id="qt">${usable.map(t => `<option value="${esc(t.id)}">${esc(t.name || cliToolNm(t.id))}</option>`).join("")}</select></label>
      <div class="att-tray" id="tray" hidden></div><div class="att-drop" aria-hidden="true">松手就能添加附件</div>
      <textarea class="input" id="cin" rows="3" placeholder="输入指令… (Ctrl/⌘+Enter 发送)" aria-label="指令"></textarea><div class="cli-cb">${attBtns()}<span class="faint fs" id="cc">0 / ${CLI_MAX}</span><button class="btn primary" id="cs" type="submit">发送</button></div></form>`;
  const form = $("#cf", pane), cin = $("#cin", pane), qt = $("#qt", pane);
  let made = null, making = null;
  const ensure = () => making ||= (async () => {
    const t = CLI_TOOLS.find(x => x.id === qt.value), m = cliModels(t).find(x => x.def)?.id;
    try { made = await api.cliCreate(qt.value, "", m); } catch (x) { making = null; toast(x.code === "not_installed" ? "这个工具未安装" : x.code === "not_authed" ? "这个工具未登录" : x.message); throw x; }
    qt.disabled = true; history.replaceState(null, "", `#/cli/${made.id}`); ctx.ss.unshift(made); ctx.drawList(); return made.id;
  })();
  const tray = attachTray({ scope: "cli", ensureSession: ensure, onChange: () => { $("#cs", pane).disabled = tray.busy(); } });
  tray.mount($("#tray", pane)); tray.bind(form, cin); loadLimits();
  cin.oninput = () => { $("#cc", pane).textContent = `${[...cin.value].length} / ${CLI_MAX}`; };
  cin.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = async e => {
    e.preventDefault(); const text = cin.value.trim(); if (!text && !tray.count()) return;
    const blk = tray.blocker(); if (blk) return toast(blk);
    try { const id = await ensure(); cliPane(pane, id, { ...ctx, tray, text, autoSend: true }); } catch {}
  };
}
async function cliPane(pane, id, ctx) {
  const { ss, drawList } = ctx;
  let d; try { d = await api.cliGet(id); } catch (e) { pane.innerHTML = `<div class="card empty">${e.code === "forbidden" ? "原生 CLI 只有主人能用" : e.status === 404 ? "这个会话不在了" : esc(e.message)}</div>`; return; }
  const sess = d.session || {}, msgs = d.messages || [];
  let running = !!sess.running, ctrl = null;
  pane.innerHTML = `<div class="cli-h"><a class="iconbtn cli-back" href="#/cli" aria-label="返回会话列表">${ic("back")}</a><div class="grow"><b>${esc(sess.title || "新会话")}</b><div class="faint fs">${esc(cliToolNm(sess.tool))}${sess.model ? " · " + esc(sess.model) : ""} · 无记忆 · 无人设</div></div><button class="btn sm danger" data-x="del">${ic("trash")}删除</button></div>
    <div class="cli-msgs" id="cm" aria-live="polite">${msgs.length ? msgs.map(cliMsg).join("") : `<div class="faint fs cli-ph">发一条指令开始吧。单次最多运行 ${sess.tool === "antigravity" ? 15 : 10} 分钟，同时只能跑一个会话。</div>`}</div>
    <div class="cli-run" id="cr" hidden><span class="dot run"></span><span id="crt">运行中…</span><button class="btn sm danger" data-x="stop">■ 停止</button></div>
    <form class="cli-comp" id="cf"><div class="att-tray" id="tray" hidden></div><div class="att-drop" aria-hidden="true">松手就能添加附件</div><textarea class="input" id="cin" rows="3" maxlength="${CLI_MAX + 1000}" placeholder="输入指令… (Ctrl/⌘+Enter 发送)" aria-label="指令"></textarea><div class="cli-cb">${attBtns()}<span class="faint fs" id="cc">0 / ${CLI_MAX}</span><button class="btn primary" id="cs" type="submit">发送</button></div></form>`;
  const cm = $("#cm", pane), cin = $("#cin", pane), cs = $("#cs", pane), cr = $("#cr", pane), crt = $("#crt", pane);
  const scroll = () => { cm.scrollTop = cm.scrollHeight; };
  const len = () => [...cin.value].length;
  pane.closest(".cli")?.classList.add("has-sel");
  const tray = ctx.tray || attachTray({ scope: "cli", ensureSession: async () => id });
  const sync = () => { const n = len(); $("#cc", pane).textContent = `${n} / ${CLI_MAX}`; $("#cc", pane).classList.toggle("over", n > CLI_MAX); cs.disabled = running || (!cin.value.trim() && !tray.count()) || n > CLI_MAX || tray.busy(); cs.title = tray.busy() ? "附件还在上传" : ""; cr.hidden = !running; };
  tray.mount($("#tray", pane)); tray.bind($("#cf", pane), cin); loadLimits();
  tray.onChange = sync;
  cm.addEventListener("click", e => { const f = e.target.closest("[data-full]"); if (f) lightbox(f.dataset.full, f.getAttribute("aria-label")); });
  let t0 = 0; const tick = () => { if (running) crt.textContent = t0 ? `运行中… ${Math.round((Date.now() - t0) / 1000)} 秒` : "还在运行（可能是之前发起的）…"; };
  viewInterval(pane, tick, 1000);
  const reload = async () => { try { const n = await api.cliGet(id); cm.innerHTML = (n.messages || []).map(cliMsg).join(""); running = !!n.session?.running; sync(); scroll(); } catch {} };
  if (running) { viewInterval(pane, () => running && !ctrl && reload(), 3000); tick(); }
  sync(); scroll();
  cin.oninput = sync;
  if (ctx.text) { cin.value = ctx.text; sync(); }
  if (ctx.autoSend) setTimeout(() => $("#cf", pane).requestSubmit(), 0);
  cin.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#cf", pane).requestSubmit(); } };
  $("#cf", pane).onsubmit = async e => {
    e.preventDefault(); if (running) return; const typed = cin.value.trim(); if (!typed && !tray.count()) return;
    const blk = tray.blocker(); if (blk) return toast(blk);
    const atts = tray.items.filter(x => x.st === "ok").map(x => x.res), ids = atts.map(a => a.id);
    const prompt = typed; // v2.10.1：只发附件时 prompt 可以为空，后端补默认文字
    if ([...prompt].length > CLI_MAX) return toast(`太长了，最多 ${CLI_MAX} 字`);
    cm.querySelector(".cli-ph")?.remove();
    cm.insertAdjacentHTML("beforeend", cliMsg({ role: "user", text: prompt, attachments: atts })); scroll();
    running = true; t0 = Date.now(); ctrl = new AbortController(); cin.value = ""; const kept = [...tray.items]; tray.clear(); sync(); tick();
    let cur = null, txt = "", got = false;
    cm.insertAdjacentHTML("beforeend", `<div class="cli-wait"><div class="cli-spin" aria-hidden="true"></div><div><b>${esc(cliToolNm(sess.tool))} 正在思考…</b><div class="fs">${esc(cliWaitTxt(sess))}</div><div class="fs faint">已等待 <span class="cw-s">0</span> 秒</div></div></div>`); scroll();
    const wait = cm.lastElementChild, wt = viewInterval(pane, () => { const n = wait.querySelector(".cw-s"); if (n) n.textContent = Math.round((Date.now() - t0) / 1000); }, 1000);
    const unwait = () => { if (!got) { got = true; wait.remove(); stopViewInterval(wt); } };
    let lastErr = "";
    const bubble = () => { if (!cur) { cm.insertAdjacentHTML("beforeend", `<div class="msg assistant md cli-a"></div>`); cur = cm.lastElementChild; txt = ""; } return cur; };
    try {
      await api.cliRun(id, prompt, (ev, j) => {
        if (ev !== "start" && ev !== "error") unwait();
        if (ev === "delta") { const b = bubble(); txt += j?.text || ""; b.innerHTML = md(txt); }
        else if (ev === "tool") { cur = null; cm.insertAdjacentHTML("beforeend", cliMsg({ role: "tool", ...j })); }
        else if (ev === "error") { unwait(); cur = null; lastErr = j?.message || ""; cm.insertAdjacentHTML("beforeend", cliMsg({ role: "error", text: j?.message })); }
        else if (ev === "done") { const dup = { cancelled: /取消|停止/, timeout: /超时/ }[j?.reason]; if (dup && dup.test(lastErr)) cm.querySelectorAll(".cli-err").length && [...cm.querySelectorAll(".cli-err")].at(-1).remove(); const why = j?.reason === "cancelled" ? "已停止" : j?.reason === "timeout" ? "超时，已终止" : j?.exitCode === 0 ? "完成" : j?.exitCode == null ? "已结束" : `结束（退出码 ${j.exitCode}）`; cm.insertAdjacentHTML("beforeend", `<div class="cli-done ${j?.reason || (j?.exitCode === 0 ? "ok" : "bad")}">${why}${j?.durationMs != null ? ` · 用时 ${(j.durationMs / 1000).toFixed(1)} 秒` : ""}</div>`); }
        scroll();
      }, ctrl.signal, ids);
    } catch (x) {
      unwait(); cm.lastElementChild?.classList.contains("cli-u") && cm.lastElementChild.remove();
      tray.items.push(...kept); tray.mount($("#tray", pane));
      cin.value = typed;
      if (x.status === 404 && ids.length) { try { await api.cliGet(id); tray.expire(); x.code = "expired"; } catch {} }
      const nm = cliToolNm(sess.tool), msg = x.code === "expired" ? "附件已过期，请点 ↻ 重新上传后再发" : x.code === "too_many_attachments" ? `附件太多了，每条最多 ${(LIMITS || LIMITS0).maxPerMessage} 个` : x.code === "forbidden" ? "原生 CLI 只有主人能用" : x.code === "not_authed" ? `「${nm}」未登录${x.message ? "：" + x.message : ""}` : x.code === "not_installed" ? `「${nm}」未安装${x.message ? "：" + x.message : ""}` : x.status === 429 ? "已经有别的会话在运行了，等它跑完再来" : x.status === 409 ? "这个会话正在运行，等它结束或先停止" : x.status === 413 ? `太长了，最多 ${CLI_MAX} 字` : x.message;
      cm.insertAdjacentHTML("beforeend", `<div class="cli-err">${esc(msg)}</div>`); scroll();
    }
    unwait(); running = false; ctrl = null; t0 = 0; sync();
    api.cliSessions().then(l => { ss.splice(0, ss.length, ...(Array.isArray(l) ? l : l?.sessions || [])); drawList(); }).catch(() => {});
  };
  pane.addEventListener("click", async e => {
    if (e.target.closest("[data-x=stop]")) { const b = e.target.closest("button"); b.disabled = true; try { await api.cliCancel(id); toast("已请求停止"); } catch (x) { toast(x.status === 409 ? "已经不在运行了" : x.message); if (x.status === 409 && !ctrl) { running = false; sync(); } } b.disabled = false; }
    if (e.target.closest("[data-x=del]")) {
      if (!await confirmDialog({ title: "删除这个 CLI 会话？", body: `「${esc(sess.title || "新会话")}」的聊天记录会被删掉${running ? "，正在运行的任务也会被终止" : ""}。服务器上的工作文件不会删除。`, ok: "删除", danger: true })) return;
      if (!await confirmDialog({ title: "真的要删吗？", body: "删除后记录无法找回。", ok: "确定删除", danger: true })) return;
      if (await act(() => api.cliDelete(id), "已删除")) { ctrl?.abort(); location.hash = "#/cli"; }
    }
  });

}
// ---------- v2.12 小脾气参数（记仇小本本 / 群梗回旋镖 / 吃醋） ----------
const FUN_TABS = [["", "设置"], ["grudges", "记仇本"], ["gags", "群梗"], ["trash", "备份"]];
const FUN_SEC = {
  grudge: { t: "记仇小本本", d: "把群友的「黑历史」记下来，偶尔翻旧账", ov: ["recallProbability", "recallCooldownDays"],
    f: [["recallProbability", "翻旧账概率", "", 0, 1, 0.01, "p"], ["recallCooldownDays", "同一人冷却", "天", 1, 365], ["maxEntriesPerPerson", "每人最多记", "条", 1, 200], ["maxQuoteChars", "每条最长", "字", 10, 200]],
    ph: [["optOutPhrase", "不想被记的口令"], ["clearPhrase", "撕本本口令"]] },
  gag: { t: "群梗回旋镖", d: "群里刷屏的梗，过几天再丢回来", ov: ["minScore", "minDistinctPeople", "requireApproval", "perGroupDailyCap"],
    f: [["minScore", "成梗分数至少", "分", 1, 50], ["minDistinctPeople", "至少几个人参与", "人", 1, 20], ["windowMin", "统计窗口", "分钟", 1, 60], ["cooldownDays", "同一梗冷却", "天", 0, 365], ["maxUses", "每个梗最多用", "次", 1, 100], ["perGroupDailyCap", "每群每天最多", "次", 0, 50]],
    b: [["requireApproval", "新梗要先审核", "收录前要你点头。审核入口会和新梗生成功能一起上线"]],
    ph: [["optOutPhrase", "别拿我的话玩梗"], ["deletePhrase", "删梗口令"]] },
  jealousy: { t: "吃醋", d: "看到群友夸别的机器人时小小吃个醋", ov: ["tierA", "tierB", "groupCooldownMin"],
    f: [["perPersonDailyCap", "每人每天最多", "次", 0, 20], ["personCooldownMin", "同一人冷却", "分钟", 0, 1440], ["groupCooldownMin", "同一群冷却", "分钟", 0, 1440]],
    b: [["tierA", "被@或被回复时吃醋", "A 档"], ["tierB", "主动插嘴吃醋", "B 档"]],
    ph: [["optOutPhrase", "不想看她吃醋的口令"]] },
};
let FUN_LOCK = {}; // requires 里的 "sec.key"：只显示存储值，不允许改，也不发送
const funLk = (sec, k) => FUN_LOCK[`${sec}.${k}`] || "";
const FUN_KIND = { all: "全部", grudge: "记仇", gag: "群梗", jealousy: "吃醋" };
const funErr = x => x.status === 400 ? scrub(x.message) : x.status === 404 ? "已经不在了，刷新看看" : x.message;
const funName = (id, n) => aliasFor(id) || n || shortId(id);
const funGroupName = (k, groups) => groups.find(g => g.k === k)?.name || aliasFor(k.slice(6)) || "群 " + shortId(k.slice(6).toUpperCase());
const twice = async (t1, b1, t2, b2, ok) => await confirmDialog({ title: t1, body: b1, ok: "继续", danger: true }) && await confirmDialog({ title: t2, body: b2, ok, danger: true });
VIEWS.fun = async (v, sub) => {
  const tab = FUN_TABS.some(t => t[0] === sub) ? sub : "";
  const tabs = `<div class="toolbar"><div class="seg stk-tabs" role="tablist">${FUN_TABS.map(([k, t]) => `<a role="tab" href="#/fun${k ? "/" + k : ""}" aria-pressed="${k === tab}">${t}</a>`).join("")}</div></div>`;
  const [d, ss] = await Promise.all([api.funParams(), api.sessions().catch(() => ({ sessions: [] })), loadAliases()]);
  const freq = d.requires || {}, known = new Set(Object.entries(FUN_SEC).flatMap(([sec, S]) => [...(S.b || []).map(x => x[0]), ...(S.ov || [])].map(k => `${sec}.${k}`)));
  FUN_LOCK = Object.fromEntries(Object.entries(freq).filter(([k]) => known.has(k)).map(([k, t]) => [k, String(t || "暂不可用")]));
  const fTop = Object.entries(freq).filter(([k]) => !known.has(k));
  const banner = d.consumers === false || fTop.length ? `<div class="fun-warn" role="status">🚧 <b>${d.consumers === false ? "功能还没上线，这里只保存设置" : "部分功能有前置条件"}</b>${d.consumers === false ? `<span>${esc(scrub(d.note || "改了也暂时不会影响星野的行为。"))}</span>` : ""}${fTop.length ? `<ul class="hl-req">${fTop.map(([k, t]) => `<li><code>${esc(k)}</code>：${esc(scrub(t))}</li>`).join("")}</ul>` : ""}</div>` : "";
  const groups = (ss.sessions || []).map(x => ({ x, t: qqTarget(x.key) })).filter(o => o.t?.kind === "group").map(o => ({ k: "group:" + o.t.id.toLowerCase(), name: sessName(o.x) }));
  const head = top("小脾气参数", "记仇 · 群梗 · 吃醋") + banner + tabs;
  if (tab === "grudges") return funGrudges(v, head, groups);
  if (tab === "gags") return funGags(v, head, groups);
  if (tab === "trash") { const t = await api.funTrash(); return paint(v, head + `<div class="faint fs" style="margin-bottom:8px">每次修改前的旧文件都会备份在这里。恢复需要后端手动拷回，没有一键恢复。</div>` + ((t.items || []).length ? `<div class="list">${t.items.map(f => `<div class="row"><div class="grow"><div class="t mono" style="font-size:13px;overflow-wrap:anywhere">${esc(f.file)}</div><div class="d">${bytes(f.size)} · ${fmtTime(f.mtime)}</div></div></div>`).join("")}</div>` : `<div class="card empty"><b>🗂️</b>还没有备份</div>`)); }
  return funSettings(v, head, d, groups);
};
function funSettings(v, head, d, groups) {
  const P0 = JSON.parse(JSON.stringify(d.params || {})), DF = d.defaults || {}; let P = JSON.parse(JSON.stringify(P0));
  const gks = sec => { const out = groups.map(g => g.k); for (const k of Object.keys(P[sec]?.perGroup || {})) if (!out.includes(k)) out.push(k); return out; };
  const sw = (attr, on, label = "") => `<span class="switch"><input type="checkbox" ${attr} ${on ? "checked" : ""} ${label ? `aria-label="${esc(label)}"` : ""}><i></i></span>`;
  const num = (sec, [k, label, unit, mn, mx, st = 1, kind]) => `<label class="field"><span>${esc(label)}${kind === "p" ? ` <b class="tnum">${Math.round((P[sec][k] ?? 0) * 100)}%</b>` : ""}</span><div class="inrow"><input class="input" type="number" min="${mn}" max="${mx}" step="${st}" inputmode="${st < 1 ? "decimal" : "numeric"}" value="${esc(P[sec][k] ?? "")}" data-fs="${sec}" data-k="${k}" data-min="${mn}" data-max="${mx}" data-int="${st < 1 ? "" : 1}"><span class="faint">${esc(unit || `${mn}–${mx}`)}</span></div></label>`;
  const phrase = (sec, k, label) => `<label class="field"><span>${esc(label)}</span><input class="input" maxlength="20" value="${esc((sec ? P[sec][k] : P[k]) ?? "")}" data-ph="${k}" ${sec ? `data-fs="${sec}"` : ""} autocomplete="off"></label>`;
  const ovInput = (sec, gk, k, c) => { const spec = [...FUN_SEC[sec].f, ...(FUN_SEC[sec].b || [])].find(x => x[0] === k); const isB = (FUN_SEC[sec].b || []).some(x => x[0] === k);
    return isB ? `<label class="tg ${funLk(sec, k) ? "locked" : ""}">${sw(`data-ov="${sec}" data-g="${esc(gk)}" data-k="${k}"${funLk(sec, k) ? " disabled" : ""}`, c[k] ?? P[sec][k], spec[1])}${esc(spec[1])}${funLk(sec, k) ? `<span class="faint">（${esc(scrub(funLk(sec, k)))}）</span>` : c[k] == null ? `<span class="faint">（跟随）</span>` : ""}</label>`
      : `<label class="ovf"><span>${esc(spec[1])}</span><input class="input" type="number" min="${spec[3]}" max="${spec[4]}" step="${spec[5] || 1}" value="${esc(c[k] ?? "")}" placeholder="${esc(P[sec][k] ?? "")}" data-ov="${sec}" data-g="${esc(gk)}" data-k="${k}" data-min="${spec[3]}" data-max="${spec[4]}" data-int="${(spec[5] || 1) < 1 ? "" : 1}"></label>`; };
  const secCard = sec => { const S = FUN_SEC[sec], p = P[sec];
    return `<div class="section">${esc(S.t)} <span class="faint fs" style="font-weight:400">${esc(S.d)}</span></div><div class="card form fun-sec ${p.enabled ? "" : "off"}">
      <label class="switchrow"><div class="grow"><b>${esc(S.t)}开关</b></div>${sw(`data-fs="${sec}" data-k="enabled"`, p.enabled)}</label>
      <div class="fun-reset"><button type="button" class="btn sm" data-secreset="${sec}">↺ ${esc(S.t)}恢复默认…</button></div>
      ${(S.b || []).map(([k, l, h]) => `<label class="switchrow ${funLk(sec, k) ? "locked" : ""}"><div class="grow"><b>${esc(l)}</b><div class="faint fs">${esc(h)}${funLk(sec, k) ? " · " + esc(scrub(funLk(sec, k))) : ""}</div></div>${sw(`data-fs="${sec}" data-k="${k}"${funLk(sec, k) ? " disabled" : ""}`, p[k])}</label>`).join("")}
      ${S.f.map(f => num(sec, f)).join("")}
      ${sec === "jealousy" ? `<div class="field"><span>会让她吃醋的别家机器人 <span class="faint fs">（最多 20 个）</span></span><div class="list flat">${(p.otherBots || []).map((b, i) => `<div class="row fun-bot"><div class="grow"><input class="input" maxlength="20" value="${esc(b.name)}" data-bot="${i}" aria-label="名字"><div class="d mono">${esc(b.id)}</div></div><button type="button" class="btn sm" data-botdel="${i}">移除</button></div>`).join("") || `<div class="faint fs">没有</div>`}</div>${(p.otherBots || []).length < 20 ? `<div class="inrow wrap" style="margin-top:6px"><input class="input" id="nbid" placeholder="32 位 openid" autocomplete="off" style="flex:2;min-width:180px"><input class="input" id="nbn" maxlength="20" placeholder="名字" style="flex:1;min-width:100px"><button type="button" class="btn sm" data-botadd>添加</button></div>` : ""}</div>` : ""}
      ${S.ph.map(([k, l]) => phrase(sec, k, l)).join("")}
      <div class="sub-h">各个群</div>
      <label class="switchrow"><div class="grow"><b>没单独设置的群</b><div class="faint fs">默认开不开</div></div>${sw(`data-fs="${sec}" data-k="defaultEnabled"`, p.defaultEnabled)}</label>
      <div class="list flat">${gks(sec).map(gk => { const c = p.perGroup?.[gk]; const on = c ? c.enabled !== false : !!p.defaultEnabled; const nm = funGroupName(gk, groups);
        return `<div class="fun-g"><div class="row"><div class="grow"><div class="t">${esc(nm)}</div><div class="d">${c ? "单独设置" + (Object.keys(c).length > 1 ? ` · ${Object.keys(c).length - 1} 项覆盖` : "") : "跟随默认"}</div></div>${c ? `<button type="button" class="btn sm" data-gunset="${sec}" data-g="${esc(gk)}">恢复默认</button>` : ""}${sw(`data-gsw="${sec}" data-g="${esc(gk)}"`, on, nm)}</div>
          ${c ? `<details class="fun-ov"><summary>这个群的单独参数（留空跟随上面）</summary><div class="fun-ovs">${S.ov.map(k => ovInput(sec, gk, k, c)).join("")}</div></details>` : ""}</div>`; }).join("") || `<div class="faint">还没有群会话</div>`}</div>
    </div>`; };
  const optRows = () => Object.entries(P.optOut || {}).filter(([, a]) => a).map(([id, a]) => `<div class="row fun-opt"><div class="grow"><div class="t">${esc(funName(id))}</div><div class="d mono">${esc(shortId(id))}</div><div class="chips">${Object.entries(FUN_KIND).map(([k, t]) => `<button type="button" class="chip" aria-pressed="${a.includes(k)}" data-opt="${esc(id)}" data-kind="${k}" ${k !== "all" && a.includes("all") ? "disabled" : ""}>${t}</button>`).join("")}</div></div><button type="button" class="btn sm" data-optdel="${esc(id)}">移出</button></div>`).join("");
  const draw = () => {
    const y = scrollY;
    root.querySelector("#ff").innerHTML = `<div class="card form">
        <label class="switchrow"><div class="grow"><b>小脾气总开关</b><div class="faint fs">关掉后三个功能都不生效</div></div>${sw(`data-top="enabled"`, P.enabled)}</label>
        ${phrase(null, "killPhrase", "一键全关的暗号")}
        <label class="switchrow"><div class="grow"><b>只认凛说的暗号</b><div class="faint fs">关掉后谁说都算</div></div>${sw(`data-top="killOwnerOnly"`, P.killOwnerOnly)}</label>
        ${phrase(null, "optOutAllPhrase", "群友一句话退出全部的口令")}
        <div class="faint fs">所有暗号和口令都是 1–20 字，不能重复。</div>
      </div>
      <div class="section">退出名单 <span class="faint fs" style="font-weight:400">这些人不会被整</span></div>
      <div class="card form"><div class="list flat">${optRows() || `<div class="faint fs">还没有人退出</div>`}</div>
        <div class="inrow wrap" style="margin-top:8px"><input class="input" id="noid" placeholder="群友的 32 位 openid" autocomplete="off" style="flex:1;min-width:200px"><button type="button" class="btn sm" data-optadd>加入（先退出全部）</button></div></div>
      ${["grudge", "gag", "jealousy"].map(secCard).join("")}`;
    root.querySelector("#fsb").hidden = !Object.keys(changes()).length; scrollTo(0, y);
  };
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changes = () => { const o = {};
    for (const k of ["enabled", "killOwnerOnly", "killPhrase", "optOutAllPhrase"]) if (!eq(P[k], P0[k])) o[k] = P[k];
    const oo = {}; for (const id of new Set([...Object.keys(P0.optOut || {}), ...Object.keys(P.optOut || {})])) if (!eq(P.optOut?.[id], P0.optOut?.[id])) oo[id] = P.optOut?.[id] ?? null; if (Object.keys(oo).length) o.optOut = oo;
    for (const sec of ["grudge", "gag", "jealousy"]) { const a = P0[sec] || {}, b = P[sec] || {}, so = {};
      for (const k of Object.keys(b)) if (k !== "perGroup" && !funLk(sec, k) && !eq(a[k], b[k])) so[k] = b[k];
      const pg = {}; for (const g of new Set([...Object.keys(a.perGroup || {}), ...Object.keys(b.perGroup || {})])) if (!eq(a.perGroup?.[g], b.perGroup?.[g])) pg[g] = b.perGroup?.[g] ?? null; // 整项写入
      if (Object.keys(pg).length) so.perGroup = pg; if (Object.keys(so).length) o[sec] = so; }
    return o; };
  const root = paint(v, head + `<div id="ff"></div>` + dirtyBar("fsb", "保存设置"));
  const bad = (t, msg) => { toast(msg); draw(); };
  const numOf = t => { const s = t.value.trim(); if (s === "") return { empty: true }; const n = Number(s), mn = +t.dataset.min, mx = +t.dataset.max; if (!(n >= mn && n <= mx) || (t.dataset.int && !Number.isInteger(n))) return { err: `要在 ${mn}–${mx} 之间${t.dataset.int ? "的整数" : ""}` }; return { n: t.dataset.int ? n : Math.round(n * 100) / 100 }; };
  root.addEventListener("change", e => { const t = e.target, sec = t.dataset.fs, k = t.dataset.k;
    if (t.dataset.top) P[t.dataset.top] = t.checked;
    else if (t.dataset.ph) { const s = t.value.trim(); if (!s || [...s].length > 20 || /\n/.test(s)) return bad(t, "口令要是 1–20 字的一行"); if (sec) P[sec][t.dataset.ph] = s; else P[t.dataset.ph] = s; }
    else if (t.dataset.gsw) { const s2 = t.dataset.gsw, g = t.dataset.g; P[s2].perGroup = { ...(P[s2].perGroup || {}), [g]: { ...(P[s2].perGroup?.[g] || {}), enabled: t.checked } }; }
    else if (t.dataset.ov) { const s2 = t.dataset.ov, g = t.dataset.g, c = { ...P[s2].perGroup[g] }; if (t.type === "checkbox") c[k] = t.checked; else { const r = numOf(t); if (r.err) return bad(t, r.err); if (r.empty) delete c[k]; else c[k] = r.n; } P[s2].perGroup = { ...P[s2].perGroup, [g]: c }; }
    else if (t.dataset.bot != null) { const s = t.value.trim(); if (!s || [...s].length > 20) return bad(t, "名字要 1–20 字"); P.jealousy.otherBots = P.jealousy.otherBots.map((b, i) => i === +t.dataset.bot ? { ...b, name: s } : b); }
    else if (sec && t.type === "checkbox") P[sec][k] = t.checked;
    else if (sec && t.type === "number") { const r = numOf(t); if (r.err || r.empty) return bad(t, r.err || "不能留空"); P[sec][k] = r.n; }
    else return;
    draw(); });
  root.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.secreset) { const sec = b.dataset.secreset, nm = FUN_SEC[sec].t;
      if (!await confirmDialog({ title: `${nm}恢复默认？`, body: `这一整段设置（开关、频率、口令、各群设置）都会回到默认值，默认是关闭的。`, ok: "继续", danger: true })) return;
      if (!await confirmDialog({ title: "确定恢复默认吗？", body: "旧设置会备份，恢复要找后端。其他还没保存的改动不会一起提交。", ok: "恢复默认", danger: true })) return;
      try { const r = await api.funSet({ [sec]: null }); toast(`${nm}已恢复默认${r?.backup ? "，旧设置已备份" : ""}`); route(); } catch (x) { toast(funErr(x)); } return; }
    if (b.dataset.gunset) { const s2 = b.dataset.gunset; P[s2].perGroup = { ...P[s2].perGroup }; delete P[s2].perGroup[b.dataset.g]; return draw(); }
    if (b.dataset.opt) { const a = new Set(P.optOut[b.dataset.opt]); a.has(b.dataset.kind) ? a.delete(b.dataset.kind) : a.add(b.dataset.kind); if (!a.size) return toast("至少留一项，不想要了就点「移出」"); P.optOut = { ...P.optOut, [b.dataset.opt]: a.has("all") ? ["all"] : Object.keys(FUN_KIND).filter(k => a.has(k)) }; return draw(); }
    if (b.dataset.optdel) { P.optOut = { ...P.optOut }; delete P.optOut[b.dataset.optdel]; return draw(); }
    if (b.hasAttribute("data-optadd")) { const id = root.querySelector("#noid").value.trim().toUpperCase(); if (!/^[0-9A-F]{32}$/.test(id)) return toast("openid 要是 32 位十六进制"); if (P.optOut?.[id]) return toast("已经在名单里了"); P.optOut = { ...(P.optOut || {}), [id]: ["all"] }; return draw(); }
    if (b.dataset.botdel != null) { P.jealousy.otherBots = P.jealousy.otherBots.filter((_, i) => i !== +b.dataset.botdel); return draw(); }
    if (b.hasAttribute("data-botadd")) { const id = root.querySelector("#nbid").value.trim().toUpperCase(), nm = root.querySelector("#nbn").value.trim(); if (!/^[0-9A-F]{32}$/.test(id)) return toast("openid 要是 32 位十六进制"); if (!nm || [...nm].length > 20) return toast("名字要 1–20 字"); if (P.jealousy.otherBots.some(x => x.id === id)) return toast("这个机器人已经在了"); P.jealousy.otherBots = [...P.jealousy.otherBots, { id, name: nm }]; return draw(); }
    if (b.hasAttribute("data-reset")) { P = JSON.parse(JSON.stringify(P0)); return draw(); }
    if (b.hasAttribute("data-save")) { const c = changes(); if (!Object.keys(c).length) return;
      b.disabled = true; try { const r = await api.funSet(c); toast(`已保存${r?.backup ? "，旧设置已备份" : ""}`); route(); } catch (x) { toast(funErr(x)); b.disabled = false; } }
  });
  void DF; draw();
}
async function funGrudges(v, head, groups) {
  const d = await api.funGrudges(); const ps = d.people || [];
  const root = paint(v, head + `<div class="faint fs" style="margin-bottom:8px">星野记下的「旧账」。${d.updatedAt ? "更新于 " + fmtTime(d.updatedAt) : ""}</div>` + (ps.length ? ps.map(p => `<div class="card fun-person"><div class="row-h"><div><b>${esc(funName(p.id, p.name))}</b> ${p.optOut ? `<span class="pill warn">已退出</span>` : ""}<div class="faint fs">${p.entries.length} 条${p.lastRecallAt ? " · 上次翻旧账 " + ago(p.lastRecallAt) : ""}</div></div><button type="button" class="btn sm danger" data-clear="${esc(p.id)}">撕本本</button></div>
      <div class="list flat">${p.entries.map(en => `<div class="row"><div class="grow"><div class="t">「${esc(en.quote)}」</div><div class="d">${esc(funGroupName(en.group, groups))} · ${fmtTime(en.at)}${en.count > 1 ? ` · 记了 ${en.count} 次` : ""}</div></div><button type="button" class="btn sm" data-del="${esc(p.id)}" data-e="${esc(en.id)}" aria-label="删除这条">删除</button></div>`).join("")}</div></div>`).join("") : `<div class="card empty"><b>📒</b>本本还是空的</div>`));
  root.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.del) { const p = ps.find(x => x.id === b.dataset.del), en = p.entries.find(x => x.id === b.dataset.e);
      if (!await twice("删除这条记仇？", `<div class="quote">「${esc(en.quote)}」</div>`, "确定删除吗？", "删掉后星野就不会再翻这笔旧账了（旧文件会备份）。", "确定删除")) return;
      try { await api.funGrudgeDel(p.id, en.id); toast("已删除"); route(); } catch (x) { toast(funErr(x)); } }
    if (b.dataset.clear) { const p = ps.find(x => x.id === b.dataset.clear), nm = funName(p.id, p.name);
      if (!await twice(`撕掉${nm}的本本？`, `会清空关于${esc(nm)}的全部 ${p.entries.length} 条记录。`, "真的撕吗？", "撕了就没了（旧文件会备份，恢复要找后端）。", "撕本本")) return;
      try { const r = await api.funGrudgeClear(p.id); toast(`撕掉了 ${r?.removed ?? p.entries.length} 条`); route(); } catch (x) { toast(funErr(x)); } }
  });
}
async function funGags(v, head, groups) {
  const d = await api.funGags(); const gs = d.groups || [];
  const root = paint(v, head + `<div class="faint fs" style="margin-bottom:8px">已经收录的群梗。候选梗的审核等统计任务做好后再加。</div>` + (gs.some(g => g.items?.length) ? gs.filter(g => g.items?.length).map(g => `<div class="section">${esc(funGroupName(g.group, groups))}</div><div class="list">${g.items.map(it => `<div class="row"><div class="grow"><div class="t">「${esc(it.quote)}」 ${it.retired ? `<span class="pill">已退役</span>` : ""}${it.promotedToSlang ? `<span class="pill ok">成黑话了</span>` : ""}</div><div class="d">${it.context ? esc(it.context) + " · " : ""}${(it.keywords || []).map(k => "#" + esc(k)).join(" ")}</div><div class="d faint">${it.score} 分 · 用了 ${it.uses} 次${it.lastUsedAt ? " · 上次 " + ago(it.lastUsedAt) : ""} · 收录于 ${fmtTime(it.addedAt)}</div></div><button type="button" class="btn sm" data-g="${esc(g.group)}" data-id="${esc(it.id)}">删除</button></div>`).join("")}</div>`).join("") : `<div class="card empty"><b>🪃</b>还没有收录的梗</div>`));
  root.addEventListener("click", async e => { const b = e.target.closest("[data-id]"); if (!b) return; const it = gs.find(g => g.group === b.dataset.g).items.find(x => x.id === b.dataset.id);
    if (!await twice("删除这个梗？", `<div class="quote">「${esc(it.quote)}」</div>`, "确定删除吗？", "删掉后星野不会再用这个梗（旧文件会备份）。", "确定删除")) return;
    try { await api.funGagDel(b.dataset.g, b.dataset.id); toast("已删除"); route(); } catch (x) { toast(funErr(x)); } });
}
// ---------- v2.12 拟人化参数（不提供任何节奏类设置） ----------
const HL_FEAT = { followup: "追问近况", opinion: "有主见", dontKnow: "老实说不知道", proactive: "主动搭话", quirk: "口癖", mood: "察觉情绪", protect: "护短", morning: "抢早安沙发", robotBit: "被叫人机就破防", mbti: "盲猜 MBTI" };
// [字段, 标签, 类型, 参数…]  类型：b 开关 / n 数字(min,max,单位,步长) / p 概率 / ph 口令 / tags(上限,每条字数) / seg(选项) / hr 小时
const HL_SEC = [
  ["techMode", "技术模式", "聊代码、日志、报错时，所有拟人效果全关（包括分条发）", [["enabled", "开启技术模式", "b"], ["stickyMin", "最后一条技术消息后保持", "n", 0, 240, "分钟"], ["keywords", "触发关键词", "tags", 50, 40], ["ownerPhraseOn", "凛强制切到技术模式的口令", "ph"], ["ownerPhraseOff", "凛切回聊天模式的口令", "ph"], ["allowPersonaLine", "技术回答首尾可以带一句人设话", "b"]]],
  ["followup", "追问近况", "过几天问问群友之前说的事后来怎么样了", [["enabled", "开启", "b"], ["perPersonDailyCap", "每人每天最多追问", "n", 0, 5, "次"], ["onceOnly", "每件事只追问一次", "b"], ["minWaitHours", "事件到期后至少等", "n", 0, 168, "小时再问"], ["maxAgeDays", "超过多少天就不问了", "n", 1, 90, "天"]]],
  ["opinion", "有主见", "不再什么都附和", [["enabled", "开启", "b"], ["strength", "坚持程度", "seg", [["gentle", "温和"], ["firm", "坚定"]]], ["yieldWhenCares", "对方真在意时让步", "b"], ["techDisagree", "技术方案有问题时直说", "b"]]],
  ["dontKnow", "老实说不知道", "拿不准就说拿不准", [["enabled", "开启", "b"], ["maxHedgePerReply", "每条回复最多几个「不确定」用语", "n", 1, 3, "个"], ["inTechMode", "技术模式下也保留", "b"]]],
  ["proactive", "主动搭话", "群里冷场后有人说话时，偶尔接一句", [["mode", "模式", "seg", [["off", "关"], ["passive", "被动"], ["heartbeat", "心跳"]]], ["quietThresholdMin", "冷场多久才算「冷场后」", "n", 10, 4320, "分钟"], ["triggerProbability", "冷场后有人发言时考虑接话的概率", "p"], ["minIntervalMin", "同一个群两次主动接话至少间隔", "n", 10, 4320, "分钟"], ["perGroupDailyCap", "每群每天最多", "n", 0, 10, "次"], ["requireReason", "没有理由（记忆、时间、兴趣、纪念日）就不接", "b"], ["backoffAfterIgnored", "连续几次没人理就把频率减半", "n", 0, 10, "次（0 = 不减）"], ["quietHoursStart", "安静时段从", "hr"], ["quietHoursEnd", "安静时段到", "hr"], ["heartbeatIntervalMin", "心跳间隔（只在心跳模式下用）", "n", 10, 1440, "分钟"]]],
  ["quirk", "口癖", "偶尔带点小口头禅、小瑕疵", [["enabled", "开启", "b"], ["probability", "每轮出现的概率", "p"], ["phrases", "口癖表", "tags", 10, 20], ["selfCorrect", "用 * 自我更正", "b"], ["trailOff", "说一半", "b"]]],
  ["mood", "察觉情绪", "群友情绪和平时不一样时关心一下", [["enabled", "开启", "b"], ["perPersonDailyCap", "每人每天最多关心", "n", 0, 3, "次"], ["deviation", "偏离平时多少算异常", "p"], ["minBaselineMsgs", "至少攒够多少条消息才开始判断", "n", 5, 500, "条"]]],
  ["protect", "护短", "有人被一群人损过头时，站出来帮他说句话", [["enabled", "开启", "b"], ["roastWindowMin", "统计损话的时间窗口", "n", 1, 60, "分钟"], ["roastMinHits", "窗口里针对同一个人的损话至少", "n", 1, 20, "条"], ["roastMinPeople", "至少几个人在损他", "n", 1, 10, "人"], ["probability", "达到门槛后出手的概率", "p"], ["perGroupDailyCap", "每群每天最多", "n", 0, 10, "次"], ["perTargetDailyCap", "同一个人每天最多被护", "n", 0, 5, "次"], ["mediateRealFights", "真吵起来时改为劝和，不护短", "b"], ["roastKeywords", "损话词", "tags", 50, 20], ["fightKeywords", "真吵架词", "tags", 50, 20]]],
  ["morning", "抢早安沙发", "有早安习惯的群，早上抢先道一声早", [["enabled", "开启", "b"], ["mode", "模式", "seg", [["passive", "被动"], ["heartbeat", "心跳"]]], ["greetingKeywords", "早安词", "tags", 20, 20], ["windowStartHour", "早安时段从", "hr", 0, 23], ["windowEndHour", "到", "hr", 1, 24], ["habitWindowDays", "看最近多少天", "n", 3, 60, "天"], ["habitMinDays", "其中至少几天有人说早安", "n", 1, 60, "天"], ["perGroupDailyCap", "每群每天最多", "n", 0, 1, "次"], ["heartbeatHour", "心跳模式在几点抢", "hr", 0, 23]]],
  ["robotBit", "被叫人机就破防", "被叫「人机」时小小破防一下", [["enabled", "开启", "b"], ["keywords", "触发词", "tags", 30, 20], ["sincereKeywords", "认真问的信号", "tags", 30, 30], ["segmentGapMin", "沉默多久算新的一段对话（每段最多破防一次）", "n", 5, 720, "分钟"], ["perGroupDailyCap", "每群每天最多", "n", 0, 20, "次"]]],
  ["mbti", "盲猜 MBTI", "只在有人请她猜的时候才猜", [["enabled", "开启", "b"], ["includeZodiac", "也接受「猜星座」", "b"], ["minPublicMsgs", "群消息少于这个数就说素材不够", "n", 0, 500, "条"], ["perPersonDailyCap", "每人每天最多", "n", 0, 5, "次"], ["perGroupDailyCap", "每群每天最多", "n", 0, 20, "次"], ["forbiddenTopics", "绝不涉及的话题", "tags", 30, 20]]],
  ["sensitive", "敏感话题", "这些话题的追问和关心要不要做", [["mode", "什么时候可以", "seg", [["never", "从不"], ["dmOnly", "只在私聊"], ["always", "都可以"]]], ["topics", "敏感话题", "tags", 50, 20]]],
];
const HL_TOP = ["enabled", "optOutPhrase"];
const hlKey = s => String(s).replace(/\s+/g, "").toLowerCase();
VIEWS.humanlike = async (v, sub) => {
  if (sub === "voice") return voiceTtsView(v); if (sub === "voices") return voicesView(v);
  const tab = sub === "followups" ? "followups" : "";
  const tabs = `<div class="toolbar"><div class="seg stk-tabs" role="tablist">${[["", "设置"], ["followups", "待追问"]].map(([k, t]) => `<a role="tab" href="#/humanlike${k ? "/" + k : ""}" aria-pressed="${k === tab}">${t}</a>`).join("")}</div></div>`;
  const [d, ss] = await Promise.all([api.hlGet(), api.sessions().catch(() => ({ sessions: [] })), loadAliases()]);
  const req = d.requires || {}; const HLS = new Set(HL_SEC.map(x => x[0]));
  const reqTop = Object.entries(req).filter(([k]) => !k.includes("=") && !HLS.has(k.split(".")[0]));
  const reqCard = sec => Object.entries(req).filter(([k]) => !k.includes("=") && k.split(".")[0] === sec);
  const banner = d.consumers === false || reqTop.length ? `<div class="fun-warn" role="status">🚧 <b>${d.consumers === false ? "暂未生效：功能还没上线，这里只保存设置" : "部分取值有前置条件"}</b>${d.note ? `<span>${esc(scrub(d.note))}</span>` : ""}${reqTop.length ? `<ul class="hl-req">${reqTop.map(([k, t]) => `<li><code>${esc(k)}</code>：${esc(scrub(t))}</li>`).join("")}</ul>` : ""}</div>` : "";
  const head = top("拟人化", "让星野更像人") + banner + tabs;
  const groups0 = (ss.sessions || []).map(x => ({ x, t: qqTarget(x.key) })).filter(o => o.t?.kind === "group").map(o => ({ k: "group:" + o.t.id.toLowerCase(), name: sessName(o.x) }));
  if (tab === "followups") { const f = await api.hlFollowups().catch(() => ({ items: [] })); const it = f.items || [];
    return paint(v, head + `<div class="faint fs" style="margin-bottom:8px">以后由技能写进来的「改天问问」事件，这里只读。${f.updatedAt ? "更新于 " + fmtTime(f.updatedAt) : ""}</div>` + (it.length ? `<div class="list">${it.map(x => `<div class="row"><div class="grow"><div class="t">${esc(x.topic || "（没写事件）")}</div><div class="d">${esc([x.name || (x.person ? funName(x.person) : ""), x.group ? funGroupName(String(x.group).startsWith("group:") ? String(x.group).toLowerCase() : "group:" + String(x.group).toLowerCase(), groups0) : "私聊"].filter(Boolean).join(" · "))}</div><div class="d">${esc(["记下 " + (x.createdAt ? fmtTime(x.createdAt) : "—"), "该问 " + (x.dueAt ? fmtTime(x.dueAt) : "—")].join(" · "))}</div></div>${x.askedAt ? `<span class="pill ok" title="${esc(fmtTime(x.askedAt))}">已问 ${esc(fmtTime(x.askedAt))}</span>` : `<span class="pill">还没问</span>`}</div>`).join("")}</div>` : `<div class="card empty"><b>🗓️</b>还没有待追问的事件</div>`)); }
  const groups = (ss.sessions || []).map(x => ({ x, t: qqTarget(x.key) })).filter(o => o.t?.kind === "group").map(o => ({ k: "group:" + o.t.id.toLowerCase(), name: sessName(o.x) }));
  const H0 = JSON.parse(JSON.stringify(d.params || {})); let H = JSON.parse(JSON.stringify(H0)); const sug = d.suggestions?.quirkPhrases || [];
  const sw = (attr, on, lab = "") => `<span class="switch"><input type="checkbox" ${attr} ${on ? "checked" : ""} ${lab ? `aria-label="${esc(lab)}"` : ""}><i></i></span>`;
  const ctl = (sec, [k, l, t, a, b2, unit]) => { const val = H[sec]?.[k], at = `data-hs="${sec}" data-k="${k}"`;
    const dim = (sec === "morning" && k === "heartbeatHour" && H.morning?.mode !== "heartbeat") || sec === "proactive" && ((k === "heartbeatIntervalMin" && H.proactive.mode !== "heartbeat") || (k !== "mode" && k !== "heartbeatIntervalMin" && H.proactive.mode === "off"));
    const wrap = (inner, cls = "field") => `<div class="${cls} ${dim ? "dim" : ""}">${inner}</div>`;
    if (t === "b") return `<label class="switchrow ${dim ? "dim" : ""}"><div class="grow"><b>${esc(l)}</b></div>${sw(at, val)}</label>`;
    if (t === "n") return wrap(`<label><span>${esc(l)}</span><div class="inrow"><input class="input" type="number" min="${a}" max="${b2}" step="1" inputmode="numeric" value="${esc(val ?? "")}" ${at} data-min="${a}" data-max="${b2}" data-int="1"><span class="faint">${esc(unit)}（${a}–${b2}）</span></div></label>`);
    if (t === "p") return wrap(`<label><span>${esc(l)} <b class="tnum">${Math.round((val ?? 0) * 1000) / 10}%</b></span><div class="inrow"><input class="input" type="number" min="0" max="1" step="0.001" inputmode="decimal" value="${esc(val ?? "")}" ${at} data-min="0" data-max="1"><span class="faint">0–1</span></div></label>`);
    if (t === "hr") return wrap(`<label><span>${esc(l)}</span><select class="input" ${at}>${Array.from({ length: (b2 ?? 23) - (a ?? 0) + 1 }, (_, h0) => h0 + (a ?? 0)).map(h => `<option value="${h}" ${h === val ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select></label>`);
    if (t === "ph") return wrap(`<label><span>${esc(l)}</span><input class="input" maxlength="20" value="${esc(val ?? "")}" ${at} data-ph="1" autocomplete="off"></label>`);
    if (t === "seg") { const rk = o => `${sec}.${k}=${o}`, hb = o => o === "heartbeat" && !!req[rk(o)], cur = req[rk(val)] || "";
      return wrap(`<span>${esc(l)}</span><div class="seg hl-seg" role="radiogroup">${a.map(([o, ol]) => `<button type="button" role="radio" aria-pressed="${val === o}" data-seg="${sec}" data-k="${k}" data-o="${o}">${esc(ol)}${hb(o) ? " · 需另行批准" : ""}</button>`).join("")}</div>${cur ? (val === "heartbeat" ? `<div class="hl-need">⚠️ 需另行批准：${esc(scrub(cur))}</div>` : `<div class="hl-need soft">ℹ️ ${esc(scrub(cur))}</div>`) : ""}`); }
    if (t === "tags") { const list = val || [], used = new Set(list.map(hlKey));
      return wrap(`<span>${esc(l)} <span class="faint fs">（${list.length} / ${a}，每条最多 ${b2} 字）</span></span><div class="tags">${list.map((x, i) => `<span class="tag">${esc(x)}<button type="button" data-tagdel="${sec}" data-k="${k}" data-i="${i}" aria-label="删除 ${esc(x)}">✕</button></span>`).join("") || `<span class="faint fs">还没有</span>`}</div>
        ${list.length < a ? `<div class="inrow"><input class="input" maxlength="${b2}" placeholder="输入后按回车添加" data-tagin="${sec}" data-k="${k}" data-max="${a}" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="btn sm" data-tagadd="${sec}" data-k="${k}">添加</button></div>` : ""}
        ${sec === "quirk" && k === "phrases" && sug.length ? `<div class="hl-sug">建议：${sug.map(x => `<button type="button" class="chip" data-sug="${esc(x)}" ${used.has(hlKey(x)) || list.length >= a ? "disabled" : ""}>＋ ${esc(x)}</button>`).join("")}</div>` : ""}`); }
    return ""; };
  const secCard = ([sec, t, desc, fs]) => { const on = sec === "proactive" ? H.proactive.mode !== "off" : sec === "sensitive" ? true : H[sec]?.enabled;
    return `<div class="section">${esc(t)} <span class="faint fs" style="font-weight:400">${esc(desc)}</span></div><div class="card form fun-sec ${on ? "" : "off"}">${fs.map(f => ctl(sec, f)).join("")}${sec === "robotBit" ? `<div class="hl-fixed">🔒 有人认真问是不是真人时一律如实回答，不受开关影响</div>` : ""}${reqCard(sec).map(([, t]) => `<div class="hl-need soft">ℹ️ ${esc(scrub(t))}</div>`).join("")}<div class="fun-reset"><button type="button" class="btn sm" data-hreset="${sec}">↺ 恢复默认…</button></div></div>`; };
  const KINDS = { all: "全部", ...HL_FEAT };
  const draw = () => { const y = scrollY;
    root.querySelector("#hf").innerHTML = `<div class="card form"><label class="switchrow"><div class="grow"><b>拟人化总开关</b><div class="faint fs">关掉后下面所有效果都不生效（技术模式除外，它只负责关效果）</div></div>${sw(`data-ht="enabled"`, H.enabled)}</label>
        <label class="field"><span>群友一句话退出全部拟人效果的口令</span><input class="input" maxlength="20" value="${esc(H.optOutPhrase ?? "")}" data-ht="optOutPhrase" autocomplete="off"></label><div class="faint fs">所有口令 1–20 字，不能重复，也不能和小脾气的口令重复。</div></div>
      ${HL_SEC.map(secCard).join("")}
      <div class="section">各个群</div><div class="card form"><div class="list flat">${groups.map(g => g.k).concat(Object.keys(H.perGroup || {}).filter(k => !groups.some(g => g.k === k))).map(gk => { const c = H.perGroup?.[gk], nm = funGroupName(gk, groups);
        return `<div class="fun-g"><div class="row"><div class="grow"><div class="t">${esc(nm)}</div><div class="d">${c ? "单独设置" + (Object.keys(c).filter(k => k !== "enabled" && c[k] === false).length ? ` · 关了 ${Object.keys(c).filter(k => k !== "enabled" && c[k] === false).map(k => HL_FEAT[k]).join("、")}` : "") : "跟随总开关"}</div></div>${c ? `<button type="button" class="btn sm" data-hgunset="${esc(gk)}">恢复默认</button>` : ""}${sw(`data-hg="${esc(gk)}"`, c ? c.enabled !== false : true, nm)}</div>
          ${c ? `<details class="fun-ov"><summary>这个群单独关掉某些功能</summary><div class="fun-ovs">${Object.entries(HL_FEAT).map(([f, t]) => `<label class="tg">${sw(`data-hgf="${esc(gk)}" data-f="${f}"`, c[f] !== false, t)}${esc(t)}</label>`).join("")}</div></details>` : ""}</div>`; }).join("") || `<div class="faint">还没有群会话</div>`}</div></div>
      <div class="section">退出名单 <span class="faint fs" style="font-weight:400">这些人不会收到拟人效果</span></div>
      <div class="card form"><div class="list flat">${Object.entries(H.optOut || {}).filter(([, a]) => a).map(([id, a]) => `<div class="row fun-opt"><div class="grow"><div class="t">${esc(funName(id))}</div><div class="d mono">${esc(shortId(id))}</div><div class="chips">${Object.entries(KINDS).map(([k, t]) => `<button type="button" class="chip" aria-pressed="${a.includes(k)}" data-hopt="${esc(id)}" data-kind="${k}" ${k !== "all" && a.includes("all") ? "disabled" : ""}>${t}</button>`).join("")}</div></div><button type="button" class="btn sm" data-hoptdel="${esc(id)}">移出</button></div>`).join("") || `<div class="faint fs">还没有人退出</div>`}</div>
        <div class="inrow wrap" style="margin-top:8px"><input class="input" id="hnoid" placeholder="群友的 32 位 openid" autocomplete="off" style="flex:1;min-width:200px"><button type="button" class="btn sm" data-hoptadd>加入（退出全部）</button></div></div>`;
    root.querySelector("#hsb").hidden = !Object.keys(changes()).length; scrollTo(0, y); };
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changes = () => { const o = {};
    for (const k of HL_TOP) if (!eq(H[k], H0[k])) o[k] = H[k];
    for (const m of ["optOut", "perGroup"]) { const x = {}; for (const id of new Set([...Object.keys(H0[m] || {}), ...Object.keys(H[m] || {})])) if (!eq(H[m]?.[id], H0[m]?.[id])) x[id] = H[m]?.[id] ?? null; if (Object.keys(x).length) o[m] = x; }
    for (const [sec] of HL_SEC) { const a = H0[sec] || {}, b = H[sec] || {}, so = {}; for (const k of Object.keys(b)) if (!eq(a[k], b[k])) so[k] = b[k]; if (Object.keys(so).length) o[sec] = so; }
    return o; };
  const root = paint(v, head + `<div class="card mlist vt-entry"><a class="mrow" href="#/humanlike/voice"><span class="mic">${ic("tune")}</span><span class="grow"><b>语音设置</b><small>语音引擎、情绪标记、Fish 和 MiMo 的声音</small></span><span class="mchev">${ic("chev")}</span></a><a class="mrow" href="#/humanlike/voices"><span class="mic">${ic("play")}</span><span class="grow"><b>音色</b><small>音色手册、在线找音色、添加备用音色</small></span><span class="mchev">${ic("chev")}</span></a></div>` + `<div id="hf"></div>` + dirtyBar("hsb", "保存设置"));
  const addTag = (sec, k, raw) => { const s = String(raw || "").trim(); const spec = HL_SEC.find(x => x[0] === sec)[3].find(f => f[0] === k); if (!s) return; if ([...s].length > spec[4] || /\n/.test(s)) return toast(`每条最多 ${spec[4]} 字，一行`); const list = H[sec][k] || []; if (list.length >= spec[3]) return toast(`最多 ${spec[3]} 条`); if (list.some(x => hlKey(x) === hlKey(s))) return toast("已经有了"); H[sec] = { ...H[sec], [k]: [...list, s] }; draw(); };
  root.addEventListener("keydown", e => { const t = e.target; if (t.dataset?.tagin && e.key === "Enter" && !e.isComposing) { e.preventDefault(); addTag(t.dataset.tagin, t.dataset.k, t.value); } });
  root.addEventListener("change", e => { const t = e.target, sec = t.dataset.hs, k = t.dataset.k;
    if (t.dataset.ht) { if (t.type === "checkbox") H.enabled = t.checked; else { const s = t.value.trim(); if (!s || [...s].length > 20) { toast("口令要是 1–20 字的一行"); return draw(); } H.optOutPhrase = s; } }
    else if (t.dataset.hg) { H.perGroup = { ...(H.perGroup || {}), [t.dataset.hg]: { ...(H.perGroup?.[t.dataset.hg] || {}), enabled: t.checked } }; }
    else if (t.dataset.hgf) { const g = t.dataset.hgf, c = { ...H.perGroup[g] }; if (t.checked) delete c[t.dataset.f]; else c[t.dataset.f] = false; H.perGroup = { ...H.perGroup, [g]: c }; }
    else if (sec && t.type === "checkbox") H[sec] = { ...H[sec], [k]: t.checked };
    else if (sec && t.tagName === "SELECT") H[sec] = { ...H[sec], [k]: +t.value };
    else if (sec && t.dataset.ph) { const s = t.value.trim(); if (!s || [...s].length > 20) { toast("口令要是 1–20 字的一行"); return draw(); } H[sec] = { ...H[sec], [k]: s }; }
    else if (sec && t.type === "number") { const s = t.value.trim(), n = Number(s), mn = +t.dataset.min, mx = +t.dataset.max; if (s === "" || !(n >= mn && n <= mx) || (t.dataset.int && !Number.isInteger(n))) { toast(`要在 ${mn}–${mx} 之间${t.dataset.int ? "的整数" : ""}`); return draw(); } H[sec] = { ...H[sec], [k]: n }; }
    else return;
    draw(); });
  root.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.seg) { H[b.dataset.seg] = { ...H[b.dataset.seg], [b.dataset.k]: b.dataset.o }; return draw(); }
    if (b.dataset.tagdel) { const sec = b.dataset.tagdel, k = b.dataset.k; H[sec] = { ...H[sec], [k]: H[sec][k].filter((_, i) => i !== +b.dataset.i) }; return draw(); }
    if (b.dataset.tagadd) { const i = root.querySelector(`[data-tagin="${b.dataset.tagadd}"][data-k="${b.dataset.k}"]`); return addTag(b.dataset.tagadd, b.dataset.k, i.value); }
    if (b.dataset.sug) return addTag("quirk", "phrases", b.dataset.sug);
    if (b.dataset.hgunset) { H.perGroup = { ...H.perGroup }; delete H.perGroup[b.dataset.hgunset]; return draw(); }
    if (b.dataset.hopt) { const a = new Set(H.optOut[b.dataset.hopt]); a.has(b.dataset.kind) ? a.delete(b.dataset.kind) : a.add(b.dataset.kind); if (!a.size) return toast("至少留一项，不想要了就点「移出」"); H.optOut = { ...H.optOut, [b.dataset.hopt]: a.has("all") ? ["all"] : Object.keys(KINDS).filter(k => a.has(k)) }; return draw(); }
    if (b.dataset.hoptdel) { H.optOut = { ...H.optOut }; delete H.optOut[b.dataset.hoptdel]; return draw(); }
    if (b.hasAttribute("data-hoptadd")) { const id = root.querySelector("#hnoid").value.trim().toUpperCase(); if (!/^[0-9A-F]{32}$/.test(id)) return toast("openid 要是 32 位十六进制"); if (H.optOut?.[id]) return toast("已经在名单里了"); H.optOut = { ...(H.optOut || {}), [id]: ["all"] }; return draw(); }
    if (b.dataset.hreset) { const sec = b.dataset.hreset, nm = HL_SEC.find(x => x[0] === sec)[1];
      if (!await confirmDialog({ title: `「${nm}」恢复默认？`, body: "这一整段设置都会回到默认值。", ok: "继续", danger: true })) return;
      if (!await confirmDialog({ title: "确定恢复默认吗？", body: "旧设置会备份。其他还没保存的改动不会一起提交。", ok: "恢复默认", danger: true })) return;
      try { const r = await api.hlSet({ [sec]: null }); toast(`「${nm}」已恢复默认${r && "backup" in r ? (r.backup ? "，备份：" + r.backup : "（第一次写入，没有旧备份）") : ""}`); route(); } catch (x) { toast(funErr(x)); } return; }
    if (b.hasAttribute("data-reset")) { H = JSON.parse(JSON.stringify(H0)); return draw(); }
    if (b.hasAttribute("data-save")) { const c = changes(); if (!Object.keys(c).length) return; b.disabled = true;
      try { const r = await api.hlSet(c); toast(`已保存${r && "backup" in r ? (r.backup ? "，备份：" + r.backup : "（第一次写入，没有旧备份）") : ""}`); route(); } catch (x) { toast(funErr(x)); b.disabled = false; } }
  });
  draw();
};
// ---------- 拟人化 → 语音设置（HOSINO-VOICE-TTS v1）：只管「用什么声音、怎么念」；发语音的频率在「表情库 → 参数」 ----------
const VT_PROV = { xai: "Grok", fish: "Fish Audio", mimo: "小米 MiMo" };
const VT_FB = { xai: "Grok", mimo: "小米 MiMo", none: "不发" };
const VT_CUR_LABEL = { ...VT_PROV, none: "不发" };
const VT_BOOL = new Set(["voiceEmotion.enabled", "fish.emotionTags", "fish.perSentence", "fish.stripLeadingUm"]);
const VT_LABEL = { provider: "语音引擎", "fish.fallback": "Fish 失败时改用", "voiceEmotion.enabled": "让星野给语音加情绪标记", "voiceEmotion.markers": "允许的标记", "fish.emotionMap": "情绪映射表", "fish.defaultTag": "没有标记时用", "fish.emotionTags": "给每句加情绪标签", "fish.model": "Fish 模型", "fish.referenceId": "音色", "fish.temperature": "温度 temperature", "fish.topP": "top_p", "fish.timeoutSec": "每句超时", "fish.perSentence": "逐句合成再拼接", "fish.stripLeadingUm": "去掉开头的「嗯……」", "mimo.model": "MiMo 模型", "mimo.voice": "MiMo 音色" };
// 与后端校验一致：标记 1–8 字、不含【】[]
const vtMarkOk = k => typeof k === "string" && !!k.trim() && k.trim().length <= 8 && !/[【】\[\]]/.test(k);
const vtFreqLink = () => `<div class="section">发语音的频率</div><div class="card mlist vt-freq"><a class="mrow" href="#/voice#rules"><span class="mic">${ic("tune")}</span><span class="grow"><b>语音频率设置</b><small>概率、冷却、每日上限、静默时段、单句字数都在「表情库 → 参数」的语音那一段，这里不重复</small></span><span class="mchev">${ic("chev")}</span></a></div>`;
// ---------- 音色页（#/humanlike/voices），规格 staging/fish/voices-console-spec.md ----------
const VV_LANGS = [["", "全部语言"], ["zh", "中文"], ["ja", "日语"], ["en", "英语"], ["ko", "韩语"], ["fr", "法语"], ["de", "德语"], ["es", "西语"]];
const VV_LN = Object.fromEntries(VV_LANGS.filter(x => x[0]));
const vvT = t => scrub(t).replace(/好感度/g, "··").replace(/延迟/g, "耗时");
const vvE = t => esc(vvT(t));
const vvErr = x => x?.status === 423 ? "默认音色（星野）已锁定，不能删除" : notReady(x) ? "音色接口后台还没上线，再等等哦" : vvT(x?.message || "出错了");
const vvLangs = a => [].concat(a || []).map(x => VV_LN[x] || String(x)).join(" / ") || "未知";
const vvNum = n => n == null ? "—" : Number(n) >= 10000 ? (Number(n) / 10000).toFixed(1) + " 万" : String(n);
const VV_ID_RE = /^[0-9a-f]{32}$/, VV_ALIAS_RE = /^[a-z][a-z0-9_]{1,23}$/;
function vvParse(raw) { const m = /^(?:https?:\/\/(?:www\.)?fish\.audio\/(?:[a-z-]+\/)?m\/)?([0-9a-f]{32})\/?(?:[?#].*)?$/i.exec(String(raw || "").trim()); return m ? m[1].toLowerCase() : null; }
function vvNamesErr(alias, nick, desc) {
  if (!VV_ALIAS_RE.test(alias)) return "别名要 2–24 位小写字母、数字或下划线，字母开头";
  if (nick.length > 10) return "中文叫法最多 10 个";
  if (nick.some(x => x.length > 16 || /[|`]/.test(x))) return "每个叫法 1–16 字，不能含 | 或 `";
  if (desc.length > 120 || /[|\r\n]/.test(desc)) return "用途说明最多 120 字一行，不能含 |";
  return "";
}
const vvCover = (id, title) => VV_ID_RE.test(id || "") ? `<span class="vv-cov"><img loading="lazy" alt="" src="/api/fun/voices/cover?id=${id}"><i aria-hidden="true">${esc([...vvT(title || "?")][0] || "?")}</i></span>` : `<span class="vv-cov"><i aria-hidden="true">${esc([...vvT(title || "?")][0] || "?")}</i></span>`;
let vvAudio = null, vvUrl = null; const vvBusy = new Set();
function vvStop() { vvReady = null; if (vvAudio) { vvAudio.pause(); vvAudio = null; } if (vvUrl) { URL.revokeObjectURL(vvUrl); vvUrl = null; } document.querySelectorAll(".vv-play.on,.vv-play.ready").forEach(b => { b.classList.remove("on", "ready"); b.lastChild.textContent = "试听"; }); }
let vvReady = null; // autoplay 被拦时保留已下载的音频：{ key, a }，再点一次直接播放、不重新请求
const VV_DECODE = "这段试听音频解不开，可能是生成出错了，稍后再试";
const vvOn = (btn, a) => { btn.classList.remove("ready"); btn.classList.add("on"); btn.lastChild.textContent = "停止"; a.onended = () => vvStop(); a.onerror = () => { vvStop(); toast(VV_DECODE); }; };
const vvHold = (btn, key, a) => { vvReady = { key, a }; vvAudio = a; btn.classList.add("ready"); btn.lastChild.textContent = "点一下播放"; toast("浏览器拦了自动播放，再点一次就能听（不会重新请求）"); };
async function vvPlay(btn, key, text) {
  if (vvReady && vvReady.key === key && btn.classList.contains("ready")) { const a = vvReady.a; vvReady = null;
    try { await a.play(); vvOn(btn, a); } catch (e) { if (e?.name === "NotAllowedError") vvHold(btn, key, a); else { vvStop(); toast(VV_DECODE); } } return; }
  const was = btn.classList.contains("on"); vvStop(); if (was) return;
  if (vvBusy.has(key)) { toast("正在请求试听，稍等；试听会消耗额度"); return; }
  if ([...text].length > 40) { toast("试听台词最多 40 字"); return; }
  vvBusy.add(key); btn.disabled = true; btn.lastChild.textContent = "加载中…";
  let csp = false; const onV = e => { if (String(e.blockedURI || "").startsWith("blob") && /^(media-src|default-src)/.test(e.effectiveDirective || e.violatedDirective || "")) csp = true; };
  document.addEventListener("securitypolicyviolation", onV);
  try {
    const blob = await api.vvPreviewBlob(key, text);
    vvStop(); vvUrl = URL.createObjectURL(blob); const a = new Audio(); a.preload = "none"; a.src = vvUrl; vvAudio = a;
    let err = null; try { await a.play(); } catch (e) { err = e; }
    if (err) {
      for (let i = 0; i < 6 && !csp; i++) await new Promise(r => setTimeout(r, 50)); // violation 事件是异步派发的，等一小会儿
      if (csp) { // 只有确实是 CSP 拦了 blob: 才回落同源地址：刚合成的这句已进后端缓存，命中不再计次
        if (vvUrl) { URL.revokeObjectURL(vvUrl); vvUrl = null; }
        a.src = "/api/fun/voices/preview?" + new URLSearchParams(text ? { id: key, text } : { id: key });
        try { await a.play(); err = null; } catch (e2) { err = e2; } }
      if (err) { if (err.name === "NotAllowedError") { vvHold(btn, key, a); return; } vvStop(); toast(VV_DECODE); btn.lastChild.textContent = "试听"; return; }
    }
    vvOn(btn, a);
  } catch (x) { toast(x?.status != null ? vvErr(x) : VV_DECODE); btn.lastChild.textContent = "试听"; }
  finally { document.removeEventListener("securitypolicyviolation", onV); btn.disabled = false; vvBusy.delete(key); }
}
async function voicesView(v) {
  vvStop();
  const head = top("音色", "拟人化 · 星野的声音库").replace('href="#/more" aria-label="返回更多"', 'href="#/humanlike" aria-label="返回拟人化"');
  let L; try { L = await api.vvList(); } catch (x) {
    paint(v, head + `<div class="card empty"><div class="em">🎙️</div><div>${notReady(x) ? "音色接口后台还没上线，上线后这里会显示音色手册" : "音色手册没读出来：" + vvE(x.message)}</div><button class="btn" data-vvre style="margin-top:14px">再试一次</button></div>`);
    v.querySelector("[data-vvre]").onclick = () => route(); return;
  }
  const voices = Array.isArray(L?.voices) ? L.voices : [];
  const have = new Set(voices.map(x => x.id));
  const isDef = x => x.isDefault === true || (L?.default && x.alias === L.default);
  const isLocked = x => x.locked === true;
  const sorted = [...voices].sort((a, b) => isDef(b) - isDef(a));
  const card = x => `<div class="card vv-item${isDef(x) ? " vv-def" : ""}">
    <div class="vv-h">${vvCover(x.id, x.title || x.alias)}<b>${isDef(x) ? "⭐ " : ""}${vvE(x.title || x.alias)}</b><span class="vv-badges">${isDef(x) ? `<span class="pill vv-lock">默认</span>` : `<span class="pill">备用 · 仅点名</span>`}${isLocked(x) ? `<span class="pill vv-lock" title="默认音色，已锁定">🔒 已锁定</span>` : ""}</span></div>
    <div class="vv-kv"><span>别名</span><code>${vvE(x.alias)}</code></div>
    <div class="vv-kv"><span>中文叫法</span><em>${(x.nicknames || []).length ? (x.nicknames || []).map(vvE).join("、") : "—"}</em></div>
    <div class="vv-kv"><span>Fish id</span><code class="vv-id">${vvE(x.id)}</code></div>
    <div class="vv-kv"><span>素材语言</span><em>${esc(vvLangs(x.source_lang))}</em></div>
    <div class="vv-kv"><span>可输出语言</span><em>${esc(vvLangs(x.output_langs))}</em></div>
    <div class="vv-kv"><span>点赞</span><em>${vvNum(x.like_count ?? x.likes)}</em></div>
    <div class="vv-kv"><span>使用次数</span><em>${vvNum(x.use_count ?? x.uses)}</em></div>
    ${x.description ? `<div class="vv-kv"><span>用途说明</span><em>${vvE(x.description)}</em></div>` : ""}
    <div class="vv-acts"><button class="btn vv-play" data-vvplay="${esc(x.alias)}" title="试听会消耗额度">${ic("play")}<span>试听</span></button>
      <a class="btn" href="https://fish.audio/m/${esc(x.id)}" target="_blank" rel="noopener noreferrer">Fish 页面 ↗</a>
      ${isLocked(x) ? "" : `<button class="btn danger" data-vvdel="${esc(x.alias)}">${ic("trash")}<span>删除</span></button>`}</div></div>`;
  const root = paint(v, head + `<div class="vv-page">
    <div class="hl-tip">ℹ️ 默认音色固定是星野中配（hoshino_zh）。这里添加的都是<b>备用音色，仅在点名时使用，默认音色不变</b>。改完下一条语音就生效。</div>
    <label class="field vv-tt"><span>试听台词（选填，≤40 字；留空用默认台词）</span><input class="input" id="vvtext" maxlength="40" autocomplete="off" placeholder="老师，今天也要一起偷懒吗？"></label>
    <p class="muted vv-quota">🔊 试听每次都会消耗 Fish 额度（同一句命中缓存不计），点了才会请求。</p>
    <div class="section">音色手册（${voices.length}）</div>${sorted.map(card).join("") || `<div class="card empty">手册里还没有音色</div>`}
    <div class="section">搜索 Fish 音色</div>
    <div class="card"><label class="field"><span>按角色名搜索 Fish 社区</span><input class="input" id="vvq" type="search" maxlength="40" placeholder="比如：星野、Hoshino" autocomplete="off" enterkeyhint="search"></label>
      <label class="field"><span>语言</span><select class="input" id="vvlang">${VV_LANGS.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></label>
      <button class="btn" data-vvgo style="width:100%">${ic("search")}<span>搜索 Fish 音色</span></button>
      <div id="vvres" aria-live="polite"><p class="muted">输入角色名开始搜索</p></div></div>
    <div class="section">直接贴 Fish 链接</div>
    <div class="card"><label class="field"><span>fish.audio/m/… 链接或 32 位 id</span><input class="input" id="vvurl" autocomplete="off" inputmode="url" placeholder="https://fish.audio/m/…"></label>
      <button class="btn primary" data-vvurl style="width:100%">${ic("plus")}<span>添加到音色库</span></button></div>
    <details class="card vv-adv" data-vvadv><summary class="vv-advsum">高级</summary><p class="muted">添加和删除时会自动重建，这里只是备用。手改过 voices.json 之后，可以用它按音色库重写「音色手册.md」里的表格（只改表格，其余文字不动）。</p><button class="btn" data-vvregen style="width:100%">重建手册表格</button></details></div>`);
  const tt = () => root.querySelector("#vvtext").value.trim();
  root.addEventListener("error", e => { if (e.target?.matches?.(".vv-cov img")) e.target.remove(); }, true);
  root.onclick = e => { const p = e.target.closest("[data-vvplay]"), a = e.target.closest("[data-vvadd]"); if (p && !p.disabled) vvPlay(p, p.dataset.vvplay, tt()); if (a) vvAddForm(a.dataset.vvadd); };
  root.querySelectorAll("[data-vvdel]").forEach(b => b.onclick = async () => {
    const a = b.dataset.vvdel; b.disabled = true;
    try {
      const pv = await api.vvDel(a, false); const rm = pv?.preview?.remove || {};
      const ok = await confirmDialog({ title: `确认删除音色 ${vvT(a)}？`, danger: true, ok: "确认删除", body: `<b>${vvE(rm.title || a)}</b> · <code class="vv-id">${vvE(rm.id || "")}</code><br>手册表格删除这一行：<pre class="vv-row">${vvE(pv?.preview?.manualRowRemoved || "")}</pre>删除后还剩 ${esc(pv?.preview?.remaining ?? "?")} 个音色，旧文件会自动备份。` });
      if (ok) { await api.vvDel(a, true); toast("已删除，旧手册已备份"); route(); return; }
    } catch (x) { toast(vvErr(x)); }
    b.disabled = false;
  });
  root.querySelector("[data-vvregen]").onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const pv = await api.vvRegen(false);
      if (pv?.changed === false) { toast("手册表格已经是最新的，不用重建"); b.disabled = false; return; }
      const rows = (Array.isArray(pv?.preview) ? pv.preview : []).map(vvE).join("\n");
      if (await confirmDialog({ title: "重建手册表格？", ok: "重建", body: `会把表格数据行改成下面这样（旧手册自动备份）：<pre class="vv-row">${rows}</pre>` }) && await confirmDialog({ title: "确定重建吗？", ok: "确定重建", danger: true, body: "表头和其余说明文字不动。" })) { const r = await api.vvRegen(true); toast(r?.changed ? "已重建，旧手册已备份" : "没有变化"); }
    } catch (x) { toast(vvErr(x)); }
    b.disabled = false;
  };
  const res = root.querySelector("#vvres"), q = root.querySelector("#vvq"), lang = root.querySelector("#vvlang");
  let seq = 0, tmr;
  const draw = items => res.innerHTML = items.length ? items.map(x => `<div class="vv-r">
      <div class="vv-h">${vvCover(x.id, x.title)}<b>${vvE(x.title || "（无名）")}</b>${x.author ? `<small class="muted">by ${vvE(x.author)}</small>` : ""}</div>
      <div class="muted vv-meta">${esc(vvLangs(x.languages))} · 点赞 ${vvNum(x.like_count)} · 使用 ${vvNum(x.use_count)}</div>
      ${x.description ? `<p class="muted vv-desc">${vvE(String(x.description).slice(0, 200))}</p>` : ""}
      <div class="vv-acts"><button class="btn vv-play" data-vvplay="${esc(x.id)}" title="试听会消耗额度">${ic("play")}<span>试听</span></button>
        ${have.has(x.id) || x.inLibrary ? `<span class="pill vv-in">已在库里</span>` : `<button class="btn primary" data-vvadd="${esc(x.id)}">${ic("plus")}<span>加入</span></button>`}
        <a class="btn" href="https://fish.audio/m/${esc(x.id)}" target="_blank" rel="noopener noreferrer">fish.audio ↗</a></div></div>`).join("") : `<p class="muted">没搜到，换个名字或语言试试</p>`;
  const search = async () => {
    const t = q.value.trim(), my = ++seq; if (!t) { res.innerHTML = `<p class="muted">输入角色名开始搜索</p>`; return; }
    res.innerHTML = `<p class="muted vv-loading">搜索中…</p>`;
    try { const r = await api.vvSearch(t, lang.value, 20); if (my !== seq) return; draw((Array.isArray(r?.items) ? r.items : []).filter(x => VV_ID_RE.test(x?.id || ""))); }
    catch (x) { if (my !== seq) return; res.innerHTML = `<div class="fun-warn vv-fail">搜索失败：${vvE(vvErr(x))}<br><button class="btn" data-vvretry style="margin-top:8px">重试</button></div>`; res.querySelector("[data-vvretry]").onclick = search; }
  };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(search, 450); };
  q.onkeydown = e => { if (e.key === "Enter") { clearTimeout(tmr); search(); } };
  lang.onchange = () => { clearTimeout(tmr); search(); };
  root.querySelector("[data-vvgo]").onclick = () => { clearTimeout(tmr); search(); };
  root.querySelector("[data-vvurl]").onclick = () => { const id = vvParse(root.querySelector("#vvurl").value); if (!id) { toast("链接格式不对：要 https://fish.audio/m/<32 位 id> 或直接 32 位 id"); return; } if (have.has(id)) { toast("这个音色已经在库里了"); return; } vvAddForm(id); };
}
function vvAddForm(id) {
  const close = sheet(`<h2>添加到音色库</h2><p class="muted" style="font-size:14px">Fish id <code class="vv-id">${esc(id)}</code><br><b>仅在点名时使用，默认音色不变。</b></p>
    <label class="field"><span>别名（英文，2–24 位）</span><input class="input" id="vva-al" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="比如 shiroko_ja"></label>
    <label class="field"><span>中文叫法（逗号分隔，最多 10 个）</span><input class="input" id="vva-nn" maxlength="200" autocomplete="off" placeholder="比如：白子，日配白子"></label>
    <label class="field"><span>用途说明（选填，≤120 字）</span><input class="input" id="vva-de" maxlength="120" autocomplete="off"></label>
    <div style="display:flex;gap:10px;margin-top:6px"><button class="btn" data-no style="flex:1">取消</button><button class="btn primary" data-yes style="flex:1">下一步：预览</button></div>`, el => {
    el.querySelector("[data-no]").onclick = () => close();
    const yes = el.querySelector("[data-yes]"), al = el.querySelector("#vva-al");
    yes.onclick = async () => {
      const alias = al.value.trim(), nicknames = [...new Set(el.querySelector("#vva-nn").value.split(/[,，、]/).map(x => x.trim()).filter(Boolean))], description = el.querySelector("#vva-de").value.trim();
      const bad = vvNamesErr(alias, nicknames, description); if (bad) { toast(bad); al.focus(); return; }
      const body = { id, alias, nicknames, description }; yes.disabled = true;
      let pv; try { pv = await api.vvAdd(body, false); }
      catch (x) { toast(x?.status === 409 && x.code !== "dup_id" ? vvErr(x) + "，换个别名或叫法吧" : vvErr(x)); yes.disabled = false; if (x?.status === 409 || x?.status === 400) { al.focus(); al.select(); } return; }
      close(true);
      const e = pv?.preview?.entry || {}, f = pv?.preview?.fish || {};
      const ok = await confirmDialog({ title: "确认添加音色", ok: "确认添加", body: `<b>${vvE(e.title || f.title || alias)}</b>${f.author ? ` · by ${vvE(f.author)}` : ""}<br>别名 <code>${vvE(e.alias || alias)}</code>；中文叫法：${(e.nicknames || nicknames).map(vvE).join("、") || "—"}<br>素材语言：${esc(vvLangs(e.source_lang))}；可输出语言：${esc(vvLangs(e.output_langs))}<br>${e.style || description ? "用途说明：" + vvE(e.style || description) + "<br>" : ""}手册表格新增一行：<pre class="vv-row">${vvE(pv?.preview?.manualRow || "")}</pre><b>仅在点名时使用，默认音色不变。</b>` });
      if (!ok) return;
      try { await api.vvAdd(body, true); toast("已添加备用音色"); route(); } catch (x) { toast(vvErr(x)); }
    };
    setTimeout(() => al.focus(), 50);
  });
}
async function voiceTtsView(v) {
  const head = top("语音设置", "拟人化 · 星野的声音").replace('href="#/more" aria-label="返回更多"', 'href="#/humanlike" aria-label="返回拟人化"');
  const [g, o, lb] = await Promise.allSettled([api.vtGet(), api.vtOptions(), api.vvList()]);
  const libDef = lb.status === "fulfilled" && Array.isArray(lb.value?.voices) ? lb.value.voices.find(x => x?.isDefault === true) || null : null;
  if (g.status === "rejected") { const x = g.reason; if (x?.status === 401) throw x;
    const r0 = paint(v, head + `<div class="card empty vt"><b>🔈</b>${notReady(x) ? "语音设置的后台接口还没上线，上线后这里就能用" : "语音设置没读出来：" + esc(scrub(x?.message || "未知错误"))}<br><br><button type="button" class="btn" data-vtretry>再试一次</button></div>` + vtFreqLink());
    r0.querySelector("[data-vtretry]").onclick = () => route(); return; }
  const d = g.value || {}; let OPT = o.status === "fulfilled" && o.value && typeof o.value === "object" ? o.value : null; const optErr = OPT ? "" : (notReady(o.reason) ? "后台还没开放选项接口" : scrub(o.reason?.message || "未知错误"));
  const K = d.keyPresent === true ? true : d.keyPresent === false ? false : null;
  const clone = x => JSON.parse(JSON.stringify(x ?? {}));
  const P0 = clone(d.params); for (const s of ["voiceEmotion", "fish", "mimo"]) if (!P0[s] || typeof P0[s] !== "object") P0[s] = {};
  let P = clone(P0);
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changes = () => { const c = {}; if (!eq(P.provider, P0.provider)) c.provider = P.provider ?? null;
    for (const s of ["voiceEmotion", "fish", "mimo"]) { const so = {}; for (const k of new Set([...Object.keys(P0[s]), ...Object.keys(P[s])])) { const a = P0[s][k], b = P[s][k]; const same = VT_BOOL.has(s + "." + k) ? (a === true) === (b === true) : eq(a, b); if (!same) so[k] = b === undefined ? null : b; } if (Object.keys(so).length) c[s] = so; }
    return c; };
  const sw = (key, on, lab) => `<span class="switch"><input type="checkbox" data-vb="${key}" ${on ? "checked" : ""} aria-label="${esc(lab)}"><i></i></span>`;
  const swRow = (key, desc = "") => { const [s, k] = key.split("."); return `<label class="switchrow"><div class="grow"><b>${esc(VT_LABEL[key])}</b>${desc ? `<div class="faint fs">${desc}</div>` : ""}</div>${sw(key, P[s][k] === true, VT_LABEL[key])}</label>`; };
  const sel = (key, items, cur) => { const has = items.some(([val]) => val === cur); const list = has || cur == null ? items : [[cur, (VT_CUR_LABEL[cur] || String(cur)) + "（当前）"], ...items];
    return `<select class="input" data-vs="${key}" aria-label="${esc(VT_LABEL[key] || key)}" ${OPT ? "" : "disabled"}>${list.map(([val, t]) => `<option value="${esc(val)}" ${val === cur ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`; };
  const tags = () => OPT && Array.isArray(OPT.emotionTags) ? OPT.emotionTags.map(String) : [];
  const draw = () => { const y = scrollY, F = P.fish, E = P.voiceEmotion, fb = F.fallback;
    const provs = OPT && Array.isArray(OPT.providers) ? OPT.providers.map(x => [String(x.id), String(x.label || VT_PROV[x.id] || x.id)]) : [];
    const fbs = OPT && Array.isArray(OPT.fallbacks) ? OPT.fallbacks.map(x => [String(x), VT_FB[x] || String(x)]) : [];
    const voices = OPT && Array.isArray(OPT.voices) ? OPT.voices.filter(x => x && /^[0-9a-f]{32}$/.test(x.id)) : [];
    const knownVoice = voices.some(x => x.id === F.referenceId); const manual = root.dataset.manual === "1" || (!!F.referenceId && !knownVoice);
    const map = F.emotionMap && typeof F.emotionMap === "object" ? F.emotionMap : {}; const mkeys = Object.keys(map); const marks = Array.isArray(E.markers) ? E.markers : [];
    const fbTxt = fb === "none" ? "Fish 合成不了时就不发语音" : `会一直用 ${VT_FB[fb] || fb || "备用引擎"} 发`;
    root.querySelector("#vtf").innerHTML = `
      ${optErr ? `<div class="fun-warn vt-optwarn" role="status">⚠️ <b>选项没加载出来</b><span>${esc(optErr)}。引擎、音色、情绪标签这些下拉先只显示当前值、不能改，其它设置照常能改。</span><button type="button" class="btn sm" data-vtopt>重新加载选项</button></div>` : ""}
      <div class="section">引擎</div><div class="card form">
        <label class="field"><span>${VT_LABEL.provider}</span>${sel("provider", provs, P.provider)}</label>
        <label class="field"><span>${VT_LABEL["fish.fallback"]}</span>${sel("fish.fallback", fbs, fb)}</label>
        <div class="row vt-key"><div class="grow"><b>Fish 密钥</b><div class="faint fs">只显示有没有配置，密钥本身不会出现在这里，也不能在这里填</div></div><span class="pill ${K === true ? "ok" : K === false ? "warn" : ""}" data-vtkey="${K}">${K === true ? "已配置" : K === false ? "未配置（会一直回落）" : "未知"}</span></div>
        ${libDef && typeof libDef.id === "string" && typeof F.referenceId === "string" && F.referenceId && libDef.id.toLowerCase() !== F.referenceId.toLowerCase() ? `<div class="hl-need" role="status" data-vtdefmis>⚠️ 默认音色和音色库标记的默认不一致<span class="faint fs" style="display:block">这里填的是 <code class="mono">${esc(F.referenceId)}</code>，音色库标记的默认是 ${vvE(libDef.title || libDef.alias || "")}（<code class="mono">${esc(libDef.id)}</code>）。不会自动改，也不影响保存。</span></div>` : ""}
        ${K === false ? `<div class="hl-need" role="status">⚠️ Fish 密钥未配置，会一直用 ${esc(VT_FB[F.fallback] || VT_FB.xai)} 发</div>` : ""}
      </div>
      <div class="section">情绪标记 <span class="faint fs" style="font-weight:400">只在语音引擎是 Fish 时有声音效果，其它引擎会把认得的标记删掉再念</span></div>
      <div class="card form fun-sec ${E.enabled === true ? "" : "off"}">
        ${swRow("voiceEmotion.enabled", "关着时提示词与现在完全一样")}
        ${P.provider !== "fish" && E.enabled === true ? `<div class="hl-need soft">ℹ️ 现在的引擎不是 Fish，情绪标记不会有声音效果</div>` : ""}
        <div class="field"><span>${VT_LABEL["voiceEmotion.markers"]} <span class="faint fs">（${marks.length} / 30，一个都不选 = 用映射表全部）</span></span>
          <div class="chips vt-chips">${mkeys.map(k => `<button type="button" class="chip" aria-pressed="${marks.includes(k)}" data-vmark="${esc(k)}" ${!marks.includes(k) && marks.length >= 30 ? "disabled" : ""}>${esc(k)}</button>`).join("") || `<span class="faint fs">映射表是空的</span>`}</div></div>
        <label class="field"><span>${VT_LABEL["fish.defaultTag"]}</span>${sel("fish.defaultTag", [["", "无"], ...tags().map(t => [t, t])], F.defaultTag ?? "")}</label>
        ${swRow("fish.emotionTags")}
        <details class="vt-map"><summary>${VT_LABEL["fish.emotionMap"]} <span class="faint fs">（${mkeys.length} / 60 条，中文标记 → 标签）</span></summary>
          <div class="vt-rows">${mkeys.map((k, i) => `<div class="inrow vt-mrow"><input class="input" value="${esc(k)}" maxlength="8" data-vmk="${i}" aria-label="第 ${i + 1} 条的中文标记" autocomplete="off"><span class="faint">→</span>${OPT ? `<select class="input" data-vmv="${i}" aria-label="第 ${i + 1} 条的标签">${[...new Set([...tags(), map[k]])].map(t => `<option value="${esc(t)}" ${t === map[k] ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : `<span class="mono vt-tagro">${esc(map[k])}</span>`}<button type="button" class="btn sm vt-del" data-vmdel="${i}" aria-label="删除「${esc(k)}」">✕</button></div>`).join("")}</div>
          ${mkeys.length < 60 && OPT ? `<div class="inrow vt-mrow vt-add"><input class="input" id="vtnk" maxlength="8" placeholder="新标记，1–8 字" autocomplete="off" aria-label="新标记"><span class="faint">→</span><select class="input" id="vtnv" aria-label="新标记的标签">${tags().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select><button type="button" class="btn sm" data-vmadd>添加</button></div>` : ""}
          <div class="fun-reset"><button type="button" class="btn sm" data-vmreset>↺ 映射表恢复默认…</button></div>
        </details>
      </div>
      <div class="section">Fish 合成</div><div class="card form">
        <label class="field"><span>${VT_LABEL["fish.model"]}</span><input class="input" value="${esc(F.model ?? "")}" maxlength="40" data-vt="fish.model" autocomplete="off" spellcheck="false"><div class="faint fs">字母数字 . _ -，最多 40 个。11-30 以后改用 s2.1-pro，按量付费。</div></label>
        <label class="field"><span>${VT_LABEL["fish.referenceId"]}</span>${OPT ? `<select class="input" data-vs="fish.voice" aria-label="音色">${voices.map(x => `<option value="${esc(x.id)}" ${!manual && x.id === F.referenceId ? "selected" : ""}>${esc(x.title || x.alias || x.id)}${x.default ? "（默认）" : ""}</option>`).join("")}<option value="__manual" ${manual ? "selected" : ""}>手动填写 32 位 ID…</option></select>` : ""}
          ${manual || !OPT ? `<input class="input mono" value="${esc(F.referenceId ?? "")}" maxlength="32" data-vt="fish.referenceId" placeholder="32 位十六进制" autocomplete="off" spellcheck="false" aria-label="音色 ID" style="margin-top:8px">` : ""}</label>
        <label class="field"><span>${VT_LABEL["fish.temperature"]} <b class="tnum">${(+(F.temperature ?? 0)).toFixed(2)}</b></span><input type="range" class="range" min="0" max="1" step="0.05" value="${esc(F.temperature ?? 0.5)}" data-vr="fish.temperature"></label>
        <label class="field"><span>${VT_LABEL["fish.topP"]} <b class="tnum">${(+(F.topP ?? 0)).toFixed(2)}</b></span><input type="range" class="range" min="0" max="1" step="0.05" value="${esc(F.topP ?? 0.6)}" data-vr="fish.topP"></label>
        <label class="field"><span>${VT_LABEL["fish.timeoutSec"]}</span><div class="inrow"><input class="input" type="number" min="3" max="120" step="any" inputmode="decimal" value="${esc(F.timeoutSec ?? "")}" data-vn="fish.timeoutSec" data-min="3" data-max="120"><span class="faint">秒（3–120）</span></div></label>
        ${swRow("fish.perSentence")}
        ${swRow("fish.stripLeadingUm")}
      </div>
      <div class="section">MiMo（备用）</div><div class="card form">
        <label class="field"><span>${VT_LABEL["mimo.model"]}</span><input class="input" value="${esc(P.mimo.model ?? "")}" maxlength="40" data-vt="mimo.model" autocomplete="off"></label>
        <label class="field"><span>${VT_LABEL["mimo.voice"]}</span><input class="input" value="${esc(P.mimo.voice ?? "")}" maxlength="40" data-vt="mimo.voice" autocomplete="off"></label>
      </div>
      <button type="button" class="btn danger" data-vtall style="width:100%;margin-top:14px">全部恢复默认…</button>
      ${vtFreqLink()}`;
    root.querySelector("#vtsb").hidden = !Object.keys(changes()).length; scrollTo(0, y); };
  const root = paint(v, head + `<div class="hl-need soft vt-tip">ℹ️ 改动下一次合成就生效；情绪标记提示约 5 秒内生效，不用重启。</div><div id="vtf" class="vt"></div>` + dirtyBar("vtsb", "保存语音设置"));
  root.classList.add("vt-page");
  const setF = (key, val) => { const [s, k] = key.split("."); if (!k) P[s] = val; else P[s] = { ...P[s], [k]: val }; };
  const mapEntries = () => Object.entries(P.fish.emotionMap && typeof P.fish.emotionMap === "object" ? P.fish.emotionMap : {});
  const bad = m => { toast(m); draw(); };
  root.addEventListener("input", e => { const t = e.target; if (t.dataset.vr) { const n = Math.round(+t.value * 100) / 100; setF(t.dataset.vr, n); t.closest("label").querySelector(".tnum").textContent = n.toFixed(2); root.querySelector("#vtsb").hidden = !Object.keys(changes()).length; } });
  root.addEventListener("change", e => { const t = e.target;
    if (t.dataset.vb) { setF(t.dataset.vb, t.checked); return draw(); }
    if (t.dataset.vs === "fish.voice") { if (t.value === "__manual") root.dataset.manual = "1"; else { root.dataset.manual = ""; setF("fish.referenceId", t.value); } return draw(); }
    if (t.dataset.vs) { setF(t.dataset.vs, t.value); return draw(); }
    if (t.dataset.vt) { const key = t.dataset.vt, s = t.value.trim();
      if (key === "fish.model" && !/^[A-Za-z0-9._-]{1,40}$/.test(s)) return bad("模型名只能是 1–40 位字母数字 . _ -");
      if (key === "fish.referenceId") { const id = s.toLowerCase(); if (!/^[0-9a-f]{32}$/.test(id)) return bad("音色 ID 要是 32 位十六进制"); setF(key, id); return draw(); }
      if (key.startsWith("mimo.") && (!s || s.length > 40)) return bad("要是 1–40 字");
      setF(key, s); return draw(); }
    if (t.dataset.vn) { const s = t.value.trim(), n = Number(s), mn = +t.dataset.min, mx = +t.dataset.max; if (s === "" || !Number.isFinite(n) || n < mn || n > mx) return bad(`要在 ${mn}–${mx} 之间`); setF(t.dataset.vn, n); return draw(); }
    if (t.dataset.vmk != null) { const i = +t.dataset.vmk, ent = mapEntries(), old = ent[i][0], s = t.value.trim();
      if (!vtMarkOk(s)) return bad("标记要 1–8 字，不含【】[]"); if (s !== old && ent.some(([k]) => k === s)) return bad("映射表里已经有这个标记了");
      ent[i] = [s, ent[i][1]]; setF("fish.emotionMap", Object.fromEntries(ent)); if (Array.isArray(P.voiceEmotion.markers)) setF("voiceEmotion.markers", P.voiceEmotion.markers.map(m => m === old ? s : m)); return draw(); }
    if (t.dataset.vmv != null) { const ent = mapEntries(); ent[+t.dataset.vmv] = [ent[+t.dataset.vmv][0], t.value]; setF("fish.emotionMap", Object.fromEntries(ent)); return draw(); }
  });
  root.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.vmark != null) { const k = b.dataset.vmark, m = Array.isArray(P.voiceEmotion.markers) ? P.voiceEmotion.markers : []; if (!m.includes(k) && m.length >= 30) return toast("最多选 30 个"); setF("voiceEmotion.markers", m.includes(k) ? m.filter(x => x !== k) : [...m, k]); return draw(); }
    if (b.dataset.vmdel != null) { const ent = mapEntries(), [k] = ent[+b.dataset.vmdel]; ent.splice(+b.dataset.vmdel, 1); setF("fish.emotionMap", Object.fromEntries(ent)); const m = P.voiceEmotion.markers; if (Array.isArray(m) && m.includes(k)) { setF("voiceEmotion.markers", m.filter(x => x !== k)); toast(`「${k}」也从允许的标记里去掉了`); } return draw(); }
    if (b.hasAttribute("data-vmadd")) { const k = root.querySelector("#vtnk").value.trim(), tg = root.querySelector("#vtnv").value, ent = mapEntries();
      if (!vtMarkOk(k)) return toast("标记要 1–8 字，不含【】[]"); if (ent.some(([x]) => x === k)) return toast("映射表里已经有这个标记了"); if (ent.length >= 60) return toast("最多 60 条");
      setF("fish.emotionMap", Object.fromEntries([...ent, [k, tg]])); draw(); root.querySelector(".vt-map").open = true; return; }
    if (b.hasAttribute("data-vtopt")) { b.disabled = true; try { await api.vtOptions(); route(); } catch (x) { toast("还是没加载出来：" + scrub(x.message || "")); b.disabled = false; } return; }
    if (b.hasAttribute("data-vmreset") || b.hasAttribute("data-vtall")) { const all = b.hasAttribute("data-vtall"), nm = all ? "全部语音设置" : "情绪映射表";
      if (!await confirmDialog({ title: `${nm}恢复默认？`, body: all ? "引擎、情绪标记、Fish 和 MiMo 的设置都会回到默认值。" : "映射表会回到默认的 30 条；不在默认表里的「允许的标记」需要你重新选。", ok: "继续", danger: true })) return;
      if (!await confirmDialog({ title: "确定恢复默认吗？", body: "旧设置会备份。其他还没保存的改动不会一起提交。", ok: "恢复默认", danger: true })) return;
      try { const r = await api.vtSet(all ? { provider: null, voiceEmotion: null, fish: null, mimo: null } : { fish: { emotionMap: null }, ...(Array.isArray(P0.voiceEmotion.markers) && P0.voiceEmotion.markers.length ? { voiceEmotion: { markers: null } } : {}) }); toast(`${nm}已恢复默认${r?.backup ? "，旧设置已备份" : ""}`); route(); } catch (x) { toast(funErr(x)); } return; }
    if (b.hasAttribute("data-reset")) { P = clone(P0); root.dataset.manual = ""; return draw(); }
    if (b.hasAttribute("data-save")) { const c = changes(); if (!Object.keys(c).length) return;
      const names = [...("provider" in c ? ["provider"] : []), ...["voiceEmotion", "fish", "mimo"].flatMap(s => Object.keys(c[s] || {}).map(k => s + "." + k))].map(k => VT_LABEL[k] || k);
      if (!await confirmDialog({ title: "保存语音设置？", body: `会改这些：${esc(names.join("、"))}。下一次合成就生效。`, ok: "保存" })) return;
      b.disabled = true; try { const r = await api.vtSet(c); toast(`已保存${r?.backup ? "，旧设置已备份" : ""}`); route(); } catch (x) { toast(funErr(x)); b.disabled = false; } }
  });
  draw();
}
VIEWS.config = async v => {
  const c = await api.config(); const cfg = c.config || {};
  const want = sessionStorage.getItem("hs-cfg"); sessionStorage.removeItem("hs-cfg"); const wantTop = want?.split(".")[0];
  paint(v, top("配置", "只读 · 敏感信息已隐藏") + `<div class="card" style="margin-bottom:14px;display:flex;gap:10px;align-items:center"><span>🔒</span><div class="muted" style="font-size:14px">这里只能查看。密钥、令牌之类的内容已经替你藏好了。${c.path ? `<br><span class="mono faint">${esc(c.path)}</span>` : ""}</div></div>
    <div class="list tree">${Object.entries(cfg).map(([k, val], i) => `<details ${(wantTop ? k === wantTop : i === 0) ? "open" : ""} ${k === wantTop ? 'id="cfg-hit"' : ""}><summary>${esc(k)} <span class="faint" style="font-weight:400;font-size:13px">${Array.isArray(val) ? val.length + " 项" : val && typeof val === "object" ? Object.keys(val).length + " 项" : esc(String(val))}</span></summary>${val && typeof val === "object" ? jsonView(val) : ""}</details>`).join("") || `<div class="empty">配置为空</div>`}</div>`);
};

// ================= v2 功能 =================
// 通用：确认弹窗（可要求输入文字二次确认）
function confirmDialog({ title, body = "", ok = "确定", danger = false, typeText = "" }) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const close = sheet(`<h2>${esc(title)}</h2><div class="muted" style="font-size:14.5px;margin-bottom:16px">${body}</div>
      ${typeText ? `<label class="field"><span>请输入「${esc(typeText)}」确认</span><input class="input" id="cf-in" autocomplete="off"></label>` : ""}
      <div style="display:flex;gap:10px;margin-top:6px"><button class="btn" data-no style="flex:1">再想想</button><button class="btn ${danger ? "danger solid" : "primary"}" data-yes style="flex:1" ${typeText ? "disabled" : ""}>${esc(ok)}</button></div>`, el => {
      const yes = el.querySelector("[data-yes]"), inp = el.querySelector("#cf-in");
      if (inp) { inp.oninput = () => { yes.disabled = inp.value.trim() !== typeText; }; setTimeout(() => inp.focus(), 50); }
      el.querySelector("[data-no]").onclick = () => { fin(false); close(true); };
      yes.onclick = () => { fin(true); close(true); };
    });
    const host = [...document.querySelectorAll("[data-v3sheet]")].at(-1); if (host) { host.dataset.confirm = "1"; host._onclose = () => fin(false); }
  });
}
// 调用包装：接口没开放时温柔提示
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { toast(notReady(e) ? "这个功能后台还没开放，再等等哦" : e.message); return null; }
}
const notReadyCard = (what = "这部分") => `<div class="card empty"><b>🛠</b>${esc(what)}还在准备中，后台接口开放后这里就会出现内容</div>`;
const errCard = e => notReady(e) ? notReadyCard() : e.code === "UNAVAILABLE" ? `<div class="card empty"><b>⏳</b>网关现在有点忙，暂时拿不到这部分数据<br><span style="font-size:12.5px">${esc(e.message)}</span></div>` : `<div class="card muted">${esc(e.message)}</div>`;
async function section(el, title, loader, render) {
  el.innerHTML = `<div class="section">${title}</div><div class="skel" style="height:80px"></div>`;
  try { const d = await loader(); el.innerHTML = `<div class="section">${title}</div>` + render(d); return d; }
  catch (e) { el.innerHTML = `<div class="section">${title}</div>` + errCard(e); }
}

// ---- 2 会话操作 ----
async function sessionOp(op, sess, closeSheet) {
  const nm = sessName(sess);
  if (op === "compact") { if (await act(() => api.sessionCompact(sess.key), "上下文已压缩，轻装上阵 ✨")) closeSheet(); return; }
  if (op === "reset") {
    if (!await confirmDialog({ title: "重置这个会话？", body: `「${esc(nm)}」的对话会从头开始，之前的上下文不再带入。`, ok: "重置" })) return;
    if (await act(() => api.sessionReset(sess.key), "会话已重置")) { closeSheet(); route(); } return;
  }
  if (op === "delete") {
    if (!await confirmDialog({ title: "删除会话", body: `「${esc(nm)}」和它的全部聊天记录会被永久删除，无法恢复。`, ok: "继续", danger: true })) return;
    if (!await confirmDialog({ title: "最后确认一次", body: "真的要删掉吗？星野のねこ 会忘记这里发生过的一切。", ok: "永久删除", danger: true, typeText: "删除" })) return;
    if (await act(() => api.sessionDelete(sess.key), "会话已删除")) { closeSheet(); location.hash = "#/sessions"; }
  }
}
function newSessionSheet() {
  sheet(`<h2>新建会话</h2><form id="ns"><label class="field"><span>名称</span><input class="input" name="label" placeholder="比如：周末旅行计划"></label>
    <div style="display:flex;gap:10px;margin-top:8px"><button type="button" class="btn" data-close style="flex:1">取消</button><button class="btn primary" style="flex:2">创建</button></div></form>`, (el, close) => {
    el.querySelector("[data-close]").onclick = close;
    el.querySelector("#ns").onsubmit = async e => { e.preventDefault(); const r = await act(() => api.sessionCreate({ label: e.target.label.value.trim() || undefined }), "新会话已创建"); if (r) { close(true); location.hash = r.key ? "#/sessions/" + encodeURIComponent(r.key) : "#/sessions"; } };
  });
}

// ---- 1 定时任务 ----
function cronSheet(j, sched) {
  if (!j) return;
  const hb = j.payload?.kind === "heartbeat" || String(j.declarationKey || "").startsWith("heartbeat:");
  const runRow = x => `<div class="row"><div class="grow"><div class="t" style="font-weight:500">${fmtTime(x.runAtMs || x.ts)}</div><div class="d">${esc(x.error || x.summary || "")}${x.durationMs ? ` · ${(x.durationMs / 1000).toFixed(1)} 秒` : ""}</div></div><div class="r">${pill(x.status === "error" ? "失败" : x.status === "skipped" ? "跳过" : "成功", x.status === "error" ? "bad" : x.status === "skipped" ? "" : "ok")}</div></div>`;
  sheet(`<h2>${esc(j.displayName || j.name || j.id)}</h2>
    <dl class="kv" style="margin-bottom:16px"><dt>周期</dt><dd class="mono">${esc(sched(j.schedule))}</dd><dt>状态</dt><dd>${j.enabled === false ? "已停用" : "已启用"}</dd>
    ${j.state?.nextRunAtMs ? `<dt>下次</dt><dd>${fmtTime(j.state.nextRunAtMs)}（${until(j.state.nextRunAtMs)}）</dd>` : ""}${j.payload?.message || j.payload?.text ? `<dt>内容</dt><dd>${esc(j.payload.message || j.payload.text)}</dd>` : ""}</dl>
    <div class="grid" style="grid-template-columns:1fr 1fr"><button class="btn primary" data-o="run">${ic("play")}立即执行</button><button class="btn" data-o="toggle">${j.enabled === false ? "启用" : "停用"}</button>
    ${hb ? "" : `<button class="btn" data-o="edit">编辑</button><button class="btn danger" data-o="del">${ic("trash")}删除</button>`}</div>
    ${hb ? `<div class="faint" style="font-size:12.5px;margin-top:10px">心跳任务由配置自动生成，不能在这里编辑或删除。</div>` : ""}
    <div class="section" style="margin:22px 0 8px">运行记录</div><div id="runs"><div class="skel" style="height:60px"></div></div>`, async (el, close) => {
    el.querySelectorAll("[data-o]").forEach(b => b.onclick = async () => {
      const o = b.dataset.o;
      if (o === "run") { b.disabled = true; const r = await act(() => api.cronRun(j.id)); if (r) toast(r.ran === false ? "没有执行：" + (r.reason || "条件不满足") : "已经开始执行啦"); b.disabled = false; }
      if (o === "toggle") { if (await act(() => api.cronUpdate(j.id, { enabled: j.enabled === false }), j.enabled === false ? "任务已启用" : "任务已停用")) { close(); route(); } }
      if (o === "edit") { close(); cronEdit(j); }
      if (o === "del") {
        if (!await confirmDialog({ title: "删除这个定时任务？", body: `「${esc(j.displayName || j.name)}」删除后不会再执行。`, ok: "删除", danger: true })) return;
        if (await act(() => api.cronRemove(j.id), "任务已删除")) { close(); route(); }
      }
    });
    const box = el.querySelector("#runs"); let off = 0, all = [];
    const more = async () => {
      try { const r = await api.cronRuns(j.id, 20, off); all = all.concat(r.entries || []); off = r.nextOffset ?? off + 20;
        box.innerHTML = all.length ? `<div class="list">${all.map(runRow).join("")}</div>${r.hasMore ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="rm">再看 20 条（共 ${r.total}）</button></div>` : ""}` : `<div class="faint">还没有运行记录</div>`;
        box.querySelector("#rm")?.addEventListener("click", more);
      } catch (e) { box.innerHTML = `<div class="faint">${notReady(e) ? "运行记录接口还没开放" : esc(e.message)}</div>`; }
    };
    more();
  });
}
function cronEdit(j) {
  const s = j?.schedule || { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" };
  const kind = s.kind === "every" || s.everyMs ? "every" : "cron";
  sheet(`<h2>${j ? "编辑任务" : "新建定时任务"}</h2><form id="ce">
    <label class="field"><span>名称</span><input class="input" name="name" required value="${esc(j?.name || "")}" placeholder="比如：每日晨报"></label>
    <label class="field"><span>频率</span><div class="seg" role="group"><button type="button" data-k="cron" aria-pressed="${kind === "cron"}">按时间表</button><button type="button" data-k="every" aria-pressed="${kind === "every"}">每隔一段时间</button></div></label>
    <label class="field" data-show="cron"><span>Cron 表达式（分 时 日 月 周）</span><input class="input mono" name="expr" value="${esc(s.expr || "0 9 * * *")}"></label>
    <label class="field" data-show="every"><span>间隔（分钟）</span><input class="input" type="number" min="1" name="mins" value="${s.everyMs ? Math.round(s.everyMs / 60000) : 60}"></label>
    <label class="field"><span>让星野のねこ做什么</span><textarea class="input" name="msg" rows="3" style="height:auto;padding:10px 13px" placeholder="比如：整理今天群里的待办">${esc(j?.payload?.message || "")}</textarea></label>
    <div class="faint" style="font-size:12.5px;margin:-4px 0 12px">在独立会话里运行，结果默认不会发到 QQ。</div>
    <div style="display:flex;gap:10px"><button type="button" class="btn" data-close style="flex:1">取消</button><button class="btn primary" style="flex:2">${j ? "保存" : "创建"}</button></div></form>`, (el, close) => {
    let k = kind; const sync = () => el.querySelectorAll("[data-show]").forEach(x => x.hidden = x.dataset.show !== k); sync();
    el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { k = b.dataset.k; el.querySelectorAll("[data-k]").forEach(x => x.setAttribute("aria-pressed", x === b)); sync(); });
    el.querySelector("[data-close]").onclick = close;
    el.querySelector("#ce").onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const schedule = k === "cron" ? { kind: "cron", expr: f.expr.value.trim(), tz: s.tz || "Asia/Shanghai" } : { kind: "every", everyMs: Math.max(1, +f.mins.value) * 60000 };
      const body = { name: f.name.value.trim(), schedule, payload: { kind: "agentTurn", message: f.msg.value.trim() } };
      const ok = await act(() => j ? api.cronUpdate(j.id, body) : api.cronAdd({ ...body, sessionTarget: "isolated", wakeMode: "now", enabled: true, delivery: { mode: "none" } }), j ? "任务已保存" : "任务已创建 ⏰");
      if (ok) { close(true); route(); }
    };
  });
}

// ---- 4 费用 / 5 凭据与探测 ----
function costSection(el) {
  return section(el, "费用 · 近 30 天", () => api.usageCost(30), d => {
    const daily = d.daily || [], t = d.totals || {}; const max = Math.max(...daily.map(x => +x.totalCost || 0), 0.0001);
    const parts = [["输入", t.inputCost], ["输出", t.outputCost], ["缓存读取", t.cacheReadCost], ["缓存写入", t.cacheWriteCost]].filter(x => x[1] > 0);
    const miss = Object.entries(t.missingCostByModel || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="grid g2"><div class="card uc"><div class="uc-head"><b>总花费</b>${pill(num(t.totalTokens) + " tokens")}</div><div class="big tnum"><span class="uc-sym">$</span>${(+t.totalCost || 0).toFixed(2)}<small>USD</small></div>
      <div class="spark" aria-label="每日花费">${daily.map(x => `<i style="height:${Math.max(3, (+x.totalCost || 0) / max * 100)}%" title="${esc(x.date)} $${(+x.totalCost || 0).toFixed(2)}"></i>`).join("")}</div>
      <div class="uc-sub" style="min-height:0;display:flex;justify-content:space-between"><span>${esc(daily[0]?.date || "")}</span><span>${esc(daily.at(-1)?.date || "")}</span></div></div>
      <div class="card uc"><div class="uc-head"><b>花在哪里</b></div>${parts.map(([k, v]) => `<div class="uc-mini" style="grid-template-columns:5em 1fr auto;border:0;padding-top:0"><span>${k}</span><div class="bar thin"><i style="width:${v / (t.totalCost || 1) * 100}%"></i></div><b class="tnum">$${v.toFixed(2)}</b></div>`).join("") || `<div class="faint">暂无数据</div>`}
      ${miss.length ? `<div class="uc-sub" style="min-height:0;margin-top:12px">有 ${t.missingCostEntries} 次调用没有计价（${miss.slice(0, 3).map(([m, n]) => esc(m.split("/").pop()) + " ×" + n).join("、")}），实际花费可能更高</div>` : ""}</div></div>`;
  });
}
async function authSection(el) {
  const st = s => ({ ok: ["正常", "ok"], static: ["已配置", "ok"], valid: ["正常", "ok"], expiring: ["快过期", "warn"], expired: ["已过期", "bad"], missing: ["未配置", ""], error: ["异常", "bad"] }[s] || [s || "未知", ""]);
  const typ = { oauth: "OAuth 登录", api_key: "API Key", token: "令牌" };
  const d = await section(el, "凭据与连通性", () => api.modelAuth(), d => `<div class="list">${(d.providers || []).map(p => `<div class="row"><div class="avatar">${esc((p.displayName || p.provider || "?")[0].toUpperCase())}</div><div class="grow"><div class="t">${esc(p.displayName || p.provider)} ${pill(...st(p.status))}</div><div class="d">${(p.profiles || []).map(x => esc(typ[x.type] || x.type) + (x.source === "inherited" ? "（继承）" : "") + (x.expiresAt ? "，" + until(x.expiresAt) + "过期" : "")).join("；") || (p.apiKey ? "环境变量 " + esc(p.apiKey.envVar) : "没有凭据")}</div><div class="d" data-pr-res="${esc(p.provider)}"></div></div><button class="btn" data-probe="${esc(p.provider)}" data-pid="${esc(p.profiles?.[0]?.profileId || "")}">测一测</button></div>`).join("")}</div>
    <div class="faint" style="font-size:12.5px;margin-top:8px">「测一测」会真实请求一次该服务商（大约 30 秒），可能产生极少量费用。</div>`);
  if (!d) return;
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-probe]"); if (!b || b.disabled) return; b.disabled = true;
    const res = el.querySelector(`[data-pr-res="${CSS.escape(b.dataset.probe)}"]`); const t0 = performance.now();
    const tick = () => { const s = Math.round((performance.now() - t0) / 1000); b.innerHTML = `<span class="spin-dot"></span>${s} 秒`; res.innerHTML = `<span class="faint">正在连线服务商，通常要 30 秒左右，请稍等…</span>`; };
    tick(); const iv = setInterval(tick, 1000);
    const r = await act(() => api.modelProbe(b.dataset.probe, b.dataset.pid || undefined)); clearInterval(iv); b.disabled = false; b.textContent = "再测一次"; if (!r) res.innerHTML = "";
    if (r) { const ok = (r.status ? r.status === "ok" : r.ok !== false) && !r.error; const ms = r.latencyMs ?? r.durationMs ?? Math.round(performance.now() - t0);
      res.innerHTML = ok ? `<span style="color:var(--ok)">✓ 连通 · ${ms} ms</span>` : `<span style="color:var(--bad)">✕ ${esc(r.error?.message || r.error || r.reason || "不通")}</span>`; }
  });
}

// ---- 7 技能详情（只读：安装/更新/固定后台不开放） ----
async function skillSheet(name, base = {}) {
  sheet(`<div id="sk"><h2>${esc(base.emoji || "")} ${esc(name)}</h2><div class="skel" style="height:120px"></div></div>`, async el => {
    let hub = null; try { hub = await api.skillDetail(name); } catch {}
    const d = { ...base }, h = hub?.skill || {};
    const miss = d.missing ? Object.entries(d.missing).flatMap(([k, v]) => (v || []).map(x => `${{ bins: "命令", anyBins: "命令", env: "环境变量", config: "配置", os: "系统" }[k] || k}：${x}`)) : [];
    const desc = d.description && d.description !== "••" ? d.description : h.summary || h.description || "暂无介绍";
    const box = el.querySelector("#sk");
    box.innerHTML = `<h2>${esc(d.emoji || "")} ${esc(d.name || name)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${pill(d.disabled ? "已停用" : d.eligible === false ? "缺依赖" : "可用", d.disabled ? "" : d.eligible === false ? "warn" : "ok")}${d.source ? pill(d.bundled ? "内置" : d.source) : ""}${h.version || h.latestVersion ? pill("ClawHub v" + (h.latestVersion || h.version)) : ""}${hub?.owner?.handle ? pill("@" + hub.owner.handle) : ""}</div>
      <p class="muted" style="font-size:14.5px">${esc(desc)}</p>
      ${miss.length ? `<div class="card" style="margin-top:12px;padding:12px"><b style="font-size:13px">还缺这些</b><div class="faint mono" style="font-size:12.5px;margin-top:4px">${miss.map(esc).join("<br>")}</div></div>` : ""}
      ${(d.install || []).filter(i => i.kind !== "bundled").length ? `<div class="faint" style="font-size:12.5px;margin-top:10px">安装方式：${d.install.map(i => esc(i.label || i.id)).join("；")}</div>` : ""}
      ${d.homepage ? `<p style="margin-top:10px;font-size:13.5px"><a href="${esc(d.homepage)}" target="_blank" rel="noopener noreferrer">项目主页 ↗</a></p>` : ""}
      ${h.readme ? `<div class="md mdbox">${md(h.readme)}</div>` : ""}
      <div class="faint" style="font-size:12.5px;margin-top:14px">🔒 为了安全，技能的安装和更新只能在服务器上操作，这里只能查看。</div>`;
  });
}

// ---- 3 审批 / 8 配对 ----
VIEWS.approvals = async v => {
  const root = paint(v, top("审批与配对", "需要你点头的事情都在这里") + `<div id="ap"></div><div id="pr"></div><div id="gr"></div>`);
  const load = async () => {
    let ap = null;
    await Promise.all([
      section($("#ap", root), "命令执行审批", async () => (ap = await api.approvals()), d => { const pend = Array.isArray(d) ? d : d.pending || [];
        return pend.length ? `<div class="grid">${pend.map(a => `<div class="card"><div class="uc-head"><b>${esc(a.agentId || "星野のねこ")} 想执行</b>${a.expiresAtMs ? pill(until(a.expiresAtMs) + "过期", "warn") : ""}</div>
        <pre class="code" style="margin:0 0 10px;padding:12px;white-space:pre-wrap">${esc(a.command)}</pre><div class="faint" style="font-size:12.5px;margin-bottom:12px">${a.cwd ? "目录 " + esc(a.cwd) + " · " : ""}${a.sessionKey ? esc(a.sessionKey) + " · " : ""}${ago(a.createdAtMs)}</div>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr"><button class="btn danger" data-ap="${esc(a.id)}" data-d="deny">拒绝</button><button class="btn" data-ap="${esc(a.id)}" data-d="allow-once">仅这一次</button><button class="btn primary" data-ap="${esc(a.id)}" data-d="allow-always">一直允许</button></div></div>`).join("")}</div>` : `<div class="card empty"><b>☕</b>没有待审批的命令</div>`; }),
      section($("#pr", root), "QQ 配对请求", () => api.pairing(), d => (d.requests || []).length ? `<div class="list">${d.requests.map(x => `<div class="row"><div class="avatar">${esc((x.senderLabel || x.senderId || "?")[0])}</div><div class="grow"><div class="t">${esc(x.senderLabel || x.senderId)}</div><div class="d">${esc(x.channel)}${x.accountId ? " · " + esc(x.accountId) : ""} · ${ago(x.createdAt)}${x.expiresAt ? " · " + until(x.expiresAt) + "过期" : ""}</div></div><div style="display:flex;gap:6px"><button class="btn" data-pr="${esc(x.requestId)}" data-ch="${esc(x.channel)}" data-acc="${esc(x.accountId || "")}" data-d="dismiss">忽略</button><button class="btn primary" data-pr="${esc(x.requestId)}" data-ch="${esc(x.channel)}" data-acc="${esc(x.accountId || "")}" data-d="approve">同意</button></div></div>`).join("")}</div>` : `<div class="card empty"><b>🤝</b>暂无配对请求<br><span style="font-size:12.5px">QQ Bot 不走配对流程，大家可以直接和星野のねこ 聊天，这里会一直是空的</span></div>`),
    ]);
    const grants = (ap?.grants || []).filter(g => !g.revokedAtMs);
    $("#gr", root).innerHTML = ap ? `<div class="section">已授权的命令</div>` + (grants.length ? `<div class="list">${grants.map(g => `<div class="row"><div class="grow"><div class="t mono" style="font-weight:500">${esc(g.command)}</div><div class="d">${ago(g.createdAtMs)}授权${g.cronJobName ? " · 任务 " + esc(g.cronJobName) : ""}${g.useCount ? " · 用了 " + g.useCount + " 次" : ""}${g.expiresAtMs ? " · " + until(g.expiresAtMs) + "过期" : ""}</div></div><button class="btn danger" data-gr="${esc(g.grantId)}" data-p="${esc(g.command)}">撤销</button></div>`).join("")}</div>` : `<div class="card empty"><b>🔐</b>还没有长期授权</div>`) : "";
  };
  await load();
  root.addEventListener("click", async e => {
    const a = e.target.closest("[data-ap]"), p = e.target.closest("[data-pr]"), g = e.target.closest("[data-gr]");
    if (a) { if (a.dataset.d === "allow-always" && !await confirmDialog({ title: "一直允许？", body: "以后同样的命令会直接执行，不再询问你。可以在下方「已授权的命令」里随时撤销。", ok: "一直允许" })) return;
      if (await act(() => api.approvalResolve(a.dataset.ap, a.dataset.d), a.dataset.d === "deny" ? "已拒绝" : "已允许")) load(); }
    if (p) { if (await act(() => p.dataset.d === "approve" ? api.pairingApprove(p.dataset.ch, p.dataset.acc, p.dataset.pr) : api.pairingDismiss(p.dataset.ch, p.dataset.acc, p.dataset.pr), p.dataset.d === "approve" ? "配对成功，欢迎新朋友 🐾" : "已忽略")) load(); }
    if (g) { if (!await confirmDialog({ title: "撤销授权？", body: `<span class="mono">${esc(g.dataset.p)}</span><br>以后执行这条命令会重新询问你。`, ok: "撤销", danger: true })) return; if (await act(() => api.grantRevoke(g.dataset.gr), "已撤销")) load(); }
  });
  viewInterval(v, () => document.visibilityState === "visible" && !document.querySelector(".sheet") && load(), 15000);
};

// ---- 9 工具 / Hooks ----
VIEWS.tools = async v => {
  const root = paint(v, top("工具与扩展", "只读") + `<div id="tl"></div><div id="hk"></div>`);
  const risk = { high: ["高风险", "bad"], medium: ["中风险", "warn"], low: ["低风险", ""] };
  await Promise.all([
    section($("#tl", root), "可用工具 · 主会话", () => api.tools().catch(e => { if (e.code === "UNAVAILABLE" || e.status === 502) return { __un: e.message }; throw e; }), d => d.__un ? `<div class="card empty"><b>🧰</b>网关为了保持流畅，暂时不提供工具清单<br><span style="font-size:12.5px">MCP 工具需要具体的应用视图，暂不在这里展示</span></div>` : ((d) => d => (d.groups || []).map((g, i) => `<div class="tree list" style="margin-bottom:10px"><details ${i < 2 ? "open" : ""}><summary>${esc(g.label || g.id)} <span class="faint" style="font-weight:400">${(g.tools || []).length}</span></summary><div>${(g.tools || []).map(t => `<div class="row"><div class="grow"><div class="t">${esc(t.label || t.id)} <span class="faint mono" style="font-weight:400;font-size:12px">${esc(t.mcpServer ? "mcp:" + t.mcpServer : t.pluginId || "")}</span></div><div class="d">${esc(t.description || "")}</div></div>${t.risk && risk[t.risk] ? pill(...risk[t.risk]) : ""}</div>`).join("")}</div></details></div>`).join("") || `<div class="card empty">没有工具</div>`)(d)),
    section($("#hk", root), "Hooks", () => api.hooks(), d => (d.hooks || []).length ? `<div class="list">${d.hooks.map(h => { const on = h.enabledByConfig !== false, ok = h.requirementsSatisfied !== false && h.loadable !== false;
      return `<div class="row"><div class="avatar" style="background:var(--line);font-size:18px">${esc(h.emoji || "🪝")}</div><div class="grow"><div class="t">${esc(h.name)}</div><div class="d">${esc(h.description || "")}</div><div class="d mono" style="font-size:12px">${(h.events || []).map(esc).join(" · ")}</div></div>${pill(!on ? "已关闭" : !ok ? "缺依赖" : "启用", !on ? "" : !ok ? "warn" : "ok")}</div>`; }).join("")}</div>` : `<div class="card empty">没有配置 Hook</div>`),
  ]);
};

// ---- 10 审计 / 诊断 ----
VIEWS.audit = async v => {
  const root = paint(v, top("审计与诊断", "只读") + `<div id="dg"></div><div id="ln"></div><div id="op"></div><div id="au"></div>`);
  const stZh = { succeeded: ["成功", "ok"], ok: ["成功", "ok"], failed: ["失败", "bad"], error: ["失败", "bad"], denied: ["拒绝", "warn"], started: ["进行中", "ac"], cancelled: ["取消", ""] };
  let cursor = null, events = [];
  await Promise.all([
    section($("#dg", root), "运行状况", () => api.stability(), d => { const m = d.summary?.memory || {}, by = d.summary?.byType || {}; const errs = Object.entries(by).filter(([k]) => /error|fail/.test(k)).reduce((a, [, n]) => a + n, 0);
      return `<div class="grid g3"><div class="card uc"><div class="uc-head"><b>网关内存</b>${m.pressureCount ? pill(m.pressureCount + " 次内存压力", "warn") : pill("平稳", "ok")}</div><div class="big tnum">${bytes(m.latest?.rssBytes).split(" ")[0]}<small>${bytes(m.latest?.rssBytes).split(" ")[1] || ""}</small></div><div class="bar ${barCls(pct(m.latest?.rssBytes, m.maxRssBytes))}"><i style="width:${pct(m.latest?.rssBytes, m.maxRssBytes)}%"></i></div><div class="uc-sub" style="min-height:0">峰值 ${bytes(m.maxRssBytes)} · 堆 ${bytes(m.latest?.heapUsedBytes)}</div></div>
        <div class="card uc"><div class="uc-head"><b>最近事件</b>${errs ? pill(errs + " 个错误", "bad") : pill("无错误", "ok")}</div><div class="big tnum">${d.count ?? 0}<small>/ ${d.capacity ?? "—"}</small></div><div class="uc-base"></div><div class="uc-sub" style="min-height:0">模型调用 ${by["model.call.completed"] ?? 0} 成功 · ${by["model.call.error"] ?? 0} 失败</div></div>
        <div class="card uc"><div class="uc-head"><b>消息</b></div><div class="big tnum">${by["message.received"] ?? 0}<small>条收到</small></div><div class="uc-base"></div><div class="uc-sub" style="min-height:0">已处理 ${by["message.processed"] ?? 0} · 已送达 ${by["message.delivery.completed"] ?? 0}</div></div></div>`; }),
    section($("#ln", root), "任务通道", () => api.lanes(), d => `<div class="list">${(d.lanes || []).map(l => `<div class="row"><div class="grow"><div class="t mono" style="font-weight:500">${esc(l.lane)}</div><div class="bar thin ${barCls(pct(l.activeCount, l.maxConcurrent))}" style="margin-top:6px!important;max-width:240px"><i style="width:${pct(l.activeCount, l.maxConcurrent)}%"></i></div></div><div class="r tnum">${l.activeCount}/${l.maxConcurrent} 运行${l.queuedCount ? `<br>${pill(l.queuedCount + " 排队", "warn")}` : ""}${l.blockedBy ? `<br>${pill("阻塞", "bad")}` : ""}</div></div>`).join("")}</div><div class="faint" style="font-size:12.5px;margin-top:6px">${d.workerCount ?? "—"} 个 worker · ${d.workerPoolCount ?? "—"} 个池</div>`),
    section($("#op", root), "控制台操作记录", () => api.opsLog(50), d => (d.lines || []).length ? `<div class="list">${d.lines.map(x => `<div class="row"><div class="grow"><div class="t mono" style="font-weight:500">${esc(x.ep)}${x.target ? ` <span class="faint">→ ${esc(x.target)}</span>` : ""}</div><div class="d">${fmtTime(x.t)} · ${esc(x.ip || "")}${x.err ? ` · <span style="color:var(--bad)">${esc(x.err)}</span>` : ""}</div></div>${pill(x.ok ? "成功" : "失败", x.ok ? "ok" : "bad")}</div>`).join("")}</div>` : `<div class="card empty">还没有通过控制台做过修改</div>`),
  ]);
  const auBox = $("#au", root);
  const loadAudit = async () => {
    try { const d = await api.audit(50, cursor || undefined); events = events.concat(d.events || []); cursor = d.nextCursor;
      auBox.innerHTML = `<div class="section">网关审计</div>` + (events.length ? `<div class="list">${events.map(x => `<div class="row"><div class="grow"><div class="t mono" style="font-weight:500">${esc(x.action)}</div><div class="d">${esc(x.actor ? (x.actor.type === "agent" ? "🐱 " : "") + x.actor.id : "系统")} · ${fmtTime(x.occurredAt)}${x.sessionKey ? " · " + esc(x.sessionKey) : ""}</div></div>${pill(...(stZh[x.status] || [x.status || "—", ""]))}</div>`).join("")}</div>${cursor ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="aumore">再看 50 条</button></div>` : ""}` : `<div class="card empty">暂无审计记录</div>`);
      auBox.querySelector("#aumore")?.addEventListener("click", loadAudit);
    } catch (e) { auBox.innerHTML = `<div class="section">网关审计</div>` + errCard(e); }
  };
  await loadAudit();
};

// ---- 11 Agent 文件 ----
const EDITABLE = new Set(["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"]);
VIEWS.files = async (v, name) => {
  const root = paint(v, top("人设文件", "星野のねこ 的灵魂与笔记") + `<div id="fl"></div>`);
  const d = await section($("#fl", root), "文件", () => api.agentFiles("main"), d => `<div class="card" style="margin-bottom:12px;display:flex;gap:10px;align-items:center"><span>💾</span><div class="muted" style="font-size:13.5px">AGENTS / SOUL / USER / MEMORY 四个文件可以编辑，其余只读。保存前会再确认一次，后台会自动备份旧版本。改动会在下一轮对话生效。</div></div>
    <div class="list">${(d.files || []).map(f => `<a class="row" href="#/files/${encodeURIComponent(f.name)}"><div class="avatar" style="font-size:12px">${esc(f.name.replace(/\.md$/i, "").slice(0, 2))}</div><div class="grow"><div class="t mono">${esc(f.name)}</div><div class="d">${f.missing ? "还没有创建" : bytes(f.size) + (f.updatedAtMs ? " · " + ago(f.updatedAtMs) + "修改" : "")}</div></div>${f.missing ? pill("空") : EDITABLE.has(f.name) ? pill("可编辑", "ac") : pill("只读")}</a>`).join("") || `<div class="empty">没有文件</div>`}</div>`);
  if (d && name) fileEditor(name);
};
async function fileEditor(name) {
  let f; try { const r = await api.agentFile(name, "main"); f = r.file || r; } catch (e) { return toast(notReady(e) ? "文件接口还没开放" : e.message); }
  const ro = !EDITABLE.has(name);
  sheet(`<h2 class="mono">${esc(name)} ${ro ? pill("只读") : ""}</h2><div class="seg" style="margin-bottom:10px"><button data-m="edit" aria-pressed="true">编辑</button><button data-m="view" aria-pressed="false">预览</button></div>
    <textarea class="input mono editor" spellcheck="false" ${ro ? "readonly" : ""}>${esc(f.content || "")}</textarea><div class="md mdbox" hidden></div>
    <div style="display:flex;gap:10px;margin-top:12px;align-items:center"><span class="faint" id="dirty" style="font-size:12.5px;flex:1">${f.updatedAtMs ? ago(f.updatedAtMs) + "修改" : ""}</span><button class="btn" data-close>关闭</button>${ro ? "" : `<button class="btn primary" data-save disabled>保存</button>`}</div>`, (el, cl) => {
    el.classList.add("wide");
    const ta = el.querySelector("textarea"), pv = el.querySelector(".mdbox"), sv = el.querySelector("[data-save]") || { disabled: true }, dirty = el.querySelector("#dirty");
    let saving = false, savedNote = dirty.textContent;
    const syncDirty = () => { const ch = ta.value !== (f.content || ""); sv.disabled = saving || !ch; dirty.textContent = ch ? "有未保存的修改" : savedNote; };
    ta.oninput = syncDirty;
    el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { const view = b.dataset.m === "view"; el.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", x === b)); ta.hidden = view; pv.hidden = !view; if (view) pv.innerHTML = md(ta.value); });
    el.querySelector("[data-close]").onclick = async () => { if (await cl()) location.hash = "#/files"; };
    sv.onclick = async () => {
      if (saving) return;
      const submitted = ta.value, diff = submitted.split("\n").length - (f.content || "").split("\n").length;
      saving = true; syncDirty();
      try {
        if (!await confirmDialog({ title: `保存 ${name}？`, body: `这会改变星野のねこ 的行为（${diff >= 0 ? "+" : ""}${diff} 行）。<br>旧版本会自动备份，需要时可以找回。`, ok: "保存" })) return;
        sv.textContent = "保存中…";
        const r = await api.agentFileSet(name, submitted, "main"); f = { ...f, ...(r.file || {}), content: submitted }; cl.markSaved(new Map([[ta, submitted]])); savedNote = r.backup ? "备份：" + r.backup.split("/").pop() : "刚刚保存";
        toast(ta.value !== submitted ? "已保存提交内容，后续修改还没保存" : r.backup ? "已保存，旧版本已备份 ✓" : "已保存 ✓");
      } catch (e) {
        if (e.status === 409 || /hash|conflict|changed|modified|stale|冲突|已被修改/i.test(e.message)) {
          if (await confirmDialog({ title: "文件刚被别处改过了", body: "为了不覆盖别人的修改，这次没有保存。<br>重新加载后会看到最新内容——你的改动会丢失，建议先复制一份。", ok: "重新加载" })) { cl(true); fileEditor(name); }
        } else toast(notReady(e) ? "保存接口还没开放" : e.message); }
      finally { saving = false; sv.textContent = "保存"; syncDirty(); }
    };
  });
}

// ---- 6 全局搜索 ----
let searchIdx = null;
async function buildIndex() {
  await loadAliases();
  const [s, sk, cfg] = await Promise.all([api.sessions().catch(() => null), api.skills().catch(() => null), api.config().catch(() => null)]);
  const out = ROUTES.map(([k, t, i]) => ({ kind: "页面", t, d: "", href: "#/" + k, icon: i }));
  for (const x of s?.sessions || []) out.push({ kind: "会话", t: sessName(x), d: [rawId(x), x.channel, x.model].filter(Boolean).join(" · "), q: [x.key, x.label, x.displayName, aliasFor(x.key)].filter(Boolean).join(" "), href: "#/sessions/" + encodeURIComponent(x.key), icon: "chat" });
  for (const x of asArr(sk?.skills ?? sk)) out.push({ kind: "技能", t: (x.emoji ? x.emoji + " " : "") + (x.name || x.id), d: x.description === "••" ? "" : x.description || "", skill: x.name || x.id, icon: "plug" });
  const walk = (o, p) => { if (!o || typeof o !== "object" || p.split(".").length > 5) return; for (const [k, v] of Object.entries(o)) { const path = p ? p + "." + k : k; out.push({ kind: "配置", t: path, d: v && typeof v === "object" ? "" : String(v).slice(0, 80), href: "#/config", cfg: path, icon: "gear" }); walk(v, path); } };
  walk(cfg?.config, "");
  return out;
}

// ================= v2.6 =================
const sgToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const ST_DG = { running: ["生成中", "ac", 1], ok: ["已完成", "ok"], partial: ["文字好了，图没成", "warn"], empty: ["当天没什么聊天", ""], error: ["没生成出来", "bad"] };
const dgPill = st => pill(...(ST_DG[st] || [st || "未知", ""]));
const usageTxt = u => { if (!u) return "没有记录"; if (typeof u !== "object") return String(u); const f = x => x == null ? "无记录" : typeof x === "object" ? Object.entries(x).map(([k, v]) => `${k} ${typeof v === "number" ? num(v) : v}`).join(" · ") : String(x); return "text" in u || "image" in u ? `文字：${f(u.text)}；配图：${f(u.image)}` : f(u); };
VIEWS.digest = async (v, id) => {
  if (id) return digestDetail(v, id);
  const root = paint(v, top("群报", "每天到点自动生成，不会发到 QQ") + `<div id="dgs"></div><div id="dgl"></div><div id="dgx"></div>`);
  let S;
  const drawSettings = async () => section($("#dgs", root), "设置", async () => (S = await api.digestSettings()), d => {
    const ss = (d.sessions || []).slice().sort((a, b) => (a.kind === "group" ? 0 : 1) - (b.kind === "group" ? 0 : 1));
    return `<div class="card dg-set">
      <label class="switchrow"><div class="grow"><b>每日群报</b><div class="faint" style="font-size:12.5px">总开关。关着的时候，哪个会话都不会生成</div></div><span class="switch"><input type="checkbox" data-dg="global" ${d.enabled ? "checked" : ""} aria-label="每日群报总开关"><i></i></span></label>
      <label class="switchrow"><div class="grow"><b>生成时间</b><div class="faint" style="font-size:12.5px">${esc(d.timeZone || "Asia/Singapore")} · 控制台晚于这个时间启动时会补跑当天的</div></div><input type="time" class="input dg-time" value="${esc(d.time || "22:00")}" aria-label="生成时间"></label>
      ${d.imageModel ? `<div class="faint" style="font-size:12.5px">配图模型 <span class="mono">${esc(d.imageModel)}</span></div>` : ""}
    </div>
    <div class="section" style="margin-top:14px">哪些会话要群报 <span class="faint" style="font-weight:400">默认都关着</span></div>
    <div class="list">${ss.length ? ss.map(x => `<label class="row switchrow"><div class="avatar">${esc([...(aliasFor(x.sessionKey) || x.name || "群")][0])}</div><div class="grow"><div class="t">${esc(aliasFor(x.sessionKey) || x.name || x.sessionKey)}</div><div class="d">${x.kind === "group" ? "群聊" : "其他会话"}${x.lastRunDay ? " · 上次生成 " + esc(x.lastRunDay) : " · 还没生成过"}</div></div><span class="switch"><input type="checkbox" data-dg="sess" data-key="${esc(x.sessionKey)}" ${x.enabled ? "checked" : ""} ${d.enabled ? "" : "disabled"} aria-label="为这个会话生成群报"><i></i></span></label>`).join("") : `<div class="row faint">还没有可以选择的会话</div>`}</div>
    ${d.enabled ? "" : `<div class="faint" style="font-size:12.5px;margin-top:6px">先打开上面的总开关，才能选会话哦</div>`}`;
  });
  root.addEventListener("change", async e => {
    const t = e.target; let body, msg;
    if (t.dataset.dg === "global") { body = { globalEnabled: t.checked }; msg = t.checked ? "群报已开启" : "群报已关闭"; }
    else if (t.dataset.dg === "sess") { body = { sessionKey: t.dataset.key, enabled: t.checked }; msg = t.checked ? "这个会话会生成群报啦" : "这个会话不再生成群报"; }
    else if (t.classList.contains("dg-time")) { if (!/^\d{2}:\d{2}$/.test(t.value)) return toast("时间格式要像 22:00"); body = { time: t.value }; msg = `改成每天 ${t.value} 生成`; }
    else return;
    t.disabled = true; const ok = await act(() => api.digestSet(body), msg); t.disabled = false;
    if (!ok && t.type === "checkbox") t.checked = !t.checked;
    if (t.dataset.dg === "global" || t.dataset.dg === "sess") { await drawSettings(); drawRun(); }
  });
  const drawRun = () => { const on = (S?.sessions || []).filter(x => x.enabled); $("#dgx", root).innerHTML = S?.enabled && on.length ? `<details class="quiet"><summary>验收工具</summary><div class="faint" style="font-size:12.5px;margin:6px 0">不用等到点，马上生成今天的群报。会消耗额度，平时用不着。只能选已经打开群报的会话。</div><div style="display:flex;gap:8px;flex-wrap:wrap"><select class="select" id="rnk" style="flex:1;min-width:0">${on.map(x => `<option value="${esc(x.sessionKey)}">${esc(aliasFor(x.sessionKey) || x.name || x.sessionKey)}</option>`).join("")}</select><button class="btn" data-x="runnow">立即生成</button></div></details>` : ""; };
  root.addEventListener("click", async e => {
    if (!e.target.closest("[data-x=runnow]")) return; const k = $("#rnk", root).value, nm = $("#rnk", root).selectedOptions[0]?.textContent;
    if (!await confirmDialog({ title: `现在就生成「${esc(nm)}」今天的群报？`, body: "会在后台生成，不会发到 QQ。", ok: "继续" })) return;
    if (!await confirmDialog({ title: "这会消耗额度", body: `立即生成要调用一次文字模型和一次配图模型，<b>会实打实消耗额度</b>。${(LIST || []).some(x => x.sessionKey === k && x.day === sgToday()) ? `<br><br>⚠️ 今天（${sgToday()}）这个会话<b>已经有一份群报了</b>，重新生成会<b>覆盖</b>它，并且<b>再扣一次额度</b>。` : ""}确定要现在生成吗？`, ok: "消耗额度并生成", danger: true })) return;
    if (await act(() => api.digestRunNow(k), "已开始生成，稍等一会儿就会出现在列表里")) { drawList(); setTimeout(() => (current === "groups" || current === "digest") && !id && drawList(), 15000); }
  });
  let LIST = []; const drawList = () => section($("#dgl", root), "最近的群报", () => api.digests(null, 30).then(r => (LIST = r.digests || [], r)), d => (d.digests || []).length ? `<div class="dg-list">${d.digests.map(x => `<a class="card dg-item" href="#/digest/${encodeURIComponent(x.id)}">${x.image ? `<img class="dg-thumb" src="${esc(api.digestImage(x.id))}" alt="" loading="lazy">` : `<div class="dg-thumb ph">📰</div>`}<div class="grow"><div class="dg-h"><b>${esc(aliasFor(x.sessionKey) || x.name || x.sessionKey)}</b>${dgPill(x.status)}</div><div class="faint" style="font-size:12.5px">${esc(x.day || "")}${x.messageCount != null ? ` · ${x.messageCount} 条消息` : ""}${x.durationMs ? " · 用时 " + tdur(x.durationMs) : ""}</div>${x.preview ? `<div class="dg-prev">${esc(x.preview)}</div>` : ""}</div></a>`).join("")}</div>${d.total > d.digests.length ? `<div class="faint" style="font-size:12.5px;margin-top:6px">共 ${d.total} 份，显示最近 ${d.digests.length} 份</div>` : ""}` : `<div class="card empty"><b>📰</b>还没有群报<br><span style="font-size:12.5px">打开总开关和想要的会话，到点就会自动生成</span></div>`);
  await drawSettings(); drawRun(); drawList();
};
async function digestDetail(v, id) {
  const d = await api.digest(id);
  const root = paint(v, top("群报", `${aliasFor(d.sessionKey) || d.name || ""} · ${d.day || ""}`, `<a class="iconbtn" href="#/digest" aria-label="返回">${ic("back")}</a>`) + `
    <div class="card dg-detail">
      <div class="dg-h">${dgPill(d.status)}<span class="faint" style="font-size:12.5px">${d.messageCount != null ? d.messageCount + " 条消息 · " : ""}${d.finishedAt ? "生成于 " + fmtTime(d.finishedAt) : d.startedAt ? "开始于 " + fmtTime(d.startedAt) : ""}</span></div>
      ${d.image ? `<button type="button" class="dg-img" data-full="${esc(api.digestImage(d.id))}" aria-label="查看大图"><img src="${esc(api.digestImage(d.id))}" alt="群报配图"></button>` : d.status === "partial" ? `<div class="faint">这次配图没成功，只有文字</div>` : ""}
      <div class="md">${d.text ? md(d.text) : `<div class="faint">没有文字内容</div>`}</div>
      ${(d.errors || []).length ? `<div class="link-err">⚠️ ${d.errors.map(x => esc(scrub(typeof x === "string" ? x : x.message || JSON.stringify(x)))).join("<br>")}</div>` : ""}
    </div>
    <div class="section">生成信息</div>
    <div class="card"><dl class="kv">
      ${d.textModel ? `<dt>文字模型</dt><dd class="mono">${esc(d.textModel)}</dd>` : ""}${d.imageModel ? `<dt>配图模型</dt><dd class="mono">${esc(d.imageModel)}</dd>` : ""}
      ${d.usage && (d.usage.text || d.usage.image) ? `<dt>用量</dt><dd>${esc(usageTxt(d.usage))}</dd>` : ""}${d.durationMs ? `<dt>用时</dt><dd>${tdur(d.durationMs)}</dd>` : ""}
      ${d.notesUsed != null ? `<dt>参考了当天小结</dt><dd>${d.notesUsed ? "是" : "没有"}</dd>` : ""}
    </dl>${d.imagePrompt ? `<details class="blk" style="margin-top:10px"><summary>配图提示词</summary><pre>${esc(d.imagePrompt)}</pre></details>` : ""}</div>`);
  root.addEventListener("click", e => { const b = e.target.closest("[data-full]"); if (b) lightbox(b.dataset.full, "群报配图"); });
}
const pname = p => aliasFor(p.id) || p.alias || p.name || shortId(p.id) || "某位群友";
function interTable(d, opts = {}) {
  const ps = (d.people || []).slice().sort((a, b) => (b.messages || 0) - (a.messages || 0)); const mx = Math.max(1, ...ps.map(p => p.messages || 0));
  return `<div class="faint" style="font-size:12.5px;margin-bottom:8px">${esc(d.note || "只统计网关保留的最近一个历史窗口")}${d.windowFrom ? ` · 从 ${fmtTime(d.windowFrom)} 起` : ""}${d.windowCount != null ? ` · 窗口内记录 ${d.windowCount} 条（含工具结果）` : ""}。回复和静默按“轮”算，记在叫醒她的那个人名下。</div>
    ${ps.length ? `<div class="list">${ps.map(p => `<button type="button" class="row it-row" ${isOpenId(p.id) ? `data-prof="${esc(p.id)}"` : ""}><div class="avatar">${esc([...pname(p)][0])}</div><div class="grow"><div class="t">${esc(pname(p))}</div><div class="bar thin" style="margin:5px 0!important"><i style="width:${pct(p.messages || 0, mx)}%"></i></div><div class="d it-nums"><span>发言 <b>${p.messages ?? 0}</b></span><span>她回了 <b>${p.replies ?? 0}</b> 轮</span><span>没出声 <b>${p.silences ?? 0}</b> 轮</span>${p.unknown ? `<span>说不准有没有回 ${p.unknown} 轮</span>` : ""}</div></div><div class="r">${p.lastAt ? ago(p.lastAt) : ""}</div></button>`).join("")}</div>` : `<div class="card empty">这段时间还没人说话</div>`}`;
}
VIEWS.interactions = async (v, key) => {
  if (key) {
    const d = await api.interactions(key);
    const root = paint(v, top("互动统计", aliasFor(key) || d.name || rawId({ key }), `<a class="iconbtn" href="#/interactions" aria-label="返回">${ic("back")}</a>`) + `<div class="card">${interTable(d)}</div><a class="btn" style="margin-top:12px" href="#/sessions/${encodeURIComponent(key)}">去看这个会话</a>`);
    root.addEventListener("click", e => { const b = e.target.closest("[data-prof]"); if (b) profileSheet(b.dataset.prof, null, key); });
    return;
  }
  const d = await api.interactions();
  const gs = d.groups || [];
  const lastOf = g => { const ts = (g.people || []).map(p => p.lastAt || 0); return ts.length ? Math.max(...ts) : 0; };
  paint(v, top("互动统计", "只是数数大家聊了多少") + (gs.length ? `<div class="list">${gs.map(g => { const k = g.sessionKey || ""; const nm = aliasFor(k) || g.name || rawId({ key: k });
    if (g.error) return `<div class="row"><div class="avatar">${esc([...nm][0] || "群")}</div><div class="grow"><div class="t">${esc(nm)}</div><div class="d">这个群暂时统计不出来：${esc(scrub(g.error))}</div></div></div>`;
    const ppl = g.people || [], la = lastOf(g), tot = ppl.reduce((a, p) => a + (p.messages || 0), 0);
    return `<a class="row" href="#/interactions/${encodeURIComponent(k)}"><div class="avatar">${esc([...nm][0] || "群")}</div><div class="grow"><div class="t">${esc(nm)}</div><div class="d">${[ppl.length + " 位群友", tot ? `发言 ${tot} 条` : "", g.windowCount != null ? `窗口内记录 ${g.windowCount} 条` : "", la ? ago(la) + "有人说话" : ""].filter(Boolean).join(" · ")}</div></div><span class="faint">›</span></a>`; }).join("")}</div>` : `<div class="card empty"><b>👥</b>还没有 QQ 群会话</div>`));
};
const VIA = { tool: "她主动发的", tag: "回复里带的", lurk: "潜水时冒泡" };
// ---------- v2.7 表情库（总览 / 入库 / 生成 / 参数 / 形象与分类 / 回收目录） ----------
const STK_TABS = [["", "表情"], ["gen", "生成"], ["params", "参数"], ["manifest", "形象与分类"], ["trash", "回收目录"]];
const CAT_RE = /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u;
const sniff = async f => { const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()); const h = (...a) => a.every((x, i) => b[i] === x);
  return h(0x89, 0x50, 0x4e, 0x47) ? "png" : h(0xff, 0xd8, 0xff) ? "jpg" : h(0x47, 0x49, 0x46, 0x38) ? "gif" : h(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? "webp" : null; };
const stkErr = x => x.code === "DUPLICATE" || x.status === 409 && /重复/.test(x.message) ? "这张已经在库里了" : x.status === 413 ? "图片超过 5MB" : /read-only/i.test(x.message) ? "表情库现在是只读的，后台还没放开写入" : x.message;
let MANI = null; const loadMani = () => api.stickerManifest().then(d => (MANI = d)).catch(() => (MANI = null));
const catsOf = () => Object.keys(MANI?.manifest?.categories || {});
VIEWS.stickers = async (v, sub) => {
  const tab = STK_TABS.some(t => t[0] === sub) ? sub : "";
  const tabs = `<div class="toolbar"><div class="seg stk-tabs" role="tablist">${STK_TABS.map(([k, t]) => `<a role="tab" href="#/stickers${k ? "/" + k : ""}" aria-pressed="${k === tab}">${t}</a>`).join("")}</div></div>`;
  return ({ "": stkLib, gen: stkGen, params: stkParams, manifest: stkMani, trash: stkTrash })[tab](v, tabs);
};
async function stkLib(v, tabs) {
  const [d] = await Promise.all([api.stickers(), loadMani()]); const items = d.items || [];
  const rk = (d.ranking || []).filter(r => r && r.file && (r.uses || 0) > 0);
  const since = d.since ? fmtTime(d.since) : "上线那一刻";
  const root = paint(v, top("表情库", `${items.length} 张`, `<button class="iconbtn" data-x="imp" aria-label="导入表情">${ic("plus")}</button>`) + tabs + `
    <div class="faint" style="font-size:12.5px;margin:0 0 12px">使用次数从 ${esc(since)}（上线）开始累计，每 10 分钟统计一次${d.lastScan ? " · 上次统计 " + fmtTime(d.lastScan) : ""}</div>
    <div class="section">最常用 <span class="faint" style="font-weight:400">自 ${esc(since)} 起</span></div>
    ${rk.length ? `<div class="list">${rk.slice(0, 10).map((r, i) => `<div class="row ${r.missing ? "stk-miss" : ""}"><span class="rk">${i + 1}</span>${r.missing ? `<span class="stk-s ph" aria-hidden="true">🫥</span>` : `<button type="button" class="stk-s" data-full="${esc(api.stickerImage(r.file))}" aria-label="${esc(r.emotion || r.file)}"><img src="${esc(api.stickerImage(r.file))}" alt="" loading="lazy"></button>`}<div class="grow"><div class="t">${esc(r.emotion || r.file)}${r.missing ? ` <span class="pill">已不在库里</span>` : ""}</div><div class="d">${Object.entries(r.byVia || {}).filter(([, n]) => n).map(([k, n]) => `${VIA[k] || k} ${n}`).join(" · ") || "&nbsp;"}</div></div><div class="r tnum"><b>${r.uses ?? 0}</b> 次</div></div>`).join("")}</div>` : `<div class="card empty">上线以来还没用过表情</div>`}
    <div class="section">全部表情 <span class="faint" style="font-weight:400">点一张可以换分类或挪走</span></div>
    ${items.length ? `<div class="stk-grid">${items.map(x => `<button type="button" class="stk" data-stk="${esc(x.file)}" aria-label="${esc(x.emotion || x.file)}"><img src="${esc(api.stickerImage(x.file))}" alt="" loading="lazy"><span>${esc(x.emotion || "")}${x.uses ? ` · ${x.uses}` : ""}</span></button>`).join("")}</div>` : `<div class="card empty"><b>😺</b>表情库是空的，点右上角 ＋ 导入几张吧</div>`}`);
  root.addEventListener("click", e => {
    const f = e.target.closest("[data-full]"); if (f) return lightbox(f.dataset.full, f.getAttribute("aria-label"));
    const s = e.target.closest("[data-stk]"); if (s) return stkSheet(items.find(x => x.file === s.dataset.stk) || { file: s.dataset.stk }, route);
    if (e.target.closest("[data-x=imp]")) importSheet(route);
  });
}
function catPicker(cur, id = "catp") {
  const cs = catsOf();
  return `<label class="field"><span>分类</span><select class="select" id="${id}">${cs.map(c => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("")}<option value="__new">＋ 新分类…</option></select></label>
    <label class="field" id="${id}-nw" hidden><span>新分类名</span><input class="input" id="${id}-new" maxlength="16" placeholder="1–16 个中文、字母或数字"></label>`;
}
const catVal = el => { const s = el.querySelector("#catp"); return s.value === "__new" ? el.querySelector("#catp-new").value.trim() : s.value; };
const catWire = el => { const s = el.querySelector("#catp"); s.onchange = () => { el.querySelector("#catp-nw").hidden = s.value !== "__new"; }; if (!catsOf().length) { s.value = "__new"; s.onchange(); } };
function stkSheet(x, after) {
  const m = MANI?.manifest?.files?.[x.file] || {};
  sheet(`<div class="stk-big"><img src="${esc(api.stickerImage(x.file))}" alt=""></div><h2 style="overflow-wrap:anywhere">${esc(x.emotion || m.category || "表情")}</h2>
    <div class="faint mono" style="font-size:12px;overflow-wrap:anywhere">${esc(x.file)}</div>
    <dl class="kv" style="margin:10px 0">${x.uses != null ? `<dt>上线以来用了</dt><dd>${x.uses} 次</dd>` : ""}${x.size ? `<dt>大小</dt><dd>${bytes(x.size)}</dd>` : ""}${m.source || x.source ? `<dt>来源</dt><dd>${esc(({ manual: "手动入库", generated: "她画的", local: "本地" })[m.source || x.source] || m.source || x.source)}</dd>` : ""}${m.addedAt ? `<dt>入库</dt><dd>${fmtTime(m.addedAt)}</dd>` : ""}</dl>
    ${catPicker(m.category || x.emotion)}
    <div style="display:flex;gap:10px;margin-top:8px"><button class="btn danger" data-x="del" style="flex:1">${ic("trash")}挪进回收目录</button><button class="btn primary" data-x="mv" style="flex:1">换到这个分类</button></div>`, (el, close) => {
    catWire(el);
    el.querySelector("[data-x=mv]").onclick = async () => {
      const c = catVal(el); if (!CAT_RE.test(c)) return toast("分类名要 1–16 个中文、字母或数字，不能有 -");
      if (c === (m.category || x.emotion)) return toast("已经在这个分类里啦");
      if (!await confirmDialog({ title: `换到「${c}」？`, body: "文件会按规则重新命名，原图会先备份到回收目录。" , ok: "继续" })) return;
      if (!await confirmDialog({ title: "再确认一次", body: `把这张表情从「${esc(m.category || x.emotion || "?")}」换到「${esc(c)}」。群聊里 5–30 秒内生效。`, ok: "确定换分类" })) return;
      if (await act(() => api.stickerRename(x.file, c).catch(e => { throw new Error(stkErr(e)); }), `已换到「${c}」`)) { close(true); after?.(); }
    };
    el.querySelector("[data-x=del]").onclick = async () => {
      if (!await confirmDialog({ title: "把这张挪进回收目录？", body: "不会真的删掉，文件会挪进回收目录，需要时还能找回来。", ok: "继续", danger: true })) return;
      if (!await confirmDialog({ title: "再确认一次", body: `<span class="mono">${esc(x.file)}</span> 会挪进回收目录，群聊里之后就不会再用它。`, ok: "挪进回收目录", danger: true })) return;
      if (await act(() => api.stickerDelete(x.file).catch(e => { throw new Error(stkErr(e)); }), "已挪进回收目录")) { close(true); after?.(); }
    };
  });
}
function importSheet(after) {
  let files = [], busy = false, did = 0;
  sheet(`<h2>导入表情</h2>${catPicker(catsOf()[0])}
    <label class="btn" style="width:100%;margin:4px 0 6px">${ic("plus")}选图片（可多选）<input type="file" id="impf" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></label>
    <div class="faint" style="font-size:12.5px">支持 png / jpg / webp / gif，每张不超过 5MB。重复的图会自动跳过。</div>
    <div id="impl" class="imp-list"></div>
    <div style="display:flex;gap:10px;margin-top:14px"><button class="btn" data-close style="flex:1">关闭</button><button class="btn primary" id="impgo" style="flex:2" disabled>开始导入</button></div>`, (el, close) => {
    catWire(el);
    const L = el.querySelector("#impl"), go = el.querySelector("#impgo");
    const draw = () => { L.innerHTML = files.map((f, i) => `<div class="imp-row ${f.st}" data-i="${i}"><div class="grow"><div class="t">${esc(f.f.name)}</div><div class="d">${bytes(f.f.size)} · ${esc(f.msg)}</div><div class="bar thin"><i style="width:${Math.round(f.p * 100)}%"></i></div></div><span class="imp-ic">${f.st === "ok" ? "✓" : f.st === "dup" ? "↺" : f.st === "bad" ? "✕" : f.st === "up" ? `<span class="spin-dot"></span>` : ""}</span></div>`).join(""); go.disabled = busy || !files.some(f => f.st === "ready"); };
    el.querySelector("#impf").onchange = async e => {
      for (const f of e.target.files) { const t = await sniff(f); files.push(f.size > 5 * 1024 * 1024 ? { f, st: "bad", p: 0, msg: "超过 5MB 了" } : !t ? { f, st: "bad", p: 0, msg: "不是 png / jpg / webp / gif" } : { f, st: "ready", p: 0, msg: `${t} · 等待导入` }); }
      e.target.value = ""; draw();
    };
    el.querySelector("[data-close]").onclick = async () => { if (await close() && did) after?.(); };
    go.onclick = async () => {
      const c = catVal(el); if (!CAT_RE.test(c)) return toast("分类名要 1–16 个中文、字母或数字，不能有 -");
      busy = true; draw();
      for (const f of files.filter(x => x.st === "ready")) {
        f.st = "up"; f.msg = "上传中…"; draw();
        try { const r = await api.stickerImport(f.f, c, p => { f.p = p; const row = L.querySelector(`[data-i="${files.indexOf(f)}"] .bar i`); if (row) row.style.width = Math.round(p * 100) + "%"; }); f.st = "ok"; f.p = 1; f.msg = `已入库 · ${r?.file || ""}${r?.newCategory ? " · 新分类" : ""}`; did++; if (r?.newCategory) await loadMani(); }
        catch (x) { f.st = x.code === "DUPLICATE" ? "dup" : "bad"; f.msg = stkErr(x); }
        draw();
      }
      busy = false; draw(); toast(did ? `导入了 ${did} 张` : "这次没有新导入的");
    };
    draw();
  });
}
const fbTxt = j => j.status === "ok" && Array.isArray(j.fallbackFrom) && j.fallbackFrom.length ? `<div class="d gen-fb">↘︎ 已降级：${esc(scrub(j.fallbackFrom.join("、")))} 失败</div>` : "";
async function stkGen(v, tabs) {
  const [p] = await Promise.all([api.stickerParams().catch(() => null), loadMani()]);
  let gt = p?.genToday || MANI?.genToday || null, job = null, timer = null;
  const recent = await api.stickerGenStatus().catch(() => null); const list = recent?.jobs || []; if (recent?.genToday) gt = recent.genToday;
  job = list.find(j => j.status === "running") || null;
  const root = paint(v, top("表情库", "生成新表情") + tabs + `<div class="card gen"><div id="gtd"></div>${catPicker(catsOf()[0])}<button class="btn primary" id="genb" style="width:100%">按形象画一张新的</button><div class="faint" style="font-size:12.5px;margin-top:8px">按「形象与分类」里的形象和画风画，这个分类里已经有图也会再画一张。同一时间只画一张。</div></div><div id="gres"></div>
    ${list.length ? `<div class="section">最近的生成</div><div class="list">${list.slice(0, 8).map(j => `<div class="row">${j.status === "ok" && j.file ? `<button class="stk-s" data-full="${esc(api.stickerImage(j.file))}"><img src="${esc(api.stickerImage(j.file))}" alt=""></button>` : `<span class="stk-s ph">${j.status === "running" ? "⏳" : "⚠️"}</span>`}<div class="grow"><div class="t">${esc(j.category || "")}</div><div class="d">${esc(j.status === "ok" ? "画好了" + (j.model ? " · " + j.model : "") : j.status === "running" ? "正在画…" : "没画成：" + scrub(j.error || ""))}${j.durationMs ? " · " + tdur(j.durationMs) : ""}</div>${fbTxt(j)}</div></div>`).join("")}</div><div class="faint" style="font-size:12px;margin-top:6px">记录只在内存里，控制台重启后会清空</div>` : ""}`);
  catWire(root); const btn = $("#genb", root), res = $("#gres", root);
  const drawToday = () => { $("#gtd", root).innerHTML = gt ? `<div class="gen-today">${pill(gt.enabled === false ? "生成已关闭" : "可以生成", gt.enabled === false ? "bad" : "ok", gt.enabled !== false)}<span>今天已画 <b>${gt.count ?? 0}</b> / ${gt.cap ?? "—"} 张</span><span class="faint">和群聊里自动画的共用次数</span></div>` : ""; };
  const setBusy = b => { btn.disabled = b; btn.innerHTML = b ? `<span class="spin-dot"></span> 正在画…` : "按形象画一张新的"; };
  const poll = async () => { if (!job) return; try { const s = await api.stickerGenStatus(job.id || job.jobId); job = { ...job, ...s };
      if (s.status === "running") { res.innerHTML = `<div class="card gen-run"><span class="spin-dot"></span> 正在画「${esc(s.category || "")}」${s.durationMs ? "，已经 " + tdur(s.durationMs) : ""}…</div>`; timer = setTimeout(poll, 2500); return; }
      setBusy(false); res.innerHTML = s.status === "ok" ? `<div class="card gen-ok"><button class="stk-s big" data-full="${esc(api.stickerImage(s.file))}"><img src="${esc(api.stickerImage(s.file))}" alt=""></button><div><b>画好啦 ✨</b><div class="faint mono" style="font-size:12px;overflow-wrap:anywhere">${esc(s.file || "")}${s.model ? " · " + esc(s.model) : ""}</div><div class="faint" style="font-size:12.5px">已经自动入库，群聊里 5–30 秒内能用</div></div></div>` : `<div class="link-err">没画成：${esc(scrub(s.error || "未知原因"))}</div>`;
      const pp = await api.stickerParams().catch(() => null); if (pp?.genToday) { gt = pp.genToday; drawToday(); }
    } catch (x) { if (x.status === 404) { setBusy(false); job = null; res.innerHTML = `<div class="card faint">任务记录已清空（控制台重启过），去「表情」里看看新图有没有入库吧</div>`; return; } timer = setTimeout(poll, 4000); } };
  addEventListener("hashchange", () => clearTimeout(timer), { once: true });
  drawToday(); if (job) { setBusy(true); poll(); }
  root.addEventListener("click", async e => {
    const f = e.target.closest("[data-full]"); if (f) return lightbox(f.dataset.full, "表情");
    if (e.target !== btn && !btn.contains(e.target)) return; if (btn.disabled) return;
    const c = catVal(root); if (!CAT_RE.test(c)) return toast("分类名要 1–16 个中文、字母或数字，不能有 -");
    setBusy(true); res.innerHTML = "";
    try { const r = await api.stickerGenerate(c); if (r?.genToday) { gt = r.genToday; drawToday(); } job = { id: r.jobId, category: c, status: "running" }; poll(); }
    catch (x) { setBusy(false); toast(x.status === 403 ? "生成已关闭" : x.status === 429 ? "今天的生成次数用完了" : x.status === 409 ? "已经有一张在生成了" : stkErr(x)); }
  });
}
// 表单脏状态：保存按钮只在有改动时可点
const dirtyBar = (id, label = "保存修改") => `<div class="savebar" id="${id}" hidden><span class="faint">有改动还没保存</span><button type="button" class="btn" data-reset>撤销</button><button type="button" class="btn primary" data-save>${label}</button></div>`;
// ---------- v2.11 语音参数（和表情包共用参数接口：params.voice） ----------
const VOICE_REPLIES_PER_DAY = 70;
// 估算：冷却 c 条 + 平均掷 1/p 条才中一次 → 每条回复带语音的比例 ≈ 1/(c + 1/p)；再受每日上限约束。不计静默时段。
const voiceEst = (p, c, limit) => { if (!(p > 0)) return { pct: 0, perDay: 0, every: null }; const r = 1 / ((c || 0) + 1 / p); const perDay = VOICE_REPLIES_PER_DAY * r; return { pct: r * 100, every: Math.round(1 / r), perDay: limit > 0 ? Math.min(perDay, limit) : perDay, capped: limit > 0 && perDay > limit }; };
const voiceEstTxt = (p, c, limit) => { const e = voiceEst(p, c, limit); return !e.perDay ? "基本不会发语音" : `约 ${e.pct < 10 ? e.pct.toFixed(1) : Math.round(e.pct)}% 的回复带语音（每 ${e.every} 条左右一条），每群每天约 ${e.perDay < 10 ? e.perDay.toFixed(1) : Math.round(e.perDay)} 条${e.capped ? "（已到每日上限）" : ""}`; };
async function voiceSection(host, d, groupsBase) {
  const V0 = d.params?.voice ? JSON.parse(JSON.stringify(d.params.voice)) : null; let V = V0 ? JSON.parse(JSON.stringify(V0)) : null;
  const VD = d.voiceDefaults || {}, VT = d.voiceToday || { configured: false };
  const keyOk = k => /^group:[0-9a-f]{32}$/.test(k);
  const groups = groupsBase.filter(g => keyOk(g.k)).map(g => ({ ...g }));
  for (const k of new Set([...Object.keys(V?.perConversation || {}), ...Object.keys(VT.perConversation || {})])) if (keyOk(k) && !groups.some(g => g.k === k)) { const id = k.slice(6); groups.push({ k, name: aliasFor(id) || "群 " + shortId(id.toUpperCase()) }); }
  const val = (k) => V?.[k] ?? VD[k];
  const sw = (name, on) => `<span class="switch"><input type="checkbox" data-v="${name}" ${on ? "checked" : ""}><i></i></span>`;
  const FIELDS = ["enabled", "probability", "explicitRequestOverride", "cooldownReplies", "tz", "quietHours", "defaultEnabled", "maxChars", "dailyLimit", "exclusiveWithSticker"];
  const changes = () => { if (!V) return {}; const o = {}; for (const k of FIELDS) if (JSON.stringify(V[k] ?? null) !== JSON.stringify(V0?.[k] ?? null)) o[k] = V[k] ?? null;
    const a = V0?.perConversation || {}, b = V.perConversation || {}, pc = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) pc[k] = b[k] ? { enabled: b[k].enabled !== false, ...(b[k].probability != null ? { probability: b[k].probability } : {}) } : null;
    if (Object.keys(pc).length) o.perConversation = pc; return o; };
  const lim = () => val("dailyLimit");
  const draw = () => {
    if (!V) { host.innerHTML = `<div class="section">语音</div><div class="card vc-off"><div class="grow"><b>未启用代码控制</b><div class="faint fs">现在由模型自己决定什么时候发语音。启用后可以在这里控制概率、冷却、静默时段和每日上限。</div></div><button type="button" class="btn primary" data-vx="enable">启用</button></div>`; return; }
    const pr = Math.round((V.probability ?? 0) * 100), qh = V.quietHours || [];
    const today = c => { const t = VT.perConversation?.[c]; const L = VT.limit ?? lim(); return VT.configured ? (t?.count == null ? "今天暂无计数" : `今天 ${t.count}${L ? ` / ${L}` : " · 不限"} 条`) : ""; };
    host.innerHTML = `<div class="section">语音 <span class="faint fs" style="font-weight:400">群聊里的语音条</span></div>
      <div class="card form">
        <label class="switchrow"><div class="grow"><b>语音总开关</b><div class="faint fs">只管群聊里的语音</div></div>${sw("enabled", V.enabled !== false)}</label>
        <label class="field"><span>每轮发语音的概率 <b class="tnum" id="vpv">${pr}%</b></span><input type="range" min="0" max="100" step="1" value="${pr}" data-v="probability" class="range"></label>
        <label class="switchrow"><div class="grow"><b>群里明确要语音时必发</b><div class="faint fs">开启后，群里有人明确要语音（如「发语音」「用贝利亚的声音说」「来段可莉语音」）时，这一轮跳过随机概率和冷却，不再改发表情包，直接发一句语音。总开关、本群开关、静默时段、每日上限仍然生效。关闭时行为与现在完全相同。</div></div>${sw("explicitRequestOverride", V.explicitRequestOverride === true)}</label>
        <label class="field"><span>冷却</span><div class="inrow"><input class="input" type="number" min="0" max="100" step="1" inputmode="numeric" value="${esc(V.cooldownReplies ?? "")}" data-v="cooldownReplies"><span class="faint">条回复内不再发</span></div></label>
        <div class="vc-est" id="vest">📈 <b>估算</b>：${esc(voiceEstTxt(V.probability, V.cooldownReplies, lim()))}<div class="faint fs">按每群每天约 ${VOICE_REPLIES_PER_DAY} 条回复估算，没算静默时段，只是个大概。</div></div>
        <label class="field"><span>每群每天最多 ${V.dailyLimit === 0 ? `<b class="pill ac">不限</b>` : ""}</span><div class="inrow"><input class="input" type="number" min="0" max="1000" step="1" inputmode="numeric" value="${esc(V.dailyLimit ?? "")}" data-v="dailyLimit"><span class="faint">条（0 = 不限）</span></div></label>
        <label class="field"><span>台词最长</span><div class="inrow"><input class="input" type="number" min="1" max="200" step="1" inputmode="numeric" value="${esc(V.maxChars ?? "")}" data-v="maxChars"><span class="faint">字，超过就改发文字</span></div></label>
        <label class="switchrow"><div class="grow"><b>和表情包二选一</b><div class="faint fs">${V.exclusiveWithSticker !== false ? "先掷语音，掷中了这一轮就不配表情" : "两边各掷各的，但每条消息最多带 1 个媒体"}</div></div>${sw("exclusiveWithSticker", V.exclusiveWithSticker !== false)}</label>
      </div>
      <div class="card form">
        <div class="switchrow"><div class="grow"><b>静默时段</b><div class="faint fs">这些时间不发语音，可以跨零点，最多 6 段</div></div><button type="button" class="btn sm" data-vx="qadd" ${qh.length >= 6 ? "disabled" : ""}>＋ 加一段</button></div>
        ${qh.length ? qh.map((q, i) => `<div class="inrow wrap vq"><input class="input" type="time" value="${esc(q.start || "")}" data-vq="${i}" data-e="start" aria-label="第 ${i + 1} 段开始"><span class="faint">到</span><input class="input" type="time" value="${esc(q.end || "")}" data-vq="${i}" data-e="end" aria-label="第 ${i + 1} 段结束">${q.start && q.end && q.end <= q.start ? `<span class="pill">跨零点</span>` : ""}<button type="button" class="btn sm" data-vx="qdel" data-i="${i}" aria-label="删除这段">✕</button></div>`).join("") : `<div class="faint fs">没有静默时段，全天都可能发</div>`}
        <label class="field"><span>时区 <span class="faint fs">（静默时段和每日计数用）</span></span><input class="input" value="${esc(V.tz || "")}" data-v="tz" placeholder="Asia/Singapore" autocomplete="off"></label>
      </div>
      <div class="card form">
        <label class="switchrow"><div class="grow"><b>没单独设置的群</b><div class="faint fs">默认要不要发语音</div></div>${sw("defaultEnabled", !!V.defaultEnabled)}</label>
        <div class="list flat">${groups.map(g => { const c = (V.perConversation || {})[g.k]; const on = c ? c.enabled !== false : !!V.defaultEnabled; const p = c?.probability ?? V.probability; return `<div class="row sp-row vc-row"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${c ? "单独设置" : "跟随默认"}${today(g.k) ? " · " + today(g.k) : ""}${on ? ` · <span class="faint">估算 ${esc(voiceEstTxt(p, V.cooldownReplies, lim()).replace(/^约 [\d.]+% 的回复带语音（(.*?)），/, "$1，").replace(/每群每天/, "每天"))}</span>` : ""}</div></div>${c ? `<input class="input sp-prob" type="number" min="0" max="1" step="0.01" inputmode="decimal" data-vp="${esc(g.k)}" value="${c.probability ?? ""}" placeholder="${V.probability ?? ""}" aria-label="这个群的语音概率（留空跟随全局）"><button type="button" class="btn sm" data-vunset="${esc(g.k)}">恢复默认</button>` : ""}<span class="switch"><input type="checkbox" data-vs="${esc(g.k)}" ${on ? "checked" : ""} aria-label="${esc(g.name)}"><i></i></span></div>`; }).join("") || `<div class="faint">还没有群会话</div>`}</div>
        <div class="faint fs">单独设置的群可以填自己的概率（0–1），留空跟随全局。私聊暂不支持。${VT.configured ? `今日计数按 ${esc(VT.tz || V.tz || "")} 的 ${esc(VT.day || "")} 统计。` : ""}</div>
      </div>
      <button type="button" class="btn danger" data-vx="disable" style="width:100%;margin-top:4px">关闭代码控制（回到由模型决定）…</button>
      ${dirtyBar("vsb", "保存语音").replace("data-reset", "data-vreset").replace("data-save", "data-vsave")}`;
    host.querySelector("#vsb").hidden = !Object.keys(changes()).length;
  };
  const dirty = () => { const b = host.querySelector("#vsb"); if (b) b.hidden = !Object.keys(changes()).length; };
  const save = async (body, ok = "已保存，约 5 秒内生效") => { try { await api.stickerParamsSet({ voice: body }); toast(ok); route(); } catch (x) { toast(x.status === 400 ? scrub(x.message) : x.message); } };
  host.addEventListener("input", e => { const t = e.target; if (t.dataset.v === "probability") { V.probability = +t.value / 100; host.querySelector("#vpv").textContent = t.value + "%"; host.querySelector("#vest").firstChild.nextSibling.nextSibling.textContent = "：" + voiceEstTxt(V.probability, V.cooldownReplies, lim()); dirty(); } });
  host.addEventListener("change", e => { const t = e.target, k = t.dataset.v;
    const int = (lo, hi, nm) => { const n = Number(t.value); if (t.value === "" || !Number.isInteger(n) || n < lo || n > hi) { toast(`${nm}要是 ${lo}–${hi} 的整数`); draw(); return null; } return n; };
    if (t.dataset.vq != null) { if (!/^\d{2}:\d{2}$/.test(t.value)) return toast("时间要像 08:00"); V.quietHours = V.quietHours.map((q, i) => i === +t.dataset.vq ? { ...q, [t.dataset.e]: t.value } : q); }
    else if (t.dataset.vp) { const s = t.value.trim(); const c = { ...V.perConversation[t.dataset.vp] }; if (s === "") delete c.probability; else { const n = +s; if (!(n >= 0 && n <= 1)) { toast("概率要在 0 到 1 之间"); return draw(); } c.probability = Math.round(n * 100) / 100; } V.perConversation = { ...V.perConversation, [t.dataset.vp]: c }; }
    else if (t.dataset.vs) { V.perConversation = { ...(V.perConversation || {}), [t.dataset.vs]: { ...(V.perConversation?.[t.dataset.vs] || {}), enabled: t.checked } }; }
    else if (k === "cooldownReplies") { const n = int(0, 100, "冷却"); if (n == null) return; V[k] = n; }
    else if (k === "dailyLimit") { const n = int(0, 1000, "每日上限"); if (n == null) return; V[k] = n; }
    else if (k === "maxChars") { const n = int(1, 200, "台词长度"); if (n == null) return; V[k] = n; }
    else if (k === "tz") { const s = t.value.trim(); try { new Intl.DateTimeFormat("en", { timeZone: s }); } catch { toast("时区不认识，比如 Asia/Singapore"); return draw(); } V.tz = s; }
    else if (k && t.type === "checkbox") V[k] = t.checked; else return;
    draw(); });
  host.addEventListener("click", async e => {
    const x = e.target.closest("[data-vx]")?.dataset.vx;
    if (x === "enable") { if (await confirmDialog({ title: "启用语音代码控制？", body: `会写入一套默认值：概率 ${Math.round((VD.probability ?? 0.12) * 100)}%、冷却 ${VD.cooldownReplies ?? 4} 条、每群每天最多 ${VD.dailyLimit ?? 20} 条。之后随时可以调。`, ok: "启用" })) save({ ...VD }, "已启用，约 5 秒内生效"); return; }
    if (x === "disable") {
      if (!await confirmDialog({ title: "关闭语音代码控制？", body: "整段语音设置会被删除，之后回到由模型自己决定什么时候发语音。旧设置会备份，可由后端从备份恢复。", ok: "继续", danger: true })) return;
      if (!await confirmDialog({ title: "确定关闭吗？", body: "概率、冷却、静默时段、各群设置都会清掉。需要时可由后端从备份恢复。", ok: "确定关闭", danger: true })) return;
      return save(null, "已关闭，约 5 秒内生效");
    }
    if (x === "qadd") { V.quietHours = [...(V.quietHours || []), { start: "23:00", end: "07:00" }].slice(0, 6); return draw(); }
    if (x === "qdel") { const q = V.quietHours.filter((_, i) => i !== +e.target.closest("[data-i]").dataset.i); V.quietHours = q.length ? q : null; return draw(); }
    const u = e.target.closest("[data-vunset]"); if (u) { V.perConversation = { ...V.perConversation }; delete V.perConversation[u.dataset.vunset]; return draw(); }
    if (e.target.closest("[data-vreset]")) { V = JSON.parse(JSON.stringify(V0)); return draw(); }
    if (e.target.closest("[data-vsave]")) { const c = changes(); if (Object.keys(c).length) save(c); }
  });
  draw();
}
async function stkParams(v, tabs) {
  const [d, ss] = await Promise.all([api.stickerParams(), api.sessions().catch(() => ({ sessions: [] }))]);
  const P0 = JSON.parse(JSON.stringify(d.params || {})); let P = JSON.parse(JSON.stringify(P0));
  await loadAliases();
  const groups = (ss.sessions || []).map(x => ({ x, t: qqTarget(x.key) })).filter(o => o.t?.kind === "group").map(o => ({ k: "group:" + o.t.id.toLowerCase(), name: sessName(o.x) }));
  for (const k of Object.keys(P.sessions || {})) if (!groups.some(g => g.k === k)) { const id = k.replace(/^(group|c2c):/, ""); groups.push({ k, name: aliasFor(id) || (k.startsWith("c2c:") ? "私聊 " : "群 ") + shortId(id.toUpperCase()) }); }
  const gt = d.genToday;
  const sw = (name, on, extra = "") => `<span class="switch"><input type="checkbox" data-p="${name}" ${on ? "checked" : ""} ${extra}><i></i></span>`;
  const draw = () => {
    const q = P.quietHours; const pr = Math.round((P.attachProbability ?? 0) * 100);
    root.querySelector("#pf").innerHTML = `
      <div class="card form">
        <label class="switchrow"><div class="grow"><b>表情总开关</b><div class="faint fs">关掉后群聊里不会再配表情</div></div>${sw("enabled", P.enabled)}</label>
        <label class="field"><span>每轮配表情的概率 <b class="tnum" id="prv">${pr}%</b></span><input type="range" min="0" max="100" step="1" value="${pr}" data-p="attachProbability" class="range"></label>
        <label class="field"><span>冷却</span><div class="inrow"><input class="input" type="number" min="0" step="1" inputmode="numeric" value="${esc(P.cooldownReplies ?? "")}" data-p="cooldownReplies"><span class="faint">条回复内不再配</span></div></label>
        <label class="switchrow"><div class="grow"><b>静默时段</b><div class="faint fs">这段时间不配表情</div></div>${sw("quietOn", !!q)}</label>
        ${q ? `<div class="inrow wrap"><input class="input" type="time" value="${esc(q.start || "")}" data-p="qStart" aria-label="开始"><span class="faint">到</span><input class="input" type="time" value="${esc(q.end || "")}" data-p="qEnd" aria-label="结束"><input class="input" value="${esc(q.tz || "Asia/Singapore")}" data-p="qTz" aria-label="时区" style="flex:1;min-width:140px"></div>` : ""}
      </div>
      <div class="section">各个群</div>
      <div class="card form">
        <label class="switchrow"><div class="grow"><b>没单独设置的群</b><div class="faint fs">默认要不要配表情</div></div>${sw("defaultEnabled", P.defaultEnabled)}</label>
        <div class="list flat">${groups.map(g => { const c = (P.sessions || {})[g.k]; const on = c ? c.enabled !== false : !!P.defaultEnabled; const isC = g.k.startsWith("c2c:"); return `<div class="row sp-row"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${c ? "单独设置" : "跟随默认"}${isC ? " · 私聊暂不生效" : ""}</div></div>${c ? `<input class="input sp-prob" type="number" min="0" max="1" step="0.05" inputmode="decimal" data-prob="${esc(g.k)}" value="${c.probability ?? ""}" placeholder="${P.attachProbability ?? ""}" aria-label="这个会话的概率（留空跟随全局）"><button type="button" class="btn sm" data-unset="${esc(g.k)}">恢复默认</button>` : ""}<span class="switch"><input type="checkbox" data-sess="${esc(g.k)}" ${on ? "checked" : ""} aria-label="${esc(g.name)}"><i></i></span></div>`; }).join("") || `<div class="faint">还没有群会话</div>`}</div>
        <div class="faint fs">单独设置的会话可以填自己的概率（0–1），留空就跟随上面的全局概率。私聊的设置会保存，但暂时不生效。</div>
      </div>
      <div class="section">自动生图</div>
      <div class="card form">
        <label class="switchrow"><div class="grow"><b>允许自动画新表情</b><div class="faint fs">${gt ? `今天已画 ${gt.count ?? 0} / ${gt.cap ?? "—"} 张` : ""}</div></div>${sw("genEnabled", P.genEnabled)}</label>
        <label class="field"><span>每天最多画</span><div class="inrow"><input class="input" type="number" min="0" step="1" inputmode="numeric" value="${esc(P.genDailyCap ?? "")}" data-p="genDailyCap"><span class="faint">张（和这里手动生成共用）</span></div></label>
      </div>`;
    const diff = changes(); root.querySelector("#psb").hidden = !Object.keys(diff).length;
  };
  const changes = () => { const o = {}; for (const k of ["enabled", "attachProbability", "cooldownReplies", "quietHours", "defaultEnabled", "genEnabled", "genDailyCap"]) if (JSON.stringify(P[k] ?? null) !== JSON.stringify(P0[k] ?? null)) o[k] = P[k] ?? null;
    // sessions 是整体替换：有改动就提交完整的 map（删掉的条目直接不带）
    const norm = m => Object.fromEntries(Object.entries(m || {}).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, { enabled: v.enabled !== false, ...(v.probability != null ? { probability: v.probability } : {}) }]));
    if (JSON.stringify(norm(P0.sessions)) !== JSON.stringify(norm(P.sessions))) o.sessions = norm(P.sessions); return o; };
  const root = paint(v, top("表情库", "参数") + tabs + `<div id="pf"></div>` + dirtyBar("psb") + `<div id="vf"></div>`);
  if (v.closest?.(".v3body")) root.querySelector("#vf").innerHTML = `<div class="section">语音</div><div class="card mlist"><a class="mrow" href="#/voice#rules"><span class="mic">${ic("play")}</span><span class="grow"><b>发语音的规则搬到了「语音」</b><small>概率、冷却、每日上限、静默时段、按群开关</small></span><span class="mchev">${ic("chev")}</span></a></div>`; else voiceSection(root.querySelector("#vf"), d, groups);
  root.addEventListener("input", e => { const t = e.target; if (t.dataset.p === "attachProbability") { P.attachProbability = +t.value / 100; root.querySelector("#prv").textContent = t.value + "%"; root.querySelector("#psb").hidden = !Object.keys(changes()).length; } });
  root.addEventListener("change", e => { const t = e.target, k = t.dataset.p;
    if (t.dataset.prob) { const v = t.value.trim(); const c = { ...P.sessions[t.dataset.prob] }; if (v === "") delete c.probability; else { const n = +v; if (!(n >= 0 && n <= 1)) { toast("概率要在 0 到 1 之间"); t.value = c.probability ?? ""; return; } c.probability = Math.round(n * 100) / 100; } P.sessions = { ...P.sessions, [t.dataset.prob]: c }; }
    else if (t.dataset.sess) { P.sessions = { ...(P.sessions || {}) }; P.sessions[t.dataset.sess] = { ...(P.sessions[t.dataset.sess] || {}), enabled: t.checked }; }
    else if (k === "qStart" || k === "qEnd") { if (!/^\d{2}:\d{2}$/.test(t.value)) return toast("时间要像 08:00"); P.quietHours = { ...P.quietHours, [k === "qStart" ? "start" : "end"]: t.value }; }
    else if (k === "quietOn") P.quietHours = t.checked ? { start: "00:00", end: "08:00", tz: "Asia/Singapore", ...(P0.quietHours || {}) } : null;
    else if (k === "qStart" || k === "qEnd" || k === "qTz") P.quietHours = { ...P.quietHours, [{ qStart: "start", qEnd: "end", qTz: "tz" }[k]]: t.value };
    else if (k === "cooldownReplies" || k === "genDailyCap") P[k] = t.value === "" ? null : Math.max(0, Math.round(+t.value));
    else if (k && t.type === "checkbox") P[k] = t.checked; else return;
    draw(); });
  root.addEventListener("click", async e => {
    const u = e.target.closest("[data-unset]"); if (u) { P.sessions = { ...(P.sessions || {}) }; delete P.sessions[u.dataset.unset]; return draw(); }
    if (e.target.closest("[data-reset]")) { P = JSON.parse(JSON.stringify(P0)); return draw(); }
    if (!e.target.closest("[data-save]")) return; const c = changes(); if (!Object.keys(c).length) return;
    if (await act(() => api.stickerParamsSet(c), "参数已保存，群聊里很快生效")) route();
  });
  draw();
}
async function stkMani(v, tabs) {
  const [, st] = await Promise.all([loadMani(), api.stickers()]); if (!MANI) throw new Error("暂时拿不到表情清单");
  const M0 = MANI.manifest || {}; const items = st.items || [];
  // 按实际文件数（/api/stickers），不看 manifest.files
  const cnt = c => items.filter(x => (x.emotion || String(x.file).split("-")[0]) === c).length;
  let M = { look: M0.look || "", style: M0.style || "", categories: JSON.parse(JSON.stringify(M0.categories || {})) };
  const changes = () => { const o = {}; if (M.look !== (M0.look || "")) o.look = M.look; if (M.style !== (M0.style || "")) o.style = M.style; const c0 = M0.categories || {}, cd = {};
    for (const k of new Set([...Object.keys(c0), ...Object.keys(M.categories)])) { const a = c0[k] ?? null, b = M.categories[k] ?? null; if (JSON.stringify(a) !== JSON.stringify(b)) { if (b === null) cd[k] = null; else { const p = {}; for (const f of ["desc", "scene", "synonyms", "enabled"]) if (JSON.stringify(a?.[f] ?? null) !== JSON.stringify(b[f] ?? null)) p[f] = b[f]; cd[k] = p; } } }
    if (Object.keys(cd).length) o.categories = cd; return o; };
  const root = paint(v, top("表情库", "形象与分类") + tabs + `
    <div class="card form"><label class="field"><span>她的形象描述 <span class="faint cnt" data-c="look"></span></span><textarea class="input" rows="5" maxlength="2000" data-m="look" placeholder="星野のねこ长什么样：发色、眼睛、衣服、标志性的小细节…">${esc(M.look)}</textarea></label>
    <label class="field"><span>画风 <span class="faint cnt" data-c="style"></span></span><textarea class="input" rows="3" maxlength="1000" data-m="style" placeholder="比如：Q 版、粗描边、白底贴纸感">${esc(M.style)}</textarea></label>
    <div class="faint fs">生成新表情时会用这两段。</div></div>
    <div class="section">分类</div><div id="cats"></div>
    <button type="button" class="newgroup" data-x="addcat">＋ 新分类</button>` + dirtyBar("msb"));
  const drawCats = () => { $("#cats", root).innerHTML = Object.entries(M.categories).map(([k, c]) => c === null ? `<div class="card cat del"><b>${esc(k)}</b> <span class="faint">保存后删除</span> <button type="button" class="btn sm" data-undel="${esc(k)}">撤销</button></div>` : `<div class="card cat form" data-cat="${esc(k)}">
      <div class="switchrow"><div class="grow"><b>${esc(k)}</b> <span class="faint fs">${cnt(k)} 张</span></div><span class="switch"><input type="checkbox" data-f="enabled" ${c.enabled !== false ? "checked" : ""} aria-label="启用「${esc(k)}」"><i></i></span></div>
      <label class="field"><span>描述</span><input class="input" maxlength="40" data-f="desc" value="${esc(c.desc || "")}" placeholder="这个表情表达什么"></label>
      <label class="field"><span>使用场景 <span class="faint fs">会出现在群聊提示里</span></span><input class="input" maxlength="40" data-f="scene" value="${esc(c.scene || "")}" placeholder="什么时候用"></label>
      <label class="field"><span>近义词 <span class="faint fs">用逗号分开，最多 40 个</span></span><input class="input" data-f="synonyms" value="${esc((c.synonyms || []).join("，"))}" placeholder="开心，高兴，耶"></label>
      <button type="button" class="btn sm danger" data-delcat="${esc(k)}" ${cnt(k) ? `disabled title="这个分类下还有 ${cnt(k)} 张图，先把图换走才能删"` : ""}>删除分类</button>${cnt(k) ? `<span class="faint fs"> 还有 ${cnt(k)} 张图，先换走才能删</span>` : ""}
    </div>`).join("") || `<div class="card empty">还没有分类</div>`; };
  const upd = () => { $("#msb", root).hidden = !Object.keys(changes()).length; root.querySelectorAll(".cnt").forEach(e => e.textContent = `${M[e.dataset.c].length}/${e.dataset.c === "look" ? 2000 : 1000}`); };
  root.addEventListener("input", e => { const t = e.target;
    if (t.dataset.m) M[t.dataset.m] = t.value;
    const cd = t.closest("[data-cat]"); if (cd && t.dataset.f) { const c = M.categories[cd.dataset.cat]; if (t.dataset.f === "enabled") c.enabled = t.checked; else if (t.dataset.f === "synonyms") { c.synonyms = [...new Set(t.value.split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean))]; } else c[t.dataset.f] = t.value; }
    upd(); });
  root.addEventListener("click", async e => { const t = e.target;
    if (t.closest("[data-x=addcat]")) { const n = (await promptSheet("新分类", "", "1–16 个中文、字母或数字"))?.trim(); if (!n) return; if (!CAT_RE.test(n)) return toast("分类名要 1–16 个中文、字母或数字，不能有 -"); if (M.categories[n]) return toast("已经有这个分类了"); M.categories[n] = { desc: "", scene: "", synonyms: [], enabled: true }; drawCats(); return upd(); }
    const dc = t.closest("[data-delcat]"); if (dc) { if (!await confirmDialog({ title: `删除分类「${dc.dataset.delcat}」？`, body: "保存后这个分类会从清单里去掉。", ok: "删除", danger: true })) return; if ((M0.categories || {})[dc.dataset.delcat]) M.categories[dc.dataset.delcat] = null; else delete M.categories[dc.dataset.delcat]; drawCats(); return upd(); }
    const ud = t.closest("[data-undel]"); if (ud) { M.categories[ud.dataset.undel] = JSON.parse(JSON.stringify(M0.categories[ud.dataset.undel])); drawCats(); return upd(); }
    if (t.closest("[data-reset]")) { M = { look: M0.look || "", style: M0.style || "", categories: JSON.parse(JSON.stringify(M0.categories || {})) }; root.querySelector("[data-m=look]").value = M.look; root.querySelector("[data-m=style]").value = M.style; drawCats(); return upd(); }
    if (!t.closest("[data-save]")) return; const c = changes(); if (!Object.keys(c).length) return;
    for (const [k, x] of Object.entries(c.categories || {})) if (x?.synonyms && (x.synonyms.length > 40 || x.synonyms.some(s => [...s].length > 16))) return toast(`「${k}」的近义词最多 40 个、每个不超过 16 字`);
    if (await act(() => api.stickerManifestSet(c), "已保存")) route();
  });
  drawCats(); upd();
}
async function stkTrash(v, tabs) {
  const d = await api.stickerTrash(); const it = (d.items || []).slice().sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const kind = f => /-deleted-/.test(f) ? "挪走的" : /-rename-/.test(f) ? "换分类前的备份" : /params|manifest/.test(f) ? "设置备份" : "其他";
  paint(v, top("表情库", "回收目录") + tabs + `<div class="faint fs" style="margin:0 0 10px">挪走的表情和改动前的备份都放在这里，没有真的删掉。要找回请在服务器上操作。</div>` + (it.length ? `<div class="list">${it.map(x => `<div class="row"><span class="stk-s ph">🗂️</span><div class="grow"><div class="t mono" style="font-size:13px;overflow-wrap:anywhere">${esc(x.file)}</div><div class="d">${kind(x.file)} · ${bytes(x.size)}${x.mtime ? " · " + fmtTime(x.mtime) : ""}</div></div></div>`).join("")}</div>` : `<div class="card empty"><b>🗂️</b>回收目录是空的</div>`));
}
const BKEY = { heartbeat: "心跳", every: "间隔", activeHours: "活跃时段", isolatedSession: "独立会话", lightContext: "精简上下文", ackMaxChars: "确认字数上限", session: "会话", to: "发送目标", accountId: "账号", directPolicy: "私聊策略", includeReasoning: "附带思考", suppressToolErrorWarnings: "隐藏工具报错", lastRunAt: "上次运行", nextRunAt: "下次运行", result: "结果", text: "内容", ok: "成功", lastHeartbeat: "上次心跳", mediaTags: "媒体标签", followupGate: "追问闸门", enabled: "开启", keepalive: "保活", lurkSticker: "潜水表情", groupNames: "群名", every: "间隔", everyMs: "间隔", target: "目标", model: "模型", prompt: "提示词", at: "时间", status: "状态", reason: "原因", durationMs: "用时" };
function bval(v, k) {
  if (v === true) return "开"; if (v === false) return "关"; if (v == null) return "—";
  if (typeof v === "number") return /At$|Ms$|^ts$/.test(k || "") && v > 1e12 ? fmtTime(v) : /ms$/i.test(k || "") && !/At/.test(k) ? tdur(v) : String(v);
  if (Array.isArray(v)) return v.length ? v.map(x => typeof x === "object" ? bval(x) : esc(scrub(x))).join("、") : "没有";
  if (typeof v === "object") return `<dl class="kv sub">${Object.entries(v).map(([kk, vv]) => `<dt>${esc(BKEY[kk] || kk)}</dt><dd>${bval(vv, kk)}</dd>`).join("")}</dl>`;
  return esc(scrub(v));
}
VIEWS.behavior = async v => {
  const d = await api.behavior(); const keys = ["heartbeat", "lastHeartbeat", "followupGate", "mediaTags", "groupNames"];
  const rest = Object.keys(d).filter(k => !keys.includes(k) && k !== "readOnly");
  paint(v, top("主动行为参数", "只读") + `<div class="faint" style="font-size:12.5px;margin:-4px 0 12px">这里只能看，改不了。敏感的设置只显示“已设置 / 未设置”。</div>` + [...keys, ...rest].filter(k => k in d).map(k => `<div class="section">${esc(BKEY[k] || k)}</div><div class="card bh">${typeof d[k] === "object" && d[k] && !Array.isArray(d[k]) ? bval(d[k], k) : `<div>${bval(d[k], k)}</div>`}</div>`).join(""));
};

// ---------- v2.4 个人档案 ----------
async function profileSheet(id, after, sessKey) {
  let d, it = null; try { d = await api.profile(id); if (sessKey) it = await api.interactions(sessKey).then(r => (r.people || []).find(p => String(p.id).toLowerCase() === String(id).toLowerCase())).catch(() => null); } catch (x) { return toast(notReady(x) ? "档案功能后台还没开放" : x.message); }
  const p = d.profile || {};
  sheet(`<h2>${esc(aliasFor(id) || p.name || d.lastSeenName || shortId(id))}</h2>
    <div class="faint mono" style="font-size:12px;overflow-wrap:anywhere">${esc(String(id).toLowerCase())}</div>
    ${it ? `<div class="it-mini"><span>发言 <b>${it.messages ?? 0}</b></span><span>她回了 <b>${it.replies ?? 0}</b> 轮</span><span>没出声 <b>${it.silences ?? 0}</b> 轮</span><a href="#/interactions/${encodeURIComponent(sessKey)}" data-close2>互动统计 ›</a></div>` : ""}<dl class="kv" style="margin:12px 0">${d.alias ? `<dt>别名</dt><dd>${esc(d.alias)}</dd>` : ""}${d.lastSeenName ? `<dt>QQ 上的名字</dt><dd>${esc(d.lastSeenName)}</dd>` : ""}${p.updatedAt ? `<dt>上次修改</dt><dd>${fmtTime(p.updatedAt)}</dd>` : ""}</dl>
    <form id="pf"><label class="field"><span>称呼</span><input class="input" name="name" maxlength="40" value="${esc(p.name || "")}" placeholder="比如：小葵"></label>
    <label class="field"><span>备注</span><textarea class="input" name="note" rows="6" maxlength="4000" style="height:auto;padding:10px 13px" placeholder="喜好、生日、聊过的事…只存在控制台，不会进星野のねこ的上下文">${esc(p.note || "")}</textarea></label>
    <div class="faint" style="font-size:12px;margin:-4px 0 12px">档案只保存在控制台里，星野のねこ看不到。两项都清空就会删掉这份档案。</div>
    <div style="display:flex;gap:10px"><button type="button" class="btn" data-close style="flex:1">关闭</button><button class="btn primary" style="flex:2">保存</button></div></form>`, (el, close) => {
    el.querySelector("[data-close]").onclick = close; el.querySelector("[data-close2]")?.addEventListener("click", close);
    el.querySelector("#pf").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), name = String(f.get("name")).trim(), note = String(f.get("note")).trim();
      if (!name && !note && d.profile && !await confirmDialog({ title: "删除这份档案？", body: "称呼和备注都清空了，保存会删除这份档案。", ok: "删除", danger: true })) return;
      if (await act(() => api.profileSet(id, name, note), !name && !note ? "档案已删除" : "档案已保存")) { close(true); after?.(); }
    };
  });
}
// ---------- v2.4 会话分组 ----------
let GROUPS = [];
const loadGroups = () => api.groups().then(d => { GROUPS = (d?.groups || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }).catch(() => { GROUPS = []; });
const groupOf = x => x.groupId !== undefined && x.groupId !== null ? x.groupId : GROUPS.find(g => (g.sessionKeys || []).includes(x.key))?.id || null;
const collapsed = () => { try { return new Set(JSON.parse(localStorage.getItem("hs-gcol") || "[]")); } catch { return new Set(); } };
async function groupEdit(g, after) {
  const name = await promptSheet(g ? "重命名分组" : "新建分组", g?.name || "", "比如：家人、读书会");
  if (name == null) return; if (!name.trim()) return toast("名字不能为空");
  if (await act(() => api.groupSet({ id: g?.id, name: name.trim(), sessionKeys: g?.sessionKeys || [] }), g ? "已重命名" : `已新建「${name.trim()}」`)) after?.();
}
async function groupDelete(g, after) {
  if (!await confirmDialog({ title: `删除分组「${esc(g.name)}」？`, body: `里面的 ${(g.sessionKeys || []).length} 个会话不会被删除，只是回到「未分组」。`, ok: "删除分组", danger: true })) return;
  if (await act(() => api.groupDelete(g.id), "分组已删除")) after?.();
}
async function moveToGroup(key, gid, after) {
  const cur = GROUPS.find(g => (g.sessionKeys || []).includes(key));
  if ((cur?.id || "") === (gid || "")) return;
  const ok = await act(async () => {
    // 后端会自动把这些 key 从其他组移除；移出分组则重发旧组（去掉该 key）
    if (gid) { const g = GROUPS.find(x => x.id === gid); await api.groupSet({ id: g.id, name: g.name, sessionKeys: [...new Set([...(g.sessionKeys || []), key])] }); }
    else if (cur) await api.groupSet({ id: cur.id, name: cur.name, sessionKeys: cur.sessionKeys.filter(k => k !== key) });
  }, gid ? `已移到「${GROUPS.find(x => x.id === gid)?.name}」` : "已移出分组");
  if (ok) { await loadGroups(); after?.(); }
}
function promptSheet(title, val, ph) {
  return new Promise(res => { let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const close = sheet(`<h2>${esc(title)}</h2><form id="ps"><input class="input" name="v" maxlength="40" value="${esc(val)}" placeholder="${esc(ph)}" aria-label="${esc(title)}"><div style="display:flex;gap:10px;margin-top:16px"><button type="button" class="btn" data-close style="flex:1">取消</button><button class="btn primary" style="flex:2">好</button></div></form>`, (el, c) => {
      const inp = el.querySelector("input"); setTimeout(() => inp.focus(), 60);
      el.querySelector("[data-close]").onclick = async () => { if (await c()) fin(null); };
      el.querySelector("#ps").onsubmit = e => { e.preventDefault(); fin(inp.value); c(true); };
      el.parentElement._onclose = () => fin(null);
    });
    void close;
  });
}
function groupMenu(g, after) {
  sheet(`<h2>分组「${esc(g.name)}」</h2><div class="morelist"><a href="#" data-g="rename">${ic("tune")}重命名</a><a href="#" data-g="del" style="color:var(--danger,#e5484d)">${ic("trash")}删除分组</a></div>`, (el, close) => {
    el.addEventListener("click", e => { const a = e.target.closest("[data-g]"); if (!a) return; e.preventDefault(); close(); a.dataset.g === "rename" ? groupEdit(g, after) : groupDelete(g, after); });
  });
}
const hl = (t, q) => { const e = esc(t); if (!q) return e; const qe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return e.replace(new RegExp(qe, "gi"), m => `<mark>${m}</mark>`); };
function searchSheet() {
  sheet(`<div class="search">${ic("search")}<input class="input" id="gq" type="search" placeholder="搜聊天记录、会话、技能、配置项…" autocomplete="off"></div><div id="gr" class="gres"></div>`, async (el, close) => {
    const q = el.querySelector("#gq"), box = el.querySelector("#gr"); setTimeout(() => q.focus(), 60);
    box.innerHTML = `<div class="faint" style="padding:16px 4px">正在准备索引…</div>`;
    searchIdx ||= await buildIndex(); if (!GROUPS.length) await loadGroups(); let sel = 0, hits = [];
    let srv = null, seq = 0, tmr;
    const sessHit = x => ({ kind: "会话", t: sessName(x), d: [rawId(x), x.channel, x.model].filter(Boolean).join(" · "), href: "#/sessions/" + encodeURIComponent(x.key), icon: "chat" });
    const msgHit = r => { const sx = (sessCache?.sessions || []).find(y => y.key === r.sessionKey); const g = GROUPS.find(x => x.id === r.groupId);
      return { mid: r.messageId, kind: "消息", t: String(r.snippet || "").replace(/\s+/g, " ").slice(0, 140), d: [r.alias || r.displayName || (sx ? sessName(sx) : r.sessionKey), g?.name, r.role === "assistant" ? "星野のねこ" : r.role === "user" ? "用户" : r.role, r.timestamp ? fmtTime(r.timestamp) : ""].filter(Boolean).join(" · "), href: "#/sessions/" + encodeURIComponent(r.sessionKey), icon: "chat", msg: true }; };
    const fetchSrv = s => { clearTimeout(tmr); if (!s) { srv = null; return; } const my = ++seq; tmr = setTimeout(async () => {
      const [a, b] = await Promise.allSettled([api.sessions(0, s), s.length >= 2 ? api.search(s, 15) : Promise.resolve({ results: [] })]);
      if (my !== seq) return; srv = [...(a.status === "fulfilled" ? (a.value.sessions || []).map(sessHit) : []), ...(b.status === "fulfilled" ? (b.value.results || []).map(msgHit) : [])];
      if (b.status === "fulfilled" && b.value.truncated) srv.push({ kind: "提示", t: "结果太多，只显示前 15 条，换个更具体的词试试", d: "", icon: "search", none: true }); draw(); }, 260); };
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const local = s ? searchIdx.filter(x => (srv ? x.kind !== "会话" : true) && (x.t + " " + x.d + " " + (x.q || "")).toLowerCase().includes(s)) : searchIdx.filter(x => x.kind === "页面");
      hits = (s && srv ? [...srv, ...local] : local).slice(0, 40);
      sel = Math.min(sel, Math.max(0, hits.length - 1));
      box.innerHTML = hits.length ? hits.map((x, i) => `<button class="row" data-i="${i}" ${i === sel ? 'aria-selected="true"' : ""}>${ic(x.icon)}<div class="grow"><div class="t ${x.msg ? "snip" : ""}" style="font-weight:500">${x.msg ? hl(x.t, q.value.trim()) : esc(x.t)}</div>${x.d ? `<div class="d">${esc(x.d)}</div>` : ""}</div><span class="pill">${x.kind}</span></button>`).join("") : `<div class="empty">没有找到「${esc(q.value)}」</div>`;
    };
    const go = x => { if (!x || x.none) return; close(); if (x.skill) { location.hash = "#/plugins"; setTimeout(() => skillSheet(x.skill, searchIdx.find(y => y.skill === x.skill)), 400); } else { if (x.mid) sessionStorage.setItem("hs-before", JSON.stringify({ href: x.href, mid: x.mid })); location.hash = x.href; if (x.cfg) sessionStorage.setItem("hs-cfg", x.cfg); } };
    q.oninput = () => { sel = 0; srv = null; fetchSrv(q.value.trim()); draw(); };
    q.onkeydown = e => { if (e.key === "ArrowDown") { sel = Math.min(sel + 1, hits.length - 1); draw(); e.preventDefault(); } if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); } if (e.key === "Enter") go(hits[sel]); };
    box.onclick = e => { const b = e.target.closest("[data-i]"); if (b) go(hits[+b.dataset.i]); };
    draw();
  }, "search");
}
document.addEventListener("keydown", e => {
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))) { if ($(".shell") && !$(".sheet")) { e.preventDefault(); searchSheet(); } }
});

// ---- 6 下拉刷新 + 回到顶部 ----
(function gestures() {
  const ind = document.createElement("div"); ind.className = "ptr"; ind.innerHTML = ic("refresh"); document.body.append(ind);
  const topb = document.createElement("button"); topb.className = "totop"; topb.setAttribute("aria-label", "回到顶部"); topb.innerHTML = ic("up"); document.body.append(topb);
  topb.onclick = () => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  addEventListener("scroll", () => topb.classList.toggle("show", scrollY > 600), { passive: true });
  let y0 = null, dy = 0;
  addEventListener("touchstart", e => { y0 = scrollY <= 0 && !$(".sheet") && $(".shell") && !e.target.closest(".msgs,.logs,textarea") ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); const d = Math.min(dy * 0.5, 80); ind.style.transform = `translate(-50%, ${d - 50}px) rotate(${dy * 2}deg)`; ind.style.opacity = Math.min(1, dy / 120); ind.classList.toggle("ready", dy > 140); }, { passive: true });
  addEventListener("touchend", async () => { if (y0 == null) return; const go = dy > 140; y0 = null;
    if (go) { ind.classList.add("spin"); ind.style.transform = "translate(-50%, 20px)"; searchIdx = null; await route(); toast("已刷新"); }
    ind.classList.remove("spin", "ready"); ind.style.transform = ""; ind.style.opacity = 0; });
})();

// ---- 6 PWA ----
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=2026.11.3").catch(() => {}));
}


// ================= v3：一个主题一页（更多 → 主题页，最多两层） =================
const OLDV = { ...VIEWS };
const V3T = [
  ["persona", "人设", "people", "技术模式 · 拟人化 · 小脾气 · 人设文件", [
    ["tech", "技术模式", { fn: v3Tech }, "一眼看开没开"], ["humanlike", "拟人化", { v: "humanlike", s: "" }, "追问、主见、口癖、护短…"], ["followups", "待追问", { v: "humanlike", s: "followups" }, "过几天要问的事"],
    ["fun", "小脾气", { v: "fun", s: "" }, "记仇、群梗、吃醋"], ["grudges", "记仇本", { v: "fun", s: "grudges" }, ""], ["gags", "群梗", { v: "fun", s: "gags" }, ""],
    ["play", "玩梗（准备中）", { fn: v3Play }, "还没上线"], ["files", "人设文件", { v: "files", s: "" }, "人设、说话风格"], ["backup", "小脾气备份", { v: "fun", s: "trash" }, ""]]],
  ["voice", "语音", "play", "发语音规则 · 合成 · 音色库", [
    ["rules", "发语音规则", { fn: v3VoiceRules }, "概率、冷却、上限、静默、按群"], ["tts", "合成", { v: "humanlike", s: "voice" }, "合成服务和参数"], ["voices", "音色库", { v: "humanlike", s: "voices" }, "试听、添加、删除"]]],
  ["stickers", "表情", "smile", "表情库 · 生成 · 参数 · 形象与分类", [
    ["list", "表情库", { v: "stickers", s: "" }, ""], ["gen", "生成", { v: "stickers", s: "gen" }, ""], ["params", "发表情参数", { v: "stickers", s: "params" }, ""], ["manifest", "形象与分类", { v: "stickers", s: "manifest" }, ""], ["trash", "回收目录", { v: "stickers", s: "trash" }, ""]]],
  ["memory", "记忆", "brain", "按人看 · 记错的 · 文件 · 备份", [
    ["people", "按人看", { v: "memory", s: "" }, ""], ["flags", "记错的", { v: "memory", s: "flags" }, ""], ["files", "记忆文件", { v: "memory", s: "files" }, "只能看"], ["backups", "删除备份", { v: "memory", s: "backups" }, ""]]],
  ["groups", "群", "people", "群报 · 互动统计 · 审批与配对", [
    ["digest", "群报", { v: "digest", s: "" }, "每天到点自动生成"], ["stats", "互动统计", { v: "interactions", s: "" }, ""], ["approvals", "审批与配对", { v: "approvals", s: "" }, "需要你点头的事"]]],
  ["abilities", "能力与任务", "plug", "插件与技能 · 工具 · 定时任务", [
    ["plugins", "插件与技能", { v: "plugins", s: "" }, ""], ["tools", "工具与扩展", { v: "tools", s: "" }, ""], ["cron", "定时任务", { v: "cron", s: "" }, ""]]],
  ["system", "系统维护", "gear", "渠道 · 审计与诊断 · 主动行为 · 配置", [
    ["channels", "渠道", { v: "channels", s: "" }, "连接状态"], ["audit", "审计与诊断", { v: "audit", s: "" }, ""], ["behavior", "主动行为参数", { v: "behavior", s: "" }, "只读；要改主动搭话请去 人设 › 拟人化"], ["config", "配置", { v: "config", s: "" }, "网关配置"]]],
];
const V3G = [["她是谁", ["persona", "voice", "stickers", "memory"]], ["她在哪、做什么", ["groups", "abilities", "system"]]];
const TOPIC = Object.fromEntries(V3T.map(([k, t, i, d, secs]) => [k, { k, t, i, d, secs: secs.map(([id, title, src, sum]) => ({ id, title, src, sum })) }]));
// 侧栏/搜索/标题：底部导航页 + 主题页
{ const keep = ROUTES.filter(r => TABS0.includes(r[0])); ROUTES.length = 0; ROUTES.push(...keep, ...V3T.map(([k, t, i]) => [k, t, i])); }

// 旧路由 → 新锚点（d = 详情，用底部弹层打开）
function v3alias(name, rest) {
  const [a, ...b] = (rest || "").split("/"); const tail = b.join("/");
  const M = {
    humanlike: () => ({ "": ["persona", "humanlike"], followups: ["persona", "followups"], voice: ["voice", "tts"], voices: ["voice", "voices"] })[rest || ""],
    fun: () => ({ "": ["persona", "fun"], grudges: ["persona", "grudges"], gags: ["persona", "gags"], trash: ["persona", "backup"] })[rest || ""],
    files: () => rest ? ["persona", "files", { file: rest }] : ["persona", "files"],
    stickers: () => ({ gen: ["stickers", "gen"], params: ["stickers", "params"], manifest: ["stickers", "manifest"], trash: ["stickers", "trash"] })[rest],
    memory: () => a === "s" ? ["memory", "people", { v: "memory", s: rest, t: "这个人的记忆" }] : a === "files" ? (tail ? ["memory", "files", { v: "memory", s: rest, t: tail }] : ["memory", "files"]) : ({ flags: ["memory", "flags"], backups: ["memory", "backups"] })[rest],
    digest: () => rest ? ["groups", "digest", { v: "digest", s: rest, t: "群报" }] : ["groups", "digest"],
    interactions: () => rest ? ["groups", "stats", { v: "interactions", s: rest, t: "互动统计" }] : ["groups", "stats"],
    approvals: () => ["groups", "approvals"], plugins: () => ["abilities", "plugins"], tools: () => ["abilities", "tools"], cron: () => ["abilities", "cron"],
    channels: () => ["system", "channels"], audit: () => ["system", "audit"], behavior: () => ["system", "behavior"], config: () => ["system", "config"],
  };
  const r = M[name]?.(); return r ? { t: r[0], sec: r[1], d: r[2] } : null;
}
const v3parse = h => { const m = /^#\/([^#]*)(?:#(.*))?$/.exec(h || "") || []; const path = m[1] || "overview"; const [name, ...r] = path.split("/"); let rest = ""; try { rest = r.map(decodeURIComponent).join("/"); } catch { rest = r.join("/"); } return { name: name || "overview", rest, sec: m[2] || "" }; };

// ---- 状态（sessionStorage）：展开的分区、滚动、展开全部、搜索词 ----
const v3st = k => { try { return JSON.parse(sessionStorage.getItem("v3st:" + k)) || {}; } catch { return {}; } };
const v3put = (k, o) => { try { sessionStorage.setItem("v3st:" + k, JSON.stringify({ ...v3st(k), ...o })); } catch {} };
let V3 = null; // 当前主题页 { k, el, rendered:Set, lastSec }
let v3hist = +(history.state?.i || 0), v3dir = 0;
const v3stamp = () => { const i = history.state?.i; if (i == null) { const n = (+sessionStorage.getItem("v3i") || 0) + 1; sessionStorage.setItem("v3i", n); history.replaceState({ ...(history.state || {}), i: n }, ""); v3dir = 1; v3hist = n; } else { v3dir = i < v3hist ? -1 : i > v3hist ? 1 : 0; v3hist = i; } };
const v3dirty = () => !!document.querySelector("#view .savebar:not([hidden])");
function v3saveScroll() { if (V3 && document.contains(V3.el)) v3put(V3.k, { y: scrollY }); }
for (const ev of ["wheel", "touchmove", "keydown", "pointerdown"]) addEventListener(ev, () => { if (V3?.pin) { V3.pin = null; V3.lock = 0; } }, { passive: true });
addEventListener("scroll", () => { if (!V3 || !document.contains(V3.el)) return; clearTimeout(v3saveScroll.t); v3saveScroll.t = setTimeout(() => { v3saveScroll(); v3spy(); }, 120); }, { passive: true });

// ---- 弹层接入历史：开弹层 pushState，返回键只关弹层 ----
let v3pageHash = "";
const v3closeAll = async () => { for (const s of [...document.querySelectorAll("[data-v3sheet]")].reverse()) if (!await s._v3close()) return false; return true; };
addEventListener("popstate", e => {
  const open = [...document.querySelectorAll("[data-v3sheet]")];
  // Hash navigation also fires popstate; route() owns its discard confirmation.
  if (open.length && location.hash !== v3pageHash) return;
  if (open.length) { const s = open.at(-1); if (s._v3dirty?.()) history.pushState({ ...(history.state || {}), sheet: 1, i: v3hist }, ""); s._v3close(); return; }
  // 弹层被界面关掉后留下的空历史：和当前页同一个地址时再退一步
  if (e.state?.sheet && v3parse(location.hash).name === v3parse(v3pageHash).name && v3parse(location.hash).rest === v3parse(v3pageHash).rest) history.back();
});

// ---- 主题页 ----
async function v3renderSec(T, s, body) {
  const owner = V3; body.dataset.v3sec = s.id; owner.rendered.add(s.id);
  const st = v3st(T.k);
  try { if (s.src.fn) await s.src.fn(body); else await OLDV[s.src.v](body, s.src.s); }
  catch (e) { if (e.status === 401) throw e; body.innerHTML = `<div class="card empty"><b>😿</b>这一块没加载出来：${esc(scrub(e.message || ""))}<br><br><button class="btn" data-v3retry="${s.id}">再试一次</button></div>`; }
  if (V3 !== owner || !body.isConnected) return;
  v3tidy(body, T.k, s.id);
  const q = st.q?.[s.id]; const inp = body.querySelector('input[type="search"]'); if (q && inp && !inp.value) { inp.value = q; inp.dispatchEvent(new Event("input", { bubbles: true })); }
}
// 去掉旧页面自带的标题栏和分页条；长列表只显示前几条
function v3tidy(body, k, sid) {
  body.querySelectorAll(":scope > .view > header.top").forEach(header => {
    if (!header.querySelector('[data-x="newcron"], [data-x="imp"]')) return header.remove();
    // Keep the original action nodes inside their original delegated event root.
    header.querySelectorAll("h1, .back, [data-act]").forEach(x => x.remove());
    header.classList.remove("top"); header.classList.add("toolbar");
  });
  body.querySelectorAll(":scope > .view > .toolbar:has(.stk-tabs)").forEach(x => x.remove());
  const all = v3st(k).all || {};
  body.querySelectorAll(":scope > .view > .list, :scope > .view .card > .list:not(.flat), :scope > .view .dg-list, :scope > .view .stk-grid").forEach((L, i) => {
    const lim = L.classList.contains("stk-grid") ? 12 : 5, n = L.children.length, key = sid + ":" + i;
    const nx = L.nextElementSibling?.classList.contains("v3all") ? L.nextElementSibling : null;
    if (n <= lim || all[key]) { L.classList.remove("v3cut"); nx?.remove(); return; }
    L.classList.add("v3cut"); L.style.setProperty("--v3lim", lim); L.dataset.v3lim = lim;
    if (!nx) L.insertAdjacentHTML("afterend", `<button type="button" class="btn v3all" data-v3all="${esc(key)}">展开全部 ${n} 个</button>`);
    else nx.textContent = `展开全部 ${n} 个`;
  });
}
function v3observe(body, k, sid) { const mo = new MutationObserver(() => { mo.disconnect(); v3tidy(body, k, sid); mo.observe(body, { childList: true, subtree: true }); }); mo.observe(body, { childList: true, subtree: true }); }

async function v3topic(T, sec, opts = {}) {
  const st = v3st(T.k);
  // 同一个主题页：只滚到分区（或在原地重绘刚操作过的分区）
  if (V3 && V3.k === T.k && document.contains(V3.el) && !opts.fresh) {
    if (sec && sec !== V3.curSec && !opts.redraw) return v3goSec(sec, true);
    const y = scrollY; const ids = V3.lastSec && V3.rendered.has(V3.lastSec) ? [V3.lastSec] : [...V3.rendered];
    for (const id of ids) { const s = T.secs.find(x => x.id === id); const d = V3.el.querySelector(`#v3s-${id}`); if (s && d?.open) await v3renderSec(T, s, d.querySelector(".v3body")); }
    scrollTo(0, y); return;
  }
  const v = replaceView(); if (!v) return;
  sessionStorage.setItem("v3last", T.k);
  const open = new Set(st.open || [T.secs[0].id]); if (sec) open.add(sec);
  const chips = T.secs.map(s => `<a class="v3chip" href="#/${T.k}#${s.id}" data-v3chip="${s.id}">${esc(s.title)}</a>`).join("");
  const secs = T.secs.map(s => `<details class="v3sec card" id="v3s-${s.id}" data-sec="${s.id}" ${open.has(s.id) ? "open" : ""}><summary><b>${esc(s.title)}</b>${s.sum ? `<span class="v3sum">${esc(s.sum)}</span>` : ""}<span class="v3tg" aria-hidden="true"></span></summary><div class="v3body"></div></details>`).join("");
  v.innerHTML = `<div class="view v3page" data-t="${T.k}"><div class="v3head"><div class="v3bc" aria-label="当前位置"><a href="#/more" data-v3back>更多</a> › <b>${esc(T.t)}</b><span id="v3bcs"></span></div>
    <div class="v3row"><a class="v3back" href="#/more" data-v3back aria-label="返回更多">‹ 更多</a><h1>${esc(T.t)}</h1><button class="iconbtn" data-act="search" aria-label="全局搜索">${ic("search")}</button><button class="iconbtn" data-act="theme" aria-label="切换深浅色">${ic(isDark() ? "sun" : "moon")}</button></div>
    <nav class="v3chips" aria-label="分区">${chips}</nav></div>${secs}</div>`;
  V3 = { k: T.k, el: v.firstChild, rendered: new Set(), curSec: "", lastSec: "" };
  document.title = `${T.t} · 星野控制台`;
  const el = V3.el;
  el.querySelectorAll("details.v3sec").forEach(d => { const s = T.secs.find(x => x.id === d.dataset.sec), body = d.querySelector(".v3body"); v3observe(body, T.k, s.id);
    d.addEventListener("toggle", async () => { v3put(T.k, { open: [...el.querySelectorAll("details.v3sec[open]")].map(x => x.dataset.sec) }); if (d.open && !V3.rendered.has(s.id)) { body.innerHTML = `<div class="skel"></div>`; await v3renderSec(T, s, body); } }); });
  await Promise.all([...el.querySelectorAll("details.v3sec[open]")].map(d => v3renderSec(T, T.secs.find(x => x.id === d.dataset.sec), d.querySelector(".v3body"))));
  if (!document.contains(el)) return;
  if (sec) v3goSec(sec, false); else if (v3dir < 0 || opts.restore) scrollTo(0, st.y || 0); else scrollTo(0, 0);
  v3spy(); for (const t of [500, 1400]) setTimeout(() => { if (V3?.el === el) { if (!sec && (v3dir < 0 || opts.restore) && Math.abs(scrollY - (st.y || 0)) > 4) scrollTo(0, st.y || 0); v3spy(); } }, t);
}
async function v3goSec(id, smooth) {
  const d = V3?.el.querySelector(`#v3s-${CSS.escape(id)}`); if (!d) return;
  if (!d.open) d.open = true; // toggle 事件负责渲染
  V3.lock = Date.now() + 2400; V3.pin = id;
  history.replaceState(history.state, "", `#/${V3.k}#${id}`); v3pageHash = location.hash;
  await new Promise(r => setTimeout(r, 30));
  const go = b => { if (!V3 || !document.contains(d)) return; const y = d.getBoundingClientRect().top + scrollY - (V3.el.querySelector(".v3head").offsetHeight + 8); scrollTo({ top: Math.max(0, y), behavior: b }); };
  V3.lock = Date.now() + 2400; const el = V3.el;
  go(smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto");
  v3mark(id);
  // 上面的分区异步加载会把位置顶走，内容到齐后再对齐一次
  for (const t of [450, 1100, 2000]) setTimeout(() => { if (V3?.el === el && V3.curSec === id && Date.now() < V3.lock + 200) go("auto"); }, t);
}
function v3mark(id) { if (!V3) return; V3.curSec = id; V3.el.querySelectorAll("[data-v3chip]").forEach(c => c.classList.toggle("on", c.dataset.v3chip === id)); const s = TOPIC[V3.k].secs.find(x => x.id === id); const b = V3.el.querySelector("#v3bcs"); if (b) b.textContent = s ? " › " + s.title : "";
  const c = V3.el.querySelector(`[data-v3chip="${id}"]`); if (c) { const n = c.parentElement; const l = c.offsetLeft - n.clientWidth / 2 + c.offsetWidth / 2; n.scrollTo({ left: Math.max(0, l) }); } }
function v3spy() { if (!V3 || !document.contains(V3.el) || V3.pin || Date.now() < (V3.lock || 0)) return; const h = V3.el.querySelector(".v3head").getBoundingClientRect().bottom + 12; let cur = null;
  for (const d of V3.el.querySelectorAll("details.v3sec")) { if (d.getBoundingClientRect().top <= h) cur = d.dataset.sec; }
  if (!cur) cur = V3.el.querySelector("details.v3sec")?.dataset.sec || null;
  // 刚定位过去的分区（太靠底、滚不到顶）只要还在屏幕上半部分就保持高亮
  const k = V3.curSec && V3.el.querySelector(`#v3s-${CSS.escape(V3.curSec)}`); if (k && cur !== V3.curSec) { const r = k.getBoundingClientRect(); if (r.top <= innerHeight * 0.45 && r.bottom > h) cur = V3.curSec; }
  if (cur !== (V3.curSec || null)) { v3mark(cur || ""); history.replaceState(history.state, "", `#/${V3.k}${cur ? "#" + cur : ""}`); v3pageHash = location.hash; } }

// 主题页里的点击：芯片、展开全部、返回、旧链接（同主题时原地处理）
document.addEventListener("click", async e => {
  const a = e.target.closest("a[href^='#/']");
  if (V3 && document.contains(V3.el) && e.target.closest("#view")) { const sd = e.target.closest("details.v3sec"); if (sd) V3.lastSec = sd.dataset.sec; }
  const chip = e.target.closest("[data-v3chip]"); if (chip) { e.preventDefault(); return v3goSec(chip.dataset.v3chip, true); }
  const all = e.target.closest("[data-v3all]"); if (all) { const k = V3?.k; if (!k) return; const st = v3st(k); v3put(k, { all: { ...(st.all || {}), [all.dataset.v3all]: true } }); const L = all.previousElementSibling; L?.classList.remove("v3cut"); all.remove(); return; }
  const rt = e.target.closest("[data-v3retry]"); if (rt && V3) { const s = TOPIC[V3.k].secs.find(x => x.id === rt.dataset.v3retry); const body = rt.closest(".v3body"); return v3renderSec(TOPIC[V3.k], s, body); }
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey) return;
  const href = a.getAttribute("href"); const p = v3parse(href);
  // 返回「更多」：上一条历史就是「更多」时退回去，否则替换，不多留历史
  if (a.hasAttribute("data-v3back")) { e.preventDefault(); if (!await v3leaveOk()) return; if (sessionStorage.getItem("v3prev") === "more" && history.length > 1) history.back(); else location.replace("#/more"); return; }
  if (a.closest(".sheet") && !a.closest("[data-v3sheet]")) return; // 其他弹层自己处理
  const al = !TOPIC[p.name] || p.rest ? v3alias(p.name, p.rest) : null;
  const tk = al ? al.t : TOPIC[p.name] ? p.name : null;
  if (tk && V3 && V3.k === tk && document.contains(V3.el)) { e.preventDefault(); const host = a.closest("[data-v3sheet]"); if (host && !await host._v3close()) return; const sec = al ? al.sec : p.sec; if (sec) await v3goSec(sec, true); if (al?.d) v3detail(al.d); return; }
  if (v3dirty() && !a.closest("[data-v3sheet]")) { e.preventDefault(); if (await v3leaveOk()) { v3skip = true; location.hash = href; } }
}, true);
let v3skip = false;
async function v3leaveOk() { if (!v3dirty()) return true; const ok = await confirmDialog({ title: "还有改动没保存", body: "确定离开吗？没保存的改动会丢掉。", ok: "离开", danger: true }); if (ok) v3skip = true; return ok; }

// 详情：底部弹层
function v3detail(d) {
  if (d.file) return fileEditor(d.file);
  sheet(`<div class="v3dh"><b>${esc(d.t || "详情")}</b><button type="button" class="btn sm" data-v3x>关闭</button></div><div class="v3dbody"><div class="skel"></div></div>`, async (el, close) => {
    el.classList.add("wide", "v3d"); el.querySelector("[data-v3x]").onclick = () => close();
    const body = el.querySelector(".v3dbody"); const mo = new MutationObserver(() => body.querySelectorAll("header.top").forEach(x => x.remove())); mo.observe(body, { childList: true, subtree: true });
    try { await OLDV[d.v](body, d.s); } catch (x) { if (x.status === 401) throw x; body.innerHTML = `<div class="card empty"><b>😿</b>${esc(scrub(x.message || ""))}</div>`; }
  }, "v3detail");
}

// 分区：技术模式
async function v3Tech(body) {
  const d = await api.hlGet(); const tm = d.params?.techMode || {}; const on = tm.enabled === true;
  body.innerHTML = `<div class="view"><div class="card form"><label class="switchrow"><div class="grow"><b>技术模式 ${on ? pill("开着", "ac") : pill("关着")}</b><div class="faint fs">聊代码、日志、报错时，所有拟人效果全关。${tm.stickyMin != null ? `最后一条技术消息后保持 ${esc(tm.stickyMin)} 分钟。` : ""}</div></div><span class="switch"><input type="checkbox" data-v3tm ${on ? "checked" : ""} aria-label="开启技术模式"><i></i></span></label>
    <div class="faint fs">关键词、口令等完整参数在下面「拟人化」分区的第一张卡里。</div></div></div>`;
  body.querySelector("[data-v3tm]").onchange = async e => { const want = e.target.checked;
    if (!await confirmDialog({ title: want ? "打开技术模式？" : "关掉技术模式？", body: want ? "打开后拟人效果全部暂停，直到你关掉。" : "关掉后，聊技术话题时拟人效果也会照常出现。", ok: want ? "打开" : "关掉", danger: !want })) { e.target.checked = !want; return; }
    if (await act(() => api.hlSet({ techMode: { enabled: want } }), want ? "技术模式已打开" : "技术模式已关闭")) { V3.lastSec = "tech"; route(); } else e.target.checked = !want; };
}
// 分区：玩梗（只预留，不发任何新字段）
async function v3Play(body) {
  body.innerHTML = `<div class="view"><div class="card empty v3play"><b>🧪</b>黑客梗、简短回复、嘴硬这三个功能还在准备，凛点头后才上线。<br><span class="faint fs">到时这里会有：总开关、概率、每日上限、按群开关、技术聊天里不玩梗的安全锁。</span></div></div>`;
}
// 分区：发语音规则（从表情参数里搬出来）
async function v3VoiceRules(body) {
  const [d, ss] = await Promise.all([api.stickerParams(), api.sessions().catch(() => ({ sessions: [] }))]); await loadAliases();
  const groups = (ss.sessions || []).map(x => ({ x, t: qqTarget(x.key) })).filter(o => o.t?.kind === "group").map(o => ({ k: "group:" + o.t.id.toLowerCase(), name: sessName(o.x) }));
  body.innerHTML = `<div class="view"><div id="vf"></div></div>`; await voiceSection(body.querySelector("#vf"), d, groups);
}

// 「更多」：主题入口 + 刚才进去的那一行高亮
VIEWS.more = async v => {
  const last = sessionStorage.getItem("v3last");
  const row = (href, icon, t, d, extra = "", tag = "") => `<a class="mrow" href="${href}" ${extra}><span class="mic">${ic(icon)}</span><span class="grow"><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span>${tag}<span class="mchev">${ic("chev")}</span></a>`;
  const body = V3G.map(([g, ks]) => `<div class="section">${esc(g)}</div><div class="card mlist">${ks.map(k => { const T = TOPIC[k]; return row(`#/${k}`, T.i, T.t, T.d, `data-v3t="${k}"`, k === "persona" ? `<span class="pill" id="v3tmtag" hidden></span>` : ""); }).join("")}</div>`).join("");
  const root = paint(v, top("更多") + body + `<div class="section">外观与账号</div><div class="card mlist">${row("#", isDark() ? "sun" : "moon", isDark() ? "切换到浅色" : "切换到深色", "跟随你的选择保存在这台设备", 'data-mx="theme"')}${row("#", "out", "退出登录", "", 'data-mx="out"')}</div>`);
  root.addEventListener("click", e => { const a = e.target.closest("[data-mx]"); if (!a) return; e.preventDefault(); if (a.dataset.mx === "theme") { toggleTheme(); route(); } else logout(); });
  api.hlGet().then(d => { const t = root.querySelector("#v3tmtag"); if (!t) return; const on = d.params?.techMode?.enabled === true; t.hidden = false; t.className = "pill" + (on ? " ac" : ""); t.textContent = "技术模式 " + (on ? "开" : "关"); }).catch(() => {});
  if (last) { const r = root.querySelector(`[data-v3t="${last}"]`); if (r) { setTimeout(() => { r.scrollIntoView({ block: "nearest" }); r.classList.add("v3hl"); setTimeout(() => r.classList.remove("v3hl"), 1600); }, 30); } sessionStorage.removeItem("v3last"); }
};

// ---------- 启动 ----------
setUnauthedHandler(() => showLogin());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderChrome);
async function boot() {
  let me; try { me = await api.me(); } catch { me = { authed: false }; }
  if (!me.authed) return showLogin();
  if (suspendedUi && cliAllowed(me) === suspendedUi.canCli) { CAN_CLI = cliAllowed(me); restoreSuspendedUi(); return; }
  discardSuspendedUi();
  CAN_CLI = cliAllowed(me); if ($(".shell") && !CAN_CLI) app.innerHTML = "";
  if (!$(".shell")) shell();
  route();
}
window.addEventListener("hashchange", () => $(".shell") ? route() : null);
boot();
