const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8');
const gatewayCode = source.slice(source.indexOf('let ws = null, ready = null'), source.indexOf('const cache = new Map()'));

function harness() {
  const sockets = [], timers = new Map(); let nextTimer = 0;
  const settings = { config: '{"gateway":{"auth":{"token":"local-test-token"}}}', tlsError: null, constructorError: null };
  class Socket {
    constructor() { if (settings.constructorError) throw settings.constructorError; this.frames = []; sockets.push(this); }
    send(data) { if (this.sendError) throw this.sendError; this.frames.push(JSON.parse(data)); }
    message(data) { this.onmessage({ data: JSON.stringify(data) }); }
    close() { this.closeCalls = (this.closeCalls || 0) + 1; this.onclose?.(); }
    challenge() { this.message({ event: 'connect.challenge' }); }
    accept(payload = {}) { this.message({ type: 'res', id: this.frames.at(-1).id, ok: true, payload }); }
  }
  const context = vm.createContext({ WS: Socket, GW: 'wss://local-test.invalid', CFG: 'test-config',
    fs: { readFileSync() { if (settings.config instanceof Error) throw settings.config; return settings.config; } },
    gwTls() { if (settings.tlsError) throw settings.tlsError; return {}; },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(gatewayCode + '\nglobalThis.api = {connect, call, pending: () => pend.size};', context);
  return { ...context.api, sockets, settings, timers };
}

function accept(h, payload) { const s = h.sockets.at(-1); s.challenge(); s.accept(payload); return s; }

test('gateway reuses one handshake and resolves normal RPC replies', async () => {
  const h = harness(), connection = h.connect();
  assert.equal(h.connect(), connection);
  const socket = accept(h, { policy: { maxPayload: 12345 } });
  assert.equal(await connection, socket);
  const result = h.call('health'); await Promise.resolve();
  socket.accept({ ok: true });
  assert.equal((await result).ok, true);
  assert.equal(h.pending(), 0);
  assert.equal(h.timers.size, 0);
});

test('disconnect during challenge fails once without recursion and permits reconnection', async () => {
  const h = harness(), connection = h.connect();
  const rejected = assert.rejects(connection, /连接关闭/), old = h.sockets[0];
  old.challenge(); old.close(); await rejected;
  assert.equal(h.pending(), 0);
  assert.equal(h.timers.size, 0);
  const next = h.connect(), socket = accept(h);
  assert.equal(await next, socket);
  old.close();
  assert.equal(await h.connect(), socket, 'late events from old sockets must not clear the new connection');
});

test('handshake timeout and denial clear pending state and close their socket', async () => {
  for (const reason of ['timeout', 'denied']) {
    const h = harness(), connection = h.connect(), rejected = assert.rejects(connection, /握手超时|denied/);
    const socket = h.sockets[0]; socket.challenge();
    if (reason === 'timeout') [...h.timers.values()][0].fn();
    else socket.message({ type: 'res', id: socket.frames[0].id, ok: false, error: { message: 'denied' } });
    await rejected;
    assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0); assert.ok(socket.closeCalls);
  }
});

test('synchronous certificate and socket construction errors can recover after correction', async () => {
  for (const field of ['tlsError', 'constructorError']) {
    const h = harness(); h.settings[field] = new Error('temporary setup error');
    await assert.rejects(h.connect(), /temporary setup error/);
    h.settings[field] = null;
    const connection = h.connect(), socket = accept(h);
    assert.equal(await connection, socket);
  }
});

test('missing or malformed gateway configuration rejects the request instead of escaping the message callback', async () => {
  for (const config of [new Error('missing config'), '{invalid json', '{}']) {
    const h = harness(); h.settings.config = config;
    const connection = h.connect(), rejected = assert.rejects(connection);
    assert.doesNotThrow(() => h.sockets[0].challenge()); await rejected;
    assert.equal(h.pending(), 0);
    h.settings.config = '{"gateway":{"auth":{"token":"corrected"}}}';
    const next = h.connect(); accept(h); await next;
  }
});

test('disconnect rejects active RPC calls and synchronous send failures leave no pending requests', async () => {
  const h = harness(), connection = h.connect(), socket = accept(h); await connection;
  const call = h.call('health'), rejected = assert.rejects(call, /连接关闭/); await Promise.resolve();
  socket.close(); await rejected; assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
  const next = h.connect(), nextSocket = accept(h); await next;
  nextSocket.sendError = new Error('send failed');
  await assert.rejects(h.call('health'), /send failed/);
  assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
});
