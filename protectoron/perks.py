"""Per-character shop with a Sheets transaction ledger and a durable SQLite mirror."""
import hashlib
import json
import re
from pathlib import Path
from roster import normalize
from sheets import SheetsError, BUSINESS_ERRORS

CATALOG = json.loads((Path(__file__).parent / "public/perks.json").read_text())
PERKS = {item["id"]: item for item in CATALOG["perks"]}
REVISION = hashlib.sha256(json.dumps([{k: p[k] for k in ("id", "name", "group", "cost", "class")}
    for p in CATALOG["perks"]], ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()[:16]
CLASS_SKILLS = {"Анализ", "История", "Расследование", "Инженерия", "Медицина", "Убеждение"}
MESSAGES = {
    "invalid_balance": 'Доступные очки навыков не указаны в реестре системы или записаны некорректно. Покупка не оформлена.',
    "balance_formula": 'Не удалось определить доступный остаток очков навыков. Покупка не оформлена. Обратитесь к Смотрителю.',
    "already_owned": 'Этот перк у Вас уже есть; повторное получение и списание очков не требуются.',
    "not_enough_points": "Доступных очков навыков недостаточно для покупки выбранного перка. Списание не выполнено.",
    "level_unknown": 'Ваш уровень ещё не указан в реестре системы, поэтому бесплатный выбор пока недоступен.',
    "no_free_choice": 'Все бесплатные выборы за указанные в реестре системы уровни уже использованы.',
    "invalid_class": 'Ваш класс ещё не указан в реестре системы или не распознан; оформление развития пока недоступно.',
    "invalid_skills": "Выберите два разных навыка из предложенного списка, чтобы закрепить действие классового перка.",
    "small_only": "Бесплатно за уровень можно выбрать только малый перк.",
    "id_conflict": "Данные этого обращения не совпадают с сохранённой покупкой. Обновите модуль развития.",
    "unknown_perk": "Выбранный перк отсутствует в действующем каталоге.",
    "invalid_mode": "Для выбранного перка этот способ получения недоступен.",
    "invalid_character": 'Сначала укажите Ваше имя из реестра системы.',
    "character_not_found": 'Не удалось найти Вашу запись в реестре системы. Обновите регистрационные данные.',
}


def initialize(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS perk_receipts (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, perk_id TEXT NOT NULL,
      user_id INTEGER NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE(character_id,perk_id));
    """)


def validate_snapshot(data, character):
    if (not isinstance(data, dict) or data.get("version") != 2 or data.get("catalog_revision") != REVISION or
            normalize(data.get("character", "")) != normalize(character) or
            not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", str(data.get("character_id", "")))):
        raise SheetsError("invalid_response")
    points, level, free = data.get("points"), data.get("level"), data.get("free_choices")
    if points is not None and (type(points) is not int or not 0 <= points <= 10**9):
        raise SheetsError("invalid_response")
    if level is not None and (type(level) is not int or not 0 <= level <= 9):
        raise SheetsError("invalid_response")
    if free is not None and (type(free) is not int or level is None or not 0 <= free <= level):
        raise SheetsError("invalid_response")
    if (type(data.get("points_editable")) is not bool or type(data.get("can_acquire")) is not bool or
            not isinstance(data.get("owned"), list) or len(data["owned"]) > len(PERKS)):
        raise SheetsError("invalid_response")
    if data.get("class_id") is not None and data["class_id"] not in PERKS:
        raise SheetsError("invalid_response")
    ids, perk_ids = set(), set()
    for receipt in data["owned"]:
        validate_receipt(receipt, data["character_id"])
        if receipt["id"] in ids or receipt["perk_id"] in perk_ids:
            raise SheetsError("invalid_response")
        ids.add(receipt["id"]); perk_ids.add(receipt["perk_id"])
    class_skills = data.get("class_skills", [])
    if (not isinstance(class_skills, list) or len(class_skills) not in (0, 2) or
            len(set(class_skills)) != len(class_skills) or any(s not in CLASS_SKILLS for s in class_skills)):
        raise SheetsError("invalid_response")
    return data


def validate_receipt(receipt, character_id):
    if not isinstance(receipt, dict):
        raise SheetsError("invalid_response")
    perk = PERKS.get(receipt.get("perk_id"))
    mode = receipt.get("mode")
    if (not perk or receipt.get("character_id") != character_id or mode not in ("paid", "free", "class") or
            not re.fullmatch(r"[A-Za-z0-9:_-]{8,150}", str(receipt.get("id", ""))) or
            not re.fullmatch(r"[1-9]\d{0,19}", str(receipt.get("user_id", ""))) or
            type(receipt.get("created_at")) is not int or receipt["created_at"] <= 0 or
            type(receipt.get("cost")) is not int or receipt["cost"] != (perk["cost"] if mode == "paid" else 0) or
            (mode == "free" and perk["group"] != "small") or
            (mode == "class" and perk["group"] != "class") or
            (mode == "paid" and perk["group"] == "class")):
        raise SheetsError("invalid_response")
    value = receipt.get("balance_after")
    if value is not None and (type(value) is not int or value < 0):
        raise SheetsError("invalid_response")
    return receipt


def public_snapshot(data):
    # Actor IDs and transport request IDs belong to server reconciliation, not the UI.
    result = {key: data.get(key) for key in ("character", "character_id", "points", "points_configured",
        "points_editable", "level", "free_choices", "class_id", "class_skills", "can_acquire")}
    result["owned"] = [{k: r.get(k) for k in ("perk_id", "mode", "cost", "balance_after", "created_at", "skills")} for r in data["owned"]]
    return result


def reconcile(con, snapshot):
    known = {row[0] for row in con.execute("SELECT id FROM perk_receipts WHERE character_id=?", (snapshot["character_id"],))}
    present = {r["id"] for r in snapshot["owned"]}
    if not known <= present:
        # Never repurchase after a damaged, truncated, or rolled-back Sheet ledger.
        raise SheetsError("inventory_mismatch")
    for receipt in snapshot["owned"]:
        encoded = json.dumps(receipt, ensure_ascii=False)
        con.execute("INSERT OR IGNORE INTO perk_receipts VALUES(?,?,?,?,?,?)", (receipt["id"],
            receipt["character_id"], receipt["perk_id"], int(receipt["user_id"]), encoded, receipt["created_at"]))
        payload = {k: receipt[k] for k in ("character", "perk_id", "mode", "cost", "balance_after", "skills")}
        payload["perk_name"] = PERKS[receipt["perk_id"]]["name"]
        event_id = "perk-" + hashlib.sha256(receipt["id"].encode()).hexdigest()
        con.execute("INSERT OR IGNORE INTO events(id,user_id,kind,payload,created_at,request_key) VALUES(?,?,?,?,?,?)",
            (event_id, int(receipt["user_id"]), "perk", json.dumps(payload, ensure_ascii=False), receipt["created_at"], receipt["id"]))


def snapshot(bridge, character):
    return validate_snapshot(bridge.call({"action": "shop_state", "character": character}), character)


def acquire(bridge, character, perk_id, mode, request_id, user, skills=None):
    perk = PERKS.get(perk_id)
    if not perk:
        raise SheetsError("unknown_perk")
    if mode not in ("paid", "free", "class") or (mode == "paid" and perk["group"] == "class"):
        raise SheetsError("invalid_mode")
    if mode == "free" and perk["group"] != "small":
        raise SheetsError("small_only")
    if mode == "class" and (perk_id != "twice_learned_chemist" or not isinstance(skills, list) or
            len(skills) != 2 or len(set(skills)) != 2 or any(s not in CLASS_SKILLS for s in skills)):
        raise SheetsError("invalid_skills")
    result = bridge.call({"action": "acquire_perk", "catalog_revision": REVISION, "character": character, "perk_id": perk_id,
        "mode": mode, "request_id": request_id, "user_id": str(user["id"]),
        "username": "@" + str(user["username"])[:32] if user.get("username") else "ID:" + str(user["id"]),
        "skills": sorted(skills) if mode == "class" else []})
    data = validate_snapshot(result.get("state"), character)
    receipt = validate_receipt(result.get("receipt"), data["character_id"])
    if (receipt["id"] != request_id or receipt["perk_id"] != perk_id or receipt["mode"] != mode or
            receipt["user_id"] != str(user["id"]) or not any(r["id"] == receipt["id"] for r in data["owned"])):
        raise SheetsError("invalid_response")
    return data, receipt

