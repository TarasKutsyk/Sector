# Scoring: one record for every game

Every game ends with a score, and every score lands in one file the owner can open: the scoreboard. The agent writes the row and says the result in chat. The owner never keeps score by hand.

## The scoreboard

Path: the games dir, `scoreboard.csv`. One header row, then one row per game played, newest last. CSV so the agent can read it back without parsing prose, and any editor or GitHub shows it as a table:

```csv
date,game,workstream,played_on,weight,score,pr,note
2026-09-21,sabotage,checkout_flow,reports/2026-09-20_login-report.md,640,75,yes,old best 60 at weight 900
```

- **played on**: the report, walkthrough or plan the game was anchored to.
- **weight**: the size of the implementation delta under review, as lines changed (added/modified plus deleted) in the report's commit range. If the range is unknown, count lines in the files the report names, and say so in the row.
- **score**: 0 to 100 before bonuses. Sabotage Hunt can exceed 100 for confirmed real issues; Refactor Court can exceed 100 for original ideas and caught conflicts. Show those bonuses separately when explaining the score.
- **pr**: personal record, like lifting: `yes` when this score beats every earlier score in the same game on a delta at least as heavy, else `no`. The agent reads the board before writing the row and puts the old best and its weight in `note`.

## What the agent says after every game

The score and how it was computed; the weight of the delta; PR or not, with the previous best and its weight. Then the row is appended. If the board does not exist yet, the first game creates it with the header row. Never rewrite earlier rows.

## Shared rules

- Never report a negative score: floor the final result at zero. Quiz, Queen's Move and Check My Summary are capped at 100.
- Fix the questions, expected concepts and checks before play. Count each achievement once; a corrected concept restores its point rather than adding another. In Court, each distinct owner decision earns its base point once; an original idea or caught conflict earns its stated bonus once.
- If the denominator is zero (no planted errors, eligible questions, design decisions, checks or expected concepts), record `N/A` for score and PR, explain why, and exclude the row from record comparisons. This includes a Quiz where all questions were excluded. Do not manufacture a score or divide by zero.

## Per-game rules

- **Sabotage Hunt**: one point per planted error found, two per real issue found and confirmed, minus half a point per false alarm. Divide by the number of planted errors, times 100.
- **Quiz**: one point per true/false or multiple-choice question answered correctly with sound reasoning; freeform answers earn 0, 1 or 2. Divide by the maximum, times 100. A question successfully challenged as not covered, or repaired because the agent got it wrong, is excluded from both earned points and the maximum.
- **Refactor Court**: one point per decision in the final design the owner made, two per idea of the owner's own that survived the conflict check, two per conflict the owner caught before the agent did. Divide by the number of decisions in the final design, times 100.
- **Queen's Move**: checks passed divided by checks, times 100; minus 10 per hint opened; 0 if the solution was revealed before the checks passed.
- **Check My Summary**: one point per expected concept the owner named correctly, minus one per wrong claim, minus 1/2 per a mixed-up, second order detail; a correct answer to the follow-up question restores its point. Divide by the number of expected concepts, times 100.