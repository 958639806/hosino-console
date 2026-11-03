# v2026.11.2 验证记录

日期：2026-11-02（新加坡）。环境：Linux、Node.js 24.19.0、Python 3.12.14、Chromium。

## 当前版本回归

`npm test`：**47 项通过，0 失败、0 跳过**。

| 测试文件 | 数量 | 覆盖内容 |
| --- | ---: | --- |
| `tests/gateway.test.cjs` | 6 | 握手、断连、超时、证书/配置错误恢复、RPC 清理 |
| `tests/login.test.cjs` | 6 | 首次并发保护、五次锁定、窗口重置、成功清零、请求超时 |
| `tests/cli.test.cjs` | 6 | 同会话/跨会话并发、工具探测失败、取消、退出、删除 |
| `tests/digest.test.cjs` | 14 | 目标历史隔离、退避重试、持久化、旧状态迁移、旧群报禁投递、安全群报投递 |
| `tests/uploads.test.cjs` | 3 | 在途保护、过期/残片清理、失败释放 |
| `tests/server.test.cjs` | 1 | 真实 HTTP 后端登录、Cookie、权限、上传、下载、删除和登出 |
| `tests/frontend.test.cjs` | 11 | Chromium 页面竞态、聊天刷新、编辑器防丢稿、Esc/返回/遮罩、保存与确认框 |

`npm ci --ignore-scripts --no-audit --no-fund` 成功；正式运行依赖审计 `npm audit --omit=dev --audit-level=high` 返回 0 个已知漏洞。`node --check` 和 `git diff --check` 通过。

另用 Chromium 在 390px 和 1440px 下完成概览、会话、模型、更多及人设导航/返回检查，确认页面渲染和示例 API 正常、无未捕获 JavaScript 异常。

## 既有测试

- 当前后端：`node staging/voice/test/console-voice.mjs server.mjs` 通过。
- 历史 fixture：toolcat catalog 8 项、旧版 console-fun 18 组、groupfix gate 37 组、fun Python scripts 16 项通过。这些结果不代替当前版本的回归测试。
- 旧 `console-fun.mjs` 对当前主后端仍有旧机器人 ID 与脱敏默认值不一致的历史断言，未修改或削弱该归档测试；本次运行的是它对应的旧版 fixture。

## 验证范围

网关协议、CLI 子进程和群报模型/投递测试使用本地模拟或可控 I/O。真实 HTTP 服务在临时目录运行，使用临时随机登录凭据；浏览器使用本地假后端。测试均不依赖生产密钥。

未连接生产 QQ/OpenClaw/Qdrant、真实模型和语音供应商，也未切换线上服务或重新发布云环境配置。GitHub 发布、版本包安装检查及远端 CI 结果应以发布操作的实际结果为准，不能由本记录预先视为完成。
