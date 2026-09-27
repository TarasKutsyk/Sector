---
kind: report
date: YYYY-MM-DD
status: head
branch: <name>
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
- Look first: one line, the figure the debrief links first.

## How a report is made

1. **Copy the plan's walkthrough verbatim** into the page's "Actual implementation walkthrough", section by section, provenance marks included. The owner reads the walkthrough they already know; only the deltas carry new entropy.
2. **Insert deltas where they belong**, never in a separate section. Four kinds: implementation delta (an ad-hoc choice the plan did not fix), run delta (what the run produced: results, gate outcomes, measurements), Confession (an implementation delta that could silently change the result; body is always two paragraphs, "What happened." then "What it means for you.", followed by the Where and Double-check line; "What happened." is written maximally reader-friendly: self-contained given the walkthrough section it sits in, with no knowledge of the implementation assumed, so internal names appear only in the Where line), Highlight (a run delta that surprised). Anything touching masks, positions, normalization, comparisons or metric definitions is a Confession, however many there are; so is every expectation anomaly the run threw up.
3. **Resolve the gates** in the plan's own table, one run delta per row. **Fill the two proof lists** with the real artifacts and repeat them in this stub's `look_at` and `provenance`. **Map every cited artifact to a reproduction record** on the page and in this stub's `reproduction`, including supporting outputs. Share a record only for artifacts produced together; separate different code states or commands. Capture the code state at run time: save staged and unstaged changes as a patch against the recorded commit, required untracked files separately, and submodule states if used. Unsaved requirements mean reproduction is incomplete: say so in `limits`. For manual artifacts, record sources and creation steps. **Embed every proof that reasonably fits where its delta sits**, so the owner sees the result without opening a file: plots and screenshots as images (plots get `class="fig"`, which inverts a light plot in the dark theme; screenshots do not, since an inverted UI misleads), small tables as HTML tables, logs as a short excerpt (about 15 lines at most) with the path to the full file. Every embed keeps its artifact path in the caption, so the reproduction records still point at it; link only what is too big to show. The page sits in `reports/` next to `artifacts/`, so `../artifacts/<file>` works locally; a published page does not carry relative files, so upload the images with it or inline them.
4. **Park next-experiment candidates** in their own section at the end of the page, one line each; nothing is implemented until a future plan picks it.
5. **Write the three-line verdict** at the top of the page and in this stub. The long verdict is the chat debrief.
6. **Close**: publish the page if your agent can, stamp supersession both ways if this report replaces one, add the report to the card's `live_docs` next to its plan with the `look_at` artifacts nested under it, and add each of those figures to the card's `check-me` (only the owner removes them).
