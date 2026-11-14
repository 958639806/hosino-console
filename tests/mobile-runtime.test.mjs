import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MobileRuntime } from '../mobile-runtime.mjs';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hs-mobile-test-'));
  let clock = 1_800_000_000_000;
  const options = { directory, now: () => clock, accessTtlMs: 1_000, refreshTtlMs: 10_000, ...overrides };
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    options,
    runtime: new MobileRuntime(options),
    advance(ms) { clock += ms; },
    reload() { return new MobileRuntime(options); },
  };
}

function request(overrides = {}) {
  return {
    requestId: randomUUID(),
    operation: 'chat.send',
    session: 'agent:main:main',
    payload: { key: 'agent:main:main', message: '你好', deliver: false, attachments: [] },
    ...overrides,
  };
}

test('device tokens survive restart without persisting plaintext credentials', t => {
  const f = fixture(t);
  const tokens = f.runtime.issueDevice('测试 Android');
  assert.equal(typeof tokens.accessToken, 'string');
  assert.equal(typeof tokens.refreshToken, 'string');
  assert.notEqual(tokens.accessToken, tokens.refreshToken);
  const first = f.runtime.authenticate(tokens.accessToken);
  assert.equal(first.name, '测试 Android');
  assert.equal(first.owner, 'owner');
  assert.equal(first.permissions.cli, false);
  const persisted = readFileSync(path.join(f.directory, 'state.json'), 'utf8');
  assert.equal(persisted.includes(tokens.accessToken), false);
  assert.equal(persisted.includes(tokens.refreshToken), false);
  assert.equal(f.reload().authenticate(tokens.accessToken).id, first.id);
});

test('refresh rotates credentials, rejects replay, and revoke survives restart', t => {
  const f = fixture(t);
  const original = f.runtime.issueDevice('phone');
  const replacement = f.runtime.refresh(original.refreshToken);
  assert.notEqual(replacement.accessToken, original.accessToken);
  assert.notEqual(replacement.refreshToken, original.refreshToken);
  assert.throws(() => f.runtime.authenticate(original.accessToken), error => error.http === 401);
  assert.throws(() => f.runtime.refresh(original.refreshToken), error => error.http === 401);
  const device = f.runtime.authenticate(replacement.accessToken);
  assert.ok(device);
  f.runtime.revoke(device.id);
  const restored = f.reload();
  assert.throws(() => restored.authenticate(replacement.accessToken), error => error.http === 401);
  assert.throws(() => restored.refresh(replacement.refreshToken), error => error.http === 401);
});

test('expired access can refresh, but an expired refresh token cannot', t => {
  const f = fixture(t);
  const tokens = f.runtime.issueDevice('phone');
  f.advance(1_001);
  assert.throws(() => f.runtime.authenticate(tokens.accessToken), error => error.http === 401 && error.code === 'AUTH_EXPIRED');
  const refreshed = f.runtime.refresh(tokens.refreshToken);
  assert.ok(f.runtime.authenticate(refreshed.accessToken));
  f.advance(10_001);
  assert.throws(() => f.runtime.authenticate(refreshed.accessToken), error => error.http === 401);
  assert.throws(() => f.runtime.refresh(refreshed.refreshToken), error => error.http === 401);
});

test('CLI permission is explicit and remains disabled by default', t => {
  const f = fixture(t, { cliEnabled: true });
  const tokens = f.runtime.issueDevice('phone');
  assert.equal(f.runtime.authenticate(tokens.accessToken).permissions.cli, true);
});

test('token kinds, malformed credentials and modified bearer tokens are rejected', t => {
  const f = fixture(t);
  const tokens = f.runtime.issueDevice('phone');
  assert.throws(() => f.runtime.authenticate(tokens.refreshToken), error => error.http === 401);
  assert.throws(() => f.runtime.refresh(tokens.accessToken), error => error.http === 401);
  assert.throws(() => f.runtime.authenticate('Bearer placeholder'), error => error.http === 401);
  const last = tokens.accessToken.at(-1);
  const changed = tokens.accessToken.slice(0, -1) + (last === 'A' ? 'B' : 'A');
  assert.throws(() => f.runtime.authenticate(changed), error => error.http === 401);
});

test('same logical request is admitted once, with stable canonical payload comparison', t => {
  const f = fixture(t);
  const input = request();
  assert.equal(f.runtime.beginRequest(input).created, true);
  const second = f.runtime.beginRequest({
    ...input,
    payload: { attachments: [], deliver: false, message: '你好', key: 'agent:main:main' },
  });
  assert.equal(second.created, false);
  assert.equal(second.record.state, 'pending');
  assert.throws(() => f.runtime.beginRequest({ ...input, payload: { ...input.payload, message: 'different' } }), error => error.http === 409);
  assert.throws(() => f.runtime.beginRequest({ ...input, operation: 'cli.run' }), error => error.http === 409);
  assert.throws(() => f.runtime.beginRequest({ ...input, session: 'another-session' }), error => error.http === 409);
});

test('concurrent admissions share one durable execution key', async t => {
  const f = fixture(t);
  const input = request();
  const attempts = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => f.runtime.beginRequest(input))));
  assert.equal(attempts.filter(attempt => attempt.created).length, 1);
  assert.equal(new Set(attempts.map(attempt => attempt.record.gatewayKey)).size, 1);
  assert.equal(f.reload().getRequest(input.requestId).state, 'unknown');
});

test('completed request replays stored result after restart and remains owner-isolated', t => {
  const f = fixture(t);
  const input = request();
  f.runtime.beginRequest(input);
  f.runtime.completeRequest(input.requestId, { runId: 'run-one', accepted: true });
  const restored = f.reload();
  const replay = restored.beginRequest(input);
  assert.equal(replay.created, false);
  assert.equal(replay.record.state, 'completed');
  assert.deepEqual(replay.record.result, { runId: 'run-one', accepted: true });
  assert.equal(restored.getRequest(input.requestId, 'someone-else'), null);
  assert.equal(restored.getRequest(input.requestId).requestId, input.requestId);
  assert.equal('gatewayKey' in restored.getRequest(input.requestId), false);
  assert.equal('fingerprint' in restored.getRequest(input.requestId), false);
  const retrieved = restored.getRequest(input.requestId);
  retrieved.result.accepted = false;
  assert.equal(restored.getRequest(input.requestId).result.accepted, true);
});

test('restart turns unconfirmed dispatch into unknown and never admits a new dispatch', t => {
  const f = fixture(t);
  const input = request();
  f.runtime.beginRequest(input);
  const restored = f.reload();
  assert.equal(restored.getRequest(input.requestId).state, 'unknown');
  const retry = restored.beginRequest(input);
  assert.equal(retry.created, false);
  assert.equal(retry.record.state, 'unknown');
  assert.equal(f.reload().getRequest(input.requestId).state, 'unknown');
});

test('known failures replay without execution while ambiguous failures remain unknown', t => {
  const f = fixture(t);
  const rejected = request();
  f.runtime.beginRequest(rejected);
  f.runtime.failRequest(rejected.requestId, { status: 429, error: 'busy', code: 'rate_limited' });
  assert.equal(f.runtime.beginRequest(rejected).created, false);
  assert.equal(f.runtime.getRequest(rejected.requestId).state, 'failed');
  const ambiguous = request();
  f.runtime.beginRequest(ambiguous);
  f.runtime.failRequest(ambiguous.requestId, { status: 502, error: 'response lost', unknown: true });
  assert.equal(f.runtime.getRequest(ambiguous.requestId).state, 'unknown');
  assert.equal(f.reload().beginRequest(ambiguous).created, false);
});

test('CLI terminal result and interrupted state survive restart', t => {
  const f = fixture(t);
  f.runtime.recordRun({ sessionId: 'session-a', runId: 'run-a', state: 'running', startedAt: 100 });
  assert.equal(f.runtime.runsForSession('session-a').activeRun.runId, 'run-a');
  const restored = f.reload();
  const interrupted = restored.runsForSession('session-a');
  assert.equal(interrupted.activeRun, null);
  assert.equal(interrupted.lastRun.state, 'interrupted');
  restored.recordRun({ sessionId: 'session-a', runId: 'run-b', state: 'running', startedAt: 200 });
  restored.recordRun({ sessionId: 'session-a', runId: 'run-b', state: 'completed', startedAt: 200, finishedAt: 250, exitCode: 0 });
  const terminal = f.reload().runsForSession('session-a');
  assert.equal(terminal.activeRun, null);
  assert.equal(terminal.lastRun.runId, 'run-b');
  assert.equal(terminal.lastRun.state, 'completed');
  assert.equal(terminal.lastRun.exitCode, 0);
});

test('Android CORS allows only explicit origins, methods, and headers', t => {
  const f = fixture(t, { origins: ['https://localhost', 'https://android.example.test'] });
  const allowed = f.runtime.corsHeaders('https://localhost', 'POST', 'authorization, content-type, x-hs');
  assert.equal(allowed['access-control-allow-origin'], 'https://localhost');
  assert.notEqual(allowed['access-control-allow-origin'], '*');
  assert.throws(() => f.runtime.corsHeaders('https://evil.example', 'POST', 'authorization'), error => error.http === 403);
  assert.throws(() => f.runtime.corsHeaders('null', 'POST', 'authorization'), error => error.http === 403);
  assert.throws(() => f.runtime.corsHeaders('https://localhost', 'TRACE', ''), error => error.http === 403);
  assert.throws(() => f.runtime.corsHeaders('https://localhost', 'POST', 'x-unapproved-header'), error => error.http === 403);
});

test('corrupt persisted state fails closed instead of replacing credentials and receipts', t => {
  const f = fixture(t);
  f.runtime.issueDevice('phone');
  writeFileSync(path.join(f.directory, 'state.json'), '{broken');
  assert.throws(() => f.reload());
  assert.equal(readFileSync(path.join(f.directory, 'state.json'), 'utf8'), '{broken');
});

test('valid JSON with malformed containers or records fails closed without erasing receipts', t => {
  const f = fixture(t);
  const device = f.runtime.issueDevice('phone').device;
  const input = request();
  f.runtime.beginRequest(input);
  f.runtime.recordRun({ sessionId: input.session, runId: 'run-one', state: 'running', startedAt: 100 });
  const valid = JSON.parse(readFileSync(path.join(f.directory, 'state.json'), 'utf8'));
  const malformed = [
    { ...valid, requests: [] },
    { ...valid, devices: [] },
    { ...valid, runs: [] },
    { ...valid, requests: { [`owner:${input.requestId}`]: { requestId: input.requestId, state: 'pending' } } },
    { ...valid, devices: { [device.id]: { ...valid.devices[device.id], accessHash: null } } },
    { ...valid, runs: { 'run-one': { ...valid.runs['run-one'], startedAt: 'yesterday' } } },
  ];
  for (const state of malformed) {
    const contents = JSON.stringify(state);
    writeFileSync(path.join(f.directory, 'state.json'), contents);
    assert.throws(() => f.reload(), /Invalid|unsupported/);
    assert.equal(readFileSync(path.join(f.directory, 'state.json'), 'utf8'), contents);
  }
});

test('missing operation or target cannot create an unreadable durable request record', t => {
  const f = fixture(t);
  for (const invalid of [{ operation: '' }, { operation: null }, { session: '' }, { session: undefined }]) {
    assert.throws(() => f.runtime.beginRequest(request(invalid)), error => error.http === 400);
  }
  assert.ok(f.reload());
  assert.deepEqual(JSON.parse(readFileSync(path.join(f.directory, 'state.json'), 'utf8')).requests, {});
});
