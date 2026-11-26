# 记忆抽取用量采集 patches-2026.11.26

这是控制台配套补丁，不是完整控制台发行版。完整控制台仍以 `v2026.11.18.1` 为准。对外发布的插件 diff 只含用量采集挂钩，使用占位符路径，不含私人人设或私聊陪伴逻辑。

## 做了什么

- 在 Mem0 有界抽取（`memory-runtime` extract）和入库 LLM（mem0ai `addToVectorStore`）两条成功 API 路径写入独立用量账本：usage、模型、时间、用途（`bounded-extract` / `add-extract`）。API 成功即使后续 no-facts 或校验失败也会记；缺少 usage 记为缺失，不算零。未改 embeddings、抽取规则、召回、写入过滤或命名空间。
- 账本目录默认为 `/var/lib/hosino-usage`（可用 `HOSINO_USAGE_LEDGER_DIR` 覆盖），不写在网关监视的 `~/.openclaw` 下；目录权限 0700，文件 0600，记录不含密钥和记忆正文。
- 控制台 `GET /api/usage/cost` 与消耗详情接入该账本，按已有公开价做 USD API 等价估价；`deepseek-flash` / `deepseek-v4-pro` 沿用 2026-11-14 价目，不套近型号。明细增加「来源」（会话 / 记忆抽取）。页头写明合计含上线后采集的抽取，上线前无 token 的抽取无法补计、未计入。未对接 DeepSeek 官方账单 API。

## 影响

- 仅统计采集上线以后的记忆抽取。上线前的抽取无法从现有 receipt 反推，不会出现在合计里。
- 用户级 OpenClaw 网关需停一次再启动才能加载插件补丁。系统级同名网关与旁路代理不在本补丁范围内。
- 控制台需重启一次以加载新统计逻辑。已记录的会话用量算法不变，只是多合并账本记录。

## 回滚

1. 在确认用户级网关没有正在回复后，停止该网关。
2. 用上线前备份的 `memory-runtime.mjs` 和 mem0ai `dist/oss/index.mjs` 覆盖已改的两份插件文件。
3. 启动用户级网关，等到 `[gateway] ready` 和 `[qqbot] gateway READY`。
4. 将控制台相关文件与 systemd drop-in `90-usage-ledger.conf` 恢复后，`systemctl daemon-reload` 并重启控制台服务。
5. 账本目录与 writer 库可保留或删除，不影响回滚后的抽取与会话。

资产校验见 `SHA256SUMS`。源码与补丁也在仓库目录 `patches/memory-usage-ledger-2026.11.26/`。
