#!/usr/bin/python3
# HOSINO-FUN-CONTEXT v1 — qq-group-followup-gate 接入 fun-context.mjs（小脾气 + 拟人化）。
# index.js 只加 4 处小改动：动态 import（加载失败只记日志）、before_dispatch 观察、before_prompt_build 往 appendContext 追加一行、gateway_stop 落盘。
# appendSystemContext 不动。默认两份参数都关 → 输出与补丁前逐字节一致。
# 用法: hosino_fun_patch.py --check | --apply | --revert | --register-manifest [--dry-run] | --unregister-manifest
#   HS_ROOT=<目录> 给所有绝对路径加前缀（离线测试），HS_BK=<目录> 改备份目录，HS_SRC=<目录> fun-context.mjs 所在目录（默认脚本同目录）。
# 插件不能热加载：写入后要重启网关才生效。
import sys, os, json, hashlib, shutil, subprocess, tempfile

ROOT = os.environ.get("HS_ROOT", "")
P = lambda p: ROOT + p
H = "/home/ubuntu/.openclaw"
PD = H + "/plugins/qq-group-followup-gate"
TARGET = PD + "/index.js"
NEWF = PD + "/fun-context.mjs"
SRC = os.path.join(os.environ.get("HS_SRC", os.path.dirname(os.path.abspath(__file__))), "fun-context.mjs")
MANIFEST = H + "/patches/canonical-manifest.json"
BK = os.environ.get("HS_BK", "/root/hosino-backup-20261020-fun")
MARK = "HOSINO-FUN-CONTEXT v1"
EXPECTED_OLD = "c19a5d661d08a5381e45d672fd3ad150173a8fa6f3ba820c34e45b7712e0f4a5"
sha = lambda b: hashlib.sha256(b).hexdigest()
fsha = lambda f: sha(open(P(f), "rb").read())

EDITS = [
 ("    const log = (m) => api.logger?.info?.(`[qq-group-followup-gate] ${m}`);\n",
  "    const log = (m) => api.logger?.info?.(`[qq-group-followup-gate] ${m}`);\n"
  "    /* HOSINO-FUN-CONTEXT v1: 小脾气+拟人化（参数默认全关；加载或运行出错都只记日志，不影响本轮） */\n"
  "    let hsFun = null;\n"
  "    import(\"./fun-context.mjs\").then((m) => { hsFun = m.createFunContext({ dir: path.join(mediaCfg().workspace, \"fun\"), log }); }).catch((e) => log(`fun-context load failed: ${e?.message || e}`));\n"
  "    api.on(\"gateway_stop\", () => { try { hsFun?.flush(); } catch { /* HOSINO-FUN-CONTEXT v1 */ } });\n"),
 ("          log(`addressed session=${sk}`);\n        }\n        return; // full receive: let everything through\n",
  "          log(`addressed session=${sk}`);\n        }\n"
  "        try { hsFun?.onDispatch(event, ctx); } catch (e) { log(`fun dispatch error: ${e?.message || e}`); } /* HOSINO-FUN-CONTEXT v1 */\n"
  "        return; // full receive: let everything through\n"),
 ("      if (stableWrapper) return {\n        appendSystemContext: [base, fixedIdentityHint].join(\"\\n\"),\n",
  "      try { const hsFh = hsFun?.hint(sk, ctx, { addressed: addressed || ownerNeedsReply }); if (hsFh) hint += (hint ? \"\\n\" : \"\") + hsFh; } catch (e) { log(`fun hint error: ${e?.message || e}`); } /* HOSINO-FUN-CONTEXT v1: appendContext only */\n"
  "      if (stableWrapper) return {\n        appendSystemContext: [base, fixedIdentityHint].join(\"\\n\"),\n"),
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

def write(f, s, like=None):
    ref = P(like or f); st = os.stat(ref); tmp = P(f) + ".hsfun-tmp"
    open(tmp, "w").write(s)
    try: os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(tmp, 0o644 if like else st.st_mode & 0o7777); os.replace(tmp, P(f))

def bkname(f): return BK + "/" + f.strip("/").replace("/", "__")

def check(do_apply):
    s = open(P(TARGET)).read(); cur = fsha(TARGET); src = open(SRC).read(); node_check(src)
    if MARK in s:
        same = os.path.exists(P(NEWF)) and open(P(NEWF)).read() == src
        print("已打过", TARGET, cur[:12], "fun-context.mjs", "一致" if same else "不一致/缺失"); return
    if cur != EXPECTED_OLD: raise SystemExit(f"[{MARK}] 现文件 sha {cur[:12]} != 预期 {EXPECTED_OLD[:12]}，拒绝修改")
    if os.path.exists(P(NEWF)): raise SystemExit(f"[{MARK}] {NEWF} 已存在但 index.js 未打补丁，请人工检查")
    ns, _ = patch(s); node_check(ns)
    print("将修改", TARGET, "old=" + cur[:12], "new=" + sha(ns.encode())[:12], "(node --check OK)")
    print("将新增", NEWF, "sha=" + sha(src.encode())[:12])
    if not do_apply: print("check OK（未写入）"); return
    os.makedirs(BK, exist_ok=True)
    for f in (TARGET, MANIFEST):
        if os.path.exists(P(f)) and not os.path.exists(bkname(f)):
            shutil.copy2(P(f), bkname(f))
            with open(BK + "/SHA256SUMS", "a") as o: o.write(f"{fsha(f)}  {f}\n")
    write(NEWF, src, like=TARGET)
    write(TARGET, ns)
    json.dump({TARGET: fsha(TARGET), NEWF: fsha(NEWF)}, open(BK + "/APPLIED_SHA256.json", "w"), indent=1)
    print("apply 完成（重启网关前不生效）；备份在", BK)

def revert():
    ap = json.load(open(BK + "/APPLIED_SHA256.json"))
    if fsha(TARGET) != ap[TARGET]: raise SystemExit("index.js 补丁后又被改过，需人工处理")
    b = bkname(TARGET)
    if sha(open(b, "rb").read()) != EXPECTED_OLD: raise SystemExit("备份 sha 不符，拒绝还原")
    write(TARGET, open(b).read()); print("已还原", TARGET, fsha(TARGET)[:12])
    if os.path.exists(P(NEWF)): os.replace(P(NEWF), BK + "/fun-context.mjs.removed"); print("已移走", NEWF)
    print("如已登记 manifest，请再跑 --unregister-manifest；重启网关后才回到旧行为")

def register(dry):
    mf = P(MANIFEST); m = json.load(open(mf))
    if MARK not in open(P(TARGET)).read():
        if not dry: raise SystemExit("目标文件还没打补丁，先 --apply")
        cur = sha(patch(open(P(TARGET)).read())[0].encode()); nsha = sha(open(SRC, "rb").read()); print("[dry-run] 目标未打补丁，按预计补丁后 sha 演示")
    else: cur = fsha(TARGET); nsha = fsha(NEWF)
    resdir = "resources/hosino-20261020-fun"
    es = [e for e in m["files"] if e.get("target") == TARGET]
    if len(es) != 1: raise SystemExit(f"manifest 中目标条目数 {len(es)} != 1")
    e = es[0]; ne = [x for x in m["files"] if x.get("target") == NEWF]
    print(("[dry-run] " if dry else "") + f"登记 {TARGET}: {e['sha256'][:12]} -> {cur[:12]}; 新增 {NEWF} sha={nsha[:12]}; marker={MARK}")
    if dry or (e["sha256"] == cur and ne and ne[0]["sha256"] == nsha): print("未写入" if dry else "已登记，跳过"); return
    os.makedirs(BK, exist_ok=True)
    if not os.path.exists(BK + "/canonical-manifest.json.pre-fun"): shutil.copy2(mf, BK + "/canonical-manifest.json.pre-fun")
    d = os.path.dirname(mf) + "/" + resdir; os.makedirs(d, exist_ok=True)
    ms = os.stat(mf)
    for i, f in enumerate((TARGET, NEWF)):
        sp = d + f"/snapshot-{i}"; shutil.copy2(P(f), sp)
        try: os.chown(sp, ms.st_uid, ms.st_gid); os.chmod(sp, 0o600)
        except PermissionError: pass
    try: os.chown(d, ms.st_uid, ms.st_gid)
    except PermissionError: pass
    rb = e.setdefault("recognizedBefore", [])
    if e["sha256"] not in rb: rb.append(e["sha256"])
    e["sha256"] = cur; e["snapshot"] = resdir + "/snapshot-0"
    if ne: ne[0].update({"sha256": nsha, "snapshot": resdir + "/snapshot-1"})
    else: m["files"].append({"target": NEWF, "sha256": nsha, "snapshot": resdir + "/snapshot-1", "recognizedBefore": [None], "syntax": "esm", "mode": 420})
    if not any(r.get("label") == MARK for r in m["markerRegistry"]):
        m["markerRegistry"].append({"label": MARK, "targets": [TARGET, NEWF], "marker": MARK})
    t = mf + ".hsfun-tmp"; json.dump(m, open(t, "w"), ensure_ascii=False, indent=1)
    try: os.chown(t, ms.st_uid, ms.st_gid)
    except PermissionError: pass
    os.chmod(t, ms.st_mode & 0o7777); os.replace(t, mf)
    print("manifest 已更新；请跑 release_manager.py installed-check 与 reapply_all.sh --check")

def unregister():
    b = BK + "/canonical-manifest.json.pre-fun"; shutil.copy2(b, P(MANIFEST)); print("manifest 已还原为补丁前版本")

a = sys.argv[1:]
if "--apply" in a: check(True)
elif "--revert" in a: revert()
elif "--register-manifest" in a: register("--dry-run" in a)
elif "--unregister-manifest" in a: unregister()
else: check(False)
