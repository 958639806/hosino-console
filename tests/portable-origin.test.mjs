// All origins in behavior fixtures are reserved example domains, never production.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {makeSameOrigin} from '../five-features.mjs';
test('portable release has no inherited production Origin allowlist',()=>{
 const source=fs.readFileSync(new URL('../five-features.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('(process.env.HOSINO_ORIGIN || "")'),'extra trusted origins must be explicit environment configuration');
});
test('same-origin and configured allowlist retain strict cross-site rejection',()=>{
 const check=makeSameOrigin({allowed:[]});
 assert.doesNotThrow(()=>check({headers:{host:'console.example',origin:'https://console.example','sec-fetch-site':'same-origin'}}));
 assert.throws(()=>check({headers:{host:'console.example',origin:'https://unrelated.example'}}),e=>e.http===403);
 assert.throws(()=>check({headers:{host:'console.example',origin:'https://console.example','sec-fetch-site':'cross-site'}}),e=>e.http===403);
 assert.doesNotThrow(()=>makeSameOrigin({allowed:['https://allowed.example']})({headers:{host:'internal.example',origin:'https://allowed.example'}}));
 assert.throws(()=>check({headers:{host:'console.example',referer:'https://unrelated.example/page'}}),e=>e.http===403);
});
