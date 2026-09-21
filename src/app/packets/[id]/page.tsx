import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PACKETS, getPacket, getTaxonomyCase } from '@/data/packets';
import { analysisFor } from '@/lib/bench';
import { documentTitles } from '@/lib/classify';
import { decisionsForPacket, isReviewStoreWritable } from '@/lib/store';
import type { Classification } from '@/lib/types';

import { FindingCard } from '../../components/FindingCard';
import { SourceDocument } from '../../components/SourceDocument';
import { Badge, PageHead } from '../../components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const packet = getPacket((await params).id);
  return { title: packet ? `${packet.id} · ${packet.title}` : 'Packet not found' };
}

export default async function PacketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const packet = getPacket(id);
  if (!packet) notFound();

  const analysis = analysisFor(packet.id, 'reference');
  const naive = analysisFor(packet.id, 'naive');
  const titles = documentTitles(packet);
  const decisions = decisionsForPacket(packet.id);
  const taxonomyCase = getTaxonomyCase(packet.taxonomyCase);

  const expectedFor = (groupKey: string): Classification =>
    packet.groundTruth.expected[groupKey] ?? 'consistent';
  const isDeclared = (groupKey: string) =>
    Object.prototype.hasOwnProperty.call(packet.groundTruth.expected, groupKey);
  const decisionFor = (groupKey: string) =>
    decisions.find((d) => d.groupKey === groupKey && d.engine === 'reference');

  // The focus group leads: it is the thing the packet was written to exercise.
  const adjudicated = analysis.findings
    .filter((f) => f.classification !== 'consistent')
    .sort((a, b) =>
      a.groupKey === packet.groundTruth.focusGroup
        ? -1
        : b.groupKey === packet.groundTruth.focusGroup
          ? 1
          : 0,
    );
  const quiet = analysis.findings.filter((f) => f.classification === 'consistent');

  const index = PACKETS.findIndex((p) => p.id === packet.id);
  const previous = PACKETS[index - 1];
  const next = PACKETS[index + 1];

  const naiveAdjudicated = naive.findings.filter((f) => f.classification !== 'consistent');

  return (
    <>
      <PageHead eyebrow={`${packet.id} · ${packet.insured}`} title={packet.title}>
        <div className="row" style={{ margin: '10px 0' }}>
          <span className={`chip bucket-${packet.bucket}`}>
            {packet.bucket === 'true_conflict' ? 'true conflict' : 'hard negative'}
          </span>
          <span className="chip">
            case {taxonomyCase.id}: {taxonomyCase.name}
          </span>
          <span className="chip">{packet.documents.length} documents</span>
          <span className="chip">{analysis.facts.length} facts extracted</span>
          <span className="chip">{analysis.groups.length} evidence groups</span>
        </div>
        <p>{packet.synopsis}</p>
      </PageHead>

      <section className="section">
        <h2>Findings</h2>
        <p>
          {adjudicated.length === 0
            ? 'Nothing in this packet needed adjudicating.'
            : `${adjudicated.length} group${adjudicated.length === 1 ? '' : 's'} where the packet asserts more than one value, and what the pipeline made of each.`}{' '}
          Decide before you reveal the authored label — the agreement rate on the scorecard
          is only worth something if the verdicts were independent of it.
        </p>

        <div style={{ marginTop: 14 }}>
          {adjudicated.map((finding) => (
            <FindingCard
              key={finding.groupKey}
              finding={finding}
              titles={titles}
              packetId={packet.id}
              engine="reference"
              expected={expectedFor(finding.groupKey)}
              declared={isDeclared(finding.groupKey)}
              why={
                finding.groupKey === packet.groundTruth.focusGroup
                  ? packet.groundTruth.why
                  : undefined
              }
              existing={decisionFor(finding.groupKey)}
              writable={isReviewStoreWritable()}
            />
          ))}
        </div>
      </section>

      {quiet.length > 0 ? (
        <section className="section">
          <details className="doc">
            <summary>
              <strong>{quiet.length} groups the pipeline stayed quiet about</strong>
              <span className="faint small">
                checked and found consistent — shown for audit, not for review
              </span>
            </summary>
            <div style={{ padding: 14 }}>
              <p className="small muted">
                These are groups where a rule ran and concluded there was nothing to say,
                including the derived reconciliation rules that had to do arithmetic to get
                there. A checker that only shows what it flagged is impossible to audit: a
                silence because nothing was wrong and a silence because no rule ever looked
                are very different things, and they look identical from outside.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>group</th>
                    <th>what it concluded</th>
                    <th className="num">confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {quiet.map((finding) => (
                    <tr key={finding.groupKey}>
                      <td>
                        <strong>{finding.label}</strong>
                        <br />
                        <span className="mono faint">{finding.groupKey}</span>
                      </td>
                      <td className="muted">{finding.rationale}</td>
                      <td className="num mono">{finding.confidence.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}

      <section className="section">
        <h2>What the baseline saw</h2>
        <p>
          The same documents, the same extracted facts, the same evidence groups — then
          raw-string comparison instead of temporal gating and domain normalisation.
        </p>
        <div className="card" style={{ marginTop: 12 }}>
          {naiveAdjudicated.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              The baseline reported nothing on this packet.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>group</th>
                  <th style={{ width: 130 }}>baseline</th>
                  <th style={{ width: 130 }}>reference</th>
                  <th style={{ width: 130 }}>authored</th>
                </tr>
              </thead>
              <tbody>
                {naiveAdjudicated.map((finding) => {
                  const mine = analysis.findings.find(
                    (f) => f.groupKey === finding.groupKey,
                  );
                  return (
                    <tr key={finding.groupKey}>
                      <td>{finding.label}</td>
                      <td>
                        <Badge of={finding.classification} />
                      </td>
                      <td>
                        {mine ? <Badge of={mine.classification} /> : <span className="faint">—</span>}
                      </td>
                      <td>
                        <Badge of={expectedFor(finding.groupKey)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <h2>The documents</h2>
        <p>
          Exactly what the extractor read, in the order the packet received them.
          Highlights are the spans cited above; the character offsets next to each finding
          index into these strings.
        </p>
        <div style={{ marginTop: 14 }}>
          {packet.documents.map((document, i) => (
            <SourceDocument
              key={document.id}
              document={document}
              facts={analysis.facts}
              open={i === 0}
            />
          ))}
        </div>
      </section>

      <nav className="row" style={{ justifyContent: 'space-between', marginTop: 30 }}>
        {previous ? (
          <Link href={`/packets/${previous.id}`} className="small">
            ← {previous.id}
          </Link>
        ) : (
          <span />
        )}
        <Link href="/packets" className="small">
          all packets
        </Link>
        {next ? (
          <Link href={`/packets/${next.id}`} className="small">
            {next.id} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
