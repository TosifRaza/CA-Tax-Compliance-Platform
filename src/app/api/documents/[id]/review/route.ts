import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// POST /api/documents/[id]/review — approve/reject with a mandatory reason on rejection.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole(req, ['EMPLOYEE', 'MANAGER', 'CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await parseJson<{ decision?: string; notes?: string }>(req)
    const decision = str(body.decision).toUpperCase()
    const notes = str(body.notes)
    if (!['APPROVE', 'REJECT'].includes(decision)) throw new HttpError(400, 'BAD_REQUEST', 'decision must be APPROVE or REJECT.')
    if (decision === 'REJECT' && !notes) throw new HttpError(422, 'REASON_REQUIRED', 'A rejection reason is required so the client can correct it.')

    const doc = await db.uploadedDocument.findUnique({
      where: { id },
      include: { application: { include: { client: { include: { user: true } } } } },
    })
    if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found.')
    if (doc.status !== 'PENDING') throw new HttpError(422, 'ALREADY_REVIEWED', 'This document has already been reviewed.')

    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    await db.$transaction(async (tx) => {
      await tx.uploadedDocument.update({
        where: { id },
        data: { status, reviewNotes: notes || null, reviewedById: ctx.userId, reviewedAt: new Date() },
      })
      // If a rejected file has an approved predecessor, keep the predecessor active.
      await tx.applicationEvent.create({
        data: {
          applicationId: doc.applicationId, type: 'DOC_REVIEWED',
          actorId: ctx.userId, actorName: ctx.name,
          payload: JSON.stringify({ requirementCode: doc.requirementCode, decision, notes }),
        },
      })
    })

    await notify({
      userId: doc.application.client.user.id,
      title: decision === 'APPROVE' ? 'Document approved' : 'Document needs correction',
      body: decision === 'APPROVE'
        ? `Your document "${doc.fileName}" was approved.`
        : `Your document "${doc.fileName}" was rejected. Reason: ${notes}`,
      type: 'APPLICATION',
      linkView: `applications:${doc.applicationId}`,
    })
    await audit({ actor: ctx, action: `DOCUMENT_${status}`, entity: 'UploadedDocument', entityId: id, details: { applicationId: doc.applicationId, requirementCode: doc.requirementCode } })
    return ok({ status })
  } catch (e) {
    return jsonError(e)
  }
}
