import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import vm from 'node:vm';import{pathToFileURL}from'node:url';
export async function startHarness({rootDir,stateDir,load}){
 const src=fs.readFileSync(path.join(rootDir,'server.mjs'),'utf8');
 const {createUsageService}=await import(pathToFileURL(path.join(rootDir,'usage-service.mjs')));
 const {loadUsageEstimate}=await import(pathToFileURL(path.join(rootDir,'usage-estimate.mjs')));
 const{makeSameOrigin}=await import(pathToFileURL(path.join(rootDir,'five-features.mjs')));
 const service=createUsageService({load:load||(()=>loadUsageEstimate({stateDir,days:30}))});
 const sessions=new Map(),sid='1'.repeat(64);sessions.set(sid,Date.now()+60000);
 const context=vm.createContext({URL,fs,path,PUB:path.join(rootDir,'public'),sessions,usageEstimateService:service,sameOrigin:makeSameOrigin(),modelAuthRoute:()=>null,redactText:s=>s});
 const line=needle=>src.split('\n').find(l=>l.startsWith(needle));
 vm.runInContext([line('const cookieSid ='),line('const authed ='),line('const qi ='),line('const MIME ='),line('const SEC ='),line('function send(')].join('\n'),context);
 const route=src.split('\n').find(l=>l.includes('"GET /api/usage/cost":')).split('"GET /api/usage/cost":')[1].trim().replace(/,$/,'');
 context.R={'GET /api/usage/cost':vm.runInContext('('+route+')',context)};
 const a=src.indexOf('http.createServer(')+'http.createServer('.length,b=src.indexOf(').listen(PORT',a);
 const callback=vm.runInContext('('+src.slice(a,b)+')',context);
 const server=http.createServer(callback);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{base:'http://127.0.0.1:'+server.address().port,sessions,sid,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
