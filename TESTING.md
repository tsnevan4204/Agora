# TESTING.md

This file is the practical runbook for validating the current architecture before frontend work.

## Scope

- Smart contracts on BSC testnet (`bscTestnet`)
- Gas sponsorship flow via `AgoraForwarder` + Python relayer endpoint
- Backend pipeline tests (API + resolution + storage wiring)
- Multi-wallet integration (up to 6 wallets)

---

## 0) Prerequisites

- Root `.env` populated from `env.example`
- BSC testnet RPC configured:
  - `BSC_TESTNET_RPC_URL=...`
- Deployer + relayer funded with testnet BNB
- Python virtualenv created for backend

Install deps:

```bash
yarn install
cd packages/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

---

## 1) Deploy contracts + sync ABIs to frontend

Run from repo root:

```bash
yarn compile
yarn workspace @se-2/hardhat deploy --network bscTestnet --tags core,sync-frontend
```

Expected:
- Deploy logs for `AgoraForwarder`, `MockUSDT`, `MarketFactory`, `OutcomeToken1155`, `PredictionMarketManager`, `Exchange`
- `packages/nextjs/contracts/deployedContracts.ts` updated

Then set deployed addresses into `.env`:

- `MOCK_USDT_ADDRESS`
- `MANAGER_ADDRESS`
- `EXCHANGE_ADDRESS`
- `FORWARDER_ADDRESS`

---

## 2) Prepare test wallets (max 6)

Populate in `.env`:

- `TEST_WALLET_1_ADDRESS` ... `TEST_WALLET_6_ADDRESS`
- `TEST_WALLET_1_PRIVATE_KEY` ... `TEST_WALLET_6_PRIVATE_KEY`

Mint mock collateral to configured wallet addresses:

```bash
yarn hardhat:mint:test-wallets
```

Expected:
- one mint tx log per configured test wallet

---

## 3) Backend unit/integration tests (pytest)

Run full suite (quiet pytest):

```bash
yarn backend:test
```

Verbose **stdout** from tests (they use `print()`; pytest hides it unless you disable capture):

```bash
cd packages/backend
python3 -m pytest tests/ -vv -s
```

Run **one** test by node id (examples):

```bash
cd packages/backend
python3 -m pytest tests/test_main_health_proposals.py::test_health_returns_ok -vv -s
python3 -m pytest tests/test_relayer_api.py::test_relay_forward_endpoint_success -vv -s
```

List test names without running:

```bash
cd packages/backend
python3 -m pytest tests/ --collect-only -q
```

`packages/backend/pyproject.toml` (`[tool.pytest.ini_options]`) disables only web3’s optional `pytest_ethereum` plugin; you should not need `PYTEST_DISABLE_PLUGIN_AUTOLOAD`.

What this validates:
- API routes for health/proposals/resolution/relay response contracts
- Resolution packet writing behavior
- Error handling (`overrideReason`, missing metrics, `marketIds`/`specs` alignment, scrape failures)
- Storage path correctness using in-memory store patching

Notes:
- These tests intentionally mock scraper/chain for deterministic CI-style coverage.
- `pyproject.toml` turns off web3’s `pytest_ethereum` plugin so pytest starts reliably when `web3` is only a library dependency.
- Real Yahoo/GCS checks are covered by live integration steps below.

---

## 4) Contract unit tests (local deterministic)

Even though main pipeline is testnet-focused, keep this as safety net for logic regressions:

```bash
yarn hardhat:test:unit
```

You should see per-test banners (`START` / `END` with pass/fail), `[fixture]` lines for each `deployProtocolFixture`, and `[step]` lines in selected tests.

Run **one file** (use embedded Hardhat network, same as `yarn test:unit`):

```bash
cd packages/hardhat
yarn exec hardhat test test/factory.spec.ts --network hardhat
```

Run **one test** by title (Mocha `--grep`; use a unique substring from the `it("…")` string):

```bash
cd packages/hardhat
yarn exec hardhat test test/factory.spec.ts --network hardhat --grep "creates event successfully by owner"
```

All tests include nearby comments describing what each test validates.

---

## 5) Gas sponsorship integration (testnet)

**Canonical path:** Python signs the same EIP-712 `ForwardRequest` as production and calls `POST /relay/forward` on your FastAPI backend (the relayer wallet pays gas). There is no parallel Hardhat forwarder script.

1. Start the backend with relay env set (`RELAYER_PRIVATE_KEY`, `FORWARDER_ADDRESS`, `RPC_URL`, `MANAGER_ADDRESS`, `EXCHANGE_ADDRESS`). Use a **different** key for `RESOLVER_PRIVATE_KEY` when testing resolution (see `PROJECT_PLAN.md` — Backend hot wallets).
2. From repo root:

```bash
yarn hardhat:integration:gas-sponsored
```

What it does:
- Builds calldata for `split(marketId, amount)` and an OpenZeppelin `ForwardRequest` typed-data payload
- Signs as `TEST_WALLET_1_PRIVATE_KEY`
- POSTs to `BACKEND_URL` (default `http://127.0.0.1:8000`)

Expected output:
- HTTP 200 and JSON `{ "ok": true, "txHash": "0x..." }` from the backend

If it fails:
- verify `FORWARDER_ADDRESS`, `MANAGER_ADDRESS`, `RELAYER_PRIVATE_KEY`, `TEST_WALLET_1_PRIVATE_KEY`, `RPC_URL` / `BSC_TESTNET_RPC_URL`
- ensure the backend is reachable at `BACKEND_URL`
- ensure the user has approved USDT to the manager before `split` (or run the six-wallet flow first)

---

## 6) Six-wallet testnet scenario (Hardhat + Mocha)

Run (requires `.env` with BSC testnet RPC, deployed addresses, and six `TEST_WALLET_*` keys):

```bash
yarn hardhat:test:bsc-testnet
```

What it does:
- `00-fund-six-wallets`: tops each wallet to ≥ 100 mUSDT via `MockUSDT.mint` (gas from `RELAYER_PRIVATE_KEY`)
- stress suite: approvals, micro-splits, multi-taker fills, SELL_NO, self-fill revert, merge, dust quote revert, round-robin fills

Expected output includes mint tx hashes, approval logs, and passing Mocha tests.

---

## 7) Combined testnet integration command

Runs both live testnet scripts (requires env, funded wallets, and **backend running** for the relay step):

```bash
yarn hardhat:test:testnet
```

Runs:
1. gas-sponsored flow (Python → `POST /relay/forward`)
2. `yarn hardhat:test:bsc-testnet` (Mocha on BSC testnet)

**Default `yarn test` (repo root)** runs only deterministic checks: `yarn hardhat:test:unit` and `yarn backend:test` (no RPC).

---

## 8) Backend live checks (non-mocked)

Start backend:

```bash
cd packages/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

Sanity checks:

```bash
curl http://127.0.0.1:8001/health
```

For resolution path:
- call `/resolution/pending/{eventId}` with a real ticker/spec payload
- verify objects written in GCS paths:
  - `resolutions/{eventId}/pending.json`
  - `resolutions/{eventId}/scraped_page.html`
  - `resolutions/{eventId}/extracted_data.json`

Then call `/resolution/confirm/{eventId}` and verify:
- `resolutions/{eventId}/admin_confirmation.json`
- `resolutions/{eventId}/resolution_results.json` (includes `onChain` with tx records when `RESOLVER_PRIVATE_KEY` + `MANAGER_ADDRESS` + `RPC_URL` are set)

**Evidence hash:** the `evidenceHash` field is `keccak256(utf8(canonical_json))` with sorted keys (see `packages/backend/app/resolution.py`). Re-fetch stored fields from GCS and use `verify_evidence_hash(...)` to confirm they match the hash passed to `resolve()` and the `MarketResolved` log.

---

## 9) Tuning intervals for integration testing

In `.env`:

- `SCHEDULER_POLL_INTERVAL_SECONDS`
- `EVENT_LISTENER_POLL_INTERVAL_SECONDS`
- `GCS_BATCH_INTERVAL_SECONDS`

Suggested aggressive test settings:

```env
SCHEDULER_POLL_INTERVAL_SECONDS=10
EVENT_LISTENER_POLL_INTERVAL_SECONDS=5
GCS_BATCH_INTERVAL_SECONDS=15
```

---

## 10) Common failure checklist

- Missing env var values (`RPC`, addresses, keys)
- Wallets not funded with testnet BNB
- USDT approvals not done before sponsored `split`
- Wrong network selected
- stale addresses from previous deployment

---

## 11) Current limitations (known)

- Full end-to-end auto-resolution on live earnings data still depends on operator timing (market close, resolver key funding, and Yahoo availability).
- Frontend E2E is intentionally deferred until contract/backend confidence is high.
