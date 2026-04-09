import { ethers } from "hardhat";

export const toShares = (value: string) => ethers.parseUnits(value, 6);
export const toUsdt = (value: string) => ethers.parseUnits(value, 6);

export async function deployProtocolFixture() {
  const t0 = Date.now();
  console.log("🔧 [fixture] deployProtocolFixture: deploying full protocol stack…");
  const [owner, resolver, alice, bob, charlie, dave] = await ethers.getSigners();
  const Forwarder = await ethers.getContractFactory("AgoraForwarder");
  const forwarder = await Forwarder.deploy();

  const USDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await USDT.deploy();

  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy(owner.address, await usdt.getAddress());

  const Token1155 = await ethers.getContractFactory("OutcomeToken1155");
  const token1155 = await Token1155.deploy("https://agora.test/{id}.json", owner.address);

  const Manager = await ethers.getContractFactory("PredictionMarketManager");
  const manager = await Manager.deploy(
    owner.address,
    await forwarder.getAddress(),
    await usdt.getAddress(),
    await factory.getAddress(),
    await token1155.getAddress(),
    resolver.address,
  );

  const Exchange = await ethers.getContractFactory("Exchange");
  const exchange = await Exchange.deploy(
    owner.address,
    await forwarder.getAddress(),
    await usdt.getAddress(),
    await token1155.getAddress(),
    await manager.getAddress(),
  );

  await token1155.connect(owner).setManager(await manager.getAddress());
  await token1155.connect(owner).setExchange(await exchange.getAddress());

  const mintAmount = toUsdt("10000");
  for (const user of [alice, bob, charlie, dave]) {
    await usdt.mint(user.address, mintAmount);
    await usdt.connect(user).approve(await manager.getAddress(), ethers.MaxUint256);
    await usdt.connect(user).approve(await exchange.getAddress(), ethers.MaxUint256);
  }

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await factory.createEvent("Apple Q2", "earnings", now + 24 * 60 * 60);
  const specHash = ethers.keccak256(ethers.toUtf8Bytes("spec"));
  await factory.createMarket(0, "AAPL EPS > 1.60?", specHash, "ipfs://spec");

  const ms = Date.now() - t0;
  const managerAddr = await manager.getAddress();
  const exchangeAddr = await exchange.getAddress();
  console.log("🎉 [fixture] deployProtocolFixture: ready", {
    ms,
    manager: managerAddr,
    exchange: exchangeAddr,
    alice: alice.address,
    bob: bob.address,
  });

  return {
    owner,
    resolver,
    alice,
    bob,
    charlie,
    dave,
    usdt,
    factory,
    token1155,
    manager,
    exchange,
  };
}

export async function fastForwardPastClose(seconds = 24 * 60 * 60 + 1) {
  console.log(`⏭️  [fixture] fastForwardPastClose: evm_increaseTime +${seconds}s then mine`);
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
