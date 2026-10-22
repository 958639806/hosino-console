# HOSINO-VOICE-PARAMS v1 —— staging 包（未部署）

## 文件
- `hosino_voice_patch.py`：`--check` / `--apply` / `--revert` / `--register-manifest` / `--unregister-manifest`。改的文件有：followup-gate 的 `index.js`、qqbot 的 `dist/index.cjs`、`AGENTS.md`、`stickers/params.json`（新增 voice 段）。脚本是幂等的，每个锚点必须唯一，JS 改完会先跑 `node --check`。备份放在 `/root/hosino-backup-20261020-voice/`（含 SHA256SUMS、APPLIED_SHA256.json、manifest 备份）。
- `patched/`：打完补丁的各个文件和 diff，`server.mjs`（控制台 v2.11）和 `server-v2.11.diff` 也在这里。
- `API-v2.11-voice.md`：给前端喵的接口说明。合并进 `/workspace/hosino/API.md` 时放在表情包 params 那一节后面。
- `test/gate-sim.mjs`、`test/console-voice.mjs`、`test/results.txt`：离线测试。
- 主机上的 staging 目录是 `/root/hosino-staging-voice/`，对线上文件跑过 `--check`：锚点全部命中，生成的 sha 和本地一致。

## 打补丁后的 sha256（以 2026-10-20 19:49 的线上文件为底）
- gate index.js：744f110e… → c19a5d66…
- qqbot index.cjs：40fe25b0… → 02e04651…
- AGENTS.md：81be66e9… → 0f9e56bd…
- params.json：内容里带 updatedAt 时间戳，所以每次 apply 的 sha 都不一样，不登记进 manifest。
- 控制台 server.mjs：593d60ac…（v2.10.1）→ 142a7a6a…（v2.11）

## 部署步骤（需要凛批准：网关重启一次 + 控制台重启一次）
1. `cd /root/hosino-staging-voice && python3 hosino_voice_patch.py --check`，确认 4 个文件都显示「将修改」，且 old 的 sha 和上面一致。
2. `python3 hosino_voice_patch.py --apply`
3. `python3 hosino_voice_patch.py --register-manifest`，然后 `bash /home/ubuntu/.openclaw/patches/reapply_all.sh --check`，确认 0 差异（只做检查，不加 --apply）。
4. 重启网关（QQ 掉线约 1 分钟）：`sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1001 systemctl --user restart openclaw-gateway`
5. 控制台：备份 `/opt/hosino-console/server.mjs` → `server.mjs.bak-v2.10.1-pre-v2.11`，换上 `patched/server.mjs`，然后 `systemctl restart hosino-console`（会登出）。
6. 验证（只读）：网关日志里 qq-media-tag 的 `voice -> text (params …)` 或 voice 相关记录；`GET /api/stickers/params` 返回里有 `voiceToday`；观察一段时间群里的语音频率。不往 QQ 发测试消息。

## 回滚
- `python3 hosino_voice_patch.py --revert`：只还原 sha 仍等于本补丁写出版本的文件。params.json 如果在控制台改过，会被跳过，这时手动删掉 voice 段，或者 `POST params/set {params:{voice:null}}`。
- `python3 hosino_voice_patch.py --unregister-manifest`，然后 `reapply_all.sh --check`。
- 重启网关。控制台换回 `.bak-v2.10.1-pre-v2.11` 后重启。
- 不想回滚、只想关掉：把 params 里 `voice.enabled` 设为 false，5 秒内生效，不用重启。
