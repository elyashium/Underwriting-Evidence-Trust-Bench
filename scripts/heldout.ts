/**
 * `npm run bench:heldout` — the reference engine against sixty packets it never
 * saw during development.
 *
 * Same structures as the corpus, all-new values: names, VINs, addresses,
 * dates, amounts, counts. The rules in `src/lib` are frozen with respect to
 * this set, so a failure here is either a generator lie (fix the generator)
 * or a genuine gap (report it, do not tune the rules to the fixture).
 *
 * Exits non-zero on any failing taxonomy case, same as `npm run bench`.
 */

import { HELDOUT, HELDOUT_VARIANTS_PER_CASE } from '../src/data/heldout/generator';
import { analyzePacket } from '../src/lib/classify';
import { scoreEngine } from '../src/lib/score';

const analyses = HELDOUT.map(analyzePacket);
const card = scoreEngine({ engine: 'reference', packets: HELDOUT, analyses });

const out = (line = '') => process.stdout.write(`${line}\n`);

out();
out('Held-out value variants');
out('='.repeat(64));
out(
  `${HELDOUT.length} generated packets (${HELDOUT_VARIANTS_PER_CASE} per taxonomy case), ` +
    `all values unseen by the rules.`,
);
out('Same structures as the corpus, new names, VINs, addresses, dates, amounts.');
out('Synthetic self-test — a generalisation check, not a measurement of anything real.');
out();
out(`  false positives, clean packets   ${card.hardNegativePacketFpr.n} of ${card.hardNegativePacketFpr.of}`);
out(`  conflicts caught                 ${card.conflictRecall.n} of ${card.conflictRecall.of}`);
out(`  labels reproduced                ${card.labelAccuracy.n} of ${card.labelAccuracy.of}`);
out();
out('  by taxonomy case');
for (const row of card.byCase) {
  const flag = row.passed ? 'pass' : 'FAIL';
  const detail =
    `${row.declaredCorrect}/${row.declared} labels` +
    (row.conflictsMissed ? `, ${row.conflictsMissed} missed` : '') +
    (row.falseConflicts ? `, ${row.falseConflicts} false` : '') +
    (row.noise ? `, ${row.noise} noise` : '');
  out(`     ${row.taxonomyCase.id}. ${row.taxonomyCase.name}  ${flag}  ${detail}`);
}
out();

const failed = card.byCase.filter((c) => !c.passed);
if (failed.length > 0) {
  out(`${failed.length} held-out case(s) failing — see above.`);
  out();
  process.exitCode = 1;
}
