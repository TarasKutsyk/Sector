# Quiz

For testing what the owner understood of an implementation against the code itself, not against the lesson they read. It also catches what the lesson left out. Offer it once after the owner has read a real walkthrough of a report.

## Play

1. Agree the scope: which report, how many questions, how deep, how much time.
2. The main agent prepares a clean brief naming the workstream, plan, report and exact code state, plus an allowlist of source files, tests and run artifacts. It checks the card, plan and report before sharing them: omit any embedded lesson/walkthrough, its summary, and links to it. If they cannot be separated safely, supply only the task scope and source pointers. Spawn the question author with no inherited conversation, or use a separate fresh session. The author uses only the cleared material to identify what matters and the actual code to establish the answers.
3. The author writes a mix of true/false, A/B/C questions and a few freeform ones from the code, each with a source reference and a one-line reasoning. Highest understanding per question: mechanisms, invariants, why a choice was made. Never file layout, formats or nitpicks.
4. Questions and key are frozen before play. The key stays with the main agent.
5. The owner answers with a one-line reason each. A question they believe the walkthrough never covered gets marked "not in walkthrough" (NIW).
6. The main agent grades against the key and resolves each "not in walkthrough" mark: if the walkthrough really did not cover it, the question leaves the maximum and the walkthrough gets fixed; if the passage exists or the answer follows from it, the passage is shown and the question counts.

## Rules

- The author never sees the walkthrough or a summary of it, including through inherited chat, embedded report sections, card live_docs or linked files. Do not follow references outside the supplied allowlist. This restricted brief overrides the usual read-all-context order for this role.
- If required evidence is outside that list, ask the main agent to check and supply it. If walkthrough content leaks into the author's context, discard that question draft and restart with a fresh author; do not claim independence.
- A question the author got wrong is repaired, the owner is not penalized, and the repair is recorded in the game file.
- If the code state at the report's commit cannot be restored, the agent says so before claiming the quiz tests that report.
- Questions with the answer in the question, or answerable without the code, are removed.

## What you get

Per question: the owner's answer, the key, the source line, one line of reasoning. Two lists after: what the walkthrough left out (fixed), and what the owner missed. Then the score line per `SCORING.md`.

## Files

The games dir, one file per quiz: `<date>_quiz_<workstream>.md` holding the author's brief, the frozen questions, and the key in a separate section the owner opens after play. Score row in the scoreboard.
