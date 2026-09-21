/**
 * `npm run grade:llm` — adjudicate every evidence group with a language model,
 * then grade the result against the hand-authored labels.
 *
 * Same extractor, same linker, same derived-group structure as the reference
 * engine; the rule-based adjudication is replaced by model calls (Groq,
 * `openai/gpt-oss-120b` by default). Single-assertion groups never reach the
 * model — there is nothing to adjudicate, and paying for variance is not
 * measurement.
 *
 * Requires GROQ_API_KEY in the environment. The raw run is saved to
 * `data/llm-run-<timestamp>.json` (gitignored) so it can be re-graded with
 * `npm run grade` without paying twice. `LLM_CONCURRENCY` controls parallel
 * calls (default 6). A full run is ~95 adjudications and takes a few minutes.
 *
 * The numbers printed here are a synthetic self-test of one model
 * configuration on one day — evidence about adjudication behaviour, not a
 * claim about any model, vendor, or product.
 */

import { writeFileSync } from 'node:fs';

import { PACKETS } from '../src/data/packets';
import { gradeExternal } from '../src/lib/external';
import {
  GROQ_MODEL,
  analyzeWithLLM,
  groqCallModel,
  llmAnalysesToRun,
} from '../src/lib/llm';
import { comparisonLines, summaryLines } from '../src/lib/score';

if (!process.env.GROQ_API_KEY) {
  process.stderr.write('Set GROQ_API_KEY in the environment first.\n');
  process.exit(2);
}

const concurrency = Math.max(1, Number(process.env.LLM_CONCURRENCY ?? 6) || 6);
const out = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const analyses = [];
  for (const packet of PACKETS) {
    out(`adjudicating ${packet.id} (${packet.documents.length} documents)…`);
    analyses.push(await analyzeWithLLM(packet, groqCallModel, concurrency));
  }

  const engineLabel = `LLM adjudicator (${GROQ_MODEL})`;
  const run = llmAnalysesToRun(engineLabel, analyses);
  const saved = `data/llm-run-${Date.now()}.json`;
  writeFileSync(saved, `${JSON.stringify(run, null, 2)}\n`, 'utf8');

  const { scorecard, comparison } = gradeExternal(PACKETS, run);

  out();
  out(`External grade: ${engineLabel}`);
  out('='.repeat(64));
  out(`Raw run saved to ${saved} — re-grade it any time with`);
  out(`\`npm run grade -- ${saved}\`.`);
  out('Synthetic self-test: one model configuration, sixteen packets I wrote,');
  out('labels I wrote. Read nothing here as a claim about any model or product.');
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
}

main().catch((error) => {
  process.stderr.write(`grade:llm failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
