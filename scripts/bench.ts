/**
 * `npm run bench` — the whole scorecard, in the terminal.
 *
 * The UI is the legible surface, but a number that only exists inside a React
 * page is awkward to diff, awkward to paste into a commit message, and
 * impossible to check in CI. This prints the same figures the scorecard renders,
 * computed by the same functions, so there is exactly one implementation of
 * every rate in this repo.
 */

import { runBench } from '../src/lib/bench';
import { comparisonLines, summaryLines } from '../src/lib/score';
import { readDecisions } from '../src/lib/store';

const decisions = readDecisions();
const { reference, baseline, comparison, packets } = runBench(decisions);

const out = (line = '') => process.stdout.write(`${line}\n`);

out();
out('Underwriting Evidence Trust Bench');
out('='.repeat(64));
out(`${packets.length} synthetic packets. Every document is invented.`);
out('This measures two engines I wrote against labels I wrote. It is not a');
out("benchmark of any commercial product, and no number here was produced by");
out('running anything against one.');
out();

for (const line of summaryLines(reference)) out(line);
out();
for (const line of summaryLines(baseline)) out(line);
out();
out('-'.repeat(64));
out();
for (const line of comparisonLines(comparison)) out(line);
out();

if (decisions.length === 0) {
  out('No reviewer verdicts recorded. Run `npm run dev`, open a packet, and');
  out('decide a finding to populate the human-agreement figures.');
} else {
  out(`${decisions.length} reviewer verdicts on record.`);
  if (reference.human.disputed.length > 0) {
    out(
      `${reference.human.disputed.length} disputed — reviewer and hand-authored label disagree:`,
    );
    for (const item of reference.human.disputed) {
      out(
        `  ${item.packetId} ${item.label}: pipeline said ${item.pipelineClassification}, ` +
          `label says ${item.groundTruth}, reviewer ${item.verdict} (${item.reviewer})`,
      );
    }
  }
}
out();

// A failing case is a missing capability, and CI should be able to see it
// without a human reading the table.
const failed = reference.byCase.filter((c) => !c.passed);
if (failed.length > 0) {
  out(`${failed.length} taxonomy case(s) not fully passed:`);
  for (const c of failed) out(`  case ${c.taxonomyCase.id}: ${c.taxonomyCase.name}`);
  out();
  process.exitCode = 1;
}
