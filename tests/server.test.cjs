const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const bcrypt = require('bcryptjs');

test('actual HTTP server protects login, authenticates, uploads and removes a file, then logs out', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-http-test-'));
  const checkout = path.resolve(__dirname, '..');
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.copyFileSync(path.join(checkout, 'server.mjs'), path.join(root, 'server.mjs'));
  fs.symlinkSync(path.join(checkout, 'public'), path.join(root, 'public'), 'dir');
  const listener = net.createServer(); listener.listen(0, '127.0.0.1');
  await once(listener, 'listening'); const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = crypto.randomBytes(24).toString('hex');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd:root,
    env:{...process.env, PORT:String(port), LOGIN_HASH:bcrypt.hashSync(password, 4),
      NODE_PATH:path.join(checkout, 'node_modules'), QQ_SEND_ENABLED:'0',
      OPENCLAW_CONFIG:path.join(root, 'unconfigured.json'),
      OPENCLAW_WORKSPACE:path.join(root, 'workspace'), CLI_ROOT:path.join(root, 'cli')},
    stdio:['ignore','pipe','pipe'],
  });
  let output = ''; child.stdout.on('data', d => {output += d;}); child.stderr.on('data', d => {output += d;});
  t.after(async () => {if(child.exitCode === null) {child.kill('SIGTERM'); await once(child, 'exit');}});
  for(let i=0; !output.includes('hosino-console on') && i<100; i++) {
    assert.equal(child.exitCode, null, output);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.match(output, /hosino-console on/);
  const base = `http://127.0.0.1:${port}`;
  let r = await fetch(base + '/'); assert.equal(r.status, 200);
  assert.match(await r.text(), /星野/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(base + '/api/features')).status, 401);
  assert.equal((await fetch(base + '/api/login', {method:'POST', body:'{}'})).status, 403);
  const login = password => fetch(base + '/api/login', {method:'POST',
    headers:{'x-hs':'1','content-type':'application/json'}, body:JSON.stringify({password})});
  const parallel = await Promise.all(Array.from({length:8}, () => login('wrong')));
  assert.equal(parallel.filter(r => r.status === 401).length, 1);
  assert.equal(parallel.filter(r => r.status === 429).length, 7);
  r = await login(password); assert.equal(r.status, 200);
  const rawCookie = r.headers.get('set-cookie');
  assert.match(rawCookie, /HttpOnly; Secure; SameSite=Strict/);
  const headers = {cookie:rawCookie.split(';')[0], 'x-hs':'1'};
  r = await fetch(base + '/api/me', {headers});
  assert.deepEqual(await r.json(), {authed:true,isOwner:true});
  r = await fetch(base + '/api/features', {headers}); assert.equal((await r.json()).qqSend, false);
  const content = 'local upload regression';
  r = await fetch(base + '/api/uploads?scope=chat&session=local-test&name=note.txt', {method:'POST',headers,body:content});
  assert.equal(r.status, 200); const uploaded = await r.json();
  assert.equal(uploaded.name, 'note.txt'); assert.equal(uploaded.size, Buffer.byteLength(content));
  r = await fetch(base + uploaded.url, {headers}); assert.equal(r.status, 200); assert.equal(await r.text(), content);
  r = await fetch(base + uploaded.url, {method:'DELETE',headers}); assert.equal(r.status, 200);
  assert.equal((await fetch(base + uploaded.url, {headers})).status, 404);
  assert.equal((await fetch(base + '/api/logout', {headers})).status, 200);
  r = await fetch(base + '/api/me', {headers});
  assert.deepEqual(await r.json(), {authed:false,isOwner:false});
  assert.equal(child.exitCode, null, 'actual backend remains running without errors');
});
