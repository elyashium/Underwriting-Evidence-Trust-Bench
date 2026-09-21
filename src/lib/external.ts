import { analyzePacket } from './classify';
import { compareEngines, scoreEngine, type EngineComparison, type Scorecard } from './score';
import type {
  Classification,
  Finding,
  Packet,
  PacketAnalysis,
  ReviewDecision,
} from './types';

const CLASSIFICATIONS: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
  'consistent',
];

/**
 * One claim about one evidence group, made by a system built outside this
 * repo — a vendor pipeline, an LLM run, a script. The group is named by the
 * same key the reference engine uses (`policy::stated_vehicle_count`), so a
 * claim can be checked against the hand-authored label for exactly that group.
 */
export interface ExternalFinding {
  groupKey: string;
  classification: Classification;
  /** The external system's own confidence that its label is correct, 0..1. */
  confidence: number;
  rationale?: string;
}

export interface ExternalPacketFindings {
  packetId: string;
  findings: ExternalFinding[];
}

/**
 * A complete external run: who produced it, and what it claimed per packet.
 * Packets with no entry are read as "reported nothing", which the two-way
 * contract grades as silence — dropped findings where labels exist, quiet
 * where they do not. There is no way to dodge the contract by omitting rows.
 */
export interface ExternalRun {
  engineLabel: string;
  packets: ExternalPacketFindings[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strict JSON validation. A grading harness that silently coerces a typo'd
 * label into a pass would be worse than no harness, so anything off-shape
 * throws with the path attached.
 */
export function parseExternalRun(json: unknown): ExternalRun {
  if (!isRecord(json)) throw new Error('External run must be a JSON object.');
  if (typeof json.engineLabel !== 'string' || json.engineLabel.trim() === '') {
    throw new Error('External run needs a non-empty "engineLabel".');
  }
  if (!Array.isArray(json.packets)) {
    throw new Error('External run needs a "packets" array.');
  }
  const packets: ExternalPacketFindings[] = json.packets.map((entry, i) => {
    const at = `packets[${i}]`;
    if (!isRecord(entry)) throw new Error(`${at} must be an object.`);
    if (typeof entry.packetId !== 'string' || entry.packetId === '') {
      throw new Error(`${at} needs a "packetId" string.`);
    }
    if (!Array.isArray(entry.findings)) {
      throw new Error(`${at} needs a "findings" array.`);
    }
    const findings: ExternalFinding[] = entry.findings.map((claim, j) => {
      const path = `${at}.findings[${j}]`;
      if (!isRecord(claim)) throw new Error(`${path} must be an object.`);
      if (typeof claim.groupKey !== 'string' || claim.groupKey === '') {
        throw new Error(`${path} needs a "groupKey" string.`);
      }
      if (!CLASSIFICATIONS.includes(claim.classification as Classification)) {
        throw new Error(
          `${path} has classification ${JSON.stringify(claim.classification)} — ` +
            `expected one of ${CLASSIFICATIONS.join(', ')}.`,
        );
      }
      if (
        typeof claim.confidence !== 'number' ||
        Number.isNaN(claim.confidence) ||
        claim.confidence < 0 ||
        claim.confidence > 1
      ) {
        throw new Error(`${path} needs a "confidence" number in 0..1.`);
      }
      if (claim.rationale !== undefined && typeof claim.rationale !== 'string') {
        throw new Error(`${path} "rationale" must be a string when present.`);
      }
      return {
        groupKey: claim.groupKey,
        classification: claim.classification as Classification,
        confidence: claim.confidence,
        rationale: claim.rationale,
      };
    });
    const keys = findings.map((f) => f.groupKey);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`${at} claims the same group twice.`);
    }
    return { packetId: entry.packetId, findings };
  });
  return { engineLabel: json.engineLabel.trim(), packets };
}

/**
 * Turn external claims into analyses the scorer can grade.
 *
 * Evidence (spans, quotes, canonicals) is borrowed from this repo's own
 * reference analysis of the same packet — the external system is graded on
 * its *judgement*, not re-penalised for a different parser. A claim about a
 * group the reference never produced keeps empty evidence and is graded on
 * its label alone: an undeclared conflict is still a false positive, and an
 * invented group key cannot hide from the noise outcome.
 */
export function analysesFromExternal(
  packets: Packet[],
  run: ExternalRun,
): PacketAnalysis[] {
  const reference = new Map(packets.map((p) => [p.id, analyzePacket(p)]));
  const claimedByPacket = new Map(run.packets.map((p) => [p.packetId, p.findings]));

  for (const packetId of claimedByPacket.keys()) {
    if (!reference.has(packetId)) {
      throw new Error(`External run claims packet ${packetId}, which is not in the corpus.`);
    }
  }

  return packets.map((packet) => {
    const ref = reference.get(packet.id)!;
    const groups = new Map(ref.groups.map((g) => [g.key, g]));
    const claims = claimedByPacket.get(packet.id) ?? [];

    const findings: Finding[] = claims.map((claim) => {
      const group = groups.get(claim.groupKey);
      return {
        groupKey: claim.groupKey,
        label: group?.label ?? claim.groupKey,
        entityKey: group?.entityKey ?? 'policy',
        classification: claim.classification,
        confidence: claim.confidence,
        rationale:
          claim.rationale ??
          `Reported as ${claim.classification} by ${run.engineLabel}. ` +
            `No rationale was supplied with the claim.`,
        signals: ['external.reported-finding'],
        evidence: group ? [...group.facts] : [],
      };
    });

    return {
      packetId: packet.id,
      engine: 'external' as const,
      facts: ref.facts,
      groups: ref.groups,
      findings,
    };
  });
}

export interface ExternalGrade {
  run: ExternalRun;
  scorecard: Scorecard;
  /** Reference vs external on the same packets — the ablation-style readout. */
  comparison: EngineComparison;
}

/**
 * Grade an external run against hand-authored labels, with the reference
 * engine alongside so the delta reads as capabilities, not as vibes.
 */
export function gradeExternal(
  packets: Packet[],
  run: ExternalRun,
  decisions: ReviewDecision[] = [],
): ExternalGrade {
  const external = scoreEngine({
    engine: 'external',
    packets,
    analyses: analysesFromExternal(packets, run),
    decisions,
  });
  // The comparison baseline is the real reference pipeline, not an adapter
  // artifact: same packets, same labels, same two-way contract.
  const reference = scoreEngine({
    engine: 'reference',
    packets,
    analyses: packets.map((p) => analyzePacket(p)),
    decisions,
  });
  return { run, scorecard: external, comparison: compareEngines(reference, external) };
}
