import type { Packet, SubmissionDocument, TaxonomyCaseId } from '../../lib/types';
import { mulberry32 } from '../../lib/prng';

/**
 * Held-out value variants: sixty packets the rules never saw.
 *
 * Same structures as the sixteen-pack corpus, all-new values — names, VINs,
 * addresses, dates, amounts, counts. The document phrasing mirrors the corpus
 * packets line-for-line in shape (the extractor is literal, so novel phrasing
 * would test the generator's prose rather than the engine), which means this
 * set measures generalisation to unseen *values*, not to unseen structures.
 * That limitation is stated here and on the report, not buried.
 *
 * Labels are derived from the construction parameters, not from engine output
 * — copying engine output into fixtures would make the measurement circular.
 * The classification rules in `src/lib` are frozen with respect to this set:
 * if a variant fails, the generator is fixed when the generator lied about
 * what its documents assert, and the failure is reported when the rules have
 * a genuine gap.
 */

export { mulberry32 } from '../../lib/prng';

type Rand = () => number;

const pick = <T>(rand: Rand, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];

const int = (rand: Rand, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

const VIN_CHARS = '0123456789ABCDEFGHJKL-MNPRSTUVWXYZ'.replace(/-/g, '');

function makeVin(rand: Rand): string {
  let vin = '';
  for (let i = 0; i < 17; i += 1) vin += VIN_CHARS[Math.floor(rand() * VIN_CHARS.length)];
  return vin;
}

/** Distinct VINs for one packet; the plant (case 1) reuses one deliberately. */
function vinPool(rand: Rand, n: number): string[] {
  const pool = new Set<string>();
  while (pool.size < n) pool.add(makeVin(rand));
  return [...pool];
}

const NAME_A = ['Blue Mesa', 'Copper Line', 'Dry Fork', 'Elk Ridge', 'Fox Den', 'Granite Pass', 'Hollow Oak', 'Iron Butte', 'Juniper Run', 'Kestrel Point', 'Lone Pine', 'Mesa Verde'];
const NAME_B = ['Freight', 'Carriers', 'Haulage', 'Logistics', 'Transport', 'Systems'];
const BROKERS = ['Dana Whitfield', 'Marcus Webb', 'Priya Natarajan', 'Tom Okafor', 'Ruth Callahan', 'Sam Delacroix'];
const AGENCIES = ['Summit Crest Agency', 'Keystone Agency', 'Gulfline Risk Partners', 'Northfork Insurance Group', 'Cindercone Brokerage'];
const STREETS = ['Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Birch', 'Walnut', 'Aspen'];
const PLACES = ['Tulsa OK 74103', 'Fresno CA 93721', 'Gary IN 46406', 'Lubbock TX 79401', 'Spokane WA 99201', 'Omaha NE 68102', 'Toledo OH 43607', 'Birmingham AL 35211'];
const COMMODITIES = ['dry van general freight', 'refrigerated produce', 'steel and building products', 'intermodal drayage', 'auto parts', 'lumber and plywood'];
const MAKES = ['Freightliner Cascadia', 'Kenworth T680', 'Volvo VNL860', 'Peterbilt 579', 'Mack Anthem', 'International LT'];
const CAUSES = ['Rear-end, stop and go', 'Backing incident, dock damage', 'Intersection collision', 'Windshield / glass', 'Loaded trailer tip, wind', 'Sideswipe in construction zone'];
const MINOR_AMOUNTS = [1240, 2400, 3100, 4800, 6800, 7900];
const MATERIAL_AMOUNTS = [52400, 73800, 96400, 121500, 148000, 183200];

const pad2 = (n: number): string => String(n).padStart(2, '0');

function effDate(rand: Rand): string {
  return `${pad2(int(rand, 1, 12))}/${pad2(int(rand, 1, 28))}/2026`;
}

function isoFromEff(eff: string, day: number, time: string): string {
  const [m, , y] = eff.split('/');
  return `${y}-${m}-${pad2(day)}T${time}Z`;
}

interface Built {
  id: string;
  title: string;
  insured: string;
  taxonomyCase: TaxonomyCaseId;
  bucket: 'true_conflict' | 'hard_negative';
  synopsis: string;
  documents: SubmissionDocument[];
  focusGroup: string;
  why: string;
  expected: Record<string, 'conflict' | 'supersession' | 'benign_variant' | 'unresolved' | 'consistent'>;
}

function emailDoc(id: string, receivedAt: string, subject: string, body: string): SubmissionDocument {
  return {
    id,
    kind: 'broker_email',
    title: 'Broker submission email',
    receivedAt,
    content: `From: broker@agency.example\nTo: submissions@northstar-underwriting.example\nSubject: ${subject}\n\n${body}`,
  };
}

function appDoc(
  rand: Rand,
  id: string,
  receivedAt: string,
  insured: string,
  addr: string,
  eff: string,
  count: number,
  locations: number,
  extra: string[] = [],
): SubmissionDocument {
  return {
    id,
    kind: 'application',
    title: 'Commercial auto application (simplified)',
    receivedAt,
    content: [
      'COMMERCIAL AUTO APPLICATION (simplified worksheet - not an ACORD form)',
      '',
      `NAMED INSURED: ${insured}`,
      `FEIN: 48-0771${100 + Math.floor(rand() * 900)} (fictional)`,
      `MAILING ADDRESS: ${addr}`,
      `YEARS IN BUSINESS: ${4 + Math.floor(rand() * 25)}`,
      `RADIUS OF OPERATION: ${pick(rand, [150, 350, 500])} miles`,
      `COMMODITY HAULED: ${pick(rand, COMMODITIES)}`,
      '',
      `PROPOSED EFFECTIVE DATE: ${eff}`,
      `NUMBER OF POWER UNITS: ${count}`,
      'LIABILITY LIMIT (CSL): $1,000,000',
      `GARAGING LOCATIONS: ${locations}`,
      ...extra,
    ].join('\n'),
  };
}

const SCHEDULE_HEADER = [
  'Unit | Year | Make/Model              | VIN               | Garaging Address                       | Stated Value',
  '-----+------+-------------------------+-------------------+----------------------------------------+-------------',
].join('\n');

interface SchedRow {
  n: number;
  year: number;
  make: string;
  vin: string;
  addr: string;
  value: number;
}

function schedRow(r: SchedRow): string {
  return `${r.n} | ${r.year} | ${r.make} | ${r.vin} | ${r.addr} | ${money(r.value)}`;
}

function scheduleDoc(
  id: string,
  receivedAt: string,
  insured: string,
  rows: SchedRow[],
  activeOnly = false,
): SubmissionDocument {
  return {
    id,
    kind: 'vehicle_schedule',
    title: activeOnly ? 'Schedule of vehicles (active units)' : 'Schedule of vehicles',
    receivedAt,
    content: [
      `${insured.toUpperCase()} - SCHEDULE OF VEHICLES${activeOnly ? ' (ACTIVE)' : ''}`,
      'Prepared 05/01/2026',
      '',
      SCHEDULE_HEADER,
      ...rows.map(schedRow),
    ].join('\n'),
  };
}

function lossDoc(
  id: string,
  receivedAt: string,
  insured: string,
  prefix: string,
  rows: Array<{ no: number; date: string; cause: string; status: 'Closed' | 'Open'; amount: number }>,
): SubmissionDocument {
  return {
    id,
    kind: 'loss_run',
    title: 'Loss run 2023-2026',
    receivedAt,
    content: [
      `LOSS RUN - ${insured.toUpperCase()}`,
      'Carrier: Meridian Heartland Insurance (fictional)',
      'Policy period 08/01/2023 - 08/01/2026   Valued 04/30/2026',
      '',
      'Claim No | Date of Loss | Cause                              | Status | Incurred',
      '---------+--------------+------------------------------------+--------+----------',
      ...rows.map(
        (r) => `${prefix}-${r.no} | ${r.date} | ${r.cause} | ${r.status} | ${money(r.amount)}`,
      ),
    ].join('\n'),
  };
}

function addressOf(rand: Rand): string {
  return `${int(rand, 1000, 9900)} ${pick(rand, STREETS)} ${pick(rand, ['St', 'Ave'])}, ${pick(rand, PLACES)}`;
}

function insuredName(rand: Rand): string {
  return `${pick(rand, NAME_A)} ${pick(rand, NAME_B)} ${pick(rand, ['LLC', 'Inc'])}`;
}

function common(rand: Rand, seedDay: number): {
  insured: string;
  broker: string;
  agency: string;
  addr: string;
  eff: string;
  received: string;
} {
  const insured = insuredName(rand);
  const eff = effDate(rand);
  return {
    insured,
    broker: pick(rand, BROKERS),
    agency: pick(rand, AGENCIES),
    addr: addressOf(rand),
    eff,
    received: isoFromEff(eff, seedDay, '15:18:00'),
  };
}

function rowsForCount(rand: Rand, addr: string, n: number): { rows: SchedRow[]; vins: string[] } {
  const vins = vinPool(rand, n);
  const rows: SchedRow[] = [];
  for (let i = 1; i <= n; i += 1) {
    rows.push({
      n: i,
      year: int(rand, 2015, 2023),
      make: pick(rand, MAKES),
      vin: vins[i - 1],
      addr,
      value: int(rand, 12, 38) * 5000,
    });
  }
  return { rows, vins };
}

// --- case builders -----------------------------------------------------------

function case1(rand: Rand, id: string): Built {
  const c = common(rand, 10);
  const n = int(rand, 8, 13);
  const vins = vinPool(rand, n);
  const dup = vins[0];
  const a = int(rand, 1, n - 1);
  const b = int(rand, a + 1, n);
  const rows: SchedRow[] = [];
  for (let i = 1; i <= n; i += 1) {
    rows.push({
      n: i,
      year: int(rand, 2015, 2023),
      make: pick(rand, MAKES),
      vin: i === a || i === b ? dup : vins[i - 1],
      addr: c.addr,
      value: int(rand, 12, 38) * 5000,
    });
  }
  rows[a - 1].value = 131000;
  rows[b - 1].value = 89750;
  return {
    id,
    title: `Held-out: one VIN on two different trucks (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 1,
    bucket: 'true_conflict',
    synopsis: `VIN ${dup} is carried on units ${a} and ${b} at different values.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 10, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of ${c.addr.split(',')[1]?.trim() ?? 'Tulsa OK'}.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 10, '15:19:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 10, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::vin_uniqueness',
    why: `VIN ${dup} appears on two units with different stated values; one of the two readings is wrong.`,
    expected: {
      'policy::vin_uniqueness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case2(rand: Rand, id: string): Built {
  const c = common(rand, 11);
  const n = int(rand, 8, 13);
  const m = n + int(rand, 1, 2);
  const { rows } = rowsForCount(rand, c.addr, m);
  return {
    id,
    title: `Held-out: ${n} stated vs ${m} scheduled rows (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 2,
    bucket: 'true_conflict',
    synopsis: `Email and application say ${n} trucks; the schedule carries ${m} rows.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 11, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 11, '15:19:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 11, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::vehicle_count_reconciliation',
    why: `No single document contradicts itself; the finding exists only in the arithmetic between stated ${n} and ${m} rows.`,
    expected: {
      'policy::vehicle_count_reconciliation': 'conflict',
      'policy::stated_vehicle_count': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case3(rand: Rand, id: string): Built {
  const c = common(rand, 12);
  const n = int(rand, 6, 10);
  const { rows } = rowsForCount(rand, c.addr, n);
  // The narrative parser needs plural "losses"/"claims" and a both|all minor
  // qualifier — singular phrasing would test the generator's prose, not the
  // engine, so the count varies only between two and three.
  const summaryCount = int(rand, 2, 3);
  const summaryWord = summaryCount === 2 ? 'two' : 'three';
  const qualifier = summaryCount === 2 ? 'both minor' : 'all minor';
  const minors = [];
  for (let i = 0; i < summaryCount; i += 1) {
    minors.push({ no: 70000 + int(rand, 100, 9999), date: `0${int(rand, 1, 9)}/${pad2(int(rand, 10, 28))}/2024`, cause: pick(rand, CAUSES), status: 'Closed' as const, amount: pick(rand, MINOR_AMOUNTS) });
  }
  const prefix = c.insured.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const material = [
    { no: 80000 + int(rand, 100, 9999), date: `07/${pad2(int(rand, 10, 28))}/2024`, cause: 'Intersection collision, bodily injury', status: 'Closed' as const, amount: pick(rand, MATERIAL_AMOUNTS) },
    { no: 90000 + int(rand, 100, 9999), date: `01/${pad2(int(rand, 10, 28))}/2026`, cause: 'Jackknife on ice, two vehicles', status: 'Open' as const, amount: pick(rand, MATERIAL_AMOUNTS) },
  ];
  const summary = `${summaryWord} losses in the past three years, ${qualifier}`;
  return {
    id,
    title: `Held-out: loss summary omits material claims (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 3,
    bucket: 'true_conflict',
    synopsis: `Email claims ${summary}; the run carries ${minors.length + 2} claims including an open six-figure loss.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 12, '12:55:00'), `${c.insured} - ${n} units`, `${c.insured} for ${c.eff}. ${n} power units, regional lanes.\n\nThey have had ${summary}. Owner is hands on with driver selection.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 12, '12:56:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 12, '12:56:00'), c.insured, rows),
      lossDoc(`${id}-D4`, isoFromEff(c.eff, 12, '12:57:00'), c.insured, prefix, [...minors, ...material]),
    ],
    focusGroup: 'policy::loss_history_completeness',
    why: `The narrative understates both the count and the severity against a run with an open ${money(material[1].amount)} claim.`,
    expected: {
      'policy::loss_history_completeness': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case4(rand: Rand, id: string): Built {
  const c = common(rand, 13);
  // A different month and day, still 2026 — unmistakably a disagreement.
  const eff2 = c.eff.startsWith('06') ? c.eff.replace('06', '07') : c.eff.replace(/^(\d\d)/, '06');
  const n = int(rand, 8, 13);
  const { rows } = rowsForCount(rand, c.addr, n);
  return {
    id,
    title: `Held-out: ${c.eff} vs ${eff2} effective dates (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 4,
    bucket: 'true_conflict',
    synopsis: `Email binds ${c.eff}; the application binds ${eff2}.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 13, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 13, '15:19:00'), c.insured, c.addr, eff2, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 13, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::effective_date',
    why: `Two binding inception dates ${c.eff} and ${eff2} with nothing reconciling them.`,
    expected: {
      'policy::effective_date': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
    },
  };
}

function case5(rand: Rand, id: string): Built {
  const c = common(rand, 14);
  const n = int(rand, 6, 10);
  const { rows } = rowsForCount(rand, c.addr, n);
  const sum = rows.reduce((s, r) => s + r.value, 0);
  const total = sum + int(rand, 3, 24) * 5000;
  return {
    id,
    title: `Held-out: stated total exceeds the schedule sum (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 5,
    bucket: 'true_conflict',
    synopsis: `Application states ${money(total)}; the rows sum to ${money(sum)}.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 14, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 14, '15:19:00'), c.insured, c.addr, c.eff, n, 1, [
        `TOTAL SCHEDULED VALUE: ${money(total)}`,
      ]),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 14, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::scheduled_value_reconciliation',
    why: `The stated total ${money(total)} does not equal the row sum ${money(sum)}; cross-document arithmetic only.`,
    expected: {
      'policy::scheduled_value_reconciliation': 'conflict',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case6(rand: Rand, id: string): Built {
  const c = common(rand, 15);
  const n = int(rand, 10, 13);
  const m = n + 1;
  const { rows } = rowsForCount(rand, c.addr, n);
  const addedVin = makeVin(rand);
  const addedValue = int(rand, 30, 40) * 5000;
  const addedMake = `${int(rand, 2021, 2024)} ${pick(rand, MAKES)}`;
  const [em, , ey] = c.eff.split('/');
  const endoEff = `${em}/15/${ey}`;
  const endorsement: SubmissionDocument = {
    id: `${id}-D4`,
    kind: 'endorsement_email',
    title: 'Endorsement request - add one unit',
    receivedAt: isoFromEff(c.eff, 19, '18:44:00'),
    content: [
      'From: broker@agency.example',
      'To: submissions@northstar-underwriting.example',
      `Subject: RE: ${c.insured} - endorsement request, add one unit`,
      '',
      'Following up on the submission from earlier this month.',
      '',
      'The insured took delivery of a new tractor last week. Please ADD the following',
      `unit to the schedule effective ${endoEff}:`,
      '',
      `  Unit ${m} | ${addedMake} | VIN ${addedVin}`,
      `  Garaged at ${c.addr}`,
      `  Stated value ${money(addedValue)}`,
      '',
      `This brings the fleet to ${m} power units. Everything else on the submission is`,
      'unchanged. Please confirm the additional premium when you quote.',
    ].join('\n'),
  };
  return {
    id,
    title: `Held-out: endorsement adds unit ${m} to a ${n}-unit submission (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 6,
    bucket: 'hard_negative',
    synopsis: `Fleet goes ${n} -> ${m} because a later endorsement explicitly adds a unit.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 15, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 15, '15:19:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 15, '15:19:00'), c.insured, rows),
      endorsement,
    ],
    focusGroup: 'policy::stated_vehicle_count',
    why: `Both counts are right at their own moment; the endorsement says ADD, names the unit, and gives an effective date.`,
    expected: {
      'policy::stated_vehicle_count': 'supersession',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case7(rand: Rand, id: string): Built {
  const c = common(rand, 16);
  const n = int(rand, 6, 10);
  const num = int(rand, 1000, 9900);
  const street = pick(rand, STREETS);
  const place = pick(rand, PLACES);
  const addrA = `${num} ${street} St, ${place}`;
  const addrB = `${num} ${street} Ave, ${place}`;
  const b = int(rand, 2, n);
  const vins = vinPool(rand, n);
  const rows: SchedRow[] = [];
  for (let i = 1; i <= n; i += 1) {
    rows.push({
      n: i,
      year: int(rand, 2015, 2023),
      make: pick(rand, MAKES),
      vin: vins[i - 1],
      addr: i === b ? addrB : addrA,
      value: int(rand, 12, 38) * 5000,
    });
  }
  return {
    id,
    title: `Held-out: ${num} ${street} St vs ${num} ${street} Ave (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 7,
    bucket: 'hard_negative',
    synopsis: `Two units on the same street with different suffixes — two yards, not a duplicate.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 16, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units across two yards.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 16, '15:19:00'), c.insured, addrA, c.eff, n, 2),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 16, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::location_roster',
    why: `Same number and street, different suffixes — textually near, canonically distinct yards.`,
    expected: {
      'policy::location_roster': 'benign_variant',
      'policy::location_count_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case8(rand: Rand, id: string): Built {
  const c = common(rand, 17);
  const n = 8;
  const total = (11 + int(rand, 0, 28)) * 100000;
  const shorthand = `$${(total / 1000000).toFixed(1)}M`;
  const values: number[] = [];
  let guard = 0;
  let last = 0;
  do {
    values.length = 0;
    let sum = 0;
    for (let i = 0; i < n - 1; i += 1) {
      const v = int(rand, 100, 260) * 1000;
      values.push(v);
      sum += v;
    }
    last = total - sum;
    guard += 1;
  } while ((last < 80000 || last > 300000) && guard < 50);
  const vins = vinPool(rand, n);
  const rows: SchedRow[] = values.concat([last]).map((value, i) => ({
    n: i + 1,
    year: int(rand, 2015, 2023),
    make: pick(rand, MAKES),
    vin: vins[i],
    addr: c.addr,
    value,
  }));
  return {
    id,
    title: `Held-out: ${shorthand} vs ${money(total)} (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 8,
    bucket: 'hard_negative',
    synopsis: `Email writes ${shorthand}; the application writes ${money(total)}; the rows sum to it exactly.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 17, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. Physical damage on all units, total insured value of ${shorthand} on the equipment.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 17, '15:19:00'), c.insured, c.addr, c.eff, n, 1, [
        `TOTAL SCHEDULED VALUE: ${money(total)}`,
      ]),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 17, '15:19:00'), c.insured, rows),
    ],
    focusGroup: 'policy::total_scheduled_value',
    why: `${shorthand} and ${money(total)} are the same figure in two notations, confirmed by the row sum.`,
    expected: {
      'policy::total_scheduled_value': 'benign_variant',
      'policy::scheduled_value_reconciliation': 'consistent',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case9(rand: Rand, id: string): Built {
  const c = common(rand, 18);
  const n = int(rand, 9, 12);
  const k = int(rand, 5, Math.min(11, n));
  const { rows } = rowsForCount(rand, c.addr, n);
  // The true VIN must offer at least two 1/0 glyphs to misread.
  let base = rows[k - 1].vin;
  let guard = 0;
  while ([...base].filter((ch) => ch === '1' || ch === '0').length < 2 && guard < 50) {
    base = makeVin(rand);
    guard += 1;
  }
  rows[k - 1].vin = base;
  const eligible = [...base].map((ch, i) => ({ ch, i })).filter(({ ch }) => ch === '1' || ch === '0');
  const chars = [...base];
  let substituted = 0;
  for (const { ch, i } of eligible) {
    if (rand() < 0.6 || substituted === 0 && i === eligible[eligible.length - 1].i) {
      chars[i] = ch === '1' ? 'I' : 'O';
      substituted += 1;
    }
  }
  const scanned = chars.join('');
  const scannedDoc: SubmissionDocument = {
    id: `${id}-D4`,
    kind: 'scanned_addendum',
    title: 'Re-scanned schedule page',
    receivedAt: isoFromEff(c.eff, 19, '19:12:00'),
    content: [
      `SCANNED PAGE RE-TRANSMISSION - ${c.insured.toUpperCase()}`,
      'Resent at underwriter request (original fax illegible)',
      'Source: flatbed scan of broker hard copy',
      '',
      'Unit | Year | Make/Model      | VlN               | Garaging Address              | Stated Value',
      '-----+------+-----------------+-------------------+-------------------------------+-------------',
      `${k} | ${rows[k - 1].year} | ${rows[k - 1].make} | ${scanned} | ${c.addr} | ${money(rows[k - 1].value)}`,
      '',
      '(Re-sent for legibility only. No change to the schedule.)',
    ].join('\n'),
  };
  return {
    id,
    title: `Held-out: re-scanned VIN on unit ${k} (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 9,
    bucket: 'hard_negative',
    synopsis: `Unit ${k} reads ${scanned} on a re-scan; I and O are illegal in VINs, so it is the same vehicle.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 18, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 18, '15:19:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 18, '15:19:00'), c.insured, rows),
      scannedDoc,
    ],
    focusGroup: `vehicle:unit-${k}::vin`,
    why: `I, O and Q are not valid VIN characters, so ${scanned} has exactly one legal reading and it is already on the schedule.`,
    expected: {
      [`vehicle:unit-${k}::vin`]: 'benign_variant',
      'policy::vehicle_count_reconciliation': 'consistent',
      'policy::vin_uniqueness': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

function case10(rand: Rand, id: string): Built {
  const c = common(rand, 19);
  const n = int(rand, 12, 15);
  const k = int(rand, 2, n - 1);
  const vins = vinPool(rand, n);
  const units: SchedRow[] = [];
  for (let i = 1; i <= n; i += 1) {
    units.push({
      n: i,
      year: int(rand, 2015, 2023),
      make: pick(rand, MAKES),
      vin: vins[i - 1],
      addr: c.addr,
      value: int(rand, 12, 38) * 5000,
    });
  }
  const missing = units[k - 1];
  const note: SubmissionDocument = {
    id: `${id}-D4`,
    kind: 'adjuster_note',
    title: 'Loss control field note - yard visit',
    receivedAt: isoFromEff(c.eff, 21, '22:05:00'),
    content: [
      `LOSS CONTROL FIELD NOTE - ${c.insured.toUpperCase()}`,
      'Prepared by: field representative',
      'Yard visit completed. Maintenance program is organised and records are current.',
      '',
      `Fleet as presented by the insured is ${n} power units.`,
      '',
      `Unit ${k} (${missing.year} ${missing.make}, VIN ${missing.vin}) has been OUT OF SERVICE`,
      'since last month pending an engine replacement, and has been removed from the',
      "active vehicle schedule at the insured's request. The owner expects it back in",
      'service next quarter and will endorse it back onto the policy at that time.',
    ].join('\n'),
  };
  return {
    id,
    title: `Held-out: unit ${k} out of service explains the short schedule (${c.insured})`,
    insured: c.insured,
    taxonomyCase: 10,
    bucket: 'hard_negative',
    synopsis: `Stated ${n} units vs ${n - 1} scheduled rows, reconciled by a field note recording unit ${k} out of service.`,
    documents: [
      emailDoc(`${id}-D1`, isoFromEff(c.eff, 19, '15:18:00'), `${c.insured} - ${n} power units`, `${c.insured} for a ${c.eff} effective date. They run ${n} power units out of the home yard. Loss control is scheduling a yard visit.`),
      appDoc(rand, `${id}-D2`, isoFromEff(c.eff, 19, '15:19:00'), c.insured, c.addr, c.eff, n, 1),
      scheduleDoc(`${id}-D3`, isoFromEff(c.eff, 19, '15:19:00'), c.insured, units.filter((u) => u.n !== k), true),
      note,
    ],
    focusGroup: 'policy::vehicle_count_reconciliation',
    why: `The one-unit gap is fully explained: the note names unit ${k}, gives its VIN, and states it was deliberately removed from the active schedule.`,
    expected: {
      'policy::vehicle_count_reconciliation': 'benign_variant',
      'policy::stated_vehicle_count': 'consistent',
      'policy::effective_date': 'consistent',
    },
  };
}

// --- assembly ------------------------------------------------------------------

const BUILDERS: Array<(rand: Rand, id: string) => Built> = [
  case1, case2, case3, case4, case5, case6, case7, case8, case9, case10,
];

export const HELDOUT_VARIANTS_PER_CASE = 6;

/** Sixty packets: six value-variants per taxonomy case, deterministic by seed. */
export function buildHeldout(): Packet[] {
  const packets: Packet[] = [];
  for (let c = 1; c <= 10; c += 1) {
    for (let v = 1; v <= HELDOUT_VARIANTS_PER_CASE; v += 1) {
      const rand = mulberry32(c * 1000 + v);
      const built = BUILDERS[c - 1](rand, `HO-${c}${v}`);
      packets.push({
        id: built.id,
        title: built.title,
        insured: built.insured,
        taxonomyCase: c as TaxonomyCaseId,
        bucket: built.bucket,
        synopsis: built.synopsis,
        documents: built.documents,
        groundTruth: { focusGroup: built.focusGroup, why: built.why, expected: built.expected },
      });
    }
  }
  return packets;
}

export const HELDOUT: Packet[] = buildHeldout();
