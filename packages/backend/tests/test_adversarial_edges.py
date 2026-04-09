"""
Adversarial tests: corrupt data, ambiguous HTML, and values that *look* like success but are not.

These are meant to catch regressions in defensive handling — not to rubber-stamp happy paths.

Run: ``pytest -vv -s tests/test_adversarial_edges.py``
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.orderbook import OffchainOrder, list_orders, upsert_order
from app.scraper import ScrapeError, scrape_yahoo_earnings
from app.worker import _reported_eps_is_ready, poll_event
import app.worker as worker_mod
from app.event_listener import append_trade_fill


# --- scraper: ambiguity & rejection ---


def test_scrape_empty_ticker_raises_before_http(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: empty / whitespace ticker must not call Yahoo")
    print("=" * 60)
    called: list[str] = []

    def spy_yahoo(url: str, timeout: float = 20) -> Any:
        called.append(url)
        raise AssertionError("_yahoo_get should not run for empty ticker")

    monkeypatch.setattr("app.scraper._yahoo_get", spy_yahoo)
    with pytest.raises(ScrapeError, match="empty"):
        scrape_yahoo_earnings("   \t  ")
    assert called == []
    print("✅ No HTTP; ScrapeError raised.")


def test_scrape_two_reported_eps_first_match_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("⚠️ CHARACTERIZATION: two 'Reported EPS' tokens → regex first match only")
    print("   (If Yahoo shows TTM vs quarter both labeled similarly, we may pick the wrong one.)")
    print("=" * 60)
    html = """
    <html><body>
    Noise Reported EPS 9.99
    Later Reported EPS 1.11
    </body></html>
    """
    monkeypatch.setattr(
        "app.scraper._yahoo_get",
        lambda url, timeout=20: MagicMock(status_code=200, text=html),
    )
    monkeypatch.setattr("app.scraper._extract_with_llm", lambda t, h: None)
    out = scrape_yahoo_earnings("FOO")
    eps = out["parsed_json"]["reportedEPS"]
    print(f"   extracted reportedEPS={eps!r} (first literal match in page text)")
    assert eps == 9.99
    print("✅ Documented: first match wins — this is a known parsing limitation.")


def test_scrape_reported_eps_non_numeric_capture_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: regex captures '-' only → float fails → None")
    print("=" * 60)
    html = "<html>Reported EPS -</html>"
    monkeypatch.setattr(
        "app.scraper._yahoo_get",
        lambda url, timeout=20: MagicMock(status_code=200, text=html),
    )
    monkeypatch.setattr("app.scraper._extract_with_llm", lambda t, h: None)
    out = scrape_yahoo_earnings("BAR")
    assert out["parsed_json"]["reportedEPS"] is None
    print("✅ _safe_parse_number yields None; we do not invent a float.")


def test_parse_number_empty_string_raises() -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: _parse_number('') is not safe — callers must use _safe_parse_number")
    print("=" * 60)
    from app.scraper import _parse_number

    with pytest.raises(ValueError):
        _parse_number("")
    print("✅ ValueError — public scrape path must never call _parse_number on unchecked groups.")


# --- worker: EPS readiness ---


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, False),
        ("", False),
        ("   ", False),
        ("--", False),
        ("N/A", False),
        (1.5, True),
        ("1.5", True),
        ("-0.02", True),
        (0.0, True),
    ],
)
def test_reported_eps_is_ready_table(value: object, expected: bool) -> None:
    print(f"\n   _reported_eps_is_ready({value!r}) → {expected}")
    assert _reported_eps_is_ready(value) is expected


def test_poll_event_rejects_blank_string_eps(memory_store: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: scrape returns reportedEPS '' → no GCS writes (was a silent bug before guard)")
    print("=" * 60)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    def fake(_t: str) -> dict:
        return {"raw_html": "<html></html>", "parsed_json": {"reportedEPS": "", "revenue": 1.0}}

    monkeypatch.setattr(worker_mod, "scrape_yahoo_earnings", fake)
    assert poll_event(44, "X", past) is None
    assert not any(k.startswith("resolutions/44/") for k in memory_store.items)
    print("✅ Empty string treated as not ready.")


def test_poll_event_rejects_non_numeric_eps_string(memory_store: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: reportedEPS 'TBD' must not archive")
    print("=" * 60)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    def fake(_t: str) -> dict:
        return {"raw_html": "x", "parsed_json": {"reportedEPS": "TBD"}}

    monkeypatch.setattr(worker_mod, "scrape_yahoo_earnings", fake)
    assert poll_event(45, "X", past) is None
    print("✅ Non-float string rejected.")


# --- orderbook: corrupted JSON shapes ---


def test_list_orders_drops_non_dict_rows(memory_store: Any) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: live.json orders array mixed with garbage types")
    print("=" * 60)
    memory_store.write_json(
        "orderbooks/3/live.json",
        {
            "orders": [
                42,
                "oops",
                {"orderId": "keep", "marketId": 3, "maker": "0x1", "side": "X", "priceBps": 1, "amount": 1},
            ],
            "updatedAtUtc": "old",
        },
    )
    rows = list_orders(3)
    print(f"   list_orders returned {rows!r}")
    assert len(rows) == 1
    assert rows[0]["orderId"] == "keep"
    print("✅ Only dict rows surface to API consumers.")


def test_upsert_rebuilds_after_orders_was_string(memory_store: Any) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: orders was a string (corrupt blob) → upsert recovers")
    print("=" * 60)
    memory_store.write_json("orderbooks/9/live.json", {"orders": "corrupt", "updatedAtUtc": "x"})
    upsert_order(
        OffchainOrder(
            orderId="fresh",
            marketId=9,
            maker="0x2",
            side="BUY_YES",
            priceBps=100,
            amount=1,
        )
    )
    stored = memory_store.items["orderbooks/9/live.json"]
    print(f"   stored orders type={type(stored['orders'])} len={len(stored['orders'])}")
    assert isinstance(stored["orders"], list)
    assert len(stored["orders"]) == 1
    assert stored["orders"][0]["orderId"] == "fresh"
    print("✅ Did not crash; replaced with a clean list.")


# --- event_listener: corrupt tape ---


def test_append_trade_fill_repairs_non_list_fills(memory_store: Any) -> None:
    print("\n" + "=" * 60)
    print("🧨 ADVERSARIAL: fills.json had fills=null or wrong type")
    print("=" * 60)
    memory_store.write_json("trades/8/fills.json", {"fills": None})
    append_trade_fill(8, {"k": 1})
    doc = memory_store.items["trades/8/fills.json"]
    assert isinstance(doc["fills"], list)
    assert len(doc["fills"]) == 1
    print("✅ Repaired and appended.")

    memory_store.write_json("trades/8/fills.json", {"fills": "broken"})
    append_trade_fill(8, {"k": 2})
    doc2 = memory_store.items["trades/8/fills.json"]
    assert doc2["fills"][-1]["k"] == 2
    print("✅ Second corruption also recovered.")
