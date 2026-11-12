'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSignature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState, LoadingState } from '@/components/app/shared'
import { apiGet, apiSend, formatDateTime } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

// Client consent & authorisation records (gap R-11). The platform records
// consent BEFORE any personal-data retrieval or portal integration is ever
// used. In-app records are the source of truth; no integration reads data
// without a GRANTED consent row covering its scope.

interface ConsentRow {
  id: string; clientId: string; applicationId: string | null
  scope: string; purpose: string; status: string
  grantedAt: string; revokedAt: string | null; expiryAt: string | null
  evidenceNote: string | null; grantedByRole: string
}

const SCOPE_PRESETS = [
  { value: 'DATA_RETRIEVAL_AIS', label: 'Retrieve my AIS (Annual Information Statement) records' },
  { value: 'DATA_RETRIEVAL_26AS', label: 'Retrieve my Form 26AS / TDS records' },
  { value: 'INTEGRATION_GST_PORTAL', label: 'Act on the GST portal on my behalf (registration/filing)' },
  { value: 'INTEGRATION_EFILING_PORTAL', label: 'Act on the income-tax e-filing portal on my behalf' },
  { value: 'DOCUMENT_REPOSITORY', label: 'Store and reuse my uploaded documents for future filings' },
]

export default function ConsentsView() {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [grantOpen, setGrantOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isClient = user?.role === 'CLIENT'
  const q = useQuery({ queryKey: ['consents'], queryFn: () => apiGet<{ consents: ConsentRow[] }>('/api/consents') })

  async function revoke(id: string) {
    setBusy(true); setError(null)
    try {
      await apiSend('PATCH', '/api/consents', { id })
      void qc.invalidateQueries({ queryKey: ['consents'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const consents = q.data?.consents ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Consent records</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {isClient
              ? 'Your authorisations for what the firm may do on your behalf — retrieving your tax data or using any government portal integration. Nothing is ever retrieved without a consent record here, and you can revoke any consent at any time.'
              : 'Client authorisations before any data retrieval or portal integration (mandatory before Stage 6 integration work). Records show who granted each consent and when.'}
          </p>
        </div>
        {isClient && <Button onClick={() => { setGrantOpen(true); setError(null) }}><FileSignature className="h-4 w-4" aria-hidden /> Grant a consent</Button>}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {q.isLoading && <LoadingState />}

      {!q.isLoading && consents.length === 0 && (
        <EmptyState
          title="No consent records yet"
          hint={isClient
            ? 'When a service needs to retrieve your data (AIS, Form 26AS) or use a portal integration, grant the consent here first.'
            : 'Clients grant their own consents from this page; staff records appear here marked “on behalf”.'}
        />
      )}

      <div className="grid gap-3">
        {consents.map((c) => {
          const expired = c.expiryAt ? new Date(c.expiryAt).getTime() < Date.now() : false
          const active = c.status === 'GRANTED' && !expired
          const preset = SCOPE_PRESETS.find((p) => p.value === c.scope)
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{preset ? preset.label : c.scope.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`border-0 ${active ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}>
                      {c.status === 'GRANTED' ? (expired ? 'Expired' : 'Active') : 'Revoked'}
                    </Badge>
                    {c.grantedByRole === 'STAFF_ON_BEHALF' && <Badge variant="outline" className="border-0 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">On behalf</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Purpose:</span> {c.purpose}</p>
                <p className="text-xs text-muted-foreground">
                  Granted {formatDateTime(c.grantedAt)}{c.expiryAt ? ` · expires ${formatDateTime(c.expiryAt)}` : ' · no expiry'}{c.revokedAt ? ` · revoked ${formatDateTime(c.revokedAt)}` : ''}
                </p>
                {c.evidenceNote && <p className="text-xs text-muted-foreground">Evidence: {c.evidenceNote}</p>}
                {c.status === 'GRANTED' && (
                  <div className="pt-1">
                    <Button size="sm" variant="outline" className="text-red-700 dark:text-red-400" disabled={busy} onClick={() => void revoke(c.id)}>Revoke consent</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} onDone={() => void qc.invalidateQueries({ queryKey: ['consents'] })} />
    </div>
  )
}

function GrantDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [scope, setScope] = useState('')
  const [customScope, setCustomScope] = useState('')
  const [purpose, setPurpose] = useState('')
  const [expiryAt, setExpiryAt] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/consents', {
        scope: scope === 'OTHER' ? customScope : scope,
        purpose,
        expiryAt: expiryAt || undefined,
        evidenceNote: evidenceNote || undefined,
      })
      onOpenChange(false)
      setScope(''); setCustomScope(''); setPurpose(''); setExpiryAt(''); setEvidenceNote('')
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grant a consent</DialogTitle>
          <p className="text-sm text-muted-foreground">You are authorising the firm to act within this scope. Consent is recorded with a timestamp and can be revoked at any time.</p>
        </DialogHeader>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Scope *</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-full"><SelectValue placeholder="What may the firm do?" /></SelectTrigger>
              <SelectContent>
                {SCOPE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                <SelectItem value="OTHER">Other (describe the scope yourself)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === 'OTHER' && (
            <div className="space-y-1.5"><Label htmlFor="cs-custom">Custom scope *</Label><Input id="cs-custom" value={customScope} onChange={(e) => setCustomScope(e.target.value)} placeholder="e.g. Retrieve my GST portal cash ledger statements" /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="cs-purpose">Purpose *</Label><Textarea id="cs-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Reconciling TDS credits for my AY 2026-27 return." /></div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-expiry">Expiry (optional)</Label>
            <Input id="cs-expiry" type="datetime-local" value={expiryAt} onChange={(e) => setExpiryAt(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label htmlFor="cs-evidence">Evidence note (optional)</Label><Input id="cs-evidence" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="e.g. Consent also signed physically, copy held in file #2026-114." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !scope || (scope === 'OTHER' && !customScope.trim()) || !purpose.trim()} onClick={() => void submit()}>{busy ? 'Recording…' : 'Record consent'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
