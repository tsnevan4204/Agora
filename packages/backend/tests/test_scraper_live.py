"""
**Live** Yahoo Finance scrapes — real network calls to ``finance.yahoo.com``.

These are **exploratory / diagnostic**, not proof the parser is correct: Yahoo HTML changes,
rate limits, and ambiguous labels are all reasons a green run here does not replace mocked
unit tests in ``test_scraper_unit.py`` or adversarial cases in ``test_adversarial_edges.py``.

Skipped by default. Run:

    cd packages/backend
    RUN_LIVE_YAHOO=1 python3 -m pytest tests/test_scraper_live.py -vv -s

Optional (after ``python3 -m pip install playwright`` and **``python3 -m playwright install chromium``** —
the second step downloads the browser; without it you get "Executable doesn't exist"):

- ``YAHOO_USE_PLAYWRIGHT=1`` — fetch every quote page with headless Chromium (cookies + JS).
- ``YAHOO_PLAYWRIGHT_FALLBACK=1`` — try normal HTTP first; on 4xx/5xx retry with Playwright.
- ``YAHOO_REQUEST_DELAY_SECONDS=1.5`` — sleep before each Yahoo request (batch-friendly).

**STRICT_LIVE_YAHOO=1** fails the module if no ticker returns a non-null ``reportedEPS`` (still
not a substitute for asserting exact expected values).

Notes:
- Yahoo may return 403/503; default (non-strict) still **passes** after printing — that is
  intentional smoke, not coverage theatre claiming success.
- Ticker symbols must match Yahoo (e.g. some OTC names differ).
- OpenAI is **not** required; these exercises use regex/LLM only if your env has ``OPENAI_API_KEY``.
"""

from __future__ import annotations

import os

import pytest

from app.scraper import ScrapeError, scrape_yahoo_earnings


def _live_enabled() -> bool:
    return os.environ.get("RUN_LIVE_YAHOO", "").strip() in ("1", "true", "yes")


def _strict_live() -> bool:
    return os.environ.get("STRICT_LIVE_YAHOO", "").strip() in ("1", "true", "yes")


pytestmark = pytest.mark.live_yahoo


@pytest.mark.skipif(not _live_enabled(), reason="Set RUN_LIVE_YAHOO=1 to hit real Yahoo Finance")
def test_live_yahoo_april_8_2026_watchlist() -> None:
    """
    Context from product research (April 8, 2026): GBX, DSKIF mentioned for earnings activity.
    We only assert structure when a scrape succeeds; network failures are printed, not fatal.
    """
    print("\n" + "=" * 60)
    print("📡 LIVE: April 8-ish watchlist (GBX, DSKIF + liquid alternates)")
    print("=" * 60)
    tickers = ["GBX", "DSKIF", "DAL", "AAPL"]
    _run_ticker_batch(tickers)


@pytest.mark.skipif(not _live_enabled(), reason="Set RUN_LIVE_YAHOO=1 to hit real Yahoo Finance")
def test_live_yahoo_april_7_2026_earnings_names() -> None:
    """
    Companies tied to April 7, 2026 earnings narrative (Yahoo symbols as commonly traded).
    """
    print("\n" + "=" * 60)
    print("📡 LIVE: April 7 earnings-name batch (major US listings)")
    print("=" * 60)
    tickers = [
        "DAL",
        "RPM",
        "LEVI",
        "STZ",
        "RGP",
        "PSMT",
        "RELL",
        "AEHR",
    ]
    # ZENAZ, GAME, JAGX are often illiquid / OTC — may 404; add if you confirm Yahoo symbols
    tickers_extra = ["JAGX", "GPRO"]
    _run_ticker_batch(tickers + tickers_extra)


def _run_ticker_batch(tickers: list[str]) -> None:
    any_eps: list[str] = []
    for sym in tickers:
        print(f"\n--- Ticker {sym!r} ---")
        try:
            data = scrape_yahoo_earnings(sym)
        except ScrapeError as e:
            print(f"   ❌ ScrapeError: {e}")
            continue
        pj = data["parsed_json"]
        print(f"   ✅ HTTP OK  parser={data['parser']!r}")
        print(f"   source_url={data['source_url']}")
        print(f"   parsed_json={pj}")
        print(f"   html_bytes={len(data['raw_html'])}")
        if pj.get("reportedEPS") is not None:
            any_eps.append(sym)
    print("\n" + "-" * 60)
    print(f"📊 Summary: tickers with non-null reportedEPS: {any_eps or '(none in this run)'}")
    if _strict_live():
        assert any_eps, (
            "STRICT_LIVE_YAHOO=1 but no ticker returned reportedEPS — "
            "check network, symbols, or Yahoo HTML changes."
        )
    print("✅ Live batch finished (non-strict mode always passes if you see this line).")
