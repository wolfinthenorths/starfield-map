'use strict';
const fs=require('node:fs'),path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'../../engine.js'),'utf8');
const palette={standard:'#99ad87',better:'#7fabb5',lux:'#c4a678',baths:'#8baca5',laundry:'#a09b7f',staff:'#b98a66',lift:'#c2ac70'};

function scene(label,shape,spawn){
 const s={id:label,label,w:35,h:33,tiles:new Set(),blocked:new Set(),walls:[],facets:[],doors:[],objects:[],shapes:[shape],chambers:{},zones:[],hall:shape,spawn,strips:[],grates:[],occupied:[]};
 s.rect=(x,y,w,h)=>s.shapes.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
 s.seg=(x,y,ex,ey,opts={})=>{
  const l=Math.hypot(ex-x,ey-y);if(l<.01)return;
  const ux=(ex-x)/l,uy=(ey-y)/l,n=Math.ceil(l/(opts.maxPanelSpan||1)),span=l/n;
  const facet={x,y,ux,uy,span:l,...opts};s.facets.push(facet);
  for(let i=0;i<n;i++)s.walls.push({x:x+ux*span*i,y:y+uy*span*i,ux,uy,span,depth:x+y+(ux+uy)*span*(i+.5),...opts});
 };
 s.portal=(id,x,y,ex,ey,title,opts={})=>{
  const span=Math.hypot(ex-x,ey-y),ux=(ex-x)/span,uy=(ey-y)/span;
  s.doors.push({id,x,y,ux,uy,span,title,depth:(x+y+ex+ey)*.5,axis:ux===0?'y':'x',door:true,kind:'door',action:'preview',...opts});
 };
 s.lineWithDoors=(a,b,doors,opts={})=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),u=dx/l,v=dy/l;
  let next=0;
  for(const d of doors){s.seg(a[0]+u*next,a[1]+v*next,a[0]+u*d.from,a[1]+v*d.from,opts);s.portal(d.id,a[0]+u*d.from,a[1]+v*d.from,a[0]+u*d.to,a[1]+v*d.to,d.title,{...opts,...d});next=d.to;}
  s.seg(a[0]+u*next,a[1]+v*next,b[0],b[1],opts);
 };
 s.prop=(id,sprite,x,y,scale=1,extra={})=>{
  const p={id,sprite,x,y,scale,kind:'prop',depth:x+y,...extra};s.objects.push(p);return p;
 };
 s.model=(id,type,x,y,w,h,opts={})=>{
  const p={id,type,kind:'model',x0:x,y0:y,x:x+w/2,y:y+h/2,w,h,depth:x+y+w+h-.018,...opts};
  s.objects.push(p);s.occupied.push([x,y,w,h,id]);return p;
 };
 s.arcSeat=(id,x,y,angle,w,h,opts={})=>{
  const ux=Math.sin(angle),uy=-Math.cos(angle),nx=-Math.cos(angle),ny=-Math.sin(angle);
  const p=(u,v)=>[x+ux*(u-w/2)+nx*v,y+uy*(u-w/2)+ny*v];
  const hull=[p(0,0),p(w,0),p(w,h),p(0,h)],xs=hull.map(v=>v[0]),ys=hull.map(v=>v[1]);
  const x0=Math.min(...xs),y0=Math.min(...ys),[cx,cy]=p(w/2,h/2),depth=Math.max(...hull.map(v=>v[0]+v[1]));
  s.objects.push({id,type:'arcSeat',kind:'model',x:cx,y:cy,x0,y0,w,h,depth,transform:{x,y,ux,uy,nx,ny},hull,...opts});
  s.occupied.push([x0,y0,Math.max(...xs)-x0,Math.max(...ys)-y0,id,hull]);
 };
 s.fixture=(id,sprite,x,y,z,width,height,extra={})=>{
  let match=null;
  for(const f of s.facets){
   if(f.low||f.span<width)continue;
   const t=Math.max(width/2,Math.min(f.span-width/2,(x-f.x)*f.ux+(y-f.y)*f.uy));
   const px=f.x+t*f.ux,py=f.y+t*f.uy,dist=Math.hypot(px-x,py-y);
   if(!match||dist<match.dist)match={f,px,py,t,dist};
  }
  if(!match)return;
  const {f,px,py,t}=match;
  const o=s.prop(id,sprite,px,py,1,{mount:true,kind:'fixture',z,width,height,ux:f.ux,uy:f.uy,...extra});
  for(const w of s.walls){
   const d=(w.x-f.x)*f.ux+(w.y-f.y)*f.uy;
   if(!w.low&&Math.abs(w.ux-f.ux)<.001&&Math.abs(w.uy-f.uy)<.001&&Math.abs((w.x-f.x)*f.uy-(w.y-f.y)*f.ux)<.001&&d<t+width/2&&d+w.span>t-width/2)(w.fittings??=[]).push(o);
  }
 };
 s.lamp=(x,y)=>s.fixture('lamp'+x+':'+y,'stripLight',x,y,2.28,.88,.19);
 s.vent=(x,y)=>s.fixture('vent'+x+':'+y,'vaultVent',x,y,.57,.71,.38);
 return s;
}

const {foyer,foyerDecor,standard,improved,luxury,showers,restroom,laundry,service}=require('./scenes.cjs')({scene,palette});
const materials=require('./materials.cjs');
const models=require('./models.cjs');
const additions=String.raw`
 const previewTagCache=new Map();
 function previewTag(o){
  const k=o.title+o.tone;let tag=previewTagCache.get(k);
  if(!tag){
   tag=document.createElement('canvas');tag.width=380;tag.height=62;
   const g=tag.getContext('2d');g.imageSmoothingEnabled=false;
   g.drawImage(surfaceTextures.wall,0,0,380,62);
   g.fillStyle='#27332d';g.fillRect(5,4,370,54);
   g.fillStyle='#111d18';g.fillRect(9,8,362,46);
   g.fillStyle=o.tone||'#b9ab7f';g.fillRect(14,11,9,40);g.fillRect(358,11,7,40);
   g.textAlign='center';g.textBaseline='middle';g.fillStyle='#e9dfb7';
   g.font='bold '+(o.title.length>=11?38:43)+'px "DejaVu Sans Mono"';g.fillText(o.title,191,32,323);
   previewTagCache.set(k,tag);
  }
  const direction=o.ux-o.uy<0?-1:1;
  const f=direction<0?{...o,x:o.x+o.ux*o.span,y:o.y+o.uy*o.span,ux:-o.ux,uy:-o.uy}:o;
  textureQuad(tag,wallFace(f,.045,o.span-.045,2.14,WALL_HEIGHT-.02,.025));
 }
 function roofDraw(o){
  const z=WALL_HEIGHT+.012;
  const outline=o.poly.map(p=>[...p,z]);
  ctx.save();ctx.beginPath();outline.forEach((p,i)=>i?ctx.lineTo(...project(...p)):ctx.moveTo(...project(...p)));ctx.closePath();ctx.clip();
  for(let u=0;u<o.w;u++)for(let v=0;v<o.h;v++){
   const x=o.x+u,y=o.y+v,xx=Math.min(x+1,o.x+o.w),yy=Math.min(y+1,o.y+o.h);
   textureQuad(grade('roof',surfaceTextures.detail,[91,105,100]),[[x,y,z],[xx,y,z],[xx,yy,z],[x,yy,z]]);
   polygon([[x,y,z],[xx,y,z],[xx,yy,z],[x,yy,z]],'#30392f32','#87918564');
  }
  for(const [x,y,w,h] of o.noVent?[]:[[o.x+.76,o.y+.49,1.5,1.18],[o.x+2.44,o.y+.49,1.13,1.18]]){
   textureQuad(surfaceTextures.grate,[[x,y,z+.01],[x+w,y,z+.01],[x+w,y+h,z+.01],[x,y+h,z+.01]]);
   polygon([[x,y,z+.015],[x+w,y,z+.015],[x+w,y+h,z+.015],[x,y+h,z+.015]],null,'#788776');
  }
  ctx.restore();polygon(outline,null,'#8d9d91');
 }
 function previewStairs(o){
  const {sx:x,sy:y,sw:w,sh:h,count:n}=o;
  for(let i=0;i<n;i++){
   const a=x+i*w/n,b=x+(i+1)*w/n,z=(n-i-1)*.143;
   textureQuad(surfaceTextures.grate,[[a,y,z],[b,y,z],[b,y+h,z],[a,y+h,z]]);
   textureQuad(surfaceTextures.wall,[[b,y,z],[b,y+h,z],[b,y+h,z-.143],[b,y,z-.143]]);
   polygon([[b-.03,y,z+.01],[b,y,z+.01],[b,y+h,z+.01],[b-.03,y+h,z+.01]],'#a1a18a90');
  }
  for(const yy of [y+.07,y+h-.07]){
   const up=(n-1)*.143;
   for(const i of [0,3,6,9]){const a=x+i*w/n,z=Math.max(0,up-i*.143);polygon([[a-.025,yy,z],[a+.04,yy,z],[a+.04,yy,z+.71],[a-.025,yy,z+.71]],'#768575');}
   polygon([[x,yy,up+.72],[x+w,yy,.72],[x+w,yy,.675],[x,yy,up+.675]],'#a1aa91');
  }
 }
`;

function patchEngine(){
 let e=original.replace('const WALL_HEIGHT=2.45','const WALL_HEIGHT=2.63');
 e=e.replace('function doorWorld',materials+models+additions+'\n function doorWorld');
 // Interior faces meet flush; the wall thickness recedes away from the view.
 e=e.replace(/ function wallPanel\([^\n]+\n/,` function wallPanel(o,a,b,z0,z1,texture='wall'){
  if(o.foyerShell){foyerPanel(o,a,b,z0,z1,texture);return;}
  if(o.joined){joinedRoomPanel(o,a,b,z0,z1,texture);return;}
  const n=(o.ux-o.uy>0?-1:1)*WALL_THICKNESS;
  const m=panelMaterials(o,a,b,z0,z1,texture);
  polygon([wallPoint(o,a,z1,n),wallPoint(o,b,z1,n),wallPoint(o,b,z1),wallPoint(o,a,z1)],m.edge);
  if(z0===0){
   polygon(wallFace(o,a,b,.028,.077,.005),'#45524a80');
   if(b-a>.16&&!level.cleanWallJoints)polygon(wallFace(o,b-.010,b,z0+.08,z1,.006),'#55615848');
  }
 }\n`);
 e=e.replace('function wallDraw(o){','function wallDraw(o){if(o.foyerShell||o.joined||level.cleanWallJoints||o.low||o.cutHeight){const h=cutWallHeight(o);wallPanel(o,0,o.span,0,h);for(const f of o.fittings||[])if(f.z+f.height/2<=h+.005)fixtureDraw(f,o);return;}');
 e=e.replace('textureQuad(im,wallFace(wall,0,o.width,o.z-height/2,o.z+height/2,.014));ctx.restore();',`if(o.sprite==='suiteTV'){
   const p=project(o.x+.065,o.y,o.z),w=41*state.zoom,h=w*images.suiteTV.height/images.suiteTV.width;
   ctx.drawImage(images.suiteTV,Math.round(p[0]-w/2),Math.round(p[1]-h/2),Math.round(w),Math.round(h));
  }else textureQuad(im,wallFace(wall,0,o.width,o.z-height/2,o.z+height/2,.014));
  if(o.id==='staffBadge')polygon(wallFace(wall,.047,.103,o.z+.06,o.z+.104,.019),(level.motion?.badge||0)>.55?'#c6e49b':'#d08c71');ctx.restore();`);
 e=e.replace("o.low,detail].join('/')","o.low,detail,o.finish||level.finish].join('/')");
 e=e.replace("faceTexture(darkImages.wallA,[2,12],[36,29],[2,96],40,100)","faceTexture(darkImages.wallA,[6,27],[32,40],[6,89],40,100)");
 e=e.replace("faceTexture(darkImages.wallDetailA,[2,12],[37,29],[2,96],40,100)","faceTexture(darkImages.wallA,[7,29],[33,42],[7,88],40,100)");
 e=e.replace("surfaceTextures.door=faceTexture(darkImages.door,[48,64],[105,50],[48,126],64,96);",`surfaceTextures.door=faceTexture(darkImages.door,[48,64],[105,50],[48,126],64,96);
  surfaceTextures.wood=faceTexture(images.woodSource,[211,89],[326,46],[219,94],120,24);
  for(const n of ['pzNotice','pzLandscape','pzSquareClock','foyerVaultPoster','foyerBlastPoster','foyerNukaPoster','foyerBuglePoster','roomSugarPoster'])if(images[n])surfaceTextures[n]=images[n];
  if(images.lift154){
   surfaceTextures.lift=faceTexture(darkImages.lift154,[16,22],[48,14],[16,76],64,96);
   const g=surfaceTextures.lift.getContext('2d');g.fillStyle='#26302a3d';g.fillRect(0,0,64,96);g.fillStyle='#242e2b';g.fillRect(31,0,2,96);g.fillStyle='#7c8271';g.fillRect(33,0,1,96);
  }`);
 e=e.replaceAll('textureQuad(surfaceTextures.door,wallFace(o,edge','textureQuad(o.lift?surfaceTextures.lift:level.floor===\'foyer\'?surfaceTextures.door:grade(\'homeDoor\',surfaceTextures.door,[93,91,78],.84),wallFace(o,edge');
 e=e.replaceAll('textureQuad(surfaceTextures.door,wallFace(o,span','textureQuad(o.lift?surfaceTextures.lift:surfaceTextures.door,wallFace(o,span');
 e=e.replace("if(o.action)polygon(wallFace(o,edge,span-edge,.02,h,-.05),'#111815');",`if(o.action)polygon(wallFace(o,edge,span-edge,.02,h,-.05),'#111815');
  if(o.lift&&p>0){
   const outline=wallFace(o,edge,span-edge,.025,h,-.018).map(v=>project(...v));
   ctx.save();ctx.beginPath();outline.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.clip();
   const back=-.83;
   textureQuad(grade('liftCabin',surfaceTextures.detail,[88,105,99],.66),wallFace(o,edge,span-edge,.038,h-.02,back));
   textureQuad(surfaceTextures.grate,[wallPoint(o,edge,.037,back),wallPoint(o,span-edge,.037,back),wallPoint(o,span-edge,.037,.005),wallPoint(o,edge,.037,.005)]);
   polygon(wallFace(o,edge+.20,span-edge-.20,1.03,1.09,back+.014),'#b7b48c');
   polygon(wallFace(o,span*.31,span*.69,1.81,1.88,back+.018),'#d1d7af');
   ctx.restore();
  }`);
 e=e.replace('if(o.chamber)chamberDisplay(o);',`if(o.chamber)chamberDisplay(o);if(o.title)previewTag(o);
  if(o.restricted){
   polygon(wallFace(o,.19,.35,.80,1.11,.030),'#252e29','#a3a182');
   polygon(wallFace(o,.22,.32,.98,1.053,.037),p>.85?'#bacc8a':'#ba6c55');
  }`);
 e=e.replace('function doorDraw(o){const span',`function doorDraw(o){if(o.windowCut){
  const w=o.span,n=o.ux-o.uy>0?1:-1;
  polygon(wallFace(o,.13,w-.13,.90,2.14,-n*.065),'#29352d');
  wallPanel(o,0,w,0,.91);wallPanel(o,0,w,2.16,WALL_HEIGHT);
  wallPanel(o,0,.12,.91,2.16);wallPanel(o,w-.12,w,.91,2.16);
  polygon(wallFace(o,.12,w-.12,.91,2.16,n*.016),null,'#b0ad91');
  const ledge=[wallPoint(o,.12,.93,-n*.07),wallPoint(o,w-.12,.93,-n*.07),wallPoint(o,w-.12,.93,n*.43),wallPoint(o,.12,.93,n*.43)];
  textureQuad(surfaceTextures.detail,ledge);polygon(ledge,null,'#b1aa89');
  const bundle=[wallPoint(o,.48,1.0,n*.07),wallPoint(o,.94,1.0,n*.07),wallPoint(o,.94,1.0,n*.35),wallPoint(o,.48,1.0,n*.35)];
  textureQuad(textile('pillow'),bundle);
  polygon([bundle[2],bundle[3],wallPoint(o,.48,.933,n*.35),wallPoint(o,.94,.933,n*.35)],'#a9a186');
  return;
 }if(o.accessCut){
  wallPanel(o,0,.16,0,1.10);wallPanel(o,o.span-.16,o.span,0,1.10);
  polygon([wallPoint(o,.16,.015,-.11),wallPoint(o,o.span-.16,.015,-.11),wallPoint(o,o.span-.16,.015,.115),wallPoint(o,.16,.015,.115)],'#9b9c80','#69766b');
  if(o.id==='staffAccess'&&!state.serviceAuthorized){
   textureQuad(grade('staffInnerGate',surfaceTextures.door,[76,96,90],.79),wallFace(o,.15,o.span-.15,.055,1.05,.017));
   polygon(wallFace(o,.15,o.span-.15,1.02,1.08,.02),'#899488');
  }
  return;
 }const span`);
 const start=e.indexOf('function floorAccents(){'),end=e.indexOf('for(const lamp',start);
 e=e.slice(0,start)+`function floorAccents(){
  decorFloor();
  for(const [x,y,w,h,color] of level.strips)paintStrip(x,y,w,h,color);
  for(const [x,y,w,h] of level.grates)textureQuad(surfaceTextures.grate,[[x,y,.022],[x+w,y,.022],[x+w,y+h,.022],[x,y+h,.022]]);
  `+e.slice(end);
 e=e.replace("const v=tileVertices(x,y);polygon(v,'#59665e');textureQuad(surfaceTextures.floor,v);polygon(v,null,'#34463d8a');","floorTile(x,y,level.floor||'foyer');");
 e=e.replace('ctx.closePath();}ctx.clip();\n  for(let y=0;y<level.h;y++)',"ctx.closePath();}ctx.clip();ctx.fillStyle=floorBase(level.floor||'foyer');ctx.fillRect(0,0,W,H);\n  for(let y=0;y<level.h;y++)");
 e=e.replace("if(!o.sprite||o.mount||o.kind==='publication')continue;","if(!o.sprite||o.mount||o.attached||o.type==='anchoredSprite'||o.kind==='publication')continue;");
 e=e.replace("for(const o of level.objects.filter(o=>o.kind==='stairs'))stairsDraw(o);","for(const o of level.objects.filter(o=>o.kind==='stairs'))previewStairs(o);");
 e=e.replace("if(o.kind==='wall')wallDraw(o);","if(o.kind==='model')modelDraw(o);else if(o.kind==='roof')roofDraw(o);else if(o.kind==='wall')wallDraw(o);");
 e=e.replace("  for(const o of interactables()){const p=o.hotspot?project(...o.hotspot):o.door?project(...doorWorld(o,.5,1.5))", "  for(const o of []){const p=o.hotspot?project(...o.hotspot):o.door?project(...doorWorld(o,.5,1.5))");
 e=e.replace("new ResizeObserver(resize)",`window.preview=(w,h,z,marks=true,motion={})=>{
   W=w;H=h;dpr=1;canvas.width=w;canvas.height=h;
   const a=level.shapes.flat(),x=a.map(v=>v[0]-v[1]),y=a.map(v=>v[0]+v[1]);
   const ds=(Math.min(...x)+Math.max(...x))/2,sm=(Math.min(...y)+Math.max(...y))/2-2.91+h*.03/(19*z);
   state.cam={x:(sm+ds)/2,y:(sm-ds)/2};state.zoom=z;
   [player.x,player.y,player.facing]=level.spawn;
   level.motion=motion;
   state.container=motion.crate>0?{id:'storageCrate',phase:'opening',t:motion.crate*CONTAINER_DURATION}:null;
   for(const o of level.doors){const t=o.id==='serviceLift'?(motion.lift||0):o.id==='exit'?(motion.exit||0):o.ajar?1:0;state.open[o.id]=t>0;state.anim[o.id]=t;}
   render();
   if(level.flight)window.patrolView={origin:project(0,0,0),zoom:z,flight:level.flight,focus:Object.fromEntries(level.focus.map(([id,x,y,h])=>[id,project(x,y,h)]))};
   window.projectedHits=Object.fromEntries((level.hotspots||[]).map(([name,x,y,h])=>[name,project(x,y,h)]));
   for(const [i,x,y] of marks?level.callouts||[]:[]){
    const [px,py]=project(x,y,.025);
    ctx.save();ctx.beginPath();ctx.arc(px,py,14.5,0,Math.PI*2);ctx.fillStyle='#202d27';ctx.fill();
    ctx.strokeStyle='#e0c68d';ctx.lineWidth=1.65;ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 17px "DejaVu Sans Mono"';ctx.fillStyle='#f1dfac';ctx.fillText(i,px,py+.35);ctx.restore();
   }
  };new ResizeObserver(resize)`);
 return e;
}

module.exports={patchEngine,scene,makeScenes:()=>({foyer:foyerDecor('patrol'),standard:standard(),improved:improved(),lux:luxury(),bath:showers(),wc:restroom(),laundry:laundry(),staff:service()})};
