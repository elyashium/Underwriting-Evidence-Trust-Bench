import type { NormalizedValue } from './types';

/**
 * Value normalisation.
 *
 * This file decides most of the hard-negative outcomes in the bench, so the
 * governing rule is: normalise only what is provably equivalent, and never
 * discard a token that could distinguish two real entities.
 *
 * The temptation in address cleaning is to strip "noise" — suffixes,
 * directionals, unit numbers — because it makes fuzzy matching work better.
 * That is exactly what turns "4500 Oak St" and "4500 Oak Ave" into one yard.
 * Aggressive normalisation does not produce a more accurate system, it produces
 * a more confident one.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  thousand: 1_000,
  million: 1_000_000,
};

/**
 * Parses "$1,200,000", "$1.2M", "1.2 million", "1200000" to the same number.
 * Returns null when the string holds no recognisable amount.
 */
export function normalizeMoney(raw: string): NormalizedValue | null {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = cleaned.match(
    /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(mm|m|k|million|thousand)?\b/,
  );
  if (!match) return null;

  const digits = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(digits)) return null;

  const suffix = match[2];
  const multiplier = suffix ? MULTIPLIERS[suffix] : 1;
  const numeric = Math.round(digits * multiplier);

  return {
    kind: 'money',
    canonical: String(numeric),
    numeric,
    note: suffix ? `interpreted "${match[0].trim()}" as ${numeric.toLocaleString()}` : undefined,
    domainRule: suffix ? 'money.magnitude-shorthand' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Parses "12", "twelve", "twelve (12)", "Fifteen power units" to one integer.
 * When a spelled form and a digit form are both present they must agree;
 * a mismatch such as "twelve (13)" is returned as ambiguous rather than
 * silently resolved in favour of either.
 */
export function normalizeCount(raw: string): NormalizedValue | null {
  const cleaned = raw.trim().toLowerCase();

  const digitMatch = cleaned.match(/\b(\d{1,4})\b/);
  const wordMatch = cleaned.match(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/,
  );

  const fromDigits = digitMatch ? Number(digitMatch[1]) : null;
  const fromWords = wordMatch ? NUMBER_WORDS[wordMatch[1]] : null;

  if (fromDigits === null && fromWords === null) return null;

  if (fromDigits !== null && fromWords !== null && fromDigits !== fromWords) {
    return {
      kind: 'count',
      canonical: String(fromDigits),
      numeric: fromDigits,
      ambiguous: true,
      note: `spelled count "${wordMatch![1]}" disagrees with digits "${fromDigits}"`,
    };
  }

  const numeric = (fromDigits ?? fromWords) as number;
  const dualAsserted = fromDigits !== null && fromWords !== null;
  return {
    kind: 'count',
    canonical: String(numeric),
    numeric,
    note: dualAsserted
      ? `document asserts the count twice ("${wordMatch![1]}" and "${fromDigits}") and they agree`
      : fromDigits === null
        ? `read spelled number "${wordMatch![1]}" as ${numeric}`
        : undefined,
    // A plain spelled number is a lexical difference, not a domain one, so it
    // earns no finding. The "twelve (12)" drafting convention does: the same
    // token asserts the number twice, which is precisely where a transcription
    // error hides, and the agreement had to be checked rather than assumed.
    domainRule: dualAsserted ? 'count.dual-assertion' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parses "06/01/2026", "2026-06-01", "June 1, 2026" and "June 1" to YYYY-MM-DD.
 *
 * `contextYear` supplies the year when the text omits it (brokers routinely
 * write "incept June 1"). The inference is recorded in `note` so a reviewer can
 * see it was inferred rather than read, and callers lower their extraction
 * confidence accordingly.
 */
export function normalizeDate(raw: string, contextYear?: number): NormalizedValue | null {
  const cleaned = raw.trim().toLowerCase();

  const iso = cleaned.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return {
      kind: 'date',
      canonical: `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`,
    };
  }

  const slash = cleaned.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return {
      kind: 'date',
      canonical: `${year}-${pad(Number(slash[1]))}-${pad(Number(slash[2]))}`,
    };
  }

  const named = cleaned.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/,
  );
  if (named) {
    const month = MONTHS[named[1]];
    const day = Number(named[2]);
    const explicitYear = named[3] ? Number(named[3]) : undefined;
    const year = explicitYear ?? contextYear;
    if (year === undefined) return null;
    return {
      kind: 'date',
      canonical: `${year}-${pad(month)}-${pad(day)}`,
      note: explicitYear
        ? undefined
        : `year not stated; inferred ${year} from the document date`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// VIN
// ---------------------------------------------------------------------------

/**
 * I, O and Q are excluded from the VIN standard precisely so they cannot be
 * confused with 1 and 0. A VIN containing one is therefore a misread with
 * exactly one legal reading, and folding it is safe rather than a guess.
 */
const ILLEGAL_VIN_GLYPHS: Record<string, string> = { I: '1', O: '0', Q: '0' };

/**
 * Glyph pairs that are legal in both readings. These are genuinely ambiguous
 * and are never folded — two VINs differing only here are reported as
 * `unresolved`, not merged and not called a conflict.
 */
const AMBIGUOUS_VIN_PAIRS: string[][] = [
  ['5', 'S'], ['8', 'B'], ['2', 'Z'], ['6', 'G'], ['0', 'D'], ['1', '7'],
];

export function normalizeVin(raw: string): NormalizedValue {
  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let folded = '';
  const substitutions: string[] = [];

  for (const ch of stripped) {
    const replacement = ILLEGAL_VIN_GLYPHS[ch];
    if (replacement) {
      folded += replacement;
      substitutions.push(`${ch}->${replacement}`);
    } else {
      folded += ch;
    }
  }

  return {
    kind: 'vin',
    canonical: folded,
    note: substitutions.length
      ? `OCR glyphs not valid in a VIN, single legal reading: ${substitutions.join(', ')}`
      : undefined,
    domainRule: substitutions.length ? 'vin.illegal-glyph-folding' : undefined,
  };
}

/**
 * True when two canonical VINs differ only at positions whose characters form a
 * known OCR confusion pair that is legal in both readings. Such a pair might be
 * the same vehicle or might be two vehicles; the honest answer is that the
 * documents do not say.
 */
export function vinsAmbiguouslyClose(a: string, b: string): boolean {
  if (a === b || a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    differences += 1;
    const confusable = AMBIGUOUS_VIN_PAIRS.some(
      ([x, y]) => (a[i] === x && b[i] === y) || (a[i] === y && b[i] === x),
    );
    if (!confusable) return false;
  }
  return differences > 0 && differences <= 2;
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

/**
 * Suffixes are folded to one spelling *within* a family (Street -> ST) and are
 * never dropped or folded across families. ST and AVE stay different forever.
 */
const SUFFIX_FORMS: Record<string, string> = {
  street: 'ST', st: 'ST',
  avenue: 'AVE', ave: 'AVE', av: 'AVE',
  boulevard: 'BLVD', blvd: 'BLVD',
  road: 'RD', rd: 'RD',
  drive: 'DR', dr: 'DR',
  lane: 'LN', ln: 'LN',
  parkway: 'PKWY', pkwy: 'PKWY', pky: 'PKWY',
  court: 'CT', ct: 'CT',
  circle: 'CIR', cir: 'CIR',
  highway: 'HWY', hwy: 'HWY',
  place: 'PL', pl: 'PL',
  terrace: 'TER', ter: 'TER',
  way: 'WAY',
  trail: 'TRL', trl: 'TRL',
};

/** Directionals are abbreviated but always preserved — N and S are not noise. */
const DIRECTIONAL_FORMS: Record<string, string> = {
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW',
  southeast: 'SE', se: 'SE',
  southwest: 'SW', sw: 'SW',
};

export function normalizeAddress(raw: string): NormalizedValue {
  const expansions: string[] = [];

  const tokens = raw
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      const form = SUFFIX_FORMS[lower] ?? DIRECTIONAL_FORMS[lower];
      if (!form) return token;
      // Only an actual abbreviation counts as domain work. "St" -> "ST" is
      // case folding and any comparator does it; "Street" -> "ST" is not.
      if (form !== token) expansions.push(`${token}->${form}`);
      return form;
    });

  return {
    kind: 'address',
    canonical: tokens.join(' '),
    note: expansions.length ? `abbreviated within suffix family: ${expansions.join(', ')}` : undefined,
    domainRule: expansions.length ? 'address.suffix-family-folding' : undefined,
  };
}

/**
 * Character-level similarity, used only to decide whether two addresses are
 * close enough to be worth *reporting* as a near-duplicate. It never merges
 * anything — merging is decided by exact canonical equality.
 */
export function addressSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;

  // Levenshtein, iterative two-row form.
  let previous = Array.from({ length: shorter.length + 1 }, (_, i) => i);
  for (let i = 1; i <= longer.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= shorter.length; j += 1) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return 1 - previous[shorter.length] / longer.length;
}

/**
 * Explains *why* two near-identical addresses are different places, so the
 * reviewer sees a reason rather than a similarity score. Returns null when the
 * difference is not in a token that carries meaning.
 */
export function distinguishingAddressToken(a: string, b: string): string | null {
  const ta = a.split(' ');
  const tb = b.split(' ');
  if (ta.length !== tb.length) return null;

  const diffs = ta
    .map((token, i) => ({ token, other: tb[i], i }))
    .filter((d) => d.token !== d.other);
  if (diffs.length !== 1) return null;

  const { token, other } = diffs[0];
  const suffixes = new Set(Object.values(SUFFIX_FORMS));
  const directionals = new Set(Object.values(DIRECTIONAL_FORMS));

  if (suffixes.has(token) && suffixes.has(other)) {
    return `different street suffix (${token} vs ${other})`;
  }
  if (directionals.has(token) && directionals.has(other)) {
    return `different directional (${token} vs ${other})`;
  }
  if (/^\d+$/.test(token) && /^\d+$/.test(other)) {
    return `different street number (${token} vs ${other})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Liability limit
// ---------------------------------------------------------------------------

/**
 * "$1,000,000", "1,000,000 CSL" and "$1M combined single limit" are one limit.
 * The canonical form keeps the basis (CSL vs split) because that genuinely
 * changes cover — only the amount formatting is normalised away.
 */
export function normalizeLimit(raw: string): NormalizedValue | null {
  const money = normalizeMoney(raw);
  if (!money || money.numeric === undefined) return null;

  const lower = raw.toLowerCase();
  const spelledBasis = /combined single limit/.test(lower);
  const isCsl = spelledBasis || /\bcsl\b/.test(lower);
  const basis = isCsl ? 'CSL' : 'UNSPECIFIED';

  const rules = [money.domainRule, spelledBasis ? 'limit.basis-from-prose' : undefined].filter(
    Boolean,
  ) as string[];

  return {
    kind: 'limit',
    canonical: `${money.numeric} ${basis}`,
    numeric: money.numeric,
    note: money.note,
    domainRule: rules.length ? rules.join(' + ') : undefined,
  };
}

// ---------------------------------------------------------------------------
// Text fallback
// ---------------------------------------------------------------------------

export function normalizeText(raw: string): NormalizedValue {
  return {
    kind: 'text',
    canonical: raw.trim().toLowerCase().replace(/\s+/g, ' '),
  };
}
