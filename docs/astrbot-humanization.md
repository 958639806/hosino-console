# AstrBot 拟人化机制调研 & 星野对照（只读）

调研时间 2026-10-20（UTC+8）。AstrBot 主仓 commit f2404c1（2026-10-20），源码在 `/workspace/astrbot-research/`。插件均为浅克隆，star 数取自 GitHub API 当日数值。服务器只读，未改动、未重启任何东西。

## 一、AstrBot 本体（核心层，机制都很朴素）

| 机制 | 位置 | 逻辑 / 参数 |
|---|---|---|
| 人格 | `core/db/po.py` Persona：system_prompt、begin_dialogs（预置示范对话）、tools 白名单、custom_error_message；`persona_pool` | 靠示范对话定语气（旧版 `mood_imitation_dialogs` 已废弃，合并进 begin_dialogs） |
| 群聊主动回复 | `builtin_stars/astrbot/group_chat_context.py::need_active_reply` | 只有一种方法 `possibility_reply`：非@消息按 `random() < 0.1` 触发，另有 whitelist。没有兴趣度判断，也没有冷却 |
| 群上下文 | 同上文件，`group_icl_enable`，`group_message_max_cnt=1000`，`group_message_history_max_cnt=700` | 把群聊流水格式化成 `[At: x][Image][Voice][Sticker]` 文本块注入；可选 `image_caption` 用小模型把群图转成文字 |
| 分段回复 | `core/pipeline/result_decorate/stage.py` 切分，`respond/stage.py::_calc_comp_interval` 控制节奏 | 正则 `.*?[。？！~…]+|.+$`；超过 `words_count_threshold=150` 字不分段；间隔可选 random `1.5–3.5s`，或 log：`log_base(字数+1)` 再加 0~0.5s 抖动，模拟打字时间；`content_cleanup_rule` 清理每段 |
| TTS | `result_decorate/stage.py:280` | `trigger_probability`（默认 1.0），每条回复掷一次；`dual_output` 同时发文字 |
| 时间感知 | `core/astr_main_agent.py:1013` | `datetime_system_prompt=true`，往 system prompt 注入 `Current datetime + Weekday`（按配置时区） |
| 发言人识别 | `identifier`、`group_name_display` | 在消息前标注发送者 ID、昵称和群名 |
| 引用/@ | `reply_with_quote` / `reply_with_mention` | 回复时附带引用或@ |

结论：本体只给了概率主动回复、分段+打字延迟、时间注入、TTS 概率这几样基础件，真正的"拟人"都在插件里。

## 二、热门拟人化插件

| 插件 | ★ / 最近推送 | 关键机制 |
|---|---|---|
| [anka-afk/astrbot_plugin_meme_manager](https://github.com/anka-afk/astrbot_plugin_meme_manager) | 419 / 10-20 | 回复末尾 `&&分类&&` 标签→随机选图（星野的标签方案与它同源）；提示词给"约每 4 条配 1 张"的软频率；**自动收集**群友表情（视觉模型判定，置信度 0.85、冷却 20s、日限 100，可人工审核）；语义检索 top_k；可选情感辅助模型 |
| [Pancakes-Labs/astrbot_plugin_proactive_chat](https://github.com/Pancakes-Labs/astrbot_plugin_proactive_chat) | 416 / 10-18 | **定时主动消息**：私聊 30–600 分钟、群聊 90–360 分钟随机间隔；群冷场 `group_idle_trigger_minutes=30` 后破冰；免打扰时段（私聊 1–7 点、群 2–6 点）；`max_unanswered_times`（私聊 4、群 2）——没人理就停；注入最近 20 条流水；附带 TTS 和分段 |
| [menglimi/astrbot_plugin_private_companion](https://github.com/menglimi/astrbot_plugin_private_companion)（配套 memory_companion ★53） | 412 / 10-18 | 重型"陪伴核心"：持续的角色状态（情绪/精力/饥饿）、每日生活日程、日记、梦境、重要日期、农历/节气/节假日/天气感知、用户画像与关系分、低频主动消息（记录候选、拦截原因和 token 消耗）；仍在大规模重构（v7） |
| [kawayiYokami/astrbot_plugin_angel_memory](https://github.com/kawayiYokami/astrbot_plugin_angel_memory) | 189 / 09-15 | 长期记忆：自主反思、整理记忆 |
| [23q3/astrbot_plugin_SpectreCore](https://github.com/23q3/astrbot_plugin_SpectreCore) | 136 / 09-24 | **读空气**：`read_air` 让模型自己决定，不想说就输出 `<NO_RESPONSE>`，插件拦掉；概率 0.1 + 关键词 + 黑名单词；模型自主引用（smart_quote）；群图转述 |
| [advent259141/Astrbot_plugin_Heartflow](https://github.com/advent259141/Astrbot_plugin_Heartflow) | 89 / 08-23 | **心流**：每条群消息先交给小模型打 5 维分（相关度 .25、意愿 .2、社交适宜 .2、时机 .15、连贯 .2），加权后超过 `reply_threshold=0.6` 才回；**精力值**：每回一次扣 `energy_decay_rate=0.1`，每 5 分钟恢复 0.02，被@时 +0.2；`min_reply_interval_seconds` |
| [nuomicici/astrbot_plugin_splitter](https://github.com/nuomicici/astrbot_plugin_splitter) | 50 / 10-14 | 分段增强：最多 5–7 段、均分、最小段长 10、颜文字/表情保护、图片和@跟随策略、按"自然"节奏发送、分段后再转语音 |
| [muyouzhi6/astrbot_plugin_tts_emotion_router](https://github.com/muyouzhi6/astrbot_plugin_tts_emotion_router) | 85 / 10-14 | **按情绪路由音色和语速**；**原生支持 MiMo**（`mimo-v2.5-tts`，按 emotion 自动加中文情绪标签、带导演模式）；概率、冷却、关键词触发 |
| [muyouzhi6/astrbot_plugin_life_scheduler](https://github.com/muyouzhi6/astrbot_plugin_life_scheduler) | 29 / 10-10 | 用 LLM 每天生成一份生活日程，注入上下文（"我刚下课"之类） |
| Zhalslar/astrbot_plugin_pokepro | 106 | 戳一戳反应（反戳、表情、文本） |

## 三、星野现状（服务器只读核对）

- **人格**：`workspace/AGENTS.md`（19 KB）+ SOUL.md + IDENTITY.md，规则很细。
- **群聊参与**：qq-group-followup-gate v2.2.0。全量接收，由模型判断，不想说就调 `stay_silent` 或输出 `NO_REPLY`（等同 SpectreCore 的读空气）。两个授权群走"积极参与"规则，这已经比 AstrBot 的 10% 随机更贴近人。**没有精力值、频率上限或冷却**，热聊时可能句句都接。
- **分段**：`QQ-SEGMENT-PATCH v1`，最多 3 段，写完一段就发一段。**没有按字数计算的打字延迟。**
- **表情包**：`stickers/params.json`：概率 0.25、冷却 3 条、0–8 点静默、按会话开关、缺分类时自动生图（日限 10）。`&&分类&&` 标签由代码决定是否发送。这一块已经达到 meme_manager 的水平，额外还有自动生图；**唯独缺"自动收集群友表情"**。
- **语音**：群聊用 `<语音>` 标签。参数化（12%、冷却、静默、日限、与表情互斥）**已做好但尚未部署**。AGENTS.md 里私聊仍是"30% + 极端情绪"的旧规则，几处说法互相矛盾。**没有按情绪选择 MiMo 的语气/音色。**
- **记忆**：mem0 + Qdrant，自动捕获（今天已修好）。记忆按会话/peer 命名空间区分，**没有结构化的"群友档案/关系分"**（与 misfire-nickname-plan.md 里的称呼表重叠）。
- **主动消息**：`HEARTBEAT.md` 为空（只有注释），**完全没有定时主动/冷场破冰**。
- **时间感知**：OpenClaw 会注入时间；静默时段在 params 里。**没有节假日/农历/日程这类"生活感"上下文。**
- **情绪状态**：无持续的 mood/energy 状态。
- **防重复**：表情有"不连发同一张"；文字回复没有专门的防重复。

## 四、可借鉴点排序

| # | 点子 | 来源 | 工作量 | 风险 / 代价 |
|---|---|---|---|---|
| 1 | **按字数的打字延迟**：分段之间按 `log_1.8(字数+1)+抖动` 秒发送（上限约 4s），参数放进 params.json | AstrBot respond/stage.py | 小（改 QQ-SEGMENT-PATCH） | 低；需重启网关（找李批准）；要登记进补丁清单 |
| 2 | **群聊精力值/频率闸**：followup-gate 记录每群近期的回复次数，精力低时在提示里写"最近说得多，非@可以少接"，或者直接强制静默；被@时不受限 | Heartflow | 小-中 | 低；会话内状态；重启网关 |
| 3 | **冷场破冰/定时主动消息**：群冷场 N 分钟后有概率开个话题；最近 2 次没人接就停；有静默时段；私聊同理 | proactive_chat | 中（cron/heartbeat + 发送路径） | 中：主动往真实 QQ 群发消息，要先在测试会话验证，上线需李批准；注意 QQ 官方 bot 主动消息的配额限制 |
| 4 | **语音按情绪选语气**：`<语音 情绪=撒娇>` → MiMo 的风格/情绪标签；顺带统一 AGENTS.md 里互相矛盾的语音规则 | tts_emotion_router（已支持 MiMo） | 小-中 | 低；可以合并进还没部署的语音参数化这一轮，只重启一次 |
| 5 | **表情自动收集**：群友发的表情经视觉模型判定后进入待审区，由控制台审核入库 | meme_manager | 中 | 中：视觉模型成本、版权/隐私问题，需人工审核 |
| 6 | **群友档案/关系**：称呼、关系亲疏和互动次数写成结构化档案，回复时注入 | private_companion | 中 | 与 misfire-nickname-plan 合并做 |
| 7 | **生活日程/节日农历感知**：每天生成一段"星野今天在干嘛"并注入，加上节假日和节气 | life_scheduler / private_companion | 中 | 低-中；token 成本；容易和人设冲突，需要校对 |
| 8 | **持续情绪状态**：mood 值随互动漂移，影响语气、表情和语音概率 | private_companion、Heartflow 精力 | 中-大 | 中：难调参，容易显得做作；建议放在 2、4 之后 |

不建议：AstrBot 本体那种纯 10% 随机的主动回复（星野的读空气已经更好）；private_companion 整套照搬（太重，而且正在重构）。

所有改动都只在临时环境开发；凡是要重启网关或控制台的，都先问李（凛）。
