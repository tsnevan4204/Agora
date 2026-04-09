import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocolFixture, fastForwardPastClose, toShares } from "./helpers/fixtures";
import { installVerboseHooks, logStep } from "./helpers/log";

describe("Integration Lifecycle", function () {
  installVerboseHooks("Integration");

  // Tests full lifecycle with split, orderbook trading, resolve, and redeem.
  it("runs end-to-end lifecycle for multiple users", async function () {
    const { alice, bob, charlie, resolver, manager, exchange, token1155, usdt } = await deployProtocolFixture();
    const aAmount = toShares("100");
    const bAmount = toShares("50");
    logStep("split alice + bob", { aAmount: aAmount.toString(), bAmount: bAmount.toString() });
    await manager.connect(alice).split(0, aAmount);
    await manager.connect(bob).split(0, bAmount);

    logStep("post SELL, charlie partial fill");
    const sellOffer = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, toShares("40"));
    await exchange.connect(alice).postOffer(0, 2, 6000, toShares("40"));
    await exchange.connect(charlie).fillOffer(sellOffer, toShares("25"));

    logStep("post BUY, bob fills");
    const buyOffer = await exchange.connect(charlie).postOffer.staticCall(0, 1, 3000, toShares("10"));
    await exchange.connect(charlie).postOffer(0, 1, 3000, toShares("10"));
    await exchange.connect(bob).fillOffer(buyOffer, toShares("10"));

    await fastForwardPastClose();
    logStep("resolve YES + charlie redeem");
    await manager.connect(resolver).resolve(0, 0, ethers.keccak256(ethers.toUtf8Bytes("ev")));

    const cBefore = await usdt.balanceOf(charlie.address);
    await manager.connect(charlie).redeem(0);
    const cAfter = await usdt.balanceOf(charlie.address);
    expect(cAfter).to.be.greaterThan(cBefore);

    const yes = await token1155.getYesTokenId(0);
    expect(await token1155.balanceOf(charlie.address, yes)).to.equal(0);
  });

  // Tests that cancelling remains possible after market closes.
  it("allows maker to cancel open offer after close time", async function () {
    const { alice, manager, exchange, token1155 } = await deployProtocolFixture();
    const amount = toShares("8");
    logStep("split alice for cancel-after-close scenario", { amount: amount.toString() });
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    logStep("advance chain past market close");
    await fastForwardPastClose();
    const yes = await token1155.getYesTokenId(0);
    const before = await token1155.balanceOf(alice.address, yes);
    await exchange.connect(alice).cancelOffer(offerId);
    const after = await token1155.balanceOf(alice.address, yes);
    expect(after).to.be.greaterThan(before);
  });

  // Tests high-volume repeated fills to catch arithmetic drift.
  it("handles repeated partial fills across many takers", async function () {
    const { alice, bob, charlie, dave, manager, exchange } = await deployProtocolFixture();
    logStep("alice splits inventory for multi-taker fill stress");
    await manager.connect(alice).split(0, toShares("30"));
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6500, toShares("30"));
    await exchange.connect(alice).postOffer(0, 2, 6500, toShares("30"));

    await exchange.connect(bob).fillOffer(offerId, toShares("7"));
    await exchange.connect(charlie).fillOffer(offerId, toShares("9"));
    logStep("sequential partial fills: bob, charlie, dave");
    await exchange.connect(dave).fillOffer(offerId, toShares("14"));

    const offer = await exchange.offers(offerId);
    expect(offer.remainingAmount).to.equal(0);
    expect(offer.status).to.equal(2);
  });

  // Tests no cross-market leakage by creating and trading a second market.
  it("isolates balances between market IDs", async function () {
    const { factory, alice, bob, manager, exchange, token1155 } = await deployProtocolFixture();
    logStep("create second event + market for isolation check");
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes("spec2"));
    await factory.createEvent("Tesla Q2", "earnings", now + 24 * 60 * 60);
    await factory.createMarket(1, "TSLA Revenue > X?", specHash, "ipfs://spec2");

    await manager.connect(alice).split(0, toShares("5"));
    await manager.connect(bob).split(1, toShares("5"));

    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, toShares("2"));
    await exchange.connect(alice).postOffer(0, 2, 6000, toShares("2"));
    await exchange.connect(bob).fillOffer(offerId, toShares("2"));

    const yes0 = await token1155.getYesTokenId(0);
    const yes1 = await token1155.getYesTokenId(1);
    expect(await token1155.balanceOf(bob.address, yes0)).to.equal(toShares("2"));
    expect(await token1155.balanceOf(bob.address, yes1)).to.equal(toShares("5"));
  });
});
