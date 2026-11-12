// Next.js instrumentation hook — runs once per server process start.
// Hosts the in-process reminder scheduler (gap R-03). The sweep is fully
// idempotent per interval (deduplicated through ReminderLog), so running it
// hourly is safe; deployments with an external cron can call
// POST /api/reminders/run instead and disable this via REMINDER_SWEEP_DISABLED=1.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.REMINDER_SWEEP_DISABLED === '1') return
  const g = globalThis as { __reminderSweepTimer?: ReturnType<typeof setInterval> }
  if (g.__reminderSweepTimer) return

  const sweep = async () => {
    try {
      const { runReminderSweep } = await import('./lib/reminders')
      const res = await runReminderSweep()
      if (res.early + res.dueToday + res.overdue + res.escalations + res.infoRequests > 0) {
        console.log('[reminders] sweep:', res)
      }
    } catch (e) {
      console.error('[reminders] sweep failed:', e)
    }
  }

  g.__reminderSweepTimer = setInterval(sweep, 60 * 60 * 1000)
  // First pass shortly after boot so deadline reminders exist from day one.
  setTimeout(sweep, 15_000)
}
