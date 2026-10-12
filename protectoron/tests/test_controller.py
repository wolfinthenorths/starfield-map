import hashlib
import hmac
import json
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch
import server


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
        with server.db() as con:
            server.upsert_profile(con, {"id": 101, "first_name": "Игрок"})
            server.upsert_profile(con, {"id": 202, "first_name": "Другой"})

    def tearDown(self):
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
            self.assertIn("степень гулификации", sent["text"])
            callback = sent["reply_markup"]["inline_keyboard"][2][0]["callback_data"]
        update = {"update_id": 12, "callback_query": {"id": "callback", "from": {"id": 101},
                  "message": {"chat": {"id": 101, "type": "private"}}, "data": callback}}
        with patch.object(server, "telegram", return_value=True):
            server.handle_update(update)
            server.handle_update(update)
            server.handle_update({**update, "update_id": 13})
        with server.db() as con:
            events = server.state(con, 101)["events"]
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["payload"]["units"], 3)

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


if __name__ == "__main__":
    unittest.main()
