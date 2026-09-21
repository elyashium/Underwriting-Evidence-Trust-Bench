/**
 * `npm run grade -- <findings.json>` — grade an outside system's reported
 * findings against the hand-authored labels.
 *
 * The file declares one claim per evidence group the external system wants to
 * be judged on:
 *
 *   {
 *     "engineLabel": "my reconciler v3",
 *     "packets": [
 *       { "packetId": "PKT-003",
 *         "findings": [
 *           { "groupKey": "policy::vehicle_count_reconciliation",
 *             "classification": "conflict", "confidence": 0.9,
 *             "rationale": "optional, one sentence" }
 *         ] }
 *     ]
 *   }
 *
 * Anything the file omits is graded as silence (dropped where a label exists,
 * quiet where it does not); anything it invents is graded as noise or a false
 * conflict. Omitting rows cannot improve the score — that is the point.
 *
 * This is the wedge made runnable: it does not matter how the findings were
 * produced — vendor pipeline, LLM, script — the same two-way contract grades
 * them, next to the reference engine for comparison.
 */

import { readFileSync } from 'node:fs';

import { PACKETS } from '../src/data/packets';
import { gradeExternal, parseExternalRun } from '../src/lib/external';
import { comparisonLines, summaryLines } from '../src/lib/score';

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: npm run grade -- <findings.json>\n');
  process.exit(2);
}

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  process.stderr.write(`Cannot read ${file} as JSON.\n`);
  process.exit(2);
}

const run = parseExternalRun(parsed);
const { scorecard, comparison } = gradeExternal(PACKETS, run);

const out = (line = '') => process.stdout.write(`${line}\n`);

out();
out(`External grade: ${run.engineLabel}`);
out('='.repeat(64));
out('Synthetic self-test: findings produced outside this repo, graded against');
out('labels I wrote on sixteen packets I wrote. Read nothing here as a');
out('measurement of a real system.');
out();
for (const line of summaryLines(scorecard)) out(line);
out();
out('-'.repeat(64));
out();
for (const line of comparisonLines(comparison)) out(line);
out();

const failed = scorecard.byCase.filter((c) => !c.passed);
if (failed.length > 0) {
  out(`${failed.length} taxonomy case(s) not fully passed:`);
  for (const c of failed) out(`  case ${c.taxonomyCase.id}: ${c.taxonomyCase.name}`);
  out();
  process.exitCode = 1;
}
