#!/bin/bash
# v2.12 小脾气 + 拟人化 一次性上线：一次网关重启 + 一次控制台重启。在 box 上运行。
# 用法: ./deploy.sh --dry-run   （只做本地测试 + 主机只读检查，不写主机）
#       ./deploy.sh --apply     （需要凛批准后才运行）
# 回滚: ./rollback.sh --apply
set -euo pipefail
MODE="${1:---dry-run}"; [[ "$MODE" == "--dry-run" || "$MODE" == "--apply" ]] || { echo "用法: $0 --dry-run|--apply"; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"; PUB="/workspace/hosino/public"; PUBVER="20261020215546"
SSH=(ssh -p 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes root@38.49.36.155)
SCP=(scp -P 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes)
BK=/root/hosino-backup-20261020-fun; ST=/root/hosino-stage-fun-20261020
GATE_OLD=c19a5d661d08a5381e45d672fd3ad150173a8fa6f3ba820c34e45b7712e0f4a5
CONSOLE_OLD=e7e8afb15411ab5e9edcf7ec1a257321674471a4b0aa08c0ba536ed26458a008
say(){ echo "[$(date +%H:%M:%S) SGT] $*"; }

say "1/9 本地测试"
node "$HERE/test/console-fun.mjs" "$HERE/patched/server.mjs" | tail -1
(cd "$HERE/gate" && node test/harness.mjs | tail -1)
bash "$HERE/test/scripts-test.sh"
node --check "$HERE/patched/server.mjs"; node --check "$HERE/gate/fun-context.mjs"
grep -q "v=$PUBVER" "$PUB/index.html" || { echo "前端版本不是 v=$PUBVER"; exit 1; }
[[ "$(sha256sum < "$HERE/gate/orig/index.js" | cut -d' ' -f1)" == "$GATE_OLD" ]]

say "2/9 主机只读预检"
"${SSH[@]}" bash -s <<R
set -e
cd /home/ubuntu/.openclaw/plugins/qq-group-followup-gate
s=\$(sha256sum index.js | cut -d' ' -f1); echo "gate index.js \${s:0:12}"
if grep -q "HOSINO-FUN-CONTEXT v1" index.js; then echo "已打过 gate 补丁"; elif [ "\$s" != "$GATE_OLD" ]; then echo "gate sha 不符，停止"; exit 1; fi
c=\$(sha256sum /opt/hosino-console/server.mjs | cut -d' ' -f1); echo "console server.mjs \${c:0:12}"
[ "\$c" = "$CONSOLE_OLD" ] || { echo "console sha 不是 v2.11.1，停止"; exit 1; }
ls /etc/systemd/system/hosino-console.service.d/
ls -d /home/ubuntu/.openclaw/workspace/fun 2>/dev/null && echo "fun 目录已存在" || echo "fun 目录不存在（将创建）"
for n in hosino-fun hosino-humanlike; do [ -e /home/ubuntu/.openclaw/workspace/skills/\$n ] && { echo "技能 \$n 已存在，停止"; exit 1; }; done
for n in fun_common.py fun_grudge.py fun_followup.py fun_mbti.py; do [ -e /home/ubuntu/.openclaw/workspace/scripts/\$n ] && { echo "脚本 \$n 已存在，停止"; exit 1; }; done
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | grep -q '"state": "verified"' && echo "installed-check（部署前）verified"
R
if [[ "$MODE" == "--dry-run" ]]; then
  say "dry-run：本地测试和主机预检通过。--apply 将会："
  cat <<'P'
  3 上传暂存包到 /root/hosino-stage-fun-20261020/
  4 备份 server.mjs、public、manifest、gate index.js 到 /root/hosino-backup-20261020-fun/
  5 建 ~/.openclaw/workspace/fun（ubuntu 0755）；装 40-fun-rw.conf，daemon-reload
  6 装 server.mjs（v2.12）+ 前端 v=20261020215546；装技能 hosino-fun/hosino-humanlike 和 4 个脚本
  7 gate 补丁 --apply + --register-manifest；installed-check + reapply_all.sh --check
  8 重启网关一次（QQ 约 62 秒离线），等 gateway READY，查错误
  9 重启控制台一次（所有人会被登出），检查 /api 正常
P
  exit 0
fi

say "3/9 上传"
"${SSH[@]}" "mkdir -p $ST/gate $ST/skills $ST/scripts $ST/public && chmod 700 $ST"
"${SCP[@]}" "$HERE/patched/server.mjs" "$HERE/40-fun-rw.conf" root@38.49.36.155:$ST/
"${SCP[@]}" "$HERE/gate/hosino_fun_patch.py" "$HERE/gate/fun-context.mjs" root@38.49.36.155:$ST/gate/
"${SCP[@]}" -r "$HERE/skills/hosino-fun" "$HERE/skills/hosino-humanlike" root@38.49.36.155:$ST/skills/
"${SCP[@]}" "$HERE"/scripts/fun_*.py root@38.49.36.155:$ST/scripts/
"${SCP[@]}" -r "$PUB"/. root@38.49.36.155:$ST/public/

say "4-9/9 主机执行"
"${SSH[@]}" bash -s <<R
set -euo pipefail
ts(){ date +%H:%M:%S; }
mkdir -p $BK && chmod 700 $BK
cp -a /opt/hosino-console/server.mjs $BK/server.mjs.v2.11.1
cp -a /opt/hosino-console/server.mjs /opt/hosino-console/server.mjs.bak-v2.11.1-pre-v2.12
[ -e /opt/hosino-console/public.bak-v21 ] || cp -a /opt/hosino-console/public /opt/hosino-console/public.bak-v21
cp -a /home/ubuntu/.openclaw/patches/canonical-manifest.json $BK/canonical-manifest.json.pre-deploy
sha256sum /opt/hosino-console/server.mjs /home/ubuntu/.openclaw/plugins/qq-group-followup-gate/index.js /home/ubuntu/.openclaw/patches/canonical-manifest.json > $BK/SHA256SUMS.pre-deploy
echo "\$(ts) 备份完成"
install -d -o ubuntu -g ubuntu -m 0755 /home/ubuntu/.openclaw/workspace/fun
install -o root -g root -m 0644 $ST/40-fun-rw.conf /etc/systemd/system/hosino-console.service.d/40-fun-rw.conf
systemctl daemon-reload
install -o ubuntu -g ubuntu -m 0644 $ST/server.mjs /opt/hosino-console/server.mjs
rm -rf /opt/hosino-console/public.new && cp -a $ST/public /opt/hosino-console/public.new && chown -R ubuntu:ubuntu /opt/hosino-console/public.new
rm -rf /opt/hosino-console/public && mv /opt/hosino-console/public.new /opt/hosino-console/public
grep -q "v=$PUBVER" /opt/hosino-console/public/index.html
for n in hosino-fun hosino-humanlike; do cp -r $ST/skills/\$n /home/ubuntu/.openclaw/workspace/skills/\$n; chown -R ubuntu:ubuntu /home/ubuntu/.openclaw/workspace/skills/\$n; chmod 0644 /home/ubuntu/.openclaw/workspace/skills/\$n/SKILL.md; done
for f in $ST/scripts/fun_*.py; do install -o ubuntu -g ubuntu -m 0755 \$f /home/ubuntu/.openclaw/workspace/scripts/; done
echo "\$(ts) 控制台文件、技能、脚本已装"
cd $ST/gate && HS_BK=$BK python3 hosino_fun_patch.py --apply && HS_BK=$BK python3 hosino_fun_patch.py --register-manifest
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | tee /dev/stderr | grep -q '"state": "verified"' && sudo -u ubuntu bash reapply_all.sh --check | tee /dev/stderr | grep -q '"state": "verified"'
echo "\$(ts) 补丁校验通过"
T0=\$(date '+%Y-%m-%d %H:%M:%S')
J(){ sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 journalctl --user -u openclaw-gateway --since "\$T0" --no-pager; }
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway
echo "\$(ts) 网关已重启，等 QQ READY（最多 180 秒）"
for i in \$(seq 1 90); do J | grep -qE "gateway (READY|RESUMED)" && break; sleep 2; done
J | grep -qE "gateway (READY|RESUMED)" || { echo "180 秒内没等到 QQ READY，请检查（可运行 rollback.sh）"; exit 1; }
echo "\$(ts) QQ READY"
J | grep -E "fun-context load failed|fun hint error|fun dispatch error|qq-group-followup-gate.*(Error|failed)" && echo "!! 发现 fun 相关错误，请检查" || echo "无 fun 相关错误"
systemctl restart hosino-console; sleep 3; systemctl is-active hosino-console
code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18890/api/fun/params); echo "/api/fun/params 未登录返回 \$code（预期 401）"
journalctl -u hosino-console --since "\$T0" --no-pager | grep -iE "error|EROFS|EACCES" && echo "!! 控制台日志有错误" || echo "控制台日志无错误"
echo "\$(ts) 完成。备份在 $BK；回滚运行 rollback.sh --apply"
R
say "部署完成。请让凛登录控制台，打开「拟人化」和「小脾气」页确认 consumers:true（参数仍全关）"
