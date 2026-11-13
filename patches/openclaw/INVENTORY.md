# 补丁清单

基线：OpenClaw 2026.9.8、qqbot 2.0.4、codex 2026.9.8、openclaw-mem0 1.2.1、mem0ai 3.0.7（都是 npm 原版）。下面的清单是拿原版包和线上安装目录逐个比 sha256 得出的，不是照抄登记表。

## 控制台功能依赖的部分

| # | 组件 | 类型 | 作用 | 对应控制台功能 | 必要性 |
|---|---|---|---|---|---|
| 1 | `plugins/qq-group-followup-gate` v2.4.1 | 独立插件 | 每轮群聊提示（表情/语音标签菜单，按 `stickers/params.json` 掷骰子）、`stay_silent` 工具、待机/NO_REPLY 过滤、重启预热、群缓存保活、潜水表情；`HOSINO-FUN-CONTEXT`（小脾气/拟人化/抢早安）、`HOSINO-PRIVATE-COMPANION`（私聊陪伴）、`HOSINO-VOICE-PARAMS/EXPLICIT/EMOTION`、`HOSINO-OUTCOME`（真实发送结果回给模型） | 表情包、表情参数、语音参数、拟人化、小脾气、私聊陪伴、抢早安状态（控制台会检查 `fun-context.mjs`、`index.js`、`private-companion.mjs` 里的标记） | 必装 |
| 2 | `plugins/qq-group-owner-guard` v1.2.0 | 独立插件 | 主人/非主人身份和工具权限、两群统一工具目录、执行策略（放行 `fun_followup.py`、`fun_mbti.py`）、QQ 文本文件工具 | 拟人化面板的“脚本是否放行”探测；非主人不能用主人工具 | 必装 |
| 3 | `patches/qqbot-2.0.4.diff` | 改官方文件：`dist/index.cjs`，新增 `dist/qq-delivery-receipts.cjs`、`dist/qq-explicit-stop.cjs` | 媒体标签（`<表情>`/`<语音>`）解析和发送、上传缓存、分段发送、群静默；`HOSINO-STICKER-PATCH`、`HOSINO-VOICE-PARAMS/NAMED/EXPLICIT`、`HOSINO-OUTCOME`、`HOSINO-PRIVATE-COMPANION` 的 qqbot 一侧；送达回执；还有 JM 确认按钮、延迟/队列/计时等一批补丁 | 表情包和语音真正发出去；聊天页“撤回”要读 `~/.openclaw/qqbot/delivery-receipts`；表情/语音参数生效 | 必装。同一个文件上叠了约 50 个补丁，无法单独拆出 |
| 4 | `workspace-scripts/sticker_manager.py`（+ `sticker_models.json`、`doubao_draw.py`） | 脚本 | 表情包查找、入库、生成新表情 | 表情包面板的“生成”；模型自创分类后台补画 | 必装（不用生成功能可以不配 key） |
| 5 | `workspace-scripts/xingye_tts.py`（+ `media_deadline.py`、`mimo_tts.py`） | 脚本 | 语音合成（Fish / Grok / MiMo 回落），读 `workspace/fun/voice-tts.json` 和 `voices/voices.json` | 语音设置、音色库试听 | 必装（用语音的话） |
| 6 | `workspace-scripts/fun_common.py`、`fun_followup.py`、`fun_grudge.py`、`fun_mbti.py` | 脚本 | 拟人化的追问、记仇、MBTI 数据读写 | 拟人化面板 | 必装（用拟人化的话） |
| 7 | `patches/openclaw-2026.9.8/tools-effective-cache.diff`（或 `tools/apply-tools-effective-cache.py`） | 改官方文件：`dist/tools-effective-*.mjs` | `TOOLS-EFFECTIVE-CACHE-PATCH v1`：缓存从 10s/120s 拉长到 6h/24h。`.diff` 里还带 `TOOLS-EFFECTIVE-NONBLOCKING-PATCH v1`，会让 `tools.effective` 一律返回“暂时不可用”；脚本版只改缓存 | 控制台“工具”页会触发插件冷加载，没这个补丁网关大约每分钟卡一次、控制台断线 | 建议 |

控制台调用的 68 个网关方法都在原版 OpenClaw 2026.9.8 里找得到，没有哪个是补丁新加的。所以核心全量补丁不影响控制台连接，影响的是 QQ 侧的行为和延迟。

## 选装（性能 / QQ 行为，控制台不直接依赖）

| 组件 | 文件数 | 内容 |
|---|---|---|
| `openclaw-core-full.diff` | 修改 91 个，新增 12 个 | 图片缩放缓存和超大图处理、QQ 重启和续接、提前消息钩子、受控媒体执行桥（`followup-gate` 的 `controlledMediaJobs` 依赖它）、Claude CLI 记忆预取、各种延迟计时和诊断、worker 和队列调整 |
| `codex-2026.9.8.diff` | 修改 10 个，新增 11 个 | 两群统一工具（A12）、WS 复用、原生 exec 生命周期、自动压缩、TLS 预连接、计时 |
| `openclaw-mem0-1.2.1.diff` | 修改 2 个，新增 7 个 | 召回提速（v1/v2/预热/并行）、群记忆读取、记忆队列、文字 API 记忆桥 |
| `mem0ai-3.0.7.diff` | 修改 1 个，新增 1 个 | Qdrant `query` 接口修复（A6）、写入回执 |

## 逐文件明细（自动生成）

### openclaw 2026.9.8 核心（103 个文件）

| 文件 | 状态 | 新增/删除行 | 标记 |
|---|---|---|---|
| `dist/agent-harness-runtime-CnrNnAqy.mjs` | 修改 | +18/-3 | OPENCLAW-MEMORY-DURABLE-ADMISSION v2 |
| `dist/agent-runner.runtime-CbEKSY5P.mjs` | 修改 | +101/-9 | QQ-RESTART-OWNER-SOURCE v1, QQ-SOURCE-ACK-CONTINUATION v1, QQ-TTS-FINAL-PAYLOAD-PASSIVE v1 |
| `dist/agent-tool-definition-adapter-DhVQiLqj.mjs` | 修改 | +12/-2 | QQ-EARLY-MESSAGE-HOOK-OWNERSHIP v2 |
| `dist/agent-tools-DdIcx9SP.mjs` | 修改 | +9/-1 | QQ-CONTROLLED-MEDIA-HOST-DEFAULTS v1, QQ-GENERIC-TRIGGER-REQUESTER-PATCH v1 |
| `dist/agent-tools.before-tool-call-BbipAsOC.mjs` | 修改 | +14/-0 | QQ-REQUIRED-EXECUTION-GUARD v1, QQ-TOOL-HOOK-TRIGGER-PATCH v1 |
| `dist/agent-turn-service-DTertIom.mjs` | 修改 | +67/-1 | QQ-RESTART-REQUESTER-HOST v1 |
| `dist/bash-tools-3n5rTZUL.mjs` | 修改 | +35/-0 | QQ-CONTROLLED-MEDIA-EXEC-BRIDGE v1 |
| `dist/bootstrap-files-CnxP5PZe.mjs` | 修改 | +112/-13 |  |
| `dist/builtin-openclaw-DEib7rq9.mjs` | 修改 | +41/-2 |  |
| `dist/chat-send-handler-EwrCzZoZ.mjs` | 修改 | +1/-0 |  |
| `dist/cli-live-session-registry-UwsGavHf.mjs` | 修改 | +145/-3 |  |
| `dist/cli-shared-D13Avb_w.mjs` | 修改 | +7/-3 |  |
| `dist/cli-transport-CgOJLNk7.mjs` | 修改 | +154/-7 | QQ-CLAUDE-LOCAL-BOUNDARIES v1 |
| `dist/commentary-progress-owner-B_Ulr6Rd.mjs` | 修改 | +32/-5 | QQ-RESTART-OWNER-SOURCE v1 |
| `dist/computer-tool-C2ukNywl.mjs` | 修改 | +3/-3 |  |
| `dist/context-engine-maintenance-DKbclwGZ.mjs` | 修改 | +27/-6 |  |
| `dist/coordinator-CylDxma1.mjs` | 修改 | +5/-1 |  |
| `dist/dispatch-DiXuntoC.mjs` | 修改 | +6/-0 |  |
| `dist/dispatch-from-config-Dph1dwRJ.mjs` | 修改 | +45/-20 | QQ-PREPARATION-PROFILE-PATCH v1 |
| `dist/drain-Da2fh6J9.mjs` | 修改 | +18/-1 |  |
| `dist/embedded-agent-DsCaQmKI.mjs` | 修改 | +79/-4 | QQ-TTS-ARTIFACT-PASSIVE v1 |
| `dist/execute.runtime-BlvImd0-.mjs` | 修改 | +54/-0 | QQ-CLAUDE-NATIVE-LATENCY v1, QQ-CLAUDE-NATIVE-REQUESTER v1 |
| `dist/execution-C6SFdSb7.mjs` | 修改 | +1/-1 |  |
| `dist/extensions/anthropic/cli.runtime.js` | 修改 | +150/-9 | QQ-CLAUDE-KEEPALIVE v1, QQ-CLAUDE-LOCAL-BOUNDARIES v1, QQ-CLAUDE-NATIVE-LATENCY v1 |
| `dist/extensions/xai/index.js` | 修改 | +4/-0 |  |
| `dist/get-reply-BV8KEWbF.mjs` | 修改 | +96/-2 | QQ-DIRECT-SOURCE-OWNER-CAPABILITY v1, QQ-MEM0-HOST-PREFETCH v1, QQ-MEM0-HOST-PREFETCH v2, QQ-PREPARATION-PROFILE-PATCH v1 |
| `dist/get-reply-run-queue-Bmv2zHLu.mjs` | 修改 | +8/-2 |  |
| `dist/heartbeat-runner-run-BaD3XIs1.mjs` | 修改 | +1510/-1499 | QQ-CACHE-KEEPALIVE-ABORT-PATCH v1, QQ-CACHE-OWNED-PRODUCER v1 |
| `dist/hook-helpers-CP-hOKld.mjs` | 修改 | +4/-5 |  |
| `dist/hooks-BKWpaofg.mjs` | 修改 | +99/-19 | QQ-PROMPT-HOOK-TIMING v1, QQ-PROMPT-HOOK-TIMING v2 |
| `dist/images-B_8zJlPf.mjs` | 修改 | +20/-3 | QQ-DECLARED-PROMPT-IMAGES v1 |
| `dist/index.js` | 修改 | +31/-0 | QQ-WORKER-ONLY-COMPILE-CACHE v2 |
| `dist/infra/sqlite-store.worker.js` | 修改 | +12/-1 |  |
| `dist/isolated-completion-9oxenTEe.mjs` | 修改 | +2/-0 |  |
| `dist/keyed-fifo-lease-BbGhj9IJ.mjs` | 修改 | +16/-6 |  |
| `dist/loader-runtime-load-DCwhg2IV.mjs` | 修改 | +73/-8 | QQ-CACHE-KEEPALIVE-FACADE-PATCH v1, QQ-WEB-PROVIDER-RESOLUTION-OBSERVER v1 |
| `dist/main-session-recovery-clear-BczELu-B.mjs` | 修改 | +2/-1 |  |
| `dist/mcp-grant-context-BX7efeWf.mjs` | 修改 | +3/-0 | QQ-CLAUDE-MCP-REQUESTER v1 |
| `dist/mcp-http-CM8OLJ7U.mjs` | 修改 | +27/-0 | QQ-CLAUDE-MCP-REQUESTER v1 |
| `dist/mcp-http.runtime-C0W84mMK.mjs` | 修改 | +200/-11 | HOSINO-TOOLCAT v1, HOSINO-TOOLFP v1, QQ-CLAUDE-MCP-CATALOG-OBSERVATION v1, QQ-CLAUDE-MCP-DESCRIPTOR-CATALOG v2, QQ-CLAUDE-NODE-INVENTORY-SINGLEFLIGHT v1 |
| `dist/native-hook-relay/entry.js` | 修改 | +37/-2 |  |
| `dist/native-hook-relay-CXUYKBKa.mjs` | 修改 | +54/-19 |  |
| `dist/native-workspace-bootstrap-diagnostics.mjs` | 新增 | +27/-0 |  |
| `dist/native-workspace-bootstrap-scope.mjs` | 新增 | +121/-0 |  |
| `dist/node-compile-cache-env-ClGKcLRy.mjs` | 修改 | +11/-1 |  |
| `dist/node-exec-availability-Vy5vF0ta.mjs` | 修改 | +2/-2 |  |
| `dist/openclaw-agent-execution-C4GB-NRD.mjs` | 修改 | +51/-11 |  |
| `dist/openclaw-state-worker-runtime-CckKB9al.mjs` | 修改 | +1/-48 |  |
| `dist/openclaw-state-worker-store-DwGcGmZn.mjs` | 修改 | +14/-3 |  |
| `dist/openclaw-tools-BwWTN0hs.mjs` | 修改 | +273/-29 | HOSINO-C2C-SKIP-AUTO-AFTER-FINAL v1, QQ-CONVERSATION-SOURCE-COMPLETION v1, QQ-MEDIA-CURRENT-SOURCE-ROUTE v1, QQ-WEB-FETCH-STAGE-DIAGNOSTICS v1 |
| `dist/package-update-activation-recovery.mjs` | 修改 | +162/-6 | IMG-RESIZE-CACHE-PATCH v1, OVERSIZE-IMAGE-PATCH v1, QQ-IMAGE-DIRECT-COMPLETION-PATCH v1 |
| `dist/placement-store-CDVVEb8Q.mjs` | 修改 | +8/-5 |  |
| `dist/placement-turn-claims.worker-leaf-20261105.mjs` | 新增 | +54/-0 |  |
| `dist/plugin-generation-artifact-Bm1J86Hz.mjs` | 修改 | +241/-7 |  |
| `dist/plugin-sdk/agent-harness-runtime.js` | 修改 | +1/-0 |  |
| `dist/prepare.runtime-D_2b2gwh.mjs` | 修改 | +256/-13 | HOSINO-TOOLFP v1, QQ-CLAUDE-MEMORY-PREPARATION-CURRENT v2, QQ-QUESTION-ROUTE-AUTHORITY-DIAGNOSTIC v1 |
| `dist/prepared-model-runtime-CiPCD0fr.mjs` | 修改 | +9/-4 |  |
| `dist/prepared-model-runtime.facts-Pifkw2OK.mjs` | 修改 | +6/-1 |  |
| `dist/prepared-model-runtime.plugin-generation-BhjdlyN-.mjs` | 修改 | +5/-0 |  |
| `dist/qq-claude-host-prep-timing.mjs` | 新增 | +80/-0 | QQ-CLAUDE-HOST-PREP-TIMING v1 |
| `dist/qq-claude-memory-prefetch-bridge.mjs` | 新增 | +306/-0 | HOSINO-CLI-ADMISSION v1, HOSINO-CLI-ADMISSION v2, QQ-CLAUDE-LEGACY-RECALL-OVERLAP v3, QQ-CLAUDE-MEMORY-PREFETCH-BRIDGE v1 |
| `dist/qq-explicit-stop.cjs` | 新增 | +98/-0 |  |
| `dist/qq-host-latency-trace.mjs` | 新增 | +553/-0 | QQ-CLAUDE-CORE-ROUTE v1 |
| `dist/qq-latency-trace.mjs` | 新增 | +39/-0 |  |
| `dist/qq-passive-model-timing.mjs` | 新增 | +122/-0 |  |
| `dist/qq-passive-tool-timing.mjs` | 新增 | +139/-0 |  |
| `dist/qq-queue-diagnostics.mjs` | 新增 | +47/-0 | QQ-QUEUE-DIAGNOSTICS v1 |
| `dist/qq-reply-admission-trace.mjs` | 新增 | +242/-0 | QQ-ADMISSION-BOUNDED-SUMMARY v1 |
| `dist/queue-DC2hEEWL.mjs` | 修改 | +15/-7 |  |
| `dist/restart-recovery-state-DXIMXTjg.mjs` | 修改 | +1/-0 |  |
| `dist/runtime-plugin-load-plan-ZJcpwJnb.mjs` | 修改 | +9/-4 |  |
| `dist/runtime-plugins-CsYRgcd7.mjs` | 修改 | +3/-2 |  |
| `dist/selection-aEGvijq3.mjs` | 修改 | +24/-1 | QQ-READ-CAPABILITIES v1, QQ-TTS-ARTIFACT-PASSIVE v1 |
| `dist/server-restart-sentinel-CzWy_UqH.mjs` | 修改 | +69/-1 | QQ-IMAGE-DIRECT-COMPLETION-PATCH v1 |
| `dist/server-worker-placement-startup-DeKNE2f-.mjs` | 修改 | +1/-0 |  |
| `dist/session-accessor.sqlite-entry-C87Sde4p.mjs` | 修改 | +21/-1 |  |
| `dist/session-boundary-prompt-cache-key-Daa6qS1e.mjs` | 修改 | +14/-3 |  |
| `dist/session-cY6eTKvB.mjs` | 修改 | +1/-0 |  |
| `dist/session-entry-handle-BRPwkXaJ.mjs` | 修改 | +23/-4 |  |
| `dist/session-entry-slot-keys-CUiZdkL7.mjs` | 修改 | +1/-0 |  |
| `dist/session-lifecycle-admission-6HF8YqSN.mjs` | 修改 | +9/-0 |  |
| `dist/session-observer-model-DvZF_Ub9.mjs` | 修改 | +1/-1 |  |
| `dist/session-transcript-read-worker-runtime-Ey1OtD_0.mjs` | 修改 | +107/-12 | QQ-HISTORY-IDLE-DIAGNOSTICS v1, QQ-HISTORY-IDLE-REUSE-PATCH v1 |
| `dist/session-transcript-worker-resources-DLvHY0vJ.mjs` | 修改 | +19/-0 |  |
| `dist/simple-completion-runtime-SCvr0cFK.mjs` | 修改 | +3/-0 |  |
| `dist/sqlite-worker-operation-admission-BB758RIN.mjs` | 修改 | +90/-3 |  |
| `dist/sqlite-worker-store-DNLj-iuz.mjs` | 修改 | +80/-17 |  |
| `dist/stage-timing-BUG4Fnsv.mjs` | 修改 | +6/-3 |  |
| `dist/state/openclaw-state.worker.js` | 修改 | +14/-0 |  |
| `dist/status-text-B0nNertx.mjs` | 修改 | +28/-2 |  |
| `dist/subagent-announce-delivery-CoOIdkBH.mjs` | 修改 | +19/-0 | QQ-IMAGE-DIRECT-COMPLETION-PATCH v1 |
| `dist/tool-images-C_eAR31_.mjs` | 修改 | +73/-4 | IMG-RESIZE-CACHE-PATCH v1, IMG-RESIZE-CACHE-VALIDATION-PATCH v1, OVERSIZE-IMAGE-PATCH v1 |
| `dist/tool-resolution-CStAFkPx.mjs` | 修改 | +16/-2 | QQ-COMPLETE-GROUP-CATALOG v1 |
| `dist/tools-effective-CvK1OSvA.mjs` | 修改 | +4/-3 | TOOLS-EFFECTIVE-CACHE-PATCH v1, TOOLS-EFFECTIVE-NONBLOCKING-PATCH v1 |
| `dist/tts-tool-result-provenance-z42MPFVT.mjs` | 修改 | +6/-1 |  |
| `dist/undici-runtime-CqYpdl7N.mjs` | 修改 | +34/-2 | QQ-ORIGIN-IDLE-POLICY v1 |
| `dist/user-turn-transcript.metadata-C4MejEIQ.mjs` | 修改 | +12/-1 | QQ-MEM0-HOST-PREFETCH v1 |
| `dist/web-fetch/runtime.js` | 修改 | +55/-16 | QQ-WEB-PROVIDER-RESOLUTION-OBSERVER v1 |
| `dist/web-provider-runtime-shared-D-hphFfE.mjs` | 修改 | +62/-13 | QQ-WEB-PROVIDER-RESOLUTION-OBSERVER v1 |
| `dist/worker/sqlite-store.worker.mjs` | 修改 | +1/-1 |  |
| `dist/worker/worker.mjs` | 修改 | +1/-1 |  |
| `dist/worker-task-pool-Cl1KhdJb.mjs` | 修改 | +11/-8 | QQ-HISTORY-IDLE-REUSE-PATCH v1 |
| `dist/worker-turn-failure-hh0TYclS.mjs` | 修改 | +29/-6 |  |

### @openclaw/codex 2026.9.8（21 个文件）

| 文件 | 状态 | 新增/删除行 | 标记 |
|---|---|---|---|
| `dist/.setup/compact-8ttks5U5.mjs` | 修改 | +90/-12 |  |
| `dist/.setup/compaction-cleanup-custody.mjs` | 新增 | +153/-0 |  |
| `dist/.setup/dynamic-tools-Db2sY5cZ.mjs` | 修改 | +275/-19 | QQ-CONVERSATION-SOURCE-COMPLETION v1, QQ-GROUP-UNIFIED-TOOLS-PATCH v1, QQ-PROCESS-OWNERSHIP v2, QQ-SCOPED-TOOL-RESULT-ARCHIVE v1 |
| `dist/.setup/inference-dispatch-CMZtjQyz.mjs` | 修改 | +58/-7 | CODEX-LATENCY456-PATCH v1 |
| `dist/.setup/inference-metadata-CgIf7sOx.mjs` | 修改 | +25/-2 | CODEX-LATENCY456-PATCH v1, CODEX-WS-PREWARM-COMPAT-PATCH v1 |
| `dist/.setup/inference-proxy-DhcXOgUE.mjs` | 修改 | +198/-10 | CODEX-LATENCY456-PATCH v1, CODEX-WS-LIFECYCLE-DIAGNOSTICS v1, CODEX-WS-REUSE-PATCH v1, QQ-BOUNDED-WS-REUSE v1, QQ-NATIVE-TLS-PRECONNECT v1, QQ-PREWARM-LINK v1, QQ-REQUEST-PATH-PROBE v1 |
| `dist/.setup/native-subagent-monitor-BwkQXf9e.mjs` | 修改 | +7/-0 |  |
| `dist/.setup/preparation-leaf-timing.mjs` | 新增 | +23/-0 | CODEX-LATENCY456-PATCH v1 |
| `dist/.setup/qq-compact-skill-catalog.mjs` | 新增 | +100/-0 |  |
| `dist/.setup/qq-latency-trace.mjs` | 新增 | +39/-0 |  |
| `dist/.setup/qq-memory-privacy-epoch.mjs` | 新增 | +112/-0 | QQ-CHANNEL-SOURCE-CUSTODY v1, QQ-MEMORY-PRIVACY-EPOCH v1 |
| `dist/.setup/qq-native-auto-compact.mjs` | 新增 | +65/-0 | CODEX-LATENCY456-PATCH v1 |
| `dist/.setup/qq-native-exec-lifecycle.mjs` | 新增 | +42/-0 | QQ-NATIVE-EXEC-LIFECYCLE-PATCH v1 |
| `dist/.setup/qq-native-latency-timing.mjs` | 新增 | +307/-0 | QQ-NATIVE-PREPARATION-SPANS v1 |
| `dist/.setup/qq-native-tls-preconnect.mjs` | 新增 | +186/-0 | QQ-NATIVE-TLS-PRECONNECT v1 |
| `dist/.setup/run-attempt-dYJhjZrp.mjs` | 修改 | +9046/-8657 | CODEX-LATENCY456-PATCH v1, QQ-CACHE-KEEPALIVE-CATALOG-GATE v2, QQ-CACHE-OWNED-PRODUCER v1, QQ-COMPACTION-NOHOOK-READ v1, QQ-GROUP-HEARTBEAT-CATALOG-PATCH v1, QQ-GROUP-UNIFIED-TOOLS-PATCH v1, QQ-MEDIA-SOURCE-REQUESTER v1, QQ-MEMORY-CATALOG-FRESHNESS v1 … |
| `dist/.setup/scoped-tool-result-archive.mjs` | 新增 | +268/-0 |  |
| `dist/.setup/shared-client-CJCTeFpQ.mjs` | 修改 | +2/-0 |  |
| `dist/.setup/thread-lifecycle-_bAbjedG.mjs` | 修改 | +2384/-2362 | CODEX-LATENCY456-PATCH v1, QQ-CACHE-OWNED-PRODUCER v1 |
| `dist/.setup/thread-requests-OWGOiDaV.mjs` | 修改 | +14/-2 | CODEX-LATENCY456-PATCH v1 |
| `dist/.setup/ws-lifecycle-diagnostics.mjs` | 新增 | +99/-0 | CODEX-LATENCY456-PATCH v1 |

### @mem0/openclaw-mem0 1.2.1（9 个文件）

| 文件 | 状态 | 新增/删除行 | 标记 |
|---|---|---|---|
| `dist/group-memory-read.mjs` | 新增 | +209/-0 | MEM0-SCOPED-VIEW-STAGES v1 |
| `dist/index.js` | 修改 | +400/-221 | MEM0-CAPABILITY-OWNER-PRIVATE-GATE v1, MEM0-RECALL-PATCH v1, MEM0-RECALL-PATCH v2, OPENCLAW-MEMORY-INCREMENTAL-QUEUE v2, PARALLEL-RECALL-PATCH v1, QQ-CLAUDE-LEGACY-RECALL-OVERLAP v3, QQ-MEM0-ADOPTED-PREFETCH-TIMELINE v1, QQ-MEM0-FOREGROUND-DEADLINE v1 … |
| `dist/memory-queue.mjs` | 新增 | +164/-0 | OPENCLAW-MEMORY-INCREMENTAL-QUEUE v2 |
| `dist/memory-runtime.mjs` | 新增 | +187/-0 | GROK-MEMORY-ADMISSION-GATE v1, OPENCLAW-MEMORY-RUNTIME v2 |
| `dist/memory-scope.mjs` | 新增 | +275/-0 | OPENCLAW-MEMORY-SCOPE v4 |
| `dist/oc-memory-receipt.mjs` | 新增 | +82/-0 | OPENCLAW-MEMORY-WRITE-RECEIPT v2 |
| `dist/text-api-bridge.mjs` | 新增 | +57/-0 |  |
| `dist/workspace-memory-classifier.mjs` | 新增 | +30/-0 | MEM0-WORKSPACE-PROVENANCE v1 |
| `openclaw.plugin.json` | 修改 | +1/-1 |  |

### mem0ai 3.0.7（2 个文件）

| 文件 | 状态 | 新增/删除行 | 标记 |
|---|---|---|---|
| `dist/oss/index.mjs` | 修改 | +504/-30 | MEM0-EMBED-CONNECTION-OBSERVATION v1, MEM0-HTTP-REQUEST-OBSERVATION v1, MEM0-PRIVATE-EMBEDDING-AGENT v1, MEM0-QUERY-ENTITY-BATCH-PATCH v1, MEM0-SCOPED-VIEW-STAGES v1, MEM0-SEARCH-STAGES v1, OPENCLAW-MEMORY-WRITE-RECEIPT v2 |
| `dist/oss/oc-memory-receipt.mjs` | 新增 | +82/-0 | OPENCLAW-MEMORY-WRITE-RECEIPT v2 |

### qqbot 2.0.4（3 个文件）

| 文件 | 状态 | 新增/删除行 | 标记 |
|---|---|---|---|
| `dist/index.cjs` | 修改 | +3240/-106 | HOSINO-C2C-SKIP-AUTO-AFTER-FINAL v1, HOSINO-OUTCOME v1, HOSINO-PRIVATE-COMPANION v1, HOSINO-STICKER-PATCH v1, HOSINO-VOICE-EXPLICIT v1, HOSINO-VOICE-NAMED v1, HOSINO-VOICE-PARAMS v1, QQ-ABSOLUTE-DEADLINE-PATCH v1 … |
| `dist/qq-delivery-receipts.cjs` | 新增 | +190/-0 | QQ-DURABLE-DELIVERY-RECEIPTS v1, QQ-INFLIGHT-WAIT v1 |
| `dist/qq-explicit-stop.cjs` | 新增 | +98/-0 |  |
