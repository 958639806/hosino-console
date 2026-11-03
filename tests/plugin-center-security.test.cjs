const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const moduleUrl = pathToFileURL(path.join(__dirname, '../plugin-center.mjs')).href;
const OLD = 'DUMMYordinaryOldCredential98765', NEW = 'DUMMYordinaryNewCredential43210';
const clone = value => JSON.parse(JSON.stringify(value));
const mutated = calls => calls.filter(call => /^(?:config\.(?:patch|set|apply)|plugins\.(?:install|uninstall|setEnabled|reload|refresh|update))$/.test(call.method));

async function fixture(options = {}) {
  const {makePluginCenter} = await import(moduleUrl);
  const calls = [];
  const state = {
    time:1000, quiet:false, valid:true, mutationAllowed:true,
    hash:'h1', plugins:[{id:'utility', installed:true, enabled:true}],
    config:{gateway:{auth:{token:'FAKE_GATEWAY_ONLY'}}, plugins:{entries:{utility:{config:{display:'old', apiKey:OLD, nested:{phrase:OLD}, accounts:[]}}}}},
    schema:{type:'object', properties:{
      display:{type:'string', maxLength:100}, apiKey:{type:'string', sensitive:true},
      nested:{type:'object', properties:{phrase:{type:'string', writeOnly:true}}},
      accounts:{type:'array', items:{type:'object', properties:{apiKey:{type:'string', sensitive:true}}}},
    }},
    lookupKind:'none', children:[], reload:{label:'immediate', restartRequired:false, paths:[{path:'plugins.entries.utility.config.display', kind:'none'}]},
  };
  const declared = Object.fromEntries(['channels','providers','tools','contracts','hooks','mcpServers','cliCommands','cliBackends','skills','dangerousConfigFlags'].map(key => [key, []]));
  const components = {...Object.fromEntries(['mapped','skills','mcpServers','commands','hooks','lspServers'].map(key => [key, []])), unavailable:{capabilities:[], mcpServers:[], lspServers:[]}};
  const center = makePluginCenter({
    now:() => state.time, ttlMs:100, safeConfigPlugins:new Set(options.safe === false ? [] : ['utility']),
    quietGuard:() => {if(state.quiet)throw Object.assign(new Error('static quiet window'), {http:423, code:'quiet_window'});},
    reloadPlan:async () => state.reload,
    call:async (method, params) => {
      calls.push({method, params:clone(params)});
      if (state.failure?.method === method) throw Object.assign(new Error(state.failure.message), {code:state.failure.code});
      if (method === 'config.get') return {hash:state.hash, valid:state.valid, config:clone(state.config)};
      if (method === 'plugins.list') return {mutationAllowed:state.mutationAllowed, plugins:clone(state.plugins)};
      if (method === 'plugins.inspect') return {plugin:{id:params.pluginId}, declared:clone(declared), components:clone(components)};
      if (method === 'config.schema.lookup') return {schema:clone(state.schema), children:clone(state.children), reloadKind:state.lookupKind};
      if (method === 'config.patch') return {ok:true, warning:NEW, config:{apiKey:NEW}};
      throw new Error('Unexpected fake method');
    },
  });
  const plan = (config, owner) => center.plan({action:'config', id:'utility', baseHash:state.hash, config}, owner);
  return {center, state, calls, plan};
}

test('plugin detail and secret preview omit ordinary credentials and schema defaults', async () => {
  const f = await fixture();
  f.state.schema.properties.apiKey.default = OLD;
  f.state.schema.properties.apiKey.enum = [OLD, NEW];
  const detail = await f.center.detail('utility');
  assert.ok(!JSON.stringify(detail).includes(OLD));
  assert.ok(detail.config.secretFields.some(field => field.path === 'apiKey'));
  assert.ok(detail.config.secretFields.some(field => field.path === 'nested.phrase'));
  const plan = await f.plan({apiKey:NEW, nested:{phrase:NEW}});
  assert.equal(plan.canApply, false);
  assert.equal(plan.secretChanged, true);
  assert.ok(!JSON.stringify(plan).includes(OLD));
  assert.ok(!JSON.stringify(plan).includes(NEW));
  await assert.rejects(f.center.apply({planId:plan.planId, baseHash:plan.baseHash, confirm:true}));
  assert.equal(mutated(f.calls).length, 0);
});

test('structured array patches, including empty replacements, cannot expose old or new credentials', async () => {
  for (const accounts of [[{apiKey:NEW}], []]) {
    const f = await fixture();
    f.state.config.plugins.entries.utility.config.accounts = [{apiKey:OLD}];
    let plan;
    try { plan = await f.plan({accounts}); }
    catch (error) {assert.ok([400, 409].includes(error.http));}
    if (plan) {
      assert.ok(!JSON.stringify(plan).includes(NEW), 'new credential is absent from the plan and export');
      assert.ok(!JSON.stringify(plan).includes(OLD), 'old credential is absent from the plan and export');
      assert.equal(plan.canApply, false);
    }
    assert.equal(mutated(f.calls).length, 0);
  }
});

test('hint-only sensitive fields also remove credential enums from public schema', async () => {
  const f = await fixture();
  f.state.config.plugins.entries.utility.config.phrase = OLD;
  f.state.schema.properties.phrase = {type:'string', enum:[OLD]};
  f.state.children = [{key:'phrase', hint:{sensitive:true}}];
  const detail = await f.center.detail('utility');
  assert.equal(detail.config.values.phrase, undefined);
  assert.ok(!JSON.stringify(detail).includes(OLD));
});

test('an unset sensitive field is identified before the first credential could be entered', async () => {
  const f = await fixture();
  delete f.state.config.plugins.entries.utility.config.apiKey;
  const detail = await f.center.detail('utility');
  assert.ok(detail.config.secretFields.some(field => field.path === 'apiKey' && field.configured === false));
  const source = fs.readFileSync(path.join(__dirname, '../public/plugin-center.js'), 'utf8');
  const functions = vm.runInNewContext(source.slice(0, source.indexOf('export async function pluginCenter')) + ';({configFields,inputHtml});', {URL});
  const field = functions.configFields(detail.config).find(field => field.keys.join('.') === 'apiKey');
  assert.ok(field.secret);
  const html = functions.inputHtml(field, 0);
  assert.ok(!html.includes('type="text"'), 'an unset credential is never rendered as an ordinary text field');
});

test('all nested prototype keys are rejected before a plugin config mutation', async () => {
  const f = await fixture();
  for (const value of [
    JSON.parse('{"__proto__":{"polluted":"yes"}}'),
    JSON.parse('{"nested":{"constructor":{"prototype":{"polluted":"yes"}}}}'),
    JSON.parse('{"accounts":[{"prototype":{"polluted":"yes"}}]}'),
  ]) await assert.rejects(f.plan(value), error => error.http === 400 && error.code === 'invalid_config');
  assert.equal({}.polluted, undefined);
  assert.equal(mutated(f.calls).length, 0);
});

test('channel ownership, current slots, and same-package members remain protected', async () => {
  const f = await fixture();
  f.state.config.channels = {qqbot:{}};
  f.state.config.plugins.slots = {memory:'custom-memory'};
  f.state.plugins.push(
    {id:'custom-channel', installed:true, enabled:true, channelIds:['qqbot'], packageName:'shared-native-package'},
    {id:'innocent-sibling', installed:true, enabled:true, packageName:'shared-native-package'},
    {id:'custom-memory', installed:true, enabled:true},
  );
  const listed = await f.center.list();
  for (const id of ['custom-channel','innocent-sibling','custom-memory']) {
    assert.equal(listed.plugins.find(plugin => plugin.id === id).protected, true, id);
    for (const action of ['config','disable','uninstall']) await assert.rejects(f.center.plan({action, id, baseHash:'h1', config:{display:'new'}}), error => error.http === 403 && error.code === 'plugin_protected');
  }
  assert.equal(mutated(f.calls).length, 0);
});

test('native install candidates reject URLs, local artifacts and foreign runtimes; lifecycle plans never execute', async () => {
  const f = await fixture();
  for (const spec of ['https://example.invalid/plugin.tgz','file:/tmp/plugin','../plugin','git+ssh://example.invalid/plugin','astrbot_plugin_demo','plugin.py','plugin.zip']) {
    await assert.rejects(f.center.plan({action:'install', source:'npm', spec, baseHash:'h1'}), error => error.http === 400);
  }
  const install = await f.center.plan({action:'install', source:'npm', spec:'@example/native-plugin@1.2.3', baseHash:'h1'});
  assert.equal(install.canApply, false);
  for (const action of ['enable','disable','uninstall']) {
    const planned = await f.center.plan({action, id:'utility', baseHash:'h1'});
    await assert.rejects(f.center.apply({planId:planned.planId, baseHash:'h1', confirm:true}));
  }
  assert.equal(mutated(f.calls).length, 0);
});

test('audited config writes keep existing secrets and cannot be redirected by edited apply input', async () => {
  const f = await fixture(), patch = {display:'new'};
  const plan = await f.plan(patch); assert.equal(plan.canApply, true);
  patch.display = 'changed-after-preview';
  const result = await f.center.apply({planId:plan.planId, baseHash:'h1', confirm:true, id:'openclaw-qqbot', config:{gateway:{auth:{token:NEW}}}});
  assert.equal(result.applied, true);
  const writes = mutated(f.calls);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'config.patch');
  assert.deepEqual(JSON.parse(writes[0].params.raw), {plugins:{entries:{utility:{config:{display:'new'}}}}});
  assert.equal(writes[0].params.baseHash, 'h1');
  assert.ok(!JSON.stringify(result).includes(NEW));
  assert.ok(!writes[0].params.raw.includes(OLD));
  assert.ok(!writes[0].params.raw.includes(NEW));
});

test('official redaction sentinels can be kept while an unrelated audited field changes', async () => {
  const f = await fixture();
  f.state.config.plugins.entries.utility.config.apiKey = '__OPENCLAW_REDACTED__';
  f.state.schema.properties.apiKey.minLength = 128;
  f.state.schema.required = ['display','apiKey'];
  const plan = await f.plan({display:'new'});
  assert.equal(plan.canApply, true);
  await f.center.apply({planId:plan.planId, baseHash:'h1', confirm:true});
  const patch = JSON.parse(mutated(f.calls)[0].params.raw);
  assert.deepEqual(patch.plugins.entries.utility.config, {display:'new'});
});

test('plans are bound to the current session and cannot be replayed after successful application', async () => {
  const f = await fixture(), plan = await f.plan({display:'new'}, 'fake-owner-session');
  const body = {planId:plan.planId, baseHash:'h1', confirm:true};
  await assert.rejects(f.center.apply(body, 'different-fake-session'), error => error.http === 404 && error.code === 'plan_not_found');
  assert.equal(mutated(f.calls).length, 0);
  assert.equal((await f.center.apply(body, 'fake-owner-session')).applied, true);
  await assert.rejects(f.center.apply(body, 'fake-owner-session'), error => error.http === 410 && error.code === 'plan_expired');
  assert.equal(mutated(f.calls).length, 1);
});

test('stale, expired, protected, quiet and restart changes block application before any mutation', async () => {
  for (const scenario of ['hash','expiry','protected','quiet','restart','read-only']) {
    const f = await fixture(), plan = await f.plan({display:'new'});
    if (scenario === 'hash') f.state.hash = 'h2';
    if (scenario === 'expiry') f.state.time += 101;
    if (scenario === 'protected') f.state.config.plugins.slots = {memory:'utility'};
    if (scenario === 'quiet') f.state.quiet = true;
    if (scenario === 'restart') f.state.reload = {label:'restart', restartRequired:true, paths:[{kind:'restart'}]};
    if (scenario === 'read-only') f.state.mutationAllowed = false;
    await assert.rejects(f.center.apply({planId:plan.planId, baseHash:'h1', confirm:true}), undefined, scenario);
    assert.equal(mutated(f.calls).length, 0, scenario);
  }
});

test('untrusted gateway failures do not return raw credentials in message, code or body', async () => {
  const f = await fixture();
  f.state.failure = {method:'config.get', message:NEW, code:NEW};
  await assert.rejects(f.center.list(), error => {
    assert.equal(error.http, 502);
    assert.equal(error.code, 'plugin_upstream');
    assert.ok(!JSON.stringify({message:error.message, ...error}).includes(NEW));
    return true;
  });
});

test('ordinary credentials in runtime errors never become inventory or detail diagnostics', async () => {
  const f = await fixture();
  f.state.plugins[0].runtime = {state:'service-failed', error:'Request failed with ' + OLD};
  const inventory = await f.center.list(), detail = await f.center.detail('utility');
  assert.ok(!JSON.stringify(inventory).includes(OLD));
  assert.ok(!JSON.stringify(detail).includes(OLD));
  assert.equal(inventory.plugins[0].runtime, 'service-failed');
});

test('frontend ignores malformed schema length constraints instead of injecting attributes or elements', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/plugin-center.js'), 'utf8');
  const inputHtml = vm.runInNewContext(source.slice(0, source.indexOf('export async function pluginCenter')) + ';inputHtml;', {URL});
  const html = inputHtml({schema:{type:'string', minLength:'1" autofocus onfocus="bad()', maxLength:'10"><span data-pc-schema-injected="yes">Injected</span><input value="'}, type:'string', supported:true, title:'Safe', value:'safe'}, 0);
  assert.ok(!html.includes('<span data-pc-schema-injected='));
  assert.ok(!html.includes('onfocus='));
});
