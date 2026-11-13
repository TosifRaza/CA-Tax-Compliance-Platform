import { db } from './db'
import {
  HttpError,
  type Answers,
  type AuthContext,
  type ChecklistItem,
  type FormSchema,
  type PricingConfig,
  type VersionConfig,
} from './types'
import { computeChecklist, validateAnswers, visibleSections } from './rules'
import { generateTasksForApplication, type ConfigSnapshot as TaskConfigSnapshot } from './tasks'
import { audit, notify, applicationRefNo } from './audit'
import { resolvePeriod, type PeriodMode } from './period'
import { evaluateApplicability } from './applicability'

// =====================================================================
// Application lifecycle service: draft -> answers -> checklist -> submit
// The submitted application freezes its configuration (snapshot) so later
// master changes never alter in-flight applications.
// =====================================================================

export async function getVersionConfig(serviceVersionId: string): Promise<VersionConfig> {
  const version = await db.serviceVersion.findUnique({ where: { id: serviceVersionId } })
  if (!version) throw new HttpError(404, 'NOT_FOUND', 'Service version not found.')
  return {
    formSchema: JSON.parse(version.formSchema) as FormSchema,
    documentRequirements: JSON.parse(version.documentRequirements) as VersionConfig['documentRequirements'],
    taskTemplates: JSON.parse(version.taskTemplates) as VersionConfig['taskTemplates'],
    pricing: JSON.parse(version.pricing) as PricingConfig,
    applicability: JSON.parse(version.applicability) as VersionConfig['applicability'],
    complianceRules: JSON.parse(version.complianceRules) as VersionConfig['complianceRules'],
  }
}

export interface CreateDraftInput {
  serviceId: string
  businessId?: string | null
  periodType?: string | null
  periodLabel?: string | null
}

export async function createDraft(actor: AuthContext, input: CreateDraftInput): Promise<{ id: string; referenceNo: string }> {
  const client = await db.client.findUnique({ where: { userId: actor.userId }, include: { user: true } })
  if (!client) throw new HttpError(403, 'FORBIDDEN', 'Only registered clients can create applications.')

  const service = await db.service.findUnique({ where: { id: input.serviceId }, include: { currentVersion: true } })
  if (!service || service.status !== 'PUBLISHED' || !service.currentVersion) {
    throw new HttpError(422, 'SERVICE_UNAVAILABLE', 'This service is not currently open for applications.')
  }
  const config = await getVersionConfig(service.currentVersion.id)
  const applicantType = config.applicability?.applicantType ?? 'BUSINESS'

  // R-14: individual-only services (e.g. ITR-1) can be filed without a business entity.
  let business: { id: string; legalName: string; tradeName: string | null; pan: string | null; gstin: string | null; cin: string | null; tan: string | null; constitution: string; registeredAddress: string | null; operatingAddress: string | null; annualTurnover: number | null } | null = null
  if (input.businessId) {
    const found = await db.business.findUnique({ where: { id: input.businessId } })
    if (!found || found.clientId !== client.id || !found.active) {
      throw new HttpError(404, 'NOT_FOUND', 'Business profile not found for this account.')
    }
    if (applicantType === 'INDIVIDUAL') {
      throw new HttpError(422, 'BUSINESS_NOT_ALLOWED', 'This service is for individual taxpayers and is filed without a business profile.')
    }
    business = found
  } else {
    if (applicantType === 'BUSINESS') {
      throw new HttpError(422, 'BUSINESS_REQUIRED', 'A business profile is required for this service.')
    }
  }

  // R-13: attribute-based eligibility (registrations held, declared turnover)
  // is enforced server-side, not only hidden in the UI.
  const verdict = evaluateApplicability(config.applicability, business)
  if (!verdict.eligible) {
    throw new HttpError(422, 'NOT_ELIGIBLE', `This service is not available for the selected profile: ${verdict.reasons.join(' ')}`)
  }

  // R-02: resolve and validate the chosen statutory period server-side.
  let period: { periodType: string; periodLabel: string; periodStart: Date; periodEnd: Date } | null = null
  try {
    period = resolvePeriod(config.applicability?.periodMode as PeriodMode | undefined, input.periodType ?? undefined, input.periodLabel ?? undefined)
  } catch (e) {
    throw new HttpError(422, 'PERIOD_INVALID', (e as Error).message)
  }

  const answers = prefillAnswers(config.formSchema, business)

  const count = await db.application.count()
  const refNo = applicationRefNo(service.code, count + 1)

  const app = await db.application.create({
    data: {
      referenceNo: refNo,
      clientId: client.id,
      businessId: business?.id ?? null,
      serviceId: service.id,
      serviceVersionId: service.currentVersion.id,
      status: 'DRAFT',
      currentStageCode: null,
      periodType: period?.periodType ?? 'NOT_APPLICABLE',
      periodLabel: period?.periodLabel ?? null,
      periodStart: period?.periodStart ?? null,
      periodEnd: period?.periodEnd ?? null,
      formData: JSON.stringify(answers),
      checklist: JSON.stringify(computeChecklist(config.documentRequirements, answers)),
      configSnapshot: JSON.stringify(await buildSnapshot(service.currentVersion.id)),
    },
  })
  await audit({ actor, action: 'APPLICATION_DRAFT_CREATED', entity: 'Application', entityId: app.id, details: { refNo, serviceId: service.id, period: period?.periodLabel ?? null } })
  return { id: app.id, referenceNo: refNo }
}

export async function buildSnapshot(serviceVersionId: string): Promise<TaskConfigSnapshot> {
  const version = await db.serviceVersion.findUnique({ where: { id: serviceVersionId }, include: { workflow: { include: { stages: true } } } })
  if (!version) throw new HttpError(404, 'NOT_FOUND', 'Service version not found.')
  return {
    formSchema: JSON.parse(version.formSchema),
    documentRequirements: JSON.parse(version.documentRequirements),
    taskTemplates: JSON.parse(version.taskTemplates),
    pricing: JSON.parse(version.pricing),
    complianceRules: JSON.parse(version.complianceRules),
    applicability: JSON.parse(version.applicability),
    workflow: {
      code: version.workflow?.code || '',
      name: version.workflow?.name || '',
      stages: (version.workflow?.stages || [])
        .map((s) => ({ code: s.code, name: s.name, sequence: s.sequence, responsibleRole: s.responsibleRole, stageType: s.stageType, slaHours: s.slaHours }))
        .sort((a, b) => a.sequence - b.sequence),
    },
  } as unknown as TaskConfigSnapshot
}

export function prefillAnswers(schema: FormSchema, business: { legalName: string; tradeName: string | null; pan: string | null; gstin: string | null; cin: string | null; tan: string | null; constitution: string; registeredAddress: string | null; operatingAddress: string | null } | null): Answers {
  const prefillMap: Record<string, string | null> = business ? {
    legalName: business.legalName,
    tradeName: business.tradeName,
    pan: business.pan,
    gstin: business.gstin,
    cin: business.cin,
    tan: business.tan,
    constitution: business.constitution,
    registeredAddress: business.registeredAddress,
    operatingAddress: business.operatingAddress,
  } : {}
  const answers: Answers = business ? {
    constitution: business.constitution,
    businessConstitution: business.constitution,
  } : {}
  for (const s of schema.sections || []) {
    for (const f of s.fields || []) {
      if (f.prefillFromBusiness && prefillMap[f.prefillFromBusiness]) {
        answers[f.code] = prefillMap[f.prefillFromBusiness]
      }
    }
  }
  return answers
}

export async function saveDraftAnswers(actor: AuthContext, applicationId: string, answers: Answers): Promise<{ errors: Record<string, string>; checklist: ChecklistItem[] }> {
  const app = await db.application.findUnique({ where: { id: applicationId } })
  if (!app) throw new HttpError(404, 'NOT_FOUND', 'Application not found.')
  const client = await db.client.findUnique({ where: { userId: actor.userId } })
  if (!client || app.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You can only edit your own applications.')
  const editable = app.status === 'DRAFT' || app.status === 'CLIENT_INFO_REQUESTED'
  if (!editable) {
    throw new HttpError(422, 'NOT_EDITABLE', 'Submitted applications can only be edited when additional information is requested.')
  }

  const snapshot = JSON.parse(app.configSnapshot) as TaskConfigSnapshot
  const schema = snapshot.formSchema as FormSchema
  const docReqs = snapshot.documentRequirements as VersionConfig['documentRequirements']

  // Merge (partial save): keep previous answers for fields not present in payload.
  const existing = JSON.parse(app.formData) as Answers
  const merged: Answers = { ...existing, ...answers }

  const errors = validateAnswers(schema, merged)
  const checklist = computeChecklist(docReqs, merged)

  await db.application.update({
    where: { id: applicationId },
    data: { formData: JSON.stringify(merged), checklist: JSON.stringify(checklist) },
  })
  if (app.status === 'CLIENT_INFO_REQUESTED') {
    await db.applicationEvent.create({ data: { applicationId, type: 'INFO_PROVIDED', actorId: actor.userId, actorName: actor.name, payload: JSON.stringify({ fields: Object.keys(answers) }) } })
  }
  return { errors, checklist }
}

export async function submitApplication(actor: AuthContext, applicationId: string): Promise<{ referenceNo: string; tasksCreated: number }> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { service: true, business: true, client: { include: { user: true } } } })
  if (!app) throw new HttpError(404, 'NOT_FOUND', 'Application not found.')
  const client = await db.client.findUnique({ where: { userId: actor.userId } })
  if (!client || app.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You can only submit your own applications.')
  if (app.status !== 'DRAFT' && app.status !== 'CLIENT_INFO_REQUESTED') {
    throw new HttpError(422, 'ALREADY_SUBMITTED', 'This application has already been submitted.')
  }

  const snapshot = JSON.parse(app.configSnapshot) as TaskConfigSnapshot
  const schema = snapshot.formSchema as FormSchema
  const answers = JSON.parse(app.formData) as Answers

  // R-02: a case configured with a period mode must carry the chosen period at submit.
  const periodMode = (snapshot.applicability as VersionConfig['applicability'] | undefined)?.periodMode ?? 'NONE'
  if (periodMode && periodMode !== 'NONE' && !app.periodLabel) {
    throw new HttpError(422, 'PERIOD_REQUIRED', 'Choose the assessment year / tax period this application relates to before submitting.')
  }

  // Hard server-side validation before submission.
  const errors = validateAnswers(schema, answers)
  if (Object.keys(errors).length > 0) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'Some required answers are missing or invalid.')
  }

  const checklist = computeChecklist(snapshot.documentRequirements as VersionConfig['documentRequirements'], answers)
  const missingDocs = checklist.filter((c) => c.status === 'REQUIRED')
  if (missingDocs.length > 0) {
    const uploadedCodes = new Set((await db.uploadedDocument.findMany({ where: { applicationId } })).map((d) => d.requirementCode))
    const missing = missingDocs.filter((m) => !uploadedCodes.has(m.requirementCode))
    if (missing.length > 0) {
      throw new HttpError(422, 'DOCS_MISSING', `Upload all required documents first: ${missing.map((m) => m.name).join(', ')}.`)
    }
  }

  // Idempotent submission: status transition in a short transaction, then task
  // generation (itself idempotent via the [applicationId, templateCode] unique
  // constraint), then quotation. Task generation runs outside the transaction
  // to stay well under the interactive-transaction timeout.
  await db.$transaction(async (tx) => {
    const fresh = await tx.application.findUnique({ where: { id: applicationId } })
    if (!fresh || (fresh.status !== 'DRAFT' && fresh.status !== 'CLIENT_INFO_REQUESTED')) {
      throw new HttpError(409, 'CONFLICT', 'Application was already submitted by another session.')
    }
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        currentStageCode: snapshot.workflow?.stages?.[0]?.code ?? null,
        formData: JSON.stringify(answers),
        checklist: JSON.stringify(checklist),
      },
    })
    await tx.applicationStatusHistory.create({
      data: { applicationId, fromStatus: fresh.status, toStatus: 'SUBMITTED', actorId: actor.userId, actorName: actor.name, remarks: 'Client submitted the application.' },
    })
    await tx.applicationEvent.create({
      data: { applicationId, type: 'SUBMITTED', actorId: actor.userId, actorName: actor.name },
    })
  }, { timeout: 20000 })

  const gen = await generateTasksForApplication(applicationId, snapshot, actor.name, app.referenceNo)
  if (gen.created === 0) {
    const existing = await db.applicationTask.count({ where: { applicationId } })
    if (existing === 0) {
      throw new HttpError(500, 'TASK_GENERATION_FAILED', 'Task generation produced no tasks; please retry submission.')
    }
  }
  await createQuotationStandalone(applicationId, snapshot.pricing as PricingConfig)

  await notify({
    userId: app.client.user.id,
    title: 'Application submitted',
    body: `Application ${app.referenceNo} has been submitted. Reference: ${app.referenceNo}`,
    type: 'APPLICATION',
    linkView: `applications:${app.id}`,
  })
  await audit({ actor, action: 'APPLICATION_SUBMITTED', entity: 'Application', entityId: app.id, details: { refNo: app.referenceNo } })

  await advanceStageAfterSubmit(applicationId)
  return { referenceNo: app.referenceNo, tasksCreated: gen.created }
}

async function advanceStageAfterSubmit(applicationId: string): Promise<void> {
  const { advanceWorkflow } = await import('./tasks')
  await advanceWorkflow(applicationId, { name: 'System (submission)' })
}

// Quotation creation is idempotent per application: one quotation per submission.
async function createQuotationStandalone(applicationId: string, pricing: PricingConfig): Promise<void> {
  const existing = await db.quotation.findFirst({ where: { applicationId } })
  if (existing) return
  const professional = pricing.professionalFee || 0
  const govt = pricing.govtFee || 0
  const taxPercent = pricing.taxPercent ?? 0
  const tax = Math.round((professional * taxPercent) / 100)
  const discount = pricing.discount ?? 0
  const total = professional + govt + tax - discount
  const items = [
    { label: 'Professional service charge', amount: professional, note: pricing.professionalFeeNote || null },
    { label: 'Government/statutory fee', amount: govt, note: pricing.govtFeeNote || null },
    ...(taxPercent ? [{ label: `Tax on professional services (${taxPercent}%)`, amount: tax, note: pricing.taxNote || null }] : []),
    ...(discount ? [{ label: 'Discount', amount: -discount, note: null }] : []),
  ]
  await db.quotation.create({
    data: {
      applicationId,
      professionalFee: professional,
      govtFee: govt,
      taxAmount: tax,
      discount,
      total,
      items: JSON.stringify(items),
      pricingNote: pricing.demoMarked ? 'DEMONSTRATION pricing — pending professional verification of amounts.' : null,
      demoMarked: !!pricing.demoMarked,
      status: 'SENT',
    },
  })
}

export { visibleSections }

// =====================================================================
// Record-level access control for a single application.
// =====================================================================

// A reviewer may open work assigned to them, or an unassigned approval task
// in the reviewer pool. This keeps the application detail permission aligned
// with the review queue and the review-decision endpoint.
export function caReviewerTaskScope(userId: string) {
  return {
    OR: [
      { assignedToId: userId },
      {
        assignedToId: null,
        responsibleRole: 'CA_REVIEWER',
        approvalRequired: true,
        approvalStatus: 'PENDING_REVIEW',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    ],
  }
}

export async function loadApplicationFor(ctx: AuthContext, applicationId: string, options?: { reviewerRead?: boolean }) {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      service: { select: { id: true, clientName: true, code: true, demoMarked: true, authority: true, officialUrl: true } },
      business: true,
      client: { include: { user: { select: { id: true, name: true, email: true } } } },
      documents: { orderBy: { createdAt: 'desc' } },
      tasks: { include: { assignee: { select: { id: true, name: true } }, department: { select: { code: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      quotations: { include: { payments: true } },
      taxPayments: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 },
      filings: { orderBy: { recordedAt: 'desc' } },
    },
  })
  if (!app) throw new HttpError(404, 'NOT_FOUND', 'Application not found.')

  if (ctx.role === 'KNOWLEDGE_MANAGER') {
    throw new HttpError(403, 'FORBIDDEN', 'Knowledge managers do not have access to casework applications.')
  }
  if (ctx.role === 'CLIENT') {
    const client = await db.client.findUnique({ where: { userId: ctx.userId } })
    if (!client || app.clientId !== client.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot access this application.')
    return app
  }
  if (ctx.role === 'EMPLOYEE') {
    const assigned = app.tasks.some((t) => t.assignee?.id === ctx.userId)
    if (!assigned) throw new HttpError(403, 'FORBIDDEN', 'This application is not assigned to you.')
    return app
  }
  if (ctx.role === 'CA_REVIEWER') {
    if (options?.reviewerRead) return app
    const assigned = app.tasks.some((t) => t.assignee?.id === ctx.userId)
    const unassignedReview = app.tasks.some((t) =>
      t.responsibleRole === 'CA_REVIEWER' &&
      t.approvalRequired &&
      t.approvalStatus === 'PENDING_REVIEW' &&
      ['PENDING', 'IN_PROGRESS'].includes(t.status) &&
      !t.assignee,
    )
    if (!assigned && !unassignedReview) {
      throw new HttpError(403, 'FORBIDDEN', 'This application has no review task assigned to you or awaiting a reviewer.')
    }
    return app
  }
  return app // MANAGER / ADMIN / SUPER_ADMIN
}
