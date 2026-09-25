// Flat fixtures assembled from the supplied Vault metal and welcome artwork.
// Source pixels are sampled with nearest-neighbour interpolation.
const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const dir=path.resolve(__dirname,'../assets');
(async()=>{
 const wall=await loadImage(path.join(dir,'wallA-cut.png')),boy=await loadImage(path.join(dir,'welcome.gif'));
 function panel(name,w,h,draw){const c=createCanvas(w,h),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(wall,8,22,22,58,0,0,w,h);g.fillStyle='#14262188';g.fillRect(0,0,w,h);g.strokeStyle='#98a298';g.strokeRect(.5,.5,w-1,h-1);g.strokeStyle='#1a2521';g.strokeRect(2.5,2.5,w-5,h-5);draw(g,w,h);for(const x of[3,w-4])for(const y of[3,h-4]){g.fillStyle='#adb0a0';g.fillRect(x,y,1,1);}fs.writeFileSync(path.join(dir,name+'-cut.png'),c.toBuffer('image/png'));}
 panel('stripLight',86,20,(g)=>{g.fillStyle='#182721';g.fillRect(5,4,76,12);g.fillStyle='#afb99f';g.fillRect(8,5,70,10);g.fillStyle='#f0e8bc';g.fillRect(9,7,68,6);g.fillStyle='#fff4d4';g.fillRect(10,7,66,2);for(const x of[7,76]){g.fillStyle='#45524a';g.fillRect(x,4,3,12);}});
 panel('welcomePoster',82,98,(g)=>{g.fillStyle='#bbae83';g.fillRect(5,5,72,88);g.fillStyle='#344a4b';g.fillRect(8,8,66,80);g.fillStyle='#e0c471';g.font='bold 10px monospace';g.textAlign='center';g.fillText('VAULT-TEC',41,21);g.drawImage(boy,0,0,boy.width,boy.height,14,24,54,54);g.fillStyle='#d6cfab';g.font='7px monospace';g.fillText('WELCOME HOME',41,85);});
 panel('noticePanel',72,76,(g)=>{g.fillStyle='#b6b095';g.fillRect(7,7,58,62);g.fillStyle='#374338';g.font='bold 9px monospace';g.fillText('ARRIVALS',13,22);g.fillRect(12,28,47,2);g.font='7px monospace';for(let i=0;i<3;i++){g.fillText('0'+(i+1),12,40+i*11);g.fillStyle='#666a54';g.fillRect(28,35+i*11,29,2);g.fillRect(28,39+i*11,23-i*3,1);g.fillStyle='#374338';}});
 panel('entryPanel',80,64,(g)=>{g.fillStyle='#1f302d';g.fillRect(5,5,70,54);g.fillStyle='#b5a975';g.font='bold 9px monospace';g.fillText('ENTRY 00',13,19);g.fillStyle='#779992';for(let i=0;i<3;i++){g.fillRect(13,28+i*9,8,5);g.fillRect(26,29+i*9,40-i*4,2);}g.fillStyle='#baac74';g.fillRect(13,54,51,1);});
 panel('surfaceDisplay',104,74,(g)=>{g.fillStyle='#1b2426';g.fillRect(6,6,92,62);g.fillStyle='#232f31';g.fillRect(9,9,86,49);g.fillStyle='#c2925c';g.font='bold 9px monospace';g.fillText('SURFACE',16,24);g.fillText('ACCESS LOCKED',16,46);g.strokeStyle='#a0875a';g.strokeRect(77,17,10,8);g.strokeRect(80,12,4,6);g.fillStyle='#947956';for(let y=11;y<56;y+=3){g.globalAlpha=.09;g.fillRect(10,y,84,1);}g.globalAlpha=1;g.fillStyle='#b5634a';g.fillRect(84,61,6,3);});
 panel('systemsPanel',52,76,(g)=>{g.fillStyle='#192928';g.fillRect(6,6,40,64);for(let i=0;i<5;i++){g.fillStyle=i===4?'#c4a862':'#83a381';g.fillRect(10,12+i*10,4,4);g.fillStyle='#657871';g.fillRect(22,13+i*10,19,2);}g.fillStyle='#8c9b8e';g.fillRect(10,65,30,2);});
 panel('communityPoster',82,98,(g)=>{g.fillStyle='#c1b38a';g.fillRect(5,5,72,88);g.fillStyle='#314744';g.fillRect(9,9,64,78);g.fillStyle='#d7c274';g.font='bold 9px monospace';g.textAlign='center';g.fillText('A BETTER',41,20);g.fillText('TOMORROW',41,31);g.drawImage(boy,0,0,boy.width,boy.height,20,33,42,42);g.fillStyle='#dfd7b4';g.font='7px monospace';g.fillText('STARTS HERE',41,85);});
 const clock=createCanvas(48,48),cg=clock.getContext('2d');cg.imageSmoothingEnabled=false;
 cg.fillStyle='#263731';cg.fillRect(7,2,34,44);cg.fillRect(2,7,44,34);cg.fillStyle='#9aa48d';cg.fillRect(8,4,32,40);cg.fillRect(4,8,40,32);cg.fillStyle='#d6ccb0';cg.fillRect(10,7,28,34);cg.fillRect(7,10,34,28);
 cg.fillStyle='#354039';for(const [x,y,w,h]of[[23,9,2,5],[23,34,2,5],[9,23,5,2],[34,23,5,2],[13,13,2,2],[33,13,2,2],[13,33,2,2],[33,33,2,2]])cg.fillRect(x,y,w,h);
 cg.strokeStyle='#354039';cg.lineWidth=2;cg.beginPath();cg.moveTo(16,18);cg.lineTo(24,24);cg.lineTo(33,16);cg.stroke();cg.fillRect(22,22,4,4);
 fs.writeFileSync(path.join(dir,'receptionClock-cut.png'),clock.toBuffer('image/png'));
 console.log('Prepared sprite-based fixtures and reception wall details.');
})().catch(e=>{console.error(e);process.exitCode=1});
