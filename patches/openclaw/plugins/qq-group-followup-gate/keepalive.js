// QQ group prompt-cache keepalive + lurk sticker (qq-group-followup-gate v2.4.2, 2026-10-10)
//
// Mechanism (supported SDK only, no dist patch):
//   * A plugin timer calls api.runtime.system.runHeartbeatOnce({ sessionKey: <group session>,
//     heartbeat: { target: "last" } }). The heartbeat turn runs IN the group session (same Codex
//     thread binding, same system prompt / tool catalog as a real owner turn) and appends one tiny
//     user turn at the end, so the provider prompt cache for that prefix is refreshed.
//   * target "last" resolves to the group's own route, so the turn has chat_type=group and the
//     normal group surface (a target "none" heartbeat would get a restricted, message-tool-only
//     transient thread and never touch the group cache).
//   * Invisible: channels.qqbot.heartbeatVisibility {showOk:false, showAlerts:false} makes the
//     heartbeat runner drop every outward payload ("alerts-disabled") and restore updatedAt;
//     before_tool_call blocks all tools in the beat; before_message_write keeps the beat's
//     user anchor / NO_REPLY terminal durably stored with display:false; mem0 skips
//     heartbeat triggers by itself; the group hint is not added to heartbeat turns.
//   * Real messages win: core preempts an active heartbeat when a real inbound turn arrives
//     (preemptAndDrainEmbeddedHeartbeatRun) and the runner skips beats while runs are in flight.
//     On top of that we never beat if the group had real activity within quietMin.
//   * Heartbeat turns run as the owner (heartbeat sender = first qqbot allowFrom entry). Before
//     2026-10-07 owner and non-owner group turns got different tool catalogs => different Codex
//     threads, so a beat after a NON-owner turn would start a fresh thread (expensive, evicts the
//     binding); that is why the code default is requireOwnerLastTurn:true (beat only when the last
//     real turn was owner-class).
//     Since 2026-10-07 (QQ-GROUP-UNIFIED-TOOLS-PATCH v1, PATCHES.md A12) non-owner turns in the
//     groups listed in qq-group-owner-guard config.unifiedTools.groups advertise the owner's exact
//     catalog (same thread), and openclaw.json sets keepalive.requireOwnerLastTurn:false: keepalive
//     now beats regardless of whether the last real turn was the owner's. If A12 is disabled or
//     rolled back (its ROLLBACK.sh does this), or a keepalive group is not in unifiedTools.groups,
//     set requireOwnerLastTurn back to true; the circuit breaker below is the safety net.
//   * Circuit breaker: llm_output usage of every beat is logged; a beat with a low cached ratio
//     (thread rotated / prefix mismatch) pauses keepalive for that group (breakerCooldownMin).
//
// Lurk sticker: only after a beat that actually ran (status "ran"), group quiet >= minQuietMin,
// outside the night window, <= dailyCap per group per local day, never twice in a row (needs real
// group activity in between), with `probability`. Sent media-only through the qqbot outbound
// adapter -> qqbot sendMedia -> gateway sendMedia (same path as tagged stickers: upload cache), using
// the same 512px cache file naming/ffmpeg settings as QQ-MEDIA-TAG-PATCH.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";

const KA_DEFAULTS = {
  enabled: false,
  mode: "live", // "live" | "log-only"
  agentId: "main",
  groups: [],
  beatAfterMin: 25,
  quietMin: 20,
  maxIdleMin: 29,
  maxQuietMin: 0,
  checkEveryMs: 60_000,
  startupDelayMs: 60_000,
  requireOwnerLastTurn: true,
  hideFromTranscript: true,
  minCachedRatio: 0.5,
  breakerCooldownMin: 360,
  timeoutMs: 30_000,
  maxConsecutiveFailures: 2,
};
const LS_DEFAULTS = {
  enabled: false,
  dryRun: false,
  key: "潜水",
  probability: 0.1,
  minQuietMin: 25,
  nightStart: "00:00",
  nightEnd: "08:00",
  timeZone: "Asia/Singapore",
  dailyCap: 3,
  noConsecutive: true,
  hideFromMenu: true,
  accountId: "default",
};
const HB_POLL_TEXT = "[OpenClaw heartbeat poll]";
const CACHE_KEEPALIVE_SOURCE = "qq-group-cache-keepalive";
const DEFAULT_OWNER = "__HS_OWNER_OPENID__";

function num(v, d, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
}
export function resolveKeepaliveConfig(raw) {
  const c = { ...KA_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  c.enabled = c.enabled === true;
  c.mode = c.mode === "log-only" ? "log-only" : "live";
  c.groups = (Array.isArray(c.groups) ? c.groups : []).map((g) => String(g).trim().toUpperCase()).filter((g) => /^[0-9A-F]{32}$/.test(g));
  c.beatAfterMin = num(c.beatAfterMin, 25, 1, 59);
  c.quietMin = num(c.quietMin, 20, 0, 59);
  c.maxIdleMin = num(c.maxIdleMin, 29, c.beatAfterMin, 120);
  c.maxQuietMin = num(c.maxQuietMin, 0, 0, 7 * 24 * 60);
  c.checkEveryMs = num(c.checkEveryMs, 60_000, 10_000, 600_000);
  c.startupDelayMs = num(c.startupDelayMs, 60_000, 0, 3_600_000);
  c.minCachedRatio = num(c.minCachedRatio, 0.5, 0, 1);
  c.breakerCooldownMin = num(c.breakerCooldownMin, 360, 0, 7 * 24 * 60);
  c.timeoutMs = num(c.timeoutMs, 30_000, 1_000, 120_000);
  c.maxConsecutiveFailures = Math.floor(num(c.maxConsecutiveFailures, 2, 1, 10));
  c.requireOwnerLastTurn = c.requireOwnerLastTurn !== false;
  c.hideFromTranscript = c.hideFromTranscript !== false;
  return c;
}
// QQ-LURK-SCOPE v1: only explicit string IDs; malformed/inherited scope never widens.
function lurkGroupIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((g) => typeof g === "string").map((g) => g.trim().toUpperCase()).filter((g) => /^[0-9A-F]{32}$/.test(g)))] : [];
}
export function resolveLurkConfig(raw) {
  const c = { ...LS_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (raw && typeof raw === "object" && "groups" in raw) c.groups = lurkGroupIds(Object.prototype.hasOwnProperty.call(raw, "groups") ? raw.groups : []);
  c.enabled = c.enabled === true;
  c.dryRun = c.dryRun === true;
  c.key = String(c.key || "潜水").trim();
  c.probability = num(c.probability, 0.1, 0, 1);
  c.minQuietMin = num(c.minQuietMin, 25, 0, 24 * 60);
  c.dailyCap = Math.floor(num(c.dailyCap, 3, 0, 100));
  const hm = (s, d) => (/^\d{1,2}:\d{2}$/.test(String(s)) ? String(s).padStart(5, "0") : d);
  c.nightStart = hm(c.nightStart, "00:00");
  c.nightEnd = hm(c.nightEnd, "08:00");
  try { new Intl.DateTimeFormat("en-GB", { timeZone: c.timeZone }); } catch { c.timeZone = "Asia/Singapore"; }
  c.noConsecutive = c.noConsecutive !== false;
  c.hideFromMenu = c.hideFromMenu !== false;
  return c;
}

export function localClock(tz, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}
export function inWindow(hm, start, end) {
  if (start === end) return false;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}

function stateDir() {
  return process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || os.homedir() || "__HS_USER_HOME__", ".openclaw");
}
const normId = (id) => String(id || "").replace(/^qqbot:/i, "").replace(/^(id|user|channel:qqbot):/i, "").trim().toUpperCase();
let ownerCache = { at: 0, set: new Set([DEFAULT_OWNER]) };
function ownerIds() {
  if (Date.now() - ownerCache.at < 60_000) return ownerCache.set;
  const set = new Set([DEFAULT_OWNER]);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(stateDir(), "openclaw.json"), "utf8"));
    for (const id of cfg?.commands?.ownerAllowFrom ?? []) set.add(normId(id));
  } catch { /* defaults */ }
  ownerCache = { at: Date.now(), set };
  return set;
}
export const isOwnerId = (id) => !!id && ownerIds().has(normId(id));
const gidOf = (sk) => (String(sk || "").match(/:qqbot:group:([0-9a-f]{32})$/i)?.[1] || "").toUpperCase();
const msgText = (m) => {
  const c = m?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x?.type === "text" ? x.text || "" : "")).join("");
  return "";
};
const isSilentText = (t) => /^\s*(NO_REPLY|HEARTBEAT_OK)?\s*$/i.test(String(t || ""));

// ---- sticker helpers (mirror QQ-MEDIA-TAG-PATCH naming + ffmpeg settings) ----
function stickerEntries(dir, key) {
  const out = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".") || !/\.(png|jpe?g|gif|webp)$/i.test(name)) continue;
      if (name.replace(/\.[^.]+$/, "").split("-")[0].trim() !== key) continue;
      const file = path.join(dir, name);
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (st.isFile()) out.push({ name, file, size: st.size, mtimeMs: st.mtimeMs });
    }
  } catch { /* none */ }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
export function stickerCacheTarget(ent, side) {
  const stem = ent.name.replace(/\.[^.]+$/, "");
  return path.join(stateDir(), "media", "qq-sticker-cache", `${stem}.${ent.size}.${Math.floor(ent.mtimeMs)}.${side}.png`);
}
const cacheable = (ent, side) => side > 0 && /\.(png|jpe?g)$/i.test(ent.name) && ent.size > 700 * 1024;
function ensureStickerCache(ent, side) {
  return new Promise((resolve) => {
    if (!cacheable(ent, side)) return resolve(ent.file);
    const out = stickerCacheTarget(ent, side);
    try { if (fs.statSync(out).size > 0) return resolve(out); } catch { /* build */ }
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); } catch { /* ignore */ }
    const tmp = out + ".tmp.png";
    execFile("nice", ["-n", "10", "ffmpeg", "-y", "-v", "error", "-i", ent.file, "-vf",
      `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, "-compression_level", "9", tmp],
    { timeout: 60_000 }, (err) => {
      try { if (!err && fs.existsSync(tmp)) { fs.renameSync(tmp, out); return resolve(out); } fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      resolve(ent.file);
    });
  });
}
function mediaTagsCfg() {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(stateDir(), "openclaw.json"), "utf8"));
    const mt = all?.channels?.qqbot?.mediaTags ?? {};
    const ws = mt.workspace || all?.agents?.defaults?.workspace || path.join(stateDir(), "workspace");
    return { stickerDir: mt.stickerDir || path.join(ws, "stickers"), side: Math.floor(Number(mt.stickerMaxSide ?? 512)) || 0 };
  } catch {
    return { stickerDir: path.join(stateDir(), "workspace", "stickers"), side: 512 };
  }
}

// ---- engine ----
/* HOSINO-OUTCOME v1: 潜水表情的发送结果写进共享的 media-tag 状态（和 qqbot 扩展同一个对象/同一个文件） */
function mtNote(gid, rec) {
  try {
    const sh = globalThis[Symbol.for("openclaw.qqMediaTags.v1")]; if (!sh || !sh.groups) return;
    const key = String(gid || "").toUpperCase(); if (!key) return;
    const g = (sh.groups[key] ||= { replies: 0, lastStickerReply: null, lastVoiceReply: null, lastStickerFile: "", lastStickerKey: "", updatedAt: 0 });
    g.lastMedia = { kind: rec.kind, status: rec.status, file: path.basename(String(rec.file || "")).slice(0, 80), reason: String(rec.reason || "").slice(0, 80), at: Date.now(), turn: Number(g.replies) || 0 }; g.updatedAt = Date.now();
    if (sh.timer || !sh.file) return;
    sh.timer = setTimeout(() => { sh.timer = null; try { fs.mkdirSync(path.dirname(sh.file), { recursive: true }); const tmp = sh.file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify({ v: 1, groups: sh.groups }, null, 1)); fs.renameSync(tmp, sh.file); } catch { /* best effort */ } }, 1500);
    sh.timer.unref?.();
  } catch { /* best effort */ }
}
export function createKeepalive(api, log, ka, ls, deps = {}) {
  const now = deps.now || (() => Date.now());
  const random = deps.random || Math.random;
  const STATE_FILE = deps.stateFile || path.join(stateDir(), "qqbot", "group-keepalive-state.json");
  let state = { v: 1, groups: {} };
  try { const j = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); if (j && typeof j.groups === "object") state = j; } catch { /* fresh */ }
  let saveTimer = null;
  const save = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE + ".tmp", JSON.stringify(state, null, 1));
        fs.renameSync(STATE_FILE + ".tmp", STATE_FILE);
      } catch (e) { log(`keepalive: state save failed: ${e?.message || e}`); }
    }, deps.saveDelayMs ?? 1000);
    saveTimer.unref?.();
  };
  const groups = new Set(ka.groups);
  const suppliedLurkScope = ls && typeof ls === "object" && "groups" in ls;
  const lurkGroups = new Set((suppliedLurkScope ? lurkGroupIds(Object.prototype.hasOwnProperty.call(ls, "groups") ? ls.groups : []) : [...groups]).filter((gid) => groups.has(gid)));
  const g = (gid) => {
    if (!state.groups[gid]) state.groups[gid] = {};
    const s = state.groups[gid];
    s.stickers ||= { day: "", count: 0 };
    return s;
  };
  const sessionKeyFor = (gid) => `agent:${ka.agentId}:qqbot:group:${gid.toLowerCase()}`;
  const beatActive = new Map(); // sessionKey -> { until, gid, startedAt }
  // QQ-CACHE-OWNED-PRODUCER v1: this token is provenance, never tool authority.
  // It survives the core's whitelist normalization in inputProvenance.runId.
  const producerLeases = new Map(); // private nonce -> exact scheduler lease
  const newProducerNonce = deps.createInvocationId || (() => randomBytes(24).toString("hex"));
  const ownedHash = (domain, value) => createHash("sha256").update("qq-cache-owned:v1:" + domain + "\0" + value).digest("hex");
  const safeModelRef = (value) => typeof value === "string" && /^[A-Za-z0-9_./:+-]{1,120}$/.test(value) ? value : null;
  function ownedMetadata(beat) {
    return { invocationHash: ownedHash("invocation", beat.nonce), hostRunHash: beat.hostRunId ? ownedHash("host-run", beat.hostRunId) : null };
  }
  function emitOwned(phase, beat, extra = {}) {
    try {
    if (!beat?.nonce) return;
    if (phase === "terminal") { if (beat.terminalLogged) return; beat.terminalLogged = true; }
    else if ((beat.traceEvents || 0) >= 12) {
      if (!beat.traceTruncated) { beat.traceTruncated = true; log("[qq-cache-keepalive-owned] " + JSON.stringify({ schema: "qq-cache-owned-v1", phase: "trace-truncated", group: beat.gid.slice(0, 6), at: now(), ...ownedMetadata(beat), limit: 12 })); }
      return;
    } else beat.traceEvents = (beat.traceEvents || 0) + 1;
    log("[qq-cache-keepalive-owned] " + JSON.stringify({ schema: "qq-cache-owned-v1", phase, group: beat.gid.slice(0, 6), at: now(), ...ownedMetadata(beat), ...extra }));
    } catch { /* diagnostics never change cache admission or accounting */ }
  }
  function pruneProducerLeases() {
    for (const [nonce, beat] of producerLeases) if (beat.until <= now() || beatActive.get(sessionKeyFor(beat.gid)) !== beat) producerLeases.delete(nonce);
  }
  function prepareHeartbeatProvenance(opts, provenance) {
    pruneProducerLeases();
    const sk = String(opts?.sessionKey || "");
    const gid = gidOf(sk);
    const beat = beatActive.get(sk);
    if (!gid || !groups.has(gid) || sk !== sessionKeyFor(gid) || opts?.reason !== CACHE_KEEPALIVE_SOURCE || opts?.agentId !== ka.agentId || !beat || beat.gid !== gid || beat.settled || beat.preempted || beat.until <= now() || beat.controller?.signal.aborted || opts?.abortSignal !== beat.controller?.signal || provenance?.kind !== "internal_system") return;
    if (!beat.nonce) {
      const nonce = newProducerNonce();
      if (typeof nonce !== "string" || !/^[a-f0-9]{48}$/.test(nonce) || producerLeases.has(nonce)) throw new Error("QQ cache keepalive invocation nonce unavailable");
      beat.nonce = nonce;
      producerLeases.set(nonce, beat);
    }
    emitOwned("provenance", beat);
    return { ...provenance, sourceTool: CACHE_KEEPALIVE_SOURCE, runId: beat.nonce };
  }
  function ownedBeatTurn(ctx, event) {
    pruneProducerLeases();
    const sk = String(ctx?.sessionKey || event?.sessionKey || "");
    const gid = gidOf(sk);
    if (!gid || !groups.has(gid) || sk !== sessionKeyFor(gid) || (event?.sessionKey && String(event.sessionKey) !== sk) || (ctx?.trigger && ctx.trigger !== "heartbeat")) return;
    const runId = ctx?.runId ?? event?.runId;
    if (typeof runId !== "string" || !runId.trim() || runId.length > 512 || (ctx?.runId && event?.runId && ctx.runId !== event.runId)) return;
    const provenance = ctx?.inputProvenance ?? event?.inputProvenance;
    let beat;
    if (provenance !== undefined) {
      if (provenance?.kind !== "internal_system" || provenance.sourceTool !== CACHE_KEEPALIVE_SOURCE || typeof provenance.runId !== "string") return;
      beat = producerLeases.get(provenance.runId);
    } else {
      // Some tool hooks contain only trusted host runId; never bind from this fallback.
      const active = beatActive.get(sk);
      if (active?.hostRunId === runId) beat = active;
    }
    if (!beat || beat.gid !== gid || beatActive.get(sk) !== beat || beat.until <= now() || beat.preempted || beat.controller?.signal.aborted) return;
    if (beat.hostRunId && beat.hostRunId !== runId) return;
    if (!beat.hostRunId) { beat.hostRunId = runId; emitOwned("host-bound", beat); }
    return beat;
  }
  const isBeat = (sk) => { const b = beatActive.get(sk); return !!b && ((!b.settled && !!b.controller) || b.until > now()); };
  const pendingSender = new Map(); // gid -> owner? of last dispatched real message
  const once = new Map();
  const logOnce = (k, m) => { if (once.has(k)) return; once.set(k, m); log(m); }; // once per state change (cleared on real turns / beats)
  const min = (ms) => (ms / 60_000).toFixed(1);

  // ---- observers (wired from index.js) ----
  function onRealDispatch(event, ctx) {
    const sk = String(event?.sessionKey || ctx?.sessionKey || "");
    const gid = gidOf(sk);
    if (!gid || !groups.has(gid) || sk !== sessionKeyFor(gid)) return;
    const s = g(gid);
    s.lastRealAt = now();
    s.lurkSinceActivity = false;
    // A real message always wins: from now on this session's turns are not treated as a beat
    // (core preempts the running heartbeat; tools/transcript of the real turn are untouched).
    const activeBeat = beatActive.get(sessionKeyFor(gid));
    if (activeBeat && !activeBeat.settled) { activeBeat.preempted = true; activeBeat.controller?.abort("qq-keepalive-real-message"); }
    else beatActive.delete(sessionKeyFor(gid));
    const sid = event?.senderId ?? event?.from ?? event?.sender?.id ?? event?.metadata?.senderId ?? ctx?.senderId;
    if (sid) pendingSender.set(gid, isOwnerId(sid));
    save();
  }
  function onAgentEnd(_event, ctx) {
    const sk = String(ctx?.sessionKey || "");
    const gid = gidOf(sk);
    if (!gid || !groups.has(gid) || sk !== sessionKeyFor(gid)) return;
    if (ctx?.trigger === "heartbeat" || (!ctx?.trigger && isBeat(sk))) return;
    if (ctx?.trigger && ctx.trigger !== "user") return;
    const s = g(gid);
    s.lastCacheUseAt = now();
    s.lastRealAt = Math.max(Number(s.lastRealAt) || 0, now() - 1);
    const owner = ctx?.senderId ? isOwnerId(ctx.senderId) : pendingSender.get(gid);
    if (typeof owner === "boolean") s.lastRealOwner = owner;
    once.clear();
    save();
  }
  function onLlmOutput(event, ctx) {
    const sk = String(ctx?.sessionKey || event?.sessionKey || "");
    const gid = gidOf(sk);
    if (!gid || !groups.has(gid) || sk !== sessionKeyFor(gid)) return;
    const u = event?.usage || {};
    const cached = Number(u.cacheRead ?? u.cachedInputTokens ?? u.cached_input_tokens ?? u.cache_read_input_tokens ?? NaN);
    const input = Number(u.input ?? u.inputTokens ?? u.input_tokens ?? NaN);
    const beat = ownedBeatTurn(ctx, event);
    let ratio = null;
    if (Number.isFinite(cached) && Number.isFinite(input)) {
      // OpenClaw usage: `input` excludes cache reads; provider-native shapes include them.
      const total = u.cacheRead !== undefined ? input + cached : Math.max(input, cached);
      ratio = total > 0 ? cached / total : null;
    }
    const usageStr = JSON.stringify(u).slice(0, 300);
    if (!beat) {
      log(`cache usage ${ctx?.trigger === "heartbeat" ? "other-heartbeat" : "real-turn"} group=${gid.slice(0, 6)} ratio=${ratio == null ? "?" : ratio.toFixed(3)} usage=${usageStr}`);
      return;
    }
    const s = g(gid);
    s.lastBeatUsage = { at: now(), ratio, usage: u };
    emitOwned("usage", beat, { provider: safeModelRef(event?.provider ?? ctx?.modelProviderId), model: safeModelRef(event?.model ?? ctx?.modelId), input: Number.isFinite(input) && input >= 0 ? input : null, cacheRead: Number.isFinite(cached) && cached >= 0 ? cached : null, ratio, usageShape: Number.isFinite(input) && Number.isFinite(cached) ? (u.cacheRead !== undefined ? "openclaw-normalized" : "provider-native-alias") : "unknown" });
    log(`keepalive beat usage group=${gid.slice(0, 6)} cachedRatio=${ratio == null ? "?" : ratio.toFixed(3)} usage=${usageStr}`);
    if (ratio != null && ratio < ka.minCachedRatio) {
      s.breakerUntil = now() + ka.breakerCooldownMin * 60_000;
      s.breakerReason = "low-cache-ratio";
      s.breakerInvocationHash = ownedMetadata(beat).invocationHash;
      s.breakerThreshold = ka.minCachedRatio;
      emitOwned("breaker", beat, { reason: "low-cache-ratio", ratio, threshold: ka.minCachedRatio, cooldownMin: ka.breakerCooldownMin, breakerUntil: s.breakerUntil });
      log(`keepalive WARN group=${gid.slice(0, 6)} beat cached ratio ${ratio.toFixed(3)} < ${ka.minCachedRatio}: prefix not reused (thread rotated?). Pausing keepalive for ${ka.breakerCooldownMin} min.`);
    }
    save();
  }
  function beforeToolCall(event, ctx) {
    const sk = String(ctx?.sessionKey || "");
    if (ctx?.trigger !== "heartbeat") return;
    if (!ownedBeatTurn(ctx, event)) return;
    log(`keepalive: blocked tool ${event?.toolName || event?.name || "?"} in beat group=${gidOf(sk)?.slice(0, 6) || "unknown"}`);
    return { block: true, blockReason: "cache keepalive turn: tools disabled" };
  }
  function beforeMessageWrite(event, ctx) {
    if (!ka.hideFromTranscript) return;
    const sk = String(ctx?.sessionKey || "");
    // Core before-message-write context has no trigger; producer provenance supplies it.
    if ((ctx?.trigger && ctx.trigger !== "heartbeat") || !isBeat(sk)) return;
    const m = event?.message;
    if (!m) return;
    const t = msgText(m);
    // Keep the core's durable user anchor and terminal message; hide only their display.
    // Trust core internal_system provenance plus the active internal invocation, never body text alone.
    if (m.role === "user" && m.provenance?.kind === "internal_system" && (t.trim() === HB_POLL_TEXT || t.includes("Cache keepalive only"))) return { message: { ...m, display: false } };
    if (m.role === "assistant") {
      const c = Array.isArray(m.content) ? m.content : [];
      const onlyText = c.every((x) => typeof x === "string" || x?.type === "text" || x?.type === "thinking" || x?.type === "reasoning");
      if (onlyText && isSilentText(t)) return { message: { ...m, display: false } };
    }
  }
  const isBeatTurn = (ctx) => ctx?.trigger === "heartbeat" && !!ownedBeatTurn(ctx);
  // Provider-independent identity binding precedes model/tools; no prompt mutation.
  api.on("before_prompt_build", (_event, ctx) => { try { ownedBeatTurn(ctx); } catch { /* observe only */ } });

  // ---- startup: seed state from the transcript (read-only) ----
  async function seedFromTranscript() {
    let ssr, ags;
    try {
      ssr = await import("openclaw/plugin-sdk/session-store-runtime");
      ags = await import("openclaw/plugin-sdk/agent-sessions");
    } catch (e) { log(`keepalive: seed skipped (sdk import: ${e?.message || e})`); return; }
    let rows = [];
    try { rows = ssr.listSessionEntries({ agentId: ka.agentId, readOnly: true, hydrateSkillPromptRefs: false }) || []; } catch { rows = []; }
    for (const gid of groups) {
      const sk = sessionKeyFor(gid);
      const r = rows.find((x) => x.sessionKey === sk);
      if (!r?.entry?.sessionId) { log(`keepalive: no session for group ${gid.slice(0, 6)}`); continue; }
      try {
        const mgr = await ags.SessionManager.openModelContextAsync({ agentId: ka.agentId, sessionId: r.entry.sessionId, sessionKey: sk });
        const msgs = mgr?.buildSessionContext?.()?.messages || [];
        let lastAt = 0; let owner;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          const t = msgText(m);
          if (!lastAt && Number(m.timestamp)) lastAt = Number(m.timestamp);
          if (m.role === "user" && t.trim() !== HB_POLL_TEXT) {
            const id = t.match(/^\[[^\]\n]*?\(([0-9A-F]{32})\)\]/i)?.[1];
            if (id) { owner = isOwnerId(id); break; }
          }
        }
        const s = g(gid);
        const seedAt = lastAt || Number(r.entry.updatedAt) || 0;
        if (!s.lastCacheUseAt || seedAt > s.lastCacheUseAt) s.lastCacheUseAt = seedAt;
        if (!s.lastRealAt || seedAt > s.lastRealAt) s.lastRealAt = seedAt;
        if (typeof owner === "boolean" && (s.lastRealOwner === undefined || seedAt >= (s.lastCacheUseAt || 0))) s.lastRealOwner = owner;
        log(`keepalive: seeded group=${gid.slice(0, 6)} lastUse=${min(now() - s.lastCacheUseAt)}m ago lastRealOwner=${s.lastRealOwner}`);
      } catch (e) { log(`keepalive: seed failed for ${gid.slice(0, 6)}: ${e?.message || e}`); }
    }
    save();
  }

  // ---- lurk sticker ----
  async function maybeLurk(gid) {
    gid = typeof gid === "string" ? gid.trim().toUpperCase() : "";
    if (!lurkGroups.has(gid)) return; // Before state/day/RNG/sticker lookup/send.
    if (!ls.enabled) return;
    const s = g(gid);
    const t = now();
    const clock = localClock(ls.timeZone, t);
    if (s.stickers.day !== clock.day) s.stickers = { day: clock.day, count: 0 };
    const quiet = t - (Number(s.lastRealAt) || t);
    const why = [];
    if (quiet < ls.minQuietMin * 60_000) why.push(`quiet ${min(quiet)}m<${ls.minQuietMin}m`);
    if (inWindow(clock.hm, ls.nightStart, ls.nightEnd)) why.push(`night ${clock.hm}`);
    if (s.stickers.count >= ls.dailyCap) why.push(`cap ${s.stickers.count}/${ls.dailyCap}`);
    if (ls.noConsecutive && s.lurkSinceActivity) why.push("previous sticker not followed by activity");
    if (why.length) { log(`lurk sticker skip group=${gid.slice(0, 6)}: ${why.join(", ")}`); return; }
    const roll = random();
    if (roll >= ls.probability) { log(`lurk sticker roll group=${gid.slice(0, 6)} ${roll.toFixed(3)} >= p=${ls.probability}: no`); return; }
    const mt = mediaTagsCfg();
    const ent = stickerEntries(mt.stickerDir, ls.key)[0];
    if (!ent) { log(`lurk sticker: no "${ls.key}" sticker in ${mt.stickerDir}`); return; }
    const src = await ensureStickerCache(ent, mt.side);
    // Count the attempt first (cap + no-consecutive hold even if the platform rejects it).
    s.stickers.count += 1;
    s.lurkSinceActivity = true;
    s.lastLurkAt = t;
    save();
    if (ls.dryRun || ka.mode === "log-only") { log(`lurk sticker DRY-RUN group=${gid.slice(0, 6)} would send ${path.basename(src)} (${s.stickers.count}/${ls.dailyCap} today)`); return; }
    try {
      const adapter = await api.runtime.channel.outbound.loadAdapter("qqbot");
      if (!adapter?.sendMedia) throw new Error("qqbot outbound adapter has no sendMedia");
      const cfg = api.runtime.config?.current?.() ?? api.config;
      const r = await adapter.sendMedia({ cfg, to: `qqbot:group:${gid}`, text: "", mediaUrl: src, accountId: ls.accountId });
      log(`lurk sticker SENT group=${gid.slice(0, 6)} file=${path.basename(src)} messageId=${r?.messageId || "?"} (${s.stickers.count}/${ls.dailyCap} today)`);
      mtNote(gid, { kind: "sticker", status: "sent", file: path.basename(src), reason: "群里冷场时你自己发的" }); /* HOSINO-OUTCOME v1 */
    } catch (e) {
      log(`lurk sticker send FAILED group=${gid.slice(0, 6)}: ${String(e?.message || e).slice(0, 300)}`);
      mtNote(gid, { kind: "sticker", status: "failed", file: "", reason: "群里冷场时想自己发表情，没发出去" }); /* HOSINO-OUTCOME v1 */
    }
  }

  // ---- beat ----
  async function maybeBeat(gid) {
    const s = g(gid);
    const sk = sessionKeyFor(gid);
    const t = now();
    const tag = `group=${gid.slice(0, 6)}`;
    if (beatActive.has(sk) && beatActive.get(sk).until > t) return;
    if (Number(s.breakerUntil) > t) { logOnce(`brk:${gid}`, `keepalive paused ${tag} (breaker until ${new Date(s.breakerUntil).toISOString()})`); return; }
    if (!s.lastCacheUseAt) { logOnce(`unk:${gid}`, `keepalive idle ${tag}: no known cache use yet (waiting for a real turn)`); return; }
    const idle = t - s.lastCacheUseAt;
    const quiet = t - (Number(s.lastRealAt) || 0);
    if (quiet < ka.quietMin * 60_000) return;
    if (idle < ka.beatAfterMin * 60_000) return;
    if (idle > ka.maxIdleMin * 60_000) { logOnce(`cold:${gid}`, `keepalive idle ${tag}: last cache use ${min(idle)}m ago > ${ka.maxIdleMin}m, cache presumed cold; waiting for a real turn`); return; }
    if (ka.maxQuietMin > 0 && quiet > ka.maxQuietMin * 60_000) { logOnce(`mq:${gid}`, `keepalive stop ${tag}: quiet ${min(quiet)}m > maxQuietMin`); return; }
    if (ka.requireOwnerLastTurn && s.lastRealOwner !== true) { logOnce(`own:${gid}`, `keepalive skip ${tag}: last real turn was not owner-class (a beat would start a different Codex thread)`); return; }
    // QQ-CACHE-KEEPALIVE-CATALOG-GATE v2: no cold paid call after restart/module replacement.
    let catalogGate;
    try { catalogGate=globalThis[Symbol.for("openclaw.qqCacheCatalogProbe.v2")]?.check?.(sk); } catch { catalogGate={ready:false,reason:"probe-unavailable"}; }
    if(catalogGate?.ready!==true){
      const reason=["module-replaced","owner-proof-missing","guard-changed","catalog-changed","probe-unavailable"].includes(catalogGate?.reason)?catalogGate.reason:"probe-unavailable";
      logOnce(`catalog:${gid}:${reason}`,`keepalive skip ${tag}: catalog preflight ${reason}; waiting for a real owner turn`);
      return;
    }
    once.clear();
    if (ka.mode === "log-only") {
      log(`keepalive LOG-ONLY ${tag}: would beat now (idle ${min(idle)}m, quiet ${min(quiet)}m)`);
      // A log-only observation did not touch the provider cache.
      s.lastBeatDryRunAt = t;
      save();
      return;
    }
    const controller = new AbortController();
    const beat = { until: t + ka.timeoutMs + 15_000, gid, startedAt: t, controller, settled: false, preempted: false };

    // Reserve provenance before entering the runtime; no body or model-provided value.
    const nonce = newProducerNonce();
    if (typeof nonce !== "string" || !/^[a-f0-9]{48}$/.test(nonce) || producerLeases.has(nonce)) throw new Error("QQ cache keepalive invocation nonce unavailable");
    beat.nonce = nonce;
    beatActive.set(sk, beat);
    producerLeases.set(nonce, beat);
    emitOwned("start", beat);
    const budgetTimer = setTimeout(() => controller.abort("qq-keepalive-deadline"), ka.timeoutMs);
    budgetTimer.unref?.();
    let r;
    try {
      log(`keepalive beat start ${tag} (idle ${min(idle)}m, quiet ${min(quiet)}m)`);
      r = await api.runtime.system.runHeartbeatOnce({ reason: "qq-group-cache-keepalive", agentId: ka.agentId, sessionKey: sk, heartbeat: { target: "last", timeoutSeconds: ka.timeoutMs / 1000 }, abortSignal: controller.signal });
    } catch (e) {
      r = { status: "failed", reason: String(e?.message || e) };
    } finally {
      clearTimeout(budgetTimer);
      beat.settled = true;
      const b = beatActive.get(sk);
      if (b === beat) b.until = now() + 15_000; // late transcript writes / llm_output
    }
    log(`keepalive beat result ${tag}: ${JSON.stringify(r).slice(0, 200)} in ${now() - t}ms`);
    emitOwned("terminal", beat, { status: ["ran", "skipped", "failed"].includes(r?.status) ? r.status : "other", elapsedMs: Math.max(0, now() - t), aborted: controller.signal.aborted, preempted: beat.preempted, ownedHostRunObserved: !!beat.hostRunId });
    if (r?.status === "ran" && !beat.hostRunId) {
      // A pending exec/cron may legitimately run through the generic heartbeat API.
      // It remains normal maintenance work, not a proved cache-only refresh.
      s.lastBeatSkip = { at: now(), r: { status: "skipped", reason: "cache-invocation-not-observed" } };
      save();
      return;
    }
    if (r?.status === "ran") {
      s.consecutiveFailures = 0;
      s.lastCacheUseAt = now();
      s.lastBeatAt = now();
      s.beats = (Number(s.beats) || 0) + 1;
      save();
      await maybeLurk(gid);
    } else {
      const reason = String(r?.reason || "");
      const compatibilityFailure = /durable user-turn admission|GatewayDrainingError|runtime.*unsupported/i.test(reason);
      const budgetFailure = controller.signal.reason === "qq-keepalive-deadline";
      if (r?.status === "failed" || budgetFailure) s.consecutiveFailures = (Number(s.consecutiveFailures) || 0) + 1;
      if (compatibilityFailure || s.consecutiveFailures >= ka.maxConsecutiveFailures) {
        s.breakerUntil = now() + ka.breakerCooldownMin * 60_000;
        s.breakerReason = compatibilityFailure ? "admission-compatibility" : "consecutive-failures";
        log(`keepalive breaker ${tag} reason=${s.breakerReason} cooldownMin=${ka.breakerCooldownMin}`);
      }
      s.lastBeatSkip = { at: now(), r };
      save();
    }
  }

  let timer = null; let startTimer = null; let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try { for (const gid of groups) await maybeBeat(gid); } catch (e) { log(`keepalive tick error: ${e?.message || e}`); } finally { running = false; }
  }
  function start(abortSignal) {
    if (!ka.enabled || !groups.size) { log(`keepalive disabled (enabled=${ka.enabled}, groups=${groups.size})`); return; }
    if (timer || startTimer) return;
    const G = Symbol.for("openclaw.qqGroupKeepalive.v1");
    if (globalThis[G] && globalThis[G] !== engine) {
      // Plugin hot reload: the new instance takes over from the old one (single scheduler).
      try { globalThis[G].stop(); log("keepalive: took over from the previous plugin instance"); } catch { /* ignore */ }
    }
    globalThis[G] = engine;
    if (abortSignal && typeof abortSignal.addEventListener === "function") {
      if (abortSignal.aborted) { log("keepalive: gateway already draining; not starting"); return; }
      abortSignal.addEventListener("abort", () => stop(), { once: true });
    }
    log(`keepalive ${ka.mode} groups=${[...groups].map((x) => x.slice(0, 6)).join(",")} beatAfter=${ka.beatAfterMin}m quiet=${ka.quietMin}m maxIdle=${ka.maxIdleMin}m maxQuiet=${ka.maxQuietMin || "unlimited"} ownerOnly=${ka.requireOwnerLastTurn}; lurk ${ls.enabled ? `p=${ls.probability} minQuiet=${ls.minQuietMin}m night=${ls.nightStart}-${ls.nightEnd} ${ls.timeZone} cap=${ls.dailyCap}/day noConsecutive=${ls.noConsecutive}${ls.dryRun ? " DRY-RUN" : ""}` : "off"}`);
    const arm = () => {
      startTimer = setTimeout(async () => {
        startTimer = null;
        await seedFromTranscript().catch((e) => log(`keepalive seed error: ${e?.message || e}`));
        timer = setInterval(() => { tick(); }, ka.checkEveryMs);
        timer.unref?.();
        tick();
      }, ka.startupDelayMs);
      startTimer.unref?.();
    };
    // v2.4.1: arm the timers OUTSIDE the gateway_start hook's work-admission context. The core runs
    // gateway_start hooks inside a temporary root-work admission ("hooks:gateway-start") that is
    // marked released when the hook returns; timers created inside it inherit that AsyncLocalStorage
    // store, so every later runHeartbeatOnce (and the lurk sticker that follows a beat) was refused
    // with GatewayDrainingError. With no store, the queue only checks the real restart-drain /
    // suspend fences, so beats are still refused during a genuine restart drain.
    const path_ = armOutsideAdmission(arm);
    log(`keepalive timers armed via ${path_}`);
  }
  function armOutsideAdmission(fn) {
    let als;
    try { als = globalThis[Symbol.for("openclaw.gatewayWorkAdmissionState")]?.currentRootWork; } catch { als = undefined; }
    if (als && typeof als.exit === "function") {
      const inStore = typeof als.getStore === "function" && als.getStore() !== undefined;
      als.exit(fn);
      return `admission-exit (hook store ${inStore ? "present, escaped" : "absent"})`;
    }
    fn();
    return "fallback (admission state symbol missing; timers inherit the hook context)";
  }
  function stop() {
    for (const b of beatActive.values()) if (!b.settled) b.controller?.abort("qq-keepalive-stopped");
    producerLeases.clear();
    if (timer) clearInterval(timer); if (startTimer) clearTimeout(startTimer); timer = startTimer = null;
    const G = Symbol.for("openclaw.qqGroupKeepalive.v1");
    if (globalThis[G] === engine) delete globalThis[G];
  }

  const engine = { start, stop, tick, maybeBeat, maybeLurk, onRealDispatch, onAgentEnd, onLlmOutput, beforeToolCall, beforeMessageWrite, prepareHeartbeatProvenance, ownedInvocationMetadata: (ctx) => { const b = ownedBeatTurn(ctx); return b ? ownedMetadata(b) : null; }, recordOwnedCatalogApplied: (ctx, proof) => { const b = ownedBeatTurn(ctx); if (!b || proof?.moduleProofMatchedAtPrepare !== true || proof?.advertisedFpMatched !== true || !/^[a-f0-9]{64}$/.test(proof?.schemaEpoch || "") || !/^sha256:[a-f0-9]{64}$/.test(proof?.catalogFp || "")) return false; emitOwned("catalog-applied", b, { schemaEpoch: proof.schemaEpoch, catalogFp: proof.catalogFp, moduleProofMatchedAtPrepare: true, advertisedFpMatched: true }); return true; }, isBeatTurn, isBeat, state: () => state, groups };
  return engine;
}
