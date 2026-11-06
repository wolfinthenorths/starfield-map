 const caches=new Map();
 let staticParts=[];
 function gatherStatic(){
  staticParts=[...level.walls.map(o=>({...o,kind:'wall'})),...level.objects.filter(o=>!['stairs','floorMarker','fixture'].includes(o.kind)),...level.doors].sort((a,b)=>a.depth-b.depth);
 }
 function item(o){
  if(o.kind==='model')modelDraw(o);
  else if(o.kind==='roof')roofDraw(o);
  else if(o.kind==='wall')wallDraw(o);
  else if(o.kind==='door')doorDraw(o);
  else if(o.kind==='actor')actor();
  else if(o.kind==='eyebot')FoyerFlight.paint(ctx,images.eyebotAtlas,{origin:project(0,0),zoom:state.zoom,flight:level.flight},time,o);
  else if(o.kind==='publication')publicationDraw(o);
  else if(o.action==='container'&&CONTAINER_SPRITES.includes(o.sprite))containerDraw(o);
  else{
   if(o.planter)planterDraw(o);
   drawSprite(o.sprite,o.x,o.y,o.scale,.5,o.flip,o.planter?.3:o.z||0,o.foot||1,o.pivot);
   if(o.book)publicationDraw(o);
   if(o.number)lockerNumber(o);
  }
 }
 function floorAndStairs(){
  ctx.fillStyle='#131a16';ctx.fillRect(0,0,W,H);cachedFloor();
  for(const o of level.objects.filter(o=>o.kind==='stairs'))previewStairs(o);
 }
 function tracePath(){
  if(!state.path.length)return;
  ctx.strokeStyle='#c2bc8180';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();
  ctx.moveTo(...project(player.x,player.y,.02));for(const p of state.path)ctx.lineTo(...project(p.x,p.y,.02));
  ctx.stroke();ctx.setLineDash([]);
 }
 function inspect(surface,id){
  const o=level.objects.find(o=>o.id===id);
  if(!o)return;
  const before={W,H,dpr,ctx,zoom:state.zoom};
  W=surface.width;H=surface.height;dpr=1;
  ctx=surface.getContext('2d',{alpha:false});ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;
  detailView={x:o.x-(id==='hatch'?.26:0),y:o.y,z:id==='valves'?1.17:1.13};
  state.zoom=id==='valves'?2.05:id==='power'?1.72:1.97;
  try{
   ctx.fillStyle='#18231d';ctx.fillRect(0,0,W,H);
   const from=o.x-2.2;
   for(let i=0;i<5;i++){
    const w=Yface(from+i*.91,o.y0-.046,.91,-.66,2.76);
    textureQuad(steel('inspection-wall',[64,79,72]),w);
    polygon(w,null,'#202d26');
   }
   polygon(Yface(from,o.y0-.04,4.55,-.66,2.76),'#17271f35');
   item(o);
  }finally{
   detailView=null;({W,H,dpr,ctx}=before);state.zoom=before.zoom;
  }
 }
 function drawCache(){
  const key=level.id+(state.fullWalls?'#full':'#cut')+(level.floor==='staff'&&state.serviceAuthorized?'#service':'');
  if(caches.has(key))return caches.get(key);
  const before={W,H,dpr,ctx,cam:state.cam,zoom:state.zoom};
  const points=level.shapes.flat(),xs=points.map(([x,y])=>(x-y)*38),ys=points.map(([x,y])=>(x+y)*19);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const surface=document.createElement('canvas');
  W=surface.width=Math.ceil(maxX-minX)+62;H=surface.height=Math.ceil(maxY-minY)+160;
  const [ox,oy]=[31-minX,131-minY],u=(W*.5-ox)/38,v=(H*.53-oy)/19;
  state.cam={x:(u+v)/2,y:(v-u)/2};state.zoom=1;dpr=1;
  ctx=surface.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
  floorAndStairs();for(const o of staticParts)item(o);
  const entry={surface,ox,oy};caches.set(key,entry);
  ({W,H,dpr,ctx}=before);state.cam=before.cam;state.zoom=before.zoom;
  return entry;
 }
 function overlaps(o,box){
  const z=state.zoom;
  let a,b,minX,maxX,minY,maxY;
  if(o.kind==='door'||o.kind==='wall'){
   a=project(o.x,o.y,0);b=project(o.x+o.ux*o.span,o.y+o.uy*o.span,0);
   minX=Math.min(a[0],b[0])-8*z;maxX=Math.max(a[0],b[0])+8*z;
   minY=Math.min(a[1],b[1])-cutWallHeight(o)*42*z-5*z;maxY=Math.max(a[1],b[1])+6*z;
  }else if(o.kind==='roof'){
   const ps=o.poly.map(p=>project(...p,2.65)),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);
   minX=Math.min(...xs)-4*z;maxX=Math.max(...xs)+4*z;minY=Math.min(...ys)-4*z;maxY=Math.max(...ys)+4*z;
  }else{
   a=project(o.x,o.y,0);const w=o.hull?2.25:Math.max(.8,(o.w||.75)+(o.h||.75));
   minX=a[0]-w*40*z;maxX=a[0]+w*40*z;minY=a[1]-112*z;maxY=a[1]+w*21*z;
  }
  return minX<box[2]&&maxX>box[0]&&minY<box[3]&&maxY>box[1];
 }
 function inFront(o,a){
  // The far corner of a wide footprint can be deeper than a player who stands
  // entirely in front of it. Sort that case by which side of the hull they are on.
  if(a.kind==='actor'&&o.kind==='model'&&!o.transform){
   const front=a.x>=o.x0+o.w||a.y>=o.y0+o.h,back=a.x<=o.x0||a.y<=o.y0;
   if(front!==back)return back;
  }
  return o.depth>a.depth;
 }
 function drawMover(o){
  item(o);
  const q=state.zoom,[cx,cy]=project(o.x,o.y,0),r=[cx-51*q,cy-129*q,cx+51*q,cy+19*q];
  ctx.save();ctx.beginPath();ctx.rect(r[0],r[1],r[2]-r[0],r[3]-r[1]);ctx.clip();
  for(const s of staticParts)if(inFront(s,o)&&overlaps(s,r))item(s);
  ctx.restore();
 }
 function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
  const moving=[{kind:'actor',x:player.x,y:player.y,depth:player.x+player.y+.02},...(level.flight?FoyerFlight.positions(level.flight,time).map(o=>({...o,kind:'eyebot',depth:o.x+o.y+.03})):[])].sort((a,b)=>a.depth-b.depth);
  const animated=Object.values(state.anim).some(v=>v>.001)||Object.values(level.motion||{}).some(v=>v>.001);
  if(!animated){
   const c=drawCache(),q=state.zoom,[x,y]=project(0,0,0);
   ctx.fillStyle='#131a16';ctx.fillRect(0,0,W,H);
   ctx.drawImage(c.surface,x-c.ox*q,y-c.oy*q,c.surface.width*q,c.surface.height*q);
   tracePath();
  }else{
   floorAndStairs();tracePath();
   for(const o of staticParts)if(overlaps(o,[-6,-6,W+6,H+6]))item(o);
  }
  for(const o of moving)drawMover(o);
  if(level.motion?.breaker>.015){
   ctx.fillStyle='rgba(13,25,24,'+(level.motion.breaker*.34)+')';ctx.fillRect(0,0,W,H);
  }
 }
