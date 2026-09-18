import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 3 — TRUE CONFLICT.
 *
 * Planted: the broker email summarises loss history as "two losses in the past
 * three years, both minor". The attached loss run carries four claims, two of
 * them well into six figures including an open jackknife claim at $148,000.
 * The documents do not contradict each other word-for-word — the email is a
 * *summary*, and catching it requires comparing a prose claim against a table.
 */
export const PKT_005: Packet = {
  id: 'PKT-005',
  title: 'Email loss summary omits two material losses',
  insured: 'Iron Creek Carriers LLC',
  taxonomyCase: 3,
  bucket: 'true_conflict',
  synopsis:
    'Email says "two losses, both minor"; the loss run shows four claims including $96,400 and an open $148,000.',
  documents: [
    {
      id: 'PKT-005-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-05-04T12:55:00Z',
      content: `From: t.abadie@summitcrest-agency.example
To: submissions@northstar-underwriting.example
Date: Mon, 4 May 2026 07:55:00 -0500
Subject: Iron Creek Carriers - 8 units - 8/1 effective

Hi,

Iron Creek Carriers LLC for 08/01/2026. Eight power units, intermodal drayage
around the Kansas City rail ramps, 150 mile radius.

They have had two losses in the past three years, both minor. Owner is very
hands on with driver selection and has added cameras across the fleet.

Application, schedule and loss runs attached.

Theo Abadie
Summit Crest Agency`,
    },
    {
      id: 'PKT-005-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-05-04T12:56:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Iron Creek Carriers LLC
FEIN: 48-0771204 (fictional)
MAILING ADDRESS: 1900 Front St, Kansas City MO 64120
YEARS IN BUSINESS: 7
RADIUS OF OPERATION: 150 miles
COMMODITY HAULED: Intermodal containers, drayage

PROPOSED EFFECTIVE DATE: 08/01/2026
NUMBER OF POWER UNITS: 8
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-005-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-05-04T12:56:00Z',
      content: `IRON CREEK CARRIERS LLC - SCHEDULE OF VEHICLES
Prepared 05/01/2026

Unit | Year | Make/Model            | VIN               | Garaging Address                     | Stated Value
-----+------+-----------------------+-------------------+--------------------------------------+-------------
1    | 2017 | Freightliner CA125    | 1FUJGLDR4HLHT2201 | 1900 Front St, Kansas City MO 64120  | $74,000
2    | 2018 | International LT      | 3HSDJAPR2JN220117 | 1900 Front St, Kansas City MO 64120  | $86,500
3    | 2019 | Volvo VNL300          | 4V4MC9EH8KN441203 | 1900 Front St, Kansas City MO 64120  | $92,000
4    | 2016 | Kenworth T680         | 1XKYDP9X1GJ330028 | 1900 Front St, Kansas City MO 64120  | $57,500
5    | 2020 | Freightliner CA126    | 3AKJHHDR4LSLP7714 | 1900 Front St, Kansas City MO 64120  | $121,000
6    | 2018 | Peterbilt 579         | 1XPBDP9X0JD880041 | 1900 Front St, Kansas City MO 64120  | $98,500
7    | 2021 | International LT      | 3HSDJAPR7MN551128 | 1900 Front St, Kansas City MO 64120  | $134,000
8    | 2015 | Mack Pinnacle         | 1M1AW07Y2FM118840 | 1900 Front St, Kansas City MO 64120  | $43,500`,
    },
    {
      id: 'PKT-005-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-05-04T12:57:00Z',
      content: `LOSS RUN - IRON CREEK CARRIERS LLC
Carrier: Meridian Heartland Insurance (fictional)
Policy period 08/01/2023 - 08/01/2026   Valued 04/30/2026

Claim No | Date of Loss | Cause                              | Status | Incurred
---------+--------------+------------------------------------+--------+----------
IC-77120 | 11/08/2023   | Backing incident, dock damage      | Closed | $6,800
IC-80455 | 03/19/2024   | Windshield / glass                 | Closed | $1,240
IC-83901 | 07/22/2024   | Intersection collision, bodily inj | Closed | $96,400
IC-90233 | 01/14/2026   | Jackknife on ice, two vehicles     | Open   | $148,000`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::loss_history_completeness',
    why:
      'The submission narrative understates both the number of losses (2 vs 4) ' +
      'and their severity ("both minor" vs $96,400 closed and $148,000 open). ' +
      'An underwriter pricing from the email alone would be badly wrong.',
    expected: {
      'policy::loss_history_completeness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
