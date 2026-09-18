import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 1 — TRUE CONFLICT.
 *
 * Planted: one VIN (1FUJGLDR8KLBX2207) is carried on two schedule rows, Unit 4
 * and Unit 7, with two different stated values. Classic copy/paste data-entry
 * error: the same truck cannot be insured twice at two values, and one of the
 * two rows is really a different truck whose VIN was never captured.
 *
 * Deliberately NOT planted: the application omits a total scheduled value (so
 * the arithmetic rule stays quiet) and the email makes no claim about loss
 * history (so the omission rule stays quiet). Each packet exercises one
 * phenomenon; incidental findings would make the ground truth unfalsifiable.
 */
export const PKT_001: Packet = {
  id: 'PKT-001',
  title: 'Duplicate VIN carried at two different stated values',
  insured: 'Cedar Ridge Hauling LLC',
  taxonomyCase: 1,
  bucket: 'true_conflict',
  synopsis:
    'The same VIN appears on Unit 4 ($142,000) and Unit 7 ($118,500) of the vehicle schedule.',
  documents: [
    {
      id: 'PKT-001-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-03-02T14:22:00Z',
      content: `From: dana.halloran@meridian-brokerage.example
To: submissions@northstar-underwriting.example
Date: Mon, 2 Mar 2026 09:22:00 -0500
Subject: New business - Cedar Ridge Hauling LLC - 6/1 effective

Hi team,

New business submission attached for Cedar Ridge Hauling LLC, a regional
flatbed operation out of Dubuque. They run 9 power units hauling aggregate and
steel coil, almost all of it inside a 300 mile radius.

Incumbent is non-renewing for capacity reasons, not loss driven. Loss runs for
the prior three years are attached for your review.

Looking for $1,000,000 CSL auto liability plus physical damage on the scheduled
units, effective 06/01/2026.

Happy to chase anything else you need.

Dana Halloran
Meridian Brokerage Group`,
    },
    {
      id: 'PKT-001-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-03-02T14:25:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Cedar Ridge Hauling LLC
FEIN: 42-0119887 (fictional)
MAILING ADDRESS: 2210 Kerper Blvd, Dubuque IA 52001
YEARS IN BUSINESS: 14
RADIUS OF OPERATION: 300 miles
COMMODITY HAULED: Aggregate, steel coil

PROPOSED EFFECTIVE DATE: 06/01/2026
NUMBER OF POWER UNITS: 9
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1

Prepared by Meridian Brokerage Group on behalf of the applicant.`,
    },
    {
      id: 'PKT-001-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-03-02T14:25:00Z',
      content: `CEDAR RIDGE HAULING LLC - SCHEDULE OF VEHICLES
Prepared 03/02/2026

Unit | Year | Make/Model         | VIN               | Garaging Address                    | Stated Value
-----+------+--------------------+-------------------+-------------------------------------+-------------
1    | 2019 | Freightliner CA125 | 1FUJGLDR8KLBX2201 | 2210 Kerper Blvd, Dubuque IA 52001  | $96,000
2    | 2018 | Kenworth T680      | 1XKYDP9X8JJ208814 | 2210 Kerper Blvd, Dubuque IA 52001  | $88,500
3    | 2020 | Peterbilt 579      | 1XPBDP9X1LD612077 | 2210 Kerper Blvd, Dubuque IA 52001  | $124,000
4    | 2021 | Freightliner CA126 | 1FUJGLDR8KLBX2207 | 2210 Kerper Blvd, Dubuque IA 52001  | $142,000
5    | 2017 | Volvo VNL760       | 4V4NC9EH5HN975512 | 2210 Kerper Blvd, Dubuque IA 52001  | $72,000
6    | 2019 | Mack Anthem        | 1M1AN4GY7KM019334 | 2210 Kerper Blvd, Dubuque IA 52001  | $101,500
7    | 2021 | Freightliner CA126 | 1FUJGLDR8KLBX2207 | 2210 Kerper Blvd, Dubuque IA 52001  | $118,500
8    | 2016 | International LT   | 3HSDJAPR7GN110492 | 2210 Kerper Blvd, Dubuque IA 52001  | $58,000
9    | 2022 | Peterbilt 389      | 1XPXDP9X4ND789201 | 2210 Kerper Blvd, Dubuque IA 52001  | $167,000`,
    },
    {
      id: 'PKT-001-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-03-02T14:26:00Z',
      content: `LOSS RUN - CEDAR RIDGE HAULING LLC
Carrier: Cardinal Mutual (fictional)   Policy period 06/01/2023 - 06/01/2026
Valued 02/28/2026

Claim No | Date of Loss | Cause                  | Status | Incurred
---------+--------------+------------------------+--------+----------
CM-88421 | 09/14/2023   | Rear-end collision     | Closed | $18,400
CM-91077 | 04/02/2025   | Cargo shift / rollover | Closed | $41,250`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::vin_uniqueness',
    why:
      'One VIN cannot describe two separately rated units at two stated values. ' +
      'Nothing in the packet reconciles the two rows, so a human has to decide ' +
      'which row is wrong before the schedule can be rated.',
    expected: {
      'policy::vin_uniqueness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
