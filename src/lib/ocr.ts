import { mulberry32 } from './prng';

/**
 * Synthetic OCR noise: the character confusions a bad scan introduces,
 * applied to document text with a seeded coin per character.
 *
 * This is NOT real OCR output — no paper was scanned, no PDF parsed, no
 * handwriting read. It answers a narrower question honestly: when a few
 * percent of glyphs flip the way scanners flip them, do the pipeline's
 * findings move? A finding that flips under 1.5% noise was never a finding,
 * it was a coincidence with legible text.
 *
 * Structural characters (pipes, colons, newlines, punctuation) are never
 * touched: the harness perturbs readings, not layouts. Mangling a table
 * border would test the table parser, which is a different experiment.
 */

const CONFUSIONS: Record<string, string[]> = {
  '0': ['O'],
  O: ['0'],
  '1': ['I', 'l'],
  I: ['1'],
  l: ['1'],
  '5': ['S'],
  S: ['5'],
  '8': ['B'],
  B: ['8'],
  '2': ['Z'],
  Z: ['2'],
  '6': ['G'],
  G: ['6'],
  m: ['rn'],
  e: ['c'],
  c: ['e'],
};

/** Characters eligible for confusion. Everything else passes through. */
export function confusable(char: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONFUSIONS, char);
}

export function perturbText(text: string, seed: number, rate = 0.015): string {
  if (rate <= 0) return text;
  const rand = mulberry32(seed);
  let out = '';
  for (const char of text) {
    const options = CONFUSIONS[char];
    if (options && rand() < rate) {
      out += options[Math.floor(rand() * options.length)];
    } else {
      out += char;
    }
  }
  return out;
}
