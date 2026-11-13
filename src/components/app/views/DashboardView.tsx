'use client'

import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  FileText,
  FolderKanban,
  Inbox,
  Wallet,
  FileCheck,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronRight,
  ListTodo,
  Activity,
  CheckCircle2,
  Sliders,
  Shield,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    READY: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    AT_RISK: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    BLOCKED: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  }[readiness.status]
  const label = { READY: 'Ready', AT_RISK: 'At risk', BLOCKED: 'Blocked' }[readiness.status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${conf}`}
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
    overdueObligations?: number
    canManageUsers: boolean
  }
}

export default function DashboardView() {
  const { user, navigate } = useAppStore()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<ClientDash & StaffDash>('/api/dashboard') })

  if (dash.isLoading) return <LoadingState label="Loading practice intelligence…" />
  if (dash.isError) return <p className="text-sm text-muted-foreground p-6">Could not load dashboard: {(dash.error as Error).message}</p>
  const data = dash.data!
  if (!user) return null

  // ---------------- CLIENT DASHBOARD ----------------
  if (data.role === 'CLIENT') {
    const c = data.client
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1 tracking-wider uppercase">
              Client Portal &middot; Self Service
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">Welcome back, {user.name}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Monitor your ongoing tax filings, pending requirements, and deadlines.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate('services')}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Start New Filing
            </Button>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Applications" value={c.activeApplications} icon={FolderKanban} variant="blue" hint="In progress with your CA team" />
          <StatCard label="Action Needed From You" value={c.pendingActions} icon={AlertTriangle} variant="amber" hint="Information requests waiting for reply" />
          <StatCard label="Pending Payments" value={c.pendingPayments} icon={Wallet} variant="purple" hint="Quotations waiting for checkout" />
          <StatCard label="Completed Cases" value={c.completedApplications} icon={CheckCircle2} variant="emerald" hint="Completed with official filings" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" /> Missing or Correction Needed Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {c.missingDocuments.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-emerald-600/80" />
                  All required documents are verified and on track.
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {c.missingDocuments.map((m) => (
                    <li key={m.applicationId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold font-mono text-foreground">{m.referenceNo}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{m.count} document(s) pending: {m.names.join(', ')}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('application', m.applicationId)}>
                        Upload &rarr;
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-emerald-600" /> Upcoming Statutory Deadlines
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('compliance')}>
                View calendar
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {c.upcomingDeadlines.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <CalendarClock className="h-7 w-7 mx-auto mb-2 text-muted-foreground/60" />
                  No statutory deadlines in the next 45 days.
                </div>
              ) : (
                <ul className="space-y-2">
                  {c.upcomingDeadlines.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{d.title} {d.demoMarked && <DemoMark />}</p>
                        <p className="text-[11px] text-muted-foreground">Due {formatDate(d.dueDate)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
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
      </div>
    )
  }

  // ---------------- EMPLOYEE / CA REVIEWER DASHBOARD ----------------
  if (data.employee) {
    const e = data.employee
    const isCa = data.role === 'CA_REVIEWER'
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1 tracking-wider uppercase">
              {isCa ? 'Chartered Accountant &middot; Practice Review' : 'Executive Desk &middot; Operational Casework'}
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{isCa ? 'CA Review Queue' : 'My Execution Worklist'}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Your assigned workflow stages, review checkpoints, and SLA deadlines.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate(isCa ? 'reviews' : 'tasks')}>
              {isCa ? 'Open Review Queue' : 'Open Assigned Tasks'} &rarr;
            </Button>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={isCa ? 'My Review Queue' : 'Assigned Tasks'} value={e.myTasks} icon={isCa ? ShieldCheck : ListTodo} variant="purple" hint={isCa ? 'Awaiting your professional sign-off' : 'Active workflow tasks assigned to you'} />
          <StatCard label="Due Today (SLA)" value={e.dueToday} icon={CalendarClock} variant="amber" hint="Targeted for resolution today" />
          <StatCard label="Past SLA Target" value={e.overdue} icon={AlertTriangle} variant="red" hint="Immediate attention required" />
          <StatCard label="Awaiting Client Input" value={e.waitingClient} icon={Inbox} variant="blue" hint="Info requests dispatched to client" />
          <StatCard label="Pending CA Review" value={e.pendingInternal} icon={Shield} variant="purple" hint="Cases in professional review gate" />
          <StatCard label="Completed (7 Days)" value={e.recentlyCompleted} icon={CheckCircle2} variant="emerald" hint="Successfully finished tasks" />
        </div>
      </div>
    )
  }

  // ---------------- ADMIN / SUPER ADMIN DASHBOARD ----------------
  const a = data.admin
  if (a) {
    const totalPipelineApps = a.appsByStatus.reduce((acc, s) => acc + s.count, 0)

    return (
      <div className="space-y-6">
        {/* Executive Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 mb-1.5 tracking-wider uppercase border border-emerald-300/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operations Command Center &middot; Live Practice
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground">
              Firm Operations Dashboard
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Real-time monitoring of taxpayer workflows, SLA tracking, regulatory updates, and team capacity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border/80 shadow-2xs hover:bg-muted"
              onClick={() => navigate('tasks')}
            >
              <ListTodo className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /> Team Tasks
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border/80 shadow-2xs hover:bg-muted"
              onClick={() => navigate('compliance')}
            >
              <CalendarClock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /> Compliance Desk
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              onClick={() => navigate('services-admin')}
            >
              <Sliders className="h-3.5 w-3.5 mr-1.5" /> Service Masters
            </Button>
          </div>
        </div>

        {/* Top 4 High-Density Key Metrics */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Doc Verification"
            value={a.pendingDocVerification}
            icon={FileCheck}
            variant="blue"
            badge="Stage 2"
            hint="Tasks in document verification gate"
          />
          <StatCard
            label="Unassigned Queue"
            value={a.unassignedTasks}
            icon={Inbox}
            variant="amber"
            badge="Queue"
            hint="Awaiting manager auto/manual allocation"
          />
          <StatCard
            label="Overdue SLA Tasks"
            value={a.overdueTasks}
            icon={AlertTriangle}
            variant="red"
            badge="SLA Breach"
            hint="Active tasks past internal resolution target"
          />
          <StatCard
            label="Pending CA Approvals"
            value={a.pendingApprovals}
            icon={ShieldCheck}
            variant="purple"
            badge="CA Gate"
            hint="Sign-off required before government filing"
          />
        </div>

        {/* Practice Health Strip (Quick Stats Row) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-2xs">
          <div className="flex items-center gap-2.5 px-2">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-700 shrink-0">
              <FolderKanban className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Services In Draft</p>
              <p className="text-sm font-bold text-foreground">{a.servicesNeedingConfig}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-2 border-l border-border/60">
            <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-700 shrink-0">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Config Awaiting CA</p>
              <p className="text-sm font-bold text-foreground">{a.pendingConfigApprovals}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-2 border-l border-border/60">
            <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-700 shrink-0">
              <CalendarClock className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overdue Deadlines</p>
              <p className="text-sm font-bold text-foreground">{a.overdueObligations ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-2 border-l border-border/60">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-700 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Official Portals</p>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">GSTN &middot; ITD &middot; MCA</p>
            </div>
          </div>
        </div>

        {/* Main 2-Column Split */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left Column: Applications Pipeline */}
          <Card className="rounded-xl border border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-emerald-600" />
                Active Casework Pipeline
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground">{totalPipelineApps} total</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs font-medium" onClick={() => navigate('applications')}>
                  All Cases &rarr;
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {a.appsByStatus.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mx-auto">
                    <FolderKanban className="h-6 w-6" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-foreground">No applications currently in pipeline</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Applications will appear here as taxpayers submit registrations or return filings.
                    </p>
                  </div>
                  <div className="pt-1">
                    <Button size="sm" variant="outline" className="h-8 text-xs font-medium" onClick={() => navigate('applications')}>
                      Open Applications Registry
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {a.appsByStatus.map((s) => (
                    <li
                      key={s.status}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3.5 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => navigate('applications')}
                    >
                      <StatusBadge status={s.status} />
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold tabular-nums text-foreground">{s.count}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Deadlines & Config Governance */}
          <Card className="rounded-xl border border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-emerald-600" />
                Statutory Deadlines &amp; Governance
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs font-medium" onClick={() => navigate('compliance')}>
                Calendar &rarr;
              </Button>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Quick Config Link Boxes */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex flex-col text-left p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors group"
                  onClick={() => navigate('services-admin')}
                >
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Services In Draft</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-lg font-bold text-foreground tabular-nums">{a.servicesNeedingConfig}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                <button
                  className="flex flex-col text-left p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors group"
                  onClick={() => navigate('services-admin')}
                >
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Awaiting CA Review</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-lg font-bold text-foreground tabular-nums">{a.pendingConfigApprovals}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>

              {/* Deadlines list */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-emerald-600" />
                  Upcoming statutory deadlines (30 Days)
                </p>

                {a.upcomingDeadlines.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center rounded-lg border border-dashed">
                    No statutory deadlines in this 30-day window.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {a.upcomingDeadlines.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-lg border border-border/60 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => navigate('compliance')}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground truncate flex items-center gap-1.5">
                            {d.title} {d.demoMarked && <DemoMark />}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <ReadinessBadge readiness={d.readiness} />
                            <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap tabular-nums">
                              {formatDate(d.dueDate)}
                            </span>
                          </div>
                        </div>
                        {d.readiness && d.readiness.reasons.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">
                            {d.readiness.reasons.join(' &middot; ')}
                          </p>
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
