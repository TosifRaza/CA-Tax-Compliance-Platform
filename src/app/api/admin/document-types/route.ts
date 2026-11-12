import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'CLIENT'])
    const docTypes = await db.documentType.findMany({ orderBy: { name: 'asc' } })
    return ok({ documentTypes: docTypes })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ code?: string; name?: string; category?: string; description?: string }>(req)
    const code = str(body.code).toUpperCase()
    const name = str(body.name)
    if (!code || !name) throw new HttpError(400, 'BAD_REQUEST', 'Code and name are required.')
    const dup = await db.documentType.findUnique({ where: { code } })
    if (dup) throw new HttpError(409, 'DUPLICATE_CODE', 'A document type with this code already exists.')
    const dt = await db.documentType.create({ data: { code, name, category: str(body.category) || null, description: str(body.description) || null } })
    await audit({ actor: ctx, action: 'DOCUMENT_TYPE_CREATED', entity: 'DocumentType', entityId: dt.id, details: { code } })
    return ok({ documentType: { id: dt.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ id?: string; name?: string; category?: string; description?: string; active?: boolean }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = str(body.name)
    if (typeof body.category === 'string') data.category = str(body.category)
    if (typeof body.description === 'string') data.description = str(body.description)
    if (typeof body.active === 'boolean') data.active = body.active
    await db.documentType.update({ where: { id }, data })
    await audit({ actor: ctx, action: 'DOCUMENT_TYPE_UPDATED', entity: 'DocumentType', entityId: id, details: data })
    return ok({ documentType: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
