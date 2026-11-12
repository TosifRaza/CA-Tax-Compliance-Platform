import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// POST /api/applications/[id]/info-request — employee requests additional client information.
// Moves the application into CLIENT_INFO_REQUESTED; the client can then edit answers.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole(req, ['EMPLOYEE', 'MANAGER', 'CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await parseJson<{ message?: string }>(req)
    const message = str(body.message)
    if (!message) throw new HttpError(400, 'BAD_REQUEST', 'A message is required.')

    const app = await db.application.findUnique({ where: { id }, include: { client: { include: { user: true } } } })
    if (!app) throw new HttpError(404, 'NOT_FOUND', 'Application not found.')
    if (['COMPLETED', 'CANCELLED', 'REJECTED_BY_AUTHORITY'].includes(app.status)) {
      throw new HttpError(422, 'NOT_ALLOWED', 'This application is closed; information requests are not possible.')
    }

    await db.applicationEvent.create({
      data: { applicationId: id, type: 'INFO_REQUESTED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ message }) },
    })
    await db.application.update({ where: { id }, data: { status: 'CLIENT_INFO_REQUESTED' } })
    await db.applicationStatusHistory.create({
      data: { applicationId: id, fromStatus: app.status, toStatus: 'CLIENT_INFO_REQUESTED', actorId: ctx.userId, actorName: ctx.name, remarks: message },
    })
    await notify({
      userId: app.client.user.id,
      title: 'Additional information needed',
      body: `Application ${app.referenceNo}: ${message}`,
      type: 'APPLICATION',
      linkView: `applications:${id}`,
    })
    await audit({ actor: ctx, action: 'INFO_REQUESTED', entity: 'Application', entityId: id })
    return ok({ success: true })
  } catch (e) {
    return jsonError(e)
  }
}
