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
