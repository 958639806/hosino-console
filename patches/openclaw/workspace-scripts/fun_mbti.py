#!/usr/bin/env python3
# 盲猜 MBTI：fun_mbti.py check <群id> <openid> [--zodiac]  → 允许就计一次数并返回护栏参数
import sys
from fun_common import *
a = [x for x in sys.argv[1:] if not x.startswith("--")]
if len(a) < 3 or a[0] != "check": out({"ok": False, "reason": "用法: check <群id> <openid> [--zodiac]"})
g, p = gk(a[1]), pid(a[2])
ok, why, H = hl_on("mbti", g, p)
if not ok: out({"ok": False, "reason": why})
M = {"includeZodiac": False, "minPublicMsgs": 20, "perPersonDailyCap": 1, "perGroupDailyCap": 5, "forbiddenTopics": ["健康", "疾病", "性取向", "宗教", "政治", "家庭", "收入"], **(H.get("mbti") or {})}
if "--zodiac" in sys.argv and not M["includeZodiac"]: out({"ok": False, "reason": "星座没开，只猜 MBTI"})
with lock():
    U = rd("mbti-usage.json", {"version": 1}); d = day()
    if U.get("day") != d: U = {"version": 1, "day": d, "people": {}, "groups": {}}
    if U["people"].get(p, 0) >= M["perPersonDailyCap"]: out({"ok": False, "reason": "今天已经给这个人猜过了"})
    if U["groups"].get(g, 0) >= M["perGroupDailyCap"]: out({"ok": False, "reason": "本群今天猜够了"})
    U["people"][p] = U["people"].get(p, 0) + 1; U["groups"][g] = U["groups"].get(g, 0) + 1; wr("mbti-usage.json", U)
out({"ok": True, "minPublicMsgs": M["minPublicMsgs"], "forbiddenTopics": M["forbiddenTopics"], "includeZodiac": M["includeZodiac"]})
