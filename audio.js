'use strict';
(()=>{
 const files=['click','confirm','denied','box-open','box-close','door-open','door-close'];
 let ctx,musicGain,fxGain,music,unlocked=false,loading=false,steam=null;
 const buffers=new Map(),voices=new Set();
 const prefs={music:true,effects:true};
 try{const p=JSON.parse(localStorage.getItem('starfield-audio')||'{}');for(const k of Object.keys(prefs))if(typeof p[k]==='boolean')prefs[k]=p[k];}catch{}
 function sync(){for(const key of Object.keys(prefs)){const b=document.getElementById('sound-'+key);if(!b)continue;const label=(prefs[key]?'Выключить ':'Включить ')+(key==='music'?'музыку':'звуки действий');b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed',String(prefs[key]));}if(ctx){musicGain.gain.setTargetAtTime(prefs.music?.11:0,ctx.currentTime,.12);fxGain.gain.setTargetAtTime(prefs.effects?.22:0,ctx.currentTime,.03);}}
 async function load(name){try{const r=await fetch('assets/audio/'+name+'.mp3');if(!r.ok)throw Error(r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(name,b);return b;}catch{return null;}}
 function startMusic(){if(music||!buffers.has('lobby-time'))return;music=ctx.createBufferSource();music.buffer=buffers.get('lobby-time');music.loop=true;music.connect(musicGain);music.start();}
 function unlock(){if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ctx=new C();musicGain=ctx.createGain();fxGain=ctx.createGain();musicGain.connect(ctx.destination);fxGain.connect(ctx.destination);sync();}unlocked=true;if(!document.hidden)ctx.resume().catch(()=>{});if(!loading){loading=true;Promise.all(files.map(load));load('lobby-time').then(startMusic);}}
 function play(name){if(!unlocked||!ctx||document.hidden||!prefs.effects)return;if(name==='steam'){startSteam();return;}if(name==='steam-stop'){stopSteam();return;}const b=buffers.get(name);if(!b)return;const s=ctx.createBufferSource();s.buffer=b;s.connect(fxGain);voices.add(s);s.onended=()=>voices.delete(s);s.start();}
 // Filtered noise gives the decontamination spray a soft, continuous hiss.
 function startSteam(){stopSteam();const n=ctx.createBuffer(1,ctx.sampleRate*5,ctx.sampleRate),a=n.getChannelData(0);for(let i=0;i<a.length;i++){const t=i/ctx.sampleRate;a[i]=(Math.random()*2-1)*.24*Math.min(1,t/.25)*Math.min(1,(5-t)/.5);}const s=ctx.createBufferSource(),f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1600;f.Q.value=.5;s.buffer=n;s.connect(f);f.connect(fxGain);s.start();steam=s;s.onended=()=>{if(steam===s)steam=null;};}
 function stopSteam(){if(steam){try{steam.stop();}catch{}steam=null;}}
 function toggle(key){unlock();prefs[key]=!prefs[key];if(key==='effects'&&!prefs.effects){stopSteam();for(const s of voices){try{s.stop();}catch{}}}try{localStorage.setItem('starfield-audio',JSON.stringify(prefs));}catch{}sync();}
 for(const key of Object.keys(prefs))document.getElementById('sound-'+key)?.addEventListener('click',()=>toggle(key));
 document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',e=>{if(!e.repeat)unlock();});
 document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('[id^="sound-"]'))play('click');});
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else if(unlocked)ctx.resume().catch(()=>{});});
 window.VaultAudio={play,unlock};sync();
})();
