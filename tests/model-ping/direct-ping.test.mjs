// 直连 ping：假 key + 本地 mock 上游；不碰真实凭证/网关
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import http from "node:http"; import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "../../server.mjs"), "utf8");
const FAKE_DS = "sk-FAKEdeepseek0123456789", FAKE_QF = "bce-v3/FAKE-qianfan-xyz", FAKE_MI = "tp-FAKExiaomi9876543210";
const seg = src.slice(src.indexOf("// ---------- HOSINO-MODEL-PING-DIRECT v1"), src.indexOf("async function modelPing(b) {"));

async function fixture(t, handler, extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "direct-ping-"));
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", d => b += d); req.on("end", () => { seen.push({ url: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null }); handler(req, res, b); }); });
  t.after(() => { srv.closeAllConnections?.(); srv.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const up = `http://127.0.0.1:${srv.address().port}`;
  fs.mkdirSync(path.join(root, "state"));
  fs.writeFileSync(path.join(root, ".env"), `QQBOT_CLIENT_SECRET=nope\nDEEPSEEK_API_KEY=${FAKE_DS}\nexport QIANFAN_API_KEY="${FAKE_QF}"\n`, { mode: 0o600 });
  const db = new DatabaseSync(path.join(root, "state/openclaw.sqlite"));
  try {
    db.exec("CREATE TABLE secret_store_entries (scope_kind TEXT, scope_id TEXT, name TEXT, value TEXT, kind TEXT, created_at_ms INT, updated_at_ms INT, updated_by TEXT, deleted_at_ms INT, allowed_hosts TEXT)");
    db.prepare("INSERT INTO secret_store_entries VALUES ('team','',?,?,'env',1,1,'cli',NULL,NULL)").run("XIAOMI_MIMO_API_KEY", FAKE_MI);
  } finally { db.close(); }
  const cfg = path.join(root, "openclaw.json");
  fs.writeFileSync(cfg, JSON.stringify({ models: { providers: { deepseek: { api: "openai-completions", baseUrl: up + "/" }, "xiaomi-token-plan": { api: "openai-completions", baseUrl: up + "/v1" }, anthro: { api: "anthropic-messages" } } } }));
  const env = { OPENCLAW_HOME: root, MODEL_PING_DIRECT_TIMEOUT_MS: "1500", ...extraEnv };
  const ctx = vm.createContext({ process: { env }, fs, path, CFG: cfg, fetch, AbortController, setTimeout, clearTimeout, JSON, String, Math, Object, Date, Number,
    PING_MSG: "Connectivity test. Reply with exactly: ok",
    pingSan: s => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 300), pingStr: (v, n = 120) => typeof v === "string" && v ? v.slice(0, n) : null });
  const api = vm.runInContext(seg + ";({directPing, directKey, DIRECT_PROV, GATEWAY_STALL_MSG})", ctx, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  return { api, seen, up, root, cfg };
}
const base0 = (ref, prov, id) => ({ modelRef: ref, requestedModel: id, provider: prov, runtime: "openclaw", mode: "raw", timeoutMs: 20000, at: "x" });
const okReply = (res, model) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ model, choices: [{ message: { content: "ok" }, finish_reason: "length" }], usage: { prompt_tokens: 9, completion_tokens: 1 } })); };

test("deepseek: 1-token completion, key from .env, shape + via:direct", async t => {
  const f = await fixture(t, (q, r) => okReply(r, "deepseek-chat"));
  const out = await f.api.directPing("deepseek/deepseek-chat", "deepseek", "deepseek-chat", Date.now(), base0("deepseek/deepseek-chat", "deepseek", "deepseek-chat"));
  assert.equal(out.ok, true); assert.equal(out.via, "direct"); assert.equal(out.mode, "direct"); assert.equal(out.upstreamModel, "deepseek-chat");
  assert.equal(out.modelMismatch, false); assert.match(out.note, /只证明上游接口和 key/); assert.ok(Number.isFinite(out.latencyMs)); assert.equal(out.timeoutMs, 1500);
  assert.equal(f.seen[0].url, "/chat/completions"); assert.equal(f.seen[0].auth, `Bearer ${FAKE_DS}`);
  assert.equal(f.seen[0].body.max_tokens, 1); assert.equal(f.seen[0].body.model, "deepseek-chat");
  assert.ok(!JSON.stringify(out).includes(FAKE_DS)); assert.match(out.credentialSource, /\.env#DEEPSEEK_API_KEY$/);
});
test("xiaomi: key from sqlite secret store (read-only), baseUrl from config", async t => {
  const f = await fixture(t, (q, r) => okReply(r, "mimo-v2-other"));
  const out = await f.api.directPing("xiaomi-token-plan/mimo-v2", "xiaomi-token-plan", "mimo-v2", Date.now(), base0("xiaomi-token-plan/mimo-v2", "xiaomi-token-plan", "mimo-v2"));
  assert.equal(out.ok, true); assert.equal(f.seen[0].url, "/v1/chat/completions"); assert.equal(f.seen[0].auth, `Bearer ${FAKE_MI}`);
  assert.equal(out.modelMismatch, true); assert.match(out.credentialSource, /secret_store_entries\/XIAOMI_MIMO_API_KEY$/);
});
test("qianfan: quoted export in .env parsed; default baseUrl used when not in config", async t => {
  const f = await fixture(t, () => {});
  const { key } = await f.api.directKey("qianfan"); assert.equal(key, FAKE_QF);
  assert.equal(f.api.DIRECT_PROV.qianfan.defBase, "https://qianfan.baidubce.com/v2");
});
test("upstream error echoing key is redacted", async t => {
  const f = await fixture(t, (q, r) => { r.writeHead(401, { "content-type": "application/json" }); r.end(JSON.stringify({ error: { message: `invalid key ${FAKE_DS} (Bearer ${FAKE_DS})` } })); });
  const out = await f.api.directPing("deepseek/x", "deepseek", "x", Date.now(), base0("deepseek/x", "deepseek", "x"));
  assert.equal(out.ok, false); assert.equal(out.httpStatus, 401); assert.match(out.error, /HTTP 401/);
  assert.ok(!JSON.stringify(out).includes(FAKE_DS), "key leaked: " + out.error);
});
test("timeout → status timeout, no key leak", async t => {
  const f = await fixture(t, () => {});
  const out = await f.api.directPing("deepseek/x", "deepseek", "x", Date.now(), base0("deepseek/x", "deepseek", "x"));
  assert.equal(out.status, "timeout"); assert.ok(!JSON.stringify(out).includes(FAKE_DS));
});
test("missing key → stage key error, no upstream call", async t => {
  const f = await fixture(t, (q, r) => okReply(r, "x"));
  fs.writeFileSync(path.join(f.root, ".env"), "OTHER=1\n");
  const out = await f.api.directPing("deepseek/x", "deepseek", "x", Date.now(), base0("deepseek/x", "deepseek", "x"));
  assert.equal(out.ok, false); assert.equal(out.stage, "key"); assert.equal(f.seen.length, 0);
});
test("modelPing wiring: direct for 3 providers before session create; gateway scope warning; no serial ping", () => {
  const mp = src.slice(src.indexOf("async function modelPing(b) {"), src.indexOf("// ===== HOSINO-MODEL-MANAGE v1"));
  const d = mp.indexOf("directPing("), c = mp.indexOf('call("sessions.create"');
  assert.ok(d > 0 && d < c); assert.match(mp, /DIRECT_PROV\[prov\] && !runtime/);
  assert.match(src, /GATEWAY_STALL_PROV = new Set\(\["xai"\]\)/); assert.match(src, /warn: "gateway_stall", warnMessage: GATEWAY_STALL_MSG/);
  assert.match(src, /此检测通过网关执行，耗时和结果包含网关路由；与供应商直连检测的验证范围不同。/);
  assert.equal((mp.match(/\.\.\.stall/g) || []).length, 2);
  assert.ok(!/ping_busy|PING_COOLDOWN/.test(src)); assert.match(src, /PING_MAX = 2/);
  assert.ok(!/console\.(log|error)\([^)]*\bkey\b(?!\))/.test(src.slice(src.indexOf("HOSINO-MODEL-PING-DIRECT"), src.indexOf("async function modelPing"))));
});
