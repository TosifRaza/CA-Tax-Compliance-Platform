import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSession, hashPassword, setSessionCookie } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit, notify } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// Client self-registration. Staff accounts are created by administrators only.
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<{ name?: string; email?: string; password?: string; phone?: string }>(req)
    const name = str(body.name)
    const email = str(body.email).toLowerCase()
    const password = str(body.password)
    const phone = str(body.phone) || null
    if (!name || !email || !password) throw new HttpError(400, 'BAD_REQUEST', 'Name, email and password are required.')
    if (password.length < 8) throw new HttpError(422, 'WEAK_PASSWORD', 'Password must be at least 8 characters.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'BAD_EMAIL', 'Please enter a valid email address.')

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.')

    const user = await db.user.create({
      data: { email, name, phone, role: 'CLIENT', passwordHash: hashPassword(password) },
    })
    await db.client.create({ data: { userId: user.id, phone } })
    const { token, expiresAt } = await createSession(user.id)
    await notify({ userId: user.id, title: 'Welcome to the Compliance Portal', body: 'Add your business profile to start applying for services.', type: 'SYSTEM' })
    await audit({ actor: { userId: user.id, email, name, role: 'CLIENT' }, action: 'REGISTER', entity: 'User', entityId: user.id })
    const res = ok({ user: { id: user.id, email, name, role: user.role } }, 201)
    return setSessionCookie(res, token, expiresAt)
  } catch (e) {
    return jsonError(e)
  }
}
