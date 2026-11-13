#!/usr/bin/env bash
# hosino-console 配套补丁安装脚本。默认只检查，不改任何文件；加 --apply 才写入。不会重启网关。
# 用法: bash tools/install.sh --ids my-ids.json [--apply] [--with-core] [--openclaw-home DIR] [--openclaw-pkg DIR] [--qqbot-dir DIR]
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APPLY=0; CORE=0; IDS=""; OCH="${OPENCLAW_HOME:-$HOME/.openclaw}"; PKG=""; QQ=""
while [ $# -gt 0 ]; do case "$1" in
  --apply) APPLY=1;; --with-core) CORE=1;; --ids) IDS="$2"; shift;;
  --openclaw-home) OCH="$2"; shift;; --openclaw-pkg) PKG="$2"; shift;; --qqbot-dir) QQ="$2"; shift;;
  *) echo "未知参数 $1"; exit 2;; esac; shift; done
[ -n "$IDS" ] && [ -f "$IDS" ] && IDS="$(cd "$(dirname "$IDS")" && pwd)/$(basename "$IDS")" || { echo "需要 --ids my-ids.json（从 tools/ids.example.json 复制填写）"; exit 2; }
[ -n "$PKG" ] || PKG="$(npm root -g)/openclaw"
if [ -z "$QQ" ]; then QQ="$(ls -d "$OCH"/npm/projects/tencent-connect-openclaw-qqbot-*/node_modules/@tencent-connect/openclaw-qqbot 2>/dev/null | head -1 || true)"; fi
ver(){ node -p "require('$1/package.json').version" 2>/dev/null || echo "?"; }
echo "OpenClaw: $PKG ($(ver "$PKG"))"; echo "qqbot:    ${QQ:-未找到} ($( [ -n "$QQ" ] && ver "$QQ" || echo -))"; echo "OPENCLAW_HOME: $OCH"
ok=1
[ "$(ver "$PKG")" = "2026.9.8" ] || { echo "✗ OpenClaw 必须是 2026.9.8（插件和脚本直接引用了这个版本带哈希的 dist 文件）"; ok=0; }
[ -n "$QQ" ] && [ "$(ver "$QQ")" = "2.0.4" ] || { echo "✗ qqbot 插件必须是 @tencent-connect/openclaw-qqbot 2.0.4"; ok=0; }
if [ -n "$QQ" ] && grep -q "HOSINO-STICKER-PATCH v1" "$QQ/dist/index.cjs" 2>/dev/null; then echo "• qqbot 已经打过补丁，跳过"; QQDONE=1; else QQDONE=0; fi
if [ "$QQDONE" = 0 ] && [ -n "$QQ" ]; then (cd "$QQ" && patch -p1 --dry-run -s < "$HERE/patches/qqbot-2.0.4.diff" >/dev/null) && echo "✓ qqbot 补丁可以干净打上" || { echo "✗ qqbot 补丁打不上（文件不是原版 2.0.4？）"; ok=0; }; fi
if [ "$CORE" = 1 ]; then (cd "$PKG" && patch -p1 --dry-run -s < "$HERE/patches/openclaw-2026.9.8/openclaw-core-full.diff" >/dev/null) && echo "✓ 核心全量补丁可以干净打上" || { echo "✗ 核心全量补丁打不上"; ok=0; }; fi
python3 "$HERE/tools/apply-tools-effective-cache.py" --pkg "$PKG" || ok=0
[ "$ok" = 1 ] || { echo "检查未通过，什么都没改"; exit 1; }
[ "$APPLY" = 1 ] || { echo "检查通过。确认后加 --apply 执行（不会重启网关）"; exit 0; }
TS="$(date +%Y%m%d-%H%M%S)"; BK="$OCH/backups/hosino-patches-$TS"; mkdir -p "$BK"; echo "备份目录: $BK"
CFG(){ python3 "$HERE/tools/configure.py" --ids "$IDS" --no-backup "$@" >/dev/null; }
if [ "$QQDONE" = 0 ]; then
  mkdir -p "$BK/qqbot-dist"; cp -a "$QQ/dist/." "$BK/qqbot-dist/"; echo "$QQ" > "$BK/QQBOT_DIR.txt"
  (cd "$QQ" && patch -p1 -s --no-backup-if-mismatch < "$HERE/patches/qqbot-2.0.4.diff")
  CFG "$QQ/dist/index.cjs" "$QQ/dist/qq-delivery-receipts.cjs" "$QQ/dist/qq-explicit-stop.cjs"; echo "✓ qqbot 已打补丁"
fi
if [ "$CORE" = 1 ]; then
  mkdir -p "$BK/openclaw-dist"; (cd "$PKG" && grep '^+++ b/' "$HERE/patches/openclaw-2026.9.8/openclaw-core-full.diff" | sed 's#^+++ b/##; s#\t.*##' | while read f; do [ -f "$f" ] && { mkdir -p "$BK/openclaw-dist/$(dirname "$f")"; cp -a "$f" "$BK/openclaw-dist/$f"; }; echo "$f"; done > "$BK/openclaw-core-files.txt")
  (cd "$PKG" && patch -p1 -s --no-backup-if-mismatch < "$HERE/patches/openclaw-2026.9.8/openclaw-core-full.diff")
  (cd "$PKG" && xargs python3 "$HERE/tools/configure.py" --ids "$IDS" --no-backup < "$BK/openclaw-core-files.txt" >/dev/null); echo "✓ 核心全量补丁已打"
else
  python3 "$HERE/tools/apply-tools-effective-cache.py" --pkg "$PKG" --apply
fi
mkdir -p "$OCH/plugins" "$OCH/workspace/scripts" "$BK/plugins" "$BK/scripts"
for p in qq-group-followup-gate qq-group-owner-guard; do
  [ -d "$OCH/plugins/$p" ] && cp -a "$OCH/plugins/$p" "$BK/plugins/"
  rm -rf "$OCH/plugins/$p.new"; cp -a "$HERE/plugins/$p" "$OCH/plugins/$p.new"; CFG "$OCH/plugins/$p.new"
  rm -rf "$OCH/plugins/$p"; mv "$OCH/plugins/$p.new" "$OCH/plugins/$p"; echo "✓ 插件 $p"
done
for f in "$HERE"/workspace-scripts/*; do b="$(basename "$f")"; [ -f "$OCH/workspace/scripts/$b" ] && cp -a "$OCH/workspace/scripts/$b" "$BK/scripts/"; cp "$f" "$OCH/workspace/scripts/$b"; CFG "$OCH/workspace/scripts/$b"; done; echo "✓ workspace 脚本"
echo "完成。下一步：按 README 把两个插件加入 openclaw.json（plugins.load.paths + plugins.entries），openclaw config validate，然后手动重启网关一次。回滚见 README。"
