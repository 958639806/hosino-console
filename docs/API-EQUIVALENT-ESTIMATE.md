# API 等价估价

静态官方价目核验日期：**2026-11-14 SGT**。发布版本 v2026.11.15.1。运行时不自动拉取价格。

## 统计定义

这是按当前公开价格重算已记录 token 的用量指标，**不是实际账单，不含订阅费**。
不沿用历史 `usage.cost`，不因 OAuth、订阅、原价为零或非零而跳过。
独立工具、联网检索、音视频、税费等不在 token 估价内；不证明代理上游实际运行的模型。

- `/api/usage/cost` 从本地 OpenClaw transcript 源读取，不发模型或网关请求。
- 遍历全部 agent 的 SQLite 热存储、现存 JSONL、reset/deleted 文件及可读冷归档。
- 文件镜像和同会话同事件身份去重；不因文件修改时间筛选。
- 按事件时间计算新加坡自然日，默认今天及前 29 天；显式 startDate/endDate 均含当日。
- 已物理清除的数据、无可读归档的数据和无法关联的原生 CLI 辅助步骤不可恢复。
- 返回缺 usage、无效/不完整 token 分量、未知型号、无时间及读取失败的计数。
- 已记录 token 计价覆盖率不等于上游全部用量覆盖率；变体参考价和自定义价单独标识。

## 公开价目及精确映射

单位均为 USD / 1M tokens；顺序为输入 / 输出 / 缓存读 / 缓存写。
以下 URL 是原始来源；这是本次核验的静态价表，不是运行时自动拉价。

| 记录中的 provider / 精确 model | 输入 / 输出 / 缓存读 / 缓存写 | 条件 |
| --- | --- | --- |
| openai、openai-api、openai-codex、codex / gpt-6-luna | .10 / .50 / .01 / .125（30m）或 .25（12h） | 整个请求 prompt >272K 时输入、读写 2 倍，输出 1.5 倍 |
| anthropic、claude-cli / claude-haiku-5-5 | .10 / .50 / .01 / .125（5m）或 .20（1h） | prompt >100K 时分别 .50 / 2.50 / .05 / .625 或 1.00 |
| anthropic、claude-cli / claude-sonnet-5-5 | 2 / 10 / .10 / 2.50（5m）或 4（1h） | — |
| xai / grok-4.7 | 2 / 6 / .50 / 未证实 | prompt ≥200K 时 4 / 12 / 1 |
| xai / grok-4.7-build-fast | **变体参考价** 4 / 12 / 1 / 未证实 | prompt >200K 时 6 / 18 / 1.5；不是已证实公共 API 同 ID |
| xiaomi-token-plan、xiaomi、mimo / mimo-v2.6-pro | .435 / .87 / .0036 / 未证实 | 缓存写入为 0 时其余分量可计价，非 0 则提示缺写价 |
| deepseek / deepseek-v4-pro | .66–1.32 / 1.98–3.96 / .022–.044 / 未证实 | 峰谷区间，不猜未核实的日历规则 |
| deepseek / deepseek-flash | .15–.30 / .60–1.20 / .003–.006 / 未证实 | 同上 |

来源：

- OpenAI 型号：https://developers.openai.com/api/docs/models/gpt-6-luna
- OpenAI 价格：https://developers.openai.com/api/docs/pricing
- OpenAI 缓存规则：https://developers.openai.com/api/docs/guides/prompt-caching
- Anthropic 价格：https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic 型号：https://platform.claude.com/docs/en/about-claude/models/overview
- xAI：https://docs.x.ai/developers/pricing
- MiMo：https://mimo.mi.com/models/zh-CN/mimo-v2.6-pro
- DeepSeek：https://api-docs.deepseek.com/quick_start/pricing

**Fast 证据边界：**官方有 Grok Build/Cursor 的 Grok 4.7 Fast 变体价，但未找到
`grok-4.7-build-fast` 的公共 API 精确 ID 对应证明。本修订不把它静默映射成普通 Grok，
也不再按旧配置的全零价忽略它；用单独标识的官方变体参考价计算。
此项不得称为“精确公共 API 型号身份已确认”；参考估价与同型号官方价覆盖分别显示。
其他未识别 ID 不模糊匹配；模型确实未知时保留证据和明确的自定义价入口。

## Token 和缓存规则

- OpenClaw `input/output/cacheRead/cacheWrite` 是互斥分量，直接使用，不二次减缓存。
- Codex `input_tokens` 包含 `cached_input_tokens`；Chat/Responses 的 input/prompt
  含 details 中缓存命中及写入；分别减一次，reasoning 已含输出不另加。
- Anthropic 的 input、cache_read_input_tokens、cache_creation_input_tokens 是分量，不相减。
- 不把 cached/read/write 或总 token 再累加到互斥四桶之上。
- 有明确 TTL 子桶时使用其真实数量；不完整/互相矛盾的子桶作为数据异常。
- Claude 丢失 TTL 时对这些写入全量计价，返回 5m–1h 上下界；OpenAI 对应 30m–12h。
  不用没有一对一关联证据的原生日志给会话强贴 TTL，也不把未知 TTL 当零元。
- DeepSeek 未核实峰谷日历返回上下界。UI 显示区间；明细和柱图采用区间下界。
- 未证实缓存写价的型号，只要实际写入为 0 不妨碍其他分量计价；有写入则明确报告缺价。

## 自定义价格与刷新

`HOSINO_USAGE_PRICE_FILE` 指向自己的 JSON 文件。示例中的 provider/model 和价格全部为合成演示值，不是官方报价，也不是运行数据。请求缓存为 120 秒；强制刷新读取真实源，失败保留并明确标识旧快照。

自定义 JSON 示例（示例价，不是推荐官方价）：

```json
{
  "my-provider/exact-model-id": {
    "input": 1,
    "output": 2,
    "cacheRead": 0.1,
    "cacheWrite": 1.25,
    "cacheWrite1h": 2
  }
}
```

四个基础字段必填，有限非负数；可选 `cacheWrite1h` 或 `cacheWrite12h`。
未填长 TTL 单价时沿用自定义 cacheWrite；自定义价格始终标记非官方。
