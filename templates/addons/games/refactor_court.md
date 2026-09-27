# Refactor Court

For implementation debt, with the owner as the designer. The agent teaches the current architecture, the owner composes the design they want, the agent builds only that. Offer it at a milestone or when a file has grown past what a human would keep.

## Play

1. Agree the area, the time budget, and what "better" means here: fewer moving parts, easier maintainance, easier to test, easier to read by hand.
2. The agent gives an architecture lesson of that area: what the parts are, who calls whom, where state lives. It is visual first: at least one crisp figure of the current design, and for a complex area several, each breaking one component further. Prose only explains the figures.
3. Optionally the agent adds refactoring proposals, each with its benefit, its cost, and how it interacts with the others. Keeping the current design is listed as a valid option.
4. The owner composes the target design: some proposals, some modified, some of their own ideas. They say why.
5. The agent draws the target design as a figure of its own, checks the combination for conflicts and behavior changes, and discusses them. The owner adjusts or confirms.
6. The agent implements the agreed design in a refactor-only change, runs the checks, and shows the before and after figures side by side.

## Rules

- Figures are the medium. A court without a before figure and an after figure has not happened.
- No behavior change unless the owner approved it by name. No commit without the owner.
- The owner's rationale is recorded with the design; it is the durable explanation of why the code is shaped this way.
- No forced deletion case, no docket to vote on. The owner designs; the agent advises and builds.

## What you get

The lesson page, the target design figure, the diff of the refactor, the checks that passed, and the owner's rationale. Then the score line per `SCORING.md`: the owner's own ideas and caught conflicts count double.

## Files

The lesson and the figures go with normal reports and artifacts, nothing is planted. The rationale goes into the workstream card's Landmines or Graveyard as one line each. Score row in the scoreboard.
