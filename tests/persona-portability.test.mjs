// Synthetic owner IDs are generated repeating characters, never real QQ identities.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {makePersonaRuntime} from '../persona-runtime.mjs';
async function runtime(t,ownerId){const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hs-persona-fake-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));return makePersonaRuntime({ownerId,logDir:path.join(tmp,'logs'),funDir:path.join(tmp,'fun'),pluginsDir:path.join(tmp,'plugins'),dataFile:path.join(tmp,'runtime.json')});}
test('missing owner configuration is unknown, not another users private identity or active status',async t=>{
 const rt=await runtime(t,'');const d=rt.view({enabled:true,c2c:{enabled:true},c2cTyping:{enabled:true}}).c2c;
 assert.equal(d.ownerConfigured,false);assert.equal(d.optedOut,null);assert.ok(Object.values(d.features).every(f=>f.text==='未配置私聊对象'));assert.ok(Object.values(d.features).every(f=>f.status==='pending'&&f.detail.includes('HOSINO_OWNER_OPENID')));
});
test('explicit synthetic owner configuration still recognizes that owners opt-out',async t=>{
 const fake='a'.repeat(32),rt=await runtime(t,fake);const d=rt.view({enabled:true,c2c:{enabled:true},optOut:{[fake]:['all']}}).c2c;assert.equal(d.ownerConfigured,true);assert.equal(d.optedOut,true);
});
