/**
 * Seeds the academic structure and the first SUPER_ADMIN.
 *   npm run seed            structure + admin (safe to re-run; upserts)
 *   npm run seed -- --demo  also creates one demo user per role and sample results (never in production)
 */
import crypto from 'crypto';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  AcademicSession, Department, DigitizationBatch, Faculty, GraduandRecord, Programme, ResultSheet, Student, User, Verification,
} from '../src/models';
import { expectedClass } from '../src/lib/grading';
import type { Role } from '../src/lib/rbac';

// Same files as Next.js: .env.local first, then .env (a value already set is never overwritten).
for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);
const DEMO = process.argv.includes('--demo');

// Faculties and a representative set of departments and PG programmes at UNIZIK.
// Extend in Admin → Academic structure; codes are used in storage folders and references.
const STRUCTURE: { faculty: [string, string]; departments: { name: string; code: string; programmes: [string, string, string][] }[] }[] = [
  { faculty: ['Faculty of Agriculture', 'AGR'], departments: [
    { name: 'Agricultural Economics and Extension', code: 'AEE', programmes: [
      ['M.Sc. Agricultural Extension', 'MSC-AEX', 'MSc'], ['Ph.D. Agricultural Extension', 'PHD-AEX', 'PhD'], ['M.Sc. Agricultural Economics', 'MSC-AEC', 'MSc']] },
    { name: 'Crop Science and Horticulture', code: 'CSH', programmes: [['M.Sc. Crop Science', 'MSC-CSH', 'MSc'], ['Ph.D. Crop Science', 'PHD-CSH', 'PhD']] },
  ] },
  { faculty: ['Faculty of Arts', 'ART'], departments: [
    { name: 'English Language and Literature', code: 'ENG', programmes: [['M.A. English', 'MA-ENG', 'MA'], ['Ph.D. English', 'PHD-ENG', 'PhD']] },
    { name: 'History and International Studies', code: 'HIS', programmes: [['M.A. History', 'MA-HIS', 'MA']] },
  ] },
  { faculty: ['Faculty of Education', 'EDU'], departments: [
    { name: 'Educational Management and Policy', code: 'EMP', programmes: [['M.Ed. Educational Management', 'MED-EMP', 'MEd'], ['PGD Education', 'PGDE', 'PGD']] },
  ] },
  { faculty: ['Faculty of Engineering', 'ENGR'], departments: [
    { name: 'Civil Engineering', code: 'CVE', programmes: [['M.Eng. Civil Engineering (Structures)', 'MENG-CVE', 'MSc']] },
    { name: 'Electronic and Computer Engineering', code: 'ECE', programmes: [['M.Eng. Electronic and Computer Engineering', 'MENG-ECE', 'MSc']] },
  ] },
  { faculty: ['Faculty of Law', 'LAW'], departments: [
    { name: 'Commercial and Property Law', code: 'CPL', programmes: [['LL.M. Commercial Law', 'LLM-CPL', 'LLM']] },
  ] },
  { faculty: ['Faculty of Management Sciences', 'MGS'], departments: [
    { name: 'Business Administration', code: 'BUA', programmes: [['MBA Business Administration', 'MBA-BUA', 'MBA'], ['M.Sc. Management', 'MSC-BUA', 'MSc']] },
    { name: 'Accountancy', code: 'ACC', programmes: [['M.Sc. Accountancy', 'MSC-ACC', 'MSc']] },
  ] },
  { faculty: ['Faculty of Physical Sciences', 'PHS'], departments: [
    { name: 'Computer Science', code: 'CSC', programmes: [['M.Sc. Computer Science', 'MSC-CSC', 'MSc'], ['Ph.D. Computer Science', 'PHD-CSC', 'PhD'], ['PGD Computer Science', 'PGD-CSC', 'PGD']] },
    { name: 'Pure and Industrial Chemistry', code: 'CHM', programmes: [['M.Sc. Industrial Chemistry', 'MSC-CHM', 'MSc']] },
  ] },
  { faculty: ['Faculty of Social Sciences', 'SSC'], departments: [
    { name: 'Economics', code: 'ECO', programmes: [['M.Sc. Economics', 'MSC-ECO', 'MSc'], ['Ph.D. Economics', 'PHD-ECO', 'PhD']] },
    { name: 'Political Science', code: 'POL', programmes: [['M.Sc. Political Science', 'MSC-POL', 'MSc']] },
  ] },
  { faculty: ['Faculty of Health Sciences and Technology', 'HST'], departments: [
    { name: 'Nursing Science', code: 'NSC', programmes: [['M.Sc. Nursing Science', 'MSC-NSC', 'MSc']] },
  ] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsert(model: mongoose.Model<any>, filter: object, data: object) {
  return model.findOneAndUpdate(filter, { $setOnInsert: data }, { upsert: true, returnDocument: 'after' });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI (see .env.example)');
  if (DEMO && process.env.NODE_ENV === 'production') throw new Error('Refusing to load demo data in production');
  await mongoose.connect(uri);
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));

  for (const f of STRUCTURE) {
    const fac = await upsert(Faculty, { code: f.faculty[1] }, { name: f.faculty[0], code: f.faculty[1] });
    for (const d of f.departments) {
      const dep = await upsert(Department, { code: d.code }, { name: d.name, code: d.code, faculty: fac!._id });
      for (const [name, code, degreeType] of d.programmes) {
        await upsert(Programme, { code }, { name, code, degreeType, department: dep!._id });
      }
    }
  }
  for (let y = 2000; y <= new Date().getFullYear(); y++) {
    await upsert(AcademicSession, { label: `${y}/${y + 1}` }, { label: `${y}/${y + 1}`, startYear: y });
  }
  console.log('✓ Faculties, departments, programmes and sessions');

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'ict.cpgs@unizik.edu.ng').toLowerCase();
  if (!(await User.exists({ email: adminEmail }))) {
    const pwd = process.env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(12).toString('base64url') + 'A7a';
    await User.create({ name: 'CPGS ICT Administrator', email: adminEmail, role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(pwd, 12), mustChangePassword: true });
    console.log(`✓ SUPER_ADMIN ${adminEmail} with temporary password: ${pwd}`);
  } else {
    console.log(`• SUPER_ADMIN ${adminEmail} already exists`);
  }

  if (DEMO) await demo();
  await mongoose.disconnect();
}

async function demo() {
  const pwd = 'Demo-Password-2026';
  const hash = await bcrypt.hash(pwd, 12);
  const csc = (await Department.findOne({ code: 'CSC' }))!;
  const aee = (await Department.findOne({ code: 'AEE' }))!;
  const users: [string, string, Role, { department?: unknown; faculty?: unknown }][] = [
    ['Provost (Demo)', 'provost@demo.unizik.edu.ng', 'PROVOST', {}],
    ['Head of Records (Demo)', 'records@demo.unizik.edu.ng', 'HEAD_RECORDS', {}],
    ['Taskforce Lead (Demo)', 'taskforce@demo.unizik.edu.ng', 'TASKFORCE_LEAD', {}],
    ['Indexer (Demo)', 'indexer@demo.unizik.edu.ng', 'INDEXER', {}],
    ['QA Reviewer (Demo)', 'qa@demo.unizik.edu.ng', 'QA_REVIEWER', {}],
    ['CSC PG Coordinator (Demo)', 'pgc.csc@demo.unizik.edu.ng', 'DEPT_OFFICER', { department: csc._id, faculty: csc.faculty }],
    ['HOD Computer Science (Demo)', 'hod.csc@demo.unizik.edu.ng', 'HOD', { department: csc._id, faculty: csc.faculty }],
    ['Sub-Dean PG, Physical Sciences (Demo)', 'subdean.phs@demo.unizik.edu.ng', 'FACULTY_PG', { faculty: csc.faculty }],
    ['Internal Auditor (Demo)', 'audit@demo.unizik.edu.ng', 'AUDITOR', {}],
    ['System Admin (Demo)', 'admin@demo.unizik.edu.ng', 'SUPER_ADMIN', {}],
  ];
  const ids: Record<string, mongoose.Types.ObjectId> = {};
  for (const [name, email, role, unit] of users) {
    const u = await upsert(User, { email }, { name, email, role, ...unit, passwordHash: hash, mustChangePassword: false });
    ids[role] = u!._id as mongoose.Types.ObjectId;
  }
  console.log(`✓ Demo users (password for all: ${pwd})`);

  if (await ResultSheet.exists({ reference: 'CPGS/RS/DEMO/000001' })) return console.log('• Demo results already present');

  const s2015 = (await AcademicSession.findOne({ label: '2015/2016' }))!;
  const s2024 = (await AcademicSession.findOne({ label: '2024/2025' }))!;
  const aexProg = (await Programme.findOne({ code: 'MSC-AEX' }))!;
  const cscProg = (await Programme.findOne({ code: 'MSC-CSC' }))!;

  const batch = await DigitizationBatch.create({
    boxCode: 'CRR-BOX-0001', department: aee._id, sessions: [s2015._id], estimatedSheets: 12, condition: 'DAMAGED', priority: 1,
    location: 'Sealed store, shelf A1', notes: 'Rodent damage on outer folders', indexer: ids.INDEXER, reviewer: ids.QA_REVIEWER,
    status: 'IN_PROGRESS', createdBy: ids.TASKFORCE_LEAD,
  });
  const legacy = await ResultSheet.create({
    origin: 'LEGACY', reference: 'CPGS/RS/DEMO/000001', department: aee._id, programme: aexProg._id, session: s2015._id,
    batch: batch._id, status: 'LOCKED', createdBy: ids.INDEXER, senateApprovalDate: new Date('2016-11-24'),
    approvals: [
      { stage: 'INDEXING', action: 'SUBMIT', by: ids.INDEXER, byName: 'Indexer (Demo)', at: new Date('2026-10-01') },
      { stage: 'QA', action: 'APPROVE', by: ids.QA_REVIEWER, byName: 'QA Reviewer (Demo)', at: new Date('2026-10-02') },
      { stage: 'RECORDS', action: 'LOCK', by: ids.HEAD_RECORDS, byName: 'Head of Records (Demo)', at: new Date('2026-10-03') },
    ],
  });
  const names = [['OKONKWO', 'Chiamaka Grace', 'F', 4.62], ['EZE', 'Obinna Michael', 'M', 3.88], ['NWOSU', 'Adaeze Ifeoma', 'F', 3.21],
    ['OKAFOR', 'Emeka Johnson', 'M', 2.74], ['UCHE', 'Ngozi Patience', 'F', 4.51], ['ANI', 'Chukwudi Samuel', 'M', 3.55]] as const;
  let firstRecord: mongoose.Types.ObjectId | undefined;
  for (const [i, [surname, otherNames, sex, cgpa]] of names.entries()) {
    const st = await Student.create({ matricNo: `2014${String(247001 + i)}`, surname, otherNames, sex, department: aee._id, programme: aexProg._id });
    const r = await GraduandRecord.create({
      student: st._id, sheet: legacy._id, department: aee._id, programme: aexProg._id, session: s2015._id, origin: 'LEGACY',
      degree: aexProg.name, cgpa, classOfDegree: expectedClass(cgpa), thesisTitle: `Adoption of improved cassava technologies among farmers in Anambra State (case ${i + 1})`,
      supervisor: 'Prof. A. N. Example', senateApprovalDate: new Date('2016-11-24'), sourcePage: i + 1, locked: true,
      courses: [
        { code: 'AEX801', title: 'Research Methods in Agricultural Extension', units: 3, score: 72, grade: 'A' },
        { code: 'AEX803', title: 'Extension Communication', units: 3, score: 64, grade: 'B' },
        { code: 'AEX899', title: 'Dissertation', units: 6, score: 70, grade: 'A' },
      ],
    });
    firstRecord ??= r._id;
  }
  legacy.recordCount = names.length;
  await legacy.save();

  const code = 'DEMO-2345';
  await Verification.create({
    record: firstRecord, kind: 'STATEMENT_OF_RESULT', code, recordVersion: 1, issuedTo: 'Demo Employer Ltd', issuedBy: ids.HEAD_RECORDS,
    hmac: crypto.createHmac('sha256', process.env.VERIFY_HMAC_SECRET!).update(`${code}:${firstRecord}:1`).digest('hex'),
    expiresAt: new Date(Date.now() + 365 * 864e5),
  });

  const online = await ResultSheet.create({
    origin: 'ONLINE', reference: 'CPGS/RS/DEMO/000002', department: csc._id, programme: cscProg._id, session: s2024._id,
    status: 'SUBMITTED', createdBy: ids.DEPT_OFFICER, approvals: [{ stage: 'SUBMITTED', action: 'SUBMIT', by: ids.DEPT_OFFICER, byName: 'CSC PG Coordinator (Demo)' }],
  });
  const onlineGraduands: [string, string, 'M' | 'F', number][] = [['OBI', 'Kosisochukwu Mary', 'F', 4.7], ['IBE', 'Tochukwu Paul', 'M', 3.62]];
  for (const [i, [surname, otherNames, sex, cgpa]] of onlineGraduands.entries()) {
    const st = await Student.create({ matricNo: `2023${String(347001 + i)}`, surname, otherNames, sex, department: csc._id, programme: cscProg._id });
    await GraduandRecord.create({
      student: st._id, sheet: online._id, department: csc._id, programme: cscProg._id, session: s2024._id, origin: 'ONLINE',
      degree: cscProg.name, cgpa, classOfDegree: expectedClass(cgpa), thesisTitle: `Machine learning for crop disease detection (${i + 1})`,
      courses: [{ code: 'CSC801', title: 'Advanced Algorithms', units: 3, score: 75, grade: 'A' }],
    });
  }
  online.recordCount = 2;
  await online.save();
  console.log(`✓ Demo results: locked legacy sheet (6 graduands), online sheet awaiting HOD, verification code ${code}`);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
