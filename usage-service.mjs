import { usageDateRange } from './usage-estimate.mjs';
export function createUsageService({ load, ttlMs = 120000, now = Date.now }) {
  const cache = new Map();
  function view(entry, status, cacheHit) {
    const t = now();
    return { ...entry.data, complete: status === 'stale' ? false : entry.data.complete,
      refresh: { status, pending: false, cacheHit, ttlMs, generatedAt: entry.generatedAt, expiresAt: entry.generatedAt + ttlMs, ageMs: Math.max(0,t-entry.generatedAt) } };
  }
  return { async get(params, { refresh = false } = {}) {
    const requestedAt = now();
    let range; try { range = usageDateRange({ ...params, now: requestedAt }); } catch { throw Object.assign(new Error('用量日期范围无效'),{http:400}); }
    const key = `${range.startMs}/${range.endMs}`;
    let entry = cache.get(key);
    if (!entry) { entry = {}; cache.set(key,entry); if (cache.size > 64) cache.delete(cache.keys().next().value); }
    if (entry.promise) return entry.promise;
    if (!refresh && !entry.failed && entry.data && entry.generatedAt + ttlMs > now()) return view(entry,'fresh',true);
    entry.promise = Promise.resolve().then(()=>load({ ...params, now: requestedAt })).then(data=>{
      entry.data=data; entry.failed=false; entry.generatedAt=now(); return view(entry,'fresh',false);
    }).catch(()=>{
      entry.failed=true;
      if (entry.data) return view(entry,'stale',true);
      throw Object.assign(new Error('用量统计暂不可用，请稍后重试'),{http:503});
    }).finally(()=>{entry.promise=null;});
    return entry.promise;
  } };
}
