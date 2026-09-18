'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { INITIAL_REVIEW_STATE, submitReview } from '../actions';
import type { Classification, EngineId, ReviewDecision } from '@/lib/types';

/**
 * Accept / reject / unresolved, with a reason that is not optional.
 *
 * The reason field is the reason the loop exists. A one-click accept records
 * that somebody looked at a finding and nothing about what they saw, and the
 * calibration chart built on those clicks would be measuring click-through,
 * not judgement. Making the reviewer write a sentence costs them something
 * real and is chosen deliberately.
 *
 * "Unresolved" is a first-class answer rather than a way of skipping: a
 * reviewer saying the packet does not contain enough to decide is information,
 * and the scorer keeps those out of the agreement denominator instead of
 * scoring them as disagreement.
 */

const VERDICTS = [
  { value: 'accept', label: 'Accept', hint: 'the classification is right' },
  { value: 'reject', label: 'Reject', hint: 'the classification is wrong' },
  { value: 'unresolved', label: 'Can’t tell', hint: 'the packet does not say' },
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Recording…' : 'Record decision'}
    </button>
  );
}

export function ReviewForm({
  packetId,
  groupKey,
  engine,
  classification,
  existing,
}: {
  packetId: string;
  groupKey: string;
  engine: EngineId;
  classification: Classification;
  existing?: ReviewDecision;
}) {
  const [state, action] = useActionState(submitReview, INITIAL_REVIEW_STATE);
  const [reviewer, setReviewer] = useState('');

  // Reviewing sixteen packets means typing a name sixteen times otherwise.
  // Local only: there are no accounts here, and the name is a label on a row.
  useEffect(() => {
    const stored = window.localStorage.getItem('trust-bench-reviewer');
    if (stored) setReviewer(stored);
  }, []);

  const id = `${packetId}-${groupKey}`.replace(/[^a-zA-Z0-9]+/g, '-');

  return (
    <div className="review">
      {existing ? (
        <div className="decided">
          <div>
            <strong>{existing.verdict === 'unresolved' ? 'Can’t tell' : existing.verdict}</strong>{' '}
            &mdash; {existing.reason}
          </div>
          <div className="who">
            {existing.reviewer} &middot; {existing.decidedAt.slice(0, 16).replace('T', ' ')}{' '}
            &middot; recording another decision replaces this one
          </div>
        </div>
      ) : null}

      <form action={action} className="review-form">
        <input type="hidden" name="packetId" value={packetId} />
        <input type="hidden" name="groupKey" value={groupKey} />
        <input type="hidden" name="engine" value={engine} />
        <input type="hidden" name="pipelineClassification" value={classification} />

        <div className="verdicts">
          {VERDICTS.map((verdict) => (
            <label className="verdict" key={verdict.value} title={verdict.hint}>
              <input
                type="radio"
                name="verdict"
                value={verdict.value}
                id={`${id}-${verdict.value}`}
                defaultChecked={existing?.verdict === verdict.value}
              />
              <span>{verdict.label}</span>
            </label>
          ))}
        </div>

        <textarea
          name="reason"
          rows={2}
          required
          minLength={8}
          defaultValue={existing?.reason ?? ''}
          placeholder="Why? e.g. “the endorsement names the unit it adds, so this is an update rather than a contradiction”"
          aria-label="Reason for this verdict"
        />

        <div className="row">
          <input
            type="text"
            name="reviewer"
            value={reviewer}
            onChange={(event) => {
              setReviewer(event.target.value);
              window.localStorage.setItem('trust-bench-reviewer', event.target.value);
            }}
            placeholder="your name"
            aria-label="Reviewer name"
            style={{ maxWidth: 200 }}
          />
          <Submit />
          {state.status === 'error' ? (
            <span className="form-error">{state.message}</span>
          ) : null}
          {state.status === 'ok' ? <span className="form-ok">{state.message}</span> : null}
        </div>
      </form>
    </div>
  );
}
