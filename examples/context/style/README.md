# Example context pack: owner style

The style pack the original sector actually runs on, shipped **verbatim** rather than genericized — a real one beats a plausible one, and the details you would sand off (a named script, a dated incident, a worked example from a live experiment) are exactly what makes a style rule land.

Starter — copy into your sector's context dir (`.sector/core/style/`) and edit freely.

**Read order for a bare `style` entry: all four, `style_main.md` first.** They are complements, not alternatives — the spine, then the op-specific rules, then the blacklist to scan against before finishing.

**Producing anything a human will look at — a deck, an HTML lesson, a figure, a chart? `style_visual.md` is not optional.** Its palette is locked and its green variant is the default. Do not pick colours by taste.

| file | what it governs |
|---|---|
| `style_main.md` | the "less is more" spine + per-op rules (writing, planning, execution, external-facing) |
| `style_communication.md` | explanation discipline — the paper-walkthrough shape, reused for any "explain this" ask |
| `style_counterexamples.md` | the LLM-slop blacklist prose is scanned against before finishing |
| `style_visual.md` | **colour and layout for every visual artifact** — decks, HTML lessons, figures, charts. Locked palette, green default, per-audience ground rule, and the HTML rule: no code blocks in a page a human reads (commands as two-column rows, diagrams as HTML/SVG) |

Cards reach these through `required_context: [style]`, which resolves to this pack's index (`INDEX.md` once copied); pin a single file with `style:style_visual` when a card needs only one.

For any deck or teaching artifact, load `style_visual.md` (what it looks like) next to `style_main.md` (what to say).

**Adapting them.** Cross-references between these files are pack-local and correct once the pack sits at `.sector/core/style/`. Everything else pointing outward is the original sector's furniture and will not resolve in your repo — `sector/templates/proof_of_work_menu.md` and the worked ASCII diagram of that project's checker pipeline. Repoint them at your equivalents or cut them; they are illustrations of the rule, never the rule itself. The palette in `style_visual.md` is the original owner's; keep it or swap the hex values, but keep the structure (locked values, derived text-safe greens, per-audience ground). Its HTML tokens match the shipped plan and report pages: dark by default, light parchment as the alternative.
