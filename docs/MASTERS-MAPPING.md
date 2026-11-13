# CA Practice & Tax Compliance Management Platform
## Clean Master Reference Guide — Roles & System Connections

**Version:** 3.0 (Clean & Simple Edition) &middot; **Date:** November 2026

---

## 1. Quick Summary: Which Role Connects to Which Master?

Har user role ka system me alag kaam hai, aur har role specific masters ke sath interact karta hai:

```
┌───────────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ USER ROLE                 │ CONNECTED MASTERS                                                      │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 1. CLIENT                 │ • Client & Business Profile Master                                     │
│                           │ • Service Master & Service Category (Browse & Select)                  │
│                           │ • Dynamic Form Schema & Document Checklist (Intake Wizard)             │
│                           │ • Service Pricing & Quotations (Fee Payment)                           │
│                           │ • Client Tax Payment Master (Challan Upload)                           │
│                           │ • Consent Records (DPDP Authorization)                                 │
│                           │ • Reminder Policies (Receives deadline alerts)                         │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 2. FIRM ADMIN / MANAGER   │ • User & RBAC Master (Manages Staff & Roles)                           │
│                           │ • Department Master (Creates Firm Divisions)                           │
│                           │ • Employee Profile & Availability (Monitors Capacity & Reassigns)      │
│                           │ • Workflow & Stages Master (Defines Lifecycle Stages)                  │
│                           │ • Service Pricing & Fee Masters (Sets Quotation Pricing)               │
│                           │ • Reminder & Escalation Policies (Configures Alert Intervals)          │
│                           │ • Audit Log (Inspects full firm activity)                              │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 3. EMPLOYEE / ACCOUNTANT  │ • Department & Employee Master (Assigned tasks)                        │
│                           │ • Task Templates & Workflow Stages (Executes daily work)               │
│                           │ • Document Type & Missing-Document Loop (Verifies client documents)    │
│                           │ • Client Tax Payment Master (Verifies BSR & Challan receipts)          │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 4. CA / REVIEWER          │ • Service Master & Service Version Hub (Approves legal drafts)         │
│                           │ • Official Source Registry (Verifies government gazette sources)       │
│                           │ • Workflow Review Gates (Professional sign-off on casework)            │
│                           │ • Filing Record (Enters official Government ARN / Acknowledgement)     │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ 5. KNOWLEDGE / RULE MGR   │ • Service Version Master (Drafts forms, checklists, rules)             │
│                           │ • Statutory Due Date Master (Maintains tax return deadlines)           │
│                           │ • Official Source Registry (Adds government portals & circulars)       │
│                           │ • Regulatory Updates (Tracks changes in GST/ITR rules)                 │
└───────────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Clean Masters Directory: Where Each Master Connects

Ye table hamare pure system ke **saare 21 Masters** ki simple list hai: unka simple matlab, unse juda role, aur system me unka exact use-case:

| # | Master Name | Simple Purpose | Connected Role | Where Connected in the System |
|---|---|---|---|---|
| **1** | **User & RBAC Master** | System login, passwords aur permissions (7 roles) | All 5 Roles | Login screen, Header user pill, API permission guards (`requireRole`) |
| **2** | **Department Master** | Firm ki operational teams (GST, Direct Tax, ROC, Support) | Admin & Manager | Team Tasks view (`TasksView`), Workload Reports (`ReportsView`) |
| **3** | **Employee Profile Master** | Staff ki capacity (max 10 tasks) aur leave status (Available / On Leave) | Admin & Employee | Auto-assignment engine (`lib/tasks.ts`), Admin Reassign modal, Workload report |
| **4** | **Client & Business Master** | Taxpayer profile, business constitution, PAN, GSTIN, annual turnover | Client & Admin | Client Portal, Business profile (`BusinessesView`), Eligibility check |
| **5** | **Service Category Master** | Services ko group karna (Direct Tax, GST, Company Registration) | Client & Admin | Client Browse Services tabs (`ServicesView`), Admin service catalogue |
| **6** | **Service Master** | Base service (code, client name, official government authority) | Admin & CA | Service selection wizard, Service setup (`AdminServicesView`), Applications |
| **7** | **Service Version Master (Hub)** | Central legal rule hub (Forms, Checklist, Tasks, Pricing, Rules) | Knowledge Mgr & CA | Intake wizard, Frozen Case Snapshot (`configSnapshot`), CA approval gate |
| **8** | **Official Source Registry** | Government portals & gazette list (incometax.gov.in, cbic.gov.in) | Knowledge Mgr & CA | Statutory due date citations, Regulatory updates, Gazette evidence links |
| **9** | **Document Type Master** | Standard document vocabulary (PAN, Aadhaar, Bank Statement, Form 16) | Admin | Document checklists, Document verification modal in staff tasks |
| **10** | **Document Checklist Mapping** | Kaunsa document zaroori hai (Always / Conditional / Optional) | Knowledge Mgr & Client | Client upload page, Staff missing-document loop (`TasksView`) |
| **11** | **Dynamic Form Schema** | Intake questions & fields (PAN, GSTIN, Turnover, Yes/No questions) | Knowledge Mgr & Client | Dynamic client wizard (`DynamicForm.tsx`), Server-side answer validation |
| **12** | **Declarative Rule Engine** | Field hide/show rules aur document condition trees | System (Shared) | React form wizard UI, Server submission validation (`lib/rules.ts`) |
| **13** | **Workflow & Stages Master** | Case ke sequential steps (Collection &rarr; Verification &rarr; Review &rarr; Filing) | Admin & Manager | Application stage progress bar, Stage advancement gate in tasks |
| **14** | **Task Templates Master** | Har stage me auto-generate hone wale tasks aur prerequisite dependencies | Knowledge Mgr & Employee | Staff "My Tasks" screen, Team Task queue, Prerequisite unlocking |
| **15** | **Statutory Due Date Master** | Government return deadlines (GSTR-3B 20th, ITR 31st July) with Gazette cite | CA & Knowledge Mgr | Compliance Calendar (`ComplianceView`), Deadline reminder sweeps |
| **16** | **Post-Service Compliance Rules** | Service khatam hone par recurring obligations generate karna (Monthly GST) | Knowledge Mgr & Client | Auto-populates recurring obligations on client business profile |
| **17** | **Service Pricing & Fees** | Professional fee + Government fee (with reason) + 18% GST breakdown | Admin & Client | Client Quotation modal, Online payment checkout, Idempotent webhook |
| **18** | **Client Tax Payment Master** | Client ka statutory tax challan tracking (Advance Tax, GST PMT-06 challan) | Employee & Client | Tax payment tracker; **unpaid challan blocks final filing** |
| **19** | **Reminder Policy Master** | Automated alert schedule (Deadline se 15, 7, 2 din pehle ke alerts) | Knowledge Mgr & Admin | In-app notification center (Bell icon), Manager escalation alerts |
| **20** | **Regulatory Update Pipeline** | New tax circulars intake, active cases par impact check, and version update | Knowledge Mgr & CA | Regulatory Updates view (`RegulatoryView`), CA drafting trigger |
| **21** | **Consent Records (DPDP Act)** | Client digital permission before fetching AIS/26AS tax statements | Client & Staff | Client Consents screen (`ConsentsView`), Third-party API gate |
| **22** | **Audit Log Master** | Kisne, kab, kya change kiya (Immutable history) | Admin | Audit Log viewer (`AuditView`), Historical tracking of all actions |

---

## 3. How Masters Connect to a Real Case (Simple 5-Step Lifecycle)

Jab ek client portal me service request karta hai, toh masters is sequence me execute hote hain:

```
[1. INTAKE]
Client Business Profile + Dynamic Form Schema + Document Checklist
   │
   ▼
[2. SNAPSHOT FREEZE]
Application.configSnapshot copies the active Service Version rules permanently.
(Future master edits will never disturb this active case!)
   │
   ▼
[3. EXECUTION]
Workflow Stages + Task Templates ──▶ Assigned to Employee via Least-Workload Engine.
Employee verifies documents via Document Type Master. Missing docs trigger client alert.
   │
   ▼
[4. PAYMENT & REVIEW]
Quotation Fee (Firm payment) + Tax Payment Challan (Client tax liability verified).
CA Reviewer signs off in Review Gates.
   │
   ▼
[5. FILING & RETENTION]
Filing Record stores official Government Acknowledgement Number (ARN).
Post-Service Compliance Rules auto-generate next month's recurring return calendar!
```
