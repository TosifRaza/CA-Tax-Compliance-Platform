# Architecture — Dynamic Tax & Business Compliance Management System (India)

**Version:** 1.1 · **Built:** 11 Nov 2026 · **Gap-closure update:** 12 Nov 2026 · **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui + Prisma ORM

## 1. What is implemented (working software, not mockups)

| Area | Status | Notes |
|---|---|---|
| Authentication & sessions | Implemented | scrypt password hashing, DB-backed sessions, httpOnly cookie, login rate limiting |
| Roles & authorization | Implemented | 7 roles (SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, CA_REVIEWER, KNOWLEDGE_MANAGER, CLIENT); enforced server-side per API route + record-level application access. R-01: the Knowledge Manager maintains rule masters (statutory due dates, reminder policies, regulatory updates) and rule content of configuration drafts, but not pricing, workflows, organizational masters, publishing or professional approval |
| Master management | Implemented | Departments, Employees, Document Types, Service Categories, Workflows — CRUD with duplicate prevention, deactivate-not-delete, audit |
| Service configuration + versioning | Implemented | Service → immutable versioned configurations; lifecycle DRAFT → VALIDATION → TEST → PROFESSIONAL_REVIEW → APPROVED → PUBLISHED → RETIRED; publish requires CA approval + zero validation errors |
| Official Source Registry | Implemented | SourceReference registry; versions must reference registry entries; VERIFICATION_REQUIRED status supported |
| Configuration validation gate | Implemented | Unknown field refs, circular rules, duplicate codes, workflow/task mismatches, missing fee provenance, missing sources |
| Dynamic form engine | Implemented | Metadata-driven renderer; 19 field types incl. PAN/GSTIN/CIN/PIN validators; conditional visibility/required rules; client+server evaluation from one shared rule engine; draft autosave & resume |
| Rule engine | Implemented | Declarative condition trees (eq/neq/gt/lt/in/contains/empty/notEmpty with AND/OR nesting); cycle detection; no arbitrary code execution |
| Case period linkage (R-02) | Implemented | Application carries periodType/periodLabel/periodStart/periodEnd (assessment year / tax period); validated server-side; wizard step; obligations and filings inherit the case period |
| Statutory due-date master (R-04) | Implemented | StatutoryDueDate rows per service + obligation + period with source reference, effective period, extension flag and verification trail; obligation generation prefers master dates over demo offsets; verification requires a source |
| Reminder & escalation engine (R-03) | Implemented | ReminderPolicy master (per-service or firm default; early intervals, repeat cadence, escalation role) + scheduled sweep (cron via instrumentation + POST /api/reminders/run) producing deduplicated EARLY / DUE / OVERDUE / ESCALATION / INFO_REQUEST notifications logged in ReminderLog |
| Client tax payment tracking (R-06) | Implemented | TaxPayment records per case (liability type, amount, due date, status, challan reference required to mark PAID) — distinct from the firm's fee quotation; feeds dashboards and readiness |
| Regulatory update intake (R-05/R-12) | Implemented | Manual updates against registered sources, expert verification gate, computed impact snapshot over frozen config snapshots, apply workflow |
| Consent records (R-11) | Implemented | ConsentRecord with scope, purpose, grant/revoke, expiry, evidence; mandatory foundation before any portal retrieval/integration work |
| Attribute-based eligibility (R-13) | Implemented | Applicability config supports requires (pan/gstin/tan/cin YES/NO/ANY) and min/maxTurnover over client-declared Business.annualTurnover; evaluated server-side at draft creation with human-readable reasons mirrored in the wizard |
| Document management | Implemented | Requirement-driven checklist (ALWAYS/CONDITIONAL/OPTIONAL), private file storage, type/size validation, content screening, approve/reject with mandatory reason, versioned replacement, authorized download |
| Encryption at rest (R-10) | Implemented | AES-256-GCM sealing of every stored document (ENC1: format), key via FILE_ENCRYPTION_KEY or auto-provisioned db/.filekey (0600); transparent legacy-plaintext read-back; upload content screen (EICAR/executable/magic-byte checks) |
| Application lifecycle | Implemented | Draft → submission with frozen configuration snapshot → status history → events → completion; server-side answer validation |
| Workflow & task engine | Implemented | Task templates → application-specific tasks (unique per app+template), dependency unlocking, SLA targets, evidence requirements, CA approval gates, stage advancement, completion |
| Assignment engine | Implemented | Role/department/availability/workload-based least-workload auto-assignment; authorized unassigned queue with recorded reason + manager notification; manual reassignment |
| CA professional review | Implemented | Application review decisions (approve / request changes with notes) + configuration approval with recorded reviewer, timestamp |
| Quotations & payments | Implemented | Quotation from versioned pricing (professional fee + government fee + tax split), client acceptance, simulated hosted checkout; **idempotent webhook** is the only path to SUCCESS; HMAC signature mode when `PAYMENT_WEBHOOK_SECRET` is set |
| Compliance calendar | Implemented | Obligations generated from approved configuration on application completion (period-scoped, due-date-master aware); manual obligations; filing requires acknowledgement number + evidence note |
| Government filing assistance | Implemented | FilingRecord with authority, portal, method, acknowledgement, evidence; no internal status is ever presented as official government status |
| Notifications | Implemented | In-app notification centre with unread counts; reminder engine adds scheduled deadline notifications (email/SMS adapters not wired — see limitations) |
| Support tickets | Implemented | Ticket + threaded messages, staff status control |
| Dashboards | Implemented | Role-specific, all numbers derived from stored data; R-08: combined per-deadline readiness (documents / fee / tax / work → READY | AT_RISK | BLOCKED); R-09: admin workload report with per-employee utilization and reassignment history |
| Audit log | Implemented | All consequential actions recorded (actor, action, entity, details); admin inspection UI |
| Acceptance tests | Implemented | `scripts/acceptance-tests.ts` — 134 checks covering §26 scenarios T1–T15 plus gap-closure suites R-01/R-02/R-03/R-04/R-05/R-06/R-08/R-09/R-10/R-11/R-13/R-14; all passing |

## 2. Layered structure

```
src/
  lib/                      # server-side domain layer
    db.ts                   # Prisma client singleton
    auth.ts                 # passwords, sessions, RBAC guards
    rules.ts                # SHARED rule engine + schema validation (client & server import this)
    validation.ts           # service-configuration validation gate
    applications.ts         # application lifecycle service
    tasks.ts                # task generation, assignment, workflow advancement
    period.ts               # statutory period resolution: assessment years, tax months, quarters (R-02)
    applicability.ts        # shared attribute-eligibility evaluator (R-13; client & server)
    reminders.ts            # reminder & escalation sweep over policies (R-03)
    filestore.ts            # AES-256-GCM sealed document storage + upload screening (R-10)
    audit.ts                # audit trail + notifications + reference numbers
    types.ts, status.ts     # shared domain types & status vocabulary
    api-utils.ts            # JSON error envelope, pagination
  app/api/                  # REST API (route handlers, all validated + authorized)
  components/app/           # SPA shell + views + DynamicForm renderer
  lib/client/               # API client + zustand store (hash-based routing)
prisma/schema.prisma        # 34 models (SQLite-portable, PostgreSQL-ready design)
scripts/seed.ts             # demo masters + GST Registration & ITR reference configurations
scripts/acceptance-tests.ts # §26 scenario tests against running server
```

**Single visible route:** the UI is a single-page application at `/` (hash-routed views) as required by the sandbox; all business logic lives behind `/api/*` REST endpoints.

## 3. Key design decisions

1. **One rule engine, two runtimes.** `lib/rules.ts` is imported by the browser (form rendering, live errors) and by the server (draft validation, checklist computation, submission gating). Deterministic, tree-structured, JSON-serializable — administrators cannot inject executable code through rules.
2. **Frozen configuration snapshots.** On submission, the application copies the version's form schema, document requirements, task templates, workflow stages, pricing and compliance rules into `configSnapshot`. Published versions are immutable; later master changes never alter in-flight applications (Test T4).
3. **Masters vs transactions.** Configuration lives in masters/versions; quotations, payments, tasks, obligations and filings are operational records referencing them.
4. **Honest filing semantics.** A reminder, internal task or "application completed" status is never displayed as an official government decision. `FilingRecord` rows carry the acknowledgement number and evidence note; the UI labels them explicitly.
5. **Deactivate, don't delete.** Masters referenced by operational records are deactivated; unique codes prevent duplicates.
6. **Amounts** are whole INR integers; fee components always carry provenance notes; government fee of 0 is rendered as "Nil", never invented.

## 4. Database (34 models)

Identity/Organization: User, Session, Department, Employee
Clients: Client, Business (incl. annualTurnover for R-13)
Service config: ServiceCategory, Service, ServiceVersion, SourceReference
Workflow: WorkflowDefinition, WorkflowStage
Documents: DocumentType, UploadedDocument
Applications: Application (periodType/periodLabel/periodStart/periodEnd), ApplicationEvent, ApplicationStatusHistory
Work: ApplicationTask, TaskHistory, ReviewDecision
Finance: Quotation, Payment, TaxPayment (client's own liability, R-06)
Compliance: ComplianceObligation, FilingRecord, StatutoryDueDate (verified due-date master, R-04)
Reminders: ReminderPolicy, ReminderLog (R-03)
Regulatory: RegulatoryUpdate (R-05/R-12), ConsentRecord (R-11)
Communication: Notification, SupportTicket, SupportMessage
System: AuditLog

Full field-level documentation: `prisma/schema.prisma` (commented). The schema uses SQLite (sandbox constraint) with portable types; switching `datasource db.provider` to `"postgresql"` requires no model changes.

## 5. Security posture (implemented)

- scrypt (N=16384) password hashing with per-user salt; constant-time comparison
- DB-backed sessions, httpOnly SameSite=Lax cookie, 7-day expiry, suspension check on every request
- Role checks in every API route (`requireRole`) + record-level access (`loadApplicationFor`)
- In-memory login rate limiting (30/5min per IP) with 429 responses
- Upload validation: MIME whitelist (PDF/JPG/PNG), per-requirement size/count limits, content screening (EICAR signature, executable magic bytes, shebang, MIME/content mismatch), private storage outside public/, authorized streaming with `Cache-Control: no-store`
- **Encryption at rest:** every document is sealed with AES-256-GCM before touching the disk (`ENC1:` framing: IV + auth tag + ciphertext); key from `FILE_ENCRYPTION_KEY` or auto-provisioned `db/.filekey` (mode 0600); legacy plaintext files remain readable through a transparent fallback
- Webhook signature verification (HMAC-SHA256) enabled by setting `PAYMENT_WEBHOOK_SECRET`; demo mode only accepts explicit demo events
- Input validation (Zod-style manual validators + pattern library); Prisma parameterized queries
- Audit logging of consequential actions; sensitive demo data only (no real PAN/Aadhaar in fixtures)

## 6. Known limitations / externally blocked (honest status)

- **Email/SMS/WhatsApp delivery:** not wired. Notification records (including scheduled reminders) are created in-app — the in-app centre is the source of record; an SMTP/provider adapter is pending business credentials. No fake "email sent" states are shown.
- **Real payment gateway:** the checkout/webhook pair models the hosted-checkout contract (including idempotency and signature verification) but no gateway credentials exist in this environment. Integration requires a licensed provider.
- **Government portal APIs:** none assumed. GST/MCA/TRACES etc. have no documented public filing APIs usable here; the system therefore implements the assisted-filing workflow (manual submission + evidence + acknowledgement recording). CAPTCHA/OTP/portal credentials are never collected.
- **Upload malware screening is a first-pass screen** (EICAR, executable magic bytes, MIME/content mismatch), not a full antivirus engine; ClamAV or equivalent requires an engine not available in the sandbox. The UI copy says so honestly.
- **MFA for privileged users:** roadmap item (schema ready for TOTP addition); not implemented — stated rather than faked.
- **Reminder scheduling cadence:** the reminder sweep runs from the Next.js instrumentation hook and via `POST /api/reminders/run`; a dedicated cron/worker deployment is recommended for production (Redis/BullMQ not needed at current scale).
- **CA verification of legal configurations:** the system enforces the *process* (validation + professional approval + publication gates) but no qualified professional has verified the seeded GST Registration / ITR configurations. Everything remains marked DEMONSTRATION / VERIFICATION_REQUIRED, including seeded due-date master rows and eligibility thresholds.
