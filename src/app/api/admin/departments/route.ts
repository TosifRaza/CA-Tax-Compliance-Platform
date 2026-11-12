import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER'])
    const departments = await db.department.findMany({
      orderBy: { name: 'asc' },
      include: { employees: { include: { user: { select: { name: true, email: true, role: true, status: true } } } } },
    })
    return ok({
      departments: departments.map((d) => ({
        id: d.id, code: d.code, name: d.name, description: d.description, active: d.active,
        employees: d.employees.map((e) => ({
          id: e.id, name: e.user.name, email: e.user.email, role: e.user.role,
          designation: e.designation, availability: e.availability, active: e.active, maxOpenTasks: e.maxOpenTasks,
        })),
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ code?: string; name?: string; description?: string }>(req)
    const code = str(body.code).toUpperCase()
    const name = str(body.name)
    if (!code || !name) throw new HttpError(400, 'BAD_REQUEST', 'Code and name are required.')
    const dup = await db.department.findUnique({ where: { code } })
    if (dup) throw new HttpError(409, 'DUPLICATE_CODE', 'A department with this code already exists.')
    const dept = await db.department.create({ data: { code, name, description: str(body.description) || null } })
    await audit({ actor: ctx, action: 'DEPARTMENT_CREATED', entity: 'Department', entityId: dept.id, details: { code } })
    return ok({ department: { id: dept.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{ id?: string; name?: string; description?: string; active?: boolean }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = str(body.name)
    if (typeof body.description === 'string') data.description = str(body.description)
    if (typeof body.active === 'boolean') data.active = body.active
    const dept = await db.department.update({ where: { id }, data })
    await audit({ actor: ctx, action: 'DEPARTMENT_UPDATED', entity: 'Department', entityId: id, details: data })
    return ok({ department: { id: dept.id } })
  } catch (e) {
    return jsonError(e)
  }
}
