import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 2 — TRUE CONFLICT.
 *
 * Planted: the broker email and the application both say 12 power units; the
 * vehicle schedule carries 13 rows. Nothing anywhere explains the 13th unit —
 * no endorsement adding it, no note removing anything. Premium is driven off
 * unit count, so this is material.
 */
export const PKT_003: Packet = {
  id: 'PKT-003',
  title: 'Stated fleet size of 12 against a 13-row vehicle schedule',
  insured: 'Blue Marten Logistics LLC',
  taxonomyCase: 2,
  bucket: 'true_conflict',
  synopsis:
    'Email and application both say 12 trucks; the schedule lists 13, with no endorsement explaining the extra unit.',
  documents: [
    {
      id: 'PKT-003-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-04-06T13:40:00Z',
      content: `From: jpelletier@northshore-ins.example
To: submissions@northstar-underwriting.example
Date: Mon, 6 Apr 2026 08:40:00 -0500
Subject: Blue Marten Logistics - 12 trucks - 7/1 renewal out of market

Good morning,

Please take a look at Blue Marten Logistics LLC for 07/01/2026. They operate 12
trucks out of Duluth MN hauling forest products and general freight in the upper
midwest. No radius over 400 miles.

Loss runs attached, three years. Schedule and application attached as well.

Thanks,
Joelle Pelletier
Northshore Insurance Services`,
    },
    {
      id: 'PKT-003-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-04-06T13:41:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Blue Marten Logistics LLC
FEIN: 41-0882314 (fictional)
MAILING ADDRESS: 3320 Rice Lake Rd, Duluth MN 55811
YEARS IN BUSINESS: 22
RADIUS OF OPERATION: 400 miles
COMMODITY HAULED: Forest products, general freight

PROPOSED EFFECTIVE DATE: 07/01/2026
NUMBER OF POWER UNITS: 12
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-003-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-04-06T13:41:00Z',
      content: `BLUE MARTEN LOGISTICS LLC - SCHEDULE OF VEHICLES
Prepared 04/03/2026

Unit | Year | Make/Model            | VIN               | Garaging Address                    | Stated Value
-----+------+-----------------------+-------------------+-------------------------------------+-------------
1    | 2018 | Peterbilt 567         | 1XPCDP9X2JD330114 | 3320 Rice Lake Rd, Duluth MN 55811  | $112,000
2    | 2019 | Kenworth W990         | 1XKWDP9X1KJ447021 | 3320 Rice Lake Rd, Duluth MN 55811  | $139,500
3    | 2017 | Mack Granite          | 1M2AX07C8HM044218 | 3320 Rice Lake Rd, Duluth MN 55811  | $88,000
4    | 2020 | Freightliner 122SD    | 3AKJGLD58LSLN2204 | 3320 Rice Lake Rd, Duluth MN 55811  | $148,000
5    | 2021 | Western Star 4700     | 5KJJAVDR6MPLT7712 | 3320 Rice Lake Rd, Duluth MN 55811  | $161,000
6    | 2016 | Volvo VNL730          | 4V4NC9EH2GN770118 | 3320 Rice Lake Rd, Duluth MN 55811  | $59,500
7    | 2019 | Peterbilt 389         | 1XPXDP9X9KD662207 | 3320 Rice Lake Rd, Duluth MN 55811  | $154,500
8    | 2018 | International HX      | 3HTJGTKT1JN885514 | 3320 Rice Lake Rd, Duluth MN 55811  | $121,000
9    | 2022 | Kenworth T880         | 1XKZDP9X8ND991103 | 3320 Rice Lake Rd, Duluth MN 55811  | $178,000
10   | 2015 | Freightliner CA125    | 1FUJGLDR7FLGT4419 | 3320 Rice Lake Rd, Duluth MN 55811  | $46,000
11   | 2020 | Mack Anthem           | 1M1AN4GY3LM220047 | 3320 Rice Lake Rd, Duluth MN 55811  | $132,500
12   | 2017 | Peterbilt 579         | 1XPBDP9X5HD551120 | 3320 Rice Lake Rd, Duluth MN 55811  | $94,500
13   | 2021 | Volvo VNL860          | 4V4NC9EJ7MN338840 | 3320 Rice Lake Rd, Duluth MN 55811  | $167,500`,
    },
    {
      id: 'PKT-003-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-04-06T13:42:00Z',
      content: `LOSS RUN - BLUE MARTEN LOGISTICS LLC
Carrier: Lakehead Casualty (fictional)   Policy period 07/01/2023 - 07/01/2026
Valued 03/31/2026

Claim No | Date of Loss | Cause                  | Status | Incurred
---------+--------------+------------------------+--------+----------
LC-31882 | 12/19/2023   | Slide-off, black ice   | Closed | $34,600
LC-36410 | 08/07/2025   | Load shift, log spill  | Closed | $58,900`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::vehicle_count_reconciliation',
    why:
      'Two independent documents state 12 units and the schedule carries 13. ' +
      'No endorsement, note or status flag accounts for the difference, so the ' +
      'exposure base is genuinely in dispute.',
    expected: {
      'policy::vehicle_count_reconciliation': 'conflict',
      'policy::stated_vehicle_count': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
