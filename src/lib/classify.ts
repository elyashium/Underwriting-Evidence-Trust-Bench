import type {
  Classification,
  DocumentKind,
  EvidenceGroup,
  Fact,
  FieldId,
  Finding,
  NormalizedValue,
  Packet,
  PacketAnalysis,
  SourceSpan,
} from './types';
import { extractPacket, type ExtractionResult, type VehicleTable } from './extract';
import { buildEvidenceGroups, entityLabel, groupKey, groupLabel } from './link';
import {
  addressSimilarity,
  distinguishingAddressToken,
  vinsAmbiguouslyClose,
} from './normalize';

/**
 * Classification.
 *
 * Two kinds of judgement happen here and they are kept apart on purpose.
 *
 *   1. `classifyGroup` adjudicates a single evidence group — every value the
 *      packet asserts for one (entity, field) pair. It is pure: a group in, a
 *      finding out, no packet-wide state.
 *   2. The derived rules ask questions no single group can answer, because the
 *      question spans fields: does the stated fleet size match the schedule,
 *      does the total sum, is one VIN on two units. Each derived rule
 *      synthesises its own group so that a derived finding looks exactly like
 *      an observed one to the reviewer and to the scorer, and cites the real
 *      spans it reasoned over.
 *
 * CONFIDENCE. Every confidence is a sum of named, weighted signals — printed in
 * the finding as `signals`, so a reviewer reads the reasons rather than a
 * number. It is deliberately not a learned score: nothing here is trained on
 * anything, and a learned score on sixteen packets would be a lie dressed as
 * rigour. The honest test of a hand-built model like this is whether it is
 * *calibrated*, which is exactly what the scorecard measures. If the 0.9 bin
 * turns out to be right 70% of the time, the weights below are wrong, and the
 * reliability diagram is where that shows up.
 *
 * Every signal weight is written at its call site next to the rule that earns
 * it, rather than collected in a table at the top of the file, because the
 * point of reading this file is to see *why* a finding scored what it did.
 */

// ---------------------------------------------------------------------------
// Illustrative guidelines
// ---------------------------------------------------------------------------

/**
 * Thresholds the rules cite. These are MY OWN INVENTION for this exercise: they
 * are not any carrier's real appetite, not taken from any filing, and not
 * advice. They exist so a finding can say "above the $25,000 minor-loss line"
 * instead of hiding an unexplained constant inside a comparison.
 */
export const GUIDELINES = {
  /** Above this, a loss is not "minor" however the submission describes it. */
  minorLossCeiling: 25_000,
  /** A total-value gap below this fraction of the stated total is not material. */
  materialValueGapRatio: 0.05,
  /** Below this similarity two addresses are not even worth reporting as close. */
  nearDuplicateAddressSimilarity: 0.85,
} as const;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Upper bounds per classification. An adjudicated finding never reaches 0.99:
 * the pipeline is reading documents it may have misread, and a classifier that
 * can say "certain" will eventually say it about something wrong. `unresolved`
 * is capped hard because its whole content is "I do not know".
 */
const CEILING: Record<Classification, number> = {
  consistent: 0.99,
  conflict: 0.97,
  benign_variant: 0.96,
  supersession: 0.95,
  unresolved: 0.7,
};

interface Signal {
  name: string;
  weight: number;
}

function score(
  classification: Classification,
  signals: Signal[],
): Pick<Finding, 'confidence' | 'signals'> {
  const total = signals.reduce((sum, s) => sum + s.weight, 0);
  const bounded = Math.min(CEILING[classification], Math.max(0.05, total));
  return {
    confidence: Math.round(bounded * 1000) / 1000,
    signals: signals.filter((s) => s.weight !== 0).map((s) => s.name),
  };
}

/**
 * The weakest reading the finding rests on.
 *
 * A conclusion is only as good as its shakiest input, so the confidence of
 * every finding scales with the *minimum* extraction confidence among its
 * evidence, never the average. PKT-007's two effective dates are a real
 * conflict, but one of them had its year inferred from the document date, and
 * the finding should say 0.79 rather than 0.93 because of it.
 */
function evidenceQuality(facts: Fact[]): number {
  if (facts.length === 0) return 0.5;
  return facts.reduce((low, f) => Math.min(low, f.confidence), 1);
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export type DocumentTitles = Map<string, string>;

export function documentTitles(packet: Packet): DocumentTitles {
  return new Map(packet.documents.map((d) => [d.id, d.title]));
}

const docLabel = (fact: Fact, titles?: DocumentTitles): string =>
  titles?.get(fact.documentId) ?? fact.documentId;

const cited = (fact: Fact, titles?: DocumentTitles): string =>
  `"${fact.raw.replace(/\s+/g, ' ').trim()}" (${docLabel(fact, titles)})`;

const onDay = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

const last = <T,>(items: T[]): T => items[items.length - 1];

const unitNumber = (entityKey: string): number | null => {
  const m = entityKey.match(/^vehicle:unit-(\d+)$/);
  return m ? Number(m[1]) : null;
};

// ---------------------------------------------------------------------------
// Single-group adjudication
// ---------------------------------------------------------------------------

export interface ClassifyContext {
  titles?: DocumentTitles;
  /**
   * Every fact in the packet. Used only for signals *about* the superseding
   * document — whether the change names a specific unit and itemises it — never
   * to change the classification itself, which stays a function of the group.
   */
  packetFacts?: Fact[];
}

/** True when every pair of canonicals differs only at OCR-ambiguous glyphs. */
function everyPairAmbiguouslyClose(canonicals: string[]): boolean {
  for (let i = 0; i < canonicals.length; i += 1) {
    for (let j = i + 1; j < canonicals.length; j += 1) {
      if (!vinsAmbiguouslyClose(canonicals[i], canonicals[j])) return false;
    }
  }
  return true;
}

/**
 * Adjudicates one evidence group into exactly one classification.
 *
 * The ordering of the branches is the substance of the rule, so it is stated
 * plainly: self-declared ambiguity wins over everything, agreement is checked
 * before disagreement, a VIN's ambiguous glyphs are checked before any charge
 * of contradiction, and supersession has to be *earned* by change language in
 * the superseding document's own text. Recency is never sufficient — that is
 * the single decision that separates this from a naive recency-wins pipeline,
 * and it is why PKT-007's two dates stay a conflict while PKT-009's two fleet
 * counts do not.
 */
export function classifyGroup(group: EvidenceGroup, ctx: ClassifyContext = {}): Finding {
  const { titles } = ctx;
  const facts = group.facts;
  const base = {
    groupKey: group.key,
    label: group.label,
    entityKey: group.entityKey,
    evidence: facts,
  };
  const canonicals = unique(facts.map((f) => f.value.canonical));
  const quality = evidenceQuality(facts);

  // --- the extractor itself declined to commit ----------------------------
  const selfDeclaredAmbiguous = facts.find((f) => f.value.ambiguous);
  if (selfDeclaredAmbiguous) {
    return {
      ...base,
      classification: 'unresolved',
      rationale:
        `Normalisation could not settle ${cited(selfDeclaredAmbiguous, titles)}: ` +
        `${selfDeclaredAmbiguous.value.note}. Picking either reading would be a ` +
        `guess presented as a fact, so this goes to a human as an open question.`,
      ...score('unresolved', [
        { name: 'normalize.self-declared-ambiguous', weight: 0.4 },
        { name: 'evidence.extraction-quality', weight: 0.15 * quality },
      ]),
    };
  }

  // --- everything resolves to one value ----------------------------------
  if (canonicals.length === 1) {
    // A *variant* needs two surface forms to vary between. A lone "$1.2M" was
    // never reconciled against anything — the magnitude rule fired while
    // reading it, not while comparing it — so reporting it would put a finding
    // in the queue that contains no question.
    const surfaces = unique(facts.map((f) => f.raw.replace(/\s+/g, ' ').trim().toUpperCase()));
    const domain = surfaces.length > 1 ? facts.find((f) => f.value.domainRule) : undefined;

    if (!domain) {
      const corroborated = facts.length > 1;
      return {
        ...base,
        classification: 'consistent',
        rationale: corroborated
          ? `${facts.length} readings across ${unique(facts.map((f) => f.documentId)).length} ` +
            `documents, all resolving to ${canonicals[0]}. Corroborated, not merely unchallenged.`
          : `One reading in the packet: ${canonicals[0]}. Nothing disagrees with it.`,
        ...score('consistent', [
          {
            name: corroborated
              ? 'evidence.corroborated-across-documents'
              : 'evidence.single-reading',
            weight: corroborated ? 0.86 : 0.9,
          },
          { name: 'evidence.extraction-quality', weight: (corroborated ? 0.12 : 0.09) * quality },
        ]),
      };
    }

    // Surface forms differ and a *domain* rule was needed to reconcile them.
    // This is reported rather than hidden because it is precisely where a
    // general-purpose string comparator gets the wrong answer, so the save is
    // worth a reviewer's glance — and if the rule is wrong, this is where they
    // will catch it.
    const notes = unique(facts.map((f) => f.value.note).filter(Boolean) as string[]);
    const documents = unique(facts.map((f) => f.documentId)).length;
    return {
      ...base,
      classification: 'benign_variant',
      rationale:
        `${joinList(facts.map((f) => cited(f, titles)))} all resolve to ${canonicals[0]}. ` +
        `${notes.length ? `${joinList(notes)}. ` : ''}` +
        `Same underlying fact written different ways — no underwriting question here, ` +
        `but the reconciliation needed a domain rule rather than string equality, so it is shown.`,
      ...score('benign_variant', [
        { name: `normalize.${domain.value.domainRule}`, weight: 0.72 },
        { name: 'evidence.extraction-quality', weight: 0.2 * quality },
        { name: 'evidence.corroborated-across-documents', weight: documents >= 3 ? 0.04 : 0 },
      ]),
    };
  }

  // --- genuinely different values ----------------------------------------
  if (group.field === 'vin' && everyPairAmbiguouslyClose(canonicals)) {
    return {
      ...base,
      classification: 'unresolved',
      rationale:
        `${joinList(canonicals)} differ only at characters that are legal in both ` +
        `readings (5/S, 8/B, 2/Z, 6/G, 0/D, 1/7 are all valid VIN characters, unlike ` +
        `I, O and Q). This may be one vehicle scanned twice or two vehicles; the ` +
        `documents do not say, and folding them would invent an answer.`,
      ...score('unresolved', [
        { name: 'identity.ambiguous-glyphs-legal-in-both-readings', weight: 0.4 },
        { name: 'evidence.extraction-quality', weight: 0.15 * quality },
      ]),
    };
  }

  const latest = last(facts);
  const earlier = facts.slice(0, -1);
  const supersedes =
    latest.changeIntent !== undefined &&
    earlier.some((f) => f.value.canonical !== latest.value.canonical);

  if (supersedes) {
    const replaced = earlier.filter((f) => f.value.canonical !== latest.value.canonical);
    const packetFacts = ctx.packetFacts ?? facts;
    const changeDoc = packetFacts.filter((f) => f.documentId === latest.documentId);
    const namedUnits = unique(
      changeDoc.map((f) => unitNumber(f.entityKey)).filter((n): n is number => n !== null),
    );
    // A change that itemises the unit it touches — VIN and value, not just a
    // number — can be audited against the schedule. A bare "we now have 13"
    // cannot, and should not score the same.
    const itemised =
      namedUnits.length > 0 &&
      changeDoc.some((f) => f.field === 'vin') &&
      changeDoc.some((f) => f.field === 'stated_value');

    return {
      ...base,
      classification: 'supersession',
      rationale:
        `${joinList(unique(replaced.map((f) => f.value.canonical)))} (asserted ` +
        `${onDay(replaced[0].receivedAt)}) was replaced by ${latest.value.canonical}. ` +
        `The later document does not merely disagree — its own text marks this as a ` +
        `deliberate ${latest.changeIntent}: ${cited(latest, titles)}` +
        `${namedUnits.length ? `, naming Unit ${joinList(namedUnits.map(String))}` : ''}. ` +
        `Both values were correct when written, so this is an update, not a contradiction.`,
      supersededBy: {
        documentId: latest.documentId,
        documentTitle: docLabel(latest, titles),
        at: latest.receivedAt,
      },
      ...score('supersession', [
        { name: 'temporal.explicit-change-language-in-source', weight: 0.55 },
        { name: 'evidence.extraction-quality', weight: 0.14 * quality },
        { name: 'change.names-specific-unit', weight: namedUnits.length ? 0.14 : 0 },
        { name: 'change.itemised-and-auditable', weight: itemised ? 0.1 : 0 },
      ]),
    };
  }

  const anyChangeLanguage = facts.some((f) => f.changeIntent !== undefined);
  return {
    ...base,
    classification: 'conflict',
    rationale:
      `${joinList(facts.map((f) => cited(f, titles)))} cannot all be correct. ` +
      (anyChangeLanguage
        ? `Change language appears somewhere in this group, but the most recent ` +
          `assertion is not the changed one, so the packet's final state is genuinely ` +
          `unclear.`
        : `No document in the packet marks a change to this field, so the later value ` +
          `has no claim to supersede the earlier one — recency alone is not a licence ` +
          `to pick a side.`),
    ...score('conflict', [
      { name: 'contradiction.no-reconciling-document', weight: 0.45 },
      {
        name: 'evidence.asserted-by-separate-documents',
        weight: unique(facts.map((f) => f.documentId)).length > 1 ? 0.12 : 0,
      },
      { name: 'evidence.extraction-quality', weight: 0.3 * quality },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Derived rules
// ---------------------------------------------------------------------------

interface RuleContext {
  packet: Packet;
  extraction: ExtractionResult;
  titles: DocumentTitles;
  groups: Map<string, EvidenceGroup>;
  findings: Map<string, Finding>;
}

interface RuleResult {
  group: EvidenceGroup;
  finding: Finding;
}

type DerivedRule = (ctx: RuleContext) => RuleResult | null;

function derivedGroup(rule: string, facts: Fact[]): EvidenceGroup {
  return {
    key: groupKey('policy', rule),
    entityKey: 'policy',
    field: rule,
    label: groupLabel('policy', rule),
    facts,
    derived: true,
  };
}

function derivedFact(input: {
  entityKey: string;
  field: FieldId;
  raw: string;
  value: NormalizedValue;
  span: SourceSpan;
  documentKind: DocumentKind;
  receivedAt: string;
  confidence: number;
}): Fact {
  return {
    id: `derived:${input.span.documentId}:${input.field}:${input.span.start}`,
    entityKey: input.entityKey,
    field: input.field,
    raw: input.raw,
    value: input.value,
    span: input.span,
    confidence: input.confidence,
    extractor: 'rule',
    documentId: input.span.documentId,
    documentKind: input.documentKind,
    receivedAt: input.receivedAt,
  };
}

/** The fullest vehicle schedule in the packet, used to cite a row count. */
function primaryTable(tables: VehicleTable[]): VehicleTable | null {
  if (tables.length === 0) return null;
  return tables.reduce((best, t) => (t.units.length > best.units.length ? t : best));
}

/**
 * The value in force for a group: its last assertion in document order.
 *
 * Reconciliation arithmetic has to run on effective values or it invents
 * conflicts that are pure artefacts of ignoring an endorsement. PKT-010 is the
 * packet that punishes getting this wrong: sum the pre-endorsement values and
 * the restated total looks like a $33,500 error.
 */
function effectiveFact(group: EvidenceGroup | undefined): Fact | null {
  if (!group || group.facts.length === 0) return null;
  return last(group.facts);
}

/** A group whose own adjudication is in dispute cannot anchor arithmetic. */
function settled(ctx: RuleContext, key: string): boolean {
  const finding = ctx.findings.get(key);
  if (!finding) return false;
  return finding.classification !== 'conflict' && finding.classification !== 'unresolved';
}

// --- 1. VIN uniqueness ------------------------------------------------------

/**
 * One VIN, one vehicle. This is the only rule in the file that rests on an
 * external standard rather than on the packet's own words, and it is the
 * strongest thing the bench can assert: two schedule rows sharing a VIN are not
 * a discrepancy of wording, they are a statement that cannot be true.
 *
 * Ambiguous OCR pairs are deliberately *not* handled here. A VIN that differs
 * from another only at a 5/S is a question about one unit's identity, which
 * belongs to that unit's own `vin` group, where it comes out `unresolved`.
 */
const vinUniqueness: DerivedRule = (ctx) => {
  const vinFacts = ctx.extraction.facts.filter(
    (f) => f.field === 'vin' && f.entityKey.startsWith('vehicle:'),
  );
  if (vinFacts.length === 0) return null;

  const byVin = new Map<string, Fact[]>();
  for (const fact of vinFacts) {
    const bucket = byVin.get(fact.value.canonical);
    if (bucket) bucket.push(fact);
    else byVin.set(fact.value.canonical, [fact]);
  }

  const collisions = [...byVin.entries()]
    .map(([vin, facts]) => ({ vin, facts, units: unique(facts.map((f) => f.entityKey)) }))
    .filter((c) => c.units.length > 1);

  const group = derivedGroup('vin_uniqueness', vinFacts);
  const quality = evidenceQuality(vinFacts);

  if (collisions.length === 0) {
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `${byVin.size} distinct VINs across ${unique(vinFacts.map((f) => f.entityKey)).length} ` +
          `units. No VIN is carried on two units.`,
        evidence: vinFacts,
        ...score('consistent', [
          { name: 'identity.vins-distinct-across-units', weight: 0.88 },
          { name: 'evidence.extraction-quality', weight: 0.1 * quality },
        ]),
      },
    };
  }

  const valueFor = (entityKey: string): Fact | null =>
    effectiveFact(ctx.groups.get(groupKey(entityKey, 'stated_value')));
  const makeFor = (entityKey: string): Fact | null =>
    effectiveFact(ctx.groups.get(groupKey(entityKey, 'year_make_model')));

  const detail = collisions.map((collision) => {
    const units = collision.units;
    const values = units.map(valueFor);
    const makes = units.map(makeFor);
    const ratedDifferently =
      unique(values.filter(Boolean).map((f) => f!.value.canonical)).length > 1;
    const differentVehicle =
      unique(makes.filter(Boolean).map((f) => f!.value.canonical)).length > 1;
    return { ...collision, values, makes, ratedDifferently, differentVehicle };
  });

  const ratedDifferently = detail.some((d) => d.ratedDifferently);
  const differentVehicle = detail.some((d) => d.differentVehicle);

  const sentences = detail.map((d) => {
    const units = d.units.map(entityLabel);
    const values = d.values
      .filter(Boolean)
      .map((f) => money(f!.value.numeric ?? 0));
    const makes = unique(d.makes.filter(Boolean).map((f) => f!.raw.replace(/\s+/g, ' ').trim()));
    const parts = [`VIN ${d.vin} is carried on ${joinList(units)}`];
    if (d.ratedDifferently) parts.push(`rated at ${joinList(values)}`);
    if (d.differentVehicle) parts.push(`described as ${joinList(makes)}`);
    return parts.join(', ');
  });

  const evidence = [
    ...detail.flatMap((d) => d.facts),
    ...detail.flatMap((d) => [...d.values, ...d.makes].filter(Boolean) as Fact[]),
  ];

  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'conflict',
      rationale:
        `${joinList(sentences)}. A VIN identifies one vehicle, so these rows cannot ` +
        `both be right` +
        (ratedDifferently
          ? ` — and because the two rows carry different stated values, this is not a ` +
            `duplicated row that could simply be de-duplicated`
          : '') +
        `. Nothing in the packet says which row is wrong, so the schedule cannot be ` +
        `rated until the broker confirms it.`,
      evidence,
      ...score('conflict', [
        { name: 'identity.vin-carried-on-two-units', weight: 0.6 },
        { name: 'identity.units-rated-differently', weight: ratedDifferently ? 0.16 : 0 },
        { name: 'identity.units-described-as-different-vehicles', weight: differentVehicle ? 0.1 : 0 },
        { name: 'evidence.extraction-quality', weight: 0.14 * evidenceQuality(evidence) },
      ]),
    },
  };
};

// --- 2. Vehicle count reconciliation ---------------------------------------

/**
 * Stated fleet size against the schedule that is actually attached.
 *
 * Counted as distinct *unit numbers*, not rows. PKT-015 re-sends one page of a
 * schedule, so a row count invents a fifteenth vehicle; the duplicate-VIN
 * packets would likewise trip this rule as well as the one they were authored
 * for, and two findings for one planted fault would quietly corrupt the
 * false-positive rate.
 */
const vehicleCountReconciliation: DerivedRule = (ctx) => {
  const statedGroup = ctx.groups.get('policy::stated_vehicle_count');
  const stated = effectiveFact(statedGroup);
  if (!stated || stated.value.numeric === undefined) return null;
  // If the stated counts are themselves in dispute, that conflict is already
  // reported. Reconciling against one of two disputed numbers would report the
  // same fault twice and inflate recall.
  if (!settled(ctx, 'policy::stated_vehicle_count')) return null;

  const table = primaryTable(ctx.extraction.vehicleTables);
  if (!table) return null;

  const scheduled = ctx.extraction.scheduleUnits;
  const countFact = derivedFact({
    entityKey: 'policy',
    field: 'schedule_unit_count',
    raw: `${scheduled.length} unit rows`,
    value: {
      kind: 'count',
      canonical: String(scheduled.length),
      numeric: scheduled.length,
      note: `distinct unit numbers on the schedule: ${scheduled.join(', ')}`,
    },
    span: table.span,
    documentKind: table.documentKind,
    receivedAt: table.receivedAt,
    confidence: table.degraded ? 0.9 : 0.96,
  });

  const addFacts = ctx.extraction.facts.filter(
    (f) =>
      f.field === 'endorsement_add_unit' &&
      f.value.numeric !== undefined &&
      !scheduled.includes(f.value.numeric),
  );
  const added = unique(addFacts.map((f) => f.value.numeric!));
  const effectiveCount = scheduled.length + added.length;
  const delta = stated.value.numeric - effectiveCount;

  const group = derivedGroup('vehicle_count_reconciliation', [stated, countFact, ...addFacts]);
  const statedDocuments = unique(statedGroup!.facts.map((f) => f.documentId)).length;
  const addedClause = added.length
    ? ` plus ${added.length} added by endorsement (Unit ${joinList(added.map(String))})`
    : '';

  if (delta === 0) {
    const evidence = [stated, countFact, ...addFacts];
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `${stated.value.numeric} power units stated, ${scheduled.length} distinct unit ` +
          `numbers on the schedule${addedClause}. The exposure base is established.`,
        evidence,
        ...score('consistent', [
          { name: 'reconciliation.stated-count-matches-schedule', weight: 0.88 },
          { name: 'evidence.extraction-quality', weight: 0.1 * evidenceQuality(evidence) },
        ]),
      },
    };
  }

  // A gap the packet explains itself. Units reported off the active schedule
  // are the one legitimate reason for stated-to-scheduled to differ, and the
  // explanation has to be cited, not assumed.
  const removals = ctx.extraction.facts.filter(
    (f) =>
      f.field === 'unit_status' &&
      f.value.canonical.includes('removed_from_schedule') &&
      !scheduled.includes(unitNumber(f.entityKey) ?? -1),
  );
  const accountedFor = unique(
    removals.map((f) => unitNumber(f.entityKey)).filter((n): n is number => n !== null),
  );

  if (delta > 0 && delta === accountedFor.length) {
    const evidence = [stated, countFact, ...addFacts, ...removals];
    return {
      group: derivedGroup('vehicle_count_reconciliation', evidence),
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'benign_variant',
        rationale:
          `${stated.value.numeric} power units owned against ${effectiveCount} on the active ` +
          `schedule. The gap of ${delta} is fully accounted for: ` +
          `${joinList(
            removals.map(
              (f) =>
                `${entityLabel(f.entityKey)} is reported out of service and removed from the ` +
                `active schedule (${docLabel(f, ctx.titles)})`,
            ),
          )}. The packet answers this question itself, so putting it in a reviewer's ` +
          `queue spends a review cycle to re-read a document the reviewer already has.`,
        evidence,
        explainedBy: removals.map((f) => f.span),
        ...score('benign_variant', [
          { name: 'reconciliation.gap-fully-accounted-for', weight: 0.74 },
          { name: 'evidence.extraction-quality', weight: 0.18 * evidenceQuality(evidence) },
          { name: 'explanation.cited-in-packet', weight: 0.04 },
        ]),
      },
    };
  }

  const evidence = [stated, countFact, ...addFacts, ...removals];
  const short = delta > 0;
  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'conflict',
      rationale: short
        ? `${stated.value.numeric} power units are stated but only ${effectiveCount} are ` +
          `scheduled${addedClause}, leaving ${delta} unaccounted for. ` +
          `${accountedFor.length ? `${accountedFor.length} unit(s) are explained by an out-of-service note, which does not cover the gap. ` : 'No endorsement, status note or removal explains the gap. '}` +
          `The exposure base is genuinely in dispute.`
        : `The schedule carries ${effectiveCount} units${addedClause} against ${stated.value.numeric} ` +
          `stated — ${-delta} more vehicles than the submission declares. Nothing ` +
          `supersedes or explains the difference, so either the schedule includes units ` +
          `that are not being insured or the stated count understates the exposure.`,
      evidence,
      ...score('conflict', [
        { name: 'reconciliation.stated-count-differs-from-schedule', weight: 0.52 },
        { name: 'reconciliation.no-explanation-in-packet', weight: 0.12 },
        { name: 'evidence.extraction-quality', weight: 0.3 * evidenceQuality(evidence) },
        {
          name: 'reconciliation.count-corroborated-by-multiple-documents',
          weight: statedDocuments > 1 ? 0.06 : 0,
        },
      ]),
    },
  };
};

// --- 3. Scheduled value reconciliation -------------------------------------

/**
 * Does the stated total insured value equal the sum of the schedule?
 *
 * This is the rule a pure string-comparison pipeline cannot have at all, which
 * is the point of taxonomy case 5: two documents can be in perfect textual
 * agreement and still be arithmetically impossible.
 */
const scheduledValueReconciliation: DerivedRule = (ctx) => {
  const totalGroup = ctx.groups.get('policy::total_scheduled_value');
  const total = effectiveFact(totalGroup);
  if (!total || total.value.numeric === undefined) return null;
  if (!settled(ctx, 'policy::total_scheduled_value')) return null;

  const perVehicle: Fact[] = [];
  ctx.groups.forEach((group) => {
    if (group.field !== 'stated_value') return;
    const fact = effectiveFact(group);
    if (fact && fact.value.numeric !== undefined) perVehicle.push(fact);
  });
  if (perVehicle.length === 0) return null;

  const sum = perVehicle.reduce((acc, f) => acc + (f.value.numeric ?? 0), 0);
  const gap = total.value.numeric - sum;
  const evidence = [total, ...perVehicle];
  const group = derivedGroup('scheduled_value_reconciliation', evidence);
  const superseded = ctx.findings.get('policy::total_scheduled_value')?.classification ===
    'supersession';
  const effectiveNote = superseded
    ? ` Both the total and the revised unit value are the endorsement's effective ` +
      `figures, not the originals — reconciling on the superseded numbers would ` +
      `manufacture a discrepancy out of the endorsement itself.`
    : '';

  if (gap === 0) {
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `The ${perVehicle.length} scheduled units sum to exactly ${money(sum)}, which is ` +
          `the stated total.${effectiveNote}`,
        evidence,
        ...score('consistent', [
          { name: 'arithmetic.total-equals-sum-of-schedule', weight: 0.86 },
          { name: 'evidence.extraction-quality', weight: 0.12 * evidenceQuality(evidence) },
        ]),
      },
    };
  }

  const material = Math.abs(gap) >= total.value.numeric * GUIDELINES.materialValueGapRatio;
  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'conflict',
      rationale:
        `The stated total insured value is ${money(total.value.numeric)} but the ` +
        `${perVehicle.length} scheduled units sum to ${money(sum)}, a gap of ` +
        `${money(Math.abs(gap))}. Physical damage is rated off total insured value, so ` +
        `either the schedule is missing a unit or the stated total is wrong; either way ` +
        `the rating basis is not established. The two documents agree word for word — ` +
        `only the arithmetic disagrees.${effectiveNote}`,
      evidence,
      ...score('conflict', [
        { name: 'arithmetic.total-does-not-equal-sum', weight: 0.55 },
        { name: 'arithmetic.gap-is-material', weight: material ? 0.12 : 0 },
        { name: 'evidence.extraction-quality', weight: 0.3 * evidenceQuality(evidence) },
      ]),
    },
  };
};

// --- 4. Loss history completeness ------------------------------------------

/**
 * A narrative summary of losses against the loss run underneath it.
 *
 * Only runs when the packet actually characterises its own loss history — an
 * attached loss run with no claim about it in the covering email is not an
 * omission, and inventing a finding there would be a false positive on a
 * perfectly ordinary submission.
 */
const lossHistoryCompleteness: DerivedRule = (ctx) => {
  const claims = ctx.extraction.facts.filter((f) => f.field === 'loss_summary_claim');
  if (claims.length === 0) return null;

  const incurred = ctx.extraction.facts.filter((f) => f.field === 'loss_incurred');
  const actualClaims = unique(incurred.map((f) => f.entityKey));
  const worst = incurred.reduce<Fact | null>(
    (top, f) => (top === null || (f.value.numeric ?? 0) > (top.value.numeric ?? 0) ? f : top),
    null,
  );
  const maxIncurred = worst?.value.numeric ?? 0;

  const violations: { signal: string; text: string; ratio: number }[] = [];

  for (const claim of claims) {
    const [key, valueText] = claim.value.canonical.split('=');
    const asserted = Number(valueText);

    if (key === 'count' && actualClaims.length > asserted) {
      violations.push({
        signal: 'appetite.narrative-understates-loss-count',
        text:
          `the narrative asserts ${asserted} loss(es) — ${cited(claim, ctx.titles)} — while ` +
          `the loss run carries ${actualClaims.length}`,
        ratio: actualClaims.length / Math.max(1, asserted),
      });
    }
    if (key === 'cap' && maxIncurred > asserted) {
      violations.push({
        signal: 'appetite.narrative-understates-loss-severity',
        text:
          `the narrative asserts no loss above ${money(asserted)} — ` +
          `${cited(claim, ctx.titles)} — while ${entityLabel(worst!.entityKey)} is incurred at ` +
          `${money(maxIncurred)}`,
        ratio: maxIncurred / Math.max(1, asserted),
      });
    }
    if (key === 'qualifier' && maxIncurred > GUIDELINES.minorLossCeiling) {
      violations.push({
        signal: 'appetite.losses-described-as-minor-exceed-guideline',
        text:
          `the losses are characterised as minor — ${cited(claim, ctx.titles)} — but ` +
          `${entityLabel(worst!.entityKey)} is incurred at ${money(maxIncurred)}, above the ` +
          `${money(GUIDELINES.minorLossCeiling)} illustrative minor-loss line used by this bench`,
        ratio: maxIncurred / GUIDELINES.minorLossCeiling,
      });
    }
  }

  const evidence = [...claims, ...incurred];
  const group = derivedGroup('loss_history_completeness', evidence);

  if (violations.length === 0) {
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `The narrative description of the loss history matches the loss run: ` +
          `${actualClaims.length} claim(s), worst incurred ${money(maxIncurred)}.`,
        evidence,
        ...score('consistent', [
          { name: 'appetite.narrative-matches-loss-run', weight: 0.84 },
          { name: 'evidence.extraction-quality', weight: 0.12 * evidenceQuality(evidence) },
        ]),
      },
    };
  }

  const severe = violations.some((v) => v.ratio >= 5);
  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'conflict',
      rationale:
        `The submission's account of its own loss history does not survive the loss run: ` +
        `${joinList(violations.map((v) => v.text))}. An underwriter pricing from the ` +
        `narrative alone would be wrong about the exposure, which is a different and worse ` +
        `failure than a formatting mismatch.`,
      evidence,
      ...score('conflict', [
        { name: 'appetite.narrative-contradicted-by-loss-run', weight: 0.45 },
        ...violations.map((v) => ({ name: v.signal, weight: 0.12 })),
        { name: 'appetite.breach-exceeds-assertion-fivefold', weight: severe ? 0.1 : 0 },
        { name: 'evidence.extraction-quality', weight: 0.25 * evidenceQuality(evidence) },
      ]),
    },
  };
};

// --- 5. Location roster ----------------------------------------------------

/**
 * Near-duplicate garaging addresses, kept distinct and said out loud.
 *
 * Two vehicles' addresses never share an evidence group, so the only way this
 * pipeline can get locations wrong is by *merging* two real yards. That failure
 * is invisible by construction — a merge produces no finding at all — so it
 * gets an explicit rule whose job is to report the near-miss along with the
 * token that keeps them apart. The finding a reviewer should see is "these two
 * look alike and here is why they are not the same place", not silence.
 */
const locationRoster: DerivedRule = (ctx) => {
  const addressFacts: Fact[] = [];
  ctx.groups.forEach((group) => {
    if (group.field !== 'garaging_address') return;
    const fact = effectiveFact(group);
    if (fact) addressFacts.push(fact);
  });
  if (addressFacts.length === 0) return null;

  const byCanonical = new Map<string, Fact>();
  for (const fact of addressFacts) {
    if (!byCanonical.has(fact.value.canonical)) byCanonical.set(fact.value.canonical, fact);
  }
  const canonicals = [...byCanonical.keys()];
  const evidence = [...byCanonical.values()];
  const group = derivedGroup('location_roster', evidence);

  const nearMisses: { a: string; b: string; token: string; similarity: number }[] = [];
  for (let i = 0; i < canonicals.length; i += 1) {
    for (let j = i + 1; j < canonicals.length; j += 1) {
      const similarity = addressSimilarity(canonicals[i], canonicals[j]);
      if (similarity < GUIDELINES.nearDuplicateAddressSimilarity) continue;
      const token = distinguishingAddressToken(canonicals[i], canonicals[j]);
      if (!token) continue;
      nearMisses.push({ a: canonicals[i], b: canonicals[j], token, similarity });
    }
  }

  if (nearMisses.length === 0) {
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `${canonicals.length} distinct garaging location(s), none of them close enough to ` +
          `another to be at risk of being merged.`,
        evidence,
        ...score('consistent', [
          { name: 'identity.locations-not-near-duplicates', weight: 0.88 },
          { name: 'evidence.extraction-quality', weight: 0.1 * evidenceQuality(evidence) },
        ]),
      },
    };
  }

  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'benign_variant',
      rationale:
        `${joinList(
          nearMisses.map(
            (n) =>
              `"${n.a}" and "${n.b}" are ${Math.round(n.similarity * 100)}% textually ` +
              `identical but have a ${n.token}`,
          ),
        )}. These were NOT merged: they are separate garaging locations with separate ` +
        `exposures, and the count the submission states is the count after keeping them ` +
        `apart. Normalising the difference away would produce one location, a false ` +
        `mismatch against the stated location count, and a wrong rating basis.`,
      evidence,
      ...score('benign_variant', [
        { name: 'identity.near-duplicate-addresses-kept-distinct', weight: 0.7 },
        { name: 'identity.distinguishing-token-identified', weight: 0.1 },
        { name: 'evidence.extraction-quality', weight: 0.12 * evidenceQuality(evidence) },
      ]),
    },
  };
};

// --- 6. Location count reconciliation --------------------------------------

const locationCountReconciliation: DerivedRule = (ctx) => {
  const statedGroup = ctx.groups.get('policy::garaging_location_count');
  const stated = effectiveFact(statedGroup);
  if (!stated || stated.value.numeric === undefined) return null;
  if (!settled(ctx, 'policy::garaging_location_count')) return null;

  const canonicals = new Set<string>();
  const evidence: Fact[] = [stated];
  ctx.groups.forEach((group) => {
    if (group.field !== 'garaging_address') return;
    const fact = effectiveFact(group);
    if (!fact) return;
    if (!canonicals.has(fact.value.canonical)) {
      canonicals.add(fact.value.canonical);
      evidence.push(fact);
    }
  });
  if (canonicals.size === 0) return null;

  const group = derivedGroup('location_count_reconciliation', evidence);

  if (canonicals.size === stated.value.numeric) {
    return {
      group,
      finding: {
        groupKey: group.key,
        label: group.label,
        entityKey: 'policy',
        classification: 'consistent',
        rationale:
          `${stated.value.numeric} garaging location(s) stated and ${canonicals.size} distinct ` +
          `address(es) on the schedule.`,
        evidence,
        ...score('consistent', [
          { name: 'reconciliation.location-count-matches-schedule', weight: 0.88 },
          { name: 'evidence.extraction-quality', weight: 0.1 * evidenceQuality(evidence) },
        ]),
      },
    };
  }

  return {
    group,
    finding: {
      groupKey: group.key,
      label: group.label,
      entityKey: 'policy',
      classification: 'conflict',
      rationale:
        `${stated.value.numeric} garaging location(s) stated but ${canonicals.size} distinct ` +
        `address(es) appear on the schedule: ${joinList([...canonicals])}. Garaging ` +
        `territory drives rate, so the location roster has to be settled before the ` +
        `schedule can be rated.`,
      evidence,
      ...score('conflict', [
        { name: 'reconciliation.location-count-differs-from-schedule', weight: 0.55 },
        { name: 'evidence.extraction-quality', weight: 0.3 * evidenceQuality(evidence) },
      ]),
    },
  };
};

/**
 * Order matters. `vin_uniqueness` runs first because it is the only rule whose
 * answer no other rule depends on, and the reconciliation rules run after the
 * observed groups have been classified because they refuse to run against a
 * value that is itself in dispute.
 */
export const DERIVED_RULES: DerivedRule[] = [
  vinUniqueness,
  vehicleCountReconciliation,
  scheduledValueReconciliation,
  lossHistoryCompleteness,
  locationRoster,
  locationCountReconciliation,
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The reference pipeline end to end: extract, link, adjudicate, then apply the
 * cross-document rules.
 *
 * Every group gets a finding, including the `consistent` ones. That is more
 * output than a reviewer wants to read, and the UI filters it, but it means the
 * scorer never has to guess whether a missing finding meant "agreed" or "not
 * examined" — and it makes the ground-truth enumeration test possible, which is
 * the check that stops the labels drifting to fit the implementation.
 */
export function analyzePacket(packet: Packet): PacketAnalysis {
  const extraction = extractPacket(packet);
  const titles = documentTitles(packet);

  const observed = buildEvidenceGroups(extraction.facts);
  const groups = new Map<string, EvidenceGroup>(observed.map((g) => [g.key, g]));
  const findings = new Map<string, Finding>();

  for (const group of observed) {
    findings.set(group.key, classifyGroup(group, { titles, packetFacts: extraction.facts }));
  }

  const ctx: RuleContext = { packet, extraction, titles, groups, findings };
  const derived: EvidenceGroup[] = [];

  for (const rule of DERIVED_RULES) {
    const result = rule(ctx);
    if (!result) continue;
    groups.set(result.group.key, result.group);
    findings.set(result.finding.groupKey, result.finding);
    derived.push(result.group);
  }

  // Derived findings first: they are the cross-document questions, and they are
  // what a reviewer opens the packet to see.
  const ordered = [...derived, ...observed];

  return {
    packetId: packet.id,
    engine: 'reference',
    facts: extraction.facts,
    groups: ordered,
    findings: ordered.map((g) => findings.get(g.key)!),
  };
}
