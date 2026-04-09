"""
Shared fixtures for chain integration tests.

Works against BSC testnet (default) or a local Hardhat / Anvil node.
Skipped automatically if the configured RPC is unreachable.

Run:  pytest tests/integration/ -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

_tests_dir = str(Path(__file__).resolve().parents[1])
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from chain_helpers import ChainKit, RPC_URL  # noqa: E402


@pytest.fixture(scope="module")
def kit() -> ChainKit:
    try:
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        if not w3.is_connected():
            raise ConnectionError()
    except Exception:
        pytest.skip(f"No chain reachable at {RPC_URL}")
    return ChainKit.from_rpc()


@pytest.fixture()
def snap(kit: ChainKit):
    """EVM snapshot/revert — only active on local chains, no-op on testnet."""
    if kit.is_local:
        sid = kit.snapshot()
        yield
        kit.revert(sid)
    else:
        yield
