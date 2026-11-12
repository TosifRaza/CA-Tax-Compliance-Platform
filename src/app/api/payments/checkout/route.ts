import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok } from '@/lib/api-utils'

// POST /api/payments/checkout — create a PENDING payment (simulated hosted checkout).
// NOTE: No real gateway credentials exist in this environment. This endpoint models the
// hosted-checkout flow: it never marks a payment SUCCESS. Only the gateway webhook
// (/api/payments/webhook) may confirm a payment, and it is idempotent.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await (async () => { try { return await req.json() as { quotationId?: string } } catch { return {} } })()
    const quotationId = String(body.quotationId || '')
    const quotation = await db.quotation.findUnique({ where: { id: quotationId }, include: { application: { include: { client: { include: { user: true } } } }, payments: true } })
    if (!quotation) throw new HttpError(404, 'NOT_FOUND', 'Quotation not found.')
    if (quotation.application.client.user.id !== ctx.userId) throw new HttpError(403, 'FORBIDDEN', 'Only the application owner can pay.')
    if (quotation.status !== 'ACCEPTED') throw new HttpError(422, 'NOT_ACCEPTED', 'Accept the quotation before payment.')

    const pending = quotation.payments.find((p) => p.status === 'PENDING')
    if (pending) return ok({ payment: { id: pending.id, amount: pending.amount, status: pending.status }, checkoutUrl: `/#/checkout:${pending.id}` })

    const payment = await db.payment.create({
      data: {
        quotationId,
        amount: quotation.total,
        method: 'DEMO_GATEWAY',
        idempotencyKey: `chk_${randomBytes(16).toString('hex')}`,
        status: 'PENDING',
      },
    })
    await audit({ actor: ctx, action: 'PAYMENT_INITIATED', entity: 'Payment', entityId: payment.id, details: { quotationId, amount: quotation.total } })
    return ok({ payment: { id: payment.id, amount: payment.amount, status: payment.status }, checkoutUrl: `/#/checkout:${payment.id}` }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
