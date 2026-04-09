import { expect } from "chai";
import { ethers, network } from "hardhat";
import { getSixRecipientAddresses } from "./helpers/wallets";
import { normalizePrivateKey, requireEnv } from "./helpers/env";

/**
 * Runs first (file name 00-…): ensures TEST_WALLET_1..6 each hold ≥ 100 mUSDT on BSC testnet.
 * Uses permissionless MockUSDT.mint; RELAYER_PRIVATE_KEY only pays gas.
 * RPC comes from Hardhat `bscTestnet` → env BSC_TESTNET_RPC_URL.
 */
describe("BSC testnet — 00 preflight: mUSDT ≥ 100 per wallet", function () {
  before(function () {
    if (network.name !== "bscTestnet") {
      this.skip();
    }
    this.timeout(300_000);
  });

  it("tops up each of the six TEST_WALLET_* addresses to at least 100 mUSDT", async function () {
    const mockAddr = requireEnv("MOCK_USDT_ADDRESS");
    const relayerPk = normalizePrivateKey(requireEnv("RELAYER_PRIVATE_KEY"));
    const recipients = getSixRecipientAddresses();

    const target = ethers.parseUnits("100", 6);
    const usdt = await ethers.getContractAt("MockUSDT", mockAddr);
    const signer = new ethers.Wallet(relayerPk, ethers.provider);
    const mintable = usdt.connect(signer);

    console.log(`🌐 ${network.name} | MockUSDT ${mockAddr} | gas payer ${signer.address}`);

    for (let i = 0; i < recipients.length; i++) {
      const addr = recipients[i];
      const before = await usdt.balanceOf(addr);
      if (before < target) {
        const delta = target - before;
        const tx = await mintable.mint(addr, delta);
        await tx.wait();
        console.log(`✅ wallet ${i + 1} mint +${ethers.formatUnits(delta, 6)} mUSDT → ${addr} (${tx.hash})`);
      } else {
        console.log(`⏭️  wallet ${i + 1} already ≥ 100 mUSDT (${ethers.formatUnits(before, 6)})`);
      }
      const after = await usdt.balanceOf(addr);
      expect(after).to.be.gte(target, `wallet ${i + 1} ${addr}`);
    }
  });
});
