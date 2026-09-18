import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 6 — HARD NEGATIVE (temporal supersession).
 *
 * Planted: the original email and application say 12 power units and the
 * schedule carries 12 rows. Nine days later the broker sends an endorsement
 * request adding a thirteenth unit and states the fleet is now 13.
 *
 * A naive detector sees "12" and "13" for the same field and raises a conflict.
 * The correct reading is that the 13 *supersedes* the 12 as of the endorsement,
 * and that the schedule's 12 rows plus the one added unit reconcile to 13. Both
 * values are true, of different moments in time.
 *
 * This is the single most important hard negative in the set: it is the case
 * where over-flagging costs an underwriter the most trust, because the system
 * is contradicting a change the broker made on purpose and announced clearly.
 */
export const PKT_009: Packet = {
  id: 'PKT-009',
  title: 'Endorsement adds a 13th unit after a 12-unit submission',
  insured: 'Marchetti Haulage LLC',
  taxonomyCase: 6,
  bucket: 'hard_negative',
  synopsis:
    'Fleet goes 12 -> 13 because a later endorsement email explicitly adds a unit. A legitimate update, not a contradiction.',
  documents: [
    {
      id: 'PKT-009-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-04-20T15:18:00Z',
      content: `From: lmarchetti-broker@keystone-agency.example
To: submissions@northstar-underwriting.example
Date: Mon, 20 Apr 2026 11:18:00 -0400
Subject: Marchetti Haulage - 12 power units - 6/1 effective

Hi,

Marchetti Haulage LLC for a 06/01/2026 effective date. They run 12 power units
out of Allentown PA, steel and building products, 350 mile radius.

Application, schedule and three years of loss runs attached.

Nick Ferraro
Keystone Agency`,
    },
    {
      id: 'PKT-009-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-04-20T15:19:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Marchetti Haulage LLC
FEIN: 23-0771908 (fictional)
MAILING ADDRESS: 1740 Union Blvd, Allentown PA 18109
YEARS IN BUSINESS: 26
RADIUS OF OPERATION: 350 miles
COMMODITY HAULED: Steel, building products

PROPOSED EFFECTIVE DATE: 06/01/2026
NUMBER OF POWER UNITS: 12
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-009-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-04-20T15:19:00Z',
      content: `MARCHETTI HAULAGE LLC - SCHEDULE OF VEHICLES
Prepared 04/17/2026

Unit | Year | Make/Model            | VIN               | Garaging Address                     | Stated Value
-----+------+-----------------------+-------------------+--------------------------------------+-------------
1    | 2017 | Peterbilt 567         | 1XPCDP9X6HD110227 | 1740 Union Blvd, Allentown PA 18109  | $97,000
2    | 2019 | Kenworth T880         | 1XKZDP9X3KJ220118 | 1740 Union Blvd, Allentown PA 18109  | $141,500
3    | 2018 | Mack Granite          | 1M2AX07C0JM330041 | 1740 Union Blvd, Allentown PA 18109  | $109,000
4    | 2020 | Freightliner 122SD    | 3AKJGLD54LSLR4412 | 1740 Union Blvd, Allentown PA 18109  | $152,000
5    | 2016 | Western Star 4900     | 5KJJAVDR3GPKM2203 | 1740 Union Blvd, Allentown PA 18109  | $74,500
6    | 2021 | Volvo VNL860          | 4V4NC9EJ6MN110334 | 1740 Union Blvd, Allentown PA 18109  | $164,000
7    | 2015 | Peterbilt 389         | 1XPXDP9X2FD440229 | 1740 Union Blvd, Allentown PA 18109  | $58,500
8    | 2019 | International HX      | 3HTJGTKT8KN550117 | 1740 Union Blvd, Allentown PA 18109  | $128,000
9    | 2022 | Kenworth W990         | 1XKWDP9X5ND660221 | 1740 Union Blvd, Allentown PA 18109  | $183,000
10   | 2018 | Mack Anthem           | 1M1AN4GY1JM770048 | 1740 Union Blvd, Allentown PA 18109  | $112,500
11   | 2020 | Freightliner CA126    | 3AKJHHDR0LSLT8805 | 1740 Union Blvd, Allentown PA 18109  | $147,000
12   | 2017 | Volvo VNL730          | 4V4NC9EH4HN880226 | 1740 Union Blvd, Allentown PA 18109  | $86,000`,
    },
    {
      id: 'PKT-009-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-04-20T15:20:00Z',
      content: `LOSS RUN - MARCHETTI HAULAGE LLC
Carrier: Lehigh Indemnity (fictional)   Policy period 06/01/2023 - 06/01/2026
Valued 03/31/2026

Claim No | Date of Loss | Cause                    | Status | Incurred
---------+--------------+--------------------------+--------+----------
LH-70221 | 01/30/2024   | Loaded trailer tip, wind | Closed | $47,300
LH-74118 | 06/14/2025   | Rear-end, stop and go    | Closed | $21,900`,
    },
    {
      id: 'PKT-009-D5',
      kind: 'endorsement_email',
      title: 'Endorsement request - add one unit',
      receivedAt: '2026-04-29T18:44:00Z',
      content: `From: nferraro@keystone-agency.example
To: submissions@northstar-underwriting.example
Date: Wed, 29 Apr 2026 14:44:00 -0400
Subject: RE: Marchetti Haulage - endorsement request, add one unit

Following up on the submission from the 20th.

The insured took delivery of a new tractor last week. Please ADD the following
unit to the schedule effective 06/15/2026:

  Unit 13 | 2023 Peterbilt 579 | VIN 1XPBDP9X7PD441203
  Garaged at 1740 Union Blvd, Allentown PA 18109
  Stated value $198,000

This brings the fleet to 13 power units. Everything else on the submission is
unchanged. Please confirm the additional premium when you quote.

Nick Ferraro
Keystone Agency`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::stated_vehicle_count',
    why:
      'Both counts are correct at their own moment in time. The endorsement ' +
      'explicitly says ADD, names the unit, and gives an effective date, so 13 ' +
      'supersedes 12 rather than contradicting it. Flagging this as an error ' +
      'tells the broker the system did not read their endorsement.',
    expected: {
      'policy::stated_vehicle_count': 'supersession',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
