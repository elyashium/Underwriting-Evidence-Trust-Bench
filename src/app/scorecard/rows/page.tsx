import Link from 'next/link';

import { TAXONOMY } from '@/data/packets';
import type { GradedGroup, Outcome, Scorecard } from '@/lib/score';
import type { Classification, EngineId } from '@/lib/types';

import { bench } from '../../bench';
import { Badge, Bucket, PageHead } from '../../components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Graded rows' };

/**
 * The drill-down behind every headline on the scorecard.
 *
 * The rule this page exists to enforce: no number anywhere in this tool is
 * allowed to be unaccountable. Each metric tile links here with the filter that
 * produced it, so a reader who does not believe a rate can read the rows it was
 * computed from and count them by hand. That is a cheap property to build and a
 * hard one to retrofit, and without it a scorecard is a set of assertions.
 */

const OUTCOME_LABELS: Record<Outcome, string> = {
  conflict_caught: 'real conflict, flagged',
  conflict_missed: 'real conflict, missed',
  false_conflict: 'false conflict',
  label_correct: 'label reproduced',
  label_wrong: 'wrong non-conflict label',
  noise: 'finding on an undeclared group',
  dropped: 'declared finding not reported',
  quiet: 'nothing expected, nothing said',
};

const OUTCOME_TONE: Record<Outcome, 'pass' | 'fail' | ''> = {
  conflict_caught: 'pass',
  conflict_missed: 'fail',
  false_conflict: 'fail',
  label_correct: 'pass',
  label_wrong: 'fail',
  noise: 'fail',
  dropped: 'fail',
  quiet: '',
};

const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];

const CLASSIFICATIONS: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
  'consistent',
];

type Query = Record<string, string | string[] | undefined>;

const one = (q: Query, key: string): string | undefined => {
  const value = q[key];
  return Array.isArray(value) ? value[0] : value;
};

/** Rebuild the query string with one key set or cleared. */
function href(current: Query, key: string, value: string | undefined): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const single = Array.isArray(v) ? v[0] : v;
    if (single && k !== key) params.set(k, single);
  }
  if (value !== undefined) params.set(key, value);
  const qs = params.toString();
  return qs ? `/scorecard/rows?${qs}` : '/scorecard/rows';
}

function FilterRow({
  label,
  name,
  options,
  query,
  active,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  query: Query;
  active: string | undefined;
}) {
  return (
    <div className="row" style={{ alignItems: 'baseline', marginBottom: 6 }}>
      <span className="eyebrow" style={{ width: 92, flexShrink: 0 }}>
        {label}
      </span>
      <Link
        className="chip"
        href={href(query, name, undefined)}
        data-active={active === undefined ? 'true' : undefined}
      >
        any
      </Link>
      {options.map((option) => (
        <Link
          key={option.value}
          className="chip"
          href={href(query, name, option.value)}
          data-active={active === option.value ? 'true' : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function applyFilters(card: Scorecard, query: Query): GradedGroup[] {
  const outcome = one(query, 'outcome');
  const expected = one(query, 'expected');
  const predicted = one(query, 'predicted');
  const declared = one(query, 'declared');
  const bucket = one(query, 'bucket');
  const taxonomyCase = one(query, 'case');
  const packet = one(query, 'packet');

  return card.graded.filter((row) => {
    if (outcome && row.outcome !== outcome) return false;
    if (expected && row.expected !== expected) return false;
    if (predicted && row.predicted !== predicted) return false;
    if (declared === '1' && !row.declared) return false;
    if (declared === '0' && row.declared) return false;
    if (bucket && row.bucket !== bucket) return false;
    if (taxonomyCase && String(row.taxonomyCase) !== taxonomyCase) return false;
    if (packet && row.packetId !== packet) return false;
    return true;
  });
}

export default async function RowsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const { reference, baseline } = bench();

  const engine: EngineId = one(query, 'engine') === 'naive' ? 'naive' : 'reference';
  const card = engine === 'naive' ? baseline : reference;

  const rows = applyFilters(card, query);
  const filtered = rows.length !== card.graded.length;

  // The case filter arrives as an arbitrary string, so it is matched against the
  // taxonomy rather than cast into it.
  const caseFilter = TAXONOMY.find((c) => String(c.id) === one(query, 'case'));

  const wrong = rows.filter((r) => !r.correct).length;
  const withConfidence = rows.filter((r) => r.confidence !== null);
  const meanConfidence =
    withConfidence.length === 0
      ? null
      : withConfidence.reduce((sum, r) => sum + r.confidence!, 0) / withConfidence.length;

  return (
    <>
      <PageHead eyebrow={card.engineLabel} title="Graded rows">
        <p>
          One row per (entity, field) group that either the ground truth declared or the
          engine reported on — the table every rate on the scorecard is a count over.
          Filter it and the counts at the top recount.
        </p>
      </PageHead>

      <div className="card">
        <FilterRow
          label="engine"
          name="engine"
          query={query}
          active={one(query, 'engine') === 'naive' ? 'naive' : undefined}
          options={[{ value: 'naive', label: 'baseline' }]}
        />
        <FilterRow
          label="outcome"
          name="outcome"
          query={query}
          active={one(query, 'outcome')}
          options={OUTCOMES.map((o) => ({ value: o, label: o.replace(/_/g, ' ') }))}
        />
        <FilterRow
          label="authored"
          name="expected"
          query={query}
          active={one(query, 'expected')}
          options={CLASSIFICATIONS.map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))}
        />
        <FilterRow
          label="engine said"
          name="predicted"
          query={query}
          active={one(query, 'predicted')}
          options={CLASSIFICATIONS.map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))}
        />
        <FilterRow
          label="bucket"
          name="bucket"
          query={query}
          active={one(query, 'bucket')}
          options={[
            { value: 'true_conflict', label: 'true conflict' },
            { value: 'hard_negative', label: 'hard negative' },
          ]}
        />
        <FilterRow
          label="declared"
          name="declared"
          query={query}
          active={one(query, 'declared')}
          options={[
            { value: '1', label: 'named by ground truth' },
            { value: '0', label: 'undeclared' },
          ]}
        />
      </div>

      <div className="metrics" style={{ marginTop: 18 }}>
        <div className="metric">
          <div className="metric-label">rows shown</div>
          <div className="metric-value">{rows.length}</div>
          <div className="metric-sub">
            {filtered ? `filtered from ${card.graded.length}` : 'the whole table'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">engine matched the label</div>
          <div className="metric-value">{rows.length - wrong}</div>
          <div className="metric-sub">{wrong} did not</div>
        </div>
        <div className="metric">
          <div className="metric-label">mean confidence</div>
          <div className="metric-value">
            {meanConfidence === null ? '—' : meanConfidence.toFixed(2)}
          </div>
          <div className="metric-sub">
            over {withConfidence.length} rows that produced a finding
          </div>
        </div>
      </div>

      <section className="section">
        {rows.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No rows match. That is a real answer: an empty{' '}
              <span className="mono">false conflict</span> filter is the headline metric
              reading zero, not a broken page.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 74 }}>packet</th>
                <th>group</th>
                <th style={{ width: 106 }}>authored</th>
                <th style={{ width: 106 }}>engine said</th>
                <th className="num" style={{ width: 56 }}>
                  conf
                </th>
                <th style={{ width: 150 }}>outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.packetId}::${row.groupKey}`}>
                  <td className="mono small">
                    <Link href={`/packets/${row.packetId}`}>{row.packetId}</Link>
                    <br />
                    <span className="faint">
                      case {row.taxonomyCase}
                    </span>
                    <br />
                    <Bucket of={row.bucket} />
                  </td>
                  <td>
                    <strong>{row.label}</strong>
                    <br />
                    <span className="mono faint small">{row.groupKey}</span>
                    {row.signals.length > 0 ? (
                      <div className="signals" style={{ marginTop: 4 }}>
                        {row.signals.map((signal) => (
                          <span className="signal" key={signal}>
                            {signal}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {!row.declared ? (
                      <div className="faint small" style={{ marginTop: 4 }}>
                        undeclared — the ground truth never named this group, so anything
                        reported here is something the author did not intend
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Badge of={row.expected} />
                  </td>
                  <td>
                    <Badge of={row.predicted} />
                  </td>
                  <td className="num mono">
                    {row.confidence === null ? '—' : row.confidence.toFixed(2)}
                  </td>
                  <td className={`small ${OUTCOME_TONE[row.outcome]}`}>
                    {OUTCOME_LABELS[row.outcome]}
                    <br />
                    <span className="mono faint">{row.outcome}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {caseFilter ? (
        <p className="note">
          Case {caseFilter.id}, {caseFilter.name}: {caseFilter.tests}
        </p>
      ) : null}

      <p className="note">
        <Link href="/scorecard">← back to the scorecard</Link>
      </p>
    </>
  );
}
