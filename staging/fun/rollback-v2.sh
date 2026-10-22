#!/bin/bash
# 回到 v2.12（HOSINO-FUN-CONTEXT v1）。用法: ./rollback-v2.sh --apply
set -euo pipefail; [[ "${1:-}" == "--apply" ]] || { echo "用法: $0 --apply"; exit 2; }
BK=/root/hosino-backup-20261020-fun-v2; ST=/root/hosino-stage-fun-v2-20261020
ssh -p 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes root@38.49.36.155 bash -s <<R
set -euo pipefail
cd $ST/gate && HS_BK=$BK python3 hosino_fun_patch_v2.py --revert && HS_BK=$BK python3 hosino_fun_patch_v2.py --unregister-manifest
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json && sudo -u ubuntu bash reapply_all.sh --check
install -o ubuntu -g ubuntu -m 0644 $BK/server.mjs.v2.12 /opt/hosino-console/server.mjs
for n in hosino-fun hosino-humanlike; do install -o ubuntu -g ubuntu -m 0644 $BK/skills/\$n/SKILL.md /home/ubuntu/.openclaw/workspace/skills/\$n/SKILL.md; done
T0=\$(date '+%Y-%m-%d %H:%M:%S'); sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway
for i in \$(seq 1 90); do sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 journalctl --user -u openclaw-gateway --since "\$T0" --no-pager | grep -qE "gateway (READY|RESUMED)" && break; sleep 2; done
systemctl restart hosino-console; systemctl is-active hosino-console; echo 回滚完成
R
