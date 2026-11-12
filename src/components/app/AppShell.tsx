'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Landmark, LogOut, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { apiGet, apiSend, formatDateTime } from '@/lib/client/api'
import { useAppStore, type ViewId } from '@/lib/client/store'
import { cn } from '@/lib/utils'

interface NotificationRow { id: string; title: string; body: string; type: string | null; readAt: string | null; createdAt: string }

const NAV: { view: ViewId; label: string; roles: string[] }[] = [
  { view: 'dashboard', label: 'Dashboard', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'] },
  { view: 'services', label: 'Services', roles: ['CLIENT'] },
  { view: 'businesses', label: 'Your Business Details', roles: ['CLIENT'] },
  { view: 'applications', label: 'My Applications', roles: ['CLIENT'] },
  { view: 'compliance', label: 'Compliance Calendar', roles: ['CLIENT', 'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { view: 'applications', label: 'Applications', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER'] },
  { view: 'tasks', label: 'My Tasks', roles: ['EMPLOYEE', 'CA_REVIEWER'] },
  { view: 'tasks', label: 'Team Tasks', roles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN'] },
  { view: 'reports', label: 'Team Workload', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { view: 'reviews', label: 'Review Queue', roles: ['CA_REVIEWER'] },
  { view: 'regulatory', label: 'Regulatory Updates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'] },
  { view: 'services-admin', label: 'Service Configuration', roles: ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'] },
  { view: 'masters', label: 'Masters', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { view: 'masters', label: 'Rule Masters', roles: ['KNOWLEDGE_MANAGER'] },
  { view: 'consents', label: 'Consent Records', roles: ['CLIENT'] },
  { view: 'consents', label: 'Client Consents', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { view: 'support', label: 'Support', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'] },
  { view: 'audit', label: 'Audit Log', roles: ['SUPER_ADMIN', 'ADMIN'] },
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

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNavOpen((o) => !o)} aria-label="Toggle navigation">
            <span className="sr-only">Menu</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </Button>
          <button className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-400" onClick={() => navigate('dashboard')}>
            <Landmark className="h-5 w-5" aria-hidden /> Compliance Desk
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-full p-2 hover:bg-muted" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label={`Notifications (${notifQuery.data?.unread ?? 0} unread)`}>
              <Bell className="h-5 w-5" aria-hidden />
              {(notifQuery.data?.unread ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-semibold text-white">
                  {notifQuery.data!.unread}
                </span>
              )}
            </button>
            <div className="hidden sm:block text-right mr-1">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      {notificationsOpen && (
        <div className="fixed right-2 top-16 z-50 w-90 max-w-[92vw] rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="font-medium text-sm">Notifications</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => void markAllRead()}><CheckCheck className="h-4 w-4" aria-hidden /> Mark all read</Button>
              <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <ScrollArea className="max-h-80">
            {(notifQuery.data?.notifications.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>}
            {notifQuery.data?.notifications.map((n) => (
              <button key={n.id} className={cn('block w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted/60', !n.readAt && 'bg-emerald-50/60 dark:bg-emerald-950/20')}
                onClick={() => { void apiSend('POST', '/api/notifications', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); setNotificationsOpen(false) }}>
                <p className="text-sm font-medium flex items-center gap-2">{n.title} {!n.readAt && <Badge className="bg-emerald-700 text-white border-0">New</Badge>}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}

      <div className="flex flex-1">
        <aside className={cn('w-56 shrink-0 border-r bg-background md:block', mobileNavOpen ? 'fixed inset-y-14 left-0 z-40 block overflow-y-auto shadow-lg' : 'hidden')}>
          <nav className="p-2 space-y-0.5">
            {items.map((item, i) => (
              <div key={`${item.view}-${i}`}>
                {(i === 0 || items[i - 1].view !== item.view) && i > 0 && <Separator className="my-2" />}
                <button
                  className={cn('w-full rounded-md px-3 py-2 text-sm text-left hover:bg-muted', route.view === item.view ? 'bg-emerald-100/70 text-emerald-900 font-medium dark:bg-emerald-950/40 dark:text-emerald-200' : 'text-foreground/80')}
                  onClick={() => { navigate(item.view); setMobileNavOpen(false) }}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>

      <footer className="mt-auto border-t bg-background px-4 py-3 text-center text-xs text-muted-foreground">
        Demonstration environment — service configurations and fee values are unverified examples pending professional CA review. Internal processing status never represents an official government decision.
      </footer>
    </div>
  )
}

export function roleLabel(role: string): string {
  return {
    SUPER_ADMIN: 'Super Administrator',
    ADMIN: 'Administrator',
    MANAGER: 'Department Manager',
    EMPLOYEE: 'Executive',
    CA_REVIEWER: 'CA / Compliance Reviewer',
    CLIENT: 'Client',
  }[role] || role
}
