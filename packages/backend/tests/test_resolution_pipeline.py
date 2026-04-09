"""
Resolution + evidence-hash tests (``create_pending_resolution``, ``confirm_resolution``, scraper wiring).

**This file is excluded from the default pytest run** (see ``pyproject.toml`` ``--ignore=…``).
We are not maintaining or executing this suite until resolution testing is allowed again.

To run manually: ``python3 -m pytest tests/test_resolution_pipeline.py -vv -s`` (from ``packages/backend``).

Use ``pytest -s`` to see print output (stdout is hidden by default when capture is on).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app import main as main_module
from app.chain import CreateMarketsResult
from app.main import (
    approve_proposal,
    confirm_resolution,
    create_pending_resolution,
    create_proposal,
    reject_proposal,
)
from app.models import (
    AdminResolutionAction,
    EventProposal,
    Metric,
    ProposalApproveRequest,
    ProposalMarketSpec,
    ProposalRejectRequest,
)
from app.resolution import evidence_hash, verify_evidence_hash
from app.scraper import ScrapeError


@pytest.fixture()
def mock_scraper(monkeypatch: pytest.MonkeyPatch):
    def _impl(ticker: str) -> dict:
        print(f"  🎭 [mock_scraper] Pretend-fetching Yahoo for ticker={ticker!r}")
        return {
            "raw_html": "<html>mock</html>",
            "raw_html_hash": "raw-hash",
            "parsed_json_hash": "parsed-hash",
            "parsed_json": {"reportedEPS": 1.61, "revenue": 99000000000, "netIncome": 12000000000},
            "scraped_at_utc": datetime.now(timezone.utc).isoformat(),
        }

    monkeypatch.setattr(main_module, "scrape_yahoo_earnings", _impl)
    print(
        "\n🎭 (fixture mock_scraper) Yahoo scraper is patched: EPS=1.61, revenue & netIncome filled in.",
    )


def _spec(metric: str, operator: str, threshold: float) -> dict:
    return {
        "ticker": "AAPL",
        "fiscalYear": 2026,
        "fiscalQuarter": 2,
        "metric": metric,
        "operator": operator,
        "threshold": threshold,
        "expectedEarningsTimeUtc": datetime.now(timezone.utc).isoformat(),
    }


def test_pending_resolution_writes_expected_objects(memory_store, mock_scraper) -> None:
    print("\n" + "=" * 60)
    print("📁 TEST: Pending resolution writes pending.json + html + extracted JSON")
    print("=" * 60)
    body = {"ticker": "AAPL", "marketIds": [1], "specs": [_spec("eps", ">", 1.6)]}
    print(f"📨 Request body summary: ticker={body['ticker']} marketIds={body['marketIds']}")
    print(f"   spec threshold op: EPS > 1.6 (mock scrape says EPS=1.61 → expect YES)")
    out = create_pending_resolution(7, body)
    print(f"📤 Handler returned: {out!r}")
    assert out["queued"] is True
    paths = sorted(k for k in memory_store.items if k.startswith("resolutions/7/"))
    print(f"🗂️ Paths under resolutions/7/: {paths}")
    assert "resolutions/7/pending.json" in memory_store.items
    assert "resolutions/7/scraped_page.html" in memory_store.items
    assert "resolutions/7/extracted_data.json" in memory_store.items
    print("✅ All three artifacts present in the fake bucket.")


def test_pending_resolution_handles_missing_metric(memory_store, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("❓ TEST: Scraper returns null EPS → 409 conflict (data not ready)")
    print("=" * 60)

    def _missing(_: str) -> dict:
        print("  🎭 [mock] Scraper returns parsed_json with reportedEPS=None")
        return {
            "raw_html": "<html></html>",
            "raw_html_hash": "x",
            "parsed_json_hash": "y",
            "parsed_json": {"reportedEPS": None, "revenue": None, "netIncome": None},
            "scraped_at_utc": datetime.now(timezone.utc).isoformat(),
        }

    monkeypatch.setattr(main_module, "scrape_yahoo_earnings", _missing)
    body = {"ticker": "AAPL", "marketIds": [1], "specs": [_spec("eps", ">", 1.6)]}
    with pytest.raises(HTTPException) as ctx:
        create_pending_resolution(8, body)
    assert ctx.value.status_code == 409
    print(f"🚫 HTTP 409 detail: {ctx.value.detail!r}")
    print("✅ We refuse to queue resolution without the metric value.")


def test_confirm_resolution_requires_override_reason(memory_store, mock_scraper) -> None:
    print("\n" + "=" * 60)
    print("⚠️ TEST: action=override without overrideReason → 400")
    print("=" * 60)
    create_pending_resolution(9, {"ticker": "AAPL", "marketIds": [1], "specs": [_spec("eps", ">", 1.6)]})
    action = AdminResolutionAction(
        confirmedBy="0xabc",
        action="override",
        overrideReason=None,
        outcomes={"1": "NO"},
    )
    with pytest.raises(HTTPException) as ctx:
        confirm_resolution(9, action)
    assert ctx.value.status_code == 400
    print(f"🚫 detail: {ctx.value.detail!r}")
    print("✅ Override must carry an audit trail string.")


def test_pending_resolution_rejects_spec_market_mismatch(memory_store, mock_scraper) -> None:
    print("\n" + "=" * 60)
    print("⚠️ TEST: len(marketIds) != len(specs) → 400")
    print("=" * 60)
    print("📨 Sending 2 marketIds but only 1 spec — impossible to zip them safely.")
    body = {"ticker": "AAPL", "marketIds": [1, 2], "specs": [_spec("eps", ">", 1.6)]}
    with pytest.raises(HTTPException) as ctx:
        create_pending_resolution(77, body)
    assert ctx.value.status_code == 400
    print(f"🚫 detail: {ctx.value.detail!r}")
    print("✅ Length mismatch rejected.")


def test_pending_resolution_maps_scrape_error(memory_store, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💥 TEST: ScrapeError from Yahoo layer → 502 Bad Gateway")
    print("=" * 60)

    def _boom(_: str) -> dict:
        print("  💣 [mock] Raising ScrapeError('yahoo blocked')")
        raise ScrapeError("yahoo blocked")

    monkeypatch.setattr(main_module, "scrape_yahoo_earnings", _boom)
    body = {"ticker": "AAPL", "marketIds": [1], "specs": [_spec("eps", ">", 1.6)]}
    with pytest.raises(HTTPException) as ctx:
        create_pending_resolution(78, body)
    assert ctx.value.status_code == 502
    print(f"🚫 detail: {ctx.value.detail!r}")
    print("✅ Upstream scrape failure surfaced as 502.")


def test_verify_evidence_hash_roundtrip() -> None:
    print("\n" + "=" * 60)
    print("🔐 TEST: evidence_hash + verify_evidence_hash agree on fixed inputs")
    print("=" * 60)
    h = evidence_hash(
        raw_html_hash="a",
        parsed_json_hash="b",
        extracted_values={"k": 1},
        parser_version="v1",
        expected_utc="2026-01-01T00:00:00Z",
        confirmed_utc="2026-01-01T00:01:00Z",
        override_reason=None,
        admin_address="0xabc",
    )
    print(f"🧮 Computed evidence hash: {h}")
    ok = verify_evidence_hash(
        raw_html_hash="a",
        parsed_json_hash="b",
        extracted_values={"k": 1},
        parser_version="v1",
        expected_utc="2026-01-01T00:00:00Z",
        confirmed_utc="2026-01-01T00:01:00Z",
        override_reason=None,
        admin_address="0xabc",
        expected_hex=h,
    )
    assert ok
    print("✅ verify_evidence_hash returned True — same canonical payload recomputes the same hash.")


def test_confirm_resolution_writes_results(memory_store, mock_scraper) -> None:
    print("\n" + "=" * 60)
    print("✅ TEST: confirm_resolution writes admin_confirmation + resolution_results")
    print("=" * 60)
    pr = create_pending_resolution(10, {"ticker": "AAPL", "marketIds": [1], "specs": [_spec("eps", ">", 1.6)]})
    print(f"📊 After pending step, proposed outcomes: {pr.get('outcomes')!r}")
    action = AdminResolutionAction(
        confirmedBy="0xabc",
        action="confirm",
        overrideReason=None,
        outcomes={"1": "YES"},
    )
    out = confirm_resolution(10, action)
    print(f"📤 confirm_resolution keys: {list(out.keys())}")
    print(f"⛓️ onChain blob: {out.get('onChain')!r}")
    assert out["confirmed"] is True
    oc = out.get("onChain") or {}
    assert oc.get("skipped") is True or oc.get("overall") in ("confirmed", "partial_failure", "failed", "error")
    res_keys = sorted(k for k in memory_store.items if k.startswith("resolutions/10/"))
    print(f"🗂️ Files under resolutions/10/: {res_keys}")
    assert "resolutions/10/admin_confirmation.json" in memory_store.items
    assert "resolutions/10/resolution_results.json" in memory_store.items
    print("✅ Confirm path persisted audit + results JSON.")


def test_approve_proposal_mock_chain(memory_store, monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🔗 TEST: approve_proposal with tiny chain stub (integration-style)")
    print("=" * 60)

    def _fake(**_: object) -> CreateMarketsResult:
        print("  🎭 [mock chain] Returning fixed eventId=3, marketIds=[9]")
        return CreateMarketsResult(
            event_id=3,
            market_ids=[9],
            create_event_tx="0xee",
            create_market_txs=["0xmm"],
        )

    monkeypatch.setattr(main_module, "create_event_and_markets", _fake)
    prop = EventProposal(
        proposalId="p-int-1",
        proposerAddress="0x1111111111111111111111111111111111111111",
        title="E2E",
        category="earnings",
        ticker="AAPL",
        metric=Metric.eps,
        fiscalYear=2026,
        fiscalQuarter=1,
    )
    create_proposal(prop)
    req = ProposalApproveRequest(
        confirmedBy="0xadmin",
        closeTimeUnix=2_000_000_000,
        markets=[
            ProposalMarketSpec(
                question="EPS beat?",
                resolutionSpecHash="0x" + "22" * 32,
                resolutionSpecURI="ipfs://spec",
            )
        ],
    )
    r = approve_proposal("p-int-1", req)
    print(f"📤 approve response eventId={r.get('eventId')!r} marketIds={r.get('marketIds')!r}")
    assert r["eventId"] == 3
    stored = memory_store.items["proposals/p-int-1.json"]
    assert stored["status"] == "approved"
    print(f"📖 Stored proposal status={stored['status']!r} onChain={stored.get('onChain')}")
    print("✅ Integration-style approve still passes with this stub.")


def test_reject_proposal(memory_store) -> None:
    print("\n" + "=" * 60)
    print("📛 TEST: reject_proposal (resolution module test file duplicate flow)")
    print("=" * 60)
    prop = EventProposal(
        proposalId="p-rej",
        proposerAddress="0x2222222222222222222222222222222222222222",
        title="X",
        category="earnings",
        ticker="MSFT",
        metric=Metric.eps,
        fiscalYear=2026,
        fiscalQuarter=1,
    )
    create_proposal(prop)
    out = reject_proposal("p-rej", ProposalRejectRequest(confirmedBy="0xadmin", reason="no"))
    print(f"📤 reject response: {out!r}")
    assert memory_store.items["proposals/p-rej.json"]["status"] == "rejected"
    print("✅ Status in store is rejected.")
