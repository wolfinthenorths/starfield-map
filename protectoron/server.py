"""Private Telegram NPC and its sprite-based Mini App. SQLite storage with independently verified backups."""
import hashlib
import csv
import io
import hmac
import html
import json
import mimetypes
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from roster import Roster, normalize
from backups import Backups
from sheets import SheetsBridge

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
ACCESS_CATALOG = json.loads((PUBLIC / "accesses.json").read_text())
ACCESS_SERVICES = {item["code"]: item for item in ACCESS_CATALOG["services"]}
TEST_URLS = json.loads(os.environ.get("QUALIFICATION_TEST_URLS", "{}"))
TOKEN = os.environ.get("BOT_TOKEN", "")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT / "local-data")))
JOURNAL_TOKEN = os.environ.get("JOURNAL_TOKEN", "")
ROSTER = Roster(os.environ.get("ROSTER_URL", ""))
GM_USERNAMES = {name.lstrip("@").casefold() for name in os.environ.get("GM_USERNAMES", "VaultTecGm,gj0xl").split(",") if name.strip()}
GM_BIND_CODE = os.environ.get("GM_BIND_CODE", "")
WEBHOOK_SECRET = hmac.new(TOKEN.encode(), b"protectoron-webhook", hashlib.sha256).hexdigest()
STOP = threading.Event()
BACKUPS = Backups(DATA_DIR)
SHEETS = SheetsBridge(os.environ.get("SHEETS_BRIDGE_URL", ""), os.environ.get("SHEETS_BRIDGE_SECRET", ""))
ROMAN = {1: "I", 2: "II", 3: "III"}
FAQ = [
    {"id": "purpose", "question": "Для чего нужен мистериум?", "answer": "Мистериум поддерживает контроль при гулификации, а необходимое количество препарата определяется её степенью: I — 1 единица, II — 2 единицы, III — 3 единицы."},
    {"id": "interval", "question": "Как часто нужно принимать препарат?", "answer": "Препарат необходимо принимать в полном назначенном количестве каждые 10 Ваших игровых ходов; поскольку получение не считается приёмом, сам приём Вы отыгрываете отдельно."},
    {"id": "turn", "question": "Что считается ходом?", "answer": "Засчитывается собственный игровой пост с действием, в том числе передвижением или отыгрышем реквеста. Обычные диалоги, спасброски, технические сообщения и дополнительные ответы не засчитываются."},
    {"id": "missed", "question": "Что будет при пропуске приёма?", "answer": "После первых 10 ходов без нового приёма препарата: на следующих ходах 1–3 действует помеха, на 4-м условия проверок могут быть изменены, на 5-м наступает полная потеря контроля над персонажем. Приём полного назначенного количества препарата восстанавливает контроль и сбрасывает счётчик."},
    {"id": "access", "question": "Как повысить доступ?", "answer": "Выберите службу и нужный уровень её полномочий, чтобы перейти к тесту на повышение квалификации; ссылка на испытание будет добавлена позже. Уровни разных служб учитываются отдельно: 1 — вспомогательный, 2 — рабочий, 3 — расширенный, 4 — критический. При этом уровень персонажа и номер этажа не обозначают служебный допуск, а Ω не является пятым уровнем и не выдаётся штатным сотрудникам."},
    {"id": "materials", "question": "Где найти материалы проекта?", "answer": "Материалы проекта доступны в Telegram по ссылке https://t.me/dawnofthed3ad, а перейти в архив Starfield Вы можете через справочный модуль."},
]


@contextmanager
def db():
    con = sqlite3.connect(DATA_DIR / "protectoron.sqlite3", timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript("""
        CREATE TABLE IF NOT EXISTS profiles (
            user_id INTEGER PRIMARY KEY, name TEXT NOT NULL, character TEXT NOT NULL DEFAULT '',
            degree INTEGER, access_level INTEGER NOT NULL DEFAULT 1,
            pending TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
            payload TEXT NOT NULL, created_at INTEGER NOT NULL,
            request_key TEXT NOT NULL, UNIQUE(user_id, kind, request_key));
        CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            payload TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0,
            attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS gm_accounts (user_id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS bindings (character_key TEXT PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL,
            character_key TEXT NOT NULL, recipient_name TEXT NOT NULL, degree INTEGER,
            report TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL, decided_by INTEGER, request_key TEXT NOT NULL,
            UNIQUE(user_id,kind,request_key));
        """)
        con.execute("UPDATE requests SET status='obsolete' WHERE kind='registration' AND status='pending'")
        columns = {row[1] for row in con.execute("PRAGMA table_info(profiles)")}
        if "username" not in columns:
            con.execute("ALTER TABLE profiles ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        if "method" not in {row[1] for row in con.execute("PRAGMA table_info(outbox)")}:
            con.execute("ALTER TABLE outbox ADD COLUMN method TEXT NOT NULL DEFAULT 'sendMessage'")
        if "payload" not in {row[1] for row in con.execute("PRAGMA table_info(prompts)")}:
            con.execute("ALTER TABLE prompts ADD COLUMN payload TEXT NOT NULL DEFAULT '{}'")


def telegram(method, payload):
    if not TOKEN:
        raise RuntimeError("Bot is not configured")
    data = json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/{method}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        # Never include request URLs (they contain bot credentials) in errors or logs.
        raise RuntimeError(f"Telegram HTTP {exc.code}") from None
    except Exception as exc:
        raise RuntimeError(f"Telegram connection: {type(exc).__name__}") from None
    if not result.get("ok"):
        raise RuntimeError("Telegram API rejected request")
    return result.get("result")


def validate_init_data(raw, token=None, now=None):
    token = TOKEN if token is None else token
    now = int(time.time()) if now is None else now
    pairs = urllib.parse.parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    values = dict(pairs)
    if len(values) != len(pairs):
        raise ValueError("Duplicate authentication fields")
    received = values.pop("hash", "")
    check = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not token or not hmac.compare_digest(expected, received):
        raise ValueError("Invalid Telegram signature")
    timestamp = int(values.get("auth_date", "0"))
    if timestamp > now + 60 or now - timestamp > 3600:
        raise ValueError("Telegram session expired")
    user = json.loads(values.get("user", "{}"))
    if type(user.get("id")) is not int or user["id"] <= 0:
        raise ValueError("Missing Telegram user")
    return user


def upsert_profile(con, user):
    name = str(user.get("first_name", "Посетитель"))[:80]
    username = str(user.get("username", ""))[:64]
    con.execute("INSERT INTO profiles(user_id,name,username,updated_at) VALUES(?,?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,username=excluded.username,updated_at=excluded.updated_at",
                (user["id"], name, username, int(time.time())))


def state(con, user_id):
    profile = dict(con.execute("SELECT * FROM profiles WHERE user_id=?", (user_id,)).fetchone())
    rows = con.execute("SELECT id,kind,payload,created_at FROM events WHERE user_id=? "
                       "ORDER BY created_at DESC,rowid DESC LIMIT 20", (user_id,)).fetchall()
    own = owned_character(con, profile)
    requests = [dict(row) for row in con.execute("SELECT id,kind,recipient_name,degree,status,created_at FROM requests WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20", (user_id,))]
    return {"profile": {k: profile[k] for k in ("name", "character", "degree", "access_level")},
            "own_character": public_character(own) if own else None,
            "characters": [public_character(item) for item in ROSTER.entries.values()],
            "requests": requests, "gm_connected": bool(setting(con, "gm_chat_id")),
            "events": [{**dict(row), "payload": json.loads(row["payload"])} for row in rows]}


def public_character(item):
    return {key: item[key] for key in ("name", "class", "degree", "eligible")}


def setting(con, key):
    row = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def set_setting(con, key, value):
    con.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value, ensure_ascii=False)))


def owned_character(con, profile):
    # Names are trusted role-play identities; Telegram identifies journal actors.
    return ROSTER.get(profile["character"])


def require_character(con, user_id):
    profile = con.execute("SELECT * FROM profiles WHERE user_id=?", (user_id,)).fetchone()
    own = owned_character(con, profile)
    if not own:
        raise ValueError("Сначала назовите своего персонажа из реестра.")
    return own


def dose_journal_csv(con):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["Юзернейм в Telegram", "Доза мистериума", "Дата и время (Томск)"])
    for row in con.execute("SELECT user_id,payload,created_at FROM events WHERE kind='dispense' ORDER BY created_at,rowid"):
        payload = json.loads(row["payload"])
        username = payload.get("telegram_username") or f"ID:{row['user_id']}"
        taken_at = payload.get("taken_at") or time.strftime("%d.%m.%Y %H:%M:%S", time.gmtime(row["created_at"] + 7 * 3600))
        units = payload["units"]
        dose = f"{units} {'единица' if units == 1 else 'единицы'} · {ROMAN[payload['degree']]} степень"
        if payload.get("for_companion"):
            dose += f" · для {payload['recipient']}"
        writer.writerow([username, dose, taken_at])
    return stream.getvalue().encode("utf-8")


def keyboard(rows):
    return {"inline_keyboard": rows}


def cb(label, value):
    return {"text": label, "callback_data": value}


def app_button(label="Открыть робота", query=""):
    return {"text": label, "web_app": {"url": APP_URL + "/" + query}}


def home_keyboard():
    rows = [[cb("Получить мистериум", "mysterium")],
            [cb("Взять для товарища", "companion")],
            [cb("Повысить доступ", "access"), cb("Задать вопрос", "faq")],
            [cb("Мой журнал", "history"), cb("Имя персонажа", "character")]]
    if APP_URL:
        rows.append([app_button()])
    return keyboard(rows)


def queue(con, user_id, text, markup=None, thread_id=None):
    payload = {"chat_id": user_id, "text": text, "parse_mode": "HTML"}
    if markup:
        payload["reply_markup"] = markup
    if thread_id:
        payload["message_thread_id"] = thread_id
    con.execute("INSERT INTO outbox(user_id,payload) VALUES(?,?)", (user_id, json.dumps(payload, ensure_ascii=False)))


def queue_call(con, user_id, method, payload):
    con.execute("INSERT INTO outbox(user_id,payload,method) VALUES(?,?,?)", (user_id, json.dumps(payload, ensure_ascii=False), method))


def new_prompt(con, user_id, kind, payload=None):
    key = secrets.token_hex(6)
    con.execute("INSERT INTO prompts(id,user_id,kind,created_at,payload) VALUES(?,?,?,?,?)",
                (key, user_id, kind, int(time.time()), json.dumps(payload or {}, ensure_ascii=False)))
    return key


def consume_prompt(con, key, user_id, kind):
    row = con.execute("SELECT * FROM prompts WHERE id=? AND user_id=? AND kind=?",
                      (key, user_id, kind)).fetchone()
    if not row or row["consumed"] or int(time.time()) - row["created_at"] > 3600:
        return False
    con.execute("UPDATE prompts SET consumed=1 WHERE id=?", (key,))
    return True


def issue(con, user_id, degree, key, notify=True, recipient=None, for_companion=False):
    if type(degree) is not int or degree not in ROMAN:
        raise ValueError("Выберите степень I, II или III.")
    old = con.execute("SELECT id,payload,created_at FROM events WHERE user_id=? AND kind='dispense' AND request_key=?",
                      (user_id, key)).fetchone()
    if old:
        return {"id": old["id"], **json.loads(old["payload"]), "created_at": old["created_at"], "repeated": True}
    profile = con.execute("SELECT * FROM profiles WHERE user_id=?", (user_id,)).fetchone()
    event_id, now = uuid.uuid4().hex, int(time.time())
    username = "@" + profile["username"] if profile["username"] else f"ID:{user_id}"
    payload = {"degree": degree, "units": degree, "telegram_username": username,
               "taken_at": time.strftime("%d.%m.%Y %H:%M:%S", time.gmtime(now + 7 * 3600)),
               "timezone": "Asia/Tomsk"}
    if recipient:
        payload.update({"recipient": recipient, "for_companion": for_companion})
    con.execute("INSERT INTO events VALUES(?,?,?,?,?,?)", (event_id, user_id, "dispense", json.dumps(payload), now, key))
    con.execute("UPDATE profiles SET degree=?,updated_at=? WHERE user_id=?", (degree, now, user_id))
    who = html.escape(profile["character"] or profile["name"])
    texts = [
        f"Оптический датчик Протектрона задерживается на посетителе, после чего в корпусе раздаётся короткий щелчок. «{who}, согласно реестру Вам назначен препарат для {ROMAN[degree]} степени гулификации, подготавливаю его к выдаче». Замок контейнера отходит в сторону, и крышка медленно поднимается, открывая препарат.",
        f"«{who}, Ваш запрос обработан, и препарат для {ROMAN[degree]} степени гулификации подготовлен к выдаче». Протектрон поворачивается к контейнеру; сервопривод с негромким гудением освобождает крышку, а индикатор над препаратом сменяет янтарный свет на зелёный. «Вы можете получить препарат из открытого контейнера».",
        f"Внутри корпуса Протектрона негромко потрескивает реле. «{who}, сведения о {ROMAN[degree]} степени гулификации проверены, препарат подготовлен в назначенном количестве». Робот отводит запор контейнера, и поднявшаяся крышка открывает подготовленный препарат. «Пожалуйста, соблюдайте установленный интервал приёма».",
    ]
    text = texts[int(event_id[:4], 16) % len(texts)]
    if for_companion:
        text = f"«Выдача для {html.escape(recipient)} согласована по Вашему рапорту, подготавливаю препарат для {ROMAN[degree]} степени гулификации». Протектрон освобождает замок контейнера; крышка поднимается, открывая препарат. «Вы можете получить препарат из открытого контейнера»."
    unit_word = "единица" if degree == 1 else "единицы"
    text += f"\n\n<b>Мистериум: {degree} {unit_word} — назначенное количество препарата.</b>\nПолучение препарата не фиксирует его приём."
    if for_companion:
        text += f"\n<b>Получатель: {html.escape(recipient)}.</b> Выдача разрешена по согласованному рапорту."
    rows = [[cb("Инструкция по приёму", "faq:interval")], [cb("Вернуться к контроллеру", "home")]]
    if APP_URL:
        rows.insert(0, [app_button("Посмотреть выдачу", f"?receipt={event_id}")])
    if notify:
        queue(con, user_id, text, keyboard(rows))
    return {"id": event_id, **payload, "created_at": now, "repeated": False}


def self_issue(con, user_id, key, notify=True):
    own = require_character(con, user_id)
    if not own["eligible"]:
        raise ValueError("Личная выдача мистериума для Вашего класса недоступна. Для получения препарата с целью передачи иному лицу — напишите рапорт.")
    return issue(con, user_id, own["degree"], key, notify, own["name"])


def report_message(con, request):
    profile = con.execute("SELECT * FROM profiles WHERE user_id=?", (request["user_id"],)).fetchone()
    actor = "@" + profile["username"] if profile["username"] else f"ID:{request['user_id']}"
    title = "ПРИВЯЗКА ПЕРСОНАЖА" if request["kind"] == "registration" else "ВЫДАЧА МИСТЕРИУМА ТОВАРИЩУ"
    text = f"<b>{title}</b>\n\nИгрок: <a href=\"tg://user?id={request['user_id']}\">{html.escape(actor)}</a>\nПерсонаж игрока: {html.escape(profile['character'] or 'не зарегистрирован')}\n"
    text += f"{'Имя для регистрации' if request['kind']=='registration' else 'Получатель'}: <b>{html.escape(request['recipient_name'])}</b>\n"
    if request["degree"]:
        text += f"Степень: {ROMAN[request['degree']]} · количество препарата: {request['degree']} ед.\n"
    if request["report"]:
        text += f"\n<b>Рапорт:</b>\n{html.escape(request['report'])}"
    return text


def send_gm_report(con, request):
    chat_id = setting(con, "gm_chat_id")
    if not chat_id:
        raise ValueError("Согласование выдачи временно недоступно. Пожалуйста, повторите обращение позже.")
    queue(con, chat_id, report_message(con, request), keyboard([[cb("Согласовать", "gm:approve:" + request["id"]), cb("Отклонить", "gm:reject:" + request["id"])]]), setting(con, "gm_thread_id"))


def register_character(con, user_id, name, source="chat"):
    entry = ROSTER.get(name)
    if not entry:
        raise ValueError("Указанного имени нет в реестре, поэтому проверьте его написание и повторите обращение.")
    con.execute("UPDATE profiles SET character=?,pending='' WHERE user_id=?", (entry["name"], user_id))
    return "verified"


def companion_request(con, user_id, name, report, key, source="chat"):
    own = require_character(con, user_id)
    recipient = ROSTER.get(name)
    if not recipient or not recipient["eligible"]:
        raise ValueError("Получатель должен быть гулем с указанной в реестре степенью.")
    if recipient["key"] == own["key"]:
        raise ValueError("Для своего персонажа используйте личную выдачу.")
    report = str(report).strip()
    if not 5 <= len(report) <= 1200:
        raise ValueError("Опишите ситуацию рапортом длиной от 5 до 1200 символов.")
    old = con.execute("SELECT * FROM requests WHERE user_id=? AND kind='companion' AND request_key=?", (user_id, key)).fetchone()
    if old:
        return dict(old)
    request_id = uuid.uuid4().hex
    con.execute("INSERT INTO requests(id,kind,user_id,character_key,recipient_name,degree,report,source,created_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (request_id, "companion", user_id, recipient["key"], recipient["name"], recipient["degree"], report, source, int(time.time()), key))
    request = con.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
    send_gm_report(con, request)
    return dict(request)


def collect_companion(con, user_id, request_id, notify=True):
    require_character(con, user_id)
    request = con.execute("SELECT * FROM requests WHERE id=? AND kind='companion' AND user_id=?", (request_id, user_id)).fetchone()
    if not request or request["status"] not in ("approved", "issued"):
        raise ValueError("Выдача препарата пока не согласована, поэтому, пожалуйста, ожидайте завершения рассмотрения рапорта.")
    key = "companion:" + request_id
    if request["status"] == "issued":
        old = con.execute("SELECT id,payload,created_at FROM events WHERE user_id=? AND kind='dispense' AND request_key=?", (user_id, key)).fetchone()
        if not old:
            raise ValueError("Выдача уже закрыта")
        return {"id": old["id"], **json.loads(old["payload"]), "created_at": old["created_at"], "repeated": True}
    recipient = ROSTER.get(request["recipient_name"])
    if not recipient or not recipient["eligible"] or recipient["degree"] != request["degree"]:
        raise ValueError("Данные получателя изменились в реестре, поэтому для выдачи препарата потребуется новый рапорт.")
    result = issue(con, user_id, recipient["degree"], key, notify, recipient["name"], True)
    con.execute("UPDATE requests SET status='issued' WHERE id=? AND status='approved'", (request_id,))
    return result


def is_gm(con, user):
    if con.execute("SELECT 1 FROM gm_accounts WHERE user_id=?", (user["id"],)).fetchone():
        return True
    name = str(user.get("username", "")).casefold()
    if name not in GM_USERNAMES:
        return False
    other = con.execute("SELECT user_id FROM gm_accounts WHERE username=?", (name,)).fetchone()
    if other and other[0] != user["id"]:
        return False
    con.execute("INSERT OR IGNORE INTO gm_accounts VALUES(?,?)", (user["id"], name))
    return True


def decide_request(con, user, request_id, decision):
    if not is_gm(con, user) or decision not in ("approve", "reject"):
        raise ValueError("Согласование доступно только указанным ГМ.")
    request = con.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
    if not request or request["status"] != "pending":
        raise ValueError("Этот рапорт уже рассмотрен.")
    if decision == "approve":
        entry = ROSTER.get(request["recipient_name"])
        if not entry:
            raise ValueError("Получателя больше нет в реестре.")
        if request["kind"] != "companion":
            raise ValueError("Подтверждение регистрации больше не требуется. Игрок может указать имя самостоятельно.")
        if not entry["eligible"] or entry["degree"] != request["degree"]:
            raise ValueError("Дозировка получателя изменилась. Попросите новый рапорт.")
    status = "approved" if decision == "approve" else "rejected"
    con.execute("UPDATE requests SET status=?,decided_by=? WHERE id=? AND status='pending'", (status, user["id"], request_id))
    if request["source"] == "chat":
        if request["kind"] == "registration":
            queue(con, request["user_id"], "«Регистрация персонажа подтверждена. Контроллер готов к обслуживанию»." if status == "approved" else "«Регистрация отклонена. Уточните данные персонажа».", home_keyboard())
        else:
            rows = [[cb("Получить препарат", "collect:" + request_id)]] if status == "approved" else []
            rows.append([cb("Вернуться", "home")])
            result_text = (f"«Выдача для {html.escape(request['recipient_name'])} согласована по Вашему рапорту, и препарат подготовлен; пожалуйста, подтвердите его получение кнопкой ниже»." if status == "approved" else f"«По результатам рассмотрения Вашего рапорта выдача препарата для {html.escape(request['recipient_name'])} не согласована».")
            queue(con, request["user_id"], result_text, keyboard(rows))
    return status, request


def test_url(target):
    value = TEST_URLS.get(target, "")
    return value if isinstance(value, str) and value.startswith("https://") else ""


def access_request(con, user_id, target, key, notify=True):
    target = str(target).strip()
    if not target or len(target) > 120:
        raise ValueError("Укажите нужный доступ: до 120 символов.")
    old = con.execute("SELECT id FROM events WHERE user_id=? AND kind='access' AND request_key=?", (user_id, key)).fetchone()
    if old:
        return {"id": old["id"], "target": target, "repeated": True, "test_url": test_url(target)}
    event_id = uuid.uuid4().hex
    con.execute("INSERT INTO events VALUES(?,?,?,?,?,?)", (event_id, user_id, "access",
                json.dumps({"target": target, "status": "awaiting_testing"}, ensure_ascii=False), int(time.time()), key))
    url = test_url(target)
    test_note = "«Для повышения квалификации пройдите тест по ссылке ниже»." if url else "«Повышение квалификации проводится через тест. Ссылка на испытание для этого допуска будет добавлена позже»."
    rows = [[cb("Как проходит повышение?", "faq:access")], [cb("Вернуться", "home")]]
    if url:
        rows.insert(0, [{"text": f"Пройти тест · {target}", "url": url}])
    if notify:
        queue(con, user_id,
          "Протектрон поворачивает оптический модуль к терминалу; на дисплее загорается строка нового обращения. "
          f"«Запрос зарегистрирован: <b>{html.escape(target)}</b>». "
          f"{test_note}\n\nОбращение сохранено в Вашем журнале. Выбор кнопки сам по себе допуск не повышает.",
          keyboard(rows))
    return {"id": event_id, "target": target, "repeated": False, "test_url": url}


def backup_summary(status):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    def stamp(value):
        return datetime.fromtimestamp(value, ZoneInfo("Asia/Tomsk")).strftime("%d.%m.%Y %H:%M:%S") if value else "ещё нет"
    return ("Локальная копия: " + stamp(status.get("local_at")) +
            "\nОтдельная проверенная копия: " + stamp(status.get("remote_at")) +
            ("\nПоследняя попытка отдельного сохранения завершилась ошибкой." if status.get("remote_error") else ""))


def backup_warning():
    with db() as con:
        if setting(con, "gm_chat_id"):
            queue(con, setting(con, "gm_chat_id"), "Резервное копирование базы требует внимания. Проверьте /dbstats в личном чате с роботом.", thread_id=setting(con, "gm_thread_id"))


def manual_backup(user_id):
    try:
        status = BACKUPS.run(force=True)
        text = "Резервная копия создана и проверена.\n" + backup_summary(status)
    except Exception:
        text = "Не удалось завершить резервное копирование.\n" + backup_summary(BACKUPS.status())
    with db() as con:
        queue(con, user_id, text)


def admin_command(update, user, chat, command):
    if command not in ("/backupdb", "/dbstats"):
        return False
    with db() as con:
        con.execute("BEGIN IMMEDIATE")
        if not is_gm(con, user):
            return True
        if chat.get("type") != "private":
            if chat.get("id") == setting(con, "gm_chat_id"):
                queue(con, chat["id"], "Для /backupdb и /dbstats откройте личный чат с роботом.", thread_id=setting(con, "gm_thread_id"))
            return True
        if chat.get("id") != user["id"]:
            return True
        if con.execute("SELECT 1 FROM updates WHERE id=?", (update["update_id"],)).fetchone():
            return True
        con.execute("INSERT INTO updates VALUES(?,?)", (update["update_id"], int(time.time())))
        if command == "/dbstats":
            counts = {table: con.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in ("profiles", "events", "requests")}
            queue(con, user["id"], f"Игроков: {counts['profiles']}\nСобытий: {counts['events']}\nРапортов: {counts['requests']}\n\n" + backup_summary(BACKUPS.status()))
        else:
            queue(con, user["id"], "Создаю локальную и отдельную копии базы и проверяю их целостность.")
    if command == "/backupdb":
        threading.Thread(target=manual_backup, args=(user["id"],), daemon=True).start()
    return True


def handle_update(update):
    callback = update.get("callback_query")
    message = callback.get("message", {}) if callback else update.get("message", {})
    user = callback.get("from", {}) if callback else message.get("from", {})
    chat = message.get("chat", {})
    if not user.get("id") or user.get("is_bot"):
        return
    data = callback.get("data", "") if callback else ""
    text = message.get("text", "").strip() if not callback else ""
    command = text.split(maxsplit=1)[0].split("@")[0] if text else ""
    if admin_command(update, user, chat, command):
        return
    if chat.get("type") in ("group", "supergroup"):
        if command != "/bind_gm" and not data.startswith("gm:"):
            return
        if callback:
            try:
                telegram("answerCallbackQuery", {"callback_query_id": callback["id"]})
            except RuntimeError:
                pass
        try:
            if data.startswith("gm:approve:"):
                ROSTER.refresh()
            with db() as con:
                con.execute("BEGIN IMMEDIATE")
                if con.execute("SELECT 1 FROM updates WHERE id=?", (update["update_id"],)).fetchone():
                    return
                if command == "/bind_gm":
                    supplied = text.split(maxsplit=1)[1].strip() if len(text.split(maxsplit=1)) == 2 else ""
                    if not GM_BIND_CODE or not hmac.compare_digest(supplied, GM_BIND_CODE) or not is_gm(con, user):
                        return
                    bound = setting(con, "gm_chat_id")
                    if bound and bound != chat["id"]:
                        queue(con, chat["id"], "Чат ГМ уже привязан к другой группе. Для изменения обратитесь к владельцу бота.", thread_id=message.get("message_thread_id"))
                    else:
                        set_setting(con, "gm_chat_id", chat["id"])
                        set_setting(con, "gm_thread_id", message.get("message_thread_id"))
                        set_setting(con, "gm_chat_title", chat.get("title", "ГМ"))
                        queue(con, chat["id"], "<b>Чат ГМ привязан.</b>\nРапорты для выдачи товарищу будут приходить сюда. Согласовывать могут только @VaultTecGm и @gj0xl.", thread_id=message.get("message_thread_id"))
                else:
                    if chat["id"] != setting(con, "gm_chat_id") or (setting(con, "gm_thread_id") and message.get("message_thread_id") != setting(con, "gm_thread_id")):
                        return
                    _, decision, request_id = data.split(":")
                    status, request = decide_request(con, user, request_id, decision)
                    decision_by = "@" + str(user.get("username", user["id"]))
                    original = report_message(con, request)
                    original += f"\n\n<b>{'СОГЛАСОВАНО' if status=='approved' else 'ОТКЛОНЕНО'}</b> · {html.escape(decision_by)}"
                    queue_call(con, chat["id"], "editMessageText", {"chat_id": chat["id"], "message_id": message["message_id"], "text": original, "parse_mode": "HTML", "reply_markup": keyboard([])})
                con.execute("INSERT INTO updates VALUES(?,?)", (update["update_id"], int(time.time())))
        except (ValueError, KeyError) as exc:
            if callback:
                try:
                    telegram("answerCallbackQuery", {"callback_query_id": callback["id"], "text": str(exc)[:180], "show_alert": True})
                except RuntimeError:
                    pass
        return
    if chat.get("type") != "private" or chat.get("id") != user["id"]:
        return
    with db() as con:
        upsert_profile(con, user)
        profile = con.execute("SELECT * FROM profiles WHERE user_id=?", (user["id"],)).fetchone()
        pending = profile["pending"]
    clinical = command in ("/start", "/menu", "/mysterium", "/cancel", "/refresh_roster") or data in ("home", "mysterium", "companion", "character") or data.startswith(("degree:", "self:", "buddy:", "collect:")) or (bool(text) and not text.startswith("/") and (pending.startswith("report:") or pending in ("register", "character")))
    if not clinical:
        try:
            if command == "/access" or data.startswith("access"):
                ROSTER.refresh()
            return handle_private_update(update)
        except ValueError as exc:
            with db() as con:
                queue(con, user["id"], "«" + html.escape(str(exc)) + "»", home_keyboard())
            return
    if callback:
        try:
            telegram("answerCallbackQuery", {"callback_query_id": callback["id"]})
        except RuntimeError:
            pass
    try:
        ROSTER.refresh(force=command == "/refresh_roster")
        with db() as con:
            con.execute("BEGIN IMMEDIATE")
            if con.execute("SELECT 1 FROM updates WHERE id=?", (update["update_id"],)).fetchone():
                return
            upsert_profile(con, user)
            profile = con.execute("SELECT * FROM profiles WHERE user_id=?", (user["id"],)).fetchone()
            own = owned_character(con, profile)
            if command == "/refresh_roster":
                if not is_gm(con, user):
                    return
                queue(con, user["id"], "Реестр перечитан. Классы, степени и привязки актуальны.", home_keyboard())
            elif data == "character" or (not own and (command in ("/start", "/menu", "/mysterium", "/cancel") or data in ("home", "mysterium", "companion"))):
                con.execute("UPDATE profiles SET pending='register' WHERE user_id=?", (user["id"],))
                queue(con, user["id"], "Протектрон поднимает оптический модуль. «Для проверки права на обслуживание назовите Вашего персонажа — так, как он записан в реестре».", {"force_reply": True, "input_field_placeholder": "Имя персонажа"})
            elif text and not text.startswith("/") and profile["pending"] in ("register", "character"):
                result = register_character(con, user["id"], text)
                queue(con, user["id"], f"«Добрый день, {html.escape(require_character(con, user['id'])['name'])}! Данные реестра проверены, укажите цель обращения?»", home_keyboard())
            elif command in ("/start", "/menu", "/cancel") or data == "home":
                con.execute("UPDATE profiles SET pending='' WHERE user_id=?", (user["id"],))
                queue(con, user["id"], f"«Добрый день, {html.escape(own['name'])}! Данные реестра проверены, укажите цель обращения?»", home_keyboard())
            elif command == "/mysterium" or data == "mysterium" or data.startswith("degree:"):
                own = require_character(con, user["id"])
                if not own["eligible"]:
                    raise ValueError("Личная выдача мистериума для Вашего класса недоступна. Для получения препарата с целью передачи иному лицу — напишите рапорт.")
                prompt = new_prompt(con, user["id"], "self-dose")
                queue(con, user["id"], f"«{html.escape(own['name'])}, согласно реестру для {ROMAN[own['degree']]} степени гулификации Вам назначено {own['degree']} ед. препарата; контейнер подготовлен, и Вы можете подтвердить получение».", keyboard([[cb("Получить препарат", "self:" + prompt)], [cb("Взять для товарища", "companion")], [cb("Вернуться", "home")]]))
            elif data.startswith("self:"):
                key = data.split(":", 1)[1]
                if not consume_prompt(con, key, user["id"], "self-dose"):
                    raise ValueError("Эта выдача уже обработана либо устарела.")
                self_issue(con, user["id"], "bot:" + key)
            elif data == "companion":
                own = require_character(con, user["id"])
                candidates = [item for item in ROSTER.entries.values() if item["eligible"] and item["key"] != own["key"]]
                if not candidates:
                    raise ValueError("В реестре нет другого персонажа, которому доступен препарат.")
                prompt = new_prompt(con, user["id"], "buddy-picker", {"names": [item["name"] for item in candidates]})
                queue(con, user["id"], "«Укажите товарища, для которого требуется препарат, чтобы я мог проверить назначенное ему количество по реестру».", keyboard([[cb(item["name"], f"buddy:{prompt}:{index}")] for index, item in enumerate(candidates)] + [[cb("Вернуться", "home")]]))
            elif data.startswith("buddy:"):
                _, key, index = data.split(":")
                prompt = con.execute("SELECT payload FROM prompts WHERE id=? AND user_id=?", (key, user["id"])).fetchone()
                if not prompt or not consume_prompt(con, key, user["id"], "buddy-picker"):
                    raise ValueError("Выбор получателя устарел, поэтому начните оформление рапорта заново.")
                names = json.loads(prompt[0])["names"]
                i = int(index)
                if not 0 <= i < len(names):
                    raise ValueError("Выберите получателя из списка")
                name = names[i]
                con.execute("UPDATE profiles SET pending=? WHERE user_id=?", ("report:" + name, user["id"]))
                queue(con, user["id"], f"«По какой причине товарищ {html.escape(name)} не может получить препарат самостоятельно?»\n\nОтправьте рапорт следующим сообщением — от 5 до 1200 символов.", {"force_reply": True, "input_field_placeholder": "Короткий рапорт"})
            elif text and not text.startswith("/") and profile["pending"].startswith("report:"):
                companion_request(con, user["id"], profile["pending"][7:], text, f"update:{update['update_id']}")
                con.execute("UPDATE profiles SET pending='' WHERE user_id=?", (user["id"],))
                queue(con, user["id"], "«Ваш рапорт принят на рассмотрение; пожалуйста, ожидайте завершения согласования на выдачу «Мистериума»».", home_keyboard())
            elif data.startswith("collect:"):
                collect_companion(con, user["id"], data.split(":", 1)[1])
            con.execute("INSERT INTO updates VALUES(?,?)", (update["update_id"], int(time.time())))
    except (ValueError, KeyError, IndexError) as exc:
        with db() as con:
            queue(con, user["id"], "«" + html.escape(str(exc)) + "»", home_keyboard())


def handle_private_update(update):
    message = update.get("message")
    callback = update.get("callback_query")
    if callback:
        try:
            telegram("answerCallbackQuery", {"callback_query_id": callback["id"]})
        except RuntimeError:
            pass
        message = callback.get("message", {})
    if not message or message.get("chat", {}).get("type") != "private":
        return  # NPC never operates in group chats.
    user = callback.get("from", {}) if callback else message.get("from", {})
    if not user.get("id") or user.get("is_bot"):
        return
    user_id = user["id"]
    if message.get("chat", {}).get("id") != user_id:
        return
    with db() as con:
        con.execute("BEGIN IMMEDIATE")
        if con.execute("SELECT 1 FROM updates WHERE id=?", (update["update_id"],)).fetchone():
            return
        con.execute("INSERT INTO updates VALUES(?,?)", (update["update_id"], int(time.time())))
        upsert_profile(con, user)
        data = callback.get("data", "") if callback else ""
        text = message.get("text", "").strip() if not callback else ""
        if text.startswith("/start") or text.startswith("/menu") or data == "home":
            con.execute("UPDATE profiles SET pending='' WHERE user_id=?", (user_id,))
            queue(con, user_id, "Протектрон поднимает оптический модуль; в корпусе негромко гудит сервопривод. "
                  "«Контроллер готов к обслуживанию, укажите цель обращения».", home_keyboard())
        elif text.startswith("/mysterium") or data == "mysterium":
            prompt = new_prompt(con, user_id, "degree")
            queue(con, user_id, "Протектрон разворачивает диагностическую панель. «Для подготовки препарата "
                  "укажите степень гулификации Вашего персонажа».\n\n<b>Какова Ваша степень гулификации?</b>",
                  keyboard([[cb(f"{ROMAN[d]} степень · {d} ед.", f"degree:{prompt}:{d}")] for d in ROMAN]
                           + [[cb("Вернуться", "home")]]))
        elif data.startswith("degree:"):
            try:
                _, key, value = data.split(":")
                degree = int(value)
                if degree not in ROMAN or not consume_prompt(con, key, user_id, "degree"):
                    raise ValueError()
                issue(con, user_id, degree, f"bot:{key}")
            except ValueError:
                queue(con, user_id, "«Этот запрос уже обработан либо устарел. Для новой выдачи начните обращение заново».",
                      keyboard([[cb("Получить мистериум", "mysterium")], [cb("Вернуться", "home")]]))
        elif text.startswith("/access") or data == "access":
            require_character(con, user_id)
            prompt = new_prompt(con, user_id, "access-service")
            choices = [cb(f"{item['code']} · {item['name']}", f"accessservice:{prompt}:{item['code']}") for item in ACCESS_CATALOG["services"]]
            queue(con, user_id, "На панели Протектрона загорается индикатор допуска. «Уточните, какой именно доступ "
                  "Вам требуется повысить».\n\n<b>Выберите службу:</b>",
                  keyboard([choices[i:i + 2] for i in range(0, len(choices), 2)] + [[cb("Вернуться", "home")]]))
        elif data.startswith("accessservice:"):
            require_character(con, user_id)
            try:
                _, key, service = data.split(":")
                if service not in ACCESS_SERVICES or not consume_prompt(con, key, user_id, "access-service"):
                    raise ValueError()
                prompt = new_prompt(con, user_id, "access-level:" + service)
                item = ACCESS_SERVICES[service]
                queue(con, user_id, f"«Служба {service}: {html.escape(item['description'])} Укажите нужный уровень полномочий».\n\n"
                      "Уровень относится к выбранной службе и не обозначает этаж убежища.",
                      keyboard([[cb(f"{service}-{level['level']} · {level['name']}", f"accesslevel:{prompt}:{service}:{level['level']}")]
                                for level in ACCESS_CATALOG["levels"] if level["level"] > 1] + [[cb("Выбрать другую службу", "access")]]))
            except ValueError:
                queue(con, user_id, "«Выберите службу заново».", keyboard([[cb("Выбрать службу", "access")]]))
        elif data.startswith("accesslevel:"):
            require_character(con, user_id)
            try:
                _, key, service, value = data.split(":")
                level = int(value)
                if service not in ACCESS_SERVICES or level not in (2, 3, 4) or not consume_prompt(con, key, user_id, "access-level:" + service):
                    raise ValueError()
                access_request(con, user_id, f"{service}-{level}", f"bot:{key}")
            except ValueError:
                queue(con, user_id, "«Этот запрос уже обработан либо устарел».", keyboard([[cb("Выбрать службу", "access")]]))
        elif data == "character":
            con.execute("UPDATE profiles SET pending='character' WHERE user_id=?", (user_id,))
            queue(con, user_id, "«Назовите персонажа, для которого оформляется обращение». Отправьте имя следующим сообщением.",
                  {"force_reply": True, "input_field_placeholder": "Имя персонажа"})
        elif data == "faq" or text.startswith("/help"):
            queue(con, user_id, "«Справочный модуль готов к работе, выберите интересующий Вас вопрос».",
                  keyboard([[cb(item["question"], "faq:" + item["id"])] for item in FAQ] + [[cb("Вернуться", "home")]]))
        elif data.startswith("faq:"):
            item = next((item for item in FAQ if item["id"] == data.split(":", 1)[1]), None)
            if item:
                rows = [[cb("Другой вопрос", "faq"), cb("Вернуться", "home")]]
                if item["id"] == "materials":
                    rows.insert(0, [{"text": "Материалы проекта", "url": "https://t.me/dawnofthed3ad"},
                                    {"text": "Архив Starfield", "url": "https://starfield-archive.netlify.app/"}])
                queue(con, user_id, f"<b>{html.escape(item['question'])}</b>\n\n«{html.escape(item['answer'])}»", keyboard(rows))
        elif data == "history" or text.startswith("/history"):
            events = state(con, user_id)["events"]
            lines = []
            for e in events[:8]:
                date = time.strftime("%d.%m %H:%M", time.gmtime(e["created_at"] + 7 * 3600))
                p = e["payload"]
                label = f"Мистериум · {ROMAN[p['degree']]} степень · {p['units']} ед." if e["kind"] == "dispense" else f"Запрос: {html.escape(p['target'])}"
                lines.append(f"{date} — {label}")
            queue(con, user_id, "<b>Журнал обращений · время Томска</b>\n\n" + ("\n".join(lines) or "Обращений пока нет."), home_keyboard())
        elif text:
            profile = con.execute("SELECT pending FROM profiles WHERE user_id=?", (user_id,)).fetchone()
            if profile["pending"] == "character":
                if len(text) <= 80 and not text.startswith("/"):
                    con.execute("UPDATE profiles SET character=?,pending='' WHERE user_id=?", (text, user_id))
                    queue(con, user_id, f"«Имя персонажа зафиксировано: {html.escape(text)}». Чем могу помочь?", home_keyboard())
                else:
                    queue(con, user_id, "«Укажите имя длиной до 80 символов».")
            else:
                # Curated answers: no model and no invented lore.
                lowered = text.lower()
                match = next((item for item in FAQ if item["id"] ==
                              ("interval" if any(w in lowered for w in ["часто", "когда", "приним"]) else
                               "missed" if any(w in lowered for w in ["пропус", "забы", "без мист"]) else
                               "access" if "доступ" in lowered else
                               "turn" if "ход" in lowered else "")), None)
                if match:
                    queue(con, user_id, f"«{html.escape(match['answer'])}»", home_keyboard())
                else:
                    queue(con, user_id, "«В справочном модуле нет точного ответа на этот вопрос. "
                          "Пожалуйста, выберите раздел справочного модуля».", home_keyboard())


def outbox_worker():
    while not STOP.wait(0.8):
        try:
            with db() as con:
                row = con.execute("SELECT * FROM outbox WHERE delivered=0 AND next_attempt<=? ORDER BY id LIMIT 1",
                                  (int(time.time()),)).fetchone()
            if not row:
                continue
            try:
                telegram(row["method"], json.loads(row["payload"]))
                with db() as con:
                    con.execute("UPDATE outbox SET delivered=1 WHERE id=?", (row["id"],))
            except RuntimeError:
                attempts = row["attempts"] + 1
                with db() as con:
                    con.execute("UPDATE outbox SET attempts=?,next_attempt=?,delivered=? WHERE id=?",
                                (attempts, int(time.time()) + min(1800, 2 ** min(attempts, 10)),
                                 -1 if attempts >= 12 else 0, row["id"]))
        except Exception as exc:
            print("Outbox:", type(exc).__name__, flush=True)


def setup_bot():
    for attempt in range(12):
        try:
            me = telegram("getMe", {})
            telegram("setMyCommands", {"scope": {"type": "all_private_chats"}, "commands": [
                {"command": "start", "description": "Обратиться к контроллеру"},
                {"command": "mysterium", "description": "Получить мистериум"},
                {"command": "access", "description": "Запросить повышение доступа"},
                {"command": "help", "description": "Справочный модуль"},
                {"command": "history", "description": "Журнал обращений"}]})
            telegram("setMyDescription", {"description": "Протектрон-контроллер Starfield. Выдача мистериума по степени гулификации, запросы на повышение доступа и справочный модуль. Обслуживание в личном чате."})
            telegram("setMyShortDescription", {"short_description": "Контроллер Starfield · мистериум, доступы и справочный модуль"})
            telegram("setChatMenuButton", {"menu_button": {"type": "web_app", "text": "Робот", "web_app": {"url": APP_URL + "/"}}})
            telegram("setWebhook", {"url": APP_URL + "/telegram/webhook", "secret_token": WEBHOOK_SECRET,
                                    "allowed_updates": ["message", "callback_query"], "max_connections": 4})
            print("Controller ready: @" + me["username"], flush=True)
            return
        except RuntimeError as exc:
            print("Bot setup:", str(exc), flush=True)
            if STOP.wait(min(60, 2 ** attempt)):
                return


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log Telegram authentication or credentials.

    def reply(self, status, payload):
        content = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith("/journal/"):
            supplied = path.removeprefix("/journal/").removesuffix(".csv")
            if not JOURNAL_TOKEN or not path.endswith(".csv") or not hmac.compare_digest(supplied, JOURNAL_TOKEN):
                self.reply(404, {"error": "Страница не найдена"})
                return
            with db() as con:
                content = dose_journal_csv(con)
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(content)
            return
        if path == "/health":
            with db() as con:
                connected = bool(setting(con, "gm_chat_id"))
            self.reply(200, {"ok": True, "bot_configured": bool(TOKEN and APP_URL), "gm_connected": connected, "registry_ready": bool(ROSTER.entries), "sheets": SHEETS.status(), "backup": {key: BACKUPS.status().get(key) for key in ("local_at", "remote_at", "remote_verified", "remote_error")}})
            return
        file = (PUBLIC / (path.lstrip("/") or "index.html")).resolve()
        if not file.is_relative_to(PUBLIC) or not file.is_file():
            self.reply(404, {"error": "Страница не найдена"})
            return
        content = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(file))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "public, max-age=86400" if path.startswith("/assets/") else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32768:
                self.reply(413, {"error": "Недопустимый размер запроса"})
                return
            path = urllib.parse.urlparse(self.path).path
            if path == "/telegram/webhook":
                if not TOKEN or not hmac.compare_digest(self.headers.get("X-Telegram-Bot-Api-Secret-Token", ""), WEBHOOK_SECRET):
                    self.reply(403, {"error": "Forbidden"})
                    return
                body = json.loads(self.rfile.read(length))
                handle_update(body)
                self.reply(200, {"ok": True})
                return
            body = json.loads(self.rfile.read(length))
            if path not in ("/api/state", "/api/dispense", "/api/access", "/api/profile", "/api/faq", "/api/companion", "/api/collect"):
                self.reply(404, {"error": "Unknown action"})
                return
            try:
                user = validate_init_data(str(body.get("initData", "")))
            except (ValueError, KeyError, TypeError):
                self.reply(401, {"error": "Откройте робота заново из личного чата с ботом."})
                return
            ROSTER.refresh()
            with db() as con:
                con.execute("BEGIN IMMEDIATE")
                upsert_profile(con, user)
                if path == "/api/dispense":
                    key = str(body.get("requestId", ""))
                    if not 8 <= len(key) <= 100:
                        raise ValueError("Недопустимый номер обращения")
                    receipt = self_issue(con, user["id"], "app:" + key, notify=False)
                    result = {"receipt": receipt, **state(con, user["id"])}
                elif path == "/api/access":
                    require_character(con, user["id"])
                    key = str(body.get("requestId", ""))
                    if not 8 <= len(key) <= 100:
                        raise ValueError("Недопустимый номер обращения")
                    target = str(body.get("target", ""))
                    parts = target.split("-")
                    if len(parts) != 2 or parts[0] not in ACCESS_SERVICES or parts[1] not in ("2", "3", "4"):
                        raise ValueError("Выберите службу и уровень кнопками")
                    request = access_request(con, user["id"], target, "app:" + key, notify=False)
                    result = {"request": request, **state(con, user["id"])}
                elif path == "/api/profile":
                    character = str(body.get("character", "")).strip()
                    if len(character) > 80:
                        raise ValueError("Имя: до 80 символов")
                    status = register_character(con, user["id"], character, source="app")
                    result = {"registration_status": status, **state(con, user["id"])}
                elif path == "/api/companion":
                    key = str(body.get("requestId", ""))
                    if not 8 <= len(key) <= 100:
                        raise ValueError("Недопустимый номер обращения")
                    request = companion_request(con, user["id"], str(body.get("recipient", "")), body.get("report", ""), "app:" + key, source="app")
                    result = {"request": {"id": request["id"], "status": request["status"]}, **state(con, user["id"])}
                elif path == "/api/collect":
                    receipt = collect_companion(con, user["id"], str(body.get("id", "")), notify=False)
                    result = {"receipt": receipt, **state(con, user["id"])}
                elif path == "/api/faq":
                    item = next((f for f in FAQ if f["id"] == body.get("id")), None)
                    if not item:
                        raise ValueError("Вопрос не найден")
                    result = {"ok": True, "answer": item["answer"]}
                else:
                    result = state(con, user["id"])
                result["faq"] = FAQ
                result["accesses"] = ACCESS_CATALOG
            self.reply(200, result)
        except ValueError as exc:
            self.reply(400, {"error": str(exc)})
        except (KeyError, TypeError):
            self.reply(400, {"error": "Не удалось обработать запрос. Откройте робота заново из личного чата с ботом."})
        except Exception as exc:
            print("Request:", type(exc).__name__, flush=True)
            self.reply(503, {"error": "Контроллер временно недоступен. Повторите обращение чуть позже."})


def roster_worker():
    while not STOP.is_set():
        try:
            ROSTER.refresh()
        except ValueError:
            print("Character registry temporarily unavailable", flush=True)
        STOP.wait(60)


def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not (TOKEN and APP_URL and os.environ.get("DATA_DIR")):
        raise SystemExit("BOT_TOKEN, APP_URL and persistent DATA_DIR are required")
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not os.path.ismount(DATA_DIR):
        raise SystemExit("Persistent database volume is not mounted; refusing to create an empty database")
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not (DATA_DIR / "protectoron.sqlite3").is_file():
        existing = BACKUPS.status().get("local_at") or BACKUPS.s3().list_objects_v2(Bucket=BACKUPS.bucket, Prefix="protectoron/daily/", MaxKeys=1).get("Contents")
        if existing:
            raise SystemExit("Existing database is missing; restore a verified backup instead of creating an empty database")
    init_db()
    threading.Thread(target=BACKUPS.worker, args=(STOP, backup_warning), daemon=True).start()
    threading.Thread(target=SHEETS.worker, args=(STOP,), daemon=True).start()
    if TOKEN and APP_URL:
        threading.Thread(target=setup_bot, daemon=True).start()
        threading.Thread(target=outbox_worker, daemon=True).start()
        threading.Thread(target=roster_worker, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler)
    print("Controller HTTP server ready", flush=True)
    try:
        server.serve_forever()
    finally:
        STOP.set()
        server.server_close()


if __name__ == "__main__":
    main()
