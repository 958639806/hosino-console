const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

// Execute the shipped functions with fake gateway responses and a temporary audit log.
const source = fs.readFileSync(path.join(__dirname, '../server.mjs'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source section exists: ${start}`);
  return source.slice(a, b);
}
const code = [
  between('const SECRET_TXT =', 'const clip ='),
  between('const httpErr =', 'const dropCache ='),
  between('const W =', 'const qi ='),
  between('const MM_OAUTH =', '// <MM-RELOAD>'),
  between('async function mmSnapshot()', 'function mmRefsInPlugins('),
  between('async function mmSecretNames()', 'async function mmOverview()'),
  between('async function mmCredential(', 'const MM_ROUTES ='),
].join('\n');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-redaction-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const calls = [], drops = [], provider = options.provider || 'deepseek';
  const cfg = {models:{providers:{[provider]:options.pc || {}}}, agents:{defaults:{models:{[`${provider}/test-model`]:{}}}}};
  const logFile = path.join(root, 'logs', 'ops.log');
  const context = vm.createContext({
    fs, path, Buffer, URLSearchParams, OPSLOG:logFile,
    ipOf:() => '127.0.0.1', quietGuard:() => {}, dropCache:(...p) => drops.push(p),
    call:async (method, params) => {
      calls.push({method, params});
      if (options.failPreflight && method === 'config.get') throw options.failPreflight;
      if (method === 'config.get') return {config:cfg, valid:true};
      if (method === 'secrets.store.list') return {entries:options.store ? [{name:'DUMMY_KEY', kind:'secret'}] : []};
      if (method === 'models.authStatus') return {providers:[]};
      if (method === 'secrets.store.set' || method === 'models.authSetApiKey') {
        if (options.writeError) throw options.writeError;
        return options.result || {ok:true};
      }
      throw new Error('unexpected fake gateway method');
    },
  });
  const api = vm.runInContext(code + ';({opLog,W,mmCredential,redactKnownSecrets,operationErrorCode});', context);
  return {...api, calls, drops, logFile, readLog:() => fs.readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line))};
}

test('audit stores only controlled codes, redacts targets and bounds their length', t => {
  const f = fixture(t), key = 'DUMMYordinaryCredential98765';
  f.opLog(null, 'models.manage.credential', 'deepseek', false, Object.assign(new Error(`gateway echoed ${key}`), {code:key, body:{apiKey:key}}));
  f.opLog(null, 'profiles.set', 'apiKey=sk-DUMMYabcdefghijklmnop ' + 'x'.repeat(300), false, 'raw error ' + key);
  f.opLog(null, 'models.manage.credential', 'deepseek', false, Object.assign(new Error(key), {code:'oauth_managed', http:409}));
  f.opLog(null, 'profiles.set', 'profile-id', false, Object.assign(new Error(key), {http:400}));
  const log = f.readLog();
  assert.equal(log[0].err, 'operation_failed');
  assert.equal(log[1].err, 'operation_failed');
  assert.equal(log[2].err, 'oauth_managed');
  assert.equal(log[3].err, 'http_400');
  assert.ok(log[1].target.length <= 200);
  assert.ok(!log[1].target.includes('sk-DUMMYabcdefghijklmnop'));
  assert.ok(!fs.readFileSync(f.logFile, 'utf8').includes(key));
  assert.equal(fs.statSync(f.logFile).mode & 0o777, 0o600);
});

test('write wrapper removes the submitted ordinary key from both audit targets and failures', async t => {
  const f = fixture(t), key = 'DUMMYordinaryCredential98765';
  const fail = Object.assign(new Error('gateway rejected ' + key), {http:502});
  const successful = f.W('models.manage.credential', b => 'deepseek ' + b.apiKey, async () => ({ok:true}));
  const failed = f.W('models.manage.credential', b => 'deepseek ' + Buffer.from(b.apiKey).toString('base64'), async () => {throw fail;});
  assert.equal((await successful(null, {apiKey:key}, null)).ok, true);
  await assert.rejects(failed(null, {apiKey:key}, null), e => e === fail);
  const log = f.readLog();
  assert.equal(log[0].target, 'deepseek ••••••');
  assert.equal(log[1].target, 'deepseek ••••••');
  assert.equal(log[1].err, 'http_502');
  assert.ok(!fs.readFileSync(f.logFile, 'utf8').includes(key));
});

const encodings = {
  raw:s => s,
  json:s => JSON.stringify(s).slice(1, -1),
  nestedJson:s => JSON.stringify(JSON.stringify(s).slice(1, -1)).slice(1, -1),
  jsonSlashes:s => JSON.stringify(s).slice(1, -1).replace(/\//g, '\\/'),
  unicode:s => s.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''),
  uri:s => encodeURIComponent(s),
  uriLowercase:s => encodeURIComponent(s).replace(/%[\dA-F]{2}/g, p => p.toLowerCase()),
  form:s => new URLSearchParams({v:s}).toString().slice(2),
  base64:s => Buffer.from(s).toString('base64'),
  base64url:s => Buffer.from(s).toString('base64url'),
};

for (const backend of ['auth-profile', 'secret-store']) {
  test(`credential ${backend} masks an ordinary key on success and failure`, async t => {
    const key = 'DUMMYordinaryCredential98765';
    const options = backend === 'secret-store' ? {store:true, pc:{apiKey:'${DUMMY_KEY}'}} : {};
    const good = fixture(t, {...options, result:{reloaded:false, warning:'gateway echoed ' + key}});
    const response = await good.mmCredential({provider:'deepseek', apiKey:key, confirm:true});
    assert.equal(response.warning, 'gateway echoed ••••••');
    assert.equal(response.keyHint, '…8765');
    assert.equal(response.reloaded, false);
    assert.equal(response.method, backend === 'secret-store' ? 'secrets.store.set' : 'models.authSetApiKey');
    const sent = good.calls.find(c => c.method === response.method);
    assert.equal(sent.params.apiKey || sent.params.value, key, 'the gateway receives the original submitted credential');
    const bad = fixture(t, {...options, writeError:Object.assign(new Error('gateway echoed ' + key), {code:key, body:{apiKey:key}})});
    await assert.rejects(bad.mmCredential({provider:'deepseek', apiKey:key, confirm:true}), e => {
      assert.equal(e.http, 502);
      assert.equal(e.code, 'credential_write_failed');
      assert.ok(!e.message.includes(key));
      assert.equal(e.body, undefined);
      return true;
    });
  });

  test(`credential ${backend} masks JSON, URI, Unicode and Base64 echoes`, async t => {
    const key = 'DUMMY"\\秘密/+?=98765';
    const options = backend === 'secret-store' ? {store:true, pc:{apiKey:'${DUMMY_KEY}'}} : {};
    for (const [name, encode] of Object.entries(encodings)) {
      const echo = encode(key);
      const good = fixture(t, {...options, result:{warning:'upstream echoed ' + echo}});
      const response = await good.mmCredential({provider:'deepseek', apiKey:key, confirm:true});
      assert.equal(response.warning, 'upstream echoed ••••••', name);
      const bad = fixture(t, {...options, writeError:new Error('upstream echoed ' + echo)});
      await assert.rejects(bad.mmCredential({provider:'deepseek', apiKey:key, confirm:true}), e => {
        assert.equal(e.message, '网关拒绝了新 key：upstream echoed ••••••', name);
        return true;
      });
    }
  });
}

test('credential preflight errors cannot bypass masking through message, code or body', async t => {
  const key = 'DUMMY"\\ordinary98765', echo = JSON.stringify(key).slice(1, -1);
  const f = fixture(t, {failPreflight:Object.assign(new Error('config failed ' + echo), {code:key, body:{error:key}})});
  await assert.rejects(f.mmCredential({provider:'deepseek', apiKey:key, confirm:true}), e => {
    assert.equal(e.message, 'config failed ••••••');
    assert.equal(e.http, 502);
    assert.equal(e.code, undefined);
    assert.equal(e.body, undefined);
    return true;
  });
});

test('credential dry-run and local OAuth/inline guards retain their existing behavior', async t => {
  const dry = fixture(t, {store:true, pc:{apiKey:'${DUMMY_KEY}'}});
  const response = await dry.mmCredential({provider:'deepseek', dryRun:true});
  assert.equal(response.dryRun, true);
  assert.equal(response.method, 'secrets.store.set');
  assert.equal(response.target, 'DUMMY_KEY');
  assert.ok(!dry.calls.some(c => /(?:store\.set|authSetApiKey)$/.test(c.method)));
  const oauth = fixture(t, {provider:'xai'});
  await assert.rejects(oauth.mmCredential({provider:'xai', apiKey:'DUMMYordinary98765', confirm:true}), e => e.http === 409 && e.code === 'oauth_managed');
  const inline = fixture(t, {pc:{apiKey:'DUMMYexisting98765'}});
  await assert.rejects(inline.mmCredential({provider:'deepseek', apiKey:'DUMMYordinary98765', confirm:true}), e => e.http === 409 && e.code === 'inline_key');
});
