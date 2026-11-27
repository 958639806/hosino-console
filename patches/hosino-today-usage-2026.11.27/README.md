# 当天用量只读查询（2026.11.27）

这是 OpenClaw 用量查询补丁，不是完整控制台发行版。完整控制台仍以 `v2026.11.18.1` 为准。本补丁只增加只读的当天实例合计查询与对应群聊白名单，不含私人人设或私聊陪伴逻辑。

变更说明、影响和回滚见 `CHANGELOG.md`。GitHub Release：`patches-2026.11.27-today-usage`。

查询命令（在 workspace 下）：

```
node scripts/today_usage.mjs
```
