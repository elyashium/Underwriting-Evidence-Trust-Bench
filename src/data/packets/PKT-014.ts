import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 8 — HARD NEGATIVE (spelled numbers and limit shorthand).
 *
 * Planted: two independent format equivalences in one packet.
 *   - fleet size: "twelve (12) power units" in the email vs "12" on the form;
 *   - liability limit: "$1M combined single limit" vs "1,000,000 CSL".
 *
 * Insurance prose is full of both conventions. A pipeline that flags either one
 * generates a discrepancy on nearly every real submission, which is how a
 * contradiction detector ends up switched off.
 */
export const PKT_014: Packet = {
  id: 'PKT-014',
  title: 'Spelled-out unit count and shorthand liability limit',
  insured: 'Estrella Produce Transport',
  taxonomyCase: 8,
  bucket: 'hard_negative',
  synopsis:
    '"twelve (12)" vs "12" and "$1M combined single limit" vs "1,000,000 CSL" are format differences, not disagreements.',
  documents: [
    {
      id: 'PKT-014-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-01-26T16:15:00Z',
      content: `From: mfuentes@valleyoak-brokers.example
To: submissions@northstar-underwriting.example
Date: Mon, 26 Jan 2026 08:15:00 -0800
Subject: Estrella Produce Transport - 3/1 effective

Good morning,

Please review Estrella Produce Transport for a 03/01/2026 effective date. The
insured operates twelve (12) power units hauling fresh produce out of the
Salinas Valley to distribution centers in Nevada and Arizona.

They are looking for $1M combined single limit on the auto liability, physical
damage on all scheduled units.

Application, schedule and three years of loss runs attached.

Marisol Fuentes
Valley Oak Brokers`,
    },
    {
      id: 'PKT-014-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-01-26T16:16:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Estrella Produce Transport
FEIN: 77-0334821 (fictional)
MAILING ADDRESS: 1455 Abbott St, Salinas CA 93901
YEARS IN BUSINESS: 21
RADIUS OF OPERATION: 800 miles
COMMODITY HAULED: Fresh produce, refrigerated

PROPOSED EFFECTIVE DATE: 03/01/2026
NUMBER OF POWER UNITS: 12
LIABILITY LIMIT (CSL): 1,000,000 CSL
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-014-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-01-26T16:16:00Z',
      content: `ESTRELLA PRODUCE TRANSPORT - SCHEDULE OF VEHICLES
Prepared 01/23/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                | Stated Value
-----+------+----------------------+-------------------+---------------------------------+-------------
1    | 2020 | Freightliner CA126   | 3AKJHHDR2LSLU1101 | 1455 Abbott St, Salinas CA 93901 | $141,000
2    | 2019 | Kenworth T680        | 1XKYDP9X3KJ330227 | 1455 Abbott St, Salinas CA 93901 | $127,500
3    | 2021 | Volvo VNL760         | 4V4NC9EH5MN440118 | 1455 Abbott St, Salinas CA 93901 | $154,000
4    | 2018 | Peterbilt 579        | 1XPBDP9X7JD550226 | 1455 Abbott St, Salinas CA 93901 | $103,000
5    | 2022 | Freightliner CA126   | 3AKJHHDR8NSNV2203 | 1455 Abbott St, Salinas CA 93901 | $175,500
6    | 2017 | International LT     | 3HSDJAPR0HN660114 | 1455 Abbott St, Salinas CA 93901 | $79,000
7    | 2021 | Kenworth T880        | 1XKZDP9X5MJ770225 | 1455 Abbott St, Salinas CA 93901 | $162,000
8    | 2019 | Mack Anthem          | 1M1AN4GY2KM880117 | 1455 Abbott St, Salinas CA 93901 | $118,500
9    | 2020 | Volvo VNL860         | 4V4NC9EJ1LN990223 | 1455 Abbott St, Salinas CA 93901 | $149,000
10   | 2016 | Freightliner CA125   | 1FUJGLDR3GLGY1102 | 1455 Abbott St, Salinas CA 93901 | $66,500
11   | 2022 | Peterbilt 579        | 1XPBDP9X0ND110224 | 1455 Abbott St, Salinas CA 93901 | $181,000
12   | 2018 | Kenworth T680        | 1XKYDP9X6JJ220118 | 1455 Abbott St, Salinas CA 93901 | $109,500`,
    },
    {
      id: 'PKT-014-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-01-26T16:17:00Z',
      content: `LOSS RUN - ESTRELLA PRODUCE TRANSPORT
Carrier: Pacific Grange Insurance (fictional)
Policy period 03/01/2023 - 03/01/2026   Valued 12/31/2025

Claim No | Date of Loss | Cause                      | Status | Incurred
---------+--------------+----------------------------+--------+----------
PG-33107 | 05/14/2024   | Produce spoilage, delay    | Closed | $22,400
PG-37820 | 09/30/2025   | Sideswipe, lane change     | Closed | $17,100`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::stated_vehicle_count',
    why:
      '"twelve (12)" and "12" are the same count; "$1M combined single limit" ' +
      'and "1,000,000 CSL" are the same limit. Both are ordinary insurance ' +
      'shorthand. Nothing here needs a human.',
    expected: {
      'policy::stated_vehicle_count': 'benign_variant',
      'policy::liability_limit': 'benign_variant',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
