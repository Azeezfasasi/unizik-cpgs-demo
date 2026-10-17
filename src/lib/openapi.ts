/**
 * OpenAPI 3.1 description of the CPGS Results Repository REST API (/api/v1).
 * Served at /api/v1/openapi.json and rendered by Swagger UI at /api-docs.
 */

type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: Json) => ({ type: 'array', items });
const str = (description?: string, extra: Json = {}) => ({ type: 'string', ...(description ? { description } : {}), ...extra });
const num = (description?: string, extra: Json = {}) => ({ type: 'number', ...(description ? { description } : {}), ...extra });
const int = (description?: string, extra: Json = {}) => ({ type: 'integer', ...(description ? { description } : {}), ...extra });
const bool = (description?: string) => ({ type: 'boolean', ...(description ? { description } : {}) });
const id = (description = 'Object id (24 hex characters)') => str(description, { pattern: '^[a-f0-9]{24}$', example: '6acd40af9c18c073359430f0' });
const obj = (properties: Json, required: string[] = [], extra: Json = {}) => ({ type: 'object', properties, ...(required.length ? { required } : {}), ...extra });
const nullable = (s: Json) => ({ anyOf: [s, { type: 'null' }] });

const ID = '6acd40af9c18c073359430f0';
const NOW = '2026-10-13T10:15:00.000Z';

// ---------------------------------------------------------------- reusable pieces

const pathId = (name = 'id', description = 'Resource id') => ({ name, in: 'path', required: true, schema: id(description) });
const query = (name: string, description: string, schema: Json = str()) => ({ name, in: 'query', required: false, description, schema });
const PAGE = [query('page', 'Page number, from 1', int(undefined, { minimum: 1, default: 1 })), query('limit', 'Items per page (max 100)', int(undefined, { minimum: 1, maximum: 100, default: 25 }))];

const jsonBody = (schema: Json, example: Json, description?: string) => ({
  required: true, ...(description ? { description } : {}),
  content: { 'application/json': { schema, example } },
});
const multipartBody = (schema: Json, description: string) => ({
  required: true, description, content: { 'multipart/form-data': { schema } },
});

const ok = (description: string, schema: Json, example?: unknown) => ({
  description, content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});
const dataOf = (schema: Json) => obj({ data: schema });
const listOf = (schema: Json) => obj({ data: arr(schema), meta: ref('PageMeta') });
const actionOk = (dataSchema: Json = nullable({ type: 'object' }), example: Json = {}) => ok('Done', {
  allOf: [ref('ActionResult'), obj({ data: dataSchema })],
}, { ok: true, message: 'Done.', data: null, warnings: [], ...example });

const ERR = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' },
  422: { $ref: '#/components/responses/Unprocessable' },
  429: { $ref: '#/components/responses/RateLimited' },
};
const errs = (...codes: (keyof typeof ERR)[]) => Object.fromEntries(codes.map((c) => [c, ERR[c]]));
const STD = errs(401, 403, 429);

function op(tag: string, summary: string, roles: string, o: Json & { responses: Json }) {
  const { description, ...rest } = o as { description?: string };
  return { tags: [tag], summary, description: `${description ? `${description}\n\n` : ''}**Who can call it:** ${roles}`, ...rest };
}

// ---------------------------------------------------------------- examples

const exFaculty = { id: ID, name: 'Faculty of Physical Sciences', code: 'PHS', createdAt: NOW, updatedAt: NOW, usage: { department: 2 }, deletable: false, usageSummary: '2 departments' };
const exDepartment = { id: ID, name: 'Computer Science', code: 'CSC', faculty: '6acd40af9c18c073359430a1', matricPattern: '^20\\d{8}$', createdAt: NOW, updatedAt: NOW, usage: { programme: 3, 'graduand record': 120 }, deletable: false, usageSummary: '3 programmes, 120 graduand records' };
const exProgramme = { id: ID, name: 'M.Sc. Computer Science', code: 'MSC-CSC', degreeType: 'MSc', department: '6acd40af9c18c073359430a2', createdAt: NOW, updatedAt: NOW, usage: {}, deletable: true, usageSummary: null };
const exSession = { id: ID, label: '2025/2026', startYear: 2025, createdAt: NOW, updatedAt: NOW, usage: {}, deletable: true, usageSummary: null };
const exUser = {
  id: ID, name: 'Ngozi Okafor', email: 'n.okafor@unizik.edu.ng', role: 'HOD', roleLabel: 'Head of Department',
  department: { id: '6acd40af9c18c073359430a2', name: 'Computer Science', code: 'CSC' }, faculty: { id: '6acd40af9c18c073359430a1', name: 'Faculty of Physical Sciences', code: 'PHS' },
  isActive: true, mfaEnabled: true, mustChangePassword: false, failedLogins: 0, lastLoginAt: NOW, lockedOut: false, createdAt: NOW, updatedAt: NOW,
};
const exRecordSummary = {
  id: ID, origin: 'ONLINE', degree: 'M.Sc. Computer Science', cgpa: 4.62, classOfDegree: 'DISTINCTION', locked: true, version: 1,
  thesisTitle: 'Machine learning for crop disease detection', senateApprovalDate: '2026-10-01T00:00:00.000Z',
  semesterGpas: [4.5, 4.7], projectGrade: 5, effectiveDate: '2026-09-24T00:00:00.000Z', boardMeeting: '75th',
  student: { id: '6acd40af9c18c073359430b1', matricNo: '2022447001', surname: 'NWANKWO', otherNames: 'Ijeoma Blessing', sex: 'F' },
  department: { id: '6acd40af9c18c073359430a2', name: 'Computer Science', code: 'CSC' },
  programme: { id: '6acd40af9c18c073359430a3', name: 'M.Sc. Computer Science', code: 'MSC-CSC', degreeType: 'MSc' },
  session: { id: '6acd40af9c18c073359430a4', label: '2024/2025' }, sheet: '6acd40af9c18c073359430c1',
};
const exCourse = { code: 'CSC801', title: 'Advanced Algorithms', units: 3, score: 75, grade: 'A' };
const exRecord = { ...exRecordSummary, supervisor: 'Prof. C. Example', sourcePage: 1, illegible: false, remarks: null, courses: [exCourse], history: [], sheet: { id: '6acd40af9c18c073359430c1', reference: 'CPGS/RS/2026/000003', status: 'SENATE_APPROVED', origin: 'ONLINE' } };
const exSheetRow = { id: '6acd40af9c18c073359430c1', reference: 'CPGS/RS/2026/000003', origin: 'ONLINE', status: 'SUBMITTED', programme: 'M.Sc. Computer Science', department: 'Computer Science', session: '2024/2025', recordCount: 30, statusSince: NOW };
const exApproval = { stage: 'SUBMITTED', action: 'APPROVE', by: '6acd40af9c18c073359430d1', byName: 'Ngozi Okafor', at: NOW, comment: 'Checked against the signed sheet' };
const exFile = { id: '6acd40af9c18c073359430e1', storage: 'cloudinary', originalName: 'msc-csc-2024-2025-signed.pdf', format: 'pdf', bytes: 2481920, pages: 3, sha256: '16dea2ee74c3205abf911d24d8b592ff3502f88ffbe8fb92bd635ab8a5a20b11', purpose: 'SUBMISSION_SCAN', createdAt: NOW };
const exSheet = {
  ...exSheetRow, programme: { id: '6acd40af9c18c073359430a3', name: 'M.Sc. Computer Science', code: 'MSC-CSC', degreeType: 'MSc' },
  department: { id: '6acd40af9c18c073359430a2', name: 'Computer Science', code: 'CSC' }, session: { id: '6acd40af9c18c073359430a4', label: '2024/2025' },
  batch: null, statusLabel: 'Awaiting HOD', nextAction: { role: 'HOD', label: 'HOD review' }, editableByYou: false, rowFingerprint: '7B4C-F2DF',
  approvals: [{ ...exApproval, stage: 'SUBMITTED', action: 'SUBMIT', comment: null }], senateApprovalDate: null,
  files: [exFile], graduands: [{ ...exRecord, history: undefined, sheet: '6acd40af9c18c073359430c1' }], createdAt: NOW, updatedAt: NOW,
};
const exBatch = {
  id: ID, boxCode: 'CRR-BOX-0042', department: { id: '6acd40af9c18c073359430a2', name: 'Computer Science', code: 'CSC' },
  sessions: [{ id: '6acd40af9c18c073359430a4', label: '2015/2016' }], estimatedSheets: 12, condition: 'DAMAGED', priority: 1,
  location: 'Sealed store, shelf A1', notes: 'Rodent damage on outer folders', status: 'IN_PROGRESS',
  indexer: { id: '6acd40af9c18c073359430d2', name: 'Chidi Eze', email: 'c.eze@unizik.edu.ng' }, reviewer: { id: '6acd40af9c18c073359430d3', name: 'Ada Obi', email: 'a.obi@unizik.edu.ng' },
  createdAt: NOW, updatedAt: NOW,
};
const exDocument = {
  id: '6acd40af9c18c073359430f1', kind: 'STATEMENT_OF_RESULT', code: 'JK92-CWEU', recordVersion: 1, issuedTo: 'Federal Ministry of Health',
  issuedBy: { id: '6acd40af9c18c073359430d4', name: 'Head of Records' }, expiresAt: '2027-10-13T10:15:00.000Z', revoked: false, lookups: 0, record: ID,
  createdAt: NOW, verifyUrl: 'https://unizik-cpgs.vercel.app/verify/JK92-CWEU', pdfUrl: '/api/v1/documents/6acd40af9c18c073359430f1/pdf',
};
const exAmendment = {
  id: '6acd40af9c18c073359430f2', record: ID, status: 'PENDING', reason: 'The exams were remarked by the supervisors; see Senate extract.',
  changes: [{ field: 'classOfDegree', from: 'FAIL', to: 'MERIT' }, { field: 'remarks', from: null, to: 'Merit results' }],
  evidence: '6acd40af9c18c073359430e2', requestedBy: { id: '6acd40af9c18c073359430d4', name: 'Head of Records' }, createdAt: NOW,
};
const exAudit = { id: ID, seq: 1042, at: NOW, actor: '6acd40af9c18c073359430d1', actorName: 'Ngozi Okafor [API: Library system]', action: 'sheet.approve', entity: 'ResultSheet', entityId: '6acd40af9c18c073359430c1', before: { status: 'SUBMITTED' }, after: { status: 'HOD_APPROVED', comment: '' }, ip: '102.89.1.10', userAgent: 'curl/8.4', prevHash: '9f1c…', hash: 'a0b3…' };

// ---------------------------------------------------------------- schemas

const ROLE_ENUM = ['SUPER_ADMIN', 'PROVOST', 'HEAD_RECORDS', 'TASKFORCE_LEAD', 'INDEXER', 'QA_REVIEWER', 'DEPT_OFFICER', 'HOD', 'FACULTY_PG', 'AUDITOR'];
const CLASS_ENUM = ['DISTINCTION', 'CREDIT', 'MERIT', 'PASS', 'FAIL', 'NOT_APPLICABLE'];
const STATUS_ENUM = ['DRAFT', 'SUBMITTED', 'HOD_APPROVED', 'FACULTY_APPROVED', 'RECORDS_VERIFIED', 'PROVOST_APPROVED', 'SENATE_APPROVED', 'RETURNED', 'INDEXED', 'QA_PASSED', 'LOCKED'];
const DEGREE_ENUM = ['PGD', 'MA', 'MSc', 'MEd', 'MBA', 'LLM', 'MPhil', 'PhD'];
const PURPOSE_ENUM = ['LEGACY_SCAN', 'SUBMISSION_SCAN', 'AMENDMENT_EVIDENCE'];

const usageProps = { usage: obj({}, [], { additionalProperties: int(), description: 'What still refers to this item, e.g. {"graduand record": 12}' }), deletable: bool('False while anything refers to it'), usageSummary: nullable(str()) };
const ts = { createdAt: str(undefined, { format: 'date-time' }), updatedAt: str(undefined, { format: 'date-time' }) };
const named = obj({ id: id(), name: str(), code: str() });

const schemas: Json = {
  Error: obj({ error: obj({ message: str(), status: int(), errors: arr(ref('CellError')), warnings: arr(str()) }, ['message', 'status']) }, ['error']),
  CellError: obj({ sheet: str('Sheet name in the workbook, or CSV'), row: int('Row number as shown in Excel'), column: str(), message: str() }),
  ActionResult: obj({ ok: bool(), message: nullable(str()), data: nullable({ type: 'object' }), warnings: arr(str()) }, ['ok']),
  PageMeta: obj({ page: int(), limit: int(), total: int(), pages: int() }),
  Faculty: obj({ id: id(), name: str(), code: str(), ...usageProps, ...ts }),
  FacultyInput: obj({ name: str(undefined, { minLength: 3 }), code: str(undefined, { minLength: 2, maxLength: 10 }) }, ['name', 'code']),
  Department: obj({ id: id(), name: str(), code: str(), faculty: id('Faculty id'), matricPattern: nullable(str('Regular expression matric numbers must match')), ...usageProps, ...ts }),
  DepartmentInput: obj({ name: str(), code: str(), faculty: id('Faculty id'), matricPattern: str('Optional regular expression') }, ['name', 'code', 'faculty']),
  Programme: obj({ id: id(), name: str(), code: str(), degreeType: str(undefined, { enum: DEGREE_ENUM }), department: id('Department id'), ...usageProps, ...ts }),
  ProgrammeInput: obj({ name: str(), code: str(), degreeType: str(undefined, { enum: DEGREE_ENUM }), department: id('Department id') }, ['name', 'code', 'degreeType', 'department']),
  Session: obj({ id: id(), label: str(undefined, { example: '2025/2026' }), startYear: int(), ...usageProps, ...ts }),
  SessionInput: obj({ startYear: int('First calendar year, e.g. 2025 for 2025/2026', { minimum: 1960, maximum: 2100 }) }, ['startYear']),
  GradingBands: obj({
    bands: arr(obj({ class: str(undefined, { enum: CLASS_ENUM }), label: str(), minCgpa: num() })),
    official: bool('True once the official table has been saved; false while the provisional defaults apply'),
    updatedAt: nullable(str(undefined, { format: 'date-time' })),
  }),
  GradingBandsInput: obj({ DISTINCTION: num(), CREDIT: num(), MERIT: num(), PASS: num() }, ['DISTINCTION', 'CREDIT', 'MERIT', 'PASS'], { description: 'Minimum CGPA per class; must run DISTINCTION > CREDIT > MERIT > PASS > 0' }),
  User: obj({
    id: id(), name: str(), email: str(undefined, { format: 'email' }), role: str(undefined, { enum: ROLE_ENUM }), roleLabel: str(),
    department: nullable(named), faculty: nullable(named), isActive: bool(), mfaEnabled: bool(), mustChangePassword: bool(),
    failedLogins: int(), lastLoginAt: nullable(str(undefined, { format: 'date-time' })), lockedOut: bool(), ...ts,
  }),
  UserCreate: obj({
    name: str(undefined, { minLength: 3 }), email: str('Official university email', { format: 'email' }), role: str(undefined, { enum: ROLE_ENUM }),
    department: id('Required for HOD and DEPT_OFFICER'), faculty: id('Required for FACULTY_PG'),
  }, ['name', 'email', 'role']),
  UserUpdate: obj({ role: str(undefined, { enum: ROLE_ENUM }), department: nullable(id()), faculty: nullable(id()) }),
  Me: obj({
    id: id(), name: str(), email: str(), role: str(undefined, { enum: ROLE_ENUM }), roleLabel: str(),
    department: nullable(named), faculty: nullable(named),
    permissions: arr(str()), readable: arr(str('Resources this caller may read')),
    apiKey: nullable(obj({ name: str(), keyId: str(), expiresAt: nullable(str()), createdAt: str() })),
  }),
  Student: obj({ id: id(), matricNo: str(), surname: str(), otherNames: str(), sex: nullable(str(undefined, { enum: ['M', 'F'] })) }),
  Course: obj({
    code: str(), title: nullable(str()), units: int(), score: nullable(num()), grade: nullable(str(undefined, { enum: ['A', 'B', 'C', 'D', 'E', 'F'] })),
    semester: nullable(int('Semester the course was taken in', { minimum: 1, maximum: 4 })),
  }),
  RecordSummary: obj({
    id: id(), origin: str(undefined, { enum: ['LEGACY', 'ONLINE'] }), degree: str(), cgpa: nullable(num()), classOfDegree: str(undefined, { enum: CLASS_ENUM }),
    locked: bool(), version: int(), thesisTitle: nullable(str()), senateApprovalDate: nullable(str(undefined, { format: 'date-time' })),
    semesterGpas: { ...arr(num(undefined, { minimum: 0, maximum: 5 })), description: 'GPA per semester in order (1st, 2nd, ...), as on the PG Board result list' },
    projectGrade: nullable(int('Project grade point: 5 = A, 4 = B, 3 = C, 2 = D, 1 = E, 0 = F', { minimum: 0, maximum: 5 })), effectiveDate: nullable(str('Effective date of graduation (WEF)', { format: 'date-time' })),
    boardMeeting: nullable(str('PG Board meeting that considered the result', { example: '63rd' })),
    student: ref('Student'), department: named, programme: obj({ id: id(), name: str(), code: str(), degreeType: str() }), session: obj({ id: id(), label: str() }),
    sheet: { description: 'Result sheet id, or the sheet when expanded', anyOf: [id(), obj({ id: id(), reference: str(), status: str(undefined, { enum: STATUS_ENUM }), origin: str() })] },
  }),
  Record: { allOf: [ref('RecordSummary'), obj({
    supervisor: nullable(str()), sourcePage: nullable(int()), illegible: bool(), remarks: nullable(str()), courses: arr(ref('Course')),
    history: arr(obj({ version: int(), data: { type: 'object' }, amendment: id(), at: str() }, [], { description: 'Earlier versions kept after amendments' })),
  })] },
  SheetSummary: obj({
    id: id(), reference: str(undefined, { example: 'CPGS/RS/2026/000003' }), origin: str(undefined, { enum: ['LEGACY', 'ONLINE'] }), status: str(undefined, { enum: STATUS_ENUM }),
    programme: nullable(str()), department: nullable(str()), session: nullable(str()), recordCount: int(), statusSince: str(undefined, { format: 'date-time' }), boxCode: nullable(str()),
  }),
  Approval: obj({ stage: str(), action: str(undefined, { enum: ['SUBMIT', 'APPROVE', 'RETURN', 'LOCK'] }), by: id(), byName: str(), at: str(undefined, { format: 'date-time' }), comment: nullable(str()) }),
  Sheet: obj({
    id: id(), reference: str(), origin: str(undefined, { enum: ['LEGACY', 'ONLINE'] }), status: str(undefined, { enum: STATUS_ENUM }), statusLabel: str(),
    nextAction: nullable(obj({ role: str(undefined, { enum: ROLE_ENUM }), label: str() })), editableByYou: bool(),
    rowFingerprint: nullable(str('Short hash of the rows printed on the sheet for signing', { example: '7B4C-F2DF' })),
    programme: obj({ id: id(), name: str(), code: str(), degreeType: str() }), department: named, session: obj({ id: id(), label: str() }),
    batch: nullable(obj({ id: id(), boxCode: str() })), approvals: arr(ref('Approval')), senateApprovalDate: nullable(str()), recordCount: int(), statusSince: str(undefined, { format: 'date-time' }),
    files: arr(ref('File')), graduands: arr(ref('Record')), ...ts,
  }),
  SheetCreate: {
    oneOf: [
      obj({ origin: str(undefined, { enum: ['ONLINE'] }), programme: id('Programme in your department'), session: id() }, ['origin', 'programme', 'session'], { title: 'Online submission (Department PG Coordinator)' }),
      obj({ origin: str(undefined, { enum: ['LEGACY'] }), batch: id('Box assigned to you'), programme: id(), session: id() }, ['origin', 'batch', 'programme', 'session'], { title: 'Legacy sheet (Indexer / Taskforce Lead)' }),
    ],
  },
  GraduandRowInput: obj({
    matricNo: str(), surname: str(), otherNames: str(), sex: str(undefined, { enum: ['M', 'F'] }),
    cgpa: num('Final CGPA (FCGPA). Give this or classOfDegree', { minimum: 0, maximum: 5 }),
    classOfDegree: str('Optional: worked out from the CGPA with the grading bands when left out (PhD: NOT_APPLICABLE)', { enum: CLASS_ENUM }),
    semesterGpas: { ...arr(num(undefined, { minimum: 0, maximum: 5 })), maxItems: 4, description: 'GPA per semester in order (1st, 2nd, ...)' },
    projectGrade: int('Project grade point: 5 = A, 4 = B, 3 = C, 2 = D, 1 = E, 0 = F', { minimum: 0, maximum: 5 }),
    effectiveDate: str('Effective date of graduation (WEF), not in the future', { format: 'date' }),
    boardMeeting: str('PG Board meeting, e.g. 63rd'), thesisTitle: str(), supervisor: str(), sourceFile: id('Scan on this sheet the row was read from'),
    sourcePage: int(undefined, { minimum: 1 }), illegible: bool('Flag the row for the Head of Records instead of guessing'), remarks: str(),
    courses: arr(obj({ code: str(), title: str(), units: int(), score: num(), grade: str(), semester: int('1–4, from the semester result sheets', { minimum: 1, maximum: 4 }) }, ['code', 'units'])),
  }, ['matricNo', 'surname', 'otherNames']),
  Batch: obj({
    id: id(), boxCode: str(undefined, { example: 'CRR-BOX-0042' }), department: named, sessions: arr(obj({ id: id(), label: str() })),
    estimatedSheets: int(), condition: str(undefined, { enum: ['GOOD', 'FAIR', 'DAMAGED', 'SEVERELY_DAMAGED'] }), priority: int('1 = most urgent', { minimum: 1, maximum: 5 }),
    location: nullable(str()), notes: nullable(str()), status: str(undefined, { enum: ['INVENTORIED', 'IN_PROGRESS', 'COMPLETED'] }),
    indexer: nullable(obj({ id: id(), name: str(), email: str() })), reviewer: nullable(obj({ id: id(), name: str(), email: str() })), ...ts,
  }),
  BatchCreate: obj({
    boxCode: str('Format CRR-BOX-0001', { pattern: '^CRR-BOX-\\d{4,}$' }), department: id(), sessions: arr(id()), estimatedSheets: int(undefined, { minimum: 0 }),
    condition: str(undefined, { enum: ['GOOD', 'FAIR', 'DAMAGED', 'SEVERELY_DAMAGED'] }), priority: int(undefined, { minimum: 1, maximum: 5 }), location: str(), notes: str(),
  }, ['boxCode', 'department', 'sessions', 'estimatedSheets', 'condition', 'priority']),
  File: obj({
    id: id(), storage: str(undefined, { enum: ['cloudinary', 'local'] }), originalName: str(), format: str(undefined, { enum: ['pdf', 'jpg', 'png'] }),
    bytes: int(), pages: nullable(int()), sha256: str('SHA-256 recorded at upload'), purpose: str(undefined, { enum: PURPOSE_ENUM }),
    department: nullable(named), uploadedBy: nullable(obj({ id: id(), name: str() })), backedUpAt: nullable(str()), createdAt: str(),
  }),
  FileAttachments: obj({
    sheets: arr(obj({ id: id(), reference: str(), status: str() })), records: int('Graduand rows read from this file'),
    amendments: arr(obj({ id: id(), status: str(), record: id() })),
  }),
  Document: obj({
    id: id(), kind: str(undefined, { enum: ['STATEMENT_OF_RESULT', 'TRANSCRIPT'] }), code: str(undefined, { example: 'JK92-CWEU' }), recordVersion: int(),
    issuedTo: str(), issuedBy: obj({ id: id(), name: str() }), expiresAt: str(), revoked: bool(), revokedAt: nullable(str()), revokedReason: nullable(str()),
    lookups: int('Times checked on the verification page'), record: id(), createdAt: str(), verifyUrl: str(), pdfUrl: str(),
  }),
  DocumentIssue: obj({
    kind: str(undefined, { enum: ['STATEMENT_OF_RESULT', 'TRANSCRIPT'] }), issuedTo: str('Who the document is for', { minLength: 3 }),
    validDays: int(undefined, { enum: [90, 365, 1825] }), email: str("Optional: the graduand's email", { format: 'email' }),
    recipients: { ...arr(str(undefined, { format: 'email' })), maxItems: 10, description: 'Optional: other addresses (employers, institutions). Each gets its own email with the PDF attached, a download link and the verification code' },
  }, ['kind', 'issuedTo', 'validDays']),
  EmailResult: obj({ ok: bool(), message: str(undefined, { example: 'Emailed to hr@employer.com, admissions@university.edu.' }), data: { type: 'null' }, warnings: arr(str('Addresses that could not be sent to, with the reason')) }),
  Amendment: obj({
    id: id(), record: id(), status: str(undefined, { enum: ['PENDING', 'APPROVED', 'REJECTED'] }), reason: str(),
    changes: arr(obj({ field: str(), from: {}, to: {} })), evidence: id('Evidence file id'),
    requestedBy: obj({ id: id(), name: str() }), decidedBy: nullable(obj({ id: id(), name: str() })), decidedAt: nullable(str()), decisionComment: nullable(str()), createdAt: str(),
  }),
  AmendmentRequest: obj({
    cgpa: num(), classOfDegree: str(undefined, { enum: CLASS_ENUM }), thesisTitle: str(), supervisor: str(), senateApprovalDate: str(undefined, { format: 'date' }), remarks: str(),
    projectGrade: int('Project grade point: 5 = A, 4 = B, 3 = C, 2 = D, 1 = E, 0 = F', { minimum: 0, maximum: 5 }), effectiveDate: str('Effective date of graduation (WEF)', { format: 'date' }), boardMeeting: str(),
    reason: str(undefined, { minLength: 10 }), evidence: id('Id of a file uploaded with purpose AMENDMENT_EVIDENCE'),
  }, ['reason', 'evidence'], { description: 'Send only the fields that change, plus reason and evidence' }),
  AuditEntry: obj({
    id: id(), seq: int(), at: str(undefined, { format: 'date-time' }), actor: nullable(id()), actorName: nullable(str()), action: str(), entity: nullable(str()), entityId: nullable(str()),
    before: {}, after: {}, ip: nullable(str()), userAgent: nullable(str()), prevHash: str(), hash: str(),
  }),
  Stats: obj({
    records: obj({ total: int(), locked: int(), legacy: int(), online: int() }),
    graduandsBySession: arr(obj({ session: nullable(str()), count: int() })),
    sheetsByStatus: arr(obj({ origin: str(), status: str(), count: int() })),
    waitingForYou: obj({ approvals: int(), qa: int(), amendments: int(), returned: int(), toLock: int() }),
  }),
  VerifyResult: obj({
    status: str(undefined, { enum: ['VALID', 'REVOKED', 'EXPIRED', 'SUPERSEDED'] }), code: str(), kind: str(), name: str(), degree: str(), classOfDegree: str(),
    session: str(), senateApprovalDate: nullable(str()), issuedAt: str(), expiresAt: str(), revokedAt: nullable(str()),
  }),
};

// ---------------------------------------------------------------- paths

const structure = (tag: string, plural: string, schema: string, input: string, example: Json, createEx: Json, filters: Json[] = []) => ({
  [`/${plural}`]: {
    get: op(tag, `List ${plural}`, 'any authenticated caller', {
      parameters: filters, responses: { 200: ok('List', dataOf(arr(ref(schema))), { data: [example] }), ...STD },
    }),
    post: op(tag, `Create a ${tag.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')}`, 'System Administrator', {
      requestBody: jsonBody(ref(input), createEx),
      responses: { 201: actionOk(ref(schema), { message: 'Added.', data: example }), ...errs(401, 403, 422, 429) },
    }),
  },
  [`/${plural}/{id}`]: {
    parameters: [pathId()],
    get: op(tag, 'Get one', 'any authenticated caller', { responses: { 200: ok('Item', dataOf(ref(schema)), { data: example }), ...errs(401, 404, 429) } }),
    patch: op(tag, 'Update (partial)', 'System Administrator', {
      description: 'Send only the fields to change; the others keep their current values. The same protections as the portal apply (see the field descriptions).',
      requestBody: jsonBody({ type: 'object', description: 'Any subset of the fields', properties: (schemas[input] as { properties: Json }).properties }, Object.fromEntries(Object.entries(createEx).slice(0, 1))),
      responses: { 200: actionOk(ref(schema), { message: 'Updated.', data: example }), ...errs(401, 403, 404, 422, 429) },
    }),
    delete: op(tag, 'Delete', 'System Administrator', {
      description: 'Refused with 422 while anything still refers to the item (usageSummary explains what).',
      responses: { 200: actionOk(), ...errs(401, 403, 404, 422, 429) },
    }),
  },
});

const sheetAction = (summary: string, roles: string, description: string, body?: Json, example?: Json) => ({
  post: op('Result sheets', summary, roles, {
    description, parameters: [pathId('id', 'Sheet id')],
    ...(body ? { requestBody: jsonBody(body, example ?? {}) } : {}),
    responses: { 200: actionOk(), ...errs(401, 403, 404, 422, 429) },
  }),
});

const paths: Json = {
  // System
  '/health': { get: { tags: ['System'], summary: 'Service health', description: 'No API key needed.', security: [], responses: { 200: ok('Healthy', obj({ ok: bool(), storage: str(undefined, { enum: ['cloudinary', 'local', 'unconfigured'] }), time: str() }), { ok: true, storage: 'cloudinary', time: NOW }), 503: ok('Database unreachable', obj({ ok: bool() }), { ok: false }) } } },
  '/openapi.json': { get: { tags: ['System'], summary: 'This OpenAPI description', security: [], responses: { 200: { description: 'OpenAPI 3.1 document' } } } },
  '/me': { get: op('System', 'The account this key acts as', 'any API key', { responses: { 200: ok('Account, role and permissions', dataOf(ref('Me')), { data: { id: ID, name: 'Ngozi Okafor', email: 'n.okafor@unizik.edu.ng', role: 'HOD', roleLabel: 'Head of Department', department: { id: '6acd40af9c18c073359430a2', name: 'Computer Science', code: 'CSC' }, faculty: null, permissions: ['record:read', 'submission:approve'], readable: ['record:read', 'submission:approve'], apiKey: { name: 'Departmental dashboard', keyId: 'Ab3dE5gH9k', expiresAt: null, createdAt: NOW } } }), ...STD } }) },
  '/stats': { get: op('System', 'Dashboard statistics', 'any API key; figures are limited to the caller\'s department or faculty', { responses: { 200: ok('Statistics', dataOf(ref('Stats')), { data: { records: { total: 1240, locked: 1180, legacy: 900, online: 340 }, graduandsBySession: [{ session: '2024/2025', count: 340 }], sheetsByStatus: [{ origin: 'ONLINE', status: 'SUBMITTED', count: 2 }], waitingForYou: { approvals: 2, qa: 0, amendments: 0, returned: 0, toLock: 0 } } }), ...STD } }) },

  // Verification
  '/verify/{code}': { get: { tags: ['Verification'], summary: 'Verify an issued statement or transcript', description: 'Public, no API key. Rate-limited to 30 checks per minute per IP. Never returns scores, scans or contact details.', security: [], parameters: [{ name: 'code', in: 'path', required: true, schema: str('8 characters, with or without the dash', { example: 'JK92-CWEU' }) }], responses: {
    200: ok('Document found', dataOf(ref('VerifyResult')), { data: { status: 'VALID', code: 'JK92-CWEU', kind: 'Statement of result', name: 'NWANKWO, Ijeoma Blessing', degree: 'M.Sc. Computer Science', classOfDegree: 'Distinction', session: '2024/2025', senateApprovalDate: '2026-10-01T00:00:00.000Z', issuedAt: NOW, expiresAt: '2027-10-13T10:15:00.000Z', revokedAt: null } }),
    400: { description: 'Malformed code', content: { 'application/json': { schema: ref('Error') } } }, 404: { description: 'No such document', content: { 'application/json': { schema: ref('Error') } } }, 429: ERR[429],
  } } },

  // Structure
  ...structure('Faculties', 'faculties', 'Faculty', 'FacultyInput', exFaculty, { name: 'Faculty of Physical Sciences', code: 'PHS' }),
  ...structure('Departments', 'departments', 'Department', 'DepartmentInput', exDepartment, { name: 'Computer Science', code: 'CSC', faculty: '6acd40af9c18c073359430a1', matricPattern: '^20\\d{8}$' }, [query('faculty', 'Only departments in this faculty', id())]),
  ...structure('Programmes', 'programmes', 'Programme', 'ProgrammeInput', exProgramme, { name: 'M.Sc. Computer Science', code: 'MSC-CSC', degreeType: 'MSc', department: '6acd40af9c18c073359430a2' }, [query('department', 'Only programmes in this department', id())]),
  ...structure('Sessions', 'sessions', 'Session', 'SessionInput', exSession, { startYear: 2025 }),
  '/grading-bands': {
    get: op('Grading bands', 'Class-of-degree bands', 'any authenticated caller', { responses: { 200: ok('Bands in force', dataOf(ref('GradingBands')), { data: { bands: [{ class: 'DISTINCTION', label: 'Distinction', minCgpa: 4.5 }, { class: 'CREDIT', label: 'Credit', minCgpa: 3.5 }, { class: 'MERIT', label: 'Merit', minCgpa: 3 }, { class: 'PASS', label: 'Pass', minCgpa: 2.5 }, { class: 'FAIL', label: 'Fail', minCgpa: 0 }], official: false, updatedAt: null } }), ...STD } }),
    put: op('Grading bands', 'Save the official bands', 'System Administrator', { requestBody: jsonBody(ref('GradingBandsInput'), { DISTINCTION: 4.5, CREDIT: 3.5, MERIT: 3.0, PASS: 2.5 }), responses: { 200: actionOk(ref('GradingBands'), { message: 'Grading bands saved. Indexing and submission checks use them from now on.', data: { bands: [{ class: 'DISTINCTION', label: 'Distinction', minCgpa: 4.5 }, { class: 'CREDIT', label: 'Credit', minCgpa: 3.5 }, { class: 'MERIT', label: 'Merit', minCgpa: 3 }, { class: 'PASS', label: 'Pass', minCgpa: 2.5 }, { class: 'FAIL', label: 'Fail', minCgpa: 0 }], official: true, updatedAt: NOW } }), ...errs(401, 403, 422, 429) } }),
  },

  // Users
  '/users': {
    get: op('Users', 'List staff accounts', 'System Administrator', {
      parameters: [query('q', 'Name or email contains'), query('role', 'Role', str(undefined, { enum: ROLE_ENUM })), query('faculty', 'Faculty staff and department staff in that faculty', id()), query('department', 'Department', id()), query('status', 'Account status', str(undefined, { enum: ['active', 'inactive'] })), query('security', 'Security state', str(undefined, { enum: ['mfa_on', 'mfa_off', 'temp_password', 'locked', 'never'] })), ...PAGE],
      responses: { 200: ok('Accounts', listOf(ref('User')), { data: [exUser], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD },
    }),
    post: op('Users', 'Create a staff account', 'System Administrator', {
      description: 'The temporary password is returned once and also emailed to the user, who must change it at first sign-in.',
      requestBody: jsonBody(ref('UserCreate'), { name: 'Ngozi Okafor', email: 'n.okafor@unizik.edu.ng', role: 'HOD', department: '6acd40af9c18c073359430a2' }),
      responses: { 201: actionOk(obj({ user: ref('User'), temporaryPassword: str() }), { message: 'Account created for n.okafor@unizik.edu.ng.', data: { user: exUser, temporaryPassword: 'Xk3pQ9mT2vLw7aA7' } }), 409: { description: 'Email already in use', content: { 'application/json': { schema: ref('Error') } } }, ...errs(401, 403, 422, 429) },
    }),
  },
  '/users/{id}': {
    parameters: [pathId('id', 'User id')],
    get: op('Users', 'Get a staff account', 'System Administrator', { responses: { 200: ok('Account', dataOf(ref('User')), { data: exUser }), ...errs(401, 403, 404, 429) } }),
    patch: op('Users', 'Change role or unit', 'System Administrator', { requestBody: jsonBody(ref('UserUpdate'), { role: 'FACULTY_PG', faculty: '6acd40af9c18c073359430a1' }), responses: { 200: actionOk(ref('User'), { message: 'Saved.', data: exUser }), ...errs(401, 403, 404, 422, 429) } }),
  },
  ...Object.fromEntries(([
    ['activate', 'Reactivate an account', actionOk()],
    ['deactivate', 'Deactivate an account (signed out immediately)', actionOk()],
    ['reset-password', 'Issue a new temporary password (returned once)', actionOk(obj({ temporaryPassword: str() }), { data: { temporaryPassword: 'Pq8sV2nX6cRt4aA7' } })],
    ['reset-mfa', 'Remove the authenticator (enrol again at next sign-in)', actionOk()],
  ] as const).map(([a, summary, res]) => [`/users/{id}/${a}`, { post: op('Users', summary, 'System Administrator', { parameters: [pathId('id', 'User id')], responses: { 200: res, ...errs(401, 403, 404, 422, 429) } }) }])),

  // Records
  '/records': { get: op('Records', 'Search graduand records', 'roles with record access; department and faculty roles see only their unit', {
    parameters: [query('q', 'Matric number (prefix), name words or thesis title words'), query('faculty', 'Faculty', id()), query('department', 'Department', id()), query('programme', 'Programme', id()), query('session', 'Session', id()), query('cls', 'Class of degree', str(undefined, { enum: CLASS_ENUM })), query('origin', 'Origin', str(undefined, { enum: ['LEGACY', 'ONLINE'] })), query('locked', '1 = final only, 0 = in progress only', str(undefined, { enum: ['1', '0'] })), ...PAGE],
    responses: { 200: ok('Matching records', listOf(ref('RecordSummary')), { data: [exRecordSummary], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD },
  }) },
  '/records/export': { get: op('Records', 'Export a search as CSV', 'Provost, Head of Records, System Administrator', {
    description: 'Same query parameters as GET /records (without paging); up to 20,000 rows. Audited.',
    responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: str(), example: 'Matric No,Surname,Other Names,Sex,Degree,Department,Session,CGPA,Class of Degree,Thesis Title,Senate Approval,Origin,Locked,Version\r\n2022447001,NWANKWO,Ijeoma Blessing,F,M.Sc. Computer Science,Computer Science,2024/2025,4.62,Distinction,Federated learning…,2026-10-01,ONLINE,Yes,1' } } }, ...STD },
  }) },
  '/records/{id}': { get: op('Records', 'Get a graduand record', 'roles with record access, within their unit', { parameters: [pathId('id', 'Record id')], responses: { 200: ok('Record', dataOf(ref('Record')), { data: exRecord }), ...errs(401, 403, 404, 429) } }) },
  '/records/{id}/documents': {
    parameters: [pathId('id', 'Record id')],
    get: op('Documents', 'Documents issued for a record', 'Head of Records, Provost, Auditor, System Administrator', { responses: { 200: ok('Documents', dataOf(arr(ref('Document'))), { data: [exDocument] }), ...STD } }),
    post: op('Documents', 'Issue a statement of result or transcript', 'Head of Records, System Administrator', {
      description: 'Only for locked (final) records that are not flagged illegible. Returns the verification code; the PDF is at pdfUrl.',
      requestBody: jsonBody(ref('DocumentIssue'), { kind: 'STATEMENT_OF_RESULT', issuedTo: 'Federal Ministry of Health', validDays: 365, email: 'graduand@example.com', recipients: ['hr@health.gov.ng'] }),
      responses: { 201: actionOk(ref('Document'), { message: 'Issued with verification code JK92-CWEU.', data: exDocument }), ...errs(401, 403, 404, 422, 429) },
    }),
  },
  '/records/{id}/amendments': {
    parameters: [pathId('id', 'Record id')],
    get: op('Amendments', 'Amendments for a record', 'Head of Records, Provost, Auditor, System Administrator', { responses: { 200: ok('Amendments', dataOf(arr(ref('Amendment'))), { data: [exAmendment] }), ...STD } }),
    post: op('Amendments', 'Request a correction to a locked record', 'Head of Records', {
      description: 'Upload the evidence first with POST /files (purpose AMENDMENT_EVIDENCE, recordId) and pass its id. One pending amendment per record.',
      requestBody: jsonBody(ref('AmendmentRequest'), { classOfDegree: 'MERIT', remarks: 'Merit results', reason: 'The exams were remarked by the supervisors; see Senate extract.', evidence: '6acd40af9c18c073359430e2' }),
      responses: { 201: actionOk(ref('Amendment'), { message: 'Amendment sent to the Provost for approval.', data: exAmendment }), ...errs(401, 403, 404, 422, 429) },
    }),
  },

  // Sheets
  '/sheets': {
    get: op('Result sheets', 'List result sheets', 'any API key; limited to sheets the caller may view', {
      parameters: [query('origin', 'Origin', str(undefined, { enum: ['LEGACY', 'ONLINE'] })), query('status', 'Status', str(undefined, { enum: STATUS_ENUM })), query('department', 'Department', id()), query('session', 'Session', id()), query('programme', 'Programme', id()), query('batch', 'Box', id()), ...PAGE],
      responses: { 200: ok('Sheets', listOf(ref('SheetSummary')), { data: [exSheetRow], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD },
    }),
    post: op('Result sheets', 'Create a result sheet', 'Department PG Coordinator (online); Indexer assigned to the box, or Taskforce Lead (legacy)', {
      requestBody: { required: true, content: { 'application/json': { schema: ref('SheetCreate'), examples: { online: { summary: 'Online submission', value: { origin: 'ONLINE', programme: '6acd40af9c18c073359430a3', session: '6acd40af9c18c073359430a4' } }, legacy: { summary: 'Legacy sheet from a box', value: { origin: 'LEGACY', batch: '6acd40af9c18c073359430b9', programme: '6acd40af9c18c073359430a3', session: '6acd40af9c18c073359430a4' } } } } } },
      responses: { 201: ok('Created', obj({ ok: bool(), data: obj({ id: id(), reference: str(), status: str(), origin: str() }) }), { ok: true, data: { id: '6acd40af9c18c073359430c1', reference: 'CPGS/RS/2026/000004', status: 'DRAFT', origin: 'ONLINE' } }), ...errs(401, 403, 422, 429) },
    }),
  },
  '/sheets/{id}': { get: op('Result sheets', 'Get a sheet with rows, scans and history', 'any API key that may view the sheet', { parameters: [pathId('id', 'Sheet id')], responses: { 200: ok('Sheet', dataOf(ref('Sheet')), { data: exSheet }), ...errs(401, 404, 429) } }) },
  '/sheets/{id}/workbook': { post: op('Result sheets', 'Upload the filled template (online)', 'Department PG Coordinator (draft or returned sheet)', {
    description: 'Excel (.xlsx) or CSV. Every cell is validated; if any problem is found nothing is saved and errors lists each one. Replaces all rows.',
    parameters: [pathId('id', 'Sheet id')], requestBody: multipartBody(obj({ file: str('Filled CRR template', { format: 'binary' }) }, ['file']), 'The filled template'),
    responses: { 200: actionOk(undefined, { message: '30 graduand row(s) saved from results.xlsx.', warnings: ['2022447002: CGPA 3.20 normally gives Merit, not Credit'] }), 422: { description: 'Validation failed; nothing saved', content: { 'application/json': { schema: ref('Error'), example: { error: { message: '2 problem(s) found. Nothing was saved.', status: 422, errors: [{ sheet: 'Graduands', row: 3, column: 'CGPA', message: 'CGPA must be 0–5' }, { sheet: 'Graduands', row: 3, column: 'Class of Degree', message: 'Class must be one of DISTINCTION, CREDIT, MERIT, PASS, FAIL, NOT_APPLICABLE' }] } } } } }, ...errs(401, 403, 404, 429) },
  }) },
  '/sheets/{id}/import': { post: op('Result sheets', 'Import rows from a spreadsheet (legacy)', 'Indexer assigned to the box, or Taskforce Lead', {
    description: 'Excel or CSV with optional Source Page, Illegible (Y/N) and Remarks columns. All-or-nothing; matching matric numbers are updated, new ones added, none deleted.',
    parameters: [pathId('id', 'Sheet id')], requestBody: multipartBody(obj({ file: str('Filled template', { format: 'binary' }), sourceFile: id('Scan the rows were read from (defaults to the only scan)') }, ['file']), 'The filled template'),
    responses: { 200: actionOk(undefined, { message: '30 row(s) imported from box42.csv: 28 added, 2 updated, 1 flagged illegible. Check them against the scan, then send the sheet to QA.' }), 422: ERR[422], ...errs(401, 403, 404, 429) },
  }) },
  '/sheets/{id}/rows': { put: op('Result sheets', 'Add or update one graduand row (legacy)', 'Indexer assigned to the box, or Taskforce Lead', {
    description: 'Matched by matric number. The same checks as the portal form; CGPA/class mismatches come back as warnings.',
    parameters: [pathId('id', 'Sheet id')],
    requestBody: jsonBody(ref('GraduandRowInput'), { matricNo: '2014247001', surname: 'OKONKWO', otherNames: 'Chiamaka Grace', sex: 'F', cgpa: 4.28, semesterGpas: [3.9, 4.45], projectGrade: 5, effectiveDate: '2014-03-13', boardMeeting: '63rd', thesisTitle: 'Adoption of improved cassava technologies', supervisor: 'Prof. A. N. Example', sourceFile: '6acd40af9c18c073359430e1', sourcePage: 1, illegible: false, courses: [{ code: 'AEX801', title: 'Research Methods', units: 3, score: 72, grade: 'A', semester: 1 }] }),
    responses: { 200: actionOk(undefined, { message: '2014247001 saved.' }), ...errs(401, 403, 404, 422, 429) },
  }) },
  '/sheets/{id}/rows/{recordId}': { delete: op('Result sheets', 'Delete a graduand row', 'the editor of an editable sheet', { parameters: [pathId('id', 'Sheet id'), pathId('recordId', 'Row (record) id')], responses: { 200: actionOk(), ...errs(401, 403, 404, 422, 429) } }) },
  '/sheets/{id}/files': { post: op('Result sheets', 'Upload and attach a scan', 'the editor of an editable sheet', {
    description: 'PDF, JPG or PNG. The real file type is checked and its SHA-256 recorded. Request bodies are limited to about 4 MB on the hosted service; larger scans should be uploaded in the portal.',
    parameters: [pathId('id', 'Sheet id')], requestBody: multipartBody(obj({ file: str('Scan', { format: 'binary' }) }, ['file']), 'The scan'),
    responses: { 201: actionOk(ref('File'), { message: 'Scan uploaded and attached.', data: exFile }), ...errs(401, 403, 404, 422, 429) },
  }) },
  '/sheets/{id}/files/{fileId}': { delete: op('Result sheets', 'Detach a scan', 'the editor of an editable sheet', { description: 'Refused while rows are linked to the scan.', parameters: [pathId('id', 'Sheet id'), pathId('fileId', 'File id')], responses: { 200: actionOk(), ...errs(401, 403, 404, 422, 429) } }) },
  '/sheets/{id}/submit': sheetAction('Submit for approval (online)', 'Department PG Coordinator', 'Requires rows and an attached signed scan, and attest: true.', obj({ attest: bool('Confirms the rows match the signed and stamped result sheet') }, ['attest']), { attest: true }),
  '/sheets/{id}/decision': sheetAction('Approve or return (online)', 'the officer at the sheet\'s current stage: HOD → Faculty PG Sub-Dean → Head of Records → Provost → Head of Records (Senate date)', 'A comment is required to return. At the final stage, senateDate (YYYY-MM-DD, not in the future) is required and approving locks every record.', obj({ decision: str(undefined, { enum: ['approve', 'return'] }), comment: str(), senateDate: str(undefined, { format: 'date' }) }, ['decision']), { decision: 'approve', comment: 'Checked against the signed sheet' }),
  '/sheets/{id}/send-to-qa': sheetAction('Indexing complete: send to QA (legacy)', 'Indexer assigned to the box, or Taskforce Lead', 'Requires at least one row and an attached scan.'),
  '/sheets/{id}/qa': sheetAction('Pass or return QA (legacy)', 'QA Reviewer assigned to the box, or Head of Records; never the sheet\'s indexer', 'Passing requires attest: true; returning requires a comment.', obj({ decision: str(undefined, { enum: ['pass', 'return'] }), comment: str(), attest: bool('Confirms every row was compared with the scan') }, ['decision']), { decision: 'pass', attest: true }),
  '/sheets/{id}/lock': sheetAction('Verify and lock (legacy)', 'Head of Records', 'Only QA-passed sheets. If rows are flagged illegible, acceptIllegible: true is required.', obj({ comment: str(), acceptIllegible: bool() }), { comment: 'Spot-checked 10 rows' }),
  '/sheets/{id}/return': sheetAction('Return a QA-passed sheet to the taskforce (legacy)', 'Head of Records', 'A comment is required.', obj({ comment: str(undefined, { minLength: 5 }) }, ['comment']), { comment: 'Page 2 CGPA misread for 2014247003' }),
  '/sheets/{id}/signing-sheet': { get: op('Result sheets', 'PDF for signing / certified transcription', 'any API key that may view the sheet', { description: 'Online sheets: the department result sheet for signing and stamping. Legacy sheets: the certified transcription. The footer carries the row fingerprint.', parameters: [pathId('id', 'Sheet id')], responses: { 200: { description: 'PDF', content: { 'application/pdf': { schema: str(undefined, { format: 'binary' }) } } }, 400: { description: 'The sheet has no rows yet', content: { 'application/json': { schema: ref('Error') } } }, ...errs(401, 403, 404, 429) } }) },
  '/sheets/{id}/template': { get: op('Result sheets', 'Download the result template', 'Department PG Coordinator, Indexer, Taskforce Lead', { description: 'Legacy sheets get the indexing variant with Source Page, Illegible and Remarks columns.', parameters: [pathId('id', 'Sheet id'), query('format', 'csv for a CSV file; Excel otherwise', str(undefined, { enum: ['csv'] }))], responses: { 200: { description: 'Template', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: str(undefined, { format: 'binary' }) }, 'text/csv': { schema: str(), example: 'Matric No,Surname,Other Names,Sex (M/F),CGPA,Class of Degree,Thesis Title,Supervisor' } } }, ...errs(401, 403, 404, 429) } }) },

  // Boxes
  '/batches': {
    get: op('Digitization boxes', 'List archive boxes', 'Taskforce, Head of Records, Provost, System Administrator (Indexers and QA Reviewers see their own)', { parameters: [query('status', 'Status', str(undefined, { enum: ['INVENTORIED', 'IN_PROGRESS', 'COMPLETED'] })), query('department', 'Department', id()), ...PAGE], responses: { 200: ok('Boxes', listOf(ref('Batch')), { data: [exBatch], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD } }),
    post: op('Digitization boxes', 'Inventory a box', 'Taskforce Lead, Head of Records, System Administrator', { requestBody: jsonBody(ref('BatchCreate'), { boxCode: 'CRR-BOX-0042', department: '6acd40af9c18c073359430a2', sessions: ['6acd40af9c18c073359430a4'], estimatedSheets: 12, condition: 'DAMAGED', priority: 1, location: 'Sealed store, shelf A1', notes: 'Rodent damage on outer folders' }), responses: { 201: actionOk(ref('Batch'), { data: exBatch }), ...errs(401, 403, 422, 429) } }),
  },
  '/batches/{id}': { get: op('Digitization boxes', 'Get a box with its sheets', 'as for listing', { parameters: [pathId('id', 'Box id')], responses: { 200: ok('Box', dataOf({ allOf: [ref('Batch'), obj({ sheets: arr(ref('SheetSummary')) })] }), { data: { ...exBatch, sheets: [{ ...exSheetRow, origin: 'LEGACY', status: 'INDEXED', boxCode: 'CRR-BOX-0042' }] } }), ...errs(401, 403, 404, 429) } }) },
  '/batches/{id}/assignments': { put: op('Digitization boxes', 'Assign indexer and QA reviewer', 'Taskforce Lead, Head of Records, System Administrator', { description: 'The indexer must hold the Indexer or Taskforce Lead role; the reviewer QA Reviewer or Head of Records. They must be different people.', parameters: [pathId('id', 'Box id')], requestBody: jsonBody(obj({ indexer: nullable(id()), reviewer: nullable(id()) }), { indexer: '6acd40af9c18c073359430d2', reviewer: '6acd40af9c18c073359430d3' }), responses: { 200: actionOk(undefined, { message: 'Assignments saved.' }), ...errs(401, 403, 404, 422, 429) } }) },
  '/batches/{id}/status': { put: op('Digitization boxes', 'Change box status', 'Taskforce Lead, Head of Records, System Administrator', { description: 'COMPLETED is refused until every sheet in the box is locked.', parameters: [pathId('id', 'Box id')], requestBody: jsonBody(obj({ status: str(undefined, { enum: ['INVENTORIED', 'IN_PROGRESS', 'COMPLETED'] }) }, ['status']), { status: 'IN_PROGRESS' }), responses: { 200: actionOk(), ...errs(401, 403, 404, 422, 429) } }) },

  // Files
  '/files': {
    get: op('Files', 'Search the file register', 'System Administrator, Head of Records, Provost, Auditor', { parameters: [query('q', 'File name, storage path or checksum prefix'), query('purpose', 'Purpose', str(undefined, { enum: PURPOSE_ENUM })), query('department', 'Department', id()), query('linked', 'Attached to anything?', str(undefined, { enum: ['yes', 'no'] })), ...PAGE], responses: { 200: ok('Files', listOf({ allOf: [ref('File'), obj({ attachedTo: ref('FileAttachments'), linked: bool() })] }), { data: [{ ...exFile, attachedTo: { sheets: [{ id: '6acd40af9c18c073359430c1', reference: 'CPGS/RS/2026/000003', status: 'SUBMITTED' }], records: 0, amendments: [] }, linked: true }], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD } }),
    post: op('Files', 'Upload a file without attaching it', 'Indexer, Taskforce Lead, PG Coordinator, Head of Records (amendment evidence)', { description: 'Mainly for amendment evidence (purpose AMENDMENT_EVIDENCE with recordId). For sheet scans use POST /sheets/{id}/files. About 4 MB request limit on the hosted service.', requestBody: multipartBody(obj({ file: str(undefined, { format: 'binary' }), purpose: str(undefined, { enum: PURPOSE_ENUM }), sheetId: id(), recordId: id() }, ['file', 'purpose']), 'The file and where it belongs'), responses: { 201: actionOk(ref('File'), { data: { ...exFile, purpose: 'AMENDMENT_EVIDENCE' } }), ...errs(401, 403, 422, 429) } }),
  },
  '/files/{id}': {
    parameters: [pathId('id', 'File id')],
    get: op('Files', 'File details and attachments', 'anyone who may open the file', { responses: { 200: ok('File', dataOf({ allOf: [ref('File'), obj({ attachedTo: ref('FileAttachments'), linked: bool(), contentUrl: str() })] }), { data: { ...exFile, attachedTo: { sheets: [], records: 0, amendments: [] }, linked: false, contentUrl: '/api/v1/files/6acd40af9c18c073359430e1/content' } }), ...errs(401, 404, 429) } }),
    delete: op('Files', 'Delete an unlinked file', 'System Administrator', { description: 'Refused for files attached to a sheet, record or amendment (legal sources).', requestBody: jsonBody(obj({ reason: str(undefined, { minLength: 5 }) }, ['reason']), { reason: 'Duplicate upload' }), responses: { 200: actionOk(undefined, { message: 'scan.pdf deleted.' }), ...errs(401, 403, 404, 422, 429) } }),
  },
  '/files/{id}/url': { get: op('Files', 'Signed 5-minute link to the file', 'anyone who may open the file', { description: 'Audited as file.view.', parameters: [pathId('id', 'File id')], responses: { 200: ok('Link', dataOf(obj({ url: str(), format: str(), expiresIn: int() })), { data: { url: 'https://unizik-cpgs.vercel.app/api/files/6acd40af9c18c073359430e1/raw?exp=1791900000&token=…', format: 'pdf', expiresIn: 300 } }), 410: { description: 'File lost before permanent storage was configured', content: { 'application/json': { schema: ref('Error') } } }, ...errs(401, 404, 429) } }) },
  '/files/{id}/content': { get: op('Files', 'Download the file', 'anyone who may open the file', { description: 'Redirects (302) to a signed link. Audited.', parameters: [pathId('id', 'File id')], responses: { 302: { description: 'Redirect to the signed link' }, ...errs(401, 404, 429) } }) },
  '/files/{id}/verify': { post: op('Files', 'Verify integrity', 'System Administrator, Head of Records', { description: 'Re-reads the stored file and compares its SHA-256 with the one recorded at upload.', parameters: [pathId('id', 'File id')], responses: { 200: actionOk(obj({ intact: bool() }), { message: 'Checksum matches the upload. The file is intact.', data: { intact: true } }), 409: { description: 'Checksum mismatch or file unreadable', content: { 'application/json': { schema: ref('Error') } } }, ...errs(401, 403, 404, 429) } }) },

  // Documents
  '/documents': { get: op('Documents', 'Register of issued documents', 'Head of Records, Provost, Auditor, System Administrator', { parameters: [query('code', 'Verification code'), query('status', 'Status', str(undefined, { enum: ['valid', 'revoked', 'expired'] })), ...PAGE], responses: { 200: ok('Documents', listOf(ref('Document')), { data: [exDocument], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD } }) },
  '/documents/{id}/pdf': { get: op('Documents', 'Download the issued PDF', 'Head of Records, System Administrator', { parameters: [pathId('id', 'Document id'), query('download', 'Set to 1 to receive it as an attachment (Content-Disposition: attachment) instead of inline', str(undefined, { enum: ['1'] }))], responses: { 200: { description: 'PDF with QR code', content: { 'application/pdf': { schema: str(undefined, { format: 'binary' }) } } }, 410: { description: 'Revoked, or superseded by an amendment' }, ...errs(401, 403, 404, 429) } }) },
  '/documents/{id}/email': { post: op('Documents', 'Email an issued document', 'Head of Records, System Administrator', { description: 'Sends the PDF to each address separately (recipients never see each other), with a download link valid up to 7 days (never past the document expiry) and the verification code. Refused for revoked or expired documents. Every send is audited.', parameters: [pathId('id', 'Document id')], requestBody: jsonBody(obj({ recipients: { ...arr(str(undefined, { format: 'email' })), minItems: 1, maxItems: 10 } }, ['recipients']), { recipients: ['hr@employer.com', 'admissions@university.edu'] }), responses: { 200: ok('Sent to at least one address', ref('EmailResult'), { ok: true, message: 'Emailed to hr@employer.com, admissions@university.edu.', data: null, warnings: [] }), 502: { description: 'No address could be sent to (e.g. email not configured)', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'Not sent to hr@employer.com: Email is not configured on this server.', status: 502 } } } } }, ...errs(401, 403, 404, 422, 429) } }) },
  '/documents/{id}/revoke': { post: op('Documents', 'Revoke a document', 'Head of Records, System Administrator', { description: 'Takes effect immediately on the verification page.', parameters: [pathId('id', 'Document id')], requestBody: jsonBody(obj({ reason: str(undefined, { minLength: 5 }) }, ['reason']), { reason: 'Issued to the wrong recipient' }), responses: { 200: actionOk(undefined, { message: 'Code JK92-CWEU revoked. The verification page now shows it as revoked.' }), ...errs(401, 403, 404, 422, 429) } }) },

  // Amendments
  '/amendments': { get: op('Amendments', 'List amendments', 'Head of Records, Provost, Auditor, System Administrator', { parameters: [query('status', 'Status', str(undefined, { enum: ['PENDING', 'APPROVED', 'REJECTED'] })), ...PAGE], responses: { 200: ok('Amendments', listOf(ref('Amendment')), { data: [exAmendment], meta: { page: 1, limit: 25, total: 1, pages: 1 } }), ...STD } }) },
  '/amendments/{id}/decision': { post: op('Amendments', 'Approve or reject an amendment', 'Provost (never the person who requested it)', { description: 'Approval creates a new record version and revokes documents issued against the old one. A comment is required to reject.', parameters: [pathId('id', 'Amendment id')], requestBody: jsonBody(obj({ decision: str(undefined, { enum: ['approve', 'reject'] }), comment: str() }, ['decision']), { decision: 'approve' }), responses: { 200: actionOk(undefined, { message: 'Amendment applied. 1 issued document(s) revoked automatically.' }), ...errs(401, 403, 404, 422, 429) } }) },

  // Audit
  '/audit': { get: op('Audit log', 'Read the audit log', 'System Administrator, Provost, Internal Auditor', { parameters: [query('action', 'Action prefix, e.g. sheet. or record.view'), query('actor', 'Actor name contains'), query('entityId', 'Entity id'), query('from', 'From date', str(undefined, { format: 'date' })), query('to', 'To date', str(undefined, { format: 'date' })), query('page', 'Page', int()), query('limit', 'Items per page (max 200)', int(undefined, { maximum: 200 }))], responses: { 200: ok('Entries', listOf(ref('AuditEntry')), { data: [exAudit], meta: { page: 1, limit: 25, total: 1042, pages: 42 } }), ...STD } }) },
  '/audit/verify-chain': { post: op('Audit log', 'Verify the hash chain', 'System Administrator, Provost, Internal Auditor', { responses: { 200: ok('Chain intact', dataOf(obj({ intact: bool(), checked: int(), brokenAt: nullable(int()), reason: nullable(str(undefined, { enum: ['missing', 'altered', 'truncated'] })), message: str() })), { data: { intact: true, checked: 1042, brokenAt: null, reason: null, message: 'Chain intact: 1042 entries verified.' } }), 409: ok('Chain broken: an entry was altered or removed', dataOf(obj({ intact: bool(), checked: int(), brokenAt: int(), reason: str(undefined, { enum: ['missing', 'altered', 'truncated'] }), message: str() })), { data: { intact: false, checked: 517, brokenAt: 518, reason: 'missing', message: 'Chain broken: entry #518 is missing (removed from the log). 517 entries before it are valid.' } }), ...STD } }) },
};

/** Stable operationIds for client code generation, e.g. POST /sheets/{id}/decision → postSheetsByIdDecision. */
function withOperationIds(p: Json) {
  const pascal = (x: string) => x.replace(/[^A-Za-z0-9]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
  for (const [path, item] of Object.entries(p) as [string, Json][]) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const opn = item[method] as Json | undefined;
      if (!opn) continue;
      const name = path.split('/').filter(Boolean)
        .map((seg) => (seg.startsWith('{') ? `By${pascal(seg.slice(1, -1))}` : pascal(seg.replace('.json', 'Json'))))
        .join('');
      opn.operationId = method + name;
    }
  }
  return p;
}

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'CPGS Results Repository API',
      version: '1.0.0',
      description: [
        'REST API of the College of Postgraduate Studies Results Repository, Nnamdi Azikiwe University, Awka.',
        '',
        '**Authentication.** Send an API key as `Authorization: Bearer crr_…` (or `X-API-Key: crr_…`). Keys are created by the System Administrator under *Administration → API & integrations* and shown once.',
        '',
        '**A key acts as its owner.** Each key belongs to a staff account and can do exactly what that account can do in the portal, within its department or faculty. The approval chain, maker-checker rules and locking apply unchanged, and every call is recorded in the audit log as "Name [API: key name]". Use a read-only account (e.g. Internal Auditor) for integrations that only read.',
        '',
        '**Conventions.** JSON in and out. Lists return `{ data, meta: { page, limit, total, pages } }`; single items `{ data }`; actions `{ ok, message, data, warnings }`. Errors return `{ error: { message, status, errors? } }` with 400, 401, 403, 404, 409, 410, 422 or 429. Rate limit: 120 requests per minute per key. Call keys only from servers, never from browsers or mobile apps.',
      ].join('\n'),
      contact: { name: 'CPGS ICT Unit' },
    },
    servers: [{ url: `${serverUrl}/api/v1`, description: 'This server' }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    tags: [
      { name: 'System', description: 'Health, this document, the calling account and dashboard statistics' }, { name: 'Verification', description: 'Public document verification (no API key)' },
      { name: 'Faculties', description: 'Academic structure: faculties' }, { name: 'Departments', description: 'Academic structure: departments and their matric number formats' }, { name: 'Programmes', description: 'Academic structure: postgraduate programmes' }, { name: 'Sessions', description: 'Academic sessions, e.g. 2025/2026' }, { name: 'Grading bands', description: 'Minimum CGPA for each class of degree' },
      { name: 'Users', description: 'Staff accounts (System Administrator)' }, { name: 'Records', description: 'Graduand results' },
      { name: 'Result sheets', description: 'Online submission, approval chain and legacy indexing' },
      { name: 'Digitization boxes', description: 'Physical archive boxes for legacy digitization and their teams' }, { name: 'Files', description: 'Scans and evidence: register, signed links, integrity checks' }, { name: 'Documents', description: 'Statements of result and transcripts' },
      { name: 'Amendments', description: 'Corrections to locked records (Head of Records requests, Provost decides)' }, { name: 'Audit log', description: 'Tamper-evident record of every action' },
    ],
    paths: withOperationIds(paths),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'crr_<keyId>_<secret>', description: 'API key created under Administration → API & integrations' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas,
      responses: {
        Unauthorized: { description: 'Missing, invalid, expired or revoked API key', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'You are not signed in', status: 401 } } } } },
        Forbidden: { description: 'The key owner\'s role does not allow this', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'You do not have permission to do this', status: 403 } } } } },
        NotFound: { description: 'Not found, or outside the caller\'s department or faculty', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'Sheet not found', status: 404 } } } } },
        Unprocessable: { description: 'Validation or workflow rule failed', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'This sheet is not at your stage', status: 422 } } } } },
        RateLimited: { description: 'More than 120 requests per minute for this key', content: { 'application/json': { schema: ref('Error'), example: { error: { message: 'Rate limit exceeded: at most 120 requests per minute per key', status: 429 } } } } },
      },
    },
  };
}
