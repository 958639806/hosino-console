# Survey of human-like (拟人) plugins across bot frameworks · Round 4
Read-only. Licenses were not checked individually: treat everything as ideas only and write our own code.
Already in 星野 / already pitched: message splitting, mood carry-over, jealousy, sulking/coaxing, grudge ledger, affection, 作息, follow-ups, initiation with a reason, opinions, admitting not knowing, relationship growth, small imperfections, slang, nickname table, sticker library, TTS.

| # | Plugin | Framework | Human-like idea | Status vs. 星野 | OpenClaw mapping |
|---|---|---|---|---|---|
| 1 | private_companion https://github.com/menglimi/astrbot_plugin_private_companion | AstrBot | All-in-one: state (energy, hunger, sleep), schedule, location continuity, weather, dreams, diary, **candidate-pipeline proactivity** with audit, important dates, **skill growth / personal goals**, retraction paraphrase, "今日穿搭", QQ status sync | Schedule/proactivity already pitched; **dreams, location continuity, skill growth, the proactive candidate pool, and the audit log are new** | Mostly skill (heartbeat) |
| 2 | proactive_chat https://github.com/DBJD-CR/astrbot_plugin_proactive_chat | AstrBot | Starts a conversation after silence; **an unanswered counter changes the emotion** (lonely → slightly hurt) | Proactivity already pitched; **the unanswered-count emotion is new** | Skill |
| 3 | AIReplay https://github.com/oyxning/astrbot_plugin_AIReplay | AstrBot | Continues the conversation; **auto-unsubscribes** inactive users | Partly covered | Skill |
| 4 | EmotionAI https://github.com/tengtian3/astrbot-plugin-emotionai | AstrBot | **Inner thoughts (CoT) before each reply**, a 12-dimension emotion model, emotion "metabolism" (negative deltas to calm down), **a mind-reading view** that strips thoughts from history | Mood already exists; **inner monologue + mind-reading view is new** | Skill + console |
| 5 | MaiBot 麦麦 https://github.com/Mai-with-u/MaiBot | MaiBot | "最像而不是最好"; HeartFChatting probabilistic speaking; **expression learning (imitating group members' style)**; jargon learning; **multiple_reply_style random style swaps** | Slang + gate already exist; **expression learning and style variation are new** | Expression learning = skill; talk_value = gate |
| 6 | AutoPlanning https://github.com/Natural-Selectionn/maibot-auto-planning-plugin | MaiBot | Daily LLM-generated schedule; **update_schedule: decides whether to accept an invitation based on her plans**; future appointments | Schedule already pitched; **accepting/declining invitations and appointments is new** | Skill |
| 7 | shiro-personification https://github.com/luojisama/nonebot-plugin-personification | NoneBot | Group style learning, user profiles, memory decay/palace, **poke back**, **silent sticker reactions**, cross-message quoting, **typing status in DMs**, **Qzone posts**, **self-aware reactions to fanart of her avatar** | Several exist; **Qzone posts, reactions, and the poke back are new but likely blocked by the official API** | Mostly gate / channel |
| 8 | personification https://github.com/luojisama/personification | NoneBot | **Shared experiences**, **message staleness (drops replies that are already outdated)**, a natural-feel blind-eval lab | **Staleness drop and shared experiences are new** | Staleness = gate; experiences = skill |
| 9 | mio 澪 https://github.com/HuanCheng65/mio | Koishi | "不是聊天机器人，是群友": silence is the default; **waits until others finish talking**; **aborts an outdated reply when something more important comes in**; **"等下我搜搜" search as an action**; episodic memory with her own participation level and a two-week half-life; **two-paragraph impressions per person (core + recent)** | Gate-like; **the outdated-reply abort, the two-paragraph impressions, and her participation level are new** | Gate restart |
| 10 | galgame https://github.com/Mai-xiyu/koishi-plugin-galgame | Koishi | Mood-based portraits, a two-direction affection bar, inner monologue, anti-OOC protocol | Mostly covered; the **anti-OOC hardening** is useful | Skill |
| 11 | ccb-plus / qun-prank (from round 2) | Koishi | Protection mode, cooldowns | Mechanics reference only | — |
| 12 | wifegacha (from round 2) | Koishi | Collection dex | Already pitched | — |
Not surveyed this round (no searches done): SillyTavern extensions, Yunzai/TRSS, ZeroBot, Mirai, Discord/Telegram AI bots, and companion apps. If more depth is wanted, these are the next round.

## Top 6 genuinely new ideas for 星野
1. **Inner monologue + 读心模式** (from EmotionAI / galgame) — skill + console
   - Before each casual reply she writes a short private note (perception → judgment → decision). The note is stripped from history so it doesn't pollute context.
   - 凛 can turn on "读心术" to see it in the console, or reveal it as a rare easter egg. Example: "（心理：他又熬夜……算了先不说，帮他把bug修了再骂）".
   - Off in tech mode or reduced to one line.
2. **Abandoning outdated replies + waiting until people finish** (from mio / personification) — needs a gate restart
   - If a newer message makes her draft obsolete, she throws the draft away and does not send a stale answer. She also waits about 5 seconds for a speaker to finish, with @ bypassing the wait.
   - The single biggest believability boost in group chat.
   - Tech: if 凛 sends a correction mid-question, she re-answers the newest version, which is better for tech too.
3. **Two-paragraph impressions per person + her own participation level** (from mio) — skill + memory (read-only mem0, separate file)
   - For each person: a core impression and a recent impression ("最近在忙考试，话少了"), refreshed weekly. Each memory also records whether she participated or just watched. Example: "那次你们吵架我就在旁边看着没敢说话".
   - Complements the picked relationship growth (#9 from round 3) with concrete text rather than a stage.
4. **Saying no to invitations based on her own plans** (from AutoPlanning) — skill
   - Example: "周六一起打游戏？" → "周六下午我约了看番（日程里写着呢），晚上可以！". Appointments are remembered and honored.
   - Builds on the picked 作息 (#3).
   - Tech is never declined.
5. **Unanswered-count feelings** (from proactive_chat) — skill
   - After 1 ignored proactive message she's fine; after 2: "你是不是很忙呀"; after 3 she stops and waits quietly. Back off and auto-unsubscribe (AIReplay).
   - Pairs with the picked "initiation with a reason" (#2).
   - Never guilt-trips.
6. **Dreams + location continuity** (from private_companion) — skill (heartbeat)
   - In the morning, occasionally: "我昨晚梦见群里全员变成猫，A 是橘猫". She stays consistent about where she is ("在宿舍" doesn't jump to "在公司" without a reason).
   - At most 1–2 dreams per week. Dreams may lightly use group events, never private ones.
Honorable mention: style learning (MaiBot), useful but overlaps with the slang dictionary; anti-OOC hardening (galgame).
Likely blocked by the official QQ Bot API (unverified): poke back, emoji reactions, Qzone posts, DM typing status.
