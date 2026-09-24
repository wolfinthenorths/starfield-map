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
 // Broad modular reception; neighboring one-tile sprites touch on the same grid.
 for(let i=0;i<6;i++)prop(i===2?'registration':'counterPart'+i,i===2?'receptionTill':'receptionMiddle',16.5+i,11.5,1.16,{...(i===2?{action:'registration',label:'Оформить заселение',target:'РЕГИСТРАЦИЯ',approach:[18.5,12.5]}:{})});
 for(const x of[16.5,21.5])prop('counterWing'+x,'receptionMiddle',x,10.5,1.16,{flip:true});
 for(const x of[18,20])prop('receptionChair'+x,'receptionSeatY',x+.5,10.1,1.5,{facing:[0,1]});
 prop('receptionSign',null,19,7.7,1,{kind:'sign',blocked:false,depth:25.6});
 kiosk('welcomeScreen',15,10.5,1.25,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[15.5,11.5]});
 kiosk('mainTerminal',23.5,10.5,1.3,{action:'terminal',label:'Открыть главный терминал',target:'ГЛАВНЫЙ ТЕРМИНАЛ',approach:[23.5,12.5]});
 // One waiting area: an aligned bank of seats, tables in front, water at its open end.
 for(const [i,y]of[[0,23.5],[1,25.5]]){
  prop('sofa'+i,'sofa',12.5,y,1.7,{footprint:[11,Math.floor(y)-1,2,2]});
  prop('coffeeTable'+i,'coffeeRound',14.5,y+1,1.1,{foot:.92,action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОТДЫХА',approach:[15.5,y+1]});
 }
 prop('water','waterDispenser',16.5,23.5,.82,{action:'water',label:'Набрать питьевую воду',target:'ПИТЬЕВАЯ ВОДА · ЗОНА ОТДЫХА',approach:[17.5,23.5]});
 prop('waterSupplies','luggageCabinet',16.5,25.5,.82,{footprint:[16,25,1,1]});
 // Repeated planters define the ends of the lounge and frame the reception.
 for(const [id,x,y]of[['loungeStart',11.5,21.7],['loungeEnd',14.5,28.1],['waterEnd',17,26.7],['receptionLeft',15.25,12.5],['receptionRight',22.75,12.5]])
  prop(id,'foliage',x,y,1.75,{planter:true});
 prop('notice','screen2',12.5,9.8,.75,{action:'notices',label:'Прочитать объявления',target:'ПАМЯТКА ПРИБЫВШЕМУ',approach:[13.5,10.5]});
 kiosk('residential',9,16,1.12,{action:'residential',label:'Узнать маршрут к спальням',target:'ЖИЛОЙ СЕКТОР',approach:[10.5,16.5]});
 prop('stairA',null,6.2,18,1,{kind:'stairs',axis:'x',action:'stairs',label:'Спуск на уровень 1',target:'ЖИЛОЙ СЕКТОР · УРОВЕНЬ 1',approach:[8.5,18.5],footprint:[3,15,4,6]});
 // A single bank of metal luggage cells faces the foyer, with a clear aisle in front.
 for(let i=0;i<6;i++)prop(i===2?'baggage':'lockerBank'+i,'baggageLockers',10.8,12.4+i*.58,.83,{facing:[1,0],...(i===1?{action:'baggage',label:'Осмотреть ячейки хранения',target:'ХРАНЕНИЕ БАГАЖА',approach:[12.5,14.5]}:{})});
 // Emergency supplies belong to the service airlock, away from reception and luggage.
 prop('serviceBox','box',33.2,21.2,1.2,{action:'chest',label:'Открыть ящик',target:'ЗАПАСНЫЕ ФИЛЬТРЫ',approach:[33.5,20.5]});
 prop('filters','supplyCase',34.2,21.2,1,{action:'supplies',label:'Осмотреть аварийный комплект',target:'АВАРИЙНЫЙ КОМПЛЕКТ',approach:[34.5,20.5]});
 prop('shaft',null,20,19,1,{kind:'floorMarker',blocked:false,action:'shaft',label:'О лифтовой шахте',target:'ЛИФТОВОЙ УЗЕЛ · ЭТАЖОМ НИЖЕ',approach:[21.5,20.5]});
 kiosk('scanner',22.6,33.5,1.1,{action:'scan',label:'Проверить допуск',target:'КОНТРОЛЬ ДОСТУПА',approach:[21.5,34.5]});
 prop('robot','robotSprite',17.6,33.7,1.25,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[18.5,34.5]});
 for(const [lane,x]of[['A',16.6],['B',23.5]]){
  kiosk('cleanControl'+lane,x,39.4,.95,{chamber:lane,action:'decon',label:'Запустить обработку · '+lane,target:'ДЕЗАКТИВАЦИЯ · КАМЕРА '+lane,approach:[lane==='A'?18.5:22.5,39.5]});
  prop('sprayer'+lane,'machine',x,37.9,.55);
 }
 prop('airlockScreen','screen',16.7,45.8,.84,{action:'airlock',label:'Прочитать инструкцию',target:'ВХОД ИЗ СИСТЕМЫ БУНКЕРОВ',approach:[18.5,45.5]});
 prop('entryStorage','luggageCabinet',16.8,44.3,.82,{footprint:[16,43,1,2]});
 prop('entrySupplies','supplyCase',23.3,45.2,.85);
 kiosk('surfacePanel',39.6,16.8,1.1,{action:'denied',label:'Запросить доступ на Поверхность',target:'ОСОБЫЙ ДОПУСК',approach:[39.5,18.5]});
 prop('surfaceInfo','screen2',33.5,16.6,.8,{action:'surfaceInfo',label:'Прочитать ограничения',target:'ИЗОЛИРОВАННЫЙ ШЛЮЗ',approach:[33.5,18.5]});
 prop('surfaceSystems','utilityCabinet',37.5,16.7,1.05,{flip:true,footprint:[37,16,1,1],action:'systems',label:'Проверить системы убежища',target:'ЖИЗНЕОБЕСПЕЧЕНИЕ',approach:[37.5,18.5]});
 // Fixtures are embedded in their own panel, centred away from seams and corners.
 for(const [f,wall]of s.facets.entries()){
  if(wall.internal||wall.span<1.8)continue;
  const count=Math.max(1,Math.round(wall.span/5)),panels=Math.ceil(wall.span),step=wall.span/panels;
  for(let i=0;i<count;i++){
   const panelIndex=Math.min(panels-1,Math.floor((i+.5)*panels/count)),t=step*(panelIndex+.5);
   const x=wall.x+wall.ux*t,y=wall.y+wall.uy*t;
   const panel=s.walls.find(p=>Math.abs(p.x+p.ux*p.span/2-x)<.001&&Math.abs(p.y+p.uy*p.span/2-y)<.001&&p.internal===wall.internal);
   panel.fittings=[];
   for(const [type,z,width,height]of[['vaultLamp',1.94,.66,.38],['vaultVent',1.23,.7,.46]]){
    const fitting=prop(type+f+'_'+i,type,x,y,1,{kind:'fixture',blocked:false,mount:true,z,width:Math.min(width,step*.8),height,ux:wall.ux,uy:wall.uy,low:wall.low,depth:x+y});
    panel.fittings.push(fitting);
   }
  }
 }
 s.clearLanes=[{x:8,y:17,w:24,h:4},{x:18,y:21,w:4,h:11}];
 s.zones=[{name:'Зона отдыха и питьевая вода',x:11,y:22,w:7,h:7},{name:'Хранение багажа',x:10,y:11,w:4,h:6}];
 s.chambers={A:{x:16.25,y:36.3,w:3.5,h:5.4},B:{x:20.25,y:36.3,w:3.5,h:5.4}};
 return s;
};
