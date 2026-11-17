import { ic } from "./icons.js?v=2026.11.17.1-icons";
const BUCKETS = [['input','输入'],['output','输出'],['cacheRead','缓存读取'],['cacheWrite','缓存写入']];
const DIMENSIONS = [['model','模型'],['provider','服务商'],['date','日期']];
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (n, digits=6) => typeof n === 'number' && Number.isFinite(n) ? '$'+n.toFixed(n !== 0 && Math.abs(n)<.01 ? 6 : digits).replace(/\.?0+$/,'') : '无法计算';
const amount = (lo,hi,digits=6) => money(lo,digits)+(Number.isFinite(lo)&&Number.isFinite(hi)&&hi-lo>1e-9?'–'+money(hi,digits):'');
const count = n => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '无法计算';
const date = t => Number.isFinite(t) ? new Date(t+8*3600e3).toISOString().slice(0,10) : '日期未知';
const time = t => Number.isFinite(t) ? new Date(t+8*3600e3).toISOString().slice(0,19).replace('T',' ')+' SGT' : '时间未知';
const gaps = r => (r.missingCostEntries||0)+(r.missingUsageEntries||0)+(r.invalidUsageEntries||0);
function buckets(row) {
  const unknownTokens = !row.pricedEntries && (row.missingUsageEntries || row.invalidUsageEntries || row.missingTokenBreakdownEntries);
  return '<div class="ud-buckets">'+BUCKETS.map(([key,label])=>`<div class="ud-bucket"><span>${label}</span><b class="tnum">${unknownTokens ? "无法计算" : count(row[key])}</b><i class="tnum">${!row.pricedEntries&&gaps(row)?'无法计算':amount(row[key+'Cost'],row[key+'CostUpper'])}</i></div>`).join('')+'</div>';
}
function notes(d) {
 const t=d.totals||{},a=new Set(d.assumptions||[]);
 return `<div class="uc-sub">非实际账单，不含订阅费；按当前公开价格重算已记录 token，不代表全部上游用量。</div>`+
 `<div class="uc-sub">全部 ${(d.agents||[]).length} 个 agent · 新加坡日期 ${date(d.range?.startMs)} 至 ${date(d.range?.endMs-1)} · 价目 ${esc(d.priceDate)} · 缓存 TTL ${(d.refresh?.ttlMs??120000)/1000} 秒</div>`+
 `<div class="uc-sub">已记录 token 计价覆盖 ${Number.isFinite(t.tokenCoverage)?(t.tokenCoverage*100).toFixed(1)+'%':'未知'}；同型号官方价覆盖 ${Number.isFinite(t.officialTokenCoverage)?(t.officialTokenCoverage*100).toFixed(1)+'%':'未知'}。</div>`+
 (t.referencePriceEntries?`<div class="uc-sub">Fast 变体参考价 ${amount(t.referenceCost,t.referenceCostUpper)}，${count(t.referenceTokens)} tokens / ${t.referencePriceEntries} 条；不是公共 API 同型号官方价，已包含在合计中。</div>`:'')+
 (t.customPriceEntries?`<div class="uc-sub">${t.customPriceEntries} 条使用自定义单价，非官方价。</div>`:'')+
 (a.has('cache_ttl_unknown')||a.has('openai_cache_ttl_unknown')?`<div class="uc-sub">缓存写入 TTL 证据不足：${a.has('cache_ttl_unknown')?'Claude 5分钟–1小时；':''}${a.has('openai_cache_ttl_unknown')?'OpenAI 30分钟–12小时；':''}按全部相关 token 计算上下界，没有跳过。</div>`:'')+
 (a.has('deepseek_peak_offpeak_range')?'<div class="uc-sub">DeepSeek 未确定峰谷日历，按公开峰谷价给出区间。</div>':'')+
 (gaps(t)||d.untimestampedEntries||d.sourceErrors?.length?`<div class="uc-sub" role="status">无法计算记录 ${gaps(t)}；缺时间 ${d.untimestampedEntries||0}；源读取异常 ${d.sourceErrors?.length||0}。未知不能用 $0 代替，合计仅包含可估算部分。</div>`:'');
}
export function renderUsageDetail(d, segment='model', status) {
 const t=d.totals||{},state=status||d.refresh?.status||'fresh';
 const label=state==='refreshing'?'正在读取真实统计':state==='stale'?'旧快照 · 刷新未成功':'已读取';
 const rows=(segment==='provider'?d.providers:segment==='date'?d.daily:d.models)||[];
 return `<div class="ud-page"><header class="top"><a class="iconbtn back ud-back" href="#/models" aria-label="返回模型与用量">${ic("back")}</a><h1>消耗详情<span class="sub">API 等价估价 · 非实际账单</span></h1></header>
 <div class="card uc ud-hero" data-refresh="${esc(state)}"><div class="uc-head"><b>全部已记录用量估价</b><span class="ud-chip ud-chip-${esc(state)}">${label}</span></div><div class="big tnum">${!t.pricedEntries&&gaps(t)?'无法计算':t.totalTokens?amount(t.totalCost,t.totalCostUpper,2):'—'}<small>USD</small></div><div>${count(t.totalTokens)} tokens · ${count(t.pricedEntries)} 条已估算记录</div>${buckets(t)}${notes(d)}<div class="uc-sub">快照 ${time(d.updatedAt)}${d.complete===false?' · 统计不完整':''}</div><button type="button" class="btn ud-refresh"${state==='refreshing'?' disabled':''}>${state==='refreshing'?'刷新中…':'刷新真实统计'}</button></div>
 <div class="seg ud-seg" role="tablist" aria-label="明细维度">${DIMENSIONS.map(([id,label])=>`<button type="button" role="tab" data-ud-segment="${id}" aria-selected="${id===segment}">${label}</button>`).join('')}</div>
 <div class="ud-list">${rows.filter(r=>r.totalTokens||gaps(r)).map(r=>`<div class="card ud-row"><div class="t">${esc(r.model||r.provider||r.date)}</div>${r.referencePriceEntries?'<div class="d">包含 Fast 变体参考价，非公共 API 同型号官方价</div>':''}${gaps(r)?`<div class="d">${gaps(r)} 条无法计算，未折为零；${count(r.totalTokens)} 已知 tokens</div>`:''}${buckets(r)}<b class="ud-amt tnum">${!r.pricedEntries&&gaps(r)?'无法计算':amount(r.totalCost,r.totalCostUpper)}</b></div>`).join('')||'<div class="card ud-empty">暂无已记录用量</div>'}</div></div>`;
}
export async function mountUsageDetail(root,load) {
 let data=null,segment='model',status='refreshing',busy=false;
 function draw(error) {
  if(root.isConnected===false)return;
  root.innerHTML=data?renderUsageDetail(data,segment,status):`<div class="view ud-page"><a class="btn ud-back" href="#/models">返回模型与用量</a><div class="card">${error?'无法读取真实统计，未用示例或零元代替':'正在读取已记录用量…'}<button class="btn ud-refresh"${busy?' disabled':''}>重试</button></div></div>`;
  root.querySelectorAll('[data-ud-segment]').forEach(b=>{b.onclick=()=>{segment=b.dataset.udSegment;draw();};});
  const b=root.querySelector('.ud-refresh');if(b)b.onclick=()=>refresh(true);
 }
 async function refresh(force=false) {
  if(busy)return;busy=true;status='refreshing';draw();
  try {const next=await load(force);if(next.billingMode!=='api-equivalent'||!Array.isArray(next.providers))throw Error('unsupported usage contract');data=next;status=next.refresh?.status||'fresh';}
  catch {status='stale';}finally{busy=false;draw(status==='stale');}
 }
 await refresh();
}
export function openUsageDetailPage(root,rest,load) {
 if(String(rest||'').replace(/^\/+|\/+$/g,'')!=='cost')return false;
 return mountUsageDetail(root,load).then(()=>true);
}
