import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recordMemoryUsage } from '../append-usage.mjs';
import { readMemoryUsageLedger } from '../usage-memory-ledger.mjs';

test('usage is kept when a later no-facts or validation error is thrown', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-hook-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const env = { HOSINO_USAGE_LEDGER_DIR: dir };
  const extract = async (response, after) => {
    recordMemoryUsage({ purpose: 'bounded-extract', provider: 'deepseek', model: 'deepseek-flash', usage: response.usage ?? null, timestamp: Date.parse('2026-11-26T10:00:00Z') }, env);
    await after();
  };
  await assert.rejects(() => extract({ usage: { prompt_tokens: 11, completion_tokens: 2 } }, async () => { throw new Error('MEMORY_SOURCE_SPAN_UNVERIFIED'); }), /MEMORY_SOURCE_SPAN_UNVERIFIED/);
  const { records } = await readMemoryUsageLedger({ ledgerDir: dir });
  assert.equal(records.length, 1);
  assert.equal(records[0].usage.input, 11);
  assert.equal(records[0].usage.output, 2);
});
