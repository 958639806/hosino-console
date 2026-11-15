// OpenAI 官方 API 用量：Costs + Completions/Images Usage。
// 只读 Admin API key，绝不把密钥写入日志或接口响应。
const DEFAULT_KEY_FILE = "/etc/hosino-console/openai-admin.key";
const CACHE_TTL_MS = 120e3;
const UA = "hosino-console";
const BASE = "https://api.openai.com/v1";
const MAX_PAGES = 8;

export { DEFAULT_KEY_FILE, CACHE_TTL_MS };

export function readOpenAIAdminKey(fs, env = process.env, file = env.OPENAI_ADMIN_KEY_FILE || DEFAULT_KEY_FILE) {
  const fromEnv = typeof env.OPENAI_ADMIN_KEY === "string" ? env.OPENAI_ADMIN_KEY.trim() : "";
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (s && !s.startsWith("#")) return s;
    }
  } catch {}
  return "";
}

function mapHttp(status) {
  if (status === 401) return "OpenAI 返回 HTTP 401（Admin API key 无效）";
  if (status === 403) return "OpenAI 返回 HTTP 403（需要 api.usage.read 权限）";
  if (status === 429) return "OpenAI 返回 HTTP 429（用量接口限流，请稍后重试）";
  return "OpenAI 返回 HTTP " + status;
}

function usageFail(message) {
  const e = new Error(message);
  e.usageError = message;
  return e;
}

async function fetchPages(fetchImpl, key, pathAndQuery, timeoutMs) {
  const buckets = [];
  let page;
  for (let i = 0; i < MAX_PAGES; i++) {
    const u = new URL(BASE + pathAndQuery);
    if (page) u.searchParams.set("page", page);
    let r;
    try {
      r = await fetchImpl(u, {
        headers: { Authorization: "Bearer " + key, Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e?.name === "TimeoutError") throw usageFail("请求超时");
      throw usageFail("网络错误");
    }
    if (!r.ok) throw usageFail(mapHttp(r.status));
    let j;
    try { j = await r.json(); }
    catch { throw usageFail("OpenAI 返回了无法解析的响应"); }
    if (Array.isArray(j.data)) buckets.push(...j.data);
    if (!j.has_more || !j.next_page) break;
    page = j.next_page;
  }
  return buckets;
}

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

function emptyTokens() {
  return { input: 0, output: 0, cachedInput: 0, cacheWrite: 0, total: 0, requests: 0 };
}

function addCompletion(dst, row) {
  dst.input += n(row.input_tokens);
  dst.output += n(row.output_tokens);
  dst.cachedInput += n(row.input_cached_tokens);
  dst.cacheWrite += n(row.input_cache_write_tokens);
  dst.requests += n(row.num_model_requests);
  dst.total = dst.input + dst.output;
  return dst;
}

function utcMonthStartSec(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

function utcNextMonthStartSec(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
}

function utcDate(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

const SGT_OFFSET_SEC = 8 * 3600;

function sgtMidnightSec(nowMs) {
  const shifted = nowMs + SGT_OFFSET_SEC * 1000;
  const d = new Date(shifted);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000 - SGT_OFFSET_SEC;
}

function sgtNextMidnightSec(nowMs) {
  return sgtMidnightSec(nowMs) + 24 * 3600;
}

function sgtDateFromSec(sec) {
  return new Date((sec + SGT_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

export { sgtMidnightSec, sgtNextMidnightSec, sgtDateFromSec };

function fmtUsd(v) {
  const x = Math.round(Number(v) * 1e6) / 1e6;
  if (!Number.isFinite(x) || x === 0) return "0.00";
  const s = Math.abs(x).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [a, b = ""] = s.split(".");
  const frac = (b + "00").slice(0, Math.max(2, b.length));
  return (x < 0 ? "-" : "") + a + "." + frac;
}

function fmtTok(v) {
  if (!Number.isFinite(v) || v === 0) return "0";
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + " 亿";
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1).replace(/\.0$/, "") + " 万";
  return String(Math.round(v));
}

function spendOfBucket(bucket) {
  let usd = 0;
  for (const row of bucket.results || []) {
    if (row?.object && row.object !== "organization.costs.result") continue;
    const cur = String(row?.amount?.currency || "usd").toLowerCase();
    if (cur && cur !== "usd") continue;
    usd += n(row?.amount?.value);
  }
  return usd;
}

function rollDay(map, start, end) {
  const key = start + ":" + end;
  if (!map.has(key)) {
    map.set(key, {
      date: utcDate(start),
      startTime: start,
      endTime: end,
      spendUsd: 0,
      tokens: emptyTokens(),
      images: { images: 0, requests: 0 },
    });
  }
  return map.get(key);
}

export async function fetchOpenAIApiUsage({ key, fetch: fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = 10000 }) {
  const start = utcMonthStartSec(now);
  const monthEnd = utcNextMonthStartSec(now);
  const limit = 31;
  const common = `start_time=${start}&end_time=${monthEnd}&bucket_width=1d&limit=${limit}`;
  const todayStart = sgtMidnightSec(now);
  const todayEnd = sgtNextMidnightSec(now);
  const nowSec = Math.floor(now / 1000);
  const hourEnd = Math.max(nowSec + 1, todayStart + 1);
  // 1h 桶：从新加坡当天 00:00 到现在。limit 用 48（24+ 余量）；Usage 的 1h 上限是 168。
  const hourly = `start_time=${todayStart}&end_time=${hourEnd}&bucket_width=1h&limit=48`;

  const [costBuckets, completionBuckets, imageBuckets, todayCompBuckets, todayImageBuckets] = await Promise.all([
    fetchPages(fetchImpl, key, `/organization/costs?${common}`, timeoutMs),
    fetchPages(fetchImpl, key, `/organization/usage/completions?${common}&group_by=model`, timeoutMs),
    fetchPages(fetchImpl, key, `/organization/usage/images?${common}&group_by=model`, timeoutMs),
    fetchPages(fetchImpl, key, `/organization/usage/completions?${hourly}`, timeoutMs),
    fetchPages(fetchImpl, key, `/organization/usage/images?${hourly}`, timeoutMs),
  ]);

  const days = new Map();
  const models = new Map();
  const monthTokens = emptyTokens();
  const monthImages = { images: 0, requests: 0 };
  let spendUsd = 0;

  for (const b of costBuckets) {
    const startT = n(b.start_time), endT = n(b.end_time);
    const usd = spendOfBucket(b);
    spendUsd += usd;
    if (startT) rollDay(days, startT, endT).spendUsd += usd;
  }

  for (const b of completionBuckets) {
    const startT = n(b.start_time), endT = n(b.end_time);
    const day = startT ? rollDay(days, startT, endT) : null;
    for (const row of b.results || []) {
      addCompletion(monthTokens, row);
      if (day) addCompletion(day.tokens, row);
      const model = row.model || "(unknown)";
      if (!models.has(model)) models.set(model, { model, kind: "completions", ...emptyTokens() });
      addCompletion(models.get(model), row);
    }
  }

  for (const b of imageBuckets) {
    const startT = n(b.start_time), endT = n(b.end_time);
    const day = startT ? rollDay(days, startT, endT) : null;
    for (const row of b.results || []) {
      const images = n(row.images), requests = n(row.num_model_requests);
      monthImages.images += images;
      monthImages.requests += requests;
      if (day) { day.images.images += images; day.images.requests += requests; }
      const model = row.model || "(unknown)";
      const id = model + "#images";
      if (!models.has(id)) models.set(id, { model, kind: "images", images: 0, requests: 0 });
      const m = models.get(id);
      m.images += images;
      m.requests += requests;
    }
  }

  const daily = [...days.values()].sort((a, b) => a.startTime - b.startTime);
  const utcDay = daily.find(d => d.startTime <= nowSec && nowSec < d.endTime) || null;
  const utcDaySpendUsd = utcDay ? Math.round(utcDay.spendUsd * 1e6) / 1e6 : null;

  const todayTokens = emptyTokens();
  const todayImages = { images: 0, requests: 0 };
  for (const b of todayCompBuckets) {
    const st = n(b.start_time);
    if (st < todayStart || st >= hourEnd) continue;
    for (const row of b.results || []) addCompletion(todayTokens, row);
  }
  for (const b of todayImageBuckets) {
    const st = n(b.start_time);
    if (st < todayStart || st >= hourEnd) continue;
    for (const row of b.results || []) {
      todayImages.images += n(row.images);
      todayImages.requests += n(row.num_model_requests);
    }
  }

  const today = {
    date: sgtDateFromSec(todayStart),
    timezone: "Asia/Singapore",
    startTime: todayStart,
    endTime: todayEnd,
    spendUsd: null,
    utcDaySpendUsd,
    tokens: todayTokens,
    images: todayImages,
  };

  const periodStartMs = start * 1000;
  const periodEndMs = now;
  const summaryParts = [`本月 $${fmtUsd(spendUsd)}`, `${fmtTok(monthTokens.total)} tokens`];
  if (todayTokens.total > 0) summaryParts.push(`今日 ${fmtTok(todayTokens.total)} tokens`);
  else if (todayImages.images > 0) summaryParts.push(`今日图像 ${todayImages.images} 张`);
  if (monthImages.images) summaryParts.push(`图像 ${monthImages.images} 张`);

  const ym = utcDate(start).slice(0, 7);
  return {
    provider: "openai-api",
    displayName: "OpenAI 官方 API",
    plan: "按量计费",
    period: {
      start: new Date(periodStartMs).toISOString(),
      end: new Date(periodEndMs).toISOString(),
      startMs: periodStartMs,
      endMs: periodEndMs,
      timezone: "UTC",
      label: ym,
    },
    fetchedAt: now,
    cacheTtlMs: CACHE_TTL_MS,
    billing: [{
      type: "spend",
      used: Math.round(spendUsd * 1e6) / 1e6,
      unit: "USD",
      period: "month",
      periodStart: periodStartMs,
      periodEnd: periodEndMs,
    }],
    tokens: monthTokens,
    images: monthImages,
    today,
    models: [...models.values()].sort((a, b) => {
      const at = a.kind === "completions" ? a.total : a.requests;
      const bt = b.kind === "completions" ? b.total : b.requests;
      return bt - at;
    }),
    daily: daily.map(d => ({
      ...d,
      timezone: "UTC",
      spendUsd: Math.round(d.spendUsd * 1e6) / 1e6,
    })),
    windows: [],
    summary: summaryParts.join(" · "),
  };
}

function na(why, now) {
  return {
    provider: "openai-api",
    displayName: "OpenAI 官方 API",
    plan: "按量计费",
    period: null,
    fetchedAt: now,
    cacheTtlMs: CACHE_TTL_MS,
    billing: [],
    tokens: null,
    images: null,
    today: null,
    models: [],
    daily: [],
    windows: [],
    summary: "暂不可用",
    error: why,
  };
}

export function makeOpenAIApiUsage({ cached, fs, env = process.env, fetch: fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  return () => cached("openai-api", CACHE_TTL_MS, async () => {
    const t = now();
    const key = readOpenAIAdminKey(fs, env);
    if (!key) return na("未配置 Admin API key（请在主机写入 /etc/hosino-console/openai-admin.key）", t);
    if (!key.startsWith("sk-admin-")) return na("当前密钥不是 Admin API key（需要平台 Settings → Admin keys 的 sk-admin-，并勾选 api.usage.read）", t);
    try {
      return await fetchOpenAIApiUsage({ key, fetch: fetchImpl, now: t });
    } catch (e) {
      return na(e?.usageError || (e?.name === "TimeoutError" ? "请求超时" : "网络错误"), t);
    }
  });
}
