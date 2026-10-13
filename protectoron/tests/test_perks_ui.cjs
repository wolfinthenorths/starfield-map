'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.className='';this.hidden=false;this.checked=false;this.disabled=false;this.open=false;this.textContent='';}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,fn){this.events[name]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  matches(selector){if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));if(selector==='input:checked')return this.tagName==='input'&&this.checked;if(selector==='input'||selector==='button')return this.tagName===selector;const m=selector.match(/^\[data-perk-id="(.+)"\]$/);return m?this.dataset.perkId===m[1]:false;}
  querySelectorAll(selector){const out=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))out.push(child);walk(child);}};walk(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const elements=new Map(),storage=new Map(),catalog=JSON.parse(fs.readFileSync('public/perks.json','utf8'));
const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
let calls=[],sequence=0,transport;
const context=vm.createContext({console,JSON,Math,Number,Array,Set,String,Error,
  document:{createElement:tag=>new Element(tag),querySelectorAll:()=>[],hidden:false},$,real:true,busy:false,
  ownCharacter:{name:'Цифер'},tg:{initDataUnsafe:{user:{id:101}}},freshKey:()=>`request-${++sequence}`,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  play(){},haptic(){},clearError(){},showError(){},setInterval(){},
  api:async(path,data)=>{calls.push({path,data});return transport(path,data);},
  sync:data=>context.syncPerks(data.shop)});
const source=fs.readFileSync('public/app.js','utf8');
vm.runInContext(source.slice(source.indexOf('let perkCatalog=null'),source.lastIndexOf('start();')),context);
function state(extra={}){return {character:'Цифер',character_id:'character-cipher',points:10,level:2,free_choices:2,
  class_id:'survivalist_rooted',class_skills:[],owned:[],can_acquire:true,points_editable:true,points_configured:true,...extra};}
context.catalog=catalog;vm.runInContext('perkCatalog=catalog;',context);
context.syncPerks(state());
assert.equal($('perk-level').textContent,'2');assert.equal($('perk-points').textContent,'10');assert.match($('perk-free-count').textContent,/2/);
const small=catalog.perks.find(p=>p.id==='light_step'),card=$('perk-catalog').querySelector('[data-perk-id="light_step"]');
card.open=true;context.syncPerks(state({points:0}));assert.equal($('perk-catalog').querySelector('[data-perk-id="light_step"]'),card);assert.equal(card.open,true);assert.equal(card.querySelector('.perk-buy').disabled,true);assert.equal(card.querySelector('.perk-free').disabled,false);
context.syncPerks(state({level:null,free_choices:null}));assert.equal(card.querySelector('.perk-free').disabled,true);assert.equal(card.querySelector('.perk-buy').disabled,false);
context.choosePerk(small,'paid');assert.equal($('perk-dialog').open,true);assert.equal($('perk-confirm').disabled,true);assert.equal(calls.length,0);
$('perk-cancel').events.click();assert.equal(calls.length,0);assert.equal($('perk-dialog').open,false);
context.choosePerk(small,'paid');$('perk-scene-confirm').checked=true;
transport=async()=>{throw Error('simulated lost response');};
(async()=>{
  await $('perk-confirm').events.click();
  const first=calls.find(c=>c.path==='perk-acquire').data.requestId;assert.equal($('perk-pending').hidden,false);assert.equal(storage.size,1);
  context.syncPerks(state());assert.equal(card.querySelector('.perk-buy').disabled,true);
  const purchased=state({points:8,owned:[{perk_id:'light_step',mode:'paid',cost:2,balance_after:8,created_at:1000,skills:[]}]});
  transport=async(path)=>path==='perks'?{shop:purchased}:{shop:purchased,perk_receipt:{perk_id:'light_step',character:'Цифер',mode:'paid',cost:2,balance_after:8,skills:[]}};
  await $('perk-retry').events.click();
  assert.equal(calls.filter(c=>c.path==='perk-acquire')[1].data.requestId,first);assert.equal(storage.size,0);assert.equal($('perk-points').textContent,'8');assert.equal(card.querySelector('.perk-actions').hidden,true);assert.match($('perk-result').textContent,/остаток — 8/);
  context.syncPerks(state({points:8,free_choices:1,owned:[{perk_id:'quick_hands',mode:'free',cost:0,balance_after:8,created_at:1001,skills:[]}]}));
  const freeCard=$('perk-catalog').querySelector('[data-perk-id="quick_hands"]');assert.match(freeCard.querySelector('.perk-ownership').textContent,/за уровень/);assert.equal($('perk-points').textContent,'8');
  context.syncPerks(state({class_id:'twice_learned_chemist',class_skills:[]}));
  const inputs=$('perk-class').querySelectorAll('input'),button=$('perk-class').querySelector('button');
  inputs[0].checked=true;inputs[0].events.change();assert.equal(button.disabled,true);inputs[1].checked=true;inputs[1].events.change();assert.equal(button.disabled,false);assert.equal(inputs[2].disabled,true);
  context.syncPerks(state({class_id:'twice_learned_chemist',class_skills:['Анализ','История']}));assert.equal($('perk-class').querySelectorAll('input').length,0);
  console.log('Perk UI: level/balance, independent free choice, stable cards, cancellation, durable replay and class skills verified');
})().catch(error=>{console.error(error);process.exitCode=1;});
