# 安装与升级

## 环境

- Node.js **推荐 24.21.0 或更高版本**、npm；用量归档读取使用内置 SQLite/zstd。
- **Node.js 22.23.2 已补测通过安装、启动、登录和费用统计**，不代表整个 Node 22 系列均已验证；该版本内置 SQLite 仍为实验特性。
- 安装包的 `package.json` 仍声明 `node >=24.21.0`。Node 22.23.2 默认安装会提示版本不符，启用 `engine-strict` 则拒绝安装。严格检查环境请使用推荐的 Node 版本。
- 具备所需功能的 OpenClaw 网关与自己的配置。控制台进程可以独立启动；网关、QQ、Qdrant、语音等外部功能仍需由安装者提供对应依赖。
- Python 3 / systemd / voice CLI / ffmpeg 等是特定管理功能的可选宿主依赖；缺失时不会变成虚假成功。
- 本包不安装、修改或重启网关/xray，不包含网关证书或设备配对实验。

## 完整安装包

下载正式 release 的 `hosino-console-v2026.11.18.1.tar.gz`（或 zip）和 `SHA256SUMS`，先校验：

```sh
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf hosino-console-v2026.11.18.1.tar.gz
cd hosino-console-v2026.11.18.1
npm ci --omit=dev
```

目录中的 18 个根运行模块、22 个 public 资源、package.json 与 package-lock.json 均必需，不要只覆盖 server.mjs 或 public。配套 `patches/openclaw/` 保留在包内，但不会自动应用。

## 配置与启动

本程序读取进程环境变量，**不自动读取 `.env`**。使用自己的进程管理器注入。不要把密码、token、私钥或真实配置提交到仓库。

| 环境变量 | 默认 / 用途 |
| --- | --- |
| `PORT` | `18890`；仅监听 `127.0.0.1` |
| `LOGIN_HASH` | 必填登录密码 bcrypt 哈希；未设置时登录不会成功 |
| `OPENCLAW_CONFIG` | `$HOME/.openclaw/openclaw.json`；自己的网关配置 |
| `OPENCLAW_HOME` | 配置文件所在目录；资源状态根目录 |
| `OPENCLAW_WORKSPACE` | 状态根目录的 `workspace` |
| `HOSINO_ORIGIN` | 默认不额外信任任何固定站点；按请求 Host 校验同源。可逗号分隔显式设置自己的允许源，代理须覆盖外来 X-Forwarded-Host |
| `GATEWAY_URL` | `wss://127.0.0.1:18789` |
| `GATEWAY_CERT` | 程序目录的 `gateway-cert.pem`；安装者自己的网关公共证书/CA，仅用于校验网关 |
| `GATEWAY_FP` | 可选 SHA-256 指纹；未填时从上述公共证书计算；不关闭全局 TLS 校验 |
| `QDRANT_URL` / `MEM_COLLECTION` | `http://127.0.0.1:6333` / `memories`；按自己的实例配置 |
| `HOSINO_OWNER_OPENID` | 可选自己的 QQ owner openid；未配置则私聊证据标记未配置，不冒认私聊对象；不修改网关权限 |
| `MEM0_USER_ID` | 默认 `default`；按自己的共享记忆桶显式配置。包内不内置私人别名/QQ身份映射 |
| `OPENCLAW_BIN` | PATH 中的 `openclaw` |
| `HOSINO_CLI_HOME` | `$HOME`；CLI 管理的用户目录 |
| `CLAUDE_CREDENTIALS` | `$HOME/.claude/.credentials.json`；只在相应功能需要时加载，不随包提供 |
| `MEDIA_ROOT` / `QQ_RECEIPT_DIR` | 状态根目录下 `media` / `qqbot/delivery-receipts` |
| `HS_FISH_ENV` | `$HOME/.config/hosino/fish.env`；自己的语音配置文件 |
| `HS_VOICES_DATA` | 状态根目录下 `console-data/voices` |
| `HOSINO_USAGE_STATE_DIR` | 默认配置文件所在目录；读取所有 agent 的已保留 usage |
| `HOSINO_USAGE_PRICE_FILE` | 可选精确 provider/model 自定义价格 JSON，始终标记非官方 |

用自己的密码在本地生成哈希（输入不回显，不将明文写入文件或命令参数）：

```bash
read -rs -p '控制台登录密码: ' PASSWORD; printf '\n'
export LOGIN_HASH="$(printf '%s' "$PASSWORD" | node --input-type=commonjs -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",async()=>process.stdout.write(await require("bcryptjs").hash(s,12)))')"
unset PASSWORD
export OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
export GATEWAY_CERT="/path/to/your/gateway-public-cert.pem"
npm start
```

通过自己的 **HTTPS 同源反向代理**访问：登录 cookie 带 Secure/HttpOnly/SameSite=Strict，不能把本地纯 HTTP 浏览器登录当作正式部署配置。不要开放未经 HTTPS 保护的控制台或去掉原有鉴权。

## 已有部署升级

先备份自己的代码与配置并校验资源版本。此版本的发布副本将默认路径改为当前用户/配置目录派生，不再假定某个 Linux 账号或私人 collection。已有部署应把原本需要的路径、`MEM_COLLECTION`、`MEM0_USER_ID`、`HOSINO_OWNER_OPENID` 等显式保留为环境变量；替换代码不会迁移或覆盖自己的数据。进程重启后旧内存登录 cookie 失效，需要重新登录。

## 自动化验证（不调用真实模型或 QQ）

```sh
npm ci
npm test
node --test tests/startup.test.mjs
```

所有测试凭据、session、usage 都是明确的合成假值。完整进程测试使用临时 HOME/状态目录与回环 mock；网络与宿主命令 guard 阻止外部模型/QQ请求和真实宿主操作。模块图通过 Node 解析器分析，不执行模块。DOM 测试不等同真实浏览器视觉验收。
