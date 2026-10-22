# 星野控制台 API v2 提案（前端暂定契约）

> ⚠️ **已被 API.md 的「v2」章节取代**（2026-10-20 15:21）。前端 `public/api.js` 现已按 API.md v2 对接，本文件仅作历史参考。

> 前端临时按本文件对接；**以 API.md 的 v2 章节为准**，正式契约出来后只需改 `public/api.js`。
> 约定与 v1 相同：`credentials:"include"`，所有 POST 带 `X-HS: 1`，错误 `{error, code?}`。
> 接口不存在（404）时，前端显示「这个功能还没开放」，不会报错崩溃。
> 结构是根据 gateway-methods.md 里的方法名推测的，网关真实返回字段可能不同。

## 1. 定时任务（cron）
| 方法 | 路径 | 网关 | 请求 / 响应 |
|---|---|---|---|
| POST | /api/cron/add | cron.add | `{ name, enabled?, schedule:{kind:"cron",expr,tz?}|{kind:"every",everyMs}|{kind:"at",atMs}, payload:{kind:"agentTurn",message}|{kind:"systemEvent",text}, sessionTarget?:"main"|"isolated" }` → `{ job }` |
| POST | /api/cron/update | cron.update | `{ id, patch:{name?,enabled?,schedule?,payload?} }` → `{ job }` |
| POST | /api/cron/remove | cron.remove | `{ id }` → `{ ok }`（前端二次确认） |
| POST | /api/cron/run | cron.run | `{ id }` → `{ ok, runId? }` |
| GET | /api/cron/runs?id=&limit=20 | cron.runs | `{ runs:[{ runId, startedAtMs, finishedAtMs, status:"ok"|"error"|"skipped", durationMs, error?, summary? }] }` |

## 2. 会话
| POST | /api/sessions/create | sessions.create | `{ label?, model?, agentId? }` → `{ key }` |
| POST | /api/sessions/reset | sessions.reset | `{ key }` → `{ ok }` |
| POST | /api/sessions/compact | sessions.compact | `{ key }` → `{ ok, before?, after? }` |
| POST | /api/sessions/delete | sessions.delete | `{ key }` → `{ ok }`（前端二次确认：需输入会话名） |

## 3. 命令执行审批
| GET | /api/approvals | exec.approval.list | `{ pending:[{ id, command, cwd?, sessionKey?, agentId?, requestedAt, expiresAt? }] }` |
| POST | /api/approvals/resolve | exec.approval.resolve | `{ id, decision:"allow-once"|"allow-always"|"deny" }` → `{ ok }` |
| GET | /api/approvals/grants | exec.approval.grants.list | `{ grants:[{ id, pattern, agentId?, createdAt, lastUsedAt? }] }` |
| POST | /api/approvals/grants/revoke | exec.approval.grants.revoke | `{ id }` → `{ ok }` |

## 4. 费用统计（只读）
| GET | /api/usage/cost?days=30 | usage.cost | `{ currency:"USD", totalCost, totalTokens, daily:[{ date:"2026-10-20", cost, tokens }], byModel:[{ provider, model, cost, tokens, calls? }] }` |

## 5. 模型探测与凭据状态（只读）
| GET | /api/models/auth | models.authStatus | `{ providers:[{ provider, status:"ok"|"expired"|"missing"|"error", profiles:[{ id, type:"oauth"|"api_key"|"token", expiresAt? }] }] }`（脱敏） |
| POST | /api/models/probe | models.probe | `{ model? }`（空=全部）→ `{ results:[{ provider, model, ok, latencyMs?, error? }] }`（读操作，用 POST 因耗时/有成本） |

## 7. 技能
| GET | /api/skills/detail?name= | skills.detail | `{ name, description, emoji?, source, homepage?, eligible, disabled, pinned?, missing?, install?:[{id,kind,label}], version?, updateAvailable?, readme? }` |
| POST | /api/skills/install | skills.install | `{ name, installId }` → `{ ok, log? }`（前端确认；可能不开放） |
| POST | /api/skills/update | skills.update | `{ name }` → `{ ok }`（前端确认；可能不开放） |
| POST | /api/skills/pin | skills.curator.pin / unpin | `{ name, pinned:bool }` → `{ ok }` |

## 8. QQ 配对
| GET | /api/pairing | channels.pairing.list | `{ requests:[{ channel, code, senderId, senderName?, createdAt, expiresAt? }] }` |
| POST | /api/pairing/approve | channels.pairing.approve | `{ channel, code }` → `{ ok }` |
| POST | /api/pairing/dismiss | channels.pairing.dismiss | `{ channel, code }` → `{ ok }` |

## 9. 工具 / MCP / Hooks（只读）
| GET | /api/tools | tools.effective + mcp.app.listTools | `{ tools:[{ name, source:"core"|"plugin"|"mcp", plugin?, description?, enabled? }], mcp:[{ server, status, tools:number }] }` |
| GET | /api/hooks | hooks.status | `{ hooks:[{ name, event, source, enabled, lastRunAt?, lastError? }] }` |

## 10. 审计与诊断（只读）
| GET | /api/audit?limit=100 | audit.list | `{ entries:[{ ts, actor, action, target?, result:"ok"|"denied"|"error", detail? }] }` |
| GET | /api/diagnostics | diagnostics.stability + diagnostics.lanes | `{ stability:{ score?, restarts24h?, crashes?, issues:[{level,message}] }, lanes:[{ name, active, queued, maxConcurrent }] }` |

## 11. Agent 文件
| GET | /api/agent-files?agentId=main | agents.files.list | `{ agentId, files:[{ name, size, updatedAt }] }` |
| GET | /api/agent-files/get?agentId=main&name=SOUL.md | agents.files.get | `{ name, content, hash, updatedAt }` |
| POST | /api/agent-files/set | agents.files.set | `{ agentId, name, content, baseHash }` → `{ ok, hash, backup? }`（后端写前先备份；baseHash 不一致返回 409） |
