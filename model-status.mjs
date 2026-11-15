// HOSINO-MODEL-STATUS v1：模型管理页的“登录状态 / 可用模型”统一从网关读：
//   登录状态 = models.authStatus 的 providers[].profiles（type/status/expiry）与 apiKey 来源；
//   可用模型 = models.list（网关按当前凭据给出的目录）∪ 配置里的 models.providers.*.models ∪ allowlist。
// providerCapabilities 只是“网关支持哪些供应商/登录方式”，不代表已配置，不再当成供应商卡片。
const RANK = { ok: 0, valid: 0, static: 1, expiring: 2, refreshable: 3, expired: 4, error: 5, missing: 6 };
const best = list => [...list].sort((a, b) => (RANK[a?.status] ?? 9) - (RANK[b?.status] ?? 9))[0] || null;
const expAt = p => Number.isFinite(p?.expiry?.at) ? p.expiry.at : Number.isFinite(p?.expiresAt) ? p.expiresAt : null;

export function providerIds({ provs = {}, allow = {}, auth = null }) {
  const ok = p => typeof p === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(p);
  const ids = new Set([...Object.keys(provs), ...Object.keys(allow).map(r => r.split("/")[0]), ...(auth?.providers || []).map(p => p?.provider)].filter(ok));
  const addable = [...new Set((auth?.providerCapabilities || []).map(c => c?.provider).filter(ok))].filter(p => !ids.has(p)).sort();
  return { ids: [...ids].sort(), addable };
}

// names: secrets.store.list 名字表；authRow: models.authStatus 里该供应商那一行；liveOf: 该供应商在 models.list 里的模型
export function credentialOf({ prov, pc = {}, names = new Map(), authRow = null, oauthSet = new Set(), envKey = {}, liveOf = [], allow = {}, runtimeHealth = null }) {
  const profiles = Array.isArray(authRow?.profiles) ? authRow.profiles : [];
  const oauthProfiles = profiles.filter(p => p?.type === "oauth" || p?.type === "token");
  const isOauth = pc.auth === "oauth" || oauthSet.has(prov) || oauthProfiles.length > 0;
  const liveOk = liveOf.some(m => m.available !== false);
  if (isOauth) {
    if (oauthProfiles.length) {
      const b = best(oauthProfiles), exp = oauthProfiles.map(expAt).filter(Number.isFinite);
      const status = b?.status || authRow?.status || "unknown";
      return { kind: "oauth", editable: false, present: true, status, expiresAt: exp.length ? Math.max(...exp) : null,
        profileIds: oauthProfiles.map(p => p.profileId ?? p.id).filter(Boolean), source: "auth-profile",
        note: status === "expired" ? "访问令牌已过期，网关会用刷新令牌自动续期；如果调用失败再重新登录" : "OAuth 登录（凭据由网关登录向导管理）" };
    }
    // anthropic 这类：模型走 claude-cli 等订阅运行时，网关 authStatus 里没有它的行，登录状态在 CLI 里
    const rt = [...new Set(Object.entries(allow).filter(([r, a]) => r.startsWith(prov + "/") && a?.agentRuntime).map(([, a]) => a.agentRuntime?.id || a.agentRuntime))];
    if (rt.length) {
      // HOSINO-CLI-RUNTIME-HEALTH v1：网关目录的“可用”不代表账号能用，按最近一次 CLI 调用失败判断（如账号被暂停）
      const bad = (runtimeHealth && rt.map(r => runtimeHealth[r]).find(h => h?.blocked)) || null;
      if (bad) return { kind: "runtime", editable: false, present: false, status: "restricted", runtimes: rt, source: "cli-runtime", lastFailureAt: bad.at,
        note: `${rt.join("、")} 账号不可用：${bad.reason}（最近一次失败 ${bad.atText}）` };
      return { kind: "runtime", editable: false, present: false, status: "unverified", runtimes: rt, source: "cli-runtime",
        note: `由 ${rt.join("、")} 订阅运行时提供，控制台没法确认账号状态；最近日志里没有账号失败记录${liveOk ? "" : "，网关目录也显示不可用"}` };
    }
    return { kind: "oauth", editable: false, present: false, status: authRow?.status || "missing", source: null, note: "没有找到 OAuth 账号，请用登录入口授权" };
  }
  const ak = pc.apiKey, m = typeof ak === "string" && /^\$\{([A-Z0-9_]+)\}$/.exec(ak);
  const env = m ? m[1] : (authRow?.apiKey?.envVar || envKey[prov] || null);
  const keyProfiles = profiles.filter(p => p?.type === "api_key");
  if (env && names.has(env)) return { kind: "secret-store", editable: true, target: env, present: true, status: "static" };
  if (typeof ak === "string" && ak && !m) return { kind: "inline", editable: true, present: true, status: "static" };
  const refObj = ak && typeof ak === "object"; // SecretRef（config.get 已把 id 脱敏，只能判断“有引用”）
  const present = keyProfiles.length > 0 || !!authRow?.apiKey || !!authRow?.hasKey || refObj;
  return { kind: "auth-profile", editable: true, present, status: present ? (authRow?.status || "static") : "missing",
    ...(env ? { target: env } : {}), ...(keyProfiles.length ? { profileIds: keyProfiles.map(p => p.profileId ?? p.id).filter(Boolean) } : {}),
    source: keyProfiles.length ? "auth-profile" : authRow?.apiKey?.source || (refObj ? "secret-ref" : null) };
}

// 模型：配置 ∪ allowlist ∪ 网关目录（models.list）。目录里有、但还没进 allowlist 的标 catalogOnly
// extra：网关之外的目录（openai-api 直连 /v1/models）
export function modelRefs({ prov, pc = {}, allow = {}, liveOf = [], extra = [] }) {
  return new Set([...(pc.models || []).map(m => `${prov}/${m.id}`), ...Object.keys(allow).filter(r => r.startsWith(prov + "/")), ...liveOf.map(m => `${prov}/${m.id}`), ...extra.map(m => `${prov}/${m.id}`)]);
}
