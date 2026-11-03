// Narrow editor for existing channel permission lists and tool allow/deny lists.
// The gateway remains the authority for config validation and atomic baseHash checks.
const own = (v, k) => v != null && Object.hasOwn(v, k);
const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const MAX_ITEMS = 1000, MAX_ITEM_LENGTH = 256;
const idOk = s => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s) && !["__proto__", "prototype", "constructor"].includes(s);
const get = (v, keys) => keys.reduce((o, k) => own(o, k) ? o[k] : undefined, v);
const set = (v, keys, value) => { let o = v; for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = value; };
const fail = (http, code, message, body) => Object.assign(new Error(message), { http, code, ...(body ? { body } : {}) });
const stale = () => fail(409, "baseHash_mismatch", "配置在你预览后被改过了，请重新载入", { legacyCode: "stale" });
const labels = { none: "immediate", hot: "reload", restart: "restart" };
const rank = { immediate: 0, reload: 1, restart: 2 };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validItem = v => typeof v === "string" ? v.length > 0 && v.length <= MAX_ITEM_LENGTH && v === v.trim() && !/[\s\u0000-\u001f\u007f]/u.test(v) : Number.isSafeInteger(v);

function candidates(cfg) {
  const out = [];
  const add = (keys, label) => { if (get(cfg, keys) !== undefined) out.push({ keys, path: keys.join("."), label }); };
  if (obj(cfg.channels)) for (const channel of Object.keys(cfg.channels).filter(idOk).sort()) {
    const ch = cfg.channels[channel]; if (!obj(ch)) continue;
    for (const field of ["allowFrom", "groupAllowFrom"]) add(["channels", channel, field], `${channel} · ${field === "allowFrom" ? "允许来源" : "群聊允许来源"}`);
    if (obj(ch.accounts)) for (const account of Object.keys(ch.accounts).filter(idOk).sort()) {
      for (const field of ["allowFrom", "groupAllowFrom"]) add(["channels", channel, "accounts", account, field], `${channel} / ${account} · ${field === "allowFrom" ? "允许来源" : "群聊允许来源"}`);
    }
  }
  add(["tools", "allow"], "工具允许列表");
  add(["tools", "deny"], "工具禁止列表");
  return out;
}

// Not every gateway version returns JSON schema in lookup; an absent schema is
// supported only for these registered paths and a compatible current value.
function itemTypes(lookup) {
  const s = lookup?.schema;
  if (!obj(s)) return null;
  if (s.type != null && s.type !== "array" && !(Array.isArray(s.type) && s.type.includes("array"))) return [];
  const i = s.items; if (!obj(i)) return null;
  const parts = i.anyOf || i.oneOf || [i], types = [];
  for (const p of parts) {
    const ts = Array.isArray(p?.type) ? p.type : p?.type ? [p.type] : [];
    types.push(...ts.filter(t => ["string", "integer", "number"].includes(t)));
  }
  return types.length ? [...new Set(types)] : (i.type || i.anyOf || i.oneOf) ? [] : null;
}

function describe(candidate, cfg, lookup) {
  const values = get(cfg, candidate.keys), types = itemTypes(lookup);
  if (!Array.isArray(values) || values.length > MAX_ITEMS || values.some(v => !validItem(v)) || types?.length === 0) return null;
  if (types && values.some(v => typeof v === "string" ? !types.includes("string") : !types.some(t => t === "integer" || t === "number"))) return null;
  const items = values.map(String);
  if (new Set(items).size !== items.length) return null; // number/string collisions cannot be edited losslessly.
  const integers = values.length ? values.every(Number.isSafeInteger) : types?.length && !types.includes("string");
  const mode = integers ? "integer" : values.some(Number.isSafeInteger) ? "mixed" : "string";
  const live = labels[lookup?.reloadKind];
  // Local gateway rules classify channels.* and tools.* as hot. Live rules may
  // require a restart, but cannot weaken that baseline.
  return { ...candidate, values, items, types, mode, apply: live === "restart" ? "restart" : "reload" };
}

function decodeItems(list, items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS || items.some(v => typeof v !== "string" || !validItem(v))) throw fail(400, "invalid_value", `列表应为最多 ${MAX_ITEMS} 个有效字符串`);
  if (new Set(items).size !== items.length) throw fail(400, "invalid_value", "列表不能有重复项");
  return items.map(s => {
    if (list.mode === "integer") {
      if (!/^-?(?:0|[1-9]\d*)$/.test(s) || !Number.isSafeInteger(Number(s)) || String(Number(s)) !== s) throw fail(400, "invalid_value", "这一列表只接受安全整数 ID");
      return Number(s);
    }
    const oldIndex = list.items.indexOf(s);
    if (oldIndex !== -1) return list.values[oldIndex];
    if (list.types && !list.types.includes("string")) throw fail(400, "invalid_value", "这一列表不接受字符串项");
    return s;
  });
}

/**
 * read() => {baseHash, lists:[{path,label,items:string[],apply,itemType}]}
 * preview/apply({baseHash,changes:[{path,items:string[]}],confirm?})
 * Inject the existing mmReloadPlan function so preview and apply share the
 * gateway/local reload policy. Integration should additionally wrap apply in W.
 */
export function makeAllowlist({ call, reloadPlan, quietLeftMs = () => 0, onApplied = () => {} }) {
  if (typeof call !== "function" || typeof reloadPlan !== "function") throw new TypeError("call and reloadPlan are required");
  async function snapshot() {
    let r; try { r = await call("config.get", {}, 15000); } catch { throw fail(502, "upstream", "暂时无法读取网关配置"); }
    let cfg = r?.config || r?.parsed;
    if (!cfg && typeof r?.raw === "string") try { cfg = JSON.parse(r.raw); } catch {}
    if (!obj(cfg)) throw fail(502, "upstream", "网关没有返回有效配置");
    if (r.valid === false) throw fail(409, "config_invalid", "网关当前配置校验未通过，暂时不能编辑白名单");
    const hash = r.hash || r.baseHash;
    if (typeof hash !== "string" || !hash || hash.length > 512) throw fail(502, "upstream", "网关未返回配置版本，暂时不能编辑白名单");
    const lists = [];
    for (const candidate of candidates(cfg)) {
      let lookup; try { lookup = await call("config.schema.lookup", { path: candidate.path }, 8000); } catch {}
      const list = describe(candidate, cfg, lookup); if (list) lists.push(list);
    }
    return { cfg, hash, lists, pendingRestart: r.pendingRestart === true };
  }
  const publicList = l => ({ path: l.path, label: l.label, items: [...l.items], apply: l.apply, itemType: l.mode });
  async function read() {
    const s = await snapshot();
    return { baseHash: s.hash, lists: s.lists.map(publicList), pendingRestart: s.pendingRestart };
  }
  async function plan(b) {
    if (!obj(b) || typeof b.baseHash !== "string" || !b.baseHash || b.baseHash.length > 512 || !Array.isArray(b.changes) || !b.changes.length || b.changes.length > 20) throw fail(400, "bad_request", "需要配置版本和 1–20 项改动");
    const s = await snapshot(); if (b.baseHash !== s.hash) throw stale();
    const byPath = new Map(s.lists.map(l => [l.path, l])), seen = new Set(), touched = [];
    for (const change of b.changes) {
      if (!obj(change) || typeof change.path !== "string") throw fail(400, "bad_request", "改动格式不对");
      const list = byPath.get(change.path);
      if (!list) throw fail(403, "not_whitelisted", "这一项不在控制台能修改的白名单范围", { blockedPaths: /^[A-Za-z0-9_.-]{1,300}$/.test(change.path) ? [change.path] : ["<invalid>"] });
      if (seen.has(change.path)) throw fail(400, "bad_request", "不能重复修改同一列表");
      seen.add(change.path);
      const values = decodeItems(list, change.items); if (!equal(values, list.values)) touched.push({ list, values });
    }
    const next = clone(s.cfg); for (const { list, values } of touched) set(next, list.keys, values);
    let reload;
    try { reload = await reloadPlan(s.cfg, next); } catch { throw fail(502, "upstream", "暂时无法确认配置生效方式"); }
    const diff = touched.map(({ list, values }) => {
      const rule = reload?.paths?.find(x => x.path === list.path);
      const live = labels[rule?.kind] || rule?.label;
      const apply = rank[live] > rank[list.apply] ? live : list.apply;
      return { path: list.path, before: [...list.items], after: values.map(String), apply };
    });
    const apply = diff.some(x => x.apply === "restart") || reload?.restartRequired === true ? "restart" : diff.length ? "reload" : "immediate";
    return { ...s, touched, diff, apply };
  }
  async function preview(b) {
    const p = await plan(b), retryAfterMs = Math.max(0, Number(quietLeftMs()) || 0);
    return { ok: true, dryRun: true, baseHash: p.hash, diff: p.diff, apply: p.apply, blockedWindow: retryAfterMs > 0, ...(retryAfterMs ? { retryAfterMs } : {}), pendingRestart: p.pendingRestart };
  }
  async function apply(b) {
    if (b?.confirm !== true) throw fail(400, "confirm_required", "需要 confirm:true 确认");
    const guardWindow = () => {
      const retryAfterMs = Math.max(0, Number(quietLeftMs()) || 0);
      if (retryAfterMs > 0) throw fail(423, "quiet_window", "静默窗口内暂停保存，过后再试", { retryAfterMs });
    };
    guardWindow();
    const p = await plan(b);
    if (p.apply === "restart") throw fail(409, "restart_required", "这些改动需要重启网关，控制台没有保存", { diff: p.diff, blockedPaths: p.diff.filter(x => x.apply === "restart").map(x => x.path) });
    if (!p.touched.length) return { ok: true, changed: false, baseHash: p.hash, diff: [], apply: "immediate", pendingRestart: p.pendingRestart };
    const patch = {}; for (const { list, values } of p.touched) set(patch, list.keys, values);
    guardWindow(); // Config/schema reads may have crossed into the quiet window.
    let r;
    try { r = await call("config.patch", { raw: JSON.stringify(patch), baseHash: p.hash, replacePaths: p.touched.map(x => x.list.path), note: "hosino-console: permission lists" }, 30000); }
    catch (e) { if (/hash|revision|stale|changed/i.test(String(e?.message || "")) || /conflict|stale|basehash/i.test(String(e?.code || ""))) throw stale(); throw fail(502, "upstream", "网关拒绝了白名单改动，没有确认保存成功"); }
    if (!obj(r) || r.ok === false) throw fail(502, "upstream", "网关未确认白名单保存成功，请重新载入核对");
    try { await onApplied(); } catch {} // A cache invalidation failure must not hide a successful config write.
    const pendingRestart = p.pendingRestart || r?.pendingRestart === true || r?.requiresRestart === true || r?.restart?.required === true || r?.restart?.scheduled === true || r?.restart?.kind === "restart";
    return { ok: true, changed: true, diff: p.diff, apply: p.apply, pendingRestart, ...(pendingRestart ? { warning: "网关回报有配置待重启生效，请联系凛检查" } : {}) };
  }
  return { read, preview, apply };
}
