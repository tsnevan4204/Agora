"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { BugAntIcon, ChartBarSquareIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5 max-w-4xl w-full">
          <h1 className="text-center">
            <span className="block text-2xl mb-2 text-base-content/80">Agora</span>
            <span className="block text-4xl font-bold">Finance-focused prediction markets</span>
            <span className="block text-lg mt-3 text-base-content/70">
              On <strong>BNB Smart Chain</strong> — crowd-implied probabilities as an alternative signal for traders and
              researchers.
            </span>
          </h1>

          <div className="flex justify-center items-center space-x-2 flex-col mt-8">
            <p className="my-2 font-medium">Connected address</p>
            <Address
              address={connectedAddress}
              chain={targetNetwork}
              blockExplorerAddressLink={
                targetNetwork.id === hardhat.id ? `/blockexplorer/address/${connectedAddress}` : undefined
              }
            />
          </div>

          <div className="mt-10 rounded-2xl border border-base-300 bg-base-200/40 p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="shrink-0 p-4 rounded-xl bg-primary/10 text-primary">
                <ChartBarSquareIcon className="h-14 w-14" aria-hidden />
              </div>
              <div className="space-y-4 text-left">
                <h2 className="text-2xl font-bold">Built on Speedrun Ethereum scaffolding</h2>
                <p className="text-base-content/80 leading-relaxed">
                  This repo follows the{" "}
                  <a
                    href="https://speedrunethereum.com/challenge/prediction-markets"
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary"
                  >
                    Prediction Markets
                  </a>{" "}
                  challenge as a starting scaffold, now refactored into a finance-focused architecture using ERC1155
                  outcome tokens, USDT collateral, a central manager, and an on-chain order book exchange.
                </p>
                <p className="text-base-content/80 leading-relaxed">
                  Proposal intake and resolution operations run through the backend/admin workflow, while user trading
                  and position management run on BNB Smart Chain.
                </p>
                <p className="text-sm text-base-content/60">
                  Submit tutorial progress on{" "}
                  <a href="https://speedrunethereum.com/" target="_blank" rel="noreferrer" className="link">
                    SpeedRunEthereum.com
                  </a>{" "}
                  when required; hackathon proof of deployment targets BNB Chain (see <code>HACKATHON_VISION.md</code>).
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <ChartBarSquareIcon className="h-8 w-8 fill-secondary" />
              <p>
                Submit event ideas from the{" "}
                <Link href="/propose" passHref className="link">
                  Proposal Form
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <BugAntIcon className="h-8 w-8 fill-secondary" />
              <p>
                Tinker with your smart contract using the{" "}
                <Link href="/debug" passHref className="link">
                  Debug Contracts
                </Link>{" "}
                tab.
              </p>
            </div>
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <MagnifyingGlassIcon className="h-8 w-8 fill-secondary" />
              <p>
                Review pending resolutions in{" "}
                <Link href="/admin" passHref className="link">
                  Admin Dashboard
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
