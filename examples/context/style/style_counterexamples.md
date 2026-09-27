# Style counterexamples — LLM-slop red flags

Patterns that mark prose as AI-written, curated against
what frontier models actually do; any agent writing prose for this project
scans its own output against this list before finishing.

## Structural / rhetorical tics

- **"Not X, but Y" contrast spam** — "This isn't a bug fix — it's a rethink
  of the pipeline." / "The problem isn't the data. It's the objective."
  Fake profundity via negation. One per section max, and only if the
  contrast is load-bearing.
- **Rule-of-3 spam** — "No hacks. No heuristics. No hand-tuning." / triadic
  verb lists: "it detects, localizes, and explains." Everything comes in
  threes, including fragment triads for punch.
- **Dramatic fragment sentences** — "And it works." / "Every single time." /
  "That's the whole trick." One-liner paragraphs deployed for fake punch.
  Same family: claim split across a setup sentence and a terse verdict
  ("Selecting on the bank could inflate hit rates. It does not.") — state it
  directly in one sentence instead.
- **Strawman pivot** — "You might think this is overfitting. It isn't."
  Manufactures a naive reader to knock down.
- **Anaphora / repeated openers** — "It failed on A. It failed on B. It
  failed silently." Rhetorical repetition as a substitute for analysis.
- **Formulaic closer** — "The question isn't whether X, but when." / ending
  on a punchy aphorism or call-to-action instead of just stopping.
- **Restating conclusion** — "In short," / "Bottom line:" / "The upshot:" —
  a summary paragraph that repeats what was just said. State the conclusion
  once.

## Words, phrases, punctuation

- **Em-dash overuse** — several per paragraph, doing the work commas and
  periods should — like this — constantly.
- **Sentence-adverb importance stamps** — "Crucially," "Critically,"
  "Importantly," "Notably," opening sentences instead of the content earning
  the emphasis.
- **"It's worth noting that…"** — and cousins ("It should be noted", "Keep
  in mind that"). Pure filler; the sentence always works without it.
- **Residual blacklist words** — "robust," "nuanced," "comprehensive,"
  "leverage," "seamless," "landscape," "ecosystem" — the survivors of the
  GPT-4-era list that still slip through. Never use unless quoting someone.
- **Fake-candor markers** — "Honestly," / "Frankly," / "To be fair," —
  simulated straight-talk with nothing risky following it.

## Register / stance tics

- **Symmetric hedged balance** — "While X offers benefits, Y presents
  challenges." Every claim ships with its counterweight; nothing is allowed
  to just be true.
- **Uniform emphasis** — everything is "key," "central," "critical"; no
  asymmetry of importance, so nothing actually is important. Humans have
  priorities; say which result is the headline.
- **Sterile positivity** — every result "exciting," every limitation "an
  opportunity"; no irritation, doubt, or genuine tradeoff talk.
- **Overexplaining from zero** — starting three steps too far back
  ("Evaluation is a core part of ML research…") for an expert reader.
- **Committee-smooth cadence** — uniform medium-length sentences,
  topic-sentence paragraphs, no friction or rhythm variation; prose
  optimized for acceptability rather than a specific thought.

## The cluster is the biggest tell

One flagged word in a paragraph is fine. Contrast spam + rule-of-3 +
balanced caveats + importance stamps + a restated conclusion in the same
passage = instant rewrite. The combination is what makes prose read as
optimized for acceptability rather than written by someone with a specific
thought.
