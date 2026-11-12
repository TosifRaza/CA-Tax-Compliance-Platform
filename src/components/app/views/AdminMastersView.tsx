'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DemoMark, LoadingState, statusLabel } from '@/components/app/shared'
import { apiGet, apiSend, formatDate } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface Dept { id: string; code: string; name: string; description: string | null; active: boolean; employees: { name: string; role: string; active: boolean }[] }
interface Emp { id: string; userId: string; name: string; email: string; role: string; status: string; department: { code: string; name: string } | null; designation: string | null; availability: string; active: boolean; maxOpenTasks: number; openTasks: number }
interface DocType { id: string; code: string; name: string; category: string | null; active: boolean }
interface Cat { id: string; code: string; name: string; description: string | null; active: boolean; serviceCount: number }
interface DueDateRow {
  id: string; serviceCode: string; obligationCode: string; frequency: string; periodLabel: string
  periodStart: string; periodEnd: string; dueDate: string
  source: { id: string; authority: string; title: string; url: string; verificationStatus: string } | null
  sourceNote: string | null; extensionNotified: boolean; extensionNote: string | null
  verifiedByName: string | null; verifiedAt: string | null; demoMarked: boolean; notes: string | null; active: boolean
}
interface DueDatesResponse { dueDates: DueDateRow[]; services: { code: string; clientName: string }[]; sources: { id: string; authority: string; title: string }[] }
interface PolicyRow {
  id: string; name: string; appliesTo: string; serviceId: string | null; intervals: number[]
  repeatEveryDays: number; escalateAfterDays: number; escalateToRole: string; channel: string; active: boolean
}

export default function AdminMastersView() {
  // R-01 separation of duties: the Knowledge / Rule Manager maintains rule
  // masters (verified statutory dates, reminder policies) but not
  // organizational masters (departments, employees) — those stay with admins.
  const role = useAppStore((s) => s.user?.role)
  const isRuleManager = role === 'KNOWLEDGE_MANAGER'
  const tabs = [
    { id: 'departments', label: 'Departments', hidden: isRuleManager, content: <DepartmentsTab /> },
    { id: 'employees', label: 'Employees', hidden: isRuleManager, content: <EmployeesTab /> },
    { id: 'document-types', label: 'Document types', hidden: isRuleManager, content: <DocTypesTab /> },
    { id: 'categories', label: 'Service categories', hidden: isRuleManager, content: <CategoriesTab /> },
    { id: 'due-dates', label: 'Statutory due dates', hidden: false, content: <DueDatesTab /> },
    { id: 'reminder-policies', label: 'Reminder policies', hidden: false, content: <ReminderPoliciesTab /> },
  ].filter((t) => !t.hidden)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{isRuleManager ? 'Rule Masters' : 'Masters'}</h1>
        <p className="text-sm text-muted-foreground">
          {isRuleManager
            ? 'Verified rule content: statutory due dates and reminder policies. Organizational masters are maintained by firm administrators.'
            : 'Reusable organizational and requirement masters. Records referenced by applications are deactivated instead of deleted.'}
        </p>
      </div>
      <Tabs defaultValue={tabs[0]?.id}>
        <TabsList className="flex-wrap">
          {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
        {tabs.map((t) => <TabsContent key={t.id} value={t.id} className="mt-4">{t.content}</TabsContent>)}
      </Tabs>
    </div>
  )
}

function DepartmentsTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['departments'], queryFn: () => apiGet<{ departments: Dept[] }>('/api/admin/departments') })

  async function create() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/departments', { code, name, description: desc })
      setOpen(false); setCode(''); setName(''); setDesc('')
      void qc.invalidateQueries({ queryKey: ['departments'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggle(d: Dept) {
    await apiSend('PATCH', '/api/admin/departments', { id: d.id, active: !d.active })
    void qc.invalidateQueries({ queryKey: ['departments'] })
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add department</Button>
      {q.isLoading && <LoadingState />}
      {q.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Employees</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell><span className="font-medium">{d.name}</span>{d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}</TableCell>
                  <TableCell className="text-xs">{d.employees.map((e) => e.name).join(', ') || '—'}</TableCell>
                  <TableCell><Switch checked={d.active} onCheckedChange={() => void toggle(d)} aria-label={`Toggle ${d.name}`} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add department</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="space-y-1.5"><Label htmlFor="d-code">Code *</Label><Input id="d-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. GST_INDIRECT" /></div>
          <div className="space-y-1.5"><Label htmlFor="d-name">Name *</Label><Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-desc">Description</Label><Input id="d-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !code || !name} onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmployeesTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE', departmentId: '', designation: '', maxOpenTasks: 10 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emp = useQuery({ queryKey: ['employees'], queryFn: () => apiGet<{ employees: Emp[] }>('/api/admin/employees') })
  const dep = useQuery({ queryKey: ['departments'], queryFn: () => apiGet<{ departments: Dept[] }>('/api/admin/departments') })

  async function create() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/employees', form)
      setOpen(false)
      setForm({ name: '', email: '', password: '', role: 'EMPLOYEE', departmentId: '', designation: '', maxOpenTasks: 10 })
      void qc.invalidateQueries({ queryKey: ['employees'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggle(e: Emp) {
    await apiSend('PATCH', '/api/admin/employees', { id: e.id, active: !e.active })
    void qc.invalidateQueries({ queryKey: ['employees'] })
  }
  async function setAvailability(e: Emp, availability: string) {
    await apiSend('PATCH', '/api/admin/employees', { id: e.id, availability })
    void qc.invalidateQueries({ queryKey: ['employees'] })
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add staff member</Button>
      {emp.isLoading && <LoadingState />}
      {emp.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead>Open tasks</TableHead><TableHead>Availability</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {emp.data.employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><span className="font-medium">{e.name}</span><span className="block text-xs text-muted-foreground">{e.email}{e.designation ? ` · ${e.designation}` : ''}</span></TableCell>
                  <TableCell className="text-xs">{statusLabel(e.role)}</TableCell>
                  <TableCell className="text-xs">{e.department?.name || '—'}</TableCell>
                  <TableCell className="tabular-nums text-sm">{e.openTasks}/{e.maxOpenTasks}</TableCell>
                  <TableCell>
                    <Select value={e.availability} onValueChange={(v) => void setAvailability(e, v)}>
                      <SelectTrigger className="h-8 w-32 text-xs" aria-label="Availability"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVAILABLE">Available</SelectItem>
                        <SelectItem value="ON_LEAVE">On leave</SelectItem>
                        <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Switch checked={e.active} onCheckedChange={() => void toggle(e)} aria-label={`Toggle ${e.name}`} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="e-name">Name *</Label><Input id="e-name" value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="e-email">Email *</Label><Input id="e-email" type="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="e-pass">Password * (min 8)</Label><Input id="e-pass" type="password" value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Executive</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CA_REVIEWER">CA Reviewer</SelectItem>
                  <SelectItem value="KNOWLEDGE_MANAGER">Knowledge Manager</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.departmentId || 'none'} onValueChange={(v) => setForm({ ...form, departmentId: v === 'none' ? '' : v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {dep.data?.departments.filter((d) => d.active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="e-designation">Designation</Label><Input id="e-designation" value={form.designation} onChange={(ev) => setForm({ ...form, designation: ev.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !form.name || !form.email || form.password.length < 8} onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocTypesTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['docTypes'], queryFn: () => apiGet<{ documentTypes: DocType[] }>('/api/admin/document-types') })

  async function create() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/document-types', { code, name, category })
      setOpen(false); setCode(''); setName(''); setCategory('')
      void qc.invalidateQueries({ queryKey: ['docTypes'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggle(dt: DocType) {
    await apiSend('PATCH', '/api/admin/document-types', { id: dt.id, active: !dt.active })
    void qc.invalidateQueries({ queryKey: ['docTypes'] })
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add document type</Button>
      {q.isLoading && <LoadingState />}
      {q.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.documentTypes.map((dt) => (
                <TableRow key={dt.id}>
                  <TableCell className="font-mono text-xs">{dt.code}</TableCell>
                  <TableCell className="text-sm">{dt.name}</TableCell>
                  <TableCell className="text-xs">{dt.category || '—'}</TableCell>
                  <TableCell><Switch checked={dt.active} onCheckedChange={() => void toggle(dt)} aria-label={`Toggle ${dt.name}`} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add document type</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="space-y-1.5"><Label htmlFor="dt-code">Code *</Label><Input id="dt-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="dt-name">Name *</Label><Input id="dt-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="dt-cat">Category</Label><Input id="dt-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Identity, Premises, Corporate" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !code || !name} onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CategoriesTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['categories'], queryFn: () => apiGet<{ categories: Cat[] }>('/api/admin/categories') })

  async function create() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/categories', { code, name, description: desc })
      setOpen(false); setCode(''); setName(''); setDesc('')
      void qc.invalidateQueries({ queryKey: ['categories'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggle(c: Cat) {
    await apiSend('PATCH', '/api/admin/categories', { id: c.id, active: !c.active })
    void qc.invalidateQueries({ queryKey: ['categories'] })
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add category</Button>
      {q.isLoading && <LoadingState />}
      {q.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Services</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell><span className="font-medium">{c.name}</span>{c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}</TableCell>
                  <TableCell><Badge variant="outline">{c.serviceCount}</Badge></TableCell>
                  <TableCell><Switch checked={c.active} onCheckedChange={() => void toggle(c)} aria-label={`Toggle ${c.name}`} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add service category</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="space-y-1.5"><Label htmlFor="c-code">Code *</Label><Input id="c-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-name">Name *</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-desc">Description</Label><Input id="c-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !code || !name} onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =====================================================================
// Statutory due-date master (R-04). CA-verified dates per service,
// obligation and period — each row carries an official source reference,
// an effective period and optional notified-extension handling. Rows are
// demo-marked until a professional records verification.
// =====================================================================

function DueDatesTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [verifyFor, setVerifyFor] = useState<DueDateRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['due-dates'], queryFn: () => apiGet<DueDatesResponse>('/api/admin/due-dates') })

  async function create(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/due-dates', body)
      setOpen(false)
      void qc.invalidateQueries({ queryKey: ['due-dates'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function verify(id: string, sourceReferenceId: string, sourceNote: string, extensionNotified: boolean, extensionNote: string, dueDate: string) {
    setBusy(true); setError(null)
    try {
      await apiSend('PATCH', '/api/admin/due-dates', { id, sourceReferenceId, sourceNote: sourceNote || undefined, extensionNotified, extensionNote: extensionNote || undefined, dueDate: dueDate || undefined, verify: true })
      setVerifyFor(null)
      void qc.invalidateQueries({ queryKey: ['due-dates'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          The verified master the obligation calendar should rely on. Every row carries the official source it came from and the period it applies to — reminders generated from unverified rows stay demo-marked.
        </p>
        <Button size="sm" onClick={() => { setOpen(true); setError(null) }}><Plus className="h-4 w-4" aria-hidden /> Add due date</Button>
      </div>
      {q.isLoading && <LoadingState />}
      {q.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service / obligation</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Extension</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.dueDates.map((d) => (
                <TableRow key={d.id} className={d.active ? '' : 'opacity-50'}>
                  <TableCell>
                    <span className="font-mono text-xs">{d.serviceCode} / {d.obligationCode}</span>
                    <span className="block text-xs text-muted-foreground">{statusLabel(d.frequency)}{d.notes ? ` · ${d.notes}` : ''}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.periodLabel}
                    <span className="block text-muted-foreground">{formatDate(d.periodStart)} → {formatDate(d.periodEnd)}</span>
                  </TableCell>
                  <TableCell className="text-sm font-medium whitespace-nowrap">{formatDate(d.dueDate)}</TableCell>
                  <TableCell className="text-xs max-w-48">
                    {d.source ? (
                      <>
                        <a href={d.source.url} target="_blank" rel="noreferrer noopener" className="underline truncate block">{d.source.authority} — {d.source.title}</a>
                        <Badge variant="outline" className={`mt-1 border-0 ${d.source.verificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>{d.source.verificationStatus.replaceAll('_', ' ').toLowerCase()}</Badge>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                    {d.sourceNote && <span className="block text-muted-foreground mt-1">{d.sourceNote}</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.extensionNotified ? <Badge variant="outline" className="border-0 bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200">Notified</Badge> : '—'}
                    {d.extensionNote && <span className="block text-muted-foreground mt-1">{d.extensionNote}</span>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {d.verifiedByName ? (
                      <span className="text-emerald-800 dark:text-emerald-300">{d.verifiedByName}<span className="block text-muted-foreground">{formatDate(d.verifiedAt)}</span></span>
                    ) : <DemoMark text="Not yet verified by a qualified professional" />}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setVerifyFor(d); setError(null) }}>
                      <ShieldCheck className="h-3 w-3 mr-1" aria-hidden /> {d.verifiedByName ? 'Re-verify' : 'Verify'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data.dueDates.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground text-center py-6">No due-date rows yet. Add the statutory dates your firm relies on — each must name its official source before verification.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <AddDueDateDialog open={open} onOpenChange={setOpen} services={q.data?.services ?? []} sources={q.data?.sources ?? []} busy={busy} error={error} onSubmit={create} />
      {verifyFor && (
        <VerifyDueDateDialog
          row={verifyFor}
          sources={q.data?.sources ?? []}
          busy={busy}
          error={error}
          onClose={() => setVerifyFor(null)}
          onSubmit={(sourceId, note, ext, extNote, dueDate) => void verify(verifyFor.id, sourceId, note, ext, extNote, dueDate)}
        />
      )}
    </div>
  )
}

function AddDueDateDialog({ open, onOpenChange, services, sources, busy, error, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void
  services: { code: string; clientName: string }[]
  sources: { id: string; authority: string; title: string }[]
  busy: boolean; error: string | null
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [serviceCode, setServiceCode] = useState('')
  const [obligationCode, setObligationCode] = useState('')
  const [frequency, setFrequency] = useState('ANNUAL')
  const [periodLabel, setPeriodLabel] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [sourceReferenceId, setSourceReferenceId] = useState('')
  const [sourceNote, setSourceNote] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add statutory due date</DialogTitle>
          <p className="text-sm text-muted-foreground">Created rows are demo-marked until a qualified professional verifies them against the official source.</p>
        </DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Service *</Label>
            <Select value={serviceCode} onValueChange={setServiceCode}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select service" /></SelectTrigger>
              <SelectContent>{services.map((s) => <SelectItem key={s.code} value={s.code}>{s.code} — {s.clientName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dd-obl">Obligation code * (e.g. GSTR1, ITR_FILING)</Label><Input id="dd-obl" value={obligationCode} onChange={(e) => setObligationCode(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="ANNUAL">Annual</SelectItem>
                <SelectItem value="EVENT">Event-based</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dd-period">Period label * (unique per obligation, e.g. &quot;AY 2026-27&quot;)</Label><Input id="dd-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="dd-ps">Period start *</Label><Input id="dd-ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="dd-pe">Period end *</Label><Input id="dd-pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="dd-due">Statutory due date *</Label><Input id="dd-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Official source (registry entry)</Label>
            <Select value={sourceReferenceId || 'none'} onValueChange={(v) => setSourceReferenceId(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Attach the source you took this date from" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none yet —</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.authority} — {s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="dd-srcnote">Source note (where exactly on the source)</Label><Input id="dd-srcnote" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="e.g. Notification no. 12/2026 dated 03-10-2026" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !serviceCode || !obligationCode || !periodLabel || !periodStart || !periodEnd || !dueDate} onClick={() => onSubmit({ serviceCode, obligationCode, frequency, periodLabel, periodStart, periodEnd, dueDate, sourceReferenceId: sourceReferenceId || undefined, sourceNote: sourceNote || undefined })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VerifyDueDateDialog({ row, sources, busy, error, onClose, onSubmit }: {
  row: DueDateRow
  sources: { id: string; authority: string; title: string }[]
  busy: boolean; error: string | null
  onClose: () => void
  onSubmit: (sourceId: string, sourceNote: string, extensionNotified: boolean, extensionNote: string, dueDate: string) => void
}) {
  const [sourceId, setSourceId] = useState(row.source?.id ?? '')
  const [note, setNote] = useState(row.sourceNote ?? '')
  const [dueDate, setDueDate] = useState(row.dueDate.slice(0, 10))
  const [ext, setExt] = useState(row.extensionNotified)
  const [extNote, setExtNote] = useState(row.extensionNote ?? '')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verify due date — {row.serviceCode}/{row.obligationCode}, {row.periodLabel}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Confirm the date against the official portal, attach the registry source and record your verification. Your name and timestamp are stored permanently with the row.
          </p>
        </DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vd-due">Due date *</Label>
            <Input id="vd-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vd-src">Official source (registry) *</Label>
            <Select value={sourceId || 'none'} onValueChange={(v) => setSourceId(v === 'none' ? '' : v)}>
              <SelectTrigger id="vd-src" className="w-full"><SelectValue placeholder="Attach the source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— select a registered source —</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.authority} — {s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="vd-note">Verification note</Label><Textarea id="vd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked, on which portal page/notification." /></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={ext} onCheckedChange={(c) => setExt(c === true)} aria-label="Extension notified" />
            An extension has been officially notified for this period
          </label>
          {ext && <div className="space-y-1.5"><Label htmlFor="vd-ext">Extension note *</Label><Input id="vd-ext" value={extNote} onChange={(e) => setExtNote(e.target.value)} placeholder="e.g. CBDT notification extending due date to 15 December 2026" /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !sourceId || !dueDate} onClick={() => onSubmit(sourceId, note, ext, extNote, dueDate)}>{busy ? 'Saving…' : 'Record verification'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// Reminder policies (R-03). Intervals, repeat and escalation are firm
// configuration; the reminder sweep (hourly, see instrumentation.ts) reads
// these policies when it creates EARLY / DUE / OVERDUE / ESCALATION records.
// =====================================================================

function ReminderPoliciesTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['reminder-policies'], queryFn: () => apiGet<{ policies: PolicyRow[] }>('/api/admin/reminder-policies') })

  async function create(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/admin/reminder-policies', body)
      setOpen(false)
      void qc.invalidateQueries({ queryKey: ['reminder-policies'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null)
    try {
      await apiSend('PATCH', '/api/admin/reminder-policies', { id, ...body })
      void qc.invalidateQueries({ queryKey: ['reminder-policies'] })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Early reminder intervals (days before the due date), repeat cadence while pending, and escalation to a responsible role after a deadline passes. In-app notifications are the source of record; email/WhatsApp delivery is a future channel.
        </p>
        <Button size="sm" onClick={() => { setOpen(true); setError(null) }}><Plus className="h-4 w-4" aria-hidden /> Add policy</Button>
      </div>
      {q.isLoading && <LoadingState />}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {q.data && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Early intervals</TableHead>
                <TableHead>Repeat</TableHead>
                <TableHead>Escalation</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs">{statusLabel(p.appliesTo)}{p.serviceId ? ' · per service' : ' · firm default'}</TableCell>
                  <TableCell>
                    <IntervalsEditor intervals={p.intervals} onSave={(arr) => void patch(p.id, { intervals: arr })} />
                  </TableCell>
                  <TableCell className="text-xs">every {p.repeatEveryDays} days</TableCell>
                  <TableCell className="text-xs">after {p.escalateAfterDays}d → {statusLabel(p.escalateToRole)}</TableCell>
                  <TableCell className="text-xs">{p.channel.replaceAll('_', ' ')}</TableCell>
                  <TableCell><Switch checked={p.active} onCheckedChange={(c) => void patch(p.id, { active: c })} aria-label={`Toggle ${p.name}`} /></TableCell>
                </TableRow>
              ))}
              {q.data.policies.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground text-center py-6">No reminder policies yet. Without a policy the reminder engine cannot send early warnings.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <AddPolicyDialog open={open} onOpenChange={setOpen} busy={busy} error={error} onSubmit={create} />
    </div>
  )
}

function IntervalsEditor({ intervals, onSave }: { intervals: number[]; onSave: (arr: number[]) => void }) {
  const [text, setText] = useState(intervals.join(', '))
  const [editing, setEditing] = useState(false)
  const parsed = text.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
  const dirty = parsed.join(', ') !== intervals.join(', ')

  if (!editing) {
    return (
      <button className="text-xs underline text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} title="Edit intervals">
        {intervals.map((n) => `${n}d`).join(' · ')}
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <Input
        className="h-7 w-28 text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Reminder intervals in days, comma separated"
      />
      <Button size="sm" className="h-7 px-2 text-xs" disabled={!dirty || parsed.length === 0} onClick={() => { onSave(parsed); setEditing(false) }}>Save</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setText(intervals.join(', ')); setEditing(false) }}>Cancel</Button>
    </span>
  )
}

function AddPolicyDialog({ open, onOpenChange, busy, error, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; error: string | null
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState('')
  const [appliesTo, setAppliesTo] = useState('COMPLIANCE')
  const [intervals, setIntervals] = useState('15, 7, 2')
  const [repeatEveryDays, setRepeatEveryDays] = useState('3')
  const [escalateAfterDays, setEscalateAfterDays] = useState('3')
  const [escalateToRole, setEscalateToRole] = useState('MANAGER')
  const parsedIntervals = intervals.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add reminder policy</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="rp-name">Policy name *</Label><Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST deadlines — tight follow-up" /></div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={appliesTo} onValueChange={setAppliesTo}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPLIANCE">Compliance deadlines</SelectItem>
                <SelectItem value="INFO_REQUEST">Client information requests</SelectItem>
                <SelectItem value="TASK">Task SLAs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rp-int">Early intervals (days before due) *</Label><Input id="rp-int" value={intervals} onChange={(e) => setIntervals(e.target.value)} placeholder="15, 7, 2" /></div>
          <div className="space-y-1.5"><Label htmlFor="rp-repeat">Repeat every (days)</Label><Input id="rp-repeat" type="number" min="1" value={repeatEveryDays} onChange={(e) => setRepeatEveryDays(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="rp-esc">Escalate after (days past due)</Label><Input id="rp-esc" type="number" min="0" value={escalateAfterDays} onChange={(e) => setEscalateAfterDays(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Escalate to role</Label>
            <Select value={escalateToRole} onValueChange={setEscalateToRole}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANAGER">Department Manager</SelectItem>
                <SelectItem value="ADMIN">Administrator</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !name.trim() || parsedIntervals.length === 0} onClick={() => onSubmit({ name, appliesTo, intervals: parsedIntervals, repeatEveryDays: Number(repeatEveryDays) || 3, escalateAfterDays: Number(escalateAfterDays) || 3, escalateToRole })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
