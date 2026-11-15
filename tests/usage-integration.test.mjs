// All data, credentials and identifiers in this file are synthetic test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const app=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const server=await fs.readFile(new URL('../server.mjs',import.meta.url),'utf8');
function render(data){const start=app.indexOf('function costSection('),end=app.indexOf('async function authSection(',start);const ctx={section:(_el,_title,_load,draw)=>draw(data),api:{usageCost:()=>data},pill:s=>s,num:n=>String(n),esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};vm.createContext(ctx);vm.runInContext(app.slice(start,end),ctx);return ctx.costSection({});}
test('cost HTTP route invokes local official estimator, never old gateway cost',()=>{
 assert.match(server,/import \{ loadUsageEstimate \} from "\.\/usage-estimate\.mjs"/);
 const route=server.split('"GET /api/usage/cost":')[1].split('\n')[0];assert.match(route,/usageEstimateService.get/);assert.match(server,/createUsageService/);assert.doesNotMatch(route,/call\("usage.cost"/);
});
test('UI labels estimate as non-bill, shows all-agent scope and priced coverage',()=>{
 const h=render({billingMode:'api-equivalent',agents:['main','text-api'],totals:{totalCost:12,totalCostUpper:12,totalTokens:100,pricedTokens:100,tokenCoverage:1,officialTokenCoverage:.935}});
 assert.match(h,/API 等价估价/);assert.match(h,/非实际账单/);assert.match(h,/不含订阅费/);assert.match(h,/100\.0%/);assert.match(h,/同型号官方价覆盖 93\.5%/);assert.match(h,/全部 2 个 agent/);assert.doesNotMatch(h,/实际花费可能更高/);
});
test('UI shows TTL interval, Fast reference and genuine source gaps explicitly',()=>{
 const h=render({billingMode:'api-equivalent',agents:['main'],sourceErrors:[{code:'bad'}],assumptions:['cache_ttl_unknown','grok_build_fast_reference'],totals:{totalCost:10,totalCostUpper:20,totalTokens:100,pricedTokens:80,tokenCoverage:.8,missingCostEntries:1},models:[{model:'<img>',missingCostEntries:1}]});assert.match(h,/10\.00–20\.00/);assert.match(h,/明细（区间下界）/);assert.match(h,/TTL/);assert.match(h,/Fast/);assert.match(h,/数据源/);assert.match(h,/&lt;img&gt;/);assert.doesNotMatch(h,/<img>/);
});
test('old backend cannot be mislabeled an API equivalent estimate',()=>{const h=render({totals:{totalCost:16}});assert.match(h,/旧版统计/);assert.match(h,/尚未统一/);});
test('overview exposes stale real snapshot rather than silently presenting it fresh',()=>{const h=render({billingMode:'api-equivalent',refresh:{status:'stale',ttlMs:120000},updatedAt:Date.parse('2026-11-14T11:00Z'),totals:{totalCost:16,totalCostUpper:16}});assert.match(h,/旧快照/);assert.match(h,/120 秒/);assert.match(h,/SGT/);});
