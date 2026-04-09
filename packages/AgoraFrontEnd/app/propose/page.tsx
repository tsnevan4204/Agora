'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { postProposal } from '@/lib/agora-api'
import { backendBaseUrl } from '@/lib/env'

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `p-${Date.now()}`
}

export default function ProposePage() {
  const { address, isConnected } = useAccount()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('earnings')
  const [ticker, setTicker] = useState('AAPL')
  const [metric, setMetric] = useState('eps')
  const [fy, setFy] = useState('2026')
  const [fq, setFq] = useState('2')
  const [ranges, setRanges] = useState('EPS > $1.60?\nEPS $1.50–$1.60?')

  const submit = async () => {
    const proposer = address ?? '0x0000000000000000000000000000000000000000'
    if (!isConnected) {
      toast.message('Submitting without wallet', {
        description: 'Using zero address as proposer; connect on /trade if you want your address recorded.',
      })
    }
    const res = await postProposal({
      proposalId: randomId(),
      proposerAddress: proposer,
      title,
      category,
      ticker: ticker.toUpperCase(),
      metric,
      fiscalYear: Number(fy),
      fiscalQuarter: Number(fq),
      suggestedRanges: ranges
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    if (res.error) toast.error(res.error)
    else toast.success('Proposal sent', { description: `POST ${backendBaseUrl}/proposals` })
  }

  return (
    <div className="container mx-auto px-6 py-28 max-w-lg space-y-8">
      <div className="flex justify-between items-center gap-4">
        <h1 className="font-serif text-3xl font-bold">Propose event</h1>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Writes to the Python API (<code className="text-xs bg-muted px-1 rounded">POST /proposals</code>). Admin
        approval uses <code className="text-xs bg-muted px-1 rounded">/proposals/&#123;id&#125;/approve</code>.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Apple Q2 2026 Earnings" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="cat">Category</Label>
          <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="tick">Ticker</Label>
          <Input id="tick" value={ticker} onChange={(e) => setTicker(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="met">Metric</Label>
          <Input id="met" value={metric} onChange={(e) => setMetric(e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="fy">Fiscal year</Label>
            <Input id="fy" value={fy} onChange={(e) => setFy(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="fq">Fiscal quarter</Label>
            <Input id="fq" value={fq} onChange={(e) => setFq(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="rng">Suggested ranges (one per line)</Label>
          <Textarea id="rng" value={ranges} onChange={(e) => setRanges(e.target.value)} className="mt-1 min-h-[100px]" />
        </div>
        <Button className="w-full" onClick={() => void submit()} disabled={!title.trim()}>
          Submit proposal
        </Button>
      </div>
    </div>
  )
}
