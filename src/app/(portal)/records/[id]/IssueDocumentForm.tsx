'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import type { ActionState } from '@/lib/action-state';

export type TranscriptDefaults = {
  phone: string; email: string; address: string; modeOfStudy: string; dateRegistered: string;
  admission: { qualification: string; date: string; institution: string }[];
};

/**
 * Issue a statement of result or a transcript. A transcript also needs the receiving institution's
 * address (for the forwarding letter) and the student details printed on SPGS Form 044, which are
 * saved on the student for next time.
 */
export function IssueDocumentForm({ action, student }: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  student: TranscriptDefaults;
}) {
  const [kind, setKind] = useState('STATEMENT_OF_RESULT');
  const transcript = kind === 'TRANSCRIPT';
  const adm = [...student.admission, { qualification: '', date: '', institution: '' }, { qualification: '', date: '', institution: '' }].slice(0, 3);

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="kind">Document</label>
        <select id="kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="STATEMENT_OF_RESULT">Statement of result</option>
          <option value="TRANSCRIPT">Academic transcript</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="validDays">Valid for</label>
        <select id="validDays" name="validDays" defaultValue="365" className="input">
          <option value="90">90 days</option><option value="365">1 year</option><option value="1825">5 years</option>
        </select>
      </div>
      <div className={transcript ? 'sm:col-span-2' : ''}>
        <label className="label" htmlFor="issuedTo">{transcript ? 'Receiving institution or organization' : 'Issued to'}</label>
        <input id="issuedTo" name="issuedTo" required className="input"
          placeholder={transcript ? 'e.g. Tulane University' : 'The graduand, or e.g. Federal Ministry of Health'} />
      </div>
      {transcript && (
        <div className="sm:col-span-2">
          <label className="label" htmlFor="issuedToAddress">Institution address <span className="font-normal text-muted">(printed under its name on the forwarding letter)</span></label>
          <textarea id="issuedToAddress" name="issuedToAddress" rows={2} className="input" placeholder={'Office of Graduate Admissions\nNew Orleans, Louisiana'} />
        </div>
      )}
      {!transcript && (
        <div>
          <label className="label" htmlFor="email">Graduand&rsquo;s email <span className="font-normal text-muted">(optional)</span></label>
          <input id="email" name="email" type="email" autoComplete="off" className="input" />
        </div>
      )}

      {transcript && (
        <fieldset className="space-y-3 rounded-lg border border-line p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold text-navy">Student details on the transcript</legend>
          <p className="text-xs text-muted">Saved on the student&rsquo;s record and filled in next time. Leave blank what you do not have.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="phone">Phone no</label>
              <input id="phone" name="phone" defaultValue={student.phone} className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="studentEmail">Email</label>
              <input id="studentEmail" name="studentEmail" type="email" defaultValue={student.email} className="input" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="address">Permanent address</label>
              <input id="address" name="address" defaultValue={student.address} className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="modeOfStudy">Mode of study</label>
              <select id="modeOfStudy" name="modeOfStudy" defaultValue={student.modeOfStudy} className="input">
                <option value="">Not recorded</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dateRegistered">Date registered</label>
              <input id="dateRegistered" name="dateRegistered" type="date" defaultValue={student.dateRegistered} className="input" />
            </div>
          </div>
          <div>
            <div className="label">Basis of admission</div>
            <div className="space-y-2">
              {adm.map((a, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_0.6fr_1.4fr]">
                  <input name={`admQualification${i}`} defaultValue={a.qualification} className="input" placeholder="Qualification & class, e.g. B.A. Second Class Upper" aria-label={`Qualification ${i + 1}`} />
                  <input name={`admDate${i}`} defaultValue={a.date} className="input" placeholder="Year, e.g. 2016" aria-label={`Date ${i + 1}`} />
                  <input name={`admInstitution${i}`} defaultValue={a.institution} className="input" placeholder="Institution where obtained" aria-label={`Institution ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        </fieldset>
      )}

      <div className="sm:col-span-2">
        <label className="label" htmlFor="recipients">{transcript ? 'Email to' : 'Also send to'} <span className="font-normal text-muted">(optional: {transcript ? 'the receiving institution' : 'employers, institutions, embassies…'})</span></label>
        <textarea id="recipients" name="recipients" rows={2} className="input"
          placeholder={transcript ? 'admissions@university.edu' : 'hr@employer.com, admissions@university.edu'} />
        <p className="mt-1 text-xs text-muted">
          Separate addresses with commas or new lines (up to 10). Each recipient gets their own email with the PDF attached, a download link and the verification code.
          {transcript && ' A transcript is confidential: send it to the institution, not the candidate.'}
        </p>
      </div>
      <div className="sm:col-span-2"><SubmitButton className="btn-accent">Generate document</SubmitButton></div>
    </ActionForm>
  );
}
