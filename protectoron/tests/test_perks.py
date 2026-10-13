import copy
import http.client
import json
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import perks
import server
from sheets import SheetsError
from roster import Roster, parse_roster
from test_controller import signed


def fixture():
    return {"ok": True, "version": 2, "catalog_revision": perks.REVISION, "character": "Цифер",
        "character_id": "character-cipher", "points": 8, "points_configured": True, "points_editable": True,
        "level": 1, "free_choices": 1, "class_id": "survivalist_rooted", "class_skills": [],
        "can_acquire": True, "owned": [{"id": "app:101:request-1", "character_id": "character-cipher",
          "character": "Цифер", "perk_id": "light_step", "mode": "paid", "cost": 2,
          "balance_after": 8, "created_at": 1000, "user_id": "101", "username": "@player", "skills": []}]}


class PerkTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(server, "DATA_DIR", Path(self.directory.name))
        self.patch.start(); server.init_db()

    def tearDown(self):
        self.patch.stop(); self.directory.cleanup()

    def test_reconcile_replay_and_restore_are_idempotent_and_silent(self):
        data = perks.validate_snapshot(fixture(), "Цифер")
        with server.db() as con:
            perks.reconcile(con, data); perks.reconcile(con, data)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM perk_receipts").fetchone()[0], 1)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events WHERE kind='perk'").fetchone()[0], 1)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)
            con.execute("DELETE FROM events WHERE kind='perk'")
            perks.reconcile(con, data)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM events WHERE kind='perk'").fetchone()[0], 1)

    def test_deleted_sheet_receipt_blocks_repurchase(self):
        with server.db() as con:
            perks.reconcile(con, fixture())
            missing = fixture(); missing["owned"] = []
            with self.assertRaisesRegex(SheetsError, "inventory_mismatch"):
                perks.reconcile(con, missing)

    def test_balances_levels_prices_and_catalog_fail_closed(self):
        for key, value in [("points", True), ("points", -1), ("level", 10), ("free_choices", 2), ("catalog_revision", "old")]:
            data = fixture(); data[key] = value
            with self.assertRaises(SheetsError):
                perks.validate_snapshot(data, "Цифер")
        data = fixture(); data["owned"][0]["cost"] = 6
        with self.assertRaises(SheetsError):
            perks.validate_snapshot(data, "Цифер")

    def test_purchase_receipt_must_match_the_actor_and_operation(self):
        data = fixture()
        class Bridge:
            def call(self, payload):
                return {"ok": True, "state": data, "receipt": data["owned"][0]}
        bridge = Bridge()
        perks.acquire(bridge, "Цифер", "light_step", "paid", "app:101:request-1", {"id": 101})
        with self.assertRaises(SheetsError):
            perks.acquire(bridge, "Цифер", "light_step", "paid", "app:202:request-1", {"id": 202})

    def test_client_cannot_choose_price_or_buy_class_perks(self):
        class Bridge:
            def call(self, payload):
                raise AssertionError("Invalid actions must not be sent")
        for perk_id, mode in [("unknown", "paid"), ("strong_back", "paid"), ("life_giver", "free")]:
            with self.assertRaises(SheetsError):
                perks.acquire(Bridge(), "Цифер", perk_id, mode, "request-one", {"id": 101})

    def test_public_snapshot_removes_transport_and_actor_ids(self):
        data = perks.public_snapshot(fixture())
        self.assertNotIn("id", data["owned"][0]); self.assertNotIn("user_id", data["owned"][0])
        self.assertEqual(data["points"], 8); self.assertEqual(data["level"], 1)

    def test_owned_inventory_is_per_character_not_per_telegram_account(self):
        data = fixture(); data["owned"][0]["user_id"] = "202"
        self.assertEqual(perks.validate_snapshot(data, "Цифер")["owned"][0]["user_id"], "202")
        data["owned"][0]["character_id"] = "another-character"
        with self.assertRaises(SheetsError):
            perks.validate_snapshot(data, "Цифер")

    def test_frontend_and_assets_are_self_contained_and_versioned(self):
        html = (server.PUBLIC / "index.html").read_text()
        self.assertIn('src="/telegram-web-app.js"', html)
        self.assertNotIn('src="https://telegram.org', html)
        self.assertIn('app.js?v=', html)
        for perk in perks.PERKS.values():
            self.assertTrue((server.PUBLIC / perk["image"].lstrip("/")).is_file())

    def test_head_supported_without_a_body(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
        try:
            conn = http.client.HTTPConnection("127.0.0.1", httpd.server_port)
            conn.request("HEAD", "/"); response = conn.getresponse()
            self.assertEqual(response.status, 200); self.assertEqual(response.read(), b"")
            self.assertGreater(int(response.getheader("Content-Length")), 0)
            conn.request("GET", "/perks.json"); response = conn.getresponse()
            self.assertEqual(response.status, 200); self.assertEqual(len(json.loads(response.read())["perks"]), 23)
            conn.close()
        finally:
            httpd.shutdown(); httpd.server_close(); thread.join()

    def test_authenticated_http_shop_is_silent_and_ignores_client_price(self):
        data = fixture(); calls = []
        class Bridge:
            def call(self, payload):
                calls.append(payload)
                return data if payload["action"] == "shop_state" else {"ok": True, "state": data, "receipt": data["owned"][0]}
        roster = Roster(); roster.entries = parse_roster("Имя персонажа,Класс,Степень\nЦифер,Гуль,II\n")
        with server.db() as con:
            server.upsert_profile(con, {"id": 101, "first_name": "Игрок"})
            con.execute("UPDATE profiles SET character='Цифер' WHERE user_id=101")
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
        try:
            with patch.object(server, "TOKEN", "test-token"), patch.object(server, "SHEETS", Bridge()), patch.object(server, "ROSTER", roster), patch.object(roster, "refresh", return_value=roster.entries):
                conn = http.client.HTTPConnection("127.0.0.1", httpd.server_port)
                conn.request("POST", "/api/perks", json.dumps({"initData": ""}), {"Content-Type": "application/json"})
                response = conn.getresponse(); self.assertEqual(response.status, 401); response.read(); self.assertEqual(calls, [])
                body = {"initData": signed(now=int(time.time())), "character": "Цифер", "perkId": "light_step", "mode": "paid", "requestId": "request-1", "cost": -1000}
                for _ in range(2):
                    conn.request("POST", "/api/perk-acquire", json.dumps(body), {"Content-Type": "application/json"})
                    response = conn.getresponse(); self.assertEqual(response.status, 200)
                    result = json.loads(response.read()); self.assertEqual(result["shop"]["points"], 8); self.assertEqual(result["perk_receipt"]["cost"], 2)
                self.assertNotIn("cost", calls[-1]); self.assertEqual(calls[-1]["request_id"], "app:101:request-1")
                conn.close()
            with server.db() as con:
                self.assertEqual(con.execute("SELECT COUNT(*) FROM events WHERE kind='perk'").fetchone()[0], 1)
                self.assertEqual(con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)
        finally:
            httpd.shutdown(); httpd.server_close(); thread.join()
