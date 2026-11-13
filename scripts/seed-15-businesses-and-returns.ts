import { db } from '../src/lib/db'
import { assertPublishable } from '../src/lib/validation'

async function main() {
  console.log('=== Configuring 15 Indian Business Types & Dynamic GST Returns ===')

  // 1. Find client Tosif Raza
  const clientUser = await db.user.findFirst({
    where: { email: 'razatosif206@gmail.com' },
    include: { client: true },
  })

  if (!clientUser || !clientUser.client) {
    throw new Error('Client Tosif Raza not found!')
  }
  const clientId = clientUser.client.id
  console.log('Client found:', clientUser.name, 'Client ID:', clientId)

  // 2. Define the 15 Indian business profiles
  const businessesData = [
    {
      legalName: 'Raza Enterprise (Sole Proprietorship)',
      tradeName: 'Raza Traders',
      constitution: 'PROPRIETORSHIP',
      pan: 'ABCPS1234F',
      gstin: '19ABCPS1234F1Z5',
      state: 'West Bengal',
      registeredAddress: '12 Bentinck Street, Kolkata, WB 700001',
      operatingAddress: '12 Bentinck Street, Kolkata, WB 700001',
      businessActivities: 'Sole proprietorship business in FMCG & consumer retail trading',
      annualTurnover: 1800000,
    },
    {
      legalName: 'Raza & Brothers Associates (Partnership Firm)',
      tradeName: 'Raza & Brothers',
      constitution: 'PARTNERSHIP',
      pan: 'AABFR2345K',
      gstin: '19AABFR2345K1Z3',
      state: 'West Bengal',
      registeredAddress: '45 Canning Street, Kolkata, WB 700001',
      operatingAddress: '45 Canning Street, Kolkata, WB 700001',
      businessActivities: 'Partnership trading firm dealing in electricals & hardware',
      annualTurnover: 4500000,
    },
    {
      legalName: 'Apex Horizon Supply Chain LLP',
      tradeName: 'Apex Horizon LLP',
      constitution: 'LLP',
      pan: 'AACFA3456L',
      gstin: '19AACFA3456L1Z1',
      cin: 'AAA-8901', // LLPIN
      state: 'West Bengal',
      registeredAddress: 'Unit 402, Ecospace Business Park, New Town, Kolkata 700156',
      operatingAddress: 'Unit 402, Ecospace Business Park, New Town, Kolkata 700156',
      businessActivities: 'Multi-modal freight, transport and contract logistics LLP',
      annualTurnover: 14000000,
    },
    {
      legalName: 'Raza Cloud Platforms (OPC) Private Limited',
      tradeName: 'Raza Cloud OPC',
      constitution: 'OPC',
      pan: 'AABCR4567M',
      gstin: '19AABCR4567M1ZF',
      cin: 'U72200WB2022OPC251123',
      state: 'West Bengal',
      registeredAddress: 'Salt Lake Sector V, Kolkata, WB 700091',
      operatingAddress: 'Salt Lake Sector V, Kolkata, WB 700091',
      businessActivities: 'Single member company developing cloud ERP solutions',
      annualTurnover: 3200000,
    },
    {
      legalName: 'NexGen Industrial Dynamics Private Limited',
      tradeName: 'NexGen Dynamics',
      constitution: 'PRIVATE_LIMITED',
      pan: 'AABCN5678N',
      gstin: '19AABCN5678N1ZD',
      cin: 'U74999WB2018PTC226789',
      state: 'West Bengal',
      registeredAddress: 'Plot 18, Kasba Industrial Estate, Kolkata, WB 700107',
      operatingAddress: 'Plot 18, Kasba Industrial Estate, Kolkata, WB 700107',
      businessActivities: 'Precision CNC engineering and precision components manufacturer',
      annualTurnover: 32000000,
    },
    {
      legalName: 'Bharat Infrastructure & Energy Public Limited',
      tradeName: 'Bharat Infra Power',
      constitution: 'PUBLIC_LIMITED',
      pan: 'AABCP6789P',
      gstin: '19AABCP6789P1ZB',
      cin: 'L40100WB2010PLC152345',
      state: 'West Bengal',
      registeredAddress: '1 Netaji Subhas Road, Kolkata, WB 700001',
      operatingAddress: '1 Netaji Subhas Road, Kolkata, WB 700001',
      businessActivities: 'Public limited company executing solar parks and transmission grids',
      annualTurnover: 180000000,
    },
    {
      legalName: 'Tosif Raza & Sons (HUF)',
      tradeName: 'Raza Family Estates',
      constitution: 'HUF',
      pan: 'AABHR7890Q',
      gstin: '19AABHR7890Q1Z9',
      state: 'West Bengal',
      registeredAddress: '78 Park Circus, Kolkata, WB 700017',
      operatingAddress: '78 Park Circus, Kolkata, WB 700017',
      businessActivities: 'Hindu Undivided Family estate management & commercial property leasing',
      annualTurnover: 2400000,
    },
    {
      legalName: 'Al-Huda Educational & Welfare Trust',
      tradeName: 'Al-Huda Trust',
      constitution: 'TRUST',
      pan: 'AABTR8901R',
      gstin: '19AABTR8901R1Z7',
      state: 'West Bengal',
      registeredAddress: '24 CIT Road, Entally, Kolkata, WB 700014',
      operatingAddress: '24 CIT Road, Entally, Kolkata, WB 700014',
      businessActivities: 'Registered charitable trust operating vocational training centres',
      annualTurnover: 5500000,
    },
    {
      legalName: 'Kolkata Pragati Social Welfare Society',
      tradeName: 'Pragati Welfare Society',
      constitution: 'SOCIETY',
      pan: 'AABSR9012S',
      gstin: '19AABSR9012S1Z5',
      state: 'West Bengal',
      registeredAddress: '10/2 Rashbehari Avenue, Kolkata, WB 700026',
      operatingAddress: '10/2 Rashbehari Avenue, Kolkata, WB 700026',
      businessActivities: 'Registered non-governmental society undertaking women artisan empowerment',
      annualTurnover: 3800000,
    },
    {
      legalName: 'Clean Earth Foundation (Section 8 Company)',
      tradeName: 'Clean Earth India',
      constitution: 'SECTION_8',
      pan: 'AABCC0123T',
      gstin: '19AABCC0123T1Z3',
      cin: 'U85300WB2021NPL248901',
      state: 'West Bengal',
      registeredAddress: '55 Chowringhee Road, Kolkata, WB 700071',
      operatingAddress: '55 Chowringhee Road, Kolkata, WB 700071',
      businessActivities: 'Section 8 non-profit company for circular economy & plastic recycling',
      annualTurnover: 7200000,
    },
    {
      legalName: 'Bengal Artisans Co-operative Society Ltd',
      tradeName: 'Bengal Artisans Co-op',
      constitution: 'COOPERATIVE_SOCIETY',
      pan: 'AABAS1234U',
      gstin: '19AABAS1234U1Z1',
      state: 'West Bengal',
      registeredAddress: 'College Street Market Complex, Kolkata, WB 700073',
      operatingAddress: 'College Street Market Complex, Kolkata, WB 700073',
      businessActivities: 'Member-owned cooperative society marketing traditional handloom products',
      annualTurnover: 4800000,
    },
    {
      legalName: 'Bengal Merchants Commercial Consortium (AOP)',
      tradeName: 'Merchants Consortium',
      constitution: 'AOP',
      pan: 'AABAA2345V',
      gstin: '19AABAA2345V1ZZ',
      state: 'West Bengal',
      registeredAddress: '33 Brabourne Road, Kolkata, WB 700001',
      operatingAddress: '33 Brabourne Road, Kolkata, WB 700001',
      businessActivities: 'Association of Persons engaged in pooled commodity bulk import',
      annualTurnover: 8500000,
    },
    {
      legalName: 'Eastern Mineral Co-owners Syndicate (BOI)',
      tradeName: 'Eastern Syndicate',
      constitution: 'BOI',
      pan: 'AABBB3456W',
      gstin: '19AABBB3456W1ZX',
      state: 'West Bengal',
      registeredAddress: '15 Strand Road, Kolkata, WB 700001',
      operatingAddress: '15 Strand Road, Kolkata, WB 700001',
      businessActivities: 'Body of Individuals managing shared earthmoving and quarry assets',
      annualTurnover: 6500000,
    },
    {
      legalName: 'West Bengal Urban Infrastructure Dev Corp (Govt PSU)',
      tradeName: 'WBUIDCL (Govt Entity)',
      constitution: 'GOVT_ENTITY',
      pan: 'AABCG4567X',
      gstin: '19AABCG4567X1ZV',
      cin: 'U93000WB1998SGC089123',
      tan: 'CALW01234A',
      state: 'West Bengal',
      registeredAddress: 'DF Block, Sector 1, Salt Lake City, Kolkata 700064',
      operatingAddress: 'DF Block, Sector 1, Salt Lake City, Kolkata 700064',
      businessActivities: 'State Government undertaking; GST TDS deductor u/s 51 & civil development',
      annualTurnover: 420000000,
    },
    {
      legalName: 'Global Cloud Networks Inc. (India Branch - Foreign Co)',
      tradeName: 'Global Cloud Networks India',
      constitution: 'FOREIGN_COMPANY',
      pan: 'AABCF5678Y',
      gstin: '19AABCF5678Y1ZT',
      cin: 'F01234',
      state: 'West Bengal',
      registeredAddress: 'Tower II, Millennium City IT Park, Salt Lake Sector V, Kolkata 700091',
      operatingAddress: 'Tower II, Millennium City IT Park, Salt Lake Sector V, Kolkata 700091',
      businessActivities: 'Foreign company branch office & OIDAR enterprise service provider',
      annualTurnover: 95000000,
    },
  ]

  // Clean existing businesses for this client so we have exactly the clean 15 types
  await db.business.deleteMany({
    where: { clientId },
  })

  for (const b of businessesData) {
    await db.business.create({
      data: {
        clientId,
        ...b,
        active: true,
      },
    })
    console.log(`Created business: ${b.constitution.padEnd(20)} -> ${b.legalName}`)
  }

  // 3. Now update GST_RET service schema with authentic Indian return types filtered by constitution
  const all15Constitutions = [
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
    'OTHER',
  ]

  const domesticCommercial = [
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
    'OTHER',
  ]

  const compositionEligible = [
    'PROPRIETORSHIP',
    'PARTNERSHIP',
    'HUF',
    'OPC',
    'PRIVATE_LIMITED',
    'COOPERATIVE_SOCIETY',
    'OTHER',
  ]

  const corporateIsdEcomm = [
    'LLP',
    'OPC',
    'PRIVATE_LIMITED',
    'PUBLIC_LIMITED',
    'SECTION_8',
    'FOREIGN_COMPANY',
  ]

  const gstRetForm = {
    sections: [
      {
        code: 'RETURN_DETAILS',
        title: 'Return & Entity Details',
        displayOrder: 1,
        description: 'Selected business profile details and applicable Indian GST returns.',
        fields: [
          {
            code: 'businessLegalName',
            label: 'Legal Name of Business',
            type: 'TEXT',
            required: false,
            displayOrder: 1,
            prefillFromBusiness: 'legalName',
            helpText: 'As registered with GSTN / MCA / PAN records.',
          },
          {
            code: 'businessConstitution',
            label: 'Entity Constitution (Business Type)',
            type: 'TEXT',
            required: false,
            displayOrder: 2,
            prefillFromBusiness: 'constitution',
            helpText: 'Recognized legal entity form under Indian law.',
          },
          {
            code: 'businessGstin',
            label: 'GSTIN of Business',
            type: 'GSTIN',
            required: true,
            displayOrder: 3,
            prefillFromBusiness: 'gstin',
            helpText: '15-digit Goods & Services Tax Identification Number.',
          },
          {
            code: 'returnType',
            label: 'Return Type',
            type: 'SELECT',
            required: true,
            displayOrder: 4,
            helpText: 'Statutory GST returns applicable to your constitution under Indian GST law.',
            options: [
              // 1. Regular Monthly Returns
              {
                value: 'GSTR1_3B',
                label: 'GSTR-1 & GSTR-3B Combined Filing (Regular Monthly)',
                constitutions: all15Constitutions,
              },
              {
                value: 'GSTR1',
                label: 'GSTR-1 (Outward Supplies Statement - Monthly)',
                constitutions: all15Constitutions,
              },
              {
                value: 'GSTR3B',
                label: 'GSTR-3B (Summary Return & Tax Payment - Monthly)',
                constitutions: all15Constitutions,
              },
              // 2. QRMP Scheme (Quarterly)
              {
                value: 'IFF',
                label: 'IFF (Invoice Furnishing Facility - QRMP Quarterly Scheme)',
                constitutions: domesticCommercial,
              },
              // 3. Composition Scheme (Sec 10)
              {
                value: 'CMP08',
                label: 'CMP-08 (Composition Scheme Quarterly Statement-cum-Challan)',
                constitutions: compositionEligible,
              },
              {
                value: 'GSTR4',
                label: 'GSTR-4 (Annual Return for Composition Taxpayers)',
                constitutions: compositionEligible,
              },
              // 4. Government / PSU Specific Return (TDS u/s 51)
              {
                value: 'GSTR7',
                label: 'GSTR-7 (Monthly GST TDS Return for Government Entities & Deductors u/s 51)',
                constitutions: ['GOVT_ENTITY'],
              },
              // 5. Foreign Company / NRTP / OIDAR Returns
              {
                value: 'GSTR5',
                label: 'GSTR-5 (Periodic Return for Non-Resident Taxable Persons / Foreign Companies)',
                constitutions: ['FOREIGN_COMPANY'],
              },
              {
                value: 'GSTR5A',
                label: 'GSTR-5A (Monthly Return for OIDAR Services from outside India)',
                constitutions: ['FOREIGN_COMPANY'],
              },
              // 6. ISD / E-Commerce Special Returns
              {
                value: 'GSTR6',
                label: 'GSTR-6 (Monthly Return for Input Service Distributor - ISD)',
                constitutions: corporateIsdEcomm,
              },
              {
                value: 'GSTR8',
                label: 'GSTR-8 (Monthly TCS Statement for E-Commerce Operators u/s 52)',
                constitutions: corporateIsdEcomm,
              },
              // 7. Annual & Closure Returns
              {
                value: 'GSTR9_9C',
                label: 'GSTR-9 / 9C (Annual Return & CA Reconciliation Statement)',
                constitutions: domesticCommercial.concat(['GOVT_ENTITY']),
              },
              {
                value: 'GSTR10',
                label: 'GSTR-10 (Final Return on Cancellation or Surrender of GSTIN)',
                constitutions: all15Constitutions,
              },
            ],
          },
          {
            code: 'filingFrequency',
            label: 'Filing Frequency',
            type: 'RADIO',
            required: true,
            displayOrder: 5,
            options: [
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'QUARTERLY_QRMP', label: 'Quarterly (QRMP Scheme)' },
              { value: 'ANNUAL', label: 'Annual' },
            ],
          },
          {
            code: 'nilReturn',
            label: 'File as Nil Return (no outward sales or ITC for this period)',
            type: 'CHECKBOX',
            required: false,
            displayOrder: 6,
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

  // 4. Update GST_RET service applicability & schema
  const gstRetService = await db.service.findUnique({
    where: { code: 'GST_RET' },
    include: { versions: true },
  })

  if (!gstRetService) throw new Error('Service GST_RET not found!')

  const currentVersion = gstRetService.versions[0]
  if (!currentVersion) throw new Error('ServiceVersion not found for GST_RET')

  const updatedApplicability = {
    applicantType: 'BUSINESS',
    periodMode: 'TAX_PERIOD',
    constitutions: all15Constitutions,
    notes: 'Applicable to all 15 recognized Indian business constitutions filing periodic returns.',
  }

  await db.serviceVersion.update({
    where: { id: currentVersion.id },
    data: {
      formSchema: JSON.stringify(gstRetForm),
      applicability: JSON.stringify(updatedApplicability),
      status: 'PROFESSIONAL_REVIEW',
    },
  })

  // Validate
  console.log('Running assertPublishable...')
  const report = await assertPublishable(currentVersion.id)
  console.log('Validation passed: Errors:', report.errors.length, 'Warnings:', report.warnings.length)

  // Publish
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
    where: { id: gstRetService.id },
    data: {
      status: 'PUBLISHED',
      currentVersionId: currentVersion.id,
      demoMarked: true,
    },
  })

  console.log('=== All 15 Indian Business Types & Returns Seeded & Published Successfully! ===')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
