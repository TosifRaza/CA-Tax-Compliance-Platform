import { db } from '../src/lib/db'
import { prefillAnswers } from '../src/lib/applications'
import { visibleSections, validateAnswers, isVisible } from '../src/lib/rules'
import { assertPublishable } from '../src/lib/validation'
import type { FormSchema } from '../src/lib/types'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${msg}`)
    failed++
  }
}

async function runTests() {
  console.log('\n=======================================================')
  console.log('       CA PRACTICE PLATFORM: COMPREHENSIVE TEST SUITE   ')
  console.log('=======================================================\n')

  // TEST 1: Database and Users
  console.log('--- TEST GROUP 1: Database Users & Roles ---')
  const users = await db.user.findMany({ select: { email: true, role: true, name: true } })
  assert(users.length >= 8, `Found ${users.length} users in database (expected >= 8)`)

  const clientUser = users.find((u) => u.email === 'razatosif206@gmail.com')
  assert(!!clientUser && clientUser.role === 'CLIENT', 'Tosif Raza exists with CLIENT role')

  const adminUser = users.find((u) => u.role === 'SUPER_ADMIN')
  assert(!!adminUser, `Super admin exists: ${adminUser?.name}`)

  const caUser = users.find((u) => u.role === 'CA_REVIEWER')
  assert(!!caUser, `CA Reviewer exists: ${caUser?.name}`)

  // TEST 2: 15 Indian Business Profiles for Client Tosif Raza
  console.log('\n--- TEST GROUP 2: 15 Indian Business Profiles (Tosif Raza) ---')
  const client = await db.client.findFirst({
    where: { user: { email: 'razatosif206@gmail.com' } },
    include: { businesses: { orderBy: { createdAt: 'asc' } } },
  })

  assert(!!client, 'Client record located')
  const businesses = client?.businesses || []
  assert(businesses.length === 15, `Client has exactly 15 business profiles (found ${businesses.length})`)

  const expectedTypes = [
    'PROPRIETORSHIP',
    'PARTNERSHIP',
    'LLP',
    'OPC',
    'PRIVATE_LIMITED',
    'PUBLIC_LIMITED',
    'HUF',
    'TRUST',
    'SOCIETY',
    'SECTION_8',
    'COOPERATIVE_SOCIETY',
    'AOP',
    'BOI',
    'GOVT_ENTITY',
    'FOREIGN_COMPANY',
  ]

  const presentTypes = businesses.map((b) => b.constitution)
  for (const t of expectedTypes) {
    assert(presentTypes.includes(t), `Constitution [${t}] profile present`)
  }

  // Verify PAN 4th characters match Indian Tax Law
  const panChecks: Record<string, string[]> = {
    PROPRIETORSHIP: ['P'],
    PARTNERSHIP: ['F'],
    LLP: ['F'],
    OPC: ['C'],
    PRIVATE_LIMITED: ['C'],
    PUBLIC_LIMITED: ['C'],
    HUF: ['H'],
    TRUST: ['T'],
    SOCIETY: ['S'],
    SECTION_8: ['C'],
    COOPERATIVE_SOCIETY: ['A'],
    AOP: ['A'],
    BOI: ['B'],
    GOVT_ENTITY: ['G', 'C'],
    FOREIGN_COMPANY: ['C', 'F'],
  }

  for (const b of businesses) {
    const validChars = panChecks[b.constitution]
    if (validChars && b.pan) {
      assert(validChars.includes(b.pan[3]), `${b.constitution} PAN (${b.pan}) 4th char is '${b.pan[3]}' (valid: ${validChars.join('/')})`)
    }
    assert(b.gstin?.length === 15, `${b.constitution} has valid 15-char GSTIN (${b.gstin})`)
  }

  // TEST 3: Published Services Catalogue
  console.log('\n--- TEST GROUP 3: Published Services Catalogue ---')
  const publishedServices = await db.service.findMany({
    where: { status: 'PUBLISHED' },
    include: { currentVersion: true, category: true },
  })

  const publishedCodes = publishedServices.map((s) => s.code)
  assert(publishedCodes.includes('GST_RET'), 'GST_RET (GST Return Filing Assistance) is PUBLISHED')
  assert(publishedCodes.includes('GST_REG'), 'GST_REG (GST Registration) is PUBLISHED')
  assert(publishedCodes.includes('ITR_FILING'), 'ITR_FILING (Income Tax Return Filing) is PUBLISHED')

  const gstRet = publishedServices.find((s) => s.code === 'GST_RET')
  assert(gstRet?.category.name === 'GST Services', 'GST_RET belongs to category "GST Services"')

  const pricing = gstRet?.currentVersion ? JSON.parse(gstRet.currentVersion.pricing) : null
  assert(pricing?.professionalFee === 999, `GST_RET professional fee is ₹999 (found ${pricing?.professionalFee})`)
  assert(pricing?.govtFee === 0, `GST_RET government fee is Nil (found ${pricing?.govtFee})`)

  // TEST 4: Service Version Validation
  console.log('\n--- TEST GROUP 4: Statutory Validation Gate (assertPublishable) ---')
  if (gstRet?.currentVersion) {
    const report = await assertPublishable(gstRet.currentVersion.id)
    assert(report.errors.length === 0, `assertPublishable passes with 0 errors (found ${report.errors.length})`)
  }

  // TEST 5: Indian System Dynamic Return Type Logic per Business Type
  console.log('\n--- TEST GROUP 5: Dynamic GST Return Filtering by Constitution ---')
  const schema = JSON.parse(gstRet!.currentVersion!.formSchema) as FormSchema
  const returnField = schema.sections[0].fields.find((f) => f.code === 'returnType')
  assert(!!returnField, 'returnType field found in form schema')

  const allOpts = returnField?.options || []
  assert(allOpts.length >= 10, `Found ${allOpts.length} Indian GST return types configured`)

  // Helper to filter options as DynamicForm does
  function getReturnsForConstitution(constCode: string) {
    return allOpts.filter((o) => {
      if (!o.constitutions || o.constitutions.length === 0) return true
      return o.constitutions.includes(constCode)
    })
  }

  // 5a. Sole Proprietorship
  const propReturns = getReturnsForConstitution('PROPRIETORSHIP').map((o) => o.value)
  assert(propReturns.includes('GSTR1_3B'), 'Proprietorship has GSTR-1 & 3B Combined')
  assert(propReturns.includes('IFF'), 'Proprietorship has IFF (QRMP)')
  assert(propReturns.includes('CMP08'), 'Proprietorship has CMP-08 (Composition)')
  assert(!propReturns.includes('GSTR7'), 'Proprietorship DOES NOT have GSTR-7 (Govt TDS)')
  assert(!propReturns.includes('GSTR5'), 'Proprietorship DOES NOT have GSTR-5 (Foreign NRTP)')

  // 5b. Government Entity / PSU
  const govtReturns = getReturnsForConstitution('GOVT_ENTITY').map((o) => o.value)
  assert(govtReturns.includes('GSTR7'), 'Government Entity has GSTR-7 (GST TDS u/s 51)')
  assert(govtReturns.includes('GSTR1_3B'), 'Government Entity has GSTR-1 & 3B Combined')
  assert(!govtReturns.includes('CMP08'), 'Government Entity DOES NOT have CMP-08 (Composition barred)')
  assert(!govtReturns.includes('GSTR5'), 'Government Entity DOES NOT have GSTR-5 (Foreign NRTP)')

  // 5c. Foreign Company
  const foreignReturns = getReturnsForConstitution('FOREIGN_COMPANY').map((o) => o.value)
  assert(foreignReturns.includes('GSTR5'), 'Foreign Company has GSTR-5 (Non-Resident Taxable Person)')
  assert(foreignReturns.includes('GSTR5A'), 'Foreign Company has GSTR-5A (OIDAR Services)')
  assert(foreignReturns.includes('GSTR1_3B'), 'Foreign Company has GSTR-1 & 3B Combined')
  assert(!foreignReturns.includes('CMP08'), 'Foreign Company DOES NOT have CMP-08 (Composition barred)')
  assert(!foreignReturns.includes('GSTR7'), 'Foreign Company DOES NOT have GSTR-7 (Govt TDS)')

  // 5d. Private Limited Company
  const pvtReturns = getReturnsForConstitution('PRIVATE_LIMITED').map((o) => o.value)
  assert(pvtReturns.includes('GSTR6'), 'Private Limited has GSTR-6 (ISD Return)')
  assert(pvtReturns.includes('GSTR8'), 'Private Limited has GSTR-8 (E-Commerce TCS Return)')
  assert(pvtReturns.includes('GSTR1_3B'), 'Private Limited has GSTR-1 & 3B Combined')

  // TEST 6: Form Data Prefilling & Application Intake
  console.log('\n--- TEST GROUP 6: Form Prefill & Validation Engine ---')
  const propBiz = businesses.find((b) => b.constitution === 'PROPRIETORSHIP')!
  const prefilled = prefillAnswers(schema, propBiz)
  assert(prefilled.businessGstin === propBiz.gstin, `GSTIN prefilled correctly: ${prefilled.businessGstin}`)
  assert(prefilled.businessLegalName === propBiz.legalName, `Legal Name prefilled correctly: ${prefilled.businessLegalName}`)
  assert(prefilled.constitution === propBiz.constitution, `Constitution prefilled: ${prefilled.constitution}`)

  // Validate required declarations
  const dummyAnswers = {
    ...prefilled,
    returnType: 'GSTR1_3B',
    filingFrequency: 'MONTHLY',
    booksReconciled: true,
    declarationTrue: true,
  }

  const issues = validateAnswers(schema, dummyAnswers)
  if (Object.keys(issues).length > 0) {
    console.log('    Validation issues details:', issues)
  }
  assert(Object.keys(issues).length === 0, `Dummy complete answer set passes validation (0 errors)`)

  // TEST 7: Workflow Stages for GST_RET
  console.log('\n--- TEST GROUP 7: Compliance Workflow Stages ---')
  const wf = await db.workflowDefinition.findUnique({
    where: { code: 'WF_GST_RET' },
    include: { stages: { orderBy: { sequence: 'asc' } } },
  })
  assert(!!wf, 'Workflow WF_GST_RET exists')
  assert(wf?.stages.length === 10, `WF_GST_RET has 10 compliance stages (found ${wf?.stages.length})`)

  const stageCodes = wf?.stages.map((s) => s.code) || []
  assert(stageCodes.includes('COMPLETENESS_CHECK'), 'Includes COMPLETENESS_CHECK')
  assert(stageCodes.includes('DOC_VERIFICATION'), 'Includes DOC_VERIFICATION')
  assert(stageCodes.includes('RETURN_PREPARATION'), 'Includes RETURN_PREPARATION')
  assert(stageCodes.includes('PROFESSIONAL_REVIEW'), 'Includes PROFESSIONAL_REVIEW (CA)')
  assert(stageCodes.includes('CLIENT_CONFIRMATION'), 'Includes CLIENT_CONFIRMATION')
  assert(stageCodes.includes('PORTAL_SUBMISSION'), 'Includes PORTAL_SUBMISSION')
  assert(stageCodes.includes('ACK_RECORDING'), 'Includes ACK_RECORDING')
  assert(stageCodes.includes('FINAL_QC'), 'Includes FINAL_QC (CA)')
  assert(stageCodes.includes('CLIENT_DELIVERY'), 'Includes CLIENT_DELIVERY')

  // SUMMARY
  console.log('\n=======================================================')
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('=======================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
  .catch((e) => {
    console.error('Test execution failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
