// Test-only isolation: no real model, QQ, external network or host commands.
import net from 'node:net';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const local = host => ['127.0.0.1','::1','localhost'].includes(host);
const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const first=Array.isArray(args[0])?args[0][0]:args[0];
 const opts=typeof first==='object'?first:{};
 const host=opts.host??(typeof args[1]==='string'?args[1]:'localhost');
 if(opts.path||!local(host))throw Error('TEST_ONLY_EXTERNAL_CONNECTION_BLOCKED');
 return original.apply(this,args);
};
const realFetch=globalThis.fetch;
globalThis.fetch=(url,...args)=>{if(!local(new URL(typeof url==='string'||url instanceof URL?url:url.url).hostname))throw Error('TEST_ONLY_EXTERNAL_FETCH_BLOCKED');return realFetch(url,...args);};
for(const key of ['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync'])childProcess[key]=()=>{throw Error('TEST_ONLY_HOST_COMMAND_BLOCKED');};
syncBuiltinESMExports();
