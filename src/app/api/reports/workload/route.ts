import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { jsonError, ok } from '@/lib/api-utils'

// =====================================================================
// Admin workload & reassignment report (R-09).
// Aggregates open tasks per employee and department, plus the recent
// assignment/reassignment history from TaskHistory.
// =====================================================================

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const now = new Date()
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999)

    const [employees, openByUser, overdueByUser, dueTodayByUser, done7ByUser, deptAgg, history] = await Promise.all([
      db.employee.findMany({
        where: { user: { role: { in: ['EMPLOYEE', 'CA_REVIEWER', 'MANAGER'] } } },
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true } }, department: { select: { code: true, name: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      db.applicationTask.groupBy({ by: ['assignedToId'], where: { assignedToId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] } }, _count: { _all: true } }),
      db.applicationTask.groupBy({ by: ['assignedToId'], where: { assignedToId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] }, slaDueAt: { lt: now } }, _count: { _all: true } }),
      db.applicationTask.groupBy({ by: ['assignedToId'], where: { assignedToId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] }, slaDueAt: { gte: dayStart, lte: dayEnd } }, _count: { _all: true } }),
      db.applicationTask.groupBy({ by: ['assignedToId'], where: { assignedToId: { not: null }, status: 'COMPLETED', completedAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } }, _count: { _all: true } }),
      db.applicationTask.groupBy({ by: ['departmentId'], where: { departmentId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] } }, _count: { _all: true } }),
      db.taskHistory.findMany({
        where: { action: { in: ['ASSIGNED', 'REASSIGNED'] } },
        include: { task: { select: { name: true, applicationId: true, application: { select: { referenceNo: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    const byUser = (rows: { assignedToId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.assignedToId as string, r._count._all]))
    const openMap = byUser(openByUser)
    const overdueMap = byUser(overdueByUser)
    const dueTodayMap = byUser(dueTodayByUser)
    const doneMap = byUser(done7ByUser)
    const deptNames = new Map(deptAgg.map((d) => [d.departmentId as string, d._count._all]))

    const workload = employees.map((e) => {
      const open = openMap.get(e.userId) ?? 0
      const cap = e.maxOpenTasks || 10
      return {
        userId: e.userId,
        name: e.user.name,
        email: e.user.email,
        role: e.user.role,
        status: e.user.status,
        department: e.department ? e.department.name : null,
        designation: e.designation,
        availability: e.availability,
        active: e.active,
        openTasks: open,
        overdue: overdueMap.get(e.userId) ?? 0,
        dueToday: dueTodayMap.get(e.userId) ?? 0,
        completedLast7d: doneMap.get(e.userId) ?? 0,
        capacity: cap,
        utilizationPct: Math.min(100, Math.round((open / cap) * 100)),
      }
    })

    const departments = (await db.department.findMany({ where: { active: true }, orderBy: { name: 'asc' } })).map((d) => ({
      id: d.id, code: d.code, name: d.name, openTasks: deptNames.get(d.id) ?? 0,
    }))

    const unassigned = await db.applicationTask.count({ where: { status: 'PENDING', assignedToId: null } })

    return ok({
      workload,
      departments,
      unassignedTotal: unassigned,
      reassignmentHistory: history.map((h) => ({
        id: h.id,
        action: h.action,
        taskName: h.task.name,
        referenceNo: h.task.application?.referenceNo ?? null,
        applicationId: h.task.applicationId,
        actorName: h.actorName,
        remarks: h.remarks,
        createdAt: h.createdAt,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}
