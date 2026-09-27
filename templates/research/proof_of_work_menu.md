# Proof-of-Work Menu (research)

Every plan declares its proof-of-work before the run, plus one line:
"Debrief opens with: <the specific figure/comparison the owner looks at
first>". If the owner didn't specify, propose 2–3 options from this menu at
plan time — never mid-run.

| Op type | Default proof-of-work |
|---|---|
| Sweep / eval run | Plots + printed exact prompt/input examples |
| Large new-code surface | Linear walkthrough |
| Refactor | Before/after diff walkthrough |
| Data construction | Printed representative rows + counts/stats |
| Judge / scoring change | Side-by-side scored samples, old vs new |

## Artifact Rules

- Every artifact named in a report's §Proof of work gets a repo-local copy in
  `<branch>/artifacts/` — light human-inspectable files only: plots
  (png/pdf), audits and printed-example dumps (md/txt), compact metric
  summaries (json).
- Heavy files — checkpoints, caches, raw generation dumps — never enter the
  repo; they stay in the project's external results storage and are
  referenced as provenance paths only.
- Proofs-of-work are exactly the files that must outlive any storage
  migration; repo-local copies are what the starmap renders as satellites.
