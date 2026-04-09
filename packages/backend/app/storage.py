from __future__ import annotations

import io
import json
from typing import Any, Protocol

from google.cloud import storage

from .config import settings


class StorageBackend(Protocol):
    def write_json(self, path: str, payload: dict) -> None: ...
    def read_json(self, path: str) -> dict | None: ...
    def write_text(self, path: str, data: str, content_type: str = "text/plain") -> None: ...
    def read_text(self, path: str) -> str | None: ...
    def write_parquet(self, path: str, rows: list[dict[str, Any]]) -> None: ...


class GcsStore:
    def __init__(self) -> None:
        self.client = storage.Client()
        self.bucket = self.client.bucket(settings.gcs_bucket)

    def write_json(self, path: str, payload: dict) -> None:
        blob = self.bucket.blob(path)
        blob.upload_from_string(json.dumps(payload, default=str, indent=2), content_type="application/json")

    def read_json(self, path: str) -> dict | None:
        blob = self.bucket.blob(path)
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text())

    def write_text(self, path: str, data: str, content_type: str = "text/plain") -> None:
        blob = self.bucket.blob(path)
        blob.upload_from_string(data, content_type=content_type)

    def read_text(self, path: str) -> str | None:
        blob = self.bucket.blob(path)
        if not blob.exists():
            return None
        return blob.download_as_text()

    def write_parquet(self, path: str, rows: list[dict[str, Any]]) -> None:
        import pyarrow as pa
        import pyarrow.parquet as pq

        table = pa.Table.from_pylist(rows)
        buf = io.BytesIO()
        pq.write_table(table, buf)
        blob = self.bucket.blob(path)
        blob.upload_from_string(buf.getvalue(), content_type="application/octet-stream")


_override: StorageBackend | None = None
_gcs_singleton: GcsStore | None = None


def get_store() -> StorageBackend:
    """Return storage backend. Uses GCS lazily on first access unless tests set _override."""
    global _gcs_singleton
    if _override is not None:
        return _override
    if _gcs_singleton is None:
        _gcs_singleton = GcsStore()
    return _gcs_singleton


class _StoreDelegate:
    """Bound methods forward to get_store() so `from .storage import store` works."""

    def write_json(self, path: str, payload: dict) -> None:
        get_store().write_json(path, payload)

    def read_json(self, path: str) -> dict | None:
        return get_store().read_json(path)

    def write_text(self, path: str, data: str, content_type: str = "text/plain") -> None:
        get_store().write_text(path, data, content_type=content_type)

    def read_text(self, path: str) -> str | None:
        return get_store().read_text(path)

    def write_parquet(self, path: str, rows: list[dict[str, Any]]) -> None:
        get_store().write_parquet(path, rows)


store = _StoreDelegate()
