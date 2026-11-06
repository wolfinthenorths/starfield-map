'use strict';
const FoyerFlight=(()=>{
 const TAU=Math.PI*2,CELL_W=60,CELL_H=62;
 function screen(view,x,y,z=0){
  const [ox,oy]=view.origin,q=view.zoom;
  return [ox+(x-y)*38*q,oy+(x+y)*19*q-z*42*q];
 }
 function facing(dx,dy){
  const u=dx-dy,v=(dx+dy)*.5;
  if(u>=0)return v>Math.abs(u)*.26?2:v<-Math.abs(u)*.26?0:1;
  return v>Math.abs(u)*.26?3:v<-Math.abs(u)*.26?5:4;
 }
 function positions(plan,t){
  const a=plan.phase+t*TAU/22.4,rx=plan.radius,[x,y]=plan.hub,[dockX,dockY]=plan.dock;
  const p=t*TAU/5.6;
  return [
   {x:x+Math.cos(a)*rx,y:y+Math.sin(a)*rx,z:1.04+Math.sin(t*4.1)*.082,dir:facing(-Math.sin(a),Math.cos(a)),size:1.09,frame:Math.floor(t*7)%10},
   {x:dockX,y:dockY,z:.63+.043*Math.sin(p),dir:3,size:1.05,frame:2,docked:true}
  ].sort((a,b)=>a.x+a.y-b.x-b.y);
 }
 function paint(ctx,atlas,view,t,only=null){
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  for(const o of only?[only]:positions(view.flight,t)){
   const [gx,gy]=screen(view,o.x,o.y,.035);
   if(!o.docked){
    const radius=11.5*view.zoom*(.87+o.z*.2);
    for(const [k,opacity] of [[1.27,.085],[1,.21]]){
     ctx.beginPath();ctx.ellipse(gx,gy,radius*k,radius*.46*k,0,0,TAU);ctx.fillStyle='rgba(13,20,16,'+opacity+')';ctx.fill();
    }
   }
   const [sx,sy]=screen(view,o.x,o.y,o.z),scale=o.size*view.zoom;
   if(o.docked){
    const r=10*view.zoom,g=ctx.createRadialGradient(gx,gy,0,gx,gy,r);
    g.addColorStop(0,'rgba(166,214,174,'+(.23+.12*Math.sin(t*2.6))+')');
    g.addColorStop(1,'rgba(166,214,174,0)');
    ctx.fillStyle=g;ctx.fillRect(gx-r,gy-r,2*r,2*r);
   }
   ctx.drawImage(atlas,o.frame*CELL_W,o.dir*CELL_H,CELL_W,CELL_H,Math.round(sx-30*scale),Math.round(sy-26*scale),Math.round(CELL_W*scale),Math.round(CELL_H*scale));
  }
  ctx.restore();
 }
 return {paint,positions,screen};
})();
module.exports=FoyerFlight;
