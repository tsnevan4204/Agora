"""
Unit tests for ``app.scraper`` helpers and ``scrape_yahoo_earnings`` with mocked HTTP.

Run with ``pytest -vv -s`` to see verbose print output. No real Yahoo calls here.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.scraper import (
    ScrapeError,
    _extract_json_from_text,
    _parse_number,
    _safe_float,
    _safe_parse_number,
    _scope_html_for_llm,
    scrape_yahoo_earnings,
)


# --- pure helpers ---


def test_parse_number_plain_and_currency() -> None:
    print("\n" + "=" * 60)
    print("🔢 TEST: _parse_number strips commas, dollar signs, suffixes")
    print("=" * 60)
    cases = [
        ("1.23", 1.23),
        ("$4.56", 4.56),
        ("1,234.5", 1234.5),
        ("2.5M", 2.5e6),
        ("3B", 3e9),
        ("100K", 100_000.0),
    ]
    for raw, want in cases:
        got = _parse_number(raw)
        print(f"   {raw!r} → {got} (expect {want})")
        assert got == want
    print("✅ All numeric parses matched.")


def test_parse_number_invalid_raises() -> None:
    print("\n" + "=" * 60)
    print("⚠️ TEST: _parse_number garbage raises ValueError")
    print("=" * 60)
    with pytest.raises(ValueError):
        _parse_number("not-a-number")
    print("✅ ValueError raised as expected.")


def test_safe_parse_number_none_and_bad() -> None:
    print("\n" + "=" * 60)
    print("🛡️ TEST: _safe_parse_number never raises")
    print("=" * 60)
    assert _safe_parse_number(None) is None
    assert _safe_parse_number("") is None
    assert _safe_parse_number("???") is None
    print("✅ None / empty / junk → None")


def test_safe_float_variants() -> None:
    print("\n" + "=" * 60)
    print("🛡️ TEST: _safe_float accepts int/float/str")
    print("=" * 60)
    assert _safe_float(None) is None
    assert _safe_float(42) == 42.0
    assert _safe_float("2.5M") == 2.5e6
    assert _safe_float("  ") is None
    assert _safe_float([1]) is None
    print("✅ Types handled.")


def test_extract_json_from_text() -> None:
    print("\n" + "=" * 60)
    print("📋 TEST: _extract_json_from_text")
    print("=" * 60)
    direct = '{"a":1}'
    assert _extract_json_from_text(direct) == {"a": 1}
    wrapped = 'prefix {"reportedEPS": 1.5} suffix'
    out = _extract_json_from_text(wrapped)
    print(f"   wrapped string → {out}")
    assert out == {"reportedEPS": 1.5}
    assert _extract_json_from_text("no json here") is None
    print("✅ JSON extraction OK.")


def test_scope_html_for_llm_fallback_on_minimal_html() -> None:
    print("\n" + "=" * 60)
    print("🧩 TEST: _scope_html_for_llm returns non-empty string")
    print("=" * 60)
    html = "<html><body><div class='tableBody yf-x'>rows</div></body></html>"
    scoped = _scope_html_for_llm(html)
    print(f"   scoped length={len(scoped)} preview={scoped[:120]!r}…")
    assert "rows" in scoped or "tableBody" in scoped
    print("✅ Scoped HTML contains expected content.")


# --- scrape_yahoo_earnings (mocked ``_yahoo_get`` — real code uses Session + browser headers) ---


def _mock_yahoo_ok(html: str) -> Any:
    r = MagicMock()
    r.status_code = 200
    r.text = html
    return r


def test_scrape_yahoo_success_regex_only(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🌐 TEST: scrape_yahoo_earnings regex path (LLM disabled)")
    print("=" * 60)
    html = """
    <html><body>
    Reported EPS 1.75
    EPS Estimate 1.70
    Total Revenue 12.5B
    Net Income Common Stockholders 500M
    </body></html>
    """
    monkeypatch.setattr("app.scraper._yahoo_get", lambda url, timeout=20: _mock_yahoo_ok(html))
    monkeypatch.setattr("app.scraper._extract_with_llm", lambda t, h: None)

    out = scrape_yahoo_earnings("  aapl  ")
    print(f"   source_url={out['source_url']}")
    print(f"   parser={out['parser']}")
    print(f"   parsed_json={out['parsed_json']}")
    print(f"   raw_html_hash prefix={out['raw_html_hash'][:16]}…")
    assert out["parser"] == "regex"
    assert out["parsed_json"]["reportedEPS"] == 1.75
    assert out["parsed_json"]["epsEstimate"] == 1.7
    assert out["parsed_json"]["revenue"] == 12.5e9
    assert out["parsed_json"]["netIncome"] == 500e6
    assert "AAPL" in out["source_url"].upper()
    assert len(out["raw_html_hash"]) == 64
    print("✅ Regex extraction and hashes populated.")


def test_scrape_yahoo_diluted_eps_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🌐 TEST: Diluted EPS used when Reported EPS missing")
    print("=" * 60)
    html = "<html>Diluted EPS 0.42</html>"
    monkeypatch.setattr("app.scraper._yahoo_get", lambda url, timeout=20: _mock_yahoo_ok(html))
    monkeypatch.setattr("app.scraper._extract_with_llm", lambda t, h: None)
    out = scrape_yahoo_earnings("XOM")
    print(f"   parsed_json={out['parsed_json']}")
    assert out["parsed_json"]["reportedEPS"] == 0.42
    print("✅ Diluted EPS matched.")


def test_scrape_yahoo_llm_overrides_regex_when_present(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🤖 TEST: LLM values override regex when both run")
    print("=" * 60)
    html = "<html>Reported EPS 9.99</html>"
    monkeypatch.setattr("app.scraper._yahoo_get", lambda url, timeout=20: _mock_yahoo_ok(html))

    def fake_llm(_t: str, _h: str) -> dict[str, float | None]:
        return {"reportedEPS": 1.11, "revenue": 1e9, "netIncome": None}

    monkeypatch.setattr("app.scraper._extract_with_llm", fake_llm)
    out = scrape_yahoo_earnings("MSFT")
    print(f"   parser={out['parser']} parsed_json={out['parsed_json']}")
    assert out["parser"] == "llm+regex"
    assert out["parsed_json"]["reportedEPS"] == 1.11
    assert out["parsed_json"]["revenue"] == 1e9
    print("✅ LLM layer won for EPS/revenue.")


def test_scrape_yahoo_request_failure_raises_scrape_error(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💥 TEST: transport failure inside _yahoo_get → ScrapeError")
    print("=" * 60)

    def boom(url: str, timeout: float = 20) -> Any:
        raise ScrapeError("Yahoo request failed: connection timed out")

    monkeypatch.setattr("app.scraper._yahoo_get", boom)
    with pytest.raises(ScrapeError) as ctx:
        scrape_yahoo_earnings("IBM")
    print(f"   detail={ctx.value!r}")
    assert "Yahoo request failed" in str(ctx.value)
    print("✅ ScrapeError propagated.")


def test_scrape_yahoo_http_error_raises_scrape_error(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💥 TEST: HTTP 4xx/5xx from _yahoo_get → ScrapeError + body preview")
    print("=" * 60)

    def not_found(url: str, timeout: float = 20) -> Any:
        raise ScrapeError(
            'Yahoo HTTP 404 for \'https://finance.yahoo.com/quote/ZZZZZZ/financials/\'. '
            "Body preview: '<html>gone</html>'"
        )

    monkeypatch.setattr("app.scraper._yahoo_get", not_found)
    with pytest.raises(ScrapeError) as ctx:
        scrape_yahoo_earnings("ZZZZZZ")
    print(f"   wrapped: {ctx.value!r}")
    assert "404" in str(ctx.value)
    assert "Body preview" in str(ctx.value)
    print("✅")


def test_yahoo_get_maps_transport_to_scrape_error(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🔧 TEST: real _yahoo_get wraps requests errors")
    print("=" * 60)
    import app.scraper as sm

    class Boom:
        def get(self, url: str, timeout: float = 20) -> None:
            import requests

            raise requests.ConnectionError("reset")

    monkeypatch.setattr(sm, "_get_yahoo_session", lambda: Boom())
    monkeypatch.setattr(sm, "_yahoo_http_session", None)
    from app.scraper import _yahoo_get

    with pytest.raises(ScrapeError) as ctx:
        _yahoo_get("https://finance.yahoo.com/quote/X/financials/")
    assert "Yahoo request failed" in str(ctx.value)
    print("✅")


def test_yahoo_get_non_ok_status_includes_body_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🔧 TEST: _yahoo_get includes HTML snippet on 503")
    print("=" * 60)
    import app.scraper as sm

    class S503:
        def get(self, url: str, timeout: float = 20) -> Any:
            r = MagicMock()
            r.status_code = 503
            r.text = "<title>Please enable JavaScript</title>"
            return r

    monkeypatch.setattr(sm, "_get_yahoo_session", lambda: S503())
    monkeypatch.setattr(sm, "_yahoo_http_session", None)
    from app.scraper import _yahoo_get

    with pytest.raises(ScrapeError) as ctx:
        _yahoo_get("https://finance.yahoo.com/quote/AAPL/financials/")
    msg = str(ctx.value)
    assert "503" in msg
    assert "Body preview" in msg
    assert "JavaScript" in msg
    print(f"   {msg[:200]}…")
    print("✅")


def test_yahoo_get_applies_request_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("⏱️ TEST: _yahoo_get sleeps when YAHOO_REQUEST_DELAY_SECONDS > 0")
    print("=" * 60)
    import app.scraper as sm

    monkeypatch.setattr(sm.settings, "yahoo_request_delay_seconds", 0.42)
    monkeypatch.setattr(sm.settings, "yahoo_use_playwright", False)
    monkeypatch.setattr(sm.settings, "yahoo_playwright_fallback", False)
    slept: list[float] = []
    monkeypatch.setattr(sm.time, "sleep", lambda s: slept.append(float(s)))

    ok = MagicMock()
    ok.status_code = 200
    ok.text = "<html></html>"
    sess = MagicMock()
    sess.get = MagicMock(return_value=ok)
    monkeypatch.setattr(sm, "_get_yahoo_session", lambda: sess)
    monkeypatch.setattr(sm, "_yahoo_http_session", None)

    from app.scraper import _yahoo_get

    r = _yahoo_get("https://finance.yahoo.com/quote/ZZ/financials/")
    assert r.status_code == 200
    assert slept == [0.42]
    print("✅")


def test_yahoo_get_playwright_fallback_after_503(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🎭 TEST: _yahoo_get uses Playwright after requests 503 when fallback on")
    print("=" * 60)
    import app.scraper as sm

    monkeypatch.setattr(sm.settings, "yahoo_request_delay_seconds", 0.0)
    monkeypatch.setattr(sm.settings, "yahoo_use_playwright", False)
    monkeypatch.setattr(sm.settings, "yahoo_playwright_fallback", True)

    bad = MagicMock()
    bad.status_code = 503
    bad.text = "soft block"
    sess = MagicMock()
    sess.get = MagicMock(return_value=bad)
    monkeypatch.setattr(sm, "_get_yahoo_session", lambda: sess)
    monkeypatch.setattr(sm, "_yahoo_http_session", None)

    pw_calls: list[str] = []

    def fake_pw(url: str, *, timeout: float = 20) -> SimpleNamespace:
        pw_calls.append(url)
        return SimpleNamespace(status_code=200, text="<html>Reported EPS 9.99</html>")

    monkeypatch.setattr(sm, "_yahoo_get_via_playwright", fake_pw)

    from app.scraper import _yahoo_get

    r = _yahoo_get("https://finance.yahoo.com/quote/AAPL/financials/")
    assert r.status_code == 200
    assert "Reported EPS" in r.text
    assert pw_calls == ["https://finance.yahoo.com/quote/AAPL/financials/"]
    print("✅")
