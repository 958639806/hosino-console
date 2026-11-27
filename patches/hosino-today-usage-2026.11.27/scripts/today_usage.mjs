#!/usr/bin/env node
// HOSINO-TODAY-USAGE v1 (2026-11-27)
// 只读查询当天（Asia/Singapore）实例 token / API 等价估价。不是真实账单。
// 复用生产控制台 loadUsageEstimate（同一套 transcript + 记忆抽取账本）。
import { pathToFileURL } from 'node:url';

export const DEFAULT_CONSOLE_DIR = '/opt/hosino-console-v2026.11.4';
export const DEFAULT_STATE_DIR = '/home/ubuntu/.openclaw';
export const DEFAULT_LEDGER_DIR = '/var/lib/hosino-usage';
export const TIMEZONE = 'Asia/Singapore';
const SGT_OFFSET_MS = 8 * 3600e3;
const FX_TIMEOUT_MS = 8000;

export const FX_SOURCES = [
  {
    id: 'frankfurter-ecb',
    name: '欧洲央行参照汇率（Frankfurter）',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY',
    parse(data) {
      const rate = data?.rates?.CNY;
      const date = data?.date;
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
        return { rate, date };
      }
      return null;
    },
  },
  {
    id: 'exchangerate-api-open',
    name: 'ExchangeRate-API 公开接口',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse(data) {
      if (data?.result !== 'success') return null;
      const rate = data?.rates?.CNY;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
      let date = null;
      if (typeof data.time_last_update_unix === 'number' && Number.isFinite(data.time_last_update_unix)) {
        date = new Date(data.time_last_update_unix * 1000 + SGT_OFFSET_MS).toISOString().slice(0, 10);
      } else if (typeof data.time_last_update_utc === 'string') {
        const t = Date.parse(data.time_last_update_utc);
        if (Number.isFinite(t)) date = new Date(t + SGT_OFFSET_MS).toISOString().slice(0, 10);
      }
      if (!date) return null;
      return { rate, date };
    },
  },
];

export function sgtToday(now = Date.now()) {
  return new Date(now + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatTokenCount(n) {
  if (!Number.isFinite(n) || n < 0) return '未知';
  const x = Math.round(n);
  if (x >= 1e8) {
    const yi = x / 1e8;
    const digits = yi >= 100 ? 0 : yi >= 10 ? 1 : 2;
    return `${trimFloat(yi, digits)} 亿`;
  }
  if (x >= 1e4) {
    const wan = x / 1e4;
    const digits = wan >= 100 ? 0 : wan >= 10 ? 1 : 2;
    return `${trimFloat(wan, digits)} 万`;
  }
  return x.toLocaleString('zh-CN');
}

function trimFloat(n, digits) {
  return n.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatMoney(amount, currency) {
  if (!Number.isFinite(amount)) return null;
  const symbol = currency === 'CNY' ? '¥' : '$';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  let body;
  if (abs === 0) body = '0';
  else if (abs >= 1) body = abs.toFixed(2);
  else if (abs >= 0.01) body = trimFloat(abs, 3);
  else body = trimFloat(abs, 4);
  return `${sign}${symbol}${body}`;
}

export function formatCostRange(low, high, currency) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const left = formatMoney(a, currency);
  const right = formatMoney(b, currency);
  if (!left || !right) return null;
  if (left === right || Math.abs(b - a) < 1e-9) return left;
  return `${left}～${right}`;
}

function hasPricedCost(totals) {
  if (!totals) return false;
  return (totals.pricedEntries > 0) && (Number.isFinite(totals.totalCost) || Number.isFinite(totals.totalCostUpper));
}

export async function fetchUsdCnyRate({ fetchImpl = globalThis.fetch, now = Date.now(), sources = FX_SOURCES } = {}) {
  const errors = [];
  for (const src of sources) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FX_TIMEOUT_MS);
      let res;
      try {
        res = await fetchImpl(src.url, { signal: ac.signal, redirect: 'follow', headers: { accept: 'application/json' } });
      } finally {
        clearTimeout(timer);
      }
      if (!res || !res.ok) {
        errors.push(`${src.id}: http ${res ? res.status : 'no-response'}`);
        continue;
      }
      const data = await res.json();
      const parsed = src.parse(data);
      if (!parsed) {
        errors.push(`${src.id}: invalid payload`);
        continue;
      }
      return {
        ok: true,
        rate: parsed.rate,
        date: parsed.date,
        source: src.name,
        url: src.url,
        fetchedAt: now,
      };
    } catch (err) {
      const msg = err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'fetch failed';
      errors.push(`${src.id}: ${msg}`);
    }
  }
  return { ok: false, errors };
}

function memoryExtractNote(estimate) {
  const sources = Array.isArray(estimate?.sources) ? estimate.sources : [];
  const mem = sources.find((s) => s.source === 'memory-extract');
  const counted = Boolean(mem && (
    (mem.totalTokens || 0) > 0
    || (mem.pricedEntries || 0) > 0
    || (mem.missingUsageEntries || 0) > 0
    || (mem.missingCostEntries || 0) > 0
    || (mem.zeroTokenEntries || 0) > 0
  ));
  if (counted) {
    return '记忆抽取：今天已计入采集上线后有记录的部分；上线前没记下 token 的无法补计。';
  }
  return '记忆抽取：今天没有计入新的抽取记录；采集上线前没记下 token 的仍无法补计。';
}

function tokenLine(totals) {
  const input = formatTokenCount(totals.input || 0);
  const output = formatTokenCount(totals.output || 0);
  const cacheRead = formatTokenCount(totals.cacheRead || 0);
  const total = formatTokenCount(totals.totalTokens || 0);
  return `输入 ${input}、输出 ${output}、缓存读取 ${cacheRead}，共 ${total} token。`;
}

export function formatReport({ today, estimate, fx } = {}) {
  const lines = [];
  const date = today || sgtToday();
  const totals = estimate?.totals || {};
  lines.push(`今天（${date}，新加坡时间）实例合计：`);
  lines.push(tokenLine(totals));
  lines.push(memoryExtractNote(estimate));

  const priced = hasPricedCost(totals);
  const lowUsd = totals.totalCost;
  const highUsd = totals.totalCostUpper ?? totals.totalCost;
  const missing = (totals.missingCostEntries || 0) + (totals.missingUsageEntries || 0) + (totals.invalidUsageEntries || 0);

  if (priced) {
    if (fx?.ok) {
      const cny = formatCostRange(lowUsd * fx.rate, highUsd * fx.rate, 'CNY');
      const usd = formatCostRange(lowUsd, highUsd, 'USD');
      const rateText = Number.isInteger(fx.rate) ? String(fx.rate) : String(fx.rate);
      lines.push(`估价约 ${cny}（约 ${usd}），按预估汇率 1 美元 ≈ ${rateText} 人民币（来源：${fx.source}，汇率日期 ${fx.date}）。`);
    } else {
      const usd = formatCostRange(lowUsd, highUsd, 'USD');
      lines.push(`估价约 ${usd}（美元）。刚才没拿到公开汇率，换不了人民币。`);
    }
    if (missing > 0) lines.push('另有部分记录缺价或缺 token，没有算进金额，也没有当成 0。');
  } else if (missing > 0 || (totals.totalTokens || 0) > 0) {
    lines.push('费用暂时估不出：有记录缺价或缺 token，不能当成 0。');
  } else {
    lines.push('今天还没有可计价的用量记录，所以没有费用数字。');
  }

  lines.push('这是 API 等价估价，不是真实账单，不含订阅月费。');
  return lines.join('\n');
}

export async function loadTodayEstimate({
  now = Date.now(),
  stateDir = DEFAULT_STATE_DIR,
  ledgerDir = DEFAULT_LEDGER_DIR,
  consoleDir = DEFAULT_CONSOLE_DIR,
  load = null,
} = {}) {
  const today = sgtToday(now);
  const loader = load || (await import(`${consoleDir}/usage-estimate.mjs`)).loadUsageEstimate;
  const estimate = await loader({
    stateDir,
    ledgerDir,
    startDate: today,
    endDate: today,
    now,
  });
  return { today, estimate };
}

export async function buildTodayUsageText(options = {}) {
  const { today, estimate } = await loadTodayEstimate(options);
  const fx = options.fx !== undefined
    ? options.fx
    : await fetchUsdCnyRate({ fetchImpl: options.fetchImpl, now: options.now });
  return formatReport({ today, estimate, fx });
}

function printHelp() {
  const text = [
    '用法：node scripts/today_usage.mjs',
    '查询今天（新加坡时间）的实例 token / 费用合计，以人民币为主报出（按公开预估汇率）。',
    '这是 API 等价估价，不是真实账单。不要把 session_status 或 /status 当成当天合计。',
  ].join('\n');
  console.log(text);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    printHelp();
    return 0;
  }
  if (argv.length !== 0) {
    console.error('用法：node scripts/today_usage.mjs');
    return 2;
  }
  const text = await buildTodayUsageText();
  console.log(text);
  return 0;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().then((code) => {
    if (code) process.exitCode = code;
  }).catch((err) => {
    console.error('用量统计暂时不可用，请稍后再试。');
    if (process.env.TODAY_USAGE_DEBUG === '1') console.error(err);
    process.exitCode = 1;
  });
}
