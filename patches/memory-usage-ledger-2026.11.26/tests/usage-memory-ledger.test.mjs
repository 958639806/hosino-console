// All data in this file are synthetic test fixtures. No live credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recordMemoryUsage, buildLedgerRecord } from '../append-usage.mjs';
import { readMemoryUsageLedger } from '../usage-memory-ledger.mjs';
import { loadUsageEstimate } from '../usage-estimate.mjs';
import { summarizeRecords } from '../usage-pricing.mjs';

async function tmp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-mem-usage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('successful extract is recorded even when there are no facts; missing usage is not zero', async t => {
  const dir = await tmp(t);
  const env = { HOSINO_USAGE_LEDGER_DIR: dir };
  const a = recordMemoryUsage({ purpose: 'bounded-extract', provider: 'deepseek', model: 'deepseek-flash', usage: { prompt_tokens: 100, completion_tokens: 5 }, timestamp: Date.parse('2026-11-26T04:00:00Z') }, env);
  const b = recordMemoryUsage({ purpose: 'bounded-extract', provider: 'deepseek', model: 'deepseek-flash', usage: null, timestamp: Date.parse('2026-11-26T04:01:00Z') }, env);
  assert.equal(a.usageMissing, false);
  assert.equal(b.usageMissing, true);
  assert.equal(b.usage, null);
  const { records, sourceErrors } = await readMemoryUsageLedger({ ledgerDir: dir });
  assert.equal(sourceErrors.length, 0);
  assert.equal(records.length, 2);
  assert.equal(records[0].source, 'memory-extract');
  assert.equal(records[0].usage.input, 100);
  assert.equal(records[0].usage.output, 5);
  assert.equal(records[1].usage, null);
});

test('ledger writer strips secrets and never throws', async t => {
  const dir = await tmp(t);
  const rec = buildLedgerRecord({
    purpose: 'add-extract',
    provider: 'deepseek',
    model: 'deepseek-flash',
    usage: { prompt_tokens: 10, completion_tokens: 2, api_key: 'sk-secret-should-not-land', authorization: 'Bearer x' },
    apiKey: 'sk-secret-field',
    text: 'PRIVATE_MEMORY_TEXT',
  });
  const blob = JSON.stringify(rec);
  assert.doesNotMatch(blob, /sk-secret|Bearer|PRIVATE_MEMORY/);
  const blocker = path.join(dir, 'not-a-directory');
  await fs.writeFile(blocker, 'x');
  assert.equal(recordMemoryUsage({ purpose: 'add-extract' }, { HOSINO_USAGE_LEDGER_DIR: path.join(blocker, 'ledger') }), null);
});

test('ledger directory is 0700 and files are 0600', async t => {
  const dir = await tmp(t);
  recordMemoryUsage({ purpose: 'add-extract', provider: 'deepseek', model: 'deepseek-flash', usage: { input: 1, output: 1 }, timestamp: Date.parse('2026-11-26T04:00:00Z') }, { HOSINO_USAGE_LEDGER_DIR: dir });
  const st = await fs.stat(dir);
  assert.equal(st.mode & 0o777, 0o700);
  const files = await fs.readdir(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^memory-extract-2026-11\.jsonl$/);
  const fst = await fs.stat(path.join(dir, files[0]));
  assert.equal(fst.mode & 0o777, 0o600);
});

test('estimate merges session and memory extract, four dimensions sum to totals', async t => {
  const root = await tmp(t);
  const stateDir = path.join(root, 'state');
  const ledger = path.join(root, 'ledger');
  const sessDir = path.join(stateDir, 'agents', 'main', 'sessions');
  await fs.mkdir(sessDir, { recursive: true });
  await fs.writeFile(path.join(sessDir, 's.jsonl'), JSON.stringify({
    id: 'sess-1', type: 'message', timestamp: '2026-11-26T04:00:00Z',
    message: { role: 'assistant', provider: 'openai', model: 'gpt-6-luna', usage: { input: 1000, output: 10, cacheRead: 0, cacheWrite: 0 } },
  }) + '\n');
  recordMemoryUsage({ purpose: 'bounded-extract', provider: 'deepseek', model: 'deepseek-flash', usage: { input: 2000, output: 20, cacheRead: 0, cacheWrite: 0 }, timestamp: Date.parse('2026-11-26T05:00:00Z') }, { HOSINO_USAGE_LEDGER_DIR: ledger });
  const r = await loadUsageEstimate({ stateDir, ledgerDir: ledger, startDate: '2026-11-26', endDate: '2026-11-26' });
  assert.equal(r.agents.length, 1);
  assert.equal(r.agents[0], 'main');
  assert.equal(r.totals.totalTokens, 3030);
  assert.equal(r.totals.pricedEntries, 2);
  const bySource = Object.fromEntries(r.sources.map(s => [s.source, s.totalTokens]));
  assert.equal(bySource.session, 1010);
  assert.equal(bySource['memory-extract'], 2020);
  const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'totalCost', 'totalCostUpper']) {
    assert.equal(sum(r.models, key), r.totals[key]);
    assert.equal(sum(r.providers, key), r.totals[key]);
    assert.equal(sum(r.daily, key), r.totals[key]);
    assert.equal(sum(r.sources, key), r.totals[key]);
  }
  assert.match(r.provenance, /Memory extraction before the collector started/);
});

test('missing ledger usage keeps a visible gap and is not priced as zero', async t => {
  const dir = await tmp(t);
  recordMemoryUsage({ purpose: 'add-extract', provider: 'deepseek', model: 'deepseek-flash', usage: null, timestamp: Date.parse('2026-11-26T05:00:00Z') }, { HOSINO_USAGE_LEDGER_DIR: dir });
  const { records } = await readMemoryUsageLedger({ ledgerDir: dir });
  const s = summarizeRecords(records);
  assert.equal(s.totals.missingUsageEntries, 1);
  assert.equal(s.totals.pricedEntries, 0);
  assert.equal(s.totals.totalCost, 0);
  assert.equal(s.totals.totalTokens, 0);
  assert.equal(s.sources[0].source, 'memory-extract');
  assert.equal(s.sources[0].missingUsageEntries, 1);
});

test('openai-wrapped deepseek model is classified as deepseek, not a neighbor alias', async t => {
  const dir = await tmp(t);
  recordMemoryUsage({ purpose: 'bounded-extract', provider: 'openai', model: 'deepseek-flash', usage: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 }, timestamp: Date.parse('2026-11-26T05:00:00Z') }, { HOSINO_USAGE_LEDGER_DIR: dir });
  const { records } = await readMemoryUsageLedger({ ledgerDir: dir });
  assert.equal(records[0].provider, 'deepseek');
  const s = summarizeRecords(records);
  assert.equal(s.totals.pricedEntries, 1);
  assert.equal(s.models[0].model, 'deepseek/deepseek-flash');
});

test('absent ledger directory is empty, not a fake complete zero from an error path', async () => {
  const s = await readMemoryUsageLedger({ ledgerDir: '/tmp/hs-mem-usage-does-not-exist-xyz' });
  assert.deepEqual(s.records, []);
  assert.deepEqual(s.sourceErrors, []);
});
