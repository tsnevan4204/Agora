'use client'

import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useMemo, useState } from 'react'
import { http } from 'viem'
import { WagmiProvider, createConfig } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { publicRpcUrl, walletConnectProjectId } from '@/lib/env'

function buildConfig() {
  const transport = http(publicRpcUrl ?? bscTestnet.rpcUrls.default.http[0])
  if (walletConnectProjectId) {
    return getDefaultConfig({
      appName: 'Agora',
      projectId: walletConnectProjectId,
      chains: [bscTestnet],
      ssr: true,
      transports: { [bscTestnet.id]: transport },
    })
  }
  return createConfig({
    chains: [bscTestnet],
    connectors: [injected({ shimDisconnect: true })],
    transports: { [bscTestnet.id]: transport },
    ssr: true,
  })
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const config = useMemo(() => buildConfig(), [])
  const rainbowKit = Boolean(walletConnectProjectId)
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {rainbowKit ? <RainbowKitProvider>{children}</RainbowKitProvider> : children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
