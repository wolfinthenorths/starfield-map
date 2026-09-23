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
 rectangle(17,0,6,7);  // Residential stairs B.
 const segment=(x,y,ex,ey,low=false,internal=false)=>{
  const length=Math.hypot(ex-x,ey-y),ux=(ex-x)/length,uy=(ey-y)/length,n=Math.ceil(length);
  for(let i=0;i<n;i++){const span=length/n;s.walls.push({x:x+ux*span*i,y:y+uy*span*i,ux,uy,span,low,internal,depth:x+y+(ux+uy)*span*(i+.5)});}
 };
 // Long wall facets give the circular hall a continuous fitted rim.
 for(let i=0;i<hall.length;i++){
  const [x,y]=hall[i],[ex,ey]=hall[(i+1)%hall.length],low=(ey-y)-(ex-x)>0;
  if(y===6&&ey===6){segment(16,6,17,6);segment(23,6,24,6);}
  else if(x===32&&ex===32){segment(32,14,32,16,true);}
  else if(y===30&&ey===30){} // Open arrival mouth.
  else if(x===8&&ex===8){segment(8,22,8,21);segment(8,15,8,14);}
  else segment(x,y,ex,ey,low);
 }
 // Two stairs descending from level 0 into the residential level.
 segment(3,15,8,15);segment(3,21,8,21,true);segment(3,15,3,21);
 segment(17,0,23,0);segment(17,0,17,6);segment(23,0,23,6,true);
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
 for(const x of[16.5,21.5])prop('counterWing'+x,'receptionMiddle',x,10.5,1.16);
 for(const x of[18,20])prop('receptionChair'+x,'receptionSeat',x,9.4,1.18);
 prop('receptionSign',null,19,7.7,1,{kind:'sign',blocked:false,depth:25.6});
 prop('welcomeScreen','screen',16.1,8.7,1.08,{action:'welcome',label:'Прочитать приветствие',target:'VAULT-TEC ВАС ЖДАЛИ',approach:[15.5,10.5]});
 prop('mainTerminal','console',23.4,10.7,1.4,{action:'terminal',label:'Открыть главный терминал',target:'ГЛАВНЫЙ ТЕРМИНАЛ',approach:[23.5,12.5]});
 for(const [i,x,y]of[[0,15,8.8],[1,24.2,8.9]])prop('receptionLamp'+i,'lamp',x,y,1.05,{light:true});
 for(const [i,x,y]of[[0,14,9.2],[1,25.3,10.4],[2,9.9,14.3],[3,11.8,23.7],[4,28.1,14.1],[5,26.2,26.6]])prop('plant'+i,'cactus',x,y,.95,{planter:true});
 // Matching leather sofas and green upholstery, in two compact waiting groups.
 for(const [i,x,y]of[[0,11.8,17.2],[1,15.3,24.8]]){
  prop('sofa'+i,'sofa',x,y,1.6,{footprint:[Math.floor(x)-1,Math.floor(y)-1,2,1]});
  prop('coffeeTable'+i,'coffeeRound',x+2,y+.8,1.15,{action:'magazines',label:'Посмотреть брошюры',target:'ЗОНА ОЖИДАНИЯ',approach:[x+1.5,y+2.3]});
  prop('loungeChair'+i,'loungeChair',x+3.1,y+2,1.2,{flip:true});
  prop('waitingLamp'+i,'lamp',x-1,y+1.7,.95,{light:true});
 }
 prop('notice','screen2',11.2,13.4,.9,{action:'notices',label:'Прочитать объявления',target:'СООБЩЕНИЯ УБЕЖИЩА',approach:[12.5,13.5]});
 prop('residential','terminal',26.6,12.8,1,{action:'residential',label:'Узнать маршрут к спальням',target:'ЖИЛОЙ СЕКТОР',approach:[25.5,13.5]});
 prop('stairA',null,6.2,18,1,{kind:'stairs',axis:'x',action:'stairs',label:'Лестница A · жилой сектор',target:'УРОВЕНЬ 1 · ПЕРЕХОД A',approach:[8.5,18.5],footprint:[3,15,4,6]});
 prop('stairB',null,20,3,1,{kind:'stairs',axis:'y',action:'stairs',label:'Лестница B · жилой сектор',target:'УРОВЕНЬ 1 · ПЕРЕХОД B',approach:[20.5,6.5],footprint:[17,0,6,4]});
 prop('shaft',null,20,19,1,{kind:'floorMarker',blocked:false,action:'shaft',label:'О лифтовой шахте',target:'ЛИФТОВОЙ УЗЕЛ · ЭТАЖОМ НИЖЕ',approach:[21.5,20.5]});
 prop('scanner','terminal',22.6,33.5,.9,{action:'scan',label:'Проверить допуск',target:'КОНТРОЛЬ ДОСТУПА',approach:[21.5,34.5]});
 prop('robot','robotSprite',17.6,33.7,1.25,{action:'robot',label:'Обратиться к контроллеру',target:'РОБОТ-КОНТРОЛЛЕР',approach:[18.5,34.5]});
 for(const [lane,x]of[['A',16.6],['B',23.5]]){
  prop('cleanControl'+lane,'terminal',x,39.4,.72,{chamber:lane,action:'decon',label:'Запустить обработку · '+lane,target:'ДЕЗАКТИВАЦИЯ · КАМЕРА '+lane,approach:[lane==='A'?18.5:22.5,39.5]});
  prop('sprayer'+lane,'machine',x,37.9,.55);
 }
 prop('airlockScreen','screen',16.7,45.8,.84,{action:'airlock',label:'Прочитать инструкцию',target:'ВХОД ИЗ СИСТЕМЫ БУНКЕРОВ',approach:[18.5,45.5]});
 prop('entryMachinery','pipeMachine',16.6,43.7,.78,{blocked:false});
 prop('entryLamp','lamp',23.2,45.7,.9,{light:true});
 prop('surfacePanel','terminal',39.6,16.8,.9,{action:'denied',label:'Запросить доступ на Поверхность',target:'ОСОБЫЙ ДОПУСК',approach:[39.5,18.5]});
 prop('surfaceInfo','screen2',33.5,16.6,.8,{action:'surfaceInfo',label:'Прочитать ограничения',target:'ИЗОЛИРОВАННЫЙ ШЛЮЗ',approach:[33.5,18.5]});
 prop('surfaceMachine','wallMachine',37.6,16.5,.8,{footprint:[36,16,2,1]});
 prop('serviceBox','box',29.2,24.8,1.2,{action:'chest',label:'Открыть ящик',target:'ЗАПАСНЫЕ ФИЛЬТРЫ',approach:[27.5,24.5]});
 for(const [i,x,y]of[[0,12.7,8.7],[1,10.4,10.9],[2,27,8.5]])prop('vent'+i,'airVent',x,y,1.25,{blocked:false,z:1.3});
 for(const [i,x,y]of[[0,14.6,7.3],[1,9,12.8],[2,24.8,6.9]])prop('wallLight'+i,'lampWall',x,y,1.35,{blocked:false,z:1.45});
 s.labels=[['РЕГИСТРАЦИЯ',19,10.8,2.6],['ЛЕСТНИЦА A · ЖИЛОЙ СЕКТОР',6.5,16,2.5],['ЛЕСТНИЦА B · ЖИЛОЙ СЕКТОР',20,3.5,2.6],['ИЗ СИСТЕМЫ БУНКЕРОВ',20,47.5,2.65],['ДЕЗАКТИВАЦИЯ',20,40,2.7],['КОНТРОЛЬ ДОСТУПА',20,32,2.7],['ПОВЕРХНОСТЬ',41.5,18.5,2.8]];
 s.chambers={A:{x:16.25,y:36.3,w:3.5,h:5.4},B:{x:20.25,y:36.3,w:3.5,h:5.4}};
 return s;
};
