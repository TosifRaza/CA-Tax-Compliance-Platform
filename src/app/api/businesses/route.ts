import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

const CONSTITUTIONS = ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'HUF', 'TRUST', 'SOCIETY', 'OTHER']

// R-13: client-declared annual turnover (whole INR). Optional; a declared
// value must be a non-negative integer so applicability thresholds evaluate
// deterministically.
function parseTurnover(body: Record<string, unknown>): { annualTurnover?: number | null } {
  if (!('annualTurnover' in body)) return {}
  const v = body.annualTurnover
  if (v === null || v === '' || v === undefined) return { annualTurnover: null }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,₹\s]/g, ''))
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new HttpError(422, 'BAD_TURNOVER', 'Annual turnover must be a whole rupee amount (or left empty).')
  }
  return { annualTurnover: n }
}

// GET /api/businesses — client's own business profiles (staff can list all).
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId }, include: { businesses: { orderBy: { createdAt: 'desc' } } } })
      if (!client) return ok({ businesses: [] })
      return ok({ businesses: client.businesses })
    }
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const clientId = req.nextUrl.searchParams.get('clientId') || undefined
    const businesses = await db.business.findMany({
      where: clientId ? { clientId } : {},
      include: { client: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return ok({
      businesses: businesses.map((b) => ({
        id: b.id, legalName: b.legalName, tradeName: b.tradeName, constitution: b.constitution,
        pan: b.pan, gstin: b.gstin, cin: b.cin, state: b.state, active: b.active,
        registeredAddress: b.registeredAddress,
        clientName: b.client.user.name, clientEmail: b.client.user.email,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/businesses — create business profile (client).
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<Record<string, unknown>>(req)
    const legalName = str(body.legalName)
    const constitution = str(body.constitution).toUpperCase()
    if (!legalName || !constitution) throw new HttpError(400, 'BAD_REQUEST', 'legalName and constitution are required.')
    if (!CONSTITUTIONS.includes(constitution)) throw new HttpError(422, 'BAD_CONSTITUTION', 'Invalid business constitution.')

    const client = await db.client.findUnique({ where: { userId: ctx.userId } })
    if (!client) throw new HttpError(403, 'FORBIDDEN', 'Only clients can create business profiles.')
    const business = await db.business.create({
      data: {
        clientId: client.id,
        legalName,
        tradeName: str(body.tradeName) || null,
        constitution,
        pan: str(body.pan).toUpperCase() || null,
        gstin: str(body.gstin).toUpperCase() || null,
        cin: str(body.cin).toUpperCase() || null,
        tan: str(body.tan).toUpperCase() || null,
        state: str(body.state) || null,
        registeredAddress: str(body.registeredAddress) || null,
        operatingAddress: str(body.operatingAddress) || null,
        businessActivities: str(body.businessActivities) || null,
        ...parseTurnover(body),
      },
    })
    await audit({ actor: ctx, action: 'BUSINESS_CREATED', entity: 'Business', entityId: business.id, details: { legalName } })
    return ok({ business: { id: business.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/businesses — update own business profile (client).
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<Record<string, unknown>>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const client = await db.client.findUnique({ where: { userId: ctx.userId } })
    if (!client) throw new HttpError(403, 'FORBIDDEN', 'Only clients can update business profiles.')
    const business = await db.business.findUnique({ where: { id } })
    if (!business || business.clientId !== client.id) throw new HttpError(404, 'NOT_FOUND', 'Business profile not found.')

    const data: Record<string, unknown> = {}
    const strFields = ['legalName', 'tradeName', 'pan', 'gstin', 'cin', 'tan', 'state', 'registeredAddress', 'operatingAddress', 'businessActivities']
    for (const f of strFields) {
      if (typeof body[f] === 'string') data[f] = str(body[f]) || null
    }
    if (typeof body.constitution === 'string' && CONSTITUTIONS.includes(str(body.constitution).toUpperCase())) {
      data.constitution = str(body.constitution).toUpperCase()
    }
    Object.assign(data, parseTurnover(body))
    if (typeof body.active === 'boolean') data.active = body.active
    const updated = await db.business.update({ where: { id }, data })
    await audit({ actor: ctx, action: 'BUSINESS_UPDATED', entity: 'Business', entityId: id, details: { keys: Object.keys(data) } })
    return ok({ business: { id: updated.id } })
  } catch (e) {
    return jsonError(e)
  }
}
