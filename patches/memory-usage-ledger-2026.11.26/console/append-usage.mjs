import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

export const DEFAULT_LEDGER_DIR = '/var/lib/hosino-usage';
const SCHEMA = 1;
const PURPOSES = new Set(['bounded-extract', 'add-extract']);
const TOKEN_KEYS = [
  'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens',
  'input_tokens', 'output_tokens', 'prompt_tokens', 'completion_tokens',
  'total_tokens', 'cached_tokens', 'cache_read', 'cache_write',
  'cache_read_input_tokens', 'cache_creation_input_tokens',
  'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens',
  'reasoning_tokens', 'reasoningTokens',
  'cacheRead', 'cacheWrite', 'cache_creation',
  'input_tokens_details', 'prompt_tokens_details', 'output_tokens_details',
  'completion_tokens_details',
];

export function ledgerDir(env = process.env) {
  const raw = env.HOSINO_USAGE_LEDGER_DIR;
  if (typeof raw === 'string' && raw.trim()) return path.resolve(raw.trim());
  return DEFAULT_LEDGER_DIR;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeName(v, fallback = 'unknown') {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s || s.length > 200) return fallback;
  if (/[/\0]/.test(s) && !s.includes('/')) return fallback;
  if (/key|token|secret|password|authorization/i.test(s) && s.length > 40) return fallback;
  return s;
}

function pickUsage(raw) {
  if (raw == null) return null;
  if (!isPlainObject(raw)) return null;
  const out = {};
  for (const key of TOKEN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (isPlainObject(value)) {
      const nested = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'number' && Number.isFinite(v)) nested[k] = v;
      }
      if (Object.keys(nested).length) out[key] = nested;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function buildLedgerRecord(input = {}) {
  const purpose = PURPOSES.has(input.purpose) ? input.purpose : 'bounded-extract';
  const usage = pickUsage(input.usage);
  const timestamp = typeof input.timestamp === 'number' && Number.isFinite(input.timestamp)
    ? input.timestamp
    : Date.now();
  const nonce = randomBytes(8).toString('hex');
  const id = createHash('sha256')
    .update(`${timestamp}\0${purpose}\0${sanitizeName(input.provider)}\0${sanitizeName(input.model)}\0${nonce}`)
    .digest('hex');
  return {
    schema: SCHEMA,
    id,
    timestamp,
    source: 'memory-extract',
    purpose,
    provider: sanitizeName(input.provider),
    model: sanitizeName(input.model),
    usage,
    usageMissing: usage == null,
  };
}

export function recordMemoryUsage(input = {}, env = process.env) {
  try {
    const dir = ledgerDir(env);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch {}
    const month = new Date((input.timestamp ?? Date.now()) + 8 * 3600e3).toISOString().slice(0, 7);
    const file = path.join(dir, `memory-extract-${month}.jsonl`);
    const record = buildLedgerRecord(input);
    const line = JSON.stringify(record) + '\n';
    const fd = fs.openSync(file, 'a', 0o600);
    try { fs.writeSync(fd, line); }
    finally { fs.closeSync(fd); }
    try { fs.chmodSync(file, 0o600); } catch {}
    return record;
  } catch {
    return null;
  }
}
