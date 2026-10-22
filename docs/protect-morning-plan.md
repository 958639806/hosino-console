# 护短 / 抢早安沙发：只读方案
2026-10-20 21:40（UTC+8）。全程只读：主机上只读了 gate 源码。只改了暂存区，没部署。

## 关键事实
- gate 的 `before_dispatch`（index.js 约 :513–525，注释写着“Never drop … full receive”）会把**所有群消息**都交给模型。`isAddressed()`（:82）只用来标记“本轮是在叫她”（@、回复、叫名字），给提示用，不负责拦截。
  - 所以**不 @ 她也能触发**，模型本来就每条都看，只是平常多半选择 stay_silent。
  - gate 改动的作用是：在代码里判断门槛和上限，再往 appendContext 注入一行“可以出手”，不靠模型自觉。
- 群 heartbeat 在 :532 直接跳过，HEARTBEAT.md 也是空的，所以现在**没有主动发言的通道**。
- 两项都不加任何延迟。

## 1 护短
**怎么判断“损得过了”**：在 gate 的 `before_dispatch` 里，每个群维护一个内存滑动窗口（`roastWindowMin` 默认 5 分钟）。
- 一条消息同时满足“提到了某个人（@他、回复他，或者出现称呼表里的名字）”和“命中 `roastKeywords`”，就给那个人记一次。
- 窗口内记满 `roastMinHits`（默认 3），并且损他的人数达到 `roastMinPeople`，就算“过了”。
- 被损的人自己回了哈哈、表情包，说明是在玩：照样可以护，而且语气更玩笑。如果他沉默或回了 `fightKeywords`，就转成劝和。
- 窗口内命中 `fightKeywords` 视为真吵架：注入“有人真生气了，劝和、别站队、别玩梗”（`mediateRealFights`）。
- 通过门槛后，按 `probability` 掷骰，再检查上限（每群每天 2 次、同一个被护的人每天 1 次）和技术模式，都通过才在下一轮 appendContext 注入“B 在连着损 A，可以护一下 A（玩笑口吻）”。
- 模型做最终判断：语境不像玩笑就不接。随机站边写在技能里，避免总护同一个人。
- 不 @ 她也能触发，**需要改 gate**（计数和上限要在代码里）。纯技能版只能靠模型自己察觉，频率不可控，不推荐。
- 芙宁娜等 isBot 的发言不计数。

## 2 抢早安沙发
- **怎么判断群有早安习惯**：gate 的 `before_dispatch` 用 `greetingKeywords`（整条消息很短，并且以“早/早安…”开头）在 `windowStartHour`–`windowEndHour`（默认 5–11 点）内计数，每群每天记一个布尔值，落盘到 `fun/morning.json`（只存日期和第一个说早的人的 openid）。近 `habitWindowDays`（14 天）里有 ≥`habitMinDays`（4 天）就算有习惯。
- **passive（默认，不需要额外批准）**：她没法抢在所有人前面。当天这个群**第一条**早安消息进来时，gate 注入“B 今天抢到了早安沙发，可以说：可恶，B 你几点起的？”，每群每天 1 次。
  - 如果第一个说早的人很早（比如 7 点前），她可以夸一句；如果是凛，可以撒娇。
  - “早！（今天我第一）”在 passive 模式下**做不到**，因为没人说话她就不会有回合。
- **heartbeat 模式**：`heartbeatHour`（7 点）有一次群 heartbeat，并且当天还没人说早，就由她先说“早！（今天我第一）”。这要**另行批准**：开启群 heartbeat 的配置，并改 :532 让早安这一项放行。开销是每群每天多一次 API 调用（只在这一个时刻，不是每 25 分钟）。批准前，schema 里的 heartbeat 值按 passive 处理（API 的 `requires` 里有说明）。
- 和 humanlike 的 `proactive` 是两回事：早安不占主动搭话的日上限，但同样受总开关、按群开关、退出名单和技术模式控制。

## 参数（已加进暂存的 humanlike schema，默认全关）
新增 `protect.*` 和 `morning.*`，字段表见 `staging/fun/API-v2.12-fun.md` 的“拟人化追加”一节。`perGroup` 和 `optOut` 也支持这两个功能名。测试 `node test/console-fun.mjs patched/server.mjs` 全部通过（新增 1 组检查，6 种非法输入），diff 已重新生成。

## 合并上线
- 两项都写进同一个 **HOSINO-FUN-CONTEXT** gate 补丁：before_dispatch 计数（损度窗口、早安首条），before_prompt_build 注入最多 1 行。和黑话词典、称呼表、回旋镖、吃醋、拟人化一起，**一次网关重启**。
- 控制台 schema 已经在 v2.12 里，**一次控制台重启**。
- 新状态文件：`fun/morning.json`（gate 写入，ubuntu 用户可写）。损度窗口只放在内存里，重启后清零，可以接受。
- 早安的 heartbeat 模式**不在这次重启范围内**，以后要单独批准。

## 风险和测试
- 风险：
  - 损话词会误判，比如“菜”说的是食物。所以要求同时“提到某个人”，并且最后由模型判断语境。
  - 护短可能被当成站队拱火：设了每人每天上限，真吵架时转劝和。
  - 早安可能变成刷屏：每天最多 1 次，并且只在有习惯的群。
- 测试：
  - 单元测试：模拟消息流，测窗口计数、吵架转劝和、上限、isBot 忽略、早安首条判断、习惯天数统计、技术模式屏蔽。
  - 主机上 `node --check`，`reapply_all.sh --check`。
  - 重启后看 `[hosino-fun]` 日志，然后由凛在群里实测。
