import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 6 — HARD NEGATIVE (supersession that also moves an aggregate).
 *
 * Planted: Unit 5 is scheduled at $86,000. Six days later an endorsement raises
 * it to $119,500 following an appraisal, and restates the total scheduled value
 * as $734,500 (was $701,000).
 *
 * Two traps here, not one:
 *   1. the per-unit value change looks like a numeric contradiction;
 *   2. the *total* also changes, so a pipeline that reconciles the stated total
 *      against the schedule sum must use post-supersession (effective) values.
 *      Using the original $86,000 produces a phantom $33,500 arithmetic
 *      conflict — a false positive manufactured by the pipeline's own failure
 *      to apply the endorsement it already read.
 */
export const PKT_010: Packet = {
  id: 'PKT-010',
  title: 'Endorsement revises one unit value and the schedule total after appraisal',
  insured: 'Standish Drayage Partners',
  taxonomyCase: 6,
  bucket: 'hard_negative',
  synopsis:
    'Unit 5 goes $86,000 -> $119,500 by endorsement; the total moves with it. Reconciliation must use effective values.',
  documents: [
    {
      id: 'PKT-010-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-05-11T14:02:00Z',
      content: `From: gkowalski@tidewater-brokers.example
To: submissions@northstar-underwriting.example
Date: Mon, 11 May 2026 10:02:00 -0400
Subject: Standish Drayage Partners - 7 units - 7/1 effective

Good morning,

Standish Drayage Partners for 07/01/2026. Seven day cabs running container
drayage between the Norfolk terminals and regional distribution centers.
Radius is 250 miles.

Application, schedule and loss runs attached.

Greta Kowalski
Tidewater Brokers`,
    },
    {
      id: 'PKT-010-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-05-11T14:03:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Standish Drayage Partners
FEIN: 54-0229115 (fictional)
MAILING ADDRESS: 3401 Hampton Blvd, Norfolk VA 23508
YEARS IN BUSINESS: 11
RADIUS OF OPERATION: 250 miles
COMMODITY HAULED: Marine containers, drayage

PROPOSED EFFECTIVE DATE: 07/01/2026
NUMBER OF POWER UNITS: 7
LIABILITY LIMIT (CSL): $1,000,000
TOTAL SCHEDULED VALUE: $701,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-010-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-05-11T14:03:00Z',
      content: `STANDISH DRAYAGE PARTNERS - SCHEDULE OF VEHICLES
Prepared 05/08/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                      | Stated Value
-----+------+----------------------+-------------------+---------------------------------------+-------------
1    | 2018 | Volvo VNL300         | 4V4MC9EH2JN220117 | 3401 Hampton Blvd, Norfolk VA 23508   | $92,000
2    | 2019 | Freightliner CA125   | 1FUJGLDR1KLBY3302 | 3401 Hampton Blvd, Norfolk VA 23508   | $104,500
3    | 2016 | International LT     | 3HSDJAPR4GN110224 | 3401 Hampton Blvd, Norfolk VA 23508   | $78,000
4    | 2021 | Kenworth T680        | 1XKYDP9X8MJ330119 | 3401 Hampton Blvd, Norfolk VA 23508   | $131,000
5    | 2017 | Peterbilt 579        | 1XPBDP9X4HD440228 | 3401 Hampton Blvd, Norfolk VA 23508   | $86,000
6    | 2019 | Mack Pinnacle        | 1M1AW07Y7KM550041 | 3401 Hampton Blvd, Norfolk VA 23508   | $97,500
7    | 2020 | Volvo VNL760         | 4V4NC9EH0LN660223 | 3401 Hampton Blvd, Norfolk VA 23508   | $112,000`,
    },
    {
      id: 'PKT-010-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-05-11T14:04:00Z',
      content: `LOSS RUN - STANDISH DRAYAGE PARTNERS
Carrier: Chesapeake Casualty (fictional)   Policy period 07/01/2023 - 07/01/2026
Valued 04/30/2026

Claim No | Date of Loss | Cause                      | Status | Incurred
---------+--------------+----------------------------+--------+----------
CC-81120 | 08/19/2024   | Yard collision, no injury  | Closed | $7,300
CC-85604 | 03/02/2026   | Chassis tire separation    | Closed | $14,800`,
    },
    {
      id: 'PKT-010-D5',
      kind: 'endorsement_email',
      title: 'Endorsement request - revise Unit 5 stated value',
      receivedAt: '2026-05-17T16:27:00Z',
      content: `From: gkowalski@tidewater-brokers.example
To: submissions@northstar-underwriting.example
Date: Sun, 17 May 2026 12:27:00 -0400
Subject: RE: Standish Drayage Partners - corrected value on Unit 5

Hi again,

The independent appraisal on Unit 5 came back Friday and it is worth
considerably more than the insured originally told us - it had a new engine and
transmission put in last year.

Please REVISE the stated value on Unit 5 (2017 Peterbilt 579, VIN
1XPBDP9X4HD440228) from $86,000 to $119,500, effective at inception.

That makes the revised TOTAL SCHEDULED VALUE $734,500. No other changes.

Greta Kowalski
Tidewater Brokers`,
    },
  ],
  groundTruth: {
    focusGroup: 'vehicle:unit-5::stated_value',
    why:
      'The endorsement names the unit and its VIN, says REVISE, gives a reason ' +
      '(appraisal) and an effective date. $119,500 supersedes $86,000. The ' +
      'restated total is the same event, and reconciliation against the schedule ' +
      'must be done on effective values or it invents a conflict that is purely ' +
      'an artefact of ignoring the endorsement.',
    expected: {
      'vehicle:unit-5::stated_value': 'supersession',
      'policy::total_scheduled_value': 'supersession',
      'policy::scheduled_value_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
