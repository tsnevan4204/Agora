from __future__ import annotations

"""
Earnings poll helpers (no process entrypoint here).

Intended usage: a separate `python -m app.worker_run` style command or external scheduler calls
`poll_event` when wall-clock is past `expectedEarningsTimeUtc`. This module stays import-safe
and does not start threads on import.
"""

import time
from datetime import datetime, timezone

from .config import settings
from .scraper import ScrapeError, scrape_yahoo_earnings
from .storage import store


def _reported_eps_is_ready(value: object) -> bool:
    """True only if we have a numeric EPS scrapers/resolution can use (not '', None, or junk)."""
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    try:
        float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return True


def _parse_expected_utc(expected_earnings_time_utc: str) -> datetime:
    raw = expected_earnings_time_utc.replace("Z", "+00:00")
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def poll_event(event_id: int, ticker: str, expected_earnings_time_utc: str) -> dict | None:
    now = datetime.now(timezone.utc)
    expected = _parse_expected_utc(expected_earnings_time_utc)
    if now < expected:
        return None

    try:
        scrape = scrape_yahoo_earnings(ticker)
    except ScrapeError:
        return None

    if not _reported_eps_is_ready(scrape["parsed_json"].get("reportedEPS")):
        return None

    store.write_text(f"resolutions/{event_id}/scraped_page.html", scrape["raw_html"], content_type="text/html")
    store.write_json(f"resolutions/{event_id}/extracted_data.json", scrape["parsed_json"])
    return scrape


def run_scheduler(events: list[dict]) -> None:
    while True:
        for event in events:
            poll_event(event["eventId"], event["ticker"], event["expectedEarningsTimeUtc"])
        time.sleep(settings.scheduler_poll_interval_seconds)
