import { bsc, bscTestnet } from 'wagmi/chains'

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const h = txHash.startsWith('0x') ? txHash : `0x${txHash}`
  if (chainId === bsc.id) {
    return `https://bscscan.com/tx/${h}`
  }
  if (chainId === bscTestnet.id) {
    return `https://testnet.bscscan.com/tx/${h}`
  }
  return null
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  if (chainId === bsc.id) {
    return `https://bscscan.com/address/${address}`
  }
  if (chainId === bscTestnet.id) {
    return `https://testnet.bscscan.com/address/${address}`
  }
  return null
}
