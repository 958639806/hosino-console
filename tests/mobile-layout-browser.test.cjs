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

const { AUDIT, longify } = require('./helpers/mobile-audit.cjs');
const KEY = 'agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5';
for (const width of [390, 375, 360, 320]) for (const colorScheme of ['light', 'dark']) {
  test(`chat and model pages fit ${width}px ${colorScheme} without clipping`, async t => {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 844 }, isMobile: true, hasTouch: true, colorScheme });
    t.after(() => context.close());
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await longify(page);
    await page.goto(base + '/#/sessions/' + encodeURIComponent(KEY)); await page.locator('.composer textarea').waitFor(); await page.waitForTimeout(600);
    assert.deepEqual(await page.evaluate(AUDIT), [], 'chat layout issues');
    const ta = await page.locator('.composer textarea').boundingBox(), send = await page.locator('.composer .cx-send').boundingBox();
    assert.ok(Math.abs(ta.y + ta.height - (send.y + send.height)) < 4, 'abort/send stay on the textarea row');
    assert.ok(ta.width >= 100, 'textarea keeps usable width');
    const dvd = page.locator('.dvd>summary').last(); await dvd.click();
    const note = await page.locator('.dvd[open] .dvn').boundingBox(); assert.ok(note.width >= 150, 'delivery note is not squeezed into a column');
    await page.goto(base + '/#/models'); await page.locator('.cx-fbi').first().waitFor(); await page.waitForTimeout(600);
    assert.deepEqual(await page.evaluate(AUDIT), [], 'model layout issues');
    assert.deepEqual(errors, []);
  });
}
