import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSession, setSessionCookie, verifyPassword, checkLoginRate } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { clientIp, jsonError, ok, parseJson, str } from '@/lib/api-utils'

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    checkLoginRate(ip)
    const body = await parseJson<{ email?: string; password?: string }>(req)
    const email = str(body.email).toLowerCase()
    const password = str(body.password)
    if (!email || !password) throw new HttpError(400, 'BAD_REQUEST', 'Email and password are required.')

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }
    if (user.status !== 'ACTIVE') {
      throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact your administrator.')
    }
    const { token, expiresAt } = await createSession(user.id)
    await audit({ actor: { userId: user.id, email: user.email, name: user.name, role: user.role as never }, action: 'LOGIN', entity: 'User', entityId: user.id })
    const res = ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    return setSessionCookie(res, token, expiresAt)
  } catch (e) {
    return jsonError(e)
  }
}
