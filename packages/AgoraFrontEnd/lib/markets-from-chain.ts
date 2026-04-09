import type { Abi, Address } from 'viem'

export type DiscoveredMarket = {
  id: number
  question: string
  eventId: bigint
  resolutionSpecURI: string
}

type MarketDataResult = {
  eventId: bigint
  question: string
  resolutionSpecHash: `0x${string}`
  resolutionSpecURI: string
  exists: boolean
}

/** Accepts wagmi `useReadContracts` rows for `getMarketData` (result typed as unknown). */
export function parseMarketsFromMulticall(
  nextMarketId: bigint | undefined,
  rows: readonly { status: string; result?: unknown }[] | undefined,
): DiscoveredMarket[] {
  if (nextMarketId === undefined || rows === undefined || nextMarketId === 0n) {
    return []
  }
  const n = Number(nextMarketId)
  const out: DiscoveredMarket[] = []
  for (let i = 0; i < n; i++) {
    const row = rows[i]
    if (!row || row.status !== 'success' || row.result == null || typeof row.result !== 'object') continue
    const r = row.result as MarketDataResult
    if (!r.exists) continue
    out.push({
      id: i,
      question: r.question,
      eventId: r.eventId,
      resolutionSpecURI: r.resolutionSpecURI,
    })
  }
  return out
}

/** Build multicall contract list for `getMarketData` for ids `0 .. nextMarketId-1`. */
export function factoryMarketReadContracts(
  factoryAddress: Address,
  factoryAbi: Abi,
  nextMarketId: bigint | undefined,
): Array<{
  address: Address
  abi: Abi
  functionName: 'getMarketData'
  args: readonly [bigint]
}> {
  if (nextMarketId === undefined || nextMarketId === 0n) return []
  return Array.from({ length: Number(nextMarketId) }, (_, i) => ({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'getMarketData' as const,
    args: [BigInt(i)] as const,
  }))
}
