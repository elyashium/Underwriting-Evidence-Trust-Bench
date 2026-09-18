import Link from 'next/link';

import { GUIDELINES } from '@/lib/classify';

import { Badge, PageHead } from '../components/ui';

export const metadata = { title: 'Method' };

/**
 * The method page is the argument; the scorecard is only the evidence for it.
 *
 * Everything here is meant to be checkable against the source, so it names
 * files and rules rather than describing an architecture in the abstract.
 */
export default function MethodPage() {
  return (
    <>
      <PageHead eyebrow="How it works and what it cannot tell you" title="Method">
        <p>
          Four stages, each one auditable on its own: read the documents into facts, group
          the facts by what they are about, adjudicate each group, then run the rules whose
          questions no single group can answer. Nothing is learned, nothing is trained, and
          every number a finding carries is a sum of reasons printed next to it.
        </p>
      </PageHead>

      <section className="section">
        <h2>1 · Extraction</h2>
        <p>
          Each document is a plain-text string. The extractor parses by <em>shape</em> —
          the presence of a schedule-like table, a labelled field, a currency-shaped token
          — rather than by trusting the document&rsquo;s declared kind. A broker email
          routinely carries a quoted schedule, and a file whose header says
          &ldquo;application&rdquo; sometimes contains a loss narrative; dispatching on the
          label rather than the content means missing those.
        </p>
        <p>
          Every fact records a <span className="mono">SourceSpan</span>: the document id
          and the character offsets the value was read from. Those offsets are computed at
          extraction time from the string that was actually scanned — they are never
          authored into the packet data, because a citation that was written by hand
          alongside the answer proves nothing about whether the pipeline read the right
          part of the page. On any packet page the same offsets index into the document
          text rendered further down, with the cited range highlighted, so a citation is
          checked by looking rather than by trusting.
        </p>
        <p>
          Each fact also carries an extraction confidence, and every finding&rsquo;s own
          confidence scales with the <em>minimum</em> extraction confidence among its
          evidence rather than the mean. A conclusion is worth no more than its shakiest
          input: a date whose year had to be inferred from the document header drags the
          finding that rests on it down, which is the correct direction.
        </p>
      </section>

      <section className="section">
        <h2>2 · Evidence linking</h2>
        <p>
          Facts are grouped by <span className="mono">entityKey::field</span> — every value
          the packet has ever asserted about one attribute of one thing, in the order the
          documents arrived. That group, not the document, is the unit of adjudication.
          It is the structure that makes the temporal rules expressible at all: you cannot
          ask whether a later document revised an earlier one until both readings sit in
          the same list with their timestamps attached.
        </p>
        <p>
          Entities are matched on identifiers that are meant to be unique — VIN, unit
          number, normalised address. Where an identifier is suspect (a re-scanned VIN,
          two yards on the same street) the group is still built, and the question of
          whether the two readings are the same thing is answered downstream by a rule that
          can explain itself, never silently by the linker.
        </p>
      </section>

      <section className="section">
        <h2>3 · Adjudication</h2>
        <p>
          One function decides one group. It is pure — a group in, a finding out, no
          packet-wide state — and it tests in this order:
        </p>
        <ol className="list-plain">
          <li>
            <Badge of="unresolved" /> <strong>The extractor declined to commit.</strong>{' '}
            If normalisation marked any reading ambiguous, that is the answer. Picking one
            of two readings would be a guess presented as a fact.
          </li>
          <li>
            <Badge of="consistent" /> <strong>Everything resolves to one value and the
            surface forms already agreed.</strong> Nothing is reported. The finding still
            exists internally and is visible in the per-packet audit list, because a
            silence because nothing was wrong and a silence because no rule looked are very
            different things that look identical from outside.
          </li>
          <li>
            <Badge of="benign_variant" /> <strong>Everything resolves to one value, but
            the surfaces differed and a domain rule was needed to reconcile them.</strong>{' '}
            This is reported. It is exactly where a general-purpose string comparator gets
            the wrong answer, so it is worth a reviewer&rsquo;s glance — and if the rule is
            wrong, this is where they catch it. The marker is on the normalised value
            itself (<span className="mono">domainRule</span>), which is what separates a
            reportable variant from an unremarkable agreement.
          </li>
          <li>
            <Badge of="unresolved" /> <strong>Two VINs that differ only at characters
            legal in both readings.</strong> May be one vehicle scanned twice or two
            vehicles; the documents do not say.
          </li>
          <li>
            <Badge of="supersession" /> <strong>The latest document&rsquo;s own text marks
            a deliberate change.</strong> Not recency — change language, found in the
            source. See below.
          </li>
          <li>
            <Badge of="conflict" /> <strong>Otherwise.</strong> Values disagree and no
            document in the packet reconciles them.
          </li>
        </ol>

        <h3 style={{ marginTop: 22 }}>The supersession gate</h3>
        <p>
          This is the rule the hard-negative half of the corpus was built to test. A later
          value supersedes an earlier one only when the later document&rsquo;s own text
          declares a change — an endorsement adding a unit, a revision after appraisal.
          Recency by itself never resolves a disagreement, because &ldquo;the newest
          document wins&rdquo; is indistinguishable from &ldquo;the last person to type a
          number was right&rdquo;, and a submission where someone re-keyed a figure wrongly
          on Friday would be silently resolved in favour of the error.
        </p>
        <p>
          The gate has a stated cost, and the classifier says so in its own rationale: when
          change language appears somewhere in a group but the most recent assertion is not
          the changed one, the packet&rsquo;s final state is genuinely unclear and the
          finding is a conflict rather than a supersession. That is the conservative
          direction, and it is visible in the ablation lists on the{' '}
          <Link href="/scorecard#ablation">scorecard</Link> rather than hidden.
        </p>

        <h3 style={{ marginTop: 22 }}>Confidence</h3>
        <p>
          Every confidence is a weighted sum of <em>named</em> signals, and the names are
          printed on the finding. A reviewer reads{' '}
          <span className="mono">temporal.explicit-change-language-in-source</span> and{' '}
          <span className="mono">change.names-specific-unit</span>, not 0.83. The weights
          are written at the call site of the rule that earns them rather than collected in
          a table, because the point of reading the classifier is to see why a finding
          scored what it did.
        </p>
        <p>
          Nothing is trained. A learned score over sixteen packets would be a lie dressed
          as rigour. The honest test of a hand-built score is whether it is{' '}
          <em>calibrated</em>, which is what the{' '}
          <Link href="/scorecard#calibration">reliability diagram</Link> measures: if the
          0.9 bin is right 70% of the time, the weights are wrong and the chart says so.
        </p>
        <p>
          Confidence is capped per classification — 0.97 for a conflict, 0.95 for a
          supersession, 0.7 for anything unresolved. A classifier that can say
          &ldquo;certain&rdquo; will eventually say it about something it misread, and{' '}
          <span className="mono">unresolved</span> is capped hard because its entire content
          is &ldquo;I do not know&rdquo;.
        </p>
      </section>

      <section className="section">
        <h2>4 · Derived rules</h2>
        <p>
          Some questions are not about any one field. Nobody writes down &ldquo;the fleet
          count disagrees with the schedule&rdquo;; the count is in one place, the rows are
          in another, and the discrepancy exists only in the arithmetic between them. Six
          rules ask those questions:
        </p>
        <table style={{ marginTop: 12 }}>
          <tbody>
            <tr>
              <td className="mono" style={{ width: 230 }}>
                vinUniqueness
              </td>
              <td>
                One VIN may identify one unit. Runs <em>after</em> glyph folding, so an
                OCR misread does not become a phantom duplicate.
              </td>
            </tr>
            <tr>
              <td className="mono">vehicleCountReconciliation</td>
              <td>
                Stated power units against the rows actually in the schedule — on
                post-supersession values, so an endorsement that adds a unit moves the
                stated count before the comparison, not after.
              </td>
            </tr>
            <tr>
              <td className="mono">scheduledValueReconciliation</td>
              <td>
                Stated total insured value against the sum of the rows. A gap under{' '}
                {(GUIDELINES.materialValueGapRatio * 100).toFixed(0)}% of the stated total
                is reported as immaterial rather than as a conflict.
              </td>
            </tr>
            <tr>
              <td className="mono">lossHistoryCompleteness</td>
              <td>
                The loss narrative in the email against the loss run. A claim above the{' '}
                {`$${GUIDELINES.minorLossCeiling.toLocaleString('en-US')}`} line is not
                &ldquo;minor&rdquo; however the submission describes it.
              </td>
            </tr>
            <tr>
              <td className="mono">locationRoster</td>
              <td>
                Near-duplicate garaging addresses, reported as distinct with the
                distinguishing token named — never merged.
              </td>
            </tr>
            <tr>
              <td className="mono">locationCountReconciliation</td>
              <td>Stated locations against the rows in the location schedule.</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          Each derived rule synthesises its own evidence group and cites the real spans it
          reasoned over, so a derived finding looks exactly like an observed one to the
          reviewer and to the scorer. A rule that cannot show its evidence does not get a
          different presentation; it does not get to fire.
        </p>
        <p>
          The thresholds these rules cite are <strong>my own invention for this
          exercise</strong>. They are not any carrier&rsquo;s appetite, not taken from any
          filing, and not advice. They exist so a finding can say &ldquo;above the{' '}
          {`$${GUIDELINES.minorLossCeiling.toLocaleString('en-US')}`} minor-loss line&rdquo;
          instead of hiding an unexplained constant inside a comparison.
        </p>
      </section>

      <section className="section">
        <h2>What normalisation is allowed to do</h2>
        <p>
          Normalisation is where a reconciliation tool quietly destroys information. The
          governing rule here: fold only where the domain <em>guarantees</em> the fold is
          lossless, and where it does not, report the closeness instead of acting on it.
        </p>

        <h3>VINs</h3>
        <p>
          The VIN standard excludes I, O and Q precisely so they cannot be confused with 1
          and 0. That makes three substitutions provably safe, because the letter can never
          have been the true character:
        </p>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>glyph pair</th>
              <th style={{ width: 110 }}>action</th>
              <th>why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">I → 1, O → 0, Q → 0</td>
              <td className="pass">fold</td>
              <td>
                I, O and Q are not legal VIN characters. A VIN containing one was misread,
                and there is exactly one thing it can have been.
              </td>
            </tr>
            <tr>
              <td className="mono">5/S · 8/B · 2/Z · 6/G · 0/D · 1/7</td>
              <td className="fail">never fold</td>
              <td>
                Both members of each pair are legal in a VIN. Folding would merge two
                vehicles that might genuinely exist. When two VINs differ only at these
                positions the group is marked <Badge of="unresolved" /> and sent to a human
                — the documents do not say which reading is right, and inventing an answer
                is worse than admitting the gap.
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: 20 }}>Addresses</h3>
        <p>
          Suffixes fold to one spelling <em>within</em> a family — Street and St both
          become ST — and never across families. ST and AVE stay different forever, because
          4500 Oak Street and 4500 Oak Avenue are two real places in a great many towns.
          Directionals are abbreviated but always preserved: 1220 N and 1220 S Industrial
          Pkwy are not the same yard, and dropping the letter to make two rows agree would
          be a fabrication.
        </p>
        <p>
          Character similarity is computed, but it is used only to decide whether two
          addresses are close enough to be worth <em>reporting</em> as near-duplicates
          (above {(GUIDELINES.nearDuplicateAddressSimilarity * 100).toFixed(0)}%). It never
          merges anything. Merging is decided by exact canonical equality, and by nothing
          else.
        </p>
      </section>

      <section className="section">
        <h2>The corpus and the ground-truth contract</h2>
        <p>
          Sixteen packets, each written to exercise one case from a ten-case taxonomy: five
          kinds of real conflict, five kinds of thing that only looks like one. Every packet
          declares a hand-authored label for each group it is meant to produce a finding for.
        </p>
        <p>
          The contract runs both ways, which is the part that makes the number hard to game:
        </p>
        <ul className="list-plain">
          <li>
            Every group the ground truth declares must come back with exactly that label.
            Silence on a declared group is a <span className="mono">dropped</span> finding.
          </li>
          <li>
            Every finding the engine reports that is <em>not</em>{' '}
            <span className="mono">consistent</span> must appear in the ground truth. An
            undeclared conflict is a false positive and an undeclared anything-else is{' '}
            <span className="mono">noise</span>. Neither can be quietly absorbed, so the
            engine cannot improve its recall by reporting more.
          </li>
        </ul>
        <p className="note">
          Only the <em>key set</em> is reconciled against the engine&rsquo;s output. Every
          classification <em>value</em> in the ground truth was written by hand from the
          packet text before the engine ran on it — the labels are not the engine&rsquo;s
          output copied into a fixture, which would make the whole scorecard circular.
        </p>
      </section>

      <section className="section">
        <h2>The baseline</h2>
        <p>
          A scorecard with one engine on it reports an absolute score against a set of
          packets the same person wrote, which is close to unfalsifiable. So the same
          documents run through a second engine with the same extractor and the same
          linker, and exactly two capabilities removed:
        </p>
        <ol className="list-plain">
          <li>
            <strong>Domain-aware comparison.</strong> It compares raw surface strings rather
            than normalised canonicals, so &ldquo;$1.2M&rdquo; and &ldquo;$1,200,000&rdquo;
            are two different values.
          </li>
          <li>
            <strong>Cross-document derivation.</strong> No arithmetic, no uniqueness
            constraint, no roster reconciliation — so a discrepancy that exists only
            between two fields, and is never written down in either of them, is invisible
            to it.
          </li>
        </ol>
        <p>
          Everything else is held constant, including the extractor, so the baseline is not
          penalised for bad OCR handling or missed fields: it sees every fact the reference
          engine sees. The gap between the two columns is therefore attributable to those
          two ideas and not to a parser I hobbled.
        </p>
        <p>
          Its confidence is a single flat number, because it has exactly one reason for
          everything it reports — these strings differ — and inventing a spread would be
          decoration.
        </p>
        <p className="note">
          <strong>The baseline is my own construction.</strong> It is not a model of
          anyone&rsquo;s product, it was not derived from observing one, and nothing in this
          repo licenses the sentence &ldquo;vendor X scores like the baseline&rdquo;. The
          baseline scores like the baseline.
        </p>
      </section>

      <section className="section">
        <h2>The reviewer loop</h2>
        <p>
          A scorecard graded only against labels I wrote measures agreement with me. The
          reviewer loop adds a second, independent axis: a human reads a finding, accepts,
          rejects, or says they cannot tell, and gives a reason. Those verdicts produce a
          second reliability diagram — confidence against what a human actually did with the
          finding, rather than against my label.
        </p>
        <p>
          The hand-authored label is hidden behind a disclosure on every finding card. If
          the answer sat next to the buttons, a verdict would measure a reviewer&rsquo;s
          willingness to agree with a label they had just read, and the agreement rate would
          be worth nothing. Rows where the reviewer and the label disagree are listed on the
          scorecard as <em>disputed</em>: one of the two is wrong, and those are the rows
          where the corpus learns something.
        </p>
        <p>
          A verdict of <em>can&rsquo;t tell</em> is counted and shown but kept out of the
          agreement denominator. It is not a vote against the pipeline; it says the packet
          did not give the reviewer enough to decide.
        </p>
      </section>

      <section className="section">
        <h2>What this cannot tell you</h2>
        <ul className="list-plain">
          <li>
            <strong>It is not a benchmark of any commercial product.</strong> Nothing here
            was run against a vendor&rsquo;s system, no vendor&rsquo;s system was observed
            in building it, and no number on this site should be compared to one. Both
            engines on the scorecard are mine.
          </li>
          <li>
            <strong>The corpus is synthetic and small.</strong> Sixteen packets, written by
            the same person who wrote the rules, to be hard in specific enumerated ways.
            That makes every rate a measurement against my judgement of what is hard — not
            against the distribution of a real book of business. One flipped finding moves
            most of the rates by several points.
          </li>
          <li>
            <strong>The bins on the reliability diagram were chosen after seeing where the
            scores fell.</strong> That is a real degree of freedom and it is stated on the
            chart rather than buried: the bin edges are part of the method, not a property
            of the data.
          </li>
          <li>
            <strong>Passing every case does not mean the engine is right.</strong> It means
            it has the ten behaviours the taxonomy names. The interesting failures of a real
            system are the cases nobody thought to enumerate, and by construction this
            corpus contains none of them.
          </li>
          <li>
            <strong>The guidelines are inventions.</strong> This is not an underwriting
            tool and gives no underwriting advice.
          </li>
        </ul>
      </section>
    </>
  );
}
