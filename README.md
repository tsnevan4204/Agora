# Agora Prediction Markets

USDT-collateralized prediction markets on BNB Smart Chain with:
- `MarketFactory` for event/market metadata
- `OutcomeToken1155` for YES/NO positions (`marketId * 2`, `marketId * 2 + 1`)
- `PredictionMarketManager` for split/merge/resolve/redeem
- `Exchange` for on-chain posted offers (`postOffer`/`fillOffer`/`cancelOffer`)
- `AgoraForwarder` for EIP-2771 meta-transaction support

## Monorepo Structure

- `packages/hardhat`: contracts, deploy scripts, tests
- `packages/AgoraFrontEnd`: Next.js marketing + trading UI (ABIs from `yarn agora:sync-abi`)
- `packages/backend`: Python backend (proposals, resolution worker, event archiving)

## Quick Start

1. Install deps:
   - `yarn install`
2. Start local chain:
   - `yarn chain`
3. Deploy contracts:
   - `yarn deploy`
4. Start frontend:
   - `yarn agora:dev` (or `cd packages/AgoraFrontEnd && pnpm dev`)
5. Run deterministic tests (Hardhat unit suite + backend pytest):
   - `yarn test`
   - Live testnet scripts: `yarn hardhat:test:testnet` (see [TESTING.md](TESTING.md))

## Environment

Use the root `.env` for project configuration (contracts, frontend, backend).

Key variables include:
- `DEPLOYER_PRIVATE_KEY`
- `RELAYER_PRIVATE_KEY` (gas-only forwarder hot wallet; must differ from `RESOLVER_PRIVATE_KEY`)
- `RESOLVER_PRIVATE_KEY` (submits `resolve()`; ops/admin key, not the relayer)
- `BSC_RPC_URL`
- `BSC_TESTNET_RPC_URL`
- `RPC_URL`
- `GCS_BUCKET`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

## Notes

- Legacy AMM challenge contracts and AMM UI routes have been removed.
- Current implementation is orderbook-focused and aligned with the refactor plan.
- **`Exchange` is intentionally high-trust in this MVP:** privileged roles and on-chain checks favor operational simplicity over adversarial hardening. Tighter invariants (e.g. stricter offer validation, pausable fills, additional replay protection) are a deliberate follow-up, not an oversight.

## Testing

- `yarn test` runs local Hardhat contract tests plus backend pytest (no live RPC).
- Testnet flows (gas-sponsored relay, multi-wallet scripts) are documented in [TESTING.md](TESTING.md); start the Python backend before `yarn hardhat:integration:gas-sponsored`.
