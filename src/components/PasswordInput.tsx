'use client';

import { useState, type InputHTMLAttributes } from 'react';

/** Password field with an accessible show/hide toggle. Always starts hidden. */
export function PasswordInput({ id, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={visible ? 'text' : 'password'} className={`input pr-11 ${className}`} {...props} />
      <button type="button" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls={id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" />
          <circle cx="10" cy="10" r="2.5" />
          {visible && <path d="M3 17 17 3" />}
        </svg>
      </button>
    </div>
  );
}
