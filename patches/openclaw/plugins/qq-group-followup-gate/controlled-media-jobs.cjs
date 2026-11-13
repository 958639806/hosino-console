"use strict";
/* QQ-CONTROLLED-MEDIA-JOBS v1: no timers/daemon/fork supervisor; existing Gateway supervisor/events only. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const KEY = Symbol.for("openclaw.qqControlledMediaJobs.v1");
const PREFIX = "[OpenClaw controlled media completion]";
const hash = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
function fault(code) { return Object.assign(new Error(code), { code }); }
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`;
  let descriptor;
  try { descriptor = fs.openSync(temporary, "wx", 0o600); fs.writeFileSync(descriptor, JSON.stringify(value)); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined; fs.renameSync(temporary, file); if (process.platform !== "win32") { const directory = fs.openSync(path.dirname(file), "r"); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); } } }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); try { fs.unlinkSync(temporary); } catch {} }
}
function load(file) { const bytes = fs.readFileSync(file); if (bytes.length > 262144) throw fault("MEDIA_JOB_RECORD_TOO_LARGE"); return JSON.parse(bytes.toString("utf8")); }
function tokens(command) {
  if (typeof command !== "string" || command.length > 24000 || /[\n\r;|&`]|\$\(|[<>]/.test(command)) return;
  const out = []; let token = "", quote = null, started = false;
  for (let i = 0; i < command.length; i++) { const c = command[i]; if (quote) { if (c === quote) quote = null; else if (c === "\\" && quote === '"') token += command[++i] || ""; else token += c; started = true; } else if (c === "'" || c === '"') { quote = c; started = true; } else if (/\s/.test(c)) { if (started) out.push(token); token = ""; started = false; } else if (c === "\\") { token += command[++i] || ""; started = true; } else { token += c; started = true; } }
  if (quote) return; if (started) out.push(token); return out;
}
// QQ-VOICE-NATURAL-TIMING v1. Fixed diagnostics never participate in authorization,
// receipt verification, delivery, failure classification or retry decisions.
function voiceTimingFromOutcome(outcome) {
  try {
    const prefix = "XINGYE_VOICE_TIMING_V1 ";
    const lines = typeof outcome?.stderr === "string" ? outcome.stderr.slice(0, 8192).split("\n").filter(line => line.startsWith(prefix)) : [];
    if (lines.length !== 1 || lines[0].length > 4096) return;
    const raw = JSON.parse(lines[0].slice(prefix.length));
    const number = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 3600000;
    const providers = new Set(["fish", "mimo", "xai", "unknown"]);
    const stages = new Set(["fish_request", "fish_headers", "fish_body", "fish_concat", "mimo_request", "mimo_encode", "xai_gateway", "publication", "audio_probe", "wav_conversion", "atomic_publish"]);
    if (raw?.schema !== "xingye-voice-timing-v1" || !["ok", "error", "uncertain"].includes(raw.state) || !number(raw.elapsedMs) || !providers.has(raw.requestedProvider) || !providers.has(raw.completedProvider) || typeof raw.fallback !== "boolean" || !Array.isArray(raw.phases) || raw.phases.length > stages.size) return;
    const seen = new Set(), phases = [];
    for (const phase of raw.phases) {
      if (!stages.has(phase?.stage) || seen.has(phase.stage) || !number(phase.ms) || !Number.isInteger(phase.count) || phase.count < 1 || phase.count > 4096) return;
      seen.add(phase.stage); phases.push({ stage: phase.stage, ms: phase.ms, count: phase.count });
    }
    return { schema: "xingye-voice-timing-v1", state: raw.state, elapsedMs: raw.elapsedMs, requestedProvider: raw.requestedProvider, completedProvider: raw.completedProvider, fallback: raw.fallback, phases };
  } catch { return; }
}
function createManager(config = {}, dependencies = {}) {
  const stateRoot = config.stateRoot || path.join(os.homedir(), ".openclaw", "qqbot", "controlled-media-jobs");
  const scriptsRoot = config.scriptsRoot || path.join(os.homedir(), ".openclaw", "workspace", "scripts");
  const workRoot = config.workRoot || path.join(os.tmpdir(), "openclaw-controlled-media");
  const artifactRoot = config.artifactRoot || path.join(os.homedir(), ".openclaw", "media", "controlled-jobs");
  const now = dependencies.now || Date.now;
  const groups = new Set((config.groups || []).map(value => String(value).toLowerCase()));
  const handles = new Map(), transports = new Map(), queuedEvents = new Map(), deliveries = new Map(), waiters = new Map(), failureNotices = new Map();
  const unresolvedScopes = new Set();
  let active = false, stopping = false, starting = false, lifecycleTask;
  const log = dependencies.log || (() => {});
  const originFile = key => path.join(stateRoot, "origins", key + ".json");
  const jobFile = id => path.join(stateRoot, "jobs", id + ".json");
  const resultFile = id => path.join(stateRoot, "results", id + ".json");
  const validateOrigin = origin => origin && origin.v === 1 && /^[a-f0-9]{64}$/.test(origin.actorHash) && typeof origin.accountId === "string" && origin.accountId && origin.scope === "group" && groups.has(origin.targetId) && typeof origin.rawSourceId === "string" && origin.rawSourceId && typeof origin.sessionKey === "string" && origin.sessionKey.endsWith(`:qqbot:group:${origin.targetId}`) && Number.isFinite(origin.receivedAt);
  const validateJob = job => job?.v === 1 && /^[a-f0-9]{64}$/.test(job.id) && job.id === hash(JSON.stringify([job.origin?.accountId, job.origin?.targetId, job.origin?.rawSourceId, job.recipe?.kind])) && validateOrigin(job.origin) && /^[a-f0-9]{64}$/.test(job.capNonce) && hash(job.capNonce) === job.capHash && /^[a-f0-9]{64}$/.test(job.recipe?.scriptSha) && ["voice", "image"].includes(job.recipe.kind) && ["queued", "starting", "running", "succeeded", "cancelled", "uncertain"].includes(job.state) && job.recipe.output === path.join(workRoot, job.id, "output." + job.recipe.ext);
  const save = job => { job.updatedAt = now(); atomic(jobFile(job.id), job); };
  const get = id => { if (!/^[a-f0-9]{64}$/.test(String(id))) throw fault("MEDIA_JOB_ID_INVALID"); const job = load(jobFile(id)); if (!validateJob(job)) throw fault("MEDIA_JOB_RECORD_INVALID"); return job; };
  function jobs() { let files; try { files = fs.readdirSync(path.join(stateRoot, "jobs")); } catch (error) { if (error.code === "ENOENT") return []; throw error; } const names = files.filter(file => /^[a-f0-9]{64}\.json$/.test(file)); if (names.length > 2048) throw fault("MEDIA_JOB_STORE_CAPACITY"); return names.map(file => get(file.slice(0, -5))); }
  function registerInbound(value) {
    if (config.enabled !== true || !value?.accountId || !value.senderId || !value.sourceId || value.scope !== "group" || !groups.has(String(value.targetId).toLowerCase())) return;
    const origin = { v: 1, accountId: value.accountId, scope: value.scope, targetId: String(value.targetId).toLowerCase(), target: `qqbot:group:${String(value.targetId).toLowerCase()}`, actorHash: hash(value.senderId), rawSourceId: value.sourceId, receivedAt: Math.min(now(), value.receivedAt), sessionKey: value.sessionKey, agentId: value.agentId || "main" };
    if (!validateOrigin(origin) || !origin.sessionKey.endsWith(`:qqbot:group:${origin.targetId}`)) throw fault("MEDIA_ORIGIN_ROUTE_INVALID");
    const aliases = [...new Set([value.sourceId, ...(value.aliases || [])].filter(value => typeof value === "string" && value.length > 0 && value.length < 1024))];
    let canonical;
    for (const alias of aliases) {
      const key = hash(JSON.stringify([origin.accountId, alias])); let old;
      try { old = load(originFile(key)); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (old && (!validateOrigin(old) || old.actorHash !== origin.actorHash || old.rawSourceId !== origin.rawSourceId || old.targetId !== origin.targetId || old.sessionKey !== origin.sessionKey)) throw fault("MEDIA_ORIGIN_IMMUTABLE_CONFLICT");
      if (old) canonical = old;
      if (!old) atomic(originFile(key), canonical || origin);
    }
    return canonical || origin;
  }
  function originFor(requester, context) {
    if (requester?.trigger !== "user" || requester.channel !== "qqbot" || !requester.accountId || !requester.sourceMessageId || !requester.senderId) throw fault("MEDIA_ORIGIN_GUARD_NOT_READY");
    let origin; try { origin = load(originFile(hash(JSON.stringify([requester.accountId, requester.sourceMessageId])))); } catch { throw fault("MEDIA_ORIGIN_GUARD_NOT_READY"); }
    if (!validateOrigin(origin) || origin.actorHash !== hash(requester.senderId) || origin.sessionKey !== context?.sessionKey || !groups.has(origin.targetId)) throw fault("MEDIA_ORIGIN_ACTOR_SOURCE_MISMATCH");
    return origin;
  }
  function parse(command, cwd) {
    const argv = tokens(command); if (!argv || !/^(?:python3?|\/usr\/bin\/python3?)$/.test(argv[0] || "")) return;
    const script = path.resolve(cwd || scriptsRoot, argv[1] || ""), name = path.basename(script);
    const profile = { "xingye_voice.py": { kind: "voice", flag: "--out", ext: "mp3", budget: 240000 }, "xingye_tts.py": { kind: "voice", flag: "--out", ext: "mp3", budget: 240000 }, "grok_imagine.py": { kind: "image", flag: "--output", ext: "png", budget: 600000 } }[name];
    if (!profile) return;
    if (!fs.existsSync(script) || fs.realpathSync(script) !== fs.realpathSync(path.join(scriptsRoot, name))) throw fault("MEDIA_WRAPPER_PATH_NOT_ADMITTED");
    const input = argv.slice(2); if (input.includes("--check") || input.includes("--help")) return;
    const allowed = name === "grok_imagine.py" ? { "--model": 1, "--aspect": 1, "--quality": 0, "--timeout": 1, "--output": 1, "-o": 1 } : { "--style": 1, "--voice": 1, "--voice-alias": 1, "--model": 1, "--out": 1, ...name === "xingye_tts.py" ? { "--format": 1, "--repeat": 1 } : {} };
    const args = []; let positional = 0, text, afterSeparator = false;
    for (let i = 0; i < input.length; i++) {
      const arg = input[i]; if (arg === "--") { afterSeparator = true; continue; }
      if (!afterSeparator && arg.startsWith("-")) { if (!(arg in allowed)) throw fault("MEDIA_WRAPPER_ARGUMENT_UNSUPPORTED"); const count = allowed[arg]; const value = count ? input[++i] : undefined; if (count && value === undefined) throw fault("MEDIA_WRAPPER_ARGUMENT_MISSING"); if (["--out", "--output", "-o", "--timeout"].includes(arg)) continue; if (arg === "--format" && value !== "mp3") throw fault("MEDIA_WRAPPER_FORMAT_UNSUPPORTED"); if (arg === "--repeat" && value !== "1") throw fault("MEDIA_WRAPPER_REPEAT_UNSUPPORTED"); args.push(arg); if (count) args.push(value); }
      else { if (++positional > 1 || arg.length > 16000) throw fault("MEDIA_WRAPPER_INPUT_INVALID"); text = arg; afterSeparator = false; }
    }
    if (positional !== 1) throw fault("MEDIA_WRAPPER_INPUT_MISSING");
    if (name === "xingye_tts.py" && !args.includes("--format")) args.push("--format", "mp3");
    const scriptSha = hash(fs.readFileSync(script));
    if (config.expectedScriptHashes?.[name] !== scriptSha) throw fault("MEDIA_WRAPPER_HASH_NOT_ADMITTED");
    return { ...profile, script, scriptSha, dependencies: dependenciesFor(name), args, text, requestHash: hash(JSON.stringify([name, args, text])) };
  }
  function dependenciesFor(name) {
    return (name === "xingye_voice.py" ? ["xingye_tts.py", "media_deadline.py"] : ["media_deadline.py"]).map(name => { const file = fs.realpathSync(path.join(scriptsRoot, name)), sha256 = hash(fs.readFileSync(file)); if (config.expectedScriptHashes?.[name] !== sha256) throw fault("MEDIA_WRAPPER_DEPENDENCY_NOT_ADMITTED"); return { path: file, sha256 }; });
  }
  function verifiedArtifact(job) {
    let receipt; try { receipt = load(resultFile(job.id)); } catch { return; }
    if (receipt?.v !== 1 || receipt.jobId !== job.id || receipt.scriptSha !== job.recipe.scriptSha || path.resolve(receipt.path) !== path.resolve(job.recipe.output)) return;
    const canonical = JSON.stringify([job.id, job.recipe.scriptSha, receipt.path, receipt.bytes, receipt.sha256]);
    const expected = crypto.createHmac("sha256", job.capNonce).update(canonical).digest("hex");
    if (receipt.signature !== expected) return;
    let data; try { data = fs.readFileSync(receipt.path); } catch { return; }
    if (data.length !== receipt.bytes || data.length < 3 || data.length > 32 * 1024 * 1024 || hash(data) !== receipt.sha256) return;
    if (job.recipe.kind === "voice" && !(data.subarray(0, 3).toString() === "ID3" || data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return;
    if (job.recipe.kind === "image" && !(data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data[0] === 0xff && data[1] === 0xd8)) return;
    const durable = path.join(artifactRoot, job.id + "." + job.recipe.ext);
    fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(durable)) { const temporary = durable + "." + crypto.randomBytes(6).toString("hex") + ".tmp"; const fd = fs.openSync(temporary, "wx", 0o600); try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(temporary, durable); }
    if (hash(fs.readFileSync(durable)) !== receipt.sha256) throw fault("MEDIA_DURABLE_ARTIFACT_CONFLICT");
    return { path: durable, sha256: receipt.sha256, bytes: receipt.bytes, kind: job.recipe.kind };
  }
  const queueKey = origin => `agent:${origin.agentId}:qq-media-job-events:${hash(origin.accountId).slice(0, 16)}`;
  async function notify(job) {
    const key = queueKey(job.origin), text = `${PREFIX} ${job.id}`;
    const entry = await dependencies.enqueue(text, { sessionKey: key, contextKey: `controlled-media:${job.id}`, replace: true });
    if (entry) queuedEvents.set(job.id, { key, entry });
    dependencies.wake({ sessionKey: key, agentId: job.origin.agentId, source: "exec-event", intent: "event", reason: "controlled-media-completion", coalesceMs: 0, heartbeat: { target: "none" } });
    // Deliver on the existing settlement callback immediately. The queued event
    // remains the wake/recovery path; a busy model turn cannot delay a ready ACK.
    if (active && !stopping) await drain().catch(error => log(`media delivery deferred code=${error.code || "unknown"}`));
  }
  // Voice failure facts are fixed enums. Keep the original job-state schema so
  // the previous manager can still read records after a code-only rollback.
  const FAILURE_NOTICE_SCHEMA = "qq-voice-failure-notice-v1";
  const FAILURE_FACT_SCHEMA = "qq-voice-generation-failure-v1";
  const FAILURE_CODES = new Set(["tts_http_deadline_exceeded", "tts_total_deadline_exceeded", "tts_response_too_large", "audio_format_invalid", "mp3_conversion_failed", "mp3_encoder_failed", "http_401", "http_402", "http_403", "http_429", "http_5xx", "voice_generation_failed"]);
  const FAILURE_NOTICE_STATES = new Set(["pending", "awaiting-transport", "awaiting-request", "in-flight", "confirmed", "uncertain", "not-sent"]);
  function confirmedGenerationFailure(job) {
    return job.recipe.kind === "voice" && !job.result && !job.cancelRequested &&
      job.state === "uncertain" && job.processState === "terminated" &&
      ["pending", "awaiting-transport"].includes(job.delivery?.state || "pending") &&
      job.outcome?.reason === "exit" && Number.isInteger(job.outcome.exitCode) && job.outcome.exitCode !== 0;
  }
  function fixedGenerationErrorCode(outcome) {
    const codes = new Set();
    for (const field of [outcome?.stdout, outcome?.stderr]) {
      const raw = typeof field === "string" ? field : Buffer.isBuffer(field) ? field.toString("utf8") : "";
      if (!raw || Buffer.byteLength(raw) > 8192) continue;
      for (const line of raw.split(/\r?\n/)) {
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (!value || Array.isArray(value) || value.status !== "error" || typeof value.error !== "string") continue;
        const error = value.error;
        const fixed = /^(tts_http_deadline_exceeded|tts_total_deadline_exceeded|tts_response_too_large|audio_format_invalid|mp3_conversion_failed)(?::|$)/.exec(error);
        const http = /^HTTP Error (401|402|403|429|5[0-9]{2})(?:\b|:)/.exec(error);
        if (fixed) codes.add(fixed[1]);
        else if (/^mp3_encoder_[a-z0-9_]+(?::|$)/.test(error)) codes.add("mp3_encoder_failed");
        else if (http) codes.add(http[1][0] === "5" ? "http_5xx" : "http_" + http[1]);
        else codes.add("voice_generation_failed");
      }
    }
    return codes.size === 1 ? [...codes][0] : "voice_generation_failed";
  }
  function failureEligible(job) {
    return job.failureNotice?.schema === FAILURE_NOTICE_SCHEMA &&
      job.generationFailure?.schema === FAILURE_FACT_SCHEMA && confirmedGenerationFailure(job);
  }
  async function notifyFailureStatus(id, origin) {
    const job = get(id);
    if (!authorized(job, origin) || origin.rawSourceId !== job.origin.rawSourceId) throw fault("MEDIA_JOB_NOT_FOUND_OR_NOT_OWNED");
    if (failureNotices.has(id)) return await failureNotices.get(id);
    const pending = failureNoticeOnce(job); failureNotices.set(id, pending);
    try { return await pending; } finally { if (failureNotices.get(id) === pending) failureNotices.delete(id); }
  }
  async function failureNoticeOnce(snapshot) {
    let job = get(snapshot.id);
    if (!failureEligible(job)) return { state: "not-eligible" };
    if (!active || stopping) return { state: "gateway-stopped" };
    const origin = job.origin, operationId = `controlled-media-failure:${job.id}`;
    const transport = transports.get(origin.accountId);
    if (job.failureNotice.state === "confirmed") return { state: "confirmed", reused: true };
    if (["in-flight", "uncertain"].includes(job.failureNotice.state)) {
      let receipt; try { receipt = await transport?.peekFailureStatus?.(job, origin, { operationId }); } catch {}
      job = get(job.id);
      if (receipt?.messageId) job.failureNotice = { ...job.failureNotice, state: "confirmed", messageId: receipt.messageId, confirmedAt: now() };
      else job.failureNotice = { ...job.failureNotice, state: "uncertain" };
      save(job); return { state: job.failureNotice.state };
    }
    if (!["pending", "awaiting-transport"].includes(job.failureNotice.state)) return { state: job.failureNotice.state };
    if (origin.receivedAt + 240000 <= now()) { job.failureNotice.state = "awaiting-request"; save(job); return { state: "awaiting-request" }; }
    if (typeof transport?.sendFailureStatus !== "function") { job.failureNotice.state = "awaiting-transport"; save(job); return { state: "awaiting-transport" }; }
    job.failureNotice = { ...job.failureNotice, state: "in-flight", operationId, startedAt: now() }; save(job);
    let result; try { result = await transport.sendFailureStatus(job, origin, { operationId, kind: "voice-generation-failed" }); }
    catch (error) { result = { sendState: error?.sendState === "not-sent" ? "not-sent" : "uncertain" }; }
    job = get(job.id);
    if (typeof result?.messageId === "string" && result.messageId && !result.error && !result.suppressed) job.failureNotice = { ...job.failureNotice, state: "confirmed", messageId: result.messageId, confirmedAt: now() };
    else job.failureNotice = { ...job.failureNotice, state: result?.sendState === "not-sent" ? "not-sent" : "uncertain" };
    save(job); return { state: job.failureNotice.state };
  }
  async function settle(job, run, release) {
    let outcome, cleanupConfirmed = false;
    try { outcome = await run.wait(); if (run.waitForExtinction) await run.waitForExtinction(); } catch { /* wait failure is not proof of extinction */ }
    // Always try the exact acquired scope cleanup, even when its waiter failed.
    try { await release(); cleanupConfirmed = true; } catch { unresolvedScopes.add(job.id); }
    const current = get(job.id), artifact = verifiedArtifact(current);
    if (current.recipe.kind === "voice") { const timing = voiceTimingFromOutcome(outcome); if (timing) current.generationTiming = timing; }
    if (artifact) { current.result = artifact; current.state = "succeeded"; current.processState = cleanupConfirmed ? "terminated" : "uncertain"; }
    else { current.state = current.cancelRequested && cleanupConfirmed ? "cancelled" : "uncertain"; current.processState = cleanupConfirmed ? "terminated" : "uncertain"; current.outcome = { exitCode: outcome?.exitCode ?? null, reason: outcome?.reason || "unconfirmed" }; }
    if (confirmedGenerationFailure(current)) {
      current.generationFailure = { schema: FAILURE_FACT_SCHEMA, code: fixedGenerationErrorCode(outcome) };
      // Mark only failures settled by this revision. Recovery must not broadcast
      // historical failed records when the code is installed or restarted.
      current.failureNotice ??= { schema: FAILURE_NOTICE_SCHEMA, state: "pending" };
    }
    save(current);
    if (cleanupConfirmed) { handles.delete(job.id); unresolvedScopes.delete(job.id); }
    for (const resolve of waiters.get(job.id) || []) resolve(); waiters.delete(job.id);
    if (active && !stopping && current.deliveryEnabled && !current.cancelRequested) {
      if (current.result) await notify(current);
      else if (failureEligible(current)) await notifyFailureStatus(current.id, current.origin);
    }
    void kick();
  }
  async function executeJobLifecycle(selected) {
    let job = get(selected.id), release, run;
    if (!active || stopping || job.state !== "queued") return;
    try {
      if (hash(fs.readFileSync(job.recipe.script)) !== job.recipe.scriptSha) { job.state = "uncertain"; job.processState = "not-started"; save(job); return; }
      const supervisor = await dependencies.supervisor(); job = get(job.id); if (!active || stopping || job.cancelRequested || job.state !== "queued") return; release = supervisor.acquireScopeCleanup(`controlled-media:${job.id}`, { processTree: "required-all" });
      job.state = "starting"; job.processState = "starting"; save(job);
      run = await supervisor.spawn({ mode: "child", runId: job.id, scopeKey: `controlled-media:${job.id}`, argv: [config.python || "python3", config.runner || path.join(__dirname, "controlled_media_runner.py"), jobFile(job.id)], cwd: path.dirname(job.recipe.script), env: { ...process.env, OPENCLAW_CONTROLLED_JOB_NONCE: job.capNonce, OPENCLAW_MEDIA_BUDGET: String(job.recipe.budget / 1000) }, timeoutMs: job.recipe.budget, captureOutput: true, maxCapturedOutputChars: 8192, assertCurrent: () => { if (!active || stopping || get(job.id).cancelRequested) throw fault("MEDIA_JOB_GATEWAY_DRAINING"); } });
      job = get(job.id); job.state = "running"; job.processState = "running"; job.pid = run.pid; job.startedAt = now(); save(job); handles.set(job.id, { run, release });
      if (!active || stopping || job.cancelRequested) run.cancel("manual-cancel");
    } catch (error) {
      let cleanupConfirmed = !release;
      if (release) { try { await release(); cleanupConfirmed = true; } catch { if (job) unresolvedScopes.add(job.id); } }
      if (job) { job = get(job.id); job.state = "uncertain"; job.processState = cleanupConfirmed ? release ? "terminated" : "not-started" : "startup-unconfirmed"; job.errorCode = error.code || "MEDIA_JOB_START_FAILED"; save(job); }
      log(`media-job startup failed code=${error.code || "unknown"}`);
    }
    // The official detached continuation must own the entire physical process
    // lifetime. Returning after spawn would drain its new AsyncWorkScope early.
    if (run) await settle(job, run, release).catch(error => log(`media-job settlement failed id=${job.id.slice(0, 12)} code=${error.code || "unknown"}`));
  }
  async function kick() {
    if (!active || stopping || starting || handles.size >= 1 || unresolvedScopes.size > 0) return;
    starting = true;
    let continueQueue = true;
    try {
      const selected = jobs().filter(job => job.state === "queued").sort((a, b) => a.createdAt - b.createdAt)[0]; if (!selected) return;
      if (typeof dependencies.runDetached !== "function") throw fault("MEDIA_JOB_DETACHED_RUNTIME_NOT_READY");
      // Host-selected producer/source is already durable. The official API
      // synchronously reserves a new tracked root and fresh async lifetime.
      lifecycleTask = Promise.resolve(dependencies.runDetached(() => executeJobLifecycle(selected), `qq-media-job:${selected.id}`));
      await lifecycleTask;
    } catch (error) {
      // Admission/runtime failures before launch leave the durable job queued.
      // Never busy-loop, clear an uncertainty fence or retry a started effect.
      continueQueue = false;
      log(`media-job detached lifecycle failed code=${error.code || "unknown"}`);
    } finally {
      lifecycleTask = undefined; starting = false;
      if (continueQueue && active && !stopping && handles.size === 0 && unresolvedScopes.size === 0 && jobs().some(job => job.state === "queued")) queueMicrotask(() => void kick());
    }
  }
  async function submit(origin, recipe, options = {}) {
    if (!active || stopping || !validateOrigin(origin) || !groups.has(origin.targetId)) throw fault("MEDIA_JOB_GUARD_NOT_READY");
    const id = hash(JSON.stringify([origin.accountId, origin.targetId, origin.rawSourceId, recipe.kind])); let existing;
    try { existing = get(id); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing) return submissionStatus(existing, existing.recipe.requestHash !== recipe.requestHash);
    if (origin.receivedAt + 180000 <= now()) throw fault("MEDIA_ORIGINAL_TURN_BUDGET_EXPIRED");
    if (jobs().length >= 2048) throw fault("MEDIA_JOB_STORE_CAPACITY");
    if (jobs().filter(job => ["queued", "starting", "running"].includes(job.state)).length >= 64) throw fault("MEDIA_JOB_QUEUE_FULL");
    const capNonce = crypto.randomBytes(32).toString("hex"), output = path.join(workRoot, id, "output." + recipe.ext);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    const job = { v: 1, id, origin, capNonce, capHash: hash(capNonce), state: "queued", processState: "not-started", deliveryEnabled: options.autoDelivery !== false, createdAt: now(), authorizedAt: now(), recipe: { ...recipe, output, args: [...recipe.args, recipe.flag, output, ...recipe.kind === "image" ? ["--timeout", "590"] : [], "--", recipe.text] }, delivery: { state: "pending" } };
    save(job); void kick(); return submissionStatus(job);
  }
  // Model-facing submission guidance only: approval, source ownership, job identity,
  // durable state and delivery stay in their original host paths. Manual controls
  // and taggedVoice(autoDelivery:false) retain their existing contracts.
  function submissionStatus(job, conflict) {
    const status = { ...publicStatus(job), ...(conflict === undefined ? {} : { conflict }) };
    if (conflict || job.deliveryEnabled !== true || job.cancelRequested === true) return status;
    if (["queued", "starting", "running"].includes(job.state) && ["pending", "awaiting-transport"].includes(status.deliveryState)) {
      status.modelContinuation = "await-host-delivery-receipt";
      status.modelPollRequired = false;
      status.modelSendRequired = false;
    } else if (job.state === "succeeded" && status.deliveryState === "confirmed") {
      status.modelContinuation = "delivery-confirmed";
      status.modelPollRequired = false;
      status.modelSendRequired = false;
    }
    return status;
  }
  function publicStatus(job) { return { generationFailureConfirmed: confirmedGenerationFailure(job), generationErrorCode: confirmedGenerationFailure(job) ? FAILURE_CODES.has(job.generationFailure?.code) ? job.generationFailure.code : "voice_generation_failed" : null, failureNoticeState: job.failureNotice?.schema === FAILURE_NOTICE_SCHEMA ? FAILURE_NOTICE_STATES.has(job.failureNotice.state) ? job.failureNotice.state : "uncertain" : null, hasResult: !!job.result, jobId: job.id, kind: job.recipe.kind, state: job.state, deliveryState: job.delivery?.state || "pending", processState: job.processState, queueHeldForCleanup: job.state === "queued" && unresolvedScopes.size > 0, cancelRequested: job.cancelRequested === true, createdAt: job.createdAt }; }
  function authorized(job, origin) { return job.origin.accountId === origin.accountId && job.origin.targetId === origin.targetId && job.origin.actorHash === origin.actorHash; }
  function resolveOwned(selector, origin) { const found = jobs().filter(job => authorized(job, origin) && job.id.startsWith(String(selector))); if (found.length !== 1 || String(selector).length < 12) throw fault("MEDIA_JOB_NOT_FOUND_OR_NOT_OWNED"); return found[0]; }
  async function deliver(job, origin, explicit = false) {
    if (!authorized(job, origin)) throw fault("MEDIA_JOB_NOT_FOUND_OR_NOT_OWNED");
    const operationKey = job.id + ":" + hash(origin.rawSourceId) + ":" + explicit;
    if (deliveries.has(operationKey)) return await deliveries.get(operationKey);
    const promise = deliverOnce(job, origin, explicit); deliveries.set(operationKey, promise);
    try { return await promise; } finally { if (deliveries.get(operationKey) === promise) deliveries.delete(operationKey); }
  }
  async function deliverOnce(job, origin, explicit = false) {
    const transport = transports.get(origin.accountId); if (!transport) return { state: "awaiting-transport" };
    if (!explicit && ["in-flight", "uncertain"].includes(job.delivery.state)) {
      await reconcile(job);
      if (job.delivery.state === "confirmed") return { state: "confirmed", reused: true };
      job.delivery.state = "uncertain"; save(job); return { state: "uncertain" };
    }
    if (!explicit && job.delivery.state === "confirmed") return { state: "confirmed", reused: true };
    if (origin.receivedAt + 240000 <= now()) { job.delivery.state = "awaiting-request"; save(job); return { state: "awaiting-request" }; }
    if (job.cancelRequested || !job.result) return { state: job.state };
    try { if (hash(fs.readFileSync(job.result.path)) !== job.result.sha256) throw fault("MEDIA_RESULT_HASH_MISMATCH"); }
    catch { job.delivery.state = "missing-artifact"; save(job); return { state: "missing-artifact" }; }
    const operationId = explicit ? `explicit-media:${job.id}:${hash(origin.rawSourceId)}` : `controlled-media:${job.id}`;
    job.delivery = { state: "in-flight", claimSourceHash: hash(origin.rawSourceId), claimOrigin: origin, operationId, startedAt: now() }; save(job);
    let result; try { result = await transport.send(job, origin, { operationId }); } catch (error) { result = { error: error.code || "MEDIA_SEND_UNKNOWN", sendState: error.sendState || "uncertain" }; }
    job = get(job.id);
    if (result?.messageId && !result.error) job.delivery = { state: "confirmed", messageId: result.messageId, confirmedAt: now() };
    else job.delivery = { state: result?.sendState === "not-sent" ? "awaiting-request" : "uncertain", claimOrigin: origin, operationId, errorCode: result?.errorCode || "MEDIA_ACK_UNCONFIRMED" };
    save(job); return { state: job.delivery.state };
  }
  async function reconcile(job) {
    if (!["in-flight", "uncertain"].includes(job.delivery.state)) return;
    const origin = job.delivery.claimOrigin || job.origin;
    if (!validateOrigin(origin) || !authorized(job, origin)) throw fault("MEDIA_DELIVERY_CLAIM_INVALID");
    const transport = transports.get(origin.accountId); if (!transport) return;
    const receipt = await transport.peek(job, origin);
    if (receipt?.messageId) { job.delivery = { state: "confirmed", messageId: receipt.messageId, recoveredAt: now() }; save(job); }
  }
  async function drain() {
    for (const job of jobs().filter(job => job.result && job.deliveryEnabled && !job.cancelRequested && !["confirmed", "uncertain", "awaiting-request"].includes(job.delivery.state))) await deliver(job, job.origin);
    for (const job of jobs().filter(job => job.deliveryEnabled && failureEligible(job))) await notifyFailureStatus(job.id, job.origin);
    for (const [id, receipt] of queuedEvents) { await dependencies.remove(receipt.key, receipt.entry); queuedEvents.delete(id); }
  }
  async function recover() {
    for (const job of jobs()) {
      if (handles.has(job.id)) continue;
      if (["starting", "running", "uncertain"].includes(job.state)) { const artifact = verifiedArtifact(job); if (artifact) { job.result = artifact; job.state = "succeeded"; job.processState = "uncertain"; } else if (job.state !== "uncertain") { job.state = "uncertain"; job.processState = "unknown-after-restart"; } save(job); }
      if (["uncertain", "unknown-after-restart", "startup-unconfirmed"].includes(job.processState)) unresolvedScopes.add(job.id);
      if (job.result && job.deliveryEnabled && !["confirmed", "uncertain", "awaiting-request"].includes(job.delivery.state)) await notify(job);
      if (job.result) await reconcile(job);
      else if (job.deliveryEnabled && failureEligible(job)) await notifyFailureStatus(job.id, job.origin);
    }
    void kick();
  }
  async function control(command, origin) {
    const match = /^\/(?:media-job|媒体任务)\s+(list|status|cancel|get|resend|列表|状态|取消|领取|再发)(?:\s+([a-f0-9]{12,64}))?\s*$/i.exec(command); if (!match) return;
    const action = { "列表": "list", "状态": "status", "取消": "cancel", "领取": "get", "再发": "resend" }[match[1]] || match[1];
    if (action === "list") return jobs().filter(job => authorized(job, origin)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(publicStatus);
    const job = resolveOwned(match[2], origin);
    await reconcile(job);
    if (action === "status") return publicStatus(job);
    if (action === "cancel") { const handle = handles.get(job.id); job.cancelRequested = true; if (job.state === "queued") job.state = "cancelled"; else if (!handle && ["starting", "running"].includes(job.state)) job.state = "uncertain"; save(job); handle?.run.cancel("manual-cancel"); return publicStatus(job); }
    if (["get", "resend"].includes(action) && !job.result) return { ...publicStatus(job), note: "任务没有可领取结果；领取或再发都不会重新生成。" };
    if (job.delivery.state === "uncertain" && action !== "resend") return { ...publicStatus(job), note: "发送状态待确认；只有明确再发才会再次交付。" };
    return { ...publicStatus(job), delivery: await deliver(job, origin, action === "resend") };
  }
  function setTransport(accountId, transport) { transports.set(accountId, transport); if (active) void recover().catch(error => log(`media recover error code=${error.code || "unknown"}`)); }
  async function start() { if (config.enabled === true && typeof dependencies.runDetached !== "function") throw fault("MEDIA_JOB_DETACHED_RUNTIME_NOT_READY"); active = config.enabled === true; stopping = false; if (active) await recover(); }
  async function stop() {
    stopping = true; active = false;
    for (const handle of handles.values()) handle.run.cancel("manual-cancel");
    const pending = lifecycleTask;
    const results = await Promise.allSettled([...handles.values()].map(handle => handle.release()));
    // Startup can own a native process before the returned run handle is stored.
    // Wait for that exact detached lifecycle instead of assuming handles.empty.
    if (pending) await Promise.allSettled([pending]);
    return { cleanupConfirmed: results.every(result => result.status === "fulfilled") && unresolvedScopes.size === 0 && !starting && handles.size === 0, unresolvedJobs: [...unresolvedScopes] };
  }
  function voiceRecipe(text, voiceAlias) {
    if (typeof text !== "string" || !text || text.length > 4000) throw fault("MEDIA_VOICE_INPUT_INVALID");
    if (voiceAlias !== undefined && (typeof voiceAlias !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(voiceAlias))) throw fault("MEDIA_VOICE_INPUT_INVALID"); /* HOSINO-VOICE-NAMED v1 */
    const vargs = voiceAlias ? ["--voice-alias", voiceAlias] : [];
    const script = fs.realpathSync(path.join(scriptsRoot, "xingye_voice.py")), scriptSha = hash(fs.readFileSync(script));
    if (config.expectedScriptHashes?.["xingye_voice.py"] !== scriptSha) throw fault("MEDIA_WRAPPER_HASH_NOT_ADMITTED");
    return { kind: "voice", flag: "--out", ext: "mp3", budget: 240000, script, scriptSha, dependencies: dependenciesFor("xingye_voice.py"), args: vargs, text, requestHash: hash(JSON.stringify(["xingye_voice.py", vargs, text])) };
  }
  function commandRecipe(kind, text) {
    if (!["voice", "image"].includes(kind) || typeof text !== "string" || !text.trim() || text.length > (kind === "voice" ? 4000 : 16000)) throw fault("MEDIA_COMMAND_INPUT_INVALID");
    const name = kind === "voice" ? "xingye_tts.py" : "grok_imagine.py";
    const script = fs.realpathSync(path.join(scriptsRoot, name)), scriptSha = hash(fs.readFileSync(script));
    if (config.expectedScriptHashes?.[name] !== scriptSha) throw fault("MEDIA_WRAPPER_HASH_NOT_ADMITTED");
    const args = kind === "voice" ? ["--format", "mp3"] : [];
    return { kind, flag: kind === "voice" ? "--out" : "--output", ext: kind === "voice" ? "mp3" : "png", budget: kind === "voice" ? 240000 : 600000, script, scriptSha, dependencies: dependenciesFor(name), args, text, requestHash: hash(JSON.stringify([name, args, text])) };
  }
  async function taggedVoice(origin, text, confirmed = false, waitMs = 8000, voiceAlias = undefined) {
    const submitted = await submit(origin, voiceAlias ? voiceRecipe(text, voiceAlias) : voiceRecipe(text), { autoDelivery: false });
    if (submitted.conflict) return { ok: false, jobId: submitted.jobId, error: "MEDIA_JOB_INPUT_CONFLICT" };
    let job = get(submitted.jobId);
    if (confirmed && !job.deliveryEnabled) { job.deliveryEnabled = true; save(job); if (job.result) await notify(job); }
    if (!job.result && ["queued", "starting", "running"].includes(job.state)) {
      await new Promise(resolve => { const listeners = waiters.get(job.id) || new Set(); let timer; const done = () => { clearTimeout(timer); listeners.delete(done); resolve(); }; listeners.add(done); waiters.set(job.id, listeners); timer = setTimeout(done, Math.min(8000, Math.max(0, waitMs))); }); job = get(job.id);
    }
    if (job.result) return { ok: true, media: job.result.path, jobId: job.id, ms: now() - job.createdAt, controlled: true };
    return { ok: false, jobPending: ["queued", "starting", "running"].includes(job.state), jobId: job.id, error: "MEDIA_JOB_" + job.state.toUpperCase(), controlled: true, generationFailureConfirmed: failureEligible(job), generationErrorCode: failureEligible(job) ? job.generationFailure.code : null };
  }
  async function deliverNow(id, origin) { const job = get(id); if (!authorized(job, origin)) throw fault("MEDIA_JOB_NOT_FOUND_OR_NOT_OWNED"); if (!job.deliveryEnabled) { job.deliveryEnabled = true; save(job); } return await deliver(job, origin); }
  function previewInvocation(origin, recipe) {
    if (!validateOrigin(origin)) throw fault("MEDIA_JOB_ORIGIN_INVALID");
    const jobId = hash(JSON.stringify([origin.accountId, origin.targetId, origin.rawSourceId, recipe.kind]));
    const output = path.join(workRoot, jobId, "output." + recipe.ext);
    const args = [...recipe.args];
    const argv = [config.python || "python3", recipe.script, ...args, recipe.flag, output, ...recipe.kind === "image" ? ["--timeout", "590"] : [], "--", recipe.text];
    return Object.freeze({ jobId, output, script: recipe.script, scriptSha: recipe.scriptSha, kind: recipe.kind, text: recipe.text, args: Object.freeze(args), argv: Object.freeze(argv) });
  }
  function scoped(context) { return [...groups].some(group => String(context?.sessionKey || "").endsWith(`:qqbot:group:${group}`)); }
  return { execJobsEnabled: config.execJobs === true, registerInbound, originFor, parse, voiceRecipe, commandRecipe, previewInvocation, taggedVoice, deliverNow, notifyFailureStatus, scoped, submit, control, publicStatus, setTransport, drain, start, stop, queueKey, prefix: PREFIX, get, jobs, _verifiedArtifact: verifiedArtifact };
}
module.exports = { createManager, KEY, PREFIX };
