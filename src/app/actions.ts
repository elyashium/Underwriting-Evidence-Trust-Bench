'use server';

import { revalidatePath } from 'next/cache';

import { ReviewValidationError, isReviewStoreWritable, recordReview } from '@/lib/store';
import type { Classification, EngineId, ReviewVerdict } from '@/lib/types';

/**
 * The one write path in the application.
 *
 * Everything else on this site is a pure function of a frozen corpus; this is
 * where a human's judgement enters, and it is the input the human-agreement
 * half of the scorecard is built from. It validates in `store.ts` rather than
 * here so the same rules apply to a decision recorded from a script or a test.
 */

export interface ReviewFormState {
  status: 'idle' | 'ok' | 'error';
  message: string;
}

export const INITIAL_REVIEW_STATE: ReviewFormState = { status: 'idle', message: '' };

const VERDICTS: ReviewVerdict[] = ['accept', 'reject', 'unresolved'];

export async function submitReview(
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const packetId = String(formData.get('packetId') ?? '');
  const groupKey = String(formData.get('groupKey') ?? '');
  const engine = String(formData.get('engine') ?? 'reference') as EngineId;
  const pipelineClassification = String(
    formData.get('pipelineClassification') ?? '',
  ) as Classification;
  const verdict = String(formData.get('verdict') ?? '') as ReviewVerdict;

  if (!VERDICTS.includes(verdict)) {
    return { status: 'error', message: 'Pick accept, reject, or unresolved.' };
  }

  // Serverless hosts have no durable filesystem. Refuse up front rather than
  // accepting a verdict and then failing to store it.
  if (!isReviewStoreWritable()) {
    return {
      status: 'error',
      message:
        'Verdicts are disabled on this host — its filesystem is ephemeral, so ' +
        'a recorded decision would vanish. Run `npm run dev` locally to review.',
    };
  }

  try {
    recordReview({
      packetId,
      groupKey,
      engine,
      pipelineClassification,
      verdict,
      reason: String(formData.get('reason') ?? ''),
      reviewer: String(formData.get('reviewer') ?? ''),
    });
  } catch (error) {
    if (error instanceof ReviewValidationError) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }

  // The scorecard's human-agreement panel is computed from this log, so it has
  // to be recomputed as soon as a verdict lands.
  revalidatePath(`/packets/${packetId}`);
  revalidatePath('/scorecard');

  return { status: 'ok', message: 'Recorded.' };
}
