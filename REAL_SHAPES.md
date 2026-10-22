# 真实返回结构样本（hosino.ume.wiki，2026-10-20 采集，数组只保留首项，字符串截断）

## GET /api/usage
```json
{
 "updatedAt": 1792476001407,
 "providers": [
  {
   "provider": "deepseek",
   "displayName": "DeepSeek",
   "windows": [],
   "billing": [
    {
     "type": "balance",
     "amount": 33.72,
     "unit": "CNY"
    }
   ],
   "summary": "Balance ¥33.72 · Granted ¥14.93 · Topped up ¥18.78"
  }
 ]
}
```

## GET /api/channels
```json
{
 "ts": 1792476042245,
 "channelOrder": [
  "qqbot"
 ],
 "channelLabels": {
  "qqbot": "QQ Bot"
 },
 "channelDetailLabels": {
  "qqbot": "QQ Bot"
 },
 "channelSystemImages": {},
 "channelMeta": [
  {
   "id": "qqbot",
   "label": "QQ Bot",
   "detailLabel": "QQ Bot"
  }
 ],
 "eventLoop": {
  "degraded": false,
  "degradedSinceMs": null,
  "reasons": [],
  "intervalMs": 1009.0777550004423,
  "delayP99Ms": 21,
  "delayMaxMs": 21,
  "utilization": 0.022,
  "cpuCoreRatio": 0.032,
  "cpuBreakdown": {
   "mainThreadCoreRatio": 0.025,
   "hostUtilization": 0.01,
   "hostCpuCount": 4,
   "workerCoreRatio": 0.006,
   "otherThreadsCoreRatio": 0.001
  }
 },
 "channels": {
  "qqbot": {
   "configured": true,
   "tokenSource": "••••••（已隐藏）",
   "running": true,
   "connected": true,
   "lastConnectedAt": 1792472863037,
   "lastError": null
  }
 },
 "channelAccounts": {
  "qqbot": [
   {
    "accountId": "default",
    "enabled": true,
    "tokenSource": "••••••（已隐藏）",
    "lastConnectedAt": 1792472863037,
    "lastInboundAt": null,
    "lastOutboundAt": null,
    "configured": true,
    "running": true,
    "connected": true,
    "lastError": null
   }
  ]
 },
 "channelDefaultAccountId": {
  "qqbot": "default"
 },
 "statusIssues": []
}
```

## GET /api/skills
```json
{
 "workspaceDir": "/home/ubuntu/.openclaw/workspace",
 "managedSkillsDir": "/home/ubuntu/.openclaw/skills",
 "agentId": "main",
 "skills": [
  {
   "name": "1password",
   "description": "••",
   "source": "openclaw-bundled",
   "bundled": true,
   "filePath": "/home/ubuntu/.npm-global/lib/node_modules/openclaw/skills/1p",
   "baseDir": "/home/ubuntu/.npm-global/lib/node_modules/openclaw/skills/1p",
   "skillKey": "1password",
   "always": false,
   "disabled": true,
   "blockedByAllowlist": false,
   "eligible": false,
   "emoji": "🔐",
   "homepage": "https://developer.1password.com/docs/cli/get-started/",
   "missing": {
    "bins": [
     "op"
    ],
    "anyBins": [],
    "env": [],
    "config": [],
    "os": []
   },
   "configChecks": [],
   "blockedByAgentFilter": false,
   "platformIncompatible": false,
   "modelVisible": false,
   "userInvocable": true,
   "commandVisible": false,
   "requirements": {
    "bins": [
     "op"
    ],
    "anyBins": [],
    "env": [],
    "config": [],
    "os": []
   },
   "install": [
    {
     "id": "brew",
     "kind": "brew",
     "label": "Install 1Password CLI (brew)",
     "bins": [
      "op"
     ]
    }
   ]
  }
 ]
}
```

## GET /api/cron
```json
{
 "jobs": [
  {
   "id": "9134bef7-6e75-479c-af67-a27a09299f86",
   "declarationKey": "heartbeat:main",
   "displayName": "Heartbeat (main)",
   "agentId": "main",
   "name": "heartbeat-main",
   "enabled": true,
   "createdAtMs": 1790721981598,
   "schedule": {
    "kind": "every",
    "everyMs": 1500000,
    "anchorMs": 206214
   },
   "sessionTarget": "main",
   "wakeMode": "next-heartbeat",
   "payload": {
    "kind": "heartbeat"
   },
   "state": {
    "nextRunAtMs": 1792477437605,
    "lastRunAtMs": 1792475937605,
    "lastRunStatus": "ok",
    "lastStatus": "ok",
    "lastDurationMs": 3467,
    "lastDeliveryStatus": "not-requested",
    "lastFailureNotificationDeliveryStatus": "not-requested",
    "consecutiveErrors": 0,
    "consecutiveSkipped": 0,
    "scheduleActivatedAtMs": 1790839090127
   },
   "updatedAtMs": 1792475941072,
   "configRevision": "sha256:tfnkXBnVp65KpROLfjrN2mlj2xQ63drD7CwB3eOrmTU",
   "nextRunAtMs": 1792477437605,
   "lastRunAtMs": 1792475937605,
   "lastRunStatus": "ok",
   "lastDeliveryStatus": "not-requested",
   "lastFailureNotificationDeliveryStatus": "not-requested",
   "effectiveAgentId": "main"
  }
 ],
 "snapshotRevision": "sha256:T-I_iMiRFKD_qHccAz7HTUMxjiFCn8gUD73eCvpeqsQ",
 "total": 1,
 "offset": 0,
 "limit": 1,
 "hasMore": false,
 "nextOffset": null,
 "deliveryPreviews": {
  "9134bef7-6e75-479c-af67-a27a09299f86": {
   "label": "not requested",
   "detail": "not requested"
  }
 }
}
```

## GET /api/overview (仅 status/health 部分)
```json
{
 "status": {
  "runtimeVersion": "2026.9.8",
  "sqliteWal": {
   "state": "complete",
   "observedAtMs": 1792474601546,
   "walBytes": 4132392,
   "databaseBytes": 22958080,
   "logFrames": 372,
   "checkpointedFrames": 372,
   "lastCompletedAtMs": 1792474601546,
   "consecutiveBlocked": 0,
   "warning": false
  },
  "hostDesktop": {
   "enabled": false,
   "state": "disabled",
   "port": 5900
  },
  "heartbeat": {
   "defaultAgentId": "main",
   "agents": [
    {
     "agentId": "main",
     "enabled": true,
     "every": "25m",
     "everyMs": 1500000,
     "waitingForRoute": false
    }
   ]
  },
  "channelSummary": [
   "QQ Bot: configured"
  ],
  "queuedSystemEvents": [],
  "degradedSecretOwners": [],
  "degradedPlugins": [],
  "sessions": {
   "paths": [
    "/home/ubuntu/.openclaw/agents/main/agent/openclaw-agent.sqli"
   ],
   "count": 40,
   "defaults": {
    "model": "gpt-6-luna",
    "contextTokens": 272000
   },
   "recent": [
    {
     "agentId": "main",
     "key": "agent:main:main",
     "kind": "direct",
     "sessionId": "4a821868-996d-4a05-842c-2d31840dbd3a",
     "updatedAt": 1792475941066,
     "age": 103408,
     "thinkingLevel": "off",
     "systemSent": true,
     "abortedLastRun": false,
     "inputTokens": 2,
     "outputTokens": 8,
     "cacheRead": 152117,
     "cacheWrite": 301,
     "totalTokens": 152420,
     "totalTokensFresh": true,
     "remainingTokens": 847580,
     "percentUsed": 15,
     "model": "claude-haiku-5-5",
     "configuredModel": "openai/gpt-6-luna",
     "selectedModel": "anthropic/claude-haiku-5-5",
     "modelSelectionReason": "session override",
     "runtime": "Claude CLI",
     "contextTokens": 1000000,
     "flags": [
      "think:off"
     ]
    }
   ],
   "byAgent": [
    {
     "agentId": "main",
     "path": "/home/ubuntu/.openclaw/agents/main/agent/openclaw-agent.sqli",
     "count": 40,
     "recent": [
      {
       "agentId": "main",
       "key": "agent:main:main",
       "kind": "direct",
       "sessionId": "4a821868-996d-4a05-842c-2d31840dbd3a",
       "updatedAt": 1792475941066,
       "age": 103408,
       "thinkingLevel": "off",
       "systemSent": true,
       "abortedLastRun": false,
       "inputTokens": 2,
       "outputTokens": 8,
       "cacheRead": 152117,
       "cacheWrite": 301,
       "totalTokens": 152420,
       "totalTokensFresh": true,
       "remainingTokens": 847580,
       "percentUsed": 15,
       "model": "claude-haiku-5-5",
       "configuredModel": "openai/gpt-6-luna",
       "selectedModel": "anthropic/claude-haiku-5-5",
       "modelSelectionReason": "session override",
       "runtime": "Claude CLI",
       "contextTokens": 1000000,
       "flags": [
        "think:off"
       ]
      }
     ]
    }
   ]
  },
  "modelRuntime": {
   "degraded": false,
   "pendingAgents": []
  },
  "eventLoop": {
   "degraded": false,
   "degradedSinceMs": null,
   "reasons": [],
   "intervalMs": 1009.2917180005461,
   "delayP99Ms": 21.9,
   "delayMaxMs": 21.9,
   "utilization": 0.037,
   "cpuCoreRatio": 0.095,
   "cpuBreakdown": {
    "mainThreadCoreRatio": 0.04,
    "hostUtilization": 0.025,
    "hostCpuCount": 4
   }
  },
  "processMemory": {
   "rssBytes": 2109673472,
   "heapUsedBytes": 710771168,
   "heapTotalBytes": 845066240,
   "externalBytes": 41105026,
   "arrayBuffersBytes": 36413368
  },
  "workerPools": {
   "transcriptReconciliation": {
    "maxWorkers": 1,
    "workers": 0,
    "workersCreated": 0,
    "activeTasks": 0,
    "pendingTasks": 0
   },
   "modelCatalog": {
    "maxWorkers": 1,
    "workers": 1,
    "workersCreated": 1,
    "activeTasks": 0,
    "pendingTasks": 0
   }
  },
  "pid": 273038,
  "shutdownBudget": {
   "timeoutMs": 325000,
   "reserveMs": 10000,
   "nativeStopBudget": true,
   "activeWork": {
    "rootRequests": 2,
    "cronRuns": 0,
    "sessionMutations": 0,
    "terminalPersistence": 0,
    "lifecycleWrites": 0
   },
   "writeCustody": []
  },
  "childRuntime": {
   "execPath": "/usr/bin/node",
   "available": true
  }
 },
 "health": {
  "ok": true,
  "ts": 1792476044514,
  "durationMs": 52,
  "plugins": {
   "loaded": [
    "anthropic"
   ],
   "errors": [],
   "unavailable": []
  },
  "deliveryQueues": {
   "failed": [
    {
     "queueName": "outbound-prepared-v1",
     "count": 7,
     "oldestFailedAt": 1790856383631
    }
   ]
  },
  "configReload": {
   "hotReloadStatus": "active"
  },
  "channels": {
   "qqbot": {
    "accountId": "default",
    "enabled": true,
    "tokenSource": "••••••（已隐藏）",
    "lastConnectedAt": 1792472863037,
    "lastInboundAt": null,
    "lastOutboundAt": null,
    "configured": true,
    "running": true,
    "connected": true,
    "lastError": null,
    "accounts": {
     "default": {
      "accountId": "default",
      "enabled": true,
      "tokenSource": "••••••（已隐藏）",
      "lastConnectedAt": 1792472863037,
      "lastInboundAt": null,
      "lastOutboundAt": null,
      "configured": true,
      "running": true,
      "connected": true,
      "lastError": null
     }
    }
   }
  },
  "channelOrder": [
   "qqbot"
  ],
  "channelLabels": {
   "qqbot": "QQ Bot"
  },
  "heartbeatSeconds": 1500,
  "defaultAgentId": "main",
  "agents": [
   {
    "agentId": "main",
    "name": "星野家的猫",
    "isDefault": true,
    "heartbeat": {
     "enabled": true,
     "every": "25m",
     "everyMs": 1500000,
     "prompt": "Cache keepalive only. Do not use tools. Do not send messages",
     "target": "none",
     "session": "main",
     "ackMaxChars": 300
    },
    "sessions": {
     "path": "/home/ubuntu/.openclaw/agents/main/agent/openclaw-agent.sqli",
     "count": 40,
     "recent": [
      {
       "key": "agent:main:main",
       "updatedAt": 1792475941066,
       "age": 103400
      }
     ]
    }
   }
  ],
  "sessions": {
   "path": "/home/ubuntu/.openclaw/agents/main/agent/openclaw-agent.sqli",
   "count": 40,
   "recent": [
    {
     "key": "agent:main:main",
     "updatedAt": 1792475941066,
     "age": 103400
    }
   ]
  },
  "eventLoo
```

## GET /api/memory
```json
{
 "collection": "mem0_full_timestamped_20260926",
 "points": 16265,
 "total": 16265,
 "items": [
  {
   "id": "34a8b376-4b73-5912-b33d-af68d3c59dae",
   "oc_subject_id": "unverified",
   "oc_stated_by": "qqbot:bc5778472787a61e0c0aafc99330cea110fd4c2b93613c7c63d2cd",
   "oc_visibility": "group",
   "oc_source_channel": "qqbot",
   "user_id": "凛",
   "data": "[芙宁娜 (A6902CCDF6FD63D47AC7B9A6BD44E201)] 收到，这两点我认了喵～「皮肤变厚/色沉",
   "createdAt": "2026-10-17T09:10:05.695Z"
  }
 ]
}
```


## 与 app.js 的不匹配（需前端修正）
1. **概览 QQ 状态**：`findKey(ch, /^qq/i)` 先命中 `channelLabels.qqbot`（字符串 "QQ Bot"），不是状态对象 → 会显示"未知"。应改用 `ch.channels.qqbot`（`{configured,running,connected,lastConnectedAt,lastError}`）或 `ch.channelAccounts.qqbot[0]`。
2. **心跳**：`status.heartbeat` 实际是 `{defaultAgentId, agents:[{agentId,enabled,every:"25m",everyMs,waitingForRoute}]}`，没有顶层 every/enabled/lastRunAt → 间隔显示为空。应取 `hb.agents[0]`（或全部 agents）。上次执行时间可用 cron 里 `declarationKey:"heartbeat:main"` 任务的 `state.lastRunAtMs`。
3. **用量**：providers 的 `windows` 多为 `[]`，额度在 `billing:[{type:"balance",amount,unit}]` 和 `summary` 字符串里；当前代码 `p.windows` 为空数组时卡片无内容。建议 windows 为空时显示 `summary` / billing 余额。
4. **渠道页**：`channels` 是以 id 为键的对象，asArr 能处理；但没有 label 字段，名称在 `c.channelLabels[id]`，当前会显示 "qqbot"。
5. 技能（skills[].name/description/eligible/disabled/emoji）与 cron（jobs[].name/schedule{kind:"every",everyMs}/state{nextRunAtMs,lastRunAtMs,lastStatus}）结构与 app.js 预期一致。

# v2 真实返回样本（2026-10-20 15:19 UTC+8 网关只读调用；数组只留首项）

## cron.status
```json
{
 "enabled": true,
 "triggersEnabled": true,
 "storePath": "/home/ubuntu/.openclaw/state/openclaw.sqlite",
 "storage": "sqlite",
 "sqlitePath": "/home/ubuntu/.openclaw/state/openclaw.sqlite",
 "jobs": 4,
 "nextWakeAtMs": 1792481937652
}
```

## cron.runs
```json
{
 "entries": [
  {
   "ts": 1792480440824,
   "jobId": "9134bef7-6e75-479c-af67-a27a09299f86",
   "action": "finished",
   "status": "ok",
   "completionStatus": "succeeded",
   "summary": "heartbeat completed",
   "runAtMs": 1792480437652,
   "durationMs": 3172,
   "nextRunAtMs": 1792481937652,
   "deliveryStatus": "not-requested",
   "jobName": "heartbeat-main"
  }
 ],
 "total": 384,
 "offset": 0,
 "limit": 3,
 "hasMore": true,
 "nextOffset": 3
}
```

## cron.get
```json
{
 "id": "9134bef7-6e75-479c-af67-a27a09299f86",
 "declarationKey": "heartbeat:main",
 "displayName": "Heartbeat (main)",
 "agentId": "main",
 "name": "heartbeat-main",
 "enabled": true,
 "createdAtMs": 1790721981598,
 "schedule": {
  "kind": "every",
  "everyMs": 1500000,
  "anchorMs": 206214
 },
 "sessionTarget": "main",
 "wakeMode": "next-heartbeat",
 "payload": {
  "kind": "heartbeat"
 },
 "state": {
  "nextRunAtMs": 1792481937652,
  "lastRunAtMs": 1792480437652,
  "lastRunStatus": "ok",
  "lastStatus": "ok",
  "lastDurationMs": 3172,
  "lastDeliveryStatus": "not-requested",
  "lastFailureNotificationDeliveryStatus": "not-requested",
  "consecutiveErrors": 0,
  "consecutiveSkipped": 0,
  "scheduleActivatedAtMs": 1790839090127
 },
 "updatedAtMs": 1792480440824,
 "configRevision": "sha256:tfnkXBnVp65KpROLfjrN2mlj2xQ63drD7CwB3eOrmTU",
 "nextRunAtMs": 1792481937652,
 "lastRunAtMs": 1792480437652,
 "lastRunStatus": "ok",
 "lastDeliveryStatus": "not-requested",
 "lastFailureNotificationDeliveryStatus": "not-requested"
}
```

## cron.history
```json
{
 "__error": {
  "code": "INVALID_REQUEST",
  "message": "cron.history requires an id and exact runId or runAtMs"
 }
}
```

## exec.approval.list
```json
[]
```

## exec.approval.grants.list
```json
{
 "grants": []
}
```

## usage.cost
```json
{
 "updatedAt": 1792480791084,
 "days": 30,
 "daily": [
  {
   "date": "2026-09-21",
   "input": 0,
   "output": 0,
   "cacheRead": 0,
   "cacheWrite": 0,
   "totalTokens": 0,
   "totalCost": 0,
   "inputCost": 0,
   "outputCost": 0,
   "cacheReadCost": 0,
   "cacheWriteCost": 0,
   "missingCostEntries": 0
  }
 ],
 "totals": {
  "input": 42905295,
  "output": 649144,
  "cacheRead": 382940025,
  "cacheWrite": 2237331,
  "totalTokens": 428731795,
  "totalCost": 6.293556563999991,
  "inputCost": 3.2557998800000036,
  "outputCost": 0.23741430000000302,
  "cacheReadCost": 2.8003423839999972,
  "cacheWriteCost": 0,
  "missingCostEntries": 445,
  "missingCostByModel": {
   "claude-cli/claude-haiku-5-5": 440,
   "claude-cli/claude-sonnet-5-5": 2,
   "xiaomi-token-plan/mimo-v2.6-pro": 3
  }
 },
 "cacheStatus": {
  "status": "fresh",
  "cachedFiles": 51,
  "pendingFiles": 0,
  "staleFiles": 0,
  "refreshedAt": 1792480782463
 }
}
```

## models.authStatus
```json
{
 "ts": 1792480791090,
 "providers": [
  {
   "provider": "deepseek",
   "authProvider": "deepseek",
   "displayName": "DeepSeek",
   "status": "static",
   "profiles": [
    {
     "profileId": "deepseek:setup-80d6b945-3fca-41bf-8152-e628b2afbb75",
     "type": "api_key",
     "status": "static",
     "source": "inherited",
     "logoutSupported": true
    }
   ],
   "apiKey": {
    "source": "env",
    "envVar": "DEEPSEEK_API_KEY"
   },
   "usage": {
    "providerId": "deepseek",
    "windows": [],
    "summary": "Balance ¥33.72 · Granted ¥14.93 · Topped up ¥18.78",
    "billing": [
     {
      "type": "balance",
      "amount": 33.72,
      "unit": "CNY"
     }
    ]
   }
  }
 ],
 "providerCapabilities": [
  {
   "provider": "anthropic",
   "apiKeySupported": true,
   "quickApiKeySetup": true
  }
 ]
}
```

## channels.pairing.list
```json
{
 "accounts": [],
 "requests": [],
 "commandOwnerConfigured": true,
 "limits": {
  "pendingPerAccount": 3,
  "ttlMs": 3600000
 }
}
```

## tools.effective
```json
{
 "__error": {
  "code": "UNAVAILABLE",
  "message": "Tool inventory display temporarily unavailable to keep the gateway responsive."
 }
}
```

## hooks.status
```json
{
 "workspaceDir": "/home/ubuntu/.openclaw/workspace",
 "managedHooksDir": "/home/ubuntu/.openclaw/hooks",
 "hooks": [
  {
   "name": "boot-md",
   "description": "Run BOOT.md on gateway startup",
   "source": "openclaw-bundled",
   "filePath": "/home/ubuntu/.npm-global/lib/node_modules/openclaw/dist/bundled/boot-md/HOOK.md",
   "baseDir": "/home/ubuntu/.npm-global/lib/node_modules/openclaw/dist/bundled/boot-md",
   "handlerPath": "/home/ubuntu/.npm-global/lib/node_modules/openclaw/dist/bundled/boot-md/handler.",
   "hookKey": "boot-md",
   "emoji": "🚀",
   "homepage": "https://docs.openclaw.ai/automation/hooks#boot-md",
   "events": [
    "gateway:startup"
   ],
   "unknownEvents": [],
   "always": false,
   "enabledByConfig": true,
   "requirementsSatisfied": true,
   "loadable": true,
   "managedByPlugin": false,
   "requirements": {
    "bins": [],
    "anyBins": [],
    "env": [],
    "config": [
     "workspace.dir"
    ],
    "os": []
   },
   "missing": {
    "bins": [],
    "anyBins": [],
    "env": [],
    "config": [],
    "os": []
   },
   "configChecks": [
    {
     "path": "workspace.dir",
     "satisfied": true
    }
   ],
   "install": [
    {
     "id": "bundled",
     "kind": "bundled",
     "label": "Bundled with OpenClaw",
     "bins": []
    }
   ]
  }
 ]
}
```

## audit.list
```json
{
 "events": [
  {
   "sequence": 14648,
   "eventId": "247a6c30-b030-4204-9461-0dd52a852d38",
   "sourceSequence": 6,
   "occurredAt": 1792480440800,
   "redaction": "metadata_only",
   "agentId": "main",
   "sessionKey": "agent:main:main",
   "sessionId": "4a821868-996d-4a05-842c-2d31840dbd3a",
   "runId": "59a29741-3346-4aff-861f-9bb2afe25dc4",
   "kind": "agent_run",
   "action": "agent.run.finished",
   "status": "succeeded",
   "actor": {
    "type": "agent",
    "id": "main"
   }
  }
 ],
 "nextCursor": "14646"
}
```

## audit.activity.list
```json
{
 "events": [
  {
   "schemaVersion": 1,
   "sequence": 14648,
   "eventId": "247a6c30-b030-4204-9461-0dd52a852d38",
   "sourceSequence": 6,
   "occurredAt": 1792480440800,
   "redaction": "metadata_only",
   "agentId": "main",
   "sessionKey": "agent:main:main",
   "sessionId": "4a821868-996d-4a05-842c-2d31840dbd3a",
   "runId": "59a29741-3346-4aff-861f-9bb2afe25dc4",
   "kind": "agent_run",
   "action": "agent.run.finished",
   "status": "succeeded",
   "eventType": "agent_run",
   "actor": {
    "type": "agent",
    "id": "main"
   }
  }
 ],
 "nextCursor": "14646"
}
```

## diagnostics.stability
```json
{
 "generatedAt": "2026-10-20T07:19:51.118Z",
 "capacity": 1000,
 "count": 619,
 "dropped": 0,
 "firstSeq": 44,
 "lastSeq": 1163,
 "events": [
  {
   "seq": 1070,
   "ts": 1792478937900,
   "type": "message.received",
   "source": "dispatchInboundMessage"
  }
 ],
 "summary": {
  "byType": {
   "diagnostic.phase.completed": 66,
   "message.received": 26,
   "diagnostic.memory.sample": 67,
   "diagnostic.memory.pressure": 51,
   "diagnostic.heartbeat": 67,
   "message.queued": 26,
   "session.state": 104,
   "message.dispatch.started": 26,
   "session.turn.created": 26,
   "queue.lane.enqueue": 26,
   "queue.lane.dequeue": 26,
   "model.call.started": 26,
   "message.processed": 26,
   "model.call.error": 2,
   "model.call.completed": 24,
   "message.dispatch.completed": 24,
   "message.delivery.started": 3,
   "message.delivery.completed": 3
  },
  "memory": {
   "latest": {
    "rssBytes": 2071216128,
    "heapTotalBytes": 840871936,
    "heapUsedBytes": 682848544,
    "externalBytes": 9278692,
    "arrayBuffersBytes": 4583085,
    "workerCount": 11,
    "workerLifecycle": [
     {
      "script": "sqlite-store.worker.js",
      "started": 2,
      "retired": []
     }
    ],
    "workerHeapSampledCount": 11,
    "workerHeapTotalBytes": 704581632,
    "workerHeapUsedBytes": 633155688,
    "workerExternalBytes": 70735199,
    "workerArrayBuffersBytes": 5199353,
    "workerArrayBuffersSampledCount": 7,
    "workerMemoryScope": "direct",
    "workerMemoryMissing": [],
    "workerHeaps": [
     {
      "script": "sqlite-store.worker.js",
      "threadId": 3,
      "heapUsed": 60193344,
      "heapTotal": 67235840,
      "external": 4681379,
      "sampleAgeMs": 30000
     }
    ],
    "workerMemoryCoverage": "partial"
   },
   "maxRssBytes": 2217410560,
   "maxHeapUsedBytes": 821438248,
   "pressureCount": 51
  }
 }
}
```

## diagnostics.lanes
```json
{
 "ts": 1792480791120,
 "lanes": [
  {
   "lane": "active-memory",
   "queuedCount": 0,
   "activeCount": 0,
   "maxConcurrent": 8,
   "draining": false,
   "generation": 0,
   "blockedBy": null
  }
 ],
 "dynamic": null,
 "workerCount": 13,
 "workerPoolCount": 8,
 "workerPools": [
  {
   "poolId": 1,
   "script": "openclaw-state-read.worker.js",
   "workerCount": 2
  }
 ]
}
```

## agents.files.list
```json
{
 "agentId": "main",
 "workspace": "/home/ubuntu/.openclaw/workspace",
 "files": [
  {
   "name": "AGENTS.md",
   "path": "/home/ubuntu/.openclaw/workspace/AGENTS.md",
   "missing": false,
   "size": 18656,
   "updatedAtMs": 1792327300494
  }
 ]
}
```

## skills.curator.status
```json
{
 "lastAttemptAtMs": 0,
 "lastSuccessAtMs": null,
 "lastError": null,
 "collectionReview": {},
 "experienceReview": {
  "d227de0e73f640bac279b1db51d42eaa689cea5274f32d5c7a46a04664737d0c": {
   "attemptedAtMs": 1792039142831,
   "outcome": "failed",
   "error": "SessionTranscriptReadFenceError: Completed-turn transcript anchor changed"
  }
 },
 "counts": {
  "active": 0,
  "stale": 0,
  "archived": 0
 },
 "skills": [],
 "overlaps": []
}
```

## mcp.app.listTools
```json
{
 "__error": {
  "code": "UNAVAILABLE",
  "message": "sessionKey is required"
 }
}
```

# v2.1 媒体真实样本（15:33 UTC+8，只读）
- 入站图片（user 消息 text 内）：`- Attachment origins (host metadata; not the photographed person's identity): {"path":"/home/ubuntu/.openclaw/media/qqbot/downloads/39D6B160F3327D5A94D561198A1589C4---e29f0303-90db-4a63-a217-02b58cecbd3c.jpg","senderId":"7FE244B1202CD602DDA2C06B29C62F50","messageId":"ROBOT1.0_…"}`
- 机器人发文件（assistant toolcall）：`{"type":"toolcall","name":"message","arguments":{"action":"send","target":"qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5","media":"/home/ubuntu/.openclaw/media/qq-text-files/b4ee…/2688…/afa5…/C18O2.txt"}}`
- 工具结果：`{"status":"created","mediaPath":"/home/ubuntu/.openclaw/media/qq-text-files/…"}`、`{"channel":"qqbot","to":"qqbot:group:B4EE…","via":"direct","mediaUrl":"/home/ubuntu/.openclaw/media/…","mediaUrls":["…"]}`
- 40 个会话里 part 类型统计：text 986、toolCall 481、toolcall 197、tool_result 197、thinking 9、toolResult 5；没有 image/media 类型的 part。
- 媒体目录文件统计：jpg 211、png 69、gif 56、mp3 20、txt 17、mp4 11、md 8、zip 4、html 1。
- QQ 会话投递目标：`sessions.list` 条目 `deliveryContext: {"channel":"qqbot","to":"qqbot:group:B4EE2A7019C96343C96EEBA8CB63D8C5","accountId":"default"}`（也见 `origin.to`、`lastTo`）。
- `/api/qq/send` 成功返回：`{"runId":"50ad58ac-…","messageId":"ROBOT1.0_wMU3…","channel":"qqbot"}`
