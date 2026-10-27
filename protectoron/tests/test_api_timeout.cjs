'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
let latency=30000,calls=[];
const context=vm.createContext({real:true,initData:'test',JSON,Error,
  AbortSignal:{timeout:ms=>({deadline:ms})},
  fetch:async(url,options)=>{
    calls.push({url,options});
    if(latency>options.signal.deadline)throw Error('simulated timeout');
    return {ok:true,json:async()=>({ok:true})};
  }});
vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function setTab(')),context);
(async()=>{
  assert.equal((await context.api('perks')).ok,true);
  await assert.rejects(context.api('state'));
  latency=70000;
  assert.equal((await context.api('perk-acquire',{requestId:'original-request'})).ok,true);
  assert.equal(JSON.parse(calls[2].options.body).requestId,'original-request');
  assert.equal(calls.length,3);
  latency=100000;
  await assert.rejects(context.api('perks'),/Ваши регистрационные данные сохранены/);
  console.log('API: slow Sheets reads and acquisitions can finish; timeouts stay bounded; no duplicate calls');
})().catch(error=>{console.error(error);process.exitCode=1;});

