# 星野记忆查看 / 标错 / 删除：方案评估（只读）

2026-10-20 17:15（UTC+8）。这次只做了 Qdrant 的只读操作（列集合、查集合信息、scroll 时不带向量），用只读模式打开了 mem0-history.db，读了源码和配置。没写任何东西，没建快照，没调网关的写方法，也没碰向量模型（千帆 qwen3-embedding-8b，4096 维）。

## 1. 记忆存在哪

### 1.1 Qdrant（127.0.0.1:6333，没有 API key，数据目录 ~/.openclaw/vector/qdrant）

| 集合 | 条数 | 用途 |
| --- | --- | --- |
| **mem0_full_timestamped_20260926** | 16265 | **当前在用的**（mem0 插件配置里写的 collectionName），只对 `user_id` 建了索引 |
| mem0_full_timestamped_20260926_entities | 586 | 实体表，`linkedMemoryIds` 指向上表的记忆 id |
| mem0_4096d / _entities | 8869 / 116 | 旧集合，迁移前的 |
| mem0_l0_timestamped_20260926 / _entities | 4578 / 0 | 旧的 L0 抽取层 |
| memory_migrations | 1 | 迁移标记 |

向量全是 4096 维、Cosine 距离。

当前集合的 payload 字段，统计自前 2000 条：
- 每条都有：`data`（记忆正文）、`hash`、`textLemmatized`（正文分词，**也含隐私内容**）、`createdAt`、`user_id`。
- 大部分有：`updatedAt`、`tdai_layer`、`source_session_key`、`source_openid_or_peer`、`channel`（direct/group）、`category`、`importance`、`source_window_start/end`、`source_message_timestamps`、`imported`、`backfill`。
- 少数有：`attributedTo`（432 条）、`scene_name`、`path` / `title`（文档切块）、`fact_event_date`。
- 只有 12 条带 `oc_*` 字段（`oc_visibility=group`、`oc_source_channel=qqbot`、`oc_stated_by=qqbot:<哈希>`、`oc_subject_id=unverified`、`oc_source_conversation`）。这是新的作用域写法，只有最近的记忆才有。

**按人、按群区分时能用的字段：**
- `user_id`：大部分是 `凛`（前 2000 条里 1656 条）。其余是 `peer:<openid>`、`peer:<昵称>`（芙宁娜、离、离酱、吃饭、好友…），以及 `peer:group:<群id>`（比如 b4ee… 群）。**同一个人会有多种写法**（openid、昵称、别名），要在控制台里用 aliases、profiles 做归并。
- `source_openid_or_peer` 和 `source_session_key`：来自哪个会话、哪个人，比如 `agent:main:qqbot:direct:<openid>`。这是区分私聊和群聊最可靠的字段。
- `channel`：direct 或 group。
- `oc_stated_by` / `oc_source_conversation`：哈希过的，只有新记忆有，没法直接对应到人。
- mem0 的 `agent_id` / `run_id` **没用上**。

样例（正文已截断）：`{user_id:"凛", channel:"direct", source_session_key:"agent:main:qqbot:direct:4330…", category:"other", importance:3, data:"在 10cm 尺寸内，9…", createdAt:"2026-09-25…"}`。

### 1.2 workspace/memory/ 文件
- 有 24 个 `YYYY-MM-DD-HHMM.md`（600 权限），是 session-memory 钩子在会话重置或结束时写的会话小结。开头带 Session Key / Session ID / Source，后面是摘要。
- `dreaming/{light,rem,deep}/YYYY-MM-DD.md`：做梦相关的产物，停在 9-26。还有 `.dreams/` 目录。
- `README.md`。
- 这些文件只是按会话的小结，**不是**逐条的记忆；适合在控制台里只读展示。真要删的话，按文件移进备份目录，不改原文。

### 1.3 mem0 插件（openclaw-mem0，开源模式）
- 配置（已打码）：
  - `userId:"凛"`，`autoCapture:true`，`autoRecall:true`，`topK:3`
  - 抽取模型 `deepseek/deepseek-flash`
  - 向量模型：千帆 `qwen3-embedding-8b`，4096 维
  - vectorStore：qdrant `127.0.0.1:6333`，onDisk，用上面那个在用的集合
  - historyDbPath：`~/.openclaw/state/mem0-history.db`
- 写入方式：每轮对话结束后自动 capture，经 LLM 抽取后变成 add / update / delete，向量和 payload 写进 Qdrant，同时往 history 库记一笔。
- 插件给 agent 的工具有 `memory_add / delete / update / get / list / search / event_list / event_status`。
- **缓存**：召回结果放在内存里（`globalThis.__mem0RecallCacheV2`），**30 秒过期**。没有别的长期缓存，所以在 Qdrant 里删或改一条，最晚 30 秒后召回就不会再出现它，**不需要重载插件或网关**。
- `mem0-history.db`（SQLite，600 权限）：
  - `memory_history` 表 54 行，字段有 memory_id、previous_value、new_value、action 等。
  - `messages` 表 0 行。
  - 最后修改时间 10-17。它只是审计记录，不参与召回。

## 2. 网关的记忆方法
- 能用的方法：`memory.search`，以及 `doctor.memory.status / dreamDiary / backfillDreamDiary / dedupeDreamDiary / resetDreamDiary / resetGroundedShortTerm / repairDreamingArtifacts`。
- `memory.search` 会报 `MEMORY_CAPABILITY_OWNER_PRIVATE_REQUIRED`：mem0 只允许属主私聊上下文调用，控制台走不通。
- `doctor.memory.*` 里带 reset / dedupe / repair / backfill 的都是写操作，而且**针对的是 memory-core 的做梦日记和短期记忆**，不是 mem0 和 Qdrant。对这个功能没用，也不应该调。
- **网关没有给外部的“按 id 删 mem0 记忆”方法**。`memory_delete` 是 agent 的工具，控制台调不到。所以删和改只能由控制台直接操作 Qdrant REST。

## 3. 控制台只读访问 Qdrant 会不会影响网关
- Qdrant 读操作（scroll、count、按 id 取点）不加锁，跟网关的写入可以同时进行。
- **注意数据量**：scroll 时一定要 `with_vector:false`。一条 4096 维向量序列化成 JSON 大约 80KB，16k 条全拉下来要 1GB 以上。只有备份单条时才按 id 取向量。
- 控制台现在已经在用只读 scroll（`/api/memory`，每页 1000 条，缓存 10 分钟），没看到对网关有影响。
- Qdrant **没设 API key**，只监听 127.0.0.1。这意味着控制台、网关和本机任何进程都能读写它；没有鉴权，也不需要处理密钥。
- 不建快照：快照会复制整个集合（大约 16k × 16KB 起，还要更多），占磁盘和 IO，对这个功能也没必要。

## 4. 最稳的删除和修改流程
1. **先备份单条**：`POST /collections/<c>/points` 传 `{ids:[id], with_vector:true, with_payload:true}`，把完整的 `{collection, id, vector, payload, backedUpAt, reason}` 原子写到控制台的 `data/memory-backup/<日期>/<id>.json`（600 权限），一条一个文件，每条大约 80–100KB。写完再读回来核对 sha256，通过了才进入下一步。
2. **删除**：`POST /collections/<c>/points/delete?wait=true` 传 `{points:[id]}`。
3. **实体表**：把 `<c>_entities` 里 `linkedMemoryIds` 含这个 id 的点找出来（scroll 时按 payload 过滤，不带向量），一并备份，然后 `set_payload` 把这个 id 从数组里移掉。数组移空了的实体可以保留，召回时会被忽略。
4. **history 库**：建议**不写**。它属于网关进程，写的时候可能撞上锁，而且它只是审计、不影响召回。删除记录记在控制台的 ops.log 和备份文件里就够了。如果一定要记，等网关空闲时追加一行 `action='DELETE'`，但不推荐。
5. **还原**：`PUT /collections/<c>/points?wait=true` 传 `{points:[{id, vector, payload}]}`，用备份里的原向量，**不重新算向量，不花额度**。被改过的实体 linkedMemoryIds 也用备份恢复。
6. **改正文**：如果只改 `data` 而不重新算向量，向量和正文会对不上，召回会偏。所以控制台**不做原地改写**，只提供：
   - “标错”：在控制台 `data/memory-flags.json` 里记一个标记，不写 Qdrant，零风险。
   - 先标错，再走删除。
   - 想要一条改正后的新记忆，就让星野在私聊里用 memory_update / add 写入，这样才会正确重新算向量。
7. 生效：召回缓存 30 秒内过期，不用重载。

## 5. 控制台的 systemd 沙箱能不能连到 Qdrant
- 能。服务单元没有 IPAddressDeny 或 RestrictAddressFamilies，`/api/memory` 已经在用 `http://127.0.0.1:6333`（环境变量 QDRANT_URL）。不需要密钥。
- 备份目录放在 `data/`，那里已经是可写的。
- 补充：上一轮发现控制台对 /home 实际上是可写的，跟这个功能无关，但也说明控制台进程的权限比预想的大。

## 6. 建议的做法
- **第一步，只读**：按人或群查看记忆。
  - 归类：先用 `source_openid_or_peer` / `source_session_key`，再按 `user_id` 里的 `peer:*`，最后归到 aliases 和 profiles。`凛` 的记忆按 direct / group 再分一层。
  - 列表接口带分页和关键词过滤，scroll 一律 `with_vector:false`；按 `createdAt` 倒序排。
  - 旁边列出 memory/ 下的会话小结（只读）。
- **第二步**：标错（只写控制台文件）。
- **第三步**：删除，按照上面 1→2→3 的顺序，接口要求 X-HS 和 confirm，一次最多删 20 条，ops.log 记 id 但不记正文；再加一个还原接口和一个“最近删除”列表。
- 只操作当前在用的集合；旧集合只读展示，或者干脆不展示。
- 需要批准的事项：控制台写 Qdrant（删除点、改实体 payload）。不涉及网关重启或改配置，也不碰 ~/.openclaw 下的文件（备份放在 /opt/hosino-console/data）。

## 7. 风险
- 同一个人的写法很多（user_id 有 openid、昵称、群），归并错了会把别人的记忆显示到另一个人名下。界面上要同时显示原始的 user_id 和 source。
- 网关可能正好在 update 同一条记忆，跟控制台的删除撞上。一条备份加一条删除的时间窗很短，风险低；万一撞了可以用备份还原。
- 备份里含隐私和完整向量，文件必须 600 权限，并定期清理（比如保留 90 天）。
- `textLemmatized` 里也有隐私，展示和日志都要按正文同等对待。
