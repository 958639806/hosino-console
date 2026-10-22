# 记仇小本本 / 群梗回旋镖 / 吃醋：只读可行性评估和方案

2026-10-20 21:10 左右（UTC+8），后端喵。全程只读：读了本地调研文档，主机上只读了 gate 插件源码、workspace 目录、stickers/params.json、OpenClaw 自带文档，统计了 ref-index.jsonl。没改文件，没重启，没建会话，没订阅事件，没碰 mem0 autoRecall、嵌入模型，也没碰 dist/mcp-http.runtime。
标 **【未核实】** 的地方要开工前再确认。

## 0. 共同的基础事实（实测）

- **mood.json 不存在**。`workspace/` 下没有 mood.json、grudges.json、gags.json，调研里说的“共用 mood.json”目前只是设想。
- **gate**：`plugins/qq-group-followup-gate/index.js` 共 603 行。`before_prompt_build` 每轮执行，拼 `appendContext`（每轮变化）；两个稳定包装群（379363…、b4ee2a…）还会返回 `appendSystemContext`（固定内容）。已有先例：`HOSINO-STICKER-PATCH v1` 和 `HOSINO-VOICE-PARAMS v1` 都用 `rd()` 按 mtime 缓存读 `stickers/params.json`，改文件 5 秒内生效，不用重启。`before_dispatch` 里的 `isAddressed()` 已经能判断本轮是不是在叫她（@、叫名字、回复）。插件不能热加载，改 gate 代码要重启网关。
- **ref-index.jsonl**：群聊 5413 条、私聊 508 条；含“哈哈”的 85 条，含“芙宁娜”的 564 条。字段只有 messageId、senderId、senderName、content、timestamp、scope、isBot，**没有群 id、没有回复关系、没有表情回应**。按群区分要靠 chat.history 的 sessionKey。
- **另一个 bot**：gate 的身份表里已经写了 `A6902CCD…E201=芙宁娜（另一个机器人）`，吃醋的“对象”可以直接复用这张表。
- **技能是否需要重载**（OpenClaw 文档 `docs/tools/skills.md` 720–736 行）：技能列表在会话开始时做快照，`SKILL.md` 改动由 watcher 发现（默认 `skills.load.watch: true`，250ms 去抖），**同一会话的下一轮就生效，不用重启**。技能进系统提示词的只有名字和描述（`<available_skills>`），正文要模型自己去读。现有技能（如 deadpan-talk）有 `disable-model-invocation: true` 这种只靠用户显式调用的写法。【未核实：本机 watcher 实际是否在跑、没有触发 watch 容量耗尽，可以看日志里有没有 watcher warning】
- **AGENTS.md 是否每轮读取**：文档（agent-workspace.md、memory-architecture.md）写的是“会话开始时加载”。在 claude-cli 这条路线上，改了以后是下一轮重新读，还是要新会话或重启才生效，**【未核实】**，代码在 `dist/workspace-*.mjs`，没有逐行追。保守按“可能要等新会话”处理，所以**本方案不靠改 AGENTS.md 生效**，规则放进技能和 gate。
- **提示词指纹**：改技能描述或 AGENTS.md 会改变系统提示词的哈希，只会导致**一次** CLI 冷启动（约 1.2 秒），不会每轮漂移。前提是内容固定。所有每轮会变的数据（本轮命中的旧账、梗、吃醋提示）**只放 `appendContext`，或者让模型调用脚本去读**，绝不放 `appendSystemContext` 或技能描述。这和正在修的“统一工具列表”是同一类问题：**这三个功能都不新增工具**，避免再让群主和群友的工具列表不一致。

### 推荐的统一存储
新建 `~/.openclaw/workspace/fun/`（网关用户 ubuntu 可写，gate 和技能脚本都能读写）：
- `fun/params.json`：开关、概率、上限、退出名单（仿照 stickers/params.json）。
- `fun/grudges.json`、`fun/gags.json`、`fun/jealousy-state.json`：数据。
- `fun/.trash/`：写之前的备份，以及“撕本本”撕掉的内容（保留 7 天后清理）。

控制台要写这个目录，需要仿照 `20-stickers-rw.conf` 加一个 drop-in：`ReadWritePaths=/home/ubuntu/.openclaw/workspace/fun`，**要重启一次控制台**（不影响 QQ）。不用 mood.json：三块数据的写入方和生命周期都不同，拆开写更容易审计，也更容易单独清空；以后真做心情系统，再另建 mood.json。

**不复用 mem0/Qdrant 写入**：每写一条都要做一次嵌入（耗额度、离嵌入模型太近），而且会和个人记忆混在一起、召回不稳定，撕本本时也删不干净。只允许**读**：现有 autoRecall 召回的内容可以作为判断的参考，不新增任何写入。

---

## 1. 记仇小本本

**存储**：`fun/grudges.json`
```json
{"version":1,"people":{"<openid>":{"entries":[{"id":"g_…","group":"<gid>","quote":"星野胖","at":1792…,"count":1}],"lastRecallAt":1792…,"optOut":false}}}
```
每人最多 20 条，按时间淘汰；原话截到 40 字以内；不记录其他人的 ID。

**触发**
- 记账：群友在骂她或损她（“星野笨/胖/丑/没用”这类轻度吐槽）。由**技能 `grudge-book`**说明规则，模型在本轮回复里顺手调用 `workspace/scripts/fun_grudge.py add …`（走现有的 exec，不新增工具）。不记敏感话题、隐私、真实的人身攻击（那种直接正常回应）。
- 翻旧账：同一人上次翻账超过 7 天，并且本轮是在叫她（@/回复/叫名字），再按 10% 左右的概率。gate 改动版可以在 `appendContext` 里放一行“可翻旧账：上周三说你胖”；纯技能版就让模型调用 `fun_grudge.py peek <openid>` 拿结果，脚本里执行每周 1 次的上限（**上限放在代码里，不靠模型自觉**）。
- 撕本本：本人说“撕本本”，清空自己的条目（移进 `.trash`）。只有本人或凛能撕；凛可以说“撕掉 X 的本本”。

**数据流**：群消息 → 模型判断 → 脚本写 grudges.json → 以后在叫她的轮次里，脚本或 gate 读一条 → 在回复里以语气体现。

**控制台 API（草案，风格同 API.md）**
- `GET /api/fun/grudges` → `{people:[{id, name, entries:[{id, group, quote, at}], lastRecallAt, optOut}], params}`
- `POST /api/fun/grudges/delete`（confirm）`{person, entryId?}`：不带 entryId 就清空这个人，旧内容进 `.trash/`。
- `POST /api/fun/params/set`（confirm）`{params:{grudge:{enabled, perGroup:{"group:<gid>":{enabled}}, recallProbability, recallCooldownDays}}}`：只改传进来的字段，写前备份。

**护栏**：按群开关、个人退出（“别记我仇”= optOut，同时清空）、每人每周最多翻一次、正经问题优先（本轮是提问或求助就不翻账），只改语气，照样帮忙。

**重启**：纯技能 + 脚本版**不用重启网关**（技能下一轮生效【watcher 未核实】）；控制台加 RW 目录要重启一次控制台。gate 注入版要和别的 gate 改动合并成一次网关重启。

**风险**：模型把正常吐槽也记成仇（误记），所以控制台要能逐条删；exec 调用会让这一轮多一次工具调用，约 +1–2 秒【未实测】；骂的是别人的情况要排除，脚本只接受“发言人 = 被记的人”。

**工作量**：技能 + 脚本约 3 小时，控制台后端约 2 小时，前端约 0.5 天。

---

## 2. 群梗回旋镖

**“笑点高”的判定（本地统计，不调模型）**：以一条非 bot 消息为锚点，看它之后 3 分钟内同群的消息：
- 笑声：含“哈哈(2 个以上)/hhh/草/笑死/绷/xswl/🤣😂”的消息，每条 +1，不同人再 +1。
- 复读：和锚点内容相同或高度相似的消息，每条 +2。
- 表情包或图片回复：+0.5【ref-index 里能不能区分“只发了图”要开工时抽样确认】。
- 分数 ≥ 4，并且至少有 2 个不同的人参与，才算候选。
- 表情回应（QQ 的点赞、表情贴）**拿不到**：ref-index 和日志里都没有这类数据，第一期不做。
- 数据量提醒：全部历史里含“哈哈”的只有 85 条，候选会很少，算正常；阈值上线后看一周再调。
- 群 id：ref-index 没有群字段，要用 chat.history 的 sessionKey 来定群【未核实对齐方式，和黑话词典是同一个问题】。

**和黑话词典的关系**：两者都跑在控制台的同一个统计定时器里，共用同一次 ref-index/chat.history 扫描。黑话词典收的是**词**（n-gram，反复出现的说法，要有含义）；回旋镖收的是**整句和当时的场合**（一次性的笑点）。同一句话如果后来变成了高频词，就从 gags 升级到黑话词典，并在 gags 里标 `promotedToSlang`，不重复注入。gate 里共用一个“群内趣味上下文”块：黑话命中优先，回旋镖每轮最多 1 条。

**存储**：`fun/gags.json`，只放已确认的梗：`{group, quote, context(≤60字), keywords[], score, addedAt, uses, lastUsedAt, retired}`。候选放 `/opt/hosino-console/data/fun/gag-candidates/<gid>.json`（控制台自己的目录，不需要新权限）。默认要凛在控制台勾选确认后才进 gags.json【可选：设成自动确认，由凛决定】。

**召回**：gate 按 keywords 匹配本轮和最近几条消息，满足“距上次使用 ≥ 3 天、累计用了不到 5 次、本群开着、本轮不是正经问题”时，在 `appendContext` 放一行“可接的旧梗：…（3 天前）”，**用不用由模型决定**。用过以后在 `message_sending` 里判断回复里有没有这句（关键词匹配），用到了才更新 uses。纯技能版做不好这件事：技能正文要模型主动去读，场合很难对上，所以这个功能**实际上要靠 gate**。

**控制台 API**
- `GET /api/fun/gags?group=` → `{candidates:[…], items:[…]}`
- `POST /api/fun/gags/confirm`（confirm）`{group, candidateId, keywords?}`
- `POST /api/fun/gags/delete`（confirm）`{group, id}`；群友说“这梗删了”时由技能脚本做同样的事。
- 参数并进 `POST /api/fun/params/set` 的 `gag` 段：`{enabled, perGroup, minScore, cooldownDays, maxUses}`。

**护栏**：按群开关；含某人外号或隐私的梗默认不收（规则同黑话词典的隐私节）；个人退出后，他说的话不进候选；每群每天最多接 2 次梗。

**重启**：gate 召回要**重启网关一次**，和黑话词典、称呼表合并；控制台统计和页面只重启控制台。

**风险**：候选少，冷启动期基本不会触发；关键词匹配可能牵强（接得尴尬），所以默认只给提示，由模型决定接不接；要和统计定时器共用扫描，避免重复读 13 MB 日志。

**工作量**：统计和候选约 0.5 天（和黑话词典共用后约 3 小时），gate 匹配约 2 小时，前端约 0.5 天。

---

## 3. 吃醋

### (a) 纯技能版：只在叫她的时候触发
- 技能 `jealousy`：描述写清楚触发条件——本轮是在叫她，并且最近几条消息里有人夸了另一个 bot（身份表里的芙宁娜，或者消息里带“bot/机器人/AI”加夸奖词），或者说了“换个 AI”。这时先酸一句，再正常干活。
- 冷却和退出由 `fun_jealousy.py check <openid>` 判定（每人每天最多 1 次、30 分钟内不重复），写 `fun/jealousy-state.json`。
- 不改 gate，**不用重启网关**；技能下一轮生效【watcher 未核实】。
- 局限：模型能不能看到“刚才有人夸芙宁娜”，取决于那几条消息有没有进上下文；她没被叫到的时候完全不会触发。

### (b) 主动插嘴版：要改 gate
- 在 `before_dispatch` 里加一个检测：发言人不是她自己，消息里 @ 了芙宁娜或带“芙宁娜”，并且有夸奖词（可爱/厉害/最好/喜欢…），或者是“换个 AI/还是 X 好用”。命中后，像 `addressedBySession` 那样设一个短时标记，`before_prompt_build` 时在 `appendContext` 里加“可以酸一句（可选）”，让这一轮“允许说话”。
- 冷落检测（她说了话、10 分钟内没人理、大家在跟别的 bot 聊）比较难判断，误报多，**建议第一期不做**。
- 群级上限放在 gate 代码里：每群每 2 小时最多 1 次；个人退出名单从 `fun/params.json` 按 mtime 缓存读（照搬 `rd()`）。
- **可以和黑话词典、称呼表合并成一次重启**：这三项改的都是 gate 的 `before_prompt_build`/`before_dispatch`，都是“读一个 JSON + 往 appendContext 里加几行”，可以写成一个补丁（例如 `HOSINO-FUN-CONTEXT v1`），再加上回旋镖的匹配，一次登记进 canonical-manifest，一次重启。前提是这几项要同时开发完成；任何一项拖期，就要么等它，要么再重启一次。另外要避开和正在做的 toolcat 补丁（dist/mcp-http.runtime）同时上线引起混淆，最好**分开验证，但可以同一次重启**【要和那边对齐时间】。

**控制台 API**：`params.set` 的 `jealousy` 段 `{enabled, mode:"skill"|"proactive", perGroup, perPersonDailyCap, groupCooldownMin, targets:["<openid>"]}`；`GET /api/fun/jealousy/state` 看今天触发了几次。

**护栏**：不对真实的人际关系、家人吃醋，只针对 bot；个人退出（“星野别吃醋”）；正经问题时不酸；酸完一定照样帮忙；芙宁娜也是 bot，要避免两个 bot 来回互怼（gate 里忽略 isBot 的发言人发起的触发）。

**风险**：(b) 会让她在没被叫的时候插话，等于提高了主动发言率，正好撞上“群聊热闹时回复频率没有上限”这个老问题，所以群级上限必须写在代码里；夸奖词的误报。

**工作量**：(a) 约 2 小时；(b) gate 部分约 2 小时，加一次网关重启（可合并）。

---

## 4. 共同护栏（三项都要满足）
- `fun/params.json` 里有总开关、按群开关（默认只开现在的两个群，其他群默认关）、个人退出名单（一句话退出：“别记我仇/别拿我的话玩梗/星野别吃醋”，或者统一说“别整我”退出全部）。
- 频率上限都写在**代码**（脚本或 gate）里，不靠模型自觉。
- 正经问题（提问、求助、医疗/钱/紧急情况）优先，本轮不触发任何趣味功能。
- 只改语气，**绝不拒绝帮忙**，也不以此为由少回答。
- 凛（4330BB…）可以随时一句话全部关掉（建议口令“星野正经点”，由凛定）。
- 测试只用一次性会话并设 `deliver:false`，不往真实 QQ 群发。

## 5. 推荐顺序
1. **吃醋 (a)** + **记仇小本本（技能 + 脚本版）**：不用重启网关，风险最低，可以先看效果。连同控制台的 `fun/` RW drop-in 和 API，**重启一次控制台**。
2. **群梗回旋镖**：先上控制台的候选统计（和黑话词典共用定时器），攒一周候选，让凛先看看质量。
3. **一次网关重启**合并上线：黑话词典注入 + 称呼表 + 回旋镖召回 + 吃醋 (b)（如果凛要），写成一个 gate 补丁。

## 6. 要凛决定的事
1. 存储放 `workspace/fun/`（需要给控制台加一个可写目录，重启一次控制台），还是坚持用一个 mood.json？我推荐前者。
2. 记仇是模型自己判断就记，还是只在被骂得很明显时才记？翻旧账的概率（建议 10%）。
3. 梗要不要凛在控制台确认后才生效（推荐），还是自动生效。
4. 吃醋只做 (a)，还是也做 (b)？(b) 要不要等黑话词典、称呼表一起开发完再合并重启。
5. 吃醋的对象：只算芙宁娜，还是凡是提到“别的 AI”都算。
6. 退出口令和凛的“全部关掉”口令怎么说。
7. 这三项开工的先后顺序，以及部署时间（部署照例要凛亲口批准）。

## 7. 未核实清单
- 本机 skills watcher 是否在正常工作（决定技能改动是不是下一轮生效）。
- claude-cli 路线下 AGENTS.md 改动何时生效。
- ref-index 能不能区分纯图片或表情包消息，以及怎么对应到群。
- 技能里经 exec 调脚本带来的额外延迟。
- 和 toolcat 补丁上线时间怎么对齐。
