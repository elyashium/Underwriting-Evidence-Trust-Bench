import { TAXONOMY, type TaxonomyCase } from '../data/packets';
import type {
  Classification,
  EngineId,
  Finding,
  Packet,
  PacketAnalysis,
  ReviewDecision,
  TaxonomyCaseId,
} from './types';

/**
 * The scorecard.
 *
 * This file is the actual deliverable of the project. The extractor, the
 * classifier and the reviewer UI all exist so that this file has something
 * honest to measure; if the numbers below are not trustworthy, nothing else in
 * the repo matters.
 *
 * Two commitments shape it.
 *
 * FIRST: every headline number is re-derivable from `graded`, which is included
 * in the output. No aggregate is computed from a hidden intermediate. A reader
 * who distrusts `conflictRecall` can filter the rows themselves and get the same
 * fraction, and the UI does exactly that when you click a metric. An evaluation
 * harness that asks to be taken on faith is not an evaluation harness.
 *
 * SECOND: the metric that leads is the one that is easiest to cheat by trying
 * less hard. Recall alone rewards flagging everything, so recall is reported
 * underneath the false-positive rate rather than above it. Both are reported at
 * two granularities — per packet, which is what a submission feels like to a
 * human, and per group, which is what the engine actually decides — because the
 * two can differ a lot and quoting only the flattering one is a way of lying
 * with true numbers.
 *
 * The sample is sixteen packets. That is a demonstration of method, not a
 * statistically meaningful result, and every rate here carries its own
 * numerator and denominator so nobody has to guess how thin it is.
 */

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/** A fraction that refuses to hide its sample size. */
export interface Rate {
  n: number;
  of: number;
  /** null when there was nothing to measure — never silently 0. */
  value: number | null;
}

export const rate = (n: number, of: number): Rate => ({
  n,
  of,
  value: of === 0 ? null : n / of,
});

export function pct(r: Rate, digits = 1): string {
  return r.value === null ? '—' : `${(r.value * 100).toFixed(digits)}%`;
}

/** "3/8 (37.5%)" — the form that makes a thin sample obvious at a glance. */
export function pctWithCount(r: Rate, digits = 1): string {
  return r.value === null ? '— (0 of 0)' : `${pct(r, digits)} (${r.n} of ${r.of})`;
}

// ---------------------------------------------------------------------------
// Grading one group
// ---------------------------------------------------------------------------

/**
 * What happened to one (entity, field) decision.
 *
 * The conflict-related outcomes are separated from the rest because they are not
 * interchangeable. A missed conflict reaches the underwriter as a priced policy
 * that should not have been priced. A false conflict reaches the broker as a
 * question they have already answered. Rolling both into "error" and reporting
 * an accuracy figure would average together the two things an underwriting team
 * most needs to see apart.
 */
export type Outcome =
  /** A real conflict was flagged as a conflict. */
  | 'conflict_caught'
  /** A real conflict was called something else, or not reported at all. */
  | 'conflict_missed'
  /** Something that is not a conflict was flagged as one. The expensive error. */
  | 'false_conflict'
  /** A non-conflict finding was reported with the right label. */
  | 'label_correct'
  /** A non-conflict finding was reported with the wrong non-conflict label. */
  | 'label_wrong'
  /** Nothing was expected here and a non-conflict finding was raised anyway. */
  | 'noise'
  /** A finding was expected here and the engine said nothing at all. */
  | 'dropped'
  /** Nothing expected, nothing reported. */
  | 'quiet';

function outcomeOf(expected: Classification, predicted: Classification): Outcome {
  if (expected === 'conflict') {
    return predicted === 'conflict' ? 'conflict_caught' : 'conflict_missed';
  }
  if (predicted === 'conflict') return 'false_conflict';
  if (expected === 'consistent') {
    return predicted === 'consistent' ? 'quiet' : 'noise';
  }
  if (predicted === 'consistent') return 'dropped';
  return expected === predicted ? 'label_correct' : 'label_wrong';
}

/** True when this outcome puts an item in a human's review queue. */
const REACHES_A_HUMAN: ReadonlySet<Outcome> = new Set<Outcome>([
  'conflict_caught',
  'false_conflict',
  'label_correct',
  'label_wrong',
  'noise',
]);

export interface GradedGroup {
  packetId: string;
  packetTitle: string;
  taxonomyCase: TaxonomyCaseId;
  bucket: 'true_conflict' | 'hard_negative';
  groupKey: string;
  label: string;
  /**
   * True when the packet's ground truth names this group explicitly. False
   * means the two-way contract applies: the label is `consistent` because the
   * packet did not declare a finding here, so anything the engine reports is
   * something the author did not intend.
   */
  declared: boolean;
  expected: Classification;
  predicted: Classification;
  /** null when the engine produced no finding for this group at all. */
  confidence: number | null;
  signals: string[];
  correct: boolean;
  outcome: Outcome;
}

function gradePacket(packet: Packet, analysis: PacketAnalysis): GradedGroup[] {
  const findings = new Map<string, Finding>();
  for (const finding of analysis.findings) findings.set(finding.groupKey, finding);

  const keys = new Set<string>([
    ...Object.keys(packet.groundTruth.expected),
    ...findings.keys(),
  ]);

  const graded: GradedGroup[] = [];
  keys.forEach((key) => {
    const declared = Object.prototype.hasOwnProperty.call(
      packet.groundTruth.expected,
      key,
    );
    const expected: Classification = declared
      ? packet.groundTruth.expected[key]
      : 'consistent';
    const finding = findings.get(key);
    const predicted: Classification = finding?.classification ?? 'consistent';

    graded.push({
      packetId: packet.id,
      packetTitle: packet.title,
      taxonomyCase: packet.taxonomyCase,
      bucket: packet.bucket,
      groupKey: key,
      label: finding?.label ?? key,
      declared,
      expected,
      predicted,
      confidence: finding?.confidence ?? null,
      signals: finding?.signals ?? [],
      correct: expected === predicted,
      outcome: outcomeOf(expected, predicted),
    });
  });

  return graded.sort((a, b) => (a.groupKey < b.groupKey ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Deliberately uneven bins.
 *
 * Equal-width deciles would put almost every finding this engine produces into
 * the top two buckets and leave eight empty ones on the chart. The bins below
 * are narrow exactly where the predictor's output actually lives, so the
 * diagram has resolution in the range where over-confidence would do damage.
 *
 * Choosing bins after seeing where the scores fall is a real degree of freedom,
 * and it is stated here rather than buried: the bin edges are part of the
 * method, not a property of the data.
 */
const BIN_EDGES = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0001] as const;

export interface CalibrationBin {
  lower: number;
  upper: number;
  label: string;
  count: number;
  correct: number;
  /** correct / count — where the dot actually sits. */
  observed: number | null;
  /** Mean asserted confidence in the bin — where the dot claims to sit. */
  claimed: number | null;
  /** observed − claimed. Negative means over-confident. */
  gap: number | null;
}

export interface Calibration {
  /** In words: which findings were binned, and against what. */
  population: string;
  bins: CalibrationBin[];
  count: number;
  /**
   * Expected calibration error: the bin-size-weighted mean of |observed −
   * claimed|. One number, and a coarse one — it can be small because the
   * predictor is well calibrated or because every finding landed in one bin.
   * Read it next to the bin counts, never alone.
   */
  ece: number | null;
  /** Says out loud how thin the sample is. Rendered under the chart. */
  note: string;
}

interface CalibrationItem {
  confidence: number;
  correct: boolean;
}

function calibrate(
  items: CalibrationItem[],
  population: string,
  note: string,
): Calibration {
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < BIN_EDGES.length - 1; i += 1) {
    const lower = BIN_EDGES[i];
    const upper = BIN_EDGES[i + 1];
    const inBin = items.filter((it) => it.confidence >= lower && it.confidence < upper);
    const correct = inBin.filter((it) => it.correct).length;
    const observed = inBin.length === 0 ? null : correct / inBin.length;
    const claimed =
      inBin.length === 0
        ? null
        : inBin.reduce((sum, it) => sum + it.confidence, 0) / inBin.length;

    bins.push({
      lower,
      upper: Math.min(upper, 1),
      label:
        i === 0
          ? `< ${lower === 0 ? '0.50' : lower.toFixed(2)}`
          : `${lower.toFixed(2)}–${Math.min(upper, 1).toFixed(2)}`,
      count: inBin.length,
      correct,
      observed,
      claimed,
      gap: observed === null || claimed === null ? null : observed - claimed,
    });
  }

  const populated = bins.filter((b) => b.count > 0);
  const ece =
    items.length === 0
      ? null
      : populated.reduce(
          (sum, b) => sum + (b.count / items.length) * Math.abs(b.gap ?? 0),
          0,
        );

  return { population, bins, count: items.length, ece, note };
}

const SMALL_SAMPLE_NOTE =
  'Sixteen synthetic packets. Most bins hold single-digit counts, so a single ' +
  'flipped finding moves a dot a long way. Read the shape, not the decimals.';

// ---------------------------------------------------------------------------
// Human agreement
// ---------------------------------------------------------------------------

export interface DisputedItem {
  packetId: string;
  groupKey: string;
  label: string;
  pipelineClassification: Classification;
  groundTruth: Classification;
  verdict: 'accept' | 'reject' | 'unresolved';
  reason: string;
  reviewer: string;
}

export interface HumanAgreement {
  decisions: number;
  accepted: number;
  rejected: number;
  unresolved: number;
  /**
   * Accepts over accepts-plus-rejects. A reviewer marking something unresolved
   * is not voting against the pipeline — they are saying the packet did not
   * give them enough to decide — so those are counted and shown but kept out of
   * the denominator rather than silently scored as disagreement.
   */
  agreementRate: Rate;
  /** Reviewer and ground truth pulling in opposite directions. */
  disputed: DisputedItem[];
  /** Confidence binned against what reviewers actually did with the finding. */
  calibration: Calibration;
}

export interface ReviewerPairDisagreement {
  packetId: string;
  groupKey: string;
  label: string;
  pipelineClassification: Classification;
  verdicts: Array<{ reviewer: string; verdict: ReviewDecision['verdict']; reason: string }>;
}

export interface InterReviewerAgreement {
  /** Findings ruled on by two or more distinct reviewers. */
  findings: number;
  agreedPairs: number;
  totalPairs: number;
  /** agreedPairs / totalPairs — null until two reviewers rule on one finding. */
  pairwiseAgreement: Rate;
  /** Findings where at least one reviewer pair disagreed. */
  disagreements: ReviewerPairDisagreement[];
}

/**
 * Agreement *between* reviewers, as distinct from agreement with the pipeline.
 *
 * A single reviewer's accept rate measures deference as much as judgement: one
 * person agreeing with everything tells you they are agreeable. Two reviewers
 * independently ruling on the same finding tells you whether the finding is
 * actually decidable from the packet. Until that happens this reports zeros
 * and nulls rather than a flattering 100%.
 */
function scoreInterReviewer(
  decisions: ReviewDecision[],
  graded: Map<string, GradedGroup>,
): InterReviewerAgreement {
  const byFinding = new Map<string, ReviewDecision[]>();
  for (const decision of decisions) {
    const key = `${decision.packetId}::${decision.groupKey}::${decision.engine}`;
    const list = byFinding.get(key) ?? [];
    list.push(decision);
    byFinding.set(key, list);
  }

  let findings = 0;
  let agreedPairs = 0;
  let totalPairs = 0;
  const disagreements: ReviewerPairDisagreement[] = [];

  for (const list of byFinding.values()) {
    // One voice per reviewer: a re-review replaces, so keep the latest.
    const latest = new Map<string, ReviewDecision>();
    for (const d of list) latest.set(d.reviewer, d);
    const voices = [...latest.values()];
    if (voices.length < 2) continue;
    findings += 1;

    let findingAgreed = true;
    for (let i = 0; i < voices.length; i += 1) {
      for (let j = i + 1; j < voices.length; j += 1) {
        totalPairs += 1;
        if (voices[i].verdict === voices[j].verdict) agreedPairs += 1;
        else findingAgreed = false;
      }
    }
    if (!findingAgreed) {
      const first = voices[0];
      const row = graded.get(`${first.packetId}::${first.groupKey}`);
      disagreements.push({
        packetId: first.packetId,
        groupKey: first.groupKey,
        label: row?.label ?? first.groupKey,
        pipelineClassification: first.pipelineClassification,
        verdicts: voices.map((v) => ({ reviewer: v.reviewer, verdict: v.verdict, reason: v.reason })),
      });
    }
  }

  return {
    findings,
    agreedPairs,
    totalPairs,
    pairwiseAgreement: rate(agreedPairs, totalPairs),
    disagreements,
  };
}

function scoreReviews(
  decisions: ReviewDecision[],
  graded: Map<string, GradedGroup>,
): HumanAgreement {
  const accepted = decisions.filter((d) => d.verdict === 'accept');
  const rejected = decisions.filter((d) => d.verdict === 'reject');
  const unresolved = decisions.filter((d) => d.verdict === 'unresolved');

  const disputed: DisputedItem[] = [];
  const items: CalibrationItem[] = [];

  for (const decision of decisions) {
    const row = graded.get(`${decision.packetId}::${decision.groupKey}`);
    if (!row) continue;

    if (decision.verdict !== 'unresolved' && row.confidence !== null) {
      items.push({ confidence: row.confidence, correct: decision.verdict === 'accept' });
    }

    const reviewerAgreesWithPipeline = decision.verdict === 'accept';
    if (decision.verdict !== 'unresolved' && reviewerAgreesWithPipeline !== row.correct) {
      disputed.push({
        packetId: decision.packetId,
        groupKey: decision.groupKey,
        label: row.label,
        pipelineClassification: decision.pipelineClassification,
        groundTruth: row.expected,
        verdict: decision.verdict,
        reason: decision.reason,
        reviewer: decision.reviewer,
      });
    }
  }

  return {
    decisions: decisions.length,
    accepted: accepted.length,
    rejected: rejected.length,
    unresolved: unresolved.length,
    agreementRate: rate(accepted.length, accepted.length + rejected.length),
    disputed,
    calibration: calibrate(
      items,
      'Findings a reviewer ruled on, scored as correct when the reviewer accepted the ' +
        'pipeline’s classification.',
      'Reviewer verdicts are collected through the UI and start empty. Until someone ' +
        'reviews a packet this chart has nothing in it, which is the honest state.',
    ),
  };
}

// ---------------------------------------------------------------------------
// Per-case breakdown
// ---------------------------------------------------------------------------

export interface CaseScore {
  taxonomyCase: TaxonomyCase;
  packets: string[];
  declared: number;
  declaredCorrect: number;
  conflictsCaught: number;
  conflictsMissed: number;
  falseConflicts: number;
  noise: number;
  /**
   * The case passes when the engine reproduced every hand-authored label for
   * these packets and added nothing that was not authored. Partial credit is
   * not useful here: each case names one behaviour, and the interesting
   * question is whether the engine has it.
   */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// The scorecard
// ---------------------------------------------------------------------------

export interface Scorecard {
  engine: EngineId;
  engineLabel: string;
  packets: number;
  groupsEvaluated: number;
  findingsReported: number;

  /**
   * THE HEADLINE. Of the packets that contain nothing an underwriter needs to
   * act on, how many did the engine interrupt someone about? Per packet,
   * because a broker experiences one unnecessary email per submission, not one
   * per field.
   */
  hardNegativePacketFpr: Rate;
  /** The same question per decision, which is the rate the engine controls. */
  hardNegativeGroupFpr: Rate;
  /** False conflicts anywhere, including inside packets that do contain one. */
  falseConflictRate: Rate;

  /** Of the conflicts that are really there, how many reached a human. */
  conflictRecall: Rate;
  /** Per packet: did at least one real conflict in this packet get flagged. */
  conflictPacketRecall: Rate;

  /** Hand-authored labels reproduced exactly. */
  labelAccuracy: Rate;
  /** Findings raised on groups the ground truth never declared. */
  noiseRate: Rate;
  /** Declared findings the engine stayed silent about. */
  dropRate: Rate;
  /** Everything that would land in a review queue, per packet. */
  reviewLoad: number;

  confusion: ConfusionMatrix;
  calibration: Calibration;
  byCase: CaseScore[];
  byPacket: PacketScore[];
  human: HumanAgreement;
  /** Reviewer-vs-reviewer agreement. Empty until two people rule on one finding. */
  interReviewer: InterReviewerAgreement;

  /** Every row every number above was computed from. */
  graded: GradedGroup[];
}

export interface PacketScore {
  packetId: string;
  title: string;
  bucket: 'true_conflict' | 'hard_negative';
  taxonomyCase: TaxonomyCaseId;
  declared: number;
  declaredCorrect: number;
  conflictsCaught: number;
  conflictsMissed: number;
  falseConflicts: number;
  noise: number;
  reported: number;
  passed: boolean;
}

export type ConfusionMatrix = Record<Classification, Record<Classification, number>>;

const CLASSES: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
  'consistent',
];

function emptyConfusion(): ConfusionMatrix {
  const matrix = {} as ConfusionMatrix;
  for (const expected of CLASSES) {
    matrix[expected] = {} as Record<Classification, number>;
    for (const predicted of CLASSES) matrix[expected][predicted] = 0;
  }
  return matrix;
}

const ENGINE_LABELS: Record<EngineId, string> = {
  reference: 'Reference engine',
  naive: 'Baseline (raw-string comparison, no cross-document rules)',
  external: 'External system — graded from findings it reported',
};

export interface ScoreInput {
  engine: EngineId;
  packets: Packet[];
  analyses: PacketAnalysis[];
  decisions?: ReviewDecision[];
}

export function scoreEngine({
  engine,
  packets,
  analyses,
  decisions = [],
}: ScoreInput): Scorecard {
  const analysisByPacket = new Map(analyses.map((a) => [a.packetId, a]));

  const graded: GradedGroup[] = [];
  for (const packet of packets) {
    const analysis = analysisByPacket.get(packet.id);
    if (!analysis) continue;
    graded.push(...gradePacket(packet, analysis));
  }

  const count = (rows: GradedGroup[], outcome: Outcome) =>
    rows.filter((r) => r.outcome === outcome).length;

  // --- false positives -----------------------------------------------------
  const hardNegatives = packets.filter((p) => p.bucket === 'hard_negative');
  const hardNegativeRows = graded.filter((r) => r.bucket === 'hard_negative');
  const hardNegativePacketsTripped = new Set(
    hardNegativeRows.filter((r) => r.outcome === 'false_conflict').map((r) => r.packetId),
  );
  const nonConflictRows = graded.filter((r) => r.expected !== 'conflict');

  // --- recall --------------------------------------------------------------
  const conflictRows = graded.filter((r) => r.expected === 'conflict');
  const trueConflictPackets = packets.filter((p) => p.bucket === 'true_conflict');
  const packetsWithACatch = new Set(
    conflictRows.filter((r) => r.outcome === 'conflict_caught').map((r) => r.packetId),
  );

  // --- declared labels -----------------------------------------------------
  const declaredRows = graded.filter((r) => r.declared);
  const undeclaredRows = graded.filter((r) => !r.declared);

  const confusion = emptyConfusion();
  for (const row of declaredRows) confusion[row.expected][row.predicted] += 1;

  const reported = graded.filter((r) => REACHES_A_HUMAN.has(r.outcome));

  const calibration = calibrate(
    reported
      .filter((r) => r.confidence !== null)
      .map((r) => ({ confidence: r.confidence as number, correct: r.correct })),
    'Every finding the engine put in front of a reviewer, scored against the ' +
      'hand-authored label for that group.',
    SMALL_SAMPLE_NOTE,
  );

  const gradedIndex = new Map(graded.map((r) => [`${r.packetId}::${r.groupKey}`, r]));

  // --- per packet ----------------------------------------------------------
  const byPacket: PacketScore[] = packets.map((packet) => {
    const rows = graded.filter((r) => r.packetId === packet.id);
    const declared = rows.filter((r) => r.declared);
    const declaredCorrect = declared.filter((r) => r.correct).length;
    const falseConflicts = count(rows, 'false_conflict');
    const noise = count(rows, 'noise');

    return {
      packetId: packet.id,
      title: packet.title,
      bucket: packet.bucket,
      taxonomyCase: packet.taxonomyCase,
      declared: declared.length,
      declaredCorrect,
      conflictsCaught: count(rows, 'conflict_caught'),
      conflictsMissed: count(rows, 'conflict_missed'),
      falseConflicts,
      noise,
      reported: rows.filter((r) => REACHES_A_HUMAN.has(r.outcome)).length,
      passed:
        declaredCorrect === declared.length && falseConflicts === 0 && noise === 0,
    };
  });

  // --- per taxonomy case ---------------------------------------------------
  const byCase: CaseScore[] = TAXONOMY.map((taxonomyCase) => {
    const casePackets = packets.filter((p) => p.taxonomyCase === taxonomyCase.id);
    const ids = new Set(casePackets.map((p) => p.id));
    const rows = graded.filter((r) => ids.has(r.packetId));
    const declared = rows.filter((r) => r.declared);
    const declaredCorrect = declared.filter((r) => r.correct).length;
    const falseConflicts = count(rows, 'false_conflict');
    const noise = count(rows, 'noise');

    return {
      taxonomyCase,
      packets: casePackets.map((p) => p.id),
      declared: declared.length,
      declaredCorrect,
      conflictsCaught: count(rows, 'conflict_caught'),
      conflictsMissed: count(rows, 'conflict_missed'),
      falseConflicts,
      noise,
      passed:
        declared.length > 0 &&
        declaredCorrect === declared.length &&
        falseConflicts === 0 &&
        noise === 0,
    };
  });

  return {
    engine,
    engineLabel: ENGINE_LABELS[engine],
    packets: packets.length,
    groupsEvaluated: graded.length,
    findingsReported: reported.length,

    hardNegativePacketFpr: rate(hardNegativePacketsTripped.size, hardNegatives.length),
    hardNegativeGroupFpr: rate(
      count(hardNegativeRows, 'false_conflict'),
      hardNegativeRows.length,
    ),
    falseConflictRate: rate(count(nonConflictRows, 'false_conflict'), nonConflictRows.length),

    conflictRecall: rate(count(conflictRows, 'conflict_caught'), conflictRows.length),
    conflictPacketRecall: rate(packetsWithACatch.size, trueConflictPackets.length),

    labelAccuracy: rate(declaredRows.filter((r) => r.correct).length, declaredRows.length),
    noiseRate: rate(count(undeclaredRows, 'noise'), undeclaredRows.length),
    dropRate: rate(
      count(declaredRows, 'dropped'),
      declaredRows.filter((r) => r.expected !== 'consistent').length,
    ),
    reviewLoad: packets.length === 0 ? 0 : reported.length / packets.length,

    confusion,
    calibration,
    byCase,
    byPacket,
    human: scoreReviews(decisions, gradedIndex),
    interReviewer: scoreInterReviewer(decisions, gradedIndex),

    graded,
  };
}

// ---------------------------------------------------------------------------
// Comparing the two engines
// ---------------------------------------------------------------------------

export interface EngineComparison {
  reference: Scorecard;
  baseline: Scorecard;
  /**
   * Conflicts the reference engine caught and the baseline did not, and the
   * reverse. Listed rather than counted: the interesting question is always
   * *which* ones, and a delta of "+5" tells a reader nothing about whether the
   * five were worth catching.
   */
  onlyReferenceCaught: string[];
  onlyBaselineCaught: string[];
  /** Hard negatives the baseline fired on and the reference engine did not. */
  falseConflictsAvoided: string[];
  /** Hard negatives the reference engine fired on and the baseline did not. */
  falseConflictsIntroduced: string[];
}

function catches(card: Scorecard): Set<string> {
  return new Set(
    card.graded
      .filter((r) => r.outcome === 'conflict_caught')
      .map((r) => `${r.packetId} · ${r.label}`),
  );
}

function falseConflicts(card: Scorecard): Set<string> {
  return new Set(
    card.graded
      .filter((r) => r.outcome === 'false_conflict')
      .map((r) => `${r.packetId} · ${r.label}`),
  );
}

const without = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((x) => !b.has(x)).sort();

export function compareEngines(reference: Scorecard, baseline: Scorecard): EngineComparison {
  const refCatches = catches(reference);
  const baseCatches = catches(baseline);
  const refFalse = falseConflicts(reference);
  const baseFalse = falseConflicts(baseline);

  return {
    reference,
    baseline,
    onlyReferenceCaught: without(refCatches, baseCatches),
    onlyBaselineCaught: without(baseCatches, refCatches),
    falseConflictsAvoided: without(baseFalse, refFalse),
    falseConflictsIntroduced: without(refFalse, baseFalse),
  };
}

// ---------------------------------------------------------------------------
// Plain-text rendering, for the terminal and the demo script
// ---------------------------------------------------------------------------

export function summaryLines(card: Scorecard): string[] {
  const lines: string[] = [
    `${card.engineLabel}`,
    `  packets                         ${card.packets}`,
    `  group decisions                 ${card.groupsEvaluated}`,
    `  findings shown to a reviewer    ${card.findingsReported} ` +
      `(${card.reviewLoad.toFixed(1)} per packet)`,
    '',
    `  false-positive rate, clean packets   ${pctWithCount(card.hardNegativePacketFpr)}`,
    `  false-positive rate, per decision    ${pctWithCount(card.hardNegativeGroupFpr)}`,
    `  conflict recall, per conflict        ${pctWithCount(card.conflictRecall)}`,
    `  conflict recall, per packet          ${pctWithCount(card.conflictPacketRecall)}`,
    `  hand-authored labels reproduced      ${pctWithCount(card.labelAccuracy)}`,
    `  findings nobody asked for            ${pctWithCount(card.noiseRate)}`,
    '',
    `  calibration error (ECE)              ` +
      `${card.calibration.ece === null ? '—' : card.calibration.ece.toFixed(3)} ` +
      `over ${card.calibration.count} findings`,
    '',
    '  by taxonomy case',
  ];

  for (const c of card.byCase) {
    const mark = c.passed ? 'pass' : 'FAIL';
    lines.push(
      `    ${String(c.taxonomyCase.id).padStart(2)}. ${c.taxonomyCase.name.padEnd(38)} ` +
        `${mark}  ${c.declaredCorrect}/${c.declared} labels` +
        (c.falseConflicts ? `, ${c.falseConflicts} false conflict(s)` : '') +
        (c.conflictsMissed ? `, ${c.conflictsMissed} missed` : '') +
        (c.noise ? `, ${c.noise} noise` : ''),
    );
  }

  return lines;
}

export function comparisonLines(comparison: EngineComparison): string[] {
  const { reference, baseline } = comparison;
  // The second column is usually the naive baseline, but external grading
  // reuses this comparison — label the column honestly either way.
  const other = baseline.engine === 'naive' ? 'baseline' : 'external';
  const lines = [
    `Reference engine vs ${other}, same documents, same extractor, same linking.`,
    ...(baseline.engine === 'naive'
      ? ['The baseline is my own construction and is not a model of any real product.', '']
      : ['The external column grades findings reported outside this repo, against the same labels.', '']),
    `  false positives on clean packets   ${other} ${pctWithCount(
      baseline.hardNegativePacketFpr,
    )}   reference ${pctWithCount(reference.hardNegativePacketFpr)}`,
    `  real conflicts caught              ${other} ${pctWithCount(
      baseline.conflictRecall,
    )}   reference ${pctWithCount(reference.conflictRecall)}`,
    `  review load per packet             ${other} ${baseline.reviewLoad.toFixed(
      1,
    )}   reference ${reference.reviewLoad.toFixed(1)}`,
    '',
  ];

  if (comparison.onlyReferenceCaught.length) {
    lines.push('  caught only by the reference engine');
    for (const item of comparison.onlyReferenceCaught) lines.push(`    + ${item}`);
    lines.push('');
  }
  if (comparison.onlyBaselineCaught.length) {
    lines.push(`  caught only by the ${other}`);
    for (const item of comparison.onlyBaselineCaught) lines.push(`    + ${item}`);
    lines.push('');
  }
  if (comparison.falseConflictsAvoided.length) {
    lines.push('  false alarms the reference engine does not raise');
    for (const item of comparison.falseConflictsAvoided) lines.push(`    − ${item}`);
    lines.push('');
  }
  if (comparison.falseConflictsIntroduced.length) {
    lines.push(`  false alarms the reference engine raises and the ${other} does not`);
    for (const item of comparison.falseConflictsIntroduced) lines.push(`    ! ${item}`);
    lines.push('');
  }

  return lines;
}
