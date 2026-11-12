'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, LoadingState, StatusBadge } from '@/components/app/shared'
import { apiGet, apiSend, formatDateTime } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface TaskRow {
  id: string
  name: string
  description: string | null
  stageCode: string
  status: string
  priority: string
  responsibleRole: string
  assignedTo: { id: string; name: string } | null
  department: string | null
  unassignedReason: string | null
  slaDueAt: string | null
  approvalRequired: boolean
  approvalStatus: string | null
  completedAt: string | null
  application: { id: string; referenceNo: string; serviceName: string; businessName: string }
}

export default function TasksView({ scope: initialScope }: { scope?: string }) {
  const { user, navigate } = useAppStore()
  const qc = useQueryClient()
  const [scope, setScope] = useState(
    initialScope || (user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) ? 'all' : 'mine'),
  )
  const q = useQuery({ queryKey: ['tasks', scope], queryFn: () => apiGet<{ tasks: TaskRow[]; total: number }>(`/api/tasks?scope=${scope}`) })

  async function reassign(taskId: string, userId: string) {
    await apiSend('PATCH', `/api/tasks/${taskId}`, { action: 'assign', assignToUserId: userId })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  async function autoAssign(taskId: string) {
    await apiSend('PATCH', `/api/tasks/${taskId}`, { action: 'auto-assign' })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const staff = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiGet<{ employees: { id: string; userId: string; name: string; role: string; status: string; openTasks: number }[] }>('/api/admin/employees'),
    enabled: !!user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role),
  })

  const isManager = !!user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-56" aria-label="Task scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            {isManager && <SelectItem value="all">All tasks</SelectItem>}
            {isManager && <SelectItem value="unassigned">Unassigned queue</SelectItem>}
            <SelectItem value="mine">Assigned to me</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading && <LoadingState />}
      {q.data && q.data.tasks.length === 0 && <EmptyState title="No tasks in this view" hint="Tasks are generated automatically when applications are submitted." />}
      <div className="grid gap-3">
        {q.data?.tasks.map((t) => {
          const overdue = t.slaDueAt && new Date(t.slaDueAt) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status)
          return (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <button className="underline font-mono" onClick={() => navigate('application', t.application.id)}>{t.application.referenceNo}</button>
                      {t.application.serviceName}{t.application.businessName ? ` · ${t.application.businessName}` : ' · Individual taxpayer'}
                    </p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    {t.unassignedReason && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t.unassignedReason}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={t.status} />
                    {overdue && <span className="text-xs font-medium text-red-600 dark:text-red-400">Overdue</span>}
                    {t.slaDueAt && <span className="text-[11px] text-muted-foreground">SLA {formatDateTime(t.slaDueAt)}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.department || '—'}</span>
                  <span>·</span>
                  <span>{t.assignedTo ? `Assigned: ${t.assignedTo.name}` : 'Unassigned'}</span>
                  {t.approvalRequired && <><span>·</span><span>Needs CA approval{t.approvalStatus ? ` (${t.approvalStatus.replaceAll('_', ' ').toLowerCase()})` : ''}</span></>}
                </div>
                {isManager && scope === 'unassigned' && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => void autoAssign(t.id)}>Auto-assign (least workload)</Button>
                    <Select onValueChange={(v) => void reassign(t.id, v)}>
                      <SelectTrigger className="w-64 h-8 text-xs" aria-label="Assign to"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                      <SelectContent>
                        {staff.data?.employees.filter((e) => e.role === t.responsibleRole && e.status === 'ACTIVE').map((e) => (
                          <SelectItem key={e.userId} value={e.userId}>{e.name} ({e.openTasks} open)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
