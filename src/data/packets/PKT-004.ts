import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 2 — TRUE CONFLICT (second variant).
 *
 * Planted: the application states 9 power units, the schedule carries 11. Here
 * the broker email never states a count at all, so the only two numbers in the
 * packet disagree and there is no tie-breaker. Tests that the reconciliation
 * rule works from the application as well as from email prose.
 */
export const PKT_004: Packet = {
  id: 'PKT-004',
  title: 'Application says 9 power units, schedule carries 11',
  insured: 'Halverson Bulk Transport',
  taxonomyCase: 2,
  bucket: 'true_conflict',
  synopsis:
    'Application states 9 power units; the vehicle schedule lists 11 rows and the email states no count.',
  documents: [
    {
      id: 'PKT-004-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-01-19T15:12:00Z',
      content: `From: mchen@prairiestate-brokers.example
To: submissions@northstar-underwriting.example
Date: Mon, 19 Jan 2026 09:12:00 -0600
Subject: Halverson Bulk Transport - new submission

Hello,

Attaching Halverson Bulk Transport for a 03/01/2026 effective date. Pneumatic
dry bulk hauler, cement and fly ash, Fargo ND based. Short radius work, mostly
day cabs returning to the yard nightly.

Application, vehicle schedule and loss runs attached.

Marcus Chen
Prairie State Brokers`,
    },
    {
      id: 'PKT-004-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-01-19T15:13:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Halverson Bulk Transport
FEIN: 45-0337120 (fictional)
MAILING ADDRESS: 4712 Main Ave, Fargo ND 58103
YEARS IN BUSINESS: 31
RADIUS OF OPERATION: 200 miles
COMMODITY HAULED: Cement, fly ash, dry bulk

PROPOSED EFFECTIVE DATE: 03/01/2026
NUMBER OF POWER UNITS: 9
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-004-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-01-19T15:13:00Z',
      content: `HALVERSON BULK TRANSPORT - SCHEDULE OF VEHICLES
Prepared 01/16/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                | Stated Value
-----+------+----------------------+-------------------+---------------------------------+-------------
1    | 2019 | Mack Granite         | 1M2AX07C4KM110023 | 4712 Main Ave, Fargo ND 58103   | $118,500
2    | 2018 | Peterbilt 567        | 1XPCDP9X7JD221140 | 4712 Main Ave, Fargo ND 58103   | $104,000
3    | 2020 | Kenworth T880        | 1XKZDP9X2LJ330217 | 4712 Main Ave, Fargo ND 58103   | $143,000
4    | 2017 | Freightliner 114SD   | 1FVHGLDR9HHJP4410 | 4712 Main Ave, Fargo ND 58103   | $82,500
5    | 2021 | Mack Granite         | 1M2AX07C1MM441108 | 4712 Main Ave, Fargo ND 58103   | $156,000
6    | 2016 | Peterbilt 348        | 2NP3LJ0X9GM227714 | 4712 Main Ave, Fargo ND 58103   | $61,000
7    | 2019 | Western Star 4700    | 5KJJAVDR1KPKL6620 | 4712 Main Ave, Fargo ND 58103   | $127,500
8    | 2022 | Kenworth T680        | 1XKYDP9X3ND772201 | 4712 Main Ave, Fargo ND 58103   | $171,000
9    | 2015 | Mack Pinnacle        | 1M1AW07Y8FM990014 | 4712 Main Ave, Fargo ND 58103   | $48,500
10   | 2020 | Freightliner 122SD   | 3AKJGLD51LSLM8807 | 4712 Main Ave, Fargo ND 58103   | $149,500
11   | 2018 | Kenworth T800        | 1XKDDP9X5JJ118803 | 4712 Main Ave, Fargo ND 58103   | $113,000`,
    },
    {
      id: 'PKT-004-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-01-19T15:14:00Z',
      content: `LOSS RUN - HALVERSON BULK TRANSPORT
Carrier: Red River Mutual (fictional)   Policy period 03/01/2023 - 03/01/2026
Valued 12/31/2025

Claim No | Date of Loss | Cause                    | Status | Incurred
---------+--------------+--------------------------+--------+----------
RR-22104 | 05/23/2024   | Backing into dock        | Closed | $4,700
RR-25889 | 10/11/2025   | Blowout, tire debris     | Closed | $16,200`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::vehicle_count_reconciliation',
    why:
      'The application is the document the carrier will rate from, and it is ' +
      'short by two units against the schedule. Nothing supersedes or explains ' +
      'the difference.',
    expected: {
      'policy::vehicle_count_reconciliation': 'conflict',
      'policy::effective_date': 'consistent',
    },
  },
};
