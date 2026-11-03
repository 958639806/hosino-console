import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { WebSocketServer } from 'ws';

const repository = fileURLToPath(new URL('..', import.meta.url));

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function fixture(t, { cliEnabled = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hs-mobile-http-'));
  // Execute an unchanged copy of the actual server in an isolated application
  // root. Uploads, audit files, credentials and receipts stay inside this temp dir.
  for (const filename of ['server.mjs', 'mobile-runtime.mjs']) copyFileSync(path.join(repository, filename), path.join(directory, filename));
  symlinkSync(path.join(repository, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  mkdirSync(path.join(directory, 'media'));
  writeFileSync(path.join(directory, 'media', '测试.wav'), 'fixture-audio');
  writeFileSync(path.join(directory, 'gateway-cert.pem'), 'local plaintext WS fixture; not used for TLS');
  writeFileSync(path.join(directory, 'openclaw.json'), JSON.stringify({ gateway: { auth: { token: 'local-fixture-token' } } }));
  const cliHome = path.join(directory, 'cli-home');
  mkdirSync(path.join(cliHome, '.local', 'bin'), { recursive: true });
  mkdirSync(path.join(cliHome, '.claude'), { recursive: true });
  writeFileSync(path.join(cliHome, '.claude', '.credentials.json'), '{}');
  writeFileSync(path.join(cliHome, '.local', 'bin', 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--version')) { console.log('1.0.0'); process.exit(0); }
fs.appendFileSync(path.join(process.env.HOME, 'fixture-pids'), String(process.pid) + '\\n');
const emit = data => console.log(JSON.stringify(data));
const prompt = process.argv[process.argv.indexOf('-p') + 1];
emit({type:'system',subtype:'init',session_id:'fixture-cli-conversation'});
setTimeout(() => emit({type:'assistant',message:{content:[{type:'text',text:'第一段'}]}}), 50);
setTimeout(() => emit({type:'assistant',message:{content:[{type:'text',text:'第二段'}]}}), 150);
if (prompt === 'long-fixture') setInterval(() => {}, 1000);
else setTimeout(() => process.exit(0), 350);
`, { mode: 0o700 });

  const gateway = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(gateway, 'listening');
  let sendCount = 0;
  const sent = [];
  const events = new EventEmitter();
  gateway.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: {} }));
    socket.on('message', bytes => {
      const message = JSON.parse(String(bytes));
      if (message.method === 'connect') {
        socket.send(JSON.stringify({ type: 'res', id: message.id, ok: true, payload: { server: { version: 'local-fixture' } } }));
      } else if (message.method === 'chat.send') {
        sendCount++;
        sent.push(message.params);
        events.emit('dispatch', message.params);
        if (message.params.message === 'fixture-lost-response') return;
        setTimeout(() => {
          if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'res', id: message.id, ok: true, payload: { runId: 'fixture-chat-run', accepted: true } }));
        }, 60);
      } else {
        socket.send(JSON.stringify({ type: 'res', id: message.id, ok: false, error: { code: 'FIXTURE_UNKNOWN', message: `Unknown fixture method: ${message.method}` } }));
      }
    });
  });

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, [path.join(directory, 'server.mjs')], {
      cwd: directory,
      env: {
        ...process.env,
        PORT: String(port), LOGIN_HASH: bcrypt.hashSync('local-test-password', 4),
        OPENCLAW_CONFIG: path.join(directory, 'openclaw.json'),
        OPENCLAW_WORKSPACE: path.join(directory, 'workspace'),
        GATEWAY_URL: `ws://127.0.0.1:${gateway.address().port}`,
        GATEWAY_CERT: path.join(directory, 'gateway-cert.pem'), GATEWAY_FP: 'TEST',
        HS_MOBILE_DATA: path.join(directory, 'mobile'), HS_MOBILE_CLI_ENABLED: String(cliEnabled),
        HS_MOBILE_ORIGINS: 'https://localhost', MEDIA_ROOT: path.join(directory, 'media'),
        CLI_HOME: cliHome, CLI_ROOT: path.join(directory, 'cli-sandbox'), CLI_LAUNCH: 'direct',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Fixture server did not start: ${output}`)), 5_000);
      const receive = bytes => {
        output = (output + String(bytes)).slice(-4_000);
        if (output.includes('hosino-console on')) { clearTimeout(timeout); resolve(); }
      };
      child.stdout.on('data', receive);
      child.stderr.on('data', receive);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Fixture server exited ${code}: ${output}`)); });
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    for (const socket of gateway.clients) socket.terminate();
  }
  t.after(async () => {
    await stop();
    // The restart test deliberately leaves a detached fixture process alive;
    // terminate only PIDs recorded by our temporary executable before cleanup.
    for (const pid of fixturePids()) {
      try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    for (const socket of gateway.clients) socket.terminate();
    await new Promise(resolve => gateway.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  function fixturePids() {
    try { return readFileSync(path.join(cliHome, 'fixture-pids'), 'utf8').trim().split('\n').filter(Boolean).map(Number); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  await start();
  async function request(route, { token, method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        Origin: 'https://localhost', 'X-HS': '1',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    const data = await response.json();
    return { response, data };
  }
  return { base, directory, request, sent, events, fixturePids, sends: () => sendCount, restart: async () => { output = ''; await stop(); await start(); } };
}

test('actual HTTP routes preserve mobile authentication, receipts and binary authorization', async t => {
  const f = await fixture(t);
  let tokens;
  let cookie;
  const requestId = randomUUID();
  const input = { requestId, key: 'agent:main:main', message: '你好，测试', deliver: false };

  await t.test('capabilities, login and legacy Cookie auth coexist', async () => {
    const capabilities = await f.request('/api/mobile/capabilities');
    assert.equal(capabilities.response.status, 200);
    assert.equal(capabilities.data.apiVersion, 1);
    assert.equal(capabilities.data.permissions.cli, false);
    const login = await f.request('/api/mobile/login', { method: 'POST', body: { password: 'local-test-password', deviceName: 'Android fixture' } });
    assert.equal(login.response.status, 200);
    tokens = login.data;
    assert.equal(typeof tokens.accessToken, 'string');
    const me = await f.request('/api/me', { token: tokens.accessToken });
    assert.deepEqual(me.data, { authed: true, isOwner: true });
    const legacy = await f.request('/api/login', { method: 'POST', body: { password: 'local-test-password' } });
    cookie = legacy.response.headers.get('set-cookie').split(';')[0];
    const legacyMe = await f.request('/api/me', { headers: { Cookie: cookie } });
    assert.equal(legacyMe.data.authed, true);
  });

  await t.test('CORS preflight and errors have explicit Android origin', async () => {
    const response = await fetch(f.base + '/api/send', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization, Content-Type, X-HS' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost');
    const denied = await f.request('/api/mobile/capabilities', { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(denied.response.status, 403);
    const cli = await f.request('/api/cli/sessions', { token: tokens.accessToken });
    assert.equal(cli.response.status, 403);
    assert.equal(cli.response.headers.get('access-control-allow-origin'), 'https://localhost');
  });

  await t.test('mobile mutations require X-HS even with a valid Cookie', async () => {
    for (const [route, body] of [['/api/mobile/login', { password: 'local-test-password' }], ['/api/mobile/refresh', { refreshToken: tokens.refreshToken }]]) {
      const response = await fetch(f.base + route, { method: 'POST', headers: { Origin: 'https://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 403);
    }
    const response = await fetch(f.base + '/api/mobile/devices/' + tokens.device.id, { method: 'DELETE', headers: { Origin: 'https://localhost', Cookie: cookie } });
    assert.equal(response.status, 403);
    const me = await f.request('/api/me', { token: tokens.accessToken });
    assert.equal(me.data.authed, true);
  });

  await t.test('concurrent duplicate send submits only once; mismatched replay conflicts', async () => {
    const outcomes = await Promise.all([f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: input }), f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: input })]);
    assert.deepEqual(outcomes.map(outcome => outcome.response.status).sort(), [200, 409]);
    assert.equal(f.sends(), 1);
    assert.equal(f.sent[0].sessionKey, input.key);
    assert.equal(typeof f.sent[0].idempotencyKey, 'string');
    const mismatch = await f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: { ...input, message: 'changed' } });
    assert.equal(mismatch.response.status, 409);
    assert.equal(f.sends(), 1);
    const receipt = await f.request('/api/mobile/requests/' + requestId, { token: tokens.accessToken });
    assert.equal(receipt.data.state, 'completed');
    assert.equal(receipt.data.result.runId, 'fixture-chat-run');
    assert.equal('gatewayKey' in receipt.data, false);
  });

  await t.test('upload, download and Range media retain bearer auth and CORS', async () => {
    const upload = await fetch(f.base + '/api/uploads?' + new URLSearchParams({ scope: 'chat', session: input.key, name: '中文附件.txt' }), { method: 'POST', headers: { Origin: 'https://localhost', Authorization: `Bearer ${tokens.accessToken}`, 'X-HS': '1', 'Content-Type': 'application/octet-stream' }, body: '附件内容' });
    assert.equal(upload.status, 200);
    const attachment = await upload.json();
    assert.equal(attachment.name, '中文附件.txt');
    const denied = await f.request(attachment.url);
    assert.equal(denied.response.status, 401);
    const download = await fetch(f.base + attachment.url + '?download=1', { headers: { Origin: 'https://localhost', Authorization: `Bearer ${tokens.accessToken}` } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal(await download.text(), '附件内容');
    const media = await fetch(f.base + '/api/media?' + new URLSearchParams({ path: path.join(f.directory, 'media', '测试.wav') }), { headers: { Origin: 'https://localhost', Authorization: `Bearer ${tokens.accessToken}`, Range: 'bytes=0-6' } });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal(await media.text(), 'fixture');
  });

  await t.test('refresh rotates tokens; invalid bearer never falls back to Cookie', async () => {
    const original = tokens;
    const refreshed = await f.request('/api/mobile/refresh', { method: 'POST', body: { refreshToken: original.refreshToken } });
    assert.equal(refreshed.response.status, 200);
    tokens = refreshed.data;
    const rejected = await f.request('/api/me', { token: original.accessToken, headers: { Cookie: cookie } });
    assert.equal(rejected.response.status, 401);
    const replay = await f.request('/api/mobile/refresh', { method: 'POST', body: { refreshToken: original.refreshToken } });
    assert.equal(replay.response.status, 401);
  });

  await t.test('server restart retains device and completed receipt without resubmitting', async () => {
    await f.restart();
    const me = await f.request('/api/me', { token: tokens.accessToken });
    assert.equal(me.data.authed, true);
    const receipt = await f.request('/api/mobile/requests/' + requestId, { token: tokens.accessToken });
    assert.equal(receipt.data.state, 'completed');
    const replay = await f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: input });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.data.runId, 'fixture-chat-run');
    assert.equal(f.sends(), 1);
  });

  await t.test('restart after downstream dispatch retains unknown outcome and blocks replay', async () => {
    const ambiguousInput = { ...input, requestId: randomUUID(), message: 'fixture-lost-response' };
    const dispatched = once(f.events, 'dispatch');
    const pending = f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: ambiguousInput }).catch(() => null);
    await dispatched;
    assert.equal(f.sends(), 2);
    await f.restart();
    await pending;
    const receipt = await f.request('/api/mobile/requests/' + ambiguousInput.requestId, { token: tokens.accessToken });
    assert.equal(receipt.data.state, 'unknown');
    const replay = await f.request('/api/send', { method: 'POST', token: tokens.accessToken, body: ambiguousInput });
    assert.equal(replay.response.status, 409);
    assert.equal(replay.data.code, 'request_unknown');
    assert.equal(f.sends(), 2);
  });

  await t.test('logout revokes access and refresh credentials', async () => {
    const logout = await f.request('/api/mobile/logout', { method: 'POST', token: tokens.accessToken, body: {} });
    assert.equal(logout.response.status, 200);
    assert.equal((await f.request('/api/me', { token: tokens.accessToken })).response.status, 401);
    assert.equal((await f.request('/api/mobile/refresh', { method: 'POST', body: { refreshToken: tokens.refreshToken } })).response.status, 401);
  });
});

test('real POST SSE streams incrementally, resumes by query, and separates disconnect from cancellation', async t => {
  const f = await fixture(t, { cliEnabled: true });
  const login = await f.request('/api/mobile/login', { method: 'POST', body: { password: 'local-test-password', deviceName: 'CLI fixture' } });
  const token = login.data.accessToken;
  const publicCapabilities = await f.request('/api/mobile/capabilities');
  assert.equal(publicCapabilities.data.permissions.cli, false);
  const capabilities = await f.request('/api/mobile/capabilities', { token });
  assert.equal(capabilities.data.permissions.cli, true);
  const created = await f.request('/api/cli/sessions', { method: 'POST', token, body: { tool: 'claude', title: 'fixture' } });
  assert.equal(created.response.status, 200);
  const sessionId = created.data.id;

  async function startStream(prompt) {
    const body = { prompt, requestId: randomUUID() };
    const controller = new AbortController();
    const response = await fetch(f.base + `/api/cli/sessions/${sessionId}/run`, {
      method: 'POST', headers: { Origin: 'https://localhost', Authorization: `Bearer ${token}`, 'X-HS': '1', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('第一段')) {
      const part = await reader.read();
      assert.equal(part.done, false, 'stream ended before first incremental output');
      text += decoder.decode(part.value, { stream: true });
    }
    assert.equal(text.includes('event: done'), false, 'first output must arrive before terminal event');
    const start = /event: start\ndata: ([^\n]+)/.exec(text);
    assert.ok(start);
    const runId = JSON.parse(start[1]).runId;
    return {
      body, runId,
      async finish() {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          text += decoder.decode(part.value, { stream: true });
        }
        return text;
      },
      async disconnect() { controller.abort(); await reader.cancel().catch(() => {}); },
    };
  }

  await t.test('incremental output arrives while running and duplicate launch returns same receipt', async () => {
    const stream = await startStream('normal-fixture');
    const active = await f.request(`/api/cli/sessions/${sessionId}`, { token });
    assert.equal(active.data.session.running, true);
    assert.equal(active.data.session.activeRun.runId, stream.runId);
    const duplicate = await f.request(`/api/cli/sessions/${sessionId}/run`, { method: 'POST', token, body: stream.body });
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.data.runId, stream.runId);
    const concurrent = await f.request(`/api/cli/sessions/${sessionId}/run`, { method: 'POST', token, body: { prompt: 'another request', requestId: randomUUID() } });
    assert.equal(concurrent.response.status, 409);
    assert.equal(f.fixturePids().length, 1);
    const output = await stream.finish();
    assert.match(output, /第一段/);
    assert.match(output, /第二段/);
    assert.match(output, /event: done/);
    const terminal = await f.request(`/api/cli/sessions/${sessionId}`, { token });
    assert.equal(terminal.data.session.running, false);
    assert.equal(terminal.data.session.lastRun.state, 'completed');
    assert.equal(terminal.data.session.lastRun.exitCode, 0);
  });

  await t.test('disconnect leaves execution running; explicit cancel persists cancelled terminal', async () => {
    const stream = await startStream('long-fixture');
    await stream.disconnect();
    const resumed = await f.request(`/api/cli/sessions/${sessionId}`, { token });
    assert.equal(resumed.data.session.running, true);
    assert.equal(resumed.data.session.activeRun.runId, stream.runId);
    const cancelled = await f.request(`/api/cli/sessions/${sessionId}/cancel`, { method: 'POST', token, body: {} });
    assert.equal(cancelled.response.status, 200);
    let terminal;
    const deadline = Date.now() + 3_000;
    do {
      terminal = await f.request(`/api/cli/sessions/${sessionId}`, { token });
      if (!terminal.data.session.running) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.equal(terminal.data.session.running, false);
    assert.equal(terminal.data.session.lastRun.runId, stream.runId);
    assert.equal(terminal.data.session.lastRun.state, 'cancelled');
    assert.equal(terminal.data.session.lastRun.reason, 'cancelled');
  });

  await t.test('server restart marks a previous CLI run interrupted without starting another', async () => {
    const stream = await startStream('long-fixture');
    const count = f.fixturePids().length;
    await f.restart();
    await stream.disconnect();
    const restored = await f.request(`/api/cli/sessions/${sessionId}`, { token });
    assert.equal(restored.data.session.running, false);
    assert.equal(restored.data.session.activeRun, null);
    assert.equal(restored.data.session.lastRun.runId, stream.runId);
    assert.equal(restored.data.session.lastRun.state, 'interrupted');
    assert.equal(restored.data.session.lastRun.reason, 'server_restarted');
    const duplicate = await f.request(`/api/cli/sessions/${sessionId}/run`, { method: 'POST', token, body: stream.body });
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.data.runId, stream.runId);
    assert.equal(f.fixturePids().length, count);
  });
});
