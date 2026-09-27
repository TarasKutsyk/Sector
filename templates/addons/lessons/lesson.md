# Lesson

A lesson is one self-contained HTML page, in the owner's style, that teaches one thing the owner needs for this project: a concept behind the implementation, a subsystem, a result and how it was obtained, or any other gap in the owner's mental model. A linear walkthrough (`linear_walkthrough.md`) is the lesson that explains an implementation step by step; it uses this shape with its own discipline for the chain.

## Before writing

Agree three things with the owner, in one exchange:

- **Scope**: what the page covers and what it leaves out.
- **Prerequisites**: what the owner already knows, so the page starts at the right step and defines the rest.
- **Goal**: what the owner should be able to do or judge after reading.

The page looks like the plan and report pages: copy the `<style>` block, the fonts and the light/dark switch from the local `report_page.html`, including its `data-theme` if the owner chose light at setup. Do not ask about the look again.

## Shape of the page

1. **Orientation.** What the page answers, why it matters here, and the key terms defined in one line each before they are used. A reader who stops here knows what the page is about.
2. **One linear chain.** Numbered sections, each one step of the argument or the mechanism, each grounded in the source whenever possible (a figure, a code excerpt, a number from an artifact) with its location. No step introduced before the reader has what it needs to follow it.
3. **Where each number came from** or **Where this is thin**: the sources of every figure and claim, and the parts the page could not verify.
4. **Check yourself.** Two to four questions the reader should now be able to answer, with the answers folded away.

## Rules

- Source-grounded throughout: every claim about the code or the results points at where it lives. Nothing invented to fill a gap; a gap is named.
- Figures where the mechanism is a flow or a structure; prose explains the figure, it never replaces it.
- Plain language, terms defined on first use, formulas only after the quantities make sense in words.
- Accurate lessons are ordinary artifacts: they go with the workstream's artifacts, never the games dir. Add the page to the card's check-me until the owner has read it.
- A lesson may end with an offer of one game on it. Once.
