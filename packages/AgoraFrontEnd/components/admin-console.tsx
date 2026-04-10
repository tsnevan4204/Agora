'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import {
  CheckCircle,
  Eye,
  EyeOff,
  FileCheck,
  Gavel,
  Loader2,
  Lock,
  LogOut,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  fetchProposal,
  postApproveProposal,
  postRejectProposal,
  postResolveMarkets,
  type ProposalMarketSpecPayload,
} from '@/lib/agora-api'
import { backendBaseUrl } from '@/lib/env'
import { cn } from '@/lib/utils'

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

// ─── Login wall ─────────────────────────────────────────────────────────────

function LoginWall({ onAuth }: { onAuth: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Small artificial delay for UX
    await new Promise((r) => setTimeout(r, 400))
    if (username === 'username' && password === 'password') {
      sessionStorage.setItem('agora_admin_auth', '1')
      onAuth()
    } else {
      setError('Invalid credentials. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 px-6">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-10 group">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
          <span className="text-primary-foreground font-serif text-xl font-bold">A</span>
        </div>
        <span className="font-serif text-2xl font-semibold tracking-tight">Agora</span>
      </Link>

      <div className="w-full max-w-sm glass rounded-2xl border border-border/60 p-8 shadow-xl shadow-primary/5 space-y-6">
        <div className="space-y-1 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto mb-4">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold">Admin Access</h1>
          <p className="text-sm text-muted-foreground">
            Restricted area — authorised personnel only.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-user" className="text-sm">Username</Label>
            <Input
              id="admin-user"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-pw" className="text-sm">Password</Label>
            <div className="relative">
              <Input
                id="admin-pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <X className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !username || !password}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
          </Button>
        </form>

        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center max-w-xs">
        This panel performs on-chain and backend operations. Never expose to the public internet without proper authentication.
      </p>
    </div>
  )
}

// ─── Main admin console ──────────────────────────────────────────────────────

export function AdminConsole() {
  const { address } = useAccount()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('agora_admin_auth')
    if (saved === '1') setAuthenticated(true)
    setAuthChecked(true)
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem('agora_admin_auth')
    setAuthenticated(false)
  }

  // ── Proposal state ──
  const [confirmedBy, setConfirmedBy] = useState('')
  const [proposalId, setProposalId] = useState('')
  const [proposalPreview, setProposalPreview] = useState<Record<string, unknown> | null>(null)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [closeLocal, setCloseLocal] = useState('')
  const [marketsJson, setMarketsJson] = useState(DEFAULT_MARKETS_JSON)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // ── Resolution state ──
  const [eventId, setEventId] = useState('0')
  const [resolveMarketIds, setResolveMarketIds] = useState('0')
  const [outcomesJson, setOutcomesJson] = useState(DEFAULT_OUTCOMES_JSON)
  const [resolveReason, setResolveReason] = useState('')

  useEffect(() => {
    setConfirmedBy((prev) => (prev === '' && address ? address : prev))
  }, [address])

  if (!authChecked) return null

  if (!authenticated) {
    return <LoginWall onAuth={() => setAuthenticated(true)} />
  }

  // ── Actions ──
  const loadProposal = async () => {
    if (!proposalId.trim()) { toast.error('Enter a proposal ID'); return }
    setProposalLoading(true)
    try {
      const p = await fetchProposal(proposalId.trim())
      if (!p) {
        toast.error('Proposal not found or API unreachable')
        setProposalPreview(null)
      } else {
        setProposalPreview(p)
        toast.success('Proposal loaded')
      }
    } finally {
      setProposalLoading(false)
    }
  }

  const approve = async () => {
    const by = confirmedBy.trim()
    if (!by) { toast.error('Set "Confirmed by" address'); return }
    let markets: ProposalMarketSpecPayload[]
    try {
      markets = JSON.parse(marketsJson) as ProposalMarketSpecPayload[]
      if (!Array.isArray(markets) || markets.length === 0) throw new Error('must be a non-empty array')
    } catch (e) {
      toast.error('Invalid Markets JSON', { description: String(e) })
      return
    }
    const t = closeLocal ? Math.floor(new Date(closeLocal).getTime() / 1000) : 0
    if (!t || Number.isNaN(t)) { toast.error('Set a valid close time'); return }
    setActionLoading(true)
    try {
      const res = await postApproveProposal(proposalId.trim(), { confirmedBy: by, closeTimeUnix: t, markets })
      if (res.error) toast.error(res.error, { description: JSON.stringify(res.detail) })
      else toast.success('Proposal approved', { description: JSON.stringify(res) })
    } finally {
      setActionLoading(false)
    }
  }

  const reject = async () => {
    const by = confirmedBy.trim()
    if (!by) { toast.error('Set "Confirmed by" address'); return }
    if (!rejectReason.trim()) { toast.error('Rejection reason required'); return }
    setActionLoading(true)
    try {
      const res = await postRejectProposal(proposalId.trim(), { confirmedBy: by, reason: rejectReason.trim() })
      if (res.error) toast.error(res.error)
      else toast.success('Proposal rejected')
    } finally {
      setActionLoading(false)
    }
  }

  const resolve = async () => {
    const by = confirmedBy.trim()
    if (!by) { toast.error('Set "Confirmed by" address'); return }
    let outcomes: Record<string, string>
    try {
      outcomes = JSON.parse(outcomesJson) as Record<string, string>
    } catch (e) {
      toast.error('Invalid Outcomes JSON', { description: String(e) })
      return
    }
    const mids = resolveMarketIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number)
    if (mids.some((n) => Number.isNaN(n))) { toast.error('Market IDs must be numbers'); return }
    const eid = Number(eventId)
    if (Number.isNaN(eid)) { toast.error('Invalid event ID'); return }
    setActionLoading(true)
    try {
      const res = await postResolveMarkets(eid, { confirmedBy: by, marketIds: mids, outcomes, reason: resolveReason.trim() || null })
      if (res.error) toast.error(res.error, { description: JSON.stringify(res.detail) })
      else toast.success('Resolution submitted', { description: res.evidenceHash })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 h-16 border-b border-border glass flex items-center px-6 gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
            <span className="text-primary-foreground font-serif text-base font-bold">A</span>
          </div>
          <span className="font-serif text-xl font-semibold tracking-tight hidden sm:block">Agora</span>
        </Link>

        <Separator orientation="vertical" className="h-6 shrink-0" />

        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Admin Console</span>
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">Ops Only</Badge>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-mono">{backendBaseUrl}</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/trade">Trade</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 container mx-auto px-6 py-8 max-w-4xl space-y-6">

        {/* Warning banner */}
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Restricted access</AlertTitle>
          <AlertDescription>
            Actions here trigger on-chain transactions and backend state changes via your Python relayer.
            Approve/reject/resolve are irreversible operations — verify all inputs carefully.
          </AlertDescription>
        </Alert>

        {/* Confirmed-by address (shared across all actions) */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Operator Identity</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            This address is recorded as the confirming authority on every action below.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cby" className="text-xs text-muted-foreground">Confirmed by (wallet address)</Label>
            <Input
              id="cby"
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              placeholder="0x…"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="proposals">
          <TabsList className="w-full">
            <TabsTrigger value="proposals" className="flex-1 gap-2">
              <FileCheck className="w-4 h-4" />
              Proposals
            </TabsTrigger>
            <TabsTrigger value="resolution" className="flex-1 gap-2">
              <Gavel className="w-4 h-4" />
              Resolution
            </TabsTrigger>
          </TabsList>

          {/* ── Proposals tab ── */}
          <TabsContent value="proposals" className="space-y-5 mt-5">

            {/* Load proposal */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold text-sm">Load Proposal</h3>

              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pid" className="text-xs text-muted-foreground">Proposal ID</Label>
                  <Input
                    id="pid"
                    value={proposalId}
                    onChange={(e) => setProposalId(e.target.value)}
                    placeholder="UUID or custom ID"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={!proposalId.trim() || proposalLoading}
                  onClick={() => void loadProposal()}
                  className="shrink-0"
                >
                  {proposalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
                </Button>
              </div>

              {proposalPreview && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setProposalPreview(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <pre className="text-xs bg-muted/50 p-4 rounded-xl overflow-x-auto max-h-48 font-mono leading-relaxed">
                    {JSON.stringify(proposalPreview, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Approve section */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Approve Proposal</h3>
                <Badge variant="default" className="bg-success/20 text-success border-success/30 text-xs">
                  Creates on-chain market
                </Badge>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="close" className="text-xs text-muted-foreground">
                  Market close time (local)
                </Label>
                <Input
                  id="close"
                  type="datetime-local"
                  value={closeLocal}
                  onChange={(e) => setCloseLocal(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mj" className="text-xs text-muted-foreground">
                  Markets JSON — array of market specs
                </Label>
                <Textarea
                  id="mj"
                  value={marketsJson}
                  onChange={(e) => setMarketsJson(e.target.value)}
                  className="min-h-[160px] font-mono text-xs leading-relaxed"
                />
              </div>

              <Button
                className="bg-success hover:bg-success/90 text-white gap-2"
                disabled={!proposalId.trim() || actionLoading}
                onClick={() => void approve()}
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve + create on-chain
              </Button>
            </div>

            {/* Reject section */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Reject Proposal</h3>
                <Badge variant="destructive" className="text-xs">Irreversible</Badge>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rej" className="text-xs text-muted-foreground">Rejection reason</Label>
                <Input
                  id="rej"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection…"
                />
              </div>

              <Button
                variant="destructive"
                disabled={!proposalId.trim() || !rejectReason.trim() || actionLoading}
                onClick={() => void reject()}
                className="gap-2"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Reject Proposal
              </Button>
            </div>
          </TabsContent>

          {/* ── Resolution tab ── */}
          <TabsContent value="resolution" className="space-y-5 mt-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Resolve Markets</h3>
                <Badge variant="outline" className="text-xs">
                  POST /resolution/resolve/{'{eventId}'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Submits final outcomes for the specified markets. Requires the resolver
                environment on the backend server for on-chain settlement.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="eid" className="text-xs text-muted-foreground">Event ID</Label>
                  <Input
                    id="eid"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    className="font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mids" className="text-xs text-muted-foreground">
                    Market IDs (comma-separated)
                  </Label>
                  <Input
                    id="mids"
                    value={resolveMarketIds}
                    onChange={(e) => setResolveMarketIds(e.target.value)}
                    className="font-mono"
                    placeholder="0, 1, 2"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="out" className="text-xs text-muted-foreground">
                  Outcomes JSON — keys as string indices
                </Label>
                <Textarea
                  id="out"
                  value={outcomesJson}
                  onChange={(e) => setOutcomesJson(e.target.value)}
                  className="min-h-[120px] font-mono text-xs leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rr" className="text-xs text-muted-foreground">
                  Reason / evidence (optional)
                </Label>
                <Input
                  id="rr"
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  placeholder="Link or description of resolution source…"
                />
              </div>

              <Button
                className="gap-2"
                disabled={actionLoading}
                onClick={() => void resolve()}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Gavel className="w-4 h-4" />
                )}
                Submit Resolution
              </Button>
            </div>
          </TabsContent>
        </Tabs>

      </main>
    </div>
  )
}
