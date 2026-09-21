'use client';

import { useState } from 'react';

import { analyzePacket } from '@/lib/classify';
import type {
  DocumentKind,
  Finding,
  PacketAnalysis,
  SubmissionDocument,
} from '@/lib/types';

import { EvidenceTrail } from '../components/EvidenceTrail';
import { SourceDocument } from '../components/SourceDocument';
import { Badge, PageHead, shortDate } from '../components/ui';

const KINDS: Array<{ value: DocumentKind; label: string }> = [
  { value: 'broker_email', label: 'Broker email' },
  { value: 'application', label: 'Application' },
  { value: 'vehicle_schedule', label: 'Vehicle schedule' },
  { value: 'loss_run', label: 'Loss run' },
  { value: 'endorsement_email', label: 'Endorsement email' },
  { value: 'scanned_addendum', label: 'Scanned addendum' },
  { value: 'adjuster_note', label: 'Adjuster note' },
];

interface DocDraft {
  key: number;
  title: string;
  kind: DocumentKind;
  date: string;
  content: string;
}

const today = () => new Date().toISOString().slice(0, 10);

let nextKey = 1;
const blankDoc = (kind: DocumentKind, title: string): DocDraft => ({
  key: nextKey++,
  title,
  kind,
  date: today(),
  content: '',
});

/**
 * Two documents that disagree on purpose: the email says 12 power units, the
 * worksheet says 14, and nothing in either one explains the gap. Verified to
 * produce exactly one conflict finding through the real pipeline.
 */
const EXAMPLE: DocDraft[] = [
  {
    key: nextKey++,
    title: 'Broker email',
    kind: 'broker_email',
    date: '2026-03-02',
    content: `Subject: Hartline Freight LLC - new business

Team,

Submitting Hartline Freight LLC for a 04/01/2026 effective date. They run 12 power units out of Tulsa OK.`,
  },
  {
    key: nextKey++,
    title: 'Application worksheet',
    kind: 'application',
    date: '2026-03-05',
    content: `COMMERCIAL AUTO WORKSHEET (simplified - not an ACORD form)

NAMED INSURED: Hartline Freight LLC
PROPOSED EFFECTIVE DATE: 04/01/2026
NUMBER OF POWER UNITS: 14
LIABILITY LIMIT (CSL): $1,000,000`,
  },
];

function toSubmissionDocument(draft: DocDraft, index: number): SubmissionDocument {
  return {
    id: `try-doc-${index + 1}`,
    kind: draft.kind,
    title: draft.title.trim() || `Document ${index + 1}`,
    receivedAt: draft.date
      ? `${draft.date}T09:00:00Z`
      : new Date().toISOString(),
    content: draft.content,
  };
}

function UngradedFinding({
  finding,
  titles,
}: {
  finding: Finding;
  titles: Map<string, string>;
}) {
  return (
    <article className={`finding finding-${finding.classification}`}>
      <header className="finding-head">
        <Badge of={finding.classification} />
        <span className="label">{finding.label}</span>
        <span className="confidence">
          confidence {finding.confidence.toFixed(2)}
        </span>
      </header>

      <p className="rationale">{finding.rationale}</p>

      <div className="signals">
        {finding.signals.map((signal) => (
          <span className="signal" key={signal}>
            {signal}
          </span>
        ))}
      </div>

      {finding.evidence.length > 0 ? (
        <EvidenceTrail facts={finding.evidence} titles={titles} />
      ) : null}

      {finding.supersededBy ? (
        <p className="small muted" style={{ marginTop: 10 }}>
          Superseded by <strong>{finding.supersededBy.documentTitle}</strong>,
          received {shortDate(finding.supersededBy.at)}. The later value stands,
          and the earlier one is history rather than a contradiction.
        </p>
      ) : null}
    </article>
  );
}

export default function TryPage() {
  const [docs, setDocs] = useState<DocDraft[]>([
    blankDoc('broker_email', 'Broker email'),
    blankDoc('application', 'Application worksheet'),
  ]);
  const [result, setResult] = useState<{
    analysis: PacketAnalysis;
    documents: SubmissionDocument[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, field: keyof DocDraft, value: string) =>
    setDocs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, [field]: value } : d)),
    );

  const run = () => {
    setError(null);
    const filled = docs.filter((d) => d.content.trim().length > 0);
    if (filled.length === 0) {
      setError('Paste at least one document before running the analysis.');
      setResult(null);
      return;
    }
    try {
      const documents = filled.map(toSubmissionDocument);
      const analysis = analyzePacket({
        id: 'TRY-001',
        title: 'Your documents',
        insured: 'Your submission',
        taxonomyCase: 2,
        bucket: 'true_conflict',
        synopsis: 'Ungraded, user-supplied documents.',
        documents,
        groundTruth: { focusGroup: '', why: '', expected: {} },
      });
      setResult({ analysis, documents });
    } catch (cause) {
      setResult(null);
      setError(
        cause instanceof Error
          ? `The pipeline could not read that input: ${cause.message}`
          : 'The pipeline could not read that input.',
      );
    }
  };

  const titles = new Map(
    (result?.documents ?? []).map((d) => [d.id, d.title] as const),
  );
  const needsReview =
    result?.analysis.findings.filter((f) => f.classification !== 'consistent') ??
    [];

  return (
    <>
      <PageHead
        eyebrow="Ungraded preview · runs entirely in your browser"
        title="Try your own documents"
      >
        <p>
          Paste two or more submission documents and the reference pipeline reads
          them on the spot — extraction, evidence linking, classification, with
          citations into your own text. Nothing is uploaded, nothing is stored,
          and nothing here is graded: without hand-authored labels there is no
          score, only findings to read critically.
        </p>
      </PageHead>

      <div className="stack">
        {docs.map((doc, i) => (
          <div className="card" key={doc.key}>
            <div className="doc-meta" style={{ marginBottom: 10 }}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={doc.title}
                  onChange={(e) => patch(doc.key, 'title', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Type</span>
                <select
                  value={doc.kind}
                  onChange={(e) =>
                    patch(doc.key, 'kind', e.target.value as DocumentKind)
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Received</span>
                <input
                  type="date"
                  value={doc.date}
                  onChange={(e) => patch(doc.key, 'date', e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>
                Document {i + 1} text — paste the whole thing, headers and all
              </span>
              <textarea
                rows={8}
                value={doc.content}
                onChange={(e) => patch(doc.key, 'content', e.target.value)}
                placeholder="Paste broker email, application, schedule…"
              />
            </label>
            {docs.length > 1 ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setDocs((prev) => prev.filter((d) => d.key !== doc.key));
                    setResult(null);
                  }}
                >
                  Remove document
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() =>
            setDocs((prev) => [
              ...prev,
              blankDoc('vehicle_schedule', `Document ${prev.length + 1}`),
            ])
          }
        >
          Add document
        </button>
        <button type="button" onClick={() => { setDocs(EXAMPLE.map((d) => ({ ...d, key: nextKey++ }))); setResult(null); setError(null); }}>
          Load conflicting example
        </button>
        <button type="button" onClick={run}>
          Run the analysis
        </button>
      </div>

      {error ? (
        <p className="form-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <details className="reveal">
        <summary>Phrasing tips — the extractor is literal</summary>
        <div className="reveal-body">
          <p className="small muted" style={{ margin: 0 }}>
            This is a shape-based reader, not a language model. Counts look like{' '}
            <span className="mono">12 power units</span>; form labels must be
            uppercase (<span className="mono">NUMBER OF POWER UNITS: 14</span>);
            dates read as <span className="mono">04/01/2026</span>; limits as{' '}
            <span className="mono">LIABILITY LIMIT (CSL): $1,000,000</span>. If a fact
            you expected never appears, the phrasing missed — the documents below
            show exactly what was cited, so you can see what the reader saw.
          </p>
        </div>
      </details>

      {result ? (
        <section className="section">
          <h2>What the pipeline made of it</h2>
          <p>
            {result.analysis.facts.length} facts extracted into{' '}
            {result.analysis.groups.length} evidence groups.{' '}
            {needsReview.length === 0
              ? 'Everything resolved to one value per group — nothing to flag, which is itself an answer.'
              : `${needsReview.length} finding${needsReview.length === 1 ? '' : 's'} worth a human look.`}{' '}
            Ungraded: no labels, no score.
          </p>
          <div className="stack" style={{ marginTop: 12 }}>
            {needsReview.map((finding) => (
              <UngradedFinding
                key={finding.groupKey}
                finding={finding}
                titles={titles}
              />
            ))}
          </div>

          <h3 style={{ marginTop: 26 }}>Your documents, as read</h3>
          <p className="small muted">
            Highlighted spans are the exact characters each fact was cited from.
          </p>
          <div className="stack">
            {result.documents.map((doc) => (
              <SourceDocument
                key={doc.id}
                document={doc}
                facts={result.analysis.facts}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
