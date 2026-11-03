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
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}
const editor = page => page.locator('.sheet').filter({ has: page.locator('textarea.editor') });
const confirmYes = page => page.locator('[data-confirm="1"]').last().locator('[data-yes]');
const confirmNo = page => page.locator('[data-confirm="1"]').last().locator('[data-no]');
async function openEditor(page) {
  await page.goto(base + '/#/files/SOUL.md');
  await editor(page).locator('textarea').waitFor();
}
async function save(page, text) {
  await editor(page).locator('textarea').fill(text);
  await editor(page).locator('[data-save]').click();
  await confirmYes(page).click();
}

test('a successful file save keeps edits made in flight dirty, including an input and undo round trip', async t => {
  const page = await pageFor(t);
  let release, arrived;
  const hold = new Promise(resolve => { release = resolve; });
  const start = new Promise(resolve => { arrived = resolve; });
  const requests = [];
  await page.route('**/api/agent-files/set', async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) { arrived(); await hold; }
    await route.fulfill({ json: { ok: true, backup: 'round2.md' } });
  });
  try {
    await openEditor(page); await save(page, 'submitted snapshot'); await start;
    const textarea = editor(page).locator('textarea');
    assert.equal(await textarea.isEnabled(), true, 'the editor stays editable while saving');
    await textarea.fill('later unsaved edit');
    assert.equal(await editor(page).locator('[data-save]').isDisabled(), true, 'do not submit a second request while one is pending');
    release();
    await page.getByText('已保存提交内容，后续修改还没保存', { exact: true }).waitFor();
    await textarea.press('End'); await textarea.press('x'); await textarea.press('Backspace');
    assert.equal(await textarea.inputValue(), 'later unsaved edit');
    assert.equal(await editor(page).locator('[data-save]').isEnabled(), true);
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '还有改动没保存' }).waitFor();
    await confirmNo(page).click();
    assert.equal(await textarea.inputValue(), 'later unsaved edit');
    await editor(page).locator('[data-save]').click(); await confirmYes(page).click();
    await editor(page).getByText('备份：round2.md', { exact: true }).waitFor();
    assert.deepEqual(requests.map(request => request.content), ['submitted snapshot', 'later unsaved edit']);
    assert.equal(await editor(page).locator('[data-save]').isDisabled(), true);
    await page.keyboard.press('Escape'); await editor(page).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('heading', { name: '还有改动没保存' }).count(), 0);
  } finally { release(); }
});

test('undoing later edits back to the committed snapshot does not leave a false dirty prompt', async t => {
  const page = await pageFor(t);
  let release, arrived;
  const hold = new Promise(resolve => { release = resolve; });
  const start = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/agent-files/set', async route => {
    arrived(); await hold; await route.fulfill({ json: { ok: true } });
  });
  try {
    await openEditor(page); await save(page, 'committed snapshot'); await start;
    await editor(page).locator('textarea').fill('later edit'); release();
    await page.getByText('已保存提交内容，后续修改还没保存', { exact: true }).waitFor();
    await editor(page).locator('textarea').fill('committed snapshot');
    assert.equal(await editor(page).locator('[data-save]').isDisabled(), true);
    await page.keyboard.press('Escape'); await editor(page).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('heading', { name: '还有改动没保存' }).count(), 0);
  } finally { release(); }
});

for (const status of [400, 409, 500]) {
  test(`file save ${status} preserves the draft and permits an unchanged retry`, async t => {
    const page = await pageFor(t), submitted = [];
    await page.route('**/api/agent-files/set', route => {
      submitted.push(route.request().postDataJSON().content);
      return route.fulfill(submitted.length === 1 ? { status, json: { error: `injected ${status}` } } : { json: { ok: true, backup: 'retried.md' } });
    });
    await openEditor(page); await save(page, `retry draft ${status}`);
    if (status === 409) {
      await page.getByRole('heading', { name: '文件刚被别处改过了' }).waitFor();
      await confirmNo(page).click();
    } else await page.locator('#toast').filter({ hasText: `injected ${status}` }).waitFor();
    assert.equal(await editor(page).locator('textarea').inputValue(), `retry draft ${status}`);
    await page.waitForFunction(() => !document.querySelector('.sheet [data-save]')?.disabled);
    await editor(page).locator('[data-save]').click(); await confirmYes(page).click();
    await editor(page).getByText('备份：retried.md', { exact: true }).waitFor();
    assert.deepEqual(submitted, [`retry draft ${status}`, `retry draft ${status}`]);
    assert.equal(await editor(page).locator('[data-save]').isDisabled(), true);
  });
}

async function checkActionLayout(page, button, width, screenshot) {
  assert.equal(await button.locator('..').evaluate(header => header.classList.contains('top')), false);
  assert.equal(await button.locator('..').locator('h1').count(), 0, 'the topic title remains the only title');
  const bounds = await button.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'original action remains within the viewport');
  if (process.env.ROUND2_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.ROUND2_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.ROUND2_SCREENSHOT_DIR, screenshot), fullPage: true });
  }
}

for (const width of [390, 1440]) {
  test(`the original new-task action still opens and submits its form at ${width}px`, async t => {
    const page = await pageFor(t, width);
    let submitted;
    await page.route('**/api/cron/add', route => { submitted = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }); });
    await page.goto(base + '/#/cron');
    const button = page.getByRole('button', { name: '新建任务', exact: true });
    await button.waitFor(); await checkActionLayout(page, button, width, `cron-${width}.png`); await button.click();
    await page.getByRole('heading', { name: '新建定时任务' }).waitFor();
    await page.locator('#ce input[name="name"]').fill('round2 task');
    await page.locator('#ce textarea[name="msg"]').fill('round2 message');
    await page.locator('#ce button.primary').click();
    await page.getByText('任务已创建 ⏰', { exact: true }).waitFor();
    assert.equal(submitted.name, 'round2 task'); assert.equal(submitted.payload.message, 'round2 message');
    assert.equal(submitted.schedule.kind, 'cron');
    assert.equal(await page.locator('#ce').count(), 0);
  });

  test(`the original import-sticker action still opens and imports a file at ${width}px`, async t => {
    const page = await pageFor(t, width);
    let submitted;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/stickers/import') submitted = { url: new URL(request.url()), method: request.method() }; });
    await page.goto(base + '/#/stickers');
    const button = page.getByRole('button', { name: '导入表情', exact: true });
    await button.waitFor(); await checkActionLayout(page, button, width, `stickers-${width}.png`); await button.click();
    await page.getByRole('heading', { name: '导入表情', exact: true }).waitFor();
    await page.evaluate(() => {
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (body) {
        this.addEventListener('load', () => {
          if (new URL(this.responseURL).pathname === '/api/stickers/import') window.round2Import = { status: this.status, data: JSON.parse(this.responseText), bytes: body.size };
        }, { once: true });
        return send.call(this, body);
      };
    });
    const image = path.join(__dirname, width === 390 ? '../public/icon-192.png' : '../public/icon-512.png');
    await page.locator('#impf').setInputFiles(image);
    await page.locator('#impgo').click();
    await page.waitForFunction(() => window.round2Import);
    const uploaded = await page.evaluate(() => window.round2Import), result = uploaded.data;
    assert.equal(uploaded.status, 200); assert.equal(result.size, fs.statSync(image).size); assert.equal(uploaded.bytes, fs.statSync(image).size);
    await page.locator('#toast').filter({ hasText: '导入了 1 张' }).waitFor();
    assert.equal(submitted.method, 'POST'); assert.equal(submitted.url.searchParams.get('confirm'), '1');
    assert.ok(submitted.url.searchParams.get('category')); assert.equal(result.format, 'png');
    await page.locator('.sheet [data-close]').click();
    await page.getByRole('heading', { name: '导入表情', exact: true }).waitFor({ state: 'detached' });
  });
}
