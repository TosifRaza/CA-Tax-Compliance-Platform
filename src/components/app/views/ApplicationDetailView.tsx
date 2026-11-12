'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, FileDown, FileUp, Gavel, Info, Landmark, Loader2, MessageSquareWarning, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DemoMark, ErrorState, LoadingState, StatusBadge, statusLabel } from '@/components/app/shared'
import { apiGet, apiSend, apiUpload, formatDate, formatDateTime, formatInr } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface AppDetail {
  application: {
    id: string; referenceNo: string; status: string; currentStageCode: string | null
    periodType: string | null; periodLabel: string | null
    service: { clientName: string; authority: string | null; officialUrl: string | null; demoMarked: boolean }
    business: { legalName: string; constitution: string } | null
    client?: { name: string; email: string }
    formData: Record<string, unknown>
    checklist: { requirementCode: string; name: string; status: string; reason: string; formats: string[] }[]
    workflowStages: { code: string; name: string; sequence: number; stageType: string }[]
    documents: { id: string; requirementCode: string | null; fileName: string; sizeBytes: number; mimeType: string; status: string; versionNo: number; reviewNotes?: string | null; createdAt: string }[]
    tasks: {
      id: string; templateCode: string; name: string; description: string | null; stageCode: string
      status: string; assignedTo: { id: string; name: string } | null; department: string | null
      unassignedReason: string | null; evidenceNote: string | null; evidenceRequired: boolean
      approvalRequired: boolean; approvalStatus: string | null; completedAt: string | null; responsibleRole: string
    }[]
    quotation: null | {
      id: string; total: number; items: { label: string; amount: number; note: string | null }[]
      pricingNote?: string | null; demoMarked: boolean; status: string
      payments: { id: string; amount: number; status: string; method: string; gatewayRef: string | null; createdAt: string; confirmedAt: string | null }[]
    }
    taxPayments: {
      id: string; liabilityType: string; periodLabel: string | null; amount: number; status: string
      dueDate: string | null; paidOn: string | null; challanRef: string | null; evidenceNote: string | null
      recordedByName: string | null; verifiedAt: string | null; createdAt: string
    }[]
    filings: { id: string; authority: string | null; portal: string | null; acknowledgementNo: string | null; officialStatus: string | null; evidenceNote: string | null; recordedAt: string; recordedByName: string | null }[]
    events: { id: string; type: string; actorName: string | null; createdAt: string; payload: Record<string, unknown> | null }[]
    statusHistory: { id: string; fromStatus: string | null; toStatus: string; actorName: string | null; remarks: string | null; createdAt: string }[]
  }
}

export default function ApplicationDetailView({ appId }: { appId: string }) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoMsg, setInfoMsg] = useState('')
  const [taxOpen, setTaxOpen] = useState(false)
  const [markPaidFor, setMarkPaidFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['application', appId], queryFn: () => apiGet<AppDetail>(`/api/applications/${appId}`) })
  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState message={(q.error as Error).message} />
  const a = q.data!.application
  const isClient = user?.role === 'CLIENT'
  const canStaff = user && ['EMPLOYEE', 'MANAGER', 'CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

  async function refresh() { await qc.invalidateQueries({ queryKey: ['application', appId] }) }

  async function acceptQuotation() {
    if (!a.quotation) return
    setBusy(true); setActionError(null)
    try {
      await apiSend('POST', `/api/quotations/${a.quotation.id}/accept`)
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function pay() {
    if (!a.quotation) return
    setBusy(true); setActionError(null)
    try {
      const res = await apiSend<{ payment: { id: string } }>('POST', '/api/payments/checkout', { quotationId: a.quotation.id })
      // Simulated hosted checkout: the ONLY way a payment succeeds is the gateway webhook.
      await apiSend('POST', '/api/payments/webhook', { paymentId: res.payment.id, gatewayRef: `DEMO-${res.payment.id.slice(0, 8).toUpperCase()}`, status: 'SUCCESS', demo: true, amount: a.quotation.total })
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function reviewDoc(docId: string, decision: 'APPROVE' | 'REJECT', notes: string) {
    setBusy(true); setActionError(null)
    try {
      await apiSend('POST', `/api/documents/${docId}/review`, { decision, notes })
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function taskAction(taskId: string, body: Record<string, unknown>) {
    setBusy(true); setActionError(null)
    try {
      await apiSend('PATCH', `/api/tasks/${taskId}`, body)
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function sendInfoRequest() {
    setBusy(true); setActionError(null)
    try {
      await apiSend('POST', `/api/applications/${appId}/info-request`, { message: infoMsg })
      setInfoOpen(false)
      setInfoMsg('')
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function recordTaxPayment(body: Record<string, unknown>) {
    setBusy(true); setActionError(null)
    try {
      await apiSend('POST', `/api/applications/${appId}/tax-payment`, body)
      setTaxOpen(false)
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  async function markTaxPaid(taxPaymentId: string, challanRef: string) {
    setBusy(true); setActionError(null)
    try {
      await apiSend('PATCH', `/api/applications/${appId}/tax-payment`, { taxPaymentId, status: 'PAID', challanRef })
      setMarkPaidFor(null)
      await refresh()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(false) }
  }

  const stageIndex = a.workflowStages.findIndex((s) => s.code === a.currentStageCode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{a.referenceNo}</p>
          <h1 className="text-xl font-semibold">{a.service.clientName} — {a.business?.legalName ?? 'Individual taxpayer'}</h1>
          <p className="text-sm text-muted-foreground">
            {a.service.authority} {a.service.officialUrl && <a className="inline-flex items-center gap-0.5 underline" href={a.service.officialUrl} target="_blank" rel="noreferrer noopener">official portal <ExternalLink className="h-3 w-3" aria-hidden /></a>}
            {a.periodLabel && <> · Period: <span className="font-medium text-foreground">{a.periodLabel}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {a.service.demoMarked && <DemoMark />}
          <StatusBadge status={a.status} />
          {canStaff && <Button variant="outline" size="sm" onClick={() => setInfoOpen(true)}><MessageSquareWarning className="h-4 w-4" aria-hidden /> Request information</Button>}
        </div>
      </div>

      {actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}

      {a.status === 'CLIENT_INFO_REQUESTED' && isClient && (
        <Alert><AlertDescription className="flex gap-2"><Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden /> The team needs additional information. Open your application form from “My Applications” to update answers, or contact support.</AlertDescription></Alert>
      )}

      {/* Progress timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Application progress</CardTitle></CardHeader>
        <CardContent>
          <ol className="flex flex-wrap gap-2">
            {a.workflowStages.map((s, i) => {
              const done = stageIndex === -1 ? a.status === 'COMPLETED' : i < stageIndex
              const current = i === stageIndex
              return (
                <li key={s.code} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${current ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 font-medium' : done ? 'border-muted text-muted-foreground line-through' : 'text-muted-foreground'}`}>
                  {s.name}
                </li>
              )
            })}
          </ol>
          {a.statusHistory.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              {a.statusHistory.slice(0, 6).map((h) => (
                <li key={h.id}>{formatDateTime(h.createdAt)} — {statusLabel(h.toStatus)} {h.actorName ? `by ${h.actorName}` : ''}{h.remarks ? `: ${h.remarks}` : ''}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {a.checklist.filter((c) => c.status !== 'NOT_APPLICABLE').map((c) => {
            const docs = a.documents.filter((d) => d.requirementCode === c.requirementCode)
            return (
              <div key={c.requirementCode} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <StatusBadge status={c.status} />
                </div>
                {docs.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{isClient ? 'Not uploaded yet.' : 'Awaiting client upload.'}</p>}
                <ul className="mt-2 space-y-1.5">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline truncate"><FileDown className="h-3 w-3 shrink-0" aria-hidden />{d.fileName}</a>
                        <span className="text-muted-foreground">v{d.versionNo}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        {d.reviewNotes && <span className="text-red-700 dark:text-red-400">{d.reviewNotes}</span>}
                        {canStaff && d.status === 'PENDING' && (
                          <span className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy} onClick={() => void reviewDoc(d.id, 'APPROVE', '')}>Approve</Button>
                            <RejectDocButton disabled={busy} onConfirm={(notes) => void reviewDoc(d.id, 'REJECT', notes)} />
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {isClient && ['DRAFT', 'CLIENT_INFO_REQUESTED'].includes(a.status) && <DocUploader applicationId={a.id} requirementCode={c.requirementCode} onDone={() => void refresh()} />}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Tasks (staff only) */}
      {canStaff && (
        <Card>
          <CardHeader><CardTitle className="text-base">Processing tasks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {a.tasks.map((t) => (
              <div key={t.id} className="rounded-md border p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.name} {t.approvalRequired && <Badge variant="outline" className="ml-1">CA approval{t.approvalStatus ? `: ${statusLabel(t.approvalStatus)}` : ''}</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{t.department || 'No department'} · {t.assignedTo ? `Assigned to ${t.assignedTo.name}` : 'Unassigned'} {t.completedAt ? `· Completed ${formatDateTime(t.completedAt)}` : ''}</p>
                    {t.unassignedReason && <p className="text-xs text-amber-700 dark:text-amber-400">{t.unassignedReason}</p>}
                    {t.evidenceNote && <p className="text-xs text-muted-foreground">Evidence: {t.evidenceNote}</p>}
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={t.status} />
                    {t.assignedTo?.id === user?.id && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && !t.approvalRequired && (
                      <>
                        {t.status === 'PENDING' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void taskAction(t.id, { action: 'status', status: 'IN_PROGRESS' })}>Start</Button>}
                        <CompleteTaskButton
                          evidenceRequired={t.evidenceRequired}
                          disabled={busy}
                          onConfirm={(evidence) => void taskAction(t.id, { action: 'status', status: 'COMPLETED', evidenceNote: evidence })}
                          onCancel={() => void taskAction(t.id, { action: 'status', status: 'CANCELLED' })}
                        />
                      </>
                    )}
                    {t.assignedTo?.id === user?.id && t.approvalRequired && t.status !== 'COMPLETED' && (
                      <span className="text-xs text-muted-foreground">Decide from the Review Queue.</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quotation & payments */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" aria-hidden /> Payment details</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {a.quotation ? (
            <>
              {a.quotation.items.map((i) => (
                <div key={i.label} className="flex justify-between text-sm"><span className="text-muted-foreground">{i.label}</span><span>{formatInr(i.amount)}</span></div>
              ))}
              <div className="flex justify-between text-sm font-medium border-t pt-1"><span>Total</span><span>{formatInr(a.quotation.total)}</span></div>
              {a.quotation.pricingNote && <p className="text-xs text-amber-800 dark:text-amber-300">{a.quotation.pricingNote}</p>}
              <div className="flex items-center gap-2 pt-1">
                <StatusBadge status={a.quotation.status} />
                {isClient && a.quotation.status === 'SENT' && <Button size="sm" disabled={busy} onClick={() => void acceptQuotation()}>Accept quotation</Button>}
                {isClient && a.quotation.status === 'ACCEPTED' && a.quotation.payments.filter((p) => p.status === 'SUCCESS').length === 0 && (
                  <Button size="sm" disabled={busy} onClick={() => void pay()}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Pay now (demo gateway)</Button>
                )}
              </div>
              {a.quotation.payments.map((p) => (
                <p key={p.id} className="text-xs text-muted-foreground">{formatDateTime(p.confirmedAt || p.createdAt)} — {formatInr(p.amount)} {p.status === 'SUCCESS' ? 'confirmed' : p.status.toLowerCase()} {p.gatewayRef ? `(ref ${p.gatewayRef})` : ''}</p>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">A quotation is generated when the application is submitted.</p>
          )}
        </CardContent>
      </Card>

      {/* Client's own tax payment tracking (R-06) — distinct from the firm's professional fee above */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" aria-hidden /> Client tax payment (your own liability)</CardTitle>
          {canStaff && <Button size="sm" variant="outline" onClick={() => { setTaxOpen(true); setActionError(null) }}><Plus className="h-4 w-4" aria-hidden /> Record liability</Button>}
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This tracks the client&apos;s own statutory tax (self-assessment, advance tax, TDS, GST cash ledger) — separate from the firm&apos;s professional fee above. A challan/portal reference is mandatory before any item is marked paid.
          </p>
          {a.taxPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{canStaff ? 'No tax liability recorded yet for this case.' : 'No tax liability recorded for this case yet.'}</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Liability</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Challan / reference</th>
                    {canStaff && <th className="px-3 py-2 font-medium sr-only">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {a.taxPayments.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{statusLabel(t.liabilityType)}{t.evidenceNote && <span className="block text-xs text-muted-foreground">{t.evidenceNote}</span>}</td>
                      <td className="px-3 py-2 text-xs">{t.periodLabel || a.periodLabel || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{formatInr(t.amount)}</td>
                      <td className="px-3 py-2 text-xs">{t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                      <td className="px-3 py-2 text-xs font-mono">{t.challanRef || '—'}</td>
                      {canStaff && (
                        <td className="px-3 py-2">
                          {t.status === 'PENDING' && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => { setMarkPaidFor(t.id); setActionError(null) }}>Mark paid…</Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isClient && a.taxPayments.some((t) => t.status === 'PENDING') && (
            <p className="text-xs text-amber-800 dark:text-amber-300">A pending item means your tax for this case has not been confirmed as paid yet. The firm records the challan reference when it is paid.</p>
          )}
        </CardContent>
      </Card>

      {/* Filing records */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" aria-hidden /> Government filing evidence</CardTitle></CardHeader>
        <CardContent>
          {a.filings.length === 0
            ? <p className="text-sm text-muted-foreground">No government submission recorded yet. Internal preparation does not constitute official filing.</p>
            : (
              <ul className="space-y-1.5 text-sm">
                {a.filings.map((f) => (
                  <li key={f.id} className="rounded border px-3 py-2">
                    <p className="font-medium">{f.acknowledgementNo ? `Acknowledgement: ${f.acknowledgementNo}` : 'Submission evidence recorded'}</p>
                    <p className="text-xs text-muted-foreground">{f.authority} · {formatDateTime(f.recordedAt)} · by {f.recordedByName} · {f.officialStatus || ''}</p>
                    {f.evidenceNote && <p className="text-xs text-muted-foreground">Evidence: {f.evidenceNote}</p>}
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>

      <TaxPaymentDialog
        open={taxOpen}
        onOpenChange={setTaxOpen}
        busy={busy}
        defaultPeriod={a.periodLabel ?? ''}
        onSubmit={(body) => void recordTaxPayment(body)}
      />

      <MarkPaidDialog
        open={!!markPaidFor}
        onOpenChange={(o) => !o && setMarkPaidFor(null)}
        busy={busy}
        onConfirm={(challan) => markPaidFor && void markTaxPaid(markPaidFor, challan)}
      />
    </div>
  )
}

function DocUploader({ applicationId, requirementCode, onDone }: { applicationId: string; requirementCode: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function upload(file: File) {
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('requirementCode', requirementCode)
      await apiUpload(`/api/applications/${applicationId}/documents`, fd)
      onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <label className="inline-flex items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm hover:bg-muted cursor-pointer">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />} Upload / replace
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} disabled={busy} />
      </label>
      {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
    </div>
  )
}

function RejectDocButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: (notes: string) => void }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  return (
    <>
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-red-700" disabled={disabled} onClick={() => setOpen(true)}>Reject</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject document with reason</DialogTitle></DialogHeader>
          <Label htmlFor="rej-notes">Reason (shown to the client)</Label>
          <Textarea id="rej-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Copy is unreadable; please upload a clear scan of the full page." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-red-700 text-white hover:bg-red-800" disabled={!notes.trim()} onClick={() => { onConfirm(notes.trim()); setOpen(false) }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CompleteTaskButton({ evidenceRequired, disabled, onConfirm, onCancel }: {
  evidenceRequired: boolean
  disabled: boolean
  onConfirm: (evidence: string) => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const [evidence, setEvidence] = useState('')
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>Complete…</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete this task</DialogTitle></DialogHeader>
          {evidenceRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="evidence">Evidence / acknowledgement reference (required)</Label>
              <Input id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. ARN or portal submission confirmation" />
              <p className="text-xs text-muted-foreground">For government stages this is recorded as filing evidence. An internal preparation alone never marks an application as officially filed.</p>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button variant="outline" className="text-red-700" onClick={() => { onCancel(); setOpen(false) }}>Cancel task (not applicable)</Button>
            <span className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              <Button disabled={evidenceRequired && !evidence.trim()} onClick={() => { onConfirm(evidence.trim()); setOpen(false) }}><CheckCircle2 className="h-4 w-4" aria-hidden /> Mark completed</Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TaxPaymentDialog({ open, onOpenChange, busy, defaultPeriod, onSubmit }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  busy: boolean
  defaultPeriod: string
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [liabilityType, setLiabilityType] = useState('SELF_ASSESSMENT')
  const [periodLabel, setPeriodLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('PENDING')
  const [challanRef, setChallanRef] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (status === 'PAID' && !challanRef.trim()) {
      setError('A challan/portal reference is required to mark the tax as paid.')
      return
    }
    onSubmit({
      liabilityType,
      periodLabel: periodLabel || defaultPeriod || undefined,
      amount: Number(amount) || 0,
      dueDate: dueDate || undefined,
      status,
      challanRef: status === 'PAID' ? challanRef.trim() : (challanRef.trim() || undefined),
      evidenceNote: evidenceNote || undefined,
    })
    setLiabilityType('SELF_ASSESSMENT'); setPeriodLabel(''); setAmount(''); setDueDate(''); setStatus('PENDING'); setChallanRef(''); setEvidenceNote(''); setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a tax liability for this case</DialogTitle>
          <p className="text-sm text-muted-foreground">The client&apos;s own statutory tax — never the firm&apos;s professional fee. Mark an item paid only with the official challan reference at hand.</p>
        </DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Liability type</Label>
            <Select value={liabilityType} onValueChange={setLiabilityType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SELF_ASSESSMENT">Self-assessment tax</SelectItem>
                <SelectItem value="ADVANCE_TAX">Advance tax</SelectItem>
                <SelectItem value="TDS">TDS (deductee side)</SelectItem>
                <SelectItem value="GST_CASH">GST cash ledger</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="tp-period">Period label</Label><Input id="tp-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder={defaultPeriod || 'e.g. AY 2026-27'} /></div>
          <div className="space-y-1.5"><Label htmlFor="tp-amount">Amount (INR)</Label><Input id="tp-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0 if not yet quantified" /></div>
          <div className="space-y-1.5"><Label htmlFor="tp-due">Due date (optional)</Label><Input id="tp-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Initial status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PAID">Paid (requires challan reference)</SelectItem>
                <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="tp-challan">Challan / portal reference {status === 'PAID' && '*'}</Label><Input id="tp-challan" value={challanRef} onChange={(e) => setChallanRef(e.target.value)} placeholder="BSR + CIN or portal challan ref" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="tp-note">Evidence note (optional)</Label><Input id="tp-note" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="e.g. Challan ITNS-280 copy filed in the case documents." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Record'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MarkPaidDialog({ open, onOpenChange, busy, onConfirm }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  busy: boolean
  onConfirm: (challanRef: string) => void
}) {
  const [challan, setChallan] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark tax as paid</DialogTitle>
          <p className="text-sm text-muted-foreground">The official challan/portal reference is mandatory — it is the proof the client&apos;s tax was actually paid.</p>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="mp-challan">Challan / portal reference *</Label>
          <Input id="mp-challan" value={challan} onChange={(e) => setChallan(e.target.value)} placeholder="e.g. BSR 0510123, CIN 12345, or portal payment ref" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !challan.trim()} onClick={() => { onConfirm(challan.trim()); setChallan('') }}>{busy ? 'Saving…' : 'Mark paid'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
