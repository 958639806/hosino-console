// Privacy checks inspect source structure without printing any former private values.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const src=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('release initializes an empty alias map, never private QQ identities',()=>{
 const literal=src.match(/^const ALIAS_DEFAULT = (.*);$/m)?.[1];assert.ok(literal);assert.equal(Object.keys(JSON.parse(literal)).length,0);
});
test('memory bucket is explicitly configurable and has a nonpersonal default',()=>{
 assert.ok(src.includes('const MEM_BUCKET_DEFAULT = process.env.MEM0_USER_ID || "default";'));
});
test('release does not seed a private other-bot QQ identity',()=>{
 const line=src.split('\n').find(l=>l.trim().startsWith('jealousy:'));
 assert.ok(line?.includes('otherBots: []'),'configure peers in your own local state');
});
