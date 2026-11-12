import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireRole, isStaffRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// GET /api/services/[serviceId] — role-scoped service detail.
export async function GET(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const { serviceId } = await params
    const ctx = await getSessionUser(req)
    const staff = ctx && isStaffRole(ctx.role)
    const service = await db.service.findUnique({
      where: { id: serviceId },
      include: {
        category: true,
        versions: { orderBy: { createdAt: 'desc' } },
        currentVersion: { include: { workflow: { include: { stages: true } } } },
      },
    })
    if (!service) throw new HttpError(404, 'NOT_FOUND', 'Service not found.')
    if (!staff && service.status !== 'PUBLISHED') throw new HttpError(404, 'NOT_FOUND', 'Service not found.')

    const base = {
      id: service.id,
      code: service.code,
      clientName: service.clientName,
      description: service.description,
      category: { id: service.category.id, code: service.category.code, name: service.category.name },
      authority: service.authority,
      officialUrl: service.officialUrl,
      status: service.status,
      verificationStatus: service.verificationStatus,
      demoMarked: service.demoMarked,
    }

    if (!staff) {
      const cv = service.currentVersion
      return ok({
        service: {
          ...base,
          currentVersion: cv
            ? {
                id: cv.id,
                version: cv.version,
                applicability: JSON.parse(cv.applicability),
                pricing: JSON.parse(cv.pricing),
              }
            : null,
        },
      })
    }

    return ok({
      service: {
        ...base,
        internalName: service.internalName,
        versions: service.versions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          changeNotes: v.changeNotes,
          approvedByName: v.approvedByName,
          approvedAt: v.approvedAt,
          publishedAt: v.publishedAt,
          validationReport: v.validationReport ? JSON.parse(v.validationReport) : null,
          updatedAt: v.updatedAt,
          isActive: v.isActive,
        })),
        currentVersion: service.currentVersion
          ? {
              id: service.currentVersion.id,
              version: service.currentVersion.version,
              status: service.currentVersion.status,
              formSchema: JSON.parse(service.currentVersion.formSchema),
              documentRequirements: JSON.parse(service.currentVersion.documentRequirements),
              taskTemplates: JSON.parse(service.currentVersion.taskTemplates),
              pricing: JSON.parse(service.currentVersion.pricing),
              applicability: JSON.parse(service.currentVersion.applicability),
              complianceRules: JSON.parse(service.currentVersion.complianceRules),
              sourceReferences: JSON.parse(service.currentVersion.sourceReferences),
              workflow: service.currentVersion.workflow
                ? {
                    id: service.currentVersion.workflow.id,
                    code: service.currentVersion.workflow.code,
                    name: service.currentVersion.workflow.name,
                    stages: service.currentVersion.workflow.stages
                      .map((s) => ({ code: s.code, name: s.name, sequence: s.sequence, responsibleRole: s.responsibleRole, stageType: s.stageType, slaHours: s.slaHours }))
                      .sort((a, b) => a.sequence - b.sequence),
                  }
                : null,
              validationReport: service.currentVersion.validationReport ? JSON.parse(service.currentVersion.validationReport) : null,
            }
          : null,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/services/[serviceId] — update service basics (admin+).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const { serviceId } = await params
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}
    if (typeof body.clientName === 'string') data.clientName = str(body.clientName)
    if (typeof body.internalName === 'string') data.internalName = str(body.internalName)
    if (typeof body.description === 'string') data.description = str(body.description)
    if (typeof body.authority === 'string') data.authority = str(body.authority)
    if (typeof body.officialUrl === 'string') data.officialUrl = str(body.officialUrl)
    if (typeof body.demoMarked === 'boolean') data.demoMarked = body.demoMarked
    const service = await db.service.update({ where: { id: serviceId }, data })
    await audit({ actor: ctx, action: 'SERVICE_UPDATED', entity: 'Service', entityId: serviceId, details: data })
    return ok({ service: { id: service.id, code: service.code } })
  } catch (e) {
    return jsonError(e)
  }
}
