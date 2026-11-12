'use client'

import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/app/shared'
import { apiGet, formatDateTime } from '@/lib/client/api'
import { useState } from 'react'

interface AuditRow {
  id: string
  actorName: string | null
  actorRole: string | null
  action: string
  entity: string
  entityId: string | null
  details: string | null
  createdAt: string
}

export default function AuditView() {
  const [entity, setEntity] = useState('')
  const q = useQuery({
    queryKey: ['audit', entity],
    queryFn: () => apiGet<{ logs: AuditRow[]; total: number }>(`/api/admin/audit-logs?pageSize=100${entity ? `&entity=${entity}` : ''}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <Input aria-label="Filter by entity" list="entities" placeholder="Filter by entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-64" />
        <datalist id="entities">
          {['User', 'Application', 'ApplicationTask', 'UploadedDocument', 'Service', 'ServiceVersion', 'Quotation', 'Payment', 'ComplianceObligation', 'SupportTicket', 'Department', 'Employee', 'DocumentType', 'ServiceCategory', 'Business'].map((e) => <option key={e} value={e} />)}
        </datalist>
      </div>

      {q.isLoading && <LoadingState />}
      {q.data && q.data.logs.length === 0 && <EmptyState title="No audit entries" />}
      {q.data && q.data.logs.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</TableCell>
                  <TableCell className="text-xs">{l.actorName || 'System'}{l.actorRole ? ` (${l.actorRole.replaceAll('_', ' ').toLowerCase()})` : ''}</TableCell>
                  <TableCell className="text-xs font-medium">{l.action}</TableCell>
                  <TableCell className="text-xs">{l.entity}{l.entityId ? <span className="block text-[10px] text-muted-foreground font-mono">{l.entityId.slice(0, 12)}…</span> : null}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-72 truncate">{l.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
