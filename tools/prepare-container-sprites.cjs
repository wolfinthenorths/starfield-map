// Animate the existing lids; no generated artwork and no changes to the floor pivot.
const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const dir=path.resolve(__dirname,'../assets');
const profiles={
 box:[[2,11],[18,3],[30,10],[14,18]],
 uniformCrate:[[2,14],[18,4],[39,13],[23,23]],
 supplyCase:[[3,13],[20,3],[39,12],[22,22]],
 luggageCabinet:[[2,28],[54,2],[82,15],[30,41]]
};
function polygon(g,p){g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();}
function mapLid(g,image,p,q){
 const [a,b,,d]=p,[A,B,,D]=q,u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-a[0],d[1]-a[1]],U=[B[0]-A[0],B[1]-A[1]],V=[D[0]-A[0],D[1]-A[1]],det=u[0]*v[1]-u[1]*v[0];
 const m=[(U[0]*v[1]-V[0]*u[1])/det,(U[1]*v[1]-V[1]*u[1])/det,(V[0]*u[0]-U[0]*v[0])/det,(V[1]*u[0]-U[1]*v[0])/det];
 g.save();polygon(g,q);g.clip();g.transform(...m,A[0]-m[0]*a[0]-m[2]*a[1],A[1]-m[1]*a[0]-m[3]*a[1]);g.drawImage(image,0,0);g.restore();
}
(async()=>{
 for(const [name,p] of Object.entries(profiles)){
  const im=await loadImage(path.join(dir,name+'-cut.png')),w=im.width+24,h=im.height+32,c=createCanvas(w*10,h),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  for(let i=0;i<10;i++){
   g.save();g.translate(i*w+12,28);g.drawImage(im,0,0);
   if(i){
    const center=p.reduce((s,v)=>[s[0]+v[0]/4,s[1]+v[1]/4],[0,0]),inner=p.map(v=>v.map((n,k)=>center[k]+(n-center[k])*.86));
    polygon(g,inner);g.fillStyle='#111b16';g.fill();g.strokeStyle='#625f48';g.lineWidth=1;g.stroke();
    const theta=i/9*Math.PI*.53,depth=Math.hypot(p[3][0]-p[0][0],p[3][1]-p[0][1]),cosa=Math.cos(theta),lift=Math.sin(theta)*depth*1.15;
    const q=[p[0],p[1],[p[1][0]+(p[2][0]-p[1][0])*cosa,p[1][1]+(p[2][1]-p[1][1])*cosa-lift],[p[0][0]+(p[3][0]-p[0][0])*cosa,p[0][1]+(p[3][1]-p[0][1])*cosa-lift]];
    polygon(g,q);g.fillStyle='#5c5d4c';g.fill();mapLid(g,im,p,q);polygon(g,q);g.strokeStyle='#8b8b70';g.lineWidth=.7;g.stroke();
   }
   g.restore();
  }
  fs.writeFileSync(path.join(dir,name+'Opening-cut.png'),c.toBuffer('image/png'));
 }
 const icon=await loadImage(path.join(dir,'../favicon.svg'));
 for(const size of[192,512]){const c=createCanvas(size,size),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(icon,0,0,size,size);fs.writeFileSync(path.join(dir,'app-icon-'+size+'.png'),c.toBuffer('image/png'));}
 console.log('Prepared four lid animations and two app icons.');
})().catch(e=>{console.error(e);process.exitCode=1;});
