---
kind: report
date: YYYY-MM-DD
status: head
workstream: <name>
supersedes: null
superseded_by: null
plan: plans/YYYY-MM-DD_<name>.md          # the plan stub this report closes
page: reports/YYYY-MM-DD_<name>.html      # THE REPORT. This Markdown file is its stub.
artifact: https://claude.ai/code/artifact/<id>   # the published page, if one was published; else leave empty
look_at:                                   # user-facing proofs; the card nests these under this report
  - artifacts/<headline>.png
provenance:                                # open only when checking something
  - artifacts/<run>.txt
reproduction:                              # every cited artifact maps to a record; share only for the same run
  - artifacts: [artifacts/<headline>.png, artifacts/<run>.txt]
    source: "<repository + full commit ID used at run time>"
    uncommitted: "<saved patch against that commit + required new files, or none>"
    reproduce: "<command + working directory, or linked steps including setup, inputs/config versions and seeds>"
    limits: "<none known, or explicit missing/unavailable/nondeterministic parts>"
---

# <Report Title>

The report is the HTML page named in `page:`, built from `templates/report_page.html`: if your agent can publish pages (Claude's Artifact tool, for example), it is published so the owner can comment on any snippet; otherwise the owner opens the local page in a browser. This file exists so the validator, `live_docs` and supersession stamps keep working. It carries the pointer, the three-line verdict, and nothing the page does not.

## Verdict

- What now works: one line.
- Gates: one line.
- Look first: one line, the artifact the debrief links first.

## How a report is made

1. **Copy the plan's walkthrough verbatim** into the page's "Actual implementation walkthrough", section by section, provenance marks included. The owner reads the walkthrough they already know; only the deltas carry new entropy.
2. **Insert deltas where they belong**, never in a separate section. Four kinds: implementation delta (an ad-hoc choice the plan did not fix), run delta (what the run produced: results, gate outcomes, measurements), Confession (an implementation delta that could silently change the result; body is always two paragraphs, "What happened." then "What it means for you.", followed by the Where and Double-check line; "What happened." is written maximally reader-friendly: self-contained given the walkthrough section it sits in, with no knowledge of the implementation assumed, so internal names appear only in the Where line), Highlight (a run delta that surprised). Anything touching state ownership, auth, data migration, pricing, concurrency, caching, persistence, API compatibility or a metric definition is a Confession, however many there are.
3. **Resolve the gates** in the plan's own table, one run delta per row. **Fill the two proof lists** with the real artifacts and repeat them in this stub's `look_at` and `provenance`. **Map every cited artifact to a reproduction record** on the page and in this stub's `reproduction`, including supporting outputs. Share a record only for artifacts produced together; separate different code states or commands. Capture the code state at run time: save staged and unstaged changes as a patch against the recorded commit, required untracked files separately, and submodule states if used. Unsaved requirements mean reproduction is incomplete: say so in `limits`. For manual artifacts, record sources and creation steps.
4. **Write the three-line verdict** at the top of the page and in this stub. The long verdict is the chat debrief.
5. **Close**: publish the page if your agent can, stamp supersession both ways if this report replaces one, add the report to the card's `live_docs` next to its plan with the `look_at` artifacts nested under it, and add each of those artifacts to the card's `check-me` (only the owner removes them).
