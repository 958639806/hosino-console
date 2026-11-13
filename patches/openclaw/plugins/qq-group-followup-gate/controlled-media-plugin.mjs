import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { createManager, KEY } = require("./controlled-media-jobs.cjs");

function outsideReleasedAdmission(callback) {
  const scope = globalThis[Symbol.for("openclaw.gatewayWorkAdmissionState")]?.currentRootWork;
  return scope?.exit ? scope.exit(callback) : callback();
}

// A typed delivery request, never a classifier of generated reply text.
// Only complete, single-media requests are recognized. Unknowns stay visible.
const opener = /^(?:(?:请你|请帮我|请|麻烦你|麻烦|帮我|给我|能否|可以|能不能)[\s，,]*)*/;
const noTextTail = /^(?:(?:[\s，,。.!！；;]*)?(?:只(?:要|发|发送)(?:语音|音频|图片|原图|照片)|不要(?:再)?(?:发|发送|回复|附加|附带)?(?:任何)?(?:文字|文本|说明|解释)|不用(?:再)?(?:发|发送|回复)?(?:文字|文本|说明|解释)|不需要(?:任何)?(?:文字|文本|说明|解释)|(?:发|发送)到当前(?:私聊|群聊|会话)|(?:不写|不要写|不用写|不记录|不要记录)(?:入|到)?(?:长期)?记忆|谢谢))*[\s，,。.!！；;]*$/;
const allowedTail = (tail, kind) => noTextTail.test(tail) && !(kind === 'voice' ? /只(?:要|发|发送)(?:图片|原图|照片)/ : /只(?:要|发|发送)(?:语音|音频)/).test(tail);
function bodyOf(text) {
  let rest = text.trim().replace(/^[:：，,\s]+/, '').replace(/^(?:一句|一段话)[\s：:]*/, '').replace(/^(?:台词|内容|正文)(?:是|为|[:：])[\s：:]*/, '');
  const pairs = { '“': '”', '「': '」', '‘': '’', '"': '"', "'": "'", '`': '`' };
  if (pairs[rest[0]]) {
    const end = rest.indexOf(pairs[rest[0]], 1);
    if (end <= 1 || !allowedTail(rest.slice(end + 1), 'voice')) return;
    return { quoted: true, body: rest.slice(1, end) };
  }
  // Without an explicit quotation boundary a later task can be mistaken for
  // narration. Keep all free-form unquoted requests visible; never guess using
  // an incomplete list of task verbs.
  return;
}
function classifyMediaOnlyRequest(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 8000) return { kind: 'unknown', reason: 'missing-or-overlong' };
  // An operator's explicit test marker is decoration; the parser below remains
  // exactly the same for ordinary natural requests without any test marker.
  let text = input.trim().replace(/^codex自动化测试[\s：:,，]*/i, '').replace(/^\[?US\d+-(?:VOICE|LONGVOICE|SENDPIC|PIC|GEN)\d+\]?\s*[:：，,\-]?\s*/i, '').replace(opener, '').trim();
  const literalFirst = /^把([“「‘"'`])/.exec(text);
  if (literalFirst) {
    const close = { '“': '”', '「': '」', '‘': '’', '"': '"', "'": "'", '`': '`' }[literalFirst[1]];
    const end = text.indexOf(close, 2);
    if (end > 2) {
      const tail = text.slice(end + 1), action = /^(?:读成|念成|合成为|合成|转成|转为)(?:一条|一段)?(?:语音|音频)/.exec(tail);
      if (action && allowedTail(tail.slice(action[0].length), 'voice')) return { kind: 'voice', count: 1, reason: 'single-literal-voice', literalText: text.slice(2, end) };
    }
  }
  const englishVoice = /^(?:please\s+)?(?:read(?:\s+this)?\s+aloud|say|speak)[:：\s]+(.+)$/is.exec(text);
  const englishBody = englishVoice && bodyOf(englishVoice[1]);
  if (englishBody) return { kind: 'voice', count: 1, reason: 'single-literal-voice', literalText: englishBody.body };
  const voice = /^(?:(?:用|以)(?:星野|你|你的|默认)(?:的)?(?:声音|音色|语音)(?:给我)?(?:说|读|朗读|念|讲)|(?:用)?(?:自然)?(?:语音|音频)(?:给我)?(?:说|读|朗读|念|讲)|(?:发|发送)(?:给我|我)?(?:一条|一段|条)?(?:自然)?(?:语音|音频)(?:说|读|朗读|念|讲)?|(?:朗读|念)(?:一下)?)[\s：:,，]*(.+)$/s.exec(text);
  const voiceBody = voice && bodyOf(voice[1]);
  if (voiceBody) return { kind: 'voice', count: 1, reason: 'single-literal-voice', literalText: voiceBody.body };
  const image = /^(?:把)?(?:(?:这张|这幅|刚收到的|刚才那张|收到的|刚发的|刚才的)(?:原图|图片|照片|图)|原图)(?:作为(?:图片)?附件)?(?:原样)?(?:发回|发|发送)(?:给我|我|到当前(?:私聊|群聊|会话))?/.exec(text) || /^(?:发回)(?:给我|我)?(?:这张|刚才那张|刚收到的)?(?:原图|图片|照片|图)(?:给我)?/.exec(text) || /^(?:发|发送)(?:给我|我)?(?:(?:这张|刚才那张|刚收到的)(?:原图|图片|照片|图)|原图)(?:给我)?/.exec(text);
  if (image && allowedTail(text.slice(image[0].length), 'image')) return { kind: 'image', count: 1, reason: 'single-image-return' };
  return { kind: 'unknown', reason: 'not-single-media-only' };
}
function deliveredMediaKind(params = {}) {
  const mime = typeof params.mimeType === 'string' ? params.mimeType.toLowerCase() : '';
  if (mime.startsWith('audio/') || params.asVoice === true) return 'voice';
  if (mime.startsWith('image/')) return 'image';
  const value = [params.media, params.mediaUrl, params.path, params.filePath, params.filename].find(item => typeof item === 'string' && item.trim()) || '';
  if (/\.(?:mp3|wav|silk|ogg|opus|m4a)(?:[?#].*)?$/i.test(value)) return 'voice';
  if (/\.(?:png|jpe?g|gif|webp|bmp)(?:[?#].*)?$/i.test(value)) return 'image';
  return 'unknown';
}

// QQ-MEDIA-FOLLOWUP-RECEIPT v2. Host facts only; missing evidence keeps the reply.
const QQ_MEDIA_DELIVERY_GUIDANCE = "QQ媒体交付：只有工具或宿主明确确认本轮要求的图片/语音/文件已成功投递到当前会话后，媒体本身就是结果；若没有用户要求的额外文字或其他实质结果，最终只输出 NO_REPLY。不要擅自另补‘已发送’、messageId、sent、文件路径，也不要复述发回原图、未重新生成、语音时长/分段等操作。用户明确要额外文字、再回复一句、确认、回执、状态或解释时必须按要求回复，不能因媒体已发送而静默；语音台词本身不代表要求再发同一段文字。pending、失败、部分发送、取消或状态不确定时不能据此静默。若媒体仍待最终回复自动附上，应先按附件交付契约正常交付，不能把生成完成当作投递成功。";
const LEDGER_TTL_MS = 10 * 60_000;
const LEDGER_MAX = 256;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isQQSessionKey = key => /:qqbot:(?:[^:]+:)?(?:group|direct):[^:]+$/i.test(String(key || ""));
function qqSource(event, context, phase, boundState) {
  // Agent hook channelId is a conversation id; reply hook channelId is the
  // provider. Never reinterpret a raw peer id as a provider or trust params.
  const providerFields = [context?.channel, context?.messageProvider, context?.requester?.channel];
  if (phase === "reply") providerFields.push(event?.channel, context?.channelId);
  else if (String(context?.channelId || "").toLowerCase() === "qqbot") providerFields.push(context.channelId);
  const known = providerFields.filter(value => typeof value === "string" && value.trim()).map(value => value.trim().toLowerCase());
  if (known.length) return known.every(value => value === "qqbot");
  if (isQQSessionKey(event?.sessionKey || context?.sessionKey)) return true;
  // Some native after-tool contexts omit the provider. Such a tool can only
  // attach a receipt to an already proved QQ prompt of this exact run/account.
  return phase === "tool" && boundState?.qqSourceProven === true;
}
const hasCorrelationConflict = (event, context) => Boolean(event?.sessionKey && context?.sessionKey && event.sessionKey !== context.sessionKey || event?.runId && context?.runId && event.runId !== context.runId || event?.toolCallId && context?.toolCallId && event.toolCallId !== context.toolCallId);
const keyOf = (event, context) => {
  if (hasCorrelationConflict(event, context)) return;
  const sessionKey = event?.sessionKey || context?.sessionKey;
  const runId = event?.runId || context?.runId;
  if (typeof sessionKey !== "string" || !sessionKey.trim() || typeof runId !== "string" || !runId.trim()) return;
  return `${sessionKey}\0${runId}`;
};
const mediaSource = value => typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) && value.some(mediaSource);
const hasMedia = params => ["media", "mediaUrl", "path", "filePath", "buffer"].some(key => mediaSource(params?.[key])) || mediaSource(params?.mediaUrls) || Array.isArray(params?.attachments) && params.attachments.some(item => mediaSource(item) || item && typeof item === "object" && ["url", "mediaUrl", "path", "filePath", "buffer"].some(key => mediaSource(item[key])));
function requestOutsideQuotes(prompt) {
  // A narrated script is data, not an instruction to add a text follow-up. Keep
  // quoted receipt-field names, though: “messageId” can itself be what was asked.
  return prompt.replace(/「[^」]*」|“[^”]*”|‘[^’]*’|"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, value => /^(?:[「“‘"'`])\s*(?:message\s*_?id|状态|回执|receipt|status)\s*(?:[」”’"'`])$/i.test(value) ? value.slice(1, -1) : " ");
}
const explicitReceiptRequest = prompt => typeof prompt === "string" && /(?:再|另外|额外|另行|然后)(?:回|回复|答|说|发)|(?:后|完)[^\n]{0,12}(?:回|回复|说|写|输出|告知|通知)|(?:回复|回我|回答|说|写|输出)[^\n]{0,12}(?:一句|一声|文字)|(?:文字|说明|解释|确认|状态|回执|message\s*_?id)|\b(?:reply|respond|say|tell|write|explain|confirm|acknowledge|include|report|receipt|status|message_?id)\b/i.test(requestOutsideQuotes(prompt));
function accountOf(context) {
  const direct = typeof context?.accountId === "string" ? context.accountId.trim() : "";
  const requester = typeof context?.requester?.accountId === "string" ? context.requester.accountId.trim() : "";
  return { id: requester || direct, conflict: Boolean(direct && requester && direct !== requester) };
}
function sameKnownAccount(state, context) {
  const account = accountOf(context);
  return Boolean(state?.accountId && account.id && !account.conflict && state.accountId === account.id);
}
function routeBindingMatches(fact, state, event, context) {
  const key = keyOf(event, context);
  if (!key || !state?.qqSourceProven || !state.accountId) return false;
  const proof = fact?.currentSourceRouteFact;
  if (fact?.sourceRouteDelivered !== true || proof?.schema !== "qq-current-source-route-delivery-v1" || typeof proof.bindingSha256 !== "string") return false;
  const sessionKey = event?.sessionKey || context?.sessionKey, runId = event?.runId || context?.runId;
  const expected = createHash("sha256").update(JSON.stringify([sessionKey, runId, "qqbot", state.accountId])).digest("hex");
  return proof.bindingSha256 === expected;
}
const verifiedSourceRouteFact = (fact, state, event, context) => !state?.invalid && routeBindingMatches(fact, state, event, context);
function verifiedStartedCall(fact, state, event, context) {
  if (!state || state.invalid || !state.qqSourceProven || !state.accountId || !keyOf(event, context)) return false;
  const stamp = state.callBindings?.get(event?.toolCallId || context?.toolCallId);
  if (!stamp || stamp.toolName !== String(event?.toolName || "") || !stamp.mediaSend || stamp.accountId !== state.accountId || stamp.key !== keyOf(event, context)) return false;
  const nativeAccountHash = fact?.currentSourceRouteFact?.accountHash;
  if (typeof nativeAccountHash === "string" && nativeAccountHash !== createHash("sha256").update("qq-media-contract-diag-v2\0" + stamp.accountId).digest("hex").slice(0, 16)) return false;
  // The stamp is minted from a real before_tool_call host context carrying the
  // current QQ account. The same host invocation delivers this reserved result;
  // tool parameters/content cannot supply the native strict current-route fact.
  return fact?.sourceRouteDelivered === true && fact.currentSourceRouteFact?.schema === "qq-current-source-route-delivery-v1" && /^[a-f0-9]{64}$/.test(fact.currentSourceRouteFact?.bindingSha256 || "");
}
const DIAGNOSTIC_SESSIONS = new Set(["agent:main:main", "agent:main:qqbot:group:__HS_GROUP_NEW_OPENID__", "agent:main:qqbot:group:__HS_GROUP_OLD_OPENID__"]);
const fieldPresence = value => typeof value === "string" && value.trim().length > 0;
const digestPresence = value => fieldPresence(value) ? createHash("sha256").update("qq-media-contract-diag-v2\0" + value).digest("hex").slice(0, 16) : undefined;
const providerEnum = value => !fieldPresence(value) ? "missing" : value.toLowerCase() === "qqbot" ? "qqbot" : value.toLowerCase() === "webchat" ? "webchat" : "other";
function receiptIdMatches(value, ids) {
  const normalized = value.replace(/^[`"'“”]+|[`"'“”]+$/g, "");
  if (ids.has(normalized)) return true;
  if (!/(?:…|\.\.\.)$/.test(normalized)) return false;
  const prefix = normalized.replace(/(?:…|\.\.\.)$/, "");
  return prefix.length >= 12 && [...ids].some(id => id.startsWith(prefix));
}
// This deliberately recognizes a tiny complete grammar, never arbitrary text
// containing 'sent'. Explanations, quoted voice text, task details and questions
// fail the grammar and remain visible, even after successful media delivery.
function isPureMediaReceipt(text, ids, intent = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 1600 || !(ids instanceof Set) || ids.size === 0) return false;
  let value = text.trim();
  let sawAck = false, sawReceipt = false;
  while (value.length) {
    const sep = /^[\s，,；;。.!！]+/.exec(value);
    if (sep) { value = value.slice(sep[0].length); continue; }
    const receipt = /^(?:QQ\s*)?(?:回执\s*)?(?:messageId|message_id)\s*(?:为|是|[:=：])?\s*([`"'“”]?[A-Za-z0-9_.:/+\-=…]+[`"'“”]?)/i.exec(value);
    if (receipt) {
      if (!receiptIdMatches(receipt[1], ids)) return false;
      sawReceipt = true; value = value.slice(receipt[0].length); continue;
    }
    const quoted = /^(?:「([^」]*)」|“([^”]*)”|‘([^’]*)’|"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/.exec(value);
    if (quoted) {
      if (intent.kind !== "voice" || !intent.literalText || quoted.slice(1).find(part => part !== undefined) !== intent.literalText) return false;
      value = value.slice(quoted[0].length); continue;
    }
    const ack = /^(?:已经|已)(?:成功)?(?:发送|发出|发回)(?:了)?(?:一条|一张|一个)?(?:语音|图片|媒体|附件|文件)?(?:到当前(?:QQ)?(?:会话|私聊|群聊)|给你)?(?:了)?/.exec(value);
    if (ack) {
      if (intent.kind === "voice" && /图片/.test(ack[0]) || intent.kind === "image" && /语音/.test(ack[0])) return false;
      sawAck = true; value = value.slice(ack[0].length); continue;
    }
    const status = /^(?:发送)?(?:状态|status)\s*(?:为|是|[:=：])?\s*[`"'“”]?sent[`"'“”]?(?=$|[\s，,；;。.!！])/i.exec(value);
    if (status) { sawReceipt = true; value = value.slice(status[0].length); continue; }
    const labelledVoice = /^语音「([^」]*)」已(?:经)?发到当前(?:QQ)?(?:会话|私聊|群聊)(?:了)?/.exec(value);
    if (labelledVoice) {
      if (intent.kind !== "voice" || !intent.literalText || labelledVoice[1] !== intent.literalText) return false;
      sawAck = true; value = value.slice(labelledVoice[0].length); continue;
    }
    // Complete positive delivery clauses. Every character must be consumed;
    // no failure, qualification, task result or arbitrary commentary is allowed.
    const delivery = /^(?:已经|已)(?:经)?(?:成功)?(?:把|将)(?:刚收到的|收到的|生成好的|生成好|这张|这条|这段)?(?:原图|图片|语音)(?:作为(?:图片)?附件)?/.exec(value);
    if (delivery) {
      if (intent.kind === "voice" && /原图|图片/.test(delivery[0]) || intent.kind === "image" && /语音/.test(delivery[0])) return false;
      value = value.slice(delivery[0].length); continue;
    }
    const delivered = /^(?:生成并发送|生成并发出|发送|发出|发回|发到)(?:了)?(?:这段|这条|一条|一张)?(?:语音|图片|原图)?(?:到)?当前(?:QQ)?(?:会话|私聊|群聊)(?:了)?/.exec(value);
    if (delivered) {
      if (intent.kind === "voice" && /原图|图片/.test(delivered[0]) || intent.kind === "image" && /语音/.test(delivered[0])) return false;
      sawAck = true; value = value.slice(delivered[0].length); continue;
    }
    const description = intent.kind === "voice" ? /^(?:约\s*\d{1,4}(?:\.\d{1,3})?\s*秒|单条\s*(?:MP3\s*)?语音|全文一次合成|中途没有拆段|这条语音没有再发相同台词的文字)/i.exec(value) : intent.kind === "image" ? /^(?:原图未修改|未生成新图|也没有发送文件路径|没有发送文件路径)/.exec(value) : undefined;
    if (description) { value = value.slice(description[0].length); continue; }
    return false;
  }
  return sawAck || sawReceipt;
}
function createMediaFollowupReceiptHooks(getLedger, log = () => {}, now = Date.now) {
  const replyDiagnostics = new WeakMap();
  const noteReply = (event, replyGuardReason, receiptGrammarMatches) => {
    if (event && typeof event === "object") replyDiagnostics.set(event, { replyGuardReason, receiptGrammarEvaluated: typeof receiptGrammarMatches === "boolean", receiptGrammarMatches });
  };
  function ledgerFor(event, context, create = false, phase = "reply") {
    const ledger = getLedger();
    if (!(ledger instanceof Map)) return {};
    if (hasCorrelationConflict(event, context)) {
      // Both identities are host hook fields. Keep every already-known side of
      // an ambiguous correlation invalid, even if a later hook looks normal.
      const sessions = new Set([event?.sessionKey, context?.sessionKey].filter(value => typeof value === "string" && value.trim()));
      const runs = new Set([event?.runId, context?.runId].filter(value => typeof value === "string" && value.trim()));
      for (const session of sessions) for (const run of runs) {
        const state = ledger.get(`${session}\0${run}`);
        if (state) state.invalid = true;
      }
      return {};
    }
    const key = keyOf(event, context);
    if (!key) return {};
    for (const [id, entry] of ledger) if (now() - entry.at > LEDGER_TTL_MS) ledger.delete(id);
    if (!qqSource(event, context, phase, ledger.get(key))) {
      if (ledger.has(key)) ledger.get(key).invalid = true;
      return {};
    }
    if (!ledger.has(key) && create) {
      const account = accountOf(context);
      ledger.set(key, { at: now(), ids: new Set(), mediaKinds: new Set(), pendingCalls: new Set(), callBindings: new Map(), completedCalls: new Set(), taskPending: false, toolFailure: false, untrackedTool: false, intent: { kind: "unknown" }, invalid: account.conflict || !account.id, preserve: true, accountId: account.id, qqSourceProven: true });
      while (ledger.size > LEDGER_MAX) ledger.delete(ledger.keys().next().value);
    }
    return { key, ledger, state: ledger.get(key) };
  }
  const hooks = {
    beforePrompt(event, context) {
      // Observe rejected provenance too. Returning before observation would let
      // a previous successful receipt survive a conflicting prompt source.
      ledgerFor(event, context, false, "prompt");
      if (hasCorrelationConflict(event, context)) return;
      if (!qqSource(event, context, "prompt") || context?.trigger && context.trigger !== "user" || context?.inputProvenance?.kind && context.inputProvenance.kind !== "external_user") {
        const key = keyOf(event, context), ledger = getLedger();
        if (key && ledger instanceof Map && ledger.has(key)) ledger.get(key).invalid = true;
        if (qqSource(event, context, "prompt") && context?.trigger !== "heartbeat") return { appendSystemContext: QQ_MEDIA_DELIVERY_GUIDANCE };
        return;
      }
      const { state } = ledgerFor(event, context, true, "prompt");
      if (state) {
        if (!sameKnownAccount(state, context)) state.invalid = true;
        // Current native owner-DM supplies the exact current prompt. Group
        // envelopes/history are never heuristically unwrapped into authority.
        const text = event?.prompt;
        const intent = classifyMediaOnlyRequest(text);
        const inputHash = typeof text === "string" ? createHash("sha256").update(text).digest("hex") : undefined;
        if (state.intentInputHash && state.intentInputHash !== inputHash) state.invalid = true;
        state.intentInputHash = inputHash;
        // The complete input grammar is the media-only contract. In particular,
        // a quoted narration and an explicit no-text tail do not request text.
        // Every unknown or extra-task request remains visible.
        state.preserve = !["voice", "image"].includes(intent.kind);
        state.intent = intent;
        state.intentSource = "prompt-strict-parse";
      }
      return { appendSystemContext: QQ_MEDIA_DELIVERY_GUIDANCE };
    },
    afterTool(event, context) {
      const observed = ledgerFor(event, context, false, "tool");
      if (hasCorrelationConflict(event, context)) return;
      if (observed.state) {
        const call = event?.toolCallId || context?.toolCallId;
        if (typeof call === "string") observed.state.pendingCalls.delete(call);
        if (event?.error || event?.result?.isError || ["error", "failed", "partial_failed", "cancelled"].includes(event?.result?.details?.status)) observed.state.toolFailure = true;
        const details = event?.result?.details;
        if (["accepted", "started", "running", "queued", "pending"].includes(details?.status) && (details.async === true || fieldPresence(details.taskId) || fieldPresence(details.jobId) || /^(?:image_generate|video_generate|openclaw__(?:image|video)_generate)$/.test(String(event?.toolName || "")))) observed.state.taskPending = true;
      }
      if (!/^(?:message|openclaw__message)$/.test(String(event?.toolName || ""))) return;
      const params = event?.params;
      if (!params || (params.action || "send") !== "send" || !hasMedia(params)) return;
      const { state } = ledgerFor(event, context, true, "tool");
      if (!state) return;
      const result = event.result, fact = result?.details?.messageDelivery;
      const observedAccount = accountOf(context);
      if (observedAccount.conflict || observedAccount.id && state.accountId !== observedAccount.id) { state.invalid = true; return; }
      const routeProved = verifiedSourceRouteFact(fact, state, event, context);
      const startedCallProved = verifiedStartedCall(fact, state, event, context);
      const finalProved = fact?.sourceReplyDelivered === true && params.final !== false && sameKnownAccount(state, context);
      if (event.error || result?.isError || params.dryRun === true || !fact || fact.status !== "settled" || fact.partialDelivery !== false || !(routeProved || startedCallProved || finalProved) || typeof fact.primaryPlatformMessageId !== "string" || !fact.primaryPlatformMessageId.trim()) {
        state.guardReason = event.error ? "event-error" : result?.isError ? "result-error" : params.dryRun === true ? "dry-run" : !fact ? "missing-fact" : fact.status !== "settled" ? "not-settled" : fact.partialDelivery !== false ? "partial" : !(routeProved || startedCallProved || finalProved) ? "route-proof" : "missing-receipt";
        state.invalid = true; return;
      }
      // Reserved native delivery facts prove this was the current source reply.
      // The model's message params and output prose cannot arm the ledger.
      state.ids.add(fact.primaryPlatformMessageId); state.mediaKinds.add(deliveredMediaKind(params)); state.at = now();
      const call = event?.toolCallId || context?.toolCallId;
      if (fieldPresence(call)) state.completedCalls.add(call);
      state.startedCallProved = startedCallProved;
    },
    beforeReply(event, context) {
      const { state } = ledgerFor(event, context);
      const keep = reason => { noteReply(event, reason); return; };
      // The current block hook has no complete assistant-message boundary.
      // A grammatically complete prefix may still precede a substantive error.
      if (event?.kind !== "final") return keep("not-final");
      const payload = event.payload;
      // Preserve the original guard order and predicates; these reasons only
      // expose which existing early return actually kept this payload.
      if (!payload) return keep("missing-payload");
      if (typeof payload.text !== "string") return keep("missing-text");
      if (!payload.text.trim()) return keep("empty-text");
      if (hasMedia(payload)) return keep("payload-media");
      if (Array.isArray(payload.attachments) && payload.attachments.length) return keep("payload-attachments");
      if (payload.isError) return keep("payload-error");
      if (payload.channelData) return keep("payload-channel-data");
      if (hasOwn(payload, "interactive")) return keep("payload-interactive-own");
      if (hasOwn(payload, "presentation")) return keep("payload-presentation-own");
      if (!state) return keep("missing-ledger");
      if (state.invalid) return keep("invalid-ledger");
      if (state.preserve) return keep("requested-or-unknown-intent");
      if (state.ids.size === 0) return keep("missing-receipt");
      if (!sameKnownAccount(state, context)) return keep("account-unproven");
      // A fully bounded request and a real matching receipt are necessary, but
      // not sufficient: the entire final must also be delivery-only prose.
      if (!["voice", "image"].includes(state.intent?.kind)) return keep("unknown-intent");
      if (state.intent.count !== 1) return keep("not-single-intent");
      if (state.ids.size !== 1) return keep("non-single-receipt");
      if (state.mediaKinds.size !== 1) return keep(state.mediaKinds.size === 0 ? "unknown-media-kind" : "multiple-media-kinds");
      if (!state.mediaKinds.has(state.intent.kind)) return keep(state.mediaKinds.has("unknown") ? "unknown-media-kind" : "media-kind-mismatch");
      if (state.pendingCalls.size) return keep("pending-tools");
      if (state.untrackedTool) return keep("untracked-tool");
      if (state.taskPending) return keep("pending-task");
      if (state.toolFailure) return keep("tool-failure");
      if (!isPureMediaReceipt(payload.text, state.ids, state.intent)) { noteReply(event, "receipt-grammar", false); return; }
      noteReply(event, "delivery-only-confirmed", true);
      return { cancel: true, reason: "qq-media-delivery-only-final-confirmed" };
    },
  };
  function metadata(phase, event, context, outcome) {
    const ledger = getLedger(), key = keyOf(event, context), state = key && ledger instanceof Map ? ledger.get(key) : undefined;
    const sessionKey = event?.sessionKey || context?.sessionKey;
    const sourcePhase = phase === "prompt" ? "prompt" : phase === "reply" || phase === "sent" ? "reply" : "tool";
    if (!DIAGNOSTIC_SESSIONS.has(sessionKey) || !qqSource(event, context, sourcePhase, state)) return;
    const fact = event?.result?.details?.messageDelivery;
    const account = accountOf(context);
    const proof = fact?.currentSourceRouteFact;
    const payload = event?.payload;
    const shape = (value, own) => !own ? "missing" : value === undefined ? "undefined" : value === null ? "null" : Array.isArray(value) ? "array" : ["boolean", "string", "number", "object"].includes(typeof value) ? typeof value : "other";
    log("[qq-media-followup-contract-v2] " + JSON.stringify({
      phase, runHash: digestPresence(event?.runId || context?.runId), sessionHash: digestPresence(sessionKey),
      hasRunId: fieldPresence(event?.runId || context?.runId), hasToolCallId: fieldPresence(event?.toolCallId || context?.toolCallId),
      toolCallHash: digestPresence(event?.toolCallId || context?.toolCallId),
      sessionKind: sessionKey === "agent:main:main" ? "owner-default" : "qq-group",
      provider: providerEnum(context?.channel || context?.messageProvider || context?.requester?.channel || (sourcePhase === "reply" ? event?.channel || context?.channelId : undefined)),
      knownAccount: Boolean(account.id), accountConflict: account.conflict, correlationConflict: hasCorrelationConflict(event, context),
      accountHash: digestPresence(account.id || state?.accountId),
      tool: /^(?:message|openclaw__message)$/.test(String(event?.toolName || "")) ? "message" : event?.toolName ? "other" : undefined,
      hasMedia: hasMedia(event?.params || event?.payload), finalParam: event?.params?.final === false ? "false" : event?.params?.final === true ? "true" : "missing",
      kind: ["final", "block", "tool"].includes(event?.kind) ? event.kind : event?.kind ? "other" : undefined,
      hasNativeFact: Boolean(fact), nativeStatus: ["settled", "suppressed", "dryRun", "failed"].includes(fact?.status) ? fact.status : fact?.status ? "other" : undefined,
      sourceReplyDelivered: fact?.sourceReplyDelivered === true, sourceRouteDelivered: fact?.sourceRouteDelivered === true,
      routeProofMatches: fact ? verifiedSourceRouteFact(fact, state, event, context) : undefined,
      rawRouteBindingMatches: fact ? routeBindingMatches(fact, state, event, context) : undefined,
      startedCallProved: state?.startedCallProved,
      proofSchemaKnown: proof?.schema === "qq-current-source-route-delivery-v1", proofBindingIsSha256: typeof proof?.bindingSha256 === "string" && /^[a-f0-9]{64}$/.test(proof.bindingSha256),
      proofSessionHash: /^[a-f0-9]{16}$/.test(proof?.sessionHash || "") ? proof.sessionHash : undefined,
      proofRunHash: /^[a-f0-9]{16}$/.test(proof?.runHash || "") ? proof.runHash : undefined,
      proofAccountHash: /^[a-f0-9]{16}$/.test(proof?.accountHash || "") ? proof.accountHash : undefined,
      eventErrorPresent: Boolean(event?.error), resultIsError: event?.result?.isError === true, resultIsErrorShape: typeof event?.result?.isError === "boolean" ? "boolean" : event?.result?.isError === undefined ? "missing" : "other", dryRunParam: event?.params?.dryRun === true,
      partialDelivery: typeof fact?.partialDelivery === "boolean" ? fact.partialDelivery : undefined, hasPlatformMessageId: fieldPresence(fact?.primaryPlatformMessageId || event?.messageId),
      success: typeof event?.success === "boolean" ? event.success : undefined,
      ledgerPresent: Boolean(state), ledgerInvalid: state?.invalid, preserveRequestedText: state?.preserve, receiptCount: state?.ids?.size,
      guardReason: state?.guardReason,
      intentKind: ["voice", "image"].includes(state?.intent?.kind) ? state.intent.kind : "unknown", intentSource: state?.intentSource,
      pendingToolCount: state?.pendingCalls?.size, taskPending: state?.taskPending, toolFailure: state?.toolFailure,
      returnedGuidance: fieldPresence(outcome?.appendSystemContext), returnedCancel: outcome?.cancel === true,
      ...(phase === "reply" ? {
        ...replyDiagnostics.get(event),
        payloadInteractiveOwn: Boolean(payload && hasOwn(payload, "interactive")), payloadPresentationOwn: Boolean(payload && hasOwn(payload, "presentation")),
        payloadInteractiveShape: shape(payload?.interactive, Boolean(payload && hasOwn(payload, "interactive"))),
        payloadPresentationShape: shape(payload?.presentation, Boolean(payload && hasOwn(payload, "presentation"))),
        payloadTextShape: shape(payload?.text, Boolean(payload && hasOwn(payload, "text"))),
        payloadAttachmentsCount: Array.isArray(payload?.attachments) ? Math.min(payload.attachments.length, 256) : 0,
        mediaKindCount: state?.mediaKinds ? Math.min(state.mediaKinds.size, 256) : undefined,
        stateMediaHasIntentKind: state?.mediaKinds?.has(state?.intent?.kind), untrackedTool: state?.untrackedTool,
      } : {}),
    }));
  }
  const observe = (...args) => { try { metadata(...args); } catch { /* Diagnostics never affect the reply or tool. */ } };
  return {
    beforePrompt(event, context) { const outcome = hooks.beforePrompt(event, context); observe("prompt", event, context, outcome); return outcome; },
    afterTool(event, context) { const outcome = hooks.afterTool(event, context); observe("tool-result", event, context, outcome); return outcome; },
    beforeReply(event, context) { const outcome = hooks.beforeReply(event, context); observe("reply", event, context, outcome); return outcome; },
    beforeToolObserve(event, context) {
      const { state, key } = ledgerFor(event, context, false, "tool");
      if (state) {
        const account = accountOf(context);
        if (account.conflict || account.id && state.accountId !== account.id) state.invalid = true;
        const call = event?.toolCallId || context?.toolCallId;
        if (typeof call === "string" && call.trim()) {
          if (state.completedCalls.has(call)) state.invalid = true;
          state.pendingCalls.add(call);
          // The native MCP outer layer projects requester only from an active,
          // host-minted per-turn grant; headers and JSON-RPC params cannot do so.
          const requester = context?.requester;
          if (sameKnownAccount(state, context) && requester?.channel === "qqbot" && requester.trigger === "user" && fieldPresence(requester.sourceMessageId) && qqSource(event, context, "prompt") && !hasCorrelationConflict(event, context)) state.callBindings.set(call, { key, accountId: account.id, toolName: String(event?.toolName || ""), mediaSend: /^(?:message|openclaw__message)$/.test(String(event?.toolName || "")) && (event?.params?.action || "send") === "send" && hasMedia(event?.params) });
        } else state.untrackedTool = true;
      }
      observe("tool-start", event, context);
    },
    messageSentObserve(event, context) { observe("sent", event, context); },
  };
}

export function registerControlledMediaJobs(api, log, injected = {}) {
  const config = api.pluginConfig?.controlledMediaJobs;
  if (config?.enabled !== true) return;
  const mode = api.registrationMode ?? "full";
  if (!["full", "discovery", "tool-discovery"].includes(mode)) throw new Error("MEDIA_JOB_REGISTRATION_MODE_UNSUPPORTED");
  const ownsManager = mode === "full";
  const ownerKey = Symbol.for("openclaw.qqControlledMediaJobs.registration.v1");
  const configSha256 = createHash("sha256").update(JSON.stringify(config, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest("hex");
  const borrowManager = (required) => {
    const current = globalThis[KEY], owner = globalThis[ownerKey];
    if (!current && !owner) {
      if (required) throw new Error("MEDIA_JOB_RUNTIME_OWNER_REQUIRED");
      return undefined;
    }
    if (!current || !owner || !Object.isFrozen(owner) || owner.schema !== "qq-controlled-media-runtime-owner-v1" || owner.mode !== "full" || owner.manager !== current || owner.configSha256 !== configSha256 || typeof current.execJobsEnabled !== "boolean" || ["start", "stop", "drain", "scoped", "originFor", "parse"].some(key => typeof current[key] !== "function")) throw new Error("MEDIA_JOB_RUNTIME_OWNER_INCOMPATIBLE");
    return current;
  };
  // Full activation owns the producer. Scoped views own their guard callbacks only.
  if (ownsManager && (globalThis[KEY] || globalThis[ownerKey])) throw new Error("MEDIA_JOB_MANAGER_ALREADY_REGISTERED");
  const dist = config.coreDist || "__HS_OPENCLAW_PKG__/dist";
  let supervisorModule, eventModule, detachedRuntime;
  const supervisor = () => supervisorModule ??= import(pathToFileURL(path.join(dist, "supervisor-Bkt-g18U.mjs")).href);
  const events = () => eventModule ??= import(pathToFileURL(path.join(dist, "system-events-DzT7qucG.mjs")).href);
  const loadDetachedRuntime = async () => {
    detachedRuntime = await import(pathToFileURL(path.join(dist, "gateway-work-admission-B4bQUVQ6.mjs")).href);
    if (typeof detachedRuntime.x !== "function") throw new Error("MEDIA_JOB_DETACHED_RUNTIME_NOT_READY");
  };
  let manager = ownsManager ? createManager(config, {
    runDetached: (run, origin) => {
      if (typeof detachedRuntime?.x !== "function") throw new Error("MEDIA_JOB_DETACHED_RUNTIME_NOT_READY");
      return detachedRuntime.x(run, origin);
    },
    supervisor: () => outsideReleasedAdmission(async () => (await supervisor()).t()),
    enqueue: (text, options) => outsideReleasedAdmission(async () => (await events()).a(text, options)),
    remove: (key, entry) => outsideReleasedAdmission(async () => (await events()).t(key, [entry])),
    wake: options => outsideReleasedAdmission(() => api.runtime.system.requestHeartbeat(options)),
    log,
    ...injected,
  }) : borrowManager(false);
  const requireManager = () => {
    const current = borrowManager(true);
    if (manager && manager !== current) throw new Error("MEDIA_JOB_RUNTIME_OWNER_CHANGED");
    manager ??= current;
    return current;
  };
  const followupKey = Symbol.for("openclaw.qqControlledMediaJobs.followupReceipts.v1");
  if (ownsManager) {
    // Only the host SDK registers producer origins. Models cannot set this registry
    // through tool params, prompt text, environment variables or job IDs.
    globalThis[KEY] = manager;
    globalThis[followupKey] = Object.freeze({ manager, entries: new Map() });
    globalThis[ownerKey] = Object.freeze({schema: "qq-controlled-media-runtime-owner-v1", mode: "full", manager, configSha256});
    api.on("gateway_start", async () => {
      // Load before accepting jobs so x reserves synchronously while the producer
      // root is live. Existing injected dependencies are only the fixture seam.
      if (typeof injected.runDetached !== "function") await loadDetachedRuntime();
      return outsideReleasedAdmission(() => manager.start());
    });
    api.on("gateway_stop", () => {
      const ledger = globalThis[followupKey];
      if (ledger?.manager === manager) ledger.entries.clear();
      return manager.stop();
    });
  }
  api.on("before_agent_run", async (_event, context) => {
    if (!/:qq-media-job-events:[a-f0-9]{16}$/.test(context?.sessionKey || "")) return;
    if (context.trigger === "heartbeat") await requireManager().drain();
    return { outcome: "block", reason: "Controlled media completion is consumed by its host delivery receipt; no model turn is required." };
  }, { priority: 1000, timeoutMs: 30000 });
  api.on("before_tool_call", async (event, context) => {
    const tool = String(event?.toolName || "").toLowerCase();
    // Existing native builtins keep their bounded chain; no rewrite, block or
    // alternate-tool loop is added. gateway_exec is an existing core exec projection.
    if (!["exec", "gateway_exec"].includes(tool)) return;
    const command = event?.params?.command ?? event?.params?.cmd;
    if (typeof command !== "string") return;
    // Inspection of script files is unaffected. A shell-wrapped execution of a
    // supported script fails preflight instead of bypassing the controlled job.
    const knownExecution = /(?:^|[\s;&|])(?:python3?|\/usr\/bin\/python3?)\s+[^\n]*\b(?:xingye_voice|xingye_tts|grok_imagine)\.py\b/.test(command);
    if (!knownExecution) return;
    try {
      const manager = requireManager();
      if (!manager.execJobsEnabled || !manager.scoped(context)) return;
      if (context?.abortSignal?.aborted) throw new Error("MEDIA_JOB_TURN_CANCELLED");
      const origin = manager.originFor(context?.requester, context);
      const recipe = manager.parse(command, event.params.workdir ?? event.params.cwd ?? context?.cwd ?? context?.workspaceDir);
      if (!recipe) {
        if (/\s--(?:check|help)(?:\s|$)/.test(command) && !/[;&|\n]/.test(command)) return;
        throw new Error("MEDIA_WRAPPER_REQUIRES_DIRECT_ADMITTED_COMMAND");
      }
      // A pre-tool hook precedes the exec tool's own final approval. It may only
      // validate authority, never queue or launch work. Core exec submits after
      // its final host policy and beforeSpawn/assertCurrent revalidation.
      // Both accepted names delegate to the existing final OpenClaw executor.
      // The permission hook and real host approval floors remain authoritative.
      return;
    } catch (error) {
      return { block: true, blockReason: `MEDIA_JOB_PREFLIGHT_BLOCKED: ${error.code || error.message || "guard-not-ready"}。未授权新的受控任务，不能换模型、shell 包装或其他工具绕过。` };
    }
  }, { priority: -100, timeoutMs: 15000 });
  const followup = createMediaFollowupReceiptHooks(() => {
    try {
      const ledger = globalThis[followupKey];
      return ledger?.manager === requireManager() ? ledger.entries : undefined;
    } catch { return undefined; } // Observer only: absent ownership keeps the reply.
  }, log);
  api.on("before_prompt_build", followup.beforePrompt);
  api.on("after_tool_call", followup.afterTool);
  api.on("reply_payload_sending", followup.beforeReply);
  api.on("before_tool_call", followup.beforeToolObserve);
  api.on("message_sent", followup.messageSentObserve);
  log("[qq-media-followup-contract-v2] " + JSON.stringify({ phase: "registration", mode, ownsManager, enabled: true, publicContract: "host-current-source-route-proof-v1", hooksRegistered: 5 }));
  return manager;
}
