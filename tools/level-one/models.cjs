'use strict';
// All surfaces use samples from the supplied game art. The furniture footprints use the level grid.
module.exports=String.raw`
 const propTextures=new Map();
 function sampled(name,asset,points,tone,contrast=.88){
  if(propTextures.has(name))return propTextures.get(name);
  const image=images[asset],src=document.createElement('canvas');src.width=image.width;src.height=image.height;
  const g=src.getContext('2d');g.drawImage(image,0,0);const d=g.getImageData(0,0,src.width,src.height).data;
  const out=document.createElement('canvas');out.width=96;out.height=64;const cg=out.getContext('2d'),p=cg.createImageData(96,64);
  const mix=(a,b,t)=>a+(b-a)*t;
  for(let y=0;y<64;y++)for(let x=0;x<96;x++){
   const u=(x+.5)/96,v=(y+.5)/64,[a,b,c,e]=points;
   const xx=Math.max(0,Math.min(src.width-1,Math.floor(mix(mix(a[0],b[0],u),mix(e[0],c[0],u),v))));
   const yy=Math.max(0,Math.min(src.height-1,Math.floor(mix(mix(a[1],b[1],u),mix(e[1],c[1],u),v))));
   const i=4*(yy*src.width+xx),j=4*(y*96+x);
   for(let k=0;k<3;k++)p.data[j+k]=d[i+3]>0?d[i+k]:(tone?.[k]||100);p.data[j+3]=255;
  }
  cg.putImageData(p,0,0);const result=tone?grade('prop:'+name,out,tone,contrast):out;
  propTextures.set(name,result);return result;
 }
 const Xface=(x,y,h,z,Z)=>[[x,y+h,Z],[x,y,Z],[x,y,z],[x,y+h,z]];
 const Yface=(x,y,w,z,Z)=>[[x,y,Z],[x+w,y,Z],[x+w,y,z],[x,y,z]];
 const plane=(x,y,w,h,z)=>[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]];
 const steel=(key,c)=>grade('metal:'+key,surfaceTextures.detail,c,.73);
 const timber=(key,c)=>grade('timber:'+key,surfaceTextures.wood,c,.81);
 function solid(x,y,w,h,z,Z,top,front=top,side=front){
  textureQuad(side,Xface(x+w,y,h,z,Z));textureQuad(front,Yface(x,y+h,w,z,Z));
  polygon(Yface(x,y+h+.002,w,z,Z),'#25201c27');
  textureQuad(top,plane(x,y,w,h,Z));
  polygon(plane(x,y,w,h,Z+.001),null,'#d9d5ae4a');
 }
 function textile(kind){
  if(kind==='pillow')return sampled('pillow','single',[[16,15],[35,11],[38,16],[19,21]],[199,189,163],.72);
  if(kind==='standard')return sampled('std-linen','single',[[29,28],[65,42],[55,49],[17,34]],[101,131,134],.92);
  if(kind==='improved')return sampled('imp-linen','bed33',[[35,43],[66,34],[96,62],[67,71]],[149,108,78],.82);
  return sampled('lux-linen','luxeBed',[[38,57],[72,47],[98,66],[62,81]],[99,117,94],.95);
 }
 function deskTop(kind){
  return sampled('desk-'+kind,'desk61',[[26,19],[66,7],[87,22],[49,34]],kind==='standard'?[130,127,109]:[144,109,75],.75);
 }
 function fabric(kind,shade=0){
  const tone=(kind==='warm'?[145,100,77]:kind==='olive'?[130,120,79]:[95,118,107]).map(v=>v+shade);
  return sampled('seat-'+kind+':'+shade,'greenSofa',[[9,21],[24,18],[29,26],[14,30]],tone,.74);
 }
 function dressing(o){
  for(const {art,quad} of o.publications||[]){
   const v=quad.map(([x,y,z])=>[x,y,z-.002]);
   polygon(v,'#524936','#49423488');textureQuad(images[art],quad);
  }
  for(const {sprite,u,v,z,pxHeight,flip} of o.decor||[]){
   const t=o.transform;
   const [x,y]=t?[t.x+t.ux*(u-o.w/2)+t.nx*v,t.y+t.uy*(u-o.w/2)+t.ny*v]:[o.x0+u,o.y0+v];
   drawSprite(sprite,x,y,pxHeight/images[sprite].height,.5,flip,z,.97);
  }
 }
 function serviceInset(x,y,w,lo,hi){
  const back=y-.041,side=steel('cabinet-reveal',[64,75,67]);
  polygon(Yface(x,y+.004,w,lo,hi),'#1b2924','#c0c2a187');
  textureQuad(steel('cabinet-back',[51,64,57]),Yface(x+.04,back,w-.08,lo+.038,hi-.038));
  for(const xx of [x,x+w])textureQuad(side,[[xx,back,hi-.038],[xx,y,hi],[xx,y,lo],[xx,back,lo+.038]]);
  polygon([[x,y,lo],[x+w,y,lo],[x+w-.04,back,lo+.038],[x+.04,back,lo+.038]],'#727b6a');
  polygon([[x,y,hi],[x+w,y,hi],[x+w-.04,back,hi-.038],[x+.04,back,hi-.038]],'#333f36');
 }
 function leafMetal(p,w,lo,hi,tone,name,inside){
  const q=(a,b,z,Z)=>[p(a,Z),p(b,Z),p(b,z),p(a,z)];
  textureQuad(steel(name,tone),q(0,w,lo,hi));
  polygon(q(0,w,lo,hi),null,'#9da08d');
  polygon(q(.045,w-.043,lo+.055,hi-.055),null,inside?'#bcc2a95c':'#394940');
  for(const v of [lo+.11,hi-.145]){
   polygon(q(.008,.070,v,v+.048),'#b4b8a0','#48574c');
   polygon(q(w-.055,w-.030,v+.014,v+.039),'#b9bca0');
  }
  const a=(lo+hi)*.5;
  polygon(q(w-.151,w-.08,a-.07,a+.061),'#28372f','#afb49a');
  return q;
 }
 function arcSeatDraw(o){
  const {x,y,ux,uy,nx,ny}=o.transform,w=o.w,d=o.h;
  const p=(u,v,z)=>[x+ux*(u-w/2)+nx*v,y+uy*(u-w/2)+ny*v,z];
  const box=(u,v,a,b,z,Z,top,face,side=face)=>{
   const point=(q,r,s)=>p(u+q,v+r,s);
   const vF=(r)=>[point(0,r,Z),point(a,r,Z),point(a,r,z),point(0,r,z)];
   const uF=(q)=>[point(q,b,Z),point(q,0,Z),point(q,0,z),point(q,b,z)];
   textureQuad(side,uF(ux+uy>0?a:0));textureQuad(face,vF(nx+ny>0?b:0));
   const lid=[point(0,0,Z),point(a,0,Z),point(a,b,Z),point(0,b,Z)];
   textureQuad(top,lid);polygon(lid,null,'#d8cda046');
  };
  const tint=o.tint||'green',soft=fabric(tint),lit=fabric(tint,12),dark=fabric(tint,-19),frame=timber('arc-seat-frame',[82,86,71]);
  for(const u of [.12,w-.19])for(const v of [.14,d-.18])box(u,v,.07,.07,.02,.25,frame,frame);
  box(.045,.035,w-.09,d-.07,.21,.36,frame,frame);
  box(.032,.035,w-.064,.19,.32,.92,lit,soft,dark);
  const n=3,span=(w-.30)/n;
  for(let i=0;i<n;i++)box(.15+i*span,.23,span-.029,d-.285,.36,.49,lit,soft,dark);
  for(const u of [.04,w-.148])box(u,.19,.108,d-.23,.31,.61,lit,soft,dark);
 }
 function modelDraw(o){
  const {x0:x,y0:y,w,h,type}=o;
  if(type==='arcSeat'){arcSeatDraw(o);return;}
  if(type==='arcBookcase'){arcBookcaseDraw(o);dressing(o);return;}
  if(type==='arcVending'||type==='arcDock'){foyerDeviceDraw(o);return;}
  const cx=x+w/2,cy=y+h/2,style=o.style||level.finish;
  const dark=steel('shoe',[57,63,58]),trim=steel('trim',[133,130,109]),wood=timber('frame',[101,77,53]);
  const body=style==='standard'?steel('std-furn',[105,112,104]):timber('body-'+style,style==='lux'?[120,85,56]:[126,98,64]);
  if(type==='bed'){
   const z=.42,lin=textile(style),pill=textile('pillow');
   const headY=o.head==='north',board=o.double?1.04:.86;
   if(headY)solid(x-.025,y-.035,w+.05,.095,.025,board,body,body,body);
   else solid(x-.035,y-.025,.095,h+.05,.025,board,body,body,body);
   solid(x+.06,y+.06,w-.12,h-.12,.025,z,body,body,dark);
   const hv=headY?[[x+w,y,z+.14],[x+w,y+h,z+.14],[x,y+h,z+.14],[x,y,z+.14]]:plane(x,y,w,h,z+.14);
   textureQuad(lin,Xface(x+w,y,h,z,z+.14));textureQuad(lin,Yface(x,y+h,w,z,z+.14));textureQuad(lin,hv);
   polygon(plane(x,y,w,h,z+.141),null,'#b5b9a665');
   const bw=headY?w:h,n=o.double?2:1;
   for(let i=0;i<n;i++){
    const p=.11+i*(bw-.22)/n,g=(bw-.22)/n-.08;
    if(headY)solid(x+p,y+.16,g,.50,z+.14,z+.245,pill,pill,pill);
    else solid(x+.16,y+p,.50,g,z+.14,z+.245,pill,pill,pill);
   }
   const fold=headY?plane(x+.04,y+.72,w-.08,.095,z+.144):plane(x+.72,y+.04,.095,h-.08,z+.144);
   polygon(fold,'#e2d5b078');
   if(o.throw){
    const throwCloth=sampled('warm-cover','luxeBed',[[38,57],[72,47],[98,66],[62,81]],[153,120,81],.66);
    textureQuad(throwCloth,plane(x+.035,y+h-.60,w-.07,.53,z+.147));
    polygon(plane(x+.04,y+h-.18,w-.08,.053,z+.150),'#e4cb94a0');
   }
  } else if(type==='cabinet'){
   const height=o.height||1.91;
   const face=o.asset==='luxeWardrobe'?sampled('old-walnut','luxeWardrobe',[[24,32],[52,18],[53,62],[24,78]],[133,95,55],.89):
    o.asset==='bookCab'?sampled('book-face','bookCab',[[11,17],[38,10],[38,67],[12,76]],[128,101,63],.9):
    sampled('linen-face-'+style,'linenCab',[[17,28],[49,12],[49,64],[17,80]],style==='standard'?[107,118,109]:[133,99,61],.94);
   solid(x,y,w,h,.022,height,body,body,body);
   if(o.facing==='south')textureQuad(face,Yface(x+.045,y+h+.005,w-.09,.08,height-.07));
   else textureQuad(face,Xface(x+w+.005,y+.045,h-.09,.08,height-.07));
   if(o.asset!=='bookCab'){
    if(o.facing==='south')for(const d of [-.105,.105])polygon(Yface(cx+d,y+h+.012,.034,.88,1.04),'#c8af80');
    else for(const d of [-.105,.105])polygon(Xface(x+w+.012,cy+d,.035,.88,1.04),'#c8af80');
   }
  } else if(type==='desk'||type==='worktop'){
   const top=deskTop(style),z=o.height||.87;
   const leg=o.drawer?.38:.07;
   for(const xx of [x+.04,x+w-.11])for(const yy of [y+.05,y+h-.11])solid(xx,yy,.07,.07,.02,z-.07,trim,dark,dark);
   if(o.drawer)solid(x+w-leg-.07,y+.055,leg,h-.11,.04,z-.09,body,body,body);
   solid(x,y,w,h,z-.085,z,top,body,body);
   if(o.terminal==='south')drawSprite('desktopSouth',x+w*.53,y+h*.42,.79,.50,false,z,1);
   if(o.linen){const cloth=textile('pillow');solid(x+.26,y+.14,.65,.61,z,z+.082,cloth,cloth,cloth);solid(x+.29,y+.16,.56,.54,z+.082,z+.159,cloth,cloth,cloth);}
  } else if(type==='chest'||type==='tvStand'){
   const z=o.height||.60,top=deskTop(style);
   solid(x,y,w,h,.03,z,top,body,body);
   for(const zz of [.22,.39])if(zz<z-.04){polygon(Yface(x+.035,y+h+.004,w-.07,zz,zz+.014),'#3d372c');polygon(Yface(cx-.045,y+h+.008,.09,zz+.052,zz+.072),'#c0ad81');}
   if(type==='tvStand')drawSprite('tvOnCab',cx,cy,.59,.5,o.face==='south',z,1);
   if(o.lamp)drawSprite(o.lamp,x+w*.25,y+h*.31,.51,.5,false,z,1);
  } else if(type==='seat'||type==='bench'){
   const tone=o.tint||'green',cover=fabric(tone),highlight=fabric(tone,12),side=fabric(tone,-17);
   const rot=o.face==='east'||o.face==='west',near=o.face==='west'||o.face==='north';
   const a=rot?h:w,b=rot?w:h,Z=o.high||.96,low=Z<.58;
   const oriented=(u,v,du,dv,z,zz,top,f,s)=>{
    if(rot)solid(x+(near?b-v-dv:v),y+u,dv,du,z,zz,top,f,s);
    else solid(x+u,y+(near?b-v-dv:v),du,dv,z,zz,top,f,s);
   };
   for(const u of [.06,a-.13])for(const v of [.045,b-.12])oriented(u,v,.073,.073,.02,.245,body,dark,dark);
   oriented(.022,.025,a-.044,b-.05,.20,.345,body,body,dark);
   const back=()=>oriented(.026,.017,a-.052,.17,.32,Z,highlight,side,side);
   if(!low&&!near)back();
   const arm=low?.044:a>.9?.128:.095,n=o.sections||(a>1.70?2:1),width=(a-2*arm-.06)/n;
   for(let i=0;i<n;i++)oriented(arm+.03+i*width,low?.075:.18,width-.026,b-(low?.123:.218),.345,.475,highlight,cover,side);
   if(!low){
    const arms=()=>{for(const u of [.015,a-arm-.015])oriented(u,.15,arm,b-.186,.29,.618,highlight,cover,side);};
    arms();
    if(near)back();
    if(a>2.0&&!near){const pillow=textile('pillow');oriented(.18,.182,.33,.16,.468,.70,pillow,pillow,cover);}
   }
  } else if(type==='coffee'){
   const z=.46,top=deskTop('lux');
   for(const xx of [x+.065,x+w-.13])for(const yy of [y+.065,y+h-.13])solid(xx,yy,.065,.065,.02,z-.065,wood,dark,dark);
   solid(x,y,w,h,z-.076,z,top,body,body);
   if(o.cup)drawSprite('roomCup',x+w*.71,y+h*.31,.19,.5,false,z+.008,.89);
  } else if(type==='anchoredSprite'){
   const im=images[o.sprite],size=o.pxHeight/im.height;
   drawSprite(o.sprite,cx,cy,size,.5,!!o.flip,o.flush?.026:0,o.foot??1);
   if(o.game){
    const game=images.foyerGameBox;
    drawSprite('foyerGameBox',cx+.075,cy-.05,21/game.width,.51,false,.69,.72);
    const deck=images.foyerCards;
    drawSprite('foyerCards',cx-.18,cy+.24,10/deck.width,.5,false,.68,.61);
   }
  } else if(type==='spriteStand'){
   drawSprite(o.sprite,cx,cy,o.scale||.46,.5,false,0,.96);
   if(o.radio)drawSprite('pzRadio',cx,cy,.52,.50,false,o.top||.88,.97);
   if(o.cola&&images.foyerCola)drawSprite('foyerCola',cx-.12,cy+.20,17.8/images.foyerCola.height,.5,false,o.top||.88,1);
  } else if(type==='plant'){
   const z=.34;
   solid(x,y,w,h,.02,z,steel('planter',[121,112,83]),body,body);
   polygon(plane(x+.06,y+.06,w-.12,h-.12,z+.004),'#292820');
   drawSprite(o.variant||(o.tall?'foliage':'foliageRound'),cx,cy,o.plantScale||(o.variant==='palm'?1.06:o.tall?1.67:1.4),.5,false,z,.92);
  } else if(type==='shower'){
   const priv=style==='privateWet';
   const tile=sampled('stall-tile'+style,'shower621',[[10,18],[46,10],[46,70],[10,82]],priv?[176,182,169]:[142,160,165],.73);
   const tray=sampled('stall-tray'+style,'shower621',[[10,87],[51,79],[64,88],[24,98]],priv?[145,153,137]:[124,143,147],.68);
   solid(x,y,w,h,.015,.093,tray,trim,trim);
   textureQuad(tile,Yface(x,y+.032,w,.092,2.20));
   const glass='#91b8ba50',frame='#a6b7aa',m=y+h*.81;
   const div=(at)=>{
    polygon(Xface(at,y,m-y,.094,1.66),glass,'#789a97a6');
    polygon(Xface(at,y,m-y,.095,.43),'#719395a6');
    paint3([[at,y,1.66],[at,m,1.66],[at,m,.094]],frame,2);
   };
   div(x+.035);if(o.end)div(x+w-.035);
   paint3([[cx,y+.061,.97],[cx,y+.061,2.06],[cx,y+.26,2.06]],'#354b47',4.0);
   paint3([[cx,y+.063,1.00],[cx,y+.063,2.07],[cx,y+.26,2.07]],'#d0d9c7',1.5);
   polygon(plane(cx-.095,y+.155,.19,.17,2.062),'#aebfb4','#6c837a');
   polygon(Yface(cx-.13,y+.066,.26,1.00,1.08),'#bbc6b8','#647b70');
   textureQuad(surfaceTextures.grate,plane(cx-.085,y+h*.6,.17,.18,.097));
   if(level.motion?.['water:'+o.id])for(let i=0;i<12;i++){
    const k=(time*2.6+i*.091)%1,xx=cx+(i%4-1.5)*.046*(1+k),yy=y+.27+k*.13,Z=2.00-k*1.85;
    paint3([[xx,yy,Z],[xx+.013,yy+.019,Z-.10]],i%2?'#c7e0df98':'#aad2ce9c',1.15);
   }
  } else if(type==='tub'){
   const enamel=sampled('tub-enamel','luxBath',[[25,32],[64,24],[70,32],[28,42]],[170,171,154],.65);
   const basin=sampled('tub-basin','luxBath',[[24,27],[67,17],[74,24],[30,36]],[112,141,138],.64);
   solid(x+.05,y+.05,w-.1,h-.1,.03,.47,enamel,enamel,enamel);
   solid(x,y,w,h,.46,.58,enamel,enamel,enamel);
   const corners=(a,b,z)=>[[x+a+.12,y+b,z],[x+w-a-.12,y+b,z],[x+w-a,y+b+.11,z],[x+w-a,y+h-b-.11,z],[x+w-a-.12,y+h-b,z],[x+a+.12,y+h-b,z],[x+a,y+h-b-.11,z],[x+a,y+b+.11,z]];
   const rim=corners(.11,.10,.586);
   polygon(rim,'#637872','#e4d9be');
   ctx.save();ctx.beginPath();rim.forEach((v,i)=>i?ctx.lineTo(...project(...v)):ctx.moveTo(...project(...v)));ctx.closePath();ctx.clip();textureQuad(basin,plane(x+.12,y+.10,w-.24,h-.20,.59));ctx.restore();
   polygon(plane(x+w-.43,cy-.060,.11,.11,.592),'#526862');
   paint3([[x+w-.29,y+.062,.57],[x+w-.29,y+.062,.82],[x+w-.29,y+.24,.82]],'#c3c6b1',2.2);
   if(level.motion?.['water:'+o.id])paint3([[x+w-.29,y+.24,.80],[x+w-.25,y+.34,.60],[x+w-.23,y+.42,.48]],'#add2c8b0',2.2);
  } else if(type==='toilet'){
   drawSprite(o.face==='west'?'suiteToilet':'toiletPorcelain',cx,cy,o.face==='west'?1.12:1.32,.5,o.face==='south',0,.94);
  } else if(type==='sink'){
   const metal=steel('sink',[146,155,148]);
   solid(x+.08,y+.09,w-.16,h-.18,.02,.71,metal,dark,dark);
   solid(x,y,w,h,.70,.80,metal,metal,metal);
   polygon(plane(x+.13,y+.11,w-.26,h-.23,.803),'#435a57','#d6d4bf');
   polygon(plane(x+.20,y+.15,w-.4,h-.30,.806),'#768d82');
   const [fx,fy,dx,dy]=o.face==='east'?[x+.08,cy,.15,0]:o.face==='west'?[x+w-.08,cy,-.15,0]:[cx,y+.08,0,.15];
   paint3([[fx,fy,.79],[fx,fy,1.05],[fx+dx,fy+dy,1.05]],'#c8cdb9',2.4);
   if(level.motion?.['water:'+o.id])paint3([[fx+dx,fy+dy,1.04],[fx+dx*1.1,fy+dy*1.1,.83]],'#c2dedcbe',1.8);
  } else if(type==='openingCrate'){
   containerDraw({id:o.id,sprite:'supplyCase',x:cx,y:cy,scale:1.03,foot:.94});
  } else if(type==='powerPanel'){
   const z=.33,Z=1.94,f=y+h+.012,caseMetal=steel('power-case',[91,112,109]);
   solid(x,y,w,h,z,Z,trim,caseMetal,dark);
   const p=level.motion?.power||0,angle=p*p*(3-2*p)*Math.PI*.82;
   serviceInset(x+.062,f,w-.124,.42,1.85);
   textureQuad(images.serviceBreakers,Yface(x+.125,f-.020,.57,.57,1.69));
   textureQuad(images.serviceRelay,Yface(x+.77,f-.019,.49,1.12,1.68));
   polygon(Yface(x+.120,f-.016,w-.240,1.737,1.785),'#9d9d7d','#474f41');
   for(const [i,c] of ['#bf9f6d','#7e9b89','#a75d48'].entries()){
    const u=x+.29+i*.15;
    paint3([[u,f+.014,.93],[u,f+.017,.73],[u+.09,f+.018,.58],[u+.38,f+.018,.58]],'#272a24',3.1);
    paint3([[u,f+.016,.93],[u,f+.020,.73],[u+.09,f+.022,.58],[u+.38,f+.022,.58]],c,1.85);
   }
   const off=level.motion?.breaker||0,sw=x+.86;
   polygon(Yface(sw,f+.024,.30,.62,1.06),'#414e44','#a0a28b');
   polygon(Yface(sw+.031,f+.031,.056,.94,1),off>.5?'#c57554':'#d3d69b');
   polygon(Yface(sw+.151,f+.031,.065,.72,.966),'#28332c');
   polygon(Yface(sw+.106,f+.040,.147,.846-off*.141,.911-off*.141),'#d7c5a2','#796d51');
   const door=(hinge,sign,b)=>{
    const p=(u,H)=>[hinge+sign*u*Math.cos(angle),f+u*Math.sin(angle),H];
    const q=leafMetal(p,b,.43,1.85,angle>1.2?[84,104,97]:[114,132,127],'power-doors:'+Number(angle>1.2),angle>1.2);
    if(sign>0)polygon(q(.095,.39,1.54,1.69),'#c5b381','#6c684d');
    else for(const [i,c]of ['#a9c083','#d0b77b','#986f55'].entries())polygon(q(.112+i*.076,.151+i*.076,1.64,1.69),c);
   };
   door(x+.08,1,w*.5-.101);door(x+w-.08,-1,w*.5-.107);
  } else if(type==='valveAccess'||type==='maintenanceHatch'){
   const z=.55,Z=type==='valveAccess'?1.77:1.69,front=y+h+.006;
   solid(x,y,w,h,z,Z,trim,steel('service-lip',[104,114,105]),dark);
   const inner=Yface(x+.08,front,w-.16,z+.084,Z-.09);
   serviceInset(x+.08,front,w-.16,z+.084,Z-.09);
   if(type==='valveAccess'){
    const pipe=images.servicePipeSteel;
    textureQuad(pipe,Yface(x+.19,front+.015,w-.38,1.44,1.59));
    for(const [i,offset]of [.23,.50,.77].entries()){
     const px=x+w*offset,c=['#c37858','#83b4a5','#c2a86d'][i],dz=1.09,r=.185,t=level.motion?.['valve'+i]||0;
     const pipeRun=(lo,hi,a,b)=>[[a,front+.024,lo],[a,front+.024,hi],[b,front+.024,hi],[b,front+.024,lo]];
     textureQuad(pipe,pipeRun(.71,1.59,px-.085,px+.085));
     textureQuad(images.servicePipeCap,Yface(px-.159,front+.034,.318,dz-.158,dz+.158));
     const point=(u,a)=>[px+u*Math.cos(a),front+.056,dz+u*Math.sin(a)];
     const edge=Array.from({length:16},(_,j)=>point(r,j*Math.PI/8));
     polygon(edge,'#292e29b5','#212b27');
     paint3([...edge,edge[0]],c,2.25);
     const a=.35+t*Math.PI*.81;
     for(const step of [0,Math.PI*2/3,Math.PI*4/3])paint3([point(.028,a+step),point(r-.016,a+step)],c,2.05);
     polygon(Yface(px-.036,front+.063,.072,dz-.032,dz+.032),'#c7c0a3','#554b3b');
     polygon(Yface(px-.045,front+.033,.09,.738,.785),t>.5?'#d79567':'#bdcc9a','#2c352c');
    }
    const p=level.motion?.valveCover||0,lo=z+.085,hi=Z-.086,bottom=lo+(hi-lo-.057)*p*p*(3-2*p);
    ctx.save();ctx.beginPath();inner.forEach((v,i)=>i?ctx.lineTo(...project(...v)):ctx.moveTo(...project(...v)));ctx.closePath();ctx.clip();
    textureQuad(steel('valve-cover',[106,124,115]),Yface(x+.079,front+.057,w-.158,bottom,hi));
    for(let v=bottom+.131;v<hi-.02;v+=.13){
     polygon(Yface(x+.083,front+.065,w-.166,v-.014,v),'#40564c');
     polygon(Yface(x+.083,front+.065,w-.166,v,v+.014),'#b5bca580');
    }
    polygon(Yface(x+.084,front+.068,w-.168,bottom,bottom+.042),'#acb6a4');
    if(hi-bottom>.17)polygon(Yface(cx-.168,front+.071,.336,bottom+.076,bottom+.145),'#293a33','#aab4a0');
    ctx.restore();
    for(const xx of [x+.089,x+w-.113])polygon(Yface(xx,front+.071,.024,lo,hi),'#9ca99a');
   } else {
    const from=x+.113,wd=w-.227,top=Z-.14,bot=z+.13;
    textureQuad(images.serviceVentFace,Yface(from+wd*.52,front-.015,wd*.46,bot+.018,top-.035));
    polygon(Yface(from+wd*.515,front+.005,wd*.47,bot+.012,top-.029),null,'#8a957e');
    polygon(Yface(from+wd*.47,front+.018,.044,bot+.018,top+.010),'#7e8976','#364338');
    for(const [i,c]of ['#aa9670','#82a495'].entries()){
     const px=from+.18+i*.25,a=px-.065,b=px+.065;
     textureQuad(images.servicePipeSteel,[[a,front+.017,bot],[a,front+.017,top],[b,front+.017,top],[b,front+.017,bot]]);
     polygon(Yface(px-.087,front+.026,.174,1.00,1.075),c,'#666a56');
    }
    paint3([[from+.07,front+.029,.77],[from+.42,front+.029,.84],[from+.57,front+.029,1.09],[from+.63,front+.029,1.42]],'#b3745e',1.7);
    const open=level.motion?.hatch||0,a=open*open*(3-2*open)*Math.PI*.82,half=wd*.5-.018;
    const face=open>.57?[84,105,94]:[108,120,111];
    for(const [hinge,sign] of [[from,1],[from+wd,-1]]){
     const point=(u,H)=>[hinge+sign*u*Math.cos(a),front+.061+u*Math.sin(a),H];
     leafMetal(point,half,bot-.015,top+.041,face,'hatch-leaf:'+Number(open>.57),open>.57);
    }
   }
  } else if(type==='trolley'){
   for(const xx of [x+.08,x+w-.17])for(const yy of [y+.08,y+h-.17])solid(xx,yy,.09,.09,.018,.13,dark,dark,dark);
   for(const xx of [x+.13,x+w-.13]){
    const wheel=(rx,rz)=>Array.from({length:12},(_,i)=>[xx+rx*Math.cos(i*Math.PI/6),y+h-.062,.102+rz*Math.sin(i*Math.PI/6)]);
    polygon(wheel(.095,.096),'#2b3731','#637168');polygon(wheel(.034,.035),'#a2a79b');
   }
   solid(x,y,w,h,.13,.27,trim,dark,dark);
   solid(x+.075,y+.09,w-.15,h-.28,.27,.68,steel('trolley-bin',[126,134,113]),body,body);
   solid(x+.13,y+.15,w-.26,h-.41,.68,.74,textile('pillow'),body,body);
   paint3([[x+.055,y+h-.05,.21],[x+.055,y+h-.05,1.02],[x+w-.055,y+h-.05,1.02],[x+w-.055,y+h-.05,.21]],'#9daaa0',2.7);
  } else if(type==='bookShelf'){
   const Z=o.height||1.20,back=timber('books-dark',[66,56,44]);
   solid(x+.05,y+.02,w-.10,.10,.05,Z,wood,back,back);
   for(const dx of [0,w-.065])solid(x+dx,y,.065,h,.035,Z,body,wood,body);
   const boards=[.15,Z*.52,Z];
   for(const shelf of boards)solid(x,y,w,h,shelf-.062,shelf,body,wood,body);
   const colors=[[154,98,65],[137,131,95],[96,116,106],[166,143,103],[113,124,134],[125,83,72]];
   for(const [i,base] of boards.slice(0,2).entries()){
    let at=x+.11+(i===1?.15:0);
    for(let j=0;j<(i===1?5:6);j++){
     const z=.205+((j*7+i)%5)*.027,ww=.095+((j*3+i)%4)*.019;
     const cloth=timber('binding'+j,colors[j]);
     solid(at,y+.23,ww,h-.36,base,base+z,cloth,cloth,cloth);
     polygon(Yface(at+.008,y+h-.128,ww-.016,base+z-.056,base+z-.040),'#ded0a078');
     at+=ww+.019;
    }
   }
  } else if(type==='washer'){
   const edge=steel('washer-edge',[119,129,124]),top=steel('washer-top',[140,146,137]),z=1.26;
   solid(x,y,w,h,.017,z,top,edge,edge);
   if(images.washerFront)textureQuad(images.washerFront,Yface(x+.023,y+h+.005,w-.046,.044,z-.035));
   else{
    polygon(Yface(x+.046,y+h+.006,w-.092,.95,1.19),'#415653');
    const disc=(rr,zz,c,b)=>polygon(Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return[cx+rr*Math.cos(a),y+h+.014,zz+rr*Math.sin(a)];}),c,b);
    disc(.39,.53,'#8e9991','#394e4b');disc(.32,.53,'#2a403e','#606f66');disc(.24,.55,'#637e7c','#2c4847');
    polygon(Yface(x+w-.22,y+h+.015,.085,1.06,1.11),'#b3c983');
   }
   if(o.dryer)polygon(Yface(x+w-.17,y+h+.018,.10,1.14,1.20),'#bca178');
   if(level.motion?.[o.id]){
    const a=level.motion[o.id],rr=.26;
    const face=Array.from({length:24},(_,i)=>{const p=i*Math.PI/12;return[cx+Math.cos(p)*rr,y+h+.023,.56+Math.sin(p)*rr];});
    polygon(face,'#344742','#647b71');
    for(let i=0;i<3;i++){const p=a+i*Math.PI*2/3;paint3([[cx+Math.cos(p)*.12,y+h+.028,.56+Math.sin(p)*.12],[cx+Math.cos(p+.53)*.215,y+h+.028,.56+Math.sin(p+.53)*.215]],'#99aaa0',2);}
    polygon(Yface(x+w-.17,y+h+.022,.11,1.125,1.183),'#c5da97');
   }
  } else if(type==='shelf'){
   const z=o.height||1.62;
   for(const a of [x,x+w-.075])for(const b of [y,y+h-.075])solid(a,b,.075,.075,.025,z,trim,dark,dark);
   for(const a of [.22,.83,1.46])if(a<z)solid(x,y,w,h,a-.055,a,trim,body,body);
   if(o.supplies){
    const carton=timber('supplies-box',[135,114,82]),tin=steel('supplies-tin',[134,152,124]);
    for(const y0 of [y+.14,y+h*.55]){
     solid(x+.15,y0,w-.30,h*.34,.22,.62,carton,carton,wood);
     polygon(Xface(x+w-.145,y0+.10,h*.23,.39,.48),'#c3b695');
    }
    for(let i=0;i<5;i++){
     const y0=y+.12+i*(h-.22)/5;
     solid(x+.29,y0,.23,.20,.83,1.07,tin,tin,tin);
     solid(x+.33,y0+.043,.14,.12,1.07,1.13,trim,trim,trim);
    }
   } else {
    const fold=sampled('towels','single',[[16,14],[35,10],[38,15],[19,20]],[172,167,144],.75);
    for(const [i,col] of [[0,0],[1,1],[2,0]]){
     const xx=x+.13+i*w*.22,zz=col?.83:1.46;
     if(zz<z)solid(xx,y+.12,w*.18,h*.63,zz,zz+.16,fold,fold,fold);
    }
   }
  } else if(type==='basket'){
   const face=sampled('basket','linenCab',[[15,38],[33,28],[34,61],[16,72]],[129,116,82],.81);
   solid(x,y,w,h,.02,.51,face,face,face);
   polygon(plane(x+.048,y+.048,w-.096,h-.096,.513),'#4c5143');
   if(o.clean)textureQuad(textile('pillow'),plane(x+.08,y+.08,w-.16,h-.16,.515));
  }
  dressing(o);
 }
 function foyerDeviceDraw(o){
  const {x,y,ux,uy,nx,ny}=o.transform,w=o.w,d=o.h;
  const p=(u,v,z)=>[x+ux*(u-w/2)+nx*v,y+uy*(u-w/2)+ny*v,z];
  if(o.type==='arcDock'){
   const deck=sampled('floor-dock','foyerDock',[[36,1],[70,18],[36,36],[2,18]],[118,130,113],.61);
   const quad=[p(0,0,.028),p(w,0,.028),p(w,d,.028),p(0,d,.028)];
   textureQuad(deck,quad);polygon(quad,null,'#a39f8290');
   polygon([p(w*.40,0,.036),p(w*.60,0,.036),p(w*.60,.18,.036),p(w*.40,.18,.036)],'#80765a');
   return;
  }
  const floor=.025,shoulder=1.34,profile=[[0,shoulder],[.12,1.52],[.34,1.65],[.68,1.64],[.89,1.55],[1,shoulder]];
  const source=images.foyerVending;
  const front=sampled('nuka-flat-front','foyerVending',[[14,23],[42,14],[42,56],[14,65]],null);
  const side=sampled('nuka-flat-side','foyerVending',[[3,22],[13,27],[13,64],[3,56]],null);
  const lid=sampled('nuka-enamel-top','foyerVending',[[16,8],[25,5],[35,11],[27,16]],null);
  const i=ux+uy>0?w:0,j=ux-uy>0?0:w,k=w-j;
  const sideFace=[p(i,0,shoulder),p(i,d,shoulder),p(i,d,floor),p(i,0,floor)];
  textureQuad(side,sideFace);
  const face=[p(j,d,shoulder),p(k,d,shoulder),p(k,d,floor),p(j,d,floor)];
  textureQuad(front,face);
  for(let n=0;n<profile.length-1;n++){
   const [a,z]=profile[n],[b,Z]=profile[n+1];
   textureQuad(lid,[p(a*w,0,z),p(b*w,0,Z),p(b*w,d,Z),p(a*w,d,z)]);
   textureQuad(lid,[p(a*w,d+.001,z),p(b*w,d+.001,Z),p(b*w,d+.001,shoulder),p(a*w,d+.001,shoulder)]);
  }
  polygon(face,null,'#6c4d4290');
  const light=level.motion?.vending||0;
  if(light>.01){
   const u=w*(j===0?.62:.38);
   polygon([p(u-.055,d+.009,.47),p(u+.055,d+.009,.47),p(u+.055,d+.009,.43),p(u-.055,d+.009,.43)],'rgba(215,216,151,'+light+')');
  }
 }
 function arcBookcaseDraw(o){
  const {x,y,ux,uy,nx,ny}=o.transform,w=o.w,d=o.h;
  const p=(u,v,z)=>[x+ux*(u-w/2)+nx*v,y+uy*(u-w/2)+ny*v,z];
  const Z=.87,z=.025,fromLeft=ux-uy>0,[a,b]=fromLeft?[0,w]:[w,0],side=ux+uy>0?w:0;
  const front=sampled('foyer-short-shelf-front','pzSmallBookcase',[[7,27],[76,61],[76,150],[7,116]],[122,100,76],.85);
  const end=sampled('foyer-short-shelf-end','pzSmallBookcase',[[82,64],[116,49],[116,138],[82,154]],[119,97,73],.81);
  const top=sampled('foyer-short-shelf-top','pzSmallBookcase',[[12,25],[43,10],[110,45],[77,58]],[146,120,90],.83);
  textureQuad(end,[p(side,d,Z),p(side,0,Z),p(side,0,z),p(side,d,z)]);
  textureQuad(front,[p(a,d,Z),p(b,d,Z),p(b,d,z),p(a,d,z)]);
  textureQuad(top,[p(0,0,Z),p(0,d,Z),p(w,d,Z),p(w,0,Z)]);
 }
 function paint3(verts,color,width=1){
  ctx.beginPath();verts.forEach((v,i)=>i?ctx.lineTo(...project(...v)):ctx.moveTo(...project(...v)));
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(.65,width*state.zoom);ctx.stroke();
 }
 function fabricRug(o){
  if(o.art==='foyerRug'){
   const original=sampled('foyer-woven-rug','arcanumRug',[[118,4],[307,97],[198,155],[8,58]],[114,91,69],.86);
   textureQuad(original,o.quad);
   return;
  }
  if(o.art==='arcanumRug'){
   const original=sampled('arcanum-review','arcanumRug',[[118,4],[307,97],[198,155],[8,58]],null);
   textureQuad(original,plane(o.x,o.y,o.w,o.h,.028));
   return;
  }
  const tex=sampled('rug-'+o.color,'rugLarge',[[14,23],[73,5],[108,22],[49,39]],o.color==='amber'?[121,102,70]:o.color==='rust'?[112,80,66]:[78,109,105],1.08);
  const z=.028;textureQuad(tex,plane(o.x,o.y,o.w,o.h,z));
  for(const a of [.09,.16])polygon(plane(o.x+a,o.y+a,o.w-a*2,o.h-a*2,z+.002),null,a===.09?'#bba778a5':'#362b246f');
 }
 function poolLight(p){
  const [sx,sy]=project(p.x,p.y,.037),r=p.r*38*state.zoom;
  ctx.save();ctx.translate(sx,sy);ctx.scale(1,.5);
  const g=ctx.createRadialGradient(0,0,.06*r,0,0,r);g.addColorStop(0,p.tint||'#edb97250');g.addColorStop(.5,'#d7a56525');g.addColorStop(1,'#d7a56500');
  ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
 }
`;
