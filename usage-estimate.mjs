import fs from 'node:fs/promises';
import { summarizeRecords } from './usage-pricing.mjs';
import { readUsageTranscripts } from './usage-transcripts.mjs';
const DAY = 864e5, OFFSET = 8 * 3600e3;
function dateStart(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) throw new Error('invalid usage date');
  const t = Date.parse(s + 'T00:00:00+08:00');
  if (!Number.isFinite(t) || new Date(t + OFFSET).toISOString().slice(0,10) !== s) throw new Error('invalid usage date');
  return t;
}
export function usageDateRange({ days = 30, startDate, endDate, now = Date.now() } = {}) {
  let startMs, endMs;
  if (startDate !== undefined || endDate !== undefined) { startMs = dateStart(startDate); endMs = dateStart(endDate) + DAY; }
  else {
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('invalid usage date range');
    endMs = dateStart(new Date(now + OFFSET).toISOString().slice(0,10)) + DAY; startMs = endMs - days * DAY;
  }
  if (endMs <= startMs || endMs - startMs > 366 * DAY) throw new Error('invalid usage date range');
  return { startMs, endMs };
}
export async function loadUsageEstimate({ stateDir, days = 30, startDate, endDate, now = Date.now(), overrides = {}, priceFile } = {}) {
  if (priceFile) {
    try { overrides = JSON.parse(await fs.readFile(priceFile,'utf8')); if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error(); }
    catch { throw new Error('usage custom price file unavailable or invalid'); }
  }
  const range = usageDateRange({ days, startDate, endDate, now });
  const source = await readUsageTranscripts({ stateDir });
  const result = summarizeRecords(source.records,{ ...range, overrides });
  return { ...result, days: (range.endMs-range.startMs)/DAY, range, agents: source.agents, sourceErrors: source.sourceErrors,
    complete: !source.sourceErrors.length && !result.totals.missingCostEntries && !result.totals.missingUsageEntries && !result.totals.invalidUsageEntries && !result.untimestampedEntries,
    provenance: 'Read-only retained OpenClaw transcript usage across all agent directories; native CLI records without a proven run mapping are not added twice.' };
}
