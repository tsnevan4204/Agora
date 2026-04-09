"""
Unit tests for ``app.worker`` (poll scheduling + GCS writes). No relayer, no real Yahoo by default.

Use ``pytest -vv -s`` for print output.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.worker import _parse_expected_utc, poll_event
import app.worker as worker_mod


def test_parse_expected_utc_with_z_suffix() -> None:
    print("\n" + "=" * 60)
    print("🕐 TEST: _parse_expected_utc handles ...Z")
    print("=" * 60)
    dt = _parse_expected_utc("2026-04-08T16:00:00Z")
    print(f"   parsed={dt!r} tzinfo={dt.tzinfo}")
    assert dt.tzinfo is not None
    assert dt.year == 2026 and dt.month == 4 and dt.day == 8
    print("✅ UTC Z parsed.")


def test_parse_expected_utc_naive_gets_utc() -> None:
    print("\n" + "=" * 60)
    print("🕐 TEST: naive ISO string becomes UTC")
    print("=" * 60)
    dt = _parse_expected_utc("2026-01-01T12:00:00")
    assert dt.tzinfo == timezone.utc
    print(f"   {dt!r} → ✅")


def test_poll_event_returns_none_before_expected_time(memory_store: Any) -> None:
    print("\n" + "=" * 60)
    print("⏳ TEST: poll_event returns None if wall clock before expected earnings time")
    print("=" * 60)
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    print(f"   expected_earnings_time_utc={future!r}")
    out = poll_event(event_id=99, ticker="AAPL", expected_earnings_time_utc=future)
    print(f"   result={out!r}")
    assert out is None
    assert not any(k.startswith("resolutions/99/") for k in memory_store.items)
    print("✅ No scrape, no storage writes.")


def test_poll_event_writes_when_time_passed_and_eps_present(memory_store: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💾 TEST: poll_event scrapes + writes HTML + JSON when EPS exists")
    print("=" * 60)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    def fake_scrape(ticker: str) -> dict:
        print(f"   🎭 fake_scrape called ticker={ticker!r}")
        return {
            "raw_html": "<html>ok</html>",
            "parsed_json": {"reportedEPS": 1.0, "revenue": None, "netIncome": None},
            "source_url": "https://example.com",
        }

    monkeypatch.setattr(worker_mod, "scrape_yahoo_earnings", fake_scrape)
    out = poll_event(event_id=5, ticker="NVDA", expected_earnings_time_utc=past)
    assert out is not None
    print(f"   scrape result keys={list(out.keys())}")
    assert "resolutions/5/scraped_page.html" in memory_store.items
    assert "resolutions/5/extracted_data.json" in memory_store.items
    assert memory_store.items["resolutions/5/extracted_data.json"]["reportedEPS"] == 1.0
    print("✅ Both blobs written.")


def test_poll_event_returns_none_on_scrape_error(memory_store: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💥 TEST: ScrapeError → None, no writes")
    print("=" * 60)
    from app.scraper import ScrapeError

    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    def boom(_t: str) -> None:
        raise ScrapeError("blocked")

    monkeypatch.setattr(worker_mod, "scrape_yahoo_earnings", boom)
    out = poll_event(event_id=6, ticker="X", expected_earnings_time_utc=past)
    assert out is None
    assert not any(k.startswith("resolutions/6/") for k in memory_store.items)
    print("✅ Swallowed ScrapeError; store clean.")


def test_poll_event_returns_none_when_eps_missing(memory_store: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("❓ TEST: Scrape succeeds but reportedEPS is None → None, no writes")
    print("=" * 60)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    def no_eps(_t: str) -> dict:
        return {
            "raw_html": "<html></html>",
            "parsed_json": {"reportedEPS": None, "revenue": 1.0},
        }

    monkeypatch.setattr(worker_mod, "scrape_yahoo_earnings", no_eps)
    out = poll_event(event_id=7, ticker="Y", expected_earnings_time_utc=past)
    assert out is None
    assert not any(k.startswith("resolutions/7/") for k in memory_store.items)
    print("✅ Worker refuses to archive without EPS.")
