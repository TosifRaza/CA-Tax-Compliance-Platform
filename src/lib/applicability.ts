// =====================================================================
// Service applicability evaluation over client/business attributes
// (gap R-13, PDF §3 information entry). Complements constitution and
// applicant-type checks with registration status and declared turnover
// so a service can state honest, checkable preconditions.
//
// Declarative shape inside a ServiceVersion.applicability config:
//   {
//     constitutions?: string[],            // allowed business constitutions
//     applicantType?: 'BUSINESS' | 'INDIVIDUAL' | 'ANY',
//     periodMode?: 'NONE' | 'ASSESSMENT_YEAR' | 'TAX_PERIOD',
//     notes?: string,
//     requires?: {                        // registration preconditions
//       pan?: 'YES' | 'NO' | 'ANY',
//       gstin?: 'YES' | 'NO' | 'ANY',
//       tan?: 'YES' | 'NO' | 'ANY',
//       cin?: 'YES' | 'NO' | 'ANY',
//     },
//     minTurnover?: number,               // whole INR, inclusive bounds
//     maxTurnover?: number,
//   }
//
// Values are configuration facts maintained through the admin workspace
// and subject to professional review before publish; nothing here invents
// a statutory threshold. Any configuration must be verified by a
// qualified professional before it is used to screen real applicants.
// =====================================================================

export interface ApplicabilityConfig {
  constitutions?: string[]
  applicantType?: 'BUSINESS' | 'INDIVIDUAL' | 'ANY'
  periodMode?: 'NONE' | 'ASSESSMENT_YEAR' | 'TAX_PERIOD'
  notes?: string
  requires?: { pan?: 'YES' | 'NO' | 'ANY'; gstin?: 'YES' | 'NO' | 'ANY'; tan?: 'YES' | 'NO' | 'ANY'; cin?: 'YES' | 'NO' | 'ANY' }
  minTurnover?: number
  maxTurnover?: number
}

export interface ApplicabilitySubject {
  constitution: string
  pan: string | null
  gstin: string | null
  tan: string | null
  cin: string | null
  annualTurnover: number | null
}

export interface ApplicabilityVerdict {
  eligible: boolean
  reasons: string[] // human-readable explanations when not eligible
}

const REG_LABELS: Record<string, string> = {
  pan: 'PAN',
  gstin: 'GSTIN (GST registration)',
  tan: 'TAN',
  cin: 'CIN (company registration)',
}

function has(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Evaluate one business profile against a service's applicability config.
 * Pure function shared by the apply wizard (filter + reasons shown to the
 * client) and the server-side draft creation gate.
 */
export function evaluateApplicability(config: ApplicabilityConfig | null | undefined, subject: ApplicabilitySubject | null): ApplicabilityVerdict {
  const reasons: string[] = []
  const cfg = config || {}
  if (!subject) {
    // Individual-only services legitimately apply without a business profile.
    if ((cfg.applicantType ?? 'BUSINESS') === 'BUSINESS') {
      reasons.push('A business profile is required for this service.')
    }
    return { eligible: reasons.length === 0, reasons }
  }

  if (cfg.constitutions && cfg.constitutions.length > 0 && !cfg.constitutions.includes(subject.constitution)) {
    reasons.push(`This service is for ${cfg.constitutions.map((c) => c.replaceAll('_', ' ').toLowerCase()).join(', ')} businesses.`)
  }

  const req = cfg.requires || {}
  for (const key of ['pan', 'gstin', 'tan', 'cin'] as const) {
    const want = req[key]
    if (!want || want === 'ANY') continue
    const present = has(subject[key])
    if (want === 'YES' && !present) reasons.push(`${REG_LABELS[key]} is required for this service.`)
    if (want === 'NO' && present) reasons.push(`This service applies only when no ${REG_LABELS[key]} is held (you appear to be already registered).`)
  }

  if (typeof cfg.minTurnover === 'number' && cfg.minTurnover > 0) {
    if (subject.annualTurnover === null) reasons.push('Please declare your annual turnover on the business profile so eligibility can be checked.')
    else if (subject.annualTurnover < cfg.minTurnover) {
      reasons.push(`Annual turnover below the service threshold (declared ₹${subject.annualTurnover.toLocaleString('en-IN')}, minimum ₹${cfg.minTurnover.toLocaleString('en-IN')}).`)
    }
  }
  if (typeof cfg.maxTurnover === 'number' && cfg.maxTurnover > 0) {
    if (subject.annualTurnover !== null && subject.annualTurnover > cfg.maxTurnover) {
      reasons.push(`Annual turnover above the service limit (declared ₹${subject.annualTurnover.toLocaleString('en-IN')}, limit ₹${cfg.maxTurnover.toLocaleString('en-IN')}).`)
    }
  }

  return { eligible: reasons.length === 0, reasons }
}
