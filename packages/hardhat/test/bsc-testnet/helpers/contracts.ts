import { ethers } from "hardhat";
import { requireEnv } from "./env";

export async function getDeployedProtocol() {
  const mockUsdtAddress = requireEnv("MOCK_USDT_ADDRESS");
  const managerAddress = requireEnv("MANAGER_ADDRESS");
  const exchangeAddress = requireEnv("EXCHANGE_ADDRESS");

  const usdt = await ethers.getContractAt("MockUSDT", mockUsdtAddress);
  const manager = await ethers.getContractAt("PredictionMarketManager", managerAddress);
  const exchange = await ethers.getContractAt("Exchange", exchangeAddress);
  const outcomeTokenAddress = await manager.outcomeToken();
  const token1155 = await ethers.getContractAt("OutcomeToken1155", outcomeTokenAddress);

  return {
    usdt,
    manager,
    exchange,
    token1155,
    mockUsdtAddress,
    managerAddress,
    exchangeAddress,
  };
}

/** Default on-chain market used by deployed seed / scenarios. */
export function defaultMarketId(): bigint {
  const raw = process.env.TESTNET_MARKET_ID?.trim();
  if (!raw) return 0n;
  return BigInt(raw);
}
