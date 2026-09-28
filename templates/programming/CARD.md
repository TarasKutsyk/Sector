---
workstream: <name>
title: "<Human readable title>"
status: active
updated: YYYY-MM-DD
depends_on: []
required_context: [env.testing, style.code]
live_docs: []
check-me: []
---

<!--
live_docs is a tree in chronological order, newest first. A plan sits next to
its report; the report's user-facing proofs sit nested under the report, and
the map draws them as its satellites:

live_docs:
  - plans/2026-09-11_search.md
  - reports/2026-09-11_search.md:
      - artifacts/search/ctrl_p.png
      - artifacts/search/at_reference.png

check-me lists what is still waiting for the owner's eyes: proofs a report
tells them to look at, lessons produced in debt payoff. The agent adds an
item when it produces one; only the owner removes items.
-->

## Goal

Why this workstream exists and what "done" looks like: durable, distinct from `## Now`. Include owner-set operating constraints; they outlive individual plans.

## Now

One-screen current state. Rewrite in place; do not append dated updates.

## Working Claims

| Claim | Evidence | Human-facing proof |
|---|---|---|
| <claim> | <report or code path> | <artifact or demo> |

## Landmines

- <things future agents must not miss>

## Graveyard

- <dropped approaches and why>
