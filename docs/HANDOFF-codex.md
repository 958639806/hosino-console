# hosino 控制台 / OpenClaw：做了什么、影响了什么
整理：幕僚长，2026-10-20（新加坡时间）。来源：前端喵、后端喵、探路喵、挑刺喵、小弟喵。不含任何密码或密钥，只写存放位置。

## 环境
- 生产：美国机 `38.49.36.155`（ssh 端口 4335，root）。韩国机 `119.28.150.83` 是停用的备用机。
- OpenClaw 2026.9.8。网关是 `ubuntu` 用户（UID 1001）的 `openclaw-gateway`，地址 `wss://127.0.0.1:18789`，自签证书 2027-09 到期。
  管理命令：`sudo -u ubuntu env XDG_RUNTIME_DIR=/run/user/1001 systemctl --user ...`

## 架构（链路和补丁以什么为准）
- 外网访问 443 端口：先经过 xray，再到 nginx 的 stream 层按 SNI 分流（`/etc/nginx/stream-conf.d/openclaw.conf`）。
  - `hosino.ume.wiki` 转到 `127.0.0.1:9446`（nginx 的 HTTPS 站点，接收 proxy_protocol），再反代给控制台 `127.0.0.1:18890`。
  - `openclaw.ume.wiki` 是官方控制台 `/console/`，照常保留。
- 控制台 `hosino-console` 和网关 `wss://127.0.0.1:18789` 之间只有一条 WebSocket（operator.admin，固定证书指纹）。记忆直接从 Qdrant `127.0.0.1:6333` 读取。
- QQ 通道由网关里的 qqbot 插件负责，控制台不直接连 QQ。
- 补丁以美国机上的 `~/.openclaw/patches/canonical-manifest.json` 为准（现为 217 个文件），用 `release_manager.py installed-check` 和 `reapply_all.sh --check` 检查。A12 最早打在韩国机上；20:26 后小弟喵在美国机上只读核对过，两个补丁文件、工具目录和回滚备份都在，也登记在 manifest 里。
- 本交接文档位置：`/workspace/hosino/HANDOFF-codex.md`（共享电脑）。

## 做了什么

### 1. 新建自定义控制台 https://hosino.ume.wiki
- 后端：Node，systemd 服务 `hosino-console`（`ubuntu` 账号），监听 `127.0.0.1:18890`，代码在 `/opt/hosino-console`。线上后端 v2.11（`server.mjs` 的 sha 是 `142a7a6a…`），前端 `v=20261020200725`（这是 v2.11 时的版本；现在线上是 v2.12，前端 `v=20261020215546`，见文末）。
  - 和网关只保持一条 WebSocket（operator.admin），令牌只留在服务端；只对这条连接固定网关证书指纹，原来对整个进程关掉证书校验的做法已经去掉。
  - 记忆直接读 Qdrant `127.0.0.1:6333`，集合 `mem0_full_timestamped_20260926`。
  - 别名、分组和档案存在控制台自己的文件里（`/opt/hosino-console/aliases.json` 等），不写进网关，也不写进 USER.md。
  - 原生 CLI 的工作目录是 `/home/ubuntu/cli-sandbox/<id>`，审计日志在 `logs/cli-audit.log`；附件记录在 `data/chat-attachments.jsonl`。
- 前端：纯 HTML、CSS、JS，不用构建，源码在 `/workspace/hosino/public/`（幕僚长那台电脑上）。
  - 九个页面，带 PWA，支持深浅色，手机优先。
  - 聊天页：显示发言人、可折叠的工具调用链、「未发到 QQ」标记、可往前翻的历史，能发文件和图片。
  - 个人档案、全文搜索、别名、会话分组。
  - 线路状态卡、群报、互动统计、表情库（导入、生成、语音参数）、主动行为参数。
  - 记忆页四栏。
  - 原生 CLI 页（Claude Code、Codex、Antigravity）。
- 安全机制：只用密码登录，密码的 bcrypt 哈希在 `/etc/hosino-console.env`（`LOGIN_HASH`，权限 600）。Cookie 是 `hs_sid`，带 HttpOnly、Secure、SameSite=Strict。同一 IP 输错 5 次锁 15 分钟。所有 POST 必须带 `X-HS: 1`，破坏性操作要带 `confirm:true`。写操作都记在 `/api/ops-log`。改人设文件前会先备份。网关返回的数据先经过 `redact()` 打码。
- 上线前做过一轮登录前的检查：HTTPS、各项安全响应头、未登录访问返回 401、Cookie 设置、登录锁定都正常。

### 2. 服务器改动
- nginx：在 `/etc/nginx/stream-conf.d/openclaw.conf` 加了按 SNI 分流，hosino 走 `127.0.0.1:9446`（proxy_protocol，`X-Real-IP` 用 `$remote_addr` 覆盖），原文件备份为 `.bak-hosino`。新增站点配置 `/etc/nginx/sites-available/hosino.ume.wiki.conf`。证书用 certbot 申请（webroot 是 `/var/www/letsencrypt`）。
- 新增 `/etc/hosino-mimo.env`，存放 MiMo 的 Cookie。
- 网关补丁，都登记在 `~/.openclaw/patches/canonical-manifest.json`：
  - 语音参数化：`/root/hosino-staging-voice/hosino_voice_patch.py`（支持 `--revert`），备份在 `/root/hosino-backup-20261020-voice/`。
  - mem0 自动记忆修复：`/root/hosino-patches/hosino_cli_admission_patch.py`（支持 `--revert`）。
  - 补丁总清单在 `/workspace/hosino/patch-inventory.md`。
- A12（10-07，小弟喵做的，最早打在韩国机上，美国机上也有，已登记在 manifest 里；Codex 不要连韩国机）：QQ 群里所有人看到同一份 60 个工具的列表，群主专用工具改成在调用时拦截。补丁标记 `QQ-GROUP-UNIFIED-TOOLS-PATCH v1`，登记在 `PATCHES.md` 的 A12 一节。

### 3. 调研（只读，没动服务器）
产出都在 `/workspace/hosino/`：`gateway-methods.md`（488 个方法、64 个事件，标了风险）、`API.md`、`REAL_SHAPES.md`、`feature-probe*.md`、`vpn-probe.md`，以及表情、记忆、黑话、翻车、称呼、语音、Gemini 这几项的方案文档。

## 影响了什么
- 今天网关重启了 6 次，每次 QQ 离线约 1 分钟，明细见文末。
- 每次部署都会重启 `hosino-console`，所有人要重新登录。
- 官方控制台 openclaw.ume.wiki 照常能用，嵌入模型、mem0 插件代码、`/srv/openclaw-migration` 都没动。
- 改了网关 `dist` 里的文件，以后升级 OpenClaw 会把这些补丁覆盖掉。
- 网关以后换证书时，控制台里固定的指纹要跟着换。

## 回滚
- 控制台：主机上留有 `server.mjs.bak-*` 和 `public.bak-vNN` 两套备份。
- 整个撤掉（root）：
  1. `cp -a /etc/nginx/stream-conf.d/openclaw.conf.bak-hosino /etc/nginx/stream-conf.d/openclaw.conf`
  2. `rm /etc/nginx/sites-enabled/hosino.ume.wiki.conf`
  3. `nginx -t && systemctl reload nginx`
  4. `systemctl disable --now hosino-console`
  5. `rm /etc/systemd/system/hosino-console.service && systemctl daemon-reload`
- 补丁：用上面各补丁脚本的 `--revert`。A12 保持现状，不要回滚，也不要重新打。

## 20:26 之后的改动（新加坡时间）
1. **控制台 v2.11.1**：只重启了控制台。`/opt/hosino-console/server.mjs`（sha e7e8afb1）修好了表情生成的 PATH，改走 OpenAI 通道。回滚用 `server.mjs.bak-v2.11-pre-v2.11.1`。
2. **HOSINO-TOOLCAT v1**：21:06 重启网关，QQ 离线约 62 秒。改了 `dist/mcp-http.runtime-C0W84mMK.mjs`。备份在 `/root/hosino-backup-20261020-toolcat/`，回滚用 `hosino_toolcat_patch.py --revert`。
3. **小脾气 + 拟人化 v1**：22:01 重启网关，QQ 离线约 62 秒，随后重启了控制台。控制台升到 v2.12，前端 `v=20261020215546`。
   - 新增 gate 补丁 HOSINO-FUN-CONTEXT v1：改了 `qq-group-followup-gate/index.js`，新加 `fun-context.mjs`。
   - 新增技能 hosino-fun、hosino-humanlike，以及几个 `fun_*.py` 脚本。
   - 新建目录 `~/.openclaw/workspace/fun/`，控制台加了 drop-in `40-fun-rw.conf`。
   - 备份在 `/root/hosino-backup-20261020-fun/`，回滚用 `staging/fun/rollback.sh --apply`。
4. **fun v2**：22:20 重启网关，QQ 离线约 58 秒；22:24 重启控制台。加了吃醋 B 档，以及主动搭话和早安的 heartbeat 模式。
   - 现在的 sha：gate `index.js` 1a40f182，`fun-context.mjs` 4e947237，`server.mjs` a151a392。
   - `openclaw.json` 和 `HEARTBEAT.md` 都没改。
   - 备份在 `/root/hosino-backup-20261020-fun-v2/`，回滚用 `rollback-v2.sh --apply`。
5. **HOSINO-TOOLFP v1 + QQ-CLAUDE-KEEPALIVE v1**：23:08 重启网关，QQ 离线约 59 秒。
   - 改了三个文件：`prepare.runtime-D_2b2gwh.mjs`（sha bf611cd4）、`mcp-http.runtime-C0W84mMK.mjs`（sha 6e1a7090）、`extensions/anthropic/cli.runtime.js`（sha 75c3e174）。
   - 补丁清单现在是 217 个文件，两项检查都通过。
   - 备份在 `/root/hosino-backup-20261020-toolfp/`。回滚依次执行 `hosino_toolfp_patch.py --revert`、`--unregister-manifest`，然后重启网关。
6. **前端**（`public/` 下的 `app.js`、`app.css`、`api.js`、`index.html`）：
   - 小脾气页（v2.12）、fallbackFrom 提示、拟人化页。
   - 新加护短、抢早安沙发、人机、MBTI 四张卡片。
   - 吃醋 B 档改成跟着 `GET /api/fun/params` 返回的 `requires["jealousy.tierB"]` 显示。
   - 回到顶部按钮不再挡住保存栏。
   - 回滚：把 `public.bak-v21`（200725 那版）换回去，不用重启。如果后端也回滚，就跟着 `rollback-v2.sh` 一起换。
   - 线上前端是 `v=20261020215546`，22:02 随 v2.12 部署。旧版备份在 `/opt/hosino-console/public.bak-v21`。
7. **调研和验收**（只读）：
   - 探路喵新写了几份调研文档：`sillytavern-discord-research.md`、`fun-*-research.md`、`human-likeness-research.md`、`humanlike-plugin-survey.md`。
   - 挑刺喵只发 GET 请求做了验收和延迟测量，数据在 `/workspace/acc/`、`/workspace/acc2/`。
   - 控制台密码的明文存在共享电脑上的 `/home/box/.secrets/hosino-console-pass`（权限 600）。
8. **今天网关一共重启了 6 次（记忆修复、20:21、21:06、22:01、22:20、23:08）**，每次 QQ 离线约 1 分钟。

> 升级 OpenClaw 会覆盖上面所有 dist 补丁。

> 还没确认：A12 的工具目录指纹（群里换人说话时不换 Codex 线程）和 23:08 上线的 HOSINO-TOOLFP 会不会互相影响。
