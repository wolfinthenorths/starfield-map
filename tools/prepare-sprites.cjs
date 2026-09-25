// Deterministic cuts/composites from supplied Fallout sprite sheets. No generated artwork.
const fs = require('fs'), path = require('path');
const {createCanvas, loadImage} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/@napi-rs/canvas');
const src = path.resolve(__dirname, '../../sprites'), out = path.resolve(__dirname, '../assets');
const files = fs.readdirSync(src);
const cuts = {
  archiveCabinet: ['Cupboards.png', 281, 383, 53, 100],
  receptionGate: ['bar-table.png', 217, 282, 39, 52],
  receptionWorktop: ['bar-table.png', 0, 76, 67, 70],
  foliageRound: ['Scenery-004_PID.gif', 2284, 159, 50, 47],
  uniformCrate: ['Base Furniture.png', 175, 1046, 45, 55],
  baggageLockers: ['Scenery-002_PID.gif', 2420, 367, 51, 112],
  kioskX: ['Base Furniture.png', 84, 706, 44, 73],
  kioskY: ['Base Furniture.png', 128, 706, 44, 73],
  kioskNegX: ['Base Furniture.png', 43, 709, 42, 70],
  kioskNegY: ['Base Furniture.png', 0, 709, 43, 70],
  receptionSeatY: ['chairs.png', 102, 0, 32, 42],
  foliage: ['Scenery-004_PID.gif', 2148, 157, 45, 45],
  vaultLamp: ['Vault Objects.png', 434, 393, 50, 44],
  vaultVent: ['Vault Objects.png', 435, 438, 34, 37],
  utilityCabinet: ['Base Furniture.png', 727, 465, 51, 82],
  waterDispenser: ['Base Furniture.png', 0, 556, 68, 107],
  supplyCase: ['Base Furniture.png', 43, 1048, 47, 53],
  steelBench: ['Vault Objects.png', 0, 162, 65, 63],
  luggageCabinet: ['Vault Objects.png', 264, 162, 86, 66],

  receptionMiddle: ['bar-table.png', 267, 0, 67, 76],
  receptionTill: ['bar-table.png', 267, 76, 67, 70],
  receptionCorner: ['bar-table.png', 0, 266, 55, 68],
  receptionEnd: ['bar-table.png', 106, 266, 56, 68],
  receptionSeat: ['chairs.png', 69, 0, 34, 43],
  coffeeRound: ['bar-furniture.png', 0, 0, 49, 56],
  wallMachine: ['wall-decor.png', 0, 0, 164, 171],
  pipeMachine: ['wall-decor.png', 0, 537, 181, 178],
  lampWall: ['Scenery-002_PID.gif', 1204, 438, 46, 45],
  palm: ['Scenery-002_PID.gif', 1190, 1108, 57, 102],
  airVent: ['Scenery-001_PID.gif', 113, 790, 61, 63],
  blastDoor: ['Scenery-001_PID.gif', 2240, 358, 210, 155],
  robotSprite: ['Critters_PID.gif', 630, 1777, 89, 106],
};
async function main() {
 const loaded = {};
 for (const [name,[suffix,x,y,w,h]] of Object.entries(cuts)) {
  if(process.argv.length>2&&!process.argv.slice(2).includes(name))continue;
  const file = files.find(f => f.endsWith(suffix));
  if (!file) throw new Error('Missing sheet: '+suffix);
  const im = loaded[file] ||= await loadImage(path.join(src,file));
  const c=createCanvas(w,h), g=c.getContext('2d');g.drawImage(im,x,y,w,h,0,0,w,h);
  const d=g.getImageData(0,0,w,h); let l=w,t=h,r=-1,b=-1;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
   const i=(yy*w+xx)*4,rr=d.data[i],gg=d.data[i+1],bb=d.data[i+2];
   if((rr>220&&gg<50&&bb>220)||(suffix.endsWith('.gif')&&rr<9&&gg<9&&bb<9))d.data[i+3]=0;
   else if(d.data[i+3]){l=Math.min(l,xx);t=Math.min(t,yy);r=Math.max(r,xx);b=Math.max(b,yy);}
  }
  if(r<l)throw new Error('Empty cut '+name);
  // Ignore sheet captions and neighboring fragments; retain every pixel inside the main object's bounds.
  const seen=new Uint8Array(w*h);let largest=[];
  for(let k=0;k<w*h;k++)if(!seen[k]&&d.data[k*4+3]){
   const component=[k];seen[k]=1;
   for(let j=0;j<component.length;j++){const p=component[j],px=p%w,py=Math.floor(p/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=px+dx,yy=py+dy,q=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&!seen[q]&&d.data[q*4+3]){seen[q]=1;component.push(q);}}}
   if(component.length>largest.length)largest=component;
  }
  l=w;t=h;r=-1;b=-1;for(const k of largest){l=Math.min(l,k%w);r=Math.max(r,k%w);t=Math.min(t,Math.floor(k/w));b=Math.max(b,Math.floor(k/w));}
  // The source table includes a solid black cast shadow: preserve it as translucent.
  if(name==='coffeeRound'||name==='receptionSeatY')for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=(yy*w+xx)*4;if(Math.max(d.data[i],d.data[i+1],d.data[i+2])<12)d.data[i+3]=Math.round(d.data[i+3]*.28);}
  g.putImageData(d,0,0);const trim=createCanvas(r-l+1,b-t+1);trim.getContext('2d').drawImage(c,-l,-t);
  fs.writeFileSync(path.join(out,name+'-cut.png'),trim.toBuffer('image/png'));
  console.log(name,trim.width,trim.height);
 }
 const preview=createCanvas(1000,Math.ceil(Object.keys(cuts).length/6)*145),g=preview.getContext('2d');g.fillStyle='#232c27';g.fillRect(0,0,preview.width,preview.height);g.imageSmoothingEnabled=false;let i=0;
 for(const name of Object.keys(cuts)){const im=await loadImage(path.join(out,name+'-cut.png'));const x=(i%6)*165,y=Math.floor(i/6)*145;g.fillStyle='#ccc59b';g.font='12px monospace';g.fillText(name,x+3,y+14);const scale=Math.min(1.25,155/im.width,120/im.height);g.drawImage(im,x+4,y+21,im.width*scale,im.height*scale);i++;}
 fs.writeFileSync(path.resolve(__dirname,'../../sprite-selection.png'),preview.toBuffer('image/png'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
