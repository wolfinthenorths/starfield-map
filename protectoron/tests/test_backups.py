import json
import shutil
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import server
from backups import Backups, restore_snapshot, verify_snapshot


class Storage:
    def __init__(self):
        self.files = {}
        self.corrupt = False
        self.fail = False
    def upload_file(self, path, bucket, key):
        if self.fail: raise OSError('network failure')
        self.files[key] = Path(path).read_bytes()
    def download_file(self, bucket, key, path):
        Path(path).write_bytes(b'broken' if self.corrupt else self.files[key])
    def get_paginator(self, operation):
        return self
    def paginate(self, **kwargs):
        return [{'Contents': [{'Key': k, 'LastModified': datetime.now(timezone.utc)} for k in self.files]}]
    def delete_object(self, Bucket, Key):
        del self.files[Key]


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.patch = patch.object(server, 'DATA_DIR', self.directory)
        self.patch.start()
        server.init_db()
        with server.db() as con:
            server.upsert_profile(con, {'id': 101, 'username': 'player', 'first_name': 'Игрок'})
            server.set_setting(con, 'gm_chat_id', -1001)
            server.issue(con, 101, 2, 'before-backup', notify=False)
        self.storage = Storage()
        self.manager = Backups(self.directory, self.storage, 'private-bucket')
    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()
    def test_consistent_wal_snapshot_restores_events_and_group_binding(self):
        # Keep the WAL alive rather than relying on connection-close checkpoints.
        with server.db() as live:
            live.execute('PRAGMA wal_autocheckpoint=0')
            live.execute("UPDATE profiles SET character='Цифер' WHERE user_id=101")
            live.commit()
            status = self.manager.run()
            restored = self.directory / 'restored.sqlite3'
            counts = restore_snapshot(status['local_path'], restored)
            self.assertEqual(counts['events'], 1)
            self.assertEqual(counts['profiles'], 1)
            import sqlite3
            with sqlite3.connect(restored) as con:
                self.assertEqual(con.execute('SELECT character FROM profiles').fetchone()[0], 'Цифер')
                self.assertEqual(json.loads(con.execute("SELECT value FROM settings WHERE key='gm_chat_id'").fetchone()[0]), -1001)
            self.assertTrue(status['remote_verified'])
            with self.assertRaises(FileExistsError): restore_snapshot(status['local_path'], restored)
    def test_remote_corruption_is_not_reported_as_success(self):
        self.storage.corrupt = True
        with self.assertRaises(RuntimeError): self.manager.run()
        status = self.manager.status()
        self.assertTrue(status['local_at'])
        self.assertTrue(status['remote_error'])
        self.assertNotIn('remote_at', status)
    def test_network_failure_preserves_valid_local_copy_and_retries(self):
        self.storage.fail = True
        with self.assertRaises(RuntimeError): self.manager.run()
        local = self.manager.status()['local_path']
        self.assertEqual(verify_snapshot(local)['events'], 1)
        self.storage.fail = False
        self.assertTrue(self.manager.run()['remote_verified'])
        self.assertFalse(self.manager.status()['remote_error'])
    def test_schedules_and_retention(self):
        old = self.directory / 'backups' / 'protectoron-old.sqlite3'
        old.parent.mkdir(); old.write_bytes(b'old')
        import os, time
        os.utime(old, (time.time()-8*86400, time.time()-8*86400))
        first = self.manager.run()
        self.assertFalse(old.exists())
        second = self.manager.run()
        self.assertEqual(first['local_path'], second['local_path'])
        self.assertEqual(len(self.storage.files), 1)
        with patch('backups.time.time', return_value=first['local_at']+6*3600):
            next_status = self.manager.run()
        self.assertNotEqual(first['local_path'], next_status['local_path'])
        self.assertEqual(len(self.storage.files), 1)
        with patch('backups.time.time', return_value=first['local_at']+86400):
            self.manager.run()
        self.assertEqual(len(self.storage.files), 2)
    def test_concurrent_manual_backups_remain_valid(self):
        results = []
        threads = [threading.Thread(target=lambda: results.append(self.manager.run(force=True))) for _ in range(3)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(len(results), 3)
        for result in results: self.assertEqual(verify_snapshot(result['local_path'])['events'], 1)
    def test_missing_source_never_creates_empty_database(self):
        (self.directory/'protectoron.sqlite3').unlink()
        with self.assertRaises(Exception): self.manager.run()
        self.assertFalse((self.directory/'protectoron.sqlite3').exists())
