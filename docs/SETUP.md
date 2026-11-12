# Setup & Operations Guide

This guide covers the packaged project (runs anywhere with Node.js 20.9+). For a one-paragraph quick start, see the root `README.md`.

## 1. Local development

```bash
npm install            # also runs `prisma generate` via postinstall
npm run dev            # http://localhost:3000
```

The shipped `.env` uses a portable relative path:

```bash
DATABASE_URL=file:../db/custom.db   # relative to prisma/schema.prisma
```

`db/custom.db` ships **pre-seeded**, so the first run needs no migration or seeding. To rebuild the database from scratch:

```bash
rm db/custom.db
npm run db:push      # create schema
npm run db:seed      # masters, users, GST Registration + ITR reference configurations
```

Optional environment variables (see `.env`):

- `PAYMENT_WEBHOOK_SECRET` — set in production; enables HMAC webhook verification and auto-disables the demo gateway
- `FILE_ENCRYPTION_KEY` — 64-char hex or passphrase; if unset, the shipped `db/.filekey` (mode 0600) is used, which keeps the shipped encrypted uploads readable
- `REMINDER_SWEEP_DISABLED=1` — disables the background reminder sweep (useful in tests)
- `ACCEPTANCE_BASE_URL` — target for the acceptance suite (default `http://localhost:3000`)

## 2. Demo accounts (password `Demo@1234`)

| Email | Role |
|---|---|
| admin@demo.in | Super Administrator |
| manager@demo.in | Department Manager (GST) |
| employee1@demo.in / employee2@demo.in | Executives |
| ca@demo.in | CA / Compliance Reviewer |
| knowledge@demo.in | Knowledge / Rule Manager (rule masters only: statutory due dates, reminder policies, regulatory updates) |
| client@demo.in | Client (Sharma Traders, proprietorship) |
| client2@demo.in | Client (TechNova Solutions Pvt Ltd) |

## 3. Golden path to try

1. Sign in as **client@demo.in** → Services → *GST Registration* → Apply → Sharma Traders
2. Watch conditional questions: choose *Rented* premises (landlord fields appear), switch constitution to *Private Limited* (CIN/authorised signatory appear); notice the statutory period step on period-enabled services (R-02) and ineligibility reasons shown per business profile (R-13)
3. Continue → document checklist reflects the rented-premises rules → upload PDF/JPG/PNG files (uploads are AES-256-GCM sealed at rest; executables/EICAR signatures are rejected) → review → submit (reference number issued)
4. Sign in as **employee1@demo.in** → My Tasks → work the chain (completeness → document verification → review docs in application → preparation)
5. Sign in as **ca@demo.in** → Review Queue → approve the professional review (notes required)
6. Back as employee/admin: record the client's own tax liability on the case (R-06), government submission requires evidence + approved documents → record ARN → cancel query task if none → CA final QC → delivery → application completes and period-scoped compliance obligations appear
7. As client: accept quotation → Pay now (demo gateway webhook; try replaying — it is idempotent) → Compliance Calendar shows upcoming deadlines with readiness status; deadline reminders fire on schedule (R-03)
8. Sign in as **admin@demo.in** → Service Configuration → GST_REG → tabs (Basics / Configuration / Versions & lifecycle / Preview) → create a new version → validation → send for professional review → CA approves → publish; Masters → Statutory due dates / Reminder policies (R-04, R-03)
9. Sign in as **knowledge@demo.in** → Rule Masters only (due dates + reminder policies); try editing pricing via API — the server refuses (R-01)
10. Sign in as **admin@demo.in** → Team Workload (R-09) and dashboard deadline readiness (R-08); Regulatory Updates intake → verify → impact snapshot → apply (R-05/R-12)

## 4. Test suite

```bash
npm run dev                        # terminal 1
bash scripts/run-acceptance.sh     # terminal 2 (works with bun too; falls back to npx tsx)
# or: npm run test:acceptance      # without the reseed wrapper
```

`scripts/acceptance-tests.ts` exercises the §26 acceptance scenarios plus the gap-closure suites against a running server (134 checks, all passing):

T1 conditional documents · T2 constitution switch · T3 circular rule rejection · T4 version snapshot preservation · T5 duplicate-task prevention · T6 assignment fallback queue + notifications · T7 record-level authorization (client/employee cross-access, staff-role misuse) · T8 document rejection with reason + controlled re-upload · T9 webhook idempotency + unknown-payment rejection · T10 income-tax framework note · T11 Udyam zero government fee · T12 filing evidence gates (submission blocked without evidence/docs; compliance filing requires acknowledgement) · T13 dependency unlocking (implicit in the chain) · T15 publish/approval order enforcement — plus the full happy path from submission to completion and compliance generation, and gap-closure suites: R-02 period linkage & individual taxpayers · R-06 client tax payment · R-04 statutory due-date master · R-03 reminder policies & sweep · R-11 consent records · R-05/R-12 regulatory update intake & impact · R-09 workload report · R-08 deadline readiness · R-13 attribute-based eligibility · R-01 knowledge/rule-manager separation of duties · R-10 upload screening, AES-256-GCM sealing and download authorization.

## 5. Production deployment notes

- **Database:** switch `datasource db.provider` to `"postgresql"` in `prisma/schema.prisma`, set `DATABASE_URL`, run `prisma migrate dev` to generate SQL migrations (SQLite `db push` is used only for local dev). No model changes are required.
- **Payments:** set `PAYMENT_WEBHOOK_SECRET` and configure the licensed gateway to POST `{paymentId, gatewayRef, status}` with the `x-payment-signature` HMAC header. Demo mode auto-disables once the secret is present.
- **File encryption:** set `FILE_ENCRYPTION_KEY` explicitly in production (64-char hex) and back it up separately from the database — losing it makes stored documents unrecoverable. The auto-provisioned `db/.filekey` is for local development only.
- **Reminder scheduling:** the sweep runs from the app's instrumentation hook and `POST /api/reminders/run`; in production call the endpoint from a system cron (e.g. every 30–60 min) or deploy a worker so reminders fire even when the app is idle.
- **File storage:** `db/uploads/` is private by design; for multi-instance deployments move storage to S3-compatible object storage and stream via the same authorized `/api/documents/[id]/file` endpoint.
- **Backups:** schedule `sqlite3 db/custom.db ".backup ..."` (or `pg_dump`) plus the uploads directory; test restore monthly. The audit log must be included in backups.
- **Sessions:** sessions are DB rows; clearing the Session table revokes all sessions (useful for incident response).
- **Monitoring:** structured logs go to stdout; wire error monitoring before production.
