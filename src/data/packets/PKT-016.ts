import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 10 — HARD NEGATIVE (mismatch explained by context elsewhere).
 *
 * Planted: the email and application both say 15 power units. The schedule
 * carries 14 rows — units 1-11 and 13-15, with no Unit 12. A loss control field
 * note filed a day later records that Unit 12 is out of service pending an
 * engine replacement and was pulled from the active schedule at the insured's
 * request.
 *
 * This is the arithmetic of PKT-003 (a true conflict) with one extra document
 * that resolves it. A pipeline that only reconciles numbers will flag both
 * identically; a pipeline that reads the whole packet will suppress this one
 * and explain why. It is the cleanest test in the set of whether "reads the
 * full context" is real or decorative.
 */
export const PKT_016: Packet = {
  id: 'PKT-016',
  title: 'Fleet count short by one, explained by an out-of-service unit',
  insured: 'Ptarmigan Freightways LLC',
  taxonomyCase: 10,
  bucket: 'hard_negative',
  synopsis:
    'Stated 15 units vs 14 scheduled rows, reconciled by a field note recording Unit 12 out of service.',
  documents: [
    {
      id: 'PKT-016-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-05-26T17:40:00Z',
      content: `From: hlindqvist@norsklinje-agency.example
To: submissions@northstar-underwriting.example
Date: Tue, 26 May 2026 09:40:00 -0800
Subject: Ptarmigan Freightways - 15 power units - 8/1 effective

Hi,

Ptarmigan Freightways LLC for an 08/01/2026 effective date. Fifteen power units
running fuel, freight and construction materials out of Anchorage, seasonal
long-haul on the Parks and Glenn highways.

Loss control is scheduling a yard visit this week and will send their note
directly. Application, schedule and loss runs attached.

Hanne Lindqvist
Norsk Linje Agency`,
    },
    {
      id: 'PKT-016-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-05-26T17:41:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Ptarmigan Freightways LLC
FEIN: 92-0117443 (fictional)
MAILING ADDRESS: 6100 Lake Otis Pkwy, Anchorage AK 99507
YEARS IN BUSINESS: 17
RADIUS OF OPERATION: 700 miles
COMMODITY HAULED: Fuel (non-hazmat placarded), general freight, aggregate

PROPOSED EFFECTIVE DATE: 08/01/2026
NUMBER OF POWER UNITS: 15
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-016-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles (active units)',
      receivedAt: '2026-05-26T17:41:00Z',
      content: `PTARMIGAN FREIGHTWAYS LLC - SCHEDULE OF VEHICLES (ACTIVE)
Prepared 05/22/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                       | Stated Value
-----+------+----------------------+-------------------+----------------------------------------+-------------
1    | 2018 | Kenworth T800        | 1XKDDP9X2JJ110227 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $118,000
2    | 2020 | Peterbilt 567        | 1XPCDP9X9LD220118 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $147,500
3    | 2017 | Freightliner 122SD   | 3AKJGLD57HSLX1103 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $96,000
4    | 2021 | Western Star 4900    | 5KJJAVDR8MPLY2204 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $172,000
5    | 2019 | Mack Granite         | 1M2AX07C6KM330226 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $124,500
6    | 2016 | Kenworth T880        | 1XKZDP9X9GJ440114 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $71,000
7    | 2022 | Peterbilt 389        | 1XPXDP9X3ND550223 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $186,500
8    | 2018 | Volvo VNL730         | 4V4NC9EH7JN660117 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $109,000
9    | 2020 | Freightliner 114SD   | 1FVHGLDR2LHKP7705 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $138,000
10   | 2015 | Kenworth T800        | 1XKDDP9X4FJ770225 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $58,500
11   | 2021 | Mack Anthem          | 1M1AN4GY4MM880118 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $155,000
13   | 2019 | Peterbilt 567        | 1XPCDP9X1KD990226 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $131,500
14   | 2022 | Western Star 49X     | 5KJJAVDR2NPLZ1104 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $198,000
15   | 2017 | Freightliner 122SD   | 3AKJGLD50HSLX3302 | 6100 Lake Otis Pkwy, Anchorage AK 99507 | $92,500`,
    },
    {
      id: 'PKT-016-D4',
      kind: 'adjuster_note',
      title: 'Loss control field note - yard visit',
      receivedAt: '2026-05-28T22:05:00Z',
      content: `LOSS CONTROL FIELD NOTE - PTARMIGAN FREIGHTWAYS LLC
Prepared by: R. Iselin, field representative
Visit date: 05/27/2026

Yard visit completed at 6100 Lake Otis Pkwy. Maintenance program is organised
and records are current.

Fleet as presented by the insured is 15 power units.

Unit 12 (2016 Kenworth T800, VIN 1XKDDP9X6GJ660221) has been OUT OF SERVICE
since April 2026 pending an engine replacement, and has been removed from the
active vehicle schedule at the insured's request. Plates are surrendered and the
unit is parked at the rear of the yard. The owner expects it back in service in
Q3 and will endorse it back onto the policy at that time.

All other units were observed on site or accounted for as dispatched. No
recommendations.`,
    },
    {
      id: 'PKT-016-D5',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-05-26T17:42:00Z',
      content: `LOSS RUN - PTARMIGAN FREIGHTWAYS LLC
Carrier: Cook Inlet Mutual (fictional)   Policy period 08/01/2023 - 08/01/2026
Valued 04/30/2026

Claim No | Date of Loss | Cause                       | Status | Incurred
---------+--------------+-----------------------------+--------+----------
CI-70118 | 01/17/2024   | Slide-off, packed snow      | Closed | $39,400
CI-74025 | 10/03/2025   | Rock chip windshields (3)   | Closed | $4,100
CI-77930 | 02/28/2026   | Moose strike, front end     | Closed | $26,800`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::vehicle_count_reconciliation',
    why:
      'The one-unit gap is fully explained: the field note names Unit 12, gives ' +
      'its VIN, states it is out of service and says it was deliberately removed ' +
      'from the active schedule. Fifteen owned, fourteen active, delta of one, ' +
      'one unit accounted for. Flagging this wastes a review cycle on a question ' +
      'the packet already answers.',
    expected: {
      'policy::vehicle_count_reconciliation': 'benign_variant',
      'policy::stated_vehicle_count': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
