# hosino-console 配套补丁（OpenClaw 侧）

> 某芙芙ai再这么高冷，就不帮你修了

装了 hosino-console 但表情包、语音、拟人化、私聊陪伴、撤回这些面板没反应？多半是因为网关这边缺了下面这些补丁。控制台只负责读写配置文件，真正干活的是 OpenClaw 里的两个自有插件、改过的 qqbot 插件和几个 workspace 脚本。

## 适用版本（必须完全一致）

| 组件 | 版本 | 说明 |
|---|---|---|
| OpenClaw | **2026.9.8** | `qq-group-owner-guard` 和 `xingye_tts.py` 直接 import 了这个版本带哈希的 dist 文件，别的版本（包括最新的 2026.11.3）插件会加载失败 |
| `@tencent-connect/openclaw-qqbot` | **2.0.4** | 补丁是对原版 2.0.4 的 `dist/index.cjs` 做的 diff |
| `@openclaw/codex` | 2026.9.8 | 只有选装核心补丁时才涉及 |
| `@mem0/openclaw-mem0` / `mem0ai` | 1.2.1 / 3.0.7 | 只有选装记忆补丁时才涉及；`mem0ai` 别顺手升级 |
| Node | 22+（线上 24.21.0） | |
| Python | 3.10+ | workspace 脚本用 |

`tools/install.sh` 会先核对版本，不对就停，什么都不改。

## 目录

```
README.md                  本文件
RELEASE_NOTES.md           发布说明草稿
INVENTORY.md               补丁逐项清单（作用、对应控制台功能、文件、依赖）
SHA256SUMS                 本目录所有文件的校验
plugins/                   独立插件，整目录复制即可（不改官方文件）
  qq-group-followup-gate/    v2.4.1
  qq-group-owner-guard/      v1.2.0
workspace-scripts/         放进 ~/.openclaw/workspace/scripts/ 的脚本
patches/
  qqbot-2.0.4.diff           【必装】qqbot 官方文件补丁（index.cjs + 新增 2 个文件）
  openclaw-2026.9.8/
    tools-effective-cache.diff   【建议】控制台“工具”页导致网关每分钟卡顿/断线的修复
    openclaw-core-full.diff      【选装】核心全量补丁（103 个文件，QQ 延迟/重启/记忆/受控媒体）
    files/                       上面那份按文件拆开，方便审阅
  codex-2026.9.8.diff        【选装】codex 插件补丁
  openclaw-mem0-1.2.1.diff   【选装】mem0 插件补丁
  mem0ai-3.0.7.diff          【选装】mem0ai（Qdrant 查询修复等）
tools/
  install.sh                 检查 / 安装（默认只检查，不重启）
  configure.py               把 __HS_XXX__ 占位符换成你自己的值
  ids.example.json           占位符取值模板
  apply-tools-effective-cache.py  按常量名打 tools-effective 缓存补丁（不依赖文件名）
examples/                  openclaw.json 插件段、stickers/params.json 示例
```

## 占位符

发布版去掉了原作者自己的 QQ openid、群 id、群友名字、主机路径和 IP，换成了 `__HS_XXX__` 形式的占位符，比如 `__HS_OWNER_OPENID__`、`__HS_GROUP_NEW_OPENID__`、`__HS_OPENCLAW_HOME__`。安装时 `configure.py` 会按你的 `my-ids.json` 把它们替换掉：

- 路径类（`OPENCLAW_HOME`、`OPENCLAW_PKG`、`USER_HOME`）不填就自动用 `~/.openclaw`、`$(npm root -g)/openclaw`、`~`。
- QQ openid 类不填就是空字符串：对应的“主人识别”“两个群的专属逻辑”不会生效，但也不会报错。
- `GROUP_NEW_OPENID` / `GROUP_OLD_OPENID` 是原作者的两个主群，很多逻辑（统一工具、保活、队列）只对这两个群开。只有一个群就填一个。

`my-ids.json` 里是你的私人 id，不要提交到任何公开仓库。

## 安装

先停在“只检查”，看清楚再写入。整个过程**不会重启网关**，最后一步重启由你手动做。

```bash
# 0. 准备
cp tools/ids.example.json my-ids.json   # 按注释填写
npm ls -g openclaw                      # 确认是 2026.9.8

# 1. 只检查（版本、补丁能否干净打上），什么都不改
bash tools/install.sh --ids my-ids.json

# 2. 安装：qqbot 补丁 + 两个插件 + workspace 脚本 + tools-effective 缓存补丁
bash tools/install.sh --ids my-ids.json --apply
#   想连核心全量补丁一起打：再加 --with-core（会替代第 2 步里的单独缓存补丁）

# 3. 在 ~/.openclaw/openclaw.json 里登记插件（参考 examples/openclaw.plugins.example.json）
#    plugins.load.paths 加两个插件目录，plugins.entries 加两个条目，并把示例里的 __GROUP_A__ 换成你的群 openid
openclaw config validate

# 4. 表情/语音参数（可选，控制台也能写）
mkdir -p ~/.openclaw/workspace/stickers
cp examples/stickers-params.example.json ~/.openclaw/workspace/stickers/params.json   # 改掉 __GROUP_A__

# 5. 手动重启网关一次，补丁才生效
systemctl --user restart openclaw-gateway
```

装完以后：

- 外部服务的 key 只从环境变量或 OpenClaw 自己的 secret store 读：`FISH_API_KEY`（Fish 语音）、`ARK_API_KEY`（豆包生图，`doubao_draw.py`）、`XIAOMI_MIMO_API_KEY`（MiMo 语音，存在 secret store 里）。生表情包用的 Grok 中转从 `openclaw.json` 的 `stringai_grok` provider 读。
- `xingye_tts.py` 要求网关开 TLS（`~/.openclaw/tls/gateway.crt`），证书要包含 `GATEWAY_CERT_IP`；还写死了运行用户 uid/gid **1001**。不符合的话要自己改脚本里 `GATEWAY_UID_REQUIRED` 那一行。
- `qq-group-followup-gate` 的 `controlledMediaJobs`（受控生图/语音任务）依赖核心补丁里的 `QQ-CONTROLLED-MEDIA-EXEC-BRIDGE`。没打核心全量补丁就别开这一项（示例配置里没有写）。
- 以后升级 OpenClaw 或 qqbot，这些补丁会被覆盖（插件和脚本不会）。升级前先回滚，确认新版本有对应的补丁包再升。

## 回滚

`install.sh --apply` 每次都会把被改的文件备份到 `~/.openclaw/backups/hosino-patches-<时间>/`：

```bash
B=~/.openclaw/backups/hosino-patches-<时间>
# qqbot：整个 dist 还原
Q=$(cat $B/QQBOT_DIR.txt); rm -rf "$Q/dist" && cp -a "$B/qqbot-dist" "$Q/dist"
# tools-effective 缓存补丁
python3 tools/apply-tools-effective-cache.py --rollback
# 核心全量补丁（打过 --with-core 才需要）：还原备份，并删掉补丁新增的文件
P=$(npm root -g)/openclaw; cp -a "$B/openclaw-dist/." "$P/"
while read f; do [ -f "$B/openclaw-dist/$f" ] || rm -f "$P/$f"; done < "$B/openclaw-core-files.txt"
# 插件和脚本：从 $B/plugins、$B/scripts 拷回；原来没有的直接删掉，并从 openclaw.json 里去掉对应条目
openclaw config validate && systemctl --user restart openclaw-gateway
```

最省事的回滚办法是重装原版：`npm i -g openclaw@2026.9.8`、`openclaw plugins update openclaw-qqbot`。

## 已验证 / 没验证

- 已验证：每份 diff 打到 npm 原版包上，再用原作者自己的取值做占位符替换，结果和线上运行的文件**逐字节一致**（qqbot 3 个、核心 103 个、codex 21 个、mem0 9+2 个文件；插件和脚本也一样，`doubao_draw.py` 除外，见下）。`install.sh` 在模拟目录里检查、安装、回滚都跑通了，回滚后和原版逐字节一致；装完后 JS 过了 `node --check`，Python 过了 `py_compile`。
- 没验证：在一台全新的机器上真跑网关和 QQ。示例 `openclaw.json` 片段也还没过 `openclaw config validate`。
- `doubao_draw.py` 和线上版不同：线上把 key 写死在代码里，发布版改成读 `ARK_API_KEY` 环境变量。
