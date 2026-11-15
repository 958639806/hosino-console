# Hosino Console

OpenClaw QQ bot 的 Web 控制台：Node.js 后端、同源鉴权 API 与移动端静态界面。

当前正式版本：**v2026.11.15.1**。本仓库及正式附件包含完整控制台代码，不只是 public 补丁。

- [独立安装、环境变量及升级说明](INSTALL.md)
- [API 等价估价定义、官方来源及缓存规则](docs/API-EQUIVALENT-ESTIMATE.md)
- [费用详情数据契约](docs/USAGE-DETAIL-CONTRACT.md)
- [版本变更](CHANGELOG.md)
- [OpenClaw 配套补丁](patches/openclaw/README.md)（保留原有内容，不会由 npm 安装或启动自动应用）

历史研究、旧 mock、截图与 staging 保留在仓库记录中，不属于安装运行内容；正式安装附件不包含这些目录。

## 本次更新

- 全部 agent 已记录 token 逐调用重算 API 等价估价，覆盖订阅/OAuth 的零价记录；不是实际账单、不含订阅费。
- 输入、输出、缓存读写分别计价；缓存 TTL 证据不足时显示区间，Fast 单独标识为变体参考价。
- 消耗详情二级页使用真实统计接口，支持模型/服务商/日期维度和真实刷新状态。
- 模型管理按服务商默认折叠，保留摘要状态、数量、键盘操作与重绘展开状态。
- 补齐 ASR、模型认证、密钥存储加载逻辑、用量等全部运行模块及 npm 锁文件；不附任何凭据、证书或私有运行数据。

## License

Original Hosino Console code and documentation contributed by the project authors
are licensed under the [MIT License](LICENSE).

Third-party dependencies, upstream source snapshots, and third-party portions of
patched files retain their respective upstream licenses and copyrights. This
project does not relicense those materials. In particular, historical snapshots
under `staging/voice/` include Tencent QQBot plugin code, and snapshots under
`staging/toolcat/` include OpenClaw runtime code. Refer to their upstream projects
and the existing maintenance notes for provenance; the root MIT license does not
replace any required third-party permissions or notices.
