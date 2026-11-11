'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const bridge = fs.readFileSync('sheets-bridge.gs','utf8') + '\n' + fs.readFileSync('achievements.gs','utf8');
const controllerId = '11gCokfUZUwcRDikt64StzzdDfFMJjjgdlg3hECGTvkU';
const bankId = '1iuFkiLPEaA770-iBCLJKuHaLkCY-_43GpY4xcrcwaX4';
const roster = [
  ['Имя персонажа','Класс','Степень','Telegram-аккаунт','Telegram ID','Очки навыков','Уровень персонажа','ID персонажа'],
  ['Первый','Житель','','',101,3,1,'controller-one'],
  ['Второй','Гуль','','','202',4,2,'controller-two']
];
const baseBalance = n => '=IF(B'+n+'="",$C$20,B'+n+')+D'+n+'+F'+n+'+H'+n+'-I'+n;
const awardFormula = n => '=IF(K'+n+'="","",SUMIF(\'_Суммы_ачивок\'!$A$2:$A,K'+n+',\'_Суммы_ачивок\'!$B$2:$B))';
const bankHeaders = ['Участники','','','','','','','','Покупки на Блошином рынке','Итого','ID персонажа','Ачивки'];

function fixture() {
  const books = new Map([[controllerId,new Map()],[bankId,new Map()]]);
  let locked = false;
  let rejectCredit = false;
  let rejectFinalization = false;

  function sheet(book, id, name, rows) {
    const formulas = [];
    const values = structuredClone(rows);
    const range = (row,col,height=1,width=1) => ({
      getValue: () => values[row-1]?.[col-1] ?? '',
      getValues: () => grid(values,row,col,height,width),
      getFormulas: () => grid(formulas,row,col,height,width)
    });
    const result = {id,values,formulas,getRange:range,getSheetId:() => id,
      getLastRow:() => values.length,getMaxRows:() => 1000};
    books.get(book).set(name,result);
    return result;
  }

  function grid(data,row,col,height,width) {
    return Array.from({length:height},(_,r) => Array.from({length:width},(_,c) => data[row+r-1]?.[col+c-1] ?? ''));
  }

  const context = vm.createContext({
    SpreadsheetApp: {openById:id => ({getSheetByName:name => books.get(id).get(name)})},
    LockService: {getScriptLock:() => ({
      tryLock() { assert.equal(locked,false); locked = true; return true; },
      releaseLock() { assert.equal(locked,true); locked = false; }
    })},
    Sheets: {Spreadsheets: {
      batchUpdate({requests},book) {
        assert.equal(locked,true);
        if (book === bankId && rejectCredit) { rejectCredit = false; throw Error('credit failed'); }
        if (book === controllerId && rejectFinalization && requests.some(r => r.updateCells?.start.sheetId === 3 &&
            r.updateCells?.start.columnIndex === 9)) {
          rejectFinalization = false;
          throw Error('finalization failed');
        }
        for (const request of requests) {
          const update = request.updateCells, append = request.appendCells;
          const target = [...books.get(book).values()].find(s => s.id === (update?.start.sheetId ?? append?.sheetId));
          assert.ok(target);
          const row = update ? update.start.rowIndex : target.values.length;
          const col = update ? update.start.columnIndex : 0;
          (update ?? append).rows.forEach(({values},i) => values.forEach((cell,j) => {
            const value = cell.userEnteredValue ?? {};
            target.values[row+i] ??= [];
            target.formulas[row+i] ??= [];
            target.formulas[row+i][col+j] = value.formulaValue ?? '';
            target.values[row+i][col+j] = value.numberValue ?? value.stringValue ?? value.boolValue ?? '';
          }));
        }
        if (book === bankId) {
          const amounts = new Map(totals.values.slice(1));
          bank.values.slice(1).forEach((row,i) => {
            if (bank.formulas[i+1][11]) row[11] = amounts.get(row[10]) ?? 0;
            row[9] = 350 - row[8] + (row[11] || 0);
          });
        }
      },
      Values: {get(id,range) {
        assert.equal(id,bankId);
        assert.match(range,/^'Крышки'!J2:L/);
        return {values:bank.getRange(2,10,bank.values.length-1,3).getValues()};
      }}
    }}
  });
  vm.runInContext(bridge,context);
  const header = name => vm.runInContext(name,context);
  const characters = sheet(controllerId,0,'Лист1',roster);
  const inputs = sheet(controllerId,1,'Ачивки',[header('ACH_INPUT_HEADERS')]);
  const catalog = sheet(controllerId,2,'Каталог ачивок',[header('ACH_CATALOG_HEADERS'),
    ['ach-001','Вход разрешён','Опубликовать анкету','Анкеты',25,'once'],
    ['ach-037','Дело закрыто','Завершить главу','Главы',25,'chapter']]);
  const ledger = sheet(controllerId,3,'_Выданные_ачивки',[header('ACH_LEDGER_HEADERS')]);
  const bank = sheet(bankId,4,'Крышки',[bankHeaders,
    ['Первый','','','','','','','',30,320,'bank-character-one',0],
    ['Второй','','','','','','','',10,340,'bank-character-two',0]]);
  bank.formulas[1] = Array(12).fill('');
  bank.formulas[1][9] = baseBalance(2)+'+N(L2)';
  bank.formulas[1][11] = awardFormula(2);
  bank.formulas[2] = Array(12).fill('');
  bank.formulas[2][9] = baseBalance(3);
  bank.values[2][11] = '';
  const totals = sheet(bankId,5,'_Суммы_ачивок',[header('ACH_TOTAL_HEADERS')]);

  return {
    context,characters,inputs,catalog,ledger,bank,totals,
    issue(name,achievement,chapter='') { inputs.values.push([name,achievement,chapter,'',true]); },
    failCredit() { rejectCredit = true; },
    failFinalization() { rejectFinalization = true; },
    state: id => context.achState_(id),
    sync: () => context.achSync_()
  };
}

const f = fixture();
f.issue('Первый','Вход разрешён');
f.issue('Первый','Вход разрешён');
f.issue('Второй','Дело закрыто',2.1);
assert.equal(f.sync().posted,1);
assert.equal(f.inputs.values[1][5],'Выдано');
assert.equal(f.inputs.values[2][5],'Уже выдано');
assert.equal(f.inputs.values[3][5],'Укажите номер целой главы');
assert.equal(f.bank.values[1][11],25);
assert.equal(f.bank.values[1][9],345);
assert.equal(f.bank.values[1][8],30);
assert.equal(f.state('101').achievements[0].name,'Вход разрешён');
assert.equal(f.state('202').achievements.length,0);
assert.equal(f.state('404').character,null);

f.issue('Второй','Дело закрыто',1);
f.issue('Второй','Дело закрыто',2);
f.issue('Второй','Дело закрыто',1);
f.failCredit();
assert.throws(() => f.sync(),/credit failed/);
assert.equal(f.state('202').achievements.length,0);
assert.equal(f.bank.values[2][9],340);
f.failFinalization();
assert.throws(() => f.sync(),/finalization failed/);
assert.equal(f.bank.values[2][11],50);
assert.equal(f.bank.values[2][9],390);
assert.equal(f.bank.values[2][8],10);
assert.equal(f.state('202').achievements.length,0);
assert.equal(f.sync().posted,2);
assert.equal(f.sync().posted,0);
assert.deepEqual(Array.from(f.state('202').achievements,a => a.chapter),[2,1]);
assert.equal(f.bank.values[2][11],50);
assert.equal(f.ledger.values.length,4);
assert.equal(f.state('101').achievements.length,1);

f.catalog.values[1][4] = 60;
f.characters.values[1][0] = 'Первый после смены имени';
f.issue('Первый после смены имени','Вход разрешён');
assert.equal(f.sync().posted,0);
assert.equal(f.state('101').character,'Первый после смены имени');
assert.equal(f.state('101').achievements[0].caps,25);
assert.equal(f.bank.values[1][11],25);
f.characters.values[2][4] = 101;
assert.throws(() => f.state('101'),/achievements_identity/);
console.log('Achievements: confirmed owners, repeatable chapters, frozen rewards and recovery without double credits verified');
