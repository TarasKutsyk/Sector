# Talk about the product in the owner's names, never in code names

A rule for owners who stay out of the code. The setup agent adds it to the agent rules file when the owner hints they do not read or want to read code.

The owner does not know and does not want to know the code: component names, files, functions, state fields, architecture. Agents that answer feature requests in that jargon make every reply unreadable to them. The fix is a single glossary tied to the actual screens, kept under the project's context files, with a labelled reference screenshot per surface where screenshots are cheap to make.

- **Every user-facing sentence about the product uses glossary names** and describes what the owner can see and do: "the Running bar now shows the budget-met banner", "open the Card sheet and tap DONE; the row seals and the toast names the minutes freed". Plans, reports, debriefs, questions, chat: all of it.
- **Code names live in code only**: plan-anchored comments, docstrings, and the Where line of a Confession. Never in the prose the owner reads.
- **A surface without a name gets one before it is discussed**: add it to the glossary (long and self-descriptive is fine; the owner does not have to remember it, only recognise it), regenerate the reference shots if the project keeps them, then use it.
- **Bloat is the agent's job to watch, not the owner's.** The owner may one day read and polish the code, so it must stay readable by hand: on every pass through a file, look for duplicated patterns, ad-hoc helpers, config knobs and dead branches, and propose a "less is more" strip, a refactor-only change that removes more than it adds. Never let three feature passes land on a file without one such check.
