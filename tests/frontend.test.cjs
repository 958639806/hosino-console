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
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  mock = spawn(process.execPath, ['mock.mjs'], {
    cwd: path.resolve(__dirname, '../mock'), env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  mock.stderr.on('data', data => { output += data; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (mock.exitCode !== null) throw new Error(`mock exited: ${output}`);
    try { const r = await fetch(base + '/api/me'); if (r.ok) { ready = true; break; } } catch {}
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

async function pageFor(t, intervals = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  t.after(() => context.close());
  await context.addInitScript(intervals => {
    const original = window.setInterval;
    window.setInterval = (fn, delay, ...args) => original(fn, intervals[delay] || delay, ...args);
  }, intervals);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}

test('late page responses neither replace the new route nor start stale polling', async t => {
  const page = await pageFor(t, { 10000: 100, 30000: 150 });
  let release, requested;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  let overviewRequests = 0;
  await page.route('**/api/overview', async route => {
    overviewRequests++;
    requested(); await held; await route.continue();
  });
  try {
    await page.goto(base + '/#/overview'); await started;
    await page.evaluate(() => { location.hash = '#/sessions'; });
    await page.locator('h1').filter({ hasText: '会话' }).waitFor();
    release();
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => location.hash), '#/sessions');
    assert.match(await page.locator('h1').innerText(), /会话/);
    assert.equal(overviewRequests, 1, 'detached overview must not install a new interval');
  } finally { release(); }
});

test('history polling refreshes earlier content and delivery without a new final message', async t => {
  const page = await pageFor(t, { 4000: 100 });
  let updated = false, requests = 0;
  await page.route('**/api/history?*', route => {
    requests++;
    return route.fulfill({ json: { hasMore: false, messages: [
      { id: 'earlier', role: 'assistant', content: updated ? 'updated answer' : 'initial answer',
        ts: 1720000000000, delivery: updated ? 'sent' : 'unknown', deliveryConfidence: 'high',
        deliveryReason: updated ? 'qq-send-ok' : 'no-send-ok-log' },
      { id: 'user', role: 'user', owner: true, content: 'a later question', ts: 1720000060000 },
      { id: 'final', role: 'assistant', content: 'unchanged last message', ts: 1720000120000 },
    ] } });
  });
  await page.goto(base + '/#/sessions/agent%3Amain%3Amain');
  await page.getByText('initial answer', { exact: true }).waitFor();
  updated = true;
  await page.getByText('updated answer', { exact: true }).waitFor();
  await page.locator('[data-k="dvearlier"] summary[title="已发到 QQ"]').waitFor();
  assert.equal(await page.getByText('initial answer', { exact: true }).count(), 0);
  assert.ok(requests > 1);
});

for (const action of ['Escape', 'close button', 'browser Back']) {
  test(`dirty file editor confirms ${action}, preserving the draft when cancelled`, async t => {
    const page = await pageFor(t);
    await page.goto(base + '/#/files/SOUL.md');
    const editor = page.locator('.sheet').filter({ has: page.locator('textarea') });
    await editor.locator('textarea').fill('unsaved draft');
    assert.equal(await editor.locator('[data-save]').isEnabled(), true);
    const trigger = async () => {
      if (action === 'Escape') await page.keyboard.press('Escape');
      else if (action === 'scrim') await editor.locator('..').locator('.scrim').click({ position: { x: 5, y: 5 } });
      else if (action === 'close button') await editor.locator('[data-close]').click();
      else await page.goBack();
    };
    await trigger();
    await page.getByRole('heading', { name: '还有改动没保存', exact: true }).waitFor();
    await page.locator('.sheet [data-no]').click();
    assert.equal(await editor.locator('textarea').inputValue(), 'unsaved draft');
    await trigger();
    await page.getByRole('heading', { name: '还有改动没保存', exact: true }).waitFor();
    await page.locator('.sheet [data-yes]').click();
    await editor.waitFor({ state: 'detached' });
  });
}

test('saving an edited file clears dirty state before the editor is closed', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/files/SOUL.md');
  const editor = page.locator('.sheet').filter({ has: page.locator('textarea') });
  await editor.locator('textarea').fill('saved draft');
  await editor.locator('[data-save]').click();
  await page.locator('.sheet [data-yes]').click();
  await page.waitForFunction(() => document.querySelector('.sheet [data-save]')?.disabled && document.querySelector('.sheet [data-save]')?.textContent === '保存' && /已保存/.test(document.querySelector('#toast')?.textContent));
  await page.keyboard.press('Escape');
  await editor.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('heading', { name: '还有改动没保存' }).count(), 0);
});

test('Escape dismisses a confirmation and resolves its pending action as cancelled', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/files/SOUL.md');
  const editor = page.locator('.sheet').filter({ has: page.locator('textarea') });
  await editor.locator('textarea').fill('unsaved draft');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await editor.locator('textarea').inputValue(), 'unsaved draft');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  await page.locator('.sheet [data-no]').click();
  assert.equal(await editor.locator('textarea').inputValue(), 'unsaved draft');
});

test('a route change cannot silently discard an open editor', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/files/SOUL.md');
  const editor = page.locator('.sheet').filter({ has: page.locator('textarea') });
  await editor.locator('textarea').fill('unsaved navigation draft');
  const original = await page.evaluate(() => location.hash);
  await page.evaluate(() => { location.hash = '#/sessions'; });
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  await page.locator('.sheet [data-no]').click();
  await page.waitForFunction(hash => location.hash === hash, original);
  assert.equal(await editor.locator('textarea').inputValue(), 'unsaved navigation draft');
});

test('voice add forms using a data-yes button still protect unsaved fields', async t => {
  const page = await pageFor(t);
  await page.route('**/api/fun/voices', route => route.fulfill({ json: { voices: [] } }));
  await page.goto(base + '/#/voice#voices');
  await page.locator('#vvurl').fill('1234567890abcdef1234567890abcdef');
  await page.locator('[data-vvurl]').click();
  await page.locator('#vva-al').fill('new_voice');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  await page.locator('.sheet [data-no]').last().click();
  assert.equal(await page.locator('#vva-al').inputValue(), 'new_voice');
});

test('cancelling a dirty memory sheet close does not start the delete flow', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/#/memory/s/person%3Aa1b2');
  await page.locator('[data-mem]').first().click();
  await page.locator('#fnote').fill('unsaved note');
  await page.locator('.sheet [data-x="del"]').click();
  await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '删除这条记忆？' }).count(), 0);
  await page.locator('.sheet [data-no]').last().click();
  assert.equal(await page.locator('#fnote').inputValue(), 'unsaved note');
});
