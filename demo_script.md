# Agora — Hackathon Demo Script
## BNB Chain Track | Prediction Markets for Institutional Alternative Data

---

## PRE-DEMO SETUP (do this 30 min before presenting)

### Step 1 — Seed demo volume (if not already done)
```bash
cd packages/hardhat
npx hardhat run scripts/seedDemoVolume.ts --network bsc
```
This takes ~90 seconds and creates real on-chain trades and order book depth
across 6 markets on BSC mainnet.

### Step 2 — Start the app
```bash
# Terminal 1 — Backend
cd packages/backend
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — Frontend
cd packages/AgoraFrontEnd
npm run dev
```

### Step 3 — MetaMask setup
- Make sure MetaMask is on **BNB Smart Chain** (chain 56, mainnet)
- You do NOT need BNB — the relayer pays gas for all your trades
- You will mint free demo USDT (mUSDT) from inside the app during the demo

---

## DEMO FLOW (~8 minutes)

---

### SCENE 1 — The Problem & Platform (1 min)
*Open the landing page at `localhost:3000` (or your Vercel URL)*

**Say:**
> "Hedge funds and institutional investors spend millions trying to understand what the market believes about upcoming events — earnings, Fed decisions, macro data. Agora is a decentralized prediction market that turns crowd conviction into structured alternative data, live on BNB Chain mainnet.

> Every trade is on-chain. Every probability you see is real market signal backed by actual collateral."

*Scroll slowly through the landing page — hero → market preview → features → how it works*

---

### SCENE 2 — Prove it's on mainnet first (45 sec)
*Open a new tab: `https://bscscan.com/address/0xc700452222A2c649f6B373e4F37aCE60AD982eE0`*

**Say:**
> "Before I show the app — here is our MarketFactory contract on BSCScan. BSC mainnet, not a testnet. You can see every market creation transaction. This contract address is in our submission."

*Scroll through the transaction list for 5 seconds.*

**Say:**
> "The exchange contract, the prediction manager, the outcome tokens — all six contracts are deployed and verified on mainnet."

*Switch back to the app.*

---

### SCENE 3 — The Markets Dashboard (1.5 min)
*Click "Start Trading" or waffle nav → Markets*

**Say:**
> "This is the markets dashboard. We have 30 curated prediction markets across macro, earnings, crypto, and tech. Every single one was created on-chain with a resolution date. They cover the questions that actually move institutional portfolios right now."

*Demo points:*
- Filter by category — click "Crypto", then "Earnings", then back to "All"
- Point out the resolve dates on the cards
- Click "Load more" to show pagination
- Point out the emoji/category system

**Say:**
> "Fed rate decisions. NVIDIA revenue beats. Bitcoin price levels. Tesla deliveries. These aren't toy questions — they're the exact events hedge fund analysts are already tracking. Let me click into one."

*Click market #0 — the Fed rate cut market*

---

### SCENE 4 — Live Trading (2.5 min)
*Opens `/trade?marketId=0`*

**Say:**
> "This is the trading interface. The question: will the Fed cut rates before September 2026? The order book shows real on-chain offers — placed by actual wallets during our seed run."

*Point to the order book — show the seeded depth on both sides*

**Say:**
> "This is a central limit order book, not an AMM. Market makers post limit orders and earn the bid-ask spread with zero impermanent loss. Familiar model for any quantitative trading desk."

*Connect MetaMask — MetaMask will ask to switch to BNB Smart Chain, approve it*

**If first time (approval panel shows):**
> "Standard ERC-20 approval — give the contracts permission to move my collateral. Same as any DeFi app. One time only."

*Click both Approve buttons*

**After approvals, or if already approved:**

*Click "Get 1,000 Demo USDT (free)"*

> "We use a demo collateral token — mUSDT — so anyone can try the system without real funds. The market mechanics, order book, settlement, and resolution logic are identical to production USDT. Switching is a single deployment parameter."

*Wait for mint confirmation*

**Now post a trade:**
1. In the order form: select **Buy** tab, **YES** outcome, price `7200`, size `5`
2. Click **Post Offer** → MetaMask signs a meta-transaction

> "Notice: I'm signing a meta-transaction. I never pay gas — our EIP-2771 relayer covers it. That's critical for institutional UX: nobody at a hedge fund wants to manage BNB just to express a view."

*After confirmation, point at the toast with BSCScan link*

> "There it is — confirmed on BSCScan mainnet in 3 seconds. Every trade Agora facilitates is publicly verifiable by anyone, forever."

*Click the BSCScan link, show the actual transaction*

---

### SCENE 5 — Analytics Dashboard (1.5 min)
*Waffle nav → Analytics → login: `company` / `company`*

**Say:**
> "This is the institutional analytics layer — the actual product we're selling to hedge funds. It's gated with a company login."

*Walk through:*

1. **Overview probability charts:**
   > "Average YES probability by category. You can immediately see whether crowds are bullish or bearish across macro, earnings, crypto, and tech — one number per category, updated as people trade."

2. **Individual market drill-down — click market #8 (BTC $120K):**
   > "The crowd is pricing Bitcoin above $120K by Q3 2026 at roughly 48% — a coin flip. That uncertainty is the signal. If you're a macro fund, a 48% crowd probability on BTC is a data point your model can use."

3. **News panel:**
   > "We surface live financial news tagged to each market. Every piece of information that should move a probability is shown in context, right next to the market it affects."

**Say:**
> "The data product is the time series of these probability curves. A quant fund subscribes to this as an alternative data feed — crowd sentiment, continuously updated, for every major earnings event and macro question on our board. That's the Bloomberg alternative we're building, except it's crowd-sourced and on-chain verifiable."

---

### SCENE 6 — Propose a Market (45 sec)
*Waffle nav → Propose*

**Say:**
> "Anyone can propose a new prediction market. Say I want to ask whether the 10-year Treasury yield inverts again before Q4."

*Fill in the form with a realistic title and question, click Submit*

> "That goes into the moderation queue. Once approved it deploys on-chain and immediately starts generating signal. This is the curation flywheel — community-sourced markets keep the data relevant, which attracts more traders, which makes the signal more accurate."

---

### SCENE 7 — Admin Panel (45 sec)
*Waffle nav → Admin → login: `username` / `password`*

**Say:**
> "The admin panel does two things: reviews market proposals from users, and resolves markets when real-world outcomes are known."

*Show the resolve markets tab*

> "When the actual Fed decision is announced, the admin submits the outcome with an on-chain evidence hash — a cryptographic hash of the source data used to determine the result, stored permanently on-chain. Any independent party can verify the resolution against the original data source. Fully auditable."

> "The roadmap: Chainlink price feeds for trustless auto-resolution on any quantifiable market — removing the human step entirely for price-based questions."

---

### SCENE 8 — Wrap-Up (30 sec)

**Say:**
> "To summarize what you just saw:
> — 30 real prediction markets on BSC mainnet, every one verifiable on BSCScan
> — Gasless CLOB exchange using EIP-2771 meta-transactions — users never touch BNB
> — Institutional analytics dashboard turning crowd trades into a probability data feed
> — Open market proposal flow with on-chain admin governance
> — Evidence-hashed resolution with a Chainlink auto-resolution roadmap

> The business model: we monetize the analytics layer, not the trading. Prediction market activity is free to generate. The structured probability time series is what institutions pay for.

> MarketFactory is live at `0xc700452222A2c649f6B373e4F37aCE60AD982eE0` on BSC mainnet. This is Agora."

---

## QUICK REFERENCE

| Page | URL | Credentials |
|------|-----|-------------|
| Landing | `/` | — |
| Markets | `/markets` | — |
| Trade (Fed cut) | `/trade?marketId=0` | Wallet + mUSDT |
| Trade (BTC $120K) | `/trade?marketId=8` | Wallet + mUSDT |
| Analytics | `/analytics` | company / company |
| Propose | `/propose` | Wallet (optional) |
| Admin | `/admin` | username / password |

**Key contracts (BSC Mainnet, Chain 56):**

| Contract | Address |
|----------|---------|
| MarketFactory | `0xc700452222A2c649f6B373e4F37aCE60AD982eE0` |
| Exchange | `0xb21A345ad3044B0d8841fF51216747B796b8B32f` |
| PredictionMarketManager | `0xa1715140E49feac1DEA850b28b4Ce7C8d9c15cc0` |
| MockUSDT | `0xb6ba3E454967cC43909c7597D760aeEFE3Fc7a5f` |
| AgoraForwarder | `0x9BC2E015f6E209DcbafB2e0bA21F3632f0C4faD6` |
| OutcomeToken1155 | `0xbe1439C58139b884c9d7951039730Ac8Ba229315` |

**Best BSCScan link to show judges:**
`https://bscscan.com/address/0xc700452222A2c649f6B373e4F37aCE60AD982eE0`

---

## IF SOMETHING GOES WRONG

| Problem | Fix |
|---------|-----|
| Wallet won't connect | Make sure MetaMask is on BNB Smart Chain (chain 56, mainnet) |
| "Wrong network" alert | Click "Switch network" in the alert bar |
| Split fails | Check approval banner — both approvals needed first |
| Order book empty | Run `seedDemoVolume.ts --network bsc` again |
| Backend unreachable | Start backend: `cd packages/backend && uvicorn app.main:app --port 8001` |
| Analytics login fails | Use exactly: `company` / `company` (all lowercase) |
| Admin login fails | Use exactly: `username` / `password` |
| "No markets found" | Run `npx hardhat deploy --network bsc --tags sync-frontend` then restart frontend |

---

## TOUGH QUESTION ANSWERS

**"Why MockUSDT and not real USDT?"**
> "Demo collateral lets anyone reproduce and try the system without real funds — judges need that. The contracts are production-grade: switching the collateral to real BSC USDT at `0x55d398326f99059fF775485246999027B3197955` is a single deployment parameter change. Every mechanic is identical."

**"How robust is your oracle / resolution?"**
> "Resolution is authorized and evidence-hashed on-chain — every decision is permanently auditable. The immediate roadmap is Chainlink Data Feeds for trustless auto-resolution on any price-based market. Subjective markets keep the evidence-hash model which provides a full audit trail."

**"What's your moat against Polymarket?"**
> "Polymarket is consumer, general-purpose, and US-restricted. We're institutional, finance-curated, and on BNB Chain. Our moat is the analytics layer — we're not a betting app, we're an alternative data company. The prediction market is the data collection mechanism."

**"How do you attract market makers and LPs?"**
> "CLOB model means market makers earn the spread with zero IL risk. The gasless relayer means they never manage BNB. LPs who split collateral into YES/NO earn from resolution. We seed initial liquidity as the protocol to bootstrap the loop."

**"Why BNB Chain?"**
> "Sub-cent gas costs, 3-second finality, 4 million daily active DeFi users. The gasless meta-transaction layer means traders never touch BNB directly — zero onboarding friction."
