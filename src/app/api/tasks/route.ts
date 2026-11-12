import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { parsePagination } from '@/lib/api-utils'
import { jsonError, ok } from '@/lib/api-utils'

// GET /api/tasks?scope=mine|unassigned|all
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const { take, skip, page } = parsePagination(req)
    const scope = req.nextUrl.searchParams.get('scope') || (ctx.role === 'EMPLOYEE' || ctx.role === 'CA_REVIEWER' ? 'mine' : 'all')

    const where: Record<string, unknown> = {}
    if (scope === 'mine') {
      if (ctx.role === 'EMPLOYEE' || ctx.role === 'CA_REVIEWER') where.assignedToId = ctx.userId
      else if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Clients cannot list tasks.')
      else where.assignedToId = ctx.userId
    } else if (scope === 'unassigned') {
      where.assignedToId = null
      where.status = 'PENDING'
      if (ctx.role === 'EMPLOYEE' || ctx.role === 'CA_REVIEWER' || ctx.role === 'CLIENT') {
        throw new HttpError(403, 'FORBIDDEN', 'Only managers and admins can view the unassigned queue.')
      }
    } else {
      // 'all' — staff overview
      if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Clients cannot list tasks.')
    }

    const [tasks, total] = await Promise.all([
      db.applicationTask.findMany({
        where,
        include: {
          application: { select: { referenceNo: true, service: { select: { clientName: true } }, business: { select: { legalName: true } }, clientId: true } },
          assignee: { select: { id: true, name: true } },
          department: { select: { code: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }, { createdAt: 'asc' }],
        take, skip,
      }),
      db.applicationTask.count({ where }),
    ])
    return ok({
      tasks: tasks.map((t) => ({
        id: t.id,
        templateCode: t.templateCode,
        name: t.name,
        description: t.description,
        stageCode: t.stageCode,
        status: t.status,
        priority: t.priority,
        responsibleRole: t.responsibleRole,
        assignedTo: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
        department: t.department?.name ?? null,
        unassignedReason: t.unassignedReason,
        slaDueAt: t.slaDueAt,
        evidenceRequired: t.evidenceRequired,
        evidenceNote: t.evidenceNote,
        approvalRequired: t.approvalRequired,
        approvalStatus: t.approvalStatus,
        completedAt: t.completedAt,
        application: {
          id: t.applicationId,
          referenceNo: t.application.referenceNo,
          serviceName: t.application.service.clientName,
          businessName: t.application.business?.legalName ?? null,
        },
      })),
      total, page, scope,
    })
  } catch (e) {
    return jsonError(e)
  }
}
