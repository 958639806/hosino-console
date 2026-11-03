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

async function pageFor(t, fastPolling = false) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  t.after(() => context.close());
  if (fastPolling) await context.addInitScript(() => {
    const original = window.setInterval;
    window.setInterval = (fn, ms, ...args) => original(fn, ms === 10000 ? 150 : ms, ...args);
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}
async function expire(page) {
  await page.route('**/api/config', route => route.fulfill({ status: 401, json: { error: '请先登录' } }));
  await page.evaluate(async () => {
    const moduleUrl = new URL(document.querySelector('script[type="module"]').src);
    const { api } = await import(new URL('./api.js' + moduleUrl.search, moduleUrl));
    try { await api.config(); } catch {}
  });
  await page.getByRole('heading', { name: '欢迎回来，凛' }).waitFor();
}
async function login(page) {
  await page.locator('.login input[name=password]').fill('local mock password');
  await page.locator('.login button[type=submit]').click();
  await page.locator('.login').waitFor({ state: 'detached' });
}

for (const failure of ['network', 'HTTP']) {
  test(`a ${failure} logout failure keeps the authenticated screen and draft`, async t => {
    const page = await pageFor(t);
    await page.goto(base + '/#/files/SOUL.md');
    await page.locator('.sheet textarea').fill('keep this logout draft');
    await page.route('**/api/logout', route => failure === 'network'
      ? route.abort('internetdisconnected') : route.fulfill({ status: 500, json: { error: 'logout unavailable' } }));
    await page.evaluate(() => document.querySelector('[data-act=logout]').click());
    await page.locator('#toast.show').waitFor();
    assert.equal(await page.locator('.login').count(), 0);
    assert.equal(await page.locator('.shell').count(), 1);
    assert.equal(await page.locator('.sheet textarea').inputValue(), 'keep this logout draft');
  });
}

test('401 hides old overlays and restores the identical editor DOM after authentication', async t => {
  const page = await pageFor(t);
  let fileReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/agent-files/get') fileReads++; });
  await page.goto(base + '/#/files/SOUL.md');
  await page.locator('.sheet textarea').fill('private unsaved draft');
  await page.evaluate(() => { window.testEditorNode = document.querySelector('.sheet textarea'); });
  const readsBefore = fileReads;
  await expire(page);
  assert.equal(await page.locator('.sheet').count(), 0, 'expired modal cannot cover login');
  assert.equal(await page.locator('.shell').count(), 0, 'old screen is detached');
  assert.equal(await page.locator('#app').evaluate(app => app.inert), false);
  assert.equal(await page.locator('body').innerText().then(text => text.includes('private unsaved draft')), false);
  await page.locator('.login input').fill('mistyped password');
  await page.route('**/api/login', route => route.fulfill({ status: 401, json: { error: '密码不对' } }));
  await page.locator('.login button').click();
  await page.locator('.login .err').filter({ hasText: '密码不对' }).waitFor();
  assert.equal(await page.locator('.sheet').count(), 0);
  await page.unroute('**/api/login');
  await login(page);
  assert.equal(await page.locator('.sheet textarea').inputValue(), 'private unsaved draft');
  assert.equal(await page.evaluate(() => document.querySelector('.sheet textarea') === window.testEditorNode), true);
  assert.equal(fileReads, readsBefore, 'restoration must not reload the editor');
  assert.equal(await page.locator('#app').evaluate(app => app.inert), true);
});

test('authentication loss preserves an inline chat composer as well as modal editors', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/sessions/agent%3Amain%3Amain');
  await page.locator('#comp textarea').fill('private composer draft');
  await page.evaluate(() => { window.testComposerNode = document.querySelector('#comp textarea'); });
  await expire(page); await login(page);
  assert.equal(await page.locator('#comp textarea').inputValue(), 'private composer draft');
  assert.equal(await page.evaluate(() => document.querySelector('#comp textarea') === window.testComposerNode), true);
});

test('successful logout removes overlays and does not restore discarded drafts at the next login', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/files/SOUL.md');
  await page.locator('.sheet textarea').fill('discard this logged out draft');
  await page.evaluate(() => document.querySelector('[data-act=logout]').click());
  await page.getByRole('heading', { name: '欢迎回来，凛' }).waitFor();
  assert.equal(await page.locator('[data-v3sheet],.lightbox').count(), 0);
  assert.equal(await page.locator('#app').evaluate(app => app.inert), false);
  await login(page);
  assert.equal(await page.locator('.sheet textarea').count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('discard this logged out draft'), false);
});

test('Tab and Shift+Tab stay in the top nested sheet and restore background focus/inert state', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/persona#files');
  const opener = page.locator('a[href="#/files/SOUL.md"]');
  await opener.waitFor();
  await page.evaluate(() => {
    const preserved = document.createElement('div'); preserved.id = 'already-inert'; preserved.inert = true; document.body.append(preserved);
    window.testOpenerNode = document.querySelector('a[href="#/files/SOUL.md"]');
  });
  await opener.click();
  await page.locator('.sheet textarea').fill('nested focus draft');
  async function tabStaysInside() {
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-v3sheet]')].at(-1).contains(document.activeElement)), true);
    }
  }
  await tabStaysInside();
  assert.equal(await page.locator('#app').evaluate(app => app.inert), true);
  await page.locator('.sheet textarea').focus(); await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  assert.deepEqual(await page.locator('[data-v3sheet]').evaluateAll(nodes => nodes.map(node => node.inert)), [true, false]);
  await tabStaysInside();
  await page.locator('[data-confirm] [data-no]').click();
  assert.equal(await page.locator('.sheet textarea').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape'); await page.locator('[data-confirm] [data-yes]').click();
  await page.locator('.sheet').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#app').evaluate(app => app.inert), false);
  assert.equal(await page.locator('#already-inert').evaluate(node => node.inert), true);
  assert.equal(await page.evaluate(() => document.activeElement === window.testOpenerNode), true);
});

test('page polling pauses during login and resumes without replacing retained DOM', async t => {
  const page = await pageFor(t, true);
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/overview') requests++; });
  await page.goto(base + '/#/overview');
  await page.locator('.hero').waitFor();
  await expire(page);
  const paused = requests; await page.waitForTimeout(450);
  assert.equal(requests, paused);
  await login(page);
  await page.waitForTimeout(400);
  assert.ok(requests > paused, 'existing view polling resumes after login');
});

test('a delayed 401 from the previous login cannot hide a newly authenticated UI', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/overview'); await page.locator('.hero').waitFor();
  let release, requested;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  await page.route('**/api/usage', async route => { requested(); await held; await route.fulfill({ status: 401, json: { error: 'old session expired' } }); });
  try {
    await page.evaluate(async () => {
      const moduleUrl = new URL(document.querySelector('script[type="module"]').src);
      const { api } = await import(new URL('./api.js' + moduleUrl.search, moduleUrl));
      window.testOldRequest = api.usage().catch(() => {});
    });
    await started; await expire(page); await login(page);
    release(); await page.evaluate(() => window.testOldRequest);
    assert.equal(await page.locator('.login').count(), 0);
    assert.equal(await page.locator('.shell').count(), 1);
  } finally { release(); }
});
