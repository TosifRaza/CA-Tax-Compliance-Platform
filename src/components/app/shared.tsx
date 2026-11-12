'use client'

import { Badge } from '@/components/ui/badge'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-secondary text-secondary-foreground',
  SUBMITTED: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  CLIENT_INFO_REQUESTED: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  PROFESSIONAL_REVIEW: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200',
  GOVERNMENT_SUBMISSION: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  REWORK: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  COMPLETED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  CANCELLED: 'bg-muted text-muted-foreground',
  PENDING: 'bg-secondary text-secondary-foreground',
  APPROVED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  REQUIRED: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  OPTIONAL: 'bg-secondary text-secondary-foreground',
  NOT_APPLICABLE: 'bg-muted text-muted-foreground',
  PUBLISHED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  RETIRED: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status] || 'bg-secondary text-secondary-foreground'} border-0 ${className}`}>
      {statusLabel(status)}
    </Badge>
  )
}

const LABELS: Record<string, string> = {
  CLIENT_INFO_REQUESTED: 'Action needed from you',
  GOVERNMENT_SUBMISSION: 'Government filing stage',
  PROFESSIONAL_REVIEW: 'Professional review',
  APPROVED_BY_AUTHORITY: 'Approved (evidence recorded)',
  NOT_APPLICABLE: 'Not applicable',
  PENDING_REVIEW: 'Awaiting review',
  CHANGES_REQUESTED: 'Changes requested',
  IN_PROGRESS: 'In progress',
}

export function statusLabel(s: string): string {
  if (!s) return '—'
  return LABELS[s] || s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function DemoMark({ text = 'Demonstration data pending professional verification' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" title={text}>
      <AlertCircle className="h-3 w-3" aria-hidden />
      Demo
    </span>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 px-6 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground max-w-md">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
