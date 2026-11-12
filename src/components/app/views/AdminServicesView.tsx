'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, PlayCircle, Plus, Save, ShieldAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DemoMark, EmptyState, LoadingState, StatusBadge } from '@/components/app/shared'
import { apiGet, apiSend } from '@/lib/client/api'
import { computeChecklist, visibleSections } from '@/lib/rules'
import type { Answers, FormSchema } from '@/lib/types'

interface ServiceRow {
  id: string; code: string; clientName: string; internalName?: string; status: string; verificationStatus: string
  description?: string | null
  demoMarked: boolean; category: { code: string; name: string }; authority?: string | null
  currentVersion: { id: string; version: string; status: string } | null
}
interface VersionFull {
  id: string; serviceId: string; serviceName: string; version: string; status: string; changeNotes: string | null
  formSchema: FormSchema
  documentRequirements: unknown[]
  taskTemplates: unknown[]
  pricing: { professionalFee: number; govtFee: number; taxPercent?: number; professionalFeeNote?: string; govtFeeNote?: string; taxNote?: string; demoMarked?: boolean }
  applicability: unknown
  complianceRules: unknown[]
  sourceReferences: unknown[]
  workflowId: string | null
  workflow: { id: string; code: string; name: string; stages: { code: string; name: string; sequence: number; responsibleRole: string }[] } | null
  validationReport: { errors: { message: string; severity: string }[]; warnings: { message: string; severity: string }[] } | null
  editable: boolean
  approvedByName?: string | null
}
interface WorkflowRow { id: string; code: string; name: string; stages: { code: string; name: string }[] }

const PRESETS: { label: string; answers: Answers }[] = [
  { label: 'Proprietorship, rented premises', answers: { constitution: 'PROPRIETORSHIP', premisesStatus: 'RENTED' } },
  { label: 'Partnership, owned premises', answers: { constitution: 'PARTNERSHIP', premisesStatus: 'OWNED' } },
  { label: 'Private Limited, rented premises', answers: { constitution: 'PRIVATE_LIMITED', premisesStatus: 'RENTED' } },
]

export default function AdminServicesView() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newSvc, setNewSvc] = useState({ code: '', clientName: '', internalName: '', categoryId: '', description: '', authority: '', officialUrl: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = useQuery({ queryKey: ['services'], queryFn: () => apiGet<{ services: ServiceRow[] }>('/api/services') })
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => apiGet<{ categories: { id: string; code: string; name: string; active?: boolean }[] }>('/api/admin/categories') })

  async function createService() {
    setBusy(true); setError(null)
    try {
      const res = await apiSend<{ service: { id: string } }>('POST', '/api/services', newSvc)
      setCreateOpen(false)
      setNewSvc({ code: '', clientName: '', internalName: '', categoryId: '', description: '', authority: '', officialUrl: '' })
      void qc.invalidateQueries({ queryKey: ['services'] })
      setSelected(res.service.id)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (selected) {
    return <ServiceWorkspace serviceId={selected} onBack={() => { setSelected(null); void qc.invalidateQueries({ queryKey: ['services'] }) }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Service configuration</h1>
          <p className="text-sm text-muted-foreground">Reusable service masters with versioned configuration and a professional approval lifecycle.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden /> New service</Button>
      </div>

      {list.isLoading && <LoadingState />}
      {list.data && list.data.services.length === 0 && <EmptyState title="No services yet" hint="Create your first service to configure it." />}
      <div className="rounded-lg border overflow-x-auto">
        {list.data && list.data.services.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Verification</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.services.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-3 py-2"><span className="font-medium">{s.clientName}</span> <span className="font-mono text-xs text-muted-foreground">{s.code}</span>{s.demoMarked && <DemoMark />}</td>
                  <td className="px-3 py-2 text-xs">{s.category.name}</td>
                  <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2 text-xs">{s.currentVersion ? `v${s.currentVersion.version} (${s.currentVersion.status.toLowerCase()})` : '—'}</td>
                  <td className="px-3 py-2 text-xs">{s.verificationStatus.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => setSelected(s.id)}>Configure</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New service</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="s-code">Code *</Label><Input id="s-code" value={newSvc.code} onChange={(e) => setNewSvc({ ...newSvc, code: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-cat">Category *</Label>
              <Select value={newSvc.categoryId} onValueChange={(v) => setNewSvc({ ...newSvc, categoryId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{cats.data?.categories.filter((c) => c.active === undefined || true).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="s-client">Client-facing name *</Label><Input id="s-client" value={newSvc.clientName} onChange={(e) => setNewSvc({ ...newSvc, clientName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-int">Internal name</Label><Input id="s-int" value={newSvc.internalName} onChange={(e) => setNewSvc({ ...newSvc, internalName: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="s-desc">Description</Label><Textarea id="s-desc" rows={2} value={newSvc.description} onChange={(e) => setNewSvc({ ...newSvc, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-auth">Authority</Label><Input id="s-auth" value={newSvc.authority} onChange={(e) => setNewSvc({ ...newSvc, authority: e.target.value })} placeholder="e.g. GSTN" /></div>
            <div className="space-y-1.5"><Label htmlFor="s-url">Official URL</Label><Input id="s-url" value={newSvc.officialUrl} onChange={(e) => setNewSvc({ ...newSvc, officialUrl: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={busy || !newSvc.code || !newSvc.clientName || !newSvc.categoryId} onClick={() => void createService()}>Create (draft)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceWorkspace({ serviceId, onBack }: { serviceId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [previewPreset, setPreviewPreset] = useState<Answers | null>(null)

  const svc = useQuery({ queryKey: ['service-admin', serviceId], queryFn: () => apiGet<{ service: ServiceRow & { versions: { id: string; version: string; status: string }[]; currentVersion: VersionFull | null } }>(`/api/services/${serviceId}`) })
  const versions = useQuery({ queryKey: ['versions', serviceId], queryFn: () => apiGet<{ versions: { id: string; version: string; status: string; changeNotes: string | null }[] }>(`/api/services/${serviceId}/versions`) })
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => apiGet<{ workflows: WorkflowRow[] }>('/api/admin/workflows') })

  const version = svc.data?.service.currentVersion

  const preview = useMemo(() => {
    if (!previewPreset || !version) return null
    const sections = visibleSections(version.formSchema, previewPreset)
    const checklist = computeChecklist(version.documentRequirements as never, previewPreset)
    return { sections, checklist }
  }, [previewPreset, version])

  if (svc.isLoading) return <LoadingState />
  if (svc.isError) return <p className="text-sm text-red-600">{(svc.error as Error).message}</p>
  const service = svc.data!.service

  async function saveBasics(patch: Record<string, unknown>) {
    setError(null)
    try {
      await apiSend('PATCH', `/api/services/${serviceId}`, patch)
      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
      setInfo('Saved.')
    } catch (e) { setError((e as Error).message) }
  }

  async function saveVersionConfig(key: string, value: unknown) {
    if (!version) return
    setError(null)
    try {
      await apiSend('PATCH', `/api/services/${serviceId}/versions/${version.id}`, { [key]: value })
      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
      setInfo('Configuration saved. Run Validate to re-check.')
    } catch (e) { setError((e as Error).message) }
  }

  async function newVersion() {
    setError(null)
    try {
      await apiSend('POST', `/api/services/${serviceId}/versions`, {})
      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
      void qc.invalidateQueries({ queryKey: ['versions', serviceId] })
      setInfo('New draft version created from the current version.')
    } catch (e) { setError((e as Error).message) }
  }

  async function transition(to: string) {
    if (!version) return
    setError(null)
    try {
      await apiSend('POST', `/api/services/${serviceId}/versions/${version.id}/transition`, { to })
      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
      void qc.invalidateQueries({ queryKey: ['services'] })
      setInfo(`Status changed to ${to}.`)
    } catch (e) { setError((e as Error).message) }
  }

  async function validate() {
    if (!version) return
    setError(null)
    try {
      await apiSend('POST', `/api/services/${serviceId}/versions/${version.id}/validate`, {})
      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
      setInfo('Validation complete.')
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-1 -ml-2">← All services</Button>
          <h1 className="text-xl font-semibold">{service.clientName} <span className="font-mono text-sm text-muted-foreground">{service.code}</span></h1>
        </div>
        <div className="flex items-center gap-2">
          {service.demoMarked && <DemoMark />}
          <StatusBadge status={service.status} />
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {info && <Alert><AlertDescription>{info}</AlertDescription></Alert>}

      {version?.validationReport && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Latest validation</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {version.validationReport.errors.length === 0
              ? <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" aria-hidden /> No validation errors</p>
              : version.validationReport.errors.map((e, i) => <p key={i} className="text-sm text-red-600">Error: {e.message}</p>)}
            {version.validationReport.warnings.slice(0, 4).map((w, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400">Warning: {w.message}</p>)}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="basics">
        <TabsList className="flex-wrap">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="lifecycle">Versions &amp; lifecycle</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="basics" className="mt-4 max-w-2xl space-y-3">
          <BasicsEditor
            clientName={service.clientName}
            description={svc.data!.service.description ?? ''}
            authority={service.authority ?? ''}
            onSave={(patch) => void saveBasics(patch)}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          {!version && <EmptyState title="No current version" hint="Create a version in the lifecycle tab." />}
          {version && (
            <>
              {version && (
                <PricingEditor
                  key={version.id}
                  versionId={version.id}
                  editable={version.editable}
                  pricing={version.pricing}
                  onSave={async (p) => {
                    setError(null)
                    try {
                      await apiSend('PATCH', `/api/services/${serviceId}/versions/${version.id}`, { pricing: p })
                      void qc.invalidateQueries({ queryKey: ['service-admin', serviceId] })
                      setInfo('Configuration saved. Run Validate to re-check.')
                    } catch (e) { setError((e as Error).message) }
                  }}
                />
              )}

              <JsonEditorCard
                title="Form schema (sections, fields, conditional rules)"
                description="Declarative JSON: sections → fields with visibilityRule/requiredRule condition trees. Validated for unknown references and circular dependencies."
                initial={JSON.stringify(version.formSchema, null, 2)}
                editable={version.editable}
                onSave={(v) => void saveVersionConfig('formSchema', v)}
              />
              <JsonEditorCard
                title="Document requirements"
                description="ALWAYS / CONDITIONAL / OPTIONAL with condition rules and human-readable conditionSummary shown to clients."
                initial={JSON.stringify(version.documentRequirements, null, 2)}
                editable={version.editable}
                onSave={(v) => void saveVersionConfig('documentRequirements', v)}
              />
              <JsonEditorCard
                title="Task templates"
                description="Application-specific tasks generated at submission: stage, responsible role, department, SLA, dependencies, evidence/approval flags."
                initial={JSON.stringify(version.taskTemplates, null, 2)}
                editable={version.editable}
                onSave={(v) => void saveVersionConfig('taskTemplates', v)}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Workflow definition</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Select value={version.workflowId ?? 'none'} disabled={!version.editable} onValueChange={(v) => void saveVersionConfig('workflowId', v === 'none' ? '' : v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— none —</SelectItem>
                        {workflows.data?.workflows.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.stages.length} stages)</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {version.workflow && (
                      <ol className="text-xs text-muted-foreground space-y-0.5">
                        {version.workflow.stages.map((s) => <li key={s.code}>{s.sequence}. {s.name} — {s.responsibleRole.replaceAll('_', ' ').toLowerCase()}</li>)}
                      </ol>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Compliance rules (generated obligations)</CardTitle></CardHeader>
                  <CardContent>
                    <JsonEditor
                      initial={JSON.stringify(version.complianceRules, null, 2)}
                      editable={version.editable}
                      onSave={(v) => void saveVersionConfig('complianceRules', v)}
                    />
                  </CardContent>
                </Card>
              </div>
              <JsonEditorCard
                title="Source references & applicability"
                description="Official Source Registry entries backing this configuration, plus applicability constraints. Applicability supports constitutions[], applicantType, periodMode, requires (pan/gstin/tan/cin each 'YES'|'NO'|'ANY'), minTurnover and maxTurnover (whole INR) — all evaluated server-side at draft creation (R-13)."
                initial={JSON.stringify({ sourceReferences: version.sourceReferences, applicability: version.applicability }, null, 2)}
                editable={version.editable}
                dual
                onSave={(parsed) => {
                  const p = parsed as { sourceReferences: unknown; applicability: unknown }
                  void saveVersionConfig('sourceReferences', p.sourceReferences)
                  void saveVersionConfig('applicability', p.applicability)
                }}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void validate()}><Wand2 className="h-4 w-4" aria-hidden /> Run validation</Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="lifecycle" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Versions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button size="sm" variant="outline" onClick={() => void newVersion()}><Plus className="h-4 w-4" aria-hidden /> Create new draft version from current</Button>
              <ul className="space-y-1.5">
                {versions.data?.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>v{v.version} <span className="text-xs text-muted-foreground">{v.changeNotes}</span></span>
                    <span className="flex items-center gap-2">
                      {version?.id === v.id && <Badge variant="outline">current</Badge>}
                      <StatusBadge status={v.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {version && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Approval lifecycle</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">{version.status}</Badge>
                {version.editable && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void transition('VALIDATION')}>Move to Validation</Button>
                    <Button size="sm" variant="outline" onClick={() => void transition('TEST')}>Move to Test</Button>
                    <Button size="sm" variant="outline" onClick={() => void transition('PROFESSIONAL_REVIEW')}>Send for professional review</Button>
                  </>
                )}
                {version.status === 'APPROVED' && (
                  <Button size="sm" onClick={() => void transition('PUBLISHED')}><PlayCircle className="h-4 w-4" aria-hidden /> Publish (activates version)</Button>
                )}
                {['PUBLISHED', 'RETIRED'].includes(version.status) && <p className="text-xs text-muted-foreground">Published versions are immutable. Approve &amp; publish happen in strict order: CA approval first, then publication.</p>}
                {version.status === 'PROFESSIONAL_REVIEW' && <p className="text-xs text-muted-foreground">Awaiting CA approval in the CA reviewer&apos;s Review Queue (approval requires zero validation errors).</p>}
                {version.approvedByName && <p className="text-xs text-muted-foreground w-full">Approved by: {version.approvedByName}</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant={previewPreset === p.answers ? 'default' : 'outline'} onClick={() => setPreviewPreset(p.answers)}>
                {p.label}
              </Button>
            ))}
          </div>
          {preview && version && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Visible form for this scenario</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {preview.sections.map((s) => (
                      <li key={s.code} className="rounded border p-2">
                        <p className="text-sm font-medium">{s.title}</p>
                        <ul className="mt-1 space-y-0.5">
                          {s.fields.map((f) => (
                            <li key={f.code} className="text-xs text-muted-foreground">{f.label} {f.required ? <Badge variant="outline" className="ml-1 text-[10px]">required</Badge> : null}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Document checklist for this scenario</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {preview.checklist.map((c) => (
                      <li key={c.requirementCode} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                        <span>{c.name}</span>
                        <StatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs flex items-center gap-1.5 text-muted-foreground"><ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Preview only — generated tasks follow the task templates (first stage: {version.workflow?.stages[0]?.name || '—'}).</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BasicsEditor({ clientName, description, authority, onSave }: {
  clientName: string; description: string; authority: string
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState({ clientName, description, authority })
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Basic information</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="b-cn">Client-facing name</Label><Input id="b-cn" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="b-desc">Description</Label><Textarea id="b-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="b-auth">Authority</Label><Input id="b-auth" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} /></div>
        <Button size="sm" onClick={() => onSave(form)}><Save className="h-4 w-4" aria-hidden /> Save basics</Button>
      </CardContent>
    </Card>
  )
}

function PricingEditor({ versionId, editable, pricing, onSave }: {
  versionId: string
  editable: boolean
  pricing: VersionFull['pricing']
  onSave: (p: VersionFull['pricing']) => void | Promise<void>
}) {
  void versionId
  const [local, setLocal] = useState(pricing)
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Pricing</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-prof">Professional fee (INR)</Label>
          <Input id="p-prof" type="number" value={local?.professionalFee ?? 0} disabled={!editable}
            onChange={(e) => setLocal({ ...local, professionalFee: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-govt">Government fee (INR)</Label>
          <Input id="p-govt" type="number" value={local?.govtFee ?? 0} disabled={!editable}
            onChange={(e) => setLocal({ ...local, govtFee: Number(e.target.value) })} />
          {local?.govtFeeNote && <p className="text-[11px] text-muted-foreground">{local.govtFeeNote}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-tax">Tax on professional fee (%)</Label>
          <Input id="p-tax" type="number" value={local?.taxPercent ?? 0} disabled={!editable}
            onChange={(e) => setLocal({ ...local, taxPercent: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="p-note">Government fee provenance note (required) — never invent a statutory fee</Label>
          <Input id="p-note" value={local?.govtFeeNote ?? ''} disabled={!editable}
            onChange={(e) => setLocal({ ...local, govtFeeNote: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <Button size="sm" disabled={!editable} onClick={() => void onSave(local)}><Save className="h-4 w-4" aria-hidden /> Save pricing</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function JsonEditor({ initial, editable, onSave }: { initial: string; editable: boolean; onSave: (value: unknown) => void }) {
  const [text, setText] = useState(initial)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="space-y-1.5">
      <Textarea className="font-mono text-xs" rows={10} value={text} disabled={!editable} onChange={(e) => setText(e.target.value)} aria-label="JSON configuration" />
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
      <Button size="sm" disabled={!editable} onClick={() => {
        try { onSave(JSON.parse(text)); setErr(null) } catch { setErr('JSON is invalid.') }
      }}><Save className="h-4 w-4" aria-hidden /> Save</Button>
    </div>
  )
}

function JsonEditorCard({ title, description, initial, editable, onSave, dual }: {
  title: string; description: string; initial: string; editable: boolean; dual?: boolean
  onSave: (value: unknown) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <JsonEditor
          key={initial.slice(0, 120)}
          initial={initial}
          editable={editable}
          onSave={(v) => {
            if (dual && v && typeof v === 'object' && ('sourceReferences' in (v as object) || 'applicability' in (v as object))) {
              onSave(v)
            } else if (!dual) {
              onSave(v)
            } else {
              onSave({ sourceReferences: v, applicability: v })
            }
          }}
        />
      </CardContent>
    </Card>
  )
}
