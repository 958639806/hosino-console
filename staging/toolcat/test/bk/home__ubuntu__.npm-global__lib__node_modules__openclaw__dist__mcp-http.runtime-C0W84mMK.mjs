import { t as stableStringify } from "./stable-stringify-CkQ0IEj1.mjs";
import { l as normalizeToolPolicyName } from "./tool-policy-shared-DSNSYBF4.mjs";
import "./tool-policy-C57wduz9.mjs";
import { r as getPluginToolMeta } from "./tool-metadata--ndgGyn8.mjs";
import { o as DirectoryCache } from "./target-resolver-BDpWVYJd.mjs";
import { r as hasSessionControlAuthority } from "./openclaw-tools-BwWTN0hs.mjs";
import { r as loadPairedComputerUseAvailabilityForSurface } from "./computer-tool-C2ukNywl.mjs";
import { n as listCoreToolFactoryDescriptors, t as isCoreCodingSurfaceToolName } from "./core-tool-factory-descriptors-DYpD_U2M.mjs";
import { t as applyEmbeddedAttemptToolsAllow } from "./attempt-tool-construction-plan-BizPvV2W.mjs";
import { n as readMcpLoopbackToolName, t as buildMcpToolSchema } from "./mcp-http.schema-D2_vkqgY.mjs";
import { t as loadNodeExecAvailability } from "./node-exec-availability-Vy5vF0ta.mjs";
import { t as resolveGatewayScopedTools } from "./tool-resolution-CStAFkPx.mjs";
import { createHash } from "node:crypto";
import { n as listNodes } from "./nodes-utils-4kbftX2Z.mjs";
//#region src/gateway/mcp-http.runtime.ts
// QQ-CLAUDE-MCP-DESCRIPTOR-CATALOG v2. Only pure schemas cross sender boundaries.
// No owner tool object, execute closure or authority is stored or given to a member.
const QQ_CLAUDE_DESCRIPTOR_CATALOGS = new Map();
function freezeQQCatalog(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freezeQQCatalog(child);
		Object.freeze(value);
	}
	return value;
}
function resolveQQClaudeDescriptorCatalog(params, mode, tools, actualSchema) {
	const fallback = state => ({ tools, toolSchema: actualSchema, proof: { catalogState: state, schemaEpoch: null, ownerCatalogAttested: false, executableToolCount: tools.length } });
	try {
		const context = params.context;
		const guard = globalThis[Symbol.for("openclaw.qqGroupOwnerGuard")];
		if (!context || !context.qqDescriptorPolicy || !["anthropic", "claude-cli"].includes(context.modelProvider) || context.messageProvider !== "qqbot" || !["user", "heartbeat"].includes(context.trigger) || params.rootedExecution || context.scheduledToolPolicy || context.spawnedBy || context.runtimePolicySessionKey && context.runtimePolicySessionKey !== context.sessionKey || guard?.active !== true || guard.unifiedToolsReady !== true || guard.readScopesReady !== true || guard.isFullCatalogGroup?.(context.sessionKey) !== true) return fallback("not_admitted");
		// Phase (policy/exact), sender identity, per-message assets and the finalized
		// materialized names are not structural policy. All other context fields,
		// including future fields, participate unless explicitly classified here.
		const { runId: _runId, currentMessageId: _messageId, senderIsOwner: _owner, senderName: _senderName, senderUsername: _username, senderE164: _e164, channelContext: _senderChannel, readAssets: _assets, trigger: _trigger, toolsAllow: _materializedNames, nativeCronCreatorToolAllowlist: _nativeExecutionReceipt, ...structuralContext } = context;
		const epoch = createHash("sha256").update(stableStringify({
			config: params.cfg, structuralContext,
			skillLibraryAuthoring: params.skillLibraryAuthoring ?? null, nodeExecAvailability: params.nodeExecAvailability?.cacheKey ?? null,
			pairedComputerUseAvailability: params.pairedComputerUseAvailability?.cacheKey ?? null
		})).digest("hex");
		const valid = value => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
		const senderId = context.channelContext?.sender?.id;
		const canCapture = context.trigger === "user" && context.senderIsOwner === true && valid(senderId) && [context.runId, context.currentMessageId, context.accountId, context.sessionId].every(valid) && Boolean(params.grantToken) && typeof params.isGrantCurrent === "function" && params.isGrantCurrent() === true && context.nativeCronCreatorToolAllowlist !== null && guard.isCurrentOwner?.(Object.freeze({
			sessionKey: context.sessionKey, runId: context.runId, trigger: "user", requester: Object.freeze({ trigger: "user", channel: "qqbot", accountId: context.accountId, senderId, senderIsOwner: true, sourceMessageId: context.currentMessageId })
		})) === true;
		if (canCapture) {
			if (!Array.isArray(actualSchema) || !actualSchema.length) return fallback("unavailable");
			const schema = freezeQQCatalog(structuredClone(actualSchema));
			QQ_CLAUDE_DESCRIPTOR_CATALOGS.set(context.sessionKey, { guard, epoch, schema });
			while (QQ_CLAUDE_DESCRIPTOR_CATALOGS.size > 2) QQ_CLAUDE_DESCRIPTOR_CATALOGS.delete(QQ_CLAUDE_DESCRIPTOR_CATALOGS.keys().next().value);
			return { tools, toolSchema: actualSchema, proof: { catalogState: "captured", schemaEpoch: epoch, ownerCatalogAttested: true, executableToolCount: tools.length } };
		}
		const capture = QQ_CLAUDE_DESCRIPTOR_CATALOGS.get(context.sessionKey);
		if (!capture || capture.guard !== guard || capture.epoch !== epoch) return fallback("unavailable");
		const schema = structuredClone(capture.schema);
		const originals = new Set(tools.map(tool => readMcpLoopbackToolName(tool)));
		const placeholders = schema.filter(descriptor => !originals.has(descriptor.name)).map(descriptor => ({
			name: descriptor.name, description: descriptor.description, parameters: structuredClone(descriptor.inputSchema),
			execute: async () => ({ isError: true, content: [{ type: "text", text: "This tool is advertised in the shared catalog but is unavailable to this requester in the current run. No action was taken." }] })
		}));
		return { tools: [...tools, ...placeholders], toolSchema: schema, proof: { catalogState: "applied", schemaEpoch: epoch, ownerCatalogAttested: true, executableToolCount: tools.length } };
	} catch { return fallback("unavailable"); }
}

// QQ-CLAUDE-MCP-CATALOG-OBSERVATION v1. Actual active-grant schemas, no prompts/arguments/IDs.
const QQ_CLAUDE_MCP_CATALOG_SEEN = new Set();
function observeQQClaudeMcpCatalog(params, mode, toolSchema, proof) {
	try {
		const context = params.context;
		if (!params.grantToken || typeof params.isGrantCurrent !== "function" || params.isGrantCurrent() !== true || context?.nativeCronCreatorToolAllowlist === null || !["anthropic", "claude-cli"].includes(context?.modelProvider) || typeof context.runId !== "string" || !context.runId || context.runId.length > 512) return;
		const groupAlias = ({ "agent:main:qqbot:group:379363a480715dfc01f13aaf92571111": "new", "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5": "old" })[String(context.sessionKey || "").toLowerCase()];
		if (!groupAlias || !["exact", "policy"].includes(mode) || !Array.isArray(toolSchema)) return;
		const runHash = createHash("sha256").update("qq-claude-native-run-v1\0" + context.runId).digest("hex").slice(0, 24);
		const key = groupAlias + ":" + runHash;
		if (QQ_CLAUDE_MCP_CATALOG_SEEN.has(key)) return;
		QQ_CLAUDE_MCP_CATALOG_SEEN.add(key);
		while (QQ_CLAUDE_MCP_CATALOG_SEEN.size > 1024) QQ_CLAUDE_MCP_CATALOG_SEEN.delete(QQ_CLAUDE_MCP_CATALOG_SEEN.values().next().value);
		const names = [...new Set(toolSchema.map(tool => normalizeToolPolicyName(tool.name)).filter(Boolean))].sort();
		const management = ["automations", "codex_plugins", "conversations_list", "conversations_send", "conversations_turn", "gateway", "mobile_ui", "nodes", "plugins", "portal", "sessions", "terminal", "computer", "openclaw", "transcripts", "github_identity_status"];
		const managementCount = management.filter(name => names.includes(name)).length;
		console.info("[qq-claude-mcp-catalog] " + JSON.stringify({ schema: "qq-claude-mcp-catalog-v2", fullSchemaFingerprint: createHash("sha256").update(stableStringify([...toolSchema].sort((a, b) => a.name.localeCompare(b.name)))).digest("hex"), catalogState: proof?.catalogState ?? "unavailable", schemaEpoch: proof?.schemaEpoch ?? null, ownerCatalogAttested: proof?.ownerCatalogAttested === true, executableToolCount: proof?.executableToolCount ?? null, nativeAuthorityPending: context.nativeCronCreatorToolAllowlist === null, groupAlias, runHash, senderIsOwner: context.senderIsOwner === true ? true : context.senderIsOwner === false ? false : null, mode, toolCount: toolSchema.length, toolFingerprint: createHash("sha256").update(JSON.stringify(names)).digest("hex"), managementIncluded: managementCount === management.length, managementCount }));
	} catch { /* Observation cannot alter discovery or execution. */ }
}

const TOOL_CACHE_TTL_MS = 3e4;
const TOOL_CACHE_MAX_ENTRIES = 256;
const NATIVE_TOOL_EXCLUDE = new Set(listCoreToolFactoryDescriptors().map(({ name }) => name).filter(isCoreCodingSurfaceToolName));
function resolveMediatedNativeTools(toolsAllow, mode) {
	if (mode === "exact") return new Set((toolsAllow ?? []).map((name) => normalizeToolPolicyName(name)).filter((name) => NATIVE_TOOL_EXCLUDE.has(name)));
	if (toolsAllow === void 0 || toolsAllow.some((toolName) => normalizeToolPolicyName(toolName) === "*")) return /* @__PURE__ */ new Set();
	return new Set(applyEmbeddedAttemptToolsAllow(Array.from(NATIVE_TOOL_EXCLUDE, (name) => ({ name })), toolsAllow).map((tool) => tool.name));
}
// QQ-CLAUDE-NODE-INVENTORY-SINGLEFLIGHT v1.
// This Symbol and promise are private to one direct preparation resolver call.
// The optional profile gates diagnostics/optimization only, never authority.
const QQ_CLAUDE_NODE_INVENTORY = Symbol("qq-claude-node-inventory");
function qqToolProjectionNow() {
	try {
		const value = performance.now();
		return Number.isFinite(value) && value >= 0 ? value : null;
	} catch { return null; }
}
function withQQClaudeNodeInventory(input, mode) {
	try {
		const context = input.context;
		const profile = input.qqLatencyProfile;
		const groupAlias = context?.sessionKey === "agent:main:qqbot:group:379363a480715dfc01f13aaf92571111" ? "new" : context?.sessionKey === "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5" ? "old" : null;
		if (!groupAlias || !["anthropic", "claude-cli"].includes(context.modelProvider) || context.messageProvider !== "qqbot" || context.trigger !== "user" || input.rootedExecution || context.scheduledToolPolicy || context.spawnedBy || context.runtimePolicySessionKey && context.runtimePolicySessionKey !== context.sessionKey || !["exact", "policy"].includes(mode)) return input;
		if (!profile || profile.trigger !== "user" || profile.runId !== context.runId || typeof context.runId !== "string" || !context.runId || context.runId.length > 512) return input;
		const guard = globalThis[Symbol.for("openclaw.qqGroupOwnerGuard")];
		if (guard?.active !== true || guard.unifiedToolsReady !== true || guard.readScopesReady !== true || guard.isFullCatalogGroup?.(context.sessionKey) !== true) return input;
		const runHash = createHash("sha256").update("qq-claude-native-run-v1\0" + context.runId).digest("hex").slice(0, 24);
		const started = qqToolProjectionNow();
		const counts = { nodeRequests: 0, nodeFetches: 0, nodeReuses: 0, nodeFailures: 0 };
		const stages = { nodeExecMs: null, computerAvailabilityMs: null, nodeFetchMs: 0 };
		const catalogs = [];
		const numeric = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null;
		const elapsed = (begin, end = qqToolProjectionNow()) => begin === null || end === null ? null : numeric(end - begin);
		let inventory;
		let finished = false;
		const scope = Object.freeze({
			loadNodes() {
				input.signal?.throwIfAborted();
				counts.nodeRequests += 1;
				if (inventory) {
					counts.nodeReuses += 1;
					return inventory;
				}
				counts.nodeFetches += 1;
				const fetchStarted = qqToolProjectionNow();
				const addFetchDuration = () => {
					const duration = elapsed(fetchStarted);
					stages.nodeFetchMs = stages.nodeFetchMs === null || duration === null ? null : numeric(stages.nodeFetchMs + duration);
				};
				inventory = listNodes({}, input.signal).then(nodes => {
					addFetchDuration();
					return nodes;
				}, error => {
					addFetchDuration();
					counts.nodeFailures += 1;
					inventory = void 0;
					throw error;
				});
				return inventory;
			},
			record(name, begin) {
				try {
					if (name === "nodeExecMs" || name === "computerAvailabilityMs") stages[name] = elapsed(begin);
				} catch { /* Diagnostic fields never alter discovery. */ }
			},
			catalog(values) {
				try {
					if (catalogs.length >= 4) return;
					catalogs.push({
						totalMs: elapsed(values.catalogStarted),
						factoryMs: elapsed(values.factoryStarted, values.factoryDone),
						schemaMs: elapsed(values.schemaStarted, values.schemaDone),
						descriptorMs: elapsed(values.schemaDone, values.descriptorDone),
						scopedToolCount: numeric(values.scopedToolCount),
						actualToolCount: numeric(values.actualToolCount),
						schemaCount: numeric(values.schemaCount)
					});
				} catch { /* Diagnostic fields never alter schemas or authority. */ }
			},
			finish(outcome) {
				try {
					if (finished) return;
					finished = true;
					console.info("[qq-claude-tool-prep] " + JSON.stringify({ schema: "qq-claude-tool-prep-v1", groupAlias, runHash, trigger: "user", mode, outcome: ["completed", "error", "aborted"].includes(outcome) ? outcome : "error", durationMs: elapsed(started), counts, stages, catalogs }));
				} catch { /* Logging is metadata-only and cannot fail preparation. */ }
			}
		});
		return { ...input, [QQ_CLAUDE_NODE_INVENTORY]: scope };
	} catch { return input; }
}

async function resolveNodeExecScope(params, mode) {
	if (!(!params.rootedExecution && params.context.nodeExecAllowed === true && resolveMediatedNativeTools(params.context.toolsAllow, mode).size === 0)) return params;
	return {
		...params,
		nodeExecAvailability: await loadNodeExecAvailability(params.signal, params[QQ_CLAUDE_NODE_INVENTORY]?.loadNodes)
	};
}
function isComputerAllowedByMcpScope(params, mode) {
	const { toolsAllow } = params.context;
	if (mode === "exact") return toolsAllow === void 0 || toolsAllow.some((name) => normalizeToolPolicyName(name) === "computer");
	return applyEmbeddedAttemptToolsAllow([{ name: "computer" }], toolsAllow).length === 1;
}
async function resolveNodeScope(input, mode) {
	const started = input[QQ_CLAUDE_NODE_INVENTORY] ? qqToolProjectionNow() : null;
	const next = await resolveNodeExecScope(input, mode);
	input[QQ_CLAUDE_NODE_INVENTORY]?.record("nodeExecMs", started);
	return resolvePairedComputerNodeScope(next, mode);
}
async function resolvePairedComputerNodeScope(params, mode) {
	if (!(isComputerAllowedByMcpScope(params, mode) && params.context.modelHasVision !== false && !params.rootedExecution)) return { params };
	const policyResolved = resolveMcpLoopbackTools(params, mode);
	const computerAllowed = policyResolved.tools.some((tool) => readMcpLoopbackToolName(tool) === "computer");
	const computerStarted = params[QQ_CLAUDE_NODE_INVENTORY] ? qqToolProjectionNow() : null;
	const pairedComputerUseAvailability = await loadPairedComputerUseAvailabilityForSurface({
		computerAllowed,
		modelHasVision: params.context.modelHasVision,
		computerTransport: params.rootedExecution ? null : void 0,
		signal: params.signal,
		loadNodes: params[QQ_CLAUDE_NODE_INVENTORY]?.loadNodes
	});
	params[QQ_CLAUDE_NODE_INVENTORY]?.record("computerAvailabilityMs", computerStarted);
	if (!pairedComputerUseAvailability) return {
		params,
		policyResolved
	};
	const resolvedParams = { params: {
		...params,
		pairedComputerUseAvailability
	} };
	return pairedComputerUseAvailability.prepared ? resolvedParams : {
		...resolvedParams,
		policyResolved
	};
}
function resolveMcpLoopbackTools(params, mode) {
	const catalogStarted = params[QQ_CLAUDE_NODE_INVENTORY] ? qqToolProjectionNow() : null;
	params.signal?.throwIfAborted();
	const { toolsAllow, webSearchDisabled, ...context } = params.context;
	const excludeToolNames = new Set(NATIVE_TOOL_EXCLUDE);
	if (webSearchDisabled) excludeToolNames.add("web_search");
	const mediatedNativeTools = params.rootedExecution ? new Set(NATIVE_TOOL_EXCLUDE) : resolveMediatedNativeTools(toolsAllow, mode);
	for (const toolName of mediatedNativeTools) excludeToolNames.delete(toolName);
	const includeNodeExecTool = context.nodeExecAllowed === true && mediatedNativeTools.size === 0;
	if (includeNodeExecTool) excludeToolNames.delete("exec");
	const skillWorkshop = context.skillWorkshop || params.skillLibraryAuthoring ? {
		...context.skillWorkshop,
		libraryAuthoring: params.skillLibraryAuthoring
	} : void 0;
	const factoryStarted = catalogStarted === null ? null : qqToolProjectionNow();
	const scoped = resolveGatewayScopedTools({
		...context,
		rootedExecution: params.rootedExecution,
		messageActionTurnCapability: params.messageActionTurnCapability,
		cfg: params.cfg,
		authProfileStore: params.authProfileStore,
		onYield: params.onYield,
		skillWorkshop,
		nativeCronCreatorToolAllowlist: context.nativeCronCreatorToolAllowlist ?? void 0,
		agentDir: params.authProfileStoreAgentDir,
		conversationReadOrigin: "delegated",
		surface: "loopback",
		sessionControlAuthority: params.sessionControlAuthority,
		isGrantCurrent: params.isGrantCurrent,
		excludeToolNames,
		mediatedToolNames: mediatedNativeTools,
		includeNodeExecTool,
		nodeExecAvailable: params.nodeExecAvailability?.isAvailable,
		pairedNodeComputerUse: params.pairedComputerUseAvailability?.prepared
	});
	const factoryDone = catalogStarted === null ? null : qqToolProjectionNow();
	const tools = mode === "exact" ? applyGrantToolsAllow(scoped.tools, toolsAllow) : applyPolicyToolsAllow(scoped.tools, toolsAllow);
	const schemaStarted = catalogStarted === null ? null : qqToolProjectionNow();
	const actualToolSchema = buildMcpToolSchema(tools);
	const schemaDone = catalogStarted === null ? null : qqToolProjectionNow();
	const qqDescriptors = resolveQQClaudeDescriptorCatalog(params, mode, tools, actualToolSchema);
	const descriptorDone = catalogStarted === null ? null : qqToolProjectionNow();
	const toolSchema = qqDescriptors.toolSchema;
	observeQQClaudeMcpCatalog(params, mode, toolSchema, qqDescriptors.proof);
	scoped.captureFinalCronCreatorTools?.(new Set(toolSchema.map((tool) => tool.name)));
	params[QQ_CLAUDE_NODE_INVENTORY]?.catalog({ catalogStarted, factoryStarted, factoryDone, schemaStarted, schemaDone, descriptorDone, scopedToolCount: scoped.tools.length, actualToolCount: tools.length, schemaCount: toolSchema.length });
	return {
		agentId: scoped.agentId,
		workspaceDir: scoped.workspaceDir,
		tools: qqDescriptors.tools,
		toolSchema
	};
}
/** Resolves loopback-visible tools from the exact names carried by a minted grant. */
async function resolveMcpLoopbackScopedTools(input) {
	const params = withQQClaudeNodeInventory(input, "exact");
	let outcome = "completed";
	try {
		const resolved = await resolveNodeScope(params, "exact");
		return resolved.policyResolved ?? resolveMcpLoopbackTools(resolved.params, "exact");
	} catch (error) {
		outcome = params.signal?.aborted ? "aborted" : "error";
		throw error;
	} finally { params[QQ_CLAUDE_NODE_INVENTORY]?.finish(outcome); }
}
/** Materializes runtime policy expressions against the concrete loopback catalog. */
async function resolveMcpLoopbackPolicyTools(input) {
	const params = withQQClaudeNodeInventory(input, "policy");
	let outcome = "completed";
	try {
		const resolved = await resolveNodeScope(params, "policy");
		return resolved.policyResolved ?? resolveMcpLoopbackTools(resolved.params, "policy");
	} catch (error) {
		outcome = params.signal?.aborted ? "aborted" : "error";
		throw error;
	} finally { params[QQ_CLAUDE_NODE_INVENTORY]?.finish(outcome); }
}
/**
* Hard-enforces a per-run grant allowlist on the loopback surface. Both
* tools/list and tools/call consume this list, so a tool outside the
* allowlist can be neither discovered nor executed even when the CLI runs
* with a bypass permission mode. An empty allowlist fails closed.
*/
function applyGrantToolsAllow(tools, toolsAllow) {
	if (!toolsAllow) return tools;
	const allowed = new Set(toolsAllow.map((name) => normalizeToolPolicyName(name)).filter(Boolean));
	return tools.filter((tool) => {
		const name = readMcpLoopbackToolName(tool);
		return name !== void 0 && allowed.has(normalizeToolPolicyName(name));
	});
}
function applyPolicyToolsAllow(tools, toolsAllow) {
	if (!toolsAllow) return tools;
	const candidates = tools.flatMap((tool) => {
		const name = readMcpLoopbackToolName(tool);
		return name ? [{
			name,
			tool
		}] : [];
	});
	return applyEmbeddedAttemptToolsAllow(candidates, toolsAllow, { toolMeta: (candidate) => getPluginToolMeta(candidate.tool) }).map((candidate) => candidate.tool);
}
function buildMcpLoopbackToolCacheKey(params) {
	const { context } = params;
	return `${params.grantToken ?? ""}\u0000${stableStringify({
		context: {
			...context,
			clientCaps: [...new Set(context.clientCaps ?? [])].toSorted(),
			toolsAllow: context.toolsAllow ? [...new Set(context.toolsAllow)].toSorted() : void 0,
			modelHasVision: context.modelHasVision,
			pinnedWidgetAuthoring: context.pinnedWidgetAuthoring === true,
			currentInboundAudio: context.currentInboundAudio === true,
			sourceReplyOnly: context.sourceReplyOnly === true,
			requireExplicitMessageTarget: context.requireExplicitMessageTarget === true,
			nodeExecAllowed: context.nodeExecAllowed === true,
			delegationCapability: context.delegationCapability === "report_only" ? "report_only" : void 0
		},
		sessionControlsAllowed: hasSessionControlAuthority(params.sessionControlAuthority),
		authProfileStoreAgentDir: params.authProfileStoreAgentDir,
		yieldContextCacheKey: params.yieldContextCacheKey,
		nodeExecAvailability: params.nodeExecAvailability?.cacheKey,
		pairedComputerUseAvailability: params.pairedComputerUseAvailability?.cacheKey
	})}`;
}
/** Short-lived cache for loopback tool lists keyed by session/channel context. */
var McpLoopbackToolCache = class {
	#entries = new DirectoryCache(TOOL_CACHE_TTL_MS, TOOL_CACHE_MAX_ENTRIES);
	#grantConfigScopes = /* @__PURE__ */ new Map();
	#epoch = 0;
	async resolve(input) {
		const epoch = this.#epoch;
		const nodeExecParams = await resolveNodeExecScope(input, "exact");
		input.signal?.throwIfAborted();
		const preDiscoveryCacheKey = buildMcpLoopbackToolCacheKey(nodeExecParams);
		const preDiscoveryCached = this.#entries.get(preDiscoveryCacheKey, nodeExecParams.cfg);
		if (preDiscoveryCached) return preDiscoveryCached;
		const resolved = await resolvePairedComputerNodeScope(nodeExecParams, "exact");
		input.signal?.throwIfAborted();
		const { params } = resolved;
		const cacheKey = buildMcpLoopbackToolCacheKey(params);
		const cached = this.#entries.get(cacheKey, params.cfg);
		if (cached) return cached;
		const nextEntry = resolved.policyResolved ?? resolveMcpLoopbackTools(params, "exact");
		if (epoch !== this.#epoch) return nextEntry;
		this.#entries.set(cacheKey, nextEntry, params.cfg);
		if (params.grantToken) {
			const scopes = this.#grantConfigScopes.get(params.grantToken) ?? /* @__PURE__ */ new Set();
			scopes.add(params.cfg);
			this.#grantConfigScopes.set(params.grantToken, scopes);
		}
		return nextEntry;
	}
	evictGrant(token) {
		this.#epoch += 1;
		const scopes = this.#grantConfigScopes.get(token);
		if (!scopes) return false;
		const cacheKeyPrefix = `${token}\u0000`;
		for (const cfg of scopes) this.#entries.clearMatching((cacheKey) => cacheKey.startsWith(cacheKeyPrefix), cfg);
		this.#grantConfigScopes.delete(token);
		return true;
	}
	clear() {
		this.#epoch += 1;
		this.#entries.clear();
		this.#grantConfigScopes.clear();
	}
};
//#endregion
export { resolveMcpLoopbackPolicyTools as n, resolveMcpLoopbackScopedTools as r, McpLoopbackToolCache as t };
