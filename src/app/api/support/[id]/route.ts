import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// GET /api/support/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const ticket = await db.supportTicket.findUnique({ where: { id }, include: { client: { include: { user: true } }, messages: { orderBy: { createdAt: 'asc' } } } })
    if (!ticket) throw new HttpError(404, 'NOT_FOUND', 'Ticket not found.')
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client || ticket.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot access this ticket.')
    }
    return ok({
      ticket: {
        id: ticket.id, ticketNo: ticket.ticketNo, subject: ticket.subject, category: ticket.category,
        priority: ticket.priority, status: ticket.status, clientName: ticket.client.user.name,
        messages: ticket.messages.map((m) => ({ id: m.id, authorName: m.authorName, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt })),
        createdAt: ticket.createdAt,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/support/[id] — reply {message}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const body = await parseJson<{ message?: string }>(req)
    const message = str(body.message)
    if (!message) throw new HttpError(400, 'BAD_REQUEST', 'Message is required.')
    const ticket = await db.supportTicket.findUnique({ where: { id } })
    if (!ticket) throw new HttpError(404, 'NOT_FOUND', 'Ticket not found.')
    if (ctx.role === 'CLIENT') {
      const client = await db.client.findUnique({ where: { userId: ctx.userId } })
      if (!client || ticket.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot access this ticket.')
    }
    await db.supportMessage.create({ data: { ticketId: id, authorId: ctx.userId, authorName: ctx.name, authorRole: ctx.role, body: message } })
    await db.supportTicket.update({ where: { id }, data: { status: ticket.status === 'OPEN' && ctx.role !== 'CLIENT' ? 'IN_PROGRESS' : ticket.status } })
    await audit({ actor: ctx, action: 'TICKET_REPLIED', entity: 'SupportTicket', entityId: id })
    return ok({ success: true })
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/support/[id] — update status {status}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    if (ctx.role === 'CLIENT') throw new HttpError(403, 'FORBIDDEN', 'Staff only.')
    const { id } = await params
    const body = await parseJson<{ status?: string }>(req)
    const status = str(body.status).toUpperCase()
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) throw new HttpError(400, 'BAD_REQUEST', 'Invalid status.')
    await db.supportTicket.update({ where: { id }, data: { status } })
    await audit({ actor: ctx, action: 'TICKET_STATUS_CHANGED', entity: 'SupportTicket', entityId: id, details: { status } })
    return ok({ status })
  } catch (e) {
    return jsonError(e)
  }
}
