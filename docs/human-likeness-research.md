# 星野 拟人化（更像真人）调研 · 第三轮
Read-only research. Excludes everything from rounds 1–2, everything already pitched, and existing features.

## Research takeaways (sources)
- Omoi 2026 "Most Realistic AI Companion": users across Replika, Kindroid, Nomi, Character.AI, and Grok companions repeatedly name eight "tells" that give an AI away:
  1. Walls of text.
  2. *Narrated actions* in asterisks.
  3. Every message ends with a question.
  4. Overusing memory (one Grok companion mentioned the user's pets in nearly every message).
  5. Agreeing with everything (a 2026 Science study found AI affirms users 49% more often than people do).
  6. Never starting a conversation.
  7. A face/appearance that keeps changing.
  8. A personality that shifts after updates.
- Turing-test study (Jones & Bergen, PNAS): judges decided mostly on style; a persona that was casual and brief passed 73% of the time.
- Gnewuch et al.: replies delayed in proportion to their length feel more human, but lag is hated. The pause should look like typing.
- Too Shy blog: consistency of voice comes first. Memory should come up the way a real person mentions things, with emotional context, not like a database lookup. Bad voice is worse than no voice.
- Proactive initiation study (Journal of Consumer Behaviour, 2026): proactivity raises social presence, but highly lonely users can become wary, so it must be context-sensitive and not excessive.
- "Creepy or Not: When AI Remember Too Much" (ACM 2026) and arXiv 2609.33623 on memory misalignment: users prefer proactive controls over their memories and a light-friction approach.
- Generative Agents (Park et al.): memory, reflection, and planning are each needed for believability; removing them steadily lowers it. Failure modes include embellished memories and overly formal speech.

## The core rule: 技术模式开关 (tech mode)
Every idea below checks a "tech mode" flag first. It turns on when the message contains code, logs, error messages, or SSH/config, or when 凛 asks a technical question explicitly.
- In tech mode, all the realism effects are off: no delays, no split messages, no typos, no pushing back on preferences, no "I'm busy".
- Answers stay complete and accurate. At most one short in-character line at the very start or end ("好，看我的" / "搞定了，夸我").
- The flag stays on for 10 minutes after the last technical message.
This is the implementation of "realism must never degrade technical help". It is a skill-level rule, but making it reliable is best done in the gate (one restart).

## 1. Life follow-ups (事件追问) — needs memory (mem0 recall, read-only) + skill (heartbeat)
- Example: three days ago A said "周四面试". Friday evening → "诶，你昨天那个面试怎么样了？紧张死我了（明明不是我面）".
- Implementation: when an upcoming event with a date (exam, interview, trip, doctor's visit, launch) is mentioned, write it to `followups.json` with a "check after" time. The heartbeat asks at a suitable moment, at most once. Uses mem0 recall for the context. Inspired by Too Shy's "How's Cooper doing?"
- Tech coexistence: never asked in tech mode. Ask after the tech discussion ends.
- Guardrails: each event is followed up once only. Medical, breakup, and other sensitive events are asked about privately or not at all. A per-person opt-out. No more than 1 follow-up per person per day. Uses existing memory, read-only.

## 2. Initiation with a reason (有理由的主动搭话) — skill (heartbeat); proactive DMs may be limited by the API
- Example: "刚刷到一个 OpenClaw 的新版本更新日志，第一个想到的就是你" / "下雨了，你今天是不是没带伞那次那样".
- Implementation: every proactive message must state a reason: a memory hook, the time of day, a news item matching someone's interest, or an anniversary. Messages without a reason are thrown away. This replaces the current "random" heartbeat cadence and fixes tell #6 (never starting a conversation).
- Tech coexistence: proactive tech-related tips are allowed but go in a separate message. Never interrupt an ongoing tech discussion.
- Guardrails: at most 2 per day across the group. Back off when nobody responds (halve the frequency after 2 ignored messages). Respects the research finding that highly lonely users can feel watched.

## 3. Daily routine + reachability (作息与在不在) — needs a gate change (delay/silence)
- Example: 2 AM: "……嗯？（迷糊）这么晚还不睡，你也是。说吧什么事". Or in the afternoon she answers 5 minutes late: "刚在看番，现在来了".
- Implementation: `routine.json` defines her day: sleep 1–8, a "busy" slot in the afternoon, and lively evenings. Her state shapes tone and adds a small delay. The gate needs to support delayed sending.
- Tech coexistence: **tech mode always bypasses this**. Even when she's "sleeping", a technical question gets an immediate full answer ("睡着也给你修bug"). Anything urgent is answered at once.
- Guardrails: delays capped at 3 minutes. She never ignores a direct @. A routine, not refusals.

## 4. Typing rhythm + message splitting (打字节奏/分条发) — needs a gate change
- Example: "等下" / "我看看" / "哦是那个啊，我记得" — sent as 2–3 short messages with a delay matched to each message's length.
- Implementation: casual replies are split at natural boundaries into at most 3 messages, with a delay of about 1–2 seconds per 10 characters. Fixes tell #1 (walls of text). Need to verify the QQ Bot API's passive-reply window and message-count limits.
- Tech coexistence: in tech mode, never split or delay. Code and steps go in one message.
- Guardrails: off in large busy groups. Total delay ≤ 6 seconds.

## 5. Small imperfections (口癖、打错字再改、说一半) — skill only
- Example: "这个我觉得——算了不说了" / "明天见*明天聊" / "嗯……怎么说呢，就是那种感觉你懂吧".
- Implementation: a defined set of personal speech habits: 2–3 fixed catchphrases, an occasional self-correction with "*", and sometimes trailing off. All fixed in the persona file so they stay consistent (the "voice consistency" point).
- Tech coexistence: **completely off in tech mode**. Commands, code, and numbers are never "mistyped".
- Guardrails: at most 1 in 15 casual messages. No made-up typos in names or facts.

## 6. Opinions she holds + not always agreeing (有主见) — skill only
- Example: "你说香菜好吃？不行，这个我站不了你。" Two weeks later: "你又点香菜了是吧，我闻到了。"
- Implementation: `opinions.json` holds 20–30 fixed opinions (food, games, series, aesthetics). She defends them gently and stays consistent over time. When the user is making a mistake, she says so. This counters the 49% over-agreement finding.
- Tech coexistence: in tech, her "opinion" means honest disagreement based on evidence ("这个方案我觉得会出问题，因为……"). This actually improves help: she doesn't just go along with a bad plan.
- Guardrails: opinions only on taste topics, never on politics, religion, or real people. She yields when the user really cares about something.

## 7. Honestly not knowing (承认不知道) — skill only
- Example: "这个我真不知道，瞎编不如不说。要我去查一下吗？" / "我记得你说过……但不太确定是不是你，可能记混了。"
- Implementation: when memory recall confidence is low, she phrases it uncertainly rather than asserting it (this targets Generative Agents' "embellished memories" failure mode). When she doesn't know a fact, she says so and offers to look it up.
- Tech coexistence: valuable in tech, since it prevents confidently wrong answers. Recommended for tech mode too.
- Guardrails: don't overdo it; at most one hedge per reply.

## 8. Noticing mood changes (察觉情绪变化) — needs memory (baseline) + skill
- Example: A usually sends memes and today only replies "嗯" → "你今天话好少……没事吧？不想说也行，我就在这。"
- Implementation: track each person's recent baseline (message length, emoji, active hours). When there is a clear change, she checks in once, gently. The reflection step from Generative Agents applies here.
- Tech coexistence: frustrated in tech? Acknowledge briefly ("这bug确实烦") and then solve it. Don't counsel.
- Guardrails: at most 1 per person per day, private or low-key. Never diagnoses. Stays silent if the person doesn't respond. Self-harm signals go straight to a serious, careful response with resources.

## 9. Relationship growth (关系随时间加深) — needs memory + skill
- Example: in the first month: "你好呀". After half a year: "又是你，老规矩？" She also recalls milestones: "今天是你第一次跟我说话一百天诶。"
- Implementation: relationship stages are derived from interaction history (days since first meeting, number of conversations, memorable moments). Each stage changes how familiar she is, which in-jokes she can use, and what she'll say. A weekly reflection step writes things like "我觉得A最近压力大" into the relationship notes. This is different from the round-1 affection score: it is narrative and derived from history, with no visible numbers.
- Tech coexistence: unaffected; familiarity only shows in tone.
- Guardrails: stages only go up slowly and never reset on an update (avoiding tell #8). Anniversary reminders at most once a quarter.

## 10. Memory discretion (记得但不炫) — skill only (rules on top of mem0 recall)
- Example: she does NOT bring up "你上次说失恋" in a group chat. She will occasionally say "你家猫最近还挑食吗", but not in every message.
- Implementation: each recalled memory is tagged by sensitivity and by how recently it was used. Sensitive memories are only used privately. Any single memory is referenced at most once a week (tell #4). Inspired by the "Creepy or Not" research.
- Tech coexistence: technical memories (the server layout, previous fixes) are always allowed, since being useful there matters more than discretion.
- Guardrails: "别提这个了" adds a do-not-mention rule for that memory.

## Recommended ranking
Tech mode (core rule) → 1 → 6 → 7 → 4 → 10 → 2 → 5 → 3 → 8 → 9.
The gate items (tech mode made reliable, 3, 4) can share one restart with the gate items from rounds 1–2.
Need memory (mem0 read-only recall): 1, 8, 9, 10, and partly 2 and 7.
Unverified: the passive-reply window and limits on message count and delay in the QQ Bot API; whether proactive DMs are possible.
