// QQ-READ-CAPABILITIES v1. Exact files, current host requester, no directory grants.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { commandAllowed, commandTokens, isQQConversation, toolCandidates, WORKSPACE } from './execution-policy.mjs';
import { qqMediaReferences } from './qq-tag-references.mjs';

const READ_TOOLS = new Set(['read', 'read_file', 'view_image', 'image', 'images', 'image_understand']);
const SEND_TOOLS = new Set(['message', 'send_message', 'qqbot_send', 'send_media']);
const ENUMERATE_TOOLS = new Set(['ls', 'list_directory', 'glob', 'find_files', 'search_files', 'grep', 'rg']);
const DELEGATE_TOOLS = new Set(['sessions_spawn', 'subagents', 'spawn_agent', 'agent', 'sessions_send']);
const GENERATE_TOOLS = new Set(['tts', 'generate_image', 'image_generate', 'imagegen', 'image_generation']);
const MEDIA_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|mp3|wav|ogg|silk|amr|m4a|mp4|webm)$/i;
const remote = value => /^https?:\/\//i.test(value);
function contained(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); }
function localPath(value, cwd = WORKSPACE) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null;
  let v = value.trim(); if (remote(v)) return null;
  if (/^file:/i.test(v)) { try { const u = new URL(v); if (u.hostname && u.hostname !== 'localhost') return null; v = decodeURIComponent(u.pathname); } catch { return null; } }
  if (/^[a-z]+:/i.test(v) && !/^[a-z]:[\\/]/i.test(v)) return null;
  if (v.startsWith('~/')) v = '/home/ubuntu/' + v.slice(2);
  return path.resolve(cwd, v);
}
function fileIdentity(filename, io) {
  try {
    const actual = String(io.realpathSync(filename)); const info = io.statSync(actual); if (!info.isFile()) return null;
    return { path: actual, size: info.size, mtimeMs: info.mtimeMs, ino: info.ino, dev: info.dev };
  } catch { return null; }
}
function sameFile(a, b) { return Boolean(a && b && a.path === b.path && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev); }
function obviousCredential(text) {
  const assignments = /(?:\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret|authorization)\b|密码|密钥|令牌|口令)["']?\s*[:=是]\s*["']?(?:Bearer\s+)?([A-Za-z0-9_.\-/]{12,})/gi;
  for (const match of text.matchAll(assignments)) if (!/^(?:process\.env\.|os\.environ|os\.getenv|env\.|YOUR_|REPLACE_|EXAMPLE_)/i.test(match[1])) return true;
  return /\b(?:sk-|xai-|gsk_|AIza)[A-Za-z0-9_-]{20,}/.test(text);
}
function scriptOf(tokens) {
  if (!tokens?.length) return null; const offset = ['python', 'python3', '/usr/bin/python3'].includes(tokens[0]) ? 1 : 0;
  const script = path.posix.relative(WORKSPACE, path.posix.resolve(WORKSPACE, tokens[offset]));
  return { script, args: tokens.slice(offset + 1), offset };
}
function expectedScriptOutput(params) {
  const command = scriptOf(commandTokens(params)); if (!command) return null;
  const known = new Set(['scripts/xingye_voice.py', 'scripts/xingye_tts.py', 'scripts/mimo_tts.py', 'scripts/sticker_manager.py']);
  if (!known.has(command.script)) return null;
  let output = null; let format = 'wav';
  for (let i = 0; i < command.args.length; i++) {
    const a = command.args[i]; if (a === '--out') output = command.args[++i]; else if (a.startsWith('--out=')) output = a.slice(6);
    else if (a === '--format') format = command.args[++i]; else if (a.startsWith('--format=')) format = a.slice(9);
  }
  if (!output && command.script === 'scripts/xingye_tts.py') output = '/tmp/xingye_tts_out.' + format;
  if (!output && command.script === 'scripts/mimo_tts.py') output = '/tmp/mimo_out.wav';
  return { ...command, output };
}
function structuredMediaPaths(result) {
  const roots = [result, result?.details, result?.structuredContent].filter(v => v && typeof v === 'object'); const out = [];
  for (const value of roots) for (const key of ['path', 'out', 'mediaPath', 'mediaUrl', 'filePath', 'outputPath']) if (typeof value[key] === 'string') out.push(value[key]);
  for (const value of roots) for (const key of ['mediaPaths', 'mediaUrls', 'attachments']) if (Array.isArray(value[key])) for (const item of value[key]) {
    if (typeof item === 'string') out.push(item);
    else if (item && typeof item === 'object') for (const field of ['path', 'mediaPath', 'mediaUrl', 'filePath']) if (typeof item[field] === 'string') out.push(item[field]);
  }
  return out;
}
function scriptJsonPaths(result) {
  // Only called for a command already approved by the execution whitelist. Identity never comes from stdout.
  const texts = [result?.stdout, result?.output, typeof result === 'string' ? result : null];
  for (const item of result?.content || []) if (item?.type === 'text') texts.push(item.text);
  const paths = [];
  for (const text of texts) if (typeof text === 'string' && text.length <= 100000) for (const line of text.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try { const payload = JSON.parse(line); if (payload.status === 'ok') for (const field of ['out', 'path']) if (typeof payload[field] === 'string') paths.push(payload[field]); } catch { /* no candidate */ }
  }
  return paths;
}
function fileArguments(params, fields) {
  const values = []; const visit = v => { if (typeof v === 'string') values.push(v); else if (Array.isArray(v)) for (const item of v) visit(item); else if (v && typeof v === 'object') for (const key of ['path', 'filePath', 'file_path', 'url', 'mediaUrl', 'localPath', 'file', 'image_url', 'image']) if (v[key] !== undefined) visit(v[key]); };
  for (const field of fields) if (params?.[field] !== undefined) visit(params[field]);
  return values;
}
function unverifiedBytes(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return false;
  for (const [key, child] of Object.entries(value)) {
    if (['buffer', 'fileData', 'file_data', 'base64', 'bytes'].includes(key) && child !== undefined) return true;
    if (child && typeof child === 'object' && unverifiedBytes(child, depth + 1)) return true;
  }
  return false;
}

export function createReadCapabilityGuard({ executionGuard, loadDocuments, io = fs, now = Date.now, mediaRoots = ['/home/ubuntu/.openclaw/media', WORKSPACE + '/stickers', WORKSPACE + '/media/tool-image-generation', '/tmp'] }) {
  const grants = new Map(); const pending = new Map(); const runs = new Map(); const seeds = new Map(); const publicCache = new Map(); const max = 2048; const ttl = 30 * 60_000;
  const trim = map => { for (const [key, value] of map) if (now() - value.at > ttl) map.delete(key); while (map.size > max) map.delete(map.keys().next().value); };
  const keyFor = (ctx, sender) => `${ctx.sessionKey}|${ctx.runId || ''}|${sender}`;
  function publicDocument(filename) {
    const actual = fileIdentity(filename, io); if (!actual) return false;
    for (const item of loadDocuments()?.documents || []) {
      if (typeof item?.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) continue;
      if (!/\.md$/i.test(item.path) || /(?:^|[\\/])(?:USER|MEMORY|IDENTITY|SOUL|TOOLS|AGENTS)\.md$/i.test(item.path)) continue;
      const approved = fileIdentity(item.path, io); if (!approved || actual.path !== approved.path) continue;
      const cached = publicCache.get(actual.path); if (sameFile(cached?.identity, actual) && cached.sha256 === item.sha256) return true;
      const content = io.readFileSync(actual.path); if (content.length > 1024 * 1024 || obviousCredential(content.toString('utf8'))) return false;
      const digest = crypto.createHash('sha256').update(content).digest('hex');
      if (digest !== item.sha256) return false;
      publicCache.set(actual.path, { identity: actual, sha256: digest }); return true;
    }
    return false;
  }
  function registerAsset(ctx, filename, { freshAfter = null } = {}) {
    if (!isQQConversation(ctx?.sessionKey, ctx) || !ctx?.runId) return false;
    const state = executionGuard.authority(ctx).state; if (!state.id || state.trigger === 'heartbeat' || state.trigger === 'cron') return false;
    const requested = localPath(filename); const actual = requested && fileIdentity(requested, io); if (!actual) return false;
    const rootAllowed = mediaRoots.some(root => { try { return contained(String(io.realpathSync(root)), actual.path); } catch { return false; } });
    if (!rootAllowed || (freshAfter !== null && actual.mtimeMs < freshAfter - 1000)) return false;
    trim(grants); const key = keyFor(ctx, state.id); const entry = grants.get(key) || { files: new Map(), at: now() };
    entry.files.set(actual.path, actual); while (entry.files.size > 128) entry.files.delete(entry.files.keys().next().value); entry.at = now(); grants.set(key, entry); return true;
  }
  function importCurrentAssets(ctx) {
    // This field is populated only by the host run's MediaFact.path snapshot. No body/path parsing here.
    const state = executionGuard.authority(ctx).state; if (!state.id || !ctx?.runId) return;
    trim(seeds); const key = keyFor(ctx, state.id); if (seeds.has(key)) return;
    seeds.set(key, { at: now() });
    for (const asset of (ctx?.requester?.readAssets || []).slice(0, 128)) if (typeof asset === 'string') registerAsset(ctx, asset);
  }
  function registerReadContext(ctx) {
    if (!isQQConversation(ctx?.sessionKey, ctx) || !ctx?.runId) return;
    const state = executionGuard.authority(ctx).state;
    if (!state.id || ['heartbeat', 'cron', 'automation', 'schedule', 'memory'].includes(state.trigger)) return;
    const snapshot = structuredClone({ sessionKey: ctx.sessionKey, runId: ctx.runId, requester: ctx.requester });
    trim(runs); runs.set(`${ctx.sessionKey}|${ctx.runId}`, { ctx: snapshot, at: now() }); importCurrentAssets(snapshot);
  }
  function isAllowed(filename, ctx, purpose) {
    const requested = localPath(filename); const actual = requested && fileIdentity(requested, io); if (!actual) return false;
    if (purpose === 'read' && publicDocument(requested)) return true;
    const state = executionGuard.authority(ctx).state; if (!state.id) return false;
    trim(grants); const grant = grants.get(keyFor(ctx, state.id)); return sameFile(grant?.files.get(actual.path), actual);
  }
  function before(event, ctx) {
    if (!isQQConversation(ctx?.sessionKey || event?.sessionKey, ctx)) return;
    const deny = reason => ({ block: true, blockReason: reason + '（QQ-READ-CAPABILITIES v1）' });
    try {
      const state = executionGuard.authority(ctx).state; if (state.owner) return;
      importCurrentAssets(ctx); const names = toolCandidates(event?.toolName); const p = event?.params || {};
      if (names.some(n => DELEGATE_TOOLS.has(n))) return deny('非主人QQ用户当前不能委派到其他会话；请使用本会话的搜索、图像和语音工具');
      if (names.some(n => ENUMERATE_TOOLS.has(n))) return deny('非主人QQ用户不列举或搜索主机目录；请读取已公开技能文档或已验证附件');
      if (names.some(n => READ_TOOLS.has(n))) {
        const candidates = fileArguments(p, ['path', 'file_path', 'filePath', 'image', 'images', 'imagePath', 'image_path', 'url', 'localPath']);
        if (!candidates.length) return deny('读取缺少明确文件来源');
        for (const candidate of candidates) if (!remote(candidate) && !isAllowed(candidate, ctx, names.includes('read') || names.includes('read_file') ? 'read' : 'media')) return deny('只可读取公开技能文档和本次会话可信附件或生成资产');
      }
      if (names.some(n => GENERATE_TOOLS.has(n))) for (const candidate of fileArguments(p, ['image', 'images', 'input_images', 'inputImages', 'reference_images', 'referenceImages', 'referenced_image_paths'])) if (!remote(candidate) && !isAllowed(candidate, ctx, 'media')) return deny('生成或编辑图片的本地输入也须为本次可信资产');
      if (names.some(n => SEND_TOOLS.has(n))) {
        if (unverifiedBytes(p)) return deny('非主人QQ用户发送文件必须引用已验证资产');
        const candidates = fileArguments(p, ['media', 'mediaUrl', 'mediaUrls', 'mediaPath', 'mediaPaths', 'path', 'filePath', 'file_path', 'file', 'fileUrl', 'localPath', 'attachments', 'image', 'images']);
        for (const candidate of candidates) if (!remote(candidate) && !isAllowed(candidate, ctx, 'media')) return deny('本地媒体外发仅允许本次可信附件或已验证生成资产');
        const text = p.text ?? p.message ?? p.content;
        if (typeof text === 'string') for (const candidate of qqMediaReferences(text)) if (!remote(candidate) && !isAllowed(candidate, ctx, 'media')) return deny('文本中的本地媒体引用也必须属于本次可信资产');
      }
      const tokens = commandTokens(p);
      if (tokens && names.some(n => ['exec', 'exec_command', 'bash', 'shell', 'local_shell', 'unified_exec', 'container.exec'].includes(n)) && typeof ctx?.cwd === 'string' && !commandAllowed({ ...p, workdir: ctx.cwd }, io)) return deny('原生执行的真实cwd或相对脚本路径不在非主人QQ用户白名单内');
      if (tokens?.[0] === 'ls') return deny('非主人QQ用户使用公开技能索引和表情库脚本，无需列举主机目录');
      if (tokens?.[0] === 'cat') for (const arg of tokens.slice(1)) if (!isAllowed(path.posix.resolve(p.workdir ?? p.cwd ?? WORKSPACE, arg), ctx, 'read')) return deny('cat只可读取公开文档和本次可信附件');
      const callId = event?.toolCallId || ctx?.toolCallId; const runId = ctx?.runId || event?.runId;
      if (callId && runId) { trim(pending); pending.set(`${runId}|${callId}`, { ctx: structuredClone({ sessionKey: ctx.sessionKey, runId, requester: ctx.requester }), at: now(), names, script: expectedScriptOutput(p) }); }
    } catch { return deny('文件读取或资产来源无法验证'); }
  }
  function after(event, ctx) {
    const key = `${ctx?.runId || event?.runId}|${event?.toolCallId || ctx?.toolCallId}`; const record = pending.get(key); pending.delete(key);
    if (!record || event.error || event.result?.isError || event.result?.error || event.result?.details?.error || (ctx?.sessionKey && record.ctx.sessionKey !== ctx.sessionKey)) return;
    const details = event.result?.details; if (details?.exitCode !== undefined && details.exitCode !== null && details.exitCode !== 0) return;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(String(details?.status ?? event.result?.status ?? '').toLowerCase())) return;
    const isGenerated = record.names.some(n => GENERATE_TOOLS.has(n));
    if (isGenerated) for (const filename of structuredMediaPaths(event.result)) if (MEDIA_EXTENSIONS.test(filename)) registerAsset(record.ctx, filename, { freshAfter: record.at });
    if (!record.script) return;
    for (const filename of scriptJsonPaths(event.result)) {
      if (!MEDIA_EXTENSIONS.test(filename)) continue;
      const script = record.script;
      const allowed = script.output ? path.resolve(filename) === path.resolve(script.output) : script.script === 'scripts/xingye_voice.py' ? /^\/tmp\/xingye_voice_\d+\.mp3$/.test(filename) : script.script === 'scripts/sticker_manager.py' && ['get', 'find'].includes(script.args[0]) && filename.startsWith(WORKSPACE + '/stickers/');
      if (allowed) registerAsset(record.ctx, filename, { freshAfter: script.script === 'scripts/sticker_manager.py' ? null : record.at });
    }
  }
  function reply(event, ctx) {
    const sessionKey = event?.sessionKey || ctx?.sessionKey; const replyRun = event?.runId || ctx?.runId;
    if (!isQQConversation(sessionKey, { ...ctx, channel: event?.channel ?? ctx?.channel }) && !(replyRun && runs.has(`${sessionKey}|${replyRun}`))) return;
    const payload = event?.payload || {}; const sources = [...fileArguments(payload, ['mediaUrl', 'mediaUrls', 'attachments', 'path', 'filePath']), ...qqMediaReferences(payload.text || '')].filter(v => !remote(v));
    if (!sources.length) return;
    try {
      trim(runs); const run = event?.runId || ctx?.runId; const record = run && runs.get(`${sessionKey}|${run}`);
      if (!record) return { cancel: true, reason: '本地媒体缺少可信run归属（QQ-READ-CAPABILITIES v1）' };
      if (executionGuard.authority(record.ctx).state.owner) return;
      for (const candidate of sources) if (!isAllowed(candidate, record.ctx, 'media')) return { cancel: true, reason: '最终回复只可发送本次可信资产（QQ-READ-CAPABILITIES v1）' };
    } catch { return { cancel: true, reason: '最终媒体来源无法验证（QQ-READ-CAPABILITIES v1）' }; }
  }
  return { before, after, registerReadContext, registerAsset, reply, stop() { grants.clear(); pending.clear(); runs.clear(); seeds.clear(); publicCache.clear(); } };
}
