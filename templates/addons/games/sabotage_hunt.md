# Sabotage Hunt

For checking that the owner really absorbed a plan and its report: the mechanism, not the paperwork. Offer it once after a report the owner has read, when the implementation has parts worth understanding. Never after a negative result.

## Play

1. Agree the scope: which plan and report, and how much time the owner has.
2. The agent writes a fresh walkthrough of the implementation from that plan and report, in the owner's style, and saves it under the games dir.
3. In that walkthrough it plants errors, as many as the walkthrough's size and the owner's time reasonably allow, each in a step that carries meaning: a wrong state owner, an inverted condition, a mechanism described the way the plan wanted it rather than the way the code does it. Never typos, never where a file is saved or how a field is formatted, unless that detail is central to the task or the owner said they want to own every detail.
4. The key (which errors, where, and how many) is sealed into the file before the owner reads a line. No re-keying after the first guess.
5. The owner reads and marks what looks wrong, with a one-line reason each.
6. The agent reveals the key, then goes through the owner's marks: planted, false alarm, or a real issue in the code or the report. A real issue is checked against the source before it counts.

## Rules

- The real plan, report and code are never touched. Only the game's own walkthrough, in the games dir, carries errors.
- The walkthrough is top-notch and honest everywhere except the planted spots. No decoys made of vague wording.
- One planted error should change the conclusion if believed.
- One slot may be a suspect: a place the agent genuinely doubts its own implementation. It is marked in the key. If the owner confirms it as real, it is a real issue, not a planted one.
- The sabotaged file is untrusted for any other purpose. A real issue found goes to the workstream card as a landmine or a follow-up, never stays only in the game file.

## What you get

The key with the owner's hits and misses, one line each; the false alarms with why they are fine; the real issues, if any, with the source line that proves them. Then the score line per `SCORING.md`: real issues count double.

## Files

The games dir, one file per hunt: `<date>_sabotage_<workstream>.md` with a loud banner that it contains planted errors. Score row in the scoreboard.
