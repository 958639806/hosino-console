import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSecrets } from "../secrets.mjs";

const OLD = "ordinary-old-credential-12345";
const NEW = "ordinary-new-credential-67890";
const fixture = () => {
  const calls = [], entries = new Map([["OLD_KEY", { value: OLD, kind: "secret", updatedAt: "2026-11-03T01:00:00.000Z" }]]);
  let config = { models: { providers: {} } }, raw, failure, changed = 0;
  const api = makeSecrets({
    onChanged: () => changed++,
    call: async (method, params, timeout) => {
      calls.push({ method, params, timeout });
      if (failure?.method === method) throw Object.assign(new Error(failure.message), { code: failure.code });
      if (method === "secrets.store.list") return { entries: [...entries].map(([name, data]) => ({ name, ...data })), value: OLD };
      if (method === "config.get") return { valid: true, config, ...(raw !== undefined ? { raw } : {}) };
      if (method === "secrets.store.set") { entries.set(params.name, { kind: params.kind, value: params.value }); return { ok: true, reloaded: true, value: params.value, warning: params.value + OLD }; }
      if (method === "secrets.store.delete") { entries.delete(params.name); return { ok: true, reloaded: true, value: OLD, warning: OLD }; }
      throw new Error("unexpected RPC " + method);
    },
  });
  return { api, calls, entries, changed: () => changed, config: value => config = value, raw: value => raw = value, fail: value => failure = value };
};

test("secret list returns only validated metadata, never values or arbitrary fields", async () => {
  const f = fixture();
  f.entries.set("ANOTHER_KEY", { value: NEW, kind: "env", updatedAt: NEW, anything: NEW });
  f.entries.set("bad-name", { value: NEW, kind: "env" });
  f.config({ providers: { first: { apiKey: "${OLD_KEY}" } } });
  const result = await f.api.list(), text = JSON.stringify(result);
  assert.deepEqual(result, { secrets: [
    { name: "ANOTHER_KEY", set: true },
    { name: "OLD_KEY", set: true, updatedAt: "2026-11-03T01:00:00.000Z", usedBy: ["providers.first.apiKey"] },
  ] });
  assert.ok(!text.includes(OLD)); assert.ok(!text.includes(NEW));
  assert.deepEqual(f.calls.map(x => x.method), ["secrets.store.list", "config.get"]);
});

test("secret set creates env entries, preserves existing type, and ignores reflected diagnostics", async () => {
  const f = fixture();
  assert.deepEqual(await f.api.set({ name: "NEW_KEY", value: NEW, confirm: true }), { ok: true, name: "NEW_KEY", set: true, reloaded: true });
  assert.deepEqual(f.calls.at(-1), { method: "secrets.store.set", params: { name: "NEW_KEY", value: NEW, kind: "env" }, timeout: 20000 });
  const result = await f.api.set({ name: "OLD_KEY", value: NEW, confirm: true });
  assert.deepEqual(f.calls.at(-1).params, { name: "OLD_KEY", value: NEW, kind: "secret" });
  assert.ok(!JSON.stringify(result).includes(NEW)); assert.ok(!JSON.stringify(result).includes(OLD));
  assert.equal(f.changed(), 2);
  assert.ok(!f.calls.some(x => /reload|restart/.test(x.method)));
});

test("secret validation rejects malformed values and missing confirmation before calling gateway", async () => {
  const f = fixture();
  for (const name of ["a", "lower_case", "1NAME", "A".repeat(129), {}, null]) {
    await assert.rejects(f.api.set({ name, value: NEW, confirm: true }), { http: 400, code: "invalid_name" });
    await assert.rejects(f.api.clear({ name, confirm: true }), { http: 400, code: "invalid_name" });
  }
  for (const value of [undefined, null, 1, {}, [], "", " \n ", "x".repeat(8193)]) await assert.rejects(f.api.set({ name: "NEW_KEY", value, confirm: true }), { http: 400, code: "invalid_value" });
  await assert.rejects(f.api.set({ name: "NEW_KEY", value: NEW }), { http: 400, code: "confirm_required" });
  await assert.rejects(f.api.clear({ name: "OLD_KEY", confirm: "true" }), { http: 400, code: "confirm_required" });
  await assert.rejects(f.api.set([]), { http: 400, code: "bad_request" });
  assert.equal(f.calls.length, 0);
  const value = "x".repeat(8192);
  await f.api.set({ name: "AB", value, confirm: true });
  assert.equal(f.calls.at(-1).params.value.length, 8192);
});

test("secret clear blocks interpolation, nested SecretRefs, and references retained in config raw", async () => {
  for (const config of [
    { plugins: { token: "prefix-${OLD_KEY}-suffix" } },
    { models: { apiKey: { source: "env", provider: "default", id: "OLD_KEY" } } },
    { models: { apiKey: { id: "OLD_KEY", name: "default" } } },
    { auth: [{ secretName: "OLD_KEY" }] },
  ]) {
    const f = fixture(); f.config(config);
    await assert.rejects(f.api.clear({ name: "OLD_KEY", confirm: true }), e => e.http === 409 && e.code === "in_use" && e.body.usedBy.length > 0 && !JSON.stringify(e.body).includes(OLD));
    assert.ok(!f.calls.some(x => x.method === "secrets.store.delete"));
  }
  const f = fixture(); f.raw(JSON.stringify({ token: "${OLD_KEY}" }));
  await assert.rejects(f.api.clear({ name: "OLD_KEY", confirm: true }), { http: 409, code: "in_use" });
});

test("secret clear fails closed on unreadable configuration and no secret is deleted", async () => {
  const f = fixture(); f.fail({ method: "config.get", message: OLD });
  await assert.rejects(f.api.clear({ name: "OLD_KEY", confirm: true }), e => e.http === 502 && e.code === "secret_upstream" && !JSON.stringify({ message: e.message, ...e }).includes(OLD));
  assert.ok(!f.calls.some(x => x.method === "secrets.store.delete"));
  // Replacement remains possible if config inspection is unavailable.
  await f.api.set({ name: "OLD_KEY", value: NEW, confirm: true });
});

test("secret clear deletes only an unreferenced named entry and never returns its old value", async () => {
  const f = fixture();
  assert.deepEqual(await f.api.clear({ name: "OLD_KEY", confirm: true }), { ok: true, name: "OLD_KEY", set: false, reloaded: true });
  assert.deepEqual(f.calls.at(-1), { method: "secrets.store.delete", params: { name: "OLD_KEY" }, timeout: 20000 });
  assert.equal(f.changed(), 1);
  await assert.rejects(f.api.clear({ name: "OLD_KEY", confirm: true }), { http: 404, code: "not_found" });
});

test("gateway rejection always uses a fixed safe message even for ordinary secret formats", async () => {
  const f = fixture();
  for (const method of ["secrets.store.list", "secrets.store.set", "secrets.store.delete"]) {
    f.fail({ method, message: `raw ${NEW} old ${OLD} quoted ${JSON.stringify(NEW)}` });
    const action = method === "secrets.store.list" ? () => f.api.list() : method === "secrets.store.set" ? () => f.api.set({ name: "OLD_KEY", value: NEW, confirm: true }) : () => f.api.clear({ name: "OLD_KEY", confirm: true });
    await assert.rejects(action(), e => e.http === 502 && e.code === "secret_upstream" && !JSON.stringify({ message: e.message, ...e }).includes(NEW) && !e.message.includes(OLD));
  }
  f.fail({ method: "secrets.store.list", code: "METHOD_NOT_FOUND", message: NEW });
  await assert.rejects(f.api.list(), { http: 501, code: "not_ready" });
  assert.equal(f.changed(), 0);
});

test("secret mutations are ordered so an overlapping replacement cannot recreate a just-cleared name", async () => {
  let release;
  const gate = new Promise(resolve => release = resolve), calls = [];
  const api = makeSecrets({ call: async (method, params) => {
    calls.push(method);
    if (method === "secrets.store.list") return { entries: [{ name: "OLD_KEY", kind: "env" }] };
    if (method === "secrets.store.set") { await gate; return {}; }
    if (method === "config.get") return { config: {} };
    if (method === "secrets.store.delete") return {};
  } });
  const set = api.set({ name: "OLD_KEY", value: NEW, confirm: true });
  const clear = api.clear({ name: "OLD_KEY", confirm: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["secrets.store.list", "secrets.store.set"]);
  release(); await Promise.all([set, clear]);
  assert.deepEqual(calls, ["secrets.store.list", "secrets.store.set", "secrets.store.list", "config.get", "secrets.store.delete"]);
});

test("existing gateway-legal names remain visible and editable while new names keep the console policy", async () => {
  const f = fixture(), long = "A".repeat(128);
  f.entries.set("A", { kind: "env", value: OLD }); f.entries.set(long, { kind: "secret", value: OLD });
  const names = (await f.api.list()).secrets.map(entry => entry.name);
  assert.ok(names.includes("A")); assert.ok(names.includes(long));
  await f.api.set({ name: "A", value: NEW, confirm: true });
  await f.api.set({ name: long, value: NEW, confirm: true });
  await f.api.clear({ name: long, confirm: true });
  await assert.rejects(f.api.set({ name: "B", value: NEW, confirm: true }), { code: "invalid_name" });
  await assert.rejects(f.api.set({ name: "B".repeat(65), value: NEW, confirm: true }), { code: "invalid_name" });
  f.config({ token: "${A}" });
  await assert.rejects(f.api.clear({ name: "A", confirm: true }), { code: "in_use" });
});

test("implicit MiMo credentials cannot be cleared and unconfirmed runtime refresh gets a safe warning", async () => {
  const f = fixture();
  f.entries.set("XIAOMI_MIMO_API_KEY", { kind: "env", value: OLD });
  f.config({ models: { providers: { "xiaomi-token-plan": { models: [{ id: "mimo" }] } } } });
  await assert.rejects(f.api.clear({ name: "XIAOMI_MIMO_API_KEY", confirm: true }), { code: "in_use" });
  const api = makeSecrets({ call: async method => method === "secrets.store.list" ? { entries: [] } : { ok: true, reloaded: false, warning: NEW } });
  const saved = await api.set({ name: "NEW_KEY", value: NEW, confirm: true });
  assert.equal(saved.reloaded, false); assert.ok(saved.warning); assert.ok(!JSON.stringify(saved).includes(NEW));
});
