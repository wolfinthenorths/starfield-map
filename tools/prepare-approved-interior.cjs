// Cuts and joins of existing game artwork. No invented furniture or AI artwork.
const fs=require('fs'),path=require('path'),{createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),src=path.resolve(root,'../sprites'),out=path.join(root,'assets');
async function cut(file,box,name){const im=await loadImage(path.join(src,file)),[x,y,w,h]=box,c=createCanvas(w,h),g=c.getContext('2d');g.drawImage(im,x,y,w,h,0,0,w,h);const d=g.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const [r,gg,b]=d.data.slice(i,i+3);if((r>220&&gg<50&&b>220)||(file.endsWith('.gif')&&r<9&&gg<9&&b<9))d.data[i+3]=0;}g.putImageData(d,0,0);if(name)fs.writeFileSync(path.join(out,name+'-cut.png'),c.toBuffer('image/png'));return c;}
(async()=>{
 const cube=await cut('bar-table.png',[267,0,67,76],null),till=await cut('bar-table.png',[267,76,67,70],null);
 // All native bases use the same (33,65) ground pivot and a 32x16 isometric grid.
 // The whole U is baked once, so it has no independently rounded module positions.
 const c=createCanvas(380,230),g=c.getContext('2d');g.imageSmoothingEnabled=false;const cells=[];
 for(let x=0;x<6;x++)cells.push([x,3]);for(const x of[0,5])for(let y=0;y<3;y++)if(x!==0||y!==0)cells.push([x,y]);
 cells.sort((a,b)=>a[0]+a[1]-b[0]-b[1]);for(const [x,y]of cells)g.drawImage(x===2&&y===3?till:cube,140+(x-y)*32-34,72+(x+y)*16-(x===2&&y===3?69:74));
 const gate=await loadImage(path.join(out,'receptionGate-cut.png'));g.drawImage(gate,140-17,72-49);
 fs.writeFileSync(path.join(out,'receptionUnit-cut.png'),c.toBuffer('image/png'));
 // Native Fallout 1/2 metal filing/storage cabinets and a low matching unit.
 await cut('Scenery-002_PID.gif',[2418,365,56,116],'recordsCabinet');

 // The working chair reuses assets/chair-cut.png in its mirrored native view.
 console.log('Prepared reception from native modules, metal cabinets, and working chair.');
})();
