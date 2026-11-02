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
    cliSave: noop, cliPush: (id, message) => messages.push({ id, ...message }), cliAudit: noop,
    process: { kill: (...args) => kills.push(args) }, cliParse: () => [],
    send: (res, status, data) => { res.status = status; res.data = data; },
  };
  vm.createContext(ctx); vm.runInContext(code + ';this.run = cliRun;', ctx);
  const response = () => ({ events: [], writeHead(status) { this.status = status; }, on: noop,
    write(chunk) { this.events.push(chunk); }, end() { this.ended = true; } });
  return { runs, deleted, children, messages, kills, response,
    run: (id, res = response(), req = {}) => ctx.run(req, res, id),
    probe: fn => { probe = fn; }, mkdir: fn => { mkdir = fn; } };
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
