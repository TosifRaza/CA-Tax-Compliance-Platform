'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EmptyState, LoadingState, StatusBadge, statusLabel } from '@/components/app/shared'
import { apiGet, apiSend, formatDateTime } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

interface Ticket {
  id: string; ticketNo: string; subject: string; category: string; priority: string; status: string; clientName?: string
  createdAt: string
  messages: { id: string; authorName: string; authorRole: string; body: string; createdAt: string }[]
}

export default function SupportView() {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('GENERAL')
  const [message, setMessage] = useState('')
  const [replyFor, setReplyFor] = useState<Ticket | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isStaff = !!user && user.role !== 'CLIENT'
  const q = useQuery({ queryKey: ['support'], queryFn: () => apiGet<{ tickets: Ticket[] }>('/api/support') })

  async function create() {
    setBusy(true); setError(null)
    try {
      await apiSend('POST', '/api/support', { subject, category, message })
      setOpen(false); setSubject(''); setMessage('')
      void qc.invalidateQueries({ queryKey: ['support'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function sendReply() {
    if (!replyFor) return
    setBusy(true); setError(null)
    try {
      await apiSend('POST', `/api/support/${replyFor.id}`, { message: reply })
      setReplyFor(null); setReply('')
      void qc.invalidateQueries({ queryKey: ['support'] })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function setStatus(id: string, status: string) {
    await apiSend('PATCH', `/api/support/${id}`, { status })
    void qc.invalidateQueries({ queryKey: ['support'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Support</h1>
        {!isStaff && <Button onClick={() => setOpen(true)}>New ticket</Button>}
      </div>

      {q.isLoading && <LoadingState />}
      {q.data && q.data.tickets.length === 0 && <EmptyState title="No support tickets" hint="Raise a ticket if you need help with an application." />}

      <div className="grid gap-3">
        {q.data?.tickets.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{t.subject} <Badge variant="outline" className="ml-1 font-mono text-[10px]">{t.ticketNo}</Badge></CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{t.clientName ? `${t.clientName} · ` : ''}{t.category} · raised {formatDateTime(t.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                {isStaff && t.status !== 'CLOSED' && (
                  <Select onValueChange={(v) => void setStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs" aria-label="Ticket status"><SelectValue placeholder="Set status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {t.messages.map((m) => (
                <div key={m.id} className="rounded bg-muted/50 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">{m.authorName} ({statusLabel(m.authorRole)}) · {formatDateTime(m.createdAt)}</p>
                  <p>{m.body}</p>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => { setReplyFor(t); setReply('') }}>Reply</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a support ticket</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="tk-subject">Subject *</Label>
            <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">General question</SelectItem>
                <SelectItem value="APPLICATION">Application help</SelectItem>
                <SelectItem value="DOCUMENTS">Document issue</SelectItem>
                <SelectItem value="PAYMENT">Payment query</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-msg">Message *</Label>
            <Textarea id="tk-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !subject.trim() || !message.trim()} onClick={() => void create()}>{busy ? 'Sending…' : 'Create ticket'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replyFor} onOpenChange={(o) => !o && setReplyFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reply to {replyFor?.ticketNo}</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your message…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyFor(null)}>Cancel</Button>
            <Button disabled={busy || !reply.trim()} onClick={() => void sendReply()}>{busy ? 'Sending…' : 'Send'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
