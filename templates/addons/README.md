# Games and lessons: what do you need right now?

> You can outsource your thinking, but you can't outsource your understanding.
   (C) Andrej Karpathy  

This layer of games & lessons is precisely how NOT to outsource your understanding, in a way that's fun to engage in and rewards you for having a keen & critical eye for agent-generated explanations.

Choose what sounds useful:

| I want to... | Choose | Good moment (default) |
|---|---|---|
| Spot errors in an explanation of what was built | [Sabotage Hunt](games/sabotage_hunt.md) | after reading a plan and its report |
| Test my understanding against the actual code | [Quiz](games/quiz.md) | after reading a walkthrough |
| Improve the structure, with me as the designer | [Refactor Court](games/refactor_court.md) | at a milestone, or when a file has grown |
| Write the key piece myself | [Queen's Move](games/queens_move.md) | during planning, so the piece can be reserved |
| Ensure I understood something fully and correctly | [Check My Summary](games/check_my_summary.md) | after a lesson, a hunt, or a big planning session |
| Learn something first | [Lesson](lessons/lesson.md) / [walkthrough](lessons/linear_walkthrough.md) | any time |

**Everything here is customizable.** Each game is a short template your agent follows, and every rule in it is yours to change: when it is played, how it is scored, what counts, how long it takes. What follows are only defaults; the "good moment" column is only when your agent offers each one, until you tell it otherwise.

The games differ mostly in who does the explaining: in Sabotage Hunt the agent explains and you catch the errors; in Quiz the agent asks and you answer from the code; in Check My Summary you explain and the agent grades.

Check My Summary and lessons work on their own. The other games lean on the plan → build → report loop: they need a plan, a report or a walkthrough to play on.

## Scores

Every game ends with a score out of 100 and one row in a scoreboard file your agent keeps ([SCORING.md](games/SCORING.md)). Each row also records the size of the code change the game was played on, which allows you to set "personal records" (PRs): beating your earlier scores in that game on a change at least as large. The agent always says the score and whether it is a record in chat, so you can compete with your previous selves! (with zero manual tracking)

## Lessons and walkthroughs

A **lesson** teaches something you need for your project, starting from what you already know, with explanations, figures and concrete examples.

A **walkthrough** is a specific kind of lesson: it follows your actual implementation step by step, from inputs to outputs, showing the code and artifacts that explain each step.

Templates: [lessons/lesson.md](lessons/lesson.md), [lessons/linear_walkthrough.md](lessons/linear_walkthrough.md)

## Sabotage Hunt

You've read a plan and its report. Can you spot where an explanation of the implementation goes wrong?

```text
Agent writes a walkthrough based on the plan and report
        -> plants *deliberate errors* in it, key sealed
        -> you mark what looks wrong and say why
        -> agent reveals the key: planted, false alarm, or a real issue
        -> real issues are checked against the code and count double
```

This is my favourite, as it teaches you to stay critical of the agent's explanations and rewards you for it.

Template: [games/sabotage_hunt.md](games/sabotage_hunt.md)

## Quiz

You've read a code walkthrough. Now test what you understood against the code itself, including things the walkthrough might have missed.

```text
You read the walkthrough
        -> a fresh agent reads the code, NEVER the walkthrough
        -> writes T/F, multiple-choice and a few freeform questions
        -> you answer; a question the walkthrough never covered
           you can challenge as "not in walkthrough"
        -> the main agent grades; a real gap fixes the walkthrough
           and costs you nothing
```

Template: [games/quiz.md](games/quiz.md)

## Refactor Court

Understand the current architecture, then design how you'd like it to work.

```text
Agent draws and explains the current architecture
        -> optionally proposes improvements and their tradeoffs
        -> you combine, change or replace them with your own ideas
        -> agent draws the proposed design; you agree on it
        -> agent implements and checks it; compare before and after
```

Template: [games/refactor_court.md](games/refactor_court.md)

## Queen's Move

Leave one meaningful piece of the implementation for yourself, with the agent handling the surrounding work.

```text
During planning: reserve your piece and agree its checks
        -> agent builds the surrounding code, leaving your piece
           as a stub with only its objective and types
        -> you implement it and run the checks
        -> stuck? open a folded hint (costs points);
           the reference solution is held until you ask
        -> optionally compare yours with the reference
```

Template: [games/queens_move.md](games/queens_move.md)

## Check My Summary

Explain the system back in your own words and find out what you actually understood.

```text
Agree the target: a plan, a module, a report or the whole system
        -> agent privately lists the concepts it expects
           (after a planning session: a few targeted questions instead)
        -> you explain from memory, in prose or a sketch
        -> agent grades against the sources: right, wrong, left unsaid
        -> one follow-up on the biggest omission, then the verdict
```

Template: [games/check_my_summary.md](games/check_my_summary.md)