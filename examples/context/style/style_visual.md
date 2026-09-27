# Visual style — colour for decks and teaching artifacts

**Applies to:** every visual artifact this project produces for a human to look at — slide decks (`.pptx`/`.pdf`), the HTML lesson/walkthrough artifacts, figures, diagrams, and any chart or plot that ends up in front of the owner or the team.

**Status:** the palette values are **locked** — copy them, never approximate. The green variant below is the **default**; use it unless this doc names a reason to switch.

Origin note: this is the original owner's palette, shipped as a worked example. Keep it or swap the hex values, but keep the structure: locked values, derived text-safe greens, a ground chosen per audience. The "how it should feel" section is the rationale — it is what lets you make a *new* colour decision this doc does not cover, so rewrite it in your own words.

---

## How it should feel

- **Illuminated-manuscript-like.** Ink text, generous whitespace, calm and deliberate — never corporate-SaaS.
- The target image: a walk in a forest on a sunny day, looking up at the sky — sky-blue, light-green, sun-gold.
- The register to aim for: neo-classical elegance and calm, with modern readability (the Distill / Transformer-Circuits family of research writing is the reference point).
- **The sunny-green/gold pairing is the main theme** — leaves with the sun passing through them. Darker tree-greens carry the load where an accent must be readable. Blue is parked for rarer elements and for things that are conventionally blue, like links.

---

## The palette (locked — copy exactly)

| Role | Hex | Use for |
|---|---|---|
| Surface | `#FFFFFF` | the ground for team-facing artifacts; panels on parchment |
| Parchment | `#FBF8F1` | the light ground for owner-facing artifacts (dark is the default, see below); panels on white |
| Ink | `#2B2A26` | all body text and headings that are not accented |
| Hairline | `#E7E1D4` | rules, borders, table gridlines, dividers |
| Sunny green | `#CFF309` | fills and highlights only — see the legibility table |
| Gold | `#F0D253` | alternative accent, fills |
| Gold deep | `#EDB937` | gold's shadow/edge |
| Gold sparkle | `#FEFC86` | gold's highlight |
| Graphite | `#5B6B7C` | secondary text, muted labels, footnotes |
| Ash | `#A08C7D` | tertiary / de-emphasised marks |
| Blue (primary) | `#0971D2` | links; the alternative accent (see variants) |
| Blue fill | `#4995EE` | progress bars, continuous fills |
| Calm blue | `#63ABF3` | soft highlights, quiet callouts |
| Warning | `#C4652F` | errors, failure states, alerts — sparingly |

**The ground depends on the audience** — this is the one rule that differs per artifact, so decide it first:

| Audience | Ground | Panels sitting on it |
|---|---|---|
| **Team / outward-facing** — decks, anything shown to other people | Surface `#FFFFFF` | Parchment `#FBF8F1` |
| **Owner-facing only** — plan and report pages, HTML lessons, walkthroughs, reading material | Night-blue `#05070F`→`#0A0D1C` with the starmap's nebula glow by default (the shipped templates), or warm cream `#FCF2D8` if the owner chose light at setup (amber `#BC450E`, red `#B83A2E` on light pages) | `#0B1020` on night, `#FFFCF3` on cream |

On the light grounds, white and parchment are the same two colours swapping roles, so an artifact never looks off-family when it changes audience. Ink holds 13.54:1 on parchment and 14.36:1 on white — both are comfortable, no contrast adjustment is needed when switching. The dark tokens are listed under HTML artifacts below.

### Derived values

The locked palette has no green that is legible as text, so two greens are derived from it. Both are stable and should be reused rather than re-derived.

| Name | Hex | What it is | Contrast on white |
|---|---|---|---|
| Forest | `#3E6B1B` | **the default primary accent** — sunny green taken deep enough to lead | 6.32:1 |
| Leaf | `#4A7C1F` | the semantic "good / honest / success" green | 5.01:1 |

Panel and border tints are locked colours alpha-composited over white, so they stay inside the palette family instead of becoming new invented hues:

| Name | Hex | Derivation |
|---|---|---|
| Green panel | `#F4FCDA` | sunny green at 18% |
| Green line | `#B3C8A1` | leaf at 42% |
| Blue panel | `#ECF5FE` | calm blue at 12% |
| Blue line | `#A9D1F8` | calm blue at 55% |
| Warn panel | `#F9F0EA` | warning at 10% |
| Warn line | `#E6BEA8` | warning at 42% |

### Legibility — which colours may carry text

Measured against white. WCAG AA needs 4.5:1 for body text and 3.0:1 for large text (18pt+, or 14pt+ bold).

| Colour | Ratio | Verdict |
|---|---|---|
| Ink `#2B2A26` | 14.36 | body text |
| Forest `#3E6B1B` | 6.32 | body text |
| Graphite `#5B6B7C` | 5.47 | body text |
| Leaf `#4A7C1F` | 5.01 | body text |
| Blue `#0971D2` | 4.88 | body text |
| Warning `#C4652F` | 4.00 | **large/bold only** |
| Ash `#A08C7D` | 3.21 | **large/bold only** |
| Blue fill `#4995EE` | 3.08 | **large/bold only** |
| Calm blue `#63ABF3` | 2.43 | **never as text** |
| Gold deep `#EDB937` | 1.81 | **never as text** |
| Sunny green `#CFF309` | 1.27 | **never as text** |

Muted text is ink at 45–60% opacity, or graphite — not a new grey invented on the spot.

---

## Roles — what to actually use where

### Default: the green variant

| Role in the artifact | Colour |
|---|---|
| Ground | White for team-facing; night (default) or parchment for owner-facing (see the table above) |
| Titles, section headings, the header bar | Forest `#3E6B1B` |
| Body text | Ink `#2B2A26` |
| Secondary text, footnotes, gray remarks | Graphite `#5B6B7C` |
| Rules, borders, table gridlines | Hairline `#E7E1D4` |
| Neutral panel fill | Whichever of parchment/white is *not* the ground |
| "Good / honest / correct behaviour" | Leaf `#4A7C1F` on green panel `#F4FCDA`, border green line `#B3C8A1` |
| "Failure / wrong / the bad case" | Warning `#C4652F` on warn panel `#F9F0EA`, border warn line `#E6BEA8` |
| Neutral-but-highlighted callout | Blue `#0971D2` on blue panel `#ECF5FE`, border blue line `#A9D1F8` |
| A dark/inverted block | Ink `#2B2A26` ground, hairline `#E7E1D4` text |
| Links | Blue `#0971D2` — in both variants, always |

### The alternative: the blue variant

Identical in every respect except that the primary accent becomes blue `#0971D2` and blue stops being available as the neutral callout colour. It exists because it is genuinely better on one axis, so switch to it when either applies:

- **The artifact leans hard on green-vs-orange semantic coding and the colour is the only channel** (no text labels on the states). Under the green default, the forest title sits close to the leaf "good" colour, and for red-green colour-blind viewers forest and warning converge. Blue keeps a wide separation from both under every vision type.
- **Small coloured text is unavoidable.** Both greens clear AA, but blue's separation from the semantic colours is worth more than forest's extra contrast when the layout is dense.

Otherwise stay on green. The known weakness of the default is documented below rather than hidden, and it is mild in practice.

### The known weakness of the green default, and the fix

Forest (titles) and leaf (the "good" state) are close enough that they read as one visual layer, and under protanopia forest and warning converge. This is acceptable **as long as coloured states also carry a word** — "guesses" / "asks" / "checks the docs" — so colour is redundant coding rather than the only channel. Always label the states.

If an artifact genuinely needs three separated layers in green: darken the title toward ink, or push the "good" panels toward the sunnier end. Do not fix it by inventing a fourth green.

---

## Per-medium notes

### Decks

- Decks are team-facing, so the ground is **white**; panels are parchment or a tinted panel colour, with a 1pt border in hairline or the matching tint line.
- The top accent bar and all slide titles take the primary accent.
- Semantic colour goes on the box title, not the body text inside it — the body stays ink for readability.
- Charts and sketch figures: build them from real PowerPoint shapes, not images, so the owner can edit them. Colour bars with the semantic roles above; never use the sunny green or gold as a bar colour if a value label sits on top of it.
- Gray remarks and caveat lines at slide bottom: graphite, italic.

### HTML teaching artifacts (lessons, walkthroughs, prep docs)

These are written for the owner to read, so they use the owner-facing ground: **dark by default**, matching the shipped plan and report pages, with warm white as the alternative (`data-theme="light"` on `<html>`). Both themes live in every page; the shipped templates carry a light/dark switch (top-right) that remembers the reader's choice, and lessons should carry the same one. Same roles otherwise. Paste-ready tokens, identical to the templates (the templates also carry the dark-only nebula background and a few refinements; copy their `<style>` block for a full match):

```css
/* dark is the default; light parchment when the owner chose it: data-theme="light" on <html> */
:root { color-scheme:dark; --ground:#05070f; --panel:#0b1020; --panel-2:#141b33; --ink:#e6e8ec; --bright:#f5f6f8; --hairline:#1d2644; --hairline-2:#2b3760; --accent:#f5f6f8; --graphite:#a9b0bc; --ash:#7988b6; --agreed:#9fd982; --new:#f5c563; --new-panel:#2e2b2a; --amber:#f5c563; --amber-panel:#2e2b2a; --amber-line:#72603d; --red:#ff9a8b; --red-panel:#261f2c; --red-line:#684449; --good:#9fd982; --good-panel:#111a2e; --good-line:#3d5441; --info:#8ab4ff; --info-panel:#182036; --info-line:#36486c; --link:#8ab4ff; }
:root[data-theme="light"] { --ground:#fcf2d8; --panel:#fffcf3; --ink:#2b2a26; --hairline:#e3ddcf; --accent:#3e6b1b; --graphite:#6b665b; --amber:#bc450e; --amber-panel:#fbe9dc; --amber-line:#eab79c; --red:#b83a2e; --red-panel:#f8e8e4; --red-line:#e9bcb4; --good:#4a7c1f; --good-panel:#f4fcda; --good-line:#b3c8a1; --info:#0971d2; --info-panel:#ecf5fe; --info-line:#a9d1f8; --bright:var(--accent); --panel-2:#f8f0dd; --hairline-2:#e3ddcf; --link:#0971d2; }
body { background: var(--ground); color: var(--ink); }
/* team-facing HTML (something other people will open): light, with --ground:#ffffff; --panel:#fbf8f1 */
```

Inline SVG figures follow the same roles: ink for labels, graphite for axis/sub-labels, accent for emphasis bars, good/warn for the semantic pair. Give every SVG an explicit background rect in the ground colour rather than leaving it transparent, so a figure keeps its intended ground if it is ever pulled out of the page.

**No code blocks in HTML artifacts (owner-set 2026-09-03).** A `<pre>` block never renders full-width: long lines and trailing comments produce a horizontal scrollbar and the right edge is lost (observed on the submodule lesson). Fenced code blocks and ASCII diagrams belong to chat turns and markdown notes, not to a page a human reads in a browser. In HTML:

- Commands go **one per row in a two-column command list** — the command in monospace, allowed to wrap (`overflow-wrap: anywhere`), the explanation in plain text beside it. Never a comment trailing the command on the same line.
- Diagrams are built from **HTML boxes (grid/flex) or inline SVG sized to the column**, never ASCII art in a `<pre>`.
- Inline `<code>` spans for names and short literals are fine.

The diagram-first rule from `style_main.md` still applies to HTML; it means an HTML/SVG diagram, not a pasted ASCII one.

### Type

HTML artifacts use Segoe UI / system-ui, as the shipped templates do; decks keep whatever font they already use. Do not change fonts as a side effect of a colour task — that is an owner decision, not an agent one.
