#!/bin/sh
# 每次部署前运行：给 index.html / app.js 里的资源引用换上新的版本号，强制浏览器加载新文件
set -eu
cd "$(dirname "$0")/public"
V=${1:-$(date +%Y%m%d%H%M%S)}
case "$V" in ''|*[!A-Za-z0-9_.-]*) echo 'Invalid asset version' >&2; exit 1 ;; esac
sed -i -E "s/\?v=[A-Za-z0-9_.-]+/?v=$V/g" index.html app.js
echo "v=$V"
