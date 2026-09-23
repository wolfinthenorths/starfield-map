// Independently check exposed floor edges against walls/doorways.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const env={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../level-zero.js'),'utf8'),env);
const s=env.window.createLevelZero();
function inside(x,y,p){let winding=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);if(a[1]<=y&&b[1]>y&&cross>0)winding++;if(a[1]>y&&b[1]<=y&&cross<0)winding--;}return winding!==0;}
const floor=(x,y)=>s.shapes.some(p=>inside(x,y,p));
function distance(x,y,w){const u=Math.max(0,Math.min(w.span,(x-w.x)*w.ux+(y-w.y)*w.uy));return Math.hypot(x-w.x-w.ux*u,y-w.y-w.uy*u);}
let checked=0;const gaps=[];
for(const p of s.shapes)for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),n=Math.ceil(len*10);for(let j=0;j<n;j++){const t=(j+.5)/n,x=a[0]+dx*t,y=a[1]+dy*t;if(floor(x+dy/len*.001,y-dx/len*.001))continue;checked++;if(![...s.walls,...s.doors].some(w=>distance(x,y,w)<.01))gaps.push([x,y]);}}
assert.equal(gaps.length,0,'Exposed floor boundary has no wall/door: '+JSON.stringify(gaps.slice(0,8)));
for(const o of s.objects.filter(o=>o.sprite&&!o.z))assert(floor(o.x,o.y),'Sprite foot is outside floor: '+o.id);
for(const o of s.objects.filter(o=>o.z))assert(s.walls.some(w=>distance(o.x,o.y,w)<.01),'Detached wall fitting: '+o.id);
assert.equal(s.objects.filter(o=>o.kind==='stairs').length,1,'One residential stair');
for(const lane of s.clearLanes)for(let y=lane.y;y<lane.y+lane.h;y++)for(let x=lane.x;x<lane.x+lane.w;x++)if(floor(x+.5,y+.5))assert(!s.blocked.has(x+','+y),'Furniture blocks circulation lane '+x+','+y);
console.log(`PASS: ${checked} exterior samples enclosed by walls or doors; all sprite feet and wall fittings aligned.`);
