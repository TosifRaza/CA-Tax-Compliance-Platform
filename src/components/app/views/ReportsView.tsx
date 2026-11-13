'use client'

import { useQuery } from '@tanstack/react-query'
import { History, Users, AlertTriangle, Inbox, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState, LoadingState, StatCard, StatusBadge, statusLabel } from '@/components/app/shared'
import { apiGet, formatDateTime } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

// Admin workload & reassignment overview (gap R-09). All figures derive from
// stored tasks; the reassignment history is the recorded TaskHistory trail.

interface WorkloadRow {
  userId: string; name: string; email: string; role: string; status: string
  department: string | null; designation: string | null; availability: string; active: boolean
  openTasks: number; overdue: number; dueToday: number; completedLast7d: number
  capacity: number; utilizationPct: number
}
interface WorkloadResponse {
  workload: WorkloadRow[]
  departments: { id: string; code: string; name: string; openTasks: number }[]
  unassignedTotal: number
  reassignmentHistory: { id: string; action: string; taskName: string; referenceNo: string | null; applicationId: string | null; actorName: string | null; remarks: string | null; createdAt: string }[]
}

export default function ReportsView() {
  const { navigate } = useAppStore()
  const q = useQuery({ queryKey: ['workload-report'], queryFn: () => apiGet<WorkloadResponse>('/api/reports/workload') })

  if (q.isLoading) return <LoadingState />
  if (q.isError) return <p className="text-sm text-muted-foreground">Could not load the workload report: {(q.error as Error).message}</p>
  const data = q.data!

  const totalOpen = data.workload.reduce((acc, w) => acc + w.openTasks, 0)
  const totalOverdue = data.workload.reduce((acc, w) => acc + w.overdue, 0)
  const overloaded = data.workload.filter((w) => w.utilizationPct >= 100).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Team workload</h1>
        <p className="text-sm text-muted-foreground">Open work per employee and department, plus the recorded assignment history. Use Team Tasks to reassign work.</p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Assigned Tasks" value={totalOpen} icon={ListTodo} variant="blue" hint="Tasks active across all staff" />
        <StatCard label="Overdue Across Team" value={totalOverdue} icon={AlertTriangle} variant="red" hint="Past internal SLA target" />
        <StatCard label="Unassigned Queue" value={data.unassignedTotal} icon={Inbox} variant="amber" hint="Waiting for authorized assignment" />
        <StatCard label="At / Over Capacity" value={overloaded} icon={Users} variant="purple" hint="Employees at 100%+ open task cap" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" aria-hidden /> By employee</CardTitle></CardHeader>
        <CardContent>
          {data.workload.length === 0 ? (
            <EmptyState title="No staff records yet" hint="Add staff members under Masters → Employees." />
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>Due today</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead>Done (7d)</TableHead>
                    <TableHead className="w-40">Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.workload.map((w) => (
                    <TableRow key={w.userId} className={!w.active ? 'opacity-60' : ''}>
                      <TableCell>
                        <span className="font-medium">{w.name}</span>
                        <span className="block text-xs text-muted-foreground">{w.email}{w.designation ? ` · ${w.designation}` : ''}</span>
                      </TableCell>
                      <TableCell className="text-xs">{w.department || '—'}</TableCell>
                      <TableCell className="tabular-nums">{w.openTasks}/{w.capacity}</TableCell>
                      <TableCell className="tabular-nums">{w.dueToday}</TableCell>
                      <TableCell className={`tabular-nums ${w.overdue > 0 ? 'text-red-700 dark:text-red-400 font-medium' : ''}`}>{w.overdue}</TableCell>
                      <TableCell className="tabular-nums">{w.completedLast7d}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden" role="presentation">
                            <div
                              className={`h-full rounded-full ${w.utilizationPct >= 100 ? 'bg-red-600' : w.utilizationPct >= 70 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                              style={{ width: `${Math.min(100, w.utilizationPct)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right">{w.utilizationPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit border-0 bg-secondary text-secondary-foreground">{statusLabel(w.role)}</Badge>
                          {w.availability !== 'AVAILABLE' && <Badge variant="outline" className="w-fit border-0 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{statusLabel(w.availability)}</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">By department</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.departments.map((d) => (
            <div key={d.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">{d.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{d.code}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{d.openTasks}</p>
              <p className="text-xs text-muted-foreground">open tasks</p>
            </div>
          ))}
          {data.departments.length === 0 && <p className="text-sm text-muted-foreground">No active departments.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> Assignment history (latest 50)</CardTitle></CardHeader>
        <CardContent>
          {data.reassignmentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignment or reassignment events recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.reassignmentHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {h.taskName} {h.referenceNo && (
                        <button className="font-mono text-xs text-emerald-800 dark:text-emerald-300 underline" onClick={() => navigate('application', h.applicationId!)}>{h.referenceNo}</button>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{h.actorName ? `by ${h.actorName}` : ''}{h.remarks ? ` — ${h.remarks}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={h.action === 'REASSIGNED' ? 'IN_PROGRESS' : 'SUBMITTED'} className="hidden" />
                    <Badge variant="outline" className="border-0 bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200">{h.action === 'REASSIGNED' ? 'Reassigned' : 'Assigned'}</Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(h.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
