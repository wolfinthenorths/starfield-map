/** Protectoron bridge. No purchases or balance mutations in this version. */
const REGISTRY_ID = '11gCokfUZUwcRDikt64StzzdDfFMJjjgdlg3hECGTvkU';
const REGISTRY_TAB = 'Лист1';
const CONNECTION_TAB = '_Робот_связь';

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function same_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function doGet() {
  return json_({ok: true, service: 'protectoron-sheets', version: 1});
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > 8192) throw new Error('invalid_request');
    const request = JSON.parse(body);
    const secret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if (!secret || secret.length < 32) throw new Error('not_configured');
    if (!Number.isSafeInteger(request.timestamp) || Math.abs(Date.now() - request.timestamp) > 60000)
      throw new Error('expired_request');
    if (typeof request.payload !== 'string' || request.payload.length > 4096)
      throw new Error('invalid_request');
    const signature = Utilities.computeHmacSha256Signature(
      String(request.timestamp) + '\n' + request.payload, secret)
      .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    if (!same_(signature, request.signature)) throw new Error('unauthorized');
    const payload = JSON.parse(request.payload);
    if (payload.action === 'verify_connection') return json_(verifyConnection());
    if (payload.action === 'balance') return json_(balance_(payload.character));
    throw new Error('unsupported_action');
  } catch (error) {
    return json_({ok: false, error: String(error.message || 'bridge_error')});
  }
}

function registry_() {
  const book = SpreadsheetApp.openById(REGISTRY_ID);
  const sheet = book.getSheetByName(REGISTRY_TAB);
  if (!sheet) throw new Error('registry_missing');
  const rows = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 6).getValues();
  if (String(rows[0][0]).trim() !== 'Имя персонажа' ||
      String(rows[0][5]).replace(/\s+/g, ' ').trim().toLowerCase() !== 'очки навыков')
    throw new Error('registry_schema_changed');
  return {book: book, rows: rows};
}

// Manual first run authorizes Sheets access and proves bounded read/write access.
// Writes only its own hidden service tab; character data and balances stay untouched.
function verifyConnection() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const registry = registry_();
    let service = registry.book.getSheetByName(CONNECTION_TAB);
    if (!service) {
      service = registry.book.insertSheet(CONNECTION_TAB);
      service.hideSheet();
    }
    const checkedAt = new Date().toISOString();
    service.getRange('A1:B2').setValues([
      ['Служебная проверка соединения робота', 'Версия 1'],
      ['Последняя проверка UTC', checkedAt]
    ]);
    SpreadsheetApp.flush();
    if (service.getRange('B2').getValue() !== checkedAt) throw new Error('write_check_failed');
    return {ok: true, version: 1, registry_ready: true, write_verified: true,
      characters: registry.rows.slice(1).filter(row => String(row[0]).trim()).length};
  } finally {
    lock.releaseLock();
  }
}

function balance_(character) {
  if (typeof character !== 'string' || !character.trim() || character.length > 120)
    throw new Error('invalid_character');
  const key = character.trim().normalize('NFKC').toLowerCase();
  const matches = registry_().rows.slice(1).filter(row =>
    String(row[0]).trim().normalize('NFKC').toLowerCase() === key);
  if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous_character' : 'character_not_found');
  const value = matches[0][5];
  if (value === '') return {ok: true, points: null, configured: false};
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('invalid_balance');
  return {ok: true, points: value, configured: true};
}
