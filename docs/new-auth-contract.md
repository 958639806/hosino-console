# 模型登录与账号排序：官方网关契约

本实现核对了 npm `openclaw@2026.9.8` 的发布源码，再做 HTTP 适配。没有连接线上网关、真实 OAuth 提供商或写入实际账号；本地验收使用相同协议形状的假网关。供应商是否可登录由当前网关的能力元数据决定，不按供应商名称猜测，也没有改变已有 xAI 模型检测路径。

核对来源：[npm 发布包](https://registry.npmjs.org/openclaw/-/openclaw-2026.9.8.tgz)，SHA-256：

```text
317e0a58db32b386e01187fe9c5c4de541f4ce6d815657bf79a102609b81752a
```

包内对应源码：

- `dist/models-auth-login-DPFz7BCH.mjs`：`models.authLogin` 处理器。
- `dist/src-D2gvuSyP.mjs`：`SystemAgentSetupAuthStartParamsSchema`。
- `dist/model-provider-capabilities-DhxFi8v5.mjs` 与 `provider-login-options-CBEPa6Mp.mjs`：`providerCapabilities[].loginOptions`。
- `dist/users-Cr-ppy_-.mjs`：`WizardNextParamsSchema`、`WizardCancelParamsSchema`、`WizardStepSchema`。
- `dist/wizard-CbIuTSDM.mjs` 与 `session-uky65eRu.mjs`：步骤、长轮询、取消及不可取消的持久化阶段。
- `dist/models-auth-order-q3EJEnsn.mjs` 与 `agents-models-skills-B8G5J5zK.mjs`：排序参数、完整账号集合校验及配置锁。

## 上游 RPC

```js
// models.authStatus({}, 20s) 返回：
{
  providers: [{
    provider, authProvider,
    profiles: [{ profileId, type, source, /* 其他健康状态 */ }],
    profileOrder: [/* 可选，当前顺序 */],
    profileOrderLocked: "auth-config" // 或 "provider-config"；可省略
  }],
  providerCapabilities: [{ provider, loginOptions: [{ id, label, kind }] }]
}

// 选择精确的 loginOptions[].id；不是 {provider, method}。
models.authLogin({ sessionId: "客户端生成的 UUID", authChoice: "选项的 id" })
// -> {sessionId, done:false, status:"running"}

wizard.next({ sessionId, answer: { stepId, value } /* 无答案时省略 */ })
// -> {done:false, status:"running", step:{id,type,...}}
// 或 {done:true, status:"done"|"cancelled"|"error", error?}

wizard.cancel({ sessionId })
// -> {status:"running"|"done"|"cancelled"|"error", error?}

models.authOrderSet({ provider, profileIds: ["完整的同供应商账号列表"] })
// -> {provider, profileIds, warning?}
```

只显示 `kind: "oauth" | "device-code"` 的登录方式。API key 继续使用已有只写凭据入口。账号 ID 读取 `profileId`；兼容旧测试/适配器的 `id`。别名使用上游 `authProvider` 能力信息，不通过账号 ID 前缀判断归属。

## 控制台 HTTP

所有接口要求当前控制台登录。POST 还要求 `x-hs: 1` 与 `confirm: true`。

| 接口 | 输入 | 输出 |
| --- | --- | --- |
| `POST /api/models/auth/login` | `{provider,method?,confirm:true}`，method 是登录选项 id；只有一个选项时可省略 | `{pollId,state,flow,step,url?,userCode?,error?}` |
| `GET /api/models/auth/login/:pollId` | 无 | 同上 |
| `POST /api/models/auth/login/:pollId/answer` | `{stepId,value?,confirm:true}` | 同上 |
| `POST /api/models/auth/login/:pollId/cancel` | `{confirm:true}` | 同上；若无法取消，保持 `state:"pending"` 并附静态 `warning` |
| `POST /api/models/auth/order` | `{provider,profileIds,confirm:true}` | `{ok:true,provider,profileIds,warning?}` |

`state` 为 `pending | done | error | cancelled`。`flow` 为 `url | device`。启动响应可能尚无链接，前端继续轮询获取。`step:null` 表示没有待提交步骤。

`GET /api/models/manage` 的每个供应商增加：

```js
{
  capabilities: { login: true, order: true },
  loginMethods: [{ id, label, kind }],
  profiles: ["按当前顺序排列的账号 ID"],
  orderLocked: false,
  authProvider: "网关返回的认证供应商"
}
```

## 步骤与取消

- `text`、`select`、`confirm`、`multiselect`、`note` 及 `executor:"client"` 的 `action` 要求明确提交，标为 `requiresAnswer:true`。不会替用户选择或同意授权。
- `note` / 客户端 `action` 的继续操作省略 `value`；`confirm` 必须传布尔值，`false` 原样送给网关。文本最多 8192 字符，敏感输入提交后前端清空。
- 下拉、多选项的 `value` 是当前步骤内的随机标识。真实上游选项值只留在服务器，提交后还原，避免凭据对象作为选项值返回浏览器。
- `progress` 及网关执行的 `action` 无需回答。后台仅保留一个 `wizard.next` 长轮询，重复 HTTP 轮询复用它。
- 登录 URL 只接受 HTTPS 或本机 HTTP，禁止脚本 URL、带用户名密码的 URL。初始 OAuth state、PKCE 和设备码按协议展示；后续确切包含本次已提交敏感值的 URL 不展示。
- 已提交文本的原值、JSON/Unicode/URI/form/Base64 常见编码在后续步骤文案中清除。不会把上游错误原文、账号凭据、回调 URL 写入本模块日志或返回错误正文。
- 本地 pollId 是随机 48 位十六进制，只能由启动它的控制台会话访问；服务端只存会话哈希。全局只允许一个进行中的向导，最多保留 32 个会话。
- 本地 TTL 为 15 分钟，定时器到期时主动尽力取消，无需继续打开页面。退出控制台也取消该会话的向导；启动阶段的退出不会在稍后重新创建可继续使用的向导。
- 取消调用真实 `wizard.cancel`。网关进入凭据保存提交阶段后可能拒绝取消，此时继续显示进行中；不会声称撤销已保存的凭据，也不会调用登出或删除账号来模拟取消。

登录启动、回答、排序以及实际推进步骤前都检查静默窗口；暂停时保留待提交步骤。取消允许在静默窗口执行。模块不自行调用重启、改默认模型或更改跨供应商 fallback 顺序；网关自身的登录流程可能请求模型访问授权，由用户在步骤中决定。

## 独立密钥补充

同一源码包确认：`secrets.store.list({})`、`secrets.store.set({name,value,kind})`、`secrets.store.delete({name})`。`kind` 为 `env | secret`；替换旧 secret 时省略 `allowedHosts` 会保留原访问范围。新名称沿用控制台 2–64 位规范，已经存在的官方合法 1–128 位名称仍可列出、更新、清除，不会静默隐藏。

网关可能已经完成写入后才报告运行时刷新失败。控制台使用固定提示要求检查当前状态，不承诺自动回滚；`reloaded:false` 成功结果也显示固定提示。清除前检查当前配置引用（包括 `${NAME}`、SecretRef 以及 MiMo 已有隐式绑定），检查失败时拒绝清除。只读取配置，不读取存储中的旧 secret 值来做备份。
