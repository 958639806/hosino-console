// QQ-EXECUTION-POLICY v2 (2026-10-10). Execution checks do not modify the catalog.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks';
import { isMainThread } from 'node:worker_threads';
import { r as createToolPolicyMatcher } from '__HS_OPENCLAW_PKG__/dist/tool-policy-match-COwlx5YS.mjs';

export const WORKSPACE = '__HS_OPENCLAW_HOME__/workspace';
export const GUARD_KEY = Symbol.for('openclaw.qqGroupOwnerGuard');
// QQ-COMPLETE-GROUP-CATALOG v1. Scope is configuration, never sender authority.
const QQ_COMPLETE_GROUP_IDS = new Set(['__HS_GROUP_NEW_OPENID__', '__HS_GROUP_OLD_OPENID__']);
export function isQQFullCatalogGroup(config, sessionKey) {
  const match = /^agent:main:qqbot:group:([a-f0-9]{32})$/i.exec(String(sessionKey || ''));
  if (!match || !QQ_COMPLETE_GROUP_IDS.has(match[1].toLowerCase())) return false;
  const entry = config?.plugins?.entries?.['qq-group-owner-guard'];
  const policy = entry?.config?.unifiedTools;
  return entry?.enabled === true && policy?.enabled === true && Array.isArray(policy.groups) && policy.groups.some(id => typeof id === 'string' && id.toLowerCase() === match[1].toLowerCase());
}

const SYSTEM_TRIGGERS = new Set(['cron', 'heartbeat', 'automation', 'schedule', 'memory']);
const BLOCKED = new Set(['gateway', 'gateway_exec', 'gateway_process', 'terminal', 'secrets', 'plugins', 'codex_plugins', 'automations', 'cron', 'nodes', 'computer', 'mobile_ui', 'portal', 'sessions', 'conversations_list', 'conversations_send', 'conversations_turn', 'openclaw', 'browser', 'apply_patch', 'write', 'edit', 'process', 'code_execution', 'transcripts', 'github_identity_status', 'dashboard', 'skill_workshop', 'memory_delete', 'memory_update', 'screen', 'codex_threads']);
export const REQUIRED_BLOCKED = ['automations', 'gateway', 'plugins', 'sessions', 'screen', 'terminal', 'portal', 'conversations_list', 'conversations_send', 'conversations_turn', 'nodes', 'computer', 'mobile_ui', 'openclaw', 'codex_plugins', 'transcripts', 'github_identity_status'];
const SHELL = new Set(['exec_command', 'shell', 'local_shell', 'bash', 'unified_exec', 'shell_command', 'container.exec', 'exec']);
const POLL = new Set(['write_stdin', 'process', 'gateway_process']);
export const normId = value => String(value || '').replace(/^qqbot:/i, '').replace(/^(id|channel:qqbot):/i, '').trim().toUpperCase();
export const isQQGroup = sk => /:qqbot:group:/i.test(String(sk || ''));
// QQ-DIRECT-EXECUTION-BOUNDARY v1: direct key is routing evidence, never owner authority.
export const isQQDirect = sk => /:qqbot:(?:[^:]+:)?(?:direct|c2c):[^:]+$/i.test(String(sk || ''));
export function isQQConversation(sk, ctx = {}) {
  return isQQGroup(sk) || isQQDirect(sk) || String(ctx?.requester?.channel ?? ctx?.channelId ?? ctx?.channel ?? ctx?.messageProvider ?? '').toLowerCase() === 'qqbot';
}

export function toolCandidates(tool) {
  const raw = String(tool || '').trim(); const names = new Set([raw]);
  for (const prefix of ['mcp__openclaw__', 'functions.', 'functions__', 'openclaw_direct__', 'openclaw__', 'openclaw_direct', 'openclaw']) if (raw.startsWith(prefix) && raw.length > prefix.length) names.add(raw.slice(prefix.length).replace(/^_+/, ''));
  for (const name of [...names]) {
    const folded = name.toLowerCase(); names.add(folded);
    if (folded === 'bash' || SHELL.has(folded)) names.add('exec');
    if (folded === 'apply-patch') names.add('apply_patch');
    if (folded === 'cron') names.add('automations');
    if (folded === 'write_stdin') names.add('process');
  }
  return [...names].filter(Boolean);
}
export function isBlockedForNonOwner(tool) { return toolCandidates(tool).some(n => BLOCKED.has(n) || /^codex_/.test(n)); }
export function requesterState(ctx, owners) {
  const r = ctx?.requester; const trigger = String(r?.trigger ?? ctx?.trigger ?? '').toLowerCase();
  if (SYSTEM_TRIGGERS.has(trigger)) return { owner: false, id: '', how: 'system-trigger', trigger };
  if (!r || !normId(r.senderId) || (r.channel && String(r.channel).toLowerCase() !== 'qqbot')) return { owner: false, id: '', how: 'missing-requester', trigger };
  const id = normId(r.senderId);
  const owner = r.senderIsOwner !== false && owners.has(id);
  return { owner, id, how: owner ? 'current-requester' : 'current-non-owner', trigger };
}

// Shell arguments are parsed rather than joined/requoted. No command substitution or extra shell operators.
function shellTokens(raw) {
  const out = []; let token = ''; let quote = ''; let started = false;
  const s = String(raw || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") { if (c === "'") quote = ''; else token += c; continue; }
    if (quote === '"') {
      if (c === '"') { quote = ''; continue; }
      if (c === '$' || c === '`') return null;
      if (c === '\\' && i + 1 < s.length && ['\\', '"', '$', '`'].includes(s[i + 1])) token += s[++i]; else token += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (';&|`$<>(){}\n\r'.includes(c)) return null;
    if (c === '\\') { if (++i >= s.length || s[i] === '\n' || s[i] === '\r') return null; token += s[i]; started = true; continue; }
    if (/\s/.test(c)) { if (started) { out.push(token); token = ''; started = false; } continue; }
    token += c; started = true;
  }
  if (quote) return null;
  if (started) out.push(token);
  return out.length ? out : null;
}
export function commandTokens(params) {
  const p = params || {}; let command = p.cmd ?? p.command ?? p.input?.command ?? p.tool_input?.command ?? p.arguments?.command;
  if (typeof command === 'string') {
    command = command.trim().replace(/^cd\s+(?:\/home\/ubuntu\/\.openclaw\/workspace|~\/\.openclaw\/workspace)\s*&&\s*/, '');
    return shellTokens(command);
  }
  if (!Array.isArray(command) || !command.length || command.some(v => typeof v !== 'string' || v.includes('\0'))) return null;
  if (/^(?:\/usr\/bin\/|\/bin\/)?(?:bash|sh)$/.test(command[0])) return command.length === 3 && /^(?:-c|-lc)$/.test(command[1]) ? shellTokens(command[2]) : null;
  return [...command];
}
function contained(root, target) { const relative = path.posix.relative(root, target); return relative === '' || (!relative.startsWith('../') && relative !== '..' && !path.posix.isAbsolute(relative)); }
function realPath(value, io) { try { return String(io.realpathSync(value)); } catch { return null; } }
function outputAllowed(value, io) {
  if (!/^\/tmp\/[A-Za-z0-9._\-\u4e00-\u9fff]+$/.test(String(value || ''))) return false;
  const parent = realPath('/tmp', io); if (!parent) return false;
  try { if (io.lstatSync(value).isSymbolicLink()) return false; } catch (err) { if (err?.code !== 'ENOENT') return false; }
  const existing = realPath(value, io); return !existing || contained(parent, existing);
}
const schemas = {
  'xingye_voice.py': { values: ['--out', '--style', '--voice', '--model'], flags: [], positions: [1, 1], defaultOut: null },
  'xingye_tts.py': { values: ['--out', '--style', '--voice', '--model', '--format', '--repeat'], flags: [], positions: [1, 1], defaultOut: '/tmp/xingye_tts_out.wav' },
  'mimo_tts.py': { values: ['--out', '--style', '--voice', '--model'], flags: ['--sing'], positions: [1, 1], defaultOut: '/tmp/mimo_out.wav' },
  'baidu_search.py': { values: ['--max', '--timeout', '--cache-ttl'], flags: ['--short', '--sources', '--no-cache'], positions: [1, 1] },
};
function argsAllowed(args, schema, io) {
  let positions = 0; let output = schema.defaultOut; let format = 'wav'; const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]; if (a.length > 16000 || a.includes('\0')) return false;
    if (!a.startsWith('-')) { positions++; continue; }
    const equal = a.indexOf('='); const key = equal > 0 ? a.slice(0, equal) : a;
    if (seen.has(key)) return false; seen.add(key);
    if (schema.flags.includes(key)) { if (equal > 0) return false; continue; }
    if (!schema.values.includes(key)) return false;
    const value = equal > 0 ? a.slice(equal + 1) : args[++i]; if (typeof value !== 'string' || !value || value.includes('\0')) return false;
    if (key === '--out') { output = value; if (!outputAllowed(value, io)) return false; }
    if (key === '--repeat' && (!/^\d+$/.test(value) || +value < 1 || +value > 3)) return false;
    if (key === '--format') { if (!['mp3', 'wav'].includes(value)) return false; format = value; }
    if (key === '--max' && (!/^\d+$/.test(value) || +value < 1 || +value > 1600)) return false;
    if (key === '--timeout' && (!Number.isFinite(+value) || +value < 1 || +value > 90)) return false;
    if (key === '--cache-ttl' && (!Number.isFinite(+value) || +value < 0 || +value > 120)) return false;
  }
  if (schema.defaultOut === '/tmp/xingye_tts_out.wav' && !seen.has('--out')) output = '/tmp/xingye_tts_out.' + format;
  return positions >= schema.positions[0] && positions <= schema.positions[1] && (!output || outputAllowed(output, io));
}
/* HOSINO-FUN-SCRIPTS v1 (2026-11-10)：拟人化「追问近况」「盲猜 MBTI」和小脾气「记仇本」的记录脚本。
   脚本本身只写 workspace/fun/*.json，并自己检查开关、按群开关、退出名单、每日上限。这里只放行固定子命令和固定形状的参数。 */
const FUN_ID = /^[0-9a-fA-F]{32}$/;
export function funScriptArgsAllowed(script, offset, args) {
  if (!offset || !Array.isArray(args) || args.some(a => typeof a !== 'string' || !a || a.includes('\0') || a.length > 400)) return false;
  const flags = f => args.filter(a => a === f).length;
  if (script === 'fun_mbti.py') { if (flags('--zodiac') > 1) return false; const p = args.filter(a => a !== '--zodiac'); return p.length === 3 && p[0] === 'check' && FUN_ID.test(p[1]) && FUN_ID.test(p[2]); }
  if (script === 'fun_followup.py') { if (flags('--sensitive') > 1) return false; const p = args.filter(a => a !== '--sensitive'); return p.length >= 5 && p[0] === 'add' && FUN_ID.test(p[1]) && FUN_ID.test(p[2]) && /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d)?$/.test(p[3]) && !p.slice(4).some(a => a.startsWith('-')) && [...p.slice(4).join(' ')].length <= 60; }
  if (script === 'fun_grudge.py') return args.length >= 4 && args[0] === 'add' && FUN_ID.test(args[1]) && FUN_ID.test(args[2]) && !args.slice(3).some(a => a.startsWith('-')) && [...args.slice(3).join(' ')].length <= 200;
  return false;
}
export function commandAllowed(params, io = fs) {
  const tokens = commandTokens(params); if (!tokens) return false;
  const root = realPath(WORKSPACE, io); if (!root) return false;
  const p = params || {}; const cwdRaw = p.workdir ?? p.cwd ?? p.input?.workdir ?? p.tool_input?.cwd ?? p.arguments?.cwd ?? WORKSPACE;
  // Untrusted environment / execution-host overrides can change the interpreter or injected libraries.
  if ((p.env && Object.keys(p.env).length) || (p.input?.env && Object.keys(p.input.env).length) || p.elevated === true || p.host || p.user || p.username || p.sandbox_permissions) return false;
  if (typeof cwdRaw !== 'string' || !path.posix.isAbsolute(cwdRaw)) return false;
  const cwd = realPath(cwdRaw, io); if (!cwd || !contained(root, cwd)) return false;
  let offset = 0;
  if (['python3', 'python', '/usr/bin/python3'].includes(tokens[0])) offset = 1;
  let prog = tokens[offset]; if (!prog) return false;
  if (offset && /^~\/\.openclaw\/workspace\/scripts\/fun_(?:followup|mbti|grudge)\.py$/.test(prog)) prog = WORKSPACE + prog.slice('~/.openclaw/workspace'.length); /* HOSINO-FUN-SCRIPTS v1: 只给三个 fun 脚本认 ~ 前缀（bash 展开后是同一个文件） */
  const args = tokens.slice(offset + 1);
  if (!offset && prog === 'cat') return args.length > 0 && args.every(v => {
    if (!/^(?:docs\/[^/]+\.md|scripts\/README-[^/]+\.md)$/.test(path.posix.relative(WORKSPACE, path.posix.resolve(cwdRaw, v)))) return false;
    const resolved = realPath(path.posix.resolve(cwdRaw, v), io); return resolved && contained(root, resolved);
  });
  if (!offset && prog === 'ls') return args.every(v => /^-[alhFd]+$/.test(v) || (() => {
    const candidate = path.posix.resolve(cwdRaw, v); const rel = path.posix.relative(WORKSPACE, candidate);
    const resolved = realPath(candidate, io); return ['stickers', 'docs', 'media/tool-image-generation'].includes(rel) && resolved && contained(root, resolved);
  })());
  const requested = path.posix.resolve(cwdRaw, prog); const relative = path.posix.relative(WORKSPACE, requested);
  const target = realPath(requested, io); if (!target || !contained(root, target)) return false;
  // Require the canonical script path: a workspace symlink cannot select another trusted script or external code.
  const intended = path.posix.join(root, relative); if (target !== intended) return false;
  const script = relative.replace(/^scripts\//, '');
  if (relative !== 'scripts/' + script || script.includes('/')) return false;
  if (schemas[script]) {
    if (!offset) return false;
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) return true;
    return argsAllowed(args, schemas[script], io);
  }
  if (script === 'sticker_manager.py') {
    if (!offset) return false;
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) return true;
    const action = args[0]; if (!['get', 'find', 'list', 'prompt', 'models'].includes(action)) return false;
    const key = args[1]; if (key && (!/^[^/\\.\0]{1,100}$/.test(key) || key.startsWith('-'))) return false;
    const schema = action === 'get' ? { values: ['--model'], flags: [], positions: [1, 2] } : { values: [], flags: [], positions: action === 'models' ? [0, 0] : action === 'list' ? [0, 1] : [1, 1] };
    return argsAllowed(args.slice(1), schema, io);
  }
  if (script === 'fun_followup.py' || script === 'fun_mbti.py' || script === 'fun_grudge.py') return funScriptArgsAllowed(script, offset, args); /* HOSINO-FUN-SCRIPTS v1 */
  // Legacy JM authorization is retained. No JM script or business behavior is changed by this patch.
  if (script === 'run_jm.sh') return !offset && args[0] === 'adapter' && !args.some(v => /^--(?:out|send-qq)(?:=|$)/.test(v));
  return false;
}


// Correct private-chat wording while retaining existing group refusal text verbatim.
function privateDenial(reason, sk, state) {
  if (isQQGroup(sk)) return reason;
  if (reason === '此工具只对主人开放') {
    if (state?.how === 'missing-requester') return '缺少本轮可信QQ发言人身份，无法确认主人授权；此工具只对主人开放';
    if (state?.how === 'system-trigger') return '系统触发回合不继承QQ主人权限；此工具只对主人开放';
    if (state?.how === 'current-non-owner') return '本轮QQ发言人未通过主人校验；此工具只对主人开放';
  }
  return reason.replaceAll('群成员', '非主人QQ用户');
}

export function createExecutionGuard({ loadConfig, extraOwners = [], io = fs, now = Date.now, logDecision, resolveRestartRequester }) {
  const pending = new Map(); const processes = new Map(); const maxEntries = 2048; const ttl = 30 * 60_000;
  const trim = map => { const cutoff = now() - ttl; for (const [key, record] of map) if (record.at < cutoff) map.delete(key); while (map.size > maxEntries) map.delete(map.keys().next().value); };
  function authority(ctx) {
    const config = loadConfig(); const owners = new Set([...(config?.commands?.ownerAllowFrom || []), ...extraOwners].map(normId).filter(Boolean));
    let state = requesterState(ctx, owners);
    // Only a host-admitted, current, exact recovery run may restore its original QQ requester.
    // The resolver never grants owner itself: the current configured roster is checked again here.
    if (!state.owner && typeof resolveRestartRequester === 'function' && !SYSTEM_TRIGGERS.has(String(ctx?.trigger ?? '').toLowerCase()) && !SYSTEM_TRIGGERS.has(String(ctx?.requester?.trigger ?? '').toLowerCase())) {
      try {
        const source = resolveRestartRequester(ctx);
        const sender = normId(source?.senderId);
        const recoveryOwners = new Set([...(config?.commands?.ownerAllowFrom || []), ...(config?.plugins?.entries?.['qq-group-owner-guard']?.config?.ownerIds || [])].map(normId).filter(Boolean));
        if (source?.ownerAdmitted === true && sender && recoveryOwners.has(sender)) state = { owner: true, id: sender, how: 'validated-restart-source', trigger: 'user' };
      } catch { /* Missing, expired or revoked recovery evidence cannot grant authority. */ }
    }
    return { config, state };
  }
  function policiesFor(config, sk, ctx, state) {
    // The two explicitly configured groups use requester checks at execution.
    // Channel-wide disable remains authoritative; other groups keep their original deny policy.
    const ownerFullGroup = state?.owner === true && state.trigger === 'user' && isQQFullCatalogGroup(config, sk);
    const accountId = ctx?.requester?.accountId; const qq = config?.channels?.qqbot || {};
    const account = accountId && qq.accounts?.[accountId]; const groupId = String(sk).match(/:qqbot:group:([^:]+)/i)?.[1];
    const policies = [];
    for (const source of [qq, account].filter(Boolean)) {
      const wildcard = isQQGroup(sk) ? source.groups?.['*'] : null; const exactKey = Object.keys(source.groups || {}).find(k => k !== '*' && k.toLowerCase() === String(groupId || '').toLowerCase());
      for (const entry of [wildcard, exactKey ? source.groups[exactKey] : null].filter(Boolean)) if (!ownerFullGroup && entry.tools) policies.push(entry.tools);
      // New explicit channel policy is enforced only at invocation, preserving catalog stability.
      if (source.toolPolicy === 'none') policies.push({ deny: ['*'] });
    }
    return policies;
  }
  function remember(event, ctx, state) {
    const id = event?.toolCallId || ctx?.toolCallId; const run = ctx?.runId || event?.runId;
    if (id && run) { trim(pending); pending.set(`${run}|${id}`, { sk: String(ctx?.sessionKey || event?.sessionKey || ''), run, state, tool: String(event.toolName || ''), at: now() }); }
  }
  function registerNativeProcess(ctx, id) {
    if (!['string', 'number'].includes(typeof id) || !String(id) || String(id).length > 128) return;
    // A recycled native ID first revokes an older receipt, including when the new origin is unknown.
    processes.delete(String(id));
    if (!isQQConversation(ctx?.sessionKey, ctx)) return;
    const { state } = authority(ctx); if (!state.id) return;
    trim(processes); processes.set(String(id), { sk: String(ctx.sessionKey), sender: state.id, run: ctx.runId, at: now() });
  }
  function forgetNativeProcess(id) { processes.delete(String(id)); }
  function after(event, ctx) {
    const key = `${ctx?.runId || event?.runId}|${event?.toolCallId || ctx?.toolCallId}`; const record = pending.get(key); pending.delete(key);
    if (!record || event.error || event.result?.isError || !record.state.id || (ctx?.sessionKey && String(ctx.sessionKey) !== record.sk)) return;
    // Only structured executor metadata, never a string printed by a script, establishes process ownership.
    const result = event.result; const id = result?.details?.sessionId ?? result?.details?.session_id ?? result?.session_id ?? result?.sessionId;
    if (['string', 'number'].includes(typeof id) && String(id) && String(id).length <= 128 && toolCandidates(record.tool).some(n => SHELL.has(n))) {
      trim(processes); processes.set(String(id), { sk: record.sk, sender: record.state.id, run: record.run, at: now() });
    }
    const polled = event.params?.session_id ?? event.params?.sessionId;
    if (polled !== undefined && (result?.details?.exitCode !== undefined || result?.details?.exit_code !== undefined || result?.exit_code !== undefined || ['completed', 'exited', 'closed'].includes(result?.details?.status))) forgetNativeProcess(polled);
  }
  function beforeDecision(event, ctx, captureAuthority) {
    const sk = String(ctx?.sessionKey || event?.sessionKey || ''); if (!isQQConversation(sk, ctx)) return;
    const names = toolCandidates(event?.toolName); const params = event?.params || {};
    let capturedState;
    const deny = reason => ({ block: true, blockReason: privateDenial(reason, sk, capturedState) + '（qq-group-owner-guard v2）' });
    try {
      const { config, state } = authority(ctx);
      capturedState = state; captureAuthority({ config, state });
      for (const policy of policiesFor(config, sk, ctx, state)) {
        const notDenied = createToolPolicyMatcher({ deny: policy.deny });
        const matches = createToolPolicyMatcher(policy);
        if (names.some(name => !notDenied(name)) || !names.some(name => matches(name))) return deny('该QQ会话显式工具策略禁止此调用');
      }
      const isCode = String(event?.toolKind || ctx?.toolKind || '') === 'code_mode_exec' || (names.includes('exec') && commandTokens(params) === null && (typeof params.input === 'string' || typeof params.code === 'string'));
      const sessionId = params.session_id ?? params.sessionId ?? params.input?.session_id ?? params.input?.sessionId;
      const isPoll = names.some(n => POLL.has(n)) || (sessionId !== undefined && names.some(n => SHELL.has(n)) && !isCode && commandTokens(params) === null);
      if (isPoll) {
        trim(processes); const record = processes.get(String(sessionId));
        if (!record || !state.id || record.sk !== sk || record.sender !== state.id) return deny('只能轮询本会话、本次可信发言人所属的进程');
        if (!state.owner && String(params.chars ?? params.input?.chars ?? '') !== '') return deny('群成员只能读取已有任务结果，不能写入进程stdin');
        if (!state.owner && params.action !== undefined && !['poll', 'log'].includes(params.action)) return deny('群成员只能读取已有任务结果，不能修改进程状态');
        record.at = now(); remember(event, ctx, state); return;
      }
      if (state.owner) { remember(event, ctx, state); return; }
      if (isBlockedForNonOwner(event?.toolName) && !isCode) return deny('此工具只对主人开放');
      if (isCode) {
        const code = String(params.input ?? params.code ?? params.source ?? params.script ?? '');
        // Static rejection is supplemental. Every actual nested invocation still runs this execution hook.
        if (/tools\s*\[|\beval\s*\(|\bFunction\s*\(|require\s*\(|import\s*\(/.test(code)) return deny('群成员动态代码调用需要使用受支持的固定工具入口');
        for (const m of code.matchAll(/tools\s*\.\s*([A-Za-z0-9_]+)\s*\(/g)) if (isBlockedForNonOwner(m[1]) && !toolCandidates(m[1]).some(n => POLL.has(n))) return deny('嵌套调用包含主人专属工具');
        remember(event, ctx, state); return;
      }
      if ((names.some(n => SHELL.has(n)) || /shell|exec/i.test(String(event?.toolName))) && !commandAllowed(params, io)) return deny('群成员命令、参数或真实路径不符合语音、搜索、表情及现有JM白名单');
      remember(event, ctx, state);
    } catch { return deny('执行权限策略无法验证'); }
  }
  // QQ-AUTHORITY-DECISION-OBSERVATION v1. Diagnostic data never grants authority.
  const observedRuns = new Map(); const observationTtl = 30 * 60_000;
  let observationWindow = -1; let observationCount = 0;
  const hash = value => typeof value === 'string' && value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
  const triggerLabel = value => {
    const label = String(value ?? '').toLowerCase();
    return !label ? 'absent' : label === 'user' || SYSTEM_TRIGGERS.has(label) ? label : 'other';
  };
  const reasonCode = result => {
    const text = String(result?.blockReason ?? '');
    if (!result?.block) return 'allowed';
    for (const [code, prefix] of [
      ['explicit-policy', '该QQ会话显式工具策略禁止此调用'],
      ['process-origin', '只能轮询本会话、本次可信发言人所属的进程'],
      ['process-stdin', '只能读取已有任务结果，不能写入进程stdin'],
      ['process-mutation', '只能读取已有任务结果，不能修改进程状态'],
      ['owner-required', '此工具只对主人开放'],
      ['owner-required', '缺少本轮可信QQ发言人身份'],
      ['owner-required', '系统触发回合不继承QQ主人权限'],
      ['owner-required', '本轮QQ发言人未通过主人校验'],
      ['nested-owner-tool', '嵌套调用包含主人专属工具'],
      ['dynamic-code', '动态代码调用需要使用受支持的固定工具入口'],
      ['command-recipe', '命令、参数或真实路径不符合语音、搜索、表情及现有JM白名单'],
      ['unverifiable', '执行权限策略无法验证'],
    ]) if (text.includes(prefix)) return code;
    return 'other-denial';
  };
  function observeDecision(event, ctx, result, captured) {
    if (typeof logDecision !== 'function') return;
    try {
      const sk = String(ctx?.sessionKey || event?.sessionKey || '');
      if (!isQQConversation(sk, ctx)) return;
      const at = now(); const window = Math.floor(at / 60_000);
      if (window !== observationWindow) { observationWindow = window; observationCount = 0; }
      for (const [key, entry] of observedRuns) if (at - entry.at >= observationTtl) observedRuns.delete(key);
      const requester = ctx?.requester;
      const sessionHash = hash(sk); const runHash = hash(ctx?.runId || event?.runId);
      const senderHash = hash(normId(requester?.senderId));
      const accountHash = hash(requester?.accountId); const sourceHash = hash(requester?.sourceMessageId);
      const key = JSON.stringify([sessionHash, runHash, ...(runHash ? [] : [senderHash, accountHash, sourceHash])]);
      let entry = observedRuns.get(key);
      if (!entry) { entry = { at, denials: 0, first: true }; observedRuns.set(key, entry); }
      while (observedRuns.size > 512) observedRuns.delete(observedRuns.keys().next().value);
      const first = entry.first; entry.first = false;
      if (!first && (!result?.block || entry.denials >= 8)) return;
      if (observationCount >= 240) return;
      if (result?.block) entry.denials++;
      observationCount++;
      const state = captured?.state;
      const ownerId = normId(requester?.senderId || (state?.how === 'validated-restart-source' ? state.id : ''));
      const diagnosticExtraOwners = state?.how === 'validated-restart-source' ? (captured.config?.plugins?.entries?.['qq-group-owner-guard']?.config?.ownerIds || []) : extraOwners;
      const owners = captured ? new Set([...(captured.config?.commands?.ownerAllowFrom || []), ...diagnosticExtraOwners].map(normId).filter(Boolean)) : null;
      const tool = toolCandidates(event?.toolName).find(name => BLOCKED.has(name) || SHELL.has(name) || POLL.has(name) || ['message', 'read', 'read_file', 'web_search', 'web_fetch', 'qq_create_text_file'].includes(name)) || 'other';
      logDecision(Object.freeze({
        schema: 'qq-authority-decision-v1', stage: 'execution', event: first ? 'first-decision' : 'denied',
        decision: result?.block ? 'deny' : 'allow', reasonCode: reasonCode(result),
        sessionHash, runHash, sourceHash, senderHash, accountHash,
        routeKind: isQQGroup(sk) ? 'group' : isQQDirect(sk) ? 'direct' : /:main$/i.test(sk) ? 'main' : 'other-qq',
        requesterPresent: Boolean(requester),
        ownerFlag: requester?.senderIsOwner === true ? 'true' : requester?.senderIsOwner === false ? 'false' : 'unset',
        ownerMatched: owners ? Boolean(ownerId && owners.has(ownerId)) : null,
        owner: state?.owner === true,
        how: ['system-trigger', 'missing-requester', 'current-requester', 'current-non-owner', 'validated-restart-source'].includes(state?.how) ? state.how : 'unverifiable',
        trigger: triggerLabel(state?.trigger), ctxTrigger: triggerLabel(ctx?.trigger), requesterTrigger: triggerLabel(requester?.trigger),
        tool,
      }));
    } catch { /* Logging, hashing and diagnostic config must never change a tool decision. */ }
  }
  function before(event, ctx) {
    let captured;
    const result = beforeDecision(event, ctx, value => { captured = value; });
    observeDecision(event, ctx, result, captured);
    return result;
  }
  return { before, after, registerNativeProcess, forgetNativeProcess, authority, stop: () => { pending.clear(); processes.clear(); observedRuns.clear(); } };
}

export function startNumericMetrics(stateDirectory, logger, options = {}) {
  if (options.enabled === false || !isMainThread || !process.argv.some(arg => arg === 'gateway')) return () => {};
  const metricsKey = Symbol.for('openclaw.qqRuntimeNumericMetrics');
  if (globalThis[metricsKey]?.stop) return globalThis[metricsKey].stop;
  const stats = { startedAtMs: Date.now(), gcCount: 0, gcDurationMs: 0, gcMajorCount: 0, gcMinorCount: 0 };
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) {
    stats.gcCount++; stats.gcDurationMs += entry.duration;
    const kind = entry.detail?.kind; if (kind === 4) stats.gcMajorCount++; if (kind === 1) stats.gcMinorCount++;
  } });
  observer.observe({ entryTypes: ['gc'] });
  const loop = monitorEventLoopDelay({ resolution: 100 }); loop.enable();
  const interval = setInterval(() => {
    try {
      const memory = process.memoryUsage(); const target = path.join(stateDirectory, 'state', 'runtime-numeric-metrics.json');
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = target + '.' + process.pid + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ schemaVersion: 1, atMs: Date.now(), measuredAtUnix: Date.now() / 1000, pid: process.pid, ...stats, rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers, eventLoopDelayP95Ms: loop.percentile(95) / 1e6, cpuUsageMicros: process.cpuUsage() }) + '\n', { mode: 0o600 });
      fs.chmodSync(temp, 0o600); fs.renameSync(temp, target);
      loop.reset();
    } catch { logger?.warn?.('[qq-group-owner-guard] numeric-metrics write failed'); }
  }, 60_000); interval.unref();
  const record = { stop: () => { clearInterval(interval); observer.disconnect(); loop.disable(); if (globalThis[metricsKey] === record) delete globalThis[metricsKey]; } };
  globalThis[metricsKey] = record;
  return record.stop;
}
