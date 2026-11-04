// Exercise the actual HTTP boundary against a local TLS gateway. No plugin code
// is installed and no external registry or configured gateway is contacted.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import net from "node:net";
import crypto from "node:crypto";
import { once } from "node:events";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import runtime from "./helpers/runtime.cjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(REPO, "package.json"));
const WS = require("ws"), bcrypt = require("bcryptjs");
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")).version;
const SECRET = "ordinary plugin credential / + =";
const clone = value => JSON.parse(JSON.stringify(value));
const READ_METHODS = new Set(["connect", "config.get", "config.schema.lookup", "plugins.list", "plugins.inspect"]);
const mutatingMethods = calls => calls.filter(({ method }) => !READ_METHODS.has(method));

function initialState() {
  return {
    revision: 1, calls: [], faults: new Map(),
    config: {
      gateway: { auth: { token: "fake-plugin-center-gateway" } },
      channels: { qqbot: {} },
      plugins: {
        slots: { memory: "openclaw-mem0" },
        entries: {
          "openclaw-qqbot": { enabled: true },
          "openclaw-mem0": { enabled: true },
          utility: { enabled: true, config: { replyPrefix: "hello", apiKey: SECRET } },
        },
      },
    },
    plugins: [
      { id: "openclaw-qqbot", name: "QQ", packageName: "@local/qq", installed: true, enabled: true, version: "1.0.0", runtime: { state: "active" } },
      { id: "qq-helper", name: "QQ package helper", packageName: "@local/qq", installed: true, enabled: true, version: "1.0.0", runtime: { state: "active" } },
      { id: "openclaw-mem0", name: "Memory", installed: true, enabled: true, version: "1.0.0", runtime: { state: "active" } },
      { id: "utility", name: "Utility", description: "A local fake native OpenClaw plugin", installed: true, enabled: true, version: "1.0.0", runtime: { state: "active" } },
    ],
  };
}

async function fixture(t, { quiet = "off" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hosino plugin center http "));
  let child, server, wss;
  t.after(async () => {
    await runtime.stopChild(child);
    for (const socket of wss?.clients || []) socket.terminate();
    wss?.close(); server?.closeAllConnections?.(); server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const state = initialState();
  const key = path.join(root, "key.pem"), cert = path.join(root, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  wss = new WS.Server({ server });
  wss.on("connection", socket => {
    const reply = (id, payload) => socket.send(JSON.stringify({ type: "res", id, ok: true, payload }));
    socket.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "local-test" } }));
    socket.on("message", raw => {
      const request = JSON.parse(raw), params = request.params || {};
      state.calls.push({ method: request.method, params: clone(params) });
      const fault = state.faults.get(request.method);
      if (fault) return socket.send(JSON.stringify({ type: "res", id: request.id, ok: false, error: fault }));
      if (request.method === "connect") return reply(request.id, { server: { version: "local-plugin-center-test" } });
      if (request.method === "plugins.list") return reply(request.id, { plugins: state.plugins, mutationAllowed: true });
      if (request.method === "plugins.inspect") {
        const plugin = state.plugins.find(item => item.id === params.pluginId);
        if (!plugin) return socket.send(JSON.stringify({ type: "res", id: request.id, ok: false, error: { code: "NOT_FOUND", message: "plugin not found" } }));
        return reply(request.id, {
          plugin, declared: Object.fromEntries(["channels", "providers", "tools", "contracts", "hooks", "mcpServers", "cliCommands", "cliBackends", "skills", "dangerousConfigFlags"].map(key => [key, []])),
          components: { ...Object.fromEntries(["mapped", "skills", "mcpServers", "commands", "hooks", "lspServers"].map(key => [key, []])), unavailable: { capabilities: [], mcpServers: [], lspServers: [] } },
          diagnostics: { token: SECRET },
        });
      }
      if (request.method === "config.get") return reply(request.id, { valid: true, hash: `h${state.revision}`, config: state.config });
      if (request.method === "config.schema.lookup") return reply(request.id, { path: params.path, reloadKind: "hot", schema: { type: "object", additionalProperties: false, properties: { replyPrefix: { type: "string", maxLength: 100 }, apiKey: { type: "string", sensitive: true, writeOnly: true, default: SECRET, examples: [SECRET] } } } });
      if (request.method === "config.patch") {
        if (params.baseHash !== `h${state.revision}`) return socket.send(JSON.stringify({ type: "res", id: request.id, ok: false, error: { code: "CONFLICT", message: "base hash changed" } }));
        const patch = JSON.parse(params.raw);
        const merge = (target, next) => { for (const [name, value] of Object.entries(next)) { if (value && typeof value === "object" && !Array.isArray(value)) merge(target[name] ??= {}, value); else target[name] = clone(value); } };
        merge(state.config, patch); state.revision++;
        return reply(request.id, { ok: true, hash: `h${state.revision}` });
      }
      return socket.send(JSON.stringify({ type: "res", id: request.id, ok: false, error: { code: "METHOD_NOT_FOUND", message: "unknown local fake gateway method" } }));
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  runtime.copyRuntime(REPO, root);
  fs.symlinkSync(path.join(REPO, "public"), path.join(root, "public"));
  fs.writeFileSync(path.join(root, "cfg.json"), JSON.stringify(state.config));
  const listener = net.createServer(); listener.listen(0, "127.0.0.1");
  await once(listener, "listening"); const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = crypto.randomBytes(20).toString("hex");
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(password, 4),
      NODE_PATH: path.join(REPO, "node_modules"), OPENCLAW_CONFIG: path.join(root, "cfg.json"),
      OPENCLAW_WORKSPACE: path.join(root, "workspace"), QQ_SEND_ENABLED: "0",
      GATEWAY_URL: `wss://127.0.0.1:${server.address().port}`, GATEWAY_CERT: cert,
      GATEWAY_FP: "", HOSINO_QUIET_WINDOW: quiet,
    },
  });
  let output = "";
  child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
  for (let attempt = 0; attempt < 150 && !output.includes("hosino-console on"); attempt++) {
    assert.equal(child.exitCode, null, output);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.match(output, /hosino-console on/);
  const base = `http://127.0.0.1:${port}`;
  let headers;
  const request = async (url, { method = "GET", body, auth = headers } = {}) => {
    const response = await fetch(base + url, { method, headers: auth, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); let json;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, headers: response.headers, text, json };
  };
  const login = async () => {
    const response = await request("/api/login", { method: "POST", body: { password }, auth: { "x-hs": "1", "content-type": "application/json" } });
    assert.equal(response.status, 200);
    headers = { cookie: response.headers.get("set-cookie").split(";")[0], "x-hs": "1", "content-type": "application/json" };
    return headers;
  };
  const audit = () => fs.existsSync(path.join(root, "logs/ops.log")) ? fs.readFileSync(path.join(root, "logs/ops.log"), "utf8") : "";
  return { request, login, state, base, root, output: () => output, audit };
}

test("plugin-center HTTP routes require login and CSRF before gateway operations", { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  for (const [url, method, body] of [
    ["/api/plugin-center", "GET"],
    ["/api/plugin-center/detail?id=utility", "GET"],
    ["/api/plugin-center/plan", "POST", { action: "disable", id: "utility" }],
    ["/api/plugin-center/apply", "POST", { planId: "fake", baseHash: "h1", confirm: true }],
  ]) assert.equal((await f.request(url, { method, body, auth: { "x-hs": "1" } })).status, 401, `${method} ${url}`);
  assert.equal(mutatingMethods(f.state.calls).length, 0);
  const headers = await f.login(), noCsrf = { cookie: headers.cookie, "content-type": "application/json" };
  for (const url of ["/api/plugin-center/plan", "/api/plugin-center/apply"]) {
    const response = await f.request(url, { method: "POST", body: {}, auth: noCsrf });
    assert.equal(response.status, 403, url);
  }
  assert.equal((await f.request("/api/plugin-center/plan", { method: "POST", body: {} })).status, 400);
  assert.equal((await f.request("/api/plugin-center/apply", { method: "POST", body: {} })).status, 400);
  assert.equal(mutatingMethods(f.state.calls).length, 0, "auth/CSRF/validation failures do not write gateway state");
});

test("plugin-center does not reflect upstream credential values through HTTP errors or audit", { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  const reflected = "REMOTE_ERROR_WITH_" + SECRET;
  f.state.faults.set("plugins.list", { code: reflected, message: reflected, details: { token: SECRET } });
  await f.login();
  const response = await f.request("/api/plugin-center");
  assert.equal(response.status, 502);
  assert.ok(!response.text.includes(SECRET) && !response.text.includes("REMOTE_ERROR_WITH_"));
  assert.ok(!f.output().includes(SECRET) && !f.audit().includes(SECRET));
  assert.equal(mutatingMethods(f.state.calls).length, 0);
});

test("plugin-center inventory and detail expose native capabilities while preserving QQ/memory and hiding credentials", { timeout: 15_000 }, async t => {
  const f = await fixture(t); await f.login();
  const resource = await f.request("/plugin-center.js", { auth: {} });
  assert.equal(resource.status, 200); assert.match(resource.headers.get("content-type"), /javascript/);
  const app = await f.request("/app.js", { auth: {} }); assert.equal(app.status, 200);
  const imports = [...app.text.matchAll(/\b(?:from\s*|import\s*\(\s*)["'](\.\/[^"']+\?v=[^"']+)/g)].map(match => match[1]);
  assert.ok(imports.some(url => url.startsWith("./plugin-center.js?")), "the shipped app loads the native plugin-center module");
  assert.ok(imports.every(url => new URL(url, f.base).searchParams.get("v") === VERSION), "application module imports match the release cache version");
  const listed = await f.request("/api/plugin-center"); assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.plugins.map(plugin => plugin.id).sort(), ["openclaw-mem0", "openclaw-qqbot", "qq-helper", "utility"]);
  assert.equal(listed.json.capabilities.install, false); assert.equal(listed.json.capabilities.installPreview, true);
  for (const id of ["openclaw-qqbot", "openclaw-mem0", "qq-helper"]) {
    const plugin = listed.json.plugins.find(item => item.id === id);
    assert.equal(plugin.protected, true); assert.equal(typeof plugin.protectedReason, "string");
    assert.ok(Object.values(plugin.capabilities).every(value => value === false), id + " stays read only");
    const plan = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "config", id, baseHash: listed.json.baseHash, config: { replyPrefix: "changed" } } });
    assert.equal(plan.status, 403); assert.equal(plan.json.code, "plugin_protected");
  }
  const detailed = await f.request("/api/plugin-center/detail?id=utility"); assert.equal(detailed.status, 200);
  assert.equal(detailed.json.plugin.id, "utility"); assert.equal(detailed.json.baseHash, listed.json.baseHash);
  assert.deepEqual(detailed.json.config.values, { replyPrefix: "hello" });
  assert.ok(detailed.json.config.secretFields.some(field => field.path === "apiKey" && field.configured === true));
  assert.equal(detailed.json.config.previewable, true); assert.equal(detailed.json.config.writable, false);
  assert.equal(detailed.json.config.schema.properties.apiKey.default, undefined);
  assert.equal(detailed.json.config.schema.properties.apiKey.examples, undefined);
  assert.ok(!detailed.text.includes(SECRET), "detail does not expose config secrets or raw RPC diagnostics");
  delete f.state.config.plugins.entries.utility.config.apiKey;
  const neverConfigured = await f.request("/api/plugin-center/detail?id=utility"); assert.equal(neverConfigured.status, 200);
  assert.ok(neverConfigured.json.config.secretFields.some(field => field.path === "apiKey" && field.configured === false), "schema-declared credentials remain write-only before their first value exists");
  assert.equal(neverConfigured.json.config.values.apiKey, undefined);
  assert.equal((await f.request("/api/plugin-center/detail")).status, 400);
  assert.equal((await f.request("/api/plugin-center/detail?id=missing")).status, 404);
  assert.equal(mutatingMethods(f.state.calls).length, 0);
});

test("native plugin change previews never mutate runtime, export no credentials, and reject unsafe install sources", { timeout: 15_000 }, async t => {
  const f = await fixture(t); await f.login();
  const listed = await f.request("/api/plugin-center"); assert.equal(listed.status, 200);
  const baseHash = listed.json.baseHash;
  const before = clone(f.state.config);
  for (const input of [
    { action: "config", id: "utility", config: { replyPrefix: "new prefix" } },
    { action: "enable", id: "utility" },
    { action: "disable", id: "utility" },
    { action: "uninstall", id: "utility" },
    { action: "install", source: "npm", spec: "@openclaw/native-demo@1.0.0" },
    { action: "install", source: "official", spec: "native-demo" },
    { action: "install", source: "clawhub", spec: "native-demo" },
  ]) {
    const preview = await f.request("/api/plugin-center/plan", { method: "POST", body: { ...input, baseHash } });
    assert.equal(preview.status, 200, JSON.stringify(input));
    assert.equal(preview.json.canApply, false); assert.equal(typeof preview.json.blockedReason, "string");
    assert.match(preview.json.planId, /^pc_[a-f0-9]{32}$/);
    const exported = JSON.parse(preview.json.export.content); assert.equal(exported.executable, false);
    if (input.action === "install") {
      assert.equal(preview.json.verification, "identifier-only"); assert.equal(preview.json.verifiedNative, false);
      assert.equal(exported.verifiedNative, false, "a package identifier is not proof that its contents are a native plugin");
    }
    assert.ok(!preview.text.includes(SECRET));
    const noConfirm = await f.request("/api/plugin-center/apply", { method: "POST", body: { planId: preview.json.planId, baseHash } });
    assert.equal(noConfirm.status, 400);
    const apply = await f.request("/api/plugin-center/apply", { method: "POST", body: { planId: preview.json.planId, baseHash, confirm: true } });
    assert.equal(apply.status, 409); assert.equal(apply.json.code, preview.json.blockedCode);
  }
  for (const spec of ["https://example.invalid/plugin.zip", "file:/tmp/plugin", "../plugin", "astrbot-demo", "demo.py", "demo.zip"]) {
    const response = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "install", source: "npm", spec, baseHash } });
    assert.equal(response.status, 400); assert.equal(response.json.code, "unsupported_source");
  }
  for (const config of [{ replyPrefix: 123 }, { undeclared: SECRET }, JSON.parse('{"__proto__":{"polluted":true}}'), { apiKey: "__OPENCLAW_REDACTED__" }]) {
    const invalid = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "config", id: "utility", config, baseHash } });
    assert.equal(invalid.status, 400); assert.equal(invalid.json.code, "invalid_config");
    assert.ok(!invalid.text.includes(SECRET), "invalid config errors do not echo submitted credential values");
  }
  const replacement = "do not export this new credential / + =";
  const secretPlan = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "config", id: "utility", config: { apiKey: replacement }, baseHash } });
  assert.equal(secretPlan.status, 200); assert.equal(secretPlan.json.canApply, false); assert.equal(secretPlan.json.secretChanged, true);
  assert.equal(secretPlan.json.blockedCode, "secret_write_required");
  assert.ok(!secretPlan.text.includes(replacement) && !secretPlan.text.includes(SECRET));
  assert.deepEqual(f.state.config, before, "previews and refused applies do not change configuration");
  assert.equal(mutatingMethods(f.state.calls).length, 0, "no config or lifecycle write RPC is called");
  for (const value of [SECRET, replacement]) assert.ok(!f.output().includes(value) && !f.audit().includes(value));
});

test("plugin-center rechecks baseHash and quiet-window admission without writing plugins", { timeout: 15_000 }, async t => {
  const f = await fixture(t, { quiet: "00:00-23:59" }); await f.login();
  const listed = await f.request("/api/plugin-center"); assert.equal(listed.status, 200);
  assert.equal((await f.request("/api/plugin-center/detail?id=utility")).status, 200, "reads remain available in a quiet window");
  const preview = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "disable", id: "utility", baseHash: listed.json.baseHash } });
  assert.equal(preview.status, 200, "preview is read only");
  const response = await f.request("/api/plugin-center/apply", { method: "POST", body: { planId: preview.json.planId, baseHash: preview.json.baseHash, confirm: true } });
  assert.equal(response.status, 423); assert.equal(response.json.code, "quiet_window"); assert.ok(response.json.retryAfterMs > 0);
  f.state.revision++;
  const stale = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "disable", id: "utility", baseHash: listed.json.baseHash } });
  assert.equal(stale.status, 409); assert.equal(stale.json.code, "baseHash_mismatch");
  assert.equal(mutatingMethods(f.state.calls).length, 0);
});

test("native plugin plans belong to the login that created them and cannot survive logout as an executable request", { timeout: 15_000 }, async t => {
  const f = await fixture(t), owner = await f.login();
  const listed = await f.request("/api/plugin-center"); assert.equal(listed.status, 200);
  const preview = await f.request("/api/plugin-center/plan", { method: "POST", body: { action: "disable", id: "utility", baseHash: listed.json.baseHash } });
  assert.equal(preview.status, 200);
  const input = { planId: preview.json.planId, baseHash: preview.json.baseHash, confirm: true };
  const other = await f.login();
  const crossLogin = await f.request("/api/plugin-center/apply", { method: "POST", body: input, auth: other });
  assert.equal(crossLogin.status, 404); assert.equal(crossLogin.json.code, "plan_not_found");
  const ownPlan = await f.request("/api/plugin-center/apply", { method: "POST", body: input, auth: owner });
  assert.equal(ownPlan.status, 409); assert.equal(ownPlan.json.code, preview.json.blockedCode, "the original owner still receives its safe maintenance refusal");
  assert.equal((await f.request("/api/logout", { method: "POST", body: {}, auth: owner })).status, 200);
  assert.equal((await f.request("/api/plugin-center/apply", { method: "POST", body: input, auth: owner })).status, 401);
  assert.equal((await f.request("/api/plugin-center/apply", { method: "POST", body: input, auth: other })).status, 404);
  assert.equal(mutatingMethods(f.state.calls).length, 0);
});
