# Linear Walkthrough

The lesson (`lesson.md`) that explains how an implementation actually works, following one flow, execution order or data flow, from entry point to output, without jumping between unrelated parts. Use the lesson shape; this file adds the discipline for the chain itself.

## What "linear" means

Move through entry points, calls, transformations, decision points and outputs in the order the program does. Every new idea is motivated by the step before it. Do not reference a concept before it is introduced.

## Grounding

- Every step is grounded in the actual code, extracted, not paraphrased from memory. Show the real lines where the logic matters.
- Every claim about behavior traces to code, docstrings, types, or observed runs.
- If something is unclear, say so at that step. Never guess.

## Active reflection

While reconstructing the flow, check each step against what came before. A mismatch between what the code does and what the names or comments claim, an unhandled input, an assumption that breaks elsewhere: say it inline, at the exact step where it becomes visible, the way a colleague would. It is fine to pivot back a sentence later when the alarm turns out false; the reasoning still helps the reader. Never save these observations for the end. The walkthrough is the best chance to catch what a plain review misses.

## Style

- Plain language wherever it costs nothing in precision; explicit phrasing over terse jargon.
- Each major step: short prose, the code that matters, one figure of the mechanism, one sentence tying the figure back to the code. Small local figures, never one mural.
- Formulas after the quantities are named in words; every symbol a short name for an idea the reader already has.
- Do not skip steps that seem obvious; that is where the bugs hide.
- Mechanism over description: "X calls Y, which mutates Z, so W" rather than "X handles Y".

## Anti-patterns

- A high-level summary with no execution detail.
- Explaining what the code is supposed to do instead of what it does.
- Behavior the code does not support.
- A concept that appears with no reason to appear at that point.
