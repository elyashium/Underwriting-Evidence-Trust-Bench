import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 1 — TRUE CONFLICT (second variant).
 *
 * Planted: VIN 3AKJHHDR9LSLX4412 is carried on Unit 2 (a 2020 Freightliner
 * Cascadia, $131,000) and Unit 11 (a 2018 Western Star 4900, $89,750). Unlike
 * PKT-001 the two rows describe visibly different trucks, so the error cannot
 * be waved away as a duplicated row — one of the two VINs is simply wrong.
 */
export const PKT_002: Packet = {
  id: 'PKT-002',
  title: 'One VIN shared by two visibly different trucks',
  insured: 'Talon Freight Systems Inc',
  taxonomyCase: 1,
  bucket: 'true_conflict',
  synopsis:
    'VIN 3AKJHHDR9LSLX4412 is on both a 2020 Cascadia and a 2018 Western Star.',
  documents: [
    {
      id: 'PKT-002-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-02-11T16:04:00Z',
      content: `From: rtorres@gulfline-risk.example
To: submissions@northstar-underwriting.example
Date: Wed, 11 Feb 2026 10:04:00 -0600
Subject: Talon Freight Systems - new business - 4/1 effective

Team,

Submitting Talon Freight Systems Inc for a 04/01/2026 effective date. Dry van
and reefer, 11 power units, Birmingham AL domiciled, running the southeast
lanes. Owner has been in business 9 years and is well maintained.

Application, schedule and three years of loss runs attached.

Rick Torres
Gulfline Risk Partners`,
    },
    {
      id: 'PKT-002-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-02-11T16:06:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Talon Freight Systems Inc
FEIN: 63-0447712 (fictional)
MAILING ADDRESS: 1455 Bessemer Ave, Birmingham AL 35211
YEARS IN BUSINESS: 9
RADIUS OF OPERATION: 500 miles
COMMODITY HAULED: Dry van general freight, refrigerated produce

PROPOSED EFFECTIVE DATE: 04/01/2026
NUMBER OF POWER UNITS: 11
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-002-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-02-11T16:06:00Z',
      content: `TALON FREIGHT SYSTEMS INC - SCHEDULE OF VEHICLES
Prepared 02/10/2026

Unit | Year | Make/Model              | VIN               | Garaging Address                       | Stated Value
-----+------+-------------------------+-------------------+----------------------------------------+-------------
1    | 2020 | Freightliner Cascadia   | 3AKJHHDR9LSLX4401 | 1455 Bessemer Ave, Birmingham AL 35211 | $128,000
2    | 2020 | Freightliner Cascadia   | 3AKJHHDR9LSLX4412 | 1455 Bessemer Ave, Birmingham AL 35211 | $131,000
3    | 2019 | Kenworth T880           | 1XKZDP9X4KJ441207 | 1455 Bessemer Ave, Birmingham AL 35211 | $146,500
4    | 2021 | Volvo VNL860            | 4V4NC9EJ2MN228841 | 1455 Bessemer Ave, Birmingham AL 35211 | $158,000
5    | 2018 | Mack Pinnacle           | 1M1AW07Y5JM088112 | 1455 Bessemer Ave, Birmingham AL 35211 | $94,000
6    | 2022 | Peterbilt 579           | 1XPBDP9X6ND712044 | 1455 Bessemer Ave, Birmingham AL 35211 | $172,500
7    | 2017 | International ProStar   | 3HSDJSJR8HN662210 | 1455 Bessemer Ave, Birmingham AL 35211 | $71,000
8    | 2019 | Freightliner CA125      | 3AKJHHDR1KSKJ9902 | 1455 Bessemer Ave, Birmingham AL 35211 | $118,000
9    | 2021 | Kenworth T680           | 1XKYDP9X7MJ551104 | 1455 Bessemer Ave, Birmingham AL 35211 | $152,000
10   | 2016 | Volvo VNL670            | 4V4NC9EH8GN884420 | 1455 Bessemer Ave, Birmingham AL 35211 | $63,500
11   | 2018 | Western Star 4900       | 3AKJHHDR9LSLX4412 | 1455 Bessemer Ave, Birmingham AL 35211 | $89,750`,
    },
    {
      id: 'PKT-002-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-02-11T16:07:00Z',
      content: `LOSS RUN - TALON FREIGHT SYSTEMS INC
Carrier: Delta Star Indemnity (fictional)   Policy period 04/01/2023 - 04/01/2026
Valued 01/31/2026

Claim No | Date of Loss | Cause               | Status | Incurred
---------+--------------+---------------------+--------+----------
DS-40218 | 06/30/2024   | Sideswipe, merging  | Closed | $27,900
DS-44901 | 02/17/2025   | Cargo water damage  | Closed | $12,450
DS-48113 | 11/05/2025   | Deer strike         | Closed | $9,100`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::vin_uniqueness',
    why:
      'A VIN is a unique identifier. Two different model-year/make combinations ' +
      'cannot share one. Neither row can be rated until the broker confirms the ' +
      'correct VIN for Unit 11.',
    expected: {
      'policy::vin_uniqueness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
