// OpenClaw 原生插件中心。接口由 app 注入，沿用现有认证、弹层和确认流程。
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const own = (value, key) => value != null && Object.hasOwn(value, key);
const getAt = (value, keys) => keys.reduce((item, key) => own(item, key) ? item[key] : undefined, value);
const putAt = (target, keys, value) => {
  let item = target;
  for (const key of keys.slice(0, -1)) {
    if (!own(item, key)) Object.defineProperty(item, key, { value: Object.create(null), enumerable: true });
    item = item[key];
  }
  Object.defineProperty(item, keys.at(-1), { value, enumerable: true, configurable: true });
};
const pretty = value => value === undefined ? "未设置" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
const safeUrl = value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } };
const failure = plugin => !!(plugin.error || [plugin.runtime?.state || plugin.runtime, plugin.state].some(value => /(?:^|[-_])(error|failed|failure)(?:$|[-_])/i.test(value || "")));
const stateOf = plugin => failure(plugin) ? ["运行异常", "bad", "error"] : plugin.enabled === true ? ["已启用", "ok", "enabled"] : plugin.enabled === false ? ["已停用", "", "disabled"] : ["状态未知", "warn", "unknown"];
const sourceOf = origin => ({ bundled: "随 OpenClaw 提供", global: "全局安装", workspace: "工作区插件", config: "配置加载", npm: "npm 安装", official: "官方来源", clawhub: "ClawHub" }[origin] || "OpenClaw 原生插件");
const actionOf = action => ({ config: "调整配置", install: "安装插件", enable: "启用插件", disable: "停用插件", uninstall: "卸载插件" }[action] || "插件变更");
const applyOf = apply => ({ none: "无需重载", immediate: "无需重载", reload: "需要维护时重载", hot: "需要维护时重载", restart: "需要维护时重启" }[apply] || "生效影响尚未确认");
const errorOf = error => ({
  plugin_protected: "这是受保护的插件，不能在这里修改。",
  not_ready: "当前网关暂不支持这个操作。", not_found: "这个插件已不存在，请刷新列表。",
  baseHash_mismatch: "配置刚被别处改过，请重新打开详情后再预览。", stale: "配置刚被别处改过，请重新打开详情后再预览。",
  plan_expired: "预览已过期，请重新预览。", quiet_window: "当前处于静默时段，暂不能修改，稍后再试。",
  restart_required: "这个改动需要维护时处理，当前没有应用。", reload_required: "这个改动需要维护时处理，当前没有应用。",
  invalid_config: "配置未通过校验，请检查字段后重新预览。", bad_request: "请求未通过校验，请检查填写内容。",
}[error?.code] || (error?.status === 429 ? "操作太频繁，请稍后再试。" : error?.message || "没能完成，请稍后重试。"));

function configFields(config) {
  const secrets = config.secretFields || [], fields = [];
  const walk = (schema, keys = [], titles = [], required = false) => {
    if (!schema || typeof schema !== "object" || keys.length > 8) return;
    const knownSecret = secrets.find(item => JSON.stringify(item.keys || String(item.path || "").split(".")) === JSON.stringify(keys));
    const secret = knownSecret || (schema.writeOnly === true || schema.sensitive === true || schema.format === "password" || /token|secret|password|api.?key|credential|private.?key|cookie|authorization/i.test(keys.at(-1) || "") ? { keys, configured: getAt(config.values, keys) != null && getAt(config.values, keys) !== "" } : null);
    if (!secret && schema.properties && (schema.type === "object" || !schema.type)) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) continue;
        walk(child, [...keys, key], [...titles, child.title || key], (schema.required || []).includes(key));
      }
      return;
    }
    if (!keys.length) return;
    const type = schema.type || (schema.enum?.length ? typeof schema.enum[0] : "string");
    const supported = !secret && !schema.$ref && schema.readOnly !== true && ["string", "boolean", "number", "integer"].includes(type);
    fields.push({ keys, title: titles.join(" › "), schema, required, type, secret, supported, value: getAt(config.values, keys) });
  };
  walk(config.schema);
  return fields;
}

function inputHtml(field, index) {
  const { schema, type, value, secret } = field, id = "pc-field-" + index, initial = value ?? schema.default;
  if (!field.supported) return `<div class="pc-field"><b>${esc(field.title)}</b>${secret ? `<p class="faint">${secret.configured ? "已设置" : "未设置"} · 内容不回显</p><p class="faint">此字段请按插件的密钥接入方式维护。</p>` : `<pre class="pc-value">${esc(pretty(value))}</pre><p class="faint">此项暂只支持查看。</p>`}</div>`;
  const attributes = `id="${id}" data-pc-field="${index}" aria-describedby="${id}-hint ${id}-error"`;
  let input;
  if (secret) input = `<input class="input" ${attributes} type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="${secret.configured ? "已设置；留空保留原值" : "尚未设置"}">`;
  else if (schema.enum) input = `<select class="select" ${attributes}><option value="">未设置</option>${schema.enum.map((option, i) => `<option value="${i}" ${JSON.stringify(option) === JSON.stringify(initial) ? "selected" : ""}>${esc(schema.enumNames?.[i] ?? option)}</option>`).join("")}</select>`;
  else if (type === "boolean") input = `<select class="select" ${attributes}><option value="">未设置</option><option value="true" ${initial === true ? "selected" : ""}>开启</option><option value="false" ${initial === false ? "selected" : ""}>关闭</option></select>`;
  else input = `<input class="input" ${attributes} type="${["number", "integer"].includes(type) ? "number" : "text"}" ${type === "integer" ? 'step="1"' : type === "number" ? 'step="any"' : ""} value="${esc(initial ?? "")}" autocomplete="off" ${Number.isSafeInteger(schema.minLength) && schema.minLength >= 0 ? `minlength="${schema.minLength}"` : ""} ${Number.isSafeInteger(schema.maxLength) && schema.maxLength >= 0 ? `maxlength="${schema.maxLength}"` : ""}>`;
  return `<label class="field pc-field" for="${id}"><span>${esc(field.title)}${field.required ? " · 必填" : ""}${secret ? ` <span class="pill">${secret.configured ? "已设置" : "未设置"} · 只写不读</span>` : ""}</span>${input}<small class="faint" id="${id}-hint">${esc(schema.description || "")}${secret ? " 留空不会清除已有密钥。" : ""}</small><small class="pc-error" id="${id}-error" role="alert"></small></label>`;
}

function parseField(field, input) {
  const text = input.value, schema = field.schema;
  if (field.secret && text === "") {
    if (field.required && !field.secret.configured) throw new Error("请填写这一项。");
    return undefined;
  }
  if (!field.secret && text === "" && (field.type !== "string" || schema.enum)) {
    if (field.required) throw new Error("请填写这一项。");
    return undefined;
  }
  let value = text;
  if (schema.enum && !field.secret) value = schema.enum[+text];
  else if (field.type === "boolean") value = text === "true";
  else if (["number", "integer"].includes(field.type)) {
    value = Number(text);
    if (!Number.isFinite(value) || field.type === "integer" && !Number.isInteger(value)) throw new Error(field.type === "integer" ? "请输入整数。" : "请输入有效数字。");
    if (schema.minimum != null && value < schema.minimum || schema.maximum != null && value > schema.maximum) throw new Error(`请输入 ${schema.minimum ?? "不限"} 至 ${schema.maximum ?? "不限"} 范围内的数值。`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum || schema.exclusiveMaximum != null && value >= schema.exclusiveMaximum) throw new Error("数值超出允许范围。");
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (field.required && !value.length) throw new Error("请填写这一项。");
    if (schema.minLength != null && length < schema.minLength) throw new Error(`至少填写 ${schema.minLength} 个字。`);
    if (schema.maxLength != null && length > schema.maxLength) throw new Error(`最多填写 ${schema.maxLength} 个字。`);
    if (schema.pattern) { try { if (!new RegExp(schema.pattern).test(value)) throw new Error("内容格式不符合要求。"); } catch (error) { if (error.message === "内容格式不符合要求。") throw error; } }
  }
  return value;
}

export async function pluginCenter(body, { rawReq, sheet, confirmDialog, toast, md }) {
  const token = Symbol("plugin-center"); body._pluginCenter = token;
  const active = () => body._pluginCenter === token && body.isConnected;
  let data, query = "", filter = "all", loading = false, detailRequest = 0;
  const report = (target, error) => { if (error?.status === 401) return; target.textContent = errorOf(error); target.hidden = false; };
  const chip = plugin => { const [label, cls] = stateOf(plugin); return `<span class="pill ${cls}">${label}</span>${plugin.protected ? '<span class="pill ac">受保护</span>' : ""}`; };
  const load = async () => {
    if (loading) return; loading = true;
    try { const result = await rawReq("GET", "/api/plugin-center"); if (!active()) return; data = result; draw(); }
    catch (error) { if (!active() || error.status === 401) return; body.innerHTML = `<div class="pc-center card" data-plugin-center><p class="pc-error" role="alert">${esc(errorOf(error))}</p><button class="btn" type="button" data-pc-retry>重新加载</button></div>`; body.querySelector("[data-pc-retry]").onclick = load; }
    finally { loading = false; }
  };
  const drawList = () => {
    const list = body.querySelector("[data-pc-list]");
    const plugins = (data.plugins || []).filter(plugin => (!query || [plugin.id, plugin.name, plugin.description].some(value => String(value || "").toLowerCase().includes(query))) && (filter === "all" || filter === "protected" && plugin.protected || stateOf(plugin)[2] === filter));
    body.querySelector("[data-pc-count]").textContent = `${plugins.length} 个插件`;
    list.innerHTML = plugins.map(plugin => `<button class="pc-plugin" type="button" data-pc-id="${esc(plugin.id)}"><span class="pc-plugin-main"><b>${esc(plugin.name || plugin.id)}</b><span class="faint mono">${esc(plugin.id)}${plugin.version ? " · " + esc(plugin.version) : ""}</span><span class="pc-description">${esc(plugin.description || "暂无简介")}</span><span class="faint">${esc(sourceOf(plugin.origin))}</span></span><span class="pc-plugin-status">${chip(plugin)}<span class="faint">查看详情 ›</span></span></button>`).join("") || '<div class="empty">没有符合条件的插件。</div>';
  };
  const draw = () => {
    body.innerHTML = `<div class="pc-center" data-plugin-center><p class="faint pc-intro">管理 OpenClaw 原生插件，查看功能、说明和配置。改动先预览，再按实际支持情况处理。</p><div class="pc-toolbar"><label class="field pc-search"><span>搜索已装插件</span><input class="input" type="search" data-pc-search placeholder="名称、简介或编号" value="${esc(query)}" autocomplete="off"></label><label class="field"><span>状态</span><select class="select" data-pc-status>${[["all", "全部"], ["enabled", "已启用"], ["disabled", "已停用"], ["error", "运行异常"], ["protected", "受保护"]].map(([key, label]) => `<option value="${key}" ${key === filter ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="btn" type="button" data-pc-refresh>刷新</button></div><div class="pc-note" role="note">${esc(data.blockedReasons?.lifecycle || "安装、启停、更新和卸载需在维护时处理。")}</div>${data.capabilities?.installPreview === true ? '<button class="btn" type="button" data-pc-install-plan>生成安装变更单</button>' : ""}<div class="faint pc-count" data-pc-count></div><div class="pc-list" data-pc-list></div><p class="pc-error" data-pc-error role="alert" hidden></p></div>`;
    body.querySelector("[data-pc-search]").oninput = event => { query = event.target.value.trim().toLowerCase(); drawList(); };
    body.querySelector("[data-pc-status]").onchange = event => { filter = event.target.value; drawList(); };
    body.querySelector("[data-pc-refresh]").onclick = load;
    body.querySelector("[data-pc-install-plan]")?.addEventListener("click", installPlan);
    body.querySelector("[data-pc-list]").onclick = async event => { const button = event.target.closest("[data-pc-id]"); if (!button || button.disabled) return; button.disabled = true; try { await detail(button.dataset.pcId); } catch (error) { if (active()) report(body.querySelector("[data-pc-error]"), error); } finally { if (button.isConnected) button.disabled = false; } };
    drawList();
  };
  const installPlan = () => sheet(`<div class="pc-dialog"><h2>生成安装变更单</h2><p class="faint">登记 OpenClaw 原生包候选。插件内容尚未验证，当前不执行安装；变更单供维护时核对。</p><form data-pc-install novalidate><label class="field"><span>来源</span><select class="select" name="source"><option value="npm">npm</option><option value="official">OpenClaw 官方插件</option><option value="clawhub">ClawHub</option></select></label><label class="field"><span>插件包名称</span><input class="input" name="spec" placeholder="例如 @example/openclaw-plugin" maxlength="512" autocomplete="off" required></label><p class="pc-error" data-pc-install-error role="alert" hidden></p><button class="btn primary pc-wide" type="submit">生成变更单</button></form><button class="btn pc-wide" type="button" data-pc-close>关闭</button></div>`, (element, close) => {
    const form = element.querySelector("form"), button = form.querySelector("button"), error = form.querySelector("[data-pc-install-error]");
    element.querySelector("[data-pc-close]").onclick = () => close();
    form.onsubmit = async event => { event.preventDefault(); if (button.disabled) return; const spec = form.elements.namedItem("spec").value.trim(); if (!spec) return form.elements.namedItem("spec").focus(); button.disabled = true; error.hidden = true; const scope = location.hash;
      try { const plan = await rawReq("POST", "/api/plugin-center/plan", { action: "install", source: form.elements.namedItem("source").value, spec, baseHash: data.baseHash }); if (active() && element.isConnected && scope === location.hash) await preview(plan, { id: spec, name: spec }, [], null, "install"); }
      catch (requestError) { report(error, requestError); }
      finally { if (button.isConnected) button.disabled = false; } };
  }, "plugin-center-install");
  const detail = async id => {
    const scope = location.hash, request = ++detailRequest;
    const result = await rawReq("GET", "/api/plugin-center/detail?id=" + encodeURIComponent(id)); if (!active() || scope !== location.hash || request !== detailRequest) return;
    const plugin = result.plugin, config = result.config || { values: {} }, fields = configFields(config), capabilities = result.capabilities || plugin.capabilities || {};
    const canPreview = !plugin.protected && (config.previewable === true || capabilities.previewConfig === true), editable = canPreview && fields.some(field => field.supported);
    const readmeUrl = safeUrl(result.readmeUrl || plugin.readmeUrl), description = plugin.description || "这个插件暂未提供简介。";
    const features = Object.entries(result.declared || {}).filter(([, values]) => Array.isArray(values) && values.length);
    const featureLabels = { channels: "消息渠道", providers: "模型服务", tools: "工具", contracts: "接口", hooks: "事件处理", mcpServers: "MCP 服务", cliCommands: "命令行命令", cliBackends: "执行后端", skills: "技能", dangerousConfigFlags: "特殊权限" };
    const renderFeature = value => typeof value === "string" ? value : value?.name || value?.id || value?.key || "已声明";
    sheet(`<div class="pc-dialog"><h2>${esc(plugin.name || plugin.id)}</h2><div class="pc-detail-meta">${chip(plugin)}<span class="faint">${esc(plugin.version || "版本未提供")} · ${esc(sourceOf(plugin.origin))}</span></div>${plugin.protected ? `<div class="pc-note">${esc(plugin.protectedReason || "此插件关系到 QQ 或记忆等核心能力，不能在这里修改。")}</div>` : ""}<div class="seg pc-tabs" role="group" aria-label="插件详情"><button type="button" data-pc-tab="overview" aria-pressed="true">概览</button><button type="button" data-pc-tab="readme" aria-pressed="false">说明</button><button type="button" data-pc-tab="config" aria-pressed="false">配置</button></div>
      <section data-pc-pane="overview"><p class="pc-description">${esc(description)}</p>${plugin.error ? `<p class="pc-error">${esc(typeof plugin.error === "string" ? plugin.error : "插件运行异常，请查看网关状态。")}</p>` : ""}<h3>提供的功能</h3>${features.length ? `<dl class="kv">${features.map(([key, values]) => `<dt>${esc(featureLabels[key] || key)}</dt><dd>${values.map(value => esc(renderFeature(value))).join("、")}</dd>`).join("")}</dl>` : '<p class="faint">插件没有提供功能声明。</p>'}${result.components?.commands?.length ? `<h3>聊天命令</h3><p class="pc-description">${result.components.commands.map(command => esc(renderFeature(command))).join("、")}</p>` : ""}<p class="faint">${esc(result.blockedReason || data.blockedReasons?.lifecycle || "安装、启停、更新和卸载需在维护时处理。")}</p></section>
      <section data-pc-pane="readme" hidden>${typeof result.readme === "string" && result.readme ? `<div class="md">${md(result.readme)}</div>` : '<p class="faint">插件未提供可在这里阅读的说明正文。</p>'}${readmeUrl ? `<a class="btn" href="${esc(readmeUrl)}" target="_blank" rel="noopener noreferrer">打开来源说明 ↗</a>` : '<p class="faint">暂无说明链接。</p>'}</section>
      <section data-pc-pane="config" hidden>${!canPreview ? '<p class="pc-note">当前配置仅供查看。</p>' : '<p class="faint">改动先预览。需要重载或重启的内容可导出变更单，在维护时处理。</p>'}<form data-pc-config novalidate>${fields.map(inputHtml).join("") || `<pre class="pc-value">${esc(pretty(config.values || {}))}</pre><p class="faint">插件没有声明可编辑的配置项。</p>`}<p class="pc-error" data-pc-form-error role="alert" hidden></p>${editable ? '<button class="btn primary pc-wide" type="submit" data-pc-preview>预览变更</button>' : ""}</form></section><button class="btn pc-wide" type="button" data-pc-close>关闭</button></div>`, (element, close) => {
      const dialog = element.querySelector(".pc-dialog"), host = element.closest("[data-v3sheet]"), form = dialog.querySelector("form"), error = form.querySelector("[data-pc-form-error]"), save = form.querySelector("[data-pc-preview]"), controls = [...form.querySelectorAll("[data-pc-field]")], initial = new Map(controls.map(input => [input, input.value]));
      let pending = false, needsReload = false;
      controls.forEach(input => { if (!editable) input.disabled = true; input.oninput = () => { input.removeAttribute("aria-invalid"); form.querySelector(`#${input.id}-error`).textContent = ""; }; });
      dialog.querySelectorAll("[data-pc-tab]").forEach(button => button.onclick = () => { dialog.querySelectorAll("[data-pc-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button))); dialog.querySelectorAll("[data-pc-pane]").forEach(pane => pane.hidden = pane.dataset.pcPane !== button.dataset.pcTab); });
      dialog.querySelector("[data-pc-close]").onclick = () => close();
      const previousClose = host._onclose; host._onclose = () => { controls.filter(input => fields[+input.dataset.pcField].secret).forEach(input => input.value = ""); previousClose?.(); };
      form.onsubmit = async event => {
        event.preventDefault(); if (!editable || pending) return;
        error.hidden = true;
        const patch = Object.create(null), snapshot = new Map(controls.map(input => [input, input.value])); let changed = false, invalid = null;
        for (const input of controls) {
          const field = fields[+input.dataset.pcField];
          try { const value = parseField(field, input); if (value !== undefined && (field.secret ? input.value !== "" : input.value !== initial.get(input))) { putAt(patch, field.keys, value); changed = true; } }
          catch (validation) { input.setAttribute("aria-invalid", "true"); form.querySelector(`#${input.id}-error`).textContent = validation.message; invalid ||= input; }
        }
        if (invalid) return invalid.focus();
        if (!changed) return toast("还没有修改配置。");
        controls.filter(input => fields[+input.dataset.pcField].secret).forEach(input => { input.value = ""; snapshot.set(input, ""); });
        pending = true; save.disabled = true;
        try {
          const scope = location.hash, plan = await rawReq("POST", "/api/plugin-center/plan", { action: "config", id, baseHash: result.baseHash, config: patch });
          if (!active() || !host.isConnected || scope !== location.hash) return;
          await preview(plan, plugin, fields, async () => {
            const applied = await rawReq("POST", "/api/plugin-center/apply", { planId: plan.planId, baseHash: plan.baseHash, confirm: true });
            if (!active() || !host.isConnected || scope !== location.hash) return;
            for (const input of controls) initial.set(input, snapshot.get(input));
            close.markSaved(snapshot);
            if (applied.baseHash) result.baseHash = applied.baseHash;
            else { try { result.baseHash = (await rawReq("GET", "/api/plugin-center/detail?id=" + encodeURIComponent(id))).baseHash; } catch { needsReload = true; error.hidden = false; error.textContent = "配置已应用，但最新状态没取到。请重新打开详情后继续编辑。"; } }
            toast(controls.some(input => input.value !== snapshot.get(input)) ? "已应用提交内容，后续修改仍未保存。" : "插件配置已应用。");
            if (applied.warning || applied.pendingRestart) await confirmDialog({ title: "请检查插件状态", body: esc(applied.warning || "网关返回了待重启状态，请在维护时检查。"), ok: "知道了" });
            if (active()) await load();
          }, "config", config.writable === true && capabilities.configure === true);
        } catch (requestError) { report(error, requestError); }
        finally { pending = false; if (save.isConnected) save.disabled = needsReload; }
      };
    }, "plugin-center-detail");
  };
  const preview = (plan, plugin, fields, apply, action = "config", canConfigure = false) => new Promise(resolve => {
    const allowed = action === "config" && canConfigure && plan.canApply === true && ["none", "immediate"].includes(plan.apply) && !plugin.protected;
    const sensitive = item => item.secretChanged === true || /api.?key|secret|password|token|authorization/i.test(item.path || "") || fields.some(field => field.secret && String(item.path).endsWith(field.keys.join(".")));
    const diff = (plan.diff || []).map(item => ({ path: item.path, ...(sensitive(item) ? { secretChanged: true, before: "只显示变更状态", after: "只显示变更状态" } : { before: item.before, after: item.after }) }));
    const exportText = JSON.stringify({ plugin: plugin.id, action, apply: plan.apply, canApply: allowed, blockedReason: plan.blockedReason || null, warning: plan.warning || null, diff }, null, 2);
    let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
    sheet(`<div class="pc-dialog"><h2>预览${esc(actionOf(action))}变更</h2><p>${esc(plugin.name || plugin.id)} · ${esc(applyOf(plan.apply))}</p>${!allowed ? `<div class="pc-note" role="note">${esc(plan.blockedReason || "此变更需在维护时处理，本次不会应用。")}</div>` : '<p class="faint">确认后只应用下方列出的改动。</p>'}${plan.warning ? `<p class="pc-note">${esc(typeof plan.warning === "string" ? plan.warning : "请检查这次变更的影响。")}</p>` : ""}<div class="pc-diff">${diff.map(item => `<div class="pc-diff-item"><b class="mono">${esc(item.path)}</b><div><span class="faint">改前</span><pre>${esc(pretty(item.before))}</pre></div><div><span class="faint">改后</span><pre>${esc(pretty(item.after))}</pre></div></div>`).join("") || '<p class="faint">没有配置差异。</p>'}</div><p class="faint">密钥内容不会出现在变更单中。</p><p class="pc-error" data-pc-plan-error role="alert" hidden></p><div class="pc-buttons"><button class="btn" type="button" data-pc-copy>复制变更单</button><button class="btn" type="button" data-pc-download>下载变更单</button></div><div class="pc-buttons"><button class="btn" type="button" data-pc-cancel>返回编辑</button>${allowed ? '<button class="btn primary" type="button" data-pc-apply>确认应用</button>' : ""}</div></div>`, (element, close) => {
      const host = element.closest("[data-v3sheet]"), beforeClose = host._onclose; host._onclose = () => { finish(); beforeClose?.(); };
      element.querySelector("[data-pc-cancel]").onclick = () => close(true);
      element.querySelector("[data-pc-copy]").onclick = async () => { try { await navigator.clipboard.writeText(exportText); toast("变更单已复制。"); } catch { const text = document.createElement("textarea"); text.value = exportText; element.append(text); text.select(); const copied = document.execCommand("copy"); text.remove(); toast(copied ? "变更单已复制。" : "复制失败，请下载变更单。"); } };
      element.querySelector("[data-pc-download]").onclick = () => { const url = URL.createObjectURL(new Blob([exportText], { type: "application/json;charset=utf-8" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = "openclaw-plugin-change.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      element.querySelector("[data-pc-apply]")?.addEventListener("click", async event => {
        const button = event.currentTarget; if (button.disabled) return; button.disabled = true;
        try { await apply(); await close(true); }
        catch (error) { report(element.querySelector("[data-pc-plan-error]"), error); button.disabled = false; }
      });
    }, "plugin-center-plan");
  });
  body.innerHTML = '<div class="pc-center" data-plugin-center><div class="skel" style="height:100px"></div></div>';
  await load();
}
