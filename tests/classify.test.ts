import { describe, expect, it } from 'vitest';

import { analyzePacket, classifyGroup, GUIDELINES } from '../src/lib/classify';
import { PACKETS, TAXONOMY } from '../src/data/packets';
import type {
  Classification,
  EvidenceGroup,
  Fact,
  Finding,
  NormalizedValue,
  Packet,
} from '../src/lib/types';

/**
 * Tests for the classifier, written against the case taxonomy rather than
 * against the implementation.
 *
 * Two layers, and the distinction matters:
 *
 *   - The GROUND-TRUTH CONTRACT below grades the whole pipeline against
 *     hand-authored labels. It is the only test that can fail for a reason the
 *     bench actually cares about — a hard negative flagged as a conflict is a
 *     false positive, which is the headline metric.
 *   - The per-case tests assert the *specific behaviour* each taxonomy case was
 *     authored to exercise, so a regression points at a named capability
 *     ("supersession no longer requires change language") instead of at a
 *     packet id.
 *
 * Nothing here asserts an exact confidence. Confidence is graded by the
 * calibration chart, over the whole set, against reviewer verdicts — pinning
 * 0.92 in an assertion would freeze a number whose whole purpose is to be
 * measured rather than declared.
 */

const analyses = new Map<string, ReturnType<typeof analyzePacket>>(
  PACKETS.map((p) => [p.id, analyzePacket(p)]),
);

const analysisFor = (packet: Packet) => analyses.get(packet.id)!;

const findingFor = (packet: Packet, groupKey: string): Finding | undefined =>
  analysisFor(packet).findings.find((f) => f.groupKey === groupKey);

const packetsForCase = (id: number): Packet[] =>
  PACKETS.filter((p) => p.taxonomyCase === id);

const classificationOf = (packet: Packet, groupKey: string): Classification | undefined =>
  findingFor(packet, groupKey)?.classification;

/** Every finding the reviewer would actually be shown, i.e. not `consistent`. */
const reported = (packet: Packet): Finding[] =>
  analysisFor(packet).findings.filter((f) => f.classification !== 'consistent');

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

describe('the ground-truth contract', () => {
  it('has a packet for every taxonomy case', () => {
    for (const taxonomyCase of TAXONOMY) {
      expect(
        packetsForCase(taxonomyCase.id).length,
        `taxonomy case ${taxonomyCase.id} (${taxonomyCase.name}) has no packet`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(PACKETS.map((p) => [p.id, p] as const))(
    '%s produces exactly the classification the label asserts, for every labelled group',
    (_id, packet) => {
      for (const [groupKey, expected] of Object.entries(packet.groundTruth.expected)) {
        const finding = findingFor(packet, groupKey);
        expect(finding, `${packet.id}: no finding for labelled group ${groupKey}`).toBeDefined();
        expect(finding!.classification, `${packet.id}: ${groupKey}`).toBe(expected);
      }
    },
  );

  /**
   * The other half of the contract, and the half that catches false positives.
   *
   * A label map lists only the groups a packet was authored to say something
   * about; every other group is asserted to be `consistent` by omission. So any
   * finding the pipeline surfaces that the label map does not name is, by
   * definition, an unrequested finding — and if it is a `conflict` on a hard
   * negative it is exactly the failure this whole bench exists to measure.
   */
  it.each(PACKETS.map((p) => [p.id, p] as const))(
    '%s surfaces no finding that the label map does not declare',
    (_id, packet) => {
      const undeclared = reported(packet)
        .filter((f) => !(f.groupKey in packet.groundTruth.expected))
        .map((f) => `${f.groupKey} = ${f.classification} — ${f.rationale}`);
      expect(undeclared, `${packet.id} surfaced undeclared findings`).toEqual([]);
    },
  );

  it('flags at least one conflict in every true-conflict packet', () => {
    for (const packet of PACKETS.filter((p) => p.bucket === 'true_conflict')) {
      const conflicts = reported(packet).filter((f) => f.classification === 'conflict');
      expect(conflicts.length, `${packet.id} planted a conflict and none was found`)
        .toBeGreaterThan(0);
    }
  });

  it('flags no conflict in any hard-negative packet', () => {
    for (const packet of PACKETS.filter((p) => p.bucket === 'hard_negative')) {
      const conflicts = reported(packet)
        .filter((f) => f.classification === 'conflict')
        .map((f) => `${f.groupKey}: ${f.rationale}`);
      expect(conflicts, `${packet.id} is a hard negative and must not raise a conflict`)
        .toEqual([]);
    }
  });

  it('cites evidence for every finding it reports', () => {
    for (const packet of PACKETS) {
      for (const finding of reported(packet)) {
        expect(finding.evidence.length, `${packet.id} ${finding.groupKey}`).toBeGreaterThan(0);
        expect(finding.signals.length, `${packet.id} ${finding.groupKey}`).toBeGreaterThan(0);
        expect(finding.rationale.length, `${packet.id} ${finding.groupKey}`).toBeGreaterThan(40);
      }
    }
  });

  /**
   * A citation that does not appear in the document it points at is a
   * fabrication, however plausible it reads. Spans are derived by the extractor
   * from character offsets and never authored in the packet data, so this holds
   * for LLM-extracted facts too once that path is enabled.
   */
  it('quotes only text that genuinely appears at the offset it cites', () => {
    for (const packet of PACKETS) {
      const byId = new Map(packet.documents.map((d) => [d.id, d.content]));
      for (const fact of analysisFor(packet).facts) {
        const content = byId.get(fact.span.documentId);
        expect(content, `${packet.id}: span cites unknown document`).toBeDefined();
        expect(
          content!.slice(fact.span.start, fact.span.end),
          `${packet.id} ${fact.id}`,
        ).toBe(fact.span.quote);
      }
    }
  });

  it('never reports a confidence outside the classification ceiling', () => {
    const ceiling: Record<Classification, number> = {
      consistent: 0.99,
      conflict: 0.97,
      benign_variant: 0.96,
      supersession: 0.95,
      unresolved: 0.7,
    };
    for (const packet of PACKETS) {
      for (const finding of analysisFor(packet).findings) {
        expect(finding.confidence, `${packet.id} ${finding.groupKey}`)
          .toBeLessThanOrEqual(ceiling[finding.classification]);
        expect(finding.confidence).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Case 1 — duplicate VIN, different values
// ---------------------------------------------------------------------------

describe('taxonomy case 1 — one VIN cannot describe two separately rated units', () => {
  const packets = packetsForCase(1);

  it.each(packets.map((p) => [p.id, p] as const))('%s raises a VIN uniqueness conflict', (_id, packet) => {
    expect(classificationOf(packet, 'policy::vin_uniqueness')).toBe('conflict');
  });

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s names both units and cites the rows that collide',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::vin_uniqueness')!;
      const units = new Set(
        finding.evidence.filter((f) => f.field === 'vin').map((f) => f.entityKey),
      );
      expect(units.size).toBeGreaterThanOrEqual(2);
      expect(finding.signals).toContain('identity.vin-carried-on-two-units');
    },
  );

  /**
   * The count rule must stay quiet here. Two rows sharing a VIN are still two
   * unit numbers, so the fleet size reconciles — and a second finding for one
   * planted fault would double-count in the recall numerator.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s does not also raise a fleet-count conflict for the same fault',
    (_id, packet) => {
      expect(classificationOf(packet, 'policy::vehicle_count_reconciliation')).toBe('consistent');
    },
  );

  it('scores the collision higher when the two rows are rated differently', () => {
    for (const packet of packets) {
      const finding = findingFor(packet, 'policy::vin_uniqueness')!;
      if (finding.signals.includes('identity.units-rated-differently')) {
        expect(finding.rationale).toMatch(/could simply be de-duplicated/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2 — stated fleet count vs schedule rows
// ---------------------------------------------------------------------------

describe('taxonomy case 2 — a stated count is reconciled against the actual schedule', () => {
  const packets = packetsForCase(2);

  it.each(packets.map((p) => [p.id, p] as const))('%s raises a count conflict', (_id, packet) => {
    expect(classificationOf(packet, 'policy::vehicle_count_reconciliation')).toBe('conflict');
  });

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s cites the schedule it counted rather than asserting a bare number',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::vehicle_count_reconciliation')!;
      const counted = finding.evidence.find((f) => f.field === 'schedule_unit_count');
      expect(counted, 'the row count must be a citable fact').toBeDefined();
      expect(counted!.span.quote.length).toBeGreaterThan(0);
      expect(counted!.value.note).toMatch(/distinct unit numbers/);
    },
  );

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s says in words that nothing in the packet explains the gap',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::vehicle_count_reconciliation')!;
      expect(finding.signals).toContain('reconciliation.no-explanation-in-packet');
    },
  );
});

// ---------------------------------------------------------------------------
// Case 3 — loss history omission
// ---------------------------------------------------------------------------

describe('taxonomy case 3 — the narrative is checked against the loss run', () => {
  const packets = packetsForCase(3);

  it.each(packets.map((p) => [p.id, p] as const))('%s raises a loss-history conflict', (_id, packet) => {
    expect(classificationOf(packet, 'policy::loss_history_completeness')).toBe('conflict');
  });

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s cites both the narrative claim and the loss-run rows that refute it',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::loss_history_completeness')!;
      expect(finding.evidence.some((f) => f.field === 'loss_summary_claim')).toBe(true);
      expect(finding.evidence.some((f) => f.field === 'loss_incurred')).toBe(true);
    },
  );

  it('checks severity as well as count', () => {
    const signals = packets.flatMap((p) => findingFor(p, 'policy::loss_history_completeness')!.signals);
    expect(signals).toContain('appetite.narrative-understates-loss-count');
    expect(
      signals.some(
        (s) =>
          s === 'appetite.narrative-understates-loss-severity' ||
          s === 'appetite.losses-described-as-minor-exceed-guideline',
      ),
    ).toBe(true);
  });

  it('labels the minor-loss threshold as this bench\'s own illustrative guideline', () => {
    const rationales = packets.map((p) => findingFor(p, 'policy::loss_history_completeness')!.rationale);
    const citesGuideline = rationales.some((r) => r.includes('illustrative minor-loss line used by this bench'));
    if (citesGuideline) {
      expect(GUIDELINES.minorLossCeiling).toBe(25_000);
    }
  });

  /**
   * A packet that never characterises its own loss history has not omitted
   * anything. Raising a finding there would invent an obligation the submission
   * never took on.
   */
  it('stays silent on packets whose documents make no claim about the loss history', () => {
    const quiet = PACKETS.filter(
      (p) => !analysisFor(p).facts.some((f) => f.field === 'loss_summary_claim'),
    );
    expect(quiet.length).toBeGreaterThan(0);
    for (const packet of quiet) {
      expect(findingFor(packet, 'policy::loss_history_completeness')).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 4 — conflicting effective dates
// ---------------------------------------------------------------------------

describe('taxonomy case 4 — two dates with no amendment language are escalated', () => {
  const packets = packetsForCase(4);

  it.each(packets.map((p) => [p.id, p] as const))('%s raises an effective-date conflict', (_id, packet) => {
    expect(classificationOf(packet, 'policy::effective_date')).toBe('conflict');
  });

  /**
   * The load-bearing assertion of the whole classifier. If recency alone were
   * enough, the later of the two dates would silently win and this packet would
   * report nothing at all.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s refuses to let the newer document win by being newer',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::effective_date')!;
      expect(finding.classification).not.toBe('supersession');
      expect(finding.rationale).toMatch(/recency alone is not a licence/);
      expect(finding.evidence.every((f) => f.changeIntent === undefined)).toBe(true);
    },
  );

  /**
   * "incept June 1" has no year, so the year is inferred and the reading is
   * weaker. The conflict is still real; the confidence should say the evidence
   * is not pristine, which is what the calibration chart is measuring.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s carries the weakest reading through to the confidence',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::effective_date')!;
      const weakest = Math.min(...finding.evidence.map((f) => f.confidence));
      if (weakest < 0.8) expect(finding.confidence).toBeLessThan(0.85);
    },
  );
});

// ---------------------------------------------------------------------------
// Case 5 — aggregate does not sum
// ---------------------------------------------------------------------------

describe('taxonomy case 5 — arithmetic, not string comparison', () => {
  const packets = packetsForCase(5);

  it.each(packets.map((p) => [p.id, p] as const))('%s raises a value-reconciliation conflict', (_id, packet) => {
    expect(classificationOf(packet, 'policy::scheduled_value_reconciliation')).toBe('conflict');
  });

  /**
   * What makes this case hard: no two documents disagree textually. Every
   * string in the packet matches every other string. Only the sum is wrong, so
   * a pipeline built purely on comparing values finds nothing here.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s finds the fault even though no two values textually disagree',
    (_id, packet) => {
      expect(classificationOf(packet, 'policy::total_scheduled_value')).toBe('consistent');
      const finding = findingFor(packet, 'policy::scheduled_value_reconciliation')!;
      expect(finding.rationale).toMatch(/agree word for word/);
      expect(finding.evidence.filter((f) => f.field === 'stated_value').length).toBeGreaterThan(1);
    },
  );

  it('reports no value reconciliation at all when the packet states no total', () => {
    const noTotal = PACKETS.filter(
      (p) => !analysisFor(p).facts.some((f) => f.field === 'total_scheduled_value'),
    );
    expect(noTotal.length).toBeGreaterThan(0);
    for (const packet of noTotal) {
      expect(findingFor(packet, 'policy::scheduled_value_reconciliation')).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 6 — legitimate endorsement supersession
// ---------------------------------------------------------------------------

describe('taxonomy case 6 — an announced change is an update, not a contradiction', () => {
  const packets = packetsForCase(6);

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s classifies the changed value as supersession and raises no conflict',
    (_id, packet) => {
      expect(classificationOf(packet, packet.groundTruth.focusGroup)).toBe('supersession');
      expect(reported(packet).filter((f) => f.classification === 'conflict')).toEqual([]);
    },
  );

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s attributes the change to the document that made it',
    (_id, packet) => {
      const finding = findingFor(packet, packet.groundTruth.focusGroup)!;
      expect(finding.supersededBy).toBeDefined();
      expect(finding.supersededBy!.documentTitle.length).toBeGreaterThan(0);
      expect(finding.signals).toContain('temporal.explicit-change-language-in-source');
    },
  );

  /**
   * The second trap in PKT-010: the endorsement moves an aggregate too, so any
   * rule that sums the schedule has to sum the *effective* values. Summing the
   * superseded ones manufactures a conflict out of the endorsement the pipeline
   * has already read and understood.
   */
  it('does arithmetic on post-endorsement values, not the superseded ones', () => {
    for (const packet of packets) {
      const reconciliation = findingFor(packet, 'policy::scheduled_value_reconciliation');
      if (!reconciliation) continue;
      expect(reconciliation.classification).toBe('consistent');
      expect(reconciliation.rationale).toMatch(/effective figures/);
    }
  });

  /**
   * An added unit changes the fleet size, and the count rule has to credit the
   * endorsement rather than reporting the schedule as one unit short.
   */
  it('credits an added unit against the stated fleet size', () => {
    for (const packet of packets) {
      const count = findingFor(packet, 'policy::vehicle_count_reconciliation');
      if (!count) continue;
      expect(count.classification).toBe('consistent');
    }
  });
});

// ---------------------------------------------------------------------------
// Case 7 — near-duplicate but distinct entities
// ---------------------------------------------------------------------------

describe('taxonomy case 7 — normalisation preserves what distinguishes two real places', () => {
  const packets = packetsForCase(7);

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s reports the near-duplicate without merging it',
    (_id, packet) => {
      expect(classificationOf(packet, 'policy::location_roster')).toBe('benign_variant');
      expect(classificationOf(packet, 'policy::location_count_reconciliation')).toBe('consistent');
    },
  );

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s names the token that keeps the two addresses apart',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::location_roster')!;
      expect(finding.signals).toContain('identity.distinguishing-token-identified');
      expect(finding.rationale).toMatch(/different (street suffix|directional|street number) \(/);
    },
  );

  /**
   * The failure this case guards against is invisible: merging two yards
   * produces no finding at all, just a quietly wrong location count. So the
   * count rule is asserted explicitly, not just the roster.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s still counts both locations after normalisation',
    (_id, packet) => {
      const count = findingFor(packet, 'policy::location_count_reconciliation')!;
      const addresses = new Set(
        count.evidence.filter((f) => f.field === 'garaging_address').map((f) => f.value.canonical),
      );
      expect(addresses.size).toBeGreaterThanOrEqual(2);
    },
  );
});

// ---------------------------------------------------------------------------
// Case 8 — equivalent representations
// ---------------------------------------------------------------------------

describe('taxonomy case 8 — ordinary insurance shorthand survives comparison', () => {
  const packets = packetsForCase(8);

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s classifies every shorthand pair as a benign variant, never a conflict',
    (_id, packet) => {
      for (const [groupKey, expected] of Object.entries(packet.groundTruth.expected)) {
        if (expected !== 'benign_variant') continue;
        expect(classificationOf(packet, groupKey)).toBe('benign_variant');
      }
      expect(reported(packet).filter((f) => f.classification === 'conflict')).toEqual([]);
    },
  );

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s names the domain rule that did the reconciling',
    (_id, packet) => {
      for (const finding of reported(packet)) {
        if (finding.classification !== 'benign_variant') continue;
        if (finding.groupKey.endsWith('location_roster')) continue;
        expect(finding.signals.some((s) => s.startsWith('normalize.'))).toBe(true);
      }
    },
  );

  /**
   * The line the `domainRule` marker draws. "Fourteen" and "14" need no
   * insurance knowledge to reconcile, so surfacing them would spend a review
   * cycle on nothing; "$1.2M" and "$1,200,000" are where a general-purpose
   * comparator gets it wrong, so the save is worth showing.
   */
  it('does not report a variant that took no domain knowledge to reconcile', () => {
    const spelledOnly = PACKETS.flatMap((packet) =>
      analysisFor(packet)
        .groups.filter(
          (g) =>
            g.field === 'stated_vehicle_count' &&
            g.facts.some((f) => /^[a-z]+$/i.test(f.raw.split(/\s+/)[0])) &&
            !g.facts.some((f) => f.value.domainRule),
        )
        .map((g) => [packet, g] as const),
    );
    expect(spelledOnly.length, 'no packet spells a count out in words').toBeGreaterThan(0);
    for (const [packet, group] of spelledOnly) {
      expect(classificationOf(packet, group.key), `${packet.id} ${group.key}`).toBe('consistent');
    }
  });
});

// ---------------------------------------------------------------------------
// Case 9 — OCR noise resolving to one fact
// ---------------------------------------------------------------------------

describe('taxonomy case 9 — scan artefacts resolved by domain constraint', () => {
  const packets = packetsForCase(9);

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s reads the garbled VIN as the vehicle already on the schedule',
    (_id, packet) => {
      expect(classificationOf(packet, packet.groundTruth.focusGroup)).toBe('benign_variant');
      const finding = findingFor(packet, packet.groundTruth.focusGroup)!;
      const canonicals = new Set(finding.evidence.map((f) => f.value.canonical));
      expect(canonicals.size).toBe(1);
    },
  );

  /**
   * The expensive half of this failure mode is not the mismatched VIN, it is
   * the phantom fifteenth vehicle a row count invents from a re-sent page.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s invents no extra vehicle from the re-sent page',
    (_id, packet) => {
      expect(classificationOf(packet, 'policy::vehicle_count_reconciliation')).toBe('consistent');
      expect(classificationOf(packet, 'policy::vin_uniqueness')).toBe('consistent');
    },
  );
});

// ---------------------------------------------------------------------------
// Case 10 — mismatch explained by context
// ---------------------------------------------------------------------------

describe('taxonomy case 10 — a discrepancy the packet answers itself', () => {
  const packets = packetsForCase(10);

  it.each(packets.map((p) => [p.id, p] as const))(
    '%s suppresses the apparent count mismatch',
    (_id, packet) => {
      expect(classificationOf(packet, 'policy::vehicle_count_reconciliation')).toBe('benign_variant');
      expect(reported(packet).filter((f) => f.classification === 'conflict')).toEqual([]);
    },
  );

  /**
   * Suppressing it silently would be worse than raising it. The reviewer has to
   * be able to see the sentence that explains the gap and disagree with the
   * pipeline's reading of it.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s attaches the explanation instead of hiding the mismatch',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::vehicle_count_reconciliation')!;
      expect(finding.explainedBy, 'the explaining spans must be attached').toBeDefined();
      expect(finding.explainedBy!.length).toBeGreaterThan(0);
      for (const span of finding.explainedBy!) {
        const doc = packet.documents.find((d) => d.id === span.documentId)!;
        expect(doc.content.slice(span.start, span.end)).toBe(span.quote);
      }
      expect(finding.signals).toContain('reconciliation.gap-fully-accounted-for');
    },
  );

  /**
   * "Fully" is the operative word. An explanation that covers one of three
   * missing units does not close the question, and the rule must not treat a
   * partial answer as a complete one.
   */
  it.each(packets.map((p) => [p.id, p] as const))(
    '%s only suppresses a gap the explanation covers completely',
    (_id, packet) => {
      const finding = findingFor(packet, 'policy::vehicle_count_reconciliation')!;
      const stated = finding.evidence.find((f) => f.field === 'stated_vehicle_count')!;
      const counted = finding.evidence.find((f) => f.field === 'schedule_unit_count')!;
      const added = finding.evidence.filter((f) => f.field === 'endorsement_add_unit').length;
      const removals = finding.evidence.filter((f) => f.field === 'unit_status');
      const gap = stated.value.numeric! - (counted.value.numeric! + added);
      expect(gap).toBeGreaterThan(0);
      expect(removals.length).toBe(gap);
    },
  );
});

// ---------------------------------------------------------------------------
// classifyGroup in isolation
// ---------------------------------------------------------------------------

/**
 * Hand-built groups for the branches no seeded packet reaches.
 *
 * Every packet in the set is authored to be *decidable*, because the scorecard
 * grades decisions. That leaves the `unresolved` path — the one where the
 * honest answer is "I cannot tell" — with no packet exercising it, so it is
 * covered here directly rather than left as untested behaviour that the README
 * nonetheless describes.
 */
function fact(overrides: Partial<Fact> & { value: NormalizedValue }): Fact {
  const documentId = overrides.documentId ?? 'DOC-1';
  return {
    id: overrides.id ?? `${documentId}:${Math.random()}`,
    entityKey: 'vehicle:unit-1',
    field: 'stated_value',
    raw: overrides.value.canonical,
    span: { documentId, start: 0, end: 1, quote: 'x' },
    confidence: 0.9,
    extractor: 'rule',
    documentKind: 'vehicle_schedule',
    receivedAt: '2026-01-01T00:00:00Z',
    ...overrides,
    documentId,
  };
}

function group(facts: Fact[]): EvidenceGroup {
  return {
    key: 'vehicle:unit-1::stated_value',
    entityKey: 'vehicle:unit-1',
    field: facts[0].field,
    label: 'Unit 1 — stated value',
    facts,
    derived: false,
  };
}

describe('classifyGroup', () => {
  it('returns unresolved when normalisation declared itself unsure', () => {
    const finding = classifyGroup(
      group([
        fact({
          value: {
            kind: 'count',
            canonical: '13',
            numeric: 13,
            ambiguous: true,
            note: 'spelled count "twelve" disagrees with digits "13"',
          },
          field: 'stated_vehicle_count',
        }),
      ]),
    );
    expect(finding.classification).toBe('unresolved');
    expect(finding.confidence).toBeLessThanOrEqual(0.7);
    expect(finding.rationale).toMatch(/guess presented as a fact/);
  });

  /**
   * 5/S, 8/B, 2/Z, 6/G, 0/D and 1/7 are all legal VIN characters, so a pair
   * differing only there has two valid readings and the pipeline has no
   * grounds to pick one. This is the exact inverse of PKT-015, where I, O and
   * Q are illegal and the reading is therefore forced.
   */
  it('returns unresolved for VINs differing only at glyphs legal in both readings', () => {
    const finding = classifyGroup(
      group([
        fact({
          field: 'vin',
          documentId: 'DOC-1',
          value: { kind: 'vin', canonical: '1XPBDP9X5HD440228' },
        }),
        fact({
          field: 'vin',
          documentId: 'DOC-2',
          receivedAt: '2026-02-01T00:00:00Z',
          value: { kind: 'vin', canonical: '1XPBDP9XSHD440228' },
        }),
      ]),
    );
    expect(finding.classification).toBe('unresolved');
    expect(finding.rationale).toMatch(/legal in both readings/);
  });

  it('will not call it supersession without change language in the source', () => {
    const finding = classifyGroup(
      group([
        fact({ documentId: 'DOC-1', value: { kind: 'money', canonical: '86000', numeric: 86_000 } }),
        fact({
          documentId: 'DOC-2',
          receivedAt: '2026-06-01T00:00:00Z',
          value: { kind: 'money', canonical: '119500', numeric: 119_500 },
        }),
      ]),
    );
    expect(finding.classification).toBe('conflict');
  });

  it('calls it supersession once the later document says it is changing something', () => {
    const finding = classifyGroup(
      group([
        fact({ documentId: 'DOC-1', value: { kind: 'money', canonical: '86000', numeric: 86_000 } }),
        fact({
          documentId: 'DOC-2',
          receivedAt: '2026-06-01T00:00:00Z',
          changeIntent: 'revise',
          value: { kind: 'money', canonical: '119500', numeric: 119_500 },
        }),
      ]),
    );
    expect(finding.classification).toBe('supersession');
    expect(finding.supersededBy?.documentId).toBe('DOC-2');
  });

  /**
   * Change language somewhere in the group is not the same as the newest value
   * being the changed one. A packet that endorses a value and then restates the
   * old one has an unclear final state, and that is a conflict.
   */
  it('does not accept stale change language as a licence to pick the newest value', () => {
    const finding = classifyGroup(
      group([
        fact({
          documentId: 'DOC-1',
          changeIntent: 'revise',
          value: { kind: 'money', canonical: '119500', numeric: 119_500 },
        }),
        fact({
          documentId: 'DOC-2',
          receivedAt: '2026-06-01T00:00:00Z',
          value: { kind: 'money', canonical: '86000', numeric: 86_000 },
        }),
      ]),
    );
    expect(finding.classification).toBe('conflict');
    expect(finding.rationale).toMatch(/final state is genuinely\s+unclear/);
  });

  it('treats one reading with no counterpart as consistent, not as a variant', () => {
    const finding = classifyGroup(
      group([
        fact({
          value: {
            kind: 'money',
            canonical: '1200000',
            numeric: 1_200_000,
            domainRule: 'money.magnitude-shorthand',
          },
          raw: '$1.2M',
        }),
      ]),
    );
    expect(finding.classification).toBe('consistent');
  });

  it('reports a variant only when two different surface forms were reconciled', () => {
    const value: NormalizedValue = {
      kind: 'money',
      canonical: '1200000',
      numeric: 1_200_000,
      domainRule: 'money.magnitude-shorthand',
      note: 'read magnitude shorthand',
    };
    const finding = classifyGroup(
      group([
        fact({ documentId: 'DOC-1', raw: '$1.2M', value }),
        fact({
          documentId: 'DOC-2',
          raw: '$1,200,000',
          value: { kind: 'money', canonical: '1200000', numeric: 1_200_000 },
        }),
      ]),
    );
    expect(finding.classification).toBe('benign_variant');
    expect(finding.signals).toContain('normalize.money.magnitude-shorthand');
  });

  it('scales confidence with the weakest reading it rests on', () => {
    const strong = classifyGroup(
      group([
        fact({ documentId: 'DOC-1', confidence: 0.9, value: { kind: 'date', canonical: '2026-06-01' } }),
        fact({ documentId: 'DOC-2', confidence: 0.9, value: { kind: 'date', canonical: '2026-07-01' } }),
      ]),
    );
    const weak = classifyGroup(
      group([
        fact({ documentId: 'DOC-1', confidence: 0.9, value: { kind: 'date', canonical: '2026-06-01' } }),
        fact({ documentId: 'DOC-2', confidence: 0.5, value: { kind: 'date', canonical: '2026-07-01' } }),
      ]),
    );
    expect(strong.classification).toBe('conflict');
    expect(weak.classification).toBe('conflict');
    expect(weak.confidence).toBeLessThan(strong.confidence);
  });
});
