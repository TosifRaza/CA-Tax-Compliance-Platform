'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarClock, FileText, FolderKanban, Inbox, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard, StatusBadge, DemoMark, LoadingState, EmptyState } from '@/components/app/shared'
import { apiGet, formatDate } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface ClientDash {
  role: string
  client: {
    activeApplications: number
    pendingActions: number
    missingDocuments: { applicationId: string; referenceNo: string; count: number; names: string[] }[]
    pendingPayments: number
    completedApplications: number
    upcomingDeadlines: { id: string; title: string; dueDate: string; status: string; demoMarked: boolean; readiness?: Readiness }[]
  }
}
type Readiness = { status: 'READY' | 'AT_RISK' | 'BLOCKED' | 'NO_CASE'; reasons: string[] }

function ReadinessBadge({ readiness }: { readiness?: Readiness }) {
  if (!readiness || readiness.status === 'NO_CASE') return null
  const conf = {
    READY: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    AT_RISK: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    BLOCKED: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  }[readiness.status]
  const label = { READY: 'Ready', AT_RISK: 'At risk', BLOCKED: 'Blocked' }[readiness.status]
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${conf}`}
      title={readiness.reasons.length > 0 ? readiness.reasons.join('; ') : 'No open blockers for this deadline'}
    >
      {label}
    </span>
  )
}
interface StaffDash {
  role: string
  employee?: { myTasks: number; dueToday: number; overdue: number; waitingClient: number; pendingInternal: number; recentlyCompleted: number }
  admin?: {
    appsByStatus: { status: string; count: number }[]
    pendingDocVerification: number
    unassignedTasks: number
    overdueTasks: number
    pendingApprovals: number
    pendingConfigApprovals: number
    upcomingDeadlines: { id: string; title: string; dueDate: string; status: string; demoMarked: boolean; business: { legalName: string } | null; readiness?: Readiness }[]
    servicesNeedingConfig: number
    canManageUsers: boolean
  }
}

export default function DashboardView() {
  const { user, navigate } = useAppStore()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<ClientDash & StaffDash>('/api/dashboard') })

  if (dash.isLoading) return <LoadingState />
  if (dash.isError) return <p className="text-sm text-muted-foreground">Could not load dashboard: {(dash.error as Error).message}</p>
  const data = dash.data!
  if (!user) return null

  if (data.role === 'CLIENT') {
    const c = data.client
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {user.name}</h1>
          <p className="text-sm text-muted-foreground">Here is where your applications and obligations stand.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active applications" value={c.activeApplications} />
          <StatCard label="Actions needed from you" value={c.pendingActions} hint="Information requests waiting for your reply" />
          <StatCard label="Pending payments" value={c.pendingPayments} />
          <StatCard label="Completed" value={c.completedApplications} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Missing or rejected documents</CardTitle></CardHeader>
          <CardContent>
            {c.missingDocuments.length === 0
              ? <p className="text-sm text-muted-foreground">No required documents are pending. Good going.</p>
              : (
                <ul className="space-y-2">
                  {c.missingDocuments.map((m) => (
                    <li key={m.applicationId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{m.referenceNo}</p>
                        <p className="text-xs text-muted-foreground">{m.count} required document(s) pending — e.g. {m.names.join(', ')}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate('application', m.applicationId)}>Open</Button>
                    </li>
                  ))}
                </ul>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Upcoming deadlines</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('compliance')}>View all</Button>
          </CardHeader>
          <CardContent>
            {c.upcomingDeadlines.length === 0
              ? <p className="text-sm text-muted-foreground">No statutory deadlines in the next 45 days.</p>
              : (
                <ul className="space-y-2">
                  {c.upcomingDeadlines.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <div>
                          <p className="text-sm font-medium">{d.title} {d.demoMarked && <DemoMark />}</p>
                          <p className="text-xs text-muted-foreground">Due {formatDate(d.dueDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ReadinessBadge readiness={d.readiness} />
                        <StatusBadge status={d.status} />
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

  if (data.employee) {
    const e = data.employee
    const isCa = data.role === 'CA_REVIEWER'
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">My work</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={isCa ? 'My review queue' : 'My assigned tasks'} value={e.myTasks} hint={isCa ? 'Awaiting your professional decision' : 'Open tasks assigned to you'} />
          <StatCard label="Due today" value={e.dueToday} />
          <StatCard label="Overdue" value={e.overdue} />
          <StatCard label="Waiting for client" value={e.waitingClient} />
          <StatCard label="Pending internal approval" value={e.pendingInternal} hint="Applications awaiting professional review" />
          <StatCard label="Completed (7 days)" value={e.recentlyCompleted} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate(isCa ? 'reviews' : 'tasks')}>{isCa ? 'Open review queue' : 'Open my tasks'}</Button>
        </div>
      </div>
    )
  }

  const a = data.admin
  if (a) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Operations dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pending document verification" value={a.pendingDocVerification} hint="Tasks in the document verification stage" />
          <StatCard label="Unassigned work" value={a.unassignedTasks} hint="Tasks in the authorized unassigned queue" />
          <StatCard label="Overdue tasks" value={a.overdueTasks} hint="Past their SLA target" />
          <StatCard label="Pending professional approvals" value={a.pendingApprovals} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Applications by status</CardTitle></CardHeader>
            <CardContent>
              {a.appsByStatus.length === 0
                ? <EmptyState title="No applications yet" hint="Applications appear here as clients submit them." />
                : (
                  <ul className="space-y-1.5">
                    {a.appsByStatus.map((s) => (
                      <li key={s.status} className="flex items-center justify-between rounded border px-3 py-2">
                        <StatusBadge status={s.status} />
                        <span className="font-medium tabular-nums">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Configuration &amp; compliance</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm flex items-center gap-2"><FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden /> Services still in draft configuration</span>
                <span className="font-medium tabular-nums">{a.servicesNeedingConfig}</span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" aria-hidden /> Config versions awaiting CA review</span>
                <span className="font-medium tabular-nums">{a.pendingConfigApprovals}</span>
              </div>
              <div>
                <p className="mb-2 mt-4 text-sm font-medium flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden /> Upcoming compliance deadlines (30 days)</p>
                {a.upcomingDeadlines.length === 0
                  ? <p className="text-sm text-muted-foreground">None in this window.</p>
                  : (
                    <ul className="space-y-1.5">
                      {a.upcomingDeadlines.map((d) => (
                        <li key={d.id} className="rounded border px-3 py-2">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">{d.title} {d.demoMarked && <DemoMark />}</span>
                            <span className="flex items-center gap-2 shrink-0">
                              <ReadinessBadge readiness={d.readiness} />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(d.dueDate)}</span>
                            </span>
                          </div>
                          {d.readiness && d.readiness.reasons.length > 0 && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{d.readiness.reasons.join(' · ')}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  return <EmptyState title="Dashboard unavailable" />
}

export function QuickLinks() {
  const { navigate } = useAppStore()
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate('services')}><Inbox className="h-4 w-4" aria-hidden /> Services</Button>
      <Button variant="outline" size="sm" onClick={() => navigate('compliance')}><Wallet className="h-4 w-4" aria-hidden /> Compliance</Button>
    </div>
  )
}
