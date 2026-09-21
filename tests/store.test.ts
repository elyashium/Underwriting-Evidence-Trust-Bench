import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ReviewValidationError,
  clearReviews,
  decisionsForPacket,
  isReviewStoreWritable,
  readDecisions,
  recordReview,
  type RecordReviewInput,
} from '../src/lib/store';

/**
 * The review log is the only mutable state in the project, and it is the input
 * to the human-agreement half of the scorecard. If it can silently lose or
 * duplicate a decision, the calibration numbers built on it are fiction.
 */

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trust-bench-'));
  file = join(dir, 'reviews.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const input = (overrides: Partial<RecordReviewInput> = {}): RecordReviewInput => ({
  packetId: 'PKT-009',
  groupKey: 'policy::stated_vehicle_count',
  engine: 'reference',
  pipelineClassification: 'supersession',
  verdict: 'accept',
  reason: 'agreed, the endorsement names the unit it adds',
  reviewer: 'ashish',
  ...overrides,
});

describe('reading', () => {
  it('treats a missing file as "nobody has reviewed anything yet"', () => {
    // The normal state of a fresh clone. Erroring here would make the demo
    // fail on the first run.
    expect(readDecisions(file)).toEqual([]);
  });

  it('treats an empty file the same way', () => {
    writeFileSync(file, '   \n', 'utf8');
    expect(readDecisions(file)).toEqual([]);
  });

  it('refuses to start over on a corrupt file', () => {
    // Silently returning [] would mean the next write destroys a reviewer's
    // log the first time a write was interrupted.
    writeFileSync(file, '{ "version": 1, "decisions": [', 'utf8');
    expect(() => readDecisions(file)).toThrow(/not valid JSON/);
  });

  it('refuses a file of the wrong shape', () => {
    writeFileSync(file, '{"version":1}', 'utf8');
    expect(() => readDecisions(file)).toThrow(/unexpected shape/);
  });
});

describe('recording', () => {
  it('writes a decision that reads back intact', () => {
    const decision = recordReview(input(), file, new Date('2026-02-01T12:00:00Z'));

    expect(decision.decidedAt).toBe('2026-02-01T12:00:00.000Z');
    expect(readDecisions(file)).toEqual([decision]);
  });

  it('writes valid JSON with a version stamp', () => {
    recordReview(input(), file);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));

    expect(parsed.version).toBe(1);
    expect(parsed.decisions).toHaveLength(1);
  });

  it('replaces a reviewer’s earlier verdict instead of appending a second', () => {
    // Otherwise someone changing their mind counts twice and skews the
    // agreement rate towards whichever button they clicked first.
    recordReview(input({ verdict: 'accept' }), file, new Date('2026-02-01T12:00:00Z'));
    recordReview(
      input({ verdict: 'reject', reason: 'on reflection the unit is not on the schedule' }),
      file,
      new Date('2026-02-01T12:05:00Z'),
    );

    const stored = readDecisions(file);
    expect(stored).toHaveLength(1);
    expect(stored[0].verdict).toBe('reject');
  });

  it('keeps two reviewers’ verdicts on the same finding apart', () => {
    recordReview(input({ reviewer: 'ashish' }), file, new Date('2026-02-01T12:00:00Z'));
    recordReview(input({ reviewer: 'sam' }), file, new Date('2026-02-01T12:01:00Z'));

    expect(readDecisions(file)).toHaveLength(2);
  });

  it('orders the log by decision time', () => {
    recordReview(input({ groupKey: 'b' }), file, new Date('2026-02-02T00:00:00Z'));
    recordReview(input({ groupKey: 'a' }), file, new Date('2026-02-01T00:00:00Z'));

    expect(readDecisions(file).map((d) => d.groupKey)).toEqual(['a', 'b']);
  });

  it('leaves no temporary file behind', () => {
    recordReview(input(), file);
    expect(readDecisions(file)).toHaveLength(1);
    expect(() => readFileSync(`${file}.tmp`, 'utf8')).toThrow();
  });
});

describe('validation', () => {
  it('requires a reason even on an accept', () => {
    // A one-click accept records that a human looked at something and nothing
    // about what they saw. The reason is the datum; the click is not.
    expect(() => recordReview(input({ reason: 'ok' }), file)).toThrow(ReviewValidationError);
    expect(() => recordReview(input({ reason: '        ' }), file)).toThrow(
      ReviewValidationError,
    );
  });

  it('requires a reviewer', () => {
    expect(() => recordReview(input({ reviewer: '  ' }), file)).toThrow(ReviewValidationError);
  });

  it('writes nothing when validation fails', () => {
    expect(() => recordReview(input({ reason: 'no' }), file)).toThrow();
    expect(readDecisions(file)).toEqual([]);
  });

  it('trims what it stores', () => {
    const decision = recordReview(
      input({ reviewer: '  ashish  ', reason: '  reads correctly to me  ' }),
      file,
    );

    expect(decision.reviewer).toBe('ashish');
    expect(decision.reason).toBe('reads correctly to me');
  });
});

describe('querying and resetting', () => {
  it('filters to one packet', () => {
    recordReview(input({ packetId: 'PKT-009' }), file);
    recordReview(input({ packetId: 'PKT-011' }), file);

    expect(decisionsForPacket('PKT-009', file)).toHaveLength(1);
    expect(decisionsForPacket('PKT-404', file)).toHaveLength(0);
  });

  it('clears the log without deleting the file', () => {
    recordReview(input(), file);
    clearReviews(file);

    expect(readDecisions(file)).toEqual([]);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
  });
});

describe('writability probe', () => {
  it('reports a normal directory as writable', () => {
    expect(isReviewStoreWritable(file)).toBe(true);
  });

  it('reports an impossible path as not writable, without throwing', () => {
    // A file standing where a directory should be: mkdirSync cannot proceed.
    const blocker = join(dir, 'blocker.json');
    writeFileSync(blocker, '{}', 'utf8');
    expect(isReviewStoreWritable(join(blocker, 'reviews.json'))).toBe(false);
  });

  it('leaves no probe file behind', () => {
    isReviewStoreWritable(file);
    expect(readdirSync(dir)).toEqual([]);
  });
});
