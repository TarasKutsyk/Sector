---
kind: plan
date: YYYY-MM-DD
status: head
workstream: <name>
supersedes: null
superseded_by: null
required_context: [env.testing, style.code]
page: plans/YYYY-MM-DD_<name>.html        # THE PLAN. This Markdown file is its stub.
artifact: https://claude.ai/code/artifact/<id>   # the published page, if one was published; else leave empty
control: code-level | goal-level          # how much of the implementation the owner steers (the Control line of AGENTS.md / CLAUDE.md)
proof_of_work:
  - artifacts/<planned-proof>.png
---

# <Plan Title>

The plan is the HTML page named in `page:`, built from `templates/plan_page.html`: if your agent can publish pages (Claude's Artifact tool, for example), it is published so the owner can comment on any snippet; otherwise the owner opens the local page in a browser. This file exists so the validator, `live_docs` and supersession stamps keep working. It carries the pointer, a summary, and nothing the page does not.

## Summary

- Goal, one line: the user-visible behaviour, capability or fix that exists after this plan.
- Non-goals, one line.
- The proof the debrief links first, one line.
- Gates, one line each: name, rule, what happens if unmet.
- Overall agent-filled share of the page, as the page computes it.

## How a plan is made

1. **Interview first, then write.** The frontier rule, borrowed from mattpocock's `grilling`, with three house additions.
   - **The tree and its frontier.** The plan is a tree of decisions. The frontier is every decision whose prerequisites are settled. Each round asks the whole frontier at once, then waits for the owner. A question that depends on one still open belongs to a later round.
   - **Walk in order.** Decisions come in the order they would appear in a rigid step-by-step walkthrough. Never skip a design or implementation step to reach a later one ("don't run ahead of your father into hell"). The frontier's order becomes the walkthrough's order.
   - **Facts and definitions are the agent's job, never the owner's.** When a question needs a fact, a subagent, a grep or a run finds it. A running lookup blocks only the questions downstream of it, never the rest of the round.
   - **Each question = debrief, then question.** The debrief is everything the owner needs to answer: definitions and facts included, calibrated against the owner profile (never explain what the owner already knows, never jargon the owner has to decode). Its length follows the question, one line for an easy one, several paragraphs for a hard one; it never carries sections just because a shape mandates them. The question itself is short and crisp, with options where they exist and a recommended answer.
   - **Done** when the frontier is empty and the owner confirms a shared understanding. Only then is the page written.
   - **Provenance record, per decision:** the owner decided it (ink), the owner accepted the recommendation as offered (green), or it never came up and appears for the first time in the page (amber).
2. **Match the walkthrough to the control level** recorded in the project block of AGENTS.md / CLAUDE.md (asked once at seed time, re-askable per plan):
   - **code-level** (default): the owner steers the code surface. Walkthrough sections are implementation steps: files that change, reuse points, seams, data shapes, the verification command for each.
   - **goal-level**: the owner steers outcomes and the agent owns the code surface. Walkthrough sections are goals, each with the proof of work that shows it met and the live check the owner runs (open the app, click through, call the endpoint). Architecture appears only where a choice is hard to unwind later, marked amber or red so the owner can veto it in one line.
3. **Write the page** from `plan_page.html`, in this order: Context echo → Planned implementation walkthrough → Goal & gates (non-goals explicit) → Build discipline → Proof of work (summary). The summary is two lists: what the owner looks at to stay in the driver's seat (screenshots, demos, live runs first) and what exists for provenance and later debugging. Every sentence carries its provenance; the page computes the agent-filled share per section from the marked spans. Marking is honour-system: the agent marks its own inventions, and under-marking is the bug this shape exists to prevent.
4. **Publish and iterate.** If your agent can publish pages (Claude's Artifact tool, for example), publish the page (a copy without the doctype/html/head/body wrapper, since such tools add their own). The owner comments on snippets; on the next pass the agent answers in the thread, edits the page, republishes to the same URL, and resolves the thread. Otherwise, open the local page for the owner, take their feedback in chat, and edit the page on each pass. Repeat until the owner says frozen. If the owner said to just launch it, skip this step: freeze the first version, say in one line where the page is, and start the build. In-place editing by the owner is deferred; edits go through comments.
5. **Freeze.** The frozen page is saved under `plans/`, this stub is written next to it, both go into the card's `live_docs`. The build op implements the walkthrough section by section; the report's Confessions come from the amber and red spans first.
