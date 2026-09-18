'use strict';
window.Bunker=(()=>{
 const canvas=document.getElementById('world');let ctx=canvas.getContext('2d',{alpha:false});
 const images={},darkImages={},keys=new Set();let W=1000,H=650,dpr=1,dirty=true,last=0,ready=false,running=false,pointer=null,paused=false,time=0;
 const state={scene:'foyer',zoom:1,cam:{x:12,y:9},path:[],selected:null,near:null,open:{},anim:{},saved:{},transition:null,cycle:null};
 const player={x:8.5,y:8.5,angle:0,phase:0,moving:false};
 const scenes={},key=(x,y)=>Math.floor(x)+','+Math.floor(y);
 function scene(id,w,h,label){return scenes[id]={id,w,h,label,tiles:new Set(),walls:[],objects:[],doors:[],blocked:new Set(),labels:[]};}
 function rect(s,x,y,w,h){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)s.tiles.add(key(i,j));}
 function wall(s,x,y,axis,low=false,internal=false){s.walls.push({x,y,axis,low,internal,depth:x+y+.5});}
 function prop(s,id,sprite,x,y,scale=1,extra={}){const o={id,sprite,x,y,scale,depth:x+y,kind:'prop',...extra};s.objects.push(o);if(extra.blocked!==false){s.blocked.add(key(x,y));if(extra.footprint){const[a,b,w,h]=extra.footprint;for(let yy=b;yy<b+h;yy++)for(let xx=a;xx<a+w;xx++)s.blocked.add(key(xx,yy));}}return o;}
 function door(s,id,x,y,axis,span,extra){const o={id,x,y,axis,span,door:true,depth:x+y+span*.5+.02,...extra};s.doors.push(o);return o;}
 const foyer=scene('foyer',28,28,'Центральное фойе');
 for(let y=0;y<26;y++)for(let x=0;x<26;x++)if(Math.hypot(x+.5-13,y+.5-13)<=12.6)foyer.tiles.add(key(x,y));
 rect(foyer,11,24,4,3);rect(foyer,24,11,3,4);
 // A solid, compact octagonal lift core. The same footprint controls navigation and rendering.
 for(let y=11;y<15;y++)for(let x=11;x<15;x++)if(!((x===11||x===14)&&(y===11||y===14)))foyer.blocked.add(key(x,y));
 prop(foyer,'liftCore',null,13,13,1,{kind:'core',depth:25.9,blocked:false});
 door(foyer,'lift',12,15,'x',2,{label:'Вызвать пассажирский лифт',target:'ЛИФТ A · ОСНОВНЫЕ ЭТАЖИ',action:'levels',approach:[13,16.5]});
 door(foyer,'liftB',15,12,'y',2,{label:'Вызвать пассажирский лифт',target:'ЛИФТ B · ОСНОВНЫЕ ЭТАЖИ',action:'levels',approach:[16.5,13]});
 door(foyer,'entry',12,27,'x',2,{label:'Войти в шлюзовой блок',target:'ВХОД И ДЕЗАКТИВАЦИЯ',to:'entry',spawn:[7.5,1.5],approach:[13,25.5]});
 door(foyer,'exit',27,12,'y',2,{label:'К выходу на Поверхность',target:'ИЗОЛИРОВАННЫЙ ВЫХОД',to:'surface',spawn:[1.5,4.5],approach:[25.5,13]});
 // Reception is a single furnished station facing the arrival route.
 prop(foyer,'registration','counter',7.1,6.5,1.06,{action:'registration',label:'Оформить заселение',target:'01 / РЕГИСТРАЦИЯ',approach:[8.5,7.5],footprint:[5,4,4,3]});
 prop(foyer,'registrationChair','chair',5.8,4.4,.75);
 prop(foyer,'receptionSign',null,6.5,4.1,1,{kind:'sign',depth:10.3,blocked:false});
 prop(foyer,'receptionFiles','shelf',4.2,6.2,.85);
 prop(foyer,'receptionLocker','receptionBack',7,3.3,.8);
 prop(foyer,'receptionLocker2','receptionBack',8,3.3,.8);
 prop(foyer,'welcomeScreen','screen',6.1,3.7,.84,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[5.5,7.5],blocked:false});
 prop(foyer,'regScreen','terminalBack',5.1,8.2,.8,{action:'welcome',label:'Прочитать приветствие',target:'ДОБРО ПОЖАЛОВАТЬ',approach:[5.5,9.5]});
 prop(foyer,'mainTerminal','console',10.1,4.9,1.05,{action:'terminal',label:'Открыть главный терминал',target:'02 / ГЛАВНЫЙ ТЕРМИНАЛ',approach:[10.5,6.5]});
 prop(foyer,'registrationLampL','lamp',4.2,8.7,1,{light:true});
 prop(foyer,'registrationLampR','lamp',10.8,3.2,1,{light:true});
 prop(foyer,'registrationPlantL','cactus',3.4,7.6,.75,{planter:true});
 prop(foyer,'registrationPlantR','cactus',9.7,2.6,.75,{planter:true});
 // Two complete seating groups leave the ring route clear.
 for(const [i,x,y]of[[0,4.6,13],[1,8.2,19.2]]){
  prop(foyer,'sofa'+i,'sofa',x,y,1.65,{footprint:[Math.floor(x)-1,Math.floor(y)-1,2,1]});
  prop(foyer,'coffeeTable'+i,'table',x+1.6,y+.9,.64,{action:'magazines',label:'Посмотреть журналы',target:'ЗАЛ ОЖИДАНИЯ',approach:[x+2.4,y+1.6]});
  prop(foyer,'loungeChair'+i,'loungeChair',x+3.1,y+.5,1.35,{flip:true});
  prop(foyer,'loungeChairB'+i,'loungeChair',x+2.4,y+2.2,1.35);
  prop(foyer,'waitingLamp'+i,'lamp',x-.7,y+1.5,1,{light:true});
  prop(foyer,'waitingPlant'+i,'cactus',x+1.1,y-1.7,.7,{planter:true});
 }
 prop(foyer,'notice','screen2',3.1,10.6,.75,{action:'notices',label:'Прочитать объявления',target:'ОБЪЯВЛЕНИЯ УБЕЖИЩА',approach:[4.5,10.5]});
 prop(foyer,'waitingCabinet','cabinet',2.8,14.8,.85);
 // Information desk and robot station along the service side.
 prop(foyer,'infoCounter','counter',19.5,6.8,.78,{flip:true,footprint:[18,5,3,2]});
 prop(foyer,'residential','terminal',18.5,8.5,.8,{action:'residential',label:'Маршрут к жилым секциям',target:'03 / НАВИГАЦИЯ',approach:[17.5,8.5]});
 prop(foyer,'freight','console',22.5,9.5,.85,{action:'freight',label:'Проверить служебный маршрут',target:'СЛУЖЕБНЫЕ МАРШРУТЫ',approach:[21.5,10.5]});
 prop(foyer,'robot','machine',20.8,8.5,.8,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[19.5,9.5]});
 prop(foyer,'infoLamp','lamp',22.5,7.5,1,{light:true});
 prop(foyer,'infoPlant','cactus',17.6,4.6,.8,{planter:true});
 prop(foyer,'serviceShelf','shelf',22.5,17.5,.9);
 prop(foyer,'serviceBox','box',21.5,18.5,1.35,{action:'chest',label:'Открыть ящик',target:'СЛУЖЕБНЫЙ ЯЩИК',approach:[20.5,18.5]});
 prop(foyer,'serviceCabinet','cabinet',23,15.5,.9);
 prop(foyer,'surfaceLamp','lamp',24.2,11.2,1,{light:true});
 prop(foyer,'entryCabinetL','receptionBack',10.2,23.4,.85);
 prop(foyer,'entryCabinetR','receptionBack',15.8,23.4,.85);
 prop(foyer,'entryLampL','lamp',11.1,24.7,1,{light:true});
 prop(foyer,'entryLampR','lamp',14.9,24.7,1,{light:true});
 // Fitted architectural elements use the same world coordinates as the tile grid.
 for(const [i,x,y]of[[0,3,9],[1,11,2],[2,2,17],[3,18,3],[4,24,10]])prop(foyer,'pilaster'+i,'column',x,y,.92);
 foyer.labels=[['01 · РЕГИСТРАЦИЯ',7.2,5.8,2.65],['ОЖИДАНИЕ',4.8,14.5,2.3],['03 · НАВИГАЦИЯ',20,6,2.6]];
 const entry=scene('entry',12,19,'Входной шлюз и дезактивация');rect(entry,0,0,12,19);
 for(const y of[5,12])for(let x=0;x<12;x++){if(x<5||x>6){wall(entry,x,y,'x',x>7,true);entry.blocked.add(key(x,y));}}
 door(entry,'entryReturn',7,0,'x',2,{label:'Вернуться в фойе',target:'ЦЕНТРАЛЬНОЕ ФОЙЕ',to:'foyer',spawn:[13,25.5],approach:[7.5,1.5]});
 door(entry,'cleanInner',5,5,'x',2,{label:'Открыть внутреннюю дверь',target:'КАМЕРА ОБРАБОТКИ',approach:[5.5,3.5],internal:true});
 door(entry,'cleanOuter',5,12,'x',2,{label:'Открыть дверь шлюза',target:'ВХОДНОЙ ШЛЮЗ',approach:[5.5,10.5],internal:true});
 door(entry,'entryOuter',5,19,'x',2,{label:'Запросить открытие ворот',target:'ВНЕШНИЙ КОНТУР',action:'denied',approach:[6,17.5]});
 prop(entry,'scanner','terminal',3,2.4,.8,{action:'scan',label:'Пройти проверку допуска',target:'КОНТРОЛЬ ДОСТУПА',approach:[4.5,2.5]});
 prop(entry,'cleanControl','terminal',3,8.5,.7,{action:'decon',label:'Запустить дезактивацию',target:'САНИТАРНАЯ ОБРАБОТКА',approach:[4.5,8.5]});
 for(const [i,x,y]of[[0,1,7],[1,10,7],[2,1,10],[3,10,10]])prop(entry,'spray'+i,'machine',x,y,.65);
 prop(entry,'controlRobot','machine',9,2.5,.7,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[9.5,3.5]});
 prop(entry,'airlockScreen','screen',1.5,15,.7,{action:'airlock',label:'Прочитать инструкцию',target:'ГЕРМЕТИЧНЫЙ ШЛЮЗ',approach:[2.5,15.5]});
 entry.labels=[['КОНТРОЛЬ ДОСТУПА',5.5,2,2.4],['ДЕЗАКТИВАЦИЯ',6,8,2.6],['ВХОДНОЙ ШЛЮЗ',6,16,2.8]];
 const surface=scene('surface',13,9,'Изолированный выход на Поверхность');rect(surface,0,0,13,9);
 door(surface,'surfaceReturn',0,4,'y',2,{label:'Вернуться в фойе',target:'ЦЕНТРАЛЬНОЕ ФОЙЕ',to:'foyer',spawn:[25.5,13],approach:[1.5,4.5]});
 door(surface,'surfaceGate',13,3,'y',3,{label:'Попытаться выйти',target:'ПОВЕРХНОСТЬ',action:'denied',approach:[11.5,4.5]});
 prop(surface,'surfacePanel','terminal',9,2,.8,{action:'denied',label:'Запросить доступ',target:'БЛОКИРОВКА ВЫХОДА',approach:[9.5,3.5]});
 prop(surface,'warning','screen',7,.9,.8,{action:'surfaceInfo',label:'Прочитать ограничения',target:'ВНЕШНИЙ КОНТУР',approach:[7.5,2.5]});
 prop(surface,'safetyCabinet','wardrobe',3,1,.8);prop(surface,'exitMachine','machine',11,7,.7);
 surface.labels=[['ВЫХОД НА ПОВЕРХНОСТЬ',9,4,2.7]];
 const surfaceTextures={};
 const WALL_HEIGHT=2.25,WALL_THICKNESS=.14,DOOR_DURATION=.85;
 // Rectify source sprite faces once; every placement then shares world geometry.
 function faceTexture(image,p0,p1,p3,w,h){
  const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
  const s=source.getContext('2d');s.drawImage(image,0,0);const pixels=s.getImageData(0,0,source.width,source.height).data;
  const out=document.createElement('canvas');out.width=w;out.height=h;const g=out.getContext('2d'),data=g.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=(x+.5)/w,v=(y+.5)/h,sx=Math.max(0,Math.min(source.width-1,Math.floor(p0[0]+u*(p1[0]-p0[0])+v*(p3[0]-p0[0])))),sy=Math.max(0,Math.min(source.height-1,Math.floor(p0[1]+u*(p1[1]-p0[1])+v*(p3[1]-p0[1])))),i=(sy*source.width+sx)*4,j=(y*w+x)*4;
   for(let c=0;c<3;c++)data.data[j+c]=pixels[i+3]?pixels[i+c]:[93,111,101][c];data.data[j+3]=255;
  }g.putImageData(data,0,0);return out;
 }
 function buildSurfaces(){
  surfaceTextures.floor=faceTexture(images.floor,[37,1],[73,19],[1,19],64,64);
  surfaceTextures.grate=faceTexture(images.grate,[37,1],[73,19],[1,19],64,64);
  surfaceTextures.wall=faceTexture(darkImages.wallA,[2,12],[36,29],[2,96],40,100);
  surfaceTextures.detail=faceTexture(darkImages.wallDetailA,[2,12],[37,29],[2,96],40,100);
  surfaceTextures.door=faceTexture(darkImages.door,[48,64],[105,50],[48,126],64,96);
 }
 function screenQuad(vertices){return vertices.map(v=>project(...v));}
 function textureQuad(image,vertices,crop=null){
  const p=screenQuad(vertices),w=crop?crop[2]:image.width,h=crop?crop[3]:image.height;
  ctx.save();ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.clip();
  ctx.transform((p[1][0]-p[0][0])/w,(p[1][1]-p[0][1])/w,(p[3][0]-p[0][0])/h,(p[3][1]-p[0][1])/h,p[0][0],p[0][1]);
  if(crop)ctx.drawImage(image,...crop,0,0,w,h);else ctx.drawImage(image,0,0);ctx.restore();
 }
 function tileVertices(x,y){return[[x,y,0],[x+1,y,0],[x+1,y+1,0],[x,y+1,0]];}
 function floorDraw(sc){
  // Shared vertices and one material prevent tile rescaling seams and checker patches.
  for(const k of sc.tiles){const[x,y]=k.split(',').map(Number),v=tileVertices(x,y);polygon(v,'#58665e');textureQuad(surfaceTextures.floor,v);}
  ctx.beginPath();const edges=new Set();
  for(const k of sc.tiles){const[x,y]=k.split(',').map(Number);for(const [a,b]of[[[x,y],[x+1,y]],[[x,y],[x,y+1]],[[x+1,y],[x+1,y+1]],[[x,y+1],[x+1,y+1]]]){const id=a.join(',')+'|'+b.join(',');if(edges.has(id))continue;edges.add(id);ctx.moveTo(...project(...a));ctx.lineTo(...project(...b));}}
  ctx.strokeStyle='#33443ec9';ctx.lineWidth=Math.max(.55,state.zoom*.65);ctx.stroke();
 }
 function wallPoint(o,u,z,n=0){return o.axis==='x'?[o.x+u,o.y+n,z]:[o.x+n,o.y+u,z];}
 function wallFace(o,a,b,z0,z1,n=0){return[wallPoint(o,a,z1,n),wallPoint(o,b,z1,n),wallPoint(o,b,z0,n),wallPoint(o,a,z0,n)];}
 function wallPanel(o,a,b,z0,z1,texture='wall'){
  const t=WALL_THICKNESS;
  // Thickness stays behind the common wall line; adjacent panels share both endpoints.
  polygon([wallPoint(o,b,z0,-t),wallPoint(o,b,z0),wallPoint(o,b,z1),wallPoint(o,b,z1,-t)],'#46574f');
  const front=wallFace(o,a,b,z0,z1);textureQuad(surfaceTextures[texture],front);
  polygon([wallPoint(o,a,z1,-t),wallPoint(o,b,z1,-t),wallPoint(o,b,z1),wallPoint(o,a,z1)],'#939e8b','#b4baa4');
  const p=project(...wallPoint(o,a,z0)),q=project(...wallPoint(o,a,z1));ctx.strokeStyle='#bac3ae66';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();
 }
 function rawWallDraw(o){
  const h=o.low?.34:WALL_HEIGHT;wallPanel(o,0,1,0,h,!o.low&&(o.x+o.y)%5===0?'detail':'wall');
 }
 const wallCaches={};
 function bakeWalls(){const old={W,H,ctx,cam:state.cam,zoom:state.zoom};for(const axis of['x','y'])for(const low of[false,true])for(const detail of[false,true]){const c=document.createElement('canvas');c.width=184;c.height=290;ctx=c.getContext('2d');ctx.scale(2,2);ctx.imageSmoothingEnabled=false;W=92;H=145;state.zoom=1;const sum=(H*.53-111)/19,diff=(W/2-44)/38;state.cam={x:(sum+diff)/2,y:(sum-diff)/2};wallPanel({x:0,y:0,axis},0,1,0,low?.34:WALL_HEIGHT,detail&&!low?'detail':'wall');wallCaches[axis+low+detail]=c;}W=old.W;H=old.H;ctx=old.ctx;state.cam=old.cam;state.zoom=old.zoom;}
 function wallDraw(o){const p=project(o.x,o.y),z=state.zoom,c=wallCaches[o.axis+!!o.low+((o.x+o.y)%5===0)];if(c)ctx.drawImage(c,p[0]-44*z,p[1]-111*z,92*z,145*z);else rawWallDraw(o);}
 function doorWorld(o,u=.5,z=0,n=0){return wallPoint(o,u*o.span,z,n);}
 function doorClear(o){return !!state.open[o.id]&&(state.anim[o.id]||0)>=.96;}
 function doorMoving(o){return Math.abs((state.anim[o.id]||0)-(state.open[o.id]?1:0))>.001;}
 function doorOccupied(o){const along=o.axis==='x'?player.x-o.x:player.y-o.y,across=o.axis==='x'?player.y-o.y:player.x-o.x;return along>-.15&&along<o.span+.15&&Math.abs(across)<.4;}
 function doorDraw(o){
  const span=o.span,edge=.12,h=1.96,p0=edge,p1=span-edge,p=(state.anim[o.id]||0),ease=p*p*(3-2*p),q=(p1-p0)/2;
  // The threshold is in the same floor plane, not part of a pre-rendered wall image.
  polygon([wallPoint(o,0,0,-.12),wallPoint(o,span,0,-.12),wallPoint(o,span,.015,.12),wallPoint(o,0,.015,.12)],'#818874','#b3b79b');
  if(o.to||o.action)polygon(wallFace(o,p0,p1,.02,h,-.05),'#0d1613');
  const opening=wallFace(o,p0,p1,.035,h,-.025),screen=screenQuad(opening);
  ctx.save();ctx.beginPath();screen.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.clip();
  const left=p0-q*ease,right=p0+q+q*ease;
  textureQuad(surfaceTextures.door,wallFace(o,left,left+q,.035,h,-.025),[0,0,32,96]);
  textureQuad(surfaceTextures.door,wallFace(o,right,right+q,.035,h,-.025),[32,0,32,96]);
  // The sealing edges move with the leaves, and disappear inside the jambs.
  for(const u of[left+q,right]){const a=project(...wallPoint(o,u,.04,-.022)),b=project(...wallPoint(o,u,h,-.022));ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle='#b9bca144';ctx.lineWidth=1;ctx.stroke();}
  ctx.restore();
  wallPanel(o,0,edge,0,h);wallPanel(o,span-edge,span,0,h);wallPanel(o,0,span,h,WALL_HEIGHT);
  // A continuous inset frame, two rails and a status lamp remain fixed throughout.
  for(const u of[p0,p1]){const a=project(...wallPoint(o,u,.035,.006)),b=project(...wallPoint(o,u,h,.006));ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle='#283c33';ctx.lineWidth=1.5*state.zoom;ctx.stroke();}
  polygon(wallFace(o,span*.4,span*.6,2.05,2.12,.012),doorClear(o)?'#99ba82':doorMoving(o)?'#c3a463':'#9f5f49');
 }
 function rebuildEnvelope(s){
  s.walls=s.walls.filter(o=>o.internal);
  for(const k of s.tiles){const[x,y]=k.split(',').map(Number);
   if(!s.tiles.has(key(x,y-1)))wall(s,x,y,'x');
   if(!s.tiles.has(key(x-1,y)))wall(s,x,y,'y');
   if(!s.tiles.has(key(x,y+1)))wall(s,x,y+1,'x',true);
   if(!s.tiles.has(key(x+1,y)))wall(s,x+1,y,'y',true);
  }
  s.walls=s.walls.filter(w=>!s.doors.some(d=>d.axis===w.axis&&(d.axis==='x'?w.y===d.y&&w.x>=d.x&&w.x<d.x+d.span:w.x===d.x&&w.y>=d.y&&w.y<d.y+d.span)));
 }
 function doorUiPoint(o,z=1.1){return project(...doorWorld(o,.5,z));}

 for(const s of Object.values(scenes)) rebuildEnvelope(s);
 function current(){return scenes[state.scene];}
 function project(x,y,z=0){return[W/2+(x-y-state.cam.x+state.cam.y)*38*state.zoom,H*.53+(x+y-state.cam.x-state.cam.y)*19*state.zoom-z*42*state.zoom];}
 function inverse(x,y){const a=(x-W/2)/(38*state.zoom)+state.cam.x-state.cam.y,b=(y-H*.53)/(19*state.zoom)+state.cam.x+state.cam.y;return{x:(a+b)/2,y:(b-a)/2};}
 function polygon(verts,fill,stroke){ctx.beginPath();verts.forEach((v,i)=>i?ctx.lineTo(...project(...v)):ctx.moveTo(...project(...v)));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
 function pass(x,y,s=current()){if(!s.tiles.has(key(x,y))||s.blocked.has(key(x,y)))return false;for(const d of s.doors)if(d.internal&&!doorClear(d)){const along=d.axis==='x'?x-d.x:y-d.y,across=d.axis==='x'?y-d.y:x-d.x;if(along>=0&&along<d.span&&across>=0&&across<1)return false;}return true;}
 function pathTo(tx,ty){const sx=Math.floor(player.x),sy=Math.floor(player.y),ex=Math.floor(tx),ey=Math.floor(ty);if(!pass(ex+.5,ey+.5))return null;const queue=[[sx,sy]],parents=new Map([[key(sx,sy),null]]);let i=0;while(i<queue.length){const[x,y]=queue[i++];if(x===ex&&y===ey){let result=[],p=[x,y];while(p){result.unshift({x:p[0]+.5,y:p[1]+.5});p=parents.get(key(...p));}result.shift();return result;}for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,k=key(a,b);if(!parents.has(k)&&pass(a+.5,b+.5)){parents.set(k,[x,y]);queue.push([a,b]);}}}return null;}
 function interactables(){return [...current().doors,...current().objects.filter(o=>o.action)];}
 function distance(o){if(o.internal){const along=o.axis==='x'?player.x-o.x:player.y-o.y,across=o.axis==='x'?player.y-o.y:player.x-o.x;return Math.hypot(Math.max(0,-along,along-o.span),across-.4);}const a=o.approach||[o.x,o.y];return Math.hypot(player.x-a[0],player.y-a[1]);}
 function say(s){api.onNotice?.(s);}
 function nearObject(){let best=null,dist=1.7;for(const o of interactables()){const d=distance(o);if(d<dist){best=o;dist=d;}}return best;}
 function updateAction(){const o=state.selected&&distance(state.selected)<1.7?state.selected:nearObject();state.near=o;let label=o?.label||'Подойдите к объекту';const busy=!!state.transition||!!state.cycle||(o?.door&&doorMoving(o));if(state.transition)label=state.transition.phase==='opening'?'Дверь открывается…':'Дверь закрывается…';else if(state.cycle)label='Идёт обработка…';else if(o?.internal&&state.open[o.id])label='Закрыть дверь';else if(o?.action==='chest'&&state.open[o.id])label='Закрыть ящик';api.onTarget?.({label,target:o?.target||'',disabled:!o||busy});}
 function request(o){if(!o||state.transition||state.cycle)return;state.selected=o;let candidates=[];if(o.internal)candidates=[[o.x+.5,o.y-.5],[o.x+.5,o.y+1.5],[o.x+1.5,o.y-.5],[o.x+1.5,o.y+1.5]];else if(o.approach)candidates=[o.approach];else for(const[dx,dy]of[[0,1],[1,0],[-1,0],[0,-1]])candidates.push([Math.floor(o.x)+dx+.5,Math.floor(o.y)+dy+.5]);let best=null;for(const c of candidates){const p=pathTo(...c);if(p&&(!best||p.length<best.length))best=p;}if(best){state.path=best;say('Подойдите и нажмите кнопку действия.');}else if(distance(o)<1.7)state.path=[];else say('Проход закрыт. Сначала откройте ближайшую дверь.');updateAction();dirty=true;}
 function enter(o){const from=state.scene;state.saved[from]={cam:{...state.cam},zoom:state.zoom};state.open[o.id]=false;state.anim[o.id]=0;state.scene=o.to;player.x=o.spawn[0];player.y=o.spawn[1];player.moving=false;state.path=[];state.selected=null;const saved=state.saved[o.to];state.zoom=saved?.zoom||1;state.cam={x:player.x,y:player.y};const arrival=current().doors.find(d=>d.to===from);state.transition=arrival?{door:arrival,phase:'closing',hold:0}:null;if(arrival){state.anim[arrival.id]=1;state.open[arrival.id]=false;}api.onScene?.(current().label);say(o.to==='entry'?'Внутренняя дверь ведёт в дезактивационную камеру.':o.to==='surface'?'Выход на Поверхность изолирован от общего маршрута.':'Центральное фойе.');updateAction();dirty=true;}
 function act(){const o=state.near;if(!o||distance(o)>1.7||state.transition||state.cycle)return;state.path=[];keys.clear();player.moving=false;if(o.to){state.transition={door:o,phase:'opening',hold:0};state.open[o.id]=true;}else if(o.internal){if(doorMoving(o))return;if(state.open[o.id]&&(doorOccupied(o)||(player.y>=o.y&&player.y<o.y+1&&player.x>=o.x&&player.x<o.x+o.span))){say('Отойдите от дверного проёма.');return;}state.open[o.id]=!state.open[o.id];say(state.open[o.id]?'Открываем дверь.':'Закрываем дверь.');}else if(o.action==='chest'){state.open[o.id]=!state.open[o.id];say(state.open[o.id]?'В ящике — пустые упаковки и запасные фильтры.':'Ящик закрыт.');}else if(o.action==='decon')startDecon();else api.onAction?.(o.action);dirty=true;updateAction();}
 function startDecon(){if(state.scene!=='entry'||player.y<=5.7||player.y>=11.8){say('Войдите внутрь дезактивационной камеры.');return;}state.cycle={t:0,phase:'closing'};for(const id of['cleanInner','cleanOuter'])state.open[id]=false;state.path=[];keys.clear();api.onProcess?.({active:true,progress:0,label:'Герметизация камеры'});}
 function animate(dt){for(const o of current().doors){const target=state.open[o.id]?1:0,a=state.anim[o.id]||0;if(Math.abs(a-target)>.0001){const step=dt/DOOR_DURATION;state.anim[o.id]=target>a?Math.min(target,a+step):Math.max(target,a-step);dirty=true;}}const tr=state.transition;if(tr?.phase==='opening'&&(state.anim[tr.door.id]||0)>=1){tr.hold+=dt;if(tr.hold>=.15)enter(tr.door);}else if(tr?.phase==='closing'&&(state.anim[tr.door.id]||0)<=0)state.transition=null;
  const cycle=state.cycle;if(cycle){dirty=true;if(cycle.phase==='closing'){if((state.anim.cleanInner||0)===0&&(state.anim.cleanOuter||0)===0){cycle.phase='steam';cycle.t=0;}}else if(cycle.phase==='steam'){cycle.t+=dt;api.onProcess?.({active:true,progress:Math.min(1,cycle.t/4.8),label:cycle.t<3.5?'Дезактивация…':'Проверка чистоты…'});if(cycle.t>=4.8){cycle.phase='opening';state.open.cleanInner=true;api.onProcess?.({active:true,progress:1,label:'Обработка завершена'});}}else if(cycle.phase==='opening'&&(state.anim.cleanInner||0)>=1){state.cycle=null;api.onProcess?.({active:false});say('Обработка завершена. Внутренний проход открыт.');}}
 }
 function move(dx,dy,dt){const len=Math.hypot(dx,dy);if(len<.001)return false;const step=3.6*dt,nx=player.x+dx/len*step,ny=player.y+dy/len*step;if(pass(nx,ny)){player.x=nx;player.y=ny;player.angle=Math.atan2(dy,dx)-Math.PI/2;player.phase+=dt*9;return true;}return false;}
 function drawSprite(name,x,y,scale=1,anchor=.5,flip=false,z=0){const image=images[name],p=project(x,y,z);if(!image)return;const w=image.width*scale*state.zoom,h=image.height*scale*state.zoom;if(p[0]+w<0||p[0]-w>W||p[1]<0||p[1]-h>H)return;ctx.save();if(flip){ctx.translate(Math.round(p[0]),0);ctx.scale(-1,1);ctx.drawImage(image,Math.round(-w*anchor),Math.round(p[1]-h),Math.round(w),Math.round(h));}else ctx.drawImage(image,Math.round(p[0]-w*anchor),Math.round(p[1]-h),Math.round(w),Math.round(h));ctx.restore();}
 function boxShape(x,y,w,h,z,col){polygon([[x,y,0],[x+w,y,0],[x+w,y,z],[x,y,z]],col[0]);polygon([[x+w,y,0],[x+w,y+h,0],[x+w,y+h,z],[x+w,y,z]],col[1]);polygon([[x,y+h,0],[x+w,y+h,0],[x+w,y+h,z],[x,y+h,z]],col[0]);polygon([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],col[2],'#879184');}
 function coreDraw(){
  const pts=[[12,11],[14,11],[15,12],[15,14],[14,15],[12,15],[11,14],[11,12]],h=WALL_HEIGHT;
  for(let i=0;i<8;i++){if(i===2||i===4)continue;const a=pts[i],b=pts[(i+1)%8],v=[[...a,h],[...b,h],[...b,0],[...a,0]];textureQuad(surfaceTextures.wall,v);polygon(v,i<2||i>5?'#13211933':'#18231c11');}
  polygon(pts.map(p=>[...p,h]),'#3d4942','#8e9887');
  const inset=pts.map(([x,y])=>[13+(x-13)*.91,13+(y-13)*.91,h+.04]);polygon(inset,'#4b594e','#737e69');
  for(let y=12;y<14;y++)for(let x=12;x<14;x++)textureQuad(surfaceTextures.grate,tileVertices(x,y).map(([x,y])=>[x,y,h+.06]));
  // Thin brass edge and the destination plate are part of the lift housing.
  for(const [x,y,axis]of[[12,15,'x'],[15,12,'y']]){const o={x,y,axis};polygon(wallFace(o,0,2,2.18,2.25,.015),'#ac9b66');}
 }
 function planterDraw(o){const a={x:o.x-.34,y:o.y+.34,axis:'x'},b={x:o.x+.34,y:o.y-.34,axis:'y'};textureQuad(surfaceTextures.wall,wallFace(a,0,.68,0,.35));textureQuad(surfaceTextures.wall,wallFace(b,0,.68,0,.35));polygon([[o.x-.34,o.y-.34,.35],[o.x+.34,o.y-.34,.35],[o.x+.34,o.y+.34,.35],[o.x-.34,o.y+.34,.35]],'#5e6857','#929981');polygon([[o.x-.26,o.y-.26,.355],[o.x+.26,o.y-.26,.355],[o.x+.26,o.y+.26,.355],[o.x-.26,o.y+.26,.355]],'#34382a');}
 let receptionSign;
 function signDraw(){
  if(!receptionSign){receptionSign=document.createElement('canvas');receptionSign.width=420;receptionSign.height=136;const g=receptionSign.getContext('2d');g.fillStyle='#203329';g.fillRect(0,0,420,136);g.strokeStyle='#aa9864';g.lineWidth=3;g.strokeRect(3,3,414,130);g.strokeStyle='#b7aa76';g.lineWidth=4;for(const r of[25,13]){g.beginPath();g.arc(64,59,r,0,Math.PI*2);g.stroke();}for(const y of[48,69]){g.beginPath();g.moveTo(14,y);g.lineTo(39,y);g.moveTo(89,y);g.lineTo(114,y);g.stroke();}g.fillStyle='#dbca89';g.font='bold 38px monospace';g.fillText('VAULT-TEC',133,70);g.font='16px monospace';g.fillStyle='#a7bb98';g.fillText('WELCOME TO STARFIELD',104,111);}
  const o={x:4.6,y:4.15,axis:'x'};boxShape(4.6,4.1,.13,.14,2.7,['#48584a','#334235','#899177']);boxShape(8.85,4.1,.13,.14,2.7,['#48584a','#334235','#899177']);textureQuad(receptionSign,wallFace(o,0,4.4,1.72,2.8,.02));
 }
 function rug(x,y,w,h){const v=[[x,y,.02],[x+w,y,.02],[x+w,y+h,.02],[x,y+h,.02]];polygon(v,'#564d3bce','#8b805d');polygon([[x+.13,y+.13,.023],[x+w-.13,y+.13,.023],[x+w-.13,y+h-.13,.023],[x+.13,y+h-.13,.023]],'#394b43ba','#8a815b');for(let i=0;i<10;i++){const yy=y+.25+(h-.5)*i/9;polygon([[x+.2,yy,.025],[x+w-.2,yy,.025],[x+w-.2,yy+.012,.025],[x+.2,yy+.012,.025]],'#bea87815');}}
 function floorAccents(sc){
  if(sc.id==='foyer'){
   rug(4,11.4,4.3,4.8);rug(7.6,17.6,4.4,4.8);rug(5.2,6.6,5,2.4);
   // Wayfinding is painted on the shared floor; room materials remain consistent.
   for(const [x,y,w,h]of[[11.25,17.3,3.5,.06],[17.3,11.25,.06,3.5],[12,24,2,.065],[24,12,.065,2]])polygon([[x,y,.018],[x+w,y,.018],[x+w,y+h,.018],[x,y+h,.018]],'#b4a271aa');
  }
  for(const o of sc.objects){if(o.kind==='core'||o.kind==='sign')continue;const p=project(o.x,o.y,.01),z=state.zoom;ctx.save();ctx.translate(p[0],p[1]);ctx.scale(1,.45);if(o.light){const r=65*z,g=ctx.createRadialGradient(0,0,4*z,0,0,r);g.addColorStop(0,'#e2c68a35');g.addColorStop(1,'#e2c68a00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();}ctx.fillStyle='#0a171735';ctx.beginPath();ctx.ellipse(-4*z,0,(o.sprite==='counter'?67:17)*o.scale*z,14*o.scale*z,0,0,7);ctx.fill();ctx.restore();}
 }
 function label(text,x,y,z=1.9,col='#c4cbb5'){const p=project(x,y,z);if(p[0]<-120||p[0]>W+120||p[1]<-20||p[1]>H+20)return;ctx.font='12px monospace';ctx.textAlign='center';const tw=ctx.measureText(text).width;ctx.fillStyle='#132019ef';ctx.fillRect(Math.round(p[0]-tw/2-6),Math.round(p[1]-13),tw+12,19);ctx.fillStyle=col;ctx.fillText(text,Math.round(p[0]),Math.round(p[1]));}
 function actor(){const c=Math.cos(player.angle),s=Math.sin(player.angle),faces=[],bob=player.moving?Math.abs(Math.sin(player.phase))*.014:0;
 function point(x,y,z){return[player.x+x*c-y*s,player.y+x*s+y*c,z+bob];}
 function rings(rows,col,n=10){const vs=rows.map(([x,y,z,rx,ry])=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return point(x+Math.cos(a)*rx,y+Math.sin(a)*ry,z);}));
 for(let r=0;r<vs.length-1;r++)for(let i=0;i<n;i++){const j=(i+1)%n,v=[vs[r][i],vs[r][j],vs[r+1][j],vs[r+1][i]],angle=(i+.5)/n*Math.PI*2+player.angle,shade=.72+.23*Math.cos(angle-2.7)+.07*(r%2);faces.push({v,depth:v.reduce((a,p)=>a+p[0]+p[1]+p[2]*.055,0)/4,col:'rgb('+col.map(a=>Math.round(a*shade)).join(',')+')'});}
 const v=vs[vs.length-1];faces.push({v,depth:v.reduce((a,p)=>a+p[0]+p[1]+p[2]*.055,0)/n,col:'rgb('+col.map(a=>Math.min(255,Math.round(a*1.12))).join(',')+')'});}
 const stride=player.moving?Math.sin(player.phase)*.17:0;
 for(const side of[-1,1]){const a=side*stride,x=side*.115;
 rings([[x,a-.04,.04,.085,.17],[x,a-.04,.12,.083,.16],[x,a,.22,.065,.09]],[61,53,40]);
 rings([[x,a,.18,.069,.087],[x,a*.78,.38,.066,.072],[x,a*.58,.51,.075,.087],[x,a*.14,.76,.092,.1],[x,0,.87,.094,.11]],[59,91,112]);
 rings([[side*.195,0,1.32,.082,.085],[side*.228,-a*.3,1.14,.073,.076],[side*.238,-a*.65,1.02,.069,.067],[side*.242,-a*.8,.85,.055,.066]],[60,92,112]);
 rings([[side*.242,-a*.8,.86,.05,.061],[side*.242,-a*.9,.76,.053,.066],[side*.242,-a*.9,.72,.025,.042]],[160,135,99]);}
 rings([[0,0,.78,.185,.105],[0,0,.87,.183,.117],[0,0,.93,.17,.108]],[67,75,71]);
 rings([[0,0,.9,.17,.1],[0,0,1.02,.173,.107],[0,.006,1.23,.23,.135],[0,.012,1.34,.22,.13],[0,0,1.4,.115,.09]],[63,96,119]);
 rings([[0,0,.91,.18,.113],[0,0,.967,.18,.113]],[168,146,78]);
 rings([[0,0,1.37,.074,.066],[0,-.015,1.48,.065,.065]],[152,126,94]);
 rings([[0,-.008,1.45,.055,.06],[0,-.024,1.5,.093,.089],[0,-.016,1.63,.115,.112],[0,0,1.70,.096,.107],[0,0,1.73,.051,.065]],[166,141,108]);
 rings([[0,.035,1.62,.112,.075],[0,.022,1.72,.112,.095],[0,.01,1.75,.075,.074],[0,.012,1.77,.025,.035]],[66,58,45]);
 rings([[-.31,stride*.8,.88,.07,.088],[-.31,stride*.8,.96,.07,.088]],[84,107,69]);
 const z=state.zoom,p=project(player.x,player.y);ctx.fillStyle='#08110e66';ctx.beginPath();ctx.ellipse(p[0],p[1]-2*z,14*z,6*z,0,0,7);ctx.fill();faces.sort((a,b)=>a.depth-b.depth);for(const f of faces)polygon(f.v,f.col);
 polygon([point(-.026,-.114,.97),point(.026,-.114,.97),point(.034,-.139,1.29),point(-.034,-.139,1.29)],'#c0a458');
 ctx.strokeStyle='#c2b47c';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p[0],p[1],12*z,5*z,0,0,7);ctx.stroke();}

 const floorCaches={};
 function buildFloorCache(sc){const old={W,H,ctx,cam:state.cam,zoom:state.zoom};const c=document.createElement('canvas'),tw=(sc.w+sc.h)*38+20,th=(sc.w+sc.h)*19+20;c.width=tw*2;c.height=th*2;const g=c.getContext('2d');g.scale(2,2);g.imageSmoothingEnabled=false;const tex=surfaceTextures.floor;for(const k of sc.tiles){const[x,y]=k.split(',').map(Number),px=10+sc.h*38+(x-y)*38,py=10+(x+y)*19;g.save();g.beginPath();g.moveTo(px,py);g.lineTo(px+38,py+19);g.lineTo(px,py+38);g.lineTo(px-38,py+19);g.closePath();g.fillStyle='#52665a';g.fill();g.clip();g.transform(38/64,19/64,-38/64,19/64,px,py);g.drawImage(tex,0,0);g.restore();g.strokeStyle='#304338b0';g.lineWidth=.7;g.beginPath();g.moveTo(px,py);g.lineTo(px+38,py+19);g.moveTo(px,py);g.lineTo(px-38,py+19);g.stroke();}// Bake fixed furnishings' shadows, light pools and rugs once into the floor.
  W=tw;H=th;ctx=g;state.zoom=1;const sum=(H*.53-10)/19,diff=(W/2-(10+sc.h*38))/38;state.cam={x:(sum+diff)/2,y:(sum-diff)/2};floorAccents(sc);W=old.W;H=old.H;ctx=old.ctx;state.cam=old.cam;state.zoom=old.zoom;
  floorCaches[sc.id]={canvas:c,x:10+sc.h*38,y:10,tw,th};}
 function cachedFloor(sc){const f=floorCaches[sc.id],p=project(0,0),z=state.zoom;ctx.drawImage(f.canvas,p[0]-f.x*z,p[1]-f.y*z,f.tw*z,f.th*z);}
 function steam(){const cycle=state.cycle;if(!cycle||state.scene!=='entry'||cycle.phase!=='steam')return;const strength=Math.min(1,cycle.t/.8,(4.8-cycle.t)/.6);for(let i=0;i<65;i++){const t=(time*.35+i*.037)%1,x=2+(i*1.73%8)+Math.sin(i+t*5)*.32,y=6.2+(i*2.11%5),p=project(x,y,t*2.3),r=(3+t*8)*state.zoom;ctx.fillStyle=`rgba(193,212,197,${Math.max(0,strength*(1-t)*.12)})`;ctx.fillRect(Math.round(p[0]-r),Math.round(p[1]-r*.65),Math.ceil(r*2),Math.ceil(r*1.3));}}
 function render(){if(!ready||!running)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#141b17';ctx.fillRect(0,0,W,H);const sc=current();cachedFloor(sc);
  if(state.path.length){ctx.strokeStyle='#c1be8580';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(...project(player.x,player.y,.02));for(const p of state.path)ctx.lineTo(...project(p.x,p.y,.02));ctx.stroke();ctx.setLineDash([]);}
  const draws=[...sc.walls.map(o=>({...o,kind:'wall'})),...sc.objects,...sc.doors.map(o=>({...o,kind:'door'})),{kind:'actor',depth:player.x+player.y+.02}].sort((a,b)=>a.depth-b.depth);
  for(const o of draws){const p=project(o.x??player.x,o.y??player.y);if(o.kind!=='actor'&&(p[0]<-250||p[0]>W+250||p[1]<-60||p[1]>H+180))continue;if(o.kind==='wall')wallDraw(o);else if(o.kind==='door')doorDraw(o);else if(o.kind==='core')coreDraw();else if(o.kind==='sign')signDraw();else if(o.kind==='actor')actor();else{if(o.planter)planterDraw(o);drawSprite(o.action==='chest'&&state.open[o.id]?'boxOpen':o.sprite,o.x,o.y,o.scale,.5,o.flip,o.planter?.3:0);}}
  steam();if(state.zoom<=.8)for(const l of sc.labels)label(...l);
  if(state.scene==='foyer'){label('A',12.9,15,2.52,'#d4c38a');label('B',15,12.9,2.52,'#d4c38a');}
  for(const o of interactables()){const p=o.door?doorUiPoint(o,1.5):project(o.x,o.y,1.4);if(p[0]<0||p[0]>W||p[1]<0||p[1]>H)continue;const near=state.near?.id===o.id;ctx.fillStyle=near?'#dacb88':'#a0b095';ctx.fillRect(Math.round(p[0]-2),Math.round(p[1]-2),4,4);if(state.selected?.id===o.id||near){ctx.strokeStyle='#d9cc92';ctx.strokeRect(Math.round(p[0]-5),Math.round(p[1]-5),10,10);}}
  dirty=false;
 }
 function resize(){W=Math.max(280,canvas.clientWidth||window.innerWidth);H=Math.max(240,canvas.clientHeight||window.innerHeight);dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);dirty=true;if(running)render();}
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-last)/1000||.016);last=now;if(!ready||!running||paused||document.hidden)return;time+=dt;let dx=0,dy=0;const sx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),sy=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);if(!state.transition&&!state.cycle){if(sx||sy){state.path=[];state.selected=null;dx=sx+sy;dy=sy-sx;}else if(state.path.length){const q=state.path[0];dx=q.x-player.x;dy=q.y-player.y;if(Math.hypot(dx,dy)<.13){player.x=q.x;player.y=q.y;state.path.shift();dx=dy=0;}}}const was=player.moving;player.moving=move(dx,dy,dt);if(player.moving||was)dirty=true;if((dx||dy)&&!player.moving){state.path=[];say('Проход закрыт. Выберите свободный пол.');}animate(dt);updateAction();if(dirty)render();}
 function clickScene(x,y){if(paused||state.transition||state.cycle)return;let best=null,dist=38;for(const o of interactables()){const p=o.door?doorUiPoint(o,1.1):project(o.x,o.y,.7),d=Math.hypot(x-p[0],y-p[1]);if(d<dist){best=o;dist=d;}}if(best){request(best);return;}const p=inverse(x,y),route=pathTo(p.x,p.y);if(route){state.path=route;state.selected=null;say('');}else say('Здесь нельзя пройти. Нажмите на свободный пол или дверь.');dirty=true;}
 canvas.addEventListener('pointerdown',e=>{if(paused||!running||!e.isPrimary)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,cam:{...state.cam},drag:false};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(dx,dy)>8)pointer.drag=true;if(pointer.drag){state.cam.x=pointer.cam.x-(dx/(38*state.zoom)+dy/(19*state.zoom))/2;state.cam.y=pointer.cam.y-(dy/(19*state.zoom)-dx/(38*state.zoom))/2;dirty=true;}});
 canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;pointer=null;if(!p.drag){const b=canvas.getBoundingClientRect();clickScene(e.clientX-b.left,e.clientY-b.top);}});canvas.addEventListener('pointercancel',()=>pointer=null);
 canvas.addEventListener('wheel',e=>{if(!running||paused)return;e.preventDefault();zoom(e.deltaY<0?.125:-.125);},{passive:false});
 for(const[id,code]of[['move-left','ArrowLeft'],['move-right','ArrowRight'],['move-up','ArrowUp'],['move-down','ArrowDown']]){const b=document.getElementById(id);b.addEventListener('pointerdown',e=>{if(paused||!running)return;keys.add(code);b.setPointerCapture(e.pointerId);e.preventDefault();});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(code));}
 document.addEventListener('keydown',e=>{if(!running||paused||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.code==='KeyE'&&!e.repeat)act();});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pointer=null;});document.addEventListener('visibilitychange',()=>keys.clear());
 function zoom(delta){state.zoom=Math.max(.35,Math.min(2,state.zoom+delta));dirty=true;}
 function overview(){const sc=current();if(sc.id==='foyer'){state.cam={x:13,y:13};state.zoom=Math.min(1,(W-100)/1510,(H-125)/820);state.zoom=Math.max(.3,state.zoom);}else{state.cam={x:sc.w/2,y:sc.h/2};state.zoom=Math.min(1,(W-80)/((sc.w+sc.h)*38),(H-120)/((sc.w+sc.h)*19+110));}dirty=true;}
 function renderPlan(c){
  const w=c.clientWidth||600,h=c.clientHeight||300,r=Math.min(window.devicePixelRatio||1,3),g=c.getContext('2d');c.width=w*r;c.height=h*r;g.setTransform(r,0,0,r,0,0);g.fillStyle='#0c1911';g.fillRect(0,0,w,h);
  const radius=Math.min(h*.37,w*.29),cx=w*.45,cy=h*.44,p=(x,y)=>[cx+(x-13)/12.6*radius,cy+(y-13)/12.6*radius];
  g.strokeStyle='#67915b';g.lineWidth=1.5;g.beginPath();g.arc(cx,cy,radius,0,7);g.stroke();g.strokeRect(cx-radius*.16,cy-radius*.16,radius*.32,radius*.32);g.strokeRect(cx-radius*.16,cy+radius,radius*.32,radius*.25);g.strokeRect(cx+radius,cy-radius*.16,radius*.4,radius*.32);
  const stops=[['01',7,6],['02',10,5],['03',20,7],['ЛИФТ',13,13],['ВХОД',13,27.5],['ВЫХОД',29,13]];
  g.font='12px monospace';g.textAlign='center';g.fillStyle='#bfd5aa';for(const[text,x,y]of stops){const q=p(x,y);g.fillText(text,q[0],q[1]+4);}
  g.fillStyle='#4c6847';for(const[x,y]of[[5,13],[9,19]]){const q=p(x,y);g.fillRect(q[0]-7,q[1]-7,14,14);}
  let q=p(player.x,player.y);if(state.scene==='entry')q=p(13,27.5);if(state.scene==='surface')q=p(29,13);g.strokeStyle='#edda99';g.lineWidth=2;g.beginPath();g.arc(q[0],q[1],5,0,7);g.stroke();
 }

 async function init(){const names=['wallA','wallB','wallDetailA','floor','grate','door','terminal','counter','chair','screen','screen2','bench','bench2','machine','box','boxOpen','wardrobe','loungeChair','sofa','lamp','cactus','table','column','console','cabinet','terminalBack','receptionBack','shelf'];await Promise.all(names.map(async name=>{const im=new Image();im.src='assets/'+name+'-cut.png';await new Promise((ok,no)=>{im.onload=ok;im.onerror=()=>no(new Error('Не загрузился '+name));if(im.complete&&im.naturalWidth)ok();});images[name]=im;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(20,35,29,.18)';g.fillRect(0,0,c.width,c.height);darkImages[name]=c;}));buildSurfaces();bakeWalls();Object.values(scenes).forEach(buildFloorCache);ready=true;requestAnimationFrame(frame);}
 let started=false;
 const api={onAction:null,onNotice:null,onTarget:null,onScene:null,onProcess:null,start(){running=true;paused=false;resize();if(!started){started=true;state.cam={x:H<520?8.5:10.6,y:H<520?8.5:10.6};state.zoom=H<520?1:Math.min(1.05,(H-100)/600);}updateAction();api.onScene?.(current().label);dirty=true;},pause(v){paused=v;keys.clear();pointer=null;player.moving=false;dirty=true;},stop(){running=false;keys.clear();},center(){state.cam={x:player.x,y:player.y};if(state.zoom<.75)state.zoom=1;dirty=true;},overview,zoom,act,renderPlan,getScene(){return state.scene;},route(id){const obj=interactables().find(o=>o.id===id);if(obj)request(obj);else if(state.scene!=='foyer')request(current().doors.find(d=>d.to==='foyer'));},isBusy(){return !!state.cycle||!!state.transition;}};
 new ResizeObserver(resize).observe(canvas);api.ready=init();return api;
})();
