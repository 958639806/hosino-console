// QQ-RESTART-REQUESTER-AUTHORITY v1. Privileged host admission, never a tool or historical-owner lookup.
import { normId } from './execution-policy.mjs';

const SYSTEM_TRIGGERS = new Set(['cron', 'heartbeat', 'automation', 'schedule', 'memory']);
const PROOF_KEYS = ['version', 'sessionId', 'sourceTurnId', 'sourceMessageId', 'channel', 'accountId', 'senderId', 'target', 'ownerAdmitted', 'capturedAtUnixMs'];
const SNAPSHOT_KEYS = ['cycleId', 'chargedAttempts', 'lifecycleGeneration', 'recoveryRunId', 'sourceTurnId', 'sessionId', 'accountId', 'senderId', 'target', 'channel'];
const INPUT_KEYS = ['sessionKey', 'sessionId', 'runId', 'sourceTurnId', 'lifecycleGeneration', 'ownerProof', 'freshEntry', 'assertCurrent'];
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\s\0\r\n]/.test(value);
const generationId = value => id(value) && !/[\x00-\x1f\x7f]/.test(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sameSnapshot = (left, right) => Object.isFrozen(right) && exactKeys(right, SNAPSHOT_KEYS) && SNAPSHOT_KEYS.every(key => right[key] === left[key]);
const directTarget = (target, senderId) => {
  const match = typeof target === 'string' && target.match(/^qqbot:(?:c2c|direct):([^:\s]+)$/i);
  return Boolean(match && normId(match[1]) && normId(match[1]) === normId(senderId));
};
const privateSession = value => id(value) && /^agent:[^:\s]+:(?:main|qqbot:(?:[^:\s]+:)?(?:direct|c2c):[^:\s]+)$/i.test(value) && !/:qqbot:group:|:cron:|:heartbeat:|:subagent:/i.test(value);

export function createRestartRequesterAuthority({ now = Date.now, maxEntries = 128 } = {}) {
  const records = new Map(); const ttl = 6 * 60 * 60_000;
  let active = true;
  const keyFor = (sessionKey, runId) => JSON.stringify([sessionKey, runId]);
  const timely = proof => { const at = now(); return Number.isSafeInteger(at) && Number.isSafeInteger(proof.capturedAtUnixMs) && proof.capturedAtUnixMs > 0 && proof.capturedAtUnixMs <= at && at - proof.capturedAtUnixMs <= ttl; };
  function revoke(key, record) { record.revoked = true; if (records.get(key) === record) records.delete(key); }
  function validSnapshot(snapshot, input, proof) {
    return Object.isFrozen(snapshot) && exactKeys(snapshot, SNAPSHOT_KEYS) && id(snapshot.cycleId) && Number.isSafeInteger(snapshot.chargedAttempts) && snapshot.chargedAttempts > 0 &&
      snapshot.lifecycleGeneration === input.lifecycleGeneration && snapshot.recoveryRunId === input.runId && snapshot.sessionId === input.sessionId && snapshot.sourceTurnId === input.sourceTurnId &&
      snapshot.channel === 'qqbot' && snapshot.accountId === proof.accountId && id(snapshot.senderId) && normId(snapshot.senderId) === normId(proof.senderId) && snapshot.target === proof.target;
  }
  function admit(input) {
    try {
      // Core issues an opaque UUID string. Keep its exact bytes; numeric coercion cannot establish custody.
      if (!active || !exactKeys(input, INPUT_KEYS) || !privateSession(input.sessionKey) || !id(input.sessionId) || !id(input.runId) || !id(input.sourceTurnId) || !generationId(input.lifecycleGeneration) || typeof input.assertCurrent !== 'function') return;
      const proof = input.ownerProof;
      if (!exactKeys(proof, PROOF_KEYS) || proof.version !== 1 || proof.ownerAdmitted !== true || proof.channel !== 'qqbot' || !id(proof.accountId) || !id(proof.senderId) || !normId(proof.senderId) || !id(proof.sourceMessageId) || !id(proof.target) || proof.sessionId !== input.sessionId || proof.sourceTurnId !== input.sourceTurnId || !directTarget(proof.target, proof.senderId) || !timely(proof)) return;
      if (!validSnapshot(input.freshEntry, input, proof)) return;
      const proofSnapshot = Object.freeze(Object.fromEntries(PROOF_KEYS.map(key => [key, proof[key]])));
      const snapshot = Object.freeze(Object.fromEntries(SNAPSHOT_KEYS.map(key => [key, input.freshEntry[key]])));
      const before = input.assertCurrent();
      if (!sameSnapshot(snapshot, before) || !sameSnapshot(snapshot, input.assertCurrent()) || !timely(proofSnapshot)) return;
      for (const [key, record] of records) if (record.revoked || !timely(record.proof)) revoke(key, record);
      const key = keyFor(input.sessionKey, input.runId);
      if (!records.has(key) && records.size >= Math.max(1, Math.min(128, Number.isSafeInteger(maxEntries) ? maxEntries : 128))) return;
      const previous = records.get(key); if (previous) revoke(key, previous);
      const record = { sessionKey: input.sessionKey, sessionId: input.sessionId, runId: input.runId, sourceTurnId: input.sourceTurnId, lifecycleGeneration: input.lifecycleGeneration, proof: proofSnapshot, snapshot, assertCurrent: input.assertCurrent, revoked: false };
      records.set(key, record);
      return () => revoke(key, record);
    } catch { return; }
  }
  function resolve(ctx) {
    const key = keyFor(ctx?.sessionKey, ctx?.runId); const record = records.get(key);
    if (!active || !record) return;
    try {
      const requester = ctx?.requester;
      const ctxTrigger = String(ctx?.trigger ?? '').toLowerCase(); const requesterTrigger = String(requester?.trigger ?? '').toLowerCase();
      if (record.revoked || !timely(record.proof) || !requester || requesterTrigger !== 'user' || SYSTEM_TRIGGERS.has(ctxTrigger) || SYSTEM_TRIGGERS.has(requesterTrigger)) return;
      for (const [value, expected] of [[ctx?.sessionId, record.sessionId], [ctx?.sourceTurnId, record.sourceTurnId], [requester.sourceTurnId, record.sourceTurnId]]) if (value !== undefined && value !== null && value !== '' && value !== expected) return;
      if (ctx?.lifecycleGeneration !== undefined && ctx.lifecycleGeneration !== record.lifecycleGeneration) return;
      if (requester.channel && String(requester.channel).toLowerCase() !== 'qqbot') return;
      if ([requester.senderId, ctx?.senderId].some(value => value && normId(value) !== normId(record.proof.senderId))) return;
      if ([requester.accountId, ctx?.accountId].some(value => value && value !== record.proof.accountId)) return;
      if ([requester.sourceMessageId, ctx?.sourceMessageId].some(value => value && value !== record.proof.sourceMessageId && value !== record.sourceTurnId)) return;
      if (requester.targetId && !directTarget(requester.targetId, record.proof.senderId)) return;
      if (!sameSnapshot(record.snapshot, record.assertCurrent()) || !sameSnapshot(record.snapshot, record.assertCurrent()) || !timely(record.proof)) { revoke(key, record); return; }
      return Object.freeze({ senderId: record.proof.senderId, accountId: record.proof.accountId, sourceMessageId: record.proof.sourceMessageId, sourceTurnId: record.sourceTurnId, ownerAdmitted: true });
    } catch { revoke(key, record); return; }
  }
  function stop() { active = false; for (const [key, record] of records) revoke(key, record); }
  return Object.freeze({ admit, resolve, stop });
}
