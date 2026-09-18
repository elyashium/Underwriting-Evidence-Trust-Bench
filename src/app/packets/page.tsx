import Link from 'next/link';

import { PACKETS, TAXONOMY, getTaxonomyCase } from '@/data/packets';
import { readDecisions } from '@/lib/store';

import { analyses } from '@/lib/bench';
import { PageHead } from '../components/ui';

export const dynamic = 'force-dynamic';

export default function PacketsPage() {
  const reference = analyses().reference;
  const decisions = readDecisions();

  const reviewedCount = (packetId: string) =>
    decisions.filter((d) => d.packetId === packetId).length;

  const findingCount = (packetId: string) =>
    reference
      .find((a) => a.packetId === packetId)!
      .findings.filter((f) => f.classification !== 'consistent').length;

  const buckets = [
    {
      key: 'true_conflict' as const,
      title: 'Packets that contain a real conflict',
      blurb:
        'Something in these submissions is genuinely irreconcilable, and an underwriter ' +
        'needs to know before the policy is priced. Missing one of these is the error ' +
        'that reaches the book.',
    },
    {
      key: 'hard_negative' as const,
      title: 'Packets that only look like they do',
      blurb:
        'Every one of these contains at least one surface that disagrees with another ' +
        'on its face, and every one of them is fine. Flagging them is the error that ' +
        'costs a broker an email and costs the tool its credibility.',
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={`${PACKETS.length} synthetic submissions`}
        title="Packets"
      >
        <p>
          Each packet is a small commercial-auto submission: a broker email, an
          application, a vehicle schedule, and sometimes a loss run, an endorsement or a
          scanned addendum. Every one was written by hand to exercise one case from the
          taxonomy, and carries a hand-authored label for every finding it should produce.
        </p>
      </PageHead>

      {buckets.map((bucket) => (
        <section className="section" key={bucket.key}>
          <h2>{bucket.title}</h2>
          <p>{bucket.blurb}</p>
          <div className="packet-list" style={{ marginTop: 14 }}>
            {PACKETS.filter((p) => p.bucket === bucket.key).map((packet) => {
              const reviewed = reviewedCount(packet.id);
              return (
                <Link className="packet-row" href={`/packets/${packet.id}`} key={packet.id}>
                  <span className="id">
                    {packet.id}
                    <br />
                    <span className="faint">case {packet.taxonomyCase}</span>
                  </span>
                  <span>
                    <span className="title">{packet.title}</span>
                    <span className="synopsis">{packet.synopsis}</span>
                    <span className="faint small">
                      {packet.insured} &middot; {packet.documents.length} documents &middot;{' '}
                      {findingCount(packet.id)} findings
                      {reviewed > 0 ? ` · ${reviewed} reviewed` : ''}
                    </span>
                  </span>
                  <span className={`chip bucket-${packet.bucket}`}>
                    {getTaxonomyCase(packet.taxonomyCase).name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="section">
        <h2>The taxonomy</h2>
        <p>
          Ten cases, each naming one behaviour the pipeline either has or does not. The
          scorecard reports per case so a failure points at a capability rather than at an
          aggregate.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>case</th>
              <th>what it tests</th>
              <th style={{ width: 90 }}>packets</th>
            </tr>
          </thead>
          <tbody>
            {TAXONOMY.map((taxonomyCase) => (
              <tr key={taxonomyCase.id}>
                <td className="mono">{taxonomyCase.id}</td>
                <td>
                  <strong>{taxonomyCase.name}</strong>
                  <br />
                  <span className={`chip bucket-${taxonomyCase.bucket}`}>
                    {taxonomyCase.bucket === 'true_conflict'
                      ? 'true conflict'
                      : 'hard negative'}
                  </span>
                </td>
                <td className="muted">{taxonomyCase.tests}</td>
                <td className="mono small">
                  {PACKETS.filter((p) => p.taxonomyCase === taxonomyCase.id)
                    .map((p) => p.id.replace('PKT-', ''))
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
