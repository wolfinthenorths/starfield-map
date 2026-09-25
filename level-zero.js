'use strict';
// One continuous level. Coordinates are shared by sprites, walls, doors and navigation.
window.createLevelZero = function () {
 const s={id:'foyer',w:44,h:49,label:'Уровень 0 · Вход и контроль',tiles:new Set(),blocked:new Set(),walls:[],facets:[],doors:[],objects:[],shapes:[]};
 const hall=[[16,6],[24,6],[29,10],[32,14],[32,22],[29,26],[24,30],[16,30],[11,26],[8,22],[8,14],[11,10]];
 s.hall=hall;s.shapes.push(hall);
 const rectangle=(x,y,w,h)=>{s.shapes.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);};
 rectangle(16,29,8,19); // Network entrance → treatment → access control → foyer.
 rectangle(31,16,11,6); // Independent surface airlock.
 rectangle(3,15,6,6);  // Residential stairs A.
 const segment=(x,y,ex,ey,low=false,internal=false)=>{
  const length=Math.hypot(ex-x,ey-y),ux=(ex-x)/length,uy=(ey-y)/length,n=Math.ceil(length);
  s.facets.push({x,y,ux,uy,span:length,low,internal});
  for(let i=0;i<n;i++){const span=length/n;s.walls.push({x:x+ux*span*i,y:y+uy*span*i,ux,uy,span,low,internal,depth:x+y+(ux+uy)*span*(i+.5)});}
 };
 // Long wall facets give the circular hall a continuous fitted rim.
 for(let i=0;i<hall.length;i++){
  const [x,y]=hall[i],[ex,ey]=hall[(i+1)%hall.length],low=(ey-y)-(ex-x)>0;
  if(y===6&&ey===6){segment(16,6,24,6);}
  else if(x===32&&ex===32){segment(32,14,32,16,true);}
  else if(y===30&&ey===30){} // Open arrival mouth.
  else if(x===8&&ex===8){segment(8,22,8,21);segment(8,15,8,14);}
  else segment(x,y,ex,ey,low);
 }
 // A single descent; the former second bay is sealed into the perimeter.
 segment(3,15,8,15);segment(3,21,8,21,true);segment(3,15,3,21);
 // Continuous external walls of the arrival wing and the surface branch.
 segment(16,30,16,48);segment(24,30,24,48,true);
 segment(16,48,18,48,true);segment(22,48,24,48,true);
 segment(32,16,42,16);segment(32,22,42,22,true);
 segment(42,16,42,17,true);segment(42,21,42,22,true);
 const door=(id,x,y,axis,span,extra={})=>{const d={id,x,y,axis,ux:axis==='x'?1:0,uy:axis==='y'?1:0,span,kind:'door',door:true,depth:x+y+span/2,...extra};s.doors.push(d);return d;};
 // Treatment lanes share a checkpoint, but each has its own animated interlock.
 for(const y of[36,42]){
  for(const [a,b]of[[16,17],[19,21],[23,24]])segment(a,y,b,y,false,true);
  for(const [lane,x]of[['A',17],['B',21]])door('clean'+(y===42?'Outer':'Inner')+lane,x,y,'x',2,{internal:true,chamber:lane,label:y===42?'Открыть камеру '+lane:'Открыть внутреннюю дверь',target:'ДЕЗАКТИВАЦИЯ · КАМЕРА '+lane,requiresClean:y===36});
 }
 segment(20,36,20,42,false,true);
 segment(16,32,19,32,false,true);segment(21,32,24,32,false,true);
 door('accessGate',19,32,'x',2,{internal:true,checkpoint:true,label:'Пройти контроль доступа',target:'КОНТРОЛЬ ДОСТУПА'});
 door('networkGate',18,48,'x',4,{action:'network',label:'О системе бункеров',target:'ПОДЗЕМНАЯ СИСТЕМА',approach:[20,46.5]});
 segment(35,16,35,17,false,true);segment(35,20,35,22,false,true);
 door('surfaceInner',35,17,'y',3,{internal:true,label:'Открыть изолированный шлюз',target:'МАРШРУТ НА ПОВЕРХНОСТЬ'});
 door('surfaceGate',42,17,'y',4,{action:'denied',blast:true,label:'Попытаться выйти',target:'ПОВЕРХНОСТЬ · ОСОБЫЙ ДОПУСК',approach:[40.5,19]});
 const prop=(id,sprite,x,y,scale=1,extra={})=>{
  const o={id,sprite,x,y,scale,kind:'prop',depth:x+y,...extra};s.objects.push(o);
  if(extra.blocked!==false){const [a,b,w,h]=extra.footprint||[Math.floor(x),Math.floor(y),1,1];for(let j=b;j<b+h;j++)for(let i=a;i<a+w;i++)s.blocked.add(i+','+j);}
  return o;
 };
 // Direction is chosen from the visitor's actual approach, including rear sprite views.
 const kiosk=(id,x,y,scale,extra)=>{
  const dx=extra.approach[0]-x,dy=extra.approach[1]-y;
  const facing=Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,Math.sign(dy)];
  const sprite=facing[0]>0?'kioskX':facing[0]<0?'kioskNegX':facing[1]>0?'kioskY':'kioskNegY';
  return prop(id,sprite,x,y,scale,{...extra,facing});
 };
 // Enclosed reception island. Every counter module occupies the same one-tile grid.
 for(let i=0;i<6;i++)prop(i===2?'registration':'counterPart'+i,i===2?'receptionTill':'receptionMiddle',16.5+i,11.5,1.16,{...(i===2?{action:'registration',label:'Оформить заселение',target:'РЕГИСТРАЦИЯ',approach:[18.5,12.5]}:{})});
 for(const x of[16.5,21.5])for(const y of[9.5,10.5]){
  const gate=x===16.5&&y===9.5;
  prop('counterWing'+x+'_'+y,gate?'receptionGate':'receptionMiddle',x,y,1.16,{flip:!gate});
 }
 for(let i=0;i<6;i++)prop('counterBack'+i,i===3?'receptionWorktop':'receptionMiddle',16.5+i,8.5,1.16,{flip:true});
 for(const x of[18,20])prop('receptionChair'+x,'receptionSeatY',x+.5,10.1,1.5,{facing:[0,1]});
 // Two short banks rest against the straight centre facet of the circular wall.
 // Their native isometric direction is preserved; no cabinet is bent around the arc.
 for(const [i,x]of[16.8,17.8,22.1,23.1].entries())
  prop('archiveCabinet'+i,'archiveCabinet',x,6.95,1.05,{flip:true,footprint:[Math.floor(x),6,1,1],facing:[0,1]});
 // One main public terminal; greeting and instructions are fixed to the architecture below.
 kiosk('mainTerminal',23.5,10.5,1.3,{action:'terminal',label:'Открыть главный терминал',target:'ГЛАВНЫЙ ТЕРМИНАЛ',approach:[23.5,12.5]});
 // Two quiet seating pockets, facing the open hall. The central route remains clear.
 for(const [i,y]of[[0,23.5],[1,25.5]]){
  prop('sofa'+i,'sofa',12.5,y,1.7,{footprint:[11,Math.floor(y)-1,2,2]});
  prop('coffeeTable'+i,'coffeeRound',14.5,y+1,1.1,{foot:.92,action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОТДЫХА',approach:[15.5,y+1]});
 }
 for(const [i,x,y]of[[0,27.4,11.7],[1,29.4,13.7]]){
  prop('eastSofa'+i,'sofa',x,y,1.7,{flip:true,footprint:[Math.floor(x)-1,Math.floor(y),2,2]});
  prop('eastTable'+i,'coffeeRound',x-1,y+2.3,1.1,{foot:.92,action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОТДЫХА · ВОСТОЧНАЯ',approach:[x-1.9,y+2.3]});
 }
 prop('water','waterDispenser',16.5,25.5,.82,{action:'water',label:'Набрать питьевую воду',target:'ПИТЬЕВАЯ ВОДА · ЗОНА ОТДЫХА',approach:[17.5,25.5]});
 prop('waterSupplies','luggageCabinet',15.3,28.5,.82,{action:'container',inventory:'waterSupplies',label:'Открыть запас для зоны отдыха',target:'ЗАПАС ДЛЯ ЗОНЫ ОТДЫХА',approach:[16.5,28.5]});
 // Just two plants at the ends of each pocket, plus the two reception planters.
 for(const [id,x,y,sprite]of[['loungeStart',11.5,21.7,'foliage'],['loungeEnd',17,28.6,'foliageRound'],['eastStart',26.2,10.5,'foliageRound'],['eastEnd',30.5,16.1,'foliage'],['receptionLeft',15.25,12.5,'foliageRound'],['receptionRight',22.75,12.5,'foliage']])
  prop(id,sprite,x,y,1.5,{planter:true});
 prop('stairA',null,6.2,18,1,{kind:'stairs',axis:'x',action:'stairs',label:'Спуск на уровень 1',target:'ЖИЛОЙ СЕКТОР · УРОВЕНЬ 1',approach:[8.5,18.5],footprint:[3,15,4,6]});
 // A single bank of metal luggage cells faces the foyer, with a clear aisle in front.
 for(let i=0;i<6;i++)prop(i===2?'baggage':'lockerBank'+i,'baggageLockers',10.8,12.4+i*.58,.83,{facing:[1,0],...(i===2?{action:'container',inventory:'baggage',label:'Осмотреть ячейки хранения',target:'ХРАНЕНИЕ БАГАЖА',approach:[12.5,14.5]}:{})});
 // Emergency supplies belong to the service airlock, away from reception and luggage.
 prop('serviceBox','box',36.6,17.1,1.5,{foot:.88,action:'container',inventory:'filters',label:'Открыть ящик с фильтрами',target:'ЗАПАСНЫЕ ФИЛЬТРЫ',approach:[36.5,19.5]});
 prop('filters','supplyCase',38.3,17.1,1.25,{foot:.88,action:'container',inventory:'emergency',label:'Открыть аварийный комплект',target:'АВАРИЙНЫЙ КОМПЛЕКТ',approach:[38.5,19.5]});
 prop('shaft',null,20,19,1,{kind:'floorMarker',blocked:false,action:'shaft',label:'О лифтовой шахте',target:'ЛИФТОВОЙ УЗЕЛ · ЭТАЖОМ НИЖЕ',approach:[21.5,20.5]});
 kiosk('scanner',22.6,33.5,1.1,{action:'scan',label:'Проверить допуск',target:'КОНТРОЛЬ ДОСТУПА',approach:[21.5,34.5]});
 prop('robot','robotSprite',17.6,33.7,1.25,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[18.5,34.5]});
 for(const [lane,x]of[['A',16.6],['B',23.5]]){
  kiosk('cleanControl'+lane,x,39.4,.95,{chamber:lane,action:'decon',label:'Запустить обработку · '+lane,target:'ДЕЗАКТИВАЦИЯ · КАМЕРА '+lane,approach:[lane==='A'?18.5:22.5,39.5]});
  prop('uniform'+lane,'uniformCrate',x,37.7,1.15,{foot:.88,action:'container',inventory:'uniform',label:'Открыть контейнер с формой',target:'ЧИСТАЯ ФОРМА · VAULT-TEC',approach:[lane==='A'?18.5:22.5,37.5]});
 }
 prop('entryStorage','luggageCabinet',16.8,44.3,.82,{footprint:[16,43,1,2],action:'container',inventory:'entryStorage',label:'Осмотреть входной запас',target:'ВХОДНОЙ ЗАПАС',approach:[18.5,44.5]});
 prop('entrySupplies','supplyCase',23.3,45.2,.85,{action:'container',inventory:'sanitary',label:'Открыть санитарный комплект',target:'САНИТАРНЫЙ КОМПЛЕКТ',approach:[22.5,45.5]});
 kiosk('surfacePanel',40.3,17.1,1.1,{action:'denied',label:'Запросить доступ на Поверхность',target:'ОСОБЫЙ ДОПУСК',approach:[40.5,18.5]});
 // Flat sprite faces are attached to their real supporting wall, including wide fixtures.
 const mount=(id,sprite,x,y,z,width,height,extra={})=>{
  let chosen=null,dist=Infinity;
  for(const wall of s.facets){const t=Math.max(width/2,Math.min(wall.span-width/2,(x-wall.x)*wall.ux+(y-wall.y)*wall.uy)),d=Math.hypot(wall.x+wall.ux*t-x,wall.y+wall.uy*t-y);if(d<dist){dist=d;chosen={...wall,t};}}
  const f=chosen,px=f.x+f.ux*f.t,py=f.y+f.uy*f.t;
  const o=prop(id,sprite,px,py,1,{kind:'fixture',blocked:false,mount:true,z,width,height,ux:f.ux,uy:f.uy,low:f.low,...extra});
  for(const panel of s.walls){const off=(panel.x-f.x)*f.ux+(panel.y-f.y)*f.uy;
   if(Math.abs(panel.ux-f.ux)<.001&&Math.abs(panel.uy-f.uy)<.001&&Math.abs((panel.x-f.x)*f.uy-(panel.y-f.y)*f.ux)<.001&&off<f.t+width/2&&off+panel.span>f.t-width/2)(panel.fittings??=[]).push(o);
  }
  return o;
 };
 mount('welcomeScreen','welcomePoster',14,7.6,1.45,1.65,1.25,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[14.5,9.5]});
 mount('notice','noticePanel',25.3,7.1,1.42,1.25,.95,{action:'notices',label:'Прочитать памятку',target:'ПАМЯТКА ПРИБЫВШЕМУ',approach:[24.5,8.5]});
 mount('receptionPoster','welcomePoster',18.9,6,1.22,.95,1.14,{wallDisplay:true});
 mount('receptionCommunity','communityPoster',20.1,6,1.22,.95,1.14,{wallDisplay:true});
 mount('receptionClock','receptionClock',19.5,6,1.94,.6,.6,{wallDisplay:true});
 mount('airlockScreen','entryPanel',16,46,1.5,1.4,1,{action:'airlock',label:'Прочитать инструкцию',target:'ВХОД ИЗ СИСТЕМЫ БУНКЕРОВ',approach:[18.5,46.5]});
 mount('surfaceInfo','surfaceDisplay',38.5,16,1.5,1.65,1.12,{action:'surfaceInfo',label:'Прочитать ограничения',target:'ВНЕШНИЙ КОНТУР',approach:[38.5,18.5]});
 mount('surfaceSystems','systemsPanel',36.5,16,1.4,.8,.9,{action:'systems',label:'Проверить системы убежища',target:'ЖИЗНЕОБЕСПЕЧЕНИЕ',approach:[36.5,18.5]});
 // Fixtures are embedded in their own panel, centred away from seams and corners.
 for(const [f,wall]of s.facets.entries()){
  if(wall.internal||wall.span<1.8)continue;
  const count=Math.max(1,Math.round(wall.span/5)),panels=Math.ceil(wall.span),step=wall.span/panels;
  for(let i=0;i<count;i++){
   const panelIndex=Math.min(panels-1,Math.floor((i+.5)*panels/count)),t=step*(panelIndex+.5);
   const x=wall.x+wall.ux*t,y=wall.y+wall.uy*t;
   const panel=s.walls.find(p=>Math.abs(p.x+p.ux*p.span/2-x)<.001&&Math.abs(p.y+p.uy*p.span/2-y)<.001&&p.internal===wall.internal);
   panel.fittings??=[];
   for(const [type,z,width,height]of[['stripLight',2.13,.72,.17],['vaultVent',.56,.7,.4]]){
    if(panel.fittings.some(o=>o.action||o.wallDisplay))continue;
    const fitting=prop(type+f+'_'+i,type,x,y,1,{kind:'fixture',blocked:false,mount:true,z,width:Math.min(width,step*.8),height,ux:wall.ux,uy:wall.uy,low:wall.low,depth:x+y});
    panel.fittings.push(fitting);
   }
  }
 }
 s.clearLanes=[{x:8,y:17,w:24,h:4},{x:18,y:21,w:4,h:11}];
 s.zones=[{name:'Восточная зона отдыха',x:25,y:10,w:7,h:7},{name:'Зона отдыха и питьевая вода',x:11,y:22,w:7,h:7},{name:'Хранение багажа',x:10,y:11,w:4,h:6}];
 s.chambers={A:{x:16.25,y:36.3,w:3.5,h:5.4},B:{x:20.25,y:36.3,w:3.5,h:5.4}};
 return s;
};
