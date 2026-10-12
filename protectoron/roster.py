"""Read the owner-provided, already link-readable character registry."""
import csv
import io
import threading
import time
import urllib.request


def normalize(value):
    return " ".join(str(value).strip().casefold().replace("ё", "е").split())


def parse_roster(data):
    rows = list(csv.reader(io.StringIO(data.lstrip("\ufeff"))))
    if not rows:
        raise ValueError("Character registry is empty")
    names = {normalize(name): index for index, name in enumerate(rows[0])}
    required = ["имя персонажа", "класс", "степень"]
    if any(name not in names for name in required):
        raise ValueError("Character registry headers do not match")
    result = {}
    for cells in rows[1:]:
        def get(column):
            index = names.get(column, -1)
            return cells[index].strip() if 0 <= index < len(cells) else ""
        name = get("имя персонажа")
        if not name:
            continue
        key = normalize(name)
        if key in result:
            raise ValueError("Duplicate character names")
        value = get("степень").upper()
        degree = {"I": 1, "II": 2, "III": 3, "1": 1, "2": 2, "3": 3}.get(value)
        kind = get("класс")
        result[key] = {"key": key, "name": name, "class": kind, "degree": degree,
                       "eligible": normalize(kind) == "гуль" and degree is not None,
                       "username": get("telegram-аккаунт").lstrip("@"),
                       "telegram_id": get("telegram id")}
    if not result:
        raise ValueError("No characters in registry")
    return result


class Roster:
    def __init__(self, url=""):
        self.url, self.entries, self.updated_at = url, {}, 0
        self.lock = threading.RLock()

    def refresh(self, force=False):
        with self.lock:
            if not force and time.time() - self.updated_at < 60:
                return self.entries
            if not self.url:
                raise ValueError("Character registry is not configured")
            try:
                request = urllib.request.Request(self.url, headers={"Cache-Control": "no-cache"})
                with urllib.request.urlopen(request, timeout=15) as response:
                    data = response.read(250001)
                if len(data) > 250000:
                    raise ValueError("Registry exceeds expected size")
                entries = parse_roster(data.decode("utf-8"))
                self.entries, self.updated_at = entries, time.time()
            except Exception:
                # No stale or guessed eligibility after losing registry access.
                raise ValueError("Не удалось сверить реестр персонажей. Повторите обращение позже.") from None
            return self.entries

    def get(self, name):
        return self.entries.get(normalize(name))


def account_matches(entry, user):
    if entry["telegram_id"]:
        return entry["telegram_id"] == str(user["id"])
    if entry["username"]:
        return entry["username"].casefold() == str(user.get("username", "")).lstrip("@").casefold()
    return False
