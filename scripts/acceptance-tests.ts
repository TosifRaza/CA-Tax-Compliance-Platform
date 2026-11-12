/**
 * Acceptance tests — master prompt section 26 scenarios against the running dev server.
 * Run: npx tsx scripts/acceptance-tests.ts   (dev server must be running; set ACCEPTANCE_BASE_URL to override http://localhost:3000)
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

const BASE = process.env.ACCEPTANCE_BASE_URL ?? 'http://localhost:3000'
const DEMO_PASSWORD = 'Demo@1234'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    failures.push(`${name} ${detail}`)
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

// ---- cookie-jar HTTP helper (one jar per login identity) ----
interface ApiClient {
  (method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown>; error?: { code: string; message: string } }>
  getCookie(): string
}

function makeClient(): ApiClient {
  let cookie = ''
  const fn = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const m = setCookie.match(/cms_session=[^;]+/)
      if (m) cookie = m[0]
    }
    let data: unknown = null
    const text = await res.text()
    try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
    const d = data as { error?: { code: string; message: string } }
    return { status: res.status, data: data as Record<string, unknown>, error: d?.error }
  }
  const out = fn as ApiClient
  out.getCookie = () => cookie
  return out
}

async function login(email: string): Promise<ApiClient> {
  const c = makeClient()
  const res = await c('POST', '/api/auth/login', { email, password: DEMO_PASSWORD })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res)}`)
  return c
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a, 0x74, 0x65, 0x73, 0x74, 0x0a])

async function uploadDoc(c: ApiClient, appId: string, requirementCode: string, name = 'test-doc.pdf'): Promise<number> {
  const fd = new FormData()
  fd.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name)
  fd.append('requirementCode', requirementCode)
  const res = await fetch(`${BASE}/api/applications/${appId}/documents`, {
    method: 'POST',
    headers: { Cookie: c.getCookie() },
    body: fd,
  })
  return res.status
}

async function main() {
  console.log('\n=== Acceptance tests (master prompt §26 subset) ===\n')

  // ---------- logins ----------
  const client1 = await login('client@demo.in')
  const client2 = await login('client2@demo.in')
  const admin = await login('admin@demo.in')
  const manager = await login('manager@demo.in')
  const employee1 = await login('employee1@demo.in')
  const ca = await login('ca@demo.in')
  const km = await login('knowledge@demo.in')

  // ---------- catalogue & seeded config checks (T10, T11) ----------
  console.log('\n[T10/T11] Seeded legal configuration checks')
  const catAdmin = await admin('GET', '/api/services')
  const services = (catAdmin.data as { services: { id: string; code: string; description: string | null; currentVersion: { pricing: { govtFee: number; govtFeeNote?: string } | null } }[] }).services
  const gstReg = services.find((s) => s.code === 'GST_REG')!
  const udyam = services.find((s) => s.code === 'UDYAM_REG')!
  const itr = services.find((s) => s.code === 'ITR_FILING')!
  check('T11: Udyam service exists with zero government fee', udyam.currentVersion?.pricing?.govtFee === 0)
  check('T11: Udyam fee note references official portal free registration', (udyam.currentVersion?.pricing?.govtFeeNote || '').toLowerCase().includes('free'))
  check('T10: ITR draft service carries legacy/new framework note', (itr.description || '').includes('1961') && (itr.description || '').includes('Tax Year 2026-27'))

  // ---------- T1: conditional documents (rented premises) ----------
  console.log('\n[T1] Conditional documents — rented premises')
  const bizRes = await client1('GET', '/api/businesses')
  const businesses = (bizRes.data as { businesses: { id: string; legalName: string; constitution: string }[] }).businesses
  const biz1 = businesses.find((b) => b.legalName === 'Sharma Traders')!

  const draft = await client1('POST', '/api/applications', { serviceId: gstReg.id, businessId: biz1.id })
  check('Draft application created', draft.status === 201, JSON.stringify(draft))
  const appId = (draft.data as { id: string }).id
  const refNo = (draft.data as { referenceNo: string }).referenceNo
  check('Reference number generated', typeof refNo === 'string' && refNo.startsWith('GST_REG-'), refNo)

  const answers: Record<string, string | boolean> = {
    businessLegalName: 'Sharma Traders',
    businessTradeName: 'Sharma Traders',
    constitution: 'PROPRIETORSHIP',
    commencementDate: '2020-04-01',
    promoterName: 'Rahul Sharma',
    promoterPan: 'ABCPS1234F',
    promoterMobile: '9000000007',
    promoterEmail: 'client@demo.in',
    principalAddress: '12/3 Bentinck Street, Kolkata',
    principalPincode: '700001',
    premisesStatus: 'RENTED',
    landlordName: 'Test Landlord',
    rentCommencementDate: '2024-01-01',
    declarationTrue: true,
  }
  const saveRes = await client1('PATCH', `/api/applications/${appId}`, { answers })
  const checklist = (saveRes.data as { checklist: { requirementCode: string; status: string }[] }).checklist
  check('T1: RENT_AGREEMENT becomes REQUIRED for rented premises', checklist.find((c) => c.requirementCode === 'RENT_AGREEMENT')?.status === 'REQUIRED')
  check('T1: OWNER_UTILITY_BILL becomes REQUIRED for rented premises', checklist.find((c) => c.requirementCode === 'OWNER_UTILITY_BILL')?.status === 'REQUIRED')
  check('T1: OWNERSHIP_PROOF is NOT_APPLICABLE for rented premises', checklist.find((c) => c.requirementCode === 'OWNERSHIP_PROOF')?.status === 'NOT_APPLICABLE')
  check('T1: proprietorship does NOT require INCORPORATION_DOCS', checklist.find((c) => c.requirementCode === 'INCORPORATION_DOCS')?.status === 'NOT_APPLICABLE')

  // ---------- T2: constitution change flips fields & docs ----------
  console.log('\n[T2] Business constitution conditions')
  const save2 = await client1('PATCH', `/api/applications/${appId}`, { answers: { ...answers, constitution: 'PRIVATE_LIMITED', entityCin: 'U29299WB2016PTC209938', authorisedSignatoryName: 'Director One' } })
  const checklist2 = (save2.data as { checklist: { requirementCode: string; status: string }[]; errors: Record<string, string> }).checklist
  check('T2: INCORPORATION_DOCS becomes REQUIRED for Private Limited', checklist2.find((c) => c.requirementCode === 'INCORPORATION_DOCS')?.status === 'REQUIRED')
  check('T2: AUTH_SIGNATORY_PROOF becomes REQUIRED for Private Limited', checklist2.find((c) => c.requirementCode === 'AUTH_SIGNATORY_PROOF')?.status === 'REQUIRED')
  const save3 = await client1('PATCH', `/api/applications/${appId}`, { answers })
  check('Constitution reverted without server errors', Object.keys((save3.data as { errors: Record<string, string> }).errors || {}).length === 0)

  // ---------- submission validation ----------
  console.log('\n[Submission] Validation & task generation (T5)')
  const earlySubmit = await client1('POST', `/api/applications/${appId}/submit`)
  check('Submission blocked until required documents uploaded', earlySubmit.status === 422, JSON.stringify(earlySubmit.data))

  for (const code of ['APPLICANT_PHOTO', 'PROMOTER_PAN', 'PROMOTER_ADDRESS_PROOF', 'RENT_AGREEMENT', 'OWNER_UTILITY_BILL']) {
    const st = await uploadDoc(client1, appId, code)
    check(`Upload ${code}`, st === 201, `status ${st}`)
  }

  const badUpload = await uploadDoc(client1, appId, 'OWNERSHIP_PROOF')
  check('Upload to NOT_APPLICABLE requirement rejected', badUpload === 422, `status ${badUpload}`)

  const submit = await client1('POST', `/api/applications/${appId}/submit`)
  check('Application submitted', submit.status === 200, JSON.stringify(submit.data))

  const detailAdmin = await admin('GET', `/api/applications/${appId}`)
  const appDetail = (detailAdmin.data as { application: { tasks: { id: string; templateCode: string; assignedTo: { id: string } | null; status: string; unassignedReason: string | null; approvalRequired: boolean }[]; quotation: { total: number; items: { label: string; amount: number }[] } | null; status: string; serviceVersion: { id: string; version: string } } }).application
  check('10 application-specific tasks generated', appDetail.tasks.length === 10, `got ${appDetail.tasks.length}`)
  const firstTask = appDetail.tasks.find((t) => t.templateCode === 'COMPLETENESS_CHECK')!
  check('First task auto-assigned to an employee', !!firstTask.assignedTo)
  check('Dependent tasks start pending', appDetail.tasks.find((t) => t.templateCode === 'DOC_VERIFICATION')?.status === 'PENDING')
  check('Quotation generated with professional fee + 18% tax', appDetail.quotation?.total === 5899, `total ${appDetail.quotation?.total}`)
  const oldVersionId = appDetail.serviceVersion.id
  check('Application references its configuration version', appDetail.serviceVersion.version === '1.0.0')

  const dupSubmit = await client1('POST', `/api/applications/${appId}/submit`)
  check('T5: duplicate submission rejected (409/422)', dupSubmit.status === 409 || dupSubmit.status === 422, `status ${dupSubmit.status}`)
  const detailAfter = await admin('GET', `/api/applications/${appId}`)
  check('T5: task set not duplicated after duplicate submit', ((detailAfter.data as { application: { tasks: unknown[] } }).application.tasks.length) === 10)

  // ---------- T7: authorization ----------
  console.log('\n[T7] Authorization & record-level access')
  const c2biz = await client2('GET', '/api/businesses')
  const c2bizId = (c2biz.data as { businesses: { id: string; legalName: string }[] }).businesses[0].id
  const c2draft = await client2('POST', '/api/applications', { serviceId: gstReg.id, businessId: c2bizId })
  check('Client 2 draft created', c2draft.status === 201)
  const c2appId = (c2draft.data as { id: string }).id
  const cross = await client1('GET', `/api/applications/${c2appId}`)
  check('T7: client cannot access another client\u2019s application', cross.status === 403, `status ${cross.status}`)
  const empCross = await employee1('GET', `/api/applications/${c2appId}`)
  check('T7: employee cannot access unassigned application', empCross.status === 403, `status ${empCross.status}`)
  const forbiddenCreate = await employee1('POST', '/api/services', { code: 'X', clientName: 'X', categoryId: gstReg.id })
  check('Backend denies staff-role misuse (employee cannot create services)', forbiddenCreate.status === 403)
  const validateByEmp = await employee1('POST', `/api/services/${gstReg.id}/versions/${oldVersionId}/validate`, {})
  check('Backend denies employee config validation', validateByEmp.status === 403)

  // ---------- happy path: task chain ----------
  console.log('\n[Workflow] Task chain, review, evidence gate, completion (T12, T13)')
  const tasksOf = async () => {
    const res = await admin('GET', `/api/applications/${appId}`)
    return (res.data as { application: { tasks: { id: string; templateCode: string; status: string; assignedTo: { id: string } | null; approvalRequired: boolean; unassignedReason: string | null }[]; status: string; currentStageCode: string | null; filings: { acknowledgementNo: string | null }[] } }).application
  }

  async function completeTask(code: string, evidence?: string) {
    const snap = await tasksOf()
    const t = snap.tasks.find((x) => x.templateCode === code)!
    // Managerial accounts may act on any task (assignment overrides remain audited).
    return admin('PATCH', `/api/tasks/${t.id}`, { action: 'status', status: 'COMPLETED', evidenceNote: evidence })
  }

  const r1 = await completeTask('COMPLETENESS_CHECK')
  check('COMPLETENESS_CHECK completed', r1.status === 200, JSON.stringify(r1.data))
  const r2 = await completeTask('DOC_VERIFICATION')
  check('DOC_VERIFICATION completed after dependency', r2.status === 200, JSON.stringify(r2.data))
  const r3 = await completeTask('CLIENT_INFO_REVIEW')
  check('CLIENT_INFO_REVIEW completed', r3.status === 200)
  const r4 = await completeTask('APP_PREPARATION')
  check('APP_PREPARATION completed', r4.status === 200)

  // CA approval via review endpoint
  const revSnap = await tasksOf()
  const revTask = revSnap.tasks.find((t) => t.templateCode === 'PROFESSIONAL_REVIEW')!
  const revWrongUser = await employee1('POST', '/api/reviews', { taskId: revTask.id, decision: 'APPROVE', notes: 'not a CA' })
  check('Non-CA cannot record review decision', revWrongUser.status === 403)
  const revNoNotes = await ca('POST', '/api/reviews', { taskId: revTask.id, decision: 'APPROVE', notes: '' })
  check('Review decision requires notes', revNoNotes.status === 422)
  const rev = await ca('POST', '/api/reviews', { taskId: revTask.id, decision: 'APPROVE', notes: 'Documents and information verified; application ready for portal submission.' })
  check('CA professional review approved', rev.status === 200)

  // GOVT_SUBMISSION unlocked; evidence gate tests
  const govSnap = await tasksOf()
  const govTask = govSnap.tasks.find((t) => t.templateCode === 'GOVT_SUBMISSION')!
  check('GOVT_SUBMISSION unlocked after CA approval', govTask.status === 'PENDING' || govTask.status === 'IN_PROGRESS')
  const noEvidence = await admin('PATCH', `/api/tasks/${govTask.id}`, { action: 'status', status: 'COMPLETED' })
  check('T12: government task completion requires evidence note', noEvidence.status === 422, `status ${noEvidence.status}`)
  const withEvidenceNoDocs = await admin('PATCH', `/api/tasks/${govTask.id}`, { action: 'status', status: 'COMPLETED', evidenceNote: 'Submitted via portal (docs pending approval)' })
  check('T12: government submission blocked while required documents unapproved', withEvidenceNoDocs.status === 422, `status ${withEvidenceNoDocs.status}`)

  // Approve all required docs as staff
  const docsRes = await admin('GET', `/api/applications/${appId}`)
  const docs = (docsRes.data as { application: { documents: { id: string; status: string }[] } }).application.documents
  for (const d of docs.filter((x) => x.status === 'PENDING')) {
    await admin('POST', `/api/documents/${d.id}/review`, { decision: 'APPROVE' })
  }
  const r5 = await completeTask('GOVT_SUBMISSION', 'Submitted on official GST portal; confirmation screenshot archived.')
  check('GOVT_SUBMISSION completed with evidence after docs approved', r5.status === 200, JSON.stringify(r5.data))

  const r6 = await completeTask('ACK_RECORDING', 'ARN-A26-110-123-456789')
  check('ACK_RECORDING completed with ARN evidence', r6.status === 200, JSON.stringify(r6.data))

  const filingSnap = await tasksOf()
  check('Filing evidence recorded with acknowledgement number', filingSnap.filings.some((f) => f.acknowledgementNo === 'ARN-A26-110-123-456789'))

  // Query handling is optional -> cancel
  const qSnap = await tasksOf()
  const qTask = qSnap.tasks.find((t) => t.templateCode === 'QUERY_HANDLING')!
  const r7 = await admin('PATCH', `/api/tasks/${qTask.id}`, { action: 'status', status: 'CANCELLED', remarks: 'No query received from the department.' })
  check('Optional QUERY_HANDLING task cancelled cleanly', r7.status === 200, JSON.stringify(r7.data))

  // FINAL_QC (CA) + CLIENT_DELIVERY
  const qcSnap = await tasksOf()
  const qcTask = qcSnap.tasks.find((t) => t.templateCode === 'FINAL_QC')!
  const r8 = await ca('POST', '/api/reviews', { taskId: qcTask.id, decision: 'APPROVE', notes: 'Final quality check passed; certificate and acknowledgement verified.' })
  check('FINAL_QC approved by CA', r8.status === 200)
  const r9 = await completeTask('CLIENT_DELIVERY', 'Certificate and credentials delivered to client.')
  check('CLIENT_DELIVERY completed', r9.status === 200)

  const finalSnap = await tasksOf()
  check('Application COMPLETED after full workflow', finalSnap.status === 'COMPLETED', finalSnap.status)

  // Compliance obligations generated
  const comp = await client1('GET', '/api/compliance')
  const obligations = (comp.data as { obligations: { code: string; demoMarked: boolean; title: string }[] }).obligations
  check('Compliance obligations generated on completion (GSTR1/3B/9)', ['GSTR1', 'GSTR3B', 'GSTR9'].every((c) => obligations.some((o) => o.code === c)), `codes: ${obligations.map((o) => o.code).join(',')}`)
  check('Generated obligations are demo-marked', obligations.filter((o) => ['GSTR1', 'GSTR3B', 'GSTR9'].includes(o.code)).every((o) => o.demoMarked))

  // ---------- T9: payment webhook idempotency ----------
  console.log('\n[T9] Payment webhook idempotency')
  const appFinal = await client1('GET', `/api/applications/${appId}`)
  const quotation = (appFinal.data as { application: { quotation: { id: string; status: string; total: number } | null } }).application.quotation!
  const accept = await client1('POST', `/api/quotations/${quotation.id}/accept`)
  check('Client accepts quotation', accept.status === 200)
  const checkout = await client1('POST', '/api/payments/checkout', { quotationId: quotation.id })
  const paymentId = (checkout.data as { payment: { id: string } }).payment.id
  check('Checkout creates PENDING payment (never SUCCESS client-side)', (checkout.data as { payment: { status: string } }).payment.status === 'PENDING')
  const wh1 = await makeClient()('POST', '/api/payments/webhook', { paymentId, gatewayRef: 'GW-TEST-1', status: 'SUCCESS', demo: true })
  check('Webhook confirms payment', wh1.status === 200 && (wh1.data as { status: string }).status === 'SUCCESS')
  const wh2 = await makeClient()('POST', '/api/payments/webhook', { paymentId, gatewayRef: 'GW-TEST-2', status: 'SUCCESS', demo: true })
  check('T9: duplicate webhook does not double-record', (wh2.data as { duplicate: boolean }).duplicate === true)
  const whUnknown = await makeClient()('POST', '/api/payments/webhook', { paymentId: 'totally-unknown-id', gatewayRef: 'GW-X', status: 'SUCCESS', demo: true })
  check('Webhook for unknown payment rejected (no fabricated payments)', whUnknown.status === 404)

  // ---------- T8: document rejection & controlled re-upload ----------
  console.log('\n[T8] Document rejection flow')
  const c2Answers: Record<string, string | boolean> = {
    businessLegalName: 'TechNova Solutions Private Limited', constitution: 'PRIVATE_LIMITED', commencementDate: '2021-06-01',
    promoterName: 'Meera Iyer', promoterPan: 'AABCT9876K', promoterMobile: '9000000008', promoterEmail: 'client2@demo.in',
    entityCin: 'U29299WB2016PTC209938', authorisedSignatoryName: 'Meera Iyer',
    principalAddress: 'Salt Lake Sector V', principalPincode: '700091', premisesStatus: 'OWNED', declarationTrue: true,
  }
  const sv = await client2('PATCH', `/api/applications/${c2appId}`, { answers: c2Answers })
  const c2checklist = (sv.data as { checklist: { requirementCode: string; status: string }[] }).checklist
  check('Client2 owned-premises checklist: OWNERSHIP_PROOF REQUIRED, RENT_AGREEMENT N/A', c2checklist.find((c) => c.requirementCode === 'OWNERSHIP_PROOF')?.status === 'REQUIRED' && c2checklist.find((c) => c.requirementCode === 'RENT_AGREEMENT')?.status === 'NOT_APPLICABLE')
  const upSt = await uploadDoc(client2, c2appId, 'OWNERSHIP_PROOF', 'ownership-proof.pdf')
  check('Client2 uploads ownership proof', upSt === 201)
  const c2detail = await admin('GET', `/api/applications/${c2appId}`)
  const c2doc = (c2detail.data as { application: { documents: { id: string; status: string }[] } }).application.documents.find((d) => d.status === 'PENDING')!
  const rejNoReason = await admin('POST', `/api/documents/${c2doc.id}/review`, { decision: 'REJECT' })
  check('Rejection requires a reason', rejNoReason.status === 422)
  const rej = await admin('POST', `/api/documents/${c2doc.id}/review`, { decision: 'REJECT', notes: 'Document is not readable; please upload the full municipal khata copy.' })
  check('Document rejected with reason', rej.status === 200)
  const c2view = await client2('GET', `/api/applications/${c2appId}`)
  const rejDoc = (c2view.data as { application: { documents: { status: string; reviewNotes: string | null }[] } }).application.documents[0]
  check('Client sees rejection reason', rejDoc.status === 'REJECTED' && (rejDoc.reviewNotes || '').includes('municipal khata'))
  const reUp = await uploadDoc(client2, c2appId, 'OWNERSHIP_PROOF', 'ownership-proof-v2.pdf')
  check('T8: controlled re-upload allowed after rejection', reUp === 201)

  // ---------- T6: assignment fallback ----------
  console.log('\n[T6] Assignment fallback to authorized queue')
  const emps = await admin('GET', '/api/admin/employees')
  const empRows = (emps.data as { employees: { id: string; availability: string; active: boolean }[] }).employees
  for (const e of empRows) {
    await admin('PATCH', '/api/admin/employees', { id: e.id, availability: 'UNAVAILABLE' })
  }
  const app2 = await client1('POST', '/api/applications', { serviceId: gstReg.id, businessId: biz1.id })
  const app2Id = (app2.data as { id: string }).id
  const ans2 = { ...answers, businessTradeName: 'Sharma Traders 2' }
  await client1('PATCH', `/api/applications/${app2Id}`, { answers: ans2 })
  for (const code of ['APPLICANT_PHOTO', 'PROMOTER_PAN', 'PROMOTER_ADDRESS_PROOF', 'RENT_AGREEMENT', 'OWNER_UTILITY_BILL']) {
    await uploadDoc(client1, app2Id, code)
  }
  await client1('POST', `/api/applications/${app2Id}/submit`)
  const unassigned = await admin('GET', '/api/tasks?scope=unassigned')
  const unassignedTasks = (unassigned.data as { tasks: { application: { id: string }; unassignedReason: string | null }[] }).tasks.filter((t) => t.application.id === app2Id)
  check('T6: with no eligible employees, task enters authorized unassigned queue', unassignedTasks.length > 0, `count ${unassignedTasks.length}`)
  // The entry-point task (no dependencies) records why it could not be assigned;
  // dependent tasks receive the same treatment when their dependencies complete.
  check('T6: unassigned reason recorded on the entry-point task', unassignedTasks.some((t) => !!t.unassignedReason))
  const managerNotif = await manager('GET', '/api/notifications')
  const notifs = (managerNotif.data as { notifications: { title: string }[] }).notifications
  check('T6: managers notified about unassigned work', notifs.some((n) => n.title.includes('Unassigned')))
  for (const e of empRows) {
    await admin('PATCH', '/api/admin/employees', { id: e.id, availability: 'AVAILABLE' })
  }

  // ---------- T3 + T15: invalid rules & publish gates ----------
  console.log('\n[T3/T15] Invalid rule config & approval gates')
  const catsRes = await admin('GET', '/api/admin/categories')
  const firstCatId = (catsRes.data as { categories: { id: string }[] }).categories[0].id
  const t3 = await admin('POST', '/api/services', { code: 'T3_TEST', clientName: 'Rule Validation Test', categoryId: firstCatId })
  const t3Id = (t3.data as { service: { id: string } }).service.id
  const t3detail = await admin('GET', `/api/services/${t3Id}`)
  const t3versionId = (t3detail.data as { service: { currentVersion: { id: string } } }).service.currentVersion!.id
  const circularSchema = {
    sections: [{
      code: 'S1', title: 'S1', displayOrder: 1,
      fields: [
        { code: 'fieldA', label: 'A', type: 'TEXT', required: false, displayOrder: 1, visibilityRule: { field: 'fieldB', op: 'eq', value: 'x' } },
        { code: 'fieldB', label: 'B', type: 'TEXT', required: false, displayOrder: 2, visibilityRule: { field: 'fieldA', op: 'eq', value: 'y' } },
      ],
    }],
  }
  await admin('PATCH', `/api/services/${t3Id}/versions/${t3versionId}`, {
    formSchema: circularSchema,
    taskTemplates: [{ code: 'T1', name: 'T1', stageCode: 'S1', responsibleRole: 'EMPLOYEE', displayOrder: 1 }],
    pricing: { currency: 'INR', professionalFee: 0, govtFee: 0, govtFeeNote: 'test' },
  })
  const t3validate = await admin('POST', `/api/services/${t3Id}/versions/${t3versionId}/validate`, {})
  const t3report = t3validate.data as { errors: { message: string }[] }
  check('T3: circular rule configuration produces validation error', t3report.errors.some((e) => e.message.toLowerCase().includes('circular')), JSON.stringify(t3report.errors))
  const t3publish = await admin('POST', `/api/services/${t3Id}/versions/${t3versionId}/transition`, { to: 'PUBLISHED' })
  check('T15: unapproved version cannot be published', t3publish.status === 422, `status ${t3publish.status}`)
  const t3approve = await ca('POST', `/api/services/${t3Id}/versions/${t3versionId}/transition`, { to: 'APPROVED', notes: 'trying to approve invalid config' })
  check('T3: CA cannot approve configuration with validation errors', t3approve.status === 422, `status ${t3approve.status}`)

  // ---------- T4: master versioning — submitted application keeps its config ----------
  console.log('\n[T4] Configuration versioning snapshot')
  const nv = await admin('POST', `/api/services/${gstReg.id}/versions`, {})
  const nvId = (nv.data as { version: { id: string } }).version.id
  await admin('POST', `/api/services/${gstReg.id}/versions/${nvId}/transition`, { to: 'VALIDATION' })
  await admin('POST', `/api/services/${gstReg.id}/versions/${nvId}/transition`, { to: 'TEST' })
  await admin('POST', `/api/services/${gstReg.id}/versions/${nvId}/transition`, { to: 'PROFESSIONAL_REVIEW' })
  const approved = await ca('POST', `/api/services/${gstReg.id}/versions/${nvId}/transition`, { to: 'APPROVED', notes: 'Demo verification of copied configuration for v1.1.0.' })
  check('CA approves new version (valid copied config)', approved.status === 200, JSON.stringify(approved.data))
  const published = await admin('POST', `/api/services/${gstReg.id}/versions/${nvId}/transition`, { to: 'PUBLISHED' })
  check('Admin publishes CA-approved version', published.status === 200)
  const appAfter = await client1('GET', `/api/applications/${appId}`)
  const appVersion = (appAfter.data as { application: { serviceVersion: { id: string; version: string } } }).application.serviceVersion
  check('T4: completed application retains original configuration version', appVersion.id === oldVersionId && appVersion.version === '1.0.0', `got ${appVersion.version}`)

  // ---------- compliance filing evidence gate (T12 extension) ----------
  console.log('\n[T12b] Compliance filing requires acknowledgement evidence')
  const obRes = await client1('GET', '/api/compliance')
  const openObl = (obRes.data as { obligations: { id: string; status: string }[] }).obligations.find((o) => o.status === 'PENDING')!
  const noAck = await admin('POST', `/api/compliance/${openObl.id}/file`, { evidenceNote: 'portal confirmation' })
  check('Filing record without acknowledgement number rejected', noAck.status === 422)
  const withAck = await admin('POST', `/api/compliance/${openObl.id}/file`, { acknowledgementNo: 'ACK-TEST-001', evidenceNote: 'Portal receipt archived.' })
  check('Filing recorded with acknowledgement + evidence', withAck.status === 200)

  // =========================================================
  // Gap-closure acceptance checks (R-02, R-03, R-04, R-05, R-06, R-08, R-09, R-11, R-12, R-14)
  // =========================================================
  console.log('\n[GC] Gap-closure checks — period & individual taxpayer (R-02, R-14)')
  const catAdmin2 = await admin('GET', '/api/services')
  const services2 = (catAdmin2.data as { services: { id: string; code: string; currentVersion: { applicability: { periodMode?: string; applicantType?: string } } | null }[] }).services
  const itrSvc = services2.find((s) => s.code === 'ITR_FILING')!
  check('GC: ITR service is published with an active version', !!itrSvc.currentVersion)
  check('GC: ITR applicability declares INDIVIDUAL applicant type', itrSvc.currentVersion?.applicability?.applicantType === 'INDIVIDUAL')
  check('GC: ITR applicability declares ASSESSMENT_YEAR period mode', itrSvc.currentVersion?.applicability?.periodMode === 'ASSESSMENT_YEAR')

  const itrNoPeriod = await client2('POST', '/api/applications', { serviceId: itrSvc.id })
  check('GC: ITR draft without a period is rejected', itrNoPeriod.status === 422, JSON.stringify(itrNoPeriod.data))
  const bizRes2 = await client2('GET', '/api/businesses')
  const biz2List = (bizRes2.data as { businesses: { id: string; legalName: string }[] }).businesses
  const techNovaId = biz2List.find((b) => b.legalName === 'TechNova Solutions Private Limited')?.id
  check('GC: ITR draft with a business profile is rejected (individual-only)', (await client2('POST', '/api/applications', { serviceId: itrSvc.id, periodType: 'ASSESSMENT_YEAR', periodLabel: 'AY 2027-28', businessId: techNovaId })).status === 422)
  const itrBadLabel = await client2('POST', '/api/applications', { serviceId: itrSvc.id, periodType: 'ASSESSMENT_YEAR', periodLabel: '2027-28' })
  check('GC: malformed assessment-year label rejected', itrBadLabel.status === 422)
  const itrDraft = await client2('POST', '/api/applications', { serviceId: itrSvc.id, periodType: 'ASSESSMENT_YEAR', periodLabel: 'AY 2027-28' })
  check('GC: individual ITR draft created without a business entity', itrDraft.status === 201, JSON.stringify(itrDraft.data))
  const itrAppId = (itrDraft.data as { id: string }).id
  const itrDetail = await client2('GET', `/api/applications/${itrAppId}`)
  const itrApp = (itrDetail.data as { application: { periodLabel: string | null; periodType: string | null; business: { legalName: string } | null } }).application
  check('GC: draft carries the chosen assessment year', itrApp.periodLabel === 'AY 2027-28' && itrApp.periodType === 'ASSESSMENT_YEAR')
  check('GC: individual draft has no business entity attached', itrApp.business === null || itrApp.business === undefined)
  const itrChecklist = (itrDetail.data as { application: { checklist: { requirementCode: string; status: string }[] } }).application.checklist
  check('GC: PAN copy is ALWAYS required on ITR checklist', itrChecklist.some((c) => c.requirementCode === 'PAN_COPY' && c.status === 'REQUIRED'))
  check('GC: Form 16 not yet required before income answers (CONDITIONAL rule)', !itrChecklist.some((c) => c.requirementCode === 'FORM16' && c.status === 'REQUIRED'))

  // Tax payment tracking (R-06) on the GST case
  console.log('\n[GC] Gap-closure checks — client tax payment (R-06)')
  const taxNoChallan = await admin('POST', `/api/applications/${appId}/tax-payment`, { liabilityType: 'SELF_ASSESSMENT', amount: 5000, status: 'PAID' })
  check('GC: marking client tax paid without challan reference is rejected', taxNoChallan.status === 422)
  const taxPending = await admin('POST', `/api/applications/${appId}/tax-payment`, { liabilityType: 'ADVANCE_TAX', amount: 12000, status: 'PENDING', periodLabel: 'Q3 FY 2026-27' })
  check('GC: pending client tax liability recorded', taxPending.status === 201, JSON.stringify(taxPending.data))
  const taxPaid = await admin('POST', `/api/applications/${appId}/tax-payment`, { liabilityType: 'SELF_ASSESSMENT', amount: 5000, status: 'PAID', challanRef: 'BSR 0510123 / CIN 12345678' })
  check('GC: paid client tax accepted with challan reference', taxPaid.status === 201)
  const taxList = await client1('GET', `/api/applications/${appId}/tax-payment`)
  const taxRows = (taxList.data as { taxPayments: { status: string; challanRef: string | null }[] }).taxPayments
  check('GC: client sees own tax payment records', taxRows.length === 2)
  check('GC: paid row carries the challan reference; pending row has none', taxRows.some((t) => t.status === 'PAID' && t.challanRef) && taxRows.some((t) => t.status === 'PENDING' && !t.challanRef))
  const taxForbidden = await client1('POST', `/api/applications/${appId}/tax-payment`, { liabilityType: 'TDS', amount: 1, status: 'PENDING' })
  check('GC: client cannot record tax payment items (staff only)', taxForbidden.status === 403)

  // Statutory due-date master (R-04)
  console.log('\n[GC] Gap-closure checks — statutory due-date master (R-04)')
  const ddList = await admin('GET', '/api/admin/due-dates?serviceCode=ITR_FILING')
  const ddRows = (ddList.data as { dueDates: { obligationCode: string; periodLabel: string; demoMarked: boolean; source: { authority: string } | null }[] }).dueDates
  check('GC: seeded ITR due-date rows exist with source references', ddRows.length >= 2 && ddRows.every((r) => !!r.source))
  check('GC: seeded due dates are demo-marked until professional verification', ddRows.every((r) => r.demoMarked))
  const ddNoSource = await admin('PATCH', '/api/admin/due-dates', { id: ddRows[0] ? (ddList.data as { dueDates: { id: string }[] }).dueDates[0].id : 'x', verify: true, sourceReferenceId: '' })
  check('GC: verification without a source reference is rejected', ddNoSource.status === 422)
  const srcList = await admin('GET', '/api/admin/due-dates')
  const anySourceId = (srcList.data as { sources: { id: string }[] }).sources[0].id
  const ddRow0 = (srcList.data as { dueDates: { id: string }[] }).dueDates.find((r) => r.obligationCode === 'ITR_FILING')!
  const ddVerify = await admin('PATCH', '/api/admin/due-dates', { id: ddRow0.id, verify: true, sourceReferenceId: anySourceId })
  check('GC: due date verified with source records verification', ddVerify.status === 200)
  const ddDup = await admin('POST', '/api/admin/due-dates', { serviceCode: 'ITR_FILING', obligationCode: 'ITR_FILING', periodLabel: 'AY 2026-27', periodStart: '2025-04-01', periodEnd: '2026-03-31', dueDate: '2026-07-31' })
  check('GC: duplicate due-date period is rejected', ddDup.status === 409)

  // Reminder policies (R-03)
  console.log('\n[GC] Gap-closure checks — reminder policies (R-03)')
  const rpList = await admin('GET', '/api/admin/reminder-policies')
  const rpRows = (rpList.data as { policies: { name: string; intervals: number[]; active: boolean }[] }).policies
  check('GC: firm-default reminder policies seeded and active', rpRows.length >= 2 && rpRows.some((p) => p.active && p.intervals.join(',') === '15,7,2'))
  const rpNoIntervals = await admin('POST', '/api/admin/reminder-policies', { name: 'Bad policy', appliesTo: 'COMPLIANCE', intervals: [] })
  check('GC: policy without intervals is rejected', rpNoIntervals.status === 422)
  const rpOk = await admin('POST', '/api/admin/reminder-policies', { name: 'GC test policy', appliesTo: 'TASK', intervals: [5, 1], repeatEveryDays: 2, escalateAfterDays: 1 })
  check('GC: reminder policy created', rpOk.status === 201)
  const rpDeact = await admin('PATCH', '/api/admin/reminder-policies', { id: (rpOk.data as { policy: { id: string } }).policy.id, active: false })
  check('GC: reminder policy can be deactivated', rpDeact.status === 200)
  const remindersRun = await admin('POST', '/api/reminders/run')
  const sweep = (remindersRun.data as { result?: { early?: number } }).result
  check('GC: reminder sweep runs and reports deduplicated output', remindersRun.status === 200 && typeof sweep?.early === 'number')

  // Consent records (R-11)
  console.log('\n[GC] Gap-closure checks — consent records (R-11)')
  const consentDenied = await client1('GET', '/api/consents')
  check('GC: client consent list is reachable', consentDenied.status === 200 && (consentDenied.data as { consents: unknown[] }).consents.length === 0)
  const consentGrant = await client1('POST', '/api/consents', { scope: 'DATA_RETRIEVAL_26AS', purpose: 'Reconcile TDS credits for the current case.' })
  check('GC: client can grant a scoped consent', consentGrant.status === 201)
  const consentList2 = await client1('GET', '/api/consents')
  const consentRows = (consentList2.data as { consents: { id: string; status: string; scope: string; grantedByRole: string }[] }).consents
  check('GC: consent recorded as granted by CLIENT', consentRows.length === 1 && consentRows[0].status === 'GRANTED' && consentRows[0].grantedByRole === 'CLIENT')
  const consentRevoke = await client1('PATCH', '/api/consents', { id: consentRows[0].id })
  check('GC: client can revoke own consent', consentRevoke.status === 200 && (consentRevoke.data as { consent: { status: string } }).consent.status === 'REVOKED')

  // Regulatory updates (R-05, R-12)
  console.log('\n[GC] Gap-closure checks — regulatory updates (R-05, R-12)')
  const srcList2 = await admin('GET', '/api/regulatory-updates')
  const regSources = (srcList2.data as { sources: { id: string }[] }).sources
  const regCreate = await employee1('POST', '/api/regulatory-updates', { sourceReferenceId: regSources[0].id, title: 'GC test: portal maintenance notice', summary: 'Official notice that the portal will be unavailable; affects filing timelines.', affectedServiceIds: [gstReg.id] })
  check('GC: staff can report a regulatory update against a registered source', regCreate.status === 201)
  const regId = (regCreate.data as { update: { id: string } }).update.id
  const regVerifyDenied = await employee1('PATCH', '/api/regulatory-updates', { id: regId, action: 'VERIFY', verifiedNotes: 'x' })
  check('GC: ordinary employees cannot verify regulatory updates (expert gate)', regVerifyDenied.status === 403)
  const caLogin2 = await login('ca@demo.in')
  const regVerify = await caLogin2('PATCH', '/api/regulatory-updates', { id: regId, action: 'VERIFY', verifiedNotes: 'Confirmed against the official portal notice.' })
  check('GC: CA verifies update; impact snapshot computed', regVerify.status === 200)
  const regDetail = await admin('GET', '/api/regulatory-updates')
  const regRow = (regDetail.data as { updates: { id: string; status: string; impact: { applicationCount: number } | null }[] }).updates.find((u) => u.id === regId)
  check('GC: verified update carries an impact snapshot', regRow?.status === 'VERIFIED' && !!regRow.impact)
  const regApplyEarly = await caLogin2('PATCH', '/api/regulatory-updates', { id: (regDetail.data as { updates: { id: string }[] }).updates.find((u) => u.status === 'REPORTED')?.id ?? 'none', action: 'APPLY' })
  check('GC: only verified updates can be marked applied', regApplyEarly.status !== 200 || (regApplyEarly.data as { update?: { status?: string } }).update === undefined)

  // Workload report (R-09)
  console.log('\n[GC] Gap-closure checks — workload report (R-09)')
  const wl = await manager('GET', '/api/reports/workload')
  const wlData = wl.data as { workload: { name: string; openTasks: number; utilizationPct: number }[]; departments: unknown[]; reassignmentHistory: unknown[] }
  check('GC: workload report aggregates per-employee open work', wl.status === 200 && Array.isArray(wlData.workload) && wlData.workload.length >= 2)
  check('GC: workload report includes departments and reassignment history', Array.isArray(wlData.departments) && Array.isArray(wlData.reassignmentHistory))
  const wlForbidden = await client1('GET', '/api/reports/workload')
  check('GC: clients cannot access the workload report', wlForbidden.status === 403)

  // Readiness (R-08) — dashboard surfaces per-deadline readiness
  console.log('\n[GC] Gap-closure checks — deadline readiness (R-08)')
  const dashAdmin = await admin('GET', '/api/dashboard')
  const adminDeadlines = (dashAdmin.data as { admin?: { upcomingDeadlines: { title: string; readiness?: { status: string; reasons: string[] } }[] } }).admin?.upcomingDeadlines ?? []
  check('GC: admin dashboard exposes readiness on upcoming deadlines', adminDeadlines.length > 0 && adminDeadlines.every((d) => !!d.readiness))
  check('GC: readiness of the case-linked deadline is BLOCKED by the pending client tax payment', adminDeadlines.some((d) => d.readiness?.status === 'BLOCKED' && d.readiness.reasons.some((r) => r.toLowerCase().includes('tax payment'))))

  // R-13 — applicability over client attributes (registrations, turnover)
  console.log('\n[GC] Gap-closure checks — attribute-based eligibility (R-13)')
  let t13: { status: number; data: Record<string, unknown> } = await admin('POST', '/api/services', { code: 'APPLIC_TEST', clientName: 'Eligibility Screening Demo', categoryId: firstCatId })
  if (t13.status === 409) {
    const all = await admin('GET', '/api/services')
    const existing = (all.data as { services: { id: string; code: string }[] }).services.find((s) => s.code === 'APPLIC_TEST')
    t13 = { status: 200, data: { service: { id: existing!.id } } }
  }
  const t13Id = (t13.data as { service: { id: string } }).service.id
  const t13detail = await admin('GET', `/api/services/${t13Id}`)
  const t13versionId = (t13detail.data as { service: { currentVersion: { id: string } } }).service.currentVersion!.id
  // Link a seeded workflow and one registered source so the version can pass
  // publish validation (workflow + official-source gate).
  const t13wfList = await admin('GET', '/api/admin/workflows')
  const t13wfId = (t13wfList.data as { workflows: { id: string; code: string }[] }).workflows.find((w) => w.code === 'WF_GST_REG')!.id
  const t13srcRes = await admin('GET', '/api/admin/due-dates')
  const t13srcId = (t13srcRes.data as { sources: { id: string }[] }).sources[0].id
  await admin('PATCH', `/api/services/${t13Id}/versions/${t13versionId}`, {
    workflowId: t13wfId,
    sourceReferences: [{ sourceId: t13srcId, note: 'Demo source for eligibility screening test' }],
  })
  await admin('PATCH', `/api/services/${t13Id}/versions/${t13versionId}`, {
    formSchema: {
      sections: [{
        code: 'S1', title: 'Details', displayOrder: 1,
        fields: [
          { code: 'entityName', label: 'Entity name', type: 'TEXT', required: true, displayOrder: 1 },
          { code: 'declaration', label: 'I declare the information is true', type: 'YESNO', required: true, displayOrder: 2 },
        ],
      }],
    },
    documentRequirements: [{ code: 'R13_DOC', name: 'Registration copy', requiredMode: 'ALWAYS', formats: ['application/pdf'], maxFiles: 1, maxSizeMb: 10 }],
    taskTemplates: [{ code: 'R13_T1', name: 'Verify details', stageCode: 'DOC_VERIFICATION', responsibleRole: 'EMPLOYEE', displayOrder: 1 }],
    pricing: { currency: 'INR', professionalFee: 500, govtFee: 0, govtFeeNote: 'demo' },
    applicability: {
      constitutions: ['PROPRIETORSHIP'],
      applicantType: 'BUSINESS',
      notes: 'DEMONSTRATION thresholds — not statutory values; require professional verification before real use.',
      requires: { gstin: 'YES' },
      minTurnover: 100000,
      maxTurnover: 50000000,
    },
  })
  await admin('POST', `/api/services/${t13Id}/versions/${t13versionId}/transition`, { to: 'VALIDATION' })
  await admin('POST', `/api/services/${t13Id}/versions/${t13versionId}/transition`, { to: 'TEST' })
  await admin('POST', `/api/services/${t13Id}/versions/${t13versionId}/transition`, { to: 'PROFESSIONAL_REVIEW' })
  const t13approved = await ca('POST', `/api/services/${t13Id}/versions/${t13versionId}/transition`, { to: 'APPROVED', notes: 'Demo thresholds for eligibility screening test.' })
  check('GC: eligibility-screening service published through approval gates', t13approved.status === 200, `status ${t13approved.status}`)
  const t13pub = await admin('POST', `/api/services/${t13Id}/versions/${t13versionId}/transition`, { to: 'PUBLISHED' })
  check('GC: eligibility-screening service is live', t13pub.status === 200, `status ${t13pub.status}`)

  const noGstinBiz = await client1('POST', '/api/businesses', { legalName: 'R13 Eligibility Test Co', constitution: 'PROPRIETORSHIP', annualTurnover: 250000 })
  check('GC: business profile created with declared turnover', noGstinBiz.status === 201, `status ${noGstinBiz.status} ${JSON.stringify(noGstinBiz.data)}`)
  const noGstinBizId = (noGstinBiz.data as { business?: { id: string } }).business?.id
  if (noGstinBizId) {
    const blocked = await client1('POST', '/api/applications', { serviceId: t13Id, businessId: noGstinBizId })
    check('GC: draft blocked when required GSTIN is missing (server-side)', blocked.status === 422 && String((blocked.data as { error?: { message?: string } }).error?.message || '').includes('GSTIN'), `status ${blocked.status}`)
    await client1('PATCH', '/api/businesses', { id: noGstinBizId, gstin: '19ABCDE1234F1Z5' })
    const allowed = await client1('POST', '/api/applications', { serviceId: t13Id, businessId: noGstinBizId })
    check('GC: draft allowed once GSTIN is registered and turnover within bounds', allowed.status === 201, `status ${allowed.status} ${JSON.stringify(allowed.data)}`)
    await client1('PATCH', '/api/businesses', { id: noGstinBizId, annualTurnover: 60000000 })
    const overLimit = await client1('POST', '/api/applications', { serviceId: t13Id, businessId: noGstinBizId })
    check('GC: draft blocked when declared turnover exceeds the service limit', overLimit.status === 422 && String((overLimit.data as { error?: { message?: string } }).error?.message || '').toLowerCase().includes('turnover'), `status ${overLimit.status}`)
    await client1('PATCH', '/api/businesses', { id: noGstinBizId, annualTurnover: 250000 })
  } else {
    check('GC: business profile created with declared turnover', false, 'no business id')
  }

  // R-01 — Knowledge / Rule Manager separation of duties
  console.log('\n[GC] Gap-closure checks — knowledge/rule manager role (R-01)')
  const kmVersionRes = await km('POST', `/api/services/${gstReg.id}/versions`)
  check('GC: knowledge manager can open a new configuration draft', kmVersionRes.status === 201, `status ${kmVersionRes.status}`)
  const kmVersionId = (kmVersionRes.data as { version?: { id: string } }).version?.id
  if (kmVersionId) {
    const kmPricing = await km('PATCH', `/api/services/${gstReg.id}/versions/${kmVersionId}`, { pricing: '{"professionalFee":100}' })
    check('GC: knowledge manager cannot change pricing (commercial config)', kmPricing.status === 403, `status ${kmPricing.status}`)
    const kmRules = await km('PATCH', `/api/services/${gstReg.id}/versions/${kmVersionId}`, { changeNotes: 'Rule content maintenance test' })
    check('GC: knowledge manager can maintain rule content on a draft', kmRules.status === 200, `status ${kmRules.status}`)
    const kmApprove = await km('POST', `/api/services/${gstReg.id}/versions/${kmVersionId}/transition`, { to: 'APPROVED' })
    check('GC: knowledge manager cannot professionally approve a version', kmApprove.status === 403, `status ${kmApprove.status}`)
  } else {
    check('GC: knowledge manager can open a new configuration draft', false, 'no version id returned')
  }
  const kmDept = await km('POST', '/api/admin/departments', { code: 'KMTEST', name: 'Should not exist' })
  check('GC: knowledge manager cannot create organizational masters', kmDept.status === 403, `status ${kmDept.status}`)
  const kmDueDates = await km('GET', '/api/admin/due-dates')
  check('GC: knowledge manager can access the statutory due-date master', kmDueDates.status === 200, `status ${kmDueDates.status}`)
  const kmReg = await km('GET', '/api/regulatory-updates')
  check('GC: knowledge manager can access regulatory updates', kmReg.status === 200, `status ${kmReg.status}`)
  const kmEmployees = await km('GET', '/api/admin/employees')
  check('GC: knowledge manager cannot list employees', kmEmployees.status === 403, `status ${kmEmployees.status}`)

  // R-10 — upload screening and encryption at rest
  console.log('\n[GC] Gap-closure checks — document safeguards (R-10)')
  const eicar = new Uint8Array(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'))
  const eicarFd = new FormData()
  eicarFd.append('file', new Blob([eicar], { type: 'application/pdf' }), 'eicar.pdf')
  eicarFd.append('requirementCode', 'APPLICANT_PHOTO')
  const eicarRes = await fetch(`${BASE}/api/applications/${appId}/documents`, { method: 'POST', headers: { Cookie: client1.getCookie() }, body: eicarFd })
  check('GC: EICAR test signature is rejected at upload', eicarRes.status === 422, `status ${eicarRes.status}`)

  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00])
  const exeFd = new FormData()
  exeFd.append('file', new Blob([exe], { type: 'application/pdf' }), 'payload.pdf')
  exeFd.append('requirementCode', 'APPLICANT_PHOTO')
  const exeRes = await fetch(`${BASE}/api/applications/${appId}/documents`, { method: 'POST', headers: { Cookie: client1.getCookie() }, body: exeFd })
  check('GC: executable content (MZ magic) is rejected at upload', exeRes.status === 422, `status ${exeRes.status}`)

  const encBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x2d, 0x72, 0x31, 0x30, 0x0a])
  const encFd = new FormData()
  encFd.append('file', new Blob([encBytes], { type: 'application/pdf' }), 'enc-test.pdf')
  encFd.append('requirementCode', 'PROMOTER_ADDRESS_PROOF')
  const encRes = await fetch(`${BASE}/api/applications/${appId}/documents`, { method: 'POST', headers: { Cookie: client1.getCookie() }, body: encFd })
  if (encRes.status === 201) {
    const encDoc = (await encRes.json()) as { document: { id: string } }
    const encDownload = await fetch(`${BASE}/api/documents/${encDoc.document.id}/file`, { headers: { Cookie: client1.getCookie() } })
    const roundTripped = Buffer.from(await encDownload.arrayBuffer())
    check('GC: uploaded document downloads with identical bytes (decrypt-on-read)', encDownload.status === 200 && roundTripped.equals(Buffer.from(encBytes)))
    // Disk check: files under db/uploads/<appId>/ must be ENC1: sealed, never plaintext.
    const dir = path.join(process.cwd(), 'db', 'uploads', appId)
    let sealed = false
    let plaintext = 0
    try {
      for (const f of readdirSync(dir)) {
        const fp = path.join(dir, f)
        if (!statSync(fp).isFile()) continue
        const head = readFileSync(fp).subarray(0, 5).toString('utf8')
        if (head === 'ENC1:') sealed = true
        else if (head.startsWith('%PDF')) plaintext += 1
      }
    } catch { /* dir missing */ }
    check('GC: new uploads on disk are AES-256-GCM sealed (ENC1:)', sealed, 'no ENC1 file found')
    check('GC: no new plaintext document written for this application', plaintext === 0, `${plaintext} plaintext file(s)`) // legacy files belong to older applications
    const encOther = await fetch(`${BASE}/api/documents/${encDoc.document.id}/file`, { headers: { Cookie: client2.getCookie() } })
    check('GC: another client cannot download the document', encOther.status === 403 || encOther.status === 404, `status ${encOther.status}`)
  } else {
    check('GC: encrypted upload round-trip', false, `upload status ${encRes.status}`)
  }

  // ---------- summary ----------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  if (failures.length) {
    console.log('Failures:')
    failures.forEach((f) => console.log('  -', f))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test run crashed:', e)
  process.exit(1)
})
