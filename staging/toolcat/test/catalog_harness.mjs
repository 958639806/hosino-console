// Offline harness: evaluates the real resolveQQClaudeDescriptorCatalog/observe code from a dist copy with stubs.
import fs from "node:fs"; import { createHash } from "node:crypto";
const file = process.argv[2]; const src = fs.readFileSync(file, "utf8");
const start = src.indexOf("const QQ_CLAUDE_DESCRIPTOR_CATALOGS"); const end = src.indexOf("const TOOL_CACHE_TTL_MS");
const stableStringify = v => JSON.stringify(v, Object.keys(v ?? {}).sort ? undefined : undefined);
const readMcpLoopbackToolName = t => t.name; const normalizeToolPolicyName = n => String(n).toLowerCase();
const logs = []; const con = { info: m => logs.push(m) };
const mod = new Function("createHash","stableStringify","readMcpLoopbackToolName","normalizeToolPolicyName","console",
  src.slice(start, end) + "\nreturn { resolveQQClaudeDescriptorCatalog, observeQQClaudeMcpCatalog };")(createHash, v=>JSON.stringify(v), readMcpLoopbackToolName, normalizeToolPolicyName, con);
const SK = "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5"; const OWNER = "4330BBC52465D583F003C0A68650DF70", MEMBER = "FB597EAB1D23BDAAFAKE000000000000";
globalThis[Symbol.for("openclaw.qqGroupOwnerGuard")] = { active: true, unifiedToolsReady: true, readScopesReady: true, isFullCatalogGroup: sk => sk === SK, isCurrentOwner: c => c.requester.senderId === OWNER };
const names = n => Array.from({ length: n }, (_, i) => "tool_" + String(i).padStart(2, "0"));
const ownerOnly = ["tool_59", "tool_60"];
const mkTools = list => list.map(name => ({ name, description: "d " + name, parameters: { type: "object" }, execute: async () => ({ ok: name }) }));
const schemaOf = tools => tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.parameters }));
const ctx = (sender, isOwner, i) => ({ qqDescriptorPolicy: {}, modelProvider: "claude-cli", messageProvider: "qqbot", trigger: "user", sessionKey: SK, sessionId: "s1", accountId: "default",
  runId: "run" + i, currentMessageId: "m" + i, senderIsOwner: isOwner, channelContext: { sender: { id: sender } }, nativeCronCreatorToolAllowlist: null });
const params = c => ({ context: c, cfg: { x: 1 }, grantToken: "g", isGrantCurrent: () => true });
const hash = list => createHash("sha256").update(JSON.stringify([...list].sort())).digest("hex").slice(0, 12);
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const ownerTools = mkTools(names(61)), memberTools = mkTools(names(59));
const o = mod.resolveQQClaudeDescriptorCatalog(params(ctx(OWNER, true, 1)), "exact", ownerTools, schemaOf(ownerTools));
mod.observeQQClaudeMcpCatalog(params(ctx(OWNER, true, 1)), "exact", o.toolSchema, o.proof);
const m = mod.resolveQQClaudeDescriptorCatalog(params(ctx(MEMBER, false, 2)), "exact", memberTools, schemaOf(memberTools));
mod.observeQQClaudeMcpCatalog(params(ctx(MEMBER, false, 2)), "exact", m.toolSchema, m.proof);
console.log("owner:", o.proof.catalogState, o.tools.length, hash(o.tools.map(t => t.name)), "| member:", m.proof.catalogState, m.tools.length, hash(m.tools.map(t => t.name)));
ok(o.proof.catalogState === "captured", "owner turn with nativeCronCreatorToolAllowlist=null is captured");
ok(m.proof.catalogState === "applied" && m.tools.length === 61, "member turn gets 61 tools (applied)");
ok(hash(o.tools.map(t => t.name)) === hash(m.tools.map(t => t.name)), "member promptToolNamesHash == owner promptToolNamesHash");
ok(m.proof.executableToolCount === 59, "member executableToolCount stays 59");
for (const n of ownerOnly) { const t = m.tools.find(x => x.name === n); const r = await t.execute({}); ok(r.isError === true && /No action was taken/.test(r.content[0].text), `member placeholder ${n} refuses`); }
ok(m.tools.filter(t => !ownerOnly.includes(t.name)).every(t => memberTools.includes(t)), "member's real tools are the member's own objects (no owner closures)");
// non-owner falsely flagged as owner is not captured (guard.isCurrentOwner checks real sender)
const spoof = mod.resolveQQClaudeDescriptorCatalog(params(ctx(MEMBER, true, 3)), "exact", ownerTools, schemaOf(ownerTools));
ok(spoof.proof.catalogState !== "captured", "senderIsOwner=true with a non-owner sender id is NOT captured (" + spoof.proof.catalogState + ")");
// cap: 9 distinct sessions keep latest 8
console.log("observation lines:", logs.length, logs.map(l => JSON.parse(l.split("] ")[1]).catalogState).join(","));
process.exit(fail ? 1 : 0);
