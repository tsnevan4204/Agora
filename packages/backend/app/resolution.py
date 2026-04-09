from __future__ import annotations

import json
from datetime import datetime, timezone
from web3 import Web3

from .models import ResolutionSpec, PendingResolution


def compare_value(spec: ResolutionSpec, actual_value: float) -> bool:
    """Compare actual scraped value to spec. Spec must pass ResolutionSpec validation first."""
    if spec.operator == ">":
        assert spec.threshold is not None
        return actual_value > spec.threshold
    if spec.operator == ">=":
        assert spec.threshold is not None
        return actual_value >= spec.threshold
    if spec.operator == "<":
        assert spec.threshold is not None
        return actual_value < spec.threshold
    if spec.operator == "<=":
        assert spec.threshold is not None
        return actual_value <= spec.threshold
    if spec.operator == "between":
        assert spec.thresholdLow is not None and spec.thresholdHigh is not None
        return spec.thresholdLow <= actual_value <= spec.thresholdHigh
    return False


def build_pending_resolution(
    event_id: int,
    market_ids: list[int],
    ticker: str,
    extracted_values: dict,
    raw_html_hash: str,
    parsed_json_hash: str,
    outcomes: dict[int, str],
    parser_version: str,
    expected_earnings_time_utc: datetime,
) -> PendingResolution:
    return PendingResolution(
        eventId=event_id,
        marketIds=market_ids,
        ticker=ticker,
        scrapedAtUtc=datetime.now(timezone.utc),
        rawHtmlHash=raw_html_hash,
        parsedJsonHash=parsed_json_hash,
        extractedValues=extracted_values,
        proposedOutcomes=outcomes,
        parserVersion=parser_version,
        expectedEarningsTimeUtc=expected_earnings_time_utc,
    )


def evidence_hash(
    raw_html_hash: str,
    parsed_json_hash: str,
    extracted_values: dict,
    parser_version: str,
    expected_utc: str,
    confirmed_utc: str,
    override_reason: str | None = None,
    admin_address: str | None = None,
) -> str:
    payload = {
        "rawHtmlHash": raw_html_hash,
        "parsedJsonHash": parsed_json_hash,
        "extractedValues": extracted_values,
        "parserVersion": parser_version,
        "expectedEarningsTimeUtc": expected_utc,
        "confirmedAtUtc": confirmed_utc,
        "overrideReason": override_reason,
        "adminAddress": admin_address,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return Web3.keccak(text=canonical).hex()


def verify_evidence_hash(
    raw_html_hash: str,
    parsed_json_hash: str,
    extracted_values: dict,
    parser_version: str,
    expected_utc: str,
    confirmed_utc: str,
    override_reason: str | None,
    admin_address: str | None,
    expected_hex: str,
) -> bool:
    """Recompute evidence hash from stored fields and compare to on-chain / stored hex (with or without 0x)."""
    got = evidence_hash(
        raw_html_hash=raw_html_hash,
        parsed_json_hash=parsed_json_hash,
        extracted_values=extracted_values,
        parser_version=parser_version,
        expected_utc=expected_utc,
        confirmed_utc=confirmed_utc,
        override_reason=override_reason,
        admin_address=admin_address,
    )
    a = got.lower().removeprefix("0x")
    b = expected_hex.lower().removeprefix("0x")
    return a == b
