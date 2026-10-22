# 拒答和翻车记录 / 群友称呼表：只读评估

2026-10-20 17:35（UTC+8）。这次只读了 ref-index.jsonl、/tmp/openclaw 日志、REAL_SHAPES.md 和 gate 源码，下面所有统计都是本地跑出来的。
- 主机上没写任何东西，没重载或重启网关。
- 没调用模型，没碰嵌入模型。
- **没订阅会话消息事件**（10-7 那次订阅把网关卡死了）。
- openid 在文中都打了码，例如 凛=4330BB…DF70。

## 实测数据源

| 来源 | 内容 | 保留 | 用途 |
|---|---|---|---|
| `qqbot/data/default/ref-index.jsonl` | 5906 条消息（群聊 5409，私聊 497）。字段：messageId、senderId、senderName、content、timestamp、scope、isBot。**没有群 id**，没有回复关系，也没有表情回应 | 从 9-30 起累计 | 群友原话和外号的主要来源；抱怨关键词扫描 |
| chat.history（网关方法，控制台已在用） | 按会话列出 user/assistant/toolResult 消息；assistant 消息带 stopReason、errorMessage，toolResult 带 isError（以 REAL_SHAPES 和 v2.4 解析为准，开工时抽样核实）| 跟随会话；会话被重置后，旧会话会变成 `.deleted.*.zst` | 拒答、模型错误、工具失败；按群区分 |
| `/tmp/openclaw/openclaw-YYYY-MM-DD.log` | 每行一个 JSON，带 subsystem、文本、`_meta.date`（UTC）和 logLevelId。今天的日志 13 MB | **目前只有 10-19 和 10-20 两天**，在 /tmp 里，重启后会被清掉 | 发送失败、限流、插件错误 |
| `workspace/memory/` 小结 | 已经过模型改写 | 长期 | 只作参考 |

关键词粗扫，今天的日志：
- "error" 393 次，"429" 509 次（其中有不少是数字误中），"tool…fail" 220 次。
- "refus" 134 次，但全是 `cli session history refused across auth boundary` 这类系统消息，**不是模型拒答**。
- 没有 "reaction" 字样，"send failed" 也没有出现。

所以真正可用的规则要按 subsystem 和 logLevelId 精确匹配，不能直接数关键词。

---

## A. 拒答和翻车记录

### 分类和识别方式
1. **拒答**
   - 来源：chat.history 里 assistant 的正文。
   - 本地规则：正则匹配“我不能/无法帮/不便/抱歉，我…不”等句式，加上 stopReason 为 `refusal` 或 content_filter（如果有的话）。
   - 误报：角色扮演里的“不要”很常见。建议规则先筛一遍，只对命中的少数几条可选地交给模型复核。
2. **故障**
   - 模型错误：assistant 消息带 `errorMessage`，或 stopReason 为 error；日志里 `agent/*` subsystem 的 logLevelId ≥5、429 或超时。
   - 工具调用失败：toolResult `isError=true`；日志里 tool 相关的 subsystem。表情包生成要匹配 `sticker gen send failed`。
   - 发送失败：qqbot 插件日志里的发送错误或重试（今天 0 次，具体格式开工时取实例确认）。另一种判断：chat.history 里 assistant 有正文，但 ref-index 里同一时间附近没有 isBot=true 的消息。
3. **群友抱怨答非所问**
   - 来源：ref-index 里 isBot=false 的消息。规则：她发言后 3 分钟内同群出现“答非所问/你在说啥/听不懂/牛头不对马嘴/？？”等。
   - 实测全部历史只有 0 条命中前四个词，量很小，“？？”要另外统计。
   - **表情回应（点踩）**：ref-index 和日志里都没有回应数据。QQ 官方机器人接口能不能收到表情回应事件还不确定，第一期不做，如实标“暂不支持”。

### 额度
- 纯本地规则：0。
- 可选的模型复核：只复核规则命中的“拒答”和“抱怨”两类。按每天 ≤10 条、每条上下文约 300 token 估算，每天 ≤3k 输入、≤0.5k 输出。`openclaw infer model run --local` 不返回 usage，以上是估算。建议默认关掉。

### 回填和持续采集（不订阅事件）
- 回填：
  - ref-index 从 9-30 开始可以全部回填。
  - chat.history 只能回填现存的会话，已被删除的 .zst 不读。
  - 日志只能回填 2 天。
- 持续采集：
  - 控制台加一个定时器（每 5 分钟），只读，不订阅事件：
    - 日志：记住日志的字节偏移，只读新增部分（日期切换时换文件）。
    - ref-index：同样按偏移增量读。
    - chat.history：对两个群和主会话按时间增量拉取。
  - 结果写到 `/opt/hosino-console/data/misfires/YYYY-MM.jsonl`（600 权限）。
  - 可以让 李 标记“误报/已处理”。
  - 因为日志在 /tmp、会被清，定时器顺带把命中的日志行摘录存进 data，算是变相延长了保留期。
- 现有 drop-in 已经把 /tmp/openclaw 只读挂进控制台，**不需要新的可写路径**。

### 工作量和批准
- 后端解析加定时器约 1 天，前端页约 0.5 天。
- **不需要重启网关**，也不改 gate。
- 需要 凛 批准：开工、部署控制台（会把所有人登出）。开启模型复核要另外批准。

---

## B. 群友称呼表

### 三种关系
1. 星野怎么称呼某个群友。来源：她在群里的发言（ref-index 里 isBot=true 的消息，或 chat.history 的 assistant 消息）。
2. 群友怎么称呼她，例如“星野/猫猫/ねこ”。
3. 群友之间怎么互称。

现状：gate 里已经写死了一段身份表，例如凛=4330BB…DF70、离/小离=7FE244…2F50、春=249BDB…579B、芙宁娜（另一个机器人）=A6902C…E201。称呼表可以把这段**改成从数据读**，以后不用再为它改代码。

### 提取方法
- 本地规则：
  - 句首或句尾的称呼语（“X，…”/“…啊X”）、@后面的名字、senderName（群名片）。
  - 统计“谁在什么时候说出某个称呼”，再看紧接着下一条回复的人是谁。回复人 = 被称呼的人，置信度高。
  - 星野这一侧，直接取 assistant 消息开头的称呼，对应当时的发言人。
- 产出候选（称呼, 说话人ID, 被称呼人ID, 次数, 例句），在控制台确认或手改。允许手动新增、删除、合并。
- 模型复核（可选）：和黑话词典一样，在群报那次调用里顺带完成，每群每天约 +0.5k 输出 token。

### 怎么让她知道：和 slang-plan 方案 a 共用一套
- 共用一个 gate 补丁：`groupLexiconHint(sk, event)`。
  - 读 `/opt/hosino-console/data/lexicon/<groupId>.json`，内容 `{slang:[...], names:[...]}`，按文件修改时间缓存。
  - 本轮出现的发言人 ID，或消息里出现的称呼，命中哪个就注入哪个：最多 5 条称呼、5 条黑话，每轮约 50～250 token，没命中就是 0。
  - 放进 `appendContext`，不能放进 `appendSystemContext`，以免破坏提示缓存。
- 写死的 `fixedIdentityHint` 先保留，作为兜底；等称呼表稳定以后，可以把里面的名字表改成从文件读（这算第二次 gate 改动，建议一次做完）。
- **黑话和称呼合并成一次 gate 改动，只重启一次网关。**

### 存储和权限
- 候选：`data/lexicon/candidates/<groupId>.json`；已确认的：`data/lexicon/<groupId>.json`。都是 600 权限，属主 ubuntu，网关进程（也是 ubuntu）能读。
- 都在控制台现有的可写目录 `/opt/hosino-console/data` 下，**不需要新的可写路径**，也不在 ~/.openclaw 下写东西。

### 隐私
- 称呼表天然对应到具体的人：页面上 openid 打码显示，只有 凛 能看见。
- 贬义外号默认不注入，要单独勾选才注入。
- 只在这个人所在的群里注入，不跨群。
- 不自动和互动统计、个人档案关联；档案页最多显示一个只读链接。
- 每条只存一句例句，去掉其他人的 ID；候选 30 天没确认就删掉。
- 已经不在群里的人可以一键清除。

### 工作量和批准
- 后端提取和确认 API 约 1 天，前端约 0.5 天。
- gate 补丁和黑话一起做，约 2～3 小时。
- **需要重启网关一次**（插件不能热重载，QQ 会短暂断开）。
- 需要 凛 批准：开工、部署控制台、修改 gate 并重启网关、把写死的身份表迁到文件（可选）。

---

## 建议顺序
1. 先做 A：零额度，不碰网关，只部署控制台就行。
2. B 和黑话词典共用 `data/lexicon` 和同一个 gate 补丁，等两边都准备好，一次申请重启网关。
