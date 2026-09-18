import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 7 — HARD NEGATIVE (near-duplicate but genuinely distinct).
 *
 * Planted: units 1-4 garage at "4500 Oak St, Rockford IL 61103" and units 5-8
 * at "4500 Oak Ave, Rockford IL 61103". Same number, same street name, same
 * ZIP, different thoroughfare type. They are two real, different yards.
 *
 * The trap is the normaliser. Address canonicalisation that strips or fuzzy
 * matches the street suffix collapses these into one location, which then makes
 * the application's "GARAGING LOCATIONS: 2" look wrong and produces a
 * confident, completely wrong flag. The suffix is load-bearing and must survive
 * normalisation.
 */
export const PKT_011: Packet = {
  id: 'PKT-011',
  title: 'Two garaging yards that differ only by street suffix',
  insured: 'Kestrel Regional Freight',
  taxonomyCase: 7,
  bucket: 'hard_negative',
  synopsis:
    '"4500 Oak St" and "4500 Oak Ave" are two different yards; merging them would contradict the stated location count.',
  documents: [
    {
      id: 'PKT-011-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-03-09T14:48:00Z',
      content: `From: dvasquez@rockriver-insurance.example
To: submissions@northstar-underwriting.example
Date: Mon, 9 Mar 2026 09:48:00 -0500
Subject: Kestrel Regional Freight - 8 units - 5/1 effective

Hello,

Kestrel Regional Freight for a 05/01/2026 effective date. Eight power units,
LTL and partial loads through northern Illinois and southern Wisconsin.

They operate out of two garaging locations in Rockford. Application, schedule
and loss runs attached.

Diego Vasquez
Rock River Insurance`,
    },
    {
      id: 'PKT-011-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-03-09T14:49:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Kestrel Regional Freight
FEIN: 36-0918224 (fictional)
MAILING ADDRESS: 4500 Oak St, Rockford IL 61103
YEARS IN BUSINESS: 15
RADIUS OF OPERATION: 300 miles
COMMODITY HAULED: LTL general freight

PROPOSED EFFECTIVE DATE: 05/01/2026
NUMBER OF POWER UNITS: 8
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 2`,
    },
    {
      id: 'PKT-011-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-03-09T14:49:00Z',
      content: `KESTREL REGIONAL FREIGHT - SCHEDULE OF VEHICLES
Prepared 03/06/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                   | Stated Value
-----+------+----------------------+-------------------+------------------------------------+-------------
1    | 2019 | Freightliner CA125   | 1FUJGLDR6KLBZ4401 | 4500 Oak St, Rockford IL 61103     | $108,000
2    | 2020 | Kenworth T680        | 1XKYDP9X2LJ110228 | 4500 Oak St, Rockford IL 61103     | $126,500
3    | 2017 | Volvo VNL760         | 4V4NC9EH9HN220334 | 4500 Oak St, Rockford IL 61103     | $81,000
4    | 2021 | Peterbilt 579        | 1XPBDP9X5MD330117 | 4500 Oak St, Rockford IL 61103     | $149,000
5    | 2018 | International LT     | 3HSDJAPR6JN440225 | 4500 Oak Ave, Rockford IL 61103    | $94,500
6    | 2022 | Freightliner CA126   | 3AKJHHDR1NSNQ5502 | 4500 Oak Ave, Rockford IL 61103    | $171,500
7    | 2016 | Mack Pinnacle       | 1M1AW07Y4GM660118 | 4500 Oak Ave, Rockford IL 61103    | $63,000
8    | 2020 | Kenworth T880        | 1XKZDP9X0LJ770226 | 4500 Oak Ave, Rockford IL 61103    | $143,500`,
    },
    {
      id: 'PKT-011-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-03-09T14:50:00Z',
      content: `LOSS RUN - KESTREL REGIONAL FREIGHT
Carrier: Winnebago County Mutual (fictional)
Policy period 05/01/2023 - 05/01/2026   Valued 02/28/2026

Claim No | Date of Loss | Cause                   | Status | Incurred
---------+--------------+-------------------------+--------+----------
WC-42117 | 10/04/2024   | Dock plate damage       | Closed | $5,600
WC-46803 | 07/27/2025   | Side mirror / pedestrian pole | Closed | $2,900`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::location_roster',
    why:
      '"St" and "Ave" are different thoroughfares. The addresses are textually ' +
      'near-identical but refer to two real yards, which is exactly what the ' +
      'application says. The right behaviour is to notice the similarity, keep ' +
      'the locations distinct, and say so — not to merge them and then flag the ' +
      'location count as wrong.',
    expected: {
      'policy::location_roster': 'benign_variant',
      'policy::location_count_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
