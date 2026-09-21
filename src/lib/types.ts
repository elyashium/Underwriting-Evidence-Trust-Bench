/**
 * Core types for the Underwriting Evidence Trust Bench.
 *
 * Everything in `src/lib` is deliberately dependency-free so the scoring
 * pipeline can run under `vitest`, under plain `node`, or inside the Next.js
 * server without any framework coupling. The whole point of this project is
 * auditability, so the data model is kept flat and readable rather than clever.
 */

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentKind =
  | 'broker_email'
  | 'application'
  | 'vehicle_schedule'
  | 'loss_run'
  | 'endorsement_email'
  | 'scanned_addendum'
  | 'adjuster_note';

/**
 * A single document inside a submission packet. `content` is always plain text:
 * the extractor has to genuinely parse it, and source spans are character
 * offsets into this string. Nothing is pre-parsed for the pipeline's benefit.
 */
export interface SubmissionDocument {
  id: string;
  kind: DocumentKind;
  title: string;
  /** ISO-8601. Drives every temporal-supersession decision. */
  receivedAt: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export type FieldId =
  // policy-level fields
  | 'effective_date'
  | 'stated_vehicle_count'
  | 'liability_limit'
  | 'total_scheduled_value'
  | 'garaging_location_count'
  | 'loss_summary_claim'
  // vehicle-level fields
  | 'vin'
  | 'stated_value'
  | 'garaging_address'
  | 'year_make_model'
  | 'unit_status'
  // loss-level fields
  | 'loss_incurred'
  | 'loss_cause'
  // endorsement intents
  | 'endorsement_add_unit'
  | 'endorsement_remove_unit'
  /**
   * Read by counting the rows of a schedule rather than by reading a label.
   * It is a first-class fact so the reconciliation rules can cite the table
   * they counted, instead of asserting a number the reviewer has to take on
   * trust.
   */
  | 'schedule_unit_count';

export type ValueKind =
  | 'money'
  | 'count'
  | 'date'
  | 'vin'
  | 'address'
  | 'limit'
  | 'text';

export interface NormalizedValue {
  kind: ValueKind;
  /** Canonical string form. Two facts agree iff their canonicals are equal. */
  canonical: string;
  /** Present for money/count/limit so arithmetic rules can use it. */
  numeric?: number;
  /**
   * True when normalisation had to make a judgement call it cannot fully
   * stand behind (e.g. a VIN OCR glyph that is legal in both readings).
   * Ambiguity is surfaced, never silently resolved.
   */
  ambiguous?: boolean;
  /** Human-readable note about what normalisation did, for the audit trail. */
  note?: string;
  /**
   * Names the *domain* rule that had to fire for this surface form to be read
   * correctly — VIN charset folding, magnitude shorthand, suffix expansion.
   *
   * This is what separates a benign variant worth reporting from one that is
   * not. "Eight power units" and "8" need no insurance knowledge to reconcile,
   * so surfacing them wastes a reviewer's attention; "$1.2M" and "$1,200,000",
   * or a VIN with an illegal O in it, are places where a general-purpose
   * comparator gets the wrong answer, so the save is worth showing. Set only
   * when the rule changed the token, never merely for case or whitespace.
   */
  domainRule?: string;
}

export interface SourceSpan {
  documentId: string;
  start: number;
  end: number;
  quote: string;
}

export interface Fact {
  id: string;
  /** `policy`, `vehicle:unit-4`, `loss:CM-88421`, `location:...` */
  entityKey: string;
  field: FieldId;
  /** Exactly as written in the document. */
  raw: string;
  value: NormalizedValue;
  span: SourceSpan;
  /** Extractor's self-reported confidence in *this* reading, 0..1. */
  confidence: number;
  extractor: 'rule' | 'llm';
  documentId: string;
  documentKind: DocumentKind;
  receivedAt: string;
  /**
   * Set when explicit change language ("ADD", "REVISE", "amend", "correct")
   * appears near this fact in its own document.
   *
   * Deliberately derived from the document *text*, never from `documentKind`:
   * a real pipeline receives a bag of attachments whose types are guessed, so
   * letting supersession hinge on a trusted `kind` label would make the bench
   * easier than reality. The supersession rule requires this signal — being
   * merely newer is not enough.
   */
  changeIntent?: 'add' | 'remove' | 'revise';
}

// ---------------------------------------------------------------------------
// Evidence graph
// ---------------------------------------------------------------------------

/**
 * All the values a packet ever asserts for one (entity, field) pair, in
 * document order. This is the "evidence graph per entity/field" from the brief:
 * a group with two or more materially different values is what the classifier
 * has to adjudicate.
 */
export interface EvidenceGroup {
  key: string;
  entityKey: string;
  field: FieldId | string;
  label: string;
  facts: Fact[];
  /** True when the group was synthesised by a cross-document rule. */
  derived: boolean;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type Classification =
  /** Genuinely irreconcilable. Must reach a human. */
  | 'conflict'
  /** A later document legitimately replaced an earlier value. */
  | 'supersession'
  /** Different words, same underlying fact. */
  | 'benign_variant'
  /** Materially different, but the pipeline cannot justify a call. */
  | 'unresolved'
  /** One value, or byte-identical values. Not a finding. */
  | 'consistent';

/** The four classifications the brief asks the classifier to distinguish. */
export const ADJUDICATED: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
];

export interface Finding {
  groupKey: string;
  label: string;
  entityKey: string;
  classification: Classification;
  /**
   * The pipeline's confidence that `classification` is correct — NOT its
   * confidence that something is wrong. Calibration is measured against this.
   */
  confidence: number;
  rationale: string;
  /** Named rules that fired, so a reviewer can see the reasoning, not a score. */
  signals: string[];
  evidence: Fact[];
  supersededBy?: { documentId: string; documentTitle: string; at: string };
  /** Spans elsewhere in the packet that explain away an apparent mismatch. */
  explainedBy?: SourceSpan[];
}

export interface PacketAnalysis {
  packetId: string;
  engine: EngineId;
  facts: Fact[];
  groups: EvidenceGroup[];
  findings: Finding[];
}

export type EngineId = 'reference' | 'naive' | 'external';
/**
 * `external` is findings produced outside this repo — a vendor system, an LLM
 * run, a hand-rolled script — graded by the adapter in `external.ts`. It never
 * has analyses computed here; the adapter synthesizes them from reported
 * findings plus this repo's own evidence groups.

// ---------------------------------------------------------------------------
// Ground truth
// ---------------------------------------------------------------------------

export type TaxonomyCaseId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface GroundTruth {
  /** The group the packet was authored to exercise. */
  focusGroup: string;
  /** Why the focus group is labelled the way it is. Shown in the UI. */
  why: string;
  /**
   * Hand-authored label for every group this packet is meant to produce a
   * *finding* for, plus the neighbouring groups worth pinning down explicitly.
   *
   * A group absent from this map is asserted to be `consistent` — a packet
   * states dozens of facts that nothing disagrees with, and enumerating them
   * would be noise. The contract, enforced by test, is therefore two-way:
   * every key here must exist in the pipeline's output, and every finding the
   * pipeline emits that is *not* `consistent` must appear here with that exact
   * classification. An unexpected `conflict` is a false positive, which is the
   * headline metric, so this map is what the whole bench is graded against.
   */
  expected: Record<string, Classification>;
}

export interface Packet {
  id: string;
  title: string;
  insured: string;
  taxonomyCase: TaxonomyCaseId;
  bucket: 'true_conflict' | 'hard_negative';
  /** One line of plain English: what was planted here and why it is hard. */
  synopsis: string;
  documents: SubmissionDocument[];
  groundTruth: GroundTruth;
}

// ---------------------------------------------------------------------------
// Reviewer loop
// ---------------------------------------------------------------------------

export type ReviewVerdict = 'accept' | 'reject' | 'unresolved';

export interface ReviewDecision {
  id: string;
  packetId: string;
  groupKey: string;
  engine: EngineId;
  /** What the pipeline said at the time the reviewer looked at it. */
  pipelineClassification: Classification;
  verdict: ReviewVerdict;
  /** Required free text. A decision without a reason is not auditable. */
  reason: string;
  reviewer: string;
  decidedAt: string;
}
