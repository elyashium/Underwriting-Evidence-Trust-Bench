import type { Fact, SubmissionDocument } from '@/lib/types';

import { shortDate } from './ui';

/**
 * A document, rendered as the plain text it actually is, with every span the
 * extractor cited highlighted in place.
 *
 * Showing the source verbatim is the point. The offsets printed next to each
 * finding index into exactly this string, so a reviewer can check a citation by
 * looking rather than by trusting — and a citation that pointed somewhere else
 * would be visible immediately instead of being hidden behind a tidy summary.
 */

interface Span {
  start: number;
  end: number;
}

/** Overlapping citations are common (a row is cited by several rules). */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans]
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ start: span.start, end: span.end });
  }
  return merged;
}

export function SourceDocument({
  document,
  facts,
  open = false,
}: {
  document: SubmissionDocument;
  facts: Fact[];
  open?: boolean;
}) {
  const cited = mergeSpans(
    facts.filter((f) => f.span.documentId === document.id).map((f) => f.span),
  );

  const pieces: Array<{ text: string; cited: boolean }> = [];
  let cursor = 0;
  for (const span of cited) {
    if (span.start > cursor) {
      pieces.push({ text: document.content.slice(cursor, span.start), cited: false });
    }
    pieces.push({ text: document.content.slice(span.start, span.end), cited: true });
    cursor = span.end;
  }
  if (cursor < document.content.length) {
    pieces.push({ text: document.content.slice(cursor), cited: false });
  }

  return (
    <details className="doc" open={open}>
      <summary>
        <strong>{document.title}</strong>
        <span className="faint small">{document.kind.replace(/_/g, ' ')}</span>
        <span className="faint small">received {shortDate(document.receivedAt)}</span>
        <span className="faint small mono">
          {document.content.length} chars &middot; {cited.length} cited
        </span>
      </summary>
      <pre>
        {pieces.map((piece, i) =>
          piece.cited ? (
            <mark className="cited" key={i}>
              {piece.text}
            </mark>
          ) : (
            <span key={i}>{piece.text}</span>
          ),
        )}
      </pre>
    </details>
  );
}
