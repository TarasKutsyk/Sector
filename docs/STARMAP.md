# Starmap: the map of your `.sector` folder

Starmap is an optional UI layer and is meant for the moment your `.sector` folder has grown past what you can hold in your head: several workstreams, dozens of plans and reports, artifacts scattered under them. The map draws all of it as one picture and lets you work from that picture instead of from file paths.

[![Starmap demo, 90 seconds](img/starmap_demo_poster.png)](https://youtu.be/3CTNLCrJHEs)

## Run it

```bash
python tools/sector/server.py --repo .
# -> http://localhost:8377
```

That's all: the map only needs Python 3.10+ and PyYAML (`pip install pyyaml`), because its frontend ships prebuilt; you would need Node only if you wanted to change the map itself.

The map reads your `.sector` folder and never writes to your documents; the only things it saves are its own settings, i.e. which workstreams are on screen and where you dragged things.

## What you see

```text
core context row          <- your shared context files (env, style, ...)

  o  workstream A           o  workstream B           o  workstream C
  |                         |                         |
  plans on the left arcs,   reports on the right,     each plan tied to
  newest at the bottom      artifacts as small moons  its report by a
                            around their report       dotted line
```

- Each **workstream** is a star system. Hover to activate it, click the star to open its branch card.
- Each **plan or report** is a planet, arranged by date. Click one to read it in a side panel, right on the map.
- Each **artifact** a report declares (screenshots, tests, walkthroughs) is a moon around that report. Click to open; a hollow ring means the file is missing.

## What it's for

**1. Orient yourself.** Hover a system to see what it holds, and click a report to read it next to its proofs. You can drag anything to where it makes sense to you (the map remembers the positions), or hold `Shift` and drag on empty space to box-select several nodes at once; `Esc` steps back out.

**2. Find an artifact fast.** `Ctrl+P` opens a search over every file in `.sector`: type a few words (`login screenshot`) or a regex (`/2026-07.*modal/`). Pick a result and the map jumps to it, pulling the workstream on screen if it wasn't there.

**3. Seed a new plan from existing context.** Press `S` to enter selection mode, click the plans, reports, artifacts and context files the new work should build on, then place the seed where the new plan will live. The composer opens with a prompt that references your selection; type `@` inside it to add any other file by name. Pasting that prompt into your agent starts a fresh session with exactly the context you chose.

## Keys

| Key | Does |
|---|---|
| `Ctrl+P` | search every file in `.sector` |
| `S` | selection mode → composer |
| `Shift` + drag | box-select |
| `B` | layout window: which workstreams are on screen, core packs, arc style, nodes per arc |
| `E` | open the document you're reading in your editor |
| `Esc` | close panels, exit focus or selection |

Two arc styles in the layout window: **spread** puts plans on the left of each arc and reports on the right; **coupled** puts each plan next to its report.

## When you don't need it

With one or two workstreams whose files you still know by heart you won't need it, since your agent orients itself from the branch card anyway; the map starts paying off once finding a file takes longer than reading it.

## Limitations

- It has been tested only on Windows 11, in Chromium-based browsers (Chrome, Edge). The server is plain Python, so macOS and Linux should work, but nobody has checked yet.
- Opening a document in your editor (`E`) was tried only with VS Code, which is the default. Another editor should work if its command line accepts a file path: set it as `editor_cmd` in `sector-map.config.json`.
- The server listens only on your own machine, so the map is a personal view of the repo rather than something a team can open together.

---

# Developing the map (maintainers)

The context for agents that maintain, customize, or extend the Starmap itself. Users of the map can stop above this line.

## One Diagram

```text
Sector source of truth in the host repo
  |
  +--> workstream/branch cards
  |       front matter: status, updated, live_docs (tree: reports carry
  |       their proofs), required_context, check-me
  |
  +--> plans / reports
  |       durable plan and verdict-first report docs
  |
  +--> artifacts
  |       light human-facing proof-of-work
  |
  +--> core context
  |       env, style, goal/product, lens/security, etc.
  |
  +--> games
          quarantined review-game files

              |
              v
        sector_adapter.py
        host-specific roots, card names, folder names,
        config/local overlay, front matter, submit-plan writes

              |
              v
          server.py
          /api/tree, /api/file, /raw,
          /api/open, /api/submit-plan, /api/config

              |
              v
       Pixi starmap UI
       systems, planets, satellites, core row,
       reader, focus mode, coral-net selection,
       handoff composer, game prompt dialog
```

## What The Starmap Is

The starmap is the interactive UI for Sector's durable project memory.

It exists because a long-running agent-heavy repo becomes hard to hold in your
head. The starmap makes the current state visible:

- workstreams/branches become star systems
- the card becomes the root star
- plans and reports become planets
- artifact files become satellites
- context packs become the bottom row
- report nodes offer game prompts
- selected context becomes a handoff prompt for the next agent session

The map should help the user answer:

- What workstreams exist?
- What is live right now?
- What plans/reports are current?
- What proof-of-work exists?
- What context should the next agent read?
- Where should a new plan land?

## What The Starmap Is Not

It is not a replacement for Sector workflow files.

Do not move canonical state into the UI. Do not persist layout positions as the
source of truth. Do not require users to edit state through the browser. The
browser is allowed to help, but the repo files must remain legible and editable
without the UI.

Dragged node placements are the one position state that outlives a session, and they do not break that rule: they live in the ignored personal overlay (`.sector-map.local.json`, key `layout`), never in the tracked config and never in a card; they are vectors from a parent anchor rather than absolute coordinates; and deleting the key returns the map to the computed layout with nothing lost. The tracked repo still says everything about the project, and the overlay only says where this user likes their planets.

Submit-plan is a convenience path. It writes a draft plan stub and updates the
card's `live_docs`, but it does not replace the real plan discussion or the
local plan template.

## Source Of Truth

The starmap reads the host repo through `sector_adapter.py`.

The `programming_sector` preset (what setup creates, for programming and research alike):

```text
.sector/
  core/
  _games/
  workstreams/
    <workstream>/
      <WORKSTREAM>.md
      plans/
      reports/
      artifacts/
```

The `research_notes` preset, for repos that keep their notes under `notes/`:

```text
notes/
  core/
  _games/
  <branch>/
    <BRANCH>.md
    plans/
    reports/
    artifacts/
```

The adapter exists so the frontend and API tree shape do not care which layout
the host repo uses.

## Data Model

The frontend consumes `/api/tree`. Keep this output shape stable unless the UI
is intentionally being revised.

Conceptually:

```text
tree
  generated_at
  slots                 visible workstream/branch names
  all_branches          every discovered card-backed workstream/branch
  core                  context row
  branches[]
    branch
    card                root star metadata
    nodes[]             plans, reports, root docs, live files
    cluster             unstamped/stranded older docs
```

Each node should carry enough for the existing UI:

```text
id / path
kind
status
stamped
date
title
look_at
supersedes / superseded_by
plan
satellites
live
played
at_root
```

Important conventions:

- `live_docs` targets are guaranteed nodes if the file exists.
- Supersession chains resolve to node ids.
- Run directories collapse onto a main markdown file, with other files as
  satellites. Artifacts nested under a report in the card's `live_docs` are
  that report's satellites too; `check_me` marks the ones the owner has not
  looked at yet.
- Proof/artifact satellites are light human-facing files.
- Played-game detection prefers `source_report` front matter and falls back to
  path references.

## API Contract

The API is intentionally small:

```text
GET  /api/tree
GET  /api/file?path=...
GET  /raw?path=...
POST /api/open
POST /api/submit-plan
GET  /api/config
POST /api/config      (branch_slots, default_selected, editor_cmd, layout,
                       layout_style, arc_max_nodes, core_slots)
```

The UI depends on this shape. If a host repo needs a new path convention, add
it to `sector_adapter.py` rather than redesigning the browser contract.

## Visual Contract

The visual design is intentional:

- root stars are workstream/branch cards, drawn as suns: a warm white-gold body with a two-layer corona, four fixed diffraction spikes and a slow brightness pulse that brightens on the active branch and dims with its system when another one is active
- planets are docs, drawn as small gas giants: a shaded ball with three to five soft wavy bands in the doc's own hue, one deterministic band count, phase and tilt per file path
- a warm gold rim on the body edge marks live docs, with a small halo
- every halo is bounded against the camera (min(1, 1.6 / camera scale)), so zooming in on a planet never turns its glow into a haze; the branch suns keep their corona in world units, since the corona IS the sun
- the background is a deep-space vertical gradient with two or three very faint cool tints and two parallax starfields (260 far stars of radius 0.4 to 1.2, 90 near ones of 0.8 to 1.8) drawn on the STAGE rather than in the world, so a star keeps its screen size at every zoom; nothing in the background animates
- three hues and a two-letter tag distinguish the kinds: plans cool blue `PL`,
  reports warm amber `RP`, everything else muted violet-grey `DOC`, so the type
  survives a colour-blind reader and a greyscale screenshot
- one edge per tuple, aimed at its midpoint, keeps a busy branch a fan
- strands/arrows show supersession chains
- clusters collect older unstamped/stranded files, and click to expand them as
  small dim planets on the rows beyond the outermost level
- the core context row is always visible at the bottom, at a fixed span, drawing the packs picked in the Layout window and wrapping onto further rails when they do not fit; a further rail sits below the row above it AND its labels (60 world units down)
- a pack ANCHOR is a node like any other: its pack colour, a file node's size, its label the pack name, and clicking it opens the pack's `INDEX.md` (or its first file), so a pack whose only file is an index is reachable. It is a node of its own, never a stand-in for a file: every non-index file of a drawn pack has its own node and its own label, exactly once
- every visible node can be dragged, a dragged node keeps its placement, and a Shift box moves several of them at once
- every scrollable surface (the Ctrl+P list, the @ menu, the reader, the artifact list, the modals) wears the same thin dark scrollbar, on the right, and the @ menu ellipsizes long paths rather than scrolling sideways
- the camera has no scale cap: the map fills high-resolution displays and refits on resize
- labels show on-disk filenames, not H1 titles
- long labels use middle ellipsis so both ends remain visible
- the full repo-relative path is one line under the reader title

Layout is structured but not canonical:

```text
root star
  |
  +--> one arched LEVEL per DATE, newest date nearest the star; each level is a
       circle about the star and a faint guide is drawn along it
         one level = EVERY tuple of that date, up to `arc_max_nodes` nodes,
                     climbing the arc: the arc's own rise is what separates two
                     tuples whose labels share an x range
         one tuple = a plan and its report, joined by a faint dotted tie, or one
                     lone doc
         spread      all plans in the left half, all reports in the right,
                     pairs mirrored about the centre with the tie across it
         coupled     each pair a tight couple, plan then report, couples and
                     lone docs spread evenly along both flanks
         a date group past `arc_max_nodes`, or one that would reach into the
                     neighbouring system, CARRIES OVER to the next level up,
                     which is drawn with a dimmer arc guide
         supersession ancestors take their own levels beyond their head
         expanded "older" docs take the levels beyond the outermost one
  |
  +--> ONE edge leaves the star per TUPLE, aimed at the tuple's midpoint (the
       middle of the tie for a pair), so a busy branch is a fan rather than a
       bundle of one line per document. Chain arrows are unchanged.
  |
  +--> labels sit BESIDE their planet, pointing OUTWARD: a tuple's plan label to
       the left of the plan, its report label to the right of the report, so
       nothing but the tie is ever between the two
```

In `spread` the kinds are separated geometrically: every plan is left of its branch centre line and every report right of it, on every level, whatever the filenames are. The price is that a date group's reports all climb one flank, so a group of one plan and six reports takes two arcs where `coupled`, which may use both flanks, takes one. In `coupled` the promise is narrower: inside a pair the plan is left of its report.

A report pairs with its plan through the report's `plan:` front matter first, and otherwise through the filename stem with a leading `plan_`/`review_`/`report_` or a trailing `-plan`/`-report`/`-review` removed. The layout exposes the pair id on both members. A tuple's date is its report's date if it has one, else its plan's.

Every number in the layout is arithmetic, not tuning:

```text
level step     the larger of "one label height plus 6" and "enough that 0.45 of
               it clears the biggest planet plus a moon"  ->  46.7
one arc        every tuple of its DATE, up to `arc_max_nodes` nodes (default 12,
               a pair counting as two). Two tuples may share an x range once the
               arc has carried them ARC_STACK_V = 26 units apart vertically
               (half a label box plus the biggest planet radius plus a margin),
               which is what lets a seven-tuple date group climb ONE arch
               instead of carrying over at three
elevation band each level owns a band of heights: its arc ENDS sit 26 units
               above the highest planet of the level below it, so no two levels
               ever put content at the same height and the label of one can
               never slide under the other. A fixed angle, or an elevation tied
               to the level INDEX, both fail here, because content sits all
               along an arc, not only at its two ends
radius growth  a level that cannot hold its date group at
               ROOT_R + i * LEVEL_STEP is pushed outward in half-level steps
               (and every level above it follows) until it fits, or until its
               arc has all the horizontal room the system allows, past which a
               bigger radius only flattens the arc
system reach   how far either side of its star a system may draw: half a column
               less half the 30-unit neighbour margin. The arc is free to leave
               the branch column; what stops it is the neighbouring system,
               whose extent is the mirror image of this one
level width    one full tuple beside one lone doc, all labels at the 200-unit
               cap  ->  744, which is what fixes the COLUMN width (a level plus
               two 40-unit margins, at the 1.07 the active branch is drawn at)
capacity       the gap between two tuples is their two facing labels plus 40, OR
               the 26 units of climb above. The label widths are REAL (measured
               on a bare canvas with the font Pixi will use, since the level
               count is needed before any Pixi text exists)
spread         ALL plans in the left HALF of each arc and ALL
               reports in the right half, each half reading outward from the
               centre in filename order, a pair's members MIRRORED about the
               centre line with the tie across the middle, and a pair alone on
               its level stretched to the arc's ends. One ladder of distances
               shared by the two halves, so the strict side rule holds by
               construction. Spread keeps its own ELEVATION LADDER, and the packer
               checks each new member against the levels already placed inside
               it, since that ladder separates two levels' ends but not their
               middles
coupled        each pair is a tight couple instead, plan then report 32.5 units
               apart, couples and lone docs ordered kind-first by filename and
               spread evenly along the arc, using both flanks. Coupled content
               climbs the whole arc, so it uses the elevation BAND above
```

The width comes first and the height follows: capacity decides how many levels a branch needs, so a capacity read back off the level count would be circular. The readability gates stay measurable: `window.__starmap` reports label-label overlaps and label-over-planet intersections, both zero on the busiest branch at fit-camera zoom, plus the slack between the label box the layout reserved and the text Pixi actually rendered, which the capacity rests on.

Focus mode is calm rather than crowded: the other planets of the branch drop to
alpha 0.35 and their glows to 0.15, the edges and the pair ties stand down, and
the focused planet's moons settle on a ring inside 0.45 of the distance to its
nearest neighbour. The moon labels are laddered by equal steps in y on either
side of the planet, not spread by equal angles, because equal angles pile every
label onto its neighbour at the top and bottom of a ring.

Dragging sits on top of all of that without changing any of it:

```text
layoutBranch / layoutCore (pure)        saved placement (personal overlay)
            |                                      |
            +--> no entry: the computed spot       +--> pos = anchor + vector
```

A press that travels more than 5 screen px is a drag rather than a click: it moves the node under the pointer in world units, pans no camera, and on release opens nothing, pins nothing and selects nothing. A branch star drags its whole system, because the placement is applied to the branch container rather than to the children.

What gets saved is a LITERAL VECTOR from the thing's parent anchor, keyed by the repo-relative path of the thing moved: a star from its column anchor, a planet and the older-docs marker from their star, a moon from its planet, a core node from its pack anchor. Applying it means "put the node exactly there", whatever the pure layout would now compute, so adding a document or reordering the levels never moves anything the user dragged, and only undragged nodes flow with the layout. Placements are also slot-independent, so a branch removed from the slots and added back in another column lands every node in the same relative place. A file with no entry gets its computed spot, and one reset action (`reset layout` in the HUD, shown only while the map is non-empty) clears the whole map and tweens everything back.

Several nodes move at once through a box:

```text
Shift + press on empty map space -> a thin dashed cyan marquee (screen space)
  |                                 without Shift, the same press pans
  v
release -> every planet, expanded older doc and branch star whose BODY CENTRE
           is inside the box joins the group and wears a thin cyan ring
           (core nodes and moons are never boxed)
  |        a second box adds to the group; a plain click on empty space, Esc,
  |        or a drag of an ungrouped node clears it
  v
dragging any grouped node moves the whole group by the same world delta, and
the release writes one placement per grouped node in a single POST
```

In selection mode the same box also toggles the composer selection of the planets and stars it caught, so a handoff prompt can be assembled by area rather than one click at a time.

The layout is for readability and orientation. It is not a saved project state.

## Selection and the composer

Selection mode is the handoff/context composer; selected docs connect to the seed with coral threads.

```text
S pressed
  |
  v
seed follows cursor
  |
  v
click places seed
  |
  +--> inside branch/workstream column -> branch inferred
  +--> empty space -> new branch/workstream
  |
  v
default-selected context threads to seed
  |
  v
user toggles docs/context/stars
  |
  v
Lock in -> composer
  |
  +--> Copy full prompt
  +--> Submit plan
```

The seed itself is ephemeral staging and is never saved. What a submit does save is one layout placement for the plan it writes, so the new planet appears where the seed was planted instead of wherever the layout would have put it. Since a placement is a literal vector from the parent anchor, that placement IS the seed, measured from the star: nothing has to predict where the new plan would otherwise have landed. A seed placed in empty space saves a star placement for the new workstream's card instead, so its system appears where the seed was once the branch holds a slot.

## Submit-Plan Write Path

Submit-plan writes:

```text
.sector/workstreams/<name>/plans/<slug>_<date>.md
```

or, in research layout:

```text
notes/<branch>/plans/<slug>_<date>.md
```

It also prepends the new plan to the card's `live_docs` and bumps `updated`.

For a new workstream/branch, the server creates a minimal forming card first.
The adapter decides the card filename and folder conventions.

Use submit-plan for draft task briefs. The agent should still convert the stub
into the local plan template after discussion if the user wants a durable plan.

## Portable Repo Rule

The portable extraction rule is:

```text
Keep the frontend/data/API shape stable.
Put host-repo differences in sector_adapter.py.
Keep host-specific config outside the submodule.
```

Host-owned tracked config:

```text
sector-map.config.json
```

Host-owned ignored personal/session overlay:

```text
.sector-map.local.json
  port
  branch_slots
  default_selected
  editor_cmd
  layout            path -> [dx, dy] vector from the parent anchor (dragging)
  layout_style      "spread" | "coupled"            (the Layout window, B)
  arc_max_nodes     nodes one arc may hold before a date group carries over
  core_slots        the context packs the core row draws; [] means all
```

`sector_adapter.LOCAL_KEYS` is the list that decides what may be written there, and `save_local_config` never touches the tracked config. `layout` defaults to `{}` and reaches the frontend as `tree.config.layout`.

The adapter handles:

- loading config and local overlay
- resolving repo root and Sector root
- finding workstream/branch cards
- parsing front matter
- mapping custom report folder names through `reports_dir` (`reviews_dir` is also accepted)
- creating new cards from the configured convention
- updating `live_docs` and `updated`
- resolving games/artifacts/context directories
- guarding repo-relative paths

Do not add host-specific path assumptions to the frontend.

## Files To Know

```text
server.py
```

The stdlib write/read server. Owns `/api/tree`, file reads, raw artifact
serving, editor launch, submit-plan, and config endpoints.

```text
sector_adapter.py
```

The compatibility layer. Prefer changing this when a new repo shape needs
support.

```text
atlas.py
```

The validator/map/gist CLI (`check` / `build` / `gist`), sharing the adapter
with the server so both layouts work identically.

```text
src/data.ts
```

Frontend API/data loading.

```text
src/layout.ts
```

Star-system placement: the tuples, the date levels and their arches, the elevation bands and radius growth that put a whole date group on one arc, the two layout styles, and the core row with its wrapped rails.

```text
src/offsets.ts
```

The saved placements: the personal-overlay map, the key for each kind of thing, `anchor + vector`, and the one POST that persists it.

```text
src/main.ts
```

Application state machine: camera, hover/pin, focus, selection seed, coral
threads, composer flow.

```text
src/nodes.ts
```

Textures (banded planets, suns, glows, gradients), labels, crop helpers, node visuals, and the camera bound every glow sprite registers with.

```text
src/panels.ts
```

Reader, composer, game dialog, cluster/artifact UI, and the Layout window (B): workstream slots, core packs, layout style and nodes per arc, saved in one POST.

```text
src/scene.ts
```

Scene assembly, background layers, suns, labels, edges, pair ties, satellites, expanded older docs.

```text
shots.mjs
```

Screenshot/self-review harness.

```text
tests/test_starmap.py
```

Backend contract tests for research-shaped and programming-shaped fixtures.
`tests/test_atlas.py` covers the validator/map/gist CLI on the same fixtures.

## Verification

Backend:

```bash
python tests/test_starmap.py
```

Frontend build:

```bash
npm run build
```

Screenshot self-review:

```bash
npm run shot
```

The screenshot harness should cover:

- default map
- pinned busy branch/workstream
- cluster list
- chain display
- reader panel
- selection mode
- composer
- game dialog
- focus mode with artifacts
- selection threads to the seed

When changing layout or labels, inspect the screenshots. A green build alone
is not enough for UI work.

Harness notes:

- Headless browser screenshots need SwiftShader ANGLE flags for Pixi textures.
- Node can resolve `localhost` to IPv6 while Python binds IPv4; use explicit
  loopback in harnesses.
- Workstreams can have parallel active plans and reports; chain integrity
  rests on stamps, not one-head-per-kind assumptions.

## Extension Guardrails

Prefer small adapter/config changes over generalized rewrites.

Do:

- preserve `/api/tree` unless intentionally changing the UI
- keep frontend source focused on rendering and interaction
- keep host path conventions in `sector_adapter.py`
- keep the single-file `dist/index.html` committed after frontend changes
- add/adjust tests when changing server or adapter behavior
- run screenshot QA for visual/layout/interaction changes
- keep write paths transparent and repo-local

Avoid:

- redesigning the frontend data model for a new host layout
- moving canonical workflow state into browser-only state
- persisting planet positions as source of truth
- storing personal/session config inside the submodule
- adding broad dependencies for simple path/config adaptation
- turning submit-plan into a full workflow engine
- treating game files as trusted evidence

## Common Safe Customizations

- Change the host config presets and folder names.
- Change default branch/workstream slots.
- Change default selected context.
- Change handoff, plan-stub, and game-prompt templates.
- Add a new card discovery convention in `sector_adapter.py`.
- Add a new context pack type; the core row will render it.
- Tune label/crop lengths with screenshot verification.

## Current Mental Model

The starmap should feel like a cockpit over a repo-local workflow:

```text
read current state
  |
  +--> inspect live docs and proof artifacts
  |
  +--> compose the next context handoff
  |
  +--> submit a draft plan into the right workstream
  |
  +--> offer optional review games when useful
```

The files remain the project memory. The starmap makes that memory visible,
navigable, and easier to hand off to the next agent.
