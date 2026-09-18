import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 7 — HARD NEGATIVE (second variant: directional prefix).
 *
 * Planted: "1220 N Industrial Pkwy" and "1220 S Industrial Pkwy" in Gary IN.
 * One character apart, and on a divided industrial parkway they are genuinely
 * two sites — here, a tank wash on the north side and the tractor yard on the
 * south.
 *
 * PKT-011 tests whether the suffix survives normalisation; this one tests the
 * directional prefix, which is the token most commonly dropped by address
 * cleaners because it looks like noise.
 */
export const PKT_012: Packet = {
  id: 'PKT-012',
  title: 'Two sites that differ only by a directional prefix',
  insured: 'Dunmore Tank Lines Inc',
  taxonomyCase: 7,
  bucket: 'hard_negative',
  synopsis:
    '"1220 N Industrial Pkwy" and "1220 S Industrial Pkwy" are separate sites; dropping the directional merges them.',
  documents: [
    {
      id: 'PKT-012-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-07-06T13:22:00Z',
      content: `From: rbhatt@calumet-risk.example
To: submissions@northstar-underwriting.example
Date: Mon, 6 Jul 2026 08:22:00 -0500
Subject: Dunmore Tank Lines - 6 units - 9/1 effective

Hi team,

Dunmore Tank Lines Inc for 09/01/2026. Six tank units hauling non-hazardous
food grade liquids, Gary IN based, 300 mile radius. No hazmat endorsement
required.

Two sites, both on Industrial Pkwy. Application, schedule and loss runs
attached.

Rohan Bhatt
Calumet Risk Advisors`,
    },
    {
      id: 'PKT-012-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-07-06T13:23:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Dunmore Tank Lines Inc
FEIN: 35-0771442 (fictional)
MAILING ADDRESS: 1220 S Industrial Pkwy, Gary IN 46406
YEARS IN BUSINESS: 19
RADIUS OF OPERATION: 300 miles
COMMODITY HAULED: Food grade liquids, non-hazardous

PROPOSED EFFECTIVE DATE: 09/01/2026
NUMBER OF POWER UNITS: 6
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 2`,
    },
    {
      id: 'PKT-012-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-07-06T13:23:00Z',
      content: `DUNMORE TANK LINES INC - SCHEDULE OF VEHICLES
Prepared 07/02/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                          | Stated Value
-----+------+----------------------+-------------------+-------------------------------------------+-------------
1    | 2020 | Kenworth T680        | 1XKYDP9X9LJ220117 | 1220 N Industrial Pkwy, Gary IN 46406     | $134,000
2    | 2018 | Peterbilt 579        | 1XPBDP9X1JD330225 | 1220 N Industrial Pkwy, Gary IN 46406     | $101,500
3    | 2021 | Freightliner CA126   | 3AKJHHDR6MSMZ4403 | 1220 N Industrial Pkwy, Gary IN 46406     | $152,000
4    | 2019 | Volvo VNL760         | 4V4NC9EH3KN440118 | 1220 S Industrial Pkwy, Gary IN 46406     | $119,000
5    | 2017 | Mack Anthem          | 1M1AN4GY5HM550226 | 1220 S Industrial Pkwy, Gary IN 46406     | $88,500
6    | 2022 | Kenworth T880        | 1XKZDP9X4ND660114 | 1220 S Industrial Pkwy, Gary IN 46406     | $176,000`,
    },
    {
      id: 'PKT-012-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-07-06T13:24:00Z',
      content: `LOSS RUN - DUNMORE TANK LINES INC
Carrier: Lake Shore Indemnity (fictional)   Policy period 09/01/2023 - 09/01/2026
Valued 05/31/2026

Claim No | Date of Loss | Cause                       | Status | Incurred
---------+--------------+-----------------------------+--------+----------
LS-90114 | 04/11/2024   | Hose coupling, minor spill  | Closed | $9,800
LS-93722 | 02/19/2026   | Low speed collision, gate   | Closed | $6,400`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::location_roster',
    why:
      'North and south sides of a divided parkway are different garaging ' +
      'locations with different exposures. The application says two locations ' +
      'and there are two. Stripping the directional as noise produces one ' +
      'location and a false mismatch against the application.',
    expected: {
      'policy::location_roster': 'benign_variant',
      'policy::location_count_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
