#!/usr/bin/python3
# HOSINO-TOOLFP v1 + QQ-CLAUDE-KEEPALIVE v1
# (A) 统一 QQ 全目录群的 promptToolNamesHash：成员回合用主人捕获目录(61)的名字算 hash，主人/成员交替复用同一 claude 进程。
#     执行权限不变：成员调用主人工具仍由 MCP 每回合按真实发言人解析(占位工具返回错误) + qq-group-owner-guard before_tool_call 拦截。
#     只有成员工具名 ⊆ 捕获目录时才替换；其他任何指纹变化仍重启进程。
# (B) 两群 + 凛私聊(agent:main:main) 的 claude 进程空闲 12h 才关，其他会话仍 10 分钟。
# 用法: --check | --apply | --revert | --register-manifest [--dry-run] | --unregister-manifest
import sys, os, json, hashlib, shutil, subprocess, tempfile
ROOT = os.environ.get("HS_ROOT", ""); P = lambda p: ROOT + p
D = "/home/ubuntu/.npm-global/lib/node_modules/openclaw/dist"
MANIFEST = "/home/ubuntu/.openclaw/patches/canonical-manifest.json"
BK = os.environ.get("HS_BK", "/root/hosino-backup-20261020-toolfp")
sha = lambda b: hashlib.sha256(b).hexdigest()
fsha = lambda f: sha(open(P(f), "rb").read())

ORIG_HASH = "const promptToolNamesHash = bundleMcpEnabled && mcpLoopbackRuntime ? hashCliSessionText(JSON.stringify(promptTools.map((tool) => tool.name).toSorted())) : void 0;"
NEW_HASH = ("const promptToolNamesHash = (() => {\n"
 "\t\t\tconst nativeHash = bundleMcpEnabled && mcpLoopbackRuntime ? hashCliSessionText(JSON.stringify(promptTools.map((tool) => tool.name).toSorted())) : void 0;\n"
 "\t\t\t// HOSINO-TOOLFP v1: full-catalog QQ group -> hash the owner-captured catalog names (what the model is shown).\n"
 "\t\t\ttry {\n"
 "\t\t\t\tif (!nativeHash) return nativeHash;\n"
 "\t\t\t\tconst hsGuard = globalThis[Symbol.for(\"openclaw.qqGroupOwnerGuard\")];\n"
 "\t\t\t\tconst hsCat = globalThis[Symbol.for(\"hosino.toolcatNames\")]?.get?.(params.sessionKey);\n"
 "\t\t\t\tif (!hsCat || hsCat.guard !== hsGuard || hsGuard?.active !== true || hsGuard.isFullCatalogGroup?.(params.sessionKey) !== true) return nativeHash;\n"
 "\t\t\t\tconst hsSet = new Set(hsCat.names);\n"
 "\t\t\t\tconst hsOwn = promptTools.map((tool) => tool.name);\n"
 "\t\t\t\tif (!hsOwn.every((name) => hsSet.has(name))) return nativeHash;\n"
 "\t\t\t\tconst hsUnified = hashCliSessionText(JSON.stringify(hsCat.names));\n"
 "\t\t\t\tif (hsUnified !== nativeHash) console.info(\"[hosino-toolfp] \" + JSON.stringify({ v: 1, unified: true, own: hsOwn.length, catalog: hsCat.names.length }));\n"
 "\t\t\t\treturn hsUnified;\n"
 "\t\t\t} catch { return nativeHash; }\n"
 "\t\t})();")
CAT_ANCHOR = "QQ_CLAUDE_DESCRIPTOR_CATALOGS.set(context.sessionKey, { guard, epoch, schema });"
CAT_NEW = CAT_ANCHOR + (" /* HOSINO-TOOLFP v1: publish names only (no schema/authority) for prompt-tools hash */ try { const hsReg = globalThis[Symbol.for(\"hosino.toolcatNames\")] ??= new Map();"
 " hsReg.set(context.sessionKey, Object.freeze({ guard, names: Object.freeze([...new Set(schema.map((d) => d.name))].sort()) })); while (hsReg.size > 8) hsReg.delete(hsReg.keys().next().value); } catch { /* HOSINO-TOOLFP v1 */ }")
KA_CONST = ("const IDLE_TIMEOUT_MS = 6e5;\n"
 "// QQ-CLAUDE-KEEPALIVE v1: 两群 + 凛私聊空闲 12h 才关，其他会话仍 10 分钟。指纹不一致照旧重启。\n"
 "const HOSINO_KEEPALIVE_KEYS = new Set([\"agent:main:qqbot:group:379363a480715dfc01f13aaf92571111\", \"agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5\", \"agent:main:main\"]);\n"
 "const HOSINO_KEEPALIVE_MS = 432e5;\n"
 "// END QQ-CLAUDE-KEEPALIVE v1\n")
T_PREP = D + "/prepare.runtime-D_2b2gwh.mjs"; T_MCP = D + "/mcp-http.runtime-C0W84mMK.mjs"; T_CLI = D + "/extensions/anthropic/cli.runtime.js"
TARGETS = {
 T_PREP: ("HOSINO-TOOLFP v1", "60106ae091a40e3a3ac4453075e9360a2069d7aac98b4b999d1781c8f61e86b3", [(ORIG_HASH, NEW_HASH)]),
 T_MCP: ("HOSINO-TOOLFP v1", "66cbd86e69432ee68407dcf23e86b57e631fc09d153602635357714488ba401a", [(CAT_ANCHOR, CAT_NEW)]),
 T_CLI: ("QQ-CLAUDE-KEEPALIVE v1", "44e4c4a1d5f1688ce8424ad470a2922ff39c834dd5acc62122c40ba905d29c3d", [
   ("const IDLE_TIMEOUT_MS = 6e5;\n", KA_CONST),
   ("\tsession.capability = capability;\n", "\tsession.capability = capability;\n\tsession.hosinoPinned = HOSINO_KEEPALIVE_KEYS.has(context.qqClaudeLatencyContext?.sessionKey); /* QQ-CLAUDE-KEEPALIVE v1 */\n"),
   ("session.idleTimer = setTimeout(() => session.handle.close(\"idle\"), IDLE_TIMEOUT_MS);",
    "session.idleTimer = setTimeout(() => session.handle.close(\"idle\"), session.hosinoPinned === true ? HOSINO_KEEPALIVE_MS : IDLE_TIMEOUT_MS); /* QQ-CLAUDE-KEEPALIVE v1 */"),
 ]),
}

def patch(s, mark, edits):
    if mark in s: return s
    for a, b in edits:
        n = s.count(a)
        if n != 1: raise SystemExit(f"[{mark}] 锚点缺失或不唯一: {a[:70]!r} count={n}")
        s = s.replace(a, b)
    return s

def node_check(s):
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as t: t.write(s)
    r = subprocess.run(["node", "--check", t.name], capture_output=True, text=True); os.unlink(t.name)
    if r.returncode: raise SystemExit("node --check 失败:\n" + r.stderr[:800])

def write(f, s):
    st = os.stat(P(f)); tmp = P(f) + ".hstf-tmp"
    open(tmp, "w").write(s)
    try: os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(tmp, st.st_mode & 0o7777); os.replace(tmp, P(f))

def plan():
    out = {}
    for f, (mark, old, edits) in TARGETS.items():
        s = open(P(f)).read(); cur = fsha(f)
        if mark in s: out[f] = None; print("已打过", f, cur[:12]); continue
        if cur != old: raise SystemExit(f"[{mark}] {f} sha {cur[:12]} != 预期 {old[:12]}，拒绝修改")
        ns = patch(s, mark, edits); node_check(ns); out[f] = ns
        print("将修改", f, "old=" + cur[:12], "new=" + sha(ns.encode())[:12], "(node --check OK)")
    return out

def apply():
    out = plan()
    os.makedirs(BK, exist_ok=True)
    for f in list(TARGETS) + [MANIFEST]:
        dst = BK + "/" + f.strip("/").replace("/", "__")
        if not os.path.exists(dst):
            shutil.copy2(P(f), dst)
            with open(BK + "/SHA256SUMS", "a") as o: o.write(f"{fsha(f)}  {f}\n")
    ap = json.load(open(BK + "/APPLIED_SHA256.json")) if os.path.exists(BK + "/APPLIED_SHA256.json") else {}
    for f, ns in out.items():
        if ns is None: continue
        write(f, ns); ap[f] = fsha(f)
    json.dump(ap, open(BK + "/APPLIED_SHA256.json", "w"), indent=1)
    print("apply 完成（重启网关前不生效）；备份在", BK)

def revert():
    ap = json.load(open(BK + "/APPLIED_SHA256.json"))
    for f, h in ap.items():
        b = BK + "/" + f.strip("/").replace("/", "__")
        if fsha(f) != h: print("跳过（补丁后又被改过，需人工处理）", f); continue
        if sha(open(b, "rb").read()) != TARGETS[f][1]: raise SystemExit("备份 sha 不符，拒绝还原 " + f)
        write(f, open(b).read()); print("已还原", f, fsha(f)[:12])
    print("如已登记 manifest，请再跑 --unregister-manifest；重启网关后才回到旧行为")

def register(dry):
    mf = P(MANIFEST); m = json.load(open(mf))
    resdir = "resources/hosino-20261020-toolfp"
    if not dry:
        if not os.path.exists(BK + "/canonical-manifest.json.pre-toolfp"): shutil.copy2(mf, BK + "/canonical-manifest.json.pre-toolfp")
        os.makedirs(os.path.dirname(mf) + "/" + resdir, exist_ok=True)
    for i, (f, (mark, old, edits)) in enumerate(TARGETS.items()):
        s = open(P(f)).read()
        if mark not in s:
            if not dry: raise SystemExit("未打补丁，先 --apply: " + f)
            cur = sha(patch(s, mark, edits).encode())
        else: cur = fsha(f)
        es = [e for e in m["files"] if e.get("target") == f]
        if len(es) != 1: raise SystemExit(f"manifest 条目数 {len(es)} != 1: {f}")
        e = es[0]; snap = f"{resdir}/snapshot-{i}"
        print(("[dry-run] " if dry else "") + f"登记 {f}: {e['sha256'][:12]} -> {cur[:12]} snapshot={snap}")
        if dry or e["sha256"] == cur: continue
        sp = os.path.dirname(mf) + "/" + snap; shutil.copy2(P(f), sp)
        try: ms = os.stat(mf); os.chown(sp, ms.st_uid, ms.st_gid); os.chmod(sp, 0o600)
        except PermissionError: pass
        rb = e.setdefault("recognizedBefore", [])
        if e["sha256"] not in rb: rb.append(e["sha256"])
        e["sha256"] = cur; e["snapshot"] = snap
    if dry: return
    for label, tg in (("HOSINO-TOOLFP v1", [T_PREP, T_MCP]), ("QQ-CLAUDE-KEEPALIVE v1", [T_CLI])):
        if not any(r.get("label") == label for r in m["markerRegistry"]): m["markerRegistry"].append({"label": label, "targets": tg, "marker": label})
    try:
        ms = os.stat(mf); os.chown(os.path.dirname(mf) + "/" + resdir, ms.st_uid, ms.st_gid)
    except PermissionError: pass
    t = mf + ".hstf-tmp"; json.dump(m, open(t, "w"), ensure_ascii=False, indent=1)
    st = os.stat(mf)
    try: os.chown(t, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(t, st.st_mode & 0o7777); os.replace(t, mf)
    print("manifest 已更新")

def unregister():
    shutil.copy2(BK + "/canonical-manifest.json.pre-toolfp", P(MANIFEST)); print("manifest 已还原")

a = sys.argv[1:]
if "--apply" in a: apply()
elif "--revert" in a: revert()
elif "--register-manifest" in a: register("--dry-run" in a)
elif "--unregister-manifest" in a: unregister()
else: plan(); print("check OK（未写入）")
