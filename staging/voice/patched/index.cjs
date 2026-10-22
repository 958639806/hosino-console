"use strict";
/* QQ-DUAL-GROUP-SCOPE-PATCH v1: exact two authorized OpenIDs, never wildcard routes. */
const __qqDualScopeGroups = new Set(["b4ee2a7019c96343c96eeba8cb63d8c5", "379363a480715dfc01f13aaf92571111"]);
function __qqDualScopeGroup(value) {
 const groupId = String(value ?? "").toLowerCase();
 return __qqDualScopeGroups.has(groupId) ? groupId : null;
}
function __qqDualScopeMessagePath(value) {
 const route = String(value ?? "");
 const match = /^\/v2\/groups\/([a-f0-9]{32})\/messages$/i.exec(route);
 return match && match[0] === route ? __qqDualScopeGroup(match[1]) : null;
}
function __qqDualScopeQualifiedGroup(value) {
 const target = String(value ?? "");
 const match = /^qqbot:group:([a-f0-9]{32})$/i.exec(target);
 return match && match[0] === target ? __qqDualScopeGroup(match[1]) : null;
}
/* /QQ-DUAL-GROUP-SCOPE */
var _F=Function;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/config.ts
var config_exports = {};
__export(config_exports, {
  DEFAULT_ACCOUNT_ID: () => DEFAULT_ACCOUNT_ID,
  applyQQBotAccountConfig: () => applyQQBotAccountConfig,
  isGroupAllowed: () => isGroupAllowed,
  listQQBotAccountIds: () => listQQBotAccountIds,
  resolveDefaultQQBotAccountId: () => resolveDefaultQQBotAccountId,
  resolveGroupAllowFrom: () => resolveGroupAllowFrom,
  resolveGroupConfig: () => resolveGroupConfig,
  resolveGroupConfigFromAccount: () => resolveGroupConfigFromAccount,
  resolveGroupName: () => resolveGroupName,
  resolveGroupPolicy: () => resolveGroupPolicy,
  resolveGroupPrompt: () => resolveGroupPrompt,
  resolveHistoryLimit: () => resolveHistoryLimit,
  resolveIgnoreOtherMentions: () => resolveIgnoreOtherMentions,
  resolveMentionPatterns: () => resolveMentionPatterns,
  resolveProcessingTimeoutMs: () => resolveProcessingTimeoutMs,
  resolveQQBotAccount: () => resolveQQBotAccount,
  resolveRequireMention: () => resolveRequireMention,
  resolveToolPolicy: () => resolveToolPolicy,
  resolveUserAgentSuffix: () => resolveUserAgentSuffix
});
function resolveMentionPatterns(cfg, agentId) {
  if (agentId) {
    const agents = cfg.agents;
    const entry = agents?.list?.find((a) => a.id?.trim().toLowerCase() === agentId.trim().toLowerCase());
    const agentGroupChat = entry?.groupChat;
    if (agentGroupChat && Object.hasOwn(agentGroupChat, "mentionPatterns")) {
      return agentGroupChat.mentionPatterns ?? [];
    }
  }
  const globalGroupChat = cfg?.messages?.groupChat;
  if (globalGroupChat && typeof globalGroupChat === "object" && Object.hasOwn(globalGroupChat, "mentionPatterns")) {
    return globalGroupChat.mentionPatterns ?? [];
  }
  return [];
}
function evaluateMatchedGroupAccessForPolicy(params) {
  if (params.groupPolicy === "disabled") {
    return { allowed: false, groupPolicy: params.groupPolicy, reason: "disabled" };
  }
  if (params.groupPolicy === "allowlist") {
    if (params.requireMatchInput && !params.hasMatchInput) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "missing_match_input" };
    }
    if (!params.allowlistConfigured) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "empty_allowlist" };
    }
    if (!params.allowlistMatched) {
      return { allowed: false, groupPolicy: params.groupPolicy, reason: "not_allowlisted" };
    }
  }
  return { allowed: true, groupPolicy: params.groupPolicy, reason: "allowed" };
}
function resolveGroupPolicy(cfg, accountId) {
  const account = resolveQQBotAccount(cfg, accountId);
  return account.config?.groupPolicy ?? DEFAULT_GROUP_POLICY;
}
function resolveGroupAllowFrom(cfg, accountId) {
  const account = resolveQQBotAccount(cfg, accountId);
  return (account.config?.groupAllowFrom ?? []).map((id) => String(id).trim().toUpperCase());
}
function isGroupAllowed(cfg, groupOpenid, accountId) {
  const account = resolveQQBotAccount(cfg, accountId);
  const policy = account.config?.groupPolicy ?? DEFAULT_GROUP_POLICY;
  const allowList = (account.config?.groupAllowFrom ?? []).map((id) => String(id).trim().toUpperCase());
  const allowlistConfigured = allowList.length > 0;
  const allowlistMatched = allowList.some((id) => id === "*" || id === groupOpenid.toUpperCase());
  return evaluateMatchedGroupAccessForPolicy({
    groupPolicy: policy,
    allowlistConfigured,
    allowlistMatched
  }).allowed;
}
function resolveGroupConfigFromAccount(account, groupOpenid) {
  const groups = account.config?.groups ?? {};
  const wildcardCfg = groups["*"] ?? {};
  const specificCfg = groups[groupOpenid] ?? {};
  const accountDefaultRequireMention = account.config?.defaultRequireMention ?? DEFAULT_GROUP_CONFIG.requireMention;
  return {
    requireMention: specificCfg.requireMention ?? wildcardCfg.requireMention ?? accountDefaultRequireMention,
    ignoreOtherMentions: specificCfg.ignoreOtherMentions ?? wildcardCfg.ignoreOtherMentions ?? DEFAULT_GROUP_CONFIG.ignoreOtherMentions,
    toolPolicy: specificCfg.toolPolicy ?? wildcardCfg.toolPolicy ?? DEFAULT_GROUP_CONFIG.toolPolicy,
    name: specificCfg.name ?? wildcardCfg.name ?? DEFAULT_GROUP_CONFIG.name,
    prompt: specificCfg.prompt ?? wildcardCfg.prompt ?? DEFAULT_GROUP_PROMPT,
    historyLimit: specificCfg.historyLimit ?? wildcardCfg.historyLimit ?? DEFAULT_GROUP_CONFIG.historyLimit
  };
}
function resolveGroupConfig(cfg, groupOpenid, accountId) {
  return resolveGroupConfigFromAccount(resolveQQBotAccount(cfg, accountId), groupOpenid);
}
function resolveHistoryLimit(cfg, groupOpenid, accountId) {
  return Math.max(0, resolveGroupConfig(cfg, groupOpenid, accountId).historyLimit);
}
function resolveGroupPrompt(cfg, groupOpenid, accountId) {
  return resolveGroupConfig(cfg, groupOpenid, accountId).prompt;
}
function resolveRequireMention(cfg, groupOpenid, accountId) {
  return resolveGroupConfig(cfg, groupOpenid, accountId).requireMention;
}
function resolveIgnoreOtherMentions(cfg, groupOpenid, accountId) {
  return resolveGroupConfig(cfg, groupOpenid, accountId).ignoreOtherMentions;
}
function resolveToolPolicy(cfg, groupOpenid, accountId) {
  return resolveGroupConfig(cfg, groupOpenid, accountId).toolPolicy;
}
function resolveGroupName(cfg, groupOpenid, accountId) {
  const name = resolveGroupConfig(cfg, groupOpenid, accountId).name;
  return name || groupOpenid.slice(0, 8);
}
function resolveUserAgentSuffix(cfg) {
  const qqbot = cfg.channels?.qqbot;
  return qqbot?.userAgentSuffix ? String(qqbot.userAgentSuffix).trim() : "";
}
function normalizeAppId(raw) {
  if (raw === null || raw === void 0) return "";
  return String(raw).trim();
}
function listQQBotAccountIds(cfg) {
  const ids = /* @__PURE__ */ new Set();
  const qqbot = cfg.channels?.qqbot;
  if (qqbot?.appId) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }
  if (qqbot?.accounts) {
    for (const accountId of Object.keys(qqbot.accounts)) {
      if (qqbot.accounts[accountId]?.appId) {
        ids.add(accountId);
      }
    }
  }
  return Array.from(ids);
}
function resolveDefaultQQBotAccountId(cfg) {
  const qqbot = cfg.channels?.qqbot;
  if (qqbot?.appId) {
    return DEFAULT_ACCOUNT_ID;
  }
  if (qqbot?.accounts) {
    const ids = Object.keys(qqbot.accounts);
    if (ids.length > 0) {
      return ids[0];
    }
  }
  return DEFAULT_ACCOUNT_ID;
}
function resolveProcessingTimeoutMs(accountConfig) {
  if (accountConfig?.processingTimeoutMs !== void 0) {
    return accountConfig.processingTimeoutMs;
  }
  const env = process.env.OPENCLAW_PROCESSING_TIMEOUT_MS;
  if (env) {
    const v = Number(env);
    if (!Number.isNaN(v) && v >= 0) return v;
  }
  return DEFAULT_PROCESSING_TIMEOUT_MS;
}
function resolveQQBotAccount(cfg, accountId) {
  const resolvedAccountId = accountId ?? resolveDefaultQQBotAccountId(cfg);
  const qqbot = cfg.channels?.qqbot;
  let accountConfig = {};
  let appId = "";
  let clientSecret = "";
  let secretSource = "none";
  if (resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    const { accounts: _accounts, ...topLevelConfig } = qqbot ?? {};
    accountConfig = {
      ...topLevelConfig,
      markdownSupport: qqbot?.markdownSupport ?? true
    };
    appId = normalizeAppId(qqbot?.appId);
  } else {
    const account = qqbot?.accounts?.[resolvedAccountId];
    accountConfig = account ?? {};
    appId = normalizeAppId(account?.appId);
  }
  if (accountConfig.clientSecret) {
    clientSecret = accountConfig.clientSecret;
    secretSource = "config";
  } else if (accountConfig.clientSecretFile) {
    secretSource = "file";
  } else if (process.env.QQBOT_CLIENT_SECRET && resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    clientSecret = process.env.QQBOT_CLIENT_SECRET;
    secretSource = "env";
  }
  if (!appId && process.env.QQBOT_APP_ID && resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    appId = normalizeAppId(process.env.QQBOT_APP_ID);
  }
  return {
    accountId: resolvedAccountId,
    name: accountConfig.name,
    enabled: accountConfig.enabled !== false,
    appId,
    clientSecret,
    secretSource,
    systemPrompt: accountConfig.systemPrompt,
    markdownSupport: accountConfig.markdownSupport !== false,
    userAgentSuffix: resolveUserAgentSuffix(cfg),
    processingTimeoutMs: resolveProcessingTimeoutMs(accountConfig),
    config: normalizeAccountConfig(accountConfig)
  };
}
function normalizeAccountConfig(raw) {
  if (typeof raw.streaming === "boolean") {
    const { streaming, ...rest } = raw;
    return { ...rest, streaming: { mode: streaming ? "partial" : "off" } };
  }
  return raw;
}
function applyQQBotAccountConfig(cfg, accountId, input) {
  const next = { ...cfg };
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const existingConfig = next.channels?.qqbot || {};
    const allowFrom = existingConfig.allowFrom ?? ["*"];
    next.channels = {
      ...next.channels,
      qqbot: {
        ...next.channels?.qqbot || {},
        enabled: true,
        allowFrom,
        ...input.appId ? { appId: input.appId } : {},
        ...input.clientSecret ? { clientSecret: input.clientSecret } : input.clientSecretFile ? { clientSecretFile: input.clientSecretFile } : {},
        ...input.name ? { name: input.name } : {}
      }
    };
  } else {
    const existingAccountConfig = next.channels?.qqbot?.accounts?.[accountId] || {};
    const allowFrom = existingAccountConfig.allowFrom ?? ["*"];
    next.channels = {
      ...next.channels,
      qqbot: {
        ...next.channels?.qqbot || {},
        enabled: true,
        accounts: {
          ...next.channels?.qqbot?.accounts || {},
          [accountId]: {
            ...next.channels?.qqbot?.accounts?.[accountId] || {},
            enabled: true,
            allowFrom,
            ...input.appId ? { appId: input.appId } : {},
            ...input.clientSecret ? { clientSecret: input.clientSecret } : input.clientSecretFile ? { clientSecretFile: input.clientSecretFile } : {},
            ...input.name ? { name: input.name } : {}
          }
        }
      }
    };
  }
  return next;
}
var DEFAULT_ACCOUNT_ID, DEFAULT_GROUP_POLICY, DEFAULT_GROUP_HISTORY_LIMIT, DEFAULT_PROCESSING_TIMEOUT_MS, DEFAULT_GROUP_CONFIG, DEFAULT_GROUP_PROMPT;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    DEFAULT_ACCOUNT_ID = "default";
    DEFAULT_GROUP_POLICY = "open";
    DEFAULT_GROUP_HISTORY_LIMIT = 20;
    DEFAULT_PROCESSING_TIMEOUT_MS = 0;
    DEFAULT_GROUP_CONFIG = {
      requireMention: true,
      ignoreOtherMentions: false,
      toolPolicy: "restricted",
      name: "",
      historyLimit: DEFAULT_GROUP_HISTORY_LIMIT
    };
    DEFAULT_GROUP_PROMPT = [
      "\u82E5\u53D1\u9001\u8005\u4E3A\u673A\u5668\u4EBA\uFF0C\u4EC5\u5728\u5BF9\u65B9\u660E\u786E@\u4F60\u63D0\u95EE\u6216\u8BF7\u6C42\u534F\u52A9\u5177\u4F53\u4EFB\u52A1\u65F6\uFF0C\u4EE5\u7B80\u6D01\u660E\u4E86\u7684\u5185\u5BB9\u56DE\u590D\uFF0C",
      "\u907F\u514D\u4E0E\u5176\u4ED6\u673A\u5668\u4EBA\u4EA7\u751F\u62A2\u7B54\u6216\u591A\u8F6E\u65E0\u610F\u4E49\u5BF9\u8BDD\u3002",
      "\u5728\u7FA4\u804A\u4E2D\u4F18\u5148\u8BA9\u4EBA\u7C7B\u7528\u6237\u7684\u6D88\u606F\u5F97\u5230\u54CD\u5E94\uFF0C\u673A\u5668\u4EBA\u4E4B\u95F4\u4FDD\u6301\u534F\u4F5C\u800C\u975E\u7ADE\u4E89\uFF0C\u786E\u4FDD\u5BF9\u8BDD\u6709\u5E8F\u4E0D\u5237\u5C4F\u3002"
    ].join("");
  }
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) {
            const error = this.createError(
              RangeError,
              "Too many message fragments",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            );
            cb(error);
            return;
          }
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) {
              const error = this.createError(
                RangeError,
                "Too many message fragments",
                false,
                1008,
                "WS_ERR_TOO_MANY_BUFFERED_PARTS"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_2, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https3 = require("https");
    var http2 = require("http");
    var net2 = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash: createHash3 } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 1024 * 1024,
        maxFragments: 128 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request2 = isSecure ? https3.request : http2.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req4;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req4 = websocket._req = request2(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req4);
        }
      } else {
        req4 = websocket._req = request2(opts);
      }
      if (opts.timeout) {
        req4.on("timeout", () => {
          abortHandshake(websocket, req4, "Opening handshake has timed out");
        });
      }
      req4.on("error", (err) => {
        if (req4 === null || req4[kAborted]) return;
        req4 = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req4.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req4, "Maximum redirects exceeded");
            return;
          }
          req4.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req4, res)) {
          abortHandshake(
            websocket,
            req4,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req4.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req4 = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash3("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req4, websocket);
      } else {
        req4.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http2 = require("http");
    var { Duplex } = require("stream");
    var { createHash: createHash3 } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=1048576] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=131072] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 1024 * 1024,
          maxFragments: 128 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http2.createServer((req4, res) => {
            const body = http2.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req4, socket, head) => {
              this.handleUpgrade(req4, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req4) {
        if (this.options.path) {
          const index = req4.url.indexOf("?");
          const pathname = index !== -1 ? req4.url.slice(0, index) : req4.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req4, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req4.headers["sec-websocket-key"];
        const upgrade = req4.headers.upgrade;
        const version = +req4.headers["sec-websocket-version"];
        if (req4.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req4, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req4, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req4, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req4, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req4)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req4.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req4, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req4.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req4, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req4.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req4.socket.authorized || req4.socket.encrypted),
            req: req4
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req4,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req4, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req4, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash3("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req4) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req4);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req4);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http2.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http2.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h2) => `${h2}: ${headers[h2]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req4, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req4);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/adapter/resolve.ts
var resolve_exports = {};
__export(resolve_exports, {
  _resetAdaptersCache: () => _resetAdaptersCache,
  getAdapters: () => getAdapters,
  persistAuthConfig: () => persistAuthConfig,
  resolveRuntimeAdapters: () => resolveRuntimeAdapters
});
function probeFunction(rt, paths) {
  for (const path22 of paths) {
    let target = rt;
    let parent = rt;
    for (let i = 0; i < path22.length; i++) {
      parent = target;
      target = target?.[path22[i]];
      if (target === void 0 || target === null) break;
    }
    if (typeof target === "function") {
      return target.bind(parent);
    }
  }
  return null;
}
function resolveRuntimeAdapters(rt, log4) {
  const version = rt.version ?? "unknown";
  const inboundRun = probeFunction(rt, [
    ["channel", "inbound", "run"],
    // current (2026-05+)
    ["channel", "turn", "run"]
    // legacy (removed 2026-05-27)
  ]);
  const dispatchReply = probeFunction(rt, [
    ["channel", "reply", "dispatchReplyWithBufferedBlockDispatcher"]
  ]);
  const dispatchReplyFromConfig = probeFunction(rt, [
    ["channel", "reply", "dispatchReplyFromConfig"]
  ]);
  const resolveAgentRoute = probeFunction(rt, [
    ["channel", "routing", "resolveAgentRoute"]
  ]);
  const rawBuildContext = probeFunction(rt, [
    ["channel", "inbound", "buildContext"]
  ]);
  const rawFinalizeContext = !rawBuildContext ? probeFunction(rt, [["channel", "reply", "finalizeInboundContext"]]) : null;
  const buildInboundContext = rawBuildContext ? (params) => rawBuildContext(params) : rawFinalizeContext ? (params) => {
    const isCommand = params.access?.commands?.authorized ?? false;
    const rawCtx = {
      Body: params.message.body,
      BodyForAgent: params.message.bodyForAgent,
      RawBody: params.message.rawBody,
      CommandBody: params.message.commandBody ?? params.message.rawBody,
      CommandSource: isCommand ? "text" : void 0,
      CommandTurn: params.command ?? void 0,
      CommandAuthorized: isCommand,
      From: params.from,
      To: params.reply.to,
      SessionKey: params.route.routeSessionKey,
      AccountId: params.route.accountId ?? params.accountId,
      ChatType: params.conversation.kind,
      GroupSystemPrompt: params.conversation.label,
      SenderId: params.sender.id,
      SenderName: params.sender.name,
      Provider: params.provider ?? params.channel,
      Surface: params.surface ?? params.channel,
      MessageSid: params.messageId,
      Timestamp: params.timestamp ?? Date.now(),
      OriginatingChannel: params.channel,
      OriginatingTo: params.reply.originatingTo ?? params.reply.to,
      ...params.extra
    };
    return rawFinalizeContext(rawCtx);
  } : null;
  const resolveStorePath = probeFunction(rt, [
    ["channel", "session", "resolveStorePath"]
  ]);
  const recordInboundSession = probeFunction(rt, [
    ["channel", "session", "recordInboundSession"]
  ]);
  const formatEnvelope = probeFunction(rt, [
    ["channel", "reply", "formatAgentEnvelope"],
    // current (2026-06+)
    ["channel", "reply", "formatInboundEnvelope"]
    // deprecated，低版本兼容
  ]);
  const resolveEnvelopeFormatOptions = probeFunction(rt, [
    ["channel", "reply", "resolveEnvelopeFormatOptions"]
  ]);
  const chunkMarkdownText = probeFunction(rt, [
    ["channel", "text", "chunkMarkdownText"]
  ]);
  const saveRemoteMedia = probeFunction(rt, [
    ["channel", "media", "saveRemoteMedia"]
  ]);
  const getConfig = probeFunction(rt, [
    ["config", "current"]
  ]) ?? probeFunction(rt, [
    ["getConfig"]
  ]) ?? probeFunction(rt, [
    ["config", "loadConfig"]
  ]);
  const rawMutateConfig = probeFunction(rt, [["config", "mutateConfigFile"]]);
  const rawWriteConfig = probeFunction(rt, [["config", "writeConfigFile"]]);
  const persistConfig = rawMutateConfig ? async (mutator) => {
    await rawMutateConfig({
      afterWrite: "hot-reload",
      mutate: mutator
    });
  } : rawWriteConfig && getConfig ? async (mutator) => {
    const current = JSON.parse(JSON.stringify(getConfig()));
    mutator(current);
    await rawWriteConfig(current);
  } : null;
  const resolved = [
    inboundRun && "inboundRun",
    dispatchReply && "dispatchReply",
    dispatchReplyFromConfig && "dispatchReplyFromConfig",
    resolveAgentRoute && "resolveAgentRoute",
    buildInboundContext && "buildInboundContext",
    resolveStorePath && "resolveStorePath",
    recordInboundSession && "recordInboundSession",
    formatEnvelope && "formatEnvelope",
    chunkMarkdownText && "chunkMarkdownText",
    saveRemoteMedia && "saveRemoteMedia",
    getConfig && "getConfig",
    persistConfig && `persistConfig(${rawMutateConfig ? "mutate" : "write"})`
  ].filter(Boolean);
  log4?.info(
    `[qqbot:adapter] openclaw=${version} resolved ${resolved.length} adapters: ${resolved.join(", ")}`
  );
  return {
    inboundRun,
    dispatchReply,
    dispatchReplyFromConfig,
    resolveAgentRoute,
    buildInboundContext,
    resolveStorePath,
    recordInboundSession,
    formatEnvelope,
    resolveEnvelopeFormatOptions,
    chunkMarkdownText,
    saveRemoteMedia,
    getConfig,
    persistConfig,
    version
  };
}
function getAdapters(rt, log4) {
  const cached = _cachedRuntimeRef?.deref();
  if (cached === rt && _cachedAdapters) {
    return _cachedAdapters;
  }
  _cachedAdapters = resolveRuntimeAdapters(rt, log4);
  _cachedRuntimeRef = new WeakRef(rt);
  return _cachedAdapters;
}
async function persistAuthConfig(runtime2, cfg, afterWrite = "restart") {
  const config = runtime2.config;
  if (typeof config?.mutateConfigFile === "function") {
    await config.mutateConfigFile({
      mutate: () => cfg,
      afterWrite
    });
    return;
  }
  if (typeof config?.writeConfigFile === "function") {
    await config.writeConfigFile(cfg);
    return;
  }
  if (typeof runtime2.writeConfigFile === "function") {
    await runtime2.writeConfigFile(cfg);
    return;
  }
  const { homedir: homedir5 } = await import("os");
  const { join: join8 } = await import("path");
  const { writeFileSync: writeFileSync5 } = await import("fs");
  writeFileSync5(join8(homedir5(), ".openclaw", "openclaw.json"), JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}
function _resetAdaptersCache() {
  _cachedAdapters = null;
  _cachedRuntimeRef = null;
}
var _cachedAdapters, _cachedRuntimeRef;
var init_resolve = __esm({
  "src/adapter/resolve.ts"() {
    "use strict";
    _cachedAdapters = null;
    _cachedRuntimeRef = null;
  }
});

// src/adapter/setup.ts
function loadSetup() {
  if (_setup !== void 0) return _setup;
  try {
    _setup = req3("openclaw/plugin-sdk/setup");
  } catch {
    _setup = null;
  }
  return _setup;
}
function loadTools() {
  if (_tools !== void 0) return _tools;
  try {
    _tools = req3("openclaw/plugin-sdk/setup-tools");
  } catch {
    _tools = null;
  }
  return _tools;
}
function createStandardChannelSetupStatus(...args) {
  const mod = loadSetup();
  if (mod) return mod.createStandardChannelSetupStatus(...args);
  return {
    channelLabel: args[0]?.channelLabel ?? "QQ Bot",
    configuredLabel: "Configured",
    unconfiguredLabel: "Not configured",
    resolveConfigured: () => false
  };
}
function setSetupChannelEnabled(...args) {
  loadSetup()?.setSetupChannelEnabled?.(...args);
}
function formatDocsLink(...args) {
  const mod = loadTools();
  if (mod) return mod.formatDocsLink(...args);
  return args[1] ? `${args[1]}: ${args[0]}` : args[0];
}
var import_node_module5, req3, _setup, _tools, DEFAULT_ACCOUNT_ID2;
var init_setup = __esm({
  "src/adapter/setup.ts"() {
    "use strict";
    import_node_module5 = require("module");
    req3 = (0, import_node_module5.createRequire)(__filename);
    DEFAULT_ACCOUNT_ID2 = "default";
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMode.js
var require_QRMode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMode.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      MODE_NUMBER: 1 << 0,
      MODE_ALPHA_NUM: 1 << 1,
      MODE_8BIT_BYTE: 1 << 2,
      MODE_KANJI: 1 << 3
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js
var require_QR8bitByte = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js"(exports2, module2) {
    "use strict";
    var QRMode = require_QRMode();
    function QR8bitByte(data) {
      this.mode = QRMode.MODE_8BIT_BYTE;
      this.data = data;
    }
    QR8bitByte.prototype = {
      getLength: function() {
        return this.data.length;
      },
      write: function(buffer) {
        for (var i = 0; i < this.data.length; i++) {
          buffer.put(this.data.charCodeAt(i), 8);
        }
      }
    };
    module2.exports = QR8bitByte;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMath.js
var require_QRMath = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMath.js"(exports2, module2) {
    "use strict";
    var QRMath = {
      glog: function(n) {
        if (n < 1) {
          throw new Error("glog(" + n + ")");
        }
        return QRMath.LOG_TABLE[n];
      },
      gexp: function(n) {
        while (n < 0) {
          n += 255;
        }
        while (n >= 256) {
          n -= 255;
        }
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (i = 0; i < 8; i++) {
      QRMath.EXP_TABLE[i] = 1 << i;
    }
    var i;
    for (i = 8; i < 256; i++) {
      QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    }
    var i;
    for (i = 0; i < 255; i++) {
      QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
    }
    var i;
    module2.exports = QRMath;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js
var require_QRPolynomial = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js"(exports2, module2) {
    "use strict";
    var QRMath = require_QRMath();
    function QRPolynomial(num, shift) {
      if (num.length === void 0) {
        throw new Error(num.length + "/" + shift);
      }
      var offset = 0;
      while (offset < num.length && num[offset] === 0) {
        offset++;
      }
      this.num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) {
        this.num[i] = num[i + offset];
      }
    }
    QRPolynomial.prototype = {
      get: function(index) {
        return this.num[index];
      },
      getLength: function() {
        return this.num.length;
      },
      multiply: function(e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod: function(e) {
        if (this.getLength() - e.getLength() < 0) {
          return this;
        }
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) {
          num[i] = this.get(i);
        }
        for (var x = 0; x < e.getLength(); x++) {
          num[x] ^= QRMath.gexp(QRMath.glog(e.get(x)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
      }
    };
    module2.exports = QRPolynomial;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js
var require_QRMaskPattern = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js
var require_QRUtil = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js"(exports2, module2) {
    "use strict";
    var QRMode = require_QRMode();
    var QRPolynomial = require_QRPolynomial();
    var QRMath = require_QRMath();
    var QRMaskPattern = require_QRMaskPattern();
    var QRUtil = {
      PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
      ],
      G15: 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0,
      G18: 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0,
      G15_MASK: 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1,
      getBCHTypeInfo: function(data) {
        var d3 = data << 10;
        while (QRUtil.getBCHDigit(d3) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d3 ^= QRUtil.G15 << QRUtil.getBCHDigit(d3) - QRUtil.getBCHDigit(QRUtil.G15);
        }
        return (data << 10 | d3) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function(data) {
        var d3 = data << 12;
        while (QRUtil.getBCHDigit(d3) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d3 ^= QRUtil.G18 << QRUtil.getBCHDigit(d3) - QRUtil.getBCHDigit(QRUtil.G18);
        }
        return data << 12 | d3;
      },
      getBCHDigit: function(data) {
        var digit = 0;
        while (data !== 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      },
      getPatternPosition: function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
      },
      getMask: function(maskPattern, i, j) {
        switch (maskPattern) {
          case QRMaskPattern.PATTERN000:
            return (i + j) % 2 === 0;
          case QRMaskPattern.PATTERN001:
            return i % 2 === 0;
          case QRMaskPattern.PATTERN010:
            return j % 3 === 0;
          case QRMaskPattern.PATTERN011:
            return (i + j) % 3 === 0;
          case QRMaskPattern.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case QRMaskPattern.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case QRMaskPattern.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case QRMaskPattern.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function(errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
          a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits: function(mode, type) {
        if (1 <= type && type < 10) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 10;
            case QRMode.MODE_ALPHA_NUM:
              return 9;
            case QRMode.MODE_8BIT_BYTE:
              return 8;
            case QRMode.MODE_KANJI:
              return 8;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 27) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 12;
            case QRMode.MODE_ALPHA_NUM:
              return 11;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 10;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 41) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 14;
            case QRMode.MODE_ALPHA_NUM:
              return 13;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 12;
            default:
              throw new Error("mode:" + mode);
          }
        } else {
          throw new Error("type:" + type);
        }
      },
      getLostPoint: function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0;
        var col = 0;
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount; col++) {
            var sameCount = 0;
            var dark = qrCode.isDark(row, col);
            for (var r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) {
                continue;
              }
              for (var c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c) {
                  continue;
                }
                if (r === 0 && c === 0) {
                  continue;
                }
                if (dark === qrCode.isDark(row + r, col + c)) {
                  sameCount++;
                }
              }
            }
            if (sameCount > 5) {
              lostPoint += 3 + sameCount - 5;
            }
          }
        }
        for (row = 0; row < moduleCount - 1; row++) {
          for (col = 0; col < moduleCount - 1; col++) {
            var count = 0;
            if (qrCode.isDark(row, col)) count++;
            if (qrCode.isDark(row + 1, col)) count++;
            if (qrCode.isDark(row, col + 1)) count++;
            if (qrCode.isDark(row + 1, col + 1)) count++;
            if (count === 0 || count === 4) {
              lostPoint += 3;
            }
          }
        }
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount - 6; col++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) {
              lostPoint += 40;
            }
          }
        }
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount - 6; row++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) {
              lostPoint += 40;
            }
          }
        }
        var darkCount = 0;
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount; row++) {
            if (qrCode.isDark(row, col)) {
              darkCount++;
            }
          }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
      }
    };
    module2.exports = QRUtil;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js
var require_QRErrorCorrectLevel = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      L: 1,
      M: 0,
      Q: 3,
      H: 2
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js
var require_QRRSBlock = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js"(exports2, module2) {
    "use strict";
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    function QRRSBlock(totalCount, dataCount) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4		
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7		
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10		
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
      var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
      if (rsBlock === void 0) {
        throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
      }
      var length = rsBlock.length / 3;
      var list = [];
      for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) {
          list.push(new QRRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
      switch (errorCorrectLevel) {
        case QRErrorCorrectLevel.L:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectLevel.M:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectLevel.Q:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectLevel.H:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    module2.exports = QRRSBlock;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js
var require_QRBitBuffer = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js"(exports2, module2) {
    "use strict";
    function QRBitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    QRBitBuffer.prototype = {
      get: function(index) {
        var bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
      },
      put: function(num, length) {
        for (var i = 0; i < length; i++) {
          this.putBit((num >>> length - i - 1 & 1) == 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        var bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module2.exports = QRBitBuffer;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/index.js
var require_QRCode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/index.js"(exports2, module2) {
    "use strict";
    var QR8bitByte = require_QR8bitByte();
    var QRUtil = require_QRUtil();
    var QRPolynomial = require_QRPolynomial();
    var QRRSBlock = require_QRRSBlock();
    var QRBitBuffer = require_QRBitBuffer();
    function QRCode(typeNumber, errorCorrectLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectLevel = errorCorrectLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }
    QRCode.prototype = {
      addData: function(data) {
        var newData = new QR8bitByte(data);
        this.dataList.push(newData);
        this.dataCache = null;
      },
      isDark: function(row, col) {
        if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
          throw new Error(row + "," + col);
        }
        return this.modules[row][col];
      },
      getModuleCount: function() {
        return this.moduleCount;
      },
      make: function() {
        if (this.typeNumber < 1) {
          var typeNumber = 1;
          for (typeNumber = 1; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
            var buffer = new QRBitBuffer();
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) {
              totalDataCount += rsBlocks[i].dataCount;
            }
            for (var x = 0; x < this.dataList.length; x++) {
              var data = this.dataList[x];
              buffer.put(data.mode, 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
              data.write(buffer);
            }
            if (buffer.getLengthInBits() <= totalDataCount * 8)
              break;
          }
          this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (var col = 0; col < this.moduleCount; col++) {
            this.modules[row][col] = null;
          }
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) {
          this.setupTypeNumber(test);
        }
        if (this.dataCache === null) {
          this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
        }
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function(row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if (0 <= r && r <= 6 && (c === 0 || c === 6) || 0 <= c && c <= 6 && (r === 0 || r === 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function() {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          var lostPoint = QRUtil.getLostPoint(this);
          if (i === 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }
        return pattern;
      },
      createMovieClip: function(target_mc, instance_name, depth) {
        var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
        var cs = 1;
        this.make();
        for (var row = 0; row < this.modules.length; row++) {
          var y2 = row * cs;
          for (var col = 0; col < this.modules[row].length; col++) {
            var x = col * cs;
            var dark = this.modules[row][col];
            if (dark) {
              qr_mc.beginFill(0, 100);
              qr_mc.moveTo(x, y2);
              qr_mc.lineTo(x + cs, y2);
              qr_mc.lineTo(x + cs, y2 + cs);
              qr_mc.lineTo(x, y2 + cs);
              qr_mc.endFill();
            }
          }
        }
        return qr_mc;
      },
      setupTimingPattern: function() {
        for (var r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] !== null) {
            continue;
          }
          this.modules[r][6] = r % 2 === 0;
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] !== null) {
            continue;
          }
          this.modules[6][c] = c % 2 === 0;
        }
      },
      setupPositionAdjustPattern: function() {
        var pos = QRUtil.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (this.modules[row][col] !== null) {
              continue;
            }
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (Math.abs(r) === 2 || Math.abs(c) === 2 || r === 0 && c === 0) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeNumber: function(test) {
        var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
        for (var i = 0; i < 18; i++) {
          mod = !test && (bits >> i & 1) === 1;
          this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
        }
        for (var x = 0; x < 18; x++) {
          mod = !test && (bits >> x & 1) === 1;
          this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
        }
      },
      setupTypeInfo: function(test, maskPattern) {
        var data = this.errorCorrectLevel << 3 | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
        for (var v = 0; v < 15; v++) {
          mod = !test && (bits >> v & 1) === 1;
          if (v < 6) {
            this.modules[v][8] = mod;
          } else if (v < 8) {
            this.modules[v + 1][8] = mod;
          } else {
            this.modules[this.moduleCount - 15 + v][8] = mod;
          }
        }
        for (var h2 = 0; h2 < 15; h2++) {
          mod = !test && (bits >> h2 & 1) === 1;
          if (h2 < 8) {
            this.modules[8][this.moduleCount - h2 - 1] = mod;
          } else if (h2 < 9) {
            this.modules[8][15 - h2 - 1 + 1] = mod;
          } else {
            this.modules[8][15 - h2 - 1] = mod;
          }
        }
        this.modules[this.moduleCount - 8][8] = !test;
      },
      mapData: function(data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col === 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (this.modules[row][col - c] === null) {
                var dark = false;
                if (byteIndex < data.length) {
                  dark = (data[byteIndex] >>> bitIndex & 1) === 1;
                }
                var mask = QRUtil.getMask(maskPattern, row, col - c);
                if (mask) {
                  dark = !dark;
                }
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex === -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
    };
    QRCode.PAD0 = 236;
    QRCode.PAD1 = 17;
    QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
      var buffer = new QRBitBuffer();
      for (var i = 0; i < dataList.length; i++) {
        var data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var x = 0; x < rsBlocks.length; x++) {
        totalDataCount += rsBlocks[x].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode.PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode.PAD1, 8);
      }
      return QRCode.createBytes(buffer, rsBlocks);
    };
    QRCode.createBytes = function(buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) {
          dcdata[r][i] = 255 & buffer.buffer[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var x = 0; x < ecdata[r].length; x++) {
          var modIndex = x + modPoly.getLength() - ecdata[r].length;
          ecdata[r][x] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var y2 = 0; y2 < rsBlocks.length; y2++) {
        totalCodeCount += rsBlocks[y2].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var z = 0; z < maxDcCount; z++) {
        for (var s = 0; s < rsBlocks.length; s++) {
          if (z < dcdata[s].length) {
            data[index++] = dcdata[s][z];
          }
        }
      }
      for (var xx = 0; xx < maxEcCount; xx++) {
        for (var t = 0; t < rsBlocks.length; t++) {
          if (xx < ecdata[t].length) {
            data[index++] = ecdata[t][xx];
          }
        }
      }
      return data;
    };
    module2.exports = QRCode;
  }
});

// node_modules/qrcode-terminal/lib/main.js
var require_main = __commonJS({
  "node_modules/qrcode-terminal/lib/main.js"(exports2, module2) {
    "use strict";
    var QRCode = require_QRCode();
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    var black = "\x1B[40m  \x1B[0m";
    var white = "\x1B[47m  \x1B[0m";
    var toCell = function(isBlack) {
      return isBlack ? black : white;
    };
    var repeat = function(color) {
      return {
        times: function(count) {
          return new Array(count).join(color);
        }
      };
    };
    var fill = function(length, value) {
      var arr = new Array(length);
      for (var i = 0; i < length; i++) {
        arr[i] = value;
      }
      return arr;
    };
    module2.exports = {
      error: QRErrorCorrectLevel.L,
      generate: function(input, opts, cb) {
        if (typeof opts === "function") {
          cb = opts;
          opts = {};
        }
        var qrcode = new QRCode(-1, this.error);
        qrcode.addData(input);
        qrcode.make();
        var output = "";
        if (opts && opts.small) {
          var BLACK = true, WHITE = false;
          var moduleCount = qrcode.getModuleCount();
          var moduleData = qrcode.modules.slice();
          var oddRow = moduleCount % 2 === 1;
          if (oddRow) {
            moduleData.push(fill(moduleCount, WHITE));
          }
          var platte = {
            WHITE_ALL: "\u2588",
            WHITE_BLACK: "\u2580",
            BLACK_WHITE: "\u2584",
            BLACK_ALL: " "
          };
          var borderTop = repeat(platte.BLACK_WHITE).times(moduleCount + 3);
          var borderBottom = repeat(platte.WHITE_BLACK).times(moduleCount + 3);
          output += borderTop + "\n";
          for (var row = 0; row < moduleCount; row += 2) {
            output += platte.WHITE_ALL;
            for (var col = 0; col < moduleCount; col++) {
              if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === WHITE) {
                output += platte.WHITE_ALL;
              } else if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === BLACK) {
                output += platte.WHITE_BLACK;
              } else if (moduleData[row][col] === BLACK && moduleData[row + 1][col] === WHITE) {
                output += platte.BLACK_WHITE;
              } else {
                output += platte.BLACK_ALL;
              }
            }
            output += platte.WHITE_ALL + "\n";
          }
          if (!oddRow) {
            output += borderBottom;
          }
        } else {
          var border = repeat(white).times(qrcode.getModuleCount() + 3);
          output += border + "\n";
          qrcode.modules.forEach(function(row2) {
            output += white;
            output += row2.map(toCell).join("");
            output += white + "\n";
          });
          output += border;
        }
        if (cb) cb(output);
        else console.log(output);
      },
      setErrorLevel: function(error) {
        this.error = QRErrorCorrectLevel[error] || this.error;
      }
    };
  }
});

// node_modules/@tencent-connect/qqbot-connector/dist/esm/qqbot-session.js
function d(t = "production") {
  return E[t];
}
function l() {
  return import_node_crypto2.default.randomBytes(32).toString("base64");
}
function b(t, r) {
  const a = Buffer.from(r, "base64"), n = Buffer.from(t, "base64"), e = n.subarray(0, 12), c = n.subarray(n.length - 16), s = n.subarray(12, n.length - 16), o = import_node_crypto2.default.createDecipheriv("aes-256-gcm", a, e);
  return o.setAuthTag(c), Buffer.concat([o.update(s), o.final()]).toString("utf8");
}
function h(t, r, a) {
  return new Promise((n, e) => {
    const c = JSON.stringify(r), s = new URL(t), o = import_node_https2.default.request({ hostname: s.hostname, path: s.pathname + s.search, method: "POST", timeout: a, headers: { "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(c) } }, (i) => {
      if (i.statusCode !== 200) {
        i.resume(), e(new Error(`HTTP ${i.statusCode} from ${t}`));
        return;
      }
      let f = "";
      i.on("data", (p2) => {
        f += p2;
      }), i.on("end", () => {
        try {
          n(JSON.parse(f));
        } catch (p2) {
          e(p2);
        }
      });
    });
    o.on("error", e), o.on("timeout", () => {
      o.destroy(), e(new Error(`timeout fetching ${t}`));
    }), o.end(c);
  });
}
async function y(t = "production", r = 1e4) {
  const a = `https://${d(t)}/lite/create_bind_task`, n = l(), e = await h(a, { key: n }, r);
  if (e.retcode !== 0) throw new Error(e.msg ?? "create_bind_task failed");
  if (!e.data?.task_id) throw new Error("create_bind_task: missing task_id");
  return { taskId: e.data.task_id, key: n };
}
async function g(t, r = "production", a = 1e4) {
  const n = `https://${d(r)}/lite/poll_bind_result`, e = await h(n, { task_id: t }, a);
  if (e.retcode !== 0) throw new Error(e.msg ?? "poll_bind_result failed");
  return { status: e.data?.status ?? u.NONE, botAppId: String(e.data?.bot_appid ?? ""), botEncryptSecret: e.data?.bot_encrypt_secret ?? "", userOpenid: e.data?.user_openid || void 0 };
}
function w(t, r = "") {
  return `https://${d("production")}/qqbot/openclaw/connect.html?task_id=${encodeURIComponent(t)}&source=${encodeURIComponent(r)}&_wv=2`;
}
var import_node_crypto2, import_node_https2, E, u;
var init_qqbot_session = __esm({
  "node_modules/@tencent-connect/qqbot-connector/dist/esm/qqbot-session.js"() {
    "use strict";
    import_node_crypto2 = __toESM(require("crypto"), 1);
    import_node_https2 = __toESM(require("https"), 1);
    E = { production: "q.qq.com", test: "test.q.qq.com" };
    (function(t) {
      t[t.NONE = 0] = "NONE", t[t.PENDING = 1] = "PENDING", t[t.COMPLETED = 2] = "COMPLETED", t[t.EXPIRED = 3] = "EXPIRED";
    })(u || (u = {}));
  }
});

// node_modules/@tencent-connect/qqbot-connector/dist/esm/qr-connect.js
function F(r) {
  return new Promise((o) => {
    import_qrcode_terminal.default.generate(r, { small: true }, (e) => {
      o(e);
    });
  });
}
function d2(r, o) {
  return new Promise((e, t) => {
    if (o?.aborted) {
      t(new DOMException("Aborted", "AbortError"));
      return;
    }
    const n = setTimeout(e, r);
    o?.addEventListener("abort", () => {
      clearTimeout(n), t(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
async function C(r, o, e) {
  for (; !e?.aborted; ) {
    let t;
    try {
      t = await g(r);
    } catch {
      await d2(p, e);
      continue;
    }
    if (t.status === u.COMPLETED) {
      const n = b(t.botEncryptSecret, o);
      return { outcome: "scanned", appId: t.botAppId, appSecret: n, userOpenid: t.userOpenid };
    }
    if (t.status === u.EXPIRED) return { outcome: "expired" };
    await d2(p, e);
  }
  throw new DOMException("Aborted", "AbortError");
}
function l2(r, o) {
  const e = new AbortController(), t = o?.signal ? AbortSignal.any([e.signal, o.signal]) : e.signal;
  return (async () => {
    const n = o?.displayQrCodeToConsole ?? true;
    for (; ; ) {
      if (t.aborted) throw new DOMException("Aborted", "AbortError");
      let a;
      try {
        a = await y();
      } catch (u2) {
        throw new Error(`\u83B7\u53D6\u7ED1\u5B9A\u4EFB\u52A1\u5931\u8D25: ${u2 instanceof Error ? u2.message : String(u2)}`, { cause: u2 });
      }
      const i = w(a.taskId, o?.source);
      if (n) {
        const u2 = await F(i);
        console.log(u2), console.log(`\u8BF7\u4F7F\u7528\u624B\u673A QQ \u626B\u63CF\u4E0A\u65B9\u4E8C\u7EF4\u7801\uFF0C\u5B8C\u6210\u673A\u5668\u4EBA\u7ED1\u5B9A\u3002
`);
      }
      r.onQrDisplayed?.(i);
      const s = await C(a.taskId, a.key, t);
      if (s.outcome === "scanned") {
        r.onSuccess([{ appId: s.appId, appSecret: s.appSecret, userOpenid: s.userOpenid }]);
        return;
      }
      r.onQrExpired?.(), n && console.log(`\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u6B63\u5728\u5237\u65B0\u2026
`);
    }
  })().catch((n) => {
    if (n instanceof DOMException && n.name === "AbortError") {
      r.onFailure(new Error("\u5DF2\u53D6\u6D88"));
      return;
    }
    r.onFailure(n instanceof Error ? n : new Error(String(n)));
  }), () => e.abort();
}
function m2(r) {
  return new Promise((o, e) => {
    l2({ onSuccess: o, onFailure: e }, { ...r, displayQrCodeToConsole: true });
  });
}
var import_qrcode_terminal, p;
var init_qr_connect = __esm({
  "node_modules/@tencent-connect/qqbot-connector/dist/esm/qr-connect.js"() {
    "use strict";
    import_qrcode_terminal = __toESM(require_main(), 1);
    init_qqbot_session();
    p = 2e3;
  }
});

// node_modules/@tencent-connect/qqbot-connector/dist/esm/index.js
var init_esm = __esm({
  "node_modules/@tencent-connect/qqbot-connector/dist/esm/index.js"() {
    "use strict";
    init_qr_connect();
  }
});

// src/setup/account-key.ts
var account_key_exports = {};
__export(account_key_exports, {
  resolveAccountKey: () => resolveAccountKey
});
function resolveAccountKey(cfg, appId, resolvedId) {
  if (resolvedId) return resolvedId;
  for (const id of listQQBotAccountIds(cfg)) {
    if (resolveQQBotAccount(cfg, id).appId === appId) return id;
  }
  if (listQQBotAccountIds(cfg).length === 0) return "default";
  return appId;
}
var init_account_key = __esm({
  "src/setup/account-key.ts"() {
    "use strict";
    init_config();
  }
});

// src/setup/finalize.ts
var finalize_exports = {};
__export(finalize_exports, {
  applyAccountDefaults: () => applyAccountDefaults,
  finalizeQQBotSetup: () => finalizeQQBotSetup
});
function isConfigured(cfg, accountId) {
  const account = resolveQQBotAccount(cfg, accountId);
  return Boolean(account.appId && account.clientSecret);
}
async function linkViaQrCode(cfg, _accountId, prompter, rt) {
  try {
    const accounts = await m2({ source: "openclaw" });
    if (accounts.length === 0) {
      await prompter.note("\u672A\u83B7\u53D6\u5230\u4EFB\u4F55 QQ Bot \u8D26\u53F7\u4FE1\u606F\u3002", "QQ Bot");
      return cfg;
    }
    let next = cfg;
    for (const { appId, appSecret, userOpenid } of accounts) {
      const key = resolveAccountKey(cfg, appId);
      next = applyQQBotAccountConfig(next, key, { appId, clientSecret: appSecret });
      next = applyAccountDefaults(next, key, userOpenid);
      rt.log(`\u7ED1\u5B9A\u6210\u529F\uFF01\u8D26\u6237: ${key} (AppID: ${appId})`);
    }
    return next;
  } catch (err) {
    rt.error(`QQ Bot \u7ED1\u5B9A\u5931\u8D25: ${String(err)}`);
    await prompter.note(`\u7ED1\u5B9A\u5931\u8D25\uFF0C\u60A8\u53EF\u4EE5\u7A0D\u540E\u624B\u52A8\u914D\u7F6E\u3002
\u6587\u6863: ${formatDocsLink("/channels/qqbot", "qqbot")}`, "QQ Bot");
    return cfg;
  }
}
async function linkViaManual(cfg, _accountId, prompter) {
  const appIdInput = await prompter.text({ message: "\u8BF7\u8F93\u5165 QQ Bot AppID", validate: (v) => v.trim() ? void 0 : "AppID \u4E0D\u80FD\u4E3A\u7A7A" });
  const secret = await prompter.text({ message: "\u8BF7\u8F93\u5165 QQ Bot AppSecret", validate: (v) => v.trim() ? void 0 : "AppSecret \u4E0D\u80FD\u4E3A\u7A7A" });
  const appId = appIdInput.trim();
  const key = resolveAccountKey(cfg, appId);
  let next = applyQQBotAccountConfig(cfg, key, { appId, clientSecret: secret.trim() });
  next = applyAccountDefaults(next, key);
  await prompter.note("\u2714 QQ Bot \u914D\u7F6E\u5B8C\u6210\uFF01", "QQ Bot");
  return next;
}
async function finalizeQQBotSetup(params) {
  const accountId = params.accountId.trim() || DEFAULT_ACCOUNT_ID2;
  const configured = isConfigured(params.cfg, accountId);
  const mode = await params.prompter.select({
    message: configured ? "QQ \u5DF2\u7ED1\u5B9A\uFF0C\u9009\u62E9\u64CD\u4F5C" : "\u9009\u62E9 QQ \u7ED1\u5B9A\u65B9\u5F0F",
    options: [
      { value: "qr", label: "\u626B\u7801\u7ED1\u5B9A\uFF08\u63A8\u8350\uFF09", hint: "\u4F7F\u7528 QQ \u626B\u63CF\u4E8C\u7EF4\u7801\u81EA\u52A8\u5B8C\u6210\u7ED1\u5B9A" },
      { value: "manual", label: "\u624B\u52A8\u8F93\u5165 QQ Bot AppID \u548C AppSecret", hint: "\u9700\u5230 QQ \u5F00\u653E\u5E73\u53F0 q.qq.com \u67E5\u770B" },
      { value: "skip", label: configured ? "\u4FDD\u6301\u5F53\u524D\u914D\u7F6E" : "\u7A0D\u540E\u914D\u7F6E" }
    ]
  });
  let next = params.cfg;
  if (mode === "qr") {
    next = await linkViaQrCode(next, accountId, params.prompter, params.runtime);
  } else if (mode === "manual") {
    next = await linkViaManual(next, accountId, params.prompter);
  } else if (!configured) {
    await params.prompter.note("\u60A8\u53EF\u4EE5\u7A0D\u540E\u8FD0\u884C\u4EE5\u4E0B\u547D\u4EE4\u91CD\u65B0\u914D\u7F6E\uFF1A\n  openclaw channels add", "QQ Bot");
  }
  return { cfg: next };
}
function applyAccountDefaults(cfg, accountId, userOpenid) {
  const next = { ...cfg, channels: { ...cfg.channels } };
  const qqbot = { ...next.channels?.qqbot ?? {} };
  const defaults = { streaming: { mode: "partial" }, dmPolicy: "allowlist", mediaMaxMb: 200 };
  if (userOpenid) defaults.allowFrom = [userOpenid];
  if (accountId === DEFAULT_ACCOUNT_ID2) {
    Object.assign(qqbot, defaults);
  } else {
    const accounts = { ...qqbot.accounts ?? {} };
    accounts[accountId] = { ...accounts[accountId] ?? {}, ...defaults };
    qqbot.accounts = accounts;
  }
  next.channels = { ...next.channels, qqbot };
  return next;
}
var init_finalize = __esm({
  "src/setup/finalize.ts"() {
    "use strict";
    init_setup();
    init_esm();
    init_config();
    init_account_key();
  }
});

// index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_ACCOUNT_ID: () => DEFAULT_ACCOUNT_ID,
  MSG_TYPE_QUOTE: () => MSG_TYPE_QUOTE2,
  MSG_TYPE_TEXT: () => MSG_TYPE_TEXT,
  PersistedRefIndexStore: () => PersistedRefIndexStore,
  QQBotGateway: () => QQBotGateway,
  StreamContentType: () => StreamContentType2,
  StreamInputMode: () => StreamInputMode2,
  StreamInputState: () => StreamInputState2,
  StreamingController: () => StreamingController,
  applyQQBotAccountConfig: () => applyQQBotAccountConfig,
  buildUserAgent: () => buildUserAgent,
  default: () => index_default,
  dispatchToOpenClaw: () => dispatchToOpenClaw,
  flushAllRefIndexStores: () => flushAllRefIndexStores,
  getBotForAccount: () => getBotForAccount,
  getPersistedRefIndexStore: () => getPersistedRefIndexStore,
  getQQBotRuntime: () => getQQBotRuntime,
  isGroupAllowed: () => isGroupAllowed,
  listQQBotAccountIds: () => listQQBotAccountIds,
  parseTarget: () => parseTarget2,
  qqbotOnboardingAdapter: () => qqbotOnboardingAdapter,
  qqbotPlugin: () => qqbotPlugin,
  resolveDefaultQQBotAccountId: () => resolveDefaultQQBotAccountId,
  resolveGroupAllowFrom: () => resolveGroupAllowFrom,
  resolveGroupConfig: () => resolveGroupConfig,
  resolveGroupConfigFromAccount: () => resolveGroupConfigFromAccount,
  resolveGroupName: () => resolveGroupName,
  resolveGroupPolicy: () => resolveGroupPolicy,
  resolveGroupPrompt: () => resolveGroupPrompt,
  resolveHistoryLimit: () => resolveHistoryLimit,
  resolveIgnoreOtherMentions: () => resolveIgnoreOtherMentions,
  resolveMentionPatterns: () => resolveMentionPatterns,
  resolveProcessingTimeoutMs: () => resolveProcessingTimeoutMs,
  resolveQQBotAccount: () => resolveQQBotAccount,
  resolveRequireMention: () => resolveRequireMention,
  resolveToolPolicy: () => resolveToolPolicy,
  resolveUserAgentSuffix: () => resolveUserAgentSuffix,
  sendMedia: () => sendMedia2,
  sendText: () => sendText,
  setQQBotRuntime: () => setQQBotRuntime,
  shouldUseStreaming: () => shouldUseStreaming,
  tryGetBotForAccount: () => tryGetBotForAccount
});
module.exports = __toCommonJS(index_exports);
var import_core2 = require("openclaw/plugin-sdk/core");

// src/channel.ts
var import_core = require("openclaw/plugin-sdk/core");
init_config();

// src/bot-instance.ts
var import_node_os4 = __toESM(require("os"), 1);

// src/outbound/outbound-service.ts
var path21 = __toESM(require("path"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/QQBot.js
var fs3 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/types.js
function resolvePolicy(ctx, path22, explicit, defaultValue) {
  if (explicit !== void 0 && explicit !== null) {
    return explicit;
  }
  const keys = path22.split(".");
  let value = ctx.state.policy;
  for (const key of keys) {
    if (value === null || value === void 0)
      break;
    value = value[key];
  }
  if (value !== void 0 && value !== null) {
    return value;
  }
  return defaultValue;
}
async function runMiddlewareChain(middlewares, ctx) {
  let index = -1;
  const dispatch = async (i) => {
    if (i <= index) {
      throw new Error("next() called multiple times");
    }
    index = i;
    if (ctx.stopped) {
      return;
    }
    if (i >= middlewares.length) {
      return;
    }
    const fn = middlewares[i];
    if (!fn) {
      return;
    }
    await fn(ctx, () => dispatch(i + 1));
  };
  await dispatch(0);
  return !ctx.stopped;
}
function createMiddlewareContext(params) {
  const receivedAt = Date.now();
  let stopped = false;
  let stopReason;
  const ac = new AbortController();
  const ctx = {
    bot: params.bot,
    message: params.message,
    replyTarget: params.message.replyTarget,
    state: {},
    log: params.log,
    stop(reason) {
      stopped = true;
      stopReason = reason;
    },
    get stopped() {
      return stopped;
    },
    get stopReason() {
      return stopReason;
    },
    get signal() {
      return ac.signal;
    },
    abort(reason) {
      ac.abort(reason);
      stopped = true;
      stopReason = reason ?? "aborted";
    },
    get aborted() {
      return ac.signal.aborted;
    },
    receivedAt
  };
  return ctx;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/types.js
var ApiError = class extends Error {
  httpStatus;
  path;
  bizCode;
  bizMessage;
  name = "ApiError";
  constructor(message, httpStatus, path22, bizCode, bizMessage) {
    super(message);
    this.httpStatus = httpStatus;
    this.path = path22;
    this.bizCode = bizCode;
    this.bizMessage = bizMessage;
  }
};
var MediaFileType;
(function(MediaFileType2) {
  MediaFileType2[MediaFileType2["IMAGE"] = 1] = "IMAGE";
  MediaFileType2[MediaFileType2["VIDEO"] = 2] = "VIDEO";
  MediaFileType2[MediaFileType2["VOICE"] = 3] = "VOICE";
  MediaFileType2[MediaFileType2["FILE"] = 4] = "FILE";
})(MediaFileType || (MediaFileType = {}));
var StreamInputMode = {
  REPLACE: "replace"
};
var StreamInputState = {
  GENERATING: 1,
  DONE: 10
};
var StreamContentType = {
  MARKDOWN: "markdown"
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/format.js
function formatErrorMessage(err) {
  if (err instanceof Error) {
    let formatted = err.message || err.name || "Error";
    let cause = err.cause;
    const seen = /* @__PURE__ */ new Set([err]);
    while (cause && !seen.has(cause)) {
      seen.add(cause);
      if (cause instanceof Error) {
        if (cause.message) {
          formatted += ` | ${cause.message}`;
        }
        cause = cause.cause;
      } else if (typeof cause === "string") {
        formatted += ` | ${cause}`;
        break;
      } else {
        break;
      }
    }
    return formatted;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err === null || err === void 0 || typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return Object.prototype.toString.call(err);
  }
}
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/api-client.js
var DEFAULT_BASE_URL = "https://api.sgroup.qq.com";
var DEFAULT_TIMEOUT_MS = 3e4;
var FILE_UPLOAD_TIMEOUT_MS = 12e4;
var ApiClient = class {
  baseUrl;
  defaultTimeoutMs;
  fileUploadTimeoutMs;
  logger;
  resolveUserAgent;
  constructor(config = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fileUploadTimeoutMs = config.fileUploadTimeoutMs ?? FILE_UPLOAD_TIMEOUT_MS;
    this.logger = config.logger;
    const ua = config.userAgent ?? "qqbot-nodejs/unknown";
    this.resolveUserAgent = typeof ua === "function" ? ua : () => ua;
  }
  async request(accessToken, method, path22, body, options) {
    /* QQ-REQUEST-TIMING-PATCH v1: selected group's message POST only; never logs token/body. */
    const __qqTimed = process.env.OPENCLAW_QQ_REQUEST_TIMING !== "0" && method === "POST" && __qqDualScopeMessagePath(path22) !== null;
    const __qqStarted = Date.now();
    let __qqFetchAt = 0;
    let __qqHeadersAt = 0;
    const __qqRequestTraceId = require("node:crypto").createHash("sha256").update(String(body?.msg_id ?? "proactive")).digest("hex").slice(0, 16);
    const __qqTimeLog = (phase, extra = "") => { if (__qqTimed) try { this.logger?.info?.(`[qq-request-timing] id=${__qqRequestTraceId} phase=${phase} elapsedMs=${Date.now()-__qqStarted} ${extra}`); } catch {} };

    const url = `${this.baseUrl}${path22}`;
    const headers = {
      Authorization: `QQBot ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": this.resolveUserAgent()
    };
    const isFileUpload = options?.uploadRequest === true || path22.includes("/files") || path22.includes("/upload_prepare") || path22.includes("/upload_part_finish");
    const timeout = options?.timeoutMs ?? (isFileUpload ? this.fileUploadTimeoutMs : this.defaultTimeoutMs);
    const controller = new AbortController();
    const requestSignals = [options?.signal, __qqDeadlineSendScope.getStore()?.signal].filter(Boolean);
    if (requestSignals.some((signal) => signal.aborted)) throw Object.assign(new Error("QQ request cancelled before HTTP dispatch"), { name: "AbortError", code: "QQ_REQUEST_ABORTED", sendState: "not-sent" });
    const requestSignal = requestSignals.length > 1 ? AbortSignal.any(requestSignals) : requestSignals[0];
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const fetchInit = { method, headers, signal: requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal };
    const __qqMessagePost = method === "POST" && /\/messages(?:\/stream)?$/.test(String(path22));
    if (body) {
      fetchInit.body = JSON.stringify(body);
    }
    this.logger?.debug?.(`[qqbot:api] >>> ${method} ${url} (timeout: ${timeout}ms)`);
    if (body && this.logger?.debug) {
      const logBody = { ...body };
      for (const key of options?.redactBodyKeys ?? ["file_data"]) {
        if (typeof logBody[key] === "string") {
          logBody[key] = `<redacted ${logBody[key].length} chars>`;
        }
      }
      this.logger.debug(`[qqbot:api] >>> Body: ${JSON.stringify(logBody)}`);
    }
    let res;
    try {
      __qqFetchAt = Date.now();
      __qqTimeLog("fetch-start");
      res = await fetch(url, fetchInit);
      __qqHeadersAt = Date.now();
      __qqTimeLog("headers", `fetchMs=${__qqHeadersAt-__qqFetchAt} status=${res.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (requestSignal?.aborted) throw Object.assign(new Error("QQ HTTP request cancelled while awaiting ACK"), { name: "AbortError", code: "QQ_REQUEST_ABORTED", sendState: __qqMessagePost ? "uncertain" : undefined });
      if (err instanceof Error && err.name === "AbortError") {
        this.logger?.error?.(`[qqbot:api] <<< Timeout after ${timeout}ms`);
        throw Object.assign(new ApiError(`Request timeout [${path22}]: exceeded ${timeout}ms`, 0, path22), __qqMessagePost ? { sendState: "uncertain" } : {});
      }
      this.logger?.error?.(`[qqbot:api] <<< Network error: ${formatErrorMessage(err)}`);
      throw Object.assign(new ApiError(`Network error [${path22}]: ${formatErrorMessage(err)}`, 0, path22), __qqMessagePost ? { sendState: "uncertain" } : {});
    }
    const traceId = res.headers.get("x-tps-trace-id") ?? "";
    this.logger?.info?.(`[qqbot:api] <<< Status: ${res.status} ${res.statusText}${traceId ? ` | TraceId: ${traceId}` : ""}`);
    let rawBody;
    try {
      rawBody = await res.text();
      __qqTimeLog("body", `bodyMs=${Date.now()-__qqHeadersAt}`);
    } catch (err) {
      const error = requestSignal?.aborted ? Object.assign(new Error("QQ response cancelled while awaiting ACK body"), { name: "AbortError", code: "QQ_REQUEST_ABORTED" }) : new ApiError(`Failed to read response [${path22}]: ${formatErrorMessage(err)}`, res.status, path22);
      if (__qqMessagePost) error.sendState = "uncertain";
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    this.logger?.debug?.(`[qqbot:api] <<< Body: ${rawBody}`);
    const contentType = res.headers.get("content-type") ?? "";
    const isHtmlResponse = contentType.includes("text/html") || rawBody.trimStart().startsWith("<");
    if (!res.ok) {
      if (isHtmlResponse) {
        const statusHint = res.status === 502 || res.status === 503 || res.status === 504 ? "\u8C03\u7528\u53D1\u751F\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u5019\u91CD\u8BD5" : res.status === 429 ? "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u5DF2\u88AB\u9650\u6D41" : `\u5F00\u653E\u5E73\u53F0\u8FD4\u56DE HTTP ${res.status}`;
        throw new ApiError(`${statusHint}\uFF08${path22}\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`, res.status, path22);
      }
      try {
        const error = JSON.parse(rawBody);
        const bizCode = error.code ?? error.err_code;
        throw new ApiError(`API Error [${path22}]: ${error.message ?? rawBody}`, res.status, path22, bizCode, error.message);
      } catch (parseErr) {
        if (parseErr instanceof ApiError) {
          throw parseErr;
        }
        throw new ApiError(`API Error [${path22}] HTTP ${res.status}: ${rawBody.slice(0, 200)}`, res.status, path22);
      }
    }
    if (isHtmlResponse) {
      throw new ApiError(`QQ \u670D\u52A1\u7AEF\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94\uFF08${path22}\uFF09\uFF0C\u53EF\u80FD\u662F\u4E34\u65F6\u6545\u969C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`, res.status, path22);
    }
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new ApiError(`\u5F00\u653E\u5E73\u53F0\u54CD\u5E94\u683C\u5F0F\u5F02\u5E38\uFF08${path22}\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`, res.status, path22);
    }
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/media-chunked.js
var crypto = __toESM(require("crypto"), 1);
var fs = __toESM(require("fs"), 1);
var https = __toESM(require("https"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/retry.js
async function withRetry(fn, policy, persistentPolicy, logger) {
  // Never replay a platform message whose ACK may have been lost.
  const abortSignal = __qqDeadlineSendScope.getStore()?.signal;
  const original = fn;
  fn = async (...args) => {
    if (abortSignal?.aborted) throw Object.assign(new Error("QQ request cancelled before retry"), { name: "AbortError", code: "QQ_REQUEST_ABORTED" });
    return await original(...args);
  };
  let lastError = null;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (abortSignal?.aborted || err?.name === "AbortError" || err?.sendState === "uncertain") throw err;
      lastError = err instanceof Error ? err : new Error(formatErrorMessage(err));
      if (persistentPolicy?.shouldPersistRetry(lastError)) {
        (logger?.warn ?? logger?.error)?.(`[qqbot:retry] Hit persistent-retry trigger, entering persistent loop (timeout=${persistentPolicy.timeoutMs / 1e3}s)`);
        return await persistentRetryLoop(fn, persistentPolicy, logger);
      }
      if (policy.shouldRetry?.(lastError, attempt) === false) {
        throw lastError;
      }
      if (attempt < policy.maxRetries) {
        const delay = policy.backoff === "exponential" ? policy.baseDelayMs * 2 ** attempt : policy.baseDelayMs;
        logger?.debug?.(`[qqbot:retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message.slice(0, 100)}`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
async function persistentRetryLoop(fn, policy, logger) {
  const deadline = Date.now() + policy.timeoutMs;
  let attempt = 0;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      logger?.debug?.(`[qqbot:retry] Persistent retry succeeded after ${attempt} retries`);
      return result;
    } catch (err) {
      if (__qqDeadlineSendScope.getStore()?.signal?.aborted || err?.name === "AbortError" || err?.sendState === "uncertain") throw err;
      lastError = err instanceof Error ? err : new Error(formatErrorMessage(err));
      if (!policy.shouldPersistRetry(lastError)) {
        logger?.error?.(`[qqbot:retry] Persistent retry: error is no longer retryable, aborting`);
        throw lastError;
      }
      attempt++;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }
      const actualDelay = Math.min(policy.intervalMs, remaining);
      (logger?.warn ?? logger?.error)?.(`[qqbot:retry] Persistent retry #${attempt}: retrying in ${actualDelay}ms (remaining=${Math.round(remaining / 1e3)}s)`);
      await sleep(actualDelay);
    }
  }
  logger?.error?.(`[qqbot:retry] Persistent retry timed out after ${policy.timeoutMs / 1e3}s (${attempt} attempts)`);
  throw lastError ?? new Error(`Persistent retry timed out (${policy.timeoutMs / 1e3}s)`);
}
function sleep(ms) {
  const signal = __qqDeadlineSendScope.getStore()?.signal;
  if (!signal) return new Promise((resolve2) => setTimeout(resolve2, ms));
  return new Promise((resolve2, reject) => {
    let timer;
    const cleanup = () => { if (timer) clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
    const onAbort = () => { cleanup(); reject(Object.assign(new Error("QQ retry wait cancelled"), { name: "AbortError", code: "QQ_REQUEST_ABORTED" })); };
    if (signal.aborted) { onAbort(); return; }
    timer = setTimeout(() => { cleanup(); resolve2(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
var UPLOAD_RETRY_POLICY = {
  maxRetries: 2,
  baseDelayMs: 1e3,
  backoff: "exponential",
  shouldRetry: (error) => {
    const msg = error.message;
    return !(msg.includes("400") || msg.includes("401") || msg.includes("Invalid") || msg.includes("timeout") || msg.includes("Timeout"));
  }
};
var COMPLETE_UPLOAD_RETRY_POLICY = {
  maxRetries: 2,
  baseDelayMs: 2e3,
  backoff: "exponential"
};
var PART_FINISH_RETRY_POLICY = {
  maxRetries: 2,
  baseDelayMs: 1e3,
  backoff: "exponential"
};
function buildPartFinishPersistentPolicy(retryTimeoutMs, retryableCodes = PART_FINISH_RETRYABLE_CODES) {
  return {
    timeoutMs: retryTimeoutMs ?? 2 * 60 * 1e3,
    intervalMs: 1e3,
    shouldPersistRetry: (error) => {
      if (retryableCodes.size === 0) {
        return false;
      }
      if ("bizCode" in error && typeof error.bizCode === "number") {
        return retryableCodes.has(error.bizCode);
      }
      return false;
    }
  };
}
var PART_FINISH_RETRYABLE_CODES = /* @__PURE__ */ new Set([40093001]);
var UPLOAD_PREPARE_FALLBACK_CODE = 40093002;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/routes.js
function messagePath(scope, targetId) {
  return scope === "c2c" ? `/v2/users/${targetId}/messages` : `/v2/groups/${targetId}/messages`;
}
function channelMessagePath(channelId) {
  return `/channels/${channelId}/messages`;
}
function dmMessagePath(guildId) {
  return `/dms/${guildId}/messages`;
}
function mediaUploadPath(scope, targetId) {
  return scope === "c2c" ? `/v2/users/${targetId}/files` : `/v2/groups/${targetId}/files`;
}
function uploadPreparePath(scope, targetId) {
  return scope === "c2c" ? `/v2/users/${targetId}/upload_prepare` : `/v2/groups/${targetId}/upload_prepare`;
}
function uploadPartFinishPath(scope, targetId) {
  return scope === "c2c" ? `/v2/users/${targetId}/upload_part_finish` : `/v2/groups/${targetId}/upload_part_finish`;
}
function uploadCompletePath(scope, targetId) {
  return mediaUploadPath(scope, targetId);
}
function streamMessagePath(openid) {
  return `/v2/users/${openid}/stream_messages`;
}
function gatewayPath() {
  return "/gateway";
}
function interactionPath(interactionId) {
  return `/interactions/${interactionId}`;
}
function getNextMsgSeq(_msgId) {
  const timePart = Date.now() % 1e8;
  const random = Math.floor(Math.random() * 65536);
  return (timePart ^ random) % 65536;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/media-chunked.js
var UploadDailyLimitExceededError = class extends Error {
  filePath;
  fileSize;
  name = "UploadDailyLimitExceededError";
  constructor(filePath, fileSize, originalMessage) {
    super(originalMessage);
    this.filePath = filePath;
    this.fileSize = fileSize;
  }
};
var DEFAULT_CONCURRENT_PARTS = 1;
var MAX_CONCURRENT_PARTS = 10;
var MAX_PART_FINISH_RETRY_TIMEOUT_MS = 10 * 60 * 1e3;
var PART_UPLOAD_TIMEOUT_MS = 3e5;
var MD5_10M_SIZE = 10002432;
var ChunkedMediaApi = class {
  client;
  tokenManager;
  logger;
  cache;
  sanitize;
  constructor(client, tokenManager, config = {}) {
    this.client = client;
    this.tokenManager = tokenManager;
    this.logger = config.logger;
    this.cache = config.uploadCache;
    this.sanitize = config.sanitizeFileName ?? ((n) => n);
  }
  async uploadChunked(opts) {
    const prefix = opts.logPrefix ?? "[qqbot:chunked-upload]";
    const input = resolveSource(opts.source, opts.fileName);
    const displayName = input.fileName;
    const fileSize = input.size;
    const pathLabel = input.kind === "localPath" ? input.path : "<buffer>";
    this.logger?.info?.(`${prefix} Start: file=${displayName} size=${formatFileSize(fileSize)} type=${opts.fileType}`);
    const hashes = await computeHashes(input);
    this.logger?.debug?.(`${prefix} hashes: md5=${hashes.md5} sha1=${hashes.sha1} md5_10m=${hashes.md5_10m}`);
    const fileNameForPrepare = opts.fileType === MediaFileType.FILE ? this.sanitize(displayName) : displayName;
    const cacheHash = this.cache ? __qqFileNameCacheHash(hashes.md5, opts.fileType, fileNameForPrepare) : hashes.md5;
    if (this.cache) {
      const cached = this.cache.get(cacheHash, opts.scope, opts.targetId, opts.fileType);
      if (cached) {
        this.logger?.info?.(`${prefix} cache HIT (md5=${hashes.md5.slice(0, 8)}) \u2014 skipping chunked upload`);
        return { file_uuid: "", file_info: cached, ttl: 0 };
      }
    }
    const prepareResp = await this.callUploadPrepare(opts, fileNameForPrepare, fileSize, hashes, pathLabel);
    const { upload_id, parts } = prepareResp;
    const block_size = prepareResp.block_size;
    const maxConcurrent = Math.min(prepareResp.concurrency ? prepareResp.concurrency : DEFAULT_CONCURRENT_PARTS, MAX_CONCURRENT_PARTS);
    const retryTimeoutMs = prepareResp.retry_timeout ? Math.min(prepareResp.retry_timeout * 1e3, MAX_PART_FINISH_RETRY_TIMEOUT_MS) : void 0;
    this.logger?.info?.(`${prefix} prepared: upload_id=${upload_id} block=${formatFileSize(block_size)} parts=${parts.length} concurrency=${maxConcurrent}`);
    let completedParts = 0;
    let uploadedBytes = 0;
    const uploadPart = async (part) => {
      const partIndex = part.index;
      const offset = (partIndex - 1) * block_size;
      const length = Math.min(block_size, fileSize - offset);
      const partBuffer = await readPart(input, offset, length);
      const md5Hex = crypto.createHash("md5").update(partBuffer).digest("hex");
      this.logger?.debug?.(`${prefix} part ${partIndex}/${parts.length}: ${formatFileSize(length)} offset=${offset} md5=${md5Hex}`);
      await putToPresignedUrl(part.presigned_url, partBuffer, partIndex, parts.length, this.logger, prefix);
      await this.callUploadPartFinish(opts, upload_id, partIndex, length, md5Hex, retryTimeoutMs);
      completedParts++;
      uploadedBytes += length;
      this.logger?.info?.(`${prefix} part ${partIndex}/${parts.length} done (${completedParts}/${parts.length})`);
      opts.onProgress?.({
        completedParts,
        totalParts: parts.length,
        uploadedBytes,
        totalBytes: fileSize
      });
    };
    await runWithConcurrency(parts.map((part) => () => uploadPart(part)), maxConcurrent);
    this.logger?.info?.(`${prefix} all parts uploaded, completing...`);
    const result = await this.callCompleteUpload(opts, upload_id);
    this.logger?.info?.(`${prefix} completed: file_uuid=${result.file_uuid} ttl=${result.ttl}s`);
    if (this.cache && result.file_info && result.ttl > 0) {
      this.cache.set(cacheHash, opts.scope, opts.targetId, opts.fileType, result.file_info, result.file_uuid, result.ttl);
    }
    return result;
  }
  async callUploadPrepare(opts, fileName, fileSize, hashes, pathLabel) {
    const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
    const path22 = uploadPreparePath(opts.scope, opts.targetId);
    try {
      return await this.client.request(token, "POST", path22, {
        file_type: opts.fileType,
        file_name: fileName,
        file_size: fileSize,
        md5: hashes.md5,
        sha1: hashes.sha1,
        md5_10m: hashes.md5_10m
      }, { uploadRequest: true });
    } catch (err) {
      if (err instanceof ApiError && err.bizCode === UPLOAD_PREPARE_FALLBACK_CODE) {
        throw new UploadDailyLimitExceededError(pathLabel, fileSize, err.message);
      }
      throw err;
    }
  }
  async callUploadPartFinish(opts, uploadId, partIndex, blockSize, md5, retryTimeoutMs) {
    const persistentPolicy = buildPartFinishPersistentPolicy(retryTimeoutMs);
    const path22 = uploadPartFinishPath(opts.scope, opts.targetId);
    await withRetry(async () => {
      const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
      return this.client.request(token, "POST", path22, {
        upload_id: uploadId,
        part_index: partIndex,
        block_size: blockSize,
        md5
      }, { uploadRequest: true });
    }, PART_FINISH_RETRY_POLICY, persistentPolicy, this.logger);
  }
  async callCompleteUpload(opts, uploadId) {
    const path22 = uploadCompletePath(opts.scope, opts.targetId);
    return withRetry(async () => {
      const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
      return this.client.request(token, "POST", path22, { upload_id: uploadId }, { uploadRequest: true });
    }, COMPLETE_UPLOAD_RETRY_POLICY, void 0, this.logger);
  }
};
function resolveSource(source, fileNameOverride) {
  if (source.kind === "localPath") {
    const inferredName = source.path.split(/[/\\]/).pop() || "file";
    return {
      kind: "localPath",
      path: source.path,
      size: source.size,
      fileName: fileNameOverride ?? inferredName
    };
  }
  return {
    kind: "buffer",
    buffer: source.buffer,
    size: source.buffer.length,
    fileName: fileNameOverride ?? source.fileName ?? "file"
  };
}
async function readPart(input, offset, length) {
  if (input.kind === "buffer") {
    return input.buffer.subarray(offset, offset + length);
  }
  const handle = await fs.promises.open(input.path, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, offset);
    return bytesRead < length ? buf.subarray(0, bytesRead) : buf;
  } finally {
    await handle.close();
  }
}
async function computeHashes(input) {
  if (input.kind === "buffer") {
    const md5 = crypto.createHash("md5").update(input.buffer).digest("hex");
    const sha1 = crypto.createHash("sha1").update(input.buffer).digest("hex");
    const md5_10m = input.size > MD5_10M_SIZE ? crypto.createHash("md5").update(input.buffer.subarray(0, MD5_10M_SIZE)).digest("hex") : md5;
    return { md5, sha1, md5_10m };
  }
  return new Promise((resolve2, reject) => {
    const md5 = crypto.createHash("md5");
    const sha1 = crypto.createHash("sha1");
    const md5_10m = crypto.createHash("md5");
    let consumed = 0;
    const needsMd5_10m = input.size > MD5_10M_SIZE;
    const stream = fs.createReadStream(input.path);
    stream.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      md5.update(buf);
      sha1.update(buf);
      if (needsMd5_10m) {
        const remaining = MD5_10M_SIZE - consumed;
        if (remaining > 0) {
          md5_10m.update(remaining >= buf.length ? buf : buf.subarray(0, remaining));
        }
      }
      consumed += buf.length;
    });
    stream.on("end", () => {
      const md5Hex = md5.digest("hex");
      const sha1Hex = sha1.digest("hex");
      resolve2({
        md5: md5Hex,
        sha1: sha1Hex,
        md5_10m: needsMd5_10m ? md5_10m.digest("hex") : md5Hex
      });
    });
    stream.on("error", reject);
  });
}
var PART_UPLOAD_MAX_RETRIES = 2;
function putToCOS(presignedUrl, data, signal) {
  const scopedSignal = __qqDeadlineSendScope.getStore()?.signal;
  if (scopedSignal && signal) signal = AbortSignal.any([scopedSignal, signal]);
  else if (scopedSignal) signal = scopedSignal;
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("QQ media upload cancelled before PUT"), { name: "AbortError" }));
  return new Promise((resolve2, reject) => {
    const parsed = new URL(presignedUrl);
    const req4 = https.request(parsed, {
      method: "PUT",
      headers: { "Content-Length": String(data.length) },
      signal
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const etag = (res.headers.etag ?? "").replace(/"/g, "");
        const requestId = res.headers["x-cos-request-id"]?.toString() ?? "-";
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve2({ status: res.statusCode, etag, requestId });
        } else {
          reject(new Error(`COS PUT failed: ${res.statusCode} ${res.statusMessage ?? ""} - ${Buffer.concat(chunks).toString().slice(0, 120)}`));
        }
      });
      res.on("error", reject);
    });
    req4.on("error", (err) => {
      reject(err);
    });
    req4.end(data);
  });
}
async function putToPresignedUrl(presignedUrl, data, partIndex, totalParts, logger, prefix) {
  let lastError = null;
  for (let attempt = 0; attempt <= PART_UPLOAD_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PART_UPLOAD_TIMEOUT_MS);
    try {
      const startTime = Date.now();
      const { etag, requestId } = await putToCOS(presignedUrl, data, controller.signal);
      const elapsed = Date.now() - startTime;
      logger?.debug?.(`${prefix} PUT part ${partIndex}/${totalParts} OK (${elapsed}ms ETag=${etag} requestId=${requestId})`);
      return;
    } catch (err) {
      if (__qqDeadlineSendScope.getStore()?.signal?.aborted) throw Object.assign(new Error("QQ media upload cancelled"), { name: "AbortError", code: "QQ_REQUEST_ABORTED" });
      lastError = err instanceof Error ? err : new Error(String(err));
      const code = err.code ?? "none";
      const causeMsg = (() => {
        const c = err instanceof Error ? err.cause : void 0;
        return c instanceof Error ? c.message : "none";
      })();
      if (lastError.name === "AbortError") {
        lastError = new Error(`Part ${partIndex}/${totalParts} upload timeout after ${PART_UPLOAD_TIMEOUT_MS}ms`);
      }
      if (attempt < PART_UPLOAD_MAX_RETRIES) {
        const delay = 1e3 * 2 ** attempt;
        (logger?.warn ?? logger?.error)?.(`${prefix} PUT part ${partIndex}/${totalParts} attempt ${attempt + 1} failed (${lastError.message.slice(0, 120)} code=${code} cause=${causeMsg}), retrying in ${delay}ms`);
        await sleep2(delay);
      } else {
        logger?.error?.(`${prefix} PUT part ${partIndex}/${totalParts} all retries exhausted (code=${code} cause=${causeMsg})`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError ?? new Error(`Part ${partIndex}/${totalParts} upload failed`);
}
async function runWithConcurrency(tasks, maxConcurrent) {
  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    const batch = tasks.slice(i, i + maxConcurrent);
    await Promise.all(batch.map((task) => task()));
  }
}
function sleep2(ms) {
  return sleep(ms);
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/media.js
var fs2 = __toESM(require("fs"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/file-utils.js
var MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
var CHUNKED_UPLOAD_MAX_SIZE = 100 * 1024 * 1024;
var LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;
var MEDIA_FILE_TYPE_INFO = {
  [MediaFileType.IMAGE]: { maxSize: 30 * 1024 * 1024, name: "image" },
  [MediaFileType.VIDEO]: { maxSize: 100 * 1024 * 1024, name: "video" },
  [MediaFileType.VOICE]: { maxSize: 20 * 1024 * 1024, name: "voice" },
  [MediaFileType.FILE]: { maxSize: 100 * 1024 * 1024, name: "file" }
};
function sanitizeFileName(name) {
  if (!name) {
    return "file";
  }
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "file";
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/media.js
var MAX_BASE64_CHECK_SIZE = Math.ceil(MAX_UPLOAD_SIZE * 1.4);
function formatUploadSize() {
  return formatFileSize(MAX_UPLOAD_SIZE);
}
var MediaApi = class {
  client;
  tokenManager;
  logger;
  cache;
  sanitize;
  constructor(client, tokenManager, config = {}) {
    this.client = client;
    this.tokenManager = tokenManager;
    this.logger = config.logger;
    this.cache = config.uploadCache;
    this.sanitize = config.sanitizeFileName ?? ((n) => n);
  }
  /**
   * Upload media via base64, URL, buffer, or local file path to a C2C or Group target.
   */
  async uploadMedia(scope, targetId, fileType, creds, opts) {
    const sources = [opts.url, opts.fileData, opts.buffer, opts.localPath].filter((v) => v !== void 0);
    if (sources.length === 0) {
      throw new Error(`uploadMedia: one of url/fileData/buffer/localPath is required`);
    }
    if (sources.length > 1) {
      throw new Error(`uploadMedia: url/fileData/buffer/localPath are mutually exclusive (got ${sources.length})`);
    }
    let fileData = opts.fileData;
    if (opts.buffer) {
      fileData = opts.buffer.toString("base64");
    } else if (opts.localPath) {
      const buf = await fs2.promises.readFile(opts.localPath);
      fileData = buf.toString("base64");
    }
    if (fileData && fileData.length > MAX_BASE64_CHECK_SIZE) {
      const sizeMB = (fileData.length / (1024 * 1024)).toFixed(1);
      throw new Error(`fileData too large (${sizeMB}MB decoded); QQ Bot single upload limit is ${formatUploadSize()}`);
    }
    const fileNameForUpload = fileType === MediaFileType.FILE && opts.fileName ? this.sanitize(opts.fileName) : void 0;
    if (fileData && this.cache) {
      const hash = __qqFileNameCacheHash(this.cache.computeHash(fileData), fileType, fileNameForUpload);
      const cached = this.cache.get(hash, scope, targetId, fileType);
      if (cached) {
        return { file_uuid: "", file_info: cached, ttl: 0, __qqCacheHit: { hash, scope, targetId, fileType } };
      }
    }
    const body = {
      file_type: fileType,
      srv_send_msg: opts.srvSendMsg ?? false
    };
    if (opts.url) {
      body.url = opts.url;
    } else if (fileData) {
      body.file_data = fileData;
    }
    if (fileNameForUpload !== void 0) {
      body.file_name = fileNameForUpload;
    }
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const path22 = mediaUploadPath(scope, targetId);
    const result = await withRetry(() => this.client.request(token, "POST", path22, body, {
      redactBodyKeys: ["file_data"],
      uploadRequest: true
    }), UPLOAD_RETRY_POLICY, void 0, this.logger);
    if (fileData && result.file_info && typeof result.ttl === "number" && result.ttl >= 0 && this.cache) {
      const hash = __qqFileNameCacheHash(this.cache.computeHash(fileData), fileType, fileNameForUpload);
      this.cache.set(hash, scope, targetId, fileType, result.file_info, result.file_uuid, result.ttl);
    }
    return result;
  }
  /**
   * Send a media message (post upload) to a C2C or Group target.
   */
  async sendMediaMessage(scope, targetId, fileInfo, creds, opts) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const msgSeq = opts?.msgId ? getNextMsgSeq(opts.msgId) : 1;
    const path22 = messagePath(scope, targetId);
    return this.client.request(token, "POST", path22, {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_seq: msgSeq,
      ...opts?.content ? { content: opts.content } : {},
      ...opts?.msgId ? { msg_id: opts.msgId } : {}
    });
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/messages.js
var MessageApi = class {
  client;
  tokenManager;
  markdownSupport;
  logger;
  messageSentHook = null;
  constructor(client, tokenManager, config) {
    this.client = client;
    this.tokenManager = tokenManager;
    this.markdownSupport = config.markdownSupport;
    this.logger = config.logger;
  }
  onMessageSent(callback) {
    this.messageSentHook = callback;
  }
  notifyMessageSent(refIdx, meta) {
    if (this.messageSentHook) {
      try {
        this.messageSentHook(refIdx, meta);
      } catch (err) {
        this.logger?.error?.(`[qqbot:messages] onMessageSent hook error: ${formatErrorMessage(err)}`);
      }
    }
  }
  async sendMessage(scope, targetId, content, creds, opts) {
    const __qqTokenAt = Date.now();
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    if (process.env.OPENCLAW_QQ_REQUEST_TIMING !== "0" && scope === "group" && __qqDualScopeGroup(targetId) !== null) try { this.logger?.info?.(`[qq-token-timing] id=${opts?.msgId ?? "unknown"} tokenMs=${Date.now()-__qqTokenAt}`); } catch {}
    const msgSeq = opts?.msgId ? getNextMsgSeq(opts.msgId) : 1;
    const body = this.buildMessageBody(content, opts?.msgId, msgSeq, opts?.messageReference, opts?.inlineKeyboard);
    const path22 = messagePath(scope, targetId);
    return this.sendAndNotify(creds.appId, token, "POST", path22, body, { text: content });
  }
  async sendProactiveMessage(scope, targetId, content, creds) {
    if (!content?.trim()) {
      throw new Error("Proactive message content must not be empty");
    }
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const body = this.buildProactiveBody(content);
    const path22 = messagePath(scope, targetId);
    return this.sendAndNotify(creds.appId, token, "POST", path22, body, { text: content });
  }
  async sendChannelMessage(opts) {
    const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
    return this.client.request(token, "POST", channelMessagePath(opts.channelId), {
      content: opts.content,
      ...opts.msgId ? { msg_id: opts.msgId } : {}
    });
  }
  async sendDmMessage(opts) {
    const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
    return this.client.request(token, "POST", dmMessagePath(opts.guildId), {
      content: opts.content,
      ...opts.msgId ? { msg_id: opts.msgId } : {}
    });
  }
  /** Send a typing indicator to a C2C user. */
  async sendInputNotify(opts) {
    const inputSecond = opts.inputSecond ?? 60;
    const token = await this.tokenManager.getAccessToken(opts.creds.appId, opts.creds.clientSecret);
    const msgSeq = opts.msgId ? getNextMsgSeq(opts.msgId) : 1;
    const response = await this.client.request(token, "POST", messagePath("c2c", opts.openid), {
      msg_type: 6,
      input_notify: { input_type: 1, input_second: inputSecond },
      msg_seq: msgSeq,
      ...opts.msgId ? { msg_id: opts.msgId } : {}
    });
    return { refIdx: response.ext_info?.ref_idx };
  }
  async acknowledgeInteraction(interactionId, creds, code = 0, data) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const body = { code };
    if (data)
      body.data = data;
    await this.client.request(token, "PUT", interactionPath(interactionId), body);
  }
  /** Get the WebSocket gateway URL for the bot. */
  async getGatewayUrl(creds) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const data = await this.client.request(token, "GET", gatewayPath());
    return data.url;
  }
  /**
   * Send a C2C stream message chunk (`/v2/users/{openid}/stream_messages`).
   * Only supported for one-to-one chats.
   */
  async sendC2CStreamMessage(creds, openid, req4) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const path22 = streamMessagePath(openid);
    const body = {
      input_mode: req4.input_mode,
      input_state: req4.input_state,
      content_type: req4.content_type,
      content_raw: req4.content_raw,
      event_id: req4.event_id,
      msg_id: req4.msg_id,
      msg_seq: req4.msg_seq,
      index: req4.index
    };
    if (req4.stream_msg_id) {
      body.stream_msg_id = req4.stream_msg_id;
    }
    return this.client.request(token, "POST", path22, body);
  }
  /**
   * Raw message send — transparently forwards all fields to the QQ Open Platform API.
   *
   * This is the "escape hatch" for any message type not covered by the
   * higher-level helpers. Fields like `msg_type`, `markdown`, `ark`, `embed`,
   * `keyboard`, `media`, `message_reference`, `is_wakeup` etc. are passed through
   * as-is to `/v2/users/{openid}/messages` or `/v2/groups/{group_openid}/messages`.
   *
   * Auto-injects `msg_seq` if not provided.
   */
  async sendRaw(scope, targetId, creds, body) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const path22 = messagePath(scope, targetId);
    if (body.msg_seq === void 0) {
      body.msg_seq = body.msg_id ? getNextMsgSeq(body.msg_id) : 1;
    }
    if (body.msg_type === void 0) {
      if (body.markdown)
        body.msg_type = 2;
      else if (body.ark)
        body.msg_type = 3;
      else if (body.embed)
        body.msg_type = 4;
      else if (body.media)
        body.msg_type = 7;
      else
        body.msg_type = 0;
    }
    const cleaned = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== void 0));
    return this.sendAndNotify(creds.appId, token, "POST", path22, cleaned, { text: cleaned.content ?? cleaned.markdown?.content });
  }
  /**
   * Send a message to a guild text channel.
   * Supports content, keyboard, message_reference, and arbitrary extra fields.
   */
  async sendChannelMessageRaw(channelId, creds, body) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const cleaned = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== void 0));
    return this.client.request(token, "POST", channelMessagePath(channelId), cleaned);
  }
  /**
   * Send a DM (direct message) in a guild.
   */
  async sendDmMessageRaw(guildId, creds, body) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const cleaned = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== void 0));
    return this.client.request(token, "POST", dmMessagePath(guildId), cleaned);
  }
  /**
   * Recall (delete) a message.
   */
  async recallMessage(scope, targetId, messageId, creds) {
    const token = await this.tokenManager.getAccessToken(creds.appId, creds.clientSecret);
    const path22 = `${messagePath(scope, targetId)}/${messageId}`;
    await this.client.request(token, "DELETE", path22);
  }
  async sendAndNotify(_appId, accessToken, method, path22, body, meta) {
    const result = await this.client.request(accessToken, method, path22, body);
    if (result.ext_info?.ref_idx && this.messageSentHook) {
      try {
        this.messageSentHook(result.ext_info.ref_idx, meta);
      } catch (err) {
        this.logger?.error?.(`[qqbot:messages] onMessageSent hook error: ${formatErrorMessage(err)}`);
      }
    }
    return result;
  }
  buildMessageBody(content, msgId, msgSeq, messageReference, inlineKeyboard) {
    const body = this.markdownSupport ? { markdown: { content }, msg_type: 2, msg_seq: msgSeq } : { content, msg_type: 0, msg_seq: msgSeq };
    if (msgId) {
      body.msg_id = msgId;
    }
    if (messageReference && !this.markdownSupport) {
      body.message_reference = { message_id: messageReference };
    }
    if (inlineKeyboard) {
      body.keyboard = inlineKeyboard;
    }
    return body;
  }
  buildProactiveBody(content) {
    return this.markdownSupport ? { markdown: { content }, msg_type: 2 } : { content, msg_type: 0 };
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/api/token.js
var DEFAULT_TOKEN_BASE_URL = "https://bots.qq.com";
var TOKEN_PATH = "/app/getAppAccessToken";
var DEFAULT_TOKEN_TIMEOUT_MS = 1e4;
var FIVE_MINUTES_MS = 5 * 60 * 1e3;
var TokenManager = class {
  cache = /* @__PURE__ */ new Map();
  fetchPromises = /* @__PURE__ */ new Map();
  refreshControllers = /* @__PURE__ */ new Map();
  logger;
  resolveUserAgent;
  baseUrl;
  constructor(config) {
    this.logger = config?.logger;
    const ua = config?.userAgent ?? "qqbot-nodejs/unknown";
    this.resolveUserAgent = typeof ua === "function" ? ua : () => ua;
    this.baseUrl = config?.baseUrl ?? DEFAULT_TOKEN_BASE_URL;
  }
  async getAccessToken(appId, clientSecret) {
    const normalizedId = appId.trim();
    const cached = this.cache.get(normalizedId);
    const refreshAheadMs = cached ? Math.min(FIVE_MINUTES_MS, (cached.expiresAt - Date.now()) / 3) : 0;
    if (cached && Date.now() < cached.expiresAt - refreshAheadMs) {
      return cached.token;
    }
    let pending = this.fetchPromises.get(normalizedId);
    if (pending) {
      this.logger?.debug?.(`[qqbot:token:${normalizedId}] Fetch in progress, reusing promise`);
      return pending;
    }
    pending = (async () => {
      try {
        return await this.doFetchToken(normalizedId, clientSecret);
      } finally {
        this.fetchPromises.delete(normalizedId);
      }
    })();
    this.fetchPromises.set(normalizedId, pending);
    return pending;
  }
  clearCache(appId) {
    if (appId) {
      this.cache.delete(appId.trim());
      this.logger?.debug?.(`[qqbot:token:${appId}] Cache cleared`);
    } else {
      this.cache.clear();
      this.logger?.debug?.(`[token] All caches cleared`);
    }
  }
  getStatus(appId) {
    if (this.fetchPromises.has(appId)) {
      return { status: "refreshing", expiresAt: this.cache.get(appId)?.expiresAt ?? null };
    }
    const cached = this.cache.get(appId);
    if (!cached) {
      return { status: "none", expiresAt: null };
    }
    const remaining = cached.expiresAt - Date.now();
    const isValid = remaining > Math.min(FIVE_MINUTES_MS, remaining / 3);
    return { status: isValid ? "valid" : "expired", expiresAt: cached.expiresAt };
  }
  startBackgroundRefresh(appId, clientSecret, options) {
    if (this.refreshControllers.has(appId)) {
      this.logger?.info?.(`[qqbot:token:${appId}] Background refresh already running`);
      return;
    }
    const { refreshAheadMs = 5 * 60 * 1e3, randomOffsetMs = 30 * 1e3, minRefreshIntervalMs = 60 * 1e3, retryDelayMs = 5 * 1e3 } = options ?? {};
    const controller = new AbortController();
    this.refreshControllers.set(appId, controller);
    const { signal } = controller;
    const loop = async () => {
      this.logger?.info?.(`[qqbot:token:${appId}] Background refresh started`);
      while (!signal.aborted) {
        try {
          await this.getAccessToken(appId, clientSecret);
          const cached = this.cache.get(appId);
          if (cached) {
            const expiresIn = cached.expiresAt - Date.now();
            const randomOffset = Math.random() * randomOffsetMs;
            const refreshIn = Math.max(expiresIn - refreshAheadMs - randomOffset, minRefreshIntervalMs);
            this.logger?.debug?.(`[qqbot:token:${appId}] Next refresh in ${Math.round(refreshIn / 1e3)}s`);
            await this.abortableSleep(refreshIn, signal);
          } else {
            await this.abortableSleep(minRefreshIntervalMs, signal);
          }
        } catch (err) {
          if (signal.aborted) {
            break;
          }
          this.logger?.error?.(`[qqbot:token:${appId}] Background refresh failed: ${formatErrorMessage(err)}`);
          await this.abortableSleep(retryDelayMs, signal);
        }
      }
      this.refreshControllers.delete(appId);
      this.logger?.info?.(`[qqbot:token:${appId}] Background refresh stopped`);
    };
    loop().catch((err) => {
      if (this.refreshControllers.has(appId)) {
        this.refreshControllers.delete(appId);
        this.logger?.error?.(`[qqbot:token:${appId}] Background refresh crashed: ${formatErrorMessage(err)}`);
      }
    });
  }
  stopBackgroundRefresh(appId) {
    if (appId) {
      const ctrl = this.refreshControllers.get(appId);
      if (ctrl) {
        ctrl.abort();
        this.refreshControllers.delete(appId);
      }
    } else {
      for (const ctrl of this.refreshControllers.values()) {
        ctrl.abort();
      }
      this.refreshControllers.clear();
    }
  }
  isBackgroundRefreshRunning(appId) {
    if (appId) {
      return this.refreshControllers.has(appId);
    }
    return this.refreshControllers.size > 0;
  }
  async doFetchToken(appId, clientSecret) {
    const url = `${this.baseUrl}${TOKEN_PATH}`;
    this.logger?.debug?.(`[qqbot:token:${appId}] >>> POST ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TOKEN_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": this.resolveUserAgent()
        },
        body: JSON.stringify({ appId, clientSecret }),
        signal: controller.signal
      });
    } catch (err) {
      this.logger?.error?.(`[qqbot:token:${appId}] Network error: ${formatErrorMessage(err)}`);
      throw new Error(`Network error getting access_token: ${formatErrorMessage(err)}`, {
        cause: err
      });
    } finally {
      clearTimeout(timeout);
    }
    const traceId = response.headers.get("x-tps-trace-id") ?? "";
    this.logger?.debug?.(`[qqbot:token:${appId}] <<< ${response.status}${traceId ? ` | TraceId: ${traceId}` : ""}`);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Token fetch failed: HTTP ${response.status}${errorBody ? ` \u2014 ${errorBody.slice(0, 200)}` : ""}`);
    }
    let data;
    try {
      const rawBody = await response.text();
      const logBody = rawBody.replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token": "***"');
      this.logger?.debug?.(`[qqbot:token:${appId}] <<< Body: ${logBody}`);
      data = JSON.parse(rawBody);
    } catch (err) {
      throw new Error(`Failed to parse access_token response: ${formatErrorMessage(err)}`, {
        cause: err
      });
    }
    if (!data.access_token) {
      throw new Error(`Failed to get access_token: ${JSON.stringify(data)}`);
    }
    const expiresAt = Date.now() + (data.expires_in ?? 7200) * 1e3;
    this.cache.set(appId, { token: data.access_token, expiresAt, appId });
    this.logger?.debug?.(`[qqbot:token:${appId}] Cached, expires at: ${new Date(expiresAt).toISOString()}`);
    return data.access_token;
  }
  abortableSleep(ms, signal) {
    return new Promise((resolve2, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve2();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
};

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/gateway/codec.js
function decodeGatewayMessageData(data) {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data) && data.every((chunk) => Buffer.isBuffer(chunk))) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return "";
}
function readOptionalMessageSceneExt(event) {
  if (!("message_scene" in event)) {
    return void 0;
  }
  const scene = event.message_scene;
  return scene?.ext;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/gateway/constants.js
var INTENTS = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  PUBLIC_GUILD_MESSAGES: 1 << 30,
  DIRECT_MESSAGE: 1 << 12,
  GROUP_AND_C2C: 1 << 25,
  /** Button interaction callbacks (INTERACTION_CREATE). */
  INTERACTION: 1 << 26
};
var FULL_INTENTS = INTENTS.GUILDS | INTENTS.GUILD_MEMBERS | INTENTS.PUBLIC_GUILD_MESSAGES | INTENTS.DIRECT_MESSAGE | INTENTS.GROUP_AND_C2C | INTENTS.INTERACTION;
var RECONNECT_DELAYS = [1e3, 2e3, 5e3, 1e4, 3e4, 6e4];
var RATE_LIMIT_DELAY = 6e4;
var MAX_RECONNECT_ATTEMPTS = 100;
var MAX_QUICK_DISCONNECT_COUNT = 3;
var QUICK_DISCONNECT_THRESHOLD = 5e3;
var GatewayOp = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11
};
var GatewayCloseCode = {
  NORMAL: 1e3,
  AUTH_FAILED: 4004,
  INVALID_SESSION: 4006,
  SEQ_OUT_OF_RANGE: 4007,
  RATE_LIMITED: 4008,
  SESSION_TIMEOUT: 4009,
  SERVER_ERROR_START: 4900,
  SERVER_ERROR_END: 4913,
  INSUFFICIENT_INTENTS: 4914,
  DISALLOWED_INTENTS: 4915
};
var GatewayEvent = {
  READY: "READY",
  RESUMED: "RESUMED",
  // ── Message events ──
  C2C_MESSAGE_CREATE: "C2C_MESSAGE_CREATE",
  AT_MESSAGE_CREATE: "AT_MESSAGE_CREATE",
  DIRECT_MESSAGE_CREATE: "DIRECT_MESSAGE_CREATE",
  GROUP_AT_MESSAGE_CREATE: "GROUP_AT_MESSAGE_CREATE",
  GROUP_MESSAGE_CREATE: "GROUP_MESSAGE_CREATE",
  // ── Interaction ──
  INTERACTION_CREATE: "INTERACTION_CREATE",
  // ── Guild events (P1) ──
  GUILD_CREATE: "GUILD_CREATE",
  GUILD_UPDATE: "GUILD_UPDATE",
  GUILD_DELETE: "GUILD_DELETE",
  GUILD_MEMBER_ADD: "GUILD_MEMBER_ADD",
  GUILD_MEMBER_UPDATE: "GUILD_MEMBER_UPDATE",
  GUILD_MEMBER_REMOVE: "GUILD_MEMBER_REMOVE",
  CHANNEL_CREATE: "CHANNEL_CREATE",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  CHANNEL_DELETE: "CHANNEL_DELETE",
  // ── Group/C2C lifecycle events (P1) ──
  GROUP_ADD_ROBOT: "GROUP_ADD_ROBOT",
  GROUP_DEL_ROBOT: "GROUP_DEL_ROBOT",
  GROUP_MSG_REJECT: "GROUP_MSG_REJECT",
  GROUP_MSG_RECEIVE: "GROUP_MSG_RECEIVE",
  FRIEND_ADD: "FRIEND_ADD",
  FRIEND_DEL: "FRIEND_DEL",
  C2C_MSG_REJECT: "C2C_MSG_REJECT",
  C2C_MSG_RECEIVE: "C2C_MSG_RECEIVE",
  // ── Reaction events ──
  MESSAGE_REACTION_ADD: "MESSAGE_REACTION_ADD",
  MESSAGE_REACTION_REMOVE: "MESSAGE_REACTION_REMOVE"
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/gateway/event-dispatcher.js
var REF_INDEX_KEY = "msg_idx";
function parseRefIndices(ext, msgType, msgElements) {
  let refMsgIdx;
  let msgIdx;
  if (Array.isArray(ext)) {
    for (const entry of ext) {
      if (typeof entry !== "string") {
        continue;
      }
      const eq = entry.indexOf("=");
      if (eq < 0) {
        continue;
      }
      const key = entry.slice(0, eq).trim();
      const val = entry.slice(eq + 1).trim();
      if (!val) {
        continue;
      }
      if (key === REF_INDEX_KEY) {
        msgIdx = val;
      } else if (key === "ref_msg_idx") {
        refMsgIdx = val;
      }
    }
  }
  if (msgType === 103 && Array.isArray(msgElements)) {
    for (const el of msgElements) {
      if (el?.msg_idx) {
        refMsgIdx = el.msg_idx;
        break;
      }
    }
  }
  return { refMsgIdx, msgIdx };
}
function dispatchEvent(eventType, data, _accountId, _log) {
  if (eventType === GatewayEvent.READY) {
    const d3 = data;
    return { action: "ready", data, sessionId: d3.session_id };
  }
  if (eventType === GatewayEvent.RESUMED) {
    return { action: "resumed", data };
  }
  if (eventType === GatewayEvent.C2C_MESSAGE_CREATE) {
    const ev = data;
    const refs = parseRefIndices(ev.message_scene?.ext, ev.message_type, ev.msg_elements);
    return {
      action: "message",
      msg: {
        rawEventType: eventType,
        kind: "c2c",
        senderId: ev.author.user_openid,
        content: ev.content,
        messageId: ev.id,
        timestamp: ev.timestamp,
        attachments: ev.attachments,
        refMsgIdx: refs.refMsgIdx,
        msgIdx: refs.msgIdx,
        msgType: ev.message_type,
        messageScene: ev.message_scene,
        msgElements: ev.msg_elements,
        raw: ev
      }
    };
  }
  if (eventType === GatewayEvent.AT_MESSAGE_CREATE) {
    const ev = data;
    const refs = parseRefIndices(readOptionalMessageSceneExt(ev));
    return {
      action: "message",
      msg: {
        rawEventType: eventType,
        kind: "guild",
        senderId: ev.author.id,
        senderName: ev.author.username,
        content: ev.content,
        messageId: ev.id,
        timestamp: ev.timestamp,
        channelId: ev.channel_id,
        guildId: ev.guild_id,
        attachments: ev.attachments,
        refMsgIdx: refs.refMsgIdx,
        msgIdx: refs.msgIdx,
        raw: ev
      }
    };
  }
  if (eventType === GatewayEvent.DIRECT_MESSAGE_CREATE) {
    const ev = data;
    const refs = parseRefIndices(readOptionalMessageSceneExt(ev));
    return {
      action: "message",
      msg: {
        rawEventType: eventType,
        kind: "dm",
        senderId: ev.author.id,
        senderName: ev.author.username,
        content: ev.content,
        messageId: ev.id,
        timestamp: ev.timestamp,
        guildId: ev.guild_id,
        attachments: ev.attachments,
        refMsgIdx: refs.refMsgIdx,
        msgIdx: refs.msgIdx,
        raw: ev
      }
    };
  }
  if (eventType === GatewayEvent.GROUP_AT_MESSAGE_CREATE || eventType === GatewayEvent.GROUP_MESSAGE_CREATE) {
    const ev = data;
    const refs = parseRefIndices(ev.message_scene?.ext, ev.message_type, ev.msg_elements);
    return {
      action: "message",
      msg: {
        rawEventType: eventType,
        kind: "group",
        senderId: ev.author.member_openid,
        senderName: ev.author.username,
        senderIsBot: ev.author.bot,
        content: ev.content,
        messageId: ev.id,
        timestamp: ev.timestamp,
        groupOpenid: ev.group_openid,
        attachments: ev.attachments,
        refMsgIdx: refs.refMsgIdx,
        msgIdx: refs.msgIdx,
        msgType: ev.message_type,
        mentions: ev.mentions,
        messageScene: ev.message_scene,
        msgElements: ev.msg_elements,
        raw: ev
      }
    };
  }
  if (eventType === GatewayEvent.INTERACTION_CREATE) {
    return { action: "interaction", event: data };
  }
  return { action: "raw", type: eventType, data };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/gateway/reconnect.js
var ReconnectState = class {
  accountId;
  log;
  attempts = 0;
  lastConnectTime = 0;
  quickDisconnectCount = 0;
  constructor(accountId, log4) {
    this.accountId = accountId;
    this.log = log4;
  }
  onConnected() {
    this.attempts = 0;
    this.lastConnectTime = Date.now();
  }
  isExhausted() {
    return this.attempts >= MAX_RECONNECT_ATTEMPTS;
  }
  getNextDelay(customDelay) {
    const delay = customDelay ?? RECONNECT_DELAYS[Math.min(this.attempts, RECONNECT_DELAYS.length - 1)];
    this.attempts++;
    this.log?.debug?.(`[${this.accountId}] Reconnecting in ${delay}ms (attempt ${this.attempts})`);
    return delay;
  }
  handleClose(code, isAborted) {
    if (code === GatewayCloseCode.INSUFFICIENT_INTENTS || code === GatewayCloseCode.DISALLOWED_INTENTS) {
      const reason = code === GatewayCloseCode.INSUFFICIENT_INTENTS ? "offline/sandbox-only" : "banned";
      this.log?.error(`[${this.accountId}] Bot is ${reason}. Please contact QQ platform.`);
      return {
        shouldReconnect: false,
        clearSession: false,
        refreshToken: false,
        fatal: true,
        reason
      };
    }
    if (code === GatewayCloseCode.AUTH_FAILED) {
      this.log?.info(`[${this.accountId}] Invalid token (4004), will refresh token and reconnect`);
      return {
        shouldReconnect: !isAborted,
        clearSession: false,
        refreshToken: true,
        fatal: false,
        reason: "invalid token (4004)"
      };
    }
    if (code === GatewayCloseCode.RATE_LIMITED) {
      this.log?.info(`[${this.accountId}] Rate limited (4008), waiting ${RATE_LIMIT_DELAY}ms`);
      return {
        shouldReconnect: !isAborted,
        reconnectDelay: RATE_LIMIT_DELAY,
        clearSession: false,
        refreshToken: false,
        fatal: false,
        reason: "rate limited (4008)"
      };
    }
    if (code === GatewayCloseCode.INVALID_SESSION || code === GatewayCloseCode.SEQ_OUT_OF_RANGE || code === GatewayCloseCode.SESSION_TIMEOUT) {
      const codeDesc = {
        [GatewayCloseCode.INVALID_SESSION]: "session no longer valid",
        [GatewayCloseCode.SEQ_OUT_OF_RANGE]: "invalid seq on resume",
        [GatewayCloseCode.SESSION_TIMEOUT]: "session timed out"
      };
      this.log?.info(`[${this.accountId}] Error ${code} (${codeDesc[code]}), will re-identify`);
      return {
        shouldReconnect: !isAborted,
        clearSession: true,
        refreshToken: true,
        fatal: false,
        reason: codeDesc[code]
      };
    }
    if (code >= GatewayCloseCode.SERVER_ERROR_START && code <= GatewayCloseCode.SERVER_ERROR_END) {
      this.log?.info(`[${this.accountId}] Internal error (${code}), will re-identify`);
      return {
        shouldReconnect: !isAborted && code !== GatewayCloseCode.NORMAL,
        clearSession: true,
        refreshToken: true,
        fatal: false,
        reason: `internal error (${code})`
      };
    }
    const connectionDuration = Date.now() - this.lastConnectTime;
    if (connectionDuration < QUICK_DISCONNECT_THRESHOLD && this.lastConnectTime > 0) {
      this.quickDisconnectCount++;
      this.log?.debug?.(`[${this.accountId}] Quick disconnect detected (${connectionDuration}ms), count: ${this.quickDisconnectCount}`);
      if (this.quickDisconnectCount >= MAX_QUICK_DISCONNECT_COUNT) {
        this.log?.error(`[${this.accountId}] Too many quick disconnects. This may indicate a permission issue.`);
        this.quickDisconnectCount = 0;
        return {
          shouldReconnect: !isAborted && code !== 1e3,
          reconnectDelay: RATE_LIMIT_DELAY,
          clearSession: false,
          refreshToken: false,
          fatal: false,
          reason: "too many quick disconnects"
        };
      }
    } else {
      this.quickDisconnectCount = 0;
    }
    return {
      shouldReconnect: !isAborted && code !== GatewayCloseCode.NORMAL,
      clearSession: false,
      refreshToken: false,
      fatal: false,
      reason: `close code ${code}`
    };
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/gateway/gateway-connection.js
var GatewayConnection = class {
  isAborted = false;
  currentWs = null;
  heartbeatInterval = null;
  sessionId = null;
  lastSeq = null;
  isConnecting = false;
  reconnectTimer = null;
  shouldRefreshToken = false;
  reconnect;
  opts;
  resolveUserAgent;
  constructor(opts) {
    this.opts = opts;
    this.reconnect = new ReconnectState(opts.account.accountId, opts.log);
    const ua = opts.userAgent ?? "qqbot-nodejs/unknown";
    this.resolveUserAgent = typeof ua === "function" ? ua : () => ua;
  }
  /** Start the connection loop. Resolves when abortSignal fires. */
  async start() {
    this.restoreSession();
    this.registerAbortHandler();
    await this.connect();
    return new Promise((resolve2) => {
      this.opts.abortSignal.addEventListener("abort", () => resolve2());
    });
  }
  // ============ Session persistence ============
  restoreSession() {
    const saved = this.opts.session?.load();
    if (saved) {
      this.sessionId = saved.sessionId;
      this.lastSeq = saved.lastSeq;
      this.opts.log?.info?.(`[${this.opts.account.accountId}] Restored session: sessionId=${saved.sessionId}, lastSeq=${saved.lastSeq}`);
    }
  }
  saveCurrentSession() {
    if (!this.sessionId || !this.opts.session) {
      return;
    }
    this.opts.session.save({
      sessionId: this.sessionId,
      lastSeq: this.lastSeq
    });
  }
  // ============ Abort + cleanup ============
  registerAbortHandler() {
    this.opts.abortSignal.addEventListener("abort", () => {
      this.isAborted = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.cleanup();
    });
  }
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.currentWs && (this.currentWs.readyState === wrapper_default.OPEN || this.currentWs.readyState === wrapper_default.CONNECTING)) {
      this.currentWs.close();
    }
    this.currentWs = null;
  }
  // ============ Reconnect ============
  scheduleReconnect(customDelay) {
    if (this.isAborted || this.reconnect.isExhausted()) {
      this.opts.log?.error(`[${this.opts.account.accountId}] Max reconnect attempts reached or aborted`);
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const delay = this.reconnect.getNextDelay(customDelay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isAborted) {
        void this.connect();
      }
    }, delay);
  }
  // ============ Connect ============
  async connect() {
    const { log: log4, account } = this.opts;
    if (this.isConnecting) {
      log4?.debug?.(`[${account.accountId}] Already connecting, skip`);
      return;
    }
    this.isConnecting = true;
    try {
      this.cleanup();
      if (this.shouldRefreshToken) {
        log4?.debug?.(`[${account.accountId}] Refreshing token...`);
        this.opts.clearTokenCache?.();
        this.shouldRefreshToken = false;
      }
      const accessToken = await this.opts.getAccessToken();
      log4?.info(`[${account.accountId}] \u2705 Access token obtained`);
      const gatewayUrlSpan = qqStartupBegin(this, "gateway-url");
      let gatewayUrl;
      try {
        gatewayUrl = await this.opts.getGatewayUrl(accessToken);
      } catch (error) {
        qqStartupEnd(gatewayUrlSpan, "error");
        throw error;
      }
      qqStartupEnd(gatewayUrlSpan, "ok");
      log4?.info(`[${account.accountId}] Connecting to ${gatewayUrl}`);
      const ws = new wrapper_default(gatewayUrl, {
        headers: { "User-Agent": this.resolveUserAgent() }
      });
      this.currentWs = ws;
      ws.on("open", () => {
        log4?.info(`[${account.accountId}] WebSocket connected`);
        this.isConnecting = false;
        this.reconnect.onConnected();
      });
      ws.on("message", async (data) => {
        try {
          const rawData = decodeGatewayMessageData(data);
          const payload = JSON.parse(rawData);
          const { op, d: d3, s, t } = payload;
          if (s) {
            this.lastSeq = s;
            this.saveCurrentSession();
          }
          switch (op) {
            case GatewayOp.HELLO:
              this.handleHello(ws, d3, accessToken);
              break;
            case GatewayOp.DISPATCH: {
              log4?.debug?.(`[${account.accountId}] Dispatch event: t=${t} payload=${previewPayload(d3)}`);
              const result = dispatchEvent(t ?? "", d3, account.accountId, log4);
              if (result.action === "ready") {
                this.sessionId = result.sessionId;
                this.saveCurrentSession();
                this.opts.onReady?.(result.data);
              } else if (result.action === "resumed") {
                (this.opts.onResumed ?? this.opts.onReady)?.(result.data);
                this.saveCurrentSession();
              } else if (result.action === "interaction") {
                if (this.opts.onInteraction) {
                  void Promise.resolve(this.opts.onInteraction(result.event));
                } else if (this.opts.onRawEvent) {
                  void Promise.resolve(this.opts.onRawEvent(payload.t, payload.d));
                }
              } else if (result.action === "message") {
                void Promise.resolve(this.opts.onMessage(result.msg));
              } else if (result.action === "raw") {
                if (this.opts.onRawEvent) {
                  void Promise.resolve(this.opts.onRawEvent(result.type, result.data));
                }
              }
              break;
            }
            case GatewayOp.HEARTBEAT_ACK:
              break;
            case GatewayOp.RECONNECT:
              this.cleanup();
              this.scheduleReconnect();
              break;
            case GatewayOp.INVALID_SESSION: {
              const canResume = d3;
              if (!canResume) {
                this.sessionId = null;
                this.lastSeq = null;
                this.opts.session?.clear();
                this.shouldRefreshToken = true;
              }
              this.cleanup();
              this.scheduleReconnect(3e3);
              break;
            }
          }
        } catch (err) {
          log4?.error(`[${account.accountId}] Message parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      ws.on("close", (code, reason) => {
        log4?.info(`[${account.accountId}] WebSocket closed: ${code} ${reason.toString()}`);
        this.isConnecting = false;
        this.handleClose(code);
      });
      ws.on("error", (err) => {
        log4?.error(`[${account.accountId}] WebSocket error: ${err.message}`);
        this.opts.onError?.(err);
      });
    } catch (err) {
      this.isConnecting = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      log4?.error(`[${account.accountId}] Connection failed: ${errMsg}`);
      if (errMsg.includes("Too many requests") || errMsg.includes("100001")) {
        this.scheduleReconnect(RATE_LIMIT_DELAY);
      } else {
        this.scheduleReconnect();
      }
    }
  }
  // ============ Protocol handlers ============
  handleHello(ws, d3, accessToken) {
    const intents = this.opts.intents ?? FULL_INTENTS;
    if (this.sessionId && this.lastSeq !== null) {
      ws.send(JSON.stringify({
        op: GatewayOp.RESUME,
        d: {
          token: `QQBot ${accessToken}`,
          session_id: this.sessionId,
          seq: this.lastSeq
        }
      }));
    } else {
      ws.send(JSON.stringify({
        op: GatewayOp.IDENTIFY,
        d: {
          token: `QQBot ${accessToken}`,
          intents,
          shard: [0, 1]
        }
      }));
    }
    const interval = d3.heartbeat_interval;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState === wrapper_default.OPEN) {
        ws.send(JSON.stringify({ op: GatewayOp.HEARTBEAT, d: this.lastSeq }));
      }
    }, interval);
  }
  handleClose(code) {
    const action = this.reconnect.handleClose(code, this.isAborted);
    if (action.clearSession) {
      this.sessionId = null;
      this.lastSeq = null;
      this.opts.session?.clear();
    }
    if (action.refreshToken) {
      this.shouldRefreshToken = true;
    }
    this.cleanup();
    if (action.fatal) {
      return;
    }
    if (action.shouldReconnect) {
      this.scheduleReconnect(action.reconnectDelay);
    }
  }
};
function previewPayload(data) {
  if (data === void 0)
    return "undefined";
  if (data === null)
    return "null";
  try {
    const s = JSON.stringify(data);
    return s === void 0 ? "(non-serializable)" : s;
  } catch {
    return "(non-serializable)";
  }
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/transport/webhook-verify.js
var crypto2 = __toESM(require("crypto"), 1);
function deriveSeed(botSecret) {
  let seed = botSecret;
  while (seed.length < 32) {
    seed = seed + seed;
  }
  return Buffer.from(seed.slice(0, 32), "utf-8");
}
function getKeyPair(botSecret) {
  const seed = deriveSeed(botSecret);
  const privateKey = crypto2.createPrivateKey({
    key: Buffer.concat([
      // Ed25519 PKCS8 DER prefix for 32-byte seed
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed
    ]),
    format: "der",
    type: "pkcs8"
  });
  const publicKey = crypto2.createPublicKey(privateKey);
  return { privateKey, publicKey };
}
function ed25519Sign(botSecret, message) {
  const { privateKey } = getKeyPair(botSecret);
  const signature = crypto2.sign(null, message, privateKey);
  return signature.toString("hex");
}
function verifyWebhookSignature(params) {
  const { body, timestamp, signature, botSecret } = params;
  try {
    const { publicKey } = getKeyPair(botSecret);
    const message = Buffer.concat([
      Buffer.from(timestamp, "utf-8"),
      body
    ]);
    const sigBuffer = Buffer.from(signature, "hex");
    return crypto2.verify(null, message, publicKey, sigBuffer);
  } catch {
    return false;
  }
}
function signValidationResponse(params) {
  const { plainToken, eventTs, botSecret } = params;
  const message = Buffer.from(eventTs + plainToken, "utf-8");
  const signature = ed25519Sign(botSecret, message);
  return {
    plain_token: plainToken,
    signature
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/transport/webhook-server-node.js
var http = __toESM(require("http"), 1);
var NodeHttpWebhookServer = class {
  server = null;
  async listen(port, path22, handler) {
    return new Promise((resolve2, reject) => {
      const server = http.createServer(async (req4, res) => {
        if (req4.method !== "POST" || req4.url !== path22) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }
        const chunks = [];
        req4.on("data", (chunk) => chunks.push(chunk));
        req4.on("end", async () => {
          try {
            const body = Buffer.concat(chunks);
            const headers = {};
            for (const [key, value] of Object.entries(req4.headers)) {
              headers[key.toLowerCase()] = value;
            }
            const response = await handler({ body, headers });
            res.writeHead(response.status, {
              "Content-Type": "application/json",
              ...response.headers ?? {}
            });
            res.end(response.body);
          } catch (_err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
          }
        });
      });
      server.on("error", reject);
      server.listen(port, () => {
        this.server = server;
        resolve2();
      });
    });
  }
  close() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/transport/webhook.js
var OP_DISPATCH = 0;
var OP_HTTP_CALLBACK_ACK = 12;
var OP_VALIDATION = 13;
var WebhookTransport = class {
  opts;
  callbacks;
  log;
  server;
  accountId;
  stopped = false;
  stopResolve = null;
  constructor(opts, callbacks) {
    this.opts = opts;
    this.callbacks = callbacks;
    this.log = opts.log;
    this.server = opts.server ?? new NodeHttpWebhookServer();
    this.accountId = opts.accountId ?? opts.appId;
  }
  async start() {
    const port = this.opts.port ?? 8080;
    const path22 = this.opts.path ?? "/";
    this.log?.info?.(`[webhook] starting on port ${port}, path ${path22}`);
    await this.server.listen(port, path22, (req4) => this.handleRequest(req4));
    this.log?.info?.(`[webhook] listening on :${port}${path22}`);
    this.callbacks.onReady?.({ transport: "webhook", port, path: path22 });
    if (this.opts.abortSignal) {
      await new Promise((resolve2) => {
        if (this.opts.abortSignal.aborted) {
          resolve2();
          return;
        }
        this.stopResolve = resolve2;
        this.opts.abortSignal.addEventListener("abort", () => this.stop(), { once: true });
      });
    } else {
      await new Promise((resolve2) => {
        this.stopResolve = resolve2;
      });
    }
  }
  stop() {
    if (this.stopped)
      return;
    this.stopped = true;
    this.server.close();
    this.log?.info?.(`[webhook] stopped`);
    this.stopResolve?.();
  }
  // ============ Request handler ============
  async handleRequest(req4) {
    let payload;
    try {
      payload = JSON.parse(req4.body.toString("utf-8"));
    } catch {
      this.log?.warn?.(`[webhook] invalid JSON body`);
      return { status: 400, body: JSON.stringify({ error: "invalid json" }) };
    }
    if (payload.op === OP_VALIDATION) {
      return this.handleValidation(payload);
    }
    const timestamp = getHeader(req4.headers, "x-signature-timestamp") ?? "";
    const signature = getHeader(req4.headers, "x-signature-ed25519") ?? "";
    if (!timestamp || !signature) {
      this.log?.warn?.(`[webhook] missing signature headers`);
      return { status: 401, body: JSON.stringify({ error: "missing signature" }) };
    }
    const valid = verifyWebhookSignature({
      body: req4.body,
      timestamp,
      signature,
      botSecret: this.opts.appSecret
    });
    if (!valid) {
      this.log?.warn?.(`[webhook] signature verification failed`);
      return { status: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }
    if (payload.op === OP_DISPATCH) {
      this.handleDispatch(payload).catch((err) => {
        this.log?.error?.(`[webhook] dispatch error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return {
      status: 200,
      body: JSON.stringify({ op: OP_HTTP_CALLBACK_ACK, d: 0 })
    };
  }
  // ============ Validation handler (op:13) ============
  handleValidation(payload) {
    const d3 = payload.d;
    if (!d3?.plain_token || !d3?.event_ts) {
      this.log?.warn?.(`[webhook] validation missing plain_token or event_ts`);
      return { status: 400, body: JSON.stringify({ error: "invalid validation" }) };
    }
    this.log?.info?.(`[webhook] handling callback URL validation`);
    const response = signValidationResponse({
      plainToken: d3.plain_token,
      eventTs: d3.event_ts,
      botSecret: this.opts.appSecret
    });
    return {
      status: 200,
      body: JSON.stringify(response)
    };
  }
  // ============ Dispatch handler (op:0) ============
  async handleDispatch(payload) {
    const eventType = payload.t ?? "";
    const data = payload.d;
    this.log?.debug?.(`[webhook] dispatch event: t=${eventType} payload=${JSON.stringify(data)}`);
    const result = dispatchEvent(eventType, data, this.accountId, this.log);
    switch (result.action) {
      case "ready":
        this.callbacks.onReady?.(result.data);
        break;
      case "resumed":
        this.callbacks.onResumed?.(result.data);
        break;
      case "message":
        try {
          await this.callbacks.onMessage(result.msg);
        } catch (err) {
          this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
        break;
      case "interaction":
        try {
          await this.callbacks.onInteraction?.(result.event);
        } catch (err) {
          this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
        break;
      case "ignore":
        break;
    }
  }
};
function getHeader(headers, key) {
  const val = headers[key];
  if (Array.isArray(val))
    return val[0];
  return val;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/upload-cache.js
var crypto3 = __toESM(require("crypto"), 1);
var MAX_CACHE_SIZE = 500;
function computeFileHash(data) {
  return crypto3.createHash("md5").update(data).digest("hex");
}
/* QQ-FILE-NAME-CACHE v1: FILE cache identity includes the sanitized wire filename.
   Names are hashed, old filename-less FILE entries are bypassed; other media
   keep their original content-only identity. No filename is added to cache logs. */
function __qqFileNameCacheHash(contentHash, fileType, wireFileName) {
  if (fileType !== MediaFileType.FILE) return contentHash;
  const nameHash = crypto3.createHash("sha256").update(JSON.stringify(["qq-file-name-cache-v1", wireFileName ?? null])).digest("hex");
  return `${contentHash}:filename-v1:${nameHash}`;
}
function buildCacheKey(contentHash, scope, targetId, fileType) {
  return `${contentHash}:${scope}:${targetId}:${fileType}`;
}
/* QQ-UPLOAD-CACHE-PATCH v1 (2026-10-06): file_info cache survives restarts
   (~/.openclaw/qqbot/upload-cache.json), ttl=0 ("long-lived" per QQ docs) is cached for 24h,
   HIT/SET logged at info, entries can be invalidated after a failed send (see sendMedia). */
var __qqUcFs = require("fs");
var __qqUcPath = require("path");
var __qqUcFile = __qqUcPath.join(process.env.OPENCLAW_STATE_DIR || __qqUcPath.join(process.env.HOME || require("os").homedir(), ".openclaw"), "qqbot", "upload-cache.json");
var __QQ_UC_LONG_TTL_S = 24 * 3600;
var UploadCache = class {
  cache = /* @__PURE__ */ new Map();
  logger;
  __saveTimer = null;
  constructor(options) {
    this.logger = options?.logger;
    try {
      const raw = JSON.parse(__qqUcFs.readFileSync(__qqUcFile, "utf8"));
      const now = Date.now();
      let n = 0;
      for (const [k, v] of Object.entries(raw?.entries || {})) {
        if (v && typeof v.fileInfo === "string" && Number(v.expiresAt) > now) { this.cache.set(k, { fileInfo: v.fileInfo, fileUuid: v.fileUuid || "", expiresAt: Number(v.expiresAt) }); n++; }
      }
      if (n) this.logger?.info?.(`[upload-cache] loaded ${n} entries from disk`);
    } catch { /* no file yet */ }
  }
  __scheduleSave() {
    if (this.__saveTimer) return;
    this.__saveTimer = setTimeout(() => {
      this.__saveTimer = null;
      try {
        const now = Date.now();
        const entries = {};
        for (const [k, v] of this.cache) if (v.expiresAt > now) entries[k] = v;
        __qqUcFs.mkdirSync(__qqUcPath.dirname(__qqUcFile), { recursive: true });
        const tmp = __qqUcFile + ".tmp";
        __qqUcFs.writeFileSync(tmp, JSON.stringify({ v: 1, savedAt: now, entries }), { mode: 384 });
        __qqUcFs.renameSync(tmp, __qqUcFile);
      } catch (e) { this.logger?.info?.(`[upload-cache] save failed: ${e?.message || e}`); }
    }, 2e3);
    this.__saveTimer.unref?.();
  }
  delete(contentHash, scope, targetId, fileType) {
    const key = buildCacheKey(contentHash, scope, targetId, fileType);
    if (this.cache.delete(key)) { this.logger?.info?.(`[upload-cache] DROP key=${key.slice(0, 40)}...`); this.__scheduleSave(); }
  }
  computeHash(data) {
    return computeFileHash(data);
  }
  get(contentHash, scope, targetId, fileType) {
    const key = buildCacheKey(contentHash, scope, targetId, fileType);
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.logger?.info?.(`[upload-cache] HIT key=${key.slice(0, 40)}... left=${Math.round((entry.expiresAt - Date.now()) / 1e3)}s`);
    return entry.fileInfo;
  }
  set(contentHash, scope, targetId, fileType, fileInfo, fileUuid, ttl) {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now >= v.expiresAt) {
          this.cache.delete(k);
        }
      }
      if (this.cache.size >= MAX_CACHE_SIZE) {
        const keys = Array.from(this.cache.keys());
        for (let i = 0; i < keys.length / 2; i++) {
          this.cache.delete(keys[i]);
        }
      }
    }
    const key = buildCacheKey(contentHash, scope, targetId, fileType);
    const safetyMargin = 60;
    const effectiveTtl = !(Number(ttl) > 0) ? __QQ_UC_LONG_TTL_S : Math.max(ttl - safetyMargin, 10);
    this.cache.set(key, {
      fileInfo,
      fileUuid,
      expiresAt: Date.now() + effectiveTtl * 1e3
    });
    this.logger?.info?.(`[upload-cache] SET key=${key.slice(0, 40)}... ttl=${effectiveTtl}s (api ttl=${ttl})`);
    this.__scheduleSave();
  }
  stats() {
    return { size: this.cache.size, maxSize: MAX_CACHE_SIZE };
  }
  clear() {
    this.cache.clear();
    this.logger?.debug?.(`[upload-cache] cleared`);
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/streaming.js
var DEFAULT_THROTTLE_MS = 500;
var MIN_THROTTLE_MS = 300;
var MAX_FLUSH_RETRIES = 3;
var RATE_LIMIT_BASE_DELAY_MS = 1e3;
var StreamSession = class {
  api;
  opts;
  throttleMs;
  eventId;
  streamMsgId;
  index = 0;
  /**
   * `msg_seq` for the current stream session. QQ open platform expects all
   * frames in one stream to share the same `msg_seq` (only `index` advances).
   */
  msgSeq = null;
  lastFlushAt = 0;
  lastSentText = "";
  pendingText = "";
  pendingTimer = null;
  flushInProgress = false;
  flushPromise = null;
  isCompleted = false;
  constructor(api, opts) {
    this.api = api;
    this.opts = opts;
    this.throttleMs = Math.max(opts.throttleMs ?? DEFAULT_THROTTLE_MS, MIN_THROTTLE_MS);
    this.eventId = opts.eventId ?? opts.msgId;
  }
  /**
   * Update the current full message text. Will be sent at most once per
   * throttle window.
   */
  async update(fullText) {
    if (this.isCompleted) {
      return;
    }
    this.pendingText = fullText;
    const now = Date.now();
    const elapsed = now - this.lastFlushAt;
    if (this.flushInProgress) {
      return;
    }
    if (elapsed >= this.throttleMs) {
      await this.flush(StreamInputState.GENERATING);
      return;
    }
    if (!this.pendingTimer) {
      const wait = this.throttleMs - elapsed;
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        if (!this.isCompleted) {
          this.flush(StreamInputState.GENERATING).catch((err) => {
            this.opts.logger?.error?.(`[qqbot:stream] throttle flush error: ${formatErrorMessage(err)}`);
          });
        }
      }, wait);
    }
  }
  /** Mark the stream as DONE. Sends a final frame with the latest text. */
  async complete() {
    if (this.isCompleted) {
      return void 0;
    }
    this.isCompleted = true;
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.flushPromise) {
      await this.flushPromise.catch(() => {
      });
    }
    return this.flush(StreamInputState.DONE);
  }
  /** Force-cancel without sending a DONE frame (caller must clean up). */
  cancel() {
    this.isCompleted = true;
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
  // ============ Internal ============
  async flush(state) {
    if (this.flushInProgress) {
      return void 0;
    }
    if (this.pendingText === this.lastSentText && state !== StreamInputState.DONE) {
      return void 0;
    }
    this.flushInProgress = true;
    const promise = this.doFlush(state);
    this.flushPromise = promise;
    return promise;
  }
  async doFlush(state) {
    let flushFailed = false;
    try {
      const text = this.pendingText;
      if (this.msgSeq === null) {
        this.msgSeq = getNextMsgSeq(this.opts.msgId);
      }
      const currentIndex = this.index++;
      const req4 = {
        input_mode: StreamInputMode.REPLACE,
        input_state: state,
        content_type: StreamContentType.MARKDOWN,
        content_raw: text,
        event_id: this.eventId,
        msg_id: this.opts.msgId,
        msg_seq: this.msgSeq,
        index: currentIndex
      };
      if (this.streamMsgId) {
        req4.stream_msg_id = this.streamMsgId;
      }
      const resp = await this.sendWithRetry(req4);
      if (resp?.id && !this.streamMsgId) {
        this.streamMsgId = resp.id;
      }
      this.lastSentText = text;
      this.lastFlushAt = Date.now();
      return resp;
    } catch (err) {
      flushFailed = true;
      this.opts.logger?.error?.(`[qqbot:stream] flush failed (state=${state}): ${formatErrorMessage(err)}`);
      throw err;
    } finally {
      this.flushInProgress = false;
      if (!flushFailed && !this.isCompleted && this.pendingText !== this.lastSentText && !this.pendingTimer && state !== StreamInputState.DONE) {
        await this.flush(StreamInputState.GENERATING);
      }
    }
  }
  /**
   * Send a stream message with exponential backoff on rate-limit errors.
   * QQ returns err_code 50002 or HTTP 429 when rate-limited.
   */
  async sendWithRetry(req4) {
    for (let attempt = 0; attempt <= MAX_FLUSH_RETRIES; attempt++) {
      if (this.opts.abortSignal?.aborted) throw Object.assign(new Error("QQ stream request cancelled before retry"), { name: "AbortError" });
      try {
        return await __qqWithRequestSignal(this.opts.abortSignal, () => this.api.sendC2CStreamMessage(this.opts.creds, this.opts.openid, req4));
      } catch (err) {
        if (!this.isRateLimitError(err) || attempt >= MAX_FLUSH_RETRIES) {
          throw err;
        }
        const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
        this.opts.logger?.debug?.(`[qqbot:stream] rate limited, retry ${attempt + 1}/${MAX_FLUSH_RETRIES} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        req4.index = this.index++;
      }
    }
    return void 0;
  }
  /** Check if an error is a rate-limit error (QQ err_code 50002 or HTTP 429). */
  isRateLimitError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("rate limit"))
      return true;
    const code = err?.code ?? err?.err_code;
    if (code === 50002 || code === 429)
      return true;
    return false;
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/QQBot.js
var MsgType = {
  /** Plain text. */
  TEXT: 0,
  /** Markdown. */
  MARKDOWN: 2,
  /** Ark template message. */
  ARK: 3,
  /** Embed message. */
  EMBED: 4,
  /** Rich media (image/video/voice/file). */
  MEDIA: 7
};
var noopLogger = {
  info: () => {
  },
  error: () => {
  },
  warn: () => {
  },
  debug: () => {
  }
};
var QQBot = class {
  // Public protocol primitives — exposed for advanced users.
  tokenManager;
  apiClient;
  messageApi;
  mediaApi;
  chunkedMediaApi;
  opts;
  logger;
  creds;
  account;
  userAgent;
  uploadCache;
  middlewares = [];
  handlers = {
    ready: /* @__PURE__ */ new Set(),
    resumed: /* @__PURE__ */ new Set(),
    error: /* @__PURE__ */ new Set(),
    message: /* @__PURE__ */ new Set(),
    interaction: /* @__PURE__ */ new Set(),
    rawEvent: /* @__PURE__ */ new Set()
  };
  gateway = null;
  abortController = null;
  _apiGateway = null;
  constructor(options) {
    if (!options.appId) {
      throw new Error("QQBot: appId is required");
    }
    if (!options.appSecret) {
      throw new Error("QQBot: appSecret is required");
    }
    this.opts = options;
    this.logger = options.logger ?? noopLogger;
    this.userAgent = options.userAgent ?? `qqbot-nodejs/0.1.0 (Node/${process.versions.node})`;
    this.creds = {
      appId: options.appId,
      clientSecret: options.appSecret
    };
    this.account = {
      accountId: options.accountId ?? options.appId,
      appId: options.appId,
      clientSecret: options.appSecret,
      markdownSupport: options.markdownSupport === true
    };
    this.uploadCache = options.uploadCache ?? new UploadCache({ logger: this.logger });
    this.apiClient = new ApiClient({
      logger: this.logger,
      userAgent: this.userAgent,
      baseUrl: options.baseUrl
    });
    this.tokenManager = new TokenManager({
      logger: this.logger,
      userAgent: this.userAgent,
      baseUrl: options.tokenBaseUrl
    });
    this.messageApi = new MessageApi(this.apiClient, this.tokenManager, {
      markdownSupport: options.markdownSupport === true,
      logger: this.logger
    });
    const cacheAdapter = {
      computeHash: (data) => this.uploadCache.computeHash(data),
      get: (hash, scope, targetId, fileType) => this.uploadCache.get(hash, scope, targetId, fileType),
      set: (hash, scope, targetId, fileType, fileInfo, fileUuid, ttl) => this.uploadCache.set(hash, scope, targetId, fileType, fileInfo, fileUuid, ttl),
      delete: (hash, scope, targetId, fileType) => this.uploadCache.delete?.(hash, scope, targetId, fileType)
    };
    this.mediaApi = new MediaApi(this.apiClient, this.tokenManager, {
      logger: this.logger,
      uploadCache: cacheAdapter,
      sanitizeFileName
    });
    this.chunkedMediaApi = new ChunkedMediaApi(this.apiClient, this.tokenManager, {
      logger: this.logger,
      uploadCache: cacheAdapter,
      sanitizeFileName
    });
  }
  // ============ Public getters ============
  /** The QQ Open Platform AppID this bot is bound to. */
  get appId() {
    return this.creds.appId;
  }
  /** The stable account id (defaults to appId). */
  get accountId() {
    return this.account.accountId;
  }
  // ============ Event listeners ============
  on(event, handler) {
    this.handlers[event].add(handler);
    return this;
  }
  off(event, handler) {
    this.handlers[event].delete(handler);
    return this;
  }
  // ============ Middleware ============
  /**
   * Register an inbound middleware. Middlewares run in registration order
   * before the `message` event listeners; calling `ctx.stop()` (or simply
   * not calling `next()`) short-circuits the chain — including the final
   * `message` listener.
   *
   * @example
   * ```ts
   * import { accessPolicy, mentionGate } from "@tencent-connect/qqbot-nodejs";
   * bot.use(accessPolicy({ group: { mode: "allowlist", allow: [...] } }));
   * bot.use(mentionGate());
   * bot.on("message", async (ctx, msg) => {  ... });
   * ```
   */
  use(...middleware) {
    for (const mw of middleware) {
      if (typeof mw !== "function") {
        throw new Error("QQBot.use: middleware must be a function");
      }
      this.middlewares.push(mw);
    }
    return this;
  }
  /** Read the registered middleware chain (for diagnostics). */
  getMiddlewares() {
    return this.middlewares;
  }
  async emit(event, ...args) {
    for (const handler of this.handlers[event]) {
      try {
        await Promise.resolve(handler(...args));
      } catch (err) {
        this.logger.error?.(`[qqbot] handler for "${String(event)}" threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  // ============ Lifecycle ============
  /**
   * Start receiving events from QQ Open Platform.
   *
   * - **WebSocket mode** (default): connects to the WS gateway with heartbeat/RESUME.
   * - **Webhook mode**: starts an HTTP server to receive POST callbacks.
   *
   * Resolves when {@link stop} or the abort signal terminates the connection.
   */
  async start(externalSignal) {
    if (this.gateway) {
      throw new Error("QQBot: already started");
    }
    this.abortController = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) {
        this.abortController.abort();
      } else {
        externalSignal.addEventListener("abort", () => this.abortController?.abort(), {
          once: true
        });
      }
    }
    const transportMode = this.opts.transport ?? "websocket";
    if (transportMode === "webhook") {
      await this.startWebhook();
    } else if (transportMode === "websocket") {
      await this.startWebSocket();
    } else {
      const custom = transportMode;
      await custom.start();
    }
    this.tokenManager.stopBackgroundRefresh(this.creds.appId);
    this.gateway = null;
    this.abortController = null;
  }
  /** Stop the transport and background refreshers. */
  stop() {
    this.abortController?.abort();
    this.tokenManager.stopBackgroundRefresh(this.creds.appId);
    this.gateway = null;
    this.abortController = null;
  }
  // ============ Token initialization ============
  /**
   * Initialize token based on the configured prefetch strategy.
   *
   * - `"sync"` (default): awaits the first token fetch, providing fail-fast
   *   semantics so credential errors surface at startup.
   * - `"async"`: fires the token fetch in the background and starts the
   *   background refresher immediately — trades fail-fast for faster startup.
   */
  async initToken() {
    const tokenSpan = qqStartupBegin(this, "token");
    try {
      const mode = this.opts.tokenPrefetch ?? "sync";
      if (mode === "sync") {
        await this.tokenManager.getAccessToken(this.creds.appId, this.creds.clientSecret);
      } else {
        this.tokenManager.getAccessToken(this.creds.appId, this.creds.clientSecret).catch((err) => {
          this.logger.error?.(`[qqbot] async token prefetch failed: ${err}`);
          void this.emit("error", err instanceof Error ? err : new Error(String(err)));
        });
      }
      this.tokenManager.startBackgroundRefresh(this.creds.appId, this.creds.clientSecret);
    } catch (error) {
      qqStartupEnd(tokenSpan, "error");
      throw error;
    }
    qqStartupEnd(tokenSpan, "ok");
  }
  // ============ Transport: WebSocket ============
  async startWebSocket() {
    await this.initToken();
    this.gateway = new GatewayConnection({
      account: this.account,
      abortSignal: this.abortController.signal,
      log: this.logger,
      userAgent: this.userAgent,
      intents: this.opts.intents,
      session: this.opts.sessionPersistence,
      getAccessToken: () => this.tokenManager.getAccessToken(this.creds.appId, this.creds.clientSecret),
      clearTokenCache: () => this.tokenManager.clearCache(this.creds.appId),
      getGatewayUrl: () => this.messageApi.getGatewayUrl(this.creds),
      onReady: (data) => {
        this.logger.info?.(`[qqbot] gateway READY`);
        void this.emit("ready", data);
      },
      onResumed: (data) => {
        this.logger.info?.(`[qqbot] gateway RESUMED`);
        void this.emit("resumed", data);
      },
      onError: (err) => {
        void this.emit("error", err);
      },
      onMessage: (raw) => this.handleInboundMessage(raw),
      onInteraction: (event) => {
        const ctx = { bot: this, event, state: {}, receivedAt: Date.now() };
        void this.emit("interaction", ctx, event);
      },
      onRawEvent: (type, data) => {
        const ctx = { bot: this, eventType: type, data, state: {}, receivedAt: Date.now() };
        void this.emit("rawEvent", ctx);
      }
    });
    qqStartupBind(this.gateway, this);
    await this.gateway.start();
  }
  // ============ Transport: Webhook ============
  async startWebhook() {
    await this.initToken();
    const webhook = new WebhookTransport({
      appId: this.creds.appId,
      appSecret: this.creds.clientSecret,
      port: this.opts.webhook?.port,
      path: this.opts.webhook?.path,
      server: this.opts.webhook?.server,
      accountId: this.account.accountId,
      log: this.logger,
      abortSignal: this.abortController.signal
    }, {
      onReady: (data) => {
        this.logger.info?.(`[qqbot] webhook READY`);
        void this.emit("ready", data);
      },
      onResumed: (data) => {
        void this.emit("resumed", data);
      },
      onError: (err) => {
        void this.emit("error", err);
      },
      onMessage: (raw) => this.handleInboundMessage(raw),
      onInteraction: (event) => {
        const ctx = { bot: this, event, state: {}, receivedAt: Date.now() };
        void this.emit("interaction", ctx, event);
      }
    });
    await webhook.start();
  }
  // ============ Shared inbound message handler ============
  async handleInboundMessage(raw) {
    const replyTarget = this.deriveReplyTarget(raw);
    if (!replyTarget) {
      this.logger.debug?.(`[qqbot] inbound message has no reply target \u2014 skipping`);
      return;
    }
    const augmented = { ...raw, replyTarget };
    const ctx = createMiddlewareContext({
      bot: this,
      message: augmented,
      log: this.logger
    });
    const downstream = async () => {
      await this.emit("message", ctx, ctx.message);
    };
    const chain = [...this.middlewares, downstream];
    __qqDeadlineStart(ctx);
    try {
      await runMiddlewareChain(chain, ctx);
    } catch (err) {
      this.logger.error?.(`[qqbot] middleware chain threw: ${err instanceof Error ? err.message : String(err)}`);
      void this.emit("error", err instanceof Error ? err : new Error(String(err)));
    } finally {
      __qqDeadlineFinish(ctx);
    }
  }
  // ============ Message sending ============
  /**
   * Universal message send — supports all QQ Open Platform message types.
   *
   * This is the most flexible sending method. It accepts the full parameter
   * set of POST `/v2/users/{openid}/messages` or `/v2/groups/{group_openid}/messages`.
   * Use it when the convenience helpers (sendText, sendMarkdown, etc.) don't
   * cover your use case.
   *
   * `msg_type` is auto-detected if not specified:
   * - markdown field present → 2 (Markdown)
   * - ark field present → 3 (Ark)
   * - embed field present → 4 (Embed)
   * - media field present → 7 (Rich media)
   * - otherwise → 0 (Text)
   *
   * @example Send a keyboard message
   * ```ts
   * await bot.send({
   *   target: msg.replyTarget,
   *   msgType: MsgType.MARKDOWN,
   *   markdown: { content: '# Hello' },
   *   keyboard: { content: { rows: [...] } },
   * });
   * ```
   *
   * @example Send a proactive message (no msgId)
   * ```ts
   * await bot.send({
   *   target: { scope: 'c2c', targetId: openid },
   *   content: 'Hello from bot!',
   * });
   * ```
   */
  async send(opts) {
    const body = {};
    if (opts.target.msgId)
      body.msg_id = opts.target.msgId;
    if (opts.msgType !== void 0)
      body.msg_type = opts.msgType;
    if (opts.content !== void 0)
      body.content = opts.content;
    if (opts.markdown)
      body.markdown = opts.markdown;
    if (opts.ark)
      body.ark = opts.ark;
    if (opts.embed)
      body.embed = opts.embed;
    if (opts.media)
      body.media = opts.media;
    if (opts.keyboard)
      body.keyboard = opts.keyboard;
    if (opts.messageReference)
      body.message_reference = opts.messageReference;
    if (opts.extra)
      Object.assign(body, opts.extra);
    return this.messageApi.sendRaw(opts.target.scope, opts.target.targetId, this.creds, body);
  }
  /**
   * Send a text message to a C2C user or group (smart mode).
   *
   * **Difference from `send()`**:
   * - `sendText` auto-selects msg_type based on `markdownSupport` config
   *   (markdown bots automatically send as msg_type=2).
   * - `send()` is explicit mode — you control msg_type directly.
   *
   * When `target.msgId` is present the message is treated as a reply
   * (tied to the inbound message lifecycle); otherwise it is treated as
   * a proactive push.
   */
  async sendText(target, content) {
    if (target.msgId) {
      return this.messageApi.sendMessage(target.scope, target.targetId, content, this.creds, {
        msgId: target.msgId
      });
    }
    return this.messageApi.sendProactiveMessage(target.scope, target.targetId, content, this.creds);
  }
  /** Send a text message with an inline keyboard. */
  async sendTextWithKeyboard(target, content, inlineKeyboard) {
    return this.messageApi.sendMessage(target.scope, target.targetId, content, this.creds, {
      msgId: target.msgId,
      inlineKeyboard
    });
  }
  /**
   * Send a Markdown message (msg_type=2).
   *
   * @example
   * ```ts
   * await bot.sendMarkdown(msg.replyTarget, '# Hello **world**');
   * await bot.sendMarkdown(msg.replyTarget, '# Click below', {
   *   keyboard: { content: { rows: [...] } },
   * });
   * ```
   */
  async sendMarkdown(target, content, opts) {
    return this.send({
      target,
      msgType: MsgType.MARKDOWN,
      markdown: { content },
      keyboard: opts?.keyboard
    });
  }
  /**
   * Recall (delete) a previously sent message.
   *
   * @example
   * ```ts
   * const sent = await bot.sendText(target, 'oops');
   * await bot.recallMessage(target, sent.id);
   * ```
   */
  async recallMessage(target, messageId) {
    return this.messageApi.recallMessage(target.scope, target.targetId, messageId, this.creds);
  }
  /**
   * Send a wakeup/recall message (C2C only, 30-day window).
   *
   * After a user initiates a conversation, the bot can send periodic
   * recall messages within 30 days using `is_wakeup: true`.
   * Platform enforces frequency limits.
   *
   * @example
   * ```ts
   * await bot.sendWakeup({ scope: 'c2c', targetId: openid }, '你有新消息!');
   * ```
   */
  async sendWakeup(target, content) {
    if (target.scope !== "c2c") {
      throw new Error("sendWakeup is only supported for C2C targets");
    }
    return this.send({ target, content, extra: { is_wakeup: true } });
  }
  /**
   * Send a message to a guild text channel.
   *
   * @example
   * ```ts
   * await bot.sendChannelMessage(channelId, '频道消息', { msgId });
   * ```
   */
  async sendChannelMessage(channelId, content, opts) {
    const body = { content };
    if (opts?.msgId)
      body.msg_id = opts.msgId;
    if (opts?.keyboard)
      body.keyboard = opts.keyboard;
    if (opts?.messageReference)
      body.message_reference = { message_id: opts.messageReference };
    return this.messageApi.sendChannelMessageRaw(channelId, this.creds, body);
  }
  /**
   * Send a direct message (DM) in a guild.
   *
   * @example
   * ```ts
   * await bot.sendDmMessage(guildId, '私信内容', { msgId });
   * ```
   */
  async sendDmMessage(guildId, content, opts) {
    const body = { content };
    if (opts?.msgId)
      body.msg_id = opts.msgId;
    return this.messageApi.sendDmMessageRaw(guildId, this.creds, body);
  }
  /** Send a typing indicator (C2C only). */
  async sendTyping(target, durationSec = 30) {
    if (target.scope !== "c2c") {
      throw new Error("sendTyping is only supported for C2C targets");
    }
    return this.messageApi.sendInputNotify({
      openid: target.targetId,
      creds: this.creds,
      msgId: target.msgId,
      inputSecond: durationSec
    });
  }
  /** Acknowledge an INTERACTION_CREATE event. */
  async acknowledgeInteraction(interactionId, code = 0, data) {
    return this.messageApi.acknowledgeInteraction(interactionId, this.creds, code, data);
  }
  // ============ API Gateway ============
  /**
   * Open Platform API Gateway — call any QQ Open Platform REST API with
   * automatic token injection and refresh.
   *
   * This is the "escape hatch" for any API not wrapped by a dedicated method.
   * All requests are authenticated, rate-limit aware, and return structured errors.
   *
   * @example List guilds
   * ```ts
   * const guilds = await bot.api.get('/users/@me/guilds');
   * ```
   *
   * @example Create an announcement
   * ```ts
   * await bot.api.post(`/guilds/${guildId}/announces`, {
   *   message_id: msgId, channel_id: channelId,
   * });
   * ```
   *
   * @example Get a raw access token
   * ```ts
   * const token = await bot.api.getToken();
   * ```
   */
  get api() {
    if (this._apiGateway)
      return this._apiGateway;
    this._apiGateway = {
      get: (path22, query) => this.apiRequest("GET", path22, void 0, query),
      post: (path22, body) => this.apiRequest("POST", path22, body),
      put: (path22, body) => this.apiRequest("PUT", path22, body),
      patch: (path22, body) => this.apiRequest("PATCH", path22, body),
      delete: (path22) => this.apiRequest("DELETE", path22),
      getToken: () => this.tokenManager.getAccessToken(this.creds.appId, this.creds.clientSecret)
    };
    return this._apiGateway;
  }
  async apiRequest(method, path22, body, query) {
    const token = await this.tokenManager.getAccessToken(this.creds.appId, this.creds.clientSecret);
    let fullPath = path22;
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== void 0 && v !== null)
          params.set(k, String(v));
      }
      fullPath = `${path22}?${params.toString()}`;
    }
    return this.apiClient.request(token, method, fullPath, body ?? void 0);
  }
  // ============ Streaming ============
  /**
   * Open a C2C stream session for incremental output.
   *
   * @returns A {@link StreamSession} — call `update(fullText)` repeatedly,
   * then `complete()` when finished.
   */
  openStream(opts) {
    if (opts.target.scope !== "c2c") {
      throw new Error("Streaming is only supported for C2C targets");
    }
    if (!opts.target.msgId) {
      throw new Error("Streaming requires target.msgId from the inbound message");
    }
    const sessionOptions = {
      openid: opts.target.targetId,
      msgId: opts.target.msgId,
      creds: this.creds,
      eventId: opts.eventId,
      throttleMs: opts.throttleMs,
      logger: this.logger
    };
    return new StreamSession(this.messageApi, sessionOptions);
  }
  // ============ Media ============
  /**
   * Upload media (image / voice / video / file) to a target. Automatically
   * dispatches to the chunked-upload path when the source exceeds
   * {@link LARGE_FILE_THRESHOLD} bytes.
   */
  async uploadMedia(opts) {
    const sources = [opts.url, opts.fileData, opts.buffer, opts.localPath].filter((v) => v !== void 0);
    if (sources.length === 0) {
      throw new Error("uploadMedia: one of url/fileData/buffer/localPath is required");
    }
    if (sources.length > 1) {
      throw new Error("uploadMedia: provide exactly one source");
    }
    const size = await this.computeSourceSize(opts);
    const useChunked = size !== null && size >= LARGE_FILE_THRESHOLD;
    const fileName = opts.fileName ?? (opts.localPath ? path.basename(opts.localPath) : void 0) ?? (opts.url ? decodeURIComponent(path.basename(new URL(opts.url).pathname)) || void 0 : void 0);
    if (useChunked && (opts.localPath || opts.buffer)) {
      const source = opts.localPath ? { kind: "localPath", path: opts.localPath, size } : {
        kind: "buffer",
        buffer: opts.buffer,
        fileName
      };
      return this.chunkedMediaApi.uploadChunked({
        scope: opts.target.scope,
        targetId: opts.target.targetId,
        fileType: opts.fileType,
        source,
        creds: this.creds,
        fileName,
        onProgress: opts.onProgress ? (p2) => opts.onProgress(p2.uploadedBytes, p2.totalBytes) : void 0
      });
    }
    return this.mediaApi.uploadMedia(opts.target.scope, opts.target.targetId, opts.fileType, this.creds, {
      url: opts.url,
      fileData: opts.fileData,
      buffer: opts.buffer,
      localPath: opts.localPath,
      srvSendMsg: opts.srvSendMsg,
      fileName
    });
  }
  /**
   * Upload + send a media message to a C2C user or group.
   */
  async sendMedia(opts) {
    const upload = await this.uploadMedia({ ...opts, srvSendMsg: false });
    const sendOnce = (fileInfo) => this.mediaApi.sendMediaMessage(opts.target.scope, opts.target.targetId, fileInfo, this.creds, {
      msgId: opts.target.msgId,
      content: opts.content
    });
    try {
      const message = await sendOnce(upload.file_info);
      return { upload, message };
    } catch (e) {
      const hit = upload?.__qqCacheHit;
      const msg = String(e?.message || e);
      // QQ-UPLOAD-CACHE-PATCH v1: a cached file_info may have expired server-side -> drop it, upload once more.
      if (!hit || /timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up|abort/i.test(msg)) throw e;
      try { this.uploadCache?.delete?.(hit.hash, hit.scope, hit.targetId, hit.fileType); } catch {}
      this.logger?.info?.(`[upload-cache] cached file_info rejected (${msg.slice(0, 120)}); re-uploading once`);
      const upload2 = await this.uploadMedia({ ...opts, srvSendMsg: false });
      const message = await sendOnce(upload2.file_info);
      return { upload: upload2, message };
    }
  }
  /** Convenience: upload + send an image. */
  async sendImage(target, source, opts) {
    return this.sendMedia({
      target,
      fileType: MediaFileType.IMAGE,
      ...source,
      content: opts?.content,
      onProgress: opts?.onProgress
    });
  }
  /** Convenience: upload + send a video. */
  async sendVideo(target, source, opts) {
    return this.sendMedia({
      target,
      fileType: MediaFileType.VIDEO,
      ...source,
      content: opts?.content,
      onProgress: opts?.onProgress
    });
  }
  /** Convenience: upload + send a voice message. */
  async sendVoice(target, source, opts) {
    return this.sendMedia({
      target,
      fileType: MediaFileType.VOICE,
      ...source,
      onProgress: opts?.onProgress
    });
  }
  /** Convenience: upload + send a generic file (for users with file-message permission). */
  async sendFile(target, source, opts) {
    return this.sendMedia({
      target,
      fileType: MediaFileType.FILE,
      ...source,
      fileName: opts?.fileName,
      content: opts?.content,
      onProgress: opts?.onProgress
    });
  }
  // ============ Internal ============
  deriveReplyTarget(raw) {
    if (raw.kind === "c2c") {
      return { scope: "c2c", targetId: raw.senderId, msgId: raw.messageId };
    }
    if (raw.kind === "group" && raw.groupOpenid) {
      return { scope: "group", targetId: raw.groupOpenid, msgId: raw.messageId };
    }
    return null;
  }
  async computeSourceSize(opts) {
    if (opts.buffer) {
      return opts.buffer.length;
    }
    if (opts.localPath) {
      try {
        const stat = await fs3.promises.stat(opts.localPath);
        return stat.size;
      } catch {
        return null;
      }
    }
    if (opts.fileData) {
      return Math.floor(opts.fileData.length * 3 / 4);
    }
    return null;
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/message-filter.js
function messageFilter(options = {}) {
  const skipSelfEcho = options.skipSelfEcho ?? true;
  const dedupOpts = options.dedup !== false ? { windowMs: 5e3, maxSize: 1e3, ...options.dedup ?? {} } : null;
  const seen = dedupOpts ? /* @__PURE__ */ new Map() : null;
  function evict(now) {
    if (!seen || !dedupOpts)
      return;
    if (seen.size <= dedupOpts.maxSize)
      return;
    for (const [key, ts] of seen) {
      if (now - ts > dedupOpts.windowMs || seen.size > dedupOpts.maxSize) {
        seen.delete(key);
      } else {
        break;
      }
    }
  }
  return async (ctx, next) => {
    if (skipSelfEcho && ctx.message.senderIsBot) {
      ctx.stop("self-echo");
      return;
    }
    if (seen && dedupOpts) {
      const id = ctx.message.messageId;
      const now = Date.now();
      if (seen.has(id)) {
        ctx.log.debug?.(`[message-filter] dropping duplicate messageId=${id}`);
        ctx.stop("deduplication");
        return;
      }
      seen.set(id, now);
      evict(now);
    }
    await next();
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/content-sanitizer.js
function contentSanitizer(options = {}) {
  const { stripBotMention = true, stripAllMentions = false, collapseWhitespace = false, parseFaceTags: parseFaceTags2 = false, transform } = options;
  return async (ctx, next) => {
    let content = ctx.message.content ?? "";
    if (stripAllMentions) {
      content = content.replace(/<@!?\d+>\s*/g, "");
    } else if (stripBotMention) {
      const appId = ctx.bot.appId;
      if (appId) {
        const re = new RegExp(`<@!?${appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>\\s*`, "g");
        content = re[Symbol.replace](content, "");
      }
    }
    if (parseFaceTags2) {
      content = content.replace(/\[<face,id=(\d+)\/?>]/g, (_m, id) => faceToEmoji(id) ?? "");
      content = content.replace(/<faceType=\d+,faceId="[^"]*",ext="([^"]*)">/g, (_m, ext) => {
        try {
          const decoded = Buffer.from(ext, "base64").toString("utf-8");
          const parsed = JSON.parse(decoded);
          return `\u3010\u8868\u60C5: ${parsed.text || "\u672A\u77E5\u8868\u60C5"}\u3011`;
        } catch {
          return _m;
        }
      });
    } else {
      content = content.replace(/\[<face,id=\d+\/?>]/g, "");
      content = content.replace(/<faceType=\d+,faceId="[^"]*",ext="[^"]*">/g, "");
    }
    if (collapseWhitespace) {
      content = content.replace(/\s+/g, " ");
    }
    content = content.trim();
    if (transform) {
      content = transform(content, ctx);
    }
    ctx.message.content = content;
    await next();
  };
}
function faceToEmoji(id) {
  const map = {
    "0": "\u{1F60A}",
    "1": "\u{1F623}",
    "2": "\u{1F60D}",
    "4": "\u{1F60E}",
    "5": "\u{1F62D}",
    "6": "\u{1F633}",
    "7": "\u{1F910}",
    "8": "\u{1F634}",
    "9": "\u{1F622}",
    "10": "\u{1F630}",
    "11": "\u{1F621}",
    "12": "\u{1F917}",
    "13": "\u2B50",
    "14": "\u{1F31F}",
    "15": "\u{1F319}",
    "16": "\u{1F44D}",
    "18": "\u270A",
    "21": "\u{1F60A}",
    "23": "\u{1F622}",
    "25": "\u{1F914}",
    "26": "\u{1F631}",
    "27": "\u{1F605}",
    "28": "\u{1F601}",
    "29": "\u{1F92E}",
    "30": "\u{1F4AA}",
    "32": "\u{1F389}",
    "33": "\u{1F624}",
    "34": "\u{1F60F}",
    "35": "\u{1F97A}",
    "49": "\u{1F437}",
    "53": "\u{1F382}",
    "60": "\u2615",
    "63": "\u{1F339}",
    "66": "\u2764\uFE0F",
    "74": "\u{1F31E}",
    "75": "\u{1F31B}",
    "76": "\u{1F44F}",
    "78": "\u{1F91D}",
    "79": "\u270C\uFE0F",
    "85": "\u{1F385}",
    "89": "\u{1F349}",
    "96": "\u{1F613}",
    "97": "\u{1F632}",
    "100": "\u{1F602}",
    "101": "\u{1F60A}",
    "104": "\u{1F62D}",
    "106": "\u{1F631}",
    "109": "\u{1F618}",
    "111": "\u{1F970}"
  };
  return map[id];
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/rate-limiter.js
var SlidingWindow = class {
  buckets = /* @__PURE__ */ new Map();
  max;
  windowMs;
  constructor(tier) {
    this.max = tier.max;
    this.windowMs = tier.windowMs;
  }
  /** Returns `true` if allowed, `false` if rate-limited. */
  check(key) {
    const now = Date.now();
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    while (arr.length > 0 && now - arr[0] > this.windowMs) {
      arr.shift();
    }
    if (arr.length >= this.max) {
      return false;
    }
    arr.push(now);
    return true;
  }
};
function rateLimiter(options = {}) {
  const { onLimit } = options;
  const perSender = options.perSender ? new SlidingWindow(options.perSender) : void 0;
  const perGroup = options.perGroup ? new SlidingWindow(options.perGroup) : void 0;
  const global = options.global ? new SlidingWindow(options.global) : void 0;
  return async (ctx, next) => {
    const senderId = ctx.message.senderId;
    const groupKey = ctx.message.groupOpenid ?? senderId;
    if (global && !global.check("__global__")) {
      await onLimit?.(ctx, "global");
      ctx.stop("rate-limit:global");
      return;
    }
    if (perGroup && !perGroup.check(groupKey)) {
      await onLimit?.(ctx, "perGroup");
      ctx.stop("rate-limit:perGroup");
      return;
    }
    if (perSender && !perSender.check(senderId)) {
      await onLimit?.(ctx, "perSender");
      ctx.stop("rate-limit:perSender");
      return;
    }
    await next();
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/concurrency-guard.js
function concurrencyGuard(options = {}) {
  const strategy = options.strategy ?? "queue";
  const maxQueue = options.maxQueue ?? 3;
  const { onDrop, onMerge, onDispatch, urgentPredicate, maxProcessingMs } = options;
  const locks = /* @__PURE__ */ new Map();
  function getState(key) {
    let s = locks.get(key);
    if (!s) {
      s = { busy: false, queue: [] };
      locks.set(key, s);
    }
    return s;
  }
  function cleanupState(key) {
    const s = locks.get(key);
    if (s && !s.busy && s.queue.length === 0 && (!s.mergeBuffer || s.mergeBuffer.length === 0)) {
      locks.delete(key);
    }
  }
  function targetKey(ctx) {
    const t = ctx.message.replyTarget;
    return `${t.scope}:${t.targetId}`;
  }
  const guard = async (ctx, next) => {
    const key = targetKey(ctx);
    const state = getState(key);
    if (!state.busy) {
      state.busy = true;
      state.activeCtx = ctx;
      if (strategy === "merge") {
        state.mergeBuffer = [];
        state.mergeWaiters = [];
      }
      let timedOut = false;
      let timeoutId;
      if (maxProcessingMs && maxProcessingMs > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          ctx.log.warn?.(`[concurrency] aborting active chain ${key} after ${maxProcessingMs}ms`);
          ctx.abort("concurrency:processing-timeout");
          // QQ-ABSOLUTE-DEADLINE-PATCH: abort is a request, not a terminal receipt.
          // The active chain owns this lane until its promise really settles.
          __qqDeadlineLog(ctx, "guard-cancel-requested", { ownerReleased: false });
        }, maxProcessingMs);
      }
      try {
        await next();
      } finally {
        if (timeoutId)
          clearTimeout(timeoutId);
        {
          state.activeCtx = void 0;
          if (strategy === "merge") {
            await drainMergeBuffer(key, state, ctx);
            state.busy = false;
          } else {
            state.busy = false;
            if (strategy === "queue" || strategy === "abort") {
              drainQueue(key);
            }
          }
          cleanupState(key);
        }
      }
      return;
    }
    switch (strategy) {
      case "merge": {
        if (!state.mergeBuffer || !state.mergeWaiters) {
          state.mergeBuffer = [];
          state.mergeWaiters = [];
        }
        if (urgentPredicate?.(ctx)) {
          ctx.log.debug?.(`[concurrency:merge] urgent for ${key}`);
          for (const w2 of state.mergeWaiters)
            w2.resolve();
          state.mergeBuffer.length = 0;
          state.mergeWaiters.length = 0;
          await next();
          return;
        }
        if (state.mergeBuffer.length >= maxQueue) {
          ctx.log.debug?.(`[concurrency:merge] buffer full (${maxQueue}), drop for ${key}`);
          await onDrop?.(ctx);
          ctx.stop("concurrency:merge-full");
          return;
        }
        ctx.log.debug?.(`[concurrency:merge] buffered: ${key} (msgId=${ctx.message.messageId} pos=${state.mergeBuffer.length + 1})`);
        state.mergeBuffer.push(ctx);
        let isSurvivor = false;
        const __qqMergeWait = new Promise((resolve2) => {
          state.mergeWaiters.push({
            ctx,
            resolve: resolve2,
            markSurvivor: () => {
              isSurvivor = true;
            }
          });
        });
        if (!await __qqWaitWhileQueued(ctx, __qqMergeWait)) return;
        if (isSurvivor && !ctx.signal.aborted && !ctx.stopped) {
          await next();
        }
        return;
      }
      case "drop": {
        ctx.log.debug?.(`[concurrency] drop message for busy target ${key}`);
        await onDrop?.(ctx);
        ctx.stop("concurrency:drop");
        return;
      }
      case "abort": {
        ctx.log.debug?.(`[concurrency] abort previous for ${key}`);
        state.activeCtx?.abort("concurrency:abort");
        for (const entry of state.queue) {
          entry.ctx?.abort("concurrency:superseded");
          entry.run();
        }
        state.queue.length = 0;
        await __qqWaitWhileQueued(ctx, waitForRelease(state, ctx));
        if (ctx.signal.aborted) {
          ctx.log.debug?.(`[concurrency] superseded while waiting for ${key}`);
          return;
        }
        state.busy = true;
        state.activeCtx = ctx;
        try {
          await next();
        } finally {
          state.busy = false;
          state.activeCtx = void 0;
          drainQueue(key);
        }
        return;
      }
      case "queue":
      default: {
        if (state.queue.length >= maxQueue) {
          ctx.log.debug?.(`[concurrency] queue full (${maxQueue}), drop for ${key}`);
          await onDrop?.(ctx);
          ctx.stop("concurrency:queue-full");
          return;
        }
        ctx.log.debug?.(`[concurrency] queued message for ${key} (pos=${state.queue.length + 1})`);
        const __qqQueueWait = new Promise((resolve2) => {
          state.queue.push({ run: resolve2, ctx });
        });
        if (!await __qqWaitWhileQueued(ctx, __qqQueueWait)) return;
        state.busy = true;
        state.activeCtx = ctx;
        try {
          await next();
        } finally {
          state.busy = false;
          state.activeCtx = void 0;
          drainQueue(key);
        }
        return;
      }
    }
  };
  async function drainMergeBuffer(key, state, ownerCtx) {
    while (state.mergeBuffer && state.mergeBuffer.length > 0) {
      const allBuffered = state.mergeBuffer.splice(0);
      const waiters = state.mergeWaiters?.splice(0) ?? [];
      const buffered = allBuffered.filter((entry) => !entry.signal?.aborted && !entry.stopped);
      if (!buffered.length) { for (const waiter of waiters) waiter.resolve(); continue; }
      const survivor = onMerge ? onMerge(buffered) : defaultMerge(buffered);
      const validSurvivor = buffered.includes(survivor) ? survivor : buffered[0];
      ownerCtx.log.debug?.(`[concurrency:merge] flushing batch: ${key} (count=${buffered.length})`);
      if (onDispatch) {
        state.activeCtx = validSurvivor;
        try {
          await onDispatch(validSurvivor);
        } catch (err) {
          validSurvivor.log.error?.(`[concurrency:merge] onDispatch error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          state.activeCtx = void 0;
        }
        for (const w2 of waiters)
          w2.resolve();
      } else {
        for (const w2 of waiters) {
          if (w2.ctx === validSurvivor)
            w2.markSurvivor();
          w2.resolve();
        }
      }
    }
    state.mergeBuffer = void 0;
    state.mergeWaiters = void 0;
  }
  function drainQueue(key) {
    const state = locks.get(key);
    if (!state)
      return;
    let entry = state.queue.shift();
    while (entry?.ctx?.signal?.aborted || entry?.ctx?.stopped) { entry.run(); entry = state.queue.shift(); }
    if (entry) {
      entry.run();
    } else if (!state.busy) {
      locks.delete(key);
    }
  }
  function waitForRelease(state, ctx) {
    if (!state.busy)
      return Promise.resolve();
    return new Promise((resolve2) => {
      state.queue.unshift({ run: resolve2, ctx });
    });
  }
  function defaultMerge(buffered) {
    const first = buffered[0];
    if (buffered.length === 1)
      return first;
    const contentBearingCtxs = buffered.filter((ctx) => (ctx.message.content ?? "") !== "");
    const contents = contentBearingCtxs.map((ctx) => ctx.message.content);
    if (contents.length > 0) {
      first.message.content = contents.join("\n");
    }
    const envelopes = contentBearingCtxs.map((ctx) => ctx.state.envelope).filter(Boolean);
    if (envelopes.length > 0) {
      first.state.envelope = envelopes.join("\n\n");
    }
    const allAttachments = contentBearingCtxs.flatMap((ctx) => ctx.message.attachments ?? []);
    if (allAttachments.length > 0) {
      first.message.attachments = allAttachments;
    }
    return first;
  }
  return guard;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/mention-gate.js
function detectMentionInContent(content, appId) {
  if (!content || !appId)
    return false;
  const re = new RegExp(`<@!?${appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`);
  return re.test(content);
}
function mentionGate(options = {}) {
  const { requireMentionInGroup = true, alwaysAnswerC2C = true, isImplicitMention, onSkip, ignoreOtherMentions = false, passthrough = false, resolveConfig } = options;
  return async (ctx, next) => {
    const msg = ctx.message;
    const appId = ctx.bot.appId;
    if (msg.kind !== "group") {
      const decision2 = {
        wasMentioned: true,
        implicit: false,
        shouldAnswer: alwaysAnswerC2C || msg.kind !== "c2c" && msg.kind !== "dm",
        reason: "passthrough"
      };
      ctx.state.mention = decision2;
      await next();
      return;
    }
    const dynamic = resolveConfig?.(ctx);
    const effectiveRequireMention = resolvePolicy(ctx, "group.requireMention", dynamic?.requireMentionInGroup, requireMentionInGroup);
    const effectiveIgnoreOther = resolvePolicy(ctx, "group.ignoreOtherMentions", dynamic?.ignoreOtherMentions, ignoreOtherMentions);
    const wasMentioned = msg.rawEventType === "GROUP_AT_MESSAGE_CREATE" || Array.isArray(msg.mentions) && msg.mentions.some((m3) => m3?.is_you === true) || detectMentionInContent(msg.content, appId);
    const implicit = isImplicitMention?.(ctx) ?? false;
    let shouldAnswer = !effectiveRequireMention || wasMentioned || implicit;
    let reason = shouldAnswer ? "passthrough" : "no_mention";
    if (effectiveIgnoreOther && effectiveRequireMention && !wasMentioned && !implicit) {
      const mentions = msg.mentions;
      if (Array.isArray(mentions) && mentions.length > 0) {
        shouldAnswer = false;
        reason = "other_mention";
      }
    }
    const decision = {
      wasMentioned,
      implicit,
      shouldAnswer,
      reason
    };
    ctx.state.mention = decision;
    if (!shouldAnswer) {
      onSkip?.(ctx, decision);
      ctx.log.debug?.(`[mention-gate] skip group message (${reason}): wasMentioned=${wasMentioned}, implicit=${implicit}`);
      if (!passthrough) {
        ctx.stop(`mention-gate:${reason}`);
        return;
      }
    }
    await next();
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/quote-ref.js
var MemoryRefIndexStore = class {
  map = /* @__PURE__ */ new Map();
  maxSize;
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }
  get(key) {
    return this.map.get(key);
  }
  set(key, entry) {
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== void 0)
        this.map.delete(first);
    }
    this.map.set(key, entry);
  }
};
function quoteRef(options = {}) {
  const contentLimit = options.contentLimit ?? 200;
  const store = options.store ?? new MemoryRefIndexStore(options.maxSize ?? 500);
  return async (ctx, next) => {
    const msg = ctx.message;
    const key = msg.msgIdx ?? msg.messageId;
    if (key) {
      let entry = {
        messageId: msg.messageId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: (msg.content ?? "").slice(0, contentLimit),
        timestamp: msg.timestamp,
        isBot: msg.senderIsBot,
        scope: msg.kind
      };
      if (options.enrichEntry) {
        entry = options.enrichEntry(entry, ctx);
      }
      await store.set(key, entry);
    }
    const refKey = msg.refMsgIdx;
    if (refKey) {
      const entry = await store.get(refKey);
      const resolveFromElements = () => {
        const el = msg.msgElements?.[0];
        if (!el || !el.content && !el.attachments?.length)
          return null;
        const rawContent = el.content ?? "";
        const attachments = parseAttachments(el.attachments);
        return { rawContent, attachments, text: buildText(rawContent, attachments) };
      };
      if (entry) {
        const elementsQuote = options.preferMsgElements !== false ? resolveFromElements() : null;
        if (elementsQuote) {
          ctx.state.quote = {
            refKey,
            source: "msg_elements",
            rawContent: elementsQuote.rawContent,
            attachments: elementsQuote.attachments,
            text: elementsQuote.text
          };
        } else {
          ctx.state.quote = {
            refKey,
            source: "store",
            entry,
            text: entry.content || "[empty message]"
          };
        }
        ctx.log.debug?.(`[quote-ref] hit refKey=${refKey} sender=${entry.senderId}`);
      } else {
        const elementsQuote = resolveFromElements();
        if (elementsQuote) {
          ctx.state.quote = {
            refKey,
            source: "msg_elements",
            rawContent: elementsQuote.rawContent,
            attachments: elementsQuote.attachments,
            text: elementsQuote.text
          };
        } else {
          ctx.state.quote = { refKey, source: "none", text: "" };
        }
        ctx.log.debug?.(`[quote-ref] ${elementsQuote ? "fallback" : "miss"} refKey=${refKey}`);
      }
    }
    await next();
  };
}
function parseAttachments(raw) {
  if (!raw || raw.length === 0)
    return [];
  return raw.map((a) => ({
    contentType: a.content_type,
    url: a.url,
    filename: a.filename,
    asrText: a.asr_refer_text
  }));
}
function buildText(content, attachments) {
  const parts = [];
  if (content.trim())
    parts.push(content.trim());
  for (const att of attachments) {
    const t = att.contentType.toLowerCase();
    if (t.startsWith("audio/")) {
      parts.push(att.asrText ? `[voice: ${att.asrText}]` : "[voice]");
    } else if (t.startsWith("image/")) {
      parts.push(att.filename ? `[image: ${att.filename}]` : "[image]");
    } else if (t.startsWith("video/")) {
      parts.push(att.filename ? `[video: ${att.filename}]` : "[video]");
    } else {
      parts.push(`[file: ${att.filename ?? "untitled"}]`);
    }
  }
  return parts.join("\n") || "[empty message]";
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/envelope-formatter.js
function envelopeFormatter(options = {}) {
  const { historyLimit = 5, includeQuote = true, includeSender = true, format } = options;
  return async (ctx, next) => {
    if (format) {
      ctx.state.envelope = format(ctx);
    } else {
      ctx.state.envelope = buildEnvelope(ctx, { historyLimit, includeQuote, includeSender });
    }
    ctx.log.debug?.(`[envelope] built ${ctx.state.envelope.length} chars (sender=${includeSender}, quote=${includeQuote}, history=${ctx.state.history?.length ?? 0}/${historyLimit})`);
    await next();
  };
}
function buildEnvelope(ctx, opts) {
  const sections = [];
  if (opts.includeSender) {
    const name = ctx.message.senderName || ctx.message.senderId;
    const scope = ctx.message.kind === "group" ? `group(${ctx.message.groupOpenid ?? "unknown"})` : ctx.message.kind;
    sections.push(`<from>
user: ${name}
scope: ${scope}
</from>`);
  }
  if (opts.includeQuote) {
    const quote = ctx.state.quote;
    if (quote && quote.text) {
      const sender = quote.entry?.senderName || quote.entry?.senderId;
      const line = sender ? `${sender}: ${quote.text}` : quote.text;
      sections.push(`<reply_to>
${line}
</reply_to>`);
    }
  }
  const history = ctx.state.history;
  if (history && history.length > 0) {
    const recent = history.slice(-opts.historyLimit);
    const lines = recent.map((h2) => {
      const name = h2.senderName || h2.senderId;
      return `${name}: ${h2.content.slice(0, 200)}`;
    });
    sections.push(`<history>
${lines.join("\n")}
</history>`);
  }
  const content = (ctx.message.content ?? "").trim();
  const attachments = ctx.message.attachments;
  const hasAttachments = attachments && attachments.length > 0;
  if (content || hasAttachments) {
    const parts = [];
    if (content) {
      parts.push(content);
    }
    if (hasAttachments) {
      for (const att of attachments) {
        const t = att.content_type.toLowerCase();
        if (t.startsWith("image/"))
          parts.push(`[image: ${att.filename ?? "image"}]`);
        else if (t.startsWith("audio/") || t === "voice") {
          parts.push(att.asr_refer_text ? `[voice: ${att.asr_refer_text}]` : "[voice]");
        } else if (t.startsWith("video/"))
          parts.push("[video]");
        else
          parts.push(`[file: ${att.filename ?? "file"}]`);
      }
    }
    sections.push(`<message>
${parts.join("\n")}
</message>`);
  }
  return sections.join("\n\n");
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/slash-command.js
function slashCommand(options = {}) {
  const prefixes = options.prefixes ?? ["/"];
  const catchErrors = options.catchErrors ?? true;
  const autoHelp = options.autoHelp ?? true;
  const allowFrom = options.allowFrom ?? [];
  const registry = /* @__PURE__ */ new Map();
  const register = (cmd) => {
    const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
    if (names.length === 0) {
      throw new Error("slash-command: name must not be empty");
    }
    for (const n of names) {
      const key = n.toLowerCase();
      if (registry.has(key)) {
        throw new Error(`slash-command: duplicate name "${n}"`);
      }
      registry.set(key, cmd);
    }
  };
  const unregister = (name) => {
    registry.delete(name.toLowerCase());
  };
  const list = () => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const cmd of registry.values()) {
      if (!seen.has(cmd)) {
        seen.add(cmd);
        out.push(cmd);
      }
    }
    return out;
  };
  for (const cmd of options.commands ?? []) {
    register(cmd);
  }
  if (autoHelp && !registry.has("help")) {
    register({
      name: "help",
      description: "List all available commands",
      handler: () => {
        const lines = ["Available commands:"];
        for (const cmd of list()) {
          if (cmd.hidden)
            continue;
          const names = Array.isArray(cmd.name) ? cmd.name.join(", ") : cmd.name;
          const desc = cmd.description ?? "";
          const usage = cmd.usage ? ` \u2014 ${cmd.usage}` : "";
          lines.push(`/${names}${usage}${desc ? ` \u2014 ${desc}` : ""}`);
        }
        return lines.join("\n");
      }
    });
  }
  const middleware = async (ctx, next) => {
    const content = (ctx.message.content ?? "").trim();
    if (!content) {
      await next();
      return;
    }
    const cleaned = content.replace(/<@!?[^>]+>\s*/g, "").trim();
    if (ctx.message.kind === "group") {
      const msg = ctx.message;
      const wasMentioned = msg.rawEventType === "GROUP_AT_MESSAGE_CREATE" || msg.mentions?.some((m3) => m3.is_you);
      if (!wasMentioned) {
        await next();
        return;
      }
    }
    const prefix = prefixes.find((p2) => cleaned.startsWith(p2));
    if (!prefix) {
      await next();
      return;
    }
    const body = cleaned.slice(prefix.length);
    const match = /^(\S+)(?:\s+(.*))?$/.exec(body);
    if (!match) {
      await next();
      return;
    }
    const [, name, rest = ""] = match;
    const cmd = registry.get(name.toLowerCase());
    if (!cmd) {
      await next();
      return;
    }
    const isAllowed = allowFrom.length === 0 || allowFrom.includes("*") || allowFrom.includes(ctx.message.senderId);
    if (!isAllowed) {
      await next();
      return;
    }
    const parsed = {
      name: name.toLowerCase(),
      args: rest ? rest.split(/\s+/) : [],
      raw: rest
    };
    ctx.state.command = parsed;
    const cmdScope = cmd.scope ?? "all";
    if (cmdScope !== "all") {
      const msgKind = ctx.message.kind;
      const isC2C = msgKind === "c2c" || msgKind === "dm";
      const isGroup = msgKind === "group";
      if (cmdScope === "c2c" && !isC2C || cmdScope === "group" && !isGroup) {
        const hint = cmdScope === "c2c" ? "\u8BE5\u6307\u4EE4\u4EC5\u9650\u79C1\u804A\u4F7F\u7528" : "\u8BE5\u6307\u4EE4\u4EC5\u9650\u7FA4\u804A\u4F7F\u7528";
        await sendCommandResult(ctx, hint);
        ctx.stop(`command:scope-denied:${parsed.name}`);
        return;
      }
    }
    const handlerCtx = ctx;
    handlerCtx.command = parsed;
    if (cmd.authorized) {
      const auth = cmd.authorized(handlerCtx);
      if (auth !== true) {
        const authMsg = typeof auth === "string" ? auth : "\u26A0\uFE0F \u65E0\u6743\u9650\u6267\u884C\u6B64\u547D\u4EE4";
        await sendCommandResult(ctx, { kind: "text", content: authMsg });
        ctx.stop(`command:unauthorized:${parsed.name}`);
        return;
      }
    }
    try {
      const result = await cmd.handler(handlerCtx);
      await sendCommandResult(ctx, result);
    } catch (err) {
      if (catchErrors) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.error?.(`[slash-command] handler "${parsed.name}" threw: ${msg}`);
        await sendCommandResult(ctx, { kind: "text", content: `Error: ${msg}` });
      } else {
        ctx.stop(`command:error:${parsed.name}`);
        throw err;
      }
    }
    ctx.stop(`command:matched:${parsed.name}`);
  };
  return { middleware, register, unregister, list };
}
async function sendCommandResult(ctx, result) {
  if (result === void 0 || result === null)
    return;
  if (typeof result === "string") {
    if (result)
      await ctx.bot.sendText(ctx.replyTarget, result);
    return;
  }
  if (typeof result === "object") {
    if (result.kind === "text" && result.content) {
      await ctx.bot.sendText(ctx.replyTarget, result.content);
    }
  }
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/history-buffer.js
var MemoryHistoryStore = class {
  buffers = /* @__PURE__ */ new Map();
  append(groupKey, entry, limit) {
    let buf = this.buffers.get(groupKey);
    if (!buf) {
      buf = [];
      this.buffers.set(groupKey, buf);
    }
    if (buf.some((e) => e.messageId === entry.messageId)) {
      return;
    }
    buf.push(entry);
    if (buf.length > limit) {
      buf.splice(0, buf.length - limit);
    }
  }
  list(groupKey, limit) {
    const buf = this.buffers.get(groupKey);
    if (!buf)
      return [];
    return buf.slice(-limit);
  }
  clear(groupKey) {
    this.buffers.delete(groupKey);
  }
  /** Diagnostic: number of groups with buffered history. */
  size() {
    return this.buffers.size;
  }
};
function historyBuffer(options = {}) {
  const limit = options.limit ?? 50;
  const store = options.store ?? new MemoryHistoryStore();
  const recordOnSkip = options.recordOnSkip ?? true;
  const getKey = options.groupKey ?? ((ctx) => ctx.message.kind === "group" ? ctx.message.groupOpenid : void 0);
  const m3 = async (ctx, next) => {
    const key = getKey(ctx);
    if (!key) {
      await next();
      return;
    }
    const effectiveLimit = resolvePolicy(ctx, "group.historyLimit", limit, 50);
    const buffered = await store.list(key, effectiveLimit);
    ctx.state.history = buffered;
    const entry = {
      senderId: ctx.message.senderId,
      senderName: ctx.message.senderName,
      content: ctx.message.content,
      timestamp: Date.parse(ctx.message.timestamp) || Date.now(),
      messageId: ctx.message.messageId
    };
    try {
      await store.append(key, entry, effectiveLimit);
    } catch (err) {
      ctx.log.error?.(`[history-buffer] append failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ctx.stopped && !recordOnSkip) {
      return;
    }
    await next();
  };
  return m3;
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/typing-indicator.js
var DEFAULT_DURATION_SEC = 60;
var DEFAULT_KEEPALIVE_INTERVAL_MS = 5e4;
function typingIndicator(options = {}) {
  const durationSec = options.durationSec ?? DEFAULT_DURATION_SEC;
  const predicate = options.predicate ?? (() => true);
  const awaitTyping = options.awaitTyping ?? false;
  const keepAlive = options.keepAlive ?? true;
  const keepAliveIntervalMs = options.keepAliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
  return async (ctx, next) => {
    if (ctx.message.kind !== "c2c" || !predicate(ctx)) {
      await next();
      return;
    }
    const sendTyping = () => ctx.bot.sendTyping(ctx.replyTarget, durationSec).catch((err) => {
      ctx.log.debug?.(`[typing] failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    const promise = sendTyping();
    if (awaitTyping) {
      await promise;
    }
    let timer = null;
    if (keepAlive) {
      timer = setInterval(() => {
        sendTyping();
      }, keepAliveIntervalMs);
    }
    try {
      await next();
    } finally {
      if (timer) {
        clearInterval(timer);
      }
    }
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/error-handler.js
var DEFAULT_FORMAT = (err) => {
  if (err instanceof ApiError) {
    if (err.bizMessage)
      return `[QQ ${err.bizCode ?? err.httpStatus}] ${err.bizMessage}`;
    return `[QQ ${err.httpStatus}] ${err.message}`;
  }
  return err.message || "Unknown error";
};
function errorHandler(options = {}) {
  const format = options.format ?? DEFAULT_FORMAT;
  const rethrow = options.rethrow ?? false;
  const filter = options.filter ?? (() => true);
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (!filter(e)) {
        if (rethrow)
          throw e;
        return;
      }
      ctx.log.error?.(`[error-handler] caught: ${e.message}`);
      if (ctx.signal.aborted) { __qqDeadlineLog(ctx, "aborted-error-suppressed"); if (rethrow) throw e; return; }
      try {
        const reply = format(e, ctx);
        if (reply) {
          await ctx.bot.sendText(ctx.replyTarget, reply);
        }
      } catch (sendErr) {
        ctx.log.error?.(`[error-handler] failed to send error reply: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`);
      }
      if (rethrow)
        throw e;
    }
  };
}

// node_modules/@tencent-connect/qqbot-nodejs/dist/storage/kv-store.js
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var FileKVStore = class {
  map = /* @__PURE__ */ new Map();
  filePath;
  saveThrottleMs;
  saveTimer = null;
  dirty = false;
  logger;
  constructor(opts) {
    this.filePath = import_node_path.default.join(opts.dir, opts.fileName ?? "kv-store.json");
    this.saveThrottleMs = opts.saveThrottleMs ?? 1e3;
    this.logger = opts.logger ?? {};
    this.load();
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry)
      return void 0;
    if (entry.expireAt && entry.expireAt <= Date.now()) {
      this.map.delete(key);
      this.scheduleSave();
      return void 0;
    }
    return entry.value;
  }
  set(key, value, ttlMs) {
    this.map.set(key, {
      value,
      expireAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : void 0
    });
    this.scheduleSave();
  }
  delete(key) {
    const removed = this.map.delete(key);
    if (removed)
      this.scheduleSave();
    return removed;
  }
  has(key) {
    return this.get(key) !== void 0;
  }
  keys(prefix) {
    const all = [...this.map.keys()];
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }
  clear(prefix) {
    if (!prefix) {
      this.map.clear();
    } else {
      for (const k of this.map.keys()) {
        if (k.startsWith(prefix))
          this.map.delete(k);
      }
    }
    this.scheduleSave();
  }
  /** Force flush pending writes. Call before process exit. */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      this.doSave();
    }
  }
  // ============ Internal ============
  load() {
    try {
      if (!import_node_fs.default.existsSync(this.filePath))
        return;
      const raw = import_node_fs.default.readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw);
      const now = Date.now();
      for (const [k, e] of Object.entries(data)) {
        if (e.expireAt && e.expireAt <= now)
          continue;
        this.map.set(k, e);
      }
    } catch (err) {
      this.logger.error?.(`[file-kv-store] load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  scheduleSave() {
    this.dirty = true;
    if (this.saveTimer)
      return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.doSave();
    }, this.saveThrottleMs);
  }
  doSave() {
    try {
      import_node_fs.default.mkdirSync(import_node_path.default.dirname(this.filePath), { recursive: true });
      const obj = {};
      for (const [k, e] of this.map)
        obj[k] = e;
      const tmp = this.filePath + ".tmp";
      import_node_fs.default.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
      import_node_fs.default.renameSync(tmp, this.filePath);
      this.dirty = false;
    } catch (err) {
      this.logger.error?.(`[file-kv-store] save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

// node_modules/@tencent-connect/qqbot-nodejs/dist/storage/session-adapter.js
function kvSessionPersistence(opts) {
  const prefix = opts.prefix ?? "qqbot:session:";
  const key = `${prefix}${opts.accountId}`;
  const ttlMs = opts.ttlMs ?? 5 * 60 * 1e3;
  return {
    load() {
      const v = opts.store.get(key);
      if (v && typeof v.then === "function") {
        return null;
      }
      return v ?? null;
    },
    save(session) {
      void opts.store.set(key, session, ttlMs);
    },
    clear() {
      void opts.store.delete(key);
    }
  };
}

// src/gateway/qqbot-gateway.ts
var import_node_os3 = __toESM(require("os"), 1);

// src/request-context.ts
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();
function runWithRequestContext(ctx, fn) {
  return asyncLocalStorage.run(ctx, fn);
}
function getRequestContext() {
  return asyncLocalStorage.getStore();
}
function getRequestTarget() {
  return asyncLocalStorage.getStore()?.target;
}
function getRequestAccountId() {
  return asyncLocalStorage.getStore()?.accountId;
}

// src/utils/plugin-logger.ts
function consoleSink() {
  const C2 = "\x1B[36m", Y = "\x1B[33m", R = "\x1B[31m", G = "\x1B[90m", X = "\x1B[0m";
  return {
    debug: (m3) => console.debug(`${G}[qqbot]${X}`, m3),
    info: (m3) => console.log(`${C2}[qqbot]${X}`, m3),
    warn: (m3) => console.warn(`${Y}[qqbot]${X}`, m3),
    error: (m3) => console.error(`${R}[qqbot]${X}`, m3)
  };
}
function enrichMeta(meta) {
  const ctx = getRequestContext();
  if (!ctx) return meta;
  const trace = {};
  if (ctx.accountId) trace.accountId = ctx.accountId;
  if (ctx.messageId) trace.messageId = ctx.messageId;
  if (ctx.openId) trace.openId = ctx.openId;
  if (Object.keys(trace).length === 0) return meta;
  return meta ? { ...trace, ...meta } : trace;
}
function frameworkSink() {
  const resolve2 = () => {
    try {
      const r = tryGetQQBotRuntime();
      if (r?.logging) {
        const child = r.logging.getChildLogger({ subsystem: "qqbot/core" });
        return {
          debug: child.debug?.bind(child),
          info: child.info.bind(child),
          warn: child.warn.bind(child),
          error: child.error.bind(child)
        };
      }
    } catch {
    }
    return consoleSink();
  };
  return {
    debug: (msg, meta) => resolve2().debug?.(msg, meta),
    info: (msg, meta) => resolve2().info(msg, meta),
    warn: (msg, meta) => resolve2().warn(msg, meta),
    error: (msg, meta) => resolve2().error(msg, meta)
  };
}
function createPluginLogger(opts = {}) {
  const output = opts.output ?? (opts.forceConsole ? consoleSink() : frameworkSink());
  const prefix = opts.prefix ?? "";
  const fmt = (msg) => prefix ? `${prefix} ${msg}` : msg;
  const buildChild = (parentPrefix, tag) => createPluginLogger({
    output,
    prefix: parentPrefix ? `${parentPrefix}[${tag}]` : `[${tag}]`
  });
  return {
    info: (msg, meta) => output.info(fmt(msg), enrichMeta(meta)),
    warn: (msg, meta) => output.warn(fmt(msg), enrichMeta(meta)),
    error: (msg, meta) => output.error(fmt(msg), enrichMeta(meta)),
    debug: (msg, meta) => output.debug(fmt(msg), enrichMeta(meta)),
    child: (tag) => buildChild(prefix, tag)
  };
}

// src/utils/pkg-version.ts
var import_node_path2 = __toESM(require("path"), 1);
var import_node_fs2 = __toESM(require("fs"), 1);
var _cachedOpenclawVersion;
function getPackageVersion() {
  return true ? "2.0.3" : "unknown";
}
function getOpenclawVersion(runtimeVersion) {
  if (_cachedOpenclawVersion) return _cachedOpenclawVersion;
  if (runtimeVersion && runtimeVersion !== "unknown") {
    return _cachedOpenclawVersion = runtimeVersion;
  }
  if (process.env.OPENCLAW_VERSION) {
    return _cachedOpenclawVersion = process.env.OPENCLAW_VERSION;
  }
  if (process.env.OPENCLAW_SERVICE_VERSION) {
    return _cachedOpenclawVersion = process.env.OPENCLAW_SERVICE_VERSION;
  }
  const pkgVer = readOpenclawPackageVersion();
  if (pkgVer) return _cachedOpenclawVersion = pkgVer;
  return "unknown";
}
function readOpenclawPackageVersion() {
  try {
    const dirs = searchRoots();
    for (const dir of dirs) {
      const pkgPath = import_node_path2.default.join(dir, "package.json");
      try {
        const pkg = JSON.parse(import_node_fs2.default.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "openclaw" && pkg.version) return pkg.version;
      } catch {
      }
    }
  } catch {
  }
  return void 0;
}
function searchRoots() {
  const roots = [];
  if (typeof __filename === "string") {
    let dir = import_node_path2.default.dirname(__filename);
    for (let i = 0; i < 10; i++) {
      roots.push(dir);
      const parent = import_node_path2.default.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const key of ["OPENCLAW_STATE_DIR", "CLAWDBOT_STATE_DIR", "MOLTBOT_STATE_DIR"]) {
    const v = process.env[key];
    if (v) {
      roots.push(import_node_path2.default.dirname(v));
      roots.push(import_node_path2.default.resolve(v, ".."));
    }
  }
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  for (const name of ["openclaw", "clawdbot", "moltbot"]) {
    roots.push(import_node_path2.default.join(home, `.${name}`));
  }
  roots.push(process.cwd());
  return [...new Set(roots.filter((r) => typeof r === "string" && r.length > 0))];
}

// src/commands/bot-help.ts
var PLUGIN_VERSION = getPackageVersion();
var GROUP_EXCLUDED = /* @__PURE__ */ new Set([
  "bot-upgrade",
  "bot-clear-storage",
  "bot-logs",
  "bot-approve",
  "bot-group-always",
  "bot-group-allways",
  "bot-streaming",
  "bot-me"
]);
function botHelp(_account, allCommands) {
  return {
    name: "bot-help",
    description: "\u67E5\u770B\u6240\u6709\u6307\u4EE4\u4EE5\u53CA\u7528\u9014",
    usage: [
      "/bot-help",
      "",
      "\u5217\u51FA\u6240\u6709\u53EF\u7528\u7684 QQBot \u63D2\u4EF6\u5185\u7F6E\u6307\u4EE4\u53CA\u5176\u7B80\u8981\u8BF4\u660E\u3002",
      "\u4F7F\u7528 /\u6307\u4EE4\u540D ? \u53EF\u67E5\u770B\u67D0\u6761\u6307\u4EE4\u7684\u8BE6\u7EC6\u7528\u6CD5\u3002"
    ].join("\n"),
    handler: (ctx) => {
      const isGroup = ctx.message.kind === "group";
      const lines = ["### QQBot\u63D2\u4EF6\u5185\u7F6E\u8C03\u8BD5\u6307\u4EE4", ""];
      for (const cmd of allCommands()) {
        const name = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
        if (cmd.hidden) continue;
        if (isGroup && GROUP_EXCLUDED.has(name)) continue;
        if (cmd.authorized && cmd.authorized(ctx) !== true) continue;
        lines.push(`<qqbot-cmd-input text="/${name}" show="/${name}"/> ${cmd.description ?? ""}`);
      }
      lines.push("", `> \u63D2\u4EF6\u7248\u672C v${PLUGIN_VERSION}`);
      return lines.join("\n");
    }
  };
}

// src/commands/bot-ping.ts
function botPing() {
  return {
    name: "bot-ping",
    description: "\u6D4B\u8BD5\u5F53\u524D openclaw \u4E0E QQ \u8FDE\u63A5\u7684\u7F51\u7EDC\u5EF6\u8FDF",
    usage: [
      "/bot-ping",
      "",
      "\u6D4B\u8BD5 OpenClaw \u4E3B\u673A\u4E0E QQ \u670D\u52A1\u5668\u4E4B\u95F4\u7684\u7F51\u7EDC\u5EF6\u8FDF\u3002",
      "\u8FD4\u56DE\u7F51\u7EDC\u4F20\u8F93\u8017\u65F6\u548C\u63D2\u4EF6\u5904\u7406\u8017\u65F6\u3002"
    ].join("\n"),
    handler: (ctx) => {
      const now = Date.now();
      const ts = ctx.message.timestamp;
      const eventTime = ts ? new Date(ts).getTime() : NaN;
      if (isNaN(eventTime)) {
        return "\u2705 pong!";
      }
      const totalMs = now - eventTime;
      const qqToPlugin = ctx.receivedAt - eventTime;
      const pluginProcess = now - ctx.receivedAt;
      return [
        "\u2705 pong\uFF01",
        "",
        `\u23F1 \u5EF6\u8FDF: ${totalMs}ms`,
        `  \u251C \u7F51\u7EDC\u4F20\u8F93: ${qqToPlugin}ms`,
        `  \u2514 \u63D2\u4EF6\u5904\u7406: ${pluginProcess}ms`
      ].join("\n");
    }
  };
}

// src/features/update-checker.ts
var import_node_https = __toESM(require("https"), 1);
var PKG_NAME = "@tencent-connect/openclaw-qqbot";
var ENCODED_PKG = encodeURIComponent(PKG_NAME);
var REGISTRIES = [
  `https://registry.npmjs.org/${ENCODED_PKG}`,
  `https://registry.npmmirror.com/${ENCODED_PKG}`
];
var CURRENT_VERSION = getPackageVersion();
function fetchJson(url, timeoutMs) {
  return new Promise((resolve2, reject) => {
    const req4 = import_node_https.default.get(url, { timeout: timeoutMs, headers: { Accept: "application/json" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve2(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req4.on("error", reject);
    req4.on("timeout", () => {
      req4.destroy();
      reject(new Error(`timeout fetching ${url}`));
    });
  });
}
async function fetchDistTags(log4) {
  for (const url of REGISTRIES) {
    try {
      const json3 = await fetchJson(url, 1e4);
      const tags = json3["dist-tags"];
      if (tags && typeof tags === "object") return tags;
    } catch (e) {
      log4?.debug(`[update-checker] ${url} failed: ${e.message}`);
    }
  }
  throw new Error("all registries failed");
}
function buildUpdateInfo(tags) {
  const currentIsPrerelease = CURRENT_VERSION.includes("-");
  const stableTag = tags.latest || null;
  const alphaTag = tags.alpha || null;
  const compareTarget = currentIsPrerelease ? alphaTag : stableTag;
  const hasUpdate = typeof compareTarget === "string" && compareTarget !== CURRENT_VERSION && compareVersions(compareTarget, CURRENT_VERSION) > 0;
  return {
    current: CURRENT_VERSION,
    latest: compareTarget,
    stable: stableTag,
    alpha: alphaTag,
    hasUpdate,
    checkedAt: Date.now()
  };
}
function triggerUpdateCheck(log4) {
  getUpdateInfo(log4).then((info) => {
    if (info.hasUpdate) {
      log4.info(`[update-checker] new version available: ${info.latest} (current: ${CURRENT_VERSION})`);
    }
  }).catch(() => {
  });
}
async function getUpdateInfo(log4) {
  try {
    const tags = await fetchDistTags(log4);
    return buildUpdateInfo(tags);
  } catch (err) {
    log4?.debug(`[update-checker] check failed: ${err.message}`);
    return { current: CURRENT_VERSION, latest: null, stable: null, alpha: null, hasUpdate: false, checkedAt: Date.now(), error: err.message };
  }
}
function compareVersions(a, b2) {
  const parse = (v) => {
    const clean = v.replace(/^v/, "");
    const [main, pre] = clean.split("-", 2);
    return { parts: main.split(".").map(Number), pre: pre || null };
  };
  const pa = parse(a);
  const pb = parse(b2);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.parts[i] || 0) - (pb.parts[i] || 0);
    if (diff !== 0) return diff;
  }
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && !pb.pre) return 0;
  const aParts = pa.pre.split(".");
  const bParts = pb.pre.split(".");
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aP = aParts[i] ?? "";
    const bP = bParts[i] ?? "";
    const aNum = Number(aP);
    const bNum = Number(bP);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      if (aP < bP) return -1;
      if (aP > bP) return 1;
    }
  }
  return 0;
}

// src/commands/bot-version.ts
var PLUGIN_VERSION2 = getPackageVersion();
var GITHUB_URL = "https://github.com/tencent-connect/openclaw-qqbot";
function botVersion(_account) {
  return {
    name: "bot-version",
    description: "\u67E5\u770B\u63D2\u4EF6\u7248\u672C\u53F7",
    usage: [
      "/bot-version",
      "",
      "\u67E5\u770B\u5F53\u524D QQBot \u63D2\u4EF6\u7248\u672C\u548C OpenClaw \u6846\u67B6\u7248\u672C\u3002",
      "\u540C\u65F6\u68C0\u67E5\u662F\u5426\u6709\u65B0\u7248\u672C\u53EF\u7528\u3002"
    ].join("\n"),
    handler: async () => {
      const frameworkVersion = getOpenClawVersion();
      const lines = [
        `\u{1F99E}\u6846\u67B6\u7248\u672C\uFF1A${frameworkVersion}`,
        `\u{1F916}QQBot \u63D2\u4EF6\u7248\u672C\uFF1Av${PLUGIN_VERSION2}`
      ];
      const info = await getUpdateInfo();
      if (info.checkedAt === 0) {
        lines.push("\u23F3 \u7248\u672C\u68C0\u67E5\u4E2D...");
      } else if (info.error) {
        lines.push("\u26A0\uFE0F \u7248\u672C\u68C0\u67E5\u5931\u8D25");
      } else if (info.hasUpdate && info.latest) {
        lines.push(`\u{1F195}\u6700\u65B0\u53EF\u7528\u7248\u672C\uFF1Av${info.latest}\uFF0C\u70B9\u51FB <qqbot-cmd-input text="/bot-upgrade" show="/bot-upgrade"/> \u67E5\u770B\u5347\u7EA7\u6307\u5F15`);
      }
      lines.push(`\u{1F31F}\u5B98\u65B9 GitHub \u4ED3\u5E93\uFF1A[\u70B9\u51FB\u524D\u5F80](${GITHUB_URL})`);
      return lines.join("\n");
    }
  };
}

// src/commands/bot-me.ts
function botMe() {
  return {
    name: "bot-me",
    description: "\u67E5\u770B\u4F60\u7684 OpenID\uFF08\u4EC5\u79C1\u804A\uFF09",
    usage: `/bot-me

\u67E5\u770B\u4F60\u5728\u5F53\u524D QQBot \u5E94\u7528\u4E0B\u7684\u552F\u4E00 OpenID\u3002
\u6B64 ID \u7528\u4E8E\u7BA1\u7406\u5458\u8BC6\u522B\u3001\u8BBF\u95EE\u63A7\u5236\u7B49\u573A\u666F\u3002`,
    scope: "c2c",
    handler: (ctx) => {
      const senderId = ctx.message.senderId ?? "unknown";
      return `\u{1F194} \u4F60\u7684 OpenID: \`${senderId}\``;
    }
  };
}

// src/commands/config-util.ts
init_resolve();
function checkCommandAuth(ctx) {
  const p2 = ctx.state.policy;
  const mode = p2?.c2cMode ?? "allowlist";
  const allowFrom = p2?.allowFrom ?? [];
  if (mode === "open" || !allowFrom.length || allowFrom.includes("*")) return true;
  return allowFrom.includes(ctx.message.senderId) || "\u26A0\uFE0F \u65E0\u6743\u9650\u6267\u884C\u6B64\u547D\u4EE4";
}
async function resolvePersistFn(getRuntime) {
  const runtime2 = getRuntime();
  if (!runtime2) return ["\u26A0\uFE0F runtime \u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u4FEE\u6539\u914D\u7F6E\u3002", null];
  const adapters = getAdapters(runtime2);
  if (!adapters.persistConfig) {
    return ["\u26A0\uFE0F \u5F53\u524D\u6846\u67B6\u7248\u672C\u4E0D\u652F\u6301\u5728\u7EBF\u4FEE\u6539\u914D\u7F6E\uFF0C\u8BF7\u624B\u52A8\u7F16\u8F91\u914D\u7F6E\u6587\u4EF6\u3002", null];
  }
  return [
    null,
    { persist: (updater) => adapters.persistConfig(updater) }
  ];
}
async function updateAccountConfig(account, getRuntime, updater) {
  const [err, result] = await resolvePersistFn(getRuntime);
  if (err || !result) return err;
  try {
    await result.persist((cfg) => {
      cfg.channels ??= {};
      cfg.channels.qqbot ??= {};
      const qqbot = cfg.channels.qqbot;
      const accountId = account.accountId;
      const isNamedAccount = accountId !== "default" && qqbot.accounts?.[accountId];
      if (isNamedAccount) {
        qqbot.accounts[accountId] ??= {};
        updater(qqbot.accounts[accountId]);
      } else {
        updater(qqbot);
      }
    });
    return null;
  } catch (e) {
    return `\u26A0\uFE0F \u914D\u7F6E\u4FEE\u6539\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`;
  }
}
async function updateGlobalConfig(getRuntime, updater) {
  const [err, result] = await resolvePersistFn(getRuntime);
  if (err || !result) return err;
  try {
    await result.persist(updater);
    return null;
  } catch (e) {
    return `\u26A0\uFE0F \u914D\u7F6E\u4FEE\u6539\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`;
  }
}

// src/commands/bot-upgrade.ts
var PLUGIN_VERSION3 = getPackageVersion();
var DEFAULT_UPGRADE_URL = "https://docs.qq.com/doc/DSGxOZk1oVnVKVkpq";
var GITHUB_URL2 = "https://github.com/tencent-connect/openclaw-qqbot";
function botUpgrade(account) {
  return {
    name: "bot-upgrade",
    description: "\u68C0\u67E5\u66F4\u65B0\u5E76\u67E5\u770B\u5347\u7EA7\u6307\u5F15",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: [
      "/bot-upgrade              \u68C0\u67E5\u662F\u5426\u6709\u65B0\u7248\u672C"
    ].join("\n"),
    handler: async () => {
      const url = account.config.upgradeUrl ?? DEFAULT_UPGRADE_URL;
      const info = await getUpdateInfo();
      if (info.checkedAt === 0) {
        return "\u23F3 \u7248\u672C\u68C0\u67E5\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5";
      }
      if (info.error) {
        return [
          "\u274C \u4E3B\u673A\u7F51\u7EDC\u8BBF\u95EE\u5F02\u5E38\uFF0C\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0",
          "",
          `\u67E5\u770B\u5347\u7EA7\u6307\u5F15\uFF1A[\u70B9\u51FB\u67E5\u770B](${url})`
        ].join("\n");
      }
      if (!info.hasUpdate) {
        return [
          `\u2705 \u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C v${PLUGIN_VERSION3}`,
          "",
          `\u9879\u76EE\u5730\u5740\uFF1A[GitHub](${GITHUB_URL2})`
        ].join("\n");
      }
      return [
        "\u{1F195} \u53D1\u73B0\u65B0\u7248\u672C",
        "",
        `\u5F53\u524D\u7248\u672C\uFF1A**v${PLUGIN_VERSION3}**`,
        `\u6700\u65B0\u7248\u672C\uFF1A**v${info.latest}**`,
        "",
        `\u{1F4D6} \u5347\u7EA7\u6307\u5F15\uFF1A[\u70B9\u51FB\u67E5\u770B](${url})`,
        `\u{1F31F} \u5B98\u65B9 GitHub \u4ED3\u5E93\uFF1A[\u70B9\u51FB\u524D\u5F80](${GITHUB_URL2})`
      ].join("\n");
    }
  };
}

// src/commands/bot-streaming.ts
function botStreaming(account, getRuntime) {
  return {
    name: "bot-streaming",
    description: "\u4E00\u952E\u5F00\u5173\u6D41\u5F0F\u6D88\u606F",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: `/bot-streaming

\u67E5\u770B\u5F53\u524D\u6D41\u5F0F\u6D88\u606F\u72B6\u6001\uFF0C\u6216\u5207\u6362\u5F00/\u5173\u3002
\u6D41\u5F0F\u6D88\u606F\u4EC5\u652F\u6301 C2C\uFF08\u79C1\u804A\uFF09\u573A\u666F\u3002`,
    handler: async (ctx) => {
      const args = (Array.isArray(ctx.command.args) ? ctx.command.args.join(" ") : String(ctx.command.args ?? "")).trim().toLowerCase();
      const streaming = account.config?.streaming;
      const currentEnabled = typeof streaming === "boolean" ? streaming : streaming?.mode !== "off";
      if (!args) {
        const status = currentEnabled ? "\u2705 \u5DF2\u542F\u7528" : "\u274C \u672A\u542F\u7528";
        const toggleHint = currentEnabled ? '<qqbot-cmd-input text="/bot-streaming off" show="\u5173\u95ED\u6D41\u5F0F"/>' : '<qqbot-cmd-input text="/bot-streaming on" show="\u5F00\u542F\u6D41\u5F0F"/>';
        return [
          `\u{1F30A} \u6D41\u5F0F\u6D88\u606F\u72B6\u6001: ${status}`,
          "",
          "\u6D41\u5F0F\u6D88\u606F\u4EC5\u652F\u6301 C2C\uFF08\u79C1\u804A\uFF09\u573A\u666F\u3002",
          `\u70B9\u51FB ${toggleHint} \u5207\u6362\u3002`
        ].join("\n");
      }
      const targetEnabled = args === "on" || args === "1" || args === "true";
      if (targetEnabled === currentEnabled) {
        return `\u2139\uFE0F \u6D41\u5F0F\u6D88\u606F\u5DF2\u7ECF\u662F${currentEnabled ? "\u5F00\u542F" : "\u5173\u95ED"}\u72B6\u6001\uFF0C\u65E0\u9700\u5207\u6362\u3002`;
      }
      const error = await updateAccountConfig(account, getRuntime, (acfg) => {
        acfg.streaming = { mode: targetEnabled ? "partial" : "off" };
      });
      if (error) return error;
      account.config.streaming = { mode: targetEnabled ? "partial" : "off" };
      return targetEnabled ? "\u2705 \u6D41\u5F0F\u6D88\u606F\u5DF2\u5F00\u542F\uFF0C\u79C1\u804A\u6D88\u606F\u5C06\u4EE5\u6D41\u5F0F\u65B9\u5F0F\u53D1\u9001\u3002" : "\u2705 \u6D41\u5F0F\u6D88\u606F\u5DF2\u5173\u95ED\uFF0C\u79C1\u804A\u6D88\u606F\u5C06\u4EE5\u9759\u6001\u65B9\u5F0F\u53D1\u9001\u3002";
    }
  };
}

// src/commands/bot-clear-storage.ts
var import_node_fs3 = __toESM(require("fs"), 1);
var import_node_path3 = __toESM(require("path"), 1);
var import_node_os = __toESM(require("os"), 1);

// src/utils/platform.ts
var os = __toESM(require("os"), 1);
var path4 = __toESM(require("path"), 1);
var fs6 = __toESM(require("fs"), 1);
function getHomeDir() {
  try {
    const home = os.homedir();
    if (home && fs6.existsSync(home)) return home;
  } catch {
  }
  const envHome = process.env.HOME || process.env.USERPROFILE;
  if (envHome && fs6.existsSync(envHome)) return envHome;
  return os.tmpdir();
}
function getQQBotDataDir(...subPaths) {
  const dir = path4.join(getHomeDir(), ".openclaw", "qqbot", ...subPaths);
  if (!fs6.existsSync(dir)) {
    fs6.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function getQQBotMediaDir(...subPaths) {
  const dir = path4.join(getHomeDir(), ".openclaw", "media", "qqbot", ...subPaths);
  if (!fs6.existsSync(dir)) {
    fs6.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// src/commands/bot-clear-storage.ts
var MAX_DISPLAY = 10;
function scanFiles(dirPath) {
  const files = [];
  if (!import_node_fs3.default.existsSync(dirPath)) return files;
  const walk = (dir) => {
    let entries;
    try {
      entries = import_node_fs3.default.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = import_node_path3.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          files.push({ filePath: full, size: import_node_fs3.default.statSync(full).size });
        } catch {
        }
      }
    }
  };
  walk(dirPath);
  return files.sort((a, b2) => b2.size - a.size);
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function botClearStorage(_account) {
  const targetDir = getQQBotMediaDir("downloads");
  const displayDir = targetDir.replace(import_node_os.default.homedir(), "~");
  return {
    name: "bot-clear-storage",
    description: "\u6E05\u7406\u901A\u8FC7QQBot\u5BF9\u8BDD\u4EA7\u751F\u7684\u6587\u4EF6\u4EE5\u53CA\u4E0B\u8F7D\u7684\u8D44\u6E90",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: [
      "/bot-clear-storage",
      "",
      "\u626B\u63CF\u5F53\u524D\u673A\u5668\u4EBA\u4EA7\u751F\u7684\u4E0B\u8F7D\u6587\u4EF6\u5E76\u5217\u51FA\u660E\u7EC6\u3002",
      "\u786E\u8BA4\u540E\u6267\u884C\u5220\u9664\uFF0C\u91CA\u653E\u4E3B\u673A\u78C1\u76D8\u7A7A\u95F4\u3002",
      "",
      "/bot-clear-storage --force   \u786E\u8BA4\u6267\u884C\u6E05\u7406",
      "",
      "\u26A0\uFE0F \u4EC5\u5728\u79C1\u804A\u4E2D\u53EF\u7528\u3002"
    ].join("\n"),
    handler: (ctx) => {
      const isForce = ctx.command.raw?.trim() === "--force";
      if (!isForce) {
        const files2 = scanFiles(targetDir);
        if (files2.length === 0) {
          return `\u2705 \u5F53\u524D\u6CA1\u6709\u9700\u8981\u6E05\u7406\u7684\u6587\u4EF6

\u76EE\u5F55 \`${displayDir}\` \u4E3A\u7A7A\u6216\u4E0D\u5B58\u5728\u3002`;
        }
        const totalSize = files2.reduce((s, f) => s + f.size, 0);
        const lines = [
          `\u5373\u5C06\u6E05\u7406 \`${displayDir}\` \u4E0B\u6240\u6709\u6587\u4EF6\uFF0C\u5171 ${files2.length} \u4E2A\uFF0C\u5360\u7528 ${formatSize(totalSize)}\u3002`,
          "",
          `\u6587\u4EF6\u6982\u51B5\uFF1A`
        ];
        for (const f of files2.slice(0, MAX_DISPLAY)) {
          const rel = import_node_path3.default.relative(targetDir, f.filePath).replace(/\\/g, "/");
          lines.push(`  ${rel} (${formatSize(f.size)})`);
        }
        if (files2.length > MAX_DISPLAY) {
          lines.push(`  ...\u5171 ${files2.length} \u4E2A\u6587\u4EF6 (${formatSize(totalSize)})`);
        }
        lines.push("", "---", "", "\u786E\u8BA4\u6E05\u7406\u540E\u6587\u4EF6\u5C06\u6C38\u4E45\u5220\u9664\uFF0C\u540E\u7EED AI \u65E0\u6CD5\u627E\u56DE\u3002", '\u203C\uFE0F <qqbot-cmd-enter text="/bot-clear-storage --force" />');
        return lines.join("\n");
      }
      const files = scanFiles(targetDir);
      if (files.length === 0) {
        return "\u2705 \u6CA1\u6709\u9700\u8981\u6E05\u7406\u7684\u6587\u4EF6\u3002";
      }
      let deleted = 0;
      let failed = 0;
      for (const f of files) {
        try {
          import_node_fs3.default.unlinkSync(f.filePath);
          deleted++;
        } catch {
          failed++;
        }
      }
      const parts = [`\u{1F5D1}\uFE0F \u5DF2\u5220\u9664 ${deleted} \u4E2A\u6587\u4EF6`];
      if (failed > 0) parts.push(`\uFF0C${failed} \u4E2A\u5931\u8D25`);
      parts.push(`
\u{1F4C1} \`${displayDir}\``);
      try {
        import_node_fs3.default.rmdirSync(targetDir);
      } catch {
      }
      return parts.join("");
    }
  };
}

// src/commands/bot-logs.ts
var import_node_fs4 = __toESM(require("fs"), 1);
var import_node_path4 = __toESM(require("path"), 1);
var import_node_os2 = __toESM(require("os"), 1);
var import_node_crypto = __toESM(require("crypto"), 1);
init_resolve();
var MAX_LINES_PER_FILE = 1e3;
var MAX_FILES = 4;
var LOG_KEYWORDS = ["gateway", "openclaw", "clawdbot", "moltbot"];
var LOG_PATTERN = new RegExp(LOG_KEYWORDS.join("|"), "i");
function getConfiguredLogFiles(runtime2) {
  const files = [];
  try {
    const cfg = getAdapters(runtime2).getConfig?.() ?? {};
    const logFile = cfg?.logging?.file;
    if (typeof logFile === "string") {
      files.push(import_node_path4.default.resolve(logFile));
    }
  } catch {
  }
  return files;
}
function collectCandidateLogDirs(runtime2) {
  const homeDir = import_node_os2.default.homedir();
  const dirs = /* @__PURE__ */ new Set();
  const pushDir = (p2) => {
    if (!p2) return;
    try {
      dirs.add(import_node_path4.default.resolve(p2));
    } catch {
    }
  };
  const pushStateDir = (stateDir) => {
    if (!stateDir) return;
    pushDir(stateDir);
    pushDir(import_node_path4.default.join(stateDir, "logs"));
  };
  for (const logFile of getConfiguredLogFiles(runtime2)) {
    pushDir(import_node_path4.default.dirname(logFile));
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (/STATE_DIR$/i.test(key) && /(OPENCLAW|CLAWDBOT|MOLTBOT)/i.test(key)) {
      pushStateDir(value);
    }
  }
  for (const name of LOG_KEYWORDS) {
    pushDir(import_node_path4.default.join(homeDir, `.${name}`));
    pushDir(import_node_path4.default.join(homeDir, `.${name}`, "logs"));
    pushDir(import_node_path4.default.join(homeDir, name));
    pushDir(import_node_path4.default.join(homeDir, name, "logs"));
  }
  const searchRoots2 = /* @__PURE__ */ new Set([homeDir, process.cwd(), import_node_path4.default.dirname(process.cwd())]);
  if (process.env.APPDATA) searchRoots2.add(process.env.APPDATA);
  if (process.env.LOCALAPPDATA) searchRoots2.add(process.env.LOCALAPPDATA);
  for (const root of searchRoots2) {
    try {
      const entries = import_node_fs4.default.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const re = LOG_PATTERN;
        if (!re.test(entry.name)) continue;
        const base = import_node_path4.default.join(root, entry.name);
        pushDir(base);
        pushDir(import_node_path4.default.join(base, "logs"));
      }
    } catch {
    }
  }
  if (process.platform !== "win32") {
    for (const name of LOG_KEYWORDS) {
      pushDir(import_node_path4.default.join("/var/log", name));
    }
  }
  if (process.platform === "win32") {
    pushDir("C:\\tmp");
    if (process.env.TEMP) pushDir(process.env.TEMP);
    if (process.env.TMP) pushDir(process.env.TMP);
    if (process.env.LOCALAPPDATA) pushDir(import_node_path4.default.join(process.env.LOCALAPPDATA, "Temp"));
  } else {
    pushDir("/tmp");
  }
  for (const name of LOG_KEYWORDS) {
    pushDir(import_node_path4.default.join("/tmp", name));
    if (process.platform === "win32" && process.env.TEMP) {
      pushDir(import_node_path4.default.join(process.env.TEMP, name));
    }
  }
  const pm2Home = process.env.PM2_HOME ?? import_node_path4.default.join(homeDir, ".pm2");
  pushDir(import_node_path4.default.join(pm2Home, "logs"));
  return Array.from(dirs);
}
function collectRecentLogFiles(logDirs, runtime2) {
  const candidates = [];
  const dedupe = /* @__PURE__ */ new Set();
  const pushFile = (filePath, sourceDir) => {
    const normalized = import_node_path4.default.resolve(filePath);
    if (dedupe.has(normalized)) return;
    try {
      const stat = import_node_fs4.default.statSync(normalized);
      if (!stat.isFile() || stat.size === 0) return;
      dedupe.add(normalized);
      candidates.push({ filePath: normalized, sourceDir, mtime: stat.mtimeMs });
    } catch {
    }
  };
  for (const logFile of getConfiguredLogFiles(runtime2)) {
    pushFile(logFile, import_node_path4.default.dirname(logFile));
  }
  for (const dir of logDirs) {
    for (const name of ["gateway.log", "gateway.err.log", "openclaw.log", "clawdbot.log", "moltbot.log"]) {
      pushFile(import_node_path4.default.join(dir, name), dir);
    }
    try {
      const entries = import_node_fs4.default.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(log|txt)$/i.test(entry.name)) continue;
        const re = LOG_PATTERN;
        if (!re.test(entry.name)) continue;
        pushFile(import_node_path4.default.join(dir, entry.name), dir);
      }
    } catch {
    }
  }
  return candidates.sort((a, b2) => b2.mtime - a.mtime);
}
function botLogs(runtime2) {
  return {
    name: "bot-logs",
    description: "\u5BFC\u51FA\u672C\u5730\u65E5\u5FD7\u6587\u4EF6",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: [
      "/bot-logs",
      "",
      `\u5BFC\u51FA\u6700\u8FD1\u7684 OpenClaw \u65E5\u5FD7\u6587\u4EF6\uFF08\u6700\u591A ${MAX_FILES} \u4E2A\uFF09\u3002`,
      `\u6BCF\u4E2A\u6587\u4EF6\u6700\u591A\u4FDD\u7559\u6700\u540E ${MAX_LINES_PER_FILE} \u884C\uFF0C\u4EE5\u6587\u4EF6\u5F62\u5F0F\u8FD4\u56DE\u3002`
    ].join("\n"),
    handler: async (ctx) => {
      const logDirs = collectCandidateLogDirs(runtime2);
      const recentFiles = collectRecentLogFiles(logDirs, runtime2).slice(0, MAX_FILES);
      if (recentFiles.length === 0) {
        const existingDirs = logDirs.filter((d3) => {
          try {
            return import_node_fs4.default.existsSync(d3);
          } catch {
            return false;
          }
        });
        const searched = existingDirs.length > 0 ? existingDirs.map((d3) => `  \u2022 ${d3}`).join("\n") : logDirs.map((d3) => `  \u2022 ${d3}`).join("\n");
        return [
          "\u26A0\uFE0F \u672A\u627E\u5230\u65E5\u5FD7\u6587\u4EF6",
          "",
          "\u5DF2\u641C\u7D22\u4EE5\u4E0B\u8DEF\u5F84\uFF1A",
          searched
        ].join("\n");
      }
      const lines = [];
      let totalIncluded = 0;
      let totalOriginal = 0;
      let truncatedCount = 0;
      for (const logFile of recentFiles) {
        try {
          const content = import_node_fs4.default.readFileSync(logFile.filePath, "utf8");
          const allLines = content.split("\n");
          const tail = allLines.slice(-MAX_LINES_PER_FILE);
          if (tail.length > 0) {
            const fileName = import_node_path4.default.basename(logFile.filePath);
            lines.push(`
== ${fileName} (last ${tail.length}/${allLines.length}) ==`);
            lines.push(...tail);
            totalIncluded += tail.length;
            totalOriginal += allLines.length;
            if (allLines.length > MAX_LINES_PER_FILE) truncatedCount++;
          }
        } catch {
        }
      }
      if (lines.length === 0) {
        return "\u26A0\uFE0F \u627E\u5230\u65E5\u5FD7\u6587\u4EF6\u4F46\u8BFB\u53D6\u5931\u8D25";
      }
      const tmpDir = getQQBotMediaDir("exports");
      if (!import_node_fs4.default.existsSync(tmpDir)) import_node_fs4.default.mkdirSync(tmpDir, { recursive: true });
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = import_node_crypto.default.randomBytes(4).toString("hex");
      const tmpFile = import_node_path4.default.join(tmpDir, `bot-logs-${timestamp}-${suffix}.txt`);
      import_node_fs4.default.writeFileSync(tmpFile, lines.join("\n"), "utf8");
      let summary = `${recentFiles.length} \u4E2A\u65E5\u5FD7\u6587\u4EF6\uFF0C\u5171 ${totalIncluded} \u884C`;
      if (truncatedCount > 0) summary += `\uFF08${truncatedCount} \u4E2A\u622A\u65AD\uFF0C\u539F\u59CB ${totalOriginal} \u884C\uFF09`;
      try {
        const senderId = ctx.message.senderId;
        if (senderId) {
          await ctx.bot.sendFile(
            { scope: "c2c", targetId: senderId, msgId: ctx.message.messageId },
            { localPath: tmpFile },
            { fileName: `bot-logs-${timestamp}-${suffix}.txt` }
          );
        }
      } catch (err) {
        return `\u{1F4CB} ${summary}
\u26A0\uFE0F \u6587\u4EF6\u53D1\u9001\u5931\u8D25\uFF1A${err instanceof Error ? err.message : err}
\u{1F4CE} ${tmpFile}`;
      }
      return `\u{1F4CB} ${summary}`;
    }
  };
}

// src/commands/bot-approve.ts
init_resolve();
var PRESETS = {
  on: { security: "allowlist", ask: "on-miss", desc: "\u5F00\u542F\u5BA1\u6279\uFF08\u767D\u540D\u5355\u6A21\u5F0F\uFF09" },
  off: { security: "full", ask: "off", desc: "\u5173\u95ED\u5BA1\u6279" },
  always: { security: "allowlist", ask: "always", desc: "\u4E25\u683C\u6A21\u5F0F\uFF08\u6BCF\u6B21\u90FD\u5BA1\u6279\uFF09" }
};
function formatStatus(security, ask) {
  const secIcon = security === "full" ? "\u{1F7E2}" : security === "allowlist" ? "\u{1F7E1}" : "\u{1F534}";
  const askIcon = ask === "off" ? "\u{1F7E2}" : ask === "always" ? "\u{1F534}" : "\u{1F7E1}";
  const desc = security === "deny" ? "\u26A0\uFE0F \u5F53\u524D\u4E3A deny \u6A21\u5F0F\uFF0C\u6240\u6709\u547D\u4EE4\u6267\u884C\u88AB\u62D2\u7EDD" : security === "full" && ask === "off" ? "\u2705 \u6240\u6709\u547D\u4EE4\u65E0\u9700\u5BA1\u6279\u76F4\u63A5\u6267\u884C" : security === "allowlist" && ask === "on-miss" ? "\u{1F6E1}\uFE0F \u767D\u540D\u5355\u547D\u4EE4\u76F4\u63A5\u6267\u884C\uFF0C\u5176\u4F59\u9700\u5BA1\u6279" : ask === "always" ? "\u{1F512} \u6BCF\u6B21\u547D\u4EE4\u6267\u884C\u90FD\u9700\u8981\u4EBA\u5DE5\u5BA1\u6279" : `\u2139\uFE0F security=${security}, ask=${ask}`;
  return [
    "\u{1F510} \u5F53\u524D\u5BA1\u6279\u914D\u7F6E",
    "",
    `${secIcon} \u5B89\u5168\u6A21\u5F0F (security): **${security}**`,
    `${askIcon} \u5BA1\u6279\u6A21\u5F0F (ask): **${ask}**`,
    "",
    desc
  ].join("\n");
}
function menuText() {
  return [
    "\u{1F510} \u547D\u4EE4\u6267\u884C\u5BA1\u6279\u914D\u7F6E",
    "",
    '<qqbot-cmd-input text="/bot-approve on" show="/bot-approve on"/> \u5F00\u542F\u5BA1\u6279\uFF08\u767D\u540D\u5355\u6A21\u5F0F\uFF09',
    '<qqbot-cmd-input text="/bot-approve off" show="/bot-approve off"/> \u5173\u95ED\u5BA1\u6279',
    '<qqbot-cmd-input text="/bot-approve always" show="/bot-approve always"/> \u4E25\u683C\u6A21\u5F0F',
    '<qqbot-cmd-input text="/bot-approve reset" show="/bot-approve reset"/> \u6062\u590D\u9ED8\u8BA4',
    '<qqbot-cmd-input text="/bot-approve status" show="/bot-approve status"/> \u67E5\u770B\u5F53\u524D\u914D\u7F6E'
  ].join("\n");
}
function botApprove(getRuntime) {
  return {
    name: "bot-approve",
    description: "\u7BA1\u7406\u547D\u4EE4\u6267\u884C\u5BA1\u6279\u914D\u7F6E",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: [
      "/bot-approve            \u67E5\u770B\u64CD\u4F5C\u6307\u5F15",
      "/bot-approve on         \u5F00\u542F\u5BA1\u6279\uFF08\u767D\u540D\u5355\u6A21\u5F0F\uFF0C\u63A8\u8350\uFF09",
      "/bot-approve off        \u5173\u95ED\u5BA1\u6279\uFF0C\u547D\u4EE4\u76F4\u63A5\u6267\u884C",
      "/bot-approve always     \u59CB\u7EC8\u5BA1\u6279\uFF0C\u6BCF\u6B21\u6267\u884C\u90FD\u9700\u5BA1\u6279",
      "/bot-approve reset      \u6062\u590D\u6846\u67B6\u9ED8\u8BA4\u503C",
      "/bot-approve status     \u67E5\u770B\u5F53\u524D\u5BA1\u6279\u914D\u7F6E"
    ].join("\n"),
    handler: async (ctx) => {
      const arg = (Array.isArray(ctx.command.args) ? ctx.command.args.join(" ") : String(ctx.command.args ?? "")).trim().toLowerCase();
      const runtime2 = getRuntime();
      if (!runtime2) {
        return "\u26A0\uFE0F runtime \u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u7BA1\u7406\u5BA1\u6279\u914D\u7F6E\u3002";
      }
      const adapters = getAdapters(runtime2);
      const loadExecConfig = () => {
        const cfg = adapters.getConfig?.() ?? {};
        const tools = cfg.tools ?? {};
        const exec = tools.exec ?? {};
        return {
          security: String(exec.security ?? "deny"),
          ask: String(exec.ask ?? "on-miss")
        };
      };
      if (!arg) {
        return menuText();
      }
      if (arg === "status") {
        const { security, ask } = loadExecConfig();
        return [
          formatStatus(security, ask),
          "",
          '<qqbot-cmd-input text="/bot-approve on" show="/bot-approve on"/> \u5F00\u542F\u5BA1\u6279',
          '<qqbot-cmd-input text="/bot-approve off" show="/bot-approve off"/> \u5173\u95ED\u5BA1\u6279',
          '<qqbot-cmd-input text="/bot-approve always" show="/bot-approve always"/> \u4E25\u683C\u6A21\u5F0F',
          '<qqbot-cmd-input text="/bot-approve reset" show="/bot-approve reset"/> \u6062\u590D\u9ED8\u8BA4'
        ].join("\n");
      }
      const preset = PRESETS[arg];
      if (preset) {
        const error = await updateGlobalConfig(getRuntime, (cfg) => {
          cfg.tools ??= {};
          cfg.tools.exec ??= {};
          cfg.tools.exec.security = preset.security;
          cfg.tools.exec.ask = preset.ask;
        });
        if (error) return error;
        if (arg === "on") {
          return ["\u2705 \u5BA1\u6279\u5DF2\u5F00\u542F", "", "\u2022 security = allowlist", "\u2022 ask = on-miss", "", "\u5DF2\u6279\u51C6\u7684\u547D\u4EE4\u81EA\u52A8\u52A0\u5165\u767D\u540D\u5355\uFF0C\u4E0B\u6B21\u76F4\u63A5\u6267\u884C\u3002"].join("\n");
        }
        if (arg === "off") {
          return ["\u2705 \u5BA1\u6279\u5DF2\u5173\u95ED", "", "\u2022 security = full", "\u2022 ask = off", "", "\u26A0\uFE0F \u6240\u6709\u547D\u4EE4\u5C06\u76F4\u63A5\u6267\u884C\uFF0C\u4E0D\u4F1A\u5F39\u51FA\u5BA1\u6279\u786E\u8BA4\u3002"].join("\n");
        }
        return ["\u2705 \u5DF2\u5207\u6362\u4E3A\u4E25\u683C\u5BA1\u6279\u6A21\u5F0F", "", "\u2022 security = allowlist", "\u2022 ask = always", "", "\u6BCF\u4E2A\u547D\u4EE4\u90FD\u4F1A\u5F39\u51FA\u5BA1\u6279\u6309\u94AE\uFF0C\u9700\u624B\u52A8\u786E\u8BA4\u3002"].join("\n");
      }
      if (arg === "reset") {
        const error = await updateGlobalConfig(getRuntime, (cfg) => {
          const exec = cfg.tools?.exec;
          if (exec) {
            delete exec.security;
            delete exec.ask;
            if (Object.keys(exec).length === 0) delete cfg.tools.exec;
            if (cfg.tools && Object.keys(cfg.tools).length === 0) delete cfg.tools;
          }
        });
        if (error) return error;
        return ["\u2705 \u5BA1\u6279\u914D\u7F6E\u5DF2\u91CD\u7F6E", "", "\u5DF2\u79FB\u9664 tools.exec.security \u548C tools.exec.ask", "\u6846\u67B6\u5C06\u4F7F\u7528\u9ED8\u8BA4\u503C\uFF08security=deny, ask=on-miss\uFF09", "", "\u5982\u9700\u5F00\u542F\u547D\u4EE4\u6267\u884C\uFF0C\u8BF7\u4F7F\u7528 /bot-approve on"].join("\n");
      }
      return [
        `\u274C \u672A\u77E5\u53C2\u6570: ${arg}`,
        "",
        "\u53EF\u7528\u9009\u9879: on | off | always | reset | status"
      ].join("\n");
    }
  };
}

// src/commands/bot-group-always.ts
function botGroupAlways(account, getRuntime) {
  return {
    name: ["bot-group-always", "bot-group-allways"],
    description: "\u4FEE\u6539\u7FA4\u6D88\u606F\u9ED8\u8BA4\u54CD\u5E94\u6A21\u5F0F",
    scope: "c2c",
    authorized: checkCommandAuth,
    usage: [
      "/bot-group-always on   AI \u81EA\u4E3B\u5224\u65AD\u4F55\u65F6\u53D1\u8A00\uFF08\u65E0\u9700 @\uFF09",
      "/bot-group-always off  \u4EC5\u5728\u88AB @ \u65F6\u56DE\u590D",
      "/bot-group-always      \u67E5\u770B\u5F53\u524D\u8BBE\u7F6E",
      "",
      "\u8BBE\u4E3A on \u540E\uFF0CAI \u4F1A\u81EA\u4E3B\u5224\u65AD\u6BCF\u6761\u6D88\u606F\u662F\u5426\u9700\u8981\u56DE\u590D\uFF08\u65E0\u9700 @\uFF09\u3002",
      "\u4ECD\u53EF\u901A\u8FC7 groups.{groupId}.requireMention \u5BF9\u5355\u4E2A\u7FA4\u8986\u76D6\u3002"
    ].join("\n"),
    handler: async (ctx) => {
      const arg = (Array.isArray(ctx.command.args) ? ctx.command.args.join(" ") : String(ctx.command.args ?? "")).trim().toLowerCase();
      const currentRequireMention = account.config.defaultRequireMention ?? true;
      if (!arg) {
        return [
          `\u{1F916} \u7FA4\u81EA\u4E3B\u53D1\u8A00\u72B6\u6001\uFF1A${currentRequireMention ? "\u274C \u4EC5\u88AB @ \u65F6\u56DE\u590D" : "\u2705 \u81EA\u4E3B\u5224\u65AD\u4F55\u65F6\u53D1\u8A00"}`,
          `\u4F7F\u7528 <qqbot-cmd-input text="/bot-group-always on" show="/bot-group-always on"/> \u8BBE\u4E3A\u81EA\u4E3B\u53D1\u8A00`,
          `\u4F7F\u7528 <qqbot-cmd-input text="/bot-group-always off" show="/bot-group-always off"/> \u8BBE\u4E3A\u4EC5\u88AB @ \u65F6\u56DE\u590D`
        ].join("\n");
      }
      if (arg !== "on" && arg !== "off") {
        return "\u274C \u53C2\u6570\u9519\u8BEF\uFF0C\u8BF7\u4F7F\u7528 on \u6216 off\n\n\u793A\u4F8B\uFF1A/bot-group-always on";
      }
      const newRequireMention = arg === "off";
      if (newRequireMention === currentRequireMention) {
        return `\u{1F916} \u7FA4\u81EA\u4E3B\u53D1\u8A00\u5DF2\u7ECF\u662F"${arg}"\u72B6\u6001\uFF0C\u65E0\u9700\u64CD\u4F5C`;
      }
      const error = await updateAccountConfig(account, getRuntime, (acfg) => {
        acfg.defaultRequireMention = newRequireMention;
      });
      if (error) return error;
      account.config.defaultRequireMention = newRequireMention;
      return [
        `\u2705 \u7FA4\u81EA\u4E3B\u53D1\u8A00\u5DF2\u8BBE\u7F6E\u4E3A ${newRequireMention ? "**off**\uFF08\u4EC5\u88AB @ \u65F6\u56DE\u590D\uFF09" : "**on**\uFF08AI \u81EA\u4E3B\u5224\u65AD\u4F55\u65F6\u53D1\u8A00\uFF09"}`,
        "",
        newRequireMention ? "\u4EC5\u5728\u88AB @ \u673A\u5668\u4EBA\u624D\u4F1A\u56DE\u590D\u3002" : "AI \u5C06\u81EA\u4E3B\u5224\u65AD\u7FA4\u6D88\u606F\u662F\u5426\u9700\u8981\u56DE\u590D\uFF0C\u65E0\u9700\u88AB @ \u5373\u53EF\u53D1\u8A00\u3002"
      ].join("\n");
    }
  };
}

// src/adapter/pairing.ts
var import_node_module = require("module");
var import_node_path5 = __toESM(require("path"), 1);
var _api;
function getPairingApi() {
  if (_api !== void 0) return _api;
  _api = loadPairingApi();
  return _api;
}
function loadPairingApi() {
  const currentFile = __filename;
  const req4 = (0, import_node_module.createRequire)(currentFile);
  const pluginRoot = import_node_path5.default.resolve(import_node_path5.default.dirname(currentFile), "..", "..");
  const fs21 = req4("node:fs");
  const tryLoad = (root) => {
    for (const rel of ["dist/plugin-sdk/conversation-runtime.js", "plugin-sdk/conversation-runtime.js"]) {
      const p2 = import_node_path5.default.join(root, rel);
      try {
        if (fs21.existsSync(p2)) return req4(p2);
      } catch {
      }
    }
    return null;
  };
  let mod = null;
  try {
    const { findOpenclawRoot } = req4(import_node_path5.default.join(pluginRoot, "scripts", "link-sdk-core.cjs"));
    const root = findOpenclawRoot(pluginRoot);
    if (root) mod = tryLoad(root);
  } catch {
  }
  if (!mod) {
    try {
      const entry = process.argv[1];
      if (entry) {
        const realEntry = fs21.realpathSync(entry);
        let dir = import_node_path5.default.dirname(realEntry);
        for (let i = 0; i < 6; i++) {
          mod = tryLoad(dir);
          if (mod) break;
          const parent = import_node_path5.default.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
    } catch {
    }
  }
  if (!mod?.readChannelAllowFromStore) return null;
  return {
    // readChannelAllowFromStore(channel, env?, accountId?) — 位置参数
    readAllowFromStore: (params) => mod.readChannelAllowFromStore(params.channel, void 0, params.accountId),
    // upsertChannelPairingRequest({ channel, id, accountId }) — 对象参数
    issueChallenge: (params) => mod.upsertChannelPairingRequest({
      channel: params.channel,
      id: params.id,
      accountId: params.accountId
    }).then((r) => ({ code: r.code })),
    // buildPairingReply({ channel, idLine, code }) — 对象参数
    buildReply: (params) => mod.buildPairingReply({
      channel: params.channel,
      idLine: "",
      // qqbot 无额外 ID 信息，留空即可
      code: params.code
    }),
    // approveChannelPairingCode({ channel, code, accountId? }) — 对象参数
    approveCode: (params) => mod.approveChannelPairingCode({
      channel: params.channel,
      code: params.code,
      accountId: params.accountId
    })
  };
}

// src/commands/bot-pairing.ts
function botPairing(_getRuntime) {
  return {
    name: "bot-pairing",
    description: "\u7BA1\u7406 DM \u914D\u5BF9\u5BA1\u6279",
    scope: "c2c",
    hidden: true,
    usage: `/bot-pairing approve <code>

\u6279\u51C6\u6307\u5B9A\u914D\u5BF9\u7801\uFF0C\u5141\u8BB8\u5BF9\u5E94\u7528\u6237\u79C1\u804A\u673A\u5668\u4EBA\u3002
\u914D\u5BF9\u7801\u7531\u7528\u6237\u9996\u6B21\u79C1\u804A\u65F6\u81EA\u52A8\u751F\u6210\u3002`,
    authorized: checkCommandAuth,
    handler: async (ctx) => {
      const args = (Array.isArray(ctx.command.args) ? ctx.command.args.join(" ") : String(ctx.command.args ?? "")).trim();
      const parts = args.split(/\s+/);
      const subCmd = parts[0]?.toLowerCase();
      const code = parts[1]?.trim();
      if (subCmd !== "approve" || !code) {
        return "\u26A0\uFE0F \u7528\u6CD5: /bot-pairing approve <\u914D\u5BF9\u7801>";
      }
      const api = getPairingApi();
      if (!api) {
        return "\u26A0\uFE0F \u5F53\u524D OpenClaw \u7248\u672C\u4E0D\u652F\u6301\u914D\u5BF9\u5BA1\u6279\u529F\u80FD\u3002";
      }
      try {
        const result = await api.approveCode({
          channel: "qqbot",
          code
        });
        if (!result?.id) {
          return [
            `\u26A0\uFE0F \u914D\u5BF9\u7801 \`${code}\` \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\u3002`,
            "",
            "\u6BCF\u4E2A\u914D\u5BF9\u7801\u6709\u6548\u671F\u4E3A 1 \u5C0F\u65F6\u3002"
          ].join("\n");
        }
        return [
          "\u2705 \u5DF2\u6279\u51C6\u7528\u6237\u8BBF\u95EE\u3002",
          "",
          `\u7528\u6237 ID: \`${result.id}\``
        ].join("\n");
      } catch (err) {
        return `\u274C \u5BA1\u6279\u5931\u8D25: ${err.message}`;
      }
    }
  };
}

// src/commands/index.ts
function buildCommandList(account, opts) {
  const commands = [];
  const help = botHelp(account, () => commands);
  commands.push(
    help,
    botPing(),
    botVersion(account),
    botMe(),
    botUpgrade(account),
    botLogs(opts.getRuntime()),
    botStreaming(account, opts.getRuntime),
    botClearStorage(account),
    botApprove(opts.getRuntime),
    botGroupAlways(account, opts.getRuntime),
    botPairing(opts.getRuntime)
  );
  return commands;
}

// src/middleware/attachment.ts
var path13 = __toESM(require("path"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/reply-limiter.js
var DEFAULT_TTL_MS = 60 * 60 * 1e3;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/media-tags.js
var VALID_TAGS = ["qqimg", "qqvoice", "qqvideo", "qqfile", "qqmedia"];
var TAG_ALIASES = {
  qq_img: "qqimg",
  qqimage: "qqimg",
  qq_image: "qqimg",
  qqpic: "qqimg",
  qq_pic: "qqimg",
  qqpicture: "qqimg",
  qq_picture: "qqimg",
  qqphoto: "qqimg",
  qq_photo: "qqimg",
  img: "qqimg",
  image: "qqimg",
  pic: "qqimg",
  picture: "qqimg",
  photo: "qqimg",
  qq_voice: "qqvoice",
  qqaudio: "qqvoice",
  qq_audio: "qqvoice",
  voice: "qqvoice",
  audio: "qqvoice",
  qq_video: "qqvideo",
  video: "qqvideo",
  qq_file: "qqfile",
  qqdoc: "qqfile",
  qq_doc: "qqfile",
  file: "qqfile",
  doc: "qqfile",
  document: "qqfile",
  qq_media: "qqmedia",
  media: "qqmedia",
  attachment: "qqmedia",
  attach: "qqmedia",
  qqattachment: "qqmedia",
  qq_attachment: "qqmedia",
  qqsend: "qqmedia",
  qq_send: "qqmedia",
  send: "qqmedia"
};
var ALL_TAG_NAMES = [...VALID_TAGS, ...Object.keys(TAG_ALIASES)];
ALL_TAG_NAMES.sort((a, b2) => b2.length - a.length);
var TAG_NAME_PATTERN = ALL_TAG_NAMES.join("|");
var LEFT_BRACKET = "(?:[<\uFF1C<]|&lt;)";
var RIGHT_BRACKET = "(?:[>\uFF1E>]|&gt;)";
var SELF_CLOSING_TAG_REGEX = new RegExp("`?" + LEFT_BRACKET + "\\s*(" + TAG_NAME_PATTERN + `)(?:\\s+(?!file|src|path|url)[a-z_-]+\\s*=\\s*["']?[^"'\\s\uFF1C<>\uFF1E>]*?["']?)*\\s+(?:file|src|path|url)\\s*=\\s*["']?([^"'\\s>\uFF1E]+?)["']?(?:\\s+[a-z_-]+\\s*=\\s*["']?[^"'\\s\uFF1C<>\uFF1E>]*?["']?)*\\s*/?\\s*` + RIGHT_BRACKET + "`?", "gi");
var FUZZY_MEDIA_TAG_REGEX = new RegExp("`?" + LEFT_BRACKET + "\\s*(" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + `["']?\\s*([^<\uFF1C<\uFF1E>"'\`]+?)\\s*["']?` + LEFT_BRACKET + "\\s*/?\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + "`?", "gi");
var MULTILINE_TAG_CLEANUP = new RegExp("(" + LEFT_BRACKET + "\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + ")([\\s\\S]*?)(" + LEFT_BRACKET + "\\s*/?\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + ")", "gi");

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/ref-index-store.js
var import_node_fs5 = __toESM(require("fs"), 1);
var DEFAULT_TTL_MS2 = 7 * 24 * 60 * 60 * 1e3;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/session-store.js
var import_node_fs6 = __toESM(require("fs"), 1);
var import_node_path6 = __toESM(require("path"), 1);
var DEFAULT_EXPIRE_MS = 5 * 60 * 1e3;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/text-parsing.js
var MAX_FACE_EXT_BYTES = 64 * 1024;

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/media-source.js
var fs11 = __toESM(require("fs"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/image-size.js
var import_node_buffer = require("buffer");

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/ffmpeg.js
var import_node_child_process = require("child_process");
var fs12 = __toESM(require("fs"), 1);
var path9 = __toESM(require("path"), 1);

// node_modules/@tencent-connect/qqbot-nodejs/dist/protocol/utils/audio.js
var import_node_child_process2 = require("child_process");
var fs13 = __toESM(require("fs"), 1);
var path10 = __toESM(require("path"), 1);
var _silkWasmPromise = null;
function loadSilkWasm() {
  if (_silkWasmPromise) {
    return _silkWasmPromise;
  }
  _silkWasmPromise = (async () => {
    try {
      const mod = await import("silk-wasm");
      return mod;
    } catch {
      return null;
    }
  })();
  return _silkWasmPromise;
}
function lowerExt(p2) {
  return path10.extname(p2).toLowerCase();
}
function pcmToWav(pcmData, sampleRate, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;
  const buffer = Buffer.alloc(fileSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength).copy(buffer, headerSize);
  return buffer;
}
function stripAmrHeader(buf) {
  const AMR_HEADER = Buffer.from("#!AMR\n");
  if (buf.length > 6 && buf.subarray(0, 6).equals(AMR_HEADER)) {
    return buf.subarray(6);
  }
  return buf;
}
async function convertSilkToWav(inputPath, outputDir) {
  if (!fs13.existsSync(inputPath)) {
    return null;
  }
  const fileBuf = fs13.readFileSync(inputPath);
  const strippedBuf = stripAmrHeader(fileBuf);
  const rawData = new Uint8Array(strippedBuf.buffer, strippedBuf.byteOffset, strippedBuf.byteLength);
  const silk = await loadSilkWasm();
  if (!silk || !silk.isSilk(rawData)) {
    return null;
  }
  const sampleRate = 24e3;
  const result = await silk.decode(rawData, sampleRate);
  const wavBuffer = pcmToWav(result.data, sampleRate);
  const dir = outputDir || path10.dirname(inputPath);
  if (!fs13.existsSync(dir)) {
    fs13.mkdirSync(dir, { recursive: true });
  }
  const baseName = path10.basename(inputPath, path10.extname(inputPath));
  const wavPath = path10.join(dir, `${baseName}.wav`);
  fs13.writeFileSync(wavPath, wavBuffer);
  return { wavPath, duration: result.duration };
}
function isVoiceAttachment(att) {
  if (att.content_type === "voice" || att.content_type?.startsWith("audio/")) {
    return true;
  }
  const ext = att.filename ? lowerExt(att.filename) : "";
  return [".amr", ".silk", ".slk", ".slac"].includes(ext);
}

// src/utils/stt.ts
var fs14 = __toESM(require("fs"), 1);
var path11 = __toESM(require("path"), 1);
function resolveSTTConfig(cfg) {
  const channels = asRecord(cfg.channels);
  const qqbot = asRecord(channels?.qqbot);
  const sttCfg = asRecord(qqbot?.stt);
  if (sttCfg?.enabled === false) {
    return null;
  }
  const models = asRecord(cfg.models);
  const providers = asRecord(models?.providers);
  if (sttCfg) {
    const providerId = readString(sttCfg, "provider") ?? "openai";
    const providerCfg = asRecord(providers?.[providerId]);
    const baseUrl = readString(sttCfg, "baseUrl") ?? readString(providerCfg, "baseUrl");
    const apiKey = readString(sttCfg, "apiKey") ?? readString(providerCfg, "apiKey");
    const model = readString(sttCfg, "model") ?? "whisper-1";
    if (baseUrl && apiKey) {
      return { enabled: true, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
    }
  }
  const tools = asRecord(cfg.tools);
  const media = asRecord(tools?.media);
  const audio = asRecord(media?.audio);
  const audioModels = audio?.models;
  const audioModelEntry = Array.isArray(audioModels) ? asRecord(audioModels[0]) : void 0;
  if (audioModelEntry) {
    const providerId = readString(audioModelEntry, "provider") ?? "openai";
    const providerCfg = asRecord(providers?.[providerId]);
    const baseUrl = readString(audioModelEntry, "baseUrl") ?? readString(providerCfg, "baseUrl");
    const apiKey = readString(audioModelEntry, "apiKey") ?? readString(providerCfg, "apiKey");
    const model = readString(audioModelEntry, "model") ?? "whisper-1";
    if (baseUrl && apiKey) {
      return { enabled: true, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
    }
  }
  return null;
}
async function transcribeAudio(audioPath, cfg) {
  const sttCfg = resolveSTTConfig(cfg);
  if (!sttCfg) {
    return null;
  }
  const fileBuffer = fs14.readFileSync(audioPath);
  const fileName = sanitizeFileName2(path11.basename(audioPath));
  const mime = guessMimeType(fileName);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: mime }), fileName);
  form.append("model", sttCfg.model);
  const resp = await fetch(`${sttCfg.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sttCfg.apiKey}` },
    body: form
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`STT failed (HTTP ${resp.status}): ${detail.slice(0, 300)}`);
  }
  const result = await resp.json();
  return result.text?.trim() || null;
}
function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return void 0;
}
function readString(obj, key) {
  const val = obj?.[key];
  if (typeof val === "string" && val.trim()) {
    return val.trim();
  }
  return void 0;
}
function sanitizeFileName2(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function guessMimeType(fileName) {
  const ext = path11.extname(fileName).toLowerCase();
  const mimeMap = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".silk": "audio/silk",
    ".amr": "audio/amr",
    ".pcm": "audio/pcm"
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

// src/utils/voice-text.ts
function formatVoiceText2(transcripts) {
  if (transcripts.length === 0) {
    return "";
  }
  if (transcripts.length === 1) {
    const t = transcripts[0];
    const durationStr = t.duration ? ` (${formatDuration2(t.duration)})` : "";
    return `[Voice message${durationStr}] ${t.text}`;
  }
  return transcripts.map((t, i) => {
    const durationStr = t.duration ? ` (${formatDuration2(t.duration)})` : "";
    return `[Voice ${i + 1}${durationStr}] ${t.text}`;
  }).join("\n");
}
function formatDuration2(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// src/adapter/media.ts
var import_node_module2 = require("module");
var dns = __toESM(require("dns"), 1);
var path12 = __toESM(require("path"), 1);
var fs15 = __toESM(require("fs"), 1);
var crypto5 = __toESM(require("crypto"), 1);
var req = (0, import_node_module2.createRequire)(__filename);
var _save;
function downloadRemoteMedia(opts) {
  if (_save === void 0) {
    try {
      const mod = req("openclaw/plugin-sdk/media-runtime");
      _save = mod.saveRemoteMedia;
    } catch {
      _save = null;
    }
  }
  return _save ? _save(opts) : downloadViaFetch(opts);
}
var PRIVATE_RANGES = [
  [0x0A000000n, 8],
  // 10.0.0.0/8
  [0xAC100000n, 12],
  // 172.16.0.0/12
  [0xC0A80000n, 16],
  // 192.168.0.0/16
  [0x7F000000n, 8],
  // 127.0.0.0/8
  [0xA9FE0000n, 16],
  // 169.254.0.0/16
  [0xE0000000n, 4]
  // 224.0.0.0/4 (multicast)
];
function ipToBigInt(ip) {
  return ip.split(".").reduce((acc, octet) => acc << 8n | BigInt(Number(octet)), 0n);
}
function isPrivateIP(ip) {
  const val = ipToBigInt(ip);
  return PRIVATE_RANGES.some(([mask, prefix]) => val >> 32n - BigInt(prefix) === mask >> 32n - BigInt(prefix));
}
async function assertSafeHostname(hostname) {
  const addresses = await dns.promises.resolve4(hostname).catch(() => []);
  if (addresses.length === 0) throw new Error(`DNS resolution failed: ${hostname}`);
  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error(`SSRF blocked: ${hostname} resolves to private IP ${addr}`);
    }
  }
}
async function downloadViaFetch(opts) {
  const parsed = new URL(opts.url);
  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS allowed: ${parsed.protocol}`);
  }
  await assertSafeHostname(parsed.hostname);
  const dir = getQQBotMediaDir(opts.subdir ?? "downloads");
  if (!fs15.existsSync(dir)) fs15.mkdirSync(dir, { recursive: true });
  const resp = await fetch(opts.url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12e4)
  });
  if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`);
  const maxBytes = opts.maxBytes ?? 500 * 1024 * 1024;
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`Download exceeds ${(maxBytes / 1024 / 1024).toFixed(0)}MB`);
  const ext = opts.originalFilename ? path12.extname(opts.originalFilename) || ".bin" : ".bin";
  const name = opts.originalFilename ? path12.basename(opts.originalFilename, path12.extname(opts.originalFilename)) : "download";
  const rand = crypto5.randomBytes(4).toString("hex");
  const filePath = path12.join(dir, `${name}_${Date.now()}_${rand}${ext}`);
  fs15.writeFileSync(filePath, buf);
  return { path: filePath };
}

// src/middleware/attachment.ts
init_resolve();
function attachmentProcessor(opts) {
  return async (ctx, next) => {
    const msg = ctx.message;
    // Merge stamps override transport data. Single-message stamps derive only from the host envelope.
    const attachments = (msg.attachments ?? []).map((att,i) => ({ ...att, __qqSource: ctx.state.__qqMergedSources ? att.__qqSource : { senderId:msg.senderId, senderName:msg.senderName, messageId:msg.messageId, attachmentIndex:i } }));
    if (attachments?.length) {
      const runtime2 = opts.getRuntime();
      const adapters = getAdapters(runtime2);
      const cfg = adapters.getConfig?.() ?? {};
      const log4 = ctx.log;
      const result = await processAttachments(attachments, cfg, log4);
      if (result.voiceText || result.imageUrls.length > 0 || result.otherInfo || result.localMediaPaths.length > 0) {
        ctx.state.processedAttachments = result;
      }
    }
    await next();
  };
}
async function processAttachments(attachments, cfg, log4) {
  const sttCfg = resolveSTTConfig(cfg);
  const audioPolicy = resolveAudioPolicy(cfg);
  const imageUrls = [];
  const otherParts = [];
  const transcripts = [];
  const localMediaPaths = [];
  const localMediaTypes = [];
  const remoteMediaUrls = [];
  const tasks = attachments.map(async (att) => {
    const source = att.__qqSource;
    const isVoice = isVoiceAttachment(att);
    const isImage = att.content_type?.startsWith("image/");
    const url = normalizeUrl(att.url);
    if (isImage && url) {
      const localPath = await downloadMediaFile(url, att.filename, log4);
      return { type: "image", localPath, url, contentType: att.content_type ?? "image/png", source };
    }
    if (isVoice) {
      const transcript = await processVoiceAttachment(att, sttCfg, audioPolicy, log4);
      return { type: "voice", transcript, contentType:__qqVoiceContentType(att,transcript), source };
    }
    if (url) {
      const localPath = await downloadMediaFile(url, att.filename, log4);
      return { type: "other", localPath, url, filename: att.filename ?? att.content_type, contentType:att.content_type ?? "application/octet-stream", source };
    }
    return { type: "other", localPath: null, url: "", filename: att.filename ?? att.content_type, source };
  });
  const results = await Promise.all(tasks);
  const orderedMediaFacts = results.flatMap((result, sourceIndex) => {
    const localPath = result.localPath ?? result.transcript?.localPath;
    const url = result.url ?? result.transcript?.remoteUrl;
    if (!localPath && !url) return [];
    const contentType = result.contentType ?? "application/octet-stream";
    return [{ ...(localPath ? { path:localPath, localPath } : { url }), contentType, messageId:result.source?.messageId, sourceIndex, source:result.source }];
  });
  for (const result of results) {
    if (result.type === "image") {
      if (result.localPath) {
        imageUrls.push(result.localPath);
        localMediaPaths.push(result.localPath);
        localMediaTypes.push(result.contentType);
      } else {
        imageUrls.push(result.url);
        remoteMediaUrls.push(result.url);
      }
    } else if (result.type === "voice") {
      transcripts.push(result.transcript);
      if (result.transcript.localPath) {
        localMediaPaths.push(result.transcript.localPath);
        localMediaTypes.push(result.contentType);
      } else if (result.transcript.remoteUrl) {
        remoteMediaUrls.push(result.transcript.remoteUrl);
      }
    } else if (result.type === "other") {
      if (result.localPath) {
        otherParts.push(`[Attachment: ${result.localPath}]`);
        localMediaPaths.push(result.localPath);
        localMediaTypes.push("application/octet-stream");
      } else {
        otherParts.push(`[Attachment: ${result.filename}]`);
      }
    }
  }
  return {
    voiceText: formatVoiceText2(transcripts),
    imageUrls,
    otherInfo: otherParts.join("\n"),
    transcripts,
    localMediaPaths,
    localMediaTypes,
    remoteMediaUrls,
    orderedMediaFacts
  };
}
async function processVoiceAttachment(att, sttCfg, audioPolicy, log4) {
  const asrReferText = att.asr_refer_text?.trim() || void 0;
  const remoteUrl = normalizeUrl(att.voice_wav_url) || normalizeUrl(att.url) || void 0;
  if (!sttCfg) {
    if (asrReferText) {
      log4?.debug?.(`Voice: using asr_refer_text (STT not configured)`);
      return { text: asrReferText, source: "asr", asrReferText, remoteUrl };
    }
    return {
      text: "[Voice message - transcription unavailable]",
      source: "fallback",
      asrReferText,
      remoteUrl
    };
  }
  let localPath;
  let duration;
  try {
    const wavUrl = normalizeUrl(att.voice_wav_url);
    if (wavUrl) {
      const downloaded = await downloadMediaFile(wavUrl, void 0, log4);
      if (downloaded) {
        localPath = downloaded;
        log4?.debug?.(`Voice: downloaded WAV from voice_wav_url`);
      }
    }
    if (!localPath) {
      const silkUrl = normalizeUrl(att.url);
      if (silkUrl) {
        const silkPath = await downloadMediaFile(silkUrl, att.filename, log4);
        if (silkPath) {
          const ext = path13.extname(silkPath).toLowerCase();
          if (audioPolicy.sttDirectFormats.includes(ext)) {
            localPath = silkPath;
          } else {
            const wavResult = await convertSilkToWav(silkPath);
            if (wavResult) {
              localPath = wavResult.wavPath;
              duration = wavResult.duration / 1e3;
              log4?.debug?.(`Voice: SILK\u2192WAV (${formatDuration2(duration)})`);
            } else {
              localPath = silkPath;
            }
          }
        }
      }
    }
  } catch (err) {
    log4?.error(`Voice download/convert failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (localPath) {
    try {
      const transcript = await transcribeAudio(localPath, cfg2stt(sttCfg));
      if (transcript) {
        log4?.debug?.(`Voice STT: ${transcript.slice(0, 80)}...`);
        return { text: transcript, source: "stt", duration, localPath, remoteUrl, asrReferText };
      }
    } catch (err) {
      log4?.error(`Voice STT failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (asrReferText) {
    return { text: asrReferText, source: "asr", duration, localPath, remoteUrl, asrReferText };
  }
  return {
    text: "[Voice message - transcription failed]",
    source: "fallback",
    duration,
    localPath,
    remoteUrl,
    asrReferText
  };
}
function resolveAudioPolicy(cfg) {
  const channels = cfg.channels;
  const qqbot = channels?.qqbot;
  const policy = qqbot?.audioFormatPolicy;
  return {
    sttDirectFormats: normalizeFormats(policy?.sttDirectFormats ?? []),
    uploadDirectFormats: normalizeFormats(
      policy?.uploadDirectFormats ?? qqbot?.voiceDirectUploadFormats ?? [".wav", ".mp3", ".silk"]
    ),
    transcodeEnabled: policy?.transcodeEnabled !== false
  };
}
function normalizeFormats(formats) {
  return formats.map((f) => {
    const lower = f.toLowerCase().trim();
    return lower.startsWith(".") ? lower : `.${lower}`;
  });
}
function cfg2stt(sttCfg) {
  return { channels: { qqbot: { stt: sttCfg } } };
}
function normalizeUrl(url) {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}
async function downloadMediaFile(url, filename, log4) {
  if (!url.startsWith("https://")) {
    log4?.debug?.(`Skipping non-HTTPS URL: ${url.slice(0, 80)}`);
    return null;
  }
  try {
    const result = await downloadRemoteMedia({
      url,
      subdir: "qqbot/downloads",
      originalFilename: filename,
      maxBytes: 500 * 1024 * 1024,
      timeoutMs: 12e4
    });
    log4?.debug?.(`Downloaded: ${result.path}`);
    return result.path;
  } catch (err) {
    log4?.error(`Download failed: ${url.slice(0, 80)} \u2014 ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// src/dispatch/body-assembler.ts
init_resolve();
var QUOTE_BEGIN = "[Quoted message begins]";
var QUOTE_END = "[Quoted message ends]";
var REF_BEGIN = "[Reference message begins]";
var REF_END = "[Reference message ends]";
var HISTORY_BEGIN = "[Chat history begins]";
var HISTORY_END = "[Chat history ends]";
var MERGE_CTX_BEGIN = "[Merged messages begins]";
var MERGE_CTX_END = "[Merged messages ends]";
var CURRENT_MSG = "[Current message]";
function assembleBody(ctx, msg, account, getRuntime) {
  const rawBody = msg.content ?? "";
  const isGroup = msg.kind === "group";
  const mentionState = ctx.state.mention;
  const wasMentioned = mentionState?.wasMentioned ?? false;
  const processed = ctx.state.processedAttachments;
  const quote = ctx.state.quote;
  const history = ctx.state.history;
  const mergedMessages = ctx.state.mergedMessages;
  const userContent = buildUserContent(ctx.message.content ?? "", processed);
  const quotePart = buildQuotePart(quote);
  const userMessage = mergedMessages && mergedMessages.length > 0 ? buildMergedUserMessage({ messages: mergedMessages, quotePart, isGroup, wasMentioned, getRuntime }) : buildUserMessage({ msg, userContent, quotePart, isGroup, wasMentioned });
  const dynamicCtx = buildDynamicCtx(processed, msg, quote);
  const agentBody = buildAgentBody({
    userContent,
    base: dynamicCtx + userMessage,
    isGroup,
    wasMentioned,
    history
  });
  const bodyContent = mergedMessages && mergedMessages.length > 0 ? userMessage : `${quotePart}${userContent}`;
  const webBody = getRuntime ? renderWebBody(getRuntime, bodyContent, msg, isGroup) : bodyContent;
  const systemPrompt = account.systemPrompt?.trim() || void 0;
  return { webBody, agentBody, rawBody, systemPrompt };
}
function buildUserContent(sanitizedRaw, processed) {
  const sanitized = sanitizedRaw.trim();
  const voiceText = processed?.voiceText ?? "";
  const attachmentInfo = processed?.otherInfo ? `
${processed.otherInfo}` : "";
  if (voiceText) {
    return (sanitized ? `${sanitized}
${voiceText}` : voiceText) + attachmentInfo;
  }
  return sanitized + attachmentInfo;
}
function buildQuotePart(quote) {
  if (!quote) return "";
  const text = quote.text || "Original content unavailable";
  return `${QUOTE_BEGIN}
${text}
${QUOTE_END}
${CURRENT_MSG}
`;
}
function buildUserMessage(input) {
  const { msg, userContent, quotePart, isGroup, wasMentioned } = input;
  const atYouTag = isGroup && wasMentioned ? " (@you)" : "";
  if (isGroup) {
    const senderLabel = formatSenderLabel(msg.senderName, msg.senderId);
    return `${quotePart}[${senderLabel}] ${userContent}${atYouTag}`;
  }
  return `${quotePart}${userContent}`;
}
function buildMergedUserMessage(input) {
  const { messages, quotePart, isGroup, wasMentioned, getRuntime } = input;
  if (messages.length <= 1) {
    const single = messages[0];
    return buildUserMessage({
      msg: single.message,
      userContent: single.message.content ?? "",
      quotePart,
      isGroup,
      wasMentioned
    });
  }
  const formatEnvelope = getRuntime ? getAdapters(getRuntime()).formatEnvelope : null;
  const lines = messages.map((ctx, i) => {
    const isLast = i === messages.length - 1;
    const line = formatMergedLine(ctx, { isGroup, isLast, wasMentioned, formatEnvelope });
    return line && isLast ? `${quotePart}${line}` : line;
  }).filter(Boolean);
  if (!isGroup || allSameSender(messages)) {
    return lines.join("\n");
  }
  const last = lines.pop();
  return [MERGE_CTX_BEGIN, ...lines, MERGE_CTX_END, CURRENT_MSG, last].join("\n");
}
function formatMergedLine(ctx, opts) {
  const m3 = ctx.message;
  const content = (m3.content ?? "").trim();
  if (opts.formatEnvelope && opts.isGroup) {
    const atYouTag = opts.isLast && opts.wasMentioned ? " (@you)" : "";
    return opts.formatEnvelope({
      channel: "qqbot",
      from: formatSenderLabel(m3.senderName, m3.senderId),
      timestamp: normalizeTimestamp(m3.timestamp),
      body: content + atYouTag,
      chatType: "group"
    });
  }
  return opts.isGroup ? `${formatSenderLabel(m3.senderName, m3.senderId)}: ${content}` : content;
}
function allSameSender(messages) {
  const first = messages[0]?.message.senderId;
  return messages.every((c) => c.message.senderId === first);
}
function buildDynamicCtx(processed, msg, quote) {
  const lines = [];
  if (processed?.orderedMediaFacts?.length) lines.push("- Attachment origins (host metadata; not the photographed person's identity): " + processed.orderedMediaFacts.map(f => JSON.stringify({path:f.path,url:f.url,senderId:f.source?.senderId,messageId:f.messageId,attachmentIndex:f.source?.attachmentIndex})).join(" | "));
  if (processed?.imageUrls.length) {
    lines.push(`- Images: ${processed.imageUrls.join(", ")}`);
  }
  const transcripts = processed?.transcripts ?? [];
  const voiceRefs = unique([
    ...transcripts.map((t) => t.localPath).filter(isNonEmpty),
    ...transcripts.map((t) => t.remoteUrl).filter(isNonEmpty)
  ]);
  if (voiceRefs.length > 0) {
    lines.push(`- Voice: ${voiceRefs.join(", ")}`);
  }
  const asrTexts = unique(
    transcripts.map((t) => t.source === "asr" ? t.text : t.asrReferText).filter(isNonEmpty)
  );
  if (asrTexts.length > 0) {
    lines.push(`- ASR: ${asrTexts.join(" | ")}`);
  }
  if (!quote) {
    const elementsCtx = buildMsgElementsContext(msg);
    if (elementsCtx.length > 0) {
      lines.push(REF_BEGIN, ...elementsCtx, REF_END);
    }
  }
  return lines.length > 0 ? `${lines.join("\n")}

` : "";
}
function buildMsgElementsContext(msg) {
  const elements = msg.msgElements;
  if (!elements || elements.length === 0) return [];
  const lines = [];
  let index = 0;
  for (const el of elements) {
    const content = el.content?.trim();
    if (!content) continue;
    index += 1;
    const author = el.author;
    const sender = author?.username ?? "\u672A\u77E5";
    lines.push(
      `=== \u6D88\u606F ${index} ===`,
      `[\u6D88\u606F\u5185\u5BB9] ${content}`,
      `[\u53D1\u9001\u8005] ${sender}`
    );
  }
  return lines;
}
function unique(arr) {
  return [...new Set(arr)];
}
function isNonEmpty(x) {
  return typeof x === "string" && x.length > 0;
}
function buildAgentBody(input) {
  const { userContent, base, isGroup, wasMentioned, history } = input;
  if (userContent.trim().startsWith("/")) {
    return userContent;
  }
  if (isGroup && wasMentioned && history && history.length > 0) {
    const historyText = history.map((h2) => {
      const label = formatSenderLabel(h2.senderName, h2.senderId);
      return `[${label}] ${h2.content}`;
    }).join("\n");
    return [HISTORY_BEGIN, historyText, "", HISTORY_END, CURRENT_MSG, base].join("\n");
  }
  return base;
}
function formatSenderLabel(name, id) {
  if (!name) return id;
  return name.includes(id) ? name : `${name} (${id})`;
}
function renderWebBody(getRuntime, bodyContent, msg, isGroup) {
  try {
    const { formatEnvelope } = getAdapters(getRuntime());
    if (!formatEnvelope) return bodyContent;
    return formatEnvelope({
      channel: "qqbot",
      from: msg.senderName ?? msg.senderId,
      timestamp: normalizeTimestamp(msg.timestamp),
      body: bodyContent,
      chatType: isGroup ? "group" : "direct"
    });
  } catch {
    return bodyContent;
  }
}
function normalizeTimestamp(ts) {
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const d3 = new Date(ts).getTime();
    if (!Number.isNaN(d3)) return d3;
  }
  return Date.now();
}

// src/features/ref-index-store.ts
var import_node_fs7 = __toESM(require("fs"), 1);
var import_node_path7 = __toESM(require("path"), 1);
var log = createPluginLogger({ prefix: "[ref-index]" });
var DEFAULT_MAX_ENTRIES = 5e4;
var DEFAULT_FILENAME = "ref-index.jsonl";
var COMPACT_RATIO = 2;
var MIN_MAX_ENTRIES = 100;
var PersistedRefIndexStore = class {
  memory = /* @__PURE__ */ new Map();
  maxEntries;
  filePath;
  /** 当前磁盘累计写入的行数（用于 compact 阈值判断） */
  diskLineCount = 0;
  /** 是否已成功初始化（磁盘回放完成） */
  initialized = false;
  /** 串行化写入，防止并发 append 撕裂行 */
  writeChain = Promise.resolve();
  constructor(options = {}) {
    this.maxEntries = Math.max(options.maxEntries ?? DEFAULT_MAX_ENTRIES, MIN_MAX_ENTRIES);
    this.filePath = options.filePath ?? import_node_path7.default.join(getQQBotDataDir("data"), DEFAULT_FILENAME);
    this.init();
  }
  /**
   * 初始化：按时间顺序回放 JSONL 重建内存 LRU
   */
  init() {
    try {
      if (!import_node_fs7.default.existsSync(this.filePath)) {
        this.initialized = true;
        return;
      }
      const raw = import_node_fs7.default.readFileSync(this.filePath, "utf8");
      const lines = raw.split("\n").filter((l3) => l3.length > 0);
      this.diskLineCount = lines.length;
      const parsed = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj?.k && obj?.v) {
            parsed.push(obj);
          }
        } catch {
        }
      }
      parsed.sort((a, b2) => a.t - b2.t);
      for (const { k, v } of parsed) {
        this.touchMemory(k, v);
      }
      if (this.diskLineCount > this.maxEntries * COMPACT_RATIO) {
        this.compactSync();
      }
    } catch (err) {
      log.error(
        `init failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      this.initialized = true;
    }
  }
  // ── RefIndexStore 接口 ──
  get(key) {
    return this.memory.get(key);
  }
  set(key, entry) {
    this.touchMemory(key, entry);
    this.writeChain = this.writeChain.then(() => this.appendToDisk(key, entry));
  }
  // ── 内部：内存 LRU 维护 ──
  touchMemory(key, entry) {
    if (this.memory.has(key)) {
      this.memory.delete(key);
    } else if (this.memory.size >= this.maxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== void 0) {
        this.memory.delete(oldest);
      }
    }
    this.memory.set(key, entry);
  }
  // ── 内部：磁盘追加 + compact ──
  async appendToDisk(key, entry) {
    const line = { k: key, v: entry, t: Date.now() };
    const text = JSON.stringify(line) + "\n";
    try {
      await import_node_fs7.default.promises.appendFile(this.filePath, text, "utf8");
      this.diskLineCount += 1;
      if (this.diskLineCount > this.maxEntries * COMPACT_RATIO) {
        await this.compact();
      }
    } catch (err) {
      log.error(
        `append failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  /**
   * 异步 compact：将内存 LRU 状态完整重写到磁盘，丢弃历史冗余。
   */
  async compact() {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const now = Date.now();
      const lines = [];
      for (const [k, v] of this.memory.entries()) {
        lines.push(JSON.stringify({ k, v, t: now }));
      }
      const content = lines.length > 0 ? lines.join("\n") + "\n" : "";
      await import_node_fs7.default.promises.writeFile(tmpPath, content, "utf8");
      await import_node_fs7.default.promises.rename(tmpPath, this.filePath);
      this.diskLineCount = lines.length;
      log.info(
        `compacted to ${lines.length} entries`
      );
    } catch (err) {
      log.error(
        `compact failed: ${err instanceof Error ? err.message : String(err)}`
      );
      try {
        await import_node_fs7.default.promises.unlink(tmpPath);
      } catch {
      }
    }
  }
  /**
   * 同步 compact（仅 init 阶段使用，避免回放后立刻保留巨大磁盘文件）
   */
  compactSync() {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const now = Date.now();
      const lines = [];
      for (const [k, v] of this.memory.entries()) {
        lines.push(JSON.stringify({ k, v, t: now }));
      }
      const content = lines.length > 0 ? lines.join("\n") + "\n" : "";
      import_node_fs7.default.writeFileSync(tmpPath, content, "utf8");
      import_node_fs7.default.renameSync(tmpPath, this.filePath);
      this.diskLineCount = lines.length;
    } catch (err) {
      log.error(
        `compactSync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  // ── 诊断 ──
  /** 当前内存中的条目数 */
  get size() {
    return this.memory.size;
  }
  /** 是否已完成初始化（磁盘回放） */
  get isInitialized() {
    return this.initialized;
  }
  /** 诊断快照 */
  stats() {
    return {
      memoryEntries: this.memory.size,
      diskLines: this.diskLineCount,
      maxEntries: this.maxEntries,
      filePath: this.filePath
    };
  }
  /**
   * 强制将当前内存状态持久化到磁盘（进程退出前调用）
   */
  flush() {
    this.compactSync();
  }
};
var stores = /* @__PURE__ */ new Map();
function getPersistedRefIndexStore(accountId) {
  let store = stores.get(accountId);
  if (!store) {
    const filePath = import_node_path7.default.join(getQQBotDataDir("data", accountId), DEFAULT_FILENAME);
    store = new PersistedRefIndexStore({ filePath });
    stores.set(accountId, store);
  }
  return store;
}
function flushAllRefIndexStores() {
  for (const store of stores.values()) {
    store.flush();
  }
}

// src/middleware/policy-injector.ts
init_config();
function createPolicyInjector(account) {
  return async (ctx, next) => {
    const msg = ctx.message;
    const scope = msg.kind;
    const policy = {
      scope,
      accountId: account.accountId,
      // 访问控制：dmPolicy（c2c） / groupPolicy（group），默认 allowlist
      c2cMode: account.config?.dmPolicy ?? "allowlist",
      groupMode: account.config?.groupPolicy ?? "allowlist",
      allowFrom: account.config?.allowFrom ?? [],
      groupAllowFrom: account.config?.groupAllowFrom ?? []
    };
    if (scope === "group") {
      const groupOpenid = msg.groupOpenid ?? "";
      const groupCfg = resolveGroupConfigFromAccount(account, groupOpenid);
      policy.group = {
        requireMention: groupCfg.requireMention,
        ignoreOtherMentions: groupCfg.ignoreOtherMentions,
        historyLimit: groupCfg.historyLimit,
        prompt: groupCfg.prompt
      };
    }
    ctx.state.policy = policy;
    await next();
  };
}

// src/features/history-store.ts
var _store = null;
function getHistoryStore() {
  if (!_store) _store = new MemoryHistoryStore();
  return _store;
}
function historyGroupKey(accountId, groupId) {
  return `${accountId}:${groupId}`;
}
function clearGroupHistory(accountId, groupId) {
  _store?.clear?.(historyGroupKey(accountId, groupId));
}

// src/middleware/access-control.ts
function dynamicAccessControl(params) {
  const { accountId, getRuntime } = params;
  return async (ctx, next) => {
    const p2 = ctx.state.policy;
    const isGroup = ctx.message.kind === "group";
    const mode = isGroup ? p2?.groupMode ?? "open" : p2?.c2cMode ?? "allowlist";
    if (mode === "disabled") {
      ctx.log?.info?.(`[access] blocked ${isGroup ? "group" : "c2c"} from ${ctx.message.senderId}: policy disabled`);
      ctx.stop("access:policy_disabled");
      return;
    }
    if (mode === "open") {
      await next();
      return;
    }
    const allowList = isGroup ? p2?.groupAllowFrom ?? [] : p2?.allowFrom ?? [];
    if (!allowList.length || allowList.includes("*")) {
      await next();
      return;
    }
    const id = isGroup ? ctx.message.groupOpenid ?? "" : ctx.message.senderId;
    if (allowList.includes(id)) {
      await next();
      return;
    }
    if (mode === "pairing" && !isGroup) {
      await checkPairingMode(ctx, next, {
        accountId,
        getRuntime,
        senderId: ctx.message.senderId
      });
      return;
    }
    const listLabel = isGroup ? "groupAllowFrom" : "allowFrom";
    ctx.log?.info?.(
      `[access] blocked ${isGroup ? "group" : "c2c"} from ${id}: not in ${listLabel}`
    );
    ctx.stop("access:not_allowlisted");
  };
}
async function checkPairingMode(ctx, next, opts) {
  const api = getPairingApi();
  if (!api) {
    ctx.log?.info?.(`[access] pairing unavailable for ${opts.senderId}`);
    ctx.stop("access:pairing_unavailable");
    return;
  }
  try {
    const storeIds = await api.readAllowFromStore({
      channel: "qqbot",
      accountId: opts.accountId
    });
    if (storeIds.includes(opts.senderId) || storeIds.includes("*")) {
      await next();
      return;
    }
    const challenge = await api.issueChallenge({
      channel: "qqbot",
      id: opts.senderId,
      accountId: opts.accountId
    });
    const frameworkReply = api.buildReply({
      code: challenge.code,
      channel: "qqbot"
    });
    const reply = [
      frameworkReply,
      "",
      "QQ \u7BA1\u7406\u5458\u53EF\u76F4\u63A5\u6267\u884C\uFF1A",
      "",
      "```",
      `/bot-pairing approve ${challenge.code}`,
      "```"
    ].join("\n");
    ctx.log?.info?.(`[access] pairing required for ${opts.senderId}`);
    await ctx.bot.sendText(ctx.replyTarget, reply).catch(() => {
    });
    ctx.stop("access:pairing_required");
  } catch (err) {
    ctx.log?.error?.(`[access] pairing error: ${err.message}`);
    ctx.stop(`access:pairing_error: ${err.message}`);
  }
}

// src/utils/mention.ts
function stripMentionText(text, mentions) {
  if (!text || !mentions?.length) return text;
  let cleaned = text;
  for (const m3 of mentions) {
    const openid = m3.member_openid ?? m3.id ?? m3.user_openid;
    if (!openid) continue;
    if (m3.is_you) {
      cleaned = cleaned.replace(new RegExp(`<@!?${openid}>`, "g"), "").trim();
    } else {
      const displayName = m3.nickname ?? m3.username;
      if (displayName) {
        cleaned = cleaned.replace(new RegExp(`<@!?${openid}>`, "g"), `@${displayName}`);
      }
    }
  }
  return cleaned;
}

// src/integrations/jm/bridge.ts
var jm_import_node_crypto2 = require("crypto");
var jm_import_node_fs8 = require("fs");
var jm_import_node_os3 = __toESM(require("os"), 1);
var jm_import_node_path8 = __toESM(require("path"), 1);
var jm_import_node_child_process3 = require("child_process");
var ENABLED = process.env.OPENCLAW_QQBOT_JM_ENABLED === "1";
var RUNNER = process.env.OPENCLAW_JM_RUNNER || "/home/ubuntu/.openclaw/workspace/scripts/run_jm.sh";
var CONFIG = process.env.OPENCLAW_JM_CONFIG;
function jmStatePath(accountId) {
  return `${getQQBotDataDir(accountId, "jm")}/state.json`;
}
function baseArgs(accountId) {
  const args = ["adapter", "--state-file", jmStatePath(accountId)];
  if (CONFIG) args.push("--config", CONFIG);
  return args;
}
function runJm(accountId, args, input, timeoutMs = 3e4) {
  if (!ENABLED) return Promise.reject(new Error("jm_integration_disabled"));
  return new Promise((resolve2, reject) => {
    const child = (0, jm_import_node_child_process3.spawn)(RUNNER, [...baseArgs(accountId), ...args], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2e3).unref();
      finish(new Error("jm_adapter_timeout"));
    }, timeoutMs) : void 0;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve2(value);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1e6) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-8e3);
    });
    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (settled) return;
      try {
        const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        let parsed;
        for (let i = lines.length - 1; i >= 0 && !parsed; i--) {
          const candidate = lines.slice(i).join("\n");
          if (!candidate.startsWith("{")) continue;
          try { parsed = JSON.parse(candidate); } catch { /* try an earlier JSON start */ }
        }
        if (!parsed) throw new Error("jm_adapter_json_not_found");
        if (code !== 0 && parsed.ok !== false) {
          finish(new Error(`jm_adapter_exit_${code}:${stderr.slice(0, 500)}`));
        } else finish(void 0, parsed);
      } catch {
        finish(new Error(`jm_adapter_invalid_json:${code}:${stderr.slice(0, 500)}:${stdout.slice(-500)}`));
      }
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(input ?? "");
  });
}
async function validatePdfPath(accountId, candidate) {
  if (!candidate || jm_import_node_path8.default.extname(candidate).toLowerCase() !== ".pdf") throw new Error("invalid_pdf_path");
  const config = await runJm(accountId, ["--show-config"]);
  const policy = config.policy;
  const rootValue = String(policy?.download_dir ?? "");
  if (!rootValue) throw new Error("download_root_unavailable");
  const root = jm_import_node_path8.default.resolve(rootValue.replace(/^~(?=\/|$)/, jm_import_node_os3.default.homedir()));
  const [realRoot, realFile] = await Promise.all([jm_import_node_fs8.promises.realpath(root), jm_import_node_fs8.promises.realpath(candidate)]);
  const relative = jm_import_node_path8.default.relative(realRoot, realFile);
  if (!relative || relative.startsWith(`..${jm_import_node_path8.default.sep}`) || relative === ".." || jm_import_node_path8.default.isAbsolute(relative)) {
    throw new Error("pdf_outside_download_root");
  }
  const stat = await jm_import_node_fs8.promises.stat(realFile);
  if (!stat.isFile() || stat.size === 0) throw new Error("pdf_missing_or_empty");
  return realFile;
}
function buildConfirmKeyboard(token, actorId, scope) { /* QQ-JM-BUTTON-PATCH v3: in C2C the QQ client rejects permission type 0 + user_openid ("无权限操作"), so C2C uses type 2; the owner is still enforced server-side (--confirm-enqueue checks token + chat + clicker) */
  return {
    content: { rows: [{ buttons: [{
      id: "jm-confirm",
      render_data: { label: "\u786E\u8BA4\u4E0B\u8F7D", visited_label: "\u5DF2\u70B9\u51FB", style: 1 },
      action: {
        type: 1,
        data: `jm:v1:confirm:${token}`,
        permission: scope === "c2c" ? { type: 2 } : { type: 0, specify_user_ids: [actorId] },
        unsupport_tips: "\u8BF7\u53D1\u9001 /jm \u786E\u8BA4 <\u786E\u8BA4\u7801>"
      }
    }] }] }
  };
}
function escapeMarkdown(text) {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1").slice(0, 3500);
}
var JM_MD_SAFE = { "\\": "\uFF3C", "`": "'", "*": "\uFF0A", "_": "\uFF3F", "~": "\uFF5E", "#": "\uFF03", "<": "\uFF1C", ">": "\uFF1E", "|": "\uFF5C", "$": "\uFF04", "[": "\u3010", "]": "\u3011", "(": "\uFF08", ")": "\uFF09", "{": "\uFF5B", "}": "\uFF5D" };
function jmPreviewMarkdown(body) { /* QQ-JM-BUTTON-PATCH v4: JM preview card as QQ markdown -- bold first line, "- " list kept, blank lines between blocks; markdown/math characters become full-width (escapeMarkdown's \( \[ rendered as LaTeX/ruby in QQ) */
  const safe = (t) => t.replace(/[\\`*_~#<>|$\[\](){}]/g, (c) => JM_MD_SAFE[c]).replace(/\s{2,}/g, " ").trim();
  const out = [];
  for (const raw of String(body ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || /^[\u2500\u2014\u2015\-=_*]{2,}$/.test(line)) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (!out.length) out.push(`**${safe(line)}**`);
    else if (/^[-\u2022]\s+/.test(line)) out.push(`- ${safe(line.replace(/^[-\u2022]\s+/, ""))}`);
    else out.push(safe(line).replace(/^(\d+)\.\s/, "$1\uFF0E").replace(/^[+-]\s/, "\u00B7 "));
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n").slice(0, 3500);
}
function identity(ctx) {
  const msg = ctx.message;
  const scope = ctx.replyTarget.scope;
  return {
    channelId: `qqbot:${scope}:${ctx.replyTarget.targetId}`,
    userId: msg.senderId
  };
}
async function handleJmCommand(ctx, account, command, id) {
  const actor = identity(ctx);
  if (command === "query") {
    const result = await runJm(
      account.accountId,
      ["--stdin-json", "--format", "json"],
      `${JSON.stringify({ channel_id: actor.channelId, user_id: actor.userId, text: `jm+${id}` })}
`
    );
    const jobId = result.token ? (0, jm_import_node_crypto2.createHash)("sha256").update(result.token, "ascii").digest("hex").slice(0, 24) : "";
    const body = `${result.reply ?? "\u5DF2\u67E5\u5230\u4F5C\u54C1\u3002"}${jobId ? `

\u4EFB\u52A1\u53F7\uFF1A${jobId}\u3002\u786E\u8BA4\u540E\u82E5 PDF \u672A\u81EA\u52A8\u56DE\u4F20\uFF0C\u53D1\u9001 /jm \u9886\u53D6 ${jobId}\u3002` : ""}`;
    if (result.needs_confirmation && result.token && account.markdownSupport) {
      await ctx.bot.sendMarkdown(
        ctx.replyTarget,
        jmPreviewMarkdown(body), /* QQ-JM-BUTTON-PATCH v4 */
        { keyboard: buildConfirmKeyboard(result.token, actor.userId, ctx.replyTarget.scope) /* QQ-JM-BUTTON-PATCH v3 */ }
      );
    } else {
      await ctx.bot.sendText(ctx.replyTarget, body || "JM \u67E5\u8BE2\u672A\u8FD4\u56DE\u5185\u5BB9\u3002");
    }
    return;
  }
  if (command === "confirm") {
    const args = ["--confirm-enqueue", "--channel", actor.channelId, "--user", actor.userId];
    if (id) args.push("--token", id);
    const result = await runJm(account.accountId, args);
    await ctx.bot.sendText(ctx.replyTarget, result.reply || "\u786E\u8BA4\u8BF7\u6C42\u5DF2\u5904\u7406\u3002");
    return;
  }
  if (command === "cancel") {
    const result = await runJm(
      account.accountId,
      ["--stdin-json", "--format", "json"],
      `${JSON.stringify({ channel_id: actor.channelId, user_id: actor.userId, text: "\u53D6\u6D88" })}
`
    );
    await ctx.bot.sendText(ctx.replyTarget, result.reply || "\u53D6\u6D88\u8BF7\u6C42\u5DF2\u5904\u7406\u3002");
    return;
  }
  if (command === "status" || command === "claim") {
    const status = await runJm(
      account.accountId,
      ["--job-status", id, "--channel", actor.channelId, "--user", actor.userId]
    );
    const job = status.job;
    if (!job) {
      await ctx.bot.sendText(ctx.replyTarget, "\u6CA1\u6709\u627E\u5230\u5C5E\u4E8E\u5F53\u524D\u4F1A\u8BDD\u7684\u4EFB\u52A1\u3002");
      return;
    }
    if (command === "status") {
      await ctx.bot.sendText(ctx.replyTarget, `\u4EFB\u52A1 ${job.id}\uFF1A${job.state}\uFF1B\u56DE\u4F20\uFF1A${job.delivery_state}`);
      return;
    }
    if (job.delivery_state === "sent") {
      await ctx.bot.sendText(ctx.replyTarget, `\u4EFB\u52A1 ${job.id} \u7684 PDF \u5DF2\u56DE\u4F20\u3002`);
      return;
    }
    if (job.state !== "succeeded" || !job.media_path) {
      await ctx.bot.sendText(ctx.replyTarget, `\u4EFB\u52A1 ${job.id} \u5C1A\u65E0\u53EF\u9886\u53D6\u7684 PDF\uFF08\u72B6\u6001\uFF1A${job.state}\uFF09\u3002`);
      return;
    }
    const deliveryClaim = await runJm(account.accountId, [
      "--claim-delivery",
      job.id,
      "--channel",
      actor.channelId,
      "--user",
      actor.userId
    ]);
    if (!deliveryClaim.ok) {
      await ctx.bot.sendText(ctx.replyTarget, `\u4EFB\u52A1 ${job.id} \u6B63\u5728\u56DE\u4F20\u6216\u72B6\u6001\u5C1A\u672A\u5141\u8BB8\u9886\u53D6\uFF0C\u8BF7\u7A0D\u540E\u67E5\u770B\u72B6\u6001\u3002`);
      return;
    }
    try {
      const safePath = await validatePdfPath(account.accountId, String(job.media_path));
      const sent = await ctx.bot.sendMedia({
        target: ctx.replyTarget,
        fileType: MediaFileType.FILE,
        localPath: safePath,
        fileName: `JM-${job.album_id}.pdf`,
        content: `\u4EFB\u52A1 ${job.id} \u7684 PDF`
      });
      await runJm(account.accountId, [
        "--mark-delivery",
        job.id,
        "--delivery-state",
        sent.message?.id ? "sent" : "uncertain",
        ...sent.message?.id ? ["--delivery-message-id", sent.message.id] : ["--delivery-error", "QQ send returned no message id"]
      ]);
    } catch (err) {
      await runJm(account.accountId, [
        "--mark-delivery",
        job.id,
        "--delivery-state",
        "uncertain",
        "--delivery-error",
        String(err).slice(0, 300)
      ]).catch(() => void 0);
      throw err;
    }
  }
}
async function jmHasPending(accountId, actor) { /* QQ-JM-BUTTON-PATCH v2: bare 确认/取消/yes/no count as JM commands only while this chat+sender has a live pending lookup */
  try {
    const raw = JSON.parse(await jm_import_node_fs8.promises.readFile(jmStatePath(accountId), "utf8"));
    const now = Date.now() / 1e3;
    return Object.values(raw?.pending ?? {}).some((req) => req && req.channel_id === actor.channelId && req.user_id === actor.userId && Number(req.expires_at ?? 0) > now);
  } catch {
    return false;
  }
}

function createFvCommandMiddleware(account) {
  if (process.env.OPENCLAW_QQBOT_FV_ENABLED !== "1") return;
  const { spawn } = require("node:child_process");
  const RUNNER = process.env.OPENCLAW_FV_RUNNER || "/home/ubuntu/.openclaw/workspace/scripts/run_fv.sh";
  const QUERY = /(?:^|\s)(?:找片|fv)\s*[+：:]?\s*(\S.*)$/i;
  const GET = /(?:^|\s)(?:下|下载|get)\s+[0-9]/i;
  return async (ctx, next) => {
    let text = String((ctx.message && ctx.message.content) || "").trim();
    text = text.replace(/^\[[0-9A-Fa-f]{8,}\]\s*/, "").replace(/^(?:<@!?\d+>|@\S+)\s*/, "");
    if (!QUERY.test(text) && !GET.test(text)) return next();
    const result = await new Promise((resolve, reject) => {
      const child = spawn(RUNNER, [], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("fv_adapter_timeout")); }, 45000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("close", (code) => {
        clearTimeout(timer);
        const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          if (!lines[i].startsWith("{")) continue;
          try { resolve(JSON.parse(lines.slice(i).join("\n"))); return; } catch (e) {}
        }
        reject(new Error("fv_adapter_invalid_json:" + code));
      });
      child.stdin.end(JSON.stringify({ text }) + "\n");
    }).catch(async (err) => {
      await ctx.bot.sendText(ctx.replyTarget, "找片操作失败：" + String(err).slice(0, 300)).catch(() => {});
      return null;
    });
    if (result && result.reply) await ctx.bot.sendText(ctx.replyTarget, String(result.reply).slice(0, 3500));
    ctx.stop("fv:handled");
  };
}
function createJmCommandMiddleware(account) {
  if (!ENABLED) return void 0;
  return async (ctx, next) => {
    const text = String(ctx.message.content ?? "").trim();
    const query = /^jm(?:\+|抓\s*)([0-9]{1,12})$/i.exec(text); /* QQ-JM-BUTTON-PATCH v1: also accept 「jm抓<数字>」 */
    const tokenConfirm = /^(?:\/jm\s+)?(?:确认下载|确认)\s+([A-Za-z0-9_-]{32}|[0-9a-f]{6})$/i.exec(text);
    const bareConfirm = /^(?:\/jm\s+)?(?:确认下载|确认|yes)$/i.test(text);
    const cancel = /^(?:\/jm\s+)?(?:取消|cancel|no)$/i.test(text);
    const status = /^\/jm\s+(状态|领取)\s+([a-f0-9]{24})$/i.exec(text);
    if (!query && !tokenConfirm && !bareConfirm && !cancel && !status) return next();
    if ((bareConfirm || cancel) && !/^\/jm\s/i.test(text) && !await jmHasPending(account.accountId, identity(ctx))) return next(); /* QQ-JM-BUTTON-PATCH v2 */
    try {
      const command = query ? "query" : tokenConfirm || bareConfirm ? "confirm" : cancel ? "cancel" : status[1] === "\u9886\u53D6" ? "claim" : "status";
      await handleJmCommand(ctx, account, command, query?.[1] ?? tokenConfirm?.[1] ?? status?.[2]);
    } catch (err) {
      await ctx.bot.sendText(ctx.replyTarget, `JM \u64CD\u4F5C\u5931\u8D25\uFF1A${String(err).slice(0, 300)}`).catch(() => void 0);
    }
    ctx.stop("jm:handled");
  };
}

/* QQ-DURABLE-DELIVERY-PATCH v1 */
const __qqExplicitStop = require("./qq-explicit-stop.cjs");
const __qqReceipts = require("./qq-delivery-receipts.cjs");
/* QQ-ABSOLUTE-DEADLINE-PATCH v1: receive -> settled, no early owner release. */
const __qqDeadlineDefaults = Object.freeze({ budgetMs: 180000, insuranceMs: 210000 });
const __qqDeadlineSendScope = new (require("node:async_hooks").AsyncLocalStorage)();
function __qqWithRequestSignal(signal, run) {
  return signal ? __qqDeadlineSendScope.run({ signal }, run) : run();
}
function __qqDeadlineLimits() {
  const bounded = (value, fallback, low, high) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= low && n <= high ? Math.floor(n) : fallback;
  };
  const budgetMs = bounded(process.env.OPENCLAW_QQ_CHAT_BUDGET_MS, 180000, 30000, 600000);
  const insuranceMs = bounded(process.env.OPENCLAW_QQ_CHAT_INSURANCE_MS, 210000, budgetMs + 1000, 630000);
  return { budgetMs, insuranceMs: Math.max(insuranceMs, budgetMs + 1000) };
}
function __qqDeadlineBusinessExempt(ctx) {
  // Existing excluded business adapters execute before the ordinary-chat guard.
  const text = String(ctx?.message?.content ?? "").trim().replace(/^\[[0-9A-Fa-f]{8,}\]\s*/, "").replace(/^(?:<@!?\d+>|@\S+)\s*/, "");
  return /^(?:\/jm\s|jm(?:\+|抓\s*)[0-9]|(?:\/jm\s+)?(?:确认下载|确认)\s+[A-Za-z0-9_-]{6,32}\b)/i.test(text)
    || /^(?:确认下载|确认|yes|取消|cancel|no)$/i.test(text)
    || /(?:^|\s)(?:找片|fv)\s*[+：:]?\s*\S/i.test(text)
    || /(?:^|\s)(?:下|下载|get)\s+[0-9]/i.test(text);
}
function __qqDeadlineLog(ctx, phase, extra = {}) {
  const state = ctx?.state?.__qqDeadline;
  if (!state) return;
  try {
    ctx.log?.info?.(`[qq-deadline] ${JSON.stringify({ v: 1, id: state.id, scope: ctx?.replyTarget?.scope ?? ctx?.message?.replyTarget?.scope ?? "unknown", phase, elapsedMs: Math.max(0, Date.now() - state.receivedAt), ...extra })}`);
  } catch {}
}
function __qqDeadlineClear(ctx) {
  const state = ctx?.state?.__qqDeadline;
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  if (state.insuranceTimer) clearTimeout(state.insuranceTimer);
  state.timer = state.insuranceTimer = null;
}
function __qqDeadlineArm(ctx, receivedAt) {
  const state = ctx?.state?.__qqDeadline;
  if (!state || state.settled) return;
  __qqDeadlineClear(ctx);
  state.receivedAt = Math.min(state.receivedAt, receivedAt);
  state.deadlineAt = state.receivedAt + state.budgetMs;
  const abort = () => {
    if (state.settled || ctx.signal?.aborted) return;
    state.abortAt = Date.now();
    __qqDeadlineLog(ctx, "cancel-requested", { reason: "chat-budget", budgetMs: state.budgetMs });
    ctx.abort("qq:chat-absolute-deadline");
  };
  const remaining = state.deadlineAt - Date.now();
  if (remaining <= 0) abort();
  else { state.timer = setTimeout(abort, remaining); state.timer.unref?.(); }
  state.insuranceTimer = setTimeout(() => {
    if (state.settled) return;
    state.uncertain = true;
    if (!ctx.signal?.aborted) ctx.abort("qq:chat-insurance-deadline");
    // Never unlock a lane or start another owner until the underlying await settles.
    __qqDeadlineLog(ctx, "cancel-unresolved", { reason: "awaiting-terminal", ownerReleased: false });
  }, Math.max(0, state.receivedAt + state.insuranceMs - Date.now()));
  state.insuranceTimer.unref?.();
}
function __qqDeadlineStart(ctx) {
  if (process.env.OPENCLAW_QQ_ABSOLUTE_DEADLINE === "0" || __qqDeadlineBusinessExempt(ctx)) return;
  const limits = __qqDeadlineLimits();
  const rawId = String(ctx?.message?.messageId ?? "unknown");
  const id = require("node:crypto").createHash("sha256").update(rawId).digest("hex").slice(0, 16);
  ctx.state.__qqDeadline = { ...limits, id, receivedAt: Number(ctx.receivedAt) || Date.now(), settled: false, uncertain: false };
  __qqDeadlineArm(ctx, ctx.state.__qqDeadline.receivedAt);
  __qqDeadlineLog(ctx, "received", { budgetMs: limits.budgetMs, insuranceMs: limits.insuranceMs });
}
function __qqDeadlineRemaining(ctx) {
  const state = ctx?.state?.__qqDeadline;
  if (!state) return undefined;
  const remaining = state.deadlineAt - Date.now();
  if (remaining <= 0 && !ctx.signal?.aborted) ctx.abort("qq:chat-absolute-deadline");
  return Math.max(0, remaining);
}
function __qqDeadlineCheck(ctx) {
  __qqDeadlineRemaining(ctx);
  if (ctx?.signal?.aborted) {
    const error = new Error("QQ request cancelled before dispatch or send");
    error.name = "AbortError";
    error.code = "QQ_CHAT_ABORTED";
    throw error;
  }
}
function __qqDeadlineFinish(ctx) {
  for (const cleanup of ctx?.state?.__qqAbortCleanups ?? []) { try { cleanup(); } catch {} }
  if (ctx?.state) delete ctx.state.__qqAbortCleanups;
  const state = ctx?.state?.__qqDeadline;
  if (!state || state.settled) return;
  state.settled = true;
  __qqDeadlineClear(ctx);
  __qqDeadlineLog(ctx, "settled", { aborted: !!ctx.signal?.aborted, uncertain: state.uncertain });
}
function __qqDeadlineMerge(last, buffered) {
  const received = buffered.map(ctx => ctx?.state?.__qqDeadline?.receivedAt).filter(Number.isFinite);
  if (received.length) __qqDeadlineArm(last, Math.min(...received));
}
async function __qqWaitWhileQueued(ctx, pending) {
  // Only for a waiter which has not acquired an owner lane. Never race active execution.
  if (ctx.signal?.aborted || ctx.stopped) return false;
  let onAbort;
  const cancelled = new Promise(resolve => {
    onAbort = () => resolve(false);
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve(pending).then(() => !ctx.signal?.aborted && !ctx.stopped), cancelled]); }
  finally { ctx.signal?.removeEventListener("abort", onAbort); }
}
/* /QQ-ABSOLUTE-DEADLINE-PATCH v1 */

// src/gateway/middleware-setup.ts
/* QQ-SOURCE-ACK-CONTINUATION v1 */
function __qqSourceAckContinuationReader({ctx,identity,accountId,sessionKey,sourceMessageId,sourceAliases=[],segmenter}) {
 const bound=Object.freeze({accountId:String(accountId),sessionKey:String(sessionKey),sourceMessageId:String(sourceMessageId)});
 const aliases=new Set([bound.sourceMessageId,...sourceAliases.filter(v=>typeof v==="string" && v)]);
 let attempt=0;
 return async request => {
  if (request?.isFallbackRetry !== true || request.channel !== "qqbot" || ["accountId","sessionKey"].some(k=>String(request[k] ?? "")!==bound[k]) || !aliases.has(String(request.sourceMessageId ?? ""))) return null;
  __qqDeadlineCheck(ctx);
  // Await only already-started source sends; do not generate/send/retry anything here.
  await segmenter?.settleDelivery?.();
  __qqDeadlineCheck(ctx);
  const ledger=__qqReceipts.read(identity); if (!ledger) return null;
  const operations=Object.entries(ledger.operations);
  const status=operations.some(([,r])=>r.type==="delivery" && ["in-flight","uncertain"].includes(r.state)) ? "uncertain" : "confirmed";
  const digest=value=>require("node:crypto").createHash("sha256").update(String(value)).digest("hex");
  const fragments=operations.filter(([,r])=>r.type==="delivery" && r.state==="confirmed" && r.kind==="segment" && Number.isInteger(r.meta?.earlyIndex) && typeof r.text==="string" && r.text && r.messageId).sort((a,b)=>a[1].meta.earlyIndex-b[1].meta.earlyIndex).map(([operationKey,r])=>Object.freeze({operationKey,ackKey:digest(r.messageId),text:r.text,index:r.meta.earlyIndex}));
  return Object.freeze({version:1,binding:Object.freeze({...bound,sourceMessageId:String(request.sourceMessageId)}),sourceKey:identity.key,attempt:++attempt,status,fragments:Object.freeze(fragments)});
 };
}
/* /QQ-SOURCE-ACK-CONTINUATION v1 */

/* QQ-QUEUE-MEDIA-SOURCE-PATCH v1 */
const __qqQueueDepths = new Map();
function __qqQueueDiag(ctx, phase, fields = {}) {
 if (process.env.OPENCLAW_QQ_QUEUE_DIAGNOSTICS === "0") return;
 try {
  const digest = v => require("node:crypto").createHash("sha256").update(String(v ?? "")).digest("hex").slice(0,16);
  const key = ctx?.qualifiedTarget ?? ctx?.message?.replyTarget?.targetId ?? "unknown";
  const record = { schema:1, atMs:Date.now(), layer:"sdk", phase, keyHash:digest(key), messageHash:digest(ctx?.message?.messageId) };
  for (const k of ["queueDepth","waitMs","sourceCount","senderCount","mediaCount","overflowCount"]) if (k in fields) record[k] = typeof fields[k] === "number" && Number.isFinite(fields[k]) ? Math.max(0,fields[k]) : null;
  for (const k of ["resolvedDisposition","configuredMode"]) if (k in fields) record[k] = String(fields[k]).replace(/[^a-z-]/g, "").slice(0,40);
  ctx?.log?.info?.(`[qq-queue] ${JSON.stringify(record)}`);
 } catch {}
}
function __qqSourceAttachments(ctx) {
 const msg = ctx.message;
 return (msg.attachments ?? []).map((att, attachmentIndex) => ({ ...att, __qqSource: Object.freeze({ senderId:msg.senderId, messageId:msg.messageId, senderName:msg.senderName, attachmentIndex }) }));
}
function __qqMergedSources(buffered) {
 return buffered.map((ctx, messageIndex) => ({ messageIndex, senderId:ctx.message.senderId, messageId:ctx.message.messageId, senderName:ctx.message.senderName, attachmentCount:(ctx.message.attachments ?? []).length }));
}
function __qqVoiceContentType(att, transcript) {
 const ext = String(transcript.localPath ?? transcript.remoteUrl ?? "").split(/[?#]/,1)[0].match(/\.(wav|mp3|ogg|opus|m4a|aac|flac|silk)$/i)?.[1]?.toLowerCase();
 const mime = {wav:"audio/wav",mp3:"audio/mpeg",ogg:"audio/ogg",opus:"audio/opus",m4a:"audio/mp4",aac:"audio/aac",flac:"audio/flac",silk:"audio/silk"}[ext];
 return mime ?? (att.voice_wav_url && transcript.remoteUrl === normalizeUrl(att.voice_wav_url) ? "audio/wav" : att.content_type?.startsWith("audio/") ? att.content_type : "audio/silk");
}
/* /QQ-QUEUE-MEDIA-SOURCE-PATCH v1 */

/* QQ-GROUP-STEER-INGRESS-PATCH v1 */
const __qqSteerPreflight = new Map();
function __qqSteerEnabled(ctx) {
 if (process.env.OPENCLAW_QQ_GROUP_STEER === "0") return false;
 const msg = ctx?.message;
 return msg?.replyTarget?.scope === "group" && __qqDualScopeGroup(msg.replyTarget.targetId) !== null && !String(msg.content ?? "").trim().startsWith("/");
}
function __qqLatencyLog(ctx, phase, extra = "") {
 const rec = ctx?.state?.__qqLatency;
 if (!rec) return;
 try { ctx.log?.info?.(`[qq-latency] id=${rec.id} group=${__qqDualScopeGroup(ctx?.message?.replyTarget?.targetId)?.slice(0,6) ?? "unknown"} phase=${phase} elapsedMs=${Date.now()-rec.receivedAt}${extra ? " "+extra : ""}`); } catch {}
}
function __qqReleasePreflight(ctx, phase = "handoff") {
 const release = ctx?.state?.__qqReleasePreflight;
 if (typeof release === "function") { delete ctx.state.__qqReleasePreflight; release(); __qqLatencyLog(ctx, phase); }
}
function __qqSteerIngressGuard(legacy, account) {
 return async (ctx, next) => {
  if (!__qqSteerEnabled(ctx)) return await legacy(ctx, next);
  const key = JSON.stringify([String(account.accountId), __qqDualScopeGroup(ctx.message.replyTarget.targetId)]);
  const prev = __qqSteerPreflight.get(key) ?? Promise.resolve();
  let unlock;
  const mine = new Promise(resolve => { unlock = resolve; });
  __qqSteerPreflight.set(key, mine);
  const __qqWaitStart = performance.now();
  const __qqDepth = (__qqQueueDepths.get(key) ?? 0) + 1; __qqQueueDepths.set(key,__qqDepth);
  __qqQueueDiag(ctx,"preflight-wait", { queueDepth:__qqDepth, resolvedDisposition:"waiting-preflight" });
  if (!await __qqWaitWhileQueued(ctx, prev)) {
    __qqQueueDepths.set(key,Math.max(0,(__qqQueueDepths.get(key) ?? 1)-1));
    __qqQueueDiag(ctx,"preflight-end", { queueDepth:__qqQueueDepths.get(key), waitMs:performance.now()-__qqWaitStart, resolvedDisposition:"expired" });
    // Keep the cancelled waiter's place in the barrier until its predecessor settles.
    Promise.resolve(prev).then(() => { unlock(); if (__qqSteerPreflight.get(key) === mine) __qqSteerPreflight.delete(key); }).catch(() => {});
    __qqDeadlineLog(ctx, "queue-expired", { ownerAcquired: false });
    return;
  }
  __qqQueueDepths.set(key,Math.max(0,(__qqQueueDepths.get(key) ?? 1)-1));
  __qqQueueDiag(ctx,"preflight-end", { queueDepth:__qqQueueDepths.get(key), waitMs:performance.now()-__qqWaitStart, resolvedDisposition:"acquired" });
  let released = false;
  const release = () => { if (released) return; released = true; unlock(); if (__qqSteerPreflight.get(key) === mine) __qqSteerPreflight.delete(key); };
  ctx.state.__qqReleasePreflight = release;
  __qqLatencyLog(ctx, "preflight-start");
  let timer;
  if (account.processingTimeoutMs > 0) timer = setTimeout(() => { try { ctx.abort("concurrency:processing-timeout"); } catch {} __qqDeadlineLog(ctx, "preflight-cancel-requested", { ownerReleased: false }); }, account.processingTimeoutMs);
  try { if (ctx.signal.aborted || ctx.stopped) return; return await next(); }
  finally { if (timer) clearTimeout(timer); __qqReleasePreflight(ctx,"preflight-finally"); __qqLatencyLog(ctx,"complete"); }
 };
}
/* QQ-NATIVE-QUEUE-ADAPTER-PATCH v1 */
function __qqNativeQueueDispatchOptions(ctx, adapters) {
 // The existing runtime owns admission, queue policy, and group-thread guards.
 // Preserve legacy dispatch on other routes and older runtime versions.
 if (process.env.OPENCLAW_QQ_NATIVE_QUEUE_ADAPTER === "0" || !__qqSteerEnabled(ctx) || typeof adapters?.dispatchReplyFromConfig !== "function") return {};
 return { dispatchReplyFromConfig: adapters.dispatchReplyFromConfig };
}
function __qqSteerDispatch(ctx, run) {
 // Start core dispatch synchronously before admitting the next preflight.
 // The complete middleware chain still awaits this promise until turn completion.
 const result = run();
 __qqReleasePreflight(ctx, "core-dispatch");
 return result;
}
/* /QQ-GROUP-STEER-INGRESS-PATCH v1 */

/* QQ-CONTROLLED-MEDIA-SDK-BRIDGE v1 */
const __qqJobInboundAdmissions = new WeakMap();
function __qqJobAdmissionMarker(account) {
  return async (ctx, next) => {
    // Mounted only after dynamicAccessControl -> mentionGate -> sanitizer ->
    // rateLimiter. A denied gate never calls next, and cannot earn this proof.
    const message = ctx.message;
    if (message?.replyTarget?.scope === "group" && ctx.state?.mention?.shouldAnswer === true && /^\/(?:media-job|媒体任务)(?:\s|$)/i.test(String(message.content || "").trim())) {
      const proof = Object.freeze({ kind: "sdk-inbound-command", channelAclPassed: true, mentionGatePassed: true, currentSourceActive: !ctx.signal?.aborted && !ctx.stopped, receivedAtMs: __qqJobReceivedAt(ctx, message), accountId: account.accountId, senderId: message.senderId, sourceMessageId: message.messageId, targetId: String(message.replyTarget.targetId).toLowerCase() });
      __qqJobInboundAdmissions.set(ctx, proof);
    }
    return await next();
  };
}
function __qqJobManager(account) {
  const manager = globalThis[Symbol.for("openclaw.qqControlledMediaJobs.v1")];
  if (!manager && account?.config?.controlledMediaJobs?.enabled === true) throw Object.assign(new Error("MEDIA_JOB_GUARD_NOT_READY"), { code: "MEDIA_JOB_GUARD_NOT_READY" });
  return manager;
}
function __qqJobReceivedAt(ctx, msg) {
  const raw = msg?.timestamp;
  const platform = typeof raw === "number" ? raw : Date.parse(raw || "");
  return Math.min(Number(ctx.receivedAt) || Date.now(), Number.isFinite(platform) ? platform : Date.now());
}
function __qqJobRegister(ctx, msg, account, route, aliases = []) {
  const manager = __qqJobManager(account);
  if (!manager || !manager.scoped(route)) return;
  return manager.registerInbound({ accountId: account.accountId, senderId: msg.senderId, sourceId: msg.messageId, aliases, scope: msg.replyTarget.scope, targetId: msg.replyTarget.targetId, receivedAt: __qqJobReceivedAt(ctx, msg), sessionKey: route.sessionKey, agentId: route.agentId });
}
function __qqJobAttachTransport(account) {
  const manager = __qqJobManager(account); if (!manager) return;
  const crypto = require("node:crypto");
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  const identity = origin => __qqReceipts.identity(origin.accountId, origin.target, origin.rawSourceId);
  manager.setTransport(account.accountId, {
    async send(job, origin, operation) {
      if (origin.accountId !== account.accountId || origin.scope !== "group") throw Object.assign(new Error("MEDIA_JOB_ROUTE_MISMATCH"), { sendState: "not-sent" });
      if (origin.receivedAt + 240000 <= Date.now()) return { error: "MEDIA_PASSIVE_WINDOW_EXPIRED", sendState: "not-sent" };
      const gateway = getGateway(account.accountId);
      if (!gateway?.bot?.sendMedia) return { error: "MEDIA_TRANSPORT_NOT_READY", sendState: "not-sent" };
      const signal = AbortSignal.timeout(15000);
      return await __qqReceipts.send(identity(origin), { id: operation.operationId, meta: {} }, { mediaHash: job.result.sha256, kind: job.recipe.kind }, async () => {
        try {
          // Explicit original msgId; no attachMsgId cache / latest group message.
          const result = await __qqWithRequestSignal(signal, () => gateway.bot.sendMedia({ target: { scope: "group", targetId: origin.targetId, msgId: origin.rawSourceId }, fileType: job.recipe.kind === "voice" ? 3 : 1, localPath: job.result.path }));
          return { messageId: result?.message?.id };
        } catch (error) {
          const rejected = !signal.aborted && error?.httpStatus >= 400 && error.httpStatus < 500;
          return { error: "MEDIA_PLATFORM_ACK_UNCONFIRMED", errorCode: String(error?.bizCode || error?.code || "MEDIA_ACK_MISSING"), sendState: rejected ? "not-sent" : "uncertain" };
        }
      });
    },
    async peek(job, origin) {
      const record = __qqReceipts.read(identity(origin))?.operations?.[digest(job.delivery?.operationId || `controlled-media:${job.id}`)];
      return record?.state === "confirmed" ? { messageId: record.messageId } : undefined;
    }
  });
}
function __qqJobCommand(account, opts) {
  return async (ctx, next) => {
    const text = String(ctx.message?.content || "").trim();
    if (!/^\/(?:media-job|媒体任务)(?:\s|$)/i.test(text)) return await next();
    const manager = __qqJobManager(account); if (!manager) return await next();
    const msg = ctx.message;
    const adapters = getAdapters(opts.getRuntime?.());
    const cfg = adapters.getConfig?.() ?? {};
    const route = adapters.resolveAgentRoute?.({ cfg, channel: "qqbot", accountId: account.accountId, peer: { kind: "group", id: msg.replyTarget?.targetId ?? msg.groupOpenid } });
    if (!manager.scoped(route)) return await next();
    let reply;
    try {
      const origin = __qqJobRegister(ctx, msg, account, route);
      if (!origin) throw new Error("MEDIA_JOB_GUARD_NOT_READY");
      const create = /^\/(?:media-job|媒体任务)\s+(voice|image|语音|画图)\s+([\s\S]+)$/i.exec(text);
      let result;
      if (create) {
        const kind = ["voice", "语音"].includes(create[1].toLowerCase()) ? "voice" : "image";
        const guard = globalThis[Symbol.for("openclaw.qqGroupOwnerGuard")];
        const admission = __qqJobInboundAdmissions.get(ctx);
        if (!admission?.currentSourceActive || admission.accountId !== account.accountId || admission.senderId !== msg.senderId || admission.sourceMessageId !== msg.messageId || admission.targetId !== origin.targetId || admission.receivedAtMs !== origin.receivedAt || admission.receivedAtMs + 180000 <= Date.now() || ctx.signal?.aborted || ctx.stopped) throw new Error("MEDIA_COMMAND_ADMISSION_NOT_READY");
        const hostContext = Object.freeze({ sessionKey: route.sessionKey, trigger: "user", admission, requester: Object.freeze({ trigger: "user", channel: "qqbot", accountId: account.accountId, senderId: msg.senderId, sourceMessageId: msg.messageId, targetId: String(msg.replyTarget.targetId).toLowerCase() }) });
        if (!guard?.active || typeof guard.isCurrentOwner !== "function" || typeof guard.authorizeControlledJob !== "function" || guard.isCurrentOwner(hostContext) !== true) throw new Error("MEDIA_COMMAND_AUTHORITY_NOT_READY_OR_NOT_OWNER");
        const recipe = manager.commandRecipe(kind, create[2].trim());
        // Host creates this invocation; no role/source/job credential comes from
        // user text. The guard checks the same live group deny policy.
        const decision = await guard.authorizeControlledJob(hostContext, manager.previewInvocation(origin, recipe));
        if (decision?.allowed !== true) throw new Error("MEDIA_COMMAND_POLICY_DENIED");
        if (ctx.signal?.aborted || ctx.stopped || admission.senderId !== msg.senderId || admission.sourceMessageId !== msg.messageId || admission.targetId !== String(msg.replyTarget.targetId).toLowerCase()) throw new Error("MEDIA_COMMAND_SOURCE_RETIRED");
        result = await manager.submit(origin, recipe);
        // Human command reply: keep model-only guidance on the model-facing bridge.
        if (result && typeof result === "object" && !Array.isArray(result)) {
          const { modelContinuation: _modelContinuation, modelPollRequired: _modelPollRequired, modelSendRequired: _modelSendRequired, ...commandStatus } = result;
          result = commandStatus;
        }
      } else result = await manager.control(text, origin);
      reply = result === undefined ? "用法：/media-job voice 台词；/media-job image 提示词（创建仅当前主人）；/media-job list；/media-job status|cancel|get|resend 任务编号。只有发起人能操作自己的任务；resend 明确要求再发一次。" : JSON.stringify(result);
    } catch (error) { reply = `媒体任务操作未执行：${error.code || "MEDIA_JOB_GUARD_NOT_READY"}`; }
    const target = `qqbot:group:${msg.replyTarget.targetId}`;
    await __qqReceipts.send(__qqReceipts.identity(account.accountId, target, msg.messageId), { id: "controlled-media-command-response", meta: {} }, { text: reply }, () => sendText({ to: target, text: reply, accountId: account.accountId, replyToId: msg.messageId, account }));
    ctx.stop("controlled-media-job-command");
  };
}
async function __qqControlledVoice(account, deliverCtx, line, cfg, confirmed) {
  let manager;
  try {
    manager = __qqJobManager(account);
    const origin = deliverCtx.__qqControlledOrigin;
    if (manager?.scoped({ sessionKey: deliverCtx.__qqControlledSessionKey }) && !origin) throw new Error("MEDIA_JOB_GUARD_NOT_READY");
    if (origin) return await manager.taggedVoice(origin, line, confirmed, confirmed ? 8000 : 0);
    return await __qqReceipts.result(deliverCtx.__qqReceiptIdentity, "tagged-voice-generation", { line, voiceScript: cfg.voiceScript }, () => __qqMtTts(line, cfg));
  } catch (error) { return { ok: false, controlled: true, error: error.code || error.message || "MEDIA_JOB_GUARD_NOT_READY" }; }
}
async function __qqControlledVoiceFinish(account, deliverCtx, result) {
  const manager = __qqJobManager(account);
  if (!manager || !deliverCtx.__qqControlledOrigin) throw Object.assign(new Error("MEDIA_JOB_GUARD_NOT_READY"), { code: "MEDIA_JOB_GUARD_NOT_READY" });
  const delivery = await manager.deliverNow(result.jobId, deliverCtx.__qqControlledOrigin);
  return delivery.state === "confirmed" ? { messageId: result.jobId } : { error: delivery.state, sendState: delivery.state === "uncertain" ? "uncertain" : "not-sent" };
}
/* /QQ-CONTROLLED-MEDIA-SDK-BRIDGE v1 */

function __qqExplicitStopAdmission(account, opts) {
  return async (ctx, next) => {
    let pendingStopSettlement;
    try {
      const msg=ctx.message, target=msg?.replyTarget;
      if (!ctx.stopped && !ctx.signal?.aborted && ctx.state?.mention?.shouldAnswer===true && (target?.scope==="group" || target?.scope==="c2c")) {
        const adapters=getAdapters(opts.getRuntime(),ctx.log), cfg=adapters.getConfig?.() ?? {};
        const route=adapters.resolveAgentRoute?.({cfg,channel:"qqbot",accountId:account.accountId,peer:{kind:target.scope==="group"?"group":"direct",id:target.scope==="group"?msg.groupOpenid:msg.senderId}});
        if (route?.sessionKey) {
          const token=__qqExplicitStop.mint({channel:"qqbot",ctx,accountId:route.accountId ?? account.accountId,sessionKey:route.sessionKey,senderId:msg.senderId,target:target.targetId,messageId:msg.messageId,scope:target.scope,log:ctx.log});
          if (token) { ctx.state.__qqExplicitStopSource=token; __qqExplicitStop.request(token,msg.content); pendingStopSettlement=__qqExplicitStop.pendingSettlement(token); }
        }
      }
    } catch {}
    if (pendingStopSettlement && !await __qqWaitWhileQueued(ctx,pendingStopSettlement)) return;
    return await next();
  };
}
function setupMiddlewares(bot, account, opts) {
  __qqJobAttachTransport(account);
  bot.use(errorHandler());
  bot.use(async (ctx, next) => {
    if (__qqSteerEnabled(ctx)) {
      ctx.state.__qqLatency = { id: String(ctx.message.messageId ?? "unknown"), receivedAt: Date.now() };
      __qqLatencyLog(ctx, "received");
    }
    return await next();
  });
  bot.use(messageFilter({ skipSelfEcho: false }));
  bot.use(createPolicyInjector(account));
  bot.use(historyBuffer({
    store: getHistoryStore(),
    groupKey: (ctx) => {
      const gid = ctx.message.groupOpenid;
      if (ctx.message.kind !== "group" || !gid) return void 0;
      return historyGroupKey(account.accountId, gid);
    }
  }));
  bot.use(dynamicAccessControl({
    accountId: account.accountId,
    getRuntime: opts.getRuntime
  }));
  bot.use(mentionGate());
  bot.use(contentSanitizer({
    parseFaceTags: true,
    transform: (content, ctx) => stripMentionText(content, ctx.message.mentions)
  }));
  bot.use(rateLimiter());
  bot.use(__qqExplicitStopAdmission(account, opts));
  bot.use(__qqJobAdmissionMarker(account));
  bot.use(__qqJobCommand(account, opts));
  const jmCommand = createJmCommandMiddleware(account);
  if (jmCommand) bot.use(jmCommand);
  const fvCommand = createFvCommandMiddleware(account);
  if (fvCommand) bot.use(fvCommand);
  const slash = slashCommand({ commands: buildCommandList(account, { getRuntime: opts.getRuntime }) });
  bot.use(slash.middleware);
  const __qqLegacyGuard = concurrencyGuard({
    strategy: "merge",
    maxQueue: 50,
    maxProcessingMs: account.processingTimeoutMs,
    /** 紧急指令（/stop）跳过排队，立即处理 */
    urgentPredicate: (ctx) => {
      return (ctx.message.content ?? "").trim() === "/stop";
    },
    onMerge: (buffered) => {
      const last = buffered[buffered.length - 1];
      if (buffered.length === 1) return last;
      last.state.__qqMergedSources = __qqMergedSources(buffered);
      last.state.mergedMessages = buffered;
      __qqDeadlineMerge(last, buffered);
      const attachments = buffered.flatMap((c) => __qqSourceAttachments(c));
      __qqQueueDiag(last,"merge", { sourceCount:buffered.length, senderCount:new Set(buffered.map(c=>c.message.senderId)).size, mediaCount:attachments.length, resolvedDisposition:"last-current-speaker" });
      if (attachments.length > 0) {
        last.message.attachments = attachments;
      }
      delete last.state.assembledBody;
      return last;
    }
  });
  bot.use(__qqSteerIngressGuard(__qqLegacyGuard, account));
  bot.use(typingIndicator());
  bot.use(quoteRef({
    store: getPersistedRefIndexStore(account.accountId)
  }));
  bot.use(attachmentProcessor({ getRuntime: opts.getRuntime }));
  bot.use(envelopeFormatter({
    format: (ctx) => {
      const assembled = assembleBody(ctx, ctx.message, account, opts.getRuntime);
      ctx.state.assembledBody = assembled;
      return assembled.agentBody;
    }
  }));
}

// src/dispatch/envelope-builder.ts
function mapHistory(entries) {
  if (!entries || entries.length === 0) return void 0;
  return entries.map((e) => ({
    role: "user",
    content: e.content,
    senderId: e.senderId,
    senderName: e.senderName
  }));
}
function mapQuote(quote) {
  if (!quote) return void 0;
  return {
    content: quote.text,
    senderId: quote.entry?.senderId ?? "",
    attachments: quote.attachments
  };
}
function buildEnvelope2(ctx, msg, account) {
  const scope = msg.replyTarget.scope;
  const targetId = scope === "group" ? `qqbot:group:${msg.replyTarget.targetId}` : `qqbot:c2c:${msg.replyTarget.targetId}`;
  const envelope = ctx.state.envelope;
  let content = envelope ?? msg.content;
  const processed = ctx.state.processedAttachments;
  if (processed) {
    const parts = [];
    if (processed.voiceText) {
      parts.push(processed.voiceText);
    }
    if (content) {
      parts.push(content);
    }
    if (processed.otherInfo) {
      parts.push(processed.otherInfo);
    }
    content = parts.join("\n");
  }
  return {
    channelId: "qqbot",
    accountId: account.accountId,
    targetId,
    chatScope: scope === "group" ? "group" : "direct",
    senderId: msg.senderId,
    senderName: msg.senderName,
    messageId: msg.messageId,
    content,
    history: mapHistory(ctx.state.history),
    quote: mapQuote(ctx.state.quote),
    attachments: msg.attachments,
    imageUrls: processed?.imageUrls,
    groupId: scope === "group" ? msg.replyTarget.targetId : void 0,
    systemPrompt: account.systemPrompt
  };
}

// src/outbound/media-send.ts
var path16 = __toESM(require("path"), 1);
var fs18 = __toESM(require("fs"), 1);
var os5 = __toESM(require("os"), 1);

// src/adapter/workspace.ts
var import_node_module3 = require("module");
var req2 = (0, import_node_module3.createRequire)(__filename);
var health = null;
function resolveAgentWorkspace(cfg, agentId) {
  if (!health) {
    try {
      health = req2("openclaw/plugin-sdk/health");
    } catch {
      health = null;
    }
  }
  if (health) {
    return health.resolveAgentWorkspaceDir(cfg, agentId ?? health.resolveDefaultAgentId(cfg));
  }
  return getQQBotMediaDir();
}

// src/outbound/media-send.ts
init_resolve();

// src/utils/ssrf-guard.ts
var import_node_net = __toESM(require("net"), 1);
var import_promises = __toESM(require("dns/promises"), 1);
var RESERVED_V4_PREFIXES = [
  "127.",
  // loopback
  "10.",
  // class-A private
  "192.168.",
  // class-C private
  "169.254."
  // link-local / cloud metadata
];
var PRIVATE_172_RE = /^172\.(1[6-9]|2\d|3[01])\./;
function isReservedAddr(ip) {
  if (ip === "0.0.0.0") return true;
  for (const pfx of RESERVED_V4_PREFIXES) {
    if (ip.startsWith(pfx)) return true;
  }
  if (PRIVATE_172_RE.test(ip)) return true;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}
var ALLOWED_SCHEMES = /* @__PURE__ */ new Set(["http:", "https:"]);
var QQ_TRUSTED_DOMAINS = /* @__PURE__ */ new Set([
  // QQ Bot API
  "api.sgroup.qq.com",
  "sandbox.api.sgroup.qq.com",
  // QQ Bot Token
  "bots.qq.com",
  // QQ 多媒体上传/下载
  "multimedia.nt.qq.com.cn",
  "multimedia.nt.qq.com",
  // QQ 群文件
  "grouppro.grouppro.qq.com"
]);
function isQQTrustedDomain(hostname) {
  if (QQ_TRUSTED_DOMAINS.has(hostname)) return true;
  const dot = hostname.indexOf(".");
  if (dot > 0) {
    const parent = hostname.slice(dot + 1);
    return QQ_TRUSTED_DOMAINS.has(parent);
  }
  return false;
}
async function validateRemoteUrl(raw) {
  const url = new URL(raw);
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new Error(
      `\u4E0D\u652F\u6301\u7684\u534F\u8BAE "${url.protocol}"\uFF0C\u4EC5\u5141\u8BB8 http/https\uFF08URL: ${raw}\uFF09`
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isQQTrustedDomain(host)) return;
  if (import_node_net.default.isIP(host)) {
    assertPublicAddr(host, raw);
    return;
  }
  try {
    const ips = await import_promises.default.resolve(host);
    for (const ip of ips) {
      assertPublicAddr(ip, raw, host);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("\u5185\u7F51")) throw err;
    console.warn(`[url-check] DNS \u89E3\u6790 "${host}" \u5931\u8D25: ${err}`);
  }
}
function assertPublicAddr(ip, originalUrl, domain) {
  if (!isReservedAddr(ip)) return;
  const target = domain ? `\u57DF\u540D "${domain}" \u89E3\u6790\u5230\u5185\u7F51\u5730\u5740 "${ip}"` : `\u5185\u7F51\u5730\u5740 "${ip}"`;
  throw new Error(
    `\u7981\u6B62\u8BBF\u95EE${target}\uFF0C\u5DF2\u62E6\u622A\u6F5C\u5728\u7684 SSRF \u8BF7\u6C42\uFF08URL: ${originalUrl}\uFF09`
  );
}

// src/outbound/target.ts
var OPENID_HEX_RE = /^[0-9a-fA-F]{32}$/;
var OPENID_UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var QQBOT_PREFIX_RE = /^qqbot:(c2c|group|channel):/i;
var SCOPE_PREFIX_RE = /^(c2c|group|channel):/i;
function isQQBotTarget(id) {
  if (QQBOT_PREFIX_RE.test(id)) return true;
  if (SCOPE_PREFIX_RE.test(id)) return true;
  if (OPENID_HEX_RE.test(id)) return true;
  return OPENID_UUID_RE.test(id);
}
function normalizeTarget2(target) {
  const id = target.replace(/^qqbot:/i, "");
  if (id.startsWith("c2c:") || id.startsWith("group:") || id.startsWith("channel:")) {
    return `qqbot:${id}`;
  }
  if (OPENID_HEX_RE.test(id)) return `qqbot:c2c:${id}`;
  if (OPENID_UUID_RE.test(id)) return `qqbot:c2c:${id}`;
  return void 0;
}
function parseTarget2(to) {
  const id = to.replace(/^qqbot:/i, "");
  if (id.startsWith("c2c:")) {
    return { scope: "c2c", targetId: id.slice(4) };
  }
  if (id.startsWith("group:")) {
    return { scope: "group", targetId: id.slice(6) };
  }
  return { scope: "c2c", targetId: id };
}

// src/outbound/local-file-router.ts
var path15 = __toESM(require("path"), 1);
var fs17 = __toESM(require("fs"), 1);
var os4 = __toESM(require("os"), 1);
function normalizePath(p2) {
  let result = p2;
  if (result.startsWith("file://")) {
    result = result.slice("file://".length);
    if (/^\/[a-zA-Z]:[\\/]/.test(result)) {
      result = result.slice(1);
    }
  }
  try {
    result = decodeURIComponent(result);
  } catch {
  }
  if (result === "~" || result.startsWith("~/") || result.startsWith("~\\")) {
    result = result.replace(/^~/, os4.homedir());
  }
  return result;
}
function isLocalFilePath(source) {
  if (!source) return false;
  if (source.startsWith("http://") || source.startsWith("https://")) return false;
  if (source.startsWith("data:")) return false;
  if (source.startsWith("file://")) return true;
  if (source === "~" || source.startsWith("~/") || source.startsWith("~\\")) return true;
  if (source.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(source)) return true;
  if (source.startsWith("\\\\")) return true;
  if (source.startsWith("./") || source.startsWith("../")) return true;
  if (source.startsWith(".\\") || source.startsWith("..\\")) return true;
  return false;
}
function isDataUrl(source) {
  return source.startsWith("data:");
}
var IMAGE_EXTS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico"]);
var VOICE_EXTS = /* @__PURE__ */ new Set([".wav", ".mp3", ".silk", ".amr", ".ogg", ".flac", ".aac", ".m4a"]);
var VIDEO_EXTS = /* @__PURE__ */ new Set([".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"]);
function inferMediaKind(filePath) {
  const ext = path15.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VOICE_EXTS.has(ext)) return "voice";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "file";
}
function inferMediaKindFromMime(mime) {
  const lower = mime.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/") || lower === "voice") return "voice";
  if (lower.startsWith("video/")) return "video";
  return "file";
}
function isPathInAllowedRoots(absPath, allowedRoots) {
  if (!allowedRoots.length) return false;
  try {
    const real = fs17.realpathSync(absPath);
    return allowedRoots.some((root) => {
      try {
        const rootReal = fs17.existsSync(root) ? fs17.realpathSync(root) : root;
        return real.startsWith(rootReal + path15.sep) || real === rootReal;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// src/outbound/media-send.ts
function resolveTempRoots() {
  const roots = /* @__PURE__ */ new Set();
  try {
    const tmp = os5.tmpdir();
    roots.add(fs18.existsSync(tmp) ? fs18.realpathSync(tmp) : tmp);
  } catch {
  }
  if (process.platform !== "win32") {
    try {
      roots.add(fs18.realpathSync("/tmp"));
    } catch {
    }
  }
  return [...roots];
}
function buildDynamicAllowedRoots(workspaceDir) {
  const home = os5.homedir();
  const derivedBase = workspaceDir ? path16.dirname(workspaceDir) : path16.join(home, ".openclaw");
  const roots = [];
  const added = /* @__PURE__ */ new Set();
  const addRoot = (p2) => {
    try {
      const real = fs18.existsSync(p2) ? fs18.realpathSync(p2) : p2;
      if (!added.has(real)) {
        added.add(real);
        roots.push(real);
      }
    } catch {
    }
  };
  const knownBases = [path16.join(home, ".openclaw"), path16.join(home, ".openclaw-dev")];
  if (workspaceDir) {
    addRoot(path16.join(derivedBase, "media"));
    addRoot(path16.join(derivedBase, "workspace"));
    addRoot(path16.join(derivedBase, "outbound"));
    addRoot(workspaceDir);
  }
  for (const base of knownBases) {
    addRoot(path16.join(base, "media"));
    addRoot(path16.join(base, "workspace"));
    addRoot(path16.join(base, "outbound"));
  }
  for (const t of resolveTempRoots()) addRoot(t);
  return roots;
}
var MAX_DATA_URL_BYTES = 10 * 1024 * 1024;
async function sendMedia(params) {
  const { source, accountId, log: log4 } = params;
  const mlog = log4?.child("media");
  if (!source) {
    mlog?.error("source is empty");
    return { error: "sendMedia: source is required" };
  }
  const wsDir = resolveWorkspaceFromAgent(params.agentId);
  mlog?.debug(`resolveMediaPath source=${source} agentId=${params.agentId ?? "none"} workspaceDir=${wsDir ?? "none"}`);
  const resolved = await resolveMediaPath(source, mlog, wsDir);
  if (!resolved.ok) {
    mlog?.error(`resolveMediaPath failed: ${resolved.error}`);
    return { error: resolved.error };
  }
  const kind = params.mediaKind ?? (params.mimeType ? inferMediaKindFromMime(params.mimeType) : void 0) ?? inferMediaKind(resolved.path);
  const gw = getGateway(accountId);
  if (!gw) {
    return { error: `Bot "${accountId}" not running` };
  }
  const target = parseTarget2(params.to);
  switch (kind) {
    case "voice":
      return sendVoiceMedia(gw, target, resolved.path, params);
    case "video":
      return sendVideoMedia(gw, target, resolved.path, params);
    case "file":
      return sendFileMedia(gw, target, resolved.path, params);
    case "image":
    default:
      return sendImageMedia(gw, target, resolved.path, params);
  }
}
async function resolveMediaPath(source, log4, workspaceDir) {
  const normalized = normalizePath(source);
  if (isDataUrl(normalized)) {
    if (normalized.length > MAX_DATA_URL_BYTES) {
      const sizeMB = (normalized.length / (1024 * 1024)).toFixed(1);
      return { ok: false, error: `Data URL \u8FC7\u5927\uFF08${sizeMB}MB\uFF0C\u6700\u5927 10MB\uFF09` };
    }
    return { ok: true, path: normalized, isLocal: false };
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      await validateRemoteUrl(normalized);
    } catch (err) {
      log4?.warn(`SSRF blocked for media URL: ${normalized}`);
      return { ok: false, error: `\u5A92\u4F53 URL \u88AB SSRF \u9632\u62A4\u62E6\u622A: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { ok: true, path: normalized, isLocal: false };
  }
  if (!isLocalFilePath(normalized)) {
    const resolved2 = resolveWorkingFile(normalized, workspaceDir);
    if (resolved2) {
      return { ok: true, path: resolved2, isLocal: true };
    }
    return { ok: true, path: normalized, isLocal: false };
  }
  const resolved = path16.resolve(normalized);
  if (!fs18.existsSync(resolved)) {
    return { ok: false, error: `File not found: ${resolved}` };
  }
  let real;
  try {
    real = fs18.realpathSync(resolved);
  } catch {
    return { ok: false, error: `Cannot resolve path: ${resolved}` };
  }
  const dynamicRoots = buildDynamicAllowedRoots(workspaceDir);
  const allowed = isPathInAllowedRoots(real, dynamicRoots);
  if (!allowed) {
    log4?.warn(`path blocked \u2014 not in allowed directory: ${real}`);
    return { ok: false, error: `\u6587\u4EF6\u8DEF\u5F84\u4E0D\u5728\u5141\u8BB8\u7684\u76EE\u5F55\u4E2D` };
  }
  return { ok: true, path: real, isLocal: true };
}
function resolveWorkspaceFromAgent(agentId) {
  const cfg = resolveConfigViaAdapter();
  if (!cfg) return void 0;
  return resolveAgentWorkspace(cfg, agentId);
}
function resolveConfigViaAdapter() {
  try {
    const rt = tryGetQQBotRuntime();
    if (!rt) return void 0;
    return getAdapters(rt).getConfig?.();
  } catch {
    return void 0;
  }
}
function resolveWorkingFile(name, workspaceDir) {
  for (const p2 of [path16.resolve(name), workspaceDir ? path16.join(workspaceDir, name) : null]) {
    if (p2 && fs18.existsSync(p2)) return p2;
  }
  return null;
}
async function sendImageMedia(gw, target, source, params) {
  try {
    const result = await gw.sendMedia(target, source, {
      text: params.text,
      msgId: params.replyToId
    });
    return { messageId: result.id };
  } catch (err) {
    return { error: formatErr(err), ...err?.sendState ? { sendState: err.sendState } : {} };
  }
}
async function sendVoiceMedia(gw, target, source, params) {
  const voiceSource = resolveVoiceSource(source);
  try {
    const result = await gw.sendVoice(target, voiceSource, {
      msgId: params.replyToId
    });
    return { messageId: result.id };
  } catch (err) {
    if (err?.sendState === "uncertain" || err?.name === "AbortError") return formatError(err);
    params.log?.child("media")?.warn(`sendVoice failed (${formatErr(err)}), falling back to sendFile`);
    try {
      const fileName = path16.basename(source);
      const fallback = await gw.sendFile(target, source, {
        text: params.text,
        msgId: params.replyToId,
        fileName
      });
      return { messageId: fallback.id, fallback: true };
    } catch (fallbackErr) {
      return { error: `voice: ${formatErr(err)} | fallback file: ${formatErr(fallbackErr)}`, ...fallbackErr?.sendState ? { sendState: fallbackErr.sendState } : {} };
    }
  }
}
async function sendVideoMedia(gw, target, source, params) {
  try {
    const result = await gw.sendVideo(target, source, {
      text: params.text,
      msgId: params.replyToId
    });
    return { messageId: result.id };
  } catch (err) {
    return { error: formatErr(err), ...err?.sendState ? { sendState: err.sendState } : {} };
  }
}
async function sendFileMedia(gw, target, source, params) {
  try {
    const fileName = path16.basename(source);
    const result = await gw.sendFile(target, source, {
      text: params.text,
      msgId: params.replyToId,
      fileName
    });
    return { messageId: result.id };
  } catch (err) {
    return { error: formatErr(err), ...err?.sendState ? { sendState: err.sendState } : {} };
  }
}
function resolveVoiceSource(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return { url: source };
  }
  if (source.startsWith("data:") || !source.startsWith("/") && !source.startsWith("./") && !source.startsWith("../") && !source.startsWith("~")) {
    const commaIdx = source.indexOf(",");
    return { base64: commaIdx > 0 ? source.slice(commaIdx + 1) : source };
  }
  return { localPath: source };
}
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

// src/utils/log-text-preview.ts
var LOG_TEXT_PREVIEW_MAX = 200;
function formatLogTextPreview(text, maxChars = LOG_TEXT_PREVIEW_MAX) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const clipped = collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}...` : collapsed;
  return ` text=${JSON.stringify(clipped)}`;
}

// src/outbound/deliver-pipeline.ts
var path17 = __toESM(require("path"), 1);
var os6 = __toESM(require("os"), 1);
function resolveMediaUrls(payload) {
  if (payload.mediaUrls?.length) {
    return payload.mediaUrls.filter(Boolean);
  }
  if (payload.mediaUrl) {
    return [payload.mediaUrl];
  }
  return resolveAttachmentPaths(payload);
}
function resolveAttachmentPaths(payload) {
  const attachments = payload.attachments;
  if (!attachments?.length) return [];
  return attachments.map((a) => a.url ?? a.path).filter((p2) => typeof p2 === "string" && p2.length > 0);
}
async function deliverReply(payload, _info, ctx) {
  const text = payload.text?.trim() ?? "";
  const mediaUrls = resolveMediaUrls(payload);
  const hasMedia = mediaUrls.length > 0;
  ctx.log?.debug(
    `[text] textLen=${text.length} mediaCount=${mediaUrls.length}${formatLogTextPreview(text)}`
  );
  if (payload.audioAsVoice) {
    if (ctx.textToSpeech && text) {
      const handled = await handleVoiceIntent(text, ctx);
      if (handled) {
        return;
      }
    }
  }
  if (hasMedia) {
    await sendMediaUrls(ctx, mediaUrls);
    if (text) {
      const result = await ctx.sendText(ctx.qualifiedTarget, text);
      if (result.error) {
        ctx.log?.error(`[media] sendText failed: ${result.error}`);
      }
    }
    return;
  }
  if (!text) return;
  if (ctx.debouncer) {
    await ctx.debouncer.enqueue(ctx.qualifiedTarget, text);
  } else {
    const result = await ctx.sendText(ctx.qualifiedTarget, text);
    if (result.error) {
      ctx.log?.error(`[text] sendText failed: ${result.error}`);
    }
    return result;
  }
}
async function sendMediaUrls(ctx, urls) {
  const failedUrls = [];
  for (const url of urls) {
    const result = await ctx.sendMedia(ctx.qualifiedTarget, url, { text: "" });
    if (result.error) {
      ctx.log?.error(`[media] ${result.error}`);
      failedUrls.push(url);
    }
  }
  if (failedUrls.length > 0) {
    const count = failedUrls.length;
    const total = urls.length;
    const failMsg = count === total ? `\u26A0\uFE0F \u5A92\u4F53\u53D1\u9001\u5931\u8D25\uFF08${count} \u4E2A\uFF09\uFF0C\u8BF7\u91CD\u8BD5` : `\u26A0\uFE0F ${count}/${total} \u4E2A\u5A92\u4F53\u53D1\u9001\u5931\u8D25`;
    const textResult = await ctx.sendText(ctx.qualifiedTarget, failMsg);
    if (textResult.error) {
      ctx.log?.error(`[media] failed to send failure notification: ${textResult.error}`);
    }
  }
}
async function handleVoiceIntent(text, ctx) {
  if (!text || !ctx.textToSpeech) return false;
  if (ctx.chatScope && ctx.chatScope !== "direct" && ctx.chatScope !== "group") {
    return false;
  }
  try {
    const ttsResult = await ctx.textToSpeech({
      text,
      cfg: ctx.cfg,
      channel: "qqbot",
      accountId: ctx.accountId
    });
    if (!ttsResult.audioPath) {
      ctx.log?.error(`[tts] TTS failed: ${ttsResult.error ?? "no audio path returned"}`);
      return false;
    }
    if (!isTtsPathSafe(ttsResult.audioPath)) {
      ctx.log?.error(`[tts] TTS audio path blocked: ${ttsResult.audioPath}`);
      return false;
    }
    if (ctx.audioFileToSilkBase64) {
      const silkBase64 = await ctx.audioFileToSilkBase64(ttsResult.audioPath);
      if (silkBase64) {
        const result2 = await ctx.sendMedia(ctx.qualifiedTarget, silkBase64, { mediaKind: "voice" });
        if (result2.error) ctx.log?.error(`[tts] sendVoice(base64) failed: ${result2.error}`);
        return !result2.error;
      }
      ctx.log?.error(`[tts] SILK conversion failed, trying localPath fallback`);
    }
    const result = await ctx.sendMedia(ctx.qualifiedTarget, ttsResult.audioPath, { mediaKind: "voice" });
    if (result.error) {
      ctx.log?.error(`[tts] sendVoice(localPath) failed: ${result.error}`);
      return false;
    }
    return true;
  } catch (err) {
    ctx.log?.error(`[tts] TTS/voice send failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
var TTS_ALLOWED_ROOTS = [
  path17.join(os6.homedir(), ".openclaw"),
  os6.tmpdir(),
  "/tmp"
];
function isTtsPathSafe(audioPath) {
  if (!path17.isAbsolute(audioPath)) return false;
  return isPathInAllowedRoots(audioPath, TTS_ALLOWED_ROOTS);
}

// src/dispatch/ctx-builder.ts
function buildCtxPayload(params) {
  const { assembled, envelope, route, msg, ctx, adapters } = params;
  const isSlashCommand = /^\//.test(assembled.rawBody ?? "");
  const convKind = envelope.chatScope === "group" ? "group" : "direct";
  const peerId = convKind === "group" ? envelope.groupId ?? envelope.senderId : envelope.senderId;
  const groupId = convKind === "group" ? envelope.groupId : void 0;
  const processed = ctx.state.processedAttachments;
  const voicePaths = processed?.localMediaPaths?.filter((_2, i) => processed.localMediaTypes?.[i]?.startsWith("audio/")) ?? [];
  const voiceUrls = processed?.remoteMediaUrls?.filter((_2, i) => processed.remoteMediaUrls?.[i]?.startsWith?.("audio/")) ?? [];
  const msgTimestamp = msg.timestamp ?? msg.Timestamp;
  return adapters.buildInboundContext?.({
    channel: "qqbot",
    accountId: route.accountId,
    provider: "qqbot",
    surface: "qqbot",
    messageId: envelope.messageId,
    timestamp: msgTimestamp ? new Date(msgTimestamp).getTime() : Date.now(),
    from: envelope.targetId,
    sender: { id: envelope.senderId, name: envelope.senderName },
    conversation: {
      kind: convKind,
      id: peerId,
      label: assembled.systemPrompt
    },
    message: {
      body: assembled.webBody,
      bodyForAgent: assembled.agentBody,
      rawBody: assembled.rawBody,
      commandBody: assembled.rawBody
    },
    route: {
      agentId: route.agentId ?? "default",
      routeSessionKey: route.sessionKey,
      accountId: route.accountId
    },
    reply: {
      to: envelope.targetId,
      replyToId: envelope.messageId,
      originatingTo: envelope.targetId
    },
    access: {
      commands: { authorized: isSlashCommand }
    },
    command: isSlashCommand ? { kind: "text-slash", body: assembled.rawBody, authorized: true } : void 0,
    // Preserve image/audio/file order; do not index unfiltered types with filtered voice positions.
    media: processed?.orderedMediaFacts?.length ? processed.orderedMediaFacts.map(({path,localPath,url,contentType,messageId}) => ({path,localPath,url,contentType,messageId})) : voiceUrls.length > 0 ? voiceUrls.map((u2) => ({contentType:"audio/wav",url:u2})) : void 0,
    supplemental: {
      quote: envelope.quote ? { id: envelope.messageId, body: envelope.quote.content, sender: envelope.quote.senderId } : void 0,
      groupSystemPrompt: envelope.systemPrompt
    },
    extra: {
      ...isSlashCommand ? { CommandSource: "text" } : {},
      ...groupId ? { QQGroupOpenid: groupId } : {},
      ...processed?.localMediaPaths?.length ? {
        MediaPaths: processed.localMediaPaths,
        MediaPath: processed.localMediaPaths[0],
        MediaTypes: processed.localMediaTypes,
        MediaType: processed.localMediaTypes?.[0]
      } : {},
      ...processed?.remoteMediaUrls?.length ? {
        MediaUrls: processed.remoteMediaUrls,
        MediaUrl: processed.remoteMediaUrls[0]
      } : {}
    }
  });
}

// src/outbound/debounce.ts
var DEFAULT_WINDOW_MS = 1500;
var DEFAULT_MAX_WAIT_MS = 8e3;
var DEFAULT_SEPARATOR = "\n\n---\n\n";
var DeliverDebouncer = class {
  pending = /* @__PURE__ */ new Map();
  windowMs;
  maxWaitMs;
  separator;
  flush;
  constructor(config, flush) {
    this.windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxWaitMs = config?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.separator = config?.separator ?? DEFAULT_SEPARATOR;
    this.flush = flush;
  }
  get enabled() {
    return this.windowMs > 0;
  }
  /**
   * 入队一条纯文本待发送消息
   * @returns Promise，在文本实际发送时 resolve
   */
  async enqueue(targetId, text) {
    if (!this.enabled) {
      await this.flush(targetId, text);
      return;
    }
    const existing = this.pending.get(targetId);
    if (existing) {
      existing.texts.push(text);
      if (existing.timer) clearTimeout(existing.timer);
      if (Date.now() - existing.firstAt >= this.maxWaitMs) {
        await this.doFlush(targetId);
      } else {
        existing.timer = setTimeout(() => this.doFlush(targetId), this.windowMs);
      }
      return;
    }
    return new Promise((resolve2) => {
      const pending = {
        texts: [text],
        firstAt: Date.now(),
        timer: setTimeout(() => this.doFlush(targetId), this.windowMs),
        resolve: resolve2
      };
      this.pending.set(targetId, pending);
    });
  }
  async doFlush(targetId) {
    const pending = this.pending.get(targetId);
    if (!pending) return;
    this.pending.delete(targetId);
    if (pending.timer) clearTimeout(pending.timer);
    const merged = pending.texts.join(this.separator);
    try {
      await this.flush(targetId, merged);
    } finally {
      pending.resolve();
    }
  }
  /**
   * 强制刷新所有 pending
   */
  async flushAll() {
    const keys = [...this.pending.keys()];
    await Promise.all(keys.map((k) => this.doFlush(k)));
  }
};

// src/outbound/streaming-controller.ts
var StreamingController = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  phase = "idle";
  session = null;
  /** QQ 已接受的最新文本 — 单源真理 */
  lastAcceptedFull = "";
  /** 已成功发送的分片数（降级：=0 则走静态消息兜底） */
  sentChunkCount = 0;
  /** 同步标志：收到第一个 onPartialReply 即置 true（不等 async 完成） */
  _hasStarted = false;
  /** 串行队列 */
  chain = Promise.resolve();
  // ── 公共访问器 ──
  get currentPhase() {
    return this.phase;
  }
  /** 是否已成功发送至少一个流式分片 */
  get hasSentChunks() {
    return this.sentChunkCount > 0;
  }
  /** 同步标志：流式已启动（不等异步完成），用于 final 去重 */
  get hasStarted() {
    return this._hasStarted;
  }
  get isTerminal() {
    return this.phase === "done" || this.phase === "failed";
  }
  get shouldFallbackToStatic() {
    return this.isTerminal && this.sentChunkCount === 0;
  }
  // ── 入口 ──
  onPartialReply(text) {
    this._hasStarted = true;
    this.chain = this.chain.then(() => this.handleChunk(text)).catch((err) => {
      this.deps.log?.error(`onPartialReply error: ${err instanceof Error ? err.message : String(err)}`);
      this.transition("failed", "chunk_error");
    });
    return this.chain;
  }
  finalize() {
    this.chain = this.chain.then(() => this.handleFinalize()).catch((err) => {
      this.deps.log?.error(`finalize error: ${err instanceof Error ? err.message : String(err)}`);
      this.transition("failed", "finalize_error");
    });
    return this.chain;
  }
  cancelPending(reason) {
    // Cancel throttled frames without manufacturing a DONE frame with unsent text.
    this.session?.cancel?.();
    this.session = null;
    this.transition("failed", `cancel:${reason ?? "request-aborted"}`);
  }
  async abort(reason) {
    if (this.isTerminal) return;
    this.deps.log?.warn(`aborting stream reason=${reason ?? "manual"} sent=${this.sentChunkCount}`);
    if (this.session) {
      try {
        await this.session.complete();
      } catch (e) {
        this.deps.log?.error(`abort complete failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.session = null;
    }
    this.transition("failed", `abort:${reason ?? "manual"}`);
  }
  // ── 核心逻辑 ──
  async handleChunk(text) {
    if (this.deps.abortSignal?.aborted || this.isTerminal || !text) return;
    if (prefixMatches(this.lastAcceptedFull, text)) {
      if (text.length !== this.lastAcceptedFull.length) {
        await this.sendUpdate(text);
      }
      return;
    }
    if (!this.lastAcceptedFull) {
      await this.sendUpdate(text);
      return;
    }
    if (text.length < this.lastAcceptedFull.length) {
      this.deps.log?.info(`new reply: lastAccepted=${this.lastAcceptedFull.length}\u2192chunk=${text.length}`);
      await this.completeSession("new_reply");
      this.lastAcceptedFull = "";
      await this.sendUpdate(text);
      return;
    }
    const commonLen = longestCommonPrefix(this.lastAcceptedFull, text);
    const extra = text.slice(Math.max(commonLen, 0));
    const merged = this.lastAcceptedFull + extra;
    this.deps.log?.warn(
      `prefix retry: lastAccepted=${this.lastAcceptedFull.length}\u2192chunk=${text.length} common=${commonLen} extra=${extra.length}, appending`
    );
    await this.sendUpdate(merged);
  }
  async handleFinalize() {
    if (this.deps.abortSignal?.aborted) { this.cancelPending("request-aborted"); return; }
    if (this.isTerminal) return;
    if (this.session) {
      await this.completeSession();
      this.transition("done", "finalize");
      this.deps.log?.info(`stream done chunks=${this.sentChunkCount} chars=${this.lastAcceptedFull.length}`);
      return;
    }
    if (this.sentChunkCount > 0) {
      this.transition("done", "finalize:no_session");
    } else {
      this.transition("failed", "finalize:fallback");
    }
  }
  // ── QQ 交互 ──
  async sendUpdate(text) {
    this.deps.assertActive?.();
    if (!this.session) {
      this.session = this.deps.gateway.openStream(this.deps.target, this.deps.replyToId);
      if (this.session.opts) this.session.opts.abortSignal = this.deps.abortSignal;
      this.transition("streaming", "first_chunk");
      this.deps.log?.info(`stream opened (firstChunk=${text.length})`);
    }
    try {
      await this.session.update(text);
      this.lastAcceptedFull = text;
      this.sentChunkCount++;
    } catch (err) {
      this.deps.log?.error(`update failed (len=${text.length}): ${err instanceof Error ? err.message : String(err)}`);
      this.session = null;
      this.transition("failed", "update_error");
    }
  }
  async completeSession(reason) {
    if (!this.session) return;
    this.deps.log?.info(`completing stream (sent=${this.sentChunkCount} chars=${this.lastAcceptedFull.length} reason=${reason ?? "done"})`);
    try {
      await this.session.complete();
    } catch (err) {
      this.deps.log?.error(`complete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.session = null;
  }
  // ── 状态机 ──
  transition(next, reason) {
    if (this.phase === next) return;
    this.deps.log?.info(`phase: ${this.phase} \u2192 ${next} (${reason})`);
    this.phase = next;
  }
};
function normalizeWs(s) {
  return s.replace(/\s+/g, " ");
}
function prefixMatches(accepted, incoming) {
  if (incoming.startsWith(accepted)) return true;
  return normalizeWs(incoming).startsWith(normalizeWs(accepted));
}
function longestCommonPrefix(a, b2) {
  let i = 0;
  while (i < a.length && i < b2.length && a[i] === b2[i]) i++;
  return i;
}
function shouldUseStreaming(account, targetScope) {
  if (targetScope !== "c2c") return false;
  const streaming = account.config?.streaming;
  if (typeof streaming === "boolean") return streaming;
  if (streaming && typeof streaming === "object") {
    return streaming.mode !== "off";
  }
  return false;
}

// src/dispatch/dispatch.ts
init_resolve();

// src/dispatch/reply-options.ts
var QQBOT_MONITORED_AGENT_EVENTS = [
  "onAssistantMessageStart",
  "onToolStart",
  "onToolResult",
  "onBlockReplyQueued",
  "onReasoningStream",
  "onReasoningEnd",
  "onItemEvent",
  "onPlanUpdate",
  "onApprovalEvent",
  "onCommandOutput",
  "onPatchSummary",
  "onCompactionStart",
  "onCompactionEnd",
  "onModelSelected"
];
var EVENT_SUMMARY_KEYS = [
  "name",
  "phase",
  "status",
  "kind",
  "title",
  "toolCallId",
  "itemId",
  "provider",
  "model"
];
function createQqbotReplyOptions(params) {
  const { abortSignal, runId, streamingController, log: log4 } = params;
  const eventLog = log4?.child("agent");
  return {
    abortSignal,
    runId,
    disableBlockStreaming: false,
    commentaryPayloadsEnabled: true,
    allowToolLifecycleWhenProgressHidden: true,
    suppressDefaultToolProgressMessages: true,
    forceToolResultProgress: true,
    ...createMonitoredAgentEventHandlers(eventLog),
    ...streamingController ? {
      onPartialReply: async (payload) => {
        const text = payload.text ?? "";
        eventLog?.debug(`onPartialReply textLen=${text.length}`);
        if (!text) return false;
        await streamingController.onPartialReply(text);
        return true;
      }
    } : {
      onPartialReply: (payload) => {
        eventLog?.debug(`onPartialReply${summarizeAgentEvent(payload)}`);
        return false;
      }
    }
  };
}
function createMonitoredAgentEventHandlers(log4) {
  const handlers = {};
  for (const name of QQBOT_MONITORED_AGENT_EVENTS) {
    handlers[name] = function monitorAgentEvent(payload) {
      log4?.debug(`${name}${summarizeAgentEvent(payload)}`);
      return false;
    };
  }
  return handlers;
}
function summarizeAgentEvent(payload) {
  if (payload == null || typeof payload !== "object") {
    return "";
  }
  const rec = payload;
  const bits = [];
  for (const key of EVENT_SUMMARY_KEYS) {
    const value = rec[key];
    if (value == null || value === "") continue;
    bits.push(`${key}=${String(value)}`);
  }
  return bits.length > 0 ? ` ${bits.join(" ")}` : "";
}


/* QQ-GROUP-SILENCE-COMPAT v3: group output only; inbound dispatch and core token policy unchanged. */
function __qqSilentReplyCanonicalText(text) {
  let t = String(text ?? "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/<[^>]+>/g, "").trim();
  const fence = /^(`{3,}|~{3,})(?:[A-Za-z0-9_-]*[ \t]*\r?\n)?([\s\S]*?)\1$/.exec(t);
  if (fence) t = fence[2].trim();
  else {
    const inline = /^(`{1,2})([^`]*?)\1$/.exec(t);
    if (inline) t = inline[2].trim();
  }
  return t;
}
function __qqIsStandaloneSilentReply(text) {
  return /^no[\s_\-]*reply$/i.test(__qqSilentReplyCanonicalText(text));
}
function __qqHasPlainEmoticon(text) {
  return /(?:[:;=][-^']?[()\/\\|*]|[-^=＾￣][_.＿．▽︿﹏][-^=＾￣]|[><][_.]?[><]|\^{2,3})/u.test(text);
}
/* End QQ-GROUP-SILENCE-COMPAT helpers. */

/* QQ-SEGMENT-PATCH v1 */
var __QQSEG_DEFAULTS = { enabled: true, minChars: 14, lookaheadChars: 16, maxSegments: 3 };
var __QQSEG_SILENT_TAIL_RE = /(^|[^A-Za-z])N(O([\s_\-]*(R(E(P(L)?)?)?)?)?)?$/;
var __QQSEG_NARRATION_RE = /插(嘴|话)|安静|沉默|不打扰|打扰|围观|看戏|旁观|潜水|路过|看着就好|不(回复|出声|接话|吭声|说话)|先不说|与我无关|跟我无关|和我无关|不关我的事|stay[_\s-]*silent|HEARTBEAT/i;
var __QQSEG_UNSAFE_RE = /<[A-Za-z\/!]|\[\[|MEDIA:|```|^\s*\|/m;
var __QQSEG_LISTY_RE = /^\s*([-*•]|\d+[.、)])\s/m;
function __qqSegFindBoundary(text, from, minChars) {
  const listy = __QQSEG_LISTY_RE.test(text);
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    let end = -1;
    if (c === "\n") {
      if (text[i + 1] === "\n" || !listy) end = i;
      else continue;
    } else if (!listy && (c === "\u3002" || c === "\uff01" || c === "\uff1f" || c === "!" || c === "?")) {
      let j = i + 1;
      while (j < text.length && /[\u3002\uff01\uff1f!?\u2026\u300d\u300f\u201d"'\uff09)\]\uff5e~]/.test(text[j])) j++;
      let k = j;
      while (k < text.length && k - j < 20 && !/[\s\p{Script=Han}A-Za-z0-9]/u.test(text[k])) k++;
      if (k >= text.length) continue;
      if (/[\s\p{Script=Han}A-Za-z0-9]/u.test(text[k])) j = k;
      end = j;
    } else continue;
    if (text.slice(from, end).trim().length >= minChars) return end;
  }
  return -1;
}
function __qqSegCreate(account, deliverCtx, log4) {
  const cfg = { ...__QQSEG_DEFAULTS, ...(account?.config?.groupSegment ?? {}) };
  /* QQ-FAST-FIRST-SENTENCE-PATCH v1: shorten only the new group's lookahead; preserve boundaries and caps. */
  if (process.env.OPENCLAW_QQ_FAST_FIRST_SENTENCE !== "0" && __qqDualScopeQualifiedGroup(deliverCtx?.qualifiedTarget) !== null) cfg.lookaheadChars = Math.min(4, Number(cfg.lookaheadChars) || 16);

  if (cfg.enabled === false) return null;
  const maxEarly = Math.max(0, Math.min(4, Math.floor(Number(cfg.maxSegments) || 3) - 1));
  const minChars = Math.max(4, Math.floor(Number(cfg.minChars) || 14));
  const lookahead = Math.max(4, Math.floor(Number(cfg.lookaheadChars) || 16));
  /* QQ-SEGMENT-BLOCK-RECONCILE-PATCH v1 */
  const st = { sentLen: 0, prefix: "", segments: [], confirmedPrefix: "", confirmedSegments: [], deliveryFailed: false, finalKey: null, finalRest: null, consumed: false, chain: Promise.resolve(), disabled: false, sawPartial: false, t0: Date.now() };
  const info = (m) => { try { log4?.info?.(`[qq-segment] ${m}`); } catch {} };
  const restored = __qqReceipts.confirmedSegments(deliverCtx.__qqReceiptIdentity);
  if (restored.length) {
    st.confirmedSegments = restored.map(record => record.text);
    st.segments = [...st.confirmedSegments];
    st.confirmedPrefix = restored.at(-1).prefix || st.confirmedSegments.join("");
    st.prefix = st.confirmedPrefix;
    st.sentLen = st.prefix.length;
    info(`restored confirmed segments n=${restored.length}`);
  }
  return {
    get sentCount() { return st.consumed ? 0 : st.segments.length; },
    hasRemainderFor(text) { return st.consumed && st.finalKey === String(text ?? "").trim(); },
    onPartial(payload) {
      if (st.disabled || st.consumed || maxEarly === 0) return;
      let text;
      try { text = payload?.text; } catch { return; }
      if (typeof text !== "string" || !text) return;
      if (!st.sawPartial) { st.sawPartial = true; info(`first partial +${Date.now() - st.t0}ms`); }
      text = __qqMtSegView(text); /* QQ-MEDIA-TAG-PATCH v1 */
      if (!text) return;
      if (payload?.replace) { st.disabled = true; info(`stream replaced; stop segmenting (early=${st.segments.length})`); return; }
      if (st.segments.length && !text.startsWith(st.prefix)) { st.disabled = true; info(`stream diverged; stop segmenting`); return; }
      if (__qqIsStandaloneSilentReply(text) || __QQSEG_UNSAFE_RE.test(text) || __QQSEG_NARRATION_RE.test(text)) { st.disabled = true; return; }
      if (__QQSEG_SILENT_TAIL_RE.test(text.trimEnd())) return;
      while (st.segments.length < maxEarly) {
        const end = __qqSegFindBoundary(text, st.sentLen, minChars);
        if (end < 0) break;
        if (text.slice(end).trim().length < lookahead) break;
        const seg = text.slice(st.sentLen, end).trim();
        st.sentLen = end;
        st.prefix = text.slice(0, end);
        if (!seg) continue;
        st.segments.push(seg);
        const idx = st.segments.length;
        const confirmedPrefix = st.prefix;
        st.chain = st.chain.then(async () => {
          if (st.deliveryFailed) return;
          const r = await deliverCtx.sendText(deliverCtx.qualifiedTarget, seg, { receiptOperationId: `reply-segment:${idx}`, receiptMeta: { earlyIndex: idx, confirmedPrefix } });
          if (r?.error || r?.suppressed) {
            st.deliveryFailed = true;
            st.disabled = true;
            info(`early segment #${idx} not confirmed${r?.suppressed ? " (suppressed)" : " (error)"}`);
            return;
          }
          st.confirmedSegments.push(seg);
          st.confirmedPrefix = confirmedPrefix;
          info(`sent early segment #${idx} len=${seg.length} +${Date.now() - st.t0}ms`);
        }).catch((e) => {
          st.deliveryFailed = true;
          st.disabled = true;
          try { log4?.error?.(`[qq-segment] early segment send failed: ${e?.message || e}`); } catch {}
        });
      }
    },
    async settleDelivery() { await st.chain; },
    async finalText(text) {
      const full = String(text ?? "");
      const key = full.trim();
      if (st.consumed) return st.finalKey === key ? st.finalRest : full;
      if (!st.segments.length) return full;
      st.disabled = true;
      await st.chain;
      st.consumed = true;
      const remember = (rest) => { st.finalKey = key; st.finalRest = rest; return rest; };
      if (!st.confirmedSegments.length) return remember(full);
      if (full.startsWith(st.confirmedPrefix)) return remember(full.slice(st.confirmedPrefix.length).trim());
      let rest = full;
      for (const seg of st.confirmedSegments) {
        const target = seg.replace(/\s+/g, "");
        if (!rest.replace(/\s+/g, "").startsWith(target)) { info(`final text does not start with sent segments; sending full final`); return remember(full); }
        let n = 0, k = 0;
        while (k < rest.length && n < target.length) { if (!/\s/.test(rest[k])) n++; k++; }
        rest = rest.slice(k);
      }
      return remember(rest.trim());
    }
  };
}
/* QQ-MEDIA-TAG-PATCH v1 */
// LLM-tagged stickers (&&分类&&) and voice (<语音>台词</语音>) for QQ group replies.
// No extra LLM call: the main model writes the tags, this code parses/strips them and adds guards.
var __qqMtFs = require("fs");
var __qqMtPath = require("path");
var __qqMtOs = require("os");
var __qqMtCp = require("child_process");
var __QQMT_DEFAULTS = {
  enabled: true, stickers: true, voice: true,
  stickerCooldownReplies: 3, stickerNudgeAfterReplies: 12,
  voiceCooldownReplies: 5, voiceNudgeAfterReplies: 30,
  voiceMaxChars: 40, voiceTimeoutMs: 8000, avoidRepeatWithinReplies: 8,
  stickerMaxSide: 512, stickerDir: "", workspace: "", voiceScript: "scripts/xingye_voice.py"
};
var __QQMT_SYN = {
  "开心": ["高兴", "快乐", "哈哈", "哈哈哈", "笑", "大笑", "嘿嘿", "嘻嘻", "乐", "兴奋", "欢乐", "耶", "kaixin", "gaoxing", "happy", "joy", "laugh", "smile", "lol"],
  "喜欢": ["爱", "爱你", "贴贴", "爱心", "比心", "心动", "亲亲", "抱抱", "喜爱", "xihuan", "love", "like", "heart", "kiss", "hug"],
  "卖萌": ["萌", "可爱", "撒娇", "求求", "求求了", "喵", "装可爱", "maimeng", "cute", "kawaii", "moe"],
  "害羞": ["羞", "脸红", "不好意思", "羞羞", "haixiu", "shy", "blush", "embarrassed"],
  "得意": ["调皮", "嘚瑟", "骄傲", "坏笑", "哼哼", "臭屁", "得瑟", "自豪", "deyi", "smug", "proud", "naughty"],
  "困": ["睡", "累", "犯困", "打哈欠", "好困", "困了", "疲惫", "kun", "sleepy", "tired", "yawn"],
  "委屈": ["呜呜", "可怜", "委屈巴巴", "嘤嘤", "weiqu", "wronged", "pout", "pitiful"],
  "难过": ["哭", "伤心", "悲伤", "哭哭", "泪", "流泪", "难受", "心碎", "大哭", "nanguo", "sad", "cry", "crying", "upset"],
  "生气": ["气", "愤怒", "恼", "火大", "怒", "气死", "生气了", "shengqi", "angry", "mad", "rage"],
  "无语": ["无奈", "汗", "呵呵", "尴尬", "白眼", "省略号", "沉默", "wuyu", "speechless", "facepalm", "awkward"],
  "疑惑": ["呆", "懵", "问号", "不解", "啥", "什么", "疑问", "迷惑", "发呆", "懵逼", "yihuo", "confused", "question", "huh", "puzzled"],
  "震惊": ["哇", "吓", "惊", "惊讶", "吃惊", "啊这", "惊吓", "吓到", "zhenjing", "shock", "shocked", "surprised", "wow", "omg"],
  "早安": ["早", "早上好", "起床", "早呀", "zaoan", "morning", "goodmorning", "gm"],
  "晚安": ["睡觉", "晚上好", "好梦", "晚安安", "wanan", "goodnight", "night", "gn"]
};
var __QQMT_SYN_REV = new Map();
var __QQMT_SYN_LIST = [];
(function () {
  for (const [k, ws] of Object.entries(__QQMT_SYN)) {
    for (const w of ws) {
      const n = __qqMtNorm(w);
      if (!__QQMT_SYN_REV.has(n)) __QQMT_SYN_REV.set(n, []);
      __QQMT_SYN_REV.get(n).push(k);
      __QQMT_SYN_LIST.push([n, k]);
    }
  }
  __QQMT_SYN_LIST.sort((a, b) => b[0].length - a[0].length);
})();
function __qqMtNorm(s) {
  return String(s ?? "").normalize("NFKC").replace(/[\s_\-·•~～]+/g, "").toLowerCase();
}
function __qqMtCfg(account) {
  const c = { ...__QQMT_DEFAULTS, ...(account?.config?.mediaTags ?? {}) };
  const num = (k, lo, hi) => { const v = Math.floor(Number(c[k])); c[k] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : __QQMT_DEFAULTS[k]; };
  num("stickerCooldownReplies", 0, 100); num("stickerNudgeAfterReplies", 1, 1000);
  num("voiceCooldownReplies", 0, 100); num("voiceNudgeAfterReplies", 1, 1000);
  num("voiceMaxChars", 1, 200); num("voiceTimeoutMs", 1000, 60000);
  num("avoidRepeatWithinReplies", 0, 1000); num("stickerMaxSide", 0, 4096);
  c.workspace = c.workspace || __qqMtPath.join(__qqMtOs.homedir(), ".openclaw", "workspace");
  c.stickerDir = c.stickerDir || __qqMtPath.join(c.workspace, "stickers");
  return c;
}
/* HOSINO-STICKER-PATCH v1: recheck stickers/params.json + manifest.json before sending (5s refresh) */
var __hsStkC = { at: 0, dir: "", params: null, manifest: null, pm: -1, mm: -1, syn: new Map() };
function __hsStk(dir) {
  if (__hsStkC.dir === dir && Date.now() - __hsStkC.at < 5000) return __hsStkC;
  const rd = (f, prev, pm) => { try { const st = __qqMtFs.statSync(f); if (st.mtimeMs === pm && __hsStkC.dir === dir) return [prev, pm]; return [JSON.parse(__qqMtFs.readFileSync(f, "utf8")), st.mtimeMs]; } catch { return [null, -1]; } };
  const [p, pm] = rd(__qqMtPath.join(dir, "params.json"), __hsStkC.params, __hsStkC.pm);
  const [m, mm] = rd(__qqMtPath.join(dir, "manifest.json"), __hsStkC.manifest, __hsStkC.mm);
  const syn = new Map();
  try { for (const [c, v] of Object.entries(m?.categories || {})) for (const w of (v?.synonyms || [])) { const n = __qqMtNorm(w); if (n && !syn.has(n)) syn.set(n, c); } } catch {}
  __hsStkC = { at: Date.now(), dir, params: p, manifest: m, pm, mm, syn };
  return __hsStkC;
}
function __hsQuiet(q) {
  if (!q || !q.start || !q.end || q.start === q.end) return false;
  let n = ""; try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: q.tz || "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); n = `${p.hour}:${p.minute}`; } catch { return false; }
  return q.start < q.end ? n >= q.start && n < q.end : n >= q.start || n < q.end;
}
function __hsBlock(dir, gid, key) {
  const c = __hsStk(dir); const p = c.params; if (!p) return "";
  if (p.enabled === false) return "off";
  const se = p.sessions?.["group:" + String(gid).toLowerCase()];
  if (se ? se.enabled === false : !p.defaultEnabled) return "session-off";
  if (__hsQuiet(p.quietHours)) return "quiet-hours";
  if (c.manifest?.categories?.[key]?.enabled === false) return "category-off";
  return "";
}
/* HOSINO-VOICE-PARAMS v1: send-time backstop for stickers/params.json voice section */
function __hsVoice(dir) { try { const v = __hsStk(dir).params?.voice; return v && typeof v === "object" ? v : null; } catch { return null; } }
function __hsVDay(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Singapore" }).format(new Date()); } catch { return ""; } }
function __hsVoiceBlock(dir, gid, g) {
  const v = __hsVoice(dir); if (!v) return "";
  if (v.enabled === false) return "off";
  const pc = v.perConversation?.["group:" + String(gid).toLowerCase()];
  if (pc && typeof pc === "object" ? pc.enabled === false : !v.defaultEnabled) return "session-off";
  const tz = typeof v.tz === "string" && v.tz ? v.tz : "Asia/Singapore";
  const qh = Array.isArray(v.quietHours) ? v.quietHours : v.quietHours ? [v.quietHours] : [];
  if (qh.some((q) => q && __hsQuiet({ start: q.start, end: q.end, tz: q.tz || tz }))) return "quiet-hours";
  const lim = Math.floor(Number(v.dailyLimit ?? 20));
  if (lim > 0 && g && g.voiceDay === __hsVDay(tz) && (Number(g.voiceDayCount) || 0) >= lim) return "daily-limit";
  return "";
}
/* HOSINO-STICKER-PATCH v1: auto-generate missing category in background (genEnabled/genDailyCap) */
var __hsGenBusy = false;
function __hsGenKey(raw) { const k = String(raw || "").normalize("NFKC").replace(/[\s&＆:：\[\]【】]/g, ""); return /^[\p{Script=Han}A-Za-z0-9]{1,8}$/u.test(k) ? k : ""; }
function __hsGenAllowed(dir, gid) {
  const c = __hsStk(dir); const p = c.params; if (!p || p.genEnabled === false) return "gen-off";
  const b = __hsBlock(dir, gid, ""); if (b) return b;
  if (__hsGenBusy) return "gen-busy";
  const f = __qqMtPath.join(dir, ".gen-state.json"); let s = {}; try { s = JSON.parse(__qqMtFs.readFileSync(f, "utf8")); } catch {}
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: p.quietHours?.tz || "Asia/Singapore" }).format(new Date());
  const cap = Number.isFinite(Number(p.genDailyCap)) ? Number(p.genDailyCap) : 10;
  if (s.day === day && (s.count || 0) >= cap) return `gen-cap ${s.count}/${cap}`;
  return "";
}
function __hsGenCount(dir) {
  const p = __hsStk(dir).params || {}; const f = __qqMtPath.join(dir, ".gen-state.json"); let s = {}; try { s = JSON.parse(__qqMtFs.readFileSync(f, "utf8")); } catch {}
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: p.quietHours?.tz || "Asia/Singapore" }).format(new Date());
  s = s.day === day ? { day, count: (s.count || 0) + 1 } : { day, count: 1 };
  try { const t = f + ".tmp"; __qqMtFs.writeFileSync(t, JSON.stringify(s)); __qqMtFs.renameSync(t, f); } catch {}
}
function __hsGenRun(cfg, key, deliverCtx, info) {
  __hsGenBusy = true; __hsGenCount(cfg.stickerDir); const t0 = Date.now();
  info(`sticker gen start key=${key}`);
  __qqMtCp.execFile("python3", [__qqMtPath.join(cfg.workspace, "scripts", "sticker_manager.py"), "get", key], { cwd: cfg.workspace, timeout: 300000, maxBuffer: 1 << 20 }, async (err, stdout) => {
    try {
      let j = null; try { j = JSON.parse(String(stdout || "").trim().split("\n").pop()); } catch {}
      if (err || !j || j.status !== "ok" || !j.path) { info(`sticker gen failed key=${key} ms=${Date.now() - t0}: ${err?.message || j?.error || "no path"}`); return; }
      __qqMtCatCache.at = 0;
      const st = __qqMtFs.statSync(j.path);
      const ent = { key, name: __qqMtPath.basename(j.path), file: j.path, size: st.size, mtimeMs: st.mtimeMs };
      const { src } = __qqMtStickerSrc(ent, cfg);
      const r = await deliverCtx.sendMedia(deliverCtx.qualifiedTarget, src, { text: "" });
      info(r && !r.error ? `sticker=${key} file=${ent.name} generated+sent ms=${Date.now() - t0} source=${j.source}` : `sticker gen send failed key=${key}: ${r?.error}`);
    } catch (e) { info(`sticker gen error key=${key}: ${e?.message || e}`); }
    finally { __hsGenBusy = false; }
  });
}
var __qqMtCatCache = { at: 0, dir: "", map: new Map() };
var __qqMtLastCats = null;
function __qqMtCatalog(dir) {
  if (__qqMtCatCache.dir === dir && Date.now() - __qqMtCatCache.at < 30000) return __qqMtCatCache.map;
  const map = new Map();
  try {
    for (const name of __qqMtFs.readdirSync(dir)) {
      if (name.startsWith(".") || !/\.(png|jpe?g|gif|webp)$/i.test(name)) continue;
      const key = name.replace(/\.[^.]+$/, "").split("-")[0].trim();
      if (!key) continue;
      let st;
      try { st = __qqMtFs.statSync(__qqMtPath.join(dir, name)); } catch { continue; }
      if (!st.isFile()) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ key, name, file: __qqMtPath.join(dir, name), size: st.size, mtimeMs: st.mtimeMs });
    }
    for (const list of map.values()) list.sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {}
  __qqMtCatCache = { at: Date.now(), dir, map };
  __qqMtLastCats = map;
  return map;
}
function __qqMtResolve(raw, cats, strict) {
  const k = __qqMtNorm(raw);
  if (!k || k.length > 16 || !cats || !cats.size) return null;
  const keys = [...cats.keys()];
  for (const c of keys) if (__qqMtNorm(c) === k) return c;
  const syn = __QQMT_SYN_REV.get(k);
  { const ms = __hsStkC.syn.get(k); if (ms && cats.has(ms)) return ms; } /* HOSINO-STICKER-PATCH v1 */
  if (syn) for (const c of syn) if (cats.has(c)) return c;
  if (strict) return null;
  const sorted = keys.slice().sort((a, b) => b.length - a.length);
  for (const c of sorted) { const n = __qqMtNorm(c); if (n.startsWith(k) || k.startsWith(n)) return c; }
  for (const c of sorted) { const n = __qqMtNorm(c); if (k.includes(n) || n.includes(k)) return c; }
  for (const [w, c] of __QQMT_SYN_LIST) if (k.includes(w) && cats.has(c)) return c;
  return null;
}
var __QQMT_STK_RES = [
  /(?<![A-Za-z0-9_)\]])[&＆]{2}[ \t\u3000]*([^&＆\n]{1,16}?)[ \t\u3000]*[&＆]{2}/g,
  /[\[【][ \t]*(?:EMO|表情包?)[ \t]*[:：][ \t]*([^\]】\n]{1,16}?)[ \t]*[\]】]/gi
];
var __QQMT_STK_COLON_RE = /[:：]([\p{Script=Han}A-Za-z]{1,8})[:：]/gu;
var __QQMT_STK_TAIL_RE = /(?<![A-Za-z0-9_)\]])[&＆]{2}[ \t\u3000]*([^\s&＆]{1,8})[ \t\u3000]*$/;
var __QQMT_VOICE_SRC = "[<＜【][ \\t]*(?:语音|voice)[ \\t]*[>＞】]([\\s\\S]*?)[<＜【][ \\t]*[/／][ \\t]*(?:语音|voice)[ \\t]*[>＞】]";
var __QQMT_VOICE_OPEN_TAIL_RE = /[<＜【][ \t]*(?:语音|voice)[ \t]*[>＞】]([^<＜【]*)$/i;
var __QQMT_VOICE_STRAY_RE = /[<＜][ \t]*[/／]?[ \t]*(?:语音|voice)[ \t]*[>＞]|【[ \t]*[/／]?[ \t]*语音[ \t]*】/gi;
function __qqMtTidy(s) {
  return String(s ?? "")
    .replace(/[ \t\u3000]+\n/g, "\n")
    .replace(/\n[ \t\u3000]+(?=\n)/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function __qqMtParse(text, cats) {
  const src = String(text ?? "");
  if (!/[&＆<＜【\[:：]/.test(src)) return { found: false };
  const parts = src.split(/(```[\s\S]*?```)/);
  const stickers = [];
  let voice = null, found = false;
  for (let i = 0; i < parts.length; i += 2) {
    let s = parts[i];
    if (!s) continue;
    s = s.replace(new RegExp(__QQMT_VOICE_SRC, "gi"), (m, inner) => {
      found = true;
      const line = String(inner).trim();
      if (!voice && line) { voice = { line }; return "\u0001"; }
      return String(inner);
    });
    if (!voice) {
      const m = __QQMT_VOICE_OPEN_TAIL_RE.exec(s);
      if (m) {
        found = true;
        const line = m[1].trim();
        if (line) { voice = { line }; s = s.slice(0, m.index) + "\u0001"; } else s = s.slice(0, m.index);
      }
    }
    s = s.replace(__QQMT_VOICE_STRAY_RE, () => { found = true; return ""; });
    for (const re of __QQMT_STK_RES) {
      re.lastIndex = 0;
      s = s.replace(re, (m, raw) => { found = true; stickers.push({ raw: String(raw).trim(), key: __qqMtResolve(raw, cats, false) }); return ""; });
    }
    __QQMT_STK_COLON_RE.lastIndex = 0;
    s = s.replace(__QQMT_STK_COLON_RE, (m, raw) => {
      const key = __qqMtResolve(raw, cats, true);
      if (!key) return m;
      found = true; stickers.push({ raw, key }); return "";
    });
    const t = __QQMT_STK_TAIL_RE.exec(s);
    if (t) {
      const key = __qqMtResolve(t[1], cats, false);
      if (key) { found = true; stickers.push({ raw: t[1], key }); s = s.slice(0, t.index); }
    }
    s = s.replace(/[&＆]{4,}/g, () => { found = true; return ""; });
    parts[i] = s;
  }
  if (!found) return { found: false };
  const joined = parts.join("");
  const textNoVoice = __qqMtTidy(joined.replace("\u0001", ""));
  const textInline = __qqMtTidy(joined.replace("\u0001", voice ? voice.line : ""));
  let voiceOdd = "";
  if (voice) {
    const idx = joined.indexOf("\u0001");
    const ls = joined.lastIndexOf("\n", idx - 1) + 1;
    let le = joined.indexOf("\n", idx);
    if (le < 0) le = joined.length;
    const before = joined.slice(ls, idx).trim();
    const after = joined.slice(idx + 1, le).trim();
    if (!textNoVoice || /^[\s\p{P}\p{S}]+$/u.test(textNoVoice)) voiceOdd = "alone";
    else if (before && after && !/^[\p{P}\p{S}\s]+$/u.test(after)) voiceOdd = "inline";
    else if (/[：:“"「『（(—]$/.test(before)) voiceOdd = "dangling";
  }
  return { found: true, stickers, voice, textNoVoice, textInline, voiceOdd };
}
// Text view used by QQ-SEGMENT-PATCH: tags end the message, and a trailing partial tag is held back.
function __qqMtSegView(text) {
  let t = String(text ?? "");
  let cut = t.length;
  for (const re of [/[&＆]{2}/, /[<＜【][ \t]*[/／]?[ \t]*(?:语音|voice)/i, /[\[【][ \t]*(?:EMO|表情)/i]) {
    const m = re.exec(t);
    if (m && m.index < cut) cut = m.index;
  }
  if (__qqMtLastCats) {
    const re = /[:：]([\p{Script=Han}A-Za-z]{1,8})[:：]/gu;
    let m;
    while ((m = re.exec(t)) && m.index < cut) {
      if (__qqMtResolve(m[1], __qqMtLastCats, true)) { cut = m.index; break; }
    }
  }
  t = t.slice(0, cut);
  const tail = /[&＆<＜\[【:：][^&＆<＜\[【:：\s]{0,4}$/.exec(t);
  if (tail) t = t.slice(0, tail.index);
  return t;
}
// Last-line guard in sendText: tags must never reach a group (voice content is kept as text).
function __qqMtLeakGuard(text) {
  const s = String(text ?? "");
  if (!/[&＆<＜【\[:：]/.test(s)) return s;
  let cats = __qqMtLastCats;
  if (!cats) { try { cats = __qqMtCatalog(__qqMtCfg(null).stickerDir); } catch { cats = new Map(); } }
  const p = __qqMtParse(s, cats);
  return p.found ? p.textInline : s;
}
var __QQMT_KEY = Symbol.for("openclaw.qqMediaTags.v1");
function __qqMtShared() {
  let g = globalThis[__QQMT_KEY];
  if (!g) {
    g = { groups: {}, timer: null, file: __qqMtPath.join(__qqMtOs.homedir(), ".openclaw", "qqbot", "media-tag-state.json") };
    try { const j = JSON.parse(__qqMtFs.readFileSync(g.file, "utf8")); if (j && typeof j.groups === "object") g.groups = j.groups; } catch {}
    globalThis[__QQMT_KEY] = g;
  }
  return g;
}
function __qqMtGroup(gid) {
  const g = __qqMtShared();
  const k = String(gid || "").toUpperCase();
  if (!g.groups[k]) g.groups[k] = { replies: 0, lastStickerReply: null, lastVoiceReply: null, lastStickerFile: "", lastStickerKey: "", updatedAt: 0 };
  return g.groups[k];
}
function __qqMtSave() {
  const g = __qqMtShared();
  if (g.timer) return;
  g.timer = setTimeout(() => {
    g.timer = null;
    try {
      __qqMtFs.mkdirSync(__qqMtPath.dirname(g.file), { recursive: true });
      const tmp = g.file + ".tmp";
      __qqMtFs.writeFileSync(tmp, JSON.stringify({ v: 1, groups: g.groups }, null, 1));
      __qqMtFs.renameSync(tmp, g.file);
    } catch {}
  }, 1500);
  try { g.timer.unref?.(); } catch {}
}
function __qqMtTts(line, cfg) {
  const t0 = Date.now();
  const script = __qqMtPath.resolve(cfg.workspace, cfg.voiceScript);
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve({ ...r, ms: Date.now() - t0 }); } };
    try {
      __qqMtCp.execFile("python3", [script, "--", line], { cwd: cfg.workspace, timeout: cfg.voiceTimeoutMs, maxBuffer: 1 << 20, env: process.env }, (err, stdout, stderr) => {
        const last = String(stdout || "").trim().split("\n").pop() || "";
        let j = null;
        try { j = JSON.parse(last); } catch {}
        if (j && j.status === "ok" && j.media && __qqMtFs.existsSync(j.media)) finish({ ok: true, media: j.media });
        else finish({ ok: false, error: (j && j.error) || (err && (err.killed ? "timeout" : err.message)) || String(stderr || "").slice(0, 200) || "no output" });
      });
    } catch (e) { finish({ ok: false, error: e?.message || String(e) }); }
  });
}
var __qqMtCacheChain = Promise.resolve();
var __qqMtCacheBusy = new Set();
var __qqMtWarmed = false;
function __qqMtCacheTarget(ent, side) {
  const stem = ent.name.replace(/\.[^.]+$/, "");
  return __qqMtPath.join(__qqMtOs.homedir(), ".openclaw", "media", "qq-sticker-cache", `${stem}.${ent.size}.${Math.floor(ent.mtimeMs)}.${side}.png`);
}
function __qqMtCacheable(ent, side) {
  return side > 0 && /\.(png|jpe?g)$/i.test(ent.name) && ent.size > 700 * 1024;
}
function __qqMtQueueCache(ent, side) {
  const out = __qqMtCacheTarget(ent, side);
  if (__qqMtCacheBusy.has(out)) return;
  __qqMtCacheBusy.add(out);
  __qqMtCacheChain = __qqMtCacheChain.then(() => new Promise((resolve) => {
    try {
      if (__qqMtFs.existsSync(out)) return resolve();
      __qqMtFs.mkdirSync(__qqMtPath.dirname(out), { recursive: true });
      const tmp = out + ".tmp.png";
      __qqMtCp.execFile("nice", ["-n", "10", "ffmpeg", "-y", "-v", "error", "-i", ent.file, "-vf", `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, "-compression_level", "9", tmp], { timeout: 60000 }, (err) => {
        try { if (!err && __qqMtFs.existsSync(tmp)) __qqMtFs.renameSync(tmp, out); else __qqMtFs.rmSync(tmp, { force: true }); } catch {}
        resolve();
      });
    } catch { resolve(); }
  })).finally(() => __qqMtCacheBusy.delete(out));
}
function __qqMtStickerSrc(ent, cfg) {
  const side = cfg.stickerMaxSide;
  if (!__qqMtCacheable(ent, side)) return { src: ent.file, cached: false };
  const out = __qqMtCacheTarget(ent, side);
  try { if (__qqMtFs.statSync(out).size > 0) return { src: out, cached: true }; } catch {}
  __qqMtQueueCache(ent, side);
  return { src: ent.file, cached: false };
}
function __qqMtWarm(cfg) {
  if (__qqMtWarmed || !(cfg.stickerMaxSide > 0)) return;
  __qqMtWarmed = true;
  const t = setTimeout(() => {
    try { for (const list of __qqMtCatalog(cfg.stickerDir).values()) for (const ent of list) if (__qqMtCacheable(ent, cfg.stickerMaxSide)) __qqMtQueueCache(ent, cfg.stickerMaxSide); } catch {}
  }, 15000);
  try { t.unref?.(); } catch {}
}
async function __qqMtSendVoice(account, deliverCtx, file) {
  deliverCtx.__qqAssertActive?.();
  return await __qqReceipts.send(deliverCtx.__qqReceiptIdentity, { id: "tagged-voice-delivery", meta: {} }, { media: file, kind: "voice" }, () => __qqMtSendVoiceOnce(account, deliverCtx, file));
}
async function __qqMtSendVoiceOnce(account, deliverCtx, file) {
  deliverCtx.__qqAssertActive?.();
  const gw = getGateway(account.accountId);
  if (!gw) return { error: "gateway not running" };
  const target = parseTarget2(deliverCtx.qualifiedTarget);
  try {
    const r = await __qqWithRequestSignal(deliverCtx.__qqRequestSignal, () => gw.sendVoice(target, { localPath: file }, { msgId: deliverCtx.replyToId }));
    return { messageId: r?.id };
  } catch (e) {
    const msg = e?.message || String(e);
    if (e?.sendState === "uncertain" || e?.name === "AbortError") return formatError(e);
    if (deliverCtx.audioFileToSilkBase64) {
      try {
        const b64 = await deliverCtx.audioFileToSilkBase64(file);
        if (b64) { deliverCtx.__qqAssertActive?.(); const r2 = await __qqWithRequestSignal(deliverCtx.__qqRequestSignal, () => gw.sendVoice(target, { base64: b64 }, { msgId: deliverCtx.replyToId })); return { messageId: r2?.id, silk: true }; }
      } catch (e2) { return { error: `${msg} | silk: ${e2?.message || e2}` }; }
    }
    return { error: msg };
  }
}
function __qqMtCreate(account, deliverCtx, log4, envelope) {
  const cfg = __qqMtCfg(account);
  try { const hp = __hsStk(cfg.stickerDir).params; const v = Math.floor(Number(hp?.cooldownReplies)); if (hp && Number.isFinite(v)) cfg.stickerCooldownReplies = Math.max(0, Math.min(100, v)); } catch {} /* HOSINO-STICKER-PATCH v1 */
  try { const hv = __hsVoice(cfg.stickerDir); if (hv) { const mc = Math.floor(Number(hv.maxChars)); if (Number.isFinite(mc)) cfg.voiceMaxChars = Math.max(1, Math.min(200, mc)); const cr = Math.floor(Number(hv.cooldownReplies)); if (Number.isFinite(cr)) cfg.voiceCooldownReplies = Math.max(0, Math.min(100, cr)); } } catch {} /* HOSINO-VOICE-PARAMS v1 */
  if (cfg.enabled === false) return null;
  let gid = String(envelope?.groupId || "");
  if (!gid) { try { gid = String(parseTarget2(deliverCtx.qualifiedTarget).targetId || ""); } catch {} }
  gid = gid.toUpperCase();
  if (!gid) return null;
  const info = (m) => { try { if (log4?.info) log4.info(`[qq-media-tag] ${m}`); else console.log(`[qq-media-tag] ${m}`); } catch {} };
  try { __qqMtCatalog(cfg.stickerDir); } catch {}
  __qqMtWarm(cfg);
  let snap = null;
  const snapshot = () => {
    if (snap) return snap;
    const g = __qqMtGroup(gid);
    const sg = g.lastStickerReply == null ? Infinity : g.replies - g.lastStickerReply;
    const vg = g.lastVoiceReply == null ? Infinity : g.replies - g.lastVoiceReply;
    snap = { stickerGap: sg, voiceGap: vg, stickerOk: sg >= cfg.stickerCooldownReplies, voiceOk: vg >= cfg.voiceCooldownReplies, lastFile: g.lastStickerFile || "" };
    return snap;
  };
  const st = { counted: false, stickerUsed: false, voiceUsed: false, prestart: null, voiceOperation: null, voiceFeedback: null };
  // Per source/reply voice operation. This is status feedback, not a caption
  // or media retry; unknown ACK stays unknown and the receipt protects feedback.
  const voiceStatus = async (message, receiptOperationId) => {
    let sent;
    try { sent = await deliverCtx.sendText(deliverCtx.qualifiedTarget, message, { receiptOperationId }); }
    catch (error) { throw Object.assign(new Error("QQ voice status delivery is not confirmed"), { code: "QQ_DELIVERY_NOT_CONFIRMED", sendState: error?.sendState === "not-sent" ? "not-sent" : "uncertain", voiceFeedbackAttempted: true, cause: error }); }
    if (!sent?.messageId || sent.error || sent.suppressed) throw Object.assign(new Error("QQ voice status delivery is not confirmed"), { code: "QQ_DELIVERY_NOT_CONFIRMED", sendState: sent?.sendState === "not-sent" ? "not-sent" : "uncertain", voiceFeedbackAttempted: true });
    return true;
  };
  const voiceFeedback = (phase, result) => st.voiceFeedback ||= (async () => {
    const jobId = /^[a-f0-9]{64}$/.test(String(result?.jobId || "")) ? result.jobId : "";
    const state = phase === "generation" ? "语音生成未确认" : phase === "send" ? "语音发送未成功" : "语音发送结果暂未确认，暂不重发";
    const message = jobId ? `${state}；可用 /media-job status ${jobId.slice(0, 12)} 查看任务状态。` : `${state}，请稍后再查看。`;
    try { return await voiceStatus(message, `tagged-voice-feedback:${jobId || "current-source"}`); }
    catch (error) { if (phase === "uncertain") error.sendState = "uncertain"; throw error; }
  })();
  const count = (flags) => {
    const g = __qqMtGroup(gid);
    if (!st.counted) { st.counted = true; g.replies = (g.replies || 0) + 1; }
    if (flags.sticker) { g.lastStickerReply = g.replies; g.lastStickerFile = flags.stickerFile; g.lastStickerKey = flags.stickerKey; g.lastStickerAt = Date.now(); }
    if (flags.voice) { g.lastVoiceReply = g.replies; g.lastVoiceAt = Date.now(); try { const d = __hsVDay(__hsVoice(cfg.stickerDir)?.tz); if (g.voiceDay !== d) { g.voiceDay = d; g.voiceDayCount = 0; } g.voiceDayCount = (Number(g.voiceDayCount) || 0) + 1; } catch {} /* HOSINO-VOICE-PARAMS v1 */ }
    g.updatedAt = Date.now();
    __qqMtSave();
  };
  return {
    gid, cfg, info,
    onPartial(payload) {
      if (!cfg.voice || st.prestart || st.voiceUsed || st.stickerUsed || st.otherMedia) return;
      let t;
      try { t = payload?.text; } catch { return; }
      if (typeof t !== "string" || (t.indexOf("语音") < 0 && !/voice/i.test(t))) return;
      if (__qqIsStandaloneSilentReply(t)) return;
      if (!snapshot().voiceOk) return;
      if (__hsVoiceBlock(cfg.stickerDir, gid, __qqMtGroup(gid))) return; /* HOSINO-VOICE-PARAMS v1: no TTS prestart when params block it */
      if (/[&＆]{2}[^&＆\n]{1,16}[&＆]{2}/.test(t)) return; // sticker tag present -> voice will become text
      const m = new RegExp(__QQMT_VOICE_SRC, "i").exec(t);
      if (!m) return;
      const line = String(m[1]).trim();
      if (!line || Array.from(line).length > cfg.voiceMaxChars) return;
      st.prestart = { line, promise: __qqControlledVoice(account, deliverCtx, line, cfg, false), at: Date.now() };
      info(`voice tts prestarted from stream len=${Array.from(line).length}`);
    },
    prepare(payload) {
      /* QQ-MEDIA-TAG-PATCH v1.1: one media item per reply (sticker OR voice OR a real attachment). */
      const otherMedia = !!(payload?.mediaUrl || payload?.mediaUrls?.length);
      if (otherMedia) st.otherMedia = true;
      const text = payload?.text;
      if (typeof text !== "string" || !text) return null;
      const cats = __qqMtCatalog(cfg.stickerDir);
      const p = __qqMtParse(text, cats);
      if (!p.found) return null;
      for (const s of p.stickers) if (!s.key) info(`dropped unknown=${JSON.stringify(s.raw)}`);
      if (__qqIsStandaloneSilentReply(text)) {
        info(`silent turn: media dropped stickers=${p.stickers.length} voice=${p.voice ? 1 : 0}`);
        return { changed: true, text: p.textInline, silent: true };
      }
      const sn = snapshot();
      let sticker = null;
      let __hsWhy = "";
      let genSticker = null; /* HOSINO-STICKER-PATCH v1 */
      if (!p.stickers.some((x) => x.key) && p.stickers.length && cfg.stickers && sn.stickerOk && !st.voiceUsed && !st.otherMedia) { const gk = __hsGenKey(p.stickers[0].raw); const why = gk ? __hsGenAllowed(cfg.stickerDir, gid) : "bad-key"; if (why) info(`sticker gen skipped raw=${JSON.stringify(p.stickers[0].raw)} (${why})`); else { genSticker = { key: gk }; st.stickerUsed = true; } }
      const known = p.stickers.filter((s) => s.key);
      if (known.length) {
        const want = known[0];
        if (known.length > 1) info(`extra sticker tags dropped n=${known.length - 1} keep=${want.key}`);
        if (!cfg.stickers) info(`sticker disabled key=${want.key}`);
        else if (st.stickerUsed) info(`sticker dropped (max 1 per reply) key=${want.key}`);
        else if (st.voiceUsed || st.otherMedia) info(`sticker dropped (one media per reply) key=${want.key}`);
        else if ((__hsWhy = __hsBlock(cfg.stickerDir, gid, want.key))) info(`sticker blocked by params (${__hsWhy}) key=${want.key}`); /* HOSINO-STICKER-PATCH v1 */
        else if (!sn.stickerOk) info(`cooldown sticker key=${want.key} gap=${sn.stickerGap} need>=${cfg.stickerCooldownReplies}`);
        else {
          const files = cats.get(want.key) || [];
          const recent = sn.stickerGap < cfg.avoidRepeatWithinReplies;
          const pick = files.find((f) => !(recent && f.file === sn.lastFile));
          if (!pick) info(`repeat sticker skipped key=${want.key} gap=${sn.stickerGap} window=${cfg.avoidRepeatWithinReplies}`);
          else { st.stickerUsed = true; sticker = { key: want.key, ent: pick, raw: want.raw }; }
        }
      }
      let voice = null;
      let outText = p.textNoVoice;
      if (p.voice) {
        const line = p.voice.line;
        const len = Array.from(line).length;
        let reason = "";
        const __hsVWhy = __hsVoiceBlock(cfg.stickerDir, gid, __qqMtGroup(gid)); /* HOSINO-VOICE-PARAMS v1 */
        if (!cfg.voice) reason = "disabled";
        else if (__hsVWhy) reason = `params ${__hsVWhy}`;
        else if (st.voiceUsed) reason = "max 1 per reply";
        else if (st.stickerUsed || st.otherMedia) reason = "one media per reply";
        else if (!sn.voiceOk) reason = `cooldown voice gap=${sn.voiceGap} need>=${cfg.voiceCooldownReplies}`;
        else if (len > cfg.voiceMaxChars) reason = `too long len=${len}>${cfg.voiceMaxChars}`;
        if (p.voiceOdd === "alone" && st.voiceOperation?.line === line) {
          // Core may expose the same standalone tag as block and final. Reuse
          // this reply's exact logical voice operation, including its outcome.
          voice = st.voiceOperation; outText = "";
        } else if (reason) { info(`voice -> text (${reason})`); outText = p.textInline; }
        else {
          st.voiceUsed = true;
          const pre = st.prestart && st.prestart.line === line ? st.prestart : null;
          const keepInline = !!p.voiceOdd && p.voiceOdd !== "alone";
          voice = { line, promise: __qqControlledVoice(account, deliverCtx, line, cfg, true), t0: pre ? pre.at : Date.now(), pre: !!pre, lineInText: keepInline, odd: p.voiceOdd };
          st.voiceOperation = voice;
          if (p.voiceOdd === "alone") outText = "";
          else if (keepInline) outText = p.textInline;
        }
      }
      return { changed: true, text: outText, sticker, voice, silent: false, genSticker };
    },
    async finish(prep) {
      if (prep?.voice?.deliveryFinish) return await prep.voice.deliveryFinish;
      const complete = async () => {
      const res = { stickerSent: false, voiceSent: false, fallbackText: false, stickerKey: "", stickerFile: "" };
      if (!prep || prep.silent) return res;
      if (prep.genSticker) { try { __hsGenRun(cfg, prep.genSticker.key, deliverCtx, info); } catch (e) { info(`sticker gen spawn error: ${e?.message || e}`); } } /* HOSINO-STICKER-PATCH v1: background, text already sent */
      if (prep.sticker) {
        const t0 = Date.now();
        const { src, cached } = __qqMtStickerSrc(prep.sticker.ent, cfg);
        let r;
        try { r = await deliverCtx.sendMedia(deliverCtx.qualifiedTarget, src, { text: "" }); } catch (e) { r = { error: e?.message || String(e), sendState: e?.sendState }; }
        if (r && !r.error) {
          res.stickerSent = true; res.stickerKey = prep.sticker.key; res.stickerFile = prep.sticker.ent.file;
          info(`sticker=${prep.sticker.key} file=${__qqMtPath.basename(src)} ms=${Date.now() - t0}${cached ? " small" : ""}${prep.sticker.raw !== prep.sticker.key ? ` from=${JSON.stringify(prep.sticker.raw)}` : ""}`);
        } else { info(`sticker=${prep.sticker.key} send failed ms=${Date.now() - t0}: ${r?.error}`); res.deliveryFailed = true; res.sendState = r?.sendState || "uncertain"; return res; }
      }
      if (prep.voice) {
        const v = prep.voice;
        const r = await v.promise;
        v.generationResult = r;
        let ok = false;
        if (r.controlled && r.jobPending) {
          const text = `语音任务 ${r.jobId.slice(0, 12)} 正在处理，完成后会交付一次；过期可用 /media-job get ${r.jobId.slice(0, 12)} 领取。`;
          res.fallbackText = await voiceStatus(text, `controlled-media-status:${r.jobId}`);
          return res;
        }
        if (r.controlled && !r.ok) {
          res.deliveryFailed = true; res.sendState = "not-sent";
          res.fallbackText = await voiceFeedback("generation", r);
          info(`controlled voice preflight/result failed: ${r.error}`); return res;
        }
        if (r.ok) {
          const t1 = Date.now();
          v.sendStarted = true;
          const s = r.controlled ? await __qqControlledVoiceFinish(account, deliverCtx, r) : await __qqMtSendVoice(account, deliverCtx, r.media);
          if (s?.messageId && !s.error && !s.suppressed) { ok = true; res.voiceSent = true; info(`voice ms=${Date.now() - v.t0} tts=${r.ms} send=${Date.now() - t1} len=${Array.from(v.line).length}${v.pre ? " prestarted" : ""}${s.silk ? " silk" : ""}${v.odd ? ` keptText=${v.odd}` : ""}`); }
          else {
            info(`voice send failed: ${s?.error || "missing ACK"}`);
            if (s?.sendState === "uncertain" || (r.controlled && s?.sendState !== "not-sent")) {
              res.deliveryUncertain = true; res.sendState = "uncertain";
              res.fallbackText = await voiceFeedback("uncertain", r); return res;
            }
            if (r.controlled) {
              res.deliveryFailed = true; res.sendState = "not-sent";
              res.fallbackText = await voiceFeedback("send", r); return res;
            }
          }
        } else info(`voice tts failed ms=${r.ms}: ${r.error}`);
        if (!ok && r.controlled) return res;
        if (!ok && !v.lineInText) {
          const tr = await deliverCtx.sendText(deliverCtx.qualifiedTarget, v.line);
          res.fallbackText = !tr?.error && !tr?.suppressed;
          info(`voice fallback -> text${tr?.error ? " error=" + tr.error : ""}`);
        }
      }
      return res;
      };
      const pending = complete().catch(async (error) => {
        if (!prep?.voice) throw error;
        if (error?.voiceFeedbackAttempted) throw error;
        const uncertain = !!prep.voice.sendStarted && error?.sendState !== "not-sent";
        const outcome = { stickerSent: false, voiceSent: false, fallbackText: false, deliveryFailed: !uncertain, deliveryUncertain: uncertain, sendState: uncertain ? "uncertain" : "not-sent" };
        try { outcome.fallbackText = await voiceFeedback(uncertain ? "uncertain" : prep.voice.sendStarted ? "send" : "generation", prep.voice.generationResult); }
        catch (feedbackError) { throw Object.assign(new Error("QQ voice delivery is not confirmed"), { code: "QQ_DELIVERY_NOT_CONFIRMED", sendState: !uncertain && feedbackError?.sendState === "not-sent" ? "not-sent" : "uncertain", cause: error }); }
        return outcome;
      });
      if (prep?.voice) prep.voice.deliveryFinish = pending;
      return await pending;
    },
    noteSent(text, hasMedia, res) {
      snapshot();
      const visible = (typeof text === "string" && text.trim() && !__qqGroupSilentText(text)) || hasMedia || res?.stickerSent || res?.voiceSent || res?.fallbackText;
      if (!visible) return;
      count({ sticker: !!res?.stickerSent, stickerFile: res?.stickerFile, stickerKey: res?.stickerKey, voice: !!res?.voiceSent });
    }
  };
}
async function deliverDispatchPayload(payload, info, state) {
  return await __qqReceipts.frame(info?.kind || "final", payload, () => __qqDeliverWithReceiptFrame(payload, info, state));
}
async function __qqDeliverWithReceiptFrame(payload, info, state) {
  const mt = state?.qqMt;
  if (!mt || info?.kind === "tool") return __qqMtOrigDeliverDispatchPayload(payload, info, state);
  let prep = null;
  try { prep = mt.prepare(payload); } catch (e) { try { mt.info(`prepare error: ${e?.message || e}`); } catch {} }
  if (!prep) {
    await __qqMtOrigDeliverDispatchPayload(payload, info, state);
    try { mt.noteSent(payload?.text, !!(payload?.mediaUrl || payload?.mediaUrls?.length), null); } catch {}
    return;
  }
  const p2 = { ...payload, text: prep.text || void 0 };
  const hasMedia = !!(p2.mediaUrl || p2.mediaUrls?.length);
  if (prep.text || hasMedia || p2.audioAsVoice) await __qqMtOrigDeliverDispatchPayload(p2, info, state);
  let res = null;
  try { res = await mt.finish(prep); } catch (e) { try { mt.info(`finish error: ${e?.message || e}`); } catch {} if (e?.sendState || String(e?.code || "").startsWith("QQ_RECEIPT")) throw e; }
  if (res?.deliveryUncertain || res?.deliveryFailed) throw Object.assign(new Error("QQ media delivery is not confirmed"), { code: "QQ_DELIVERY_NOT_CONFIRMED", sendState: res.sendState || "uncertain" });
  try { mt.noteSent(prep.text, hasMedia, res); } catch {}
}
/* /QQ-MEDIA-TAG-PATCH v1 */

// src/dispatch/dispatch-deliver.ts
function streamOwnsText(controller) {
  return Boolean(controller?.hasStarted && !controller.shouldFallbackToStatic);
}
async function __qqMtOrigDeliverDispatchPayload(payload, info, state) {
  const kind = info?.kind;
  const text = payload.text?.trim() ?? "";
  const hasMedia = !!(payload.mediaUrl || payload.mediaUrls?.length);
  const sendReply = state.deliverReply;
  state.log?.debug(
    `deliver kind=${kind ?? "none"} textLen=${text.length} voice=${!!payload.audioAsVoice} media=${hasMedia}${formatLogTextPreview(text)}`
  );
  if (kind === "tool") {
    await forwardMediaUrls(payload, state);
    return;
  }
  if (kind === "block") {
    if (payload.audioAsVoice) {
      await sendReply(payload, info, state.ctx);
      if (text) state.deliveredTexts.add(text);
      return;
    }
    await forwardMediaUrls(payload, state);
    if (streamOwnsText(state.streamingController) || !text || state.deliveredTexts.has(text)) {
      return;
    }
    let blockText = text;
    if (state.qqSeg && (state.qqSeg.sentCount > 0 || state.qqSeg.hasRemainderFor?.(payload.text ?? ""))) {
      const early = state.qqSeg.sentCount;
      blockText = await state.qqSeg.finalText(payload.text ?? "");
      state.log?.info?.(`[qq-segment] block remainder len=${blockText.length} early=${early}`);
    }
    const result = blockText ? await sendReply({ text: blockText }, info, state.ctx) : null;
    if (!result?.error && !result?.suppressed) state.deliveredTexts.add(text);
    return;
  }
  if (streamOwnsText(state.streamingController)) {
    if (state.streamingController && !state.streamingController.isTerminal) {
      await state.streamingController.finalize();
    }
    if (!state.streamingController?.shouldFallbackToStatic) {
      return;
    }
    state.log?.warn(`streaming fallback to static`);
  }
  /* QQ-SEGMENT-PATCH v1 */
  if (state.qqSeg && text && !state.deliveredTexts.has(text) && !payload.audioAsVoice && (state.qqSeg.sentCount > 0 || state.qqSeg.hasRemainderFor?.(payload.text ?? ""))) {
    const __early = state.qqSeg.sentCount;
    const __rest = await state.qqSeg.finalText(payload.text ?? "");
    state.log?.info?.(`[qq-segment] final remainder len=${__rest.length} early=${__early}`);
    if (!__rest && !hasMedia) { state.deliveredTexts.add(text); return; }
    const __p2 = filterDeliveredMedia({ ...payload, text: __rest || void 0 }, state.deliveredMediaUrls);
    const __result = await sendReply(__p2, info, state.ctx);
    if (!__result?.error && !__result?.suppressed) state.deliveredTexts.add(text);
    for (const u2 of __p2.mediaUrls ?? []) state.deliveredMediaUrls.add(u2);
    if (__p2.mediaUrl) state.deliveredMediaUrls.add(__p2.mediaUrl);
    return;
  }
  if (text && state.deliveredTexts.has(text) && !hasMedia && !payload.audioAsVoice) {
    return;
  }
  const filteredPayload = filterDeliveredMedia(payload, state.deliveredMediaUrls);
  const payloadToSend = text && state.deliveredTexts.has(text) ? { ...filteredPayload, text: void 0 } : filteredPayload;
  const result = await sendReply(payloadToSend, info, state.ctx);
  if (text && !result?.error && !result?.suppressed) state.deliveredTexts.add(text);
  for (const u2 of payloadToSend.mediaUrls ?? []) state.deliveredMediaUrls.add(u2);
  if (payloadToSend.mediaUrl) state.deliveredMediaUrls.add(payloadToSend.mediaUrl);
}
async function deliverDispatchPayloadSafe(payload, info, state) {
  try {
    await deliverDispatchPayload(payload, info, state);
  } catch (err) {
    state.log?.error(`deliver error: ${err instanceof Error ? err.message : String(err)}`);
    if (err?.sendState || String(err?.code || "").startsWith("QQ_RECEIPT") || err?.code === "QQ_DELIVERY_NOT_CONFIRMED") throw err;
  }
}
async function forwardMediaUrls(payload, state) {
  const urls = [];
  if (payload.mediaUrls?.length) urls.push(...payload.mediaUrls);
  if (payload.mediaUrl && !urls.includes(payload.mediaUrl)) urls.push(payload.mediaUrl);
  const newUrls = urls.filter((u2) => !state.deliveredMediaUrls.has(u2));
  for (const url of newUrls) {
    try {
      const confirmed = await state.ctx.sendMedia(state.ctx.qualifiedTarget, url, { text: "" });
      if (confirmed?.messageId && !confirmed.error) state.deliveredMediaUrls.add(url);
    } catch (err) {
      state.log?.error(`media forward failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err?.sendState || String(err?.code || "").startsWith("QQ_RECEIPT")) throw err;
    }
  }
}
function filterDeliveredMedia(payload, delivered) {
  if (delivered.size === 0) return payload;
  return {
    ...payload,
    mediaUrl: payload.mediaUrl && !delivered.has(payload.mediaUrl) ? payload.mediaUrl : void 0,
    mediaUrls: payload.mediaUrls?.filter((u2) => !delivered.has(u2))
  };
}

// src/dispatch/dispatch.ts
async function dispatchToOpenClaw(ctx, msg, account, runtime2, log4) {
  const dlog = log4?.child("dispatch");
  const adapters = getAdapters(runtime2, dlog);
  const envelope = buildEnvelope2(ctx, msg, account);
  dlog?.debug(`received sender=${envelope.senderId} scope=${envelope.chatScope} msgId=${envelope.messageId}`);
  if (!adapters.dispatchReply) {
    dlog?.error(`runtime adapter dispatchReply not available (openclaw=${adapters.version})`);
    return;
  }
  const assembled = ctx.state.assembledBody ?? assembleBody(ctx, msg, account);
  const __qqBaseCfg = adapters.getConfig?.() ?? {};
  // SDK preflight is not native steering. Keep actual configured collect policy and experiments unchanged.
  const cfg = __qqBaseCfg;
  __qqQueueDiag(ctx, "dispatch", { configuredMode: typeof cfg.messages?.queue?.byChannel?.qqbot === "string" ? cfg.messages.queue.byChannel.qqbot : cfg.messages?.queue?.mode ?? "unset", resolvedDisposition:"core-policy" });
  const route = adapters.resolveAgentRoute?.({
    cfg,
    channel: "qqbot",
    accountId: account.accountId,
    peer: {
      kind: envelope.chatScope === "group" ? "group" : "direct",
      id: envelope.chatScope === "group" ? envelope.groupId ?? envelope.senderId : envelope.senderId
    }
  }) ?? { sessionKey: `qqbot:${account.accountId}:${envelope.senderId}`, accountId: account.accountId };
  const qualifiedTarget = envelope.targetId;
  const agentId = route.agentId ?? "default";
  const storePath = adapters.resolveStorePath?.(cfg?.session?.store, { agentId }) ?? "";
  const ctxPayload = buildCtxPayload({ assembled, envelope, route, msg, ctx, adapters });
  const __qqControlledOrigin = __qqJobRegister(ctx, msg, account, route, [ctxPayload.MessageSidFull, ctxPayload.MessageSid]);
  const ttsRuntime = runtime2?.tts ?? runtime2?.channel?.runtimeContexts?.get?.("tts");
  const debounceConfig = account.config?.deliverDebounce;
  const debouncer = debounceConfig?.enabled !== false ? new DeliverDebouncer(
    debounceConfig,
    (targetId, mergedText) => sendText({ to: targetId, text: mergedText, accountId: account.accountId, replyToId: envelope.messageId, account }).then(() => {
    })
  ) : void 0;
  const deliverCtx = {
    qualifiedTarget,
    accountId: account.accountId,
    replyToId: envelope.messageId,
    chatScope: envelope.chatScope === "group" ? "group" : "direct",
    cfg,
    debouncer: debouncer?.enabled ? debouncer : void 0,
    sendText: (to, text) => sendText({ to, text, accountId: account.accountId, replyToId: envelope.messageId, account }),
    sendMedia: (to, source, opts) => sendMedia({
      to,
      source,
      text: opts?.text ?? "",
      replyToId: envelope.messageId,
      accountId: account.accountId,
      agentId: route.agentId,
      log: deliverCtx.log
    }),
    textToSpeech: ttsRuntime?.textToSpeech ? (params) => ttsRuntime.textToSpeech(params) : void 0,
    audioFileToSilkBase64: ttsRuntime?.audioFileToSilkBase64 ? (audioPath) => ttsRuntime.audioFileToSilkBase64(audioPath) : void 0,
    log: log4?.child("deliver"),
    agentId: route.agentId ?? "default"
  };
  if (__qqSteerEnabled(ctx)) {
    const __qqSendText = deliverCtx.sendText;
    deliverCtx.sendText = async (...args) => {
      const started = Date.now();
      try {
        const result = await __qqSendText(...args);
        if (result?.error) __qqLatencyLog(ctx, "qq-send-error", `sendMs=${Date.now()-started}`);
        else if (!result?.suppressed) __qqLatencyLog(ctx, "qq-send-ok", `sendMs=${Date.now()-started}`);
        return result;
      } catch (err) { __qqLatencyLog(ctx, "qq-send-error", `sendMs=${Date.now()-started}`); throw err; }
    };
  }
  const __qqReceiptIdentity = __qqReceipts.identity(account.accountId, deliverCtx.qualifiedTarget, envelope.messageId);
  deliverCtx.__qqReceiptIdentity = __qqReceiptIdentity;
  deliverCtx.__qqControlledOrigin = __qqControlledOrigin;
  deliverCtx.__qqControlledSessionKey = route.sessionKey;
  for (const method of ["sendText", "sendMedia"]) {
    const original = deliverCtx[method];
    if (typeof original !== "function") continue;
    deliverCtx[method] = async (...args) => {
      __qqDeadlineCheck(ctx);
      const operation = __qqReceipts.operation(method, args);
      const payload = method === "sendText" ? { text: String(args[1] ?? "") } : { media: String(args[1] ?? ""), options: args[2] ?? {} };
      const result = await __qqReceipts.send(__qqReceiptIdentity, operation, payload, () => __qqWithRequestSignal(ctx.signal, () => original(...args)));
      if (result?.error) throw Object.assign(new Error(result.error), { code: result.errorCode || "QQ_DELIVERY_NOT_CONFIRMED", sendState: result.sendState || "uncertain" });
      return result;
    };
  }
  const streamingEnabled = shouldUseStreaming(
    account,
    envelope.chatScope === "group" ? "group" : "c2c"
  );
  const streamingController = streamingEnabled ? createStreamingController(envelope, account, log4?.child("streaming")) : null;
  if (streamingController) {
    streamingController.deps.assertActive = () => __qqDeadlineCheck(ctx);
    streamingController.deps.abortSignal = ctx.signal;
    const cancelPendingStream = () => streamingController.cancelPending("request-aborted");
    if (ctx.signal.aborted) cancelPendingStream();
    else ctx.signal.addEventListener("abort", cancelPendingStream, { once: true });
    (ctx.state.__qqAbortCleanups ||= []).push(() => ctx.signal.removeEventListener("abort", cancelPendingStream));
  }
  if (streamingController) {
    dlog?.debug(`streaming enabled for ${envelope.senderId}`);
  }
  const deliveredMediaUrls = /* @__PURE__ */ new Set();
  const deliveredTexts = new Set(__qqReceipts.confirmedTexts(__qqReceiptIdentity));
  __qqDeadlineCheck(ctx);
  const replyOptions = createQqbotReplyOptions({
    abortSignal: ctx.signal,
    runId: envelope.messageId,
    streamingController,
    log: dlog
  });
  try {
    const token=ctx.state.__qqExplicitStopSource;
    if (__qqExplicitStop.qualify(token,{sessionKey:route.sessionKey,accountId:route.accountId,senderId:envelope.senderId,target:ctx.message.replyTarget.targetId,sourceAliases:[envelope.messageId,ctxPayload.MessageSidFull,ctxPayload.MessageSid].filter(value=>typeof value==="string")})) replyOptions.qqExplicitStopSource=token;
  } catch {}
  const __qqRemainingBudget = __qqDeadlineRemaining(ctx);
  if (Number.isFinite(__qqRemainingBudget)) replyOptions.timeoutOverrideMs = Math.max(1, __qqRemainingBudget);
  __qqDeadlineLog(ctx, "core-dispatch", { remainingMs: __qqRemainingBudget });
  /* QQ-LATENCY-TRACE numeric SDK boundary v1; no routing/queue behavior. */
  try {
    if (process.env.OPENCLAW_QQ_PREPARATION_PROFILE === "1" &&
        (route.sessionKey === "agent:main:qqbot:group:b4ee2a7019c96343c96eeba8cb63d8c5" ||
         route.sessionKey === "agent:main:qqbot:group:379363a480715dfc01f13aaf92571111") &&
        envelope.chatScope === "group") {
      const __qqBoundaryClock = require("node:perf_hooks").performance;
      replyOptions.qqLatencyTraceSdkBoundary = Object.freeze({
        schema: "qq-latency-sdk-boundary-v1",
        atMonoMs: __qqBoundaryClock.now(), timeOrigin: __qqBoundaryClock.timeOrigin
      });
    }
  } catch {}

  /* QQ-SEGMENT-PATCH v1 */
  if (__qqSteerEnabled(ctx)) {
    const __qqOldPartial = replyOptions.onPartialReply;
    let __qqFirstPartial = false;
    replyOptions.onPartialReply = (payload) => {
      if (!__qqFirstPartial && typeof payload?.text === "string" && payload.text) { __qqFirstPartial = true; __qqLatencyLog(ctx, "first-partial"); }
      return __qqOldPartial?.(payload);
    };
  }
  const __qqSeg = !streamingController && envelope.chatScope === "group" ? __qqSegCreate(account, deliverCtx, dlog) : null;
  if (__qqSeg && __qqReceiptIdentity) replyOptions.readSourceReplyContinuation = __qqSourceAckContinuationReader({ctx,identity:__qqReceiptIdentity,accountId:account.accountId,sessionKey:route.sessionKey,sourceMessageId:envelope.messageId,sourceAliases:[ctxPayload.MessageSidFull,ctxPayload.MessageSid],segmenter:__qqSeg});
  if (__qqSeg) {
    const __prevPartial = replyOptions.onPartialReply;
    replyOptions.onPartialReply = (payload) => {
      try { __qqSeg.onPartial(payload); } catch (e) { dlog?.error?.(`[qq-segment] ${e?.message || e}`); }
      return __prevPartial ? __prevPartial(payload) : false;
    };
  }
  /* QQ-MEDIA-TAG-PATCH v1 */
  const __qqMt = !streamingController && envelope.chatScope === "group" ? __qqMtCreate(account, deliverCtx, dlog, envelope) : null;
  if (__qqMt) {
    const __prevPartialMt = replyOptions.onPartialReply;
    replyOptions.onPartialReply = (payload) => {
      try { __qqMt.onPartial(payload); } catch (e) { dlog?.error?.(`[qq-media-tag] ${e?.message || e}`); }
      return __prevPartialMt ? __prevPartialMt(payload) : false;
    };
  }
  // Gate late initiations; an already accepted platform request remains uncertain until ACK.
  deliverCtx.__qqAssertActive = () => __qqDeadlineCheck(ctx);
  deliverCtx.__qqRequestSignal = ctx.signal;
  for (const method of ["sendText", "sendMedia", "textToSpeech", "audioFileToSilkBase64"]) {
    if (typeof deliverCtx[method] !== "function") continue;
    const original = deliverCtx[method];
    deliverCtx[method] = async (...args) => { __qqDeadlineCheck(ctx); return await __qqWithRequestSignal(ctx.signal, () => original(...args)); };
  }
  const __qqDeadlinePartial = replyOptions.onPartialReply;
  replyOptions.onPartialReply = (payload) => {
    if (ctx.signal.aborted || __qqDeadlineRemaining(ctx) === 0) return false;
    return __qqDeadlinePartial?.(payload);
  };
  const deliverState = {
    ctx: deliverCtx,
    streamingController,
    deliveredMediaUrls,
    deliveredTexts,
    log: dlog,
    deliverReply,
    qqSeg: __qqSeg,
    qqMt: __qqMt
  };
  if (!adapters.inboundRun) {
    if (adapters.recordInboundSession) {
      try {
        await adapters.recordInboundSession({
          storePath,
          sessionKey: route.sessionKey,
          ctx: ctxPayload
        });
      } catch {
      }
    }
    await __qqSteerDispatch(ctx, () => adapters.dispatchReply({
      ...__qqNativeQueueDispatchOptions(ctx, adapters),
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver: (payload, info) => deliverDispatchPayload(payload, info, deliverState)
      },
      replyOptions
    }));
  } else {
    await adapters.inboundRun({
      channel: "qqbot",
      accountId: route.accountId,
      raw: envelope,
      adapter: {
        ingest: (raw) => ({
          id: envelope.messageId,
          rawText: assembled.rawBody,
          textForAgent: assembled.agentBody,
          textForCommands: assembled.rawBody,
          raw
        }),
        resolveTurn: (_input, _eventClass, _preflight) => ({
          channel: "qqbot",
          accountId: route.accountId,
          routeSessionKey: route.sessionKey,
          storePath,
          ctxPayload,
          recordInboundSession: adapters.recordInboundSession,
          record: {
            onRecordError: (err) => {
              dlog?.error(`Session record error: ${err}`);
            }
          },
          runDispatchLifecycle: {
            turnAdoptionLifecycle: void 0,
            onDispatchSkipped: (reason) => {
              dlog?.info(`dispatch skipped reason=${reason} sessionKey=${route.sessionKey}`);
            }
          },
          runDispatch: () => {
            return __qqSteerDispatch(ctx, () => adapters.dispatchReply({
              ...__qqNativeQueueDispatchOptions(ctx, adapters),
              ctx: ctxPayload,
              cfg,
              dispatcherOptions: {
                deliver: (payload, info) => deliverDispatchPayloadSafe(payload, info, deliverState)
              },
              replyOptions
            }));
          }
        })
      }
    });
  }
  dlog?.debug(`inboundRun completed sessionKey=${route.sessionKey}`);
  if (envelope.chatScope === "group") {
    clearGroupHistory(account.accountId, envelope.groupId ?? envelope.senderId);
  }
  if (streamingController && !streamingController.isTerminal) {
    await streamingController.finalize();
  }
  if (debouncer) {
    await debouncer.flushAll();
  }
}
function createStreamingController(envelope, account, log4) {
  const gw = getGateway(account.accountId);
  if (!gw) {
    log4?.error(`cannot enable streaming \u2014 gateway not running`);
    return null;
  }
  return new StreamingController({
    gateway: gw,
    target: {
      scope: "c2c",
      targetId: envelope.senderId,
      msgId: envelope.messageId
    },
    accountId: account.accountId,
    replyToId: envelope.messageId,
    log: log4
  });
}

// src/adapter/gateway.ts
var import_node_module4 = require("module");
var import_node_path8 = __toESM(require("path"), 1);
function loadApprovalGatewayRuntime() {
  const req4 = (0, import_node_module4.createRequire)(__filename);
  const pluginRoot = import_node_path8.default.resolve(import_node_path8.default.dirname(__filename), "..", "..");
  const fs21 = req4("node:fs");
  const tryLoadFromRoot = (root) => {
    for (const rel of ["dist/plugin-sdk/gateway-runtime.js", "plugin-sdk/gateway-runtime.js"]) {
      const p2 = import_node_path8.default.join(root, rel);
      try {
        if (fs21.existsSync(p2)) return req4(p2);
      } catch {
      }
    }
    return null;
  };
  try {
    const { findOpenclawRoot } = req4(import_node_path8.default.join(pluginRoot, "scripts", "link-sdk-core.cjs"));
    const root = findOpenclawRoot(pluginRoot);
    if (root) {
      const mod = tryLoadFromRoot(root);
      if (mod) return mod;
    }
  } catch {
  }
  try {
    const entry = process.argv[1];
    if (entry) {
      const realEntry = fs21.realpathSync(entry);
      let dir = import_node_path8.default.dirname(realEntry);
      for (let i = 0; i < 6; i++) {
        const mod = tryLoadFromRoot(dir);
        if (mod) return mod;
        const parent = import_node_path8.default.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  } catch {
  }
  return null;
}

// src/features/approval-handler.ts
function toShortId(approvalId) {
  return approvalId.replace(/^(exec|plugin):/, "").slice(0, 8);
}
function resolveApprovalKind(approvalId) {
  return approvalId.startsWith("plugin:") ? "plugin" : "exec";
}
function buildExecApprovalText(request2) {
  const expiresIn = Math.max(
    0,
    Math.round((request2.expiresAtMs - Date.now()) / 1e3)
  );
  const lines = ["\u{1F510} \u547D\u4EE4\u6267\u884C\u5BA1\u6279", ""];
  const cmd = request2.request.commandPreview ?? request2.request.command ?? "";
  if (cmd) lines.push(`\`\`\`
${cmd.slice(0, 300)}
\`\`\``);
  if (request2.request.cwd) lines.push(`\u{1F4C1} \u76EE\u5F55: ${request2.request.cwd}`);
  if (request2.request.agentId) lines.push(`\u{1F916} Agent: ${request2.request.agentId}`);
  lines.push("", `\u23F1\uFE0F \u8D85\u65F6: ${expiresIn} \u79D2`);
  return lines.join("\n");
}
function buildPluginApprovalText(request2) {
  const timeoutSec = Math.round((request2.request.timeoutMs ?? 12e4) / 1e3);
  const severityIcon = request2.request.severity === "critical" ? "\u{1F534}" : request2.request.severity === "info" ? "\u{1F535}" : "\u{1F7E1}";
  const lines = [`${severityIcon} \u5BA1\u6279\u8BF7\u6C42`, ""];
  lines.push(`\u{1F4CB} ${request2.request.title}`);
  if (request2.request.description) lines.push(`\u{1F4DD} ${request2.request.description}`);
  if (request2.request.toolName) lines.push(`\u{1F527} \u5DE5\u5177: ${request2.request.toolName}`);
  if (request2.request.pluginId) lines.push(`\u{1F50C} \u63D2\u4EF6: ${request2.request.pluginId}`);
  if (request2.request.agentId) lines.push(`\u{1F916} Agent: ${request2.request.agentId}`);
  lines.push("", `\u23F1\uFE0F \u8D85\u65F6: ${timeoutSec} \u79D2`);
  return lines.join("\n");
}
function buildApprovalKeyboard(approvalId) {
  const makeBtn = (id, label, visitedLabel, data, style) => ({
    id,
    render_data: { label, visited_label: visitedLabel, style },
    action: {
      type: 1,
      data,
      permission: { type: 2 },
      click_limit: 1
    },
    group_id: "approval"
  });
  return {
    content: {
      rows: [
        {
          buttons: [
            makeBtn("allow", "\u2705 \u5141\u8BB8\u4E00\u6B21", "\u5DF2\u5141\u8BB8", `approve:${approvalId}:allow-once`, 1),
            makeBtn("always", "\u2B50 \u59CB\u7EC8\u5141\u8BB8", "\u5DF2\u59CB\u7EC8\u5141\u8BB8", `approve:${approvalId}:allow-always`, 1),
            makeBtn("deny", "\u274C \u62D2\u7EDD", "\u5DF2\u62D2\u7EDD", `approve:${approvalId}:deny`, 0)
          ]
        }
      ]
    }
  };
}
function resolveTarget(sessionKey, turnSourceTo) {
  const sk = sessionKey ?? turnSourceTo;
  if (!sk) return null;
  const m3 = sk.match(/qqbot:(c2c|direct|group):([A-F0-9]+)/i);
  if (!m3) return null;
  const type = m3[1].toLowerCase() === "group" ? "group" : "c2c";
  return { type, id: m3[2] };
}
var QQBotApprovalHandler = class {
  gatewayClient = null;
  pending = /* @__PURE__ */ new Map();
  requestCache = /* @__PURE__ */ new Map();
  opts;
  started = false;
  connected = false;
  constructor(opts) {
    this.opts = opts;
  }
  async start() {
    if (this.started) return;
    this.started = true;
    const { log: log4 } = this.opts;
    log4?.debug?.(`[qqbot:${this.opts.accountId}] approval-handler: starting`);
    const gatewayRuntime = loadApprovalGatewayRuntime();
    if (!gatewayRuntime) {
      log4?.debug?.(`[qqbot:${this.opts.accountId}] approval-handler: gateway-runtime not available, approval disabled`);
      this.started = false;
      return;
    }
    try {
      this.gatewayClient = await gatewayRuntime.createOperatorApprovalsGatewayClient({
        config: this.opts.cfg,
        gatewayUrl: this.opts.gatewayUrl,
        clientDisplayName: "QQBot Approval Handler",
        onEvent: (evt) => this.handleGatewayEvent(evt),
        onHelloOk: () => {
          this.connected = true;
          log4?.debug?.(`[qqbot:${this.opts.accountId}] approval-handler: connected to gateway`);
        },
        onConnectError: (err) => log4?.error(`[qqbot:${this.opts.accountId}] approval-handler: connect error: ${err.message}`),
        onClose: (code, reason) => {
          this.connected = false;
          log4?.debug?.(`[qqbot:${this.opts.accountId}] approval-handler: gateway closed: ${code} ${reason}`);
        }
      });
      this.gatewayClient.start();
      setApprovalFeatureAvailable(true);
    } catch (err) {
      log4?.error(`[qqbot:${this.opts.accountId}] approval-handler: failed to create gateway client: ${err}`);
      this.started = false;
    }
  }
  async stop() {
    if (!this.started) return;
    this.started = false;
    for (const entry of this.pending.values()) clearTimeout(entry.timeoutId);
    this.pending.clear();
    this.requestCache.clear();
    await this.gatewayClient?.stop();
    this.gatewayClient = null;
    this.opts.log?.debug(`[qqbot:${this.opts.accountId}] approval-handler: stopped`);
  }
  /** gateway 是否已建立连接 */
  get isConnected() {
    return this.connected;
  }
  /** 检查是否有指定 shortId 对应的 pending 审批 */
  hasShortId(shortId) {
    for (const id of this.pending.keys()) {
      if (toShortId(id) === shortId) return true;
    }
    return false;
  }
  /** 解析审批请求（供 Interaction 回调或 /approve 命令调用） */
  async resolveApproval(approvalId, decision) {
    if (!this.gatewayClient) {
      this.opts.log?.warn(`[qqbot:${this.opts.accountId}] approval-handler: resolve ignored ${approvalId} \u2192 gatewayClient not ready`);
      return false;
    }
    let fullId = approvalId;
    if (this.pending.has(approvalId)) {
      fullId = approvalId;
    } else {
      for (const id of this.pending.keys()) {
        if (id === approvalId) {
          fullId = id;
          break;
        }
        if (id.replace(/^(exec|plugin):/, "") === approvalId) {
          fullId = id;
          break;
        }
        if (toShortId(id) === approvalId) {
          fullId = id;
          break;
        }
      }
      if (fullId === approvalId && !this.requestCache.has(approvalId)) {
        for (const id of this.requestCache.keys()) {
          if (id.replace(/^(exec|plugin):/, "") === approvalId) {
            fullId = id;
            break;
          }
        }
      }
    }
    const kind = resolveApprovalKind(fullId);
    const method = kind === "plugin" ? "plugin.approval.resolve" : "exec.approval.resolve";
    const isPending = this.pending.has(fullId);
    const isCached = this.requestCache.has(fullId);
    this.opts.log?.debug?.(`[qqbot:${this.opts.accountId}] approval-handler: resolving ${fullId} (input=${approvalId}) kind=${kind} \u2192 ${decision}, pending=${isPending}, cached=${isCached}`);
    try {
      await this.gatewayClient.request(method, { id: fullId, decision });
      this.opts.log?.debug(`[qqbot:${this.opts.accountId}] approval-handler: RPC success ${toShortId(fullId)} \u2192 ${decision} (method=${method})`);
      return true;
    } catch (err) {
      this.opts.log?.error(`[qqbot:${this.opts.accountId}] approval-handler: resolve failed: ${err}`);
      return false;
    }
  }
  handleGatewayEvent(evt) {
    if (evt.event === "exec.approval.requested") {
      void this.handleRequested(evt.payload, "exec");
    } else if (evt.event === "plugin.approval.requested") {
      void this.handleRequested(evt.payload, "plugin");
    } else if (evt.event === "exec.approval.resolved") {
      void this.handleResolved(evt.payload);
    } else if (evt.event === "plugin.approval.resolved") {
      void this.handleResolved(evt.payload);
    }
  }
  async handleRequested(request2, kind) {
    const { log: log4, appId, clientSecret, accountId } = this.opts;
    const shortId = toShortId(request2.id);
    const reqAccountId = request2.request.turnSourceAccountId?.trim();
    if (reqAccountId && reqAccountId !== accountId) {
      log4?.debug?.(`[qqbot:${accountId}] approval-handler: ${kind} ${shortId} ignored \u2192 account mismatch (req=${reqAccountId})`);
      return;
    }
    const sessionKey = request2.request.sessionKey;
    const turnSourceTo = request2.request.turnSourceTo;
    const target = resolveTarget(sessionKey, turnSourceTo);
    if (!target) {
      log4?.info(`[qqbot:${accountId}] approval-handler: no QQ target for ${shortId} (session=${sessionKey})`);
      return;
    }
    this.requestCache.set(
      request2.id,
      kind === "plugin" ? { kind: "plugin", request: request2 } : { kind: "exec", request: request2 }
    );
    log4?.info(`[qqbot:${accountId}] approval-handler: sending ${kind} approval ${shortId} to ${target.type}:${target.id}`);
    const text = kind === "plugin" ? buildPluginApprovalText(request2) : buildExecApprovalText(request2);
    const keyboard = buildApprovalKeyboard(request2.id);
    const timeoutMs = kind === "plugin" ? request2.request.timeoutMs ?? 12e4 : Math.max(0, request2.expiresAtMs - Date.now());
    await new Promise((r) => setTimeout(r, 2e3));
    try {
      const bot = getBotForAccount(accountId);
      const target_reply = {
        scope: target.type,
        targetId: target.id
      };
      await bot.sendTextWithKeyboard(target_reply, text, keyboard);
      log4?.info(`[qqbot:${accountId}] approval-handler: sent ${kind} approval ${shortId}`);
      const timeoutId = setTimeout(() => {
        this.handleTimeout(request2.id, target);
      }, timeoutMs + 2e3);
      this.pending.set(request2.id, { targets: [target], timeoutId });
    } catch (err) {
      this.requestCache.delete(request2.id);
      log4?.error(`[qqbot:${accountId}] approval-handler: failed to send approval ${shortId}: ${err}`);
    }
  }
  async handleResolved(resolved) {
    const entry = this.pending.get(resolved.id);
    const resolvedBy = resolved.resolvedBy ?? "unknown";
    const kind = resolveApprovalKind(resolved.id);
    this.opts.log?.info(
      `[qqbot:${this.opts.accountId}] approval-handler: gateway confirmed ${toShortId(resolved.id)} \u2192 ${resolved.decision} (kind=${kind}, resolvedBy=${resolvedBy}, wasPending=${!!entry})`
    );
    if (!entry) return;
    clearTimeout(entry.timeoutId);
    this.pending.delete(resolved.id);
    this.requestCache.delete(resolved.id);
  }
  async handleTimeout(approvalId, target) {
    const { log: log4, accountId } = this.opts;
    if (!this.pending.has(approvalId)) return;
    this.pending.delete(approvalId);
    this.requestCache.delete(approvalId);
    log4?.info(`[qqbot:${accountId}] approval-handler: timeout ${toShortId(approvalId)}`);
  }
};
var _handlers = /* @__PURE__ */ new Map();
var _approvalFeatureAvailable = false;
function setApprovalFeatureAvailable(available) {
  _approvalFeatureAvailable = available;
}
function registerApprovalHandler(accountId, handler) {
  _handlers.set(accountId, handler);
}
function unregisterApprovalHandler(accountId) {
  _handlers.delete(accountId);
}
function getApprovalHandler(accountId) {
  return _handlers.get(accountId);
}

// src/features/proactive.ts
var fs19 = __toESM(require("fs"), 1);
var path19 = __toESM(require("path"), 1);
init_config();
var log2 = createPluginLogger({ prefix: "[proactive]" });
var STORAGE_DIR = getQQBotDataDir("data");
var KNOWN_USERS_FILE = path19.join(STORAGE_DIR, "known-users.json");
var knownUsersCache = null;
var cacheLastModified = 0;
function ensureStorageDir() {
  if (!fs19.existsSync(STORAGE_DIR)) {
    fs19.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}
function getUserKey(type, openid, accountId) {
  return `${accountId}:${type}:${openid}`;
}
function loadKnownUsers() {
  if (knownUsersCache !== null) {
    try {
      const stat = fs19.statSync(KNOWN_USERS_FILE);
      if (stat.mtimeMs <= cacheLastModified) {
        return knownUsersCache;
      }
    } catch {
      return knownUsersCache;
    }
  }
  const users = /* @__PURE__ */ new Map();
  try {
    if (fs19.existsSync(KNOWN_USERS_FILE)) {
      const data = fs19.readFileSync(KNOWN_USERS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      for (const user of parsed) {
        const key = getUserKey(user.type, user.openid, user.accountId);
        users.set(key, user);
      }
      cacheLastModified = fs19.statSync(KNOWN_USERS_FILE).mtimeMs;
    }
  } catch (err) {
    log2.error(`Failed to load known users: ${err}`);
  }
  knownUsersCache = users;
  return users;
}
function saveKnownUsers(users) {
  try {
    ensureStorageDir();
    const data = Array.from(users.values());
    fs19.writeFileSync(KNOWN_USERS_FILE, JSON.stringify(data, null, 2), "utf-8");
    cacheLastModified = Date.now();
    knownUsersCache = users;
  } catch (err) {
    log2.error(`Failed to save known users: ${err}`);
  }
}
function recordKnownUser(user) {
  const users = loadKnownUsers();
  const key = getUserKey(user.type, user.openid, user.accountId);
  const existing = users.get(key);
  const now = user.lastInteractionAt || Date.now();
  users.set(key, {
    ...user,
    lastInteractionAt: now,
    firstInteractionAt: existing?.firstInteractionAt ?? now,
    // 更新昵称（如果有新的）
    nickname: user.nickname || existing?.nickname
  });
  saveKnownUsers(users);
  log2.info(`Recorded user: ${key}`);
}

// src/features/msgid-cache.ts
var MAX_PER_TARGET = 10;
var TTL_GROUP = 5 * 60 * 1e3;
var TTL_C2C = 30 * 60 * 1e3;
var MAX_TARGETS = 200;
var cache = /* @__PURE__ */ new Map();
function cacheMsgId(scope, targetId, msgId) {
  if (!scope || !targetId || !msgId) return;
  const key = `${scope}:${targetId}`;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    existing.push({ msgId, timestamp: Date.now() });
    if (existing.length > MAX_PER_TARGET) existing.shift();
    cache.set(key, existing);
  } else {
    cache.set(key, [{ msgId, timestamp: Date.now() }]);
    if (cache.size > MAX_TARGETS) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
}
function getCachedMsgId(scope, targetId) {
  const key = `${scope}:${targetId}`;
  const list = cache.get(key);
  if (!list || list.length === 0) return void 0;
  const now = Date.now();
  const ttl = scope === "group" ? TTL_GROUP : TTL_C2C;
  for (let i = list.length - 1; i >= 0; i--) {
    if (now - list[i].timestamp < ttl) {
      return list[i].msgId;
    }
  }
  return void 0;
}

// src/gateway/event-handlers.ts
init_resolve();
init_config();
async function handleMessage(ctx, msg, account, runtime2, log4) {
  const hlog = log4.child("handle");
  const scope = msg.replyTarget.scope;
  const targetId = scope === "group" ? `qqbot:group:${msg.replyTarget.targetId}` : `qqbot:c2c:${msg.replyTarget.targetId}`;
  const mergedCount = ctx.state.mergedMessages?.length;
  if (mergedCount) {
    hlog.info(`merged batch count=${mergedCount} msgId=${msg.messageId}`);
  } else {
    hlog.debug(`enter msgId=${msg.messageId} scope=${scope} contentLen=${(msg.content ?? "").length}`);
  }
  try {
    cacheMsgId(scope, msg.replyTarget.targetId, msg.messageId);
    recordKnownUser({
      type: scope === "group" ? "group" : "c2c",
      openid: scope === "group" ? msg.replyTarget.targetId : msg.senderId,
      accountId: account.accountId,
      nickname: msg.senderName,
      lastInteractionAt: Date.now()
    });
    await runWithRequestContext(
      {
        accountId: account.accountId,
        messageId: msg.messageId,
        openId: msg.senderId,
        target: targetId
      },
      () => dispatchToOpenClaw(ctx, msg, account, runtime2, log4)
    );
  } catch (err) {
    hlog.error(`dispatch error: ${err}`);
  }
  hlog.debug(`done msgId=${msg.messageId}`);
}
var INTERACTION_QUERY = 2001;
var INTERACTION_UPDATE = 2002;
async function handleInteraction(event, account, runtime2, log4, acknowledgeInteraction, handleJmInteraction) {
  if (event.data?.type === INTERACTION_QUERY) {
    await handleConfigQuery(event, account, runtime2, log4, acknowledgeInteraction);
    return;
  }
  if (event.data?.type === INTERACTION_UPDATE) {
    await handleConfigUpdate(event, account, runtime2, log4);
    try {
      const adapters = getAdapters(runtime2);
      const cfg = adapters.getConfig?.() ?? {};
      const groupOpenid = event.group_openid ?? "";
      const updatedCfg = groupOpenid ? resolveGroupConfigFromAccount(account, groupOpenid) : null;
      const requireMention = updatedCfg?.requireMention ?? true;
      const clawCfg = buildClawCfg(requireMention, [], resolveGroupPolicy(cfg, account.accountId));
      await acknowledgeInteraction(event.id, 0, { claw_cfg: clawCfg });
    } catch {
      try {
        await acknowledgeInteraction(event.id);
      } catch {
      }
    }
    return;
  }
  const buttonData = event.data?.resolved?.button_data ?? "";
  if (buttonData.startsWith("jm:v1:")) {
    if (handleJmInteraction) await handleJmInteraction(event, acknowledgeInteraction);
    else await acknowledgeInteraction(event.id, 1).catch(() => void 0);
    return;
  }
  await handleApproval(event, account, log4, acknowledgeInteraction);
}
async function handleConfigQuery(event, account, runtime2, log4, ack) {
  const groupOpenid = event.group_openid ?? "";
  try {
    const adapters = getAdapters(runtime2);
    const cfg = adapters.getConfig?.() ?? {};
    const groupCfg = groupOpenid ? resolveGroupConfigFromAccount(account, groupOpenid) : null;
    const requireMention = groupCfg?.requireMention ?? true;
    const agentId = groupOpenid ? adapters.resolveAgentRoute?.({ cfg, channel: "qqbot", accountId: account.accountId, peer: { kind: "group", id: groupOpenid } })?.agentId : void 0;
    const mentionPatterns = resolveMentionPatterns(cfg, agentId);
    const clawCfg = buildClawCfg(requireMention, mentionPatterns, resolveGroupPolicy(cfg, account.accountId));
    log4.info(`interaction query: group=${groupOpenid} requireMention=${requireMention}`);
    await ack(event.id, 0, { claw_cfg: clawCfg });
  } catch (err) {
    log4.warn(`interaction query failed: ${err?.message ?? err}, ack without data`);
    try {
      await ack(event.id);
    } catch {
    }
  }
}
async function handleConfigUpdate(event, account, runtime2, log4) {
  const resolved = event.data?.resolved;
  const update = resolved?.claw_cfg;
  const groupOpenid = event.group_openid ?? "";
  if (update?.require_mention !== void 0 && groupOpenid) {
    try {
      await setGroupRequireMention(runtime2, account.accountId, groupOpenid, update.require_mention === "mention");
      log4.info(`interaction: group=${groupOpenid} requireMention=${update.require_mention}`);
    } catch (err) {
      log4.error(`interaction update failed: ${err}`);
    }
  }
}
async function handleApproval(event, account, log4, ack) {
  try {
    await ack(event.id);
  } catch {
  }
  const buttonData = event.data?.resolved?.button_data;
  if (!buttonData?.startsWith("approve:")) return;
  const operatorId = resolveOperatorId(event);
  if (!isApprovalAuthorized(account, operatorId)) {
    log4.warn(`[approval] unauthorized operator=${operatorId ?? "unknown"} account=${account.accountId}`);
    return;
  }
  const parts = buttonData.split(":");
  if (parts.length < 3) return;
  const handler = getApprovalHandler(account.accountId);
  if (!handler) return;
  const approvalId = parts[1];
  const decision = parts[2];
  try {
    await handler.resolveApproval(approvalId, decision);
  } catch (err) {
    log4.error(`interaction approve error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
var CHANNEL_VER = getPackageVersion();
function resolveOperatorId(event) {
  const evt = event;
  return evt.user_openid ?? evt.data?.resolved?.user_id ?? evt.data?.resolved?.user_openid ?? evt.openid;
}
function isApprovalAuthorized(account, operatorId) {
  if (!operatorId) return false;
  const allowFrom = account.config?.allowFrom ?? [];
  if (!allowFrom.length || allowFrom.includes("*")) return true;
  return allowFrom.includes(operatorId);
}
function buildClawCfg(requireMention, mentionPatterns, groupPolicy) {
  return {
    channel_type: "qqbot",
    channel_ver: CHANNEL_VER,
    claw_type: "openclaw",
    claw_ver: getOpenClawVersion(),
    require_mention: requireMention ? "mention" : "always",
    group_policy: groupPolicy,
    mention_patterns: mentionPatterns.join(","),
    online_state: "online"
  };
}
function setGroupRequireMention(runtime2, accountId, groupOpenid, requireMention) {
  const adapters = getAdapters(runtime2);
  return adapters.persistConfig?.((cfg) => {
    const qqbot = (cfg.channels ?? {})?.qqbot ?? {};
    const groups = accountId !== "default" && qqbot.accounts?.[accountId] ? qqbot.accounts[accountId].groups = { ...qqbot.accounts[accountId].groups } : qqbot.groups = { ...qqbot.groups };
    groups[groupOpenid] = { ...groups[groupOpenid], requireMention };
  }) ?? Promise.resolve();
}

// src/integrations/jm/integration.ts
var jm_import_node_crypto3 = require("crypto");
var jm_import_node_fs9 = require("fs");
var jm_import_node_path10 = __toESM(require("path"), 1);
var ENABLED2 = process.env.OPENCLAW_QQBOT_JM_ENABLED === "1";
function parseButtonIdentity(event) {
  const e = event;
  if (e.scene === "group" && e.chat_type === 1 && typeof e.group_openid === "string" && e.group_openid && typeof e.group_member_openid === "string" && e.group_member_openid) {
    return {
      scope: "group",
      targetId: e.group_openid,
      channelId: `qqbot:group:${e.group_openid}`,
      userId: e.group_member_openid
    };
  }
  if (e.scene === "c2c" && e.chat_type === 2 && typeof e.user_openid === "string" && e.user_openid) {
    return {
      scope: "c2c",
      targetId: e.user_openid,
      channelId: `qqbot:c2c:${e.user_openid}`,
      userId: e.user_openid
    };
  }
  return null;
}
// QQ-STARTUP-LIFECYCLE v3: fixed metadata only, no authority or task fields.
var qqStartupTimingContexts = new WeakMap();
var qqStartupTimingSpans = new WeakSet();
var qqStartupTimingAttemptCount = 0;
var qqStartupTimingRecordCount = 0;
function qqStartupNow() {
  try {
    const value = globalThis.performance?.now?.();
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  } catch { return null; }
}
function qqStartupEmit(trace, span, stage, event, at, duration, outcome) {
  try {
    if (!trace || trace.records >= 32 || qqStartupTimingRecordCount >= 256) return;
    trace.records += 1;
    qqStartupTimingRecordCount += 1;
    trace.log.info("[qq-startup-lifecycle] " + JSON.stringify({
      schema: 1, attempt: trace.attempt, span, stage, event,
      atMonoMs: at, durationMs: duration, outcome
    }));
  } catch { /* Diagnostic failure never changes startup or error handling. */ }
}
function qqStartupDuration(start, end) {
  return typeof start === "number" && typeof end === "number" && end >= start && end - start <= 36e5 ? Math.round((end - start) * 1e3) / 1e3 : null;
}
function qqStartupCreate(bot, log4) {
  try {
    if (qqStartupTimingContexts.has(bot) || qqStartupTimingAttemptCount >= 64) return;
    const trace = { attempt: ++qqStartupTimingAttemptCount, records: 0, spans: 0, firstReady: false, stopped: false, closed: false, log: log4, owners: [bot], transportAt: null };
    qqStartupTimingContexts.set(bot, trace);
    return trace;
  } catch { return; }
}
function qqStartupBind(owner, bot) {
  try {
    const trace = qqStartupTimingContexts.get(bot);
    if (!trace || trace.closed || trace.owners.length >= 2) return;
    qqStartupTimingContexts.set(owner, trace);
    trace.owners.push(owner);
  } catch { /* No business option or capability is modified. */ }
}
function qqStartupBegin(owner, stage) {
  try {
    const trace = qqStartupTimingContexts.get(owner);
    if (!trace || trace.closed || trace.spans >= 16 || ((stage === "token" || stage === "gateway-url") && trace.firstReady)) return;
    const at = qqStartupNow();
    const span = { trace, id: ++trace.spans, stage, at, ended: false };
    qqStartupTimingSpans.add(span);
    if (stage === "transport") trace.transportAt = at;
    qqStartupEmit(trace, span.id, stage, "begin", at, null, null);
    return span;
  } catch { return; }
}
function qqStartupEnd(span, outcome) {
  try {
    if (!span || !qqStartupTimingSpans.has(span) || span.ended) return;
    span.ended = true;
    const at = qqStartupNow();
    qqStartupEmit(span.trace, span.id, span.stage, outcome === "error" ? "fail" : "end", at, qqStartupDuration(span.at, at), outcome);
  } catch { /* Preserve the original awaited result or exception. */ }
}
function qqStartupFirstReady(trace) {
  try {
    if (!trace || trace.closed || trace.firstReady) return;
    trace.firstReady = true;
    const at = qqStartupNow();
    qqStartupEmit(trace, 0, "transport", "first-ready", at, qqStartupDuration(trace.transportAt, at), "ok");
  } catch { /* Optional only. */ }
}
function qqStartupStopped(trace) {
  try {
    if (!trace || trace.stopped) return;
    trace.stopped = true;
    trace.closed = true;
    const at = qqStartupNow();
    qqStartupEmit(trace, 0, "transport", "stopped", at, qqStartupDuration(trace.transportAt, at), "cancelled");
  } catch { /* Optional only. */ }
}
function qqStartupRelease(trace) {
  try {
    if (!trace) return;
    trace.closed = true;
    for (const owner of trace.owners) if (qqStartupTimingContexts.get(owner) === trace) qqStartupTimingContexts.delete(owner);
    trace.owners.length = 0;
  } catch { /* Optional only. */ }
}

var JmIntegration = class {
  constructor(account, bot, log4) {
    this.account = account;
    this.bot = bot;
    this.log = log4;
    this.inboxDir = getQQBotDataDir(account.accountId, "jm", "inbox");
    this.statePath = jmStatePath(account.accountId);
  }
  account;
  bot;
  log;
  inboxDir;
  statePath;
  timer;
  busy = false;
  stopped = true;
  lifecycleGeneration = 0;
  startGeneration = -1;
  startPromise;
  async start() {
    if (!ENABLED2) return;
    const generation = this.lifecycleGeneration;
    if (this.startPromise && this.startGeneration === generation) return this.startPromise;
    const previous = this.startPromise;
    this.startGeneration = generation;
    const starting = (async () => {
      if (previous) await previous.catch(() => {});
      if (this.lifecycleGeneration !== generation) return;
      const recoverySpan = qqStartupBegin(this.bot, "jm-recovery");
      let recoveryFailed = false;
      try {
        await runJm(this.account.accountId, ["--recover-delivery"]).catch((err) => {
          recoveryFailed = true;
          this.log.warn(`[jm] delivery recovery unavailable: ${String(err).slice(0, 300)}`);
        });
      } catch (error) {
        qqStartupEnd(recoverySpan, "error");
        throw error;
      }
      if (this.lifecycleGeneration !== generation) {
        qqStartupEnd(recoverySpan, "cancelled");
        return;
      }
      qqStartupEnd(recoverySpan, recoveryFailed ? "error" : "ok");
      this.stopped = false;
      void this.tick();
      this.timer = setInterval(() => {
        void this.tick();
      }, 4e3);
      this.timer.unref?.();
    })();
    this.startPromise = starting;
    return starting;
  }
  stop() {
    this.lifecycleGeneration += 1;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
  }
  async handleInteraction(event, ack) {
    const buttonData = event.data?.resolved?.button_data ?? "";
    const match = /^jm:v1:confirm:([A-Za-z0-9_-]{32})$/.exec(buttonData);
    if (!match) {
      await ack(event.id, 1);
      return;
    }
    const identity2 = parseButtonIdentity(event);
    if (!identity2 || event.type !== 11) {
      await ack(event.id, 4);
      return;
    }
    const receipt = { eventId: event.id, token: match[1], ...identity2 };
    try {
      await this.persistReceipt(receipt);
    } catch (err) {
      this.log.error(`[jm] durable intake failed: ${String(err).slice(0, 300)}`);
      await ack(event.id, 1).catch(() => void 0);
      return;
    }
    await ack(event.id, 0);
    void this.tick();
  }
  async persistReceipt(receipt) {
    await jm_import_node_fs9.promises.mkdir(this.inboxDir, { recursive: true, mode: 448 });
    const name = (0, jm_import_node_crypto3.createHash)("sha256").update(`${this.account.accountId}\0${receipt.eventId}`).digest("hex") + ".json";
    const finalPath = jm_import_node_path10.default.join(this.inboxDir, name);
    try {
      await jm_import_node_fs9.promises.access(finalPath);
      return;
    } catch {
    }
    const tmp = jm_import_node_path10.default.join(this.inboxDir, `.${name}.${process.pid}.tmp`);
    const fh = await jm_import_node_fs9.promises.open(tmp, "wx", 384);
    try {
      await fh.writeFile(JSON.stringify(receipt), "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await jm_import_node_fs9.promises.rename(tmp, finalPath);
    const dir = await jm_import_node_fs9.promises.open(this.inboxDir, "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  async tick() {
    if (!ENABLED2 || this.stopped || this.busy) return;
    this.busy = true;
    try {
      await this.relayInbox();
      if (this.stopped) return;
      await runJm(this.account.accountId, ["--worker-once"], void 0, 0).catch((err) => {
        this.log.error(`[jm] worker invocation failed: ${String(err).slice(0, 300)}`);
      });
      if (this.stopped) return;
      await this.deliverOutbox();
    } catch (err) {
      this.log.error(`[jm] integration tick failed: ${String(err).slice(0, 300)}`);
    } finally {
      this.busy = false;
    }
  }
  async relayInbox() {
    const names = (await jm_import_node_fs9.promises.readdir(this.inboxDir).catch(() => [])).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort();
    for (const name of names) {
      if (this.stopped) return;
      const file = jm_import_node_path10.default.join(this.inboxDir, name);
      let receipt;
      try {
        receipt = JSON.parse(await jm_import_node_fs9.promises.readFile(file, "utf8"));
      } catch (err) {
        this.log.error(`[jm] bad inbox record ${name}: ${String(err).slice(0, 200)}`);
        continue;
      }
      try {
        const result = await runJm(this.account.accountId, [
          "--confirm-enqueue",
          "--token",
          receipt.token,
          "--channel",
          receipt.channelId,
          "--user",
          receipt.userId
        ]);
        if (result.ok) {
          await jm_import_node_fs9.promises.unlink(file).catch(() => void 0);
          this.log.info(`[jm] confirmation accepted job=${result.job_id ?? "existing"}`);
        } else if ([
          "bad_token",
          "invalid_or_expired_token",
          "confirm_owner_mismatch",
          "disabled",
          "download_disabled",
          "channel_not_allowed",
          "user_not_allowed"
        ].includes(result.reason ?? "")) {
          await jm_import_node_fs9.promises.unlink(file).catch(() => void 0);
          await this.bot.sendText(
            { scope: receipt.scope, targetId: receipt.targetId },
            result.reply || "\u786E\u8BA4\u8BF7\u6C42\u672A\u83B7\u53D7\u7406\u3002"
          ).catch(() => void 0);
        }
      } catch (err) {
        this.log.warn(`[jm] inbox relay deferred: ${String(err).slice(0, 300)}`);
        return;
      }
    }
  }
  async deliverOutbox() {
    const outbox = await runJm(this.account.accountId, ["--outbox-next"]);
    for (const item of outbox.items ?? []) {
      if (this.stopped || item.delivery_state !== "waiting") continue;
      const parsed = /^(qqbot):(group|c2c):(.+)$/.exec(String(item.channel_id));
      if (!parsed || !item.media_path) {
        await runJm(this.account.accountId, [
          "--mark-delivery",
          String(item.id),
          "--delivery-state",
          "awaiting_user",
          "--delivery-error",
          "invalid saved delivery target or missing PDF"
        ]);
        continue;
      }
      const target = { scope: parsed[2], targetId: parsed[3] };
      const claimed = await runJm(this.account.accountId, [
        "--claim-delivery",
        String(item.id),
        "--channel",
        String(item.channel_id),
        "--user",
        String(item.user_id)
      ]);
      if (!claimed.ok) continue;
      let safePath;
      try {
        safePath = await validatePdfPath(this.account.accountId, String(item.media_path));
      } catch (err) {
        await runJm(this.account.accountId, [
          "--mark-delivery",
          String(item.id),
          "--delivery-state",
          "awaiting_user",
          "--delivery-error",
          String(err).slice(0, 300)
        ]).catch(() => void 0);
        continue;
      }
      try {
        const sent = await this.bot.sendMedia({
          target,
          fileType: MediaFileType.FILE,
          localPath: safePath,
          fileName: `JM-${item.album_id}.pdf`,
          content: `\u4EFB\u52A1 ${item.id} \u7684 PDF`
        });
        if (sent.message?.id) {
          await runJm(this.account.accountId, [
            "--mark-delivery",
            String(item.id),
            "--delivery-state",
            "sent",
            "--delivery-message-id",
            sent.message.id
          ]);
        } else {
          await runJm(this.account.accountId, [
            "--mark-delivery",
            String(item.id),
            "--delivery-state",
            "uncertain",
            "--delivery-error",
            "QQ send returned no message id"
          ]);
        }
      } catch (err) {
        await runJm(this.account.accountId, [
          "--mark-delivery",
          String(item.id),
          "--delivery-state",
          "uncertain",
          "--delivery-error",
          String(err).slice(0, 300)
        ]).catch(() => void 0);
        this.log.warn(`[jm] proactive PDF delivery result uncertain job=${item.id}; user may explicitly claim from original chat`);
      }
    }
  }
};
function createJmIntegration(account, bot, log4) {
  return ENABLED2 ? new JmIntegration(account, bot, log4) : void 0;
}

// src/adapter/webhook.ts
var sharedTargets = /* @__PURE__ */ new Map();
var _routeUnregisters = /* @__PURE__ */ new Map();
function createPluginWebhookAdapter(params) {
  let unregistered = false;
  let storedPath = "";
  const accountId = params.account.accountId;
  return {
    async listen(_port, path22, handler) {
      const ingress = await import("openclaw/plugin-sdk/webhook-ingress").catch(() => null);
      if (!ingress?.registerWebhookTargetWithPluginRoute) {
        params.log.error("Webhook ingress not available");
        return;
      }
      const webhookPath = storedPath = path22 && path22 !== "/" ? path22 : params.account.config.webhook?.path ?? "/qqbot/webhook";
      const existing = sharedTargets.get(webhookPath);
      if (existing) {
        const dupIdx = existing.findIndex((t) => t.accountId === accountId);
        if (dupIdx >= 0) {
          existing[dupIdx] = { path: webhookPath, accountId, appId: params.account.appId, clientSecret: params.account.clientSecret, handler };
          params.log.info(`Webhook target refreshed for ${accountId} on ${webhookPath}`);
          return;
        }
      }
      const target = {
        path: webhookPath,
        accountId,
        appId: params.account.appId,
        clientSecret: params.account.clientSecret,
        handler
      };
      const result = ingress.registerWebhookTargetWithPluginRoute({
        targetsByPath: sharedTargets,
        target,
        route: {
          auth: "plugin",
          match: "exact",
          pluginId: "openclaw-qqbot",
          source: "qqbot-webhook",
          accountId,
          replaceExisting: true,
          log: (msg) => params.log.info(msg),
          handler: createSharedHandler(webhookPath, params.log)
        },
        onLastPathTargetRemoved: () => {
          params.log.info(`Last webhook target removed from ${webhookPath}`);
        }
      });
      _routeUnregisters.set(webhookPath, result.unregister);
      params.log.info(`Webhook target added on ${webhookPath} (${sharedTargets.get(webhookPath).length} account(s))`);
    },
    close() {
      if (unregistered) return;
      unregistered = true;
      if (storedPath) {
        _routeUnregisters.get(storedPath)?.();
        _routeUnregisters.delete(storedPath);
      }
    }
  };
}
function createSharedHandler(path22, log4) {
  return async (req4, res) => {
    try {
      const ingress = await import("openclaw/plugin-sdk/webhook-ingress").catch(() => null);
      if (!ingress?.withResolvedWebhookRequestPipeline) {
        await handleSimple(req4, res, path22, log4);
        return;
      }
      await ingress.withResolvedWebhookRequestPipeline({
        req: req4,
        res,
        targetsByPath: sharedTargets,
        rateLimiter: ingress.createFixedWindowRateLimiter?.({
          windowMs: 6e4,
          maxRequests: 600,
          maxTrackedKeys: 4096
        }),
        inFlightLimiter: ingress.createWebhookInFlightLimiter?.({
          maxInFlightPerKey: 8,
          maxTrackedKeys: 4096
        }),
        requireJsonContentType: true,
        handle: async ({ targets }) => {
          const bodyResult = await ingress.readWebhookBodyOrReject({
            req: req4,
            res,
            maxBytes: 1048576,
            timeoutMs: 3e4
          });
          if (!bodyResult.ok) {
            log4.warn?.(`[webhook] body rejected`);
            return;
          }
          const rawBody = Buffer.from(bodyResult.value, "utf-8");
          let payload;
          try {
            payload = JSON.parse(bodyResult.value);
          } catch (err) {
            log4.warn?.(`[webhook] invalid json: ${err.message}`);
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "invalid json" }));
            return;
          }
          if (payload.op === 13) {
            const t = targets[0];
            if (!t) {
              log4.warn?.(`[webhook] op:13 no target on ${path22}`);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "no target" }));
              return;
            }
            const h3 = resolveTargetHandler(path22, t.accountId);
            if (!h3) {
              log4.warn?.(`[webhook] op:13 no handler for ${t.accountId}`);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "no handler" }));
              return;
            }
            await delegateToHandler(h3, req4, res, rawBody);
            return;
          }
          const timestamp = getHeader2(req4, "x-signature-timestamp") ?? "";
          const signature = getHeader2(req4, "x-signature-ed25519") ?? "";
          if (!timestamp || !signature) {
            log4.warn?.(`[webhook] missing signature headers on ${req4.url}`);
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "missing signature" }));
            return;
          }
          const matched = ingress.resolveWebhookTargetWithAuthOrRejectSync({
            targets,
            res,
            isMatch: (t) => verifyWebhookSignature({
              body: rawBody,
              timestamp,
              signature,
              botSecret: t.clientSecret
            }),
            unauthorizedStatusCode: 401,
            unauthorizedMessage: JSON.stringify({ error: "invalid signature" })
          });
          if (!matched) {
            log4.warn?.(`[webhook] signature mismatch on ${path22} (${targets.length} target(s))`);
            return;
          }
          const h2 = resolveTargetHandler(path22, matched.accountId);
          if (!h2) {
            log4.error?.(`[webhook] no handler for matched target ${matched.accountId}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "no handler" }));
            return;
          }
          await delegateToHandler(h2, req4, res, rawBody);
        }
      });
    } catch (err) {
      log4.error(`Webhook handler error: ${err.message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "internal error" }));
      }
    }
  };
}
function resolveTargetHandler(path22, accountId) {
  return sharedTargets.get(path22)?.find((t) => t.accountId === accountId)?.handler;
}
async function delegateToHandler(handler, req4, res, rawBody) {
  const headers = {};
  for (const [k, v] of Object.entries(req4.headers)) {
    headers[k.toLowerCase()] = v;
  }
  const resp = await handler({ body: rawBody, headers });
  res.statusCode = resp.status;
  if (resp.headers) {
    for (const [k, v] of Object.entries(resp.headers)) res.setHeader(k, v);
  }
  res.end(resp.body);
}
async function handleSimple(req4, res, path22, log4) {
  try {
    const ct = String(req4.headers["content-type"] ?? "");
    if (!ct.includes("application/json")) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "unsupported content type" }));
      return;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req4) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > 1048576) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: "too large" }));
        return;
      }
      chunks.push(buf);
    }
    const rawBody = Buffer.concat(chunks);
    const entries = sharedTargets.get(path22) ?? [];
    for (const entry of entries) {
      const resp = await entry.handler({ body: rawBody, headers: mapHeaders(req4) });
      if (resp.status < 400) {
        res.statusCode = resp.status;
        if (resp.headers) for (const [k, v] of Object.entries(resp.headers)) res.setHeader(k, v);
        res.end(resp.body);
        return;
      }
    }
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "invalid signature" }));
  } catch (err) {
    log4.error(`Webhook simple handler error: ${err.message}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "internal error" }));
    }
  }
}
function mapHeaders(req4) {
  const h2 = {};
  for (const [k, v] of Object.entries(req4.headers ?? {})) h2[k.toLowerCase()] = v;
  return h2;
}
function getHeader2(req4, key) {
  const val = req4.headers[key];
  return Array.isArray(val) ? val[0] : val;
}

// src/gateway/qqbot-gateway.ts
var TEXT_TIMEOUT_MS = 3e4;
var MEDIA_TIMEOUT_MS = 3e5;
function resolveMs(envKey, defaultMs) {
  const env = process.env[envKey];
  if (env) {
    const v = Number(env);
    if (!Number.isNaN(v) && v > 0) return v;
  }
  return defaultMs;
}
function withTimeout(promise, ms, label) {
  if (ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise(
      (_2, reject) => setTimeout(() => reject(new Error(`\u51FA\u7AD9\u8D85\u65F6: ${label} (${ms}ms)`)), ms)
    )
  ]);
}
function baseBotOptions(account, log4) {
  return {
    appId: account.appId,
    appSecret: account.clientSecret,
    accountId: account.accountId,
    markdownSupport: account.markdownSupport,
    userAgent: buildUserAgent(account.userAgentSuffix),
    baseUrl: process.env.QQBOT_BASE_URL?.replace(/\/+$/, "") || "https://api.sgroup.qq.com",
    tokenBaseUrl: process.env.QQBOT_TOKEN_BASE_URL?.replace(/\/+$/, "") || "https://bots.qq.com",
    logger: log4
  };
}
var QQBotGateway = class {
  bot;
  account;
  runtime;
  log;
  textTimeout;
  mediaTimeout;
  jmIntegration;
  constructor(account, runtime2, log4) {
    this.textTimeout = resolveMs("OPENCLAW_OUTBOUND_TIMEOUT_MS", TEXT_TIMEOUT_MS);
    this.mediaTimeout = resolveMs("OPENCLAW_OUTBOUND_MEDIA_TIMEOUT_MS", MEDIA_TIMEOUT_MS);
    this.account = account;
    this.runtime = runtime2;
    this.log = log4 ?? createPluginLogger({ prefix: `[qqbot:${account.accountId}]` });
    if (!runtime2) {
      this.bot = new QQBot({ ...baseBotOptions(account, this.log), tokenPrefetch: "async" });
      return;
    }
    const dataDir = getQQBotDataDir(account.accountId);
    const isWebhook = account.config.transport === "webhook";
    this.bot = new QQBot({
      ...baseBotOptions(account, this.log),
      transport: account.config.transport,
      webhook: isWebhook ? { path: account.config.webhook?.path, server: createPluginWebhookAdapter({ account, log: this.log }) } : void 0,
      sessionPersistence: kvSessionPersistence({
        store: new FileKVStore({ dir: dataDir, fileName: "session.json" }),
        accountId: account.accountId
      }),
      tokenPrefetch: "sync"
    });
    this.wrapBotSendForRefIndex();
    this.jmIntegration = createJmIntegration(account, this.bot, this.log);
    setupMiddlewares(this.bot, account, {
      getRuntime: () => runtime2
    });
  }
  async start(callbacks, signal) {
    if (!this.runtime) {
      throw new Error(`[qqbot] Cannot start send-only gateway "${this.account.accountId}"`);
    }
    const runtime2 = this.runtime;
    const lifecycle = { closed: false, jmStarted: false };
    this.jmStartupLifecycle = lifecycle;
    const startupTrace = qqStartupCreate(this.bot, this.log);
    this.startupTimingTrace = startupTrace;
    const startJmOnce = () => {
      if (!this.jmIntegration || lifecycle.closed || lifecycle.jmStarted || signal?.aborted || this.jmStartupLifecycle !== lifecycle) return;
      lifecycle.jmStarted = true;
      const warnStartup = () => { try { this.log.warn?.("[qqbot] JM background startup unavailable"); } catch {} };
      try { queueMicrotask(() => {
        if (lifecycle.closed || signal?.aborted || this.jmStartupLifecycle !== lifecycle) return;
        try { Promise.resolve(this.jmIntegration.start()).catch(warnStartup); } catch { warnStartup(); }
      }); } catch { warnStartup(); }
    };
    const handleReady = () => {
      if (!lifecycle.closed && !signal?.aborted && this.jmStartupLifecycle === lifecycle) qqStartupFirstReady(startupTrace);
      this.log.info(`Gateway ready`);
      try { callbacks?.onReady?.(); } finally { startJmOnce(); }
    };
    this.bot.on(`ready`, handleReady);
    this.bot.on(`resumed`, handleReady);
    this.bot.on("error", (err) => {
      this.log.error(`Gateway error: ${err.message}`);
      callbacks?.onError?.(err);
    });
    const gatewayLog = this.log.child("gateway");
    this.bot.on("message", async (ctx, msg) => {
      gatewayLog.debug(`message msgId=${msg.messageId}`);
      try {
        await handleMessage(ctx, msg, this.account, runtime2, this.log);
      } catch (err) {
        gatewayLog.error(`Dispatch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    this.bot.on("interaction", (_ctx, event) => {
      handleInteraction(
        event,
        this.account,
        runtime2,
        this.log,
        (id, code, data) => this.bot.acknowledgeInteraction(id, code, data),
        (jmEvent, ack) => this.jmIntegration
          ? this.jmIntegration.handleInteraction(jmEvent, ack)
          : ack(jmEvent.id, 1)
      ).catch((err) => {
        this.log.error(`Interaction error: ${err}`);
      });
    });
    const transportSpan = qqStartupBegin(this.bot, "transport");
    let transportFailed = false;
    try {
      await this.bot.start(signal);
    } catch (error) {
      transportFailed = true;
      throw error;
    } finally {
      lifecycle.closed = true;
      try { this.jmIntegration?.stop(); } finally {
        qqStartupEnd(transportSpan, transportFailed ? "error" : signal?.aborted ? "cancelled" : "ok");
        qqStartupStopped(startupTrace);
        qqStartupRelease(startupTrace);
      }
    }
  }
  async stop() {
    if (this.jmStartupLifecycle) this.jmStartupLifecycle.closed = true;
    qqStartupStopped(this.startupTimingTrace);
    this.jmIntegration?.stop();
    await this.bot.stop();
  }
  async sendText(target, text, opts) {
    return withTimeout(
      this.bot.sendText(attachMsgId(target, opts), text),
      this.textTimeout,
      "sendText"
    );
  }
  async sendMedia(target, source, opts) {
    const resolvedTarget = attachMsgId(target, opts);
    const fileType = opts?.fileType ?? MediaFileType.IMAGE;
    const sourceOpts = resolveMediaSource(source);
    const result = await withTimeout(
      this.bot.sendMedia({ target: resolvedTarget, fileType, ...sourceOpts, content: opts?.text }),
      this.mediaTimeout,
      "sendMedia"
    );
    return result.message ?? { id: "", timestamp: Date.now() };
  }
  async sendVoice(target, source, opts) {
    const resolvedTarget = attachMsgId(target, opts);
    if (source.base64) {
      const result2 = await withTimeout(
        this.bot.sendMedia({ target: resolvedTarget, fileType: MediaFileType.VOICE, fileData: source.base64, content: opts?.text }),
        this.mediaTimeout,
        "sendVoice(base64)"
      );
      return result2.message ?? { id: "", timestamp: Date.now() };
    }
    if (source.localPath) {
      const result2 = await withTimeout(
        this.bot.sendMedia({ target: resolvedTarget, fileType: MediaFileType.VOICE, localPath: source.localPath, content: opts?.text }),
        this.mediaTimeout,
        "sendVoice(path)"
      );
      return result2.message ?? { id: "", timestamp: Date.now() };
    }
    const result = await withTimeout(
      this.bot.sendMedia({ target: resolvedTarget, fileType: MediaFileType.VOICE, url: source.url, content: opts?.text }),
      this.mediaTimeout,
      "sendVoice(url)"
    );
    return result.message ?? { id: "", timestamp: Date.now() };
  }
  async sendVideo(target, source, opts) {
    const resolvedTarget = attachMsgId(target, opts);
    const sourceOpts = resolveMediaSource(source);
    const result = await withTimeout(
      this.bot.sendMedia({ target: resolvedTarget, fileType: MediaFileType.VIDEO, ...sourceOpts, content: opts?.text }),
      this.mediaTimeout,
      "sendVideo"
    );
    return result.message ?? { id: "", timestamp: Date.now() };
  }
  async sendFile(target, source, opts) {
    const resolvedTarget = attachMsgId(target, opts);
    const sourceOpts = resolveMediaSource(source);
    const result = await withTimeout(
      this.bot.sendMedia({ target: resolvedTarget, fileType: MediaFileType.FILE, ...sourceOpts, fileName: opts?.fileName, content: opts?.text }),
      this.mediaTimeout,
      "sendFile"
    );
    return result.message ?? { id: "", timestamp: Date.now() };
  }
  openStream(target, msgId) {
    return this.bot.openStream({
      target: { ...target, msgId }
    });
  }
  async sendTyping(target) {
    await this.bot.sendTyping(target);
  }
  wrapBotSendForRefIndex() {
    const { accountId, appId } = this.account;
    const senderName = this.account.config.name ?? appId;
    const storeEntry = (msg, content, scope, mediaKind) => {
      const refIdx = msg.ext_info?.ref_idx;
      if (!refIdx) return;
      const finalContent = content || mediaKind ? mediaKind === "voice" ? "[\u8BED\u97F3]" : mediaKind === "image" ? "[\u56FE\u7247]" : mediaKind ? `[${mediaKind}]` : content : "";
      const entry = {
        messageId: msg.id,
        content: finalContent,
        senderId: appId,
        senderName,
        timestamp: typeof msg.timestamp === "number" ? new Date(msg.timestamp).toISOString() : msg.timestamp,
        isBot: true,
        scope
      };
      getPersistedRefIndexStore(accountId).set(refIdx, entry);
    };
    const origSendText = this.bot.sendText.bind(this.bot);
    this.bot.sendText = async (target, text, ...rest) => {
      const result = await origSendText(target, text, ...rest);
      storeEntry(result, text, target.scope);
      return result;
    };
    const origSendMedia = this.bot.sendMedia.bind(this.bot);
    this.bot.sendMedia = async (params) => {
      const result = await origSendMedia(params);
      const msg = result.message;
      if (msg) storeEntry(msg, "", params.target?.scope ?? "", params.mediaKind);
      return result;
    };
    const origOpenStream = this.bot.openStream.bind(this.bot);
    this.bot.openStream = (opts) => {
      const session = origOpenStream(opts);
      let lastContent = "";
      const origUpdate = session.update.bind(session);
      session.update = async (content) => {
        lastContent = content;
        return origUpdate(content);
      };
      const origComplete = session.complete.bind(session);
      session.complete = async () => {
        const result = await origComplete();
        if (result?.ext_info?.ref_idx) {
          getPersistedRefIndexStore(accountId).set(result.ext_info.ref_idx, {
            messageId: result.id,
            content: lastContent,
            senderId: appId,
            senderName,
            timestamp: typeof result.timestamp === "number" ? new Date(result.timestamp).toISOString() : result.timestamp,
            isBot: true,
            scope: opts.target?.scope ?? ""
          });
        }
        return result;
      };
      return session;
    };
  }
};
function attachMsgId(target, opts) {
  if (opts?.msgId) return { ...target, msgId: opts.msgId };
  const cached = getCachedMsgId(target.scope, target.targetId);
  return cached ? { ...target, msgId: cached } : target;
}
function resolveMediaSource(source) {
  if (source.startsWith("data:")) {
    const commaIdx = source.indexOf(",");
    if (commaIdx > 0) {
      return { fileData: source.slice(commaIdx + 1) };
    }
    return { fileData: source };
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return { url: source };
  }
  if (source.startsWith("file://")) {
    let p2 = source.slice("file://".length);
    if (/^\/[a-zA-Z]:[\\/]/.test(p2)) p2 = p2.slice(1);
    try {
      p2 = decodeURIComponent(p2);
    } catch {
    }
    return { localPath: p2 };
  }
  if (source === "~" || source.startsWith("~/") || source.startsWith("~\\")) {
    return { localPath: source.replace(/^~/, import_node_os3.default.homedir()) };
  }
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../") || source.startsWith(".\\") || source.startsWith("..\\") || /^[a-zA-Z]:[\\/]/.test(source) || source.startsWith("\\\\")) {
    return { localPath: source };
  }
  return { url: source };
}

// src/gateway/lifecycle.ts
init_config();
init_resolve();

// src/features/credential-backup.ts
var import_node_fs8 = __toESM(require("fs"), 1);
var import_node_path9 = __toESM(require("path"), 1);
var BACKUP_DIR = "credential-backup";
var BACKUP_FILENAME = "current.json";
var LEGACY_FILENAME = "credential-backup.json";
function getBackupPath() {
  return import_node_path9.default.join(getQQBotDataDir("data"), BACKUP_DIR, BACKUP_FILENAME);
}
function saveCredentialBackup(accountId, appId, clientSecret) {
  if (!appId || !clientSecret) return;
  try {
    const backupPath = getBackupPath();
    const dir = import_node_path9.default.dirname(backupPath);
    if (!import_node_fs8.default.existsSync(dir)) {
      import_node_fs8.default.mkdirSync(dir, { recursive: true });
    }
    const data = {
      accountId,
      appId,
      clientSecret,
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const tmpPath = backupPath + ".tmp";
    import_node_fs8.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    import_node_fs8.default.renameSync(tmpPath, backupPath);
  } catch {
  }
}
function loadCredentialBackup(accountId) {
  try {
    const backupPath = getBackupPath();
    if (import_node_fs8.default.existsSync(backupPath)) {
      const data = readBackupFile(backupPath, accountId);
      if (data) return data;
    }
    const legacyPath = import_node_path9.default.join(getQQBotDataDir("data"), LEGACY_FILENAME);
    if (import_node_fs8.default.existsSync(legacyPath)) {
      return readBackupFile(legacyPath, accountId);
    }
    return null;
  } catch {
    return null;
  }
}
function readBackupFile(filePath, accountId) {
  const raw = import_node_fs8.default.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!data.appId || !data.clientSecret) return null;
  if (accountId && data.accountId !== accountId) return null;
  return data;
}

// src/gateway/lifecycle.ts
async function startAccountWithCredentialRecovery(ctx) {
  let { account } = ctx;
  const { abortSignal, cfg } = ctx;
  const log4 = createPluginLogger({
    prefix: `[${account.accountId}]`,
    ...ctx.log?.info ? { output: ctx.log } : {}
  });
  const runtime2 = getQQBotRuntime();
  if (!account.appId || !account.clientSecret) {
    const backup = loadCredentialBackup(account.accountId);
    if (backup) {
      log4?.info(`[qqbot:${account.accountId}] \u4ECE\u6682\u5B58\u6587\u4EF6\u6062\u590D\u51ED\u8BC1 (appId=${backup.appId})`);
      try {
        const restoredCfg = applyQQBotAccountConfig(cfg, account.accountId, {
          appId: backup.appId,
          clientSecret: backup.clientSecret
        });
        const adapters = getAdapters(runtime2);
        if (adapters.persistConfig) {
          await adapters.persistConfig(() => restoredCfg);
        }
        account = resolveQQBotAccount(restoredCfg, account.accountId);
      } catch (e) {
        log4?.error(`[qqbot:${account.accountId}] \u51ED\u8BC1\u6062\u590D\u5931\u8D25: ${e}`);
      }
    }
  }
  const gw = new QQBotGateway(account, runtime2, log4);
  registerGateway(account.accountId, gw);
  await gw.start(
    {
      onReady: () => {
        saveCredentialBackup(account.accountId, account.appId, account.clientSecret);
        ctx.setStatus({
          ...ctx.getStatus(),
          running: true,
          connected: true,
          lastConnectedAt: Date.now()
        });
        initFeatures(account, cfg, log4).catch((e) => {
          log4?.error(`[qqbot:${account.accountId}] initFeatures error: ${e}`);
        });
      },
      onError: (error) => {
        log4?.error(`[qqbot:${account.accountId}] Gateway error: ${error.message}`);
        ctx.setStatus({ ...ctx.getStatus(), lastError: error.message });
      }
    },
    abortSignal
  );
}
async function initFeatures(account, cfg, log4) {
  triggerUpdateCheck(log4);
  const existing = getApprovalHandler(account.accountId);
  if (existing) {
    await existing.stop();
    unregisterApprovalHandler(account.accountId);
  }
  const approvalLog = log4.child("approval");
  try {
    const handler = new QQBotApprovalHandler({
      accountId: account.accountId,
      appId: account.appId,
      clientSecret: account.clientSecret,
      cfg,
      log: approvalLog
    });
    registerApprovalHandler(account.accountId, handler);
    await handler.start();
    approvalLog.info("registered");
  } catch (e) {
    approvalLog.debug(`not available: ${e}`);
  }
}
async function stopAccountGracefully(params) {
  const { accountId, log: log4 } = params;
  const gw = getGateway(accountId);
  if (gw) {
    try {
      await gw.stop();
      log4?.info(`[qqbot:${accountId}] gateway stopped`);
    } catch (err) {
      log4?.error(`[qqbot:${accountId}] gateway stop error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  unregisterGateway(accountId);
  try {
    const h2 = getApprovalHandler(accountId);
    if (h2) await h2.stop();
  } catch {
  }
  unregisterApprovalHandler(accountId);
}
async function logoutAndClearCredentials(params) {
  const { accountId, cfg } = params;
  unregisterGateway(accountId);
  try {
    const h2 = getApprovalHandler(accountId);
    if (h2) await h2.stop();
  } catch {
  }
  unregisterApprovalHandler(accountId);
  const nextCfg = { ...cfg };
  const nextQQBot = cfg.channels?.qqbot ? { ...cfg.channels.qqbot } : void 0;
  let cleared = false;
  let changed = false;
  if (nextQQBot) {
    const qqbot = nextQQBot;
    if (accountId === DEFAULT_ACCOUNT_ID && qqbot.clientSecret) {
      delete qqbot.clientSecret;
      cleared = true;
      changed = true;
    }
    const accounts = qqbot.accounts;
    if (accounts && accountId in accounts) {
      const entry = accounts[accountId];
      if (entry && "clientSecret" in entry) {
        delete entry.clientSecret;
        cleared = true;
        changed = true;
      }
      if (entry && Object.keys(entry).length === 0) {
        delete accounts[accountId];
        changed = true;
      }
    }
  }
  if (changed && nextQQBot) {
    nextCfg.channels = { ...nextCfg.channels, qqbot: nextQQBot };
    const runtime2 = getQQBotRuntime();
    const adapters = getAdapters(runtime2);
    if (adapters.persistConfig) {
      await adapters.persistConfig(() => nextCfg);
    }
  }
  const resolved = resolveQQBotAccount(changed ? nextCfg : cfg, accountId);
  const loggedOut = resolved.secretSource === "none";
  const envToken = Boolean(process.env.QQBOT_CLIENT_SECRET);
  return { ok: true, cleared, envToken, loggedOut };
}

// src/outbound/reply-limiter.ts
var ReplyLimiter2 = class {
  limit;
  ttlMs;
  maxTracked;
  messages = /* @__PURE__ */ new Map();
  constructor(config) {
    this.limit = config?.limit ?? 4;
    this.ttlMs = config?.ttlMs ?? 36e5;
    this.maxTracked = config?.maxTrackedMessages ?? 1e4;
  }
  /**
   * 检查是否允许对指定消息继续被动回复
   */
  checkLimit(messageId) {
    const now = Date.now();
    const tracked = this.messages.get(messageId);
    if (!tracked) {
      return { allowed: true, remaining: this.limit, shouldFallbackToProactive: false };
    }
    if (now - tracked.firstSeenAt > this.ttlMs) {
      this.messages.delete(messageId);
      return {
        allowed: false,
        remaining: 0,
        shouldFallbackToProactive: true,
        fallbackReason: "expired"
      };
    }
    const remaining = Math.max(0, this.limit - tracked.count);
    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        shouldFallbackToProactive: true,
        fallbackReason: "limit_exceeded"
      };
    }
    return { allowed: true, remaining, shouldFallbackToProactive: false };
  }
  /**
   * 记录一次被动回复
   */
  record(messageId) {
    const now = Date.now();
    const tracked = this.messages.get(messageId);
    if (tracked) {
      tracked.count++;
    } else {
      if (this.messages.size >= this.maxTracked) {
        const firstKey = this.messages.keys().next().value;
        if (firstKey) this.messages.delete(firstKey);
      }
      this.messages.set(messageId, { count: 1, firstSeenAt: now });
    }
  }
  /**
   * 获取统计信息
   */
  getStats() {
    let totalReplies = 0;
    for (const [, v] of this.messages) {
      totalReplies += v.count;
    }
    return { trackedMessages: this.messages.size, totalReplies };
  }
  /**
   * 清除所有跟踪数据
   */
  clear() {
    this.messages.clear();
  }
};

// src/outbound/outbound-service.ts
var gateways = /* @__PURE__ */ new Map();
var limiters = /* @__PURE__ */ new Map();
function getLimiter(accountId) {
  let l3 = limiters.get(accountId);
  if (!l3) {
    l3 = new ReplyLimiter2();
    limiters.set(accountId, l3);
  }
  return l3;
}
function resolveMsgId(replyToId, accountId) {
  if (!replyToId) return void 0;
  const limiter = getLimiter(accountId);
  const result = limiter.checkLimit(replyToId);
  if (!result.allowed) return void 0;
  limiter.record(replyToId);
  return replyToId;
}
function registerGateway(accountId, gw) {
  gateways.set(accountId, gw);
}
function unregisterGateway(accountId) {
  gateways.delete(accountId);
  limiters.delete(accountId);
}
function getGateway(accountId) {
  return gateways.get(accountId);
}
function getOrCreateGateway(account) {
  let gw = gateways.get(account.accountId);
  if (!gw) {
    gw = new QQBotGateway(account);
    gateways.set(account.accountId, gw);
  }
  return gw;
}
var MEDIA_KIND_TO_FILE_TYPE = {
  image: MediaFileType.IMAGE,
  voice: MediaFileType.VOICE,
  video: MediaFileType.VIDEO,
  file: MediaFileType.FILE
};
/* QQ-GROUP-SILENT-PATCH v2 */
function __qqGroupSilentText(text) {
  const t = __qqSilentReplyCanonicalText(text);
  if (!t) return true;
  if (__qqIsStandaloneSilentReply(text)) return true;
  if (/^[\s\p{P}\p{S}]+$/u.test(t) && !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(t) && !__qqHasPlainEmoticon(t)) return true;
  return false;
}
async function sendText(params) {
  const accountId = params.account.accountId;
  const gw = getOrCreateGateway(params.account);
  try {
    const target = parseTarget2(params.to);
    if (target.scope === "group") { /* QQ-MEDIA-TAG-PATCH v1 leak guard */
      const __g = __qqMtLeakGuard(params.text);
      if (__g !== params.text) { console.log(`[qqbot] [qq-media-tag] leak guard stripped tags len=${String(params.text ?? "").length}->${__g.length}`); params = { ...params, text: __g }; }
    }
    if (target.scope === "group" && __qqGroupSilentText(params.text)) {
      console.log(`[qqbot] [silent-patch] dropped group standby/NO_REPLY text to=${target.targetId} len=${String(params.text ?? "").length} preview=${JSON.stringify(String(params.text ?? "").slice(0, 30))}`);
      return { messageId: void 0, suppressed: true };
    }
    const msgId = resolveMsgId(params.replyToId, accountId);
    const result = await gw.sendText(target, params.text, { msgId });
    return { messageId: result.id };
  } catch (err) {
    return formatError(err);
  }
}
async function sendMedia2(params) {
  const accountId = params.account.accountId;
  const gw = getOrCreateGateway(params.account);
  try {
    const target = parseTarget2(params.to);
    const kind = params.mediaKind ?? "image";
    const msgId = resolveMsgId(params.replyToId, accountId);
    if (kind === "voice") {
      const source = resolveVoiceSource2(params.mediaUrl);
      const result2 = await gw.sendVoice(target, source, { text: params.text, msgId });
      return { messageId: result2.id };
    }
    if (kind === "video") {
      const result2 = await gw.sendVideo(target, params.mediaUrl, { text: params.text, msgId });
      return { messageId: result2.id };
    }
    if (kind === "file") {
      const result2 = await gw.sendFile(target, params.mediaUrl, { text: params.text, msgId });
      return { messageId: result2.id };
    }
    const fileType = MEDIA_KIND_TO_FILE_TYPE[kind];
    const result = await gw.sendMedia(target, params.mediaUrl, { text: params.text, msgId, fileType });
    return { messageId: result.id };
  } catch (err) {
    return formatError(err);
  }
}
function resolveVoiceSource2(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) return { url: source };
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) return { localPath: source };
  if (source.startsWith("data:")) {
    const i = source.indexOf(",");
    return { base64: i > 0 ? source.slice(i + 1) : source };
  }
  return { base64: source };
}
function formatError(err) {
  if (err instanceof Error) {
    const result = { error: err.message };
    if (err.sendState === "uncertain" || err.sendState === "not-sent") result.sendState = err.sendState;
    if ("code" in err) result.errorCode = String(err.code);
    if ("qqBizCode" in err) result.qqBizCode = err.qqBizCode;
    return result;
  }
  return { error: String(err) };
}

// src/bot-instance.ts
var PLUGIN_VERSION4 = getPackageVersion();
var _openclawVersion = "unknown";
function setOpenClawVersion(version) {
  if (version) _openclawVersion = version;
}
function getOpenClawVersion() {
  return _openclawVersion;
}
function buildUserAgent(suffix) {
  const base = `QQBotPlugin/${PLUGIN_VERSION4} (Node/${process.versions.node}; ${import_node_os4.default.platform()}; OpenClaw/${_openclawVersion})`;
  return suffix ? `${base} ${suffix}` : base;
}
function getBotForAccount(accountId) {
  const gw = getGateway(accountId);
  if (!gw) {
    throw new Error(`[qqbot] Bot "${accountId}" not running \u2014 gateway not started`);
  }
  return gw.bot;
}
function tryGetBotForAccount(accountId) {
  const gw = getGateway(accountId);
  return gw?.bot ?? null;
}

// src/runtime.ts
var runtime = null;
var exitHooksInstalled = false;
function setQQBotRuntime(next) {
  runtime = next;
  const version = getOpenclawVersion(next.version);
  setOpenClawVersion(version);
  installExitHooksOnce();
}
function installExitHooksOnce() {
  if (exitHooksInstalled) return;
  exitHooksInstalled = true;
  const flush = () => {
    try {
      flushAllRefIndexStores();
    } catch {
    }
  };
  process.on("beforeExit", flush);
  process.on("SIGINT", () => {
    flush();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    flush();
    process.exit(0);
  });
}
function getQQBotRuntime() {
  if (!runtime) throw new Error("QQBot runtime not initialized");
  return runtime;
}
function tryGetQQBotRuntime() {
  return runtime;
}

// src/channel.ts
init_resolve();

// src/setup/surface.ts
init_setup();
init_config();
init_finalize();
var CHANNEL = "qqbot";
var qqbotSetupWizard = {
  channel: CHANNEL,
  status: createStandardChannelSetupStatus({
    channelLabel: "QQ Bot",
    configuredLabel: "configured",
    unconfiguredLabel: "needs AppID + AppSecret",
    configuredHint: "configured",
    unconfiguredHint: "needs AppID + AppSecret",
    configuredScore: 1,
    unconfiguredScore: 6,
    resolveConfigured: ({ cfg, accountId }) => (accountId ? [accountId] : listQQBotAccountIds(cfg)).some((id) => {
      const account = resolveQQBotAccount(cfg, id);
      return Boolean(account.appId && account.clientSecret);
    })
  }),
  // 未配置时默认使用 default 账号，有账户时框架会提示选择
  resolveAccountIdForConfigure: async ({ cfg, shouldPromptAccountIds, accountOverride, defaultAccountId }) => {
    if (accountOverride) return accountOverride;
    const ids = listQQBotAccountIds(cfg);
    if (ids.length === 0) return "default";
    if (!shouldPromptAccountIds) return ids[0];
    return defaultAccountId || resolveDefaultQQBotAccountId(cfg);
  },
  credentials: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalize: (async ({ cfg, accountId, prompter, runtime: runtime2 }) => finalizeQQBotSetup({ cfg, accountId, prompter, runtime: runtime2 })),
  disable: (cfg) => {
    setSetupChannelEnabled(cfg, CHANNEL, false);
    return cfg;
  }
};

// src/setup/login.ts
init_esm();
var pendingSessions = /* @__PURE__ */ new Map();
function startQrLogin(accountId, source = "openclaw") {
  const key = accountId ?? "default";
  pendingSessions.get(key)?.dispose();
  pendingSessions.delete(key);
  return new Promise((resolve2) => {
    let credentialsResolve;
    let credentialsReject;
    const credentialsPromise = new Promise((res, rej) => {
      credentialsResolve = res;
      credentialsReject = rej;
    });
    const dispose = l2(
      {
        onQrDisplayed(url) {
          resolve2({
            qrDataUrl: url,
            message: "\u8BF7\u4F7F\u7528\u624B\u673A QQ \u626B\u63CF\u4E8C\u7EF4\u7801\u5B8C\u6210\u7ED1\u5B9A"
          });
        },
        onSuccess: (creds) => credentialsResolve(creds),
        onFailure: (err) => credentialsReject(err)
      },
      { displayQrCodeToConsole: true, source }
    );
    pendingSessions.set(key, { dispose, credentialsPromise });
  });
}
async function waitQrLogin(accountId) {
  const key = accountId ?? "default";
  const session = pendingSessions.get(key);
  if (!session) {
    return { connected: false, message: "\u6CA1\u6709\u6B63\u5728\u8FDB\u884C\u7684\u767B\u5F55\u4F1A\u8BDD\uFF0C\u8BF7\u5148\u8FD0\u884C login \u547D\u4EE4\u3002" };
  }
  try {
    const credentials = await session.credentialsPromise;
    pendingSessions.delete(key);
    if (credentials.length === 0) {
      return { connected: false, message: "\u672A\u83B7\u53D6\u5230 QQ Bot \u51ED\u636E\u3002" };
    }
    return {
      connected: true,
      message: `\u7ED1\u5B9A\u6210\u529F\uFF01AppID: ${credentials.map((c) => c.appId).join(", ")}`,
      credentials
    };
  } catch (err) {
    pendingSessions.delete(key);
    return {
      connected: false,
      message: `\u7ED1\u5B9A\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
function parseChannelInput(channelInput) {
  if (!channelInput) return null;
  const parts = channelInput.trim().split(":");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { appId: parts[0], clientSecret: parts[1] };
  }
  return null;
}
async function qqbotLogin({
  cfg,
  accountId,
  channelInput,
  verbose,
  ...rest
}) {
  const { applyQQBotAccountConfig: applyQQBotAccountConfig2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  const { persistAuthConfig: persistAuthConfig2 } = await Promise.resolve().then(() => (init_resolve(), resolve_exports));
  const { applyAccountDefaults: applyAccountDefaults2 } = await Promise.resolve().then(() => (init_finalize(), finalize_exports));
  const { resolveAccountKey: resolveAccountKey2 } = await Promise.resolve().then(() => (init_account_key(), account_key_exports));
  const runtime2 = rest;
  const resolvedId = accountId ? accountId.trim().toLowerCase() : null;
  const parsed = parseChannelInput(channelInput);
  if (parsed) {
    const key = resolveAccountKey2(cfg, parsed.appId, resolvedId);
    const result2 = applyQQBotAccountConfig2(cfg, key, {
      appId: parsed.appId,
      clientSecret: parsed.clientSecret
    });
    Object.assign(cfg, result2);
    const withDefaults = applyAccountDefaults2(cfg, key);
    Object.assign(cfg, withDefaults);
    await persistAuthConfig2(runtime2, cfg, "restart");
    if (verbose) console.log(`QQ Bot \u5DF2\u914D\u7F6E (${key}) AppID: ${parsed.appId}`);
    return;
  }
  const { qrDataUrl, message } = await startQrLogin(resolvedId || "pending");
  console.log(`
${message}`);
  if (qrDataUrl) console.log(`QR \u94FE\u63A5: ${qrDataUrl}`);
  const result = await waitQrLogin(resolvedId || "pending");
  if (!result.connected || !result.credentials) {
    throw new Error(result.message);
  }
  for (const cred of result.credentials) {
    const key = resolveAccountKey2(cfg, cred.appId, resolvedId);
    const next = applyQQBotAccountConfig2(cfg, key, {
      appId: cred.appId,
      clientSecret: cred.appSecret
    });
    Object.assign(cfg, next);
    const withDefaults = applyAccountDefaults2(cfg, key, cred.userOpenid);
    Object.assign(cfg, withDefaults);
  }
  await persistAuthConfig2(runtime2, cfg, "restart");
  console.log(`QQ Bot \u767B\u5F55\u6210\u529F\uFF01`);
}

// src/outbound/sanitize.ts
var INTERNAL_TAGS = [
  // 框架脚手架标签
  /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi,
  /<previous_response\b[^>]*>[\s\S]*?<\/previous_response>/gi,
  /<\s*\/?\s*(?:system-reminder|previous_response)\b[^>]*\/?\s*>/gi,
  // 模型推理/思考内容
  // deepseek: `think`...`/think` — 匹配完整标签块，标签名 think 必须完整
  // 格式说明：deepseek 用 `` ` `` (反引号) 替代 XML 的 `<` `>` 作为标签定界符
  //   `think`  ≡ <think>  开标签
  //   `/think` ≡ </think> 闭标签
  /`think`[\s\S]*?`\/think`/gi,
  /<\s*\/?\s*think\b[^>]*\/?\s*>/gi,
  // claude: <thinking>...</thinking>
  /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi,
  /<\s*\/?\s*thinking\b[^>]*\/?\s*>/gi
];
function sanitizeQQBotText(text) {
  let result = text;
  for (const re of INTERNAL_TAGS) {
    result = result.replace(re, "");
  }
  return result.trim();
}

// src/features/approval-utils.ts
function isApprovalPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const p2 = payload;
  const cd = p2.channelData;
  if (cd && typeof cd === "object" && !Array.isArray(cd)) {
    const execApproval = cd.execApproval;
    if (execApproval && typeof execApproval === "object" && !Array.isArray(execApproval)) {
      return true;
    }
  }
  const text = typeof p2.text === "string" ? p2.text : "";
  return /(?:Plugin|Exec) approval (?:required|allowed|denied|expired)/i.test(text);
}
var approvalStubs = {
  execApprovals: {
    getInitiatingSurfaceState: () => ({ kind: "enabled" }),
    shouldSuppressForwardingFallback: () => true,
    shouldSuppressLocalPrompt: ({ payload }) => isApprovalPayload(payload),
    buildPendingPayload: () => null,
    buildResolvedPayload: () => null
  },
  approvals: {
    delivery: {
      hasConfiguredDmRoute: () => true,
      shouldSuppressForwardingFallback: () => true
    },
    render: {
      exec: { buildPendingPayload: () => null, buildResolvedPayload: () => null },
      plugin: { buildPendingPayload: () => null, buildResolvedPayload: () => null }
    }
  }
};

// src/features/onboarding.ts
init_config();
var qqbotOnboardingAdapter = {
  getStatus: (ctx) => {
    const cfg = ctx.config;
    const accountIds = listQQBotAccountIds(cfg);
    if (accountIds.length === 0) {
      return { configured: false, accountCount: 0 };
    }
    const firstAccount = resolveQQBotAccount(cfg, accountIds[0]);
    return {
      configured: Boolean(firstAccount.appId && firstAccount.clientSecret),
      accountCount: accountIds.length,
      defaultAccountId: accountIds[0]
    };
  },
  configure: async (ctx) => {
    return { success: false, message: "Onboarding not yet migrated to new architecture" };
  }
};

// src/channel.ts
var TEXT_CHUNK_LIMIT2 = 5e3;
var GFM_TABLE_DATA_RE = /^\|.+\|.*\|/;
var GFM_TABLE_SEP_RE = /^\|[\s:-]+\|/;
function isGfmTableLine(line) {
  return GFM_TABLE_DATA_RE.test(line) || GFM_TABLE_SEP_RE.test(line);
}
var qqbotPlugin = {
  id: "qqbot",
  meta: {
    id: "qqbot",
    label: "QQ Bot",
    selectionLabel: "QQ Bot",
    docsPath: "/docs/channels/qqbot",
    blurb: "Connect to QQ via official QQ Bot API",
    order: 50
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    blockStreaming: true
  },
  gatewayMethods: ["web.login.start", "web.login.wait"],
  reload: { configPrefixes: ["channels.qqbot"] },
  // ── 群消息策略 ──
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      if (!groupId) return void 0;
      return resolveRequireMention(cfg, groupId, accountId ?? void 0);
    },
    resolveToolPolicy: ({ cfg, accountId, groupId }) => {
      if (!groupId) return void 0;
      const policy = resolveToolPolicy(cfg, groupId, accountId ?? void 0);
      if (policy === "full") return void 0;
      if (policy === "none") return { allow: [], deny: ["*"] };
      return { allow: [] };
    },
    resolveGroupIntroHint: ({ cfg, accountId, groupId }) => {
      if (!groupId) return void 0;
      const groupCfg = resolveGroupConfig(cfg, groupId, accountId ?? void 0);
      return groupCfg.name ? `\u5F53\u524D\u7FA4: ${groupCfg.name}` : void 0;
    }
  },
  // ── @mention 检测与清理 ──
  mentions: {
    stripMentions: ({ text, ctx }) => {
      const mentions = ctx?.mentions;
      return stripMentionText(text, mentions);
    }
  },
  // @ts-ignore onboarding 兼容
  onboarding: qqbotOnboardingAdapter,
  // ── 配置管理 ──
  config: {
    listAccountIds: (cfg) => listQQBotAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveQQBotAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultQQBotAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => (0, import_core.setAccountEnabledInConfigSection)({ cfg, sectionKey: "qqbot", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }) => (0, import_core.deleteAccountFromConfigSection)({
      cfg,
      sectionKey: "qqbot",
      accountId,
      clearBaseFields: ["appId", "clientSecret", "clientSecretFile", "name"]
    }),
    isConfigured: (account) => {
      if (account?.appId && account?.clientSecret) return true;
      return loadCredentialBackup(account?.accountId) !== null;
    },
    describeAccount: (account) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.appId && account?.clientSecret),
      tokenSource: account?.secretSource
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveQQBotAccount(cfg, accountId ?? void 0);
      return (account.config?.allowFrom ?? []).map((e) => String(e));
    },
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((e) => String(e).trim()).filter(Boolean).map((e) => e.replace(/^qqbot:/i, "").toUpperCase())
  },
  // ── Setup ──
  setup: {
    resolveAccountId: ({ accountId }) => accountId?.trim().toLowerCase() || DEFAULT_ACCOUNT_ID,
    applyAccountName: ({ cfg, accountId, name }) => (0, import_core.applyAccountNameToChannelSection)({ cfg, channelKey: "qqbot", accountId, name }),
    validateInput: ({ input }) => {
      if (!input.token && !input.tokenFile && !input.useEnv) {
        return "QQBot requires --token (format: appId:clientSecret) or --use-env";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      let appId = "";
      let clientSecret = "";
      if (input.token) {
        const parts = input.token.split(":");
        if (parts.length === 2) {
          appId = parts[0];
          clientSecret = parts[1];
        }
      }
      return applyQQBotAccountConfig(cfg, accountId, {
        appId,
        clientSecret,
        clientSecretFile: input.tokenFile,
        name: input.name
      });
    }
  },
  setupWizard: qqbotSetupWizard,
  // ── Messaging ──
  messaging: {
    normalizeTarget: normalizeTarget2,
    targetResolver: {
      looksLikeId: isQQBotTarget,
      hint: "QQ Bot \u76EE\u6807\u683C\u5F0F: qqbot:c2c:openid (\u79C1\u804A) \u6216 qqbot:group:groupid (\u7FA4\u804A)"
    }
  },
  // ── 出站 ──
  outbound: {
    deliveryMode: "direct",
    sanitizeText: ({ text }) => sanitizeQQBotText(text),
    chunker: (text, limit) => {
      const adapters = getAdapters(getQQBotRuntime());
      if (adapters.chunkMarkdownText) return adapters.chunkMarkdownText(text, limit);
      const lines = text.split("\n");
      const chunks = [];
      let current = "";
      let tableBuffer = [];
      const flushTable = () => {
        if (tableBuffer.length === 0) return;
        const tableBlock = tableBuffer.join("\n");
        const candidate = current ? `${current}
${tableBlock}` : tableBlock;
        if (candidate.length > limit && current) {
          chunks.push(current);
          current = tableBlock;
        } else {
          current = candidate;
        }
        tableBuffer = [];
      };
      for (const line of lines) {
        if (isGfmTableLine(line)) {
          tableBuffer.push(line);
          continue;
        }
        flushTable();
        const candidate = current ? `${current}
${line}` : line;
        if (candidate.length > limit && current) {
          chunks.push(current);
          current = line;
        } else {
          current = candidate;
        }
      }
      flushTable();
      if (current) chunks.push(current);
      return chunks.length > 0 ? chunks : [text];
    },
    chunkerMode: "markdown",
    textChunkLimit: TEXT_CHUNK_LIMIT2,
    shouldSuppressLocalPayloadPrompt: ({ payload }) => isApprovalPayload(payload),
    sendText: async ({ to, text, accountId, replyToId, cfg }) => {
      const account = resolveQQBotAccount(cfg, accountId ?? void 0);
      const outLog = createOutLog(account.accountId);
      outLog.debug(`sendText to=${to} len=${text.length} replyTo=${replyToId ?? "-"}`);
      const result = await sendText({ to, text, accountId, replyToId, account });
      if (result.error) throw new Error(result.error);
      return { channel: "qqbot", messageId: result.messageId ?? "" };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId, cfg }) => {
      const resolvedAccountId = accountId ?? resolveDefaultQQBotAccountId(cfg);
      const outLog = createOutLog(resolvedAccountId);
      outLog.debug(`sendMedia to=${to} url=${mediaUrl?.slice(0, 80)} len=${text?.length ?? 0} replyTo=${replyToId ?? "-"}`);
      const result = await sendMedia({
        to,
        source: mediaUrl ?? "",
        text,
        replyToId,
        accountId: resolvedAccountId,
        log: outLog,
        agentId: resolveMCPAgentId(to, resolvedAccountId, cfg, outLog)
      });
      if (result.error) {
        outLog.error(`sendMedia failed: ${result.error}`);
        throw new Error(result.error);
      }
      return { channel: "qqbot", messageId: result.messageId ?? "" };
    }
  },
  // ── 网关 ──
  gateway: {
    startAccount: (ctx) => startAccountWithCredentialRecovery(ctx),
    stopAccount: async (ctx) => {
      await stopAccountGracefully({
        accountId: ctx.accountId,
        log: ctx.log
      });
    },
    logoutAccount: (params) => logoutAndClearCredentials(params),
    loginWithQrStart: async ({ accountId }) => startQrLogin(accountId),
    loginWithQrWait: async ({ accountId }) => {
      const result = await waitQrLogin(accountId);
      return { connected: result.connected, message: result.message };
    }
  },
  // ── 登录认证 ──
  auth: {
    login: qqbotLogin,
    // 审批权限（从 approvalStubs 迁移）
    authorizeActorAction: () => ({ authorized: true }),
    getActionAvailabilityState: () => ({ kind: "enabled" })
  },
  // ── 状态 ──
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastConnectedAt: snapshot.lastConnectedAt ?? null,
      lastError: snapshot.lastError ?? null
    }),
    buildAccountSnapshot: ({ account, runtime: runtime2 }) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.appId && account?.clientSecret),
      tokenSource: account?.secretSource,
      running: Boolean(runtime2?.running ?? false),
      connected: Boolean(runtime2?.connected ?? false),
      lastConnectedAt: runtime2?.lastConnectedAt ?? null,
      lastError: runtime2?.lastError ?? null,
      lastInboundAt: runtime2?.lastInboundAt ?? null,
      lastOutboundAt: runtime2?.lastOutboundAt ?? null
    })
  },
  // ── 审批（stub — 实际由 features/approval-handler 处理）──
  ...approvalStubs
};
function resolveMCPAgentId(to, accountId, cfg, log4) {
  try {
    const parts = to.split(":");
    const scope = parts[1];
    const peerId = parts[2];
    if (!scope || !peerId) return void 0;
    const rt = tryGetQQBotRuntime();
    if (!rt) return void 0;
    const route = getAdapters(rt).resolveAgentRoute?.({
      cfg,
      channel: "qqbot",
      accountId,
      peer: { kind: scope === "group" ? "group" : "direct", id: peerId }
    });
    log4?.debug(`resolveMCPAgentId to=${to} => agentId=${route?.agentId ?? "none"}`);
    return route?.agentId;
  } catch {
    return void 0;
  }
}
function createOutLog(accountId) {
  const gwLog = getGateway(accountId)?.log;
  if (gwLog) return gwLog.child("outbound");
  return createPluginLogger({ forceConsole: true, prefix: `[${accountId}]` }).child("outbound");
}

// src/tools/platform.ts
init_config();
var PlatformApiSchema = {
  type: "object",
  properties: {
    method: {
      type: "string",
      description: "HTTP \u8BF7\u6C42\u65B9\u6CD5\u3002\u53EF\u9009\u503C\uFF1AGET, POST, PUT, PATCH, DELETE",
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    },
    path: {
      type: "string",
      description: "API \u8DEF\u5F84\uFF08\u4E0D\u542B\u57DF\u540D\uFF09\uFF0C\u5360\u4F4D\u7B26\u9700\u66FF\u6362\u4E3A\u5B9E\u9645\u503C\u3002\u793A\u4F8B\uFF1A/users/@me/guilds, /guilds/{guild_id}/channels, /v2/groups/{group_id}/bot_state"
    },
    body: {
      type: "object",
      description: "\u8BF7\u6C42\u4F53\uFF08JSON\uFF09\uFF0C\u7528\u4E8E POST/PUT/PATCH \u8BF7\u6C42\u3002GET/DELETE \u8BF7\u6C42\u4E0D\u9700\u8981\u6B64\u53C2\u6570\u3002"
    },
    query: {
      type: "object",
      description: 'URL \u67E5\u8BE2\u53C2\u6570\uFF08\u952E\u503C\u5BF9\uFF09\uFF0C\u4F1A\u62FC\u63A5\u5230\u8DEF\u5F84\u540E\u9762\u3002\u5982 { "limit": "100", "after": "0" } \u4F1A\u62FC\u63A5\u4E3A ?limit=100&after=0',
      additionalProperties: { type: "string" }
    }
  },
  required: ["method", "path"]
};
function json(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data
  };
}
function validatePath(path22) {
  if (!path22.startsWith("/")) return "path \u5FC5\u987B\u4EE5 / \u5F00\u5934";
  if (path22.includes("..") || path22.includes("//")) return "path \u4E0D\u5141\u8BB8\u5305\u542B .. \u6216 //";
  if (!/^\/[a-zA-Z0-9\-._~:@!$&'()*+,;=/%]+$/.test(path22) && path22 !== "/") {
    return "path \u5305\u542B\u975E\u6CD5\u5B57\u7B26";
  }
  return null;
}
function registerPlatformTool(api) {
  const cfg = api.config;
  if (!cfg) return;
  const accountIds = listQQBotAccountIds(cfg);
  if (accountIds.length === 0) return;
  api.registerTool(
    {
      name: "qqbot_platform_api",
      label: "QQBot Platform API Gateway",
      description: "QQ \u5F00\u653E\u5E73\u53F0\u7EDF\u4E00 HTTP API \u7F51\u5173\uFF0C\u81EA\u52A8\u586B\u5145\u9274\u6743 Token\u3002\u5E38\u7528\u63A5\u53E3\u901F\u67E5\uFF1A\u3010\u9891\u9053\u3011GET /users/@me/guilds | /guilds/{guild_id}/channels | /channels/{channel_id} | \u3010\u7FA4\u3011GET /v2/groups/{group_id}/bot_state | /v2/groups/{group_id}/members/{member_id} | /v2/groups/{group_id}/info\u3002\u66F4\u591A\u63A5\u53E3\u548C\u53C2\u6570\u8BE6\u60C5\u8BF7\u9605\u8BFB qqbot-channel \u548C qqbot-group skill\u3002",
      parameters: PlatformApiSchema,
      async execute(_toolCallId, params) {
        const p2 = params;
        if (!p2.method) return json({ error: "method \u4E3A\u5FC5\u586B\u53C2\u6570" });
        if (!p2.path) return json({ error: "path \u4E3A\u5FC5\u586B\u53C2\u6570" });
        const method = p2.method.toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          return json({ error: `\u4E0D\u652F\u6301\u7684 HTTP \u65B9\u6CD5: ${method}` });
        }
        const pathError = validatePath(p2.path);
        if (pathError) return json({ error: pathError });
        const accountId = getRequestAccountId();
        if (!accountId) {
          return json({ error: "\u65E0\u6CD5\u83B7\u53D6\u5F53\u524D\u8BF7\u6C42\u7684\u8D26\u53F7\u4FE1\u606F\uFF0C\u6B64\u5DE5\u5177\u4EC5\u652F\u6301\u5728\u6D88\u606F\u4F1A\u8BDD\u4E2D\u4F7F\u7528" });
        }
        try {
          const bot = getBotForAccount(accountId);
          const apiGateway = bot.api;
          let data;
          switch (method) {
            case "GET":
              data = await apiGateway.get(p2.path, p2.query);
              break;
            case "POST":
              data = await apiGateway.post(p2.path, p2.body);
              break;
            case "PUT":
              data = await apiGateway.put(p2.path, p2.body);
              break;
            case "PATCH":
              data = await apiGateway.patch(p2.path, p2.body);
              break;
            case "DELETE":
              data = await apiGateway.delete(p2.path);
              break;
          }
          return json(data);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const apiErr = err;
          return json({
            error: errMsg,
            status: apiErr.httpStatus,
            code: apiErr.bizCode,
            path: p2.path
          });
        }
      }
    },
    { name: "qqbot_platform_api" }
  );
}

// src/tools/remind.ts
var RemindSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      description: "\u64CD\u4F5C\u7C7B\u578B\u3002add=\u521B\u5EFA\u63D0\u9192, list=\u67E5\u770B\u5DF2\u6709\u63D0\u9192, remove=\u5220\u9664\u63D0\u9192",
      enum: ["add", "list", "remove"]
    },
    content: {
      type: "string",
      description: '\u63D0\u9192\u5185\u5BB9\uFF0C\u5982"\u559D\u6C34"\u3001"\u5F00\u4F1A"\u3002action=add \u65F6\u5FC5\u586B\u3002'
    },
    to: {
      type: "string",
      description: "\u6295\u9012\u76EE\u6807\u5730\u5740\uFF08\u53EF\u9009\uFF09\u3002\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u4ECE\u5F53\u524D\u4F1A\u8BDD\u83B7\u53D6\uFF0C\u901A\u5E38\u65E0\u9700\u624B\u52A8\u586B\u5199\u3002\u79C1\u804A\u683C\u5F0F\uFF1Aqqbot:c2c:user_openid\uFF0C\u7FA4\u804A\u683C\u5F0F\uFF1Aqqbot:group:group_openid\u3002"
    },
    time: {
      type: "string",
      description: '\u65F6\u95F4\u63CF\u8FF0\u3002\u652F\u6301\u4E24\u79CD\u683C\u5F0F\uFF1A\n1. \u76F8\u5BF9\u65F6\u95F4\uFF1A\u5982 "5m"(5\u5206\u949F\u540E)\u3001"1h"(1\u5C0F\u65F6\u540E)\u3001"1h30m"(1.5\u5C0F\u65F6\u540E)\u3001"2d"(2\u5929\u540E)\n2. cron \u8868\u8FBE\u5F0F\uFF1A\u5982 "0 8 * * *"(\u6BCF\u59298\u70B9)\u3001"0 9 * * 1-5"(\u5DE5\u4F5C\u65E59\u70B9)\n\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u5224\u65AD\uFF1A\u5305\u542B\u7A7A\u683C\u7684\u89C6\u4E3A cron \u8868\u8FBE\u5F0F\uFF08\u5468\u671F\u63D0\u9192\uFF09\uFF0C\u5426\u5219\u89C6\u4E3A\u76F8\u5BF9\u65F6\u95F4\uFF08\u4E00\u6B21\u6027\u63D0\u9192\uFF09\u3002\naction=add \u65F6\u5FC5\u586B\u3002'
    },
    timezone: {
      type: "string",
      description: '\u65F6\u533A\uFF0C\u4EC5\u5468\u671F\u63D0\u9192(cron)\u65F6\u9700\u8981\u3002\u9ED8\u8BA4 "Asia/Shanghai"\u3002'
    },
    name: {
      type: "string",
      description: "\u63D0\u9192\u4EFB\u52A1\u540D\u79F0\uFF08\u53EF\u9009\uFF09\u3002\u9ED8\u8BA4\u81EA\u52A8\u4ECE content \u622A\u53D6\u524D 20 \u5B57\u3002"
    },
    jobId: {
      type: "string",
      description: "\u8981\u5220\u9664\u7684\u4EFB\u52A1 ID\u3002action=remove \u65F6\u5FC5\u586B\uFF0C\u5148\u7528 list \u83B7\u53D6\u3002"
    }
  },
  required: ["action"]
};
function json2(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data
  };
}
function parseRelativeTime(timeStr) {
  const s = timeStr.trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10) * 6e4;
  }
  let totalMs = 0;
  let matched = false;
  const regex = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/g;
  let match;
  while ((match = regex.exec(s)) !== null) {
    matched = true;
    const value = parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d":
        totalMs += value * 864e5;
        break;
      case "h":
        totalMs += value * 36e5;
        break;
      case "m":
        totalMs += value * 6e4;
        break;
      case "s":
        totalMs += value * 1e3;
        break;
    }
  }
  return matched ? Math.round(totalMs) : null;
}
function isCronExpression(timeStr) {
  const parts = timeStr.trim().split(/\s+/);
  return parts.length >= 3 && parts.length <= 6;
}
function generateJobName(content) {
  const trimmed = content.trim();
  const short = trimmed.length > 20 ? trimmed.slice(0, 20) + "\u2026" : trimmed;
  return `\u63D0\u9192: ${short}`;
}
function buildOnceJob(params, delayMs, to, accountId) {
  const atMs = Date.now() + delayMs;
  const content = params.content;
  const name = params.name || generateJobName(content);
  return {
    action: "add",
    job: {
      name,
      schedule: { kind: "at", atMs },
      sessionTarget: "isolated",
      wakeMode: "now",
      deleteAfterRun: true,
      payload: {
        kind: "agentTurn",
        message: buildReminderPrompt(content)
      },
      delivery: {
        mode: "announce",
        channel: "qqbot",
        to,
        accountId
      }
    }
  };
}
function buildCronJob(params, to, accountId) {
  const content = params.content;
  const name = params.name || generateJobName(content);
  const tz = params.timezone || "Asia/Shanghai";
  return {
    action: "add",
    job: {
      name,
      schedule: { kind: "cron", expr: params.time.trim(), tz },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: buildReminderPrompt(content)
      },
      delivery: {
        mode: "announce",
        channel: "qqbot",
        to,
        accountId
      }
    }
  };
}
function buildReminderPrompt(content) {
  return `\u4F60\u662F\u4E00\u4E2A\u6696\u5FC3\u7684\u63D0\u9192\u52A9\u624B\u3002\u8BF7\u7528\u6E29\u6696\u3001\u6709\u8DA3\u7684\u65B9\u5F0F\u63D0\u9192\u7528\u6237\uFF1A${content}\u3002\u8981\u6C42\uFF1A(1) \u4E0D\u8981\u56DE\u590DHEARTBEAT_OK (2) \u4E0D\u8981\u89E3\u91CA\u4F60\u662F\u8C01 (3) \u76F4\u63A5\u8F93\u51FA\u4E00\u6761\u6696\u5FC3\u7684\u63D0\u9192\u6D88\u606F (4) \u53EF\u4EE5\u52A0\u4E00\u53E5\u7B80\u77ED\u7684\u9E21\u6C64\u6216\u5173\u6000\u7684\u8BDD (5) \u63A7\u5236\u57282-3\u53E5\u8BDD\u4EE5\u5185 (6) \u7528emoji\u70B9\u7F00`;
}
function formatDelay(ms) {
  const totalSeconds = Math.round(ms / 1e3);
  if (totalSeconds < 60) return `${totalSeconds}\u79D2`;
  const totalMinutes = Math.round(ms / 6e4);
  if (totalMinutes < 60) return `${totalMinutes}\u5206\u949F`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}\u5C0F\u65F6`;
  return `${hours}\u5C0F\u65F6${minutes}\u5206\u949F`;
}
function registerRemindTool(api) {
  api.registerTool(
    {
      name: "qqbot_remind",
      label: "QQBot \u5B9A\u65F6\u63D0\u9192",
      description: '\u521B\u5EFA\u3001\u67E5\u8BE2\u3001\u5220\u9664 QQ \u5B9A\u65F6\u63D0\u9192\u3002\u4F7F\u7528\u7B80\u5355\u53C2\u6570\u5373\u53EF\uFF0C\u65E0\u9700\u624B\u52A8\u6784\u9020 cron JSON\u3002\n\u521B\u5EFA\u63D0\u9192\uFF1Aaction=add, content=\u63D0\u9192\u5185\u5BB9, to=\u76EE\u6807\u5730\u5740, time=\u65F6\u95F4\n\u67E5\u770B\u63D0\u9192\uFF1Aaction=list\n\u5220\u9664\u63D0\u9192\uFF1Aaction=remove, jobId=\u4EFB\u52A1ID\uFF08\u5148 list \u83B7\u53D6\uFF09\n\u65F6\u95F4\u683C\u5F0F\u793A\u4F8B\uFF1A"5m"(5\u5206\u949F\u540E) "1h"(1\u5C0F\u65F6\u540E) "0 8 * * *"(\u6BCF\u59298\u70B9)',
      parameters: RemindSchema,
      execute(_toolCallId, params) {
        const p2 = params;
        if (p2.action === "list") {
          return json2({
            _instruction: "\u8BF7\u7ACB\u5373\u4F7F\u7528 cron \u5DE5\u5177\u6267\u884C\u4EE5\u4E0B\u53C2\u6570",
            cronParams: { action: "list" }
          });
        }
        if (p2.action === "remove") {
          if (!p2.jobId) {
            return json2({ error: "action=remove \u65F6 jobId \u4E3A\u5FC5\u586B\u53C2\u6570\u3002\u8BF7\u5148\u7528 action=list \u83B7\u53D6 jobId\u3002" });
          }
          return json2({
            _instruction: "\u8BF7\u7ACB\u5373\u4F7F\u7528 cron \u5DE5\u5177\u6267\u884C\u4EE5\u4E0B\u53C2\u6570",
            cronParams: { action: "remove", jobId: p2.jobId }
          });
        }
        if (!p2.content) {
          return json2({ error: "action=add \u65F6 content\uFF08\u63D0\u9192\u5185\u5BB9\uFF09\u4E3A\u5FC5\u586B\u53C2\u6570" });
        }
        const resolvedTo = p2.to || getRequestTarget();
        if (!resolvedTo) {
          return json2({ error: "action=add \u65F6\u65E0\u6CD5\u786E\u5B9A\u6295\u9012\u76EE\u6807\u5730\u5740\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" });
        }
        const resolvedAccountId = getRequestAccountId() || "default";
        if (!p2.time) {
          return json2({ error: 'action=add \u65F6 time\uFF08\u65F6\u95F4\uFF09\u4E3A\u5FC5\u586B\u53C2\u6570\u3002\u793A\u4F8B\uFF1A"5m"\u3001"1h30m"\u3001"0 8 * * *"' });
        }
        if (isCronExpression(p2.time)) {
          const cronJob = buildCronJob(p2, resolvedTo, resolvedAccountId);
          return json2({
            _instruction: "\u8BF7\u7ACB\u5373\u4F7F\u7528 cron \u5DE5\u5177\uFF0C\u5C06 cronParams \u7684\u503C\u539F\u6837\u4F5C\u4E3A\u53C2\u6570\u4F20\u5165\uFF08\u4E0D\u8981\u4FEE\u6539\u6216\u7701\u7565\u4EFB\u4F55\u5B57\u6BB5\uFF0C\u7279\u522B\u662F delivery.accountId\uFF09\uFF0C\u7136\u540E\u56DE\u590D\u7528\u6237\u63D0\u9192\u5DF2\u8BBE\u7F6E",
            cronParams: cronJob,
            summary: `\u23F0 \u5468\u671F\u63D0\u9192: "${p2.content}" (${p2.time}, tz=${p2.timezone || "Asia/Shanghai"})`
          });
        }
        const delayMs = parseRelativeTime(p2.time);
        if (!delayMs || delayMs <= 0) {
          return json2({
            error: `\u65E0\u6CD5\u89E3\u6790\u65F6\u95F4 "${p2.time}"\u3002\u652F\u6301\u683C\u5F0F\uFF1A\u76F8\u5BF9\u65F6\u95F4\u5982 "5m"\u3001"1h"\u3001"1h30m"\u3001"2d"\uFF1Bcron \u8868\u8FBE\u5F0F\u5982 "0 8 * * *"\uFF08\u6BCF\u59298\u70B9\uFF09`
          });
        }
        if (delayMs < 3e4) {
          return json2({ error: "\u63D0\u9192\u65F6\u95F4\u4E0D\u80FD\u5C11\u4E8E 30 \u79D2" });
        }
        const onceJob = buildOnceJob(p2, delayMs, resolvedTo, resolvedAccountId);
        return json2({
          _instruction: "\u8BF7\u7ACB\u5373\u4F7F\u7528 cron \u5DE5\u5177\uFF0C\u5C06 cronParams \u7684\u503C\u539F\u6837\u4F5C\u4E3A\u53C2\u6570\u4F20\u5165\uFF08\u4E0D\u8981\u4FEE\u6539\u6216\u7701\u7565\u4EFB\u4F55\u5B57\u6BB5\uFF0C\u7279\u522B\u662F delivery.accountId\uFF09\uFF0C\u7136\u540E\u56DE\u590D\u7528\u6237\u63D0\u9192\u5DF2\u8BBE\u7F6E",
          cronParams: onceJob,
          summary: `\u23F0 ${formatDelay(delayMs)}\u540E\u63D0\u9192: "${p2.content}"`
        });
      }
    },
    { name: "qqbot_remind" }
  );
}

// src/adapter/contract.ts
var log3 = createPluginLogger({ prefix: "[contract]", forceConsole: false });
var REQUIRED = [];
var OPTIONAL = [
  {
    name: "channel.reply.dispatchReplyWithBufferedBlockDispatcher",
    probe: (rt) => typeof rt.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher === "function"
  },
  { name: "channel.inbound.run (degraded)", probe: (rt) => {
    const c = rt.channel;
    return typeof c?.inbound?.run === "function" || typeof c?.turn?.run === "function";
  } },
  { name: "channel.inbound.buildContext", probe: (rt) => typeof rt.channel?.inbound?.buildContext === "function" },
  { name: "channel.reply.formatAgentEnvelope", probe: (rt) => typeof rt.channel?.reply?.formatAgentEnvelope === "function" },
  { name: "channel.text.chunkMarkdownText", probe: (rt) => typeof rt.channel?.text?.chunkMarkdownText === "function" },
  { name: "channel.routing.resolveAgentRoute", probe: (rt) => typeof rt.channel?.routing?.resolveAgentRoute === "function" },
  { name: "channel.session.resolveStorePath (deprecated)", probe: (rt) => typeof rt.channel?.session?.resolveStorePath === "function" },
  { name: "channel.session.recordInboundSession (deprecated)", probe: (rt) => typeof rt.channel?.session?.recordInboundSession === "function" },
  { name: "channel.reply.finalizeInboundContext (deprecated)", probe: (rt) => typeof rt.channel?.reply?.finalizeInboundContext === "function" },
  { name: "channel.reply.formatInboundEnvelope (deprecated)", probe: (rt) => typeof rt.channel?.reply?.formatInboundEnvelope === "function" },
  { name: "config.current", probe: (rt) => typeof rt.config?.current === "function" }
];
function verifyRuntimeContract(rt) {
  const version = rt.version ?? "unknown";
  const missing = [];
  const degraded = [];
  for (const r of REQUIRED) {
    if (!r.probe(rt)) missing.push(r.name);
  }
  for (const r of OPTIONAL) {
    if (!r.probe(rt)) degraded.push(r.name);
  }
  log3.debug(`openclaw=${version} required=${REQUIRED.length - missing.length}/${REQUIRED.length} degraded=${degraded.length}/${OPTIONAL.length}`);
  if (missing.length) {
    log3.error(`BROKEN \u2014 missing: ${missing.join(", ")}`);
  }
  if (degraded.length) {
    log3.debug(`degraded: ${degraded.join(", ")}`);
  }
  return { ok: missing.length === 0, version, missing, degraded };
}

// src/types.ts
var MSG_TYPE_TEXT = 0;
var MSG_TYPE_QUOTE2 = 103;
var StreamInputMode2 = {
  /** 每次发送的 content_raw 替换整条消息内容 */
  REPLACE: "replace"
};
var StreamInputState2 = {
  /** 正文生成中 */
  GENERATING: 1,
  /** 正文生成结束（终结状态） */
  DONE: 10
};
var StreamContentType2 = {
  MARKDOWN: "markdown"
};

// index.ts
init_config();
var registered = false;
var plugin = {
  id: "openclaw-qqbot",
  name: "QQ Bot",
  description: "QQ Bot channel plugin",
  configSchema: (0, import_core2.emptyPluginConfigSchema)(),
  register(api) {
    setQQBotRuntime(api.runtime);
    if (!registered) {
      registered = true;
      const contract = verifyRuntimeContract(api.runtime);
      if (!contract.ok) {
        throw new Error(
          `openclaw-qqbot incompatible with openclaw ${contract.version}: missing required APIs: ${contract.missing.join(", ")}. Please upgrade openclaw or downgrade the plugin.`
        );
      }
    }
    api.registerChannel({ plugin: qqbotPlugin });
    registerPlatformTool(api);
    registerRemindTool(api);
  }
};
var index_default = plugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_ACCOUNT_ID,
  MSG_TYPE_QUOTE,
  MSG_TYPE_TEXT,
  PersistedRefIndexStore,
  QQBotGateway,
  StreamContentType,
  StreamInputMode,
  StreamInputState,
  StreamingController,
  applyQQBotAccountConfig,
  buildUserAgent,
  dispatchToOpenClaw,
  flushAllRefIndexStores,
  getBotForAccount,
  getPersistedRefIndexStore,
  getQQBotRuntime,
  isGroupAllowed,
  listQQBotAccountIds,
  parseTarget,
  qqbotOnboardingAdapter,
  qqbotPlugin,
  resolveDefaultQQBotAccountId,
  resolveGroupAllowFrom,
  resolveGroupConfig,
  resolveGroupConfigFromAccount,
  resolveGroupName,
  resolveGroupPolicy,
  resolveGroupPrompt,
  resolveHistoryLimit,
  resolveIgnoreOtherMentions,
  resolveMentionPatterns,
  resolveProcessingTimeoutMs,
  resolveQQBotAccount,
  resolveRequireMention,
  resolveToolPolicy,
  resolveUserAgentSuffix,
  sendMedia,
  sendText,
  setQQBotRuntime,
  shouldUseStreaming,
  tryGetBotForAccount
});
//# sourceMappingURL=index.cjs.map