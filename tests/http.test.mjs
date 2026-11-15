// Synthetic fixture only; session cookie is local to the isolated handler harness.
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import{startHarness}from'./http-harness.mjs';
import os from 'node:os';
const rootDir=path.resolve(import.meta.dirname,'..');
const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'hs-http-fake-'));
const dir=path.join(stateDir,'agents','fake-agent','sessions');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'fake-session.jsonl'),JSON.stringify({id:'FAKE_EVENT',type:'message',timestamp:new Date().toISOString(),message:{role:'assistant',provider:'openai',model:'gpt-6-luna',usage:{input:1000,output:10,cacheRead:2000,cacheWrite:0,cost:{total:0}}}})+'\n');
test('actual HTTP handler enforces auth/same-origin and serves real read-only aggregate contract and assets',async()=>{const h=await startHarness({rootDir,stateDir});try{
 let r=await fetch(h.base+'/api/usage/cost');assert.equal(r.status,401);assert.equal(r.headers.get('access-control-allow-origin'),null);
 const headers={cookie:'hs_sid='+h.sid,'X-HS':'1'};
 r=await fetch(h.base+'/api/usage/cost?days=30',{headers});assert.equal(r.status,200);const d=await r.json();assert.equal(d.billingMode,'api-equivalent');assert.equal(d.complete,true);assert.equal(d.refresh.status,'fresh');assert.equal(d.refresh.ttlMs,120000);assert.ok(d.totals.totalTokens>0);
 for(const rows of [d.models,d.providers,d.daily])for(const k of ['input','output','cacheRead','cacheWrite','totalTokens','totalCost','totalCostUpper','inputCost','outputCost','cacheReadCost','cacheWriteCost','inputCostUpper','outputCostUpper','cacheReadCostUpper','cacheWriteCostUpper'])assert.ok(Math.abs(rows.reduce((s,x)=>s+x[k],0)-d.totals[k])<1e-6,k);
 r=await fetch(h.base+'/api/usage/cost?days=30',{headers});assert.equal((await r.json()).refresh.cacheHit,true);
 r=await fetch(h.base+'/api/usage/cost?days=30&refresh=1',{headers});assert.equal((await r.json()).refresh.cacheHit,false);
 r=await fetch(h.base+'/api/usage/cost?startDate=bad&endDate=bad',{headers});assert.equal(r.status,400);
 r=await fetch(h.base+'/api/usage/cost',{method:'POST',headers:{...headers,origin:'https://invalid.example','sec-fetch-site':'cross-site'}});assert.equal(r.status,403);
 for(const p of ['/','/app.js?v=2026.11.14.1-usage','/usage-detail.js?v=2026.11.14.1-usage','/usage-detail.css?v=2026.11.14.1-usage']){r=await fetch(h.base+p);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);}
 for(const p of ['/usage-detail-example.js','/demo.html','/demo-guard.js']){r=await fetch(h.base+p);assert.equal(r.status,404);}
 h.sessions.set(h.sid,Date.now()-1);assert.equal((await fetch(h.base+'/api/usage/cost',{headers})).status,401);

 }finally{await h.close();fs.rmSync(stateDir,{recursive:true,force:true});}});
