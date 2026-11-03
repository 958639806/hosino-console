// HOSINO-MODEL-PING v2 测试：假网关（wss + 自签证书），验证经网关的临时会话流程
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net'), https = require('node:https'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process'); const {once} = require('node:events');
const runtime = require('../helpers/runtime.cjs');
const REPO = process.env.HOSINO_REPO || path.resolve(__dirname, '../..');
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs')); const WS = require(path.join(REPO, 'node_modules/ws'));
const SERVER = process.env.SERVER_MJS || path.join(REPO, 'server.mjs');
const LEAK = 'sk-TESTSECRET' + crypto.randomBytes(12).toString('hex');
const freePort = async () => { const l = net.createServer(); l.listen(0, '127.0.0.1'); await once(l, 'listening'); const p = l.address().port; await new Promise(r => l.close(r)); return p; };

const MODELS = [
  {id: 'gw-flash', provider: 'gwprov'}, {id: 'grok-4.7', provider: 'xai'}, {id: 'claude-haiku', provider: 'anthropic', agentRuntime: {id: 'claude-cli'}},
  {id: 'gpt-x', provider: 'openai', agentRuntime: {id: 'codex'}}, {id: 'm', provider: 'err'}, {id: 'm', provider: 'slow'}, {id: 'm', provider: 'fb'}, {id: 'm', provider: 'leak'},
  {id: 'a', provider: 's1'}, {id: 'b', provider: 's2'}, {id: 'c', provider: 's3'}, {id: 'm', provider: 'pi'},
];
const final = (runId, {text = 'ok', prov, model, responseModel = model, fallback = false, status = 'ok'} = {}) => ({runId, status, summary: 'completed', result: {payloads: [{text}], meta: {durationMs: 42, finalAssistantVisibleText: text, stopReason: 'stop', aborted: false,
  agentMeta: {agentHarnessId: 'openclaw', usage: {input: 40, output: 1, total: 41, cost: {total: 0.1}}, terminalReceipt: {rerouted: fallback, effective: {provider: fallback ? 'other' : prov, model: fallback ? 'backup' : model, responseModel}}},
  executionTrace: {fallbackUsed: fallback, winnerProvider: fallback ? 'other' : prov, winnerModel: fallback ? 'backup' : model}}}});

async function gateway(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwcert-'));
  let srv, wss;
  t.after(() => { for (const c of wss?.clients || []) c.terminate(); wss?.close(); srv?.closeAllConnections?.(); srv?.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], {stdio: 'ignore'});
  srv = https.createServer({key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem'))});
  wss = new WS.Server({server: srv}); const calls = [], sessions = new Set(); let n = 0;
  wss.on('connection', s => {
    const res = (id, ok, payload, error) => s.send(JSON.stringify({type: 'res', id, ok, payload, error}));
    s.send(JSON.stringify({type: 'event', event: 'connect.challenge', payload: {nonce: 'x'}}));
    s.on('message', raw => { const d = JSON.parse(raw); calls.push({method: d.method, params: d.params}); const p = d.params || {};
      if (d.method === 'connect') return res(d.id, true, {server: {version: 'test'}});
      if (d.method === 'models.list') return res(d.id, true, {models: MODELS});
      if (d.method === 'sessions.create') { const key = 'agent:main:dashboard:incognito-' + (++n); sessions.add(key); return res(d.id, true, {ok: true, key, entry: {model: p.model}}); }
      if (d.method === 'sessions.delete') { const had = sessions.delete(p.key); return res(d.id, true, {ok: true, deleted: had}); }
      if (d.method === 'chat.abort') return res(d.id, true, {ok: true});
      if (d.method === 'agent') {
        const runId = p.idempotencyKey; res(d.id, true, {runId, status: 'accepted'}); const prov = p.provider, model = p.model;
        const later = (ms, f) => setTimeout(f, ms).unref();
        if (prov === 'slow' || /^s\d$/.test(prov)) return later(prov === 'slow' ? 60000 : 600, () => s.readyState === 1 && res(d.id, true, final(runId, {prov, model})));
        if (prov === 'err') return res(d.id, false, undefined, {code: 'UNAVAILABLE', message: `No API key found for provider "err" (Bearer ${LEAK})`});
        if (prov === 'fb') return res(d.id, true, final(runId, {prov, model, fallback: true}));
        if (prov === 'leak') return res(d.id, true, final(runId, {prov, model, text: 'here ' + LEAK}));
        if (prov === 'xai') return res(d.id, true, final(runId, {prov, model, responseModel: 'grok-4.7-build'}));
        return res(d.id, true, final(runId, {prov, model}));
      }
      res(d.id, true, {});
    });
  });
  srv.listen(0, '127.0.0.1'); await once(srv, 'listening');
  return {url: `wss://127.0.0.1:${srv.address().port}`, cert: path.join(dir, 'c.pem'), calls, sessions};
}

async function fixture(t, gw) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-ping-'));
  let child;
  t.after(async () => { await runtime.stopChild(child); fs.rmSync(root, {recursive: true, force: true}); });
  runtime.copyRuntime(path.dirname(SERVER), root); fs.symlinkSync(path.join(REPO, 'public'), path.join(root, 'public'));
  if (path.basename(SERVER) !== 'server.mjs') fs.copyFileSync(SERVER, path.join(root, 'server.mjs'));
  const cfgDir = path.join(root, 'oc'); fs.mkdirSync(cfgDir);
  fs.writeFileSync(path.join(cfgDir, 'openclaw.json'), JSON.stringify({gateway: {auth: {token: 'gw-test-token'}}}));
  const port = await freePort(), password = crypto.randomBytes(16).toString('hex');
  child = spawn(process.execPath, ['server.mjs'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(password, 4), NODE_PATH: path.join(REPO, 'node_modules'), OPENCLAW_WORKSPACE: path.join(root, 'ws'), OPENCLAW_CONFIG: path.join(cfgDir, 'openclaw.json'), GATEWAY_URL: gw.url, GATEWAY_CERT: gw.cert, QQ_SEND_ENABLED: '0', MODEL_PING_TIMEOUT_MS: '1500', MODEL_PING_CLI_TIMEOUT_MS: '2500', HOSINO_QUIET_WINDOW: 'off'}});
  let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  for (let i = 0; !logs.includes('hosino-console on') && i < 150; i++) await new Promise(r => setTimeout(r, 20));
  const base = `http://127.0.0.1:${port}`;
  const lr = await fetch(base + '/api/login', {method: 'POST', headers: {'x-hs': '1'}, body: JSON.stringify({password})});
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const ping = async (modelRef, h = {'x-hs': '1', cookie}) => { const r = await fetch(base + '/api/models/ping', {method: 'POST', headers: h, body: JSON.stringify({modelRef})}); const txt = await r.text(); return {status: r.status, txt, j: JSON.parse(txt)}; };
  return {root, ping, cookie, logs: () => logs};
}

test('model ping v2: via gateway temp session, capture upstream model, cleanup, limits, no leaks', async t => {
  const gw = await gateway(t), f = await fixture(t, gw); const all = [];
  const P = async (...a) => { const r = await f.ping(...a); all.push(r.txt); return r; };
  const agentCalls = () => gw.calls.filter(c => c.method === 'agent');
  assert.equal((await P('gwprov/gw-flash', {cookie: f.cookie})).status, 403, 'needs X-HS');
  assert.equal((await P('gwprov/gw-flash', {'x-hs': '1'})).status, 401, 'needs login');

  let r = await P('gwprov/gw-flash'); assert.equal(r.status, 200);
  assert.equal(r.j.ok, true); assert.equal(r.j.status, 'ok'); assert.equal(r.j.replyPreview, 'ok'); assert.equal(r.j.upstreamModel, 'gw-flash'); assert.equal(r.j.modelMismatch, false);
  assert.equal(r.j.effectiveModel, 'gwprov/gw-flash'); assert.equal(r.j.mode, 'raw'); assert.equal(r.j.timeoutMs, 1500); assert.ok(r.j.latencyMs >= 0); assert.equal(r.j.usage.input, 40);
  const cr = gw.calls.find(c => c.method === 'sessions.create').params; assert.equal(cr.incognito, true); assert.equal(cr.model, 'gwprov/gw-flash'); assert.equal(cr.permissionMode, 'read-only'); assert.ok(!('message' in cr), 'create must not start a turn');
  let a = agentCalls().at(-1).params; assert.equal(a.deliver, false); assert.equal(a.disableMessageTool, true); assert.equal(a.modelRun, true); assert.equal(a.promptMode, 'none'); assert.equal(a.provider, 'gwprov'); assert.equal(a.model, 'gw-flash'); assert.match(a.sessionKey, /incognito/);
  for (const k of ['to', 'channel', 'replyTo', 'replyChannel', 'accountId', 'groupId']) assert.ok(!(k in a), 'no delivery target: ' + k);

  r = await P('gwprov/gw-flash'); assert.equal(r.status, 429); assert.equal(r.j.code, 'rate_limited');
  r = await P('xai/grok-4.7'); assert.equal(r.j.ok, true); assert.equal(r.j.upstreamModel, 'grok-4.7-build'); assert.equal(r.j.modelMismatch, true); assert.equal(r.j.warn, 'gateway_stall'); assert.equal(r.j.warnMessage, '此检测通过网关执行，耗时和结果包含网关路由；与供应商直连检测的验证范围不同。');
  a = agentCalls().at(-1).params; assert.equal(a.provider, 'xai'); assert.equal(a.model, 'grok-4.7'); assert.equal(a.modelRun, true, 'xAI keeps its gateway model run path');
  r = await P('anthropic/claude-haiku'); assert.equal(r.j.ok, true); assert.equal(r.j.mode, 'runtime'); assert.equal(r.j.runtime, 'claude-cli'); assert.equal(r.j.timeoutMs, 2500);
  a = agentCalls().at(-1).params; assert.equal(a.promptMode, 'minimal'); assert.ok(!a.modelRun, 'CLI runtime must not use raw modelRun'); assert.equal(a.deliver, false);
  r = await P('openai/gpt-x'); assert.equal(r.j.mode, 'runtime'); assert.equal(r.j.runtime, 'codex');
  r = await P('pi/m'); assert.equal(r.j.ok, true);
  r = await P('err/m'); assert.equal(r.j.ok, false); assert.match(r.j.error, /No API key/); assert.equal(r.j.stage, 'run');
  r = await P('fb/m'); assert.equal(r.j.ok, false); assert.equal(r.j.fallbackUsed, true); assert.match(r.j.error, /other\/backup/);
  r = await P('leak/m'); assert.equal(r.j.ok, true); assert.ok(!r.j.replyPreview.includes(LEAK), 'secret scrubbed from reply');
  r = await P('slow/m'); assert.equal(r.j.ok, false); assert.equal(r.j.status, 'timeout'); assert.match(r.j.error, /超时/);
  assert.ok(gw.calls.some(c => c.method === 'chat.abort'), 'timeout aborts the run');
  r = await P('nope/x'); assert.equal(r.status, 400); assert.equal(r.j.code, 'unknown_model');
  assert.equal((await P('bad')).status, 400);
  const rs = await Promise.all(['s1/a', 's2/b', 's3/c'].map(x => P(x))); assert.equal(rs.filter(x => x.status === 429 && x.j.code === 'busy').length, 1); assert.equal(rs.filter(x => x.j.ok).length, 2);

  const created = gw.calls.filter(c => c.method === 'sessions.create').length, deleted = gw.calls.filter(c => c.method === 'sessions.delete');
  assert.equal(deleted.length, created, 'every temp session deleted'); assert.ok(deleted.every(d => d.params.deleteTranscript === true)); assert.equal(gw.sessions.size, 0, 'no leftover sessions');
  assert.ok(!gw.calls.some(c => /subscribe|send$|chat\.send/.test(c.method)), 'no subscribe / send / chat.send');
  assert.ok(!gw.calls.some(c => /^config\.(set|patch|apply)/.test(c.method)), 'no gateway config writes');
  for (const txt of all) assert.ok(!txt.includes(LEAK) && !txt.includes('gw-test-token'), 'secret never in response');
  const ops = fs.readFileSync(path.join(f.root, 'logs', 'ops.log'), 'utf8'); assert.match(ops, /models\.ping/); assert.ok(!ops.includes(LEAK));
  assert.ok(!f.logs().includes(LEAK) && !f.logs().includes('gw-test-token'), 'secret never in stdout/stderr');
});
