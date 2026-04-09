import { bscTestnet } from 'wagmi/chains'

/** BNB Smart Chain testnet block explorer (chain 97). */
export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const h = txHash.startsWith('0x') ? txHash : `0x${txHash}`
  if (chainId === bscTestnet.id) {
    return `https://testnet.bscscan.com/tx/${h}`
  }
  return null
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  if (chainId === bscTestnet.id) {
    return `https://testnet.bscscan.com/address/${address}`
  }
  return null
}
