const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8');
const code = source.slice(source.indexOf('const lastJson ='), source.indexOf('// ---------- HS-DIGEST-DELIVER'));
function fixture() {
  let now = Date.parse('2026-11-02T14:05:00Z'), failures = 0, modelCalls = 0, historyCalls = 0, globalReads = 0, saveFails = 0, aliasFails = false;
  let state = { enabled: true, time: '22:00', sessions: { group: true }, lastRun: {} };
  const files = new Map(), prompts = [], deliveries = {}, originalTime = now;
  const sgParts = (ms = now) => {
    const date = new Date(ms + 8 * 3600e3).toISOString();
    return { day: date.slice(0, 10), hm: date.slice(11, 16) };
  };
  const ctx = {
    crypto, path, DIGEST_DIR: '/fake/digests', TZ: 'Asia/Singapore', DIGEST_TEXT_MODEL: '', DIGEST_IMAGE_MODEL: 'image-model',
    aliasFor: () => { if (aliasFails) throw new Error('aliases unavailable'); return 'target group'; }, httpErr: (status, message) => Object.assign(new Error(message), { http: status }),
    Date: class extends Date { static now() { return now; } }, sgParts, sgDayOf: ms => sgParts(ms).day,
    call: async (method, params) => { assert.equal(method, 'chat.history'); assert.equal(params.sessionKey, 'group'); historyCalls++; return {}; },
    buildHistory: () => ({ messages: [{ ts: originalTime, role: 'user', content: 'TARGET_GROUP_MESSAGE' }] }), textOf: m => m.content,
    fs: {
      readdirSync: () => { globalReads++; return ['2026-11-02-private.md']; },
      readFileSync: name => { if (name.includes('/memory/')) { globalReads++; return 'PRIVATE_DIARY_SECRET'; }
        if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(name); },
      existsSync: name => files.has(name), chmodSync() {},
    }, WORKSPACE: '/private/workspace',
    atomicWrite: (name, content) => { if (saveFails-- > 0) throw new Error('disk full'); files.set(name, content); },
    runCli: async args => {
      if (args[1] === 'model') { modelCalls++; prompts.push(args[args.indexOf('--prompt') + 1]);
        return modelCalls <= failures ? { e: 'temporary model outage', o: '' } : { e: null, o: JSON.stringify({ text: 'Group summary\n画面：cat' }) }; }
      return { e: 'image unavailable', o: '' };
    },
    digestSettings: { load: () => state, save: next => { state = structuredClone(next); } },
    digestDelivery: { load: () => ({ records: deliveries }) },
    setInterval: () => ({ unref() {} }), console: { error() {} },
  };
  vm.createContext(ctx); vm.runInContext(code + ';this.api = {runDigest, digestGenerateTick, digestIdFor, digestRunning};', ctx);
  const key = '/fake/digests/' + ctx.api.digestIdFor('group', '2026-11-02') + '.json';
  return { api: ctx.api, files, key, prompts, deliveries, sgParts,
    state: () => state, stats: () => ({ modelCalls, historyCalls, globalReads }),
    advance: ms => { now += ms; }, failModels: count => { failures = count; }, failSaves: count => { saveFails = count; }, failAliases: value => { aliasFails = value; } };
}

test('group digest uses only target history and never reads global daily memories', async () => {
  const f = fixture(), result = await f.api.runDigest('group', '2026-11-02');
  assert.equal(result.status, 'partial'); assert.equal(result.notesUsed, false);
  assert.equal(f.stats().globalReads, 0);
  assert.match(f.prompts[0], /TARGET_GROUP_MESSAGE/);
  assert.doesNotMatch(f.prompts[0], /PRIVATE_DIARY_SECRET|【记忆小结】/);
});

test('failed generation retries after backoff and marks lastRun only after success', async () => {
  const f = fixture(); f.failModels(1); await f.api.digestGenerateTick();
  assert.equal(f.state().lastRun.group, undefined); assert.equal(f.state().lastAttempt.group.status, 'error');
  await f.api.digestGenerateTick(); assert.equal(f.stats().modelCalls, 1);
  f.advance(60e3); await f.api.digestGenerateTick();
  assert.equal(f.stats().modelCalls, 2); assert.equal(f.state().lastRun.group, '2026-11-02');
  assert.equal(f.state().lastAttempt.group.status, 'partial');
  f.advance(600e3); await f.api.digestGenerateTick(); assert.equal(f.stats().modelCalls, 2);
});

test('automatic attempts are bounded while manual recovery remains available', async () => {
  const f = fixture(); f.failModels(10);
  await f.api.digestGenerateTick(); f.advance(60e3); await f.api.digestGenerateTick();
  f.advance(180e3); await f.api.digestGenerateTick(); f.advance(3600e3); await f.api.digestGenerateTick();
  assert.equal(f.stats().modelCalls, 3); assert.equal(f.state().lastAttempt.group.attempts, 3);
  f.failModels(0); const recovered = await f.api.runDigest('group', '2026-11-02');
  assert.equal(recovered.status, 'partial'); assert.equal(recovered.trigger, 'manual');
  await f.api.digestGenerateTick(); assert.equal(f.stats().modelCalls, 4);
  assert.equal(JSON.parse(f.files.get(f.key)).trigger, 'manual');
});

test('a legacy lastRun marker does not suppress retry of a failed report', async () => {
  const f = fixture(); f.state().lastRun.group = '2026-11-02';
  f.files.set(f.key, JSON.stringify({ status: 'error' }));
  f.failModels(1); await f.api.digestGenerateTick(); assert.equal(f.stats().modelCalls, 1);
  assert.equal(f.state().lastRun.group, undefined);
});

test('persisted running attempts retain backoff across a process restart', async () => {
  const f = fixture();
  f.state().lastAttempt = { group: { day: '2026-11-02', attempts: 1, status: 'running', nextAt: Date.parse('2026-11-02T14:06:00Z') } };
  await f.api.digestGenerateTick(); assert.equal(f.stats().historyCalls, 0);
  f.advance(60e3); await f.api.digestGenerateTick();
  assert.equal(f.stats().historyCalls, 1); assert.equal(f.state().lastAttempt.group.attempts, 2);
});

test('automatic attempt limits reset on the next Singapore day', async () => {
  const f = fixture();
  f.state().lastAttempt = { group: { day: '2026-11-02', attempts: 3, status: 'error' } };
  f.advance(86400e3); await f.api.digestGenerateTick();
  assert.equal(f.stats().historyCalls, 1); assert.equal(f.state().lastAttempt.group.attempts, 1);
  assert.equal(f.state().lastRun.group, '2026-11-03');
});

test('automatic retry never overwrites completed reports or partially sent delivery', async () => {
  for (const record of [{ status: 'ok' }, { status: 'partial' }, { status: 'empty' }]) {
    const f = fixture(), saved = JSON.stringify({ ...record, trigger: 'manual', text: 'KEEP_ME' });
    f.files.set(f.key, saved); await f.api.digestGenerateTick();
    assert.equal(f.stats().historyCalls, 0); assert.equal(f.files.get(f.key), saved);
  }
  for (const delivery of [{ status: 'delivered' }, { image: 'sent', text: 'pending' }, { text: 'sent', image: 'pending' }]) {
    const f = fixture(); f.deliveries[f.api.digestIdFor('group', '2026-11-02')] = delivery;
    await f.api.digestGenerateTick(); assert.equal(f.stats().historyCalls, 0);
  }
});

test('a report persistence failure remains retryable rather than marking success', async () => {
  const f = fixture(); f.failSaves(1); await f.api.digestGenerateTick();
  assert.equal(f.state().lastRun.group, undefined); assert.equal(f.state().lastAttempt.group.status, 'error');
  f.advance(60e3); await f.api.digestGenerateTick();
  assert.equal(f.state().lastRun.group, '2026-11-02');
});

test('failure preparing a digest does not leave a stuck in-memory running marker', async () => {
  const f = fixture(); f.failAliases(true);
  await assert.rejects(f.api.runDigest('group', '2026-11-02'), /aliases unavailable/);
  assert.equal(f.api.digestRunning.size, 0);
  f.failAliases(false); const retry = await f.api.runDigest('group', '2026-11-02');
  assert.equal(retry.status, 'partial');
});

test('scheduler leaves an active manual run alone', async () => {
  const f = fixture(); f.api.digestRunning.add('group2026-11-02');
  await f.api.digestGenerateTick(); assert.equal(f.stats().historyCalls, 0);
  assert.equal(f.state().lastAttempt, undefined);
});

// Execute the current production delivery loop and manual route with a queued
// persisted report; only gateway and filesystem I/O are replaced.
function deliveryFixture(notesUsed) {
  const group = 'agent:main:qqbot:group:0123456789ABCDEF0123456789ABCDEF';
  const report = { id: '2026-11-02__abcdef1234', day: '2026-11-02', sessionKey: group,
    startedAt: Date.parse('2026-11-02T14:05:00Z'), trigger: 'schedule', status: 'ok', text: 'Group summary', notesUsed };
  const persisted = JSON.stringify(report), calls = [];
  let state = { records: { [report.id]: { status: 'retry', attempts: 1, image: 'none', text: 'pending', nextAt: 0 } } };
  const ctx = {
    process: { env: {} }, path, DIGEST_DIR: '/fake/digests',
    jsonStore: () => ({ load: () => state, save: next => { state = next; } }),
    digestSettings: { load: () => ({ enabled: true, time: '22:00', sessions: { [group]: true } }) },
    digestRunning: new Set(), sgParts: () => ({ day: report.day, hm: '22:05' }), sgDayOf: () => report.day,
    fs: { readdirSync: () => [report.id + '.json'], readFileSync: () => persisted },
    call: async (method, params) => { calls.push({ method, params });
      if (method === 'sessions.list') return { sessions: [{ key: group, channel: 'qqbot', deliveryContext: { channel: 'qqbot', to: 'qqbot:group:0123456789ABCDEF0123456789ABCDEF' } }] };
      assert.equal(method, 'send'); return { ok: true };
    },
    opLog() {}, setInterval: () => ({ unref() {} }),
    console: { error() {}, log() {} },
    need: (body, name) => assert.ok(body[name]), httpErr: (status, message) => Object.assign(new Error(message), { http: status }),
    W: (name, target, handler) => handler,
  };
  const delivery = source.slice(source.indexOf('const DIGEST_DELIVER_DRY ='), source.indexOf('// 表情库（只读 workspace/stickers）'));
  const manual = source.slice(source.indexOf('  "POST /api/digests/deliver":'), source.indexOf('  "GET /api/digests/get":'));
  vm.createContext(ctx);
  vm.runInContext(delivery + ';this.tick = digestDeliverTick;', ctx);
  vm.runInContext('this.manual = ({' + manual + '})["POST /api/digests/deliver"];', ctx);
  return { report, persisted, calls, state: () => state, tick: ctx.tick,
    manual: body => ctx.manual({ id: report.id, ...body }) };
}

test('queued legacy reports using or lacking global-memory provenance never auto-send', async () => {
  for (const notesUsed of [true, undefined]) {
    const f = deliveryFixture(notesUsed), original = JSON.stringify(f.state());
    await f.tick();
    assert.equal(f.calls.length, 0);
    assert.equal(JSON.stringify(f.state()), original, 'leave legacy delivery state untouched');
  }
});

test('manual delivery rejects legacy memory reports even with force or dry flags', async () => {
  for (const notesUsed of [true, undefined]) {
    const f = deliveryFixture(notesUsed), original = JSON.stringify(f.state());
    await assert.rejects(f.manual({ force: true, dry: true }), error =>
      error.http === 400 && error.message === (notesUsed === true
        ? '该旧群报使用全局记忆，请重新生成后再发送' : '该旧群报无法确认记忆隔离，请重新生成后再发送'));
    assert.equal(f.calls.length, 0); assert.equal(JSON.stringify(f.state()), original);
  }
});

test('explicitly isolated new reports still auto-deliver through the actual send path', async () => {
  const f = deliveryFixture(false); await f.tick();
  assert.equal(f.calls.filter(call => call.method === 'send').length, 1);
  assert.equal(f.state().records[f.report.id].status, 'delivered');
  assert.equal(f.state().records[f.report.id].text, 'sent');
});

test('manual delivery of an explicitly isolated report remains available', async () => {
  const f = deliveryFixture(false), result = await f.manual({});
  assert.equal(result.ok, true); assert.equal(result.status, 'delivered');
  assert.equal(f.calls.filter(call => call.method === 'send').length, 1);
});
