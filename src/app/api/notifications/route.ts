import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonError, ok, parseJson } from '@/lib/api-utils'

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const notifications = await db.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unread = await db.notification.count({ where: { userId: ctx.userId, readAt: null } })
    return ok({ notifications, unread })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/notifications — mark read {ids: [...]} or {all: true}
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<{ ids?: string[]; all?: boolean }>(req)
    if (body.all) {
      await db.notification.updateMany({ where: { userId: ctx.userId, readAt: null }, data: { readAt: new Date() } })
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await db.notification.updateMany({ where: { userId: ctx.userId, id: { in: body.ids }, readAt: null }, data: { readAt: new Date() } })
    }
    return ok({ success: true })
  } catch (e) {
    return jsonError(e)
  }
}
