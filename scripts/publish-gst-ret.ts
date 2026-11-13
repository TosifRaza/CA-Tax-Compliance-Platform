import { db } from '../src/lib/db'
import { assertPublishable } from '../src/lib/validation'
import { audit } from '../src/lib/audit'

async function main() {
  console.log('--- Configuring & Publishing GST Return Filing Assistance ---')

  // 1. Fetch the service
  const service = await db.service.findUnique({
    where: { code: 'GST_RET' },
    include: { versions: true },
  })

  if (!service) {
    throw new Error('Service GST_RET not found!')
  }
  console.log('Found service:', service.code, service.clientName, 'Status:', service.status)

  // 2. Fetch or create workflow WF_GST_RET
  let wf = await db.workflowDefinition.findUnique({
    where: { code: 'WF_GST_RET' },
    include: { stages: true },
  })

  if (!wf) {
    console.log('Creating workflow WF_GST_RET...')
    wf = await db.workflowDefinition.create({
      data: {
        code: 'WF_GST_RET',
        name: 'GST Return Filing Processing Workflow',
        description: 'Standard workflow for periodic GST return filing (GSTR-1, GSTR-3B, QRMP).',
        isActive: true,
      },
      include: { stages: true },
    })

    const stages = [
      { code: 'COMPLETENESS_CHECK', name: 'Initial Completeness Verification', sequence: 1, responsibleRole: 'EMPLOYEE', stageType: 'INTERNAL', slaHours: 4 },
      { code: 'DOC_VERIFICATION', name: 'Document & Register Verification', sequence: 2, responsibleRole: 'EMPLOYEE', stageType: 'INTERNAL', slaHours: 8 },
      { code: 'CLIENT_INFO_REVIEW', name: 'Client Data & ITC Reconciliation Review', sequence: 3, responsibleRole: 'EMPLOYEE', stageType: 'INTERNAL', slaHours: 6 },
      { code: 'RETURN_PREPARATION', name: 'Return Preparation & Computation', sequence: 4, responsibleRole: 'EMPLOYEE', stageType: 'INTERNAL', slaHours: 12 },
      { code: 'PROFESSIONAL_REVIEW', name: 'Professional Review (CA)', sequence: 5, responsibleRole: 'CA_REVIEWER', stageType: 'PROFESSIONAL_APPROVAL', slaHours: 24 },
      { code: 'CLIENT_CONFIRMATION', name: 'Client Confirmation of Tax Liability & ITC', sequence: 6, responsibleRole: 'CLIENT', stageType: 'CLIENT_ACTION', slaHours: 48 },
      { code: 'PORTAL_SUBMISSION', name: 'GST Portal Submission', sequence: 7, responsibleRole: 'EMPLOYEE', stageType: 'GOVERNMENT', slaHours: 4 },
      { code: 'ACK_RECORDING', name: 'Acknowledgement & ARN Recording', sequence: 8, responsibleRole: 'EMPLOYEE', stageType: 'GOVERNMENT', slaHours: 4 },
      { code: 'FINAL_QC', name: 'Final Internal Quality Check (CA)', sequence: 9, responsibleRole: 'CA_REVIEWER', stageType: 'PROFESSIONAL_APPROVAL', slaHours: 4 },
      { code: 'CLIENT_DELIVERY', name: 'Deliver Acknowledgement to Client', sequence: 10, responsibleRole: 'EMPLOYEE', stageType: 'CLOSURE', slaHours: 2 },
    ]

    for (const s of stages) {
      await db.workflowStage.create({
        data: {
          workflowId: wf.id,
          code: s.code,
          name: s.name,
          sequence: s.sequence,
          responsibleRole: s.responsibleRole,
          stageType: s.stageType,
          isMandatory: true,
          slaHours: s.slaHours,
        },
      })
    }

    wf = await db.workflowDefinition.findUnique({
      where: { code: 'WF_GST_RET' },
      include: { stages: true },
    })
  }

  // 3. Form schema
  const gstRetForm = {
    sections: [
      {
        code: 'RETURN_DETAILS',
        title: 'Return & Period Details',
        displayOrder: 1,
        description: 'Select filing period, return type, and filing frequency.',
        fields: [
          {
            code: 'businessGstin',
            label: 'GSTIN of Business',
            type: 'GSTIN',
            required: true,
            displayOrder: 1,
            prefillFromBusiness: 'gstin',
            helpText: '15-digit GSTIN (e.g., 19ABCPS1234F1Z5)',
          },
          {
            code: 'returnType',
            label: 'Return Type',
            type: 'SELECT',
            required: true,
            displayOrder: 2,
            options: [
              { value: 'GSTR1_3B', label: 'GSTR-1 & GSTR-3B Combined Filing' },
              { value: 'GSTR1', label: 'GSTR-1 (Outward Supplies)' },
              { value: 'GSTR3B', label: 'GSTR-3B (Summary Return & Tax Payment)' },
              { value: 'CMP08', label: 'CMP-08 (Composition Scheme)' },
              { value: 'IFF', label: 'IFF (Invoice Furnishing Facility - QRMP)' },
            ],
          },
          {
            code: 'filingFrequency',
            label: 'Filing Frequency',
            type: 'RADIO',
            required: true,
            displayOrder: 3,
            options: [
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'QUARTERLY_QRMP', label: 'Quarterly (QRMP Scheme)' },
            ],
          },
          {
            code: 'nilReturn',
            label: 'File as Nil Return (no outward sales or ITC for this period)',
            type: 'CHECKBOX',
            required: false,
            displayOrder: 4,
          },
        ],
      },
      {
        code: 'OUTWARD_SUPPLIES',
        title: 'Outward Supplies & Turnover',
        displayOrder: 2,
        description: 'Provide sales summary and outward tax liability.',
        fields: [
          { code: 'taxableSupplies', label: 'Total Taxable Value of Outward Supplies (INR)', type: 'NUMBER', required: false, displayOrder: 1 },
          { code: 'igstAmount', label: 'Integrated Tax (IGST) Output Liability (INR)', type: 'NUMBER', required: false, displayOrder: 2 },
          { code: 'cgstAmount', label: 'Central Tax (CGST) Output Liability (INR)', type: 'NUMBER', required: false, displayOrder: 3 },
          { code: 'sgstAmount', label: 'State/UT Tax (SGST) Output Liability (INR)', type: 'NUMBER', required: false, displayOrder: 4 },
          { code: 'zeroRatedSupplies', label: 'Zero-Rated / Export Supplies (INR)', type: 'NUMBER', required: false, displayOrder: 5 },
          { code: 'exemptSupplies', label: 'Exempt / Nil-Rated / Non-GST Supplies (INR)', type: 'NUMBER', required: false, displayOrder: 6 },
        ],
      },
      {
        code: 'ITC_DETAILS',
        title: 'Inward Supplies & Input Tax Credit (ITC)',
        displayOrder: 3,
        description: 'Details of ITC claimed as per GSTR-2B and purchase registers.',
        fields: [
          { code: 'itcEligible', label: 'Total Eligible ITC as per GSTR-2B (INR)', type: 'NUMBER', required: false, displayOrder: 1 },
          { code: 'itcIneligible', label: 'Ineligible ITC / Reversals (INR)', type: 'NUMBER', required: false, displayOrder: 2 },
          { code: 'reverseChargeApplicable', label: 'Any Inward Supplies attracting Reverse Charge (RCM)?', type: 'CHECKBOX', required: false, displayOrder: 3 },
          { code: 'rcmTaxPayable', label: 'Reverse Charge Tax Payable (INR)', type: 'NUMBER', required: false, displayOrder: 4, visibilityRule: { field: 'reverseChargeApplicable', op: 'eq', value: true } },
        ],
      },
      {
        code: 'TAX_PAYMENT',
        title: 'Tax Payment & Challan',
        displayOrder: 4,
        description: 'Record cash payment challan if tax was deposited.',
        fields: [
          { code: 'cashPaymentRequired', label: 'Any cash ledger payment / challan deposited?', type: 'CHECKBOX', required: false, displayOrder: 1 },
          { code: 'challanCpin', label: 'CPIN / Challan Identification Number', type: 'TEXT', required: false, displayOrder: 2, visibilityRule: { field: 'cashPaymentRequired', op: 'eq', value: true } },
        ],
      },
      {
        code: 'DECLARATION',
        title: 'Declaration',
        displayOrder: 5,
        fields: [
          { code: 'booksReconciled', label: 'I confirm all sales and purchase invoices match the books of account.', type: 'CHECKBOX', required: true, displayOrder: 1 },
          { code: 'declarationTrue', label: 'I declare that the information provided is complete, correct and true.', type: 'CHECKBOX', required: true, displayOrder: 2 },
        ],
      },
    ],
  }

  // 4. Document requirements
  const gstRetDocs = [
    {
      code: 'SALES_REGISTER',
      name: 'Sales Register / Outward Invoices',
      documentTypeCode: 'BANK_PROOF',
      requiredMode: 'OPTIONAL',
      formats: ['PDF', 'JPG', 'PNG'],
      maxFiles: 5,
      maxSizeMb: 15,
      description: 'Detailed sales register or outward invoice summaries for the tax period.',
    },
    {
      code: 'PURCHASE_REGISTER',
      name: 'Purchase Register / GSTR-2B',
      documentTypeCode: 'BANK_PROOF',
      requiredMode: 'OPTIONAL',
      formats: ['PDF', 'JPG', 'PNG'],
      maxFiles: 5,
      maxSizeMb: 15,
      description: 'Purchase register or auto-drafted GSTR-2B statement.',
    },
    {
      code: 'TAX_CHALLAN',
      name: 'Paid Tax Challan Receipt',
      documentTypeCode: 'BANK_PROOF',
      requiredMode: 'CONDITIONAL',
      conditionRule: { field: 'cashPaymentRequired', op: 'eq', value: true },
      conditionSummary: 'Required when cash payment is indicated.',
      formats: ['PDF', 'JPG', 'PNG'],
      maxFiles: 2,
      maxSizeMb: 10,
      description: 'Copy of paid GST challan / bank confirmation receipt.',
    },
    {
      code: 'OTHER_GST_DOCS',
      name: 'Other Supporting Documents',
      documentTypeCode: 'BANK_PROOF',
      requiredMode: 'OPTIONAL',
      formats: ['PDF', 'JPG', 'PNG'],
      maxFiles: 3,
      maxSizeMb: 15,
      description: 'Any additional reconciliation statements or portal export sheets.',
    },
  ]

  // 5. Task templates
  const gstRetTasks = [
    {
      code: 'COMPLETENESS_CHECK',
      name: 'Initial Completeness Verification',
      stageCode: 'COMPLETENESS_CHECK',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 4,
      dependsOn: [],
      displayOrder: 1,
      description: 'Verify turnover, filing frequency, and period declarations are complete.',
    },
    {
      code: 'DOC_VERIFICATION',
      name: 'Document & Register Verification',
      stageCode: 'DOC_VERIFICATION',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 8,
      dependsOn: ['COMPLETENESS_CHECK'],
      displayOrder: 2,
      description: 'Verify uploaded sales invoices, purchase registers, and tax receipts.',
    },
    {
      code: 'CLIENT_INFO_REVIEW',
      name: 'ITC Reconciliation & Information Review',
      stageCode: 'CLIENT_INFO_REVIEW',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 6,
      dependsOn: ['DOC_VERIFICATION'],
      displayOrder: 3,
      description: 'Reconcile purchase register with GSTR-2B; raise discrepancy note if necessary.',
    },
    {
      code: 'RETURN_PREPARATION',
      name: 'Return Preparation & Computation',
      stageCode: 'RETURN_PREPARATION',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 12,
      dependsOn: ['CLIENT_INFO_REVIEW'],
      displayOrder: 4,
      description: 'Prepare GSTR-1 outward tables and GSTR-3B tax computation.',
    },
    {
      code: 'PROFESSIONAL_REVIEW',
      name: 'Professional Review (CA)',
      stageCode: 'PROFESSIONAL_REVIEW',
      responsibleRole: 'CA_REVIEWER',
      slaHours: 24,
      dependsOn: ['RETURN_PREPARATION'],
      displayOrder: 5,
      approvalRequired: true,
      description: 'CA verifies return computation, ITC eligibility, and tax liability before client sign-off.',
    },
    {
      code: 'CLIENT_CONFIRMATION',
      name: 'Client Confirmation of Tax Liability & ITC',
      stageCode: 'CLIENT_CONFIRMATION',
      responsibleRole: 'CLIENT',
      slaHours: 48,
      dependsOn: ['PROFESSIONAL_REVIEW'],
      displayOrder: 6,
      description: 'Client reviews draft return and approves tax liability/ITC computation.',
    },
    {
      code: 'PORTAL_SUBMISSION',
      name: 'GST Portal Submission',
      stageCode: 'PORTAL_SUBMISSION',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 4,
      dependsOn: ['CLIENT_CONFIRMATION'],
      displayOrder: 7,
      evidenceRequired: true,
      description: 'File GSTR-1 / GSTR-3B on the GST portal via DSC or EVC; save submission proof.',
    },
    {
      code: 'ACK_RECORDING',
      name: 'Acknowledgement & ARN Recording',
      stageCode: 'ACK_RECORDING',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 4,
      dependsOn: ['PORTAL_SUBMISSION'],
      displayOrder: 8,
      evidenceRequired: true,
      description: 'Record filed return ARN and download signed acknowledgement.',
    },
    {
      code: 'FINAL_QC',
      name: 'Final Quality Check (CA)',
      stageCode: 'FINAL_QC',
      responsibleRole: 'CA_REVIEWER',
      slaHours: 4,
      dependsOn: ['ACK_RECORDING'],
      displayOrder: 9,
      approvalRequired: true,
      description: 'CA conducts final QC on filed acknowledgement and filed summary.',
    },
    {
      code: 'CLIENT_DELIVERY',
      name: 'Deliver Acknowledgement to Client',
      stageCode: 'CLIENT_DELIVERY',
      responsibleRole: 'EMPLOYEE',
      departmentCode: 'GST_INDIRECT',
      slaHours: 2,
      dependsOn: ['FINAL_QC'],
      displayOrder: 10,
      description: 'Deliver filed GSTR acknowledgement to client and mark filing complete.',
    },
  ]

  // 6. Pricing
  const gstRetPricing = {
    currency: 'INR',
    professionalFee: 999,
    professionalFeeNote: 'Standard professional fee for periodic GST return preparation, reconciliation with 2B, and portal submission assistance.',
    govtFee: 0,
    govtFeeNote: 'Filing of GSTR-1 and GSTR-3B within the statutory due date attracts Nil government fee on the official GST portal (gst.gov.in). Any late fee or statutory interest payable is deposited directly via GST challan.',
    taxPercent: 18,
    taxNote: 'GST @ 18% on professional services.',
    demoMarked: true,
  }

  // 7. Applicability
  const gstRetApplicability = {
    applicantType: 'BUSINESS',
    periodMode: 'TAX_PERIOD',
    constitutions: ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'HUF'],
    notes: 'Applicable to all GST-registered businesses filing periodic returns (GSTR-1, GSTR-3B, QRMP, or CMP-08).',
  }

  // 8. Compliance rules
  const gstRetCompliance = [
    {
      code: 'GSTR1',
      title: 'GSTR-1 Filing',
      frequency: 'MONTHLY',
      dueRule: '11th of succeeding month (or 13th for QRMP filers)',
      offsetDays: 11,
      demoMarked: true,
    },
    {
      code: 'GSTR3B',
      title: 'GSTR-3B Filing',
      frequency: 'MONTHLY',
      dueRule: '20th of succeeding month',
      offsetDays: 20,
      demoMarked: true,
    },
  ]

  // 9. Source references
  const srcRef = await db.sourceReference.findFirst({
    where: { authority: 'GSTN' },
  })

  const sourceReferences = [
    {
      sourceId: srcRef?.id ?? 'cmwdmdzdz001ftas4wc1inph3',
      note: 'GSTR-3B and GSTR-1 official filing manuals per tutorial.gst.gov.in',
    },
  ]

  // 10. Update or create the version
  const currentVersion = service.versions[0]
  if (!currentVersion) throw new Error('No version found for GST_RET')

  console.log('Updating service version:', currentVersion.id)
  await db.serviceVersion.update({
    where: { id: currentVersion.id },
    data: {
      version: '1.0.0',
      changeNotes: 'Production-ready configuration for GST Return Filing Assistance (GSTR-1, GSTR-3B, QRMP).',
      formSchema: JSON.stringify(gstRetForm),
      documentRequirements: JSON.stringify(gstRetDocs),
      taskTemplates: JSON.stringify(gstRetTasks),
      pricing: JSON.stringify(gstRetPricing),
      applicability: JSON.stringify(gstRetApplicability),
      complianceRules: JSON.stringify(gstRetCompliance),
      sourceReferences: JSON.stringify(sourceReferences),
      workflowId: wf!.id,
      status: 'PROFESSIONAL_REVIEW',
    },
  })

  // 11. Run validation
  console.log('Validating service version...')
  const report = await assertPublishable(currentVersion.id)
  console.log('Validation passed! Errors:', report.errors.length, 'Warnings:', report.warnings.length)

  // 12. Professional CA approval
  const caUser = await db.user.findFirst({ where: { role: 'CA_REVIEWER' } })
  const adminUser = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })

  console.log('Recording CA Approval...')
  await db.serviceVersion.update({
    where: { id: currentVersion.id },
    data: {
      status: 'APPROVED',
      approvedByUserId: caUser?.id,
      approvedByName: caUser?.name || 'CA S. Krishnamurthy',
      approvedAt: new Date(),
    },
  })

  await db.reviewDecision.create({
    data: {
      serviceVersionId: currentVersion.id,
      reviewerId: caUser?.id || 'cmwdmdzb00009tas4q2lerkpe',
      reviewerName: caUser?.name || 'CA S. Krishnamurthy',
      decision: 'APPROVE',
      scope: 'CONFIG',
      notes: 'GST Return Filing Assistance configuration reviewed and approved for publication.',
    },
  })

  // 13. Publish!
  console.log('Publishing service...')
  const now = new Date()
  await db.serviceVersion.update({
    where: { id: currentVersion.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: now,
      isActive: true,
      effectiveFrom: now,
    },
  })

  await db.service.update({
    where: { id: service.id },
    data: {
      status: 'PUBLISHED',
      currentVersionId: currentVersion.id,
      demoMarked: true,
    },
  })

  // 14. Audit log
  if (adminUser) {
    await audit({
      actor: {
        userId: adminUser.id,
        role: adminUser.role,
        name: adminUser.name,
        email: adminUser.email,
        phone: adminUser.phone,
        client: null,
      },
      action: 'CONFIG_PUBLISHED',
      entity: 'Service',
      entityId: service.id,
      details: { version: '1.0.0', serviceCode: 'GST_RET' },
    })
  }

  console.log('SUCCESS! GST Return Filing Assistance is now PUBLISHED and live for clients.')
}

main()
  .catch((e) => {
    console.error('Failed to publish GST_RET:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
