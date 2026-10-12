export const ROLES = [
  'SUPER_ADMIN', 'PROVOST', 'HEAD_RECORDS', 'TASKFORCE_LEAD', 'INDEXER',
  'QA_REVIEWER', 'DEPT_OFFICER', 'HOD', 'FACULTY_PG', 'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'System Administrator',
  PROVOST: 'Provost, CPGS',
  HEAD_RECORDS: 'Head, Records',
  TASKFORCE_LEAD: 'Taskforce Lead',
  INDEXER: 'Indexer',
  QA_REVIEWER: 'QA Reviewer',
  DEPT_OFFICER: 'Department PG Coordinator',
  HOD: 'Head of Department',
  FACULTY_PG: 'Faculty PG Sub-Dean',
  AUDITOR: 'Internal Auditor',
};

export const PERMISSIONS = {
  'user:manage':        ['SUPER_ADMIN'],
  'structure:manage':   ['SUPER_ADMIN'],
  'record:read':        ['SUPER_ADMIN', 'PROVOST', 'HEAD_RECORDS', 'TASKFORCE_LEAD', 'AUDITOR', 'DEPT_OFFICER', 'HOD', 'FACULTY_PG'],
  'record:read:all':    ['SUPER_ADMIN', 'PROVOST', 'HEAD_RECORDS', 'TASKFORCE_LEAD', 'AUDITOR'],
  'record:export':      ['PROVOST', 'HEAD_RECORDS'],
  'record:lock':        ['HEAD_RECORDS'],
  'legacy:upload':      ['INDEXER', 'TASKFORCE_LEAD'],
  'legacy:qa':          ['QA_REVIEWER', 'HEAD_RECORDS'],
  'batch:assign':       ['TASKFORCE_LEAD', 'HEAD_RECORDS'],
  'digitization:view':  ['TASKFORCE_LEAD', 'HEAD_RECORDS', 'INDEXER', 'QA_REVIEWER', 'PROVOST'],
  'submission:create':  ['DEPT_OFFICER'],
  'submission:approve': ['HOD', 'FACULTY_PG', 'HEAD_RECORDS', 'PROVOST'],
  'amendment:request':  ['HEAD_RECORDS'],
  'amendment:approve':  ['PROVOST'],
  'transcript:issue':   ['HEAD_RECORDS'],
  'audit:read':         ['SUPER_ADMIN', 'AUDITOR', 'PROVOST'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, p: Permission) =>
  (PERMISSIONS[p] as readonly Role[]).includes(role);

/** Roles that only ever see their own department or faculty. */
export const DEPARTMENT_ROLES: readonly Role[] = ['DEPT_OFFICER', 'HOD'];
export const FACULTY_ROLES: readonly Role[] = ['FACULTY_PG'];
