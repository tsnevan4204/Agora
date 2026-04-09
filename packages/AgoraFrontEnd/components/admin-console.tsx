'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  fetchProposal,
  postApproveProposal,
  postRejectProposal,
  postResolveMarkets,
  type ProposalMarketSpecPayload,
} from '@/lib/agora-api'
import { backendBaseUrl } from '@/lib/env'

const DEFAULT_MARKETS_JSON = `[
  {
    "question": "Example EPS > $1.60?",
    "resolutionSpecHash": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "resolutionSpecURI": "ipfs://example/spec/0"
  }
]`

const DEFAULT_OUTCOMES_JSON = `{
  "0": "YES",
  "1": "NO"
}`

export function AdminConsole() {
  const { address } = useAccount()
  const [confirmedBy, setConfirmedBy] = useState('')

  useEffect(() => {
    setConfirmedBy((prev) => (prev === '' && address ? address : prev))
  }, [address])

  const [proposalId, setProposalId] = useState('')
  const [proposalPreview, setProposalPreview] = useState<Record<string, unknown> | null>(null)
  const [closeLocal, setCloseLocal] = useState('')
  const [marketsJson, setMarketsJson] = useState(DEFAULT_MARKETS_JSON)
  const [rejectReason, setRejectReason] = useState('')

  const [eventId, setEventId] = useState('0')
  const [resolveMarketIds, setResolveMarketIds] = useState('0')
  const [outcomesJson, setOutcomesJson] = useState(DEFAULT_OUTCOMES_JSON)
  const [resolveReason, setResolveReason] = useState('')

  const loadProposal = async () => {
    if (!proposalId.trim()) {
      toast.error('Enter proposal id')
      return
    }
    const p = await fetchProposal(proposalId.trim())
    if (!p) {
      toast.error('Proposal not found or API unreachable')
      setProposalPreview(null)
      return
    }
    setProposalPreview(p)
    toast.success('Loaded proposal')
  }

  const approve = async () => {
    const by = confirmedBy.trim()
    if (!by) {
      toast.error('Set “Confirmed by” (wallet address)')
      return
    }
    let markets: ProposalMarketSpecPayload[]
    try {
      markets = JSON.parse(marketsJson) as ProposalMarketSpecPayload[]
      if (!Array.isArray(markets) || markets.length === 0) throw new Error('markets must be a non-empty array')
    } catch (e) {
      toast.error('Invalid markets JSON', { description: String(e) })
      return
    }
    const t = closeLocal ? Math.floor(new Date(closeLocal).getTime() / 1000) : 0
    if (!t || Number.isNaN(t)) {
      toast.error('Set close time (local) — must be in the future on-chain')
      return
    }
    const res = await postApproveProposal(proposalId.trim(), {
      confirmedBy: by,
      closeTimeUnix: t,
      markets,
    })
    if (res.error) toast.error(res.error, { description: JSON.stringify(res.detail) })
    else toast.success('Approved', { description: JSON.stringify(res) })
  }

  const reject = async () => {
    const by = confirmedBy.trim()
    if (!by) {
      toast.error('Set “Confirmed by”')
      return
    }
    if (!rejectReason.trim()) {
      toast.error('Reason required')
      return
    }
    const res = await postRejectProposal(proposalId.trim(), {
      confirmedBy: by,
      reason: rejectReason.trim(),
    })
    if (res.error) toast.error(res.error)
    else toast.success('Rejected')
  }

  const resolve = async () => {
    const by = confirmedBy.trim()
    if (!by) {
      toast.error('Set “Confirmed by”')
      return
    }
    let outcomes: Record<string, string>
    try {
      outcomes = JSON.parse(outcomesJson) as Record<string, string>
    } catch (e) {
      toast.error('Invalid outcomes JSON', { description: String(e) })
      return
    }
    const mids = resolveMarketIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
    if (mids.some((n) => Number.isNaN(n))) {
      toast.error('market ids must be numbers (comma-separated)')
      return
    }
    const eid = Number(eventId)
    if (Number.isNaN(eid)) {
      toast.error('Invalid event id')
      return
    }
    const res = await postResolveMarkets(eid, {
      confirmedBy: by,
      marketIds: mids,
      outcomes,
      reason: resolveReason.trim() || null,
    })
    if (res.error) toast.error(res.error, { description: JSON.stringify(res.detail) })
    else toast.success('Resolution submitted', { description: res.evidenceHash })
  }

  return (
    <div className="container mx-auto px-6 py-28 max-w-2xl space-y-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calls backend at <code className="text-xs bg-muted px-1 rounded">{backendBaseUrl}</code> — no server-side
            auth; protect this route in production (e.g. VPN, SSO, or remove from public build).
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>

      <Alert>
        <AlertTitle>Ops only</AlertTitle>
        <AlertDescription>
          Approve/reject/resolve use the same API keys and on-chain wallets as your Python process. Never expose this page
          on the public internet without authentication.
        </AlertDescription>
      </Alert>

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <h2 className="font-semibold">Proposals</h2>
        <div>
          <Label htmlFor="cby">Confirmed by (address)</Label>
          <Input
            id="cby"
            value={confirmedBy}
            onChange={(e) => setConfirmedBy(e.target.value)}
            placeholder="0x…"
            className="mt-1 font-mono text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="pid">Proposal id</Label>
            <Input id="pid" value={proposalId} onChange={(e) => setProposalId(e.target.value)} className="mt-1" />
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadProposal()}>
            Load
          </Button>
        </div>
        {proposalPreview && (
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-48">
            {JSON.stringify(proposalPreview, null, 2)}
          </pre>
        )}

        <div>
          <Label htmlFor="close">Close time (local)</Label>
          <Input
            id="close"
            type="datetime-local"
            value={closeLocal}
            onChange={(e) => setCloseLocal(e.target.value)}
            className="mt-1 max-w-xs"
          />
        </div>
        <div>
          <Label htmlFor="mj">Markets JSON (approve)</Label>
          <Textarea
            id="mj"
            value={marketsJson}
            onChange={(e) => setMarketsJson(e.target.value)}
            className="mt-1 min-h-[160px] font-mono text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void approve()} disabled={!proposalId.trim()}>
            Approve + create on-chain
          </Button>
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="rej">Reject reason</Label>
            <Input id="rej" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-1" />
          </div>
          <Button variant="destructive" className="self-end" onClick={() => void reject()} disabled={!proposalId.trim()}>
            Reject
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-6 space-y-4 bg-card">
        <h2 className="font-semibold">Resolution (manual)</h2>
        <p className="text-sm text-muted-foreground">
          POST <code className="text-xs bg-muted px-1 rounded">/resolution/resolve/&#123;eventId&#125;</code> — requires
          resolver env on the server for on-chain <code className="text-xs bg-muted px-1">resolve</code>.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="eid">Event id</Label>
            <Input id="eid" value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="mids">Market ids (comma-separated)</Label>
            <Input id="mids" value={resolveMarketIds} onChange={(e) => setResolveMarketIds(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="out">Outcomes JSON (keys as strings)</Label>
          <Textarea
            id="out"
            value={outcomesJson}
            onChange={(e) => setOutcomesJson(e.target.value)}
            className="mt-1 min-h-[120px] font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="rr">Reason (optional)</Label>
          <Input id="rr" value={resolveReason} onChange={(e) => setResolveReason(e.target.value)} className="mt-1" />
        </div>
        <Button onClick={() => void resolve()}>Submit resolution</Button>
      </section>
    </div>
  )
}
