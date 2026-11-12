# Masters Mapping — original 28 masters → implemented architecture

The legacy documentation defines 28 master types. Per the development mandate ("Do not create separate database tables for concepts that are better handled as mappings, enumerations or reusable configurations"), they map onto 22 consolidated Prisma models. Operational instances are deliberately stored in transaction tables, not masters.

## Service Configuration Masters (5)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 1. Tax Group Master | **ServiceCategory** | Renamed; category taxonomy for the service catalogue |
| 2. Tax Master | **Service** | Renamed Service Master; code, client/internal names, authority, official URL, verification status, lifecycle status |
| 3. Tax Type Master | folded into **Service** (`code`/category) + **ServiceVersion** payloads | No separate type table was justified; type-level behaviour is carried by the versioned configuration |
| 4. Service Configuration Version | **ServiceVersion** | Versioned, immutability after publish, approval metadata, validation report |
| 5. Service Applicability Mapping | **ServiceVersion.applicability** (JSON) + wizard eligibility filter | Constitutions/states/notes; validated before publish |

## Organizational & Work Masters (5)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 6. Department Master | **Department** | Active flag, employee roster |
| 7. Employee Role Master | `User.role` enum (RBAC) + **Employee** profile | Roles: SUPER_ADMIN/ADMIN/MANAGER/EMPLOYEE/CA_REVIEWER/CLIENT |
| 8. Work Group Master | folded into **Department** + task `departmentCode` | A separate grouping table had no distinct behaviour |
| 9. Work Master (reusable task definitions) | **ServiceVersion.taskTemplates** (JSON, versioned) | Reusable per service version; application instances in ApplicationTask |
| 10. Work Assignment Rule Master | **lib/tasks.ts assignment engine** (code) | Least-workload rule with role/department/availability/maxOpenTasks checks; code-stored rule avoids unversioned config drift |

## Requirements & Documents (6)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 11. Document Category Master | **DocumentType.category** | Simple attribute; no separate table justified |
| 12. Document Master | **DocumentType** | Code/name/category/active |
| 13. Requirement Field Master | **ServiceVersion.formSchema.fields** (JSON, versioned) | Field library is versioned with the service it belongs to; shared types/validators in `lib/rules.ts` |
| 14. Requirement Option Master | field `options[]` inside the schema | Same rationale |
| 15. Requirement Rule Master | **Rule trees** inside fields/documents (`visibilityRule`, `requiredRule`, `conditionRule`) | Declarative JSON, validated (unknown refs, cycles) before publish |
| 16. Document Requirement Mapping | **ServiceVersion.documentRequirements** (JSON, versioned) | Maps documents to services with ALWAYS/CONDITIONAL/OPTIONAL + rules |

## Workflow & Status (5)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 17. Workflow Master | **WorkflowDefinition** | Code/name/active |
| 18. Workflow Stage Master | **WorkflowStage** | Sequence, responsible role, stage type, SLA, mandatory flag |
| 19. Application Status Master | `Application.status` enum + `lib/status.ts` vocabulary | Fixed, validated state machine; client-friendly labels |
| 20. Work Status Master | `ApplicationTask.status` enum | Application status and task status remain separate by design |
| 21. Priority Master | `priority` enum on tasks/applications | Three-level enum; a table would be configuration theatre |

## Finance (3)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 22. Service Pricing Master | **ServiceVersion.pricing** (JSON, effective-dated via version) | Professional fee, government fee + provenance note, tax %, discount, demo flag |
| 23. Government Fee Master | **govtFee + govtFeeNote** inside version pricing | Provenance note is mandatory (validation gate) — prevents invented statutory fees |
| 24. Payment Type Master | `Payment.method` + gateway adapter constants | Extended when a real gateway is wired |

## Compliance (3)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 25. Compliance Master | **ServiceVersion.complianceRules** (JSON, versioned) + ComplianceObligation instances | Definitions versioned; client obligations are operational records |
| 26. Compliance Frequency Master | `frequency` enum (MONTHLY/QUARTERLY/ANNUAL/EVENT) + `dueRule` note | Enum justified |
| 27. Government Authority Master | `Service.authority` + **SourceReference.authority** + FilingRecord.authority | Central registry table would duplicate the Source Registry |

## Communication & Support (3 → counted within the 28)

| Legacy master | Implemented as | Notes |
|---|---|---|
| 28. Notification Template Master | Notification creation helpers (`lib/audit.ts`) with validated variables | Templates as code; delivery records in **Notification** |
| — Communication Channel Master | constants (`type` on Notification) | In-app now; email/SMS adapters pending |
| — Support Category Master | ticket `category` enum | Enum justified |

## Added coherence entities (from §8.8)

| Capability | Implemented as |
|---|---|
| Official Source Registry | **SourceReference** table (authority, title, URL, published/verified dates, verification status) |
| Legal Rule Version | **ServiceVersion** (immutable, effectiveFrom, approval metadata) |
| Configuration Approval | **ReviewDecision** (scope CONFIG/TASK) + approval fields on ServiceVersion |
| Workflow Transition Rules | Stage-based advancement logic in `lib/tasks.ts` + unique task constraints + dependency arrays |
| Task Dependency Mapping | `ApplicationTask.dependsOnCodes` (+ template-level `dependsOn`) |
| Audit Log | **AuditLog** table + admin inspection UI |
| Configuration Change History | ServiceVersion rows + changeNotes + ApplicationEvent/StatusHistory |

**Net result:** 28 legacy masters → 12 concrete master/config tables + 3 enums + versioned JSON payloads + 1 rule engine, eliminating 1:1 table-per-concept redundancy while keeping every business capability.
