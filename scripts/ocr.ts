/**
 * `npm run ocr` — extraction stability under synthetic scan noise.
 *
 * Each corpus packet is copied with a few percent of glyphs flipped the way
 * scanners flip them (0/O, 1/I, 5/S, …), then run through the reference
 * engine. A run is stable when every finding that would reach a reviewer
 * keeps its classification.
 *
 * Informational only: exits zero regardless, because noise-robustness is a
 * measurement to watch, not a gate pretending real scans were tested. No
 * paper was scanned for this script. `OCR_RATE` and `OCR_SEEDS` tune the
 * noise level and repetition count.
 */

import { PACKETS } from '../src/data/packets';
import { analyzePacket } from '../src/lib/classify';
import { perturbText } from '../src/lib/ocr';
import type { Packet } from '../src/lib/types';

const rate = Math.min(0.2, Math.max(0, Number(process.env.OCR_RATE ?? 0.015) || 0.015));
const seeds = (process.env.OCR_SEEDS ?? '1,2,3')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

const keyOf = (packet: Packet) => (groupKey: string, classification: string) =>
  `${groupKey}::${classification}`;

const out = (line = '') => process.stdout.write(`${line}\n`);

out();
out('OCR stability (synthetic glyph noise — no real scans)');
out('='.repeat(64));

let stable = 0;
let total = 0;
const flips: string[] = [];
const tally = new Map<string, number>();

const countFlip = (key: string) => {
  const group = key.split('::').slice(0, -1).join('::');
  tally.set(group, (tally.get(group) ?? 0) + 1);
};

for (const packet of PACKETS) {
  const clean = new Set(
    analyzePacket(packet).findings
      .filter((f) => f.classification !== 'consistent')
      .map((f) => keyOf(packet)(f.groupKey, f.classification)),
  );
  seeds.forEach((seed, i) => {
    total += 1;
    const noisy: Packet = {
      ...packet,
      id: `${packet.id}~ocr${seed}`,
      documents: packet.documents.map((d, j) => ({
        ...d,
        content: perturbText(d.content, seed * 1000 + j, rate),
      })),
    };
    const got = new Set(
      analyzePacket(noisy).findings
        .filter((f) => f.classification !== 'consistent')
        .map((f) => keyOf(packet)(f.groupKey, f.classification)),
    );
    const same = clean.size === got.size && [...clean].every((k) => got.has(k));
    if (same) {
      stable += 1;
    } else {
      const missing = [...clean].filter((k) => !got.has(k));
      const extra = [...got].filter((k) => !clean.has(k));
      for (const key of [...missing, ...extra]) countFlip(key);
      flips.push(
        `${packet.id} seed ${seed}: lost [${missing.join('; ') || '—'}] gained [${extra.join('; ') || '—'}]`,
      );
    }
  });
}

out(`  ${(rate * 100).toFixed(1)}% glyph noise × ${seeds.length} seeds over ${PACKETS.length} packets`);
out(`  stable runs: ${stable} of ${total}`);
out();
if (flips.length > 0) {
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0) {
    out('  most-flipped groups (where the noise bites):');
    for (const [group, count] of ranked) out(`    ${count}× ${group}`);
    out();
  }
  out('  flipped runs (a finding changed classification under noise):');
  for (const flip of flips) out(`    − ${flip}`);
  out();
}
out('Synthetic noise, synthetic documents. This measures sensitivity to glyph');
out('flips, not performance on real scans.');
