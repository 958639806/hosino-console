# Koishi / NoneBot / 拟人化项目调研：给星野的新点子（只读）

调研时间：2026-10-20 20:50 (UTC+8)。只看了公开资料，没装任何东西，也没碰服务器。

## 数据来源和说明
- Koishi：官方 registry `https://registry.koishi.chat/index.json`（共 4781 个插件）。下载量是 registry 里的“近一个月下载”，日期是 npm 最后发布日期。
- NoneBot：商店数据 `https://registry.nonebot.dev/plugins.json`（共 946 个）。这份数据**没有下载量**，所以 NoneBot 插件的 star 数取自 GitHub API。拿不到的写“未核实”。日期是商店记录的最后发布日期，或 GitHub 最后 push 日期（已注明）。
- 已排除：星野已有的功能、凛否决过的、前几轮已评估或提过的（表情、语音、记忆纠错、黑话、称呼、拒答翻车、群报、互动统计、日记、AstrBot 两份报告里的全部条目，以及语录墙、口头禅检测、关系图、话题时间线、人设试衣间、一键重放、生日、她的一天、点歌台、待办约定、氛围晴雨表、词云和发言排名等）。
- 许可证：AGPL / GPL 的项目只借思路，所有条目都要自己重写。
- **平台限制（未核实）**：qqbot 很可能走 QQ 官方 Bot API。标【平台】的条目依赖私聊主动推送、@任意人、撤回等能力，可能做不了或受配额限制。
- 图例：工作量 小 ≤0.5 天 / 中 1–2 天 / 大 ≥3 天；“停机”指要改 gate、插件或 openclaw.json 并重启网关（QQ 断约 1 分钟）；额度“无”指纯本地规则。

## 一、热门拟人化 / 陪伴类项目速览
| 项目 | 链接 | 热度 | 最后更新 | 许可证 | 可借鉴点 |
|---|---|---|---|---|---|
| MaiBot（麦麦） | https://github.com/Mai-with-u/MaiBot | 6327 star | 2026-10-20 push | GPL-3.0 | 表达方式学习、规划器、WebUI 审核学到的内容 |
| chatluna-character（伪装群友） | https://github.com/ChatLunaLab/chatluna-character | 75 star；Koishi 309 次/月 | 2026-09-08 | AGPL-3.0 | 伪装成群友聊天，星野的读空气已覆盖，不再提 |
| chatluna-livingmemory | https://github.com/Procyon-Nan/koishi-plugin-chatluna-livingmemory | 9 star；461 次/月 | 2026-10-17 | MIT | 第一人称叙事记忆（与星野日记重叠，不单列） |
| satori-ai | https://github.com/gfjdh/koishi-plugin-satori-ai | 21 star；181 次/月 | 2026-10-19 | MIT | 用户画像、常识管理、好感度（好感度凛已否） |
| nyaturingtest | https://github.com/shadow3aaa/nonebot-plugin-nyaturingtest | 27 star | 2025-09-04 push | AGPL-3.0 | 情绪模拟（AstrBot 报告已提） |
| ai-groupmate | https://github.com/yaowan233/nonebot-plugin-ai-groupmate | 10 star | 2026-10-20 push | MIT | AI 虚拟群友 |
| personification | https://github.com/luojisama/nonebot-plugin-personification | 9 star | 2026-08-08 | MIT | 作息模拟、风格学习（作息已提） |
| moellmchats | https://github.com/Elflare/nonebot-plugin-moellmchats | 30 star | 2026-07-17 | GPL-3.0 | 按难度把问题分给不同模型 |

结论：拟人化核心机制前两轮基本都覆盖了。真正新的只有 MaiBot 的“表达方式学习 + 人工审核”和 moellmchats 的“按难度选模型”，下面单列。

## 二、A 类：控制台里观察和调教星野

### A1 表达方式学习和审核
- 来源：MaiBot（GPL-3.0，只借思路）；learning-chat https://github.com/CMHopeSunshine/nonebot-plugin-learning-chat（190 star，2023-08-27，AGPL-3.0）
- 做了什么：从群聊里学“在什么情境下，群友习惯怎么说”（句式和语气，不是词义），存成“情境 → 表达”条目，回复时挑几条参考。MaiBot 的 WebUI 能审核和删除学到的条目。
- 搬到星野：本地统计候选句式，每天在群报那次模型调用里顺带归纳成“情境 → 说法”。凛在控制台审核通过的才生效，每轮只注入命中的 1–3 条。可以和黑话、称呼共用 lexicon 注入通道。和黑话词典的区别：黑话管“词是什么意思”，这个管“话该怎么说”。
- 价值：高（直接解决说话不像群友的问题）
- 工作量：中（1.5–2 天，复用 lexicon 后更少）
- 停机：要（改 gate 注入，可和黑话、称呼一起只重启一次）
- 额度：每天每群约 0.5k–1k 输出 token；每轮多 50–150 token 上下文

### A2 固定问答规则（命中就不走模型）
- 来源：koishi-plugin-dialogue https://github.com/koishijs/koishi-plugin-dialogue（7 star；Koishi 545 次/月；npm 2023-11-09，GitHub 2024-07-04 push；MIT）
- 做了什么：在后台配置“问 → 答”，支持正则、概率、按群生效，命中时直接回复。
- 搬到星野：控制台加“固定问答”页，适合群规、服务器地址、常见 FAQ 这类事实问题。命中时可以直接回，也可以把标准答案塞给星野让她用自己的口吻说（推荐后者，不破坏人设）。和“设定集”的区别：设定集要她去查，这个是精确命中、确定性回复。
- 价值：中
- 工作量：小到中（1 天）
- 停机：要（gate 里加一层匹配）
- 额度：直接回复时省额度；改写模式与平时相同

### A3 出口内容审查（发出去之前过滤）
- 来源：nonebot-plugin-paminet-nodirtymsg https://github.com/PamiNET-Corp/nonebot-plugin-paminet-nodirtymsg（star 未核实，2025-03-15，许可证未核实）；ayaka-prevent-bad-words https://github.com/bridgeL/nonebot-plugin-ayaka-prevent-bad-words（未核实）
- 做了什么：原插件用 Trie 树匹配违禁词，撤回群友的消息。
- 搬到星野：反过来用，在星野发出消息前检查一遍。命中违禁词表、或者疑似泄露内部信息（路径、IP、token 前缀、“系统提示”字样）就替换或拦下，并记到控制台。官方 Bot 发违规内容可能被封，这一层有实际价值。可以复用控制台已有的 `redact()` 规则思路。撤回群友消息需要群管权限【平台】，不做这部分。
- 价值：高
- 工作量：中（1 天）
- 停机：要（改发送链路的补丁）
- 额度：无

### A4 按难度选模型（省额度）
- 来源：moellmchats（GPL-3.0，只借思路）
- 做了什么：先用规则或小模型判断问题难度，闲聊走便宜快速的模型，难题才走强模型。
- 搬到星野：在 gate 里按规则（长度、是否 @、是否有问句或代码）打一个难度分，控制台可以设阈值并看分流比例。需要先核实 OpenClaw 2026.9.8 能不能按单轮切换模型，做不到就不做。
- 价值：中（省钱，但可能让回复质量不稳定）
- 工作量：中到大（未核实 OpenClaw 的支持情况）
- 停机：要（很可能改 openclaw.json 和 gate）
- 额度：降低

## 三、B 类：星野在群里的新玩法

### B1 AI 海龟汤（星野主持）
- 来源：nonebot-plugin-ai-turtle-soup https://github.com/xxtg666/nonebot-plugin-ai-turtle-soup（7 star，2026-08-22，MIT）
- 做了什么：AI 出汤面，群友提问，AI 只回答“是 / 不是 / 无关”，最后揭晓汤底。
- 搬到星野：星野当主持人，汤底存在控制台，不进她的普通上下文，判定时单独调用一次。题库可以在控制台增删，也能让模型现编。很适合她的人设，比纯随机小游戏更“有她在”。
- 价值：高
- 工作量：中（1.5 天）
- 停机：要（gate 要识别游戏中状态，避免读空气把提问吞掉）
- 额度：每局约 20–40 次短调用

### B2 文字冒险 / 跑团（星野当 DM）
- 来源：Koishi 的 dew-bot（302 次/月，2026-10-13，MIT）、otherworld-connection（158 次/月，2026-10-18，MIT）、lom-bridge（397 次/月，2026-10-06，MIT）。这几个的仓库链接和 star 未核实，市场页 https://koishi.chat/market 可以搜到。
- 做了什么：带剧情、角色属性和存档的群聊文字 RPG。
- 搬到星野：轻量版就行：凛在控制台写好世界观和几个场景，群友用短指令行动，星野讲故事，状态存在控制台的 JSON 里。容易刷屏，所以默认只在指定群开、限制每小时轮数。
- 价值：中（玩起来很爽，但耗额度、容易刷屏）
- 工作量：大（3 天以上）
- 停机：要
- 额度：高，必须设每日上限

### B3 猜成语（汉字 Wordle）
- 来源：nonebot-plugin-handle https://github.com/noneplugin/nonebot-plugin-handle（27 star，2024-12-23，MIT）；Koishi wordle-game https://github.com/araea/koishi-plugin-wordle-game（141 次/月，2026-10-02，MIT / Apache-2.0）
- 做了什么：猜四字成语，每次提示字、声母、韵母、声调对不对，结果渲染成格子图。
- 搬到星野：本地判定和出图，星野只负责开场和最后吐槽一句。成语库用公开词表。
- 价值：中
- 工作量：中（1.5 天，主要在出图）
- 停机：要（gate 识别游戏状态），也可以做成技能以减少改动（未核实）
- 额度：几乎无

### B4 名人名言梗图
- 来源：koishi-plugin-awa-quote-image https://gitee.com/vincent-zyu/koishi-plugin-awa-quote-image（144 次/月，2026-09-21，许可证未声明）
- 做了什么：回复某条消息并发指令，把这句话配上发言人头像，渲染成黑白“名人名言”图。
- 搬到星野：群友回复一条消息说“星野，裱起来”，她就生成一张梗图，可以顺便加一句点评。只做渲染、不做收藏，和之前的语录墙不重复（以后做语录墙可以共用）。头像要能拿到群友头像，官方 API 下是否可行未核实【平台】。
- 价值：中到高（传播性强）
- 工作量：小到中（1 天，HTML 模板 + 截图）
- 停机：要（识别“回复 + 指令”）
- 额度：无（加点评时一次短调用）

### B5 “这是什么”解释器
- 来源：nonebot-plugin-zssm https://github.com/djkcyl/nonebot-plugin-zssm（30 star，2025-05-31，许可证未声明）
- 做了什么：回复一条看不懂的消息、图片或链接并发“zssm”，AI 解释它是什么意思、什么梗。
- 搬到星野：她本来就看图，缺的是一个明确的“给我讲讲”入口：回复 + “这啥”时，她用科普口吻解释，并可以把解释提交给黑话词典的待审区。
- 价值：中
- 工作量：小（0.5 天）
- 停机：要（小改 gate）
- 额度：每次一次调用

### B6 投胎模拟
- 来源：koishi-plugin-toutai https://github.com/araea/koishi-plugin-toutai（6 star；152 次/月；2026-10-12；Apache-2.0）
- 做了什么：按人口统计数据随机“投胎”，给出国家、家庭、性别等结果和排行榜。
- 搬到星野：本地随机，星野用一句话点评。数据表自己整理。
- 价值：低到中
- 工作量：小到中
- 停机：要
- 额度：几乎无

### B7 谁是卧底【平台】
- 来源：nonebot-plugin-who-is-spy https://github.com/Hanserprpr/nonebot-plugin-who-is-spy（6 star，2025-09-16，AGPL-3.0）；ayaka-games（未核实）
- 做了什么：私聊给每人发词，群里描述、投票。
- 搬到星野：星野主持和点评。但要给每个人私发词，官方 Bot API 很可能不能主动私聊，暂不建议做，除非核实可以。
- 价值：中；工作量：中；停机：要；额度：少量

### B8 搜图找出处
- 来源：koishi-plugin-sauce-aggregator https://github.com/YuzuharaYuka/koishi-plugin-sauce-aggregator（159 次/月，2026-10-18，MIT，star 未核实）
- 做了什么：聚合 SauceNAO、ascii2d 等搜图引擎找原图和作者。
- 搬到星野：回复图片说“出处”，她调用搜图接口，回作者和链接。需要 SauceNAO 的 API Key（免费档有每日限制），涉及外部服务的条款，要凛确认。
- 价值：中
- 工作量：中（1 天）
- 停机：要（加工具或技能）
- 额度：模型额度少，外部 API 有每日限额

### B9 “发病文”生成
- 来源：nonebot-plugin-random-stereotypes https://github.com/lgc-NB2Dev/nonebot-plugin-random-stereotypes（star 未核实，2025-05-27，许可证未核实）
- 做了什么：随机输出一段对某人“发病”的网络梗文。
- 搬到星野：由星野按人设现写一段对点名群友的“发病”，控制台设黑名单（不想被点名的人）和每日上限。有冒犯风险，默认关。
- 价值：低到中
- 工作量：小
- 停机：要
- 额度：每次一次调用

## 四、看过但不推荐的
- 签到经济、钓鱼、PVZ、今日小猪（rollpig-plus）：和 AstrBot 报告里否掉的签到经济是同一类。
- 词云 wordcloud（112 star）、话痨榜 group-historian、message-counter：属于词云和发言排名，已排除。
- 回声洞 best-cave / nonebot-plugin-cave，以及语录库 nonebot_plugin_quote（84 star）、zikequote3：和之前提过的语录墙重复。
- 口癖 miao（28 star，AGPL）：人设已经覆盖。
- chatluna-group-analysis、group-daily-analysis：和群报、性格画像重复。
- Steam / Xbox 状态播报、bilibili-notify：AstrBot 报告已提。
- 群管 qq-group-manager、召唤群友 summon：要群管或 @ 任意人的能力【平台】。
- chatluna-sticker（pHash 去重、自动收藏）、memesluna：表情功能已经有，自动收集已在前几轮提过。
- 定时发言 autospeak：属于冷场破冰或主动消息，已提。

## 五、推荐前 8 项
1. **A1 表达方式学习和审核**：最能提升“像群友”，可以和黑话、称呼一起只重启一次。
2. **A3 出口内容审查**：保护官方 Bot 账号，不花额度。
3. **B1 AI 海龟汤**：最适合星野当主角的群玩法。
4. **B4 名人名言梗图**：成本低、传播性强（先核实能不能拿到头像）。
5. **A2 固定问答规则**：回答事实问题更稳，还能省额度。
6. **B5 “这是什么”解释器**：工作量最小，还能给黑话词典供稿。
7. **B3 猜成语**：几乎不花额度的常驻小游戏。
8. **B8 搜图找出处**：实用，但要先确认外部 API Key 和条款。

备选：A4 按难度选模型（先核实 OpenClaw 能不能按单轮切换模型）、B2 文字冒险（额度高）。

建议打包：A1、A2、B5 都要改 gate，可以和黑话词典、称呼表合成一次 gate 改动，只重启一次网关。B1、B3 需要“游戏中”状态，可以共用一套状态机，作为第二批。所有改动都要凛批准，要停机的更要单独确认。

## 未核实清单
- qqbot 是否是官方 Bot API；能否拿群友头像、能否主动私聊、能否 @ 任意人。
- OpenClaw 2026.9.8 能否按单轮切换模型（A4）。
- 游戏类能否只写成技能、不改 gate（B3）。
- NoneBot 插件的下载量（商店数据里没有）；部分仓库的 star 和许可证（已在条目里标出）。
- Koishi 文字 RPG 插件的仓库链接和 star。
