#!/bin/bash
# 回滚 v2.12 小脾气 + 拟人化：还原 gate、manifest、控制台、前端，移走技能和脚本，各重启一次。
# 用法: ./rollback.sh --dry-run | --apply   （--apply 需要凛批准）。fun/ 数据目录保留不删。
set -euo pipefail
MODE="${1:---dry-run}"
SSH=(ssh -p 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes root@38.49.36.155)
BK=/root/hosino-backup-20261020-fun; ST=/root/hosino-stage-fun-20261020
if [[ "$MODE" != "--apply" ]]; then
  "${SSH[@]}" "ls -la $BK; ls /opt/hosino-console/server.mjs.bak-v2.11.1-pre-v2.12 /opt/hosino-console/public.bak-v21" && echo "dry-run：备份齐全。--apply 会：gate --revert + --unregister-manifest；还原 server.mjs 和 public；删除 40-fun-rw.conf + daemon-reload；把技能和脚本移到 $BK/removed/；重启网关和控制台各一次"
  exit 0
fi
"${SSH[@]}" bash -s <<R
set -euo pipefail
cd $ST/gate && HS_BK=$BK python3 hosino_fun_patch.py --revert && HS_BK=$BK python3 hosino_fun_patch.py --unregister-manifest
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | tee /dev/stderr | grep -q '"state": "verified"' && sudo -u ubuntu bash reapply_all.sh --check | tee /dev/stderr | grep -q '"state": "verified"'
install -o ubuntu -g ubuntu -m 0644 /opt/hosino-console/server.mjs.bak-v2.11.1-pre-v2.12 /opt/hosino-console/server.mjs
rm -rf /opt/hosino-console/public.v2.12 && mv /opt/hosino-console/public /opt/hosino-console/public.v2.12 && cp -a /opt/hosino-console/public.bak-v21 /opt/hosino-console/public
mkdir -p $BK/removed
for n in hosino-fun hosino-humanlike; do [ -e /home/ubuntu/.openclaw/workspace/skills/\$n ] && mv /home/ubuntu/.openclaw/workspace/skills/\$n $BK/removed/; done
for f in fun_common.py fun_grudge.py fun_followup.py fun_mbti.py; do [ -e /home/ubuntu/.openclaw/workspace/scripts/\$f ] && mv /home/ubuntu/.openclaw/workspace/scripts/\$f $BK/removed/; done
rm -f /etc/systemd/system/hosino-console.service.d/40-fun-rw.conf && systemctl daemon-reload
T0=\$(date '+%Y-%m-%d %H:%M:%S')
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway
for i in \$(seq 1 90); do sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 journalctl --user -u openclaw-gateway --since "\$T0" --no-pager | grep -qE "gateway (READY|RESUMED)" && break; sleep 2; done
systemctl restart hosino-console; sleep 3; systemctl is-active hosino-console
echo "回滚完成（fun/ 数据目录保留）"
R
