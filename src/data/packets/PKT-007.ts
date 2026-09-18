import type { Packet } from '../../lib/types';

/**
 * Taxonomy case 4 — TRUE CONFLICT.
 *
 * Planted: the broker email asks for a June 1 inception; the application filled
 * out two minutes later says 05/01/2026.
 *
 * Designed to defeat "the newest document wins" heuristics: the two documents
 * arrive two minutes apart, and the *later* one carries no amendment, revision
 * or endorsement language whatsoever. A pipeline that resolves this silently in
 * favour of the later timestamp is guessing, and a wrong inception date means
 * an uncovered month.
 */
export const PKT_007: Packet = {
  id: 'PKT-007',
  title: 'Effective date differs between email and application, minutes apart',
  insured: 'Osgood Container Services',
  taxonomyCase: 4,
  bucket: 'true_conflict',
  synopsis:
    'Email asks for a June 1 inception; the application submitted two minutes later says 05/01/2026, with no revision language.',
  documents: [
    {
      id: 'PKT-007-D1',
      kind: 'broker_email',
      title: 'Broker submission email',
      receivedAt: '2026-02-24T14:10:00Z',
      content: `From: pnakamura@harborpoint-risk.example
To: submissions@northstar-underwriting.example
Date: Tue, 24 Feb 2026 09:10:00 -0500
Subject: Osgood Container Services - new business

Morning,

Please quote Osgood Container Services. Six power units doing port drayage out of
Elizabeth NJ, 100 mile radius, no overnight storage of loaded containers.

We need coverage to incept June 1. The insured's current policy runs to the end
of May and they do not want to double up.

Application and schedule to follow in the next email, loss runs attached here.

Paul Nakamura
Harbor Point Risk`,
    },
    {
      id: 'PKT-007-D2',
      kind: 'application',
      title: 'Commercial auto application (simplified)',
      receivedAt: '2026-02-24T14:12:00Z',
      content: `COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)

NAMED INSURED: Osgood Container Services
FEIN: 22-0669114 (fictional)
MAILING ADDRESS: 605 Dowd Ave, Elizabeth NJ 07201
YEARS IN BUSINESS: 5
RADIUS OF OPERATION: 100 miles
COMMODITY HAULED: Marine containers, port drayage

PROPOSED EFFECTIVE DATE: 05/01/2026
NUMBER OF POWER UNITS: 6
LIABILITY LIMIT (CSL): $1,000,000
GARAGING LOCATIONS: 1`,
    },
    {
      id: 'PKT-007-D3',
      kind: 'vehicle_schedule',
      title: 'Schedule of vehicles',
      receivedAt: '2026-02-24T14:12:00Z',
      content: `OSGOOD CONTAINER SERVICES - SCHEDULE OF VEHICLES
Prepared 02/23/2026

Unit | Year | Make/Model          | VIN               | Garaging Address                  | Stated Value
-----+------+---------------------+-------------------+-----------------------------------+-------------
1    | 2016 | Freightliner CA125  | 1FUJGLDR9GLGX3301 | 605 Dowd Ave, Elizabeth NJ 07201  | $62,000
2    | 2018 | Volvo VNL300        | 4V4MC9EH5JN112204 | 605 Dowd Ave, Elizabeth NJ 07201  | $79,500
3    | 2017 | International LT    | 3HSDJAPR1HN330118 | 605 Dowd Ave, Elizabeth NJ 07201  | $71,000
4    | 2019 | Kenworth T680       | 1XKYDP9X0KJ440226 | 605 Dowd Ave, Elizabeth NJ 07201  | $104,500
5    | 2015 | Peterbilt 579       | 1XPBDP9X8FD220017 | 605 Dowd Ave, Elizabeth NJ 07201  | $51,000
6    | 2020 | Freightliner CA126  | 3AKJHHDR2LSLQ5509 | 605 Dowd Ave, Elizabeth NJ 07201  | $118,000`,
    },
    {
      id: 'PKT-007-D4',
      kind: 'loss_run',
      title: 'Loss run 2023-2026',
      receivedAt: '2026-02-24T14:10:00Z',
      content: `LOSS RUN - OSGOOD CONTAINER SERVICES
Carrier: Bayonne Casualty (fictional)   Policy period 05/01/2023 - 05/01/2026
Valued 01/31/2026

Claim No | Date of Loss | Cause                       | Status | Incurred
---------+--------------+-----------------------------+--------+----------
BC-13320 | 07/16/2024   | Chassis separation, no injury | Closed | $11,700
BC-16045 | 09/29/2025   | Low clearance strike          | Closed | $23,400`,
    },
  ],
  groundTruth: {
    focusGroup: 'policy::effective_date',
    why:
      'Two dates one month apart, no amendment language, no supersession signal. ' +
      'Binding on the wrong one leaves the insured either uncovered for May or ' +
      'double-covered and disputing premium. This must reach a human.',
    expected: {
      'policy::effective_date': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
    },
  },
};
