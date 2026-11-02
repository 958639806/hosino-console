const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8');
const authCode = source.slice(source.indexOf('const sessions = new Map()'), source.indexOf('// ---------- 网关客户端'));
const loginCode = source.slice(source.indexOf('    if (u.pathname === "/api/login"'), source.indexOf('    if (u.pathname === "/api/logout"'));

function harness() {
  let now = 1_000_000, nextTimer = 0, checks = 0;
  const timers = new Map();
  const context = vm.createContext({ crypto, HASH: 'local-test-hash',
    Date: { now: () => now },
    setInterval: () => ({ unref() {} }),
    setTimeout(fn, ms) { const id = ++nextTimer; if (ms === 600) queueMicrotask(fn); else timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    body: req => req.read ? req.read() : Promise.resolve({ password: req.password }),
    bcrypt: { async compare(password) { checks++; return password === 'correct'; } },
    send(res, status, data, headers = {}) { Object.assign(res, { status, data, headers }); return res; },
  });
  vm.runInContext(authCode + '\nglobalThis.handle = async (req, res = {}) => { const u = {pathname: "/api/login"}; try {\n' + loginCode +
    '\n} catch (error) { return send(res, error.http || 502, {error: error.message}); } }; globalThis.state = {fails, loginPending, sessions, WIN};', context);
  const request = (password = 'wrong', extra = {}) => context.handle({ method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' }, password, ...extra });
  return { request, state: context.state, checks: () => checks,
    advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } }, timers };
}

test('first concurrent login requests admit only one verification and count its failure', async () => {
  const h = harness(); let release;
  const first = h.request('wrong', { read: () => new Promise(resolve => { release = resolve; }) });
  const parallel = await Promise.all(Array.from({length: 8}, () => h.request()));
  assert.ok(parallel.every(r => r.status === 429)); assert.equal(h.checks(), 0);
  release({password: 'wrong'});
  assert.equal((await first).status, 401);
  assert.equal(h.state.fails.get('127.0.0.1').n, 1); assert.equal(h.checks(), 1);
  assert.equal(h.state.loginPending.size, 0);
});

test('five failures lock the IP for fifteen minutes, including requests with the correct password', async () => {
  const h = harness();
  for (let i = 1; i <= 5; i++) { const r = await h.request(); assert.equal(r.status, 401); assert.equal(h.state.fails.get('127.0.0.1').n, i); }
  assert.equal((await h.request('correct')).status, 429); assert.equal(h.checks(), 5);
  h.advance(h.state.WIN - 1); assert.equal((await h.request()).status, 429);
  h.advance(1); assert.equal((await h.request()).status, 401);
  assert.equal(h.state.fails.get('127.0.0.1').n, 1);
});

test('successful authentication resets failures and retains secure session cookie semantics', async () => {
  const h = harness(); await h.request(); await h.request();
  const r = await h.request('correct'); assert.equal(r.status, 200); assert.equal(r.data.ok, true);
  assert.match(r.headers['set-cookie'], /hs_sid=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(h.state.fails.size, 0); assert.equal(h.state.sessions.size, 1); assert.equal(h.state.loginPending.size, 0);
  await h.request(); assert.equal(h.state.fails.get('127.0.0.1').n, 1);
});

test('failure windows reset without replacing the record of an active request', async () => {
  const h = harness(); await h.request(); h.advance(h.state.WIN - 1);
  let release; const first = h.request('wrong', {read: () => new Promise(resolve => {release = resolve;})});
  const record = h.state.fails.get('127.0.0.1'); h.advance(1);
  assert.equal((await h.request()).status, 429); assert.equal(h.state.fails.get('127.0.0.1'), record);
  release({password:'wrong'}); await first;
  assert.equal(record.n, 1); assert.equal(h.state.loginPending.size, 0);
});

test('a stalled or failed request body releases the per-IP slot for a later login', async () => {
  const h = harness(); const stalled = h.request('wrong', {read: () => new Promise(() => {})});
  assert.equal((await h.request('correct')).status, 429);
  h.advance(10000); assert.equal((await stalled).status, 408); assert.equal(h.state.loginPending.size, 0);
  assert.equal((await h.request('correct')).status, 200);
  const invalid = await h.request('wrong', {read: () => Promise.reject(new Error('invalid body'))});
  assert.equal(invalid.status, 502); assert.equal(h.state.loginPending.size, 0);
  assert.equal((await h.request('correct')).status, 200); assert.equal(h.timers.size, 0);
});

test('different IPs can authenticate independently', async () => {
  const h = harness(); let release;
  const first = h.request('wrong', {read: () => new Promise(resolve => {release = resolve;})});
  assert.equal((await h.request('correct', {socket:{remoteAddress:'127.0.0.2'}})).status, 200);
  release({password:'wrong'}); await first;
});
