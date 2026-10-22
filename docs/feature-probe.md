# hosino 控制台：4 个候选功能的只读探测（2026-10-20 UTC+8）

只调用了读方法：users.list、users.listChannelIdentities、users.personalFile.get、users.mentionable、sessions.search、sessions.groups.list、sessions.groups.defaults、chat.history。临时脚本带方法白名单，用完已删除（服务器 /tmp 和本地均已删）。没调用任何写方法，网关和 nginx 都没动。写方法的行为是只读翻 /home/ubuntu/.npm-global/lib/node_modules/openclaw/dist 源码得出的。下文 id 只保留前 6 位。

## 1. QQ openid 对应到人（显示群里谁说的话）
- `users.list` → `{profiles:[{id:"gateway-owner",displayName:null,emails:[],githubIdentity:null,hasAvatar:false,...}]}`，只有共享 owner 一个账号。
- `users.listChannelIdentities {profileId:"gateway-owner"}` → INVALID_REQUEST "the shared owner profile cannot be merged; sign in with a personal identity instead"。缺 profileId 时直接报 required。
- `users.mentionable` → FORBIDDEN "Human mentions require a verified user profile"。
- **可用的数据源是 `chat.history`**。群聊里每条 user 消息都带：
```json
{"role":"user","content":"[芙宁娜 (A6902C…)] 文本…","timestamp":…,
 "__openclaw":{"senderIsOwner":false,"senderId":"A6902C…","senderName":"芙宁娜",
   "senderIdentity":{"type":"observation","id":"A6902C…","pluginId":"qqbot","accountId":"default","senderKind":"unknown"},
   "transport":{"channel":"qqbot","conversationRef":"conv_…","messageId":"ROBOT1.0_…","replyToId":"…"}}}
```
- content 前缀有时只有 id、没有名字，例如 `[4330BB…] @芙宁娜`。这时 senderName 可能为空，需要用别名兜底。
- 结论：**可行，而且不需要 users.\***。后端从 `__openclaw.senderId/senderName` 取发言人，再叠加控制台自己的 aliases.json（例如 openid 4330BB… → 凛，7FE244… → 离/"吃饭"），每个 openid 记住最近一次出现的 senderName。这是纯读操作，不写网关。users.* 这套是多用户网关的账号体系，这台是单用户网关，用不上。

## 2. 个人档案 users.personalFile.get / set
- `get {agentId:"main"}` → FORBIDDEN "Personal instructions are only available on multi-user Gateways. Use the agent workspace USER.md on a single-user Gateway."
- 源码（users-personal-file.ts）：读写的是 agent 工作区下的 `users/<profileId>/USER.md`，上限 4000 字符，set 需要带 expectedHash（乐观锁），写入走 enqueueWorkspaceFileUpdate，不触发配置重载或重启。这个文件是"个人指令"，**会进入对应用户回合的 prompt**。只对已登录的个人 profile 开放，而这台只有 gateway-owner。
- 结论：**这台网关不可用**。要做"每个人的档案"，只能由控制台自己存（类似 aliases.json），不进她的上下文；或者编辑现有的工作区 USER.md（已有的智能体文件功能，会进上下文）。

## 6. 跨会话全文搜索 sessions.search
- 参数：`query`(1–4096 字) 必填；`limit` 1–25，默认 10；`agentId` 或 `sessionKeys`（最多 200 个，只能属于同一个 agent）；也可以用 `scope`（sessions.list 的过滤器：activeMinutes、label、group、archived、search 等），但 scope 不能和 agentId/sessionKeys 同时用。
- 返回：
```json
{"results":[{"sessionKey":"agent:main:qqbot:group:379363…","sessionId":"7d6531…","messageId":"…",
  "role":"user|assistant","timestamp":1791642881088,"snippet":"[吃饭 (7FE244…)] 凛！！！","score":5.46}],
 "truncated":true}
```
- 实现：SQLite FTS5（表 session_transcript_fts，库 ~/.openclaw/state/openclaw.sqlite），bm25 打分，user 和 assistant 消息都会搜。中文单字"的"、"凛"和英文"zako"都能命中。
- 性能：全量搜索 30–63ms，限定单会话 25ms。
- snippet 是整条消息的文本，没有高亮位置。
- 结论：**可行，直接接**。点结果后用 sessionKey 打开会话，再按 messageId/timestamp 定位到消息。

## 7. 会话分组 sessions.groups.*
- `list` → `{groups:[],sectionOrder:[]}`，`defaults` → `{defaults:[]}`，目前一个分组都没有。
- 存储：SQLite 的 session_groups 表，侧边栏顺序存在 state 键 `sidebar.sectionOrder`（openclaw.sqlite）。**不写 openclaw.json，不触发配置重载或重启**，写完只广播 `sessions.changed {reason:"groups"}`。
- put/rename/delete 只改组织结构。`update` 可以给分组设置默认 `cwd`/`worktree`，会影响该组**新建会话**的工作目录，有副作用，不建议在控制台开放。
- 是否进上下文：没发现分组名被拼进 prompt 的代码路径，它是给 Control UI 侧边栏用的元数据。但这一点没有逐个文件确认，只能算较可靠的推断。
- 结论：**可行**。只开放 list/put/rename/delete，不开放 update(cwd)。另一种做法是像别名一样存在控制台自己的文件里，零风险。不过分组数据写进网关的 sqlite，算是"写 ~/.openclaw 下的状态"，要不要这样做需要凛拍板。
