// All data, credentials and identifiers in this file are synthetic test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, estimateRecord, summarizeRecords, resolveOfficialProvider } from '../usage-pricing.mjs';
const record = (model, usage, provider = 'openai') => ({ provider, model, usage, timestamp: Date.parse('2026-11-14T04:00:00Z') });
const buckets = (input, output = 0, cacheRead = 0, cacheWrite = 0) => ({ input, output, cacheRead, cacheWrite });
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);
test('OAuth zero cost and provider-billed zero are repriced', () => {
 for (const totalOrigin of [undefined,'provider-billed']) close(estimateRecord(record('gpt-6-luna',{...buckets(1e6),cost:{total:0,totalOrigin}})).cost.total,.2);
});
test('historical positive cost does not override official current estimate', () => close(estimateRecord(record('gpt-6-luna',{...buckets(1000,20),cost:{total:999}})).cost.total,.00011));
test('Codex cached input is subtracted once, reasoning not added', () => {
 const u=normalizeUsage({input_tokens:165564,cached_input_tokens:164992,output_tokens:6,reasoning_output_tokens:3,total_tokens:165570});
 assert.deepEqual([u.input,u.output,u.cacheRead,u.totalTokens],[572,6,164992,165570]);
 close(estimateRecord(record('gpt-6-luna',u)).cost.total,.00171012);
});
test('OpenAI Chat and Responses detail shapes normalize without double counting', () => {
 for (const raw of [{prompt_tokens:1000,completion_tokens:20,prompt_tokens_details:{cached_tokens:800}}, {input_tokens:1000,output_tokens:20,input_tokens_details:{cached_tokens:800}}]) {
 const u=normalizeUsage(raw); assert.equal(u.input,200); assert.equal(u.cacheRead,800);assert.equal(u.totalTokens,1020);
 }
});
test('normalized direct input is exclusive and wins over raw aliases',()=>{ const u=normalizeUsage({...buckets(200,20,800),input_tokens:1000,input_tokens_details:{cached_tokens:800}});assert.equal(u.input,200);assert.equal(u.totalTokens,1020); });
test('Anthropic cache buckets are separate and explicit 1h is a subset',()=>{
 const u=normalizeUsage({input_tokens:10,output_tokens:2,cache_read_input_tokens:100,cache_creation_input_tokens:50,cache_creation:{ephemeral_1h_input_tokens:40,ephemeral_5m_input_tokens:10}});
 assert.equal(u.totalTokens,162);assert.equal(u.cacheWrite1h,40);assert.equal(u.cacheTtlKnown,true);
 close(estimateRecord(record('claude-sonnet-5-5',u,'claude-cli')).cost.total,(10*2+2*10+100*.1+40*4+10*2.5)/1e6);
});
test('unknown Claude cache TTL yields an honest priced interval, not skipped tokens',()=>{
 const e=estimateRecord(record('claude-sonnet-5-5',buckets(0,0,0,1e6),'claude-cli'));
 close(e.cost.total,2.5);close(e.costUpper.total,4);assert.equal(e.pricedTokens,1e6);assert.ok(e.assumptions.includes('cache_ttl_unknown'));
});
test('Haiku threshold includes cached prompt and switches whole request',()=>{
 close(estimateRecord(record('claude-haiku-5-5',buckets(0,10,100000),'claude-cli')).cost.total,.001005);
 close(estimateRecord(record('claude-haiku-5-5',buckets(0,10,100001),'claude-cli')).cost.total,.00502505);
});
test('Luna 272000/272001 boundary is per call',()=>{
 close(estimateRecord(record('gpt-6-luna',buckets(272000))).cost.total,.0272);
 close(estimateRecord(record('gpt-6-luna',buckets(272001))).cost.total,.0544002);
 const s=summarizeRecords([record('gpt-6-luna',buckets(200000)),record('gpt-6-luna',buckets(200000))]);close(s.totals.totalCost,.04);
});
test('explicit aliases allowed; no fuzzy model or provider matching',()=>{
 assert.equal(estimateRecord(record('gpt-6-luna',buckets(1),'openai-api')).status,'priced');
 assert.equal(estimateRecord(record('gpt-6-luna-maybe',buckets(1))).reason,'unknown_model');
 assert.equal(estimateRecord(record('gpt-6-luna',buckets(1),'unknown-gateway')).reason,'unknown_model');
});
test('Grok Build Fast uses explicit Fast reference, never old all-zero config',()=>{
 const e=estimateRecord(record('grok-4.7-build-fast',buckets(100000,20,20000),'xai'));
 close(e.cost.total,.42024);assert.ok(e.assumptions.includes('grok_build_fast_reference'));assert.match(e.priceSource,/docs.x.ai/);assert.equal(e.priceKind,'official-variant-reference');
});
test('Grok normal threshold is inclusive at 200k',()=>close(estimateRecord(record('grok-4.7',buckets(200000,10),'xai')).cost.total,.80012));
test('MiMo uses published USD rates, does not need a cache-write rate when writes=0',()=>close(estimateRecord(record('mimo-v2.6-pro',buckets(1000,10,500),'xiaomi-token-plan')).cost.total,.0004455));
test('DeepSeek time-of-day discounts cannot be silently guessed',()=>{const e=estimateRecord(record('deepseek-v4-pro',buckets(1000,10,500),'deepseek'));close(e.cost.total,.0006908);close(e.costUpper.total,.0013816);assert.ok(e.assumptions.includes('deepseek_peak_offpeak_range'));});
test('unknown model retains tokens and reason, never a silent neighbor alias',()=>{const e=estimateRecord(record('unpublished',buckets(1000,10)));assert.equal(e.tokens.totalTokens,1010);assert.equal(e.pricedTokens,0);assert.equal(e.reason,'unknown_model');});
test('total-only and invalid/negative buckets are explicit data gaps',()=>{
 assert.equal(estimateRecord(record('gpt-6-luna',{total_tokens:100})).reason,'missing_token_breakdown');
 assert.equal(estimateRecord(record('gpt-6-luna',buckets(-1,10))).reason,'invalid_usage');
 assert.equal(estimateRecord(record('gpt-6-luna',null)).reason,'missing_usage');
});
test('custom exact rates are supported and labeled custom',()=>{
 const e=estimateRecord(record('custom',buckets(1000,10)),{'openai/custom':{input:2,output:4,cacheRead:1,cacheWrite:2}});close(e.cost.total,.00204);assert.equal(e.priceKind,'custom');
 assert.throws(()=>estimateRecord(record('custom',buckets(1)),{'openai/custom':{input:-1,output:4,cacheRead:1,cacheWrite:2}}),/price/);
});
test('all-agent summary includes price-zero input records and honest token coverage',()=>{
 const s=summarizeRecords([{...record('gpt-6-luna',buckets(1000,10)),agent:'a'},{...record('gpt-6-luna',buckets(2000,20)),agent:'b'},record('unknown',buckets(500,5)),record('gpt-6-luna',null)]);
 assert.equal(s.totals.totalTokens,3535);assert.equal(s.totals.pricedTokens,3030);assert.equal(s.totals.missingUsageEntries,1);assert.equal(s.totals.missingCostEntries,1);close(s.totals.totalCost,.000315);assert.equal(s.billingMode,'api-equivalent');
});
test('source duplicates are counted once, genuine identical calls stay separate',()=>{
 const a={...record('gpt-6-luna',buckets(1000)),dedupeKey:'a'};const s=summarizeRecords([a,{...a}, {...a,dedupeKey:'b'}]);assert.equal(s.totals.totalTokens,2000);assert.equal(s.duplicateEntries,1);
});
test('normalized missing aggregate tokens do not imply an extra bucket',()=>{const u=normalizeUsage({...buckets(10,2,100,50),totalTokens:162,reasoningTokens:1});assert.equal(u.totalTokens,162);});

test('Fast reference totals cannot be mistaken for verified public API model pricing',()=>{const s=summarizeRecords([record('grok-4.7-build-fast',buckets(1000),'xai')]);assert.equal(s.totals.referencePriceEntries,1);assert.equal(s.totals.referenceTokens,1000);});
test('OpenAI official 30m/12h write details are disjoint subsets, not extra input',()=>{
 const raw={input_tokens:12000,output_tokens:0,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}};
 const u=normalizeUsage(raw);assert.equal(u.input,1000);assert.equal(u.cacheWrite12h,4000);assert.equal(u.totalTokens,12000);close(estimateRecord(record('gpt-6-luna',u)).cost.total,.001515);
});
test('OpenAI normalized writes without TTL are fully priced as 30m-to-12h interval',()=>{const e=estimateRecord(record('gpt-6-luna',buckets(0,0,0,1000)));close(e.cost.total,.000125);close(e.costUpper.total,.00025);assert.ok(e.assumptions.includes('openai_cache_ttl_unknown'));});
test('string input is invalid, not silently coerced into token evidence',()=>assert.equal(estimateRecord(record('gpt-6-luna',{input:'1000',output:2})).reason,'invalid_usage'));
test('custom long-TTL prices are validated and explicit 12h counters select that rate',()=>{
 assert.throws(()=>estimateRecord(record('custom',buckets(1)),{'openai/custom':{input:1,output:1,cacheRead:1,cacheWrite:1,cacheWrite12h:-1}}),/price/);
 const e=estimateRecord(record('custom',{...buckets(0,0,0,1000),cacheWrite12h:1000}),{'openai/custom':{input:1,output:1,cacheRead:1,cacheWrite:1,cacheWrite12h:3}});close(e.cost.total,.003);
});
test('contradictory Anthropic cache lifetime subtotals cannot be trusted',()=>assert.equal(estimateRecord(record('claude-sonnet-5-5',{input_tokens:1,output_tokens:1,cache_creation_input_tokens:50,cache_creation:{ephemeral_1h_input_tokens:40,ephemeral_5m_input_tokens:15}},'claude-cli')).reason,'invalid_usage'));
test('official coverage excludes priced variant references and custom rates',()=>{
 const s=summarizeRecords([record('gpt-6-luna',buckets(1000)),record('grok-4.7-build-fast',buckets(1000),'xai'),record('custom',buckets(1000))],{overrides:{'openai/custom':{input:1,output:1,cacheRead:1,cacheWrite:1}}});
 assert.equal(s.totals.tokenCoverage,1);assert.equal(s.totals.customTokens,1000);close(s.totals.officialTokenCoverage,1/3);
});

test('unknown or openai provider still prices official DeepSeek IDs at the peak/offpeak range', () => {
  for (const provider of ['unknown', 'openai', '', undefined]) {
    assert.equal(resolveOfficialProvider(provider, 'deepseek-flash'), 'deepseek');
    const e = estimateRecord(record('deepseek-flash', buckets(332, 705), provider));
    assert.equal(e.status, 'priced');
    close(e.cost.total, (332 * .15 + 705 * .6) / 1e6);
    close(e.costUpper.total, (332 * .3 + 705 * 1.2) / 1e6);
    assert.ok(e.assumptions.includes('deepseek_peak_offpeak_range'));
  }
  const s = summarizeRecords([record('deepseek-flash', buckets(332, 705), 'unknown')]);
  assert.equal(s.providers[0].provider, 'deepseek');
  assert.equal(s.models[0].model, 'deepseek/deepseek-flash');
  assert.equal(s.totals.missingCostEntries, 0);
  assert.equal(estimateRecord(record('deepseek-flash-maybe', buckets(332, 705), 'unknown')).reason, 'unknown_model');
  assert.equal(estimateRecord(record('deepseek-chat', buckets(332, 705), 'unknown')).reason, 'unknown_model');
});
