'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { validateAnswers, visibleSections } from '@/lib/rules'
import type { Answers, FieldValidation, FormField, FormSchema, FieldType } from '@/lib/types'

interface DynamicFormProps {
  schema: FormSchema
  answers: Answers
  errors: Record<string, string>
  onAnswers: (updated: Answers) => void
  onErrors?: (errors: Record<string, string>) => void
  disabled?: boolean
}

// Metadata-driven form renderer. Visibility & required-state come from the
// declarative rule engine (shared with the server) — identical behavior client
// and server side. No arbitrary script execution is possible through rules.
export default function DynamicForm({ schema, answers, errors, onAnswers, onErrors, disabled }: DynamicFormProps) {
  const sections = useMemo(() => visibleSections(schema, answers), [schema, answers])

  function setValue(code: string, value: string | number | boolean | string[] | null) {
    const updated: Answers = { ...answers, [code]: value }
    onAnswers(updated)
    if (onErrors) {
      const next = { ...errors }
      delete next[code]
      const serverErrors = validateAnswers(schema, updated)
      onErrors({ ...serverErrors, ...pickOther(errors, code) })
      void next
    }
  }

  return (
    <div className="space-y-6" aria-live="polite">
      {sections.length === 0 && <Alert><AlertDescription>This service has no form configured.</AlertDescription></Alert>}
      {sections.map((s) => (
        <fieldset key={s.code} className="rounded-lg border bg-card">
          <legend className="px-4 pt-3 text-sm font-semibold">{s.title}</legend>
          {s.description && <p className="px-4 pb-1 text-xs text-muted-foreground">{s.description}</p>}
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {s.fields.map((f) => (
              <div key={f.code} className={spanClass(f.type)}>
                <FieldInput field={f} value={answers[f.code]} error={errors[f.code]} disabled={disabled} onChange={(v) => setValue(f.code, v)} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function pickOther(errors: Record<string, string>, exclude: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(errors)) if (k !== exclude) out[k] = v
  return out
}

function spanClass(t: FieldType): string {
  if (t === 'TEXTAREA' || t === 'ADDRESS' || t === 'SECTION_HEADING' || t === 'INFO') return 'md:col-span-2'
  return ''
}

function FieldInput({ field, value, error, disabled, onChange }: {
  field: FormField
  value: string | number | boolean | string[] | null | undefined
  error?: string
  disabled?: boolean
  onChange: (v: string | number | boolean | string[] | null) => void
}) {
  const strVal = value === null || value === undefined ? '' : String(value)
  switch (field.type) {
    case 'SECTION_HEADING':
      return <h3 className="text-sm font-semibold md:col-span-2">{field.label}</h3>
    case 'INFO':
      return <p className="text-xs text-muted-foreground md:col-span-2 rounded bg-muted px-3 py-2">{field.label}</p>
    case 'CHECKBOX':
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Checkbox id={field.code} checked={value === true || value === 'YES'} disabled={disabled}
              onCheckedChange={(c) => onChange(c === true)} className="mt-1" />
            <Label htmlFor={field.code} className="text-sm font-normal leading-snug">{field.label}</Label>
          </div>
          {error && <FieldError error={error} />}
        </div>
      )
    case 'YESNO':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.code}>{field.label}{requiredMark(field)}</Label>
          <RadioGroup value={strVal} onValueChange={(v) => onChange(v)} disabled={disabled} className="flex gap-4">
            <div className="flex items-center gap-1.5"><RadioGroupItem value="YES" id={`${field.code}-yes`} /><Label htmlFor={`${field.code}-yes`} className="font-normal">Yes</Label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="NO" id={`${field.code}-no`} /><Label htmlFor={`${field.code}-no`} className="font-normal">No</Label></div>
          </RadioGroup>
          {field.helpText && <Help text={field.helpText} />}
          {error && <FieldError error={error} />}
        </div>
      )
    case 'RADIO': {
      const opts = field.options || []
      return (
        <div className="space-y-1.5">
          <Label>{field.label}{requiredMark(field)}</Label>
          <RadioGroup value={strVal} onValueChange={(v) => onChange(v)} disabled={disabled} className="space-y-2">
            {opts.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <RadioGroupItem value={o.value} id={`${field.code}-${o.value}`} />
                <Label htmlFor={`${field.code}-${o.value}`} className="font-normal">{o.label}</Label>
              </div>
            ))}
          </RadioGroup>
          {field.helpText && <Help text={field.helpText} />}
          {error && <FieldError error={error} />}
        </div>
      )
    }
    case 'SELECT': {
      const opts = field.options || []
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.code}>{field.label}{requiredMark(field)}</Label>
          <select id={field.code} value={strVal} disabled={disabled} onChange={(e) => onChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="">Select…</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {field.helpText && <Help text={field.helpText} />}
          {error && <FieldError error={error} />}
        </div>
      )
    }
    case 'TEXTAREA':
    case 'ADDRESS':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.code}>{field.label}{requiredMark(field)}</Label>
          <Textarea id={field.code} value={strVal} disabled={disabled} rows={3} placeholder={field.placeholder || ''}
            onChange={(e) => onChange(e.target.value)} />
          {field.helpText && <Help text={field.helpText} />}
          {error && <FieldError error={error} />}
        </div>
      )
    default: {
      const inputType = inputTypeFor(field.type)
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.code}>{field.label}{requiredMark(field)}</Label>
          <Input id={field.code} type={inputType} value={strVal} disabled={disabled} placeholder={field.placeholder || ''}
            onChange={(e) => onChange(e.target.value)} />
          {field.helpText && <Help text={field.helpText} />}
          {error && <FieldError error={error} />}
        </div>
      )
    }
  }
}

function requiredMark(f: FormField): string {
  return f.required ? ' *' : ''
}

function Help({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function FieldError({ error }: { error: string }) {
  return <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
}

function inputTypeFor(t: FieldType): string {
  switch (t) {
    case 'INTEGER': case 'DECIMAL': return 'number'
    case 'DATE': return 'date'
    case 'EMAIL': return 'email'
    case 'PHONE': case 'PAN': case 'GSTIN': case 'CIN': case 'PIN': return 'text'
    default: return 'text'
  }
}

export type { FieldValidation }
