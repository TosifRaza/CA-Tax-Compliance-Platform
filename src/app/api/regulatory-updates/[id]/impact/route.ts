import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { jsonError, ok } from '@/lib/api-utils'

// GET /api/regulatory-updates/[id]/impact — live impact analysis (R-12):
// open cases running any version of the affected services, their client,
// and their open tasks.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ['CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'KNOWLEDGE_MANAGER', 'MANAGER'])
    const { id } = await params
    const update = await db.regulatoryUpdate.findUnique({ where: { id } })
    if (!update) return ok({ applications: [], count: 0, openTaskCount: 0 })
    const affectedServiceIds = JSON.parse(update.affectedServiceIds) as string[]
    if (affectedServiceIds.length === 0) return ok({ applications: [], count: 0, openTaskCount: 0 })

    const apps = await db.application.findMany({
      where: {
        serviceId: { in: affectedServiceIds },
        status: { in: ['SUBMITTED', 'IN_PROGRESS', 'CLIENT_INFO_REQUESTED', 'PROFESSIONAL_REVIEW', 'GOVERNMENT_SUBMISSION', 'ON_HOLD', 'REWORK'] },
      },
      select: {
        id: true, referenceNo: true, status: true, periodLabel: true, submittedAt: true,
        serviceVersionId: true,
        service: { select: { clientName: true, code: true } },
        client: { include: { user: { select: { name: true, email: true } } } },
        tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }, select: { id: true, name: true, assignedToId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
    return ok({
      update: { id: update.id, title: update.title, status: update.status },
      count: apps.length,
      openTaskCount: apps.reduce((acc, a) => acc + a.tasks.length, 0),
      applications: apps.map((a) => ({
        id: a.id,
        referenceNo: a.referenceNo,
        status: a.status,
        periodLabel: a.periodLabel,
        service: a.service,
        client: { name: a.client.user.name, email: a.client.user.email },
        openTasks: a.tasks.map((t) => ({ id: t.id, name: t.name, assigned: !!t.assignedToId })),
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}
