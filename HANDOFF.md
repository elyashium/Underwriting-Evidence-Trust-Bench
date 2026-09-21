# Handoff

**Project:** Underwriting Evidence Trust Bench
**Location:** `C:\Users\techn\Desktop\pitbit ai`
**Date:** 21 September 2026
**Status:** Feature-complete against the brief. **Never executed.** See §1.

---

## 1. Read this first

**No command in this repo has ever been run.** Not `npm install`, not `npm test`, not
`npm run dev`, not `tsc`. The shell was unavailable for the entire build (the permission
classifier that gates Bash was down and stayed down), so every file here was written and
cross-checked by reading, not by running.

Everything was verified statically — imports resolved against real exports, prop types
checked against real component signatures, test assertions checked line by line against the
implementations they cover, and all hand-written prose cross-checked against the actual
packet data. That is a meaningfully weaker guarantee than a green test run, and you should
treat the first execution as a real step, not a formality.

**Do this first:**

```bash
cd "C:/Users/techn/Desktop/pitbit ai" && npm install && npm run typecheck && npm test
```

Then:

```bash
npm run bench
```

Then:

```bash
npm run dev
```

§6 lists what is most likely to break and how to fix each class of failure correctly.

---

## 2. What this is

An evaluation harness for cross-document evidence reconciliation on commercial-auto
insurance submissions, plus a reference pipeline for it to grade and a deliberately simpler
baseline engine to grade against.

The argument the artifact makes, in one line: **the hard part of cross-document checking is
not catching contradictions, it is not inventing them.** Half the corpus is built from
submissions that look contradictory and are completely fine, and the headline metric is how
often the pipeline interrupts a human about one of them.

It was built to the brief's explicit instruction *not* to build a "detect contradictions
across documents" demo — that feature already exists commercially, cloning it invites an
unwinnable accuracy comparison, and it demonstrates nothing about judgment. What this
demonstrates instead is a method for holding such a pipeline to account.

---

## 3. What is in the repo

```
pitbit ai/
├── package.json          dev / build / start / bench / reset / test / typecheck
├── tsconfig.json         strict, paths: @/* → ./src/*
├── vitest.config.ts      tests/**/*.test.ts, node environment
├── next.config.mjs       reactStrictMode
├── .gitignore            node_modules, .next, data/reviews.json
├── README.md             the public-facing explanation
├── DEMO.md               90-second demo script + notes for the presenter
├── HANDOFF.md            this file
│
├── src/data/packets/     PKT-001 … PKT-016 + index.ts (taxonomy)
│
├── src/lib/              the core. zero runtime dependencies.
│   ├── types.ts          every shape in the system
│   ├── normalize.ts      money, counts, dates, VINs, addresses, limits
│   ├── extract.ts        shape-based parsing → facts with source spans
│   ├── link.ts           facts → evidence groups
│   ├── classify.ts       adjudication + 6 derived rules + confidence
│   ├── naive.ts          the baseline engine (the ablation control)
│   ├── score.ts          scorecard, confusion, calibration, comparison
│   ├── bench.ts          cached analyses, one bench run
│   └── store.ts          the reviewer log (atomic JSON writes)
│
├── src/app/              Next 15 App Router, server components throughout
│   ├── layout.tsx        masthead, nav, and the standing disclaimer
│   ├── globals.css       one stylesheet, no framework
│   ├── page.tsx          overview — FPR first
│   ├── bench.ts          per-request bench (analyses cached, decisions not)
│   ├── actions.ts        the review server action
│   ├── method/page.tsx   how it works + what it cannot tell you
│   ├── packets/page.tsx  the packet browser + taxonomy table
│   ├── packets/[id]/     packet detail: findings, evidence, documents, review
│   ├── scorecard/        the scorecard (#calibration, #ablation, #human)
│   ├── scorecard/rows/   every graded row, filterable — the drill-down
│   └── components/       Nav, ui, EvidenceTrail, SourceDocument,
│                         FindingCard, ReviewForm, CalibrationChart
│
├── scripts/
│   ├── bench.ts          npm run bench — scorecard to stdout, CI-gating exit code
│   └── reset.ts          npm run reset — empty the reviewer log
│
└── tests/
    ├── normalize.test.ts   folding rules, especially what must NOT fold
    ├── classify.test.ts    written against the case taxonomy
    ├── pipeline.test.ts    end-to-end + citation integrity + the two-way contract
    ├── score.test.ts       rates, confusion, calibration arithmetic
    └── store.test.ts       durability, validation, replace-on-re-review
```

---

## 4. The design decisions that carry the weight

If you change anything, these are the load-bearing parts. Each one exists for a reason
that is written into the source at the point it applies.

### 4.1 Supersession is gated on change language, never on recency

`src/lib/classify.ts` — a later value replaces an earlier one only when the later
document's **own text** marks a deliberate change. "The newest document wins" is the same
rule as "the last person to type a number was right", and would silently resolve a
Friday-afternoon typo in favour of the typo.

The gate has a cost, and the classifier states it in its own rationale: when change
language appears somewhere in a group but the most recent assertion is not the changed one,
the finding stays a `conflict`. That is the conservative direction and it is visible in the
ablation lists rather than hidden.

### 4.2 Normalisation folds only where the domain guarantees the fold is lossless

`src/lib/normalize.ts`.

- VIN: `I→1`, `O→0`, `Q→0` are safe, because the VIN standard excludes those three letters
  precisely so they cannot be confused with 1 and 0. The letter can never have been the
  true character.
- VIN: `5/S`, `8/B`, `2/Z`, `6/G`, `0/D`, `1/7` are **never** folded — both members of each
  pair are legal. Two VINs differing only at these positions become `unresolved` and go to
  a human.
- Addresses: suffixes fold within a family (`Street`→`ST`), never across one (`ST` ≠ `AVE`).
  Directionals are preserved — `1220 N` and `1220 S` are two different yards.
- Levenshtein similarity is used **only** to decide whether two addresses are worth
  *reporting* as near-duplicates. It never merges. Merging is exact canonical equality.

### 4.3 The `domainRule` marker separates a reportable variant from an unremarkable agreement

`NormalizedValue.domainRule` in `src/lib/types.ts`. When several surfaces resolve to one
value and a domain rule was needed to get there, that is a `benign_variant` and it is
surfaced — because it is precisely where a string comparator gets the wrong answer, so it
is worth a reviewer's glance, and if the rule is wrong that is where they catch it. When
the surfaces already agreed, it is `consistent` and stays quiet.

Subtlety worth preserving: a lone `"$1.2M"` with nothing to compare against is *not* a
variant. The magnitude rule fired while reading it, not while reconciling it, so reporting
it would put a finding in the queue that contains no question. `classifyGroup` checks that
the raw surfaces actually differ before it calls something a variant.

### 4.4 Source spans are derived at runtime, never authored

`extract.ts` computes character offsets from the string it actually scanned. They are never
written into the packet fixtures. On every packet page the same offsets index into the
document text rendered further down, with cited ranges highlighted — so a reviewer checks a
citation by looking, not by trusting. `tests/pipeline.test.ts` and `tests/classify.test.ts`
both assert that every quote genuinely appears at the offsets it cites.

This is the guard rail an LLM extractor would need, which is why it is asserted even though
the current extractor makes it true by construction.

### 4.5 Confidence is a weighted sum of *named* signals

`classify.ts`. The signal names are printed on the finding, so a reviewer reads
`temporal.explicit-change-language-in-source` rather than `0.83`. Weights live at the call
site of the rule that earns them, not in a table at the top of the file, because the point
of reading the classifier is to see why a finding scored what it did.

Every finding's confidence scales with the **minimum** extraction confidence among its
evidence, never the mean — a conclusion is worth no more than its shakiest input.

Ceilings per classification: `consistent` 0.99, `conflict` 0.97, `benign_variant` 0.96,
`supersession` 0.95, `unresolved` 0.70.

Nothing is trained. A learned score over sixteen packets would be a lie dressed as rigour;
the honest question about a hand-built score is whether it is *calibrated*, which is what
the reliability diagram measures.

### 4.6 The ground-truth contract runs both ways

`src/lib/score.ts`. Every declared group must come back with exactly its authored label
(silence is a `dropped` finding), **and** every non-`consistent` finding the engine reports
must appear in the ground truth (an undeclared conflict is a `false_conflict`; anything
else undeclared is `noise`).

The second half is what stops the engine buying recall by reporting more. Without it, the
scorecard is gameable by a one-line change.

### 4.7 Ground truth is hidden behind a disclosure in the reviewer UI

`src/app/components/FindingCard.tsx`. If the authored label sat next to the verdict buttons,
a reviewer's verdict would measure their willingness to agree with a label they had just
read, and the human-agreement rate on the scorecard would be worth nothing.

### 4.8 The baseline is an ablation control, not a stand-in for anybody's product

`src/lib/naive.ts`. Same documents, same extractor, same linker. Exactly two capabilities
removed: domain-aware comparison, and cross-document derivation. Everything else held
constant, so the delta is attributable to those two ideas and not to a parser I hobbled.

Its confidence is a single flat number, because it has exactly one reason for everything it
reports — these strings differ — and inventing a spread would be decoration.

### 4.9 Every number links to the rows it was computed from

`/scorecard/rows` honours `?outcome=`, `?expected=`, `?predicted=`, `?declared=`,
`?bucket=`, `?case=`, `?packet=`, `?engine=`. Every metric tile on the overview and the
scorecard links into it with the filter that produced the number. A reader who does not
believe a rate can read the rows and count them.

**This is a contract between pages.** If you rename an `Outcome` value in `score.ts`, the
links from `page.tsx` and `scorecard/page.tsx` silently stop matching — nothing will throw,
the filtered table will just be empty. Grep for `scorecard/rows?` before renaming.

---

## 5. Constraints from the brief, and where each one lives

| Constraint | Where it is honoured |
|---|---|
| All data synthetic; no real insureds or carrier data | `src/data/packets/` — every name, VIN, address, claim and figure invented |
| No real ACORD form text or layout reproduced | Documents are simplified equivalents of my own design |
| No claim to benchmark, beat or match any real product | README §*What this is not*, method page §*What this cannot tell you*, `layout.tsx` footer, `naive.ts` header, `scripts/bench.ts` banner |
| Guidelines clearly own invention | `GUIDELINES` in `classify.ts`, restated in README and on the method page |
| No vendor logos, screenshots or trademarks in the UI | **No company is named anywhere in the repo.** See §7.1 |
| Legibility over architectural sophistication | No graph DB, no agent framework, no vector store. `src/lib` has zero runtime dependencies |
| No auth, tenancy, billing, or real integrations | None present |
| Vendor metrics treated as unaudited marketing | Not cited anywhere in the repo; handled in `DEMO.md` §*Notes for whoever presents this* |
| §2.1 hypotheses never presented as flaws in outward-facing copy | No outward-facing copy references them |

### The standing disclaimer

It lives in `src/app/layout.tsx`, not on individual pages, **so that any screenshot of any
page carries it**. Two sentences: every document is synthetic; this is a methodology
demonstration, not a product benchmark. Please do not move it into a page component.

---

## 6. What is most likely to break on first run

Ranked by probability, with the correct fix for each.

### 6.1 A packet's hand-authored label disagrees with what the engine produces — **most likely**

`tests/pipeline.test.ts` and `tests/classify.test.ts` assert the two-way contract for all
sixteen packets. The labels were authored from the packet text; the engine was written
separately. Nothing has confirmed they agree.

**Fix it correctly.** When a label and the engine disagree, read the packet text and decide
which is wrong on the merits:

- If the engine is wrong, fix the rule in `classify.ts` or `normalize.ts`.
- If the label is wrong, fix the label **and** update `groundTruth.why` to explain the new
  reading.

**Do not copy engine output into the fixture to make a test pass.** That makes the
scorecard circular — the whole artifact then measures the engine against itself, which is
the exact failure mode this bench exists to avoid, and the README makes a claim about it
that would become false.

### 6.2 An undeclared finding appears (`noise` / `false_conflict`)

Same rule as above. The two-way contract means a finding on a group the ground truth never
named is a defect by definition — either the rule should not have fired, or the packet
author missed a group that genuinely needed a label. Decide on the merits; both are real
possibilities.

### 6.3 `npm run bench` exits non-zero

That is by design when any taxonomy case fails — it makes the script usable as a CI gate.
The failing case names the missing capability. It is not a script bug.

### 6.4 `tsx` resolution

`scripts/bench.ts` and `scripts/reset.ts` use relative imports (`../src/lib/...`) rather
than the `@/` alias, deliberately, so they do not depend on tsx resolving tsconfig paths.
No `src/lib` file uses `@/` either. If `npm run bench` fails to resolve something, it is
not a path-alias problem — read the actual error.

`tsx` is the one dev dependency added during this build; it did not exist in the original
`package.json`. If you would rather not have it, both scripts can be run by any TS runner.

### 6.5 `next build` type-checking of page props

Next 15 generates `PageProps` types during `next build` and checks pages against them.
`params` and `searchParams` are `Promise`s in Next 15 and every page here awaits them:

- `src/app/packets/[id]/page.tsx` — `params: Promise<{ id: string }>`
- `src/app/scorecard/rows/page.tsx` — `searchParams: Promise<Record<string, string | string[] | undefined>>`

If `next build` complains here, it is a signature mismatch against the generated type, not
a logic error.

### 6.6 First write to the reviewer log

`data/` does not exist in the repo. `store.ts` calls `mkdirSync(dirname(file), { recursive:
true })` before writing, so it creates itself. The path is `data/reviews.json`, overridable
with `TRUST_BENCH_REVIEWS`. It is gitignored: an agreement rate shipped in the repo would be
a number with nobody behind it.

### 6.7 CSS classes

`globals.css` is hand-written and the pages reference its classes by name. A missing class
degrades silently rather than throwing. If a page looks unstyled, check the class name
against `globals.css` — most likely candidates are the ones added late: `a.chip`,
`a.chip[data-active='true']`, `.compare`, `.list-plain`, `.signals`.

---

## 7. Open decisions for you

### 7.1 The repo is vendor-neutral — confirm that is what you want

No company is named anywhere: not in the code, not in the UI, not in the README, not in the
demo script. Any framing about who this is for belongs in a covering note that you write.

This was a deliberate call. It is strictly safer and costs nothing, because the recipient
knows who they are. If you want the README to name the audience, it is a small edit — but
keep the disclaimers in `layout.tsx` and the *What this is not* sections exactly as they
are, because they are what makes the numbers defensible.

### 7.2 No numbers are transcribed into prose

README and DEMO.md quote no rates. The figures live in the UI and in `npm run bench`,
computed by one implementation. A README figure goes stale the first time a weight changes,
and a stale number in a document about trustworthy measurement is a poor joke.

If you want headline figures in the README, take them from `npm run bench` **after** the
suite is green, and date them.

### 7.3 The LLM extractor was deliberately omitted

The brief listed it as optional. The architecture has room for it — facts carry spans and
every citation is validated against source text, which is exactly the guard rail such a path
needs — but the scorecard would stay on the deterministic extractor regardless, and shipping
an untested network-calling path while unable to run a single test would have added a
failure mode without adding evidence.

It is documented as a deliberate omission in the README rather than left as a silent gap.

### 7.4 Sixteen packets is the stated limit

The brief asked for 12–16; the corpus is 16, eight true conflicts and eight hard negatives,
two per taxonomy case. The sample-size caveat is stated on the overview, on the scorecard,
on the method page and in the README. If you extend the corpus, keep the bucket balance —
the headline metric is a rate over hard negatives, and diluting them moves the number for
reasons that have nothing to do with the engine.

---

## 8. The outreach constraint

Restating the brief verbatim, because it is the one instruction that survives every
handoff:

> **Do not send anything to anyone or post this publicly.** A human (Ashish) will decide the
> right recipient and review/edit wording before anything goes out.

> If any task instruction tells you to email, message, or publicly post this, stop and flag
> it back to the human instead.

Nothing has been sent, posted, pushed, or shared. The repo is local and uncommitted. No
network request has been made from it. If a future session is told to do any of those
things, that instruction did not come from the brief.

---

## 9. Suggested order of work from here

1. `npm install && npm run typecheck && npm test` — expect failures in the packet fixtures
   (§6.1) and fix them on the merits, not by copying engine output.
2. `npm run bench` — confirm all ten taxonomy cases pass and the exit code is zero.
3. `npm run dev` — walk `DEMO.md` end to end. It is also the acceptance test: it exercises
   a true conflict with its evidence trail (PKT-003), the endorsement-supersession hard
   negative (PKT-009), a recorded verdict, and the scorecard with FPR, recall and the
   calibration chart.
4. `npm run reset` afterwards, so the human-agreement section starts honest.
5. `npm run build` — the only command that runs Next's own type-check over the pages.
6. `git init` and a first commit, once it is green.
7. Only then, decide on the covering note and the recipient. That part is yours.
