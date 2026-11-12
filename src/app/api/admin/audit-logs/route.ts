import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { parsePagination } from '@/lib/api-utils'
import { jsonError, ok } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const { take, skip, page } = parsePagination(req)
    const entity = req.nextUrl.searchParams.get('entity') || undefined
    const where = entity ? { entity } : {}
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      db.auditLog.count({ where }),
    ])
    return ok({ logs, total, page, pageSize: take })
  } catch (e) {
    return jsonError(e)
  }
}
