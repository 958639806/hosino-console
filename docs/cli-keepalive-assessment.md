# claude CLI 进程常驻（3 个会话）只读评估
时间：2026-10-20 22:20 SGT 前后，只读，未改任何文件，未重启。OpenClaw 2026.9.8，claude 2.1.293（/home/ubuntu/.local/bin/claude）。

## 1. 能否只对 3 个会话免超时 —— 能
- 计时器位置：`dist/extensions/anthropic/cli.runtime.js`
  - 77 行 `const IDLE_TIMEOUT_MS = 6e5;`
  - 182-191 行 `completeTurn()`：回合结束后 `setTimeout(() => session.handle.close("idle"), IDLE_TIMEOUT_MS)`
  - 下一回合开始 `executeClaudeCliTimed` 里 `clearTimeout(session.idleTimer)`。
- `context.qqClaudeLatencyContext.sessionKey` 已由 execute.runtime-BlvImd0-.mjs:1754 传进来（本文件第 19 行的延迟补丁就在用），可直接拿来判断。
- 另有 `extensions/anthropic/.setup/cli.runtime-6etgUkz5.mjs:592` 同样常量，是 setup 副本，运行时不走，不用改。
- 建议补丁 `QQ-CLAUDE-KEEPALIVE v1`（白名单 + 环境变量，其他会话仍 10 分钟）：
```diff
 const IDLE_TIMEOUT_MS = 6e5;
+// QQ-CLAUDE-KEEPALIVE v1
+const QQ_KEEPALIVE_KEYS = new Set((process.env.OPENCLAW_CLI_KEEPALIVE_KEYS ?? [
+  "agent:main:qqbot:group:379363a480715dfc01f13aaf92571111",
+  "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5",
+  "agent:main:main"   // 凛私聊；上线前用日志确认实际 key（可能是 agent:main:qqbot:c2c:4330BBC5…）
+].join(",")).split(",").map((s) => s.trim()).filter(Boolean));
+const QQ_KEEPALIVE_MS = Number(process.env.OPENCLAW_CLI_KEEPALIVE_MS) || 0; // 0 = 永不超时
+// END QQ-CLAUDE-KEEPALIVE v1
 ...
 	else {
-		session.idleTimer = setTimeout(() => session.handle.close("idle"), IDLE_TIMEOUT_MS);
-		session.idleTimer.unref();
+		const pinned = QQ_KEEPALIVE_KEYS.has(turn.context.qqClaudeLatencyContext?.sessionKey);
+		if (!pinned || QQ_KEEPALIVE_MS > 0) {
+			session.idleTimer = setTimeout(() => session.handle.close("idle"), pinned ? QQ_KEEPALIVE_MS : IDLE_TIMEOUT_MS);
+			session.idleTimer.unref();
+		}
 	}
```
  建议 OPENCLAW_CLI_KEEPALIVE_MS 先设 6–12 小时而不是真·永久，作为兜底（见第 3 点）。环境变量放 systemd drop-in（改 drop-in 需 daemon-reload + 重启网关）；不设环境变量就用代码里的默认白名单，可免 drop-in。
- 两个群的 key 已在代码中确认；凛私聊 key 需确认（agent:main:main 还是 qqbot c2c key），我没在日志里看到私聊的 sessionKey 字段，上线前查一下 `cli exec` 附近日志。
- 注意：registry 满 16 个时 `ensureCliLiveSessionCapacity`（cli-live-session-registry-UwsGavHf.mjs:1714-1726）会关掉第一个空闲进程，可能关到常驻的；当前远低于 16，可不处理。

## 2. 内存
- 现在：总 7424 MB，used 1890 MB，available 约 5533 MB，swap 255 MB（已用 52）。网关主进程 RSS 约 1.9–2.3 GB（日志 rssBytes≈2.3 GB）。
- 网关 22:20:46 刚重启（另一个部署），此刻没有 claude 进程，测不到实测值。按 claude 2.1.x 原生二进制经验估计每个 300–450 MB RSS（含 MCP 连接），3 个约 1–1.4 GB。
- 结论：3 个常驻后 available 仍约 4 GB，可以。建议上线后用 `ps -eo pid,rss,etime,args | grep claude` 实测一次，并观察是否随时间增长（长会话上下文大会涨）。

## 3. 长时间不关的风险
- 僵死/卡中间状态：transport（cli-transport-CgOJLNk7.mjs:95-96,180-181）监听子进程 exit；回合中进程退出会报 "exited unexpectedly"，`closeSession` 中止当前回合并从 registry 移除（registry `remove`）。回合超时/中止走 `handle.close("abort")`（cli.runtime.js 309/352/377/382）。没有空闲期的健康检查——空闲中进程挂了不会被发现，要到下一回合才知道。
- 自动重启：会。下一回合 `executeClaudeCliTimed` 里 `capability.current()` 拿不到可复用 handle（已关闭的已从 liveSessions 删除）→ `capability.restart()` → `createSession` 新起进程，只是这一回合变冷启动（约 +1.2 s）。若死进程恰好在回合内退出，该回合会失败一次，由上层 failover 处理。
- resume：新进程按 OpenClaw 会话正常续上（和现在 10 分钟后冷启动一样），常驻本身不引入新的 resume 风险；反而长期常驻上下文会越积越大，依赖 claude 自身 auto-compact，回合可能变慢、费用变高。这是最大的实际风险，建议设 6–12 h 兜底超时让它定期重开。
- 心跳保活：不需要。空闲进程不靠心跳；但群 heartbeat 本身若触发 claude 回合，也会刷新计时器。
- OAuth：/home/ubuntu/.claude/.credentials.json 含 accessToken、refreshToken、expiresAt、refreshTokenExpiresAt；当前 accessToken 约 12 分钟后到期（14:33 写入，约 8 小时有效）。claude CLI 进程自己在请求时检查过期并用 refreshToken 刷新、写回文件，常驻进程同样会刷新（这是 claude 内部行为，dist 里看不到，未实测长驻场景）。风险点：多个进程同时刷新可能互相覆盖文件；refreshToken 过期或被吊销后，常驻进程会持续 401，直到回合失败、进程被关闭。建议上线后观察日志中 401/oauth 报错。
- 指纹里有 `credentialFingerprint`（registry 1633 行），凭据输入变化会触发重启，不会用旧凭据卡住。

## 4. 指纹不一致仍会重启 —— 确认
cli.runtime.js `executeClaudeCliTimed`：`reusable = existing && existing.fingerprint === capability?.fingerprint ? ... : void 0`；不可复用就 `capability.restart()`。补丁只改空闲计时器，不碰这段，也不碰 registry 指纹（1567-1637）。

## 5. 补丁量 / 重启 / 升级
- 1 个文件、1 个补丁（cli.runtime.js，约 12 行），可选第 2 处（registry 容量回收跳过常驻，暂不需要）。
- 需要重启网关一次（模块已加载在内存）。用代码默认白名单则不需改 systemd drop-in。
- OpenClaw 升级会覆盖 dist，补丁会丢；需按惯例加入 ~/.openclaw/patches/canonical-manifest.json（该文件已在 manifest 中，因已有 QQ-CLAUDE-NATIVE-LATENCY v1 补丁，需更新其 sha），并让 reapply_all.sh 能重放；上线前后跑 `release_manager.py installed-check --manifest …` 和 `reapply_all.sh --check`。
