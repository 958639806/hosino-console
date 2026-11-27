# 当天用量只读查询（2026-11-27）

## 做了什么

- 新增 workspace 只读脚本 `scripts/today_usage.mjs`：复用生产控制台的 `loadUsageEstimate`，汇总当天（Asia/Singapore）全部保留会话用量和 `/var/lib/hosino-usage` 记忆抽取账本，口径与控制台网页相同（API 等价估价，不是真实账单，不含订阅月费）。费用以人民币为主并附美元；汇率现拉欧洲央行参照价（Frankfurter），失败则回退到 ExchangeRate-API 公开接口，再失败则只报美元并说明换不了人民币。
- 在 `AGENTS.md` 与群规则中写明：有人问今天/当天消耗时先跑该脚本；禁止把 `session_status` 或 `/status` 当成当天合计；不要登录控制台，也不要在群里贴完整 `/status`。
- 将 `node scripts/today_usage.mjs`（仅无参数或 `--help`/`-h`）加入 `qq-group-owner-guard` 的 `commandAllowed` 白名单，使已授权群里的非主人也可以查询实例当天合计。`node` 不是通用解释器，其它脚本仍不能用 node 跑；未放宽写、删或其它 exec。

## 影响

- 星野可在主人或群成员询问时给出当天实例 token 合计与人民币估价。金额是公开单价重算的估价，不是实付账单。
- 采集上线前没有 token 的记忆抽取仍然无法补计。
- 用户级 OpenClaw 网关需停一次再启动才能加载插件白名单。系统级同名网关、韩国备机、xray、控制台网页均未改。

## 回滚

1. 确认当时没有正在回复后，停用户级网关：`sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user stop openclaw-gateway.service`。
2. 用备份目录中的 `execution-policy.mjs` 覆盖 `/home/ubuntu/.openclaw/plugins/qq-group-owner-guard/execution-policy.mjs`；用备份还原 `workspace/AGENTS.md` 与 `workspace/group-rules/qqbot-shared.md`；可删除 `workspace/scripts/today_usage.mjs`。
3. 启动用户级网关，等到 `[gateway] ready` 和 `[qqbot] gateway READY`。
