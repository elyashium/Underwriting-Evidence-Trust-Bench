import { extractPacket } from './extract';
import { buildEvidenceGroups } from './link';
import type { EvidenceGroup, Fact, Finding, Packet, PacketAnalysis } from './types';

/**
 * The baseline engine.
 *
 * WHAT THIS IS: a contrast I wrote myself, to make the reference engine's
 * numbers mean something. A scorecard with one engine on it reports an absolute
 * score against a set of packets I also wrote, which is close to unfalsifiable.
 * Two engines on the same packets, differing in a stated and small way, turn the
 * scorecard into a measurement of that difference.
 *
 * WHAT THIS IS NOT: a model of anyone's product. It is not a stand-in for any
 * commercial extraction or reconciliation system, it was not derived from
 * observing one, and a real system failing the way this one fails would be a
 * surprise. Nothing in this repo licenses the sentence "vendor X scores like the
 * baseline". The baseline scores like the baseline.
 *
 * THE DIFFERENCE, PRECISELY. This engine is given the same documents, the same
 * extractor and the same entity linking as the reference engine. Exactly two
 * things are removed:
 *
 *   1. Domain-aware comparison. It compares the raw surface strings rather than
 *      the normalised canonicals, so "$1.2M" and "$1,200,000" are two values.
 *   2. Cross-document derivation. It has no arithmetic, no uniqueness
 *      constraint, no roster reconciliation — so a discrepancy that exists only
 *      *between* two fields, and is never written down in any single one of
 *      them, is invisible to it.
 *
 * Everything else is held constant. That is the point: the gap on the scorecard
 * is attributable to those two ideas and not to a parser I hobbled. Sharing the
 * extractor also means the baseline is not penalised for bad OCR handling or
 * missed fields — it sees every fact the reference engine sees.
 *
 * It then applies the rule that a general-purpose contradiction detector applies
 * by default: if a field has more than one distinct value across documents, say
 * so. That rule is not stupid. It is right often enough to look like it works,
 * and the hard-negative half of the packet set exists to find out how often.
 */

/** Case and internal whitespace are not what this bench is about. */
function surface(fact: Fact): string {
  return fact.raw.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * A flat number, deliberately.
 *
 * The reference engine's confidence is a sum of named signals, so a reviewer can
 * ask why a finding scored what it scored. The baseline has exactly one reason
 * for everything it reports — "these strings differ" — and inventing a spread
 * would be decoration. Reporting it flat is also the honest thing to do on the
 * reliability diagram: a single-valued predictor produces one bin, and whether
 * that bin lands where it claims to is a fair question to ask of it.
 */
const NAIVE_CONFLICT_CONFIDENCE = 0.8;
const NAIVE_CONSISTENT_CONFIDENCE = 0.9;

function naiveFinding(group: EvidenceGroup): Finding {
  const surfaces = [...new Set(group.facts.map(surface))];

  if (surfaces.length <= 1) {
    return {
      groupKey: group.key,
      label: group.label,
      entityKey: group.entityKey,
      classification: 'consistent',
      confidence: NAIVE_CONSISTENT_CONFIDENCE,
      rationale: 'Every document that mentions this field writes it the same way.',
      signals: ['naive.single-surface-form'],
      evidence: group.facts,
    };
  }

  const shown = surfaces.slice(0, 3).map((s) => `"${s}"`).join(' vs ');
  return {
    groupKey: group.key,
    label: group.label,
    entityKey: group.entityKey,
    classification: 'conflict',
    confidence: NAIVE_CONFLICT_CONFIDENCE,
    rationale:
      `The packet gives ${surfaces.length} different values for this field ` +
      `(${shown}${surfaces.length > 3 ? ', …' : ''}). Documents that disagree ` +
      `about a field are in conflict until someone reconciles them.`,
    signals: ['naive.multiple-surface-forms'],
    evidence: group.facts,
  };
}

/**
 * Runs the baseline over a packet. Same shape of result as `analyzePacket`, so
 * the scorer, the reviewer UI and the evidence viewer treat the two engines
 * identically and neither gets a presentational advantage.
 */
export function analyzeNaive(packet: Packet): PacketAnalysis {
  const extraction = extractPacket(packet);
  const groups = buildEvidenceGroups(extraction.facts);

  return {
    packetId: packet.id,
    engine: 'naive',
    facts: extraction.facts,
    groups,
    findings: groups.map(naiveFinding),
  };
}
