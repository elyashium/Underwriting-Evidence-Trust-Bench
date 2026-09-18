import Link from 'next/link';

import { pct, pctWithCount, type Scorecard } from '@/lib/score';
import type { Classification } from '@/lib/types';

import { bench } from '../bench';
import { CalibrationChart } from '../components/CalibrationChart';
import { Badge, Bucket, Metric, PageHead, classificationLabel } from '../components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Scorecard' };

const CLASSES: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
  'consistent',
];

/** Side-by-side row in the ablation table. */
function AblationRow({
  label,
  reference,
  baseline,
  lowerIsBetter = false,
}: {
  label: string;
  reference: string;
  baseline: string;
  lowerIsBetter?: boolean;
}) {
  return (
    <tr>
      <td>
        {label}
        {lowerIsBetter ? <span className="faint small"> (lower is better)</span> : null}
      </td>
      <td className="num mono">{reference}</td>
      <td className="num mono">{baseline}</td>
    </tr>
  );
}

function DeltaList({
  title,
  blurb,
  items,
  tone,
}: {
  title: string;
  blurb: string;
  items: string[];
  tone: 'pass' | 'fail';
}) {
  return (
    <div className="card">
      <div className="eyebrow">{title}</div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        {blurb}
      </p>
      {items.length === 0 ? (
        <p className="faint small" style={{ margin: 0 }}>
          none
        </p>
      ) : (
        <ul className="list-plain small">
          {items.map((item) => (
            <li key={item} className={tone}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScorecardPage() {
  const { reference, baseline, comparison } = bench();

  return (
    <>
      <PageHead
        eyebrow={`${reference.engineLabel} · ${reference.packets} synthetic packets · ${reference.groupsEvaluated} graded decisions`}
        title="Scorecard"
      >
        <p>
          Every number here is computed from the same table of graded rows, and every
          number links to the subset of that table it came from. Nothing is averaged over
          anything you cannot go and count.
        </p>
      </PageHead>

      <div className="metrics">
        <Metric
          headline
          label="False positives on clean packets"
          value={pct(reference.hardNegativePacketFpr)}
          sub={`${reference.hardNegativePacketFpr.n} of ${reference.hardNegativePacketFpr.of} hard-negative packets flagged`}
          href="/scorecard/rows?outcome=false_conflict"
        />
        <Metric
          label="Real conflicts reaching a reviewer"
          value={pct(reference.conflictRecall)}
          sub={pctWithCount(reference.conflictRecall)}
          href="/scorecard/rows?expected=conflict"
        />
        <Metric
          label="Hand-authored labels reproduced"
          value={pct(reference.labelAccuracy)}
          sub={pctWithCount(reference.labelAccuracy)}
          href="/scorecard/rows?declared=1"
        />
        <Metric
          label="Review load"
          value={reference.reviewLoad.toFixed(2)}
          sub="items per packet that would land in a queue"
          href="/scorecard/rows"
        />
      </div>

      <div className="metrics">
        <Metric
          label="Per-decision false-positive rate"
          value={pct(reference.hardNegativeGroupFpr)}
          sub={`${reference.hardNegativeGroupFpr.n} of ${reference.hardNegativeGroupFpr.of} decisions inside clean packets`}
          href="/scorecard/rows?bucket=hard_negative"
        />
        <Metric
          label="Packets where a conflict was caught"
          value={pct(reference.conflictPacketRecall)}
          sub={pctWithCount(reference.conflictPacketRecall)}
          href="/scorecard/rows?bucket=true_conflict"
        />
        <Metric
          label="Findings on undeclared groups"
          value={pct(reference.noiseRate)}
          sub={`${reference.noiseRate.n} of ${reference.noiseRate.of} undeclared groups drew a finding`}
          href="/scorecard/rows?outcome=noise"
        />
        <Metric
          label="Declared findings dropped"
          value={pct(reference.dropRate)}
          sub={`${reference.dropRate.n} of ${reference.dropRate.of} declared findings went unreported`}
          href="/scorecard/rows?outcome=dropped"
        />
      </div>

      <p className="note">
        Sixteen packets. A single flipped finding moves most of these rates by several
        points, and the corpus was written by the same person who wrote the rules — which
        bounds what any of it can mean. The per-case table below is the more useful read:
        it says which behaviours are present, and a missing behaviour is a fact about the
        engine rather than an artefact of the sample size.
      </p>

      <section className="section">
        <h2>By taxonomy case</h2>
        <p>
          A case passes only when the engine reproduced every hand-authored label for its
          packets and reported nothing that was not authored. There is no partial credit:
          each case names one capability, and the question is whether the engine has it.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>case</th>
              <th className="num">labels right</th>
              <th className="num">caught</th>
              <th className="num">missed</th>
              <th className="num">false</th>
              <th className="num">noise</th>
              <th style={{ width: 60 }}>result</th>
            </tr>
          </thead>
          <tbody>
            {reference.byCase.map((row) => (
              <tr key={row.taxonomyCase.id}>
                <td className="mono">{row.taxonomyCase.id}</td>
                <td>
                  <strong>{row.taxonomyCase.name}</strong>
                  <br />
                  <Bucket of={row.taxonomyCase.bucket} />{' '}
                  <span className="faint small mono">{row.packets.join(', ')}</span>
                </td>
                <td className="num mono">
                  {row.declaredCorrect}/{row.declared}
                </td>
                <td className="num mono">{row.conflictsCaught}</td>
                <td className={`num mono ${row.conflictsMissed ? 'fail' : ''}`}>
                  {row.conflictsMissed}
                </td>
                <td className={`num mono ${row.falseConflicts ? 'fail' : ''}`}>
                  {row.falseConflicts}
                </td>
                <td className={`num mono ${row.noise ? 'fail' : ''}`}>{row.noise}</td>
                <td className={row.passed ? 'pass' : 'fail'}>
                  {row.passed ? 'pass' : 'fail'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section" id="ablation">
        <h2>Ablation: what the two cross-document capabilities buy</h2>
        <p>
          The baseline engine reads the same documents with the same extractor and groups
          the facts with the same linker. Exactly two things are removed: temporal
          supersession gating, and domain-aware normalisation. Everything else is held
          constant, so the difference between these two columns is attributable to those
          two capabilities rather than to a better parser or a larger model.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>metric</th>
              <th className="num" style={{ width: 150 }}>
                reference
              </th>
              <th className="num" style={{ width: 150 }}>
                baseline
              </th>
            </tr>
          </thead>
          <tbody>
            <AblationRow
              label="false positives, clean packets"
              lowerIsBetter
              reference={pctWithCount(reference.hardNegativePacketFpr)}
              baseline={pctWithCount(baseline.hardNegativePacketFpr)}
            />
            <AblationRow
              label="false conflicts, all packets"
              lowerIsBetter
              reference={pctWithCount(reference.falseConflictRate)}
              baseline={pctWithCount(baseline.falseConflictRate)}
            />
            <AblationRow
              label="conflicts caught"
              reference={pctWithCount(reference.conflictRecall)}
              baseline={pctWithCount(baseline.conflictRecall)}
            />
            <AblationRow
              label="hand-authored labels reproduced"
              reference={pctWithCount(reference.labelAccuracy)}
              baseline={pctWithCount(baseline.labelAccuracy)}
            />
            <AblationRow
              label="findings on undeclared groups"
              lowerIsBetter
              reference={pctWithCount(reference.noiseRate)}
              baseline={pctWithCount(baseline.noiseRate)}
            />
            <AblationRow
              label="items per packet reaching a queue"
              lowerIsBetter
              reference={reference.reviewLoad.toFixed(2)}
              baseline={baseline.reviewLoad.toFixed(2)}
            />
          </tbody>
        </table>

        <div className="compare" style={{ marginTop: 14 }}>
          <DeltaList
            title="Caught only by the reference engine"
            blurb="Real conflicts that survived raw-string comparison because the disagreement is not visible between two strings."
            items={comparison.onlyReferenceCaught}
            tone="pass"
          />
          <DeltaList
            title="False alarms the reference engine avoids"
            blurb="Hard negatives the baseline flagged. Each one is an email to a broker about a discrepancy that is not there."
            items={comparison.falseConflictsAvoided}
            tone="pass"
          />
        </div>
        <div className="compare" style={{ marginTop: 12 }}>
          <DeltaList
            title="Caught only by the baseline"
            blurb="Conflicts the extra rules talked the engine out of. This list being non-empty is the cost of the gating, stated rather than hidden."
            items={comparison.onlyBaselineCaught}
            tone="fail"
          />
          <DeltaList
            title="False alarms the reference engine introduces"
            blurb="Hard negatives only the reference engine fires on — a rule doing harm the simpler engine avoided."
            items={comparison.falseConflictsIntroduced}
            tone="fail"
          />
        </div>

        <p className="note">
          Both engines are my own construction. The baseline exists to isolate a
          capability, not to stand in for anybody else&rsquo;s system, and the delta above
          is not a comparison with any product.
        </p>
      </section>

      <section className="section" id="calibration">
        <h2>Calibration</h2>
        <p>
          A confidence score is a claim about a frequency. If the pipeline says 0.9 on a
          hundred findings, roughly ninety of them should be right, and the reliability
          diagram is the only way to check that without taking the number on faith. The
          failure that matters is over-confidence — dots below the diagonal, printed in
          red — because a reviewer who learns that 0.9 means 0.6 stops reading the number
          at all.
        </p>
        <div className="compare" style={{ marginTop: 14 }}>
          <div className="card">
            <CalibrationChart
              calibration={reference.calibration}
              title="Against the hand-authored labels"
            />
          </div>
          <div className="card">
            <CalibrationChart
              calibration={reference.human.calibration}
              title="Against reviewer verdicts"
            />
          </div>
        </div>
        <p className="note">
          Two charts because they answer different questions. The left one asks whether the
          confidence tracks the labels I wrote; the right one asks whether it tracks what a
          human actually did with the finding. The second is the one that would matter in
          production, and it is empty until somebody reviews something.
        </p>
      </section>

      <HumanSection card={reference} />

      <section className="section">
        <h2>Confusion</h2>
        <p>
          Rows are the hand-authored label, columns are what the engine said. The diagonal
          is agreement; the column under <em>conflict</em> off the diagonal is the
          expensive error, and the <em>consistent</em> column off the diagonal is a finding
          the engine dropped.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 130 }}>authored ↓ / said →</th>
              {CLASSES.map((c) => (
                <th key={c} className="num">
                  {classificationLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((expected) => (
              <tr key={expected}>
                <td>
                  <Badge of={expected} />
                </td>
                {CLASSES.map((predicted) => {
                  const n = reference.confusion[expected][predicted];
                  const diagonal = expected === predicted;
                  const costly = !diagonal && predicted === 'conflict';
                  return (
                    <td
                      key={predicted}
                      className={`num mono ${n === 0 ? 'faint' : costly ? 'fail' : diagonal ? 'pass' : ''}`}
                    >
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2>By packet</h2>
        <p>
          A packet passes when every declared label came back exactly and nothing
          undeclared was reported.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 74 }}>packet</th>
              <th>title</th>
              <th className="num">labels</th>
              <th className="num">caught</th>
              <th className="num">missed</th>
              <th className="num">false</th>
              <th className="num">noise</th>
              <th style={{ width: 56 }}>result</th>
            </tr>
          </thead>
          <tbody>
            {reference.byPacket.map((row) => (
              <tr key={row.packetId}>
                <td className="mono">
                  <Link href={`/packets/${row.packetId}`}>{row.packetId}</Link>
                </td>
                <td>
                  {row.title}
                  <br />
                  <Bucket of={row.bucket} />
                </td>
                <td className="num mono">
                  {row.declaredCorrect}/{row.declared}
                </td>
                <td className="num mono">{row.conflictsCaught}</td>
                <td className={`num mono ${row.conflictsMissed ? 'fail' : ''}`}>
                  {row.conflictsMissed}
                </td>
                <td className={`num mono ${row.falseConflicts ? 'fail' : ''}`}>
                  {row.falseConflicts}
                </td>
                <td className={`num mono ${row.noise ? 'fail' : ''}`}>{row.noise}</td>
                <td className={row.passed ? 'pass' : 'fail'}>
                  {row.passed ? 'pass' : 'fail'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          <Link href="/scorecard/rows">
            Every graded row, unaggregated ({reference.graded.length} of them) →
          </Link>
        </p>
      </section>
    </>
  );
}

function HumanSection({ card }: { card: Scorecard }) {
  const { human } = card;

  return (
    <section className="section" id="human">
      <h2>What reviewers did with it</h2>
      {human.decisions === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No verdicts recorded yet. Open a packet, decide whether the pipeline got it
            right, and the numbers here start filling in. They start empty on purpose:
            an agreement rate with nobody behind it would be the most misleading figure on
            the page.
          </p>
        </div>
      ) : (
        <>
          <div className="metrics">
            <Metric
              label="Reviewer agreed with the pipeline"
              value={pct(human.agreementRate)}
              sub={`${human.accepted} accepted, ${human.rejected} rejected`}
            />
            <Metric
              label="Verdicts recorded"
              value={human.decisions}
              sub={`${human.unresolved} marked can't tell`}
            />
            <Metric
              label="Reviewer and label disagree"
              value={human.disputed.length}
              sub="cases worth re-reading — one of the two is wrong"
            />
          </div>
          <p className="note">
            A reviewer marking something <em>can&rsquo;t tell</em> is not a vote against
            the pipeline; it says the packet did not give them enough to decide. Those are
            counted and shown, but kept out of the agreement denominator rather than
            quietly scored as disagreement.
          </p>

          {human.disputed.length > 0 ? (
            <>
              <h3 style={{ marginTop: 18 }}>Disputed</h3>
              <p className="small muted">
                The reviewer and the hand-authored label point in opposite directions. Both
                are fallible: either the engine is wrong in a way the label missed, or the
                label is wrong and needs rewriting. These are the rows where the corpus
                learns something.
              </p>
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th style={{ width: 74 }}>packet</th>
                    <th>finding</th>
                    <th style={{ width: 110 }}>pipeline</th>
                    <th style={{ width: 110 }}>authored</th>
                    <th style={{ width: 80 }}>verdict</th>
                    <th>reason given</th>
                  </tr>
                </thead>
                <tbody>
                  {human.disputed.map((item) => (
                    <tr key={`${item.packetId}::${item.groupKey}`}>
                      <td className="mono">
                        <Link href={`/packets/${item.packetId}`}>{item.packetId}</Link>
                      </td>
                      <td>{item.label}</td>
                      <td>
                        <Badge of={item.pipelineClassification} />
                      </td>
                      <td>
                        <Badge of={item.groundTruth} />
                      </td>
                      <td className="mono small">{item.verdict}</td>
                      <td className="small muted">
                        {item.reason}
                        <br />
                        <span className="faint">— {item.reviewer}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
