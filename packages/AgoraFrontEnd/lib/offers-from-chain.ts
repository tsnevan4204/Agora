import type { Abi, Address } from 'viem'

const SIDE_LABELS = ['BUY_YES', 'BUY_NO', 'SELL_YES', 'SELL_NO'] as const
const STATUS_LABELS = ['Active', 'Cancelled', 'Filled'] as const

export type ParsedOnchainOffer = {
  offerId: number
  maker: string
  marketId: bigint
  side: number
  sideLabel: string
  priceBps: bigint
  initialAmount: bigint
  remainingAmount: bigint
  status: number
  statusLabel: string
}

export function sideLabel(side: number): string {
  return SIDE_LABELS[side] ?? `SIDE_${side}`
}

export function offerStatusLabel(status: number): string {
  return STATUS_LABELS[status] ?? `STATUS_${status}`
}

/** Build readContract list for `offers(uint256)` for ids in [startId, endId). */
export function exchangeOfferReadContracts(
  exchangeAddress: Address,
  exchangeAbi: Abi,
  startId: bigint,
  endId: bigint,
): Array<{
  address: Address
  abi: Abi
  functionName: 'offers'
  args: readonly [bigint]
}> {
  if (endId <= startId) return []
  const out: Array<{
    address: Address
    abi: Abi
    functionName: 'offers'
    args: readonly [bigint]
  }> = []
  for (let i = startId; i < endId; i++) {
    out.push({
      address: exchangeAddress,
      abi: exchangeAbi,
      functionName: 'offers',
      args: [i],
    })
  }
  return out
}

export function parseOfferReadResults(
  startOfferId: bigint,
  rows: readonly { status: string; result?: unknown }[] | undefined,
  filterMarketId: bigint,
): ParsedOnchainOffer[] {
  if (rows === undefined) return []
  const out: ParsedOnchainOffer[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.status !== 'success' || row.result == null || typeof row.result !== 'object') continue
    const r = row.result as {
      maker: string
      marketId: bigint
      side: number | bigint
      price: bigint
      initialAmount: bigint
      remainingAmount: bigint
      status: number | bigint
    }
    if (r.maker === '0x0000000000000000000000000000000000000000') continue
    if (r.marketId !== filterMarketId) continue
    const st = Number(r.status)
    if (st !== 0) continue
    const sideN = Number(r.side)
    const offerId = Number(startOfferId) + i
    out.push({
      offerId,
      maker: r.maker,
      marketId: r.marketId,
      side: sideN,
      sideLabel: sideLabel(sideN),
      priceBps: r.price,
      initialAmount: r.initialAmount,
      remainingAmount: r.remainingAmount,
      status: st,
      statusLabel: offerStatusLabel(st),
    })
  }
  return out
}
