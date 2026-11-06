'use strict';
const WalkTargets=(()=>{
 const roomNames={foyer:'Residential Lobby',standard:'Standard Room',improved:'Upgraded Room',lux:'Suite',bath:'Changing Room & Showers',wc:'Restroom',laundry:'Laundry',staff:'Service Area'};
 const links={foyer:{standard:'standard',improved:'improved',lux:'lux',bath:'bath',laundry:'laundry',staff:'staff'},standard:{exit:'foyer'},improved:{exit:'foyer'},lux:{exit:'foyer'},bath:{exit:'foyer',wcEntry:'wc'},wc:{exit:'bath'},laundry:{exit:'foyer'},staff:{exit:'foyer'}};
 const magazines={
  magAstound:'Astoundingly Awesome Tales',magUnstoppable:'The Unstoppables',
  magWasteland:'Wasteland Survival Guide',magRobco:'RobCo Fun',magLove:'Live & Love',
  magTesla:'Tesla Science',magPicket:'Picket Fences',magCoiffe:'La Coiffe',magSpecial:'You’re SPECIAL!'
 };
 const specs={
  foyer:[
   ['radioTable','Радио','radio',.99,[12.72,14.61]],
   ['gamesTable','Настольные игры','games',.69],
   ['foyerVending','Автомат «Нюка-Колы»','vending',1.01],
   ['eyebotDock','Зарядка робоглаза','dock',.09],
   ['suiteSofa','Диван','sofa',.55],
   ['perimeterSofa0','Диван у лестницы','sofa',.55],
   ['perimeterSofa1','Диван','sofa',.55],
   ['perimeterSofa2','Диван у полки','sofa',.55],
   ['entranceVaultArt','Плакат Vault-Tec','poster',1.67,[9.45,17.30],'foyerVaultPoster'],
   ['print1','Плакат Blast Radius','poster',1.72,[14.50,10.83],'foyerBlastPoster'],
   ['vendingNukaArt','Плакат Nuka-Cola','poster',1.95,[17.77,8.71],'foyerNukaPoster'],
   ['print2','Плакат Boston Bugle','poster',1.71,[24.50,10.34],'foyerBuglePoster'],
   ['foyerNotices','Объявления','notices',1.51,[19.19,8.27]]
  ],
  standard:[
   ['bed','Кровать','bed',.57,[4.34,5.68]],['wardrobe','Шкаф','wardrobe',1.03,[3.31,7.67]],
   ['desk','Терминал','terminal',1.03,[7.96,3.42]],['tv','Телевизор','tv',.84,[4.34,3.23]]
  ],
  improved:[
   ['bed','Кровать','bed',.57,[4.20,5.65]],['wardrobe','Шкаф','wardrobe',1.03,[3.31,7.27]],
   ['desk','Терминал','terminal',1.05,[7.03,3.44]],['tv','Телевизор','tv',.84,[5.25,3.24]],['shower','Душ','shower',1.18,[11.45,4.45]],
   ['basin','Умывальник','sink',.90,[12.21,4.50]]
  ],
  lux:[
   ['bed','Кровать','bed',.57,[6.48,4.12]],['wardrobe','Шкаф','wardrobe',1.11,[3.39,6.68]],
   ['sofa','Диван','sofa',.60,[8.86,5.90]],['writing','Терминал','terminal',1.04,[14.53,7.10]],
   ['suiteTV','Телевизор','tv',1.28,[8.94,8.18]],
   ['bath','Ванна','shower',.49,[13.89,4.51]],['sink','Умывальник','sink',.85,[13.45,4.10]]
  ],
  bath:[
   ['lockerA','Шкафчики','wardrobe',1.15,[3.34,5.68]],['lockerB','Шкафчики','wardrobe',1.15,[3.34,8.60]],
   ['towels','Полотенца','towels',.95,[6.56,3.43]],
   ...[0,1,2].map(i=>['stall'+i,'Душ '+(i+1),'shower',1.12,[9.0+i*1.94,4.98]]),
   ['sinkA','Умывальник','sink',.85,[9.18,9.24]],['sinkB','Умывальник','sink',.85,[9.18,10.55]]
  ],
  wc:[['basin','Умывальник','sink',.84,[5.49,3.46]]],
  laundry:[
   ...[0,1,2].map((i)=>['washer'+i,i===2?'Сушилка':'Стиральная машина '+(i+1),'washer',.68]),
   ['utilitySink','Мойка','sink',.84,[9.11,3.65]],['dirty','Бельё на стирку','dirty',.36,[12.72,3.97]],
   ['fold','Стол для белья','towels',.95,[6.9,7.46]],['cleanRack','Чистое бельё','towels',1.05,[3.48,8.62]]
  ],
  staff:[
   ['power','Электрощит','power',1.21,[5.85,3.45]],['valves','Водяные клапаны','valves',1.12,[8.15,3.18]],
   ['hatch','Люк осмотра','hatch',1.13,[10.55,3.36]],['staffBadge','Панель доступа','badge',.77,[16.04,6.15]],
   ['storageCrate','Ящик с расходниками','crate',.32,[4.95,11.66]],['storageRack','Стеллаж','stock',1.00,[3.65,10.72]],
   ['cart','Тележка','cart',.61,[3.38,7.95]]
  ]
 };
 const wrap=([x,y])=>({x,y});
 function doorSpot(room,d){
  const mx=d.x+d.ux*d.span/2,my=d.y+d.uy*d.span/2,anchor=room.spawn;
  const nx=-d.uy,ny=d.ux;
  const radial=(anchor[0]-mx)*nx+(anchor[1]-my)*ny;
  const inward=room.floor==='foyer'?(20-mx)*nx+(19-my)*ny:radial;
  const k=inward<0?-1:1;
  return {x:mx+k*nx*.86,y:my+k*ny*.86};
 }
 function fromRoom(id,room){
  const ts=[];
  for(const d of room.doors){
   const [x,y]=[d.x+d.ux*d.span/2,d.y+d.uy*d.span/2],dest=links[id]?.[d.id];
   if(dest){
    const label=id==='wc'?'Changing Room':roomNames[dest];
    ts.push({id:d.id,x,y,z:1.18,label,kind:'door',dest,approaches:[doorSpot(room,d)]});
   }else if(d.id==='lift'||d.id==='serviceLift'){
    const pos=d.id==='lift'?{x:19.61,y:22.02}:{x:14.78,y:3.11};
    ts.push({id:d.id,x,y,z:1.16,label:d.id==='lift'?'Passenger Lift':'Service Lift',kind:'lift',approaches:[pos]});
   }else if(d.id==='pickup')ts.push({id:d.id,x,y,z:1.28,label:'Окно выдачи',kind:'towels',approaches:[{x:3.04,y:6.65}]});
  }
  if(id==='foyer')ts.push({id:'up',x:7.40,y:19,z:.91,label:'Level 0 Stairwell',kind:'stairs',approaches:[{x:9.04,y:19}]});
  for(const [name,label,kind,z,spot,art] of specs[id]){
   const o=room.objects.find(o=>o.id===name);
   if(!o)throw Error('Missing object '+id+'/'+name);
   const {x,y}=o;
   let approaches;
   if(spot)approaches=[wrap(spot)];
   else if(kind==='washer')approaches=[{x,y:o.y0+o.h+.96}];
   else if(o.transform){
    const {nx,ny}=o.transform,gap=o.h/2+.63;
    approaches=[{x:x+nx*gap,y:y+ny*gap},{x:x+nx*(gap+.28),y:y+ny*(gap+.28)}];
   }else{
    const a=o.w/2+.54,b=o.h/2+.54;
    approaches=[{x:x+a,y},{x:x-a,y},{x,y:y+b},{x,y:y-b}];
   }
   ts.push({id:name,x,y,z,label,kind,approaches,art});
  }
  for(const {art,x,y,z,approach} of room.readables||[]){
   ts.push({id:art,x,y,z,label:magazines[art],kind:'magazine',approaches:[wrap(approach)],art});
  }
  return ts;
 }
 function zone(id,p){
  if(id==='foyer')return p.x<8.45?'Level 0 Stairwell':roomNames.foyer;
  if(id==='bath')return p.x<7.78?'Changing Room':'Showers';
  if(id==='improved'&&p.x>10.39&&p.y<6.22)return 'Private Shower';
  if(id==='lux')return p.x<7.72?'Bedroom':p.x>12.20&&p.y<5.80?'Bathroom':'Lounge';
  if(id==='staff')return p.y>9.10&&p.x<6.60?'Storage':p.x>12.18&&p.y<5.44?'Service Lift Vestibule':'Staff Corridor';
  return roomNames[id];
 }
 return {roomNames,fromRoom,zone};
})();
module.exports=WalkTargets;
