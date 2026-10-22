import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { getDocumentSettings } from '@/lib/document-settings';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { saveDocumentSettings } from './actions';

export const metadata: Metadata = { title: 'Document settings' };

export default function DocumentSettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentSettingsContent />
    </Suspense>
  );
}

const FIELDS = [
  { section: 'Letterhead', items: [
    ['provostName', 'Provost', 'Prof Emmanuel O.C. Obidimma'],
    ['provostEmail', 'Provost’s email', 'provost@cpgs.unizik.edu.ng'],
    ['secretaryName', 'Secretary', 'Princess Uche Obi'],
    ['secretaryEmails', 'Secretary’s email(s)', 'Separate two addresses with a comma'],
  ] },
  { section: 'Signatory', items: [
    ['secretaryTitle', 'Title under the signature', 'Deputy Registrar I /Secretary'],
  ] },
  { section: 'References', items: [
    ['statementRefPrefix', 'Statement of result reference', 'NAU/CPGS/R/ST/001'],
    ['transcriptRefPrefix', 'Transcript forwarding letter reference', 'UNIZIK/SPGS'],
    ['transcriptFormNo', 'Transcript form number', 'SPGS FORM 044'],
  ] },
] as const;

async function DocumentSettingsContent() {
  await requirePage('documents:settings');
  const s = await getDocumentSettings();

  return (
    <>
      <PageHeader
        title="Document settings"
        description="Names, titles and references printed on statements of result and transcripts. Update them when an office holder changes. Each document keeps the details in force when it was issued."
      />
      <Card title="Letterhead and signatory">
        <ActionForm action={saveDocumentSettings} className="space-y-6">
          {FIELDS.map((g) => (
            <fieldset key={g.section} className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-navy">{g.section}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.items.map(([name, label, placeholder]) => (
                  <div key={name}>
                    <label className="label" htmlFor={name}>{label}</label>
                    <input id={name} name={name} defaultValue={s[name]} placeholder={placeholder} className="input" required={!name.endsWith('Email') && !name.endsWith('Emails') && name !== 'transcriptFormNo'} />
                  </div>
                ))}
              </div>
              {g.section === 'References' && (
                <p className="text-xs text-muted">The issue number is added to each reference, e.g. {s.statementRefPrefix}/165.</p>
              )}
            </fieldset>
          ))}
          <div>
            <label className="label" htmlFor="vision">Vision statement <span className="font-normal text-muted">(printed at the foot of letters)</span></label>
            <textarea id="vision" name="vision" rows={2} defaultValue={s.vision} className="input" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save settings</SubmitButton>
            <span className="text-xs text-muted">{s.saved && s.updatedAt ? `Last saved ${fmtDateTime(s.updatedAt)}` : 'Showing the defaults; nothing saved yet.'}</span>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
