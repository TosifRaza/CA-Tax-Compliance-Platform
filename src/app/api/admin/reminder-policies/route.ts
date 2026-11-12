import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str, intOrNull } from '@/lib/api-utils'

const APPLIES_TO = ['COMPLIANCE', 'INFO_REQUEST', 'TASK']

// GET /api/admin/reminder-policies — list reminder policy masters (R-03).
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const policies = await db.reminderPolicy.findMany({ orderBy: [{ appliesTo: 'asc' }, { createdAt: 'asc' }] })
    return ok({
      policies: policies.map((p) => ({ ...p, intervals: JSON.parse(p.intervalsDays) as number[] })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/reminder-policies — create a policy (firm default or per service).
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'])
    const body = await parseJson<{
      name?: string; appliesTo?: string; serviceId?: string | null; intervals?: number[]
      repeatEveryDays?: number; escalateAfterDays?: number; escalateToRole?: string; channel?: string
    }>(req)
    const name = str(body.name)
    const appliesTo = APPLIES_TO.includes(body.appliesTo || '') ? body.appliesTo! : 'COMPLIANCE'
    if (!name) throw new HttpError(400, 'BAD_REQUEST', 'Policy name is required.')
    const intervals = Array.isArray(body.intervals) ? body.intervals.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [15, 7, 2]
    if (intervals.length === 0) throw new HttpError(422, 'BAD_INTERVALS', 'At least one reminder interval (in days) is required.')
    const serviceId = body.serviceId || null
    if (serviceId) {
      const svc = await db.service.findUnique({ where: { id: serviceId } })
      if (!svc) throw new HttpError(404, 'NOT_FOUND', 'Service not found.')
    }
    const policy = await db.reminderPolicy.create({
      data: {
        name,
        appliesTo,
        serviceId,
        intervalsDays: JSON.stringify(intervals),
        repeatEveryDays: Math.max(1, intOrNull(body.repeatEveryDays) ?? 3),
        escalateAfterDays: Math.max(0, intOrNull(body.escalateAfterDays) ?? 3),
        escalateToRole: str(body.escalateToRole) || 'MANAGER',
        channel: str(body.channel) || 'IN_APP',
      },
    })
    await audit({ actor: ctx, action: 'REMINDER_POLICY_CREATED', entity: 'ReminderPolicy', entityId: policy.id, details: { name, appliesTo, serviceId } })
    return ok({ policy: { id: policy.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/admin/reminder-policies — update / activate / deactivate.
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'])
    const body = await parseJson<{
      id?: string; name?: string; intervals?: number[]; repeatEveryDays?: number
      escalateAfterDays?: number; escalateToRole?: string; channel?: string; active?: boolean
    }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = str(body.name)
    if (Array.isArray(body.intervals)) {
      const intervals = body.intervals.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      if (intervals.length === 0) throw new HttpError(422, 'BAD_INTERVALS', 'At least one reminder interval is required.')
      data.intervalsDays = JSON.stringify(intervals)
    }
    if (body.repeatEveryDays !== undefined) data.repeatEveryDays = Math.max(1, intOrNull(body.repeatEveryDays) ?? 3)
    if (body.escalateAfterDays !== undefined) data.escalateAfterDays = Math.max(0, intOrNull(body.escalateAfterDays) ?? 3)
    if (typeof body.escalateToRole === 'string') data.escalateToRole = str(body.escalateToRole) || 'MANAGER'
    if (typeof body.channel === 'string') data.channel = str(body.channel) || 'IN_APP'
    if (typeof body.active === 'boolean') data.active = body.active
    const policy = await db.reminderPolicy.update({ where: { id }, data })
    await audit({ actor: ctx, action: 'REMINDER_POLICY_UPDATED', entity: 'ReminderPolicy', entityId: id, details: data })
    return ok({ policy: { id: policy.id } })
  } catch (e) {
    return jsonError(e)
  }
}
