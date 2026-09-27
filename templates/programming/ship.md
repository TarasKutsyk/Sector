---
kind: ship
date: YYYY-MM-DD
status: head
workstream: <name or release>
look_at:
  - artifacts/ship_<date>.md
---

# Ship: <name>

Ship is the pass before code becomes production-facing, team-facing, or hard to unwind. The checks are agreed with the owner at run time; the default is deliberately bare, because every project's real risks are its own. Topics an owner may pull in: security, performance, accessibility, observability, migration and rollback, docs and handoff.

## Scope

- Ships: <features, fixes, refactors>
- Does not ship: <explicit non-goals>

## Checks

Default when the owner names none: the test suite passes, and the headline proof of work works from a fresh state (fresh clone, empty database, or new account, whichever applies).

- <check>: <result, with its artifact>

## Verdict

Ship / do not ship / ship with these exact caveats: <…>

## Confessions

1. **<The risk most likely to hurt production or maintainability.>**
   **What happened.** <what the plan said, what was done, why: self-contained for a reader who knows only the plan, no implementation knowledge assumed>
   **What it means for you.** <the consequence, and what to decide or watch; "Nothing to decide." when so>
   Where: <file>. Double-check: <how>.
