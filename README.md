# hosino console

OpenClaw QQ bot 星野のねこ web console (backend server.mjs, frontend public/), gate/core patches (patches, staging, toolfp) and design docs (docs/).

当前版本：**2026.11.4**。包含快照功能补全、回归修复和 OpenClaw 原生插件中心，更新内容与验证边界见 [发布说明](docs/release-v2026.11.4.md) 和 [CHANGELOG.md](CHANGELOG.md)。旧标签和 Release 保留。

插件中心入口为“更多 → 能力与任务 → 插件中心”，提供原生插件详情、配置差异预览和变更单导出，见 [功能与边界](docs/plugin-center.md)。仍使用现有 OpenClaw 与 QQ 接入，无额外机器人运行框架。

## 本地开发

需要 Node.js 22.13 或更新版本（建议 Node.js 24，模型直连使用 Node SQLite API）。

```sh
npm ci
npm run dev
```

`dev` 使用仓库自带的假后端，默认端口 18990，仅用于本地开发；所有 QQ、模型、登录和主机数据都是模拟数据。前端为原生 HTML/CSS/JS，没有构建步骤。

真实后端用 `npm start` 启动，默认仅监听 `127.0.0.1:18890`。它需要单独配置登录哈希、OpenClaw 网关、网关证书、工作空间及相关服务，不能用假后端的通过结果代替真实集成验收。参数示例见 [.env.example](.env.example)。使用 Node 的 `--env-file` 显式加载配置，应用不会自动读取 `.env`。

```sh
node --env-file=/安全路径/hosino-console.env server.mjs
```

真实部署保留 TLS 校验和网关证书固定，登录页面经 HTTPS 反向代理访问。`X-Real-IP` 必须由可信反向代理覆盖。原生 CLI 具备宿主机执行权限，只应向受信任的控制台管理员开放。

## 验证

```sh
npx playwright install --with-deps chromium
npm test
```

也可分别运行 `npm run test:backend` 和 `npm run test:frontend`。浏览器测试可通过 `CHROMIUM_PATH` 指定已安装的 Chromium。测试使用临时目录、本地假服务和临时端口，不依赖生产凭据。

本轮功能、验证及部署边界见 [快照补全记录](docs/panels-completion-and-validation.md)，新增接口见 [API.md](API.md)。历史记录保留在 [v2026.11.3 验证记录](docs/round2-fixes-and-validation.md) 和 [v2026.11.2 验证记录](docs/validation-v2026.11.2.md)。

历史 `staging/` 是补丁和旧版测试资料，不能作为当前版本完整验收入口。CI 运行当前回归测试和当前后端语音参数检查。

## 版本与部署

版本包使用独立版本号和 Git 标签，发布时保留旧提交、旧标签及旧版本包，不覆盖旧 Release。部署与回滚说明见 [docs/releases.md](docs/releases.md)。

## 早期版本

- 2026-11-02：同步线上旧版，frontend `v=20261101195157`（menu v3），server.mjs `02d090e5`（voice settings）；对应仓库提交 `1bcb35f928ad6f0ce46b32d38bccacea255ef170`。
