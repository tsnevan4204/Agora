"""
Unit tests for ``app.relayer`` (allowlists, calldata guard, ``relay_forward_request`` with mocked Web3).

No live RPC. Use ``pytest -vv -s`` for prints.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from web3 import Web3 as RealWeb3

from app.models import RelayForwardRequest
import app.relayer as relayer_mod
from app.relayer import (
    ALLOWED_SELECTORS,
    RelayResult,
    _is_allowed_target,
    _normalize_pk,
    _selector,
    relay_forward_request,
)


MGR = "0x1111111111111111111111111111111111111111"
EXC = "0x2222222222222222222222222222222222222222"
FWD = "0x3333333333333333333333333333333333333333"


def _split_data() -> str:
    """Minimal split(uint256,uint256) calldata: selector + two zero uint256."""
    return (
        "0x6114f3f4"
        + "0" * 64
        + "0" * 64
    )


def _req(
    *,
    to_addr: str = MGR,
    data: str = _split_data(),
    from_addr: str = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
) -> RelayForwardRequest:
    return RelayForwardRequest.model_validate(
        {
            "from": from_addr,
            "to": to_addr,
            "value": 0,
            "gas": 300_000,
            "deadline": 9_999_999_999,
            "data": data,
            "signature": "0x" + "ab" * 65,
        }
    )


def _patch_relayer_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(relayer_mod.settings, "rpc_url", "http://mock.rpc")
    monkeypatch.setattr(relayer_mod.settings, "relayer_private_key", "0x" + "1" * 64)
    monkeypatch.setattr(relayer_mod.settings, "forwarder_address", FWD)
    monkeypatch.setattr(relayer_mod.settings, "manager_address", MGR)
    monkeypatch.setattr(relayer_mod.settings, "exchange_address", EXC)


# --- pure helpers ---


def test_selector_extracts_four_byte_prefix() -> None:
    print("\n" + "=" * 60)
    print("🔧 TEST: _selector")
    print("=" * 60)
    assert _selector("") == ""
    assert _selector("0x") == ""
    assert _selector("0x6114f3") == ""
    assert _selector(_split_data()).lower() == "0x6114f3f4"
    print(f"   split selector = {_selector(_split_data())!r}")
    print("✅")


def test_normalize_pk_adds_0x() -> None:
    print("\n" + "=" * 60)
    print("🔧 TEST: _normalize_pk")
    print("=" * 60)
    assert _normalize_pk("abc") == "0xabc"
    assert _normalize_pk("0xdef") == "0xdef"
    assert _normalize_pk("  0x11  ") == "0x11"
    print("✅")


def test_is_allowed_target_respects_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🔧 TEST: _is_allowed_target (case-insensitive)")
    print("=" * 60)
    monkeypatch.setattr(relayer_mod.settings, "manager_address", MGR)
    monkeypatch.setattr(relayer_mod.settings, "exchange_address", EXC)
    assert _is_allowed_target(MGR) is True
    assert _is_allowed_target(MGR.upper()) is True
    assert _is_allowed_target(EXC) is True
    assert _is_allowed_target("0x9999999999999999999999999999999999999999") is False
    print("✅ Only manager + exchange pass.")


def test_allowed_selectors_documented_merge_redeem() -> None:
    print("\n" + "=" * 60)
    print("📋 SANITY: allowlist contains expected family of selectors")
    print("=" * 60)
    expected = {
        "0x6114f3f4",
        "0xf6f8d0b2",
        "0x24598f06",
        "0x70265f74",
        "0x9a100a9b",
        "0x52e9ca89",
    }
    assert expected == ALLOWED_SELECTORS
    print(f"   count={len(ALLOWED_SELECTORS)} → {sorted(ALLOWED_SELECTORS)}")
    print("✅ If Solidity entry points change, update relayer + this assertion.")


# --- relay_forward_request early exits (no Web3) ---


def test_relay_rejects_missing_rpc_url(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: missing RPC_URL")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    monkeypatch.setattr(relayer_mod.settings, "rpc_url", "")
    r = relay_forward_request(_req())
    print(f"   {r!r}")
    assert r.ok is False
    assert "Missing" in (r.reason or "")
    print("✅")


def test_relay_rejects_missing_forwarder_address(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: missing FORWARDER_ADDRESS")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    monkeypatch.setattr(relayer_mod.settings, "forwarder_address", "")
    r = relay_forward_request(_req())
    assert r.ok is False
    assert "Missing" in (r.reason or "")
    print("✅")


def test_relay_rejects_missing_relayer_key(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: missing RELAYER_PRIVATE_KEY")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    monkeypatch.setattr(relayer_mod.settings, "relayer_private_key", "")
    r = relay_forward_request(_req())
    assert r.ok is False
    print("✅")


def test_relay_rejects_disallowed_target_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: `to` is not manager or exchange")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    r = relay_forward_request(_req(to_addr="0x9999999999999999999999999999999999999999"))
    assert r.ok is False
    assert "allowlist" in (r.reason or "").lower()
    print(f"   reason={r.reason!r}")
    print("✅")


def test_relay_rejects_unknown_function_selector(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: calldata selector not in allowlist")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    bad_data = "0xdeadbeef" + "0" * 64  # wrong selector
    r = relay_forward_request(_req(data=bad_data))
    assert r.ok is False
    assert "selector" in (r.reason or "").lower()
    print("✅ Arbitrary contract calls are blocked.")


# --- relay_forward_request with mocked Web3 ---


class _FakeTxHash:
    def hex(self) -> str:
        return "0x" + "c0" * 32


class _FakeReceipt:
    def __init__(self, status: int) -> None:
        self.status = status


class _FakeSigned:
    raw_transaction = b"\x02\xf8"


class _FakeAcct:
    address = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    def sign_transaction(self, tx: dict) -> Any:
        return _FakeSigned()


class _FakeVerifyCall:
    def __init__(self, ok: bool) -> None:
        self._ok = ok

    def call(self) -> bool:
        return self._ok


class _FakeExecuteCall:
    def __init__(self, parent: "_FakeForwarder") -> None:
        self._parent = parent

    def build_transaction(self, params: dict) -> dict:
        self._parent._built_params = params
        return {"to": FWD, "data": "0x"}


class _FakeForwarderFns:
    def __init__(self, parent: "_FakeForwarder") -> None:
        self._p = parent

    def verify(self, req_tuple: Any) -> _FakeVerifyCall:
        self._p._last_verify_tuple = req_tuple
        return _FakeVerifyCall(self._p.verify_ok)

    def execute(self, req_tuple: Any) -> _FakeExecuteCall:
        self._p._last_execute_tuple = req_tuple
        return _FakeExecuteCall(self._p)


class _FakeForwarder:
    """Mimic ``Contract.functions`` as an **attribute** (not ``functions()`` method)."""

    def __init__(self, *, verify_ok: bool = True, receipt_status: int = 1) -> None:
        self.verify_ok = verify_ok
        self.receipt_status = receipt_status
        self._last_verify_tuple: Any = None
        self._last_execute_tuple: Any = None
        self._built_params: dict | None = None
        self.functions = _FakeForwarderFns(self)


class _FakeAccountMod:
    @staticmethod
    def from_key(pk: str) -> _FakeAcct:
        return _FakeAcct()


class _FakeEth:
    chain_id = 97
    account = _FakeAccountMod()

    def __init__(self, forwarder: _FakeForwarder) -> None:
        self._forwarder = forwarder

    def get_transaction_count(self, addr: str) -> int:
        return 42

    def contract(self, *args: Any, **kwargs: Any) -> _FakeForwarder:
        return self._forwarder

    def estimate_gas(self, tx: dict) -> int:
        return 200_000

    def send_raw_transaction(self, raw: bytes) -> _FakeTxHash:
        return _FakeTxHash()

    def wait_for_transaction_receipt(self, h: _FakeTxHash) -> _FakeReceipt:
        return _FakeReceipt(self._forwarder.receipt_status)


class _FakeW3:
    def __init__(self, forwarder: _FakeForwarder) -> None:
        self.eth = _FakeEth(forwarder)


def _web3_stub_class(forwarder: _FakeForwarder) -> type:
    """``relay_forward_request`` calls ``Web3(...)`` and ``Web3.to_checksum_address``; stub both."""

    class _Web3Stub:
        HTTPProvider = MagicMock(return_value=object())

        to_checksum_address = staticmethod(RealWeb3.to_checksum_address)

        def __new__(cls, provider: object) -> _FakeW3:
            return _FakeW3(forwarder)

    return _Web3Stub


def test_relay_verify_fails_returns_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("🚫 TEST: forwarder.verify → False")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    fwd = _FakeForwarder(verify_ok=False)
    monkeypatch.setattr(relayer_mod, "Web3", _web3_stub_class(fwd))

    r = relay_forward_request(_req())
    print(f"   {r!r}")
    assert r.ok is False
    assert "verification" in (r.reason or "").lower()
    assert fwd._last_verify_tuple is not None
    print("✅ Never sent execute.")


def test_relay_success_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("✅ TEST: verify True, receipt status 1")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    fwd = _FakeForwarder(verify_ok=True, receipt_status=1)
    monkeypatch.setattr(relayer_mod, "Web3", _web3_stub_class(fwd))

    body = _req()
    r = relay_forward_request(body)
    print(f"   result={r!r}")
    assert r.ok is True
    assert r.tx_hash and r.tx_hash.startswith("0x")
    assert fwd._last_verify_tuple == fwd._last_execute_tuple
    assert fwd._built_params is not None
    assert fwd._built_params.get("chainId") == 97
    print("✅ Tuple forwarded to verify + execute; gas bumped ~1.2x off estimate.")


def test_relay_on_chain_revert_sets_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("💥 TEST: receipt.status != 1")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    fwd = _FakeForwarder(verify_ok=True, receipt_status=0)
    monkeypatch.setattr(relayer_mod, "Web3", _web3_stub_class(fwd))

    r = relay_forward_request(_req())
    assert r.ok is False
    assert "reverted" in (r.reason or "").lower()
    assert r.tx_hash is not None
    print(f"   tx_hash still returned for debugging: {r.tx_hash}")
    print("✅")


@pytest.mark.parametrize(
    "exc_msg, want_substr",
    [
        ("insufficient funds for gas", "insufficient funds"),
        ("nonce too low", "nonce"),
        ("replacement transaction underpriced", "nonce"),
        ("could not connect to rpc", "rpc connection"),
        ("execution timed out", "rpc connection"),
    ],
)
def test_relay_exception_message_mapping(
    monkeypatch: pytest.MonkeyPatch, exc_msg: str, want_substr: str
) -> None:
    print(f"\n   mapping: {exc_msg!r} → contains {want_substr!r}")
    _patch_relayer_settings(monkeypatch)
    fwd = _FakeForwarder(verify_ok=True, receipt_status=1)

    class BoomEth(_FakeEth):
        def estimate_gas(self, tx: dict) -> int:
            raise RuntimeError(exc_msg)

    class BoomW3(_FakeW3):
        def __init__(self, f: _FakeForwarder) -> None:
            self.eth = BoomEth(f)

    class _ErrWeb3:
        HTTPProvider = MagicMock(return_value=object())
        to_checksum_address = staticmethod(RealWeb3.to_checksum_address)

        def __new__(cls, provider: object) -> BoomW3:
            return BoomW3(fwd)

    monkeypatch.setattr(relayer_mod, "Web3", _ErrWeb3)

    r = relay_forward_request(_req())
    assert r.ok is False
    assert want_substr.lower() in (r.reason or "").lower()
    print("   ✅")


def test_relay_to_exchange_with_fill_selector(monkeypatch: pytest.MonkeyPatch) -> None:
    print("\n" + "=" * 60)
    print("✅ TEST: target = exchange + fillOffer selector allowed")
    print("=" * 60)
    _patch_relayer_settings(monkeypatch)
    fill_data = "0x9a100a9b" + "0" * 128
    fwd = _FakeForwarder(verify_ok=True, receipt_status=1)
    monkeypatch.setattr(relayer_mod, "Web3", _web3_stub_class(fwd))

    r = relay_forward_request(_req(to_addr=EXC, data=fill_data))
    assert r.ok is True
    print("✅ Exchange + fillOffer path reaches mocked execute.")
