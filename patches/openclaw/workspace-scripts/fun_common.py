# HOSINO-FUN-CONTEXT v1 共用：读 fun/params.json、humanlike.json、gate-state.json；原子写；文件锁。默认全关。
import os, json, re, time, fcntl, contextlib
FUN = os.environ.get("HS_FUN_DIR", os.path.expanduser("~/.openclaw/workspace/fun"))
PID = re.compile(r"[0-9A-Fa-f]{32}")
def rd(name, default):
    try:
        with open(os.path.join(FUN, name)) as f: return json.load(f)
    except Exception: return default
def wr(name, obj):
    os.makedirs(FUN, exist_ok=True); obj["updatedAt"] = int(time.time() * 1000)
    p = os.path.join(FUN, name); t = p + ".tmp-%d" % os.getpid()
    with open(t, "w") as f: json.dump(obj, f, ensure_ascii=False, indent=1)
    os.chmod(t, 0o644); os.replace(t, p)
@contextlib.contextmanager
def lock():
    os.makedirs(FUN, exist_ok=True)
    with open(os.path.join(FUN, ".script.lock"), "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX); yield
def pid(x):
    m = PID.search(str(x or "")); 
    if not m: out({"ok": False, "reason": "需要 32 位 QQ openid"})
    return m.group(0).upper()
def gk(x):
    m = re.search(r"[0-9a-f]{32}", str(x or "").lower())
    if not m: out({"ok": False, "reason": "需要群 id（32 位 hex）"})
    return "group:" + m.group(0)
def day(): return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 8 * 3600))
def self_out(p): return rd("gate-state.json", {}).get("selfOptOut", {}).get(p, [])
def fun_on(feat, g, p):
    P = rd("params.json", {}); s = P.get(feat) or {}
    if P.get("enabled") is not True or s.get("enabled") is not True: return False, "未开启"
    pg = (s.get("perGroup") or {}).get(g)
    if not (pg["enabled"] if isinstance(pg, dict) and isinstance(pg.get("enabled"), bool) else s.get("defaultEnabled") is True): return False, "本群未开启"
    oo = (P.get("optOut") or {}).get(p, []) + [x.split(":", 1)[1] for x in self_out(p) if x.startswith("fun:")]
    if "all" in oo or feat in oo: return False, "对方已退出"
    return True, ""
def hl_on(feat, g, p):
    H = rd("humanlike.json", {})
    if H.get("enabled") is not True or (H.get(feat) or {}).get("enabled") is not True: return False, "未开启", H
    pg = (H.get("perGroup") or {}).get(g)
    if isinstance(pg, dict) and (pg.get("enabled") is False or pg.get(feat) is False): return False, "本群未开启", H
    oo = (H.get("optOut") or {}).get(p, []) + [x.split(":", 1)[1] for x in self_out(p) if x.startswith("hl:")]
    if "all" in oo or feat in oo: return False, "对方已退出", H
    return True, "", H
def out(o): print(json.dumps(o, ensure_ascii=False)); raise SystemExit(0)
