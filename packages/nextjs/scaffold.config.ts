import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  burnerWalletMode: "localNetworksOnly" | "allNetworks" | "disabled";
};

export type ScaffoldConfig = BaseConfig;

function requirePublicEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

const bscTestnetRpc = requirePublicEnv("NEXT_PUBLIC_BSC_TESTNET_RPC_URL");
const bscRpc = process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim();

const rpcOverrides: Record<number, string> = {
  [chains.bscTestnet.id]: bscTestnetRpc,
};
if (bscRpc) {
  rpcOverrides[chains.bsc.id] = bscRpc;
}

const scaffoldConfig = {
  targetNetworks: [chains.bscTestnet, chains.hardhat],
  pollingInterval: 3000,
  rpcOverrides,
  walletConnectProjectId: requirePublicEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID"),
  burnerWalletMode: "localNetworksOnly",
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
