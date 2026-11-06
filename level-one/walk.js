'use strict';
function startStarfieldWalk(root,bundle,host=null) {
 const q=s=>root.querySelector(s),els={
  canvas:q('[data-world]'),stage:q('[data-stage]'),title:q('[data-room]'),zone:q('[data-zone]'),
  info:q('[data-info]'),act:q('[data-act]'),music:q('[data-music]'),doors:q('[data-doors]'),
  walls:q('[data-walls]'),panel:q('[data-panel]'),panelTitle:q('[data-panel-title]'),
  panelText:q('[data-panel-text]'),panelButtons:q('[data-panel-buttons]'),panelArt:q('[data-panel-art]'),inspection:q('[data-inspect]')
 };
 const rooms=bundle.rooms,imgs={},keys=new Set(),navs=new Map(),motionByRoom={},spots=new Map();
 let id='foyer',room=rooms.foyer,nav,renderer,targets=[],avatar={x:10.05,y:19.1,facing:0,phase:0,moving:false};
 let W=650,H=380,zoom=1,cam={x:avatar.x,y:avatar.y},follow=false,fullWalls=false,dirty=true,ready=false,time=0,active=!host;
 const pass=new Set(),codeForm=q('[data-code-form]'),codeInput=q('[data-code-input]'),codeError=q('[data-code-error]');
 let path=[],intent=null,near=null,hover=null,doorState={},gate=null,mouse=null,focusBefore=null,pendingCode=null;
 let runStart=0,lastDraw=-100,last=0,lastAnnounced='',drawerClose=null,inspection=null,turn=0;
 const motionFor=(k=id)=>motionByRoom[k]??=(Object.create(null));
 const tween=(key,value)=>{const m=motionFor();m[key]??={p:0,to:0};m[key].to=value;dirty=true;};
 const value=(key,k=id)=>motionFor(k)[key]?.to||0;
 const stateValue=(key,k=id)=>motionFor(k)[key]?.p||0;
 const playingWasher={};let bottles=0;
 const lerp=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const screen=(o,z=o.z)=>renderer.project(o.x,o.y,z??0);
 const basic='Нажмите на пол, чтобы идти, или на предмет, чтобы взаимодействовать.';
 let message=basic;
 function notice(v=basic){message=v;if(els.info.textContent!==v)els.info.textContent=v;}
 function busy(){return !!gate||!els.panel.hidden;}
 function navFor(k){
  const ride=WalkAccess.ride(pass),key=k+(k==='staff'&&ride?'#access':'');
  if(!navs.has(key))navs.set(key,WalkNavigation.make(rooms[k],ride));
  return navs.get(key);
 }
 function loadTargets(){
  targets=WalkTargets.fromRoom(id,room);spots.clear();
  for(const t of targets){
   const a=t.id==='serviceLift'&&!WalkAccess.ride(pass)?targets.find(x=>x.id==='staffBadge').approaches:t.approaches;
   spots.set(t.id,a.map(p=>nav.targetPoint(p.x,p.y,.48)).filter(Boolean));
  }
 }
 function trim(x,y,r=.58){return nav.targetPoint(x,y,r);}
 function fit(){
  const corners=room.shapes.flat(),xs=corners.map(([x,y])=>(x-y)*38),ys=corners.map(([x,y])=>(x+y)*19);
  const a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys)-112,d=Math.max(...ys)+9;
  zoom=clamp(Math.min((W-24)/(b-a),(H-23)/(d-c)),.18,1.35);
  const u=(a+b)/76,v=((c+d)/2+.03*H/zoom)/19;
  cam={x:(u+v)/2,y:(v-u)/2};
  follow=false;dirty=true;
 }
 function center(){
  const q=id==='foyer'?.74:.87;
  zoom=Math.max(q,zoom);cam={x:avatar.x,y:avatar.y-.29};follow=true;dirty=true;
 }
 function syncSize(initial=false){
  const w=Math.max(host?160:260,Math.round(els.stage.clientWidth||W)),h=Math.max(host?120:236,Math.round(els.stage.clientHeight||H));
  if(!initial&&w===W&&h===H)return;
  W=w;H=h;
  renderer.resize(W,H,Math.min(window.devicePixelRatio||1,1.75));
  if(follow)center();else fit();
  dirty=true;
 }
 function updateRoomLabel(){
  const title=WalkTargets.roomNames[id],z=WalkTargets.zone(id,avatar);
  if(els.title.textContent!==title)els.title.textContent=title;
  const sub=z===title?'':z;
  if(els.zone.textContent!==sub){els.zone.textContent=sub;els.zone.hidden=!sub;}
 }
 function rebuildDoorMenu(){
  const start=els.doors.options[0];els.doors.replaceChildren(start);
  for(const t of targets.filter(t=>['door','lift','stairs'].includes(t.kind))){
   const opt=document.createElement('option');opt.value=t.id;
   opt.textContent=t.label+((!WalkAccess.entry(pass,t.dest)||t.id==='serviceLift'&&!WalkAccess.ride(pass))?' · нужен код':'');els.doors.append(opt);
  }
  els.doors.value='';
 }
 function enter(k,from=null){
  if(!WalkAccess.entry(pass,k)){gate=null;notice('Для входа нужен код.');return false;}
  id=k;room=rooms[k];nav=navFor(k);renderer.switchRoom(room);
  loadTargets();
  let p=trim(...room.spawn.slice(0,2),.85),entry=null;
  if(from){
   entry=targets.find(t=>t.kind==='door'&&t.dest===from);
   const a=entry&&spots.get(entry.id)[0];if(a)p=a;
  }
  if(!p)throw Error('No safe arrival point in '+room.label);
  avatar={...p,facing:room.spawn[2],phase:0,moving:false};
  doorState={};if(entry)doorState[entry.id]={p:1,to:0};
  path=[];intent=null;near=null;hover=null;gate=null;keys.clear();mouse=null;
  updateRoomLabel();rebuildDoorMenu();fit();if(W<570&&id==='foyer')center();
  if(entry)fx('door-close');
  notice();dirty=true;
  return true;
 }
 let audioCtx,musicGain,source,musicWanted=true,musicBuffer=null,musicLoading=null;
 const fxBuffers=new Map();
 function audioReady(){
  if(host){host.audio.unlock();return null;}
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return null;
  try{
   if(!audioCtx){audioCtx=new Audio();audioCtx.addEventListener('statechange',audioState);}
   if(audioCtx.state!=='running'&&audioCtx.state!=='closed')audioCtx.resume().catch(()=>{});
   return audioCtx;
  }catch{return null;}
 }
 const bytes=s=>WireMedia.bytes(s).buffer;
 function fx(k){
  if(host){host.audio.play(k);return;}
  if(!audioCtx||audioCtx.state!=='running'||!bundle.sounds[k])return;
  if(!fxBuffers.has(k))fxBuffers.set(k,audioCtx.decodeAudioData(bytes(bundle.sounds[k])));
  fxBuffers.get(k).then(b=>{
   if(!b||document.hidden)return;const f=audioCtx.createBufferSource(),g=audioCtx.createGain();
   f.buffer=b;g.gain.value=.115;f.connect(g).connect(audioCtx.destination);f.start();
  }).catch(()=>{});
 }
 function audioState(){
  els.music.setAttribute('aria-pressed',String(musicWanted));
  els.music.setAttribute('aria-label',musicWanted?'Выключить музыку':'Включить музыку');
  if(musicWanted&&audioCtx?.state==='suspended')els.music.setAttribute('aria-description','Музыка начнётся с первого нажатия на карту.');
  else els.music.removeAttribute('aria-description');
 }
 function startMusic(){
  if(!musicWanted)return;
  const ac=audioReady();if(!ac)return;
  audioState();
  if(!musicBuffer){
   if(!musicLoading)musicLoading=ac.decodeAudioData(bytes(bundle.music)).then(buffer=>{
    musicBuffer=buffer;musicLoading=null;startMusic();
   }).catch(error=>{
    musicLoading=null;musicWanted=false;audioState();console.warn('Soundtrack could not be decoded',error);
   });
   return;
  }
  if(!source){
   source=ac.createBufferSource();musicGain=ac.createGain();musicGain.gain.value=0;
   source.buffer=musicBuffer;source.loop=true;source.connect(musicGain).connect(ac.destination);source.start();
  }
  musicGain.gain.setTargetAtTime(.16,ac.currentTime,.2);
 }
 function toggleMusic(){
  musicWanted=!musicWanted;audioState();
  if(musicWanted)startMusic();
  else if(musicGain)musicGain.gain.setTargetAtTime(0,audioCtx.currentTime,.075);
 }
 function findRoute(t){
  let result=null;
  for(const p of spots.get(t.id)||[]){
   const route=nav.route(avatar,p);
   if(!route)continue;
   let last=avatar,length=0;for(const v of route){length+=dist(last,v);last=v;}
   if(!result||result.length>length)result={route,length};
  }
  return result;
 }
 function approach(t){
  if(!ready||busy()||!t)return;
  const r=findRoute(t);
  if(!r){notice('К этой точке сейчас не пройти.');return;}
  path=r.route;intent=t;hover=null;keys.clear();
  if(path.length){notice(t.kind==='door'?t.label+' · подходим…':'Подходим: '+t.label);}
  else{intent=null;action(t);}
  dirty=true;
 }
 function doorChange(d,to){
  const old=doorState[d]??={p:0,to:0};old.to=to;dirty=true;
 }
 function dialog(title,text,options=[],art=null,onClose=null,detail=null){
  path=[];intent=null;avatar.moving=false;keys.clear();fx('click');
  const selected=[...els.panelButtons.children].indexOf(document.activeElement);
  if(els.panel.hidden)focusBefore=document.activeElement;
  drawerClose=onClose;inspection=detail;
  pendingCode=null;codeForm.hidden=true;codeInput.value='';codeInput.removeAttribute('aria-invalid');codeError.textContent='';
  els.panelTitle.textContent=title;els.panelText.textContent=text;
  els.panelButtons.replaceChildren();
  els.panelArt.hidden=!art;
  els.panelArt.classList.toggle('sf-cover',!!art?.startsWith('mag'));
  if(art){els.panelArt.src=imgs[art].src;els.panelArt.alt=title;}
  els.inspection.hidden=!detail;
  if(detail)els.inspection.setAttribute('aria-label',title+' · вид крупным планом');
  for(const [label,action]of options){
   const b=document.createElement('button');b.type='button';b.className='sf-modal-action';b.textContent=label;
   b.addEventListener('click',()=>{fx('click');action();});els.panelButtons.append(b);
  }
  els.panel.hidden=false;
  (els.panelButtons.children[selected]||q('[data-close]')).focus({preventScroll:true});
  dirty=true;
 }
 function closePanel(){
  if(els.panel.hidden)return;els.panel.hidden=true;inspection=null;pendingCode=null;codeInput.value='';
  const after=drawerClose;drawerClose=null;if(after)after();
  if(focusBefore?.isConnected&&focusBefore!==document.body)focusBefore.focus?.({preventScroll:true});
  dirty=true;
 }
 const branchLabels=['Showers','Laundry','Residential Rooms'];
 function waterAvailable(){const a=id==='bath'||id==='wc'?0:id==='laundry'?1:2;return !value('valve'+a,'staff');}
 function requestCode(scope,label,after){
  dialog(label,'Введите код доступа.');
  pendingCode={scope,after};codeForm.hidden=false;codeInput.focus({preventScroll:true});
 }
 function action(t){
  path=[];intent=null;avatar.moving=false;notice();turn++;
  switch(t.kind){
   case 'door':
    if(!WalkAccess.entry(pass,t.dest)){requestCode(t.dest,t.label,()=>action(t));break;}
    doorChange(t.id,1);fx('door-open');gate={id:t.id,dest:t.dest};break;
   case 'lift': {
    if(t.id==='serviceLift'&&!WalkAccess.ride(pass)){requestCode('serviceLift','Service Lift',()=>approach(t));break;}
    doorChange(t.id,1);fx('door-open');
    const text=t.id==='lift'?'Пассажирская кабина обслуживает уровни 1–6.':'Служебная кабина обслуживает уровни 1–9 и подуровни.';
    dialog(t.label,text,[],null,()=>{doorChange(t.id,0);fx('door-close');});break;
   }
   case 'stairs':
    dialog('Level 0 Stairwell','Лестница ведёт в фойе нулевого уровня.',host?[['Подняться на уровень 0',()=>{closePanel();host.onStairs();}]]:[]);
    break;
   case 'poster':dialog(t.label,'',[],t.art);break;
   case 'vending': {
    const show=()=>dialog('Nuka-Cola',bottles?'Бутылка выкатилась в лоток.':'За стеклом видны бутылки. Автомат тихо гудит.',
     [['Выдать бутылку',()=>{bottles++;tween('vending',1);fx('box-open');show();}]],'foyerCola',()=>tween('vending',0));
    show();break;
   }
   case 'games':dialog('Настольные игры','В коробке Blast Radius лежат поле и фишки. Рядом — колода карт.',[],'foyerGameBox');break;
   case 'radio':dialog('Радио','На шкале отмечена частота внутреннего вещания.');break;
   case 'magazine':dialog(t.label,'',[],t.art);break;
   case 'notices':dialog('Объявления','«Чистое бельё выдаётся через окно в Laundry. Пожалуйста, возвращайте книги на полку».');break;
   case 'dock':dialog('Зарядная площадка','На площадке заряжается второй робоглаз. Первый продолжает обход.');break;
   case 'sofa':dialog('Диван','Обивка потёрлась на подлокотниках. Сюда хорошо доносится музыка из фойе.');break;
   case 'bed':dialog('Кровать','Койка застелена, чистое бельё сложено у изголовья.');break;
   case 'wardrobe':dialog(t.label,'Внутри полка, перекладина и пустые вешалки.');break;
   case 'terminal':dialog('Жилой терминал',room.label+' · Подключение установлено. Сеть убежища доступна.');break;
   case 'tv':dialog('Телевизор','Экран включается. На этой частоте только помехи.');break;
   case 'sink':case 'shower': {
    const k='water:'+t.id,m=motionFor();
    if(!waterAvailable()){notice('Вода перекрыта в Service Area.');return;}
    m[k]=m[k]?null:{p:1,to:1};notice(m[k]?'Вода включена.':'Вода выключена.');fx('click');dirty=true;break;
   }
   case 'washer':{
    const k=t.id,on=!!playingWasher[k];
    if(!on&&t.id!=='washer2'&&!waterAvailable()){notice('Вода в Laundry перекрыта.');return;}
    if(on)delete playingWasher[k];else playingWasher[k]=true;
    notice(on?t.label+' · остановлена.':t.label+' · барабан запущен.');fx('confirm');dirty=true;break;
   }
   case 'towels':dialog(t.label,'Чистое бельё сложено стопками; можно взять полотенце.');break;
   case 'dirty':dialog(t.label,'Сюда складывают вещи перед стиркой.');break;
   case 'power':{
    tween('power',1);fx('box-open');
    const show=()=>dialog('Электрощит',value('breaker')?'Освещение в Service Area отключено.':'Освещение в Service Area работает.',
      WalkAccess.operate(pass)?[[value('breaker')?'Включить свет':'Выключить свет',()=>{if(WalkAccess.operate(pass)){tween('breaker',1-value('breaker'));show();}}]]:[],null,()=>{tween('power',0);fx('box-close');},'power');
    show();break;
   }
   case 'valves':{
    tween('valveCover',1);fx('box-open');
    const show=()=>dialog('Водяные клапаны','Три ветки первого уровня.',WalkAccess.operate(pass)?branchLabels.map((v,i)=>[
      v+' · '+(value('valve'+i)?'открыть':'перекрыть'),()=>{if(WalkAccess.operate(pass)){tween('valve'+i,1-value('valve'+i));show();}}
    ]):[],null,()=>{tween('valveCover',0);fx('box-close');},'valves');
    show();break;
   }
   case 'hatch':tween('hatch',1);fx('box-open');dialog('Люк осмотра','За крышкой — трубы, кабель и вентиляционный канал.',[],null,()=>{tween('hatch',0);fx('box-close');},'hatch');break;
   case 'badge':
    if(!WalkAccess.ride(pass)){requestCode('serviceLift','Служебный тамбур',()=>action(t));break;}
    if(WalkAccess.ride(pass))tween('badge',1);
    dialog('Панель доступа','Служебный тамбур открыт.',[],null,()=>tween('badge',0));break;
   case 'crate':tween('crate',1);fx('box-open');dialog('Ящик с расходниками','Сменные фильтры, аптечка и изолента.',[],'serviceSupplies',()=>{tween('crate',0);fx('box-close');});break;
   case 'stock':dialog('Стеллаж','Расходники для душевых и прачечной.');break;
   case 'cart':dialog('Тележка','На полке лежит сложенное бельё.');break;
  }
  dirty=true;
 }

 function nearTarget(){
  let best=null,r=.72;
  for(const t of targets)for(const p of spots.get(t.id)||[]){
   const d=dist(avatar,p);
   if(d<r&&nav.straight(avatar,p)){best=t;r=d;}
  }
  return best;
 }
 function refreshNear(){
  near=nearTarget();
  const v=intent||near,desc=v?(v.kind==='door'?'Войти · ':'')+v.label:'Действие';
  if(els.act.textContent!==desc)els.act.textContent=desc;
  els.act.disabled=!v||busy();
 }
 function stepAvatar(dx,dy,dt){
  const m=Math.hypot(dx,dy);if(m<.0001)return false;
  const n=Math.min(m,4.1*dt),nx=avatar.x+dx/m*n,ny=avatar.y+dy/m*n;
  if(!nav.valid(nx,ny))return false;
  avatar.x=nx;avatar.y=ny;
  const a=dx-dy,b=dx+dy;avatar.facing=a>=0?(b>=0?1:0):(b>=0?2:3);avatar.phase+=n*2.86;
  return true;
 }
 function advance(dt){
  let moving=false;
  if(!busy()){
   const x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
   const y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
   if(x||y){path=[];intent=null;moving=stepAvatar(x+y,y-x,dt);dirty=true;}
   else if(path.length){
    const next=path[0],dx=next.x-avatar.x,dy=next.y-avatar.y;
    if(Math.hypot(dx,dy)<.032){avatar.x=next.x;avatar.y=next.y;path.shift();}
    else if(!(moving=stepAvatar(dx,dy,dt))){
     path=[];intent=null;notice('Здесь проход закрыт.');dirty=true;
    }
   }
   if(!path.length&&intent){const t=intent;intent=null;action(t);}
  }
  if(moving!==avatar.moving||moving)dirty=true;
  avatar.moving=moving;
  if(follow&&moving){
   const p=screen(avatar,0),dx=p[0]-W*.5,dy=p[1]-H*.55,ax=Math.max(22,W*.11),ay=Math.max(18,H*.12);
   const ox=(Math.abs(dx)>ax?dx-Math.sign(dx)*ax:0)/(38*zoom),oy=(Math.abs(dy)>ay?dy-Math.sign(dy)*ay:0)/(19*zoom);
   cam.x+=(ox+oy)*Math.min(1,dt*5)*.5;cam.y+=(oy-ox)*Math.min(1,dt*5)*.5;
  }
 }
 function animate(dt){
  for(const m of Object.values(motionFor())){
   if(!m||m.p===m.to)continue;
   m.p=m.to>m.p?Math.min(m.to,m.p+dt*2.1):Math.max(m.to,m.p-dt*2.1);dirty=true;
  }
  for(const m of Object.values(doorState)){
   if(m.p===m.to)continue;
   m.p=m.to>m.p?Math.min(m.to,m.p+dt*1.85):Math.max(m.to,m.p-dt*1.85);dirty=true;
  }
  if(gate&&doorState[gate.id]?.p>=1){const dest=gate.dest,from=id;enter(dest,from);}
 }
 function paintWorld(){
  const m=Object.fromEntries(Object.entries(motionFor()).filter(([,v])=>v).map(([k,v])=>[k,v.p]));
  for(const [k,v] of Object.entries(m))if(k.startsWith('water:')&&v&&!waterAvailable())m[k]=0;
  if(id==='laundry')for(const k of Object.keys(playingWasher))m[k]=.001+time*7.6;
  const d=Object.fromEntries(Object.entries(doorState).map(([k,o])=>[k,o.p]));
  const opened=Object.fromEntries(Object.entries(doorState).map(([k,o])=>[k,!!o.to]));
  renderer.draw({camera:{zoom,cam,path,fullWalls,serviceAuthorized:WalkAccess.ride(pass)},player:avatar,time,doors:d,open:opened,motion:m,crate:m.crate||0});
  if(inspection)renderer.inspect(els.inspection,inspection);
  const ctx=els.canvas.getContext('2d');
  for(const t of targets){
   const [x,y]=screen(t),active=t===intent||t===hover||t===near;
   if(x<5||y<6||x>W-5||y>H-5)continue;
   if(!active&&(zoom<.47||busy())&&t.kind!=='door')continue;
   const r=active?3.5:t.kind==='door'?2.5:1.8;
   ctx.fillStyle=active?'#dfc984':'#b7bb8990';
   ctx.fillRect(Math.round(x-r/2),Math.round(y-r/2),r,r);
   if(active){ctx.strokeStyle='#ded097ae';ctx.lineWidth=1;ctx.strokeRect(Math.round(x)-5,Math.round(y)-5,10,10);}
  }
  dirty=false;
 }
 function pick(x,y){
  let best=null,score=Infinity;
  for(const t of targets){
   const [px,py]=screen(t),d=Math.hypot(px-x,(py-y)*.9);
   let limit=t.kind==='door'||t.kind==='lift'?25:t.kind==='poster'?16:18;
   let ok=d<limit;
   if(t.kind==='door'||t.kind==='lift'){
    const o=room.doors.find(o=>o.id===t.id),a=renderer.project(o.x,o.y,0),b=renderer.project(o.x+o.ux*o.span,o.y+o.uy*o.span,0),span=b[0]-a[0];
    if(Math.abs(span)>4){
     const u=(x-a[0])/span,y0=lerp(a[1],b[1],u);
     ok||=u>-.045&&u<1.045&&y>y0-2.64*42*zoom&&y<y0+3;
    }
   }else if(['power','valves','hatch','tv','washer'].includes(t.kind)){
    const o=room.objects.find(o=>o.id===t.id),z=t.kind==='power'?.33:['tv','washer'].includes(t.kind)?0:.55;
    const h=t.kind==='power'?1.61:t.kind==='valves'?1.22:t.kind==='hatch'?1.14:t.kind==='washer'?1.26:1.17;
    if(o?.kind==='model'){
     const a=renderer.project(o.x0,o.y0+o.h,z),b=renderer.project(o.x0+o.w,o.y0+o.h,z);
     const u=(x-a[0])/(b[0]-a[0]),y0=lerp(a[1],b[1],u);
     ok||=u>-.06&&u<1.06&&y>y0-h*42*zoom-5&&y<y0+4;
    }
   }
   if(ok&&d<score){score=d;best=t;}
  }
  return best;
 }
 function clickAt(x,y){
  if(!ready||busy())return;
  const obj=pick(x,y);
  if(obj){approach(obj);return;}
  const p=renderer.inverse(x,y),to=trim(p.x,p.y,.61),r=to&&nav.route(avatar,to);
  if(!r){notice('Выберите свободный участок пола или дверь.');return;}
  path=r;intent=null;dirty=true;notice();
 }
 function zoomBy(k,anchor=null){
  const z=clamp(zoom*k,.18,1.72);
  if(anchor){
   const [x,y]=anchor,d=(x-W*.5)/38*(1/zoom-1/z),s=(y-H*.53)/19*(1/zoom-1/z);
   cam.x+=(d+s)/2;cam.y+=(s-d)/2;
  }
  zoom=z;dirty=true;
 }
 function frame(now){
  const dt=Math.min(.24,last?(now-last)/1000:.016);last=now;
  if(!ready)return;
  requestAnimationFrame(frame);
  if(document.hidden||!active)return;
  const steps=Math.max(1,Math.ceil(dt/.037)),step=dt/steps;
  for(let i=0;i<steps;i++){time+=step;advance(step);animate(step);}
  updateRoomLabel();refreshNear();
  const movingMedia=id==='foyer'||(id==='laundry'&&Object.keys(playingWasher).length)||Object.keys(motionFor()).some(k=>k.startsWith('water:')&&motionFor()[k]);
  if((dirty||movingMedia)&&now-lastDraw>=27){paintWorld();lastDraw=now;}
 }
 function local(e){const r=els.canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
 let keyboard=false;
 document.addEventListener('pointerdown',e=>{keyboard=root.contains(e.target);if(!keyboard)keys.clear();});
 els.canvas.addEventListener('pointerdown',e=>{
  if(!ready||busy()||e.button!==0)return;audioReady();
  mouse={id:e.pointerId,x:e.clientX,y:e.clientY,cam:{...cam},moved:false};
  try{els.canvas.setPointerCapture(e.pointerId);}catch{}
 });
 els.canvas.addEventListener('pointermove',e=>{
  if(!ready||busy())return;
  if(mouse&&mouse.id===e.pointerId){
   const dx=e.clientX-mouse.x,dy=e.clientY-mouse.y;
   if(Math.hypot(dx,dy)>8)mouse.moved=true;
   if(mouse.moved){
    const u=dx/(38*zoom),v=dy/(19*zoom);
    cam.x=mouse.cam.x-(u+v)/2;cam.y=mouse.cam.y-(v-u)/2;follow=false;dirty=true;return;
   }
  }
  if(e.pointerType!=='touch'){
   const t=pick(...local(e));if(t!==hover){hover=t;dirty=true;}
   els.canvas.dataset.point=hover?'object':'floor';
  }
 });
 els.canvas.addEventListener('pointerup',e=>{
  if(!mouse||mouse.id!==e.pointerId)return;
  const m=mouse;mouse=null;if(!m.moved)clickAt(...local(e));
 });
 els.canvas.addEventListener('pointercancel',()=>mouse=null);
 els.canvas.addEventListener('pointerleave',()=>{hover=null;dirty=true;});
 els.canvas.addEventListener('wheel',e=>{
  if(!ready||busy())return;
  e.preventDefault();zoomBy(e.deltaY<0?1.14:1/1.14,local(e));
 },{passive:false});
 const walking=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'];
 document.addEventListener('keydown',e=>{
  if(!active)return;
  if(!els.panel.hidden){
   if(e.key==='Escape'){e.preventDefault();closePanel();return;}
   if(e.key==='Tab'){
    const controls=[...els.panel.querySelectorAll('button:not([disabled]),input')].filter(x=>!x.closest('[hidden]'));
    if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}
    else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
   }
   return;
  }
  if(!ready||busy()||(!keyboard&&!root.contains(document.activeElement))||/SELECT|INPUT|TEXTAREA/.test(e.target?.tagName||''))return;
  if(walking.includes(e.code)){e.preventDefault();keys.add(e.code);}
  if(e.code==='KeyE'&&!e.repeat){audioReady();approach(intent||near);}
 });
 document.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>{keys.clear();mouse=null;});
 document.addEventListener('visibilitychange',()=>{keys.clear();mouse=null;});
 q('[data-fit]').addEventListener('click',fit);
 q('[data-center]').addEventListener('click',center);
 q('[data-minus]').addEventListener('click',()=>zoomBy(1/1.19));
 q('[data-plus]').addEventListener('click',()=>zoomBy(1.19));
 q('[data-close]').addEventListener('click',closePanel);
 els.panel.addEventListener('click',e=>{if(e.target===els.panel)closePanel();});
 els.walls.addEventListener('click',()=>{
  fullWalls=!fullWalls;els.walls.setAttribute('aria-pressed',String(fullWalls));dirty=true;
 });
 if(!host){
  els.music.addEventListener('click',toggleMusic);
  const unlock=e=>{if(!els.music.contains(e.target))startMusic();};
  for(const event of ['pointerup','click','touchend','keydown'])root.addEventListener(event,unlock,true);
  audioState();startMusic();
 }
 els.act.addEventListener('click',()=>{audioReady();approach(intent||near);});
 els.doors.addEventListener('change',()=>{
  const t=targets.find(t=>t.id===els.doors.value);els.doors.value='';
  audioReady();approach(t);
 });
 codeInput.addEventListener('input',()=>{codeError.textContent='';codeInput.removeAttribute('aria-invalid');});
 codeForm.addEventListener('submit',e=>{
  e.preventDefault();if(!pendingCode)return;
  const {scope,after}=pendingCode;
  if(!WalkAccess.matches(scope,codeInput.value)){
   codeInput.setAttribute('aria-invalid','true');codeError.textContent='Неверный код. Дверь закрыта.';codeInput.focus();codeInput.select();return;
  }
  pass.add(scope);closePanel();nav=navFor(id);loadTargets();rebuildDoorMenu();after();
 });
 const wake=()=>Promise.all(Object.entries(bundle.sprites).map(([k,url])=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{imgs[k]=img;resolve();};img.onerror=()=>reject(Error(k));img.src=host?url:WireMedia.image(url);
 })));
 return wake().then(()=>{
  renderer=createWalkRenderer(els.canvas,imgs,room);syncSize(true);
  enter('foyer');ready=true;
  for(const b of root.querySelectorAll('[data-wait]'))b.disabled=false;
  refreshNear();paintWorld();
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>syncSize()).observe(els.stage);
  else window.addEventListener('resize',()=>syncSize());
  requestAnimationFrame(frame);
  return {
   setActive(value){active=value;if(value){syncSize();dirty=true;}else{keys.clear();mouse=null;avatar.moving=false;}},
   enterFromStairs(){if(!els.panel.hidden)closePanel();enter('foyer');},
   closePanel
  };
 });
}
