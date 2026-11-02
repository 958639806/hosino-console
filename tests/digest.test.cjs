const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const os = require('node:os');

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
    digestRunning: new Set(), digestActive: new Set(), sgParts: () => ({ day: report.day, hm: '22:05' }), sgDayOf: () => report.day,
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

// These integration fixtures reproduce the two former digest-races.cjs cases
// against the current generation, delivery, and manual-route implementations.
function raceFixture(t, initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-digest-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const day = '2026-11-02', fixed = Date.parse('2026-11-02T14:05:00Z');
  const settings = { enabled: true, time: '22:00', sessions: {} }, calls = [], accepted = [], cache = new Set();
  let state = { records: {} }, pausedMethod = 'sessions.list', gateUsed = false, release, reached, failReportSave = false, omitImage = false, loseImageAck = false, failQueueSave = false;
  const pause = new Promise(resolve => { release = resolve; }), paused = new Promise(resolve => { reached = resolve; });
  function addReport(group, startedAt = fixed) {
    const id = day + '__' + crypto.createHash('sha1').update(group).digest('hex').slice(0, 10), image = id + '.png';
    const report = { id, sessionKey: group, day, notesUsed: false, status: 'ok', text: 'OLD_TEXT', image, trigger: 'schedule', startedAt };
    fs.writeFileSync(path.join(root, image), 'OLD_IMAGE'); fs.writeFileSync(path.join(root, id + '.json'), JSON.stringify(report));
    settings.sessions[group] = true;
    state.records[id] = { status: 'pending', image: 'pending', text: 'pending', attempts: 0 };
    return report;
  }
  const group = 'agent:main:qqbot:group:0123456789ABCDEF0123456789ABCDEF', old = addReport(group);
  if (initial) {
    state.records[old.id] = structuredClone(initial);
    if (initial.image === 'sent') cache.add(`digest-${old.id}-image`);
    if (initial.text === 'sent') cache.add(`digest-${old.id}-text`);
  }
  const ctx = {
    path, crypto, Buffer, fs, DIGEST_DIR: root, TZ: 'Asia/Singapore', DIGEST_TEXT_MODEL: '', DIGEST_IMAGE_MODEL: 'fake-image', WORKSPACE: root, process: { env: {} },
    Date: class extends Date { static now() { return fixed; } }, sgParts: () => ({ day, hm: '22:05' }), sgDayOf: () => day,
    aliasFor: () => group, httpErr: (http, message) => Object.assign(new Error(message), { http }), need: (body, key) => assert.ok(body[key]), W: (name, target, handler) => handler,
    digestSettings: { load: () => settings, save: next => Object.assign(settings, next) },
    jsonStore: () => ({ load: () => state, save: next => { if (failQueueSave) throw new Error('queue disk full'); state = next; fs.writeFileSync(path.join(root, 'delivery-state.json'), JSON.stringify(state)); } }),
    atomicWrite: (file, content) => { if (failReportSave) throw new Error('report disk full'); fs.writeFileSync(file, content); },
    buildHistory: () => ({ messages: [{ role: 'user', content: 'new target history', ts: fixed }] }), textOf: message => message.content,
    runCli: async args => {
      if (args[1] === 'model') return { e: null, o: JSON.stringify({ text: 'NEW_TEXT\n画面：new image' }) };
      if (!omitImage) fs.writeFileSync(args[args.indexOf('--output') + 1], 'NEW_IMAGE'); return { e: null, o: '{}' };
    },
    call: async (method, params) => {
      calls.push({ method, ...params });
      if (method === pausedMethod && !gateUsed) { gateUsed = true; reached(); await pause; }
      if (method === 'send' && !cache.has(params.idempotencyKey)) {
        cache.add(params.idempotencyKey); accepted.push({ ...params });
        if (params.buffer && loseImageAck) { loseImageAck = false; throw new Error('image accepted but acknowledgement lost'); }
      }
      return method === 'sessions.list' ? { sessions: [] } : {};
    },
    send: (res, status, body) => ({ status, ...body }),
    serveFile: (res, file, type, cacheControl) => ({ status: 200, file, type, cacheControl, body: fs.readFileSync(file, 'utf8') }),
    setInterval: () => ({ unref() {} }), setTimeout: callback => { queueMicrotask(callback); return 1; }, opLog() {}, console: { log() {}, error() {} },
  };
  const delivery = source.slice(source.indexOf('const DIGEST_DELIVER_DRY ='), source.indexOf('// 表情库（只读 workspace/stickers）'));
  const manual = source.slice(source.indexOf('  "POST /api/digests/deliver":'), source.indexOf('  "GET /api/digests/get":'));
  const runNow = source.slice(source.indexOf('  "POST /api/digests/run-now":'), source.indexOf('  "POST /api/digests/deliver":'));
  vm.createContext(ctx);
  vm.runInContext(code + delivery + ';this.api = {runDigest, digestDeliverOnce, digestDeliverTick, digestActive, digestRunning, digestDelivering, digestImagePath};', ctx);
  vm.runInContext('this.manual = ({' + manual + '})["POST /api/digests/deliver"];this.runNow = ({' + runNow + '})["POST /api/digests/run-now"];', ctx);
  const imageRoute = source.split('\n').find(line => line.includes('if (u.pathname === "/api/digests/image"'));
  vm.runInContext('this.getImage = async u => { const req = {method:"GET"}, res = {}; ' + imageRoute + ' };', ctx);
  return { root, old, group, day, calls, api: ctx.api, paused, release, addReport,
    state: () => state, pauseOn: method => { pausedMethod = method; }, accepted: () => accepted,
    failReportSave: () => { failReportSave = true; }, omitImage: () => { omitImage = true; }, loseImageAck: () => { loseImageAck = true; }, failQueueSave: () => { failQueueSave = true; },
    manual: body => ctx.manual({ id: old.id, ...body }), runNow: () => ctx.runNow({ sessionKey: group }),
    getImage: (id = old.id) => ctx.getImage(new URL('http://local/api/digests/image?id=' + encodeURIComponent(id))),
    report: () => fs.readFileSync(path.join(root, old.id + '.json'), 'utf8'),
    image: () => fs.readFileSync(path.join(root, old.image), 'utf8'),
    sent: () => calls.filter(call => call.method === 'send') };
}

test('generation during delivery returns 409 without changing the paired report', async t => {
  const f = raceFixture(t), report = f.report(), pending = f.manual({});
  await f.paused;
  try {
    await assert.rejects(f.api.runDigest(f.group, f.day), error => error.http === 409);
    await assert.rejects(f.runNow(), error => error.http === 409);
    assert.equal(f.report(), report); assert.equal(f.image(), 'OLD_IMAGE');
  } finally { f.release(); }
  await pending;
  assert.equal(Buffer.from(f.sent()[0].buffer, 'base64').toString(), 'OLD_IMAGE');
  assert.equal(f.sent()[1].message, 'OLD_TEXT');
  assert.equal(f.sent()[0].idempotencyKey, `digest-${f.old.id}-image`);
  assert.equal(f.sent()[1].idempotencyKey, `digest-${f.old.id}-text`);
  assert.equal(f.api.digestActive.size, 0);
});

test('a rejected force request leaves an active partial delivery unchanged', async t => {
  const f = raceFixture(t, { status: 'retry', image: 'sent', text: 'pending', attempts: 1 });
  const pending = f.manual({}); await f.paused;
  try {
    const before = JSON.stringify(f.state());
    await assert.rejects(f.manual({ force: true }), error => error.http === 409);
    assert.equal(JSON.stringify(f.state()), before);
  } finally { f.release(); }
  await pending;
  assert.equal(f.sent().length, 1); assert.equal(f.sent()[0].message, 'OLD_TEXT');
  assert.equal(f.state().records[f.old.id].status, 'delivered');
});

test('delivery during generation returns 409 without resetting force state', async t => {
  const f = raceFixture(t); f.pauseOn('chat.history');
  const generation = f.api.runDigest(f.group, f.day); await f.paused;
  try {
    const before = JSON.stringify(f.state());
    await assert.rejects(f.manual({ force: true }), error => error.http === 409);
    assert.equal(JSON.stringify(f.state()), before); assert.equal(f.sent().length, 0);
  } finally { f.release(); }
  await generation; await f.manual({});
  assert.equal(Buffer.from(f.sent()[0].buffer, 'base64').toString(), 'NEW_IMAGE');
  assert.equal(f.sent()[1].message, 'NEW_TEXT');
});

test('delivery captures image bytes before an awaited gateway lookup', async t => {
  const f = raceFixture(t), pending = f.manual({}); await f.paused;
  fs.writeFileSync(path.join(f.root, f.old.image), 'EXTERNALLY_CHANGED_IMAGE');
  f.release(); await pending;
  assert.equal(Buffer.from(f.sent()[0].buffer, 'base64').toString(), 'OLD_IMAGE');
  assert.equal(f.sent()[1].message, 'OLD_TEXT');
});

test('an automatic batch refreshes queued reports after earlier gateway awaits', async t => {
  const f = raceFixture(t), secondGroup = 'agent:main:qqbot:group:FEDCBA9876543210FEDCBA9876543210';
  f.addReport(secondGroup, f.old.startedAt - 1000);
  const pending = f.api.digestDeliverTick(); await f.paused;
  try { await f.api.runDigest(secondGroup, f.day); } finally { f.release(); }
  await pending;
  assert.equal(f.sent().filter(call => call.to.endsWith('FEDCBA9876543210FEDCBA9876543210')).length, 0,
    'the replacement manual report must not inherit the old scheduled report delivery');
});

test('reports with any previously sent step cannot be regenerated or silently resent', async t => {
  for (const record of [
    { status: 'delivered', image: 'sent', text: 'sent', attempts: 1 },
    { status: 'retry', image: 'sent', text: 'pending', attempts: 1 },
    { status: 'retry', image: 'pending', text: 'sent', attempts: 1 },
  ]) {
    const f = raceFixture(t, record), report = f.report(), queue = JSON.stringify(f.state());
    await assert.rejects(f.api.runDigest(f.group, f.day), error => error.http === 409);
    await assert.rejects(f.runNow(), error => error.http === 409);
    assert.equal(f.report(), report); assert.equal(f.image(), 'OLD_IMAGE');
    assert.equal(JSON.stringify(f.state()), queue); assert.equal(f.calls.length, 0);
  }
});

test('completed delivery is a no-op unless the explicit force route requests resend', async t => {
  const f = raceFixture(t, { status: 'delivered', image: 'sent', text: 'sent', attempts: 1 }), queue = JSON.stringify(f.state());
  await assert.rejects(f.manual({}), error => error.http === 409);
  await f.api.digestDeliverOnce(f.old);
  assert.equal(f.calls.length, 0); assert.equal(JSON.stringify(f.state()), queue);
  const pending = f.manual({ force: true }); await f.paused; f.release(); await pending;
  assert.equal(f.sent().length, 2); assert.equal(f.state().records[f.old.id].status, 'delivered');
  assert.equal(f.api.digestActive.size, 0);
});

test('failed report publication preserves the old text/image and removes its orphaned new image', async t => {
  const f = raceFixture(t), original = f.report(); f.failReportSave();
  const result = await f.api.runDigest(f.group, f.day);
  assert.equal(result.status, 'error'); assert.equal(f.report(), original); assert.equal(f.image(), 'OLD_IMAGE');
  assert.deepEqual(fs.readdirSync(f.root).filter(name => name.endsWith('.png')), [f.old.image]);
  const pending = f.manual({}); await f.paused; f.release(); await pending;
  assert.equal(Buffer.from(f.sent()[0].buffer, 'base64').toString(), 'OLD_IMAGE');
  assert.equal(f.sent()[1].message, 'OLD_TEXT');
  assert.equal(f.api.digestActive.size, 0);
});

test('successful image CLI exit without a new artifact cannot reuse a previous generation image', async t => {
  const f = raceFixture(t); f.omitImage();
  const result = await f.api.runDigest(f.group, f.day);
  assert.equal(result.status, 'partial'); assert.equal(result.image, null);
  assert.match(result.errors[0], /未生成文件/);
  const pending = f.manual({}); await f.paused; f.release(); await pending;
  assert.equal(f.sent().length, 1); assert.equal(f.sent()[0].message, 'NEW_TEXT');
});

test('the unchanged image API resolves committed immutable filenames and rejects escaped paths', async t => {
  const f = raceFixture(t);
  assert.equal((await f.getImage()).body, 'OLD_IMAGE');
  const result = await f.api.runDigest(f.group, f.day), response = await f.getImage();
  assert.match(result.image, new RegExp('^' + f.old.id + '--[0-9a-f]{12}\\.png$'));
  assert.equal(response.status, 200); assert.equal(response.body, 'NEW_IMAGE'); assert.equal(response.cacheControl, 'no-store');
  assert.equal((await f.getImage('../escape')).status, 400);
  for (const image of ['../escape.png', '/tmp/escape.png', '2026-11-02__ffffffff00.png']) {
    fs.writeFileSync(path.join(f.root, f.old.id + '.json'), JSON.stringify({ ...result, image }));
    assert.equal((await f.getImage()).status, 404);
  }
});

test('explicit force persists a new batch so an idempotent gateway actually resends', async t => {
  const f = raceFixture(t, { status: 'delivered', image: 'sent', text: 'sent', attempts: 1 });
  const pending = f.manual({ force: true }); await f.paused;
  const firstBatch = f.state().records[f.old.id].batch;
  assert.match(firstBatch, /^[0-9a-f]{16}$/);
  const persisted = JSON.parse(fs.readFileSync(path.join(f.root, 'delivery-state.json'), 'utf8'));
  assert.equal(persisted.records[f.old.id].batch, firstBatch, 'persist batch before the gateway request');
  f.release(); await pending;
  assert.equal(f.accepted().length, 2, 'the gateway must accept image and text despite caching original delivery keys');
  await f.manual({ force: true });
  assert.notEqual(f.state().records[f.old.id].batch, firstBatch);
  assert.equal(f.accepted().length, 4, 'each explicit force creates one new real delivery batch');
});

test('ordinary retries reuse the persisted force batch after a lost gateway acknowledgement', async t => {
  const f = raceFixture(t); f.loseImageAck();
  const pending = f.manual({ force: true }); await f.paused; f.release();
  assert.equal((await pending).ok, false);
  const firstBatch = f.state().records[f.old.id].batch;
  assert.equal(f.accepted().length, 2, 'image and text were accepted despite the image acknowledgement failure');
  const retried = await f.manual({});
  assert.equal(retried.ok, true); assert.equal(f.state().records[f.old.id].batch, firstBatch);
  const imageRequests = f.sent().filter(call => call.buffer);
  assert.equal(imageRequests.length, 2); assert.equal(imageRequests[0].idempotencyKey, imageRequests[1].idempotencyKey);
  assert.equal(f.accepted().length, 2, 'cached acknowledgement must not create a duplicate message');
});

test('failed force-batch persistence rejects before network I/O and restores queue state', async t => {
  const f = raceFixture(t, { status: 'delivered', image: 'sent', text: 'sent', attempts: 1 }), original = JSON.stringify(f.state());
  f.failQueueSave(); await assert.rejects(f.manual({ force: true }), /queue disk full/);
  assert.equal(JSON.stringify(f.state()), original); assert.equal(f.calls.length, 0);
  assert.equal(f.api.digestActive.size, 0); assert.equal(f.api.digestDelivering.size, 0);
});
