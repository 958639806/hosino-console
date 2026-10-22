# 让星野用上 Gemini（个人 Google AI Pro）调研报告

调研时间：2026-10-20（UTC+8）。这次只做了网络调研，没有安装任何东西，也没有碰任何服务器。star 数和最后提交时间是当天从 GitHub API 读取的，时间已换算成 UTC+8。查不到的一律写“未核实”。

## 一、已知情况的核实结果

1. **Gemini CLI 不再支持个人 Pro 登录：属实。** 从 2026-06-18 起，Gemini CLI 和 Code Assist IDE 扩展不再为 Google AI Pro、Ultra 和个人免费层提供服务，也去掉了“Login with Google”。官方建议改用 Antigravity。企业许可证和 API Key 登录不受影响。
   - 来源：https://developers.google.cn/gemini-code-assist/docs/deprecations/code-assist-individuals
   - 来源：https://github.com/google-gemini/gemini-cli/discussions/28017
   - 来源：https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
2. **Antigravity 条款禁止第三方工具借用它的登录态：属实。** 搜索结果显示，Antigravity 条款禁止用第三方软件访问服务，明确点名了 OpenClaw、OpenCode 和 Claude Code 借用 Antigravity OAuth，违者可被暂停或终止账号。2026 年 2–3 月已经有人因此被封。Google 当时重置了一批封禁并开放申诉，但再犯可能被永久封号。官方论坛上还有一帖，标题就是“因为 OpenClaw/OAuth 使用导致 Antigravity 账号被停用”。
   - 条款原文：https://antigravity.google/terms/（条款里的逐字措辞未核实，以上内容来自搜索摘要）
   - https://github.com/google-gemini/gemini-cli/discussions/20632
   - https://discuss.ai.google.dev/t/update-on-antigravity-tos-ban/131424/1
   - https://discuss.ai.google.dev/t/issue-with-antigravity-account-suspension-due-to-openclaw-oauth-usage/126426/2
   - “agy 只出文字、很慢”这一点未核实。
3. **API Key 加每月 10 美元 Cloud 额度：属实，但有门槛。**
   - Pro 每月送 10 美元 Google Cloud 额度，可以累积，每笔有效期 12 个月。
   - 要在 AI Studio 开通预付费（Prepay）并至少充值 5 美元，再到 me.developers.google.com/benefits 把额度绑到这个结算账号上。
   - 额度优先于预付余额扣费。但预付余额降到 0 以后，赠送额度也不再扣，相当于 API 会停。
   - Pro 订阅在 AI Studio 网页里的额度只能在网页界面用，API Key 调用另外计费。
   - 新开 Cloud 账号送的 300 美元欢迎额度不能用于 Gemini API。
   - 来源：https://aistudio.google.com/learn/use-google-ai-plan-credits-in-ai-studio
   - 来源：https://ai.google.dev/gemini-api/docs/billing
   - 来源：https://ai.google.dev/gemini-api/docs/google-ai-plans

## 二、计费要点（Gemini Developer API）

来源：https://ai.google.dev/gemini-api/docs/pricing ，另有第三方汇总作佐证。

- **文字**：大部分 Gemini Flash 系列有免费层，但有速率限制，而且免费层的数据会被用来改进产品。Pro 级的预览模型多数不在免费层（逐个型号未核实）。
- **生图**：Nano Banana 2（gemini-3.1-flash-image）、Nano Banana Pro（gemini-3-pro-image）和 Imagen 4 都没有免费层，必须开付费层。单张价格未核实。
- **视频**：Veo 3.1 只能付费，每秒 0.05–0.60 美元。Lite 720p 每秒 0.05 美元，一段 8 秒约 0.40 美元。
  - ⚠️ Veo 3.1 Preview 将在 **2026-10-22** 下线，官方建议改用 Gemini Omni Flash（gemini-omni-1.1-flash），约每秒 0.10 美元，只能付费。
- **语音 TTS**：2.5 Flash Preview TTS 有免费层，付费层每 100 万个音频输出 token 10 美元。2.5 Pro TTS 只能付费。Live API 的价格未核实。
- **能用多少**：10 美元额度大约够生成 100 段 8 秒的 Veo Lite 视频。生图的数量取决于单张价格，未核实。

## 三、A 类：合规方案

### A1. OpenClaw 自带的 google 插件 ★首选
- 链接：https://docs.openclaw.ai/providers/google 、https://github.com/openclaw/openclaw/blob/main/docs/providers/google.md
- 活跃度：随 OpenClaw 主仓库一起发布，单独数据不适用。
- 原理：插件 `@openclaw/google-plugin` 已内置在 OpenClaw 里，用 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` 直接调用 Gemini API。另有 `google-vertex`，走 Google Cloud ADC 凭据。
- 能力：
  - 插件注册了这些能力：文字模型、生图（imageGenerationProviders）、视频（videoGenerationProviders）、语音（speechProviders、realtimeVoiceProviders）、识图、听音频、看视频，以及 Google 搜索。
  - 生图默认用 `google/gemini-3.1-flash-image`，也支持 gemini-3-pro-image。每次最多出 4 张，修改图片时最多可传 5 张参考图。
  - 视频插件支持哪些具体模型、是否已经跟进 Omni Flash，未核实。
- 合规：合规，用的是官方 API Key。
- 封号风险：很低。最大的风险是费用，建议在 Cloud 里设预算提醒。
- 对接难度：低。配置 Key，再在 `agents.defaults.mediaModels.image.primary` 这类配置里选模型。但这要改 openclaw.json 或环境变量，**要停机，需凛确认**。
- 注意：插件里还有一个 `google-gemini-cli` 运行时，它走本机的 Gemini CLI。个人 Pro 登录已经失效，这条路走不通，除非改用 API Key。

### A2. Vertex AI（google-vertex）
- 原理：在 GCP 项目里用服务账号或 ADC 调用 Vertex 上的 Gemini、Imagen 和 Veo。
- 合规：合规。
- 风险：Pro 送的 10 美元额度能不能用在 Vertex 上，官方页面只写了能用于“Cloud services, including the Gemini API”，Vertex 是否在范围内**未核实**。Vertex 是后付费，必须设预算。
- 对接难度：中，要配置服务账号凭据。

### A3. LiteLLM
- 链接：https://github.com/BerriAI/litellm
- 活跃度：约 6.16 万 star，最后提交 2026-10-20。
- 原理：一个 OpenAI 兼容的网关，后面接 Gemini 的 Key 或 Vertex。
- 能力：文字已支持。生图、TTS、视频分别支持到什么程度，未逐项核实。
- 合规：合规。
- 封号风险：低。
- 对接难度：中。OpenClaw 已经内置 `litellm` provider。不过既然已有 A1，多加一层的意义只在于统一计费、限流和记录日志。

### A4. new-api 和 one-api
- new-api：https://github.com/QuantumNous/new-api ，约 5.03 万 star，最后提交 2026-10-20，AGPL-3.0。
- one-api：https://github.com/songquanpeng/one-api ，约 3.72 万 star，最后提交 2026-01-09，MIT。
- 原理：多渠道 OpenAI 兼容网关，可以把 Gemini 官方 Key 接进来。
- 能力：文字已支持。生图和视频的支持情况未核实。
- 合规：接官方 Key 就合规。但这类面板也常被用来接 B 类反代，部署时要注意。
- 对接难度：中。和 A3 一样，只是多加一层。one-api 已经很久没更新，更推荐 new-api。

## 四、B 类：高风险方案（会连累凛的 Pro 主账号，不建议使用）

共同问题：这些方案用的都是凛本人 Google 账号的 cookie 或 OAuth token。一旦被判定违规，处罚落在整个 Google 账号或订阅上，而不是某个 API Key 上。最坏情况会影响 Gmail、Drive 等同一账号下的服务。账号层面的处罚幅度未核实，但 Antigravity 已经确认有暂停和永久封禁的先例。另外，星野在 QQ 群里的流量是自动的、多人共用的，特征很明显，比个人偶尔用风险更高。

| 方案 | 链接 | 活跃度 | 原理 | 能力 | 违反的条款 | 封号风险 |
|---|---|---|---|---|---|---|
| Gemini-API（HanaokaYuzu，即 gemini-webapi） | https://github.com/HanaokaYuzu/Gemini-API | 约 3617 star，最后提交 2026-10-09，AGPL-3.0 | 用 Gemini 网页版的 cookie（`__Secure-1PSID` 等）模拟网页请求 | 文字、网页生图（能力范围未逐项核实） | Google 服务条款禁止用自动化手段访问服务（逐字原文未核实），网页订阅本来就不是给程序调用的 | 高 |
| Gemini-API（dsdanielpark，旧 cookie 版） | https://github.com/dsdanielpark/Gemini-API | 未核实（GitHub API 限流） | 同上，用 cookie | 未核实 | 同上 | 高 |
| CLIProxyAPI | https://github.com/router-for-me/CLIProxyAPI | 约 5.58 万 star，最后提交 2026-10-20，MIT | 把 Gemini CLI、Antigravity 等的 OAuth 登录态包装成 OpenAI 兼容接口 | 文字为主，其他未核实 | Gemini CLI 个人通道已经关闭；走 Antigravity 违反其条款 | 高 |
| gcli2api | https://github.com/su-kaka/gcli2api | 约 5263 star，最后提交 2026-10-16，许可证未声明 | 用 Gemini CLI 或 Antigravity 的 OAuth 做反代 | 文字，其他未核实 | 同上 | 高 |
| geminicli2api | https://github.com/gzzhongqi/geminicli2api | 约 590 star，最后提交 2025-12-18，MIT | 用 Gemini CLI 的 OAuth 做反代 | 文字 | Gemini CLI 个人登录 6 月 18 日以后基本已经失效 | 高，而且多半已经不能用 |
| antigravity2api-nodejs | https://github.com/liuw1535/antigravity2api-nodejs | 未核实 | 用 Antigravity 的 OAuth、多账号轮换，包装成 OpenAI 格式 | 文字、识图、生图（gemini-3-pro-image） | Antigravity 条款明令禁止第三方工具 | 很高（README 里写着“多账号轮换、随机 ProjectId”，是明显的规避特征） |
| Antigravity2api（link0518，前一个的分支） | https://github.com/link0518/Antigravity2api | 未核实 | 同上，另加管理后台 | 同上 | 同上 | 很高 |
| antigravity-proxy、antigravity-oauth-proxy 等 | https://github.com/usamashehab/antigravity-proxy 、https://github.com/dvcrn/antigravity-oauth-proxy | 未核实 | 读取 agy 的 OAuth token 去调用内部的 Cloud Code 接口 | 文字，可以原样转发生图请求 | 同上 | 很高 |
| AIClient-2-API | https://github.com/justlovemaki/AIClient-2-API（仓库已迁移，新地址未核实） | 未核实 | 把多家客户端的 OAuth 包装成 API | 未核实 | 同上 | 高 |

和 OpenClaw 对接的难度：技术上都很低，配一个 OpenAI 兼容的 baseUrl 就行。**但不建议对接。** 视频和语音这几个项目基本都不支持，B 类就算接上也拿不到 Veo 和 TTS。

## 五、推荐结论

1. **走 A1**：OpenClaw 自带的 google 插件，加一个 AI Studio 的 API Key。Key 所在的结算账号先预充 5 美元，再绑定 Pro 每月送的 10 美元额度。文字、生图、TTS 和视频都能用正规方式拿到。这是唯一同时满足四种能力和合规要求的方案。
2. 控制开销的办法：
   - 日常聊天继续用现有模型，或者用 Flash 的免费层，但免费层的数据会被用来训练。
   - 生图、视频只在用户明确要求时才调用，并在 Cloud Billing 里设预算提醒。
   - 预付余额保持在 0 以上，否则赠送额度也会停用。
   - 视频不要再接 Veo 3.1 Preview（10-22 下线），改用 Gemini Omni Flash 或 Veo 正式版。
3. LiteLLM 或 new-api 只在需要统一计费、限流或审计时再加，不是必须的。
4. **B 类一律不用。** 它们赌的是凛的 Pro 主账号；Antigravity 已经有封号先例，也明确点名了 OpenClaw；而且这些方案拿不到视频和语音，收益很小。
5. 落地时要改 openclaw.json 或环境变量，并重载插件，**要停机，需凛确认**。部署还要凛在后端那边亲口批准。

## 六、未核实清单
- agy 是否只能出文字、是否很慢
- Antigravity 条款的逐字原文
- Google 服务条款里“自动化访问”的逐字原文
- B 类账号层面的处罚范围
- Pro 送的 10 美元额度能否用于 Vertex
- 生图单张价格
- Live API 价格
- OpenClaw google 插件支持的具体视频模型
- LiteLLM、new-api 对生图、视频、TTS 的支持程度
- dsdanielpark、antigravity 系列和 AIClient-2-API 的 star 数与最后提交时间
