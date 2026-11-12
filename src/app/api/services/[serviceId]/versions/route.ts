import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok } from '@/lib/api-utils'

// POST /api/services/[serviceId]/versions — create a new draft version.
// SUPER_ADMIN/ADMIN plus KNOWLEDGE_MANAGER (R-01): rule-maintenance staff may
// start a new configuration draft; professional approval and publishing stay
// with CA_REVIEWER / admins (separation of duties).
export async function POST(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const { serviceId } = await params
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'])
    const service = await db.service.findUnique({ where: { id: serviceId }, include: { versions: true, currentVersion: true } })
    if (!service) throw new HttpError(404, 'NOT_FOUND', 'Service not found.')

    // Determine next version number: bump the minor of the HIGHEST existing
    // version (ordering of the relation is not guaranteed; taking the first
    // row could regenerate an existing number and violate the unique key).
    const nums = service.versions
      .map((v) => v.version.split('.').map((x) => parseInt(x, 10) || 0))
      .sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]))
    const [maj, min] = nums[0] || [0, 0, 0]
    const nextVersion = `${maj}.${min + 1}.0`

    const src = service.currentVersion
    const version = await db.serviceVersion.create({
      data: {
        serviceId,
        version: nextVersion,
        status: 'DRAFT',
        changeNotes: `New draft based on ${src ? src.version : 'no prior version'}.`,
        formSchema: src?.formSchema ?? '{}',
        documentRequirements: src?.documentRequirements ?? '[]',
        taskTemplates: src?.taskTemplates ?? '[]',
        pricing: src?.pricing ?? '{}',
        applicability: src?.applicability ?? '{}',
        complianceRules: src?.complianceRules ?? '[]',
        sourceReferences: src?.sourceReferences ?? '[]',
        workflowId: src?.workflowId ?? null,
      },
    })
    await audit({ actor: ctx, action: 'SERVICE_VERSION_CREATED', entity: 'ServiceVersion', entityId: version.id, details: { serviceId, version: nextVersion } })
    return ok({ version: { id: version.id, version: version.version } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// GET /api/services/[serviceId]/versions — list all versions (staff).
export async function GET(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'])
    const { serviceId } = await params
    const versions = await db.serviceVersion.findMany({
      where: { serviceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, version: true, status: true, changeNotes: true, approvedByName: true, publishedAt: true, createdAt: true },
    })
    return ok({ versions })
  } catch (e) {
    return jsonError(e)
  }
}
