# 记忆抽取用量采集（2026-11-26）

## 做了什么

- 在 Mem0 有界抽取（`memory-runtime` extract）和入库 LLM（mem0ai `addToVectorStore`）两条成功 API 路径写入独立用量账本：usage、模型、时间、用途（`bounded-extract` / `add-extract`）。API 成功即使后续 no-facts 或校验失败也会记；缺少 usage 记为缺失，不算零。未改 embeddings、抽取规则、召回、写入过滤或命名空间。
- 账本目录为 `/var/lib/hosino-usage`（默认，可用 `HOSINO_USAGE_LEDGER_DIR` 覆盖），不写在网关监视的 `~/.openclaw` 下；目录权限 0700，文件 0600，记录不含密钥和记忆正文。
- 星野控制台 `GET /api/usage/cost` 与消耗详情接入该账本，按已有公开价做 USD API 等价估价；`deepseek-flash` / `deepseek-v4-pro` 沿用 2026-11-14 价目，不套近型号。明细增加「来源」（会话 / 记忆抽取）。页头写明合计含上线后采集的抽取，上线前无 token 的抽取无法补计、未计入。未对接 DeepSeek 官方账单 API。

## 影响

- 仅统计采集上线以后的记忆抽取。上线前的 DeepSeek 抽取无法从现有 receipt 反推，不会出现在合计里。
- 用户级 OpenClaw 网关需停一次再启动才能加载插件补丁。系统级同名网关、韩国备机、xray 未改。
- 控制台重启一次以加载新统计逻辑。已记录的会话用量算法不变，只是多合并账本记录。

## 回滚

1. 停用户级网关：`sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user stop openclaw-gateway.service`（确认当时没有正在回复）。
2. 用备份目录里的 `memory-runtime.mjs` 和 `mem0ai` `dist/oss/index.mjs` 覆盖上线时改过的两份插件文件。
3. 启动用户级网关，等到 `[gateway] ready` 和 `[qqbot] gateway READY`。
4. 将控制台备份中的 `server.mjs`、`usage-*.mjs`、`append-usage.mjs`、`usage-memory-ledger.mjs`、`public/usage-detail.js`、`public/app.js`、`public/index.html` 和 drop-in `90-usage-ledger.conf` 恢复；`systemctl daemon-reload` 后重启 `hosino-console.service`。
5. `/var/lib/hosino-usage` 与 `/usr/local/lib/hosino-usage` 可保留或删除，不影响回滚后的抽取与会话。
