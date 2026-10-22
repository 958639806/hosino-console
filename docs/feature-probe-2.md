# hosino 控制台新功能只读核实（第二批）— 2026-10-20 16:20 (UTC+8)

方式：在服务器上临时跑了一个 node 脚本，复用控制台的网关连接逻辑（证书指纹固定），方法白名单只有：memory.search, wiki.status/overview/search, transcripts.status/list, doctor.memory.status, doctor.memory.dreamDiary, last-heartbeat, sessions.list, chat.history。脚本和临时结果文件（/tmp/probe-*.json）已删除。没有调用任何写方法，没改配置，没重启网关，没在 ~/.openclaw 下写东西（只读了文件）。密钥一律只写“已设置/未设置”。

## 1 今日群报（记忆总结 + OpenAI 生图）— 可行
记忆/总结来源：
- `memory.search`：**不可用**，报 `MEMORY_CAPABILITY_OWNER_PRIVATE_REQUIRED`（mem0 后端只允许 owner-private 调用）。`doctor.memory.status` 同样显示 embedding 不可用。控制台已有直连 Qdrant（集合 mem0_full_timestamped_20260926）的只读路径，可作替代。
- `wiki.*`：可读。vault=/home/ubuntu/.openclaw/wiki/main，isolated，bridge 关闭；共 14 个 source 页，没有 entity/concept/synthesis；`wiki.search` 正常返回（含 snippet、更新时间）。内容少，做日报价值有限。
- `transcripts.*`：只有 manual-transcript 导入，`transcripts.list` 为空，没用。
- **工作区每日记忆笔记**：`workspace/memory/` 下 22 个 `YYYY-MM-DD-HHMM.md`（最近 2026-10-20 15:22），是 session-memory 钩子写的会话小结，最适合做日报素材；另有 `memory/dreaming/{light,rem,deep}`。
- 最直接的来源其实是 `chat.history`：按当天时间戳筛两个群的消息，再交给模型总结。
- 结论：日报 = 当天 chat.history（+ memory/ 当天笔记）→ 模型总结。
生图：
- `agents.defaults.imageModel.primary = openai/gpt-6-luna`；openai 插件已启用；`models.providers.openai` 里**没有 apiKey 字段**，openclaw.json 的 auth.profiles 只有 deepseek，网关进程环境里没有 OPENAI_* 变量 → OpenAI 走的是 codex 插件/OAuth 登录，不是 API key。
- 生图确实能用：表情包库 16 张里 15 张是 gpt-image-2/1.5 生成的，`media/tool-image-generation/` 有 11 张成品；sticker_manager.py 走 `openclaw infer image generate`。
- 注意：控制台要生图得调网关的生图能力（属写/动作类，会消耗额度），或由控制台起一个受控任务；这一步需凛批准后再设计。

## 2 好感度 — 勉强可行，但数据薄，建议不做或只做“互动统计”
- 控制台 data/ 目前只有 aliases.json、groups.json，**profiles.json 还不存在**（个人档案还没上线/没人填）。
- 本次扫了 38 个会话共 2161 条消息（user 477 / assistant 1186 / toolResult 473）。消息顶层字段里显式的发言人只有 `senderLabel`（4 条）；群聊发言人主要在用户消息正文/元数据里，需要按 v2.4 的解析逻辑提取。
- mem0 记忆网关不让读（见上），没法按人取记忆条目。
- 结论：能算的只有“互动量”：每人发言数、她回复数、被静默数、最近互动时间。这叫“互动热度”还行，叫“好感度”没有依据。凛说“不行就不做”，按这个标准判断为**不做好感度**，可选做“互动统计”。

## 3 星野日记 doctor.memory.dreamDiary — 纯读，已调一次
- 源码（dist/doctor-D1CHH0mK.mjs）：处理函数只做 `resolveDoctorMemoryTarget` + `readDreamDiary(workspaceDir)`；后者对候选文件名 lstat，跳过符号链接，然后 readFile，返回 `{found, path, content, updatedAtMs}`。没有任何写入。方法描述里 scope 是 `operator.read`。同组的 backfill/dedupe/reset/repair 是另外的写方法，**没碰**。
- 返回：`{agentId:"main", found:true, path:"DREAMS.md", content:<2474 字>, updatedAtMs}`。
- 内容：`# Dream Diary` / `## Deep Sleep`，是第一人称、散文诗风格的“梦境日记”，回顾调线路、修 SSL、做表情包这类日常。**最后更新 2026-09-22 03:01**，一个月没更新，因为 `memory-dream` 技能和 memory-core 插件都关着。
- 结论：展示**可行**（纯读、零风险），但内容是静态的；想让它持续更新需要开 dreaming（会改配置、往 workspace 写），另议。

## 4 表情包排行 — 历史数据不够，需走别的来源
chat.history 里的样本（38 个会话）：
- 她发的：`stickers/xxx.png` 路径 5 处（几乎全是“开心”）；`&&分类&&` 标签 1 处真实的（&&卖萌&&），其余命中是 shell 的 `&&` 误报；生图成品路径 22 处。
- 收到的：`media/qqbot/downloads/<openid>---<hash>` 46 处（用户发的图/表情，文件名带发送者 openid）；`qqbot.ugcimg.cn` URL 12 处（多为语音）。
- 原因：`&&分类&&` 标签在发送前被插件替换成媒体，历史里多半只剩文字；潜水表情（lurkSticker）由插件直接发，不进会话历史；插件状态文件 `qqbot/group-keepalive-state.json` 只记每群当天计数（目前都是 0），没有历史。
- 规则位置：
  - `workspace/AGENTS.md` 第 73–74 行：发表情用 `tools.message({action:"send", media:"stickers/xxx.png"})`，取图用 `scripts/sticker_manager.py get "<情绪>"`；第 110 行：群聊在回复最后单独一行写 `&&分类&&`，最多 1 个。
  - `group-rules/qqbot-shared.md`、`skills/deadpan-talk`、`skills/image-text-replate` 也提到表情。
  - 配置：`channels.qqbot.mediaTags`：stickers=true，stickerCooldownReplies=3，stickerNudgeAfterReplies=12，stickerMaxSide=512。
  - 插件 `qq-group-followup-gate.config.lurkSticker`（见第 5 项）。
  - 库：`workspace/stickers/` 共 16 张（卖萌/喜欢/困/委屈/害羞/开心/得意/无语/早安/晚安/潜水/生气/疑惑/难过/震惊/骑鲨鱼）。
- 结论：**“表情库展示”可行**（直接列 stickers/ 目录，已有媒体代理）。**“排行”从历史只能拿到很少样本**；要做准需要解析网关日志里的 `lurk sticker SENT ... file=` 和 mediaTags 发送记录（日志只保留约两天），或者让控制台自己往后累计。收到的表情能按 downloads 文件计数，但分不清是表情还是普通图片。

## 5 主动搭话 / 心跳 — 当前配置与修改方式（未调用任何写方法）
- 网关心跳 `agents.defaults.heartbeat`：every=25m，target=none，session=main，lightContext=false，timeoutSeconds=180，prompt 写的是“仅缓存保活，不用工具，不发消息，只回 NO_REPLY”。`workspace/HEARTBEAT.md` 只有注释。`last-heartbeat`：status=ok-empty，reason=interval，silent=true。**也就是说心跳本身现在不发任何消息**，它只是用来保持缓存。
- 随机表情实际来自插件 **qq-group-followup-gate 的 keepalive + lurkSticker**：
  - keepalive.quietMin=20（群安静 20 分钟后做保活）
  - lurkSticker：enabled，dryRun=false，概率 0.1，群安静 ≥25 分钟，夜间 00:00–08:00 (Asia/Singapore) 不发，每群每天最多 3 张，不连发（中间要有真人发言），hideFromMenu=true，只对群 `379363…`（不能爽吃zako了QwQ）生效；用的表情 key 已设置（不显示）。
  - 只在保活实际跑过之后才会触发，发的是纯媒体，不经过模型。
- 修改方法：改 openclaw.json，走网关 `config.patch`（operator.admin，标记 controlPlaneWrite），或者直接编辑文件让网关监听到变化。这两种都要往 ~/.openclaw 写，**按现在的硬规则不能做，需要凛单独批准**。
- 会不会重载（据 dist/config-reload-plan-*.mjs）：
  - `agents.defaults.heartbeat.*`：hot，动作是 restartHeartbeat + reconcileSystemJobs，**不重启网关**。
  - `plugins.entries.qq-group-followup-gate.*`：hot，动作是 reloadPlugins + disposeMcpRuntimes，**不重启网关**，但会重载全部插件（QQ 通道插件也在其中，可能短暂影响）。
  - 没匹配到规则的路径默认 restart。`gateway.reload` 没配，用默认模式。
  - `set-heartbeats`（operator.admin）是运行时开关心跳的动作方法，不改参数。
- 结论：**可行，但这属于改她的行为**。要让心跳“主动说话”，得改 heartbeat 的 prompt 和 target（现在是 none），会增加真实 QQ 发送和费用，需要凛明确拍板；只调表情的概率、次数、时段，改插件配置就够了。控制台可以先做一个只读的“主动行为面板”，把上面这些参数显示出来。
