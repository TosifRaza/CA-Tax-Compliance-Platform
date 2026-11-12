import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { jsonError, ok } from '@/lib/api-utils'
import { runReminderSweep } from '@/lib/reminders'

// POST /api/reminders/run — manual trigger of the reminder/escalation sweep.
// The in-process scheduler (instrumentation.ts) runs it hourly; this endpoint
// lets staff run it on demand (e.g. after editing policies) and is the hook an
// external cron can call.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const result = await runReminderSweep(`${ctx.name} (manual run)`)
    await audit({ actor: ctx, action: 'REMINDER_SWEEP_TRIGGERED', entity: 'System', details: result })
    return ok({ result })
  } catch (e) {
    return jsonError(e)
  }
}

// GET /api/reminders/run — recent reminder activity for the admin view.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const logs = await db.reminderLog.findMany({ orderBy: { sentAt: 'desc' }, take: 50 })
    return ok({ logs })
  } catch (e) {
    return jsonError(e)
  }
}
