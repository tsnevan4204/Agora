import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocolFixture, fastForwardPastClose, toShares } from "./helpers/fixtures";
import { installVerboseHooks, logStep } from "./helpers/log";

describe("PredictionMarketManager", function () {
  installVerboseHooks("Manager");

  // Tests constructor wiring for immutable dependencies.
  it("sets constructor dependencies correctly", async function () {
    const { manager, factory, token1155, usdt } = await deployProtocolFixture();
    expect(await manager.factory()).to.equal(await factory.getAddress());
    expect(await manager.outcomeToken()).to.equal(await token1155.getAddress());
    expect(await manager.collateralToken()).to.equal(await usdt.getAddress());
  });

  // Tests split mints YES/NO equally and locks collateral.
  it("splits collateral into paired outcome tokens", async function () {
    const { alice, manager, token1155, usdt } = await deployProtocolFixture();
    const amount = toShares("12.5");
    logStep("split market 0", { amount: amount.toString() });
    const balBefore = await usdt.balanceOf(alice.address);
    await manager.connect(alice).split(0, amount);
    const yes = await token1155.getYesTokenId(0);
    const no = await token1155.getNoTokenId(0);
    expect(await token1155.balanceOf(alice.address, yes)).to.equal(amount);
    expect(await token1155.balanceOf(alice.address, no)).to.equal(amount);
    expect(await usdt.balanceOf(alice.address)).to.equal(balBefore - amount);
  });

  // Tests split reverts for zero amount.
  it("reverts split with zero amount", async function () {
    const { alice, manager } = await deployProtocolFixture();
    await expect(manager.connect(alice).split(0, 0)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__ZeroAmount",
    );
  });

  // Tests split blocked after close time.
  it("reverts split after market close", async function () {
    const { alice, manager } = await deployProtocolFixture();
    await fastForwardPastClose();
    await expect(manager.connect(alice).split(0, 1)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__MarketClosed",
    );
  });

  // Tests merge burns paired balances and returns collateral.
  it("merges paired outcome tokens back to collateral", async function () {
    const { alice, manager, token1155, usdt } = await deployProtocolFixture();
    const amount = toShares("10");
    const mergeAmount = toShares("3.25");
    await manager.connect(alice).split(0, amount);
    const before = await usdt.balanceOf(alice.address);
    await manager.connect(alice).merge(0, mergeAmount);
    const yes = await token1155.getYesTokenId(0);
    const no = await token1155.getNoTokenId(0);
    expect(await token1155.balanceOf(alice.address, yes)).to.equal(amount - mergeAmount);
    expect(await token1155.balanceOf(alice.address, no)).to.equal(amount - mergeAmount);
    expect(await usdt.balanceOf(alice.address)).to.equal(before + mergeAmount);
  });

  // Tests merge reverts when user does not have both token sides.
  it("reverts merge when paired balances are insufficient", async function () {
    const { alice, manager } = await deployProtocolFixture();
    await expect(manager.connect(alice).merge(0, toShares("1"))).to.be.reverted;
  });

  // Tests owner can rotate resolver.
  it("updates resolver by owner", async function () {
    const { owner, alice, manager } = await deployProtocolFixture();
    await manager.connect(owner).setResolver(alice.address);
    expect(await manager.resolver()).to.equal(alice.address);
  });

  // Tests setResolver rejects zero address.
  it("reverts setResolver with zero address", async function () {
    const { manager } = await deployProtocolFixture();
    await expect(manager.setResolver(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__ZeroAddress",
    );
  });

  // Tests only resolver can resolve.
  it("reverts resolve for non-resolver", async function () {
    const { alice, manager } = await deployProtocolFixture();
    const ev = ethers.keccak256(ethers.toUtf8Bytes("e"));
    await expect(manager.connect(alice).resolve(0, 0, ev)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__NotResolver",
    );
  });

  // Tests resolver cannot resolve before close.
  it("reverts resolve before close time", async function () {
    const { resolver, manager } = await deployProtocolFixture();
    const ev = ethers.keccak256(ethers.toUtf8Bytes("e"));
    await expect(manager.connect(resolver).resolve(0, 0, ev)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__MarketClosed",
    );
  });

  // Tests redeem blocked before resolution.
  it("reverts redeem before market resolution", async function () {
    const { alice, manager } = await deployProtocolFixture();
    await expect(manager.connect(alice).redeem(0)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__MarketNotResolved",
    );
  });

  // Tests redeem reverts if user holds no winning shares.
  it("reverts redeem with no winning tokens", async function () {
    const { alice, resolver, manager } = await deployProtocolFixture();
    await manager.connect(alice).split(0, toShares("1"));
    await fastForwardPastClose();
    await manager.connect(resolver).resolve(0, 0, ethers.keccak256(ethers.toUtf8Bytes("ev")));
    await manager.connect(alice).redeem(0);
    await expect(manager.connect(alice).redeem(0)).to.be.revertedWithCustomError(
      manager,
      "PredictionMarketManager__NoWinningTokens",
    );
  });

  // Tests redeem burns winners and pays collateral 1:1 in 6-decimal units.
  it("redeems winning tokens for collateral", async function () {
    const { alice, resolver, manager, token1155, usdt } = await deployProtocolFixture();
    const amount = toShares("7.75");
    await manager.connect(alice).split(0, amount);
    await fastForwardPastClose();
    await manager.connect(resolver).resolve(0, 0, ethers.keccak256(ethers.toUtf8Bytes("ev")));
    const before = await usdt.balanceOf(alice.address);
    await manager.connect(alice).redeem(0);
    const after = await usdt.balanceOf(alice.address);
    const yes = await token1155.getYesTokenId(0);
    expect(after - before).to.equal(amount);
    expect(await token1155.balanceOf(alice.address, yes)).to.equal(0);
  });

  // Tests isMarketOpenForTrading returns false once market is resolved.
  it("returns false for trading-open check after resolution", async function () {
    const { resolver, manager } = await deployProtocolFixture();
    await fastForwardPastClose();
    await manager.connect(resolver).resolve(0, 0, ethers.keccak256(ethers.toUtf8Bytes("ev")));
    expect(await manager.isMarketOpenForTrading(0)).to.equal(false);
  });

  // Tests isMarketOpenForTrading returns false for unknown markets.
  it("returns false for unknown market in trading-open check", async function () {
    const { manager } = await deployProtocolFixture();
    expect(await manager.isMarketOpenForTrading(999)).to.equal(false);
  });
});
