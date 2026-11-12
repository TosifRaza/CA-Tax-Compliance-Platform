'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DemoMark, EmptyState, LoadingState, StatusBadge } from '@/components/app/shared'
import { apiGet, apiSend, formatDate } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface Obligation {
  id: string; code: string; title: string; frequency: string
  periodLabel: string | null
  dueDate: string
  internalTargetDate: string | null
  status: string
  note: string | null
  demoMarked: boolean
  businessName: string | null
  filings: { id: string; acknowledgementNo: string | null; officialStatus: string | null; recordedAt: string; recordedByName: string | null; evidenceNote: string | null }[]
}

export default function ComplianceView() {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [fileFor, setFileFor] = useState<Obligation | null>(null)
  const [ack, setAck] = useState('')
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isStaff = !!user && user.role !== 'CLIENT'
  const q = useQuery({ queryKey: ['compliance'], queryFn: () => apiGet<{ obligations: Obligation[] }>('/api/compliance') })

  async function recordFiling() {
    if (!fileFor) return
    setBusy(true)
    setError(null)
    try {
      await apiSend('POST', `/api/compliance/${fileFor.id}/file`, { acknowledgementNo: ack, evidenceNote: evidence })
      setFileFor(null)
      setAck('')
      setEvidence('')
      void qc.invalidateQueries({ queryKey: ['compliance'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const now = Date.now()
  const grouped = { OVERDUE: [] as Obligation[], NEXT_7: [] as Obligation[], LATER: [] as Obligation[], FILED: [] as Obligation[] }
  for (const o of q.data?.obligations || []) {
    if (o.status === 'FILED' || o.status === 'WAIVED') grouped.FILED.push(o)
    else if (new Date(o.dueDate).getTime() < now) grouped.OVERDUE.push(o)
    else if (new Date(o.dueDate).getTime() < now + 7 * 86400000) grouped.NEXT_7.push(o)
    else grouped.LATER.push(o)
  }

  if (q.isLoading) return <LoadingState />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Compliance calendar</h1>
        <p className="text-sm text-muted-foreground">Recurring statutory obligations. Reminder entries and internal targets are not proof of filing — an official acknowledgement is recorded for each filing.</p>
      </div>

      {q.data && q.data.obligations.length === 0 && <EmptyState title="No compliance obligations yet" hint="Obligations are generated when applications complete, or can be added by staff." />}

      {(['OVERDUE', 'NEXT_7', 'LATER', 'FILED'] as const).map((group) => grouped[group].length > 0 && (
        <section key={group} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {group === 'NEXT_7' ? 'Due within 7 days' : group === 'LATER' ? 'Upcoming' : group === 'OVERDUE' ? 'Overdue' : 'Filed / closed'}
          </h2>
          <div className="grid gap-3">
            {grouped[group].map((o) => (
              <Card key={o.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />{o.title} {o.demoMarked && <DemoMark text="Due-date rule is a demonstration value pending professional verification" />}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {o.businessName ? `${o.businessName} · ` : ''}{o.frequency.toLowerCase()} · statutory due {formatDate(o.dueDate)}{o.internalTargetDate ? ` · internal target ${formatDate(o.internalTargetDate)}` : ''}
                    </p>
                    {o.note && <p className="text-xs text-muted-foreground mt-0.5">{o.note}</p>}
                    {o.filings.map((f) => (
                      <p key={f.id} className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Filed — ack {f.acknowledgementNo} ({formatDate(f.recordedAt)}, by {f.recordedByName})</p>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {group === 'OVERDUE' && <Badge variant="outline" className="border-0 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">Overdue</Badge>}
                    <StatusBadge status={o.status} />
                    {isStaff && o.status !== 'FILED' && (
                      <Button size="sm" variant="outline" onClick={() => { setFileFor(o); setAck(''); setEvidence(''); setError(null) }}>Record filing</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!fileFor} onOpenChange={(o) => !o && setFileFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record filing evidence</DialogTitle>
            <p className="text-sm text-muted-foreground">Marking an obligation as filed requires the official acknowledgement number and evidence of the submission.</p>
          </DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="ack">Official acknowledgement / reference number *</Label>
            <Input id="ack" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="e.g. ARN or receipt number from the portal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evidence">Evidence note *</Label>
            <Input id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Portal confirmation downloaded and archived, ref page 3" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileFor(null)}>Cancel</Button>
            <Button disabled={busy || !ack.trim() || !evidence.trim()} onClick={() => void recordFiling()}>{busy ? 'Saving…' : 'Record as filed'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
