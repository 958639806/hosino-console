// HOSINO-CONSOLE-5FEATURES v2（staging 2026-11-10）
// 补齐 11-03 定的 5 项里还缺的后端：白名单单值配置、插件/技能启停、模型账号退出、密钥存放位置、记忆后端状态。
// 只走网关官方 RPC：config.get / config.schema.lookup / config.patch(baseHash) / plugins.list / plugins.setEnabled /
// skills.status / skills.update{skillKey,enabled} / models.authStatus / models.authLogout{provider,profileIds}。
// 规则：会让网关重启的改动一律事前拒绝（409 restart_required）；任何响应、日志、审计都不带密钥值；网关错误原文不透传。
import fs from "node:fs";
import crypto from "node:crypto";

const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const fail = (http, code, message, body) => Object.assign(new Error(message), { http, code, ...(body ? { body } : {}) });
const getPath = (o, keys) => keys.reduce((a, k) => (a != null && Object.hasOwn(a, k) ? a[k] : undefined), o);
const setPath = (o, keys, v) => { let a = o; for (const k of keys.slice(0, -1)) { if (!obj(a[k])) a[k] = {}; a = a[k]; } a[keys.at(-1)] = v; };
const ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const APPLY = { none: "immediate", hot: "reload", restart: "restart" };
const RANK = { immediate: 0, reload: 1, restart: 2 };
const stricter = (a, b) => ((RANK[b] ?? 2) > (RANK[a] ?? 2) ? b : a);
// 显示给用户的生效方式文案（前端可直接用）。文案遵守前端喵的禁用词规则。
export const APPLY_LABELS = { immediate: "保存即生效", reload: "网关热重载，不重启", restart: "要重启网关（控制台不保存）" };

// ---------- 共用：同源检查（server.mjs 在所有 /api 写请求入口统一调用，X-HS 之外再加一道） ----------
// 规则：Sec-Fetch-Site 只放行 same-origin / none；有 Origin 看 Origin；没有 Origin 看 Referer；两者都没有 = 非浏览器调用，只靠登录 Cookie + X-HS。
export function makeSameOrigin({ allowed = (process.env.HOSINO_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean) } = {}) {
  const deny = () => fail(403, "cross_origin", "拒绝跨站请求");
  return req => {
    const h = req?.headers || {};
    const site = h["sec-fetch-site"];
    if (site !== undefined && !["same-origin", "none"].includes(String(site).toLowerCase())) throw deny();
    const host = String(h["x-forwarded-host"] || h.host || "").toLowerCase();
    const ok = raw => { let o; try { o = new URL(String(raw)); } catch { return false; } if (!/^https?:$/.test(o.protocol)) return false; return allowed.includes(o.origin) || (host !== "" && o.host.toLowerCase() === host); };
    if (h.origin !== undefined) { if (!ok(h.origin)) throw deny(); return; }
    if (h.referer !== undefined) { if (!ok(h.referer)) throw deny(); return; }
  };
}

async function configSnapshot(call, what = "配置") {
  let r; try { r = await call("config.get", {}, 15000); } catch { throw fail(502, "upstream", `暂时读不到网关${what}`); }
  let cfg = r?.config || r?.parsed;
  if (!cfg && typeof r?.raw === "string") try { cfg = JSON.parse(r.raw); } catch {}
  if (!obj(cfg)) throw fail(502, "upstream", "网关没有返回有效配置");
  if (r.valid === false) throw fail(409, "config_invalid", "网关当前配置校验没通过，先修好再改");
  const hash = r.hash || r.baseHash;
  if (typeof hash !== "string" || !hash || hash.length > 512) throw fail(502, "upstream", "网关没有返回配置版本号");
  return { cfg, hash, pendingRestart: r.pendingRestart === true };
}
const quiet = quietLeftMs => { const left = Math.max(0, Number(quietLeftMs()) || 0); if (left > 0) throw fail(423, "quiet_window", "每天 21:55-22:10（新加坡时间）是静默窗口，暂停写操作，过后再试", { retryAfterMs: left }); };

// ---------- 2. 白名单单值配置 ----------
// apply = 按网关 2026.9.8 config-reload-plan 规则推出的本地基线；运行时再用 config.schema.lookup.reloadKind 和 reloadPlan 取更严的。
const THINK = ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive", "max", "ultra"];
export const CONFIG_FIELDS = [
  { path: "agents.defaults.thinkingDefault", label: "默认思考强度", group: "回复", type: "enum", enum: THINK, apply: "reload", effect: "新回合起生效" },
  { path: "agents.defaults.fastModeDefault", label: "默认快速模式", group: "回复", type: "boolean", apply: "reload", effect: "新回合起生效" },
  { path: "agents.defaults.silentReply.group", label: "群聊允许不出声", group: "回复", type: "enum", enum: ["allow", "disallow"], apply: "reload", effect: "新回合起生效" },
  { path: "agents.defaults.userTimezone", label: "用户时区", group: "回复", type: "timezone", apply: "reload", effect: "新回合起生效" },
  { path: "agents.defaults.heartbeat.every", label: "心跳间隔", group: "心跳", type: "duration", apply: "reload", effect: "会重启心跳和系统任务调度，不重启网关" },
  { path: "agents.defaults.heartbeat.timeoutSeconds", label: "心跳单次超时（秒）", group: "心跳", type: "integer", min: 10, max: 900, apply: "reload", effect: "会重启心跳和系统任务调度，不重启网关" },
  { path: "messages.groupChat.historyLimit", label: "群聊带入历史条数", group: "群聊", type: "integer", min: 0, max: 200, apply: "immediate", effect: "下一条群消息起生效" },
  { path: "messages.groupChat.visibleReplies", label: "群聊回复方式", group: "群聊", type: "enum", enum: ["automatic", "message_tool"], apply: "immediate", effect: "下一条群消息起生效" },
].map(f => ({ ...f, keys: f.path.split(".") }));
// 明确不放开的（写进 spec，前端可展示“为什么不能改”）
export const CONFIG_EXCLUDED = [
  { path: "agents.defaults.model / imageModel / models", reason: "默认模型、图像模型与备用模型在模型管理里维护" },
  { path: "messages.queue.*", reason: "群消息合并（collect）不在这里改" },
  { path: "session.dmScope", reason: "会改变会话归属，可能拆散现有会话" },
  { path: "tools.profile / tools.*", reason: "工具列表不精简" },
  { path: "channels.* / messages.inbound.* / tts.*", reason: "会让 QQ 渠道重连" },
  { path: "plugins.* / gateway.* / auth.* / secrets.*", reason: "插件、网关、凭据走各自的专门接口；gateway.* 需要重启" },
];
const fieldByPath = new Map(CONFIG_FIELDS.map(f => [f.path, f]));
function validTimezone(s) { if (typeof s !== "string" || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(s) || s.length > 64) return false; try { new Intl.DateTimeFormat("en", { timeZone: s }); return true; } catch { return false; } }
function checkValue(f, v, schema) {
  const bad = msg => fail(400, "invalid_value", `${f.label}：${msg}`, { path: f.path });
  switch (f.type) {
    case "boolean": if (typeof v !== "boolean") throw bad("只能是 true 或 false"); break;
    case "enum": if (!f.enum.includes(v)) throw bad("只能是 " + f.enum.join(" / ")); break;
    case "integer": if (!Number.isSafeInteger(v) || v < f.min || v > f.max) throw bad(`应为 ${f.min}–${f.max} 的整数`); break;
    case "timezone": if (!validTimezone(v)) throw bad("不是有效的 IANA 时区，例如 Asia/Singapore"); break;
    case "duration": if (typeof v !== "string" || !/^[1-9]\d{0,3}(?:s|m|h)$/.test(v)) throw bad("格式如 25m、1h、90s"); { const n = parseInt(v), u = v.at(-1), sec = n * (u === "h" ? 3600 : u === "m" ? 60 : 1); if (sec < 60 || sec > 86400) throw bad("范围 1 分钟到 24 小时"); } break;
    default: throw bad("类型未知");
  }
  // 网关 schema 有 enum 就再收紧一次（网关 config.patch 也会再校验一遍）
  const en = Array.isArray(schema?.enum) ? schema.enum : null;
  if (en && !en.includes(v)) throw bad("不在网关允许的取值里");
}

export function makeConfigFields({ call, reloadPlan, quietLeftMs = () => 0, onApplied = () => {} }) {
  if (typeof call !== "function" || typeof reloadPlan !== "function") throw new TypeError("call and reloadPlan are required");
  async function lookup(path) { try { const r = await call("config.schema.lookup", { path }, 8000); return obj(r) ? r : null; } catch { return null; } }
  async function describe(s) {
    const out = [];
    for (const f of CONFIG_FIELDS) {
      const lk = await lookup(f.path), live = APPLY[lk?.reloadKind] || null;
      const apply = live ? stricter(f.apply, live) : f.apply;
      const value = getPath(s.cfg, f.keys);
      out.push({ path: f.path, label: f.label, group: f.group, type: f.type, ...(f.enum ? { enum: [...f.enum] } : {}), ...(f.min != null ? { min: f.min, max: f.max } : {}),
        value: value === undefined ? null : value, isSet: value !== undefined, apply, applyLabel: APPLY_LABELS[apply], effect: f.effect, editable: apply !== "restart", _schema: lk?.schema });
    }
    return out;
  }
  const pub = ({ _schema, ...rest }) => rest;
  async function read() {
    const s = await configSnapshot(call);
    return { baseHash: s.hash, pendingRestart: s.pendingRestart, fields: (await describe(s)).map(pub), excluded: CONFIG_EXCLUDED, applyLabels: APPLY_LABELS };
  }
  async function plan(b) {
    if (!obj(b) || typeof b.baseHash !== "string" || !b.baseHash || b.baseHash.length > 512) throw fail(400, "bad_request", "需要 baseHash（先 GET /api/config-fields）");
    if (!Array.isArray(b.changes) || !b.changes.length || b.changes.length > CONFIG_FIELDS.length) throw fail(400, "bad_request", `需要 1–${CONFIG_FIELDS.length} 项改动`);
    const seen = new Set();
    for (const c of b.changes) {
      if (!obj(c) || typeof c.path !== "string" || !Object.hasOwn(c, "value")) throw fail(400, "bad_request", "改动格式应为 {path, value}");
      if (!fieldByPath.has(c.path)) throw fail(403, "not_whitelisted", "这一项不在控制台能改的白名单里", { blockedPaths: [/^[A-Za-z0-9_.-]{1,200}$/.test(c.path) ? c.path : "<invalid>"] });
      if (seen.has(c.path)) throw fail(400, "bad_request", "同一项不能改两次"); seen.add(c.path);
    }
    const s = await configSnapshot(call);
    if (b.baseHash !== s.hash) throw fail(409, "baseHash_mismatch", "配置在你载入后被改过了，请重新载入", { legacyCode: "stale" });
    const fields = new Map((await describe(s)).map(x => [x.path, x]));
    const next = clone(s.cfg), touched = [];
    for (const c of b.changes) {
      const f = fieldByPath.get(c.path), d = fields.get(c.path);
      checkValue(f, c.value, d?._schema);
      if (JSON.stringify(getPath(s.cfg, f.keys)) === JSON.stringify(c.value)) continue;
      setPath(next, f.keys, c.value); touched.push({ f, d, value: c.value });
    }
    let rp; try { rp = touched.length ? await reloadPlan(s.cfg, next) : { paths: [] }; } catch { throw fail(502, "upstream", "暂时确认不了这些改动的生效方式"); }
    const extra = (rp?.paths || []).filter(p => !touched.some(t => p.path === t.f.path || p.path.startsWith(t.f.path + ".")));
    if (extra.length) throw fail(409, "unexpected_paths", "改动波及了白名单以外的配置，控制台不保存", { blockedPaths: extra.map(x => x.path) });
    const diff = touched.map(({ f, d, value }) => {
      const rules = (rp?.paths || []).filter(p => p.path === f.path || p.path.startsWith(f.path + "."));
      let apply = d?.apply || f.apply; for (const r of rules) apply = stricter(apply, r.label || APPLY[r.kind] || "restart");
      return { path: f.path, label: f.label, before: d?.isSet ? d.value : null, after: value, apply, applyLabel: APPLY_LABELS[apply], effect: f.effect };
    });
    const apply = diff.reduce((a, x) => stricter(a, x.apply), "immediate");
    return { s, touched, diff, apply, restartRequired: apply === "restart" || rp?.restartRequired === true };
  }
  async function preview(b) {
    const p = await plan(b), left = Math.max(0, Number(quietLeftMs()) || 0);
    return { ok: true, dryRun: true, baseHash: p.s.hash, changed: p.diff.length > 0, diff: p.diff, apply: p.apply, applyLabel: APPLY_LABELS[p.apply], restartRequired: p.restartRequired,
      canApply: !p.restartRequired && left === 0, blockedWindow: left > 0, ...(left ? { retryAfterMs: left } : {}), pendingRestart: p.s.pendingRestart };
  }
  async function apply(b) {
    if (b?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    quiet(quietLeftMs);
    const p = await plan(b);
    if (p.restartRequired) throw fail(409, "restart_required", "这些改动要重启网关才能生效，控制台不保存。重启只有凛能批准。", { diff: p.diff, blockedPaths: p.diff.filter(x => x.apply === "restart").map(x => x.path) });
    if (!p.touched.length) return { ok: true, changed: false, baseHash: p.s.hash, diff: [], apply: "immediate" };
    const patch = {}; for (const t of p.touched) setPath(patch, t.f.keys, t.value);
    quiet(quietLeftMs);
    let r;
    try { r = await call("config.patch", { raw: JSON.stringify(patch), baseHash: p.s.hash, note: "hosino-console: config-fields " + p.touched.map(t => t.f.path).join(",") }, 30000); }
    catch (e) {
      if (/conflict|stale|basehash/i.test(String(e?.code || "")) || /hash|revision|stale|changed/i.test(String(e?.message || ""))) throw fail(409, "baseHash_mismatch", "配置刚被别处改过，请重新载入", { legacyCode: "stale" });
      if (/INVALID/i.test(String(e?.code || ""))) {
        // 尽量标到具体字段：网关报错里提到哪个改动的路径就用哪个；只改了一项就是那一项；否则给全部改动路径
        const paths = p.touched.map(t => t.f.path), said = String(e?.message || "") + " " + JSON.stringify(e?.details ?? e?.data ?? null);
        const hit = paths.find(x => said.includes(x)) ?? (paths.length === 1 ? paths[0] : null);
        throw fail(400, "gateway_rejected", "网关校验没通过，没有保存", { path: hit, paths });
      }
      throw fail(502, "upstream", "网关没确认保存成功，请重新载入核对");
    }
    if (!obj(r) || r.ok === false) throw fail(502, "upstream", "网关没确认保存成功，请重新载入核对");
    try { onApplied(); } catch {}
    const pendingRestart = p.s.pendingRestart || r.pendingRestart === true || r.requiresRestart === true || r.restart?.scheduled === true;
    return { ok: true, changed: true, baseHash: typeof r.hash === "string" ? r.hash : null, diff: p.diff, apply: p.apply, applyLabel: APPLY_LABELS[p.apply], pendingRestart,
      ...(pendingRestart ? { warning: "网关回报有配置在等重启生效，请找凛确认" } : {}) };
  }
  return { read, preview, apply };
}

// ---------- 4. 插件 / 技能启停 ----------
// 默认模型 openai/gpt-6-luna 走 openai 插件 + codex 运行时；记忆相关插件一律不动（mem0 / memory-core / memory-wiki）。
const EXTRA_PROTECT = [["codex", "默认模型（订阅）依赖的运行时"], ["memory-core", "记忆槽位相关，不动"], ["memory-wiki", "记忆相关，不动"]];
export function makePluginToggle({ call, reloadPlan, protectedPlugins = () => new Map(), quietLeftMs = () => 0, onChanged = () => {} }) {
  if (typeof call !== "function" || typeof reloadPlan !== "function") throw new TypeError("call and reloadPlan are required");
  function protection(cfg, id) {
    const m = protectedPlugins();
    if (m.has(id)) return String(m.get(id));
    for (const [pid, why] of EXTRA_PROTECT) if (pid === id) return why;
    const model = cfg?.agents?.defaults?.model; const ref = typeof model === "string" ? model : model?.primary;
    if (typeof ref === "string" && ref.split("/")[0] === id) return "默认模型 " + ref + " 的供应商插件";
    return null;
  }
  async function plan(b) {
    if (!obj(b) || typeof b.id !== "string" || !ID.test(b.id) || typeof b.enabled !== "boolean") throw fail(400, "bad_request", "需要 id 和 enabled(true/false)");
    const s = await configSnapshot(call);
    let list; try { list = await call("plugins.list", {}, 15000); } catch { throw fail(502, "upstream", "暂时读不到插件列表"); }
    const p = (Array.isArray(list?.plugins) ? list.plugins : []).find(x => x?.id === b.id);
    if (!p || p.installed === false) throw fail(404, "not_found", "没有安装这个插件");
    const why = protection(s.cfg, b.id);
    if (why) throw fail(403, "plugin_protected", "这个插件受保护，控制台不切换：" + why, { protectedReason: why });
    const current = getPath(s.cfg, ["plugins", "entries", b.id, "enabled"]) ?? p.enabled === true;
    const next = clone(s.cfg); setPath(next, ["plugins", "entries", b.id, "enabled"], b.enabled);
    let rp; try { rp = current === b.enabled ? { paths: [] } : await reloadPlan(s.cfg, next); } catch { throw fail(502, "upstream", "暂时确认不了生效方式"); }
    const apply = (rp?.paths || []).reduce((a, x) => stricter(a, x.label || APPLY[x.kind] || "restart"), current === b.enabled ? "immediate" : "reload");
    return { s, p, current: current === true, apply, rp };
  }
  const effects = "插件运行时会整体重载（不重启网关）；重载期间 QQ 可能短暂收不到回复";
  async function preview(b) {
    const x = await plan(b), left = Math.max(0, Number(quietLeftMs()) || 0);
    return { ok: true, dryRun: true, id: x.p.id, name: typeof x.p.name === "string" ? x.p.name.slice(0, 120) : x.p.id, baseHash: x.s.hash, enabledBefore: x.current, enabledAfter: b.enabled,
      changed: x.current !== b.enabled, apply: x.apply, applyLabel: APPLY_LABELS[x.apply], effects: x.current !== b.enabled ? effects : null,
      canApply: x.apply !== "restart" && left === 0, blockedWindow: left > 0, ...(left ? { retryAfterMs: left } : {}) };
  }
  async function setEnabled(b) {
    if (b?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    quiet(quietLeftMs);
    if (typeof b.baseHash !== "string" || !b.baseHash) throw fail(400, "bad_request", "需要预览时拿到的 baseHash");
    const x = await plan(b);
    if (b.baseHash !== x.s.hash) throw fail(409, "baseHash_mismatch", "配置在预览后被改过了，请重新预览", { legacyCode: "stale" });
    if (x.apply === "restart") throw fail(409, "restart_required", "这项改动要重启网关才能生效，控制台不保存。重启只有凛能批准。", { blockedPaths: (x.rp?.paths || []).filter(p => p.kind === "restart").map(p => p.path) });
    if (x.current === b.enabled) return { ok: true, changed: false, id: b.id, enabled: b.enabled, apply: "immediate" };
    quiet(quietLeftMs);
    let r;
    try { r = await call("plugins.setEnabled", { pluginId: b.id, enabled: b.enabled }, 60000); }
    catch (e) {
      const m = String(e?.message || "");
      if (/capabilit|consent|acknowledg/i.test(m)) throw fail(409, "capability_review_required", "启用这个插件需要先审核它申请的能力，控制台暂不代为确认");
      if (/lease|busy|in progress/i.test(m)) throw fail(409, "busy", "网关正在处理别的插件变更，稍后再试");
      throw fail(502, "upstream", "网关没确认插件启停成功，请刷新插件列表核对");
    }
    try { onChanged(); } catch {}
    const restartRequired = r?.restartRequired === true;
    return { ok: true, changed: true, id: b.id, enabled: b.enabled, apply: restartRequired ? "restart" : x.apply, restartRequired,
      ...(restartRequired ? { warning: "网关说这次变更要重启后才完全生效。控制台不会重启，请找凛决定" } : {}),
      ...(Array.isArray(r?.warnings) && r.warnings.length ? { warningCount: r.warnings.length } : {}) };
  }
  return { preview, setEnabled };
}

export function makeSkillToggle({ call, quietLeftMs = () => 0, onChanged = () => {} }) {
  // v2：和插件开关一样做并发保护 —— 预览拿 baseHash，保存时比对（配置被别处改过就 409 baseHash_mismatch）；控制台内同一时间只跑一个技能写入（409 busy）。
  let writing = false;
  async function find(b, extra = []) {
    if (!obj(b) || typeof b.skillKey !== "string" || !ID.test(b.skillKey) || typeof b.enabled !== "boolean") throw fail(400, "bad_request", "需要 skillKey 和 enabled(true/false)");
    for (const k of Object.keys(b)) if (!["skillKey", "enabled", ...extra].includes(k)) throw fail(400, "bad_request", "只接受 skillKey / enabled / baseHash / confirm（技能密钥和环境变量不在这里改）");
    let st; try { st = await call("skills.status", {}, 20000); } catch { throw fail(502, "upstream", "暂时读不到技能列表"); }
    const all = Array.isArray(st?.skills) ? st.skills : [];
    const sk = all.find(x => x?.skillKey === b.skillKey || x?.key === b.skillKey || x?.name === b.skillKey);
    if (!sk) throw fail(404, "not_found", "没有这个技能");
    const before = typeof sk.disabled === "boolean" ? !sk.disabled : typeof sk.enabled === "boolean" ? sk.enabled : null;
    return { sk, before };
  }
  async function preview(b) {
    const s = await configSnapshot(call); const { before } = await find(b);
    const left = Math.max(0, Number(quietLeftMs()) || 0);
    return { ok: true, dryRun: true, skillKey: b.skillKey, baseHash: s.hash, enabledBefore: before, enabledAfter: b.enabled, changed: before !== b.enabled,
      apply: "immediate", applyLabel: APPLY_LABELS.immediate, canApply: left === 0, blockedWindow: left > 0, ...(left ? { retryAfterMs: left } : {}) };
  }
  async function setEnabled(b) {
    if (b?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    await find(b, ["confirm", "baseHash"]);
    if (typeof b.baseHash !== "string" || !b.baseHash) throw fail(400, "bad_request", "需要预览时拿到的 baseHash（POST /api/skills/toggle/preview）");
    quiet(quietLeftMs);
    if (writing) throw fail(409, "busy", "另一个技能开关正在保存，请稍后再试");
    writing = true;
    try {
      const s = await configSnapshot(call);
      if (b.baseHash !== s.hash) throw fail(409, "baseHash_mismatch", "配置在预览后被改过了，请重新预览", { legacyCode: "stale" });
      quiet(quietLeftMs);
      try { await call("skills.update", { skillKey: b.skillKey, enabled: b.enabled }, 20000); }
      catch { throw fail(502, "upstream", "网关没确认技能开关保存成功，请刷新核对"); }
      try { onChanged(); } catch {}
      // skills.* 在网关重载规则里是 none：写入即生效，新回合读取
      return { ok: true, skillKey: b.skillKey, enabled: b.enabled, apply: "immediate", applyLabel: APPLY_LABELS.immediate };
    } finally { writing = false; }
  }
  return { preview, setEnabled };
}

// ---------- v2：功能开关（/api/features）、邮箱打码、密钥撞名 ----------
// 三个开关默认都关；凛拍板后在 systemd 环境里设 =1 即可，不用发前端。插件/技能开关后端也强制（关着就 403 feature_off）。
export const FEATURE_FLAGS = { pluginToggle: "HOSINO_FEATURE_PLUGIN_TOGGLE", skillToggle: "HOSINO_FEATURE_SKILL_TOGGLE", secretWrite: "HOSINO_FEATURE_SECRET_WRITE" };
export function featureFlags(env = process.env) {
  const on = v => /^(1|true|on|yes)$/i.test(String(v ?? "").trim());
  return Object.fromEntries(Object.entries(FEATURE_FLAGS).map(([k, e]) => [k, on(env?.[e])]));
}
const needFlag = (flags, k) => { if (flags()[k] !== true) throw fail(403, "feature_off", "这个功能还没开放（等凛拍板）", { feature: k }); };
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*\.([A-Za-z]{2,24})\b/g;
export const maskEmail = s => String(s).replace(EMAIL, (m, a, d, tld) => `${a}***@${d}***.${tld}`);
export function maskEmailsDeep(v) {
  if (typeof v === "string") return v.includes("@") ? maskEmail(v) : v;
  if (Array.isArray(v)) return v.map(maskEmailsDeep);
  if (obj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskEmailsDeep(x)]));
  return v;
}
// 和 env 文件里的密钥同名：网关密钥库里再建一条会"影子"盖住/混淆真正在用的那个，一律拒绝。
export const SHADOW_NAMES = ["FISH_API_KEY", "QIANFAN_API_KEY", "QIANFAN_AK", "QIANFAN_SK", "DEEPSEEK_API_KEY"];

// ---------- 5. 模型账号退出 ----------
// 只允许按 profileIds 精确退出：不传 profileIds 时网关会按供应商整体退出并中止该供应商正在跑的回合，控制台不开放这种用法。
// 带邮箱的 profileId 对外打码；前端用 profileRef（pref_…，进程内 HMAC）回传，后端解析回真实 id。
const REF_KEY = crypto.randomBytes(32);
export const profileRef = id => "pref_" + crypto.createHmac("sha256", REF_KEY).update(String(id)).digest("hex").slice(0, 24);
function resolveRef(st, x) {
  if (!/^pref_[a-f0-9]{24}$/.test(x)) return x;
  for (const row of Array.isArray(st?.providers) ? st.providers : []) for (const p of Array.isArray(row?.profiles) ? row.profiles : []) { const id = p?.profileId ?? p?.id; if (typeof id === "string" && profileRef(id) === x) return id; }
  return x;
}
export function decorateAuthStatus(st) {
  if (!obj(st)) return st;
  const out = clone(st);
  for (const row of Array.isArray(out.providers) ? out.providers : []) {
    for (const p of Array.isArray(row?.profiles) ? row.profiles : []) { const id = p?.profileId ?? p?.id; if (typeof id === "string") { p.profileRef = profileRef(id); p.profileIdMasked = id.includes("@"); } }
    if (Array.isArray(row?.profileOrder)) row.profileOrderRefs = row.profileOrder.map(id => (typeof id === "string" ? profileRef(id) : null));
  }
  return maskEmailsDeep(out);
}
export function makeAuthLogout({ call, readDefaultModel = async () => null, quietLeftMs = () => 0, onChanged = () => {} }) {
  async function plan(b) {
    if (!obj(b) || typeof b.provider !== "string" || !PROVIDER.test(b.provider)) throw fail(400, "bad_request", "供应商名称无效");
    if (!Array.isArray(b.profileIds) || !b.profileIds.length || b.profileIds.length > 20 || !b.profileIds.every(x => typeof x === "string" && x.trim() && x.length <= 256 && !/[\x00-\x1f]/.test(x))) throw fail(400, "bad_request", "需要明确列出要退出的 profileIds（1–20 个）");
    let st; try { st = await call("models.authStatus", {}, 20000); } catch { throw fail(502, "upstream", "暂时读不到模型账号状态"); }
    const ids = [...new Set(b.profileIds.map(x => resolveRef(st, x.trim())))];
    const row = (Array.isArray(st?.providers) ? st.providers : []).find(p => p?.provider === b.provider);
    if (!row) throw fail(404, "not_found", "没有这个供应商");
    const profiles = (Array.isArray(row.profiles) ? row.profiles : []).filter(p => typeof p?.profileId === "string");
    const missing = ids.filter(id => !profiles.some(p => p.profileId === id));
    if (missing.length) throw fail(400, "bad_request", "有账号不属于这个供应商", { unknownProfiles: missing.length });
    const unsupported = ids.filter(id => profiles.find(p => p.profileId === id)?.logoutSupported !== true);
    if (unsupported.length) throw fail(409, "logout_unsupported", "这些账号由外部 CLI 或配置管理，控制台不能退出", { profileIds: unsupported });
    const remaining = profiles.filter(p => !ids.includes(p.profileId) && !["expired", "missing", "error", "invalid"].includes(String(p.status || "").toLowerCase()));
    const dm = await readDefaultModel(); const defaultProvider = typeof dm === "string" ? dm.split("/")[0] : null;
    const affectsDefault = defaultProvider === b.provider;
    return { ids, row, remaining, affectsDefault, defaultModel: dm, leavesDefaultWithoutAccount: affectsDefault && remaining.length === 0 };
  }
  async function preview(b) {
    const x = await plan(b), left = Math.max(0, Number(quietLeftMs()) || 0);
    return { ok: true, dryRun: true, provider: b.provider, profileIds: x.ids, remainingProfiles: x.remaining.length, affectsDefault: x.affectsDefault, defaultModel: x.defaultModel,
      leavesDefaultWithoutAccount: x.leavesDefaultWithoutAccount, apply: "reload", applyLabel: APPLY_LABELS.reload,
      effects: "删除账号凭据；配置里引用这个账号的排序会一起清掉（auth.*，热重载）。不会中止正在跑的回合。",
      canApply: !x.leavesDefaultWithoutAccount && left === 0, blockedWindow: left > 0, ...(left ? { retryAfterMs: left } : {}) };
  }
  async function logout(b) {
    if (b?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    quiet(quietLeftMs);
    const x = await plan(b);
    if (x.leavesDefaultWithoutAccount) throw fail(409, "default_model_auth", `默认模型 ${x.defaultModel} 只剩这个账号，退出后 QQ 会没有模型可用。控制台不执行，请先找凛确认`, { defaultModel: x.defaultModel });
    quiet(quietLeftMs);
    let r; try { r = await call("models.authLogout", { provider: b.provider, profileIds: x.ids }, 30000); }
    catch { throw fail(502, "upstream", "网关没确认退出成功，请刷新模型账号状态核对"); }
    try { onChanged(); } catch {}
    const removed = Array.isArray(r?.removedProfiles) ? r.removedProfiles.filter(id => x.ids.includes(id)) : [];
    return { ok: true, provider: b.provider, removedProfiles: removed, apply: "reload", ...(r?.warning ? { warning: "账号已删除，但网关刷新凭据状态没确认，请刷新模型状态检查" } : {}) };
  }
  return { preview, logout };
}

// ---------- 3. 密钥存放位置（只给名字和有/无） ----------
// 网关 secret store 由 /api/secrets 管理。这里补充“控制台之外”的几处：控制台只读、不写，只报告有没有。
export function makeSecretSlots({ envFile = null, fishEnvFile = null, statFile = f => fs.statSync(f), readFile = f => fs.readFileSync(f, "utf8"), readCfg = () => ({}) } = {}) {
  const names = file => { try { return new Set(String(readFile(file)).split(/\r?\n/).map(l => /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*\S/.exec(l)?.[1]).filter(Boolean)); } catch { return null; } };
  const present = f => { try { const st = statFile(f); return st.isFile() && st.size > 0; } catch (e) { return e?.code === "ENOENT" ? false : null; } };
  return function slots() {
    const env = envFile ? names(envFile) : null; let cfg = {}; try { cfg = readCfg() || {}; } catch {}
    const ref = String(cfg?.plugins?.entries?.["openclaw-mem0"]?.config?.oss?.embedder?.config?.apiKey ?? "");
    const out = [
      { name: "FISH_API_KEY", label: "Fish 语音", storage: "fish-env-file", present: fishEnvFile ? present(fishEnvFile) : null, writable: false, usedBy: ["控制台语音试听", "workspace 语音脚本"], note: "存在独立文件里，不在网关密钥库；控制台对这个文件只读" },
      { name: "QIANFAN_API_KEY", label: "千帆（记忆 embedding）", storage: "openclaw-env-file", present: env ? env.has("QIANFAN_API_KEY") : null, writable: false, usedBy: /QIANFAN_API_KEY/.test(ref) ? ["openclaw-mem0 embedder"] : [], note: "记忆插件用；不碰 embedding 配置，这里只看有没有" },
      { name: "DEEPSEEK_API_KEY", label: "DeepSeek", storage: "openclaw-env-file", present: env ? env.has("DEEPSEEK_API_KEY") : null, writable: false, usedBy: [], note: "在 ~/.openclaw/.env；换 key 走模型管理" },
      { name: "xai", label: "Grok（xAI）", storage: "model-auth-profile", present: null, writable: true, writeVia: "POST /api/models/auth/login 或 /api/models/manage/credential", usedBy: ["xai 模型", "Grok 网页搜索"], note: "账号状态看 GET /api/models/auth" },
    ];
    return { slots: out, secretStore: { listVia: "GET /api/secrets", writeVia: "POST /api/secrets/set" } };
  };
}

// ---------- 路由注册（server.mjs 只加一行调用） ----------
export function registerFiveFeatureRoutes(R, d) {
  const { W, call, reloadPlan, pluginProtected, quietLeftMs, dropCache = () => {}, memSearch, readCfg, envFile, fishEnvFile, flags = () => featureFlags(), memUserName = () => null, now = Date.now } = d;
  // 同源检查在 server.mjs 请求入口统一做（所有写接口），这里不再逐个包。
  const guarded = W;
  const cfgFields = makeConfigFields({ call, reloadPlan, quietLeftMs, onApplied: () => dropCache("cfg", "ch", "models") });
  const plugins = makePluginToggle({ call, reloadPlan, protectedPlugins: pluginProtected, quietLeftMs, onChanged: () => dropCache("pl", "sk", "cfg") });
  const skills = makeSkillToggle({ call, quietLeftMs, onChanged: () => dropCache("sk", "cfg") });
  const readDefaultModel = async () => { try { const s = await configSnapshot(call); const m = s.cfg?.agents?.defaults?.model; return typeof m === "string" ? m : m?.primary ?? null; } catch { return null; } };
  const logout = makeAuthLogout({ call, readDefaultModel, quietLeftMs, onChanged: () => dropCache("mauth", "models", "cfg") });
  const slots = makeSecretSlots({ envFile, fishEnvFile, readCfg });
  const ms = () => (typeof memSearch === "function" ? memSearch() : memSearch);
  Object.assign(R, {
    "GET /api/console-features": async () => ({ version: "console-5features v2", flags: flags(), features: [
      { id: "memory-search", label: "记忆语义搜索", endpoints: ["GET /api/memory/status", "GET /api/memory/users", "POST /api/memory/search"] },
      { id: "config-fields", label: "配置编辑（白名单）", endpoints: ["GET /api/config-fields", "POST /api/config-fields/preview", "POST /api/config-fields/apply", "GET /api/allowlist", "POST /api/allowlist/preview", "POST /api/allowlist/apply"] },
      { id: "secrets", label: "密钥管理", endpoints: ["GET /api/secrets", "POST /api/secrets/set", "POST /api/secrets/clear", "GET /api/secrets/slots"] },
      { id: "plugins-skills", label: "插件与技能启停", endpoints: ["POST /api/plugins/toggle/preview", "POST /api/plugins/toggle", "POST /api/skills/toggle/preview", "POST /api/skills/toggle"], install: false },
      { id: "model-auth", label: "模型账号", endpoints: ["GET /api/models/auth", "POST /api/models/manage/credential", "POST /api/models/auth/login", "GET /api/models/auth/login/:id", "POST /api/models/auth/login/:id/answer", "POST /api/models/auth/login/:id/cancel", "POST /api/models/auth/order", "POST /api/models/auth/logout/preview", "POST /api/models/auth/logout"] },
    ], applyLabels: APPLY_LABELS }),
    "GET /api/memory/status": async () => ms().status(),
    "GET /api/config-fields": async () => cfgFields.read(),
    "POST /api/config-fields/preview": async (u, b) => cfgFields.preview(b),
    "POST /api/config-fields/apply": guarded("config.fields.apply", b => (Array.isArray(b.changes) ? b.changes.map(c => c?.path).join(",") : "").slice(0, 200), b => cfgFields.apply(b), { confirm: true }),
    "POST /api/plugins/toggle/preview": async (u, b) => plugins.preview(b),
    "POST /api/plugins/toggle": guarded("plugins.toggle", b => `${String(b.id || "").slice(0, 80)} ${b.enabled === true ? "on" : b.enabled === false ? "off" : "?"}`, b => { needFlag(flags, "pluginToggle"); return plugins.setEnabled(b); }, { confirm: true }),
    "POST /api/skills/toggle/preview": async (u, b) => skills.preview(b),
    "POST /api/skills/toggle": guarded("skills.toggle", b => `${String(b.skillKey || "").slice(0, 80)} ${b.enabled === true ? "on" : b.enabled === false ? "off" : "?"}`, b => { needFlag(flags, "skillToggle"); return skills.setEnabled(b); }, { confirm: true }),
    "POST /api/models/auth/logout/preview": async (u, b) => maskEmailsDeep(await logout.preview(b)),
    "POST /api/models/auth/logout": guarded("models.auth.logout", b => `${String(b.provider || "").slice(0, 64)} n=${Array.isArray(b.profileIds) ? b.profileIds.length : 0}`, async b => maskEmailsDeep(await logout.logout(b)), { confirm: true }),
    "GET /api/secrets/slots": async () => slots(),
  });
  // ---- v2：包一层现有路由（不改它们的实现） ----
  const wrap = (key, fn) => { const orig = R[key]; if (typeof orig === "function") R[key] = fn(orig); };
  // (1)(6) /api/features：三个功能开关 + 静默窗口
  wrap("GET /api/features", orig => async (...a) => {
    const left = Math.max(0, Number(quietLeftMs?.()) || 0);
    return { ...(await orig(...a)), ...flags(), quiet: left > 0, quietUntil: left > 0 ? new Date(now() + left).toISOString() : null, quietWindow: "21:55-22:10 Asia/Singapore" };
  });
  // (4) 模型账号：profileId / 标签里的邮箱打码，附 profileRef；order 接口也认 profileRef
  wrap("GET /api/models/auth", orig => async (...a) => decorateAuthStatus(await orig(...a)));
  wrap("POST /api/models/auth/order", orig => async (u, b, req) => {
    if (obj(b) && Array.isArray(b.profileIds) && b.profileIds.some(x => typeof x === "string" && x.startsWith("pref_"))) {
      let st; try { st = await call("models.authStatus", {}, 20000); } catch { throw fail(502, "upstream", "暂时读不到模型账号状态"); }
      b = { ...b, profileIds: b.profileIds.map(x => (typeof x === "string" ? resolveRef(st, x) : x)) };
    }
    return maskEmailsDeep(await orig(u, b, req));
  });
  // (7) 网关密钥库里不许建和 env 文件同名的条目
  wrap("POST /api/secrets/set", orig => async (u, b, req) => {
    const name = obj(b) && typeof b.name === "string" ? b.name.trim().toUpperCase() : "";
    if (SHADOW_NAMES.includes(name)) throw fail(409, "shadow_slot", `${name} 已经放在 env 文件里（见 GET /api/secrets/slots），密钥库里不能再建同名条目，免得两边对不上`, { name });
    return orig(u, b, req);
  });
  // (9) 记忆用户带名字
  wrap("GET /api/memory/users", orig => async (...a) => {
    const r = await orig(...a);
    if (!obj(r) || !Array.isArray(r.users)) return r;
    return { ...r, users: r.users.map(x => { let n = null; try { n = memUserName(x.user_id); } catch {} return { ...x, name: n?.name ?? null, subjectKey: n?.key ?? null }; }) };
  });
  // (5) 插件中心：启用/停用改走 /api/plugins/toggle，受 pluginToggle 控制
  const TOGGLE_VIA = "POST /api/plugins/toggle/preview → POST /api/plugins/toggle";
  const extraProtected = new Set(EXTRA_PROTECT.map(([id]) => id));
  const lifecycle = p => { const on = flags().pluginToggle === true && obj(p) && p.protected !== true && !extraProtected.has(p.id); if (obj(p?.capabilities)) { p.capabilities.enable = on && p.enabled !== true; p.capabilities.disable = on && p.enabled === true; p.capabilities.toggleVia = on ? TOGGLE_VIA : null; } return p; };
  wrap("GET /api/plugin-center", orig => async (...a) => {
    const r = await orig(...a); if (!obj(r)) return r;
    const on = flags().pluginToggle === true;
    return { ...r, plugins: Array.isArray(r.plugins) ? r.plugins.map(lifecycle) : r.plugins, capabilities: { ...(r.capabilities || {}), toggle: on, toggleVia: on ? TOGGLE_VIA : null } };
  });
  wrap("GET /api/plugin-center/detail", orig => async (...a) => { const r = await orig(...a); if (obj(r?.plugin)) { lifecycle(r.plugin); if (obj(r.capabilities)) r.capabilities = r.plugin.capabilities; } return r; });
  wrap("POST /api/plugin-center/plan", orig => async (...a) => {
    const r = await orig(...a), act = a[1]?.action;
    if (obj(r) && (act === "enable" || act === "disable") && flags().pluginToggle === true) return { ...r, blockedCode: "use_plugin_toggle", blockedReason: "启用/停用请用插件开关：" + TOGGLE_VIA, toggleVia: TOGGLE_VIA };
    return r;
  });
  return { cfgFields, plugins, skills, logout, slots };
}
