import hashlib
import csv
import io
import hmac
import json
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch
import server
from roster import Roster, parse_roster, account_matches


def signed(user_id=101, now=1000, token="test-token"):
    fields = {"auth_date": str(now), "query_id": "test-query",
              "user": json.dumps({"id": user_id, "first_name": "Игрок"}, ensure_ascii=False)}
    check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(fields)


class AuthenticationTests(unittest.TestCase):
    def test_valid_signature_and_identity(self):
        self.assertEqual(server.validate_init_data(signed(), token="test-token", now=1005)["id"], 101)

    def test_forged_identity_rejected(self):
        fields = dict(urllib.parse.parse_qsl(signed()))
        fields["user"] = json.dumps({"id": 202})
        with self.assertRaises(ValueError):
            server.validate_init_data(urllib.parse.urlencode(fields), token="test-token", now=1005)

    def test_expired_and_future_rejected(self):
        for now in [5000, 500]:
            with self.assertRaises(ValueError):
                server.validate_init_data(signed(), token="test-token", now=now)

    def test_duplicate_fields_and_missing_token_rejected(self):
        with self.assertRaises(ValueError):
            server.validate_init_data(signed() + "&auth_date=1000", token="test-token", now=1005)
        with self.assertRaises(ValueError):
            server.validate_init_data(signed(), token="", now=1005)


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(server, "DATA_DIR", Path(self.directory.name))
        self.patch.start()
        server.init_db()
        roster = Roster("")
        roster.entries = parse_roster("Имя персонажа,Класс,Степень,Telegram-аккаунт,Telegram ID\nЦифер,Гуль,II,,101\nЭшвейл,Райдер,,,202\nНовый,Гуль,III,,\n")
        self.roster_patch = patch.object(server, "ROSTER", roster)
        self.roster_patch.start()
        self.refresh_patch = patch.object(roster, "refresh", return_value=roster.entries)
        self.refresh_patch.start()
        with server.db() as con:
            server.upsert_profile(con, {"id": 101, "first_name": "Игрок"})
            server.upsert_profile(con, {"id": 202, "first_name": "Другой"})
            con.execute("UPDATE profiles SET character='Цифер' WHERE user_id=101")
            con.execute("UPDATE profiles SET character='Эшвейл' WHERE user_id=202")
            server.set_setting(con, "gm_chat_id", -1001)

    def tearDown(self):
        self.refresh_patch.stop()
        self.roster_patch.stop()
        self.patch.stop()
        self.directory.cleanup()

    def test_all_three_doses_and_no_character_actions(self):
        with server.db() as con:
            for degree in [1, 2, 3]:
                result = server.issue(con, 101, degree, f"dose-{degree}")
                self.assertEqual(result["units"], degree)
            self.assertEqual(len(server.state(con, 101)["events"]), 3)
            for row in con.execute("SELECT payload FROM outbox"):
                text = json.loads(row[0])["text"]
                self.assertIn("Получение препарата не фиксирует его приём", text)
                self.assertNotIn("вы принимаете", text.lower())

    def test_concurrent_retry_records_only_one_issue(self):
        results = []
        def issue():
            with server.db() as con:
                con.execute("BEGIN IMMEDIATE")
                results.append(server.issue(con, 101, 3, "same-request"))
        threads = [threading.Thread(target=issue) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(len(results), 4)
        self.assertEqual(len({r["id"] for r in results}), 1)
        with server.db() as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events").fetchone()[0], 1)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 1)

    def test_user_history_isolation_and_bad_degree(self):
        with server.db() as con:
            server.issue(con, 101, 2, "request-101")
            self.assertEqual(server.state(con, 202)["events"], [])
            for degree in [0, 4, "2", True]:
                with self.assertRaises(ValueError):
                    server.issue(con, 101, degree, "bad-degree")

    def test_access_request_does_not_grant_access(self):
        with server.db() as con:
            first = server.access_request(con, 101, "Доступ к системам: уровень 2", "access-request")
            retry = server.access_request(con, 101, "Доступ к системам: уровень 2", "access-request")
            self.assertEqual(first["id"], retry["id"])
            result = server.state(con, 101)
            self.assertEqual(result["profile"]["access_level"], 1)
            self.assertEqual(result["events"][0]["payload"]["status"], "awaiting_testing")

    def test_buttons_degree_question_then_issue_and_duplicate_updates(self):
        message = {"chat": {"id": 101, "type": "private"}, "from": {"id": 101, "first_name": "Игрок"}, "text": "/mysterium"}
        server.handle_update({"update_id": 11, "message": message})
        with server.db() as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events").fetchone()[0], 0)
            sent = json.loads(con.execute("SELECT payload FROM outbox").fetchone()[0])
            self.assertIn("II", sent["text"])
            callback = sent["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        update = {"update_id": 12, "callback_query": {"id": "callback", "from": {"id": 101},
                  "message": {"chat": {"id": 101, "type": "private"}}, "data": callback}}
        with patch.object(server, "telegram", return_value=True):
            server.handle_update(update)
            server.handle_update(update)
            server.handle_update({**update, "update_id": 13})
        with server.db() as con:
            events = server.state(con, 101)["events"]
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["payload"]["units"], 2)

    def test_another_user_cannot_use_degree_prompt(self):
        with server.db() as con:
            key = server.new_prompt(con, 101, "degree")
            self.assertFalse(server.consume_prompt(con, key, 202, "degree"))
            self.assertTrue(server.consume_prompt(con, key, 101, "degree"))
            self.assertFalse(server.consume_prompt(con, key, 101, "degree"))

    def test_groups_are_ignored(self):
        server.handle_update({"update_id": 30, "message": {"chat": {"id": -1001, "type": "supergroup"},
                            "from": {"id": 101}, "text": "/mysterium"}})
        with server.db() as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_persistent_store_reopens_without_losing_history(self):
        with server.db() as con:
            server.issue(con, 101, 1, "persistent-dose")
        server.init_db()
        with server.db() as con:
            self.assertEqual(len(server.state(con, 101)["events"]), 1)

    def test_miniapp_actions_are_silent_and_keep_username_and_exact_time(self):
        with server.db() as con:
            server.upsert_profile(con, {"id": 101, "first_name": "Игрок", "username": "my_player"})
            with patch.object(server.time, "time", return_value=1791835200):
                server.issue(con, 101, 2, "silent-dose", notify=False)
            server.access_request(con, 101, "MED-2", "silent-access", notify=False)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)
            payload = next(e["payload"] for e in server.state(con, 101)["events"] if e["kind"] == "dispense")
            self.assertEqual(payload["telegram_username"], "@my_player")
            self.assertEqual(payload["units"], 2)
            self.assertEqual(payload["timezone"], "Asia/Tomsk")
            self.assertRegex(payload["taken_at"], r"\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}")

    def test_username_missing_uses_id_instead_of_invented_username(self):
        with server.db() as con:
            result = server.issue(con, 101, 1, "anonymous-dose", notify=False)
            self.assertEqual(result["telegram_username"], "ID:101")

    def test_access_buttons_follow_archive_services_then_levels(self):
        message = {"chat": {"id": 101, "type": "private"}, "from": {"id": 101}, "text": "/access"}
        server.handle_update({"update_id": 50, "message": message})
        with server.db() as con:
            sent = json.loads(con.execute("SELECT payload FROM outbox ORDER BY id DESC LIMIT 1").fetchone()[0])
            buttons = [b for row in sent["reply_markup"]["inline_keyboard"] for b in row]
            services = [b for b in buttons if b["callback_data"].startswith("accessservice:")]
            self.assertEqual(len(services), 12)
            med = next(b for b in services if b["callback_data"].endswith(":MED"))
        def click(update_id, data):
            return {"update_id": update_id, "callback_query": {"id": str(update_id), "from": {"id": 101},
                    "message": {"chat": {"id": 101, "type": "private"}}, "data": data}}
        with patch.object(server, "telegram", return_value=True):
            server.handle_update(click(51, med["callback_data"]))
            with server.db() as con:
                sent = json.loads(con.execute("SELECT payload FROM outbox ORDER BY id DESC LIMIT 1").fetchone()[0])
                buttons = [row[0] for row in sent["reply_markup"]["inline_keyboard"][:3]]
                self.assertEqual([b["text"].split(" · ")[0] for b in buttons], ["MED-2", "MED-3", "MED-4"])
            server.handle_update(click(52, buttons[0]["callback_data"]))
        with server.db() as con:
            event = server.state(con, 101)["events"][0]
            self.assertEqual(event["payload"]["target"], "MED-2")
            message = json.loads(con.execute("SELECT payload FROM outbox ORDER BY id DESC LIMIT 1").fetchone()[0])
            self.assertIn("Ссылка на испытание", message["text"])

    def test_future_test_url_is_configurable_per_clearance(self):
        with patch.object(server, "TEST_URLS", {"MED-2": "https://example.com/medical-test", "TEC-2": "javascript:alert(1)"}):
            self.assertEqual(server.test_url("MED-2"), "https://example.com/medical-test")
            self.assertEqual(server.test_url("TEC-2"), "")
            with server.db() as con:
                result = server.access_request(con, 101, "MED-2", "test-link")
                self.assertEqual(result["test_url"], "https://example.com/medical-test")

    def test_csv_journal_has_only_requested_columns_and_doses(self):
        with server.db() as con:
            server.upsert_profile(con, {"id": 101, "first_name": "Игрок", "username": "test_player"})
            server.issue(con, 101, 2, "csv-dose", notify=False)
            server.access_request(con, 101, "MED-2", "csv-access", notify=False)
            data = list(csv.reader(io.StringIO(server.dose_journal_csv(con).decode())))
            self.assertEqual(len(data), 2)
            self.assertEqual(len(data[0]), 3)
            self.assertEqual(data[1][0], "@test_player")
            self.assertEqual(data[1][1], "2 единицы · II степень")
            self.assertRegex(data[1][2], r"\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}")

    def test_self_dose_derived_from_registry_and_raider_denied(self):
        with server.db() as con:
            self.assertEqual(server.self_issue(con, 101, "own", False)["units"], 2)
            with self.assertRaises(ValueError): server.self_issue(con, 202, "raider", False)
            with self.assertRaises(ValueError): server.register_character(con, 202, "Цифер")

    def test_companion_approval_is_not_issuance_and_collection_is_once(self):
        with server.db() as con:
            request = server.companion_request(con, 202, "Цифер", "Товарищ ранен и не может прийти сам", "buddy", "app")
            with self.assertRaises(ValueError): server.collect_companion(con, 202, request["id"], False)
            with self.assertRaises(ValueError): server.decide_request(con, {"id": 777, "username": "outsider"}, request["id"], "approve")
            server.decide_request(con, {"id": 901, "username": "VaultTecGm"}, request["id"], "approve")
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events").fetchone()[0], 0)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox WHERE user_id>0").fetchone()[0], 0)
            with self.assertRaises(ValueError): server.collect_companion(con, 101, request["id"], False)
            first = server.collect_companion(con, 202, request["id"], False)
            second = server.collect_companion(con, 202, request["id"], False)
            self.assertEqual(first["id"], second["id"])
            self.assertEqual(first["recipient"], "Цифер")
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events").fetchone()[0], 1)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox WHERE user_id>0").fetchone()[0], 0)

    def test_companion_changed_degree_and_rejection_prevent_collection(self):
        with server.db() as con:
            request = server.companion_request(con, 202, "Цифер", "Нужна доставка товарищу", "change", "app")
            server.decide_request(con, {"id": 901, "username": "VaultTecGm"}, request["id"], "approve")
            server.ROSTER.get("Цифер")["degree"] = 3
            with self.assertRaises(ValueError): server.collect_companion(con, 202, request["id"], False)
            rejected = server.companion_request(con, 202, "Цифер", "Повторная доставка товарищу", "reject", "app")
            server.decide_request(con, {"id": 902, "username": "gj0xl"}, rejected["id"], "reject")
            with self.assertRaises(ValueError): server.collect_companion(con, 202, rejected["id"], False)

    def test_unmapped_registration_requires_gm_and_prevents_takeover(self):
        with server.db() as con:
            self.assertEqual(server.register_character(con, 202, "Новый", "app"), "pending")
            request = con.execute("SELECT id FROM requests WHERE kind='registration'").fetchone()[0]
            self.assertEqual(server.require_character(con, 202)["name"], "Эшвейл")
            server.decide_request(con, {"id": 901, "username": "VaultTecGm"}, request, "approve")
            self.assertEqual(server.require_character(con, 202)["name"], "Новый")
            with self.assertRaises(ValueError): server.register_character(con, 101, "Новый", "app")

    def test_group_binding_only_allowed_gm_with_code(self):
        with server.db() as con: con.execute("DELETE FROM settings")
        base = {"chat": {"id": -1009, "type": "supergroup"}, "text": "/bind_gm@ptotectoronbot test-code"}
        with patch.object(server, "GM_BIND_CODE", "test-code"):
            server.handle_update({"update_id": 70, "message": {**base, "from": {"id": 777, "username": "outsider"}}})
            with server.db() as con: self.assertIsNone(server.setting(con, "gm_chat_id"))
            server.handle_update({"update_id": 71, "message": {**base, "from": {"id": 901, "username": "VaultTecGm"}}})
            with server.db() as con: self.assertEqual(server.setting(con, "gm_chat_id"), -1009)


class RegistryTests(unittest.TestCase):
    def test_duplicate_names_rejected_and_owner_id_has_priority(self):
        with self.assertRaises(ValueError): parse_roster("Имя персонажа,Класс,Степень\nЦифер,Гуль,II\nцифер,Гуль,I")
        entry = parse_roster("Имя персонажа,Класс,Степень,Telegram-аккаунт,Telegram ID\n Цифер , Гуль ,II,@player,123")["цифер"]
        self.assertTrue(entry["eligible"])
        self.assertTrue(account_matches(entry, {"id": 123}))
        self.assertFalse(account_matches(entry, {"id": 999, "username": "player"}))


if __name__ == "__main__":
    unittest.main()
