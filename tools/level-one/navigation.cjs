'use strict';
const WalkNavigation=(()=>{
 const step=.20,radius=.27,two=Math.SQRT2;
 function inside(x,y,poly){
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const [a,b]=poly[i],[c,d]=poly[j];
   if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;
  }
  return yes;
 }
 function segment(x,y,l){
  const dx=x-l.x,dy=y-l.y,t=Math.max(0,Math.min(l.span,dx*l.ux+dy*l.uy));
  return (dx-l.ux*t)**2+(dy-l.uy*t)**2;
 }
 function edges(poly){
  return poly.map(([x,y],i)=>{
   const [a,b]=poly[(i+1)%poly.length],span=Math.hypot(a-x,b-y);
   return {x,y,ux:(a-x)/span,uy:(b-y)/span,span};
  });
 }
 function paddedHull(poly){
  const x=poly.map(p=>p[0]),y=poly.map(p=>p[1]);
  return {poly,edges:edges(poly),x0:Math.min(...x)-radius,y0:Math.min(...y)-radius,x1:Math.max(...x)+radius,y1:Math.max(...y)+radius};
 }
 function make(scene,badge=false){
  const walls=[...scene.walls,...scene.doors.filter(o=>o.id==='staffAccess'&&!badge)].map(o=>{
   const x=o.x+o.ux*o.span,y=o.y+o.uy*o.span;
   return {...o,x0:Math.min(o.x,x)-radius,y0:Math.min(o.y,y)-radius,x1:Math.max(o.x,x)+radius,y1:Math.max(o.y,y)+radius};
  });
  const hulls=scene.occupied.map(([x,y,w,h,id,poly])=>paddedHull(poly||[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]));
  const core=scene.objects.find(o=>o.kind==='roof')?.poly;
  if(core)hulls.push(paddedHull(core));
  const floor=(x,y)=>scene.shapes.some(poly=>inside(x,y,poly));
  const rs=radius*radius,diag=radius*.70;
  function valid(x,y){
   if(!floor(x,y)||!floor(x+radius,y)||!floor(x-radius,y)||!floor(x,y+radius)||!floor(x,y-radius))return false;
   if(!floor(x+diag,y+diag)||!floor(x-diag,y+diag)||!floor(x+diag,y-diag)||!floor(x-diag,y-diag))return false;
   if(walls.some(o=>x>=o.x0&&x<=o.x1&&y>=o.y0&&y<=o.y1&&segment(x,y,o)<rs))return false;
   return !hulls.some(o=>x>=o.x0&&x<=o.x1&&y>=o.y0&&y<=o.y1&&(inside(x,y,o.poly)||o.edges.some(l=>segment(x,y,l)<rs)));
  }
  function straight(a,b){
   const dx=b.x-a.x,dy=b.y-a.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.12));
   for(let i=1;i<=n;i++)if(!valid(a.x+dx*i/n,a.y+dy*i/n))return false;
   return true;
  }
  const points=scene.shapes.flat(),x0=Math.floor(Math.min(...points.map(p=>p[0]))/step)*step,y0=Math.floor(Math.min(...points.map(p=>p[1]))/step)*step;
  const W=Math.ceil((Math.max(...points.map(p=>p[0]))-x0)/step)+1,H=Math.ceil((Math.max(...points.map(p=>p[1]))-y0)/step)+1,N=W*H;
  const cells=new Uint8Array(N);
  const node=i=>({x:x0+(i%W)*step,y:y0+Math.floor(i/W)*step});
  for(let i=0;i<N;i++){const p=node(i);cells[i]=Number(valid(p.x,p.y));}
  function nearest(x,y,max=.68,link=null){
   const a=Math.round((x-x0)/step),b=Math.round((y-y0)/step),r=Math.ceil(max/step);let best=-1,bestD=max**2+.000001;
   for(let v=Math.max(0,b-r);v<=Math.min(H-1,b+r);v++)for(let u=Math.max(0,a-r);u<=Math.min(W-1,a+r);u++){
    const i=u+v*W;if(!cells[i])continue;
    const p=node(i),d=(p.x-x)**2+(p.y-y)**2;
    if(d<bestD&&(!link||straight(link,p))){best=i;bestD=d;}
   }
   return best;
  }
  function targetPoint(x,y,max=.68){
   if(valid(x,y))return{x,y};
   const i=nearest(x,y,max);return i<0?null:node(i);
  }
  function route(from,to){
   if(!to)return null;
   if(straight(from,to))return Math.hypot(to.x-from.x,to.y-from.y)<.035?[]:[to];
   const start=nearest(from.x,from.y,.55,from),end=nearest(to.x,to.y,.55,to);
   if(start<0||end<0)return null;
   const back=new Int32Array(N).fill(-1),cost=new Float64Array(N).fill(Infinity),seen=new Uint8Array(N),heap=[];
   const ex=end%W,ey=Math.floor(end/W);
   const h=(x,y)=>Math.hypot(x-ex,y-ey);
   function add(i,f){
    let j=heap.length;heap.push([i,f]);
    while(j){const p=(j-1)>>1;if(heap[p][1]<=f)break;heap[j]=heap[p];j=p;}
    heap[j]=[i,f];
   }
   function take(){
    const i=heap[0][0],last=heap.pop();
    if(heap.length){let j=0;while(j*2+1<heap.length){
     let k=j*2+1;if(k+1<heap.length&&heap[k+1][1]<heap[k][1])k++;
     if(heap[k][1]>=last[1])break;heap[j]=heap[k];j=k;
    }heap[j]=last;}
    return i;
   }
   cost[start]=0;add(start,h(start%W,Math.floor(start/W)));
   while(heap.length){
    const i=take();if(seen[i])continue;seen[i]=1;if(i===end)break;
    const x=i%W,y=Math.floor(i/W);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
     const a=x+dx,b=y+dy,k=a+b*W;if(a<0||a>=W||b<0||b>=H||!cells[k]||seen[k])continue;
     if(dx&&dy&&(!cells[i+dx]||!cells[i+dy*W]))continue;
     const g=cost[i]+(dx&&dy?two:1);
     if(g<cost[k]){cost[k]=g;back[k]=i;add(k,g+h(a,b));}
    }
   }
   if(!seen[end])return null;
   const raw=[to];for(let i=end;i>=0;i=back[i]){raw.push(node(i));if(i===start)break;}raw.reverse();
   const res=[];let last=from,first=0;
   while(first<raw.length){
    let k=raw.length-1;while(k>first&&!straight(last,raw[k]))k--;
    if(!straight(last,raw[k]))return null;
    if(Math.hypot(raw[k].x-last.x,raw[k].y-last.y)>.027)res.push(raw[k]);
    last=raw[k];first=k+1;
   }
   return res;
  }
  return {valid,straight,route,floor,targetPoint};
 }
 return {make};
})();
module.exports=WalkNavigation;
