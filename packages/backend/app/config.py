from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass
from dotenv import load_dotenv

ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ROOT_ENV_PATH)


def _env_truthy(name: str, default: str = "") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _normalize_pk_hex(pk: str) -> str:
    s = pk.strip()
    if not s:
        return ""
    return s[2:].lower() if s.startswith("0x") else s.lower()


@dataclass
class Settings:
    gcs_bucket: str = os.getenv("GCS_BUCKET", "agora-market-data")
    fmp_api_key: str = os.getenv("FMP_API_KEY", "")
    rpc_url: str = os.getenv("RPC_URL", "http://127.0.0.1:8545")
    manager_address: str = os.getenv("MANAGER_ADDRESS", "")
    exchange_address: str = os.getenv("EXCHANGE_ADDRESS", "")
    forwarder_address: str = os.getenv("FORWARDER_ADDRESS", "")
    factory_address: str = os.getenv("FACTORY_ADDRESS", "")
    relayer_private_key: str = os.getenv("RELAYER_PRIVATE_KEY", "")
    resolver_private_key: str = os.getenv("RESOLVER_PRIVATE_KEY", "")
    factory_owner_private_key: str = os.getenv("FACTORY_OWNER_PRIVATE_KEY", "") or os.getenv("DEPLOYER_PRIVATE_KEY", "")
    parser_version: str = "v1"
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    scheduler_poll_interval_seconds: int = int(os.getenv("SCHEDULER_POLL_INTERVAL_SECONDS", "120"))
    event_listener_poll_interval_seconds: int = int(os.getenv("EVENT_LISTENER_POLL_INTERVAL_SECONDS", "15"))
    gcs_batch_interval_seconds: int = int(os.getenv("GCS_BATCH_INTERVAL_SECONDS", "60"))
    # Yahoo scrape: optional Playwright (JS + real browser TLS/cookies) vs plain requests.
    yahoo_use_playwright: bool = _env_truthy("YAHOO_USE_PLAYWRIGHT")
    yahoo_playwright_fallback: bool = _env_truthy("YAHOO_PLAYWRIGHT_FALLBACK")
    yahoo_request_delay_seconds: float = float(os.getenv("YAHOO_REQUEST_DELAY_SECONDS", "0"))
    yahoo_playwright_timeout_ms: int = int(os.getenv("YAHOO_PLAYWRIGHT_TIMEOUT_MS", "45000"))


settings = Settings()

_r = _normalize_pk_hex(settings.relayer_private_key)
_s = _normalize_pk_hex(settings.resolver_private_key)
if _r and _s and _r == _s:
    raise ValueError(
        "RELAYER_PRIVATE_KEY and RESOLVER_PRIVATE_KEY must be different keys. "
        "Relayer is a gas-only hot wallet for EIP-2771 forwarder calls; resolver is the on-chain "
        "resolver/admin-capable wallet (see PROJECT_PLAN.md — Backend hot wallets)."
    )
