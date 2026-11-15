// All data, credentials and identifiers in this file are synthetic test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('complete runtime ships every root local import including ASR and pricing',()=>{
 const server=fs.readFileSync(path.join(root,'server.mjs'),'utf8');
 const imports=[...server.matchAll(/from\s+["'](\.\/[A-Za-z0-9_.\/-]+)["']/g)].map(m=>m[1]);
 assert.equal(imports.length,15,'15 direct current-production modules plus their transitive imports');
 for(const ref of imports)assert.ok(fs.existsSync(path.join(root,ref)),`missing local module: ${ref}`);
 for(const name of ['asr-mimo.mjs','usage-service.mjs','secrets.mjs'])assert.ok(imports.includes('./'+name));
});
test('package supports locked independent install and Node sqlite/zstd runtime',()=>{
 assert.ok(fs.existsSync(path.join(root,'package.json')),'root package manifest required');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 assert.equal(pkg.scripts.start,'node server.mjs');assert.match(pkg.engines.node,/24\.21/);
 assert.ok(pkg.dependencies.bcryptjs&&pkg.dependencies.ws);assert.ok(fs.existsSync(path.join(root,'package-lock.json')));
 assert.equal(fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),'2026.11.15.1');
});
test('runtime defaults contain no production-specific home or installation paths',()=>{
 const src=fs.readFileSync(path.join(root,'server.mjs'),'utf8');
 assert.doesNotMatch(src,/\/home\/ubuntu|\/opt\/hosino-console|mem0_full_timestamped/);
 assert.match(src,/process\.env\.HOSINO_CLI_HOME/);assert.match(src,/homedir\(\)/);
});
test('production resource graph includes detail/folding but excludes demo fixture',()=>{
 for(const file of ['public/index.html','public/app.js','public/api.js','public/sw.js','public/usage-detail.js','public/usage-detail.css','public/model-collapse.js'])assert.ok(fs.existsSync(path.join(root,file)),file);
 for(const file of ['public/demo.html','public/usage-detail-example.js','public/demo-guard.js'])assert.equal(fs.existsSync(path.join(root,file)),false,file);
});
test('recursive runtime imports and production static references all resolve locally',async()=>{
 // Premise disproved: regex scanning "from" also matched a UI string literal.
 // Use the Node ECMAScript parser and an actual HTML DOM instead.
 const {execFileSync}=await import('node:child_process');const {parseHTML}=await import('linkedom');
 const files=[...fs.readdirSync(root).filter(f=>f.endsWith('.mjs')).map(f=>path.join(root,f)),...fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.js')).map(f=>path.join(root,'public',f))];
 const graph=JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules',path.join(root,'tests/helpers/module-graph.mjs'),...files],{encoding:'utf8'}));
 const visit=(file,seen=new Set())=>{if(seen.has(file))return;seen.add(file);for(const value of graph[file]||[])if(value.startsWith('.')){const target=path.resolve(path.dirname(file),value.split('?')[0]);assert.ok(fs.existsSync(target),path.relative(root,file)+' -> '+value);visit(target,seen);}return seen;};
 assert.equal(visit(path.join(root,'server.mjs')).size,18,'18 complete production runtime modules');
 for(const file of files.filter(f=>f.includes(path.sep+'public'+path.sep)))visit(file);
 for(const file of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){const {document}=parseHTML(fs.readFileSync(path.join(root,'public',file),'utf8'));for(const el of document.querySelectorAll('[src],[href]')){const ref=(el.getAttribute('src')||el.getAttribute('href')).split(/[?#]/)[0];if(!ref||/^(?:[a-z]+:|\/\/)/i.test(ref))continue;assert.ok(fs.existsSync(path.join(root,'public',ref==='/'?'index.html':ref.replace(/^\//,''))),file+' -> '+ref);}}
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/manifest.webmanifest')));for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,'public',icon.src.replace(/^\//,''))));
});
