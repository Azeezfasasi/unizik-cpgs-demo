'use client';

import { useState } from 'react';

/** Degree first, then the department's programmes of that degree. */
export function ProgrammePicker({ programmes, degrees: all }: {
  programmes: { id: string; name: string; degreeType: string }[];
  /** The managed degrees, in display order. */
  degrees: { code: string; name: string }[];
}) {
  // The department's degrees in the managed order; any not in the list (yet) come last.
  const codes = [...new Set([...all.map((g) => g.code), ...programmes.map((p) => p.degreeType)])];
  const degrees = codes.filter((d) => programmes.some((p) => p.degreeType === d));
  const label = (d: string) => { const g = all.find((x) => x.code === d); return g ? `${g.code} (${g.name})` : d; };
  const [degree, setDegree] = useState(degrees[0] ?? '');
  const list = programmes.filter((p) => p.degreeType === degree);

  return (
    <>
      <div>
        <label className="label" htmlFor="degree">Degree</label>
        <select id="degree" name="degree" required className="input max-w-md" value={degree} onChange={(e) => setDegree(e.target.value)}>
          {degrees.map((d) => <option key={d} value={d}>{label(d)}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="programme">Programme</label>
        {/* Keyed by degree so the first programme of the new degree is selected. */}
        <select key={degree} id="programme" name="programme" required className="input">
          {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">
          {list.length} {degree} programme{list.length === 1 ? '' : 's'} in your department. A programme missing here is added by the system administrator in Academic structure.
        </p>
      </div>
    </>
  );
}
