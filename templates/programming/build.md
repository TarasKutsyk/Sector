# Build Discipline

Implement exactly the approved plan or user request.

## Principles

- Reuse first: scan nearby code before adding new abstractions.
- Match the codebase's existing style unless there is a clear reason not to.
- Prefer a few clear lines over a forest of defensive checks, fallbacks, knobs,
  failure handling, and optimizations the user did not ask for.
- Fail loudly on unexpected states. Add robustness only when it is part of the
  task or genuinely expected in normal use.
- Keep code easy for the human owner to read and take over.
- Use plan-anchored comments where code implements a specific plan item.
- Use docstrings generously for non-obvious mechanisms, data flow, public
  helper contracts, tests, and risky control flow.
- Do not hide important behavior behind tiny over-abstracted helpers.
- Verify only what matters for the claimed result, then show that proof in the
  Report.

Make your lines count. If a check, abstraction, fallback, or optimization does
not protect a real requirement, remove it or ask first. This constraint does
not apply to comments and docstrings: explanatory text is allowed to be verbose
when it makes the code easier for the user to own.

**Deviations.** Minor technical failures (a crash, a wrong path, a flaky install) are fixed and rerun as part of the work, never left as "double-check" items. Stop and report instead only for an explicit plan gate, a risky environment change the owner must authorize, or a result that contradicts what the plan assumed.

## Reuse-First Rule

Before writing new code:

1. Scan existing files for reusable logic that solves a nearby problem.
2. Prefer exposing one small shared helper over copying logic into a new place.
3. If no clean refactor is visible and the new code would create a second
   pattern, ask whether to write from scratch.
4. If the codebase does something one way in one place, do it the same way
   everywhere unless there is a clear reason not to. Disclose divergence.

## Plan-Anchored Comments

Where code implements a named plan item, anchor the comment or docstring to the
literal plan phrase:

```python
def apply_discount_quote(cart, code):
    """Apply promo-code pricing to the backend quote.

    Plan "Backend quote is source of truth": checkout must not recalculate
    discounts in frontend state. This function is the single discount
    application point used by preview and final payment intent creation.
    """
```

Use comments to connect plan intent to implementation. Do not tag boilerplate
with fake plan references.

## Bloat Watch

During iterative sessions, every few turns re-scan the touched files and ask:

- Did we add a helper that only has one shallow call site?
- Did we add options, fallbacks, or configuration the user did not ask for?
- Did we mix refactor and behavior change?
- Did the simple path become harder to read?

If yes, pause and propose a small cleanup before continuing.

## Verification

Verification should be proportional:

- UI feature: screenshot or short recording + targeted test if practical.
- API behavior: request/response transcript + targeted test.
- CLI/tooling: command transcript + output file/sample.
- Library/helper: focused unit tests and a tiny usage example.
- Refactor: before/after behavior check + diff walkthrough.

Do not claim success from code inspection alone when a runnable proof is
available.
