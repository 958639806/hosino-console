import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sgtToday,
  formatTokenCount,
  formatMoney,
  formatCostRange,
  formatReport,
  fetchUsdCnyRate,
  FX_SOURCES,
  buildTodayUsageText,
} from '../scripts/today_usage.mjs';

test('sgtToday uses Singapore calendar date', () => {
  // 2026-11-26 16:00 UTC = 2026-11-27 00:00 SGT
  assert.equal(sgtToday(Date.parse('2026-11-26T16:00:00Z')), '2026-11-27');
  assert.equal(sgtToday(Date.parse('2026-11-26T15:59:59Z')), '2026-11-26');
});

test('formatTokenCount uses 万/亿 and separators', () => {
  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(39), '39');
  assert.equal(formatTokenCount(2497), '2,497');
  assert.equal(formatTokenCount(2640000), '264 万');
  assert.equal(formatTokenCount(196000000), '1.96 亿');
});

test('formatMoney and cost range', () => {
  assert.equal(formatMoney(12.345, 'CNY'), '¥12.35');
  assert.equal(formatMoney(0.0028, 'USD'), '$0.0028');
  assert.equal(formatCostRange(9, 18, 'CNY'), '¥9.00～¥18.00');
  assert.equal(formatCostRange(1.5, 1.5, 'USD'), '$1.50');
});

function sampleEstimate({ tokens = {}, cost = {}, flags = {}, sources = [] } = {}) {
  return {
    billingMode: 'api-equivalent',
    currency: 'USD',
    totals: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      totalCost: 0, totalCostUpper: 0, pricedEntries: 0,
      missingCostEntries: 0, missingUsageEntries: 0, invalidUsageEntries: 0,
      ...tokens, ...cost, ...flags,
    },
    sources,
  };
}

test('formatReport prefers CNY and cites FX source and date', () => {
  const text = formatReport({
    today: '2026-11-27',
    estimate: sampleEstimate({
      tokens: { input: 2640000, output: 670000, cacheRead: 196000000, totalTokens: 199310000 },
      cost: { totalCost: 1.35, totalCostUpper: 2.7 },
      flags: { pricedEntries: 4 },
      sources: [{ source: 'memory-extract', totalTokens: 5743, pricedEntries: 4 }],
    }),
    fx: { ok: true, rate: 6.6602, date: '2026-11-26', source: '欧洲央行参照汇率（Frankfurter）' },
  });
  assert.match(text, /今天（2026-11-27，新加坡时间）实例合计：/);
  assert.match(text, /输入 264 万、输出 67 万、缓存读取 1\.96 亿，共 1\.99 亿 token。/);
  assert.match(text, /记忆抽取：今天已计入采集上线后有记录的部分；上线前没记下 token 的无法补计。/);
  assert.match(text, /估价约 ¥8\.99～¥17\.98（约 \$1\.35～\$2\.70）/);
  assert.match(text, /按预估汇率 1 美元 ≈ 6\.6602 人民币（来源：欧洲央行参照汇率（Frankfurter），汇率日期 2026-11-26）/);
  assert.match(text, /这是 API 等价估价，不是真实账单，不含订阅月费。/);
  assert.doesNotMatch(text, /\/home\/|openclaw|session_status|hs_sid|密码|\/status/);
});

test('formatReport falls back to USD when FX is unavailable', () => {
  const text = formatReport({
    today: '2026-11-27',
    estimate: sampleEstimate({
      tokens: { input: 100, output: 20, cacheRead: 0, totalTokens: 120 },
      cost: { totalCost: 0.01, totalCostUpper: 0.02 },
      flags: { pricedEntries: 1 },
    }),
    fx: { ok: false },
  });
  assert.match(text, /估价约 \$0\.01～\$0\.02（美元）。刚才没拿到公开汇率，换不了人民币。/);
  assert.match(text, /不是真实账单/);
  assert.doesNotMatch(text, /¥/);
});

test('formatReport does not invent a zero cost when unpriced', () => {
  const text = formatReport({
    today: '2026-11-27',
    estimate: sampleEstimate({
      tokens: { input: 100, output: 0, cacheRead: 0, totalTokens: 100 },
      flags: { pricedEntries: 0, missingCostEntries: 2 },
    }),
    fx: { ok: true, rate: 6.66, date: '2026-11-26', source: 'x' },
  });
  assert.match(text, /费用暂时估不出/);
  assert.doesNotMatch(text, /¥0|估价约/);
});

test('formatReport mentions missing records without treating them as zero', () => {
  const text = formatReport({
    today: '2026-11-27',
    estimate: sampleEstimate({
      tokens: { input: 10, output: 2, cacheRead: 0, totalTokens: 12 },
      cost: { totalCost: 0.1, totalCostUpper: 0.1 },
      flags: { pricedEntries: 1, missingCostEntries: 3 },
    }),
    fx: { ok: true, rate: 7, date: '2026-11-26', source: '测试来源' },
  });
  assert.match(text, /另有部分记录缺价或缺 token，没有算进金额，也没有当成 0。/);
});

test('fetchUsdCnyRate uses the first valid public source', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-11-26', rates: { CNY: 6.6602 } }),
    };
  };
  const fx = await fetchUsdCnyRate({ fetchImpl, now: 1 });
  assert.equal(fx.ok, true);
  assert.equal(fx.rate, 6.6602);
  assert.equal(fx.date, '2026-11-26');
  assert.equal(fx.source, '欧洲央行参照汇率（Frankfurter）');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], FX_SOURCES[0].url);
});

test('fetchUsdCnyRate falls back to the second public source', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('frankfurter')) throw new Error('network down');
    return {
      ok: true,
      json: async () => ({
        result: 'success',
        rates: { CNY: 6.674963 },
        time_last_update_unix: 1795737751,
      }),
    };
  };
  const fx = await fetchUsdCnyRate({ fetchImpl });
  assert.equal(fx.ok, true);
  assert.equal(fx.rate, 6.674963);
  assert.equal(fx.source, 'ExchangeRate-API 公开接口');
  assert.equal(fx.date, '2026-11-27');
});

test('fetchUsdCnyRate reports failure when every source fails', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const fx = await fetchUsdCnyRate({ fetchImpl });
  assert.equal(fx.ok, false);
  assert.ok(Array.isArray(fx.errors) && fx.errors.length >= 2);
});

test('buildTodayUsageText composes load + fx', async () => {
  const load = async (p) => {
    assert.equal(p.startDate, '2026-11-27');
    assert.equal(p.endDate, '2026-11-27');
    return sampleEstimate({
      tokens: { input: 10, output: 5, cacheRead: 0, totalTokens: 15 },
      cost: { totalCost: 1, totalCostUpper: 1 },
      flags: { pricedEntries: 1 },
    });
  };
  const text = await buildTodayUsageText({
    now: Date.parse('2026-11-26T16:30:00Z'),
    load,
    fx: { ok: true, rate: 6.66, date: '2026-11-26', source: '测试来源' },
  });
  assert.match(text, /今天（2026-11-27，新加坡时间）/);
  assert.match(text, /¥6\.66/);
});
