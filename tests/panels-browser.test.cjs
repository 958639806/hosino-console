const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { chromium } = require('playwright');

let mock, browser, base;
before(async () => {
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  mock = spawn(process.execPath, ['mock.mjs'], {
    cwd: path.resolve(__dirname, '../mock'), env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false, output = '';
  mock.stderr.on('data', data => { output += data; });
  for (let i = 0; i < 100; i++) {
    if (mock.exitCode !== null) throw new Error(`mock exited: ${output}`);
    try { if ((await fetch(base + '/api/me')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(ready, 'mock startup');
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if (mock && mock.exitCode === null) { mock.kill('SIGTERM'); await once(mock, 'exit'); }
});

async function pageFor(t, width = 1440) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 1000 } });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}
const confirmYes = page => page.locator('[data-confirm] [data-yes]').last();
const secretForm = page => page.locator('.sheet .cp-secf');
async function apiCall(page, method, ...args) {
  return page.evaluate(async ({ method, args }) => {
    const moduleUrl = new URL(document.querySelector('script[type=module]').src);
    const { api } = await import(new URL('./api.js' + moduleUrl.search, moduleUrl));
    try { return { value: await api[method](...args) }; }
    catch (e) { return { error: { message: e.message, status: e.status, code: e.code, detail: e.detail, data: e.data } }; }
  }, { method, args });
}

test('memory search remains explicit, sends the selected scope and explains result reuse', async t => {
  const page = await pageFor(t);
  const calls = [];
  await page.route('**/api/memory/users', route => route.fulfill({ json: { users: [{ user_id: 'person-1234567890', count: 2 }] } }));
  await page.route('**/api/memory/search', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { cached: false, results: [{ id: 'm1', memory: '<script>literal memory</script>', score: .9, user_id: 'person-1234567890' }] } });
  });
  await page.goto(base + '/#/memory#search');
  const panel = page.locator('[data-cp=memsearch]');
  await panel.waitFor();
  assert.equal(await panel.locator('#cp-q').getAttribute('maxlength'), '500');
  assert.match(await panel.innerText(), /每分钟最多 30 次/);
  await panel.locator('#cp-q').fill('a meaningful memory query');
  assert.equal(calls.length, 0, 'typing does not search');
  await panel.locator('#cp-scope').selectOption('person-1234567890');
  await panel.locator('#cp-go').click();
  await panel.locator('.cp-hit').waitFor();
  assert.deepEqual(calls, [{ q: 'a meaningful memory query', scope: 'users', user_ids: ['person-1234567890'], limit: 20, minScore: .5 }]);
  await panel.locator('#cp-go').click();
  await panel.locator('.cp-cache').waitFor();
  assert.equal(calls.length, 1);
  await panel.locator('.cp-hit').click();
  assert.equal(await page.locator('.sheet .cp-full').innerText(), '<script>literal memory</script>');
  assert.equal(await page.locator('.sheet script').count(), 0, 'memory text is escaped');
});

test('plugins show backend error details and failed runtime states; skills remain read only', async t => {
  const page = await pageFor(t);
  await page.route('**/api/plugins', route => route.fulfill({ json: { plugins: [
    { id: 'detailed', name: 'Detailed failure', enabled: true, runtime: 'service-failed', error: 'Synthetic plugin failure', protected: true },
    { id: 'bare', name: 'Bare failure', enabled: true, runtime: 'service-failed', error: null },
  ] } }));
  await page.goto(base + '/#/abilities#plugins');
  const rows = page.locator('.cp-plrow'); await rows.first().waitFor();
  assert.equal(await rows.filter({ hasText: '出错' }).count(), 2);
  assert.match(await rows.nth(0).innerText(), /Synthetic plugin failure/);
  assert.match(await rows.nth(0).innerText(), /受保护/);
  assert.match(await rows.nth(1).innerText(), /暂未返回详细原因/);
  await page.locator('[data-tab=skills]').click();
  await page.locator('[data-skill=weather]').waitFor();
  assert.equal(await page.getByRole('button', { name: /安装|开关/ }).count(), 0);
});

for (const width of [1440, 390]) {
  test(`empty secrets support create, replacement and clear without displaying values at width ${width}`, async t => {
    const page = await pageFor(t, width), writes = [];
    let names = [];
    await page.route('**/api/secrets', route => route.fulfill({ json: { secrets: names.map(name => ({ name, set: true })) } }));
    await page.route('**/api/secrets/set', route => {
      const body = route.request().postDataJSON(); writes.push(body); if (!names.includes(body.name)) names.push(body.name);
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/secrets/clear', route => {
      const body = route.request().postDataJSON(); writes.push(body); names = names.filter(name => name !== body.name);
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(base + '/#/system#secrets');
    await page.locator('[data-new-secret]').click();
    await secretForm(page).locator('[name=n]').fill('TEST_API_KEY');
    await secretForm(page).locator('[name=v]').fill('synthetic-initial-value');
    await secretForm(page).locator('[data-go]').click();
    await page.locator('.cp-sec').waitFor();
    assert.equal((await page.locator('body').innerText()).includes('synthetic-initial-value'), false);
    await page.locator('.cp-sec [data-set]').click();
    assert.equal(await secretForm(page).locator('[name=n]').count(), 0, 'existing names keep the replacement flow');
    assert.equal(await secretForm(page).locator('[name=v]').inputValue(), '');
    await secretForm(page).locator('[name=v]').fill('synthetic-replacement-value');
    await secretForm(page).locator('[data-go]').click();
    await secretForm(page).waitFor({ state: 'detached' });
    await page.locator('.cp-sec [data-clear]').click(); await confirmYes(page).click();
    await page.locator('[data-new-secret]').waitFor();
    await page.getByText('还没有密钥。', { exact: true }).waitFor();
    assert.deepEqual(writes, [
      { name: 'TEST_API_KEY', value: 'synthetic-initial-value', confirm: true },
      { name: 'TEST_API_KEY', value: 'synthetic-replacement-value', confirm: true },
      { name: 'TEST_API_KEY', confirm: true },
    ]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
  });
}

test('secrets preserve the name but wipe submitted values after a rejected write', async t => {
  const page = await pageFor(t); let writes = 0;
  await page.route('**/api/secrets', route => route.fulfill({ json: { secrets: [] } }));
  await page.route('**/api/secrets/set', route => { writes++; return route.fulfill({ status: 423, json: { error: 'quiet window', code: 'quiet_window' } }); });
  await page.goto(base + '/#/system#secrets'); await page.locator('[data-new-secret]').click();
  const form = secretForm(page);
  await form.locator('[name=n]').fill('lowercase'); await form.locator('[name=v]').fill('synthetic-value');
  await form.locator('[data-go]').click();
  assert.equal(writes, 0, 'invalid secret names never reach the server');
  await form.locator('[name=n]').fill('TEST_KEY'); await form.locator('[data-go]').click();
  await page.locator('#toast').filter({ hasText: '当前处于静默时段' }).waitFor();
  assert.equal(await form.locator('[name=n]').inputValue(), 'TEST_KEY');
  assert.equal(await form.locator('[name=v]').inputValue(), '');
  assert.equal(await form.locator('[data-go]').isEnabled(), true);
});

test('allowlist previews changes before applying them and keeps another list draft', async t => {
  const page = await pageFor(t), writes = [];
  const lists = [
    { path: 'channels.qq.allowFrom', label: 'People', apply: 'reload', items: ['old-user'] },
    { path: 'tools.allow', label: 'Tools', apply: 'immediate', items: ['read'] },
  ];
  await page.route('**/api/allowlist', route => route.fulfill({ json: { baseHash: 'version-1', lists } }));
  await page.route('**/api/allowlist/preview', route => {
    const body = route.request().postDataJSON(); writes.push(['preview', body]);
    return route.fulfill({ json: { diff: [{ path: body.changes[0].path, before: ['old-user'], after: body.changes[0].items, apply: 'reload' }] } });
  });
  await page.route('**/api/allowlist/apply', route => {
    const body = route.request().postDataJSON(); writes.push(['apply', body]); lists[0].items = body.changes[0].items;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(base + '/#/system#allowlist');
  for (const [i, item] of [[0, 'new-user'], [1, 'write']]) {
    const block = page.locator('[data-li]').nth(i); await block.locator('input').fill(item); await block.locator('.cp-add button').click();
  }
  await page.locator('[data-li="0"] [data-save]').click();
  await page.locator('.cp-diff').waitFor();
  assert.equal(writes.length, 1, 'preview is the only request before confirmation');
  await page.locator('.sheet [data-yes]').click();
  await page.locator('[data-li="0"] .cp-ok').waitFor();
  assert.deepEqual(writes, [
    ['preview', { baseHash: 'version-1', changes: [{ path: 'channels.qq.allowFrom', items: ['old-user', 'new-user'] }] }],
    ['apply', { baseHash: 'version-1', changes: [{ path: 'channels.qq.allowFrom', items: ['old-user', 'new-user'] }], confirm: true }],
  ]);
  assert.match(await page.locator('[data-li="1"]').innerText(), /write/);
  assert.equal(await page.locator('[data-li="1"] [data-save]').isVisible(), true);
});

test('quiet-window voice failures are distinct from a locked default voice', async t => {
  const page = await pageFor(t);
  await page.route('**/api/fun/voices', route => route.fulfill({ json: { voices: [], defaultAlias: 'hoshino_zh' } }));
  await page.route('**/api/fun/voices/regen-manual', route => route.fulfill({ status: 423, json: { code: 'quiet_window', error: 'Quiet window' } }));
  await page.goto(base + '/#/voice#voices');
  await page.locator('[data-vvadv] summary').click(); await page.locator('[data-vvregen]').click();
  await page.locator('#toast').filter({ hasText: '当前处于静默时段' }).waitFor();
  assert.equal((await page.locator('#toast').innerText()).includes('默认音色'), false);
  assert.equal(await page.locator('[data-vvregen]').isEnabled(), true);
});

test('model results display gateway/direct explanations without changing the ping request', async t => {
  const page = await pageFor(t), calls = [];
  await page.route('**/api/models/ping', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, status: 'ok', mode: 'raw', latencyMs: 200, warn: 'gateway_stall', warnMessage: '此检测通过网关执行；耗时和结果包含网关路由，不等同供应商直连', note: 'Synthetic direct explanation' } });
  });
  await page.goto(base + '/#/models');
  await page.locator('.cx-mg[data-pv=xai] summary').click();
  const ping = page.locator('[data-ping]').filter({ hasText: 'ping' }).first();
  const ref = await ping.getAttribute('data-ping'); await ping.click();
  await page.getByText('Synthetic direct explanation', { exact: true }).waitFor();
  await page.getByText('此检测通过网关执行；耗时和结果包含网关路由，不等同供应商直连', { exact: true }).waitFor();
  assert.deepEqual(calls, [{ modelRef: ref }]);
});

test('an old modelPing 401 cannot expire a newer login, and structured errors remain available', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/overview'); await page.locator('.hero').waitFor();
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  await page.route('**/api/models/ping', async route => { started(); await held; await route.fulfill({ status: 401, json: { error: 'old ping session' } }); });
  try {
    await page.evaluate(async () => {
      const moduleUrl = new URL(document.querySelector('script[type=module]').src);
      const { api } = await import(new URL('./api.js' + moduleUrl.search, moduleUrl));
      window.oldPanelPing = api.modelPing('xai/grok-4').catch(() => {});
    });
    await requested;
    await page.route('**/api/config', route => route.fulfill({ status: 401, json: { error: 'expired' } }));
    await apiCall(page, 'config');
    await page.locator('.login input[name=password]').fill('local mock password');
    await page.locator('.login button[type=submit]').click();
    await page.locator('.login').waitFor({ state: 'detached' });
    release(); await page.evaluate(() => window.oldPanelPing);
    assert.equal(await page.locator('.login').count(), 0);
    assert.equal(await page.locator('.shell').count(), 1);
    await page.unroute('**/api/models/ping');
    await page.route('**/api/models/ping', route => route.fulfill({ status: 429, json: { error: 'busy', code: 'busy', detail: 'synthetic-detail', retryAfterMs: 1000 } }));
    const result = await apiCall(page, 'modelPing', 'xai/grok-4');
    assert.deepEqual(result.error, { message: 'busy', status: 429, code: 'busy', detail: 'synthetic-detail', data: { error: 'busy', code: 'busy', detail: 'synthetic-detail', retryAfterMs: 1000 } });
  } finally { release(); }
});

async function manageProvider(page, provider) {
  await page.route('**/api/models/manage', route => route.fulfill({ json: {
    baseHash: 'synthetic-version', primary: 'xai/grok-4', fallbacks: [], providers: [provider],
  } }));
  await page.goto(base + '/#/models');
  await page.locator('.cx-prov').waitFor();
}
const oauthProvider = overrides => ({
  provider: 'synthetic-oauth', credential: { kind: 'oauth', present: false }, models: [], profiles: ['first', 'second'],
  capabilities: { login: true, order: true }, loginMethods: [{ id: 'device', label: '设备授权' }], ...overrides,
});

test('OAuth controls require explicit gateway capabilities', async t => {
  const page = await pageFor(t);
  await manageProvider(page, oauthProvider({ capabilities: {} }));
  assert.equal(await page.locator('[data-login],[data-pup]').count(), 0);
});

test('OAuth device login starts once, polls to completion and refreshes provider state', async t => {
  const page = await pageFor(t), starts = []; let polls = 0, reads = 0;
  await page.route('**/api/models/manage', route => { reads++; return route.fulfill({ json: {
    baseHash: 'version', primary: 'xai/grok-4', fallbacks: [], providers: [oauthProvider({ credential: { kind: 'oauth', present: polls > 1 } })],
  } }); });
  await page.route('**/api/models/auth/login', route => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ json: { pollId: 'synthetic-flow', flow: 'device', userCode: 'SYNTHETIC-CODE', url: 'https://example.test/authorize' } });
  });
  await page.route('**/api/models/auth/login/synthetic-flow', route => { polls++; return route.fulfill({ json: { state: polls === 1 ? 'pending' : 'done' } }); });
  await page.goto(base + '/#/models'); await page.locator('[data-login]').click();
  await page.getByText('SYNTHETIC-CODE', { exact: true }).waitFor();
  assert.equal(await page.locator('.sheet a').getAttribute('href'), 'https://example.test/authorize');
  await page.locator('#toast').filter({ hasText: 'synthetic-oauth 已登录' }).waitFor();
  assert.deepEqual(starts, [{ provider: 'synthetic-oauth', method: 'device', confirm: true }]);
  assert.equal(polls, 2); assert.equal(reads, 2);
  assert.equal(await page.locator('.sheet #cxlst').count(), 0);
  assert.equal(await page.locator('[data-login]').innerText(), '重新登录');
});

test('closing an OAuth login cancels it and prevents further polling', async t => {
  const page = await pageFor(t), cancellations = []; let polls = 0;
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'cancel-flow', userCode: 'CANCEL-CODE' } }));
  await page.route('**/api/models/auth/login/cancel-flow', route => { polls++; return route.fulfill({ json: { state: 'pending' } }); });
  await page.route('**/api/models/auth/login/cancel-flow/cancel', route => { cancellations.push(route.request().postDataJSON()); return route.fulfill({ json: { state: 'cancelled' } }); });
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  await page.locator('.sheet [data-cancel]').click();
  await page.waitForTimeout(1650);
  assert.deepEqual(cancellations, [{ confirm: true }]); assert.equal(polls, 0);
  assert.equal(await page.locator('#cxlst').count(), 0);
});

test('OAuth polling retries a transient failure, then shows a terminal error without polling forever', async t => {
  const page = await pageFor(t); let polls = 0;
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'error-flow', userCode: 'ERROR-CODE' } }));
  await page.route('**/api/models/auth/login/error-flow', route => {
    polls++; return polls === 1 ? route.fulfill({ status: 502, json: { error: 'Synthetic temporary failure' } })
      : route.fulfill({ json: { state: 'error', error: 'Synthetic authorization denied' } });
  });
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  await page.locator('#cxlst').filter({ hasText: '查询失败，重试中' }).waitFor();
  await page.locator('#cxlst').filter({ hasText: 'Synthetic authorization denied' }).waitFor();
  await page.waitForTimeout(2100); assert.equal(polls, 2);
  assert.equal(await page.locator('.sheet [data-cancel]').innerText(), '关闭');
});

test('OAuth start errors and malformed authorization links do not leave a broken login dialog', async t => {
  const page = await pageFor(t); let cancel = 0;
  await page.route('**/api/models/auth/login', route => route.fulfill({ status: 409, json: { error: 'Synthetic provider unavailable', code: 'auth_unsupported' } }));
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  await page.locator('#toast').filter({ hasText: '不支持这个供应商' }).waitFor();
  assert.equal(await page.locator('#cxlst').count(), 0);
  assert.equal(await page.locator('[data-login]').isEnabled(), true);
  await page.unroute('**/api/models/auth/login');
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'bad-url-flow', url: 'javascript:alert(1)' } }));
  await page.route('**/api/models/auth/login/bad-url-flow/cancel', route => { cancel++; return route.fulfill({ json: { ok: true } }); });
  await page.locator('[data-login]').click();
  await page.locator('#toast').filter({ hasText: '授权链接无效' }).waitFor();
  assert.equal(cancel, 1); assert.equal(await page.locator('.sheet a[href^="javascript:"]').count(), 0);
});

test('OAuth method selection passes the chosen method to the existing login flow', async t => {
  const page = await pageFor(t), calls = [];
  await page.route('**/api/models/auth/login', route => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { pollId: 'chosen-flow', userCode: 'CHOSEN' } }); });
  await page.route('**/api/models/auth/login/chosen-flow/cancel', route => route.fulfill({ json: { state: 'cancelled' } }));
  await manageProvider(page, oauthProvider({ loginMethods: [{ id: 'device', label: '设备授权' }, { id: 'web', label: '浏览器授权' }] }));
  await page.locator('[data-login]').click();
  await page.locator('[data-login-method] select').selectOption('web'); await page.locator('[data-login-method] button[type=submit], [data-login-method] button.primary').click();
  await page.getByText('CHOSEN', { exact: true }).waitFor();
  assert.deepEqual(calls, [{ provider: 'synthetic-oauth', method: 'web', confirm: true }]);
  await page.locator('.sheet [data-cancel]').click();
});

test('profile ordering confirms the full provider list, refreshes on success and preserves order on errors', async t => {
  const page = await pageFor(t), writes = []; let profiles = ['first', 'second'], fail = false;
  await page.route('**/api/models/manage', route => route.fulfill({ json: { baseHash: 'version', fallbacks: [], providers: [oauthProvider({ profiles })] } }));
  await page.route('**/api/models/auth/order', route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (fail) return route.fulfill({ status: 409, json: { error: 'Synthetic order locked', code: 'order_locked' } });
    profiles = body.profileIds; return route.fulfill({ json: { ok: true } });
  });
  await page.goto(base + '/#/models'); await page.locator('[data-pup][data-i="1"]').click();
  await confirmYes(page).click(); await page.locator('#toast').filter({ hasText: '顺序已保存' }).waitFor();
  assert.deepEqual(writes, [{ provider: 'synthetic-oauth', profileIds: ['second', 'first'], confirm: true }]);
  await page.locator('.cx-prov .cx-fbi').first().filter({ hasText: 'second' }).waitFor();
  fail = true; await page.locator('[data-pup][data-i="1"]').click(); await confirmYes(page).click();
  await page.locator('#toast').filter({ hasText: '顺序已锁定' }).waitFor();
  assert.deepEqual(profiles, ['second', 'first']);
  assert.equal(await page.locator('[data-pup][data-i="1"]').isEnabled(), true);
});

test('official wizard steps require explicit answers and preserve answer types', async t => {
  const page = await pageFor(t), answers = [];
  const steps = [
    { id: 'note', type: 'note', requiresAnswer: true, title: '授权说明', message: '阅读后继续。' },
    { id: 'callback', type: 'text', requiresAnswer: true, title: '粘贴回调', sensitive: true },
    { id: 'account', type: 'select', requiresAnswer: true, title: '选择账号', options: [{ value: 'one', label: '第一项' }, { value: 2, label: '第二项' }] },
    { id: 'confirm', type: 'confirm', requiresAnswer: true, title: '确认选择' },
    { id: 'scopes', type: 'multiselect', requiresAnswer: true, title: '选择权限', options: [{ value: 'read', label: '读取' }, { value: 'write', label: '写入' }] },
    { id: 'action', type: 'action', executor: 'client', requiresAnswer: true, title: '完成浏览器操作', externalUrl: 'https://example.test/authorization' },
    { id: 'progress', type: 'progress', requiresAnswer: false, title: '正在保存' },
  ];
  let index = 0;
  const snapshot = () => ({ state: 'pending', step: steps[index] });
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'wizard-flow', ...snapshot() } }));
  await page.route('**/api/models/auth/login/wizard-flow', route => route.fulfill({ json: index === steps.length - 1 ? { state: 'done' } : snapshot() }));
  await page.route('**/api/models/auth/login/wizard-flow/answer', route => { answers.push(route.request().postDataJSON()); index++; return route.fulfill({ json: snapshot() }); });
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  const form = page.locator('[data-auth-answer]');
  await form.getByRole('button', { name: '继续', exact: true }).click();
  const input = form.locator('[name=answer]'); await input.waitFor();
  assert.equal(await input.getAttribute('type'), 'password');
  await input.fill('synthetic-sensitive-callback'); await form.getByRole('button', { name: '提交', exact: true }).click();
  await form.locator('select').selectOption('1');
  assert.equal(answers.length, 2, 'selecting does not automatically answer');
  await form.getByRole('button', { name: '提交', exact: true }).click();
  await form.getByRole('button', { name: '不确认', exact: true }).click();
  await form.locator('input[value="0"]').check(); await form.locator('input[value="1"]').check();
  assert.equal(answers.length, 4, 'checkboxes do not automatically answer');
  await form.getByRole('button', { name: '提交', exact: true }).click();
  await page.locator('.sheet a[href="https://example.test/authorization"]').waitFor();
  await form.getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('[data-auth-step]').filter({ hasText: '正在保存' }).waitFor();
  assert.equal(await page.locator('[data-auth-answer]').count(), 0, 'progress never requests an answer');
  await page.locator('#toast').filter({ hasText: 'synthetic-oauth 已登录' }).waitFor();
  assert.deepEqual(answers, [
    { stepId: 'note', confirm: true },
    { stepId: 'callback', value: 'synthetic-sensitive-callback', confirm: true },
    { stepId: 'account', value: 2, confirm: true },
    { stepId: 'confirm', value: false, confirm: true },
    { stepId: 'scopes', value: ['read', 'write'], confirm: true },
    { stepId: 'action', confirm: true },
  ]);
  assert.equal((await page.locator('body').innerText()).includes('synthetic-sensitive-callback'), false);
});

test('wizard polls update device instructions without erasing unsent text; rejected answers stay retryable', async t => {
  const page = await pageFor(t), answers = []; let polls = 0;
  const step = { id: 'callback', type: 'text', sensitive: true, requiresAnswer: true, title: '输入回调' };
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'retry-flow', step } }));
  await page.route('**/api/models/auth/login/retry-flow', route => { polls++; return route.fulfill({ json: { state: 'pending', step, url: 'https://example.test/new-device', userCode: 'DYNAMIC-CODE' } }); });
  await page.route('**/api/models/auth/login/retry-flow/answer', route => { answers.push(route.request().postDataJSON()); return route.fulfill({ status: 423, json: { code: 'quiet_window', error: 'Quiet window' } }); });
  await page.route('**/api/models/auth/login/retry-flow/cancel', route => route.fulfill({ json: { state: 'cancelled' } }));
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  const input = page.locator('[data-auth-answer] input'); await input.fill('synthetic-unsent-callback');
  await page.getByText('DYNAMIC-CODE', { exact: true }).waitFor();
  assert.ok(polls > 0); assert.equal(await input.inputValue(), 'synthetic-unsent-callback');
  await page.locator('[data-auth-answer] button').click();
  await page.locator('#cxlst').filter({ hasText: '当前处于静默时段' }).waitFor();
  assert.equal(await input.inputValue(), ''); assert.equal(await page.locator('[data-auth-answer] button').isEnabled(), true);
  assert.deepEqual(answers, [{ stepId: 'callback', value: 'synthetic-unsent-callback', confirm: true }]);
  await page.locator('.sheet [data-cancel]').click();
});

test('a running wizard that cannot yet cancel stays visible until cancellation succeeds', async t => {
  const page = await pageFor(t); let cancels = 0;
  await page.route('**/api/models/auth/login', route => route.fulfill({ json: { pollId: 'busy-flow', userCode: 'BUSY-CODE' } }));
  await page.route('**/api/models/auth/login/busy-flow', route => route.fulfill({ json: { state: 'pending' } }));
  await page.route('**/api/models/auth/login/busy-flow/cancel', route => { cancels++; return route.fulfill({ json: cancels === 1 ? { state: 'pending', warning: 'Synthetic operation is still running' } : { state: 'cancelled' } }); });
  await manageProvider(page, oauthProvider()); await page.locator('[data-login]').click();
  await page.locator('.sheet [data-cancel]').click();
  await page.locator('#cxlst').filter({ hasText: 'Synthetic operation is still running' }).waitFor();
  assert.equal(await page.locator('.sheet [data-cancel]').isEnabled(), true);
  await page.keyboard.press('Escape'); await page.locator('#cxlst').waitFor({ state: 'detached' });
  assert.equal(cancels, 2);
});

test('allowlist edits made while preview is in flight survive applying the submitted snapshot', async t => {
  const page = await pageFor(t); let release, arrived, items = ['old-user']; const writes = [];
  const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/allowlist', route => route.fulfill({ json: { baseHash: 'version', lists: [{ path: 'channels.qq.allowFrom', label: 'People', apply: 'reload', items }] } }));
  await page.route('**/api/allowlist/preview', async route => { writes.push(route.request().postDataJSON()); arrived(); await held; await route.fulfill({ json: { apply: 'reload' } }); });
  await page.route('**/api/allowlist/apply', route => { const body = route.request().postDataJSON(); writes.push(body); items = body.changes[0].items; return route.fulfill({ json: { ok: true } }); });
  try {
    await page.goto(base + '/#/system#allowlist');
    const add = async item => { await page.locator('.cp-add input').fill(item); await page.locator('.cp-add button').click(); };
    await add('submitted-user'); await page.locator('[data-li] [data-save]').click(); await requested;
    await add('later-user'); release();
    await page.locator('.cp-diff').waitFor();
    assert.equal((await page.locator('.cp-diff').innerText()).includes('later-user'), false, 'preview describes exactly what will be applied');
    await page.locator('.sheet [data-yes]').click();
    await page.locator('[data-li] .cp-ok').waitFor();
    assert.match(await page.locator('[data-li]').innerText(), /later-user/);
    assert.equal(await page.locator('[data-li] [data-save]').isVisible(), true);
    assert.deepEqual(writes.map(x => x.changes[0].items), [['old-user', 'submitted-user'], ['old-user', 'submitted-user']]);
  } finally { release(); }
});

test('a saved secret with an unconfirmed runtime refresh shows the backend warning', async t => {
  const page = await pageFor(t); let saved = false;
  await page.route('**/api/secrets', route => route.fulfill({ json: { secrets: saved ? [{ name: 'TEST_KEY', set: true }] : [] } }));
  await page.route('**/api/secrets/set', route => { saved = true; return route.fulfill({ json: { ok: true, reloaded: false, warning: 'Synthetic runtime refresh is unconfirmed' } }); });
  await page.goto(base + '/#/system#secrets'); await page.locator('[data-new-secret]').click();
  await secretForm(page).locator('[name=n]').fill('TEST_KEY'); await secretForm(page).locator('[name=v]').fill('synthetic-secret');
  await secretForm(page).locator('[data-go]').click();
  await page.getByRole('heading', { name: '密钥库已更新' }).waitFor();
  await page.getByText('Synthetic runtime refresh is unconfirmed', { exact: true }).waitFor();
  await confirmYes(page).click(); await page.locator('.cp-sec').waitFor();
  assert.equal((await page.locator('body').innerText()).includes('synthetic-secret'), false);
});
