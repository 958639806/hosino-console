# Android device API v1

This extension serves the locally packaged Android client tracked in
[hosino-console-client#1](https://github.com/958639806/hosino-console-client/issues/1).
The existing website keeps its Cookie login. Gateway credentials remain on the server.

## Running and configuration

Use Node 22+, `npm ci`, `npm run check`, `npm test`, then the existing server launch
configuration (`LOGIN_HASH`, gateway settings and TLS certificate pinning remain required).
No production restart or deployment is part of this change.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HS_MOBILE_DATA` | `data/mobile` beside server | Private durable device hashes, request receipts, and CLI run records. Back up and retain this directory across upgrades. |
| `HS_MOBILE_ORIGINS` | `https://localhost` | Comma-separated exact WebView Origin allowlist. No wildcard or reflected origins. Add a development browser origin explicitly when needed. |
| `HS_MOBILE_CLI_ENABLED` | disabled | Set `1` or `true` to authorize owner devices to use remote CLI. This is a high privilege server decision. |
| `CLI_HOME` | `/home/ubuntu` | Server-side CLI user home and executable lookup root; fixtures use an isolated directory. Does not change the systemd launch UID. |

Only one server process may own a mobile data directory. Replicated deployments need
a transactional shared database before enabling these APIs. State is committed by
writing a private temporary file, fsync, rename, and directory fsync; malformed existing
state fails startup. Credentials are stored as SHA-256 hashes, never plaintext.
Request/run records have no automatic retention removal in v1; disk usage needs monitoring.
Deleting records or restoring an older backup loses deduplication evidence. Never use
that as a reason to automatically retry an uncertain execution.

## Authentication and origin rules

All API writes (`POST`, `DELETE`) require `X-HS: 1`. Device requests use
`Authorization: Bearer <accessToken>` and omit Cookie credentials. Never put device
tokens into media URLs. Invalid bearer credentials fail closed even if a valid website
Cookie is also present. Allowed CORS methods are GET/POST/DELETE; preflight allows
Authorization, Content-Type, X-HS, Range and X-Filename. Headers also apply to errors,
SSE and binary responses. JSON, raw uploads and protected downloads share device identity.

| Route | Request | Response |
| --- | --- | --- |
| GET `/api/mobile/capabilities` | Public; bearer optional | `{apiVersion:1,build:"mobile-v1",auth:["device-bearer"],modules:{overview:true,sessions:true,chat:true,uploads:true,cli:true,management:false},permissions:{cli:boolean},limits:{uploadMaxBytes,maxPerMessage}}` |
| POST `/api/mobile/login` | `{password,deviceName}` | `{device:{id,name},accessToken,refreshToken,accessExpiresAt,refreshExpiresAt}` |
| POST `/api/mobile/refresh` | `{refreshToken}` | Rotated pair in the same shape; both old tokens stop working. |
| POST `/api/mobile/logout` | Device bearer | `{ok:true}`; revokes the device's access and refresh credentials. |
| GET `/api/mobile/devices` | Owner Cookie or device bearer | `{devices:[{id,name,createdAt,updatedAt,revokedAt}]}`; no credentials or hashes. |
| DELETE `/api/mobile/devices/:id` | Owner Cookie or device bearer | `{ok:true}`; remote revocation. |

Times are integer epoch milliseconds. Access lifetime is 15 minutes; refresh lifetime
is 30 days and renews on rotation. Public capabilities always reports `permissions.cli=false`.
Authenticated device CLI permission additionally requires the explicit server setting.
An available module is distinct from permission to execute it.

401 `AUTH_EXPIRED` means credential expiry; 401 `AUTH_REVOKED` means missing, invalid,
rotated or revoked credentials; 403 `FORBIDDEN` covers origin, CSRF and device CLI denial.
Mobile login uses the existing password lockout. A lost refresh response requires a
new login because rotation invalidated the old refresh credential. Network errors
must not be interpreted as credential revocation or clear local credentials.

## Sending and request receipts

Device POST `/api/send` retains `{key,message,deliver,attachments?:string[]}` and adds
required `requestId` (8–128 ASCII letters, digits, `_`, `-`, beginning alphanumeric).
Generate and persist the ID before sending. Device CLI POST
`/api/cli/sessions/:id/run` similarly adds `requestId` to `{prompt,attachments?}`.
Cookie clients keep their old behavior.

Receipts are scoped to this server's owner and request ID. Operation, target session
and canonical payload are hashed into an immutable fingerprint. Another device for
the same owner can query/replay the receipt. Different operation, target or payload
with the same ID produces 409 `request_conflict`. Concurrent duplicates cannot
dispatch the same request twice. A request and its stable downstream gateway key are
durably recorded before dispatch.

GET `/api/mobile/requests/:requestId` requires device bearer and returns:

```json
{
  "requestId": "client-generated-uuid",
  "operation": "chat.send",
  "session": "agent:main:main",
  "state": "completed",
  "createdAt": 1800000000000,
  "updatedAt": 1800000001000,
  "status": 200,
  "result": { "runId": "gateway-run-id" }
}
```

| State | Meaning and retry behavior |
| --- | --- |
| `pending` | The request was admitted. A duplicate returns 409 `request_pending`; query instead of launching again. |
| `completed` | The submission response is stored. A duplicate returns its original status/result. This does **not** mean remote execution finished. |
| `failed` | A known HTTP failure is stored; duplicate returns the same failure. `error`, `code`, and `status` describe it. |
| `unknown` | Dispatch may have happened, but result is unconfirmed. Duplicate returns 409 `request_unknown` and never dispatches again. |

On startup, pending records become unknown. Ambiguous downstream failures remain
unknown. A durable admission-before-dispatch crash can produce unknown even when
nothing ran; this conservative outcome is intentional. The server does not promise
exactly-once downstream effects. Do not create a fresh request ID automatically after
timeout, offline transitions, process reconstruction, or missing receipt. A 404 receipt
does not prove a historical request never executed (for example after data loss).

## CLI observation and lifecycle

CLI run still uses POST + incremental SSE (`start`, `delta`, `tool`, `error`, `done`).
Disconnecting SSE does not cancel the remote process. Only explicit POST
`/api/cli/sessions/:id/cancel` requests cancellation. Never rerun POST to reconnect.

GET `/api/cli/sessions/:id` and list results extend the existing `session` with:

```json
{
  "activeRun": null,
  "lastRun": {
    "sessionId": "0123456789abcdef",
    "runId": "0123456789ab",
    "requestId": "client-generated-uuid",
    "state": "completed",
    "startedAt": 1800000000000,
    "finishedAt": 1800000001000,
    "exitCode": 0,
    "reason": null
  }
}
```

States: `running`, `completed`, `failed`, `cancelled`, `interrupted`. On server restart
previous `running` records become `interrupted` with reason `server_restarted`.
This means server observation was lost; an independent OS task might still exist.
The server does not reattach to surviving systemd/CLI processes or automatically
resubmit their prompts. Query history and report uncertainty. CLI receipts store the
accepted `{sessionId,runId,state:"running"}` before launch; terminal outcome is in
`lastRun`, including launch failure. Replaying an accepted CLI ID returns that cached
JSON receipt, not a new SSE observation stream.

## Validation boundary

`npm test` uses temporary state and an isolated local fixture gateway. It covers durable
credentials, rotation/revocation, request conflicts and restart ambiguity, CLI record
states, origin/CSRF checks and real HTTP routing. A temporary fake CLI executable also
checks real POST SSE incremental delivery, duplicate launch prevention, observation
disconnect, explicit cancellation and restart ambiguity. It does not establish production
compatibility, Android device behavior, installed CLI tools or actual QQ delivery.
Those remain separate authorized test-service and Android device verification.
