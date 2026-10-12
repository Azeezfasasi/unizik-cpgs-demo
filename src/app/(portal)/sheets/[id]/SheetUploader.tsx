'use client';

import { FileUploader } from '@/components/FileUploader';
import { attachFile } from '../actions';

export function SheetUploader({ sheetId, purpose, label }: { sheetId: string; purpose: 'LEGACY_SCAN' | 'SUBMISSION_SCAN'; label: string }) {
  return <FileUploader purpose={purpose} sheetId={sheetId} label={label} onUploaded={(fileId) => attachFile(sheetId, fileId)} />;
}
