# 记忆抽取用量采集（2026.11.26）

配套补丁，不是完整控制台发行版。完整控制台仍以 `v2026.11.18.1` 为准。

对外发布的插件 diff 只含用量采集挂钩，不含私人人设或私聊陪伴逻辑。账本默认写在 `/var/lib/hosino-usage`（可用 `HOSINO_USAGE_LEDGER_DIR` 覆盖），不写在网关监视的 `~/.openclaw` 下。

变更说明、影响和回滚见 `docs/CHANGELOG.md`。GitHub Release：`patches-2026.11.26`。
