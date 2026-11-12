import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { caReviewerTaskScope } from '@/lib/applications'
import { advanceWorkflow } from '@/lib/tasks'
import { audit, notify, notifyRole } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// GET /api/reviews — CA reviewer queue:
//  - application tasks awaiting professional decision (assigned to me)
//  - service configurations awaiting professional approval (PROFESSIONAL_REVIEW state)
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['CA_REVIEWER'])
    const tasks = await db.applicationTask.findMany({
      where: {
        approvalRequired: true,
        approvalStatus: 'PENDING_REVIEW',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        ...caReviewerTaskScope(ctx.userId),
      },
      include: {
        application: { select: { referenceNo: true, business: { select: { legalName: true } }, service: { select: { clientName: true } } } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const configs = await db.serviceVersion.findMany({
      where: { status: 'PROFESSIONAL_REVIEW' },
      include: { service: { select: { id: true, clientName: true, code: true } } },
    })
    return ok({
      reviewTasks: tasks.map((t) => ({
        id: t.id, name: t.name, stageCode: t.stageCode,
        application: { id: t.applicationId, referenceNo: t.application.referenceNo, businessName: t.application.business?.legalName ?? null, serviceName: t.application.service.clientName },
        assignedTo: t.assignee?.name ?? null,
        createdAt: t.createdAt,
        assignedToMe: t.assignee?.id === ctx.userId,
      })),
      configReviews: configs.map((v) => ({
        id: v.id, version: v.version, serviceId: v.service.id, serviceName: v.service.clientName, serviceCode: v.service.code,
        validationReport: v.validationReport ? JSON.parse(v.validationReport) : null,
        sourceReferences: JSON.parse(v.sourceReferences || '[]'),
        updatedAt: v.updatedAt,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/reviews — record a professional decision.
// {taskId, decision: APPROVE|REQUEST_CHANGES, notes}
// APPROVE completes the approval task (with approvalStatus APPROVED) and advances the workflow.
// REQUEST_CHANGES sends the application to REWORK and notifies the responsible staff.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['CA_REVIEWER'])
    const body = await parseJson<{ taskId?: string; decision?: string; notes?: string }>(req)
    const taskId = str(body.taskId)
    const decision = str(body.decision).toUpperCase()
    const notes = str(body.notes)
    if (!taskId || !['APPROVE', 'REQUEST_CHANGES'].includes(decision)) {
      throw new HttpError(400, 'BAD_REQUEST', 'taskId and a decision of APPROVE or REQUEST_CHANGES are required.')
    }
    if (!notes) throw new HttpError(422, 'NOTES_REQUIRED', 'Review observations/notes are required for audit purposes.')

    const task = await db.applicationTask.findUnique({
      where: { id: taskId },
      include: { application: { include: { client: { include: { user: true } } } } },
    })
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found.')
    if (!task.approvalRequired) throw new HttpError(422, 'NOT_REVIEW_TASK', 'This task does not require professional approval.')
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') throw new HttpError(422, 'TASK_CLOSED', 'This task is closed.')
    if (task.assignedToId && task.assignedToId !== ctx.userId) {
      throw new HttpError(403, 'FORBIDDEN', 'This review task is assigned to another reviewer.')
    }

    if (decision === 'APPROVE') {
      await db.$transaction(async (tx) => {
        await tx.applicationTask.update({
          where: { id: taskId },
          data: { status: 'COMPLETED', approvalStatus: 'APPROVED', evidenceNote: notes, completedAt: new Date(), assignedToId: task.assignedToId ?? ctx.userId },
        })
        await tx.taskHistory.create({
          data: { taskId, action: 'APPROVED', fromStatus: task.status, toStatus: 'COMPLETED', actorId: ctx.userId, actorName: ctx.name, remarks: notes },
        })
        await tx.applicationEvent.create({
          data: { applicationId: task.applicationId, type: 'REVIEW_DECIDED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ task: task.templateCode, decision: 'APPROVE', notes }) },
        })
        await tx.reviewDecision.create({
          data: { applicationId: task.applicationId, reviewerId: ctx.userId, reviewerName: ctx.name, decision: 'APPROVE', scope: 'TASK', stageCode: task.stageCode, notes },
        })
      })
      await advanceWorkflow(task.applicationId, { id: ctx.userId, name: ctx.name })
      await notify({
        userId: task.application.client.user.id,
        title: 'Professional review completed',
        body: `Application ${task.application.referenceNo}: professional review approved.`,
        type: 'APPLICATION',
        linkView: `applications:${task.applicationId}`,
      })
      await audit({ actor: ctx, action: 'REVIEW_APPROVED', entity: 'ApplicationTask', entityId: taskId, details: { applicationId: task.applicationId } })
      return ok({ decision: 'APPROVE' })
    }

    // REQUEST_CHANGES -> rework
    await db.$transaction(async (tx) => {
      await tx.applicationTask.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS', approvalStatus: 'CHANGES_REQUESTED', evidenceNote: notes },
      })
      await tx.taskHistory.create({
        data: { taskId, action: 'CHANGES_REQUESTED', actorId: ctx.userId, actorName: ctx.name, remarks: notes },
      })
      await tx.applicationEvent.create({
        data: { applicationId: task.applicationId, type: 'REVIEW_DECIDED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ task: task.templateCode, decision: 'REQUEST_CHANGES', notes }) },
      })
      await tx.reviewDecision.create({
        data: { applicationId: task.applicationId, reviewerId: ctx.userId, reviewerName: ctx.name, decision: 'REQUEST_CHANGES', scope: 'TASK', stageCode: task.stageCode, notes },
      })
      await tx.application.update({ where: { id: task.applicationId }, data: { status: 'REWORK' } })
      await tx.applicationStatusHistory.create({
        data: { applicationId: task.applicationId, fromStatus: task.application.status, toStatus: 'REWORK', actorId: ctx.userId, actorName: ctx.name, remarks: notes },
      })
    })
    await notifyRole({
      roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      title: 'Rework requested by reviewer',
      body: `Application ${task.application.referenceNo}: ${notes}`,
      type: 'TASK',
    })
    await audit({ actor: ctx, action: 'REVIEW_CHANGES_REQUESTED', entity: 'ApplicationTask', entityId: taskId, details: { applicationId: task.applicationId } })
    return ok({ decision: 'REQUEST_CHANGES' })
  } catch (e) {
    return jsonError(e)
  }
}
