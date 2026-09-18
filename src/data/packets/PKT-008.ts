import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 5 — TRUE CONFLICT (multi-hop arithmetic).
 *
 * Planted: the application states a total scheduled value of $1,450,000. The
 * nine schedule rows add to $1,281,500 — a $168,500 (13.2%) gap.
 *
 * No two strings in this packet disagree. Catching it requires summing one
 * document's rows and comparing the result to a single figure in another
 * document, which is the cheapest possible test of whether a pipeline does
 * cross-document arithmetic at all or only string comparison.
 */
export const PKT_008: Packet = {
  id: 'PKT-008',
  title: 'Stated total scheduled value exceeds the sum of the schedule rows',
  insured: 'Winnebago Valley Transit Co',
  taxonomyCase: 5,
  bucket: 'true_conflict',
  synopsis:
    'Application states $1,450,000 total insured value; the nine schedule rows sum to $1,281,500.',
  documents: [
    {
      id: 'PKT-008-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-06-15T13:05:00Z',
      content: `From: awescott@badgerstate-brokers.example
To: submissions@northstar-underwriting.example
Date: Mon, 15 Jun 2026 08:05:00 -0500
Subject: Winnebago Valley Transit - 9 units - 9/1 effective

Hello,

Winnebago Valley Transit Co for 09/01/2026. Nine power units, contract carriage
for two regional food manufacturers, Oshkosh WI yard, 450 mile radius.

Physical damage is important to this insured - the fleet is newer and they carry
full coverage on everything. Application, schedule and loss runs attached.

Amelia Wescott
Badger State Brokers`,
    },
    {
      id: 'PKT-008-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-06-15T13:06:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Winnebago Valley Transit Co
FEIN: 39-1120447 (fictional)
MAILING ADDRESS: 2255 S Washburn St, Oshkosh WI 54904
YEARS IN BUSINESS: 18
RADIUS OF OPERATION: 450 miles
COMMODITY HAULED: Packaged food, contract carriage

PROPOSED EFFECTIVE DATE: 09/01/2026
NUMBER OF POWER UNITS: 9
LIABILITY LIMIT (CSL): $1,000,000
TOTAL SCHEDULED VALUE: $1,450,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-008-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-06-15T13:06:00Z',
      content: `WINNEBAGO VALLEY TRANSIT CO - SCHEDULE OF VEHICLES
Prepared 06/12/2026

Unit | Year | Make/Model            | VIN               | Garaging Address                       | Stated Value
-----+------+-----------------------+-------------------+----------------------------------------+-------------
1    | 2021 | Freightliner CA126    | 3AKJHHDR7MSMY2201 | 2255 S Washburn St, Oshkosh WI 54904   | $145,000
2    | 2020 | Kenworth T680         | 1XKYDP9X4LJ662114 | 2255 S Washburn St, Oshkosh WI 54904   | $132,500
3    | 2019 | Volvo VNL760          | 4V4NC9EH7KN330227 | 2255 S Washburn St, Oshkosh WI 54904   | $118,000
4    | 2022 | Peterbilt 579         | 1XPBDP9X2ND881105 | 2255 S Washburn St, Oshkosh WI 54904   | $156,000
5    | 2018 | International LT      | 3HSDJAPR5JN440118 | 2255 S Washburn St, Oshkosh WI 54904   | $99,500
6    | 2022 | Kenworth T880         | 1XKZDP9X6ND220041 | 2255 S Washburn St, Oshkosh WI 54904   | $171,000
7    | 2021 | Mack Anthem           | 1M1AN4GY9LM551027 | 2255 S Washburn St, Oshkosh WI 54904   | $142,500
8    | 2022 | Volvo VNL860          | 4V4NC9EJ9ND770112 | 2255 S Washburn St, Oshkosh WI 54904   | $163,000
9    | 2021 | Freightliner CA126    | 3AKJHHDR3MSMY8804 | 2255 S Washburn St, Oshkosh WI 54904   | $154,000`,
    },
    {
      id: 'PKT-008-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-06-15T13:07:00Z',
      content: `LOSS RUN - WINNEBAGO VALLEY TRANSIT CO
Carrier: Fox Valley Mutual (fictional)   Policy period 09/01/2023 - 09/01/2026
Valued 05/31/2026

Claim No | Date of Loss | Cause                     | Status | Incurred
---------+--------------+---------------------------+--------+----------
FV-60114 | 02/08/2024   | Parking lot backing       | Closed | $3,900
FV-64207 | 11/21/2025   | Animal strike, front end  | Closed | $19,600`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::scheduled_value_reconciliation',
    why:
      'Physical damage premium is rated off total insured value. A $168,500 gap ' +
      'means either the schedule is missing a unit or the stated total is wrong; ' +
      'either way the rating basis is not established.',
    expected: {
      'policy::scheduled_value_reconciliation': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
