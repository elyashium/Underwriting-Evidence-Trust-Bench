import { runBench, type BenchResult } from '@/lib/bench';
import { readDecisions } from '@/lib/store';

/**
 * One bench run per request, with the reviewer log read from disk.
 *
 * The analyses themselves are cached in `lib/bench.ts` because they are pure
 * functions of a frozen corpus. The decisions are not: they change whenever
 * somebody records a verdict, which is the entire point of the reviewer loop,
 * so they are re-read here rather than memoised.
 */
export function bench(): BenchResult {
  return runBench(readDecisions());
}
