import type { Packet } from '../../lib/types';

/**
 * FAIL-001 — a KNOWN FAILURE, kept out of the graded corpus on purpose.
 *
 * The setup: an application states 12 power units, a later endorsement
 * explicitly ADDs a thirteenth, and then a still-later broker email restates
 * the old "12 power units" figure with no change language — a stale
 * restatement, the kind of thing a busy broker sends without thinking.
 *
 * A human reads this as clean: the endorsement is legitimate, the email is
 * stale. The reference engine reports `conflict` on stated_vehicle_count,
 * because supersession requires the *latest* assertion to carry the change
 * language, and the latest assertion here carries none.
 *
 * That conservatism is deliberate — "the newest document wins" would silently
 * resolve Friday-afternoon typos in favour of the typo — but deliberate is
 * not the same as right in every instance, and this instance is wrong. It
 * lives here, displayed on the method page with the mechanism named, instead
 * of being quietly excluded from a corpus that only contains wins.
 *
 * If the classifier ever learns recency-with-corroboration and this packet
 * stops failing, delete this file and say so: a known-failure list that
 * never shrinks is a trophy shelf, not a measurement.
 */
export const FAIL_001: Packet = {
  id: 'FAIL-001',
  title: 'Stale restatement after a legitimate endorsement',
  insured: 'Stale Restatement Freight LLC',
  taxonomyCase: 6,
  bucket: 'hard_negative',
  synopsis:
    'Endorsement legitimately moves the fleet 12 -> 13; a later email restates 12 with no change language, and the engine flags the group as a conflict.',
  documents: [
    {
      id: 'FAIL-001-D1',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-03-02T09:00:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Stale Restatement Freight LLC
FEIN: 73-0199882 (fictional)
MAILING ADDRESS: 1000 Main St, Tulsa OK 74103
YEARS IN BUSINESS: 11
RADIUS OF OPERATION: 350 miles
COMMODITY HAULED: Steel, building products

PROPOSED EFFECTIVE DATE: 04/01/2026
NUMBER OF POWER UNITS: 12
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'FAIL-001-D2',
      kind: 'endorsement_email',
      title: 'Endorsement request - add one unit',
      receivedAt: '2026-03-10T09:00:00Z',
      content: `From: broker@agency.example
To: submissions@northstar-underwriting.example
Subject: RE: Stale Restatement Freight - endorsement request, add one unit

Following up on the submission from earlier this month.

The insured took delivery of a new tractor last week. Please ADD the following
unit to the schedule effective 04/15/2026:

  Unit 13 | 2023 Peterbilt 579 | VIN 1XPBDP9X7PD441203
  Garaged at 1000 Main St, Tulsa OK 74103
  Stated value $198,000

This brings the fleet to 13 power units. Everything else on the submission is
unchanged. Please confirm the additional premium when you quote.`,
    },
    {
      id: 'FAIL-001-D3',
      kind: 'broker_email',
      title: 'Broker follow-up email',
      receivedAt: '2026-03-12T09:00:00Z',
      content: `From: broker@agency.example
To: submissions@northstar-underwriting.example
Subject: Stale Restatement Freight LLC - checking in

Just confirming the file is moving. They run 12 power units out of Tulsa OK.
Let me know if you need anything else on this one.`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::stated_vehicle_count',
    why:
      'A human reads this packet as clean: the endorsement legitimately moved ' +
      'the fleet to 13, and the later email restates the stale figure 12 with ' +
      'no change language. The engine reports conflict, because supersession ' +
      'requires the latest assertion to carry the change language and it does ' +
      'not. Conservative by design, wrong in this instance.',
    expected: {
      // The human reading, which the engine does NOT reproduce:
      'policy::stated_vehicle_count': 'supersession',
    },
  },
};

export const FAILURES = [FAIL_001];
