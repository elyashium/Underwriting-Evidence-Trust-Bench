import { describe, expect, it } from 'vitest';

import { HELDOUT, HELDOUT_VARIANTS_PER_CASE, buildHeldout } from '../src/data/heldout/generator';
import { TAXONOMY } from '../src/data/packets';
import { analyzePacket } from '../src/lib/classify';
import { scoreEngine } from '../src/lib/score';

/**
 * The held-out gate: sixty generated packets the rules never saw, graded by
 * the same two-way contract as the corpus.
 *
 * Determinism matters more than usual here — a flaky generator would fail CI
 * on dice rolls, so the first test pins byte-identical regeneration.
 */

describe('the held-out set', () => {
  it('regenerates deterministically', () => {
    const again = buildHeldout();
    expect(again).toEqual(HELDOUT);
  });

  it('is sixty packets, six per case, evenly split by bucket', () => {
    expect(HELDOUT).toHaveLength(10 * HELDOUT_VARIANTS_PER_CASE);
    expect(HELDOUT.filter((p) => p.bucket === 'true_conflict')).toHaveLength(30);
    expect(HELDOUT.filter((p) => p.bucket === 'hard_negative')).toHaveLength(30);
    for (const taxonomyCase of TAXONOMY) {
      expect(HELDOUT.filter((p) => p.taxonomyCase === taxonomyCase.id)).toHaveLength(
        HELDOUT_VARIANTS_PER_CASE,
      );
    }
  });

  it('uses held-out ids that cannot collide with the corpus', () => {
    for (const packet of HELDOUT) {
      expect(packet.id).toMatch(/^HO-\d+$/);
    }
    expect(new Set(HELDOUT.map((p) => p.id)).size).toBe(HELDOUT.length);
  });
});

describe('reference engine on held-out values', () => {
  const card = scoreEngine({
    engine: 'reference',
    packets: HELDOUT,
    analyses: HELDOUT.map(analyzePacket),
  });

  it('reproduces every generated label with nothing invented', () => {
    expect(card.labelAccuracy.n).toBe(card.labelAccuracy.of);
    expect(card.noiseRate.n).toBe(0);
    expect(card.dropRate.n).toBe(0);
  });

  it('holds the headline rates on unseen values', () => {
    expect(card.hardNegativePacketFpr.n).toBe(0);
    expect(card.conflictRecall.n).toBe(card.conflictRecall.of);
  });

  it('passes every taxonomy case', () => {
    for (const row of card.byCase) {
      expect(row.passed).toBe(true);
    }
  });
});
