// HOSINO-MODEL-MANAGE v1 测试：假网关 config.get/config.patch/secrets.store/authSetApiKey
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


const KEY_OLD = 'sk-OLDSECRET' + crypto.randomBytes(8).toString('hex'), KEY_NEW = 'sk-NEWSECRET' + crypto.randomBytes(8).toString('hex');
const initCfg = () => ({gateway: {auth: {token: 'gw-test-token'}}, plugins: {entries: {'openclaw-mem0': {config: {embedder: {provider: 'qianfan', model: 'emb'}}}}},
  models: {mode: 'merge', providers: {
    deepseek: {baseUrl: 'https://api.deepseek.com', api: 'openai-completions', models: []},
    'xiaomi-token-plan': {baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', api: 'openai-completions', models: []},
    xai: {baseUrl: 'https://x', api: 'openai-responses', auth: 'oauth', models: [{id: 'grok-4.7', name: 'Grok'}]},
    qianfan: {baseUrl: 'https://q', api: 'openai-completions', models: []},
    anthropic: {baseUrl: 'https://api.anthropic.com', api: 'anthropic-messages', models: [{id: 'claude-sonnet-5-5'}]}}},
  agents: {defaults: {model: {primary: 'xai/grok-4.7', fallbacks: ['deepseek/deepseek-flash']}, models: {
    'deepseek/deepseek-flash': {}, 'xiaomi-token-plan/mimo-v2.6-pro': {alias: 'mimo'}, 'xai/grok-4.7': {alias: 'grok'}, 'anthropic/claude-sonnet-5-5': {agentRuntime: {id: 'claude-cli'}, alias: 'sonnet'}}}}});
const merge = (t, p, arrById) => { for (const [k, v] of Object.entries(p)) { if (v === null) delete t[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], v); else t[k] = JSON.parse(JSON.stringify(v)); } return t; };
async function gateway(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwcert-'));
  let srv, wss;
  t.after(() => { for (const c of wss?.clients || []) c.terminate(); wss?.close(); srv?.closeAllConnections?.(); srv?.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], {stdio: 'ignore'});
  srv = https.createServer({key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem'))});
  wss = new WS.Server({server: srv}); const calls = [], st = {liveKinds: {}, lookupFail: false, cfg: initCfg(), rev: 1, secrets: {XIAOMI_MIMO_API_KEY: {kind: 'env', value: KEY_OLD}}, profiles: {}};
  const hash = () => 'h' + st.rev;
  const listModels = () => { const out = []; for (const [p, pc] of Object.entries(st.cfg.models.providers)) for (const m of pc.models || []) out.push({provider: p, id: m.id, name: m.name}); out.push({provider: 'deepseek', id: 'deepseek-flash'}); return out; };
  wss.on('connection', s => {
    const res = (id, ok, payload, error) => s.send(JSON.stringify({type: 'res', id, ok, payload, error}));
    s.send(JSON.stringify({type: 'event', event: 'connect.challenge', payload: {nonce: 'x'}}));
    s.on('message', raw => { const d = JSON.parse(raw); calls.push({method: d.method, params: d.params}); const p = d.params || {};
      if (d.method === 'connect') return res(d.id, true, {server: {version: 'test'}});
      if (d.method === 'models.list') return res(d.id, true, {models: listModels()});
      if (d.method === 'models.authStatus') return res(d.id, true, {providers: [{provider: 'deepseek', profiles: [{id: 'deepseek:default', type: 'api_key'}]}]});
      if (d.method === 'config.get') return res(d.id, true, {path: '/x/openclaw.json', valid: true, hash: hash(), config: st.cfg});
      if (d.method === 'config.patch') { if (p.baseHash && p.baseHash !== hash()) return res(d.id, false, undefined, {code: 'INVALID_REQUEST', message: 'config base hash changed; re-run config.get'});
        merge(st.cfg, JSON.parse(p.raw)); st.rev++; return res(d.id, true, {ok: true, hash: hash(), restart: {required: false}}); }
      if (d.method === 'config.schema.lookup') { if (st.lookupFail) return res(d.id, false, undefined, {code: 'INVALID_REQUEST', message: 'config schema path not found'}); return res(d.id, true, {path: p.path, reloadKind: st.liveKinds[p.path]}); }
      if (d.method === 'secrets.store.list') return res(d.id, true, {entries: Object.entries(st.secrets).map(([name, v]) => ({name, kind: v.kind, value: v.value}))});
      if (d.method === 'secrets.store.set') { st.secrets[p.name] = {kind: p.kind, value: p.value}; return res(d.id, true, {ok: true, reloaded: true}); }
      if (d.method === 'models.authSetApiKey') { st.profiles[p.provider] = p.apiKey; return res(d.id, true, {provider: p.provider, profileId: p.provider + ':default'}); }
      res(d.id, true, {});
    });
  });
  srv.listen(0, '127.0.0.1'); await once(srv, 'listening');
  return {url: `wss://127.0.0.1:${srv.address().port}`, cert: path.join(dir, 'c.pem'), calls, st};
}
async function fixture(t, gw) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-mm-'));
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
  const api = async (m, p, body, h = {'x-hs': '1', cookie}) => { const r = await fetch(base + p, {method: m, headers: h, ...(body ? {body: JSON.stringify(body)} : {})}); const txt = await r.text(); return {status: r.status, txt, j: JSON.parse(txt)}; };
  const ping = async (modelRef, h = {'x-hs': '1', cookie}) => { const r = await fetch(base + '/api/models/ping', {method: 'POST', headers: h, body: JSON.stringify({modelRef})}); const txt = await r.text(); return {status: r.status, txt, j: JSON.parse(txt)}; };
  return {root, api, ping, cookie, logs: () => logs};
}


test('model manage: overview, dry-run diff, confirm, backup/rollback, credentials write-only, guards', async t => {
  const gw = await gateway(t), f = await fixture(t, gw); const all = []; const A = async (...a) => { const r = await f.api(...a); all.push(r.txt); return r; };
  const writes = () => gw.calls.filter(c => c.method === 'config.patch');
  assert.equal((await A('GET', '/api/models/manage', null, {'x-hs': '1'})).status, 401);
  let r = await A('GET', '/api/models/manage'); assert.equal(r.status, 200); assert.equal(r.j.baseHash, 'h1');
  const xm = r.j.providers.find(p => p.provider === 'xiaomi-token-plan'); assert.equal(xm.credential.kind, 'secret-store'); assert.equal(xm.credential.target, 'XIAOMI_MIMO_API_KEY');
  const mimo = xm.models.find(m => m.id === 'mimo-v2.6-pro'); assert.equal(mimo.problem, 'missing_in_gateway'); assert.deepEqual(mimo.fix, {op: 'addModel', provider: 'xiaomi-token-plan', id: 'mimo-v2.6-pro'});
  assert.equal(r.j.providers.find(p => p.provider === 'xai').credential.kind, 'oauth'); assert.equal(r.j.providers.find(p => p.provider === 'qianfan').usedByPlugins, true);
  assert.ok(!r.txt.includes(KEY_OLD), 'secret store values never returned');

  // xiaomi 修复：预览 → 不写 → apply 需 confirm
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'addModel', provider: 'xiaomi-token-plan', id: 'mimo-v2.6-pro', name: 'MiMo v2.6 Pro', contextWindow: 262144}]});
  assert.equal(r.status, 200); assert.equal(r.j.dryRun, true); assert.equal(r.j.restart, 'none'); assert.deepEqual(r.j.pingRefs, ['xiaomi-token-plan/mimo-v2.6-pro']);
  assert.ok(r.j.diff.some(x => x.path === 'models.providers.xiaomi-token-plan.models')); assert.equal(writes().length, 0, 'plan never writes');
  assert.equal(r.j.apply, 'reload'); assert.deepEqual(r.j.reload.paths.map(x => [x.path, x.kind, x.label]), [['models.providers.xiaomi-token-plan.models', 'hot', 'reload']]);
  const planId = r.j.planId;
  assert.equal((await A('POST', '/api/models/manage/apply', {planId})).status, 400, 'needs confirm');
  r = await A('POST', '/api/models/manage/apply', {planId, confirm: true}); assert.equal(r.status, 200); assert.ok(r.j.backupId); assert.equal(r.j.restart, 'none');
  const w = writes().at(-1).params; assert.equal(w.baseHash, 'h1'); assert.deepEqual(w.replacePaths, ['models.providers.xiaomi-token-plan.models']);
  assert.equal(gw.st.cfg.models.providers['xiaomi-token-plan'].models[0].id, 'mimo-v2.6-pro'); assert.equal(gw.st.cfg.agents.defaults.models['xiaomi-token-plan/mimo-v2.6-pro'].alias, 'mimo', 'alias kept');
  assert.equal((await A('POST', '/api/models/manage/apply', {planId, confirm: true})).status, 410, 'plan single-use');
  const bk = fs.readdirSync(path.join(f.root, 'backups', 'model-manage')); assert.equal(bk.length, 1); assert.equal(fs.statSync(path.join(f.root, 'backups', 'model-manage', bk[0])).mode & 0o777, 0o600);
  r = await A('GET', '/api/models/manage'); assert.equal(r.j.providers.find(p => p.provider === 'xiaomi-token-plan').models[0].problem, undefined, 'fixed');

  // 过期 baseHash → 409 stale
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'setFallbacks', refs: ['deepseek/deepseek-flash', 'xiaomi-token-plan/mimo-v2.6-pro']}]}); const p2 = r.j.planId;
  gw.st.rev++; r = await A('POST', '/api/models/manage/apply', {planId: p2, confirm: true}); assert.equal(r.status, 409); assert.equal(r.j.code, 'baseHash_mismatch'); assert.equal(r.j.legacyCode, 'stale');
  assert.equal(fs.readdirSync(path.join(f.root, 'backups', 'model-manage')).length, 1, 'failed apply leaves no backup');

  // 新供应商 + 模型 + 默认/备用 + 别名（带点的模型 id）
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'addProvider', provider: 'kimi', baseUrl: 'https://api.moonshot.cn/v1/', api: 'openai-completions'}, {op: 'addModel', provider: 'kimi', id: 'kimi-k3.5', alias: 'kimi'}, {op: 'setFallbacks', refs: ['kimi/kimi-k3.5', 'deepseek/deepseek-flash']}]});
  assert.equal(r.status, 200, r.txt); r = await A('POST', '/api/models/manage/apply', {planId: r.j.planId, confirm: true}); assert.equal(r.status, 200, r.txt); const bk2 = r.j.backupId;
  assert.equal(gw.st.cfg.models.providers.kimi.baseUrl, 'https://api.moonshot.cn/v1'); assert.deepEqual(gw.st.cfg.agents.defaults.model.fallbacks, ['kimi/kimi-k3.5', 'deepseek/deepseek-flash']); assert.equal(gw.st.cfg.agents.defaults.models['kimi/kimi-k3.5'].alias, 'kimi');
  // 回滚：预览 + confirm
  r = await A('POST', '/api/models/manage/rollback', {backupId: bk2, dryRun: true}); assert.equal(r.status, 200); assert.deepEqual(r.j.conflicts, []);
  assert.equal((await A('POST', '/api/models/manage/rollback', {backupId: bk2})).status, 400, 'rollback needs confirm');
  r = await A('POST', '/api/models/manage/rollback', {backupId: bk2, confirm: true}); assert.equal(r.status, 200, r.txt);
  assert.equal(gw.st.cfg.models.providers.kimi, undefined); assert.equal(gw.st.cfg.agents.defaults.models['kimi/kimi-k3.5'], undefined); assert.deepEqual(gw.st.cfg.agents.defaults.model.fallbacks, ['deepseek/deepseek-flash']);
  assert.equal(gw.st.cfg.models.providers['xiaomi-token-plan'].models.length, 1, 'earlier change intact');

  // 守卫
  const bad = async (ops, code) => { const x = await A('POST', '/api/models/manage/plan', {ops}); assert.equal(x.status, code, JSON.stringify(ops) + ' ' + x.txt); };
  await bad([{op: 'removeProvider', provider: 'xai'}], 409); await bad([{op: 'removeProvider', provider: 'qianfan'}], 409); await bad([{op: 'removeModel', ref: 'anthropic/claude-sonnet-5-5'}], 409);
  await bad([{op: 'removeModel', ref: 'xai/grok-4.7'}], 409); await bad([{op: 'updateProvider', provider: 'xai', baseUrl: 'https://evil'}], 409); await bad([{op: 'addProvider', provider: 'x y', baseUrl: 'https://a', api: 'openai-completions'}], 400);
  await bad([{op: 'addProvider', provider: 'zz', baseUrl: 'file:///etc', api: 'openai-completions'}], 400); await bad([{op: 'setFallbacks', refs: ['nope/x']}], 404); await bad([{op: 'frob'}], 400);
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'removeModel', ref: 'deepseek/deepseek-flash'}]}); assert.equal(r.status, 200); assert.ok(r.j.diff.some(x => x.path === 'agents.defaults.model.fallbacks'));


  // 网关实时规则说 restart（如插件注册的规则）→ plan 409，不写
  const w0 = writes().length; gw.st.liveKinds['models.providers.deepseek.models'] = 'restart';
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'addModel', provider: 'deepseek', id: 'deepseek-v9'}]}); assert.equal(r.status, 409); assert.equal(r.j.code, 'restart_required');
  assert.deepEqual(r.j.blockedPaths, ['models.providers.deepseek.models']); assert.equal(r.j.reload.paths.find(x => x.path === 'models.providers.deepseek.models').label, 'restart'); assert.ok(r.j.diff.length);
  delete gw.st.liveKinds['models.providers.deepseek.models'];
  // 预览时热更新、apply 前变成 restart → apply 也拒，不写、不留备份
  r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'addModel', provider: 'deepseek', id: 'deepseek-v9'}]}); assert.equal(r.status, 200); const nb = fs.readdirSync(path.join(f.root, 'backups', 'model-manage')).length;
  gw.st.liveKinds['models.providers.deepseek.models'] = 'restart'; r = await A('POST', '/api/models/manage/apply', {planId: r.j.planId, confirm: true}); assert.equal(r.status, 409); assert.equal(r.j.code, 'restart_required');
  assert.equal(writes().length, w0, 'blocked before config.patch'); assert.equal(fs.readdirSync(path.join(f.root, 'backups', 'model-manage')).length, nb); delete gw.st.liveKinds['models.providers.deepseek.models'];
  // 网关 lookup 失败 → 用本地移植规则（hot），照常放行
  gw.st.lookupFail = true; r = await A('POST', '/api/models/manage/plan', {ops: [{op: 'setPrimary', ref: 'deepseek/deepseek-flash'}]}); assert.equal(r.status, 200, r.txt); assert.ok(r.j.reload.paths.every(x => x.local === 'hot' && x.live === null)); gw.st.lookupFail = false;
  // 凭证：只写不读
  r = await A('POST', '/api/models/manage/credential', {provider: 'xai', apiKey: KEY_NEW, confirm: true}); assert.equal(r.status, 409); assert.equal(r.j.code, 'oauth_managed');
  r = await A('POST', '/api/models/manage/credential', {provider: 'xiaomi-token-plan', dryRun: true}); assert.equal(r.j.method, 'secrets.store.set'); assert.equal(gw.st.secrets.XIAOMI_MIMO_API_KEY.value, KEY_OLD);
  assert.equal((await A('POST', '/api/models/manage/credential', {provider: 'xiaomi-token-plan', apiKey: KEY_NEW})).status, 400, 'needs confirm');
  assert.equal((await A('POST', '/api/models/manage/credential', {provider: 'xiaomi-token-plan', apiKey: 'a b', confirm: true})).status, 400);
  r = await A('POST', '/api/models/manage/credential', {provider: 'xiaomi-token-plan', apiKey: KEY_NEW, confirm: true}); assert.equal(r.status, 200); assert.equal(r.j.keyHint, '…' + KEY_NEW.slice(-4));
  assert.equal(gw.st.secrets.XIAOMI_MIMO_API_KEY.value, KEY_NEW); assert.equal(gw.st.secrets.XIAOMI_MIMO_API_KEY.kind, 'env'); assert.deepEqual(r.j.pingRefs, ['xiaomi-token-plan/mimo-v2.6-pro']);
  r = await A('POST', '/api/models/manage/credential', {provider: 'deepseek', apiKey: KEY_NEW, confirm: true}); assert.equal(r.j.method, 'models.authSetApiKey'); assert.equal(gw.st.profiles.deepseek, KEY_NEW);

  // 全程：不越界、不泄露、不重启
  for (const c of writes()) { const keys = []; const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { const q = [...p, k]; if (v && typeof v === 'object' && !Array.isArray(v) && q.length < 4) walk(v, q); else keys.push(q.join('.')); } }; walk(JSON.parse(c.params.raw), []);
    for (const k of keys) assert.ok(/^(models\.providers\.|agents\.defaults\.models?\.)/.test(k), 'path whitelist ' + k); assert.ok(!c.params.raw.includes('mem0') && !c.params.raw.includes('embed')); }
  assert.ok(!gw.calls.some(c => /restart|config\.apply|config\.set$|subscribe/.test(c.method)), 'no restart/apply/set/subscribe');
  for (const txt of all) assert.ok(!txt.includes(KEY_NEW.slice(0, -4)) && !txt.includes(KEY_OLD) && !txt.includes('gw-test-token'), 'no secret in response');
  const ops = fs.readFileSync(path.join(f.root, 'logs', 'ops.log'), 'utf8'); assert.ok(!ops.includes(KEY_NEW) && !ops.includes(KEY_OLD)); assert.match(ops, /models\.manage\.credential/);
  for (const b of fs.readdirSync(path.join(f.root, 'backups', 'model-manage'))) { const t2 = fs.readFileSync(path.join(f.root, 'backups', 'model-manage', b), 'utf8'); assert.ok(!t2.includes(KEY_NEW) && !t2.includes(KEY_OLD)); }
  assert.ok(!f.logs().includes(KEY_NEW) && !f.logs().includes(KEY_OLD));
});

test('reload plan port: classification + guard', () => {
  const src = fs.readFileSync(SERVER, 'utf8'); const blk = src.slice(src.indexOf('// <MM-RELOAD>'), src.indexOf('// </MM-RELOAD>'));
  const vm = require('node:vm'); const ctx = {}; vm.runInNewContext(blk + '\nthis.k = mmLocalKind; this.d = mmDiffPaths; this.g = mmGuardVerdict;', ctx);
  const K = ctx.k, G = p => ctx.g(p.map(x => ({path: x, kind: K(x)})));
  for (const p of ['models', 'models.providers.xiaomi-token-plan.models', 'models.providers.kimi', 'agents.defaults.models.xai/grok-4.7.alias', 'agents.defaults.model.fallbacks', 'agents.defaults.model.primary']) { assert.equal(K(p), 'hot', p); assert.equal(G([p]) === null || p === 'models', true, p); }
  assert.equal(G(['models.providers.kimi', 'agents.defaults.models.kimi/k.alias']), null, 'providers/models hot paths allowed');
  for (const p of ['foo', 'foo.bar', 'totallyUnknown.x', 'gateway.port', 'gateway.bind', 'gateway.auth.token', 'discovery.x', 'mcp.apps.x']) { assert.equal(K(p), 'restart', p); assert.equal(G([p]).code, 'restart_required', p); }
  assert.equal(K('gateway.reload.mode'), 'none'); assert.equal(K('gateway.controlUi.enabled'), 'hot');
  for (const p of ['gateway.reload.mode', 'gateway.controlUi.enabled', 'plugins.entries.openclaw-mem0.config.embedder', 'plugins.load', 'plugins', 'channels.qqbot', 'secrets.x', 'agents.entries.main']) assert.ok(G([p]), 'blocked: ' + p);
  assert.equal(G(['models.providers.x.models', 'gateway.port']).code, 'restart_required', 'one restart path blocks all');
  assert.deepEqual([...ctx.d({a: {b: 1, c: [1]}, z: 1}, {a: {b: 2, c: [1, 2]}, z: 1})], ['a.b', 'a.c']); assert.deepEqual([...ctx.d({m: {p: {}}}, {m: {p: {k: {x: 1}}}})], ['m.p.k']);
});
