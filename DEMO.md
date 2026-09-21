# Demo script

Ninety seconds, five screens, one point: **the hard part is not catching contradictions,
it is not inventing them.**

Run `npm install && npm run dev` beforehand, and `npm run reset` if a previous demo left
verdicts in the log.

---

## 0:00 — The landing page

> "This is a bench for cross-document reconciliation on commercial-auto submissions.
> Sixteen synthetic packets, all invented. The number I lead with is the false-positive
> rate on the half of the corpus where nothing is wrong."

Point at the top-left tile. Then:

> "Recall is the easy half — a checker that reports every difference between any two
> documents catches every conflict there is, and gets switched off in a week. A clean
> submission legitimately contains a dozen surfaces that disagree on their face. So half
> this corpus is built out of those."

Don't read the tiles aloud. They are there so the number arrives before the argument does.

## 0:15 — PKT-003, a conflict nobody wrote down

Open **PKT-003** from *Start here*.

> "The email says twelve trucks. The application says twelve. The schedule has thirteen
> rows. No single document contradicts itself — the finding only exists between them, in
> the arithmetic, so a field-by-field comparator never sees it."

Expand the evidence trail on the finding.

> "Every line is a citation: document, receipt date, character offsets, the quote, and what
> it normalised to. Those offsets are computed by the extractor at read time, never authored
> into the fixture."

Scroll to **The documents** and point at the highlighted spans.

> "Same offsets, same strings. You check a citation by looking, not by trusting me."

## 0:40 — PKT-009, the case that decides whether this is useful

Open **PKT-009**.

> "Twelve-unit submission, then an endorsement email adding a thirteenth. Twelve and
> thirteen disagree. A recency rule resolves it, and a recency rule is wrong — 'the newest
> document wins' is the same rule as 'the last person to type a number was right'."

> "So the gate is not recency. It is explicit change language in the source text. This
> email has it, it names the unit, it itemises the VIN and the value — you can see those as
> named signals on the finding. So it's a supersession, not a conflict, and nobody emails
> the broker."

Open the disclosure on the finding.

> "The hand-authored label is hidden until you've decided. If it sat next to the buttons,
> the agreement rate on the scorecard would only measure whether reviewers agree with a
> label they just read."

## 1:00 — Record a verdict

Accept it, with a real reason — *"the endorsement names the unit it adds"* — and your name.

> "A reason is required even on an accept. A one-click accept records that somebody looked
> at something and nothing about what they saw."

## 1:10 — The scorecard

> "False-positive rate first. Then recall. Then the per-case table, which is the useful
> read: a failing case is a missing capability, not a bad average."

Scroll to **Ablation**.

> "The same documents also run through a second engine with the same extractor and the same
> linker, with exactly two things removed: domain-aware comparison and cross-document
> derivation. Everything else held constant, so the delta belongs to those two ideas and not
> to a parser I hobbled. Both engines are mine — this is not a comparison with anybody's
> product."

Scroll to **Calibration**.

> "Confidence is a weighted sum of named signals, nothing trained. The only honest question
> about a hand-built score is whether it's calibrated, so here's the reliability diagram.
> Dots below the line are over-confidence. The right-hand chart is the same question asked
> against human verdicts instead of my labels — and the verdict you just recorded is in it."

Click a headline tile.

> "Every number links to the rows it was computed from. Nothing here is a figure you have
> to take on faith."

## 1:30 — Close

> "Sixteen packets written by the same person who wrote the rules. That bounds what it can
> mean, and the *What this is not* section says so. What it does demonstrate is a way of
> holding a reconciliation pipeline to account: hard negatives as first-class test data, a
> two-way ground-truth contract, an ablation that isolates a capability, and calibration
> against a human rather than against the author."

---

## Notes for whoever presents this

**The repo is deliberately vendor-neutral.** No company is named anywhere in the code, the
UI or the README, and no number in it was produced by running anything against a commercial
product. Any framing about who it's for belongs in the covering note, written by a human,
not in the artifact. If that's the wrong call for your audience, it's a one-file change —
but the disclaimers in `src/app/layout.tsx` and the *What this is not* sections should stay
exactly as they are, because they're what makes the numbers defensible.

**If asked "how does this compare to $VENDOR?"** — the honest answer is that it doesn't, and
can't. Nothing here was run against any commercial system. The ablation compares two engines
in this repo, and the delta is a statement about two capabilities, not about the state of
the art.

**If asked about accuracy claims** — any vendor figure quoted at you (percentages of
accuracy, hallucination-free, and so on) is unaudited marketing unless it comes with a
published method and a corpus. That's the point of the bench: the method is the artifact,
and the corpus is in the repo.

**Reset between demos.** `npm run reset` empties the reviewer log so the human-agreement
section starts honest.

**Two reviewers beat one.** One person's accept rate measures deference as much as
judgement. For a serious session, have two people independently rule on the same three
packets (PKT-003, PKT-009, PKT-015) under different reviewer names — the scorecard then
reports pairwise reviewer-vs-reviewer agreement, and any disagreement between them is
the most interesting row in the room.

**The LLM beat, without the wait.** A live `npm run grade:llm` takes minutes (95 model
calls). Run it once beforehand, then demo the instant replay: `npm run grade --` the
saved `data/llm-run-*.json`. The punchline lands the same way — a strong model catches
most conflicts and still invents contradictions on clean packets (check the false alarms
it raises that the reference engine does not) — and the numbers are byte-identical to
the live run.
