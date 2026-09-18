import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Classification, EngineId, ReviewDecision, ReviewVerdict } from './types';

/**
 * Reviewer decisions, stored as a JSON file on disk.
 *
 * A file is the right storage here and not a compromise. The reviewer log is
 * the only mutable state in the project, it is append-mostly, it is read in
 * full every time it is read, and the entire point of collecting it is that a
 * human can open it and see what was decided and why. A database would add an
 * install step, a migration story and a schema that has to be trusted, in
 * exchange for query capabilities nothing here needs.
 *
 * It is also the one file the demo writes to, so `npm run reset` restores the
 * repo to a clean state without touching anything else.
 *
 * No users, no auth, no tenancy: the reviewer's name is a string they type. In
 * a real deployment this is the boundary where identity would have to become
 * real, and that is called out here rather than being quietly implied.
 */

const DEFAULT_PATH = join(process.cwd(), 'data', 'reviews.json');

export interface ReviewStoreShape {
  version: 1;
  decisions: ReviewDecision[];
}

const EMPTY: ReviewStoreShape = { version: 1, decisions: [] };

function storePath(override?: string): string {
  return override ?? process.env.TRUST_BENCH_REVIEWS ?? DEFAULT_PATH;
}

/**
 * A missing file means "nobody has reviewed anything yet", which is the normal
 * state of a fresh clone, so it is not an error. A malformed file *is* an error
 * worth surfacing: silently starting over would destroy a reviewer's log the
 * first time a write was interrupted.
 */
export function readDecisions(path?: string): ReviewDecision[] {
  const file = storePath(path);
  if (!existsSync(file)) return [];

  const text = readFileSync(file, 'utf8').trim();
  if (text === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(
      `Review log at ${file} is not valid JSON. Refusing to overwrite it — ` +
        `move it aside if you want to start fresh.`,
      { cause },
    );
  }

  const shape = parsed as Partial<ReviewStoreShape>;
  if (!shape || !Array.isArray(shape.decisions)) {
    throw new Error(`Review log at ${file} has an unexpected shape.`);
  }

  return shape.decisions;
}

/** Write through a temporary file so an interrupted write cannot truncate the log. */
function writeDecisions(decisions: ReviewDecision[], path?: string): void {
  const file = storePath(path);
  mkdirSync(dirname(file), { recursive: true });

  const payload: ReviewStoreShape = { version: 1, decisions };
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

export interface RecordReviewInput {
  packetId: string;
  groupKey: string;
  engine: EngineId;
  pipelineClassification: Classification;
  verdict: ReviewVerdict;
  reason: string;
  reviewer: string;
}

export class ReviewValidationError extends Error {}

/**
 * The reason is required, including on an accept.
 *
 * A one-click accept produces a log that says a human looked at something and
 * records nothing about what they saw, which is worth very little when the
 * point of the log is to calibrate the pipeline against human judgement. Making
 * the reviewer write a sentence is a real cost and it is chosen deliberately:
 * "agreed, the endorsement names the unit" is the datum, not the click.
 */
function validate(input: RecordReviewInput): void {
  if (!input.packetId) throw new ReviewValidationError('A decision needs a packet.');
  if (!input.groupKey) throw new ReviewValidationError('A decision needs a finding.');
  if (!input.reviewer.trim()) {
    throw new ReviewValidationError('A decision needs a reviewer name.');
  }
  if (input.reason.trim().length < 8) {
    throw new ReviewValidationError(
      'Give a reason of at least a few words. A verdict with no reasoning cannot ' +
        'be audited later, and calibration is exactly the thing being audited.',
    );
  }
}

/**
 * Records a verdict. A reviewer changing their mind about a finding replaces
 * their earlier decision rather than appending a second one, so the log always
 * reads as "what this reviewer currently thinks" and agreement rates are not
 * skewed by someone clicking twice.
 */
export function recordReview(
  input: RecordReviewInput,
  path?: string,
  now: Date = new Date(),
): ReviewDecision {
  validate(input);

  const decision: ReviewDecision = {
    id: `${input.packetId}::${input.groupKey}::${input.engine}::${input.reviewer.trim()}`,
    packetId: input.packetId,
    groupKey: input.groupKey,
    engine: input.engine,
    pipelineClassification: input.pipelineClassification,
    verdict: input.verdict,
    reason: input.reason.trim(),
    reviewer: input.reviewer.trim(),
    decidedAt: now.toISOString(),
  };

  const existing = readDecisions(path).filter((d) => d.id !== decision.id);
  const next = [...existing, decision].sort((a, b) =>
    a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0,
  );

  writeDecisions(next, path);
  return decision;
}

export function clearReviews(path?: string): void {
  writeDecisions(EMPTY.decisions, path);
}

/** Decisions for one packet, newest last, for rendering next to the findings. */
export function decisionsForPacket(packetId: string, path?: string): ReviewDecision[] {
  return readDecisions(path).filter((d) => d.packetId === packetId);
}
