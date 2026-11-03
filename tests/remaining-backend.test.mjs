import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { makeChatActions } from "../chat-actions.mjs";
import { makeMemorySearch, redact } from "../memory-search.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const config = (baseURL, dims = 2, apiKey = "test-only-embedding-key") => ({ plugins: { entries: { "openclaw-mem0": { config: { oss: { embedder: { config: { baseURL, embeddingDims: dims, model: "same-model-name", apiKey } } } } } } } });

test("memory cache follows live endpoint, dimension and credential changes", async () => {
  let current = config("http://one"), embeddings = 0;
  const vectors = [];
  const ms = makeMemorySearch({ readCfg: () => current, qdrantUrl: "http://qdrant", collection: "memory", fetchImpl: async (url, init) => {
    if (url.includes("/embeddings")) { embeddings++; return json({ data: [{ embedding: Array(current.plugins.entries["openclaw-mem0"].config.oss.embedder.config.embeddingDims).fill(embeddings) }] }); }
    vectors.push(JSON.parse(init.body).query); return json({ result: { points: [] } });
  } });
  await ms.search({ q: "same query" }, "s");
  assert.equal((await ms.search({ q: "same query" }, "s")).cached, true);
  current = config("http://two");
  assert.equal((await ms.search({ q: "same query" }, "s")).cached, false);
  current = config("http://two", 3);
  await ms.search({ q: "same query" }, "s");
  current = config("http://two", 3, "other-test-only-key");
  await ms.search({ q: "same query" }, "s");
  assert.equal(embeddings, 4);
  assert.deepEqual(vectors, [[1, 1], [1, 1], [2, 2], [3, 3, 3], [4, 4, 4]]);
  assert.ok([...ms._state.vcache.keys()].every(key => /^[a-f0-9]{64}$/.test(key)));
});

test("memory rejects nonnumeric/nonfinite vectors before querying or caching", async () => {
  for (const vector of [[null, 1], ["0.1", 1], [Infinity, 1], [NaN, 1]]) {
    let queries = 0;
    const ms = makeMemorySearch({ readCfg: () => config("http://embedding"), qdrantUrl: "http://qdrant", collection: "memory", fetchImpl: async url => {
      if (url.includes("/embeddings")) return { ok: true, status: 200, json: async () => ({ data: [{ embedding: vector }] }) };
      queries++; return json({ result: { points: [] } });
    } });
    await assert.rejects(ms.search({ q: "q" }), e => e.code === "upstream" && e.http === 502);
    assert.equal(queries, 0); assert.equal(ms._state.vcache.size, 0);
  }
});

test("memory error redaction removes exact keys even when JSON/URI/Base64 encoded", async () => {
  const key = 'ordinary-key-"\\\n/a+b';
  const forms = [key, JSON.stringify(key).slice(1, -1), encodeURIComponent(key), encodeURI(key), Buffer.from(key).toString("base64"), Buffer.from(key).toString("base64url")];
  for (const form of forms) {
    assert.ok(!redact("upstream echoed " + form, [key]).includes(form));
    const logs = [];
    const ms = makeMemorySearch({ readCfg: () => config("http://embedding", 2, key), qdrantUrl: "http://qdrant", collection: "memory", log: (...args) => logs.push(args),
      fetchImpl: async () => json({ error: "upstream echoed " + form }, 401) });
    const error = await ms.search({ q: "q" }).catch(e => e);
    assert.equal(error.http, 502); assert.ok(!error.message.includes(form)); assert.ok(!JSON.stringify(logs).includes(form));
  }
  assert.ok(!redact("upstream echoed \ud800-key", ["\ud800-key"]).includes("\ud800-key"));
});

test("memory rejects malformed successful upstream responses and refunds the search quota", async () => {
  let valid = false;
  const ms = makeMemorySearch({ readCfg: () => config("http://embedding"), qdrantUrl: "http://qdrant", collection: "memory", rate: { max: 1, windowMs: 60_000 }, fetchImpl: async url => {
    if (url.includes("/embeddings")) return json({ data: [{ embedding: [1, 2] }] });
    return json(valid ? { result: { points: [], hits: [] } } : { result: {} });
  } });
  await assert.rejects(ms.search({ q: "q" }), e => e.http === 502 && e.code === "upstream");
  await assert.rejects(ms.users(), e => e.http === 502 && e.code === "upstream");
  valid = true;
  assert.equal((await ms.search({ q: "q" })).count, 0);
  assert.equal((await ms.users()).count, 0);
});

const timestamp = 1_800_000_000_000;
function chatFixture(t, { accountId = "default", preparedAt = timestamp, cfg, fetchImpl, callOverride, timeoutMs, replies, operations } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "console-chat-edge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const to = "qqbot:group:ABCDEF123456", sourceId = "incoming-id";
  const key = crypto.createHash("sha256").update(JSON.stringify([accountId, to.toLowerCase(), sourceId])).digest("hex");
  fs.writeFileSync(path.join(dir, key + ".json"), JSON.stringify({ v: 1, key, operations: operations || { first: { type: "delivery", state: "confirmed", text: "reply", messageId: "out-id", preparedAt } } }));
  const calls = [], http = [];
  const messages = [{ role: "user", content: "question", __openclaw: { id: "user-id", transport: { messageId: sourceId } } }, ...(replies || [{ role: "assistant", content: "reply", __openclaw: { id: "assistant-id" } }])];
  const call = async (method, params) => {
    calls.push([method, params]);
    if (callOverride) { const overridden = callOverride(method, params); if (overridden !== undefined) return overridden; }
    if (method === "chat.history") return { messages };
    if (method === "sessions.list") return { sessions: [{ key: "session-key", deliveryContext: { channel: "qqbot", to, accountId } }] };
    if (method === "sessions.rewind") return { editorText: "question" };
    if (method === "chat.send") return { runId: "run-id" };
    throw new Error("unexpected method");
  };
  const ca = makeChatActions({ call, receiptsDir: dir, readCfg: () => cfg || ({ channels: { qqbot: { appId: "root-app", clientSecret: "root-secret" } } }), now: () => timestamp + 30_000,
    qqApi: "http://fake-qq", qqTokenUrl: "http://fake-qq/token", timeoutMs,
    fetchImpl: async (url, init) => { http.push([url, init]); return fetchImpl ? fetchImpl(url, init) : url.endsWith("/token") ? json({ access_token: "fake-token", expires_in: 7200 }) : json({}); },
  });
  return { ca, calls, http };
}
const recallBody = { key: "session-key", id: "assistant-id", mode: "self", confirm: true };
const regenerateBody = { key: "session-key", id: "assistant-id", confirm: true };

test("QQ recall uses the session account credentials and bounds both HTTP requests", async t => {
  const { ca, http } = chatFixture(t, { accountId: "second", cfg: { channels: { qqbot: { appId: "root-app", clientSecret: "root-secret", accounts: { second: { appId: "second-app", clientSecret: "second-secret" } } } } } });
  await ca.recall(recallBody);
  assert.deepEqual(JSON.parse(http[0][1].body), { appId: "second-app", clientSecret: "second-secret" });
  assert.ok(http.every(([, init]) => init.signal instanceof AbortSignal));
  assert.equal(http[1][1].headers.authorization, "QQBot fake-token");
});

test("QQ recall refuses a missing account instead of using another bot", async t => {
  const { ca, http } = chatFixture(t, { accountId: "missing" });
  await assert.rejects(ca.recall(recallBody), e => e.code === "qq_not_configured" && e.http === 503);
  assert.equal(http.length, 0);
});

test("QQ tokens invalidate after credential rotation or a rejected token", async t => {
  const cfg = { channels: { qqbot: { appId: "fake-app", clientSecret: "first-fake-secret" } } };
  let tokenCount = 0, unauthorized = false;
  const { ca, http } = chatFixture(t, { cfg, fetchImpl: async url => {
    if (url.endsWith("/token")) return json({ access_token: "fake-token-" + ++tokenCount, expires_in: 7200 });
    return json({}, unauthorized ? 401 : 200);
  } });
  await ca.recall(recallBody);
  cfg.channels.qqbot.clientSecret = "second-fake-secret";
  await ca.recall(recallBody);
  assert.equal(tokenCount, 2);
  unauthorized = true;
  await assert.rejects(ca.recall(recallBody), e => e.code === "qq_error");
  unauthorized = false;
  await ca.recall(recallBody);
  assert.equal(tokenCount, 3);
  assert.equal(http.filter(([url]) => url.endsWith("/token")).at(-1)[1].body.includes("second-fake-secret"), true);
  assert.equal(http.at(-1)[1].headers.authorization, "QQBot fake-token-3");
});

test("QQ self recall refuses receipts with missing or invalid timestamps", async t => {
  for (const preparedAt of [null, "nonnumeric", -1]) {
    const { ca, http } = chatFixture(t, { preparedAt });
    const result = await ca.recallable("session-key", "assistant-id");
    assert.equal(result.self.available, false); assert.equal(result.self.reason, "no_message_id");
    await assert.rejects(ca.recall(recallBody), e => e.code === "no_message_id");
    assert.equal(http.length, 0);
  }
});

test("QQ self recall attributes a short receipt to its exact reply, not a later reply containing it", async t => {
  const { ca, http } = chatFixture(t, { replies: [
    { role: "assistant", content: "Hello", __openclaw: { id: "first" } },
    { role: "assistant", content: "Hello world", __openclaw: { id: "assistant-id" } },
  ], operations: {
    first: { type: "delivery", state: "confirmed", text: "Hello", messageId: "first-out", preparedAt: timestamp },
    second: { type: "delivery", state: "confirmed", text: "Hello world", messageId: "second-out", preparedAt: timestamp + 1 },
  } });
  const available = await ca.recallable("session-key", "assistant-id");
  assert.equal(available.self.parts, 1);
  await ca.recall(recallBody);
  assert.deepEqual(http.filter(([, init]) => init.method === "DELETE").map(([url]) => url.split("/").at(-1)), ["second-out"]);
});

test("QQ self recall refuses ambiguous identical replies", async t => {
  const { ca, http } = chatFixture(t, { replies: [
    { role: "assistant", content: "reply", __openclaw: { id: "first" } },
    { role: "assistant", content: "reply", __openclaw: { id: "assistant-id" } },
  ] });
  await assert.rejects(ca.recall(recallBody), e => e.code === "no_message_id");
  assert.equal(http.length, 0);
});

test("QQ nontext replies do not inherit another assistant reply's receipt", async t => {
  const { ca, http } = chatFixture(t, { replies: [
    { role: "assistant", content: [{ type: "image" }], __openclaw: { id: "assistant-id" } },
    { role: "assistant", content: "reply", __openclaw: { id: "other" } },
  ] });
  await assert.rejects(ca.recall(recallBody), e => e.code === "no_message_id");
  assert.equal(http.length, 0);
});

test("QQ timeout aborts a stalled upstream and returns a controlled error", async t => {
  const { ca } = chatFixture(t, { timeoutMs: 5, fetchImpl: async (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }) });
  const keepAlive = setTimeout(() => {}, 1000); t.after(() => clearTimeout(keepAlive));
  await assert.rejects(ca.recall(recallBody), e => e.code === "qq_error" && e.http === 502 && !e.message.includes("TimeoutError"));
});

test("regeneration serializes the destructive rewind/send sequence per session", async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { ca, calls } = chatFixture(t, { callOverride: method => method === "sessions.rewind" ? pending : undefined });
  const first = ca.regenerate(regenerateBody);
  await assert.rejects(ca.regenerate(regenerateBody), e => e.code === "busy" && e.http === 409);
  release({ editorText: "question" }); await first;
  assert.equal(calls.filter(([m]) => m === "sessions.rewind").length, 1);
  assert.equal(calls.filter(([m]) => m === "chat.send").length, 1);
  await ca.regenerate(regenerateBody);
  assert.equal(calls.filter(([m]) => m === "sessions.rewind").length, 2);
});

test("regeneration errors never echo raw gateway values and release the session lock", async t => {
  for (const failingMethod of ["sessions.rewind", "chat.send"]) {
    let failing = true;
    const secret = "ordinary-format-fake-sensitive-value";
    const { ca } = chatFixture(t, { callOverride: method => {
      if (method === failingMethod && failing) throw new Error("upstream echoed " + secret);
    } });
    await assert.rejects(ca.regenerate(regenerateBody), e => e.code === "gateway_error" && e.http === 502 && !e.message.includes(secret));
    failing = false;
    assert.equal((await ca.regenerate(regenerateBody)).ok, true);
  }
});

test("actual log endpoint redacts structured and plain gateway diagnostics", async () => {
  const source = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const redactionSource = source.slice(source.indexOf("const SECRET_TXT ="), source.indexOf("const clip ="));
  const start = source.indexOf('  "GET /api/logs":');
  const routeSource = source.slice(start, source.indexOf('\n  "GET /api/config":', start));
  const handler = vm.runInNewContext(`${redactionSource}\n({${routeSource}})["GET /api/logs"]`, { call: async (method, params) => {
    assert.equal(method, "logs.tail"); assert.equal(params.limit, 200);
    return { file: "fake.log", lines: [JSON.stringify({ message: "api_key=ordinary-fake-key Bearer abc.fake.token", _meta: { logLevelName: "ERROR" } }), "password=ordinary-fake-password token=ordinary-fake-token"] };
  } });
  const result = await handler(new URL("http://console/api/logs"));
  assert.equal(result.lines.length, 2);
  for (const value of ["ordinary-fake-key", "abc.fake.token", "ordinary-fake-password", "ordinary-fake-token"]) assert.ok(!JSON.stringify(result).includes(value));
});
