# 黑话词典（slang dictionary）只读评估

2026-10-20 17:30（UTC+8）。只做了只读操作：读了 gate 插件源码、控制台 systemd 单元、workspace/memory 目录大小，以及 qqbot 的 ref-index.jsonl 消息统计。主机上没写任何东西，没重载或重启网关，没调用模型，没碰嵌入模型。

## 1. 候选词从哪里来

### 数据量（实测）
- `~/.openclaw/qqbot/data/default/ref-index.jsonl`（5906 行，3.1 MB）里每条消息都有 senderId、content、timestamp、scope。这是逐条原文，比 chat.history 更全，适合做统计。注意它的 key 是消息引用，没有群 id 字段；按群统计要用 chat.history 的 sessionKey，或者看 ref-index 里有没有群字段，开工时再确认。
- 群消息量（近 10 天）：每天 23～694 条，正文 1.6k～25k 字，大多数日子 3k～15k 字。
- `workspace/memory/`：24 个文件，共 78 KB（约 3 KB 一篇），是会话小结，已经被模型“提炼”过，口语梗多半被改写掉了。适合补充含义，不适合做词频统计。
- chat.history：控制台已经在用，可以按 sessionKey 区分群。

### 中文分词（主机现状）
- 没装 jieba 和 pkuseg。
- Node 自带 `Intl.Segmenter('zh', {granularity:'word'})` 可用，零依赖，就在控制台进程里跑，但对新词或梗词的切分偏碎。
- **建议不依赖分词**，直接做 n-gram（2～6 字）统计：
  - 当天频次与过去 14 天基线对比，算出“新词分数”。
  - 加左右邻字熵（判断词的边界），去停用词。
  - 保留 `@昵称`、`#xx`、重复出现的表情符号串和英文缩写。
  - Intl.Segmenter 只用来过滤“整段都是常用词”的候选。
- 想要更准，可以 `pip install jieba`（约 20 MB），但这是主机变更，需要批准，收益也不大。

### 额度对比
| 做法 | 额度 | 质量 |
|---|---|---|
| A 纯本地统计 | 0 | 只能给出“词 + 频次 + 例句（原文抽 1～2 句）”，含义留空，由 李 在控制台填写 |
| B 每天跟群报一起，让模型批量写含义 | 只把 top 20 候选和每个候选 2～3 句例句交给模型：输入约 1.5k～3k token，输出约 1k token。每群每天 ≤ 4k token，两个群 ≤ 8k | 含义、例句都有，李 只需要确认 |
| C 把全天原文交给模型抽词 | 每群每天输入 4k～20k token（按 1 字 ≈ 0.8 token 估算，最高约 25k 字） | 最全，但贵 5 倍左右，而且群报本身已经读过一遍原文，重复了 |

说明：`openclaw infer model run --local`（openai/gpt-6-luna）不返回 usage，以上都是按字数估算的。可以把 B 合并进群报的同一次调用，在提示词里多要一个 JSON 字段 `slang_candidates`，几乎不额外增加输入，只多约 0.5k～1k 输出 token。这是最省的做法，但群报只在“开了群报的群”里跑。

**建议：本地统计出候选（A），再在群报那次调用里顺带让模型补含义（B 的合并版）；没开群报的群只用 A。**

## 2. 确认后怎么让她知道

gate 的现状（`plugins/qq-group-followup-gate/index.js`，570 行）：
- `before_prompt_build` 钩子每轮都会拼 `appendContext`（在 stableWrapper 模式下还有 `appendSystemContext`）。
- 已有的先例：表情包的 `mediaHint` 每轮读文件，用 mtime 缓存（第 218 行的 `rd()`），文件内容变了，下一轮就会生效。

### a. 每群一个词典文件，由 gate 注入相关的几条（推荐）
- 文件：`workspace/slang/<groupId>.json`（只放已确认的词条）。
- gate 增加一段 `slangHint(sk, event)`：
  - 用 mtime 缓存读该群的文件。
  - 只匹配本轮消息（和最近几条）里出现的词，最多 5 条，每条不超过 40 字，例如：`群内用语：xx=…；yy=…`。
  - 没命中就不注入。
- 上下文影响：命中时约 50～200 token，没命中是 0。要放进 `appendContext`（每轮变化的部分），不能放进 `appendSystemContext`，否则会破坏提示缓存。
- 生效时间：改 gate 代码要**重启网关一次**（已知插件不能热重载：MEDIA_JOB_MANAGER_ALREADY_REGISTERED，需要 李 批准，QQ 会短暂断开）。之后每次确认词条，下一轮就生效，不用再重载。
- 可以和下一次必需的 gate 改动合并，一起重启。

### b. 写进 Qdrant 记忆
- 每条都要做一次嵌入（千帆 qwen3-embedding-8b），消耗额度；还会和个人记忆混在一起，召回不稳定，命中不了就等于没写。
- 上下文影响：取决于召回，不可控。生效：写入后立刻生效，不用重载。
- 删除和改正要走 v2.8 记忆的那一套。**不推荐**，而且离“嵌入模型”太近。

### c. 写进技能文件（skills/xxx/SKILL.md）
- 技能目录是不是每轮都整篇注入，要看技能的加载方式：通常只注入名称和描述，正文要模型主动去读。主动读就要等模型“想到去查”，梗词往往想不到；如果是全文注入，就会把所有群的所有词条都放进上下文，词条越多越贵。
- 生效时间：技能列表可能有缓存，或者要新开会话才生效（开工前需要再核实）。
- 适合放“词典的用法说明”，不适合放词条本身。

| 方案 | 上下文 | 生效 | 重载 |
|---|---|---|---|
| a 文件 + gate 按需注入 | 0～200 token/轮 | 确认后下一轮 | 只在第一次改 gate 时重启网关一次 |
| b Qdrant | 不可控 | 立即 | 不需要，但每条都要嵌入（额度） |
| c 技能文件 | 全量或依赖模型主动读 | 不确定 | 可能需要新会话 |

## 3. 存储和权限

- 控制台单元：`ProtectSystem=strict`、`ReadOnlyPaths=/`，可写的只有 `/opt/hosino-console/{logs,backups,data}`。另外有一个 drop-in `10-gateway-logs.conf`（绑定 /tmp/openclaw 只读）。之前的摘要里说 /home 实际可写，那是另一个已知问题，不能依赖。
  - 注：这次 `systemctl cat` 里**没看到** `ReadWritePaths=…/workspace/stickers`，表情包导入走的是什么路径，建议顺便核对一下。
- 候选词：放 `/opt/hosino-console/data/slang/candidates/<groupId>.json`（600 权限），不需要新的权限。
- 已确认的词条：gate 运行在网关进程里（ubuntu 用户），能读 /opt 下的文件。有两种做法：
  1. **gate 直接读** `/opt/hosino-console/data/slang/confirmed/<groupId>.json`。控制台不需要新的可写目录，也不在 ~/.openclaw 下写东西（推荐，符合硬规则）。前提：data 目录是 600 权限、属主 ubuntu，而网关也是 ubuntu 用户，所以能读。
  2. 放进 `workspace/slang/`：需要给控制台加 `ReadWritePaths=/home/ubuntu/.openclaw/workspace/slang`，而且是在 ~/.openclaw 下写，要单独批准。
- 统计任务跑在控制台进程里，和群报的定时器一起，只读 chat.history 和 ref-index。

## 4. 隐私

- 外号经常指向具体的人（比如 gate 里已经写死的“离/小离（群名片吃饭）”）。外号类词条应该标 `type: nickname`，并带上 `targetId`（QQ openid），这样 星野 才不会把外号安到错的人头上。
- 建议：
  - 外号类候选**默认不自动采集**，只在控制台手动添加，或者等 李 勾选“允许外号候选”。
  - 外号类词条只注入到那个人所在的群；涉及贬义或敏感内容的，确认页要有提醒。
  - **不和互动统计、个人档案自动关联**。档案页只显示“该人有 N 个已确认外号”的只读链接。
  - 例句只保存一句，并且去掉其他发言人的 ID。
  - 候选 30 天没确认就自动删除。

## 推荐方案和工作量

推荐：**本地 n-gram 统计 + 群报调用里顺带补含义 → 控制台确认 → 已确认词条存在 /opt/hosino-console/data/slang/ → gate 按命中注入（方案 a）**。

| 部分 | 工作量 |
|---|---|
| 控制台后端（统计、候选、确认、API） | 约 0.5～1 天 |
| 群报提示词加字段 | 约 1 小时 |
| 前端页面 | 约 0.5 天（前端设计师） |
| gate 补丁（slangHint、mtime 缓存、匹配） | 约 2 小时，加一次网关重启（需要 李 批准，可以和别的 gate 改动合并） |

额度：每群每天约 +1k 输出 token（只在开了群报的群里）；不开就是 0。
