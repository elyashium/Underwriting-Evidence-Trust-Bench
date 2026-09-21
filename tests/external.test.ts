import { describe, expect, it } from 'vitest';

import { PACKETS } from '../src/data/packets';
import {
  analysesFromExternal,
  gradeExternal,
  parseExternalRun,
  type ExternalRun,
} from '../src/lib/external';

/**
 * The adapter is the wedge made concrete: any outside system reports what it
 * believes per evidence group, and the same two-way contract grades it. These
 * tests pin the validation (garbage in must throw, never silently pass) and
 * the grading semantics (omission is dropped, invention is noise).
 */

const packets = PACKETS.filter((p) => p.id === 'PKT-003' || p.id === 'PKT-009');

const run = (claims: Array<{ packetId: string; groupKey: string; classification: 'conflict' | 'consistent' | 'supersession' }>): ExternalRun => ({
  engineLabel: 'test double',
  packets: claims.length === 0 ? [] : [
    {
      packetId: claims[0].packetId,
      findings: claims
        .filter((c) => c.packetId === claims[0].packetId)
        .map((c) => ({ groupKey: c.groupKey, classification: c.classification, confidence: 0.8 })),
    },
    ...claims
      .filter((c) => c.packetId !== claims[0].packetId)
      .map((c) => ({
        packetId: c.packetId,
        findings: [{ groupKey: c.groupKey, classification: c.classification, confidence: 0.8 }],
      })),
  ],
});

describe('parseExternalRun', () => {
  it('accepts a well-formed run', () => {
    const parsed = parseExternalRun({
      engineLabel: 'vendor X export',
      packets: [
        {
          packetId: 'PKT-003',
          findings: [
            { groupKey: 'policy::vehicle_count_reconciliation', classification: 'conflict', confidence: 0.9 },
          ],
        },
      ],
    });
    expect(parsed.engineLabel).toBe('vendor X export');
    expect(parsed.packets).toHaveLength(1);
  });

  it('rejects an unknown classification rather than coercing it', () => {
    expect(() =>
      parseExternalRun({
        engineLabel: 'x',
        packets: [
          { packetId: 'PKT-003', findings: [{ groupKey: 'g', classification: 'maybe', confidence: 0.5 }] },
        ],
      }),
    ).toThrow(/classification/);
  });

  it('rejects out-of-range confidence', () => {
    expect(() =>
      parseExternalRun({
        engineLabel: 'x',
        packets: [
          { packetId: 'PKT-003', findings: [{ groupKey: 'g', classification: 'conflict', confidence: 1.4 }] },
        ],
      }),
    ).toThrow(/confidence/);
  });

  it('rejects a group claimed twice', () => {
    expect(() =>
      parseExternalRun({
        engineLabel: 'x',
        packets: [
          {
            packetId: 'PKT-003',
            findings: [
              { groupKey: 'g', classification: 'conflict', confidence: 0.5 },
              { groupKey: 'g', classification: 'conflict', confidence: 0.6 },
            ],
          },
        ],
      }),
    ).toThrow(/twice/);
  });

  it('rejects a missing engine label', () => {
    expect(() => parseExternalRun({ packets: [] })).toThrow(/engineLabel/);
  });
});

describe('analysesFromExternal', () => {
  it('throws on a packet outside the corpus', () => {
    expect(() =>
      analysesFromExternal(packets, {
        engineLabel: 'x',
        packets: [{ packetId: 'PKT-404', findings: [] }],
      }),
    ).toThrow(/not in the corpus/);
  });

  it('borrows evidence for known groups and empties unknown ones', () => {
    const [analysis] = analysesFromExternal(packets, {
      engineLabel: 'x',
      packets: [
        {
          packetId: 'PKT-003',
          findings: [
            { groupKey: 'policy::vehicle_count_reconciliation', classification: 'conflict', confidence: 0.7 },
            { groupKey: 'policy::invented_group', classification: 'conflict', confidence: 0.7 },
          ],
        },
      ],
    });
    const known = analysis.findings.find((f) => f.groupKey === 'policy::vehicle_count_reconciliation')!;
    const invented = analysis.findings.find((f) => f.groupKey === 'policy::invented_group')!;
    expect(known.evidence.length).toBeGreaterThan(0);
    expect(invented.evidence).toEqual([]);
    expect(analysis.engine).toBe('external');
  });
});

describe('gradeExternal', () => {
  it('credits a caught conflict and punishes a false one', () => {
    const { scorecard } = gradeExternal(
      packets,
      run([
        { packetId: 'PKT-003', groupKey: 'policy::vehicle_count_reconciliation', classification: 'conflict' },
        { packetId: 'PKT-009', groupKey: 'policy::stated_vehicle_count', classification: 'conflict' },
      ]),
    );
    // PKT-003's real conflict caught; PKT-009's supersession misflagged.
    expect(scorecard.conflictRecall.n).toBe(1);
    expect(scorecard.hardNegativePacketFpr.n).toBe(1);
  });

  it('treats silence as dropped, not as quiet', () => {
    const { scorecard } = gradeExternal(packets, { engineLabel: 'silent', packets: [] });
    expect(scorecard.dropRate.n).toBeGreaterThan(0);
  });

  it('grades a perfect run as perfect', () => {
    const { scorecard } = gradeExternal(
      packets,
      run([
        { packetId: 'PKT-003', groupKey: 'policy::vehicle_count_reconciliation', classification: 'conflict' },
        { packetId: 'PKT-009', groupKey: 'policy::stated_vehicle_count', classification: 'supersession' },
      ]),
    );
    expect(scorecard.labelAccuracy.n).toBe(scorecard.labelAccuracy.of);
    expect(scorecard.hardNegativePacketFpr.n).toBe(0);
  });
});
