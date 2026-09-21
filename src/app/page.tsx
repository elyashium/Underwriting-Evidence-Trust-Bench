import Link from 'next/link';

import { pct, pctWithCount } from '@/lib/score';

import { bench } from './bench';
import { Metric } from './components/ui';

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
      <header className="hero">
        <div className="eyebrow">Evaluation harness · synthetic corpus</div>
        <h1 className="hero-title">
          The hard part is not catching contradictions. It is not inventing them.
        </h1>
        <p className="lede">
          A cross-document reconciliation pipeline for commercial-auto submissions, and
          the harness that grades it. {packets.length} synthetic submission packets, half
          of them containing a real contradiction and half containing something that only
          looks like one, each with a hand-authored label for every finding it is supposed
          to produce.
        </p>
      </header>

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
        <h2>How it works</h2>
        <p>
          Five stages, each one inspectable. Nothing is a black box, because the
          point of the tool is to check black boxes.
        </p>
        <ol className="steps">
          <li>
            <span className="n">01</span>
            <div>
              <b>Extract</b>
              <p>
                Every document is parsed into facts — insured, vehicles, locations,
                limits, losses — each carrying a character-offset citation into the
                source text it was read from.
              </p>
            </div>
          </li>
          <li>
            <span className="n">02</span>
            <div>
              <b>Link</b>
              <p>
                Facts are grouped into one evidence graph per entity and field: every
                value the packet ever asserted for it, in arrival order, with source
                and timestamp attached.
              </p>
            </div>
          </li>
          <li>
            <span className="n">03</span>
            <div>
              <b>Classify</b>
              <p>
                Each group is adjudicated as a genuine conflict, a temporal
                supersession, a benign variant, or unresolved — with the named signals
                that earned the call printed on the finding.
              </p>
            </div>
          </li>
          <li>
            <span className="n">04</span>
            <div>
              <b>Score</b>
              <p>
                Findings are graded against hand-authored labels under a two-way
                contract: every declared label must be reproduced, and nothing
                undeclared may be reported. False-positive rate first.
              </p>
            </div>
          </li>
          <li>
            <span className="n">05</span>
            <div>
              <b>Review</b>
              <p>
                A human accepts, rejects, or marks each finding unresolved with a
                reason. Reviewer agreement is scored separately — confidence is
                calibrated against people, not just against labels.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section">
        <h2>Why run this from day one</h2>
        <p>
          The corpus here is synthetic, but the contract isn&rsquo;t. The harness
          grades any packet set you point it at — including your own historical
          submissions — so a team building document AI gets, from the first week:
        </p>
        <ul className="list-plain">
          <li>
            <strong>A trust number before anyone relies on the flags.</strong> An eval
            score over adversarial cases is what lets a founder say &ldquo;our checker
            is careful&rdquo; with evidence instead of adjectives.
          </li>
          <li>
            <strong>False alarms measured, not vibes.</strong> Hard negatives are
            first-class test data, so over-flagging shows up as a rate on the
            scorecard instead of as churned users months later.
          </li>
          <li>
            <strong>Calibration instead of confidence theatre.</strong> The reliability
            diagram asks whether a 0.9 actually means 90% — the question every
            enterprise buyer&rsquo;s model-risk team will ask eventually.
          </li>
          <li>
            <strong>Ablation discipline for the roadmap.</strong> Running a simpler
            baseline beside the reference engine shows which capability earns each
            point of the score, so effort goes where the delta is.
          </li>
          <li>
            <strong>A reviewer loop that compounds.</strong> Every verdict with a reason
            becomes agreement data. The log you start on day one is the calibration
            set you need on day one hundred.
          </li>
        </ul>
        <p className="note">
          To grade your own packets, add them beside <span className="mono">src/data/packets</span> with
          ground-truth labels and run <span className="mono">npm run bench</span> — the
          two-way contract enforces the same honesty on real history as on the
          synthetic corpus. <Link href="/method">How the pipeline works →</Link>
        </p>
      </section>

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
