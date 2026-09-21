import { describe, expect, it } from 'vitest';

import { PACKETS } from '../src/data/packets';
import { FAIL_001 } from '../src/data/failures/FAIL-001';
import { analyzePacket } from '../src/lib/classify';

/**
 * The known-failure contract, pointing the other way from every other test in
 * this repo: this packet MUST fail. If a classifier change makes it pass, the
 * right response is to delete the fixture and say so on the method page — and
 * this test going red is how that gets noticed instead of silently absorbed
 * into a greener scorecard.
 */
describe('FAIL-001', () => {
  it('is excluded from the graded corpus', () => {
    expect(PACKETS.map((p) => p.id)).not.toContain(FAIL_001.id);
  });

  it('is still failed by the engine', () => {
    const analysis = analyzePacket(FAIL_001);
    const finding = analysis.findings.find(
      (f) => f.groupKey === FAIL_001.groundTruth.focusGroup,
    );
    expect(finding?.classification).toBe('conflict');
  });

  it('is still judged clean by the human reading', () => {
    expect(FAIL_001.groundTruth.expected[FAIL_001.groundTruth.focusGroup]).toBe(
      'supersession',
    );
  });
});
