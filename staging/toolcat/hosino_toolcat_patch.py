#!/usr/bin/python3
# HOSINO-TOOLCAT v1 — QQ 群统一工具目录真正生效：主人目录在 nativeCronCreatorToolAllowlist===null 时也能捕获，
# 缓存上限 2→8，观测日志也记录主人回合（captured）。执行权限仍由 qq-group-owner-guard before_tool_call + 真实发言人校验。
# 用法: hosino_toolcat_patch.py --check | --apply | --revert | --register-manifest [--dry-run] | --unregister-manifest
#   HS_ROOT=<目录> 给所有绝对路径加前缀（离线测试），HS_BK=<目录> 改备份目录。
# 只改 dist 文件；node 已加载的模块不会重读，所以写入后要重启网关才生效。
import sys, os, json, hashlib, shutil, subprocess, tempfile

ROOT = os.environ.get("HS_ROOT", "")
P = lambda p: ROOT + p
H = "/home/ubuntu/.openclaw"
TARGET = "/home/ubuntu/.npm-global/lib/node_modules/openclaw/dist/mcp-http.runtime-C0W84mMK.mjs"
MANIFEST = H + "/patches/canonical-manifest.json"
BK = os.environ.get("HS_BK", "/root/hosino-backup-20261020-toolcat")
MARK = "HOSINO-TOOLCAT v1"
EXPECTED_OLD = "7364563c1f5c6b25d506d90fabc6a7ed82601886f25b8d74b4acca3a00bef97d"
sha = lambda b: hashlib.sha256(b).hexdigest()
fsha = lambda f: sha(open(P(f), "rb").read())

EDITS = [
 ("// QQ-CLAUDE-MCP-DESCRIPTOR-CATALOG v2. Only pure schemas cross sender boundaries.\n",
  "// QQ-CLAUDE-MCP-DESCRIPTOR-CATALOG v2. Only pure schemas cross sender boundaries.\n"
  "// HOSINO-TOOLCAT v1: owner capture no longer requires nativeCronCreatorToolAllowlist!==null; cap 2->8;\n"
  "// owner turns are observed. Execution stays gated by qq-group-owner-guard before_tool_call + real sender id.\n"),
 ("params.isGrantCurrent() === true && context.nativeCronCreatorToolAllowlist !== null && guard.isCurrentOwner?.(",
  "params.isGrantCurrent() === true && /* HOSINO-TOOLCAT v1 */ guard.isCurrentOwner?.("),
 ("while (QQ_CLAUDE_DESCRIPTOR_CATALOGS.size > 2) QQ_CLAUDE_DESCRIPTOR_CATALOGS",
  "while (QQ_CLAUDE_DESCRIPTOR_CATALOGS.size > 8 /* HOSINO-TOOLCAT v1 */) QQ_CLAUDE_DESCRIPTOR_CATALOGS"),
 ("params.isGrantCurrent() !== true || context?.nativeCronCreatorToolAllowlist === null || !",
  "params.isGrantCurrent() !== true || /* HOSINO-TOOLCAT v1 */ !"),
]

def patch(s):
    if MARK in s: return s, False
    for a, b in EDITS:
        n = s.count(a)
        if n != 1: raise SystemExit(f"[{MARK}] 锚点缺失或不唯一: {a[:70]!r} count={n}")
        s = s.replace(a, b)
    return s, True

def node_check(s):
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as t: t.write(s)
    r = subprocess.run(["node", "--check", t.name], capture_output=True, text=True); os.unlink(t.name)
    if r.returncode: raise SystemExit("node --check 失败:\n" + r.stderr[:800])

def write(f, s):
    st = os.stat(P(f)); tmp = P(f) + ".hstc-tmp"
    open(tmp, "w").write(s)
    try: os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(tmp, st.st_mode & 0o7777); os.replace(tmp, P(f))

def check(do_apply):
    s = open(P(TARGET)).read(); cur = fsha(TARGET)
    if MARK in s: print("已打过", TARGET, cur[:12]); return
    if cur != EXPECTED_OLD: raise SystemExit(f"[{MARK}] 现文件 sha {cur[:12]} != 预期 {EXPECTED_OLD[:12]}，拒绝修改")
    ns, _ = patch(s); node_check(ns)
    print("将修改", TARGET, "old=" + cur[:12], "new=" + sha(ns.encode())[:12], "(node --check OK)")
    if not do_apply: print("check OK（未写入）"); return
    os.makedirs(BK, exist_ok=True)
    for f in (TARGET, MANIFEST):
        dst = BK + "/" + f.strip("/").replace("/", "__")
        if os.path.exists(P(f)) and not os.path.exists(dst):
            shutil.copy2(P(f), dst)
            with open(BK + "/SHA256SUMS", "a") as o: o.write(f"{fsha(f)}  {f}\n")
    write(TARGET, ns)
    json.dump({TARGET: fsha(TARGET)}, open(BK + "/APPLIED_SHA256.json", "w"), indent=1)
    print("apply 完成（重启网关前不生效）；备份在", BK)

def revert():
    ap = json.load(open(BK + "/APPLIED_SHA256.json"))
    for f, h in ap.items():
        b = BK + "/" + f.strip("/").replace("/", "__")
        if fsha(f) != h: print("跳过（补丁后又被改过，需人工处理）", f); continue
        if sha(open(b, "rb").read()) != EXPECTED_OLD: raise SystemExit("备份 sha 不符，拒绝还原")
        write(f, open(b).read()); print("已还原", f, fsha(f)[:12])
    print("如已登记 manifest，请再跑 --unregister-manifest；重启网关后才回到旧行为")

def register(dry):
    mf = P(MANIFEST); m = json.load(open(mf)); cur = fsha(TARGET)
    if MARK not in open(P(TARGET)).read():
        if not dry: raise SystemExit("目标文件还没打补丁，先 --apply")
        cur = sha(patch(open(P(TARGET)).read())[0].encode()); print("[dry-run] 目标未打补丁，按预计补丁后 sha 演示")
    resdir = "resources/hosino-20261020-toolcat"; snap = resdir + "/snapshot-0"
    es = [e for e in m["files"] if e.get("target") == TARGET]
    if len(es) != 1: raise SystemExit(f"manifest 中目标条目数 {len(es)} != 1")
    e = es[0]
    print(("[dry-run] " if dry else "") + f"登记 {TARGET}: {e['sha256'][:12]} -> {cur[:12]}, snapshot={snap}, recognizedBefore+={e['sha256'][:12]}, marker={MARK}")
    if dry or e["sha256"] == cur: print("未写入" if dry else "已登记，跳过"); return
    os.makedirs(BK, exist_ok=True)
    if not os.path.exists(BK + "/canonical-manifest.json.pre-toolcat"): shutil.copy2(mf, BK + "/canonical-manifest.json.pre-toolcat")
    d = os.path.dirname(mf) + "/" + resdir; os.makedirs(d, exist_ok=True)
    sp = os.path.dirname(mf) + "/" + snap; shutil.copy2(P(TARGET), sp)
    try: ms = os.stat(mf); os.chown(sp, ms.st_uid, ms.st_gid); os.chown(d, ms.st_uid, ms.st_gid); os.chmod(sp, 0o600)
    except PermissionError: pass
    rb = e.setdefault("recognizedBefore", [])
    if e["sha256"] not in rb: rb.append(e["sha256"])
    e["sha256"] = cur; e["snapshot"] = snap
    if not any(r.get("label") == MARK for r in m["markerRegistry"]):
        m["markerRegistry"].append({"label": MARK, "targets": [TARGET], "marker": MARK})
    t = mf + ".hstc-tmp"; json.dump(m, open(t, "w"), ensure_ascii=False, indent=1)
    st = os.stat(mf)
    try: os.chown(t, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(t, st.st_mode & 0o7777); os.replace(t, mf)
    print("manifest 已更新；请跑 release_manager.py installed-check 与 reapply_all.sh --check")

def unregister():
    b = BK + "/canonical-manifest.json.pre-toolcat"; shutil.copy2(b, P(MANIFEST)); print("manifest 已还原为补丁前版本")

a = sys.argv[1:]
if "--apply" in a: check(True)
elif "--revert" in a: revert()
elif "--register-manifest" in a: register("--dry-run" in a)
elif "--unregister-manifest" in a: unregister()
else: check(False)
