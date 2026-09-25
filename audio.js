'use strict';
(()=>{
 const effects=['click','confirm','denied','box-open','box-close','door-open','door-close','robot'];
 const prefs={music:true,effects:true},buffers=new Map(),pending=new Map(),failed=new Set(),voices=new Set();
 let ctx,musicGain,fxGain,music,steam=null,unlocked=false,resumeTimer;
 try{const saved=JSON.parse(localStorage.getItem('starfield-audio')||'{}');for(const key of Object.keys(prefs))if(typeof saved[key]==='boolean')prefs[key]=saved[key];}catch{}
 const button=key=>document.getElementById('sound-'+key);
 function sync(){
  for(const key of Object.keys(prefs)){
   const b=button(key);if(!b)continue;
   const error=key==='music'?failed.has('lobby-time'):effects.some(n=>failed.has(n));
   const ready=key==='music'?!!music:effects.some(n=>buffers.has(n));
   const state=!prefs[key]?'muted':error?'error':!ctx?'idle':ctx.state!=='running'?'paused':ready?'playing':'loading';
   const label=(prefs[key]?'Выключить ':'Включить ')+(key==='music'?'музыку':'звуки действий');
   b.dataset.state=state;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(prefs[key]));
   b.title=state==='error'?'Повторить загрузку звука':state==='loading'?'Звук загружается…':label;
  }
  if(ctx){musicGain.gain.setTargetAtTime(prefs.music?.17:0,ctx.currentTime,.12);fxGain.gain.setTargetAtTime(prefs.effects?.3:0,ctx.currentTime,.03);}
  const notice=document.getElementById('audio-notice'),text=document.getElementById('audio-message');
  if(notice){const enabledError=(prefs.music&&failed.has('lobby-time'))||(prefs.effects&&effects.some(n=>failed.has(n)));const blocked=unlocked&&ctx&&ctx.state==='suspended'&&!document.hidden&&(prefs.music||prefs.effects);notice.hidden=!(enabledError||blocked);if(text)text.textContent=enabledError?'Не удалось загрузить звук.':'Нажмите, чтобы включить звук.';}
 }
 function save(){try{localStorage.setItem('starfield-audio',JSON.stringify(prefs));}catch{}}
 async function load(name){
  if(buffers.has(name))return buffers.get(name);if(pending.has(name))return pending.get(name);
  const task=(async()=>{
   for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const r=await fetch('assets/audio/'+name+'.mp3',{signal:controller.signal});if(!r.ok)throw Error(r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(name,b);failed.delete(name);return b;}
    catch{if(attempt===1)failed.add(name);}
    finally{clearTimeout(timeout);}
   }
   return null;
  })();pending.set(name,task);
  try{return await task;}finally{pending.delete(name);sync();}
 }
 function startMusic(){if(!ctx||music||!prefs.music||!buffers.has('lobby-time'))return;const s=ctx.createBufferSource();s.buffer=buffers.get('lobby-time');s.loop=true;s.connect(musicGain);s.start();music=s;sync();}
 function ensureAssets(retry=false){
  if(prefs.effects)for(const name of effects)if(retry||!failed.has(name))load(name);
  if(prefs.music&&(retry||!failed.has('lobby-time')))load('lobby-time').then(startMusic);
 }
 function unlock(retry=false){
  if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{ctx=new C();musicGain=ctx.createGain();fxGain=ctx.createGain();musicGain.connect(ctx.destination);fxGain.connect(ctx.destination);ctx.onstatechange=sync;}catch{return;}sync();}
  unlocked=true;
  if(!document.hidden&&ctx.state!=='running')ctx.resume().then(sync).catch(sync);
  ensureAssets(retry);clearTimeout(resumeTimer);resumeTimer=setTimeout(sync,1200);sync();
 }
 function stopSteam(){if(steam){try{steam.stop();}catch{}steam=null;}}
 function startSteam(){stopSteam();const n=ctx.createBuffer(1,ctx.sampleRate*5,ctx.sampleRate),a=n.getChannelData(0);for(let i=0;i<a.length;i++){const t=i/ctx.sampleRate;a[i]=(Math.random()*2-1)*.24*Math.min(1,t/.25)*Math.min(1,(5-t)/.5);}const s=ctx.createBufferSource(),f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1600;f.Q.value=.5;s.buffer=n;s.connect(f);f.connect(fxGain);s.start();steam=s;s.onended=()=>{if(steam===s)steam=null;};}
 function play(name){
  if(name==='steam-stop'){stopSteam();return;}
  if(!unlocked||!ctx||ctx.state!=='running'||document.hidden||!prefs.effects)return;
  if(name==='steam'){startSteam();return;}
  const b=buffers.get(name);if(!b)return;const s=ctx.createBufferSource();s.buffer=b;s.connect(fxGain);voices.add(s);s.onended=()=>voices.delete(s);s.start();
 }
 function toggle(key){
  prefs[key]=!prefs[key];save();
  if(key==='effects'&&!prefs.effects){stopSteam();for(const s of voices){try{s.stop();}catch{}}}
  unlock();sync();
 }
 for(const key of Object.keys(prefs))button(key)?.addEventListener('click',()=>toggle(key));
 document.getElementById('audio-retry')?.addEventListener('click',()=>unlock(true));
 // Chrome's touch activation is completed on pointerup/click, not pointerdown.
 document.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')unlock();},{passive:true});
 document.addEventListener('pointerup',()=>unlock(),{passive:true});
 document.addEventListener('keydown',e=>{if(!e.repeat)unlock();});
 document.addEventListener('click',e=>{unlock();if(e.target.closest?.('button')&&!e.target.closest?.('[id^="sound-"]'))play('click');});
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else if(unlocked)unlock();});
 window.VaultAudio={play,unlock};sync();
})();
