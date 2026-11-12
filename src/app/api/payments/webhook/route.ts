import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'
import { HttpError } from '@/lib/types'

// POST /api/payments/webhook — gateway callback (idempotent).
//
// SECURITY MODEL
// The webhook is signature-verified with PAYMENT_WEBHOOK_SECRET (HMAC-SHA256 over the
// raw body). In this sandbox no real gateway exists, so if the secret env var is not
// configured the endpoint runs in DEMO mode and only accepts events where
// `demo: true` is explicitly set in the payload. A production deployment MUST set the
// secret; demo-mode then disables automatically.
//
// IDEMPOTENCY: the gateway's `idempotencyKey` is unique-constrained in the database.
// Duplicate or delayed deliveries return the original outcome without creating a
// second successful payment. Client-side redirects can never confirm a payment.
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const secret = process.env.PAYMENT_WEBHOOK_SECRET
    if (secret) {
      const sig = req.headers.get('x-payment-signature') || ''
      const expected = createHmac('sha256', secret).update(raw).digest('hex')
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new HttpError(401, 'BAD_SIGNATURE', 'Webhook signature verification failed.')
      }
    }

    const body = JSON.parse(raw) as {
      paymentId?: string
      gatewayRef?: string
      status?: string
      demo?: boolean
    }
    const paymentId = str(body.paymentId)
    const status = str(body.status).toUpperCase()
    if (!paymentId) throw new HttpError(400, 'BAD_REQUEST', 'paymentId is required.')
    if (!['SUCCESS', 'FAILED'].includes(status)) throw new HttpError(400, 'BAD_REQUEST', 'status must be SUCCESS or FAILED.')
    if (!secret && !body.demo) {
      throw new HttpError(401, 'DEMO_MODE', 'Webhook secret not configured; only explicit demo events are accepted.')
    }

    const payment = await db.payment.findUnique({ where: { id: paymentId } })
    if (!payment) {
      // Webhook for an unknown payment — reject rather than fabricate a payment.
      throw new HttpError(404, 'UNKNOWN_PAYMENT', 'No matching payment for this reference.')
    }
    if (payment.status !== 'PENDING') {
      // IDEMPOTENCY: duplicate or delayed gateway deliveries never re-record.
      return ok({ paymentId: payment.id, status: payment.status, duplicate: true })
    }

    const updated = await db.$transaction(async (tx) => {
      const fresh = await tx.payment.findUnique({ where: { id: paymentId } })
      if (!fresh || fresh.status !== 'PENDING') return fresh
      return tx.payment.update({
        where: { id: paymentId },
        data: {
          status,
          gatewayRef: str(body.gatewayRef) || fresh.gatewayRef,
          failureReason: status === 'FAILED' ? 'Gateway reported failure.' : null,
          confirmedAt: status === 'SUCCESS' ? new Date() : null,
        },
      })
    })

    if (updated) {
      await audit({ action: `PAYMENT_${status}`, entity: 'Payment', entityId: updated.id, details: { paymentId, gatewayRef: updated.gatewayRef } })
      if (status === 'SUCCESS') {
        const q = await db.quotation.findUnique({ where: { id: updated.quotationId }, include: { application: { include: { client: { include: { user: true } } } } } })
        if (q) {
          await notify({
            userId: q.application.client.user.id,
            title: 'Payment confirmed',
            body: `Payment of INR ${updated.amount} confirmed for ${q.application.referenceNo}.`,
            type: 'PAYMENT',
            linkView: `applications:${q.applicationId}`,
          })
        }
      }
    }
    return ok({ paymentId: updated?.id, status: updated?.status ?? 'IGNORED' })
  } catch (e) {
    return jsonError(e)
  }
}
