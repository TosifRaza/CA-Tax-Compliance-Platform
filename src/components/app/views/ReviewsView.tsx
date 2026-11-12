'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, LoadingState } from '@/components/app/shared'
import { apiGet, apiSend, formatDate } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface ReviewTask {
  id: string; name: string; stageCode: string
  application: { id: string; referenceNo: string; businessName: string; serviceName: string }
  assignedTo: string | null
  createdAt: string
  assignedToMe: boolean
}
interface ConfigReview {
  id: string; version: string; serviceId: string; serviceName: string; serviceCode: string
  validationReport: { errors: { severity: string; message: string }[]; warnings: { severity: string; message: string }[] } | null
  sourceReferences: { sourceId: string; note?: string }[]
  updatedAt: string
}

export default function ReviewsView() {
  const { navigate } = useAppStore()
  const qc = useQueryClient()
  const [decide, setDecide] = useState<{ task: ReviewTask; decision: 'APPROVE' | 'REQUEST_CHANGES' } | null>(null)
  const [configApprove, setConfigApprove] = useState<ConfigReview | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['reviews'],
    queryFn: () => apiGet<{ reviewTasks: ReviewTask[]; configReviews: ConfigReview[] }>('/api/reviews'),
    refetchInterval: 30000,
  })

  async function submitDecision() {
    if (!decide) return
    setBusy(true)
    setError(null)
    try {
      await apiSend('POST', '/api/reviews', { taskId: decide.task.id, decision: decide.decision, notes })
      setDecide(null)
      setNotes('')
      void qc.invalidateQueries({ queryKey: ['reviews'] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function approveConfig() {
    if (!configApprove) return
    setBusy(true)
    setError(null)
    try {
      await apiSend('POST', `/api/services/${configApprove.serviceId}/versions/${configApprove.id}/transition`, { to: 'APPROVED', notes })
      setConfigApprove(null)
      setNotes('')
      void qc.invalidateQueries({ queryKey: ['reviews'] })
      void qc.invalidateQueries({ queryKey: ['services'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (q.isLoading) return <LoadingState />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Review queue</h1>
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Application reviews ({q.data?.reviewTasks.length ?? 0})</TabsTrigger>
          <TabsTrigger value="configs">Configuration approvals ({q.data?.configReviews.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-3 mt-4">
          {q.data && q.data.reviewTasks.length === 0 && <EmptyState title="No applications awaiting your review" hint="Review tasks appear when an application reaches a professional approval stage." />}
          {q.data?.reviewTasks.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t.name}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <button className="underline font-mono" onClick={() => navigate('application', t.application.id)}>{t.application.referenceNo}</button>
                  {t.application.serviceName}{t.application.businessName ? ` · ${t.application.businessName}` : ' · Individual taxpayer'}
                  {t.assignedToMe ? ' · assigned to you' : t.assignedTo ? ` · assigned to ${t.assignedTo}` : ' · unassigned'}
                </p>
                <p className="text-xs text-muted-foreground">Created {formatDate(t.createdAt)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setDecide({ task: t, decision: 'APPROVE' }); setNotes('') }}>Approve</Button>
                  <Button size="sm" variant="outline" className="text-red-700" onClick={() => { setDecide({ task: t, decision: 'REQUEST_CHANGES' }); setNotes('') }}>Request changes</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="configs" className="space-y-3 mt-4">
          {q.data && q.data.configReviews.length === 0 && <EmptyState title="No configuration versions awaiting approval" hint="Admins send validated service configurations here for professional approval before publication." />}
          {q.data?.configReviews.map((v) => (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">{v.serviceName} <Badge variant="outline">v{v.version}</Badge></CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Source references attached: {v.sourceReferences.length}</p>
                {v.validationReport && (
                  <div className="space-y-1">
                    {v.validationReport.errors.length === 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">Validation: 0 errors</p>}
                    {v.validationReport.errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-600">Error: {e.message}</p>)}
                    {v.validationReport.warnings.slice(0, 3).map((w, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400">Warning: {w.message}</p>)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Updated {formatDate(v.updatedAt)}</p>
                <Button size="sm" onClick={() => { setConfigApprove(v); setNotes('') }}>Review &amp; approve</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!decide} onOpenChange={(o) => !o && setDecide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decide?.decision === 'APPROVE' ? 'Approve' : 'Request changes'}</DialogTitle>
            <p className="text-sm text-muted-foreground">Your review notes are recorded in the audit trail.</p>
          </DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Label htmlFor="review-notes">Review observations (required)</Label>
          <Textarea id="review-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Documents verified, calculations checked, grounds for decision…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecide(null)}>Cancel</Button>
            <Button disabled={busy || !notes.trim()} onClick={() => void submitDecision()}>{busy && 'Saving…'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!configApprove} onOpenChange={(o) => !o && setConfigApprove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Professionally approve configuration</DialogTitle>
            <p className="text-sm text-muted-foreground">Only approve configurations you have verified against official government sources. Approval records your name and timestamp permanently.</p>
          </DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Label htmlFor="config-notes">Verification notes (required)</Label>
          <Textarea id="config-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sources checked, fee verification status, outstanding items…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigApprove(null)}>Cancel</Button>
            <Button disabled={busy || !notes.trim()} onClick={() => void approveConfig()}>{busy && 'Saving…'} Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
