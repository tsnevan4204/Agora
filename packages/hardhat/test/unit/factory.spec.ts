import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocolFixture } from "./helpers/fixtures";
import { installVerboseHooks, logStep } from "./helpers/log";

describe("MarketFactory", function () {
  installVerboseHooks("Factory");

  // Tests owner-only event creation path.
  it("creates event successfully by owner", async function () {
    const { factory } = await deployProtocolFixture();
    logStep("read getEventData(0)");
    const eventData = await factory.getEventData(0);
    expect(eventData.exists).to.equal(true);
    expect(eventData.title).to.equal("Apple Q2");
  });

  // Tests owner-only authorization for createEvent.
  it("reverts createEvent for non-owner", async function () {
    const { factory, alice } = await deployProtocolFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await expect(factory.connect(alice).createEvent("X", "earnings", now + 3600)).to.be.revertedWithCustomError(
      factory,
      "OwnableUnauthorizedAccount",
    );
  });

  // Tests closeTime validation for createEvent.
  it("reverts createEvent with past close time", async function () {
    const { factory } = await deployProtocolFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await expect(factory.createEvent("Bad", "earnings", now)).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__InvalidCloseTime",
    );
  });

  // Tests title non-empty validation.
  it("reverts createEvent with empty title", async function () {
    const { factory } = await deployProtocolFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await expect(factory.createEvent("", "earnings", now + 3600)).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__EmptyTitle",
    );
  });

  // Tests market creation under a valid event.
  it("creates market under existing event", async function () {
    const { factory } = await deployProtocolFixture();
    const marketData = await factory.getMarketData(0);
    expect(marketData.exists).to.equal(true);
    expect(marketData.eventId).to.equal(0);
  });

  // Tests missing event validation for createMarket.
  it("reverts createMarket for invalid event", async function () {
    const { factory } = await deployProtocolFixture();
    const specHash = ethers.keccak256(ethers.toUtf8Bytes("x"));
    await expect(factory.createMarket(99, "Q?", specHash, "ipfs://x")).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__InvalidEvent",
    );
  });

  // Tests question non-empty validation.
  it("reverts createMarket with empty question", async function () {
    const { factory } = await deployProtocolFixture();
    const specHash = ethers.keccak256(ethers.toUtf8Bytes("x"));
    await expect(factory.createMarket(0, "", specHash, "ipfs://x")).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__EmptyQuestion",
    );
  });

  // Tests resolution hash non-zero validation.
  it("reverts createMarket with empty resolution hash", async function () {
    const { factory } = await deployProtocolFixture();
    await expect(factory.createMarket(0, "Q?", ethers.ZeroHash, "ipfs://x")).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__EmptyResolutionSpecHash",
    );
  });

  // Tests resolution URI non-empty validation.
  it("reverts createMarket with empty resolution URI", async function () {
    const { factory } = await deployProtocolFixture();
    const specHash = ethers.keccak256(ethers.toUtf8Bytes("x"));
    await expect(factory.createMarket(0, "Q?", specHash, "")).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__EmptyResolutionSpecURI",
    );
  });

  // Tests close time lookup for an existing market.
  it("returns market close time for valid market", async function () {
    const { factory } = await deployProtocolFixture();
    const close = await factory.getMarketCloseTime(0);
    expect(close).to.be.greaterThan(0n);
  });

  // Tests close time lookup error for missing market.
  it("reverts getMarketCloseTime for invalid market", async function () {
    const { factory } = await deployProtocolFixture();
    await expect(factory.getMarketCloseTime(999)).to.be.revertedWithCustomError(
      factory,
      "MarketFactory__InvalidMarket",
    );
  });
});
