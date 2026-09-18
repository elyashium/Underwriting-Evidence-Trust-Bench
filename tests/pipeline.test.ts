import { describe, expect, it } from 'vitest';

import { PACKETS, TAXONOMY } from '../src/data/packets';
import { analyzePacket } from '../src/lib/classify';
import { analyzeNaive } from '../src/lib/naive';
import { compareEngines, scoreEngine } from '../src/lib/score';
import type { Fact, Finding, Packet, PacketAnalysis } from '../src/lib/types';

/**
 * End-to-end over the real corpus.
 *
 * `score.test.ts` pins the arithmetic with fixtures. This file asserts
 * behaviour: that the reference engine reproduces every hand-authored label on
 * all sixteen packets, invents nothing, and beats the baseline in the two
 * specific ways the baseline was built to be worse at.
 *
 * The contract being enforced is the two-way one described in `GroundTruth`:
 * every declared key must appear in the output with exactly its declared label,
 * AND every non-`consistent` finding the engine emits must appear in ground
 * truth. Only the first half is a normal test. The second half is the one that
 * matters, because it is what stops the engine from buying recall by flagging
 * more things.
 */

const referenceAnalyses: PacketAnalysis[] = PACKETS.map(analyzePacket);
const naiveAnalyses: PacketAnalysis[] = PACKETS.map(analyzeNaive);

const reference = scoreEngine({
  engine: 'reference',
  packets: PACKETS,
  analyses: referenceAnalyses,
});
const baseline = scoreEngine({
  engine: 'naive',
  packets: PACKETS,
  analyses: naiveAnalyses,
});
const comparison = compareEngines(reference, baseline);

const analysisOf = (id: string) => referenceAnalyses.find((a) => a.packetId === id)!;
const findingIn = (id: string, groupKey: string): Finding | undefined =>
  analysisOf(id).findings.find((f) => f.groupKey === groupKey);

// ---------------------------------------------------------------------------
// The corpus itself
// ---------------------------------------------------------------------------

describe('the packet corpus', () => {
  it('is sixteen packets, evenly split between real conflicts and hard negatives', () => {
    // The split is the design: an evaluation set made mostly of true positives
    // measures eagerness, not judgement.
    expect(PACKETS).toHaveLength(16);
    expect(PACKETS.filter((p) => p.bucket === 'true_conflict')).toHaveLength(8);
    expect(PACKETS.filter((p) => p.bucket === 'hard_negative')).toHaveLength(8);
  });

  it('gives every taxonomy case at least one packet', () => {
    for (const taxonomyCase of TAXONOMY) {
      const forCase = PACKETS.filter((p) => p.taxonomyCase === taxonomyCase.id);

      expect(forCase.length).toBeGreaterThan(0);
      for (const packet of forCase) expect(packet.bucket).toBe(taxonomyCase.bucket);
    }
  });

  it('uses unique packet ids and unique document ids within each packet', () => {
    expect(new Set(PACKETS.map((p) => p.id)).size).toBe(PACKETS.length);
    for (const packet of PACKETS) {
      const ids = packet.documents.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(1); // a one-document packet cannot cross-reference
    }
  });

  it('declares a focus group that is labelled, and labelled as a finding', () => {
    for (const packet of PACKETS) {
      const { focusGroup, expected } = packet.groundTruth;

      expect(Object.keys(expected)).toContain(focusGroup);
      // The focus group is the thing the packet was written to exercise, so it
      // is never `consistent` — otherwise the packet tests nothing.
      expect(expected[focusGroup]).not.toBe('consistent');
    }
  });
});

// ---------------------------------------------------------------------------
// Citation integrity
// ---------------------------------------------------------------------------

describe('source spans', () => {
  const everyFact: Array<{ packet: Packet; fact: Fact }> = PACKETS.flatMap((packet, i) =>
    referenceAnalyses[i].facts.map((fact) => ({ packet, fact })),
  );

  it('extracts something from every packet', () => {
    expect(everyFact.length).toBeGreaterThan(200);
  });

  it('quotes text that actually exists at the offsets it cites', () => {
    // Today the extractor derives `quote` by slicing, so this is true by
    // construction. It is asserted anyway: the optional LLM extractor is the
    // one place a citation could be invented, and this is the assertion that
    // would catch it.
    for (const { packet, fact } of everyFact) {
      const doc = packet.documents.find((d) => d.id === fact.span.documentId);

      expect(doc, `${fact.id} cites a document not in its packet`).toBeDefined();
      expect(fact.span.start).toBeLessThan(fact.span.end);
      expect(fact.span.end).toBeLessThanOrEqual(doc!.content.length);
      expect(doc!.content.slice(fact.span.start, fact.span.end)).toBe(fact.span.quote);
      expect(fact.span.quote.trim().length).toBeGreaterThan(0);
    }
  });

  it('reports an extraction confidence it is willing to stand behind', () => {
    for (const { fact } of everyFact) {
      expect(fact.confidence).toBeGreaterThan(0);
      expect(fact.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// The two-way contract
// ---------------------------------------------------------------------------

describe('the reference engine against ground truth', () => {
  it('reproduces every hand-authored label exactly', () => {
    const wrong = reference.graded
      .filter((r) => r.declared && !r.correct)
      .map((r) => `${r.packetId} ${r.groupKey}: expected ${r.expected}, got ${r.predicted}`);

    expect(wrong).toEqual([]);
    expect(reference.labelAccuracy.value).toBe(1);
  });

  it('emits no finding the ground truth did not declare', () => {
    // The half of the contract that cannot be satisfied by flagging more.
    const uninvited = reference.graded
      .filter((r) => !r.declared && r.predicted !== 'consistent')
      .map((r) => `${r.packetId} ${r.groupKey} -> ${r.predicted}`);

    expect(uninvited).toEqual([]);
  });

  it('passes every case in the taxonomy', () => {
    const failed = reference.byCase.filter((c) => !c.passed).map((c) => c.taxonomyCase.name);

    expect(failed).toEqual([]);
  });

  it('passes every packet', () => {
    const failed = reference.byPacket.filter((p) => !p.passed).map((p) => p.packetId);

    expect(failed).toEqual([]);
  });
});

describe('the headline numbers for the reference engine', () => {
  it('interrupts nobody about a clean packet', () => {
    expect(reference.hardNegativePacketFpr).toEqual({ n: 0, of: 8, value: 0 });
    expect(reference.hardNegativeGroupFpr.n).toBe(0);
  });

  it('catches every conflict that is really there', () => {
    expect(reference.conflictRecall.value).toBe(1);
    expect(reference.conflictRecall.of).toBe(8);
    expect(reference.conflictPacketRecall).toEqual({ n: 8, of: 8, value: 1 });
  });

  it('drops nothing that was declared', () => {
    expect(reference.dropRate.n).toBe(0);
    expect(reference.noiseRate.n).toBe(0);
  });

  it('is measured over a sample small enough that the numbers say so', () => {
    // Guarding against the scorecard ever being quoted without its denominator.
    expect(reference.packets).toBe(16);
    expect(reference.calibration.note).toMatch(/sixteen/i);
  });
});

// ---------------------------------------------------------------------------
// Legibility of findings
// ---------------------------------------------------------------------------

describe('every finding is legible to a reviewer', () => {
  const adjudicated = referenceAnalyses.flatMap((a) =>
    a.findings.filter((f) => f.classification !== 'consistent'),
  );

  it('produces findings to review at all', () => {
    expect(adjudicated.length).toBeGreaterThan(10);
  });

  it('gives a reason and at least one named signal, never a bare score', () => {
    for (const f of adjudicated) {
      expect(f.rationale.length).toBeGreaterThan(40);
      expect(f.signals.length).toBeGreaterThan(0);
      for (const signal of f.signals) expect(signal).toMatch(/^[a-z]+\./);
    }
  });

  it('cites the evidence it reasoned over', () => {
    for (const f of adjudicated) expect(f.evidence.length).toBeGreaterThan(0);
  });

  it('keeps confidence inside the per-classification ceilings', () => {
    for (const f of referenceAnalyses.flatMap((a) => a.findings)) {
      expect(f.confidence).toBeGreaterThanOrEqual(0.05);
      expect(f.confidence).toBeLessThanOrEqual(0.99);
      // `unresolved` means "I do not know", and a classifier that can say
      // "certainly do not know" at 0.9 is not saying anything useful.
      if (f.classification === 'unresolved') expect(f.confidence).toBeLessThanOrEqual(0.7);
    }
  });

  it('reasons across documents on at least one real conflict', () => {
    // A cross-document bench whose findings all live inside one attachment
    // would not be testing anything the brief asked about.
    const crossDocument = referenceAnalyses
      .flatMap((a) => a.findings)
      .filter((f) => f.classification === 'conflict')
      .filter((f) => new Set(f.evidence.map((e) => e.documentId)).size > 1);

    expect(crossDocument.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The cases the brief calls out by name
// ---------------------------------------------------------------------------

describe('the endorsement-supersession case (PKT-009)', () => {
  const finding = findingIn('PKT-009', 'policy::stated_vehicle_count')!;

  it('is not flagged as a conflict', () => {
    // The brief's definition of done names this one specifically.
    expect(finding.classification).toBe('supersession');
  });

  it('rests on change language in the source, not on the document being newer', () => {
    expect(finding.signals).toContain('temporal.explicit-change-language-in-source');
  });

  it('names the document that superseded the earlier value', () => {
    expect(finding.supersededBy).toBeDefined();
    expect(finding.supersededBy!.documentTitle.length).toBeGreaterThan(0);
  });
});

describe('the near-duplicate address cases (PKT-011, PKT-012)', () => {
  for (const id of ['PKT-011', 'PKT-012']) {
    it(`${id} reports two real yards, not a contradiction`, () => {
      expect(findingIn(id, 'policy::location_roster')!.classification).toBe('benign_variant');
      // And the count the application states still reconciles against them.
      expect(findingIn(id, 'policy::location_count_reconciliation')!.classification).toBe(
        'consistent',
      );
    });
  }
});

describe('the OCR VIN case (PKT-015)', () => {
  it('reads the rescanned row as the same vehicle', () => {
    expect(findingIn('PKT-015', 'vehicle:unit-9::vin')!.classification).toBe('benign_variant');
  });

  it('does not then report a duplicate VIN in the schedule', () => {
    // Folding the OCR glyphs and *then* running the uniqueness check is the
    // whole point; doing it in the other order manufactures a conflict.
    expect(findingIn('PKT-015', 'policy::vin_uniqueness')!.classification).toBe('consistent');
  });
});

// ---------------------------------------------------------------------------
// Against the baseline
// ---------------------------------------------------------------------------

describe('reference engine vs baseline', () => {
  it('runs the baseline on identical extraction and linking', () => {
    // The comparison is only meaningful if the baseline was not handicapped
    // upstream of the two capabilities under test.
    for (let i = 0; i < PACKETS.length; i += 1) {
      expect(naiveAnalyses[i].facts.length).toBe(referenceAnalyses[i].facts.length);
      expect(naiveAnalyses[i].groups.map((g) => g.key)).toEqual(
        referenceAnalyses[i].groups.filter((g) => !g.derived).map((g) => g.key),
      );
    }
  });

  it('trips the baseline on clean packets where the reference engine stays quiet', () => {
    expect(baseline.hardNegativePacketFpr.value).toBeGreaterThan(
      reference.hardNegativePacketFpr.value!,
    );
    expect(comparison.falseConflictsAvoided.length).toBeGreaterThan(0);
    expect(comparison.falseConflictsIntroduced).toEqual([]);
  });

  it('catches conflicts the baseline cannot see', () => {
    // These are the ones that exist only *between* fields and are never
    // written down in any single one of them.
    expect(comparison.onlyReferenceCaught.length).toBeGreaterThan(0);
    expect(baseline.conflictRecall.value!).toBeLessThan(reference.conflictRecall.value!);
  });

  it('reproduces fewer hand-authored labels than the reference engine', () => {
    expect(baseline.labelAccuracy.value!).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Reproducibility
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces byte-identical analyses on a second run', () => {
    // The corpus is a frozen literal and the engine is pure, so the scorecard
    // is reproducible by anyone who clones the repo. That property is what
    // makes publishing a number defensible at all.
    for (const packet of PACKETS) {
      expect(JSON.stringify(analyzePacket(packet))).toBe(
        JSON.stringify(analyzePacket(packet)),
      );
    }
  });
});
