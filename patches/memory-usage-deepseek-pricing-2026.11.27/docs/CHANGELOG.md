# 记忆抽取 DeepSeek 计价识别（2026-11-27）

## 做了什么

- 修复控制台用量识别：账本或会话里 `provider` 为 `unknown` / `openai`（或缺失），但模型 ID 已是公开价目中的 `deepseek-flash` / `deepseek-v4-pro` 时，识别为 DeepSeek，并按 2026-11-14 公开峰谷价做 USD API 等价估价。不套近型号。未改采集插件、embeddings 或网关。
- 缺 token 的记录仍记为缺失，不算零。未对接 DeepSeek 官方账单 API。

## 影响

- 已采集的记忆抽取记录（以及之后新产生、同样只写出 `provider: unknown` 且模型为官方 ID 的记录）会显示为 DeepSeek 并计入费用，不再因服务商标成 `unknown` 而被标为未计价、费用为 0。
- 会话来源的原有计价不变。金额仍是 API 等价估价，不是实付账单，不含订阅费。
- 只需重启控制台即可生效，不必停网关。

## 回滚

将控制台备份中的 `usage-pricing.mjs`、`usage-memory-ledger.mjs` 和 `docs/USAGE-DETAIL-CONTRACT.md` 还原到控制台目录，然后只重启 `hosino-console.service`。不必停用户级网关。
