import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { jsonError, ok, parseJson, parsePagination, str } from '@/lib/api-utils'
import { audit, ticketRefNo } from '@/lib/audit'

// GET /api/support — role-scoped ticket list.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const { take, skip, page } = parsePagination(req)
    const where: Record<string, unknown> = {}
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client) return ok({ tickets: [], total: 0, page })
      where.clientId = client.id
    }
    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        include: {
          client: { include: { user: { select: { name: true } } } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        take, skip,
      }),
      db.supportTicket.count({ where }),
    ])
    return ok({
      tickets: tickets.map((t) => ({
        id: t.id, ticketNo: t.ticketNo, subject: t.subject, category: t.category,
        priority: t.priority, status: t.status, clientName: t.client.user.name,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
        messages: t.messages.map((m) => ({ id: m.id, authorName: m.authorName, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt })),
      })),
      total, page,
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/support — create ticket {subject, category, message, applicationId?}
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req)
    const body = await parseJson<{ subject?: string; category?: string; message?: string; applicationId?: string }>(req)
    const subject = str(body.subject)
    const message = str(body.message)
    const category = str(body.category) || 'GENERAL'
    if (!subject || !message) {
      throw new HttpError(400, 'BAD_REQUEST', 'Subject and message are required.')
    }
    const client = await db.client.findUnique({ where: { userId: ctx.userId } })
    if (!client) {
      throw new HttpError(403, 'FORBIDDEN', 'Only clients can raise support tickets.')
    }
    const ticket = await db.supportTicket.create({
      data: {
        ticketNo: ticketRefNo(),
        clientId: client.id,
        applicationId: str(body.applicationId) || null,
        subject, category,
        status: 'OPEN',
        createdById: ctx.userId,
        messages: { create: { authorId: ctx.userId, authorName: ctx.name, authorRole: ctx.role, body: message } },
      },
    })
    await audit({ actor: ctx, action: 'TICKET_CREATED', entity: 'SupportTicket', entityId: ticket.id, details: { ticketNo: ticket.ticketNo } })
    return ok({ ticket: { id: ticket.id, ticketNo: ticket.ticketNo } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
