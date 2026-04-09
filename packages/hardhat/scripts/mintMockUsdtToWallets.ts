/**
 * Calls MockUSDT.mint(to, amount) for each test wallet.
 * Mint is permissionless on our mock (anyone can mint); the Hardhat signer only pays tBNB gas.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ethers, network } from "hardhat";

type BurnerRow = { index: number; address: string; privateKey: string };

function burnerWalletsPath(): string {
  const custom = process.env.BURNER_WALLETS_JSON_PATH?.trim();
  if (custom) return resolve(process.cwd(), custom);
  return resolve(__dirname, "../burner-wallets.json");
}

function collectRecipientAddresses(): string[] {
  const recipients: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const addr = process.env[`TEST_WALLET_${i}_ADDRESS`]?.trim();
    if (addr) recipients.push(addr);
  }
  return recipients;
}

/** Use TEST_WALLET_*_ADDRESS env vars, or burner-wallets.json if no env addresses set. */
function resolveRecipients(): string[] {
  const fromEnv = collectRecipientAddresses();
  if (fromEnv.length > 0) return fromEnv;

  const path = burnerWalletsPath();
  if (!existsSync(path)) {
    throw new Error(`No TEST_WALLET_<N>_ADDRESS in .env and missing ${path}. Generate wallets or set env addresses.`);
  }
  const burners = JSON.parse(readFileSync(path, "utf8")) as BurnerRow[];
  if (!Array.isArray(burners) || burners.length === 0) {
    throw new Error("burner-wallets.json must be a non-empty array");
  }
  return burners.map(b => b.address);
}

async function main() {
  const mockUsdtAddress = process.env.MOCK_USDT_ADDRESS?.trim();
  if (!mockUsdtAddress) {
    throw new Error("Missing MOCK_USDT_ADDRESS in .env");
  }
  const amountPerWalletRaw = process.env.MOCK_USDT_MINT_PER_WALLET || "100";
  const amountPerWallet = ethers.parseUnits(amountPerWalletRaw, 6);

  const recipients = resolveRecipients();
  if (recipients.length > 6) {
    throw new Error("Recipient limit exceeded. Max supported wallets is 6.");
  }

  const usdt = await ethers.getContractAt("MockUSDT", mockUsdtAddress);
  console.log(`🌐 Network: ${network.name}`);
  console.log(`🪙 MockUSDT: ${mockUsdtAddress}`);
  console.log(`👥 Recipients: ${recipients.length}`);
  console.log(`💰 Amount per wallet: ${amountPerWalletRaw} mUSDT`);

  for (const recipient of recipients) {
    const tx = await usdt.mint(recipient, amountPerWallet);
    await tx.wait();
    console.log(`✅ Minted to ${recipient}: ${tx.hash}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
