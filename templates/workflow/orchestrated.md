---
kind: context_pack
updated: 2026-09-29
---

# Orchestrated workflow: one worker per stage, the main agent as the owner's proxy

The owner invokes this by saying something like "orchestrate this: one subagent per stage, you verify". That sentence lifts any no-subagents rule the project has, for this op. Everything below is then the default; the owner does not repeat it. It needs an agent that can spawn subagents (Claude Code can). It applies to any multi-stage work: a feature pass, a multi-stage experiment, a literature search feeding an analysis. The programming and research readings are at the end.

## The owner's summary (takes precedence over every rule below)

The orchestrator is the Sector workflow the owner would run themselves, given enough time. In this mode the owner is replaced by a proxy that orchestrates agents the way the owner would (through the plan → report ops), briefing them with the owner's goals at each step (primary) and with specific criteria, the proofs of work and gates meant to capture those goals (secondary: a worker may adjust them if the work surfaces problems with the stated criteria; see rules 7 and 8).

The main criteria and the robustness overhead are agreed with the owner beforehand, in the interview round. Everything else is the proxy's to fill in with its best taste and judgement: implement the goal as stated, break it into reasonable subgoals with their own success criteria, verify each step, and steer the workers when the implementation drifts from the goal. The result must sum up into one coherent, goal-aligned report in the mandated shape that does not overload the owner: Confessions ranked by priority, no internal jargon or knowledge only the proxy and its workers share, and so on. 

The owner checks in from time to time, so the proxy may ask for critical decisions (with a proper from-scratch brief) when the task needs them, and is ready to show the key proofs of work (one or two per stage) that sum up the completed stages and let the owner judge whether this is what they want.

## The loop

```text
owner's list ──> read-back in chat ──> corrections ──> ROBUSTNESS INTERVIEW (below)
      │
      v
plan doc: one STAGE per block, in dependency order
      │
      ├─ Stage k brief = intent in observable terms
      │                + the gates agreed for this stage (numbers where numbers exist)
      │                + the checks this stage ships and which earlier checks it reruns
      │
      ├─ worker runs ──> artifacts frozen in stage k's own folder
      │              ──> checks file: PASS / FAIL / MISSED with what was measured
      │              ──> stage report: verdict, deviations measured, confessions
      │
      ├─ proxy: opens the artifacts, reads the confessions, steers or accepts
      ├─ owner: sees one artifact per stage in chat, says yes or no
      │
      v
proxy reruns the agreed checks itself ──> one synthesized report ──> card
```

## The robustness interview (before the plan is written)

Robustness is overhead the owner buys, not a default the proxy imposes. In the last planning round the proxy lays out, per stage, the optional safeguards with an honest estimate of what each would catch, and the owner picks. The estimates are the proxy's judgement from the work at hand, stated as such, for example:

- "A regression check that reruns stage 1's harness after every later stage: catches the silent breakage of an earlier result in roughly half the passes of this kind (in a 7-stage UI pass, 4 stages tripped it); costs about 10 minutes per stage."
- "3 seeds instead of 1 on the main run: catches a result that is seed noise in perhaps one run in five at this effect size; costs 3x compute."
- "A leakage check by hashing train and test rows: catches the one failure that invalidates everything, rare but total; costs 5 minutes once."
- "No checks, proofs only: fastest; the owner's eye is the only gate."

The same round asks one more question, which only the owner can answer: will the workers run the same model and effort as the proxy, or something lighter? The answer sets how much every brief locks (rule 11).

The owner may answer "just get it done" and the proxy then plans the fastest path with proofs only, records that choice in the plan, and does not add safeguards on its own. If the proxy is unsure whether a safeguard is worth its cost, it asks in one line rather than deciding.

## Rules

1. **Stages run in dependency order; parallel only where the owner declares independence.** Stages that share files or consume each other's artifacts run one at a time. Lanes that are disjoint by artifact (independent ablations, seed sweeps, two datasets, a backend lane beside a frontend lane with one owner file per lane) may fan out; merging results is the proxy's job only when it is a table join, never a code merge. Parallel verification (a second worker that only reruns checks) is cheaper and safer than parallel implementation. Unsure whether two stages are independent: ask the owner.
2. **The proxy writes no work product.** It plans, briefs, verifies from the real artifacts, steers, and reports. Exception, by owner request: short owner-driven cosmetic or editorial loops at the tail of a pass, where a hand edit is faster than a brief.
3. **A fresh brief per stage, written after the previous stage is verified.** The brief names: the stage to implement and nothing else; the previous stage reports as required reading; the files or sources to read in full; what to reuse; the invariants that must survive (data rules, scoring rules, the plan's fixed criteria); the gates agreed at the interview; the checks to ship and the earlier checks to rerun; the artifact folder; the stage report path and shape; "do not commit, do not start the later stages". Reusing one brief for every stage loses the hand-off that makes the loop work.
4. **Gates are stated in whatever terms the stage can actually be judged by, and the worker iterates against them alone.** Where numbers exist (overlap counts, metric thresholds, seed variance, reproduction tolerance), the gate is a number and the worker loops until it passes. Where they do not (a literature search, a design draft, a write-up), the gate is a checklist the owner agreed to: coverage of named venues, every claim tied to an opened source, the sections present. A gate that only proves absence of errors is weak; where two things must differ (an ablation against its baseline, two layout styles), add a gate that proves the difference. If the proxy cannot phrase a gate the worker could check without it, the stage is not ready to brief: ask the owner what "done" looks like.
5. **Checks exist to catch what can silently move, and only there.** A check is a script over saved artifacts: a metric recomputed from the saved table, shape and range assertions, a figure regenerated from its data, a UI harness. Later stages rerun earlier checks when they share infrastructure that a change can break (shared code, shared data loaders, shared config). Stages that only consume an earlier stage's frozen output (a search feeding an analysis, a table feeding a figure) rerun nothing; they cite the artifact. The robustness interview decides which checks exist at all.
6. **Artifacts are frozen per stage.** A stage writes into its own folder; a rerun of an earlier check writes to scratch, never over the proofs that stage was accepted on. Each check resets its environment at start so results do not depend on run order.
7. **Intent in observable terms.** The brief describes what the owner will see or measure, not what the code should do. Most steers come from an intent that allowed a degenerate reading; a gate that proves difference (rule 4) is the usual fix.
8. **Measured deviation is allowed; unmeasured deviation is not.** A worker may replace a brief's rule if it ran both and reports the results side by side, and the proxy decides. A worker that cannot measure the two asks through the proxy instead of choosing.
9. **Verify from artifacts, not prose.** Open every artifact the worker produced; read its Confessions in full; check that the numbers moved the right way. Steer by continuing the same worker (in Claude Code, `SendMessage`; its context is the asset) rather than re-briefing a new one.
  - IMPORTANT: the agent's artifacts & reports are the FIRST thing to read, but not the ONLY one. Always admit the possibility that the agent left some bugs & other plan misalignments it didn't report, so ALWAYS INSPECT THE FULL DIFF (code, configs etc.) before concluding that the work was executed as you & owner would expect.
10. **The owner sees one artifact per stage, mid-pass.** One figure, screenshot or excerpt in chat after each stage. Taste and intent live only in the owner's eye; the corrections that matter most tend to come from it, not from a gate.
11. **Name the rules that must not move.** Workers make defensible local choices that are global decisions (voiding a bonus, dropping a bookkeeping field, changing a metric definition, re-splitting data). If the brief does not say a rule is fixed, the worker may reasonably change it. The plan's Agent-filled decisions list is where the proxy names the ones it leaves open on purpose.
  - **How much to lock depends on how the workers compare with the proxy; ask the owner once, at the robustness interview:** "Will the workers run the same model and effort as me, or something lighter?" Only the owner knows: it depends on the models and settings they pick, on the task, and sometimes on cost, none of which the proxy can see.
    - **Workers lighter than the proxy** (a smaller model, lower effort, or a long task in unfamiliar territory): lock every choice that can be settled in advance (formats, names, thresholds, the exact method), and leave open only what genuinely depends on the run. Never count on a worker to "figure it out"; sometimes it won't. No discussions: the proxy's word is final.
    - **Workers as strong as the proxy:** treat the worker as an equal. Lock only the invariants and the gates, leave the method to the worker, and review its choices in the stage report. When a choice is genuinely uncertain, settle it in a short discussion of a few rounds with the worker; the best argument wins, whichever side it comes from.
    - **The owner doesn't say:** treat the workers as lighter. Over-locking costs a longer brief; under-locking costs a rerun.
12. **The proxy reruns the agreed checks itself at the end.** Workers' numbers are the claim; the proxy's run is the evidence. With "just get it done" there may be nothing to rerun; the proxy then opens every proof once more and says so.
13. **One synthesized report for the owner**, in the report shape: verdict first, Confessions ranked across all stages (each pointing at its stage report), decisions not in the plan, follow-ups. Stage reports stay as live docs; the owner reads only the pass report.
14. **Cards last.** The card's live_docs, Now, Landmines and updated date close the op. Nothing is committed without the owner's word.

## Known frictions, and what fixes them

- Environmental one-offs get rediscovered by every worker (a pinned tool version, a cluster path). The fix is the environment pack, required by every card, not a line in each brief. If the worker discovers a new env one-off worth knowing, the orchestrator adds it to the shared env file for the next worker
- Workers hard-wrap prose unless told not to; the brief says so, and the report shape is enforced by naming the sections.
- N stages produce N Confession lists with overlapping items; the proxy ranks them into one list rather than forwarding them.
- Reruns overwrite proofs unless rule 6 is in the recipe from the first stage; it cannot be added retroactively.
- Stage sizing: a stage that also writes its check runs 40 to 50 minutes of worker time, 300 to 500k tokens, 100 to 190 tool calls. Five or six such stages plus the proxy's verification fill a day. Split a stage that would touch more than three components at once.

## Programming reading

Stages are feature blocks; checks are unit tests plus a browser or CLI harness per block, rerun by every later block; gates are counts and pixel measurements; the owner's artifact is a screenshot. Invariants that must survive are the product's locked rules, named in every brief (its data invariants, timing and scoring rules, anything the spec fixes). If the project keeps reference screenshots or a UI glossary, the last block regenerates them so the vocabulary is current before the owner reads the report.

## Research reading

Stages follow the experiment's dependency graph: search or data prep, baseline, main run, ablations, figures, write-up. Gates: a search stage is judged by coverage and opened sources; a baseline by reproducing the reference number within a stated tolerance; a main run by the plan's pre-registered criterion; an ablation by moving the metric beyond seed variance or being reported as a null; figures by regenerating from saved tables. Checks live only where infrastructure is shared (loaders, configs, metric code); a stage that consumes a frozen artifact cites it and reruns nothing. The research solo workflow (`solo.md` in this pack) still governs every run inside a stage: one real entrypoint, artifacts saved by the script, interpretation only from saved artifacts, no silent reruns, no post-hoc criteria.
