# 控制台后端 v2.12（小脾气参数）—— 已备好，未部署

**只存设置，暂不生效**：记仇小本本、群梗回旋镖、吃醋这三项的技能、脚本和 gate 补丁都还没做。这一版只让控制台能存、改、看这些参数和数据，默认全部 `enabled:false`。功能上线以前，在面板里怎么改都不会影响星野的行为。

- 基线：`orig/server.mjs` = 线上 v2.11.1（sha256 前缀 e7e8afb1，2026-10-20 21:15 左右（UTC+8）只读核对过）。
- 新版：`patched/server.mjs`，改动见 `server-v2.12.diff`（只新增了一段 `// v2.12` 代码块和 7 个接口，原有代码没动）。
- 接口：`API-v2.12-fun.md`。drop-in：`40-fun-rw.conf`。测试：`test/console-fun.mjs`，结果在 `test/results.txt`。

## 部署（只重启控制台，不重启网关，QQ 不受影响；需凛批准）
1. 备份：`cp -a /opt/hosino-console/server.mjs /opt/hosino-console/server.mjs.bak-v2.11.1`
2. 建目录（**必须先建**：ReadWritePaths 指向不存在的路径，服务会起不来）：
   `install -d -o ubuntu -g ubuntu -m 755 /home/ubuntu/.openclaw/workspace/fun`
3. 装 drop-in：`install -m 644 40-fun-rw.conf /etc/systemd/system/hosino-console.service.d/40-fun-rw.conf && systemctl daemon-reload`
4. 换文件：`install -o <原属主> -m <原权限> server.mjs /opt/hosino-console/server.mjs`，装之前先 `node --check`。
5. `systemctl restart hosino-console`，所有人要重新登录。
6. 验证：`systemctl is-active hosino-console`；登录后 `GET /api/fun/params` 返回全关的默认值；做一次 `POST /api/fun/params/set {"confirm":true,"params":{"enabled":false}}`，确认 `fun/params.json` 写出来了（只是写入关闭状态，不改变行为）。
7. 没有补丁要登记进 canonical-manifest（控制台不在清单里），也不用动网关。前端面板等前端喵接。

## 回滚
1. `cp -a /opt/hosino-console/server.mjs.bak-v2.11.1 /opt/hosino-console/server.mjs`
2. 可选：`rm /etc/systemd/system/hosino-console.service.d/40-fun-rw.conf && systemctl daemon-reload`
3. `systemctl restart hosino-console`
4. `workspace/fun/` 里的数据可以留着（没有东西在读）；要删就先整体挪进一个备份目录再删。

## 定稿构建（21:58 SGT，只在暂存区，没写主机）
- `gate/orig/index.js`：主机当前的 gate（sha c19a5d66，只读复制）。`gate/patched/index.js`：sha 140c6b5d，只加了 4 处、共 6 行。
- `gate/fun-context.mjs`：HOSINO-FUN-CONTEXT v1 的全部逻辑。`gate/hosino_fun_patch.py`：支持 --check/--apply/--revert/--register-manifest [--dry-run]/--unregister-manifest，HS_ROOT 离线演练已通过。
- `skills/hosino-fun`、`skills/hosino-humanlike`；`scripts/fun_common.py`、`fun_grudge.py`、`fun_followup.py`、`fun_mbti.py`。
- 测试：
  - `node test/console-fun.mjs patched/server.mjs`
  - `cd gate && node test/harness.mjs`
  - `bash test/scripts-test.sh`
- 上线：`./deploy.sh --dry-run`，然后 `./deploy.sh --apply`（要凛批准）。回滚：`./rollback.sh --apply`。
