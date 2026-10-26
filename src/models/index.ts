// Importing every model registers it with mongoose before any populate() call.
export { default as User } from './User';
export { default as Faculty } from './Faculty';
export { default as Department } from './Department';
export { default as Programme } from './Programme';
export { default as Degree } from './Degree';
export { default as AcademicSession } from './AcademicSession';
export { default as Student } from './Student';
export { default as StoredFile } from './StoredFile';
export { default as DigitizationBatch } from './DigitizationBatch';
export { default as ResultSheet } from './ResultSheet';
export { default as GraduandRecord } from './GraduandRecord';
export { default as Amendment } from './Amendment';
export { default as Verification } from './Verification';
export { default as AuditLog, AuditHead } from './AuditLog';
export { nextSeq, nextSheetReference } from './Counter';
