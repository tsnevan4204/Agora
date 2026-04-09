from __future__ import annotations

import atexit
import concurrent.futures
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import requests
from bs4 import BeautifulSoup

from .config import settings


class ScrapeError(Exception):
    """Controlled failure from Yahoo fetch or parse; API layer maps to HTTP errors."""


_YAHOO_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_YAHOO_BROWSER_HEADERS: dict[str, str] = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://finance.yahoo.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-User": "?1",
}

# Reusable session: cookies from a first response can help later requests in the same process.
_yahoo_http_session: requests.Session | None = None

# Lazy Playwright browser (optional): JS execution, cookies, browser TLS fingerprint.
# Sync Playwright must not run on the main thread when an asyncio loop is already running
# (e.g. pytest-anyio); a single worker thread avoids that and serializes context/page use.
_yahoo_pw_executor: concurrent.futures.ThreadPoolExecutor | None = None
_yahoo_pw_playwright: Any = None
_yahoo_pw_browser: Any = None
_yahoo_pw_context: Any = None
_yahoo_pw_warmed: bool = False


def _yahoo_pw_executor() -> concurrent.futures.ThreadPoolExecutor:
    global _yahoo_pw_executor
    if _yahoo_pw_executor is None:
        _yahoo_pw_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="agora-yahoo-pw",
        )
    return _yahoo_pw_executor


def _get_yahoo_session() -> requests.Session:
    global _yahoo_http_session
    if _yahoo_http_session is None:
        s = requests.Session()
        s.headers.update({"User-Agent": _YAHOO_BROWSER_UA, **_YAHOO_BROWSER_HEADERS})
        _yahoo_http_session = s
    return _yahoo_http_session


def _close_yahoo_playwright_worker() -> None:
    """Tear down Playwright; must run on the dedicated worker thread only."""
    global _yahoo_pw_playwright, _yahoo_pw_browser, _yahoo_pw_context, _yahoo_pw_warmed
    if _yahoo_pw_context is not None:
        try:
            _yahoo_pw_context.close()
        except Exception:
            pass
        _yahoo_pw_context = None
    if _yahoo_pw_browser is not None:
        try:
            _yahoo_pw_browser.close()
        except Exception:
            pass
        _yahoo_pw_browser = None
    if _yahoo_pw_playwright is not None:
        try:
            _yahoo_pw_playwright.stop()
        except Exception:
            pass
        _yahoo_pw_playwright = None
    _yahoo_pw_warmed = False


def _close_yahoo_playwright() -> None:
    """Process exit: stop browser on the worker thread, then shut down the executor."""
    global _yahoo_pw_executor
    ex = _yahoo_pw_executor
    if ex is None:
        return
    try:
        ex.submit(_close_yahoo_playwright_worker).result(timeout=90)
    except Exception:
        pass
    try:
        ex.shutdown(wait=True, cancel_futures=False)
    except Exception:
        pass
    _yahoo_pw_executor = None


atexit.register(_close_yahoo_playwright)


def _playwright_missing_browser_message(exc: BaseException) -> str | None:
    msg = str(exc).lower()
    if "executable doesn't exist" in msg or "playwright install" in msg:
        return (
            "Playwright browser binaries are missing. Install with: "
            "python3 -m playwright install chromium"
        )
    return None


def _ensure_yahoo_playwright_context_on_worker() -> Any:
    """Return BrowserContext; only call from the Playwright worker thread."""
    global _yahoo_pw_playwright, _yahoo_pw_browser, _yahoo_pw_context, _yahoo_pw_warmed
    if _yahoo_pw_context is not None:
        return _yahoo_pw_context
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise ScrapeError(
            "Yahoo Playwright fetch requested but the playwright package is not installed. "
            "Install with: python3 -m pip install playwright && python3 -m playwright install chromium"
        ) from e

    timeout_ms = max(5000, settings.yahoo_playwright_timeout_ms)
    pw = None
    try:
        pw = sync_playwright().start()
        _yahoo_pw_playwright = pw
        _yahoo_pw_browser = pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        _yahoo_pw_context = _yahoo_pw_browser.new_context(
            user_agent=_YAHOO_BROWSER_UA,
            locale="en-US",
            viewport={"width": 1280, "height": 720},
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": _YAHOO_BROWSER_HEADERS["Accept"],
            },
        )
    except Exception as e:
        hint = _playwright_missing_browser_message(e)
        if pw is not None:
            try:
                pw.stop()
            except Exception:
                pass
        _yahoo_pw_playwright = None
        _yahoo_pw_browser = None
        _yahoo_pw_context = None
        if hint:
            raise ScrapeError(hint) from e
        raise

    if not _yahoo_pw_warmed:
        page = _yahoo_pw_context.new_page()
        try:
            page.goto(
                "https://finance.yahoo.com/",
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
        except Exception:
            pass
        finally:
            page.close()
        _yahoo_pw_warmed = True
    return _yahoo_pw_context


def _yahoo_playwright_worker_fetch(url: str, timeout: float) -> SimpleNamespace:
    """Fetch one URL via Playwright; runs only on the worker thread."""
    ctx = _ensure_yahoo_playwright_context_on_worker()
    cap = max(5000, settings.yahoo_playwright_timeout_ms)
    timeout_ms = max(5000, min(int(timeout * 1000), cap))
    page = ctx.new_page()
    try:
        nav = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        if nav is not None:
            status = nav.status
        else:
            status = 200 if "finance.yahoo.com" in (page.url or "") else 520
        html = page.content()
    except Exception as e:
        raise ScrapeError(f"Yahoo Playwright navigation failed for {url!r}: {e}") from e
    finally:
        page.close()

    if status >= 400:
        preview = (html or "").replace("\n", " ").strip()[:500]
        raise ScrapeError(
            f"Yahoo HTTP {status} (Playwright) for {url!r}. Body preview: {preview!r}"
        )
    return SimpleNamespace(status_code=status, text=html)


def _yahoo_get_via_playwright(url: str, *, timeout: float = 20) -> SimpleNamespace:
    """
    Load URL in headless Chromium; returns an object with ``status_code`` and ``text`` (HTML).
    Uses a shared context so cookies persist across tickers in one process.
    """
    ex = _yahoo_pw_executor()
    cap_ms = max(5000, settings.yahoo_playwright_timeout_ms)
    wait_seconds = max(90.0, timeout + 45.0, cap_ms / 1000.0 + 30.0)
    fut = ex.submit(_yahoo_playwright_worker_fetch, url, timeout)
    try:
        return fut.result(timeout=wait_seconds)
    except concurrent.futures.TimeoutError as e:
        raise ScrapeError(
            "Yahoo Playwright worker timed out waiting for the browser. "
            "If this repeats, try increasing YAHOO_PLAYWRIGHT_TIMEOUT_MS."
        ) from e


def _yahoo_get(url: str, *, timeout: float = 20) -> requests.Response | SimpleNamespace:
    """
    GET Yahoo HTML: plain ``requests`` by default, or Playwright when configured.
    Raises ScrapeError on transport or HTTP errors.
    Patched in unit tests (``monkeypatch.setattr("app.scraper._yahoo_get", ...)``).
    """
    delay = settings.yahoo_request_delay_seconds
    if delay > 0:
        time.sleep(delay)

    if settings.yahoo_use_playwright:
        return _yahoo_get_via_playwright(url, timeout=timeout)

    try:
        resp = _get_yahoo_session().get(url, timeout=timeout)
    except requests.RequestException as e:
        raise ScrapeError(f"Yahoo request failed: {e}") from e

    if resp.status_code >= 400 and settings.yahoo_playwright_fallback:
        try:
            return _yahoo_get_via_playwright(url, timeout=timeout)
        except ScrapeError as pw_err:
            preview = (resp.text or "").replace("\n", " ").strip()[:500]
            raise ScrapeError(
                f"Yahoo HTTP {resp.status_code} for {url!r}; Playwright fallback failed: {pw_err}. "
                f"requests body preview: {preview!r}"
            ) from pw_err

    if resp.status_code >= 400:
        preview = (resp.text or "").replace("\n", " ").strip()[:500]
        raise ScrapeError(
            f"Yahoo HTTP {resp.status_code} for {url!r}. Body preview: {preview!r}"
        )
    return resp


def _parse_number(value: str) -> float:
    clean = value.replace(",", "").replace("$", "").strip()
    suffix = clean[-1:] if clean else ""
    multiplier = 1.0
    if suffix in {"B", "M", "K"}:
        clean = clean[:-1]
        multiplier = {"K": 1e3, "M": 1e6, "B": 1e9}[suffix]
    return float(clean) * multiplier


def _safe_parse_number(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return _parse_number(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (float, int)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return _parse_number(text)
        except Exception:
            return None
    return None


def _extract_json_from_text(text: str) -> dict | None:
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def _extract_with_llm(ticker: str, html: str) -> dict[str, float | None] | None:
    if not settings.openai_api_key:
        return None
    trimmed_html = html[:120000]
    prompt = (
        "Extract earnings values from this Yahoo Finance page HTML for ticker "
        f"{ticker}. Return ONLY strict JSON with keys: reportedEPS, revenue, netIncome. "
        "Use number values (no strings) when found, otherwise null. "
        "Normalize revenue/netIncome to raw USD integer units and EPS as decimal."
    )
    body = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": "You extract financial numbers from raw HTML. Output only JSON."},
            {"role": "user", "content": prompt + "\n\nHTML:\n" + trimmed_html},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=40,
        )
        resp.raise_for_status()
        payload = resp.json()
        choices = payload.get("choices") or []
        if not choices:
            return None
        content = (choices[0].get("message") or {}).get("content") or ""
        parsed = _extract_json_from_text(content)
        if not isinstance(parsed, dict):
            return None
        return {
            "reportedEPS": _safe_float(parsed.get("reportedEPS")),
            "revenue": _safe_float(parsed.get("revenue")),
            "netIncome": _safe_float(parsed.get("netIncome")),
        }
    except Exception:
        return None


def _scope_html_for_llm(html: str) -> str:
    """
    Prefer: section.main.yf-4segct -> div.tableContainer.yf-yuwun0.
    Fallback: tableBody chunks, then generic tables inside main, then full page.
    """
    soup = BeautifulSoup(html, "html.parser")
    main_section = soup.select_one("section.main.yf-4segct")
    if main_section is not None:
        inner = main_section.select_one("div.tableContainer.yf-yuwun0")
        if inner is not None:
            return str(inner)
        scope_root = main_section
    else:
        scope_root = soup

    chunks: list[str] = []
    for node in scope_root.select('[class*="tableBody"]'):
        chunks.append(str(node))
    if not chunks:
        for node in scope_root.select("table, section, div"):
            classes = " ".join(node.get("class", []))
            if "table" in classes.lower() or "row" in classes.lower():
                chunks.append(str(node))
                if len(chunks) >= 25:
                    break
    if chunks:
        return "\n".join(chunks)
    return str(scope_root)


def scrape_yahoo_earnings(ticker: str) -> dict:
    symbol = ticker.strip().upper()
    if not symbol:
        raise ScrapeError("ticker is empty after strip")
    url = f"https://finance.yahoo.com/quote/{symbol}/financials/"
    resp = _yahoo_get(url, timeout=20)
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)

    eps_match = re.search(r"Reported EPS\s*([\-0-9\.,BMK]+)", text, re.IGNORECASE)
    if not eps_match:
        eps_match = re.search(r"Diluted EPS\s*([\-0-9\.,BMK]+)", text, re.IGNORECASE)
    estimate_match = re.search(r"EPS Estimate\s*([\-0-9\.,BMK]+)", text, re.IGNORECASE)
    revenue_match = re.search(r"Total Revenue\s*([\-0-9\.,BMK]+)", text, re.IGNORECASE)
    net_income_match = re.search(r"Net Income(?: Common Stockholders)?\s*([\-0-9\.,BMK]+)", text, re.IGNORECASE)

    regex_extracted: dict[str, float | None] = {
        "reportedEPS": _safe_parse_number(eps_match.group(1)) if eps_match else None,
        "epsEstimate": _safe_parse_number(estimate_match.group(1)) if estimate_match else None,
        "revenue": _safe_parse_number(revenue_match.group(1)) if revenue_match else None,
        "netIncome": _safe_parse_number(net_income_match.group(1)) if net_income_match else None,
    }

    llm_scope_html = _scope_html_for_llm(html)
    llm_extracted = _extract_with_llm(symbol, llm_scope_html)
    extracted = dict(regex_extracted)
    if llm_extracted:
        for key in ("reportedEPS", "revenue", "netIncome"):
            if llm_extracted.get(key) is not None:
                extracted[key] = llm_extracted[key]

    parsed_json = json.dumps(extracted, sort_keys=True, default=str)
    return {
        "source_url": url,
        "raw_html": html,
        "raw_html_hash": hashlib.sha256(html.encode()).hexdigest(),
        "llm_scope_html_hash": hashlib.sha256(llm_scope_html.encode()).hexdigest(),
        "parsed_json": extracted,
        "parsed_json_hash": hashlib.sha256(parsed_json.encode()).hexdigest(),
        "parser": "llm+regex" if llm_extracted else "regex",
        "scraped_at_utc": datetime.now(timezone.utc).isoformat(),
    }
