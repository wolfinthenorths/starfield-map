/** Protectoron: signed, bounded shop; balance and receipt commit atomically. */
const SHOP_PERKS = [{"id":"twice_learned_chemist","name":"Дважды учёный","group":"class","cost":0,"class":"Житель"},{"id":"strong_back","name":"Крепкая спина","group":"class","cost":0,"class":"Райдер"},{"id":"survivalist_rooted","name":"Выживальщик","group":"class","cost":0,"class":"Гуль"},{"id":"light_step","name":"Легкий шаг","group":"small","cost":2,"class":null},{"id":"quick_hands","name":"Быстрые руки","group":"small","cost":2,"class":null},{"id":"quiet_step","name":"Тихий шаг","group":"small","cost":2,"class":null},{"id":"silver_tongue","name":"Золотой язык","group":"small","cost":2,"class":null},{"id":"technical_ingenuity","name":"Техническая смекалка","group":"small","cost":2,"class":null},{"id":"sharp_eye","name":"Острый глаз","group":"small","cost":2,"class":null},{"id":"team_player","name":"Командный игрок","group":"small","cost":2,"class":null},{"id":"science","name":"Наука!","group":"small","cost":2,"class":null},{"id":"keeper_of_knowledge","name":"Хранитель знаний","group":"small","cost":2,"class":null},{"id":"tracker","name":"Следопыт","group":"small","cost":2,"class":null},{"id":"lead_belly","name":"Крепкий желудок","group":"small","cost":2,"class":null},{"id":"entomologist","name":"Знаток насекомых","group":"small","cost":2,"class":null},{"id":"animal_friend","name":"Друг животных","group":"small","cost":2,"class":null},{"id":"star_of_the_airwaves","name":"Звезда эфира","group":"small","cost":2,"class":null},{"id":"pickpocket","name":"Карманник","group":"small","cost":2,"class":null},{"id":"bloody_mess","name":"Кровавое месиво","group":"large","cost":6,"class":null},{"id":"life_giver","name":"Дарующий жизнь","group":"large","cost":4,"class":null},{"id":"four_leaf_clover","name":"Четырехлистный клевер","group":"large","cost":4,"class":null},{"id":"jack_of_all_trades","name":"Мастер на все руки","group":"large","cost":4,"class":null},{"id":"ghost","name":"Призрак","group":"large","cost":4,"class":null}];
const LEDGER_HEADERS = ["Персонаж","Перк","Получение","Очков списано","Баланс после","Когда (Томск)","Telegram","ID операции","ID персонажа","ID перка","Способ","UTC (секунды)","Telegram ID","Выбранные навыки","Баланс до"];

const REGISTRY_ID = '11gCokfUZUwcRDikt64StzzdDfFMJjjgdlg3hECGTvkU';
const SHOP_REVISION = '3f6d8eef73fa8f8e';
const REGISTRY_TAB = 'Лист1';
const CONNECTION_TAB = '_Робот_связь';
const LEDGER_TAB = 'Перки';
const CLASS_SKILLS = ['Анализ','История','Расследование','Инженерия','Медицина','Убеждение'];
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function same_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference=0;
  for(let i=0;i<a.length;i++) difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
function key_(value) {
  return String(value).normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
}
function doGet() { return json_({ok:true,service:'protectoron-sheets',version:2}); }
function doPost(e) {
  try {
    const body=e&&e.postData&&e.postData.contents;
    if(!body||body.length>8192) throw new Error('invalid_request');
    const request=JSON.parse(body);
    const secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if(!secret||secret.length<32) throw new Error('not_configured');
    if(!Number.isSafeInteger(request.timestamp)||Math.abs(Date.now()-request.timestamp)>60000) throw new Error('expired_request');
    if(typeof request.payload!=='string'||request.payload.length>4096) throw new Error('invalid_request');
    const signature=Utilities.computeHmacSha256Signature(String(request.timestamp)+'\n'+request.payload,secret,Utilities.Charset.UTF_8)
      .map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    if(!same_(signature,request.signature)) throw new Error('unauthorized');
    const payload=JSON.parse(request.payload);
    if(String(payload.action||'').startsWith('market_')&&typeof marketDispatch_==='function')return json_(marketDispatch_(payload));
    if(payload.action==='verify_connection') return json_(verifyConnection());
    if(payload.action==='balance') return json_(balance_(payload.character));
    if(payload.action==='shop_state') return json_(shopState(payload.character));
    if(payload.action==='acquire_perk') return json_(acquirePerk(payload));
    throw new Error('unsupported_action');
  } catch(error) {
    const allowed=['invalid_request','not_configured','expired_request','unauthorized','unsupported_action',
      'registry_missing','registry_schema_changed','registry_too_large','ledger_missing','ledger_schema_changed',
      'ledger_too_large','invalid_character','ambiguous_character','character_not_found','character_id_missing',
      'duplicate_character_id','invalid_balance','balance_formula','unknown_perk','already_owned','id_conflict',
      'invalid_mode','not_enough_points','level_unknown','no_free_choice','small_only','invalid_class',
      'invalid_skills','write_check_failed','catalog_mismatch'];
    return json_({ok:false,error:allowed.includes(error.message)?error.message:'bridge_error'});
  }
}
function registry_() {
  const book=SpreadsheetApp.openById(REGISTRY_ID),sheet=book.getSheetByName(REGISTRY_TAB);
  if(!sheet) throw new Error('registry_missing');
  if(sheet.getLastRow()>1000) throw new Error('registry_too_large');
  const rows=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),8).getValues();
  if(key_(rows[0][0])!=='имя персонажа'||key_(rows[0][5])!=='очки навыков'||
     key_(rows[0][6])!=='уровень персонажа'||key_(rows[0][7])!=='id персонажа') throw new Error('registry_schema_changed');
  return {book,sheet,rows};
}
function ledger_(book) {
  const sheet=book.getSheetByName(LEDGER_TAB);
  if(!sheet) throw new Error('ledger_missing');
  if(sheet.getLastRow()>25000) throw new Error('ledger_too_large');
  const rows=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),15).getValues();
  if(LEDGER_HEADERS.some((header,i)=>rows[0][i]!==header)) throw new Error('ledger_schema_changed');
  return {sheet,rows:rows.slice(1).filter(row=>row[7])};
}
function assignIds_(registry) {
  const seen=new Set(),requests=[];
  registry.rows.slice(1).forEach((row,index)=>{
    if(!String(row[0]).trim()) return;
    let id=String(row[7]).trim();
    if(!id) {
      id=Utilities.getUuid();row[7]=id;
      requests.push({updateCells:{range:{sheetId:registry.sheet.getSheetId(),startRowIndex:index+1,endRowIndex:index+2,startColumnIndex:7,endColumnIndex:8},
        rows:[{values:[{userEnteredValue:{stringValue:id}}]}],fields:'userEnteredValue'}});
    }
    if(!/^[A-Za-z0-9_-]{8,80}$/.test(id)||seen.has(id)) throw new Error('duplicate_character_id');
    seen.add(id);
  });
  if(requests.length) Sheets.Spreadsheets.batchUpdate({requests},REGISTRY_ID);
}
function entry_(registry,name) {
  if(typeof name!=='string'||!name.trim()||name.length>120) throw new Error('invalid_character');
  const matches=registry.rows.map((row,index)=>({row,index})).slice(1).filter(item=>key_(item.row[0])===key_(name));
  if(matches.length!==1) throw new Error(matches.length?'ambiguous_character':'character_not_found');
  const item=matches[0],row=item.row,id=String(row[7]).trim();
  if(!id) throw new Error('character_id_missing');
  const live=typeof sysEnabled_==='function'&&sysEnabled_()?sysProgress_(String(row[0]).trim(),id):null;
  const points=live?live.points:row[5],level=live?live.level:row[6];
  return {id,name:String(row[0]).trim(),kind:key_(live?live.kind:row[1]),index:item.index,
    points:typeof points==='number'&&Number.isSafeInteger(points)&&points>=0?points:null,
    level:typeof level==='number'&&Number.isSafeInteger(level)&&level>=0&&level<=9?level:null,
    formula:live?false:Boolean(registry.sheet.getRange(item.index+1,6).getFormula())};
}
function receipt_(row) {
  return {id:String(row[7]),character_id:String(row[8]),character:String(row[0]),perk_id:String(row[9]),
    mode:String(row[10]),cost:row[3],balance_after:row[4]===''?null:row[4],created_at:row[11],
    user_id:String(row[12]),username:String(row[6]),skills:JSON.parse(row[13]||'[]')};
}
function state_(entry,receipts) {
  const owned=receipts.filter(item=>item.character_id===entry.id);
  const classPerk=SHOP_PERKS.find(item=>item.group==='class'&&key_(item.class)===entry.kind);
  const classReceipt=owned.find(item=>item.perk_id===classPerk?.id);
  const freeUsed=owned.filter(item=>item.mode==='free').length;
  return {ok:true,version:2,catalog_revision:SHOP_REVISION,character:entry.name,character_id:entry.id,points:entry.points,
    points_configured:entry.points!==null,points_editable:!entry.formula,level:entry.level,
    free_choices:entry.level===null?null:Math.max(0,entry.level-freeUsed),class_id:classPerk?.id||null,
    class_skills:classReceipt?.skills||[],owned:owned,can_acquire:Boolean(classPerk)};
}
function locked_(fn) {
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function verifyConnection() {
  return locked_(()=>{
    const registry=registry_();ledger_(registry.book);assignIds_(registry);
    let service=registry.book.getSheetByName(CONNECTION_TAB);
    if(!service) { service=registry.book.insertSheet(CONNECTION_TAB);service.hideSheet(); }
    const checkedAt=new Date().toISOString();
    service.getRange('A1:B2').setValues([['Служебная проверка соединения робота','Версия 2'],['Последняя проверка UTC',checkedAt]]);
    SpreadsheetApp.flush();
    if(service.getRange('B2').getValue()!==checkedAt) throw new Error('write_check_failed');
    return {ok:true,version:2,registry_ready:true,write_verified:true,shop_ready:true,
      characters:registry.rows.slice(1).filter(row=>String(row[0]).trim()).length};
  });
}
function shopState(name) {
  return locked_(()=>{
    const registry=registry_();assignIds_(registry);
    return state_(entry_(registry,name),ledger_(registry.book).rows.map(receipt_));
  });
}
function balance_(name) {
  const entry=entry_(registry_(),name);
  return {ok:true,points:entry.points,configured:entry.points!==null};
}
function acquirePerk(payload) {
  return locked_(()=>{
    if(payload.catalog_revision!==SHOP_REVISION) throw new Error('catalog_mismatch');
    if(typeof payload.request_id!=='string'||!/^[A-Za-z0-9:_-]{8,150}$/.test(payload.request_id)||
       !/^[1-9]\d{0,19}$/.test(String(payload.user_id))||typeof payload.username!=='string'||payload.username.length>64) throw new Error('invalid_request');
    const registry=registry_();assignIds_(registry);
    const entry=entry_(registry,payload.character),ledger=ledger_(registry.book),receipts=ledger.rows.map(receipt_);
    const perk=SHOP_PERKS.find(item=>item.id===payload.perk_id);
    if(!perk) throw new Error('unknown_perk');
    if(!['paid','free','class'].includes(payload.mode)) throw new Error('invalid_mode');
    const skills=payload.mode==='class'?(Array.isArray(payload.skills)?payload.skills.slice().sort():[]):[];
    if(payload.mode==='class'&&(perk.id!=='twice_learned_chemist'||entry.kind!=='житель'||
      skills.length!==2||new Set(skills).size!==2||skills.some(skill=>!CLASS_SKILLS.includes(skill)))) throw new Error('invalid_skills');
    const prior=receipts.find(item=>item.id===payload.request_id);
    if(prior) {
      if(prior.character_id!==entry.id||prior.perk_id!==perk.id||prior.mode!==payload.mode||
         prior.user_id!==String(payload.user_id)||JSON.stringify(prior.skills)!==JSON.stringify(skills)) throw new Error('id_conflict');
      return {ok:true,receipt:prior,state:state_(entry,receipts)};
    }
    const state=state_(entry,receipts);
    if(!state.can_acquire) throw new Error('invalid_class');
    if(state.owned.some(item=>item.perk_id===perk.id)) throw new Error('already_owned');
    let cost=0;
    if(payload.mode==='paid') {
      if(perk.group==='class') throw new Error('invalid_mode');
      if(entry.points===null) throw new Error('invalid_balance');
      if(entry.formula) throw new Error('balance_formula');
      cost=perk.cost;
      if(entry.points<cost) throw new Error('not_enough_points');
    } else if(payload.mode==='free') {
      if(perk.group!=='small') throw new Error('small_only');
      if(entry.level===null) throw new Error('level_unknown');
      if(state.free_choices<1) throw new Error('no_free_choice');
    } else if(perk.group!=='class') throw new Error('invalid_mode');
    const after=cost?entry.points-cost:entry.points,created=Math.floor(Date.now()/1000);
    const receipt={id:payload.request_id,character_id:entry.id,character:entry.name,perk_id:perk.id,
      mode:payload.mode,cost,balance_after:after,created_at:created,user_id:String(payload.user_id),username:payload.username,skills};
    const row=[entry.name,perk.name,{paid:'Покупка',free:'За уровень',class:'Классовый'}[payload.mode],cost,
      after===null?'':after,Utilities.formatDate(new Date(created*1000),'Asia/Tomsk','dd.MM.yyyy HH:mm:ss'),
      payload.username,payload.request_id,entry.id,perk.id,payload.mode,created,String(payload.user_id),JSON.stringify(skills),
      entry.points===null?'':entry.points];
    const requests=[{appendCells:{sheetId:ledger.sheet.getSheetId(),rows:[{values:row.map(value=>({
      userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)},
      userEnteredFormat:{wrapStrategy:'WRAP',textFormat:{fontSize:10}}
    }))}],fields:'userEnteredValue,userEnteredFormat'}}];
    if(cost) requests.unshift({updateCells:{range:{sheetId:registry.sheet.getSheetId(),startRowIndex:entry.index,
      endRowIndex:entry.index+1,startColumnIndex:5,endColumnIndex:6},rows:[{values:[{userEnteredValue:{numberValue:after}}]}],fields:'userEnteredValue'}});
    // Sheets batchUpdate applies the debit and ownership receipt together, or neither.
    // A timeout is retried using the SAME request_id; the ledger resolves ambiguity.
    Sheets.Spreadsheets.batchUpdate({requests},REGISTRY_ID);
    entry.points=after;
    return {ok:true,receipt,state:state_(entry,receipts.concat(receipt))};
  });
}
