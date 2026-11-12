import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson } from '@/lib/api-utils'

const EDITABLE_STATUSES = ['DRAFT', 'VALIDATION', 'TEST', 'PROFESSIONAL_REVIEW']

// GET /api/services/[serviceId]/versions/[versionId] — full config (staff).
export async function GET(req: NextRequest, { params }: { params: Promise<{ serviceId: string; versionId: string }> }) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'])
    const { versionId } = await params
    const version = await db.serviceVersion.findUnique({
      where: { id: versionId },
      include: { workflow: { include: { stages: true } }, service: true },
    })
    if (!version) throw new HttpError(404, 'NOT_FOUND', 'Version not found.')
    return ok({
      version: {
        id: version.id,
        serviceId: version.serviceId,
        serviceName: version.service.clientName,
        version: version.version,
        status: version.status,
        changeNotes: version.changeNotes,
        formSchema: JSON.parse(version.formSchema),
        documentRequirements: JSON.parse(version.documentRequirements),
        taskTemplates: JSON.parse(version.taskTemplates),
        pricing: JSON.parse(version.pricing),
        applicability: JSON.parse(version.applicability),
        complianceRules: JSON.parse(version.complianceRules),
        sourceReferences: JSON.parse(version.sourceReferences),
        workflowId: version.workflowId,
        workflow: version.workflow
          ? {
              id: version.workflow.id, code: version.workflow.code, name: version.workflow.name,
              stages: version.workflow.stages.map((s) => ({ code: s.code, name: s.name, sequence: s.sequence, responsibleRole: s.responsibleRole, stageType: s.stageType, slaHours: s.slaHours })).sort((a, b) => a.sequence - b.sequence),
            }
          : null,
        approvedByName: version.approvedByName,
        approvedAt: version.approvedAt,
        publishedAt: version.publishedAt,
        validationReport: version.validationReport ? JSON.parse(version.validationReport) : null,
        editable: EDITABLE_STATUSES.includes(version.status),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/services/[serviceId]/versions/[versionId] — update config payloads.
// PUBLISHED versions are immutable: changes require a new version.
// R-01 separation of duties: the KNOWLEDGE_MANAGER maintains rule content
// (form schema, document checklists, task templates, applicability, compliance
// rules, official sources) but commercial configuration (pricing) and workflow
// wiring stay with SUPER_ADMIN/ADMIN; professional approval stays with the CA.
const RULE_CONTENT_KEYS = ['formSchema', 'documentRequirements', 'taskTemplates', 'applicability', 'complianceRules', 'sourceReferences']
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ serviceId: string; versionId: string }> }) {
  try {
    const { versionId } = await params
    const probe = await requireAuth(req)
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(probe.role)
    if (!isAdmin && probe.role !== 'KNOWLEDGE_MANAGER') {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    }
    const version = await db.serviceVersion.findUnique({ where: { id: versionId } })
    if (!version) throw new HttpError(404, 'NOT_FOUND', 'Version not found.')
    if (!EDITABLE_STATUSES.includes(version.status)) {
      throw new HttpError(422, 'VERSION_IMMUTABLE', 'A published/retired version is immutable. Create a new version to make changes.')
    }

    const body = await parseJson<Record<string, unknown>>(req)
    if (!isAdmin) {
      const forbidden = Object.keys(body).filter((k) => !RULE_CONTENT_KEYS.includes(k) && k !== 'changeNotes')
      if (forbidden.length > 0) {
        throw new HttpError(403, 'FORBIDDEN', `Knowledge Managers maintain rule content only; not allowed here: ${forbidden.join(', ')}.`)
      }
    }
    const ctx = probe
    const data: Record<string, unknown> = {}
    const jsonKeys = ['formSchema', 'documentRequirements', 'taskTemplates', 'pricing', 'applicability', 'complianceRules', 'sourceReferences']
    for (const k of jsonKeys) {
      if (k in body) {
        // Must be JSON-serializable; stringify arrays/objects, validate strings parse as JSON.
        const v = body[k]
        if (typeof v === 'string') {
          try { JSON.parse(v) } catch { throw new HttpError(400, 'BAD_JSON', `${k} must be valid JSON.`) }
          data[k] = v
        } else {
          data[k] = JSON.stringify(v)
        }
      }
    }
    if (typeof body.workflowId === 'string') {
      const wfId = body.workflowId === '' ? null : body.workflowId
      if (wfId) {
        const wf = await db.workflowDefinition.findUnique({ where: { id: wfId } })
        if (!wf) throw new HttpError(404, 'NOT_FOUND', 'Workflow definition not found.')
      }
      data.workflowId = wfId
    }
    if (typeof body.changeNotes === 'string') data.changeNotes = body.changeNotes

    // Reset approval state when config materially changes after approval.
    const materialChange = jsonKeys.some((k) => k in data)
    if (materialChange && ['APPROVED', 'PUBLISHED'].includes(version.status)) {
      throw new HttpError(422, 'VERSION_IMMUTABLE', 'This version is approved; create a new version to change configuration.')
    }
    if (materialChange && version.status !== 'DRAFT') {
      data.status = 'DRAFT'
      data.approvedByUserId = null
      data.approvedByName = null
      data.approvedAt = null
    }

    const updated = await db.serviceVersion.update({ where: { id: versionId }, data })
    await audit({ actor: ctx, action: 'SERVICE_VERSION_UPDATED', entity: 'ServiceVersion', entityId: versionId, details: { keys: Object.keys(data) } })
    return ok({ version: { id: updated.id, version: updated.version, status: updated.status } })
  } catch (e) {
    return jsonError(e)
  }
}
