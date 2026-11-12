import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

const STAFF = ['EMPLOYEE', 'MANAGER', 'CA_REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'KNOWLEDGE_MANAGER'] as const

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const employees = await db.employee.findMany({
      include: { user: { select: { id: true, email: true, name: true, role: true, status: true } }, department: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const open = await db.applicationTask.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { not: null }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      _count: { _all: true },
    })
    const openMap = new Map(open.map((r) => [r.assignedToId as string, r._count._all]))
    return ok({
      employees: employees.map((e) => ({
        id: e.id, userId: e.userId, name: e.user.name, email: e.user.email, role: e.user.role,
        status: e.user.status, department: e.department, designation: e.designation,
        specialization: e.specialization ? JSON.parse(e.specialization) : [],
        availability: e.availability, active: e.active, maxOpenTasks: e.maxOpenTasks,
        openTasks: openMap.get(e.userId) ?? 0,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{
      name?: string; email?: string; password?: string; role?: string; phone?: string
      departmentId?: string; designation?: string; specialization?: string[]; maxOpenTasks?: number
    }>(req)
    const name = str(body.name)
    const email = str(body.email).toLowerCase()
    const password = str(body.password)
    const role = str(body.role).toUpperCase()
    if (!name || !email || !password || !role) throw new HttpError(400, 'BAD_REQUEST', 'name, email, password and role are required.')
    if (!STAFF.includes(role as (typeof STAFF)[number])) throw new HttpError(422, 'BAD_ROLE', 'Role must be a staff role.')
    if (password.length < 8) throw new HttpError(422, 'WEAK_PASSWORD', 'Password must be at least 8 characters.')
    if (role === 'SUPER_ADMIN' && ctx.role !== 'SUPER_ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only a Super Admin can create Super Admin accounts.')
    const dup = await db.user.findUnique({ where: { email } })
    if (dup) throw new HttpError(409, 'EMAIL_TAKEN', 'A user with this email already exists.')

    const user = await db.user.create({ data: { email, name, role, phone: str(body.phone) || null, passwordHash: hashPassword(password) } })
    await db.employee.create({
      data: {
        userId: user.id,
        departmentId: str(body.departmentId) || null,
        designation: str(body.designation) || null,
        specialization: JSON.stringify(body.specialization || []),
        maxOpenTasks: typeof body.maxOpenTasks === 'number' && body.maxOpenTasks > 0 ? body.maxOpenTasks : 10,
      },
    })
    await audit({ actor: ctx, action: 'EMPLOYEE_CREATED', entity: 'User', entityId: user.id, details: { email, role } })
    return ok({ user: { id: user.id } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{
      id?: string; departmentId?: string; designation?: string; availability?: string
      active?: boolean; maxOpenTasks?: number; specialization?: string[]
    }>(req)
    const id = str(body.id)
    if (!id) throw new HttpError(400, 'BAD_REQUEST', 'id is required.')
    const emp = await db.employee.findUnique({ where: { id }, include: { user: true } })
    if (!emp) throw new HttpError(404, 'NOT_FOUND', 'Employee not found.')

    const empData: Record<string, unknown> = {}
    if (typeof body.departmentId === 'string') empData.departmentId = body.departmentId || null
    if (typeof body.designation === 'string') empData.designation = str(body.designation)
    if (typeof body.availability === 'string' && ['AVAILABLE', 'ON_LEAVE', 'UNAVAILABLE'].includes(body.availability)) empData.availability = body.availability
    if (typeof body.active === 'boolean') empData.active = body.active
    if (typeof body.maxOpenTasks === 'number' && body.maxOpenTasks > 0) empData.maxOpenTasks = body.maxOpenTasks
    if (Array.isArray(body.specialization)) empData.specialization = JSON.stringify(body.specialization)
    const updated = await db.employee.update({ where: { id }, data: empData })
    if (typeof body.active === 'boolean' && !body.active) {
      // Suspend the underlying user account too — employee cannot log in while inactive.
      await db.user.update({ where: { id: emp.userId }, data: { status: 'SUSPENDED' } })
    }
    if (typeof body.active === 'boolean' && body.active) {
      await db.user.update({ where: { id: emp.userId }, data: { status: 'ACTIVE' } })
    }
    await audit({ actor: ctx, action: 'EMPLOYEE_UPDATED', entity: 'Employee', entityId: id, details: empData })
    void updated
    return ok({ employee: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
