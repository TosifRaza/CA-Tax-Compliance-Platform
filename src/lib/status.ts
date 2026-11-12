// Application status vocabulary, shared client/server.
export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'CLIENT_INFO_REQUESTED'
  | 'PROFESSIONAL_REVIEW'
  | 'GOVERNMENT_SUBMISSION'
  | 'ON_HOLD'
  | 'REWORK'
  | 'APPROVED_BY_AUTHORITY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED_BY_AUTHORITY'

export const CLIENT_FRIENDLY_STATUS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft (not submitted)',
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In progress',
  CLIENT_INFO_REQUESTED: 'Additional information needed from you',
  PROFESSIONAL_REVIEW: 'Professional review',
  GOVERNMENT_SUBMISSION: 'Government submission stage',
  ON_HOLD: 'On hold',
  REWORK: 'Corrections requested',
  APPROVED_BY_AUTHORITY: 'Approved by authority (evidence recorded)',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED_BY_AUTHORITY: 'Rejected by authority (evidence recorded)',
}

// Human-readable stage names fall back to the workflow stage snapshot.
export function statusLabel(s: string): string {
  return CLIENT_FRIENDLY_STATUS[s as ApplicationStatus] ?? s
}
