#!/usr/bin/env python3
"""TOOLS-EFFECTIVE-CACHE-PATCH v1（独立版）：把 OpenClaw 的 tools.effective 缓存从 10s/120s 拉长到 6h/24h，
修控制台“工具”页每分钟触发冷加载、导致网关卡顿和控制台断线的问题。不改任何工具本身。
按常量名匹配，不依赖带哈希的文件名；已在 openclaw 2026.9.8 和 2026.11.3 的原版包上核对过锚点。

  python3 apply-tools-effective-cache.py            # 只检查
  python3 apply-tools-effective-cache.py --apply    # 打补丁（先备份为 *.pre-tools-effective-cache）
  python3 apply-tools-effective-cache.py --rollback # 用备份还原
可用 --pkg <openclaw 安装目录> 指定路径，默认 $(npm root -g)/openclaw。改完需要重启网关。
"""
import argparse, glob, os, re, shutil, subprocess, sys
MARK = "TOOLS-EFFECTIVE-CACHE-PATCH v1"
REPL = [(r"const TOOLS_EFFECTIVE_FRESH_TTL_MS = 1e4;", "const TOOLS_EFFECTIVE_FRESH_TTL_MS = 216e5; /* %s (orig 1e4) */" % MARK),
        (r"const TOOLS_EFFECTIVE_STALE_TTL_MS = 12e4;", "const TOOLS_EFFECTIVE_STALE_TTL_MS = 864e5; /* %s (orig 12e4) */" % MARK)]
ap = argparse.ArgumentParser(); ap.add_argument("--pkg"); g = ap.add_mutually_exclusive_group()
g.add_argument("--apply", action="store_true"); g.add_argument("--rollback", action="store_true"); a = ap.parse_args()
pkg = a.pkg or os.path.join(subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip(), "openclaw")
fs = [f for f in glob.glob(os.path.join(pkg, "dist", "tools-effective-*.mjs")) if "TOOLS_EFFECTIVE_FRESH_TTL_MS" in open(f, encoding="utf-8").read()]
if len(fs) != 1: sys.exit(f"在 {pkg}/dist 下找到 {len(fs)} 个 tools-effective 文件（应为 1），停止")
f = fs[0]; s = open(f, encoding="utf-8", newline="").read(); bk = f + ".pre-tools-effective-cache"
if a.rollback:
    if not os.path.exists(bk): sys.exit("没有备份，无法还原")
    shutil.copy2(bk, f); print("已还原", f); sys.exit(0)
if MARK in s: print("already patched", f); sys.exit(0)
for old, _ in REPL:
    if s.count(old) != 1: sys.exit(f"锚点不唯一或不存在：{old}（这个版本可能已经改了写法），停止")
if not a.apply: print("可以打补丁：", f); sys.exit(0)
shutil.copy2(f, bk)
for old, new in REPL: s = s.replace(old, new)
tmp = f + ".tmp"; open(tmp, "w", encoding="utf-8", newline="").write(s); shutil.copymode(f, tmp); os.replace(tmp, f)
print("patched", f, "；请重启网关")
