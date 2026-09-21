import { describe, expect, it } from 'vitest';

import {
  comparisonLines,
  compareEngines,
  pct,
  pctWithCount,
  rate,
  scoreEngine,
  summaryLines,
  type GradedGroup,
  type Scorecard,
} from '../src/lib/score';
import type {
  Classification,
  EngineId,
  Finding,
  Packet,
  PacketAnalysis,
  ReviewDecision,
  TaxonomyCaseId,
} from '../src/lib/types';

/**
 * The scorer is graded here against hand-built fixtures rather than against the
 * real corpus.
 *
 * That separation is deliberate. If these tests ran on the sixteen real packets,
 * a change in the classifier would move the numbers and I would have to decide
 * whether the scorer broke or the classifier improved — which is exactly the
 * ambiguity an evaluation harness exists to remove. Fixtures pin the arithmetic.
 * `pipeline.test.ts` runs the real corpus and asserts behaviour, not arithmetic.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakePacket(
  id: string,
  bucket: 'true_conflict' | 'hard_negative',
  taxonomyCase: TaxonomyCaseId,
  expected: Record<string, Classification>,
): Packet {
  return {
    id,
    title: `Packet ${id}`,
    insured: `Fixture ${id}`,
    taxonomyCase,
    bucket,
    synopsis: 'Fixture packet. Not part of the corpus.',
    documents: [],
    groundTruth: {
      focusGroup: Object.keys(expected)[0] ?? 'policy::none',
      why: 'Fixture.',
      expected,
    },
  };
}

function finding(
  groupKey: string,
  classification: Classification,
  confidence: number,
): Finding {
  return {
    groupKey,
    label: groupKey.split('::')[1] ?? groupKey,
    entityKey: 'policy',
    classification,
    confidence,
    rationale: 'Fixture.',
    signals: ['fixture'],
    evidence: [],
  };
}

function fakeAnalysis(
  packetId: string,
  findings: Finding[],
  engine: EngineId = 'reference',
): PacketAnalysis {
  return { packetId, engine, facts: [], groups: [], findings };
}

/**
 * Four graded rows, chosen to produce one of every non-conflict outcome:
 *   a  benign_variant / benign_variant   label_correct
 *   b  supersession   / benign_variant   label_wrong
 *   c  supersession   / supersession     label_correct
 *   d  benign_variant / (nothing)        dropped
 */
const PACKET_A = fakePacket('A', 'hard_negative', 6, {
  'policy::a': 'benign_variant',
  'policy::b': 'supersession',
  'policy::c': 'supersession',
  'policy::d': 'benign_variant',
});
const ANALYSIS_A = fakeAnalysis('A', [
  finding('policy::a', 'benign_variant', 0.9),
  finding('policy::b', 'benign_variant', 0.9),
  finding('policy::c', 'supersession', 0.7),
]);

/** A real conflict the engine stayed silent about, plus a correctly quiet field. */
const PACKET_B = fakePacket('B', 'true_conflict', 1, {
  'policy::conflict_key': 'conflict',
  'policy::quiet_key': 'consistent',
});
const ANALYSIS_B = fakeAnalysis('B', [finding('policy::quiet_key', 'consistent', 0.99)]);

/** Two false conflicts on a clean packet: one declared, one nobody asked about. */
const PACKET_C = fakePacket('C', 'hard_negative', 7, {
  'policy::roster': 'benign_variant',
});
const ANALYSIS_C = fakeAnalysis('C', [
  finding('policy::roster', 'conflict', 0.8),
  finding('policy::extra', 'conflict', 0.8),
]);

const PACKETS = [PACKET_A, PACKET_B, PACKET_C];
const ANALYSES = [ANALYSIS_A, ANALYSIS_B, ANALYSIS_C];

const card = (decisions: ReviewDecision[] = []): Scorecard =>
  scoreEngine({ engine: 'reference', packets: PACKETS, analyses: ANALYSES, decisions });

const rows = (c: Scorecard, predicate: (r: GradedGroup) => boolean) =>
  c.graded.filter(predicate);

// ---------------------------------------------------------------------------

describe('rate', () => {
  it('reports null rather than zero when there was nothing to measure', () => {
    // A 0% false-positive rate over zero opportunities is not a 0% rate, and
    // rendering it as one is how a thin evaluation flatters itself.
    expect(rate(0, 0).value).toBeNull();
    expect(rate(0, 4).value).toBe(0);
  });

  it('carries its own numerator and denominator into the rendered string', () => {
    expect(pctWithCount(rate(3, 8))).toBe('37.5% (3 of 8)');
    expect(pct(rate(1, 3))).toBe('33.3%');
    expect(pct(rate(0, 0))).toBe('—');
    expect(pctWithCount(rate(0, 0))).toBe('— (0 of 0)');
  });
});

describe('the two-way ground-truth contract', () => {
  it('scores a declared group the engine ignored as dropped, not as a pass', () => {
    const row = card().graded.find((r) => r.groupKey === 'policy::d')!;

    expect(row.declared).toBe(true);
    expect(row.predicted).toBe('consistent');
    expect(row.confidence).toBeNull();
    expect(row.outcome).toBe('dropped');
    expect(row.correct).toBe(false);
  });

  it('scores an undeclared group the engine reported on as the engine’s problem', () => {
    // Ground truth does not enumerate the dozens of fields nothing disagrees
    // about, so silence means `consistent`. Anything the engine says about a
    // group nobody declared is therefore something the author did not intend.
    const row = card().graded.find((r) => r.groupKey === 'policy::extra')!;

    expect(row.declared).toBe(false);
    expect(row.expected).toBe('consistent');
    expect(row.outcome).toBe('false_conflict');
  });

  it('counts an undeclared conflict as a false conflict and not as noise', () => {
    // The distinction matters: noise is a finding a reviewer glances at and
    // dismisses, a false conflict is one that goes back to the broker.
    const c = card();

    expect(c.noiseRate.n).toBe(0);
    expect(rows(c, (r) => r.outcome === 'false_conflict')).toHaveLength(2);
  });

  it('grades every declared key and every reported key exactly once', () => {
    const c = card();
    const keys = c.graded.map((r) => `${r.packetId}::${r.groupKey}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(c.groupsEvaluated).toBe(8); // A: 4, B: 2, C: 2
  });
});

describe('outcome taxonomy', () => {
  const byKey = (key: string) => card().graded.find((r) => r.groupKey === key)!;

  it('separates a missed conflict from an ordinary wrong label', () => {
    // A missed conflict is the error that reaches an underwriter as a priced
    // policy. It never collapses into `dropped`, whatever the engine said.
    expect(byKey('policy::conflict_key').outcome).toBe('conflict_missed');
  });

  it('calls a wrong non-conflict label wrong without calling it a conflict', () => {
    expect(byKey('policy::b').outcome).toBe('label_wrong');
  });

  it('does not put a correct silence in front of a human', () => {
    expect(byKey('policy::quiet_key').outcome).toBe('quiet');
    // Five rows reach a reviewer: A's three findings and C's two. B contributes
    // none — its dropped conflict is a failure, but it is not review load.
    expect(card().findingsReported).toBe(5);
    expect(card().reviewLoad).toBeCloseTo(5 / 3, 6);
  });
});

describe('headline rates', () => {
  it('leads with the false-positive rate on clean packets, per packet', () => {
    const c = card();

    // Two hard negatives (A and C); only C was interrupted about.
    expect(c.hardNegativePacketFpr).toEqual({ n: 1, of: 2, value: 0.5 });
    // Six hard-negative decisions; two of them were false conflicts.
    expect(c.hardNegativeGroupFpr.n).toBe(2);
    expect(c.hardNegativeGroupFpr.of).toBe(6);
  });

  it('reports recall underneath it, and reports zero recall as zero', () => {
    const c = card();

    expect(c.conflictRecall).toEqual({ n: 0, of: 1, value: 0 });
    expect(c.conflictPacketRecall).toEqual({ n: 0, of: 1, value: 0 });
  });

  it('measures label accuracy only over hand-authored labels', () => {
    const c = card();

    // Seven declared rows; three reproduced exactly.
    expect(c.labelAccuracy.of).toBe(7);
    expect(c.labelAccuracy.n).toBe(3);
  });

  it('measures the drop rate against labels that asked for a finding', () => {
    const c = card();

    // Six declared rows expect something other than silence; one was dropped.
    expect(c.dropRate).toEqual({ n: 1, of: 6, value: 1 / 6 });
  });
});

describe('re-derivability', () => {
  // The claim in score.ts is that every headline can be recomputed from the
  // `graded` rows shipped alongside it. These tests are that claim, executed.
  const c = card();

  it('re-derives the hard-negative packet FPR from the rows', () => {
    const tripped = new Set(
      rows(c, (r) => r.bucket === 'hard_negative' && r.outcome === 'false_conflict').map(
        (r) => r.packetId,
      ),
    );
    const cleanPackets = new Set(rows(c, (r) => r.bucket === 'hard_negative').map((r) => r.packetId));

    expect(tripped.size).toBe(c.hardNegativePacketFpr.n);
    expect(cleanPackets.size).toBe(c.hardNegativePacketFpr.of);
  });

  it('re-derives conflict recall from the rows', () => {
    const conflicts = rows(c, (r) => r.expected === 'conflict');
    const caught = conflicts.filter((r) => r.outcome === 'conflict_caught');

    expect(caught.length).toBe(c.conflictRecall.n);
    expect(conflicts.length).toBe(c.conflictRecall.of);
  });

  it('re-derives label accuracy from the rows', () => {
    const declared = rows(c, (r) => r.declared);

    expect(declared.filter((r) => r.correct).length).toBe(c.labelAccuracy.n);
    expect(declared.length).toBe(c.labelAccuracy.of);
  });

  it('re-derives the confusion matrix from the declared rows', () => {
    for (const row of rows(c, (r) => r.declared)) {
      expect(c.confusion[row.expected][row.predicted]).toBeGreaterThan(0);
    }
    expect(c.confusion.supersession.benign_variant).toBe(1);
    expect(c.confusion.benign_variant.conflict).toBe(1);
    expect(c.confusion.conflict.consistent).toBe(1);
  });
});

describe('calibration', () => {
  const calibration = card().calibration;

  it('bins only the findings a reviewer was actually shown', () => {
    // Five reported findings carry a confidence: 0.7, 0.8, 0.8, 0.9, 0.9.
    // The dropped row has none and the correctly quiet row was never shown.
    expect(calibration.count).toBe(5);
  });

  it('puts a score on the lower edge of its bin, not the upper', () => {
    const bin = calibration.bins.find((b) => b.lower === 0.9)!;

    expect(bin.count).toBe(2);
    expect(bin.correct).toBe(1);
    expect(bin.observed).toBe(0.5);
    expect(bin.claimed).toBeCloseTo(0.9, 6);
    expect(bin.gap).toBeCloseTo(-0.4, 6); // negative: over-confident
  });

  it('computes ECE as the bin-size-weighted mean absolute gap', () => {
    // (1/5)(0.3) + (2/5)(0.8) + (2/5)(0.4)
    expect(calibration.ece).toBeCloseTo(0.54, 6);
  });

  it('leaves empty bins visible rather than dropping them from the chart', () => {
    expect(calibration.bins).toHaveLength(7);
    const empty = calibration.bins.filter((b) => b.count === 0);

    expect(empty.length).toBeGreaterThan(0);
    for (const bin of empty) {
      expect(bin.observed).toBeNull();
      expect(bin.claimed).toBeNull();
      expect(bin.gap).toBeNull();
    }
  });

  it('says out loud how thin the sample is', () => {
    expect(calibration.note).toMatch(/single-digit|thin|Read the shape/i);
  });
});

describe('human agreement', () => {
  const decision = (
    groupKey: string,
    verdict: 'accept' | 'reject' | 'unresolved',
    pipelineClassification: Classification,
  ): ReviewDecision => ({
    id: `A::${groupKey}::reference::tester`,
    packetId: 'A',
    groupKey,
    engine: 'reference',
    pipelineClassification,
    verdict,
    reason: 'fixture reasoning, long enough to pass validation',
    reviewer: 'tester',
    decidedAt: '2026-02-01T00:00:00Z',
  });

  const decisions = [
    decision('policy::a', 'accept', 'benign_variant'), // agrees, and is right
    decision('policy::b', 'accept', 'benign_variant'), // agrees, and is wrong
    decision('policy::c', 'reject', 'supersession'), // disagrees, and is wrong
    decision('policy::d', 'unresolved', 'consistent'), // declines to decide
  ];
  const human = card(decisions).human;

  it('keeps "unresolved" out of the agreement denominator', () => {
    // A reviewer saying "the packet does not give me enough to decide" is not a
    // vote against the pipeline, and scoring it as one would punish the honest
    // answer.
    expect(human.decisions).toBe(4);
    expect(human.unresolved).toBe(1);
    expect(human.agreementRate).toEqual({ n: 2, of: 3, value: 2 / 3 });
  });

  it('records the cases where the reviewer and the ground truth disagree', () => {
    // These are the interesting rows: either the label is wrong and the
    // reviewer waved it through, or the label is right and the reviewer did
    // not believe it. Both are worth a human reading later.
    const keys = human.disputed.map((d) => d.groupKey).sort();

    expect(keys).toEqual(['policy::b', 'policy::c']);
    expect(human.disputed[0].reason).toMatch(/fixture reasoning/);
  });

  it('does not count an unresolved verdict as a dispute', () => {
    expect(human.disputed.map((d) => d.groupKey)).not.toContain('policy::d');
  });

  it('calibrates against what the reviewer did, not against ground truth', () => {
    // This chart answers a different question from the main one: when the
    // pipeline says 0.9, how often does a human accept it? Ground truth does
    // not enter into it.
    expect(human.calibration.count).toBe(3);
    expect(human.calibration.ece).toBeCloseTo(0.3, 6);

    const high = human.calibration.bins.find((b) => b.lower === 0.9)!;
    expect(high.count).toBe(2);
    expect(high.correct).toBe(2); // both accepted, including the wrong label
  });
});

describe('reviewer-vs-reviewer agreement', () => {
  const two = (
    groupKey: string,
    first: { reviewer: string; verdict: 'accept' | 'reject' | 'unresolved' },
    second: { reviewer: string; verdict: 'accept' | 'reject' | 'unresolved' },
  ): ReviewDecision[] =>
    [first, second].map((v) => ({
      id: `A::${groupKey}::reference::${v.reviewer}`,
      packetId: 'A',
      groupKey,
      engine: 'reference',
      pipelineClassification: 'benign_variant' as Classification,
      verdict: v.verdict,
      reason: 'fixture reasoning, long enough to pass validation',
      reviewer: v.reviewer,
      decidedAt: '2026-02-01T00:00:00Z',
    }));

  it('stays empty until two reviewers rule on one finding', () => {
    // One agreeable reviewer is not agreement. The null rate must not render
    // as 0% or 100% anywhere.
    const solo = card(
      two('policy::a', { reviewer: 'amy', verdict: 'accept' }, { reviewer: 'amy', verdict: 'accept' }).slice(0, 1),
    ).interReviewer;
    expect(solo.findings).toBe(0);
    expect(solo.totalPairs).toBe(0);
    expect(solo.pairwiseAgreement).toEqual({ n: 0, of: 0, value: null });
  });

  it('counts pairwise agreement across shared findings', () => {
    const inter = card([
      ...two('policy::a', { reviewer: 'amy', verdict: 'accept' }, { reviewer: 'bo', verdict: 'accept' }),
      ...two('policy::b', { reviewer: 'amy', verdict: 'accept' }, { reviewer: 'bo', verdict: 'reject' }),
    ]).interReviewer;
    expect(inter.findings).toBe(2);
    expect(inter.totalPairs).toBe(2);
    expect(inter.agreedPairs).toBe(1);
    expect(inter.pairwiseAgreement).toEqual({ n: 1, of: 2, value: 0.5 });
    expect(inter.disagreements.map((d) => d.groupKey)).toEqual(['policy::b']);
  });

  it('keeps one voice per reviewer on a re-review', () => {
    // Amy first rejected, then accepted; the stale reject must not linger as
    // a second voice. (The store enforces this on write; the scorer does not
    // trust it.)
    const amyReject = two('policy::a', { reviewer: 'amy', verdict: 'reject' }, { reviewer: 'bo', verdict: 'accept' })[0];
    const amyAccept = two('policy::a', { reviewer: 'amy', verdict: 'accept' }, { reviewer: 'bo', verdict: 'accept' });
    const inter = card([amyReject, ...amyAccept]).interReviewer;
    expect(inter.totalPairs).toBe(1);
    expect(inter.agreedPairs).toBe(1);
  });
});

describe('per-case and per-packet scoring', () => {
  it('refuses to mark a case passed when it has no packets behind it', () => {
    // Without the `declared > 0` guard, every taxonomy case the fixture set does
    // not exercise would vacuously read "pass" — an all-green scorecard that
    // measured nothing.
    const empty = card().byCase.filter((c) => c.packets.length === 0);

    expect(empty.length).toBeGreaterThan(0);
    for (const c of empty) expect(c.passed).toBe(false);
  });

  it('marks a packet passed only when every label matched and nothing was added', () => {
    const clean = fakePacket('D', 'hard_negative', 8, { 'policy::ok': 'benign_variant' });
    const noisy = fakePacket('E', 'hard_negative', 8, { 'policy::ok': 'benign_variant' });

    const c = scoreEngine({
      engine: 'reference',
      packets: [clean, noisy],
      analyses: [
        fakeAnalysis('D', [finding('policy::ok', 'benign_variant', 0.96)]),
        fakeAnalysis('E', [
          finding('policy::ok', 'benign_variant', 0.96),
          finding('policy::uninvited', 'benign_variant', 0.7),
        ]),
      ],
    });

    expect(c.byPacket.find((p) => p.packetId === 'D')!.passed).toBe(true);
    // E reproduced its one label correctly and still fails, because it also
    // raised a finding nobody asked for.
    const e = c.byPacket.find((p) => p.packetId === 'E')!;
    expect(e.declaredCorrect).toBe(e.declared);
    expect(e.noise).toBe(1);
    expect(e.passed).toBe(false);
  });
});

describe('comparing two engines', () => {
  // Same packets, two different sets of findings — which is the only honest way
  // to attribute a difference to the engine rather than to the input.
  const better = scoreEngine({
    engine: 'reference',
    packets: [PACKET_B, PACKET_C],
    analyses: [
      fakeAnalysis('B', [finding('policy::conflict_key', 'conflict', 0.95)]),
      fakeAnalysis('C', [finding('policy::roster', 'benign_variant', 0.9)]),
    ],
  });
  const worse = scoreEngine({
    engine: 'naive',
    packets: [PACKET_B, PACKET_C],
    analyses: [
      fakeAnalysis('B', [], 'naive'),
      fakeAnalysis('C', [finding('policy::roster', 'conflict', 0.8)], 'naive'),
    ],
  });
  const comparison = compareEngines(better, worse);

  it('names which conflicts each engine caught alone, rather than a delta', () => {
    expect(comparison.onlyReferenceCaught).toEqual(['B · conflict_key']);
    expect(comparison.onlyBaselineCaught).toEqual([]);
  });

  it('names which false alarms the reference engine avoids', () => {
    expect(comparison.falseConflictsAvoided).toEqual(['C · roster']);
    expect(comparison.falseConflictsIntroduced).toEqual([]);
  });

  it('states in the rendered output that the baseline is my own construction', () => {
    // A hard requirement of the brief, asserted rather than trusted to a
    // comment: nothing here may read as a measurement of anyone's product.
    const text = comparisonLines(comparison).join('\n');

    expect(text).toMatch(/my own construction/);
    expect(text).toMatch(/not a model of any real product/);
  });
});

describe('plain-text summary', () => {
  it('renders every headline with its sample size attached', () => {
    const text = summaryLines(card()).join('\n');

    expect(text).toMatch(/false-positive rate, clean packets\s+50\.0% \(1 of 2\)/);
    expect(text).toMatch(/conflict recall, per conflict\s+0\.0% \(0 of 1\)/);
    expect(text).toMatch(/calibration error \(ECE\)/);
  });

  it('labels the engine it is reporting on', () => {
    expect(summaryLines(card())[0]).toBe('Reference engine');
  });
});
