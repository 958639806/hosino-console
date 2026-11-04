import test from "node:test"; import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import net from "node:net"; import crypto from "node:crypto"; import { spawn } from "node:child_process"; import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import runtime from "./helpers/runtime.cjs";
import { makeMemorySearch, validateSearch, buildFilter, redact } from "../memory-search.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_KEY = "bce-v3/ALTAK-FAKEfake1234/abcdefFAKE";
const cfg = (base = "http://emb") => ({ plugins: { entries: { "openclaw-mem0": { config: { oss: { embedder: { provider: "openai", config: { apiKey: FAKE_KEY, baseURL: base + "/v2", model: "qwen3-embedding-8b", embeddingDims: 4 } } } } } } } });
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
function mk({ emb, qd, t = { v: 1000 }, logs = [], ...o } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: init.body && JSON.parse(init.body) });
    if (url.startsWith("http://emb/")) return emb ? emb(url, init) : J({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] });
    if (url.startsWith("http://qd/")) return qd ? qd(url, init) : J({ result: { points: [{ id: "p1", score: 0.9, payload: { data: "M", user_id: "u1", createdAt: "2026-10-01T00:00:00Z", oc_visibility: "group", oc_source_channel: "qqbot" } }, { id: 7, score: 0.2, payload: { data: "N", user_id: "u2" } }] } });
    throw new Error("unexpected " + url); };
  const ms = makeMemorySearch({ readCfg: () => cfg(), qdrantUrl: "http://qd", collection: "col", fetchImpl, now: () => t.v, log: (...a) => logs.push(a.join(" ")), ...o });
  return { ms, calls, t, logs };
}
test("validation: 400 on bad params", () => {
  const bad = [null, [], {}, { query: "" }, { query: "x".repeat(501) }, { query: "a", scope: "x" }, { query: "a", scope: "users" }, { query: "a", scope: "users", user_ids: [] },
    { query: "a", scope: "users", user_ids: Array.from({ length: 51 }, (_, i) => "u" + i) }, { query: "a", scope: "users", user_ids: ["bad id"] }, { query: "a", scope: "users", user_ids: [1] },
    { query: "a", user_ids: ["u1"] }, { query: "a", limit: 0 }, { query: "a", limit: 51 }, { query: "a", limit: 2.5 }, { query: "a", minScore: 2 }, { query: "a", minScore: "x" }, { query: "a", minScore: -0.1 }, { q: "a", query: "b" }, { q: "" },
    { query: "a", visibility: "public" }, { query: "a", since: "nope" }];
  for (const b of bad) assert.throws(() => validateSearch(b), e => e.http === 400, JSON.stringify(b));
  assert.equal(validateSearch({ q: "x".repeat(500) }).query.length, 500); assert.equal(validateSearch({ q: "hi" }).limit, 10); assert.throws(() => validateSearch({ q: "字".repeat(501) }), e => e.http === 400);
  const ok = validateSearch({ query: " hi ", scope: "users", user_ids: ["u1", "u1", "qqbot:ABC"], limit: 50, since: "2026-10-01" });
  assert.deepEqual([ok.query, ok.user_ids, ok.limit, ok.since], ["hi", ["u1", "qqbot:ABC"], 50, "2026-10-01T00:00:00.000Z"]);
  assert.equal(validateSearch({ query: "a", scope: "users", user_ids: Array.from({ length: 50 }, (_, i) => "u" + i) }).user_ids.length, 50);
});
test("filters: all=none, users=match any, visibility, since", () => {
  assert.equal(buildFilter({ scope: "all", user_ids: [] }), undefined);
  assert.deepEqual(buildFilter({ scope: "users", user_ids: ["a", "b"], visibility: "private", since: "2026-01-01T00:00:00.000Z" }),
    { must: [{ key: "user_id", match: { any: ["a", "b"] } }, { key: "createdAt", range: { gte: "2026-01-01T00:00:00.000Z" } }], must_not: [{ key: "oc_visibility", match: { value: "group" } }] });
  assert.deepEqual(buildFilter({ scope: "all", user_ids: [], visibility: "group" }), { must: [{ key: "oc_visibility", match: { value: "group" } }] });
});
test("search all: shape, minScore, request shape, bearer only to embedding", async () => {
  const { ms, calls, logs } = mk();
  const r = await ms.search({ query: "天气", minScore: 0.5 }, "s1");
  assert.deepEqual(Object.keys(r).sort(), ["cached", "count", "results", "scope", "tookMs"]);
  assert.equal(r.count, 1); assert.deepEqual(r.results[0], { id: "p1", score: 0.9, memory: "M", user_id: "u1", createdAt: "2026-10-01T00:00:00Z", visibility: "group", channel: "qqbot" });
  assert.deepEqual(Object.keys(r.tookMs), ["embed", "search"]);
  const [e, q] = calls;
  assert.equal(e.url, "http://emb/v2/embeddings"); assert.equal(e.init.headers.authorization, "Bearer " + FAKE_KEY); assert.deepEqual(e.body, { model: "qwen3-embedding-8b", input: ["天气"] });
  assert.equal(q.url, "http://qd/collections/col/points/query"); assert.equal(q.init.headers.authorization, undefined);
  assert.deepEqual([q.body.limit, q.body.score_threshold, q.body.filter, q.body.with_vector], [10, 0.5, undefined, false]);
  assert.equal(q.init.method, "POST"); assert.ok(!calls.some(c => /upsert|delete|overwrite|set_payload/.test(c.url)));
  assert.ok(logs.every(l => !l.includes("M") || !l.includes("天气")) && logs.every(l => !l.includes("天气") && !l.includes(FAKE_KEY)));
});
test("search users: multiple ids passed as match.any", async () => {
  const { ms, calls } = mk();
  const r = await ms.search({ query: "x", scope: "users", user_ids: ["u1", "u2"] }, "s");
  assert.equal(r.scope, "users"); assert.equal(r.count, 2); assert.equal(r.results[1].id, "7");
  assert.deepEqual(calls[1].body.filter, { must: [{ key: "user_id", match: { any: ["u1", "u2"] } }] });
});
test("query vector cache 5 min", async () => {
  const { ms, calls, t } = mk();
  await ms.search({ query: "q" }, "s"); const r2 = await ms.search({ query: "q" }, "s");
  assert.equal(r2.cached, true); assert.equal(calls.filter(c => c.url.startsWith("http://emb")).length, 1);
  t.v += 5 * 60e3 + 1; await ms.search({ query: "q" }, "s");
  assert.equal(calls.filter(c => c.url.startsWith("http://emb")).length, 2);
});
test("rate limit 429 with retryAfter, per session, window slides", async () => {
  const { ms, t } = mk({ rate: { max: 2, windowMs: 60e3 } });
  await ms.search({ query: "a" }, "s"); await ms.search({ query: "b" }, "s");
  await assert.rejects(ms.search({ query: "c" }, "s"), e => e.http === 429 && e.body.retryAfterSec === 60);
  await ms.search({ query: "c" }, "other");
  t.v += 60e3 + 1; await ms.search({ query: "d" }, "s");
});
test("failed search refunds quota; bad params don't consume", async () => {
  let fail = true;
  const { ms } = mk({ rate: { max: 1, windowMs: 60e3 }, qd: () => fail ? J({ status: { error: "boom" } }, 500) : J({ result: { points: [] } }) });
  await assert.rejects(ms.search({ query: "a" }, "s"), e => e.http === 502);
  await assert.rejects(ms.search({ query: "" }, "s"), e => e.http === 400);
  fail = false; const r = await ms.search({ query: "a" }, "s"); assert.equal(r.count, 0);
  await assert.rejects(ms.search({ query: "a" }, "s"), e => e.http === 429);
});
test("502 upstream errors never leak key/token", async () => {
  const leaky = JSON.stringify({ error: { message: `invalid key ${FAKE_KEY} Bearer abc.def sk-livesecret123 token=zzz9 "apiKey":"q1w2e3r4"` } });
  const { ms, logs } = mk({ emb: () => new Response(leaky, { status: 401 }) });
  const e = await ms.search({ query: "a" }, "s").catch(x => x);
  assert.equal(e.http, 502);
  for (const s of [FAKE_KEY, "abc.def", "sk-livesecret123", "zzz9", "q1w2e3r4"]) { assert.ok(!e.message.includes(s), s + " in " + e.message); assert.ok(!logs.join("|").includes(s)); }
  const { ms: m2 } = mk({ emb: () => { throw new Error("connect ECONNREFUSED with " + FAKE_KEY); } });
  const e2 = await m2.search({ query: "a" }, "s").catch(x => x); assert.equal(e2.http, 502); assert.ok(!e2.message.includes(FAKE_KEY));
  const { ms: m3 } = mk({ emb: () => J({ data: [{ embedding: [1, 2] }] }) });
  assert.equal((await m3.search({ query: "a" }, "s").catch(x => x)).http, 502);
});
test("missing embedder config -> 502", async () => {
  const ms = makeMemorySearch({ readCfg: () => ({}), qdrantUrl: "http://qd", collection: "c", fetchImpl: async () => { throw new Error("no"); } });
  assert.equal((await ms.search({ query: "a" }).catch(x => x)).http, 502);
});
test("redact patterns", () => {
  const s = redact('Authorization: Bearer xyz.123 key=abc value="v1" sk-abcdef123 bce-v3/A/B secretval', ["secretval"]);
  for (const x of ["xyz.123", "abc", "v1", "sk-abcdef123", "bce-v3/A/B", "secretval"]) assert.ok(!s.includes(x), x + " :: " + s);
});
test("users facet", async () => {
  const { ms, calls } = mk({ qd: () => J({ result: { hits: [{ value: "u1", count: 9 }, { value: "u2", count: 1 }] } }) });
  assert.deepEqual(await ms.users(), { users: [{ user_id: "u1", count: 9 }, { user_id: "u2", count: 1 }], count: 2 });
  assert.deepEqual(calls[0].body, { key: "user_id", limit: 1000, exact: true });
});

// ---- 真实 server.mjs 端到端（模拟 Qdrant + embedding）----
const NM = process.env.NM || path.join(REPO, "node_modules");
const req = createRequire(path.join(REPO, "package.json"));
test("real server: 401 unauth, 400, 200 search/users, 502", async t => {
  const bcrypt = req("bcryptjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memsearch-"));
  let child, mock;
  t.after(async () => { await runtime.stopChild(child); mock?.closeAllConnections?.(); mock?.close(); fs.rmSync(root, { recursive: true, force: true }); });
  mock = http.createServer((rq, rs) => { let b = ""; rq.on("data", d => b += d); rq.on("end", () => {
    rs.setHeader("content-type", "application/json");
    if (rq.url === "/v2/embeddings") { assert.equal(rq.headers.authorization, "Bearer " + FAKE_KEY); return rs.end(JSON.stringify({ data: [{ embedding: [0, 0, 0, 1] }] })); }
    if (rq.url === "/collections/col/points/query") { const j = JSON.parse(b); if (j.limit === 13) { rs.statusCode = 500; return rs.end("{}"); } return rs.end(JSON.stringify({ result: { points: [{ id: "a", score: 0.8, payload: { data: "M", user_id: "u1" } }] } })); }
    if (rq.url === "/collections/col/facet") return rs.end(JSON.stringify({ result: { hits: [{ value: "u1", count: 3 }] } }));
    rs.statusCode = 404; rs.end("{}"); }); });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening"); const mp = mock.address().port;
  runtime.copyRuntime(REPO, root);
  fs.mkdirSync(path.join(root, "public")); fs.writeFileSync(path.join(root, "public/index.html"), "x");
  fs.writeFileSync(path.join(root, "cfg.json"), JSON.stringify({ gateway: { auth: { token: "fake" } }, ...cfg(`http://127.0.0.1:${mp}`) }));
  const l = net.createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening"); const port = l.address().port; await new Promise(r => l.close(r));
  const pw = crypto.randomBytes(12).toString("hex");
  child = spawn(process.execPath, ["server.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(pw, 4), NODE_PATH: NM, HOSINO_QUIET_WINDOW: "off",
    OPENCLAW_WORKSPACE: path.join(root, "ws"), OPENCLAW_CONFIG: path.join(root, "cfg.json"), QQ_SEND_ENABLED: "0", QDRANT_URL: `http://127.0.0.1:${mp}`, MEM_COLLECTION: "col", GATEWAY_URL: "wss://127.0.0.1:1" } });
  let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
  for (let i = 0; !logs.includes("hosino-console on") && i < 150; i++) { assert.equal(child.exitCode, null, logs); await new Promise(r => setTimeout(r, 20)); }
  const base = `http://127.0.0.1:${port}`;
  const post = (h, b) => fetch(base + "/api/memory/search", { method: "POST", headers: { "x-hs": "1", ...h }, body: JSON.stringify(b) });
  assert.equal((await post({}, { query: "a" })).status, 401);
  assert.equal((await fetch(base + "/api/memory/users")).status, 401);
  const lr = await fetch(base + "/api/login", { method: "POST", headers: { "x-hs": "1" }, body: JSON.stringify({ password: pw }) }); assert.equal(lr.status, 200);
  const ck = { cookie: lr.headers.get("set-cookie").split(";")[0] };
  assert.equal((await post(ck, { query: "" })).status, 400);
  assert.equal((await post(ck, { query: "a", scope: "users", user_ids: ["bad id"] })).status, 400);
  const ok = await post(ck, { query: "a", scope: "users", user_ids: ["u1"] }); assert.equal(ok.status, 200);
  const j = await ok.json(); assert.equal(j.count, 1); assert.equal(j.results[0].user_id, "u1");
  assert.equal((await post(ck, { query: "a", limit: 13 })).status, 502);
  const u = await fetch(base + "/api/memory/users", { headers: ck }); assert.equal(u.status, 200); assert.deepEqual((await u.json()).users, [{ user_id: "u1", count: 3 }]);
  const nx = await fetch(base + "/api/memory/search", { method: "POST", headers: ck, body: "{}" }); assert.equal(nx.status, 403); assert.equal((await nx.json()).code, "missing_xhs");
  assert.ok(!logs.includes(FAKE_KEY) && !logs.includes(pw));
});

test("collection missing -> 502 collection_missing with fixed message", async () => {
  const { ms } = mk({ qd: () => J({ status: { error: "Not found: Collection `col` doesn't exist!" } }, 404) });
  const e = await ms.search({ q: "a" }, "s").catch(x => x);
  assert.deepEqual([e.http, e.code, e.message], [502, "collection_missing", "记忆库集合不存在或未就绪"]);
  const e2 = await ms.users().catch(x => x); assert.equal(e2.code, "collection_missing");
});

test("real server: quiet window blocks writes (423 quiet_window) but not reads/search", async t => {
  const bcrypt = req("bcryptjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memsearch-q-"));
  let child, mock;
  t.after(async () => { await runtime.stopChild(child); mock?.closeAllConnections?.(); mock?.close(); fs.rmSync(root, { recursive: true, force: true }); });
  mock = http.createServer((rq, rs) => { let b = ""; rq.on("data", d => b += d); rq.on("end", () => { rs.setHeader("content-type", "application/json");
    if (rq.url === "/v2/embeddings") return rs.end(JSON.stringify({ data: [{ embedding: [0, 0, 0, 1] }] }));
    if (rq.url.endsWith("/facet")) return rs.end(JSON.stringify({ result: { hits: [] } }));
    return rs.end(JSON.stringify({ result: { points: [] } })); }); });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening"); const mp = mock.address().port;
  runtime.copyRuntime(REPO, root);
  fs.mkdirSync(path.join(root, "public")); fs.writeFileSync(path.join(root, "public/index.html"), "x");
  fs.writeFileSync(path.join(root, "cfg.json"), JSON.stringify({ gateway: { auth: { token: "fake" } }, ...cfg(`http://127.0.0.1:${mp}`) }));
  const l = net.createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening"); const port = l.address().port; await new Promise(r => l.close(r));
  const pw = crypto.randomBytes(12).toString("hex");
  child = spawn(process.execPath, ["server.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), LOGIN_HASH: bcrypt.hashSync(pw, 4), NODE_PATH: NM, HOSINO_QUIET_WINDOW: "00:00-23:59",
    OPENCLAW_WORKSPACE: path.join(root, "ws"), OPENCLAW_CONFIG: path.join(root, "cfg.json"), QQ_SEND_ENABLED: "0", QDRANT_URL: `http://127.0.0.1:${mp}`, MEM_COLLECTION: "col", GATEWAY_URL: "wss://127.0.0.1:1" } });
  let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
  for (let i = 0; !logs.includes("hosino-console on") && i < 150; i++) await new Promise(r => setTimeout(r, 20));
  const base = `http://127.0.0.1:${port}`;
  const lr = await fetch(base + "/api/login", { method: "POST", headers: { "x-hs": "1" }, body: JSON.stringify({ password: pw }) }); assert.equal(lr.status, 200, "login is not a W write");
  const h = { cookie: lr.headers.get("set-cookie").split(";")[0], "x-hs": "1" };
  const w = await fetch(base + "/api/aliases/set", { method: "POST", headers: h, body: JSON.stringify({ key: "k", alias: "a" }) });
  assert.equal(w.status, 423); const wj = await w.json(); assert.equal(wj.code, "quiet_window"); assert.ok(wj.retryAfterMs > 0);
  assert.ok(!fs.existsSync(path.join(root, "data", "aliases.json")), "nothing written");
  const s1 = await fetch(base + "/api/memory/search", { method: "POST", headers: h, body: JSON.stringify({ q: "a" }) }); assert.equal(s1.status, 200, "search is a read");
  assert.equal((await fetch(base + "/api/memory/users", { headers: h })).status, 200);
});
