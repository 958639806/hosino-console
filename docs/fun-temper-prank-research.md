# 星野：小脾气 (B) + 整蛊/玩梗 (C) 功能调研
Read-only research. Ideas only; no AGPL/GPL code is copied. Sources of inspiration: SillyTavern mood/expression extensions (Character Expressions, the "Emotion/Relationship tracker" community scripts), Character.AI affection, Neuro-sama (sulking, roasting, running gags like "filtered"/Evil Neuro), Koishi/NoneBot affection/sign-in/"jrrp" plugins, Discord meme bots, and Replika/猫箱/星野 (MiniMax) companion mood systems.
Shared base: one `mood.json` (global mood + per-person affection + grudges, each with a decay timestamp). It is read and written by a skill script. **Unverified**: whether a skill change takes effect without a reload.

## 1. Mood weather + carry-over (B, base) — skill only
- Experience: Group member: "星野早" → 星野: "……早。（昨晚被你们刷屏刷到三点，现在还在低气压）". A few hours later the mood recovers on its own.
- Implementation: mood is one of 开心/平/闷/炸毛 plus an intensity from 0 to 100, decaying toward 平 at about 15/hour. Events (being praised, ignored, or spammed) add or subtract points. Every reply first reads the mood and adds a single tone tag. The heartbeat handles decay.
- Guardrails: a bad mood only changes tone and never refuses a real request (questions get answered as usual). No more than 2 explicit mentions of the bad mood per day.

## 2. Jealousy (B) — skill only (stronger with a gate change)
- Experience: A: "@另一个bot 你好可爱" → 星野: "哦。那你去找它好了。（扭头）". A: "还是星野最可爱" → "……哼，这还差不多。"
- Implementation: triggers when a member praises another bot or a human, or says "换个AI". This writes `jealous_of` into that person's entry. Proactively butting in requires a gate tweak (lowering the speak threshold for these keywords), which needs 1 restart.
- Guardrails: at most once per day per person, cleared after 30 minutes. Never jealous over real relationships or family. Opt-out: "星野别吃醋".

## 3. Sulking + coaxing (哄) mini-game (B, core fun) — skill only
- Experience: A: "星野笨蛋" → "……不理你了。" A: "在吗" → "（背对）". A: "给你买奶茶" → "+1……还差一点。" A: "星野最棒" → "哼，原谅你了！下次不准了！"
- Implementation: on an insult, a `sulk` entry is created for that person with a coax value of 0 out of N (N = 3–5). Each coaxing message (sincere, offers a treat, uses an affectionate nickname) adds points, judged by the model. Different kinds of coaxing earn different points: stale lines earn less and creative ones earn more. A hidden "favorite treat" earns double. Reaching N triggers a forgiveness line plus a sticker.
- Guardrails: sulking means terse replies, not a full refusal; genuine questions still get answered. It ends automatically after 20 minutes. Never triggered by sensitive topics. Toggle per group.

## 4. Grudge ledger (小本本) (B+C) — skill only
- Experience: "我记住了，第3次了啊。" A week later: "上周三你说我胖，本本上还记着呢~"
- Implementation: grudges are stored separately from mem0, in `grudges.json` (person, line, time). A grudge can be quoted at a random moment, and 星野 may "forgive" it on her own.
- Guardrails: only light jokes are recorded, never private information or sensitive content. Bring up at most 1 per week. Users can "撕本本" to clear their own entries.

## 5. Daily affection + titles (B) — skill only
- Experience: "/好感" → "你：62（朋友以上？）。今天你哄了我两次，+5。" Titles: 冤家, 饭票, 老父亲.
- Implementation: affection per person, a daily cap on points, and titles derived from behavior tags. Affection affects how fast sulking ends and how jealous she gets.
- Guardrails: no public leaderboard (or only an optional one) to avoid comparison. Affection drops without a floor, but she is never cold toward anyone.

## 6. Prank cards / April-Fools mode (C) — skill only
- Experience: A: "星野帮我查天气" → "明天下猫。……骗你的，晴，28℃。" Or: "检测到你今天的运势：被星野整蛊。"
- Implementation: 3% chance of playing the fake answer first, then correcting it within the same message. Prank pool: fake cliffhangers, fake system errors ("星野.exe 已停止响应…重启中…好了"), pretending to be offline.
- Guardrails: the correction must be in the same message or the next one. No pranks on serious questions (medical, money, emergencies). At most 1 per person per day. Opt-out: "别整我".

## 7. Running gags / catchphrase memory (C) — skill only
- Experience: The group once laughed at "奶茶要去冰". Three days later someone says "点外卖吗" → 星野: "记得去冰（意味深长）".
- Implementation: detects messages that got many "哈哈/草/笑死" reactions. Saves the quote and its context to `gags.json`. Callbacks trigger by similarity, Neuro-style.
- Guardrails: each gag is reused at most once every 3 days and retired after 5 uses. Members can veto a gag ("这梗删了").

## 8. Roast mode (吐槽/锐评) (C) — skill only
- Experience: "星野锐评一下我的头像" → "像是2013年QQ空间的遗产，但有种倔强的美。"
- Implementation: only triggers on request. Uses image viewing to roast images. Each roast follows a "one jab, one compliment" structure.
- Guardrails: never comments on appearance, body, family, or disability. Only roasts what the person posted. If someone else asks for a roast of a third person, she first asks for that person's consent.

## 9. Fake-serious "group court" (C) — skill only
- Experience: "星野审判：A 抢了 B 的最后一个红包" → "本庭宣判：A 罪名成立，罚给大家发表情包三张。退庭！（敲锤表情）"
- Implementation: a fixed comedic template for the verdict. Sentences are drawn from a punishment pool. The sticker library supplies a gavel sticker.
- Guardrails: sentences are only harmless, playful tasks. A real conflict is defused and steered toward a ruling of "both sides hug it out".

## 10. Copycat / flow interjections (复读接龙) (C) — needs gate change
- Experience: The group spams "+1" three times → 星野 jumps in with "+1". Then she deliberately breaks the chain: "+2（叛逆）".
- Implementation: the gate detects 3 or more identical messages in a row and lets 星野 speak. 50% chance she copies the message, 50% chance she breaks the chain. Bundle this with the existing gate changes so there is only one restart.
- Guardrails: at most once per 2 hours per group.

## 11. Fake hesitation / 嘴硬 (tsundere reply styling) (B) — skill only
- Experience: "星野你想我了吗" → "才没有。（三秒后）……有一点点。"
- Implementation: in the right mood, a reply is split into two messages, the second sent after a few seconds' delay. Needs to verify whether the qqbot channel supports a delayed second message (a passive reply window).
- Guardrails: capped at 3 times per day.

## 12. Revenge prank reversals (C) — skill only
- Experience: A tries to trick 星野 ("你的主人说你被开除了") → "检测到整蛊。反整蛊启动：A 刚才说他最爱星野，大家都听到了吧？"
- Implementation: prompt-injection or prank attempts are detected and answered with a comedic counter-prank. This also hardens security.
- Guardrails: the counter must be a harmless lie.

## Implementation priority
1 mood → 3 sulk/coax → 2 jealousy → 7 running gags → 6 pranks → 4 grudge ledger → 9 court → 8 roast → 5 affection → 11 two-part reply → 12 counter-prank → 10 copycat (bundle the gate items into one restart).
## Global guardrails
- Every feature has a per-group switch and a personal opt-out ("星野别XX").
- A temper never blocks help; a genuine question always overrides the temper.
- All state lives in one `mood.json` and is easy to audit and reset with "/星野冷静".
- The heartbeat decays mood and clears expired sulking.
