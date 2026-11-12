import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok } from '@/lib/api-utils'

// POST /api/quotations/[id]/accept — client accepts the quotation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const quotation = await db.quotation.findUnique({ where: { id }, include: { application: { include: { client: { include: { user: true } } } } } })
    if (!quotation) throw new HttpError(404, 'NOT_FOUND', 'Quotation not found.')
    if (quotation.application.client.user.id !== ctx.userId) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the application owner can accept this quotation.')
    }
    if (quotation.status !== 'SENT') throw new HttpError(422, 'NOT_ACCEPTABLE', `Quotation is ${quotation.status}; it cannot be accepted.`)

    await db.quotation.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    await db.applicationEvent.create({
      data: { applicationId: quotation.applicationId, type: 'QUOTATION_ACCEPTED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ quotationId: id, total: quotation.total }) },
    })
    await audit({ actor: ctx, action: 'QUOTATION_ACCEPTED', entity: 'Quotation', entityId: id, details: { applicationId: quotation.applicationId, total: quotation.total } })
    await notify({ userId: ctx.userId, title: 'Quotation accepted', body: `You can proceed to payment from the application page.`, type: 'PAYMENT', linkView: `applications:${quotation.applicationId}` })
    return ok({ status: 'ACCEPTED' })
  } catch (e) {
    return jsonError(e)
  }
}
