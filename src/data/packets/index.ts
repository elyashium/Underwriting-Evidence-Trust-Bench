import type { Packet, TaxonomyCaseId } from '../../lib/types';

import { PKT_001 } from './PKT-001';
import { PKT_002 } from './PKT-002';
import { PKT_003 } from './PKT-003';
import { PKT_004 } from './PKT-004';
import { PKT_005 } from './PKT-005';
import { PKT_006 } from './PKT-006';
import { PKT_007 } from './PKT-007';
import { PKT_008 } from './PKT-008';
import { PKT_009 } from './PKT-009';
import { PKT_010 } from './PKT-010';
import { PKT_011 } from './PKT-011';
import { PKT_012 } from './PKT-012';
import { PKT_013 } from './PKT-013';
import { PKT_014 } from './PKT-014';
import { PKT_015 } from './PKT-015';
import { PKT_016 } from './PKT-016';

export const PACKETS: Packet[] = [
  PKT_001,
  PKT_002,
  PKT_003,
  PKT_004,
  PKT_005,
  PKT_006,
  PKT_007,
  PKT_008,
  PKT_009,
  PKT_010,
  PKT_011,
  PKT_012,
  PKT_013,
  PKT_014,
  PKT_015,
  PKT_016,
];

export function getPacket(id: string): Packet | undefined {
  return PACKETS.find((p) => p.id === id);
}

export interface TaxonomyCase {
  id: TaxonomyCaseId;
  bucket: 'true_conflict' | 'hard_negative';
  name: string;
  /** What the case is testing for, in one sentence. */
  tests: string;
}

/**
 * The taxonomy the packet set was authored against. Every packet declares one
 * `taxonomyCase`, and the scorecard reports per-case so a failure points at a
 * specific behaviour rather than a single aggregate number.
 */
export const TAXONOMY: TaxonomyCase[] = [
  {
    id: 1,
    bucket: 'true_conflict',
    name: 'Duplicate VIN, different values',
    tests:
      'Whether entity identity is enforced: one VIN cannot describe two separately rated units.',
  },
  {
    id: 2,
    bucket: 'true_conflict',
    name: 'Stated fleet count vs schedule rows',
    tests:
      'Whether a count asserted in prose or on a form is reconciled against the actual schedule.',
  },
  {
    id: 3,
    bucket: 'true_conflict',
    name: 'Loss history omission',
    tests:
      'Whether a narrative summary is checked against the underlying loss run, by count and by severity.',
  },
  {
    id: 4,
    bucket: 'true_conflict',
    name: 'Conflicting effective dates',
    tests:
      'Whether two dates without any amendment language are escalated rather than silently resolved by recency.',
  },
  {
    id: 5,
    bucket: 'true_conflict',
    name: 'Aggregate does not sum',
    tests:
      'Whether the pipeline does cross-document arithmetic at all, or only string comparison.',
  },
  {
    id: 6,
    bucket: 'hard_negative',
    name: 'Legitimate endorsement supersession',
    tests:
      'Whether a deliberate, clearly announced change is recognised as an update instead of a contradiction.',
  },
  {
    id: 7,
    bucket: 'hard_negative',
    name: 'Near-duplicate but distinct entities',
    tests:
      'Whether normalisation preserves the tokens that actually distinguish two real entities.',
  },
  {
    id: 8,
    bucket: 'hard_negative',
    name: 'Equivalent representations',
    tests:
      'Whether ordinary insurance shorthand for money, counts and limits survives comparison.',
  },
  {
    id: 9,
    bucket: 'hard_negative',
    name: 'OCR noise resolving to one fact',
    tests:
      'Whether scan artefacts are resolved using domain constraints, without inventing an extra entity.',
  },
  {
    id: 10,
    bucket: 'hard_negative',
    name: 'Mismatch explained by context',
    tests:
      'Whether a discrepancy answered elsewhere in the packet is suppressed with the explanation attached.',
  },
];

export function getTaxonomyCase(id: TaxonomyCaseId): TaxonomyCase {
  const found = TAXONOMY.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown taxonomy case ${id}`);
  return found;
}
