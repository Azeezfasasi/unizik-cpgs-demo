import 'server-only';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { ROLE_LABELS, type Role } from './rbac';
import type { CellError } from './action-state';
import { Department, Faculty, User } from '@/models';

/**
 * Bulk staff accounts: each faculty or department fills one row per staff member; the system
 * administrator uploads the file and every new account gets the usual welcome email.
 */

export const USER_COLUMNS = ['Full Name', 'Email', 'Role', 'Faculty Code', 'Department Code'] as const;
export const MAX_USER_ROWS = 200;
const SHEET = 'Staff';

/**
 * Roles that can be created in bulk. System administrators are created one at a time on the
 * Users page, so a spreadsheet can never hand out full control of the system.
 */
const BULK_ROLES = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== 'SUPER_ADMIN');
const DEPT_ROLES: Role[] = ['DEPT_OFFICER', 'HOD'];
const FACULTY_ROLES: Role[] = ['FACULTY_PG'];

/** What a role needs in the unit columns, for the template notes and messages. */
const unitRule = (r: Role) => (DEPT_ROLES.includes(r) ? 'Department Code (required)' : FACULTY_ROLES.includes(r) ? 'Faculty Code (required)' : 'none (university-wide)');

/** Common ways people write a role → role. */
const ROLE_ALIASES: Record<string, Role> = {
  hod: 'HOD', headofdepartment: 'HOD',
  pgcoordinator: 'DEPT_OFFICER', departmentpgcoordinator: 'DEPT_OFFICER', deptofficer: 'DEPT_OFFICER', departmentalpgcoordinator: 'DEPT_OFFICER',
  subdean: 'FACULTY_PG', facultypgsubdean: 'FACULTY_PG', pgsubdean: 'FACULTY_PG', facultypg: 'FACULTY_PG',
  provost: 'PROVOST', headofrecords: 'HEAD_RECORDS', records: 'HEAD_RECORDS', headrecords: 'HEAD_RECORDS',
  taskforcelead: 'TASKFORCE_LEAD', indexer: 'INDEXER', qareviewer: 'QA_REVIEWER', qa: 'QA_REVIEWER',
  auditor: 'AUDITOR', internalauditor: 'AUDITOR',
  systemadministrator: 'SUPER_ADMIN', superadmin: 'SUPER_ADMIN', admin: 'SUPER_ADMIN',
};
const roleKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function parseRole(text: string): Role | null {
  const k = roleKey(text);
  if (!k) return null;
  const byCode = (Object.keys(ROLE_LABELS) as Role[]).find((r) => roleKey(r) === k);
  const byLabel = (Object.keys(ROLE_LABELS) as Role[]).find((r) => roleKey(ROLE_LABELS[r]) === k);
  return byCode ?? byLabel ?? ROLE_ALIASES[k] ?? null;
}

/** Template with an example, the rules, and the current faculty and department codes to copy from. */
export async function buildUserTemplate() {
  const [faculties, departments] = await Promise.all([
    Faculty.find().sort({ name: 1 }).lean(),
    Department.find().sort({ name: 1 }).populate<{ faculty: { code: string; name: string } }>('faculty', 'code name').lean(),
  ]);
  const wb = XLSX.utils.book_new();
  const staff = XLSX.utils.aoa_to_sheet([
    [...USER_COLUMNS],
    ['Dr. Ada Okafor', 'a.okafor@unizik.edu.ng', 'Department PG Coordinator', '', departments[0]?.code ?? 'CSC'],
    ['Prof. Emeka Obi', 'e.obi@unizik.edu.ng', 'Head of Department', '', departments[0]?.code ?? 'CSC'],
    ['Prof. Ngozi Eze', 'n.eze@unizik.edu.ng', 'Faculty PG Sub-Dean', faculties[0]?.code ?? 'PSC', ''],
  ]);
  staff['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 28 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, staff, SHEET);

  const notes = XLSX.utils.aoa_to_sheet([
    ['How to fill this template'],
    [],
    ['One row per staff member. Replace the example rows. Use the official university email: the temporary password is sent there.'],
    ['Faculty and department codes are on the "Codes" sheet.'],
    [],
    ['Role (write it as shown)', 'Code also accepted', 'Unit column needed'],
    ...BULK_ROLES.map((r) => [ROLE_LABELS[r], r, unitRule(r)]),
    [],
    ['System Administrator accounts cannot be created from a spreadsheet; the administrator creates them one at a time.'],
    ['Someone who already has an account (same email) is skipped and their account is left unchanged.'],
  ]);
  notes['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, notes, 'Notes');

  const codes = XLSX.utils.aoa_to_sheet([
    ['Faculty', 'Faculty Code', 'Department', 'Department Code'],
    ...departments.map((d) => [d.faculty?.name ?? '', d.faculty?.code ?? '', d.name, d.code]),
    ...faculties.filter((f) => !departments.some((d) => d.faculty?.code === f.code)).map((f) => [f.name, f.code, '', '']),
  ]);
  codes['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 40 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, codes, 'Codes');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export type UserRow = {
  line: number; name: string; email: string; role: Role;
  department?: { id: string; name: string }; faculty?: { id: string; name: string };
};

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const HEADERS: Record<string, (typeof USER_COLUMNS)[number]> = {
  fullname: 'Full Name', name: 'Full Name', staffname: 'Full Name',
  email: 'Email', emailaddress: 'Email', officialemail: 'Email',
  role: 'Role',
  facultycode: 'Faculty Code', faculty: 'Faculty Code',
  departmentcode: 'Department Code', department: 'Department Code', deptcode: 'Department Code',
};

/**
 * Reads and checks the file against the academic structure and existing accounts. Rows for people
 * who already have an account are listed in `existing` and not created.
 */
export async function planUserImport(buf: ArrayBuffer, fileName: string) {
  const errors: CellError[] = [];
  const rows: UserRow[] = [];
  const existing: { line: number; email: string; name: string }[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = /\.csv$/i.test(fileName)
      ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(buf, { type: 'array' });
  } catch {
    return { rows, existing, errors: [{ sheet: '-', row: 0, column: '-', message: 'The file is not a readable Excel or CSV file' }] };
  }
  const sheetName = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
  const index = new Map<string, number>();
  (grid[0] ?? []).forEach((c, i) => {
    const col = HEADERS[roleKey(str(c))];
    if (col && !index.has(col)) index.set(col, i);
  });
  for (const need of ['Full Name', 'Email', 'Role'] as const) {
    if (!index.has(need)) errors.push({ sheet: sheetName, row: 1, column: need, message: `Column "${need}" is missing. Use the template.` });
  }
  if (errors.length) return { rows, existing, errors };
  const body = grid.slice(1);
  if (body.filter((r) => r.some((c) => str(c))).length > MAX_USER_ROWS) {
    return { rows, existing, errors: [{ sheet: sheetName, row: 0, column: '-', message: `At most ${MAX_USER_ROWS} staff per file; split it into smaller files` }] };
  }

  const [faculties, departments, users] = await Promise.all([
    Faculty.find().lean(), Department.find().lean(), User.find().select('email').lean(),
  ]);
  const facBy = new Map(faculties.map((f) => [f.code.toUpperCase(), f]));
  const depBy = new Map(departments.map((d) => [d.code.toUpperCase(), d]));
  const taken = new Set(users.map((u) => u.email.toLowerCase()));
  const seen = new Map<string, number>();

  body.forEach((r, i) => {
    const line = i + 2;
    const cell = (c: string) => str(r[index.get(c) ?? -1]);
    const name = cell('Full Name'), emailRaw = cell('Email').toLowerCase(), roleText = cell('Role');
    const fCode = cell('Faculty Code').toUpperCase(), dCode = cell('Department Code').toUpperCase();
    if (!name && !emailRaw && !roleText) return;
    const err = (column: string, message: string) => errors.push({ sheet: sheetName, row: line, column, message });
    const before = errors.length;

    if (name.length < 3 || name.length > 120) err('Full Name', 'Enter the full name (3–120 characters)');
    const email = z.email().safeParse(emailRaw).success ? emailRaw : null;
    if (!email) err('Email', emailRaw ? `"${emailRaw}" is not a valid email address` : 'Enter the email address');
    else if (seen.has(email)) err('Email', `${email} is already on row ${seen.get(email)} of this file`);
    if (email) seen.set(email, line);

    const role = parseRole(roleText);
    if (!role) err('Role', roleText ? `Unknown role "${roleText}"; see the Notes sheet of the template` : 'Enter the role');
    else if (role === 'SUPER_ADMIN') err('Role', 'System Administrator accounts must be created one at a time on the Users page');

    let department: UserRow['department'], faculty: UserRow['faculty'];
    if (role && DEPT_ROLES.includes(role)) {
      const d = dCode ? depBy.get(dCode) : undefined;
      if (!dCode) err('Department Code', `${ROLE_LABELS[role]} needs the department code`);
      else if (!d) err('Department Code', `No department with code ${dCode}; see the Codes sheet`);
      else {
        department = { id: d._id.toString(), name: d.name };
        const f = faculties.find((x) => x._id.equals(d.faculty));
        if (fCode && f && f.code.toUpperCase() !== fCode) err('Faculty Code', `${d.name} is in ${f.name} (${f.code}), not ${fCode}`);
        if (f) faculty = { id: f._id.toString(), name: f.name };
      }
    } else if (role && FACULTY_ROLES.includes(role)) {
      const f = fCode ? facBy.get(fCode) : undefined;
      if (!fCode) err('Faculty Code', `${ROLE_LABELS[role]} needs the faculty code`);
      else if (!f) err('Faculty Code', `No faculty with code ${fCode}; see the Codes sheet`);
      else faculty = { id: f._id.toString(), name: f.name };
    }

    if (errors.length > before) return;
    if (taken.has(email!)) {
      existing.push({ line, email: email!, name });
      return;
    }
    rows.push({ line, name, email: email!, role: role!, department, faculty });
  });
  if (!rows.length && !existing.length && !errors.length) errors.push({ sheet: sheetName, row: 2, column: '-', message: 'No staff rows found' });
  return { rows, existing, errors };
}
