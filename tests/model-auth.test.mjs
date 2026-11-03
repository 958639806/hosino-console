import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModelAuth } from "../model-auth.mjs";

const OWNER = "session-owner-aaaaaaaaaaaaaaaa", OTHER = "session-other-bbbbbbbbbbbbbbbb";
const PRIVATE = "unusual-credential-value-abcdefgh";
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
const status = () => ({
  providers: [{ provider: "demo", authProvider: "demo-auth", profiles: [{ profileId: "demo:one" }, { profileId: "demo:two" }], profileOrder: ["demo:two", "demo:one"] }],
  providerCapabilities: [{ provider: "demo-auth", loginOptions: [{ id: "plugin/demo-oauth", label: "Demo OAuth", kind: "oauth" }, { id: "plugin/demo-device", label: "Demo device", kind: "device-code" }, { id: "plugin/demo-key", label: "API key", kind: "secret" }] }],
});
const fixture = (options = {}) => {
  let auth = status(), next = [], cancelStatus = "cancelled", time = 100000, failure, changed = 0, quiet = false;
  const calls = [];
  const api = makeModelAuth({ now: () => time, ttlMs: options.ttlMs || 900000, maxSessions: options.maxSessions || 32,
    quietGuard: () => { if (quiet) throw Object.assign(new Error("静默窗口"), { http: 423, code: "quiet_window" }); },
    onChanged: () => changed++,
    call: async (method, params, timeout) => {
      calls.push({ method, params, timeout });
      if (failure?.method === method) throw Object.assign(new Error(failure.message), { code: failure.code });
      if (method === "models.authStatus") return auth;
      if (method === "models.authLogin") return { sessionId: params.sessionId, done: false, status: "running" };
      if (method === "wizard.next") return next.length ? await next.shift()(params) : new Promise(() => {});
      if (method === "wizard.cancel") return { status: cancelStatus };
      if (method === "models.authOrderSet") return { provider: params.provider, profileIds: params.profileIds, warning: PRIVATE };
      throw new Error("unexpected method " + method);
    },
  });
  return { api, calls, auth: value => auth = value, push: value => next.push(typeof value === "function" ? value : () => value), cancelStatus: value => cancelStatus = value,
    now: value => time = value, quiet: value => quiet = value, fail: value => failure = value, changed: () => changed };
};
const begin = f => f.api.start({ provider: "demo", method: "plugin/demo-oauth", confirm: true }, OWNER);

test("describe derives only official login options, profileId ordering, aliases, and locks", () => {
  const f = fixture(), auth = status();
  assert.deepEqual(f.api.describe(auth, "demo"), {
    capabilities: { login: true, order: true },
    loginMethods: [{ id: "plugin/demo-oauth", label: "Demo OAuth", kind: "oauth" }, { id: "plugin/demo-device", label: "Demo device", kind: "device-code" }],
    profiles: ["demo:two", "demo:one"], orderLocked: false, authProvider: "demo-auth",
  });
  auth.providers[0].profileOrderLocked = "provider-config";
  assert.equal(f.api.describe(auth, "demo").capabilities.order, false);
  assert.equal(f.api.describe(auth, "demo").orderLocked, true);
  assert.equal(f.api.describe(null, "missing").capabilities.login, false);
});

test("login uses client-generated sessionId plus authChoice and returns an owner-bound local poll id", async () => {
  const f = fixture(), started = await begin(f);
  assert.equal(started.state, "pending"); assert.match(started.pollId, /^[a-f0-9]{48}$/);
  const call = f.calls.at(-1);
  assert.equal(call.method, "models.authLogin");
  assert.equal(call.params.authChoice, "plugin/demo-oauth");
  assert.match(call.params.sessionId, /^[a-f0-9-]{36}$/);
  assert.equal(call.params.provider, undefined); assert.equal(call.params.method, undefined);
  assert.throws(() => f.api.poll(started.pollId, OTHER), { http: 404, code: "not_found" });
  await assert.rejects(f.api.cancel(started.pollId, { confirm: true }, OTHER), { http: 404 });
  assert.throws(() => f.api.poll(started.pollId, ""), { http: 401 });
  assert.ok(!JSON.stringify(started).includes(OWNER));
  await f.api.cancel(started.pollId, { confirm: true }, OWNER);
});

test("wizard steps require explicit user answers, preserve option value types, and scrub submitted callback text", async () => {
  const f = fixture(), started = await begin(f), id = started.pollId;
  f.push({ status: "running", done: false, step: { id: "note1", type: "note", title: "Read this", message: "Complete authorization", externalUrl: "https://example.invalid/oauth?state=random", executor: "client" } });
  f.api.poll(id, OWNER); await flush();
  let result = f.api.poll(id, OWNER);
  assert.equal(result.step.requiresAnswer, true); assert.equal(result.url, "https://example.invalid/oauth?state=random");
  const count = f.calls.length; f.api.poll(id, OWNER); assert.equal(f.calls.length, count, "poll cannot auto-ack a note");
  f.push({ status: "running", done: false, step: { id: "choose", type: "select", options: [{ value: 7, label: "Seven" }, { value: { ref: "model/one" }, label: "Model" }] } });
  f.api.answer(id, { stepId: "note1", confirm: true }, OWNER); await flush();
  assert.deepEqual(f.calls.at(-1).params.answer, { stepId: "note1" });
  assert.throws(() => f.api.answer(id, { stepId: "note1", confirm: true }, OWNER), { code: "step_changed" });
  assert.throws(() => f.api.answer(id, { stepId: "choose", value: "7", confirm: true }, OWNER), { code: "invalid_value" });
  f.push({ status: "running", done: false, step: { id: "callback", type: "text", sensitive: true, initialValue: PRIVATE } });
  const option = f.api.poll(id, OWNER).step.options[1].value;
  assert.equal(typeof option, "string"); assert.ok(option.startsWith("option-"));
  f.api.answer(id, { stepId: "choose", value: option, confirm: true }, OWNER); await flush();
  assert.deepEqual(f.calls.at(-1).params.answer.value, { ref: "model/one" });
  assert.equal(f.api.poll(id, OWNER).step.initialValue, undefined);
  f.push({ status: "running", done: false, step: { id: "confirm", type: "confirm", message: `Echo ${PRIVATE} key=sk-testing123456` } });
  f.api.answer(id, { stepId: "callback", value: PRIVATE, confirm: true }, OWNER); await flush();
  result = f.api.poll(id, OWNER); assert.ok(!JSON.stringify(result).includes(PRIVATE)); assert.ok(!JSON.stringify(result).includes("sk-testing123456"));
  assert.throws(() => f.api.answer(id, { stepId: "confirm", value: "true", confirm: true }, OWNER), { code: "invalid_value" });
  f.push({ status: "done", done: true });
  f.api.answer(id, { stepId: "confirm", value: false, confirm: true }, OWNER); await flush();
  assert.equal(f.calls.at(-1).params.answer.value, false, "a rejection is forwarded rather than replaced by approval");
  assert.equal(f.api.poll(id, OWNER).state, "done"); assert.equal(f.changed(), 1);
});

test("progress long polls are deduplicated and device codes arrive through official presentation fields", async () => {
  const f = fixture(), started = await begin(f), id = started.pollId;
  let release;
  f.push(() => new Promise(resolve => release = resolve));
  for (let i = 0; i < 10; i++) f.api.poll(id, OWNER);
  assert.equal(f.calls.filter(c => c.method === "wizard.next").length, 1);
  release({ status: "running", done: false, step: { id: "device1", type: "progress", message: "Waiting", externalUrl: "https://example.invalid/device", deviceCode: { code: "ABCD-EFGH", expiresInMinutes: 10 }, executor: "gateway" } });
  await flush();
  const shown = f.api.poll(id, OWNER);
  assert.equal(shown.flow, "device"); assert.equal(shown.userCode, "ABCD-EFGH"); assert.equal(shown.step.requiresAnswer, false);
  assert.equal(f.calls.filter(c => c.method === "wizard.next").length, 2);
  assert.throws(() => f.api.answer(id, { stepId: "device1", confirm: true }, OWNER), { code: "step_changed" });
  await f.api.cancel(id, { confirm: true }, OWNER);
});

test("quiet windows pause wizard advancement and answers while cancellation remains available", async () => {
  const f = fixture(), started = await begin(f), id = started.pollId;
  f.quiet(true);
  assert.throws(() => f.api.poll(id, OWNER), { http: 423, code: "quiet_window" });
  assert.equal(f.calls.filter(c => c.method === "wizard.next").length, 0);
  const cancelled = await f.api.cancel(id, { confirm: true }, OWNER);
  assert.equal(cancelled.state, "cancelled");
  await assert.rejects(begin(f), { http: 423, code: "quiet_window" });
});

test("cancellation reflects the real gateway outcome, including a locked commit that is still running", async () => {
  const f = fixture(), started = await begin(f), id = started.pollId;
  f.cancelStatus("running");
  const pending = await f.api.cancel(id, { confirm: true }, OWNER);
  assert.equal(pending.state, "pending"); assert.ok(pending.warning);
  await assert.rejects(begin(f), { http: 429, code: "auth_busy" });
  f.cancelStatus("done");
  assert.equal((await f.api.cancel(id, { confirm: true }, OWNER)).state, "done");
  assert.equal(f.changed(), 1);
  await assert.rejects(f.api.cancel(id, {}, OWNER), { code: "confirm_required" });
});

test("expiry and logout close only the owning session and best-effort cancel the actual gateway wizard", async () => {
  const f = fixture({ ttlMs: 100 }), started = await begin(f), id = started.pollId;
  f.api.closeOwner(OTHER); assert.equal(f.calls.filter(c => c.method === "wizard.cancel").length, 0);
  f.now(100101);
  assert.throws(() => f.api.poll(id, OWNER), { http: 404, code: "not_found" }); await flush();
  assert.equal(f.calls.filter(c => c.method === "wizard.cancel").length, 1);
  const next = await begin(f); f.api.closeOwner(OWNER); await flush();
  assert.throws(() => f.api.poll(next.pollId, OWNER), { http: 404 });
  assert.equal(f.calls.filter(c => c.method === "wizard.cancel").length, 2);
});

test("ordering requires the complete current same-provider set and honors configuration locks", async () => {
  const f = fixture();
  await assert.rejects(f.api.order({ provider: "demo", profileIds: ["demo:one"], confirm: true }), { http: 409, code: "baseHash_mismatch" });
  await assert.rejects(f.api.order({ provider: "demo", profileIds: ["demo:one", "other:two"], confirm: true }), { http: 409 });
  await assert.rejects(f.api.order({ provider: "demo", profileIds: ["demo:one", "demo:one"], confirm: true }), { http: 400 });
  const auth = status(); auth.providers[0].profileOrderLocked = "auth-config"; f.auth(auth);
  await assert.rejects(f.api.order({ provider: "demo", profileIds: ["demo:one", "demo:two"], confirm: true }), { http: 409, code: "order_locked" });
  assert.equal(f.calls.filter(c => c.method === "models.authOrderSet").length, 0);
  f.auth(status());
  const result = await f.api.order({ provider: "demo", profileIds: ["demo:one", "demo:two"], confirm: true });
  assert.deepEqual(f.calls.at(-1).params, { provider: "demo", profileIds: ["demo:one", "demo:two"] });
  assert.ok(!JSON.stringify(result).includes(PRIVATE)); assert.equal(f.changed(), 1);
});

test("unsupported login choices, unsafe URLs, and gateway errors do not become executable links or secret messages", async () => {
  const f = fixture();
  await assert.rejects(f.api.start({ provider: "demo", method: "plugin/demo-key", confirm: true }, OWNER), { http: 409, code: "login_unavailable" });
  await assert.rejects(f.api.start({ provider: "demo", method: "plugin/demo-oauth" }, OWNER), { http: 400, code: "confirm_required" });
  const started = await begin(f);
  f.push({ status: "running", done: false, step: { id: "bad-url", type: "note", externalUrl: "javascript:alert(1)", message: "Continue" } });
  f.api.poll(started.pollId, OWNER); await flush();
  assert.equal(f.api.poll(started.pollId, OWNER).url, undefined);
  assert.equal(f.api.poll(started.pollId, OWNER).step.externalUrl, undefined);
  await f.api.cancel(started.pollId, { confirm: true }, OWNER);
  f.fail({ method: "models.authLogin", message: PRIVATE });
  await assert.rejects(begin(f), e => e.http === 502 && !JSON.stringify({ message: e.message, ...e }).includes(PRIVATE));
  await flush();
  f.fail({ method: "models.authStatus", code: "METHOD_NOT_FOUND", message: PRIVATE });
  await assert.rejects(begin(f), { http: 501, code: "not_ready" });
});

test("encoded submitted credentials and secret-bearing option objects never leave the server", async () => {
  const f = fixture(), started = await begin(f), id = started.pollId;
  f.push({ status: "running", done: false, step: { id: "secret", type: "text", sensitive: true } });
  f.api.poll(id, OWNER); await flush();
  const encoded = [Buffer.from(PRIVATE).toString("base64"), Buffer.from(PRIVATE).toString("base64url"), PRIVATE.split("").map(char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")).join("")];
  f.push({ status: "running", done: false, step: { id: "choices", type: "select", message: encoded.join(" "), externalUrl: "https://example.invalid/?token=" + PRIVATE,
    options: [{ value: { access_token: PRIVATE }, label: "A safe label" }, { value: "other", label: "Other" }] } });
  f.api.answer(id, { stepId: "secret", value: PRIVATE, confirm: true }, OWNER); await flush();
  const result = f.api.poll(id, OWNER), text = JSON.stringify(result);
  assert.ok(!text.includes(PRIVATE)); for (const secret of encoded) assert.ok(!text.includes(secret));
  assert.equal(result.url, undefined); assert.equal(result.step.externalUrl, undefined);
  const token = result.step.options[0].value;
  f.push({ done: true, status: "done" });
  f.api.answer(id, { stepId: "choices", value: token, confirm: true }, OWNER); await flush();
  assert.deepEqual(f.calls.at(-1).params.answer.value, { access_token: PRIVATE }, "only the gateway receives its original option value");
});

test("pending login is cancelled by its TTL timer even when the browser sends no further requests", async () => {
  const f = fixture({ ttlMs: 20 }); await begin(f);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(f.calls.filter(call => call.method === "wizard.cancel").length, 1);
});

test("login and order recheck the quiet window after awaiting fresh auth metadata", async () => {
  for (const action of ["login", "order"]) {
    let release, quiet = false; const calls = [], ready = new Promise(resolve => release = resolve);
    const api = makeModelAuth({ quietGuard: () => { if (quiet) throw Object.assign(new Error("quiet"), { http: 423, code: "quiet_window" }); },
      call: async (method, params) => { calls.push(method); if (method === "models.authStatus") return ready; return { sessionId: params.sessionId, done: false, status: "running" }; } });
    const pending = action === "login" ? api.start({ provider: "demo", method: "plugin/demo-oauth", confirm: true }, OWNER) : api.order({ provider: "demo", profileIds: ["demo:one", "demo:two"], confirm: true });
    await flush(); quiet = true; release(status());
    await assert.rejects(pending, { http: 423, code: "quiet_window" });
    assert.deepEqual(calls, ["models.authStatus"]);
  }
});

test("logout during either login admission or the start RPC cannot revive an owner-bound flow", async () => {
  for (const phase of ["models.authStatus", "models.authLogin"]) {
    let release; const gate = new Promise(resolve => release = resolve), calls = [];
    const api = makeModelAuth({ call: async (method, params) => {
      calls.push(method);
      if (method === phase) await gate;
      if (method === "models.authStatus") return status();
      if (method === "models.authLogin") return { sessionId: params.sessionId, done: false, status: "running" };
      if (method === "wizard.cancel") return { status: "cancelled" };
    } });
    const start = api.start({ provider: "demo", method: "plugin/demo-oauth", confirm: true }, OWNER);
    await flush(); api.closeOwner(OWNER); release();
    await assert.rejects(start, { http: 404, code: "not_found" }); await flush();
    if (phase === "models.authStatus") assert.ok(!calls.includes("models.authLogin"));
    else assert.ok(calls.includes("wizard.cancel"));
  }
});

test("a quiet-window boundary at answer dispatch preserves the current user input step", async () => {
  let boundary = false, quiet = false; const steps = [{ done: false, status: "running", step: { id: "confirm", type: "confirm", message: "Allow?" } }];
  const api = makeModelAuth({ quietGuard: ep => {
    if (quiet) throw Object.assign(new Error("quiet"), { http: 423, code: "quiet_window" });
    if (boundary && ep === "models.auth.login.answer") quiet = true;
  }, call: async (method, params) => {
    if (method === "models.authStatus") return status();
    if (method === "models.authLogin") return { sessionId: params.sessionId, done: false, status: "running" };
    if (method === "wizard.next") return steps.shift();
    if (method === "wizard.cancel") return { status: "cancelled" };
  } });
  const started = await api.start({ provider: "demo", method: "plugin/demo-oauth", confirm: true }, OWNER);
  api.poll(started.pollId, OWNER); await flush(); boundary = true;
  assert.throws(() => api.answer(started.pollId, { stepId: "confirm", value: true, confirm: true }, OWNER), { http: 423 });
  const preserved = api.poll(started.pollId, OWNER);
  assert.equal(preserved.state, "pending"); assert.equal(preserved.step.id, "confirm");
  await api.cancel(started.pollId, { confirm: true }, OWNER);
});
