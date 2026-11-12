// Statutory period resolution for the case flow (gap R-02).
// An application is linked to a chosen period (assessment year / tax period),
// which obligations and filings inherit instead of a generic "current month".

export type PeriodMode = 'NONE' | 'ASSESSMENT_YEAR' | 'TAX_PERIOD'

export interface ResolvedPeriod {
  periodType: string
  periodLabel: string
  periodStart: Date
  periodEnd: Date
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Financial year (Indian) containing the given date, e.g. { label: 'FY 2026-27', start, end }. */
export function financialYearOf(d: Date): { label: string; start: Date; end: Date } {
  const y = d.getFullYear()
  const fyStartYear = d.getMonth() >= 3 ? y : y - 1
  const start = new Date(Date.UTC(fyStartYear, 3, 1)) // 1 April
  const end = new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59)) // 31 March
  const yy = String(fyStartYear)
  const yy2 = String((fyStartYear + 1) % 100).padStart(2, '0')
  return { label: `FY ${yy}-${yy2}`, start, end }
}

/** Assessment year for the FY containing the given date, e.g. 'AY 2027-28'. */
export function assessmentYearOf(d: Date): { label: string; start: Date; end: Date } {
  const fy = financialYearOf(d)
  const [, y2] = fy.label.replace('FY ', '').split('-')
  const ayStartYear = fy.start.getUTCFullYear() + 1
  return {
    label: `AY ${ayStartYear}-${y2}`,
    start: fy.start,
    end: fy.end,
  }
}

/** Tax month label, e.g. 'November 2026'. */
export function taxMonthOf(d: Date): { label: string; start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))
  const end = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59))
  return { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, start, end }
}

/** Options the client can pick from in the wizard (assessment years around today). */
export function assessmentYearOptions(now = new Date(), count = 3): { value: string; label: string }[] {
  const current = assessmentYearOf(now)
  const baseStartYear = current.start.getUTCFullYear() // e.g. 2026 for AY 2027-28
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < count; i += 1) {
    const ayStartYear = baseStartYear + i
    const fyStartYear = ayStartYear - 1
    const yy = String(fyStartYear)
    const yy2 = String(ayStartYear % 100).padStart(2, '0')
    out.push({ value: `AY ${ayStartYear}-${String((ayStartYear + 1) % 100).padStart(2, '0')}`, label: `AY ${ayStartYear}-${String((ayStartYear + 1) % 100).padStart(2, '0')} (FY ${yy}-${yy2})` })
  }
  return out
}

export function taxMonthOptions(now = new Date(), count = 6): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
    out.push({ value: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` })
  }
  return out
}

/**
 * Validate a client-chosen period against the service's configured mode.
 * Throws a descriptive error when the label does not match the mode; the bounds
 * are recomputed server-side so they can never disagree with the label.
 */
export function resolvePeriod(mode: PeriodMode | undefined, rawType: string | undefined, rawLabel: string | undefined): ResolvedPeriod | null {
  if (!mode || mode === 'NONE') return null
  const label = (rawLabel || '').trim()
  if (!label) throw new Error('Please choose the period this application relates to.')

  if (mode === 'ASSESSMENT_YEAR') {
    const m = label.match(/^AY (\d{4})-(\d{2})$/)
    if (!m) throw new Error('Assessment year must look like "AY 2027-28".')
    const startYear = Number(m[1]) - 1 // AY 2027-28 -> FY starts 2026
    const start = new Date(Date.UTC(startYear, 3, 1))
    const end = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59))
    return { periodType: 'ASSESSMENT_YEAR', periodLabel: label, periodStart: start, periodEnd: end }
  }

  if (mode === 'TAX_PERIOD') {
    const m = label.match(new RegExp(`^(${MONTH_NAMES.join('|')}) (\\d{4})$`))
    if (!m) throw new Error('Tax period must look like "November 2026".')
    const month = MONTH_NAMES.indexOf(m[1])
    const year = Number(m[2])
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))
    return { periodType: 'TAX_PERIOD', periodLabel: label, periodStart: start, periodEnd: end }
  }

  return null
}

/** Current period label used when generating recurring obligations (per frequency). */
export function currentPeriodLabelFor(frequency: string, now = new Date()): string {
  if (frequency === 'ANNUAL') return assessmentYearOf(now).label
  if (frequency === 'QUARTERLY') {
    const fy = financialYearOf(now)
    const quarter = Math.floor(((now.getMonth() - 3 + 12) % 12) / 3) + 1 // Apr-Jun = Q1 of FY
    const [, y2] = fy.label.replace('FY ', '').split('-')
    return `Q${quarter} FY ${fy.start.getUTCFullYear()}-${y2}`
  }
  return taxMonthOf(now).label
}
