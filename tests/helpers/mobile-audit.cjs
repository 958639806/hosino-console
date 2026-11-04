// usage: node audit.cjs <base> <tag(before|after)> [shots]
const { chromium } = require('playwright');
const fs = require('fs');
const [base, tag, shots] = process.argv.slice(2);
const LONGM = 'provider/very-long-model-name-2026-preview-with-extra-context-suffix';
const KEY = 'agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5';
async function longify(page) {
  await page.route('**/api/models/manage', async r => { if (r.request().method() !== 'GET') return r.continue(); const res = await r.fetch(); const j = await res.json();
    j.fallbacks = ['xai/grok-4-fast', 'provider-with-a-long-name/very-long-model-name-2026-preview'];
    const pv = j.providers?.[0]; if (pv) pv.models.push({ ref: 'provider-with-a-long-name/very-long-model-name-2026-preview', id: 'very-long-model-name-2026-preview', name: '超长名字的预览版模型（实验通道·高思考）', inProvider: true, inAllowlist: true, inGateway: false, isPrimary: false, fallbackIndex: 1 });
    r.fulfill({ json: j }); });
  await page.route('**/api/models', async r => { const res = await r.fetch(); const j = await res.json();
    j.models.push({ id: 'very-long-model-name-2026-preview-with-extra-context-suffix', name: '超长名字的预览版模型（实验通道·高思考·长上下文）', provider: 'provider-with-a-long-name', contextWindow: 1048576, reasoning: true, available: true, runtime: 'openclaw' },
      { id: 'qwen3-embedding-8b-instruct-long-name', name: 'qwen3-embedding-8b-instruct-long-name', provider: 'siliconflow-cn-mainland', contextWindow: 32768, available: false });
    r.fulfill({ json: j }); });
  await page.route('**/api/sessions', async r => { const res = await r.fetch(); const j = await res.json();
    if (j.sessions?.[0]) { j.sessions[0].model = 'very-long-model-name-2026-preview-with-extra-context-suffix'; j.sessions[0].modelProvider = 'provider-with-a-long-name'; j.sessions[0].alias = '春日部超长群名字·星野のねこ粉丝后援会（二群）'; }
    r.fulfill({ json: j }); });
  await page.route('**/api/history*', async r => { const res = await r.fetch(); const j = await res.json();
    if (j.messages?.length) { const n = j.messages.length;
      j.messages[n-1].content = '这里是一条很长很长的回复，包含一个长链接 https://hosino.ume.wiki/some/really/long/path/that/never/breaks/naturally?query=abcdefghijklmnopqrstuvwxyz0123456789 以及代码：\n```js\nconst someVeryLongVariableName = await fetchSomethingFromTheServer({ credentials: "include", headers: { "X-HS": "1" } });\n```\n还有超长英文单词 Supercalifragilisticexpialidocious_and_more_more_more_more。';
      j.messages[n-2].content = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA 连续字符测试 ' + LONGM;
      if (j.messages[n-2].sender) j.messages[n-2].sender.name = '名字超级超级超级超级长的群友·夜猫子';
    }
    r.fulfill({ json: j }); });
}
const AUDIT = () => {
  const out = []; const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push({ k: 'page-hscroll', w: document.documentElement.scrollWidth });
  const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')).slice(0, 80);
  for (const el of document.querySelectorAll('.view *, .topbar *, header *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest('pre, code, .sheet, [hidden], textarea')) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (r.right > vw + 1 && !el.closest('[style*="overflow"], .hscroll')) { let p = el.parentElement, clipped = false; while (p) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push({ k: 'offscreen', el: desc(el), right: Math.round(r.right) }); }
    if (txt) {
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      if ((cs.overflow.includes('hidden') || cs.overflowY === 'hidden') && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none') out.push({ k: 'clipped-v', el: desc(el), t: txt.slice(0, 30) });
      if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.push({ k: 'nowrap-no-ellipsis', el: desc(el), t: txt.slice(0, 30) });
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !el.title && !el.closest('[title]')) out.push({ k: 'ellipsis-no-title', el: desc(el), t: txt.slice(0, 30) });
      // char-by-char wrap: short text (<=12 chars) taking >2 lines in narrow box
      const lines = Math.round(r.height / lh);
      if (txt.length <= 14 && lines >= 3 && r.width < parseFloat(cs.fontSize) * 4) out.push({ k: 'char-wrap', el: desc(el), t: txt, w: Math.round(r.width), lines });
    }
    if (el.matches('button, a[href], [role=button], select, input:not([type=hidden]), summary') && !el.closest('.msg-body, .md, p')) {
      if (r.height < 43.5 || r.width < 43.5) out.push({ k: 'touch<44', el: desc(el), t: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) });
    }
    if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') && parseFloat(cs.fontSize) < 16) out.push({ k: 'input<16', el: desc(el), fs: cs.fontSize });
  }
  return out;
};
module.exports = { AUDIT, longify };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, args: ['--no-sandbox'] });
  const report = {};
  for (const w of [390, 375, 360, 320]) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await longify(page);
    for (const [pg, hash] of [['chat', '#/sessions/' + encodeURIComponent(KEY)], ['models', '#/models']]) {
      await page.goto(base + '/' + hash); await page.waitForTimeout(1500);
      const res = await page.evaluate(AUDIT);
      report[`${pg}@${w}-${scheme}`] = { errs, issues: res };
      if (shots && (w === 390 || w === 320)) {
        await page.screenshot({ path: `${process.env.MF_OUT || '/tmp/'}shots/${tag}-${pg}-${w}-${scheme}.png` });
        await page.screenshot({ path: `${process.env.MF_OUT || '/tmp/'}shots/${tag}-${pg}-${w}-${scheme}-full.png`, fullPage: true });
      }
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${process.env.MF_OUT || '/tmp/'}audit-${tag}.json`, JSON.stringify(report, null, 1));
  const sum = {}; for (const [k, v] of Object.entries(report)) for (const i of v.issues) { const key = k.split('@')[0] + ' ' + i.k + ' ' + (i.el || ''); sum[key] = (sum[key] || 0) + 1; }
  console.log(JSON.stringify(sum, null, 1));
})();
