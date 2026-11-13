import { db } from './db'
import { HttpError, type Answers, type TaskTemplate } from './types'
import { notify, notifyRole } from './audit'
import { evaluateNode } from './rules'
import { currentPeriodLabelFor } from './period'
import type { ApplicationStatus } from './status'

// =====================================================================
// Task generation + assignment + workflow advancement engine.
// Application-specific tasks are created from the frozen configuration
// snapshot of the submitted application (never from live masters).
// =====================================================================

type TaskTemplateSnapshot = TaskTemplate

export interface StageSnapshot {
  code: string
  name: string
  sequence: number
  responsibleRole: string
  stageType: string
  slaHours?: number | null
}

export interface ConfigSnapshot {
  formSchema: unknown
  documentRequirements: unknown
  taskTemplates: TaskTemplateSnapshot[]
  workflow: { code: string; name: string; stages: StageSnapshot[] }
  pricing: unknown
  complianceRules: unknown
  applicability?: unknown
}

function topoOrder(tasks: TaskTemplateSnapshot[]): TaskTemplateSnapshot[] {
  const byCode = new Map(tasks.map((t) => [t.code, t]))
  const done = new Set<string>()
  const out: TaskTemplateSnapshot[] = []
  let remaining = [...tasks]
  let guard = 0
  while (remaining.length > 0 && guard < 100) {
    guard += 1
    const ready = remaining.filter((t) => (t.dependsOn || []).every((d) => done.has(d) || !byCode.has(d)))
    if (ready.length === 0) {
      // cycle broken by validation earlier; append rest to avoid a hang
      out.push(...remaining)
      break
    }
    ready.sort((a, b) => a.displayOrder - b.displayOrder)
    ready.forEach((t) => { out.push(t); done.add(t.code) })
    remaining = remaining.filter((t) => !done.has(t.code))
  }
  return out
}

export async function generateTasksForApplication(
  applicationId: string,
  snapshot: ConfigSnapshot,
  submittedByName: string,
  refNo: string,
): Promise<{ created: number; unassigned: number }> {
  const existing = await db.applicationTask.count({ where: { applicationId } })
  if (existing > 0) {
    // Idempotency guard: a submitted application must never be double-tasked.
    return { created: 0, unassigned: 0 }
  }

  const departments = await db.department.findMany({ where: { active: true } })
  const deptByCode = new Map(departments.map((d) => [d.code, d]))

  const ordered = topoOrder(snapshot.taskTemplates || [])
  const now = new Date()
  let unassigned = 0

  for (const t of ordered) {
    const sla = t.slaHours
    const slaDueAt = sla ? new Date(now.getTime() + sla * 3600 * 1000) : null
    const dept = t.departmentCode ? deptByCode.get(t.departmentCode) : undefined
    const depStatuses = (t.dependsOn || []).map((code) => ({ templateCode: code }))
    // Dependent tasks start as PENDING (not ready) until predecessors complete.
    const startsBlocked = (t.dependsOn || []).length > 0 && depStatuses.length > 0

    const task = await db.applicationTask.create({
      data: {
        applicationId,
        stageCode: t.stageCode,
        templateCode: t.code,
        name: t.name,
        description: t.description ?? null,
        responsibleRole: t.responsibleRole,
        departmentId: dept?.id ?? null,
        status: 'PENDING',
        priority: 'NORMAL',
        slaDueAt,
        dependsOnCodes: JSON.stringify(t.dependsOn || []),
        evidenceRequired: !!t.evidenceRequired,
        approvalRequired: !!t.approvalRequired,
        approvalStatus: t.approvalRequired ? 'PENDING_REVIEW' : null,
      },
    })
    await db.taskHistory.create({
      data: { taskId: task.id, action: 'CREATED', actorName: 'System', remarks: 'Generated from approved service configuration.' },
    })

    // Auto-assignment: only tasks without dependencies become immediately assignable.
    if (!startsBlocked) {
      const assigned = await autoAssignTask(task.id)
      if (!assigned) unassigned += 1
    }
  }

  if (unassigned > 0) {
    await notifyRole({
      roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'],
      title: 'Unassigned work in queue',
      body: `${unassigned} task(s) for application ${refNo} could not be auto-assigned. Review the unassigned queue.`,
      type: 'TASK',
    })
  }
  return { created: ordered.length, unassigned }
}

export async function autoAssignTask(taskId: string): Promise<boolean> {
  const task = await db.applicationTask.findUnique({ where: { id: taskId } })
  if (!task) return false
  if (task.assignedToId) return true

  const openWorkload = await db.applicationTask.groupBy({
    by: ['assignedToId'],
    where: { assignedToId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    _count: { _all: true },
  })
  const workloadByUser = new Map(openWorkload.map((r) => [r.assignedToId as string, r._count._all]))

  const candidates = await db.employee.findMany({
    where: {
      active: true,
      availability: 'AVAILABLE',
      user: { role: task.responsibleRole, status: 'ACTIVE' },
      ...(task.departmentId ? { departmentId: task.departmentId } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
  })

  const eligible = candidates
    .filter((c) => (workloadByUser.get(c.userId) ?? 0) < c.maxOpenTasks)
    .sort((a, b) => (workloadByUser.get(a.userId) ?? 0) - (workloadByUser.get(b.userId) ?? 0))

  if (eligible.length === 0) {
    await db.applicationTask.update({
      where: { id: taskId },
      data: { unassignedReason: 'No eligible employee available (role/department/workload).' },
    })
    return false
  }

  const chosen = eligible[0]
  await db.applicationTask.update({
    where: { id: taskId },
    data: { assignedToId: chosen.userId, unassignedReason: null },
  })
  await db.taskHistory.create({
    data: {
      taskId, action: 'ASSIGNED', toStatus: 'PENDING',
      actorName: 'System (auto-assignment)',
      remarks: `Assigned to ${chosen.user.name} by least-workload rule.`,
    },
  })
  await notify({
    userId: chosen.userId,
    title: 'New task assigned',
    body: task.name,
    type: 'TASK',
    linkView: `tasks:${task.id}`,
  })
  return true
}

// Determine whether all tasks of a stage are complete (approvals included).
// CANCELLED tasks (e.g. optional/conditional stages like query handling) count as resolved.
function stageComplete(tasks: { stageCode: string; status: string; approvalStatus: string | null; approvalRequired?: boolean }[], stageCode: string): boolean {
  const stageTasks = tasks.filter((t) => t.stageCode === stageCode)
  if (stageTasks.length === 0) return false
  return stageTasks.every(
    (t) => (t.status === 'COMPLETED' || t.status === 'CANCELLED') && (!t.approvalRequired || t.approvalStatus === 'APPROVED'),
  )
}

const STAGE_STATUS_MAP: Record<string, ApplicationStatus> = {}
void STAGE_STATUS_MAP

export async function advanceWorkflow(
  applicationId: string,
  actor?: { name: string; id?: string } | null,
): Promise<string> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { tasks: true, client: { select: { userId: true } } },
  })
  if (!app) throw new HttpError(404, 'NOT_FOUND', 'Application not found.')
  const clientUserId = app.client?.userId

  const snapshot = JSON.parse(app.configSnapshot) as ConfigSnapshot
  const stages = [...(snapshot.workflow?.stages || [])].sort((a, b) => a.sequence - b.sequence)
  if (stages.length === 0) return app.status

  // Unlock dependent tasks whose dependencies are all complete.
  const completedCodes = new Set(app.tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.templateCode))
  for (const t of app.tasks) {
    if (t.status !== 'PENDING') continue
    const deps = JSON.parse(t.dependsOnCodes || '[]') as string[]
    if (deps.length > 0 && deps.every((d) => completedCodes.has(d)) && !t.assignedToId) {
      await autoAssignTask(t.id)
    }
  }

  const nextIncomplete = stages.find((s) => !stageComplete(app.tasks, s.code))
  const previousStage = app.currentStageCode

  if (!nextIncomplete) {
    // All stages complete -> application completed.
    if (app.status !== 'COMPLETED') {
      await db.application.update({
        where: { id: applicationId },
        data: { status: 'COMPLETED', completedAt: new Date(), currentStageCode: null },
      })
      await db.applicationStatusHistory.create({
        data: { applicationId, fromStatus: app.status, toStatus: 'COMPLETED', actorId: actor?.id, actorName: actor?.name ?? 'System', remarks: 'All workflow stages completed.' },
      })
      await db.applicationEvent.create({
        data: { applicationId, type: 'STAGE_ADVANCED', actorName: actor?.name ?? 'System', payload: JSON.stringify({ to: 'COMPLETED' }) },
      })
      if (clientUserId) {
        await notify({ userId: clientUserId, title: 'Application completed', body: `Application ${app.referenceNo} has been completed.`, type: 'APPLICATION', linkView: `applications:${app.id}` })
      }
      // Generate future compliance obligations from the frozen config (demo-marked until verified).
      await generateComplianceObligations(applicationId, snapshot)
      return 'COMPLETED'
    }
    return app.status
  }

  if (previousStage !== nextIncomplete.code) {
    const status: ApplicationStatus = mapStageToStatus(nextIncomplete)
    await db.application.update({
      where: { id: applicationId },
      data: { currentStageCode: nextIncomplete.code, status },
    })
    await db.applicationStatusHistory.create({
      data: { applicationId, fromStatus: app.status, toStatus: status, actorId: actor?.id, actorName: actor?.name ?? 'System', remarks: `Advanced to stage: ${nextIncomplete.name}` },
    })
    await db.applicationEvent.create({
      data: { applicationId, type: 'STAGE_ADVANCED', actorName: actor?.name ?? 'System', payload: JSON.stringify({ from: previousStage, to: nextIncomplete.code }) },
    })
    if (clientUserId) {
      await notify({
        userId: clientUserId,
        title: 'Application progress update',
        body: `Application ${app.referenceNo} moved to "${nextIncomplete.name}".`,
        type: 'APPLICATION',
        linkView: `applications:${app.id}`,
      })
    }
  }
  return nextIncomplete.code
}

function mapStageToStatus(stage: StageSnapshot): ApplicationStatus {
  switch (stage.stageType) {
    case 'PROFESSIONAL_APPROVAL': return 'PROFESSIONAL_REVIEW'
    case 'GOVERNMENT': return 'GOVERNMENT_SUBMISSION'
    case 'CLIENT_ACTION': return 'CLIENT_INFO_REQUESTED'
    case 'CLOSURE': return 'IN_PROGRESS'
    default: return 'IN_PROGRESS'
  }
}

export async function generateComplianceObligations(applicationId: string, snapshot: ConfigSnapshot): Promise<void> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { service: { select: { code: true } }, client: { select: { userId: true } } } })
  if (!app) return
  const rules = (snapshot.complianceRules || []) as {
    code: string; title: string; frequency: string; dueRule: string; offsetDays: number; applicabilityRule?: unknown; note?: string; demoMarked?: boolean
  }[]
  const answers: Answers = JSON.parse(app.formData)
  const now = new Date()
  for (const r of rules) {
    if (r.applicabilityRule && !evaluateNode(r.applicabilityRule as never, answers)) continue

    // The obligation inherits the case's chosen period where meaningful (R-02);
    // recurring obligations target the current statutory period for their frequency.
    const periodLabel =
      app.periodType === 'ASSESSMENT_YEAR' && (r.frequency === 'ANNUAL' || r.frequency === 'EVENT')
        ? app.periodLabel
        : app.periodType === 'TAX_PERIOD' && r.frequency === 'EVENT'
          ? app.periodLabel
          : currentPeriodLabelFor(r.frequency, now)

    // R-04: prefer a CA-verified date from the statutory due-date master over the
    // demonstration offset. Demo-marked master rows still win over raw offsets but
    // keep the demo flag so nobody relies on them unverified.
    const sdd = await db.statutoryDueDate.findFirst({
      where: {
        serviceCode: app.service.code,
        obligationCode: r.code,
        ...(periodLabel ? { periodLabel } : {}),
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { verifiedAt: 'desc' },
    })

    const due = sdd ? sdd.dueDate : new Date(now.getTime() + (r.offsetDays ?? 30) * 24 * 3600 * 1000)
    const internalTarget = new Date(due.getTime() - 5 * 24 * 3600 * 1000)
    const noteParts = [
      r.note,
      sdd
        ? `Due date from ${sdd.demoMarked ? 'DEMO-MARKED' : 'verified'} due-date master${sdd.sourceReferenceId ? ' (source registry)' : ''}${sdd.extensionNotified ? ` — extension notified: ${sdd.extensionNote || 'yes'}` : ''}`
        : `Due rule: ${r.dueRule} — no verified date in the due-date master yet; date is a demonstration estimate.`,
    ]
    await db.complianceObligation.create({
      data: {
        clientId: app.clientId,
        businessId: app.businessId,
        serviceId: app.serviceId,
        applicationId,
        code: r.code,
        title: r.title,
        frequency: r.frequency,
        periodLabel,
        dueDate: due,
        internalTargetDate: internalTarget,
        status: 'PENDING',
        note: noteParts.filter(Boolean).join(' — ') || null,
        demoMarked: sdd ? sdd.demoMarked : r.demoMarked !== false,
      },
    })
  }
  if (app.client?.userId) {
    await notify({
      userId: app.client.userId,
      title: 'Compliance calendar updated',
      body: 'Upcoming statutory obligations have been added for this business. Verify details with your assigned professional.',
      type: 'COMPLIANCE',
      linkView: 'compliance',
    })
  }
}

// Gate: government submission tasks may only complete with all required docs approved.
export async function assertGovStageReady(applicationId: string): Promise<void> {
  const checklist = JSON.parse(await db.application.findUnique({ where: { id: applicationId } }).then((a) => a?.checklist || '[]') || '[]') as { requirementCode: string; status: string }[]
  const requiredCodes = checklist.filter((c) => c.status === 'REQUIRED').map((c) => c.requirementCode)
  const docs = await db.uploadedDocument.findMany({ where: { applicationId } })
  for (const code of requiredCodes) {
    const approved = docs.some((d) => d.requirementCode === code && d.status === 'APPROVED')
    if (!approved) {
      throw new HttpError(422, 'DOCS_PENDING', `Document "${code}" must be verified and approved before government submission.`)
    }
  }
}
