"""Private Telegram NPC and its sprite-based Mini App. No third-party runtime deps."""
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

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
ACCESS_CATALOG = json.loads((PUBLIC / "accesses.json").read_text())
ACCESS_SERVICES = {item["code"]: item for item in ACCESS_CATALOG["services"]}
TEST_URLS = json.loads(os.environ.get("QUALIFICATION_TEST_URLS", "{}"))
TOKEN = os.environ.get("BOT_TOKEN", "")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT / "local-data")))
JOURNAL_TOKEN = os.environ.get("JOURNAL_TOKEN", "")
WEBHOOK_SECRET = hmac.new(TOKEN.encode(), b"protectoron-webhook", hashlib.sha256).hexdigest()
STOP = threading.Event()
ROMAN = {1: "I", 2: "II", 3: "III"}
FAQ = [
    {"id": "purpose", "question": "Для чего нужен мистериум?", "answer": "Мистериум необходим для поддержания контроля при гулификации. Индивидуальная полная доза зависит от степени: I — 1 единица, II — 2 единицы, III — 3 единицы."},
    {"id": "interval", "question": "Как часто принимать дозу?", "answer": "Полная доза нужна каждые 10 собственных игровых ходов. Получение препарата не считается его приёмом. Отыгрыш приёма остаётся за игроком."},
    {"id": "turn", "question": "Что считается ходом?", "answer": "Засчитывается собственный игровой пост с действием, в том числе передвижением или отыгрышем реквеста. Обычные диалоги, спасброски, технические сообщения и дополнительные ответы не засчитываются."},
    {"id": "missed", "question": "Что будет при пропуске приёма?", "answer": "После первых 10 ходов без новой дозы: на следующих ходах 1–3 действует помеха, на 4-м мастер может изменить реквест, на 5-м управление полностью передаётся мастеру. Полная доза возвращает контроль и сбрасывает счётчик."},
    {"id": "access", "question": "Как повысить доступ?", "answer": "Выберите службу и нужный уровень её полномочий. Повышение квалификации проводится через тест; ссылка будет добавлена позже. Уровни разных служб учитываются отдельно: 1 — вспомогательный, 2 — рабочий, 3 — расширенный, 4 — критический. Уровень персонажа и номер этажа не обозначают служебный допуск. Ω не является пятым уровнем и не выдаётся штатным сотрудникам."},
    {"id": "materials", "question": "Где найти материалы проекта?", "answer": "Материалы проекта доступны на DOTD Dossier и в архиве Starfield. Действующие условия конкретной сцены уточняет мастер."},
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
        """)
        columns = {row[1] for row in con.execute("PRAGMA table_info(profiles)")}
        if "username" not in columns:
            con.execute("ALTER TABLE profiles ADD COLUMN username TEXT NOT NULL DEFAULT ''")


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
    return {"profile": {k: profile[k] for k in ("name", "character", "degree", "access_level")},
            "events": [{**dict(row), "payload": json.loads(row["payload"])} for row in rows]}


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
            [cb("Повысить доступ", "access"), cb("Задать вопрос", "faq")],
            [cb("Мой журнал", "history"), cb("Имя персонажа", "character")]]
    if APP_URL:
        rows.append([app_button()])
    return keyboard(rows)


def queue(con, user_id, text, markup=None):
    payload = {"chat_id": user_id, "text": text, "parse_mode": "HTML"}
    if markup:
        payload["reply_markup"] = markup
    con.execute("INSERT INTO outbox(user_id,payload) VALUES(?,?)", (user_id, json.dumps(payload, ensure_ascii=False)))


def new_prompt(con, user_id, kind):
    key = secrets.token_hex(6)
    con.execute("INSERT INTO prompts(id,user_id,kind,created_at) VALUES(?,?,?,?)",
                (key, user_id, kind, int(time.time())))
    return key


def consume_prompt(con, key, user_id, kind):
    row = con.execute("SELECT * FROM prompts WHERE id=? AND user_id=? AND kind=?",
                      (key, user_id, kind)).fetchone()
    if not row or row["consumed"] or int(time.time()) - row["created_at"] > 3600:
        return False
    con.execute("UPDATE prompts SET consumed=1 WHERE id=?", (key,))
    return True


def issue(con, user_id, degree, key, notify=True):
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
    con.execute("INSERT INTO events VALUES(?,?,?,?,?,?)", (event_id, user_id, "dispense", json.dumps(payload), now, key))
    con.execute("UPDATE profiles SET degree=?,updated_at=? WHERE user_id=?", (degree, now, user_id))
    who = html.escape(profile["character"] or profile["name"])
    texts = [
        f"Оптический датчик Протектрона задерживается на посетителе, после чего в корпусе раздаётся короткий щелчок. «{who}. Степень гулификации {ROMAN[degree]} принята. Подготавливаю полную дозу». Замок контейнера отходит в сторону, и крышка медленно поднимается, открывая кассету с препаратом.",
        f"«{who}. Степень гулификации {ROMAN[degree]}. Запрос обработан». Протектрон поворачивается к контейнеру; сервопривод с негромким гудением освобождает крышку, а индикатор над кассетой сменяет янтарный свет на зелёный. «Препарат доступен к получению».",
        f"Внутри корпуса Протектрона негромко потрескивает реле. «{who}. Степень гулификации {ROMAN[degree]} зафиксирована». Робот отводит запор контейнера, и поднявшаяся крышка открывает подготовленную кассету. «Пожалуйста, соблюдайте интервал приёма».",
    ]
    text = texts[int(event_id[:4], 16) % len(texts)]
    unit_word = "единица" if degree == 1 else "единицы"
    text += f"\n\n<b>Мистериум: {degree} {unit_word} — одна полная доза.</b>\nПолучение препарата не фиксирует его приём."
    rows = [[cb("Инструкция по приёму", "faq:interval")], [cb("Вернуться к контроллеру", "home")]]
    if APP_URL:
        rows.insert(0, [app_button("Посмотреть выдачу", f"?receipt={event_id}")])
    if notify:
        queue(con, user_id, text, keyboard(rows))
    return {"id": event_id, **payload, "created_at": now, "repeated": False}


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
          f"{test_note}\n\nОбращение сохранено в вашем журнале. Выбор кнопки сам по себе допуск не повышает.",
          keyboard(rows))
    return {"id": event_id, "target": target, "repeated": False, "test_url": url}


def handle_update(update):
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
                  "«Контроллер готов к обслуживанию. Укажите цель обращения».", home_keyboard())
        elif text.startswith("/mysterium") or data == "mysterium":
            prompt = new_prompt(con, user_id, "degree")
            queue(con, user_id, "Протектрон разворачивает диагностическую панель. «Для подготовки индивидуальной дозы "
                  "укажите степень гулификации вашего персонажа».\n\n<b>Какова ваша степень гулификации?</b>",
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
            prompt = new_prompt(con, user_id, "access-service")
            choices = [cb(f"{item['code']} · {item['name']}", f"accessservice:{prompt}:{item['code']}") for item in ACCESS_CATALOG["services"]]
            queue(con, user_id, "На панели Протектрона загорается индикатор допуска. «Уточните, какой именно доступ "
                  "вам требуется повысить».\n\n<b>Выберите службу:</b>",
                  keyboard([choices[i:i + 2] for i in range(0, len(choices), 2)] + [[cb("Вернуться", "home")]]))
        elif data.startswith("accessservice:"):
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
            queue(con, user_id, "«Справочный модуль активен. Выберите вопрос».",
                  keyboard([[cb(item["question"], "faq:" + item["id"])] for item in FAQ] + [[cb("Вернуться", "home")]]))
        elif data.startswith("faq:"):
            item = next((item for item in FAQ if item["id"] == data.split(":", 1)[1]), None)
            if item:
                rows = [[cb("Другой вопрос", "faq"), cb("Вернуться", "home")]]
                if item["id"] == "materials":
                    rows.insert(0, [{"text": "DOTD Dossier", "url": "https://dotdossier.com/"},
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
                          "Обратитесь к мастеру или выберите раздел из меню».", home_keyboard())


def outbox_worker():
    while not STOP.wait(0.8):
        try:
            with db() as con:
                row = con.execute("SELECT * FROM outbox WHERE delivered=0 AND next_attempt<=? ORDER BY id LIMIT 1",
                                  (int(time.time()),)).fetchone()
            if not row:
                continue
            try:
                telegram("sendMessage", json.loads(row["payload"]))
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
            self.reply(200, {"ok": True, "bot_configured": bool(TOKEN and APP_URL)})
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
            if path not in ("/api/state", "/api/dispense", "/api/access", "/api/profile", "/api/faq"):
                self.reply(404, {"error": "Unknown action"})
                return
            user = validate_init_data(str(body.get("initData", "")))
            with db() as con:
                con.execute("BEGIN IMMEDIATE")
                upsert_profile(con, user)
                if path == "/api/dispense":
                    key = str(body.get("requestId", ""))
                    if not 8 <= len(key) <= 100:
                        raise ValueError("Недопустимый номер обращения")
                    receipt = issue(con, user["id"], body.get("degree"), "app:" + key, notify=False)
                    result = {"receipt": receipt, **state(con, user["id"])}
                elif path == "/api/access":
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
                    con.execute("UPDATE profiles SET character=? WHERE user_id=?", (character, user["id"]))
                    result = state(con, user["id"])
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
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            self.reply(400, {"error": "Не удалось обработать запрос. Откройте робота заново из личного чата с ботом."})
        except Exception as exc:
            print("Request:", type(exc).__name__, flush=True)
            self.reply(503, {"error": "Контроллер временно недоступен. Повторите обращение чуть позже."})


def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not (TOKEN and APP_URL and os.environ.get("DATA_DIR")):
        raise SystemExit("BOT_TOKEN, APP_URL and persistent DATA_DIR are required")
    init_db()
    if TOKEN and APP_URL:
        threading.Thread(target=setup_bot, daemon=True).start()
        threading.Thread(target=outbox_worker, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler)
    print("Controller HTTP server ready", flush=True)
    try:
        server.serve_forever()
    finally:
        STOP.set()
        server.server_close()


if __name__ == "__main__":
    main()
