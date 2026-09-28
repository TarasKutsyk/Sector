---
branch: <name>
title: "<Human readable title>"
status: active   # forming | active | dormant | merged | closed | reference
updated: YYYY-MM-DD
depends_on: []              # branch -> branch edges (map ordering, write-ups)
required_context: [env]     # context packs, resolved under the context dir;
                            # pin a variant with pack:variant (e.g. workflow:orchestrator)
live_docs: []               # the currently-valid chain, ALWAYS incl. the active plan
check-me: []                # what still waits for the owner's eyes (proofs, lessons)
---

<!--
live_docs is a tree in chronological order, newest first. A plan sits next to
its report; the report's user-facing proofs sit nested under the report, and
the map draws them as its satellites:

live_docs:
  - plans/2026-09-11_sweep.md
  - reports/2026-09-11_sweep.md:
      - artifacts/sweep/frontier.png
      - artifacts/sweep/printed_examples.md

check-me: the agent adds an item when it produces a proof or a lesson; only
the owner removes items.
-->

## Branch goal

Why this branch exists and what "done" looks like: the durable statement, distinct from `## Now` (current state). At most 5 lines plus a pointer to the full spec/vision doc if one exists. Include any owner-set operating constraints (e.g. time caps) here, since they outlive individual plans.

## Now

Current state in one screen at most. REWRITTEN in place, never appended: appending is the disease that kills master docs (stacked update sections, stale tables below fresh ones). History lives in git and in the dated reports, not here.

## Results

| Claim | Evidence | Figure |
|---|---|---|
| <claim> | <report path> | <artifact path> |

The only current numbers. One row per live claim.

## Landmines

- <"DO NOT re-break" fact, with the causal mechanism why>

## Graveyard

- <one line per dead end + why it died (append-only)>
