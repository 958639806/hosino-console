#!/bin/bash
# v2.12.1：HOSINO-FUN-CONTEXT v2（吃醋 B 档 + 心跳模式）+ 控制台 requires 文案。一次网关重启 + 一次控制台重启。
# 用法: ./deploy-v2.sh --dry-run | --apply ；回滚: ./rollback-v2.sh --apply
set -euo pipefail
MODE="${1:---dry-run}"; HERE="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -p 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes root@${HOSINO_HOST_IP:?请先设置 HOSINO_HOST_IP}); SCP=(scp -P 4335 -i /home/box/.ssh/id_ed25519 -o BatchMode=yes)
BK=/root/hosino-backup-20261020-fun-v2; ST=/root/hosino-stage-fun-v2-20261020
IDX_OLD=140c6b5d8274494ec754a947d2343f850dc74a3fff0d18384bead0cb82e863c7; FC_OLD=d9a5bf7731d75de15851214f4d0048af36d7698119c70562bed02ffdc89574d1
CON_OLD=1d00dc1530380b02; say(){ echo "[$(date +%H:%M:%S) SGT] $*"; }
say "本地测试"; node "$HERE/test/console-fun.mjs" "$HERE/patched/server.mjs" | tail -1; (cd "$HERE/gate" && node test/harness.mjs | tail -1); bash "$HERE/test/scripts-test.sh"
say "主机预检（只读）"
"${SSH[@]}" bash -s <<R
set -e; cd /home/ubuntu/.openclaw/plugins/qq-group-followup-gate
[ "\$(sha256sum index.js|cut -c1-64)" = "$IDX_OLD" ] && echo "index.js v1 OK" || { echo "index.js 不是 v1"; exit 1; }
[ "\$(sha256sum fun-context.mjs|cut -c1-64)" = "$FC_OLD" ] && echo "fun-context v1 OK" || { echo "fun-context 不是 v1"; exit 1; }
sha256sum /opt/hosino-console/server.mjs | grep -q "^$CON_OLD" && echo "console v2.12 OK" || { echo "console sha 不符"; exit 1; }
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | grep -q '"state": "verified"' && echo "installed-check verified"
R
[[ "$MODE" == "--apply" ]] || { say "dry-run 通过（未写入）"; exit 0; }
"${SSH[@]}" "mkdir -p $ST/gate $ST/skills && chmod 700 $ST"
"${SCP[@]}" "$HERE/patched/server.mjs" root@${HOSINO_HOST_IP:?请先设置 HOSINO_HOST_IP}:$ST/
"${SCP[@]}" "$HERE/gate/hosino_fun_patch_v2.py" "$HERE/gate/fun-context.mjs" root@${HOSINO_HOST_IP:?请先设置 HOSINO_HOST_IP}:$ST/gate/
"${SCP[@]}" -r "$HERE/skills/hosino-fun" "$HERE/skills/hosino-humanlike" root@${HOSINO_HOST_IP:?请先设置 HOSINO_HOST_IP}:$ST/skills/
"${SSH[@]}" bash -s <<R
set -euo pipefail; ts(){ date +%H:%M:%S; }
mkdir -p $BK/skills && chmod 700 $BK
cp -a /opt/hosino-console/server.mjs $BK/server.mjs.v2.12; cp -a /opt/hosino-console/server.mjs /opt/hosino-console/server.mjs.bak-v2.12-pre-v2.12.1
for n in hosino-fun hosino-humanlike; do cp -a /home/ubuntu/.openclaw/workspace/skills/\$n $BK/skills/; done
install -o ubuntu -g ubuntu -m 0644 $ST/server.mjs /opt/hosino-console/server.mjs
for n in hosino-fun hosino-humanlike; do install -o ubuntu -g ubuntu -m 0644 $ST/skills/\$n/SKILL.md /home/ubuntu/.openclaw/workspace/skills/\$n/SKILL.md; done
cd $ST/gate && HS_BK=$BK python3 hosino_fun_patch_v2.py --apply && HS_BK=$BK python3 hosino_fun_patch_v2.py --register-manifest
cd /home/ubuntu/.openclaw/patches && sudo -u ubuntu python3 release_manager.py installed-check --manifest canonical-manifest.json | tee /dev/stderr | grep -q '"state": "verified"' && sudo -u ubuntu bash reapply_all.sh --check | tee /dev/stderr | grep -q '"state": "verified"'
echo "\$(ts) 校验通过"
T0=\$(date '+%Y-%m-%d %H:%M:%S'); J(){ sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 journalctl --user -u openclaw-gateway --since "\$T0" --no-pager; }
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway; echo "\$(ts) 网关已重启"
for i in \$(seq 1 90); do J | grep -qE "gateway (READY|RESUMED)" && break; sleep 2; done
J | grep -qE "gateway (READY|RESUMED)" || { echo "没等到 QQ READY"; exit 1; }; echo "\$(ts) QQ READY"
J | grep -E "fun-context load failed|fun (hint|dispatch|heartbeat hint|tick) error" && echo "!! fun 错误" || echo "无 fun 错误"
systemctl restart hosino-console; sleep 3; systemctl is-active hosino-console; echo "\$(ts) 控制台已重启"
R
say "完成"
