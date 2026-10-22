# OpenClaw 本地改动清单（升级 2026.9.8 → 2026.10.5 前评估）

2026-10-20 18:50（UTC+8），只读。比对方法：
- 在 box 上 `npm pack openclaw@2026.9.8` 得到原版，跟主机安装目录（tar 只读拉回 box，不含 node_modules）逐文件 `diff -rq`。
- 在主机上用 canonical-manifest.json 里的 sha256 逐个核对（只读，没有运行 reapply_all.sh 或 release_manager.py）。
- 拉 openclaw@2026.10.5 包，检查补丁锚点在新版里还在不在。

## 总数

| 类别 | 改动 | 升级 OpenClaw 时 |
|---|---|---|
| A. 核心 openclaw dist | **61 个文件被修改，新增 6 个**；diff 里能找到 32 个带版本号的标记，另有登记表里 11 条核心补丁（部分标记不以 QQ/OPENCLAW 开头）；约 19 个文件的改动没有标记 | **全部被覆盖** |
| B. codex 插件 `@openclaw/codex` 2026.9.8 | 登记表 6 条（统一工具、WS 复用、latency456 ×3、原生 exec 生命周期）+ `QQ-MEMORY-DURABLE-ADMISSION-PATCH v1`（不在登记表）；manifest 里有 21 个文件 | 插件版本和核心绑定（npm 最新 2026.10.5），升级核心通常连带升级它，**按会被覆盖处理** |
| C. qqbot `@tencent-connect/openclaw-qqbot` 2.0.4 | 登记表 10 条，加上我们的表情包补丁 v1.1 | npm 最新仍是 2.0.4。插件装在 `~/.openclaw/npm/projects/…__openclaw-generation__g-…`，**升级核心可能触发“新一代”重装** → 需要实测 |
| D. mem0 `@mem0/openclaw-mem0` 1.2.1 + `mem0ai` 3.0.7 | 登记表 7 条（Qdrant query 修复、RECALL v1/v2/warmup、并行召回、query+实体合批、遥测关闭的 drop-in），另有不在登记表的 `GROK-MEMORY-ADMISSION-GATE v1`、`READONLY RECALL DIAGNOSTICS v1`、memory-runtime 和 memory-queue 一套 | 和 C 一样，可能被重装（mem0ai 最新 3.3.1，**不要顺手升级**） |
| E. 自有插件 / workspace / systemd | 插件：followup-gate（工具路径提示、搜索来源提示、媒体延迟、表情包）、owner-guard（steer 授权、文本文件工具）；`baidu_search.py`；7 个 gateway drop-in，加我们的 heap.conf | **升级后保留**（不在 npm 包里） |
| F. 我们（hosino）今天的改动 | CLI admission v1/v2（核心 bridge 文件）；表情包补丁（qqbot + gate + sticker_manager + AGENTS.md）；heap.conf 4GB | bridge 在核心里会被覆盖，其余保留 |

**补丁工具链**：`~/.openclaw/patches/`
- `PATCHES.md`（463 行登记表）。注意：它的表头写的是韩国主机，内容沿用下来了。
- `reapply_all.sh`，调用 `release_manager.py`，后者读 `canonical-manifest.json`：216 个文件，各带 sha256 和快照，登记表 41 条标记。
- 34 个单项 `*_patch.py` / `*_reapply.py`。
- `transactions/` 下有 61 个事务：37 个 committed，24 个 rolled_back。
- staging 目录：`us-qq-media-stop-20261020` v6、v7、v9（只有 v9 已提交，v6 和 v7 只是草稿），另有 `registration-media-inspection`（已提交）。
- `misc/`、`obsolete/` 是 Codex 留下的测量和重启脚本，不是补丁。
- `~/.openclaw/backups/*/ROLLBACK.py` 是每一层的回滚脚本。

**来源**：A～E 基本都是 Codex（以前的运维 agent）通过 release_manager 事务打的，标记风格是 QQ-*、CODEX-*、MEM0-*。F 是我们打的。`OPENCLAW-MEMORY-DURABLE-ADMISSION v2`（核心 agent-harness）和 `GROK-MEMORY-ADMISSION-GATE`（mem0）出处不明，看风格是 Codex。

## ⚠ 现在就要知道的风险（不升级也存在）

canonical-manifest 和线上文件的**漂移有 6 处**，都是今天我们改的：
- `heap.conf`
- qqbot `dist/index.cjs`（表情包）
- `qq-group-followup-gate/index.js`（表情包）
- `workspace/scripts/sticker_manager.py`
- `workspace/AGENTS.md`
- `dist/qq-claude-memory-prefetch-bridge.mjs`（admission v2）

**如果有人跑 `reapply_all.sh --apply`（installed-repair 模式），会按快照把这 6 个文件“修复”回旧版**：
- 堆上限退回 2GB；
- 表情包功能丢失；
- 记忆捕获又会断掉。

建议找时间把这 6 个文件登记进 manifest（这是写操作，需要批准），或者至少在 PATCHES.md 里注明。

## A. 核心 dist 明细（2026.9.8 原版 vs 线上）

新增文件（全部是本地的）：
- `qq-claude-host-prep-timing.mjs`（QQ-CLAUDE-HOST-PREP-TIMING v1）
- `qq-claude-memory-prefetch-bridge.mjs`（QQ-CLAUDE-MEMORY-PREFETCH-BRIDGE v1 + HOSINO-CLI-ADMISSION v1/v2）
- `qq-explicit-stop.cjs`
- `qq-host-latency-trace.mjs`（QQ-CLAUDE-CORE-ROUTE v1）
- `qq-latency-trace.mjs`
- `qq-queue-diagnostics.mjs`（QQ-QUEUE-DIAGNOSTICS v1）

被修改的文件（文件 | 新增行数 | 标记）：
- `agent-harness-runtime-CnrNnAqy.mjs` | +3 | OPENCLAW-MEMORY-DURABLE-ADMISSION v2,
- `agent-runner.runtime-CbEKSY5P.mjs` | +50 | QQ,QQ-RESTART-OWNER-SOURCE v1,QQ-SOURCE-ACK-CONTINUATION v1,QQF,QQ_DELIVERY_UNCERTAIN,
- `agent-tool-definition-adapter-DhVQiLqj.mjs` | +12 | QQ-EARLY-MESSAGE-HOOK-OWNERSHIP v2,
- `agent-tools-DdIcx9SP.mjs` | +9 | QQ-CONTROLLED-MEDIA-HOST-DEFAULTS v1,QQ-GENERIC-TRIGGER-REQUESTER-PATCH v1,
- `agent-tools.before-tool-call-BbipAsOC.mjs` | +14 | QQ,QQ-REQUIRED-EXECUTION-GUARD v1,QQ-TOOL-HOOK-TRIGGER-PATCH v1,
- `agent-turn-service-DTertIom.mjs` | +67 | QQ,QQ-RESTART-REQUESTER-HOST v1,QQD,QQR,
- `bash-tools-3n5rTZUL.mjs` | +35 | QQ-CONTROLLED-MEDIA-EXEC-BRIDGE v1,
- `chat-send-handler-EwrCzZoZ.mjs` | +1 | QQR,
- `commentary-progress-owner-B_Ulr6Rd.mjs` | +30 | QQ-RESTART-OWNER-SOURCE v1,QQR,
- `computer-tool-C2ukNywl.mjs` | +3 | （无标记）
- `context-engine-maintenance-DKbclwGZ.mjs` | +3 | QQC,qq-claude-memory-prefetch-bridge,
- `coordinator-CylDxma1.mjs` | +5 | （无标记）
- `dispatch-DiXuntoC.mjs` | +6 | QQC,
- `dispatch-from-config-Dph1dwRJ.mjs` | +32 | OPENCLAW_QQ_PREPARATION_PROFILE,QQ-PREPARATION-PROFILE-PATCH v1,QQC,
- `drain-Da2fh6J9.mjs` | +18 | （无标记）
- `embedded-agent-DsCaQmKI.mjs` | +54 | QQ,
- `execute.runtime-BlvImd0-.mjs` | +54 | QQ-CLAUDE-NATIVE-LATENCY v1,QQ-CLAUDE-NATIVE-REQUESTER v1,QQC,qq-claude-host-prep-timing,
- `extensions/anthropic/cli.runtime.js` | +99 | QQ-CLAUDE-NATIVE-LATENCY v1,QQC,qq-claude-latency,qq-claude-native-latency-v,qq-claude-native-run-v,
- `extensions/xai/index.js` | +4 | （无标记）
- `get-reply-BV8KEWbF.mjs` | +78 | OPENCLAW_QQ_PREPARATION_PROFILE,QQ-DIRECT-SOURCE-OWNER-CAPABILITY v1,QQ-MEM0-HOST-PREFETCH v1,QQ-MEM0-HOST-PREFETCH v2,QQ-PREPARATION-PROFILE-PATCH v1,QQD,
- `get-reply-run-queue-Bmv2zHLu.mjs` | +8 | （无标记）
- `heartbeat-runner-run-BaD3XIs1.mjs` | +4 | QQ-CACHE-KEEPALIVE-ABORT-PATCH v1,
- `hook-helpers-CP-hOKld.mjs` | +4 | （无标记）
- `images-B_8zJlPf.mjs` | +20 | OPENCLAW_IMAGE_RESIZE_CACHE,QQ-DECLARED-PROMPT-IMAGES v1,
- `index.js` | +31 | QQ-WORKER-ONLY-COMPILE-CACHE v2,
- `loader-runtime-load-DCwhg2IV.mjs` | +6 | QQ-CACHE-KEEPALIVE-FACADE-PATCH v1,
- `main-session-recovery-clear-BczELu-B.mjs` | +2 | QQR,
- `mcp-grant-context-BX7efeWf.mjs` | +3 | QQ-CLAUDE-MCP-REQUESTER v1,
- `mcp-http-CM8OLJ7U.mjs` | +27 | QQ,QQ-CLAUDE-MCP-REQUESTER v1,QQM,
- `mcp-http.runtime-C0W84mMK.mjs` | +196 | QQ-CLAUDE-MCP-CATALOG-OBSERVATION v1,QQ-CLAUDE-MCP-DESCRIPTOR-CATALOG v2,QQ-CLAUDE-NODE-INVENTORY-SINGLEFLIGHT v1,QQC,QQ_CLAUDE_DESCRIPTOR_CATALOGS,QQ_CLAUDE_MCP_CATALOG_SEEN,QQ_CLAUDE_NODE_INVENTORY,qq-claude-mcp-catalog,qq-claude-mcp-catalog-v,qq-claude-native-run-v,qq-claude-node-inventory,qq-claude-tool-prep,qq-claude-tool-prep-v,
- `node-compile-cache-env-ClGKcLRy.mjs` | +11 | （无标记）
- `node-exec-availability-Vy5vF0ta.mjs` | +2 | （无标记）
- `openclaw-agent-execution-C4GB-NRD.mjs` | +51 | （无标记）
- `openclaw-tools-BwWTN0hs.mjs` | +16 | QQ-MEDIA-CURRENT-SOURCE-ROUTE v1,QQC,
- `package-update-activation-recovery.mjs` | +161 | OPENCLAW_IMAGE_RESIZE_CACHE,OPENCLAW_IMAGE_RESIZE_CACHE_DIR,OPENCLAW_QQ_IMAGE_DIRECT,QQ-IMAGE-DIRECT-COMPLETION-PATCH v1,QQI,
- `prepare.runtime-D_2b2gwh.mjs` | +148 | QQ-CLAUDE-MEMORY-PREPARATION-CURRENT v2,QQ-QUESTION-ROUTE-AUTHORITY-DIAGNOSTIC v1,QQC,QQQ,qq-claude-host-prep-timing,qq-claude-memory-prefetch-bridge,qq-claude-native-run-v,
- `prepared-model-runtime-CiPCD0fr.mjs` | +5 | （无标记）
- `prepared-model-runtime.facts-Pifkw2OK.mjs` | +6 | （无标记）
- `prepared-model-runtime.plugin-generation-BhjdlyN-.mjs` | +5 | （无标记）
- `queue-DC2hEEWL.mjs` | +15 | （无标记）
- `restart-recovery-state-DXIMXTjg.mjs` | +1 | QQR,
- `runtime-plugin-load-plan-ZJcpwJnb.mjs` | +9 | （无标记）
- `runtime-plugins-CsYRgcd7.mjs` | +3 | （无标记）
- `selection-aEGvijq3.mjs` | +6 | QQ-READ-CAPABILITIES v1,
- `server-restart-sentinel-CzWy_UqH.mjs` | +69 | OPENCLAW_QQ_IMAGE_DIRECT,QQ-IMAGE-DIRECT-COMPLETION-PATCH v1,QQI,
- `session-accessor.sqlite-entry-C87Sde4p.mjs` | +21 | （无标记）
- `session-cY6eTKvB.mjs` | +1 | QQR,
- `session-entry-handle-BRPwkXaJ.mjs` | +14 | （无标记）
- `session-entry-slot-keys-CUiZdkL7.mjs` | +1 | QQR,
- `session-lifecycle-admission-6HF8YqSN.mjs` | +9 | （无标记）
- `session-transcript-read-worker-runtime-Ey1OtD_0.mjs` | +107 | OPENCLAW_QQ_HISTORY_IDLE_DIAGNOSTICS,OPENCLAW_QQ_HISTORY_IDLE_REUSE,QQ-HISTORY-IDLE-DIAGNOSTICS v1,QQ-HISTORY-IDLE-REUSE-PATCH v1,
- `session-transcript-worker-resources-DLvHY0vJ.mjs` | +19 | （无标记）
- `simple-completion-runtime-SCvr0cFK.mjs` | +3 | （无标记）
- `sqlite-worker-store-DNLj-iuz.mjs` | +65 | （无标记）
- `stage-timing-BUG4Fnsv.mjs` | +6 | QQ-LATENCY-TRACE,
- `subagent-announce-delivery-CoOIdkBH.mjs` | +19 | QQ-IMAGE-DIRECT-COMPLETION-PATCH v1,QQI,
- `tool-images-C_eAR31_.mjs` | +73 | OPENCLAW_IMAGE_RESIZE_CACHE,OPENCLAW_IMAGE_RESIZE_CACHE_DIR,
- `tool-resolution-CStAFkPx.mjs` | +16 | QQ,QQ-COMPLETE-GROUP-CATALOG v1,QQC,
- `tools-effective-CvK1OSvA.mjs` | +4 | （无标记）
- `user-turn-transcript.metadata-C4MejEIQ.mjs` | +12 | QQ-MEM0-HOST-PREFETCH v1,
- `worker-task-pool-Cl1KhdJb.mjs` | +11 | QQ-HISTORY-IDLE-REUSE-PATCH v1,

标记按用途归类：
- **Claude CLI 通道**：QQ-CLAUDE-NATIVE-LATENCY、NATIVE-REQUESTER、MCP-REQUESTER、MCP-DESCRIPTOR-CATALOG v2、MCP-CATALOG-OBSERVATION、NODE-INVENTORY-SINGLEFLIGHT、MEMORY-PREPARATION-CURRENT v2，以及 bridge 和 HOSINO-CLI-ADMISSION。作用：让 QQ 群在 Claude CLI 上跑得通、延迟低、有记忆召回和捕获。
- **身份和权限**：QQ-RESTART-OWNER-SOURCE、RESTART-REQUESTER-HOST、DIRECT-SOURCE-OWNER-CAPABILITY、GENERIC-TRIGGER-REQUESTER、TOOL-HOOK-TRIGGER、REQUIRED-EXECUTION-GUARD、READ-CAPABILITIES、QUESTION-ROUTE-AUTHORITY-DIAGNOSTIC。作用：判断谁是主人、谁能触发什么，防止被冒充。
- **媒体**：QQ-IMAGE-DIRECT-COMPLETION（worker、producer、recovery）、CONTROLLED-MEDIA-HOST-DEFAULTS、CONTROLLED-MEDIA-EXEC-BRIDGE、MEDIA-CURRENT-SOURCE-ROUTE、DECLARED-PROMPT-IMAGES、IMG-RESIZE-CACHE、OVERSIZE-IMAGE、IMAGE-REPLAY-CACHE。作用：生成图直接回群、大图缩放缓存。
- **性能和缓存**：TOOLS-EFFECTIVE-CACHE / NONBLOCKING（修控制台每分钟断线）、QQ-HISTORY-IDLE-REUSE / DIAGNOSTICS、QQ-WORKER-ONLY-COMPILE-CACHE v2、QQ-CACHE-KEEPALIVE-FACADE / ABORT、QQ-PREPARATION-PROFILE、QQ-LATENCY-TRACE、QQ-COMPLETE-GROUP-CATALOG、QQ-EARLY-MESSAGE-HOOK-OWNERSHIP v2、QQ-SOURCE-ACK-CONTINUATION。
- **记忆**：QQ-MEM0-HOST-PREFETCH v1/v2、OPENCLAW-MEMORY-DURABLE-ADMISSION v2。
- **无标记的改动**（约 19 个文件，例如 sqlite-worker-store、drain、queue、session-entry-handle、prepared-model-runtime*、runtime-plugin-load-plan、extensions/xai）：来自 release_manager 事务（比如 qq-startup-lifecycle、runtime-prefetch-continuation、native-compaction-custody、s0-deployment-protection）。只能凭事务名和 manifest 快照追溯，**很难单独移植**。

## 在 2026.10.5 上能不能干净地打上

- 61 个被改文件中，**49 个对应的模块在 10.5 里内容已经变了**，1 个没变，11 个找不到同名模块（被拆分或改名）。dist 文件名是哈希，每个版本都会变，所以所有按文件名定位的补丁脚本**都会失效**。
- 锚点检查：取每个文件改动处前后的原版代码行（长度超过 25 字符），在 10.5 的全部 dist 里搜。命中率 ≥90% 的 29 个，50～90% 的 27 个，<50% 的 5 个（index.js、context-engine-maintenance、heartbeat-runner-run、worker-task-pool、simple-completion-runtime）。也就是说，**大约一半需要手工重新移植，没有一个能直接套用**。
- release_manager 自己也写了：“Unknown upgrades require offline porting”（遇到未知版本只能离线移植）。
- **10.5 上游有没有替代**：
  - admissionCommitted 和记忆准入：**没有**，10.5 里根本没有这个字段。
  - Claude CLI 相关：changelog 里有不少 Claude CLI 修复（模型列表、登录、历史等），但没有看到 QQ 专用的这些行为。
  - 性能：有大量 SQLite 和 worker 性能改进（"Faster, lighter Gateway"），可能让 TOOLS-EFFECTIVE、HISTORY-IDLE 等部分补丁变得不需要，但要实测才能确定。
  - 其余 QQ 定制（身份、媒体、两个群的行为）上游不会有。

## 不重新打补丁就升级的后果

- 记忆：Claude CLI 通道不再捕获（bridge 和 admission 都没了）。更糟的是 mem0 插件里的准入检查（插件不在核心里，可能保留）还在，**codex 和内置通道也会因为没有 admissionCommitted 而全部停止捕获**。
- QQ 群在 Claude CLI 上：可能缺少工具目录和请求者身份（QQ-CLAUDE-MCP-* 和 REQUESTER），工具调用和权限判断会出错。
- 主人识别和重启权限的补丁丢失 → 群里的权限边界退回上游默认。
- 生成图直接回群、大图缓存、控制台每分钟断线的修复都会消失。
- 如果 qqbot 和 mem0 被“新一代”重装，C 和 D 也会全部消失：群静默、分段、表情包、JM 按钮、记忆召回补丁、Qdrant query 修复（不修会召回报错）。

## 移植工作量估算

- 核心 A：约 40 个有标记的补丁，加上无标记的事务改动，针对 10.5 重新定位、移植、验证：**3～5 个工作日**。另外还要逐项用真实 QQ 流量回归（延迟、权限、媒体、记忆）。
- codex 插件 B：1～2 天（要先确认 10.5 版 codex 的 run-attempt 结构）。
- C 和 D：如果不被重装就是 0；如果被重装，用现有单项脚本重新跑，约半天（脚本按内容锚点定位，qqbot 和 mem0 版本没变，大概率能直接打上）。
- 合计**约 1～1.5 周**，期间要有测试环境（不能直接在生产群上试）。

## 10.5 changelog 里和配置有关的

- Doctor 会做状态库迁移（"Doctor refuses retired state before migrating"、transcript archive migration）→ **升级时会改 SQLite 状态库**，回滚到 9.8 不一定能读，必须先整份备份 `~/.openclaw/state`、`agents/*/agent/*.sqlite`。
- codex 运行时版本低于 2026.9.7 会被拒绝（我们是 9.8，没问题），但 codex 插件版本和核心不一致时的兼容性需要确认。
- Claude CLI 模型列表改成“新模型不用等发版也会显示”，可能和本地 claude-catalog-complete-v2 / claude-pro-model-list-v3 事务冲突。
- 没看到 openclaw.json 的破坏性 schema 变更，但 plugins 和 slots 的加载逻辑有改动（mixed-case ID、替换安装），需要在测试环境里跑 `openclaw config validate` 才能确认。

## 建议

**现在不升级，等。** 理由：
- 没有任何一个上游修复是我们急需的。
- admission 问题已经在 9.8 上修好了。
- 升级要移植约 40 个以上的补丁，工作量约 1～1.5 周，而且有改状态库的迁移风险。

如果以后决定升级，按这个顺序：
1. 先补登记今天的 6 处漂移，然后把整个线上安装打包：
   ```
   tar czf /root/openclaw-2026.9.8-live-<日期>.tgz -C /home/ubuntu/.npm-global/lib/node_modules openclaw
   tar czf …-openclaw-home.tgz ~/.openclaw   # 排除 workspace 大文件和日志，含 state、agents sqlite、npm/projects、plugins、patches
   ```
   systemd 的 drop-in 也要备份。
2. 在另一台机器或容器里装 10.5，离线移植并跑通回归，**不在生产上直接试**。
3. 上线：停网关 → `npm i -g openclaw@2026.10.5` → 套用移植好的补丁集 → `openclaw config validate` → 启动 → 验证 → 观察。
4. 回滚：停网关 → `npm i -g openclaw@2026.9.8` → 用第 1 步的 tar 覆盖 `node_modules/openclaw`（直接恢复已打补丁的版本，比重跑补丁可靠）→ 恢复 `~/.openclaw/state` 和 agents 的 sqlite 备份（防止 Doctor 迁移后 9.8 读不了）→ 启动 → 验证。
5. 升级、回滚和每一次重启都需要凛批准，QQ 会中断（迁移期间可能 5～15 分钟）。
