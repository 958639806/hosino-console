// All usage values in this file are synthetic test fixtures.
import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import{mountUsageDetail,renderUsageDetail}from'../public/usage-detail.js';import{summarizeRecords}from'../usage-pricing.mjs';
const r={provider:'openai',model:'gpt-6-luna',timestamp:Date.parse('2026-11-14T01:00Z'),usage:{input:1000,output:10,cacheRead:0,cacheWrite:0}};
const data=()=>({...summarizeRecords([r]),agents:['main'],range:{startMs:1792080000000,endMs:1794672000000},refresh:{status:'fresh',ttlMs:120000},complete:true});
test('real DOM segment switches preserve totals, refresh awaits actual loader and failure keeps stale snapshot',async()=>{const{document}=parseHTML('<html><body><div id="root"></div></body></html>');const root=document.querySelector('#root'),calls=[];let broken=false;await mountUsageDetail(root,async force=>{calls.push(force);if(broken)throw Error('offline');return data();});assert.equal(root.querySelectorAll('[role=tab]').length,4);assert.equal(root.querySelectorAll('.ud-row').length,1);assert.equal(root.querySelectorAll('.ud-row .ud-bucket').length,4);root.querySelector('[data-ud-segment=provider]').onclick();assert.equal(root.querySelector('.ud-row .t').textContent,'openai');await root.querySelector('.ud-refresh').onclick();assert.deepEqual(calls,[false,true]);broken=true;await root.querySelector('.ud-refresh').onclick();assert.match(root.textContent,/旧快照/);assert.match(root.textContent,/1,010/);assert.equal(root.querySelector('[aria-selected=true]').dataset.udSegment,'provider');});
test('missing-token DOM does not present unknown token buckets as zero',()=>{const{document}=parseHTML('<html><body><div id="root"></div></body></html>');const root=document.querySelector('#root');root.innerHTML=renderUsageDetail({...data(),...summarizeRecords([{...r,usage:null}])});assert.ok([...root.querySelectorAll('.ud-row .ud-bucket>b')].every(x=>x.textContent==='无法计算'));assert.match(root.textContent,/无法计算/);});
test('initial fetch error has retry and no fictitious zero or fixture numbers',async()=>{const{document}=parseHTML('<html><body><div id="root"></div></body></html>');const root=document.querySelector('#root');await mountUsageDetail(root,async()=>{throw Error('failed');});assert.match(root.textContent,/无法读取真实统计/);assert.doesNotMatch(root.textContent,/\$0|示例场景/);assert.ok(root.querySelector('.ud-refresh'));});
test('hero interval stays compact while tiny bucket estimates retain precision',()=>{const d=data();d.totals.totalCost=183.4649759642;d.totals.totalCostUpper=194.0228967612;const{document}=parseHTML('<html><body><div id="root"></div></body></html>');const root=document.querySelector('#root');root.innerHTML=renderUsageDetail(d);assert.match(root.querySelector('.big').textContent,/\$183\.46–\$194\.02/);assert.match(root.querySelector('.ud-bucket i').textContent,/0\.0001/);});

test('source dimension labels session vs memory extract and header notes collection cutoff',()=>{
 const session={provider:'openai',model:'gpt-6-luna',source:'session',timestamp:Date.parse('2026-11-14T01:00Z'),usage:{input:1000,output:10,cacheRead:0,cacheWrite:0}};
 const mem={provider:'deepseek',model:'deepseek-flash',source:'memory-extract',timestamp:Date.parse('2026-11-14T02:00Z'),usage:{input:2000,output:20,cacheRead:0,cacheWrite:0}};
 const d={...summarizeRecords([session,mem]),agents:['main'],range:{startMs:1792080000000,endMs:1794672000000},refresh:{status:'fresh',ttlMs:120000},complete:true};
 const {document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const root=document.querySelector('#root');
 root.innerHTML=renderUsageDetail(d,'source');
 assert.match(root.textContent,/合计已包含上线后采集到的记忆抽取/);
 assert.match(root.textContent,/采集上线前的抽取没有 token 记录，无法补计，未计入/);
 const labels=[...root.querySelectorAll('.ud-row .t')].map(x=>x.textContent);
 assert.deepEqual(labels.sort(),['会话','记忆抽取'].sort());
});
test('memory extract missing usage is shown as incalculable, not zero',()=>{
 const mem={provider:'deepseek',model:'deepseek-flash',source:'memory-extract',timestamp:Date.parse('2026-11-14T02:00Z'),usage:null};
 const {document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const root=document.querySelector('#root');
 root.innerHTML=renderUsageDetail({...summarizeRecords([mem]),agents:['main']},'source');
 assert.ok([...root.querySelectorAll('.ud-row .ud-bucket>b')].every(x=>x.textContent==='无法计算'));
 assert.doesNotMatch(root.querySelector('.ud-row').textContent,/\$0/);
});
