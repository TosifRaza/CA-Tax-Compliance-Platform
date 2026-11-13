import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { assertPublishable, validateServiceVersion } from '@/lib/validation'
import { audit, notifyRole } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// POST /api/services/[serviceId]/versions/[versionId]/transition
// Lifecycle: DRAFT -> VALIDATION -> TEST -> PROFESSIONAL_REVIEW -> APPROVED -> PUBLISHED -> RETIRED
// - Only a CA_REVIEWER can move a version into APPROVED (professional approval).
// - Publishing requires APPROVED state + zero validation errors.
// - Publishing activates the version as the service's current version and retires older ones.
export async function POST(req: NextRequest, { params }: { params: Promise<{ serviceId: string; versionId: string }> }) {
  try {
    const { serviceId, versionId } = await params
    const body = await parseJson<{ to?: string; notes?: string }>(req)
    const to = str(body.to).toUpperCase()
    const version = await db.serviceVersion.findUnique({ where: { id: versionId }, include: { service: true } })
    if (!version || version.serviceId !== serviceId) throw new HttpError(404, 'NOT_FOUND', 'Version not found.')
    const from = version.status

    switch (to) {
      case 'VALIDATION':
      case 'TEST':
      case 'PROFESSIONAL_REVIEW': {
        const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
        const report = await validateServiceVersion(versionId)
        await db.serviceVersion.update({ where: { id: versionId }, data: { status: to } })
        await audit({ actor: ctx, action: 'CONFIG_TRANSITION', entity: 'ServiceVersion', entityId: versionId, details: { from, to, errors: report.errors.length, warnings: report.warnings.length } })
        return ok({ status: to, validation: report })
      }

      case 'APPROVED': {
        const ctx = await requireRole(req, ['CA_REVIEWER'])
        const report = await assertPublishable(versionId) // throws when errors present
        if (from !== 'PROFESSIONAL_REVIEW') {
          throw new HttpError(422, 'NOT_IN_REVIEW', 'A version must be submitted for PROFESSIONAL_REVIEW before it can be approved.')
        }
        await db.serviceVersion.update({
          where: { id: versionId },
          data: { status: 'APPROVED', approvedByUserId: ctx.userId, approvedByName: ctx.name, approvedAt: new Date() },
        })
        await db.reviewDecision.create({
          data: {
            serviceVersionId: versionId,
            reviewerId: ctx.userId,
            reviewerName: ctx.name,
            decision: 'APPROVE',
            scope: 'CONFIG',
            notes: str(body.notes) || 'Configuration professionally reviewed and approved.',
          },
        })
        await audit({ actor: ctx, action: 'CONFIG_APPROVED', entity: 'ServiceVersion', entityId: versionId, details: { from, version: version.version, warnings: report.warnings.length } })
        return ok({ status: 'APPROVED' })
      }

      case 'PUBLISHED': {
        const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
        if (from !== 'APPROVED') {
          throw new HttpError(422, 'NOT_APPROVED', 'A version must be professionally APPROVED before it can be published.')
        }
        await assertPublishable(versionId)
        await db.serviceVersion.updateMany({
          where: { serviceId, status: 'PUBLISHED', id: { not: versionId } },
          data: { status: 'RETIRED', isActive: false },
        })
        const published = await db.serviceVersion.update({
          where: { id: versionId },
          data: { status: 'PUBLISHED', publishedAt: new Date(), isActive: true, effectiveFrom: version.effectiveFrom ?? new Date() },
        })
        await db.service.update({ where: { id: serviceId }, data: { status: 'PUBLISHED', currentVersionId: versionId } })
        await audit({ actor: ctx, action: 'CONFIG_PUBLISHED', entity: 'ServiceVersion', entityId: versionId, details: { version: published.version } })
        await notifyRole({ roles: ['CA_REVIEWER', 'MANAGER'], title: 'Service configuration published', body: `${version.service.clientName} v${published.version} is now live.`, type: 'SYSTEM' })
        return ok({ status: 'PUBLISHED' })
      }

      case 'RETIRED': {
        const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
        await db.serviceVersion.update({ where: { id: versionId }, data: { status: 'RETIRED', isActive: false } })
        await db.service.updateMany({ where: { id: serviceId, currentVersionId: versionId }, data: { status: 'RETIRED' } })
        await audit({ actor: ctx, action: 'CONFIG_RETIRED', entity: 'ServiceVersion', entityId: versionId })
        return ok({ status: 'RETIRED' })
      }

      case 'DRAFT': {
        const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
        if (from === 'PUBLISHED' || from === 'RETIRED') {
          throw new HttpError(422, 'IMMUTABLE', 'Published or retired versions cannot be moved back to draft. Create a new version instead.')
        }
        await db.serviceVersion.update({ where: { id: versionId }, data: { status: 'DRAFT' } })
        await audit({ actor: ctx, action: 'CONFIG_BACK_TO_DRAFT', entity: 'ServiceVersion', entityId: versionId })
        return ok({ status: 'DRAFT' })
      }

      default:
        throw new HttpError(400, 'BAD_TRANSITION', 'Unknown target status.')
    }
  } catch (e) {
    return jsonError(e)
  }
}
