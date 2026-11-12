# CA Practice & Tax Compliance Management Platform

A full-stack practice, application-workflow and tax-compliance management system for a CA (Chartered Accountancy) practice — built with **Next.js 16 (App Router) + TypeScript + Prisma + SQLite**, Tailwind CSS 4 and shadcn/ui.

It covers the complete service lifecycle: service catalogue → quotation & consent → client application with conditional document checklists → task workflow (completeness → verification → preparation → review) → CA professional review → government submission with evidence → delivery → period-scoped compliance obligations, statutory due dates, reminder engine, client tax-payment tracking, encrypted document vault, regulatory-update intake, role-based dashboards and an audit trail.

## Quick start (VS Code)

### Prerequisites

- **Node.js 20.9 or newer** (Node 22 LTS recommended) — check with `node -v`
- **npm 10+** (ships with Node) — check with `npm -v`
- VS Code with the recommended extensions (prompted automatically; see `.vscode/extensions.json`)

### Run it

```bash
# 1. Open the project folder in VS Code, then open the integrated terminal (Ctrl+`)

# 2. Install dependencies (this also auto-generates the Prisma client)
npm install

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000 in your browser
```

That's it — the repository ships with a **ready-seeded SQLite database** (`db/custom.db`), so there is no migration or seeding step for the first run. The `.env` file is already configured with a portable relative path (`DATABASE_URL=file:../db/custom.db`).

### Demo accounts (password for all: `Demo@1234`)

| Email | Role |
|---|---|
| `admin@demo.in` | Super Administrator |
| `manager@demo.in` | Department Manager (GST) |
| `employee1@demo.in` / `employee2@demo.in` | Executives |
| `ca@demo.in` | CA / Compliance Reviewer |
| `knowledge@demo.in` | Knowledge / Rule Manager (statutory due dates, reminder policies, regulatory updates only) |
| `client@demo.in` | Client (Sharma Traders, proprietorship) |
| `client2@demo.in` | Client (TechNova Solutions Pvt Ltd) |

A suggested demo walkthrough is in [`docs/SETUP.md`](docs/SETUP.md) ("Golden path to try").

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm start` | Run the production build on port 3000 |
| `npm run lint` | ESLint |
| `npm run db:push` | Push `prisma/schema.prisma` to the SQLite database |
| `npm run db:generate` | (Re)generate the Prisma client |
| `npm run db:seed` | Reseed the demo database (wipes all data, restores demo content) |
| `npm run test:acceptance` | Run the 134-check acceptance suite (dev server must be running) |
| `bash scripts/run-acceptance.sh` | One-command acceptance run: reseed → 134 checks → restore clean demo data |

> The acceptance suite targets `http://localhost:3000` by default; set `ACCEPTANCE_BASE_URL` to point it elsewhere.

## Project layout

```
├─ prisma/schema.prisma      # Data model (SQLite-portable, PostgreSQL-ready design)
├─ db/
│  ├─ custom.db              # Seeded SQLite database (demo data)
│  ├─ .filekey               # Auto-provisioned key for AES-256-GCM document sealing
│  └─ uploads/               # Encrypted-at-rest client documents (private)
├─ src/
│  ├─ app/                   # Next.js App Router pages + /api route handlers
│  ├─ components/            # shadcn/ui + application components
│  ├─ lib/                   # db client, auth, filestore (AES-256-GCM), reminder engine…
│  └─ instrumentation.ts     # Reminder sweep bootstrap
├─ scripts/                  # seed.ts, acceptance-tests.ts, run-acceptance.sh
├─ docs/                     # ARCHITECTURE.md, SETUP.md, MASTERS-MAPPING.md, CA-REVIEW-CHECKLIST.md
│  └─ reports/               # Gap-analysis & gap-closure reports (PDF/DOCX)
└─ .env                      # Pre-configured for local development
```

## Features at a glance

- **Auth & roles** — session-cookie auth with scrypt password hashing; roles: Super Admin, Manager, Employee, CA Reviewer, Knowledge Manager, Client, with record-level authorization (clients see only their own data)
- **Service catalogue & versioning** — services with draft/version lifecycle, professional review and publish order enforcement; GST Registration and ITR ship as reference configurations
- **Conditional intake** — attribute-driven eligibility, conditional questions (rented premises, constitution type) and document checklists that adapt live
- **Task workflow** — assignment, fallback queue, notifications, duplicate-task prevention, dependency unlocking
- **CA review & QC** — approval gates with mandatory notes, evidence-gated government submission, ARN recording
- **Compliance engine** — period-scoped obligations, statutory due-date master, deadline readiness, reminder policies + reminder sweep (instrumentation hook + `POST /api/reminders/run`)
- **Client tax-payment tracking** — record client tax liabilities against cases and periods
- **Payments** — demo gateway with idempotent HMAC-verified webhooks (set `PAYMENT_WEBHOOK_SECRET` for production)
- **Documents** — upload screening (EICAR/executable rejection), AES-256-GCM sealing at rest, authorized decrypt-on-read downloads
- **Regulatory updates** — intake → verify → impact snapshot → apply, with knowledge-manager separation of duties
- **Dashboards & reports** — role dashboards, team workload, audit trail, quotation/report exports (docx)

## Troubleshooting

- **`P1001` / database errors on first run** — make sure the `db/` folder is intact next to `prisma/`; then run `npm run db:generate && npm run db:push` (note: `db:push` against the shipped demo db is not needed and would only re-sync the schema).
- **Port 3000 busy** — run `npm run dev -- -p 3001` (or stop the other process).
- **After pulling schema changes** — `npm run db:generate` (regenerates `node_modules/.prisma/client`).
- **Fresh empty database** — delete `db/custom.db`, then `npm run db:push && npm run db:seed`.
- **Windows** — everything runs fine in PowerShell/VS Code terminal; `scripts/run-acceptance.sh` needs Git Bash or WSL.

## Production notes

SQLite is used for local development. For production: switch the Prisma datasource to PostgreSQL, set real secrets (`PAYMENT_WEBHOOK_SECRET`, `FILE_ENCRYPTION_KEY`), put uploads on object storage, and drive the reminder sweep from cron — see [`docs/SETUP.md`](docs/SETUP.md).
