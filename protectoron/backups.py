"""Consistent SQLite snapshots and separately stored, verified daily copies."""
import hashlib
import json
import os
import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path

TABLES = ('profiles', 'events', 'requests', 'settings', 'bindings', 'gm_accounts', 'outbox', 'prompts', 'updates')


def verify_snapshot(path):
    con = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if con.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('Snapshot integrity check failed')
        return {table: con.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in TABLES}
    finally:
        con.close()


def restore_snapshot(snapshot, destination):
    """Offline only: refuse to overwrite a running/existing database."""
    verify_snapshot(snapshot)
    destination = Path(destination)
    with destination.open('xb') as target, Path(snapshot).open('rb') as source:
        while chunk := source.read(1024 * 1024):
            target.write(chunk)
        target.flush()
        os.fsync(target.fileno())
    return verify_snapshot(destination)


class Backups:
    def __init__(self, data_dir, client=None, bucket=None):
        self.data_dir = Path(data_dir)
        self.directory = self.data_dir / 'backups'
        self.status_path = self.data_dir / 'backup-status.json'
        self.client = client
        self.bucket = bucket or os.environ.get('BACKUP_S3_BUCKET', '')
        self.lock = threading.RLock()

    def status(self):
        try:
            return json.loads(self.status_path.read_text())
        except (FileNotFoundError, ValueError):
            return {}

    def save_status(self, status):
        temporary = self.status_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(status))
        temporary.replace(self.status_path)

    def s3(self):
        if self.client is None:
            import boto3
            from botocore.config import Config
            self.client = boto3.client('s3', endpoint_url=os.environ['BACKUP_S3_ENDPOINT'],
                region_name=os.environ.get('BACKUP_S3_REGION', 'auto'),
                aws_access_key_id=os.environ['BACKUP_S3_ACCESS_KEY_ID'],
                aws_secret_access_key=os.environ['BACKUP_S3_SECRET_ACCESS_KEY'],
                config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=30,
                    retries={'max_attempts': 2}, s3={'addressing_style': os.environ.get('BACKUP_S3_URL_STYLE', 'path')},
                    request_checksum_calculation='when_required', response_checksum_validation='when_required'))
        return self.client

    def run(self, force=False):
        with self.lock:
            now = int(time.time())
            status = self.status()
            self.directory.mkdir(parents=True, exist_ok=True)
            if force or now - status.get('local_at', 0) >= 6 * 3600 or not Path(status.get('local_path', '')).is_file():
                path = self.directory / f'protectoron-{now}-{uuid.uuid4().hex[:8]}.sqlite3'
                source = sqlite3.connect((self.data_dir / 'protectoron.sqlite3').resolve().as_uri() + '?mode=ro', uri=True, timeout=15)
                target = sqlite3.connect(path)
                try:
                    source.backup(target)
                finally:
                    target.close()
                    source.close()
                counts = verify_snapshot(path)
                with path.open('rb') as file:
                    os.fsync(file.fileno())
                status.update(local_at=now, local_path=str(path), counts=counts)
                self.save_status(status)
                for old in self.directory.glob('protectoron-*.sqlite3'):
                    if old != path and now - old.stat().st_mtime > 7 * 86400:
                        old.unlink()
                print('SQLite backup verified', flush=True)
            path = Path(status['local_path'])
            if self.bucket and (force or now - status.get('remote_at', 0) >= 86400):
                try:
                    key = f'protectoron/daily/{now}-{uuid.uuid4().hex[:8]}.sqlite3'
                    client = self.s3()
                    client.upload_file(str(path), self.bucket, key)
                    with tempfile.TemporaryDirectory() as temp:
                        downloaded = Path(temp) / 'verify.sqlite3'
                        client.download_file(self.bucket, key, str(downloaded))
                        if hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(downloaded.read_bytes()).digest():
                            raise ValueError('Remote snapshot checksum mismatch')
                        restored = Path(temp) / 'restored.sqlite3'
                        if restore_snapshot(downloaded, restored) != status['counts']:
                            raise ValueError('Remote snapshot counts mismatch')
                    status.update(remote_at=now, remote_key=key, remote_verified=True, remote_error=False)
                    self.save_status(status)
                    print('Offsite SQLite backup downloaded and verified', flush=True)
                    # This private prefix contains only this bot's snapshots.
                    for page in client.get_paginator('list_objects_v2').paginate(Bucket=self.bucket, Prefix='protectoron/daily/'):
                        for item in page.get('Contents', []):
                            if now - item['LastModified'].timestamp() > 30 * 86400:
                                client.delete_object(Bucket=self.bucket, Key=item['Key'])
                except Exception as exc:
                    status['remote_error'] = True
                    self.save_status(status)
                    print('Offsite backup failed:', type(exc).__name__, flush=True)
                    raise RuntimeError('Не удалось сохранить и проверить отдельную копию базы.') from None
            return status

    def worker(self, stop, on_error=None):
        failed = False
        while not stop.is_set():
            try:
                self.run()
                failed = False
            except Exception as exc:
                print('Backup worker:', type(exc).__name__, flush=True)
                if not failed and on_error:
                    on_error()
                failed = True
            stop.wait(300)
