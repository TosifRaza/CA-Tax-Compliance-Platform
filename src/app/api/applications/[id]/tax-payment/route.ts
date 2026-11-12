import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { loadApplicationFor } from '@/lib/applications'
import { jsonError, ok, parseJson, str, intOrNull } from '@/lib/api-utils'

// =====================================================================
// Client's own tax payment tracking per case (R-06).
// Distinct from Quotation/Payment (the FIRM's professional fee): this is
// the client's statutory liability (self-assessment tax, advance tax,
// TDS interest, GST cash ledger etc.) with its own status and evidence.
// =====================================================================

const LIABILITY_TYPES = ['SELF_ASSESSMENT', 'ADVANCE_TAX', 'TDS', 'GST_CASH', 'OTHER']
const STATUSES = ['PENDING', 'PAID', 'WAIVED', 'NOT_APPLICABLE']

// GET /api/applications/[id]/tax-payment — list tax payment records for the case.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    await loadApplicationFor(ctx, id)
    const rows = await db.taxPayment.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' } })
    return ok({ taxPayments: rows })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/applications/[id]/tax-payment — staff records a tax liability item.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Only firm staff can record tax payment items.')
    const { id } = await params
    const app = await loadApplicationFor(ctx, id)
    const body = await parseJson<{
      liabilityType?: string; periodLabel?: string; amount?: number; status?: string
      dueDate?: string; challanRef?: string; evidenceNote?: string
    }>(req)
    const liabilityType = LIABILITY_TYPES.includes(body.liabilityType || '') ? body.liabilityType! : 'SELF_ASSESSMENT'
    const status = STATUSES.includes(body.status || '') ? body.status! : 'PENDING'
    const amount = Math.max(0, intOrNull(body.amount) ?? 0)
    const challanRef = str(body.challanRef) || null
    if (status === 'PAID' && !challanRef) {
      throw new HttpError(422, 'CHALLAN_REQUIRED', 'A challan/portal reference is required to mark the client’s tax as paid.')
    }
    const row = await db.taxPayment.create({
      data: {
        applicationId: id,
        liabilityType,
        periodLabel: str(body.periodLabel) || app.periodLabel,
        amount,
        status,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        paidOn: status === 'PAID' ? new Date() : null,
        challanRef,
        evidenceNote: str(body.evidenceNote) || null,
        recordedById: ctx.userId,
        recordedByName: ctx.name,
        verifiedAt: status === 'PAID' ? new Date() : null,
      },
    })
    await db.applicationEvent.create({
      data: { applicationId: id, type: 'TAX_PAYMENT_RECORDED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ liabilityType, amount, status }) },
    })
    const clientUser = await db.client.findUnique({ where: { id: app.clientId }, include: { user: true } })
    if (clientUser) {
      await notify({
        userId: clientUser.user.id,
        title: status === 'PAID' ? 'Tax payment recorded as paid' : 'Tax payment status updated',
        body: `${liabilityType.replaceAll('_', ' ').toLowerCase()} of ₹${amount.toLocaleString('en-IN')} — status: ${status}. This is your own tax liability, separate from the firm's professional fee.`,
        type: 'PAYMENT',
        linkView: `applications:${id}`,
      })
    }
    await audit({ actor: ctx, action: 'TAX_PAYMENT_RECORDED', entity: 'TaxPayment', entityId: row.id, details: { applicationId: id, liabilityType, amount, status } })
    return ok({ taxPayment: { id: row.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/applications/[id]/tax-payment — update status/evidence of a record.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Only firm staff can update tax payment status.')
    const { id } = await params
    const app = await loadApplicationFor(ctx, id)
    const body = await parseJson<{ taxPaymentId?: string; status?: string; challanRef?: string; evidenceNote?: string; paidOn?: string }>(req)
    const tpId = str(body.taxPaymentId)
    if (!tpId) throw new HttpError(400, 'BAD_REQUEST', 'taxPaymentId is required.')
    const existing = await db.taxPayment.findUnique({ where: { id: tpId } })
    if (!existing || existing.applicationId !== id) throw new HttpError(404, 'NOT_FOUND', 'Tax payment record not found.')

    const data: Record<string, unknown> = {}
    if (body.status && STATUSES.includes(body.status)) {
      data.status = body.status
      if (body.status === 'PAID') {
        const challanRef = str(body.challanRef) || existing.challanRef
        if (!challanRef) throw new HttpError(422, 'CHALLAN_REQUIRED', 'A challan/portal reference is required to mark the client’s tax as paid.')
        data.challanRef = challanRef
        data.paidOn = body.paidOn ? new Date(body.paidOn) : new Date()
        data.verifiedAt = new Date()
      }
    }
    if (body.challanRef !== undefined && body.status !== 'PAID') data.challanRef = str(body.challanRef) || null
    if (body.evidenceNote !== undefined) data.evidenceNote = str(body.evidenceNote) || null

    const row = await db.taxPayment.update({ where: { id: tpId }, data })
    await db.applicationEvent.create({
      data: { applicationId: id, type: 'TAX_PAYMENT_RECORDED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ taxPaymentId: tpId, status: row.status }) },
    })
    const clientUser = await db.client.findUnique({ where: { id: app.clientId }, include: { user: true } })
    if (clientUser) {
      await notify({
        userId: clientUser.user.id,
        title: 'Tax payment status updated',
        body: `${existing.liabilityType.replaceAll('_', ' ').toLowerCase()} is now marked ${row.status}.`,
        type: 'PAYMENT',
        linkView: `applications:${id}`,
      })
    }
    await audit({ actor: ctx, action: 'TAX_PAYMENT_UPDATED', entity: 'TaxPayment', entityId: tpId, details: data })
    return ok({ taxPayment: { id: row.id, status: row.status } })
  } catch (e) {
    return jsonError(e)
  }
}
