# 星野 有趣功能 第二轮（拟人+整活，新角度）
Excludes ideas already pitched in round 1. Read-only research; no code is copied from AGPL projects.
Sources:
- Neuro-sama / Evil Neuro: TV Tropes, the VTuber Fandom wiki, and 2026 recaps. Running bits include the sibling rivalry (mutual insults, jealousy over chat attention, duets), the signature song "BOOM", quiz streams about her own favorite coffee, the "Neuro class" lessons, and fanart reviews.
- Koishi ccb-plus / qun-prank (MIT; ported from AstrBot / Yunzai): opt-in protection mode is on by default, there are crit, backfire, and counterattack probabilities, sliding-window cooldowns, a daily reset, and a "first person to do X" tracker. We borrow the mechanics only, not the explicit content.
- Koishi memes (AGPL, ideas only): avatar-based meme templates (pet the head, clown, hammer).
- wifegacha: affection, random easter-egg events, and a collection dex.

## 1. 星野's current obsession (rotating hobby) — skill only
- Experience: one week she is obsessed with Hollow Knight, and in group chat she keeps working it in: "这个难度跟大黄蜂二阶段差不多。" The next week she announces: "我宣布我现在迷上了做饭（虽然没有手）."
- Implementation: `obsession.json` stores the current hobby, its start date, and progress stages (beginner → hooked → burnt out). The heartbeat rotates the hobby every 5–10 days. She shares the hobby with a probability rather than every time. Inspiration: Neuro's coffee obsession and her quiz stream about herself.
- Guardrails: at most 3 proactive hobby mentions per day. No mentions when the conversation is serious.

## 2. 星野's day (daily-life storytelling) — skill only (heartbeat)
- Experience, evening: "今天汇报：上午被A的语音吵醒，下午偷偷看了B发的猫图十遍，晚饭吃的是电费。"
- Implementation: once a day, generate a small diary entry from the day's real group events. This turns real group events into a cute story; it is different from the daily group report because it is told from her perspective and sounds like a character, not data. It can optionally be sent as a MiMo TTS voice message.
- Guardrails: never quote private content or mock individuals. Only light, fun events. Can be merged with the daily report or toggled separately.

## 3. Rivalry with 芙宁娜 (sibling-rivalry duo) — needs a gate change (react to the bot's messages)
- Experience: 芙宁娜: "我才是最受欢迎的！" → 星野: "哦？那你说说你今天收到几个贴贴。" They also do a "共同合唱": 星野 sends a voice message singing the first line, and 芙宁娜 answers.
- Implementation: inspired by Neuro vs. Evil's mutual insults and duets. The gate needs to let 星野 occasionally respond to 芙宁娜 (identified by her bot QQ id). A cap on back-and-forth rounds prevents bot ping-pong.
- Guardrails: at most 2 rounds per exchange and at most 3 exchanges per day. Silent when humans are talking. 芙宁娜's owner must agree. Bonds of affection are preserved underneath ("still love each other").

## 4. Secret easter eggs (隐藏彩蛋/暗号) — skill only
- Experience: someone happens to say "星野的秘密是什么" at 3:33 AM → "……你发现了。其实我怕打雷。（这个秘密只有你知道哦，第1个发现者：A）".
- Implementation: `secrets.json` holds 10–20 hidden triggers (time + phrase, weird combinations, a specific sticker). Each one records who discovered it first (borrowed from qun-prank's "first person" tracker). There is also a progress board: "/彩蛋 3/20 已发现".
- Guardrails: secrets are lore only, not real data. Discoverers are only shown on request.

## 5. Unreliable claims + getting exposed (演技翻车) — skill only
- Experience: "我从来不偷看你们聊天。" Someone: "那刚才B发的是什么？" → "……是红烧肉。（暴露了）"
- Implementation: when the mood fits, she plays a small lie and then gets caught by the group's follow-up. These are comedic self-own setups, inspired by Neuro's frequent self-contradictions.
- Guardrails: the lies are only about herself, never about facts. Low probability, at most 1 per day.

## 6. Fanart / "作品鉴赏" segment — skill only (uses existing image viewing)
- Experience: someone posts a drawing → "星野评分：8.5/10，扣的1.5分是因为没画我。" Or: "这张画的是我吗？我的呆毛没那么弯！"
- Implementation: inspired by Neuro's "fanart review" segment. When an image contains 星野 or the content is clearly a drawing, she gives a scored, in-character review that relates it back to herself. This is different from the round-1 roast: it is a warm, self-centered "critic" persona, and it only triggers on creative work.
- Guardrails: always praise first. Only comments on drawings, never on people's photos.

## 7. Voice-message comedy bits (MiMo TTS) — skill only
- Examples: when sleepy, she sends a voice message with yawns and mumbling ("唔…再睡五分钟…"); when someone has a birthday, she sings it in a deliberately off-key voice; she replies to a voice message with a voice message in the same tone ("你用气音我也用气音").
- Implementation: add bit templates to the existing voice parameterization (sleepy, singing off-key, whispering, dramatic narration). These are triggered by scenario rather than randomly. Recall that proactive voice messages are currently rare (about 7 in 20 days), so this would give voice a clear comedic role.
- Guardrails: at most 2 bit voice messages per day. Never at night (23:00–8:00). Text summary always alongside.

## 8. Sticker reaction chains / sticker battles (表情包对决) — skill only
- Experience: someone sends a sticker to 星野 → she counters with a sticker from her library that's "stronger". The second time: "（掏出了压箱底的）"; the third time she surrenders: "我输了，你这张太强了，我能收藏吗？"
- Implementation: uses the existing sticker library's context parameters. She keeps a "battle round" counter. She can ask to save the opponent's sticker into her library (with admin approval, linked to the existing import flow).
- Guardrails: one battle per 30 minutes. At most 3 rounds. Saving requires confirmation.

## 9. Reacting to group milestones (群事件反应) — needs a gate change
- Experience: a new member joins → "新人！先交出你的表情包库存。" The group hits 999 messages → "下一条是第1000条，谁抢到谁今天运气爆棚。" Someone comes back after a long absence → "你还活着！我以为你被外星人抓走了。"
- Implementation: requires gate support for join events and message counting. Whether the official QQ Bot API pushes member-join events is **unverified**. Message-count milestones and the "long absence" check can be done from logs.
- Guardrails: at most 1 milestone a day. No mention of anyone's absence if they've said they were busy or sick.

## 10. Gacha-style "星野今日签" / collectible quotes (抽卡收集) — skill only
- Experience: "/抽星野" → "SSR【深夜emo星野】：'你们都睡了吗……那我也睡了。'（收录 12/40）"
- Implementation: inspired by the wifegacha collection dex. She has a pool of quote cards with rarities. Rare cards are unlocked by group events (e.g. the card from her rivalry with 芙宁娜, or the easter egg cards).
- Guardrails: no in-group leaderboard pressure. Once a day per person. Purely cosmetic.

## Recommended ranking
1 → 3 → 4 → 7 → 2 → 8 → 6 → 10 → 5 → 9.
Bundle the gate changes (3 and 9) with the round-1 jealousy and copycat gate tweaks into one restart.
Unverified: whether the QQ Bot API pushes join events and whether bots can see other bots' messages; whether skill changes take effect without a reload.
