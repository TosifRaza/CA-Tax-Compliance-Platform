'use client'

import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiGet } from '@/lib/client/api'
import { useAppStore, useHashSync } from '@/lib/client/store'
import { LoadingState } from '@/components/app/shared'
import LoginScreen from '@/components/app/LoginScreen'
import AppShell from '@/components/app/AppShell'
import DashboardView from '@/components/app/views/DashboardView'
import ServicesView from '@/components/app/views/ServicesView'
import ApplyWizardView from '@/components/app/views/ApplyWizardView'
import ApplicationsView from '@/components/app/views/ApplicationsView'
import ApplicationDetailView from '@/components/app/views/ApplicationDetailView'
import TasksView from '@/components/app/views/TasksView'
import ReviewsView from '@/components/app/views/ReviewsView'
import BusinessesView from '@/components/app/views/BusinessesView'
import ComplianceView from '@/components/app/views/ComplianceView'
import SupportView from '@/components/app/views/SupportView'
import AdminMastersView from '@/components/app/views/AdminMastersView'
import AdminServicesView from '@/components/app/views/AdminServicesView'
import AuditView from '@/components/app/views/AuditView'
import ReportsView from '@/components/app/views/ReportsView'
import RegulatoryView from '@/components/app/views/RegulatoryView'
import ConsentsView from '@/components/app/views/ConsentsView'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function AppBody() {
  const { user, loadingSession, route, setUser, setLoadingSession } = useAppStore()
  useHashSync()

  useEffect(() => {
    apiGet<{ user: { id: string; email: string; name: string; role: string } | null }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoadingSession(false))
  }, [])

  if (loadingSession) {
    return <div className="min-h-screen flex items-center justify-center bg-muted/30"><LoadingState label="Starting your workspace…" /></div>
  }
  if (!user) return <LoginScreen />

  const { view, id } = route
  let content: React.ReactNode
  switch (view) {
    case 'services': content = <ServicesView />; break
    case 'apply': content = id ? <ApplyWizardView serviceId={id} /> : <ServicesView />; break
    case 'applications': content = <ApplicationsView />; break
    case 'application': content = id ? <ApplicationDetailView appId={id} /> : <ApplicationsView />; break
    case 'tasks': content = <TasksView />; break
    case 'reviews': content = <ReviewsView />; break
    case 'businesses': content = <BusinessesView />; break
    case 'compliance': content = <ComplianceView />; break
    case 'support': content = <SupportView />; break
    case 'masters': content = <AdminMastersView />; break
    case 'services-admin': content = <AdminServicesView />; break
    case 'audit': content = <AuditView />; break
    case 'reports': content = <ReportsView />; break
    case 'regulatory': content = <RegulatoryView />; break
    case 'consents': content = <ConsentsView />; break
    case 'dashboard':
    default: content = <DashboardView />
  }

  return <AppShell>{content}</AppShell>
}

export default function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppBody />
    </QueryClientProvider>
  )
}
