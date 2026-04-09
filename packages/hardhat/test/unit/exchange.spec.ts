import { expect } from "chai";
import { deployProtocolFixture, fastForwardPastClose, toShares } from "./helpers/fixtures";
import { installVerboseHooks, logStep } from "./helpers/log";

describe("Exchange", function () {
  installVerboseHooks("Exchange");

  // Tests posting SELL offer escrows token inventory.
  it("posts SELL_YES offer and escrows YES tokens", async function () {
    const { alice, manager, exchange, token1155 } = await deployProtocolFixture();
    const amount = toShares("5");
    await manager.connect(alice).split(0, amount);
    logStep("postOffer SELL_YES", { marketId: 0, price: 6500, amount: amount.toString() });
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6500, amount);
    await exchange.connect(alice).postOffer(0, 2, 6500, amount);
    const yes = await token1155.getYesTokenId(0);
    expect((await exchange.offers(offerId)).remainingAmount).to.equal(amount);
    expect(await token1155.balanceOf(await exchange.getAddress(), yes)).to.equal(amount);
  });

  // Tests posting BUY offer escrows collateral.
  it("posts BUY_YES offer and escrows collateral", async function () {
    const { bob, exchange, usdt } = await deployProtocolFixture();
    const amount = toShares("4");
    const price = 5500n;
    const expectedEscrow = (amount * price) / 10000n;
    const before = await usdt.balanceOf(await exchange.getAddress());
    await exchange.connect(bob).postOffer(0, 0, price, amount);
    const after = await usdt.balanceOf(await exchange.getAddress());
    expect(after - before).to.equal(expectedEscrow);
  });

  // Tests invalid price guard for zero.
  it("reverts postOffer with zero price", async function () {
    const { alice, exchange } = await deployProtocolFixture();
    await expect(exchange.connect(alice).postOffer(0, 0, 0, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__InvalidPrice",
    );
  });

  // Tests invalid price guard for values above 10000 bps.
  it("reverts postOffer with out-of-range price", async function () {
    const { alice, exchange } = await deployProtocolFixture();
    await expect(exchange.connect(alice).postOffer(0, 0, 10001, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__InvalidPrice",
    );
  });

  // Tests invalid amount guard for too-small offer.
  it("reverts postOffer with zero amount", async function () {
    const { alice, exchange } = await deployProtocolFixture();
    await expect(exchange.connect(alice).postOffer(0, 0, 6000, 0)).to.be.revertedWithCustomError(
      exchange,
      "Exchange__InvalidAmount",
    );
  });

  // Tests zero-quote dust guard on tiny buy amount.
  it("reverts postOffer when quote rounds to zero", async function () {
    const { alice, exchange } = await deployProtocolFixture();
    await expect(exchange.connect(alice).postOffer(0, 0, 1, 1)).to.be.revertedWithCustomError(
      exchange,
      "Exchange__QuoteTooSmall",
    );
  });

  // Tests fill partially updates remaining amount.
  it("partially fills SELL offer and updates remaining", async function () {
    const { alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("9");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await exchange.connect(bob).fillOffer(offerId, toShares("4"));
    expect((await exchange.offers(offerId)).remainingAmount).to.equal(toShares("5"));
  });

  // Tests final fill marks offer as Filled status.
  it("marks offer as filled when remaining reaches zero", async function () {
    const { alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("3");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await exchange.connect(bob).fillOffer(offerId, amount);
    expect((await exchange.offers(offerId)).status).to.equal(2);
  });

  // Tests self-trading prevention.
  it("reverts self-fill by maker", async function () {
    const { alice, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("2");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await expect(exchange.connect(alice).fillOffer(offerId, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__SelfFillNotAllowed",
    );
  });

  // Tests invalid offer guard on missing ID.
  it("reverts fillOffer for missing offer", async function () {
    const { bob, exchange } = await deployProtocolFixture();
    await expect(exchange.connect(bob).fillOffer(999, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__InvalidOffer",
    );
  });

  // Tests fill amount bounds validation.
  it("reverts fillOffer when fill amount exceeds remaining", async function () {
    const { alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("2");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await expect(exchange.connect(bob).fillOffer(offerId, toShares("3"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__InvalidAmount",
    );
  });

  // Tests maker-only cancellation.
  it("reverts cancelOffer for non-maker", async function () {
    const { alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("2");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await expect(exchange.connect(bob).cancelOffer(offerId)).to.be.revertedWithCustomError(
      exchange,
      "Exchange__NotMaker",
    );
  });

  // Tests cancellation refunds escrow and marks status.
  it("cancels active offer and refunds escrowed assets", async function () {
    const { alice, manager, exchange, token1155 } = await deployProtocolFixture();
    const amount = toShares("2.5");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    const yes = await token1155.getYesTokenId(0);
    const before = await token1155.balanceOf(alice.address, yes);
    await exchange.connect(alice).cancelOffer(offerId);
    const after = await token1155.balanceOf(alice.address, yes);
    expect(after - before).to.equal(amount);
    expect((await exchange.offers(offerId)).status).to.equal(1);
  });

  // Tests posting pause blocks new offers.
  it("blocks postOffer while posting is paused", async function () {
    const { owner, alice, exchange } = await deployProtocolFixture();
    await exchange.connect(owner).setPostingPaused(true);
    await expect(exchange.connect(alice).postOffer(0, 0, 6000, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__PostingPaused",
    );
  });

  // Tests filling pause blocks fills.
  it("blocks fillOffer while filling is paused", async function () {
    const { owner, alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("1");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await exchange.connect(owner).setFillingPaused(true);
    await expect(exchange.connect(bob).fillOffer(offerId, amount)).to.be.revertedWithCustomError(
      exchange,
      "Exchange__FillingPaused",
    );
  });

  // Tests quote helper mirrors fill pricing math.
  it("returns expected quote from quoteFill", async function () {
    const { alice, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("3");
    const fillAmount = toShares("1.25");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6200, amount);
    await exchange.connect(alice).postOffer(0, 2, 6200, amount);
    const quoted = await exchange.quoteFill(offerId, fillAmount);
    expect(quoted).to.equal((fillAmount * 6200n) / 10000n);
  });

  // Tests posting/filling blocked after market close.
  it("reverts postOffer and fillOffer after close time", async function () {
    const { alice, bob, manager, exchange } = await deployProtocolFixture();
    const amount = toShares("2");
    await manager.connect(alice).split(0, amount);
    const offerId = await exchange.connect(alice).postOffer.staticCall(0, 2, 6000, amount);
    await exchange.connect(alice).postOffer(0, 2, 6000, amount);
    await fastForwardPastClose();
    await expect(exchange.connect(alice).postOffer(0, 2, 6000, amount)).to.be.revertedWithCustomError(
      exchange,
      "Exchange__MarketClosed",
    );
    await expect(exchange.connect(bob).fillOffer(offerId, toShares("1"))).to.be.revertedWithCustomError(
      exchange,
      "Exchange__MarketClosed",
    );
  });
});
