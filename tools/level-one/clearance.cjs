'use strict';
// Check the actual footprints and a continuous 0.60-unit route from the arrival point.
const inside=(x,y,poly)=>{
 let yes=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const [a,b]=poly[i],[c,d]=poly[j];
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;
 }
 return yes;
};
function distance(px,py,l){
 const v=Math.max(0,Math.min(l.span,(px-l.x)*l.ux+(py-l.y)*l.uy));
 return Math.hypot(px-l.x-l.ux*v,py-l.y-l.uy*v);
}
const footprint=([x,y,w,h,id,hull])=>hull||[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function touch(a,b){
 for(const h of [a,b])for(const [i,[x,y]]of h.entries()){
  const [nx,ny]=h[(i+1)%h.length],n=Math.hypot(nx-x,ny-y),ux=(ny-y)/n,uy=(x-nx)/n;
  const p=a.map(v=>v[0]*ux+v[1]*uy),q=b.map(v=>v[0]*ux+v[1]*uy);
  if(Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q))<=.024)return false;
 }
 return true;
}
module.exports=s=>{
 const floor=(x,y)=>s.shapes.some(poly=>inside(x,y,poly));
 const margin=.30,step=.15,cells=new Uint8Array(235*223),framed=s.objects.filter(o=>o.wall);
 const errors=[];
 for(const [i,item] of s.occupied.entries()){
  const [x,y,w,h,name,hull]=item;
  const shape=footprint(item),cx=shape.reduce((sum,p)=>sum+p[0],0)/shape.length,cy=shape.reduce((sum,p)=>sum+p[1],0)/shape.length;
  for(const [xx,yy] of shape)if(!floor(xx*.992+cx*.008,yy*.992+cy*.008))errors.push(name+' выступает за пол');
  for(const other of s.occupied.slice(i+1))if(touch(shape,footprint(other)))errors.push(name+' пересекает '+other[4]);
 }
 for(const o of framed){const [a,v,edge]=o.wall,p=a==='x'?o.x0:o.y0,span=a==='x'?o.w:o.h,d=edge==='max'?v-p-span:p-v;if(d<.05||d>.23)errors.push(o.id+' оторван от стены');}
 const core=s.objects.find(o=>o.kind==='roof')?.poly;
 const pass=(x,y)=>{
  if(!floor(x,y)||!floor(x+margin,y)||!floor(x-margin,y)||!floor(x,y+margin)||!floor(x,y-margin))return false;
  if(core&&inside(x,y,core))return false;
  if(s.walls.some(l=>distance(x,y,l)<margin))return false;
  if(s.occupied.some(([a,b,w,h,id,hull])=>{
   if(x<=a-margin||x>=a+w+margin||y<=b-margin||y>=b+h+margin)return false;
   if(!hull||inside(x,y,hull))return true;
   return hull.some(([xx,yy],i)=>{const [ex,ey]=hull[(i+1)%hull.length],span=Math.hypot(ex-xx,ey-yy);return distance(x,y,{x:xx,y:yy,ux:(ex-xx)/span,uy:(ey-yy)/span,span})<margin;});
  }))return false;
  return true;
 };
 const key=(x,y)=>y*235+x;
 const point=(x,y)=>[Math.round(x/step),Math.round(y/step)];
 const start=point(...s.spawn);
 const q=pass(start[0]*step,start[1]*step)?[start]:[];
 cells[key(...start)]=q.length?1:0;
 if(!q.length)errors.push('Нет свободного места в точке входа');
 for(let i=0;i<q.length;i++){
  const [x,y]=q[i];
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const a=x+dx,b=y+dy,k=key(a,b);
   if(a>=0&&a<235&&b>=0&&b<223&&!cells[k]&&pass(a*step,b*step)){cells[k]=1;q.push([a,b]);}
  }
 }
 for(const [name,x,y] of s.aisles||[]){
  const [a,b]=point(x,y);let yes=false;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(cells[key(a+dx,b+dy)])yes=true;
  if(!yes)errors.push('Нет прохода: '+name);
 }
 if(errors.length)throw Error(s.label+' — '+[...new Set(errors)].join('; '));
 return `${s.label}: ${s.occupied.length} предметов, ${s.aisles.length} свободных подходов`;
};
