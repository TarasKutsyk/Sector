# Queen's Move

For writing the piece that matters yourself. The agent builds everything around one function or module slice the owner reserved; the owner writes that slice. It should feel like a well-designed tutorial exercise or a coding challenge, moderate to hard, never a chore.

## Play

1. During planning the owner picks the piece: one function or a small module. Together they agree its interface, its expected behavior, and the checks that will judge it. The plan records this.
2. After the plan is locked, the agent builds the surrounding code and the checks, leaving the reserved body as a stub that raises "not implemented". The stub carries the objective in its docstring, the type annotations, and tensor or data shapes for inputs and outputs when relevant. Nothing else in the way of hints.
3. Hints exist, two or three, each in a collapsed block the owner opens on purpose. The reference solution sits in a separate file the agent holds until asked.
4. The owner implements the body and runs the checks.
5. Checks pass: done. Checks fail: the owner reads the failing check, tries again, opens a hint if they want one.
  - If the interface turns out wrong, the owner and the agent revisit that bounded part of the plan together; the agent never rewrites the reserved body on its own.
6. There may be a bounded refinement phase where both the agent and the owner try to understand in what aspects the reference solution was better or not. The agent should objectively help the onwer about it, in neither defensive nor attacking manner, opening with "Compared to yours, the reference solution adds X, drops Y, and does Z differently... I would keep as is/change this and that". Always acknowledge where the owner's solution was better or more plan-aligned, and help transfer only high-value improvements, never nit-picks.

## Rules

- The agent must not fill in the reserved code, overwrite or give any hints about it unless asked.
- Checks test intended behavior, never similarity to the reference solution.
- No time or difficulty estimates, no inline hints, no requirement to beat anything.

## What you get

A working whole with the owner's code inside it, the checks that prove it, and the hints left unopened. Then the score line per `SCORING.md`: checks passed, minus opened hints.

## Files

The stub and checks live in the real code, since nothing is planted. The hints and the reference solution live in the games dir: `<date>_queens_move_<workstream>.md`. Score row in the scoreboard.
