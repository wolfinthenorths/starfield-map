'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const code=fs.readFileSync('sheets-bridge.gs','utf8');
const revision=require('../public/perks.json');
const core=revision.perks.map(p=>Object.fromEntries(['id','name','group','cost','class'].map(k=>[k,p[k]])));
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,16);
const headers=['Персонаж','Перк','Получение','Очков списано','Баланс после','Когда (Томск)','Telegram','ID операции','ID персонажа','ID перка','Способ','UTC (секунды)','Telegram ID','Выбранные навыки','Баланс до'];
function fixture(points=10,level=2,kind='Гуль'){
  const sheets=new Map();let locked=false,sequence=0,batches=0,failNext=false;
  class Sheet{
    constructor(name,id,data){this.name=name;this.id=id;this.data=data;this.formula=false;sheets.set(name,this);}
    getSheetId(){return this.id;}
    getLastRow(){return this.data.length;}
    hideSheet(){}
    getRange(row,col,count=1,width=1){
      if(typeof row==='string'){if(row==='A1:B2'){row=1;col=1;count=2;width=2;}else if(row==='B2'){row=2;col=2;}else throw Error('unexpected range');}
      const self=this;
      return {getValues:()=>Array.from({length:count},(_,r)=>Array.from({length:width},(_,c)=>self.data[row-1+r]?.[col-1+c]??'')),
        getFormula:()=>self.formula?'=10':'',getValue:()=>self.data[row-1]?.[col-1]??'',setValues(values){for(let r=0;r<count;r++){self.data[row-1+r]??=[];for(let c=0;c<width;c++)self.data[row-1+r][col-1+c]=values[r][c];}}};
    }
  }
  const roster=new Sheet('Лист1',0,[['Имя персонажа ','Класс','Степень ','Telegram-аккаунт','Telegram ID','Очки  Навыков','Уровень персонажа','ID персонажа'],['Цифер',kind,'II','','',points,level,'character-cipher']]);
  const ledger=new Sheet('Перки',1,[headers]);
  const book={getSheetByName:name=>sheets.get(name),insertSheet:name=>new Sheet(name,sheets.size,[])};
  function batch({requests}){
    assert(locked,'all mutations must hold the script lock');batches++;
    if(failNext){failNext=false;throw Error('simulated failure');}
    // Validate and apply to copies; a batch either commits everything or nothing.
    const draft=new Map(Array.from(sheets.values(),s=>[s.id,structuredClone(s.data)]));
    for(const req of requests){
      if(req.updateCells){const r=req.updateCells,grid=draft.get(r.range.sheetId);assert(grid);assert.equal(r.rows.length,r.range.endRowIndex-r.range.startRowIndex);for(let i=0;i<r.rows.length;i++){const at=r.range.startRowIndex+i;grid[at]??=[];for(let j=0;j<r.rows[i].values.length;j++){const v=r.rows[i].values[j].userEnteredValue;grid[at][r.range.startColumnIndex+j]=v.numberValue??v.stringValue;}}}
      else if(req.appendCells){const r=req.appendCells,grid=draft.get(r.sheetId);assert(grid);for(const row of r.rows)grid.push(row.values.map(v=>v.userEnteredValue.numberValue??v.userEnteredValue.stringValue));}
      else throw Error('unexpected mutation');
    }
    for(const sheet of sheets.values())sheet.data=draft.get(sheet.id);
  }
  const context=vm.createContext({console,Date,Set,JSON,Number,String,Math,Error,
    SpreadsheetApp:{openById:id=>{assert.equal(id,'11gCokfUZUwcRDikt64StzzdDfFMJjjgdlg3hECGTvkU');return book;},flush(){}},
    Sheets:{Spreadsheets:{batchUpdate:batch}},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){assert(locked);locked=false;}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-key-'.repeat(8)})},
    Utilities:{Charset:{UTF_8:'utf8'},getUuid:()=>`character-new-${++sequence}`,formatDate:date=>date.toISOString(),computeHmacSha256Signature:(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest(),b=>b>127?b-256:b)},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}});
  vm.runInContext(code,context);
  let counter=0;
  const request=(perk='light_step',mode='paid',extra={})=>({catalog_revision:fingerprint,character:'Цифер',perk_id:perk,mode,request_id:`app:101:request-${++counter}`,user_id:'101',username:'@player',...extra});
  return {context,roster,ledger,request,get batches(){return batches;},fail(){failNext=true;}};
}
{
 const f=fixture(),req=f.request(),result=f.context.acquirePerk(req);
 assert.equal(f.roster.data[1][5],8);assert.equal(f.ledger.data.length,2);assert.equal(result.receipt.cost,2);
 const again=f.context.acquirePerk(req);assert.equal(again.receipt.id,result.receipt.id);assert.equal(f.ledger.data.length,2);assert.equal(f.roster.data[1][5],8);
 assert.throws(()=>f.context.acquirePerk(f.request()),/already_owned/);
 assert.throws(()=>f.context.acquirePerk({...req,user_id:'202'}),/id_conflict/);
 assert.equal(f.context.shopState('  ЦИФЕР ').owned.length,1);
}
{
 const f=fixture(5);assert.throws(()=>f.context.acquirePerk(f.request('bloody_mess')),/not_enough_points/);assert.equal(f.roster.data[1][5],5);assert.equal(f.ledger.data.length,1);
 const success=f.context.acquirePerk(f.request('life_giver'));assert.equal(success.receipt.cost,4);assert.equal(f.roster.data[1][5],1);
}
{
 const f=fixture(10,1);f.context.acquirePerk(f.request('light_step','free'));assert.equal(f.roster.data[1][5],10);assert.equal(f.context.shopState('Цифер').free_choices,0);
 assert.throws(()=>f.context.acquirePerk(f.request('quick_hands','free')),/no_free_choice/);
 f.roster.data[1][6]=2;f.context.acquirePerk(f.request('quick_hands','free'));assert.equal(f.roster.data[1][5],10);assert.equal(f.ledger.data[2][3],0);
 assert.throws(()=>f.context.acquirePerk(f.request('life_giver','free')),/small_only/);
}
{
 const f=fixture(10,'');assert.equal(f.context.shopState('Цифер').level,null);assert.throws(()=>f.context.acquirePerk(f.request('light_step','free')),/level_unknown/);f.context.acquirePerk(f.request());assert.equal(f.roster.data[1][5],8);
}
{
 const f=fixture('',1);assert.throws(()=>f.context.acquirePerk(f.request()),/invalid_balance/);f.context.acquirePerk(f.request('light_step','free'));assert.equal(f.roster.data[1][5],'');
}
{
 const f=fixture();f.roster.formula=true;assert.throws(()=>f.context.acquirePerk(f.request()),/balance_formula/);assert.equal(f.roster.data[1][5],10);
}
{
 const f=fixture();f.fail();assert.throws(()=>f.context.acquirePerk(f.request()),/simulated failure/);assert.equal(f.roster.data[1][5],10);assert.equal(f.ledger.data.length,1);
 const req=f.request();f.context.acquirePerk(req); // Simulate a lost HTTP response after this commit.
 f.context.acquirePerk(req);assert.equal(f.roster.data[1][5],8);assert.equal(f.ledger.data.length,2);
}
{
 const f=fixture();assert.throws(()=>f.context.acquirePerk({...f.request(),catalog_revision:'older'}),/catalog_mismatch/);assert.equal(f.roster.data[1][5],10);assert.equal(f.ledger.data.length,1);
 f.context.acquirePerk(f.request());f.roster.data[1][0]='Новое имя';assert.equal(f.context.shopState('Новое имя').owned.length,1);assert.equal(f.context.shopState('Новое имя').points,8);
}
{
 const f=fixture(10,0,'Житель');assert.throws(()=>f.context.acquirePerk(f.request('twice_learned_chemist','class',{skills:['Анализ','Анализ']})),/invalid_skills/);
 const req=f.request('twice_learned_chemist','class',{skills:['Медицина','Анализ']});f.context.acquirePerk(req);assert.equal(f.roster.data[1][5],10);assert.equal(f.context.shopState('Цифер').class_skills.length,2);assert.equal(f.ledger.data[1][3],0);
 assert.throws(()=>f.context.acquirePerk(f.request('strong_back','paid')),/invalid_mode/);
}
{
 const f=fixture(),payload=JSON.stringify({action:'shop_state',character:'Цифер'}),timestamp=Date.now();const secret='test-key-'.repeat(8);
 const signature=crypto.createHmac('sha256',secret).update(timestamp+'\n'+payload).digest('hex');
 const signed={timestamp,payload,signature};const call=r=>JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(r)}}).value);
 assert.equal(call(signed).ok,true);assert.equal(call({...signed,signature:'wrong'}).error,'unauthorized');assert.equal(call({...signed,timestamp:timestamp-120000}).error,'expired_request');
 assert.equal(f.roster.data[1][5],10);
}
console.log('Shop ledger: atomic commit/failure, replay, duplicate ownership, balance, free levels, class choice, rename, signatures and catalog revision verified');
