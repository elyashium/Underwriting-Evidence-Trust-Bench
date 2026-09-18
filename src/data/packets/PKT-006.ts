import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 3 — TRUE CONFLICT (second variant).
 *
 * Planted: the email asserts a severity ceiling — "no claims over $10,000 in
 * the last five years" — and the loss run contains a $214,800 reefer
 * breakdown/spoilage claim. The count is not the problem here; the *cap* is.
 * This variant exists so the omission rule cannot pass by only comparing
 * claim counts.
 */
export const PKT_006: Packet = {
  id: 'PKT-006',
  title: 'Email asserts a $10,000 severity ceiling contradicted by the loss run',
  insured: 'Perrault Refrigerated Lines',
  taxonomyCase: 3,
  bucket: 'true_conflict',
  synopsis:
    'Email claims no claim over $10,000 in five years; the loss run shows a $214,800 spoilage claim.',
  documents: [
    {
      id: 'PKT-006-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-03-23T17:31:00Z',
      content: `From: cdesrosiers@lacroix-insurance.example
To: submissions@northstar-underwriting.example
Date: Mon, 23 Mar 2026 13:31:00 -0400
Subject: Perrault Refrigerated Lines - 7 units - 6/1

Team,

Perrault Refrigerated Lines, seven reefer units running produce and dairy out of
Burlington VT into the Boston and Albany markets. Effective 06/01/2026.

This is a clean account - no claims over $10,000 in the last five years. Owner
operates conservatively and the equipment is newer than the class average.

Application, schedule and loss runs attached.

Claire Desrosiers
Lacroix Insurance Group`,
    },
    {
      id: 'PKT-006-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-03-23T17:32:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Perrault Refrigerated Lines
FEIN: 03-0448821 (fictional)
MAILING ADDRESS: 88 Shelburne Rd, Burlington VT 05401
YEARS IN BUSINESS: 12
RADIUS OF OPERATION: 350 miles
COMMODITY HAULED: Refrigerated produce, dairy

PROPOSED EFFECTIVE DATE: 06/01/2026
NUMBER OF POWER UNITS: 7
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-006-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-03-23T17:32:00Z',
      content: `PERRAULT REFRIGERATED LINES - SCHEDULE OF VEHICLES
Prepared 03/20/2026

Unit | Year | Make/Model           | VIN               | Garaging Address                    | Stated Value
-----+------+----------------------+-------------------+-------------------------------------+-------------
1    | 2021 | Freightliner CA126   | 3AKJHHDR8MSMX1102 | 88 Shelburne Rd, Burlington VT 05401 | $147,000
2    | 2022 | Volvo VNL760         | 4V4NC9EH1ND220418 | 88 Shelburne Rd, Burlington VT 05401 | $169,500
3    | 2020 | Kenworth T680        | 1XKYDP9X6LJ771109 | 88 Shelburne Rd, Burlington VT 05401 | $138,000
4    | 2019 | Peterbilt 579        | 1XPBDP9X3KD440027 | 88 Shelburne Rd, Burlington VT 05401 | $122,500
5    | 2022 | Freightliner CA126   | 3AKJHHDR5NSNP4413 | 88 Shelburne Rd, Burlington VT 05401 | $174,000
6    | 2018 | International LT     | 3HSDJAPR9JN660234 | 88 Shelburne Rd, Burlington VT 05401 | $91,000
7    | 2021 | Volvo VNL860         | 4V4NC9EJ4MN880115 | 88 Shelburne Rd, Burlington VT 05401 | $158,500`,
    },
    {
      id: 'PKT-006-D4',
      kind: 'loss_run',
      title: 'Loss run 2021-2026',
      receivedAt: '2026-03-23T17:33:00Z',
      content: `LOSS RUN - PERRAULT REFRIGERATED LINES
Carrier: Green Mountain Indemnity (fictional)
Policy period 06/01/2021 - 06/01/2026   Valued 02/28/2026

Claim No | Date of Loss | Cause                                | Status | Incurred
---------+--------------+--------------------------------------+--------+----------
GM-51007 | 09/02/2022   | Mirror strike, parked vehicle        | Closed | $2,150
GM-55418 | 04/28/2024   | Reefer unit failure, load spoilage   | Closed | $214,800
GM-59902 | 12/15/2025   | Minor rear-end, no injury            | Closed | $8,400`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::loss_history_completeness',
    why:
      'The email states an explicit severity ceiling that the loss run breaches ' +
      'by more than twenty times. Total spoilage losses are a known reefer ' +
      'exposure, so this materially changes the appetite decision.',
    expected: {
      'policy::loss_history_completeness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  },
};
