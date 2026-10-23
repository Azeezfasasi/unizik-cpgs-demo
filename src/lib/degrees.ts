/** Degree names as written on CPGS letters, keyed by the abbreviation with dots and spaces removed. */
const LONG: Record<string, [string, string]> = {
  PGD: ['Postgraduate Diploma', 'PGD'], PGDIP: ['Postgraduate Diploma', 'PGD'], PGDE: ['Postgraduate Diploma in Education', 'PGDE'],
  MA: ['Master of Arts', 'MA'], MSC: ['Master of Science', 'MSc'], MED: ['Master of Education', 'MEd'],
  MBA: ['Master of Business Administration', 'MBA'], LLM: ['Master of Laws', 'LLM'], MPHIL: ['Master of Philosophy', 'MPhil'],
  PHD: ['Doctor of Philosophy', 'PhD'], DPHIL: ['Doctor of Philosophy', 'PhD'],
  MENG: ['Master of Engineering', 'MEng'], MTECH: ['Master of Technology', 'MTech'], MARCH: ['Master of Architecture', 'MArch'],
  MPH: ['Master of Public Health', 'MPH'], MPA: ['Master of Public Administration', 'MPA'],
  MLIS: ['Master of Library and Information Science', 'MLIS'], MLS: ['Master of Library Science', 'MLS'],
  MSCED: ['Master of Science Education', 'MScEd'], MFA: ['Master of Fine Arts', 'MFA'], MMUS: ['Master of Music', 'MMus'],
  MPHARM: ['Master of Pharmacy', 'MPharm'], MCOM: ['Master of Commerce', 'MCom'], MURP: ['Master of Urban and Regional Planning', 'MURP'],
  MIT: ['Master of Information Technology', 'MIT'], MPM: ['Master of Project Management', 'MPM'],
};

const key = (s: string) => s.replace(/[.\s]/g, '').toUpperCase();

/**
 * Splits a programme name into its degree and subject: "M.Sc. Agricultural Extension" →
 * Master of Science (MSc), "Agricultural Extension". When the name carries no recognised degree
 * abbreviation, the programme's degree type is used and the whole name is the subject.
 */
export function describeDegree(programmeName: string, degreeType: string, department: string) {
  const m = programmeName.trim().match(/^([A-Za-z.]+(?:\s?[A-Za-z]{1,3}\.)?)\s+(.+)$/);
  const fromName = m && LONG[key(m[1])];
  const [long, abbr] = fromName ?? LONG[key(degreeType)] ?? [degreeType, degreeType];
  const subject = (fromName ? m![2] : programmeName).replace(/^in\s+/i, '').trim();
  const sameAsDept = !subject || subject.toLowerCase() === department.trim().toLowerCase();
  return {
    /** "Master of Science (MSc)" */
    degree: `${long} (${abbr})`,
    /** Area of specialization, e.g. "Human Resource Economics". */
    specialization: subject || department,
    /** "Economics (Human Resource Economics)", or just the department when they match. */
    field: sameAsDept ? department : `${department} (${subject})`,
  };
}

/**
 * Short degree and programme for lists and headings, e.g. "MA Language Studies". A programme
 * name that already starts with its degree ("M.Sc. Computer Science") is shown as it is.
 */
export function degreeLabel(programmeName: string, degreeType?: string | null) {
  const m = programmeName.trim().match(/^([A-Za-z.]+(?:\s?[A-Za-z]{1,3}\.)?)\s+(.+)$/);
  if ((m && LONG[key(m[1])]) || !degreeType) return programmeName;
  return `${LONG[key(degreeType)]?.[1] ?? degreeType} ${programmeName}`;
}

/** "15th", "22nd": day of month with its ordinal suffix. */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Letter-style date, e.g. "October 15th, 2026" (calendar date in Nigeria, UTC+1). */
export function letterDate(d: Date | string) {
  const x = new Date(new Date(d).getTime() + 3600_000);
  return `${MONTHS[x.getUTCMonth()]} ${ordinal(x.getUTCDate())}, ${x.getUTCFullYear()}`;
}

/** "Month Year", e.g. "October, 2019" (as for "Date Registered"). */
export function monthYear(d: Date | string) {
  const x = new Date(new Date(d).getTime() + 3600_000);
  return `${MONTHS[x.getUTCMonth()]}, ${x.getUTCFullYear()}`;
}
