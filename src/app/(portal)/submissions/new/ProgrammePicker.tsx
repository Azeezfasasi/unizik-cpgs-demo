'use client';

import { useState } from 'react';

const DEGREE_NAMES: Record<string, string> = {
  PGD: 'PGD (Postgraduate Diploma)', MA: 'MA (Master of Arts)', MSc: 'MSc (Master of Science)', MEd: 'MEd (Master of Education)',
  MBA: 'MBA (Master of Business Administration)', LLM: 'LLM (Master of Laws)', MPhil: 'MPhil (Master of Philosophy)', PhD: 'PhD (Doctor of Philosophy)',
};

/** Degree first, then the department's programmes of that degree. */
export function ProgrammePicker({ programmes, degreeOrder }: {
  programmes: { id: string; name: string; degreeType: string }[];
  /** Degree types in display order. */
  degreeOrder: readonly string[];
}) {
  const degrees = degreeOrder.filter((d) => programmes.some((p) => p.degreeType === d));
  const [degree, setDegree] = useState(degrees[0] ?? '');
  const list = programmes.filter((p) => p.degreeType === degree);

  return (
    <>
      <div>
        <label className="label" htmlFor="degree">Degree</label>
        <select id="degree" name="degree" required className="input max-w-md" value={degree} onChange={(e) => setDegree(e.target.value)}>
          {degrees.map((d) => <option key={d} value={d}>{DEGREE_NAMES[d] ?? d}</option>)}
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
