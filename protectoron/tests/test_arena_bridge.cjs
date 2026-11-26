const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookId = 'arena-fixture-abcdefghijklmnopqrstuvwxyz';
const roster = [['Трибут','Статус участия','Класс'],['Мавуика','Участвует','Райдер']];
const registry = [['Имя персонажа','','','','Telegram ID'],['Мавуика','','','','321']];
const start = ['Стартовый D20',18,'Рюкзак',false,'Оружие','','Сверка','',''];
const inventory = Array.from({length:17},()=>['','']);
let batches = 0;
const formulas = Array.from({length:17},()=>['','']);
const sheet = {
  getSheetId:()=>2108,
  getRange(address) {
    if (address === 'A5:I5') return {getValues:()=>[start.slice()]};
    if (address === 'E9:F9') return {getValues:()=>[['Предмет','Количество']]};
    assert.equal(address,'E10:F26');
    return {getValues:()=>inventory.map(row=>row.slice()), getFormulas:()=>formulas};
  }
};
const context = vm.createContext({
  registry_:()=>({rows:registry}), key_:s=>String(s).trim().toLowerCase(), locked_:fn=>fn(),
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='ARENA_SPREADSHEET_ID'?bookId:null})},
  SpreadsheetApp:{openById:id=>{
    assert.equal(id,bookId);
    return {getSheetByName:n=>n==='Трибуты'
      ? {getLastRow:()=>17,getRange:()=>({getValues:()=>roster})}
      : n==='Мавуика'?sheet:null};
  }},
  Sheets:{Spreadsheets:{batchUpdate:(data,id)=>{
    assert.equal(id,bookId);
    batches++;
    for (const {updateCells:{start:target,rows}} of data.requests) {
      const row = target.rowIndex === 4 ? start : inventory[target.rowIndex-9];
      const offset = target.rowIndex === 4 ? target.columnIndex : target.columnIndex-4;
      for (const [i,c] of rows[0].values.entries()) {
        row[offset+i] = Object.values(c.userEnteredValue || {})[0] ?? '';
      }
    }
  }}}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','arena.gs'),'utf8'),context);

const list = roll => [...context.arenaChoices_(roll)];
for (const [rolls,expected] of [
  [[1,4],['leave']],[[5,7],['cleaver','leave']],[[8,10],['pack','leave']],
  [[11,14],['pack','machete','pike','leave']],
  [[15,17],['pack-machete','pack-pike','sickle','hook','leave']],
  [[18,20],['pack-sickle','pack-hook','leave']]
]) for (const roll of rolls) assert.deepEqual(list(roll),expected);

const state = (telegram_id='321') => context.arenaDispatch_({action:'arena_state',telegram_id});
const confirm = (choice,roll=18) => context.arenaDispatch_({action:'arena_confirm',telegram_id:'321',choice,roll});

assert.throws(()=>state('123'),/arena_identity/);
assert.throws(()=>confirm('pack-hook',17),/arena_roll_changed/);
assert.throws(()=>confirm('sickle'),/arena_invalid_choice/);
assert.equal(batches,0);
start[1] = '';
assert.equal(state().options.length,0);
start[1] = 18;

inventory[0] = ['Стимпак',1];
formulas[1][0] = '=""';
const issued = confirm('pack-hook');
assert.equal(issued.chosen.weapon.id,'hook');
assert.equal(issued.chosen.items.length,7);
assert.equal(batches,1);
assert.deepEqual(inventory[0],['Стимпак',1]);
assert.deepEqual(inventory[1],['','']);
assert.deepEqual(inventory[2],['Рюкзак',1]);
assert.deepEqual(inventory[8],['Заряд для багра',2]);
assert.equal(start[8],'pack-hook');
assert.equal(confirm('pack-hook').chosen.id,'pack-hook');
assert.throws(()=>confirm('pack-sickle'),/arena_chosen/);
assert.equal(batches,1);

start[1]=3;start[3]=false;start[5]='';start[8]='';
assert.equal(confirm('leave',3).chosen.items.length,0);
assert.equal(start[8],'leave');
assert.equal(batches,2);
