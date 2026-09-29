---
kind: plan
date: YYYY-MM-DD
status: head
supersedes: null
superseded_by: null
required_context: [env, lens:<variant>, workflow.solo]   # what the implementer loads; workflow.solo or workflow.orchestrated
page: plans/YYYY-MM-DD_<name>.html        # THE PLAN. This Markdown file is its stub.
artifact: https://claude.ai/code/artifact/<id>   # the published page, if one was published; else leave empty
---

# <Plan Title>

The plan is the HTML page named in `page:`, built from `templates/plan_page.html`: if your agent can publish pages (Claude's Artifact tool, for example), it is published so the owner can comment on any snippet; otherwise the owner opens the local page in a browser. This file exists so the validator, `live_docs` and supersession stamps keep working. It carries the pointer, a summary, and nothing the page does not.

## Summary

- Goal, one line.
- The artifact the debrief links first, one line.
- Gates, one line each: name, rule, what happens if unmet (retry/stop/ignore etc.).
- Overall agent-filled share of the page, as the page computes it.

## How a plan is made (new HTML-based workflow)

1. **Interview first, then write.** The frontier rule, borrowed from mattpocock's `grilling`, with three additions.
   - **The tree and its frontier.** The plan is a tree of decisions. The frontier is every decision whose prerequisites are settled. Each round asks the whole frontier at once, then waits for the owner. A question that depends on one still open belongs to a later round.
   - **Walk in order.** Decisions come in the order they would appear in a rigid step-by-step walkthrough. Never skip a design or implementation step to reach a later one ("don't run ahead of your father into hell"). The frontier's order becomes the walkthrough's order.
   - **Facts and definitions are the agent's job, never the owner's.** When a question needs a fact, a subagent or a measurement finds it. A running lookup blocks only the questions downstream of it, never the rest of the round.
   - **Each question = debrief, then question.** The debrief is everything the owner needs to answer: definitions and facts included, calibrated against what you know about the owner (never explain what the owner already knows, never use jargon the owner has to decode). Its length follows the question, one line for an easy one, several paragraphs for a hard one; it never carries sections just because a shape mandates them. The question itself is short and crisp, with options where they exist and a recommended answer.
   - **The last question: the workflow mode**, asked only when `orchestrated.md` is installed in the workflow pack: "How should this run? **(a) solo (default)**: I build it myself (b) orchestrated: one subagent per stage, I verify". The answer goes into `required_context` (`workflow.solo` or `workflow.orchestrated`) and heads the page's Workflow section. With solo alone, name `workflow.solo` without asking.
   - **Done** when the frontier is empty and the owner confirms a shared understanding. Only then is the page written.
   - **Provenance record, per decision:** the owner decided it (ink), the owner accepted the recommendation as offered (green), or it never came up and appears for the first time in the page (amber).
2. **Write the page** from `plan_page.html`, in this order: Context echo → Planned implementation walkthrough → Goal & gates → Workflow → Proof of work (summary). The summary is two lists: what the owner reads to stay in the driver's seat (figures first) and what exists for provenance and later debugging. The walkthrough is the body: every implementation step is a section, including "produce proof-of-work X" steps and, for every metric or instrument the agent designs, the expected values they must give (or more broadly, their expected behavior). So every sentence shows where it came from; the page computes the agent-filled share per section from the marked spans. Marking is honour-system: the agent marks its own inventions, and under-marking is the bug that the agent will answer for.
3. **Publish and iterate.** If your agent can publish pages (Claude's Artifact tool, for example), publish the page (a copy without the doctype/html/head/body wrapper, since such tools add their own). The owner comments on snippets; on the next pass the agent answers in the thread, edits the page, republishes to the same URL, and resolves the thread. Otherwise, open the local page for the owner, take their feedback in chat, and edit the page on each pass. Repeat until the owner says frozen. If the owner said to just launch it, skip this step: freeze the first version, say in one line where the page is, and start executing. In-place editing by the owner is deferred; edits go through comments.
4. **Freeze.** The frozen page is saved under `plans/`, this stub is written next to it, both go into the card's `live_docs`. Execution implements the walkthrough section by section; the report's Confessions come from the amber and red spans first.
