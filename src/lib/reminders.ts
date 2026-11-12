import { db } from './db'
import { notify, notifyRole } from './audit'

// =====================================================================
// Reminder & escalation engine (PDF §5.C loop; gap R-03).
// A scheduled sweep (see src/instrumentation.ts and POST /api/reminders/run)
// scans open obligations and pending information requests against the
// configured ReminderPolicy masters and creates deduplicated notifications:
//   EARLY  — at each configured interval before the due date (e.g. 15/7/2 days)
//   DUE    — on the due date
//   OVERDUE— repeated every policy.repeatEveryDays while still pending
//   ESCALATION — after policy.escalateAfterDays past due, to the role in policy
//   INFO_REQUEST — client nudges while a case waits for the client's reply
// Reminders are internal prompts only; they never imply anything was filed.
// =====================================================================

const DAY_MS = 24 * 3600 * 1000

interface PolicyShape {
  id: string
  appliesTo: string
  serviceId: string | null
  intervalsDays: string
  repeatEveryDays: number
  escalateAfterDays: number
  escalateToRole: string
  channel?: string
}

function parseIntervals(raw: string): number[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return [15, 7, 2]
    return arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a)
  } catch {
    return [15, 7, 2]
  }
}

async function policiesFor(kind: 'COMPLIANCE' | 'INFO_REQUEST'): Promise<PolicyShape[]> {
  return db.reminderPolicy.findMany({ where: { appliesTo: kind, active: true } })
}

function pickPolicy(list: PolicyShape[], serviceId: string | null): PolicyShape | null {
  if (serviceId) {
    const specific = list.find((p) => p.serviceId === serviceId)
    if (specific) return specific
  }
  return list.find((p) => p.serviceId === null) ?? list[0] ?? null
}

export interface SweepResult {
  early: number
  dueToday: number
  overdue: number
  escalations: number
  infoRequests: number
  skippedPolicyless: number
}

export async function runReminderSweep(actorName = 'System (reminder engine)'): Promise<SweepResult> {
  const now = new Date()
  const result: SweepResult = { early: 0, dueToday: 0, overdue: 0, escalations: 0, infoRequests: 0, skippedPolicyless: 0 }

  // ---------- Compliance obligation reminders ----------
  const compliancePolicies = await policiesFor('COMPLIANCE')
  const obligations = await db.complianceObligation.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
    include: { client: { include: { user: true } } },
    take: 500,
    orderBy: { dueDate: 'asc' },
  })

  for (const o of obligations) {
    const policy = pickPolicy(compliancePolicies, o.serviceId)
    if (!policy) { result.skippedPolicyless += 1; continue }
    const intervals = parseIntervals(policy.intervalsDays)
    const daysToDue = Math.floor((o.dueDate.getTime() - now.getTime()) / DAY_MS)
    const clientUserId = o.client?.user?.id
    if (!clientUserId) continue

    const maxInterval = intervals[0] ?? 15
    if (daysToDue > maxInterval) continue

    const existing = await db.reminderLog.findMany({
      where: { obligationId: o.id },
      orderBy: { sentAt: 'desc' },
      take: 50,
    })
    const has = (kind: string, daysBefore?: number) =>
      existing.some((l) => l.kind === kind && (daysBefore === undefined || l.daysBefore === daysBefore))
    const sentWithin = (kind: string, days: number) =>
      existing.some((l) => l.kind === kind && now.getTime() - l.sentAt.getTime() < days * DAY_MS)

    const periodTag = o.periodLabel ? ` (${o.periodLabel})` : ''
    const demoTag = o.demoMarked ? ' Note: this due date is a demonstration value pending professional verification.' : ''

    // EARLY: one reminder per configured interval boundary.
    for (const i of intervals) {
      if (daysToDue <= i && daysToDue > 0 && !has('EARLY', i)) {
        await notify({
          userId: clientUserId,
          title: `Upcoming statutory deadline: ${o.title}`,
          body: `Due ${o.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — ${daysToDue} day(s) left${periodTag}.${demoTag} Please share pending details/documents with your team.`,
          type: 'COMPLIANCE',
          linkView: 'compliance',
        })
        await db.reminderLog.create({
          data: { obligationId: o.id, applicationId: o.applicationId, policyId: policy.id, recipientId: clientUserId, kind: 'EARLY', daysBefore: i, message: `${daysToDue} days before due`, channel: policy.channel },
        })
        result.early += 1
      }
    }

    // DUE: on the due date itself.
    if (daysToDue === 0 && !has('DUE')) {
      await notify({
        userId: clientUserId,
        title: `Due today: ${o.title}`,
        body: `The statutory deadline for ${o.title}${periodTag} is today.${demoTag}`,
        type: 'COMPLIANCE',
        linkView: 'compliance',
      })
      await db.reminderLog.create({ data: { obligationId: o.id, applicationId: o.applicationId, policyId: policy.id, recipientId: clientUserId, kind: 'DUE', daysBefore: 0, message: 'Due today', channel: policy.channel } })
      result.dueToday += 1
    }

    // OVERDUE: repeat while pending.
    if (daysToDue < 0) {
      const overdueDays = Math.abs(daysToDue)
      if (!sentWithin('OVERDUE', Math.max(1, policy.repeatEveryDays))) {
        await notify({
          userId: clientUserId,
          title: `Overdue: ${o.title}`,
          body: `This obligation${periodTag} was due ${o.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} and is still open (${overdueDays} day(s) overdue).${demoTag}`,
          type: 'COMPLIANCE',
          linkView: 'compliance',
        })
        await db.reminderLog.create({ data: { obligationId: o.id, applicationId: o.applicationId, policyId: policy.id, recipientId: clientUserId, kind: 'OVERDUE', message: `${overdueDays} days overdue`, channel: policy.channel } })
        result.overdue += 1
      }
      // ESCALATION: to the configured role after escalateAfterDays past due.
      if (overdueDays >= policy.escalateAfterDays && !sentWithin('ESCALATION', Math.max(1, policy.repeatEveryDays))) {
        await notifyRole({
          roles: [policy.escalateToRole, 'ADMIN', 'SUPER_ADMIN'],
          title: `Escalation: overdue obligation for ${o.client?.user?.name ?? 'a client'}`,
          body: `${o.title}${periodTag} is ${overdueDays} day(s) past its due date and remains unfiled. Owner review is needed.`,
          type: 'COMPLIANCE',
          linkView: 'compliance',
        })
        await db.reminderLog.create({ data: { obligationId: o.id, applicationId: o.applicationId, policyId: policy.id, recipientId: policy.id ? 'ROLE_ESCALATION' : 'ROLE_ESCALATION', kind: 'ESCALATION', message: `Escalated to ${policy.escalateToRole} after ${overdueDays} days overdue`, channel: policy.channel } })
        result.escalations += 1
      }
    }
  }

  // ---------- Client information-request reminders ----------
  const infoPolicies = await policiesFor('INFO_REQUEST')
  const waitingApps = await db.application.findMany({
    where: { status: 'CLIENT_INFO_REQUESTED' },
    include: { client: { include: { user: true } }, events: { where: { type: 'INFO_REQUESTED' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    take: 200,
  })
  for (const app of waitingApps) {
    const policy = pickPolicy(infoPolicies, app.serviceId)
    if (!policy) { result.skippedPolicyless += 1; continue }
    const lastRequest = app.events[0]
    if (!lastRequest || !app.client?.user?.id) continue
    const daysPending = Math.floor((now.getTime() - lastRequest.createdAt.getTime()) / DAY_MS)
    const intervals = parseIntervals(policy.intervalsDays)
    const trigger = intervals.length > 0 ? Math.max(...intervals) : 7
    if (daysPending < trigger) continue
    const recent = await db.reminderLog.findFirst({
      where: { applicationId: app.id, kind: 'INFO_REQUEST', sentAt: { gte: new Date(now.getTime() - Math.max(1, policy.repeatEveryDays) * DAY_MS) } },
    })
    if (recent) continue
    await notify({
      userId: app.client.user.id,
      title: `Action needed: reply to information request`,
      body: `Application ${app.referenceNo} has been waiting for your information/documents for ${daysPending} day(s). Reply from the application page to keep processing on track.`,
      type: 'APPLICATION',
      linkView: `applications:${app.id}`,
    })
    await db.reminderLog.create({ data: { applicationId: app.id, policyId: policy.id, recipientId: app.client.user.id, kind: 'INFO_REQUEST', message: `Info request pending ${daysPending} days`, channel: policy.channel } })
    result.infoRequests += 1
  }

  if (result.early + result.dueToday + result.overdue + result.escalations + result.infoRequests > 0) {
    await db.auditLog.create({
      data: {
        actorName,
        action: 'REMINDER_SWEEP_RAN',
        entity: 'System',
        details: JSON.stringify(result),
      },
    }).catch(() => undefined)
  }
  return result
}
