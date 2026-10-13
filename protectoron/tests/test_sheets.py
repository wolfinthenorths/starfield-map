import hashlib
import hmac
import io
import json
import threading
import unittest
from unittest.mock import patch
from sheets import GoogleRedirect, SheetsBridge, SheetsError


class SheetsTests(unittest.TestCase):
    def setUp(self):
        self.bridge = SheetsBridge("https://script.google.com/macros/s/test-script/exec", "test-key-" * 8)

    def response(self, value):
        return io.BytesIO(json.dumps(value).encode())

    def test_payload_signed_exactly_with_cyrillic(self):
        envelope = self.bridge.envelope({"action": "balance", "character": "Цифер"}, now=1000)
        self.assertEqual(envelope["timestamp"], 1000000)
        self.assertTrue(envelope["payload"].isascii())
        self.assertEqual(json.loads(envelope["payload"])["character"], "Цифер")
        self.assertNotIn(self.bridge.secret, json.dumps(envelope))
        self.assertEqual(envelope["signature"], hmac.new(self.bridge.secret.encode(),
            ("1000000\n" + envelope["payload"]).encode(), hashlib.sha256).hexdigest())

    def test_missing_or_non_google_configuration_disabled(self):
        for url, secret in [("", ""), (self.bridge.url, "short"),
                ("https://example.com/exec", self.bridge.secret),
                (self.bridge.url + "?secret=bad", self.bridge.secret)]:
            bridge = SheetsBridge(url, secret)
            self.assertFalse(bridge.configured)
            with self.assertRaises(SheetsError):
                bridge.verify()

    def test_unknown_actions_never_sent(self):
        with patch.object(self.bridge.opener, "open") as transport:
            with self.assertRaises(SheetsError):
                self.bridge.call({"action": "spend", "points": 2})
            transport.assert_not_called()

    def test_verification_and_failure_status(self):
        with patch.object(self.bridge, "call", return_value={"ok": True, "version": 1,
                "registry_ready": True, "write_verified": True}):
            self.bridge.verify()
        self.assertTrue(self.bridge.status()["write_verified"])
        with patch.object(self.bridge, "call", side_effect=SheetsError("failed")):
            with self.assertRaises(SheetsError):
                self.bridge.verify()
        self.assertFalse(self.bridge.status()["connected"])

    def test_expired_verification_not_healthy(self):
        self.bridge.connected = self.bridge.write_verified = True
        self.bridge.checked_at = 1
        self.assertFalse(self.bridge.status()["connected"])

    def test_blank_balance_not_zero(self):
        with patch.object(self.bridge, "call", return_value={"ok": True, "points": None, "configured": False}):
            self.assertIsNone(self.bridge.balance("Цифер"))
        for value in (2, 0):
            with patch.object(self.bridge, "call", return_value={"ok": True, "points": value, "configured": True}):
                self.assertEqual(self.bridge.balance("Цифер"), value)

    def test_invalid_balance_not_accepted(self):
        for value in (True, -1, "2", 2.5, None):
            with patch.object(self.bridge, "call", return_value={"ok": True, "points": value, "configured": True}):
                with self.assertRaises(SheetsError):
                    self.bridge.balance("Цифер")

    def test_bad_responses_and_errors_do_not_leak(self):
        with patch.object(self.bridge.opener, "open", side_effect=RuntimeError(self.bridge.secret + self.bridge.url)):
            with self.assertRaises(SheetsError) as caught:
                self.bridge.verify()
        self.assertNotIn(self.bridge.secret, str(caught.exception))
        self.assertNotIn(self.bridge.url, str(caught.exception))
        for value in ({"ok": False, "error": self.bridge.secret}, [1], {"ok": 1}):
            with patch.object(self.bridge.opener, "open", return_value=self.response(value)):
                with self.assertRaises(SheetsError):
                    self.bridge.call({"action": "verify_connection"})

    def test_unsafe_redirects_rejected(self):
        for url in ("http://script.google.com/", "https://example.com/", "https://secret@script.google.com/"):
            with self.assertRaises(SheetsError):
                GoogleRedirect().redirect_request(None, None, 302, "", {}, url)

    def test_unconfigured_worker_does_no_network_work(self):
        bridge = SheetsBridge()
        with patch.object(bridge, "verify") as verify:
            bridge.worker(threading.Event())
            verify.assert_not_called()
