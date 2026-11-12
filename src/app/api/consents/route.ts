import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// =====================================================================
// Client consent & authorisation records (R-11).
// The PDF requires recorded client consent before personal tax data is
// retrieved or any integration is used. No integrations exist yet, so
// this module exists ahead of Stage 6 work and is mandatory before it.
// =====================================================================

// GET /api/consents — client sees own consents; staff can filter ?clientId=.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    let clientId: string | null = null
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) return ok({ consents: [] })
      clientId = client.id
    } else {
      clientId = req.nextUrl.searchParams.get('clientId') || null
    }
    const consents = await db.consentRecord.findMany({
      where: clientId ? { clientId } : {},
      orderBy: { grantedAt: 'desc' },
      take: 100,
    })
    return ok({ consents })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/consents — client grants a consent (or staff records it on their behalf).
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<{ scope?: string; purpose?: string; expiryAt?: string; evidenceNote?: string; clientId?: string }>(req)
    const scope = str(body.scope)
    const purpose = str(body.purpose)
    if (!scope || !purpose) throw new HttpError(400, 'BAD_REQUEST', 'scope and purpose are required.')

    let clientId: string
    let grantedByRole = 'CLIENT'
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) throw new HttpError(403, 'FORBIDDEN', 'Client profile missing.')
      clientId = client.id
    } else {
      clientId = str(body.clientId)
      grantedByRole = 'STAFF_ON_BEHALF'
      if (!clientId) throw new HttpError(400, 'BAD_REQUEST', 'clientId is required when staff record a consent.')
      const client = await db.client.findUnique({ where: { id: clientId } })
      if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.')
    }

    const row = await db.consentRecord.create({
      data: {
        clientId,
        scope: scope.toUpperCase(),
        purpose,
        expiryAt: body.expiryAt ? new Date(body.expiryAt) : null,
        evidenceNote: str(body.evidenceNote) || null,
        grantedByRole,
      },
    })
    await audit({ actor: ctx, action: 'CONSENT_GRANTED', entity: 'ConsentRecord', entityId: row.id, details: { clientId, scope } })
    return ok({ consent: { id: row.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/consents — revoke a consent.
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<{ id?: string }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const existing = await db.consentRecord.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Consent record not found.')
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client || existing.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You can only revoke your own consents.')
    }
    if (existing.status === 'REVOKED') return ok({ consent: { id: existing.id, status: existing.status } })
    const row = await db.consentRecord.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } })
    await audit({ actor: ctx, action: 'CONSENT_REVOKED', entity: 'ConsentRecord', entityId: id, details: { scope: existing.scope } })
    return ok({ consent: { id: row.id, status: row.status } })
  } catch (e) {
    return jsonError(e)
  }
}
