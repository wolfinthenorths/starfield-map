'use strict';
module.exports=String.raw`
 const finishes={
  foyer:{above:[122,123,110],below:[73,89,83],trim:'#b3a47c',edge:'#879389'},
  foyerFront:{above:[110,115,105],below:[67,83,77],trim:'#9d9878',edge:'#8e9b90'},
  lift:{above:[97,111,112],below:[59,72,72],trim:'#ac9f6d',edge:'#849391'},
  standard:{above:[137,149,146],below:[63,87,100],trim:'#a8b7b1',edge:'#9aa9a4'},
  improved:{above:[179,159,119],below:[104,103,77],trim:'#c8b48a',edge:'#b2a17d'},
  lux:{above:[188,176,151],below:[84,63,51],trim:'#bb9860',edge:'#b8a58b'},
  wet:{above:[146,164,163],below:[70,110,126],trim:'#adbcaf',edge:'#9daea7',ceramic:true},
  privateWet:{above:[181,185,172],below:[115,126,111],trim:'#c4c5a9',edge:'#abb4a1',ceramic:true},
  suiteWet:{above:[192,177,149],below:[133,116,90],trim:'#ccba91',edge:'#baa889',ceramic:true},
  restroom:{above:[159,173,152],below:[82,119,104],trim:'#bfcbad',edge:'#a6b6a1',ceramic:true},
  laundry:{above:[149,158,136],below:[79,106,88],trim:'#b6b28b',edge:'#9eaea0'},
  staff:{above:[115,127,122],below:[69,96,95],trim:'#a49d74',edge:'#899b94'}
 };
 const graded=new Map();
 function grade(key,img,tone,contrast=.81){
  if(graded.has(key))return graded.get(key);
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height),v=d.data;
  let mean=0;for(let i=0;i<v.length;i+=4)mean+=v[i]*.299+v[i+1]*.587+v[i+2]*.114;
  mean/=v.length/4;
  for(let i=0;i<v.length;i+=4){const l=v[i]*.299+v[i+1]*.587+v[i+2]*.114;for(let j=0;j<3;j++)v[i+j]=tone[j]+(l-mean)*contrast+(v[i+j]-l)*.17;}
  g.putImageData(d,0,0);graded.set(key,c);return c;
 }
 function panelMaterials(o,a,b,z0,z1,texture){
  const style=o.finish||level.finish||'foyer',mat=finishes[style],im=surfaceTextures[texture];
  polygon(wallFace(o,a,b,z0,z1),'rgb('+mat.above.join(',')+')');
  const wall=grade(style+'upper'+texture,im,mat.above,style==='foyer'||style==='lift'?.94:.79);
  textureQuad(wall,wallFace(o,a,b,z0,z1));
  const height=style==='lux'?1.17:mat.ceramic?1.35:style==='standard'?.71:.88;
  const foot=Math.min(height,z1);
  if(foot>z0){
   const base=grade(style+'lower'+texture,style==='lux'&&surfaceTextures.wood?surfaceTextures.wood:im,mat.below,style==='lux'?.57:.72);
   textureQuad(base,wallFace(o,a,b,z0,foot,.004));
   if(mat.ceramic){
    for(let i=.32;i<foot;i+=.32)if(i>z0+.018)polygon(wallFace(o,a,b,i-.012,i,.009),'#30433a64');
    const seam=o.span*.5;
    if(seam>a+.022&&seam<b-.022)polygon(wallFace(o,seam-.008,seam+.007,z0,foot,.009),'#41534763');
   }
   if(style==='lux'&&b-a>.18){const z=Math.max(z0+.025,.11),hi=foot-.10;if(hi>z){
    polygon(wallFace(o,a+.055,b-.055,z,hi,.009),null,'#4d382d');
    polygon(wallFace(o,a+.081,b-.081,z+.026,hi-.03,.010),null,'#a17b4b75');
   }}
   if(style==='standard'&&b-a>.16&&foot>.36){
    polygon(wallFace(o,a+.08,a+.101,.34,.36,.007),'#b6c3bd93');
    polygon(wallFace(o,b-.10,b-.079,.34,.36,.007),'#b6c3bd93');
   }
   if(z1>=height)polygon(wallFace(o,a,b,height-.06,height,.01),mat.trim);
  }
  return mat;
 }
 function cutWallHeight(o){
  return state.fullWalls?WALL_HEIGHT:o.cutHeight||(o.low?.38:o.frontCut?.50:WALL_HEIGHT);
 }
 function joinedRoomPanel(o,a,b,z0,z1,texture){
  const start=a<=.001,end=b>=o.span-.001;
  const l=start&&o.adjacent[0]&&!o.adjacent[0].door?.011:0,r=end&&o.adjacent[1]&&!o.adjacent[1].door?.011:0;
  const m=panelMaterials(o,a-l,b+r,z0,z1,texture);
  const outer=(u,z)=>[o.outer[0][0]+(o.outer[1][0]-o.outer[0][0])*u/o.span,o.outer[0][1]+(o.outer[1][1]-o.outer[0][1])*u/o.span,z];
  polygon([wallPoint(o,a,z1),wallPoint(o,b,z1),outer(b,z1),outer(a,z1)],m.edge);
  if(z0===0){
   polygon(wallFace(o,a-l,b+r,.026,.078,.005),'#46534b64');
   for(const [i,u] of [[0,a],[1,b]]){
    if(i===0&&!start||i===1&&!end)continue;
    const next=o.adjacent[i],lo=next?cutWallHeight(next):0;
    if(z1-lo>.027)polygon([wallPoint(o,u,lo),wallPoint(o,u,z1),outer(u,z1),outer(u,lo)],m.edge);
   }
  }
 }
 function foyerPanel(o,a,b,z0,z1,texture){
  const atStart=a<=.001,atEnd=b>=o.span-.001;
  const l=atStart&&o.adjacent[0]&&!o.adjacent[0].door?.019:0;
  const r=atEnd&&o.adjacent[1]&&!o.adjacent[1].door?.019:0;
  const face=wallFace(o,a-l,b+r,z0,z1);
  const solid=o.finish==='foyerFront'?'#6d7669':'#797a6d';
  polygon(face,solid);
  const m=panelMaterials(o,a-l,b+r,z0,z1,texture);
  const outer=(u,z)=>[o.outer[0][0]+(o.outer[1][0]-o.outer[0][0])*u/o.span,o.outer[0][1]+(o.outer[1][1]-o.outer[0][1])*u/o.span,z];
  polygon([wallPoint(o,a,z1),wallPoint(o,b,z1),outer(b,z1),outer(a,z1)],m.edge);
  if(z0===0&&!o.door){
   polygon(wallFace(o,a-l,b+r,.021,.070,.005),'#46534b7c');
   if(o.adjacent[0]&&!o.adjacent[0].door&&b-a>.18){
    const seam=Math.min(a+.031,b);
    polygon(wallFace(o,a+.011,seam,.080,z1-.032,.005),'#50605655');
   }
   for(const [i,u] of [[0,a],[1,b]]){
    if(i===0&&!atStart||i===1&&!atEnd)continue;
    const low=o.adjacent[i]?.height||0;
    if(z1-low>.025)polygon([wallPoint(o,u,low),wallPoint(o,u,z1),outer(u,z1),outer(u,low)],'#667367');
   }
  }
 }
 function makeWood(key,tone){
  const c=document.createElement('canvas');c.width=72;c.height=72;
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const t=grade(key+'grain',surfaceTextures.wood,tone,key==='walnut'?.54:.79);
  for(let i=0;i<4;i++){
   if(i%2){g.save();g.translate(72,i*18);g.scale(-1,1);g.drawImage(t,0,0,72,18);g.restore();}
   else g.drawImage(t,0,i*18,72,18);
   g.fillStyle=i%2?'#cbaa7027':'#33261f12';g.fillRect(0,i*18,72,17);
   g.fillStyle=key==='walnut'?'#372b2280':'#36271e9d';g.fillRect(0,(i+1)*18-1,72,1);
  }
  return c;
 }
 const flooring=new Map();
 const floorTones={foyer:[115,114,101],foyerDark:[103,107,96],standard:[111,132,136],standardCool:[118,141,142],wet:[100,125,133],wetAlt:[125,145,146],privateWet:[154,161,144],privateWetAlt:[136,148,133],suiteWet:[164,141,111],suiteWetAlt:[184,161,125],restroom:[116,147,130],restroomAlt:[138,164,146],changing:[137,138,123],laundry:[129,141,115],staff:[89,111,104],staffBay:[106,114,102],improved:[151,114,68],lux:[99,72,54]};
 const floorBase=key=>'rgb('+(floorTones[key]||floorTones.foyer).map(x=>Math.round(x*.79)).join(',')+')';
 function floorMaterial(key){
  if(flooring.has(key))return flooring.get(key);
  let im;
  if(key==='wood')im=makeWood('oak',[151,114,68]);
  else if(key==='parquet')im=makeWood('walnut',[99,72,54]);
  else{
   im=grade('floor'+key,surfaceTextures.floor,floorTones[key]||floorTones.foyer,key.startsWith('foyer')?.80:.68);
  }
  flooring.set(key,im);return im;
 }
 function floorTile(x,y,style){
  const v=tileVertices(x,y);
  if(style==='improved'||style==='lux'){
   const lux=style==='lux';
   const flip=lux&&((x+y)&1);
   textureQuad(floorMaterial(lux?'parquet':'wood'),flip?[v[1],v[2],v[3],v[0]]:v);
   if(lux){polygon(v,null,'#30251cae');polygon([[x+.03,y+.03,.004],[x+.97,y+.03,.004],[x+.97,y+.97,.004],[x+.03,y+.97,.004]],null,'#bd986d50');}
   else for(let i=0;i<4;i++)if((x+(i%2)+y)%3===0)polygon([[x,y+i*.25,.005],[x+.014,y+i*.25,.005],[x+.014,y+(i+1)*.25,.005],[x,y+(i+1)*.25,.005]],'#443627c0');
  } else {
   let variant=style;
   if(style==='foyer'&&(x*7+y*13)%8===0)variant='foyerDark';
   if(style==='standard'&&(x*3+y*7)%5===0)variant='standardCool';
   if(['wet','privateWet','suiteWet','restroom'].includes(style)&&(x+y)%3===0)variant=style+'Alt';
   textureQuad(floorMaterial(variant),v);
   const stone=['privateWet','suiteWet','restroom'].includes(style);
   if(stone)for(const [xx,yy,wx,wy]of [[x+.492,y,.016,1],[x,y+.492,1,.016]])polygon(plane(xx,yy,wx,wy,.003),'#536b605e');
   polygon(v,null,stone?'#526255a9':style==='wet'?'#58717d9c':style==='standard'?'#455a6398':'#48564ca8');
  }
 }
 function decorFloor(){
  function insetFloor(x,y,w,h,style,edge){
   const points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
   ctx.save();ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...project(...p)):ctx.moveTo(...project(...p)));ctx.closePath();ctx.clip();
   ctx.fillStyle=floorBase(style);ctx.fillRect(0,0,W,H);
   for(let yy=Math.floor(y);yy<y+h;yy++)for(let xx=Math.floor(x);xx<x+w;xx++)floorTile(xx,yy,style);
   ctx.restore();
   if(edge)polygon(points.map(v=>[...v,.006]),null,edge);
  }
  if(level.wet)insetFloor(...level.wet,level.wetFloor||'wet');
  for(const {x,y,w,h,style}of level.zoneFloors||[])insetFloor(x,y,w,h,style,'#b3a17a9e');
  for(const rug of level.rugs||[])drawSprite(rug.sprite,rug.x,rug.y,rug.scale,.5,false,.023,rug.foot);
  if(level.circle){
   const {x,y,r}=level.circle;
   const ring=(s)=>Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return[x+s*Math.cos(a),y+s*Math.sin(a),.022];});
   ctx.save();ctx.beginPath();for(const rr of [6.6,4.43]){ring(rr).forEach((v,i)=>i?ctx.lineTo(...project(...v)):ctx.moveTo(...project(...v)));ctx.closePath();}
   ctx.fillStyle='#334b4238';ctx.fill('evenodd');ctx.restore();
   polygon(ring(6.60),null,'#8b8d745e');
   polygon(ring(4.42),'#9a8e6824','#93896caa');polygon(ring(4.18),'#2b454045','#93896cae');
   polygon(ring(r-.63),null,'#93917593');
  }
  for(const {p,q,t,width,color}of level.thresholds||[]){
   const from=(v,j)=>[v[0]+t[0]*width*j,v[1]+t[1]*width*j,.024];
   const far=[p[0]*.72+q[0]*.28,p[1]*.72+q[1]*.28];
   polygon([from(p,-.5),from(p,.5),from(far,.5),from(far,-.5)],color+'b3');
   const lane=[p[0]*.26+q[0]*.74,p[1]*.26+q[1]*.74];
   for(const i of [-.3,0,.3])polygon([from(q,i-.045),from(q,i+.045),from(lane,i+.045),from(lane,i-.045)],color+'7a');
  }
  for(const rug of level.fabricRugs||[])fabricRug(rug);
  for(const p of level.pools||[])poolLight(p);
  for(const o of level.objects)if(o.kind==='model'&&!o.flush)polygon(o.hull?o.hull.map(p=>[...p,.04]):plane(o.x0-.025,o.y0-.025,o.w+.085,o.h+.085,.04),'#17221c30');
 }
`;
