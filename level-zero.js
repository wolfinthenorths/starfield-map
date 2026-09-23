'use strict';
// One continuous level. Coordinates are shared by sprites, walls, doors and navigation.
window.createLevelZero = function () {
 const s={id:'foyer',w:44,h:49,label:'Уровень 0 · Вход и контроль',tiles:new Set(),blocked:new Set(),walls:[],doors:[],objects:[],labels:[],shapes:[]};
 const hall=[[16,6],[24,6],[29,10],[32,14],[32,22],[29,26],[24,30],[16,30],[11,26],[8,22],[8,14],[11,10]];
 s.hall=hall;s.shapes.push(hall);
 const rectangle=(x,y,w,h)=>{s.shapes.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);};
 rectangle(16,29,8,19); // Network entrance → treatment → access control → foyer.
 rectangle(31,16,11,6); // Independent surface airlock.
 rectangle(3,15,6,6);  // Residential stairs A.
 const segment=(x,y,ex,ey,low=false,internal=false)=>{
  const length=Math.hypot(ex-x,ey-y),ux=(ex-x)/length,uy=(ey-y)/length,n=Math.ceil(length);
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
 // Broad modular reception; neighboring one-tile sprites touch on the same grid.
 for(let i=0;i<6;i++)prop(i===2?'registration':'counterPart'+i,i===2?'receptionTill':'receptionMiddle',16.5+i,11.5,1.16,{...(i===2?{action:'registration',label:'Оформить заселение',target:'РЕГИСТРАЦИЯ',approach:[18.5,12.5]}:{})});
 for(const x of[16.5,21.5])prop('counterWing'+x,'receptionMiddle',x,10.5,1.16,{flip:true});
 for(const x of[18,20])prop('receptionChair'+x,'receptionSeat',x+.5,9.5,1.5);
 prop('receptionSign',null,19,7.7,1,{kind:'sign',blocked:false,depth:25.6});
 prop('welcomeScreen','terminal',14.5,10.5,1.12,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[15.5,11.5]});
 prop('mainTerminal','console',23.5,10.5,1.15,{action:'terminal',label:'Открыть главный терминал',target:'ГЛАВНЫЙ ТЕРМИНАЛ',approach:[23.5,12.5]});
 // Waiting pockets sit below the east/west circulation lane, away from both exits.
 for(const [i,x,y]of[[0,12.5,24.5],[1,26.5,23.5]]){
  prop('sofa'+i,'sofa',x,y,1.65,{flip:i===1,footprint:[Math.floor(x)-1,Math.floor(y)-1,2,2]});
  prop('coffeeTable'+i,'coffeeRound',x+(i===0?2:0),y+(i===0?1:2),1.15,{foot:.92,action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОЖИДАНИЯ',approach:[i===0?15.5:25.5,i===0?25.5:25.5]});
  prop('loungeChair'+i,'loungeChair',x+(i===0?1:2),y+(i===0?2:0),1.3,{flip:i===0});
 }
 prop('notice','screen2',11.5,11.5,.75,{action:'notices',label:'Прочитать объявления',target:'ПАМЯТКА ПРИБЫВШЕМУ',approach:[12.5,12.5]});
 prop('residential','terminal',9.5,15.5,.9,{action:'residential',label:'Узнать маршрут к спальням',target:'ЖИЛОЙ СЕКТОР',approach:[10.5,16.5]});
 prop('stairA',null,6.2,18,1,{kind:'stairs',axis:'x',action:'stairs',label:'Спуск на уровень 1',target:'ЖИЛОЙ СЕКТОР · УРОВЕНЬ 1',approach:[8.5,18.5],footprint:[3,15,4,6]});
 // Metal baggage lockers, control cabinets and service supplies form functional clusters.
 prop('baggage','luggageCabinet',11.5,13.5,1.05,{action:'baggage',label:'Осмотреть камеру хранения',target:'ХРАНЕНИЕ БАГАЖА',approach:[12.5,14.5],footprint:[10,12,2,2]});
 prop('baggageCase','supplyCase',10.5,14.5,1.05);
 for(let i=0;i<3;i++)prop('controlCabinet'+i,'utilityCabinet',25.5+i,11.5,1.08,{flip:true,...(i===1?{action:'systems',label:'Проверить системы убежища',target:'ЖИЗНЕОБЕСПЕЧЕНИЕ',approach:[26.5,13.5]}:{})});
 prop('water','waterDispenser',28.5,14.5,.82,{action:'water',label:'Набрать питьевую воду',target:'ПИТЬЕВАЯ ВОДА',approach:[27.5,15.5]});
 for(const [i,x,y]of[[0,17.5,28.5],[1,22.5,28.5]])prop('supplyBench'+i,'steelBench',x,y,1.2,{flip:i===1,footprint:[Math.floor(x)-1,Math.floor(y),2,1]});
 prop('filters','supplyCase',28.5,22.5,1,{action:'supplies',label:'Осмотреть аварийный комплект',target:'АВАРИЙНЫЙ КОМПЛЕКТ',approach:[27.5,22.5]});
 prop('shaft',null,20,19,1,{kind:'floorMarker',blocked:false,action:'shaft',label:'О лифтовой шахте',target:'ЛИФТОВОЙ УЗЕЛ · ЭТАЖОМ НИЖЕ',approach:[21.5,20.5]});
 prop('scanner','terminal',22.6,33.5,.9,{action:'scan',label:'Проверить допуск',target:'КОНТРОЛЬ ДОСТУПА',approach:[21.5,34.5]});
 prop('robot','robotSprite',17.6,33.7,1.25,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[18.5,34.5]});
 for(const [lane,x]of[['A',16.6],['B',23.5]]){
  prop('cleanControl'+lane,'terminal',x,39.4,.72,{chamber:lane,action:'decon',label:'Запустить обработку · '+lane,target:'ДЕЗАКТИВАЦИЯ · КАМЕРА '+lane,approach:[lane==='A'?18.5:22.5,39.5]});
  prop('sprayer'+lane,'machine',x,37.9,.55);
 }
 prop('airlockScreen','screen',16.7,45.8,.84,{action:'airlock',label:'Прочитать инструкцию',target:'ВХОД ИЗ СИСТЕМЫ БУНКЕРОВ',approach:[18.5,45.5]});
 prop('entryStorage','luggageCabinet',16.8,44.3,.82,{footprint:[16,43,1,2]});
 prop('entrySupplies','supplyCase',23.3,45.2,.85);
 prop('surfacePanel','terminal',39.6,16.8,.9,{action:'denied',label:'Запросить доступ на Поверхность',target:'ОСОБЫЙ ДОПУСК',approach:[39.5,18.5]});
 prop('surfaceInfo','screen2',33.5,16.6,.8,{action:'surfaceInfo',label:'Прочитать ограничения',target:'ИЗОЛИРОВАННЫЙ ШЛЮЗ',approach:[33.5,18.5]});
 prop('surfaceSystems','utilityCabinet',37.5,16.7,1.05,{flip:true,footprint:[37,16,1,1]});
 prop('serviceBox','box',29.2,24.8,1.2,{action:'chest',label:'Открыть ящик',target:'ЗАПАСНЫЕ ФИЛЬТРЫ',approach:[27.5,24.5]});
 // Wall devices are installed only on straight wall planes at shared heights.
 const mount=(id,sprite,x,y,z,scale,flip)=>prop(id,sprite,x,y,scale,{blocked:false,z,flip,depth:x+y+1,mount:true});
 for(const x of[17,20,23])mount('hallLight'+x,'vaultLamp',x,6,1.62,.78,true);
 for(const x of[18.5,21.5])mount('hallVent'+x,'vaultVent',x,6,1.1,1.15,true);
 for(const y of[33.1,38.2,44.1])mount('arrivalLight'+y,'vaultLamp',16,y,1.62,.78,false);
 for(const y of[34.6,40.1,46.1])mount('arrivalVent'+y,'vaultVent',16,y,1.1,1.15,false);
 for(const x of[33,37,40.5])mount('surfaceLight'+x,'vaultLamp',x,16,1.62,.78,true);
 mount('surfaceVent','vaultVent',38.6,16,1.1,1.15,true);
 s.clearLanes=[{x:8,y:17,w:24,h:4}];
 s.labels=[['РЕГИСТРАЦИЯ',19,10.8,2.6],['УРОВЕНЬ 1 · ЖИЛОЙ СЕКТОР',6.5,16,2.5],['ИЗ СИСТЕМЫ БУНКЕРОВ',20,47.5,2.65],['ДЕЗАКТИВАЦИЯ',20,40,2.7],['КОНТРОЛЬ ДОСТУПА',20,32,2.7],['ПОВЕРХНОСТЬ',41.5,18.5,2.8],['ОЖИДАНИЕ',14,24,2.4],['ПИТЬЕВАЯ ВОДА',28.5,14.5,2.2]];
 s.chambers={A:{x:16.25,y:36.3,w:3.5,h:5.4},B:{x:20.25,y:36.3,w:3.5,h:5.4}};
 return s;
};
