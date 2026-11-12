import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { jsonError, ok } from '@/lib/api-utils'

// =====================================================================
// R-08: combined readiness per deadline — joins documents, fee, tax and
// work status for each upcoming obligation so risk cases are visible
// before they breach.
// =====================================================================
type Readiness = { status: 'READY' | 'AT_RISK' | 'BLOCKED' | 'NO_CASE'; reasons: string[] }

async function computeReadiness(obligationIds: string[]): Promise<Map<string, Readiness>> {
  const map = new Map<string, Readiness>()
  const obligations = await db.complianceObligation.findMany({
    where: { id: { in: obligationIds } },
    select: {
      id: true, applicationId: true, clientId: true,
      application: {
        select: {
          id: true, checklist: true,
          documents: { select: { requirementCode: true, status: true } },
          tasks: { select: { id: true, status: true } },
          quotations: { select: { id: true, status: true, payments: { select: { status: true } } } },
          taxPayments: { select: { id: true, status: true } },
        },
      },
    },
  })
  for (const o of obligations) {
    if (!o.application) {
      map.set(o.id, { status: 'NO_CASE', reasons: [] })
      continue
    }
    const app = o.application
    const reasons: string[] = []
    let blocked = false
    let risk = false
    // Documents: REQUIRED checklist items without an APPROVED upload
    const checklist = JSON.parse(app.checklist || '[]') as { requirementCode: string; status: string; name: string }[]
    const approved = new Set(app.documents.filter((d) => d.status === 'APPROVED').map((d) => d.requirementCode))
    const missingDocs = checklist.filter((c) => c.status === 'REQUIRED' && !approved.has(c.requirementCode))
    if (missingDocs.length > 0) { blocked = true; reasons.push(`${missingDocs.length} required document(s) pending`) }
    // Work: open tasks
    const openTasks = app.tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length
    if (openTasks > 0) { risk = true; reasons.push(`${openTasks} open processing task(s)`) }
    // Firm fee: quotation accepted but no successful payment
    const q = app.quotations[0]
    if (q && q.status === 'ACCEPTED' && !q.payments.some((p) => p.status === 'SUCCESS')) { risk = true; reasons.push('professional fee not paid') }
    // Client tax: any tax payment record still pending
    const pendingTax = app.taxPayments.filter((t) => t.status === 'PENDING').length
    if (pendingTax > 0) { blocked = true; reasons.push(`${pendingTax} tax payment(s) pending`) }
    map.set(o.id, { status: blocked ? 'BLOCKED' : risk ? 'AT_RISK' : 'READY', reasons })
  }
  return map
}

function serializeReadiness(map: Map<string, Readiness>, id: string): Readiness {
  return map.get(id) ?? { status: 'NO_CASE', reasons: [] }
}

// GET /api/dashboard — real, stored-data-derived counts per role.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)

    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) throw new HttpError(403, 'FORBIDDEN', 'Client profile missing.')
      const [activeApps, pendingActions, missingDocs, pendingPayments, pendingTaxPayments, completedApps, upcomingRaw] = await Promise.all([
        db.application.count({ where: { clientId: client.id, status: { in: ['SUBMITTED', 'IN_PROGRESS', 'PROFESSIONAL_REVIEW', 'GOVERNMENT_SUBMISSION', 'REWORK', 'CLIENT_INFO_REQUESTED'] } } }),
        db.application.count({ where: { clientId: client.id, status: 'CLIENT_INFO_REQUESTED' } }),
        // Missing docs: REQUIRED checklist items without an approved document
        db.application.findMany({
          where: { clientId: client.id, status: { in: ['DRAFT', 'CLIENT_INFO_REQUESTED', 'SUBMITTED', 'IN_PROGRESS'] } },
          select: { id: true, referenceNo: true, checklist: true, documents: { select: { requirementCode: true, status: true } } },
        }).then((apps) => apps.reduce((acc, a) => {
          const checklist = JSON.parse(a.checklist) as { requirementCode: string; status: string; name: string }[]
          const approved = new Set(a.documents.filter((d) => d.status === 'APPROVED').map((d) => d.requirementCode))
          const missing = checklist.filter((c) => c.status === 'REQUIRED' && !approved.has(c.requirementCode))
          if (missing.length > 0) acc.push({ applicationId: a.id, referenceNo: a.referenceNo, count: missing.length, names: missing.slice(0, 3).map((m) => m.name) })
          return acc
        }, [] as { applicationId: string; referenceNo: string; count: number; names: string[] }[])),
        db.payment.count({ where: { quotation: { application: { clientId: client.id } }, status: 'PENDING' } }),
        db.taxPayment.count({ where: { application: { clientId: client.id }, status: 'PENDING' } }),
        db.application.count({ where: { clientId: client.id, status: 'COMPLETED' } }),
        db.complianceObligation.findMany({
          where: { clientId: client.id, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] }, dueDate: { gte: new Date(), lte: new Date(Date.now() + 45 * 24 * 3600 * 1000) } },
          orderBy: { dueDate: 'asc' },
          take: 5,
          select: { id: true, title: true, dueDate: true, status: true, demoMarked: true, periodLabel: true },
        }),
      ])
      const readinessMap = await computeReadiness(upcomingRaw.map((o) => o.id))
      const upcomingDeadlines = upcomingRaw.map((o) => ({ ...o, readiness: serializeReadiness(readinessMap, o.id) }))
      return ok({
        role: 'CLIENT',
        client: {
          activeApplications: activeApps,
          pendingActions,
          missingDocuments: missingDocs,
          pendingPayments,
          pendingTaxPayments,
          completedApplications: completedApps,
          upcomingDeadlines,
        },
      })
    }

    // Staff dashboards
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(ctx.role)
    const [
      appsByStatus,
      pendingDocVerification,
      unassignedTasks,
      overdueTasks,
      pendingApprovals,
      pendingConfigApprovals,
      upcomingRaw,
      servicesNeedingConfig,
      overdueObligations,
    ] = await Promise.all([
      db.application.groupBy({ by: ['status'], _count: { _all: true } }),
      db.applicationTask.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, stageCode: 'DOC_VERIFICATION' } }),
      db.applicationTask.count({ where: { status: 'PENDING', assignedToId: null } }),
      db.applicationTask.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, slaDueAt: { lt: new Date() } } }),
      db.applicationTask.count({ where: { approvalRequired: true, approvalStatus: 'PENDING_REVIEW', status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      db.serviceVersion.count({ where: { status: 'PROFESSIONAL_REVIEW' } }),
      db.complianceObligation.findMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] }, dueDate: { lte: new Date(Date.now() + 30 * 24 * 3600 * 1000) } },
        orderBy: { dueDate: 'asc' },
        take: 8,
        select: { id: true, title: true, dueDate: true, status: true, demoMarked: true, periodLabel: true, business: { select: { legalName: true } } },
      }),
      db.service.count({ where: { status: 'DRAFT' } }),
      db.complianceObligation.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } } }),
    ])
    const readinessMap = await computeReadiness(upcomingRaw.map((o) => o.id))
    const upcomingDeadlines = upcomingRaw.map((o) => ({ ...o, readiness: serializeReadiness(readinessMap, o.id) }))

    if (ctx.role === 'EMPLOYEE' || ctx.role === 'CA_REVIEWER') {
      const [myTasks, dueToday, overdue, waitingClient, pendingInternal, recentlyCompleted] = await Promise.all([
        db.applicationTask.count({ where: { assignedToId: ctx.userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        db.applicationTask.count({ where: { assignedToId: ctx.userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, slaDueAt: { gte: new Date(new Date().setHours(0, 0, 0)), lte: new Date(new Date().setHours(23, 59, 59)) } } }),
        db.applicationTask.count({ where: { assignedToId: ctx.userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, slaDueAt: { lt: new Date() } } }),
        db.application.count({ where: { status: 'CLIENT_INFO_REQUESTED', tasks: { some: { assignedToId: ctx.userId } } } }),
        db.applicationTask.count({ where: { approvalRequired: true, approvalStatus: 'PENDING_REVIEW', status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        db.applicationTask.count({ where: { assignedToId: ctx.userId, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } }),
      ])
      return ok({ role: ctx.role, employee: { myTasks, dueToday, overdue, waitingClient, pendingInternal, recentlyCompleted } })
    }

    return ok({
      role: ctx.role,
      admin: {
        appsByStatus: appsByStatus.map((s) => ({ status: s.status, count: s._count._all })),
        pendingDocVerification,
        unassignedTasks,
        overdueTasks,
        pendingApprovals,
        pendingConfigApprovals,
        upcomingDeadlines,
        overdueObligations,
        servicesNeedingConfig: servicesNeedingConfig,
        canManageUsers: isAdmin,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
