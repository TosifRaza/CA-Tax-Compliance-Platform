import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// =====================================================================
// Statutory due-date master (R-04): CA-verified dates per service,
// obligation and period, each carrying a source reference, an effective
// period and an optional notified extension. Obligation generation
// (lib/tasks.ts) prefers these dates over demonstration offsets.
// =====================================================================

function parseDate(v: unknown, field: string): Date {
  const d = new Date(String(v ?? ''))
  if (Number.isNaN(d.getTime())) throw new HttpError(422, 'BAD_DATE', `"${field}" must be a valid date.`)
  return d
}

// GET /api/admin/due-dates?serviceCode=&obligationCode= — list master rows.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'])
    const serviceCode = req.nextUrl.searchParams.get('serviceCode') || undefined
    const obligationCode = req.nextUrl.searchParams.get('obligationCode') || undefined
    const rows = await db.statutoryDueDate.findMany({
      where: {
        ...(serviceCode ? { serviceCode } : {}),
        ...(obligationCode ? { obligationCode } : {}),
      },
      include: { source: { select: { id: true, authority: true, title: true, url: true, verificationStatus: true } } },
      orderBy: [{ serviceCode: 'asc' }, { obligationCode: 'asc' }, { periodStart: 'desc' }],
      take: 500,
    })
    const services = await db.service.findMany({ select: { code: true, clientName: true }, orderBy: { code: 'asc' } })
    const sources = await db.sourceReference.findMany({ select: { id: true, authority: true, title: true }, orderBy: { title: 'asc' } })
    return ok({ dueDates: rows, services, sources })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/due-dates — create a due-date row.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'])
    const body = await parseJson<{
      serviceCode?: string; obligationCode?: string; frequency?: string; periodLabel?: string
      periodStart?: string; periodEnd?: string; dueDate?: string; sourceReferenceId?: string
      sourceNote?: string; effectiveFrom?: string; effectiveTo?: string; extensionNotified?: boolean
      extensionNote?: string; notes?: string
    }>(req)
    const serviceCode = str(body.serviceCode).toUpperCase()
    const obligationCode = str(body.obligationCode).toUpperCase()
    const periodLabel = str(body.periodLabel)
    if (!serviceCode || !obligationCode || !periodLabel) {
      throw new HttpError(400, 'BAD_REQUEST', 'serviceCode, obligationCode and periodLabel are required.')
    }
    if (!body.periodStart || !body.periodEnd || !body.dueDate) {
      throw new HttpError(400, 'BAD_REQUEST', 'periodStart, periodEnd and dueDate are required.')
    }
    const svc = await db.service.findUnique({ where: { code: serviceCode } })
    if (!svc) throw new HttpError(404, 'NOT_FOUND', `No service with code ${serviceCode}.`)
    if (body.sourceReferenceId) {
      const src = await db.sourceReference.findUnique({ where: { id: body.sourceReferenceId } })
      if (!src) throw new HttpError(404, 'NOT_FOUND', 'Source reference not found in the registry.')
    }
    const dup = await db.statutoryDueDate.findUnique({
      where: { serviceCode_obligationCode_periodLabel: { serviceCode, obligationCode, periodLabel } },
    })
    if (dup) throw new HttpError(409, 'DUPLICATE', `A due date for ${serviceCode}/${obligationCode}/${periodLabel} already exists — edit it instead.`)

    const row = await db.statutoryDueDate.create({
      data: {
        serviceCode,
        obligationCode,
        frequency: str(body.frequency) || 'EVENT',
        periodLabel,
        periodStart: parseDate(body.periodStart, 'periodStart'),
        periodEnd: parseDate(body.periodEnd, 'periodEnd'),
        dueDate: parseDate(body.dueDate, 'dueDate'),
        sourceReferenceId: body.sourceReferenceId || null,
        sourceNote: str(body.sourceNote) || null,
        effectiveFrom: body.effectiveFrom ? parseDate(body.effectiveFrom, 'effectiveFrom') : new Date(),
        effectiveTo: body.effectiveTo ? parseDate(body.effectiveTo, 'effectiveTo') : null,
        extensionNotified: !!body.extensionNotified,
        extensionNote: str(body.extensionNote) || null,
        notes: str(body.notes) || null,
        demoMarked: true, // stays demo until the verify action below
      },
    })
    await audit({ actor: ctx, action: 'STATUTORY_DUE_DATE_CREATED', entity: 'StatutoryDueDate', entityId: row.id, details: { serviceCode, obligationCode, periodLabel, dueDate: row.dueDate } })
    return ok({ dueDate: { id: row.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/admin/due-dates — update values, or { verify: true } to record the
// professional verification (clears the demo mark; records who verified).
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'KNOWLEDGE_MANAGER'])
    const body = await parseJson<{
      id?: string; dueDate?: string; periodStart?: string; periodEnd?: string
      sourceReferenceId?: string; sourceNote?: string; effectiveTo?: string
      extensionNotified?: boolean; extensionNote?: string; notes?: string
      verify?: boolean; active?: boolean
    }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const existing = await db.statutoryDueDate.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Due-date row not found.')

    const data: Record<string, unknown> = {}
    if (body.dueDate) data.dueDate = parseDate(body.dueDate, 'dueDate')
    if (body.periodStart) data.periodStart = parseDate(body.periodStart, 'periodStart')
    if (body.periodEnd) data.periodEnd = parseDate(body.periodEnd, 'periodEnd')
    if (body.sourceReferenceId !== undefined) data.sourceReferenceId = body.sourceReferenceId || null
    if (body.sourceNote !== undefined) data.sourceNote = str(body.sourceNote) || null
    if (body.effectiveTo !== undefined) data.effectiveTo = body.effectiveTo ? parseDate(body.effectiveTo, 'effectiveTo') : null
    if (typeof body.extensionNotified === 'boolean') data.extensionNotified = body.extensionNotified
    if (body.extensionNote !== undefined) data.extensionNote = str(body.extensionNote) || null
    if (body.notes !== undefined) data.notes = str(body.notes) || null
    if (typeof body.active === 'boolean') data.active = body.active

    if (body.verify) {
      if (!data.dueDate && !existing.sourceReferenceId && body.sourceReferenceId === undefined) {
        throw new HttpError(422, 'SOURCE_REQUIRED', 'Attach a source reference before verifying a due date.')
      }
      const srcId = body.sourceReferenceId !== undefined ? (body.sourceReferenceId || null) : existing.sourceReferenceId
      if (!srcId) throw new HttpError(422, 'SOURCE_REQUIRED', 'Verification requires an official source reference.')
      data.sourceReferenceId = srcId
      data.verifiedByUserId = ctx.userId
      data.verifiedByName = ctx.name
      data.verifiedAt = new Date()
      data.demoMarked = false
    }

    const row = await db.statutoryDueDate.update({ where: { id }, data })
    await audit({
      actor: ctx,
      action: body.verify ? 'STATUTORY_DUE_DATE_VERIFIED' : 'STATUTORY_DUE_DATE_UPDATED',
      entity: 'StatutoryDueDate',
      entityId: id,
      details: { serviceCode: row.serviceCode, obligationCode: row.obligationCode, periodLabel: row.periodLabel, ...data },
    })
    return ok({ dueDate: { id: row.id } })
  } catch (e) {
    return jsonError(e)
  }
}
