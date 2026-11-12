'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Landmark, ScrollText, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState, LoadingState } from '@/components/app/shared'
import { apiGet, apiSend, formatDate } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

// Regulatory update intake (gap R-05) and impact analysis (gap R-12).
// Manual first: staff report official updates against a registered source,
// a qualified reviewer verifies them (impact is computed from the frozen
// configuration snapshots of in-flight cases), and only then can the change
// be applied to service work.

interface UpdateRow {
  id: string; title: string; summary: string; publishedOn: string | null; status: string
  affectedServiceIds: string[]
  source: { id: string; authority: string; title: string; url: string; verificationStatus: string }
  reportedByName: string | null; verifiedByName: string | null; verifiedNotes: string | null
  appliedAt: string | null; createdAt: string
  impact: { applicationCount: number; openTaskCount: number; references: string[] } | null
}
interface RegResponse {
  updates: UpdateRow[]
  services: { id: string; code: string; clientName: string }[]
  sources: { id: string; authority: string; title: string }[]
}

const STATUS_COLORS: Record<string, string> = {
  REPORTED: 'bg-secondary text-secondary-foreground',
  UNDER_REVIEW: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  VERIFIED: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  APPLIED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  DISMISSED: 'bg-muted text-muted-foreground',
}

export default function RegulatoryView() {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [reportOpen, setReportOpen] = useState(false)
  const [verifyFor, setVerifyFor] = useState<UpdateRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['regulatory-updates'], queryFn: () => apiGet<RegResponse>('/api/regulatory-updates') })

  const isStaff = !!user && user.role !== 'CLIENT'
  const canVerify = !!user && ['CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const canReport = isStaff

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(null)
    try {
      await apiSend('PATCH', '/api/regulatory-updates', { id, action, ...extra })
      setVerifyFor(null)
      void qc.invalidateQueries({ queryKey: ['regulatory-updates'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const updates = q.data?.updates ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Regulatory updates</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Intake pipeline for official rule changes: staff report an update against a registered source, a qualified professional verifies it and its impact on open cases, and only verified changes are applied to client work. No automated portal scraping — every entry names its official source.
          </p>
        </div>
        {canReport && <Button onClick={() => { setReportOpen(true); setError(null) }}><ScrollText className="h-4 w-4" aria-hidden /> Report an update</Button>}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {q.isLoading && <LoadingState />}
      {!q.isLoading && updates.length === 0 && (
        <EmptyState
          title="No regulatory updates recorded"
          hint="When an official source (e.g. a GST or income-tax notification) changes something relevant to a service, report it here so it can be verified before any client work relies on it."
        />
      )}

      <div className="grid gap-3">
        {updates.map((u) => {
          const svcNames = (q.data?.services ?? []).filter((s) => u.affectedServiceIds.includes(s.id)).map((s) => s.clientName)
          return (
            <Card key={u.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden /> {u.title}
                  </CardTitle>
                  <Badge variant="outline" className={`border-0 ${STATUS_COLORS[u.status] || ''}`}>{u.status.replaceAll('_', ' ')}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Source: {u.source.authority} — {u.source.title}
                  {u.source.url && <a className="inline-flex items-center gap-0.5 underline ml-1" href={u.source.url} target="_blank" rel="noreferrer noopener">open <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                  {u.publishedOn ? ` · published ${u.publishedOn}` : ''} · reported by {u.reportedByName ?? '—'} on {formatDate(u.createdAt)}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{u.summary}</p>
                {svcNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">Affects: {svcNames.join(', ')}</p>
                )}
                {u.verifiedNotes && <p className="text-xs text-muted-foreground">Verification notes: {u.verifiedNotes}{u.verifiedByName ? ` — ${u.verifiedByName}` : ''}</p>}
                {u.impact && (
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    <p className="font-medium flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Impact assessment (computed from frozen case snapshots)</p>
                    <p>{u.impact.applicationCount} open case(s) · {u.impact.openTaskCount} open task(s)</p>
                    {u.impact.references.length > 0 && <p className="mt-0.5 font-mono text-[11px] break-all">{u.impact.references.join(', ')}</p>}
                  </div>
                )}
                {canVerify && ['REPORTED', 'UNDER_REVIEW'].includes(u.status) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {u.status === 'REPORTED' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(u.id, 'UNDER_REVIEW')}>Take under review</Button>}
                    <Button size="sm" disabled={busy} onClick={() => { setVerifyFor(u); setError(null) }}>Verify &amp; assess impact…</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(u.id, 'DISMISS', { verifiedNotes: 'Dismissed without impact.' })}>Dismiss</Button>
                  </div>
                )}
                {canVerify && u.status === 'VERIFIED' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(u.id, 'APPLY')}>Mark configuration applied</Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} sources={q.data?.sources ?? []} services={q.data?.services ?? []} />

      <Dialog open={!!verifyFor} onOpenChange={(o) => !o && setVerifyFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify update &amp; assess impact</DialogTitle>
            <p className="text-sm text-muted-foreground">Confirm the change against the official source, then record your verification. The impact on open cases is computed from their frozen configuration snapshots.</p>
          </DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {verifyFor && (
            <VerifyForm
              update={verifyFor}
              services={q.data?.services ?? []}
              busy={busy}
              onCancel={() => setVerifyFor(null)}
              onSubmit={(affectedServiceIds, verifiedNotes) => void act(verifyFor.id, 'VERIFY', { affectedServiceIds, verifiedNotes })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VerifyForm({ update, services, busy, onSubmit, onCancel }: {
  update: UpdateRow
  services: { id: string; code: string; clientName: string }[]
  busy: boolean
  onSubmit: (affectedServiceIds: string[], verifiedNotes: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(update.affectedServiceIds)
  const [notes, setNotes] = useState('')
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Affected services</Label>
        <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1.5">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={(c) => setSelected((prev) => (c ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                aria-label={s.clientName}
              />
              {s.clientName} <span className="text-xs text-muted-foreground font-mono">{s.code}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="verify-notes">Verification notes (what you checked, against which source)</Label>
        <Textarea id="verify-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Notification no. and date confirmed on the official portal; changes the checklist for rented premises." />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !notes.trim()} onClick={() => onSubmit(selected, notes.trim())}>Verify &amp; compute impact</Button>
      </DialogFooter>
    </div>
  )
}

function ReportDialog({ open, onOpenChange, sources, services }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sources: { id: string; authority: string; title: string }[]
  services: { id: string; code: string; clientName: string }[]
}) {
  const qc = useQueryClient()
  const [sourceId, setSourceId] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [publishedOn, setPublishedOn] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/regulatory-updates', { sourceReferenceId: sourceId, title, summary, publishedOn: publishedOn || undefined, affectedServiceIds: selected })
      onOpenChange(false)
      setSourceId(''); setTitle(''); setSummary(''); setPublishedOn(''); setSelected([])
      void qc.invalidateQueries({ queryKey: ['regulatory-updates'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Report a regulatory update</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Official source *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              aria-label="Official source"
            >
              <option value="">Select a registered source…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.authority} — {s.title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ru-title">Title *</Label><Input id="ru-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Due date extension notification for GSTR-3B" /></div>
          <div className="space-y-1.5"><Label htmlFor="ru-summary">Summary *</Label><Textarea id="ru-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What changed, which taxpayers/services it affects, and where it was published." /></div>
          <div className="space-y-1.5"><Label htmlFor="ru-date">Published on (as shown on the source)</Label><Input id="ru-date" value={publishedOn} onChange={(e) => setPublishedOn(e.target.value)} placeholder="e.g. 05 November 2026" /></div>
          <div className="space-y-1.5">
            <Label>Affected services (can also be set at verification)</Label>
            <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1.5">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected.includes(s.id)}
                    onCheckedChange={(c) => setSelected((prev) => (c ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                    aria-label={s.clientName}
                  />
                  {s.clientName}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !sourceId || !title.trim() || !summary.trim()} onClick={() => void submit()}>{busy ? 'Reporting…' : 'Report update'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
