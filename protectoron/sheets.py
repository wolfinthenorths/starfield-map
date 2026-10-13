"""Bounded, signed Apps Script connection; shop receipts are authoritative."""
import hashlib
import hmac
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


class SheetsError(RuntimeError):
    pass


BUSINESS_ERRORS = {"invalid_balance", "balance_formula", "unknown_perk", "already_owned",
    "id_conflict", "invalid_mode", "not_enough_points", "level_unknown", "no_free_choice",
    "small_only", "invalid_class", "invalid_skills", "invalid_character", "character_not_found"}


class GoogleRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if (parsed.scheme != "https" or parsed.hostname not in
                ("script.google.com", "script.googleusercontent.com") or
                parsed.username or parsed.password or parsed.port not in (None, 443)):
            raise SheetsError("unsafe_redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class SheetsBridge:
    def __init__(self, url="", secret=""):
        self.url = url
        self.secret = secret
        self.lock = threading.Lock()
        self.checked_at = None
        self.connected = False
        self.write_verified = False
        self.shop_ready = False
        self.opener = urllib.request.build_opener(GoogleRedirect())

    @property
    def configured(self):
        return bool(re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", self.url)
                    and len(self.secret) >= 32)

    def envelope(self, payload, now=None):
        timestamp = int((time.time() if now is None else now) * 1000)
        # Keep the signed wire text ASCII so Apps Script's request/utility
        # charset handling cannot alter Cyrillic names before verification.
        encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        signature = hmac.new(self.secret.encode(), f"{timestamp}\n{encoded}".encode(), hashlib.sha256).hexdigest()
        return {"timestamp": timestamp, "payload": encoded, "signature": signature}

    def call(self, payload):
        if not self.configured:
            raise SheetsError("not_configured")
        if payload.get("action") not in ("verify_connection", "balance", "shop_state", "acquire_perk"):
            raise SheetsError("unsupported_action")
        request = urllib.request.Request(self.url,
            data=json.dumps(self.envelope(payload), ensure_ascii=False).encode(),
            headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with self.opener.open(request, timeout=25) as response:
                raw = response.read(32769)
            if len(raw) > 32768:
                raise SheetsError("invalid_response")
            result = json.loads(raw)
        except SheetsError:
            raise
        except Exception:
            # No URLs, request bodies, credentials, or remote messages in logs.
            raise SheetsError("connection_failed") from None
        if not isinstance(result, dict) or result.get("ok") is not True:
            code = result.get("error") if isinstance(result, dict) else None
            raise SheetsError(code if code in BUSINESS_ERRORS else "request_rejected")
        return result

    def verify(self):
        try:
            result = self.call({"action": "verify_connection"})
            if (result.get("version") not in (1, 2) or result.get("registry_ready") is not True or
                    result.get("write_verified") is not True):
                raise SheetsError("verification_failed")
        except SheetsError:
            with self.lock:
                self.connected = self.write_verified = False
                self.shop_ready = False
                self.checked_at = int(time.time())
            raise
        with self.lock:
            self.connected = self.write_verified = True
            self.shop_ready = result.get("shop_ready") is True
            self.checked_at = int(time.time())
        return result

    def balance(self, character):
        if not isinstance(character, str) or not character.strip() or len(character) > 120:
            raise SheetsError("invalid_character")
        result = self.call({"action": "balance", "character": character})
        points = result.get("points")
        if result.get("configured") is False and points is None:
            return None
        if result.get("configured") is not True or type(points) is not int or points < 0:
            raise SheetsError("invalid_balance")
        return points

    def status(self):
        with self.lock:
            fresh = self.checked_at is not None and time.time() - self.checked_at <= 3660
            return {"configured": self.configured, "connected": bool(self.connected and fresh),
                    "write_verified": bool(self.write_verified and fresh), "shop_ready": bool(self.shop_ready and fresh), "checked_at": self.checked_at}

    def worker(self, stop):
        if not self.configured:
            return
        previous = None
        while not stop.is_set():
            try:
                self.verify()
                if previous is not True:
                    print("Sheets bridge: registry read and service-tab write verified", flush=True)
                previous = True
                delay = 3600
            except SheetsError:
                if previous is not False:
                    print("Sheets bridge temporarily unavailable; no balances changed", flush=True)
                previous = False
                delay = 60
            stop.wait(delay)
