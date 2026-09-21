import { describe, expect, it } from 'vitest';

import { PACKETS } from '../src/data/packets';
import {
  analyzeWithLLM,
  buildAdjudicationPrompt,
  llmAnalysesToRun,
  parseAdjudicationResponse,
  type ModelCall,
} from '../src/lib/llm';
import type { Packet } from '../src/lib/types';

/**
 * The LLM adjudicator is tested without a network: prompt construction and
 * reply parsing are pure, and the engine itself runs against an injected
 * model double. A live run is exercised by `npm run grade:llm`, never by the
 * suite — the scorecard stays deterministic.
 */

const packet: Packet = PACKETS.find((p) => p.id === 'PKT-009')!;

const stub: ModelCall = async () =>
  JSON.stringify({ classification: 'supersession', confidence: 0.81, reason: 'the email says it adds the unit' });

describe('buildAdjudicationPrompt', () => {
  it('serializes what the rules would see and nothing else', () => {
    const prompt = buildAdjudicationPrompt(
      packet.title,
      {
        key: 'policy::stated_vehicle_count',
        entityKey: 'policy',
        field: 'stated_vehicle_count',
        label: 'Policy — stated fleet size',
        facts: [
          {
            id: 'f1',
            entityKey: 'policy',
            field: 'stated_vehicle_count',
            raw: '12 power units',
            value: { kind: 'count', canonical: '12', numeric: 12 },
            span: { documentId: 'd1', start: 0, end: 14, quote: '12 power units' },
            confidence: 0.86,
            extractor: 'rule',
            documentId: 'd1',
            documentKind: 'broker_email',
            receivedAt: '2026-03-02T09:00:00Z',
            changeIntent: 'add',
          },
        ],
        derived: false,
      },
      new Map([['d1', 'Broker email']]),
    );
    expect(prompt).toMatch(/12 power units/);
    expect(prompt).toMatch(/reads as: 12/);
    expect(prompt).toMatch(/deliberate change \(add\)/);
    expect(prompt).toMatch(/supersession/);
    expect(prompt).toMatch(/Recency alone is never enough/);
    expect(prompt).not.toMatch(/ground truth/i);
  });
});

describe('parseAdjudicationResponse', () => {
  it('parses a clean JSON reply', () => {
    expect(
      parseAdjudicationResponse('{"classification": "conflict", "confidence": 0.9, "reason": "two VINs differ"}'),
    ).toEqual({ classification: 'conflict', confidence: 0.9, reason: 'two VINs differ' });
  });

  it('extracts JSON from surrounding prose', () => {
    expect(
      parseAdjudicationResponse(
        'My ruling:\n{"classification": "unresolved", "confidence": 0.4, "reason": "cannot tell"}\nDone.',
      ).classification,
    ).toBe('unresolved');
  });

  it('rejects unknown labels, bad confidence, and non-JSON', () => {
    expect(() =>
      parseAdjudicationResponse('{"classification": "maybe", "confidence": 0.5, "reason": "x"}'),
    ).toThrow(/unknown label/);
    expect(() =>
      parseAdjudicationResponse('{"classification": "conflict", "confidence": 2, "reason": "x"}'),
    ).toThrow(/0\.\.1/);
    expect(() => parseAdjudicationResponse('conflict, obviously')).toThrow(/no JSON/);
    expect(() =>
      parseAdjudicationResponse('{"classification": "conflict", "confidence": 0.5, "reason": ""}'),
    ).toThrow(/reason/);
  });
});

describe('analyzeWithLLM', () => {
  it('adjudicates multi-fact groups and spares single assertions', () => {
    let calls = 0;
    const counting: ModelCall = async (prompt) => {
      calls += 1;
      return stub(prompt);
    };
    return analyzeWithLLM(packet, counting, 2).then((analysis) => {
      const multi = analysis.groups.filter((g) => g.facts.length > 1).length;
      expect(calls).toBe(multi);
      expect(analysis.engine).toBe('external');
      const single = analysis.findings.find((f) => {
        const group = analysis.groups.find((g) => g.key === f.groupKey)!;
        return group.facts.length <= 1;
      })!;
      expect(single.classification).toBe('consistent');
      expect(single.signals).toEqual(['llm.single-assertion']);
      const judged = analysis.findings.find((f) => f.signals.includes('llm.adjudicated'))!;
      expect(judged.classification).toBe('supersession');
      expect(judged.confidence).toBe(0.81);
    });
  });

  it('fails the run on model garbage rather than degrading to rules', async () => {
    await expect(analyzeWithLLM(packet, async () => 'not json at all', 2)).rejects.toThrow(/no JSON/);
  });

  it('packs into the external-run shape minus consistent groups', async () => {
    const analysis = await analyzeWithLLM(packet, stub, 2);
    const run = llmAnalysesToRun('stub model', [analysis]);
    expect(run.engineLabel).toBe('stub model');
    expect(run.packets).toHaveLength(1);
    expect(
      run.packets[0].findings.every((f) => f.classification !== 'consistent'),
    ).toBe(true);
  });
});
