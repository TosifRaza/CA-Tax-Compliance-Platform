'use client'

import { Badge } from '@/components/ui/badge'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  SUBMITTED: 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  CLIENT_INFO_REQUESTED: 'bg-orange-50 text-orange-800 border-orange-200/60 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
  PROFESSIONAL_REVIEW: 'bg-purple-50 text-purple-800 border-purple-200/60 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
  GOVERNMENT_SUBMISSION: 'bg-teal-50 text-teal-800 border-teal-200/60 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800',
  REWORK: 'bg-rose-50 text-rose-800 border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  PENDING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  REQUIRED: 'bg-amber-50 text-amber-800 border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  OPTIONAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  NOT_APPLICABLE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  PUBLISHED: 'bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  RETIRED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border tracking-wide transition-colors',
        STATUS_COLORS[status] || 'bg-slate-100 text-slate-700 border-slate-200',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80 shrink-0" />
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
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-300/40 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 tracking-wide uppercase"
      title={text}
    >
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
      Demo
    </span>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground" role="status" aria-live="polite">
      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
      <span className="text-xs font-medium tracking-wide">{label}</span>
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground/80 shadow-2xs">
        <Inbox className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 shadow-2xs" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  variant = 'default',
  badge,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'amber' | 'emerald' | 'red' | 'purple' | 'blue'
  badge?: string
}) {
  const colorMap = {
    default: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
    amber: 'text-amber-700 bg-amber-100/90 dark:bg-amber-950/60 dark:text-amber-300',
    emerald: 'text-emerald-700 bg-emerald-100/90 dark:bg-emerald-950/60 dark:text-emerald-300',
    red: 'text-rose-700 bg-rose-100/90 dark:bg-rose-950/60 dark:text-rose-300',
    purple: 'text-purple-700 bg-purple-100/90 dark:bg-purple-950/60 dark:text-purple-300',
    blue: 'text-sky-700 bg-sky-100/90 dark:bg-sky-950/60 dark:text-sky-300',
  }

  const borderMap = {
    default: 'border-slate-200/90 hover:border-slate-300 dark:border-slate-800',
    amber: 'border-amber-200/80 hover:border-amber-300 dark:border-amber-900/50',
    emerald: 'border-emerald-200/80 hover:border-emerald-300 dark:border-emerald-900/50',
    red: 'border-rose-200/80 hover:border-rose-300 dark:border-rose-900/50',
    purple: 'border-purple-200/80 hover:border-purple-300 dark:border-purple-900/50',
    blue: 'border-sky-200/80 hover:border-sky-300 dark:border-sky-900/50',
  }

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-sm',
      borderMap[variant]
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        {Icon && (
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', colorMap[variant])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</span>
        {badge && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground/90 truncate">{hint}</p>}
    </div>
  )
}
