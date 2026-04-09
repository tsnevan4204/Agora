import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployYourContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, read } = hre.deployments;
  const metadataBaseUri =
    process.env.OUTCOME_TOKEN_BASE_URI ||
    (hre.network.name === "hardhat" || hre.network.name === "localhost"
      ? "http://localhost:3000/metadata/{id}.json"
      : "https://agora.example/metadata/{id}.json");

  const forwarder = await deploy("AgoraForwarder", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const usdt = await deploy("MockUSDT", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const factory = await deploy("MarketFactory", {
    from: deployer,
    args: [deployer, usdt.address],
    log: true,
    autoMine: true,
  });

  const token1155 = await deploy("OutcomeToken1155", {
    from: deployer,
    args: [metadataBaseUri, deployer],
    log: true,
    autoMine: true,
  });

  const manager = await deploy("PredictionMarketManager", {
    from: deployer,
    args: [deployer, forwarder.address, usdt.address, factory.address, token1155.address, deployer],
    log: true,
    autoMine: true,
  });

  const exchange = await deploy("Exchange", {
    from: deployer,
    args: [deployer, forwarder.address, usdt.address, token1155.address, manager.address],
    log: true,
    autoMine: true,
  });

  const configuredManager = (await read("OutcomeToken1155", "manager")) as string;
  if (configuredManager === "0x0000000000000000000000000000000000000000") {
    await execute("OutcomeToken1155", { from: deployer, log: true }, "setManager", manager.address);
  }

  const configuredExchange = (await read("OutcomeToken1155", "exchange")) as string;
  if (configuredExchange === "0x0000000000000000000000000000000000000000") {
    await execute("OutcomeToken1155", { from: deployer, log: true }, "setExchange", exchange.address);
  }

  console.log("Deployed forwarder:", forwarder.address);
  console.log("Deployed usdt:", usdt.address);
  console.log("Deployed factory:", factory.address);
  console.log("Deployed token1155:", token1155.address);
  console.log("Deployed manager:", manager.address);
  console.log("Deployed exchange:", exchange.address);
};

export default deployYourContract;
deployYourContract.tags = ["core", "PredictionMarketRefactor"];
