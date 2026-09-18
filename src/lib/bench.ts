import { analyzePacket } from './classify';
import { analyzeNaive } from './naive';
import { PACKETS } from '../data/packets';
import { compareEngines, scoreEngine, type EngineComparison, type Scorecard } from './score';
import type { EngineId, Packet, PacketAnalysis, ReviewDecision } from './types';

/**
 * One entry point that runs the whole bench.
 *
 * The analyses are pure functions of the packet corpus, which is a frozen
 * literal in `src/data`, so running the bench twice on the same machine — or on
 * a different machine, or next year — gives byte-identical findings. That is the
 * property that makes the scorecard worth publishing: a number that moves
 * because of a model version, a temperature or a network hiccup is not a
 * measurement of the method, and the deterministic engine is the one the
 * scorecard reports for exactly that reason.
 *
 * Reviewer decisions are the one input that legitimately changes between runs,
 * so they are passed in rather than read from disk here. That keeps this module
 * usable from a test, from a server component and from a script, and keeps the
 * filesystem in exactly one file (`store.ts`).
 */

export interface BenchResult {
  packets: Packet[];
  analyses: Record<EngineId, PacketAnalysis[]>;
  reference: Scorecard;
  baseline: Scorecard;
  comparison: EngineComparison;
}

/** Analyses are expensive-ish and pure. Compute once per process. */
let analysisCache: Record<EngineId, PacketAnalysis[]> | null = null;

export function analyses(): Record<EngineId, PacketAnalysis[]> {
  if (!analysisCache) {
    analysisCache = {
      reference: PACKETS.map(analyzePacket),
      naive: PACKETS.map(analyzeNaive),
    };
  }
  return analysisCache;
}

export function analysisFor(packetId: string, engine: EngineId = 'reference'): PacketAnalysis {
  const found = analyses()[engine].find((a) => a.packetId === packetId);
  if (!found) throw new Error(`No ${engine} analysis for packet ${packetId}`);
  return found;
}

export function runBench(decisions: ReviewDecision[] = []): BenchResult {
  const computed = analyses();

  const reference = scoreEngine({
    engine: 'reference',
    packets: PACKETS,
    analyses: computed.reference,
    decisions: decisions.filter((d) => d.engine === 'reference'),
  });

  const baseline = scoreEngine({
    engine: 'naive',
    packets: PACKETS,
    analyses: computed.naive,
    decisions: decisions.filter((d) => d.engine === 'naive'),
  });

  return {
    packets: PACKETS,
    analyses: computed,
    reference,
    baseline,
    comparison: compareEngines(reference, baseline),
  };
}
