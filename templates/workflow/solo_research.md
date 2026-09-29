# Solo workflow (research): you run the plan's experiments yourself

The only acceptable operating mode for autonomous experiment execution. The
goal is simple:

- the agent runs a real script
- the script saves readable standalone artifacts
- the agent interprets those artifacts
- the report is a linear chain of claims checkable against the saved artifacts

If a result cannot be reconstructed from the saved outputs, it does not count.

## Core Dogmas

1. **One real entrypoint.** The script is the experiment; the agent is only
   the operator and interpreter. Sweeps are config knobs on the script, never
   re-implemented logic in chat.
2. **Save artifacts at every meaningful step.** Markdown for human reading,
   JSON for machine state. Terminal scrollback is never the evidence record.
3. **Interpret only from saved artifacts.** run -> save -> inspect -> update
   hypothesis -> rerun. Not: watch terminal -> form a story -> maybe save.
4. **Reports are downstream of evidence.** Every conclusion references the
   exact artifact that supports it; the report is a transparent replay log,
   not a retrospective narrative.
5. **Minimize the cheating surface.** Concrete script output + readable
   artifacts + a report that links back = the owner can verify everything
   without trusting the agent's prose.
6. **Research initiative within constraints.** Hard constraints and
   verification criteria are inviolable; the initial ideas are a starting
   point. The guiding question: what would a high-taste researcher do next,
   given these results? Obvious follow-ups get run (documented); strategy
   changes get recommended, not taken unilaterally.

## Execution Loop
Execution Loop is generally defined by the corresponding plan -- plan owns the truth.

Maintain a **highlights log** during execution: surprising observations,
non-monotone metrics, things that "don't look right". It is the primary
mechanism for surfacing what the owner didn't know to ask for.

## Transparency Requirements

- **No silent reruns.** A failed run that was rerun with different settings
  appears in the report: the failure, what changed, the rerun.
- **No selective reporting.** 5 configs run, 3 failed -> all 5 appear.
  Failures are often more informative than successes.
- **No undocumented judgment calls.** "I noticed X, so I tried Y" is fine;
  silently doing Y is not.
- **No post-hoc criteria.** Discovering mid-run that the declared rule is
  wrong is a flagged criteria change, never a quiet adoption.

## Stopping policy

Fix-and-iterate first; confess only what remains. A crash, wrong path, or
judge that skipped rows is fixed and rerun within the op — it becomes a
tooling note at the report's end, never a hole in the results. Stopping
mid-plan is justified only by:

1. an explicit plan gate ("stop if X"),
2. an environmental failure needing owner-authorized changes,
3. a plan-expectation anomaly (every run diverges, a replication that doesn't
   replicate) — the agent's judgment against the plan, surfaced in
   §Confessions and §Plan recap & fidelity.

## Minimal Success Criterion

A fresh reader can open the artifacts, read the report, see exactly why each
conclusion was reached, rerun the same script path to challenge any step, and
see what the agent tried beyond the letter of the plan — and why.
