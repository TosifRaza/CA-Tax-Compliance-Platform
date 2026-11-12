// Shared domain types used by both server services and the client SPA.

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'CA_REVIEWER'
  | 'KNOWLEDGE_MANAGER'
  | 'CLIENT'

export const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER']

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role as Role)
}

// ---------------- Rule engine ----------------

export type RuleOp = 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains' | 'empty' | 'notEmpty'

export interface RuleCondition {
  field: string
  op: RuleOp
  value?: string | number | boolean | (string | number)[]
}

export type Rule = { all: RuleNode[] } | { any: RuleNode[] }

export type RuleNode = RuleCondition | Rule

export function isGroup(n: RuleNode): n is Rule {
  return n !== null && typeof n === 'object' && ('all' in n || 'any' in n)
}

// ---------------- Form schema ----------------

export type FieldType =
  | 'TEXT' | 'TEXTAREA' | 'INTEGER' | 'DECIMAL' | 'DATE' | 'EMAIL' | 'PHONE'
  | 'PAN' | 'GSTIN' | 'CIN' | 'PIN' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'MULTISELECT'
  | 'YESNO' | 'ADDRESS' | 'SECTION_HEADING' | 'INFO'

export interface FieldValidation {
  min?: number
  max?: number
  pattern?: string // regex source
  message?: string
}

export interface FormField {
  code: string
  label: string
  type: FieldType
  required: boolean
  helpText?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  validation?: FieldValidation
  visibilityRule?: Rule
  requiredRule?: Rule
  displayOrder: number
  prefillFromBusiness?: 'legalName' | 'tradeName' | 'pan' | 'gstin' | 'cin' | 'tan' | 'constitution' | 'registeredAddress' | 'operatingAddress'
}

export interface FormSection {
  code: string
  title: string
  description?: string
  displayOrder: number
  visibilityRule?: Rule
  fields: FormField[]
}

export interface FormSchema {
  sections: FormSection[]
}

// ---------------- Document requirements ----------------

export interface DocumentRequirement {
  code: string
  name: string
  documentTypeCode?: string
  requiredMode: 'ALWAYS' | 'CONDITIONAL' | 'OPTIONAL'
  conditionRule?: Rule
  conditionSummary?: string // human-readable explanation shown to clients
  formats: string[] // PDF | JPG | PNG
  maxFiles: number
  maxSizeMb: number
  description?: string
}

// ---------------- Task templates ----------------

export interface TaskTemplate {
  code: string
  name: string
  description?: string
  stageCode: string
  responsibleRole: Role
  departmentCode?: string
  slaHours?: number
  dependsOn?: string[]
  evidenceRequired?: boolean
  approvalRequired?: boolean
  displayOrder: number
}

// ---------------- Pricing ----------------

export interface PricingConfig {
  currency: string
  professionalFee: number
  professionalFeeNote?: string
  govtFee: number
  govtFeeNote?: string // provenance / verification note for the government fee
  taxPercent?: number // tax on professional service charge only
  taxNote?: string
  discount?: number
  demoMarked: boolean
}

// ---------------- Compliance ----------------

export interface ComplianceRuleDef {
  code: string
  title: string
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'EVENT'
  dueRule: string // human-readable due-date rule, e.g. "11th of following month"
  offsetDays: number // days after period start used for demo generation
  applicabilityRule?: Rule // evaluated against application answers
  note?: string
  demoMarked: boolean
}

// ---------------- Checklist ----------------

export interface ChecklistItem {
  requirementCode: string
  name: string
  status: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE'
  reason: string
  formats: string[]
  maxFiles: number
  maxSizeMb: number
  documentTypeCode?: string
  description?: string
}

// ---------------- Service version config bundle ----------------

export interface VersionConfig {
  formSchema: FormSchema
  documentRequirements: DocumentRequirement[]
  taskTemplates: TaskTemplate[]
  pricing: PricingConfig
  applicability: {
    constitutions?: string[]
    states?: string[]
    notes?: string
    // R-14: who can apply — BUSINESS (default), INDIVIDUAL (no business entity), or ANY
    applicantType?: 'BUSINESS' | 'INDIVIDUAL' | 'ANY'
    // R-02: period capture — NONE (default) | ASSESSMENT_YEAR | TAX_PERIOD
    periodMode?: 'NONE' | 'ASSESSMENT_YEAR' | 'TAX_PERIOD'
  }
  complianceRules: ComplianceRuleDef[]
}

// ---------------- Application answers ----------------

export type Answers = Record<string, string | number | boolean | string[] | null | undefined>

// ---------------- Auth context ----------------

export interface AuthContext {
  userId: string
  email: string
  name: string
  role: Role
}

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
