import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 9 — HARD NEGATIVE (OCR noise that resolves to one fact).
 *
 * Planted: page 2 of the schedule was re-scanned and re-sent. In the scanned
 * copy Unit 9's VIN reads IXPBDP9XILD6I2O88 instead of 1XPBDP9X1LD612088, and
 * the column header reads "VlN" with a lowercase L.
 *
 * The substitutions are all I->1 and O->0. That direction is safe, because the
 * VIN standard excludes I, O and Q precisely so they cannot be confused with 1
 * and 0 — a VIN containing them is by definition a misread, and there is
 * exactly one legal reading. So this resolves to a single fact with high
 * confidence.
 *
 * A raw string comparison instead sees two VINs for Unit 9 and, worse, may
 * count a fifteenth vehicle that does not exist. (The genuinely ambiguous OCR
 * pairs — 5/S, 8/B, 2/Z, 6/G — are legal in both readings and must NOT be
 * silently merged; that behaviour is asserted directly in the normaliser tests.)
 */
export const PKT_015: Packet = {
  id: 'PKT-015',
  title: 'Re-scanned schedule page with OCR glyph substitutions in a VIN',
  insured: 'Barrowman Logistics Co',
  taxonomyCase: 9,
  bucket: 'hard_negative',
  synopsis:
    'Unit 9 reads IXPBDP9XILD6I2O88 on a re-scanned page; I->1 and O->0 are illegal in VINs, so it is the same vehicle.',
  documents: [
    {
      id: 'PKT-015-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-02-02T14:55:00Z',
      content: `From: kobrien@greatlakes-underwriters.example
To: submissions@northstar-underwriting.example
Date: Mon, 2 Feb 2026 09:55:00 -0500
Subject: Barrowman Logistics - 14 units - 4/1 effective

Hello,

Barrowman Logistics Co for 04/01/2026. Fourteen power units, general commodity
dry van, Toledo OH base, midwest and northeast lanes.

Apologies in advance - the insured's schedule came to us as a fax and page two
is rough. Application, schedule and loss runs attached.

Kevin O'Brien
Great Lakes Underwriters Agency`,
    },
    {
      id: 'PKT-015-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-02-02T14:56:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Barrowman Logistics Co
FEIN: 34-0662118 (fictional)
MAILING ADDRESS: 2900 Hill Ave, Toledo OH 43607
YEARS IN BUSINESS: 24
RADIUS OF OPERATION: 600 miles
COMMODITY HAULED: General commodity dry van

PROPOSED EFFECTIVE DATE: 04/01/2026
NUMBER OF POWER UNITS: 14
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-015-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-02-02T14:56:00Z',
      content: `BARROWMAN LOGISTICS CO - SCHEDULE OF VEHICLES
Prepared 01/29/2026

Unit | Year | Make/Model           | VIN               | Garaging Address              | Stated Value
-----+------+----------------------+-------------------+-------------------------------+-------------
1    | 2019 | Freightliner CA125   | 1FUJGLDR5KLBW1101 | 2900 Hill Ave, Toledo OH 43607 | $112,000
2    | 2020 | Kenworth T680        | 1XKYDP9X1LJ220227 | 2900 Hill Ave, Toledo OH 43607 | $134,500
3    | 2017 | Volvo VNL760         | 4V4NC9EH2HN330118 | 2900 Hill Ave, Toledo OH 43607 | $84,000
4    | 2021 | Peterbilt 579        | 1XPBDP9X6MD440226 | 2900 Hill Ave, Toledo OH 43607 | $151,000
5    | 2018 | International LT     | 3HSDJAPR8JN550114 | 2900 Hill Ave, Toledo OH 43607 | $97,500
6    | 2022 | Freightliner CA126   | 3AKJHHDR5NSNW6602 | 2900 Hill Ave, Toledo OH 43607 | $173,000
7    | 2016 | Mack Pinnacle        | 1M1AW07Y1GM770225 | 2900 Hill Ave, Toledo OH 43607 | $61,500
8    | 2020 | Kenworth T880        | 1XKZDP9X7LJ880117 | 2900 Hill Ave, Toledo OH 43607 | $145,000
9    | 2019 | Peterbilt 579        | 1XPBDP9X1LD612088 | 2900 Hill Ave, Toledo OH 43607 | $128,000
10   | 2021 | Volvo VNL860         | 4V4NC9EJ3MN990223 | 2900 Hill Ave, Toledo OH 43607 | $159,500
11   | 2015 | Freightliner CA125   | 1FUJGLDR8FLGZ1102 | 2900 Hill Ave, Toledo OH 43607 | $47,000
12   | 2022 | Kenworth T680        | 1XKYDP9X8ND110224 | 2900 Hill Ave, Toledo OH 43607 | $168,000
13   | 2018 | Mack Anthem          | 1M1AN4GY6JM220118 | 2900 Hill Ave, Toledo OH 43607 | $106,500
14   | 2020 | Peterbilt 389        | 1XPXDP9X1LD330226 | 2900 Hill Ave, Toledo OH 43607 | $139,000`,
    },
    {
      id: 'PKT-015-D4',
      kind: 'scanned_addendum',
      title: 'Re-scanned schedule page 2 of 2',
      receivedAt: '2026-02-03T19:12:00Z',
      content: `SCANNED PAGE RE-TRANSMISSION - BARROWMAN LOGISTICS CO
Page 2 of 2, resent 02/03/2026 at underwriter request (original fax illegible)
Source: flatbed scan of broker hard copy

Unit | Year | Make/Model      | VlN               | Garaging Address              | Stated Value
-----+------+-----------------+-------------------+-------------------------------+-------------
9    | 2019 | Peterbilt 579   | IXPBDP9XILD6I2O88 | 2900 Hill Ave, Toledo OH 43607 | $128,000

(Re-sent for legibility only. No change to the schedule.)`,
    },
    {
      id: 'PKT-015-D5',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-02-02T14:57:00Z',
      content: `LOSS RUN - BARROWMAN LOGISTICS CO
Carrier: Maumee Valley Casualty (fictional)   Policy period 04/01/2023 - 04/01/2026
Valued 12/31/2025

Claim No | Date of Loss | Cause                     | Status | Incurred
---------+--------------+---------------------------+--------+----------
MV-51203 | 07/08/2024   | Trailer swing, gate post  | Closed | $8,900
MV-55711 | 11/26/2025   | Multi-vehicle, fog        | Open   | $64,200`,
    },
  ],
  groundTruth: {
    focusGroup: 'vehicle:unit-9::vin',
    why:
      'I, O and Q are not valid VIN characters, so IXPBDP9XILD6I2O88 has exactly ' +
      'one legal reading and it is the VIN already on the schedule. Same unit ' +
      'number, same year/make, same stated value, and the page says it is a ' +
      'legibility re-send. One vehicle, two scans.',
    expected: {
      'vehicle:unit-9::vin': 'benign_variant',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::vin_uniqueness': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
