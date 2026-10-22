// QQ-CONTROLLED-JOB-AUTHORITY v1. Host SDK permission preflight; never an exec approval or file grant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WORKSPACE, normId } from './execution-policy.mjs';

const PROFILES = Object.freeze({
  'xingye_voice.py': Object.freeze({kind:'voice',ext:'mp3',flag:'--out',args:[]}),
  'xingye_tts.py': Object.freeze({kind:'voice',ext:'mp3',flag:'--out',args:['--format','mp3']}),
  'grok_imagine.py': Object.freeze({kind:'image',ext:'png',flag:'--output',args:[]}),
});
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sameArray = (a,b) => Array.isArray(a) && a.length === b.length && a.every((v,i)=>v===b[i]);
const validText = value => typeof value === 'string' && value.length > 0 && value.length <= 16000 && !value.includes('\0');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\0\r\n]/.test(value);
function safeExistingPath(filename, io) {
  try { if (io.lstatSync(filename).isSymbolicLink() || String(io.realpathSync(filename)) !== filename) return false; }
  catch (error) { if (error?.code !== 'ENOENT') return false; }
  return true;
}

export function createControlledJobAuthorizer({flag,executionGuard,readGuard,io=fs,now=Date.now}) {
  return function authorizeControlledJob(hostCtx,pinnedInvocation) {
    const refuse = reason => ({allowed:false,reason});
    try {
      if (flag?.active !== true || flag?.unifiedToolsReady !== true || flag?.readScopesReady !== true) return refuse('MEDIA_JOB_GUARD_NOT_READY');
      if (!Object.isFrozen(hostCtx) || !Object.isFrozen(hostCtx?.requester)) return refuse('MEDIA_JOB_HOST_SNAPSHOT_REQUIRED');
      const requester = hostCtx.requester;
      const group = String(hostCtx.sessionKey ?? '').match(/^agent:([^:]+):qqbot:group:([a-f0-9]{32})$/i);
      if (!group || hostCtx.trigger !== 'user' || requester.trigger !== 'user' || requester.channel !== 'qqbot' || !validId(requester.accountId) || !validId(requester.senderId) || !normId(requester.senderId) || !validId(requester.sourceMessageId) || String(requester.targetId ?? '').toLowerCase() !== group[2].toLowerCase()) return refuse('MEDIA_JOB_TRUSTED_ORIGIN_REQUIRED');
      const admission = hostCtx.admission;
      if (!Object.isFrozen(admission) || admission?.kind !== 'sdk-inbound-command' || admission.channelAclPassed !== true || admission.mentionGatePassed !== true || admission.currentSourceActive !== true || ['accountId','senderId','sourceMessageId','targetId'].some(k=>admission[k]!==requester[k])) return refuse('MEDIA_JOB_INBOUND_ADMISSION_REQUIRED');
      if (!Number.isFinite(admission.receivedAtMs) || admission.receivedAtMs <= 0 || admission.receivedAtMs > now()+1000 || admission.receivedAtMs+180000 <= now()) return refuse('MEDIA_JOB_ORIGINAL_SOURCE_EXPIRED');
      // Only immutable host fields enter the existing policy. Positive owner claims, body and model metadata are ignored.
      // No toolCallId/runId is synthesized: SDK commands cannot mint pending tool or generated-asset receipts.
      const ctx = Object.freeze({sessionKey:hostCtx.sessionKey,trigger:'user',cwd:WORKSPACE,workspaceDir:WORKSPACE,requester:Object.freeze({channel:'qqbot',trigger:'user',accountId:requester.accountId,senderId:requester.senderId,sourceMessageId:requester.sourceMessageId,...requester.senderIsOwner === false ? {senderIsOwner:false} : {}})});
      const {config,state} = executionGuard.authority(ctx);
      if (!state.owner || !state.id || state.trigger !== 'user') return refuse('MEDIA_JOB_CREATE_OWNER_REQUIRED');
      const jobs = config?.plugins?.entries?.['qq-group-followup-gate']?.config?.controlledMediaJobs;
      const target = group[2].toLowerCase();
      if (jobs?.enabled !== true || !jobs.groups?.some(g=>String(g).toLowerCase()===target) || String(jobs.agentId ?? 'main') !== group[1]) return refuse('MEDIA_JOB_SCOPE_NOT_ADMITTED');
      if ((jobs.python !== undefined && jobs.python !== 'python3') || (jobs.scriptsRoot !== undefined && jobs.scriptsRoot !== WORKSPACE+'/scripts') || (jobs.workRoot !== undefined && jobs.workRoot !== '/tmp/openclaw-controlled-media') || (jobs.runner !== undefined && jobs.runner !== '/home/ubuntu/.openclaw/plugins/qq-group-followup-gate/controlled_media_runner.py')) return refuse('MEDIA_JOB_EXECUTOR_NOT_PINNED');
      if (!Object.isFrozen(pinnedInvocation) || !Object.isFrozen(pinnedInvocation?.args) || !Object.isFrozen(pinnedInvocation?.argv)) return refuse('MEDIA_JOB_PINNED_INVOCATION_REQUIRED');
      const name = path.posix.basename(String(pinnedInvocation.script ?? '')); const profile = PROFILES[name];
      const script = WORKSPACE+'/scripts/'+name;
      if (!profile || pinnedInvocation.script !== script || pinnedInvocation.kind !== profile.kind || !validText(pinnedInvocation.text) || !sameArray(pinnedInvocation.args,profile.args)) return refuse('MEDIA_JOB_PINNED_RECIPE_MISMATCH');
      const jobId = digest(JSON.stringify([requester.accountId,target,requester.sourceMessageId,profile.kind]));
      const workRoot = '/tmp/openclaw-controlled-media'; const output = workRoot+'/'+jobId+'/output.'+profile.ext;
      if (pinnedInvocation.jobId !== jobId || pinnedInvocation.output !== output) return refuse('MEDIA_JOB_OUTPUT_OR_ORIGIN_MISMATCH');
      const argv = ['python3',script,...profile.args,profile.flag,output,...profile.kind === 'image' ? ['--timeout','590'] : [],'--',pinnedInvocation.text];
      if (!sameArray(pinnedInvocation.argv,argv)) return refuse('MEDIA_JOB_ARGV_MISMATCH');
      const allowedFields = new Set(['script','scriptSha','kind','text','args','argv','output','jobId']);
      if (Object.keys(pinnedInvocation).some(k=>!allowedFields.has(k))) return refuse('MEDIA_JOB_EXEC_OVERRIDE_OR_INPUT_REJECTED');
      for (const file of [name,...name === 'xingye_voice.py' ? ['xingye_tts.py','media_deadline.py'] : ['media_deadline.py']]) {
        const expected = jobs.expectedScriptHashes?.[file]; const filename = WORKSPACE+'/scripts/'+file;
        if (!/^[a-f0-9]{64}$/.test(expected ?? '') || String(io.realpathSync(filename)) !== filename || digest(io.readFileSync(filename)) !== expected || (file === name && pinnedInvocation.scriptSha !== expected)) return refuse('MEDIA_JOB_WRAPPER_HASH_NOT_ADMITTED');
      }
      for (const filename of ['/tmp',workRoot,path.posix.dirname(output),output]) if (!safeExistingPath(filename,io)) return refuse('MEDIA_JOB_OUTPUT_PATH_NOT_ADMITTED');
      // Both projected Gateway exec and native exec names must permit this equivalent pinned invocation.
      // Explicit group denies still apply to configured owners. Read scope is evaluated without minting grants.
      for (const toolName of ['exec','gateway_exec','exec_command']) {
        const event = Object.freeze({toolName,params:Object.freeze({command:Object.freeze(argv),workdir:WORKSPACE})});
        const execution = executionGuard.before(event,ctx); if (execution?.block) return refuse('MEDIA_JOB_EXECUTION_POLICY_DENIED');
        const read = readGuard.before(event,ctx); if (read?.block) return refuse('MEDIA_JOB_READ_SCOPE_DENIED');
      }
      return {allowed:true,permissionOnly:true,coreExecApprovalGranted:false};
    } catch { return refuse('MEDIA_JOB_AUTHORITY_UNVERIFIABLE'); }
  };
}
