const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const canvasLib=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas':'@napi-rs/canvas';
const {createCanvas,Image:RealImage}=require(canvasLib),dir=path.resolve(__dirname,'..');
async function boot(saved){
 const elements={};class El{constructor(){this.clientWidth=844;this.clientHeight=390;this.handlers={};}addEventListener(t,f){(this.handlers[t]??=[]).push(f);}setPointerCapture(){}getBoundingClientRect(){return{left:0,top:0};}}
 for(const id of['world','move-left','move-right','move-up','move-down'])elements[id]=new El();
 const c=createCanvas(844,390);elements.world.getContext=()=>c.getContext('2d');for(const p of['width','height'])Object.defineProperty(elements.world,p,{get:()=>c[p],set:v=>c[p]=v});
 class Image extends RealImage{set src(v){super.src='data:image/png;base64,'+fs.readFileSync(path.join(dir,v)).toString('base64');}get src(){return super.src;}}
 let tick,now=0;const storage=new Map(saved?[['starfield-character-class',saved]]:[]),window={innerWidth:844,innerHeight:390,devicePixelRatio:3,addEventListener(){},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 const env={window,document:{getElementById:id=>elements[id],createElement:()=>createCanvas(1,1),addEventListener(){},hidden:false},console,Image,ResizeObserver:class{observe(){}},requestAnimationFrame:f=>tick=f};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'level-zero.js'),'utf8'),env);env.createLevelZero=window.createLevelZero;
 const code=fs.readFileSync(path.join(dir,'engine.js'),'utf8').replace('new ResizeObserver(resize)','window.test={state,player,level,pass,pathTo,request,act,updateAction,canStep,startDecon,setDoor};new ResizeObserver(resize)').replace('if(dirty)render();','if(false)render();');vm.runInNewContext(code,env);
 const api=window.Bunker;await api.ready;api.start();const d=window.test,actions=[];api.onAction=a=>actions.push(a);
 const frames=n=>{for(let i=0;i<n;i++){now+=1000/30;tick(now);assert(d.pass(d.player.x,d.player.y),'collision at '+d.player.x+','+d.player.y);}};
 const object=id=>[...d.level.doors,...d.level.objects].find(o=>o.id===id);
 const go=id=>{d.request(object(id));for(let i=0;i<1800&&d.state.path.length;i++)frames(1);assert(!d.state.path.length,'Path never completed: '+id);assert.equal(d.state.selected?.id,id,'Unexpected locked door while routing to '+id);d.updateAction();};
 return{api,d,frames,object,go,actions,storage};
}
(async()=>{
 const a=await boot(),{api,d,frames,object,go,actions}=a;
 assert.equal(d.level.objects.filter(o=>o.kind==='stairs').length,1);assert.equal(api.confirmClass('raider'),false,'Cannot register away from control');
 go('cleanOuterA');d.act();frames(12);assert(!d.canStep(18.5,42.5,18.5,41.5),'Opening door blocks passage');frames(20);
 go('cleanControlA');frames(45);assert(!d.state.open.cleanOuterA,'Door closes after the player clears it');
 assert(!d.state.open.cleanInnerA);d.act();assert(d.state.cycle);frames(230);assert.equal(d.state.cycle,null);assert(d.state.cleaned.A);assert(!d.state.cleaned.B);
 go('accessGate');d.act();assert(actions.includes('scan'));assert(!d.state.open.accessGate,'Class selection must precede admission');assert(!api.confirmClass('admin'));
 for(const cls of['raider','resident','ghoul']){assert(api.confirmClass(cls));assert.equal(api.getPass().characterClass,cls);assert.equal(a.storage.get('starfield-character-class'),cls);}
 assert.equal(api.getPass().label,'Гуль');frames(32);go('registration');d.act();assert(actions.includes('registration'));frames(40);assert(!d.state.open.accessGate,'Access gate closes behind admitted character');
 for(const o of d.level.objects.filter(o=>o.action))assert(d.pathTo(...o.approach,true),'Unreachable object: '+o.id);
 go('stairA');go('surfaceInner');d.act();frames(32);go('surfaceGate');frames(40);assert(!d.state.open.surfaceInner,'Surface inner door closes outward');d.act();assert(actions.includes('denied'));assert(!d.state.open.surfaceGate);
 go('surfaceInner');d.act();frames(32);go('registration');frames(40);assert(!d.state.open.surfaceInner,'Surface inner door closes inward');
 // Opening occupied doorway remains safe, including an accidental closure request.
 const door=object('surfaceInner');d.player.x=35;d.player.y=18.5;d.state.path=[];d.setDoor(door,true);d.state.anim[door.id]=1;frames(360);assert(d.state.open[door.id]);d.state.open[door.id]=false;frames(2);assert(d.state.open[door.id],'Occupied door reopens');
 const b=await boot('resident');assert.equal(b.api.getPass().characterClass,'resident');assert.equal(b.api.getPass().approved,false,'Reload does not bypass checkpoint');b.go('cleanOuterB');b.d.act();b.frames(32);b.go('cleanControlB');b.d.act();b.frames(230);assert(b.d.state.cleaned.B);assert(!b.d.state.cleaned.A);
 console.log('PASS: one stair; all three classes; class required before admission; session class restore; both decon chambers; automatic closure in both directions; occupied-door safety; all approaches; 844×390 DPR3.');
})().catch(e=>{console.error(e);process.exitCode=1});
