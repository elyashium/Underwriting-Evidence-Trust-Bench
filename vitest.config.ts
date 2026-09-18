import { defineConfig } from 'vitest/config';

/**
 * The test suite touches only `src/lib` and `src/data`, both of which are plain
 * TypeScript with no dependencies and no framework imports. That is deliberate:
 * the scoring pipeline has to be runnable and verifiable without booting the
 * web app, because the scorecard is the artifact and the UI is the viewer.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
});
