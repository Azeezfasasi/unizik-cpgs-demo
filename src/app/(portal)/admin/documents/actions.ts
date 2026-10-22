'use server';

import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { DOCUMENT_SETTINGS_KEY, DocumentSettingsSchema, currentLetterhead } from '@/lib/document-settings';
import type { ActionState } from '@/lib/action-state';
import Setting from '@/models/Setting';

export async function saveDocumentSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('documents:settings');
    const value = DocumentSettingsSchema.parse(Object.fromEntries(DocumentSettingsSchema.keyof().options.map((k) => [k, String(fd.get(k) ?? '')])));
    await db();
    const before = await currentLetterhead();
    await Setting.findByIdAndUpdate(DOCUMENT_SETTINGS_KEY, { $set: { value, updatedBy: user.id } }, { upsert: true });
    await audit(user, 'documents.settings_update', 'Setting', DOCUMENT_SETTINGS_KEY, before, value);
    return { ok: true, message: 'Saved. Documents issued from now on use these details; ones already issued keep theirs.' };
  });
}
