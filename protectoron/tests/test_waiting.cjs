const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(){this.children=[];this.events={};this.open=false;this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  addEventListener(type,listener){this.events[type]=listener;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const elements = new Map();
const get = id => {if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const context = vm.createContext({$:get,document:{createElement:()=>new Element()},requests:[],waitingRequestId:null});
const source = fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('function showWaiting('),source.indexOf('\nsetInterval(')),context);
const request = {id:'report-1',kind:'companion',recipient_name:'Цифер',degree:2,status:'pending'};
context.requests=[request];
context.renderRequests();
assert.equal(get('requests-list').children[0].children[2].textContent,'Ожидайте');
context.showWaiting(request.id);
assert.equal(get('waiting-dialog').open,true);
assert.equal(get('waiting-recipient').textContent,'Получатель: Цифер');
context.updateWaiting();
assert.match(get('robot-speech').textContent,/Ваш рапорт принят на рассмотрение/);
request.status='approved';context.renderRequests();
assert.equal(get('waiting-dialog').open,false);
assert.equal(get('requests-list').children[0].children[2].textContent,'Получить препарат');
assert.match(get('companion-status').textContent,/согласована/);
context.showWaiting(request.id);
assert.equal(get('waiting-dialog').open,false);
request.status='pending';context.showWaiting(request.id);
get('waiting-minimize').events.click();
assert.equal(get('waiting-dialog').open,false);
context.renderRequests();
assert.equal(get('waiting-dialog').open,false,'Polling must not reopen a minimized window');
request.status='rejected';context.renderRequests();
assert.match(get('companion-status').textContent,/не согласована/);
assert.equal(get('requests-list').children[0].children.length,2,'Rejected requests cannot be collected');
assert.doesNotMatch(JSON.stringify(get('requests-list').children),/ГМ|доза/);
request.status='issued';context.renderRequests();
assert.equal(get('requests-list').children.length,0,'Completed collection belongs in history, not active requests');
assert.equal(context.requests[0].status,'issued','Hiding a completed card must not delete its record');
context.requests.push({...request,id:'report-2',status:'pending'});context.renderRequests();
assert.equal(get('requests-list').children.length,1,'A new report for the same recipient remains available');
assert.equal(get('requests-list').children[0].children[2].textContent,'Ожидайте');
assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),/ГМ|Dossier|КАССЕТА|\bвам\b/u);
console.log('Waiting window: pending, approved, minimized and rejected states verified');
