// Development-only native plugin-center fixtures. No process execution, package
// installation, filesystem writes or network requests are performed by this mock.
import { makePluginCenter } from "../plugin-center.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const NOTE = "MOCK 插件中心：只操作内存演示配置，不连接真实网关，也不会安装、卸载或重载任何插件。";
const error = (http, code, message) => Object.assign(new Error(message), { http, code });

export function makePluginCenterMock() {
  const plugins = [
    { id: "mock-weather", name: "MOCK 天气助手", description: "演示配置验证、改动预览和确认保存。", version: "1.0.0", installed: true, enabled: true, origin: "workspace", runtime: { state: "running" } },
    { id: "mock-disabled", name: "MOCK 已停用插件", description: "演示已停用状态；生命周期操作由真实能力决定。", version: "1.0.0", installed: true, enabled: false, origin: "workspace", runtime: { state: "disabled" } },
    { id: "mock-failed", name: "MOCK 错误插件", description: "演示运行错误详情。", version: "1.0.0", installed: true, enabled: true, origin: "workspace", runtime: { state: "service-failed", error: "MOCK 演示：插件初始化失败，未连接任何外部服务。" } },
    { id: "qqbot", name: "MOCK QQ 通道（受保护）", description: "只读演示核心通道的保护状态。", version: "1.0.0", installed: true, enabled: true, origin: "bundled", runtime: { state: "running" } },
  ];
  const schemas = {
    "mock-weather": { type: "object", additionalProperties: false, required: ["city"], properties: {
      city: { type: "string", minLength: 1, maxLength: 80, title: "城市" },
      units: { type: "string", enum: ["celsius", "fahrenheit"], title: "温度单位" },
      dailyLimit: { type: "integer", minimum: 1, maximum: 20, title: "每日查询上限" },
      useCache: { type: "boolean", title: "使用缓存" },
    } },
    "mock-disabled": { type: "object", additionalProperties: false, properties: { greeting: { type: "string", maxLength: 100, title: "演示问候" } } },
    "mock-failed": { type: "object", additionalProperties: false, properties: { retryLimit: { type: "integer", minimum: 0, maximum: 5, title: "重试上限" } } },
    qqbot: { type: "object", additionalProperties: false, properties: { description: { type: "string", title: "演示说明" } } },
  };
  const config = { plugins: { entries: {
    "mock-weather": { enabled: true, config: { city: "北京", units: "celsius", dailyLimit: 5, useCache: true } },
    "mock-disabled": { enabled: false, config: { greeting: "MOCK hello" } },
    "mock-failed": { enabled: true, config: { retryLimit: 2 } },
    qqbot: { enabled: true, config: { description: "MOCK protected channel" } },
  } } };
  let revision = 1;
  const call = async (method, params = {}) => {
    if (method === "plugins.list") return { plugins: clone(plugins), mutationAllowed: false };
    if (method === "plugins.inspect") {
      const plugin = plugins.find(p => p.id === params.pluginId);
      if (!plugin) throw error(404, "not_found", "MOCK：插件不存在");
      const declared = Object.fromEntries(["channels", "providers", "tools", "contracts", "hooks", "mcpServers", "cliCommands", "cliBackends", "skills", "dangerousConfigFlags"].map(key => [key, []]));
      if (plugin.id === "qqbot") declared.channels = ["qqbot"];
      else declared.tools = [plugin.id + ".demo"];
      return {
        plugin: clone(plugin),
        declared,
        components: { mapped: plugin.id === "qqbot" ? ["qqbot"] : [plugin.id + ".demo"], skills: [], mcpServers: [], commands: [], hooks: [], lspServers: [], unavailable: { capabilities: [], mcpServers: [], lspServers: [] } },
      };
    }
    if (method === "config.get") return { config: clone(config), hash: "mock-plugins-" + revision, valid: true };
    if (method === "config.schema.lookup") {
      const match = /^plugins\.entries\.([a-z0-9-]+)\.config$/.exec(params.path || "");
      if (!match || !schemas[match[1]]) throw error(404, "not_found", "MOCK：没有此插件的配置规范");
      return { schema: clone(schemas[match[1]]), reloadKind: "hot" };
    }
    if (method === "config.patch") {
      if (params.baseHash !== "mock-plugins-" + revision) throw error(409, "baseHash_mismatch", "MOCK：插件配置版本已变化");
      const patch = JSON.parse(params.raw || "{}"), replacePaths = new Set(params.replacePaths || []);
      const merge = (target, source, prefix = "") => {
        for (const [key, value] of Object.entries(source)) {
          if (["__proto__", "prototype", "constructor"].includes(key)) throw error(400, "bad_request", "MOCK：不支持此配置字段");
          const field = prefix ? prefix + "." + key : key;
          if (value && typeof value === "object" && !Array.isArray(value) && !replacePaths.has(field)) merge(target[key] ??= {}, value, field);
          else target[key] = clone(value);
        }
      };
      merge(config, patch); revision++;
      return { ok: true, hash: "mock-plugins-" + revision, restart: { required: false }, reloaded: true };
    }
    // The native backend currently blocks lifecycle writes before reaching RPC.
    // Keeping them unsupported here avoids advertising imaginary dry-run support.
    throw error(501, "METHOD_NOT_FOUND", "MOCK：没有模拟此插件网关方法");
  };
  const center = makePluginCenter({
    call,
    reloadPlan: async () => ({ paths: [{ path: "plugins.entries", kind: "hot", label: "reload" }], restartRequired: false }),
    protectedPlugins: () => new Map([["qqbot", "QQ 通道受到保护，MOCK 中也不允许修改。"]]),
  });
  const routes = {
    "GET /api/plugin-center": () => center.list(),
    "GET /api/plugin-center/detail": (_, url) => center.detail(url.searchParams.get("id")),
    "POST /api/plugin-center/plan": body => center.plan(body),
    "POST /api/plugin-center/apply": body => center.apply(body),
  };
  const paths = new Set(Object.keys(routes).map(key => key.slice(key.indexOf(" ") + 1)));
  return {
    handles: (_method, pathname) => paths.has(pathname),
    async handle(method, url, body) {
      const handler = routes[method + " " + url.pathname];
      if (!handler) throw error(405, "method_not_allowed", "MOCK：请求方法不支持");
      return { ...await handler(body, url), mock: true, note: NOTE };
    },
  };
}
