import { db } from './db'
import { validateFormSchema, type SchemaIssue } from './rules'
import { HttpError, type DocumentRequirement, type FormSchema, type PricingConfig, type TaskTemplate, type VersionConfig } from './types'

export interface ValidationReport {
  errors: SchemaIssue[]
  warnings: SchemaIssue[]
  checkedAt: string
}

export async function validateServiceVersion(versionId: string): Promise<ValidationReport> {
  const version = await db.serviceVersion.findUnique({ where: { id: versionId } })
  if (!version) throw new HttpError(404, 'NOT_FOUND', 'Service version not found.')

  const errors: SchemaIssue[] = []
  const warnings: SchemaIssue[] = []
  const push = (severity: SchemaIssue['severity'], message: string, location?: string) =>
    (severity === 'ERROR' ? errors : warnings).push({ severity, message, location })

  // 1. Form schema structural + rule-integrity validation
  let schema: FormSchema = { sections: [] }
  try {
    schema = JSON.parse(version.formSchema) as FormSchema
  } catch {
    push('ERROR', 'Form schema is not valid JSON.', 'formSchema')
  }
  if (schema?.sections) {
    for (const issue of validateFormSchema(schema)) {
      (issue.severity === 'ERROR' ? errors : warnings).push(issue)
    }
  }

  // 2. Document requirements
  let docs: DocumentRequirement[] = []
  try {
    docs = JSON.parse(version.documentRequirements) as DocumentRequirement[]
  } catch {
    push('ERROR', 'Document requirements are not valid JSON.', 'documentRequirements')
  }
  const docCodes = new Set<string>()
  for (const d of docs) {
    if (!d.code) push('ERROR', 'Every document requirement needs a code.', 'documentRequirements')
    else if (docCodes.has(d.code)) push('ERROR', `Duplicate document requirement code "${d.code}".`, 'documentRequirements')
    docCodes.add(d.code)
    if (!d.requiredMode) push('ERROR', `Document requirement "${d.code}" is missing requiredMode.`, 'documentRequirements')
    if (d.requiredMode === 'CONDITIONAL' && !d.conditionRule) {
      push('ERROR', `Conditional document "${d.code}" must define a condition rule.`, 'documentRequirements')
    }
    if (d.requiredMode === 'CONDITIONAL' && d.conditionRule) {
      // check referenced fields exist in the schema
      const fieldCodes = new Set<string>()
      for (const s of schema.sections || []) for (const f of s.fields || []) fieldCodes.add(f.code)
      const refs: string[] = []
      collectRefs(d.conditionRule, refs)
      for (const r of refs) {
        if (!fieldCodes.has(r)) push('ERROR', `Document requirement "${d.code}" condition references unknown field "${r}".`, 'documentRequirements')
      }
    }
    if (!d.formats || d.formats.length === 0) push('WARNING', `Document requirement "${d.code}" should declare allowed formats.`, 'documentRequirements')
  }

  // 3. Task templates + workflow
  let tasks: TaskTemplate[] = []
  try {
    tasks = JSON.parse(version.taskTemplates) as TaskTemplate[]
  } catch {
    push('ERROR', 'Task templates are not valid JSON.', 'taskTemplates')
  }
  if (tasks.length === 0) push('ERROR', 'At least one task template is required.', 'taskTemplates')
  const taskCodes = new Set<string>()
  for (const t of tasks) {
    if (!t.code || !t.stageCode || !t.responsibleRole) {
      push('ERROR', `Task template "${t.code || '(missing code)'}" must define code, stageCode and responsibleRole.`, 'taskTemplates')
      continue
    }
    if (taskCodes.has(t.code)) push('ERROR', `Duplicate task template code "${t.code}".`, 'taskTemplates')
    taskCodes.add(t.code)
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn || []) {
      if (!taskCodes.has(dep)) push('ERROR', `Task "${t.code}" depends on unknown task "${dep}".`, 'taskTemplates')
    }
  }
  // dependency cycle check (same DFS approach)
  const adj = new Map<string, string[]>()
  tasks.forEach((t) => adj.set(t.code, t.dependsOn || []))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []
  const dfs = (n: string) => {
    if (visited.has(n)) return
    if (visiting.has(n)) {
      const idx = path.indexOf(n)
      push('ERROR', `Circular dependency between tasks: ${path.slice(idx).concat(n).join(' -> ')}.`, 'taskTemplates')
      return
    }
    visiting.add(n); path.push(n)
    for (const m of adj.get(n) || []) dfs(m)
    path.pop(); visiting.delete(n); visited.add(n)
  }
  for (const t of tasks) dfs(t.code)

  if (!version.workflowId) {
    push('ERROR', 'A workflow definition must be linked to the service version.', 'workflow')
  } else {
    const stages = await db.workflowStage.findMany({ where: { workflowId: version.workflowId }, orderBy: { sequence: 'asc' } })
    if (stages.length === 0) push('ERROR', 'Linked workflow has no stages.', 'workflow')
    const stageCodes = new Set(stages.map((s) => s.code))
    for (const t of tasks) {
      if (!stageCodes.has(t.stageCode)) push('ERROR', `Task "${t.code}" refers to stage "${t.stageCode}" which is missing in the workflow definition.`, 'taskTemplates')
    }
  }

  // 4. Pricing sanity
  let pricing: PricingConfig | null = null
  try {
    pricing = JSON.parse(version.pricing) as PricingConfig
  } catch {
    push('ERROR', 'Pricing is not valid JSON.', 'pricing')
  }
  if (pricing) {
    if (typeof pricing.professionalFee !== 'number' || pricing.professionalFee < 0) push('ERROR', 'Professional fee must be a non-negative number.', 'pricing')
    if (typeof pricing.govtFee !== 'number' || pricing.govtFee < 0) push('ERROR', 'Government fee must be a non-negative number.', 'pricing')
    if (!pricing.govtFeeNote) push('ERROR', 'Government fee must carry a provenance note (verification source).', 'pricing')
    if (!pricing.professionalFeeNote) push('WARNING', 'Professional fee should carry an internal note.', 'pricing')
  }

  // 5. Source references
  let sources: { sourceId: string; note?: string }[] = []
  try {
    sources = JSON.parse(version.sourceReferences) as { sourceId: string; note?: string }[]
  } catch {
    push('ERROR', 'Source references are not valid JSON.', 'sourceReferences')
  }
  if (sources.length === 0) {
    push('ERROR', 'At least one official source reference is required before professional review.', 'sourceReferences')
  } else {
    for (const s of sources) {
      const ref = s.sourceId ? await db.sourceReference.findUnique({ where: { id: s.sourceId } }) : null
      if (!ref) push('ERROR', `Source reference ${s.sourceId} does not exist in the Official Source Registry.`, 'sourceReferences')
      else if (ref.verificationStatus !== 'VERIFIED') {
        push('WARNING', `Source "${ref.title}" is marked ${ref.verificationStatus}; professional verification is still outstanding.`, 'sourceReferences')
      }
    }
  }

  // 6. Compliance rules (informational; generated obligations are marked demo until verified)
  try {
    const complianceRules = JSON.parse(version.complianceRules || '[]') as { code: string; demoMarked?: boolean }[]
    const codes = new Set<string>()
    for (const c of complianceRules) {
      if (!c.code) push('ERROR', 'Every compliance rule needs a code.', 'complianceRules')
      else if (codes.has(c.code)) push('ERROR', `Duplicate compliance rule code "${c.code}".`, 'complianceRules')
      codes.add(c.code)
    }
  } catch {
    push('ERROR', 'Compliance rules are not valid JSON.', 'complianceRules')
  }

  const report: ValidationReport = { errors, warnings, checkedAt: new Date().toISOString() }
  await db.serviceVersion.update({ where: { id: versionId }, data: { validationReport: JSON.stringify(report) } })
  return report
}

function collectRefs(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return
  const n = node as Record<string, unknown>
  if ('all' in n && Array.isArray(n.all)) { n.all.forEach((c) => collectRefs(c, out)); return }
  if ('any' in n && Array.isArray(n.any)) { n.any.forEach((c) => collectRefs(c, out)); return }
  if (typeof n.field === 'string') out.push(n.field)
}

// Lifecycle gate: a version may only advance when validation has no errors.
export async function assertPublishable(versionId: string): Promise<ValidationReport> {
  const report = await validateServiceVersion(versionId)
  if (report.errors.length > 0) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'Configuration has unresolved validation errors and cannot be published.')
  }
  return report
}
