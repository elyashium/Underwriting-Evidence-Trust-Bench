import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 8 — HARD NEGATIVE (equivalent representation).
 *
 * Planted: the email writes the total insured value as "$1.2M"; the application
 * writes "$1,200,000". The eight schedule rows sum to exactly $1,200,000.
 *
 * Byte-for-byte these are three different strings. Semantically they are one
 * number. A detector that compares raw text raises a conflict on the single
 * most common formatting convention in broker correspondence, which would make
 * it unusable on real submission traffic.
 */
export const PKT_013: Packet = {
  id: 'PKT-013',
  title: 'Total insured value written as "$1.2M" and as "$1,200,000"',
  insured: 'Rowan Gap Trucking LLC',
  taxonomyCase: 8,
  bucket: 'hard_negative',
  synopsis:
    '"$1.2M" in the email and "$1,200,000" in the application are the same figure, and the schedule sums to it exactly.',
  documents: [
    {
      id: 'PKT-013-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-08-10T15:33:00Z',
      content: `From: sbeckett@blueridge-agency.example
To: submissions@northstar-underwriting.example
Date: Mon, 10 Aug 2026 11:33:00 -0400
Subject: Rowan Gap Trucking - 8 units - 10/1 effective

Hi,

Rowan Gap Trucking LLC for a 10/01/2026 effective date. Eight power units
hauling lumber and pallets through the Virginia and Carolina corridor, 400 mile
radius.

Physical damage on all units, total insured value of $1.2M on the equipment
schedule. Application, schedule and loss runs attached.

Sam Beckett
Blue Ridge Agency`,
    },
    {
      id: 'PKT-013-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-08-10T15:34:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Rowan Gap Trucking LLC
FEIN: 54-0883117 (fictional)
MAILING ADDRESS: 1180 Depot St, Roanoke VA 24016
YEARS IN BUSINESS: 13
RADIUS OF OPERATION: 400 miles
COMMODITY HAULED: Lumber, pallets, building materials

PROPOSED EFFECTIVE DATE: 10/01/2026
NUMBER OF POWER UNITS: 8
LIABILITY LIMIT (CSL): $1,000,000
TOTAL SCHEDULED VALUE: $1,200,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-013-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-08-10T15:34:00Z',
      content: `ROWAN GAP TRUCKING LLC - SCHEDULE OF VEHICLES
Prepared 08/07/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                | Stated Value
-----+------+----------------------+-------------------+---------------------------------+-------------
1    | 2021 | Freightliner CA126   | 3AKJHHDR9MSMR1102 | 1180 Depot St, Roanoke VA 24016 | $152,000
2    | 2019 | Kenworth T680        | 1XKYDP9X5KJ220118 | 1180 Depot St, Roanoke VA 24016 | $138,500
3    | 2022 | Peterbilt 579        | 1XPBDP9X8ND330226 | 1180 Depot St, Roanoke VA 24016 | $164,000
4    | 2018 | Volvo VNL760         | 4V4NC9EH6JN440117 | 1180 Depot St, Roanoke VA 24016 | $121,500
5    | 2022 | Kenworth T880        | 1XKZDP9X1ND550225 | 1180 Depot St, Roanoke VA 24016 | $178,000
6    | 2020 | Mack Anthem          | 1M1AN4GY8LM660114 | 1180 Depot St, Roanoke VA 24016 | $145,000
7    | 2021 | International LT     | 3HSDJAPR3MN770223 | 1180 Depot St, Roanoke VA 24016 | $156,500
8    | 2020 | Freightliner CA126   | 3AKJHHDR4LSLS8806 | 1180 Depot St, Roanoke VA 24016 | $144,500`,
    },
    {
      id: 'PKT-013-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-08-10T15:35:00Z',
      content: `LOSS RUN - ROWAN GAP TRUCKING LLC
Carrier: Appalachian Mutual (fictional)   Policy period 10/01/2023 - 10/01/2026
Valued 06/30/2026

Claim No | Date of Loss | Cause                    | Status | Incurred
---------+--------------+--------------------------+--------+----------
AM-20114 | 03/22/2024   | Load strap failure       | Closed | $13,200
AM-24907 | 12/09/2025   | Rear-end, wet pavement   | Closed | $28,700`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::total_scheduled_value',
    why:
      '"$1.2M" and "$1,200,000" are the same number written two ways, and the ' +
      'schedule proves it by summing to exactly that. There is nothing for an ' +
      'underwriter to resolve; surfacing it as a discrepancy is pure noise.',
    expected: {
      'policy::total_scheduled_value': 'benign_variant',
      'policy::scheduled_value_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
