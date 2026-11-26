/** Nuclear Fallout event. Called only after the existing bridge verifies HMAC. */
const ARENA_WEAPONS = {
  cleaver: {name:'Рессорный тесак', damage:'1d8 + модификатор Силы', description:'Тяжёлый тесак из рессоры для ближнего боя. Работает без расходников.'},
  machete: {name:'Мачете «Кипарисовый клык»', damage:'1d8 + модификатор Силы', description:'Болотное мачете для ближнего боя. Перерезает сеть, лианы и другие лёгкие преграды.'},
  pike: {name:'Дорожная пика', damage:'1d8 + модификатор Силы', description:'Длинная пика достаёт дальше обычного клинка и помогает держать противника на расстоянии.'},
  sickle: {name:'Жатвенный резак «Серп»', damage:'2d6 + модификатор Силы', description:'Механический резак для ближнего боя. В комплекте одна топливная ампула на сцену боя.', supply:['Топливная ампула',1]},
  hook: {name:'Электрический багор «Ловец»', damage:'1d8 + 1', description:'Портовый багор для ближнего боя. Может сбить с ног цель у края или на скользкой поверхности. В комплекте два заряда.', supply:['Заряд для багра',2]}
};
function arenaBookId_() {
  const id = PropertiesService.getScriptProperties().getProperty('ARENA_SPREADSHEET_ID');
  if (!id || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw new Error('not_configured');
  return id;
}
function arenaReady_() {
  try {
    const roster = SpreadsheetApp.openById(arenaBookId_()).getSheetByName('Трибуты');
    return Boolean(roster && roster.getRange('A4').getValue() === 'Трибут');
  } catch (error) {
    return false;
  }
}
const ARENA_PACK = [
  ['Фляга очищенной воды',1], ['Сухпаёк',2], ['Перевязочный пакет',1], ['Карманный фонарь',1]
];

function arenaChoices_(roll) {
  const withPack = ['pack-sickle','pack-hook'];
  const medium = ['machete','pike'];
  if (roll >= 18) return [...withPack,'leave'];
  if (roll >= 15) return ['pack-machete','pack-pike','sickle','hook','leave'];
  if (roll >= 11) return ['pack',...medium,'leave'];
  if (roll >= 8) return ['pack','leave'];
  if (roll >= 5) return ['cleaver','leave'];
  return ['leave'];
}

function arenaKit_(id) {
  const backpack = id === 'pack' || id.startsWith('pack-');
  const weaponId = backpack ? id.slice(5) : id;
  const weapon = Object.prototype.hasOwnProperty.call(ARENA_WEAPONS,weaponId) ? {...ARENA_WEAPONS[weaponId],id:weaponId} : null;
  let label = weapon ? weapon.name : 'Уйти без добычи';
  if (backpack) label = weapon ? 'Рюкзак + ' + weapon.name : 'Рюкзак';
  const items = backpack ? [['Рюкзак',1],...ARENA_PACK] : [];
  if (weapon) items.push([weapon.name,1]);
  if (weapon && weapon.supply) items.push(weapon.supply);
  return {id,label,backpack,weapon,items};
}

function arenaRecord_(telegramId) {
  if (typeof telegramId !== 'string' || !/^\d{1,20}$/.test(telegramId)) throw new Error('invalid_request');
  const registry = registry_();
  if (key_(registry.rows[0][4]) !== 'telegram id') throw new Error('arena_schema');
  const owned = new Set(registry.rows.slice(1).filter(row => row[0] && String(row[4]).trim() === telegramId)
    .map(row => key_(row[0])));
  if (!owned.size) throw new Error('arena_identity');

  const bookId = arenaBookId_();
  const book = SpreadsheetApp.openById(bookId);
  const roster = book.getSheetByName('Трибуты');
  if (!roster || roster.getLastRow() > 100) throw new Error('arena_schema');
  const rows = roster.getRange('A4:C13').getValues();
  if (rows[0][0] !== 'Трибут' || rows[0][1] !== 'Статус участия') throw new Error('arena_schema');
  const matched = rows.slice(1).filter(row => row[0] && owned.has(key_(row[0])));
  if (matched.length > 1) throw new Error('arena_identity');
  if (!matched.length) throw new Error('arena_ineligible');

  const [name,status] = matched[0];
  if (registry.rows.slice(1).filter(row => key_(row[0]) === key_(name)).length !== 1) {
    throw new Error('arena_identity');
  }
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('arena_schema');
  return {name,sheet,bookId,closed:['Выбыл','Победитель'].includes(status),...arenaSheetState_(sheet)};
}

function arenaSheetState_(sheet) {
  const start = sheet.getRange('A5:I5').getValues()[0];
  const headers = sheet.getRange('E9:F9').getValues()[0];
  if (start[0] !== 'Стартовый D20' || headers[0] !== 'Предмет' || headers[1] !== 'Количество') {
    throw new Error('arena_schema');
  }
  const roll = Number.isSafeInteger(start[1]) && start[1] >= 1 && start[1] <= 20 ? start[1] : null;
  const receipt = start[8];
  if (receipt && !arenaChoices_(20).concat(arenaChoices_(17),arenaChoices_(14),arenaChoices_(7)).includes(receipt)) {
    throw new Error('arena_schema');
  }
  return {roll,receipt,manualChoice:Boolean(start[3] || start[5])};
}

function arenaPublic_(record) {
  const {name,roll,receipt,closed,manualChoice} = record;
  return {ok:true,character:name,roll,chosen:receipt ? arenaKit_(receipt) : null,
    options:roll && !receipt && !closed && !manualChoice ? arenaChoices_(roll).map(arenaKit_) : [],
    closed,manualChoice:manualChoice && !receipt};
}

function arenaWrite_(sheet,row,column,values) {
  return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:column-1},
    rows:[{values:values.map(value => {
      if (value === '') return {};
      const type = typeof value === 'boolean' ? 'boolValue' : typeof value === 'number' ? 'numberValue' : 'stringValue';
      return {userEnteredValue:{[type]:value}};
    })}],fields:'userEnteredValue'}};
}

function arenaDispatch_(payload) {
  if (payload.action === 'arena_state') return arenaPublic_(arenaRecord_(payload.telegram_id));
  return locked_(() => arenaClaim_(arenaRecord_(payload.telegram_id),payload));
}

function arenaClaim_(record,payload) {
  const {sheet,roll,receipt,closed,manualChoice} = record;
  if (receipt) {
    if (receipt !== payload.choice) throw new Error('arena_chosen');
    return arenaPublic_(record);
  }
  if (closed) throw new Error('arena_ineligible');
  if (manualChoice) throw new Error('arena_chosen');
  if (roll === null || payload.roll !== roll) throw new Error('arena_roll_changed');
  if (!arenaChoices_(roll).includes(payload.choice)) throw new Error('arena_invalid_choice');

  const kit = arenaKit_(payload.choice);
  const range = sheet.getRange('E10:F26');
  const slots = range.getValues();
  const formulas = range.getFormulas();
  const empty = slots.map((row,index) => row.every(value => value === '') && formulas[index].every(value => value === '') ? index + 10 : null)
    .filter(row => row !== null);
  if (kit.items.length > empty.length) throw new Error('arena_inventory_full');

  const requests = kit.items.map((item,index) => arenaWrite_(sheet,empty[index],5,item));
  requests.push(arenaWrite_(sheet,5,4,[kit.backpack]),
    arenaWrite_(sheet,5,6,[kit.weapon ? kit.weapon.name : '']),arenaWrite_(sheet,5,9,[kit.id]));
  Sheets.Spreadsheets.batchUpdate({requests},record.bookId);
  return arenaPublic_({...record,receipt:kit.id});
}
