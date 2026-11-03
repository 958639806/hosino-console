// Real backend and shipped assets with local fake gateway/Qdrant/embedding services.
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import http from "node:http"; import https from "node:https"; import net from "node:net"; import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process"; import { once } from "node:events"; import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import runtime from "./helpers/runtime.cjs";
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.HOSINO_REPO || W; const rq = createRequire(path.join(REPO, "package.json"));
const bcrypt = rq("bcryptjs"), WS = rq("ws");
const FAKE = "sk-FAKEPLUGINSECRET1234567890", EMBKEY = "sk-FAKEEMB0000000000", STOREKEY = "sk-FAKESTORE0000000000";
const PUB = process.env.PUBLIC_DIR || path.join(W, "public");
const version = JSON.parse(fs.readFileSync(path.join(W, "package.json"), "utf8")).version;

async function gateway(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gwc-"));
  let srv, wss;
  t.after(() => { for (const c of wss?.clients || []) c.terminate(); wss?.close(); srv?.closeAllConnections?.(); srv?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  srv = https.createServer({ key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) });
  wss = new WS.Server({ server: srv }); const calls = [], requests = [];
  const state = { rev: 1, config: { channels: { qqbot: { allowFrom: ["u1"], groupAllowFrom: ["g1"] } }, tools: { allow: ["read"] }, models: { providers: { local: { apiKey: "${IN_USE_KEY}" } } } }, secrets: { IN_USE_KEY: STOREKEY, FREE_KEY: STOREKEY }, authSessions: new Map(), profileOrder: ["xai:first", "xai:second"], orderLocked: false };
  wss.on("connection", s => { const res = (id, ok, payload, error) => s.send(JSON.stringify({ type: "res", id, ok, payload, error }));
    s.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "x" } }));
    s.on("message", raw => { const d = JSON.parse(raw); calls.push(d.method); requests.push({ method: d.method, params: d.params });
      if (d.method === "connect") return res(d.id, true, { server: { version: "t" } });
      if (d.method === "models.authStatus") return res(d.id, true, { providers: [{ provider: "xai", profiles: [{ id: "xai:first" }, { id: "xai:second" }], profileOrder: state.profileOrder, profileOrderLocked: state.orderLocked }], providerCapabilities: [{ provider: "xai", loginOptions: [{ id: "xai:oauth", kind: "oauth", label: "xAI OAuth" }] }] });
      if (d.method === "models.authLogin") {
        state.authSessions.set(d.params.sessionId, { state: "running" });
        return res(d.id, true, { sessionId: d.params.sessionId, done: false, status: "running", step: { id: "opening", type: "progress", message: "Starting local fake OAuth" } });
      }
      if (d.method === "wizard.next") {
        const session = state.authSessions.get(d.params.sessionId);
        if (!session) return res(d.id, false, undefined, { code: "NOT_FOUND", message: "wizard not found" });
        if (d.params.answer) { session.answer = d.params.answer; session.state = "done"; return res(d.id, true, { sessionId: d.params.sessionId, done: true, status: "done" }); }
        return res(d.id, true, { sessionId: d.params.sessionId, done: false, status: "running", step: { id: "callback", type: "text", title: "Paste callback URL", sensitive: true, externalUrl: "https://127.0.0.1:9/fake-oauth?state=FAKE_OAUTH_STATE" } });
      }
      if (d.method === "wizard.cancel") { const session = state.authSessions.get(d.params.sessionId); if (session) session.state = "cancelled"; return res(d.id, true, { status: "cancelled" }); }
      if (d.method === "models.authOrderSet") { state.profileOrder = [...d.params.profileIds]; return res(d.id, true, { ok: true }); }
      if (d.method === "config.get") return res(d.id, true, { valid: true, hash: `h${state.rev}`, config: state.config });
      if (d.method === "config.schema.lookup") return res(d.id, true, { reloadKind: "hot", schema: { type: "array", items: { type: "string" } } });
      if (d.method === "config.patch") {
        if (d.params.baseHash !== `h${state.rev}`) return res(d.id, false, undefined, { code: "CONFLICT", message: "base hash changed" });
        const patch = JSON.parse(d.params.raw);
        for (const p of d.params.replacePaths) { const keys = p.split("."); const at = keys.slice(0, -1).reduce((o, k) => o[k], state.config); at[keys.at(-1)] = keys.reduce((o, k) => o[k], patch); }
        state.rev++; return res(d.id, true, { ok: true, hash: `h${state.rev}` });
      }
      if (d.method === "secrets.store.list") return res(d.id, true, { entries: Object.entries(state.secrets).map(([name, value]) => ({ name, value, kind: "env", updatedAtMs: 1 })) });
      if (d.method === "secrets.store.set") { state.secrets[d.params.name] = d.params.value; return res(d.id, true, { ok: true, reloaded: true }); }
      if (d.method === "secrets.store.delete") { delete state.secrets[d.params.name]; return res(d.id, true, { ok: true, reloaded: true }); }
      if (d.method === "plugins.list") return res(d.id, true, { plugins: [
        { id: "openclaw-mem0", name: "mem0", enabled: true, installed: true, runtime: { state: "active" } },
        { id: "openclaw-qqbot", name: "QQ", enabled: true, installed: true, runtime: { state: "active" } },
        { id: "qq-group-owner-guard", name: "guard", enabled: true, installed: true, runtime: { state: "active" } },
        { id: "deepseek", name: "DeepSeek", enabled: true, installed: true, runtime: { state: "service-failed", error: `svc: 401 Bearer ${FAKE}` } },
        { id: "browser", name: "Browser", enabled: true, installed: true, runtime: { state: "active" } },
        { id: "ghost", name: "ghost", enabled: false, installed: false } ] });
      if (d.method === "skills.status") return res(d.id, true, { skills: [] });
      res(d.id, true, {}); }); });
  srv.listen(0, "127.0.0.1"); await once(srv, "listening");
  return { url: `wss://127.0.0.1:${srv.address().port}`, cert: path.join(dir, "c.pem"), calls, requests, state };
}
test("shipped assets and backend integrate plugins, memory, allowlists, secrets and official OAuth", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "panels-"));
  let child, mock;
  t.after(async () => { await runtime.stopChild(child); mock?.closeAllConnections?.(); mock?.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const gw = await gateway(t); const qd = [];
  mock = http.createServer((q, r) => { let b = ""; q.on("data", d => b += d); q.on("end", () => { r.setHeader("content-type", "application/json");
    if (q.url === "/v2/embeddings") return r.end(JSON.stringify({ data: [{ embedding: [0, 0, 0, 1] }] }));
    if (q.url === "/collections/col/points/query") { qd.push(JSON.parse(b)); return r.end(JSON.stringify({ result: { points: [{ id: "a", score: 0.9, payload: { data: "喜欢猫", user_id: "u1", oc_visibility: "group" } }] } })); }
    if (q.url === "/collections/col/facet") return r.end(JSON.stringify({ result: { hits: [{ value: "u1", count: 3 }] } }));
    r.statusCode = 404; r.end("{}"); }); });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening"); const mp = mock.address().port;
  runtime.copyRuntime(process.env.DEPLOY_DIR || W, root);
  fs.symlinkSync(PUB, path.join(root, "public"));
  fs.writeFileSync(path.join(root, "cfg.json"), JSON.stringify({ gateway: { auth: { token: "fake" } }, channels: { qqbot: {} },
    plugins: { slots: { memory: "openclaw-mem0" }, load: { paths: ["/x/plugins/qq-group-owner-guard/"] }, entries: { "openclaw-mem0": { enabled: true, config: { oss: { embedder: { provider: "openai", config: { apiKey: EMBKEY, baseURL: `http://127.0.0.1:${mp}/v2`, model: "m" } } } } }, "openclaw-qqbot": { enabled: true }, deepseek: { enabled: true } } } }));
  const l = net.createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening"); const port = l.address().port; await new Promise(r => l.close(r));
  const pw = crypto.randomBytes(12).toString("hex");
  child = spawn(process.execPath, ["server.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(pw, 4), NODE_PATH: path.join(REPO, "node_modules"),
    OPENCLAW_WORKSPACE: path.join(root, "ws"), OPENCLAW_CONFIG: path.join(root, "cfg.json"), QQ_SEND_ENABLED: "0", QDRANT_URL: `http://127.0.0.1:${mp}`, MEM_COLLECTION: "col", GATEWAY_URL: gw.url, GATEWAY_CERT: gw.cert, HOSINO_QUIET_WINDOW: "off" } });
  let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
  for (let i = 0; !logs.includes("hosino-console on") && i < 150; i++) { assert.equal(child.exitCode, null, logs); await new Promise(r => setTimeout(r, 20)); }
  const base = `http://127.0.0.1:${port}`;
  const idx = await (await fetch(base + "/")).text();
  const assetVersions = [...idx.matchAll(/(?:src|href)="[^"?]+\?v=([^"&]+)/g)].map(m => m[1]);
  assert.ok(assetVersions.length >= 3, "index includes versioned application assets");
  for (const f of fs.readdirSync(PUB)) assert.equal((await fetch(base + "/" + f)).status, 200, f);
  const lr = await fetch(base + "/api/login", { method: "POST", headers: { "x-hs": "1" }, body: JSON.stringify({ password: pw }) }); assert.equal(lr.status, 200);
  const h = { cookie: lr.headers.get("set-cookie").split(";")[0], "x-hs": "1", "content-type": "application/json" };
  // (4) 插件
  const pj = await (await fetch(base + "/api/plugins", { headers: h })).json();
  const by = Object.fromEntries(pj.plugins.map(p => [p.id, p]));
  assert.deepEqual(Object.keys(by).sort(), ["browser", "deepseek", "openclaw-mem0", "openclaw-qqbot", "qq-group-owner-guard"]);
  assert.equal(by["openclaw-mem0"].protected, true); assert.equal(by["openclaw-mem0"].protectedReason, "slot:memory");
  assert.equal(by["openclaw-qqbot"].protectedReason, "channel:qqbot"); assert.equal(by["qq-group-owner-guard"].protectedReason, "local-guard");
  assert.equal(by.browser.protected, false); assert.equal(by.browser.error, null); assert.equal(by.browser.protectedReason, null);
  assert.equal(typeof by.deepseek.error, "string"); assert.match(by.deepseek.error, /401/); assert.ok(!JSON.stringify(pj).includes(FAKE), "plugin error must be redacted");
  assert.equal(by.deepseek.runtime, "service-failed"); assert.ok(gw.calls.includes("plugins.list"));
  // (3) 记忆搜索：按 adapter 实际发送的 body
  let r = await fetch(base + "/api/memory/search", { method: "POST", headers: h, body: JSON.stringify({ q: "猫", scope: "all", limit: 20, minScore: 0 }) }); assert.equal(r.status, 200);
  let j = await r.json(); assert.equal(j.scope, "all"); assert.equal(j.results[0].memory, "喜欢猫"); assert.equal(j.results[0].visibility, "group");
  assert.ok(!JSON.stringify(qd.at(-1)).includes("u1"), "scope all has no user filter");
  r = await fetch(base + "/api/memory/search", { method: "POST", headers: h, body: JSON.stringify({ q: "猫2", scope: "users", user_ids: ["u1"], limit: 20, minScore: 0 }) }); assert.equal(r.status, 200);
  assert.match(JSON.stringify(qd.at(-1)), /"any":\["u1"\]/);
  assert.deepEqual((await (await fetch(base + "/api/memory/users", { headers: h })).json()).users, [{ user_id: "u1", count: 3 }]);
  // (1) 撤回接口存在
  r = await fetch(base + "/api/chat/recallable?key=x&id=y", { headers: h }); const rj = await r.json(); assert.ok(rj.code && rj.code !== "not_found" || rj.ok, "recallable route exists");
  r = await fetch(base + "/api/allowlist", { headers: h }); assert.equal(r.status, 200); const lists = await r.json();
  assert.deepEqual(lists.lists.map(x => x.path).sort(), ["channels.qqbot.allowFrom", "channels.qqbot.groupAllowFrom", "tools.allow"]);
  const change = { baseHash: lists.baseHash, changes: [{ path: "channels.qqbot.allowFrom", items: ["u2"] }] };
  r = await fetch(base + "/api/allowlist/preview", { method: "POST", headers: h, body: JSON.stringify(change) }); assert.equal(r.status, 200); j = await r.json();
  assert.equal(j.dryRun, true); assert.equal(j.apply, "reload"); assert.deepEqual(gw.state.config.channels.qqbot.allowFrom, ["u1"], "preview does not write config");
  r = await fetch(base + "/api/allowlist/apply", { method: "POST", headers: h, body: JSON.stringify(change) }); assert.equal(r.status, 400);
  r = await fetch(base + "/api/allowlist/apply", { method: "POST", headers: h, body: JSON.stringify({ ...change, confirm: true }) }); assert.equal(r.status, 200); assert.equal((await r.json()).changed, true);
  assert.deepEqual(gw.state.config.channels.qqbot.allowFrom, ["u2"], "apply replaces removed list entries");
  r = await fetch(base + "/api/allowlist/apply", { method: "POST", headers: h, body: JSON.stringify({ ...change, confirm: true }) }); assert.equal(r.status, 409, "stale config cannot overwrite newer state");

  r = await fetch(base + "/api/secrets", { headers: h }); assert.equal(r.status, 200); j = await r.json();
  assert.deepEqual(j.secrets.map(s => s.name), ["FREE_KEY", "IN_USE_KEY"]); assert.ok(j.secrets.every(s => s.set === true));
  assert.deepEqual(j.secrets.find(s => s.name === "IN_USE_KEY").usedBy, ["models.providers.local.apiKey"]);
  assert.ok(!JSON.stringify(j).includes(STOREKEY), "secret values are never returned");
  const secret = { name: "NEW_KEY", value: "sk-FAKENEW0000000000", confirm: true };
  r = await fetch(base + "/api/secrets/set", { method: "POST", headers: h, body: JSON.stringify({ ...secret, confirm: false }) }); assert.equal(r.status, 400);
  r = await fetch(base + "/api/secrets/set", { method: "POST", headers: h, body: JSON.stringify(secret) }); assert.equal(r.status, 200); j = await r.json(); assert.equal(j.set, true); assert.equal(j.reloaded, true);
  assert.equal(gw.state.secrets.NEW_KEY, secret.value);
  r = await fetch(base + "/api/secrets/clear", { method: "POST", headers: h, body: JSON.stringify({ name: "IN_USE_KEY", confirm: true }) }); assert.equal(r.status, 409); assert.equal((await r.json()).code, "in_use");
  r = await fetch(base + "/api/secrets/clear", { method: "POST", headers: h, body: JSON.stringify({ name: "NEW_KEY", confirm: true }) }); assert.equal(r.status, 200); j = await r.json(); assert.equal(j.set, false); assert.equal(j.reloaded, true);
  assert.equal(gw.state.secrets.NEW_KEY, undefined);
  const callback = "http://127.0.0.1:9/callback?code=FAKE_CALLBACK_CODE&state=FAKE_OAUTH_STATE";
  await t.test("OAuth wizard uses real HTTP auth/CSRF, owner-bound polling, answers, cancellation and locked account order", async () => {
    const post = (url, body, headers = h) => fetch(base + url, { method: "POST", headers, body: JSON.stringify(body) });
    const noCsrf = { cookie: h.cookie, "content-type": "application/json" };
    const start = { provider: "xai", method: "xai:oauth", confirm: true };
    assert.equal((await post("/api/models/auth/login", start, { "x-hs": "1" })).status, 401);
    assert.equal((await post("/api/models/auth/login", start, noCsrf)).status, 403);
    assert.equal((await post("/api/models/auth/login", {})).status, 400);
    let response = await post("/api/models/auth/login", start); assert.equal(response.status, 200); const started = await response.json();
    assert.match(started.pollId, /^[a-f0-9]{48}$/); assert.equal(started.state, "pending");
    const pollUrl = "/api/models/auth/login/" + started.pollId;
    response = await post("/api/models/auth/login", start); assert.equal(response.status, 429); assert.equal((await response.json()).code, "auth_busy");
    const login2 = await fetch(base + "/api/login", { method: "POST", headers: { "x-hs": "1" }, body: JSON.stringify({ password: pw }) }); assert.equal(login2.status, 200);
    const other = { ...h, cookie: login2.headers.get("set-cookie").split(";")[0] };
    assert.equal((await fetch(base + pollUrl, { headers: other })).status, 404, "a different login session cannot read the wizard");
    assert.equal((await post(pollUrl + "/answer", { stepId: "callback", value: callback, confirm: true }, other)).status, 404);
    assert.equal((await post(pollUrl + "/cancel", { confirm: true }, other)).status, 404);
    const waitFor = async predicate => {
      let view;
      for (let i = 0; i < 150; i++) {
        const reply = await fetch(base + pollUrl, { headers: h }); assert.equal(reply.status, 200); view = await reply.json();
        if (predicate(view)) return view;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail("wizard did not reach expected state: " + JSON.stringify(view));
    };
    const step = await waitFor(view => view.step?.id === "callback");
    assert.equal(step.step.type, "text"); assert.equal(step.step.sensitive, true); assert.equal(step.step.requiresAnswer, true);
    assert.match(step.step.externalUrl, /^https:\/\/127\.0\.0\.1:9\/fake-oauth/);
    const answer = { stepId: "callback", value: callback, confirm: true };
    assert.equal((await post(pollUrl + "/answer", answer, noCsrf)).status, 403);
    assert.equal((await post(pollUrl + "/answer", { ...answer, stepId: "stale" })).status, 409);
    response = await post(pollUrl + "/answer", answer); assert.equal(response.status, 200);
    const done = await waitFor(view => view.state === "done"); assert.equal(done.step, null);
    const beginRpc = gw.requests.find(q => q.method === "models.authLogin");
    assert.deepEqual(Object.keys(beginRpc.params).sort(), ["authChoice", "sessionId"]); assert.equal(beginRpc.params.authChoice, "xai:oauth");
    const answerRpc = gw.requests.find(q => q.method === "wizard.next" && q.params.answer);
    assert.equal(answerRpc.params.sessionId, beginRpc.params.sessionId); assert.deepEqual(answerRpc.params.answer, { stepId: "callback", value: callback });
    response = await post("/api/models/auth/login", start); assert.equal(response.status, 200); const cancellable = await response.json();
    assert.equal((await post("/api/models/auth/login/" + cancellable.pollId + "/cancel", { confirm: true }, noCsrf)).status, 403);
    response = await post("/api/models/auth/login/" + cancellable.pollId + "/cancel", { confirm: true }); assert.equal(response.status, 200); assert.equal((await response.json()).state, "cancelled");
    assert.ok([...gw.state.authSessions.values()].every(session => session.state !== "running"), "no active fake wizard remains");
    const order = { provider: "xai", profileIds: ["xai:second", "xai:first"], confirm: true };
    assert.equal((await post("/api/models/auth/order", {})).status, 400);
    assert.equal((await post("/api/models/auth/order", order, noCsrf)).status, 403);
    response = await post("/api/models/auth/order", order); assert.equal(response.status, 200); assert.deepEqual((await response.json()).profileIds, order.profileIds);
    assert.deepEqual(gw.state.profileOrder, order.profileIds);
    const orderCalls = gw.calls.filter(method => method === "models.authOrderSet").length;
    gw.state.orderLocked = true;
    response = await post("/api/models/auth/order", { ...order, profileIds: [...order.profileIds].reverse() }); assert.equal(response.status, 409); assert.equal((await response.json()).code, "order_locked");
    assert.equal(gw.calls.filter(method => method === "models.authOrderSet").length, orderCalls, "configuration lock prevents the upstream write");
    response = await post("/api/models/auth/login", start); assert.equal(response.status, 200); const onLogout = await response.json();
    assert.equal((await post("/api/logout", {})).status, 200);
    assert.equal((await fetch(base + "/api/models/auth/login/" + onLogout.pollId, { headers: h })).status, 401, "logout removes local wizard access");
    for (let i = 0; i < 150 && [...gw.state.authSessions.values()].some(session => session.state === "running"); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok([...gw.state.authSessions.values()].every(session => session.state !== "running"), "logout cancels the owner's active upstream wizard");
  });
  const audit = fs.readFileSync(path.join(root, "logs/ops.log"), "utf8");
  assert.match(audit, /allowlist\.apply/); assert.match(audit, /secrets\.(?:set|clear)/);
  for (const sensitive of [FAKE, EMBKEY, STOREKEY, secret.value, pw, callback, "FAKE_CALLBACK_CODE", "FAKE_OAUTH_STATE"]) assert.ok(!logs.includes(sensitive) && !audit.includes(sensitive), "logs must not contain credential values");
  assert.ok(assetVersions.every(v => v === version), "asset cache version matches package version");
});
