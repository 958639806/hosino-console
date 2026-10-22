#!/bin/bash
# 脚本测试：bash test/scripts-test.sh（在 staging/fun 下）
set -e; cd "$(dirname "$0")/../scripts"; export HS_FUN_DIR=$(mktemp -d); G=379363a480715dfc01f13aaf92571111; P=7FE244B1202CD602DDA2C06B29C62F50; n=0
chk(){ local exp="$1"; shift; local o; o=$("$@"); if ! grep -q -- "$exp" <<<"$o"; then echo "FAIL: $* -> $o (want $exp)"; exit 1; fi; n=$((n+1)); }
chk '"ok": false' ./fun_grudge.py add $G $P 星野胖            # 默认关
chk '"ok": false' ./fun_followup.py add $G $P 2026-12-01 面试
chk '"ok": false' ./fun_mbti.py check $G $P
[ ! -e $HS_FUN_DIR/grudges.json ] && n=$((n+1))
echo '{"enabled":true,"grudge":{"enabled":true,"defaultEnabled":true,"maxEntriesPerPerson":2}}' > $HS_FUN_DIR/params.json
chk '"ok": true' ./fun_grudge.py add $G $P 星野胖; chk '"entries": 2' ./fun_grudge.py add $G $P 星野笨; chk '"entries": 2' ./fun_grudge.py add $G $P 星野呆
chk '需要 32 位' ./fun_grudge.py add $G bad x
echo '{"selfOptOut":{"'$P'":["fun:grudge"]}}' > $HS_FUN_DIR/gate-state.json; chk '已退出' ./fun_grudge.py add $G $P x; rm $HS_FUN_DIR/gate-state.json
echo '{"enabled":true,"followup":{"enabled":true},"mbti":{"enabled":true,"perGroupDailyCap":5}}' > $HS_FUN_DIR/humanlike.json
chk '"ok": true' ./fun_followup.py add $G $P 2026-12-01 周四面试; chk '"dup": true' ./fun_followup.py add $G $P 2026-12-01 周四面试; chk '日期格式' ./fun_followup.py add $G $P 明天 x
chk '"ok": true' ./fun_mbti.py check $G $P; chk '猜过了' ./fun_mbti.py check $G $P; chk '星座没开' ./fun_mbti.py check $G 249BDB147AE23FACCE0F2D0BAFD1579B --zodiac
echo '{"enabled":true,"mbti":{"enabled":true},"perGroup":{"group:'$G'":{"enabled":true,"mbti":false}}}' > $HS_FUN_DIR/humanlike.json; chk '本群未开启' ./fun_mbti.py check $G 249BDB147AE23FACCE0F2D0BAFD1579B
rm -rf $HS_FUN_DIR; echo "scripts: $n 项全部通过"
