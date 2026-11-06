'use strict';
module.exports=({scene,palette})=>{
const rad=a=>a*Math.PI/180;
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function top(s,id,sprite,u,v,z,pxHeight,flip=false){
 const o=s.objects.find(o=>o.id===id);
 (o.decor??=[]).push({sprite,u,v,z,pxHeight,flip});
}
function artOn(s,id,art,u,v,w,h,z,approach){
 const o=s.objects.find(o=>o.id===id);
 const base=(a,b)=>o.transform?[o.transform.x+o.transform.ux*(a-o.w/2)+o.transform.nx*b,
  o.transform.y+o.transform.uy*(a-o.w/2)+o.transform.ny*b,z]:[o.x0+a,o.y0+b,z];
 const quad=[base(u,v),base(u+w,v),base(u+w,v+h),base(u,v+h)];
 (o.publications??=[]).push({art,quad});
 const [x,y]=base(u+w/2,v+h/2);
 (s.readables??=[]).push({art,x,y,z,approach});
}
function joinFoyerWalls(s){
 const corners=new Map();
 const members=[...s.walls,...s.doors].filter(o=>o.foyerShell);
 for(const o of members)for(const i of [0,1]){
  const [x,y]=[o.x+i*o.ux*o.span,o.y+i*o.uy*o.span];
  const key=x.toFixed(5)+','+y.toFixed(5),normal=[o.uy,-o.ux];
  if(!corners.has(key))corners.set(key,[]);
  corners.get(key).push({o,i,x,y,normal});
 }
 for(const pair of corners.values())for(const e of pair){
  const {o,i,x,y,normal:n}=e,other=pair.find(v=>v!==e);
  const m=other?.normal||n, dot=n[0]*m[0]+n[1]*m[1];
  const t=.123/Math.max(1+dot,.25);
  (o.outer??=[])[i]=[x+t*(n[0]+m[0]),y+t*(n[1]+m[1])];
  (o.adjacent??=[])[i]=other?{height:other.o.cutHeight||2.63,door:!!other.o.door}:null;
 }
}
function joinRoomWalls(s){
 const points=new Map(),members=[...s.walls,...s.doors].filter(o=>!o.foyerShell);
 const inside=(x,y,poly)=>poly.reduce((v,[a,b],i)=>{
  const [c,d]=poly[(i+1)%poly.length];
  return (b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a?!v:v;
 },false);
 const floor=(x,y)=>s.shapes.some(p=>inside(x,y,p));
 for(const o of members){
  const [mx,my]=[o.x+o.ux*o.span*.5,o.y+o.uy*o.span*.5],nx=-o.uy,ny=o.ux;
  const plus=floor(mx+nx*.16,my+ny*.16),minus=floor(mx-nx*.16,my-ny*.16);
  const sign=plus!==minus?(plus?-1:1):(o.ux-o.uy>0?-1:1);
  const normal=[nx*sign,ny*sign];
  for(const i of [0,1]){
   const [x,y]=[o.x+i*o.ux*o.span,o.y+i*o.uy*o.span],key=x.toFixed(5)+':'+y.toFixed(5);
   if(!points.has(key))points.set(key,[]);
   points.get(key).push({o,i,x,y,normal});
  }
 }
 for(const ends of points.values())for(const {o,i,x,y,normal:n} of ends){
  const others=ends.filter(e=>e.o!==o),prev=others.find(e=>Math.abs(e.o.ux*o.uy-e.o.uy*o.ux)<.0002)||
    (others.length===1?others[0]:null);
  const m=prev?.normal||n,dot=n[0]*m[0]+n[1]*m[1];
  const scale=.12/(1+dot);
  (o.outer??=[])[i]=dot>-.63?[x+scale*(n[0]+m[0]),y+scale*(n[1]+m[1])]:[x+n[0]*.12,y+n[1]*.12];
  (o.adjacent??=[])[i]=prev?{door:!!prev.o.door,low:!!prev.o.low,cutHeight:prev.o.cutHeight||0}:null;
  o.joined=true;
 }
 return s;
}
function foyer(){
 const cx=20,cy=19,r=11.8,pt=(a,rr=r)=>[cx+rr*Math.cos(rad(a)),cy+rr*Math.sin(rad(a))];
 const seating=[[199,2.30,'warm','communityPoster'],[237.8,2.46,'green','welcomePoster'],[293.8,2.47,'green','communityPoster']];
 const gates=[
  {a:34,w:2.76,id:'improved',title:'UPGRADED',tone:palette.better},
  {a:88,w:2.58,id:'lux',title:'SUITE',tone:palette.lux},
  {a:180,w:4.85,id:'up'},
  {a:219,w:2.74,id:'standard',title:'STANDARD',tone:palette.standard},
  {a:252,w:2.52,id:'bath',title:'SHOWERS',tone:palette.baths},
  {a:279,w:2.68,id:'laundry',title:'LAUNDRY',tone:palette.laundry},
  {a:352,w:2.64,id:'staff',title:'SERVICE AREA',tone:palette.staff}];
 for(const g of gates){const h=Math.asin(g.w/2/r)*180/Math.PI;g.start=g.a-h;g.end=g.a+h;}
 const gateCuts=gates.flatMap(g=>[g.start,g.end]);
 const cuts=[0,360,...gateCuts.filter(a=>a>0&&a<360)];
 for(let a=5;a<360;a+=5)if(!gates.some(g=>a>g.start-2.1&&a<g.end+2.1))cuts.push(a);
 cuts.sort((a,b)=>a-b);
 const s=scene('Residential Lobby',cuts.slice(0,-1).map(a=>pt(a)),[10.05,19.1,0]);
 s.finish='foyer';s.floor='foyer';s.circle={x:cx,y:cy,r};s.cleanWallJoints=true;
 for(let i=0;i<cuts.length-1;i++){
  const a=cuts[i],b=cuts[i+1],p=pt(a),q=pt(b),g=gates.find(g=>Math.abs(g.start-a)<1e-5&&Math.abs(g.end-b)<1e-5);
  const mid=(a+b)/2,near=Math.cos(rad(mid))+Math.sin(rad(mid))>-.12;
  if(g){
   if(g.id==='up')continue;
   s.portal(g.id,...p,...q,g.title,{tone:g.tone,entrySide:near,finish:near?'foyerFront':'foyer',foyerShell:true,restricted:g.id==='staff'});
   const v=pt(g.a,r-.42),nearV=pt(g.a,r-1.42),width=g.w*.92;
   s.thresholds??=[];
   const t=[-Math.sin(rad(g.a)),Math.cos(rad(g.a))];
   s.thresholds.push({p:v,q:nearV,t,width,color:g.tone});
  } else {
   const wing=gates.some(g=>g.id!=='up'&&mid>g.start-4.05&&mid<g.end+4.05);
   const opts={finish:near?'foyerFront':'foyer',foyerShell:true,frontCut:Math.cos(rad(mid))+Math.sin(rad(mid))>.10};
   s.seg(...p,...q,opts);
   if(!near&&!wing&&b-a>=4.5&&Math.round(mid/5)%3===0&&!seating.some(([a])=>Math.abs(a-mid)<3.7)){
    const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;
    s.lamp(mx,my);
   }
  }
 }
 const up=gates.find(g=>g.id==='up'),p=pt(up.start),q=pt(up.end),y=Math.min(p[1],q[1]),ey=Math.max(p[1],q[1]),mouth=p[0],start=3.85;
 s.rect(start,y,mouth-start+.01,ey-y);
 s.seg(start,y,mouth,y,{foyerShell:true});
 s.seg(mouth,ey,start,ey,{cutHeight:.85,finish:'foyerFront',foyerShell:true});
 s.seg(start,ey,start,y,{foyerShell:true});
 s.prop('stairs',null,start,y,1,{kind:'stairs',sx:start+.19,sy:y+.51,sw:mouth-start-.18,sh:ey-y-1.02,count:9});
 s.fixture('up','entryPanel',start,cy,2.31,2.02,.48,{display:'00 ↑'});
 s.lamp(start,y+.86);s.lamp(start,ey-.86);
 // A compact, chamfered shaft at the centre. Service access is on the perimeter.
 const core=[[18.25,17.03],[21.60,17.03],[22.13,17.57],[22.13,20.39],[21.59,20.93],[18.25,20.93],[17.73,20.41],[17.73,17.56]];
 for(let i=0;i<core.length;i++){
  const a=core[i],b=core[(i+1)%core.length];
  if(i===4){s.lineWithDoors(b,a,[{id:'lift',from:.25,to:2.91,title:'LIFT  1–6',tone:palette.lift,lift:true}],{finish:'lift'});}
  else s.seg(...a,...b,{finish:'lift'});
 }
 s.prop('roof',null,17.73,17.03,1,{kind:'roof',poly:core,w:4.4,h:3.9,depth:42.59});
 s.fixture('elevatorDisplay','entryPanel',22.13,19.43,1.58,.84,.78,{display:'01'});
 s.lamp(22.13,19.42);
 s.vent(22.13,18.38);
 // Straight seats follow the chord of each solid wall segment.
 for(const [i,[a,w,tint,poster]]of seating.entries()){
  s.arcSeat('perimeterSofa'+i,...pt(a,r-.24),rad(a),w,.91,{tint});
  s.fixture('print'+i,poster,...pt(a),1.68,.84,1.00);
 }
 for(const [i,[a,rr,variant]]of [[144.5,10.97,'foliageRound'],[229.2,11.02,'foliage'],[305.8,10.98,'foliageRound']].entries()){
  const [px,py]=pt(a,rr);s.model('floorPlant'+i,'plant',px-.285,py-.285,.57,.57,{variant,tall:i!==0});
 }
 s.pools=[...seating.map(([a])=>{const [x,y]=pt(a,r-1.53);return{x,y,r:2.56,tint:'#efbe7760'};}),{x:19.55,y:21.74,r:2.7,tint:'#e3bb7540'}];
 const service=pt(337,r);
 s.fixture('serviceVent','vaultVent',...service,.59,.67,.37);
 s.aisles=[['К лифту',19.65,22.23],...gates.filter(g=>g.id!=='up').map(g=>[g.title,...pt(g.a,r-1.12)]),['К лестнице',9.23,19.0],...seating.map(([a],i)=>['К дивану '+(i+1),...pt(a,r-1.62)])];
 joinFoyerWalls(s);
 return s;
}

function foyerDecor(kind){
 const s=foyer(),pt=(a,r=11.8)=>[20+r*Math.cos(rad(a)),19+r*Math.sin(rad(a))];
 const furnished=kind==='furnished'||kind==='patrol';
 const agreed=kind==='agreed'||furnished;
 if(agreed||kind==='radio'){
  const [x,y]=pt(208.5,9.43);
  s.model('radioTable','spriteStand',x-.42,y-.42,.84,.84,{sprite:'pzSideTable',scale:.46,top:.93,radio:true});
  s.aisles.push(['К столику',x+.91,y+.10]);
 }
 if(agreed||kind==='fern'){
  Object.assign(s.objects.find(o=>o.id==='floorPlant1'),{variant:'pzFern',plantScale:.67});
 }
 if(agreed||kind==='notices'){
  s.fixture('foyerNotices','pzNotice',...pt(266.7),1.51,.62,.55);
 }
 if(agreed||kind==='landscape'){
  Object.assign(s.objects.find(o=>o.id==='print0'),{sprite:'pzLandscape',width:.92,height:.61,z:1.63});
 }
 if(furnished){
  const angle=rad(199),[rx,ry]=pt(198.4,9.79);
  const corner=(u,v)=>[rx+u*Math.sin(angle)-v*Math.cos(angle),ry-u*Math.cos(angle)-v*Math.sin(angle),.027];
  s.fabricRugs=[{art:'foyerRug',quad:[corner(-1.37,-.64),corner(1.37,-.64),corner(1.37,.64),corner(-1.37,.64)]}];
  const plant=s.objects.find(o=>o.id==='floorPlant2');
  const [px,py]=pt(315.1,10.97),pi=s.occupied.findIndex(o=>o[4]===plant.id);
  Object.assign(plant,{x:px,y:py,x0:px-.285,y0:py-.285,depth:px+py+.552});
  s.occupied[pi]=[plant.x0,plant.y0,.57,.57,plant.id];
  const [sx,sy]=pt(303.8,11.19);
  s.arcSeat('readingShelf',sx,sy,rad(292.6),1.19,.57,{short:true});
  s.objects.find(o=>o.id==='readingShelf').type='arcBookcase';
  const [ax,ay]=pt(303.8,9.54);s.aisles.push(['К полке для обмена книгами',ax,ay]);
  s.fixture('liftClock','pzSquareClock',22.13,18.28,1.86,.71,.66);
  s.objects.find(o=>o.id==='radioTable').cola=true;
 }
 if(kind==='patrol'){
  const setPrint=(id,sprite,width,height,z)=>Object.assign(s.objects.find(o=>o.id===id),{sprite,width,height,z});
  setPrint('print1','foyerBlastPoster',.91,1.15,1.72);
  setPrint('print2','foyerBuglePoster',.90,1.16,1.71);
  const stairs=s.objects.find(o=>o.id==='stairs');
  s.fixture('entranceVaultArt','foyerVaultPoster',6.22,stairs.sy-.51,1.67,1.90,.93);
  s.fixture('vendingNukaArt','foyerNukaPoster',...pt(261.8),1.95,.72,.98);
  const place=(id,sprite,x,y,w,h,options)=>s.model(id,'anchoredSprite',x-w/2,y-h/2,w,h,{sprite,...options});
  s.arcSeat('foyerVending',...pt(263.1,11.63),rad(263.1),.99,.61,{type:'arcVending',sprite:'foyerVending'});
  const [gx,gy]=pt(129.8,10.02);
  place('gamesTable','foyerGameTable',gx,gy,1.18,1.18,{pxHeight:52,foot:.79,game:true,solidShadow:true});
  place('gameChair0','foyerGameSeatSE',gx-1.16,gy,.66,.62,{pxHeight:49,foot:.84});
  place('gameChair1','foyerGameSeatNW',gx+1.16,gy,.66,.62,{pxHeight:49,foot:.84});
  s.arcSeat('eyebotDock',...pt(333.0,11.52),rad(333.0),1.04,.98,{type:'arcDock',sprite:'foyerDock',flush:true});
  const {x:dx,y:dy}=s.objects.find(o=>o.id==='eyebotDock');
  s.arcSeat('suiteSofa',...pt(60.8,11.56),rad(60.8),2.55,.94,{tint:'olive'});
  s.flight={hub:[20,19],radius:7.0,phase:2.58,dock:[dx,dy]};
  top(s,'readingShelf','fo4Globe',1.01,.25,.87,23);
  artOn(s,'readingShelf','magAstound',.10,.10,.32,.41,.878,pt(305.5,9.54));
  artOn(s,'readingShelf','magUnstoppable',.52,.08,.32,.41,.878,pt(302.1,9.54));
  s.aisles.push(['Nuka-Cola machine',...pt(263.1,10.04)],['Game table',gx,gy-1.19],['Eyebot dock',...pt(333.0,9.92)],['Suite lounge',...pt(60.8,9.84)]);
  s.focus=['entranceVaultArt','print1','vendingNukaArt','print2','foyerVending','gamesTable','eyebotDock','suiteSofa'].map(id=>{
   const o=s.objects.find(o=>o.id===id);return[id,o.x,o.y,o.z??.65];
  });
 }
 return s;
}

function base(label,style,w,h,spawn){const s=scene(label,rect(2,2,w,h),spawn);s.finish=style;s.floor=style;return s;}
function perimeter(s,x,y,door){
 s.lineWithDoors([2,2],[x,2],[door]);s.seg(2,2,2,y);s.seg(x,2,x,y,{low:true});s.seg(2,y,x,y,{low:true});
}
function standard(){
 const s=base('Standard Room · A-01','standard',9.65,7.43,[10.17,5.11,3]);
 perimeter(s,11.65,9.43,{id:'exit',from:6.80,to:8.93,title:'LOBBY',tone:palette.standard,finish:'standard'});
 s.model('bed','bed',2.15,3.78,2.63,1.34,{wall:['x',2]});
 s.model('wardrobe','cabinet',2.13,6.89,.71,1.60,{facing:'east',wall:['x',2]});
 s.model('bedside','chest',2.15,5.49,.63,.60,{height:.55,lamp:'pzLamp'});
 s.model('desk','desk',6.27,2.14,1.90,.82,{terminal:'south',wall:['y',2]});
 s.model('chair','seat',6.96,3.52,.65,.65,{face:'north',high:.82,tint:'green'});
 s.model('tv','tvStand',3.75,2.13,1.18,.65,{height:.56,wall:['y',2],face:'south'});
 s.model('travelCase','anchoredSprite',2.14,6.30,.49,.42,{sprite:'pzSuitcase',pxHeight:24,foot:.97,wall:['x',2]});
 top(s,'bedside','pzAlarm',.47,.45,.55,15);
 top(s,'tv','pzRemote',.94,.48,.565,9);
 artOn(s,'desk','magWasteland',.17,.31,.34,.44,.880,[6.50,3.34]);
 s.fixture('roomPoster','roomSugarPoster',5.51,2,1.78,.72,.89);
 s.fabricRugs=[{x:3.35,y:5.25,w:2.25,h:1.32,color:'blue'}];
 s.pools=[{x:3.52,y:4.75,r:2.9,tint:'#f1bb7160'},{x:7.02,y:3.43,r:2.25,tint:'#e6b47655'}];
 s.fixture('vent','vaultVent',2,9.03,.59,.54,.29);
 s.aisles=[['Вход',9.92,2.89],['Кровать',4.33,5.66],['Шкаф',3.28,7.62],['Стол',8.00,3.62],['Телевизор',4.30,3.11]];
 return s;
}

function improved(){
 const s=base('Upgraded Room · B-12','improved',11.7,7.3,[7.33,5.41,3]);
 s.lineWithDoors([2,2],[10.39,2],[{id:'exit',from:5.84,to:8.03,title:'LOBBY',tone:palette.better,finish:'improved'}]);
 s.seg(10.39,2,13.7,2,{finish:'privateWet'});s.seg(2,2,2,9.30);
 s.seg(13.7,2,13.7,6.22,{low:true,finish:'privateWet'});s.seg(13.7,6.22,13.7,9.3,{low:true});s.seg(2,9.3,13.7,9.3,{low:true});
 s.seg(10.39,2,10.39,3.94,{cutHeight:.66,finish:'privateWet'});s.seg(10.39,5.78,10.39,6.22,{cutHeight:.66,finish:'privateWet'});
 s.seg(10.39,6.22,13.7,6.22,{cutHeight:.66,finish:'privateWet'});
 s.wet=[10.39,2,3.31,4.22];s.wetFloor='privateWet';
 s.model('bed','bed',2.16,3.28,2.75,1.92,{double:true,wall:['x',2]});
 s.model('wardrobe','cabinet',2.11,6.47,.72,1.65,{facing:'east',wall:['x',2]});
 s.model('night','chest',2.15,5.37,.66,.69,{lamp:'pzLamp'});
 s.model('tv','tvStand',4.00,2.13,1.21,.62,{height:.57,wall:['y',2],face:'south'});
 s.model('desk','desk',5.38,2.13,1.66,.83,{terminal:'south',drawer:true,wall:['y',2]});
 s.model('chair','seat',5.91,3.53,.68,.69,{face:'north',high:.91,tint:'green'});
 s.model('shower','shower',10.58,2.13,1.56,1.69,{end:true,style:'privateWet',wall:['y',2]});
 s.model('basin','sink',12.92,4.06,.63,.91,{face:'west'});
 s.model('toilet','toilet',12.66,2.14,.83,1.10,{face:'south',wall:['y',2]});
 s.model('reader','seat',12.58,7.48,.82,.87,{face:'west',high:1.04,tint:'green'});
 s.model('readerTable','coffee',11.51,7.83,.66,.66);
 s.model('readerFern','plant',12.80,8.57,.50,.50,{plantScale:.76,variant:'pzFern'});
 s.fixture('readingClock','pzSquareClock',6.18,2,1.94,.44,.43);
 top(s,'desk','fo4DeskFan',1.39,.38,.876,23);
 top(s,'bed','pzBear',.53,1.56,.663,19);
 top(s,'readerTable','pzTissues',.52,.20,.465,12);
 artOn(s,'night','magRobco',.32,.22,.26,.39,.608,[3.18,5.72]);
 artOn(s,'readerTable','magPicket',.08,.16,.29,.41,.468,[11.12,7.52]);
 s.fabricRugs=[{x:3.44,y:5.34,w:2.66,h:1.36,color:'rust'},{x:11.17,y:7.12,w:2.16,h:1.76,color:'amber'}];
 s.pools=[{x:3.53,y:4.56,r:3.5,tint:'#f4bf7756'},{x:12.10,y:7.99,r:2.7,tint:'#e5af7660'}];
 s.vent(13.15,2);
 s.aisles=[['Вход',8.96,2.87],['Кровать',4.19,5.64],['Шкаф',3.29,7.25],['Стол',7.06,3.63],['Телевизор',5.25,3.24],['Душ',11.46,4.38],['Раковина',12.27,4.46],['Туалет',13.05,3.66],['Чтение',11.21,7.44]];
 return s;
}

function luxury(){
 const s=base('Suite · L-03','lux',14.35,6.86,[10.94,5.56,2]);
 s.lineWithDoors([2,2],[12.20,2],[{id:'exit',from:8.40,to:10.00,title:'LOBBY',tone:palette.lux,finish:'lux'}]);
 s.seg(12.20,2,16.35,2,{finish:'suiteWet'});s.seg(2,2,2,8.86);s.seg(16.35,2,16.35,5.80,{low:true,finish:'suiteWet'});s.seg(16.35,5.80,16.35,8.86,{low:true});
 s.seg(2,8.86,7.72,8.86,{low:true});s.seg(7.72,8.86,16.35,8.86,{low:true});

 // Cut at waist height so the actual partitions and door openings stay legible.
 s.seg(7.72,2,7.72,5.86,{cutHeight:1.12,finish:'lux'});
 s.seg(7.72,7.60,7.72,8.86,{cutHeight:1.99,finish:'lux',maxPanelSpan:1.3});
 s.seg(12.20,2,12.20,5.80,{cutHeight:.87,finish:'suiteWet'});
 s.seg(12.20,5.80,13.01,5.80,{cutHeight:.87,finish:'suiteWet'});
 s.seg(14.69,5.80,16.35,5.80,{cutHeight:1.05,finish:'lux'});
 s.wet=[12.20,2,4.15,3.80];s.wetFloor='suiteWet';

 s.model('bed','bed',3.56,2.16,2.40,2.70,{head:'north',double:true,wall:['y',2],throw:true});
 s.model('nightL','chest',2.66,2.17,.66,.64,{height:.59,wall:['y',2]});
 s.model('nightR','chest',6.20,2.17,.66,.64,{height:.59,lamp:'pzLamp',wall:['y',2]});
 s.model('wardrobe','cabinet',2.12,5.84,.77,1.97,{facing:'east',asset:'luxeWardrobe',height:2.06,wall:['x',2]});
 s.model('linenBench','bench',3.83,5.13,1.87,.66,{face:'north',tint:'green',high:.51});

 s.model('loungeBooks','bookShelf',8.40,2.13,1.47,.64,{height:1.33,wall:['y',2]});
 s.model('sofa','bench',7.86,3.01,.97,2.53,{face:'east',tint:'warm',sections:3,wall:['x',7.72]});
 s.model('coffee','coffee',9.32,3.57,.88,1.31,{cup:true});
 s.fixture('suiteArt','pzLandscape',4.75,2,1.84,1.66,.84);
 s.prop('loungeChair','luxeChairB',9.84,5.96,1.40,{foot:.91,flip:true});s.occupied.push([9.39,5.47,.90,.98,'Кресло']);
 s.fixture('suiteTV','suiteTV',7.72,8.23,1.28,1.10,.85);
 s.model('writing','desk',14.84,5.94,1.27,.74,{drawer:true,terminal:'south',wall:['y',5.80]});
 s.model('deskChair','seat',15.12,7.22,.70,.69,{face:'north',tint:'green',high:.87});

 s.model('bath','tub',13.55,2.15,2.42,1.19,{wall:['y',2]});
 s.model('sink','sink',12.34,3.63,.68,.91,{face:'east',wall:['x',12.20]});
 s.model('toilet','toilet',15.10,3.83,1.11,.86,{face:'west',wall:['x',16.35,'max']});
 s.model('acousticGuitar','anchoredSprite',2.14,4.76,.44,.53,{sprite:'pzGuitar',pxHeight:47,foot:.96,wall:['x',2]});
 top(s,'loungeBooks','pzTrophy',.34,.32,1.34,24);
 top(s,'writing','fo4CigarBox',1.01,.44,.874,15);
 top(s,'bath','pzDuck',2.19,.069,.589,13);
 artOn(s,'nightL','magSpecial',.12,.18,.39,.34,.598,[3.06,3.23]);
 artOn(s,'coffee','magLove',.15,.67,.36,.48,.468,[10.65,4.42]);
 artOn(s,'writing','magCoiffe',.05,.31,.30,.39,.878,[14.50,7.08]);

 s.fabricRugs=[{x:3.02,y:3.95,w:3.68,h:2.36,color:'blue'},{x:8.06,y:2.98,w:2.78,h:3.67,color:'rust',art:'arcanumRug'}];
 s.pools=[{x:4.84,y:3.26,r:3.10,tint:'#efbc7875'},{x:9.26,y:4.01,r:3.08,tint:'#e8b67472'},{x:15.39,y:6.84,r:2.25,tint:'#f3c58468'}];
 s.vent(15.73,2);
 s.aisles=[['Вход',11.29,2.88],['Спальня',7.01,6.80],['Левая сторона кровати',3.03,3.96],['Правая сторона кровати',6.50,4.17],['Шкаф',3.38,6.69],['Гостиная',8.73,6.09],['Столик',10.48,4.41],['Книжная полка',9.36,3.12],['Телевизор',8.94,8.18],['Ванная',13.88,4.69],['Раковина',13.49,4.04],['Туалет',14.50,4.24],['Рабочий стол',14.64,7.19]];
 return s;
}

function showers(){
 const s=base('Changing Room & Showers','wet',15.10,9.58,[5.73,5.48,3]);
 s.lineWithDoors([2,2],[7.78,2],[{id:'exit',from:.69,to:3.02,title:'LOBBY',tone:palette.baths,finish:'standard'}],{finish:'standard'});
 s.seg(7.78,2,17.10,2,{finish:'wet'});
 s.seg(2,2,2,11.58,{finish:'standard'});s.seg(2,11.58,5.28,11.58,{low:true,finish:'standard'});s.seg(7.64,11.58,7.78,11.58,{low:true,finish:'standard'});
 s.seg(7.78,11.58,17.10,11.58,{low:true});s.seg(17.10,2,17.10,11.58,{low:true});
 s.zoneFloors=[{x:2,y:2,w:5.78,h:9.58,style:'changing'},{x:5.28,y:11.58,w:2.36,h:2.13,style:'changing'}];

 // Dry changing area and a wide passage into the wet area.
 s.seg(7.78,2,7.78,6.12,{cutHeight:1.12,finish:'standard'});
 s.seg(7.78,8.46,7.78,11.58,{cutHeight:.81,finish:'wet'});
 s.grates.push([7.90,6.14,.19,2.29]);
 s.model('lockerA','cabinet',2.14,4.11,.73,2.58,{facing:'east',height:1.95,style:'standard',wall:['x',2]});
 s.model('lockerB','cabinet',2.14,7.23,.73,2.62,{facing:'east',height:1.95,style:'standard',wall:['x',2]});
 s.model('benchA','bench',4.28,4.58,.74,2.14,{face:'west',high:.49,tint:'green'});
 s.model('benchB','bench',4.28,7.45,.74,2.12,{face:'west',high:.49,tint:'green'});
 s.model('towels','shelf',5.93,2.13,1.44,.72,{height:1.52,style:'standard',wall:['y',2]});

 for(const [i,x] of [8.04,9.98,11.92].entries())s.model('stall'+i,'shower',x,2.13,1.94,2.17,{end:i===2,wall:['y',2]});
 s.grates.push([8.04,4.48,5.82,.22]);
 s.model('sinkA','sink',7.92,8.79,.72,1.01,{face:'east',wall:['x',7.78]});
 s.model('sinkB','sink',7.92,10.09,.72,1.01,{face:'east',wall:['x',7.78]});

 // The sanitary room branches off the dry aisle, across from the changing benches.
 s.rect(5.28,11.58,2.36,2.13);
 s.seg(5.28,11.58,5.28,13.71,{cutHeight:.96,finish:'standard'});
 s.seg(7.64,11.58,7.64,13.71,{cutHeight:.82,finish:'standard'});
 s.lineWithDoors([5.28,13.71],[7.64,13.71],[{id:'wcEntry',from:.17,to:2.19,title:'RESTROOM',tone:palette.baths,finish:'standard'}]);
 for(const x of [5.48,8.75,10.86,12.78])s.lamp(x,2);
 s.lamp(2,3.22);s.lamp(2,10.78);
 s.aisles=[['Вход',3.86,2.83],['Шкафчики',3.32,5.66],['Скамья',5.54,8.62],['Полотенца',6.56,3.45],['Проход в душевые',7.63,7.26],...Array.from({length:3},(_,i)=>['Душ '+(i+1),9.0+1.94*i,4.95]),['Умывальник 1',9.16,9.25],['Умывальник 2',9.17,10.52],['Дверь санузла',6.46,12.90]];
 return s;
}

function restroom(){
 const s=base('Restroom','restroom',6.70,5.12,[5.94,5.44,3]);
 perimeter(s,8.70,7.12,{id:'exit',from:4.16,to:6.42,title:'CHANGING ROOM',tone:palette.baths});
 s.model('wc','toilet',3.02,2.14,.83,1.10,{face:'south',wall:['y',2]});
 s.seg(4.46,2,4.46,4.21,{cutHeight:1.04});
 s.model('basin','sink',4.99,2.14,1.01,.74,{wall:['y',2]});
 top(s,'basin','pzSoap',.83,.16,.804,8);
 s.vent(2,3.11);s.lamp(3.72,2);s.lamp(5.46,2);
 s.aisles=[['Дверь',7.30,2.85],['Уборная',3.45,3.75],['Умывальник',5.51,3.43]];
 return s;
}

function laundry(){
 const s=base('Laundry','laundry',12.4,7.81,[11.33,5.67,3]);
 s.lineWithDoors([2,2],[14.4,2],[{id:'exit',from:9.55,to:11.97,title:'LOBBY',tone:palette.laundry,finish:'laundry'}]);
 s.lineWithDoors([2,2],[2,9.81],[{id:'pickup',from:3.55,to:5.72,title:'',windowCut:true}]);
 s.seg(14.4,2,14.4,9.81,{low:true});s.seg(2,9.81,14.4,9.81,{low:true});
 for(const [i,x] of [2.26,4.10,6.05].entries())s.model('washer'+i,'washer',x,2.13,1.52,1.18,{dryer:i===2,wall:['y',2]});
 s.model('utilitySink','sink',8.48,2.13,1.27,.86,{wall:['y',2]});
 s.model('dirty','basket',13.35,3.33,.89,1.04,{});
 s.model('secondBasket','basket',13.35,4.55,.89,1.02,{});
 s.model('fold','worktop',5.78,8.04,2.27,1.04,{height:.91,style:'standard',linen:true});
 s.model('cleanRack','shelf',2.14,8.03,.90,1.49,{style:'standard',height:1.75,wall:['x',2]});
 s.model('clean','basket',4.18,8.59,.85,.83,{clean:true});
 s.model('mop','anchoredSprite',10.09,2.13,.30,.45,{sprite:'pzMop',pxHeight:46,foot:.98,wall:['y',2]});
 top(s,'fold','pzBathTowel',1.53,.28,.92,17);
 s.grates.push([2.22,3.52,6.72,.22]);
 s.fixture('stock','systemsPanel',2,5.30,1.53,.71,.86);
 for(const x of [3.5,7.7,10.16,14.18])s.lamp(x,2);
 s.lamp(2,8.82);
 s.aisles=[['Вход',12.76,2.84],...s.objects.filter(o=>o.type==='washer').map(o=>[o.id,o.x,o.y0+o.h+.96]),['Раковина',9.08,3.59],['Корзины',12.76,4.65],['Стол',6.9,7.46],['Окно выдачи',2.89,6.69],['Стеллаж',3.46,8.38]];
 return s;
}

function service(){
 const s=base('Service Area','staff',15.50,7.10,[6.98,5.80,0]);
 s.lineWithDoors([2,2],[17.50,2],[{id:'exit',from:.47,to:2.50,title:'LOBBY',tone:palette.staff,finish:'staff'},{id:'serviceLift',from:10.83,to:14.81,title:'SERVICE LIFT',tone:palette.lift,finish:'lift',lift:true}]);
 s.rect(2,9.10,4.60,3.38);
 s.seg(2,2,2,9.10);s.seg(2,9.10,2,12.48,{cutHeight:1.33});
 s.seg(17.50,2,17.50,9.10,{low:true});s.seg(6.60,9.10,17.50,9.10,{low:true});
 s.seg(2,12.48,6.60,12.48,{low:true});s.seg(6.60,9.10,6.60,12.48,{cutHeight:.71});
 s.seg(2,9.10,3.37,9.10,{cutHeight:.88});s.seg(5.54,9.10,6.60,9.10,{cutHeight:.88});
 s.portal('storage',3.37,9.10,5.54,9.10,'',{finish:'staff',accessCut:true});
 // Access door and inner walls are cut away to show the separate lift vestibule.
 s.seg(12.18,2,12.18,5.44,{cutHeight:1.00,finish:'staff'});
 s.seg(12.18,5.44,13.37,5.44,{cutHeight:1.00,finish:'staff'});
 s.seg(15.78,5.44,17.50,5.44,{cutHeight:1.00,finish:'staff'});
 s.portal('staffAccess',13.37,5.44,15.78,5.44,'',{finish:'staff',accessCut:true});
 s.zoneFloors=[{x:12.18,y:2,w:5.32,h:3.44,style:'staffBay'},{x:2,y:9.10,w:4.60,h:3.38,style:'staffBay'}];
 s.strips.push([13.38,5.47,2.38,.10,'#b4a177'],[13.41,2.41,2.79,.10,'#b4a177']);

 s.model('power','powerPanel',5.14,2.13,1.43,.34,{wall:['y',2]});
 s.model('valves','valveAccess',7.09,2.13,2.12,.28,{wall:['y',2]});
 s.model('hatch','maintenanceHatch',9.81,2.13,1.47,.25,{wall:['y',2]});
 s.model('cart','trolley',2.14,7.39,.71,1.18,{wall:['x',2]});
 s.model('storageRack','shelf',2.14,9.70,.88,2.15,{height:1.66,style:'standard',supplies:true,wall:['x',2]});
 s.model('storageCrate','openingCrate',5.53,11.26,.76,.76,{style:'standard'});
 top(s,'cart','pzToolbox',.35,.52,.748,16);
 artOn(s,'storageRack','magTesla',.30,1.44,.36,.48,1.468,[3.61,11.18]);
 s.fixture('staffBadge','systemsPanel',16.04,5.44,.78,.27,.33);
 s.fixture('powerLabel','entryPanel',5.85,2,2.36,1.16,.29,{display:'POWER'});
 s.fixture('valveLabel','entryPanel',8.15,2,2.15,1.82,.32,{display:'WATER · L1'});
 s.fixture('hatchLabel','entryPanel',10.55,2,2.06,1.05,.31,{display:'HATCH'});
 s.fixture('liftNotice','entryPanel',17.07,2,1.42,.58,.49,{display:'1–9'});
 s.lamp(6.53,2);s.lamp(11.70,2);s.lamp(2,3.28);
 s.callouts=[[1,4.53,10.72],[2,5.85,3.25],[3,8.95,3.44],[4,14.59,4.36]];
 s.hotspots=[['stock',3.14,10.76,.70],['crate',5.91,11.66,.30],['cart',2.51,7.91,.56],['exit',3.51,2.04,1.30],['power',5.86,2.53,1.19],['pipes',8.03,2.43,1.16],['hatch',10.55,2.40,1.10],['badge',15.97,5.54,.77],['lift',14.79,2.07,1.25]];
 s.aisles=[['Вход',3.46,2.87],['Кладовая',4.38,10.73],['Стеллаж',3.57,10.78],['Тележка',3.45,7.97],['Щит',5.85,3.27],['Клапаны',8.02,3.10],['Люк',10.56,3.11],['Тамбур',14.55,5.03],['Лифт',14.78,3.06],['Считыватель',16.05,6.24]];
 return s;
}
return Object.fromEntries(Object.entries({foyer,foyerDecor,standard,improved,luxury,showers,restroom,laundry,service})
 .map(([id,make])=>[id,(...args)=>joinRoomWalls(make(...args))]));
};
