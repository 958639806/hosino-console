# 控制台 API 增量（2026.11.4）

原有接口见 [docs/API.md](docs/API.md)。以下记录新增接口及更新后的约定。

通用规则：
- 除登录和会话状态接口外，所有 /api/* 都要登录，没登录返回 401。
- POST 必须带 `x-hs: 1`，否则返回 **403 `{code:"missing_xhs"}`**。
- 每个 403 都带各自的 code：`missing_xhs`、`not_whitelisted`、`plugin_protected`、`forbidden`。
- 错误统一返回 `{error, code, ...额外字段}`。

## 1. 记忆搜索（直查 Qdrant，只读）
embedding 配置从 openclaw.json 的 `plugins.entries.openclaw-mem0.config.oss.embedder.config` 现读，只读不写。

### POST /api/memory/search
```json
{ "q": "必填，trim 后 1-500 字（也接受 query；两个都给且不一样时返回 400）",
  "scope": "all | users（默认 all）",
  "user_ids": ["scope=users 时必填，1-50 个，^[\\w:.@-]{1,128}$，自动去重；scope=all 时不能带"],
  "limit": 10, "minScore": 0,
  "visibility": "private | group（可选；private 表示 oc_visibility≠group，没有标记的旧记忆也算 private）",
  "since": "ISO（可选，createdAt >= since）" }
```
- limit 是 1-50 的整数，默认 10
- minScore 范围 0-1，默认 0。大于 0 时会作为 score_threshold 传给 Qdrant
- 返回 200：`{ results:[{id,score,memory,user_id,createdAt,visibility,channel}], count, scope, tookMs:{embed,search}, cached }`
  - 命中缓存时 tookMs.embed 约为 0
- 向 Qdrant 发 `POST /collections/{MEMCOL}/points/query`，参数 `with_vector:false`；scope=users 时用 `match:{any:user_ids}`

### GET /api/memory/users
`{ users:[{user_id,count}], count }`，数据来自 Qdrant 的 user_id facet（exact，最多 1000 个），控制台缓存 60 秒。

### 限流与错误
- 限流按登录会话计（用 hs_sid 的哈希当 key），每 60 秒 30 次。超出返回 **429** `{code:"rate_limited", retryAfterSec}`。
- 参数错误返回 400，不扣额度。搜索失败（502）会退还额度。
- 502 `{code:"upstream"}`：embedding 或 Qdrant 出错、超时（15 秒）、embedding 配置缺失、维度不对。
- 502 `{code:"collection_missing", error:"记忆库集合不存在或未就绪"}`：Qdrant 返回 404。
- 查询向量缓存 5 分钟，按 embedding 端点、模型、维度、凭据和查询隔离，最多 500 条；不把凭据原值用作缓存键或写入日志。
- 界面另有限制：200 字、每分钟 10 次；相同参数的结果在当前页面复用 30 秒。后端允许的 500 字、每分钟 30 次是独立上限。
- 日志只记 scope、user_id 个数、limit、结果数、是否命中缓存。不记 q，不记正文，不记 key。
- 报错信息会脱敏：替换掉本次用到的 apiKey 原值，以及 Bearer、sk-、bce-v3/、key/token/secret/password/authorization/value = 或 : 后面的值（包括 JSON 转义后的写法），最长 300 字。

## 2. POST /api/models/ping
- 保留快照的检测方式：最多并发 2 个，不使用全局串行或 3 秒冷却。
- DeepSeek、千帆、小米的默认运行时走已有供应商直连；其余走网关。xAI 保留现有网关检测路径。
- 直连从指定 OpenClaw `.env` 变量或只读 SQLite secret store 取凭据；返回来源说明，不返回值。部署进程需要相应只读权限，参数见 `.env.example`。
- `note` 说明直连只验证上游/key；`warnMessage` 说明网关路径的验证范围。界面显示这些说明，不把未经本轮实测的固定卡顿时长当作结论。
- 同一模型 10 秒内只能测一次的限制保留不变，仍是 429 `{code:"rate_limited"}`。
- 网关临时会话在 finally 尝试删除（最多重试 3 次，带 deleteTranscript）；删除失败会记录错误，不能保证外部网关一定接受清理。

## 3. 静默窗口（HOSINO-QUIET-WINDOW v1）
- 每天 **21:55-22:10（新加坡时间，两端都算）只拦写操作和重启**，读不拦。
- 拦截范围：所有走 W() 的写接口，包括模型管理、凭证、cron、会话重置、别名、撤回和重新生成等。
- 被拦时返回 **423 `{code:"quiet_window", retryAfterMs}`**。
- 白名单预览不写配置，可在窗口内返回 `blockedWindow:true`；保存及密钥修改通过同一写保护。
- 不拦原有 GET、记忆搜索、控制台密码登录，以及 models.ping（不写配置、不重启）。普通聊天/QQ 发送、附件和原生 CLI 沿用原有保护范围，没有新增全局禁用。
- 环境变量 `HOSINO_QUIET_WINDOW=HH:MM-HH:MM` 可以改时段；填其他值（比如 off）就关闭。

## 4. 模型管理冲突码
- 配置的 hash 或版本对不上（预览之后配置被改过）：**409 `{code:"baseHash_mismatch", legacyCode:"stale"}`**。旧前端可以读 legacyCode。
- 路径不在白名单：**403 `{code:"not_whitelisted", blockedPaths}`**，以前是 409。
- 会触发网关重启：仍是 **409 `{code:"restart_required"}`**。

## 5. 独立密钥管理
- `GET /api/secrets`：返回 `{ secrets:[{name, set:true, updatedAt?}] }`。顶层 key 叫 `secrets`，只返回名字，不返回值。
- `usedBy` 可选，列出当前配置引用路径；列表失败不伪装成空列表。
- `POST /api/secrets/set`：参数 `{name, value, confirm:true}`。
  - name 必须匹配 `^[A-Z][A-Z0-9_]{1,63}$`。
  - 上述限制用于新建；已存在的网关合法名字（1–128 字符）仍完整列出，并可替换或清除，不静默隐藏。
  - value 是字符串，1-8192 字。
  - 没有 kind 字段；允许新建名字。
  - 底层走 `secrets.store.set`，已有条目保留类型，新名字使用 env 类型；不自动重载或重启组件。
- `POST /api/secrets/clear`：`{name,confirm:true}`，核对配置中的插值/SecretRef 和已知 MiMo 引用，再调用 `secrets.store.delete`。使用中返回 **409 `in_use`**；无法核对引用时拒绝清除。
- 写入/清除仅返回结果元数据，丢弃网关回显的值与诊断原文。旧值不保留，代码回滚不会恢复密钥。

## 6. 白名单配置
- `GET /api/allowlist` → `{baseHash,lists:[{path,label,items:string[],apply,itemType}],pendingRestart}`。
- 仅编辑配置中已存在、类型兼容的 `channels.<channel>.allowFrom/groupAllowFrom`、对应 `accounts.<account>` 字段及 `tools.allow/deny`。禁止列表有独立标签；不开放任意配置路径或自动新建字段。
- `POST /api/allowlist/preview`：`{baseHash,changes:[{path,items:string[]}]}` → `{dryRun:true,diff:[{path,before,after,apply}],apply,blockedWindow,pendingRestart}`；只读。
- `POST /api/allowlist/apply`：相同参数加 `confirm:true`，重新检查版本和生效规则，使用官方 `config.patch` 原子 `baseHash` 和数组替换路径。
- 安全整数列表保留数字类型，混合列表保留已有项的原始类型；歧义、重复、非法条目拒绝。最多 20 个变更列表，每列表最多 1000 项。
- 冲突 **409 `baseHash_mismatch`**；越界 **403 `not_whitelisted`**；需要重启 **409 `restart_required`** 且不保存。生效方式取本地和实时网关规则中更严格的结果。

## 7. 插件与技能
本轮只读展示状态、错误详情及受保护标签；不提供开关、安装或重载接口。插件 `error` 已脱敏，失败状态不依赖是否同时有错误文字。

## 8. OAuth / 设备登录与账号排序

`GET /api/models/manage` 的供应商增加 `capabilities:{login,order}`、`loginMethods:[{id,label,kind}]`、`profiles:string[]`、`orderLocked`、`authProvider`。只在实时网关声明支持时显示相应入口；纯认证供应商也可出现在管理列表。

| 方法 | 接口 | 参数 / 结果 |
| --- | --- | --- |
| POST | `/api/models/auth/login` | `{provider,method?,confirm:true}`；返回 `{pollId,state,flow,step,url?,userCode?}`，只有一个登录方式时可省略 method。 |
| GET | `/api/models/auth/login/:pollId` | 当前流程；`state` 为 pending/done/error/cancelled。pending 时推进或等待官方 wizard，不重复发起长请求。 |
| POST | `/api/models/auth/login/:pollId/answer` | `{stepId,value?,confirm:true}`；仅接受当前步骤的有效答案。 |
| POST | `/api/models/auth/login/:pollId/cancel` | `{confirm:true}`；以网关确认的 state 为准，不能取消的保存阶段继续显示 pending。 |
| POST | `/api/models/auth/order` | `{provider,profileIds:[同供应商完整账号列表],confirm:true}`；列表变化返回 409，配置锁定返回 `409 order_locked`。 |

- 流程绑定当前控制台登录会话，其他会话访问同一 pollId 返回 404。15 分钟到期自动清理，登出取消所属待完成流程；已完成授权不自动撤销。
- 向导支持 note、progress、text、select、multiselect、confirm、action；需要答案的步骤必须由用户提交，不自动接受授权。选项值通过随机标识映射，敏感输入及上游诊断不落审计。
- 正在推进的登录步骤和账号排序遵循静默窗口；取消登录仍可用。窗口结束后可继续当前未过期向导。
- SDK 参数和桥接依据见 [docs/new-auth-contract.md](docs/new-auth-contract.md)。

## 9. OpenClaw 原生插件中心

入口 `#/abilities#plugin-center`，与原有插件/技能状态页并存。使用已有 OpenClaw 插件接口，不运行 AstrBot 或兼容框架。

| 方法 | 路径 | 请求 / 结果 |
| --- | --- | --- |
| GET | `/api/plugin-center` | 原生插件列表、受保护状态、能力及操作边界。 |
| GET | `/api/plugin-center/detail?id=PLUGIN_ID` | 详情、声明组件、配置 schema、脱敏 `config.values`、`secretFields` 与配置版本。 |
| POST | `/api/plugin-center/plan` | `{action:"config",id,baseHash,config}` 生成差异；原生安装候选使用 `{action:"install",source,spec,baseHash}`。只读，可在静默窗口预览。 |
| POST | `/api/plugin-center/apply` | `{planId,baseHash,confirm:true}`；仅对受审核名单、实时无需重载且未触及保护范围的配置生效。默认审核名单为空。 |

预览返回 `planId/baseHash/diff/apply/canApply/blockedCode/blockedReason/export`。`export.content` 是不含凭据的 JSON 变更单，标记 `executable:false`，不是可直接执行的脚本。原生安装候选只检查标识格式，不下载、验证或执行包。

当前所有插件生命周期动作只生成维护计划，不调用 `plugins.install/setEnabled/uninstall/reload`。配置需维护、影响未知或未经审核时，`canApply:false`，不能用调用 apply 绕过限制。受保护插件与同包成员拒绝变更；版本冲突、过期计划、静默窗口和上游故障分别返回受控错误。

更多约束与未来原生插件接入流程见 [docs/plugin-center.md](docs/plugin-center.md)。
