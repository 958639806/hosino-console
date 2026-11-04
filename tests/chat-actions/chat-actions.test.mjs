import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
import { makeChatActions } from "../../chat-actions.mjs";
const sha = v => crypto.createHash("sha256").update(String(v)).digest("hex");
const G = "a".repeat(32), SRC = "ROBOT1.0_inbound!", T0 = 1_800_000_000_000;
function setup(t, { to = `qqbot:group:${G}`, now = T0 + 30e3, qq = () => ({ status: 200, body: {} }), rewind, ops } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcpt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = sha(JSON.stringify(["default", to.toLowerCase(), SRC]));
  const o = ops ?? { [sha("a")]: { type: "delivery", state: "confirmed", text: "你好呀", messageId: "OUT1", preparedAt: T0 }, [sha("b")]: { type: "delivery", state: "confirmed", text: "[开心] 再见", messageId: "OUT2", preparedAt: T0 + 1000 } };
  fs.writeFileSync(path.join(dir, key + ".json"), JSON.stringify({ v: 1, key, operations: o }));
  const msgs = [
    { role: "user", content: "hi", timestamp: T0 - 1000, __openclaw: { id: "u1", transport: { messageId: SRC } } },
    { role: "assistant", content: [{ type: "text", text: "你好呀\n[开心]再见" }], timestamp: T0, __openclaw: { id: "a1" } },
  ];
  const calls = [], http = [];
  const call = async (m, p) => { calls.push([m, p]);
    if (m === "chat.history") return { messages: msgs };
    if (m === "sessions.list") return { sessions: [{ key: "k", channel: "qqbot", deliveryContext: { channel: "qqbot", to, accountId: "default" } }] };
    if (m === "sessions.rewind") { if (rewind) return rewind(); return { editorText: "hi" }; }
    if (m === "chat.send") return { runId: "r1" };
    throw new Error("unexpected " + m); };
  const fetchImpl = async (url, init) => { assert.ok(url.startsWith("http://fake-qq/"), "never real QQ: " + url); http.push([init.method, url]);
    if (url.endsWith("/token")) return new Response(JSON.stringify({ access_token: "T", expires_in: 7200 }), { status: 200 });
    const r = qq(url); return new Response(JSON.stringify(r.body), { status: r.status }); };
  const ca = makeChatActions({ call, readCfg: () => ({ channels: { qqbot: { appId: "1", clientSecret: "x" } } }), receiptsDir: dir, fetchImpl, now: () => now, qqApi: "http://fake-qq", qqTokenUrl: "http://fake-qq/token" });
  return { ca, calls, http };
}
test("self recall deletes every receipt segment of the reply", async t => {
  const { ca, http } = setup(t);
  const v = await ca.recallable("k", "a1"); assert.equal(v.self.available, true); assert.equal(v.self.parts, 2); assert.equal(v.admin.reason, "wrong_role");
  const r = await ca.recall({ key: "k", id: "a1", mode: "self", confirm: true });
  assert.deepEqual([r.ok, r.recalled], [true, 2]);
  assert.deepEqual(http.filter(h => h[0] === "DELETE").map(h => h[1]), [`http://fake-qq/v2/groups/${G}/messages/OUT1`, `http://fake-qq/v2/groups/${G}/messages/OUT2`]);
});
test("c2c uses users path", async t => {
  const { ca, http } = setup(t, { to: `qqbot:c2c:${G}` });
  await ca.recall({ key: "k", id: "a1", mode: "self", confirm: true });
  assert.ok(http.some(h => h[1].includes(`/v2/users/${G}/messages/OUT1`)));
});
test("expired window is refused locally without calling QQ", async t => {
  const { ca, http } = setup(t, { now: T0 + 119e3 });
  await assert.rejects(ca.recall({ key: "k", id: "a1", mode: "self", confirm: true }), e => e.code === "window_expired" && e.http === 410);
  assert.equal(http.length, 0);
});
test("missing receipts -> no_message_id", async t => {
  const { ca } = setup(t, { ops: {} });
  await assert.rejects(ca.recall({ key: "k", id: "a1", mode: "self", confirm: true }), e => e.code === "no_message_id" && e.http === 409);
});
test("admin recall: group user message, QQ 40062003 -> no_permission", async t => {
  const { ca, http } = setup(t, { qq: () => ({ status: 400, body: { code: 40062003 } }) });
  const v = await ca.recallable("k", "u1"); assert.equal(v.admin.available, true);
  await assert.rejects(ca.recall({ key: "k", id: "u1", mode: "admin", confirm: true }), e => e.code === "no_permission" && e.http === 403);
  assert.ok(http.some(h => h[1].endsWith(`/messages/${encodeURIComponent(SRC)}`)));
});
test("admin in c2c -> not_group", async t => {
  const { ca, http } = setup(t, { to: `qqbot:c2c:${G}` });
  await assert.rejects(ca.recall({ key: "k", id: "u1", mode: "admin", confirm: true }), e => e.code === "not_group");
  assert.equal(http.length, 0);
});
test("QQ 40064004 maps to window_expired", async t => {
  const { ca } = setup(t, { qq: () => ({ status: 400, body: { code: 40064004 } }) });
  await assert.rejects(ca.recall({ key: "k", id: "a1", mode: "self", confirm: true }), e => e.code === "window_expired");
});
test("confirm and mode are validated", async t => {
  const { ca } = setup(t);
  await assert.rejects(ca.recall({ key: "k", id: "a1", mode: "self" }), e => e.code === "confirm_required");
  await assert.rejects(ca.recall({ key: "k", id: "a1", mode: "x", confirm: true }), e => e.code === "bad_mode");
  await assert.rejects(ca.recallable("k", "nope"), e => e.code === "message_not_found");
});
test("regenerate rewinds to the user turn then resends console-only by default", async t => {
  const { ca, calls } = setup(t);
  const r = await ca.regenerate({ key: "k", id: "a1", confirm: true });
  assert.deepEqual(r.rewoundTo, "u1");
  const rw = calls.find(c => c[0] === "sessions.rewind"); assert.deepEqual(rw[1], { sessionKey: "k", entryId: "u1" });
  const s = calls.find(c => c[0] === "chat.send"); assert.equal(s[1].deliver, false); assert.equal(s[1].message, "hi");
  assert.ok(!calls.some(c => /subscribe/.test(c[0])));
});
test("regenerate busy maps to 409", async t => {
  const { ca, calls } = setup(t, { rewind: () => { throw new Error("Rewind is unavailable while the agent is working."); } });
  await assert.rejects(ca.regenerate({ key: "k", id: "a1", confirm: true }), e => e.code === "busy" && e.http === 409);
  assert.ok(!calls.some(c => c[0] === "chat.send"));
});
test("admin recall has no 2-minute window (1 hour later still available, secondsLeft null, QQ called)", async t => {
  const { ca, http } = setup(t, { now: T0 + 3600e3 });
  const v = await ca.recallable("k", "u1"); assert.equal(v.admin.available, true); assert.equal(v.admin.secondsLeft, null); assert.equal(v.admin.reason, null);
  assert.equal((await ca.recallable("k", "a1")).self.reason, "window_expired");
  const r = await ca.recall({ key: "k", id: "u1", mode: "admin", confirm: true }); assert.equal(r.ok, true);
  assert.ok(http.some(h => h[0] === "DELETE"));
});
