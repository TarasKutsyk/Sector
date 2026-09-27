// Starmap entrypoint — boots Pixi, builds the world, wires every interaction.
//
//   boot ──> fetch /api/tree ──> build background + branch systems + core
//     │
//     ├─ pan/zoom (hand-rolled: drag + wheel-to-cursor; bg layers parallax)
//     ├─ hover branch -> activate; click star -> pin   (plan §Active branch)
//     ├─ click node   -> composer-ref | select-ring | reader panel
//     ├─ S  selection mode -> lock in -> handover composer -> submit plan
//     ├─ Ctrl+P find anything -> reveal + select it (plan step 1)
//     ├─ B  slot picker;  E  open last-read file in editor;  Esc  close
//     └─ ?debug=1 -> label-overlap overlay + window.__starmap driver (shots)

import { Application, Circle, Container, Graphics, Ticker } from "pixi.js";
import "./style.css";
import { DocNode, Satellite, Tree, fetchTree, post } from "./data";
import {
  BranchView, STAR_INNER_ACTIVE, STAR_INNER_ALPHA, STAR_INNER_DIM, STAR_PULSE, STAR_R,
  backgroundStarStats, buildBackground, buildBranchView, buildCoreView, buildNebula, layoutNebula, CoreEntry, CoreView,
  redrawClusterLine, redrawEdges, worldSize, WORLD_PAD,
} from "./scene";
import {
  GLOW_ALPHA, GLOW_CAM_CAP, GOLD, LIVE_GLOW_ALPHA, NodeView, PLANET_TEX_PX, SELECT_CYAN,
  applyCameraLook, cropMid, fileName, glowTexture, labelResolution, labelWidth, makeLabel,
  moonTexture, nodeLabelText, planetTexture, rimBound, typeTag,
} from "./nodes";
import {
  DEFAULT_PREFS, LABEL_H, LEVEL_STEP, LayoutPrefs, LayoutStyle, MOON_RING_FRACTION, MOON_RING_MAX,
  MOON_RING_PAD, Placed, ROOT_Y_FROM_BOTTOM, docClass,
} from "./layout";
import {
  allOffsets, clearOffsets, clusterKey, hasOffsets, loadOffsets, offsetOf, placedAt, saveOffsets,
  setOffset,
} from "./offsets";
import * as panels from "./panels";
import { IndexEntry, loadIndex, openPalette } from "./finder";
import { Sprite, Text } from "pixi.js";

const app = new Application();
const world = new Container();
let bgGround!: Sprite;
let bgFar!: Container;
let bgNebula!: Container;
let bgNear!: Container;

let tree!: Tree;
let branchViews: BranchView[] = [];
let coreView!: CoreView;
let W = 1500;
let H = 1000;

// interaction state
let pinned: string | null = null;
let hovered: string | null = null;
let selectMode = false;
const selection = new Map<string, { title: string; date: string; contextPack?: string; variant?: string }>();
const coreRings = new Map<string, Graphics>();
const starRings = new Map<string, Graphics>();
interface SatEntry {
  sprite: Container;
  dotBox: Container; // holds the moon and the hit area; scaled against camera zoom
  moon: Sprite;
  rim: Graphics; // the check-me gold rim, or the hollow ring of a missing proof
  sat: Satellite;
  hint: boolean; // one of the at-most-three markers a planet shows when not focused
  nv: { root: Container; radius: number; node: DocNode };
  label: Text;
  labelSide: 1 | -1; // +1 label to the right of the moon, -1 to the left
  angle: number;
  r: number;
  speed: number;
  settle: { angle: number; r: number } | null;
  hover: boolean;
}
let activeSatellites: SatEntry[] = [];
let satellitesFor: string | null = null;
// Plan step 3 D: which branches have their "+N older" cluster expanded.
const expanded = new Set<string>();
let colW = 300;
// Owner minibatch 6 A: how far either side of its star one system may draw, which
// is what the arc capacity is measured against (half a column, less half the
// 30-unit margin that keeps two neighbouring systems apart).
let reach = 600;
// Owner minibatch 6 B and C: the layout style and the arc node cap, read off the
// config the Layout window writes.
let prefs: LayoutPrefs = DEFAULT_PREFS;
// focus mode (plan §2): camera locked onto one planet, satellites settled
let focus: { id: string; prevCam: { x: number; y: number; s: number } } | null = null;
let camTarget: { x: number; y: number; s: number } | null = null;
// coral net (plan §5): the seed = the future plan, threads = selected context
let seed: { placed: boolean; x: number; y: number; branch: string | null; view: Container } | null = null;
const threadsG = new Graphics();
// Detail is decided by the camera, not by pinning: below this scale every
// report shows only its three moon proxies, at or above it the report the
// camera is on shows its full settled set with labels.
const FOCUS_ZOOM = 2.2;
// Plan step 3 E: the focused planet is drawn at this screen radius, which is
// what gives its moon rings room for 24 labels inside 0.45 of the neighbour
// distance. The wheel cap matches, so one tick cannot undo the zoom.
const FOCUS_PLANET_PX = 128;
const MAX_ZOOM = 14;
// Moon sizes (owner steer 2026-09-23, for the README demo): the focused
// planet's full set is held constant on screen.
// Proxy moons are a fixed fraction of their planet's radius (owner steer
// 2026-09-23): the moon-to-planet ratio stays the same at every zoom.
const PROXY_MOON_OF_PLANET = 0.15;
const FOCUS_MOON_PX = 12;
const MOON_HOVER_GROW = 1.25; // a hovered moon swells, like a lit planet label
const MOON_LABEL_SIZE = 12;
const MOON_LABEL_H = 16; // the Pixi line box of a moon label
const MOON_LABEL_OFFSET = FOCUS_MOON_PX + 6; // moon screen radius plus the gap, in screen px
const MOON_ROW_PX = Math.max(MOON_LABEL_H, 2 * FOCUS_MOON_PX) + 4; // one settled slot
// Plan step 3 D: fitCamera never shrinks a label under this, even when the
// world is taller than the viewport; panning covers the rest.
const MIN_LABEL_PX = 9;
let satellitesDetailed = false;
const debug = new URLSearchParams(location.search).has("debug");
let debugOverlay: Graphics | null = null;

async function boot() {
  await app.init({
    resizeTo: window,
    antialias: true,
    background: "#05070f",
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);

  tree = await fetchTree();
  // Plan step 4 B: the saved offsets are adopted BEFORE anything is built, so
  // every position is computed once, as `pure + offset`, and never patched.
  loadOffsets(tree.config.layout);
  prefs = {
    style: tree.config.layout_style === "coupled" ? "coupled" : "spread",
    arcMaxNodes: tree.config.arc_max_nodes ?? DEFAULT_PREFS.arcMaxNodes,
  };
  ({ width: W, height: H, colW, reach } = worldSize(tree, prefs));

  const bg = buildBackground(W, H);
  bgGround = bg.ground;
  bgFar = bg.far;
  bgNear = bg.near;
  // Plan step 5 C: the gradient is the ground, so it covers the viewport and
  // never parallaxes; the two starfields above it do.
  bgGround.setSize(app.screen.width, app.screen.height);
  bgNebula = buildNebula();
  layoutNebula(bgNebula, app.screen.width, app.screen.height);
  app.stage.addChild(bgGround, bgNebula, bgFar, bgNear, world);

  branchViews = tree.branches
    .filter((b) => !b.error)
    .map((b, i) => buildBranchView(b, WORLD_PAD + colW * (i + 0.5), H, reach, prefs));
  coreView = buildCoreView(shownPacks(), W, H);
  branchViews.forEach((bv) => {
    // pivot on the star so activation scales around it
    bv.root.pivot.set(bv.cx, bv.rootY);
    // Plan step 4 A "Dragging a branch star moves the whole system": the star's
    // offset is carried by the branch CONTAINER, so planets, cluster, edges,
    // labels and moons come along without anyone touching them. Because the
    // pivot stays on the column anchor, hover activation still scales the
    // system around its own star.
    const p = placedAt(bv.branch.card.path, { x: bv.cx, y: bv.rootY }, { x: bv.cx, y: bv.rootY });
    bv.root.position.set(p.x, p.y);
    world.addChild(bv.root);
  });
  world.addChild(coreView.root);
  threadsG.blendMode = "add";
  world.addChild(threadsG);
  // Owner request 3b D: the marquee lives on the STAGE, above the world, so it
  // is drawn in screen pixels and never scales with the camera.
  app.stage.addChild(marqueeG);

  wireBranchInteractivity();
  wireHubInteractivity();
  wirePanZoom();
  wireKeys();
  refreshResetButton();
  fitCamera();
  // The renderer's own resize, not the window's: Pixi's resizeTo applies the new
  // size one animation frame AFTER the window event, so reading app.screen there
  // left the ground at the old height and full screen showed a dark strip.
  app.renderer.on("resize", () => {
    bgGround.setSize(app.screen.width, app.screen.height);
    layoutNebula(bgNebula, app.screen.width, app.screen.height);
    if (!focus) fitCamera();
  });
  applyActivation(true);

  app.ticker.add(tick);
  if (debug) {
    debugOverlay = new Graphics();
    world.addChild(debugOverlay);
  }
  exposeDriver();
  revealFromHash();
}

// ---------------- activation (hover/pin) ----------------

const activeName = () => pinned ?? hovered;

function applyActivation(instant = false) {
  const active = activeName();
  for (const bv of branchViews) {
    const isActive = bv.branch.branch === active;
    const tScale = isActive ? 1.07 : active ? 0.97 : 1;
    const tAlpha = isActive ? 1 : active ? 0.22 : 0.85;
    (bv.root as any).__target = { scale: tScale, alpha: tAlpha };
    if (instant) {
      bv.root.scale.set(tScale);
      bv.root.alpha = tAlpha;
    }
    // labels & details only on the active system (plan §Feel: minimal clutter)
    bv.nodeViews.forEach((v) => (v.label.visible = isActive));
    applyClusterState(bv);
    bv.root.children.forEach((c: any) => {
      if (c.label === "detail") c.visible = isActive;
    });
  }
  if (active !== satellitesFor) buildSatellites(active);
}

/**
 * Which proofs a planet shows while it is NOT the focused one.
 *
 * Expanding declared folders turned some reports into 24-satellite planets,
 * and drawing them all at once buried the branch (see the first
 * proofs_legacy_focus shot). Outside focus a planet only hints that proofs
 * exist, and a proof still waiting for the owner's eyes is always one of the
 * hints:
 *
 * ```text
 * satellites -> check-me ones first, original order otherwise -> take 3
 * ```
 * args: sats (the planet's full satellite list)
 * returns: the set of indices to draw as hints
 */
function hintIndices(sats: Satellite[]): Set<number> {
  const order = sats.map((_, i) => i)
    .sort((a, b) => Number(sats[b].check_me) - Number(sats[a].check_me)); // stable: ties keep card order
  return new Set(order.slice(0, 3));
}

/**
 * Which detail level every satellite of the active branch is at.
 *
 * Type no longer colours a moon (an image and a transcript look the same);
 * only two states are marked, and both are drawn as rings rather than fills:
 *
 * ```text
 * camera scale < FOCUS_ZOOM (branch view)
 *   every report -> its 3 proxies, alpha 0.5, no labels, barely drifting
 *
 * camera scale >= FOCUS_ZOOM on one report (focus view)
 *   that report  -> full moon set on the settled rings, labels on, alpha 1
 *   every other  -> its 3 proxies, alpha 0.2
 *
 * per moon: check-me -> thin gold rim   missing on disk -> hollow coral ring
 * ```
 */
function refreshSatellites() {
  satellitesDetailed = !!focus && world.scale.x >= FOCUS_ZOOM;
  // Plan step 4 A "moons while their report is in focus": a planet's hit area is
  // a disc in WORLD units, so at focus zoom its 23-unit pad covers the whole
  // moon ring (about 22 units) and swallows every press meant for a moon. Held
  // at roughly 10 SCREEN px instead, the pad is unchanged at fit camera and the
  // moons become clickable and draggable once the camera is on their planet.
  const pad = Math.min(10, Math.max(1.5, 10 / world.scale.x));
  for (const bv of branchViews)
    bv.nodeViews.forEach((v) => (v.root.hitArea = new Circle(0, 0, v.radius + pad)));
  for (const e of activeSatellites) {
    const focused = satellitesDetailed && !!focus && e.nv.node.id === focus.id;
    e.sprite.visible = focused || e.hint;
    e.sprite.alpha = focused ? 1 : satellitesDetailed ? 0.2 : 0.5;
    e.moon.visible = !e.sat.missing;
    e.rim.clear();
    // Plan step 2 "Missing files get a visible missing-file indication": a
    // declared proof that is not on disk is a hollow ring, never a moon.
    if (e.sat.missing) e.rim.circle(0, 0, 1.1).stroke({ width: 0.3, color: 0xff9a8b, alpha: 0.95 });
    // A proof still waiting for the owner's eyes wears a gold rim, not a gold body.
    else if (e.sat.check_me) e.rim.circle(0, 0, 1.2).stroke({ width: 0.26, color: 0xffcf6e, alpha: 0.95 });
  }
}

function buildSatellites(branchName: string | null) {
  // {children: true}: a satellite's label is registered for the camera-following
  // resolution, so a dropped one has to be really destroyed rather than merely
  // orphaned, or the registry would rasterize dead labels forever.
  activeSatellites.forEach((s) => s.sprite.destroy({ children: true }));
  activeSatellites = [];
  satellitesFor = branchName;
  const bv = branchViews.find((b) => b.branch.branch === branchName);
  if (!bv) return;
  bv.nodeViews.forEach((nv) => {
    const hints = hintIndices(nv.node.satellites);
    let hintSlot = 0;
    nv.node.satellites.forEach((sat, i) => {
      const s = new Container();
      // The moon and its hit area live one level down, so the ticker can hold
      // them at a constant SCREEN size without touching the focus labels.
      // Everything inside dotBox is drawn in units of one moon radius.
      const dotBox = new Container();
      const moon = new Sprite(moonTexture(sat.path));
      moon.anchor.set(0.5);
      moon.setSize(2);
      const rim = new Graphics();
      dotBox.addChild(moon, rim);
      // Owner steer 2026-09-23: the full file name, never cropped, in focus.
      const label = makeLabel(sat.name, MOON_LABEL_SIZE);
      label.alpha = 0.8;
      label.anchor.set(0.5, 0);
      label.position.set(0, 5);
      label.visible = false; // focus mode only
      s.addChild(dotBox, label);
      dotBox.eventMode = "static";
      dotBox.cursor = "pointer";
      dotBox.hitArea = new Circle(0, 0, 1.6); // in moon radii, so the target grows with the moon
      // The label is a click target too: moon and name hover and open as one.
      label.eventMode = "static";
      label.cursor = "pointer";
      for (const t of [dotBox, label]) {
        t.on("pointerover", () => setMoonHover(dotBox, true));
        t.on("pointerout", () => setMoonHover(dotBox, false));
        t.on("pointertap", (e) => {
          e.stopPropagation();
          if (!dragWasReal) openSatellite(sat);
        });
      }
      // Plan step 4 A "moons while their report is in focus": outside focus a
      // moon is a drifting proxy with no slot to save, so the spec refuses the
      // drag. Inside focus the drag sets the settle target directly, which is
      // why the offset is measured from the PLANET rather than from a slot.
      wireDrag(dotBox, () => {
        const e = activeSatellites.find((x) => x.dotBox === dotBox);
        if (!e || !satellitesDetailed || !focus || e.nv.node.id !== focus.id) return null;
        const planet = { x: e.nv.root.x, y: e.nv.root.y };
        return {
          key: sat.path,
          anchor: planet,
          at: { x: e.sprite.x, y: e.sprite.y },
          frameScale: bv.root.scale.x,
          move: (x, y) => {
            e.sprite.position.set(x, y);
            e.angle = Math.atan2(y - planet.y, x - planet.x);
            e.r = Math.hypot(x - planet.x, y - planet.y);
            e.settle = { angle: e.angle, r: e.r };
            e.labelSide = x >= planet.x ? 1 : -1;
            e.label.anchor.set(e.labelSide === 1 ? 0 : 1, 0.5);
          },
          bv: null,
        };
      });
      bv.satellitesLayer.addChild(s);
      const hint = hints.has(i);
      // Proxies sit on the planet's upper side and barely drift, so they never
      // swing down across the filename label below the planet.
      // Hint markers ride their own planet's rim (radius+7 or +9): the 0.45
      // vertical squash keeps them clear of the filename label below the
      // planet, and they pass behind the planet body at the top and bottom of
      // the orbit, which is what makes three of them read as a hint rather
      // than as a swarm. The full set keeps the wider orbit it settles from.
      const r = hint ? nv.radius + 7 + (hintSlot % 2) * 2 : nv.radius + 11 + (i % 3) * 6;
      activeSatellites.push({
        sprite: s, dotBox, moon, rim, sat, hint, nv, label, labelSide: 1,
        angle: hint
          ? -Math.PI / 2 + (hintSlot - 1) * (Math.PI / 6)
          : (i / Math.max(nv.node.satellites.length, 1)) * Math.PI * 2,
        r, speed: 0.008 + (i % 4) * 0.003,
        settle: null, hover: false,
      });
      if (hint) hintSlot++;
    });
  });
  refreshSatellites();
}

/**
 * Plan step 3 D "Older docs are reachable from the map": the cluster is a
 * toggle, not just a list button.
 *
 * ```text
 * click "+N older"  -> the stranded docs appear as small dim planets on the
 *                      rows beyond the outermost level, labelled, clickable
 *                      like any planet; the marker reads "collapse"
 * click "collapse"  -> they go away again
 * right-click       -> the old list panel (also reachable from the reader of
 *                      any expanded doc, and from Ctrl+P)
 * ```
 * Positions are computed at build time either way, so the toggle moves nothing
 * that was already on screen.
 */
function toggleCluster(bv: BranchView) {
  const name = bv.branch.branch;
  if (expanded.has(name)) expanded.delete(name);
  else expanded.add(name);
  applyClusterState(bv);
  const n = bv.branch.cluster.count;
  panels.toast(expanded.has(name)
    ? `${n} older ${n === 1 ? "doc" : "docs"} expanded`
    : "older docs collapsed");
}

function applyClusterState(bv: BranchView) {
  const open = expanded.has(bv.branch.branch);
  const show = open && bv.branch.branch === activeName();
  bv.strandedViews.forEach((v) => {
    v.root.visible = show;
    v.label.visible = show;
  });
  if (bv.clusterLabel)
    bv.clusterLabel.text = open ? "collapse" : `+${bv.branch.cluster.count} older`;
}

/** The older-docs list panel, shared by the cluster right-click and the "list"
 *  link in an expanded doc's reader. */
function openClusterPanel(bv: BranchView) {
  panels.openClusterList(bv.branch.branch, bv.branch.cluster.items, (id, title) => {
    if (panels.composerInsertRef(id)) return;
    if (selectMode) return toggleSelect(id, { title, date: "" });
    panels.openReader({ path: id, title });
  });
}

/** An expanded stranded doc behaves like a planet: reader, selection ring and
 *  composer insertion, plus the way back to the full list (plan step 3 D). */
function strandedTapped(bv: BranchView, v: NodeView) {
  const n = v.node;
  if (panels.composerInsertRef(n.path)) return;
  if (selectMode) return toggleSelect(n.path, { title: n.title, date: n.date });
  panels.openReader({ path: n.path, title: n.title, kind: n.kind, date: n.date }, {
    selectMode,
    selected: selection.has(n.path),
    onToggleSelect: (id) => toggleSelect(id, { title: n.title, date: n.date }),
    onPlay: null,
    onList: () => openClusterPanel(bv),
  });
}

/** Moon hover: the label goes to full brightness and the moon swells a little
 *  (the ticker applies MOON_HOVER_GROW), matching the planets' hover light-up. */
function setMoonHover(dotBox: Container, on: boolean) {
  const e = activeSatellites.find((x) => x.dotBox === dotBox);
  if (!e) return;
  e.hover = on;
  e.label.alpha = on ? 1 : 0.8;
}

/** A satellite click routes on the file's own type (plan step 2 B): one
 *  decision, shared with the reader's artifact rows, so the map and the panel
 *  can never disagree about what opening a proof means. */
function openSatellite(sat: Satellite) {
  panels.openArtifact(sat);
}

// ---------------- focus mode (plan §2) ----------------

function worldCoordsOf(container: Container): { x: number; y: number } {
  const g = container.getGlobalPosition();
  return { x: (g.x - world.x) / world.scale.x, y: (g.y - world.y) / world.scale.y };
}

function enterFocus(bv: BranchView, v: { root: Container; radius: number; node: DocNode }) {
  const S = Math.min(MAX_ZOOM, Math.max(3, FOCUS_PLANET_PX / v.radius));
  if (!focus) focus = { id: v.node.id, prevCam: { x: world.x, y: world.y, s: world.scale.x } };
  else focus.id = v.node.id;
  pinned = bv.branch.branch;
  applyActivation();
  const w = worldCoordsOf(v.root);
  // center the planet left of the reader panel
  camTarget = {
    s: S,
    x: app.screen.width * 0.36 - w.x * S,
    y: app.screen.height * 0.52 - w.y * S,
  };
  settleMoons(bv, v, S);
  // labels get out of the way at high zoom; the reader names the planet
  bv.nodeViews.forEach((nv) => (nv.label.visible = false));
  bv.strandedViews.forEach((nv) => (nv.label.visible = false));
  // Plan step 3 E: a 1px line becomes a 12px band at focus zoom, so the edges
  // drop to a quarter and the dotted pair ties stand down entirely.
  redrawEdges(bv, new Set());
  bv.tieLines.visible = false;
  applyFocusFade(bv, v.node.id);
  refreshSatellites(); // the focused planet gets its full set, the rest fade
}

/**
 * Plan step 3 E "Focus is calm": everything that is not the focused planet
 * steps back instead of competing with it.
 *
 * args: bv (the branch), focusId (the focused node id, or null to restore)
 * returns: nothing; planet and glow alphas are set in place
 */
function applyFocusFade(bv: BranchView, focusId: string | null) {
  const apply = (nv: NodeView, id: string, base: number) => {
    const dim = focusId !== null && id !== focusId;
    nv.root.alpha = (dim ? 0.35 : 1) * base;
    nv.glow.alpha = dim ? 0.15 : nv.node.live ? LIVE_GLOW_ALPHA : GLOW_ALPHA;
  };
  bv.nodeViews.forEach((nv, id) => apply(nv, id, 1));
  bv.strandedViews.forEach((nv, id) => apply(nv, id, 0.5));
}

/**
 * Lay the focused planet's moons onto rings that cannot reach a neighbour, and
 * their labels onto a ladder that cannot cross itself.
 *
 * Plan step 3 E "tidy moon rings". Two rules, and the second is what makes 24
 * labels legible:
 *
 * ```text
 * ring radius = 0.45 * (distance to the nearest planet of this branch)
 *               -> a moon can never sit on a neighbour's body
 *
 * slots       = moons dealt alternately to the RIGHT and LEFT of the planet;
 *               within a side the slots are spread by equal STEPS IN Y, not by
 *               equal angles, and each label is anchored outward from its moon
 *
 *                    ·- 01_first.png        y step = 1.84 R / (n - 1),
 *                  ·- 02_second.png         which is at least one label row
 *                 ·- 03_third.png           by construction
 *                (planet)
 *                 ·- ...
 *
 * more moons than one ladder holds -> another ring, label rows CLOSER in,
 *               never a larger radius
 * ```
 * Equal angles are what the old ring used, and they pile every label onto its
 * neighbour at the top and bottom of the ring, where a 15 degree step moves y
 * by almost nothing. Equal y steps make the no-crossing gate arithmetic.
 *
 * args: bv (the branch), v (the focused planet view), S (the focus camera scale)
 * returns: nothing; each satellite gets its settle target and its label side
 */
function settleMoons(bv: BranchView, v: { root: Container; radius: number; node: DocNode }, S: number) {
  const mine = activeSatellites.filter((e) => e.nv.node.id === v.node.id)
    .sort((a, b) => a.sat.name.localeCompare(b.sat.name));
  if (!mine.length) return;
  const d = nearestPlanetDistance(bv, v.node.id);
  // Owner request 3b C: the ring follows the nearest neighbour, but never past
  // MOON_RING_MAX. A planet dragged 300 units away from its siblings used to get
  // a 135-unit ring that left the viewport (Block 4 Confession 7); capped, the
  // moons just pack onto more rings closer together, which the `rings` count
  // below already does whenever space is tight.
  const rOuter = Math.max(v.radius + MOON_RING_PAD, Math.min(MOON_RING_MAX, d * MOON_RING_FRACTION));
  const row = MOON_ROW_PX / S; // one moon slot, in world units
  const perSide = Math.floor((1.84 * rOuter) / row) + 1;
  const rings = Math.max(1, Math.ceil(mine.length / (2 * perSide)));
  const groups = rings * 2; // one (ring, side) bucket per group, dealt round robin
  mine.forEach((e, k) => {
    // Plan step 4 A "Dragging a moon in focus mode sets that moon's slot offset
    // from its planet": a saved offset replaces the computed slot outright, so
    // the settle target IS where the moon was dropped, whatever the ring
    // arithmetic would have picked for it.
    const saved = offsetOf(e.sat.path);
    if (saved) {
      e.settle = { angle: Math.atan2(saved[1], saved[0]), r: Math.hypot(saved[0], saved[1]) };
      e.labelSide = saved[0] >= 0 ? 1 : -1;
      e.label.visible = true;
      e.label.scale.set(1 / S);
      e.label.anchor.set(e.labelSide === 1 ? 0 : 1, 0.5);
      e.label.position.set((e.labelSide * MOON_LABEL_OFFSET) / S, 0);
      return;
    }
    const g = k % groups;
    const R = rOuter - Math.floor(g / 2) * row * 2.5;
    const side: 1 | -1 = g % 2 === 0 ? 1 : -1;
    const count = Math.floor((mine.length - g - 1) / groups) + 1;
    const i = Math.floor(k / groups);
    const y = count === 1 ? 0 : ((i / (count - 1)) * 2 - 1) * 0.92 * R;
    const x = side * Math.sqrt(Math.max(R * R - y * y, 1));
    e.settle = { angle: Math.atan2(y, x), r: Math.hypot(x, y) };
    e.labelSide = side;
    e.label.visible = true;
    e.label.scale.set(1 / S);
    e.label.anchor.set(side === 1 ? 0 : 1, 0.5);
    e.label.position.set((side * MOON_LABEL_OFFSET) / S, 0);
  });
}

/** Distance from one planet to the nearest other planet of the same branch, in
 *  world units. This is the number the moon rings are sized from, and in the
 *  ladder layout it is normally one level step. */
function nearestPlanetDistance(bv: BranchView, id: string): number {
  const me = bv.nodeViews.get(id)!.root;
  let best = Infinity;
  const consider = (o: Container) => {
    best = Math.min(best, Math.hypot(o.x - me.x, o.y - me.y));
  };
  bv.nodeViews.forEach((o, oid) => oid !== id && consider(o.root));
  bv.strandedViews.forEach((o, oid) => oid !== id && o.root.visible && consider(o.root));
  return Number.isFinite(best) ? best : LEVEL_STEP;
}

function exitFocus(restoreCam: boolean) {
  if (!focus) return;
  activeSatellites.forEach((e) => {
    e.settle = null;
    e.label.visible = false;
  });
  branchViews.forEach((bv) => {
    applyFocusFade(bv, null);
    redrawEdges(bv, null);
    bv.tieLines.visible = true;
    bv.nodeViews.forEach((nv) => {
      nv.label.scale.set(1);
      nv.label.visible = bv.branch.branch === activeName();
    });
    applyClusterState(bv);
  });
  if (restoreCam) camTarget = { ...focus.prevCam };
  focus = null;
  refreshSatellites();
}

// ---------------- interactivity ----------------

function nodeTapped(bv: BranchView, node: DocNode) {
  if (panels.composerInsertRef(node.path)) return; // composer eats clicks
  if (selectMode) return toggleSelect(node.path, { title: node.title, date: node.date });
  // "stranded" on a card-listed live doc reads as an insult — clarify.
  const shown = node.live && !node.stamped ? { ...node, status: "live · unstamped" } : node;
  const v = bv.nodeViews.get(node.id);
  if (v) enterFocus(bv, v); // zoom onto the planet; satellites become clickable
  panels.openReader(shown, {
    selectMode,
    selected: selection.has(node.path),
    onToggleSelect: (id) => toggleSelect(id, { title: node.title, date: node.date }),
    // Games are offered on any report; the owner decides whether to play (significance gate stripped).
    onPlay: node.kind === "plan" || node.kind === "file"
      ? null
      : () => panels.openGameDialog(node, bv.branch.branch, tree.config.game_prompt_template),
    satellites: node.satellites,
    truncated: node.satellites_truncated,
  });
}

/**
 * Open a branch card in the reader, the way clicking its star does.
 * args: bv (the branch system), pin ("toggle" for a star click, "on" when the
 *       palette reveals the card and the branch must end up pinned)
 */
function openBranchCard(bv: BranchView, pin: "toggle" | "on") {
  const card = bv.branch.card;
  if (panels.composerInsertRef(card.path)) return;
  if (selectMode) return toggleSelect(card.path, { title: card.title, date: card.updated });
  pinned = pin === "on" || pinned !== bv.branch.branch ? bv.branch.branch : null;
  applyActivation();
  panels.openReader({ path: card.path, title: card.title, kind: "branch card", status: card.status, date: card.updated }, {
    selectMode,
    selected: selection.has(card.path),
    onToggleSelect: (id) => toggleSelect(id, { title: card.title, date: card.updated }),
    onPlay: null,
  });
}

function wireBranchInteractivity() {
  for (const bv of branchViews) {
    bv.root.eventMode = "static";
    bv.root.on("pointerover", () => {
      if (hovered !== bv.branch.branch) {
        hovered = bv.branch.branch;
        applyActivation();
      }
    });

    // star: pin/unpin + open the branch card
    const starRing = new Graphics();
    bv.star.addChild(starRing);
    starRings.set(bv.branch.branch, starRing);
    bv.star.eventMode = "static";
    bv.star.cursor = "pointer";
    bv.star.hitArea = new Circle(0, 0, 42);
    // Plan step 4 A "releasing after a drag does not open the node, does not
    // pin, does not toggle selection": the guard sits on the TAP, so a reveal or
    // a driver call right after a drag still opens things normally.
    bv.star.on("pointertap", () => !dragWasReal && openBranchCard(bv, "toggle"));
    // Plan step 4 A: the star drags the whole system, by moving the branch
    // CONTAINER. Its position is in world units, hence frameScale 1, and the
    // edges live inside it so nothing has to be redrawn.
    wireDrag(bv.star, () => ({
      key: bv.branch.card.path,
      anchor: { x: bv.cx, y: bv.rootY },
      at: { x: bv.root.x, y: bv.root.y },
      frameScale: 1,
      move: (x, y) => bv.root.position.set(x, y),
      bv: null,
    }));

    bv.nodeViews.forEach((v) => {
      v.root.eventMode = "static";
      v.root.cursor = "pointer";
      v.root.hitArea = new Circle(0, 0, v.radius + 10);
      v.root.on("pointerover", () => {
        (v.root as any).__hover = true;
        // full on-disk name on hover, the type tag kept in front of it
        v.label.text = `${typeTag(v.node.kind)} · ${fileName(v.node.path)}`;
        v.label.alpha = 1;
        redrawEdges(bv, connectedIds(bv, v.node));
      });
      v.root.on("pointerout", () => {
        (v.root as any).__hover = false;
        v.label.text = nodeLabelText(v.node);
        v.label.alpha = 0.55;
        redrawEdges(bv, null);
      });
      v.root.on("pointertap", (e) => {
        e.stopPropagation();
        if (!dragWasReal) nodeTapped(bv, v.node);
      });
      // Plan step 4 A: the planet, its label, its moon proxies and its focus
      // rings all hang off this container, so moving it moves the lot.
      wireDrag(v.root, () => ({
        key: v.node.path,
        anchor: { x: bv.cx, y: bv.rootY },
        at: { x: v.root.x, y: v.root.y },
        frameScale: bv.root.scale.x,
        move: (x, y) => v.root.position.set(x, y),
        bv,
      }));
    });

    bv.strandedViews.forEach((v) => {
      v.root.eventMode = "static";
      v.root.cursor = "pointer";
      v.root.hitArea = new Circle(0, 0, v.radius + 10);
      v.root.on("pointerover", () => {
        v.label.text = `${typeTag(v.node.kind)} · ${fileName(v.node.path)}`;
        v.label.alpha = 1;
      });
      v.root.on("pointerout", () => {
        v.label.text = nodeLabelText(v.node);
        v.label.alpha = 0.55;
      });
      v.root.on("pointertap", (e) => {
        e.stopPropagation();
        if (!dragWasReal) strandedTapped(bv, v);
      });
      wireDrag(v.root, () => ({
        key: v.node.path,
        anchor: { x: bv.cx, y: bv.rootY },
        at: { x: v.root.x, y: v.root.y },
        frameScale: bv.root.scale.x,
        move: (x, y) => v.root.position.set(x, y),
        bv,
      }));
    });

    if (bv.clusterView) {
      bv.clusterView.eventMode = "static";
      bv.clusterView.cursor = "pointer";
      bv.clusterView.hitArea = new Circle(0, 0, 46);
      bv.clusterView.on("pointertap", (e) => {
        e.stopPropagation();
        if (!dragWasReal) toggleCluster(bv);
      });
      bv.clusterView.on("rightclick", (e) => {
        e.stopPropagation();
        openClusterPanel(bv);
      });
      wireDrag(bv.clusterView, () => ({
        key: clusterKey(bv.branch.card.path),
        anchor: { x: bv.cx, y: bv.rootY },
        at: { x: bv.clusterView!.x, y: bv.clusterView!.y },
        frameScale: bv.root.scale.x,
        move: (x, y) => {
          bv.clusterView!.position.set(x, y);
          redrawClusterLine(bv); // the thread from the star follows the marker
        },
        bv: null,
      }));
    }
  }
}

function connectedIds(bv: BranchView, n: DocNode): Set<string> {
  const s = new Set<string>([n.id]);
  if (n.supersedes) s.add(n.supersedes);
  if (n.superseded_by) s.add(n.superseded_by);
  if (n.plan) s.add(n.plan);
  return s;
}

/** Open one context-pack file in the reader, the way clicking its core node does. */
function openCoreDoc(id: string, h: CoreEntry) {
  if (panels.composerInsertRef(id)) return;
  const meta = { title: `core/${h.pack.pack}/${h.label.text}`, date: "", contextPack: h.pack.pack, variant: h.label.text };
  if (selectMode) return toggleSelect(id, meta);
  panels.openReader({ path: id, title: meta.title, kind: `core ${h.pack.pack}` }, {
    selectMode,
    selected: selection.has(id),
    onToggleSelect: (sid) => toggleSelect(sid, meta),
    onPlay: null,
  });
}

/**
 * The packs the core row draws (owner minibatch 6 C): the ones ticked in the
 * Layout window, or all of them when `core_slots` is empty, which is both the
 * default and what an unconfigured host gets.
 * returns: the ContextPacks to draw, in server order
 */
function shownPacks() {
  const picked = tree.config.core_slots ?? [];
  return picked.length ? tree.core.filter((p) => picked.includes(p.pack)) : tree.core;
}

function wireHubInteractivity() {
  // Owner minibatch 6 D: a pack anchor opens the pack's index (or its first
  // file) and toggles that file as a context pack. It is not draggable: it is
  // the parent anchor every file of its pack is placed from, so moving it would
  // mean moving the pack, which nothing asks for.
  coreView.anchors.forEach((h) => {
    h.view.eventMode = "static";
    h.view.cursor = "pointer";
    h.view.hitArea = new Circle(0, 0, 16);
    h.view.on("pointerover", () => {
      h.label.alpha = 1;
      h.view.scale.set(1.18);
    });
    h.view.on("pointerout", () => {
      h.label.alpha = 1;
      h.view.scale.set(1);
    });
    h.view.on("pointertap", (e) => {
      e.stopPropagation();
      if (!dragWasReal) openCoreDoc(h.target, h);
    });
  });
  coreView.nodeById.forEach((h, id) => {
    h.view.eventMode = "static";
    h.view.cursor = "pointer";
    h.view.hitArea = new Circle(0, 0, 16);
    h.view.on("pointerover", () => {
      h.label.alpha = 1;
      h.view.scale.set(1.18);
    });
    h.view.on("pointerout", () => {
      h.label.alpha = 0.6;
      h.view.scale.set(1);
    });
    h.view.on("pointertap", (e) => {
      e.stopPropagation();
      if (!dragWasReal) openCoreDoc(id, h);
    });
    // Plan step 4 A: a core node is placed from its pack anchor. The core row
    // hangs directly off the world, so its frame is world units.
    wireDrag(h.view, () => ({
      key: id,
      anchor: coreView.lay.packAnchors.get(coreView.lay.packOf.get(id)!)!,
      at: { x: h.view.x, y: h.view.y },
      frameScale: 1,
      move: (x, y) => h.view.position.set(x, y),
      bv: null,
    }));
  });
}

// ---------------- selection mode (plan §Functionality 1) ----------------

function toggleSelect(id: string, meta: { title: string; date: string; contextPack?: string; variant?: string }) {
  selection.has(id) ? selection.delete(id) : selection.set(id, meta);
  refreshSelectionRings();
  updateSelectBar();
}

function seedDefaults() {
  for (const path of tree.config.default_selected) {
    if (selection.has(path)) continue;
    const core = coreView.nodeById.get(path);
    selection.set(path, core
      ? { title: `core/${core.pack.pack}`, date: "", contextPack: core.pack.pack, variant: path.split("/").pop()!.replace(".md", "") }
      : { title: path.split("/").pop()!, date: "" });
  }
}

function refreshSelectionRings() {
  for (const bv of branchViews) {
    const dress = (v: NodeView) => {
      v.ring.clear();
      if (selection.has(v.node.id) && selectMode)
        v.ring.circle(0, 0, v.radius + 6).stroke({ width: 2, color: SELECT_CYAN, alpha: 0.95 });
      // Owner request 3b D: the group ring is the selection ring one pixel
      // thinner, and it shows whether or not selection mode is on.
      if (group.has(v.node.path))
        v.ring.circle(0, 0, v.radius + 6).stroke({ width: 1, color: SELECT_CYAN, alpha: 0.9 });
      if (v.node.played)
        v.ring.circle(v.radius * 0.85, -v.radius * 0.85, 2.6).fill({ color: GOLD });
    };
    bv.nodeViews.forEach(dress);
    bv.strandedViews.forEach(dress);
    // branch ROOTS show their selection too (owner nitpick: previously invisible)
    const sr = starRings.get(bv.branch.branch);
    if (sr) {
      sr.clear();
      if (selection.has(bv.branch.card.path) && selectMode)
        sr.circle(0, 0, 34).stroke({ width: 2.4, color: SELECT_CYAN, alpha: 0.95 });
      if (group.has(bv.branch.card.path))
        sr.circle(0, 0, 34).stroke({ width: 1.4, color: SELECT_CYAN, alpha: 0.9 });
    }
  }
  coreRings.forEach((g) => g.destroy());
  coreRings.clear();
  if (!selectMode) return;
  const ring = (h: CoreEntry, id: string) => {
    if (!selection.has(id)) return;
    const g = new Graphics().circle(0, 0, 15).stroke({ width: 2, color: SELECT_CYAN, alpha: 0.95 });
    h.view.addChild(g);
    coreRings.set(id, g);
  };
  coreView.nodeById.forEach(ring);
  // Owner minibatch 6 D: an anchor wears the ring of the file it opens.
  coreView.anchors.forEach((h) => ring(h, h.target));
}

function updateSelectBar() {
  document.getElementById("select-count")!.textContent = `${selection.size} selected`;
}

function setSelectMode(on: boolean) {
  selectMode = on;
  document.getElementById("select-bar")!.classList.toggle("hidden", !on);
  if (on) {
    if (selection.size === 0) seedDefaults();
    makeSeed();
    panels.toast("Place the seed — click where the new plan lives");
  } else {
    destroySeed();
    panels.toast("Selection mode off");
  }
  refreshSelectionRings();
  updateSelectBar();
}

// ---------------- the seed + coral net (plan §5) ----------------

function makeSeed() {
  destroySeed();
  const view = new Container();
  const glow = new Sprite(glowTexture(GOLD));
  glow.anchor.set(0.5);
  glow.blendMode = "add";
  glow.setSize(64);
  const body = new Sprite(planetTexture(44, 78));
  body.anchor.set(0.5);
  body.setSize(20);
  const ring = new Graphics().circle(0, 0, 17).stroke({ width: 1.4, color: GOLD, alpha: 0.8 });
  view.addChild(glow, body, ring);
  view.alpha = 0.85;
  world.addChild(view);
  seed = { placed: false, x: 0, y: 0, branch: null, view };
}

function destroySeed() {
  seed?.view.destroy();
  seed = null;
  threadsG.clear();
}

function placeSeed(wx: number, wy: number) {
  if (!seed) return;
  seed.x = wx;
  seed.y = wy;
  seed.view.position.set(wx, wy);
  const bv = branchViews.find((b) => Math.abs(wx - b.cx) <= colW / 2 && wy < b.rootY + 60);
  seed.branch = bv?.branch.branch ?? null;
  seed.placed = true;
  // The branch a seed lands in is always part of its context: select its card.
  if (bv && !selection.has(bv.branch.card.path)) {
    const card = bv.branch.card;
    selection.set(card.path, { title: card.title, date: card.updated });
    refreshSelectionRings();
    updateSelectBar();
  }
  panels.toast(seed.branch
    ? `Seed planted in ${seed.branch} — select its context`
    : "Seed planted in open space — a NEW branch; name it at Lock in");
}

/** World position of any selectable thing: planet, branch star (card), core node. */
function worldPosOf(id: string): { x: number; y: number } | null {
  for (const bv of branchViews) {
    const v = bv.nodeViews.get(id);
    if (v) return worldCoordsOf(v.root);
    if (bv.branch.card.path === id) return worldCoordsOf(bv.star);
  }
  const core = coreView.nodeById.get(id);
  return core ? worldCoordsOf(core.view) : null;
}

/** One coral filament (Prey-style): wide faint gold halo, mid glow, bright
 *  core along a slowly waving bezier — redrawn every tick while the seed lives. */
function drawCoral(g: Graphics, a: { x: number; y: number }, b: { x: number; y: number }, id: string, time: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const wob = (k: number) =>
    Math.sin(time * 0.018 + jitterPhase(id) + k * 2.3) * len * 0.055 + jitterStatic(id + k) * len * 0.05;
  const c1 = { x: a.x + dx / 3 + nx * wob(1), y: a.y + dy / 3 + ny * wob(1) };
  const c2 = { x: a.x + (2 * dx) / 3 + nx * wob(2), y: a.y + (2 * dy) / 3 + ny * wob(2) };
  for (const [w, color, alpha] of [[7, 0xffcf6e, 0.09], [3, 0xffcf6e, 0.26], [1.3, 0xffe9b0, 0.92]] as const) {
    g.moveTo(a.x, a.y).bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y)
      .stroke({ width: w, color, alpha });
  }
}

function jitterPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h % 628) / 100;
}

function jitterStatic(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000 - 0.5) * 2;
}

function lockIn() {
  const entries = [...selection.entries()];
  const core = entries.filter(([, m]) => m.contextPack);
  const rest = entries.filter(([, m]) => !m.contextPack).sort((a, b) => (a[1].date < b[1].date ? -1 : 1));
  const toRead = [...core, ...rest].map(([path, m]) => ({
    path, title: m.title, date: m.date,
    // a selected card brings what it says to read (owner steer 2026-09-23)
    readList: tree.branches.find((b) => b.card.path === path)?.card.read_list,
  }));
  const contextPacks = core.map(([, m]) => (m.variant && m.variant !== "INDEX" ? `${m.contextPack}:${m.variant}` : m.contextPack!));
  panels.openComposer({
    toRead,
    branches: tree.slots,
    defaultBranch: seed?.branch ?? pinned ?? tree.slots[0],
    handoverTemplate: tree.config.handover_template,
    contextPacks,
    newBranch: !!seed?.placed && seed.branch === null,
    onSubmitted: saveSeedSpot,
  });
}

// ---------------- find and reveal (plan step 1) ----------------

const REVEAL_HASH = "#reveal=";

/**
 * Show one indexed file, whatever it happens to be on this map.
 *
 * ```text
 * entry (path + branch, from the palette or from the #reveal hash)
 *   |
 *   +-- a drawn planet of a slot branch ---> focus + reader + pulse
 *   +-- a satellite of a drawn planet ----> focus the parent, open the satellite
 *   +-- a slot branch's card -------------> pin + card reader
 *   +-- a core context file --------------> reader (+ pulse if the node is drawn)
 *   +-- a branch with no slot ------------> take the rightmost slot, save the
 *   |                                       config, reload with #reveal=<path>
 *   +-- anything else (older cluster doc,
 *       a loose file in a branch folder) -> pin its branch + reader
 * ```
 * args: e (index entry)
 * returns: nothing; the map and the reader move to the file
 */
async function revealEntry(e: IndexEntry) {
  for (const bv of branchViews) {
    const v = bv.nodeViews.get(e.path);
    if (v) {
      nodeTapped(bv, v.node);
      pulseAt(v.root, v.radius);
      return;
    }
    if (bv.branch.card.path === e.path) return openBranchCard(bv, "on");
  }
  for (const bv of branchViews) {
    for (const v of bv.nodeViews.values()) {
      const sat = v.node.satellites.find((x) => x.path === e.path);
      if (sat) {
        nodeTapped(bv, v.node);
        pulseAt(v.root, v.radius);
        openSatellite(sat);
        return;
      }
    }
  }
  const core = coreView.nodeById.get(e.path);
  if (core) {
    openCoreDoc(e.path, core);
    pulseAt(core.view, 15);
    return;
  }
  if (e.branch !== "core" && !tree.slots.includes(e.branch) && tree.all_branches.includes(e.branch)) {
    return bringBranchIntoView(e);
  }
  // an older doc from the faded cluster, or any other file in the folder
  if (tree.slots.includes(e.branch)) {
    pinned = e.branch;
    applyActivation();
  }
  panels.openReader({ path: e.path, title: e.name, kind: e.kind, date: e.date });
}

/** Give an inactive branch the rightmost slot and come back to this file after
 *  the reload (the slot write is the same POST /api/config the slot picker uses). */
async function bringBranchIntoView(e: IndexEntry) {
  const slots = [...tree.slots];
  if (slots.length < tree.config.max_branch_slots) slots.push(e.branch);
  else slots[slots.length - 1] = e.branch;
  panels.toast(`Bringing ${e.branch} into view`);
  await post("/api/config", { branch_slots: slots });
  location.hash = `${REVEAL_HASH.slice(1)}${encodeURIComponent(e.path)}`;
  setTimeout(() => location.reload(), 700); // long enough to read the toast
}

/** Reveal the file named by #reveal=<path> once the tree is up, then drop the
 *  hash so a manual refresh shows the plain map. */
async function revealFromHash() {
  if (!location.hash.startsWith(REVEAL_HASH)) return;
  const path = decodeURIComponent(location.hash.slice(REVEAL_HASH.length));
  history.replaceState(null, "", location.pathname + location.search);
  const entries = await loadIndex();
  const e = entries.find((x) => x.path === path);
  if (e) revealEntry(e);
}

const pulses: { ring: Graphics; radius: number; t: number }[] = [];

/** Brief expanding ring on a revealed node, so the eye lands on it. Drawn on
 *  its own Graphics: the node's `ring` belongs to selection and played marks. */
function pulseAt(parent: Container, radius: number) {
  const ring = new Graphics();
  parent.addChild(ring);
  pulses.push({ ring, radius, t: 0 });
}

// ---------------- camera ----------------

function fitCamera() {
  // no ≤1 cap: on high-res screens the world upscales to FILL the window
  // (textures are procedural gradients — they scale cleanly)
  // Plan step 3 D: the world may end up taller than the viewport rather than
  // shrink a label under MIN_LABEL_PX; whatever does not fit is panned to.
  const s = Math.max(Math.min(app.screen.width / W, app.screen.height / H), MIN_LABEL_PX / LABEL_H);
  world.scale.set(s);
  world.position.set((app.screen.width - W * s) / 2, app.screen.height - H * s);
}

function wirePanZoom() {
  let dragging = false;
  let last = { x: 0, y: 0 };
  app.stage.eventMode = "static";
  app.stage.hitArea = { contains: () => true } as any;
  let moved = 0;
  app.stage.on("pointerdown", (e) => {
    // Plan step 4 A: the click a finished drag produces was eaten by the tap
    // guards; the next press starts clean. A node's own pointerdown has already
    // run by now (events reach the target before the stage), so a live grab
    // means this press belongs to a node and the camera must not pan.
    dragWasReal = false;
    // Owner request 3b D: Shift plus a press on empty space draws the marquee;
    // without Shift the empty-space drag pans the camera exactly as before.
    marquee = !grab && e.shiftKey ? { from: { x: e.global.x, y: e.global.y }, to: { x: e.global.x, y: e.global.y } } : null;
    dragging = !grab && !marquee;
    moved = 0;
    last = { x: e.global.x, y: e.global.y };
  });
  const release = () => {
    dragging = false;
    if (marquee) {
      commitMarquee();
      marquee = null;
      drawMarquee();
    }
    dragEnd();
  };
  app.stage.on("pointerup", release);
  app.stage.on("pointerupoutside", release);
  app.stage.on("pointermove", (e) => {
    // the unplaced seed follows the cursor (coral flow, plan §5)
    if (seed && !seed.placed) {
      const wx = (e.global.x - world.x) / world.scale.x;
      const wy = (e.global.y - world.y) / world.scale.y;
      seed.view.position.set(wx, wy);
    }
    // Plan step 4 A "the camera does not pan while a node is dragged".
    if (grab) return dragMove(grab, e.global.x, e.global.y);
    if (marquee) {
      moved += Math.abs(e.global.x - last.x) + Math.abs(e.global.y - last.y);
      last = { x: e.global.x, y: e.global.y };
      marquee.to = { x: e.global.x, y: e.global.y };
      return drawMarquee();
    }
    if (!dragging) return;
    moved += Math.abs(e.global.x - last.x) + Math.abs(e.global.y - last.y);
    camTarget = null; // user takes camera control
    world.x += e.global.x - last.x;
    world.y += e.global.y - last.y;
    last = { x: e.global.x, y: e.global.y };
  });
  app.stage.on("pointertap", (e) => {
    if (dragWasReal) return; // the tap that ends a node drag
    if (moved > 6) return; // a drag, not a click
    clearGroup(); // owner request 3b D: a plain click on empty space ungroups
    if (selectMode && seed && !seed.placed) {
      placeSeed((e.global.x - world.x) / world.scale.x, (e.global.y - world.y) / world.scale.y);
    } else if (focus && !selectMode) {
      exitFocus(true); // click on empty space backs out of focus
    }
  });
  app.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camTarget = null;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(Math.max(world.scale.x * factor, 0.35), MAX_ZOOM);
    const wx = (e.offsetX - world.x) / world.scale.x;
    const wy = (e.offsetY - world.y) / world.scale.y;
    world.scale.set(ns);
    world.position.set(e.offsetX - wx * ns, e.offsetY - wy * ns);
    if (focus && ns < 2.2) exitFocus(false); // zoomed back out manually
  }, { passive: false });
}

// ---------------- box selection (owner request 3b D) ----------------

// The nodes that move together. Layout keys, so the same set serves the group
// ring, the group drag and the one POST at the end of it.
const group = new Set<string>();
// The live marquee, in SCREEN coordinates (it is drawn on the stage, not in the
// world, so it keeps its 1 px edge whatever the camera is doing).
let marquee: { from: Placed; to: Placed } | null = null;
const marqueeG = new Graphics();

/** One thing a box can pick up: a planet, an expanded older doc or a branch
 *  star. Core nodes and moons are deliberately absent (owner request 3b D).
 *
 *  `anchor` is the parent anchor its saved placement is measured from,
 *  `frameScale` the scale between world units and the frame `obj` lives in, and
 *  `select` the composer toggle the same box fires in selection mode. */
interface Groupable {
  key: string;
  obj: Container;
  anchor: Placed;
  frameScale: number;
  bv: BranchView | null;
  select: () => void;
}

function groupables(): Groupable[] {
  const out: Groupable[] = [];
  for (const bv of branchViews) {
    const anchor = { x: bv.cx, y: bv.rootY };
    const card = bv.branch.card;
    out.push({
      key: card.path, obj: bv.root, anchor, frameScale: 1, bv: null,
      select: () => toggleSelect(card.path, { title: card.title, date: card.updated }),
    });
    const planet = (v: NodeView) => out.push({
      key: v.node.path, obj: v.root, anchor, frameScale: bv.root.scale.x, bv,
      select: () => toggleSelect(v.node.path, { title: v.node.title, date: v.node.date }),
    });
    bv.nodeViews.forEach(planet);
    bv.strandedViews.forEach((v) => v.root.visible && planet(v));
  }
  return out;
}

/** The marquee, as a screen-space rectangle. */
function marqueeRect(m: { from: Placed; to: Placed }) {
  return {
    x: Math.min(m.from.x, m.to.x), y: Math.min(m.from.y, m.to.y),
    w: Math.abs(m.to.x - m.from.x), h: Math.abs(m.to.y - m.from.y),
  };
}

/** A thin dashed cyan box with a barely-there fill, redrawn on every
 *  pointermove and cleared on release. */
function drawMarquee() {
  marqueeG.clear();
  if (!marquee) return;
  const r = marqueeRect(marquee);
  marqueeG.rect(r.x, r.y, r.w, r.h).fill({ color: SELECT_CYAN, alpha: 0.06 });
  const dash = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let t = 0; t < len; t += 10) {
      const a = t / len;
      const b = Math.min(t + 6, len) / len;
      marqueeG.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
    }
  };
  dash(r.x, r.y, r.x + r.w, r.y);
  dash(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
  dash(r.x + r.w, r.y + r.h, r.x, r.y + r.h);
  dash(r.x, r.y + r.h, r.x, r.y);
  marqueeG.stroke({ width: 1, color: SELECT_CYAN, alpha: 0.8 });
}

/**
 * Release: everything whose BODY CENTRE is inside the box joins the group.
 *
 * ```text
 * shift + press on empty space -> marquee
 *   |
 *   v
 * release -> planets, expanded older docs and branch stars inside the box
 *              |
 *              +--> added to the group (a second box adds more)
 *              +--> in selection mode, their composer selection is toggled too
 * ```
 */
function commitMarquee() {
  const r = marqueeRect(marquee!);
  if (r.w < 6 && r.h < 6) return; // a shift-click, not a box
  let added = 0;
  for (const g of groupables()) {
    const p = g.obj.getGlobalPosition();
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) continue;
    if (!group.has(g.key)) added++;
    group.add(g.key);
    if (selectMode) g.select();
  }
  refreshSelectionRings();
  updateSelectBar();
  if (added) panels.toast(`${group.size} nodes grouped: drag any of them to move all`);
}

function clearGroup() {
  if (!group.size) return;
  group.clear();
  refreshSelectionRings();
}

// ---------------- drag and keep the layout (plan step 4) ----------------

// Plan step 4 A "Press and move more than 5 screen px starts a drag": under
// this, the release is still a click and behaves exactly as it did before.
const DRAG_START_PX = 5;
// Plan step 4 D "tween nodes back over about 400 ms".
const RESET_MS = 400;

/** What one grab needs to know. `at` is where the thing sits in its own parent
 *  frame at press time, `anchor` is its PARENT ANCHOR (the star for a planet or
 *  the older-docs marker, the column anchor for a star, the pack anchor for a
 *  core node, the planet for a moon), since owner request 3b B saves the vector
 *  between the two, and `frameScale` the extra scale between world units and
 *  that frame: the branch container's own scale for anything inside a system, 1
 *  for the container itself and for the core row. */
interface DragSpec {
  key: string;
  anchor: Placed;
  at: Placed;
  frameScale: number;
  move: (x: number, y: number) => void;
  bv: BranchView | null; // whose edges follow the drag
}

interface Grab extends DragSpec {
  from: { x: number; y: number }; // pointer position at press, screen px
  pos: Placed; // where the thing is now, in its own frame
  started: boolean; // past the 5 px threshold
  // Owner request 3b D: the rest of the group, with where each sat at press
  // time, so one pointer moves them all by the same world delta.
  members: (Groupable & { at: Placed })[];
}

let grab: Grab | null = null;
// A real drag just ended, so the pointertap it produces must not open, pin or
// select anything. Cleared at the next press, and exactly one tap can fall
// between a release and that press.
let dragWasReal = false;
let edgesDirty: BranchView | null = null;
// A group drag can touch several systems at once, so the ticker redraws them all.
let allEdgesDirty = false;
let resetTween: { items: { obj: Container; from: Placed; to: Placed }[]; t: number } | null = null;

/**
 * Make one thing draggable.
 *
 * ```text
 * pointerdown on the thing -> arm the grab (nothing visible yet)
 *   |
 *   +-- pointer moves <= 5 px, release  -> plain click, nothing moved
 *   +-- pointer moves  > 5 px           -> the thing follows the pointer in
 *         |                                world units, the camera stays put
 *         v
 *       release -> offset = pos - pure layout position, saved to the overlay
 * ```
 * args: target (the interactive container), spec (called at press time; return
 *       null to refuse the drag, which is how a moon stays fixed outside focus)
 */
function wireDrag(target: Container, spec: () => DragSpec | null) {
  target.cursor = "grab";
  target.on("pointerdown", (e) => {
    const s = spec();
    if (!s) return;
    camTarget = null; // a camera tween must not fight the pointer
    // Owner request 3b D: dragging something OUTSIDE the group clears it, and
    // dragging something inside it takes the whole group along.
    if (!group.has(s.key)) clearGroup();
    const members = group.has(s.key)
      ? groupables().filter((g) => g.key !== s.key && group.has(g.key)).map((g) => ({ ...g, at: { x: g.obj.x, y: g.obj.y } }))
      : [];
    grab = { ...s, from: { x: e.global.x, y: e.global.y }, pos: { ...s.at }, started: false, members };
  });
}

/** Follow the pointer: screen delta into world units, then into the thing's own
 *  frame. Called from the stage's pointermove, which is why the camera pan can
 *  simply bail while a grab is live. */
function dragMove(g: Grab, gx: number, gy: number) {
  const dx = gx - g.from.x;
  const dy = gy - g.from.y;
  if (!g.started) {
    if (Math.hypot(dx, dy) <= DRAG_START_PX) return;
    g.started = true;
    app.canvas.style.cursor = "grabbing";
  }
  g.pos = {
    x: g.at.x + dx / (world.scale.x * g.frameScale),
    y: g.at.y + dy / (world.scale.y * g.frameScale),
  };
  g.move(g.pos.x, g.pos.y);
  // Owner request 3b D: the same world delta, converted into each member's own
  // frame, so a group spanning an active and an inactive system still moves as
  // one shape.
  for (const m of g.members)
    m.obj.position.set(m.at.x + dx / (world.scale.x * m.frameScale), m.at.y + dy / (world.scale.y * m.frameScale));
  if (g.members.length) allEdgesDirty = true;
  else if (g.bv) edgesDirty = g.bv; // redrawn once per frame by the ticker
}

/** Release: a real drag saves the vector from the parent anchor to where the
 *  thing was dropped, and a press that never passed the threshold leaves no
 *  trace at all (owner request 3b B). */
function dragEnd() {
  const g = grab;
  grab = null;
  if (!g?.started) return;
  app.canvas.style.cursor = "";
  dragWasReal = true;
  setOffset(g.key, g.pos.x - g.anchor.x, g.pos.y - g.anchor.y);
  // Owner request 3b D: one placement entry per grouped node, one POST.
  for (const m of g.members) setOffset(m.key, m.obj.x - m.anchor.x, m.obj.y - m.anchor.y);
  saveOffsets();
  refreshResetButton();
}

const HUD_HINT = document.getElementById("hud-hint")!.textContent!;

/** Plan step 4 D: the reset button only exists while there is something to
 *  reset, and the hint line mentions the saved layout only while it does. */
function refreshResetButton() {
  const btn = document.getElementById("btn-reset-layout")!;
  const on = hasOffsets();
  btn.classList.toggle("hidden", !on);
  document.getElementById("hud-hint")!.textContent = HUD_HINT + (on ? " · dragged nodes saved:" : "");
}

/**
 * Plan step 4 D "One reset": forget every offset and glide back to the pure
 * ladder, with no page reload.
 *
 * ```text
 * POST {layout: {}}  ->  clear the map
 *   |
 *   +-- every star     -> its column anchor
 *   +-- every planet   -> bv.lay.nodePos        (the pure layout, never mutated)
 *   +-- older docs     -> bv.lay.clusterItemPos
 *   +-- cluster marker -> bv.lay.clusterPos
 *   +-- core nodes     -> coreView.lay.variantPos
 *   +-- moons in focus -> settleMoons recomputes their slots
 *   v
 * one 400 ms tween, edges and cluster threads redrawn every frame
 * ```
 */
async function resetLayout() {
  clearOffsets();
  await saveOffsets();
  const items: { obj: Container; from: Placed; to: Placed }[] = [];
  const add = (obj: Container, to: Placed) => items.push({ obj, from: { x: obj.x, y: obj.y }, to });
  for (const bv of branchViews) {
    add(bv.root, { x: bv.cx, y: bv.rootY });
    bv.nodeViews.forEach((v, id) => add(v.root, bv.lay.nodePos.get(id)!));
    bv.strandedViews.forEach((v, id) => add(v.root, bv.lay.clusterItemPos.get(id)!));
    if (bv.clusterView) add(bv.clusterView, bv.lay.clusterPos);
  }
  coreView.nodeById.forEach((h, id) => add(h.view, coreView.lay.variantPos.get(id)!));
  resetTween = { items, t: 0 };
  if (focus) {
    const bv = branchViews.find((b) => b.branch.branch === activeName());
    const v = bv?.nodeViews.get(focus.id);
    if (bv && v) settleMoons(bv, v, world.scale.x);
  }
  refreshResetButton();
  panels.toast("Layout reset");
}

/** One frame of the reset tween: ease the positions, then let the edges and the
 *  cluster threads follow them. */
function stepResetTween(deltaMS: number) {
  if (!resetTween) return;
  resetTween.t += deltaMS;
  const k = Math.min(1, resetTween.t / RESET_MS);
  const e = 1 - (1 - k) * (1 - k); // ease-out, so the nodes land rather than stop
  for (const it of resetTween.items)
    it.obj.position.set(it.from.x + (it.to.x - it.from.x) * e, it.from.y + (it.to.y - it.from.y) * e);
  branchViews.forEach((bv) => {
    redrawEdges(bv, null);
    redrawClusterLine(bv);
  });
  if (k === 1) resetTween = null;
}

/**
 * Plan step 4 C "New plans keep the seed's spot".
 *
 * ```text
 * existing branch -> the plan's saved placement IS the seed, as a vector from
 *                    the star: put the new planet exactly there
 * new branch      -> no nodes yet, so the CARD carries the placement:
 *                    vector from the column anchor the branch will occupy
 * ```
 * Owner request 3b B is what makes this one subtraction: a saved entry is a
 * literal vector from the parent anchor, so nothing has to predict where the
 * ladder would have put the new plan (Block 4 did predict, and Confession 2
 * there is about the prediction being wrong invisibly).
 *
 * args: planPath (what /api/submit-plan wrote), branchName (its workstream)
 * returns: nothing; the placement is posted before the composer reloads the map
 */
async function saveSeedSpot(planPath: string, branchName: string) {
  if (!seed?.placed) return;
  const bv = branchViews.find((b) => b.branch.branch === branchName);
  if (bv) {
    // Measured FROM THE STAR, never in absolute world units: one more plan can
    // add a level, so the world grows taller and every column anchor slides down
    // before the new planet is ever drawn.
    const local = branchLocalOf(bv, seed);
    const seedRel = { x: local.x - bv.cx, y: local.y - bv.rootY };
    setOffset(planPath, seedRel.x, seedRel.y);
    // The numbers worth seeing when a new plan lands in the wrong place.
    console.log("[starmap] seed spot", planPath, "seed(from star)", seedRel);
  } else {
    const anchor = newColumnAnchor();
    const card = newCardPath(branchName);
    if (card) setOffset(card, seed.x - anchor.x, seed.y - anchor.y);
  }
  await saveOffsets();
}

/** A world position in one branch container's own coordinates (the container is
 *  drawn at ACTIVE_SCALE around its star while the branch is active). */
function branchLocalOf(bv: BranchView, p: { x: number; y: number }): Placed {
  return {
    x: (p.x - bv.root.x) / bv.root.scale.x + bv.cx,
    y: (p.y - bv.root.y) / bv.root.scale.y + bv.rootY,
  };
}

/** The column a brand-new workstream will occupy: the same `worldSize` the boot
 *  uses, asked about a slot list one longer. */
function newColumnAnchor(): Placed {
  const slots = tree.slots.length + 1;
  const cw = worldSize({ ...tree, slots: [...tree.slots, "new"] }, prefs).colW;
  return { x: WORLD_PAD + cw * (slots - 0.5), y: H - ROOT_Y_FROM_BOTTOM };
}

/** Where the server will put a new workstream's card, read off an existing one
 *  rather than assuming the host's folder names. */
function newCardPath(branchName: string): string | null {
  const sample = tree.branches[0]?.card.path;
  if (!sample) return null;
  const root = sample.split("/").slice(0, -2).join("/");
  return `${root}/${branchName}/${branchName.toUpperCase()}.md`;
}

// ---------------- keys ----------------

function wireKeys() {
  window.addEventListener("keydown", (e) => {
    // Plan step 1 "Ctrl+P searches filenames and paths": takes the shortcut
    // back from the browser's print dialog, and works from any field.
    if ((e.key === "p" || e.key === "P") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openPalette(revealEntry);
      return;
    }
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "s" || e.key === "S") setSelectMode(!selectMode);
    else if (e.key === "b" || e.key === "B")
      panels.openLayoutWindow(tree, prefs, (patch) =>
        post("/api/config", patch).then(() => location.reload()));
    else if (e.key === "e" || e.key === "E") {
      const p = panels.getLastReaderPath();
      if (p) panels.openInEditor(p);
    } else if (e.key === "Escape") {
      // An artifact opened from a report steps back to it, and nothing else.
      if (panels.goBack()) return;
      clearGroup(); // owner request 3b D
      panels.closeModal();
      panels.closePanel();
      if (focus) exitFocus(true);
      else if (selectMode) setSelectMode(false);
      else if (pinned) {
        pinned = null;
        applyActivation();
      }
    }
  });
  document.getElementById("btn-lock")!.addEventListener("click", lockIn);
  // Clear means empty: re-seeding the defaults here made "clear -> Save as
  // default" impossible, since the saved set could never be empty.
  document.getElementById("btn-clear")!.addEventListener("click", () => {
    selection.clear();
    refreshSelectionRings();
    updateSelectBar();
  });
  document.getElementById("btn-save-default")!.addEventListener("click", async () => {
    const saved = [...selection.keys()];
    await post("/api/config", { default_selected: saved });
    // keep the in-memory config in step, or the next S seeds the stale defaults
    tree.config.default_selected = saved;
    panels.toast(`Saved ${selection.size} nodes as the default selection`);
  });
  document.getElementById("btn-exit-select")!.addEventListener("click", () => setSelectMode(false));
  document.getElementById("btn-reset-layout")!.addEventListener("click", resetLayout);
}

// ---------------- ticker ----------------

let t = 0;
let cameraLookAt = -1; // the camera scale the zoom-dependent look was last applied at
function tick(ticker: Ticker) {
  t += ticker.deltaTime;
  // Plan step 4 A "edges redraw live, throttled to the ticker": a drag marks
  // its branch dirty on every pointermove and the redraw happens once a frame.
  if (allEdgesDirty) {
    branchViews.forEach((bv) => {
      redrawEdges(bv, null);
      redrawClusterLine(bv);
    });
    allEdgesDirty = false;
  }
  if (edgesDirty) {
    redrawEdges(edgesDirty, null);
    edgesDirty = null;
  }
  stepResetTween(ticker.deltaMS);
  // Plan step 5 A "Glow is bounded on screen", plus the live-doc rim and the
  // label resolution that follows the camera: one call, and only when the
  // camera scale actually changed (the label rasters carry their own 10 percent
  // threshold inside it, since rebuilding a glyph atlas is not free).
  if (world.scale.x !== cameraLookAt) {
    applyCameraLook(world.scale.x, app.renderer.resolution);
    cameraLookAt = world.scale.x;
  }
  // smooth branch activation
  const active = activeName();
  for (const bv of branchViews) {
    const target = (bv.root as any).__target;
    if (target) {
      bv.root.scale.set(bv.root.scale.x + (target.scale - bv.root.scale.x) * 0.16);
      bv.root.alpha += (target.alpha - bv.root.alpha) * 0.16;
    }
    // Plan step 5 B: the sun's slow brightness pulse, on the inner corona.
    // 0.026 per frame is a period of about 4 seconds at 60 fps. An active
    // branch's star brightens, the others dim with their own system.
    const base = bv.branch.branch === active ? STAR_INNER_ACTIVE : active ? STAR_INNER_DIM : STAR_INNER_ALPHA;
    bv.starGlow.alpha = base + Math.sin(t * 0.026 + bv.cx) * STAR_PULSE;
  }
  // camera tween (focus enter/exit)
  if (camTarget) {
    world.scale.set(world.scale.x + (camTarget.s - world.scale.x) * 0.14);
    world.x += (camTarget.x - world.x) * 0.14;
    world.y += (camTarget.y - world.y) * 0.14;
    if (Math.abs(camTarget.s - world.scale.x) < 0.004 &&
        Math.abs(camTarget.x - world.x) < 1 && Math.abs(camTarget.y - world.y) < 1)
      camTarget = null;
  }
  // Satellites: the detail level follows the CAMERA, so crossing FOCUS_ZOOM
  // re-styles them without any click. Proxies scale with their planet; the
  // focused rings hold FOCUS_MOON_PX on screen.
  const detailed = !!focus && world.scale.x >= FOCUS_ZOOM;
  if (detailed !== satellitesDetailed) refreshSatellites();
  for (const s of activeSatellites) {
    const focused = detailed && !!focus && s.nv.node.id === focus.id;
    const proxyPx = PROXY_MOON_OF_PLANET * s.nv.radius * world.scale.x;
    const px = (focused ? FOCUS_MOON_PX : proxyPx) * (s.hover ? MOON_HOVER_GROW : 1);
    s.dotBox.scale.set(px / world.scale.x);
    if (s.settle && focused) {
      // the label rides its moon on the side settleMoons gave it
      s.label.position.x = (s.labelSide * MOON_LABEL_OFFSET) / world.scale.x;
      // shortest-path angle lerp, radius lerp — "freeze until clickable"
      let d = s.settle.angle - s.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.angle += d * 0.12;
      s.r += (s.settle.r - s.r) * 0.12;
      s.sprite.position.set(
        s.nv.root.x + Math.cos(s.angle) * s.r,
        s.nv.root.y + Math.sin(s.angle) * s.r, // full circle, no squash
      );
    } else {
      // A proxy only has to say "something orbits this report", so it drifts at
      // a fifteenth of the focus-view speed: visible as motion, never busy.
      s.angle += s.speed * ticker.deltaTime * (focused ? 1 : 0.06);
      s.sprite.position.set(
        s.nv.root.x + Math.cos(s.angle) * s.r,
        s.nv.root.y + Math.sin(s.angle) * s.r * 0.45,
      );
    }
  }
  // coral threads: every selected node feeds the seed
  if (seed?.placed) {
    threadsG.clear();
    for (const [id] of selection) {
      const p = worldPosOf(id);
      if (p) drawCoral(threadsG, p, { x: seed.x, y: seed.y }, id, t);
    }
    // seed heartbeat
    seed.view.scale.set(1 + Math.sin(t * 0.05) * 0.06);
  }
  // revealed-node pulse: one expanding, fading ring, then gone
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += ticker.deltaTime;
    p.ring.clear().circle(0, 0, p.radius + 6 + p.t * 0.55)
      .stroke({ width: 2.2, color: SELECT_CYAN, alpha: Math.max(0, 1 - p.t / 55) });
    if (p.t > 55) {
      p.ring.destroy();
      pulses.splice(i, 1);
    }
  }
  // background parallax
  // the clouds drift a little with the camera, a tenth of the pan, screen-anchored
  bgNebula.position.set(world.x * 0.1, world.y * 0.1);
  bgFar.position.set(world.x * 0.25 - W * 0.08, world.y * 0.25 - H * 0.05);
  bgNear.position.set(world.x * 0.5 - W * 0.04, world.y * 0.5 - H * 0.02);
  if (debug) drawDebugOverlay();
}

// ---------------- debug + screenshot driver ----------------

interface Rect { x: number; y: number; width: number; height: number }

const hits = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Does a label rectangle touch a planet's body circle? Screen space, closest
 *  point of the rectangle against the circle centre. */
function rectHitsCircle(r: Rect, c: { x: number; y: number; r: number }): boolean {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.width));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.height));
  return dx * dx + dy * dy < c.r * c.r;
}

/**
 * Every label the active branch currently shows, in screen space.
 *
 * ```text
 * active branch -> planet labels (hidden outside the active system)
 *               -> expanded "+N older" doc labels
 *               -> the cluster marker's own label
 *               -> in focus mode: the focused planet's moon labels
 * ```
 */
function branchLabelRects(): { id: string; r: Rect }[] {
  const out: { id: string; r: Rect }[] = [];
  const active = activeName();
  for (const bv of branchViews) {
    if (bv.branch.branch !== active) continue;
    bv.nodeViews.forEach((v) => v.label.visible && out.push({ id: v.node.id, r: v.label.getBounds() }));
    bv.strandedViews.forEach((v) => v.label.visible && out.push({ id: `older:${v.node.id}`, r: v.label.getBounds() }));
    if (bv.clusterLabel?.visible && bv.clusterView?.visible)
      out.push({ id: `cluster:${bv.branch.branch}`, r: bv.clusterLabel.getBounds() });
  }
  for (const e of activeSatellites)
    if (e.label.visible) out.push({ id: `moon:${e.sat.name}`, r: e.label.getBounds() });
  return out;
}

/** Every planet body of the active branch, as a screen-space circle. */
function branchCircles(): { id: string; x: number; y: number; r: number }[] {
  const out: { id: string; x: number; y: number; r: number }[] = [];
  const active = activeName();
  for (const bv of branchViews) {
    if (bv.branch.branch !== active) continue;
    const add = (v: { root: Container; radius: number; node: DocNode }, tag: string) => {
      if (!v.root.visible) return;
      const g = v.root.getGlobalPosition();
      out.push({ id: tag, x: g.x, y: g.y, r: v.radius * world.scale.x });
    };
    bv.nodeViews.forEach((v) => add(v, v.node.id));
    bv.strandedViews.forEach((v) => add(v, `older:${v.node.id}`));
  }
  return out;
}

function coreLabelRects(): { id: string; r: Rect }[] {
  const out: { id: string; r: Rect }[] = [];
  coreView.nodeById.forEach((h, id) => out.push({ id, r: h.label.getBounds() }));
  coreView.anchors.forEach((h, pack) => out.push({ id: `pack:${pack}`, r: h.label.getBounds() }));
  return out;
}

/** Every core body on screen, as a screen-space circle, so a core label can be
 *  measured against the nodes of ANOTHER rail (owner minibatch 6 C). */
function coreCircles(): { id: string; x: number; y: number; r: number }[] {
  const out: { id: string; x: number; y: number; r: number }[] = [];
  const add = (h: CoreEntry, id: string) => {
    const g = h.view.getGlobalPosition();
    out.push({ id, x: g.x, y: g.y, r: (h.body.width / 2) * world.scale.x });
  };
  coreView.nodeById.forEach(add);
  coreView.anchors.forEach((h, pack) => add(h, `pack:${pack}`));
  return out;
}

function pairs(rs: { id: string; r: Rect }[]): { a: string; b: string }[] {
  const out: { a: string; b: string }[] = [];
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++)
      if (hits(rs[i].r, rs[j].r)) out.push({ a: rs[i].id, b: rs[j].id });
  return out;
}

/**
 * The readability gates of plan step 3 B, measured rather than eyeballed.
 *
 * ```text
 * labelLabel   two labels of the active branch sharing pixels
 * labelPlanet  a label rectangle over ANOTHER node's body circle
 * core         the bottom context row, measured but NOT part of the branch
 *              gates: plan step 3 never touches that row
 * ```
 * returns: {labelLabel, labelPlanet, labels, planets, core}
 */
function overlapReport() {
  const labels = branchLabelRects();
  const circles = branchCircles();
  const labelPlanet: { label: string; node: string }[] = [];
  for (const l of labels)
    for (const c of circles)
      if (l.id !== c.id && !l.id.endsWith(c.id) && rectHitsCircle(l.r, c))
        labelPlanet.push({ label: l.id, node: c.id });
  return {
    labelLabel: pairs(labels),
    labelPlanet,
    labels: labels.length,
    planets: circles.length,
    corePairs: pairs(coreLabelRects()),
    core: pairs(coreLabelRects()).length,
  };
}

/**
 * Owner minibatch 6 A: the plan-left invariant, and every place it is broken.
 *
 * The defect in the owner's sector_ship shot is a LONE plan sitting among the
 * reports on the right of its arc. Two things are checked, and the pair rule is
 * why the gate is not the flat "every plan left of every report" the brief asked
 * for: with two PAIRS on one arc, pair B's plan is necessarily right of pair A's
 * report, and separating the two kinds into sectors is exactly the arrangement
 * that puts a date group back onto three arcs (block 3b Confession 3).
 *
 * ```text
 * lone plan   must sit left of EVERY report on its level
 * pair        its own plan must sit left of its own report
 * ```
 * args: bv (the branch view)
 * returns: the violations, each naming the two documents that cross
 */
function planRightOfReport(bv: BranchView): { level: number; plan: string; report: string; kind: string }[] {
  const out: { level: number; plan: string; report: string; kind: string }[] = [];
  const lay = bv.lay;
  const xOf = (id: string) => lay.nodePos.get(id)!.x;
  const reportsByLevel = new Map<number, [string, number][]>();
  bv.nodeViews.forEach((v, id) => {
    if (docClass(v.node.kind) !== "report") return;
    const i = lay.level.get(id) ?? -1;
    if (i < 0) return;
    if (!reportsByLevel.has(i)) reportsByLevel.set(i, []);
    reportsByLevel.get(i)!.push([fileName(v.node.path), xOf(id)]);
  });
  bv.nodeViews.forEach((v, id) => {
    if (docClass(v.node.kind) !== "plan" || lay.pairOf.has(id)) return;
    const i = lay.level.get(id) ?? -1;
    for (const [name, rx] of reportsByLevel.get(i) ?? [])
      if (xOf(id) > rx) out.push({ level: i, plan: fileName(v.node.path), report: name, kind: "lone plan" });
  });
  for (const [plan, report] of lay.ties)
    if (xOf(plan) > xOf(report))
      out.push({ level: lay.level.get(report)!, plan: fileName(plan), report: fileName(report), kind: "pair" });
  return out;
}

/**
 * Owner minibatch 6 C: what the core row came out as, so the row count and the
 * label collisions are numbers rather than an impression.
 * returns: {packs, rows, rowYs, labelPairs} -- labelPairs are overlapping core labels
 */
function coreRowStats() {
  const rows = coreView.lay.rails;
  const labels = coreLabelRects();
  const circles = coreCircles();
  const collisions = pairs(labels);
  // Owner minibatch 6 C: a label over ANOTHER core node's body, which is what a
  // second rail 40 units down used to do to the row above it.
  const labelOverNode: { label: string; node: string }[] = [];
  for (const l of labels)
    for (const c of circles)
      if (l.id !== c.id && rectHitsCircle(l.r, c)) labelOverNode.push({ label: l.id, node: c.id });
  const packs = shownPacks();
  return {
    packs: packs.length,
    // Every non-index file of every drawn pack, which is what the file node
    // count has to equal: none hidden behind an anchor, none drawn twice.
    files: packs.reduce((n, p) => n + p.variants.filter((v) => !v.is_index).length, 0),
    fileNodes: coreView.nodeById.size,
    anchorNodes: coreView.anchors.size,
    rows: rows.length,
    rowYs: rows.map((r) => Math.round(r.y)),
    labelPairs: collisions,
    labelOverlaps: collisions.length,
    labelOverNode,
    labelOverNodes: labelOverNode.length,
  };
}

/**
 * The slack between the label box the layout reserved for a node and the width
 * Pixi actually rendered, in world units, smallest first.
 *
 * The arc capacity is computed from `labelWidth`, a bare-canvas measurement made
 * before any Pixi text exists. If Pixi ever rendered wider than that, two tuples
 * on one arc could touch, so the harness gates on this number.
 */
function labelSlack(bv: BranchView): { worst: number; node: string } {
  let worst = { worst: Infinity, node: "none" };
  const check = (v: NodeView) => {
    const d = labelWidth(v.node) - v.label.width;
    if (d < worst.worst) worst = { worst: Math.round(d * 100) / 100, node: fileName(v.node.path) };
  };
  bv.nodeViews.forEach(check);
  bv.strandedViews.forEach(check);
  return worst;
}

/**
 * The numbers the block-3 gates are written against.
 *
 * returns: {world, scale, minLabelPx, branches[{branch, levels, pairs, starBand}]}
 *   minLabelPx   the smallest label height currently on screen, in screen px
 *   pairs        [pair id, level index, plan file, report file] per pair
 *   tuplesPerLevel  owner request 3b A: how many tuples each level holds, so
 *                the arch packing is a number and not an impression
 *   carryLevels  the level indices that CONTINUE the date group below them
 *   spokes       star edges, one per tuple, against `anchors`, which is how
 *                many the pre-3b one-per-planet rule drew
 *   labelSlack   the smallest gap between the label box the LAYOUT reserved and
 *                the width Pixi actually rendered; the arc capacity rests on
 *                this being positive
 *   starBand     world-unit clearance between the star and the lowest content,
 *                plus how many labels or planets fall INTO the 60-unit band
 *                under the star where the branch name and status live
 */
function layoutStats() {
  const labels = branchLabelRects();
  return {
    world: { width: W, height: H, colW: Math.round(colW * 10) / 10, reach: Math.round(reach * 10) / 10 },
    style: prefs.style,
    arcMaxNodes: prefs.arcMaxNodes,
    core: coreRowStats(),
    scale: Math.round(world.scale.x * 1000) / 1000,
    labelH: Math.max(0, ...labels.map((l) => Math.round(l.r.height * 10) / 10)),
    maxLabelW: Math.round(Math.max(0, ...labels.map((l) => l.r.width)) / world.scale.x * 10) / 10,
    minLabelPx: labels.length ? Math.min(...labels.map((l) => Math.round(l.r.height * 10) / 10)) : 0,
    branches: branchViews.map((bv) => {
      const lay = bv.lay;
      const bottoms: number[] = [];
      bv.nodeViews.forEach((v) => bottoms.push(v.root.y + Math.max(v.radius, LABEL_H / 2)));
      bv.strandedViews.forEach((v) => bottoms.push(v.root.y + Math.max(v.radius, LABEL_H / 2)));
      const lowest = Math.max(...bottoms);
      return {
        branch: bv.branch.branch,
        levels: lay.levels,
        nodes: bv.nodeViews.size,
        expanded: expanded.has(bv.branch.branch),
        tuplesPerLevel: lay.tuplesPerLevel,
        levelRadii: lay.levelRadii,
        levelElevs: lay.levelElevs,
        topR: Math.round(lay.topR * 10) / 10,
        // Owner minibatch 6 A: the invariant the owner's sector_ship shot broke.
        planRight: planRightOfReport(bv),
        carryLevels: lay.arcs.flatMap((a, i) => (a.carry ? [i] : [])),
        // Owner request 3b: one star edge per tuple instead of one per anchor.
        spokes: lay.tuples.length,
        anchors: bv.branch.nodes.filter((n) => !n.superseded_by).length,
        labelSlack: labelSlack(bv),
        pairs: lay.ties.map(([pl, rp]) => ({
          pair: lay.pairOf.get(rp)!,
          level: lay.level.get(rp)!,
          plan: fileName(pl),
          report: fileName(rp),
        })),
        starBand: {
          clearance: Math.round((bv.rootY - lowest) * 10) / 10,
          hits: bottoms.filter((y) => y >= bv.rootY).length,
          edgeStartAboveStar: 20,
        },
      };
    }),
  };
}

/** The ring the focused planet's moons settled on, so the 0.45 rule is a
 *  number in checks.txt rather than a claim. */
function focusRingStats() {
  if (!focus) return null;
  const bv = branchViews.find((b) => b.branch.branch === activeName())!;
  const mine = activeSatellites.filter((e) => e.nv.node.id === focus!.id);
  return {
    node: fileName(focus.id),
    moons: mine.length,
    nearestPlanet: Math.round(nearestPlanetDistance(bv, focus.id) * 10) / 10,
    ringRadii: [...new Set(mine.map((e) => Math.round((e.settle?.r ?? 0) * 10) / 10))].sort((a, b) => a - b),
    labelled: mine.filter((e) => e.label.visible).length,
  };
}

/**
 * The numbers the plan-step-5 look gates are written against.
 *
 * ```text
 * per visible planet:  body screen radius = radius * camera * branch scale
 *                      glow screen radius = half its CURRENT width, so the
 *                        camera bound of the ticker is included
 *                      ratio = glow / body        <- gate: at most 1.7 in focus
 * the biggest planet:  texture px per screen px = 288 / body screen diameter
 *                        <- gate: at least 1, or a focused planet is a blur
 * ```
 * returns: {cameraScale, glowFactor, maxGlowRatio, biggest, star}
 */
function lookStats() {
  const planets: { id: string; bodyR: number; glowR: number; ratio: number; texPx: number }[] = [];
  for (const bv of branchViews) {
    const frame = world.scale.x * bv.root.scale.x;
    bv.nodeViews.forEach((v) => {
      if (!v.root.visible) return;
      planets.push({
        id: fileName(v.node.path),
        bodyR: Math.round(v.radius * frame * 10) / 10,
        glowR: Math.round((v.glow.width / 2) * frame * 10) / 10,
        ratio: Math.round(((v.glow.width / 2) / v.radius) * 100) / 100,
        texPx: v.body.texture.width,
      });
    });
  }
  const worst = planets.reduce((a, p) => (p.ratio > a.ratio ? p : a), planets[0]);
  const biggest = planets.reduce((a, p) => (p.bodyR > a.bodyR ? p : a), planets[0]);
  const starFrame = world.scale.x * (branchViews[0]?.root.scale.x ?? 1);
  // The rim of a live doc is bounded on screen like the glow, so what matters is
  // the stroke in SCREEN px on the branch that is drawn at 1.07.
  const rim = rimBound();
  const activeFrame = world.scale.x * (branchViews.find((b) => b.branch.branch === activeName())?.root.scale.x ?? 1);
  return {
    cameraScale: Math.round(world.scale.x * 1000) / 1000,
    glowFactor: Math.round(Math.min(1, GLOW_CAM_CAP / world.scale.x) * 1000) / 1000,
    maxGlowRatio: worst.ratio,
    maxGlowAt: worst.id,
    biggest: {
      ...biggest,
      texPerScreenPx: Math.round((biggest.texPx / (biggest.bodyR * 2)) * 100) / 100,
    },
    planetTexPx: PLANET_TEX_PX,
    rim: {
      worldWidth: Math.round(rim.width * 1000) / 1000,
      screenWidth: Math.round(rim.width * activeFrame * 100) / 100,
      alpha: Math.round(rim.alpha * 100) / 100,
    },
    // Plan step 5 B keeps the corona in WORLD units: it is the sun, and it is
    // what a branch star is meant to be found by. Reported, never gated.
    star: { bodyR: Math.round(STAR_R * starFrame * 10) / 10, innerCoronaRadii: 2.5, outerCoronaRadii: 5 },
  };
}

function drawDebugOverlay() {
  if (!debugOverlay) return;
  debugOverlay.clear();
  const o = overlapReport();
  const bad = new Set([...o.labelLabel.flatMap((x) => [x.a, x.b]), ...o.labelPlanet.map((x) => x.label)]);
  for (const { id, r } of branchLabelRects()) {
    const local = { x: (r.x - world.x) / world.scale.x, y: (r.y - world.y) / world.scale.y };
    debugOverlay
      .rect(local.x, local.y, r.width / world.scale.x, r.height / world.scale.y)
      .stroke({ width: 1, color: bad.has(id) ? 0xff4455 : 0x33ff88, alpha: 0.8 });
  }
}

function exposeDriver() {
  (window as any).__starmap = {
    ready: true,
    state: () => ({ pinned, hovered, selectMode, selection: [...selection.keys()], slots: tree.slots }),
    pin: (name: string) => { pinned = name; applyActivation(true); },
    unpin: () => { pinned = null; hovered = null; applyActivation(true); },
    hoverNode: (id: string) => {
      for (const bv of branchViews) {
        const v = bv.nodeViews.get(id);
        if (v) { v.root.emit("pointerover", {} as any); }
      }
    },
    openNode: (id: string) => {
      for (const bv of branchViews) {
        const v = bv.nodeViews.get(id);
        if (v) nodeTapped(bv, v.node);
      }
    },
    openCluster: (branch: string) => {
      const bv = branchViews.find((b) => b.branch.branch === branch);
      bv?.clusterView?.emit("pointertap", { stopPropagation() {} } as any);
    },
    enterSelect: () => setSelectMode(true),
    toggleSelect: (path: string, title = "") => toggleSelect(path, { title, date: "" }),
    lockIn,
    openGame: (id: string) => {
      for (const bv of branchViews) {
        const v = bv.nodeViews.get(id);
        if (v) panels.openGameDialog(v.node, bv.branch.branch, tree.config.game_prompt_template);
      }
    },
    focusNode: (id: string) => {
      for (const bv of branchViews) {
        const v = bv.nodeViews.get(id);
        if (v) nodeTapped(bv, v.node);
      }
    },
    demoSeed: (branchName: string | null) => {
      setSelectMode(true);
      const bv = branchViews.find((b) => b.branch.branch === branchName);
      if (bv) placeSeed(bv.cx + 46, bv.rootY - 150);
      else placeSeed(WORLD_PAD * 0.45, H - 470);
      const extra = bv?.branch.nodes.find((n) => n.live);
      if (extra) toggleSelect(extra.id, { title: extra.title, date: extra.date });
    },
    openPalette: () => openPalette(revealEntry),
    // Owner minibatch 6 D: one core node as drawn, so the gate quotes the body's
    // own hue and alpha rather than reading them off a screenshot.
    coreNodeStats: (path: string) => {
      const h = coreView.nodeById.get(path) ?? [...coreView.anchors.values()].find((a) => a.target === path);
      if (!h) return null;
      return {
        label: h.label.text,
        pack: h.pack.pack,
        hue: h.hue,
        alpha: h.body.alpha * h.view.alpha,
        radius: Math.round(h.body.width / 2),
        x: Math.round(h.view.x),
        y: Math.round(h.view.y),
      };
    },
    openCore: (path: string) => {
      const h = coreView.nodeById.get(path) ?? [...coreView.anchors.values()].find((a) => a.target === path);
      if (h) openCoreDoc(path, h);
    },
    // Owner minibatch 6 B: every planet of one branch relative to its STAR, so
    // a gate can check which half of the arc each kind sits in and compare one
    // style's positions against the other's.
    branchNodes: (branch: string) => {
      const bv = branchViews.find((b) => b.branch.branch === branch);
      if (!bv) return [];
      const out: { path: string; name: string; cls: string; x: number; y: number; level: number; paired: boolean }[] = [];
      bv.nodeViews.forEach((v, id) => {
        const p = bv.lay.nodePos.get(id)!;
        out.push({
          path: v.node.path, name: fileName(v.node.path), cls: docClass(v.node.kind),
          x: Math.round((p.x - bv.cx) * 10) / 10, y: Math.round((p.y - bv.rootY) * 10) / 10,
          level: bv.lay.level.get(id) ?? -1, paired: bv.lay.pairOf.has(id),
        });
      });
      return out.sort((a, b) => a.x - b.x);
    },
    // Owner minibatch 6 A: what sits on one level of one branch, left to right,
    // so the plan-left-of-report rule can be read as positions and names.
    levelNodes: (branch: string, level: number) => {
      const bv = branchViews.find((b) => b.branch.branch === branch);
      if (!bv) return [];
      const out: { name: string; cls: string; x: number }[] = [];
      bv.nodeViews.forEach((v, id) => {
        if (bv.lay.level.get(id) !== level) return;
        out.push({ name: fileName(v.node.path), cls: docClass(v.node.kind), x: worldCoordsOf(v.root).x });
      });
      return out.sort((a, b) => a.x - b.x);
    },
    // Plan step 2 C: the WebGL side of "sharp text at native resolution" is
    // one number, and the harness reads it rather than guessing from the shot.
    resolution: () => app.renderer.resolution,
    // The settled satellites of the focused planet, so a proof check can
    // assert what is actually on screen and labelled.
    // Plan step 2 clutter gate: what is actually on screen per planet, so the
    // hint cap and label legibility are asserted, not eyeballed.
    satelliteStats: () => {
      const per = new Map<string, number>();
      const labelHits: string[] = [];
      const overlaps = (a: any, b: any) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      for (const e of activeSatellites) {
        if (!e.sprite.visible) continue;
        per.set(e.nv.node.id, (per.get(e.nv.node.id) ?? 0) + 1);
        const d = e.dotBox.getBounds();
        for (const bv of branchViews)
          bv.nodeViews.forEach((nv) => {
            if (nv.label.visible && overlaps(d, nv.label.getBounds()))
              labelHits.push(`${e.sat.name} over ${fileName(nv.node.path)}`);
          });
      }
      // A dot may still cross a label belonging to ANOTHER planet, because the
      // arcs pack labels over their neighbours; what must hold is that the
      // label wins the pixels, which is the paint order, asserted here.
      const underLabels = branchViews.every((bv) =>
        [...bv.nodeViews.values()].every((nv) =>
          bv.root.getChildIndex(bv.satellitesLayer) < bv.root.getChildIndex(nv.root)));
      // Moons must read as smaller than any planet, which is a number, not a
      // judgement: the proxy radius the ticker holds against the smallest
      // planet radius currently on screen.
      const planetRadii = branchViews.flatMap((bv) =>
        [...bv.nodeViews.values()].map((nv) => nv.radius * world.scale.x));
      return { perNode: [...per.entries()], max: Math.max(0, ...per.values()),
               visible: [...per.values()].reduce((a, b) => a + b, 0),
               underLabels, labelHits, detailed: satellitesDetailed,
               moonScreenRadius: Math.round(Math.max(0, ...activeSatellites.filter((e) => e.sprite.visible)
                 .map((e) => e.moon.getBounds().width / 2)) * 10) / 10,
               minPlanetScreenRadius: Math.round(Math.min(...planetRadii) * 10) / 10 };
    },
    satelliteLabels: () => activeSatellites
      .filter((e) => focus && e.nv.node.id === focus.id)
      .map((e) => ({ label: e.label.text, visible: e.label.visible, ...e.dotBox.getGlobalPosition() })),
    reveal: (path: string) => loadIndex().then((entries) => {
      const e = entries.find((x) => x.path === path);
      if (e) revealEntry(e);
    }),
    overlapReport,
    layoutStats,
    // Plan step 4: the saved map, and where anything sits in WORLD units, so
    // the harness can measure a drag delta and a reload against real numbers.
    layoutOffsets: () => allOffsets(),
    // The PURE ladder spot of anything, in branch-local units: what a layout
    // reset returns to, and what a new plan's offset is measured against.
    purePos: (key: string) => {
      for (const bv of branchViews) {
        if (bv.branch.card.path === key) return { x: bv.cx, y: bv.rootY };
        if (clusterKey(bv.branch.card.path) === key) return bv.lay.clusterPos;
        const p = bv.lay.nodePos.get(key) ?? bv.lay.clusterItemPos.get(key);
        if (p) return p;
      }
      return coreView.lay.variantPos.get(key) ?? null;
    },
    worldPos: (key: string) => {
      for (const bv of branchViews) {
        if (bv.branch.card.path === key) return worldCoordsOf(bv.star);
        if (clusterKey(bv.branch.card.path) === key && bv.clusterView)
          return worldCoordsOf(bv.clusterView);
        const v = bv.nodeViews.get(key) ?? bv.strandedViews.get(key);
        if (v) return worldCoordsOf(v.root);
      }
      const core = coreView.nodeById.get(key);
      if (core) return worldCoordsOf(core.view);
      const sat = activeSatellites.find((e) => e.sat.path === key && e.sprite.visible);
      return sat ? worldCoordsOf(sat.sprite) : null;
    },
    camera: () => ({ x: world.x, y: world.y, s: world.scale.x }),
    // Owner request 3b B: where something sits relative to its own star, in
    // BRANCH-LOCAL units, next to where the pure layout would put it. This is
    // exactly the pair of numbers a saved placement is about, and it is free of
    // both the camera and the 1.07 the active branch is drawn at.
    relPos: (key: string) => {
      for (const bv of branchViews) {
        const rel = (p?: Placed) => (p ? { x: p.x - bv.cx, y: p.y - bv.rootY } : null);
        if (bv.branch.card.path === key)
          return { at: { x: bv.root.x - bv.cx, y: bv.root.y - bv.rootY }, pure: { x: 0, y: 0 } };
        const marker = clusterKey(bv.branch.card.path) === key ? bv.clusterView : null;
        const obj = (bv.nodeViews.get(key) ?? bv.strandedViews.get(key))?.root ?? marker;
        if (obj) return {
          at: rel(obj),
          pure: rel(bv.lay.nodePos.get(key) ?? bv.lay.clusterItemPos.get(key) ?? (marker ? bv.lay.clusterPos : undefined)),
        };
      }
      return null;
    },
    // Owner request 3b D: the current group, so a gate can name what a box
    // picked up.
    boxGroup: () => [...group],
    // Which level a node landed on, so a gate can name it (owner request 3b A).
    levelOf: (key: string) => {
      for (const bv of branchViews) {
        const i = bv.lay.level.get(key);
        if (i !== undefined) return i;
      }
      return null;
    },
    resetLayout,
    // Where something is on screen right now, so a harness can click it or
    // crop to it instead of guessing coordinates.
    screenPos: (path: string) => {
      for (const bv of branchViews) {
        if (bv.branch.card.path === path) {
          const g = bv.star.getGlobalPosition();
          return { x: g.x, y: g.y, r: 15 * world.scale.x };
        }
        const v = bv.nodeViews.get(path) ?? bv.strandedViews.get(path);
        if (v) {
          const g = v.root.getGlobalPosition();
          return { x: g.x, y: g.y, r: v.radius * world.scale.x };
        }
      }
      return null;
    },
    focusRingStats,
    lookStats,
    // Plan step 5: what the glyph atlases were last rasterized at, so the
    // label sharpness gate quotes the real number instead of the camera scale.
    labelResolution,
    // Plan step 5 C: the background star radii, in screen px, next to the scale
    // of the layers they are drawn on (1 by construction, since the layers live
    // on the stage), so "a star never becomes a planet-sized dot" is a number.
    bgStats: () => ({
      layers: backgroundStarStats().map((l, i) => ({
        layer: i === 0 ? "far" : "near",
        ...l,
        drawnScale: (i === 0 ? bgFar : bgNear).scale.x,
        rMaxScreen: l.rMax * (i === 0 ? bgFar : bgNear).scale.x,
      })),
      cameraScale: world.scale.x,
      ground: { width: Math.round(bgGround.width), height: Math.round(bgGround.height) },
    }),
    // Plan step 5 "Frame time": requestAnimationFrame deltas over `ms`, so the
    // cost of the banded textures is measured while the camera is actually
    // moving rather than guessed from a still frame.
    frameStats: (ms = 3000) => new Promise((resolve) => {
      const deltas: number[] = [];
      const start = performance.now();
      let last = start;
      const step = (now: number) => {
        deltas.push(now - last);
        last = now;
        if (now - start < ms) return requestAnimationFrame(step);
        const sorted = [...deltas].sort((a, b) => a - b);
        resolve({
          frames: deltas.length,
          ms: Math.round(now - start),
          avg: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100,
          p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
          worst: Math.round(sorted[sorted.length - 1] * 100) / 100,
        });
      };
      requestAnimationFrame(step);
    }),
    // Plan step 3 D: the cluster toggle, driven the way a click drives it.
    toggleCluster: (branch: string) => {
      const bv = branchViews.find((b) => b.branch.branch === branch);
      if (bv) toggleCluster(bv);
    },
    openOlder: (path: string) => {
      for (const bv of branchViews) {
        const v = bv.strandedViews.get(path);
        if (v) strandedTapped(bv, v);
      }
    },
  };
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:2em">starmap boot failed:\n${e?.stack ?? e}</pre>`;
});
