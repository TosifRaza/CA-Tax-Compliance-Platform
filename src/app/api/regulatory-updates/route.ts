import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notifyRole } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// =====================================================================
// Regulatory update intake (R-05) + impact analysis (R-12).
// Manual entry of official updates mapped to affected services; expert
// verification computes an impact snapshot from the frozen configuration
// snapshots/version links of in-flight applications. Automated source
// monitoring and AI comparison are intentionally NOT implemented.
// =====================================================================

const STATUSES = ['REPORTED', 'UNDER_REVIEW', 'VERIFIED', 'APPLIED', 'DISMISSED']

async function computeImpact(affectedServiceIds: string[]): Promise<{ applicationCount: number; openTaskCount: number; references: string[] }> {
  if (affectedServiceIds.length === 0) return { applicationCount: 0, openTaskCount: 0, references: [] }
  const apps = await db.application.findMany({
    where: { serviceId: { in: affectedServiceIds }, status: { in: ['SUBMITTED', 'IN_PROGRESS', 'CLIENT_INFO_REQUESTED', 'PROFESSIONAL_REVIEW', 'GOVERNMENT_SUBMISSION', 'ON_HOLD', 'REWORK'] } },
    select: { id: true, referenceNo: true, _count: { select: { tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } } },
    take: 200,
  })
  return {
    applicationCount: apps.length,
    openTaskCount: apps.reduce((acc, a) => acc + a._count.tasks, 0),
    references: apps.slice(0, 50).map((a) => a.referenceNo),
  }
}

// GET /api/regulatory-updates — list updates (staff).
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const updates = await db.regulatoryUpdate.findMany({
      include: { source: { select: { id: true, authority: true, title: true, url: true, verificationStatus: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const services = await db.service.findMany({ select: { id: true, code: true, clientName: true }, orderBy: { code: 'asc' } })
    const sources = await db.sourceReference.findMany({ select: { id: true, authority: true, title: true }, orderBy: { title: 'asc' } })
    return ok({
      updates: updates.map((u) => ({
        ...u,
        affectedServiceIds: JSON.parse(u.affectedServiceIds) as string[],
        impact: u.impactSnapshot ? JSON.parse(u.impactSnapshot) : null,
      })),
      services,
      sources,
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/regulatory-updates — report an official update manually.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Staff only.')
    const body = await parseJson<{ sourceReferenceId?: string; title?: string; summary?: string; publishedOn?: string; affectedServiceIds?: string[] }>(req)
    const sourceReferenceId = str(body.sourceReferenceId)
    const title = str(body.title)
    const summary = str(body.summary)
    if (!sourceReferenceId || !title || !summary) {
      throw new HttpError(400, 'BAD_REQUEST', 'sourceReferenceId, title and summary are required.')
    }
    const src = await db.sourceReference.findUnique({ where: { id: sourceReferenceId } })
    if (!src) throw new HttpError(404, 'NOT_FOUND', 'Source reference not found in the registry.')
    const affected = Array.isArray(body.affectedServiceIds) ? body.affectedServiceIds.filter((s) => typeof s === 'string') : []
    if (affected.length > 0) {
      const count = await db.service.count({ where: { id: { in: affected } } })
      if (count !== affected.length) throw new HttpError(422, 'BAD_SERVICE', 'One or more affected services do not exist.')
    }
    const row = await db.regulatoryUpdate.create({
      data: {
        sourceReferenceId,
        title,
        summary,
        publishedOn: str(body.publishedOn) || null,
        affectedServiceIds: JSON.stringify(affected),
        status: 'REPORTED',
        reportedById: ctx.userId,
        reportedByName: ctx.name,
      },
    })
    await notifyRole({
      roles: ['CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'KNOWLEDGE_MANAGER'],
      title: 'Regulatory update reported',
      body: `${title} — expert verification is needed before it affects any client work.`,
      type: 'SYSTEM',
    })
    await audit({ actor: ctx, action: 'REGULATORY_UPDATE_REPORTED', entity: 'RegulatoryUpdate', entityId: row.id, details: { title } })
    return ok({ update: { id: row.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/regulatory-updates — verify / dismiss / mark applied (expert gate).
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'KNOWLEDGE_MANAGER'])
    const body = await parseJson<{ id?: string; action?: string; verifiedNotes?: string; affectedServiceIds?: string[] }>(req)
    const id = str(body.id)
    const action = str(body.action)
    if (!id || !action) throw new HttpError(400, 'BAD_REQUEST', 'id and action are required.')
    const existing = await db.regulatoryUpdate.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Regulatory update not found.')

    const data: Record<string, unknown> = {}
    if (action === 'VERIFY') {
      const affected = Array.isArray(body.affectedServiceIds) ? body.affectedServiceIds : JSON.parse(existing.affectedServiceIds) as string[]
      const impact = await computeImpact(affected)
      data.status = 'VERIFIED'
      data.affectedServiceIds = JSON.stringify(affected)
      data.verifiedById = ctx.userId
      data.verifiedByName = ctx.name
      data.verifiedAt = new Date()
      data.verifiedNotes = str(body.verifiedNotes) || null
      data.impactSnapshot = JSON.stringify(impact)
      await notifyRole({
        roles: ['ADMIN', 'SUPER_ADMIN', 'KNOWLEDGE_MANAGER'],
        title: 'Regulatory update verified — impact assessed',
        body: `${existing.title}: ${impact.applicationCount} open case(s) / ${impact.openTaskCount} open task(s) potentially affected. Plan configuration or client actions.`,
        type: 'SYSTEM',
      })
    } else if (action === 'UNDER_REVIEW') {
      data.status = 'UNDER_REVIEW'
    } else if (action === 'DISMISS') {
      data.status = 'DISMISSED'
      data.verifiedById = ctx.userId
      data.verifiedByName = ctx.name
      data.verifiedAt = new Date()
      data.verifiedNotes = str(body.verifiedNotes) || null
    } else if (action === 'APPLY') {
      if (existing.status !== 'VERIFIED') throw new HttpError(422, 'NOT_VERIFIED', 'Only verified updates can be marked applied.')
      data.status = 'APPLIED'
      data.appliedAt = new Date()
    } else {
      throw new HttpError(400, 'BAD_ACTION', 'action must be one of VERIFY | UNDER_REVIEW | DISMISS | APPLY.')
    }

    const row = await db.regulatoryUpdate.update({ where: { id }, data })
    await audit({ actor: ctx, action: `REGULATORY_UPDATE_${action}`, entity: 'RegulatoryUpdate', entityId: id, details: data })
    return ok({ update: { id: row.id, status: row.status } })
  } catch (e) {
    return jsonError(e)
  }
}
