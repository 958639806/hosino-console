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
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  mock = spawn(process.execPath, ['mock.mjs'], {
    cwd: path.resolve(__dirname, '../mock'),
    env: { ...process.env, PORT: String(port) },
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
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width, height: 1000 },
  });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}

async function openCenter(page) {
  await page.goto(base + '/#/abilities#plugin-center');
}

async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal page overflow');
  assert.equal(await page.locator('.pc-dialog').evaluateAll(dialogs => dialogs.some(dialog => dialog.scrollWidth > dialog.clientWidth + 1)), false, 'no horizontal plugin dialog overflow');
}
async function capture(page, name, width) {
  const dir = path.resolve(__dirname, '../../hosino-validation/v2026.11.4-rc.2/frontend');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `plugin-center-${name}-${width}.png`), animations: 'disabled' });
}

const confirmation = page => page.locator('[data-confirm]').last();

const plugins = [
  { id: 'weather', name: '天气助手', description: '按地点查天气', enabled: true, runtime: 'running', installed: true, origin: 'global', version: '1.0.0' },
  { id: 'notes', name: '笔记助手', description: '整理笔记', enabled: false, runtime: 'stopped', installed: true, origin: 'workspace' },
  { id: 'broken', name: '故障示例', description: '仅测试失败展示', enabled: true, runtime: 'service-failed', error: 'Synthetic plugin failure', installed: true },
  { id: 'qqbot', name: 'QQ 渠道', enabled: true, runtime: 'running', protected: true, protectedReason: '保护正在使用的 QQ 渠道', installed: true },
];
const schema = {
  type: 'object', properties: {
    city: { type: 'string', title: '城市', minLength: 2, maxLength: 30 },
    limit: { type: 'integer', title: '结果条数', minimum: 1, maximum: 9 },
    notifications: { type: 'boolean', title: '提醒' },
    mode: { type: 'string', title: '回复风格', enum: ['brief', 'detailed'] },
    apiKey: { type: 'string', title: '服务密钥', writeOnly: true },
  }, required: ['city', 'limit'],
};
const initialValues = { city: '上海', limit: 3, notifications: false, mode: 'brief' };
async function apiFixture(page, options = {}) {
  const requests = [], state = { values: structuredClone(initialValues), hash: 'version-1', ...options.state };
  const details = id => {
    const plugin = structuredClone(plugins.find(item => item.id === id));
    const capabilities = { configure: options.writable === true, previewConfig: !plugin.protected, enable: false, disable: false, uninstall: false };
    return {
      plugin: { ...plugin, capabilities }, baseHash: state.hash,
      readme: null, readmeUrl: 'https://example.test/plugin-readme',
      declared: { tools: ['weather.lookup'], channels: [], providers: [] }, components: { commands: ['weather'] },
      config: { values: state.values, schema, secretFields: [{ path: 'apiKey', keys: ['apiKey'], configured: true }], writable: options.writable === true, previewable: !plugin.protected },
      capabilities, ...options.detail,
    };
  };
  await page.route('**/api/plugin-center**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.method() === 'POST' ? request.postDataJSON() : undefined;
    requests.push({ path: url.pathname, method: request.method(), body });
    if (url.pathname === '/api/plugin-center') return route.fulfill({ json: { baseHash: state.hash, plugins, capabilities: { install: false, installPreview: options.installPreview === true }, blockedReasons: { lifecycle: '安装、启停和卸载需要维护时处理，当前不会执行。' } } });
    if (url.pathname === '/api/plugin-center/detail') {
      if (options.onDetail) return options.onDetail(route, details(url.searchParams.get('id')));
      return route.fulfill({ json: details(url.searchParams.get('id')) });
    }
    if (url.pathname === '/api/plugin-center/plan') {
      if (options.onPlan) return options.onPlan(route, body);
      const diff = body.action === 'install' ? [{ path: '原生安装候选', before: null, after: { source: body.source, spec: body.spec } }]
        : Object.entries(body.config).map(([path, after]) => ({ path, before: state.values[path], after }));
      return route.fulfill({ json: { planId: 'synthetic-plan', baseHash: state.hash, diff, apply: options.writable ? 'immediate' : 'reload', canApply: options.writable === true, blockedReason: options.writable ? null : '此改动需在维护时处理，本次不会应用。' } });
    }
    if (url.pathname === '/api/plugin-center/apply') {
      if (options.onApply) return options.onApply(route, body);
      state.hash = 'version-2'; return route.fulfill({ json: { ok: true, baseHash: state.hash } });
    }
    throw new Error('Unexpected test endpoint: ' + url.pathname);
  });
  return { requests, state };
}
const detailDialog = page => page.locator('[data-sheet="plugin-center-detail"] > .sheet');
const planDialog = page => page.locator('[data-sheet="plugin-center-plan"] > .sheet');
const configInput = (page, label) => detailDialog(page).getByLabel(label, { exact: false });
async function editConfig(page) {
  await page.locator('[data-pc-id="weather"]').click();
  await detailDialog(page).locator('[data-pc-tab=config]').click();
}

for (const width of [1440, 390, 320]) {
  test(`native inventory search, filters, detail and honest documentation work at ${width}px`, async t => {
    const page = await pageFor(t, width); await apiFixture(page);
    await openCenter(page); await page.locator('.pc-plugin').first().waitFor();
    await capture(page, 'inventory', width);
    assert.equal(await page.locator('.pc-plugin').count(), 4);
    await page.locator('[data-pc-search]').fill('笔记'); assert.equal(await page.locator('.pc-plugin').count(), 1);
    await page.locator('[data-pc-search]').fill(''); await page.locator('[data-pc-status]').selectOption('error');
    assert.equal(await page.locator('[data-pc-id="broken"]').count(), 1);
    await page.locator('[data-pc-id="broken"]').click(); await detailDialog(page).getByText('Synthetic plugin failure', { exact: true }).waitFor();
    await detailDialog(page).locator('[data-pc-close]').click();
    await page.locator('[data-pc-status]').selectOption('all'); await page.locator('[data-pc-id="weather"]').click();
    await detailDialog(page).getByText('weather.lookup', { exact: true }).waitFor();
    await capture(page, 'detail', width);
    await detailDialog(page).locator('[data-pc-tab=readme]').click();
    await detailDialog(page).getByText('插件未提供可在这里阅读的说明正文。', { exact: true }).waitFor();
    const source = detailDialog(page).getByRole('link', { name: '打开来源说明 ↗' });
    assert.equal(await source.getAttribute('href'), 'https://example.test/plugin-readme');
    assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
    await assertNoOverflow(page);
    assert.equal(await page.getByRole('button', { name: /^(安装插件|启用插件|停用插件|更新插件|卸载插件)$/ }).count(), 0);
    await detailDialog(page).locator('[data-pc-tab=config]').click(); await configInput(page, '城市').fill('北京');
    await detailDialog(page).locator('[data-pc-preview]').click(); await planDialog(page).waitFor();
    await assertNoOverflow(page); await capture(page, 'maintenance-plan', width);
  });
}

test('protected QQ plugins stay read-only even if a response claims configuration capability', async t => {
  const page = await pageFor(t); const fixture = await apiFixture(page, { writable: true, detail: { capabilities: { configure: true, previewConfig: true }, config: { values: initialValues, schema, secretFields: [], previewable: true, writable: true } } });
  await openCenter(page); await page.locator('[data-pc-status]').selectOption('protected');
  await page.locator('[data-pc-id=qqbot]').click(); await detailDialog(page).getByText('保护正在使用的 QQ 渠道', { exact: true }).waitFor();
  await detailDialog(page).locator('[data-pc-tab=config]').click();
  assert.equal(await detailDialog(page).locator('[data-pc-preview]').count(), 0);
  assert.ok((await detailDialog(page).locator('[data-pc-field]').count()) > 0);
  assert.equal(await detailDialog(page).locator('[data-pc-field]:enabled').count(), 0);
  assert.equal(fixture.requests.some(item => item.method === 'POST'), false);
});

test('configuration validation runs before planning and a blocked plan can be downloaded without writing', async t => {
  const page = await pageFor(t); const fixture = await apiFixture(page);
  await openCenter(page); await editConfig(page);
  await configInput(page, '结果条数').fill('0'); await detailDialog(page).locator('[data-pc-preview]').click();
  await detailDialog(page).getByText('请输入 1 至 9 范围内的数值。', { exact: true }).waitFor();
  assert.equal(fixture.requests.some(item => item.path.endsWith('/plan')), false);
  await configInput(page, '结果条数').fill('4'); await detailDialog(page).locator('[data-pc-preview]').click();
  await planDialog(page).waitFor();
  assert.equal(await planDialog(page).locator('[data-pc-apply]').count(), 0);
  await planDialog(page).getByText('此改动需在维护时处理，本次不会应用。', { exact: true }).waitFor();
  const download = page.waitForEvent('download'); await planDialog(page).locator('[data-pc-download]').click();
  const artifact = await download; const exported = JSON.parse(fs.readFileSync(await artifact.path(), 'utf8'));
  assert.equal(exported.canApply, false); assert.deepEqual(exported.diff, [{ path: 'limit', before: 3, after: 4 }]);
  assert.equal(fixture.requests.some(item => item.path.endsWith('/apply')), false);
  await planDialog(page).locator('[data-pc-cancel]').click();
  assert.equal(await configInput(page, '结果条数').inputValue(), '4');
});

test('safe configuration applies only after confirmation and sends the changed fields with the viewed version', async t => {
  const page = await pageFor(t); const fixture = await apiFixture(page, { writable: true });
  await openCenter(page); await editConfig(page); await configInput(page, '城市').fill('杭州');
  await detailDialog(page).locator('[data-pc-preview]').click(); await planDialog(page).waitFor();
  assert.deepEqual(fixture.requests.filter(item => item.path.endsWith('/plan')).map(item => item.body), [{ action: 'config', id: 'weather', baseHash: 'version-1', config: { city: '杭州' } }]);
  assert.equal(fixture.requests.some(item => item.path.endsWith('/apply')), false);
  await planDialog(page).locator('[data-pc-apply]').click(); await planDialog(page).waitFor({ state: 'detached' });
  assert.deepEqual(fixture.requests.find(item => item.path.endsWith('/apply')).body, { planId: 'synthetic-plan', baseHash: 'version-1', confirm: true });
  await page.keyboard.press('Escape'); await detailDialog(page).waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('heading', { name: '还有改动没保存' }).count(), 0);
});

test('a failed configuration plan preserves the editable draft and can be retried unchanged', async t => {
  const page = await pageFor(t); let attempts = 0;
  const fixture = await apiFixture(page, { onPlan: route => { attempts++; return attempts === 1 ? route.fulfill({ status: 409, json: { code: 'baseHash_mismatch', error: 'Changed elsewhere' } }) : route.fulfill({ json: { planId: 'retry-plan', baseHash: 'version-1', diff: [], apply: 'reload', canApply: false } }); } });
  await openCenter(page); await editConfig(page); await configInput(page, '城市').fill('南京');
  await detailDialog(page).locator('[data-pc-preview]').click(); await detailDialog(page).locator('[data-pc-form-error]').filter({ hasText: '配置刚被别处改过' }).waitFor();
  assert.equal(await configInput(page, '城市').inputValue(), '南京');
  assert.equal(await detailDialog(page).locator('[data-pc-preview]').isEnabled(), true);
  await detailDialog(page).locator('[data-pc-preview]').click(); await planDialog(page).waitFor();
  assert.equal(fixture.requests.filter(item => item.path.endsWith('/plan')).length, 2);
});

test('secret fields show presence without an input, and defensive exports never contain returned secret values', async t => {
  const page = await pageFor(t); const submitted = 'synthetic-sensitive-plugin-value';
  await apiFixture(page, { onPlan: route => route.fulfill({ json: { planId: 'secret-plan', baseHash: 'version-1', secretChanged: true, diff: [{ path: 'apiKey', before: 'old-synthetic-value', after: submitted, secretChanged: true }], apply: 'reload', canApply: false, blockedReason: '请在密钥中心维护' } }) });
  await openCenter(page); await editConfig(page);
  assert.equal(await configInput(page, '服务密钥').count(), 0);
  await detailDialog(page).getByText('此字段请按插件的密钥接入方式维护。', { exact: true }).waitFor();
  await detailDialog(page).getByText('已设置 · 内容不回显', { exact: true }).waitFor();
  await configInput(page, '城市').fill('杭州'); await detailDialog(page).locator('[data-pc-preview]').click();
  await planDialog(page).waitFor();
  assert.equal((await page.locator('body').innerText()).includes(submitted), false);
  const download = page.waitForEvent('download'); await planDialog(page).locator('[data-pc-download]').click();
  const text = fs.readFileSync(await (await download).path(), 'utf8');
  assert.equal(text.includes(submitted), false); assert.equal(text.includes('old-synthetic-value'), false);
});

test('README and hostile schema metadata cannot inject markup or unsafe source links', async t => {
  const page = await pageFor(t);
  await apiFixture(page, { detail: {
    readme: '<script>window.pluginCenterInjected=true</script>\n[unsafe](javascript:alert(1))', readmeUrl: 'javascript:alert(1)',
    config: { values: initialValues, previewable: true, writable: false, secretFields: [], schema: { ...schema, properties: { ...schema.properties, city: { type: 'string', title: '城市', maxLength: '10"><span data-pc-schema-injected="yes">Injected</span><input value="' } } } },
  } });
  await openCenter(page); await editConfig(page);
  assert.equal(await page.locator('[data-pc-schema-injected]').count(), 0);
  await detailDialog(page).locator('[data-pc-tab=readme]').click();
  assert.equal(await detailDialog(page).locator('script,a[href^="javascript:"]').count(), 0);
  assert.equal(await page.evaluate(() => window.pluginCenterInjected), undefined);
});

test('native installation candidates produce an honest maintenance change sheet without installation', async t => {
  const page = await pageFor(t, 390); const fixture = await apiFixture(page, { installPreview: true });
  await openCenter(page); await page.locator('[data-pc-install-plan]').click();
  const install = page.locator('[data-pc-install]');
  await install.locator('[name=spec]').fill('@example/openclaw-weather@1.0.0');
  await install.getByRole('button', { name: '生成变更单', exact: true }).click(); await planDialog(page).waitFor();
  assert.deepEqual(fixture.requests.find(item => item.path.endsWith('/plan')).body, { action: 'install', source: 'npm', spec: '@example/openclaw-weather@1.0.0', baseHash: 'version-1' });
  assert.equal(await planDialog(page).locator('[data-pc-apply]').count(), 0);
  assert.equal(fixture.requests.some(item => item.path.endsWith('/apply')), false);
  await assertNoOverflow(page);
});

test('a delayed detail response cannot open a stale sheet after navigation', async t => {
  const page = await pageFor(t); let release, arrived;
  const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { arrived = resolve; });
  await apiFixture(page, { onDetail: async (route, detail) => { arrived(); await held; await route.fulfill({ json: detail }); } });
  try {
    await openCenter(page); await page.locator('[data-pc-id=weather]').click(); await requested;
    await page.evaluate(() => { location.hash = '#/overview'; }); await page.locator('.hero').waitFor();
    release(); await page.waitForTimeout(200);
    assert.equal(await detailDialog(page).count(), 0);
  } finally { release(); }
});

test('a newer detail request supersedes an older response', async t => {
  const page = await pageFor(t); let release, arrived;
  const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { arrived = resolve; });
  await apiFixture(page, { onDetail: async (route, detail) => { if (detail.plugin.id === 'weather') { arrived(); await held; } await route.fulfill({ json: detail }); } });
  try {
    await openCenter(page); await page.locator('[data-pc-id=weather]').click(); await requested;
    await page.locator('[data-pc-id=notes]').click(); await detailDialog(page).getByRole('heading', { name: '笔记助手' }).waitFor();
    release(); await page.waitForTimeout(200);
    assert.equal(await detailDialog(page).count(), 1);
    assert.equal(await detailDialog(page).getByRole('heading', { name: '天气助手' }).count(), 0);
  } finally { release(); }
});

test('pending previews do not submit twice and applying a snapshot preserves later edits', async t => {
  const page = await pageFor(t); let release, arrived;
  const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { arrived = resolve; });
  const fixture = await apiFixture(page, { writable: true, onPlan: async (route, body) => { arrived(); await held; await route.fulfill({ json: { planId: 'snapshot-plan', baseHash: 'version-1', diff: [{ path: 'city', before: '上海', after: body.config.city }], apply: 'immediate', canApply: true } }); } });
  try {
    await openCenter(page); await editConfig(page); await configInput(page, '城市').fill('杭州');
    await detailDialog(page).locator('[data-pc-preview]').click(); await requested;
    assert.equal(await detailDialog(page).locator('[data-pc-preview]').isDisabled(), true);
    await configInput(page, '城市').fill('南京');
    await detailDialog(page).locator('form').evaluate(form => form.requestSubmit());
    release(); await planDialog(page).waitFor();
    assert.equal(fixture.requests.filter(item => item.path.endsWith('/plan')).length, 1);
    assert.match(await planDialog(page).innerText(), /杭州/);
    assert.equal((await planDialog(page).innerText()).includes('南京'), false);
    await planDialog(page).locator('[data-pc-apply]').click(); await planDialog(page).waitFor({ state: 'detached' });
    assert.equal(await configInput(page, '城市').inputValue(), '南京');
    await page.keyboard.press('Escape'); await page.getByRole('heading', { name: '还有改动没保存', exact: true }).waitFor();
    await confirmation(page).locator('[data-no]').click();
    assert.equal(await configInput(page, '城市').inputValue(), '南京');
  } finally { release(); }
});

test('a rejected apply preserves the preview and draft without retrying a write automatically', async t => {
  const page = await pageFor(t);
  const fixture = await apiFixture(page, { writable: true, onApply: route => route.fulfill({ status: 423, json: { code: 'quiet_window', error: 'Quiet window' } }) });
  await openCenter(page); await editConfig(page); await configInput(page, '城市').fill('杭州');
  await detailDialog(page).locator('[data-pc-preview]').click(); await planDialog(page).locator('[data-pc-apply]').click();
  await planDialog(page).locator('[data-pc-plan-error]').filter({ hasText: '当前处于静默时段' }).waitFor();
  assert.equal(await planDialog(page).locator('[data-pc-apply]').isEnabled(), true);
  assert.equal(fixture.requests.filter(item => item.path.endsWith('/apply')).length, 1);
  await planDialog(page).locator('[data-pc-cancel]').click(); assert.equal(await configInput(page, '城市').inputValue(), '杭州');
});

test('a preview returned after its editor closes cannot reopen a stale sheet', async t => {
  const page = await pageFor(t); let release, arrived;
  const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { arrived = resolve; });
  await apiFixture(page, { onPlan: async route => { arrived(); await held; await route.fulfill({ json: { planId: 'late-plan', baseHash: 'version-1', diff: [], apply: 'reload', canApply: false } }); } });
  try {
    await openCenter(page); await editConfig(page); await configInput(page, '城市').fill('杭州');
    await detailDialog(page).locator('[data-pc-preview]').click(); await requested;
    await page.keyboard.press('Escape'); await confirmation(page).locator('[data-yes]').click();
    await detailDialog(page).waitFor({ state: 'detached' });
    await page.evaluate(() => { location.hash = '#/overview'; }); await page.locator('.hero').waitFor();
    release(); await page.waitForTimeout(200); assert.equal(await planDialog(page).count(), 0);
  } finally { release(); }
});
