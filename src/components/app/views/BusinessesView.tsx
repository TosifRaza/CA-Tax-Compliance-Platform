'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, LoadingState } from '@/components/app/shared'
import { apiGet, apiSend } from '@/lib/client/api'

interface Business {
  id: string
  legalName: string
  tradeName: string | null
  constitution: string
  pan: string | null
  gstin: string | null
  cin: string | null
  tan: string | null
  state: string | null
  registeredAddress: string | null
  operatingAddress: string | null
  businessActivities: string | null
  annualTurnover: number | null
  active: boolean
}

const CONSTITUTIONS = [
  { value: 'PROPRIETORSHIP', label: 'Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'LLP', label: 'Limited Liability Partnership' },
  { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
  { value: 'PUBLIC_LIMITED', label: 'Public Limited Company' },
  { value: 'HUF', label: 'HUF' },
  { value: 'TRUST', label: 'Trust' },
  { value: 'SOCIETY', label: 'Society' },
  { value: 'OTHER', label: 'Other' },
]

const EMPTY = { legalName: '', tradeName: '', constitution: 'PROPRIETORSHIP', pan: '', gstin: '', cin: '', tan: '', state: '', registeredAddress: '', operatingAddress: '', businessActivities: '', annualTurnover: '' }

export default function BusinessesView() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<typeof EMPTY & { id?: string }>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['businesses'], queryFn: () => apiGet<{ businesses: Business[] }>('/api/businesses') })

  function openNew() {
    setForm(EMPTY)
    setError(null)
    setOpen(true)
  }
  function openEdit(b: Business) {
    setForm({ id: b.id, legalName: b.legalName, tradeName: b.tradeName || '', constitution: b.constitution, pan: b.pan || '', gstin: b.gstin || '', cin: b.cin || '', tan: b.tan || '', state: b.state || '', registeredAddress: b.registeredAddress || '', operatingAddress: b.operatingAddress || '', businessActivities: b.businessActivities || '', annualTurnover: b.annualTurnover === null || b.annualTurnover === undefined ? '' : String(b.annualTurnover) })
    setError(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (form.id) {
        await apiSend('PATCH', '/api/businesses', form)
      } else {
        await apiSend('POST', '/api/businesses', form)
      }
      setOpen(false)
      void qc.invalidateQueries({ queryKey: ['businesses'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Your business details</h1>
          <p className="text-sm text-muted-foreground">Maintain your business profiles; applications prefill from these details.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" aria-hidden /> Add business</Button>
      </div>

      {q.isLoading && <LoadingState />}
      {q.data && q.data.businesses.length === 0 && <EmptyState title="No business profiles yet" hint="Add your first business to start applying for services." action={<Button size="sm" onClick={openNew}>Add business</Button>} />}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data?.businesses.map((b) => (
          <Card key={b.id} className={b.active ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{b.legalName}</CardTitle>
              <p className="text-xs text-muted-foreground">{CONSTITUTIONS.find((c) => c.value === b.constitution)?.label || b.constitution}{b.tradeName ? ` · ${b.tradeName}` : ''}{!b.active && ' · inactive'}</p>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {b.pan && <p><span className="text-muted-foreground">PAN:</span> <span className="font-mono">{b.pan}</span></p>}
              {b.gstin && <p><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono">{b.gstin}</span></p>}
              {b.cin && <p><span className="text-muted-foreground">CIN:</span> <span className="font-mono">{b.cin}</span></p>}
              {b.annualTurnover !== null && b.annualTurnover !== undefined && <p><span className="text-muted-foreground">Annual turnover:</span> ₹{b.annualTurnover.toLocaleString('en-IN')}</p>}
              {b.registeredAddress && <p className="text-muted-foreground">{b.registeredAddress}</p>}
              <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Edit business' : 'Add business'}</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-legal">Legal name *</Label>
              <Input id="b-legal" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-trade">Trade name</Label>
              <Input id="b-trade" value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Constitution *</Label>
              <Select value={form.constitution} onValueChange={(v) => setForm({ ...form, constitution: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CONSTITUTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-state">State</Label>
              <Input id="b-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-pan">PAN</Label>
              <Input id="b-pan" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCPS1234F" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-gstin">GSTIN (if registered)</Label>
              <Input id="b-gstin" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-cin">CIN / LLPIN</Label>
              <Input id="b-cin" value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-tan">TAN</Label>
              <Input id="b-tan" value={form.tan} onChange={(e) => setForm({ ...form, tan: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="b-reg">Registered address</Label>
              <Textarea id="b-reg" rows={2} value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="b-ops">Operating address</Label>
              <Textarea id="b-ops" rows={2} value={form.operatingAddress} onChange={(e) => setForm({ ...form, operatingAddress: e.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="b-act">Business activities</Label>
              <Input id="b-act" value={form.businessActivities} onChange={(e) => setForm({ ...form, businessActivities: e.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="b-turn">Annual turnover (₹, optional)</Label>
              <Input id="b-turn" inputMode="numeric" value={form.annualTurnover} onChange={(e) => setForm({ ...form, annualTurnover: e.target.value })} placeholder="e.g. 4500000" />
              <p className="text-xs text-muted-foreground">Used only to check service eligibility. Leave empty if not applicable.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !form.legalName.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
