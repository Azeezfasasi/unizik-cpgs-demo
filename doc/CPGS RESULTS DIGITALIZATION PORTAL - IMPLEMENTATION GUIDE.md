# CPGS Results Digitalization Portal — Implementation Guide

## Overview

The portal turns every CPGS final result, old and new, into a searchable, tamper-evident digital record, and makes online submission the only channel for future results. It answers memo NAU/CPGS/004 of 29 September 2026 from the Deputy Registrar/Head Records to the Provost, CPGS.

The memo reports that raw results submitted by departments are deteriorating, that the volume of graduand records is exhausting storage space, and (in the minute to the Provost) that rats are destroying files. The minute recommends contracting the work out urgently and taking it to the Executive Committee.

| Action sought in the memo | What the system delivers |
| --- | --- |
| 1. Scan and document all raw results | Legacy Digitization module: inventory, scanning standard, metadata indexing, double-check QA, locked archive |
| 2. Create a serious taskforce committee | Taskforce workspace: roles, assignments per department and session, progress dashboard, QA sign-off |
| 3. Send subsequent results online through a provided channel | Online Submission module: departmental upload, multi-level approval, Senate approval record, automatic archiving |

Working name used in this guide: **CPGS Results Repository (CRR)**. Stack: Next.js 15 (App Router) with TypeScript, Tailwind CSS, MongoDB Atlas with Mongoose, Cloudinary, Brevo for email, deployed on Vercel.

## Benchmark features from international universities

Mature registrar systems (Ellucian Banner, Oracle PeopleSoft Campus Solutions, Tribal SITS used across UK universities) and digital-credential services (Parchment, Digitary) share the same core: one authoritative record, staged approvals, a full audit trail, archival-grade files, and self-service verification. CRR adopts those patterns at CPGS scale.

| Feature | International practice | CRR implementation | Phase |
| --- | --- | --- | --- |
| Single source of truth | Registrar owns one authoritative academic record | Every graduand result lives in one MongoDB record, linked to its scanned source | 1 |
| Archival file format | PDF/A (ISO 19005) for long-term preservation | Scans stored as PDF/A with SHA-256 checksum recorded at upload | 1 |
| Archive model | OAIS (ISO 14721): ingest, archival storage, access | Ingest (upload + index), Archive (locked, private Cloudinary), Access (signed, expiring links) | 1 |
| Maker-checker | No record goes live on one person's word | Indexer and QA reviewer must be different users; enforced in code | 1 |
| Staged approval | Department → Faculty → Registry → Senate | HOD → Faculty PG Sub-Dean → Head Records → Provost → Senate approval date | 2 |
| Role-based access, least privilege | Staff see only their unit's records | RBAC + department scoping on every query | 1 |
| Multi-factor authentication | Required for staff with record access | TOTP (authenticator app) for all staff roles | 1 |
| Immutable audit trail | Every view, change, download logged | Append-only AuditLog with hash chain | 1 |
| Amendments, not edits | Corrections recorded as versions with reason and approval | Locked records change only through an Amendment request | 2 |
| Online verification | Employers verify credentials via code or QR | Public /verify page with verification code + QR on every issued document | 3 |
| Transcript requests | Self-service request, payment, e-delivery | Request workflow, Remita/Paystack payment hook, secure e-transcript PDF | 3 |
| Data protection | GDPR-style consent, retention, breach process | Nigeria Data Protection Act 2023 alignment: retention schedule, access logs, DPO contact | 1 |
| Analytics | Graduation and throughput dashboards | Graduands by session, programme, class of degree; digitization progress | 2 |
| Backup and disaster recovery | Offsite, tested restores | Atlas continuous backup + nightly export of Cloudinary assets to a second store | 1 |

## Roles and permissions

Ten roles cover the memo's actors; department-level roles only ever see their own department's records.

| Role | Who | Can do | Scope |
| --- | --- | --- | --- |
| SUPER\_ADMIN | ICT unit | Manage users, faculties, departments, settings; view audit log | All |
| PROVOST | Provost, CPGS | View everything, final CPGS approval, approve amendments, reports | All |
| HEAD\_RECORDS | Deputy Registrar/Head Records | Records review, lock records, assign taskforce work, approve QA, issue transcripts | All |
| TASKFORCE\_LEAD | Taskforce chair | Create digitization batches, assign indexers and reviewers, see progress | All |
| INDEXER | Taskforce member | Upload scans, enter metadata for assigned batches | Assigned batches |
| QA\_REVIEWER | Taskforce member | Compare index against scan, pass or return | Assigned batches, never own work |
| DEPT\_OFFICER | Department PG Coordinator | Prepare and submit result sheets | Own department |
| HOD | Head of Department | Approve or return department submissions | Own department |
| FACULTY\_PG | Faculty PG Sub-Dean | Approve or return faculty submissions | Own faculty |
| AUDITOR | Internal Audit | Read-only records and audit log | All, read-only |

The public (employers, other institutions) has no account: they use the verification page with a code.

```ts
// lib/rbac.ts
export const ROLES = [
  'SUPER_ADMIN','PROVOST','HEAD_RECORDS','TASKFORCE_LEAD','INDEXER',
  'QA_REVIEWER','DEPT_OFFICER','HOD','FACULTY_PG','AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  'user:manage':        ['SUPER_ADMIN'],
  'record:read:all':    ['SUPER_ADMIN','PROVOST','HEAD_RECORDS','TASKFORCE_LEAD','AUDITOR'],
  'record:lock':        ['HEAD_RECORDS'],
  'legacy:upload':      ['INDEXER','TASKFORCE_LEAD'],
  'legacy:qa':          ['QA_REVIEWER','HEAD_RECORDS'],
  'batch:assign':       ['TASKFORCE_LEAD','HEAD_RECORDS'],
  'submission:create':  ['DEPT_OFFICER'],
  'submission:approve': ['HOD','FACULTY_PG','HEAD_RECORDS','PROVOST'],
  'amendment:approve':  ['PROVOST'],
  'transcript:issue':   ['HEAD_RECORDS'],
  'audit:read':         ['SUPER_ADMIN','AUDITOR','PROVOST'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;
export const can = (role: Role, p: Permission) =>
  (PERMISSIONS[p] as readonly Role[]).includes(role);
```

## System architecture and tech stack

One Next.js app on Vercel serves the staff portal, the department portal and the public verification page; MongoDB Atlas holds the records and Cloudinary holds the scanned files privately.

&#91;embedded content: system architecture · 2 entry points, 4 app layers, 4 services\]

Both entry points go through the same guard; Cloudinary and Atlas are reached only from the server, never from the browser directly except the signed upload.

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 App Router, TypeScript, Server Actions + Route Handlers | One codebase for UI and API; server components keep record data off the client |
| UI | Tailwind CSS, shadcn/ui, TanStack Table, React Hook Form + Zod | Dense data tables, accessible forms, one validation schema shared by client and server |
| Auth | Auth.js (NextAuth v5) credentials provider, bcrypt, TOTP via otplib | Staff-only login with MFA; JWT session carries role and department |
| Database | MongoDB Atlas (M10 or higher for continuous backup), Mongoose | Flexible result sheets; transactions for approvals; text indexes for search |
| Files | Cloudinary, `type: authenticated` delivery | Private storage; files reachable only by signed, expiring URLs |
| Email | Brevo (@getbrevo/brevo) | Approval notifications, returned-submission alerts, transcript delivery |
| PDFs | pdf-lib + qrcode | Generate statements of result and e-transcripts with QR verification |
| CSV/Excel import | papaparse, SheetJS (xlsx) | Departments upload result sheets from a standard template |
| Rate limiting | Upstash Redis + @upstash/ratelimit | Protect login and the public verification endpoint |
| Monitoring | Vercel Analytics, Sentry | Errors and performance |
| Hosting | Vercel (Pro for team and longer function limits) | Git-based deploys, preview URLs per branch |

## Project setup and folder structure

Scaffold once, add the dependencies, set the environment variables in `.env.local` and in Vercel.

```bash
npx create-next-app@latest cpgs-results --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd cpgs-results
npm i mongoose next-auth@beta bcryptjs otplib qrcode cloudinary zod react-hook-form @hookform/resolvers \
  @tanstack/react-table papaparse xlsx pdf-lib @getbrevo/brevo @upstash/ratelimit @upstash/redis date-fns
npm i -D @types/bcryptjs @types/qrcode @types/papaparse
npx shadcn@latest init
```

```bash
# .env.local
MONGODB_URI=mongodb+srv://...
AUTH_SECRET=            # openssl rand -base64 32
AUTH_URL=https://records.cpgs.unizik.edu.ng
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
BREVO_API_KEY=
MAIL_FROM=records@cpgs.unizik.edu.ng
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
VERIFY_HMAC_SECRET=     # signs verification codes
AUDIT_CHAIN_SECRET=     # signs audit hash chain
```

```text
src/
  app/
    (auth)/login/page.tsx
    (auth)/mfa/page.tsx
    (portal)/layout.tsx              # sidebar, role-aware nav
    (portal)/dashboard/page.tsx
    (portal)/records/                # search + record detail
    (portal)/digitization/           # taskforce: batches, index, QA
    (portal)/submissions/            # departmental online results
    (portal)/approvals/              # approval inbox per role
    (portal)/amendments/
    (portal)/transcripts/
    (portal)/admin/                  # users, faculties, departments, sessions
    (portal)/audit/
    verify/[code]/page.tsx           # public verification
    api/
      auth/[...nextauth]/route.ts
      uploads/sign/route.ts          # Cloudinary signature
      files/[id]/url/route.ts        # signed view URL
      ...                            # see API route map
  components/ (ui/, tables/, forms/, layout/)
  lib/
    db.ts  rbac.ts  auth.ts  cloudinary.ts  audit.ts  mail.ts
    workflow.ts  verify.ts  pdf.ts  ratelimit.ts
    validators/                      # zod schemas
  models/                            # mongoose models
  middleware.ts
```

```ts
// lib/db.ts: cached connection for serverless
import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI!;
const g = global as unknown as { _mongo?: Promise<typeof mongoose> };
export async function db() {
  if (!g._mongo) g._mongo = mongoose.connect(uri, { maxPoolSize: 10 });
  return g._mongo;
}
```

## Data model: Mongoose schemas

The core record is the **ResultSheet** (one department, programme and session, legacy or online) holding many **GraduandRecord** rows, each linked to the scanned file it came from.

| Model | Purpose | Key fields |
| --- | --- | --- |
| User | Staff accounts | name, email, role, faculty, department, passwordHash, mfaSecret, isActive |
| Faculty / Department / Programme | Academic structure | name, code; programme has degreeType (PGD, MSc, MPhil, PhD) |
| AcademicSession | e.g. 2019/2020 | label, startYear |
| Student | One per PG student | matricNo (unique), surname, otherNames, sex, department, programme |
| ResultSheet | A batch of final results | origin (LEGACY/ONLINE), department, programme, session, status, files, approvals |
| GraduandRecord | One student's final result | student, sheet, cgpa, classOfDegree, thesisTitle, senateApprovalDate, courses\[\], locked, version |
| StoredFile | Any Cloudinary asset | publicId, resourceType, bytes, sha256, pages, uploadedBy |
| DigitizationBatch | Physical box or folder for the taskforce | boxCode, department, sessions, indexer, reviewer, status, counts |
| Amendment | Correction to a locked record | record, field changes, reason, evidence file, status |
| Verification | Issued statement or transcript | record, code, hmac, issuedTo, expiresAt, revoked |
| AuditLog | Append-only trail | actor, action, entity, before, after, ip, hash, prevHash |

```ts
// models/GraduandRecord.ts
import { Schema, model, models, Types } from 'mongoose';

const CourseSchema = new Schema({
  code: String, title: String, units: Number,
  score: Number, grade: String,
}, { _id: false });

const GraduandRecordSchema = new Schema({
  student:    { type: Types.ObjectId, ref: 'Student', required: true, index: true },
  sheet:      { type: Types.ObjectId, ref: 'ResultSheet', required: true, index: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme', required: true },
  session:    { type: Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  degree:     { type: String, required: true },            // e.g. 'M.Sc. Agricultural Extension'
  cgpa:       { type: Number, min: 0, max: 5 },
  classOfDegree: { type: String, enum: ['DISTINCTION','CREDIT','MERIT','PASS','FAIL','NOT_APPLICABLE'] },
  thesisTitle: String,
  supervisor:  String,
  senateApprovalDate: Date,
  courses:    [CourseSchema],
  sourceFile: { type: Types.ObjectId, ref: 'StoredFile' },  // the scan this row was read from
  sourcePage: Number,
  locked:     { type: Boolean, default: false },
  version:    { type: Number, default: 1 },
  remarks:    String,
}, { timestamps: true });

GraduandRecordSchema.index({ student: 1, programme: 1, session: 1 }, { unique: true });
export default models.GraduandRecord || model('GraduandRecord', GraduandRecordSchema);
```

```ts
// models/ResultSheet.ts
export const SHEET_STATUS = [
  'DRAFT','SUBMITTED','HOD_APPROVED','FACULTY_APPROVED','RECORDS_VERIFIED',
  'PROVOST_APPROVED','SENATE_APPROVED','RETURNED',
  'INDEXED','QA_PASSED','LOCKED',            // legacy path
] as const;

const ApprovalSchema = new Schema({
  stage: String, action: { type: String, enum: ['APPROVE','RETURN'] },
  by: { type: Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now },
  comment: String,
}, { _id: false });

const ResultSheetSchema = new Schema({
  origin:     { type: String, enum: ['LEGACY','ONLINE'], required: true },
  reference:  { type: String, unique: true },             // CPGS/RS/2026/000123
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme', required: true },
  session:    { type: Types.ObjectId, ref: 'AcademicSession', required: true },
  status:     { type: String, enum: SHEET_STATUS, default: 'DRAFT', index: true },
  files:      [{ type: Types.ObjectId, ref: 'StoredFile' }],  // signed sheet scans
  batch:      { type: Types.ObjectId, ref: 'DigitizationBatch' }, // legacy only
  approvals:  [ApprovalSchema],
  recordCount:{ type: Number, default: 0 },
  createdBy:  { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
```

```ts
// models/AuditLog.ts: append-only
const AuditLogSchema = new Schema({
  actor:   { type: Types.ObjectId, ref: 'User' },
  action:  { type: String, required: true },   // 'record.view', 'sheet.approve', 'file.download'
  entity:  String, entityId: String,
  before:  Schema.Types.Mixed, after: Schema.Types.Mixed,
  ip: String, userAgent: String,
  prevHash: String, hash: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.pre(['updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany'], function () {
  throw new Error('AuditLog is append-only');
});
```

Add a MongoDB text index on Student `{ surname: 'text', otherNames: 'text', matricNo: 'text' }` for search, and create a database user for the app with no `dropDatabase` or `delete` rights on `auditlogs`.

## Authentication, RBAC and security

Staff sign in with email, password and a TOTP code; every server action re-checks role and department scope, so hiding a button is never the only guard.

```ts
// lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { db } from './db';
import User from '@/models/User';
import { loginLimiter } from './ratelimit';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },  // 8-hour working session
  pages: { signIn: '/login' },
  providers: [Credentials({
    credentials: { email: {}, password: {}, otp: {} },
    async authorize(c) {
      const email = String(c.email).toLowerCase();
      const { success } = await loginLimiter.limit(email);
      if (!success) return null;
      await db();
      const u = await User.findOne({ email, isActive: true }).select('+passwordHash +mfaSecret');
      if (!u || !(await bcrypt.compare(String(c.password), u.passwordHash))) return null;
      if (u.mfaSecret && !authenticator.check(String(c.otp), u.mfaSecret)) return null;
      return { id: u.id, name: u.name, email: u.email, role: u.role,
               department: u.department?.toString(), faculty: u.faculty?.toString() };
    },
  })],
  callbacks: {
    jwt: ({ token, user }) => (user ? { ...token, ...user } : token),
    session: ({ session, token }) => ({ ...session, user: { ...session.user, ...token } }),
  },
});
```

```ts
// lib/guard.ts: use at the top of every server action and route handler
import { auth } from './auth';
import { can, type Permission, type Role } from './rbac';

export async function requirePermission(p: Permission) {
  const s = await auth();
  if (!s?.user) throw new Response('Unauthorized', { status: 401 });
  const role = s.user.role as Role;
  if (!can(role, p)) throw new Response('Forbidden', { status: 403 });
  return s.user;
}

// Department-scoped roles only ever query their own unit
export function scopeFilter(user: { role: Role; department?: string; faculty?: string }) {
  if (['DEPT_OFFICER','HOD'].includes(user.role)) return { department: user.department };
  if (user.role === 'FACULTY_PG') return { faculty: user.faculty };
  return {};
}
```

```ts
// middleware.ts
export { auth as middleware } from '@/lib/auth';
export const config = { matcher: ['/((?!login|mfa|verify|api/verify|_next|favicon).*)'] };
```

Security checklist:

- Passwords hashed with bcrypt (cost 12); minimum 12 characters; forced change on first login.
- MFA enrolment page shows a QR (otplib `keyuri`) and requires one valid code before saving the secret.
- Lock the account after 5 failed attempts for 15 minutes (Upstash rate limiter).
- Security headers in `next.config.ts`: Content-Security-Policy, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin`, HSTS.
- Validate every input with Zod on the server, even when the form already validated it.
- No record data in client components beyond what the page shows; never send `mfaSecret` or `passwordHash`.
- Log every login, failed login, record view and file download to the AuditLog.
- Restrict MongoDB Atlas network access; Vercel uses dynamic IPs, so use Atlas with a strong user and, on Vercel Pro/Enterprise, Secure Compute static IPs if the university requires an allow-list.

## Cloudinary document storage

Every scan is uploaded as an `authenticated` asset, so no public URL ever exists; staff see it only through a signed link that expires after 5 minutes.

Uploads go straight from the browser to Cloudinary (large scans never pass through a Vercel function, which caps request bodies at 4.5 MB). The server signs the upload, then records the file after Cloudinary returns.

```ts
// lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
export default cloudinary;

export function signedViewUrl(publicId: string, resourceType: 'image' | 'raw' = 'image') {
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    type: 'authenticated', resource_type: resourceType,
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
}
```

```ts
// app/api/uploads/sign/route.ts
import cloudinary from '@/lib/cloudinary';
import { requirePermission } from '@/lib/guard';

export async function POST(req: Request) {
  const user = await requirePermission('legacy:upload'); // or 'submission:create'
  const { folder } = await req.json();                    // e.g. 'crr/legacy/ENG/2015-2016'
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder, type: 'authenticated', context: `uploader=${user.id}` };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);
  return Response.json({ ...params, signature, apiKey: process.env.CLOUDINARY_API_KEY,
                         cloudName: process.env.CLOUDINARY_CLOUD_NAME });
}
```

```ts
// client: compute checksum, upload, then register
async function sha256(file: File) {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadScan(file: File, folder: string) {
  const sig = await fetch('/api/uploads/sign', { method: 'POST', body: JSON.stringify({ folder }) }).then(r => r.json());
  const fd = new FormData();
  Object.entries({ file, api_key: sig.apiKey, timestamp: sig.timestamp, signature: sig.signature,
                   folder: sig.folder, type: sig.type, context: sig.context })
    .forEach(([k, v]) => fd.append(k, v as Blob | string));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, { method: 'POST', body: fd }).then(r => r.json());
  return fetch('/api/files', { method: 'POST', body: JSON.stringify({
    publicId: res.public_id, resourceType: res.resource_type, bytes: res.bytes,
    pages: res.pages, sha256: await sha256(file), originalName: file.name }) }).then(r => r.json());
}
```

Rules:

- Folder convention: `crr/{legacy|online}/{DEPT_CODE}/{SESSION}/{reference}`.
- `/api/files` re-fetches the asset with the Admin API to confirm it exists, is `authenticated`, and that bytes match before saving the StoredFile.
- `/api/files/[id]/url` checks permission and department scope, writes a `file.view` audit entry, then returns `signedViewUrl`.
- Show scans in an in-app PDF viewer; add an overlay watermark with the viewer's name and time for downloads.
- Turn on Cloudinary's backup feature and a strict transformations setting so unsigned transformations are refused.

## Module 1: Legacy results digitization

The taskforce works box by box: each physical box becomes a DigitizationBatch, and no record is locked until a second person has checked it against the scan.

1. **Rescue first.** Move files out of the rat-affected room into sealed plastic boxes before scanning starts; prioritise the most damaged and the oldest sessions.
2. **Inventory.** The Taskforce Lead creates a batch per box: box code (e.g. `CRR-BOX-0042`), department, sessions covered, estimated sheet count. Print the box code as a QR label.
3. **Scan to standard.** 300 dpi minimum, colour (stamps and signatures matter), one PDF per result sheet, saved as PDF/A. Use a document scanner with a flatbed for fragile pages.
4. **Upload.** The Indexer opens the batch, drags in the PDFs; each is uploaded with its checksum (see Cloudinary section).
5. **Index.** For each sheet the Indexer creates a ResultSheet (origin LEGACY) and enters one GraduandRecord per student: matric number, name, programme, CGPA, class, thesis title, Senate approval date, source page. A side-by-side screen shows the scan on the left and the form on the right.
6. **QA review.** A different taskforce member compares every row against the scan, then passes the sheet or returns it with comments. The server refuses a QA action by the sheet's indexer.
7. **Records verification and lock.** The Head of Records spot-checks a sample of QA-passed sheets per batch and locks them; locked records change only through an Amendment.
8. **Return paper to archive.** Paper stays boxed and labelled in a dry, pest-controlled store until the university decides its retention.

```ts
// app/(portal)/digitization/actions.ts
'use server';
import { requirePermission } from '@/lib/guard';
import ResultSheet from '@/models/ResultSheet';
import { audit } from '@/lib/audit';

export async function qaDecision(sheetId: string, pass: boolean, comment?: string) {
  const user = await requirePermission('legacy:qa');
  const sheet = await ResultSheet.findById(sheetId);
  if (!sheet || sheet.status !== 'INDEXED') throw new Error('Sheet is not awaiting QA');
  if (sheet.createdBy.toString() === user.id) throw new Error('You cannot review your own indexing');
  const before = sheet.status;
  sheet.status = pass ? 'QA_PASSED' : 'RETURNED';
  sheet.approvals.push({ stage: 'QA', action: pass ? 'APPROVE' : 'RETURN', by: user.id, comment });
  await sheet.save();
  await audit(user, 'sheet.qa', 'ResultSheet', sheetId, { status: before }, { status: sheet.status });
}
```

The taskforce dashboard shows, per department and session: boxes inventoried, sheets scanned, records indexed, QA passed, locked, and the error rate found in QA. Indexing quality features worth building:

- Duplicate warning when a matric number already has a record for that programme.
- Matric number format check per department (configurable regex).
- CGPA and class-of-degree consistency check against the CPGS grading table for that session.
- "Illegible" flag that sends a row to the Head of Records instead of guessing.

## Module 2: Online result submission and approval

From go-live, departments submit final results only through the portal: a structured sheet plus the signed scan, moving through five approval stages, with any stage able to return it.

&#91;embedded content: online submission flow · 6 stages, 1 return path\]

Approvals run department to faculty to Records to Provost; a return at any point sends the sheet back to the department with its history intact.

Submission screen for the Department PG Coordinator:

- Pick programme and session; download the CRR result template (xlsx) with locked columns: matric no, surname, other names, sex, courses (code, units, score, grade), CGPA, class of degree, thesis title, supervisor.
- Upload the filled template; the server parses it with SheetJS, validates every row with Zod, and shows errors per cell before anything is saved.
- Attach the signed and stamped result sheet scan (PDF), which stays the legal source.
- Submit: status becomes SUBMITTED, the HOD gets a Brevo email and an inbox item.

```ts
// lib/workflow.ts: one table drives the whole approval chain
export const FLOW = {
  SUBMITTED:        { role: 'HOD',          next: 'HOD_APPROVED' },
  HOD_APPROVED:     { role: 'FACULTY_PG',   next: 'FACULTY_APPROVED' },
  FACULTY_APPROVED: { role: 'HEAD_RECORDS', next: 'RECORDS_VERIFIED' },
  RECORDS_VERIFIED: { role: 'PROVOST',      next: 'PROVOST_APPROVED' },
  PROVOST_APPROVED: { role: 'HEAD_RECORDS', next: 'SENATE_APPROVED' }, // records Senate date
} as const;

export async function decide(sheetId: string, approve: boolean, comment: string, senateDate?: Date) {
  const user = await requirePermission('submission:approve');
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const sheet = await ResultSheet.findById(sheetId).session(session);
    const step = FLOW[sheet.status as keyof typeof FLOW];
    if (!step || step.role !== user.role) throw new Error('Not your stage');
    assertInScope(user, sheet);                                  // dept/faculty check
    if (!approve && !comment) throw new Error('A reason is required to return a sheet');
    const before = sheet.status;
    sheet.status = approve ? step.next : 'RETURNED';
    sheet.approvals.push({ stage: before, action: approve ? 'APPROVE' : 'RETURN', by: user.id, comment });
    if (sheet.status === 'SENATE_APPROVED') {
      await GraduandRecord.updateMany({ sheet: sheet._id },
        { $set: { senateApprovalDate: senateDate, locked: true } }, { session });
    }
    await sheet.save({ session });
    await audit(user, 'sheet.decide', 'ResultSheet', sheetId, { status: before }, { status: sheet.status }, session);
  });
  await notifyNextStage(sheetId);                                // Brevo email
}
```

Rules that keep it trustworthy:

- A RETURNED sheet becomes editable by the department again, keeps its full approval history, and is resubmitted as the same reference.
- Approvers see a diff when a resubmitted sheet changed since they last saw it.
- Records Verification checks the structured rows against the attached scan, the same way QA does for legacy sheets.
- At SENATE\_APPROVED every row is locked and the sheet is archived; no further edits.
- Reminder emails go to any approver holding a sheet for more than 7 days; the Provost dashboard shows sheets stuck per stage.

## Module 3: Search, transcripts and verification

Any authorised officer finds a graduand's result in seconds, and anyone outside the university can confirm a document is genuine without calling the Records Unit.

Search:

- One search box: matric number (exact), name (MongoDB text index), thesis title; filters for faculty, department, programme, session, class of degree, origin (legacy/online).
- Results table (TanStack Table, server-side pagination) with a record page showing the result, its approval history, and a button to view the source scan.
- Every record view is audited; export to CSV is limited to PROVOST and HEAD\_RECORDS.

Issued documents (statement of result, e-transcript):

1. Request is logged (by staff, or later by the graduand through a request form with payment via Remita or Paystack).
2. HEAD\_RECORDS generates the PDF with pdf-lib: CPGS letterhead, record data, issue date, verification code and QR.
3. The PDF is stored as an authenticated Cloudinary asset and emailed through Brevo as a time-limited link.

```ts
// lib/verify.ts
import crypto from 'crypto';
import Verification from '@/models/Verification';

export async function issueVerification(recordId: string, issuedTo: string, userId: string) {
  const code = crypto.randomBytes(6).toString('base64url').toUpperCase(); // e.g. 8Q2K-ZP7M style
  const hmac = crypto.createHmac('sha256', process.env.VERIFY_HMAC_SECRET!)
    .update(`${code}:${recordId}`).digest('hex');
  await Verification.create({ record: recordId, code, hmac, issuedTo, issuedBy: userId,
    expiresAt: new Date(Date.now() + 365 * 864e5) });
  return { code, url: `${process.env.AUTH_URL}/verify/${code}` };
}
```

Public page `/verify/[code]` (rate-limited, no login):

- Shows only: name, degree, class of degree, session, Senate approval date, issue date, status (Valid, Revoked, Expired).
- Never shows scores, the scan or contact details.
- Revocation by HEAD\_RECORDS takes effect immediately, for example when an amendment changes the record.

Amendments: a correction to a locked record is an Amendment with the old and new values, a reason and an evidence file. HEAD\_RECORDS reviews, the PROVOST approves, then the record's version increments and the change is audited; the old version stays readable.

## Audit trail, backups and compliance

Every action leaves a hash-chained log entry, and records exist in at least two independent places, so a lost or altered record can be detected and restored.

```ts
// lib/audit.ts
import crypto from 'crypto';
import AuditLog from '@/models/AuditLog';
import { headers } from 'next/headers';

export async function audit(user: { id: string }, action: string, entity: string, entityId: string,
                            before?: unknown, after?: unknown, session?: mongoose.ClientSession) {
  const h = await headers();
  const last = await AuditLog.findOne().sort({ _id: -1 }).select('hash').session(session ?? null);
  const prevHash = last?.hash ?? 'GENESIS';
  const body = JSON.stringify({ actor: user.id, action, entity, entityId, before, after, prevHash, t: Date.now() });
  const hash = crypto.createHmac('sha256', process.env.AUDIT_CHAIN_SECRET!).update(body).digest('hex');
  await AuditLog.create([{ actor: user.id, action, entity, entityId, before, after,
    ip: h.get('x-forwarded-for'), userAgent: h.get('user-agent'), prevHash, hash }], { session });
}
```

A nightly Vercel Cron job (`/api/cron/verify-audit`) recomputes the chain and emails SUPER\_ADMIN and AUDITOR if any link breaks.

Backups and recovery:

- MongoDB Atlas continuous cloud backup with point-in-time restore (M10 tier and above).
- Nightly Vercel Cron export: new StoredFiles listed and copied to a second store (an S3-compatible bucket or the university's own server), checksums re-verified.
- Quarterly restore drill: restore last night's backup to a staging cluster and open ten random records with their scans.

Compliance (Nigeria Data Protection Act 2023):

- Name a Data Protection Officer contact for the portal and publish a privacy notice on the login and verify pages.
- Collect only what the result needs; no phone numbers or addresses on graduand records.
- Keep academic records permanently; keep audit logs at least 7 years (or the university's stated period); delete expired verification links' metadata after their retention date.
- Breach procedure: who is told, within what time, and by whom, approved by the Provost before go-live.

## API route map and page map

Mutations from the portal UI use Server Actions; the routes below exist for uploads, file access, cron jobs, exports and the public verifier.

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| POST | /api/auth/\[...nextauth\] | public | Sign in, sign out |
| POST | /api/auth/mfa/enrol | signed in | Generate TOTP secret and QR, confirm with a code |
| POST | /api/uploads/sign | legacy:upload or submission:create | Cloudinary upload signature |
| POST | /api/files | legacy:upload or submission:create | Register an uploaded file after checks |
| GET | /api/files/\[id\]/url | record:read (scoped) | Signed 5-minute view URL, audited |
| GET | /api/records | record:read (scoped) | Search with filters and pagination |
| GET | /api/records/\[id\] | record:read (scoped) | Record with history and versions |
| POST | /api/submissions/\[id\]/parse | submission:create | Parse and validate uploaded template |
| GET | /api/templates/result-sheet | submission:create | Download xlsx template |
| GET | /api/reports/export | PROVOST, HEAD\_RECORDS | CSV export, audited |
| POST | /api/transcripts/\[id\]/issue | transcript:issue | Generate PDF and verification code |
| POST | /api/verifications/\[code\]/revoke | transcript:issue | Revoke an issued document |
| GET | /api/verify/\[code\] | public, rate-limited | Verification lookup |
| POST | /api/payments/webhook | signature-checked | Remita or Paystack payment confirmation |
| GET | /api/cron/verify-audit | Vercel Cron secret | Recheck audit hash chain |
| GET | /api/cron/backup-files | Vercel Cron secret | Copy new scans to second store |
| GET | /api/cron/reminders | Vercel Cron secret | Email approvers holding sheets over 7 days |

| Page | Roles | Shows |
| --- | --- | --- |
| /login, /mfa | all staff | Sign in, MFA enrolment |
| /dashboard | all staff | Role-specific cards: inbox count, digitization progress, graduands by session |
| /records, /records/\[id\] | read roles (scoped) | Search, record detail, scan viewer, history |
| /digitization/batches | TASKFORCE\_LEAD, HEAD\_RECORDS | Boxes, assignments, progress |
| /digitization/index/\[batch\] | INDEXER | Scan beside data-entry form |
| /digitization/qa | QA\_REVIEWER | Sheets awaiting QA, side-by-side check |
| /submissions | DEPT\_OFFICER | Draft, submitted and returned sheets |
| /submissions/new | DEPT\_OFFICER | Template upload, validation, scan attach |
| /approvals | HOD, FACULTY\_PG, HEAD\_RECORDS, PROVOST | Inbox for the user's stage |
| /amendments | HEAD\_RECORDS, PROVOST | Correction requests |
| /transcripts | HEAD\_RECORDS | Requests, issued documents, revocations |
| /admin/\* | SUPER\_ADMIN | Users, faculties, departments, programmes, sessions, grading tables |
| /audit | SUPER\_ADMIN, AUDITOR, PROVOST | Filterable audit log, chain status |
| /verify/\[code\] | public | Verification result |

## Deployment and rollout

Ship in three phases matching the memo's order of urgency: rescue and digitize first, then move new results online, then open verification.

&#91;embedded content: rollout roadmap · 4 phases, 3 gates (proposed)\]

Durations are a proposal to adjust once the Records Unit confirms how many boxes and sessions exist; the pilot runs inside the first two weeks of Phase 1.

Deploy to Vercel:

1. Push to GitHub; import the repo in Vercel; set every variable from `.env.local` for Production and Preview (separate Atlas database and Cloudinary folder for Preview).
2. Add the domain (e.g. `records.cpgs.unizik.edu.ng`) with the university ICT unit; Vercel issues the TLS certificate.
3. Add `vercel.json` crons: `verify-audit` daily 01:00, `backup-files` daily 02:00, `reminders` daily 08:00 Lagos time (Africa/Lagos is UTC+1; Vercel cron runs in UTC).
4. Run a seed script once: faculties, departments, programmes, sessions, the first SUPER\_ADMIN, grading tables.
5. Protect `main`: deploy to production only from reviewed pull requests; every branch gets a preview URL for the taskforce to test.
6. Enable Sentry and Vercel Analytics; set an uptime check on `/api/health`.

```json
{
  "crons": [
    { "path": "/api/cron/verify-audit", "schedule": "0 0 * * *" },
    { "path": "/api/cron/backup-files", "schedule": "0 1 * * *" },
    { "path": "/api/cron/reminders",    "schedule": "0 7 * * *" }
  ]
}
```

Taskforce and change management:

- The Executive Committee approves the taskforce, its chair (TASKFORCE\_LEAD) and the target sessions to cover.
- Train indexers and reviewers in a half-day session on the Preview deployment with sample scans.
- Pilot with one department for two weeks, measure QA error rate and sheets per day, then scale.
- Before Phase 2 go-live, the Provost issues a circular: results submitted on paper will no longer be accepted.

Open questions for the Records Unit: how many sessions and boxes exist; whether the university already has a scanner; the official CPGS grading table per session; whether the university's own server or a cloud bucket will hold the second backup copy.
