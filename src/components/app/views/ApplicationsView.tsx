'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState, StatusBadge } from '@/components/app/shared'
import { apiGet, formatDateTime } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface Row {
  id: string
  referenceNo: string
  status: string
  currentStageCode: string | null
  service: { name: string; code: string; demoMarked: boolean }
  business: { legalName: string; constitution: string }
  client?: { name: string; email: string }
  documentCount: number
  updatedAt: string
}

export default function ApplicationsView() {
  const { user, navigate } = useAppStore()
  const [status, setStatus] = useState('')
  const q = useQuery({
    queryKey: ['applications', status],
    queryFn: () => apiGet<{ applications: Row[]; total: number }>(`/api/applications${status ? `?status=${status}` : ''}`),
  })

  const statuses = ['SUBMITTED', 'IN_PROGRESS', 'CLIENT_INFO_REQUESTED', 'PROFESSIONAL_REVIEW', 'GOVERNMENT_SUBMISSION', 'REWORK', 'COMPLETED', 'DRAFT']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{user?.role === 'CLIENT' ? 'My applications' : 'Applications'}</h1>
          <p className="text-sm text-muted-foreground">{q.data ? `${q.data.total} application(s)` : ''}</p>
        </div>
        <Input aria-label="Filter by status" list="status-list" placeholder="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-56" />
        <datalist id="status-list">
          {statuses.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      {q.isLoading && <LoadingState />}
      {q.data && q.data.applications.length === 0 && (
        <EmptyState
          title="No applications found"
          hint={user?.role === 'CLIENT' ? 'Choose a service from the Services page to start your first application.' : 'Applications will appear here as clients submit them.'}
          action={user?.role === 'CLIENT' ? <Button size="sm" onClick={() => navigate('services')}>Browse services</Button> : undefined}
        />
      )}
      {q.data && q.data.applications.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Applicant</TableHead>
                {user?.role !== 'CLIENT' && <TableHead>Client</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.applications.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.referenceNo}</TableCell>
                  <TableCell>{a.service.name}</TableCell>
                  <TableCell>{a.business?.legalName ?? <span className="text-muted-foreground">Individual taxpayer</span>}</TableCell>
                  {user?.role !== 'CLIENT' && <TableCell className="text-sm text-muted-foreground">{a.client?.name}</TableCell>}
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(a.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => navigate('application', a.id)}>Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
