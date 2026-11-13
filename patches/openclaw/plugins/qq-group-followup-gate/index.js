import { registerControlledMediaJobs } from "./controlled-media-plugin.mjs";
import { buildToolPathHint } from "./qq-tool-path-hint.mjs";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKeepalive, resolveKeepaliveConfig, resolveLurkConfig } from "./keepalive.js";

// v2.4.1 (2026-10-07 16:30): keepalive timers armed outside the released gateway_start admission context (fixes GatewayDrainingError on every beat).
// v2.4.0 (2026-10-07): QQ group prompt-cache keepalive + probabilistic "潜水" lurk sticker (see keepalive.js).
//   Plugin config: keepalive {...}, lurkSticker {...}. The lurk sticker key is hidden from the tag menu
//   (lurkSticker.hideFromMenu, default true) so the model does not use it in normal replies.
//   Heartbeat-triggered group turns get no group hint (keeps beats tiny; hint is user-role anyway).
// v2.3.0 (2026-10-06 evening):
//   - media hint is restrained: most replies carry no tag, at most ONE media item per reply
//     (sticker OR voice, never both), voice rarer than stickers, softer nudges.
//     (qqbot QQ-MEDIA-TAG-PATCH v1.1 enforces one media item per reply in code as well.)
//   - persona line for knowledge answers (accurate + concise, then cat-girl voice; no Markdown in groups).
//   - post-restart warmup (gateway_start, delayed): read-only touch of the agent session DB and the
//     model-context transcript of recently active real QQ group sessions. No turns, no sends,
//     no transcript/memory writes. Disable with plugin config {"warmup": false}.
// v2.2.0 (2026-10-06): per-turn sticker/voice tag hint (AstrBot meme_manager tag mode style).
//   Menu is built from the sticker directory (key = file name before the first '-').
//   Frequency guidance comes from per-group state written by the qqbot QQ-MEDIA-TAG-PATCH v1
//   (globalThis Symbol.for("openclaw.qqMediaTags.v1"), persisted to ~/.openclaw/qqbot/media-tag-state.json).
//   Settings: channels.qqbot.mediaTags in openclaw.json. No extra model call.
// v2.1.0 (2026-10-06): adds the `stay_silent` tool (MaiBot-style explicit silence).
//   The tool result carries `terminate: true`, so the run ends right after the call:
//   Codex harness interrupts the turn ("turn released after terminal dynamic tool result"),
//   core marks it as an intentional terminal completion (no settled-turn continuation, no
//   incomplete-turn warning). No second model round trip. NO_REPLY stays a fallback.
//   While a session is in the "silenced" state, every group text payload for it is cancelled.
// v2.0.0 (2026-09-30): FULL RECEIVE mode.
// Every group message now reaches the agent (nothing is dropped before dispatch),
// so the session transcript and Mem0 auto-capture see the whole group stream.
// Hints follow messages.groupChat.visibleReplies (automatic -> reply text / NO_REPLY; message_tool -> message tool).
// This plugin now only: (1) adds a per-turn group hint (stronger when the bot is
// addressed), and (2) cancels group text containing NO_REPLY (or empty/punctuation-only) at send time.
// A file or image with no caption is not standby text.

// QQ-GROUP-CONVERSATION-COMPAT v1: model-neutral response priority and exact silence sentinel.
// Full receive and the execution-time owner guard are unchanged.
function isSilentReplyToken(text) {
  const t = String(text ?? "").replace(/<[^>]+>/g, "").trim();
  return /^no[\s_\-]*reply$/i.test(t);
}

function hasPlainEmoticon(text) {
  // Preserve recognizable conversational faces while keeping punctuation placeholders suppressed.
  return /(?:[:;=][-^']?[()\/\\|*]|[-^=＾￣][_.＿．▽︿﹏][-^=＾￣]|[><][_.]?[><]|\^{2,3})/u.test(text);
}

/** Drop an entire silence sentinel or empty/punctuation-only placeholder; preserve meaningful emoji/text. */
function isStandbyText(text) {
  const t = String(text ?? "").replace(/<[^>]+>/g, "").trim();
  if (!t) return true;
  if (/^[\s\p{P}\p{S}]+$/u.test(t) && !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(t) && !hasPlainEmoticon(t)) return true;
  if (isSilentReplyToken(t)) return true;
  return false;
}

function resolveStateDir() {
  if (process.env.OPENCLAW_STATE_DIR) return process.env.OPENCLAW_STATE_DIR;
  const home = process.env.HOME || os.homedir() || "__HS_USER_HOME__";
  return path.join(home, ".openclaw");
}

let patternCache = { at: 0, list: [] };
function loadMentionPatterns() {
  if (Date.now() - patternCache.at < 60_000) return patternCache.list;
  let list = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), "openclaw.json"), "utf8"));
    list = cfg?.messages?.groupChat?.mentionPatterns ?? [];
  } catch {
    /* keep empty */
  }
  patternCache = { at: Date.now(), list };
  return list;
}

function isAddressed(event, content) {
  const text = String(content || "");
  if (/@you\b|<@!?[\w-]+>|＠|@星野|@ねこ|@小星|@猫娘/.test(text)) return true;
  if (event.replyToId || event.replyToIdFull) return true;
  for (const pat of loadMentionPatterns()) {
    try {
      if (new RegExp(pat, "i").test(text)) return true;
    } catch {
      /* skip bad pattern */
    }
  }
  return false;
}

function isGroupSessionKey(sk) {
  return /:group:/i.test(String(sk || ""));
}

// QQ-CONTEXT-SLIM-WRAPPERS v1: constant guidance uses the existing system-context hook.
const QQ_STABLE_WRAPPER_GROUP_KEYS = new Set(["agent:main:qqbot:group:__HS_GROUP_NEW_OPENID__", "agent:main:qqbot:group:__HS_GROUP_OLD_OPENID__"]);
function useQQStableWrapperContext(ctx) {
  const disabled = ["0", "off", "false", "no"].includes(String(process.env.OPENCLAW_QQ_STABLE_WRAPPERS ?? "").trim().toLowerCase());
  const triggers = [ctx?.trigger, ctx?.requester?.trigger].filter(value => value !== undefined && value !== null);
  const allUser = triggers.length > 0 && triggers.every(value => typeof value === "string" && value.trim().toLowerCase() === "user");
  return !disabled && allUser && QQ_STABLE_WRAPPER_GROUP_KEYS.has(String(ctx?.sessionKey || "").toLowerCase());
}

// QQ-ACTIVE-PARTICIPATION v1: only authorized groups' present, consistently user triggers.
function useQQActiveParticipationContext(ctx) {
  const triggers = [ctx?.trigger, ctx?.requester?.trigger].filter(value => value !== undefined && value !== null);
  return QQ_STABLE_WRAPPER_GROUP_KEYS.has(String(ctx?.sessionKey || "").toLowerCase()) && triggers.length > 0 &&
    triggers.every(value => typeof value === "string" && value.trim().toLowerCase() === "user");
}

function currentQQOwnerNeedsReply(ctx) {
  if (!QQ_STABLE_WRAPPER_GROUP_KEYS.has(String(ctx?.sessionKey || "").toLowerCase())) return false;
  const triggers = [ctx?.trigger, ctx?.requester?.trigger].filter(value => value !== undefined && value !== null);
  if (!triggers.length || !triggers.every(value => typeof value === "string" && value.trim().toLowerCase() === "user")) return false;
  try {
    const key = Symbol.for("openclaw.qqGroupOwnerGuard");
    const guard = globalThis[key] || process[key];
    return guard?.active === true && guard?.unifiedToolsReady === true && typeof guard.isCurrentOwner === "function" && guard.isCurrentOwner(ctx) === true;
  } catch { return false; }
}

const OWNER_HINT_AUTO = "【当前发送者经执行权限守卫确认为主人】这条消息请正常回应；不要调用 stay_silent，也不要输出 NO_REPLY。";
const OWNER_HINT_TOOL = "【当前发送者经执行权限守卫确认为主人】请调用 message 工具（action=send）正常回应；不要保持沉默。";

const REPLY_WHEN =
  "群聊参与优先级：被@、被叫名字、有人回复或接着你上一条话说时正常回应；群里的公开提问、问候、接话、需要你帮忙的任务，以及你正在参与的话题，都应主动接一句简短相关的话。没有@不是沉默的理由。任务复杂、没把握、对方不是主人或涉及权限时，也应依据本轮实际工具结果简短回应；不能使用工具也不应该保持沉默，可以如实说明具体限制或需要的信息。拿不准是否相关时倾向简短自然地回一句；明确在叫另一个人或机器人、与你无关的对话无需插话。";
const PERSONA_LINE =
  "回答知识/查询类问题：先准确、简洁地答清楚，再保持猫娘口吻（比如结尾一句可爱的话）；群聊里不用 Markdown 标题、加粗或长列表，尽量简短。";
const GROUP_HINT_TOOL = [
  "【QQ群聊】群里的每条消息你都会收到；你的最终回复文字不会自动发到群里，想说话要调用 message 工具（action=send）。",
  "- " + REPLY_WHEN,
  "- 只在本条明确是别人之间的对话、与你无关且没有需要你回应的提问或任务时才不说话：不调用 message 工具，直接结束本轮。",
  "- 不在群里透露__HS_OWNER_NAME__的私人信息。",
  "- " + PERSONA_LINE,
].join("\n");
const ADDRESSED_HINT_TOOL =
  "【本条消息在叫你（@/叫名字/引用你）】请调用 message 工具（action=send）在群里回复。";
const GROUP_HINT_AUTO = [
  "【QQ群聊】群里的每条消息你都会收到；你的回复文字会直接发到群里。像群里一个活泼的成员一样自然参与。",
  "- " + REPLY_WHEN,
  "- 只在本条明确是别人之间的对话、与你无关且没有需要你回应的提问或任务时才选择静默：调用 stay_silent 工具，不写回复文字。工具不可用时，仅原本可静默的消息才整条输出 NO_REPLY；静默被拒绝时正常回复，不得用这个标记绕过。不要在有实际回复内容时附带这个标记。",
  "- 不在群里透露__HS_OWNER_NAME__的私人信息。",
  "- " + PERSONA_LINE,
].join("\n");
const ADDRESSED_HINT_AUTO = "【本条消息在叫你（@/叫名字/引用你）】请正常回复，不要调用 stay_silent，也不要输出 NO_REPLY。";

// QQ-ACTIVE-PARTICIPATION v1: choice guidance only; silent tool and output semantics stay unchanged.
const ACTIVE_PARTICIPATION_REPLY =
  "当前已授权的新旧两群采用积极参与：普通公开话题、初次加入、随口感想、简短接话和上下文可接的有意义表情，默认一句相关短回应，不要求已参与，不以是否有趣或有用为门槛。没有@不是沉默的理由；@别人但仍有公开问题或请你评论也可参与。被@、叫名字、引用、提问和任务请求正常回应。避免逐条复述或凑长文。任务复杂、没把握、非主人或权限不足，仍按本轮实际结果短回应；不能使用工具也不应该保持沉默，可说明具体限制。";
const ACTIVE_PARTICIPATION_QUIET =
  "仅明确排他私事未邀请你、可信发送者确为另一个机器人自主输出且无人类请求、同一次已经答复的重复回执无新信息、空白或噪声可静默；有真人待答问题/任务仍回应。真人转述机器人的话并请你评论应回应。";
// QQ-ACTIVE-PARTICIPATION v2: short fixed per-turn choice hint, not sender authority.
const ACTIVE_TURN_HINT = "【本群积极参与】公开闲聊默认简短接话；没有@、不是问句、没有指向星野都不是静默理由。不能明确判断符合本群静默例外时，不调用 stay_silent、不输出 NO_REPLY。按本轮可信发送者ID识别身份，已知机器人自主输出且无真人请求时仍适用例外。";
const ACTIVE_GROUP_HINT_TOOL = [
  "【QQ群聊】群里的每条消息你都会收到；你的最终回复文字不会自动发到群里，想说话要调用 message 工具（action=send）。",
  "- " + ACTIVE_PARTICIPATION_REPLY,
  "- " + ACTIVE_PARTICIPATION_QUIET + "符合静默例外时不调用 message 工具，直接结束本轮。",
  "- 不在群里透露__HS_OWNER_NAME__的私人信息。",
  "- " + PERSONA_LINE,
].join("\n");
const ACTIVE_GROUP_HINT_AUTO = [
  "【QQ群聊】群里的每条消息你都会收到；你的回复文字会直接发到群里。像群里一个活泼的成员一样自然参与。",
  "- " + ACTIVE_PARTICIPATION_REPLY,
  "- " + ACTIVE_PARTICIPATION_QUIET + "符合静默例外时调用 stay_silent 工具，不写回复文字。工具不可用时，仅原本可静默的消息才整条输出 NO_REPLY；静默被拒绝时正常回复，不得用这个标记绕过。不要在有实际回复内容时附带这个标记。",
  "- 不在群里透露__HS_OWNER_NAME__的私人信息。",
  "- " + PERSONA_LINE,
].join("\n");

let modeCache = { at: 0, mode: "automatic" };
function visibleReplyMode() {
  if (Date.now() - modeCache.at < 60_000) return modeCache.mode;
  let mode = "automatic";
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), "openclaw.json"), "utf8"));
    mode = cfg?.messages?.groupChat?.visibleReplies || cfg?.messages?.visibleReplies || "automatic";
  } catch {
    /* default automatic */
  }
  modeCache = { at: Date.now(), mode };
  return mode;
}

// ---- sticker / voice tag hint (v2.2.0) ------------------------------------------
const MT_DEFAULTS = {
  enabled: true, stickers: true, voice: true,
  stickerCooldownReplies: 3, stickerNudgeAfterReplies: 12,
  voiceCooldownReplies: 5, voiceNudgeAfterReplies: 30,
  stickerDir: "", workspace: "",
};
const MT_ORDER = ["开心", "喜欢", "卖萌", "害羞", "得意", "疑惑", "震惊", "无语", "委屈", "难过", "生气", "困", "早安", "晚安"];
const MT_KEY = Symbol.for("openclaw.qqMediaTags.v1");
const MENU_HIDDEN_KEYS = new Set();
let mtCfgCache = { at: 0, cfg: MT_DEFAULTS };
function mediaCfg() {
  if (Date.now() - mtCfgCache.at < 60_000) return mtCfgCache.cfg;
  let cfg = { ...MT_DEFAULTS };
  try {
    const all = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), "openclaw.json"), "utf8"));
    cfg = { ...MT_DEFAULTS, ...(all?.channels?.qqbot?.mediaTags ?? {}) };
    if (!cfg.workspace) cfg.workspace = all?.agents?.defaults?.workspace || "";
  } catch {
    /* defaults */
  }
  cfg.workspace = cfg.workspace || path.join(resolveStateDir(), "workspace");
  cfg.stickerDir = cfg.stickerDir || path.join(cfg.workspace, "stickers");
  mtCfgCache = { at: Date.now(), cfg };
  return cfg;
}
/* HOSINO-STICKER-PATCH v1: stickers/params.json + manifest.json (5s refresh, mtime-keyed) */
const HS_STK = { at: 0, dir: "", params: null, manifest: null, pm: -1, mm: -1 };
function hsStk(dir) {
  if (HS_STK.dir === dir && Date.now() - HS_STK.at < 5000) return HS_STK;
  const rd = (f, prev, pm) => { try { const st = fs.statSync(f); if (st.mtimeMs === pm && HS_STK.dir === dir) return [prev, pm]; return [JSON.parse(fs.readFileSync(f, "utf8")), st.mtimeMs]; } catch { return [null, -1]; } };
  const [p, pm] = rd(path.join(dir, "params.json"), HS_STK.params, HS_STK.pm);
  const [m, mm] = rd(path.join(dir, "manifest.json"), HS_STK.manifest, HS_STK.mm);
  Object.assign(HS_STK, { at: Date.now(), dir, params: p, manifest: m, pm, mm });
  return HS_STK;
}
function hsHm(tz) { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute}`; } catch { return ""; } }
function hsQuiet(q) { if (!q || !q.start || !q.end || q.start === q.end) return false; const n = hsHm(q.tz); if (!n) return false; return q.start < q.end ? n >= q.start && n < q.end : n >= q.start || n < q.end; }
/* HOSINO-VOICE-PARAMS v1: voice section of stickers/params.json (code decides per turn) */
function hsDay(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Singapore" }).format(new Date()); } catch { return ""; } }
function hsVoiceCfg(HP) {
  const v = HP && HP.voice; if (!v || typeof v !== "object") return null;
  const num = (x, d, lo, hi, int) => { let n = Number(x); if (!Number.isFinite(n)) return d; if (int) n = Math.floor(n); return Math.max(lo, Math.min(hi, n)); };
  const tz = typeof v.tz === "string" && v.tz ? v.tz : "Asia/Singapore";
  const qh = (Array.isArray(v.quietHours) ? v.quietHours : v.quietHours ? [v.quietHours] : []).filter((q) => q && q.start && q.end).map((q) => ({ start: q.start, end: q.end, tz: q.tz || tz }));
  return { enabled: v.enabled !== false, probability: num(v.probability, 0.12, 0, 1), cooldownReplies: num(v.cooldownReplies, 4, 0, 100, true),
    quietHours: qh, tz, perConversation: v.perConversation && typeof v.perConversation === "object" ? v.perConversation : {},
    defaultEnabled: !!v.defaultEnabled, maxChars: num(v.maxChars, 40, 1, 200, true), dailyLimit: num(v.dailyLimit, 20, 0, 1000, true),
    exclusiveWithSticker: v.exclusiveWithSticker !== false,
    explicitRequestOverride: v.explicitRequestOverride === true /* HOSINO-VOICE-EXPLICIT v1: absent/false = off */ };
}
/* HOSINO-VOICE-EXPLICIT v1: detect "the user explicitly asks for voice this turn". Names come from voices.json at runtime. */
const HS_VN = { at: 0, mtime: -1, names: [] };
function hsVoiceNames(ws) {
  const t = Date.now(); if (t - HS_VN.at < 30000) return HS_VN.names; HS_VN.at = t;
  const f = path.join(ws || "", "voices", "voices.json");
  try {
    const st = fs.statSync(f);
    if (st.mtimeMs !== HS_VN.mtime) {
      const d = JSON.parse(fs.readFileSync(f, "utf8")); const out = new Set();
      for (const v of Array.isArray(d?.voices) ? d.voices : []) {
        if (!v || typeof v !== "object") continue;
        for (const n of [v.alias, v.title, String(v.title || "").replace(/[（(].*?[）)]/g, ""), ...(Array.isArray(v.nicknames) ? v.nicknames : [])]) {
          const k = typeof n === "string" ? n.trim() : ""; if (k && k.length <= 20 && k !== "默认") out.add(k);
        }
      }
      HS_VN.names = [...out].sort((a, b) => b.length - a.length); HS_VN.mtime = st.mtimeMs;
    }
  } catch { HS_VN.names = []; HS_VN.mtime = -1; }
  return HS_VN.names;
}
const HS_VX_NEG = /(?:不要|不用|别|甭|没)(?:再)?(?:发|用|来)?(?:语音|声音)|(?:不要|不用|别|甭)(?:再)?(?:用|换|切换|发|来|试)|语音(?:是什么|怎么|为什么|为啥|不行|坏了)/;
const HS_VX_POS = /(?:发|来|整|录|要|听|出)(?:一|个|段|条|句|下|点|几)*(?:语音|音频)|语音(?:啊|呀|呢|吧|测试|来|发)|说句话|(?:用|换).{0,12}?(?:的)?(?:声音|音色)|声音帮|(?:读|念)(?:给我)?听/;
function hsExplicitVoice(text, ws) {
  const t = String(text || "").slice(0, 400); if (!t) return false;
  if (HS_VX_NEG.test(t)) return false;
  if (HS_VX_POS.test(t)) return true;
  const lower = t.toLowerCase();
  const name = hsVoiceNames(ws).find((n) => lower.includes(n.toLowerCase()));
  if (!name) return false;
  if (/不要|别|不用|甭|是谁|是什么|是啥|为什么|为啥|怎么|列表|有哪些|有什么|不能|不行|[？?]/.test(t)) return false; /* HOSINO-VOICE-EXPLICIT v2: negations and questions about a voice are not requests */
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp("(?:试试|试一?下|来个?|来段|来句|换(?:成|到)?|用|切换(?:成|到)?|听听)[ \\t]*(?:一下|个|下)?[ \\t]*" + esc, "i").test(t)) return true; /* v2: verb right before the name */
  return /语音|声音|音色|听|说|读|念|讲|撒娇|来个|来段|来句/.test(t);
}
/* HOSINO-VOICE-EMOTION v1: hot-read workspace/fun/voice-tts.json (5s cache, mtime); default off => "" */
const HS_VT = { at: 0, mtime: -1, data: null };
function hsVoiceTts(cfg) {
  const t = Date.now(); if (t - HS_VT.at < 5000) return HS_VT.data; HS_VT.at = t;
  const f = path.join(cfg.workspace || "", "fun", "voice-tts.json");
  try { const st = fs.statSync(f); if (st.mtimeMs !== HS_VT.mtime) { HS_VT.data = JSON.parse(fs.readFileSync(f, "utf8")); HS_VT.mtime = st.mtimeMs; } } catch { HS_VT.data = null; HS_VT.mtime = -1; }
  return HS_VT.data;
}
const HS_VE_DEFAULT_KEYS = ["开心", "委屈", "傲娇", "生气", "温柔", "害羞", "得意", "撒娇", "小声", "困", "平静", "难过"];
function hsVoiceEmotionHint(cfg) {
  const v = hsVoiceTts(cfg); const ve = v && v.voiceEmotion;
  if (!ve || ve.enabled !== true) return "";
  const em = v.fish && v.fish.emotionMap && typeof v.fish.emotionMap === "object" ? Object.keys(v.fish.emotionMap) : [];
  let keys = (Array.isArray(ve.markers) && ve.markers.length ? ve.markers : em.length ? em : HS_VE_DEFAULT_KEYS).filter((k) => typeof k === "string" && k && k.length <= 8 && !/[【】\[\]]/.test(k)).slice(0, 30);
  if (!keys.length) return "";
  return `；台词开头加且只加一个情绪标记，从 ${keys.map((k) => "【" + k + "】").join("")} 里选最贴合这句语气的一个，例如 <语音>【${keys[0]}】台词</语音>，不要写描述，不要叠加多个`;
}
/* returns {hit, why, max}; why in off|session-off|quiet-hours|daily-limit|cooldown|roll-miss|hit */
function hsVoiceDecide(V, conv, g, rnd, explicit) {
  if (!V.enabled) return { hit: false, why: "off" };
  const pc = V.perConversation[conv]; const pco = pc && typeof pc === "object" ? pc : null;
  if (!(pco ? pco.enabled !== false : V.defaultEnabled)) return { hit: false, why: "session-off" };
  if (V.quietHours.some((q) => hsQuiet(q))) return { hit: false, why: "quiet-hours" };
  const today = hsDay(V.tz);
  if (V.dailyLimit > 0 && g && g.voiceDay === today && (Number(g.voiceDayCount) || 0) >= V.dailyLimit) return { hit: false, why: "daily-limit" };
  if (explicit === true && V.explicitRequestOverride === true) return { hit: true, why: "explicit", max: V.maxChars, explicit: true }; /* HOSINO-VOICE-EXPLICIT v1: skip cooldown + roll, keep off/session/quiet/daily */
  const vGap = g && g.lastVoiceReply != null ? (Number(g.replies) || 0) - g.lastVoiceReply : null;
  if (vGap != null && vGap < V.cooldownReplies) return { hit: false, why: "cooldown" };
  const p = pco && Number.isFinite(Number(pco.probability)) && pco.probability !== null ? Math.max(0, Math.min(1, Number(pco.probability))) : V.probability;
  return (rnd || Math.random)() < p ? { hit: true, why: "hit", max: V.maxChars } : { hit: false, why: "roll-miss" };
}
function hsSess(p, id) { const e = p?.sessions?.[id]; return e && typeof e === "object" ? e : null; }
let stickerKeyCache = { at: 0, dir: "", keys: [] };
function stickerKeys(dir) {
  if (stickerKeyCache.dir === dir && Date.now() - stickerKeyCache.at < 30_000) return stickerKeyCache.keys;
  const set = new Set();
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".") || !/\.(png|jpe?g|gif|webp)$/i.test(name)) continue;
      const key = name.replace(/\.[^.]+$/, "").split("-")[0].trim();
      if (key) set.add(key);
    }
  } catch {
    /* no dir */
  }
  const keys = [...MT_ORDER.filter((k) => set.has(k)), ...[...set].filter((k) => !MT_ORDER.includes(k)).sort()];
  stickerKeyCache = { at: Date.now(), dir, keys };
  return keys;
}
let mtFileCache = { at: 0, groups: {} };
function mediaGroupState(gid) {
  const shared = globalThis[MT_KEY];
  if (shared && shared.groups) return shared.groups[gid] || null;
  if (Date.now() - mtFileCache.at > 5_000) {
    let groups = {};
    try { groups = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), "qqbot", "media-tag-state.json"), "utf8"))?.groups || {}; } catch { /* none */ }
    mtFileCache = { at: Date.now(), groups };
  }
  return mtFileCache.groups[gid] || null;
}
/* HOSINO-VOICE-EXPLICIT v1: tell the qqbot send path (same process) this group turn is an explicit voice request, so its reply-gap cooldown is skipped. Daily limit still applies there. */
function hsExplicitMark(gid, on) {
  try {
    const k = Symbol.for("hosino.explicitVoice"); const m = globalThis[k] || (globalThis[k] = new Map()); const id = String(gid || "").toLowerCase(); if (!id) return;
    if (on) m.set(id, Date.now() + 5 * 60_000); else m.delete(id);
  } catch { /* optional */ }
}
const hsInboundText = new Map(); /* sessionKey -> { text, at } (collect queue may merge several) */
function mediaHint(sk, explicitText) {
  const cfg = mediaCfg();
  if (cfg.enabled === false) return "";
  const gid = (String(sk).match(/:group:([^:]+)/i)?.[1] || "").toUpperCase();
  const g = mediaGroupState(gid) || { replies: 0 };
  const replies = Number(g.replies) || 0;
  const sGap = g.lastStickerReply == null ? null : replies - g.lastStickerReply;
  const vGap = g.lastVoiceReply == null ? null : replies - g.lastVoiceReply;
  const parts = [];
  const keys = cfg.stickers === false ? [] : stickerKeys(cfg.stickerDir).filter((k) => !MENU_HIDDEN_KEYS.has(k));
  const hsS = hsStk(cfg.stickerDir); const HP = hsS.params; let hsAttach = false;
  const hsV = hsVoiceCfg(HP); const hsVX = !!(hsV && hsV.explicitRequestOverride && hsExplicitVoice(explicitText, cfg.workspace)); const hsVD = hsV ? hsVoiceDecide(hsV, "group:" + gid.toLowerCase(), g, mediaHint.rnd, hsVX) : null; hsExplicitMark(gid, !!(hsVD && hsVD.explicit)); /* HOSINO-VOICE-PARAMS v1 */
  const hsVBlockSticker = !!(hsVD && hsVD.hit && (hsV.exclusiveWithSticker || hsVD.explicit));
  try { mediaHint.last = hsVD ? { voice: hsVD.why } : null; } catch {}
  if (keys.length && HP) {
    /* HOSINO-STICKER-PATCH v1: code decides per turn; model only picks the category */
    const cats = hsS.manifest?.categories || {};
    const ok = keys.filter((k) => cats[k]?.enabled !== false);
    const se = hsSess(HP, "group:" + gid.toLowerCase());
    const on = HP.enabled !== false && (se ? se.enabled !== false : !!HP.defaultEnabled);
    const cool = Number.isFinite(Number(HP.cooldownReplies)) ? Number(HP.cooldownReplies) : Number(cfg.stickerCooldownReplies);
    const prob = Number.isFinite(Number(se?.probability)) ? Number(se.probability) : Number(HP.attachProbability ?? 0);
    if (hsVBlockSticker) parts.push("这轮不发表情包，不要写 && 标签"); /* HOSINO-VOICE-PARAMS v1: this turn is a voice turn */
    else if (!on || hsQuiet(HP.quietHours) || !ok.length) parts.push("这轮不发表情包，不要写 && 标签");
    else if (sGap != null && sGap < cool) parts.push("刚发过表情包，这轮不发，不要写 && 标签");
    else if (Math.random() < prob) {
      hsAttach = true;
      const notes = ok.map((k) => cats[k]?.scene ? `${k}=${cats[k].scene}` : k).join("；");
      parts.push(`这一轮请带一个表情包：在回复最后单独一行写 &&分类&&，按当前语境选最贴切的一个（${notes}）${HP.genEnabled !== false ? "；都不合适时可以写一个新的 2–4 字分类名，会在后台画好后补发" : ""}。如果这轮保持沉默，或者内容严肃（报错、隐私、认真安慰）就不带`);
    } else parts.push("这轮不发表情包，不要写 && 标签");
  } else if (keys.length) {
    if (sGap != null && sGap < Number(cfg.stickerCooldownReplies)) parts.push("刚发过表情包，这轮不发");
    else {
      let s = `表情包：回复最后单独一行写 &&分类&&（只能用：${keys.join("/")}）`;
      if ((sGap ?? replies) >= Number(cfg.stickerNudgeAfterReplies)) s += "，已经很久没发了，真合适时可以考虑带一个";
      parts.push(s);
    }
  }
  if (hsVD && cfg.voice !== false) { /* HOSINO-VOICE-PARAMS v1 */
    if (hsVD.hit && hsVD.explicit) parts.push(`这一轮对方明确要语音，请发一句 <语音>台词</语音>（不超过 ${hsVD.max} 字，口语、带语气），只写一句，其余照常写文字；不要说发不了；对方点名了音色就写 <语音 音色=别名>台词</语音>（别名用音色手册里的 alias，如 belial），没点名就不写音色` + hsVoiceEmotionHint(cfg)); /* HOSINO-VOICE-EXPLICIT v1 */
    else if (hsVD.hit) parts.push(`这一轮请发一句语音：把回复里最适合用声音说的一句（不超过 ${hsVD.max} 字，口语、带语气）写成 <语音>台词</语音>，只写一句，其余照常写文字；如果这轮保持沉默，或者内容是报错、隐私、长篇说明，就不带；对方点名了音色才写 <语音 音色=别名>台词</语音>（别名用音色手册里的 alias）` + hsVoiceEmotionHint(cfg)); /* HOSINO-VOICE-EMOTION v1: "" when off */
    else parts.push("这轮不发语音，不要写 <语音> 标签");
  } else if (cfg.voice !== false) {
    if (vGap != null && vGap < Number(cfg.voiceCooldownReplies)) parts.push("刚发过语音，这轮不用语音");
    else {
      let v = "语音比表情包更少用：只在打招呼/安慰/撒娇这类语气特别重要的时刻，才把一句≤20字的短话写成 <语音>台词</语音>";
      if ((vGap ?? replies) >= Number(cfg.voiceNudgeAfterReplies)) v += "，很久没用了，遇到这种时刻可以考虑";
      parts.push(v);
    }
  }
  if (!parts.length) return "";
  if (hsVD) return `【表情/语音】一条回复最多一个标记，表情包和语音不同时用。${parts.join("；")}。保持沉默时不要加；不要主动提及或解释这些标记；只有别人问起你上一轮发了什么表情/语音时，才按【上轮发送结果】如实回答，没有这条结果就说不确定，不要编。`; /* HOSINO-VOICE-PARAMS v1 */
  if (hsAttach) return `【表情/语音】一条回复最多一个：表情包和语音二选一，绝不同时用。${parts.join("；")}。保持沉默时不要加；不要主动提及或解释这些标记；只有别人问起你上一轮发了什么表情/语音时，才按【上轮发送结果】如实回答，没有这条结果就说不确定，不要编。`;
  return `【表情/语音·少用】大多数回复不带任何标记，只有明显能加分时才用；一条回复最多一个：表情包和语音二选一，绝不同时用。${parts.join("；")}。保持沉默时不要加；不要主动提及或解释这些标记；只有别人问起你上一轮发了什么表情/语音时，才按【上轮发送结果】如实回答，没有这条结果就说不确定，不要编。`;
}

/* HOSINO-OUTCOME v1: 上一轮表情/语音的真实发送结果（来自 qqbot 扩展/潜水写入的 lastMedia），只进 appendContext */
const outcomeShown = new Map(); // gid -> { at, n }
function mediaOutcomeHint(sk, oc) {
  const o = { enabled: true, ttlMin: 30, maxShows: 2, ...(oc && typeof oc === "object" ? oc : {}) };
  if (o.enabled === false) return "";
  const gid = (String(sk).match(/:group:([^:]+)/i)?.[1] || "").toUpperCase();
  const lm = mediaGroupState(gid)?.lastMedia;
  if (!lm || !lm.at || !lm.kind || !lm.status) return "";
  if (Date.now() - Number(lm.at) > Math.max(1, Number(o.ttlMin) || 30) * 60_000) return "";
  const sh = outcomeShown.get(gid);
  const n = sh && sh.at === lm.at ? sh.n : 0;
  if (n >= Math.max(1, Number(o.maxShows) || 2)) return "";
  outcomeShown.set(gid, { at: lm.at, n: n + 1 });
  const what = lm.kind === "voice" ? "语音" : "表情包";
  const file = lm.file ? `文件 ${String(lm.file).split(/[\\/\\\\]/).pop()}` : "";
  const why = lm.reason ? String(lm.reason) : "";
  const detail = [file, why].filter(Boolean).join("，");
  let s;
  if (lm.status === "sent") s = `你上一次的${what}已经成功发出${detail ? `（${detail}）` : ""}。别人问起你发了什么，就按这个如实说；没人问就不用提。`;
  else if (lm.status === "pending") s = `你上一次的${what}还没发出${detail ? `（${detail}）` : ""}。被问起就如实说还在处理，别说成已经发了。`;
  else if (lm.status === "failed") s = `你上一次的${what}没有成功发出${detail ? `（${detail}）` : ""}。如果对方在等或问起，如实说没发出去${lm.kind === "voice" ? "，可以用文字补上" : ""}；不要假装发过。`;
  else s = `你上一轮本来想带${what}，但没有发${detail ? `（${detail}）` : ""}。被问起就如实说没发，不要说成发了。`;
  return `【上轮发送结果】${s}不要主动解释标记或发送机制。`;
}

const addressedBySession = new Map(); // sessionKey -> expiry ms

// ---- post-restart warmup (v2.3.0) -----------------------------------------------
// After a restart the FIRST group turn paid ~4 s of one-time costs before the model even started
// (agent DB open + integrity validation ~1 s, cold transcript/model-context load ~1 s, cold JIT).
// This warmup performs only READ operations on the same code paths, a while after startup
// (after mem0's own ~15 s warmup recall), sequentially, for real group sessions active recently.
const REAL_GROUP_KEY = /^agent:[^:]+:qqbot:group:[0-9a-f]{32}$/i;
async function runWarmup(api, log, opts) {
  const t0 = Date.now();
  const agentId = opts.agentId || "main";
  const maxAgeMs = opts.maxAgeMs;
  const maxSessions = opts.maxSessions;
  let ssr, ags, har;
  try {
    ssr = await import("openclaw/plugin-sdk/session-store-runtime");
    ags = await import("openclaw/plugin-sdk/agent-sessions");
    har = await import("openclaw/plugin-sdk/agent-harness-attempt-runtime");
  } catch (e) {
    log(`warmup skipped: sdk import failed: ${e?.message || e}`);
    return;
  }
  const tImp = Date.now();
  // 1) agent DB: the normal (non-read-only) listing opens the process-wide agent DB handle once,
  //    which runs the post-restart integrity validation now instead of inside the first turn.
  let rows = [];
  try {
    rows = ssr.listSessionEntries({ agentId, hydrateSkillPromptRefs: false }) || [];
  } catch (e) {
    log(`warmup: session list failed (${e?.message || e}); trying read-only`);
    try { rows = ssr.listSessionEntries({ agentId, readOnly: true, hydrateSkillPromptRefs: false }) || []; } catch { rows = []; }
  }
  const tList = Date.now();
  const now = Date.now();
  const picked = rows
    .filter((r) => REAL_GROUP_KEY.test(String(r?.sessionKey || "")) && r?.entry?.sessionId)
    .filter((r) => now - (Number(r.entry.updatedAt) || 0) <= maxAgeMs)
    .sort((a, b) => (Number(b.entry.updatedAt) || 0) - (Number(a.entry.updatedAt) || 0))
    .slice(0, maxSessions);
  let storePath = opts.storePath;
  if (!storePath) {
    try { storePath = path.join(resolveStateDir(), "agents", agentId, "sessions", "sessions.json"); } catch { /* none */ }
  }
  const per = [];
  for (const r of picked) {
    const t1 = Date.now();
    try {
      // 2) same read the Codex harness does in its "context" stage (read-only, no writes).
      const limits = har.resolveAgentHarnessHistoryLimits?.(opts.historyBudgetTokens) ?? undefined;
      const mgr = await ags.SessionManager.openModelContextAsync(
        { agentId, sessionId: r.entry.sessionId, sessionKey: r.sessionKey, storePath },
        limits ? { limits } : undefined,
      );
      const n = mgr?.buildSessionContext?.()?.messages?.length ?? -1;
      per.push(`${r.sessionKey.slice(-8)}:${Date.now() - t1}ms/${n}msg`);
    } catch (e) {
      per.push(`${r.sessionKey.slice(-8)}:err(${String(e?.message || e).slice(0, 80)})`);
    }
  }
  log(`warmup done in ${Date.now() - t0}ms (sdk ${tImp - t0}ms, agent-db+list ${tList - tImp}ms, ${rows.length} entries; groups ${per.join(" ") || "none"})`);
}

// ---- stay_silent tool (v2.1.0) -------------------------------------------------
const SILENT_TOOL = "stay_silent";
const SILENT_TTL_MS = 90_000;
const silencedSessions = new Map(); // sessionKey -> expiry ms (cleared at next turn start)
const addressedTurnSessions = new Set(); // sessions whose CURRENT turn addresses the bot
function isSilenced(sk) {
  const until = silencedSessions.get(String(sk || ""));
  if (typeof until !== "number") return false;
  if (until < Date.now()) { silencedSessions.delete(String(sk || "")); return false; }
  return true;
}
const SILENT_TOOL_PARAMS = {
  type: "object",
  properties: {
    reason: {
      type: "string",
      description: "可选：极短的内部原因（只进日志，不会发到群里），例如“别人在聊私事”。",
    },
  },
  additionalProperties: false,
};
const SILENT_TOOL_DESCRIPTION =
  "QQ群聊专用：只在确实不需要回应时选择本轮静默（代替输出 NO_REPLY）。工具成功后不再补充文字或解释；发送层会拦截本轮的文字回复。" +
  "仅在当前消息明确是别人之间与你无关的对话、没有需要你回应的提问或任务时调用。没有@、对方不是主人、任务复杂、没把握或工具权限不足都不是静默理由；可以简短回应或说明实际限制。只要准备说一句招呼、接话或一个表情，就直接回复，不调用本工具。__HS_OWNER_NAME__发的消息、被@、被叫名字、向你提问或向你提出任务时不要调用。";

export default definePluginEntry({
  id: "qq-group-followup-gate",
  name: "QQ Group Follow-up Gate",
  description: "Full-receive QQ group helper: group turn hints (restrained sticker/voice tags, persona line) + stay_silent tool + standby/NO_REPLY send filter + read-only post-restart warmup + group prompt-cache keepalive + lurk sticker",
  register(api) {
    const channels = new Set(
      Array.isArray(api.pluginConfig?.channels) && api.pluginConfig.channels.length
        ? api.pluginConfig.channels
        : ["qqbot"],
    );
    const log = (m) => api.logger?.info?.(`[qq-group-followup-gate] ${m}`);
    /* QQ-TOOL-NEED-ADVISORY v1: default disabled; optional sidecar has no hook await. */
    let toolNeedLifecycle;
    try {
      const toolNeed = createRequire(import.meta.url)("./qq-tool-need-advisory.cjs");
      toolNeedLifecycle = toolNeed.installConfiguredBridge((row) => log(`tool-need ${JSON.stringify(row)}`));
    } catch { log("tool-need unavailable; original path retained"); }
    api.on("gateway_stop", () => { try { toolNeedLifecycle?.close(); } catch {} });
    /* /QQ-TOOL-NEED-ADVISORY */
    /* HOSINO-FUN-CONTEXT v1: 小脾气+拟人化（参数默认全关；加载或运行出错都只记日志，不影响本轮） */
    let hsFun = null;
    import("./fun-context.mjs").then((m) => { const hsK = Symbol.for("hosino.funContext.v1"); try { const old = globalThis[hsK]; if (old) { old.flush?.(); old.stop?.(); log("fun-context: stopped previous instance"); } } catch { /* HOSINO-FUN-SINGLETON v1 */ } hsFun = m.createFunContext({ dir: path.join(mediaCfg().workspace, "fun"), log, api }); globalThis[hsK] = hsFun; hsFun.start?.(); /* HOSINO-FUN-CONTEXT v2 */ }).catch((e) => log(`fun-context load failed: ${e?.message || e}`));
    api.on("gateway_stop", () => { try { hsFun?.flush(); hsFun?.stop?.(); } catch { /* HOSINO-FUN-CONTEXT v1 */ } });
    /* HOSINO-PRIVATE-COMPANION v1: 私聊拟人化（只对__HS_OWNER_NAME__的 QQ 私聊；c2c.enabled 默认关；出错只记日志） */
    let hsPc = null; const hsPcK = Symbol.for("hosino.privateCompanion.v1");
    if (process.env.OPENCLAW_HOSINO_PC !== "0") import("./private-companion.mjs").then((m) => { try { const old = globalThis[hsPcK]; if (old) { old.stop?.(); log("private-companion: stopped previous instance"); } } catch {} hsPc = m.createPrivateCompanion({ dir: path.join(mediaCfg().workspace, "fun"), log, api }); Object.defineProperty(globalThis, hsPcK, { value: hsPc, enumerable: false, configurable: true, writable: true }); hsPc.start?.(); }).catch((e) => log(`private-companion load failed: ${e?.message || e}`));
    api.on("gateway_stop", () => { try { hsPc?.stop?.(); } catch { /* HOSINO-PRIVATE-COMPANION v1 */ } });
    api.on("message_sent", (event, ctx) => { try { if (inChannel(ctx?.channelId || "")) hsPc?.onSent?.(event); } catch { /* observe only */ } }); /* HOSINO-PRIVATE-COMPANION v1: 只看发给__HS_OWNER_NAME__私聊的结果 */
    registerControlledMediaJobs(api, log);
    const inChannel = (c) => !c || channels.has(c);
    const extraSessionPatterns = (Array.isArray(api.pluginConfig?.silentToolExtraSessionPatterns)
      ? api.pluginConfig.silentToolExtraSessionPatterns : []).map((p) => { try { return new RegExp(p, "i"); } catch { return null; } }).filter(Boolean);
    const silentToolEnabled = api.pluginConfig?.silentTool !== false;
    const wantsSilentTool = (sk) =>
      (isGroupSessionKey(sk) && /qqbot/i.test(sk)) || extraSessionPatterns.some((re) => re.test(sk));

    // W) post-restart warmup (read-only; no turns, no sends, no memory writes).
    if (api.pluginConfig?.warmup !== false) {
      const delayMs = Number(api.pluginConfig?.warmupDelayMs ?? 25_000);
      let warmTimer = null;
      api.on("gateway_start", () => {
        if (warmTimer) return;
        warmTimer = setTimeout(() => {
          runWarmup(api, log, {
            maxAgeMs: 7 * 24 * 3600_000,
            maxSessions: 5,
            historyBudgetTokens: 258_400,
          }).catch((e) => log(`warmup failed: ${e?.message || e}`));
        }, Math.max(0, delayMs));
        warmTimer.unref?.();
        log(`warmup scheduled in ${delayMs}ms`);
      });
      api.on("gateway_stop", () => { if (warmTimer) clearTimeout(warmTimer); });
    }

    // K) group prompt-cache keepalive + lurk sticker (v2.4.0)
    const kaCfg = resolveKeepaliveConfig(api.pluginConfig?.keepalive);
    const lsCfg = resolveLurkConfig(api.pluginConfig?.lurkSticker);
    if (lsCfg.hideFromMenu && lsCfg.key) MENU_HIDDEN_KEYS.add(lsCfg.key);
    const ka = kaCfg.enabled ? createKeepalive(api, log, kaCfg, lsCfg) : null;
    if (ka) {
      api.on("gateway_start", (_event, ctx) => ka.start(ctx?.abortSignal));
      api.on("gateway_stop", () => ka.stop());
      api.on("before_dispatch", (event, ctx) => { try { ka.onRealDispatch(event, ctx); } catch { /* observe only */ } }, { eligibleTriggers: ["user"] });
      api.on("agent_end", (event, ctx) => { try { ka.onAgentEnd(event, ctx); } catch { /* observe only */ } });
      api.on("llm_output", (event, ctx) => { try { ka.onLlmOutput(event, ctx); } catch { /* observe only */ } });
      api.on("before_tool_call", (event, ctx) => ka.beforeToolCall(event, ctx));
      api.on("before_message_write", (event, ctx) => ka.beforeMessageWrite(event, ctx));
    } else {
      log(`keepalive disabled by config`);
    }
    // HOSINO-OUTCOME v1: 本轮结束时，若这一轮预扣了每日上限却没有真发出消息，由 fun-context 归还（有宽限，不订阅会话消息事件）
    api.on("agent_end", (_event, ctx) => { try { const sk = String(ctx?.sessionKey || ""); if (isGroupSessionKey(sk)) hsFun?.onTurnEnd?.(sk); } catch { /* observe only */ } });

    // 0) stay_silent: ends the run immediately (terminate:true), no visible message.
    if (silentToolEnabled) {
      api.registerTool((ctx) => {
        const sk = String(ctx?.sessionKey || "");
        if (!wantsSilentTool(sk)) return null;
        return {
          name: SILENT_TOOL,
          label: "Stay Silent",
          catalogMode: "direct-only",
          displaySummary: "Stay silent this turn (no group message).",
          description: SILENT_TOOL_DESCRIPTION,
          parameters: SILENT_TOOL_PARAMS,
          async execute(_toolCallId, params) {
            const reason = typeof params?.reason === "string" ? params.reason.slice(0, 80) : "";
            if (sk && addressedTurnSessions.has(sk)) {
              // Addressed turns require a visible reply; ending silently here would make core run an
              // extra "final answer" pass. Refuse (non-terminal) so the model just replies normally.
              log(`stay_silent refused (addressed turn) session=${sk} reason=${JSON.stringify(reason)}`);
              return {
                content: [{ type: "text", text: "这条消息在叫你（@/叫名字/引用你），不能保持沉默：请直接正常回复一句。" }],
                details: { status: "refused", reason: "addressed" },
              };
            }
            if (sk) silencedSessions.set(sk, Date.now() + SILENT_TTL_MS);
            log(`stay_silent session=${sk} reason=${JSON.stringify(reason)}`);
            return {
              content: [{ type: "text", text: "NO_REPLY" }],
              details: { status: "silent", reason },
              terminate: true,
            };
          },
        };
      }, { name: SILENT_TOOL });
    }

    // 1) Never drop: only note whether this group message addresses the bot.
    api.on(
      "before_dispatch",
      (event, ctx) => {
        const channel = event.channel || ctx.channelId || "";
        const sk = String(event.sessionKey || ctx.sessionKey || "");
        if ((!channels.has(channel) && !sk.includes("qqbot")) || !(event.isGroup || isGroupSessionKey(sk))) return; /* HOSINO-GROUPFIX v1 */
        const content = event.content || event.body || "";
        try { if (sk) { const prev = hsInboundText.get(sk); const keep = prev && Date.now() - prev.at < 120_000 ? prev.text + "\n" : ""; hsInboundText.set(sk, { text: (keep + String(content)).slice(-800), at: Date.now() }); } } catch { /* optional */ } /* HOSINO-VOICE-EXPLICIT v1 */
        if (sk && isAddressed(event, content)) {
          addressedBySession.set(sk, Date.now() + 10 * 60_000);
          log(`addressed session=${sk}`);
        }
        try { hsFun?.onDispatch(event, ctx); } catch (e) { log(`fun dispatch error: ${e?.message || e}`); } /* HOSINO-FUN-CONTEXT v1 */
        try { if (String(event.senderId || ctx?.senderId || "").toUpperCase() === "__HS_OWNER_OPENID__") hsPc?.noteGroup?.(sk, "owner", content); } catch { /* HOSINO-PRIVATE-COMPANION v1 */ }
        return; // full receive: let everything through
      },
      { eligibleTriggers: ["user"] },
    );

    // 2) Per-turn group hint (also: a new turn clears the previous stay_silent state).
    api.on("before_prompt_build", (_event, ctx) => {
      const sk = String(ctx?.sessionKey || "");
      if (sk === "agent:main:main") { /* HOSINO-PRIVATE-COMPANION v1: 主会话只加私聊提示；控制台等其它入口 hint() 返回空 */
        let pcH = ""; try { pcH = ctx?.trigger === "heartbeat" ? hsPc?.heartbeatHint?.(sk, ctx) || "" : hsPc?.hint?.(sk, ctx) || ""; } catch (e) { log(`pc hint error: ${e?.message || e}`); }
        return pcH ? { appendContext: pcH } : undefined;
      }
      if (ctx?.trigger === "heartbeat" && isGroupSessionKey(sk)) { // keepalive beat: no hint, no state change
        let hsHb = ""; try { hsHb = hsFun?.heartbeatHint?.(sk, ctx) || ""; } catch (e) { log(`fun heartbeat hint error: ${e?.message || e}`); } /* HOSINO-FUN-CONTEXT v2: only a fun-scheduled beat gets a hint */
        return hsHb ? { appendContext: hsHb } : undefined;
      }
      if (sk) silencedSessions.delete(sk);
      if (!isGroupSessionKey(sk)) return;
      const ch = ctx?.channelId || ctx?.messageProvider || ctx?.channel || "";
      if (ch && !channels.has(ch) && !sk.includes("qqbot")) return;
      const until = addressedBySession.get(sk);
      const addressed = typeof until === "number" && until > Date.now();
      if (addressed) addressedBySession.delete(sk);
      const ownerNeedsReply = currentQQOwnerNeedsReply(ctx);
      if (addressed || ownerNeedsReply) addressedTurnSessions.add(sk); else addressedTurnSessions.delete(sk);
      const tool = visibleReplyMode() === "message_tool";
      const base = useQQActiveParticipationContext(ctx) ? (tool ? ACTIVE_GROUP_HINT_TOOL : ACTIVE_GROUP_HINT_AUTO) : (tool ? GROUP_HINT_TOOL : GROUP_HINT_AUTO);
      const extra = ownerNeedsReply ? (tool ? OWNER_HINT_TOOL : OWNER_HINT_AUTO) : tool ? ADDRESSED_HINT_TOOL : ADDRESSED_HINT_AUTO;
      const stableWrapper = useQQStableWrapperContext(ctx);
      let hint = stableWrapper ? (addressed || ownerNeedsReply ? extra : "") : addressed || ownerNeedsReply ? `${base}\n${extra}` : base;
      if (!tool) {
        let hsIn = ""; try { const e = hsInboundText.get(sk); hsInboundText.delete(sk); if (e && Date.now() - e.at < 10 * 60_000 && ctx?.trigger === "user") hsIn = e.text; } catch {} /* HOSINO-VOICE-EXPLICIT v1 */
        try { const mh = mediaHint(sk, hsIn); if (mh) hint += `\n${mh}`; } catch { /* hint is optional */ }
      }
      try { const oh = mediaOutcomeHint(sk, hsFun?.outcomeCfg?.()); if (oh) hint += `${hint ? "\n" : ""}${oh}`; } catch { /* optional */ } /* HOSINO-OUTCOME v1 */
      if (useQQActiveParticipationContext(ctx)) hint += `\n${ACTIVE_TURN_HINT}`;
      // QQ-GROUP-IDENTITY-PATCH v1
      const fixedIdentityHint = "群聊身份校验：__HS_GROUP_IDENTITY_TABLE__。仅以本轮 Current message 或合并消息中每条消息自身标注的 QQ ID 判定发言人；引用、聊天历史、@对象、昵称和记忆不替代发送者 ID。多人合并消息分别识别，不把上一位发言人身份延续给下一位。未知 ID 用其昵称或直接说你，不猜成__HS_OWNER_NAME__或__HS_MEMBER1_ALIAS__。自己的身份始终是__HS_BOT_NAME__。\n识图必须实际读取本轮图片附件：原生视觉收到像素可直接回答；只有 Images 路径或附件文本时先用 view_image/image 读取。附件 description、引用和聊天历史不等于图像内容。读取失败就如实说明，不猜图，不声称调用过未调用的工具。";
      if (!stableWrapper) hint += "\n" + fixedIdentityHint;
      // QQ-TOOL-PATH-PATCH v1: user context only; complete catalog stays stable.
      if (process.env.OPENCLAW_QQ_TOOL_PATH_HINT !== "0" && ctx?.trigger === "user" && /^agent:main:qqbot:group:(__HS_GROUP_NEW_OPENID__|__HS_GROUP_OLD_OPENID__)$/.test(sk)) {
        const toolHint = buildToolPathHint(_event);
        if (toolHint) hint += "\n" + toolHint;
      }
      try { const hsFh = hsFun?.hint(sk, ctx, { addressed: addressed || ownerNeedsReply }); if (hsFh) hint += (hint ? "\n" : "") + hsFh; } catch (e) { log(`fun hint error: ${e?.message || e}`); } /* HOSINO-FUN-CONTEXT v1: appendContext only */
      /* QQ-TOOL-NEED-ADVISORY v1: consume only already-settled exact-source advice. */
      try {
        const advice = globalThis[Symbol.for("openclaw.qqToolNeedAdvisory.v1")]?.read(_event, ctx);
        if (advice?.appendContext) hint += `${hint ? "\n" : ""}${advice.appendContext}`;
      } catch { /* Original hint, permissions, catalog and memory hooks stay active. */ }
      if (stableWrapper) return {
        appendSystemContext: [base, fixedIdentityHint].join("\n"),
        ...(hint ? { appendContext: hint } : {}),
      };
      return { appendContext: hint };
    });

    // 3) Backstop: never deliver standby / NO_REPLY-ish text to a group.
    api.on("reply_payload_sending", (event, ctx) => {
      const ch = event.channel || ctx?.channelId || "";
      if (!inChannel(ch)) return;
      const sk = event.sessionKey || ctx?.sessionKey || "";
      if (!isGroupSessionKey(sk)) return;
      const p = event.payload || {};
      if (isSilenced(sk) && typeof p.text === "string" && p.text.trim()) {
        log(`drop payload after stay_silent kind=${event.kind} text=${JSON.stringify(p.text.slice(0, 40))}`);
        return { cancel: true, reason: "qq-group-stay-silent" };
      }
      if (p.mediaUrl || (Array.isArray(p.mediaUrls) && p.mediaUrls.length)) return;
      if (typeof p.text === "string" && isStandbyText(p.text)) {
        log(`drop standby payload kind=${event.kind} text=${JSON.stringify(p.text.slice(0, 40))}`);
        return { cancel: true, reason: "qq-group-standby-text" };
      }
    });

    api.on("message_sending", (event, ctx) => {
      const ch = ctx?.channelId || "";
      if (!inChannel(ch)) return;
      const sk = String(ctx?.sessionKey || "");
      const to = String(event.to || "");
      if (!(isGroupSessionKey(sk) || /group/i.test(to))) return;
      if (sk && isSilenced(sk) && String(event.content || "").trim()) {
        log(`cancel send after stay_silent to=${to} text=${JSON.stringify(String(event.content || "").slice(0, 40))}`);
        return { cancel: true, cancelReason: "qq-group-stay-silent" };
      }
      const mediaUrls = event?.metadata?.mediaUrls;
      const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0;
      if (hasMedia && !isSilentReplyToken(event.content)) { try { hsFun?.onSent?.(isGroupSessionKey(sk) ? sk : to); } catch { /* ignore */ } return; } /* HOSINO-OUTCOME v1 */
      if (isStandbyText(event.content)) {
        log(`cancel standby send to=${to} text=${JSON.stringify(String(event.content || "").slice(0, 40))}`);
        return { cancel: true, cancelReason: "qq-group-standby-text" };
      }
      if (String(event.content || "").trim() && !isSilentReplyToken(event.content)) { try { hsFun?.onSent?.(isGroupSessionKey(sk) ? sk : to); } catch { /* ignore */ } } /* HOSINO-OUTCOME v1: 真发出了消息 → 预扣的每日上限确认 */
      if (isGroupSessionKey(sk) && String(event.content || "").trim() && !isSilentReplyToken(event.content)) { try { hsPc?.noteGroup?.(sk, "bot", event.content); } catch { /* HOSINO-PRIVATE-COMPANION v1 */ } }
    });
  },
});
