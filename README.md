# Underwriting Evidence Trust Bench

An evaluation harness for cross-document evidence reconciliation on commercial-auto
submissions, and a small reference pipeline for it to grade.

The pipeline reads a submission packet — broker email, application, vehicle schedule,
sometimes a loss run or an endorsement — and decides, for every fact the packet asserts
more than once, whether the documents genuinely contradict each other. The harness grades
that decision against sixteen hand-authored packets, half of which contain a real conflict
and half of which contain something that only looks like one.

**The headline metric is the false-positive rate on the half that is fine.**

Every rate in this repo is a **synthetic self-test**: one engine I wrote, graded
against labels I wrote, on sixteen packets I wrote. Nothing here measures a real
system, a real book of business, or anyone else's product.

---

## Run it

```bash
npm install && npm run dev
```

Then open <http://localhost:3000>. Nothing else is required: no API key, no database, no
services. The corpus is checked into the repo and the review log is a JSON file created on
first write.

```bash
npm test        # the test suite
npm run bench   # the whole scorecard, in the terminal
npm run reset   # empty the reviewer log after a demo
```

`npm run bench` exits non-zero if any taxonomy case fails, so it works as a CI gate.
CI also runs `npm run bench:heldout` (60 generated packets the rules never saw).

---

## Why this is the interesting problem

Recall is the easy half. A checker that reports every difference between any two documents
catches every conflict there is, and an underwriter stops reading it inside a week —
because a normal, clean submission contains a dozen surfaces that disagree on their face:

- a mid-stream endorsement that adds a thirteenth truck to a twelve-truck schedule
- a value written `$1.2M` in an email and `1,200,000` on a form
- two garaging yards on the same street, one `4500 Oak St` and one `4500 Oak Ave`
- a VIN re-scanned with an `O` where a zero belongs
- a fleet count short by one because a unit is out of service, and the packet says so

Every one of those is normal. Flagging them is not caution — it is a tax on the broker and,
after the third false alarm, on the tool's credibility. So half this corpus is built out of
exactly those cases, and the number reported first is how often the pipeline interrupts
someone about a packet where nothing is wrong.

## What is in the box

| | |
|---|---|
| `src/data/packets/` | 16 synthetic submission packets, 8 true conflicts and 8 hard negatives, each with hand-authored ground truth |
| `src/lib/extract.ts` | Shape-based extraction. Every fact carries a character-offset span into the document it was read from |
| `src/lib/normalize.ts` | Money, counts, dates, VINs, addresses, limits. The rules about what may and may not be folded |
| `src/lib/link.ts` | Evidence groups: every value the packet has ever asserted for one (entity, field) pair, in arrival order |
| `src/lib/classify.ts` | Adjudication, six derived cross-field rules, and the signal-weighted confidence |
| `src/lib/naive.ts` | The baseline engine, for the ablation |
| `src/lib/external.ts` | The adapter: grades findings reported by any outside system under the same two-way contract |
| `src/lib/llm.ts` | An LLM adjudicator (same extractor/linker, model in place of the rules) — needs `GROQ_API_KEY`, never tested, only run |
| `src/lib/ocr.ts` | Synthetic glyph-noise model for the stability script |
| `src/data/heldout/` | 60 generated value-variant packets the rules never saw (6 per case, deterministic) |
| `src/data/failures/` | FAIL-001: a packet the engine gets wrong, kept out of the graded corpus on purpose |
| `src/lib/score.ts` | The scorecard: rates, confusion matrix, calibration, per-case breakdown |
| `src/lib/store.ts` | The reviewer log |
| `src/app/` | The reviewer UI |
| `tests/` | Vitest, written against the case taxonomy |

`src/lib` has **no runtime dependencies**. Next.js and React are for the UI only; the
scoring pipeline is plain TypeScript and can be read top to bottom.

## How it decides

Four reportable classifications plus an internal one, tested in this order:

| | |
|---|---|
| `unresolved` | Normalisation declined to commit, or two VINs differ only at characters that are legal in both readings. Goes to a human as an open question |
| `consistent` | Everything resolves to one value and the surfaces already agreed. Reported internally, not surfaced as a finding |
| `benign_variant` | Everything resolves to one value, but the surfaces differed and a **domain rule** was needed to reconcile them. Surfaced, because this is exactly where a string comparator gets the wrong answer |
| `supersession` | The latest document's own text marks a deliberate change. Not recency — change language, found in the source |
| `conflict` | Values disagree and nothing in the packet reconciles them |

Two design decisions carry most of the weight:

**Supersession is gated on change language, never on recency.** "The newest document wins"
is indistinguishable from "the last person to type a number was right", and would silently
resolve a Friday-afternoon typo in favour of the typo. The gate has a cost — when change
language appears in a group but the most recent assertion is not the changed one, the
finding stays a conflict — and the classifier says so in its own rationale.

**Normalisation folds only where the domain guarantees the fold is lossless.** The VIN
standard excludes `I`, `O` and `Q` precisely so they cannot be confused with `1` and `0`,
which makes `I→1`, `O→0`, `Q→0` provably safe. `5/S`, `8/B`, `2/Z`, `6/G`, `0/D` and `1/7`
are all legal in a VIN, so folding them could merge two vehicles that both exist — those
become `unresolved` instead. Street suffixes fold within a family (`Street`→`ST`) and never
across one (`ST` ≠ `AVE`). Directionals are preserved: `1220 N` and `1220 S` are two yards.

Address similarity is computed, but it is used only to decide whether two addresses are
worth *reporting* as near-duplicates. It never merges anything. Merging is exact canonical
equality and nothing else.

## Confidence, and whether to believe it

Every confidence is a weighted sum of **named** signals, and the names are printed on the
finding — a reviewer reads `temporal.explicit-change-language-in-source` and
`change.names-specific-unit`, not `0.83`. Nothing is trained: a learned score over sixteen
packets would be a lie dressed as rigour.

The honest test of a hand-built score is whether it is *calibrated*, so the scorecard draws
a reliability diagram. If the 0.9 bin turns out to be right 70% of the time, the weights are
wrong and the chart says so. There are two diagrams: confidence against the hand-authored
labels, and confidence against what a human reviewer actually did with the finding. The
second one is empty until someone reviews something, which is the honest state.

The bin edges are uneven and were chosen after seeing where the scores fell. That is a real
degree of freedom, and it is stated on the chart rather than buried: the bins are part of
the method, not a property of the data.

## The ground-truth contract

Every packet declares a hand-authored label for each group it is meant to produce a finding
for. The contract runs both ways:

- Every declared group must come back with exactly that label. Silence on one is a
  **dropped** finding.
- Every finding the engine reports that is not `consistent` must appear in the ground truth.
  An undeclared conflict is a **false positive**; an undeclared anything-else is **noise**.

The second half is what stops the engine buying recall by reporting more.

**Only the key set is reconciled against the engine's output.** Every classification *value*
in the ground truth was written by hand from the packet text before the engine ran on it.
The labels are not the engine's output copied into a fixture — that would make the scorecard
circular, and it is the failure mode this kind of harness falls into most often.

## The baseline and the ablation

A scorecard with one engine on it reports an absolute score against packets the same person
wrote, which is close to unfalsifiable. So the same documents run through a second engine
with the **same extractor and the same entity linking**, and exactly two capabilities
removed:

1. **Domain-aware comparison** — it compares raw surface strings rather than normalised
   canonicals, so `$1.2M` and `$1,200,000` are two different values.
2. **Cross-document derivation** — no arithmetic, no uniqueness constraint, no roster
   reconciliation, so a discrepancy that exists only *between* two fields is invisible to it.

Everything else is held constant, including the extractor, so the baseline is not penalised
for bad OCR handling or missed fields: it sees every fact the reference engine sees. The gap
between the two columns is therefore attributable to those two ideas and not to a parser I
hobbled.

> **The baseline is my own construction.** It is not a model of anyone's product, it was not
> derived from observing one, and nothing in this repo licenses the sentence "vendor X scores
> like the baseline". The baseline scores like the baseline.

## The reviewer loop

A scorecard graded only against labels I wrote measures agreement with me. The reviewer UI
adds a second, independent axis: a human reads a finding — with its evidence trail, its
source spans highlighted in the original document, and its named signals — then accepts,
rejects, or says they can't tell, and gives a reason. A reason is required even on an
accept, because a one-click accept records that somebody looked at something and nothing
about what they saw.

**The hand-authored label is hidden behind a disclosure.** If the answer sat next to the
buttons, a verdict would measure a reviewer's willingness to agree with a label they had
just read, and the agreement rate would be worth nothing.

Rows where the reviewer and the label disagree are listed as *disputed*. One of the two is
wrong, and those are the rows where the corpus learns something.

When two reviewers rule on the same finding, the scorecard also reports pairwise
reviewer-vs-reviewer agreement — one agreeable reviewer is not agreement, and the
rate stays null until a second person weighs in.

## Beyond the sixteen packets

The corpus fits in one head. The harness does not have to:

- **Grade an outside system.** Any pipeline — vendor, LLM, script — can report one
  claim per evidence group as JSON and be graded under the same contract:
  `npm run grade -- findings.json` (see `scripts/grade.ts` for the shape).
  Omission grades as dropped, invention as noise; there is no way to dodge the
  contract by omitting rows.
- **Grade an LLM adjudicator.** `npm run grade:llm` (needs `GROQ_API_KEY`) runs the
  same extractor and linker with a language model in place of the rules, saves the
  raw run to `data/` (gitignored), and grades it next to the reference engine.
  It takes a few minutes; re-grading a saved run is instant.
- **Held-out value variants.** `npm run bench:heldout` grades the reference engine
  on 60 generated packets (6 per case, all values unseen, deterministic seed). Same
  structures, new names/VINs/addresses/dates/amounts — a generalisation check on
  values, not on novel structures, and labelled as such. It gates CI like the main
  bench.
- **OCR stability.** `npm run ocr` flips a few percent of glyphs the way scanners
  flip them and reports which findings move. Synthetic noise on synthetic documents —
  a sensitivity measurement, not a claim about real scans.
- **One honest failure.** `src/data/failures/FAIL-001` is a clean packet the engine
  flags, displayed on the method page with the mechanism named and excluded from
  every grade. A scorecard containing only wins is advertising.

CI runs `typecheck + test + bench + bench:heldout` on every push.

## Why no numbers in this file

The rates live in the UI and in `npm run bench`, computed by one implementation, and are
deliberately not transcribed into prose here. A README figure goes stale the first time a
weight changes, and a stale number in a document about trustworthy measurement is a poor
joke.

---

## What this is not

- **Not a benchmark of any commercial product.** Nothing here was run against a vendor's
  system, no vendor's system was observed in building it, and no number in this repo should
  be compared to one. Both engines on the scorecard are mine.
- **Not a measurement over real submissions.** Every insured, address, VIN, claim and dollar
  figure is invented. No real carrier or broker data was used, and the form layouts are
  simplified equivalents of my own design — no real ACORD form text or layout is reproduced.
- **Not a statistically meaningful sample.** Sixteen packets. One flipped finding moves most
  of the rates by several points, and the corpus was written by the same person who wrote
  the rules, which bounds what any of it can mean.
- **Not evidence that the engine is right.** Passing every taxonomy case means it has the
  ten behaviours the taxonomy names. The interesting failures of a real system are the cases
  nobody thought to enumerate, and by construction this corpus contains none of them.
- **Not an underwriting tool.** The appetite and materiality thresholds the rules cite —
  the minor-loss ceiling, the material-gap ratio, the near-duplicate similarity floor — are
  my own invention for this exercise. They are not any carrier's real appetite, not taken
  from any filing, and not advice.
- **Not a hosted product.** Reviewer verdicts write to a local JSON file. On hosts with
  an ephemeral filesystem the review form disables itself and says so, rather than
  accepting verdicts it would silently discard.

## Deliberate omissions

- **LLM adjudication is a separately-graded run, not the pipeline.** `src/lib/llm.ts`
  swaps a language model in for the rule-based adjudication (same extractor, linker and
  evidence groups) and grades it with the external adapter. The scorecard stays on the
  deterministic engine either way: the LLM run is evidence about adjudication behaviour —
  including how readily a strong model invents contradictions on hard negatives — not a
  claim about any model. It needs `GROQ_API_KEY`, never runs in tests, and its numbers
  live in terminal output, never in prose here.
- **No knowledge graph, no agent framework, no vector store.** A clear scoring pipeline beats
  an impressive opaque one here, because the entire claim is auditability.
- **No auth, no tenancy, no persistence beyond a JSON file.** It is a bench, not a product.

## Licence and provenance

Synthetic data, original code. The insured names are invented; any resemblance to a real
company is accidental. Not affiliated with, endorsed by, or evaluated against any insurance
technology vendor.
