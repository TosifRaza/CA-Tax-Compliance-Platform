import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { isStaff } from '@/lib/types'
import { createDraft } from '@/lib/applications'
import { jsonError, ok, parseJson, parsePagination, str } from '@/lib/api-utils'

// GET /api/applications — role-scoped list.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const { take, skip, page } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status') || undefined

    const where: Record<string, unknown> = {}
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) return ok({ applications: [], total: 0, page })
      where.clientId = client.id
    } else if (ctx.role === 'EMPLOYEE') {
      // Employees see applications linked to their assigned tasks.
      const tasks = await db.applicationTask.findMany({ where: { assignedToId: ctx.userId }, select: { applicationId: true } })
      where.id = { in: [...new Set(tasks.map((t) => t.applicationId))] }
    }
    if (status) where.status = status

    const [apps, total] = await Promise.all([
      db.application.findMany({
        where,
        include: {
          service: { select: { id: true, clientName: true, code: true, demoMarked: true } },
          business: { select: { legalName: true, tradeName: true, constitution: true } },
          client: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { documents: true, tasks: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take, skip,
      }),
      db.application.count({ where }),
    ])
    return ok({
      applications: apps.map((a) => ({
        id: a.id,
        referenceNo: a.referenceNo,
        status: a.status,
        currentStageCode: a.currentStageCode,
        service: { id: a.service.id, name: a.service.clientName, code: a.service.code, demoMarked: a.service.demoMarked },
        business: a.business,
        client: isStaff(ctx.role) ? { name: a.client.user.name, email: a.client.user.email } : undefined,
        documentCount: a._count.documents,
        taskCount: isStaff(ctx.role) ? a._count.tasks : undefined,
        submittedAt: a.submittedAt,
        completedAt: a.completedAt,
        updatedAt: a.updatedAt,
      })),
      total, page,
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/applications — create a draft application
// { serviceId, businessId?, periodLabel? } — businessId is optional for
// individual-taxpayer services; period is required when the service's
// applicability config sets a periodMode.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<{ serviceId?: string; businessId?: string; periodLabel?: string; periodType?: string }>(req)
    const draft = await createDraft(ctx, {
      serviceId: str(body.serviceId),
      businessId: body.businessId ? str(body.businessId) : null,
      periodLabel: body.periodLabel ? str(body.periodLabel) : null,
      periodType: body.periodType ? str(body.periodType) : null,
    })
    return ok(draft, 201)
  } catch (e) {
    return jsonError(e)
  }
}
