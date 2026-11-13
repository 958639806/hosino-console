#!/usr/bin/env python3
# 记仇小本本：fun_grudge.py add <群id> <openid> <原话>   （翻旧账由 gate 决定，这里只记）
import sys, time, random, string
from fun_common import *
a = sys.argv[1:]
if len(a) < 4 or a[0] != "add": out({"ok": False, "reason": "用法: add <群id> <openid> <原话>"})
g, p, q = gk(a[1]), pid(a[2]), " ".join(a[3:]).strip().replace("\n", " ")
ok, why = fun_on("grudge", g, p)
if not ok: out({"ok": False, "reason": why})
P = rd("params.json", {}).get("grudge", {}); mq = int(P.get("maxQuoteChars", 40)); me = int(P.get("maxEntriesPerPerson", 20))
if not q: out({"ok": False, "reason": "原话为空"})
with lock():
    G = rd("grudges.json", {"version": 1, "people": {}}); per = G.setdefault("people", {}).setdefault(p, {"entries": []})
    q = q[:mq]; ex = next((e for e in per["entries"] if e.get("quote") == q and e.get("group") == g), None)
    if ex: ex["count"] = ex.get("count", 1) + 1; ex["at"] = int(time.time() * 1000)
    else: per["entries"].append({"id": "g_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8)), "group": g, "quote": q, "at": int(time.time() * 1000), "count": 1})
    per["entries"] = per["entries"][-me:]; wr("grudges.json", G)
out({"ok": True, "entries": len(per["entries"])})
