import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { jsonError, ok, str } from '@/lib/api-utils'

// GET /api/compliance — role-scoped compliance obligations.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const where: Record<string, unknown> = {}
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) return ok({ obligations: [] })
      where.clientId = client.id
    }
    const statusFilter = req.nextUrl.searchParams.get('status') || undefined
    if (statusFilter) where.status = statusFilter

    const obligations = await db.complianceObligation.findMany({
      where,
      include: { filings: { orderBy: { recordedAt: 'desc' }, take: 3 }, business: { select: { legalName: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    })
    return ok({
      obligations: obligations.map((o) => ({
        id: o.id, code: o.code, title: o.title, frequency: o.frequency,
        periodLabel: o.periodLabel, dueDate: o.dueDate, internalTargetDate: o.internalTargetDate,
        status: o.status, note: o.note, demoMarked: o.demoMarked,
        businessName: o.business?.legalName ?? null,
        filings: o.filings.map((f) => ({ id: f.id, acknowledgementNo: f.acknowledgementNo, officialStatus: f.officialStatus, recordedAt: f.recordedAt, recordedByName: f.recordedByName, evidenceNote: f.evidenceNote })),
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/compliance — create a manual obligation (staff only).
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') {
      throw new HttpError(403, 'FORBIDDEN', 'Staff only.')
    }
    const body = await req.json() as { clientId?: string; businessId?: string; code?: string; title?: string; frequency?: string; dueDate?: string; note?: string }
    const { audit } = await import('@/lib/audit')
    if (!body.clientId || !body.code || !body.title || !body.dueDate) {
      throw new HttpError(400, 'BAD_REQUEST', 'clientId, code, title and dueDate are required.')
    }
    const obligation = await db.complianceObligation.create({
      data: {
        clientId: body.clientId,
        businessId: body.businessId || null,
        code: str(body.code).toUpperCase(),
        title: body.title,
        frequency: ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'EVENT'].includes(body.frequency || '') ? body.frequency! : 'EVENT',
        dueDate: new Date(body.dueDate),
        internalTargetDate: new Date(new Date(body.dueDate).getTime() - 5 * 24 * 3600 * 1000),
        status: 'PENDING',
        note: body.note || null,
        demoMarked: false,
      },
    })
    await audit({ actor: ctx, action: 'COMPLIANCE_OBLIGATION_CREATED', entity: 'ComplianceObligation', entityId: obligation.id })
    return ok({ obligation: { id: obligation.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
