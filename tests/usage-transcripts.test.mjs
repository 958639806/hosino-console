// All data, credentials and identifiers in this file are synthetic test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { readUsageTranscripts } from '../usage-transcripts.mjs';
import { loadUsageEstimate, usageDateRange } from '../usage-estimate.mjs';
const event=(id,input=1000)=>({id,type:'message',timestamp:'2026-11-14T01:00:00Z',message:{role:'assistant',provider:'openai',model:'gpt-6-luna',content:'PRIVATE_BODY_DO_NOT_RETURN',usage:{input,output:10,cacheRead:0,cacheWrite:0,cost:{total:0}}}});
async function root(t){const p=await fs.mkdtemp(path.join(os.tmpdir(),'hs-usage-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p;}
async function jsonl(p,a,n,rows){const dir=path.join(p,'agents',a,'sessions');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,n),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');}
test('all agents and reset/deleted JSONL included; message usage wins, body excluded',async t=>{
 const p=await root(t);const e=event('a');e.usage={input:99999,output:1};await jsonl(p,'main','a.jsonl',[e]);await jsonl(p,'text-api','b.jsonl.deleted.date',[event('b',2000)]);
 const s=await readUsageTranscripts({stateDir:p});assert.equal(s.records.length,2);assert.deepEqual(s.agents,['main','text-api']);assert.equal(s.records[0].usage.input,1000);assert.ok(!JSON.stringify(s).includes('PRIVATE_BODY'));
 const r=await loadUsageEstimate({stateDir:p,days:30,now:Date.parse('2026-11-14T05:00Z')});assert.equal(r.totals.totalTokens,3020);assert.equal(r.totals.tokenCoverage,1);
});
test('SQLite compressed rows and deleted zstd archives included, file mirrors deduplicated',async t=>{
 const p=await root(t),dir=path.join(p,'agents','main','agent');await fs.mkdir(dir,{recursive:true});
 const dbp=path.join(dir,'openclaw-agent.sqlite'),db=new DatabaseSync(dbp);
 db.exec('CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,event_zstd BLOB,created_at INTEGER);CREATE TABLE session_transcript_archives(session_id TEXT,archive_name TEXT,archive_blob BLOB,encoding TEXT);');
 db.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,?)').run('s',1,null,zstdCompressSync(Buffer.from(JSON.stringify(event('a')))),0);
 const blob=zstdCompressSync(Buffer.from(JSON.stringify(event('b',2000))+'\n'));db.prepare('INSERT INTO session_transcript_archives VALUES(?,?,?,?)').run('s','s.jsonl.deleted.x.zst',blob,'zstd');db.close();
 await jsonl(p,'main','s.jsonl',[event('a')]);await fs.writeFile(path.join(p,'agents','main','sessions','s.jsonl.deleted.x.zst'),blob);
 const before=(await fs.stat(dbp)).mtimeMs,s=await readUsageTranscripts({stateDir:p});assert.equal(s.records.length,2);assert.equal(s.sourceErrors.length,0);assert.equal((await fs.stat(dbp)).mtimeMs,before);
});
test('same event copied into archives counted once, distinct IDs both counted',async t=>{
 const p=await root(t);await jsonl(p,'main','s.jsonl',[event('a'),event('b')]);await jsonl(p,'main','s.jsonl.reset.x',[event('a')]);const r=await loadUsageEstimate({stateDir:p,now:Date.parse('2026-11-14T05:00Z')});assert.equal(r.totals.totalTokens,2020);
});
test('corrupt source is visible rather than a silently successful zero',async t=>{
 const p=await root(t);await jsonl(p,'main','s.jsonl',[event('a')]);await fs.appendFile(path.join(p,'agents','main','sessions','s.jsonl'),'{BROKEN SECRET_FAKE_BODY');const r=await loadUsageEstimate({stateDir:p,now:Date.parse('2026-11-14T05:00Z')});assert.equal(r.complete,false);assert.equal(r.sourceErrors.length,1);assert.ok(!JSON.stringify(r).includes('SECRET_FAKE_BODY'));
});
test('missing state root reports unavailable source, not complete empty usage',async()=>{const r=await loadUsageEstimate({stateDir:'/not-a-real-state-dir-for-test'});assert.equal(r.complete,false);assert.ok(r.sourceErrors.length);});
test('SGT date boundaries include local midnight, explicit end date inclusive',()=>{
 const r=usageDateRange({days:30,now:Date.parse('2026-11-14T05:00Z')});assert.equal(new Date(r.startMs).toISOString(),'2026-10-15T16:00:00.000Z');
 const e=usageDateRange({startDate:'2026-11-14',endDate:'2026-11-14'});assert.equal(e.endMs-e.startMs,864e5);assert.throws(()=>usageDateRange({startDate:'2026-02-30',endDate:'2026-03-01'}),/date/);
});
