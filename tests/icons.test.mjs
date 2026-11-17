// 图标模块与前端挂接的静态检查。通过不等于浏览器视觉 QA。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const pub = join(root, 'public');
const read = name => readFileSync(join(pub, name), 'utf8');
const sha = name => createHash('sha256').update(readFileSync(join(pub, name))).digest('hex');

const BRAND_SHA = '2ec10414e376237e8243ae632c4ef5e17e35799b26ee9e80c00b081c6ecc3481';
const UNSAFE = /<script|on\w+\s*=|javascript:|xlink:href\s*=\s*["'](?!#)|href\s*=\s*["']https?:|@import|foreignObject/i;

test('icons.js exists and exports a 24x24 currentColor helper', async () => {
  assert.ok(existsSync(join(pub, 'icons.js')), 'public/icons.js missing');
  const mod = await import(pathToFileURL(join(pub, 'icons.js')).href);
  assert.equal(mod.ICON_VIEWBOX, '0 0 24 24');
  assert.ok(mod.ICON_STROKE >= 1.75 && mod.ICON_STROKE <= 2);
  const svg = mod.ic('search');
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(svg, /stroke="currentColor"/);
  assert.match(svg, /stroke-width="1.8"/);
  assert.match(svg, /aria-hidden="true"/);
  const labeled = mod.ic('search', { label: '全局搜索' });
  assert.match(labeled, /aria-label="全局搜索"/);
  assert.match(labeled, /role="img"/);
});

test('legacy icon keys remain unique and mapped', async () => {
  const { ICONS, LEGACY_KEYS, ICON_META, ALIASES, resolveName } = await import(pathToFileURL(join(pub, 'icons.js')).href);
  const keys = Object.keys(ICONS);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  for (const k of LEGACY_KEYS) assert.ok(k in ICONS, `missing legacy key ${k}`);
  for (const k of keys) {
    assert.ok(ICON_META[k], `missing meta for ${k}`);
    assert.ok(ICON_META[k].label);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    assert.equal(resolveName(alias), target);
    assert.ok(target in ICONS);
    assert.ok(!(alias in ICONS));
  }
});

test('icon SVG markup has no script, events or external links', async () => {
  const { ICONS, ic, fileIcon } = await import(pathToFileURL(join(pub, 'icons.js')).href);
  for (const [k, body] of Object.entries(ICONS)) {
    assert.ok(!UNSAFE.test(body), `unsafe markup in ${k}`);
  }
  const sample = ic('home') + ic('warn') + fileIcon('application/pdf', 'a.pdf');
  assert.ok(!UNSAFE.test(sample));
  assert.ok(!/cdn\.|unpkg|jsdelivr|googleapis/i.test(read('icons.js')));
});

test('fileIcon covers known types and does not fake a priced zero', async () => {
  const { fileIcon } = await import(pathToFileURL(join(pub, 'icons.js')).href);
  const cases = [
    ['application/pdf', 'x.pdf', 'filePdf'],
    ['application/zip', 'a.zip', 'fileZip'],
    ['audio/mpeg', 'a.mp3', 'fileAudio'],
    ['video/mp4', 'a.mp4', 'fileVideo'],
    ['application/msword', 'a.doc', 'fileDoc'],
    ['application/vnd.ms-excel', 'a.xlsx', 'fileSheet'],
    ['image/png', 'a.png', 'fileImage'],
    ['text/plain', 'a.txt', 'fileText'],
    ['application/octet-stream', 'a.bin', 'clip']
  ];
  for (const [mime, name, key] of cases) {
    assert.match(fileIcon(mime, name), new RegExp(`data-icon="${key}"`), `${name} -> ${key}`);
  }
});

test('app.js and usage-detail.js hook the shared helper, not an inline I table', () => {
  const app = read('app.js');
  const detail = read('usage-detail.js');
  const html = read('index.html');
  assert.match(app, /import\s*\{\s*ic\s*,\s*fileIcon\s*\}\s*from\s*["']\.\/icons\.js/);
  assert.doesNotMatch(app, /const I = \{/);
  assert.doesNotMatch(app, /const ic = n =>/);
  assert.doesNotMatch(app, /const fileIcon = /);
  assert.match(detail, /import\s*\{\s*ic\s*\}\s*from\s*["']\.\/icons\.js/);
  assert.match(detail, /aria-label="返回模型与用量">\$\{ic\("back"\)\}<\/a>/);
  assert.match(html, /icons\.css/);
  assert.match(html, /app\.js\?v=2026\.11\.17\.1-icons/);
  assert.doesNotMatch(app + detail + html, /cdn\.|unpkg|jsdelivr|googleapis/i);
});

test('chrome emoji in navigation chrome is replaced, user session emoji is left alone', () => {
  const app = read('app.js');
  assert.match(app, /\$\{ic\("more"\)\}/);
  assert.match(app, /\$\{ic\("pencil"\)\}/);
  assert.match(app, /ic\("pin"\)/);
  assert.match(app, /\["voice", "语音", "voice"/);
  assert.match(app, /\["groups", "群", "group"/);
  assert.doesNotMatch(app, /<div class="avatar">🛡️<\/div>/);
  assert.doesNotMatch(app, /title="图片">🖼️<\/button>/);
  assert.doesNotMatch(app, /aria-label="下载">⤓<\/a>/);
  // 会话名里用户自己的 emoji 必须保留
  assert.match(app, /x\.emoji \? esc\(x\.emoji\)/);
});

test('brand mark is unchanged and icons.css keeps 44px targets and 16px inputs', () => {
  assert.equal(sha('icon.svg'), BRAND_SHA);
  const css = read('icons.css') + read('app.css');
  assert.match(css, /min-width:44px|min-height:44px|width:44px/);
  const index = read('index.html');
  assert.match(read('app.css'), /button,input,select,textarea\{font:inherit;color:inherit\}/);
  assert.doesNotMatch(index, /https:\/\//);
});
