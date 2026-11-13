'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCheck,
  Landmark,
  LogOut,
  X,
  LayoutDashboard,
  CalendarClock,
  FolderKanban,
  ListTodo,
  BarChart3,
  CheckSquare,
  Radio,
  Sliders,
  Database,
  ShieldCheck,
  Headphones,
  History,
  Sparkles,
  Building2,
  Lock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiGet, apiSend, formatDateTime } from '@/lib/client/api'
import { useAppStore, type ViewId } from '@/lib/client/store'
import { cn } from '@/lib/utils'

interface NotificationRow {
  id: string
  title: string
  body: string
  type: string | null
  readAt: string | null
  createdAt: string
}

interface NavItem {
  view: ViewId
  label: string
  roles: string[]
  icon: React.ComponentType<{ className?: string }>
  section: string
}

const NAV: NavItem[] = [
  // Core Operations
  { view: 'dashboard', label: 'Dashboard', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'], icon: LayoutDashboard, section: 'Overview' },
  { view: 'services', label: 'Browse Services', roles: ['CLIENT'], icon: Sparkles, section: 'Client Portal' },
  { view: 'businesses', label: 'Business Profile', roles: ['CLIENT'], icon: Building2, section: 'Client Portal' },
  { view: 'applications', label: 'My Applications', roles: ['CLIENT'], icon: FolderKanban, section: 'Client Portal' },
  { view: 'compliance', label: 'Compliance Calendar', roles: ['CLIENT', 'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'], icon: CalendarClock, section: 'Operations' },
  { view: 'applications', label: 'Applications', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER'], icon: FolderKanban, section: 'Operations' },

  // Execution & Team
  { view: 'tasks', label: 'My Tasks', roles: ['EMPLOYEE', 'CA_REVIEWER'], icon: ListTodo, section: 'Execution & Team' },
  { view: 'tasks', label: 'Team Tasks', roles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN'], icon: ListTodo, section: 'Execution & Team' },
  { view: 'reports', label: 'Team Workload', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'], icon: BarChart3, section: 'Execution & Team' },
  { view: 'reviews', label: 'Review Queue', roles: ['CA_REVIEWER'], icon: CheckSquare, section: 'Execution & Team' },

  // Tax & Regulatory
  { view: 'regulatory', label: 'Regulatory Updates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'], icon: Radio, section: 'Tax & Regulatory' },
  { view: 'services-admin', label: 'Service Configuration', roles: ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'], icon: Sliders, section: 'Tax & Regulatory' },
  { view: 'masters', label: 'Masters', roles: ['SUPER_ADMIN', 'ADMIN'], icon: Database, section: 'Tax & Regulatory' },
  { view: 'masters', label: 'Rule Masters', roles: ['KNOWLEDGE_MANAGER'], icon: Database, section: 'Tax & Regulatory' },

  // Governance & Security
  { view: 'consents', label: 'Consent Records', roles: ['CLIENT'], icon: ShieldCheck, section: 'Governance' },
  { view: 'consents', label: 'Client Consents', roles: ['SUPER_ADMIN', 'ADMIN'], icon: ShieldCheck, section: 'Governance' },
  { view: 'support', label: 'Support Desk', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'], icon: Headphones, section: 'Governance' },
  { view: 'audit', label: 'Audit Log', roles: ['SUPER_ADMIN', 'ADMIN'], icon: History, section: 'Governance' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, route, navigate, notificationsOpen, setNotificationsOpen, setUser } = useAppStore()
  const qc = useQueryClient()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ notifications: NotificationRow[]; unread: number }>('/api/notifications'),
    refetchInterval: 30000,
    enabled: !!user,
  })

  if (!user) return null
  const items = NAV.filter((n) => n.roles.includes(user.role))

  // Group items by section
  const sections = items.reduce((acc, item) => {
    if (!acc.includes(item.section)) acc.push(item.section)
    return acc
  }, [] as string[])

  async function logout() {
    await apiSend('POST', '/api/auth/logout')
    setUser(null)
    qc.clear()
    window.location.hash = '#/dashboard'
    window.location.reload()
  }

  async function markAllRead() {
    await apiSend('POST', '/api/notifications', { all: true })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  // Get user initials
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 dark:bg-slate-950 font-sans text-foreground antialiased">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
          {/* Left Brand Identity */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 text-muted-foreground"
              onClick={() => setMobileNavOpen((o) => !o)}
              aria-label="Toggle navigation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </Button>

            <button
              className="flex items-center gap-2.5 text-left group focus:outline-none"
              onClick={() => navigate('dashboard')}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-emerald-600 to-teal-700 text-white shadow-xs group-hover:opacity-95 transition-opacity">
                <Landmark className="h-4 w-4" aria-hidden />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">
                    Compliance<span className="text-emerald-600 dark:text-emerald-400">Desk</span>
                  </span>
                  <span className="rounded-md bg-emerald-100/80 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 tracking-wider">
                    CA SUITE
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Statutory Pill */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>AY 2026-27</span>
            </div>

            {/* Notifications Button */}
            <button
              className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              aria-label={`Notifications (${notifQuery.data?.unread ?? 0} unread)`}
            >
              <Bell className="h-4 w-4" aria-hidden />
              {(notifQuery.data?.unread ?? 0) > 0 && (
                <span className="absolute 1.5 top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in-75">
                  {notifQuery.data!.unread}
                </span>
              )}
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-border/80">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 font-semibold text-xs border border-emerald-300/60 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800 shrink-0">
                {initials}
              </div>
              <div className="hidden lg:block text-left mr-1">
                <p className="text-xs font-semibold leading-tight text-foreground truncate max-w-[140px]">{user.name}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{roleLabel(user.role)}</p>
              </div>
            </div>

            {/* Logout Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Notifications Drawer */}
      {notificationsOpen && (
        <div className="fixed right-3 top-16 z-50 w-92 max-w-[92vw] rounded-2xl border border-border/80 bg-background/98 backdrop-blur-md shadow-xl animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/80">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Notifications</p>
              {(notifQuery.data?.unread ?? 0) > 0 && (
                <Badge className="bg-emerald-600 text-white border-0 text-[10px] px-1.5 py-0 font-bold">
                  {notifQuery.data!.unread} New
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => void markAllRead()}>
                <CheckCheck className="h-3.5 w-3.5 mr-1" aria-hidden /> Read all
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setNotificationsOpen(false)} aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ScrollArea className="max-h-84">
            {(notifQuery.data?.notifications.length ?? 0) === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">No notifications right now.</p>
            )}
            {notifQuery.data?.notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  'block w-full text-left px-4 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/50 transition-colors',
                  !n.readAt && 'bg-emerald-500/5 dark:bg-emerald-950/20'
                )}
                onClick={() => {
                  void apiSend('POST', '/api/notifications', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
                  setNotificationsOpen(false)
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />}
                    {n.title}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}

      {/* Main Container: Sidebar + Content */}
      <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
        {/* Left Sidebar */}
        <aside
          className={cn(
            'w-60 shrink-0 border-r border-border/80 bg-background/95 backdrop-blur-xs md:block transition-all',
            mobileNavOpen ? 'fixed inset-y-14 left-0 z-40 block overflow-y-auto shadow-2xl bg-background' : 'hidden'
          )}
        >
          <div className="py-3 px-3 space-y-4">
            {sections.map((section) => {
              const sectionItems = items.filter((item) => item.section === section)
              if (sectionItems.length === 0) return null
              return (
                <div key={section} className="space-y-1">
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {section}
                  </p>
                  <div className="space-y-0.5">
                    {sectionItems.map((item) => {
                      const Icon = item.icon
                      const active = route.view === item.view
                      return (
                        <button
                          key={`${item.view}-${item.label}`}
                          className={cn(
                            'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all text-left',
                            active
                              ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-semibold border-l-3 border-emerald-600 shadow-2xs'
                              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                          )}
                          onClick={() => {
                            navigate(item.view)
                            setMobileNavOpen(false)
                          }}
                        >
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0 transition-colors',
                              active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/80 group-hover:text-foreground'
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-7 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-background/80 px-4 py-2.5 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-2">
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
        <span>
          Compliance Desk &middot; CA Practice &amp; Statutory Compliance Suite &middot; Demonstration environment with client confidentiality safeguards.
        </span>
      </footer>
    </div>
  )
}

export function roleLabel(role: string): string {
  return (
    {
      SUPER_ADMIN: 'Super Administrator',
      ADMIN: 'Administrator',
      MANAGER: 'Department Manager',
      EMPLOYEE: 'Executive / Staff',
      CA_REVIEWER: 'Chartered Accountant',
      CLIENT: 'Client Portal',
      KNOWLEDGE_MANAGER: 'Knowledge & Rule Manager',
    }[role] || role
  )
}
