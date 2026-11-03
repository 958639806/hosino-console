// release-20261103c 端到端：真实 server.mjs + 新前端 2026.11.3.7 + 假网关(wss)/假 Qdrant/假 embedding。不碰任何真实服务。
import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import http from "node:http"; import https from "node:https"; import net from "node:net"; import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process"; import { once } from "node:events"; import { createRequire } from "node:module";
const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO = process.env.HOSINO_REPO || "/workspace/hosino-repo"; const rq = createRequire(REPO + "/x.js");
const bcrypt = rq("bcryptjs"), WS = rq("ws");
const FAKE = "sk-FAKEPLUGINSECRET1234567890", EMBKEY = "sk-FAKEEMB0000000000";
const PUB = process.env.PUBLIC_DIR || path.join(W, "public-new");

async function gateway(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gwc-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  const srv = https.createServer({ key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) });
  const wss = new WS.Server({ server: srv }); const calls = [];
  wss.on("connection", s => { const res = (id, ok, payload, error) => s.send(JSON.stringify({ type: "res", id, ok, payload, error }));
    s.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "x" } }));
    s.on("message", raw => { const d = JSON.parse(raw); calls.push(d.method);
      if (d.method === "connect") return res(d.id, true, { server: { version: "t" } });
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
  t.after(() => { for (const c of wss.clients) c.terminate(); wss.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { url: `wss://127.0.0.1:${srv.address().port}`, cert: path.join(dir, "c.pem"), calls };
}
test("frontend 2026.11.3.7 served by release-20261103c backend; plugins protected/error; memory scopes; spec-only endpoints 404", async t => {
  const gw = await gateway(t); const qd = [];
  const mock = http.createServer((q, r) => { let b = ""; q.on("data", d => b += d); q.on("end", () => { r.setHeader("content-type", "application/json");
    if (q.url === "/v2/embeddings") return r.end(JSON.stringify({ data: [{ embedding: [0, 0, 0, 1] }] }));
    if (q.url === "/collections/col/points/query") { qd.push(JSON.parse(b)); return r.end(JSON.stringify({ result: { points: [{ id: "a", score: 0.9, payload: { data: "喜欢猫", user_id: "u1", oc_visibility: "group" } }] } })); }
    if (q.url === "/collections/col/facet") return r.end(JSON.stringify({ result: { hits: [{ value: "u1", count: 3 }] } }));
    r.statusCode = 404; r.end("{}"); }); });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening"); const mp = mock.address().port;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "panels-"));
  for (const f of ["server.mjs", "memory-search.mjs", "chat-actions.mjs"]) fs.copyFileSync(path.join(process.env.DEPLOY_DIR || W, f), path.join(root, f));
  fs.symlinkSync(PUB, path.join(root, "public"));
  fs.writeFileSync(path.join(root, "cfg.json"), JSON.stringify({ gateway: { auth: { token: "fake" } }, channels: { qqbot: {} },
    plugins: { slots: { memory: "openclaw-mem0" }, load: { paths: ["/x/plugins/qq-group-owner-guard/"] }, entries: { "openclaw-mem0": { enabled: true, config: { oss: { embedder: { provider: "openai", config: { apiKey: EMBKEY, baseURL: `http://127.0.0.1:${mp}/v2`, model: "m" } } } } }, "openclaw-qqbot": { enabled: true }, deepseek: { enabled: true } } } }));
  const l = net.createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening"); const port = l.address().port; await new Promise(r => l.close(r));
  const pw = crypto.randomBytes(12).toString("hex");
  const child = spawn(process.execPath, ["server.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(pw, 4), NODE_PATH: path.join(REPO, "node_modules"),
    OPENCLAW_WORKSPACE: path.join(root, "ws"), OPENCLAW_CONFIG: path.join(root, "cfg.json"), QQ_SEND_ENABLED: "0", QDRANT_URL: `http://127.0.0.1:${mp}`, MEM_COLLECTION: "col", GATEWAY_URL: gw.url, GATEWAY_CERT: gw.cert, HOSINO_QUIET_WINDOW: "off" } });
  let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
  t.after(async () => { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } mock.close(); fs.rmSync(root, { recursive: true, force: true }); });
  for (let i = 0; !logs.includes("hosino-console on") && i < 150; i++) { assert.equal(child.exitCode, null, logs); await new Promise(r => setTimeout(r, 20)); }
  const base = `http://127.0.0.1:${port}`;
  // 前端静态资源都能拿到，版本是 2026.11.3.7
  const idx = await (await fetch(base + "/")).text(); assert.match(idx, /2026\.11\.3\.7/);
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
  // (2) 白名单 / 密钥：后端未实现（spec-only）→ 前端 notReady 走 404
  for (const [m, p] of [["GET", "/api/allowlist"], ["POST", "/api/allowlist/preview"], ["POST", "/api/allowlist/apply"], ["GET", "/api/secrets"], ["POST", "/api/secrets/set"], ["POST", "/api/secrets/clear"], ["POST", "/api/models/auth/login"], ["POST", "/api/models/auth/order"]]) {
    const x = await fetch(base + p, { method: m, headers: h, body: m === "POST" ? "{}" : undefined }); assert.equal(x.status, 404, `${m} ${p}`);
  }
  assert.ok(!logs.includes(FAKE) && !logs.includes(EMBKEY) && !logs.includes(pw));
});
