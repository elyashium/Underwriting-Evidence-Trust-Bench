import type { DocumentTitles } from '@/lib/classify';
import type { Fact } from '@/lib/types';

import { shortDate } from './ui';

/**
 * The evidence trail: every value the packet ever asserted for one field, in the
 * order the documents arrived.
 *
 * This is the component the whole project exists to make possible. A
 * classification is only worth anything to a reviewer if they can see what it
 * was computed from, so each row carries the document it came from, the exact
 * characters it was read at, the text as written, and what normalisation turned
 * that text into. The offsets are real: they index into the document text shown
 * further down the page, and the same slice is what the extractor stored.
 */
export function EvidenceTrail({
  facts,
  titles,
}: {
  facts: Fact[];
  titles: DocumentTitles;
}) {
  const ordered = [...facts].sort((a, b) =>
    a.receivedAt === b.receivedAt
      ? a.span.start - b.span.start
      : a.receivedAt < b.receivedAt
        ? -1
        : 1,
  );

  return (
    <ol className="trail">
      {ordered.map((fact) => (
        <li className="trail-item" key={fact.id}>
          <div className="trail-meta">
            <span className="doc-title">
              {titles.get(fact.documentId) ?? fact.documentId}
            </span>
            <span>{fact.documentKind.replace(/_/g, ' ')}</span>
            <span>received {shortDate(fact.receivedAt)}</span>
            <span className="mono">
              chars {fact.span.start}&ndash;{fact.span.end}
            </span>
            {fact.changeIntent ? (
              <span className="chip">change language: {fact.changeIntent}</span>
            ) : null}
          </div>

          <div className="quote">&ldquo;{fact.span.quote}&rdquo;</div>

          <div className="reading">
            <span>
              reads as <b>{fact.value.canonical}</b>
            </span>
            {fact.value.domainRule ? (
              <span className="chip chip-rule">{fact.value.domainRule}</span>
            ) : null}
            {fact.value.ambiguous ? <span className="chip">ambiguous</span> : null}
            <span className="faint">extraction {fact.confidence.toFixed(2)}</span>
          </div>

          {fact.value.note ? <div className="small faint">{fact.value.note}</div> : null}
        </li>
      ))}
    </ol>
  );
}
