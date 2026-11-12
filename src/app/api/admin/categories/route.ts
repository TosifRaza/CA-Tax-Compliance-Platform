import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'])
    const categories = await db.serviceCategory.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { services: true } } },
    })
    return ok({ categories: categories.map((c) => ({ id: c.id, code: c.code, name: c.name, description: c.description, displayOrder: c.displayOrder, active: c.active, serviceCount: c._count.services })) })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ code?: string; name?: string; description?: string; displayOrder?: number }>(req)
    const code = str(body.code).toUpperCase()
    const name = str(body.name)
    if (!code || !name) throw new HttpError(400, 'BAD_REQUEST', 'Code and name are required.')
    const dup = await db.serviceCategory.findUnique({ where: { code } })
    if (dup) throw new HttpError(409, 'DUPLICATE_CODE', 'A category with this code already exists.')
    const cat = await db.serviceCategory.create({ data: { code, name, description: str(body.description) || null, displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : 99 } })
    await audit({ actor: ctx, action: 'CATEGORY_CREATED', entity: 'ServiceCategory', entityId: cat.id, details: { code } })
    return ok({ category: { id: cat.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ id?: string; name?: string; description?: string; active?: boolean; displayOrder?: number }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = str(body.name)
    if (typeof body.description === 'string') data.description = str(body.description)
    if (typeof body.active === 'boolean') data.active = body.active
    if (typeof body.displayOrder === 'number') data.displayOrder = body.displayOrder
    await db.serviceCategory.update({ where: { id }, data })
    await audit({ actor: ctx, action: 'CATEGORY_UPDATED', entity: 'ServiceCategory', entityId: id, details: data })
    return ok({ category: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
