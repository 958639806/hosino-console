# 控制台 API 增量（staging，基于 deploy/server.mjs 4c43b473）

通用规则：
- 所有 /api/* 都要登录，没登录返回 401。
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
- 查询向量缓存 5 分钟，按 sha256(model+q) 存在内存里，最多 500 条。
- 日志只记 scope、user_id 个数、limit、结果数、是否命中缓存。不记 q，不记正文，不记 key。
- 报错信息会脱敏：替换掉本次用到的 apiKey 原值，以及 Bearer、sk-、bce-v3/、key/token/secret/password/authorization/value = 或 : 后面的值（包括 JSON 转义后的写法），最长 300 字。

## 2. POST /api/models/ping 全局串行（HOSINO-PING-SERIAL v1）
- 所有客户端共用一个队列，同一时间只测一个模型。
- 上一次测完（临时会话已删除）后，要冷却 3 秒才能测下一个。冷却时长可用环境变量 MODEL_PING_COOLDOWN_MS 调整，默认 3000。
- 忙或在冷却中：**429 `{code:"ping_busy", retryAfterMs}`**。
  - 正在测时，retryAfterMs 取一个上限估计：该模型的超时 + 15 秒删除余量 + 冷却。
  - 冷却中时，retryAfterMs 是冷却剩余时间。
- 同一模型 10 秒内只能测一次的限制保留不变，仍是 429 `{code:"rate_limited"}`。
- 临时会话在 finally 里一定删除（最多重试 3 次，带 deleteTranscript），删完才释放串行锁。

## 3. 静默窗口（HOSINO-QUIET-WINDOW v1）
- 每天 **21:55-22:10（新加坡时间，两端都算）只拦写操作和重启**，读不拦。
- 拦截范围：所有走 W() 的写接口，包括模型管理、凭证、cron、会话重置、别名、撤回和重新生成等。
- 被拦时返回 **423 `{code:"quiet_window", retryAfterMs}`**。
- 不拦：所有 GET、记忆搜索、登录，以及 models.ping（只读探测，不写配置、不重启）。
- 环境变量 `HOSINO_QUIET_WINDOW=HH:MM-HH:MM` 可以改时段；填其他值（比如 off）就关闭。

## 4. 模型管理冲突码
- 配置的 hash 或版本对不上（预览之后配置被改过）：**409 `{code:"baseHash_mismatch", legacyCode:"stale"}`**。旧前端可以读 legacyCode。
- 路径不在白名单：**403 `{code:"not_whitelisted", blockedPaths}`**，以前是 409。
- 会触发网关重启：仍是 **409 `{code:"restart_required"}`**。

## 5. 已定规范，本轮还没实现（等服务端排期）
- `GET /api/secrets`：返回 `{ secrets:[{name, set:true, updatedAt?}] }`。顶层 key 叫 `secrets`，只返回名字，不返回值。
- `POST /api/secrets/set`：参数 `{name, value}`。
  - name 必须匹配 `^[A-Z][A-Z0-9_]{1,63}$`。
  - value 是字符串，1-8192 字。
  - 没有 kind 字段；允许新建名字。
  - 底层走 secrets.store.set。
- 插件开关遇到受保护插件（比如 openclaw-mem0、qq 相关）：**403 `{code:"plugin_protected"}`**。
- 认证 profile 的顺序被锁定：**409 `{code:"order_locked"}`**。
