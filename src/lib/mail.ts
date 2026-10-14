import 'server-only';

type Mail = {
  to: { email: string; name?: string }[]; subject: string; html: string;
  /** Files sent with the message (e.g. an issued PDF). */
  attachments?: { name: string; content: Uint8Array }[];
};
export type MailResult = { sent: true } | { sent: false; reason: string };

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

/** Sends through Brevo's transactional API; logs to the console when no key is configured. */
export async function sendMail({ to, subject, html, attachments }: Mail): Promise<MailResult> {
  if (!to.length) return { sent: false, reason: 'No recipient' };
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.info(`[mail] (not sent, BREVO_API_KEY unset) to=${to.map((t) => t.email).join(',')} subject="${subject}"`);
    return { sent: false, reason: 'Email is not configured on this server' };
  }
  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_FROM ?? 'records@cpgs.unizik.edu.ng', name: 'UNIZIK CPGS Records' },
        to, subject, htmlContent: layout(subject, html),
        ...(attachments?.length ? { attachment: attachments.map((x) => ({ name: x.name, content: Buffer.from(x.content).toString('base64') })) } : {}),
      }),
    });
  } catch (err) {
    console.error('[mail] Brevo unreachable', err);
    return { sent: false, reason: 'The email service could not be reached' };
  }
  if (!res.ok) {
    console.error('[mail] Brevo error', res.status, await res.text());
    return { sent: false, reason: `The email service refused the message (${res.status})` };
  }
  return { sent: true };
}

function layout(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
  <div style="background:#0f172a;color:#fff;padding:16px 20px;font-weight:bold">UNIZIK CPGS Results Repository</div>
  <div style="padding:20px;color:#000"><h2 style="margin-top:0;color:#0f172a;font-size:18px">${title}</h2>${body}</div>
  <div style="padding:12px 20px;background:#f6f8f9;color:#475569;font-size:12px">College of Postgraduate Studies, Nnamdi Azikiwe University, Awka. This is an automated message.</div>
</div>`;
}

export function link(path: string, label: string) {
  return `<p><a href="${appUrl()}${path}" style="display:inline-block;background:#009689;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${label}</a></p>`;
}
