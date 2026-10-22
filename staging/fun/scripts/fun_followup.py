#!/usr/bin/env python3
# 追问近况：fun_followup.py add <群id> <openid> <YYYY-MM-DD[THH:MM]> <事件> [--sensitive]
# 只记“有日期的未来事件”；什么时候问由 gate 决定（每人每天上限、只问一次、敏感话题规则）。
import sys, time, random, string, datetime
from fun_common import *
a = [x for x in sys.argv[1:] if x != "--sensitive"]; sens = "--sensitive" in sys.argv
if len(a) < 5 or a[0] != "add": out({"ok": False, "reason": "用法: add <群id> <openid> <日期> <事件> [--sensitive]"})
g, p = gk(a[1]), pid(a[2]); ev = " ".join(a[4:]).strip()[:60]
ok, why, H = hl_on("followup", g, p)
if not ok: out({"ok": False, "reason": why})
try:
    d = datetime.datetime.fromisoformat(a[3] if "T" in a[3] else a[3] + "T20:00")
    due = int((d - datetime.timedelta(hours=8)).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)  # 按新加坡时间
except Exception: out({"ok": False, "reason": "日期格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM"})
if due < time.time() * 1000 - 86400000: out({"ok": False, "reason": "事件已经过去太久"})
with lock():
    F = rd("followups.json", {"version": 1, "items": []}); items = F.setdefault("items", [])
    if any(i.get("person") == p and i.get("event") == ev for i in items): out({"ok": True, "dup": True})
    mine = [i for i in items if i.get("person") == p]
    if len(mine) >= 10: items.remove(mine[0])
    items.append({"id": "f_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8)), "person": p, "group": g, "event": ev, "dueAt": due, "sensitive": sens, "addedAt": int(time.time() * 1000)})
    cut = time.time() * 1000 - 90 * 86400000; F["items"] = [i for i in items if i.get("dueAt", 0) > cut]; wr("followups.json", F)
out({"ok": True})
