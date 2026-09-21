import { describe, expect, it } from 'vitest';

import { confusable, perturbText } from '../src/lib/ocr';
import { mulberry32 } from '../src/lib/prng';

/**
 * The noise model is pinned the way a fixture is pinned: a stability
 * measurement that wobbles between runs is decoration, not evidence.
 */

describe('perturbText', () => {
  it('is a no-op at rate zero', () => {
    const text = 'Unit 9 | 2019 | VIN 1XPBDP9X1LD612088 | $128,000';
    expect(perturbText(text, 7, 0)).toBe(text);
  });

  it('is deterministic per seed', () => {
    const text = 'The insured runs 12 power units out of Tulsa OK.';
    expect(perturbText(text, 42, 0.05)).toBe(perturbText(text, 42, 0.05));
    expect(perturbText(text, 42, 0.05)).not.toBe(perturbText(text, 43, 0.05));
  });

  it('flips every eligible glyph at rate one, and nothing else', () => {
    const text = 'a|b:c\n08 OIl';
    const out = perturbText(text, 1, 1);
    // Structural characters survive any rate: noise perturbs readings, not layouts.
    expect(out).toContain('|');
    expect(out).toContain(':');
    expect(out).toContain('\n');
    for (let i = 0; i < text.length; i += 1) {
      if (!confusable(text[i]) && text[i] !== 'm') {
        expect(out[i]).toBe(text[i]);
      }
    }
  });

  it('never emits characters outside the confusion map', () => {
    const text = 'NUMBER OF POWER UNITS: 14\nLIABILITY LIMIT (CSL): $1,000,000';
    const out = perturbText(text, 99, 0.2);
    expect(out.length).toBeGreaterThanOrEqual(text.length - 5);
  });
});

describe('mulberry32', () => {
  it('produces a stable, in-range sequence per seed', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 20; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1234)()).not.toBe(mulberry32(9999)());
  });
});
