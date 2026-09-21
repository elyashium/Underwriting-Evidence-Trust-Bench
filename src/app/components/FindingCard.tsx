import type { DocumentTitles } from '@/lib/classify';
import type {
  Classification,
  EngineId,
  Finding,
  ReviewDecision,
} from '@/lib/types';

import { EvidenceTrail } from './EvidenceTrail';
import { ReviewForm } from './ReviewForm';
import { Badge, classificationLabel, shortDate } from './ui';

/**
 * One adjudicated group: what the pipeline decided, what it decided it from,
 * and the control that lets a human disagree.
 *
 * The hand-authored label is deliberately hidden behind a disclosure. If the
 * answer sat next to the buttons, a reviewer's verdict would measure their
 * willingness to agree with a label they had just read, and the agreement rate
 * on the scorecard would be worth nothing. Decide first, then look.
 */
export function FindingCard({
  finding,
  titles,
  packetId,
  engine,
  expected,
  declared,
  why,
  existing,
  reviewable = true,
  writable = true,
}: {
  finding: Finding;
  titles: DocumentTitles;
  packetId: string;
  engine: EngineId;
  expected: Classification;
  declared: boolean;
  why?: string;
  existing?: ReviewDecision;
  reviewable?: boolean;
  writable?: boolean;
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
          Superseded by <strong>{finding.supersededBy.documentTitle}</strong>, received{' '}
          {shortDate(finding.supersededBy.at)}. The later value stands, and the earlier one
          is history rather than a contradiction.
        </p>
      ) : null}

      {finding.explainedBy?.length ? (
        <div className="small muted" style={{ marginTop: 10 }}>
          Explained away by text elsewhere in the packet:
          <ul className="list-plain">
            {finding.explainedBy.map((span, i) => (
              <li key={i}>
                <span className="mono">
                  {titles.get(span.documentId) ?? span.documentId} · chars {span.start}
                  &ndash;{span.end}
                </span>{' '}
                &ldquo;{span.quote}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="reveal">
        <summary>Reveal the hand-authored label (do this after you decide)</summary>
        <div className="reveal-body">
          <div className="row">
            <span className="faint small">authored as</span>
            <Badge of={expected} />
            {!declared ? (
              <span className="chip">
                not declared — ground truth treats an undeclared group as consistent
              </span>
            ) : null}
            {expected === finding.classification ? (
              <span className="pass small">matches</span>
            ) : (
              <span className="fail small">
                pipeline said {classificationLabel(finding.classification)}
              </span>
            )}
          </div>
          {why ? (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              {why}
            </p>
          ) : null}
        </div>
      </details>

      {reviewable ? (
        <ReviewForm
          packetId={packetId}
          groupKey={finding.groupKey}
          engine={engine}
          classification={finding.classification}
          existing={existing}
          writable={writable}
        />
      ) : null}
    </article>
  );
}
