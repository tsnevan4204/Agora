# Agora — Hackathon Demo Script
## BNB Chain Track | Prediction Markets for Institutional Alternative Data

---

## PRE-DEMO SETUP (do this 30 min before presenting)

### Step 1 — Get tBNB gas
1. Open browser → https://testnet.bnbchain.org/faucet-smart
2. Paste deployer address: `0x93aD22b81B285B2D992E7AC28fD594d85892072E`
3. Click "Give me BNB" — you get 0.1 tBNB free, no money needed
4. Wait ~30 seconds for confirmation

### Step 2 — Add TEST_WALLET private keys to .env
The seed script needs private keys for the 6 test wallets. Add to `Agora/.env`:
```
TEST_WALLET_1_PRIVATE_KEY=0x...
TEST_WALLET_2_PRIVATE_KEY=0x...
TEST_WALLET_3_PRIVATE_KEY=0x...
TEST_WALLET_4_PRIVATE_KEY=0x...
TEST_WALLET_5_PRIVATE_KEY=0x...
TEST_WALLET_6_PRIVATE_KEY=0x...
```

### Step 3 — Seed demo volume
```bash
cd packages/hardhat
npx hardhat run scripts/seedDemoVolume.ts --network bscTestnet
```
This takes ~60 seconds and creates real on-chain orders across 6 markets.

### Step 4 — Start the app
```bash
# Terminal 1 — Frontend
cd packages/AgoraFrontEnd && pnpm dev

# Terminal 2 — Backend (for off-chain order book)
cd packages/backend && uvicorn app.main:app --port 8001 --reload
```

### Step 5 — MetaMask setup for your demo wallet
- Add BNB Smart Chain Testnet (Chain ID: 97, RPC: https://data-seed-prebsc-1-s1.bnbchain.org:8545)
- Make sure you have some tBNB in your own wallet for gas
- You'll get free mUSDT (test USDT) from the deployer during the demo

---

## DEMO FLOW (~8 minutes)

---

### SCENE 1 — The Problem & Platform (1 min)
*Open the landing page at `localhost:3000`*

**Say:**
> "Hedge funds and institutional investors spend millions trying to understand what the market believes about upcoming events — earnings, Fed decisions, macro data. Agora is a decentralized prediction market that turns crowd wisdom into structured alternative data, live on BNB Chain.

> Every single trade is on-chain. Every probability you see here is real market signal, not an estimate."

*Scroll slowly through the landing page — hero → market preview → features → how it works*

---

### SCENE 2 — The Markets Dashboard (1.5 min)
*Click "Start Trading" or the waffle nav → Markets*

**Say:**
> "This is the markets dashboard. We have 30 curated prediction markets across macro, earnings, crypto, and tech. All created on-chain — I can show you the contract address after. Each one has a resolution date, and they cover the biggest questions markets are asking right now."

*Demo points:*
- Filter by category — click "Crypto", then "Earnings", then back to "All"
- Point out the resolve dates on the cards ("Resolves Jan 18, 2027")
- Click "Load more" to show pagination
- Search for "Apple" to show search
- Point out the emoji/category system

**Say:**
> "These are all real prediction markets on BSC testnet. Let me click into one."

---

### SCENE 3 — Live Trading (2.5 min)
*Click the Fed rate cut market (#87) card → opens `/trade?marketId=87`*

**Say:**
> "This is the trading interface. The question is: will the Fed cut rates before September 2026? The order book on the right shows real on-chain offers — these were placed by actual wallets."

*Point to the order book — show the seeded volume*

**Say:**
> "Let me make a live trade. I'll connect my wallet first."

*Connect MetaMask*

**If first time connecting (setup panel shows):**
> "Before trading, I need to give the contracts permission to use my test USDT — this is a standard ERC-20 approval, same as any DeFi app. I do this once."

*Click both Approve buttons, confirm in MetaMask each time*

**After approvals:**
> "Now let me take a position. I believe the Fed will cut rates, so I'm going to buy YES shares."

*Steps:*
1. In the Portfolio section, type `5` in the USDT amount box
2. Click **Split** → confirm in MetaMask
   > "Split converts 5 USDT into 5 YES tokens and 5 NO tokens. My collateral is locked on-chain."
3. Back to order form — select **Sell** tab, **YES** outcome, price `6500`, size `5`
4. Click **Sell YES** → confirm in MetaMask
   > "I'm now posting a limit offer: selling 5 YES shares at 65 cents each. This offer sits in the on-chain exchange contract."
5. Show the order appearing in the order book
6. Click the BSCScan link that appears in the toast
   > "Here's the actual transaction on BSCScan — anyone can verify this. This is what makes Agora trustworthy as an alternative data source."

---

### SCENE 4 — Analytics Dashboard (1.5 min)
*Open waffle nav → Analytics → login: company / company*

**Say:**
> "This is the institutional analytics layer — the real value proposition for hedge funds and quant firms. It's gated with a company login."

*Walk through:*

1. **Overview charts section:**
   > "Average YES probability by category — you can immediately see whether crowds are bullish or bearish across macro, earnings, crypto, and tech markets."

2. **Sentiment spectrum chart** (if seeded markets have orders):
   > "This shows the full YES/NO sentiment split across the most active markets. If you're a hedge fund and you see 72% YES on an Apple earnings beat, that's a signal you can incorporate into your model."

3. **Click a specific market filter pill** (e.g., the Fed market #87):
   > "Drill down into a single market. You see the implied probability gauge, order distribution, open orders, and a plain-English synopsis — 'crowd implies 65% probability of YES.'"

4. **News panel:**
   > "And we pull related financial headlines in real-time — completely free, no API key — so analysts can see what's driving sentiment."

**Say:**
> "This is the alternative data set. It's crowd-sourced, on-chain verifiable, and updated in real-time as people trade."

---

### SCENE 5 — Propose a Market (45 sec)
*Open waffle nav → Propose*

**Say:**
> "Anyone can propose a new prediction market. Let's say I want to ask whether Netflix will hit 200M subscribers by year end."

*Fill in the proposal form quickly with fictional data, click Submit*

> "That proposal goes to the admin for review before it goes on-chain. This keeps the market quality high."

---

### SCENE 6 — Admin Panel (45 sec)
*Open waffle nav → Admin → login: username / password*

**Say:**
> "The admin panel handles two things: reviewing proposals from users, and resolving markets when real-world outcomes are known."

*Show the proposal review tab → show the resolve markets tab*

> "When the actual Fed decision is announced, the admin resolves the market — YES or NO. Winning shares become redeemable for USDT. This is fully on-chain."

---

### SCENE 7 — Wrap-Up (30 sec)

**Say:**
> "To summarize what you just saw:
> - 30 real prediction markets on BNB Smart Chain testnet
> - Fully on-chain order book — every trade verifiable on BSCScan
> - Institutional analytics dashboard with sentiment analysis and live news
> - Open market proposal flow with admin governance
> - Alternative data that hedge funds can use to understand crowd expectations

> The contract address is `0x9BC2E015f6E209DcbafB2e0bA21F3632f0C4faD6` — it's live on BSC testnet right now."

---

## QUICK REFERENCE

| Page | URL | Credentials |
|------|-----|-------------|
| Landing | `/` | — |
| Markets | `/markets` | — |
| Trade | `/trade?marketId=87` | Wallet + mUSDT |
| Analytics | `/analytics` | company / company |
| Propose | `/propose` | Wallet (optional) |
| Admin | `/admin` | username / password |

**Key contracts (BSC Testnet, Chain 97):**
| Contract | Address |
|----------|---------|
| MarketFactory | `0x9BC2E015f6E209DcbafB2e0bA21F3632f0C4faD6` |
| Exchange | `0xbe1439C58139b884c9d7951039730Ac8Ba229315` |
| PredictionMarketManager | `0xc700452222A2c649f6B373e4F37aCE60AD982eE0` |
| MockUSDT | `0xdfd356EBE2C11a5F7872c0733987E0Da4bd9345b` |
| AgoraForwarder | `0x1B2e44b69091f84665799912aaeb9D685d46fd6d` |

**Best BSCScan search to show judges:**
https://testnet.bscscan.com/address/0x9BC2E015f6E209DcbafB2e0bA21F3632f0C4faD6

---

## IF SOMETHING GOES WRONG

| Problem | Fix |
|---------|-----|
| Wallet won't connect | Make sure MetaMask is on BSC Testnet (Chain 97) |
| "Wrong network" alert | Click "Switch network" in the alert bar |
| Split fails | Check approval banner — both approvals needed first |
| Order book empty | Markets seeded? Run `seedDemoVolume.ts` again |
| Backend unreachable alert | Start backend: `cd packages/backend && uvicorn app.main:app --port 8001` |
| Analytics login fails | Use exactly: company / company (lowercase) |
| Admin login fails | Use exactly: username / password |

---

## MAINNET DEPLOYMENT CHECKLIST (when ready)

1. Get real BNB for deployment gas (~0.5 BNB)
2. Run: `cd packages/hardhat && npx hardhat deploy --network bsc`
3. Sync contracts to frontend: `npx hardhat run scripts/syncFrontend.ts --network bsc` (or re-run deploy with `--tags sync-frontend`)
4. Update `NEXT_PUBLIC_BSC_TESTNET_RPC_URL` → BSC mainnet RPC in `.env`
5. Update `RPC_URL` in backend `.env` → BSC mainnet
6. Deploy backend to Railway / Render / GCP Cloud Run
7. Deploy frontend to Vercel (set all `NEXT_PUBLIC_*` env vars)
8. Update `NEXT_PUBLIC_BACKEND_URL` to your deployed backend URL
9. Create the first mainnet markets via `createFinanceMarkets.ts` against `--network bsc`

---

*Good luck! You've got a genuinely compelling product — a real on-chain prediction market generating institutional-grade alternative data. Show the judges the BSCScan link. That's the thing that makes it real.*
