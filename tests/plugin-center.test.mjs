import { test } from "node:test";
import assert from "node:assert/strict";
import { makePluginCenter } from "../plugin-center.mjs";

const OLD = "ordinary-old-provider-value-123456";
const NEW = "ordinary-new-provider-value-654321";
const copy = v => JSON.parse(JSON.stringify(v));
const declared = () => Object.fromEntries(["channels", "providers", "tools", "contracts", "hooks", "mcpServers", "cliCommands", "cliBackends", "skills", "dangerousConfigFlags"].map(k => [k, []]));
const components = () => ({ mapped: [], skills: [], mcpServers: [], commands: [], hooks: [], lspServers: [], unavailable: { capabilities: [], mcpServers: [], lspServers: [] } });
function fixture(options = {}) {
  const state = {
    cfg: { channels: { qqbot: {} }, plugins: { slots: { memory: "mem-owner" }, entries: { weather: { config: { city: "Singapore", apiKey: OLD, units: "celsius", useCache: true, limits: { perDay: 5 } } } } } },
    plugins: [
      { id: "weather", name: "Weather", installed: true, enabled: true, kind: [], packageName: "weather-package", runtime: { state: "active" } },
      { id: "qq-adapter", name: "QQ", installed: true, enabled: true, packageName: "qq-package", channelIds: ["qqbot"], runtime: { state: "active" } },
      { id: "qq-helper", name: "QQ helper", installed: true, enabled: true, packageName: "qq-package" },
      { id: "mem-owner", installed: true, enabled: true },
    ],
    schema: { type: "object", required: ["city", "apiKey"], properties: {
      city: { type: "string", minLength: 1, maxLength: 40 }, units: { type: "string", enum: ["celsius", "fahrenheit"] }, useCache: { type: "boolean" },
      apiKey: { type: "string", writeOnly: true, default: OLD, examples: [OLD] },
      limits: { type: "object", required: ["perDay"], properties: { perDay: { type: "integer", minimum: 0, maximum: 100 } } },
    } },
    declared: declared(), components: components(), kind: "hot", hash: "revision-1", valid: true, mutationAllowed: true, now: 1000, quiet: false,
  };
  const calls = [], guards = []; let changed = 0;
  const api = makePluginCenter({
    now: () => state.now, ttlMs: 1000, safeConfigPlugins: options.audited ? new Set(["weather"]) : new Set(),
    protectedPlugins: () => new Map([["extra-guard", "local guard"]]), onChanged: () => changed++,
    quietGuard: name => { guards.push(name); if (state.quiet) throw Object.assign(new Error("静默窗口"), { http: 423, code: "quiet_window" }); },
    reloadPlan: async () => ({ label: state.kind === "none" ? "immediate" : state.kind === "restart" ? "restart" : "reload", restartRequired: state.kind === "restart", paths: [{ path: "plugins.entries.weather.config", kind: state.kind }] }),
    call: async (method, params) => {
      calls.push({ method, params: copy(params) });
      if (state.error === method) throw Object.assign(new Error(`reflected ${OLD} ${NEW}`), { code: state.errorCode || "UNAVAILABLE" });
      if (method === "config.get") return { config: copy(state.cfg), hash: state.hash, valid: state.valid };
      if (method === "plugins.list") return { plugins: copy(state.plugins), mutationAllowed: state.mutationAllowed };
      if (method === "plugins.inspect") return { plugin: { id: state.wrongId || params.pluginId }, declared: copy(state.declared), components: copy(state.components) };
      if (method === "config.schema.lookup") return { schema: copy(state.schema), reloadKind: state.kind, children: [] };
      if (method === "config.patch") {
        assert.equal(params.baseHash, state.hash);
        const config = JSON.parse(params.raw).plugins.entries.weather.config;
        state.cfg.plugins.entries.weather.config = { ...state.cfg.plugins.entries.weather.config, ...config };
        state.hash = "revision-2"; return { ok: true };
      }
      throw new Error("unexpected mutation " + method);
    },
  });
  const request = config => ({ action: "config", id: "weather", baseHash: state.hash, config });
  return { api, state, calls, guards, request, changed: () => changed };
}

test("native inventory protects channel IDs, slots and siblings without lifecycle RPC", async () => {
  const f = fixture(), result = await f.api.list(), by = Object.fromEntries(result.plugins.map(p => [p.id, p]));
  assert.equal(result.baseHash, "revision-1"); assert.equal(result.capabilities.install, false); assert.equal(result.capabilities.installPreview, true);
  assert.equal(by["qq-adapter"].protected, true); assert.equal(by["qq-helper"].protected, true); assert.equal(by["mem-owner"].protected, true); assert.equal(by.weather.protected, false);
  assert.deepEqual(by.weather.capabilities, { configure: false, previewConfig: true, enable: false, disable: false, uninstall: false });
  assert.deepEqual(f.calls.map(c => c.method), ["config.get", "plugins.list"]);
});

test("details expose schema and write-only presence without stored values or defaults", async () => {
  const f = fixture(), d = await f.api.detail("weather"), serialized = JSON.stringify(d);
  assert.equal(d.config.values.city, "Singapore"); assert.equal(d.config.values.apiKey, undefined);
  assert.deepEqual(d.config.secretFields, [{ path: "apiKey", keys: ["apiKey"], configured: true }]);
  assert.equal(d.config.schema.properties.apiKey.default, undefined); assert.equal(d.config.schema.properties.apiKey.examples, undefined);
  assert.equal(d.config.previewable, true); assert.equal(d.config.writable, false); assert.equal(d.readme, null);
  assert.ok(!serialized.includes(OLD)); assert.ok(!serialized.includes("cmd_config"));
});

test("config preview returns a complete safe change sheet and does not write", async () => {
  const f = fixture(), p = await f.api.plan(f.request({ city: "Tokyo", limits: { perDay: 7 } }), "sid-one");
  assert.equal(p.canApply, false); assert.equal(p.blockedCode, "maintenance_required"); assert.equal(p.diff.length, 2);
  assert.deepEqual(p.diff[0], { path: "city", keys: ["city"], before: "Singapore", after: "Tokyo" });
  const out = JSON.parse(p.export.content); assert.equal(out.executable, false); assert.equal(out.baseHash, "revision-1");
  assert.ok(!p.export.content.includes(OLD)); assert.equal(f.state.cfg.plugins.entries.weather.config.city, "Singapore");
  assert.ok(!f.calls.some(c => c.method === "config.patch"));
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }, "sid-one"), { http: 409, code: "maintenance_required" });
});

test("schema-declared credentials remain write-only before the first value is configured", async () => {
  const f = fixture(); delete f.state.cfg.plugins.entries.weather.config.apiKey;
  f.state.schema.properties.nested = { type: "object", properties: { custom: { type: "string", sensitive: true } } };
  const d = await f.api.detail("weather");
  assert.deepEqual(d.config.secretFields, [
    { path: "apiKey", keys: ["apiKey"], configured: false },
    { path: "nested.custom", keys: ["nested", "custom"], configured: false },
  ]);
  assert.equal(d.config.values.apiKey, undefined);
});

test("native install is a read-only candidate review, never a Python compatibility path", async () => {
  const f = fixture();
  for (const [source, spec] of [["npm", "@openclaw/example@1.2.3"], ["clawhub", "author/example"], ["official", "weather"]]) {
    const p = await f.api.plan({ action: "install", source, spec, baseHash: f.state.hash });
    assert.equal(p.canApply, false); assert.deepEqual(p.diff[0].after, { source, spec });
    assert.equal(p.verification, "identifier-only"); assert.equal(p.verifiedNative, false);
    assert.equal(JSON.parse(p.export.content).verifiedNative, false);
    await assert.rejects(f.api.apply({ ...p, confirm: true }), { code: "maintenance_required" });
  }
  for (const spec of ["astrbot_plugin_test", "example.zip", "example.py", "https://example.test/a.tgz", "../local", "a;touch /tmp/a"]) await assert.rejects(f.api.plan({ action: "install", source: "npm", spec, baseHash: f.state.hash }), { http: 400, code: "unsupported_source" });
  assert.ok(!f.calls.some(c => /plugins\.(install|setEnabled|uninstall)/.test(c.method)));
});

test("enable, disable and uninstall produce explicit maintenance sheets only", async () => {
  const f = fixture();
  for (const action of ["enable", "disable", "uninstall"]) {
    const p = await f.api.plan({ action, id: "weather", baseHash: f.state.hash });
    assert.equal(p.canApply, false); assert.match(p.blockedReason, /QQ/);
    await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }), { code: "maintenance_required" });
  }
  assert.ok(!f.calls.some(c => /plugins\.(install|setEnabled|uninstall)/.test(c.method)));
});

test("protected plugins and their package siblings cannot create mutation plans", async () => {
  const f = fixture();
  for (const id of ["qq-adapter", "qq-helper", "mem-owner"]) for (const action of ["config", "disable", "uninstall"]) await assert.rejects(f.api.plan({ action, id, baseHash: f.state.hash, config: { city: "Tokyo" } }), { http: 403, code: "plugin_protected" });
  const d = await f.api.detail("qq-adapter"); assert.equal(d.config.previewable, false);
});

test("previews detect stale edit baselines and missing inputs", async () => {
  const f = fixture();
  await assert.rejects(f.api.plan({ ...f.request({ city: "Tokyo" }), baseHash: "old" }), { http: 409, code: "baseHash_mismatch" });
  await assert.rejects(f.api.plan({ action: "config", id: "weather", config: {} }), { http: 400, code: "bad_request" });
  await assert.rejects(f.api.detail("missing"), { http: 404, code: "plugin_not_found" });
  await assert.rejects(f.api.plan(f.request({})), { http: 400, code: "no_changes" });
});

test("schema validates types, enums, ranges and only declared fields", async () => {
  const f = fixture();
  for (const patch of [{ useCache: "yes" }, { city: "" }, { units: "kelvin" }, { limits: { perDay: -1 } }, { missing: true }, { city: null }]) await assert.rejects(f.api.plan(f.request(patch)), { http: 400, code: "invalid_config" });
  f.state.schema.properties.city.readOnly = true;
  await assert.rejects(f.api.plan(f.request({ city: "Tokyo" })), { http: 403, code: "config_read_only" });
});

test("unsupported schema and structured arrays fail closed without echoing secrets", async () => {
  const f = fixture();
  f.state.schema.properties.accounts = { type: "array", items: { type: "object", properties: { apiKey: { type: "string", sensitive: true } } } };
  await assert.rejects(f.api.plan(f.request({ accounts: [{ apiKey: NEW }] })), e => e.code === "schema_unsupported" && !JSON.stringify(e).includes(NEW));
  f.state.schema.properties.city = { anyOf: [{ type: "string" }, { type: "number" }] };
  await assert.rejects(f.api.plan(f.request({ city: "Tokyo" })), { code: "schema_unsupported" });
});

test("submitted secrets are marked but never returned, exported, or stored in executable plans", async () => {
  const f = fixture(), p = await f.api.plan(f.request({ apiKey: NEW }));
  assert.equal(p.secretChanged, true); assert.equal(p.canApply, false); assert.equal(p.diff[0].secretChanged, true);
  assert.ok(!JSON.stringify(p).includes(NEW)); assert.ok(!JSON.stringify(p).includes(OLD));
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }), { code: "secret_write_required" });
  for (const marker of ["__OPENCLAW_REDACTED__", "••••••（已隐藏）"]) await assert.rejects(f.api.plan(f.request({ apiKey: marker })), { code: "invalid_config" });
});

test("recursive prototype names are rejected before any patch is constructed", async () => {
  const f = fixture();
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const config = JSON.parse(`{"limits":{"${key}":{"polluted":true}}}`);
    await assert.rejects(f.api.plan(f.request(config)), { code: "invalid_config" });
  }
  assert.equal({}.polluted, undefined);
});

test("change sheets have a bounded lifetime, explicit confirmation, and session ownership", async () => {
  const f = fixture(), p = await f.api.plan(f.request({ city: "Tokyo" }), "sid-one");
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash }), { http: 400, code: "confirm_required" });
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }, "sid-two"), { http: 404, code: "plan_not_found" });
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: "wrong", confirm: true }, "sid-one"), { code: "baseHash_mismatch" });
  f.state.now += 1000;
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }, "sid-one"), { http: 410, code: "plan_expired" });
});

test("locally audited immediate configs preserve omitted credentials and revalidate before a write", async () => {
  const f = fixture({ audited: true }); f.state.kind = "none";
  const d = await f.api.detail("weather"); assert.equal(d.config.writable, true);
  const p = await f.api.plan(f.request({ city: "Tokyo" }), "sid-one"); assert.equal(p.canApply, true);
  const r = await f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }, "sid-one"); assert.equal(r.applied, true);
  assert.equal(f.state.cfg.plugins.entries.weather.config.apiKey, OLD); assert.equal(f.state.cfg.plugins.entries.weather.config.city, "Tokyo");
  assert.equal(f.changed(), 1); assert.equal(f.guards.length, 2);
  const write = f.calls.find(c => c.method === "config.patch"); assert.deepEqual(JSON.parse(write.params.raw), { plugins: { entries: { weather: { config: { city: "Tokyo" } } } } });
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }, "sid-one"), { code: "plan_expired" });
});

test("audited configs still reject hot reload, changed runtime surfaces, and quiet windows", async () => {
  const f = fixture({ audited: true }); f.state.kind = "none";
  let p = await f.api.plan(f.request({ city: "Tokyo" })); assert.equal(p.canApply, true);
  f.state.components.commands = ["new-command"];
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }), { code: "maintenance_required" });
  f.state.components.commands = []; f.state.quiet = true;
  await assert.rejects(f.api.apply({ planId: p.planId, baseHash: p.baseHash, confirm: true }), { http: 423, code: "quiet_window" });
  f.state.quiet = false; f.state.kind = "hot"; p = await f.api.plan(f.request({ city: "Tokyo" })); assert.equal(p.canApply, false);
  f.state.kind = "restart"; p = await f.api.plan(f.request({ city: "Tokyo" })); assert.equal(p.blockedCode, "restart_required");
  assert.ok(!f.calls.some(c => c.method === "config.patch"));
});

test("raw upstream errors and failed inspection identities are never passed to the browser", async () => {
  const f = fixture(); f.state.error = "plugins.inspect";
  await assert.rejects(f.api.detail("weather"), e => e.code === "plugin_upstream" && !JSON.stringify({ message: e.message, ...e }).includes(OLD));
  f.state.error = null; f.state.wrongId = "qq-adapter";
  await assert.rejects(f.api.detail("weather"), { code: "plugin_upstream" });
  f.state.error = "plugins.list"; f.state.errorCode = "METHOD_NOT_FOUND";
  await assert.rejects(f.api.list(), { http: 501, code: "not_ready" });
});
