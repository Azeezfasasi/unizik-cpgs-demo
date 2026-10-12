'use client';

export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-navy">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted">
        Please try again. If the problem continues, contact the CPGS ICT unit and quote reference
        <span className="font-mono"> {error.digest ?? 'n/a'}</span>.
      </p>
      <button onClick={() => retry()} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
