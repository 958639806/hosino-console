// Run ON THE HOST (imports the live, read-only owner-guard policy module). Pure function calls; no gateway, no I/O besides imports.
import { createExecutionGuard, REQUIRED_BLOCKED } from "/home/ubuntu/.openclaw/plugins/qq-group-owner-guard/execution-policy.mjs";
const OWNER = "4330BBC52465D583F003C0A68650DF70", MEMBER = "FB597EAB1D23BDAAFAKE000000000000";
const SK = "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5";
const cfg = { commands: { ownerAllowFrom: [OWNER] }, plugins: { entries: { "qq-group-owner-guard": { enabled: true, config: { unifiedTools: { enabled: true, groups: ["b4ee2a7019c96343c96eeba8cb63d8c5"] } } } } }, channels: { qqbot: {} } };
const g = createExecutionGuard({ loadConfig: () => cfg, logDecision: () => {} });
const ctx = (id, own) => ({ sessionKey: SK, runId: "r1", toolCallId: "t1", trigger: "user", requester: { trigger: "user", channel: "qqbot", accountId: "default", senderId: id, senderIsOwner: own } });
let fail = 0;
const names = [...REQUIRED_BLOCKED, "exec", "process", "cron", "secrets", "mcp__openclaw__gateway", "mcp__openclaw__sessions"];
for (const n of names) {
  const m = g.before({ toolName: n, params: {} }, ctx(MEMBER, false));
  const spoof = g.before({ toolName: n, params: {} }, ctx(MEMBER, true));
  const o = g.before({ toolName: n, params: {} }, ctx(OWNER, true));
  const okm = m?.block === true && spoof?.block === true && !o?.block;
  if (!okm) fail++;
  console.log((okm ? "PASS " : "FAIL ") + n.padEnd(26), "member:", m?.block ? "blocked" : "ALLOWED", "| spoofed-owner-flag:", spoof?.block ? "blocked" : "ALLOWED", "| owner:", o?.block ? "blocked" : "allowed", m?.blockReason ? " reason=" + m.blockReason.slice(0, 40) : "");
}
console.log(fail ? `FAILURES ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
