#!/bin/bash
# 回滚 HOSINO-GROUPFIX v1（需李批准后重启网关）
set -e; cd /root/hosino-staging-groupfix && python3 groupfix.py --revert
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | grep '"state"' | head -1
sha256sum /home/ubuntu/.openclaw/plugins/qq-group-followup-gate/{index.js,fun-context.mjs} | cut -c1-8
echo "然后: sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway"
