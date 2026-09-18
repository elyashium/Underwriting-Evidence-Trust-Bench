/**
 * `npm run reset` — empty the reviewer log.
 *
 * The review log is the only mutable state in the repo, and it is the state a
 * demo dirties. Resetting it is a one-liner, but having it as a named script
 * means nobody has to remember which file to delete, and nobody deletes the
 * wrong one.
 */

import { readDecisions, clearReviews } from '../src/lib/store';

const before = readDecisions().length;
clearReviews();

process.stdout.write(
  before === 0
    ? 'Reviewer log was already empty.\n'
    : `Cleared ${before} reviewer verdict${before === 1 ? '' : 's'}.\n`,
);
