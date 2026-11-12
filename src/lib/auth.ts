import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from './db'
import { AuthContext, HttpError, Role } from './types'

export const SESSION_COOKIE = 'cms_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ---------- Passwords ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ---------- Sessions ----------

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { token, userId, expiresAt } })
  return { token, expiresAt }
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): Response {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}`,
  )
  return response
}

export function clearSessionCookie(response: Response): Response {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  )
  return response
}

// Simple in-memory login rate limiter (per IP): 30 attempts / 5 minutes.
// Generous enough for office NAT scenarios; blocks credential-stuffing bursts.
const attempts = new Map<string, { count: number; resetAt: number }>()
export function checkLoginRate(ip: string): void {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 })
    return
  }
  rec.count += 1
  if (rec.count > 30) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many login attempts. Please try again in a few minutes.')
  }
}

export async function getSessionUser(req: NextRequest): Promise<AuthContext | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
  })
  if (!session || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE') return null
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
  }
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const ctx = await getSessionUser(req)
  if (!ctx) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.')
  return ctx
}

export async function requireRole(req: NextRequest, roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth(req)
  if (!roles.includes(ctx.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
  }
  return ctx
}

export function isStaffRole(role: string): boolean {
  return ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'].includes(role)
}
