// QQ-TEXT-FILE-TOOL v1. Creates new UTF-8 data; never executes or reads user paths.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const QQ_TEXT_FILE_TOOL = 'qq_create_text_file';
export const QQ_TEXT_FILE_MAX_BYTES = 256 * 1024;
const GROUPS = new Set(['379363a480715dfc01f13aaf92571111', 'b4ee2a7019c96343c96eeba8cb63d8c5']);
const TTL = 60_000;
const MAX_RECEIPTS = 1024;
const TOOL_NAMES = new Set([QQ_TEXT_FILE_TOOL, 'openclaw__' + QQ_TEXT_FILE_TOOL, 'mcp__openclaw__' + QQ_TEXT_FILE_TOOL, 'openclaw_direct__' + QQ_TEXT_FILE_TOOL, 'functions.' + QQ_TEXT_FILE_TOOL, 'functions.openclaw__' + QQ_TEXT_FILE_TOOL]);
const normalizeId = value => String(value ?? '').replace(/^qqbot:/i, '').replace(/^(id|channel:qqbot):/i, '').trim().toUpperCase();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const groupOf = sk => {
  if (typeof sk !== 'string') return null;
  const match = sk.match(/^agent:main:qqbot:group:([a-f0-9]{32})$/);
  return match && GROUPS.has(match[1]) ? match[1] : null;
};
const refusal = reason => ({ block: true, blockReason: 'QQ 文本文件：' + reason });
function failed(reason) {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'refused', reason }) }], details: { status: 'refused', reason } };
}
function sameIdentity(a, b) { return Boolean(a && b && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs); }
function validParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length !== 2 || !Object.hasOwn(params, 'filename') || !Object.hasOwn(params, 'content')) return null;
  const { filename, content } = params;
  if (typeof filename !== 'string' || !filename || filename.trim() !== filename || filename.startsWith('.') || /[\/\\<>:"|?*\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(filename) || path.basename(filename) !== filename || Buffer.byteLength(filename, 'utf8') > 128 || !/\.(?:txt|md)$/i.test(filename)) return null;
  if (typeof content !== 'string' || !content.length || content.includes('\0')) return null;
  const bytes = Buffer.from(content, 'utf8');
  if (!bytes.length || bytes.length > QQ_TEXT_FILE_MAX_BYTES || bytes.toString('utf8') !== content) return null;
  const mimeType = /\.md$/i.test(filename) ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
  return { filename, bytes, mimeType, sha256: digest(bytes) };
}

export function createQQTextFileService({ executionGuard, readGuard, io = fs, now = Date.now, root = '/home/ubuntu/.openclaw/media/qq-text-files' } = {}) {
  if (typeof executionGuard?.authority !== 'function' || typeof executionGuard?.before !== 'function' || typeof readGuard?.registerAsset !== 'function' || typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('QQ_TEXT_FILE_HOST_DEPENDENCIES_REQUIRED');
  const rootPath = path.resolve(root);
  const receipts = new Map();
  let active = true;
  function currentTime() { const value = now(); if (!Number.isFinite(value) || value <= 0) throw new Error('QQ_TEXT_FILE_CLOCK_UNAVAILABLE'); return value; }
  function trim(at) { for (const [key, value] of receipts) if (at >= value.expiresAt) receipts.delete(key); }
  function before(event, ctx) {
    if (!TOOL_NAMES.has(String(event?.toolName ?? ''))) return;
    if (!active) return refusal('SERVICE_STOPPED');
    try {
      const at = currentTime(); trim(at);
      const requester = ctx?.requester;
      const group = groupOf(ctx?.sessionKey);
      const callId = event?.toolCallId ?? ctx?.toolCallId;
      if (!group || ctx?.trigger !== 'user' || requester?.trigger !== 'user' || requester?.channel !== 'qqbot' || !validId(ctx?.runId) || !validId(callId) || !validId(requester?.senderId) || !validId(requester?.accountId) || !validId(requester?.sourceMessageId)) return refusal('TRUSTED_USER_ORIGIN_REQUIRED');
      const state = executionGuard.authority(ctx).state;
      if (!state || state.trigger !== 'user' || !state.id || state.id !== normalizeId(requester.senderId)) return refusal('CURRENT_REQUESTER_REQUIRED');
      if (receipts.has(callId)) return refusal('CALL_ID_REUSED');
      if (receipts.size >= MAX_RECEIPTS) return refusal('RECEIPT_LIMIT');
      // The caller invokes this only after the original execution/read checks passed.
      // Model-authored identity, path, and run fields are never copied from event.params.
      const snapshot = Object.freeze({ sessionKey: ctx.sessionKey, runId: ctx.runId, trigger: 'user', requester: Object.freeze({ trigger: 'user', channel: 'qqbot', senderId: requester.senderId, accountId: requester.accountId, sourceMessageId: requester.sourceMessageId, ...requester.senderIsOwner !== undefined ? { senderIsOwner: requester.senderIsOwner } : {} }) });
      receipts.set(callId, { ctx: snapshot, group, sender: state.id, callId, at, expiresAt: at + TTL, consumed: false });
    } catch { return refusal('ORIGIN_VERIFICATION_FAILED'); }
  }
  function tool(factoryCtx) {
    if (!groupOf(factoryCtx?.sessionKey)) return null;
    // Keep the same advertised tool for owners/members/heartbeat. Real execution
    // requires a fresh user-call receipt; advertised presence is not authority.
    const factory = { sessionKey: factoryCtx.sessionKey, senderId: factoryCtx.requesterSenderId, accountId: factoryCtx.agentAccountId, channel: factoryCtx.messageChannel, assertCurrent: typeof factoryCtx.assertInvocationCurrent === 'function' ? factoryCtx.assertInvocationCurrent.bind(factoryCtx) : null };
    return {
      name: QQ_TEXT_FILE_TOOL,
      label: 'Create QQ Text File',
      catalogMode: 'direct-only',
      description: 'Create a new ordinary UTF-8 .txt or .md file from supplied text in this QQ group. Supply only a basename and content, at most 256 KiB. The host selects an isolated new path; this cannot read files, overwrite files, run code, or change settings. Send the returned mediaPath once with message asDocument=true only after status=created.',
      parameters: { type: 'object', additionalProperties: false, properties: { filename: { type: 'string', description: 'New basename ending in .txt or .md; no paths or hidden filenames.', minLength: 1, maxLength: 128 }, content: { type: 'string', description: 'The actual ordinary text to put into the file, at most 256 KiB in UTF-8.', minLength: 1, maxLength: QQ_TEXT_FILE_MAX_BYTES } }, required: ['filename', 'content'] },
      async execute(toolCallId, params, signal) {
        let record;
        let filename;
        let createdIdentity;
        let opened;
        let created = false;
        const close = () => { if (opened !== undefined) { const fd = opened; opened = undefined; io.closeSync(fd); } };
        const assertCurrent = () => {
          if (!active || !record || currentTime() >= record.expiresAt || signal?.aborted) throw new Error('QQ_TEXT_FILE_INVOCATION_EXPIRED');
          if (!factory.assertCurrent) throw new Error('QQ_TEXT_FILE_LIVE_AUTHORITY_REQUIRED');
          factory.assertCurrent();
        };
        const safeDir = directory => {
          assertCurrent();
          let info;
          try { info = io.lstatSync(directory); }
          catch (error) {
            if (error?.code !== 'ENOENT') throw error;
            assertCurrent();
            try { io.mkdirSync(directory, { mode: 0o700 }); }
            catch (createError) { if (createError?.code !== 'EEXIST') throw createError; }
            info = io.lstatSync(directory);
          }
          if (info.isSymbolicLink() || !info.isDirectory() || String(io.realpathSync(directory)) !== path.resolve(directory)) throw new Error('QQ_TEXT_FILE_DIRECTORY_UNSAFE');
          // POSIX module-owned directories may not be writable by another OS user.
          if (process.platform !== 'win32' && path.relative(rootPath, directory) !== '..' && !path.relative(rootPath, directory).startsWith('..' + path.sep) && (info.mode & 0o022)) throw new Error('QQ_TEXT_FILE_DIRECTORY_WRITABLE');
        };
        const inspectFile = () => {
          const info = io.lstatSync(filename);
          if (info.isSymbolicLink() || !info.isFile() || String(io.realpathSync(filename)) !== filename) throw new Error('QQ_TEXT_FILE_OUTPUT_UNSAFE');
          return info;
        };
        const removeCreated = () => {
          if (!created || !filename || !createdIdentity) return;
          try {
            const info = io.lstatSync(filename);
            if (!info.isSymbolicLink() && info.dev === createdIdentity.dev && info.ino === createdIdentity.ino) io.unlinkSync(filename);
          } catch { /* never delete an existing replacement or an unknown file */ }
        };
        try {
          const at = currentTime();
          record = receipts.get(toolCallId);
          if (!active || !record || record.consumed || at >= record.expiresAt) return failed('FRESH_USER_RECEIPT_REQUIRED');
          record.consumed = true;
          if (factory.sessionKey !== record.ctx.sessionKey || factory.channel !== 'qqbot' || !validId(factory.senderId) || normalizeId(factory.senderId) !== record.sender || factory.accountId !== record.ctx.requester.accountId) return failed('FACTORY_REQUESTER_MISMATCH');
          const input = validParams(params);
          if (!input) return failed('FILENAME_OR_UTF8_CONTENT_REJECTED');
          // Re-evaluate the original explicit group policy at the final effect,
          // including changes that occurred after before_tool_call admission.
          const policy = executionGuard.before({ toolName: QQ_TEXT_FILE_TOOL, params }, record.ctx);
          if (policy?.block) return failed('CURRENT_EXECUTION_POLICY_DENIED');
          assertCurrent();
          const parts = [];
          for (let cursor = rootPath; path.dirname(cursor) !== cursor; cursor = path.dirname(cursor)) parts.push(cursor);
          safeDir(path.parse(rootPath).root);
          for (const directory of parts.reverse()) safeDir(directory);
          const directories = [path.join(rootPath, record.group), path.join(rootPath, record.group, digest(JSON.stringify([record.ctx.requester.accountId, record.sender]))), path.join(rootPath, record.group, digest(JSON.stringify([record.ctx.requester.accountId, record.sender])), digest(JSON.stringify([record.ctx.runId, record.callId])))];
          for (const directory of directories) safeDir(directory);
          filename = path.join(directories.at(-1), input.filename);
          // No awaits between final authority check and the exclusive local write.
          assertCurrent();
          for (const directory of [rootPath, ...directories]) safeDir(directory);
          const flags = (io.constants ?? fs.constants).O_WRONLY | (io.constants ?? fs.constants).O_CREAT | (io.constants ?? fs.constants).O_EXCL | ((io.constants ?? fs.constants).O_NOFOLLOW ?? 0);
          opened = io.openSync(filename, flags, 0o600);
          created = true;
          createdIdentity = io.fstatSync(opened);
          if (!createdIdentity.isFile()) throw new Error('QQ_TEXT_FILE_OUTPUT_NOT_REGULAR');
          io.writeFileSync(opened, input.bytes);
          const written = io.fstatSync(opened);
          if (written.size !== input.bytes.length) throw new Error('QQ_TEXT_FILE_WRITE_INCOMPLETE');
          close();
          if (!sameIdentity(written, inspectFile())) throw new Error('QQ_TEXT_FILE_OUTPUT_CHANGED');
          assertCurrent();
          if (readGuard.registerAsset(record.ctx, filename, { freshAfter: record.at }) !== true) throw new Error('QQ_TEXT_FILE_ASSET_GRANT_FAILED');
          if (!sameIdentity(written, inspectFile())) throw new Error('QQ_TEXT_FILE_OUTPUT_CHANGED');
          const details = { status: 'created', mediaPath: filename, filename: input.filename, mimeType: input.mimeType, bytes: input.bytes.length, sha256: input.sha256 };
          return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
        } catch {
          try { close(); } catch { /* cleanup still attempts only this exclusive inode */ }
          removeCreated();
          return failed('CREATE_OR_ASSET_REGISTRATION_FAILED');
        }
      },
    };
  }
  function stop() { active = false; receipts.clear(); }
  return { before, tool, stop };
}
