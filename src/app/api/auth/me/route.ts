import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { jsonError, ok } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionUser(req)
    if (!ctx) return ok({ user: null })
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, role: true, phone: true, status: true },
    })
    return ok({ user })
  } catch (e) {
    return jsonError(e)
  }
}
