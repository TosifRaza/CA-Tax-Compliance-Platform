import type { Answers, ChecklistItem, DocumentRequirement, FormSchema, Rule, RuleNode } from './types'
import { isGroup } from './types'

// Deterministic JSON rule evaluation. No arbitrary code execution: rules are
// declarative trees evaluated identically on client and server.

export function evaluateNode(node: RuleNode, answers: Answers): boolean {
  if (isGroup(node)) {
    const children = 'all' in node ? node.all : node.any
    if (children.length === 0) return true
    const results = children.map((c) => evaluateNode(c, answers))
    return 'all' in node ? results.every(Boolean) : results.some(Boolean)
  }
  return evaluateCondition(node, answers)
}

export function evaluateCondition(node: RuleNode, answers: Answers): boolean {
  if (isGroup(node)) return evaluateNode(node, answers)
  const raw = answers[node.field]
  switch (node.op) {
    case 'empty': {
      if (Array.isArray(raw)) return raw.length === 0
      return raw === undefined || raw === null || raw === '' 
    }
    case 'notEmpty': {
      if (Array.isArray(raw)) return raw.length > 0
      return raw !== undefined && raw !== null && raw !== ''
    }
    case 'eq': return norm(raw) === norm(node.value)
    case 'neq': return norm(raw) !== norm(node.value)
    case 'gt': return toNum(raw) !== null && toNum(node.value) !== null && toNum(raw)! > toNum(node.value)!
    case 'lt': return toNum(raw) !== null && toNum(node.value) !== null && toNum(raw)! < toNum(node.value)!
    case 'in': {
      const list = Array.isArray(node.value) ? node.value.map(norm) : [norm(node.value)]
      if (Array.isArray(raw)) return raw.some((r) => list.includes(norm(r)))
      return list.includes(norm(raw))
    }
    case 'contains': {
      if (Array.isArray(raw)) return raw.map(norm).includes(norm(node.value))
      return String(raw ?? '').toLowerCase().includes(String(node.value ?? '').toLowerCase())
    }
    default: return false
  }
}

function norm(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'YES' : 'NO'
  return String(v).trim().toUpperCase()
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isVisible(visibilityRule: Rule | undefined, answers: Answers): boolean {
  if (!visibilityRule) return true
  return evaluateNode(visibilityRule, answers)
}

export function isRequired(required: boolean, requiredRule: Rule | undefined, answers: Answers): boolean {
  if (requiredRule) return evaluateNode(requiredRule, answers)
  return required
}

// ---------------- Validation of form schema + rules ----------------

export interface SchemaIssue {
  severity: 'ERROR' | 'WARNING'
  message: string
  location?: string
}

function collectFieldRefs(node: RuleNode, out: string[]): void {
  if (isGroup(node)) {
    const children = 'all' in node ? node.all : node.any
    children.forEach((c) => collectFieldRefs(c, out))
  } else {
    out.push(node.field)
  }
}

export function validateFormSchema(schema: FormSchema): SchemaIssue[] {
  const issues: SchemaIssue[] = []
  const sections = schema?.sections || []

  const sectionCodes = new Set<string>()
  const fieldMap = new Map<string, { type: string; sectionCode: string; required: boolean; requiredRule?: Rule; visibilityRule?: Rule }>()
  const seenSectionCodes = new Set<string>()
  const seenFieldCodes = new Set<string>()

  if (sections.length === 0) {
    issues.push({ severity: 'ERROR', message: 'Form schema must contain at least one section.', location: 'formSchema' })
  }

  for (const s of sections) {
    const loc = `section:${s.code}`
    if (!s.code) issues.push({ severity: 'ERROR', message: 'Every section must have a code.', location: loc })
    if (seenSectionCodes.has(s.code)) issues.push({ severity: 'ERROR', message: `Duplicate section code "${s.code}".`, location: loc })
    seenSectionCodes.add(s.code)
    if (!s.fields || s.fields.length === 0) {
      issues.push({ severity: 'WARNING', message: `Section "${s.title || s.code}" has no fields.`, location: loc })
    }
    if (s.visibilityRule) {
      const refs: string[] = []
      collectFieldRefs(s.visibilityRule, refs)
      refs.forEach((r) => {
        if (!fieldMap.has(r)) issues.push({ severity: 'ERROR', message: `Section "${s.code}" visibility rule references unknown field "${r}".`, location: loc })
        if (r === s.code) issues.push({ severity: 'ERROR', message: `Section "${s.code}" visibility rule references itself.`, location: loc })
      })
    }
    for (const f of s.fields || []) {
      const fLoc = `${loc}.field:${f.code}`
      if (!f.code) { issues.push({ severity: 'ERROR', message: `Field in section "${s.code}" has no code.`, location: fLoc }); continue }
      if (seenFieldCodes.has(f.code)) issues.push({ severity: 'ERROR', message: `Duplicate field code "${f.code}" across sections.`, location: fLoc })
      seenFieldCodes.add(f.code)
      fieldMap.set(f.code, { type: f.type, sectionCode: s.code, required: f.required, requiredRule: f.requiredRule, visibilityRule: f.visibilityRule })

      if (['SELECT', 'RADIO', 'MULTISELECT'].includes(f.type) && (!f.options || f.options.length === 0)) {
        issues.push({ severity: 'ERROR', message: `Field "${f.code}" of type ${f.type} must define options.`, location: fLoc })
      }
      if (f.visibilityRule) {
        const refs: string[] = []
        collectFieldRefs(f.visibilityRule, refs)
        refs.forEach((r) => {
          if (!seenFieldCodes.has(r)) {
            // refer to any previously declared field in any section
            if (!fieldMap.has(r)) issues.push({ severity: 'ERROR', message: `Field "${f.code}" visibility rule references unknown field "${r}".`, location: fLoc })
          }
        })
      }
      if (f.requiredRule) {
        const refs: string[] = []
        collectFieldRefs(f.requiredRule, refs)
        refs.forEach((r) => {
          if (!fieldMap.has(r)) issues.push({ severity: 'ERROR', message: `Field "${f.code}" required-rule references unknown field "${r}".`, location: fLoc })
        })
      }
    }
  }

  // Dependency graph over visibility/required rules for cycle detection.
  // Edge: X depends on Y when X's visibility/required rule reads Y's answer.
  type Dep = { from: string; to: string; via: string }
  const deps: Dep[] = []
  for (const s of sections) {
    for (const f of s.fields || []) {
      const addDeps = (rule: Rule | undefined, via: string) => {
        if (!rule) return
        const refs: string[] = []
        collectFieldRefs(rule, refs)
        refs.forEach((r) => { if (r !== f.code && fieldMap.has(r)) deps.push({ from: f.code, to: r, via }) })
      }
      addDeps(f.visibilityRule, 'visibility')
      addDeps(f.requiredRule, 'requiredRule')
    }
  }
  // DFS cycle detection
  const adj = new Map<string, string[]>()
  deps.forEach((d) => {
    if (!adj.has(d.from)) adj.set(d.from, [])
    adj.get(d.from)!.push(d.to)
  })
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []
  const reportCycle = (node: string) => {
    const idx = path.indexOf(node)
    const cycle = path.slice(idx).concat(node).join(' -> ')
    issues.push({ severity: 'ERROR', message: `Circular dependency in conditional rules: ${cycle}.`, location: 'formSchema.rules' })
  }
  const dfs = (node: string) => {
    if (visited.has(node)) return
    if (visiting.has(node)) { reportCycle(node); return }
    visiting.add(node); path.push(node)
    for (const n of adj.get(node) || []) dfs(n)
    path.pop(); visiting.delete(node); visited.add(node)
  }
  for (const code of fieldMap.keys()) dfs(code)

  // Contradiction check: field declared required but a visibility rule can hide it with no requiredRule
  for (const [code, meta] of fieldMap) {
    if (meta.required && meta.visibilityRule && !meta.requiredRule) {
      issues.push({
        severity: 'WARNING',
        message: `Field "${code}" is marked required but can be hidden by its visibility rule. Add a required-rule so it is mandatory only when visible.`,
        location: `field:${code}`,
      })
    }
  }

  return issues
}

// ---------------- Document checklist computation ----------------

export function computeChecklist(
  requirements: DocumentRequirement[],
  answers: Answers,
): ChecklistItem[] {
  return requirements.map((r) => {
    if (r.requiredMode === 'ALWAYS') {
      return { requirementCode: r.code, name: r.name, status: 'REQUIRED' as const, reason: 'Always required for this service.', formats: r.formats, maxFiles: r.maxFiles, maxSizeMb: r.maxSizeMb, documentTypeCode: r.documentTypeCode, description: r.description }
    }
    if (r.requiredMode === 'OPTIONAL') {
      return { requirementCode: r.code, name: r.name, status: 'OPTIONAL' as const, reason: 'Optional supporting document.', formats: r.formats, maxFiles: r.maxFiles, maxSizeMb: r.maxSizeMb, documentTypeCode: r.documentTypeCode, description: r.description }
    }
    // CONDITIONAL
    if (r.conditionRule && evaluateNode(r.conditionRule, answers)) {
      return { requirementCode: r.code, name: r.name, status: 'REQUIRED' as const, reason: r.conditionSummary || 'Required based on your answers.', formats: r.formats, maxFiles: r.maxFiles, maxSizeMb: r.maxSizeMb, documentTypeCode: r.documentTypeCode, description: r.description }
    }
    return { requirementCode: r.code, name: r.name, status: 'NOT_APPLICABLE' as const, reason: 'Not applicable to your answers.', formats: r.formats, maxFiles: r.maxFiles, maxSizeMb: r.maxSizeMb, documentTypeCode: r.documentTypeCode, description: r.description }
  })
}

// ---------------- Full answer validation (server-side) ----------------

const PATTERNS: Record<string, RegExp> = {
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}[A-Z0-9]$/,
  CIN: /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/,
  PIN: /^[1-9][0-9]{5}$/,
  PHONE: /^[6-9][0-9]{9}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INTEGER: /^-?[0-9]+$/,
  DECIMAL: /^-?[0-9]+(\.[0-9]+)?$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
}

export interface AnswerErrors { [fieldCode: string]: string }

export function validateAnswers(schema: FormSchema, answers: Answers): AnswerErrors {
  const errors: AnswerErrors = {}
  for (const s of schema.sections || []) {
    const sectionVisible = isVisible(s.visibilityRule, answers)
    if (!sectionVisible) continue
    for (const f of s.fields || []) {
      const visible = isVisible(f.visibilityRule, answers)
      if (!visible) continue
      const v = answers[f.code]
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
      const required = isRequired(f.required, f.requiredRule, answers)
      if (required && empty) {
        errors[f.code] = `${f.label} is required.`
        continue
      }
      if (empty) continue
      if (f.type === 'CHECKBOX') continue
      const str = Array.isArray(v) ? '' : String(v).trim()
      if (PATTERNS[f.type]) {
        if (f.type === 'PAN' || f.type === 'GSTIN' || f.type === 'CIN') {
          if (!PATTERNS[f.type].test(str.toUpperCase())) errors[f.code] = `${f.label} format is invalid.`
          continue
        }
        if (!PATTERNS[f.type].test(str)) errors[f.code] = `${f.label} format is invalid.`
        continue
      }
      if (['INTEGER', 'DECIMAL'].includes(f.type) && !PATTERNS[f.type === 'INTEGER' ? 'INTEGER' : 'DECIMAL'].test(str)) {
        errors[f.code] = `${f.label} must be a valid number.`
        continue
      }
      const val = f.type === 'INTEGER' || f.type === 'DECIMAL' ? Number(str) : undefined
      if (f.validation?.min !== undefined && val !== undefined && val < f.validation.min) errors[f.code] = `${f.label} must be at least ${f.validation.min}.`
      if (f.validation?.max !== undefined && val !== undefined && val > f.validation.max) errors[f.code] = `${f.label} must be at most ${f.validation.max}.`
      if (f.validation?.pattern) {
        try { if (!new RegExp(f.validation.pattern).test(str)) errors[f.code] = f.validation.message || `${f.label} format is invalid.` } catch { /* invalid admin pattern: ignore */ }
      }
      if (['SELECT', 'RADIO'].includes(f.type) && f.options && !f.options.some((o) => o.value === str.toUpperCase() || o.value === str)) {
        errors[f.code] = `${f.label} has an invalid selection.`
      }
    }
  }
  return errors
}

export function visibleSections(schema: FormSchema, answers: Answers) {
  return (schema.sections || [])
    .filter((s) => isVisible(s.visibilityRule, answers))
    .map((s) => ({ ...s, fields: s.fields.filter((f) => isVisible(f.visibilityRule, answers)) }))
    .sort((a, b) => a.displayOrder - b.displayOrder)
}
