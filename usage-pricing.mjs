export const PRICE_DATE = '2026-11-14';
const SOURCES = {
  openai: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
  claude: 'https://platform.claude.com/docs/en/about-claude/pricing',
  xai: 'https://docs.x.ai/developers/pricing',
  mimo: 'https://mimo.mi.com/models/zh-CN/mimo-v2.6-pro',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
};
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const first = (...xs) => xs.find(v => v !== undefined && v !== null);
const count = v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const direct = raw.input !== undefined;
  const read = first(raw.cacheRead, raw.cache_read, raw.cache_read_input_tokens, raw.cached_input_tokens, raw.cached_tokens, raw.cached, raw.input_tokens_details?.cached_tokens, raw.prompt_tokens_details?.cached_tokens, 0);
  const creation = raw.cache_creation;
  const nestedWrite = creation && first(creation.ephemeral_1h_input_tokens, creation.ephemeral_5m_input_tokens) !== undefined ? (creation.ephemeral_1h_input_tokens ?? 0) + (creation.ephemeral_5m_input_tokens ?? 0) : undefined;
  const write = first(raw.cacheWrite, raw.cache_write, raw.cache_creation_input_tokens, raw.cache_write_input_tokens, raw.input_tokens_details?.cache_write_tokens, raw.prompt_tokens_details?.cache_write_tokens, raw.prompt_tokens_details?.cache_creation_input_tokens, nestedWrite, 0);
  const inRaw = first(raw.input, raw.inputTokens, raw.input_tokens, raw.promptTokens, raw.prompt_tokens, raw.prompt_n, raw.timings?.prompt_n);
  const output = first(raw.output, raw.outputTokens, raw.output_tokens, raw.completionTokens, raw.completion_tokens, raw.predicted_n, raw.timings?.predicted_n);
  const readIncluded = !direct && [raw.cached_input_tokens, raw.cached_tokens, raw.cached, raw.input_tokens_details?.cached_tokens, raw.prompt_tokens_details?.cached_tokens].some(v => v !== undefined);
  const writeIncluded = !direct && [raw.cache_write_input_tokens, raw.input_tokens_details?.cache_write_tokens, raw.prompt_tokens_details?.cache_write_tokens, raw.prompt_tokens_details?.cache_creation_input_tokens].some(v => v !== undefined);
  const input = inRaw === undefined ? 0 : inRaw - (readIncluded ? read : 0) - (writeIncluded ? write : 0);
  const aggregate = first(raw.total, raw.totalTokens, raw.total_tokens);
  const oneHour = first(raw.cacheWrite1h, creation?.ephemeral_1h_input_tokens, 0);
  const writeDetails = raw.input_tokens_details?.cache_write_tokens_details ?? raw.prompt_tokens_details?.cache_write_tokens_details;
  const twelveHour = first(raw.cacheWrite12h, writeDetails?.ttl_12h_tokens, 0);
  const ttl12hKnown = raw.cacheTtl12hKnown ?? (own(raw, 'cacheWrite12h') || writeDetails !== undefined || write === 0);
  const ttlKnown = raw.cacheTtlKnown ?? (own(raw, 'cacheWrite1h') || nestedWrite !== undefined || write === 0);
  const invalid = (inRaw !== undefined && !count(inRaw)) || ![input, output ?? 0, read, write, oneHour, twelveHour].every(count) || (aggregate !== undefined && !count(aggregate)) || oneHour > write || twelveHour > write || (nestedWrite !== undefined && nestedWrite !== write) || (writeDetails !== undefined && (writeDetails.ttl_30m_tokens ?? 0) + (writeDetails.ttl_12h_tokens ?? 0) !== write) || raw.invalid === true;
  const componentTotal = invalid ? 0 : input + (output ?? 0) + read + write;
  return { input, output: output ?? 0, cacheRead: read, cacheWrite: write, cacheWrite1h: oneHour, cacheTtlKnown: ttlKnown, cacheWrite12h: twelveHour, cacheTtl12hKnown: ttl12hKnown,
    totalTokens: count(aggregate) ? Math.max(aggregate, componentTotal) : componentTotal,
    hasBreakdown: raw.hasBreakdown ?? (inRaw !== undefined && output !== undefined), invalid,
    unallocatedTokens: Math.max(0, (count(aggregate) ? aggregate : 0) - componentTotal) };
}
const rates = (input, output, cacheRead, cacheWrite = null, cacheWriteLong = cacheWrite) => ({ input, output, cacheRead, cacheWrite, cacheWriteLong });
function officialPrice(provider, model, prompt) {
  if (['openai', 'openai-api', 'openai-codex', 'codex'].includes(provider) && model === 'gpt-6-luna') {
    return { source: SOURCES.openai, lower: prompt > 272000 ? rates(.2, .75, .02, .25, .5) : rates(.1, .5, .01, .125, .25), ttl: '12h' };
  }
  if (['anthropic', 'claude-cli'].includes(provider)) {
    if (model === 'claude-haiku-5-5') return { source: SOURCES.claude, lower: prompt > 100000 ? rates(.5, 2.5, .05, .625, 1) : rates(.1, .5, .01, .125, .2), ttl: '1h' };
    if (model === 'claude-sonnet-5-5') return { source: SOURCES.claude, lower: rates(2, 10, .1, 2.5, 4), ttl: '1h' };
  }
  if (provider === 'xai' && model === 'grok-4.7') return { source: SOURCES.xai, lower: prompt >= 200000 ? rates(4, 12, 1) : rates(2, 6, .5) };
  if (provider === 'xai' && model === 'grok-4.7-build-fast') return { source: SOURCES.xai, lower: prompt > 200000 ? rates(6, 18, 1.5) : rates(4, 12, 1), kind: 'official-variant-reference', assumptions: ['grok_build_fast_reference'], reference: 'Grok 4.7 Fast (Grok Build); not a public API model ID' };
  if (['xiaomi-token-plan', 'xiaomi', 'mimo'].includes(provider) && model === 'mimo-v2.6-pro') return { source: SOURCES.mimo, lower: rates(.435, .87, .0036) };
  if (provider === 'deepseek' && ['deepseek-flash','deepseek-v4-pro'].includes(model)) {
    const flash = model === 'deepseek-flash';
    return { source: SOURCES.deepseek, lower: flash ? rates(.15, .6, .003) : rates(.66, 1.98, .022), upper: flash ? rates(.3, 1.2, .006) : rates(1.32, 3.96, .044), assumptions: ['deepseek_peak_offpeak_range'] };
  }
}
const zeroCost = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
function priceCost(tokens, price, ttlHigh, ttl = '1h') {
  const cost = zeroCost();
  for (const k of ['input','output','cacheRead']) {
    if (tokens[k] > 0 && !Number.isFinite(price[k])) return null;
    cost[k] = tokens[k] * (price[k] ?? 0) / 1e6;
  }
  if (tokens.cacheWrite > 0 && (!Number.isFinite(price.cacheWrite) || !Number.isFinite(price.cacheWriteLong))) return null;
  const ttlKnown = ttl === '12h' ? tokens.cacheTtl12hKnown : tokens.cacheTtlKnown;
  const oneHour = ttlKnown ? (ttl === '12h' ? tokens.cacheWrite12h : tokens.cacheWrite1h) : ttlHigh ? tokens.cacheWrite : 0;
  cost.cacheWrite = ((tokens.cacheWrite - oneHour) * (price.cacheWrite ?? 0) + oneHour * (price.cacheWriteLong ?? 0)) / 1e6;
  cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
  return cost;
}
export function estimateRecord(record, overrides = {}) {
  const tokens = normalizeUsage(record.usage);
  const gap = reason => ({ status: 'unpriced', reason, tokens, pricedTokens: 0 });
  if (!tokens) return gap('missing_usage');
  if (tokens.invalid) return gap('invalid_usage');
  if (!tokens.hasBreakdown || tokens.unallocatedTokens) return gap('missing_token_breakdown');
  if (!tokens.totalTokens) return { status: 'zero_tokens', tokens, pricedTokens: 0, cost: zeroCost(), costUpper: zeroCost(), assumptions: [] };
  const key = `${record.provider}/${record.model}`;
  let price, kind = 'official';
  if (own(overrides, key)) {
    const custom = overrides[key];
    if (!custom || !['input','output','cacheRead','cacheWrite'].every(k => typeof custom[k] === 'number' && Number.isFinite(custom[k]) && custom[k] >= 0) || !['cacheWrite1h','cacheWrite12h'].every(k => custom[k] === undefined || typeof custom[k] === 'number' && Number.isFinite(custom[k]) && custom[k] >= 0)) throw new Error('invalid custom price');
    price = { source: 'user-custom', ttl: own(custom, 'cacheWrite12h') ? '12h' : '1h', lower: { ...custom, cacheWriteLong: custom.cacheWrite12h ?? custom.cacheWrite1h ?? custom.cacheWrite } }; kind = 'custom';
  } else price = officialPrice(record.provider, record.model, tokens.input + tokens.cacheRead + tokens.cacheWrite);
  if (!price) return gap('unknown_model');
  if (price.kind) kind = price.kind;
  const assumptions = [...(price.assumptions ?? [])];
  if (price.ttl && tokens.cacheWrite > 0 && !(price.ttl === '12h' ? tokens.cacheTtl12hKnown : tokens.cacheTtlKnown)) assumptions.push(price.ttl === '12h' ? 'openai_cache_ttl_unknown' : 'cache_ttl_unknown');
  const cost = priceCost(tokens, price.lower, false, price.ttl), costUpper = priceCost(tokens, price.upper ?? price.lower, true, price.ttl);
  if (!cost || !costUpper) return gap('unknown_cache_write_price');
  return { status: 'priced', tokens, pricedTokens: tokens.totalTokens, cost, costUpper, priceKind: kind, priceSource: price.source, priceDate: PRICE_DATE, reference: price.reference, assumptions };
}
function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, pricedTokens: 0, totalCost: 0, totalCostUpper: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0, missingTokenBreakdownEntries: 0, missingUsageEntries: 0, invalidUsageEntries: 0, zeroTokenEntries: 0, pricedEntries: 0, unknownTtlEntries: 0, customPriceEntries: 0, customTokens: 0, referencePriceEntries: 0, referenceTokens: 0, referenceCost: 0, referenceCostUpper: 0, inputCostUpper: 0, outputCostUpper: 0, cacheReadCostUpper: 0, cacheWriteCostUpper: 0 };
}
export function summarizeRecords(records, { startMs = -Infinity, endMs = Infinity, overrides = {} } = {}) {
  const totals = emptyTotals(), daily = new Map(), models = new Map(), providers = new Map(), seen = new Set(), assumptions = new Set(), priceSources = new Map(), agents = new Set();
  let duplicateEntries = 0, untimestampedEntries = 0;
  const add = (target, e) => {
    if (e.tokens && !e.tokens.invalid) for (const k of ['input','output','cacheRead','cacheWrite','totalTokens']) target[k] += e.tokens[k];
    if (e.status === 'priced') {
      target.pricedTokens += e.pricedTokens; target.pricedEntries++;
      target.totalCost += e.cost.total; target.totalCostUpper += e.costUpper.total;
      for (const k of ['input','output','cacheRead','cacheWrite']) { target[k + 'Cost'] += e.cost[k]; target[k + 'CostUpper'] += e.costUpper[k]; }
      target.unknownTtlEntries += e.assumptions.includes('cache_ttl_unknown') || e.assumptions.includes('openai_cache_ttl_unknown'); target.customPriceEntries += e.priceKind === 'custom'; if (e.priceKind === 'custom') target.customTokens += e.pricedTokens;
      if (e.priceKind === 'official-variant-reference') { target.referencePriceEntries++; target.referenceTokens += e.pricedTokens; target.referenceCost += e.cost.total; target.referenceCostUpper += e.costUpper.total; }
    } else if (e.reason === 'missing_usage') target.missingUsageEntries++;
    else if (e.reason === 'invalid_usage') target.invalidUsageEntries++;
    else if (e.status === 'zero_tokens') target.zeroTokenEntries++;
    else { target.missingCostEntries++; if (e.reason === 'missing_token_breakdown') target.missingTokenBreakdownEntries++; }
  };
  for (const r of records) {
    const t = typeof r.timestamp === 'number' ? r.timestamp : Date.parse(r.timestamp);
    if (!Number.isFinite(t)) { untimestampedEntries++; continue; }
    if (t < startMs || t >= endMs) continue;
    if (r.dedupeKey) { if (seen.has(r.dedupeKey)) { duplicateEntries++; continue; } seen.add(r.dedupeKey); }
    const e = estimateRecord(r, overrides), key = `${r.provider ?? 'unknown'}/${r.model ?? 'unknown'}`;
    const day = new Date(t + 8 * 3600e3).toISOString().slice(0,10);
    if (!daily.has(day)) daily.set(day, { date: day, ...emptyTotals() });
    if (!models.has(key)) models.set(key, { model: key, ...emptyTotals(), reasons: {} });
    const provider = r.provider ?? 'unknown'; if (!providers.has(provider)) providers.set(provider, { provider, ...emptyTotals() });
    const m = models.get(key); if (e.reason) m.reasons[e.reason] = (m.reasons[e.reason] ?? 0) + 1;
    add(totals,e); add(daily.get(day),e); add(m,e); add(providers.get(provider),e); if (r.agent) agents.add(r.agent);
    for (const a of e.assumptions ?? []) assumptions.add(a);
    if (e.priceSource) priceSources.set(`${key}:${e.priceKind}`, { model: key, kind: e.priceKind, url: e.priceSource, verifiedAt: PRICE_DATE, reference: e.reference });
  }
  totals.tokenCoverage = totals.totalTokens ? totals.pricedTokens / totals.totalTokens : null;
  totals.officialTokenCoverage = totals.totalTokens ? (totals.pricedTokens - totals.referenceTokens - totals.customTokens) / totals.totalTokens : null;
  return { updatedAt: Date.now(), billingMode: 'api-equivalent', currency: 'USD', timezone: 'Asia/Singapore', priceDate: PRICE_DATE, scope: 'all-agents-recorded-openclaw-usage', totals,
    daily: [...daily.values()].sort((a,b) => a.date.localeCompare(b.date)), models: [...models.values()], providers: [...providers.values()], assumptions: [...assumptions], priceSources: [...priceSources.values()], agents: [...agents].sort(), duplicateEntries, untimestampedEntries,
    notice: 'API等价估价，非实际账单，不含订阅费；按当前公开单价重算已记录token，不含工具/音视频等单独计费。' };
}
