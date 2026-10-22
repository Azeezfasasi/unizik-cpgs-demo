import 'server-only';
import { z } from 'zod';
import { db } from './db';
import Setting from '@/models/Setting';

export const DOCUMENT_SETTINGS_KEY = 'documentSettings';

/**
 * Letterhead and signatory details printed on statements of result and transcripts. Office holders
 * change, so these are edited on the Document settings page rather than fixed in code.
 */
export const DocumentSettingsSchema = z.object({
  provostName: z.string().trim().min(3).max(120),
  provostEmail: z.string().trim().max(120),
  secretaryName: z.string().trim().min(3).max(120),
  /** One or more addresses, separated by commas. */
  secretaryEmails: z.string().trim().max(240),
  /** Signs the documents, e.g. "Deputy Registrar I /Secretary". */
  secretaryTitle: z.string().trim().min(3).max(120),
  /** Statement of result reference; the issue number is added, e.g. NAU/CPGS/R/ST/001/165. */
  statementRefPrefix: z.string().trim().min(2).max(60),
  /** Transcript forwarding letter reference; the issue number is added. */
  transcriptRefPrefix: z.string().trim().min(2).max(60),
  transcriptFormNo: z.string().trim().max(40),
  vision: z.string().trim().max(400),
});
export type DocumentSettings = z.infer<typeof DocumentSettingsSchema>;

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  provostName: 'Prof Emmanuel O.C. Obidimma',
  provostEmail: 'provost@cpgs.unizik.edu.ng',
  secretaryName: 'Princess Uche Obi',
  secretaryEmails: 'secdr@cpgs.unizik.edu.ng, secdr.cpgs@unizik.edu.ng',
  secretaryTitle: 'Deputy Registrar I /Secretary',
  statementRefPrefix: 'NAU/CPGS/R/ST/001',
  transcriptRefPrefix: 'UNIZIK/SPGS',
  transcriptFormNo: 'SPGS FORM 044',
  vision: 'Vision of the CPGS - To be a globally recognized center of excellence in postgraduate education and research, fostering inclusive knowledge creation, societal impact and innovative leadership.',
};

/** Just the printed details (without the saved flag and date), e.g. to keep with an issued document. */
export async function currentLetterhead(): Promise<DocumentSettings> {
  const s = await getDocumentSettings();
  return DocumentSettingsSchema.parse(Object.fromEntries(DocumentSettingsSchema.keyof().options.map((k) => [k, s[k]])));
}

/** The saved settings, with defaults for anything not saved yet. */
export async function getDocumentSettings(): Promise<DocumentSettings & { saved: boolean; updatedAt?: Date }> {
  await db();
  const s = await Setting.findById(DOCUMENT_SETTINGS_KEY).lean();
  const saved = s?.value && typeof s.value === 'object' ? (s.value as Partial<DocumentSettings>) : null;
  return { ...DEFAULT_DOCUMENT_SETTINGS, ...saved, saved: !!saved, updatedAt: s?.updatedAt };
}
