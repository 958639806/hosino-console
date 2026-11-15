const KEY = 'hosino:model-collapse:v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const modelBodyId = key => 'mc-body-'+encodeURIComponent(key);
export function modelSummary(key, label, rows, registered = rows) {
  const ref = m => m.ref || `${m.provider || ''}/${m.id || ''}`;
  const live = new Map(registered.map(m=>[ref(m),m]));
  let available=0,unknown=0;
  for (const row of rows) { const m=live.get(ref(row)); if (!m) unknown++; else if (m.available !== false) available++; }
  const primary=rows.find(m=>m.isPrimary),fallbacks=rows.filter(m=>m.fallbackIndex>=0).length;
  return `<summary class="mc-summary" tabindex="0" aria-expanded="false" aria-controls="${esc(modelBodyId(key))}"><b class="mc-name">${esc(label)}</b><span class="mc-meta"><span>${rows.length} 个模型</span><span>可用 ${available}${unknown?' · 待确认 '+unknown:''}</span>${primary?`<span class="pill ac">默认 ${esc(primary.alias||primary.name||primary.id)}</span>`:''}${fallbacks?`<span class="pill">回退 ${fallbacks}</span>`:''}</span></summary>`;
}
export function createModelCollapse(storage) {
  if (!arguments.length) { try { storage=globalThis.sessionStorage; } catch {} }
  const states=new Map(),bound=new WeakSet();
  try { const saved=JSON.parse(storage?.getItem(KEY)||'[]'); if(Array.isArray(saved)) for(const pair of saved) if(Array.isArray(pair)&&typeof pair[0]==='string'&&typeof pair[1]==='boolean') states.set(...pair); } catch {}
  const persist=()=>{try{storage?.setItem(KEY,JSON.stringify([...states]));}catch{}};
  const remember=d=>{states.set(d.dataset.modelCollapse,!!d.open);const s=d.querySelector('summary');if(s)s.setAttribute('aria-expanded',String(!!d.open));};
  return {
    capture(root) { root.querySelectorAll('details[data-model-collapse]').forEach(remember);persist(); },
    restore(root) {
      root.querySelectorAll('details[data-model-collapse]').forEach(d=>{d.open=states.get(d.dataset.modelCollapse)===true;const s=d.querySelector('summary');if(s)s.setAttribute('aria-expanded',String(d.open));});
      if(bound.has(root))return;bound.add(root);
      root.addEventListener('toggle',e=>{const d=e.target;if(!d.matches?.('details[data-model-collapse]')||!root.contains(d))return;remember(d);persist();},true);
    },
  };
}
export const modelCollapse=createModelCollapse();
