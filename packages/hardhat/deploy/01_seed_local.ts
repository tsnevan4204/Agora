import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const seedLocal: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { execute, read } = hre.deployments;

  const mintAmount = ethers.parseUnits("1000000", 6);
  await execute("MockUSDT", { from: deployer, log: true }, "mint", deployer, mintAmount);

  const existingMarketCount = (await read("MarketFactory", "nextMarketId")) as bigint;
  if (existingMarketCount > 0n) {
    return;
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  const oneWeek = 7 * 24 * 60 * 60;
  const closeTime = Number(latestBlock!.timestamp) + oneWeek;
  const eventTx = await execute(
    "MarketFactory",
    { from: deployer, log: true },
    "createEvent",
    "Apple Q2 Earnings",
    "earnings",
    closeTime,
  );
  console.log("Seed event tx:", eventTx.transactionHash);

  const specHash = ethers.keccak256(ethers.toUtf8Bytes(`{"ticker":"AAPL","metric":"eps","threshold":"1.60"}`));
  const marketTx = await execute(
    "MarketFactory",
    { from: deployer, log: true },
    "createMarket",
    0,
    "AAPL EPS > 1.60?",
    specHash,
    "ipfs://resolution-spec/0",
  );
  console.log("Seed market tx:", marketTx.transactionHash);
};

export default seedLocal;
seedLocal.tags = ["seed"];
seedLocal.dependencies = ["core"];
