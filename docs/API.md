# 星野控制台 REST API（hosino-console）

Base: `https://hosino.ume.wiki`，后端 127.0.0.1:18890。所有响应 `application/json; charset=utf-8`，`cache-control: no-store`。

## 通用约定
- **认证**：登录后下发 Cookie `hs_sid`（HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800 即 7 天）。前端 `fetch(..., {credentials:"include"})`。
- **CSRF**：所有 `POST /api/*`（含 login/logout）必须带请求头 `X-HS: 1`，否则 `403 {"error":"拒绝跨站请求"}`。
- **错误**：`{ "error": "中文提示", "code"?: "网关错误码" }`。401=未登录；403=CSRF；404=接口不存在；429=IP 已锁定；502=网关/Qdrant 出错。
- **锁定**：同一 IP 15 分钟内失败 5 次 → 锁 15 分钟（429）。
- 缓存（服务端，无后台轮询）：overview 8s，sessions 4s，channels 8s，models/plugins/skills 60s，usage 120s，cron 15s，config 30s，memory 全量 10 分钟。send/patch 会清空缓存。

## 认证
| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | /api/me | – | `{ "authed": bool }` |
| POST | /api/login | `{ "password": string }` | 200 `{ "ok": true }` + Set-Cookie；401 `{ "error":"密码不对（还可再试 N 次）" }`；429 锁定 |
| POST | /api/logout | `{}` | `{ "ok": true }`，清 Cookie |

## 需登录接口
### GET /api/overview
```json
{ "info": {...system.info, "pid": 273038}, "health": {...}, "status": {...},
  "host": { "cpu": 12.3|null, "load": [0.1,0.2,0.3], "mem": {"total":B,"available":B,"swapTotal":B,"swapFree":B},
            "disk": {"total":B,"free":B}, "uptime": 秒 },
  "gw": { "pid": 273038, "uptimeSec": 秒, "rssBytes": B, "cpu": 百分比 } | null,
  "server": { ...网关 hello.server } }
```
QQ 状态见 `health`/`status` 中的 channels 字段，或用 /api/channels。

### GET /api/sessions?offset=0
`{ "totalCount": n, "defaults": {...}, "sessions": [ { "key","displayName","label","kind","chatType","channel","updatedAt","pinned","unread","archived","status","hasActiveRun","model","modelProvider","modelOverrideSource","agentRuntime","thinkingLevel","thinkingDefault","thinkingOptions":[...],"totalTokens","contextTokens","participantCount","isMain","sessionId","runtimeMs" } ] }`（每页 200）

### GET /api/history?key=SESSION_KEY&limit=60  (limit ≤ 200)
`{ "sessionKey": "...", "messages": [ { "role","content","ts","model","toolName","isError","owner","sender","kind" } ] }`

### POST /api/send
请求 `{ "key": "SESSION_KEY", "message": "文本", "deliver": false }` —— **deliver 默认 false**（不投递到 QQ）；只有显式 `true` 才投递。响应：网关 chat.send 原样结果。

### POST /api/abort
`{ "key": "SESSION_KEY" }` → 网关 chat.abort 结果。

### POST /api/patch
`{ "key": "SESSION_KEY", "model"?: "provider/id", "agentRuntime"?: "id", "thinkingLevel"?: "off|low|medium|high|...", "label"?: str, "pinned"?: bool, "fastMode"?: bool }` → sessions.patch 结果。

### GET /api/models
`{ "models": [ { "id","name","alias","provider","contextWindow","reasoning","tags","available","runtime","thinkingDefault" } ] }`
### GET /api/usage
网关 usage.status（已脱敏），并合并后端自查的 Claude 条目（缓存 120s）：
`{ "updatedAt": ms, "providers": [ { "provider","displayName","windows":[{"label","usedPercent","resetAt"?}],"billing"?:[{"type":"balance|budget",...}],"plan"?,"summary"?,"error"? } ] }`
Claude 条目：`{ "provider":"anthropic","displayName":"Claude","windows":[{"label":"5h",...},{"label":"Week",...}],"plan":"Pro","summary":"5h 0% · Week 69%" }`；失败时 `{ "windows":[], "error":"原因", "summary":"暂不可用" }`。
xiaomi-token-plan 条目（MiMo 控制台 Cookie，缓存 10 分钟）：`{ "provider":"xiaomi-token-plan","displayName":"Xiaomi MiMo Token Plan","windows":[{"label":"套餐总额度","usedPercent":n,"used":n,"limit":n,"resetAt"?:ms}],"plan"?,"summary":"x.xx / y.yy 亿 Credits" }`；Cookie 缺失/过期：`{ "windows":[], "error":"原因", "summary":"暂不可用（Cookie 过期，请重新粘贴）" }`。
### GET /api/channels
网关 channels.status（已脱敏，含 QQ 连接状态）。
### GET /api/plugins
`{ "plugins": [ { "id","name","description","version","origin","enabled","state","runtime" } ] }`
### GET /api/skills
网关 skills.status（已脱敏）。
### GET /api/cron
网关 cron.list（已脱敏）。
### GET /api/logs?limit=200&level=WARN
limit ≤ 500；level 可选 TRACE/DEBUG/INFO/WARN/ERROR/FATAL（返回该级别及以上）。
`{ "file": "...", "lines": [ { "t": "ISO时间", "lv": "INFO", "sub": "子系统", "msg": "≤2000字" } ] }`
### GET /api/memory?q=关键词&offset=0
只读 Qdrant 集合 mem0_full_timestamped_20260926，关键词子串匹配（不区分大小写），每页 50。
`{ "collection": "...", "points": 总点数, "total": 命中数, "items": [ { "id","data","createdAt","updatedAt","user_id","oc_visibility","oc_source_channel","oc_stated_by","oc_subject_id" } ] }`
### GET /api/config
`{ "path": "...", "config": {...所有密钥字段替换为 "••••••（已隐藏）"} }`

## 静态文件
非 /api 路径从 public/ 提供；无扩展名路径回退 index.html。

---
# v2（2026-10-20 新增，李批准第 1–5、7–11 项）

## 通用规则（v2）
- 所有写操作：`POST` + Cookie 登录 + 请求头 `X-HS: 1`。
- **危险操作必须带 `"confirm": true`**，否则 `400 {"error":"需要 confirm:true 确认"}`：删除会话、重置会话、删除定时任务、撤销授权、编辑 agent 文件。
- 写操作成功后清掉相关缓存（sessions / cron / approvals / files 等）。
- 每个写操作都记审计日志：`/opt/hosino-console/logs/ops.log`（0600，每行一个 JSON：`{t, ip, ep, target, ok, err?}`，不含任何密钥/文件内容）。
- 网关错误统一 `502 {"error":"…","code":"INVALID_REQUEST|UNAVAILABLE|…"}`。
- 标 🅦 = 写操作；未标 = 只读（GET）。

## 1. 定时任务 cron
| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | /api/cron | – | 同 v1（`{jobs:[…],total,…}`） |
| GET | /api/cron/status | – | `{enabled,triggersEnabled,storage,jobs:n,nextWakeAtMs}` |
| GET | /api/cron/get?id= | – | 完整 job：`{id,name,displayName,enabled,schedule,sessionTarget,wakeMode,payload,delivery?,state:{nextRunAtMs,lastRunAtMs,lastStatus,lastDurationMs,consecutiveErrors…},configRevision}` |
| GET | /api/cron/runs?id=&limit=20&offset=0&status= | id 省略=全部任务 | `{entries:[{ts,jobId,jobName,status,completionStatus,summary,error?,runAtMs,durationMs,deliveryStatus,sessionKey?,runId?}],total,offset,limit,hasMore,nextOffset}` |
| GET | /api/cron/history?id=&runAtMs= 或 &runId= | 二选一必填（runs 条目里有 runAtMs） | `{messages:[…],nextCursor?}`；转录不存在时 502 UNAVAILABLE |
| 🅦 POST | /api/cron/add | `{name, schedule:{kind:"every",everyMs}\|{kind:"cron",expr,tz?}\|{kind:"at",at}, sessionTarget:"main"\|"isolated", wakeMode:"next-heartbeat"\|"now", payload:{kind:"agentTurn",message}\|{kind:"systemEvent",text}, enabled?:bool, delivery?:{mode:"none"}}` | 新 job 对象（含 `deliveryPreview`）。**delivery 默认强制 `{mode:"none"}`**，除非显式给 |
| 🅦 POST | /api/cron/update | `{id, patch:{enabled?,name?,schedule?,payload?,…}}` | 更新后的 job |
| 🅦 POST | /api/cron/remove | `{id, confirm:true}` | `{ok:true,removed:true}` |
| 🅦 POST | /api/cron/run | `{id, mode?:"force"\|"if-enabled"\|"due"}`（默认 force） | `{ok, ran?, reason?}` |

## 2. 会话管理
| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| 🅦 POST | /api/sessions/create | `{label?, displayName?, model?, agentRuntime?, thinkingLevel?, agentId?}` | `{ok,key,sessionId,entry:{…}}` |
| 🅦 POST | /api/sessions/reset | `{key, confirm:true, reason?:"reset"\|"new"}` | `{ok,key,entry?}` |
| 🅦 POST | /api/sessions/compact | `{key, maxLines?}` | `{ok,key,compacted,…}` |
| 🅦 POST | /api/sessions/delete | `{key, confirm:true, deleteTranscript?:bool}` | `{ok:true,key,deleted,archived:[…]}` |

## 3. 执行审批
| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | /api/approvals | – | `{pending:[{id,command,cwd?,agentId,sessionKey,createdAtMs,expiresAtMs,…}], grants:[{grantId,agentId,cronJobId,cronJobName,command,cwd,createdAtMs,expiresAtMs,revokedAtMs,lastUsedAtMs,useCount}]}` |
| 🅦 POST | /api/approvals/resolve | `{id, decision:"allow-once"\|"allow-always"\|"deny", grantExpiresInDays?}` | 网关结果 |
| 🅦 POST | /api/approvals/revoke-grant | `{grantId, confirm:true}` | `{outcome:"revoked"\|"already-revoked"\|"not-found"}` |

## 4. 费用 usage.cost
| GET | /api/usage/cost?days=30 或 ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD | – | `{days, daily:[{date,input,output,cacheRead,cacheWrite,totalTokens,totalCost,inputCost,outputCost,cacheReadCost,cacheWriteCost,missingCostEntries}], totals:{…同字段, missingCostByModel:{"provider/model":n}}, cacheStatus}`。缓存 120s。注意：网关只给按天汇总，**没有按模型的费用拆分**（只有缺失计价的按模型计数）。 |

## 5. 模型认证
| GET | /api/models/auth | – | `{providers:[{provider,displayName,status,profiles:[{profileId,type,status,source,expiresAt?}],apiKey?:{source,envVar},usage?}],providerCapabilities:[…]}`（已脱敏）缓存 60s |
| 🅦 POST | /api/models/probe | `{provider, profileId?, timeoutMs?}` | 探测结果（会真实请求该服务商一次）|

## 7. 技能
| GET | /api/skills | – | 同 v1 |
| GET | /api/skills/detail?slug= | – | ClawHub 技能详情 `{skill:{…},owner:{…},…}` |
| ~~install / update / curator.pin~~ | – | **不开放**：见下方说明 |

## 8. QQ 配对
| GET | /api/pairing | – | `{accounts:[{channel,channelLabel,accountId,notifySupported}],requests:[{requestId,channel,accountId,senderId,senderLabel,createdAt,lastSeenAt,expiresAt}],limits:{pendingPerAccount,ttlMs}}` |
| 🅦 POST | /api/pairing/approve | `{channel, accountId, requestId}` | `{requestId,senderId,notification,commandOwnerBootstrap}`（notify 固定 false，不给对方发消息） |
| 🅦 POST | /api/pairing/dismiss | `{channel, accountId, requestId}` | `{requestId,senderId}` |

## 9. 工具 / MCP / Hooks
| GET | /api/tools?key=SESSION_KEY（默认 agent:main:main） | – | `{groups:[{id,label,source,tools:[{id,label,description,source,pluginId?,mcpServer?,risk?}]}],notices?}`（网关可能返回 UNAVAILABLE） |
| GET | /api/mcp/tools?key=SESSION_KEY&viewId=VIEW | key、viewId 必填（MCP 应用视图 id，网关要求） | MCP tools/list 结果 `{tools:[…],nextCursor?}` |
| GET | /api/mcp/resources?key=SESSION_KEY&viewId=VIEW | 同上 | `{resources:[…]}` |
| GET | /api/hooks | – | `{workspaceDir,hooks:[{name,description,source,emoji,events:[…],enabledByConfig,requirementsSatisfied,loadable,missing:{…}}]}` |

## 10. 审计与诊断
| GET | /api/audit?limit=50&cursor=&kind=&status= | – | `{events:[{sequence,eventId,occurredAt,agentId,sessionKey,runId,kind,action,status,actor:{type,id}}],nextCursor?}` |
| GET | /api/audit/activity?limit=50&cursor= | – | 同上，多 `eventType` |
| GET | /api/diagnostics/stability | – | `{generatedAt,capacity,count,events:[{seq,ts,type,source}],summary:{byType:{…},memory:{latest:{rssBytes,heapUsedBytes,…}}}}` |
| GET | /api/diagnostics/lanes | – | `{ts,lanes:[{lane,queuedCount,activeCount,maxConcurrent,draining,blockedBy}],workerCount,workerPoolCount,workerPools:[{poolId,script,workerCount}]}` |
| GET | /api/ops-log?limit=200 | – | 本控制台的操作审计 `{lines:[{t,ip,ep,target,ok,err?}]}`（最新在前） |

## 11. Agent 文件
| GET | /api/agent-files?agentId=main | – | `{agentId,workspace,files:[{name,path,missing,size,updatedAtMs}]}` |
| GET | /api/agent-files/get?agentId=main&name=AGENTS.md | – | `{agentId,file:{name,path,size,updatedAtMs,content,hash?}}` |
| 🅦 POST | /api/agent-files/set | `{agentId, name, content, confirm:true}` | `{ok:true,file:{…},backup:"/opt/hosino-console/backups/main__AGENTS.md__20261020T151800.md"}`。写前先经网关读出旧内容存备份（文件名时间为 UTC），并用 expectedHash 防并发覆盖。name 只能是网关列出的文件（AGENTS.md / SOUL.md / USER.md / MEMORY.md 等），其他名字网关返回 unsupported file |

## 不开放的项目
- **skills.install / skills.update**：update 的配置路径调用 `mutateConfigFileWithRetry` 直接改 openclaw.json（等同 config 写，触发配置重载）；install 从 ClawHub 下载并安装第三方技能代码。按规则不开放。
- **skills.curator.pin/unpin/restore**：网关里已退役（`respondRetiredSkillCuratorAction`，调用只返回错误）。

## v2 实测备注（15:25 UTC+8）
- `/api/tools`：网关当前返回 `UNAVAILABLE`（"Tool inventory display temporarily unavailable…"），前端需显示友好提示。
- `/api/pairing`：qqbot 不在配对渠道里（accounts、requests 为空；对 qqbot 调用会报 unknown pairing channel），页面应显示"暂无配对请求"。
- `/api/models/probe`：后端给网关传 timeoutMs≤30000（默认 20000）；对 deepseek 实测约 34 秒返回 `{provider,status:"ok",latencyMs,results:[{profileId,label,status,latencyMs}]}`，属于慢操作，前端要显示加载中。
- `/api/ops-log`：返回最新在前。

---
# v2.1（2026-10-20 15:35 UTC+8）

## 媒体预览 GET /api/media
- 需要登录（Cookie）。两种用法：
  - `GET /api/media?path=<绝对路径>`：只允许 `/home/ubuntu/.openclaw/media/` 内的文件（服务端 realpath 解析，`..`、符号链接逃逸、目录外路径一律 403）。支持 `Range`（视频/音频拖动，返回 206）。
  - `GET /api/media?url=<https URL>`：只允许已在历史中出现过的主机（当前仅 `qqbot.ugcimg.cn`），不跟随重定向，≤20MB。
- 响应头：`Cache-Control: private, max-age=3600`、`X-Content-Type-Options: nosniff`、`Content-Security-Policy: default-src 'none'; sandbox`。图片（jpeg/png/gif/webp/bmp）、音频、视频为 `inline`；其他（txt/md/zip/pdf/html…）一律 `attachment`，html/svg 等按 `application/octet-stream` 下载，不会在页面里执行。
- 错误：400（参数）、401、403（目录外/域名不允许）、404、413、502。

### 媒体在 chat.history 里长什么样（实测）
历史消息里**没有专门的 media 类型 part**（全部 part 类型只有 text / toolCall / toolcall / tool_result / toolResult / thinking），媒体都以**本地绝对路径写在文本里**：
1. 用户发来的图片/视频等（QQ 入站）：`role:"user"` 的 text 里有一段
   `- Attachment origins (host metadata; …): {"path":"/home/ubuntu/.openclaw/media/qqbot/downloads/<HASH>---<uuid>.jpg","senderId":"…","messageId":"…"}`
2. 机器人发出的文件：assistant 的 `toolCall`/`toolcall` 参数 `{"action":"send","target":"qqbot:group:…","media":"/home/ubuntu/.openclaw/media/qq-text-files/…/xxx.txt"}`，以及工具结果里的 `"mediaPath"` / `"mediaUrl"` / `"mediaUrls":[…]`。
3. 生成图片：`/home/ubuntu/.openclaw/media/tool-image-generation/…png`。
4. 远程图：偶见 `https://qqbot.ugcimg.cn/…`。

媒体目录：`qqbot/downloads`（入站，jpg/png/gif/mp4/mp3…）、`qq-text-files`、`tool-image-generation`、`outbound`、`inbound`、`qq-sticker-cache`、`controlled-jobs`。

### 前端映射规则
对每条消息的所有文本（text part 的 `text`、toolCall 的 `arguments` JSON、tool_result 的 content）做正则：
```js
const LOCAL = /\/home\/ubuntu\/\.openclaw\/media\/[^\s"'\\)\]]+\.(jpe?g|png|gif|webp|bmp|mp4|webm|mov|mp3|wav|ogg|m4a|amr|txt|md|pdf|zip)/gi;
const REMOTE = /https:\/\/qqbot\.ugcimg\.cn\/[^\s"'\\)\]]+/gi;
const src = m => m.startsWith("http") ? `/api/media?url=${encodeURIComponent(m)}` : `/api/media?path=${encodeURIComponent(m)}`;
```
去重后按扩展名渲染：图片 `<img loading=lazy>`，mp4/webm/mov `<video controls preload=metadata>`，音频 `<audio controls>`（`.amr/.silk` 浏览器多半不能播，显示下载链接），其他显示文件名 + 下载链接。注意 JSON 字符串里的路径可能带转义，先 `JSON.parse` 或把 `\\/` 还原再匹配。

## 功能开关 GET /api/features
`{ "qqSend": true|false, "mediaProxy": true, "mediaRemoteHosts": ["qqbot.ugcimg.cn"] }`。`qqSend` 来自服务端 `/etc/hosino-console.env` 的 `QQ_SEND_ENABLED`（当前已开）。前端每条消息的"发到 QQ"开关**默认关**，仅当 `qqSend:true` 时显示。

## 🅦 POST /api/qq/send（以机器人「星野のねこ」身份直发）
请求：`{ "sessionKey": "agent:main:qqbot:group:b4ee…", "text": "…", "confirm": true }` 或 `{ "target": "qqbot:group:<ID>" | "qqbot:c2c:<openid>", "text": "…", "confirm": true }`
- 走网关 `send` 方法（`{to, channel:"qqbot", accountId, message, sessionKey?, idempotencyKey}`），**直接由机器人发出，不触发 agent 回合**；带 sessionKey 时，投递目标取该会话的 `deliveryContext.to`，发出的内容会镜像进该会话记录。
- ⚠️ 注意：`agent:main:main` 这类主会话的 `deliveryContext` 也指向 QQ（凛（李）的 QQ 私聊 `qqbot:c2c:…`），同样会真实发出。前端发送前务必展示解析出的目标。
- 响应：`{ "runId", "messageId": "ROBOT1.0_…", "channel": "qqbot" }`
- 错误：403 功能未开启；400 缺 confirm / 缺 text / text>4000 / 缺目标 / target 格式不对 / 会话不存在 / 非 QQ 会话；502 网关失败。
- 每次调用写 ops.log：`{ep:"qq.send", target:"<to> len=<字数>", ok, err?}`，不记正文。
- 另一种方式（未实现为直发）：`POST /api/send` 带 `deliver:true` = `chat.send`，会让 agent 处理这条消息并把 **agent 的回复**发到 QQ，不是原文直发。

---
# v2.2 会话别名（2026-10-20 15:38 UTC+8）
别名存在控制台自己的文件 `/opt/hosino-console/data/aliases.json`（0600，先写临时文件再原子改名，覆盖前备份为 `aliases.json.bak`），**不写网关**。键可以是完整 sessionKey，也可以是 QQ 的 32 位 openid/群 id（小写，自动从 sessionKey 末尾解析）；sessionKey 键优先。

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | /api/aliases | – | `{ "aliases": { "<sessionKey 或 32位id>": "别名" } }` |
| 🅦 POST | /api/aliases/set | `{ "key": "...", "alias": "凛" }`；`alias` 为空串 = 清除；≤40 字 | `{ "ok": true, "key", "alias": "凛" \| null }`（写 ops.log：key 与别名字数） |

`GET /api/sessions?offset=0&q=关键词` 的每条会话新增：
- `alias`：别名或 null
- `displayName`：`alias || QQ id（32 位）|| 网关 displayName || key`
- `gatewayDisplayName`：网关原始 displayName（如 `qqbot:g-b4ee…`）
- `q`：按 alias / displayName / label / key 不区分大小写子串过滤

预置：`4330bbc5…` = 凛、`249bdb14…` = 春、`7fe244b1…` = 离（c2c 和 direct 会话都会匹配）。群名：QQ 官方机器人接口和网关都不提供群名称（会话里只有 openid），所以群默认显示 id，需要手动设别名。

## v2.3 — 聊天记录：工具调用链 + 投递标注（2026-10-20）

`GET /api/history?key=<sessionKey>&limit=<≤200>` 返回：
```json
{ "sessionKey": "...", "channel": "qqbot" | null, "sendLogFrom": "2026-10-19" | null,
  "hasMore": bool, "totalMessages": n,
  "messages": [ {
    "id": "...", "role": "user|assistant|system|custom", "turnId": "t12",
    "content": "string | [{type:'text',text}, ...]",   // assistant 的工具块已移出，只剩 text/image 等
    "ts": ms, "model": "...", "provider": "...", "owner": bool, "sender": "...", "senderName": "...", "kind": "reset|run-failed-before-reply|...",
    "tools": [ {                                         // 仅 assistant；按出现顺序
      "id": "call_…", "name": "exec | mcp__openclaw__stay_silent | ...",
      "args":   { "text": "...", "truncated": bool, "length": n },   // 2048 字符截断，已脱敏
      "result": { "text": "...", "truncated": bool, "length": n, "gatewayTruncated"?: true } | null,  // 4096 截断，已脱敏
      "isError": bool, "status": "ok|error|pending", "durationMs": n | null } ],
    "delivery": "sent" | "silent" | "unknown" | null,   // null = 无文本（纯工具调用）；user/system 消息无此字段
    "deliveryReason": "见下表", "deliveryConfidence": "high|medium|low"
  } ] }
```
独立的 `toolResult` 消息和 user 里的 `tool_result` 块不再单独返回，已合并进对应调用的 `result`。

| deliveryReason | delivery | 置信 | 规则 |
|---|---|---|---|
| delivery-mirror | sent | high | 网关投递镜像（model=delivery-mirror，如 message 工具 / send 方法真实发出） |
| mirror-unconfirmed | unknown | low | 镜像写明 "delivery was not confirmed" |
| no-channel | silent | high | 会话不绑定 QQ（控制台/内部/测试会话） |
| silent-token | silent | high | 文本为 NO_REPLY / HEARTBEAT_OK / "No response requested." |
| stay_silent | silent | high | 本轮调用了 stay_silent；网关 followup-gate 会丢弃其后的回复（日志 "drop payload after stay_silent"） |
| keepalive | silent | high | 本轮由 "Cache keepalive only" 保活提示触发 |
| run-failed | silent | high | custom run-failed-before-reply |
| non-channel-trigger | unknown | low | 本轮不是 QQ 消息触发（恢复/中断提示等） |
| intermediate-text | unknown | low | 本轮非最后一段文本（可能作为早段发出，也可能没发） |
| qq-send-ok | sent | high | 群聊：网关日志有该轮 qq-send-ok（日志仅保留约 2 天，见 sendLogFrom） |
| no-send-ok-log | unknown | low | 日志里有该轮但没有 qq-send-ok |
| final-reply-inferred | sent | medium | QQ 触发轮次的最终文本，无日志可证（私聊没有 qq-send-ok 日志；群聊超出日志期） |

## v2.4 — 发言人 / 翻页 / 个人档案 / 全文搜索 / 会话分组（2026-10-20）
所有 POST 照旧要 `X-HS: 1`；写操作记 ops.log（只记 id 和长度，不记内容）。档案和分组只存控制台 `/opt/hosino-console/data/*.json`（600，原子写 + `.bak`），**不写网关、不写 USER.md、不进她的上下文**。不调用任何网关写方法。

### GET /api/history?key=&limit=&before=（变更）
- `limit` 1–200，默认 60。`before` = 消息 `id` 或 `index`（整数）；返回该条**之前**的 `limit` 条。无效 before → 400。
- 网关 `chat.history` 的 schema 有 `cursor/offset/limit`，但实测（只读，2026-10-20）它对 limit 5 / offset 5 / limit 1000 都返回同样的整窗口（如 476 条/共 650 条，不返回 nextCursor），所以后端一次取整窗口（limit:1000，缓存 3 秒）后在本地切片。**上限**：最多到网关窗口最旧那条（网关条目上限 1000 条、单条 128KB，另有字节预算）；更早的看不到，此时 `hasMore` 由 `gatewayHasMore` 决定、`nextBefore` 为 null。
- 新增字段：
```json
{ "...v2.3 字段": "...",
  "messages": [{ "id":"u299", "index":897, "role":"user",
     "sender": {"id":"4330BBC5…","name":"凛","source":"alias"},   // 仅 user 消息；无 senderId 时为 null
     "senderId":"4330BBC5…", "senderName":null, "...": "..." }],
  "windowCount": 900,        // 网关窗口内（工具结果合并后）的消息总数
  "gatewayHasMore": false,
  "hasMore": true,           // start>0 || gatewayHasMore
  "nextBefore": "b298" }     // 下一页传给 before；没有更早则 null
```
- `sender.source`：`gateway`（网关 senderName）| `alias`（无名字时用别名，32 位十六进制 openid 不分大小写）| `null`（都没有，name=null）。v2.3 的 `sender` 字符串字段改为上面的对象，原 id 移到 `senderId`。

### 个人档案（键 = QQ openid 小写 32 位十六进制）
- `GET /api/profiles` → `{profiles:[{id, name|null, note, updatedAt, alias|null, lastSeenName|null}]}`（按 updatedAt 倒序；lastSeenName 为本进程最近在聊天记录中见到的网关名字，重启清空）
- `GET /api/profiles/:id` → `{id, profile:{name,note,updatedAt}|null, alias, lastSeenName}`
- 🅦 `POST /api/profiles/set {id, name?, note?}` → `{ok, id, profile}`；name ≤40 字，note ≤4000 字符；name 和 note 都为空 → 删除，返回 `{ok, id, deleted:true|false}`。id 非 32 位十六进制 → 400。

### GET /api/search?q=&limit=&sessionKey=
包装网关 `sessions.search`（FTS5）。q 必填 ≤4096；limit 1–25（默认 10，超出截到 25）；sessionKey 可选（只搜该会话）。
```json
{ "truncated": true,
  "results": [{ "sessionKey":"agent:main:main","sessionId":"…","messageId":"…","role":"assistant",
                "timestamp":1791456034422,"snippet":"整条消息文本","score":7.37,
                "alias":"凛","displayName":"凛","groupId":"g_1a2b3c4d"|null }] }
```

### 会话分组
- `GET /api/groups` → `{groups:[{id:"g_xxxxxxxx", name, sessionKeys:[…], order, createdAt, updatedAt}]}`（按 order 升序）
- 🅦 `POST /api/groups/set {id?, name, sessionKeys[], order?}` → `{ok, group}`。无 id 新建（最多 50 组，order 默认排最后）；有 id 则整体替换 name/sessionKeys。name ≤40 字；sessionKeys ≤500 项、每项 ≤300 字符；**一个会话只属于一个组**：放进本组的 key 会自动从其他组移除。
- 🅦 `POST /api/groups/delete {id, confirm:true}` → `{ok, id}`；缺 confirm → 400，不存在 → 404。
- `GET /api/sessions` 每项新增 `groupId`（未分组为 null）。

## v2.4 补充：GET /api/vpn（只读，缓存 30s）
返回：
```
{ services:[{name,active,state,sub,since,sinceMs}],   // openclaw-xray-reality / openclaw-wireguard-la / openclaw-wireguard-phone
  listening:["tcp:8443","udp:51820","udp:51821"],
  wireguard:{ interfaces:[{name,listenPort,peers:[{pub6,endpoint(已打码),allowedIpsCount,latestHandshake(unix秒),rxBytes,txBytes,online,handshakeAgoSec}]}],
              onlinePeers, totalPeers } | null,          // online = 握手 <180s
  xray:{active,since,port:8443,connections,note:"连接数含探测/回落，不等于用户数"},
  error: string|null,   // 部分失败时其余字段照常返回
  ts }
```
数据来源：`sudo -n /usr/local/sbin/hosino-wg-status`（5s 超时）、`systemctl show`、`ss`。无写操作。

### VPN 补充 v2.5（Xray 详细 / WG 只显示在线）
`GET /api/vpn` 新增字段（旧字段保留）：
- `xray`: `{active, since, port, connections, sub, uptimeSec, restarts, memoryBytes, cpuSec, uniqueClients, listening, version, config:{protocol, port, network, security, serverNames[], target, clients, flows[], shortIdCount, outbounds[], routingRules, logLevel, statsApi}, note}`。没有流量统计：Xray 没开 stats API，日志也是 none。uniqueClients 是不同来源 IP 的数量，不会返回 IP 本身。
- `wg`: `[{name:"wg-la", unit, port:51820, online, peerOnline}, {name:"wg-phone", port:51821, ...}]`。前端只显示在线/离线；`online` 表示服务和接口都在，`peerOnline` 表示 180 秒内有握手。

## v2.6（2026-10-20）

所有 POST 接口都要带 `X-HS: 1`。标了 confirm 的接口，请求体里还要带 `confirm:true`，否则返回 400。下面的接口都不会往 QQ 发任何消息。

### 线路状态
- `GET /api/link`：线路状态，返回内容跟 `GET /api/vpn` 完全一样（字段见上一节），旧路径暂时保留。前端以后请改用 `/api/link`，界面文字统一写“线路状态”。

### 每日群报
- 每天到点自动生成，不需要手动按钮。默认时间 22:00（Asia/Singapore）。**每个会话默认关闭**，只有打开的会话才生成。
- 数据来源：当天的 chat.history，只取群友消息和她实际发出的回复；再加上 workspace/memory/ 下当天的小结（只读）。
- 生成方式：先用本机 `openclaw infer model run --local` 写文字总结，再用 `openclaw infer image generate`（模型 openai/gpt-6-luna）配一张图。这两步都是一次性调用，不经过任何会话，也不投递。
- 生成结果放在 data/digests/：`<id>.json` 和 `<id>.png`，权限 600。
- 控制台在当天时间点之后启动的话，会补跑当天的群报；每个会话每天只跑一次。
- `GET /api/digest/settings` → `{enabled, time:"HH:MM", timeZone, imageModel, sessions:[{sessionKey, name, kind:"group"|"other", enabled, lastRunDay}]}`
- `POST /api/digest/settings/set`（confirm），请求体 `{sessionKey?, enabled?, time?, globalEnabled?, confirm:true}`：
  - 传 sessionKey 时必须同时传 enabled（布尔值）。
  - time 格式是 HH:MM。
  - globalEnabled 是总开关。
  - 设置存在 data/digest-settings.json（600，原子写，另留 .bak）。
- `GET /api/digests?key=&limit=` → `{digests:[{id, sessionKey, name, day, status, messageCount, image, usage, startedAt, finishedAt, durationMs, errors, preview}], total}`
  - status 取值：`running | ok | partial | empty | error`。partial 表示文字成功、图失败。
- `GET /api/digests/get?id=` → 完整记录，包括 `text`、`imagePrompt`、`usage:{text, image}`（CLI 返回了用量就记，没返回就是 null）、`textModel`、`imageModel`、`notesUsed`。
- `GET /api/digests/image?id=`：返回 PNG，需要登录。
- `POST /api/digests/run-now`（confirm），请求体 `{sessionKey}`：只对已开启的会话有效，立即在后台生成当天群报，用于验收测试。会消耗额度。

### 星野日记
- `GET /api/diary` → `{agentId, found, path, content(markdown), updatedAtMs}`。只读，缓存 60 秒。

### 互动统计（不叫好感度）
- `GET /api/interactions` → `{groups:[…]}`，列出所有 QQ 群会话。
- `GET /api/interactions?key=<sessionKey>` → 单个会话：`{sessionKey, name, windowFrom, windowCount, note, people:[{id, name, alias, messages, replies, silences, unknown, lastAt}]}`
  - 只统计网关返回的最近一个历史窗口。
  - 回复和静默按“轮”计，归给触发这一轮的人。

### 表情库
- `GET /api/stickers` → `{since, lastScan, items:[{file, emotion, source, size, mtime, uses, byVia, lastUsed}], ranking:[…], note}`
  - 排行从 since（上线那一刻）开始累计，每 10 分钟扫描一次。
  - byVia 取值：tool（她用工具发的）/ tag（回复里的 &&分类&& 标签）/ lurk（插件潜水表情）。
- `GET /api/stickers/image?file=<文件名>`：返回表情原图，文件名必须在列表里。

### 主动行为参数（只读）
- `GET /api/behavior` → `{heartbeat, lastHeartbeat, mediaTags, followupGate:{enabled, keepalive, lurkSticker}, groupNames, readOnly:true}`
  - 敏感字段显示为“已设置/未设置”。

## v2.7（2026-10-20）表情库管理

需要先部署 `hosino-console.service.d/20-stickers-rw.conf`（`ReadWritePaths=/home/ubuntu/.openclaw/workspace/stickers`），否则下面的写接口都会报 “read-only file system”。所有 POST 都要带 `X-HS: 1`；标了 confirm 的要在 body 里带 `confirm:true`（导入是 `?confirm=1`）。图片写进库后，群聊里 5–30 秒内生效，不用重载插件。

- `POST /api/stickers/import?category=<分类>&confirm=1`：请求体是**原始图片字节**（`Content-Type` 随意，不要 JSON，不要 multipart）。
  - 限制：≤5MB；按文件头字节识别 png / jpg / webp / gif；按 sha256 去重。
  - 重复时返回 409，`{error:"和已有表情重复：<file>", code:"DUPLICATE"}`。
  - 自动命名 `<分类>-手动入库[<n>].<ext>`，n 从 2 开始，不会覆盖已有文件。
  - 分类名：1–16 个中文、字母或数字，不能有 `-`。
  - 返回 `{ok, file, category, sha256, size, format, newCategory}`，新分类会自动写进 manifest。
  - nginx 目前请求体上限是 256k，**要等 nginx 补丁生效后才能传超过 256k 的图**，补丁只放宽这一条路径。
- `POST /api/stickers/rename`（confirm）`{file, category}`：把一张图换到另一个分类。
  - 手动入库的图按规则重新编号；生成的图保留模型后缀，重名时加 `-v<n>`。
  - 原图先复制到 `.trash/<时间>-rename-<原名>`，然后再改名，manifest 同步更新。
  - 返回 `{ok, from, to, backup}`。
- `POST /api/stickers/delete`（confirm）`{file}`：把图移进 `.trash/<时间>-deleted-<原名>`，不会真删。返回 `{ok, movedTo}`。
- `GET /api/stickers/trash` → `{items:[{file, size, mtime}]}`
- `GET /api/stickers/params` → `{params, genToday:{day, count, cap, enabled}}`
- `POST /api/stickers/params/set`（confirm）`{params:{…部分字段…}}`，只改传进来的字段：

  | 字段 | 说明 |
  | --- | --- |
  | `enabled` | 布尔，总开关 |
  | `attachProbability` | 0–1，每轮配表情的概率 |
  | `cooldownReplies` | 整数，冷却回复数 |
  | `quietHours` | `{start, end, tz}`，或 `null` 表示不设静默时段 |
  | `defaultEnabled` | 布尔，没单独设置的会话默认开不开 |
  | `sessions` | `{"group:<32位小写hex>": {enabled, probability?}}`；某个会话传 `null` 表示删除这条设置 |
  | `genEnabled` | 布尔，是否允许自动生图 |
  | `genDailyCap` | 整数，每天最多生成几张 |

  写之前会把旧的 params.json 备份到 `.trash/`。私聊键 `c2c:<openid>` 可以存，但群聊标签补丁目前不支持私聊，存了也不生效。
- `GET /api/stickers/manifest` → `{manifest:{version, updatedAt, look, style, categories:{<分类>:{desc, scene, synonyms[], enabled}}, files:{<文件>:{category, sha256, size, source, addedAt, renamedFrom?}}}, genToday}`
- `POST /api/stickers/manifest/set`（confirm）`{look?, style?, categories?:{<分类>: {desc?, scene?, synonyms?, enabled?} | null}}`：
  - `look` 是星野外观，`style` 是表情包画风，生图时会用这两段。`look` 最长 2000 字，`style` 最长 1000 字。
  - `desc` 和 `scene` 最长 40 字（`scene` 会显示在群聊提示里）。`synonyms` 最多 40 个，每个不超过 16 字。
  - 分类传 `null` 是删除，但这个分类下必须已经没有图片。
  - 修改前会备份到 `.trash/`。
- `POST /api/stickers/generate` `{category}`：**不需要 confirm**（李的要求），只要 X-HS。
  - 后台运行 `sticker_manager.py get <分类> --new`，按 manifest 的 look 和 style 画一张新的，库里已有这个分类也会再画。
  - 新图命名 `<分类>-<模型>[-v<n>].png`，并自动登记进 manifest。
  - 受 `genEnabled` 和 `genDailyCap` 限制，当天的计数跟群聊自动生图共用 `.gen-state.json`。同一时间只跑一张。
  - 返回 `{ok, jobId, genToday}`。
  - 错误码：关闭时 403；超过每日上限 429；已经有一张在生成 409。
- `GET /api/stickers/generate/status?id=` → `{id, category, status:"running"|"ok"|"error", file?, model?, error?, durationMs}`。不带 id 时返回最近的任务列表。任务记录只保存在内存里，控制台一重启就没了。
- `GET /api/stickers` 和 `/api/stickers/image` 跟以前一样。列表会跳过 `.` 开头的文件（manifest、params、`.trash`、临时文件）。

## v2.8 记忆管理 (Qdrant mem0)
All routes need a login. POST also needs the `X-HS: 1` header and `"confirm": true` in the body. Vectors are never returned.
- `GET /api/mem/subjects` → `{collection, subjects:[{key,type(person|group|name|unknown),name,count,lastAt,flagged,raw:{user_id[],source_session_key[],source_openid_or_peer[]}}]}`. Different spellings are merged via aliases.json. `raw` shows the original values. Cached for 5 minutes.
- `GET /api/mem/list?subject=<key>&q=&flagged=1&offset=0&limit=50` → `{subject,name,total,offset,items:[memory]}`. memory = payload without textLemmatized, plus `id` and `flag`.
- `GET /api/mem/get?id=` → memory + `subjects[]`
- `GET /api/mem/files` / `GET /api/mem/file?file=rel/path.md`: read-only access to workspace/memory.
- `GET /api/mem/flags`; `POST /api/mem/flag {id, wrong?:true|false, note}`: only marks the memory as wrong in the console. It does not change Qdrant.
- `POST /api/mem/delete {id, reason, dryRun?}`: backs up first to data/memory-backup/<col>__<id>.json (600, sha256 verified on re-read, includes the vector + affected _entities), then deletes the point and removes the id from the entities' linkedMemoryIds. dryRun → `{ok,dryRun:true,id,backup,backupExists,entities,backupBytes,vectorDims}` (backup/backupExists added in v2.8.1, not deployed yet). Result: `{ok,id,backup,sha256,entitiesUpdated,prunedBackups}`. Recall has a 30s cache, so the change takes effect after that.
- `POST /api/mem/restore {file}`: upserts the original id/vector/payload without re-embedding and adds the id back to the entities. Returns 400 if the point still exists.
- `GET /api/mem/backups` → `{retention:{days:90,maxFiles:500},backups:[{file,id,backedUpAt,restoredAt,reason,entities,preview,user_id,source_session_key}]}`. Backups older than 90 days, or beyond the newest 500, are pruned on each delete.

## v2.8.2 Memory attribution fix (not deployed yet)
- The mem0 plugin's configured `userId` (read at runtime from `plugins.entries["openclaw-mem0"].config.userId`; falls back to `凛`) is the **name of the shared store bucket**, not a person. Points whose `user_id` equals this value are no longer counted under the person 凛.
- A bare `user_id` is no longer mapped to a person through aliases. `peer:<openid>` / `peer:group:<id>` are still recognised as before.
- Attribution order: session/source fields (`source_session_key` / `source_openid_or_peer`) give the group and DM partner. A non-bucket `user_id` gives the speaker. Only when there is still no person, the `[name (OPENID)]` at the start of the text is used to infer one. If nothing matches, the point goes to `unattributed` (未归属（共享库）).
- `GET /api/mem/subjects` adds top-level `bucket` (e.g. "凛"). Each subject adds `attr:{user_id,source,prefix,group,none}`, the count for each attribution method. New subject key: `unattributed` (name "未归属（共享库）").
- `GET /api/mem/list` items and `GET /api/mem/get` add:
  - `subjects[]`
  - `attrSrc`: `user_id|source|prefix|group|none`, how the person was determined (`group` = only the group is known, `none` = unattributed)
  - `attrInferred` (true when the attribution was inferred from the text prefix; please mark it as "推断" in the UI)
  - `inferredName` (prefix-inferred only, the name in the text; may be absent)
- `GET /api/mem/list?subject=unattributed` lists the unattributed points.

## v2.9 原生 CLI（Claude Code / Codex / Gemini CLI）

无 OpenClaw 记忆、无人设、无 mem0：每个会话是一个全新的 CLI 会话，工作目录 `/home/ubuntu/cli-sandbox/<id>`，**完整权限**（以 ubuntu 运行，可执行命令/写文件/免密 sudo）。需登录（同其他接口）；POST/DELETE 必须带 `x-hs: 1`。同时只允许 1 个运行（`CLI_MAX_RUNS`），单次默认 10 分钟超时（`CLI_TIMEOUT_MS`），prompt 最长 32000 字。审计日志：`logs/cli-audit.log`（时间/IP/工具/prompt/退出码）。

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/api/cli/tools` (`?refresh=1` 跳过 60s 缓存) | – | `[{id:'claude'\|'codex'\|'gemini', name, version, available, authed, reason}]` |
| GET | `/api/cli/sessions` | – | `[{id, tool, title, createdAt, updatedAt, running}]`（按 updatedAt 倒序） |
| POST | `/api/cli/sessions` | `{tool, title?}` | 新会话对象（title 默认“新会话”，首次运行后自动取 prompt 前 40 字） |
| GET | `/api/cli/sessions/:id` | – | `{session, messages:[{role:'user'\|'assistant'\|'tool'\|'error', text, ts, name?, input?, output?}]}` |
| DELETE | `/api/cli/sessions/:id` | – | `{ok:true}`（若在运行会先终止；只删会话记录，不删工作目录） |
| POST | `/api/cli/sessions/:id/run` | `{prompt}` | `text/event-stream`（见下） |
| POST | `/api/cli/sessions/:id/cancel` | – | `{ok:true}`；没在运行 → 409 |

`:id` 为 16 位小写十六进制。

### run 的 SSE 流
用 `fetch` + `ReadableStream` 读取（EventSource 不支持 POST）。每个事件 `event: <名>\ndata: <JSON>\n\n`，另有 `: ping` 注释行每 15 秒一次（忽略即可）。

- `start` `{sessionId, runId, tool, ts}`
- `delta` `{text}` —— 助手文字（Claude/Codex 按消息块整段给出，Gemini 为增量），按顺序拼接
- `tool` `{name, input, output}` —— 一次工具调用完成（input 可能是对象或字符串；output 最多 20000 字）
- `error` `{message}` —— 运行中的错误，或结束时的“已取消”/“超时…已终止”/“退出码 N：stderr 尾部”；可出现多次，不代表流已结束
- `done` `{exitCode, durationMs, reason?}` —— 一定是最后一个事件；`reason` 为 `cancelled`/`timeout`，被杀时 `exitCode` 为 null

浏览器断开不会终止运行，结果照样写进会话记录（`GET /api/cli/sessions/:id` 时 `running:true` 表示还在跑）。

### 错误（run 开始前，普通 JSON `{error, code?}`）
- 400 缺少 prompt / tool 不合法；413 prompt 过长；404 会话不存在
- 409 `这个会话正在运行`；409 `code:"not_authed"`（该 CLI 未登录，error 为原因）；409 未安装
- 429 已有其他会话在运行
- 403 缺 `x-hs`；401 未登录

### 当前状态（2026-10-20）
- claude：可用（2.1.293，已登录，默认模型 claude-sonnet-5-5）
- codex：已安装 0.163.0，**未登录**（authed:false）
- gemini：0.63.0，authed:false，Google 拒绝免费版个人 OAuth（IneligibleTierError）

## v2.9.1 变更（在 v2.9 之上，以本节为准）

- **新工具 `antigravity`**（name `Antigravity`，`/home/ubuntu/.local/bin/agy` 1.4.3）。用 `--conversation <conversation_id>` 续接会话。单次超时默认 **15 分钟**（`CLI_TIMEOUT_AGY_MS`），其余工具仍是 10 分钟。
- **`GET /api/cli/tools`**：每项都多了 `models:[{id,name}]`。只有 antigravity 有内容（来自 `agy models`，缓存 10 分钟），并带 `defaultModel:"gemini-3.8-flash-medium"`（可用 `AGY_DEFAULT_MODEL` 改）。其他工具 `models:[]`。
- **`POST /api/cli/sessions {tool, model?, title?}`**
  - antigravity 的 model 必须在 models 里，否则 400；不填就用 defaultModel。
  - 其他工具的 model 原样传给 `--model`/`-m`，不校验。
  - 会话对象多了 `model`（字符串或 null）。
  - 工具不可用时返回 409 `code:"not_installed"`。
- **gemini**：`available:false, authed:false`，reason 写明“Google 已于 2026-06-18 停止个人账号登录”。创建会话和运行都返回 409 `not_installed`。
- **权限**
  - `/api/cli/*` 未登录时返回 **403 `{error, code:"forbidden"}`**，不是 401。
  - 现有接口 **`GET /api/me`** 现在返回 `{authed, isOwner}`。单密码登录，登录即主人，所以 isOwner === authed。
- **错误码**
  - 409 `not_installed`：可执行文件不存在，或工具不可用（gemini）。
  - 409 `not_authed`：工具已安装但未登录（codex）。
  - 409：本会话正在运行（无 code）。
  - 429：其他会话正在运行。
- **DELETE `/api/cli/sessions/:id`**：忽略请求体，`?confirm=1` 可带可不带。删除正在运行的会话会先终止进程，之后不会再写回记录。
- **取消和超时**：只发 `done {exitCode:null, durationMs, reason:"cancelled"|"timeout"}`，**不发 `error` 事件**，历史里也不写 error 消息。只有非零退出、CLI 自己报错时才有 `error`。
- **tool**：SSE 的 `tool` 事件和历史里 `role:"tool"` 的消息都一定带 `name, input, output` 三个字段，类型都是**字符串**（可能为空串）。对象类型的 input 会被转成 JSON 字符串。历史里的 tool 消息另有 `text`（`name: input\noutput`）。
- **Antigravity 事件映射**
  - `init.conversation_id` → 续接 id
  - `step_update.text_delta`（agent_response）→ `delta`
  - `step_type:"tool"` 且 `state:"DONE"` → `tool`（`tool_name`, `tool_info.parameters`, `tool_info.output`）
  - `result.status` 不是 `SUCCESS` → `error`
  - 最后照常发 `done`
- **速度说明**：agy 本身启动约 3 秒。Gemini 3.8 Flash 每次模型调用的服务端延迟在 20–125 秒之间波动，effort low 和 `--disable-slash-commands` 都没有改善。gpt-oss-120b-medium 约 1–6 秒。

## v2.10 文件 / 图片发送（聊天页 + 原生 CLI 页）

流程：先把文件**逐个上传**拿到 `id`，再在发送请求里用 `attachments:[id,…]` 引用（每条消息最多 10 个）。上传时请求体就是文件本身的原始字节，不用 multipart，也不用 base64 JSON。所有接口都要登录；POST 和 DELETE 必须带 `x-hs: 1`。

### `POST /api/uploads?scope=chat|cli&session=<…>&name=<文件名，URL 编码>`
- 请求体：文件原始字节，`content-type: application/octet-stream`（也可以填真实类型，服务端会忽略）。
- `scope=chat` 时，`session` 填聊天会话 key，必须和之后 `/api/send` 的 `key` 一致。`scope=cli` 时，`session` 填 CLI 会话 id。
- 返回 `{id, name, mime, kind:'image'|'file', size, url:'/api/uploads/<id>', createdAt}`。
  - `mime` 和 `kind` 按文件内容判断，不看扩展名。图片只识别 png、jpg、gif、webp。其他常见类型（pdf、zip、docx 等 Office 文件、gzip、音频、mp4、文本）给出对应 mime，其余为 `application/octet-stream`。
  - `name` 会去掉路径、控制字符和 `"'\`$<>|:*?\\`，最长 100 字。
- 错误：400（scope 或 session 不对、空文件）；404（CLI 会话不存在）；413 `code:"too_large"`（超过 20MB，可用 `UPLOAD_MAX_BYTES` 调整）；403（缺 `x-hs`）；401（未登录）。
- 文件存放在 `data/uploads/<id>/`，30 天后自动清理（`UPLOAD_TTL_DAYS`）。删除 CLI 会话时，它的上传会一起删掉。

### `GET /api/uploads/:id`（`?download=1` 强制下载）
需要登录 cookie，可以直接用在 `<img src>`（同源、带 cookie）上。图片 inline 显示；其他类型按现有媒体规则返回，非安全类型强制下载，带 `nosniff` 和 sandbox CSP。不单独生成缩略图，前端用 CSS 缩放即可，图片本身不超过 20MB，聊天里不超过 6MB。

### `DELETE /api/uploads/:id` → `{ok:true}`

### `GET /api/uploads/limits`
返回 `{maxBytes, maxPerMessage, ttlDays, chat:{maxBytes, maxImageBytes, maxPayload, fromGateway}, cli:{maxBytes, claudeInlineImageMax}}`。`chat` 部分取自网关握手时给出的 `policy`，目前 maxImageBytes 是 6MB，单帧上限 25MiB，按 base64 计算。前端可以先用它在本地做校验。

### 聊天页：`POST /api/send {key, message?, deliver?, attachments?:[uploadId]}`
- 有附件时 `message` 可以为空。
- 附件走网关原生方式，随 `chat.send` 的 `attachments` 一起发送：`[{type:'image'|'file', mimeType, fileName, origin:'file', sizeBytes, content:<base64>}]`。
  - 图片直接给模型看。模型不支持图片时，网关会自动转存。
  - 其他文件由网关存进媒体库，并在消息末尾附上 `[media attached: …]` 交给 agent。
- 网关单张图片上限 6MB，单个文件上限约 18.6MB（mediaMaxMb）。所有附件 base64 编码后合计必须小于 25MiB，超了返回 413。附件属于别的会话时返回 403。
- 返回值是网关的确认 `{runId, status, …}`，再加上 `attachments:[上传对象]`。
- **历史**：`GET /api/history` 里，凡是控制台带附件发出的用户消息，会多一个 `attachments:[上传对象]` 字段。网关历史本身不带附件信息，这是控制台按会话、时间和文本合并回去的。过期的附件显示为 `{id, expired:true}`。

### 原生 CLI 页：`POST /api/cli/sessions/:id/run {prompt, attachments?:[uploadId]}`
- 上传必须是 `scope=cli`，而且属于这个会话，否则返回 403。
- 运行前，文件会被复制到 `/home/ubuntu/cli-sandbox/<id>/uploads/<id前6位>-<name>`。prompt 末尾会自动附上路径清单：“[用户上传的附件，已放在当前工作目录下] - uploads/…（mime，字节）”。
- 各工具的处理：
  - **Claude**：不超过 5MB 的图片通过 `--input-format stream-json` 以 base64 图片块直接给模型（实测识别出红色）。其他文件给路径，Claude 用 Read 工具读取。
  - **Codex**：每张图片加一个 `--image=<路径>`；其他文件给路径。Codex 尚未登录，这条没有实测。
  - **Antigravity**：没有图片参数，全部给路径，agy 用 `read_file` 或看图工具读取（实测读出了文本）。
- 历史里的 user 消息会多一个 `attachments:[{…上传对象, path:'uploads/…'}]` 字段。审计日志会记录附件的 id、名字、大小和类型。

## v2.10.1 变更（在 v2.10 之上）

- **CLI 运行可以只发附件**：`attachments` 不为空时，`prompt` 可以是空串。后端会用默认文字“请看看我上传的附件。”，历史里的 user 消息也存这句。
- **附件数量上限**：CLI 运行和聊天发送一样，每条最多 10 个附件（`limits.maxPerMessage`），超过返回 400 `code:"too_many_attachments"`。
- **上传过期**
  - 从没随消息发出去的上传，24 小时后过期（`UPLOAD_TTL_UNATTACHED_HOURS`）。
  - 已发出的上传从发出那一刻起保留 30 天。
  - 上传对象多了 `attachedAt`（时间戳或 null）和 `expiresAt`。
  - 引用已过期的上传返回 404。
- **QQ 直发**：`/api/qq/send` 不支持附件。只要带了非空的 `attachments`，就返回 400 `{code:"attachments_unsupported"}`，而且不会发出任何东西。
- **历史里附件的合并**（`GET /api/history`）：用户消息现在会带网关给的 `idempotencyKey` 和 `runId`。实测网关已提交的用户消息上，`idempotencyKey = "<我们发出的 idempotencyKey>:user"`，`runId = 我们的 idempotencyKey`。合并分三步：
  1. **按稳定 id**：用 `runId`，或去掉 `:user` 后缀的 idempotencyKey，对上控制台发送时记下的 idempotencyKey。这是正常情况，不会混淆两条相同的文字。
  2. **兜底**：只用于没有 idempotencyKey 的消息（比如旧数据）。要求文本完全相同、时间差不超过 5 秒、取时间最接近的那条，一对一，每条记录只用一次。
  3. **排队合并**：智能体忙时，网关会把排队的几条消息合并成一条 `followup-collect:` 用户消息，这条消息的 id 和原来的对不上。这时会把“文本出现在合并消息里、并且在它之前 120 秒内发出”的未匹配记录的附件全部挂到这条合并消息上。
  - **残留风险**：第 2、3 步是启发式匹配。5 秒内连发两条文字完全相同、又都没有 id 的消息，或者排队期间连发同样的文字时，附件可能挂到相邻那条上。附件不会丢，只是可能放错位置。正常带 id 的消息不受影响。


<!-- v2.11 voice (deployed 2026-10-20 20:21 SGT) -->
## v2.11 语音参数（HOSINO-VOICE-PARAMS v1）——和表情包共用参数面板

接口沿用 v2.7 表情包的那两个，只是多了 `voice` 段。

### `GET /api/stickers/params`
返回 `{params, genToday, voiceToday, voiceDefaults}`。
- `params.voice` 不存在时，表示还是旧行为（模型自己决定发不发语音），面板可以显示「未启用代码控制」，并提供一个「启用」按钮（写入 `voiceDefaults`）。
- `voiceToday`：`{configured:false}`，或 `{configured:true, day:"2026-10-21", tz, limit, perConversation:{"group:<hex>":{count, lastVoiceAt, repliesSinceVoice}}}`。这些计数来自 qqbot 的 `media-tag-state.json`，只读，网关补丁生效后才会出现 `count`。

### `POST /api/stickers/params/set`（confirm）`{params:{voice:{…部分字段…}}}`
只改传进来的字段，没传的保留原值（原值缺失时用默认值）。传 `voice:null` 会删除整段，回到旧行为。

| 字段 | 类型 / 范围 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | bool | true | 语音总开关（只管群聊 `<语音>` 标签） |
| `probability` | 0–1 | 0.12 | 每轮掷中就要求发一句语音 |
| `cooldownReplies` | 0–100 整数 | 4 | 发完语音后至少隔几条回复 |
| `tz` | 时区字符串 | Asia/Singapore | 静默时段和每日计数用这个时区 |
| `quietHours` | `[{start,end}]`，最多 6 段，HH:MM；可跨零点；`null` 表示清空 | `[{00:00,08:00}]` | 和表情包不同：表情包是单个对象，语音是数组 |
| `defaultEnabled` | bool | false | 不在列表里的群默认开不开 |
| `perConversation` | `{"group:<32位小写hex>": {enabled, probability?} \| null}` | 两个群开启 | 传 `null` 删除这一项；私聊键（c2c）会 400（第二期） |
| `maxChars` | 1–200 整数 | 40 | 台词上限，超过就改发文字 |
| `dailyLimit` | 0–1000 整数 | 20 | 每个群每天最多几条，0 表示不限 |
| `exclusiveWithSticker` | bool | true | true：同一轮不会既要语音又要表情包（语音先掷，掷中这轮就不发表情包）；false：两边各掷各的，但发送时仍然每条最多 1 个媒体 |

- 非法值返回 400，带中文报错。写入前旧的 params.json 照样备份进 `.trash/`。返回 `{ok, params, voiceToday}`。
- 改完 5 秒内生效（插件按 mtime 读文件），不用重启。
- 速度参考：表情包 25%、语音 12%、冷却 4 时，大约 8% 的回复会带语音，每 12 条左右一条，再受每日上限限制。

## v2.11.1
- The sticker generate endpoint now runs sticker_manager with ~/.npm-global/bin on PATH, so the OpenAI image models can be found again.
- A successful job now includes `fallbackFrom`: the model refs that failed before the one that worked. It is omitted when the first model succeeded.
