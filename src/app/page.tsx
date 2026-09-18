import Link from 'next/link';

import { pct, pctWithCount } from '@/lib/score';

import { bench } from './bench';
import { Metric, PageHead } from './components/ui';

export const dynamic = 'force-dynamic';

/**
 * The landing page leads with the false-positive rate rather than with recall.
 *
 * That ordering is an argument, not a layout choice. A cross-document checker
 * that flags everything has perfect recall and is worthless, because the cost
 * it imposes — a reviewer reading a false alarm, a broker answering a question
 * about a discrepancy that was never there — is paid on every clean submission,
 * and clean submissions are most of them.
 */
export default function OverviewPage() {
  const { reference, baseline, comparison, packets } = bench();

  return (
    <>
      <PageHead
        eyebrow="Evaluation harness · synthetic corpus"
        title="Underwriting Evidence Trust Bench"
      >
        <p>
          A cross-document reconciliation pipeline for commercial-auto submissions, and
          the harness that grades it. {packets.length} synthetic submission packets, half
          of them containing a real contradiction and half containing something that only
          looks like one, each with a hand-authored label for every finding it is supposed
          to produce.
        </p>
      </PageHead>

      <div className="metrics">
        <Metric
          headline
          label="False positives on clean packets"
          value={pct(reference.hardNegativePacketFpr)}
          sub={`${reference.hardNegativePacketFpr.n} of ${reference.hardNegativePacketFpr.of} hard negatives flagged`}
          href="/scorecard/rows?outcome=false_conflict"
        />
        <Metric
          label="Real conflicts reaching a reviewer"
          value={pct(reference.conflictRecall)}
          sub={pctWithCount(reference.conflictRecall)}
          href="/scorecard/rows?expected=conflict"
        />
        <Metric
          label="Hand-authored labels reproduced exactly"
          value={pct(reference.labelAccuracy)}
          sub={pctWithCount(reference.labelAccuracy)}
          href="/scorecard/rows?declared=1"
        />
        <Metric
          label="Calibration error on its own confidence"
          value={reference.calibration.ece === null ? '—' : reference.calibration.ece.toFixed(3)}
          sub={`ECE over ${reference.calibration.count} findings`}
          href="/scorecard#calibration"
        />
      </div>

      <section className="section">
        <h2>Why false positives are the headline</h2>
        <p>
          Recall is the easy half. A checker that reports every difference between any two
          documents catches every conflict there is, and an underwriter stops reading it
          within a week — a submission legitimately contains a dozen surfaces that disagree
          on their face: a mid-stream endorsement adding a unit, a value written as $1.2M
          in an email and 1,200,000 on a form, two yards on the same street, a VIN
          re-scanned with an O where a zero belongs. Every one of those is normal. Flagging
          them is not caution, it is a tax on the broker.
        </p>
        <p>
          So half this corpus is built out of exactly those cases, and the number at the
          top left is how often the pipeline interrupts someone about a packet where
          nothing is wrong. The rest of the scorecard is only meaningful next to it.
        </p>
      </section>

      <section className="section">
        <h2>What the baseline is for</h2>
        <p>
          The same documents are also run through a deliberately simpler engine: identical
          extraction, identical evidence linking, and then raw-string comparison with no
          temporal reasoning and no domain normalisation. Holding everything else constant
          is what makes the difference attributable to those two capabilities rather than
          to a better parser.
        </p>
        <div className="compare">
          <div className="card">
            <div className="eyebrow">Baseline</div>
            <p className="small muted" style={{ marginBottom: 6 }}>
              raw-string comparison, no cross-document rules
            </p>
            <table>
              <tbody>
                <tr>
                  <td>false positives, clean packets</td>
                  <td className="num">{pctWithCount(baseline.hardNegativePacketFpr)}</td>
                </tr>
                <tr>
                  <td>conflicts caught</td>
                  <td className="num">{pctWithCount(baseline.conflictRecall)}</td>
                </tr>
                <tr>
                  <td>labels reproduced</td>
                  <td className="num">{pctWithCount(baseline.labelAccuracy)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="eyebrow">Reference engine</div>
            <p className="small muted" style={{ marginBottom: 6 }}>
              supersession gating, domain normalisation, derived reconciliation rules
            </p>
            <table>
              <tbody>
                <tr>
                  <td>false positives, clean packets</td>
                  <td className="num">{pctWithCount(reference.hardNegativePacketFpr)}</td>
                </tr>
                <tr>
                  <td>conflicts caught</td>
                  <td className="num">{pctWithCount(reference.conflictRecall)}</td>
                </tr>
                <tr>
                  <td>labels reproduced</td>
                  <td className="num">{pctWithCount(reference.labelAccuracy)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="note">
          Both engines are my own construction. The baseline is a control for an ablation,
          not a stand-in for anybody&rsquo;s product, and the delta between the two columns
          says something about two capabilities — not about the state of the art.{' '}
          <Link href="/scorecard#ablation">See which cases move.</Link>
        </p>
      </section>

      <section className="section">
        <h2>Start here</h2>
        <p>Three packets that show what the harness is actually testing.</p>
        <div className="packet-list" style={{ marginTop: 12 }}>
          <Link className="packet-row" href="/packets/PKT-003">
            <span className="id">PKT-003</span>
            <span>
              <span className="title">A conflict nobody wrote down</span>
              <span className="synopsis">
                The email and the application both say twelve trucks. The schedule carries
                thirteen rows. No single document contradicts itself, so the finding only
                exists between them — which is why it needs a rule that counts the table
                rather than one that compares fields.
              </span>
            </span>
            <span className="chip bucket-true_conflict">true conflict</span>
          </Link>
          <Link className="packet-row" href="/packets/PKT-009">
            <span className="id">PKT-009</span>
            <span>
              <span className="title">A change that is not a contradiction</span>
              <span className="synopsis">
                A later email raises the fleet count. Recency alone never resolves a
                disagreement here; the rule requires explicit change language in the
                source text, and this email has it, so the earlier value is history rather
                than an error.
              </span>
            </span>
            <span className="chip bucket-hard_negative">hard negative</span>
          </Link>
          <Link className="packet-row" href="/packets/PKT-015">
            <span className="id">PKT-015</span>
            <span>
              <span className="title">A VIN that was scanned badly</span>
              <span className="synopsis">
                A re-scanned schedule row reads I where the VIN has 1 and O where it has 0.
                Those glyphs are excluded from the VIN standard, so the misreading has
                exactly one legal resolution — and folding it before the duplicate-VIN
                check is what stops the pipeline reporting a truck that is not there.
              </span>
            </span>
            <span className="chip bucket-hard_negative">hard negative</span>
          </Link>
        </div>
      </section>

      <section className="section">
        <h2>What this is not</h2>
        <ul className="list-plain">
          <li>
            Not a benchmark of any commercial product. Nothing here was run against a
            vendor&rsquo;s system, and no number on this site should be compared to one.
          </li>
          <li>
            Not a measurement over real submissions. The corpus is {packets.length} packets
            I wrote to be hard in specific, enumerated ways, which means the scorecard
            measures the pipeline against my judgement of what is hard — not against the
            distribution of a real book.
          </li>
          <li>
            Not a statistically meaningful sample. Sixteen packets and{' '}
            {reference.groupsEvaluated} graded decisions; one flipped finding moves every
            rate on this page by several points.
          </li>
          <li>
            Not an underwriting tool. The guidelines the rules cite are inventions for this
            exercise.
          </li>
        </ul>
        <p className="note">
          {comparison.onlyReferenceCaught.length} conflicts are caught only by the
          reference engine and {comparison.falseConflictsAvoided.length} false alarms only
          by the baseline. <Link href="/method">How the pipeline works →</Link>
        </p>
      </section>
    </>
  );
}
