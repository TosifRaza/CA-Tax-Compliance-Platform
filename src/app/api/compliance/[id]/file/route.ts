import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// POST /api/compliance/[id]/file — record a filing with mandatory evidence.
// A reminder or internal completion is NOT proof of filing: the acknowledgement
// reference (and optionally evidence note) must be recorded by an authorized user.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Staff only.')
    const { id } = await params
    const body = await parseJson<{ acknowledgementNo?: string; officialStatus?: string; evidenceNote?: string; submissionMethod?: string }>(req)
    const ack = str(body.acknowledgementNo)
    const evidenceNote = str(body.evidenceNote)
    if (!ack) throw new HttpError(422, 'ACK_REQUIRED', 'An official acknowledgement/reference number is required to mark an obligation as filed.')
    if (!evidenceNote) throw new HttpError(422, 'EVIDENCE_REQUIRED', 'Evidence of filing (portal confirmation note) is required.')

    const obligation = await db.complianceObligation.findUnique({ where: { id }, include: { client: { select: { userId: true } } } })
    if (!obligation) throw new HttpError(404, 'NOT_FOUND', 'Obligation not found.')
    if (obligation.status === 'FILED') throw new HttpError(422, 'ALREADY_FILED', 'This obligation is already recorded as filed.')

    await db.$transaction(async (tx) => {
      await tx.filingRecord.create({
        data: {
          obligationId: id,
          submissionMethod: str(body.submissionMethod) || 'Manual filing on official portal',
          acknowledgementNo: ack,
          officialStatus: str(body.officialStatus) || 'FILED_EVIDENCE_RECORDED',
          evidenceNote,
          recordedById: ctx.userId,
          recordedByName: ctx.name,
        },
      })
      await tx.complianceObligation.update({ where: { id }, data: { status: 'FILED' } })
    })
    if (obligation.client?.userId) {
      await notify({ userId: obligation.client.userId, title: 'Compliance filing recorded', body: `${obligation.title} recorded as filed (Ref: ${ack}).`, type: 'COMPLIANCE', linkView: 'compliance' })
    }
    await audit({ actor: ctx, action: 'COMPLIANCE_FILED', entity: 'ComplianceObligation', entityId: id, details: { ack } })
    return ok({ status: 'FILED' })
  } catch (e) {
    return jsonError(e)
  }
}
