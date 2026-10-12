# CPGS Results Repository (CRR)

The official digital repository of final postgraduate results for the College of Postgraduate Studies, Nnamdi Azikiwe University, Awka. It implements `doc/CPGS RESULTS DIGITALIZATION PORTAL - IMPLEMENTATION GUIDE.md` (response to memo NAU/CPGS/004).

| Module | What it does |
| --- | --- |
| Legacy digitization | Boxes (batches) with QR labels, indexer/QA assignment, scan upload with SHA-256, side-by-side indexing, maker-checker QA, Records lock |
| Online submission | Department uploads the CRR Excel template (validated per cell) plus signed scan; HOD → Faculty PG → Records → Provost → Senate date; returns keep history; resubmission diff |
| Search, documents, verification | Scoped search, record page with scan and history, statement/transcript PDF with QR, public `/verify`, revocation, amendments with versioning |
| Governance | 10 roles with department/faculty scoping, TOTP MFA, account lockout, hash-chained append-only audit log, nightly chain check, reminders, backup integrity job |

Stack: Next.js 16 (App Router, Cache Components, Server Actions), TypeScript, Tailwind CSS 4, MongoDB/Mongoose, Cloudinary (authenticated assets), Brevo, Upstash rate limiting, pdf-lib, SheetJS.

## Run locally

```bash
npm install
cp .env.example .env.local      # then fill the four secrets: openssl rand -base64 32
npm run db:local                # terminal 1: local MongoDB replica set, data in ./.data
npm run seed:demo               # one-off: structure, admin, demo users and sample results
npm run dev                     # terminal 2: http://localhost:3000
```

Without Cloudinary, Brevo or Upstash keys the app still runs: scans are stored in `./storage`, emails are printed to the console and rate limiting is in memory. Set `REQUIRE_MFA=false` locally to skip authenticator enrolment.

Demo accounts (password `Demo-Password-2026`): `provost@`, `records@`, `taskforce@`, `indexer@`, `qa@`, `pgc.csc@`, `hod.csc@`, `subdean.phs@`, `audit@`, `admin@demo.unizik.edu.ng`. Demo verification code: `DEMO-2345`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm run db:local` | Local MongoDB (single-node replica set so transactions work) |
| `npm run seed` | Faculties, departments, programmes, sessions and the first SUPER_ADMIN (prints a temporary password) |
| `npm run seed:demo` | Adds demo users and sample data (refuses to run in production) |

## Where things live

```text
src/app/(auth)        login, password setup, MFA enrolment
src/app/(portal)      dashboard, records, sheets/[id] (the shared sheet workspace), digitization,
                      submissions, approvals, amendments, transcripts, admin, audit, account
src/app/verify        public verification
src/app/api           uploads, files (signed URLs), templates, export, documents, verify, cron, health
src/lib               auth (data access layer), rbac, workflow, audit (hash chain), storage, sheets,
                      template (xlsx), pdf, verify, search, mail, ratelimit
src/models            Mongoose models
src/proxy.ts          optimistic session gate (Next 16 replacement for middleware)
scripts/              local-db and seed
```

Every server action and route handler re-checks the session, role and department scope through `src/lib/auth.ts`; hiding a button is never the only guard.

## Deploy (Vercel + Atlas)

1. Create an Atlas M10+ cluster (continuous backup), a database user without delete rights on `auditlogs`, and set `MONGODB_URI`.
2. Create a Cloudinary account, enable backups and strict transformations, set the three `CLOUDINARY_*` variables.
3. Set every variable from `.env.example` in Vercel for Production and Preview (separate database and Cloudinary folder for Preview). Set `REQUIRE_MFA=true` and `APP_URL` to the public domain.
4. Deploy, then run `npm run seed` once against production and sign in as the SUPER_ADMIN to change the password and enrol MFA.
5. `vercel.json` schedules `verify-audit` (01:00 WAT), `backup-files` (02:00 WAT) and `reminders` (08:00 WAT). Vercel sends `CRON_SECRET` automatically.
6. Add an uptime check on `/api/health`.

## Open items for the Records Unit

- **Grading bands are provisional.** `src/lib/grading.ts` holds the default class-of-degree bands; confirm the official CPGS table per session. Mismatches are shown as warnings, never auto-corrected.
- **Second backup store.** `backup-files` verifies every file's checksum nightly but only copies when `BACKUP_DIR` points at the university server.
- **Payments (Remita/Paystack)** for graduand transcript requests are not implemented yet; staff issue documents from the record page.
- Number of boxes and sessions, scanner availability, and the breach procedure sign-off (see the guide).
