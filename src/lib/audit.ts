import { db } from './db'
import { AuthContext, HttpError } from './types'
import { createHash } from 'crypto'

export async function audit(opts: {
  actor?: AuthContext | null
  action: string
  entity: string
  entityId?: string | null
  details?: unknown
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: opts.actor?.userId ?? null,
        actorName: opts.actor?.name ?? null,
        actorRole: opts.actor?.role ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        details: opts.details === undefined ? null : JSON.stringify(opts.details),
      },
    })
  } catch (e) {
    // Audit must never break the business operation, but failures must be visible.
    console.error('[audit] failed to write audit log:', e)
  }
}

// ---------- Notifications ----------

export async function notify(opts: {
  userId: string
  title: string
  body: string
  type?: string
  linkView?: string
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: opts.userId,
        title: opts.title,
        body: opts.body,
        type: opts.type ?? 'SYSTEM',
        linkView: opts.linkView ?? null,
      },
    })
  } catch (e) {
    console.error('[notify] failed:', e)
  }
}

export async function notifyRole(opts: {
  roles: string[]
  title: string
  body: string
  type?: string
  linkView?: string
}): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: { role: { in: opts.roles }, status: 'ACTIVE' },
      select: { id: true },
    })
    if (users.length === 0) return
    await db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title: opts.title,
        body: opts.body,
        type: opts.type ?? 'SYSTEM',
        linkView: opts.linkView ?? null,
      })),
    })
  } catch (e) {
    console.error('[notifyRole] failed:', e)
  }
}

// ---------- Reference numbers ----------

export function applicationRefNo(serviceCode: string, seq: number): string {
  const y = new Date().getFullYear()
  return `${serviceCode}-${y}-${String(seq).padStart(5, '0')}`
}

export function ticketRefNo(): string {
  return `TKT-${Date.now().toString(36).toUpperCase()}-${createHash('md5').update(String(Math.random())).digest('hex').slice(0, 4).toUpperCase()}`
}

// ---------- Assertions ----------

export function assertFound<T>(value: T | null, message: string): T {
  if (!value) throw new HttpError(404, 'NOT_FOUND', message)
  return value
}
