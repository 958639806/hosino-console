# v2.12：小脾气参数（记仇小本本 / 群梗回旋镖 / 吃醋）

> **重要**：消费这些参数的技能、脚本和 gate 补丁**还没做**。上线前这里只存设置，不改变星野的行为。`GET /api/fun/params` 会带 `consumers:false` 和一句 `note`，前端请把它显示出来。

存储：`~/.openclaw/workspace/fun/`，包括 `params.json`、`grudges.json`、`gags.json`，以及备份目录 `.trash/`。需要先部署 `hosino-console.service.d/40-fun-rw.conf`（`ReadWritePaths=/home/ubuntu/.openclaw/workspace/fun`），否则写接口会报 “read-only file system”。
所有 POST 都要带 `X-HS: 1`，并且在 body 里带 `confirm:true`。登录即主人，鉴权和现有接口一样。每次写入前都会先把旧文件复制进 `.trash/<时间>-[标签-]<文件名>`，返回值里的 `backup` 就是这份备份的文件名（第一次写时为 null）。非法值返回 400，带中文报错。所有写操作都记进 ops-log（`fun.*`）。

群键：`group:<32位小写hex>`。人：32 位大写 QQ openid（传小写也行，会自动转成大写）。

## `GET /api/fun/params`
→ `{params, stored, defaults, consumers:false, note}`
- `params`：生效值，即默认值和已存值合并后的结果。`stored`：params.json 原样。`defaults`：默认值。
- 默认值（**全部关闭**）：
```json
{"enabled":false,"killPhrase":"星野正经点","killOwnerOnly":true,"optOutAllPhrase":"别整我","optOut":{},
 "grudge":{"enabled":false,"defaultEnabled":false,"perGroup":{},"recallProbability":0.1,"recallCooldownDays":7,"maxEntriesPerPerson":20,"maxQuoteChars":40,"optOutPhrase":"别记我仇","clearPhrase":"撕本本"},
 "gag":{"enabled":false,"defaultEnabled":false,"perGroup":{},"minScore":4,"minDistinctPeople":2,"windowMin":3,"requireApproval":true,"cooldownDays":3,"maxUses":5,"perGroupDailyCap":2,"optOutPhrase":"别拿我的话玩梗","deletePhrase":"这梗删了"},
 "jealousy":{"enabled":false,"tierA":true,"tierB":false,"defaultEnabled":false,"perGroup":{},"otherBots":[{"id":"A6902CCDF6FD63D47AC7B9A6BD44E201","name":"芙宁娜"}],"perPersonDailyCap":1,"personCooldownMin":30,"groupCooldownMin":120,"optOutPhrase":"星野别吃醋"}}
```
- 含义：顶层 `enabled` 是总开关。`killPhrase` 是“全部关掉”的口令，`killOwnerOnly=true` 表示只有凛说才算。`optOutAllPhrase` 是一句话退出全部功能。`defaultEnabled` 管 perGroup 里没列出的群。`tierA` 是被@或被回复时才吃醋，`tierB` 是主动插嘴（要等 gate 补丁）。`recallCooldownDays=7` 即每人每周最多翻一次旧账。

## `POST /api/fun/params/set`（confirm）`{params:{…部分字段…}}`
只改传进来的字段，`null` 表示删除：
- 顶层：`enabled`、`killOwnerOnly`（布尔）；`killPhrase`、`optOutAllPhrase`（1–20 字单行）。传 null 回到默认值。
- `optOut`：`{<openid>: ["all"|"grudge"|"gag"|"jealousy", …] | null}`，null 表示把这个人移出退出名单。
- `grudge` / `gag` / `jealousy`：对象只改给出的字段；**整段传 null 回到默认值（默认关闭）**。段里的某个字段传 null，这个字段回到默认值。
  - 取值范围：grudge.recallProbability 0–1，recallCooldownDays 1–365，maxEntriesPerPerson 1–200，maxQuoteChars 10–200；gag.minScore 1–50，minDistinctPeople 1–20，windowMin 1–60，cooldownDays 0–365，maxUses 1–100，perGroupDailyCap 0–50；jealousy.perPersonDailyCap 0–20，personCooldownMin、groupCooldownMin 0–1440。各口令字段 1–20 字。
  - `perGroup`：`{"group:<hex>": {enabled, …覆盖项} | null}`，enabled 必填。能覆盖的字段：grudge 是 `recallProbability, recallCooldownDays`；gag 是 `minScore, minDistinctPeople, requireApproval, perGroupDailyCap`；jealousy 是 `tierA, tierB, groupCooldownMin`。整项写入（和 v2.11 的 perConversation 一样，旧覆盖项不会保留，要留就一起带上）。
  - `jealousy.otherBots`：`[{id(32位openid), name(1–20字)}]`，最多 20 项，id 不能重复；传 null 回到默认（芙宁娜）。
- 所有口令（kill、全部退出、各功能退出、撕本本、删梗）不能重复。
- 返回 `{ok, params, backup}`。

## `GET /api/fun/grudges`
→ `{people:[{id, name, entries:[{id, group, quote, at, count}], lastRecallAt, optOut}], updatedAt}`。`optOut` 按退出名单（all 或 grudge）算出来。

## `POST /api/fun/grudges/delete`（confirm）`{person, entryId}`
删一条，删空后整个人也移除。返回 `{ok, backup}`；条目不存在返回 404。

## `POST /api/fun/grudges/clear`（confirm）`{person}` —— 撕本本
清空这个人的全部条目，返回 `{ok, removed, backup}`；本本本来就是空的返回 404。

## `GET /api/fun/gags[?group=]`
→ `{groups:[{group, items:[{id, quote, context, keywords[], score, addedAt, uses, lastUsedAt, retired, promotedToSlang}]}]}`。候选梗（`/opt/hosino-console/data/fun/gag-candidates/`）等统计任务做好以后再加接口。

## `POST /api/fun/gags/delete`（confirm）`{group, id}`
返回 `{ok, backup}`；不存在返回 404。

## `GET /api/fun/trash`
→ `{items:[{file, size, mtime}]}`，新的排在前面。恢复要后端从 `.trash/` 手动拷回，没有一键恢复。

### 补充（21:30）
- 口令判重：去掉所有空白、不区分大小写再比较，重复返回 400。
- optOut 里只要有 all，就自动收成 `["all"]`；其余去重。

---

# v2.12：拟人化参数（「拟人化」菜单）

> 消费这些参数的技能和 gate 补丁（HOSINO-FUN-CONTEXT）**还没做**。GET 返回 `consumers:false`、`note`，还有 `requires`（各取值要等什么上线才生效）。**不提供任何延迟或打字节奏类设置**（凛的硬性要求）。

存储：`~/.openclaw/workspace/fun/humanlike.json`，和 params.json 同目录，共用 `.trash/` 备份、40-fun-rw.conf 授权和鉴权方式。POST 要带 `X-HS: 1`、`confirm:true`。操作日志记为 `fun.humanlike.set`，失败也记。

## `GET /api/fun/humanlike`
→ `{params, stored, defaults, suggestions:{quirkPhrases:[3条建议]}, consumers:false, requires:{...}, note}`

## `POST /api/fun/humanlike/set`（confirm）`{params:{…部分…}}`
- 规则和 /api/fun/params/set 相同：功能段内只改传进来的字段；字段传 null 回到默认值；整段传 null 也回到默认值。
- 列表字段整条替换。每项 1–N 字单行，去重时忽略空白和大小写。
- 口令不能重复（忽略空白和大小写），也不能和小脾气的口令重复。
- 返回和 GET 一样的结构，另外加 `{ok, backup}`。
- 非法输入一律返回 400，错误信息是中文。

## `GET /api/fun/humanlike/followups`（只读）
→ `{items, updatedAt}`，读 `fun/followups.json`，文件不存在时返回空列表。数据由以后的技能脚本写入，现在为空。

## 参数表（默认值全关；技术模式默认开，因为它只负责“关掉效果”）
| 字段 | 类型/范围 | 默认 | 说明 |
|---|---|---|---|
| enabled | 布尔 | false | 总开关 |
| optOutPhrase | 1–20 字 | 别拟人 | 个人说了就退出全部拟人效果 |
| optOut | {openid: ["all"\|功能名]} | {} | 含 all 时收拢成 ["all"]；功能名取 followup/opinion/dontKnow/proactive/quirk/mood |
| perGroup | {group:hex: {enabled 必填, 功能名: 布尔}} | {} | 按群开关，可以单独关某个功能 |
| techMode.enabled | 布尔 | **true** | 聊代码、日志、报错时，所有拟人效果全关（包括分条发） |
| techMode.stickyMin | 0–240 | 10 | 最后一条技术消息后保持多少分钟 |
| techMode.keywords | ≤50 条，每条 ≤40 字 | 报错, error, Traceback, 日志, ssh, systemctl, npm, ``` | 命中任一即进入技术模式 |
| techMode.ownerPhraseOn / Off | 1–20 字 | 技术模式 / 聊天模式 | 凛强制切换用 |
| techMode.allowPersonaLine | 布尔 | true | 技术回答首尾可以带一句人设话 |
| followup.enabled | 布尔 | false | 1 追问近况 |
| followup.perPersonDailyCap | 0–5 | 1 | 每人每天最多追问几次 |
| followup.onceOnly | 布尔 | true | 每件事只追问一次 |
| followup.minWaitHours | 0–168 | 12 | 事件到期多久后才可以问 |
| followup.maxAgeDays | 1–90 | 14 | 事件超过多少天就不问了 |
| opinion.enabled | 布尔 | false | 2 有主见 |
| opinion.strength | gentle\|firm | gentle | 坚持程度 |
| opinion.yieldWhenCares | 布尔 | true | 对方真在意时让步 |
| opinion.techDisagree | 布尔 | true | 技术方案有问题时直说 |
| dontKnow.enabled | 布尔 | false | 3 老实说不知道 |
| dontKnow.maxHedgePerReply | 1–3 | 1 | 每条回复最多几个“不确定”用语 |
| dontKnow.inTechMode | 布尔 | true | 技术模式下也保留 |
| proactive.mode | off\|passive\|heartbeat | off | 6 主动搭话。启用时推荐 passive。heartbeat 要等另行批准的 heartbeat 配置改动后才生效 |
| proactive.quietThresholdMin | 10–4320 | 180 | 群里冷场多少分钟才算“冷场后” |
| proactive.triggerProbability | 0–1 | 0.2 | 冷场后有人发言时，按这个概率考虑接话，不是每条都接 |
| proactive.minIntervalMin | 10–4320 | 180 | 同一个群两次主动接话的最小间隔 |
| proactive.perGroupDailyCap | 0–10 | 2 | 每群每天上限 |
| proactive.requireReason | 布尔 | true | 没有理由（记忆、时间、兴趣、纪念日）就不接 |
| proactive.backoffAfterIgnored | 0–10 | 2 | 连续几次没人理就把频率减半（0 表示不退避） |
| proactive.quietHoursStart / End | 0–23 | 1 / 8 | 这段时间内不主动说话（两个值不能相同） |
| proactive.heartbeatIntervalMin | 10–1440 | 60 | 只在 heartbeat 模式下用 |
| quirk.enabled | 布尔 | false | 7 口癖/小瑕疵 |
| quirk.probability | 0–1 | 0.067 | 每轮由 gate 掷骰决定（约 1/15） |
| quirk.phrases | ≤10 条，每条 ≤20 字 | []（suggestions 里有 3 条建议） | 口癖表 |
| quirk.selfCorrect / trailOff | 布尔 | false / false | 用 * 自我更正 / 说一半 |
| mood.enabled | 布尔 | false | 9 察觉情绪 |
| mood.perPersonDailyCap | 0–3 | 1 | 每人每天最多关心几次 |
| mood.deviation | 0–1 | 0.6 | 偏离基线多少算异常 |
| mood.minBaselineMsgs | 5–500 | 30 | 基线至少要多少条消息才启用 |
| sensitive.mode | never\|dmOnly\|always | never | 敏感话题的追问和关心：从不 / 只在私聊 / 都可以 |
| sensitive.topics | ≤50 条，每条 ≤20 字 | 医疗, 生病, 分手, 去世, 裁员, 考试挂科 | 敏感话题列表 |

自伤信号一律走严肃处理，不受开关控制，不提供参数。

## 前端页面建议（左侧菜单「拟人化」）
1. 顶部：总开关；黄色提示 `note`（consumers:false 时显示“暂未生效”）。
2. 技术模式卡（放在最上面）：开关、保持分钟数、关键词标签编辑、两个口令。
3. 六张功能卡，顺序：追问近况 / 有主见 / 老实说不知道 / 主动搭话 / 口癖 / 察觉情绪。每张卡有开关和参数控件。
   - 主动搭话卡用三段选择（关 / 被动 / 心跳）。选“心跳”时显示 `requires["proactive.mode=heartbeat"]` 的警示，并显示间隔输入框；选“被动”时显示冷场阈值、概率、间隔、日上限、要求理由、退避和安静时段。
   - 口癖卡：标签编辑，下面一行“建议：…”，点一下加入。
4. 敏感话题卡：三选一单选，加话题标签编辑。
5. 按群开关表、退出名单（显示名字用称呼表）。
6. 数据页签：待追问事件（只读）。
保存时只提交改过的字段，`confirm:true`，把返回的 backup 用 toast 显示。不要做任何延迟类控件。

### 拟人化追加：护短（protect）、抢早安沙发（morning）（默认全关）
| 字段 | 类型/范围 | 默认 | 说明 |
|---|---|---|---|
| protect.enabled | 布尔 | false | 护短 |
| protect.roastWindowMin | 1–60 | 5 | 统计损人消息的窗口（分钟） |
| protect.roastMinHits | 1–20 | 3 | 窗口内针对同一人的损话达到几条才算“损过了” |
| protect.roastMinPeople | 1–10 | 1 | 至少几个人在损他 |
| protect.probability | 0–1 | 0.5 | 达到门槛后出手的概率 |
| protect.perGroupDailyCap / perTargetDailyCap | 0–10 / 0–5 | 2 / 1 | 每群每天上限 / 同一个被护的人每天上限 |
| protect.mediateRealFights | 布尔 | true | 命中吵架词时改为劝和，不护短 |
| protect.roastKeywords / fightKeywords | ≤50 条，每条 ≤20 字 | 菜, 笨, 丑… / 闭嘴, 有病, 拉黑… | 损话词 / 真吵架词 |
| morning.enabled | 布尔 | false | 抢早安沙发 |
| morning.mode | passive\|heartbeat | passive | heartbeat 要等另行批准的 heartbeat 配置改动，批准前按 passive 处理 |
| morning.greetingKeywords | ≤20 条 | 早, 早安, 早上好, 早啊, morning | 早安词 |
| morning.windowStartHour / windowEndHour | 0–23 / 1–24 | 5 / 11 | 早安时段（start 必须小于 end） |
| morning.habitWindowDays / habitMinDays | 3–60 / 1–60 | 14 / 4 | 近 N 天里至少有 M 天有人说早安，才算“有早安习惯”的群 |
| morning.perGroupDailyCap | 0–1 | 1 | 每群每天最多 1 次 |
| morning.heartbeatHour | 0–23 | 7 | 只在 heartbeat 模式下用 |
`perGroup` 和 `optOut` 新增可用的功能名：protect、morning。前端在「拟人化」页再加两张卡：护短卡（门槛、概率、上限、两组词表）；抢早安卡（模式单选，选 heartbeat 时显示 requires 警示；早安词、时段、习惯门槛）。

### 拟人化追加：被叫人机就破防（robotBit）、盲猜 MBTI（mbti）（默认全关）
| 字段 | 类型/范围 | 默认 | 说明 |
|---|---|---|---|
| robotBit.enabled | 布尔 | false | 被叫“人机”时破防一下 |
| robotBit.keywords | ≤30 条，每条 ≤20 字 | 人机, 机器人吧, 你是AI吧, bot吧 | 触发词 |
| robotBit.sincereKeywords | ≤30 条，每条 ≤30 字 | 你是真人吗, 说真的你是不是AI, 认真问, 你到底是不是人 | 认真问的信号：命中就**如实说自己是 AI**，不演。这条规则不受开关影响。不能和 keywords 有相同项 |
| robotBit.segmentGapMin | 5–720 | 30 | 群里沉默超过这么多分钟，就算新的一段对话；每段最多破防一次 |
| robotBit.perGroupDailyCap | 0–20 | 3 | 每群每天上限 |
| mbti.enabled | 布尔 | false | 只在有人请求时才猜 |
| mbti.includeZodiac | 布尔 | false | 是否也接受“猜星座” |
| mbti.minPublicMsgs | 0–500 | 20 | 这个人的群消息少于这个数就说“素材不够，猜不了” |
| mbti.perPersonDailyCap / perGroupDailyCap | 0–5 / 0–20 | 1 / 5 | 每人每天 / 每群每天上限 |
| mbti.forbiddenTopics | ≤30 条 | 健康, 疾病, 性取向, 宗教, 政治, 家庭, 收入 | 推断时绝不涉及的话题 |
`perGroup` 和 `optOut` 新增可用的功能名：robotBit、mbti。前端加两张卡；robotBit 卡上要固定显示一句“认真问是不是真人时一律如实回答”。

### v2.12 定稿补充（gate 补丁 HOSINO-FUN-CONTEXT v1 已在暂存区完成）
- `GET /api/fun/params` 和 `POST /api/fun/params/set` 的返回里新增 `requires`：
  - `jealousy.tierB`：B 档（主动插嘴吃醋）gate **没有实现**，只存不生效。
  - `gag`：候选统计还没做。
  - `lexicon`：候选和确认页还没做。
  - 前端在对应开关旁边显示这些说明。
- `consumers` 改为自动检测：插件目录里有 `fun-context.mjs`，并且 index.js 带 `HOSINO-FUN-CONTEXT v1` 标记时为 `true`，`note` 也会跟着变（`/api/fun/params` 和 `/api/fun/humanlike` 都是这样）。网关重启后才真正生效。
- 新增功能段 `lexicon`（黑话/称呼注入开关，默认关）：

| 字段 | 类型/范围 | 默认 | 说明 |
|---|---|---|---|
| lexicon.enabled / defaultEnabled | 布尔 | false / false | 总开关 / 没单独设置的群是否开 |
| lexicon.perGroup | {group:hex: {enabled 必填, maxSlang?, maxNames?}} | {} | 按群开关和覆盖 |
| lexicon.maxSlang / maxNames | 0–10 | 3 / 3 | 每轮最多注入几条黑话 / 称呼 |
| lexicon.includeDerogatory | 布尔 | false | 是否注入标了 derogatory 的条目 |

  `optOut` 里的元素也可以写 `lexicon`。
- 自助口令的效果（由 gate 记在 `fun/gate-state.json`，控制台暂时不显示）：
  - 有人说“别整我”、“别记我仇”、“别拿我的话玩梗”、“星野别吃醋”、“别拟人”，就记为他本人退出对应功能。
  - “撕本本”：这个人在此之前的旧账全部不再翻（不改 grudges.json）。
  - “星野正经点”（只认凛）：本群全部效果关闭 12 小时；网关重启后恢复。
