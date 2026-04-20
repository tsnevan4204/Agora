/**
 * Demo seed script — populates mainnet markets with realistic on-chain activity.
 *
 * Run BEFORE your demo:
 *   npx hardhat run scripts/seedDemoVolume.ts --network bsc
 *
 * What it does:
 *   - Mints mUSDT to deployer + one helper wallet
 *   - Funds helper wallet with a tiny BNB gas budget
 *   - For 6 selected markets: creates splits, cross-fills, and open order depth
 *   - YES/NO pricing reflects realistic market sentiment for each question
 */
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { ethers, deployments } from 'hardhat'

// Markets to seed — a spread across categories
// Fed cut(0), S&P(3), AAPL(4), BTC(8), Azure(10), GPT-5(21)
const DEMO_MARKET_IDS = [0, 3, 4, 8, 10, 21]

// Realistic YES implied probabilities (in basis points, 10000 = 100%)
// Based on current market sentiment as of April 2026
const MARKET_YES_PRICE: Record<number, number> = {
  0:  7200,  // Fed cut before Sep 2026 — 72% likely
  3:  5500,  // S&P 500 > 6000 Q2 2026 — 55% toss-up
  4:  6500,  // AAPL EPS > $1.85 — 65% likely
  8:  4800,  // BTC > $120K Q3 2026 — 48% uncertain
  10: 6800,  // Azure > 20% growth — 68% likely
  21: 5200,  // GPT-5 release before Oct 2026 — 52% toss-up
}

function normalizeKey(pk: string): string {
  const t = pk.trim()
  return t.startsWith('0x') ? t : `0x${t}`
}

function requireEnv(k: string): string {
  const v = process.env[k]?.trim()
  if (!v) throw new Error(`Missing env: ${k}`)
  return v
}

const to6 = (s: string) => ethers.parseUnits(s, 6)

async function main() {
  const provider = ethers.provider

  const deployerPk = normalizeKey(requireEnv('DEPLOYER_PRIVATE_KEY'))
  const helperPk   = normalizeKey(requireEnv('TEST_WALLET_1_PRIVATE_KEY'))
  const deployer   = new ethers.Wallet(deployerPk, provider)
  const helper     = new ethers.Wallet(helperPk,   provider)

  // Resolve contract addresses from deployment artifacts or env
  const mockUsdtAddr   = process.env.MOCK_USDT_ADDRESS?.trim()   || (await deployments.get('MockUSDT')).address
  const managerAddr    = process.env.MANAGER_ADDRESS?.trim()      || (await deployments.get('PredictionMarketManager')).address
  const exchangeAddr   = process.env.EXCHANGE_ADDRESS?.trim()     || (await deployments.get('Exchange')).address

  const usdt     = await ethers.getContractAt('MockUSDT', mockUsdtAddr)
  const manager  = await ethers.getContractAt('PredictionMarketManager', managerAddr)
  const exchange = await ethers.getContractAt('Exchange', exchangeAddr)
  const token1155Addr = await manager.outcomeToken()
  const token1155 = await ethers.getContractAt('OutcomeToken1155', token1155Addr)

  const { name: networkName } = await provider.getNetwork()
  console.log(`\n🌐 Network: ${networkName}`)
  console.log(`💰 Deployer: ${deployer.address}`)
  const deployerBnb = await provider.getBalance(deployer.address)
  console.log(`   BNB: ${ethers.formatEther(deployerBnb)}`)
  const helperBnb = await provider.getBalance(helper.address)
  console.log(`💰 Helper:   ${helper.address}`)
  console.log(`   BNB: ${ethers.formatEther(helperBnb)}\n`)

  // ── 1. Fund helper with BNB for gas if needed ──────────────────────────────
  const GAS_BUDGET = ethers.parseEther('0.005')
  if (helperBnb < GAS_BUDGET) {
    console.log('⛽ Sending BNB gas budget to helper wallet…')
    const tx = await deployer.sendTransaction({ to: helper.address, value: GAS_BUDGET })
    await tx.wait()
    console.log(`   ✅ Sent 0.005 BNB to ${helper.address.slice(0, 10)}…\n`)
  }

  // ── 2. Mint mUSDT ──────────────────────────────────────────────────────────
  console.log('💵 Minting mUSDT…')
  const DEPLOYER_USDT = to6('5000')
  const HELPER_USDT   = to6('1000')

  const deployerUsdtBal = await usdt.balanceOf(deployer.address)
  if (deployerUsdtBal < DEPLOYER_USDT) {
    await (await (usdt.connect(deployer) as typeof usdt).mint(deployer.address, DEPLOYER_USDT - deployerUsdtBal)).wait()
    console.log(`   ✅ Deployer minted to 5,000 mUSDT`)
  } else {
    console.log(`   ⏭️  Deployer already has ${ethers.formatUnits(deployerUsdtBal, 6)} mUSDT`)
  }
  const helperUsdtBal = await usdt.balanceOf(helper.address)
  if (helperUsdtBal < HELPER_USDT) {
    await (await (usdt.connect(deployer) as typeof usdt).mint(helper.address, HELPER_USDT - helperUsdtBal)).wait()
    console.log(`   ✅ Helper minted to 1,000 mUSDT`)
  } else {
    console.log(`   ⏭️  Helper already has ${ethers.formatUnits(helperUsdtBal, 6)} mUSDT`)
  }

  // ── 3. Approve Manager + Exchange for both wallets ─────────────────────────
  console.log('\n🔑 Approving Manager + Exchange…')
  const maxUint = ethers.MaxUint256
  for (const [wallet, label] of [[deployer, 'Deployer'], [helper, 'Helper']] as const) {
    const w = wallet as ethers.Wallet
    const manA = await usdt.allowance(w.address, managerAddr)
    if (manA < maxUint / 2n) {
      await (await (usdt.connect(w) as typeof usdt).approve(managerAddr, maxUint)).wait()
    }
    const exA = await usdt.allowance(w.address, exchangeAddr)
    if (exA < maxUint / 2n) {
      await (await (usdt.connect(w) as typeof usdt).approve(exchangeAddr, maxUint)).wait()
    }
    console.log(`   ✅ ${label} approved`)
  }

  // ── 4. Seed each demo market ───────────────────────────────────────────────
  for (const marketId of DEMO_MARKET_IDS) {
    const yesPriceBps = MARKET_YES_PRICE[marketId] ?? 5500
    const noPriceBps  = 10000 - yesPriceBps
    const mid = BigInt(marketId)

    console.log(`\n📊 Seeding market #${marketId} — YES @ ${yesPriceBps / 100}% / NO @ ${noPriceBps / 100}%`)

    const yesTokenId = await token1155.getYesTokenId(mid)
    const noTokenId  = await token1155.getNoTokenId(mid)

    // Round A: deployer splits, posts SELL_YES, helper fills (completed trade)
    const splitA = to6('60')
    await (await (manager.connect(deployer) as typeof manager).split(mid, splitA)).wait()

    const offerIdA = await (exchange.connect(deployer) as typeof exchange)
      .postOffer.staticCall(mid, 2n /* SELL_YES */, BigInt(yesPriceBps), to6('20'))
    await (await (exchange.connect(deployer) as typeof exchange)
      .postOffer(mid, 2n, BigInt(yesPriceBps), to6('20'))).wait()

    const fillA = await (exchange.connect(helper) as typeof exchange).fillOffer(offerIdA, to6('20'))
    await fillA.wait()
    console.log(`   🔄 Completed: deployer→helper  20 YES @ ${yesPriceBps / 100}% | ${fillA.hash.slice(0, 18)}…`)

    // Round B: helper splits, posts SELL_NO, deployer fills (opposite side)
    const splitB = to6('30')
    await (await (manager.connect(helper) as typeof manager).split(mid, splitB)).wait()

    const offerIdB = await (exchange.connect(helper) as typeof exchange)
      .postOffer.staticCall(mid, 3n /* SELL_NO */, BigInt(noPriceBps), to6('15'))
    await (await (exchange.connect(helper) as typeof exchange)
      .postOffer(mid, 3n, BigInt(noPriceBps), to6('15'))).wait()

    const fillB = await (exchange.connect(deployer) as typeof exchange).fillOffer(offerIdB, to6('15'))
    await fillB.wait()
    console.log(`   🔄 Completed: helper→deployer  15 NO  @ ${noPriceBps / 100}% | ${fillB.hash.slice(0, 18)}…`)

    // Round C: post open depth on both sides (unfilled, shows live order book)
    await (await (manager.connect(deployer) as typeof manager).split(mid, to6('80'))).wait()

    // BUY_YES depth (multiple price levels)
    await (await (exchange.connect(deployer) as typeof exchange).postOffer(mid, 0n /* BUY_YES */, BigInt(yesPriceBps - 300), to6('12'))).wait()
    await (await (exchange.connect(deployer) as typeof exchange).postOffer(mid, 0n, BigInt(yesPriceBps - 600), to6('18'))).wait()
    await (await (exchange.connect(deployer) as typeof exchange).postOffer(mid, 0n, BigInt(yesPriceBps - 1000), to6('25'))).wait()

    // SELL_YES depth (multiple price levels)
    await (await (exchange.connect(deployer) as typeof exchange).postOffer(mid, 2n /* SELL_YES */, BigInt(yesPriceBps + 200), to6('10'))).wait()
    await (await (exchange.connect(deployer) as typeof exchange).postOffer(mid, 2n, BigInt(yesPriceBps + 500), to6('15'))).wait()

    // BUY_NO depth
    await (await (exchange.connect(helper) as typeof exchange).postOffer(mid, 1n /* BUY_NO */, BigInt(noPriceBps - 400), to6('10'))).wait()

    console.log(`   📋 Order book depth posted — ${3} BUY_YES + ${2} SELL_YES + ${1} BUY_NO`)
  }

  const endBnb = await provider.getBalance(deployer.address)
  console.log(`\n✅ Demo seed complete!`)
  console.log(`   Markets seeded: [${DEMO_MARKET_IDS.join(', ')}]`)
  console.log(`   Deployer remaining: ${ethers.formatEther(endBnb)} BNB`)
  console.log('\n📺 Your demo is ready. Show:')
  console.log('   1. /markets  — 30 curated markets with categories + resolve dates')
  console.log('   2. /trade?marketId=0  — live order book, completed trades, BNB explorer links')
  console.log('   3. /trade?marketId=8  — BTC market (crowd-implied ~48% YES)')
  console.log('   4. /analytics  — probability charts + news (company/company)')
  console.log('   5. /admin  — admin console (username/password)')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
