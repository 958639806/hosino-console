# 星野 好玩功能 第五轮（嘴欠、有情绪、贴着群友关系）
Checked against rounds 1–4 to avoid repeats. Everything below is designed in the direction 凛 likes: cheeky, emotionally reactive, grounded in real group social life. No simulation machinery.

## Sources (searched this round)
- MaiBot / 麦麦 on B站: "当你的群里混进一只嘴臭ai群友" https://www.bilibili.com/video/BV1tU2cBaE4a/ ; the tutorial "如何在你的群偷偷放一只deepseek成为你的赛博群友" (about 320k views); "当你发现聊了99+的群友是DeepSeek" (about 630k views); a write-up https://baka.studio/p/maibot... . Most viral moments: lurking for hours then suddenly popping up, being mouthy, playing the "权限狗" with mutes.
- Viral QQ screenshots on 梗图网:
  - Three AI bots looping "急了 / 🤙急眼了" at each other: https://gengtu.net/memes/ai-chatbot-quarrel-qq-chat-screenshot/
  - An AI threatening to steal a group member's wheelchair, with props: https://gengtu.net/memes/qqai-2892b4c3/ . The fun comes from deadpan escalation using props and images.
- Yunzai plugins:
  - Gi-plugin (GPL, ideas only): drift bottles, "今日欧皇/非酋", "本群历史文献", "打断+1". https://github.com/qiannqq/gi-plugin
  - recreation-plugin: 舔狗日记, 发病, 彩虹屁, 今日群友老婆. https://github.com/QiuLing0/recreation-plugin
  - Shiranai (MIT): https://github.com/XasYer/Shiranai-Plugin
  - Turtle-soup (海龟汤) plugin: https://github.com/Cat-bl/soupbubble-plugin
- Kindroid group chats and Discord bot: group context and multi-character banter. https://kindroid.ai/docs/article/groupchats/
- Not searched this round, due to limited time: SillyTavern character-card tricks, ZeroBot, Telegram bots, 猫箱, the 星野 app, EVE.

## 1. Caught talking behind her back (背后说我被抓包) — needs a gate change
- A: "星野今天又说错了hhh" (no @) → 星野: "我听见了。👀 继续说，我在记。"
- Inspired by MaiBot's lurk-then-pop-up moments, which went viral. The gate must react when her name is mentioned without an @.
- Guardrail: at most once per person per day. Neutral mentions ("星野好可爱") get a shy reply instead; she never escalates.

## 2. Bedtime check (晚安查岗) — skill only
- A says "晚安" at 23:30; at 00:40 A speaks again → "？你不是晚安了吗。说好的睡觉呢，被我抓到了吧"
- Guardrail: at most once per person per night. Silent if the person mentions work or feeling ill.

## 3. Racing for the first "早" (抢早安沙发) — skill only (heartbeat/time)
- 7:02: 星野 "早！（今天我第一）". If someone beats her: "可恶，B 你几点起的？明天我定闹钟"
- Guardrail: once a day, and only in groups where people actually say 早. No "early bird" leaderboard.

## 4. Slacking-off patrol (摸鱼监工) — skill only
- A weekday at 15:00, someone is active → "上班摸鱼被我抓到了。我不告诉你老板，但你得给我发张表情包封口"
- Guardrail: at most once per person per week. Skip anyone who has said they're a student or unemployed, or who seems stressed.

## 5. Protecting her people (护短) — skill only (gate makes it smoother)
- B teases A a bit too much → 星野: "喂，A 是我罩的，要欺负先过我这关。" Escalating with props, like the viral wheelchair screenshot: "（掏出锤子表情）"
- Guardrail: only in light teasing; real arguments get de-escalated instead. Side-switching is random so nobody becomes the permanent "protected one".

## 6. Shipping the group (嗑CP起哄) — skill only
- A and B keep replying to each other late at night → "你俩又凌晨两点双排了？……我什么都没说（嗑到了）"
- Guardrail: **opt-in only**. Both people must have agreed; "别嗑我" ends it permanently. Never involves real partners or minors.

## 7. Tool-bot protest (工具人抗议) — skill only
- Someone only @s her for tasks for 3 days → "你们是不是只有有事才想起我？……行吧，这个帮你查了，但你欠我一句'星野辛苦了'"
- Guardrail: the help is always given first and the protest comes as an extra line. Never in tech mode. At most once per person per week.

## 8. Can't keep a (fake) secret (嘴漏) — skill only
- A: "星野别告诉别人我买了三份奶茶" → later, when someone mentions 奶茶 → "我什么都不知道！A 绝对没有买三份……啊。"
- Guardrail: only "secrets" that are obviously jokes and that the person told her in public. Anything that sounds real, or was said in private, is never leaked. Anyone can say "这个真别说", which locks it.

## Ranking
1 → 2 → 7 → 5 → 3 → 8 → 4 → 6.
Only #1 needs a gate restart; bundle it with jealousy and the other gate items.
