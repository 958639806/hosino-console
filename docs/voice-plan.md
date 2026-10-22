# 星野主动语音评估（只读，2026-10-20 19:45 UTC+8）

这次只读了文件和数据库（sqlite 用 mode=ro 打开）。没有重启或改配置，也没往 QQ 发消息。为了统计，在主机 /tmp 放过一个临时脚本，跑完就删掉了。

## 1. 现在的触发方式
语音有两条路线：

**A. 群聊：`<语音>台词</语音>` 标签**
- 发不发由模型自己决定，代码不掷概率。
- 每一轮，followup-gate 插件（`~/.openclaw/plugins/qq-group-followup-gate/index.js`，约 188–299 行）会在群聊提示里加一句话：
  - 「语音比表情包更少用：只在打招呼/安慰/撒娇这类语气特别重要的时刻，才把一句≤20字的短话写成 <语音>…」
  - 外面还套了一层「【表情/语音·少用】大多数回复不带任何标记……表情包和语音二选一」。
  - 插件参数（写死在代码里，openclaw.json 里没有）：
    - `voiceCooldownReplies:5`：5 条回复内提示「刚发过语音，这轮不用」
    - `voiceNudgeAfterReplies:30`：30 条以上没发才补一句「很久没用了，可以考虑」
- 实际合成和发送由 qqbot 补丁 `QQ-MEDIA-TAG-PATCH v1/v1.1` 完成：
  - 文件：`~/.openclaw/npm/projects/tencent-connect-openclaw-qqbot-*/node_modules/@tencent-connect/openclaw-qqbot/dist/index.cjs`，约 13933 行起；`__qqMtTts` 在约 14224 行。
  - 参数在 `openclaw.json` 的 `channels.qqbot.mediaTags`：`voice:true, voiceCooldownReplies:5, voiceNudgeAfterReplies:30, voiceMaxChars:40, voiceTimeoutMs:8000`。
  - 合成调用 `scripts/xingye_voice.py`。超过 40 字或超过 8 秒就改发文字。每条回复最多 1 个媒体。
- 表情包从 10-20 起改成由代码决定，按 `stickers/params.json` 的 attachProbability 0.25、冷却、静默时段、会话开关来定。语音还停在「模型自己挑」。

**B. 私聊和主对话：模型自己跑脚本**
- `workspace/AGENTS.md` 第 29–41 行和第 65–71 行写着：「约 30% 随机概率」「极端情绪直接触发」「≤50 字」，用 `exec python3 scripts/xingye_voice.py` 再 `message send`。
- 但这个「30%」只是写给模型看的文字，没有任何代码在掷骰子。
- params.json 的注释写明标签补丁不支持私聊（c2c）。

**底层**
- `scripts/xingye_tts.py` 调小米 MiMo Token Plan：`https://token-plan-cn.xiaomimimo.com/v1/chat/completions`，模型 `mimo-v2.5-tts`，音色「冰糖」。
- key 是 secret store 里的 `XIAOMI_MIMO_API_KEY`。
- openclaw.json 里没有启用内置的 tts、talk-voice、azure-speech、sherpa-onnx。
- followup-gate 的 `controlledMediaJobs` 只负责「群友明确要求发语音」时的受控执行和脚本哈希校验，不会主动触发。

## 2. 实际发了多少（10-01 至 10-20，transcript_events 中助手回复里的 `<语音>` 标签和 xingye_voice/tts 脚本调用）
怎么分类：
- 上一条用户消息含「语音/说句/念/读一下/用声音/voice」等词，算「群友要求」。
- 含「自动化测试/codex」，算「测试」。
- 其余算「主动」。
- 这是近似统计，没核对 QQ 侧有没有真的送达。

| 会话 | 日期 | 标签：主动/要求/测试 | 脚本调用：主动/要求/测试 |
|---|---|---|---|
| 群 379363… | 10-09 | 2 / 6 / 0 | 2 / 4 / 0 |
| 群 379363… | 10-10 | 0 / 1 / 1 | 0 / 1 / 4 |
| 群 379363… | 10-11 | 0 / 0 / 2 | 0 / 0 / 2 |
| 群 379363… | 10-18 | 0 / 0 / 1 | – |
| 群 b4ee2a… | 10-02 | – | 0 / 10 / 0 |
| 群 b4ee2a… | 10-06 | 1 / 1 / 0 | 0 / 8 / 0 |
| 群 b4ee2a… | 10-07 | 0 / 1 / 0 | – |
| 群 b4ee2a… | 10-11 | – | 0 / 0 / 4 |
| 群 b4ee2a… | 10-17 | 0 / 2 / 0 | – |
| 群 b4ee2a… | 10-18 | 0 / 0 / 1 | – |
| 主对话 main | 10-03 | – | 1 / 2 / 0 |
| 主对话 main | 10-10 | – | 2 / 0 / 0 |
| 私聊 7FE244/249BDB | 全期 | 0 | 0 |

同期回复量：群 379363 约 1453 条，群 b4ee2a 约 1455 条，主对话约 1273 条。

结论：
- 20 天里主动语音只有约 7 条，大约每 600 条回复 1 条。
- 10-10 以后两个群一条主动语音都没有，10-11 以后主对话也没有。
- 群友要求的语音也很少。

## 3. 为什么这么少
1. 提示词在压着她：「少用」「大多数回复不带标记」「比表情包更少用」「只在…特别重要的时刻」。claude-haiku 对这类限制很听话，几乎就当成禁止。
2. 字数上限自相矛盾：提示写 ≤20 字，AGENTS.md 群聊段写 ≤30 字，代码上限 40 字，私聊段写 50 字。模型会挑最紧的那个，可写的内容更少。
3. 和表情包二选一。10-20 起表情包改成代码按 25% 概率下令「这一轮请带一个表情包」，命中的那几轮语音就被挤掉了。
4. 鼓励来得太晚：要 30 条回复没发语音，才补一句「可以考虑」，而且语气很弱。
5. 私聊和主对话的「30% 概率」全靠模型自觉，大模型不会真去掷骰子。要发还得自己跑 exec 和 message 两步工具，成本高，所以基本不发。主对话 10-17 后走 claude-cli，这条路线能不能调用 exec 工具还没核实。
6. 10-09 到 10-11 一大半是 Codex 测试流量，真正的日常使用比表面数字还少。

## 4. 能不能把语音参数放进 params.json，和表情包共用面板
可以，做法照抄表情包（HOSINO-STICKER-PATCH v1）。

**参数设计**
在 `stickers/params.json` 加一个 `voice` 段（或单独建 `voice/params.json`；共用同一个文件更省事，面板也只读一份）：
```json
"voice": { "enabled": true, "attachProbability": 0.12, "cooldownReplies": 4,
  "quietHours": {"start":"00:00","end":"08:00","tz":"Asia/Singapore"},
  "defaultEnabled": false, "sessions": {"group:379363…":{"enabled":true},"group:b4ee2a…":{"enabled":true}},
  "maxChars": 40, "dailyCap": 30, "exclusiveWithSticker": true }
```

**执行方式**
- followup-gate（index.js 的提示生成函数）：
  - 每轮读 params.json，按 mtime 缓存。
  - 先掷语音概率，命中就明确写「这一轮请把一句≤N字的话写成 <语音>…</语音>」，同时告诉表情包这轮不发；没命中就写「这轮不发语音」。
  - 去掉「少用」那类措辞。
- qqbot 补丁（QQ-MEDIA-TAG-PATCH）：
  - 发送前重新读一遍 params，复查开关、静默时段、冷却、日上限、字数，不合规就把标签剥掉改发文字。表情包已经这么做了。
  - `voiceMaxChars` 改为从 params 读，openclaw.json 里的值保留作兜底。
- 控制台：`server.mjs` 的 params 接口和前端参数面板各加一组「语音」字段，校验范围和表情包一致，交给前端喵做。

**私聊（可选）**
标签补丁现在不支持 c2c。要支持，得把 `__qqMt` 解析路径扩到私聊的发送流程，工作量更大，建议放在第二步。

**要改的文件**
- `plugins/qq-group-followup-gate/index.js`
- qqbot `dist/index.cjs`（补丁 v1.2）
- `workspace/stickers/params.json`
- `workspace/AGENTS.md` 第 31–41 行、第 110 行（统一字数、改成「听提示」）
- 控制台的 `server.mjs` 和前端
- 补丁工具清单：改了的文件都要登记，否则自检会报差异，`reapply_all.sh` 也会拒绝执行

**要不要重启**
- followup-gate 和 qqbot dist 都不能热加载，必须重启网关一次，QQ 会掉线约 1 分钟，需要凛批准。
- 之后再调参数只改 params.json，按 mtime 生效，不用重启。
- 控制台改动要重启控制台，会登出。

**风险**
- 概率调太高会刷屏。建议从 10–15% 起步，配合冷却和日上限。
- 每多一条语音就多一次 MiMo 调用，额度见下一节。
- 合成要 1.5–2 秒，超过 8 秒会退回文字，不阻塞文字发送。
- 表情包和语音的互斥逻辑要和表情包补丁一起改，否则可能一条回复里同时出现两种。
- 这两份文件都被补丁工具快照管理，改完要同步更新清单。
- 对模型的指令变了，要回归测试，避免标签泄露到群里（现有的泄露防护保留）。

## 5. MiMo TTS 成本和延迟
- 走小米 MiMo Token Plan（订阅制额度），模型 mimo-v2.5-tts。脚本和文档里都没写单条价格或扣多少额度，日志里也没有计费字段。**单条成本未知**，要去小米 Token Plan 控制台看用量。这次没有发起任何付费调用。
- 延迟：`docs/VOICE_PLAYBOOK.md` 记的是约 1.5–2 秒（和文字并行，文字先发），代码超时 8 秒。日志里没找到逐条耗时（`__qqMtTts` 会返回 ms，但没写进日志），**实测分布未知**。
- 参考：今天 /tmp 下有 11 个 xingye_voice mp3，单个约 7–20KB，几秒长的短句。
