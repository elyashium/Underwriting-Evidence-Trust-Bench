import { describe, expect, it } from 'vitest';

import { GUIDELINES } from '../src/lib/classify';
import {
  addressSimilarity,
  distinguishingAddressToken,
  normalizeAddress,
  normalizeCount,
  normalizeDate,
  normalizeLimit,
  normalizeMoney,
  normalizeText,
  normalizeVin,
  vinsAmbiguouslyClose,
} from '../src/lib/normalize';

/**
 * Normalisation is where most of the hard-negative outcomes are actually
 * decided, so these are the tests that matter most in the repo.
 *
 * They are written in two directions on purpose. Half of them assert that two
 * spellings of one value collapse to one canonical — that is the half that stops
 * false conflicts. The other half assert that two values which look alike stay
 * apart — that is the half that stops the first half from being achieved by
 * mashing everything together. A normaliser is only trustworthy if both hold,
 * and it is trivially easy to pass either one alone.
 */

describe('money', () => {
  it('reads magnitude shorthand and full digits as the same amount', () => {
    const shorthand = normalizeMoney('$1.2M');
    const written = normalizeMoney('$1,200,000');

    expect(shorthand?.numeric).toBe(1_200_000);
    expect(written?.numeric).toBe(1_200_000);
    expect(shorthand?.canonical).toBe(written?.canonical);
  });

  it('marks the shorthand reading as domain work and the plain digits as not', () => {
    // This distinction is load-bearing: it is what separates a reportable
    // benign_variant ("someone had to know $1.2M means 1,200,000") from an
    // unremarkable consistent finding nobody should be shown.
    expect(normalizeMoney('$1.2M')?.domainRule).toBe('money.magnitude-shorthand');
    expect(normalizeMoney('$1,200,000')?.domainRule).toBeUndefined();
  });

  it('handles the shorthand spellings that appear in broker prose', () => {
    expect(normalizeMoney('1.2 million')?.numeric).toBe(1_200_000);
    expect(normalizeMoney('$850K')?.numeric).toBe(850_000);
    expect(normalizeMoney('2MM')?.numeric).toBe(2_000_000);
  });

  it('returns null rather than guessing when there is no amount', () => {
    expect(normalizeMoney('physical damage on all scheduled units')).toBeNull();
  });
});

describe('counts', () => {
  it('reads digits, words, and the doubled drafting convention as one number', () => {
    expect(normalizeCount('12')?.canonical).toBe('12');
    expect(normalizeCount('twelve')?.canonical).toBe('12');
    expect(normalizeCount('twelve (12)')?.canonical).toBe('12');
    expect(normalizeCount('Fifteen power units')?.canonical).toBe('15');
  });

  it('treats a doubled assertion as domain work and a spelled number as not', () => {
    // "twelve (12)" asserts the same count twice, which is exactly where a
    // transcription error hides, so the agreement had to be checked rather than
    // assumed — that is worth surfacing. "Fifteen power units" is a lexical
    // difference any comparator handles, so it is not.
    expect(normalizeCount('twelve (12)')?.domainRule).toBe('count.dual-assertion');
    expect(normalizeCount('Fifteen power units')?.domainRule).toBeUndefined();
    expect(normalizeCount('12')?.domainRule).toBeUndefined();
  });

  it('refuses to pick a winner when the two assertions disagree', () => {
    const mismatch = normalizeCount('twelve (13)');

    expect(mismatch?.ambiguous).toBe(true);
    expect(mismatch?.note).toMatch(/disagrees/);
    // The digits are kept as the canonical so downstream code has something to
    // work with, but `ambiguous` is the flag the classifier reads.
    expect(mismatch?.numeric).toBe(13);
  });

  it('returns null when there is no count at all', () => {
    expect(normalizeCount('refrigerated produce, long haul')).toBeNull();
  });
});

describe('dates', () => {
  it('reads the three formats a submission actually contains', () => {
    expect(normalizeDate('06/01/2026')?.canonical).toBe('2026-06-01');
    expect(normalizeDate('2026-06-01')?.canonical).toBe('2026-06-01');
    expect(normalizeDate('June 1, 2026')?.canonical).toBe('2026-06-01');
  });

  it('infers a missing year from the document, and says so', () => {
    const inferred = normalizeDate('please incept June 1', 2026);

    expect(inferred?.canonical).toBe('2026-06-01');
    expect(inferred?.note).toMatch(/inferred/);
  });

  it('returns null rather than assuming a year when none is available', () => {
    expect(normalizeDate('please incept June 1')).toBeNull();
  });

  it('records nothing in `note` when the year was actually read', () => {
    expect(normalizeDate('June 1, 2026')?.note).toBeUndefined();
  });
});

describe('VIN glyph folding', () => {
  // The VIN standard excludes I, O and Q precisely so they cannot be confused
  // with 1 and 0. A VIN containing one is a misread with exactly one legal
  // reading, so folding it is provable rather than a guess. Everything else —
  // 5/S, 8/B, 2/Z, 6/G, 0/D, 1/7 — is legal in both readings and must survive.

  it('folds the three illegal glyphs to their only legal reading', () => {
    // The pair from PKT-015: a re-scanned page of an otherwise identical
    // schedule row.
    const scanned = normalizeVin('IXPBDP9XILD6I2O88');

    expect(scanned.canonical).toBe('1XPBDP9X1LD612088');
    expect(scanned.domainRule).toBe('vin.illegal-glyph-folding');
    expect(scanned.note).toMatch(/I->1/);
    expect(scanned.note).toMatch(/O->0/);
  });

  it('leaves a clean VIN untouched and claims no domain work for it', () => {
    const clean = normalizeVin('1XPBDP9X1LD612088');

    expect(clean.canonical).toBe('1XPBDP9X1LD612088');
    expect(clean.domainRule).toBeUndefined();
    expect(clean.note).toBeUndefined();
  });

  it('never rewrites a glyph that is legal in both readings', () => {
    // Every character here belongs to a known OCR confusion pair, and not one
    // of them may be touched. If this test ever fails, two real vehicles are
    // about to be merged into one.
    const ambiguousButLegal = '5B2G0D7S8Z6D01754';

    expect(normalizeVin(ambiguousButLegal).canonical).toBe(ambiguousButLegal);
    expect(normalizeVin(ambiguousButLegal).domainRule).toBeUndefined();
  });
});

describe('vinsAmbiguouslyClose', () => {
  const base = '1FUJGLDR5CLBP8834';

  it('is true for a single difference at a genuinely confusable glyph', () => {
    expect(vinsAmbiguouslyClose(base, '1FUJGLDR5CLBPB834')).toBe(true); // 8 / B
  });

  it('is false for identical VINs — there is nothing ambiguous about a match', () => {
    expect(vinsAmbiguouslyClose(base, base)).toBe(false);
  });

  it('is false for different lengths', () => {
    expect(vinsAmbiguouslyClose(base, `${base}1`)).toBe(false);
    expect(vinsAmbiguouslyClose(base, base.slice(0, 16))).toBe(false);
  });

  it('is false when any single difference is not a confusion pair', () => {
    // 4 / 5 is not an OCR pair, so these are two different vehicles and the
    // honest answer is "conflict", not "unresolved".
    expect(vinsAmbiguouslyClose(base, '1FUJGLDR5CLBP8835')).toBe(false);
  });

  it('is false once there are more than two differences, confusable or not', () => {
    // 1/7, 5/S and 8/B are each individually plausible; three at once is a
    // different VIN, and calling it "maybe the same truck" would be generous
    // to the point of useless.
    expect(vinsAmbiguouslyClose(base, '7FUJGLDRSCLBPB834')).toBe(false);
  });
});

describe('address normalisation', () => {
  const OAK_ST = '4500 Oak St, Rockford, IL 61103';
  const OAK_STREET = '4500 Oak Street, Rockford, IL 61103';
  const OAK_AVE = '4500 Oak Ave, Rockford, IL 61103';

  it('folds a suffix within its family', () => {
    expect(normalizeAddress(OAK_STREET).canonical).toBe(
      normalizeAddress(OAK_ST).canonical,
    );
    expect(normalizeAddress(OAK_STREET).domainRule).toBe('address.suffix-family-folding');
  });

  it('claims no domain work when the suffix was already abbreviated', () => {
    // "St" -> "ST" is case folding, which every comparator does. Recording it
    // as domain work would manufacture benign_variant findings for addresses
    // nobody had to think about.
    expect(normalizeAddress(OAK_ST).domainRule).toBeUndefined();
  });

  it('never folds a suffix across families', () => {
    // The whole hard-negative case 7 rests on this line.
    expect(normalizeAddress(OAK_ST).canonical).not.toBe(
      normalizeAddress(OAK_AVE).canonical,
    );
  });

  it('preserves directionals', () => {
    const north = normalizeAddress('1220 N Industrial Pkwy, Gary IN 46406');
    const south = normalizeAddress('1220 S Industrial Pkwy, Gary IN 46406');

    expect(north.canonical).toContain(' N ');
    expect(south.canonical).toContain(' S ');
    expect(north.canonical).not.toBe(south.canonical);
  });

  it('does not rewrite state codes that collide with nothing in the maps', () => {
    // A cheap regression guard: the suffix and directional maps are keyed by
    // lowercase word, and a two-letter state that happened to be a key would be
    // silently rewritten in every address in the corpus.
    for (const state of ['IL', 'IN', 'OH', 'CA', 'PA', 'VA', 'VT', 'MN', 'MO', 'ND']) {
      expect(normalizeAddress(`100 Main St, Springfield ${state} 00000`).canonical).toContain(
        ` ${state} `,
      );
    }
  });
});

describe('addressSimilarity', () => {
  const OAK_ST = normalizeAddress('4500 Oak St, Rockford, IL 61103').canonical;
  const OAK_AVE = normalizeAddress('4500 Oak Ave, Rockford, IL 61103').canonical;

  it('is 1 for identical strings and never used for merging', () => {
    expect(addressSimilarity(OAK_ST, OAK_ST)).toBe(1);
  });

  it('rates the ST/AVE pair above the near-duplicate reporting threshold', () => {
    // 3 edits over a 30-character string. This is the number that decides
    // whether case 7 gets reported at all.
    expect(addressSimilarity(OAK_ST, OAK_AVE)).toBeCloseTo(0.9, 5);
    expect(addressSimilarity(OAK_ST, OAK_AVE)).toBeGreaterThanOrEqual(
      GUIDELINES.nearDuplicateAddressSimilarity,
    );
  });

  it('is length-sensitive, which is a real limitation of the threshold', () => {
    // The same semantic difference between two *bare* street addresses scores
    // 0.75 and would fall below the threshold, because the denominator is the
    // string length rather than anything about addresses. The corpus carries
    // city/state/ZIP so this does not bite, but a shorter address format would
    // silently stop producing near-duplicate reports. Asserted here so the
    // fragility is recorded rather than discovered later.
    expect(addressSimilarity('4500 OAK ST', '4500 OAK AVE')).toBeCloseTo(0.75, 5);
    expect(addressSimilarity('4500 OAK ST', '4500 OAK AVE')).toBeLessThan(
      GUIDELINES.nearDuplicateAddressSimilarity,
    );
  });

  it('rates a one-character directional flip very high', () => {
    const north = normalizeAddress('1220 N Industrial Pkwy, Gary IN 46406').canonical;
    const south = normalizeAddress('1220 S Industrial Pkwy, Gary IN 46406').canonical;

    expect(addressSimilarity(north, south)).toBeGreaterThan(0.95);
  });
});

describe('distinguishingAddressToken', () => {
  const canon = (raw: string) => normalizeAddress(raw).canonical;

  it('names the suffix when that is the difference', () => {
    expect(
      distinguishingAddressToken(
        canon('4500 Oak St, Rockford, IL 61103'),
        canon('4500 Oak Ave, Rockford, IL 61103'),
      ),
    ).toBe('different street suffix (ST vs AVE)');
  });

  it('names the directional when that is the difference', () => {
    expect(
      distinguishingAddressToken(
        canon('1220 N Industrial Pkwy, Gary IN 46406'),
        canon('1220 S Industrial Pkwy, Gary IN 46406'),
      ),
    ).toBe('different directional (N vs S)');
  });

  it('names the street number when that is the difference', () => {
    expect(distinguishingAddressToken('4500 OAK ST', '4700 OAK ST')).toBe(
      'different street number (4500 vs 4700)',
    );
  });

  it('returns null when the difference is not in a token that carries meaning', () => {
    // Two different streets entirely. The rule's job is to explain a
    // near-duplicate, not to narrate every difference, and a null here means
    // the caller reports nothing rather than reporting something vague.
    expect(distinguishingAddressToken('4500 OAK ST', '4500 ELM ST')).toBeNull();
  });

  it('returns null when more than one token differs', () => {
    expect(distinguishingAddressToken('4500 OAK ST', '4700 OAK AVE')).toBeNull();
  });

  it('returns null when the addresses are not even the same shape', () => {
    expect(distinguishingAddressToken('4500 OAK ST', '4500 OAK ST UNIT B')).toBeNull();
  });
});

describe('liability limits', () => {
  it('reads three spellings of the same limit as one canonical', () => {
    expect(normalizeLimit('$1M combined single limit')?.canonical).toBe('1000000 CSL');
    expect(normalizeLimit('1,000,000 CSL')?.canonical).toBe('1000000 CSL');
  });

  it('records both pieces of domain work when both were needed', () => {
    expect(normalizeLimit('$1M combined single limit')?.domainRule).toBe(
      'money.magnitude-shorthand + limit.basis-from-prose',
    );
    expect(normalizeLimit('1,000,000 CSL')?.domainRule).toBeUndefined();
  });

  it('keeps the basis, because an unstated basis is not the same cover', () => {
    // Normalising "$1,000,000" into the CSL bucket would be the aggressive
    // choice: it makes more things match, and it quietly asserts something the
    // document did not say.
    expect(normalizeLimit('$1,000,000')?.canonical).toBe('1000000 UNSPECIFIED');
    expect(normalizeLimit('$1,000,000')?.canonical).not.toBe(
      normalizeLimit('1,000,000 CSL')?.canonical,
    );
  });

  it('returns null when there is no amount to anchor the limit', () => {
    expect(normalizeLimit('combined single limit')).toBeNull();
  });
});

describe('text fallback', () => {
  it('collapses case and whitespace and nothing else', () => {
    expect(normalizeText('  Rear-end   collision,  I-80  ').canonical).toBe(
      'rear-end collision, i-80',
    );
  });
});
