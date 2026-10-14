import { ActionForm, SubmitButton } from '@/components/forms';
import { revokeDocument, sendDocument } from './actions';

/**
 * View / Download / Email / Revoke for one issued document. Only valid documents can be
 * emailed; revoked ones show nothing (they no longer render).
 */
export function DocumentActions({ id, revoked, expired, align = 'end' }: {
  id: string; revoked: boolean; expired: boolean;
  /** 'end' in a table's last column, 'start' in a stacked (phone) layout. */
  align?: 'start' | 'end';
}) {
  if (revoked) return null;
  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <div className="flex gap-3 text-xs">
        <a className="link" href={`/api/documents/${id}`} target="_blank" rel="noreferrer">View</a>
        <a className="link" href={`/api/documents/${id}?download=1`}>Download</a>
      </div>
      {!expired && (
        <details className="text-left">
          <summary className="cursor-pointer text-xs text-brand">Email</summary>
          <ActionForm action={sendDocument.bind(null, id)} resetOnSuccess className="mt-1 w-64 space-y-1">
            <textarea name="recipients" rows={2} required placeholder="Email addresses, separated by commas"
              className="input py-1 text-xs" aria-label="Email addresses" />
            <SubmitButton className="btn-primary px-2 py-1 text-xs" pendingText="Sending…">Send PDF</SubmitButton>
          </ActionForm>
        </details>
      )}
      <details className="text-left">
        <summary className="cursor-pointer text-xs text-red-700">Revoke</summary>
        <ActionForm action={revokeDocument.bind(null, id)} className="mt-1 w-56 space-y-1">
          <input name="reason" placeholder="Reason" className="input py-1 text-xs" aria-label="Reason for revoking" />
          <SubmitButton className="btn-danger px-2 py-1 text-xs">Confirm revoke</SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}
