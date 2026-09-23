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
 // Broad modular reception; neighboring one-tile sprites touch on the same grid.
 for(let i=0;i<6;i++)prop(i===2?'registration':'counterPart'+i,i===2?'receptionTill':'receptionMiddle',16.5+i,11.5,1.16,{...(i===2?{action:'registration',label:'Оформить заселение',target:'РЕГИСТРАЦИЯ',approach:[18.5,12.5]}:{})});
 for(const x of[16.5,21.5])prop('counterWing'+x,'receptionMiddle',x,10.5,1.16,{flip:true});
 for(const x of[18,20])prop('receptionChair'+x,'receptionSeat',x+.5,9.5,1.5);
 prop('receptionSign',null,19,7.7,1,{kind:'sign',blocked:false,depth:25.6});
 prop('welcomeScreen','terminal',14.5,10.5,1.12,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[15.5,11.5]});
 prop('mainTerminal','console',23.5,10.5,1.15,{action:'terminal',label:'Открыть главный терминал',target:'ГЛАВНЫЙ ТЕРМИНАЛ',approach:[23.5,12.5]});
 // One waiting area: an aligned bank of seats, tables in front, water at its open end.
 for(const [i,y]of[[0,23.5],[1,25.5]]){
  prop('sofa'+i,'sofa',12.5,y,1.7,{footprint:[11,Math.floor(y)-1,2,2]});
  prop('coffeeTable'+i,'coffeeRound',14.5,y+1,1.1,{foot:.92,action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОТДЫХА',approach:[15.5,y+1]});
 }
 prop('water','waterDispenser',16.5,23.5,.82,{action:'water',label:'Набрать питьевую воду',target:'ПИТЬЕВАЯ ВОДА · ЗОНА ОТДЫХА',approach:[17.5,23.5]});
 prop('waterSupplies','luggageCabinet',16.5,25.5,.82,{footprint:[16,25,1,1]});
 // Repeated planters define the ends of the lounge and frame the reception.
 for(const [id,x,y]of[['loungeStart',11.5,21.7],['loungeEnd',14.5,28.1],['waterEnd',17,26.7],['receptionLeft',14.5,12.5],['receptionRight',24.5,12.5]])
  prop(id,'foliage',x,y,1.75,{planter:true});
 prop('notice','screen2',11.5,11.5,.75,{action:'notices',label:'Прочитать объявления',target:'ПАМЯТКА ПРИБЫВШЕМУ',approach:[12.5,12.5]});
 prop('residential','terminal',9.5,15.5,.9,{action:'residential',label:'Узнать маршрут к спальням',target:'ЖИЛОЙ СЕКТОР',approach:[10.5,16.5]});
 prop('stairA',null,6.2,18,1,{kind:'stairs',axis:'x',action:'stairs',label:'Спуск на уровень 1',target:'ЖИЛОЙ СЕКТОР · УРОВЕНЬ 1',approach:[8.5,18.5],footprint:[3,15,4,6]});
 // Storage has its own bank on the opposite side of the arrival mouth.
 prop('baggage','luggageCabinet',24.5,26.5,1.12,{action:'baggage',label:'Осмотреть камеру хранения',target:'ХРАНЕНИЕ БАГАЖА',approach:[24.5,25.5],footprint:[23,26,2,1]});
 prop('baggageExtra','luggageCabinet',26.5,26.5,1.12,{footprint:[25,26,2,1]});
 prop('baggageCase','supplyCase',27.5,25.5,1.05);
 prop('serviceBox','box',26.5,24.5,1.2,{action:'chest',label:'Открыть ящик',target:'ЗАПАСНЫЕ ФИЛЬТРЫ',approach:[25.5,24.5]});
 prop('filters','supplyCase',28.5,24.5,1,{action:'supplies',label:'Осмотреть аварийный комплект',target:'АВАРИЙНЫЙ КОМПЛЕКТ',approach:[27.5,23.5]});
 for(let i=0;i<3;i++)prop('controlCabinet'+i,'utilityCabinet',25.5+i,11.5,1.08,{flip:true,...(i===1?{action:'systems',label:'Проверить системы убежища',target:'ЖИЗНЕОБЕСПЕЧЕНИЕ',approach:[26.5,13.5]}:{})});
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
 // The same fitting interval follows every solid exterior wall facet, on both sides of branches.
 // Fittings inherit their wall's direction and transparency; they do not occupy walking cells.
 for(const [f,wall]of s.facets.entries()){
  if(wall.internal||wall.span<1.8)continue;
  const count=Math.max(1,Math.round(wall.span/5));
  for(let i=0;i<count;i++)for(const [type,offset,z,width]of[['vaultLamp',-.38,1.82,.85],['vaultVent',.38,1.12,.62]]){
   const t=wall.span*(i+.5)/count+offset,x=wall.x+wall.ux*t,y=wall.y+wall.uy*t;
   prop(type+f+'_'+i,type,x,y,1,{kind:'fixture',blocked:false,mount:true,z,width,ux:wall.ux,uy:wall.uy,low:wall.low,depth:x+y+.85});
  }
 }
 s.clearLanes=[{x:8,y:17,w:24,h:4},{x:18,y:21,w:4,h:11}];
 s.zones=[{name:'Зона отдыха и питьевая вода',x:11,y:22,w:7,h:7},{name:'Хранение багажа',x:23,y:22,w:6,h:6}];
 s.chambers={A:{x:16.25,y:36.3,w:3.5,h:5.4},B:{x:20.25,y:36.3,w:3.5,h:5.4}};
 return s;
};
