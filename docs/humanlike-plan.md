# 拟人化（凛选的 6 项 + 技术模式）只读方案
2026-10-20 21:30 左右（UTC+8）。全程只读：主机上只读了 gate 源码、openclaw.json、workspace 目录。没改文件，没重启，没部署，也没碰 mem0/嵌入模型配置。

## 编号对照（凛的编号对应 research.md 里的小节）
凛的 1 追问近况 = 文档 §1；2 有主见 = §6；3 老实说不知道 = §7；6 有理由才主动搭话 = §2；7 小瑕疵和口癖 = §5；9 察觉情绪变化 = §8。另外 §0 技术模式是前提。§4 分条发已经上线，不动。
**硬性约束：不加任何打字延迟或作息延迟**（research §3/§4 里的延迟部分全部不做）。

## 主机实测事实
- gate 在 `plugins/qq-group-followup-gate/index.js`，共 603 行。
  - `isAddressed()` 在 :82。
  - 两个按 mtime 缓存读参数的先例：`rd()` 在 :214（HOSINO-STICKER-PATCH，读 stickers/params.json），:226（HOSINO-VOICE-PARAMS）。
  - `before_prompt_build` 在 :530–563，会拼 `appendContext`（每轮变化）；两个稳定包装群另外返回 `appendSystemContext`（:559）。
  - :532 写着 heartbeat 轮直接 return，所以群 heartbeat 拿不到任何提示。
  - `message_sending` 在 :584。
- mem0：`openclaw-mem0` 的 `autoRecall:true`，`autoCapture:true`，`topK:3`。每个用户轮已经自动把 recall 结果注入上下文。
- heartbeat：openclaw.json 里有 `heartbeat.every: "25m"`，但 `workspace/HEARTBEAT.md` 只有注释，所以**现在实际上不会发起 heartbeat 调用**。
- `workspace/fun/` 还不存在（v2.12 部署后才建）。workspace/skills 目前有 7 个技能。

## 各项归属
| 项 | 只靠技能/AGENTS.md？ | 要改 gate？ | 说明 |
|---|---|---|---|
| 0 技术模式 | 不够可靠 | **要** | 在 gate 的 `before_prompt_build`（:530 后面）用关键词或正则判断本轮和最近几条消息（代码块、Traceback、error、ssh、日志格式、路径、命令），再加上凛的显式触发。命中后设 `techUntil[sk]=now+10min`，并在 appendContext 写“技术模式：拟人效果全关，回答完整准确，最多首尾各一句人设话”。下面所有项都先查这个标记。分条发（§4）在技术模式下也要关：如果它的代码在 gate 里，就顺手读同一个标记。 |
| 2 有主见 | **是** | 否 | 新技能 `humanlike-voice`，加 `fun/opinions.json`（20–30 条口味观点）。技术方面就是“基于证据直说方案有问题”。只谈口味话题，不碰政治、宗教、真实人物。 |
| 3 老实说不知道 | **是** | 否 | 写进同一个技能：mem0 召回不确定时说“我记得…但不太确定”；不知道的事实就承认，并主动提出去查。每条回复最多一个含糊词。技术模式下也开着（这是有益的）。 |
| 7 口癖/小瑕疵 | 规则放技能，**概率要在 gate 里掷** | 建议要 | 光靠模型自觉，频率控制不住。gate 每轮按 `quirk.probability`（默认 1/15）掷骰，命中才在 appendContext 写“本轮可用一个口癖：…”。口癖表从 humanlike.json 读。技术模式下不掷骰。 |
| 1 追问近况 | 技能负责写事件 | **要**（或者改走控制台定时器） | 要用 heartbeat 才能主动问，但群 heartbeat 在 :532 被跳过，而且 HEARTBEAT.md 是空的。推荐做法：技能看到“带日期的未来事件”时，调用 `fun_followup.py add` 写进 `fun/followups.json`（脚本里执行上限）。gate 在**这个人下次发言的用户轮**里检查有没有到期事件，满足每人每天最多 1 次、技术模式关闭、话题不敏感，就注入一行“可顺口问：他周四面试”。**不另起主动发消息**，所以不增加 API 调用。 |
| 9 察觉情绪 | 判断交给模型 | **要**（基线要有代码） | gate 的 `before_dispatch` 已经能看到每条消息，可以在内存里加 `fun/mood-baseline.json` 做每人滚动基线（平均字数、表情率），按 mtime 落盘。偏离超过阈值，并且每人每天不到 1 次，就注入“他今天话很少，可轻声关心一句，不追问”。自伤信号走严肃处理，不受上限限制。 |
| 6 有理由才主动搭话 | 技能写理由规则 | **要**，并且要解决“谁来触发” | 现在没有可用的主动通道（heartbeat 被跳过，HEARTBEAT.md 为空）。可选做法：(a) 打开群 heartbeat 并改 :532，代价是每 25 分钟一次 API 调用，还要动 heartbeat 配置，**需要凛批准**；(b) 只做“被动版”：有人说话、群里冷场超过 N 小时时，gate 允许她带理由多说一句。推荐先上 (b)，并在 gate 里执行每群每天 ≤2 条、被忽略 2 次后频率减半。QQ 主动私信的 API 限制【未核实】。 |

## 1 和 9 怎么只读 mem0
- 不新增 mem0 调用，也不订阅会话消息事件。直接用现有 autoRecall（topK 3），它每个用户轮已经注入了召回结果。技能只要求模型“只在召回内容里明确有日期事件或情绪背景时才用”。
- 事件追踪（followups.json）和情绪基线（mood-baseline.json）是**新的 fun/ 文件**，不写进 mem0。基线只用 gate 已经拿到的 `before_dispatch` 事件做计数，存聚合数字，不存原文。
- 不改 autoRecall/autoCapture/topK，也不碰嵌入模型。

## 「拟人化」控制台菜单（21:30 凛决定：所有选择都做成可调，全部默认关）
已暂存（未部署）：`staging/fun/patched/server.mjs` 新增了 `GET /api/fun/humanlike`、`POST /api/fun/humanlike/set`、`GET /api/fun/humanlike/followups`（只读）。存储在 `fun/humanlike.json`。测试 `node test/console-fun.mjs patched/server.mjs` 全部通过。完整参数表和页面结构见 `staging/fun/API-v2.12-fun.md` 的“拟人化参数”一节。要点：
- 主动搭话：`proactive.mode` 取 off、passive 或 heartbeat，默认 off，启用时推荐 passive。
  - heartbeat 要等**另行批准**的 heartbeat 配置改动才生效，GET 的 `requires` 里写了这一点。
  - 被动模式的防刷屏参数：`quietThresholdMin` 180、`triggerProbability` 0.2（不是冷场后每条消息都接）、`minIntervalMin` 180、`perGroupDailyCap` 2、`requireReason` true（没有理由就不接）、`backoffAfterIgnored` 2，安静时段 1–8 点，`heartbeatIntervalMin` 60。
- 敏感话题：`sensitive.mode` 取 never、dmOnly 或 always，默认 never；话题列表可编辑。
- 口癖：`quirk.phrases` 默认为空，GET 的 `suggestions.quirkPhrases` 给 3 条建议；`probability` 默认 0.067。
- 技术模式默认开：它只负责关掉效果，总开关关着时它本身也不起作用。
- 追问的“等待时长”改名为 `minWaitHours`，避免和延迟混淆。**没有任何延迟类字段**。
- 口令去重时忽略空白和大小写，也不能和小脾气的口令重复。
- 按群开关、个人退出名单（含 all 时收拢成 all）的写法和 fun/params 一致。
- 被否决的插件调研想法（内心戏、丢弃过时回复等）不在本方案里。

## 能不能合并重启
- **网关：可以一次重启（约 62 秒 QQ 离线）**。技术模式、口癖掷骰、追问注入、情绪基线、被动搭话，和 v2.12 的黑话词典、称呼表、回旋镖、吃醋 (b)，全都是在 `before_prompt_build`/`before_dispatch` 里“读 fun/*.json，往 appendContext 加几行”。可以写成一个补丁（例如 `HOSINO-FUN-CONTEXT v1`），一次登记进 canonical-manifest。
  - 前提一：所有项都要同时开发完成，任何一项拖期，就要么等它，要么再重启一次。
  - 前提二：和 toolcat 补丁分开验证。
  - 注意：两个稳定包装群的 `appendSystemContext` 必须保持不变，新内容只能放 appendContext，否则会破坏缓存/进程复用（参考 prompt-tools drift 的教训）。
- **控制台：可以一次重启**。v2.12 的 fun 后端已经暂存，加上 humanlike 端点，再部署 40-fun-rw.conf，一次 daemon-reload + 重启。重启会把所有人登出。
- 技能（humanlike-voice、fun_followup.py）是放文件，不用重启。是否下一轮就生效【watcher 未核实】，AGENTS.md 也【未核实】，所以不靠改 AGENTS.md 生效。
- 默认值全部关闭，上线后在控制台里逐项打开。

## 风险
- 每轮 appendContext 变长：token 增加，延迟略增。所以每轮最多注入 1 行拟人提示，和其他 fun 项共享“每轮 ≤2 行”的预算。
- 技术模式误判（漏判会让技术回答也“拟人”）：凛可以用口令强制切换，关键词可以在控制台调。
- 情绪关心显得越界：默认关闭，每人每天最多 1 次，不追问。
- 主动搭话 (a) 会增加 API 费用和打扰：先做 (b)。
- 两个 bot（芙宁娜）互相触发：isBot 的发言人不参与基线和触发。
- gate 补丁出错会影响所有群：补丁整体包 try/catch，出错就不注入。

## 测试计划
1. 本地单元测试：技术模式正则（代码块、报错、普通闲聊）、掷骰频率（模拟 1000 轮约等于 6.7%）、上限和冷却、mtime 刷新。
2. 主机 `node --check`，`reapply_all.sh --check`，`installed-check`。
3. 用一次性会话（deliver:false）验证 appendContext 的内容。（注意一次性会话不是 QQ 上下文，群相关的判断要靠单元测试。）
4. 重启后看日志：每轮新增的 `[hosino-fun]` 行（是否技术模式、注入了什么），确认 toolcat 的复用不受影响（reuse=reusable 比例不下降）。
5. 由凛在群里实测：先只开技术模式 + 不知道，再逐项打开。

## 要凛决定的
- 已定：全部做成控制台可调（见上）。heartbeat 模式是否真正打开，要另行批准 heartbeat 配置改动。
- 是否和 v2.12 等齐后一次重启。
