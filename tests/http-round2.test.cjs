const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {PassThrough} = require('node:stream');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const bcrypt = require('bcryptjs');
const checkout = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(checkout, 'server.mjs'), 'utf8');

function parseBody(request) {
  const code = source.slice(source.indexOf('const body = req =>'), source.indexOf('\nhttp.createServer('));
  const context = vm.createContext({Buffer, httpErr:(http, message) => Object.assign(new Error(message), {http})});
  return vm.runInContext(code + ';body;', context)(request);
}

test('request JSON preserves Unicode characters split across network chunks', async () => {
  const request = new PassThrough();
  const parsed = parseBody(request);
  const bytes = Buffer.from(JSON.stringify({message:'星野のねこ 🐱'}));
  for (const byte of bytes) request.write(Buffer.from([byte]));
  request.end();
  assert.equal((await parsed).message, '星野のねこ 🐱');
});

test('invalid, oversized and aborted JSON bodies are classified as client errors', async () => {
  const invalid = new PassThrough(), bad = parseBody(invalid);
  invalid.end('{invalid');
  await assert.rejects(bad, error => error.http === 400);
  const large = new PassThrough(), oversized = parseBody(large);
  large.end(Buffer.alloc(200001, 'a'));
  await assert.rejects(oversized, error => error.http === 413);
  const aborted = new PassThrough(), interrupted = parseBody(aborted);
  aborted.emit('aborted');
  await assert.rejects(interrupted, error => error.http === 400);
});

async function serverFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-http-round2-'));
  let child;
  t.after(async () => {
    if(child && child.exitCode === null) {child.kill('SIGTERM'); await once(child, 'exit');}
    fs.rmSync(root, {recursive:true, force:true});
  });
  fs.copyFileSync(path.join(checkout, 'server.mjs'), path.join(root, 'server.mjs'));
  fs.symlinkSync(path.join(checkout, 'public'), path.join(root, 'public'));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1');
  await once(listener, 'listening'); const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = crypto.randomBytes(24).toString('hex');
  child = spawn(process.execPath, ['server.mjs'], {
    cwd:root, env:{...process.env, PORT:String(port), LOGIN_HASH:bcrypt.hashSync(password, 4),
      NODE_PATH:path.join(checkout, 'node_modules'), OPENCLAW_WORKSPACE:path.join(root, 'workspace'),
      OPENCLAW_CONFIG:path.join(root, 'unconfigured.json'), QQ_SEND_ENABLED:'0'},
    stdio:['ignore','pipe','pipe'],
  });
  let logs = ''; child.stdout.on('data', d => {logs += d;}); child.stderr.on('data', d => {logs += d;});
  for(let i=0; !logs.includes('hosino-console on') && i<100; i++) {
    assert.equal(child.exitCode, null, logs);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.match(logs, /hosino-console on/);
  return {root, port, password, child, base:`http://127.0.0.1:${port}`};
}

test('malformed request URL returns 400 and the real unauthenticated backend remains available', async t => {
  const f = await serverFixture(t);
  const raw = await new Promise((resolve, reject) => {
    const socket = net.connect(f.port, '127.0.0.1'); let response = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('raw HTTP request timeout')));
    socket.on('connect', () => socket.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
    socket.on('data', data => {response += data;}); socket.on('end', () => resolve(response)); socket.on('error', reject);
  });
  assert.match(raw, /^HTTP\/1\.1 400 /);
  const response = await fetch(f.base + '/api/me');
  assert.deepEqual(await response.json(), {authed:false, isOwner:false});
  assert.equal(f.child.exitCode, null);
});

test('real backend returns 400 for invalid JSON and denies expired attachments before cleanup', async t => {
  const f = await serverFixture(t);
  let response = await fetch(f.base + '/api/login', {method:'POST', headers:{'x-hs':'1'}, body:'{invalid'});
  assert.equal(response.status, 400); assert.equal((await response.json()).error, 'JSON 无效');
  response = await fetch(f.base + '/api/login', {method:'POST', headers:{'x-hs':'1'}, body:JSON.stringify({password:f.password})});
  assert.equal(response.status, 200);
  const headers = {cookie:response.headers.get('set-cookie').split(';')[0], 'x-hs':'1'};
  response = await fetch(f.base + '/api/uploads?scope=chat&session=local&name=note.txt', {method:'POST', headers, body:'temporary attachment'});
  assert.equal(response.status, 200); const uploaded = await response.json();
  assert.equal((await fetch(f.base + uploaded.url, {headers})).status, 200);
  const file = path.join(f.root, 'data/uploads', uploaded.id, 'meta.json');
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  metadata.createdAt = Date.now() - 48 * 3600e3; fs.writeFileSync(file, JSON.stringify(metadata));
  assert.ok(fs.existsSync(path.join(f.root, 'data/uploads', uploaded.id, 'f')), 'expired file is still on disk before sweeping');
  response = await fetch(f.base + uploaded.url, {headers});
  assert.equal(response.status, 404); assert.match((await response.json()).error, /过期/);
  assert.equal((await fetch(f.base + uploaded.url, {method:'DELETE', headers})).status, 200);
  assert.equal(f.child.exitCode, null);
});
