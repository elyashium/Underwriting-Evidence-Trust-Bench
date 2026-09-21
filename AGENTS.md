# AGENTS.md

## Commands

```bash
npm install && npm run dev   # http://localhost:3000, no API key / DB / services
npm test                     # vitest run, whole suite
npm run bench                # terminal scorecard; exits non-zero on any taxonomy failure (CI gate)
npm run reset                # empty the reviewer log after a demo
npm run typecheck             # tsc --noEmit
npm run test:watch            # vitest watch mode
```

Run a single test file: `npx vitest run tests/<name>.test.ts` (e.g. `tests/pipeline.test.ts`).
No lint or formatter config exists; `typecheck + test + bench` is the verification chain.

## Architecture

- `src/lib/` is dependency-free plain TypeScript. Next.js/React are UI-only (`src/app/`). Keep it that way — tests run in `node` env and touch only `src/lib` + `src/data` (see `vitest.config.ts`).
- Pipeline order: `extract.ts` → `normalize.ts` → `link.ts` → `classify.ts` → `score.ts`. Entry point for full run: `src/lib/bench.ts` (`runBench`); CLI wrapper is `scripts/bench.ts`.
- `src/lib/naive.ts` is the ablation baseline: same extractor + linker, minus domain-aware comparison and cross-document derivation. Keep that parity when editing extraction/linking.
- `src/data/packets/` holds 16 packets (`PKT-001.ts`…`PKT-016.ts`, re-exported via `index.ts` with `PACKETS` + `TAXONOMY`): 8 `true_conflict` / 8 `hard_negative` across 10 taxonomy cases.
- Path alias: `@/*` → `./src/*` (`tsconfig.json`). Node >= 20.9.

## Gotchas that fail tests / bench

- **Ground-truth two-way contract** (`src/lib/types.ts`, enforced in `tests/pipeline.test.ts`): every key in `groundTruth.expected` must come back with exactly that label (missing = dropped), AND every non-`consistent` finding must appear in `expected` (extra `conflict` = false positive, extra anything-else = noise). Adding a finding without updating the packet's `expected` map fails the bench.
- **Classification order** (`classify.ts`): `unresolved` → `consistent` → `benign_variant` → `supersession` → `conflict`. Don't reorder without updating rationale.
- **Supersession is gated on explicit change language in the source text** (`Fact.changeIntent`, derived from document text — never `documentKind` or recency). Newest-document-wins is explicitly wrong here.
- **Normalization folds only where lossless**: `I→1, O→0, Q→0` in VINs are safe (those letters are illegal in VINs); `5/S`, `8/B`, `2/Z`, etc. stay `unresolved`. Street suffixes fold within a family (`Street→ST`), never across (`ST ≠ AVE`); directionals preserved (`1220 N ≠ 1220 S`). Address similarity is report-only, merging is exact-canonical-equality only.
- **Facts carry char-offset `SourceSpan`s** into `SubmissionDocument.content` (plain text). Spans are computed by the extractor at read time — never hand-author them into fixtures.
- **Reviewer log** is `data/reviews.json` (gitignored; override via `TRUST_BENCH_REVIEWS`). Missing file = empty, not an error; malformed JSON must throw, never silently overwrite (`store.ts`). `recordReview` requires a reviewer name and `reason.trim().length >= 8`, even on accept. Use `npm run reset`, don't delete files by hand.
- `GUIDELINES` thresholds in `classify.ts` and all packet data are invented for this exercise — not any carrier's appetite, not advice. Repo is deliberately vendor-neutral: keep the disclaimers in `src/app/layout.tsx`, `README.md` (*What this is not*), and `scripts/bench.ts` verbatim; never compare numbers to a commercial product.
