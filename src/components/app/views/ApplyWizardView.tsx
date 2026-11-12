'use client'

import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import DynamicForm from '@/components/app/DynamicForm'
import { DemoMark, ErrorState, LoadingState, StatusBadge } from '@/components/app/shared'
import { apiGet, apiSend, apiUpload, formatInr } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'
import { validateAnswers, visibleSections } from '@/lib/rules'
import { assessmentYearOptions, taxMonthOptions } from '@/lib/period'
import { evaluateApplicability, type ApplicabilityConfig } from '@/lib/applicability'
import type { Answers, FormSchema } from '@/lib/types'

interface BusinessRow { id: string; legalName: string; tradeName: string | null; constitution: string; pan: string | null; gstin: string | null; tan: string | null; cin: string | null; annualTurnover: number | null }
interface ServiceDetail {
  service: {
    id: string; clientName: string; description: string | null; authority: string | null; demoMarked: boolean
    currentVersion: {
      id: string; version: string
      applicability: { constitutions?: string[]; notes?: string; periodMode?: 'NONE' | 'ASSESSMENT_YEAR' | 'TAX_PERIOD'; applicantType?: 'BUSINESS' | 'INDIVIDUAL' | 'ANY' } & ApplicabilityConfig
      pricing: { professionalFee: number; govtFee: number; taxPercent?: number; govtFeeNote?: string; demoMarked?: boolean }
    } | null
  }
}
interface AppDetail {
  application: {
    id: string; referenceNo: string; status: string; periodLabel: string | null
    formData: Answers
    formSchema: FormSchema | null
    checklist: { requirementCode: string; name: string; status: string; reason: string; formats: string[]; maxFiles: number; maxSizeMb: number; description?: string }[]
    documents: { id: string; requirementCode: string | null; fileName: string; status: string; reviewNotes?: string | null; versionNo: number }[]
    quotation: null | { total: number; items: { label: string; amount: number; note: string | null }[]; pricingNote?: string | null; demoMarked: boolean }
    service: { clientName: string; authority: string | null; demoMarked: boolean }
    business: { legalName: string } | null
    workflowStages: { code: string; name: string }[]
  }
}

const STEPS = ['Setup & period', 'Application form', 'Documents', 'Review & submit']

export default function ApplyWizardView({ serviceId }: { serviceId: string }) {
  const { navigate, user } = useAppStore()
  const [step, setStep] = useState(0)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedRef, setSubmittedRef] = useState<string | null>(null)
  const [periodLabel, setPeriodLabel] = useState('')
  const [businessId, setBusinessId] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const svc = useQuery({ queryKey: ['service-public', serviceId], queryFn: () => apiGet<ServiceDetail>(`/api/services/${serviceId}`) })
  const biz = useQuery({ queryKey: ['businesses'], queryFn: () => apiGet<{ businesses: BusinessRow[] }>('/api/businesses') })
  const app = useQuery({
    queryKey: ['application', draftId],
    queryFn: () => apiGet<AppDetail>(`/api/applications/${draftId}`),
    enabled: !!draftId,
  })

  const draftApp = app.data?.application
  const currentAnswers = answers ?? draftApp?.formData ?? {}
  const snapshotSchema = draftApp?.formSchema ?? null

  // Debounced draft autosave.
  const scheduleSave = useCallback((updated: Answers) => {
    if (!draftId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void apiSend<{ errors: Record<string, string> }>('PATCH', `/api/applications/${draftId}`, { answers: updated })
        .then((res) => setErrors(res.errors || {}))
        .catch(() => { /* draft save failures surface on submit */ })
    }, 700)
  }, [draftId])

  function onAnswers(updated: Answers) {
    setAnswers(updated)
    scheduleSave(updated)
  }

  async function createDraft(forBusinessId: string | null, chosenPeriod: string) {
    setBusy(true)
    setError(null)
    try {
      const applicability = service.currentVersion?.applicability
      const periodMode = applicability?.periodMode ?? 'NONE'
      const res = await apiSend<{ id: string; referenceNo: string }>('POST', '/api/applications', {
        serviceId,
        businessId: forBusinessId || undefined,
        periodLabel: periodMode === 'NONE' ? undefined : chosenPeriod,
        periodType: periodMode === 'NONE' ? undefined : periodMode,
      })
      setDraftId(res.id)
      setStep(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function goDocs() {
    if (!draftId) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiSend<{ errors: Record<string, string> }>('PATCH', `/api/applications/${draftId}`, { answers: currentAnswers })
      const errs = res.errors || {}
      setErrors(errs)
      if (Object.keys(errs).length > 0) {
        setError('Please complete the highlighted required answers before continuing.')
        return
      }
      await app.refetch()
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!draftId) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiSend<{ referenceNo: string }>('POST', `/api/applications/${draftId}/submit`)
      setSubmittedRef(res.referenceNo)
      setStep(4)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (svc.isLoading || biz.isLoading) return <LoadingState />
  if (svc.isError) return <ErrorState message={(svc.error as Error).message} />
  const service = svc.data!.service
  if (!service.currentVersion) return <ErrorState message="This service is not open for applications." />
  const pricing = service.currentVersion.pricing
  const applicability = service.currentVersion.applicability
  const periodMode = applicability.periodMode ?? 'NONE'
  const applicantType = applicability.applicantType ?? 'BUSINESS'
  const periodOptions = periodMode === 'ASSESSMENT_YEAR' ? assessmentYearOptions() : periodMode === 'TAX_PERIOD' ? taxMonthOptions() : []
  // R-13: evaluate the full applicability config per business profile and
  // surface the honest reasons a profile is not eligible, instead of only
  // filtering constitutions.
  const evaluated = (biz.data?.businesses || []).map((b) => ({ business: b, verdict: evaluateApplicability(applicability, b) }))
  const businesses = evaluated.filter((e) => e.verdict.eligible).map((e) => e.business)
  const ineligible = evaluated.filter((e) => !e.verdict.eligible)

  const total = pricing.professionalFee + pricing.govtFee + Math.round((pricing.professionalFee * (pricing.taxPercent ?? 0)) / 100)

  if (submittedRef) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center py-10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h1 className="text-xl font-semibold">Application submitted</h1>
        <p className="text-sm text-muted-foreground">Your reference number is <span className="font-mono font-medium text-foreground">{submittedRef}</span>. Our team will verify your documents and keep you updated here.</p>
        <Button onClick={() => navigate('applications')}>Go to my applications</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">›</span>}
            <span className={i === step ? 'font-semibold text-emerald-800 dark:text-emerald-300' : i < step ? 'text-muted-foreground line-through' : 'text-muted-foreground'}>{s}</span>
          </div>
        ))}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">{service.clientName} {service.demoMarked && <DemoMark text="Fee values and requirements are demonstration data pending CA verification" />}</CardTitle>
            <p className="text-sm text-muted-foreground">{service.description}</p>
            {service.authority && <p className="text-xs text-muted-foreground">Processed for: {service.authority}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Professional service charge</span><span className="font-medium">{formatInr(pricing.professionalFee)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Government/statutory fee</span><span>{pricing.govtFee === 0 ? 'Nil' : formatInr(pricing.govtFee)}</span></div>
              {pricing.taxPercent ? <div className="flex justify-between text-muted-foreground"><span>Tax on professional services ({pricing.taxPercent}%)</span><span>{formatInr(Math.round((pricing.professionalFee * pricing.taxPercent) / 100))}</span></div> : null}
              <div className="flex justify-between border-t pt-1 mt-1 font-medium"><span>Total payable</span><span>{formatInr(total)}</span></div>
              {pricing.govtFeeNote && <p className="text-xs text-muted-foreground pt-1">Government fee note: {pricing.govtFeeNote}</p>}
            </div>
            {applicantType !== 'INDIVIDUAL' && (
            <div className="space-y-1.5">
              <Label htmlFor="business">Apply for which business?</Label>
              <Select value={businessId} onValueChange={(v) => setBusinessId(v)} disabled={busy}>
                <SelectTrigger id="business" className="w-full"><SelectValue placeholder="Select a business profile" /></SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.legalName} ({b.constitution.replaceAll('_', ' ').toLowerCase()})</SelectItem>)}
                </SelectContent>
              </Select>
              {ineligible.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-1">
                  {ineligible.map((e) => (
                    <p key={e.business.id}><span className="font-medium">{e.business.legalName}</span> — {e.verdict.reasons.join(' ')}</p>
                  ))}
                </div>
              )}
              {businesses.length === 0 && <p className="text-sm text-muted-foreground">No eligible business profile found. Add one under “Your Business Details” first.</p>}
            </div>
            )}

          {periodMode !== 'NONE' && (
            <div className="space-y-1.5">
              <Label htmlFor="period">Statutory period this application relates to *</Label>
              <Select value={periodLabel} onValueChange={setPeriodLabel} disabled={busy}>
                <SelectTrigger id="period" className="w-full"><SelectValue placeholder={periodMode === 'ASSESSMENT_YEAR' ? 'Select the assessment year' : 'Select the tax period'} /></SelectTrigger>
                <SelectContent>
                  {periodOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The case, its generated compliance obligations and filings are linked to this period.</p>
            </div>
          )}

          {applicantType === 'INDIVIDUAL' && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              This service is filed by you as an individual taxpayer — no business profile is required. The return is prepared for the person on your account ({user?.name}).
            </div>
          )}

          {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Creating draft…</p>}
          <Button
            disabled={busy || (applicantType !== 'INDIVIDUAL' && !businessId) || (periodMode !== 'NONE' && !periodLabel)}
            onClick={() => void createDraft(applicantType === 'INDIVIDUAL' ? null : businessId, periodLabel)}
          >
            Start application <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          {applicantType === 'INDIVIDUAL' && businesses.length === 0 && <p className="text-xs text-muted-foreground">Tip: individual services never ask for a business profile.</p>}
        </CardContent>
        </Card>
      )}

      {step === 1 && snapshotSchema && (
        <div className="space-y-4">
          {draftApp?.status === 'CLIENT_INFO_REQUESTED' && (
            <Alert><AlertDescription>The processing team has requested changes or additional information. Update the relevant answers below and continue to documents.</AlertDescription></Alert>
          )}
          <DynamicForm schema={snapshotSchema} answers={currentAnswers} errors={errors} onAnswers={onAnswers} onErrors={setErrors} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button>
            <Button onClick={() => void goDocs()} disabled={busy || !draftId}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save &amp; continue <ArrowRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      )}

      {step === 2 && draftApp && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Required documents {draftApp.business ? <>for {draftApp.business.legalName}</> : 'for your application'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {draftApp.checklist.filter((c) => c.status !== 'NOT_APPLICABLE').map((c) => {
                const uploads = draftApp.documents.filter((d) => d.requirementCode === c.requirementCode && d.status !== 'SUPERSEDED')
                return (
                  <div key={c.requirementCode} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.description || c.reason} · {c.formats.join(', ')} · max {c.maxSizeMb} MB</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    {uploads.length > 0 && (
                      <ul className="space-y-1">
                        {uploads.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-xs rounded bg-muted/50 px-2 py-1.5">
                            <span className="truncate">{d.fileName}</span>
                            <span className="flex items-center gap-2"><StatusBadge status={d.status} />{d.reviewNotes && <span className="text-red-700 dark:text-red-400">{d.reviewNotes}</span>}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(c.status === 'REQUIRED' || c.status === 'OPTIONAL') && uploads.length < c.maxFiles && (
                      <DocUpload applicationId={draftApp.id} requirementCode={c.requirementCode} onDone={() => void app.refetch()} />
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button>
            <Button onClick={() => setStep(3)}>Continue <ArrowRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      )}

      {step === 3 && draftApp && snapshotSchema && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Review your information</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {draftApp.periodLabel && (
                <div className="rounded-md border p-3 text-sm flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Statutory period</span>
                  <span className="font-medium">{draftApp.periodLabel}</span>
                </div>
              )}
              {visibleSections(snapshotSchema, currentAnswers).map((s) => (
                <div key={s.code}>
                  <p className="text-sm font-medium mb-1">{s.title}</p>
                  <dl className="grid gap-x-4 gap-y-1 text-sm md:grid-cols-2">
                    {s.fields.filter((f) => f.type !== 'SECTION_HEADING' && f.type !== 'INFO').map((f) => (
                      <div key={f.code} className="flex items-baseline justify-between gap-3 border-b py-0.5">
                        <dt className="text-muted-foreground min-w-0 break-words">{f.label}</dt>
                        <dd className="text-right font-medium shrink-0 max-w-[60%] break-words">{f.type === 'CHECKBOX' ? (currentAnswers[f.code] === true ? 'Yes' : 'No') : String(currentAnswers[f.code] ?? '—')}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">Fee summary</p>
                {draftApp.quotation ? (
                  draftApp.quotation.items.map((i) => (
                    <div key={i.label} className="flex justify-between"><span className="text-muted-foreground">{i.label}</span><span>{formatInr(i.amount)}</span></div>
                  ))
                ) : (
                  <div className="flex justify-between"><span className="text-muted-foreground">Total payable</span><span className="font-medium">{formatInr(total)}</span></div>
                )}
                {draftApp.quotation?.pricingNote && <p className="text-xs text-amber-800 dark:text-amber-300">{draftApp.quotation.pricingNote}</p>}
              </div>
              {service.demoMarked && <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden /> This service configuration is a demonstration pending professional verification.</p>}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button>
            <Button onClick={() => void submit()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Confirm &amp; submit application</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DocUpload({ applicationId, requirementCode, onDone }: { applicationId: string; requirementCode: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('requirementCode', requirementCode)
      await apiUpload(`/api/applications/${applicationId}/documents`, fd)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm hover:bg-muted cursor-pointer">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
        Upload file
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} disabled={busy} />
      </label>
      {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
    </div>
  )
}
