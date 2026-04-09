'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatUnits, maxUint256, parseAbi } from 'viem'
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { factoryMarketReadContracts, parseMarketsFromMulticall } from '@/lib/markets-from-chain'
import { exchangeOfferReadContracts, parseOfferReadResults } from '@/lib/offers-from-chain'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/explorer'
import { backendBaseUrl, fetchBackendHealth, fetchOrders, postOffchainOrder, type OffchainOrder } from '@/lib/agora-api'
import { walletConnectProjectId } from '@/lib/env'
import { mustGetContract } from '@/lib/contracts'
import {
  encodeCancelOffer,
  encodeFillOffer,
  encodeMerge,
  encodePostOffer,
  encodeRedeem,
  encodeSplit,
  relayForward,
  shareUnits,
} from '@/lib/relay'

const OFFER_SCAN_WINDOW = 80n

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
])

export function TradeApp() {
  const { address, isConnected, status: connStatus } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending: isConnectPending, variables: connectVars } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()

  const injectedConnector = connectors.find((c) => c.id === 'injected')
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, isPending: isWritePending, data: txHash } = useWriteContract()

  const [health, setHealth] = useState<string>('…')
  const [ordersReachable, setOrdersReachable] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [lastRelayTx, setLastRelayTx] = useState<string | null>(null)
  const [orders, setOrders] = useState<OffchainOrder[]>([])
  const [splitAmt, setSplitAmt] = useState('1')
  const [offerPrice, setOfferPrice] = useState('6000')
  const [offerSize, setOfferSize] = useState('10')
  const [fillOfferId, setFillOfferId] = useState('1')
  const [fillAmt, setFillAmt] = useState('5')
  const [cancelId, setCancelId] = useState('')
  const [marketId, setMarketId] = useState(0)

  const contracts = useMemo(() => {
    try {
      if (chainId !== bscTestnet.id) return null
      return {
        forwarder: mustGetContract(chainId, 'AgoraForwarder'),
        manager: mustGetContract(chainId, 'PredictionMarketManager'),
        exchange: mustGetContract(chainId, 'Exchange'),
        usdt: mustGetContract(chainId, 'MockUSDT'),
        token: mustGetContract(chainId, 'OutcomeToken1155'),
        factory: mustGetContract(chainId, 'MarketFactory'),
      }
    } catch {
      return null
    }
  }, [chainId])

  const { data: nextMarketId } = useReadContract({
    address: contracts?.factory.address,
    abi: contracts?.factory.abi,
    functionName: 'nextMarketId',
    query: { enabled: Boolean(contracts?.factory) },
  })

  const marketReadContracts = useMemo(
    () =>
      contracts?.factory && typeof nextMarketId === 'bigint'
        ? factoryMarketReadContracts(contracts.factory.address, contracts.factory.abi, nextMarketId)
        : [],
    [contracts?.factory, nextMarketId],
  )

  const { data: marketRows, isPending: marketsPending } = useReadContracts({
    contracts: marketReadContracts,
    query: { enabled: marketReadContracts.length > 0 },
  })

  const discoveredMarkets = useMemo(
    () => parseMarketsFromMulticall(typeof nextMarketId === 'bigint' ? nextMarketId : undefined, marketRows),
    [nextMarketId, marketRows],
  )

  useEffect(() => {
    if (discoveredMarkets.length === 0) return
    const ids = new Set(discoveredMarkets.map((m) => m.id))
    if (!ids.has(marketId)) {
      setMarketId(discoveredMarkets[0].id)
    }
  }, [discoveredMarkets, marketId])

  const marketIdBn = BigInt(marketId)

  const refreshApi = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const h = await fetchBackendHealth()
      if (h?.ok) {
        setHealth(h.storage ? `ok · ${h.storage}` : 'ok')
      } else {
        setHealth('unreachable')
      }
      const o = await fetchOrders(marketId)
      setOrders(o.orders)
      setOrdersReachable(o.ok)
    } finally {
      setOrdersLoading(false)
    }
  }, [marketId])

  useEffect(() => {
    void refreshApi()
    const t = setInterval(() => void refreshApi(), 15_000)
    return () => clearInterval(t)
  }, [refreshApi])

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: usdtBal } = useReadContract({
    address: contracts?.usdt.address,
    abi: contracts?.usdt.abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(contracts && address) },
  })

  const { data: allowanceMgr } = useReadContract({
    address: contracts?.usdt.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && contracts ? [address, contracts.manager.address] : undefined,
    query: { enabled: Boolean(contracts && address) },
  })

  const { data: allowanceEx } = useReadContract({
    address: contracts?.usdt.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && contracts ? [address, contracts.exchange.address] : undefined,
    query: { enabled: Boolean(contracts && address) },
  })

  const { data: yesTokenId } = useReadContract({
    address: contracts?.token.address,
    abi: contracts?.token.abi,
    functionName: 'getYesTokenId',
    args: [marketIdBn],
    query: { enabled: Boolean(contracts) },
  })

  const { data: noTokenId } = useReadContract({
    address: contracts?.token.address,
    abi: contracts?.token.abi,
    functionName: 'getNoTokenId',
    args: [marketIdBn],
    query: { enabled: Boolean(contracts) },
  })

  const { data: yesBal } = useReadContract({
    address: contracts?.token.address,
    abi: contracts?.token.abi,
    functionName: 'balanceOf',
    args: address && yesTokenId !== undefined ? [address, yesTokenId] : undefined,
    query: { enabled: Boolean(contracts && address && yesTokenId !== undefined) },
  })

  const { data: noBal } = useReadContract({
    address: contracts?.token.address,
    abi: contracts?.token.abi,
    functionName: 'balanceOf',
    args: address && noTokenId !== undefined ? [address, noTokenId] : undefined,
    query: { enabled: Boolean(contracts && address && noTokenId !== undefined) },
  })

  const { data: nextOfferId } = useReadContract({
    address: contracts?.exchange.address,
    abi: contracts?.exchange.abi,
    functionName: 'nextOfferId',
    query: { enabled: Boolean(contracts) },
  })

  const offerStartId = useMemo(() => {
    if (typeof nextOfferId !== 'bigint' || nextOfferId === 0n) return 0n
    return nextOfferId > OFFER_SCAN_WINDOW ? nextOfferId - OFFER_SCAN_WINDOW : 0n
  }, [nextOfferId])

  const offerReadContracts = useMemo(
    () =>
      contracts?.exchange && typeof nextOfferId === 'bigint' && nextOfferId > 0n
        ? exchangeOfferReadContracts(
            contracts.exchange.address,
            contracts.exchange.abi,
            offerStartId,
            nextOfferId,
          )
        : [],
    [contracts?.exchange, offerStartId, nextOfferId],
  )

  const { data: offerRows, isPending: offersScanPending } = useReadContracts({
    contracts: offerReadContracts,
    query: { enabled: offerReadContracts.length > 0 },
  })

  const onchainOffers = useMemo(
    () => parseOfferReadResults(offerStartId, offerRows, marketIdBn),
    [offerStartId, offerRows, marketIdBn],
  )

  const ensureBsc = async () => {
    if (chainId !== bscTestnet.id) {
      await switchChainAsync?.({ chainId: bscTestnet.id })
    }
  }

  const approveUsdt = async (spender: `0x${string}`) => {
    if (!contracts || !address) return
    await ensureBsc()
    await writeContractAsync({
      address: contracts.usdt.address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, maxUint256],
    })
    toast.success('Approve submitted')
  }

  const runRelay = async (label: string, target: `0x${string}`, data: `0x${string}`) => {
    if (!contracts || !address || !walletClient || !publicClient) {
      toast.error('Connect wallet first')
      return
    }
    await ensureBsc()
    const res = await relayForward({
      walletClient,
      publicClient,
      chainId: bscTestnet.id,
      userAddress: address,
      forwarder: contracts.forwarder.address,
      forwarderAbi: contracts.forwarder.abi,
      target,
      data,
    })
    if (res.ok && res.txHash) {
      setLastRelayTx(res.txHash)
      toast.success(`${label} relayed`, { description: res.txHash })
    } else if (res.ok) {
      toast.success(`${label} relayed`)
    } else toast.error(`${label} failed`, { description: res.reason })
  }

  const onSplit = async () => {
    if (!contracts) return
    const amt = shareUnits(splitAmt)
    const data = encodeSplit(contracts.manager.abi, marketIdBn, amt)
    await runRelay('split', contracts.manager.address, data)
  }

  const onMerge = async () => {
    if (!contracts) return
    const amt = shareUnits(splitAmt)
    const data = encodeMerge(contracts.manager.abi, marketIdBn, amt)
    await runRelay('merge', contracts.manager.address, data)
  }

  const onRedeem = async () => {
    if (!contracts) return
    const data = encodeRedeem(contracts.manager.abi, marketIdBn)
    await runRelay('redeem', contracts.manager.address, data)
  }

  const onPostSellYes = async () => {
    if (!contracts) return
    const price = BigInt(offerPrice)
    const amt = shareUnits(offerSize)
    const data = encodePostOffer(contracts.exchange.abi, marketIdBn, 2, price, amt)
    await runRelay('postOffer SELL_YES', contracts.exchange.address, data)
  }

  const onFill = async () => {
    if (!contracts) return
    const id = BigInt(fillOfferId)
    const amt = shareUnits(fillAmt)
    const data = encodeFillOffer(contracts.exchange.abi, id, amt)
    await runRelay('fillOffer', contracts.exchange.address, data)
  }

  const onCancel = async () => {
    if (!contracts || !cancelId) return
    const data = encodeCancelOffer(contracts.exchange.abi, BigInt(cancelId))
    await runRelay('cancelOffer', contracts.exchange.address, data)
  }

  const onMirrorOrderbook = async () => {
    if (!address) {
      toast.error('Connect wallet')
      return
    }
    const order: OffchainOrder = {
      orderId: `web-${Date.now()}`,
      marketId,
      maker: address,
      side: 'SELL_YES',
      priceBps: Number(offerPrice) || 6000,
      amount: Math.round(Number(offerSize) * 10 ** 6),
      status: 'open',
    }
    const r = await postOffchainOrder(order)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Off-chain order saved')
      void refreshApi()
    }
  }

  const wrongChain = isConnected && chainId !== bscTestnet.id

  const approveTxUrl = txHash ? explorerTxUrl(bscTestnet.id, txHash) : null
  const relayTxUrl = lastRelayTx ? explorerTxUrl(bscTestnet.id, lastRelayTx) : null

  return (
    <div className="container mx-auto px-6 py-28 max-w-3xl space-y-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-bold">Trade</h1>
          <p className="text-sm text-muted-foreground mt-1">
            BNB Smart Chain testnet (chain {bscTestnet.id}) · market #{marketId} · API {health}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all">{backendBaseUrl}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin">Admin</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>

      {health === 'unreachable' && (
        <Alert variant="destructive">
          <AlertTitle>Backend unreachable</AlertTitle>
          <AlertDescription>
            Is the FastAPI server running and <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_BACKEND_URL</code>{' '}
            correct? Order mirror and health checks will fail until the API is up.
          </AlertDescription>
        </Alert>
      )}

      {health.startsWith('ok') && !ordersReachable && (
        <Alert variant="destructive">
          <AlertTitle>Orders API error</AlertTitle>
          <AlertDescription>
            Health succeeded but <code className="text-xs bg-muted px-1 rounded">GET /orders/{marketId}</code> failed — check
            CORS, storage (GCS/local), and server logs.
          </AlertDescription>
        </Alert>
      )}

      {wrongChain && (
        <Alert>
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              This app is configured for <strong>BNB Smart Chain testnet</strong> (chain id {bscTestnet.id}). Switch your
              wallet to match contract ABIs from <code className="text-xs bg-muted px-1 rounded">deployedContracts.ts</code>.
            </p>
            <Button size="sm" onClick={() => switchChainAsync?.({ chainId: bscTestnet.id })}>
              Switch network
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!contracts && (
        <p className="text-destructive text-sm">
          No contract bundle for this chain (deployed ABIs are keyed to chain 97). Switch to BNB testnet or re-run{' '}
          <code className="text-xs bg-muted px-1 rounded">hardhat deploy --tags sync-frontend</code>.
        </p>
      )}

      {contracts && (
        <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
          <h2 className="font-semibold">Market (from MarketFactory)</h2>
          {typeof nextMarketId === 'bigint' && nextMarketId === 0n && (
            <p className="text-sm text-muted-foreground">
              No markets deployed on this factory yet. Use a seed deploy or admin <code className="text-xs bg-muted px-1 rounded">createMarket</code>.
            </p>
          )}
          {typeof nextMarketId === 'bigint' && nextMarketId > 0n && marketsPending && (
            <p className="text-sm text-muted-foreground">Loading market metadata…</p>
          )}
          {discoveredMarkets.length > 0 && (
            <div className="space-y-2 max-w-xl">
              <Label htmlFor="market-select">Active markets</Label>
              <Select value={String(marketId)} onValueChange={(v) => setMarketId(Number(v))}>
                <SelectTrigger id="market-select" className="w-full">
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent>
                  {discoveredMarkets.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      #{m.id} — {m.question.length > 96 ? `${m.question.slice(0, 96)}…` : m.question}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Event #{discoveredMarkets.find((x) => x.id === marketId)?.eventId.toString() ?? '—'}
              </p>
            </div>
          )}
          {typeof nextMarketId === 'bigint' && nextMarketId > 0n && !marketsPending && discoveredMarkets.length === 0 && (
            <div className="space-y-2 max-w-xs">
              <p className="text-sm text-destructive">
                Could not read market metadata via multicall. You can still enter a market id manually.
              </p>
              <Label htmlFor="mid">Market id</Label>
              <Input
                id="mid"
                type="number"
                min={0}
                max={Number(nextMarketId) - 1}
                value={marketId}
                onChange={(e) => setMarketId(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <h2 className="font-semibold">Wallet</h2>
        <p className="text-sm text-muted-foreground">Status: {connStatus}</p>
        {walletConnectProjectId ? (
          <div className="flex flex-wrap items-center gap-3">
            <ConnectButton chainStatus="full" showBalance={false} />
          </div>
        ) : (
          <>
            {!isConnected && (
              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                <Button
                  disabled={isConnectPending || !injectedConnector}
                  onClick={() => injectedConnector && connect({ connector: injectedConnector })}
                >
                  {isConnectPending && connectVars?.connector === injectedConnector ? 'Connecting…' : 'Browser wallet'}
                </Button>
              </div>
            )}
            {!walletConnectProjectId && !isConnected && (
              <p className="text-xs text-muted-foreground">
                Set <code className="bg-muted px-1 rounded">NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID</code> for RainbowKit +
                WalletConnect + browser wallets.
              </p>
            )}
            {isConnected && (
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            )}
          </>
        )}
        {isConnected && address && (
          <p className="text-xs font-mono break-all">
            {address} · USDT{' '}
            {typeof usdtBal === 'bigint' ? formatUnits(usdtBal, 6) : '…'}
          </p>
        )}
        {typeof yesBal === 'bigint' && typeof noBal === 'bigint' && (
          <p className="text-sm text-muted-foreground">
            YES balance {formatUnits(yesBal, 6)} · NO balance {formatUnits(noBal, 6)}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <h2 className="font-semibold">USDT approvals (direct tx, needs BNB for gas)</h2>
        <p className="text-xs text-muted-foreground">
          Manager allowance: {typeof allowanceMgr === 'bigint' && allowanceMgr > 0n ? 'set' : 'none'} · Exchange:{' '}
          {typeof allowanceEx === 'bigint' && allowanceEx > 0n ? 'set' : 'none'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!contracts || !isConnected || isWritePending || isConfirming}
            onClick={() => contracts && approveUsdt(contracts.manager.address)}
          >
            Approve USDT → Manager
          </Button>
          <Button
            disabled={!contracts || !isConnected || isWritePending || isConfirming}
            variant="secondary"
            onClick={() => contracts && approveUsdt(contracts.exchange.address)}
          >
            Approve USDT → Exchange
          </Button>
        </div>
        {(isWritePending || isConfirming) && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for wallet / confirmation…
          </p>
        )}
        {approveTxUrl && (
          <a href={approveTxUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">
            Latest approve tx on BscScan
          </a>
        )}
      </section>

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <h2 className="font-semibold">Gasless via relayer (POST /relay/forward)</h2>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="split">Split / merge amount (USDT, 6 decimals)</Label>
            <Input id="split" value={splitAmt} onChange={(e) => setSplitAmt(e.target.value)} className="mt-1" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!contracts || !walletClient} onClick={() => void onSplit()}>
              Split
            </Button>
            <Button disabled={!contracts || !walletClient} variant="secondary" onClick={() => void onMerge()}>
              Merge
            </Button>
            <Button disabled={!contracts || !walletClient} variant="outline" onClick={() => void onRedeem()}>
              Redeem
            </Button>
          </div>
        </div>

        <div className="border-t border-border pt-4 grid gap-3">
          <p className="text-sm text-muted-foreground">Post SELL YES (side = 2), then others can fill on-chain.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="px">Price (basis points)</Label>
              <Input id="px" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sz">Size (shares)</Label>
              <Input id="sz" value={offerSize} onChange={(e) => setOfferSize(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button disabled={!contracts || !walletClient} onClick={() => void onPostSellYes()}>
            postOffer (relayed)
          </Button>
        </div>

        {relayTxUrl && (
          <p className="text-sm">
            <a href={relayTxUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              Last relayed meta-tx on BscScan
            </a>
          </p>
        )}

        <div className="border-t border-border pt-4 grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="oid">Offer id</Label>
              <Input id="oid" value={fillOfferId} onChange={(e) => setFillOfferId(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="fa">Fill size</Label>
              <Input id="fa" value={fillAmt} onChange={(e) => setFillAmt(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button disabled={!contracts || !walletClient} variant="secondary" onClick={() => void onFill()}>
            fillOffer (relayed)
          </Button>
        </div>

        <div className="border-t border-border pt-4 grid gap-3">
          <div>
            <Label htmlFor="cid">Cancel offer id</Label>
            <Input id="cid" value={cancelId} onChange={(e) => setCancelId(e.target.value)} className="mt-1" />
          </div>
          <Button disabled={!contracts || !walletClient || !cancelId} variant="outline" onClick={() => void onCancel()}>
            cancelOffer (relayed)
          </Button>
        </div>
      </section>

      {contracts && typeof nextOfferId === 'bigint' && nextOfferId > 0n && (
        <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-semibold">On-chain offers (this market)</h2>
            <p className="text-xs text-muted-foreground">
              Scanning ids {offerStartId.toString()}–{(nextOfferId - 1n).toString()} (last {OFFER_SCAN_WINDOW.toString()}{' '}
              offers)
            </p>
          </div>
          {offersScanPending && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning Exchange…
            </p>
          )}
          {!offersScanPending && onchainOffers.length === 0 && (
            <p className="text-sm text-muted-foreground">No active offers for market #{marketId} in this window.</p>
          )}
          {onchainOffers.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="p-2 font-medium">Id</th>
                    <th className="p-2 font-medium">Side</th>
                    <th className="p-2 font-medium">Price (bps)</th>
                    <th className="p-2 font-medium">Remaining</th>
                    <th className="p-2 font-medium">Maker</th>
                    <th className="p-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {onchainOffers.map((o) => (
                    <tr key={o.offerId} className="border-b border-border/60">
                      <td className="p-2 font-mono">{o.offerId}</td>
                      <td className="p-2">{o.sideLabel}</td>
                      <td className="p-2 font-mono">{o.priceBps.toString()}</td>
                      <td className="p-2 font-mono">{formatUnits(o.remainingAmount, 6)}</td>
                      <td className="p-2 font-mono text-xs">
                        <a
                          href={explorerAddressUrl(bscTestnet.id, o.maker) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent underline"
                        >
                          {o.maker.slice(0, 8)}…
                        </a>
                      </td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFillOfferId(String(o.offerId))
                            setFillAmt(formatUnits(o.remainingAmount, 6))
                          }}
                        >
                          Use for fill
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">On-chain nextOfferId: {nextOfferId.toString()}</p>
        </section>
      )}

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Off-chain book (GET /orders/{marketId})</h2>
          <Button size="sm" variant="ghost" disabled={ordersLoading} onClick={() => void refreshApi()}>
            {ordersLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>
        {ordersLoading && orders.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rows. {ordersReachable ? 'Mirror is empty.' : 'Request failed — see alert above.'}
          </p>
        ) : (
          <ul className="text-sm space-y-2 font-mono">
            {orders.map((o) => (
              <li key={o.orderId} className="border-b border-border/60 pb-2">
                {o.side} {o.priceBps} bps × {o.amount} · {o.maker.slice(0, 10)}…
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="secondary" onClick={() => void onMirrorOrderbook()}>
          Save mirror order (same price/size fields)
        </Button>
      </section>
    </div>
  )
}
