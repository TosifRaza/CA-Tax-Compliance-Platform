'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Landmark, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DemoMark, LoadingState, EmptyState } from '@/components/app/shared'
import { apiGet, formatInr } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface CatalogueService {
  id: string
  code: string
  clientName: string
  description: string | null
  category: { code: string; name: string }
  authority: string | null
  officialUrl: string | null
  status: string
  verificationStatus: string
  demoMarked: boolean
  currentVersion: {
    id: string
    version: string
    status: string
    pricing: { professionalFee: number; govtFee: number; govtFeeNote?: string; demoMarked?: boolean } | null
  } | null
}

export default function ServicesView() {
  const { navigate } = useAppStore()
  const q = useQuery({ queryKey: ['services'], queryFn: () => apiGet<{ services: CatalogueService[] }>('/api/services') })

  if (q.isLoading) return <LoadingState />
  if (q.isError) return <p className="text-sm text-muted-foreground">Could not load services.</p>

  const services = q.data!.services
  const byCategory = new Map<string, CatalogueService[]>()
  for (const s of services) {
    if (!byCategory.has(s.category.name)) byCategory.set(s.category.name, [])
    byCategory.get(s.category.name)!.push(s)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Services</h1>
        <p className="text-sm text-muted-foreground">Choose a service to start a guided application for one of your businesses.</p>
      </div>
      {services.length === 0 && <EmptyState title="No services are open right now" hint="Your service provider is preparing service configurations. Please check back later." />}
      {[...byCategory.entries()].map(([cat, list]) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{cat}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => (
              <Card key={s.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden />{s.clientName}</span>
                    {s.demoMarked && <DemoMark />}
                  </CardTitle>
                  {s.authority && <CardDescription className="text-xs">Authority: {s.authority}</CardDescription>}
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">{s.description}</p>
                  {s.currentVersion?.pricing && (
                    <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                      <div className="flex justify-between"><span>Professional charge</span><span className="font-medium">{formatInr(s.currentVersion.pricing.professionalFee)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Government fee</span><span>{s.currentVersion.pricing.govtFee === 0 ? 'Nil' : formatInr(s.currentVersion.pricing.govtFee)}</span></div>
                    </div>
                  )}
                  {s.demoMarked && (
                    <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden /> Demonstration configuration — fee values and requirements pending CA verification.</p>
                  )}
                  <Button className="w-full" disabled={s.status !== 'PUBLISHED' || !s.currentVersion} onClick={() => navigate('apply', s.id)}>
                    Apply <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// Compact staff-facing service list (admins see the full workspace separately).
export function StaffServiceList() {
  const q = useQuery({ queryKey: ['services'], queryFn: () => apiGet<{ services: CatalogueService[] }>('/api/services') })
  if (q.isLoading) return <LoadingState />
  return (
    <ul className="space-y-1.5">
      {q.data?.services.map((s) => (
        <li key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
          <span>{s.clientName} <Badge variant="outline" className="ml-1">{s.code}</Badge></span>
          <Badge variant="outline">{s.status}</Badge>
        </li>
      ))}
    </ul>
  )
}
