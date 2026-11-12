/**
 * Development seed for the Dynamic Tax & Business Compliance Management System.
 *
 * IMPORTANT LEGAL NOTE: The GST Registration service configuration seeded here is a
 * DEMONSTRATION configuration. Every fee value, due-date rule and legal reference is
 * marked demoMarked / VERIFICATION_REQUIRED and must be reviewed and approved by an
 * appropriately qualified professional (CA) against official government sources before
 * any production use. The system's own publication gate enforces source references and
 * professional approval, but human verification is still required.
 *
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

const DEMO_PASSWORD = 'Demo@1234'

async function main() {
  console.log('Seeding...')

  // ---------------- Wipe (dev seed) ----------------
  await db.auditLog.deleteMany()
  await db.supportMessage.deleteMany()
  await db.supportTicket.deleteMany()
  await db.notification.deleteMany()
  await db.filingRecord.deleteMany()
  await db.complianceObligation.deleteMany()
  await db.payment.deleteMany()
  await db.quotation.deleteMany()
  await db.taskHistory.deleteMany()
  await db.applicationTask.deleteMany()
  await db.reviewDecision.deleteMany()
  await db.applicationStatusHistory.deleteMany()
  await db.applicationEvent.deleteMany()
  await db.uploadedDocument.deleteMany()
  await db.application.deleteMany()
  await db.taxPayment.deleteMany()
  await db.reminderLog.deleteMany()
  await db.reminderPolicy.deleteMany()
  await db.statutoryDueDate.deleteMany()
  await db.regulatoryUpdate.deleteMany()
  await db.consentRecord.deleteMany()
  await db.serviceVersion.deleteMany()
  await db.service.deleteMany()
  await db.workflowStage.deleteMany()
  await db.workflowDefinition.deleteMany()
  await db.sourceReference.deleteMany()
  await db.documentType.deleteMany()
  await db.serviceCategory.deleteMany()
  await db.employee.deleteMany()
  await db.department.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()

  // ---------------- Departments ----------------
  const gstDept = await db.department.create({ data: { code: 'GST_INDIRECT', name: 'GST & Indirect Tax', description: 'GST registration, amendments and return services.' } })
  const dtDept = await db.department.create({ data: { code: 'DIRECT_TAX', name: 'Direct Tax Services', description: 'Income tax and TDS services.' } })
  const corpDept = await db.department.create({ data: { code: 'CORP_REG', name: 'Corporate & Business Registration', description: 'Company incorporation, MSME, trademark and licences.' } })
  const docDept = await db.department.create({ data: { code: 'DOCS_SUPPORT', name: 'Documentation & Client Support', description: 'Document collection, verification and client support.' } })

  // ---------------- Users ----------------
  const pwd = hashPassword(DEMO_PASSWORD)
  const mkUser = (email: string, name: string, role: string, phone?: string) =>
    db.user.create({ data: { email, name, role, phone, passwordHash: pwd } })

  const admin = await mkUser('admin@demo.in', 'Ramesh Chatterjee (System Admin)', 'SUPER_ADMIN', '9000000001')
  const manager = await mkUser('manager@demo.in', 'Anita Desai (GST Manager)', 'MANAGER', '9000000002')
  const emp1 = await mkUser('employee1@demo.in', 'Vikram Roy', 'EMPLOYEE', '9000000003')
  const emp2 = await mkUser('employee2@demo.in', 'Priya Nair', 'EMPLOYEE', '9000000004')
  const emp3 = await mkUser('employee3@demo.in', 'Arjun Mehta', 'EMPLOYEE', '9000000005')
  const ca = await mkUser('ca@demo.in', 'CA S. Krishnamurthy', 'CA_REVIEWER', '9000000006')
  const km = await mkUser('knowledge@demo.in', 'Nandita Bose (Knowledge Manager)', 'KNOWLEDGE_MANAGER', '9000000009')
  const clientUser = await mkUser('client@demo.in', 'Rahul Sharma', 'CLIENT', '9000000007')
  const clientUser2 = await mkUser('client2@demo.in', 'Meera Iyer', 'CLIENT', '9000000008')
  void admin; void dtDept; void corpDept

  await db.employee.create({ data: { userId: manager.id, departmentId: gstDept.id, designation: 'GST Manager', specialization: JSON.stringify(['GST_REG', 'GST_RET']), availability: 'AVAILABLE' } })
  await db.employee.create({ data: { userId: emp1.id, departmentId: gstDept.id, designation: 'Compliance Executive', specialization: JSON.stringify(['GST_REG', 'GST_RET']), availability: 'AVAILABLE' } })
  await db.employee.create({ data: { userId: emp2.id, departmentId: gstDept.id, designation: 'Compliance Executive', specialization: JSON.stringify(['GST_REG']), availability: 'AVAILABLE' } })
  await db.employee.create({ data: { userId: emp3.id, departmentId: docDept.id, designation: 'Documentation Executive', specialization: JSON.stringify(['DOCS']), availability: 'AVAILABLE' } })
  await db.employee.create({ data: { userId: ca.id, departmentId: gstDept.id, designation: 'Chartered Accountant (Reviewer)', specialization: JSON.stringify(['GST_REG', 'ITR', 'TDS']), availability: 'AVAILABLE' } })
  await db.employee.create({ data: { userId: km.id, departmentId: docDept.id, designation: 'Knowledge / Rule Manager', specialization: JSON.stringify(['RULES', 'DOCS']), availability: 'AVAILABLE' } })
  void km

  // ---------------- Document types ----------------
  const docTypes = [
    ['PHOTO', 'Applicant Photograph', 'Identity'],
    ['PAN_CARD', 'PAN Card', 'Identity'],
    ['AADHAAR', 'Aadhaar Card (first 8 digits must be masked unless legally required)', 'Identity'],
    ['ADDRESS_PROOF', 'Address Proof', 'Identity'],
    ['RENT_AGREEMENT', 'Rent Agreement', 'Premises'],
    ['ELECTRICITY_BILL', 'Electricity Bill / Utility Bill', 'Premises'],
    ['PROPERTY_TAX', 'Property Tax Receipt', 'Premises'],
    ['OWNERSHIP_PROOF', 'Ownership Proof Document', 'Premises'],
    ['NOC', 'No Objection Certificate (Owner)', 'Premises'],
    ['INCORPORATION_CERT', 'Certificate of Incorporation', 'Corporate'],
    ['PARTNERSHIP_DEED', 'Partnership Deed', 'Corporate'],
    ['BOARD_RESOLUTION', 'Board Resolution / Authorisation Letter', 'Corporate'],
    ['BANK_PROOF', 'Bank Statement / Cancelled Cheque', 'Financial'],
    ['MOA_AOA', 'MOA / AOA or LLP Agreement', 'Corporate'],
  ] as const
  for (const [code, name, category] of docTypes) {
    await db.documentType.create({ data: { code, name, category } })
  }

  // ---------------- Service categories ----------------
  const categories = [
    ['GST', 'GST Services', 'Registration, amendments and return services under GST.', 1],
    ['INCOME_TAX', 'Income Tax Services', 'Return preparation and filing assistance.', 2],
    ['TDS_TCS', 'TDS/TCS Services', 'Periodic TDS/TCS statement preparation and filing assistance.', 3],
    ['BIZ_REG', 'Business & Company Registration', 'Company, LLP and other constitution registrations.', 4],
    ['TRADE_LICENCE', 'Trade Licence', 'State/municipality-specific trade licence assistance.', 5],
    ['TRADEMARK', 'Trademark Services', 'Trademark filing assistance.', 6],
    ['MSME_UDYAM', 'MSME / Udyam Assistance', 'Udyam registration assistance (free on government portal).', 7],
    ['FSSAI', 'FSSAI Services', 'Food licence registration and renewal assistance.', 8],
  ] as const
  const catMap: Record<string, { id: string }> = {}
  for (const [code, name, description, order] of categories) {
    catMap[code] = await db.serviceCategory.create({ data: { code, name, description, displayOrder: order } })
  }

  // ---------------- Official Source Registry ----------------
  const srcGst = await db.sourceReference.create({ data: { authority: 'GSTN', title: 'GST Portal — Registration', url: 'https://www.gst.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED', notes: 'Reference captured from research baseline (11 Nov 2026). Content must be re-verified against the live portal before production filing reliance.' } })
  await db.sourceReference.create({ data: { authority: 'GSTN', title: 'GST Portal — Tutorials/Manuals', url: 'https://tutorial.gst.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcIt = await db.sourceReference.create({ data: { authority: 'Income Tax Dept', title: 'Income Tax e-Filing Portal', url: 'https://www.incometax.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcItLaw = await db.sourceReference.create({ data: { authority: 'Income Tax Dept', title: 'Income Tax India (Law & Rules)', url: 'https://www.incometaxindia.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED', notes: 'Framework note: Income-tax Act, 2025 effective 01-04-2026 (Tax Year 2026-27 onwards); legacy Income-tax Act, 1961 applies to earlier periods e.g. FY 2025-26 / AY 2026-27. Form applicability must be configured per period by a professional.' } })
  const srcGstReturn = await db.sourceReference.create({ data: { authority: 'GSTN', title: 'GSTR-3B user guide', url: 'https://tutorial.gst.gov.in/userguide/returns/Create_and_Submit_GSTR3B.htm', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcTds = await db.sourceReference.create({ data: { authority: 'Income Tax Dept', title: 'TDS compliance', url: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcMca = await db.sourceReference.create({ data: { authority: 'MCA', title: 'SPICe+ instruction kit', url: 'https://www.mca.gov.in/Ministry/pdf/SPICe%2B_help.pdf', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcUdyam = await db.sourceReference.create({ data: { authority: 'MoMSME', title: 'Udyam Registration Portal', url: 'https://udyamregistration.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED', notes: 'Udyam registration is FREE of government fee on the official portal. Any professional charge must be a transparent private service fee, never presented as a government charge.' } })
  const srcFssai = await db.sourceReference.create({ data: { authority: 'FSSAI', title: 'FoSCoS — Food Safety Compliance System', url: 'https://foscos.fssai.gov.in/', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcTrademark = await db.sourceReference.create({ data: { authority: 'IP India', title: 'Trade Marks Rules, 2017', url: 'https://ipindia.gov.in/tm-rules-2017', verificationStatus: 'VERIFICATION_REQUIRED' } })
  const srcWbTrade = await db.sourceReference.create({ data: { authority: 'WB UDMA', title: 'West Bengal municipal trade licence document checklist', url: 'https://udma.wb.gov.in/page/cms/trade_license_checklist_b82694', verificationStatus: 'VERIFICATION_REQUIRED', notes: 'Municipal guidance; verify the relevant local authority and requirements. Do not apply to other jurisdictions.' } })

  // ---------------- Workflow: GST Registration ----------------
  const wf = await db.workflowDefinition.create({ data: { code: 'WF_GST_REG', name: 'GST Registration Processing Workflow', description: 'Reference workflow for GST registration applications (demonstration).' } })
  const stages = [
    ['COMPLETENESS_CHECK', 'Initial Completeness Verification', 1, 'EMPLOYEE', 'INTERNAL', 4],
    ['DOC_VERIFICATION', 'Document Verification', 2, 'EMPLOYEE', 'INTERNAL', 8],
    ['CLIENT_INFO_REVIEW', 'Client Information Review', 3, 'EMPLOYEE', 'INTERNAL', 6],
    ['APP_PREPARATION', 'Application Preparation', 4, 'EMPLOYEE', 'INTERNAL', 12],
    ['PROFESSIONAL_REVIEW', 'Professional Review (CA)', 5, 'CA_REVIEWER', 'PROFESSIONAL_APPROVAL', 24],
    ['GOVT_SUBMISSION', 'Government Portal Submission', 6, 'EMPLOYEE', 'GOVERNMENT', 8],
    ['ACK_RECORDING', 'Acknowledgement & Evidence Recording', 7, 'EMPLOYEE', 'GOVERNMENT', 2],
    ['QUERY_HANDLING', 'Government Query Handling (if required)', 8, 'EMPLOYEE', 'GOVERNMENT', null],
    ['FINAL_QC', 'Final Internal Quality Check (CA)', 9, 'CA_REVIEWER', 'PROFESSIONAL_APPROVAL', 4],
    ['CLIENT_DELIVERY', 'Client Delivery', 10, 'EMPLOYEE', 'CLOSURE', 4],
  ] as const
  for (const [code, name, seq, role, type, sla] of stages) {
    await db.workflowStage.create({ data: { workflowId: wf.id, code, name, sequence: seq, responsibleRole: role, stageType: type, slaHours: sla } })
  }

  // ---------------- GST Registration form schema (DEMONSTRATION) ----------------
  const gstForm = {
    sections: [
      {
        code: 'BUSINESS_DETAILS', title: 'Business Details', displayOrder: 1,
        description: 'Basic details of the business applying for GST registration.',
        fields: [
          { code: 'businessLegalName', label: 'Legal Name of Business', type: 'TEXT', required: true, displayOrder: 1, prefillFromBusiness: 'legalName', helpText: 'As per PAN / incorporation documents.' },
          { code: 'businessTradeName', label: 'Trade Name (if any)', type: 'TEXT', required: false, displayOrder: 2, prefillFromBusiness: 'tradeName' },
          { code: 'constitution', label: 'Business Constitution', type: 'RADIO', required: true, displayOrder: 3, prefillFromBusiness: 'constitution',
            options: [
              { value: 'PROPRIETORSHIP', label: 'Proprietorship' },
              { value: 'PARTNERSHIP', label: 'Partnership' },
              { value: 'LLP', label: 'Limited Liability Partnership' },
              { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
              { value: 'PUBLIC_LIMITED', label: 'Public Limited Company' },
              { value: 'HUF', label: 'Hindu Undivided Family' },
            ] },
          { code: 'commencementDate', label: 'Date of Commencement of Business', type: 'DATE', required: true, displayOrder: 4 },
        ],
      },
      {
        code: 'PROMOTER_DETAILS', title: 'Promoter / Authorised Signatory', displayOrder: 2,
        fields: [
          { code: 'promoterName', label: 'Promoter / Signatory Name', type: 'TEXT', required: true, displayOrder: 1 },
          { code: 'promoterPan', label: 'Promoter PAN', type: 'PAN', required: true, displayOrder: 2, helpText: '10-character PAN, e.g. ABCPS1234F' },
          { code: 'promoterMobile', label: 'Mobile Number', type: 'PHONE', required: true, displayOrder: 3, helpText: '10-digit Indian mobile number.' },
          { code: 'promoterEmail', label: 'Email Address', type: 'EMAIL', required: true, displayOrder: 4 },
          { code: 'entityCin', label: 'CIN / LLPIN', type: 'CIN', required: false, displayOrder: 5,
            visibilityRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' } ] },
            requiredRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' } ] } },
          { code: 'authorisedSignatoryName', label: 'Authorised Signatory (for companies/LLP)', type: 'TEXT', required: false, displayOrder: 6,
            visibilityRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' } ] },
            requiredRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' } ] } },
        ],
      },
      {
        code: 'PRINCIPAL_PLACE', title: 'Principal Place of Business', displayOrder: 3,
        fields: [
          { code: 'principalAddress', label: 'Full Address of Principal Place of Business', type: 'TEXTAREA', required: true, displayOrder: 1 },
          { code: 'principalPincode', label: 'PIN Code', type: 'PIN', required: true, displayOrder: 2 },
          { code: 'premisesStatus', label: 'Premises Occupancy Status', type: 'RADIO', required: true, displayOrder: 3,
            options: [
              { value: 'OWNED', label: 'Owned by the business / promoter' },
              { value: 'RENTED', label: 'Rented' },
              { value: 'CONSENT', label: 'Consent premises (no rent, no ownership)' },
            ] },
          { code: 'landlordName', label: 'Landlord / Owner Name', type: 'TEXT', required: false, displayOrder: 4,
            visibilityRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] },
            requiredRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] } },
          { code: 'rentCommencementDate', label: 'Rent / Consent Commencement Date', type: 'DATE', required: false, displayOrder: 5,
            visibilityRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] },
            requiredRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] } },
        ],
      },
      {
        code: 'BANK_DETAILS', title: 'Bank Details (optional at application stage)', displayOrder: 4,
        fields: [
          { code: 'bankName', label: 'Bank Name', type: 'TEXT', required: false, displayOrder: 1 },
          { code: 'accountNumber', label: 'Account Number', type: 'TEXT', required: false, displayOrder: 2 },
          { code: 'ifsc', label: 'IFSC Code', type: 'TEXT', required: false, displayOrder: 3, validation: { pattern: '^[A-Z]{4}0[A-Z0-9]{6}$', message: 'IFSC must look like SBIN0001234.' } },
        ],
      },
      {
        code: 'DECLARATION', title: 'Declaration', displayOrder: 5,
        fields: [
          { code: 'declarationTrue', label: 'I declare that the information provided is true to the best of my knowledge.', type: 'CHECKBOX', required: true, displayOrder: 1 },
        ],
      },
    ],
  }

  const gstDocs = [
    { code: 'APPLICANT_PHOTO', name: 'Applicant Photograph', documentTypeCode: 'PHOTO', requiredMode: 'ALWAYS', formats: ['JPG', 'PNG'], maxFiles: 1, maxSizeMb: 5, description: 'Passport-size photograph of the promoter/signatory.' },
    { code: 'PROMOTER_PAN', name: 'PAN of Promoter', documentTypeCode: 'PAN_CARD', requiredMode: 'ALWAYS', formats: ['PDF', 'JPG', 'PNG'], maxFiles: 1, maxSizeMb: 10 },
    { code: 'PROMOTER_ADDRESS_PROOF', name: 'Promoter Address Proof', documentTypeCode: 'ADDRESS_PROOF', requiredMode: 'ALWAYS', formats: ['PDF', 'JPG', 'PNG'], maxFiles: 2, maxSizeMb: 10 },
    { code: 'OWNERSHIP_PROOF', name: 'Ownership Proof of Principal Place of Business', documentTypeCode: 'OWNERSHIP_PROOF', requiredMode: 'CONDITIONAL',
      conditionRule: { field: 'premisesStatus', op: 'eq', value: 'OWNED' },
      conditionSummary: 'Required because the premises are marked as owned (e.g. electricity bill, property tax receipt or municipal khata copy).',
      formats: ['PDF', 'JPG', 'PNG'], maxFiles: 2, maxSizeMb: 10, description: 'Electricity bill / property tax receipt / municipal khata copy.' },
    { code: 'RENT_AGREEMENT', name: 'Rent Agreement', documentTypeCode: 'RENT_AGREEMENT', requiredMode: 'CONDITIONAL',
      conditionRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] },
      conditionSummary: 'Required because the premises are rented or consent premises.',
      formats: ['PDF'], maxFiles: 1, maxSizeMb: 15 },
    { code: 'OWNER_UTILITY_BILL', name: "Owner's Utility Bill for the Premises", documentTypeCode: 'ELECTRICITY_BILL', requiredMode: 'CONDITIONAL',
      conditionRule: { any: [ { field: 'premisesStatus', op: 'eq', value: 'RENTED' }, { field: 'premisesStatus', op: 'eq', value: 'CONSENT' } ] },
      conditionSummary: 'Required because the premises are rented or consent premises.',
      formats: ['PDF', 'JPG', 'PNG'], maxFiles: 1, maxSizeMb: 10 },
    { code: 'OWNER_NOC', name: 'No Objection Certificate from Owner', documentTypeCode: 'NOC', requiredMode: 'OPTIONAL', formats: ['PDF'], maxFiles: 1, maxSizeMb: 10, description: 'May be requested for consent premises.' },
    { code: 'INCORPORATION_DOCS', name: 'Incorporation / Registration Proof', documentTypeCode: 'INCORPORATION_CERT', requiredMode: 'CONDITIONAL',
      conditionRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' } ] },
      conditionSummary: 'Required for companies / LLP.',
      formats: ['PDF'], maxFiles: 2, maxSizeMb: 15 },
    { code: 'AUTH_SIGNATORY_PROOF', name: 'Authorisation of Signatory (Board Resolution / Deed)', documentTypeCode: 'BOARD_RESOLUTION', requiredMode: 'CONDITIONAL',
      conditionRule: { any: [ { field: 'constitution', op: 'eq', value: 'LLP' }, { field: 'constitution', op: 'eq', value: 'PRIVATE_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PUBLIC_LIMITED' }, { field: 'constitution', op: 'eq', value: 'PARTNERSHIP' } ] },
      conditionSummary: 'Required for companies, LLP and partnership firms.',
      formats: ['PDF'], maxFiles: 2, maxSizeMb: 15 },
  ]

  const gstTasks = [
    { code: 'COMPLETENESS_CHECK', name: 'Initial Completeness Verification', stageCode: 'COMPLETENESS_CHECK', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 4, dependsOn: [], displayOrder: 1, description: 'Verify all answers and declarations are complete and consistent.' },
    { code: 'DOC_VERIFICATION', name: 'Document Verification', stageCode: 'DOC_VERIFICATION', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 8, dependsOn: ['COMPLETENESS_CHECK'], displayOrder: 2, description: 'Review every uploaded document; approve or reject with reasons.' },
    { code: 'CLIENT_INFO_REVIEW', name: 'Client Information Review', stageCode: 'CLIENT_INFO_REVIEW', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 6, dependsOn: ['DOC_VERIFICATION'], displayOrder: 3, description: 'Cross-check answers against documents; raise client information request if needed.' },
    { code: 'APP_PREPARATION', name: 'Application Preparation', stageCode: 'APP_PREPARATION', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 12, dependsOn: ['CLIENT_INFO_REVIEW'], displayOrder: 4, description: 'Prepare the government portal application package.' },
    { code: 'PROFESSIONAL_REVIEW', name: 'Professional Review (CA)', stageCode: 'PROFESSIONAL_REVIEW', responsibleRole: 'CA_REVIEWER', slaHours: 24, dependsOn: ['APP_PREPARATION'], displayOrder: 5, approvalRequired: true, description: 'CA reviews the prepared application and evidence before submission.' },
    { code: 'GOVT_SUBMISSION', name: 'Government Portal Submission', stageCode: 'GOVT_SUBMISSION', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 8, dependsOn: ['PROFESSIONAL_REVIEW'], displayOrder: 6, evidenceRequired: true, description: 'Authorized user submits on the official portal; record submission evidence.' },
    { code: 'ACK_RECORDING', name: 'Acknowledgement & Evidence Recording', stageCode: 'ACK_RECORDING', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', slaHours: 2, dependsOn: ['GOVT_SUBMISSION'], displayOrder: 7, evidenceRequired: true, description: 'Record ARN/acknowledgement number with evidence screenshot/upload.' },
    { code: 'QUERY_HANDLING', name: 'Government Query Handling (if any)', stageCode: 'QUERY_HANDLING', responsibleRole: 'EMPLOYEE', departmentCode: 'GST_INDIRECT', dependsOn: ['ACK_RECORDING'], displayOrder: 8, evidenceRequired: true, description: 'Handle SCN/query if raised by the department; cancel this task if no query is received.' },
    { code: 'FINAL_QC', name: 'Final Internal Quality Check (CA)', stageCode: 'FINAL_QC', responsibleRole: 'CA_REVIEWER', slaHours: 4, dependsOn: ['ACK_RECORDING'], displayOrder: 9, approvalRequired: true, description: 'Final CA quality check of acknowledgement, certificate and deliverables.' },
    { code: 'CLIENT_DELIVERY', name: 'Deliver Certificate & Credentials to Client', stageCode: 'CLIENT_DELIVERY', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 4, dependsOn: ['FINAL_QC'], displayOrder: 10, description: 'Deliver registration certificate and credentials; record delivery.' },
  ]

  const gstPricing = {
    currency: 'INR',
    professionalFee: 4999,
    professionalFeeNote: 'DEMONSTRATION internal professional charge — configurable by firm policy; not an official charge.',
    govtFee: 0,
    govtFeeNote: 'GST registration attracts no government fee on the official GST portal (demonstration value — re-verify before production).',
    taxPercent: 18,
    taxNote: 'Tax on professional services — DEMONSTRATION rate; confirm applicable rate and registration requirements.',
    demoMarked: true,
  }

  const gstCompliance = [
    { code: 'GSTR1', title: 'GSTR-1 (Outward supplies statement) — demonstration', frequency: 'MONTHLY', dueRule: '11th of the following month (verify current rule incl. QRMP applicability)', offsetDays: 21, note: 'DEMONSTRATION obligation — professional must verify frequency and due date for the specific taxpayer.', demoMarked: true },
    { code: 'GSTR3B', title: 'GSTR-3B (Summary return) — demonstration', frequency: 'MONTHLY', dueRule: '20th of the following month (verify current rule incl. QRMP applicability)', offsetDays: 30, note: 'DEMONSTRATION obligation — professional must verify frequency and due date for the specific taxpayer.', demoMarked: true },
    { code: 'GSTR9', title: 'GSTR-9 (Annual return) — demonstration', frequency: 'ANNUAL', dueRule: 'Verify current due date for the relevant FY', offsetDays: 365, note: 'DEMONSTRATION obligation — applicability thresholds must be verified.', demoMarked: true },
  ]

  const gstApplicability = {
    constitutions: ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'HUF'],
    states: [],
    notes: 'DEMONSTRATION configuration. Threshold limits, mandatory registration criteria and state-specific rules must be verified by the responsible professional before activation.',
  }

  // ---------------- GST Registration service + version ----------------
  const gstService = await db.service.create({
    data: {
      categoryId: catMap.GST.id,
      code: 'GST_REG',
      internalName: 'GST Registration (Reference Implementation)',
      clientName: 'GST Registration',
      description: 'Assisted GST registration: guided application, document verification, professional review and government portal submission assistance. (Demonstration configuration pending professional verification.)',
      authority: 'Goods & Services Tax Network (GSTN)',
      officialUrl: 'https://www.gst.gov.in/',
      verificationStatus: 'VERIFICATION_REQUIRED',
      status: 'PUBLISHED',
      demoMarked: true,
    },
  })
  const gstVersion = await db.serviceVersion.create({
    data: {
      serviceId: gstService.id,
      version: '1.0.0',
      status: 'PUBLISHED',
      changeNotes: 'Initial demonstration configuration (seeded). Pending CA verification against gst.gov.in.',
      formSchema: JSON.stringify(gstForm),
      documentRequirements: JSON.stringify(gstDocs),
      taskTemplates: JSON.stringify(gstTasks),
      pricing: JSON.stringify(gstPricing),
      applicability: JSON.stringify(gstApplicability),
      complianceRules: JSON.stringify(gstCompliance),
      sourceReferences: JSON.stringify([{ sourceId: srcGst.id, note: 'Primary portal reference' }]),
      workflowId: wf.id,
      effectiveFrom: new Date('2026-11-11T00:00:00+05:30'),
      approvedByName: 'Seeded demo (not a professional approval)',
      approvedAt: new Date(),
      publishedAt: new Date(),
      validationReport: JSON.stringify({ errors: [], warnings: [{ severity: 'WARNING', message: 'Source references are VERIFICATION_REQUIRED; professional verification outstanding.' }], checkedAt: new Date().toISOString() }),
    },
  })
  await db.service.update({ where: { id: gstService.id }, data: { currentVersionId: gstVersion.id } })

  // ---------------- Workflow: ITR Filing (individual taxpayers) ----------------
  const wfItr = await db.workflowDefinition.create({ data: { code: 'WF_ITR_FILING', name: 'Income Tax Return Filing Workflow', description: 'Workflow for individual income-tax return filing assistance (demonstration).' } })
  const itrStages = [
    ['COMPLETENESS_CHECK', 'Initial Completeness Verification', 1, 'EMPLOYEE', 'INTERNAL', 4],
    ['DOC_VERIFICATION', 'Document Verification (Form 16, TDS certificates)', 2, 'EMPLOYEE', 'INTERNAL', 8],
    ['CLIENT_INFO_REVIEW', 'Client Information Review', 3, 'EMPLOYEE', 'INTERNAL', 6],
    ['RETURN_PREPARATION', 'Return Preparation (data entry & computation)', 4, 'EMPLOYEE', 'INTERNAL', 12],
    ['PROFESSIONAL_REVIEW', 'Professional Review (CA)', 5, 'CA_REVIEWER', 'PROFESSIONAL_APPROVAL', 24],
    ['CLIENT_CONFIRMATION', 'Client Confirmation of Computation & Tax', 6, 'CLIENT', 'CLIENT_ACTION', null],
    ['PORTAL_SUBMISSION', 'e-Filing Portal Submission', 7, 'EMPLOYEE', 'GOVERNMENT', 4],
    ['VERIFICATION_EVIDENCE', 'Verification & ITR-V Evidence Recording', 8, 'EMPLOYEE', 'GOVERNMENT', 4],
    ['FINAL_QC', 'Final Internal Quality Check (CA)', 9, 'CA_REVIEWER', 'PROFESSIONAL_APPROVAL', 4],
    ['CLIENT_DELIVERY', 'Deliver Acknowledgement to Client', 10, 'EMPLOYEE', 'CLOSURE', 2],
  ] as const
  for (const [code, name, seq, role, type, sla] of itrStages) {
    await db.workflowStage.create({ data: { workflowId: wfItr.id, code, name, sequence: seq, responsibleRole: role, stageType: type, slaHours: sla } })
  }

  // ---------------- ITR Filing form schema (individual taxpayer; period chosen in the wizard) ----------------
  const itrForm = {
    sections: [
      {
        code: 'PERSONAL_DETAILS', title: 'Personal Details', displayOrder: 1,
        description: 'Details of the individual taxpayer. The assessment year is chosen in the first step of this wizard.',
        fields: [
          { code: 'fullName', label: 'Full Name (as per PAN)', type: 'TEXT', required: true, displayOrder: 1 },
          { code: 'pan', label: 'PAN', type: 'PAN', required: true, displayOrder: 2, helpText: '10-character PAN, e.g. ABCPS1234F' },
          { code: 'mobile', label: 'Mobile Number', type: 'PHONE', required: true, displayOrder: 3 },
          { code: 'email', label: 'Email Address', type: 'EMAIL', required: true, displayOrder: 4 },
          { code: 'address', label: 'Residential Address', type: 'TEXTAREA', required: true, displayOrder: 5 },
        ],
      },
      {
        code: 'INCOME_DETAILS', title: 'Income Details', displayOrder: 2,
        fields: [
          { code: 'incomeSource', label: 'Primary Income Source', type: 'RADIO', required: true, displayOrder: 1,
            options: [
              { value: 'SALARY', label: 'Salary / Pension' },
              { value: 'BUSINESS_PROFESSION', label: 'Business or Profession' },
              { value: 'CAPITAL_GAINS', label: 'Capital Gains' },
              { value: 'OTHER_SOURCES', label: 'Other Sources (interest etc.)' },
            ] },
          { code: 'employerName', label: 'Employer / Deductor Name', type: 'TEXT', required: false, displayOrder: 2,
            visibilityRule: { any: [{ field: 'incomeSource', op: 'eq', value: 'SALARY' }] },
            requiredRule: { any: [{ field: 'incomeSource', op: 'eq', value: 'SALARY' }] } },
          { code: 'grossTotalIncome', label: 'Gross Total Income (approx, INR)', type: 'NUMBER', required: true, displayOrder: 3 },
          { code: 'hasCapitalGains', label: 'Any capital gains during the year?', type: 'CHECKBOX', required: false, displayOrder: 4 },
          { code: 'hasForeignAssets', label: 'Any foreign assets or income?', type: 'CHECKBOX', required: false, displayOrder: 5 },
          { code: 'hasForm26ASMismatch', label: 'Any mismatch noticed in Form 26AS / AIS?', type: 'CHECKBOX', required: false, displayOrder: 6 },
        ],
      },
      {
        code: 'TAX_PAID', title: 'Tax Already Paid', displayOrder: 3,
        fields: [
          { code: 'tdsDeducted', label: 'Total TDS deducted (as per Form 16 / 26AS, INR)', type: 'NUMBER', required: false, displayOrder: 1 },
          { code: 'advanceTaxPaid', label: 'Advance tax / self-assessment tax paid (INR)', type: 'NUMBER', required: false, displayOrder: 2 },
        ],
      },
      {
        code: 'DECLARATION', title: 'Declaration', displayOrder: 4,
        fields: [
          { code: 'declarationTrue', label: 'I declare that the information provided is true to the best of my knowledge.', type: 'CHECKBOX', required: true, displayOrder: 1 },
        ],
      },
    ],
  }

  const itrDocs = [
    { code: 'PAN_COPY', name: 'PAN Card Copy', documentTypeCode: 'PAN_CARD', requiredMode: 'ALWAYS', formats: ['PDF', 'JPG', 'PNG'], maxFiles: 1, maxSizeMb: 10 },
    { code: 'FORM16', name: 'Form 16 (Salary TDS certificate)', documentTypeCode: 'TDS_CERT', requiredMode: 'CONDITIONAL',
      conditionRule: { field: 'incomeSource', op: 'eq', value: 'SALARY' },
      conditionSummary: 'Required because salary income is declared.',
      formats: ['PDF'], maxFiles: 2, maxSizeMb: 10 },
    { code: 'BANK_INTEREST_CERT', name: 'Bank Interest Certificate', documentTypeCode: 'INTEREST_CERT', requiredMode: 'CONDITIONAL',
      conditionRule: { field: 'hasForm26ASMismatch', op: 'eq', value: true },
      conditionSummary: 'Required because a Form 26AS / AIS mismatch was declared; the certificate helps reconcile TDS.',
      formats: ['PDF', 'JPG', 'PNG'], maxFiles: 2, maxSizeMb: 10, description: 'Interest certificates from banks/post office.' },
    { code: 'INVESTMENT_PROOFS', name: 'Investment / Deduction Proofs', documentTypeCode: 'INVESTMENT_PROOF', requiredMode: 'OPTIONAL', formats: ['PDF', 'JPG', 'PNG'], maxFiles: 5, maxSizeMb: 10, description: '80C/80D or other deduction proofs not already reported to the employer.' },
  ]

  const itrTasks = [
    { code: 'COMPLETENESS_CHECK', name: 'Initial Completeness Verification', stageCode: 'COMPLETENESS_CHECK', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 4, dependsOn: [], displayOrder: 1, description: 'Verify answers, PAN and declarations are complete and consistent.' },
    { code: 'DOC_VERIFICATION', name: 'Document Verification', stageCode: 'DOC_VERIFICATION', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 8, dependsOn: ['COMPLETENESS_CHECK'], displayOrder: 2, description: 'Review Form 16 / certificates; approve or reject with reasons.' },
    { code: 'CLIENT_INFO_REVIEW', name: 'Client Information Review', stageCode: 'CLIENT_INFO_REVIEW', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 6, dependsOn: ['DOC_VERIFICATION'], displayOrder: 3, description: 'Cross-check income figures against documents; raise information request if needed.' },
    { code: 'RETURN_PREPARATION', name: 'Return Preparation & Computation', stageCode: 'RETURN_PREPARATION', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 12, dependsOn: ['CLIENT_INFO_REVIEW'], displayOrder: 4, description: 'Prepare the computation and draft return for the chosen assessment year.' },
    { code: 'PROFESSIONAL_REVIEW', name: 'Professional Review (CA)', stageCode: 'PROFESSIONAL_REVIEW', responsibleRole: 'CA_REVIEWER', slaHours: 24, dependsOn: ['RETURN_PREPARATION'], displayOrder: 5, approvalRequired: true, description: 'CA reviews the computation and draft return before client confirmation.' },
    { code: 'CLIENT_CONFIRMATION', name: 'Client Confirmation of Computation', stageCode: 'CLIENT_CONFIRMATION', responsibleRole: 'CLIENT', slaHours: 48, dependsOn: ['PROFESSIONAL_REVIEW'], displayOrder: 6, description: 'Client confirms the computed tax and return details before filing.' },
    { code: 'PORTAL_SUBMISSION', name: 'e-Filing Portal Submission', stageCode: 'PORTAL_SUBMISSION', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 4, dependsOn: ['CLIENT_CONFIRMATION'], displayOrder: 7, evidenceRequired: true, description: 'Submit on the official e-filing portal; record submission evidence.' },
    { code: 'VERIFICATION_EVIDENCE', name: 'Verification & ITR-V Evidence Recording', stageCode: 'VERIFICATION_EVIDENCE', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 4, dependsOn: ['PORTAL_SUBMISSION'], displayOrder: 8, evidenceRequired: true, description: 'Record e-verification / ITR-V acknowledgement as evidence.' },
    { code: 'FINAL_QC', name: 'Final Internal Quality Check (CA)', stageCode: 'FINAL_QC', responsibleRole: 'CA_REVIEWER', slaHours: 4, dependsOn: ['VERIFICATION_EVIDENCE'], displayOrder: 9, approvalRequired: true, description: 'Final CA quality check of the acknowledgement and deliverables.' },
    { code: 'CLIENT_DELIVERY', name: 'Deliver Acknowledgement to Client', stageCode: 'CLIENT_DELIVERY', responsibleRole: 'EMPLOYEE', departmentCode: 'DOCS_SUPPORT', slaHours: 2, dependsOn: ['FINAL_QC'], displayOrder: 10, description: 'Deliver the filed acknowledgement; record delivery.' },
  ]

  const itrPricing = {
    currency: 'INR',
    professionalFee: 1499,
    professionalFeeNote: 'DEMONSTRATION internal professional charge for ITR filing assistance — configurable by firm policy; not an official charge.',
    govtFee: 0,
    govtFeeNote: 'Filing an income-tax return attracts no government fee on the e-filing portal (demonstration value — re-verify before production). Any tax liability of the client is tracked separately as the client\u2019s own tax payment.',
    taxPercent: 18,
    taxNote: 'Tax on professional services — DEMONSTRATION rate; confirm applicable rate and registration requirements.',
    demoMarked: true,
  }

  const itrApplicability = {
    applicantType: 'INDIVIDUAL',
    periodMode: 'ASSESSMENT_YEAR',
    constitutions: [],
    states: [],
    notes: 'DEMONSTRATION configuration for individual taxpayers (ITR-1/ITR-4 class of cases). Form selection (ITR-1/Sahaj, ITR-4/Sugam etc.) depends on the chosen assessment year, income composition and the applicable framework (Income-tax Act, 1961 for periods up to AY 2026-27; Income-tax Act, 2025 from Tax Year 2026-27 onwards). Must be verified per period by a professional before reliance.',
  }

  const itrCompliance = [
    { code: 'ADVANCE_TAX', title: 'Advance tax instalment (individuals) — demonstration', frequency: 'QUARTERLY', dueRule: '15 Jun / 15 Sep / 15 Dec / 15 Mar per current rules; verify for the specific year', offsetDays: 90, note: 'DEMONSTRATION obligation — professional must verify instalment dates for the relevant assessment year.', demoMarked: true },
    { code: 'ITR_FILING', title: 'Income-tax return filing for the assessment year — demonstration', frequency: 'ANNUAL', dueRule: 'Verify the current due date for the relevant assessment year (historically 31 July for non-audit cases)', offsetDays: 180, note: 'DEMONSTRATION obligation — due dates differ by year and audit status; verify before reliance.', demoMarked: true },
  ]

  // ---------------- ITR Filing service + version (published; individual taxpayers) ----------------
  const itrService = await db.service.create({
    data: {
      categoryId: catMap.INCOME_TAX.id,
      code: 'ITR_FILING',
      internalName: 'Income Tax Return Filing Assistance (Individuals)',
      clientName: 'Income Tax Return Filing (Individuals)',
      description: 'Assisted income-tax return filing for individual taxpayers: guided data entry, document verification, professional review and e-filing portal submission assistance. Framework note: legacy Income-tax Act, 1961 applies to earlier periods (e.g. AY 2026-27 for FY 2025-26); the new framework applies from Tax Year 2026-27 onwards. Form selection must be configured per period by a professional. (Demonstration configuration pending professional verification.)',
      authority: 'Income Tax Department',
      officialUrl: 'https://www.incometax.gov.in/',
      verificationStatus: 'VERIFICATION_REQUIRED',
      status: 'PUBLISHED',
      demoMarked: true,
    },
  })
  const itrVersion = await db.serviceVersion.create({
    data: {
      serviceId: itrService.id,
      version: '1.0.0',
      status: 'PUBLISHED',
      changeNotes: 'Initial demonstration configuration for individual taxpayers (seeded). Pending CA verification against incometax.gov.in.',
      formSchema: JSON.stringify(itrForm),
      documentRequirements: JSON.stringify(itrDocs),
      taskTemplates: JSON.stringify(itrTasks),
      pricing: JSON.stringify(itrPricing),
      applicability: JSON.stringify(itrApplicability),
      complianceRules: JSON.stringify(itrCompliance),
      sourceReferences: JSON.stringify([
        { sourceId: srcIt.id, note: 'Primary e-filing portal reference' },
        { sourceId: srcItLaw.id, note: 'Framework note: legacy Act (1961) applies to earlier periods (e.g. AY 2026-27 for FY 2025-26); new framework from Tax Year 2026-27 onwards.' },
      ]),
      workflowId: wfItr.id,
      effectiveFrom: new Date('2026-11-12T00:00:00+05:30'),
      approvedByName: 'Seeded demo (not a professional approval)',
      approvedAt: new Date(),
      publishedAt: new Date(),
      validationReport: JSON.stringify({ errors: [], warnings: [{ severity: 'WARNING', message: 'Source references are VERIFICATION_REQUIRED; professional verification outstanding.' }], checkedAt: new Date().toISOString() }),
    },
  })
  await db.service.update({ where: { id: itrService.id }, data: { currentVersionId: itrVersion.id } })

  // ---------------- Other services (config intentionally incomplete -> blocked from publication) ----------------
  const draftServices: [string, string, string, string, string | null, string | null][] = [
    // (ITR_FILING is configured and published above as the individual-taxpayer reference service.)
    ['GST_RET', 'GST Return Filing Assistance', 'GST', 'Periodic GST return preparation and filing assistance (GSTR-1, GSTR-3B; QRMP where applicable). Configuration pending professional verification.', 'https://www.gst.gov.in/', 'Goods & Services Tax Network (GSTN)'],
    ['TDS_RETURN', 'TDS Return Filing Assistance', 'TDS_TCS', 'Quarterly TDS statement preparation and filing assistance. Configuration pending professional verification.', 'https://traces61.tdscpc.gov.in/app/', 'TRACES / Income Tax Dept'],
    ['COMPANY_INC', 'Company Incorporation Assistance', 'BIZ_REG', 'Private limited company incorporation assistance via MCA SPICe+ (configuration pending).', 'https://www.mca.gov.in/', 'Ministry of Corporate Affairs'],
    ['TRADE_LICENCE', 'Trade Licence Application Assistance', 'TRADE_LICENCE', 'Municipal trade licence application assistance. Rules vary by state/municipality; jurisdiction-specific configuration required before activation.', 'https://udma.wb.gov.in/', 'State/Municipal Authority'],
    ['TM_REG', 'Trademark Registration Assistance', 'TRADEMARK', 'Trademark filing assistance (class selection, search and filing). Configuration pending professional verification.', 'https://ipindia.gov.in/', 'CGPDTM (IP India)'],
    ['UDYAM_REG', 'Udyam Registration Assistance', 'MSME_UDYAM', 'Udyam registration assistance. Government registration is FREE on the official portal; any professional charge must be shown separately as a private service fee.', 'https://udyamregistration.gov.in/', 'MoMSME'],
    ['FSSAI_LIC', 'FSSAI Registration & Licence Assistance', 'FSSAI', 'FSSAI basic registration / state / central licence assistance. Configuration pending professional verification.', 'https://foscos.fssai.gov.in/', 'FSSAI'],
  ]
  for (const [code, name, cat, desc, url, authority] of draftServices) {
    const svc = await db.service.create({
      data: {
        categoryId: catMap[cat].id, code, internalName: name, clientName: name, description: desc,
        officialUrl: url, authority,
        verificationStatus: 'VERIFICATION_REQUIRED', status: 'DRAFT', demoMarked: true,
      },
    })
    const sourceByService: Record<string, string> = {
      GST_RET: srcGstReturn.id, TDS_RETURN: srcTds.id, COMPANY_INC: srcMca.id,
      TRADE_LICENCE: srcWbTrade.id, TM_REG: srcTrademark.id,
      UDYAM_REG: srcUdyam.id, FSSAI_LIC: srcFssai.id,
    }
    const srcId = sourceByService[code]
    const draftVersion = await db.serviceVersion.create({
      data: {
        serviceId: svc.id, version: '0.1.0', status: 'DRAFT',
        changeNotes: 'Initial draft — incomplete configuration. Cannot be published until validated and professionally approved.',
        formSchema: JSON.stringify({ sections: [] }),
        documentRequirements: JSON.stringify([]),
        taskTemplates: JSON.stringify([]),
        pricing: JSON.stringify({ currency: 'INR', professionalFee: 0, govtFee: 0, demoMarked: true, govtFeeNote: code === 'UDYAM_REG' ? 'Udyam registration is free on the official government portal (per udyamregistration.gov.in reference).' : 'To be verified against the official authority before publication.' }),
        applicability: JSON.stringify({ notes: 'To be defined.' }),
        complianceRules: JSON.stringify([]),
        sourceReferences: JSON.stringify([{ sourceId: srcId, note: 'Draft reference' }]),
      },
    })
    await db.service.update({ where: { id: svc.id }, data: { currentVersionId: draftVersion.id } })
  }

  // ---------------- Clients & businesses ----------------
  const client1 = await db.client.create({ data: { userId: clientUser.id, phone: '9000000007' } })
  const client2 = await db.client.create({ data: { userId: clientUser2.id, phone: '9000000008' } })
  const biz1 = await db.business.create({
    data: {
      clientId: client1.id, legalName: 'Sharma Traders', tradeName: 'Sharma Traders',
      constitution: 'PROPRIETORSHIP', pan: 'ABCPS1234F', state: 'West Bengal',
      registeredAddress: '12/3 Bentinck Street, Kolkata, West Bengal', operatingAddress: '12/3 Bentinck Street, Kolkata, West Bengal',
      businessActivities: 'Retail trading of consumer goods',
    },
  })
  await db.business.create({
    data: {
      clientId: client2.id, legalName: 'TechNova Solutions Private Limited', tradeName: 'TechNova',
      constitution: 'PRIVATE_LIMITED', pan: 'AABCT9876K', cin: 'U29299WB2016PTC209938', state: 'West Bengal',
      registeredAddress: 'Salt Lake Sector V, Kolkata, West Bengal', operatingAddress: 'Salt Lake Sector V, Kolkata, West Bengal',
      businessActivities: 'Software development and IT consulting',
    },
  })
  void client2

  // ---------------- Demo compliance obligations (marked demonstration) ----------------
  await db.complianceObligation.create({
    data: {
      clientId: client1.id, businessId: biz1.id,
      code: 'GSTR1', title: 'GSTR-1 filing — November 2026 (DEMONSTRATION)',
      frequency: 'MONTHLY', periodLabel: 'November 2026',
      dueDate: new Date('2026-12-11T23:59:00+05:30'), internalTargetDate: new Date('2026-12-06T23:59:00+05:30'),
      status: 'PENDING', note: 'Due rule: 11th of following month (verify current rule incl. QRMP applicability).', demoMarked: true,
    },
  })
  await db.complianceObligation.create({
    data: {
      clientId: client1.id, businessId: biz1.id,
      code: 'GSTR3B', title: 'GSTR-3B filing — November 2026 (DEMONSTRATION)',
      frequency: 'MONTHLY', periodLabel: 'November 2026',
      dueDate: new Date('2026-12-20T23:59:00+05:30'), internalTargetDate: new Date('2026-12-15T23:59:00+05:30'),
      status: 'PENDING', note: 'Due rule: 20th of following month (verify current rule incl. QRMP applicability).', demoMarked: true,
    },
  })

  // ---------------- Reminder policy (firm default; gap R-03) ----------------
  await db.reminderPolicy.create({
    data: {
      name: 'Firm default — compliance deadlines',
      appliesTo: 'COMPLIANCE',
      serviceId: null,
      intervalsDays: JSON.stringify([15, 7, 2]),
      repeatEveryDays: 3,
      escalateAfterDays: 3,
      escalateToRole: 'MANAGER',
      channel: 'IN_APP',
      active: true,
    },
  })
  await db.reminderPolicy.create({
    data: {
      name: 'Firm default — client information requests',
      appliesTo: 'INFO_REQUEST',
      serviceId: null,
      intervalsDays: JSON.stringify([7, 2]),
      repeatEveryDays: 2,
      escalateAfterDays: 5,
      escalateToRole: 'MANAGER',
      channel: 'IN_APP',
      active: true,
    },
  })

  // ---------------- Statutory due-date master (demo rows; gap R-04) ----------------
  // Every row is demoMarked until a qualified professional records verification
  // with an official source reference (admin Masters → Statutory due dates).
  await db.statutoryDueDate.create({
    data: {
      serviceCode: 'ITR_FILING', obligationCode: 'ITR_FILING', frequency: 'ANNUAL',
      periodLabel: 'AY 2026-27', periodStart: new Date('2025-04-01T00:00:00+05:30'), periodEnd: new Date('2026-03-31T23:59:59+05:30'),
      dueDate: new Date('2026-07-31T23:59:00+05:30'),
      sourceReferenceId: srcIt.id, sourceNote: 'Historical due date for non-audit individual cases; the applicable deadline for AY 2026-27 (including any notified extension) must be confirmed on the e-filing portal by the responsible professional.',
      effectiveFrom: new Date('2026-11-12T00:00:00+05:30'),
      notes: 'DEMONSTRATION row — verify before reliance.',
      demoMarked: true,
    },
  })
  await db.statutoryDueDate.create({
    data: {
      serviceCode: 'ITR_FILING', obligationCode: 'ADVANCE_TAX', frequency: 'QUARTERLY',
      periodLabel: 'Q4 FY 2025-26', periodStart: new Date('2026-01-01T00:00:00+05:30'), periodEnd: new Date('2026-03-31T23:59:59+05:30'),
      dueDate: new Date('2026-03-15T23:59:00+05:30'),
      sourceReferenceId: srcItLaw.id, sourceNote: 'Last advance-tax instalment for individuals (15 March convention); confirm against current rules for the specific year.',
      effectiveFrom: new Date('2026-11-12T00:00:00+05:30'),
      notes: 'DEMONSTRATION row — verify before reliance.',
      demoMarked: true,
    },
  })

  // ---------------- Welcome notifications ----------------
  await db.notification.create({ data: { userId: clientUser.id, title: 'Welcome to the Compliance Portal', body: 'Register your business profile and apply for services.', type: 'SYSTEM' } })

  console.log('Seed complete.')
  console.log('Demo logins (password: %s):', DEMO_PASSWORD)
  console.log('  admin@demo.in   (Super Admin)  | manager@demo.in (Manager)')
  console.log('  employee1@demo.in employee2@demo.in (Employees) | ca@demo.in (CA Reviewer)')
  console.log('  client@demo.in  (Client — Sharma Traders) | client2@demo.in (Client — TechNova)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
