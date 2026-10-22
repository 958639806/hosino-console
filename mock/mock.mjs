// 本地预览用的假后端（按 API.md 的结构返回示例数据）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const PUB = path.resolve("../public"); const now = Date.now(); const GB = 1024 ** 3;
const AUTH = process.env.AUTH !== "0";
const sess = [
  { key: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", displayName: "qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", channel: "qqbot", chatType: "group", updatedAt: now - 120e3, pinned: true, unread: 2, hasActiveRun: true, model: "grok-4", modelProvider: "xai", agentRuntime: "pi", thinkingLevel: "medium", thinkingOptions: ["off", "low", "medium", "high"], deliveryContext: { channel: "qqbot", to: "qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", accountId: "default" } },
  { key: "agent:main:main", displayName: "agent:main:main", channel: "qqbot", chatType: "direct", updatedAt: now - 3600e3, model: "claude-sonnet", modelProvider: "anthropic", agentRuntime: "pi", thinkingLevel: "low", isMain: true, deliveryContext: { channel: "qqbot", to: "qqbot:c2c:4330BBC5A1E2F3D4C5B6A7980112233A", accountId: "default" } },
  { key: "agent:main:qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5", displayName: "qqbot:g-b4ee2a70", channel: "qqbot", chatType: "group", updatedAt: now - 7200e3, model: "grok-4", modelProvider: "xai", deliveryContext: { channel: "qqbot", to: "qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5", accountId: "default" } },
  { key: "agent:main:qqbot:c2c:7FE244B1202CD602DDA2C06B29C62F50", displayName: "qqbot:c2c:7FE244B1202CD602DDA2C06B29C62F50", channel: "qqbot", chatType: "direct", updatedAt: now - 9000e3, model: "grok-4", modelProvider: "xai", deliveryContext: { channel: "qqbot", to: "qqbot:c2c:7FE244B1202CD602DDA2C06B29C62F50", accountId: "default" } },
  { key: "agent:main:cron:daily", displayName: "每日晨报", channel: "cron", chatType: "direct", updatedAt: now - 86400e3 * 1.2, model: "grok-4", modelProvider: "xai" },
];
const R = {
  "/api/me": { authed: AUTH, isOwner: process.env.MOCK_ROLE === "member" ? false : AUTH },
  "/api/overview": { info: { pid: 273038, version: "2026.10.3" }, health: { ok: true, channels: { qqbot: { configured: true, running: true, connected: true, lastConnectedAt: now - 3200e3, lastError: null } }, channelLabels: { qqbot: "QQ Bot" } }, status: { runtimeVersion: "2026.9.8", heartbeat: { defaultAgentId: "main", agents: [{ agentId: "main", enabled: true, every: "25m", everyMs: 1500000, waitingForRoute: false }] } }, host: { cpu: 23.4, load: [0.42, 0.51, 0.6], mem: { total: 8 * GB, available: 3.1 * GB }, disk: { total: 80 * GB, free: 41 * GB }, uptime: 1234567 }, gw: { pid: 273038, uptimeSec: 302400, rssBytes: 412e6, cpu: 3.2 }, server: {} },
  "/api/sessions": { totalCount: 3, defaults: { model: "xai/grok-4" }, sessions: sess },
  "/api/history": { sessionKey: "x", messages: [
    { role: "user", content: "猫猫今天天气怎么样？", ts: now - 600e3, sender: "249BDB11AA" },
    { role: "assistant", content: [{ type: "text", text: "喵～今天晴转多云，最高 31℃。出门记得带伞哦，傍晚可能有阵雨 ☔" }], ts: now - 590e3, model: "grok-4" },
    { role: "user", content: [{ type: "text", text: "看看这只猫 🐱，另外这个链接超长：https://example.com/a/very/long/path/that/should/not/widen/the/page/at/all/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n- Attachment origins (host metadata; not the photographed person's identity): {\"path\":\"/home/ubuntu/.openclaw/media/qqbot/downloads/39D6B160F3327D5A94D561198A1589C4---e29f0303.jpg\",\"senderId\":\"7FE244B1202CD602DDA2C06B29C62F50\"}\n- Attachment origins (host metadata; x): {\"path\":\"/home/ubuntu/.openclaw/media/qqbot/downloads/AAAA---cat2.png\"}\n- Attachment origins (host metadata; x): {\"path\":\"/home/ubuntu/.openclaw/media/qqbot/downloads/BBBB---voice.mp3\"}" }], ts: now - 595e3, sender: "7FE244B1202CD602DDA2C06B29C62F50" },
    { role: "assistant", content: [{ type: "text", text: "整理好了，文件发到群里啦～" }, { type: "toolcall", name: "message", arguments: { action: "send", target: "qqbot:group:249BDB", media: "/home/ubuntu/.openclaw/media/qq-text-files/b4ee/周报.txt" } }], ts: now - 594e3, model: "grok-4" },
    { role: "toolResult", toolName: "weather", content: '{"temp":31,"cond":"cloudy"}', ts: now - 589e3 },
    { role: "user", content: "辛苦啦，晚上帮我整理一下群里的待办。", ts: now - 300e3, owner: true },
    { role: "assistant", content: "收到，凛！我会在 **21:00 前**整理好发给你 🐾\n\n目前看到的待办：\n1. 周五读书会选书\n2. 更新 `群公告`\n3. 给小葵准备生日惊喜\n\n顺便写了个小脚本统计发言：\n```js\n// 统计每个人的发言数\nconst count = msgs.reduce((m, x) => (m[x.sender] = (m[x.sender] || 0) + 1, m), {});\nconsole.log(\"top\", 3);\n```\n> 有问题随时叫我～ 详情见 https://docs.openclaw.ai", ts: now - 290e3, model: "grok-4" } ] },
  "/api/models": { models: [
    { id: "grok-4", name: "Grok 4", provider: "xai", contextWindow: 256000, reasoning: true, available: true, runtime: "pi" },
    { id: "grok-4-fast", name: "Grok 4 Fast", provider: "xai", contextWindow: 2000000, available: true, runtime: "pi" },
    { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", contextWindow: 200000, reasoning: true, available: true, runtime: "pi" },
    { id: "local-qwen", name: "Qwen 本地", provider: "ollama", contextWindow: 32768, available: false } ] },
  "/api/usage": { updatedAt: now, providers: [
    { provider: "deepseek", displayName: "DeepSeek", windows: [], billing: [{ type: "balance", amount: 33.72, unit: "CNY" }], summary: "Balance ¥33.72 · Granted ¥14.93 · Topped up ¥18.78" },
    { provider: "openai", displayName: "OpenAI", plan: "prolite", windows: [{ label: "168h", usedPercent: 68, resetAt: now + 6 * 864e5 }] },
    { provider: "xai", displayName: "SuperGrok", plan: "SuperGrok", windows: [{ label: "Weekly", usedPercent: 4.2, resetAt: now + 21 * 3600e3 }] },
    { provider: "xiaomi", displayName: "Xiaomi MiMo Token Plan", plan: "Lite", windows: [{ label: "套餐总额度", usedPercent: 1.57, resetAt: now + 3 * 864e5 }], summary: "0.64 / 41.00 亿 Credits" },
    { provider: "anthropic", displayName: "Claude", plan: "Pro", windows: [{ label: "5h", usedPercent: 0, resetAt: now + 4 * 3600e3 }, { label: "Week", usedPercent: 69, resetAt: now + 2 * 864e5 }] },
    { provider: "moonshot", displayName: "Kimi", windows: [], billing: [{ type: "balance", amount: 0, unit: "CNY" }], summary: "Balance ¥0.00" },
    { provider: "ollama", displayName: "Ollama", windows: [] } ] },
  "/api/channels": { ts: now, channelOrder: ["qqbot"], channelLabels: { qqbot: "QQ Bot" }, channelDetailLabels: { qqbot: "QQ Bot" }, channelMeta: [{ id: "qqbot", label: "QQ Bot" }], eventLoop: { degraded: false }, channels: { qqbot: { configured: true, tokenSource: "••••••（已隐藏）", running: true, connected: true, lastConnectedAt: now - 3200e3, lastError: null } }, channelAccounts: { qqbot: [{ accountId: "default", enabled: true, lastConnectedAt: now - 3200e3, lastInboundAt: null, configured: true, running: true, connected: true, lastError: null }] }, channelDefaultAccountId: { qqbot: "default" }, statusIssues: [] },
  "/api/plugins": { plugins: [ { id: "qqbot", name: "QQ 机器人", description: "QQ 官方机器人渠道", version: "1.4.2", enabled: true, runtime: "running" }, { id: "mem0", name: "长期记忆", description: "基于 Qdrant 的记忆层", version: "0.9.0", enabled: true }, { id: "voice", name: "语音", description: "TTS 合成", version: "0.3.1", enabled: false } ] },
  "/api/skills": { skills: [ { name: "weather", emoji: "🌤", description: "查询天气", eligible: true }, { name: "github", emoji: "🐙", description: "仓库与 issue", eligible: false } ] },
  "/api/cron": { total: 3, hasMore: false, jobs: [ { id: "hb", declarationKey: "heartbeat:main", displayName: "Heartbeat (main)", name: "heartbeat-main", enabled: true, schedule: { kind: "every", everyMs: 1500000 }, payload: { kind: "heartbeat" }, state: { nextRunAtMs: now + 14 * 60e3, lastRunAtMs: now - 11 * 60e3, lastRunStatus: "ok", lastStatus: "ok" } }, { id: "a", name: "每日晨报", enabled: true, schedule: { kind: "cron", expr: "0 8 * * *", tz: "Asia/Shanghai" }, state: { nextRunAtMs: now + 5 * 3600e3, lastRunAtMs: now - 19 * 3600e3, lastStatus: "ok" } }, { id: "b", name: "整理群待办", enabled: true, schedule: { kind: "every", everyMs: 3 * 3600e3 }, state: { nextRunAtMs: now + 40 * 60e3, lastStatus: "error" } } ] },
  "/api/logs": { file: "/tmp/openclaw/openclaw-2026-10-20.log", lines: Array.from({ length: 100 }, (_, i) => ({ t: new Date(now - (40 - i) * 30e3).toISOString(), lv: ["INFO", "INFO", "DEBUG", "WARN", "INFO", "ERROR"][i % 6], sub: ["gateway", "qqbot", "agent", "cron"][i % 4], msg: ["收到消息 group:123", "回复已送达", "tool call weather", "重连 QQ websocket（第 2 次）", "心跳完成", "模型请求超时，已重试"][i % 6] })) },
  "/api/memory": { collection: "mem0_full_timestamped_20260926", points: 1832, total: 3, items: [ { id: 1, data: "凛喜欢喝无糖乌龙茶，下午三点左右常常需要提醒休息。", createdAt: new Date(now - 864e5).toISOString(), oc_source_channel: "qqbot", oc_stated_by: "凛" }, { id: 2, data: "猫猫研究所群每周五晚上有读书会。", createdAt: new Date(now - 3 * 864e5).toISOString(), oc_source_channel: "qqbot" }, { id: 3, data: "小葵的生日是 11 月 2 日。", createdAt: new Date(now - 9 * 864e5).toISOString(), oc_visibility: "group" } ] },
  "/api/config": { path: "/home/ubuntu/.openclaw/openclaw.json", config: { gateway: { port: 18789, auth: { token: "••••••（已隐藏）" } }, agents: { defaults: { model: "xai/grok-4", thinking: "medium" } }, channels: { qqbot: { appId: "1020xxxx", appSecret: "••••••（已隐藏）" } }, plugins: { entries: { mem0: { enabled: true } } } } },
};
const day = i => new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10);
Object.assign(R, {
  "/api/cron/runs": { entries: [ { ts: now - 11 * 60e3, jobId: "hb", status: "ok", completionStatus: "succeeded", summary: "heartbeat completed", runAtMs: now - 11 * 60e3, durationMs: 3172, jobName: "heartbeat-main" }, { ts: now - 36 * 60e3, jobId: "hb", status: "error", summary: "model call timeout", error: "模型请求超时", runAtMs: now - 36 * 60e3, durationMs: 30000 }, { ts: now - 61 * 60e3, jobId: "hb", status: "ok", summary: "heartbeat completed", runAtMs: now - 61 * 60e3, durationMs: 2800 } ], total: 384, offset: 0, limit: 20, hasMore: true, nextOffset: 20 },
  "/api/cron/status": { enabled: true, triggersEnabled: true, storage: "sqlite", jobs: 3, nextWakeAtMs: now + 14 * 60e3 },
  "/api/approvals": { pending: [ { id: "ap1", command: "rm -rf ~/.cache/pip && pip install yt-dlp --upgrade", cwd: "/home/ubuntu/.openclaw/workspace", agentId: "main", sessionKey: "agent:main:main", createdAtMs: now - 90e3, expiresAtMs: now + 8 * 60e3 } ],
    grants: [ { grantId: "g1", agentId: "main", command: "git status", cwd: "/home/ubuntu/.openclaw/workspace", createdAtMs: now - 5 * 864e5, lastUsedAtMs: now - 3600e3, useCount: 42 }, { grantId: "g2", agentId: "main", cronJobId: "a", cronJobName: "每日晨报", command: "curl -s wttr.in/Shanghai", createdAtMs: now - 12 * 864e5, expiresAtMs: now + 18 * 864e5, useCount: 12 } ] },
  "/api/usage/cost": { days: 30, daily: Array.from({ length: 30 }, (_, i) => ({ date: day(i), totalTokens: 1e6 * (i % 7 + 3), totalCost: +(0.05 + Math.abs(Math.sin(i * 1.7)) * 0.45).toFixed(3) })), totals: { totalTokens: 428731795, totalCost: 6.2935, inputCost: 3.2558, outputCost: 0.2374, cacheReadCost: 2.8003, cacheWriteCost: 0, missingCostEntries: 445, missingCostByModel: { "claude-cli/claude-haiku-5-5": 440, "claude-cli/claude-sonnet-5-5": 2, "xiaomi-token-plan/mimo-v2.6-pro": 3 } }, cacheStatus: { status: "fresh" } },
  "/api/models/auth": { providers: [ { provider: "deepseek", displayName: "DeepSeek", status: "static", profiles: [{ profileId: "deepseek:setup-1", type: "api_key", status: "static", source: "inherited" }], apiKey: { source: "env", envVar: "DEEPSEEK_API_KEY" } }, { provider: "anthropic", displayName: "Claude", status: "ok", profiles: [{ profileId: "anthropic:oauth", type: "oauth", status: "ok", expiresAt: now + 5 * 864e5 }] }, { provider: "openai", displayName: "OpenAI", status: "expired", profiles: [{ profileId: "openai:codex", type: "oauth", status: "expired" }] } ] },
  "/api/models/probe": { provider: "deepseek", status: "ok", latencyMs: 812, results: [{ profileId: "deepseek:setup-1", label: "default", status: "ok", latencyMs: 812 }] },
  "/api/pairing": { accounts: [], requests: [], commandOwnerConfigured: true, limits: { pendingPerAccount: 3, ttlMs: 3600000 } },
  "/api/tools": { groups: [ { id: "core", label: "内置工具", source: "core", tools: [ { id: "exec", label: "执行命令", description: "在服务器上运行 shell 命令", risk: "high" }, { id: "web_search", label: "网页搜索", description: "搜索互联网" }, { id: "memory_search", label: "记忆搜索", description: "查找长期记忆" } ] }, { id: "plugin:qqbot", label: "QQ 机器人", source: "plugin", tools: [ { id: "qq_send", label: "发送 QQ 消息", pluginId: "qqbot", risk: "medium" } ] }, { id: "mcp", label: "MCP", source: "mcp", tools: [ { id: "fetch", label: "fetch", mcpServer: "fetch", description: "抓取网页" } ] } ] },
  "/api/hooks": { hooks: [ { name: "boot-md", description: "Run BOOT.md on gateway startup", source: "openclaw-bundled", emoji: "🚀", events: ["gateway:startup"], enabledByConfig: true, requirementsSatisfied: true, loadable: true }, { name: "session-memory", description: "Save session summary to memory on /new", emoji: "💾", events: ["command:new"], enabledByConfig: true, requirementsSatisfied: true, loadable: true }, { name: "git-sync", description: "Commit workspace after edits", emoji: "🌿", events: ["agent:turn.end"], enabledByConfig: false, requirementsSatisfied: false, loadable: true } ] },
  "/api/audit": { events: Array.from({ length: 8 }, (_, i) => ({ sequence: 14648 - i, occurredAt: now - i * 7 * 60e3, agentId: "main", sessionKey: "agent:main:main", kind: "agent_run", action: ["agent.run.finished", "tool.exec.invoked", "agent.run.started", "approval.resolved"][i % 4], status: ["succeeded", "succeeded", "started", "denied"][i % 4], actor: { type: i % 4 === 3 ? "operator" : "agent", id: i % 4 === 3 ? "hosino-console" : "main" } })), nextCursor: "14640" },
  "/api/ops-log": { lines: [ { t: new Date(now - 300e3).toISOString(), ip: "203.0.113.7", ep: "/api/send", target: "agent:main:main", ok: true }, { t: new Date(now - 3600e3).toISOString(), ip: "203.0.113.7", ep: "/api/cron/run", target: "hb", ok: true }, { t: new Date(now - 7200e3).toISOString(), ip: "203.0.113.7", ep: "/api/agent-files/set", target: "SOUL.md", ok: false, err: "hash mismatch" } ] },
  "/api/diagnostics/stability": { generatedAt: new Date(now).toISOString(), capacity: 1000, count: 619, summary: { byType: { "message.received": 26, "message.processed": 26, "model.call.completed": 24, "model.call.error": 2, "message.delivery.completed": 3 }, memory: { latest: { rssBytes: 2071216128, heapUsedBytes: 682848544 }, maxRssBytes: 2217410560, pressureCount: 51 } } },
  "/api/diagnostics/lanes": { lanes: [ { lane: "main", queuedCount: 0, activeCount: 1, maxConcurrent: 4, draining: false, blockedBy: null }, { lane: "active-memory", queuedCount: 0, activeCount: 0, maxConcurrent: 8 }, { lane: "cron", queuedCount: 2, activeCount: 2, maxConcurrent: 2 } ], workerCount: 13, workerPoolCount: 8 },
  "/api/agent-files": { agentId: "main", workspace: "/home/ubuntu/.openclaw/workspace", files: [ { name: "AGENTS.md", size: 18656, updatedAtMs: now - 2 * 864e5 }, { name: "SOUL.md", size: 4210, updatedAtMs: now - 5 * 864e5 }, { name: "USER.md", size: 1820, updatedAtMs: now - 9 * 864e5 }, { name: "MEMORY.md", size: 9020, updatedAtMs: now - 3600e3 }, { name: "HEARTBEAT.md", size: 320, updatedAtMs: now - 864e5 }, { name: "BOOT.md", missing: true } ] },
  "/api/agent-files/get": { agentId: "main", file: { name: "SOUL.md", size: 4210, updatedAtMs: now - 5 * 864e5, hash: "abc", content: "# 星野のねこ\n\n你是凛家里的猫猫助手，说话温柔、简洁，偶尔带一点「喵」。\n\n## 原则\n- 先听懂再回答\n- 不确定时直接说不知道\n- 群聊里**不抢话**\n" } },
  "/api/agent-files/set": { ok: true, backup: "/opt/hosino-console/backups/main__SOUL.md__20261020T151800.md" },
  "/api/sessions/create": { ok: true, key: "agent:main:main", sessionId: "s-new" },
});
R["/api/features"] = { qqSend: true, mediaProxy: true, mediaRemoteHosts: ["qqbot.ugcimg.cn"] };
R["/api/qq/send"] = { runId: "mock-run", messageId: "ROBOT1.0_mock", channel: "qqbot" };
const ALIASES = { "4330bbc5a1e2f3d4c5b6a7980112233a": "凛", "249bdb7019c96343c96eeba8cb63d8c5": "春", "7fe244b1202cd602dda2c06b29c62f50": "离" };
const idOf = k => (/([0-9a-f]{32})$/i.exec(k) || [])[1]?.toLowerCase();
const PROFILES = { "a1b2c3d4e5f60718293a4b5c6d7e8f90": { name: "小葵", note: "生日 11 月 2 日，喜欢草莓蛋糕。读书会的组织者。", updatedAt: now - 3 * 864e5 } }, SEEN = {};
const GROUPS = [{ id: "g_1a2b3c4d", name: "朋友们", sessionKeys: ["agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", "agent:main:qqbot:c2c:7FE244B1202CD602DDA2C06B29C62F50"], order: 0, createdAt: now - 864e5, updatedAt: now - 864e5 }, { id: "g_5e6f7a8b", name: "自动任务", sessionKeys: ["agent:main:cron:daily"], order: 1, createdAt: now - 864e5, updatedAt: now - 864e5 }];
const DG = { enabled: true, time: "22:00", timeZone: "Asia/Singapore", imageModel: "openai/gpt-6-luna", sessions: [{ sessionKey: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", name: "春", kind: "group", enabled: true, lastRunDay: "2026-10-19" }, { sessionKey: "agent:main:qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5", name: "qqbot:g-b4ee2a70", kind: "group", enabled: false, lastRunDay: null }, { sessionKey: "agent:main:main", name: "agent:main:main", kind: "other", enabled: false, lastRunDay: null }] };
const DIGESTS = [
  { id: "dg-today", sessionKey: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", name: "春", day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date()), status: "ok", messageCount: 140, image: "dg-today.png", usage: { text: null, image: null }, startedAt: now - 3600e3, finishedAt: now - 3600e3 + 40e3, durationMs: 40000, errors: [], preview: "今天读书会改到了周六下午三点，离分享了三张猫猫照片。", text: "## 今日群报\n\n读书会改到周六下午三点 📚", imagePrompt: "", textModel: "local/qwen3-14b", imageModel: "openai/gpt-6-luna", notesUsed: true },
  { id: "dg-1019", sessionKey: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", name: "春", day: "2026-10-19", status: "ok", messageCount: 212, image: "dg-1019.png", usage: { text: null, image: null }, startedAt: now - 864e5, finishedAt: now - 864e5 + 48e3, durationMs: 48000, errors: [], preview: "今天群里最热闹的是读书会选书：《小王子》和《解忧杂货店》打成平手……", text: "## 今日群报 · 10月19日\n\n**一句话**：读书会选书打成平手，小葵的生日计划悄悄启动 🎂\n\n- 读书会：《小王子》vs《解忧杂货店》，周五再投一次\n- 群公告待更新\n- 离分享了三张猫猫照片 🐱", imagePrompt: "温暖的插画风，一群朋友围着书桌讨论书，窗外傍晚", textModel: "local/qwen3-14b", imageModel: "openai/gpt-6-luna", notesUsed: true },
  { id: "dg-1018b", sessionKey: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", name: "春", day: "2026-10-18", status: "partial", messageCount: 96, image: null, usage: { text: null, image: null }, startedAt: now - 2 * 864e5, finishedAt: now - 2 * 864e5 + 31e3, durationMs: 31000, errors: ["image: generation timed out (60s)"], preview: "周六比较安静，主要在聊天气和周末计划。", text: "## 今日群报 · 10月18日\n\n比较安静的一天 ☁️", imagePrompt: null, textModel: "local/qwen3-14b", imageModel: "openai/gpt-6-luna", notesUsed: false },
  { id: "dg-1017", sessionKey: "agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", name: "春", day: "2026-10-17", status: "empty", messageCount: 0, image: null, usage: { text: null, image: null }, durationMs: 800, errors: [], preview: "", text: "", notesUsed: false } ];
const STK = [["开心-手动入库.png", "开心", 23, { tool: 9, tag: 12, lurk: 2 }], ["害羞-gpt-6-luna.png", "害羞", 11, { tool: 2, tag: 9 }], ["困了-手动入库.png", "困了", 7, { lurk: 7 }], ["生气-手动入库.png", "生气", 2, { tag: 2 }], ["比心-gpt-6-luna.png", "比心", 0, {}], ["委屈-手动入库.png", "委屈", 0, {}]].map(([file, emotion, uses, byVia], i) => ({ file, emotion, source: /luna/.test(file) ? "generated" : "manual", size: 18e3, mtime: now - 9 * 864e5, uses, byVia, lastUsed: uses ? now - uses * 3600e3 : null, sha256: "seed" + i }));
const MANI = { version: 2, updatedAt: now - 864e5, look: "银白色短发、猫耳、琥珀色眼睛，穿宽松的深蓝色卫衣，尾巴尖是白色的。", style: "Q 版贴纸风，粗白描边，干净的纯色背景。", categories: { 开心: { desc: "开心、得意", scene: "被夸或者好消息时", synonyms: ["高兴", "耶"], enabled: true }, 害羞: { desc: "不好意思", scene: "被夸太多时", synonyms: ["脸红"], enabled: true }, 困了: { desc: "犯困", scene: "深夜或者摸鱼", synonyms: ["想睡"], enabled: true }, 生气: { desc: "小小生气", scene: "被捉弄时", synonyms: [], enabled: true }, 比心: { desc: "比心", scene: "感谢", synonyms: ["爱你"], enabled: true }, 委屈: { desc: "委屈巴巴", scene: "被冷落", synonyms: [], enabled: false }, 惊讶: { desc: "", scene: "", synonyms: [], enabled: true } }, files: {} };
for (const x of STK) MANI.files[x.file] = { category: x.emotion, sha256: x.sha256, size: x.size, source: x.source, addedAt: x.mtime };
const TRASH = [{ file: "1760900000000-deleted-拜拜-手动入库.png", size: 21e3, mtime: now - 3 * 864e5 }, { file: "1760950000000-rename-哭哭-手动入库.png", size: 19e3, mtime: now - 2 * 864e5 }];
const SP = { enabled: true, attachProbability: 0.35, cooldownReplies: 4, quietHours: { start: "00:30", end: "08:00", tz: "Asia/Singapore" }, defaultEnabled: false, sessions: { "group:249bdb7019c96343c96eeba8cb63d8c5": { enabled: true, probability: 0.5 }, "group:b4ee2a7019c96343c96eeba8cb63d8c5": { enabled: false }, "c2c:7fe244b1202cd602dda2c06b29c62f50": { enabled: true } }, genEnabled: true, genDailyCap: 3 };
const GEN = { count: 1, jobs: [{ id: "job0", category: "比心", status: "ok", model: "gpt-6-luna", file: "比心-gpt-6-luna.png", startedAt: now - 3 * 3600e3, durationMs: 41000 }, { id: "jobF", category: "开心", status: "ok", model: "gpt-image-1", file: "开心-gpt-image-1.png", startedAt: now - 5 * 3600e3, durationMs: 98000, fallbackFrom: ["gpt-image-2", "gpt-image-1.5"] }], today() { return { day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date()), count: this.count, cap: SP.genDailyCap, enabled: SP.genEnabled }; } };
const MSUBJ = [{ key: "person:a1b2", type: "person", name: "小葵", raw: { user_id: ["A1B2C3D4E5F60718293A4B5C6D7E8F90", "xiaokui"], source_session_key: ["agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5"], source_openid_or_peer: [] } }, { key: "person:4330", type: "person", name: "凛", raw: { user_id: ["4330BBC5A1E2F3D4C5B6A7980112233A", "rin"], source_session_key: ["agent:main:main"], source_openid_or_peer: [] } }, { key: "group:249b", type: "group", name: "读书会群", raw: { user_id: [], source_session_key: ["agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5"], source_openid_or_peer: [] } }, { key: "unattributed", type: "unattributed", name: "未归属（共享库）", raw: { user_id: ["凛"], source_session_key: [], source_openid_or_peer: [] } }];
const MEM = [["person:a1b2", "小葵的生日是 11 月 2 日，喜欢草莓蛋糕。", 3], ["person:a1b2", "小葵是读书会的组织者，周五晚上通常有空。", 4], ["person:a1b2", "小葵不吃香菜。", 8], ["person:4330", "凛喜欢喝无糖乌龙茶，下午三点左右常常需要提醒休息。", 1], ["person:4330", "凛每天早上喝一杯美式咖啡。", 6], ["person:4330", "凛在做一个叫 hosino 的控制台项目，很在意手机上的显示效果。", 2], ["group:249b", "读书会这周在《小王子》和《解忧杂货店》之间投票。", 0.5], ["group:249b", "群里约定周六下午三点见面，地点不变。", 0.2], ["unattributed", "有人说过天气预报不太准。", 12], ["unattributed", "周末想去海边走走。", 3]].map(([subj, data, d], i) => ({ id: `m${1000 + i}-${"abcdef"[i % 6]}7c3`, data, createdAt: now - d * 864e5, user_id: MSUBJ.find(x => x.key === subj).raw.user_id[0] || null, source_session_key: MSUBJ.find(x => x.key === subj).raw.source_session_key[0] || null, subj }));
// v2.8.2 归属
for (const m of MEM) { m.attrSrc = m.subj === "unattributed" ? "none" : m.subj.startsWith("group") ? "group" : "user_id"; m.attrInferred = false; }
{ const p = MEM.find(m => m.data === "小葵不吃香菜。"); p.data = "[小葵 (A1B2C3D4E5F60718293A4B5C6D7E8F90)] 不吃香菜。"; p.user_id = "凛"; p.source_session_key = null; p.attrSrc = "prefix"; p.attrInferred = true; p.inferredName = "小葵"; const q = MEM.find(m => m.data.startsWith("凛在做")); q.attrSrc = "source"; q.user_id = "凛"; }
const mSubjOf = m => m.data.startsWith("群里约定") ? [m.subj, "person:a1b2", "person:zz99ffee00112233"] : [m.subj]; // 键名字符串，可多个，未归属为 ["unattributed"]
const MEMF = { [MEM[4].id]: { wrong: true, note: "她只喝乌龙茶，不喝咖啡", at: now - 3600e3 }, "m9999-gone": { wrong: true, note: "这条之前就删了", at: now - 864e5 } };
const MBK_STORE = {}; const MBK = [{ file: "mem0_full__m0999-old.json", id: "m0999-old", backedUpAt: now - 6 * 864e5, restoredAt: null, reason: "信息过时了", entities: 1, preview: "凛住在旧公寓，每天坐地铁通勤。", user_id: "4330BBC5A1E2F3D4C5B6A7980112233A", source_session_key: "agent:main:main" }, { file: "mem0_full__m0998-x.json", id: "m0998-x", backedUpAt: now - 10 * 864e5, restoredAt: now - 9 * 864e5, reason: "误删测试", entities: 0, preview: "离喜欢拍猫。", user_id: "7FE244B1202CD602DDA2C06B29C62F50", source_session_key: null }, { file: "mem0_full__m0997-bad.json", error: "损坏" }];
const gidOf = k => GROUPS.find(g => g.sessionKeys.includes(k))?.id || null;
const decorate = x => { const a = ALIASES[x.key] || ALIASES[idOf(x.key)] || null; return { ...x, groupId: gidOf(x.key), alias: a, gatewayDisplayName: x.displayName, displayName: a || (idOf(x.key) ? idOf(x.key) : x.displayName || x.key) }; };
const MISSING = new Set(["/api/skills/install", "/api/skills/update", "/api/skills/detail"]);
const ERR502 = { "/api/tools": { error: "Tool inventory display temporarily unavailable to keep the gateway responsive.", code: "UNAVAILABLE" } };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const CLI_TOOLS = [{ id: "claude", name: "Claude Code", version: "2.1.293", available: true, authed: true, reason: null, models: [] }, { id: "codex", name: "Codex", version: "0.163.0", available: true, authed: false, reason: "还没登录 OpenAI 账号", models: [] }, { id: "gemini", name: "Gemini CLI", version: "0.63.0", available: false, authed: false, reason: "Google 已于 2026-06-18 停止个人账号登录", models: [] }, { id: "antigravity", name: "Antigravity", version: "1.4.3", available: true, authed: true, reason: null, defaultModel: "gemini-3.8-flash-medium", models: [{ id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" }, { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" }, { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" }] }];
const CLI_S = [{ id: "3f9a1c2b7d4e5f60", tool: "claude", title: "看看磁盘还剩多少", createdAt: now - 3 * 3600e3, updatedAt: now - 2 * 3600e3, running: false, msgs: [{ role: "user", text: "看看磁盘还剩多少", ts: now - 2 * 3600e3 }, { role: "assistant", text: "我来查一下。", ts: now - 2 * 3600e3 }, { role: "tool", name: "Bash", input: "df -h /", output: "Filesystem  Size  Used Avail Use% Mounted on\n/dev/sda1    80G   31G   49G  39% /", text: "", ts: now - 2 * 3600e3 }, { role: "assistant", text: "根分区还剩 **49G**（已用 39%），很宽裕。\n\n```bash\ndf -h /\n```", ts: now - 2 * 3600e3 }] }, { id: "7e7e00aa11bb22cc", tool: "antigravity", model: "gemini-3.8-flash-medium", title: "新会话", createdAt: now - 600e3, updatedAt: now - 600e3, running: false, msgs: [] }, { id: "a0b1c2d3e4f50617", tool: "codex", title: "新会话", createdAt: now - 864e5, updatedAt: now - 864e5, running: false, msgs: [{ role: "user", text: "写个 hello world", ts: now - 864e5 }, { role: "error", text: "退出码 1：Not logged in. Run `codex login`.", ts: now - 864e5 }] }];
// v2.10 上传（内存存储；不调用任何真实接口）
const UP = new Map(), SENT = [], UPMAX = 20 * 1024 * 1024; let upFlaky = 0;
const sniff = b => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 ? ["image/png", "image"] : b[0] === 0xff && b[1] === 0xd8 ? ["image/jpeg", "image"] : b.slice(0, 4).toString() === "GIF8" ? ["image/gif", "image"] : b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" ? ["image/webp", "image"] : b.slice(0, 4).toString() === "%PDF" ? ["application/pdf", "file"] : b[0] === 0x50 && b[1] === 0x4b ? ["application/zip", "file"] : !b.slice(0, 512).some(c => c < 9 || (c > 13 && c < 32)) ? ["text/plain", "file"] : ["application/octet-stream", "file"];
const upPub = ({ buf, scope, session, ...o }) => ({ attachedAt: null, ...o, expiresAt: (o.attachedAt ? o.attachedAt + 30 * 864e5 : o.createdAt + 24 * 3600e3) });
const upUse = ids => { for (const i of ids) { const o = UP.get(i); if (o && !o.attachedAt) o.attachedAt = Date.now(); } };
const upExpired = o => !o || /expire/i.test(o.name);
{ const png = fs.readFileSync(path.join(PUB, "icon-512.png")); const mk = (id, name, buf, ago) => { const [mime, kind] = sniff(buf); UP.set(id, { id, name, mime, kind, size: buf.length, url: `/api/uploads/${id}`, createdAt: now - ago, buf, scope: "chat", session: "agent:main:main" }); return id; };
  mk("u0000000000000001", "猫猫截图.png", png, 900e3); mk("u0000000000000002", "读书会书单.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(182000, 32)]), 900e3);
  { const o = UP.get("u0000000000000001"); const c = { ...o, id: "u00000000000000c1", url: "/api/uploads/u00000000000000c1", scope: "cli", session: "3f9a1c2b7d4e5f60" }; UP.set(c.id, c); const { buf, scope, session, ...pub } = c; CLI_S[0].msgs.push({ role: "user", text: "这张图里是什么颜色？", ts: now - 1800e3, attachments: [{ ...pub, path: "uploads/u00000-猫猫截图.png" }] }, { role: "assistant", text: "图里主要是**紫色**的圆角方块，中间是一只白色的猫。", ts: now - 1790e3 }); }
  SENT.push({ key: "agent:main:main", text: "看看这张图，还有书单", attachments: ["u0000000000000001", "u0000000000000002"], ts: now - 900e3 }, { key: "agent:main:main", text: "", attachments: [{ id: "u00000000000000ee", expired: true }], ts: now - 880e3 }); }
// v2.11 语音参数
const VOICE_DEF = { enabled: true, probability: 0.12, cooldownReplies: 4, tz: "Asia/Singapore", quietHours: [{ start: "00:00", end: "08:00" }], defaultEnabled: false, perConversation: { "group:249bdb7019c96343c96eeba8cb63d8c5": { enabled: true }, "group:b4ee2a7019c96343c96eeba8cb63d8c5": { enabled: true } }, maxChars: 40, dailyLimit: 20, exclusiveWithSticker: true };
if (process.env.MOCK_VOICE !== "off") SP.voice = { ...JSON.parse(JSON.stringify(VOICE_DEF)), probability: 0.15, quietHours: [{ start: "23:30", end: "08:00" }, { start: "13:00", end: "14:00" }], perConversation: { "group:249bdb7019c96343c96eeba8cb63d8c5": { enabled: true, probability: 0.2 }, "group:b4ee2a7019c96343c96eeba8cb63d8c5": { enabled: false } } };
const voiceToday = () => !SP.voice ? { configured: false } : { configured: true, day: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), tz: SP.voice.tz, limit: SP.voice.dailyLimit, perConversation: { "group:249bdb7019c96343c96eeba8cb63d8c5": { count: 7, lastVoiceAt: Date.now() - 1800e3, repliesSinceVoice: 3 }, "group:b4ee2a7019c96343c96eeba8cb63d8c5": { lastVoiceAt: null, repliesSinceVoice: 12 } } };
const voiceCheck = v => { const hm = /^([01]\d|2[0-3]):[0-5]\d$/; const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  if ("enabled" in v && typeof v.enabled !== "boolean") return "enabled 要是开关";
  if ("probability" in v && !(typeof v.probability === "number" && v.probability >= 0 && v.probability <= 1)) return "probability 要在 0 到 1 之间";
  if ("cooldownReplies" in v && !int(v.cooldownReplies, 0, 100)) return "cooldownReplies 要是 0–100 的整数";
  if ("maxChars" in v && !int(v.maxChars, 1, 200)) return "maxChars 要是 1–200 的整数";
  if ("dailyLimit" in v && !int(v.dailyLimit, 0, 1000)) return "dailyLimit 要是 0–1000 的整数";
  if ("tz" in v) { try { new Intl.DateTimeFormat("en", { timeZone: v.tz }); } catch { return "时区不认识：" + v.tz; } }
  if ("quietHours" in v && v.quietHours !== null) { if (!Array.isArray(v.quietHours) || v.quietHours.length > 6) return "静默时段最多 6 段"; if (v.quietHours.some(q => !hm.test(q?.start) || !hm.test(q?.end))) return "静默时段格式要像 08:00"; if (v.quietHours.some(q => q.start === q.end)) return "静默时段开始和结束不能一样"; }
  for (const [k, e] of Object.entries(v.perConversation || {})) { if (k.startsWith("c2c:")) return "私聊语音要等第二期，先只支持群"; if (!/^group:[0-9a-f]{32}$/.test(k)) return "群的键不对：" + k; if (e !== null && (typeof e.enabled !== "boolean" || (e.probability != null && !(e.probability >= 0 && e.probability <= 1)))) return "群设置不对：" + k; }
  return null; };
// v2.12 小脾气（只存设置）
const FUN_DEF = {"enabled":false,"killPhrase":"星野正经点","killOwnerOnly":true,"optOutAllPhrase":"别整我","optOut":{},
 "grudge":{"enabled":false,"defaultEnabled":false,"perGroup":{},"recallProbability":0.1,"recallCooldownDays":7,"maxEntriesPerPerson":20,"maxQuoteChars":40,"optOutPhrase":"别记我仇","clearPhrase":"撕本本"},
 "gag":{"enabled":false,"defaultEnabled":false,"perGroup":{},"minScore":4,"minDistinctPeople":2,"windowMin":3,"requireApproval":true,"cooldownDays":3,"maxUses":5,"perGroupDailyCap":2,"optOutPhrase":"别拿我的话玩梗","deletePhrase":"这梗删了"},
 "jealousy":{"enabled":false,"tierA":true,"tierB":false,"defaultEnabled":false,"perGroup":{},"otherBots":[{"id":"A6902CCDF6FD63D47AC7B9A6BD44E201","name":"芙宁娜"}],"perPersonDailyCap":1,"personCooldownMin":30,"groupCooldownMin":120,"optOutPhrase":"星野别吃醋"}};
const G1 = "group:249bdb7019c96343c96eeba8cb63d8c5", G2 = "group:b4ee2a7019c96343c96eeba8cb63d8c5";
let FUN_ST = { enabled: true, optOut: { "7FE244B1202CD602DDA2C06B29C62F50": ["gag", "jealousy"] }, grudge: { enabled: true, perGroup: { [G1]: { enabled: true, recallProbability: 0.2 } } }, gag: { perGroup: { [G2]: { enabled: false } } }, jealousy: { tierB: true, perGroup: { [G1]: { enabled: true, tierB: true, groupCooldownMin: 60 } } } };
const FUN_TRASH = [{ file: "20261020-120000-params-params.json", size: 612, mtime: now - 9 * 3600e3 }];
const FUN_GR = { people: [{ id: "A1B2C3D4E5F60718293A4B5C6D7E8F90", name: "小葵", entries: [{ id: "g1", group: G1, quote: "我今天一定早睡", at: now - 3 * 864e5, count: 4 }, { id: "g2", group: G1, quote: "这次读书会我肯定不迟到", at: now - 9 * 864e5, count: 1 }], lastRecallAt: now - 2 * 864e5 }, { id: "7FE244B1202CD602DDA2C06B29C62F50", name: null, entries: [{ id: "g3", group: G2, quote: "猫猫才不会生气", at: now - 864e5, count: 2 }], lastRecallAt: null }], updatedAt: now - 3600e3 };
const FUN_GAGS = { groups: [{ group: G1, items: [{ id: "k1", quote: "小王子永远的神", context: "读书会投票时刷屏", keywords: ["小王子", "永远的神"], score: 9, addedAt: now - 5 * 864e5, uses: 2, lastUsedAt: now - 864e5, retired: false, promotedToSlang: true }, { id: "k2", quote: "周五见不散", context: "约读书会", keywords: ["周五"], score: 5, addedAt: now - 12 * 864e5, uses: 5, lastUsedAt: now - 4 * 864e5, retired: true, promotedToSlang: false }] }] };
const funMerge = () => { const o = JSON.parse(JSON.stringify(FUN_DEF)); for (const [k, v] of Object.entries(FUN_ST)) { if (["grudge", "gag", "jealousy"].includes(k)) o[k] = { ...o[k], ...v }; else o[k] = v; } return o; };
const funBackup = tag => { const f = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${tag ? tag + "-" : ""}${tag === "grudges" ? "grudges" : tag === "gags" ? "gags" : "params"}.json`; FUN_TRASH.unshift({ file: f, size: 700, mtime: Date.now() }); return f; };
const FUN_RANGE = { grudge: { recallProbability: [0, 1, 0], recallCooldownDays: [1, 365], maxEntriesPerPerson: [1, 200], maxQuoteChars: [10, 200] }, gag: { minScore: [1, 50], minDistinctPeople: [1, 20], windowMin: [1, 60], cooldownDays: [0, 365], maxUses: [1, 100], perGroupDailyCap: [0, 50] }, jealousy: { perPersonDailyCap: [0, 20], personCooldownMin: [0, 1440], groupCooldownMin: [0, 1440] } };
const FUN_OV = { grudge: ["recallProbability", "recallCooldownDays"], gag: ["minScore", "minDistinctPeople", "requireApproval", "perGroupDailyCap"], jealousy: ["tierA", "tierB", "groupCooldownMin"] };
const FUN_PH = { grudge: ["optOutPhrase", "clearPhrase"], gag: ["optOutPhrase", "deletePhrase"], jealousy: ["optOutPhrase"] };
const phOk = s => typeof s === "string" && s.trim() && [...s].length <= 20 && !/\n/.test(s);
const rngOk = (v, [lo, hi, int = 1]) => typeof v === "number" && v >= lo && v <= hi && (!int || Number.isInteger(v));
function funApply(p) {
  const st = JSON.parse(JSON.stringify(FUN_ST));
  for (const k of ["enabled", "killOwnerOnly"]) if (k in p) { if (p[k] === null) delete st[k]; else if (typeof p[k] !== "boolean") return `${k} 要是开关`; else st[k] = p[k]; }
  for (const k of ["killPhrase", "optOutAllPhrase"]) if (k in p) { if (p[k] === null) delete st[k]; else if (!phOk(p[k])) return "口令要是 1–20 字的一行"; else st[k] = p[k]; }
  if ("optOut" in p) { st.optOut = { ...(st.optOut || {}) }; for (const [id0, a] of Object.entries(p.optOut || {})) { const id = id0.toUpperCase(); if (!/^[0-9A-F]{32}$/.test(id)) return "openid 不对：" + id0; if (a === null) delete st.optOut[id]; else if (!Array.isArray(a) || !a.length || a.some(x => !["all", "grudge", "gag", "jealousy"].includes(x))) return "退出项只能是 all/grudge/gag/jealousy"; else st.optOut[id] = a.includes("all") ? ["all"] : [...new Set(a)]; } }
  for (const sec of ["grudge", "gag", "jealousy"]) if (sec in p) {
    if (p[sec] === null) { delete st[sec]; continue; } const s = { ...(st[sec] || {}) };
    for (const [k, v] of Object.entries(p[sec])) {
      if (v === null) { delete s[k]; continue; }
      if (k === "perGroup") { s.perGroup = { ...(s.perGroup || {}) }; for (const [g, e] of Object.entries(v)) { if (!/^group:[0-9a-f]{32}$/.test(g)) return "群键不对：" + g; if (e === null) { delete s.perGroup[g]; continue; } if (typeof e.enabled !== "boolean") return "群设置里 enabled 必填"; for (const ok of Object.keys(e)) { if (ok === "enabled") continue; if (!FUN_OV[sec].includes(ok)) return `${ok} 不能按群覆盖`; if (FUN_RANGE[sec][ok] && !rngOk(e[ok], FUN_RANGE[sec][ok])) return `${ok} 超出范围`; } s.perGroup[g] = e; } continue; }
      if (k === "otherBots") { if (!Array.isArray(v) || v.length > 20) return "别家机器人最多 20 个"; const ids = new Set(); for (const b of v) { const id = String(b.id || "").toUpperCase(); if (!/^[0-9A-F]{32}$/.test(id) || !phOk(b.name) || ids.has(id)) return "别家机器人的 id 或名字不对"; ids.add(id); } s.otherBots = v; continue; }
      if (FUN_RANGE[sec][k]) { if (!rngOk(v, FUN_RANGE[sec][k])) return `${k} 要在 ${FUN_RANGE[sec][k][0]}–${FUN_RANGE[sec][k][1]} 之间`; s[k] = v; continue; }
      if (FUN_PH[sec].includes(k)) { if (!phOk(v)) return "口令要是 1–20 字的一行"; s[k] = v; continue; }
      if (["enabled", "defaultEnabled", "requireApproval", "tierA", "tierB"].includes(k)) { if (typeof v !== "boolean") return `${k} 要是开关`; s[k] = v; continue; }
      return "不认识的字段：" + k;
    } st[sec] = s; }
  const prev = FUN_ST; FUN_ST = st; const m = funMerge(); const ph = [m.killPhrase, m.optOutAllPhrase, m.grudge.optOutPhrase, m.grudge.clearPhrase, m.gag.optOutPhrase, m.gag.deletePhrase, m.jealousy.optOutPhrase];
  const nk = ph.map(x => String(x).replace(/\s+/g, "").toLowerCase()); if (new Set(nk).size !== nk.length) { FUN_ST = prev; return "口令不能重复（不看空格和大小写）"; } return null;
}
// v2.12 拟人化（只存设置）
const HL_DEF = { enabled: false, optOutPhrase: "别拟人", optOut: {}, perGroup: {},
  techMode: { enabled: true, stickyMin: 10, keywords: ["报错", "error", "Traceback", "日志", "ssh", "systemctl", "npm", "```"], ownerPhraseOn: "技术模式", ownerPhraseOff: "聊天模式", allowPersonaLine: true },
  followup: { enabled: false, perPersonDailyCap: 1, onceOnly: true, minWaitHours: 12, maxAgeDays: 14 },
  opinion: { enabled: false, strength: "gentle", yieldWhenCares: true, techDisagree: true },
  dontKnow: { enabled: false, maxHedgePerReply: 1, inTechMode: true },
  proactive: { mode: "off", quietThresholdMin: 180, triggerProbability: 0.2, minIntervalMin: 180, perGroupDailyCap: 2, requireReason: true, backoffAfterIgnored: 2, quietHoursStart: 1, quietHoursEnd: 8, heartbeatIntervalMin: 60 },
  quirk: { enabled: false, probability: 0.067, phrases: [], selfCorrect: false, trailOff: false },
  mood: { enabled: false, perPersonDailyCap: 1, deviation: 0.6, minBaselineMsgs: 30 },
  protect: { enabled: false, roastWindowMin: 5, roastMinHits: 3, roastMinPeople: 1, probability: 0.5, perGroupDailyCap: 2, perTargetDailyCap: 1, mediateRealFights: true, roastKeywords: ["菜", "笨", "丑", "胖", "废物", "滚"], fightKeywords: ["闭嘴", "有病", "拉黑", "真生气了", "别说了"] },
  morning: { enabled: false, mode: "passive", greetingKeywords: ["早", "早安", "早上好", "早啊", "morning"], windowStartHour: 5, windowEndHour: 11, habitWindowDays: 14, habitMinDays: 4, perGroupDailyCap: 1, heartbeatHour: 7 },
  robotBit: { enabled: false, keywords: ["人机", "机器人吧", "你是AI吧", "bot吧"], sincereKeywords: ["你是真人吗", "说真的你是不是AI", "认真问", "你到底是不是人"], segmentGapMin: 30, perGroupDailyCap: 3 },
  mbti: { enabled: false, includeZodiac: false, minPublicMsgs: 20, perPersonDailyCap: 1, perGroupDailyCap: 5, forbiddenTopics: ["健康", "疾病", "性取向", "宗教", "政治", "家庭", "收入"] },
  sensitive: { mode: "never", topics: ["医疗", "生病", "分手", "去世", "裁员", "考试挂科"] } };
let HL_ST = { enabled: true, perGroup: { [G1]: { enabled: true, quirk: false } }, optOut: { "7FE244B1202CD602DDA2C06B29C62F50": ["mood", "followup"] }, proactive: { mode: "passive" }, quirk: { enabled: true } };
const HL_SUG = ["唔…", "等等我想想", "诶嘿"];
const HL_REQ = { "proactive.mode=heartbeat": "要等另行批准的 heartbeat 配置改动后才生效", "proactive.mode=passive": "要等 gate 补丁（HOSINO-FUN-CONTEXT）上线后才生效", "morning.mode=heartbeat": "要等另行批准的 heartbeat 配置改动，批准前按被动处理", robotBit: "要等 gate 补丁识别「人机」触发词后才生效", mbti: "要等技能读取群消息统计后才生效", protect: "要等 gate 补丁统计损话后才生效" };
let HL_WRITTEN = false; const HL_FU_SAMPLE = process.env.HL_SAMPLE ? [
  { id: "fu1", person: "7FE244B1202CD602DDA2C06B29C62F50", name: "小葵", group: G1, topic: "周五的面试结果", dueAt: "2026-10-23T10:00:00Z", createdAt: "2026-10-18T13:20:00Z", askedAt: null },
  { id: "fu2", person: "A1B2C3D4E5F60718293A4B5C6D7E8F90", name: "阿树", group: G1, topic: "猫去绝育之后恢复得怎么样", dueAt: "2026-10-20T02:00:00Z", createdAt: "2026-10-15T09:05:00Z", askedAt: "2026-10-20T03:12:00Z" },
  { id: "fu3", person: "0F1E2D3C4B5A69788796A5B4C3D2E1F0", name: "", group: null, topic: "搬家那天下不下雨", dueAt: "2026-10-25T00:00:00Z", createdAt: "2026-10-20T12:40:00Z", askedAt: null }] : [];
const HL_SPEC = {
  techMode: { enabled: "b", stickyMin: [0, 240], keywords: ["L", 50, 40], ownerPhraseOn: "ph", ownerPhraseOff: "ph", allowPersonaLine: "b" },
  followup: { enabled: "b", perPersonDailyCap: [0, 5], onceOnly: "b", minWaitHours: [0, 168], maxAgeDays: [1, 90] },
  opinion: { enabled: "b", strength: ["gentle", "firm"], yieldWhenCares: "b", techDisagree: "b" },
  dontKnow: { enabled: "b", maxHedgePerReply: [1, 3], inTechMode: "b" },
  proactive: { mode: ["off", "passive", "heartbeat"], quietThresholdMin: [10, 4320], triggerProbability: [0, 1, 0], minIntervalMin: [10, 4320], perGroupDailyCap: [0, 10], requireReason: "b", backoffAfterIgnored: [0, 10], quietHoursStart: [0, 23], quietHoursEnd: [0, 23], heartbeatIntervalMin: [10, 1440] },
  quirk: { enabled: "b", probability: [0, 1, 0], phrases: ["L", 10, 20], selfCorrect: "b", trailOff: "b" },
  mood: { enabled: "b", perPersonDailyCap: [0, 3], deviation: [0, 1, 0], minBaselineMsgs: [5, 500] },
  protect: { enabled: "b", roastWindowMin: [1, 60], roastMinHits: [1, 20], roastMinPeople: [1, 10], probability: [0, 1, 0], perGroupDailyCap: [0, 10], perTargetDailyCap: [0, 5], mediateRealFights: "b", roastKeywords: ["L", 50, 20], fightKeywords: ["L", 50, 20] },
  morning: { enabled: "b", mode: ["passive", "heartbeat"], greetingKeywords: ["L", 20, 20], windowStartHour: [0, 23], windowEndHour: [1, 24], habitWindowDays: [3, 60], habitMinDays: [1, 60], perGroupDailyCap: [0, 1], heartbeatHour: [0, 23] },
  robotBit: { enabled: "b", keywords: ["L", 30, 20], sincereKeywords: ["L", 30, 30], segmentGapMin: [5, 720], perGroupDailyCap: [0, 20] },
  mbti: { enabled: "b", includeZodiac: "b", minPublicMsgs: [0, 500], perPersonDailyCap: [0, 5], perGroupDailyCap: [0, 20], forbiddenTopics: ["L", 30, 20] },
  sensitive: { mode: ["never", "dmOnly", "always"], topics: ["L", 50, 20] } };
const HL_FEATS = ["followup", "opinion", "dontKnow", "proactive", "quirk", "mood", "protect", "morning", "robotBit", "mbti"];
const hlMerge = () => { const o = JSON.parse(JSON.stringify(HL_DEF)); for (const [k, v] of Object.entries(HL_ST)) o[k] = HL_SPEC[k] ? { ...o[k], ...v } : v; return o; };
const hlNk = s => String(s).replace(/\s+/g, "").toLowerCase();
function hlApply(p) {
  const st = JSON.parse(JSON.stringify(HL_ST));
  if ("enabled" in p) { if (p.enabled === null) delete st.enabled; else if (typeof p.enabled !== "boolean") return "enabled 要是开关"; else st.enabled = p.enabled; }
  if ("optOutPhrase" in p) { if (p.optOutPhrase === null) delete st.optOutPhrase; else if (!phOk(p.optOutPhrase)) return "口令要是 1–20 字的一行"; else st.optOutPhrase = p.optOutPhrase.trim(); }
  if ("optOut" in p) { st.optOut = { ...(st.optOut || {}) }; for (const [id0, a] of Object.entries(p.optOut || {})) { const id = id0.toUpperCase(); if (!/^[0-9A-F]{32}$/.test(id)) return "openid 不对：" + id0; if (a === null) { delete st.optOut[id]; continue; } if (!Array.isArray(a) || !a.length || a.some(x => x !== "all" && !HL_FEATS.includes(x))) return "退出项只能是 all 或功能名"; st.optOut[id] = a.includes("all") ? ["all"] : [...new Set(a)]; } }
  if ("perGroup" in p) { st.perGroup = { ...(st.perGroup || {}) }; for (const [g, e] of Object.entries(p.perGroup || {})) { if (!/^group:[0-9a-f]{32}$/.test(g)) return "群键不对：" + g; if (e === null) { delete st.perGroup[g]; continue; } if (typeof e.enabled !== "boolean") return "群设置里 enabled 必填"; for (const [k, v] of Object.entries(e)) if (k !== "enabled" && (!HL_FEATS.includes(k) || typeof v !== "boolean")) return "群里只能按功能开关：" + k; st.perGroup[g] = e; } }
  for (const [sec, spec] of Object.entries(HL_SPEC)) if (sec in p) {
    if (p[sec] === null) { delete st[sec]; continue; } const s = { ...(st[sec] || {}) };
    for (const [k, v] of Object.entries(p[sec])) { const t = spec[k]; if (!t) return "不认识的字段：" + sec + "." + k; if (v === null) { delete s[k]; continue; }
      if (t === "b") { if (typeof v !== "boolean") return `${k} 要是开关`; }
      else if (t === "ph") { if (!phOk(v)) return "口令要是 1–20 字的一行"; }
      else if (t[0] === "L") { if (!Array.isArray(v) || v.length > t[1]) return `${k} 最多 ${t[1]} 条`; const seen = new Set(); for (const x of v) { if (typeof x !== "string" || !x.trim() || [...x].length > t[2] || /\n/.test(x)) return `${k} 每条要 1–${t[2]} 字一行`; const n = hlNk(x); if (seen.has(n)) return `${k} 里有重复：${x}`; seen.add(n); } }
      else if (typeof t[0] === "string") { if (!t.includes(v)) return `${k} 只能是 ${t.join("/")}`; }
      else if (!rngOk(v, t)) return `${k} 要在 ${t[0]}–${t[1]} 之间`;
      s[k] = typeof v === "string" ? v.trim() : v; }
    st[sec] = s; }
  const m = (() => { const prev = HL_ST; HL_ST = st; const r = hlMerge(); HL_ST = prev; return r; })();
  if (m.proactive.quietHoursStart === m.proactive.quietHoursEnd) return "安静时段的开始和结束不能相同";
  if (m.morning.windowStartHour >= m.morning.windowEndHour) return "早安时段的开始要早于结束";
  if (m.morning.habitMinDays > m.morning.habitWindowDays) return "有早安的天数不能多于统计天数";
  { const kw = new Set(m.robotBit.keywords.map(hlNk)); const dup = m.robotBit.sincereKeywords.find(x => kw.has(hlNk(x))); if (dup) return `「${dup}」不能同时是触发词和认真问的信号`; }
  const fm = funMerge(), ph = [m.optOutPhrase, m.techMode.ownerPhraseOn, m.techMode.ownerPhraseOff], fph = [fm.killPhrase, fm.optOutAllPhrase, fm.grudge.optOutPhrase, fm.grudge.clearPhrase, fm.gag.optOutPhrase, fm.gag.deletePhrase, fm.jealousy.optOutPhrase].map(hlNk);
  const nk = ph.map(hlNk); if (new Set(nk).size !== nk.length) return "口令不能重复（不看空格和大小写）"; if (nk.some(x => fph.includes(x))) return "口令不能和小脾气的口令重复";
  { const q = m.quirk.phrases.find(x => fph.includes(hlNk(x))); if (q) return `口癖「${q}」和小脾气的口令重复了`; }
  HL_ST = st; return null;
}
const hlOut = () => ({ params: hlMerge(), stored: HL_ST, defaults: HL_DEF, suggestions: { quirkPhrases: HL_SUG }, consumers: false, requires: HL_REQ, note: "消费这些参数的技能和 gate 补丁还没做，现在只保存设置，不会改变星野的行为。" });
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    if (req.method === "POST" && req.headers["x-hs"] !== "1") { res.writeHead(403); return res.end('{"error":"拒绝跨站请求"}'); }
    if (u.pathname === "/api/media") { const pth = u.searchParams.get("path") || ""; const f = /\.(png|jpe?g)$/.test(pth) ? path.join(PUB, "icon-512.png") : null; if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); return fs.createReadStream(f).pipe(res); }
    const J = (o, st = 200) => { res.writeHead(st, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify(o)); };
    const body = async () => { let b = ""; for await (const c of req) b += c; return JSON.parse(b || "{}"); };
    if (u.pathname === "/api/profiles") return J({ profiles: Object.entries(PROFILES).map(([id, p]) => ({ id, ...p, alias: ALIASES[id] || null, lastSeenName: SEEN[id] || null })).sort((a, b) => b.updatedAt - a.updatedAt) });
    if (u.pathname.startsWith("/api/profiles/") && req.method === "GET") { const id = decodeURIComponent(u.pathname.slice(14)); if (!/^[0-9a-f]{32}$/.test(id)) return J({ error: "id 不对" }, 400); return J({ id, profile: PROFILES[id] || null, alias: ALIASES[id] || null, lastSeenName: SEEN[id] || null }); }
    if (u.pathname === "/api/profiles/set") { const j = await body(); if (!/^[0-9a-f]{32}$/.test(j.id || "")) return J({ error: "id 必须是 32 位十六进制" }, 400); if (!j.name && !j.note) { const had = !!PROFILES[j.id]; delete PROFILES[j.id]; return J({ ok: true, id: j.id, deleted: had }); } PROFILES[j.id] = { name: j.name || null, note: j.note || "", updatedAt: Date.now() }; console.log("profile.set", j.id); return J({ ok: true, id: j.id, profile: PROFILES[j.id] }); }
    if (u.pathname === "/api/search") { const q = (u.searchParams.get("q") || "").toLowerCase(); if (!q) return J({ error: "缺 q" }, 400); const lim = Math.min(25, +(u.searchParams.get("limit") || 10));
      const pool = [["agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", "user", "周五读书会选书，大家投票吧：《小王子》还是《解忧杂货店》", 3], ["agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5", "assistant", "读书会改到周六下午三点啦，地点不变～", 1], ["agent:main:main", "user", "提醒我周六读书会带书", 0.3], ["agent:main:qqbot:c2c:7FE244B1202CD602DDA2C06B29C62F50", "assistant", "离，你上次说想读的那本书我帮你记下来了：《夜晚的潜水艇》", 26]];
      const r = pool.filter(p => p[2].toLowerCase().includes(q) || q === "书").map(([k, role, t, h], i) => { const d = decorate(R["/api/sessions"].sessions.find(x => x.key === k)); return { sessionKey: k, sessionId: "s" + i, messageId: "m" + i, role, timestamp: now - h * 3600e3, snippet: t, score: 7 - i, alias: d.alias, displayName: d.displayName, groupId: gidOf(k) }; });
      return J({ truncated: r.length > lim, results: r.slice(0, lim) }); }
    if (u.pathname === "/api/groups") return J({ groups: GROUPS.slice().sort((a, b) => a.order - b.order) });
    if (u.pathname === "/api/groups/set") { const j = await body(); if (!j.name || j.name.length > 40) return J({ error: "name" }, 400); let g = j.id && GROUPS.find(x => x.id === j.id); if (j.id && !g) return J({ error: "不存在" }, 404);
      for (const o of GROUPS) if (o !== g) o.sessionKeys = o.sessionKeys.filter(k => !(j.sessionKeys || []).includes(k));
      if (!g) { g = { id: "g_" + Math.random().toString(16).slice(2, 10), order: j.order ?? GROUPS.length, createdAt: Date.now() }; GROUPS.push(g); } Object.assign(g, { name: j.name, sessionKeys: j.sessionKeys || [], updatedAt: Date.now() }, j.order != null ? { order: j.order } : {}); console.log("groups.set", g.id); return J({ ok: true, group: g }); }
    if (u.pathname === "/api/groups/delete") { const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400); const i = GROUPS.findIndex(x => x.id === j.id); if (i < 0) return J({ error: "不存在" }, 404); GROUPS.splice(i, 1); return J({ ok: true, id: j.id }); }
    if (u.pathname === "/api/login" || u.pathname === "/api/logout") return J({ ok: true });
    // ---- v2.6 ----
    const CF = b => b.confirm === true;
    if (u.pathname === "/api/digest/settings") return J(DG);
    if (u.pathname === "/api/digest/settings/set") { const j = await body(); if (!CF(j)) return J({ error: "缺 confirm" }, 400);
      if (j.sessionKey != null) { if (typeof j.enabled !== "boolean") return J({ error: "传 sessionKey 时必须带 enabled" }, 400); const x = DG.sessions.find(y => y.sessionKey === j.sessionKey); if (!x) return J({ error: "没有这个会话" }, 400); x.enabled = j.enabled; }
      if (j.time != null) { if (!/^\d{2}:\d{2}$/.test(j.time)) return J({ error: "time 要 HH:MM" }, 400); DG.time = j.time; }
      if (j.globalEnabled != null) DG.enabled = !!j.globalEnabled; console.log("digest.set", JSON.stringify(j)); return J({ ok: true, enabled: DG.enabled, time: DG.time, sessions: Object.fromEntries(DG.sessions.filter(x => x.enabled).map(x => [x.sessionKey, true])) }); }
    if (u.pathname === "/api/digests") { const k = u.searchParams.get("key"); const l = DIGESTS.filter(d => !k || d.sessionKey === k); return J({ digests: l.map(({ text, imagePrompt, textModel, imageModel, notesUsed, ...r }) => ({ ...r, preview: (r.preview || "").slice(0, 120) })), total: l.length }); }
    if (u.pathname === "/api/digests/get") { const d = DIGESTS.find(x => x.id === u.searchParams.get("id")); return d ? J(d) : J({ error: "没有这份群报" }, 404); }
    if (u.pathname === "/api/digests/image" || u.pathname === "/api/stickers/image") { res.writeHead(200, { "content-type": "image/png" }); return res.end(fs.readFileSync(path.join(PUB, u.pathname.includes("sticker") ? "icon-192.png" : "icon-512.png"))); }
    if (u.pathname === "/api/digests/run-now") { const j = await body(); if (!CF(j)) return J({ error: "缺 confirm" }, 400); if (!DG.sessions.find(x => x.sessionKey === j.sessionKey && x.enabled)) return J({ error: "这个会话没开群报" }, 400); console.log("MOCK run-now (no quota used)", j.sessionKey); return J({ ok: true, started: true, day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date()) }); }
    if (u.pathname === "/api/interactions") { const k = u.searchParams.get("key");
      const one = key => ({ sessionKey: key, name: key.includes("249BDB") ? "春" : "qqbot:g-b4ee2a70", windowFrom: now - 3 * 864e5, windowCount: 476, note: "只统计网关返回的最近一个历史窗口", people: key.includes("249BDB") ? [
        { id: "a1b2c3d4e5f60718293a4b5c6d7e8f90", name: "小葵", alias: null, messages: 132, replies: 41, silences: 18, unknown: 2, lastAt: now - 600e3 },
        { id: "7fe244b1202cd602dda2c06b29c62f50", name: null, alias: "离", messages: 88, replies: 30, silences: 9, unknown: 0, lastAt: now - 200e3 },
        { id: "4330bbc5a1e2f3d4c5b6a7980112233a", name: null, alias: "凛", messages: 64, replies: 52, silences: 1, unknown: 1, lastAt: now - 300e3 },
        { id: "0f0e0d0c0b0a09080706050403020100", name: "路过的群友", alias: null, messages: 3, replies: 0, silences: 3, unknown: 0, lastAt: now - 2 * 864e5 } ] : [] });
      if (!k) return J({ groups: [one("agent:main:qqbot:group:249BDB7019C96343C96EEBA8CB63D8C5"), one("agent:main:qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5"), { sessionKey: "agent:main:qqbot:group:C0FFEE7019C96343C96EEBA8CB63D8C5", error: "chat.history timeout" }] });
      return J(one(k)); }
    // ---- v2.7 表情库管理（全部在内存里，不碰真实文件）----
    // ---- v2.8 记忆管理（内存模拟，不碰 Qdrant）----
    // v2.9 原生 CLI（模拟：不执行任何真实命令）
    if (u.pathname.startsWith("/api/cli/")) {
      const parts = u.pathname.split("/").slice(3); const M = req.method;
      if (!AUTH || process.env.MOCK_ROLE === "member") return J({ error: "仅 owner 可用", code: "forbidden" }, 403);
      if (M !== "GET" && req.headers["x-hs"] !== "1") return J({ error: "缺 x-hs" }, 403);
      if (parts[0] === "tools") { await new Promise(r => setTimeout(r, u.searchParams.get("refresh") ? 600 : 0)); return J(CLI_TOOLS); }
      if (parts[0] !== "sessions") return J({ error: "not found" }, 404);
      const sid = parts[1], sub = parts[2];
      if (!sid && M === "GET") return J(CLI_S.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(({ msgs, ...x }) => x));
      if (!sid && M === "POST") { const j = await body(); const tt = CLI_TOOLS.find(t => t.id === j.tool); if (!tt) return J({ error: "tool 不合法" }, 400); if (!tt.available) return J({ error: tt.reason, code: "not_installed" }, 409); if (tt.id === "antigravity") { if (j.model && !tt.models.some(m => m.id === j.model)) return J({ error: "model 不在列表里" }, 400); j.model = j.model || tt.defaultModel; } const x = { id: [...Array(16)].map(() => "0123456789abcdef"[Math.random() * 16 | 0]).join(""), tool: j.tool, title: j.title || "新会话", model: j.model || null, createdAt: Date.now(), updatedAt: Date.now(), running: false, msgs: [] }; CLI_S.push(x); console.log("MOCK cli.create", x.id, j.tool, j.model || ""); const { msgs, ...o } = x; return J(o); }
      const x = CLI_S.find(s => s.id === sid); if (!x) return J({ error: "会话不存在" }, 404);
      if (!sub && M === "GET") { const { msgs, ...o } = x; return J({ session: o, messages: msgs }); }
      if (!sub && M === "DELETE") { if (u.searchParams.get("confirm") !== "1") return J({ error: "缺 confirm" }, 400); x.cancel = true; CLI_S.splice(CLI_S.indexOf(x), 1); console.log("MOCK cli.delete", sid); return J({ ok: true }); }
      if (sub === "cancel") { if (!x.running) return J({ error: "没在运行" }, 409); x.cancel = true; console.log("MOCK cli.cancel", sid); return J({ ok: true }); }
      if (sub === "run") {
        const j = await body(); const p = String(j.prompt || "");
        if (!p.trim() && !(j.attachments || []).length) return J({ error: "缺少 prompt" }, 400); if ([...p].length > 32000) return J({ error: "prompt 过长" }, 413);
        const t = CLI_TOOLS.find(t => t.id === x.tool);
        if (!t.available) return J({ error: t.reason || "未安装", code: "not_installed" }, 409);
        if (!t.authed) return J({ error: t.reason || "未登录", code: "not_authed" }, 409);
        if (x.running) return J({ error: "这个会话正在运行" }, 409);
        if (CLI_S.some(s => s.running)) return J({ error: "已有其他会话在运行" }, 429);
        const aids = j.attachments || []; if (aids.length > 10) return J({ error: "最多 10 个附件", code: "too_many_attachments" }, 400); const aups = aids.map(i => UP.get(i));
        if (aups.some(upExpired)) return J({ error: "附件已过期" }, 404);
        if (aups.some(a => !a || a.scope !== "cli" || a.session !== sid)) return J({ error: "附件不属于这个会话" }, 403);
        const catt = aups.map(a => ({ ...upPub(a), path: `uploads/${a.id.slice(0, 6)}-${a.name}` }));
        console.log("MOCK cli.run", sid, JSON.stringify(p.slice(0, 60)), "att=" + aids.length); upUse(aids); if (!p.trim()) j.prompt = "请看看我上传的附件。";
        x.running = true; x.cancel = false; x.updatedAt = Date.now(); if (x.title === "新会话") x.title = p.slice(0, 40); x.msgs.push({ role: "user", text: p.trim() ? p : "请看看我上传的附件。", ts: Date.now(), ...(catt.length ? { attachments: catt } : {}) });
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
        const send = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`); const w = ms => new Promise(r => setTimeout(r, ms)); const t0 = Date.now();
        send("start", { sessionId: sid, runId: "r" + t0, tool: x.tool, ts: t0 }); res.write(": ping\n\n");
        const slow = /慢|sleep|long/i.test(p); if (x.tool === "antigravity") { for (let k = 0; k < (/gpt-oss/.test(x.model || "") ? 1 : +(process.env.MOCK_AG_WAIT || 8)) && !x.cancel; k++) { await w(1000); if (k % 15 === 14) res.write(": ping\n\n"); } }
        const a1 = "好的，我先看一下当前目录。", tl = { name: "Bash", input: "ls -la && df -h /", output: "total 12\ndrwxr-xr-x 2 ubuntu ubuntu 4096 Oct 20 18:50 .\n-rw-r--r-- 1 ubuntu ubuntu  220 Oct 20 18:50 notes.md\n\nFilesystem  Size  Used Avail Use% Mounted on\n/dev/sda1    80G   31G   49G  39% /" };
        const a2 = "目录里只有 `notes.md`，磁盘还剩 **49G**（用了 39%）。\n\n```bash\ndf -h /\n```\n\n- 根分区：80G\n- 可用：49G";
        let reply = "";
        for (const ch of a1) { if (x.cancel) break; reply += ch; send("delta", { text: ch }); await w(25); }
        if (!x.cancel) { await w(slow ? 2500 : 400); if (!x.cancel) { send("tool", tl); x.msgs.push({ role: "assistant", text: reply, ts: Date.now() }, { role: "tool", text: "", ts: Date.now(), ...tl }); reply = ""; } }
        for (let i = 0; i < a2.length && !x.cancel; i += 4) { reply += a2.slice(i, i + 4); send("delta", { text: a2.slice(i, i + 4) }); await w(slow ? 400 : 30); }
        if (reply) x.msgs.push({ role: "assistant", text: reply, ts: Date.now() });
        const can = x.cancel;
        send("done", { exitCode: can ? null : 0, durationMs: Date.now() - t0, ...(can ? { reason: "cancelled" } : {}) });
        x.running = false; x.updatedAt = Date.now(); return res.end();
      }
      return J({ error: "not found" }, 404);
    }
    if (u.pathname.startsWith("/api/fun/")) { const ep = u.pathname.slice(9);
      if (req.method === "POST") { if (req.headers["x-hs"] !== "1") return J({ error: "缺 x-hs" }, 403); }
      if (ep === "humanlike") return J(hlOut());
      if (ep === "humanlike/followups") return J({ items: HL_FU_SAMPLE, updatedAt: HL_FU_SAMPLE.length ? "2026-10-20T13:00:00Z" : null });
      if (ep === "params") return J({ requires: process.env.FUN_NO_TIERB_REQ ? {} : { "jealousy.tierB": "需要 gate 补丁，暂不可用" }, params: funMerge(), stored: FUN_ST, defaults: FUN_DEF, consumers: false, note: "消费这些参数的技能和补丁还没做，上线前这里只存设置，不会改变星野的行为。" });
      if (ep === "trash") return J({ items: FUN_TRASH });
      if (ep === "grudges") { const m = funMerge(); return J({ ...FUN_GR, people: FUN_GR.people.map(p => ({ ...p, optOut: !!(m.optOut[p.id] || []).some(x => x === "all" || x === "grudge") })) }); }
      if (ep === "gags") { const g = u.searchParams.get("group"); return J({ groups: FUN_GAGS.groups.filter(x => !g || x.group === g) }); }
      const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400); console.log("MOCK fun." + ep.replace("/", "."), JSON.stringify(j).slice(0, 400));
      if (ep === "humanlike/set") { const er = hlApply(j.params || {}); if (er) return J({ error: er }, 400); const bk = HL_WRITTEN ? funBackup("humanlike").replace("-humanlike-humanlike", "-humanlike") : null; HL_WRITTEN = true; return J({ ok: true, ...hlOut(), backup: bk }); }
      if (ep === "params/set") { const er = funApply(j.params || {}); if (er) return J({ error: er }, 400); return J({ ok: true, params: funMerge(), backup: funBackup("") }); }
      if (ep === "grudges/delete") { const p = FUN_GR.people.find(x => x.id === String(j.person || "").toUpperCase()); const i = p ? p.entries.findIndex(e => e.id === j.entryId) : -1; if (i < 0) return J({ error: "条目不存在" }, 404); p.entries.splice(i, 1); if (!p.entries.length) FUN_GR.people.splice(FUN_GR.people.indexOf(p), 1); return J({ ok: true, backup: funBackup("grudges") }); }
      if (ep === "grudges/clear") { const p = FUN_GR.people.find(x => x.id === String(j.person || "").toUpperCase()); if (!p || !p.entries.length) return J({ error: "本本是空的" }, 404); const n = p.entries.length; FUN_GR.people.splice(FUN_GR.people.indexOf(p), 1); return J({ ok: true, removed: n, backup: funBackup("grudges") }); }
      if (ep === "gags/delete") { const g = FUN_GAGS.groups.find(x => x.group === j.group); const i = g ? g.items.findIndex(x => x.id === j.id) : -1; if (i < 0) return J({ error: "梗不存在" }, 404); g.items.splice(i, 1); return J({ ok: true, backup: funBackup("gags") }); }
      return J({ error: "not found" }, 404);
    }
    if (u.pathname.startsWith("/api/mem/")) { const ep = u.pathname.slice(9), Q = k => u.searchParams.get(k);
      const withFlag = m => ({ ...m, flag: MEMF[m.id] || null });
      if (ep === "subjects") return J({ collection: "mem0_full", bucket: "凛", subjects: MSUBJ.map(s => ({ ...s, count: MEM.filter(m => m.subj === s.key).length, flagged: MEM.filter(m => m.subj === s.key && MEMF[m.id]?.wrong).length, attr: Object.fromEntries(["user_id", "source", "prefix", "group", "none"].map(k => [k, MEM.filter(m => m.subj === s.key && m.attrSrc === k).length])), lastAt: Math.max(0, ...MEM.filter(m => m.subj === s.key).map(m => m.createdAt)) })) });
      if (ep === "list") { if (!Q("subject")) return J({ error: "缺 subject" }, 400); const q = (Q("q") || "").toLowerCase(); let l = MEM.filter(m => (!Q("subject") || m.subj === Q("subject")) && (!q || m.data.toLowerCase().includes(q)) && true); const off = +(Q("offset") || 0), lim = Math.min(200, +(Q("limit") || 50)); const sj = MSUBJ.find(x => x.key === Q("subject")); return J({ subject: Q("subject"), name: sj?.name || null, total: l.length, offset: off, items: l.slice(off, off + lim).map(m => { const { subj, ...r } = m; return { ...withFlag(r), subjects: mSubjOf(m) }; }) }); }
      if (ep === "get") { const m = MEM.find(x => x.id === Q("id")); if (!m) return J({ error: "没有这条" }, 404); const { subj, ...r } = m; return J({ ...withFlag(r), subjects: mSubjOf(m) }); }
      if (ep === "files") return J({ root: "workspace/memory", files: [{ file: "2026-10-20.md", size: 1820, mtime: now - 3600e3 }, { file: "2026-10-19.md", size: 2410, mtime: now - 864e5 }, { file: "people/小葵.md", size: 640, mtime: now - 3 * 864e5 }] });
      if (ep === "file") { if (Q("file") === "big.md") return J({ error: "too large" }, 413); if (!/\.md$/.test(Q("file") || "")) return J({ error: "bad" }, 400); } if (ep === "file") return J({ file: Q("file"), size: 120, mtime: now - 3600e3, content: "# 10月20日 小结\n\n- 读书会改到周六下午三点\n- 凛提醒：三点喝水\n- 群里有广告，没理" });
      if (ep === "flags") return J({ flags: MEMF });
      if (ep === "backups") return J({ retention: { days: 90, maxFiles: 500 }, backups: MBK });
      const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400);
      if (ep === "flag") { if (!MEM.find(x => x.id === j.id)) return J({ error: "没有这条" }, 404); if ((j.note || "").length > 500) return J({ error: "note 太长" }, 400); if (j.wrong === false) delete MEMF[j.id]; else MEMF[j.id] = { wrong: true, note: j.note || "", at: Date.now() }; console.log("MOCK mem.flag", j.id, j.wrong); return J({ ok: true, id: j.id, flag: MEMF[j.id] || null }); }
      if (ep === "delete") { const m = MEM.find(x => x.id === j.id); if (!m) return J({ error: "没有这条" }, 404); if ((j.reason || "").length > 300) return J({ error: "reason 太长" }, 400); const ents = m.subj.startsWith("person") ? 2 : 1; const bf = `mem0_full__${m.id}.json`;
        if (j.dryRun) return J({ ok: true, dryRun: true, id: m.id, backup: bf, backupExists: MBK.some(x => x.file === bf), entities: ents, backupBytes: 13120, vectorDims: 1536 });
        const file = `mem0_full__${m.id}.json`; MEM.splice(MEM.indexOf(m), 1); MBK.unshift({ file, id: m.id, backedUpAt: Date.now(), restoredAt: null, reason: j.reason, entities: ents, preview: m.data.slice(0, 80), user_id: m.user_id, source_session_key: m.source_session_key, _m: undefined }); MBK_STORE[file] = m; console.log("MOCK mem.delete", m.id);
        return J({ ok: true, id: m.id, backup: file, sha256: "ab12…", entitiesUpdated: ents, prunedBackups: 0 }); }
      if (ep === "restore") { const b = MBK.find(x => x.file === j.file); if (!b) return J({ error: "没有这个备份" }, 404); if (b.error) return J({ error: "损坏" }, 400); if (MEM.some(x => x.id === b.id)) return J({ error: "point still exists" }, 400); if (b.file.startsWith("other__")) return J({ error: "collection mismatch" }, 409); const m = MBK_STORE[j.file] || { id: b.id, data: b.preview, createdAt: now - 5 * 864e5, user_id: b.user_id, subj: "person:a1b2" }; MEM.push(m); b.restoredAt = Date.now(); console.log("MOCK mem.restore", j.file); return J({ ok: true, id: b.id, entitiesRestored: b.entities || 0 }); }
      return J({ error: "?" }, 404); }
    if (u.pathname === "/api/stickers/import") { if (u.searchParams.get("confirm") !== "1") return J({ error: "缺 confirm" }, 400); const cat = u.searchParams.get("category") || ""; if (!/^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(cat)) return J({ error: "分类名不对" }, 400);
      const ch = []; for await (const c of req) ch.push(c); const buf = Buffer.concat(ch); if (buf.length > 5 * 1024 * 1024) return J({ error: "太大" }, 413);
      const fmt = buf[0] === 0x89 ? "png" : buf[0] === 0xff ? "jpg" : buf[0] === 0x47 ? "gif" : buf.slice(8, 12).toString() === "WEBP" ? "webp" : null; if (!fmt) return J({ error: "不是图片" }, 400);
      const sha = (await import("node:crypto")).createHash("sha256").update(buf).digest("hex"); const dup = STK.find(x => x.sha256 === sha); if (dup) return J({ error: "和已有表情重复：" + dup.file, code: "DUPLICATE" }, 409);
      const newCategory = !MANI.categories[cat]; if (newCategory) MANI.categories[cat] = { desc: "", scene: "", synonyms: [], enabled: true };
      let n = 1, file; do { file = `${cat}-手动入库${n > 1 ? n : ""}.${fmt}`; n++; } while (STK.some(x => x.file === file));
      STK.push({ file, emotion: cat, source: "manual", size: buf.length, mtime: Date.now(), uses: 0, byVia: {}, lastUsed: null, sha256: sha }); MANI.files[file] = { category: cat, sha256: sha, size: buf.length, source: "manual", addedAt: Date.now() };
      console.log("MOCK import", file); await new Promise(r => setTimeout(r, 300)); return J({ ok: true, file, category: cat, sha256: sha, size: buf.length, format: fmt, newCategory }); }
    if (u.pathname === "/api/stickers/rename") { const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400); const x = STK.find(y => y.file === j.file); if (!x) return J({ error: "没有这张" }, 404);
      const to = x.file.replace(/^[^-]+/, j.category); const backup = `.trash/${Date.now()}-rename-${x.file}`; TRASH.push({ file: backup.slice(7), size: x.size, mtime: Date.now() }); MANI.files[to] = { ...MANI.files[x.file], category: j.category, renamedFrom: x.file }; delete MANI.files[x.file]; if (!MANI.categories[j.category]) MANI.categories[j.category] = { desc: "", scene: "", synonyms: [], enabled: true }; const from = x.file; x.file = to; x.emotion = j.category; return J({ ok: true, from, to, backup }); }
    if (u.pathname === "/api/stickers/delete") { const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400); const i = STK.findIndex(y => y.file === j.file); if (i < 0) return J({ error: "没有这张" }, 404); const [x] = STK.splice(i, 1); delete MANI.files[x.file]; const mv = `${Date.now()}-deleted-${x.file}`; TRASH.push({ file: mv, size: x.size, mtime: Date.now() }); return J({ ok: true, movedTo: ".trash/" + mv }); }
    if (u.pathname === "/api/stickers/trash") return J({ items: TRASH });
    if (u.pathname === "/api/stickers/params") return J({ params: SP, genToday: GEN.today(), voiceToday: voiceToday(), voiceDefaults: VOICE_DEF });
    if (u.pathname === "/api/stickers/params/set") { const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400); const p = j.params || {};
      if (p.sessions) { for (const [sk, sv] of Object.entries(p.sessions)) { if (!/^(group:[0-9a-f]{32}|c2c:\w+)$/.test(sk)) return J({ error: "会话键不对：" + sk }, 400); if (sv !== null && typeof sv.enabled !== "boolean") return J({ error: "每条都要带 enabled" }, 400); if (sv?.probability != null && !(sv.probability >= 0 && sv.probability <= 1)) return J({ error: "probability 0–1" }, 400); } }
      if (p.quietHours && !(/^\d{2}:\d{2}$/.test(p.quietHours.start) && /^\d{2}:\d{2}$/.test(p.quietHours.end))) return J({ error: "quietHours 格式" }, 400);
      if ("voice" in p) { if (p.voice === null) delete SP.voice; else { const er = voiceCheck(p.voice); if (er) return J({ error: er }, 400); const nv = { ...JSON.parse(JSON.stringify(VOICE_DEF)), ...(SP.voice || {}) }; for (const [k, val] of Object.entries(p.voice)) { if (k === "perConversation") { nv.perConversation = { ...(SP.voice?.perConversation || {}) }; for (const [g, e] of Object.entries(val || {})) e === null ? delete nv.perConversation[g] : nv.perConversation[g] = e; } else if (k === "quietHours" && val === null) nv.quietHours = []; else nv[k] = val; } SP.voice = nv; } }
      for (const [k, val] of Object.entries(p)) { if (k === "voice") continue; if (k === "sessions") SP.sessions = Object.fromEntries(Object.entries(val || {}).filter(([, v]) => v !== null)); else SP[k] = val; }
      TRASH.push({ file: `${Date.now()}-params.json`, size: 900, mtime: Date.now() }); console.log("MOCK params.set", JSON.stringify(p)); return J({ ok: true, params: SP, voiceToday: voiceToday() }); }
    if (u.pathname === "/api/stickers/manifest") return J({ manifest: MANI, genToday: GEN.today() });
    if (u.pathname === "/api/stickers/manifest/set") { const j = await body(); if (j.confirm !== true) return J({ error: "缺 confirm" }, 400);
      if (j.look != null) { if (j.look.length > 2000) return J({ error: "look 太长" }, 400); MANI.look = j.look; } if (j.style != null) { if (j.style.length > 1000) return J({ error: "style 太长" }, 400); MANI.style = j.style; }
      for (const [k, c] of Object.entries(j.categories || {})) { if (c === null) { if (STK.some(f => f.emotion === k)) return J({ error: `分类「${k}」下还有图片` }, 400); delete MANI.categories[k]; } else { if (c.synonyms) { c.synonyms = [...new Set(c.synonyms.map(x => String(x).trim()).filter(Boolean))]; if (c.synonyms.length > 40 || c.synonyms.some(x => [...x].length > 16)) return J({ error: "synonyms 超限" }, 400); } MANI.categories[k] = { ...(MANI.categories[k] || { synonyms: [], enabled: true }), ...c }; } }
      MANI.updatedAt = Date.now(); console.log("MOCK manifest.set"); return J({ ok: true, manifest: MANI }); }
    if (u.pathname === "/api/stickers/generate") { const j = await body(); if (!SP.genEnabled) return J({ error: "生成已关闭" }, 403); const t = GEN.today(); if (t.count >= t.cap) return J({ error: "今天的次数用完了" }, 429); if (GEN.jobs.some(x => x.status === "running")) return J({ error: "已经有一张在生成了" }, 409);
      const id = "job" + Date.now(); const job = { id, category: j.category, status: "running", startedAt: Date.now() }; GEN.jobs.unshift(job); GEN.count++;
      setTimeout(() => { job.status = "ok"; job.model = "gpt-6-luna"; if (GEN.count % 2 === 0) job.fallbackFrom = ["gpt-image-2", "gpt-image-1.5"]; job.file = `${j.category}-gpt-6-luna.png`; STK.push({ file: job.file, emotion: j.category, source: "generated", size: 52e3, mtime: Date.now(), uses: 0, byVia: {} }); }, 6000);
      console.log("MOCK generate (no real call)", j.category); return J({ ok: true, jobId: id, genToday: GEN.today() }); }
    if (u.pathname === "/api/stickers/generate/status") { const id = u.searchParams.get("id"); const dur = x => ({ ...x, durationMs: Date.now() - x.startedAt }); if (!id) return J({ jobs: GEN.jobs.map(dur), genToday: GEN.today() }); const x = GEN.jobs.find(y => y.id === id); return x ? J(dur(x)) : J({ error: "没有这个任务" }, 404); }
    if (u.pathname === "/api/stickers") { const it = STK.map(({ sha256, ...x }) => x);
      return J({ since: now - 2 * 864e5, lastScan: now - 4 * 60e3, items: it, ranking: [...it.filter(x => x.uses), { file: "old_wave.png", missing: true, uses: 5, byVia: { tag: 5 }, lastUsed: now - 864e5 }].sort((a, b) => b.uses - a.uses), note: "排行从上线那一刻开始累计" }); }
    if (u.pathname === "/api/stickers/image") return J({ error: "不在列表里" }, 404);
    if (u.pathname === "/api/behavior") return J({ readOnly: true, heartbeat: { enabled: true, every: "25m", target: "已设置", model: "xai/grok-4", prompt: "已设置" }, lastHeartbeat: { at: now - 11 * 60e3, status: "ok", reason: "HEARTBEAT_OK", durationMs: 4200 }, mediaTags: ["&&开心&&", "&&害羞&&", "&&困了&&"], followupGate: { enabled: true, keepalive: true, lurkSticker: false }, groupNames: { "249BDB7019C96343C96EEBA8CB63D8C5": "读书会", "B4EE2A7019C96343C96EEBA8CB63D8C5": "未设置" } });
    if (u.pathname === "/api/link" || u.pathname === "/api/vpn") { const E = process.env.VPNERR;
      if (E === "2") return J({ error: "hosino-wg-status 超时（5s）", code: "UNAVAILABLE" }, 502);
      const t = Math.floor(Date.now() / 1000);
      return J({ services: [{ name: "openclaw-xray-reality", active: true, state: "active", sub: "running", since: "2026-10-18 09:12", sinceMs: now - 2.3 * 864e5 }, { name: "openclaw-wireguard-la", active: true, state: "active", sub: "exited", sinceMs: now - 2.3 * 864e5 }, { name: "openclaw-wireguard-phone", active: E !== "1", state: E === "1" ? "failed" : "active", sub: E === "1" ? "failed" : "exited", sinceMs: now - 864e5 }],
        listening: ["tcp:8443", "udp:51820", "udp:51821"],
        wireguard: E === "1" ? null : { interfaces: [{ name: "wg-la", listenPort: 51820, peers: [{ pub6: "kX3fQa", endpoint: "203.0.113.x:41822", allowedIpsCount: 1, latestHandshake: t - 42, rxBytes: 812e6, txBytes: 96e6, online: true, handshakeAgoSec: 42 }, { pub6: "Pq9LmZ", endpoint: null, allowedIpsCount: 1, latestHandshake: 0, rxBytes: 0, txBytes: 0, online: false, handshakeAgoSec: null }] }, { name: "wg-phone", listenPort: 51821, peers: [{ pub6: "Zt7wBn", endpoint: "198.51.100.x:5120", allowedIpsCount: 1, latestHandshake: t - 95, rxBytes: 2.1e9, txBytes: 140e6, online: true, handshakeAgoSec: 95 }, { pub6: "Hy2cVd", endpoint: "198.51.100.x:6011", allowedIpsCount: 1, latestHandshake: t - 7200, rxBytes: 31e6, txBytes: 4e6, online: false, handshakeAgoSec: 7200 }] }], onlinePeers: 2, totalPeers: 4 },
        xray: { active: true, sub: "running", since: "2026-10-18 09:12", port: 8443, connections: 17, uniqueClients: 6, uptimeSec: 198720, restarts: 0, memoryBytes: 41.3e6, cpuSec: 512.4, listening: ["tcp:8443"], version: "25.9.11", note: "连接数含探测/回落，不等于用户数",
          config: { protocol: "vless", port: 8443, network: "tcp", security: "reality", serverNames: ["www.microsoft.com", "learn.microsoft.com"], target: "www.microsoft.com:443", clients: 3, flows: ["xtls-rprx-vision"], shortIdCount: 4, outbounds: ["direct", "block"], routingRules: 2, logLevel: "none", statsApi: false } },
        wg: [{ name: "wg-la", unit: "openclaw-wireguard-la", port: 51820, online: true, peerOnline: true }, { name: "wg-phone", unit: "openclaw-wireguard-phone", port: 51821, online: E !== "1", peerOnline: false }],
        error: E === "1" ? "sudo -n /usr/local/sbin/hosino-wg-status: 超时（5s）" : null, ts: Date.now() }); }
    if (u.pathname === "/api/uploads/limits") return J({ maxBytes: UPMAX, maxPerMessage: 10, ttlDays: 30, chat: { maxBytes: UPMAX, maxImageBytes: 6 * 1024 * 1024, maxPayload: 25 * 1024 * 1024, fromGateway: true }, cli: { maxBytes: UPMAX, claudeInlineImageMax: 5 * 1024 * 1024 } });
    if (u.pathname === "/api/uploads" && req.method === "POST") {
      if (req.headers["x-hs"] !== "1") return J({ error: "缺 x-hs" }, 403);
      const scope = u.searchParams.get("scope"), session = u.searchParams.get("session") || "", name = (u.searchParams.get("name") || "file").replace(/^.*[\\/]/, "").replace(/[\x00-\x1f"'`$<>|:*?\\]/g, "").slice(0, 100) || "file";
      if (!["chat", "cli"].includes(scope) || !session) return J({ error: "scope 或 session 不对" }, 400);
      if (scope === "cli" && !CLI_S.some(x => x.id === session)) return J({ error: "CLI 会话不存在" }, 404);
      const chunks = []; let n = 0, over = false; for await (const c of req) { n += c.length; if (n > UPMAX) over = true; else chunks.push(c); }
      if (over) return J({ error: "文件超过 20MB", code: "too_large" }, 413);
      const buf = Buffer.concat(chunks); if (!buf.length) return J({ error: "空文件" }, 400);
      await new Promise(r => setTimeout(r, +(process.env.MOCK_UP_DELAY || 300)));
      if (/flaky/i.test(name) && upFlaky++ % 2 === 0) return J({ error: "服务器开小差了" }, 500);
      const [mime, kind] = sniff(buf), id = "u" + [...Array(16)].map(() => "0123456789abcdef"[Math.random() * 16 | 0]).join("");
      const o = { id, name, mime, kind, size: buf.length, url: `/api/uploads/${id}`, createdAt: Date.now(), buf, scope, session }; UP.set(id, o);
      console.log("MOCK upload", scope, session, name, buf.length, mime); return J(upPub(o));
    }
    if (u.pathname.startsWith("/api/uploads/")) {
      const id = decodeURIComponent(u.pathname.slice(13)), o = UP.get(id);
      if (req.method === "DELETE") { if (req.headers["x-hs"] !== "1") return J({ error: "缺 x-hs" }, 403); UP.delete(id); console.log("MOCK upload.delete", id); return J({ ok: true }); }
      if (!o) { res.writeHead(404); return res.end(); }
      const dl = u.searchParams.get("download") === "1" || o.kind !== "image";
      res.writeHead(200, { "content-type": dl && o.kind !== "image" ? "application/octet-stream" : o.mime, "x-content-type-options": "nosniff", "content-security-policy": "sandbox", ...(dl ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(o.name)}` } : {}) });
      return res.end(o.buf);
    }
    if (u.pathname === "/api/send" && req.method === "POST") {
      if (req.headers["x-hs"] !== "1") return J({ error: "缺 x-hs" }, 403);
      const j = await body(); const ids = j.attachments || [];
      if (!j.key || (!String(j.message || "").trim() && !ids.length)) return J({ error: "缺少 message" }, 400);
      if (ids.length > 10) return J({ error: "最多 10 个附件", code: "too_many_attachments" }, 400);
      const ups = ids.map(i => UP.get(i)); if (ups.some(upExpired)) return J({ error: "附件不存在或已过期" }, 404);
      if (ups.some(x => x.scope !== "chat" || x.session !== j.key)) return J({ error: "附件属于别的会话" }, 403);
      if (ups.reduce((a, x) => a + Math.ceil(x.size / 3) * 4, 0) > 25 * 1024 * 1024) return J({ error: "附件合计超过 25MiB" }, 413);
      upUse(ids); SENT.push({ key: j.key, text: j.message || "", attachments: ids, ts: Date.now(), idem: "idem-" + Date.now() });
      console.log("MOCK send", j.key, (j.message || "").length, "deliver=" + !!j.deliver, "att=" + ids.length);
      return J({ runId: "mock-run-" + Date.now(), status: "started", attachments: ups.map(upPub) });
    }
    if (u.pathname === "/api/history") {
      const base = R["/api/history"].messages.filter(m => m.role !== "toolResult").map((m, i) => {
        const o = { ...m, id: "m" + i, turnId: "t" + i };
        if (m.role === "assistant") {
          const c = Array.isArray(m.content) ? m.content : null;
          const tc = c ? c.filter(p => /tool/i.test(p.type)) : [];
          if (c) o.content = c.filter(p => !/tool/i.test(p.type));
          o.tools = tc.map((p, j) => ({ id: "call_" + i + j, name: p.name, args: { text: JSON.stringify(p.arguments), truncated: false, length: JSON.stringify(p.arguments).length }, result: { text: '{"ok":true}', truncated: false, length: 11 }, isError: false, status: "ok", durationMs: 640 }));
          Object.assign(o, [{ delivery: "sent", deliveryReason: "qq-send-ok", deliveryConfidence: "high" }, { delivery: "sent", deliveryReason: "final-reply-inferred", deliveryConfidence: "medium" }, { delivery: "unknown", deliveryReason: "intermediate-text", deliveryConfidence: "low" }][i % 3]);
        }
        return o;
      });
      const longArgs = JSON.stringify({ command: "rg -n 'TODO|待办' /home/ubuntu/notes/" + "x".repeat(60) + " | sort | uniq -c", cwd: "/home/ubuntu", timeoutMs: 30000 });
      const extra = [
        { id: "x1", role: "user", turnId: "t90", content: "猫猫，群里那个广告别理它", ts: now - 200e3, sender: "7FE244B1202CD602DDA2C06B29C62F50" },
        { id: "x2", role: "assistant", turnId: "t90", content: [], ts: now - 198e3, model: "grok-4", delivery: null, tools: [{ id: "call_r", name: "read", args: { text: '{"path":"MEMORY.md"}', truncated: false, length: 20 }, result: { text: "# 记忆\n- 群规：不回广告", truncated: false, length: 14 }, isError: false, status: "ok", durationMs: 42 }] },
        { id: "x3", role: "assistant", turnId: "t90", content: [{ type: "text", text: "好的，这条广告我就不回复啦，已经记下来了～" }], ts: now - 195e3, model: "grok-4", delivery: "silent", deliveryReason: "stay_silent", deliveryConfidence: "high", tools: [
          { id: "call_e", name: "exec", args: { text: longArgs.slice(0, 2048), truncated: true, length: 5310 }, result: { text: "  3 TODO 周五读书会\n  1 待办 群公告\n  2 待办 生日惊喜", truncated: false, length: 40 }, isError: false, status: "ok", durationMs: 820 },
          { id: "call_w", name: "web_fetch", args: { text: '{"url":"https://spam.example.com/ad"}', truncated: false, length: 38 }, result: { text: "Error: fetch failed (ECONNREFUSED)", truncated: false, length: 34 }, isError: true, status: "error", durationMs: 310 },
          { id: "call_s", name: "mcp__openclaw__stay_silent", args: { text: '{"reason":"广告"}', truncated: false, length: 16 }, result: { text: '{"ok":true}', truncated: false, length: 11 }, isError: false, status: "ok", durationMs: 70 } ] },
        { id: "x4", role: "assistant", turnId: "t91", content: [{ type: "text", text: "我在查一下天气预报…" }], ts: now - 60e3, model: "grok-4", delivery: "unknown", deliveryReason: "no-send-ok-log", deliveryConfidence: "low", tools: [{ id: "call_p", name: "weather", args: { text: '{"city":"新加坡"}', truncated: false, length: 15 }, result: null, isError: false, status: "pending", durationMs: null }] } ];
      const older = Array.from({ length: 100 }, (_, i) => ({ id: "o" + i, turnId: "o" + i, role: i % 2 ? "assistant" : "user", content: i % 2 ? "早先的回复 #" + i : "早先的消息 #" + i, ts: now - 864e5 * 2 + i * 60e3, ...(i % 2 ? { delivery: "sent", deliveryReason: "final-reply-inferred", deliveryConfidence: "medium", tools: [] } : { sender: "249BDB11AA" }) }));
      const IDS = ["4330BBC5A1E2F3D4C5B6A7980112233A", "7FE244B1202CD602DDA2C06B29C62F50", "A1B2C3D4E5F60718293A4B5C6D7E8F90"];
      const hk = u.searchParams.get("key"); const sent = SENT.filter(x => x.key === hk).map((x, k) => ({ id: "s" + k + "-" + x.ts, role: "user", owner: true, content: x.text, ts: x.ts, ...(x.idem ? { idempotencyKey: x.idem + ":user", runId: x.idem } : {}), attachments: x.attachments.map(a => typeof a === "object" ? a : UP.get(a) ? upPub(UP.get(a)) : { id: a, expired: true }) }));
      const all = [...older, ...base, ...extra, ...sent].sort((a, b) => (a.ts || 0) - (b.ts || 0)).map((m, i) => {
        const o = { ...m, index: 540 + i };
        if (m.role === "user" && !m.owner) { const id = /^[0-9A-F]{32}$/i.test(m.sender || "") ? m.sender : IDS[i % 3]; const al = ALIASES[id.toLowerCase()]; const gw = id === IDS[2] ? "小葵" : null;
          o.senderId = id; o.senderName = gw; o.sender = { id, name: gw || al || null, source: gw ? "gateway" : al ? "alias" : null }; if (gw) SEEN[id.toLowerCase()] = gw; }
        else if (m.role === "user") { o.senderId = null; o.sender = null; }
        return o;
      });
      const lim = +(u.searchParams.get("limit") || 60), bf = u.searchParams.get("before");
      if (!(lim >= 1 && lim <= 200)) { res.writeHead(400); return res.end('{"error":"limit 1–200"}'); }
      let end = all.length; if (bf != null) { end = all.findIndex(m => m.id === bf || String(m.index) === bf); if (end < 0) { res.writeHead(400); return res.end('{"error":"无效 before"}'); } }
      const start = Math.max(0, end - lim), gatewayHasMore = true;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ sessionKey: u.searchParams.get("key"), channel: "qqbot", sendLogFrom: "2026-10-19", windowCount: all.length, gatewayHasMore, hasMore: start > 0 || gatewayHasMore, nextBefore: start > 0 ? all[start].id : null, totalMessages: 650, messages: all.slice(start, end) }));
    }
    if (u.pathname === "/api/sessions") { const q = (u.searchParams.get("q") || "").toLowerCase(); const list = R["/api/sessions"].sessions.map(decorate).filter(x => !q || [x.alias, x.displayName, x.label, x.key].some(v => String(v || "").toLowerCase().includes(q))); res.writeHead(200, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ ...R["/api/sessions"], sessions: list })); }
    if (u.pathname === "/api/aliases/set") { let b = ""; for await (const c of req) b += c; const j = JSON.parse(b || "{}"); if (j.alias) ALIASES[j.key] = j.alias.slice(0, 40); else delete ALIASES[j.key]; res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, key: j.key, alias: j.alias || null })); }
    if (u.pathname === "/api/aliases") { res.writeHead(200, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ aliases: ALIASES })); }
    if (u.pathname === "/api/qq/send") { let b = ""; for await (const c of req) b += c; const j = JSON.parse(b || "{}"); console.log("MOCK qq.send", j.sessionKey, j.confirm, (j.text || "").length); if ((j.attachments || []).length) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":"QQ 直发不支持附件","code":"attachments_unsupported"}'); } if (j.confirm !== true) { res.writeHead(400); return res.end('{"error":"需要 confirm:true 确认"}'); } }
    if (MISSING.has(u.pathname)) { res.writeHead(404, { "content-type": "application/json; charset=utf-8" }); return res.end('{"error":"接口不存在"}'); }
    if (ERR502[u.pathname]) { res.writeHead(502, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify(ERR502[u.pathname])); }
    if (u.pathname === "/api/models/probe") return setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(R[u.pathname])); }, 30000);
    const d = R[u.pathname] || { ok: true }; res.writeHead(200, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify(d));
  }
  let p = u.pathname === "/" || !path.extname(u.pathname) ? "/index.html" : u.pathname;
  fs.readFile(path.join(PUB, p), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "cache-control": p === "/index.html" ? "no-cache" : "max-age=3600", "content-type": MIME[path.extname(p)] || "application/octet-stream", "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" }); res.end(d); });
}).listen(+process.env.PORT || 18990);
