const ACH_BANK_ID = '1iuFkiLPEaA770-iBCLJKuHaLkCY-_43GpY4xcrcwaX4';
const ACH_INPUT_HEADERS = ['Персонаж','Ачивка','Глава','Крышки','Выдать','Статус','Дата выдачи','Ключ'];
const ACH_CATALOG_HEADERS = ['ID ачивки','Ачивка','Описание','Раздел','Крышки','Выдача'];
const ACH_LEDGER_HEADERS = ['Ключ','ID Контроллера','ID в Крышках','ID ачивки','Ачивка','Описание','Глава','Крышки','UTC','Проведено'];
const ACH_TOTAL_HEADERS = ['ID персонажа','Ачивки'];
const ACH_ID = /^[A-Za-z0-9_-]{8,80}$/;
const ACH_ITEM_ID = /^ach-[0-9]{3,}$/;
const ACH_TG_ID = /^[1-9][0-9]{0,15}$/;

function achSheet_(book, title, headers) {
  const sheet = book.getSheetByName(title);
  if (!sheet || sheet.getLastRow() > 25000) throw new Error('achievements_schema');
  const rows = sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),headers.length).getValues();
  if (headers.some((header,i) => rows[0][i] !== header)) throw new Error('achievements_schema');
  return {sheet, rows:rows.slice(1)};
}

function achLedger_(book) {
  const ledger = achSheet_(book,'_Выданные_ачивки',ACH_LEDGER_HEADERS);
  const entries = new Map(), bankIds = new Map(), controllerIds = new Map();
  ledger.rows.forEach((values,i) => {
    const [key,character,bank,item,name,description,chapter,caps,utc,posted] = values;
    if (values.every(value => value === '')) return;
    if (![character+':'+item+':0',character+':'+item+':'+chapter].includes(key) || entries.has(key) ||
        !ACH_ID.test(character) || !ACH_ID.test(bank) || !ACH_ITEM_ID.test(item) ||
        typeof name !== 'string' || !name || typeof description !== 'string' ||
        !Number.isSafeInteger(caps) || caps < 0 || !Number.isSafeInteger(utc) || utc <= 0 ||
        typeof posted !== 'boolean' || (chapter !== '' && (!Number.isSafeInteger(chapter) || chapter < 1)) ||
        (bankIds.has(character) && bankIds.get(character) !== bank) ||
        (controllerIds.has(bank) && controllerIds.get(bank) !== character)) throw new Error('achievements_schema');
    bankIds.set(character,bank);
    controllerIds.set(bank,character);
    entries.set(key,{key,character,bank,item,name,description,chapter,caps,utc,posted,row:i+2});
  });
  return {sheet:ledger.sheet,lastRow:ledger.rows.length+1,entries,bankIds,controllerIds};
}

function achChapter_(value) {
  const parts = String(value).trim().match(/^([1-9][0-9]*)(?:[.,]([0-9]+))?$/);
  if (!parts) return null;
  const whole = Number(parts[1]);
  if (!Number.isSafeInteger(whole)) return null;
  const branch = parts[2] && !/^0+$/.test(parts[2]);
  return {whole, label:branch ? parts[1]+'.'+parts[2] : whole};
}

function achDateUtc_(value) {
  const seconds = value instanceof Date ? value.getTime()/1000
    : typeof value === 'number' ? (value-25569)*86400-7*3600 : 0;
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
}

function achState_(telegramId) {
  if (typeof telegramId !== 'string' || !ACH_TG_ID.test(telegramId)) throw new Error('invalid_request');
  const registry = registry_();
  if (key_(registry.rows[0][4]) !== 'telegram id') throw new Error('achievements_schema');
  const matched = registry.rows.slice(1).filter(row => row[0] && String(row[4]).trim() === telegramId);
  if (matched.length > 1) throw new Error('achievements_identity');
  if (!matched.length) return {ok:true,character:null,achievements:[]};
  const own = matched[0], id = String(own[7]);
  if (!ACH_ID.test(id) || registry.rows.slice(1).filter(row => String(row[7]) === id).length !== 1) {
    throw new Error('achievements_identity');
  }
  const achievements = Array.from(achLedger_(registry.book).entries.values())
    .filter(entry => entry.character === id && entry.posted)
    .sort((a,b) => b.utc-a.utc || b.row-a.row);
  const keys = new Set(achievements.map(entry => entry.key));
  const input = new Map(keys.size ? achSheet_(registry.book,'Ачивки',ACH_INPUT_HEADERS).rows
    .filter(row => keys.has(row[7])).map(row => [row[7],row]) : []);
  const cards = achievements.map(({key,item,name,description,chapter,caps,utc}) => {
    const row = input.get(key);
    const chosen = row && achChapter_(row[2]);
    return {id:item,name,description,caps,utc:(row && achDateUtc_(row[6])) || utc,
      chapter:chosen && chosen.whole === chapter ? chosen.label : chapter || null};
  });
  return {ok:true,character:String(own[0]).trim(),achievements:cards};
}

function achCells_(values) {
  return {values:values.map(value => {
    if (typeof value === 'number') return {userEnteredValue:{numberValue:value}};
    if (typeof value === 'boolean') return {userEnteredValue:{boolValue:value}};
    if (value === '') return {};
    return {userEnteredValue:{stringValue:value}};
  })};
}

function achUpdate_(sheet,row,column,values) {
  return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:column-1},
    rows:[achCells_(values)],fields:'userEnteredValue'}};
}

function achCatalog_(book) {
  const catalog = new Map(), ids = new Set();
  for (const [id,name,description,,caps,scope] of achSheet_(book,'Каталог ачивок',ACH_CATALOG_HEADERS).rows) {
    if (!id && !name) continue;
    const key = key_(name);
    if (!ACH_ITEM_ID.test(id) || !key || typeof description !== 'string' || !description ||
        !Number.isSafeInteger(caps) || caps < 0 || !['once','chapter'].includes(scope) ||
        catalog.has(key) || ids.has(id)) throw new Error('achievements_schema');
    catalog.set(key,{id,name,description,caps,scope});
    ids.add(id);
  }
  return catalog;
}

function achBank_(book) {
  const sheet = book.getSheetByName('Крышки');
  if (!sheet || sheet.getLastRow() > 1000) throw new Error('achievements_schema');
  const values = sheet.getRange(1,1,sheet.getLastRow(),12).getValues();
  if (values[0][9] !== 'Итого' || values[0][10] !== 'ID персонажа' || !['Ачивки','Достижения'].includes(values[0][11])) {
    throw new Error('achievements_schema');
  }
  const formulas = sheet.getRange(2,10,Math.max(1,values.length-1),3).getFormulas();
  return values.slice(1).flatMap((row,i) => {
    if (!row[0] || !row[10]) return [];
    const n = i+2, [balanceFormula,,awardFormula] = formulas[i];
    const suffix = '+N(L'+n+')';
    const balance = '=IF(B'+n+'="",$C$20,B'+n+')+D'+n+'+F'+n+'+H'+n+'-I'+n;
    const award = '=IF(K'+n+'="","",SUMIF(\'_Суммы_ачивок\'!$A$2:$A,K'+n+',\'_Суммы_ачивок\'!$B$2:$B))';
    const ready = balanceFormula.endsWith(suffix) && awardFormula === award &&
      Number.isSafeInteger(row[9]) && Number.isSafeInteger(row[11]);
    const missingBalance = balanceFormula === balance;
    const missingAward = !awardFormula && row[11] === '';
    const repairable = (missingBalance || balanceFormula.endsWith(suffix)) &&
      (missingAward || awardFormula === award) && Number.isSafeInteger(row[9]);
    return [{id:String(row[10]),name:key_(row[0]),row:n,sheet,ready,repairable,
      addBalance:missingBalance ? balance+suffix : null,addAward:missingAward ? award : null}];
  });
}

function achFormula_(sheet,row,column,formulaValue) {
  return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:column-1},
    rows:[{values:[{userEnteredValue:{formulaValue}}]}],fields:'userEnteredValue'}};
}

function achSync_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {ok:true,busy:true};
  try {
    return achSyncLocked_();
  } finally {
    lock.releaseLock();
  }
}

function achSyncLocked_() {
  const registry = registry_();
  const input = achSheet_(registry.book,'Ачивки',ACH_INPUT_HEADERS);
  const ledger = achLedger_(registry.book);
  const queued = input.rows.flatMap((values,i) => values[4] === true && !values[7] ? [{values,row:i+2}] : []);
  const waiting = new Map(input.rows.flatMap((values,i) => values[7] && values[5] === 'Начисляется' ? [[values[7],i+2]] : []));
  if (!queued.length && !Array.from(ledger.entries.values()).some(entry => !entry.posted)) return {ok:true,posted:0};

  const bank = SpreadsheetApp.openById(ACH_BANK_ID);
  const bankRows = achBank_(bank);
  const catalog = queued.length ? achCatalog_(registry.book) : new Map();
  const requests = [], added = [];
  for (const {values,row} of queued) {
    const [name,achievement,chapterInput] = values;
    const chapter = achChapter_(chapterInput)?.whole || '';
    const characters = registry.rows.slice(1).filter(item => item[0] && key_(item[0]) === key_(name));
    const character = characters.length === 1 ? String(characters[0][7]) : '';
    const item = catalog.get(key_(achievement));
    let problem;
    if (!ACH_ID.test(character) || registry.rows.slice(1).filter(row => String(row[7]) === character).length !== 1) {
      problem = 'Выберите персонажа';
    } else if (!item) {
      problem = 'Выберите ачивку';
    } else if ((chapterInput !== '' || item.scope === 'chapter') && !chapter) {
      problem = 'Укажите главу или ветку, например 1 или 1.3';
    }
    const key = item && character ? character+':'+item.id+':'+(item.scope === 'chapter' ? chapter : 0) : '';
    if (!problem && ledger.entries.has(key)) problem = 'Уже выдано';

    const savedBank = ledger.bankIds.get(character);
    const targets = bankRows.filter(item => savedBank ? item.id === savedBank : item.name === key_(name));
    const target = targets.length === 1 ? targets[0] : null;
    if (!problem && (!target || !ACH_ID.test(target.id) ||
        bankRows.filter(item => item.id === target.id).length !== 1 ||
        (ledger.controllerIds.has(target.id) && ledger.controllerIds.get(target.id) !== character))) {
      problem = 'Проверьте персонажа в «Крышках»';
    }
    if (!problem && !target.ready && !target.repairable) problem = 'Проверьте формулы в «Крышках»';
    if (problem) {
      requests.push(achUpdate_(input.sheet,row,5,[false,problem]));
      continue;
    }

    const utc = Math.floor(Date.now()/1000);
    const entry = {key,character,bank:target.id,item:item.id,name:item.name,description:item.description,
      chapter,caps:item.caps,utc,posted:false,row:ledger.lastRow+added.length+1};
    added.push(achCells_([key,character,target.id,item.id,item.name,item.description,chapter,item.caps,utc,false]));
    ledger.entries.set(key,entry);
    ledger.bankIds.set(character,target.id);
    ledger.controllerIds.set(target.id,character);
    waiting.set(key,row);
    requests.push(achUpdate_(input.sheet,row,4,[item.caps,true,'Начисляется']));
    requests.push(achUpdate_(input.sheet,row,8,[key]));
  }
  if (added.length) {
    requests.push({appendCells:{sheetId:ledger.sheet.getSheetId(),rows:added,fields:'userEnteredValue'}});
  }
  if (requests.length) Sheets.Spreadsheets.batchUpdate({requests},REGISTRY_ID);

  const pending = Array.from(ledger.entries.values()).filter(entry => !entry.posted);
  if (!pending.length) return {ok:true,posted:0};
  const totals = new Map();
  for (const entry of ledger.entries.values()) totals.set(entry.bank,(totals.get(entry.bank) || 0)+entry.caps);
  const exportSheet = achSheet_(bank,'_Суммы_ачивок',ACH_TOTAL_HEADERS);
  const exportRows = Array.from(totals,([id,caps]) => achCells_([id,caps]));
  if (totals.size < exportSheet.rows.length) throw new Error('achievements_schema');
  const credits = [{
    updateCells:{start:{sheetId:exportSheet.sheet.getSheetId(),rowIndex:1,columnIndex:0},
      rows:exportRows,fields:'userEnteredValue'}
  }];
  const needed = exportRows.length+1-exportSheet.sheet.getMaxRows();
  if (needed > 0) credits.unshift({appendDimension:{sheetId:exportSheet.sheet.getSheetId(),dimension:'ROWS',length:needed}});
  for (const target of bankRows.filter(row => row.repairable && !row.ready && pending.some(entry => entry.bank === row.id))) {
    if (target.addBalance) credits.push(achFormula_(target.sheet,target.row,10,target.addBalance));
    if (target.addAward) credits.push(achFormula_(target.sheet,target.row,12,target.addAward));
  }
  Sheets.Spreadsheets.batchUpdate({requests:credits},ACH_BANK_ID);

  const endRow = Math.max(2,...bankRows.map(row => row.row));
  const confirmed = Sheets.Spreadsheets.Values.get(ACH_BANK_ID,"'Крышки'!J2:L"+endRow,{valueRenderOption:'UNFORMATTED_VALUE'}).values || [];
  const updates = [];
  let posted = 0;
  for (const entry of pending) {
    const targets = confirmed.filter(row => String(row[1]) === entry.bank);
    if (targets.length !== 1 || !Number.isSafeInteger(targets[0][0]) || targets[0][2] !== totals.get(entry.bank)) continue;
    updates.push(achUpdate_(ledger.sheet,entry.row,10,[true]));
    const row = waiting.get(entry.key);
    if (row && input.sheet.getRange(row,8).getValue() === entry.key) {
      // Sheets stores date/time as days in its local time zone (Tomsk is UTC+7).
      const date = entry.utc/86400+25569+7/24;
      updates.push(achUpdate_(input.sheet,row,6,['Выдано']));
      if (input.sheet.getRange(row,7).getValue() === '') {
        updates.push(achUpdate_(input.sheet,row,7,[date]));
      }
    }
    posted++;
  }
  if (updates.length) Sheets.Spreadsheets.batchUpdate({requests:updates},REGISTRY_ID);
  return {ok:true,posted};
}
