import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError, type AuthContext } from '@/lib/types'
import { advanceWorkflow, assertGovStageReady, autoAssignTask } from '@/lib/tasks'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// PATCH /api/tasks/[id]
// Actions:
//  - status IN_PROGRESS / COMPLETED / CANCELLED (COMPLETED requires evidence when evidenceRequired)
//  - assign {assignToUserId} (manager/admin self/assign; employees can self-claim unassigned tasks)
// Authorization: assignee of the task, or MANAGER/ADMIN/SUPER_ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx: AuthContext = await requireAuth(req)
    const { id } = await params
    const body = await parseJson<{ action?: string; status?: string; evidenceNote?: string; remarks?: string; assignToUserId?: string }>(req)
    const action = str(body.action) || 'status'

    const task = await db.applicationTask.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: { select: { id: true, clientName: true, authority: true, officialUrl: true } },
          },
        },
      },
    })
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found.')

    const isAssignee = task.assignedToId === ctx.userId
    const isManagerial = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(ctx.role)
    if (!isAssignee && !isManagerial) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the assignee or a manager/admin can act on this task.')
    }

    if (action === 'assign') {
      const targetUserId = str(body.assignToUserId)
      if (!targetUserId) throw new HttpError(400, 'BAD_REQUEST', 'assignToUserId is required.')
      const target = await db.user.findUnique({ where: { id: targetUserId } })
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'Target user not found.')
      if (!['EMPLOYEE', 'CA_REVIEWER'].includes(target.role) || target.role !== task.responsibleRole) {
        throw new HttpError(422, 'ROLE_MISMATCH', `Task requires a ${task.responsibleRole}.`)
      }
      const from = task.assignedToId
      await db.applicationTask.update({ where: { id }, data: { assignedToId: targetUserId, unassignedReason: null } })
      await db.taskHistory.create({
        data: { taskId: id, action: from ? 'REASSIGNED' : 'ASSIGNED', actorId: ctx.userId, actorName: ctx.name, remarks: `Assigned to ${target.name}. ${str(body.remarks)}` },
      })
      await notify({ userId: targetUserId, title: 'Task assigned to you', body: task.name, type: 'TASK', linkView: `tasks:${id}` })
      await audit({ actor: ctx, action: 'TASK_ASSIGNED', entity: 'ApplicationTask', entityId: id, details: { to: targetUserId } })
      return ok({ success: true })
    }

    if (action === 'status') {
      const to = str(body.status).toUpperCase()
      const evidence = str(body.evidenceNote)
      if (!['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(to)) {
        throw new HttpError(400, 'BAD_REQUEST', 'status must be IN_PROGRESS, COMPLETED or CANCELLED.')
      }
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
        throw new HttpError(422, 'TASK_CLOSED', 'This task is already closed.')
      }
      if (to === 'COMPLETED') {
        if (task.approvalRequired) {
          // Completion of approval tasks is decided via the review endpoint, not directly.
          throw new HttpError(422, 'APPROVAL_REQUIRED', 'This task requires a professional review decision (approve/reject), not a direct completion.')
        }
        if (task.evidenceRequired && !evidence) {
          throw new HttpError(422, 'EVIDENCE_REQUIRED', 'An evidence note is required to complete this task.')
        }
        // Government submission gate: all REQUIRED documents must be approved.
        if (['GOVT_SUBMISSION', 'ACK_RECORDING'].includes(task.stageCode)) {
          await assertGovStageReady(task.applicationId)
        }
        if (task.stageCode === 'ACK_RECORDING' && evidence && !/^[A-Za-z0-9\-\/]{5,}$/.test(evidence.replace(/\s+/g, ''))) {
          throw new HttpError(422, 'BAD_ACK', 'Acknowledgement reference looks invalid. Record the official ARN/acknowledgement number.')
        }
      }

      await db.$transaction(async (tx) => {
        await tx.applicationTask.update({
          where: { id },
          data: {
            status: to,
            evidenceNote: evidence || task.evidenceNote,
            completedAt: to === 'COMPLETED' ? new Date() : null,
            unassignedReason: null,
          },
        })
        await tx.taskHistory.create({
          data: { taskId: id, action: 'STATUS_CHANGED', fromStatus: task.status, toStatus: to, actorId: ctx.userId, actorName: ctx.name, remarks: str(body.remarks) || evidence || null },
        })
        await tx.applicationEvent.create({
          data: { applicationId: task.applicationId, type: `TASK_${to}`, actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ task: task.templateCode, evidence: evidence || null }) },
        })
        // Record acknowledgement evidence as a filing record for traceability.
        if (to === 'COMPLETED' && ['GOVT_SUBMISSION', 'ACK_RECORDING'].includes(task.stageCode) && evidence) {
          await tx.filingRecord.create({
            data: {
              applicationId: task.applicationId,
              authority: task.application.service.authority ?? null,
              portal: task.application.service.officialUrl ?? null,
              submissionMethod: 'Manual assisted filing on official portal (evidence recorded internally)',
              acknowledgementNo: task.stageCode === 'ACK_RECORDING' ? evidence : null,
              officialStatus: task.stageCode === 'ACK_RECORDING' ? 'SUBMITTED_EVIDENCE_RECORDED' : null,
              evidenceNote: evidence,
              recordedById: ctx.userId,
              recordedByName: ctx.name,
            },
          })
        }
      })

      if (to === 'COMPLETED' || to === 'CANCELLED') {
        await advanceWorkflow(task.applicationId, { id: ctx.userId, name: ctx.name })
      }
      await audit({ actor: ctx, action: 'TASK_STATUS_CHANGED', entity: 'ApplicationTask', entityId: id, details: { from: task.status, to } })
      return ok({ success: true })
    }

    if (action === 'auto-assign') {
      if (!isManagerial) throw new HttpError(403, 'FORBIDDEN', 'Only managers/admins can trigger assignment.')
      const assigned = await autoAssignTask(id)
      return ok({ assigned })
    }

    throw new HttpError(400, 'BAD_ACTION', 'Unknown action.')
  } catch (e) {
    return jsonError(e)
  }
}
