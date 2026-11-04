import { test } from "node:test";
import assert from "node:assert/strict";
import { makeAllowlist } from "../allowlist.mjs";

const clone = v => JSON.parse(JSON.stringify(v));
const FAKE_SECRET = "ordinary-private-value-for-test";
const initial = () => ({
  gateway: { auth: { token: FAKE_SECRET }, controlUi: { allowedOrigins: ["https://example.test"] } },
  plugins: { entries: { private: { allowFrom: [FAKE_SECRET] } } },
  channels: {
    qqbot: { allowFrom: ["owner-id"], groupAllowFrom: ["group-a"], accounts: { secondary: { allowFrom: ["secondary-owner"] } } },
    telegram: { allowFrom: [123, -456], groupAllowFrom: [123, "*"] }
  },
  tools: { allow: ["group:fs"], deny: ["exec"] },
  commands: { allowFrom: { qqbot: ["owner-id"] } }
});
const leaves = (a, b, path = "", out = []) => {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leaves(a[k], b[k], path ? path + "." + k : k, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
};
function fixture() {
  const s = { cfg: initial(), rev: 1, calls: [], kinds: {}, schemas: {}, quiet: 0, invalid: false, noHash: false, lookupFail: false, applied: 0, beforePatch: null, patchFailure: null };
  const call = async (method, params) => {
    s.calls.push({ method, params: clone(params) });
    if (method === "config.get") return { config: clone(s.cfg), valid: !s.invalid, ...(!s.noHash ? { hash: "h" + s.rev } : {}), pendingRestart: s.pendingRestart };
    if (method === "config.schema.lookup") {
      if (s.lookupFail) throw new Error("lookup unavailable " + FAKE_SECRET);
      return { reloadKind: s.kinds[params.path], ...(s.schemas[params.path] ? { schema: clone(s.schemas[params.path]) } : {}) };
    }
    if (method === "config.patch") {
      if (s.beforePatch) await s.beforePatch();
      if (s.patchFailure) throw new Error(s.patchFailure);
      if (params.baseHash !== "h" + s.rev) throw new Error("config base hash changed");
      const patch = JSON.parse(params.raw);
      const merge = (to, value) => { for (const [k, v] of Object.entries(value)) { if (v && typeof v === "object" && !Array.isArray(v)) merge(to[k] ??= {}, v); else to[k] = v; } };
      merge(s.cfg, patch); s.rev++;
      return { ok: true, ...(s.patchResult || {}) };
    }
    throw new Error("unexpected call " + method);
  };
  const reloadPlan = async (src, next) => {
    const paths = [];
    for (const path of leaves(src, next)) {
      const lookup = await call("config.schema.lookup", { path }).catch(() => null);
      const kind = lookup?.reloadKind === "restart" ? "restart" : "hot";
      paths.push({ path, kind, label: kind === "restart" ? "restart" : "reload" });
    }
    if (s.quietAfterPlan) s.quiet = s.quietAfterPlan;
    return { paths, restartRequired: paths.some(p => p.kind === "restart") };
  };
  const editor = makeAllowlist({ call, reloadPlan, quietLeftMs: () => s.quiet, onApplied: () => { s.applied++; } });
  const writes = () => s.calls.filter(c => c.method === "config.patch");
  const body = (path = "channels.qqbot.allowFrom", items = ["owner-id", "new-id"]) => ({ baseHash: "h" + s.rev, changes: [{ path, items }] });
  return { s, editor, writes, body };
}
const rejects = (promise, http, code) => assert.rejects(promise, e => { assert.equal(e.http, http); assert.equal(e.code, code); return true; });

test("allowlist read exposes only existing registered lists and no credentials", async () => {
  const { s, editor, writes } = fixture();
  const r = await editor.read();
  assert.equal(r.baseHash, "h1");
  assert.deepEqual(r.lists.map(x => x.path), ["channels.qqbot.allowFrom", "channels.qqbot.groupAllowFrom", "channels.qqbot.accounts.secondary.allowFrom", "channels.telegram.allowFrom", "channels.telegram.groupAllowFrom", "tools.allow", "tools.deny"]);
  assert.deepEqual(r.lists.find(x => x.path === "channels.telegram.allowFrom").items, ["123", "-456"]);
  assert.match(r.lists.find(x => x.path === "tools.deny").label, /禁止/);
  assert.ok(!JSON.stringify(r).includes(FAKE_SECRET));
  assert.ok(r.lists.every(x => x.apply === "reload"));
  assert.equal(writes().length, 0);
  assert.ok(s.calls.every(x => ["config.get", "config.schema.lookup"].includes(x.method)));
});

test("preview returns precise diffs without writing; apply uses atomic hash and array replacement", async () => {
  const { s, editor, writes, body } = fixture();
  const b = body(), before = clone(s.cfg);
  const p = await editor.preview(b);
  assert.equal(p.dryRun, true); assert.equal(p.apply, "reload"); assert.equal(p.blockedWindow, false);
  assert.deepEqual(p.diff, [{ path: "channels.qqbot.allowFrom", before: ["owner-id"], after: ["owner-id", "new-id"], apply: "reload" }]);
  assert.deepEqual(s.cfg, before); assert.equal(writes().length, 0);
  await rejects(editor.apply(b), 400, "confirm_required");
  const a = await editor.apply({ ...b, confirm: true });
  assert.equal(a.changed, true); assert.equal(a.pendingRestart, false); assert.equal(s.applied, 1);
  assert.deepEqual(s.cfg.channels.qqbot.allowFrom, ["owner-id", "new-id"]);
  assert.equal(s.cfg.gateway.auth.token, FAKE_SECRET);
  assert.deepEqual(writes()[0].params, { raw: '{"channels":{"qqbot":{"allowFrom":["owner-id","new-id"]}}}', baseHash: "h1", replacePaths: ["channels.qqbot.allowFrom"], note: "hosino-console: permission lists" });
  assert.ok(!JSON.stringify(a).includes(FAKE_SECRET));
});

test("version changes before preview/apply are rejected without writes", async () => {
  const { s, editor, writes, body } = fixture(); const b = body();
  await editor.preview(b); s.rev++;
  await rejects(editor.preview(b), 409, "baseHash_mismatch");
  await rejects(editor.apply({ ...b, confirm: true }), 409, "baseHash_mismatch");
  assert.equal(writes().length, 0); assert.equal(s.applied, 0);
});

test("a hash race at config.patch cannot overwrite an intervening writer", async () => {
  const { s, editor, body } = fixture(); const b = body();
  s.beforePatch = async () => { s.rev++; s.cfg.channels.qqbot.allowFrom = ["external-owner"]; };
  await rejects(editor.apply({ ...b, confirm: true }), 409, "baseHash_mismatch");
  assert.deepEqual(s.cfg.channels.qqbot.allowFrom, ["external-owner"]); assert.equal(s.applied, 0);
});

test("two concurrent applies of one revision allow only one committed write", async () => {
  const { s, editor, body } = fixture(); let arrivals = 0, release;
  const barrier = new Promise(r => { release = r; });
  s.beforePatch = async () => { if (++arrivals === 2) release(); await barrier; };
  const b = body();
  const results = await Promise.allSettled([editor.apply({ ...b, confirm: true }), editor.apply({ ...b, confirm: true })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "baseHash_mismatch");
  assert.equal(s.rev, 2); assert.equal(s.applied, 1);
});

test("restart changes can be previewed but not committed, including policy changes after preview", async () => {
  const { s, editor, writes, body } = fixture(); const b = body();
  await editor.preview(b); s.kinds["channels.qqbot.allowFrom"] = "restart";
  const p = await editor.preview(b); assert.equal(p.apply, "restart"); assert.equal(p.diff[0].apply, "restart");
  await rejects(editor.apply({ ...b, confirm: true }), 409, "restart_required");
  assert.equal(writes().length, 0);
});

test("quiet window permits read and preview but rejects apply", async () => {
  const { s, editor, writes, body } = fixture(); s.quiet = 2000;
  assert.equal((await editor.read()).baseHash, "h1");
  const p = await editor.preview(body()); assert.equal(p.blockedWindow, true); assert.equal(p.retryAfterMs, 2000);
  await rejects(editor.apply({ ...body(), confirm: true }), 423, "quiet_window");
  assert.equal(writes().length, 0);
});

test("crossing into quiet window during config/schema reads still prevents commit", async () => {
  const { s, editor, writes, body } = fixture(); s.quietAfterPlan = 1000;
  await rejects(editor.apply({ ...body(), confirm: true }), 423, "quiet_window");
  assert.equal(writes().length, 0);
});

test("unregistered, missing, prototype and ambiguous paths are rejected", async () => {
  const { s, editor, writes, body } = fixture();
  s.cfg.channels.qqbot.accounts.constructor = { allowFrom: ["bad"] };
  s.cfg.channels["dot.channel"] = { allowFrom: ["bad"] };
  s.cfg.channels.qqbot.accounts["__proto__"] = { allowFrom: ["bad"] };
  const r = await editor.read(); assert.ok(r.lists.every(x => !/constructor|__proto__|dot.channel/.test(x.path)));
  for (const path of ["gateway.controlUi.allowedOrigins", "plugins.entries.private.allowFrom", "commands.allowFrom.qqbot", "channels.qqbot.accounts.new.allowFrom", "channels.qqbot.new.allowFrom", "channels.qqbot.__proto__.allowFrom", "tools.allow.extra"]) await rejects(editor.preview(body(path, ["safe"])), 403, "not_whitelisted");
  assert.equal(writes().length, 0); assert.equal({}.polluted, undefined);
});

test("invalid requests, duplicate paths/items and malformed values never reach config.patch", async () => {
  const { editor, writes, body } = fixture();
  for (const b of [null, {}, { baseHash: "h1", changes: [] }, { ...body(), changes: Array(21).fill(body().changes[0]) }, { ...body(), changes: [null] }, { ...body(), changes: [body().changes[0], body().changes[0]] }]) await rejects(editor.preview(b), 400, "bad_request");
  for (const items of [null, "owner", ["same", "same"], [""], [" spaced"], ["line\nbreak"], ["a b"], ["x".repeat(257)], [12], [{}], Array(1001).fill("owner")]) await rejects(editor.preview(body("channels.qqbot.allowFrom", items)), 400, "invalid_value");
  assert.equal(writes().length, 0);
});

test("existing safe integers preserve numeric type and mixed entries retain their original type", async () => {
  const { s, editor, body } = fixture();
  await editor.apply({ ...body("channels.telegram.allowFrom", ["-456", "789"]), confirm: true });
  assert.deepEqual(s.cfg.channels.telegram.allowFrom, [-456, 789]);
  await editor.apply({ ...body("channels.telegram.groupAllowFrom", ["123", "*", "new-id"]), confirm: true });
  assert.deepEqual(s.cfg.channels.telegram.groupAllowFrom, [123, "*", "new-id"]);
  for (const value of ["01", "1.2", "9007199254740992", "-0", "+5"]) await rejects(editor.preview(body("channels.telegram.allowFrom", [value])), 400, "invalid_value");
});

test("schema/item incompatibility and unsafe existing values are not exposed for editing", async () => {
  const { s, editor, body } = fixture();
  s.cfg.channels.qqbot.groupAllowFrom = [123, "123"];
  s.cfg.channels.qqbot.accounts.secondary.allowFrom = [{ token: FAKE_SECRET }];
  s.schemas["channels.qqbot.allowFrom"] = { type: "array", items: { type: "integer" } };
  s.schemas["tools.allow"] = { type: "object" };
  s.schemas["tools.deny"] = { type: "array", items: { type: "object" } };
  const r = await editor.read();
  assert.deepEqual(r.lists.map(x => x.path), ["channels.telegram.allowFrom", "channels.telegram.groupAllowFrom"]);
  for (const path of ["channels.qqbot.allowFrom", "channels.qqbot.groupAllowFrom", "tools.allow", "tools.deny"]) await rejects(editor.preview(body(path, ["new-id"])), 403, "not_whitelisted");
  assert.ok(!JSON.stringify(r).includes(FAKE_SECRET));
});

test("empty array with integer schema accepts only integer input", async () => {
  const { s, editor, body } = fixture(); s.cfg.channels.telegram.allowFrom = [];
  s.schemas["channels.telegram.allowFrom"] = { type: "array", items: { type: "integer" } };
  assert.equal((await editor.read()).lists.find(x => x.path === "channels.telegram.allowFrom").itemType, "integer");
  await rejects(editor.preview(body("channels.telegram.allowFrom", ["abc"])), 400, "invalid_value");
  await editor.apply({ ...body("channels.telegram.allowFrom", ["789"]), confirm: true });
  assert.deepEqual(s.cfg.channels.telegram.allowFrom, [789]);
});

test("lookup failure uses registered existing values and local hot baseline only", async () => {
  const { s, editor, body } = fixture(); s.lookupFail = true;
  assert.equal((await editor.read()).lists.length, 7);
  assert.equal((await editor.preview(body())).apply, "reload");
  await rejects(editor.preview(body("channels.qqbot.accounts.new.allowFrom", ["x"])), 403, "not_whitelisted");
});

test("no-op apply writes nothing and retains version", async () => {
  const { s, editor, writes, body } = fixture();
  const p = await editor.preview(body("tools.allow", ["group:fs"])); assert.deepEqual(p.diff, []); assert.equal(p.apply, "immediate");
  const r = await editor.apply({ ...body("tools.allow", ["group:fs"]), confirm: true });
  assert.equal(r.changed, false); assert.equal(r.baseHash, "h1"); assert.equal(s.applied, 0); assert.equal(writes().length, 0);
});

test("missing hash and invalid config fail closed", async () => {
  const { s, editor, writes, body } = fixture(); s.noHash = true;
  await rejects(editor.read(), 502, "upstream"); await rejects(editor.apply({ ...body(), confirm: true }), 502, "upstream");
  s.noHash = false; s.invalid = true; await rejects(editor.read(), 409, "config_invalid");
  assert.equal(writes().length, 0);
});

test("upstream failures never relay raw credential-bearing messages", async () => {
  const { s, editor, body } = fixture(); s.patchFailure = "opaque failure: " + FAKE_SECRET;
  await assert.rejects(editor.apply({ ...body(), confirm: true }), e => { assert.equal(e.http, 502); assert.ok(!JSON.stringify({ error: e.message, body: e.body }).includes(FAKE_SECRET)); return true; });
  assert.equal(s.applied, 0);
});

test("a transport-success response with ok:false is never reported as saved", async () => {
  const { s, editor, body } = fixture(); s.patchResult = { ok: false, message: FAKE_SECRET };
  await assert.rejects(editor.apply({ ...body(), confirm: true }), e => { assert.equal(e.http, 502); assert.ok(!e.message.includes(FAKE_SECRET)); return true; });
  assert.equal(s.applied, 0);
});

test("unexpected pending restart is surfaced without exposing upstream response", async () => {
  const { s, editor, body } = fixture(); s.patchResult = { restart: { scheduled: true }, secret: FAKE_SECRET };
  const r = await editor.apply({ ...body(), confirm: true });
  assert.equal(r.pendingRestart, true); assert.match(r.warning, /重启/); assert.ok(!JSON.stringify(r).includes(FAKE_SECRET));
});
