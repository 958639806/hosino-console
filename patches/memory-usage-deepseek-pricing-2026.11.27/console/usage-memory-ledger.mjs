import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeUsage, resolveOfficialProvider } from './usage-pricing.mjs';
import { ledgerDir } from './append-usage.mjs';

export async function readMemoryUsageLedger({ ledgerDir: dir, env = process.env } = {}) {
  const records = [], sourceErrors = [];
  const root = dir || ledgerDir(env);
  let names;
  try { names = await fs.readdir(root); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { records, sourceErrors };
    return { records, sourceErrors: [{ source: 'memory-ledger', code: 'ledger_unavailable' }] };
  }
  const files = names.filter(n => /^memory-extract(?:-\d{4}-\d{2})?\.jsonl$/.test(n)).sort();
  const seen = new Set();
  for (const name of files) {
    let text;
    try { text = await fs.readFile(path.join(root, name), 'utf8'); }
    catch { sourceErrors.push({ source: 'memory-ledger', code: 'ledger_read_failed', file: name }); continue; }
    let invalid = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let raw;
      try { raw = JSON.parse(line); }
      catch { invalid++; continue; }
      if (!raw || typeof raw !== 'object' || raw.source !== 'memory-extract') { invalid++; continue; }
      const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      const timestamp = typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) ? raw.timestamp : Date.parse(raw.timestamp);
      const usage = raw.usageMissing || raw.usage == null ? null : normalizeUsage(raw.usage);
      records.push({
        source: 'memory-extract',
        purpose: raw.purpose === 'add-extract' ? 'add-extract' : 'bounded-extract',
        provider: resolveOfficialProvider(raw.provider, raw.model),
        model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : 'unknown',
        timestamp,
        usage,
        dedupeKey: id ? `memory-ledger:${id}` : undefined,
      });
    }
    if (invalid) sourceErrors.push({ source: 'memory-ledger', code: 'invalid_json_records', file: name });
  }
  return { records, sourceErrors };
}
