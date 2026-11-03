const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8');
const code = source.slice(source.indexOf('async function cliRun('), source.indexOf('\nasync function cliRoute('));
function fixture() {
  const runs = new Map(), deleted = new Set(), children = [], messages = [], kills = [];
  let probe = async () => [{ id: 'codex', available: true, authed: true }];
  let mkdir = () => {};
  const noop = () => {}, timer = () => ({ unref() {} });
  let save = noop, push = (id, message) => messages.push({ id, ...message }), parse = () => [];
  const ctx = {
    cliLoad: id => ({ id, tool: 'codex', title: 'existing' }), body: async req => req.body || { prompt: 'hello' },
    UP_MAX_PER_MSG: 10, strLen: s => s.length, CLI_MAX_PROMPT: 32000, CLI_MAX_RUNS: 1,
    cliRuns: runs, cliDeleted: deleted, upResolve: () => [], cliTools: () => probe(),
    path, crypto, CLI_ROOT: '/fake/sandbox', upMarkAttached: noop, upFile: noop,
    cliArgs: () => [], CLI_TOOLS: { codex: { bin: '/fake/codex' } }, CLI_LAUNCH: 'direct',
    fs: { mkdirSync: (...args) => mkdir(...args) }, cliEnv: () => ({}),
    spawn: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 500 + children.length;
      children.push(child); return child;
    },
    cliTimeout: () => 600000, setTimeout: timer, setInterval: timer, clearTimeout: noop, clearInterval: noop,
    cliSave: (...args) => save(...args), cliPush: (...args) => push(...args), cliAudit: noop,
    process: { kill: (...args) => kills.push(args) }, cliParse: (...args) => parse(...args),
    send: (res, status, data) => { res.status = status; res.data = data; },
  };
  vm.createContext(ctx); vm.runInContext(code + ';this.run = cliRun;', ctx);
  const response = () => ({ events: [], writeHead(status) { this.status = status; }, on: noop,
    write(chunk) { this.events.push(chunk); }, end() { this.ended = true; } });
  return { runs, deleted, children, messages, kills, response,
    run: (id, res = response(), req = {}) => ctx.run(req, res, id),
    probe: fn => { probe = fn; }, mkdir: fn => { mkdir = fn; },
    save: fn => { save = fn; }, push: fn => { push = fn; }, parse: fn => { parse = fn; } };
}

test('concurrent requests for one CLI session spawn one process', async () => {
  const f = fixture(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.probe(async () => { await gate; return [{ id: 'codex', available: true, authed: true }]; });
  const one = f.response(), two = f.response();
  const pending = [f.run('same', one), f.run('same', two)];
  release(); await Promise.all(pending);
  assert.equal(f.children.length, 1);
  assert.deepEqual([one.status, two.status].sort(), [200, 409]);
  assert.equal(f.runs.size, 1);
});

test('concurrent different sessions respect the global CLI limit', async () => {
  const f = fixture(), one = f.response(), two = f.response();
  await Promise.all([f.run('one', one), f.run('two', two)]);
  assert.equal(f.children.length, 1);
  assert.deepEqual([one.status, two.status].sort(), [200, 429]);
});

test('unavailable or failed tool probes do not retain a CLI slot', async () => {
  const f = fixture(), denied = f.response();
  f.probe(async () => [{ id: 'codex', available: false }]);
  await f.run('one', denied); assert.equal(denied.status, 409); assert.equal(f.runs.size, 0);
  f.probe(async () => { throw new Error('probe failed'); });
  await assert.rejects(f.run('one'), /probe failed/); assert.equal(f.runs.size, 0);
  f.probe(async () => [{ id: 'codex', available: true, authed: true }]);
  const accepted = f.response(); await f.run('one', accepted); assert.equal(accepted.status, 200);
});

test('pre-spawn filesystem failure releases capacity for a retry', async () => {
  const f = fixture(); f.mkdir(() => { throw new Error('disk unavailable'); });
  await assert.rejects(f.run('one'), /disk unavailable/);
  assert.equal(f.runs.size, 0); assert.equal(f.children.length, 0);
  f.mkdir(() => {}); await f.run('one'); assert.equal(f.children.length, 1);
});

test('normal completion and cancellation release the CLI slot', async () => {
  const f = fixture(); await f.run('one'); f.children[0].emit('close', 0, null);
  assert.equal(f.runs.size, 0);
  const res = f.response(); await f.run('two', res); f.runs.get('two').cancel();
  assert.equal(f.kills[0][1], 'SIGTERM');
  f.children[1].emit('close', null, 'SIGTERM');
  assert.equal(f.runs.size, 0); assert.equal(res.ended, true);
  assert.match(res.events.join(''), /"reason":"cancelled"/);
});

test('a session deleted during an asynchronous tool probe is not started', async () => {
  const f = fixture(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.probe(async () => { await gate; return [{ id: 'codex', available: true, authed: true }]; });
  const res = f.response(), pending = f.run('gone', res);
  f.deleted.add('gone'); release(); await pending;
  assert.equal(res.status, 404); assert.equal(f.children.length, 0); assert.equal(f.runs.size, 0);
});

test('a metadata failure after spawn stops the child and releases its slot before rethrowing', async () => {
  const f = fixture(); f.save(() => { throw new Error('ENOSPC metadata'); });
  await assert.rejects(f.run('same'), /ENOSPC metadata/);
  const old = f.children[0];
  assert.equal(old.listenerCount('error'), 1); assert.equal(old.listenerCount('close'), 1);
  assert.equal(f.runs.size, 0); assert.deepEqual(f.kills[0], [-old.pid, 'SIGTERM']);
  f.save(() => {}); await f.run('same');
  const next = f.runs.get('same');
  assert.doesNotThrow(() => old.emit('close', null, 'SIGTERM'));
  assert.equal(f.runs.get('same'), next, 'the old child must not delete a newer run');
  f.children[1].emit('close', 0, null); assert.equal(f.runs.size, 0);
});

test('a user-message write failure after spawn stops the child even if error logging also fails', async () => {
  const f = fixture(); f.push(() => { throw new Error('ENOSPC messages'); });
  await assert.rejects(f.run('one'), /ENOSPC messages/);
  assert.equal(f.runs.size, 0); assert.equal(f.kills[0][1], 'SIGTERM');
  assert.doesNotThrow(() => f.children[0].emit('close', null, 'SIGTERM'));
  f.push(() => {}); const res = f.response(); await f.run('two', res);
  assert.equal(res.status, 200); f.children[1].emit('close', 0, null);
});

test('metadata persistence errors in the close callback cannot escape or leave a slot occupied', async () => {
  const f = fixture(), res = f.response(); await f.run('one', res);
  f.save(() => { throw new Error('ENOSPC final metadata'); });
  assert.doesNotThrow(() => f.children[0].emit('close', 0, null));
  assert.equal(f.runs.size, 0); assert.equal(res.ended, true);
  assert.match(res.events.join(''), /event: error\ndata: .*ENOSPC final metadata/);
  assert.equal(res.events.filter(e => e.startsWith('event: done\n')).length, 1);
  f.save(() => {}); await f.run('two'); assert.equal(f.runs.size, 1);
  f.children[1].emit('close', 0, null);
});

test('a final assistant-message write failure still closes the stream and releases capacity', async () => {
  const f = fixture(), res = f.response(); f.parse(() => [{type:'delta', text:'answer'}]);
  await f.run('one', res); f.children[0].stdout.emit('data', '{}\n');
  f.push(() => { throw new Error('ENOSPC final answer'); });
  assert.doesNotThrow(() => f.children[0].emit('close', 0, null));
  assert.equal(f.runs.size, 0); assert.equal(res.ended, true);
  assert.match(res.events.join(''), /ENOSPC final answer/);
  assert.equal(res.events.filter(e => e.startsWith('event: done\n')).length, 1);
});

test('spawn errors finish once without signalling an undefined PID or waiting for close', async () => {
  const f = fixture(), res = f.response(); await f.run('one', res);
  f.children[0].pid = undefined;
  assert.doesNotThrow(() => f.children[0].emit('error', new Error('ENOENT executable')));
  assert.equal(f.runs.size, 0); assert.equal(res.ended, true); assert.equal(f.kills.length, 0);
  assert.match(res.events.join(''), /启动失败：ENOENT executable/);
  assert.doesNotThrow(() => f.children[0].emit('close', -2, null));
  assert.equal(res.events.filter(e => e.startsWith('event: done\n')).length, 1);
  await f.run('two'); assert.equal(f.runs.size, 1); f.children[1].emit('close', 0, null);
});

test('streaming persistence errors terminate the child and ignore later output and duplicate termination', async () => {
  const f = fixture(), res = f.response(); await f.run('one', res);
  f.parse(() => [{type:'session', id:'new-cli-session'}]);
  f.save(() => { throw new Error('ENOSPC streaming metadata'); });
  assert.doesNotThrow(() => f.children[0].stdout.emit('data', '{}\n'));
  assert.equal(f.runs.size, 0); assert.equal(res.ended, true);
  assert.equal(f.kills.length, 1); assert.equal(f.kills[0][1], 'SIGTERM');
  assert.doesNotThrow(() => f.children[0].stdout.emit('data', '{}\n'));
  assert.doesNotThrow(() => f.children[0].emit('error', new Error('late error')));
  assert.doesNotThrow(() => f.children[0].emit('close', null, 'SIGTERM'));
  assert.equal(res.events.filter(e => e.startsWith('event: done\n')).length, 1);
});
