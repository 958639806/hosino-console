# AstrBot 调研：可借鉴给星野的功能（只读）

调研时间：2026-10-20 20:40（UTC+8）。没有安装任何东西，也没有连接服务器。
资料来源：
- 本地已有的 AstrBot 源码 `/workspace/astrbot-research/AstrBot`，这份源码是 `astrbot-humanization.md` 那次浅克隆下来的。
- 官方插件索引 `AstrBotDevs/AstrBot_Plugins_Collection/plugins.json`。
- GitHub 搜索 API。star 数、最后推送日期和许可证都取自 API 当天的返回值。最后推送日期按 `pushed_at` 的 UTC 日期记，不一定等于最后一次提交的日期。

已经读过的旧报告：`astrbot-humanization.md`、`feature-probe-2.md`。它们写过的内容，这里只标“见旧报告”，不再当新点子。旧报告写过的有：分段加打字延迟（凛已否决）、Heartflow 精力值、proactive_chat 冷场破冰、按情绪选 MiMo 语气、表情自动收集、生活日程、持续情绪、群友档案。

## 先说一个关键限制（未核实，开工前要先确认）
星野接的是 qqbot 通道。会话里出现的是 openid，配对也不支持，所以看起来像 **QQ 官方 Bot API**，而不是 OneBot/aiocqhttp。AstrBot 很多好玩的插件写着“仅 aiocqhttp”，比如戳一戳、贴表情、群管、QQ 空间、头像卡片，在官方 API 上通常拿不到这些事件或接口。另外，官方 API 对主动消息有配额。所以下面凡是依赖戳一戳、贴表情或主动推送的条目，都标了“依赖平台能力，未核实”。

---

## 一、AstrBot 本体
- 仓库：https://github.com/AstrBotDevs/AstrBot ，★42395，最后推送 2026-10-20，**AGPL-3.0**，只借鉴思路。
- 架构：Python 异步程序。
  - 平台适配器把消息统一成 `AstrMessageEvent`，再交给一条**流水线**按顺序处理：`waking_check`（唤醒）→ `whitelist_check` → `session_status_check` → `rate_limit_check` → `content_safety_check` → `preprocess` → `process`（LLM Agent 或插件指令）→ `result_decorate`（分段、TTS、转图）→ `respond`。
  - 插件叫 Star，通过装饰器注册指令、事件钩子和 LLM 工具。
  - WebUI 用 Vue 写，页面有：配置、人格、平台、模型提供商、会话管理、对话记录、插件市场、知识库、定时任务、子代理、Trace、统计、控制台日志。
- 星野和 OpenClaw 没有、值得看的能力：

| 能力 | AstrBot 做法（源码位置） | 星野现状 / 能否借鉴 |
|---|---|---|
| 会话隔离和按会话配置 | `umop_config_router.py`：把“平台:消息类型:会话”映射到不同的配置文件，不同群可以用不同的人格、模型和插件开关。`unique_session` 让群内每个人有独立上下文 | 星野所有群共用一套 AGENTS.md，只有表情和语音参数能按会话设。可以借鉴成“每群一份覆盖规则”，见 A1 |
| 人格切换 | Persona 包括 system_prompt、begin_dialogs、工具白名单、custom_error_message，可以用 `/persona` 切换 | 见 A1。`custom_error_message`（人设化的报错回复）见 A6 |
| 知识库 | `core/knowledge_base`：能解析 PDF、EPUB、Markdown 等格式；稠密检索和稀疏检索用 RRF（`rank_fusion.py`）融合；按会话挂载 | 星野只有 mem0 记忆，没有“设定集或资料库”。见 A2 |
| 函数工具和 MCP | 有 Agent 工具执行器、MCP 和子代理编排（SubAgentPage） | OpenClaw 已经有工具和 MCP，**不算新点子** |
| 群聊上下文感知 | `group_icl_enable`：把群消息流水注入上下文 | followup-gate 已经覆盖，见旧报告 |
| 唤醒词 | `wake_prefix`；可以要求私聊也必须加唤醒词；Zhalslar/astrbot_plugin_wakepro 支持提及唤醒、唤醒延长、唤醒冷却和“闭嘴”机制 | “闭嘴”和“唤醒延长”有意思，见 B8 |
| 戳一戳 | 本体只解析事件，插件 pokepro 负责回应 | 依赖平台能力，未核实，见 B9 |
| 内容安全 | `content_safety`：内置关键词库，可选百度内容审核；插件 antipromptinjector 和 aPromptGuardian 防提示词注入 | 星野没有防“被调教成别人”的检测，见 A4 |
| 速率限制 | `rate_limit`：每个会话每 60 秒最多 30 次，超出后可选排队（stall）或丢弃（discard） | 星野没有按人的频率闸，群友刷屏会直接耗额度。见 A3 |
| WebUI 统计和 Trace | 统计页（消息量、模型调用）；Trace 页按次显示 Agent 执行过程 | 控制台已经有工具调用链和互动统计，**基本重复**。按模型拆分费用凛已否决（属于用量热力图一类），不再提 |
| 长期记忆 | 本体只有对话历史，长期记忆靠 livingmemory（★361，AGPL）、mnemosyne（★254，AGPL）这类插件 | 星野的 mem0 已经更完整。livingmemory 的“记忆衰减和生命周期”可以参考，见 A7 |
| 定时任务 | `core/cron/manager.py`：`add_basic_job`（定时执行）和 `add_active_job`（定时让 LLM 主动做事），WebUI 有 CronJobPage | 见 A5 |
| 多模态 | 看图转述、语音转文字、TTS、生图插件 | 星野都已经有，**不算新点子** |
| 消息防抖 | 插件 advent259141/astrbot_plugin_debounce（★67，AGPL）：群友分几条连发时，先等对方说完，合并后再交给 LLM | 星野会逐条接话，见 B1 |

## 二、插件市场精选
官方索引里大约有 1000 个以上插件（`plugins.json` 有 490 KB）。下表的 star 数和日期都来自 GitHub API。

| 插件 | ★ | 最后推送 | 许可证 | 做了什么 |
|---|---|---|---|---|
| [SXP-Simon/astrbot_plugin_qq_group_daily_analysis](https://github.com/SXP-Simon/astrbot_plugin_qq_group_daily_analysis) | 522 | 2026-10-19 | MIT | 群日报海报。星野已有群报，**不重复做**，可以对照它的版式 |
| [NickCharlie/astrbot_plugin_self_learning](https://github.com/NickCharlie/astrbot_plugin_self_learning) | 418 | 2026-10-20 | AGPL | 学习对话风格、黑话和社交关系。和黑话词典重叠 |
| [Zhalslar/astrbot_plugin_music](https://github.com/Zhalslar/astrbot_plugin_music) | 223 | 2026-10-19 | MIT | 点歌，多平台搜歌后发卡片或语音 |
| [Zhalslar/astrbot_plugin_parser](https://github.com/Zhalslar/astrbot_plugin_parser) | 221 | 2026-10-20 | MIT | 解析 B 站、抖音等平台的视频、图集和音频链接 |
| [Maoer233/astrbot_plugin_steam_status_monitor](https://github.com/Maoer233/astrbot_plugin_steam_status_monitor) | 219 | 2026-10-19 | MIT | 群友开始玩或停止玩某个 Steam 游戏时推送到群里 |
| [bvzrays/astrbot_plugin_chuanhuatong](https://github.com/bvzrays/astrbot_plugin_chuanhuatong) | 149 | 2026-06-27 | AGPL | 把回复渲染成 GalGame 风格的立绘对话框图片，按情绪换立绘 |
| [Zhalslar/astrbot_plugin_pokepro](https://github.com/Zhalslar/astrbot_plugin_pokepro) | 106 | 2026-07-09 | GPL-3.0 | 戳一戳回应：反戳、文字、表情、meme |
| [Zhalslar/astrbot_plugin_portrayal](https://github.com/Zhalslar/astrbot_plugin_portrayal) | 100 | 2026-08-07 | MIT | 用 LLM 根据群友聊天记录写性格画像 |
| [oyxning/astrbot_plugin_antipromptinjector](https://github.com/oyxning/astrbot_plugin_antipromptinjector) | 81 | 2026-10-04 | AGPL | 检测提示词注入，防止被“调教成猫娘” |
| [advent259141/astrbot_plugin_debounce](https://github.com/advent259141/astrbot_plugin_debounce) | 67 | 2026-09-10 | AGPL | 消息防抖，判断对方说完了再合并回复 |
| [Zhalslar/astrbot_plugin_wakepro](https://github.com/Zhalslar/astrbot_plugin_wakepro) | 66 | 2026-10-18 | GPL-3.0 | 唤醒增强：唤醒延长、唤醒冷却、闭嘴、无聊唤醒 |
| [Zhalslar/astrbot_plugin_worldbook](https://github.com/Zhalslar/astrbot_plugin_worldbook) | 62 | 2026-10-19 | GPL-3.0 | 世界书：按正则命中后再注入设定。思路和黑话词典的 gate 一致 |
| [MegSopern/astrbot_plugin_rollpig](https://github.com/MegSopern/astrbot_plugin_rollpig) | 53 | 2026-07-25 | MIT | “今日小猪”：每天抽一只并配图，附名称和性格 |
| [NullumNomen/astrbot_plugin_fishing](https://github.com/NullumNomen/astrbot_plugin_fishing) | 50 | 2025-12-23 | AGPL | 电子钓鱼小游戏，带金币、鱼塘、图鉴等经济系统 |
| [Zhalslar/astrbot_plugin_emoji_like](https://github.com/Zhalslar/astrbot_plugin_emoji_like) | 39 | 2026-05-26 | MIT | 让 LLM 判断情感，给消息贴 QQ 表情 |
| [Zhalslar/astrbot_plugin_reread](https://github.com/Zhalslar/astrbot_plugin_reread) | 38 | 2026-09-20 | MIT | 复读姬：可设复读阈值、复读或打断的概率、冷却和违禁词 |
| [Heximiao/astrbot-plugin-wifepicker](https://github.com/Heximiao/astrbot-plugin-wifepicker) | 36 | 2026-10-06 | AGPL | 抽群友当今日老婆，只从发过言的人里抽 |
| [GEMILUXVII/astrbot_plugin_cloudrank](https://github.com/GEMILUXVII/astrbot_plugin_cloudrank) | 30 | 2025-12-30 | AGPL | 群聊词云和发言排名 |
| [Ni-ShuWu/astrbot_plugin_jrrp_plus](https://github.com/Ni-ShuWu/astrbot_plugin_jrrp_plus) | 1 | 2026-05-19 | AGPL | 今日人品，加上 78 张塔罗牌占卜 |
| [XziXmn/astrbot_plugin_tarot](https://github.com/XziXmn/astrbot_plugin_tarot) | 6 | 2026-06-29 | MIT | 塔罗占卜 |
| [RichardLiuda/astrbot_plugin_oyasumi](https://github.com/RichardLiuda/astrbot_plugin_oyasumi) | 6 | 2026-04-08 | AGPL | 记录早安和晚安，统计作息，由 LLM 写个性化点评 |
| [xiaoyueRX/astrbot_plugin_anidaily](https://github.com/xiaoyueRX/astrbot_plugin_anidaily) | 1 | 2026-09-28 | MIT | 根据 yuc.wiki 每天推送番剧卡片 |
| [ma114514/astrbot_plugin_anime_birthday](https://github.com/ma114514/astrbot_plugin_anime_birthday) | 1 | 2026-09-10 | MIT | 推送二次元角色生日 |

说明：
- “签到”在市场里没有找到独立的高星插件。签到功能大多附带在 get_px（★24）、endfield 这类插件里。
- 网易云解析没有单独核实，parser 和 music 的说明里提到了多平台，具体支持哪些平台未核实。
- 天气推送没有查。

## 三、借鉴清单

图例：
- 工作量：小 ≤0.5 天，中 1–2 天，大 ≥3 天。都是粗估。
- “可能要停机”：要改 openclaw.json、动插件或补丁，并重启网关（QQ 会离线约 1 分钟）。
- 额度：“无”指纯本地规则，不调用 LLM。

### A. 观察和调教星野的控制台功能

| # | 功能 | 借鉴来源 | 价值 | 工作量 | 停机 | 额度 |
|---|---|---|---|---|---|---|
| A1 | **按群覆盖人设**：每个群有一小段附加规则（语气、禁区、群梗），控制台编辑，由 gate 在对应的群里注入。可以和黑话词典、称呼表共用注入通道 | umop 配置路由、Persona | 高 | 中 | 可能要停机（改 gate，第一次要重启；之后改文件热生效，和黑话词典一起做只重启一次） | 每轮多 50–300 token |
| A2 | **设定集或知识库**：凛上传星野的设定、群规、常见问答（Markdown），本地检索后按需注入，和 mem0 分开 | knowledge_base（RRF 混合检索） | 中 | 中到大 | 可能要停机（新增工具或技能） | 嵌入只花一次，查询有少量费用；嵌入模型不能动千帆那套，要单独选（未核实） |
| A3 | **按人的速率限制和防刷**：同一个群友 60 秒内超过 N 次就排队或忽略，控制台显示谁被限流 | rate_limit_check | 高（直接省额度） | 小到中 | 可能要停机（gate 里加代码） | 无，还能省额度 |
| A4 | **防注入和“被调教”记录**：本地规则识别“忽略之前的指令”“你现在是……”这类话，命中时给星野加一条提醒，并记进控制台。可以并进已评估的“拒答和翻车记录”页 | antipromptinjector、aPromptGuardian | 中 | 中 | 可能要停机（提醒注入部分）；只做记录不用停机 | 无（本地规则） |
| A5 | **定时任务页**：在控制台查看和启停 OpenClaw 已有的定时任务和心跳，例如群报的定时任务 | CronJobPage | 中 | 小到中 | 只读不用停机；启停要不要重启未核实 | 无 |
| A6 | **人设化报错**：模型报错或超时时，不发出原始报错，改成星野口吻的一句话，控制台可以编辑这句话 | Persona.custom_error_message | 中 | 小 | 可能要停机（补丁） | 无 |
| A7 | **记忆衰减提示**：在记忆页标出长期没被召回、互相矛盾或重复的记忆，供凛清理，只做提示不自动删 | livingmemory | 低到中 | 中 | 不停机（控制台直接读 Qdrant） | 无 |
| A8 | **群友性格画像**：在个人档案里加一个“生成画像”按钮，手动触发，让 LLM 根据最近聊天写几句，凛审核后保存 | portrayal | 低到中 | 小到中 | 不停机 | 每次约 2k–5k token，手动触发 |

### B. 星野在群里的新玩法

| # | 玩法 | 借鉴来源 | 价值 | 工作量 | 停机 | 额度 |
|---|---|---|---|---|---|---|
| B1 | **消息防抖**：同一个人几秒内连发的几条合并成一次回复，避免逐条接话、把一句话拆开理解 | debounce | 高 | 中 | 可能要停机（gate） | 省额度 |
| B2 | **复读姬**：群里出现 N 条相同消息时，星野按概率跟着复读，或者用自己的口吻“打断复读”，可设冷却。纯规则 | reread（MIT） | 高（便宜又有群味） | 小 | 可能要停机（gate） | 无（打断时如果改走模型会有少量费用） |
| B3 | **今日运势和塔罗**：`今日运势` 或 `抽塔罗` 时，本地随机抽签或抽牌，结果交给星野用人设口吻解读；每人每天一次，结果固定 | jrrp_plus、tarot、rollpig | 高 | 小到中（可以做成技能，牌面可以用现有的生图脚本） | 加技能是否需要重载未核实，可能要停机 | 每次约 300–800 token |
| B4 | **抽群友当今日老婆**：只从当天发过言的人里抽，每人每天一次，星野点评一句 | wifepicker（AGPL，只借思路） | 中到高 | 小 | 同 B3 | 每次少量 |
| B5 | **链接解析**：群友发 B 站或抖音链接时，自动回标题、UP 主、时长和封面，再让星野吐槽一句 | parser（MIT） | 中 | 中 | 可能要停机 | 吐槽部分少量；需要外部请求，洛杉矶访问 B 站接口的情况未核实 |
| B6 | **GalGame 立绘对话框**：偶尔或按指令把星野的回复渲染成带立绘的对话框图片，按情绪换立绘，立绘可以用生图脚本做 | chuanhuatong（AGPL，只借思路） | 中 | 中到大 | 可能要停机 | 渲染是本地的；做立绘一次性花生图额度 |
| B7 | **早晚安作息**：群友说早安或晚安时记下时间，星野会说“你今天又 3 点睡”，每周可以出一个作息榜，并进群报 | oyasumi | 中 | 中 | 可能要停机 | 记录不花额度，点评少量 |
| B8 | **闭嘴和唤醒延长**：群友说“星野闭嘴”后，她在这个群静默 N 分钟，@ 她除外；被 @ 之后的几十秒里，不 @ 她也会接话 | wakepro | 中 | 小 | 可能要停机（gate） | 无 |
| B9 | **戳一戳和贴表情回应** | pokepro、emoji_like | 中 | 小 | 可能要停机 | 少量 | 

B9 依赖平台能力，未核实。QQ 官方 API 很可能收不到戳一戳事件，也没有贴表情接口，要先确认 qqbot 通道支不支持。

| # | 玩法 | 借鉴来源 | 价值 | 工作量 | 停机 | 额度 |
|---|---|---|---|---|---|---|
| B10 | **Steam 或番剧动态播报**：群友开始玩某个游戏、当天有新番或角色生日时，星野在群里提一句 | steam_status_monitor、anidaily、anime_birthday | 低到中 | 中 | 可能要停机 | 少量 |
| B11 | **电子钓鱼或签到经济**：带金币和图鉴的长期小游戏 | fishing（AGPL） | 低到中（容易刷屏） | 大 | 可能要停机 | 规则本身不花额度 |
| B12 | **点歌** | music（MIT） | 低 | 中 | 可能要停机 | 少量 |

B10 是主动推送，受官方 API 主动消息配额限制，未核实。B12 发音乐卡片在官方 API 上未核实，可能只能发链接。

不建议做的：
- 词云和发言排名（cloudrank）：和群报、互动统计重叠。
- self_learning 全套：和黑话词典重叠，而且是 AGPL。
- QQ 空间和群管：需要 aiocqhttp。
- 按模型拆分的统计面板：属于凛否决过的用量热力图一类。

## 四、推荐前 8 项
1. **B1 消息防抖**：直接改善回复质量，还能省额度。
2. **A3 按人速率限制**：防刷、省额度，纯代码。
3. **B2 复读姬**：成本最低，最有群味。
4. **A1 按群覆盖人设**：和黑话词典、称呼表合并成一次 gate 改动，只停机一次。
5. **B3 今日运势和塔罗**：每天都有互动理由，适合星野的人设。
6. **B8 闭嘴和唤醒延长**：群友能自己调节她的存在感，和读空气互补。
7. **A4 防注入记录**：和“拒答和翻车记录”页合并做。
8. **B4 抽群友当今日老婆**：轻量，群里氛围好。

合并建议：
- B1、A3、B2、B8 和 A1 都要改 followup-gate，建议和黑话词典、称呼表打包成一轮，**只重启一次网关**。
- 动工和部署都要凛亲口批准。
- AGPL 或 GPL 插件（debounce、wifepicker、wakepro、antipromptinjector、chuanhuatong、fishing）只借鉴思路，代码自己写。MIT 的也建议自己重写，因为是 Python 写的，而且 AstrBot 的接口在 OpenClaw 上用不了。

## 未核实清单
- qqbot 通道是不是 QQ 官方 API，支不支持戳一戳、贴表情、音乐卡片，主动消息的配额是多少。
- OpenClaw 加技能要不要重载；控制台启停定时任务是否安全。
- 洛杉矶主机访问 B 站和抖音解析接口的情况。
- 网易云解析、天气推送、独立的签到插件：都没有具体核实。
