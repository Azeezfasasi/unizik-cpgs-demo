import type { Role } from './rbac';
import type { SheetStatus } from '@/models/ResultSheet';

/** One table drives the online approval chain. */
export const FLOW = {
  SUBMITTED:        { role: 'HOD',          next: 'HOD_APPROVED',      label: 'HOD review' },
  HOD_APPROVED:     { role: 'FACULTY_PG',   next: 'FACULTY_APPROVED',  label: 'Faculty PG review' },
  FACULTY_APPROVED: { role: 'HEAD_RECORDS', next: 'RECORDS_VERIFIED',  label: 'Records verification' },
  RECORDS_VERIFIED: { role: 'PROVOST',      next: 'PROVOST_APPROVED',  label: 'Provost approval' },
  PROVOST_APPROVED: { role: 'HEAD_RECORDS', next: 'SENATE_APPROVED',   label: 'Record Board approval' },
} as const satisfies Partial<Record<SheetStatus, { role: Role; next: SheetStatus; label: string }>>;

export type FlowStage = keyof typeof FLOW;

export const ONLINE_STEPS: { status: SheetStatus; label: string }[] = [
  { status: 'SUBMITTED', label: 'Submitted' },
  { status: 'HOD_APPROVED', label: 'HOD' },
  { status: 'FACULTY_APPROVED', label: 'Faculty PG' },
  { status: 'RECORDS_VERIFIED', label: 'Records' },
  { status: 'PROVOST_APPROVED', label: 'Provost' },
  { status: 'SENATE_APPROVED', label: 'Board' },
];

export const LEGACY_STEPS: { status: SheetStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Indexing' },
  { status: 'INDEXED', label: 'Indexed' },
  { status: 'QA_PASSED', label: 'QA passed' },
  { status: 'LOCKED', label: 'Locked' },
];

export const STATUS_LABELS: Record<SheetStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting HOD',
  HOD_APPROVED: 'Awaiting Faculty PG',
  FACULTY_APPROVED: 'Awaiting Records',
  RECORDS_VERIFIED: 'Awaiting Provost',
  PROVOST_APPROVED: 'Awaiting Board approval',
  SENATE_APPROVED: 'Board approved',
  RETURNED: 'Returned',
  INDEXED: 'Awaiting QA',
  QA_PASSED: 'QA passed',
  LOCKED: 'Locked',
};

/** Stages each role acts on in the approvals inbox. */
export function stagesFor(role: Role): FlowStage[] {
  return (Object.keys(FLOW) as FlowStage[]).filter((s) => FLOW[s].role === role);
}

export const isEditable = (status: string) => status === 'DRAFT' || status === 'RETURNED';
export const isFinal = (status: string) => status === 'SENATE_APPROVED' || status === 'LOCKED';
