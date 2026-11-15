// Every credential, event, provider account and usage value in this test is FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import http from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';
import bcrypt from 'bcryptjs';
const root=path.resolve(import.meta.dirname,'..');
async function availablePort(){const s=http.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;}
test('clean full process starts and serves authenticated all-agent real-reader estimates without upstream calls',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hs-install-fake-'));let upstreamCalls=0;
 const upstream=http.createServer((req,res)=>{upstreamCalls++;res.writeHead(503).end();});upstream.on('upgrade',(_,s)=>{upstreamCalls++;s.destroy();});upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const port=await availablePort(),base='http://127.0.0.1:'+port,password='FAKE_TEST_PASSWORD_NOT_A_REAL_SECRET';
 const state=path.join(tmp,'fake-state');await fs.mkdir(state,{recursive:true});await fs.writeFile(path.join(state,'openclaw.json'),JSON.stringify({gateway:{auth:{token:'FAKE_TEST_GATEWAY_TOKEN_NOT_REAL'}}}));
 for(const [agent,provider,model,usage]of[['fake-codex','openai-codex','gpt-6-luna',{input:100,output:10,cacheRead:900,cacheWrite:0}],['fake-claude','claude-cli','claude-haiku-5-5',{input:50,output:5,cacheRead:100,cacheWrite:20,cacheWrite1h:0,cacheTtlKnown:true}]]){
  const dir=path.join(state,'agents',agent,'sessions');await fs.mkdir(dir,{recursive:true});const e=JSON.stringify({id:'FAKE_EVENT_'+agent,type:'message',timestamp:new Date().toISOString(),message:{role:'assistant',provider,model,usage:{...usage,cost:{total:0}}}})+'\n';await fs.writeFile(path.join(dir,'fake.jsonl'),e);await fs.writeFile(path.join(dir,'fake.jsonl.reset.test'),e);
 }
 const env={PATH:process.env.PATH,HOME:tmp,PORT:String(port),LOGIN_HASH:await bcrypt.hash(password,4),OPENCLAW_CONFIG:path.join(state,'openclaw.json'),OPENCLAW_HOME:state,OPENCLAW_WORKSPACE:path.join(tmp,'fake-workspace'),HOSINO_CLI_HOME:tmp,HOSINO_USAGE_STATE_DIR:state,GATEWAY_URL:'ws://127.0.0.1:'+upstream.address().port,QDRANT_URL:'http://127.0.0.1:'+upstream.address().port};
 const child=spawn(process.execPath,['--import',path.join(root,'tests/helpers/network-guard.mjs'),'server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('startup timed out: '+output)),10000);const ready=()=>{if(output.includes('hosino-console on')){clearTimeout(timeout);resolve();}};child.stdout.on('data',ready);child.once('exit',code=>{clearTimeout(timeout);reject(Error('early exit '+code+': '+output));});ready();});
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/usage/cost')).status,401);
  assert.equal((await(await fetch(base+'/api/me')).json()).authed,false);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'x-hs':'1','content-type':'application/json',origin:base},body:JSON.stringify({password})});assert.equal(login.status,200);
  const setCookie=login.headers.get('set-cookie');assert.ok(setCookie?.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Strict'));
  const headers={cookie:setCookie.split(';')[0],'x-hs':'1'};
  const res=await fetch(base+'/api/usage/cost?days=30',{headers});assert.equal(res.status,200);const d=await res.json();assert.equal(d.billingMode,'api-equivalent');assert.equal(d.timezone,'Asia/Singapore');assert.equal(d.complete,true);assert.deepEqual(d.agents,['fake-claude','fake-codex']);assert.equal(d.totals.totalTokens,1185);assert.equal(d.totals.pricedEntries,2);assert.ok(d.totals.totalCost>0);assert.equal(d.totals.officialTokenCoverage,1);
  for(const rows of [d.models,d.providers,d.daily])for(const k of ['input','output','cacheRead','cacheWrite','totalTokens','totalCost','totalCostUpper'])assert.ok(Math.abs(rows.reduce((s,r)=>s+r[k],0)-d.totals[k])<1e-9,k);
  const again=await(await fetch(base+'/api/usage/cost?days=30',{headers})).json();assert.equal(again.refresh.cacheHit,true);assert.equal((await(await fetch(base+'/api/usage/cost?days=30&refresh=1',{headers})).json()).refresh.cacheHit,false);
  for(const file of await fs.readdir(path.join(root,'public'))){const r=await fetch(base+'/'+file);assert.equal(r.status,200,file);assert.equal(Buffer.compare(Buffer.from(await r.arrayBuffer()),await fs.readFile(path.join(root,'public',file))),0,file);}
  for(const file of ['demo.html','usage-detail-example.js','demo-guard.js'])assert.equal((await fetch(base+'/'+file)).status,404);
  assert.equal((await fetch(base+'/api/usage/cost',{method:'POST',headers:{...headers,origin:'https://invalid.example','sec-fetch-site':'cross-site'}})).status,403);
  await fetch(base+'/api/logout',{headers});assert.equal((await fetch(base+'/api/usage/cost',{headers})).status,401);assert.equal(upstreamCalls,0,'startup/login/usage/static never call mock upstream, let alone real QQ/models');
 }finally{const exited=once(child,'exit');child.kill('SIGTERM');await exited;upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await fs.rm(tmp,{recursive:true,force:true});}
});
