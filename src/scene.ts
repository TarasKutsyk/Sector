// Scene builder — plan §Visuals. Three world layers:
//
//   stage
//     ├── bgGround deep-space gradient, screen sized  (no parallax)
//     ├── bgFar    faint nebula tints + far starfield  (parallax 0.25)
//     ├── bgNear   near starfield                      (parallax 0.5)
//     └── world    branch systems + core row, the one pan/zoom container
//
// The three background layers live on the STAGE, not in the world, which is why
// a background star keeps its screen size however far the camera zooms in.
//
// Each branch system is one container so activation (scale up, others fade)
// is a single property change, not a re-layout.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Branch, ClusterItem, DocNode, ContextPack, Tree } from "./data";
import {
  ACTIVE_SCALE, BranchLayout, CLUSTER_GAP, COLUMN_W, CORE_Y_FROM_BOTTOM, CoreLayout, LayoutPrefs,
  CORE_LABEL_DY, ROOT_Y_FROM_BOTTOM, TOP_PAD, arcY, branchExtent, branchReach, jitter, layoutBranch,
  layoutCore, packParts,
} from "./layout";
import {
  GOLD, NodeView, PLANET_TEX_PX, STAR_GOLD, bandsFor, boundGlow, cropMid, glowTexture, hslToHex,
  labelWidth, makeLabel, makeNodeView, placeLabel, planetTexture, sunTexture,
  verticalGradientTexture,
  nebulaTexture,
} from "./nodes";
import { clusterKey, placedAt } from "./offsets";

export interface BranchView {
  branch: Branch;
  root: Container; // whole system (star + planets + edges + labels)
  star: Container;
  starGlow: Sprite;
  starLabel: Text;
  detailLabel: Text;
  nodeViews: Map<string, NodeView>;
  clusterView: Container | null;
  clusterLabel: Text | null; // reads "+N older", or "collapse" while expanded
  strandedViews: Map<string, NodeView>; // the "+N older" docs, hidden until expanded
  edges: Graphics;
  clusterLine: Graphics | null; // star to cluster marker, redrawn when either is dragged
  tieLines: Graphics; // the dotted pair ties, out of the way at focus zoom
  satellitesLayer: Container;
  lay: BranchLayout;
  cx: number;
  rootY: number;
}

export interface CoreEntry {
  view: Container;
  body: Sprite;
  label: Text;
  pack: ContextPack;
  hue: number; // the pack hue the body was drawn at, shared by anchor and files
}

export interface CoreView {
  root: Container;
  nodeById: Map<string, CoreEntry>; // one entry per FILE of a drawn pack
  // Owner minibatch 6 D: one anchor node per pack, keyed by the pack name. It
  // opens `target` (the pack's INDEX.md, else its first file) and is the only
  // way into a pack whose single file IS the index.
  anchors: Map<string, CoreEntry & { target: string }>;
  lay: CoreLayout; // the pure positions, so a layout reset can tween back to them
}

export interface World {
  width: number;
  height: number;
  branchViews: BranchView[];
  coreView: CoreView;
}

export const WORLD_PAD = 190; // keeps edge systems + their labels on-canvas

// Plan step 5 B: the sun. Radius unchanged from the old star body, and the
// three inner-corona brightnesses the ticker picks between (none active, this
// branch active, another branch active).
export const STAR_R = 15;
export const STAR_INNER_ALPHA = 0.7;
export const STAR_INNER_ACTIVE = 0.9;
export const STAR_INNER_DIM = 0.5;
export const STAR_PULSE = 0.08;
export const CORE_NODE_R = 9; // the context-row nodes, unchanged by plan step 5
// A branch with no levels at all still owns the innermost radius.
const ROOT_R_MIN = 142;

/**
 * World box. Owner request 3b A turned the sizing the other way round from plan
 * step 3: the WIDTH now comes first, because a level's capacity is what decides
 * how many levels a branch needs.
 *
 * ```text
 * slots -> width  = one COLUMN_W per slot (a level plus its margins, at 1.07)
 *       -> colW   = the column each branch owns
 *       -> reach  = half a column less half the neighbour margin: how far a
 *          |        system may draw either side of its star (minibatch 6 A)
 *          v
 *       topR (the outermost level radius of the deepest branch, which may have
 *          |  GROWN past its base radius to hold a whole date group)
 *          +--> height = star offset + topR + cluster gap + top pad
 * ```
 * args: tree, prefs (the layout style and the arc node cap)
 * returns: {width, height, colW, reach} in world units
 */
export function worldSize(tree: Tree, prefs: LayoutPrefs): { width: number; height: number; colW: number; reach: number } {
  const slots = Math.max(tree.slots.length, 1);
  const width = Math.max(1500, tree.slots.length * COLUMN_W + WORLD_PAD * 2);
  const colW = (width - 2 * WORLD_PAD) / slots;
  const reach = branchReach(colW);
  const topR = Math.max(ROOT_R_MIN, ...tree.branches.filter((b) => !b.error)
    .map((b) => branchExtent(b, labelWidth, reach, prefs).topR));
  return {
    width,
    height: Math.max(1000, ROOT_Y_FROM_BOTTOM + (topR + CLUSTER_GAP) * ACTIVE_SCALE + TOP_PAD),
    colW,
    reach,
  };
}

// ---------------- background ----------------

// Plan step 5 C "The background is quiet and stable": the star radii, in SCREEN
// pixels, because both layers live on the stage and are never scaled by the
// camera. The gate is that the near layer's biggest star stays under 2 px at 5x
// zoom, which is what keeps a background star from reading as a planet.
const STAR_LAYERS = [
  { count: 260, rMin: 0.4, rMax: 1.2, alpha: 0.62 },
  { count: 90, rMin: 0.8, rMax: 1.8, alpha: 0.85 },
] as const;

/**
 * Plan step 5 C: a deep-space gradient, a few faint cool tints and two bounded
 * parallax starfields. Nothing here animates.
 *
 * ```text
 * ground  screen-sized gradient sprite, #05070f -> #0a0d1c, NO parallax
 * far     3 cool nebula tints at alpha 0.06 to 0.09, away from the columns,
 *         + 260 stars of radius 0.4 to 1.2      (parallax 0.25, set by main.ts)
 * near    90 stars of radius 0.8 to 1.8          (parallax 0.5)
 * ```
 * The old bright galactic core and its fourteen coloured blobs are gone: they
 * were the brightest thing on a map whose subject is the branches.
 *
 * args: width, height (world box, which is what the scatter is spread over)
 * returns: {ground, far, near} -- three stage layers, in paint order
 */
export function buildBackground(width: number, height: number): { ground: Sprite; far: Container; near: Container } {
  const ground = new Sprite(verticalGradientTexture("#05070f", "#0a0d1c"));
  const far = new Container();
  const near = new Container();

  STAR_LAYERS.forEach((layer, li) => {
    const stars = new Graphics();
    for (let i = 0; i < layer.count; i++) {
      // deterministic pseudo-random scatter (no Math.random: stable shots)
      const x = ((i * 733 + 89 + li * 37) % 997) / 997;
      const y = ((i * 389 + 31 + li * 53) % 991) / 991;
      const r = layer.rMin + (((i * 61) % 13) / 13) * (layer.rMax - layer.rMin);
      stars.circle(x * width, y * height, r)
        .fill({ color: 0xdfe8ff, alpha: layer.alpha * (0.4 + ((i * 7) % 10) / 16) });
    }
    (li === 0 ? far : near).addChild(stars);
  });
  return { ground, far, near };
}

// Owner decoration: three nebula clouds, magenta left, violet middle, amber
// right, placed in SCREEN space (fractions of the viewport) so the trio keeps
// its order whatever the world width or the number of slots. Each is a noise
// sheet over an optional soft halo of the same tint.
const NEBULA: [number, number, string, number, number, number, number, number, number][] = [
  // fx    fy    tint       seed  w     h    tilt   alpha  glow (a soft halo behind the sheet, 0 for none)
  [0.16, 0.3, "#a05a8a", 23, 0.62, 0.72, -0.35, 0.7, 0.3],
  [0.5, 0.42, "#8650c1", 11, 0.78, 0.86, 0.55, 1.0, 0.15],
  [0.86, 0.2, "#b06a4a", 37, 0.58, 0.68, 0.2, 0.85, 0.2],
];

/** Build the nebula layer once; `layoutNebula` places it for a viewport. */
export function buildNebula(): Container {
  const c = new Container();
  for (const [, , tint, seed, , , tilt, alpha, glow] of NEBULA) {
    if (glow > 0) {
      const halo = new Sprite(glowTexture(tint, 512));
      halo.anchor.set(0.5);
      halo.blendMode = "add";
      halo.alpha = glow;
      halo.rotation = tilt;
      c.addChild(halo);
    }
    const sheet = new Sprite(nebulaTexture(tint, seed));
    sheet.anchor.set(0.5);
    sheet.blendMode = "add";
    sheet.alpha = alpha;
    sheet.rotation = tilt;
    c.addChild(sheet);
  }
  return c;
}

/** Place and size the clouds for a viewport: w and h are fractions of the
 *  screen width and height, so a wider window gets wider clouds, not more gaps. */
export function layoutNebula(c: Container, sw: number, sh: number): void {
  let k = 0;
  for (const [fx, fy, , , w, h, , , glow] of NEBULA) {
    const size = [w * sw, h * sh] as const;
    if (glow > 0) {
      const halo = c.children[k++] as Sprite;
      halo.setSize(size[0] * 1.15, size[1] * 1.15);
      halo.position.set(fx * sw, fy * sh);
    }
    const sheet = c.children[k++] as Sprite;
    sheet.setSize(size[0], size[1]);
    sheet.position.set(fx * sw, fy * sh);
  }
}

/** The star radii the plan-step-5 background gate quotes, in screen px (the
 *  layers are never scaled, so these are the drawn sizes at any zoom). */
export function backgroundStarStats() {
  return STAR_LAYERS.map((l) => ({ count: l.count, rMin: l.rMin, rMax: l.rMax }));
}

// ---------------- branch systems ----------------

/**
 * Owner request 3b: ONE edge per tuple, aimed at the tuple's midpoint, instead
 * of one per planet. That is what turns twenty lines bundled under the star into
 * a fan of nested arches.
 *
 * ```text
 *   (plan) ······ (report)      the dotted tie still joins the two
 *          \
 *           \  one edge, to the middle of the tie
 *            ★
 * ```
 * The chain arrows are untouched, and a report's `plan:` link only gets its own
 * line when the two are NOT in the same tuple (inside a tuple the tie says it).
 */
function edgeLines(g: Graphics, b: Branch, lay: BranchLayout, pos: Map<string, { x: number; y: number }>, rootX: number, rootY: number, highlight: Set<string> | null) {
  g.clear();
  const alphaFor = (id: string, base: number) => (highlight && !highlight.has(id) ? base * 0.25 : base);
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  for (const ids of lay.tuples) {
    const pts = ids.map((id) => pos.get(id)).filter((q): q is { x: number; y: number } => !!q);
    if (!pts.length) continue;
    const mid = {
      x: pts.reduce((a, q) => a + q.x, 0) / pts.length,
      y: pts.reduce((a, q) => a + q.y, 0) / pts.length,
    };
    const live = ids.some((id) => byId.get(id)?.live);
    g.moveTo(rootX, rootY - 20).lineTo(mid.x, mid.y);
    g.stroke({ width: 1, color: 0x6f86c9, alpha: alphaFor(ids[0], live ? 0.5 : 0.28) });
  }
  for (const n of b.nodes) {
    const p = pos.get(n.id)!;
    if (n.supersedes && pos.has(n.supersedes)) {
      // chain: arrow old -> new (drawn at the newer end)
      const q = pos.get(n.supersedes)!;
      g.moveTo(q.x, q.y).lineTo(p.x, p.y);
      g.stroke({ width: 1.4, color: 0x8fa7e8, alpha: alphaFor(n.id, 0.55) });
      const ang = Math.atan2(p.y - q.y, p.x - q.x);
      const ax = p.x - Math.cos(ang) * 16;
      const ay = p.y - Math.sin(ang) * 16;
      g.moveTo(ax, ay)
        .lineTo(ax - Math.cos(ang - 0.42) * 8, ay - Math.sin(ang - 0.42) * 8)
        .moveTo(ax, ay)
        .lineTo(ax - Math.cos(ang + 0.42) * 8, ay - Math.sin(ang + 0.42) * 8);
      g.stroke({ width: 1.4, color: 0x8fa7e8, alpha: alphaFor(n.id, 0.7) });
    }
    // A `plan:` link inside a tuple is already drawn as the dotted tie.
    if (n.plan && pos.has(n.plan) && lay.pairOf.get(n.id) !== lay.pairOf.get(n.plan)) {
      const q = pos.get(n.plan)!;
      g.moveTo(q.x, q.y).lineTo(p.x, p.y);
      g.stroke({ width: 1, color: 0x5b9bd5, alpha: alphaFor(n.id, 0.4) });
    }
  }
}

/**
 * Plan step 5 B "Branch stars are suns", the owner's widening of step 5: if the
 * plans and reports are nice, the branch nodes should be nicer.
 *
 * ```text
 *            \   |   /          spikes   4 rays, 3R long, alpha 0.12, fixed
 *        (  ((O))  )            outer    corona 5R, alpha 0.25
 *            /   |   \          inner    corona 2.5R, alpha 0.7, the pulsed one
 *                                body    warm white-gold gradient, radius R=15
 * ```
 * The inner corona is the sprite the ticker pulses (amplitude 0.08, about 4 s)
 * and brightens to 0.9 on the active branch.
 *
 * returns: {star, starGlow} -- starGlow IS the inner corona
 */
function buildStar(): { star: Container; starGlow: Sprite } {
  const star = new Container();
  const outer = new Sprite(glowTexture(STAR_GOLD, 512));
  outer.anchor.set(0.5);
  outer.blendMode = "add";
  outer.alpha = 0.25;
  outer.setSize(STAR_R * 2 * 5);
  const starGlow = new Sprite(glowTexture(STAR_GOLD, 512));
  starGlow.anchor.set(0.5);
  starGlow.blendMode = "add";
  starGlow.alpha = STAR_INNER_ALPHA;
  starGlow.setSize(STAR_R * 2 * 2.5);
  // Each spike is a long thin TRIANGLE, widest at the star and pointed at the
  // tip: four uniform lines of the same length read as a crosshair instead
  // (visible in the first look_star_crop shot).
  const spikes = new Graphics();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    spikes.poly([
      -dy * 1.3, dx * 1.3,
      dx * 3 * STAR_R, dy * 3 * STAR_R,
      dy * 1.3, -dx * 1.3,
    ]);
  spikes.fill({ color: 0xffe3a6, alpha: 0.12 });
  const body = new Sprite(sunTexture());
  body.anchor.set(0.5);
  body.setSize(STAR_R * 2);
  star.addChild(outer, starGlow, spikes, body);
  return { star, starGlow };
}

/** A stranded "+N older" doc, dressed as the dim little planet plan step 3 D
 *  asks for. The cluster list gives us id, title, date and kind, which is
 *  every field a planet view reads.
 *  args: it (one cluster item)
 *  returns: a DocNode the node factory accepts */
function strandedNode(it: ClusterItem): DocNode {
  return {
    id: it.id, path: it.id, at_root: false, kind: it.kind, status: "stranded", stamped: false,
    date: it.date, title: it.title, look_at: [], provenance: [], page: null,
    supersedes: null, superseded_by: null, plan: null, satellites: [],
    satellites_truncated: false, live: false, played: false,
  };
}

/** The "+N older" marker. Plan step 5 B: one soft nebula puff instead of the
 *  two-to-six stacked blobs, with the tiny grey planet and the label as they
 *  were. Nothing else. */
function buildCluster(b: Branch): { view: Container; label: Text } {
  const c = new Container();
  const puff = new Sprite(glowTexture("#5a6ea6", 256));
  puff.anchor.set(0.5);
  puff.blendMode = "add";
  puff.alpha = 0.25;
  puff.setSize(104, 74);
  puff.position.set(jitter(b.branch, 10), 0);
  c.addChild(puff);
  const dot = new Sprite(planetTexture(225, 12));
  dot.anchor.set(0.5);
  dot.setSize(14);
  dot.alpha = 0.75;
  c.addChild(dot);
  const label = makeLabel(`+${b.cluster.count} older`, 11);
  label.anchor.set(0.5, 0);
  label.position.set(0, 16);
  label.alpha = 0.6;
  c.addChild(label);
  return { view: c, label };
}

/**
 * Owner request 3b A: a faint arc guide behind each level, so the arch reads as
 * a shape.
 *
 * One polyline per level along its own arc, from its first tuple to its last,
 * 20 world units past each end. A CARRIED level (the same date group, continued
 * because the one below it filled up) is drawn dimmer, so the eye reads "same
 * day, continued".
 */
function arcGuides(g: Graphics, lay: BranchLayout) {
  for (const arc of lay.arcs) {
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const dx = arc.x0 + ((arc.x1 - arc.x0) * i) / steps;
      const p = { x: lay.cx + dx, y: arcY(lay.rootY, arc.r, dx) };
      i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
    }
    g.stroke({ width: 1.2, color: 0x8fa7e8, alpha: arc.carry ? 0.11 : 0.18 });
  }
}

/** Plan step 3 A: the faint dotted tie that makes a pair read as one row. */
function pairTies(g: Graphics, lay: BranchLayout) {
  for (const [a, b] of lay.ties) {
    const p = lay.nodePos.get(a)!;
    const q = lay.nodePos.get(b)!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    // inset past both planet bodies, then dash across: the innermost pair sits
    // only one level out, so the tie has to read at 54 world units too
    for (let t = 13; t < len - 13; t += 11) {
      g.moveTo(p.x + ux * t, p.y + uy * t).lineTo(p.x + ux * Math.min(t + 6, len - 13), p.y + uy * Math.min(t + 6, len - 13));
    }
  }
  g.stroke({ width: 1, color: 0xa8b8e8, alpha: 0.25 });
}

export function buildBranchView(b: Branch, cx: number, height: number, reach: number, prefs: LayoutPrefs): BranchView {
  const root = new Container();
  const rootY = height - ROOT_Y_FROM_BOTTOM;
  const lay = layoutBranch(b, cx, rootY, reach, labelWidth, prefs);
  // Every planet, the stranded docs and the cluster marker hang off the star, so
  // one anchor serves all of them (owner request 3b B).
  const starAnchor = { x: cx, y: rootY };

  const edges = new Graphics();
  const levelArcs = new Graphics();
  arcGuides(levelArcs, lay);
  root.addChild(levelArcs, edges);

  const { star, starGlow } = buildStar();
  star.position.set(cx, rootY);
  const starLabel = makeLabel(b.branch.toUpperCase(), 13);
  starLabel.style.letterSpacing = 2.4;
  starLabel.style.fill = 0xe8eeff;
  starLabel.anchor.set(0.5, 0);
  starLabel.position.set(cx, rootY + 34);
  const waiting = b.card.check_me.length;
  const detailLabel = makeLabel(waiting ? `${b.card.status} · check me: ${waiting}` : b.card.status, 10);
  detailLabel.anchor.set(0.5, 0);
  detailLabel.position.set(cx, rootY + 52);
  detailLabel.alpha = 0.65;
  detailLabel.label = "detail"; // hidden unless branch active

  const satellitesLayer = new Container();
  const nodeViews = new Map<string, NodeView>();
  for (const n of b.nodes) {
    const v = makeNodeView(n);
    // Owner request 3b B: a saved placement is a literal vector from the star,
    // so a dragged planet stays put even when the levels reorder around it. The
    // pure layout in `lay` is never mutated, so the reset button only has to
    // read it again.
    const p = placedAt(n.path, starAnchor, lay.nodePos.get(n.id)!);
    v.root.position.set(p.x, p.y);
    placeLabel(v, lay.side.get(n.id)!);
    nodeViews.set(n.id, v);
    root.addChild(v.root);
  }

  // Plan step 3 D: the stranded docs are placed and built up front, hidden
  // until the cluster is clicked, so expanding moves nothing already drawn.
  const strandedViews = new Map<string, NodeView>();
  for (const it of b.cluster.items) {
    const v = makeNodeView(strandedNode(it), 6);
    const p = placedAt(it.id, starAnchor, lay.clusterItemPos.get(it.id)!);
    v.root.position.set(p.x, p.y);
    v.root.alpha = 0.5;
    v.root.visible = false;
    placeLabel(v, lay.clusterItemSide.get(it.id)!);
    strandedViews.set(it.id, v);
    root.addChild(v.root);
  }

  const tieLines = new Graphics();
  pairTies(tieLines, lay);
  root.addChildAt(tieLines, root.getChildIndex(edges) + 1);
  edgeLines(edges, b, lay, lay.nodePos, cx, rootY, null);

  let clusterView: Container | null = null;
  let clusterLabel: Text | null = null;
  let clusterLine: Graphics | null = null;
  if (b.cluster.count > 0) {
    const built = buildCluster(b);
    clusterView = built.view;
    clusterLabel = built.label;
    const cp = placedAt(clusterKey(b.card.path), starAnchor, lay.clusterPos);
    clusterView.position.set(cp.x, cp.y);
    clusterLine = new Graphics();
    root.addChildAt(clusterLine, 0);
    root.addChild(clusterView);
  }

  // Satellites paint UNDER the planets and their filename labels: expanded
  // proof folders made the dots numerous, and a marker must never cover a
  // name. Inserted just above the edges layer, whose index is read rather
  // than assumed (the cluster glow may already sit at 0).
  root.addChildAt(satellitesLayer, root.getChildIndex(edges) + 1);
  root.addChild(star, starLabel, detailLabel);
  const bv: BranchView = {
    branch: b, root, star, starGlow, starLabel, detailLabel, nodeViews, clusterView,
    clusterLabel, clusterLine, strandedViews, edges, tieLines, satellitesLayer, lay, cx, rootY,
  };
  redrawClusterLine(bv);
  return bv;
}

/** The faint thread from the star up to the "+N older" marker. Plan step 4 A
 *  moves the marker, so the thread is redrawn from wherever it now sits instead
 *  of being stroked once at build time. */
export function redrawClusterLine(bv: BranchView) {
  if (!bv.clusterLine || !bv.clusterView) return;
  bv.clusterLine.clear()
    .moveTo(bv.cx, bv.rootY - 24)
    .lineTo(bv.clusterView.x, bv.clusterView.y + 20)
    .stroke({ width: 1, color: 0x51619b, alpha: 0.18 });
}

/** Redraw a branch's edges with a highlight set (hovered node's connections). */
export function redrawEdges(bv: BranchView, highlight: Set<string> | null) {
  const pos = new Map<string, { x: number; y: number }>();
  bv.nodeViews.forEach((v, id) => pos.set(id, { x: v.root.x, y: v.root.y }));
  edgeLines(bv.edges, bv.branch, bv.lay, pos, bv.cx, bv.rootY, highlight);
}

// ---------------- core ----------------

/** The hue a pack's bodies are drawn at, shared by its anchor and its files so
 *  the row reads as one pack per colour (owner minibatch 6 D). */
function packHue(pack: string): number {
  return { env: 214, goal: 315, lens: 145, style: 182 }[pack] ?? 240;
}

/**
 * The bottom context row: the SELECTED packs (owner minibatch 6 C), each drawn
 * as an anchor node plus one node per file, wrapped onto further rails when the
 * row runs out of span.
 *
 * ```text
 * rail (one per row)
 *   (STYLE)--(app)--(style_main)--...     anchor opens INDEX.md, every file its
 *    STYLE    app    style_main           own node and its own label
 *   |
 *   +--> next row, below this row's LABELS, its own rail
 * ```
 * Every file of every drawn pack appears exactly once, on exactly one rail: the
 * anchor is its own node, never a stand-in for the first file.
 *
 * args: core (packs to draw), width (world width), height (world height)
 * returns: CoreView -- the container, every file node, every pack anchor, the layout
 */
export function buildCoreView(core: ContextPack[], width: number, height: number): CoreView {
  const root = new Container();
  const y = height - CORE_Y_FROM_BOTTOM;
  const lay = layoutCore(core, width, y);
  const nodeById = new Map<string, CoreEntry>();
  const anchors = new Map<string, CoreEntry & { target: string }>();

  const rail = new Graphics();
  for (const r of lay.rails) rail.moveTo(r.from, r.y).lineTo(r.to, r.y);
  rail.stroke({ width: 1, color: 0x3c4c85, alpha: 0.35 });
  root.addChild(rail);

  for (const p of core) {
    const a = lay.packAnchors.get(p.pack)!;
    // Plan step 5 D: the pack anchor glow shrinks to 1.8 times the node radius
    // (9 world units), so a pack reads as a marker on the rail rather than as
    // the brightest object in the row.
    const anchorGlow = new Sprite(glowTexture(p.color, 256));
    anchorGlow.anchor.set(0.5);
    anchorGlow.blendMode = "add";
    anchorGlow.alpha = 0.8;
    anchorGlow.setSize(CORE_NODE_R * 2 * 1.8);
    anchorGlow.position.set(a.x, a.y);
    boundGlow(anchorGlow);
    root.addChild(anchorGlow);

    const hue = packHue(p.pack);
    const { index, files } = packParts(p);
    const target = index?.id ?? files[0]?.id;
    if (!target) continue; // a pack folder with no file of its own: nothing to open

    // Owner minibatch 6 D: the anchor is a node, in the pack's own colour and at
    // the same size as its files, never grey and never dimmer. Its label is the
    // pack name, which is why the pack name rides the node.
    const anchorLabel = makeLabel(p.pack.toUpperCase(), 12);
    anchorLabel.style.letterSpacing = 2;
    anchorLabel.style.fill = 0xdde7ff;
    anchorLabel.anchor.set(0.5, 0);
    anchorLabel.position.set(0, CORE_LABEL_DY);
    anchors.set(p.pack, { ...coreNode(root, a, p.pack, a, hue, p, anchorLabel), target });

    for (const v of files) {
      const label = makeLabel(cropMid(v.name, 16), 10);
      label.anchor.set(0.5, 0);
      label.position.set(0, 13);
      label.alpha = 0.6;
      nodeById.set(v.id, coreNode(root, lay.variantPos.get(v.id)!, v.id, a, hue, p, label));
    }
  }
  return { root, nodeById, anchors, lay };
}

/**
 * One node of the core row: the banded body at its pack's hue, its glow, and the
 * label it was handed (a file name, or the pack name for an anchor).
 * args: root (the row container), pure (its computed position), key (the layout
 *       key a saved placement is looked up under), anchor (its pack anchor),
 *       hue, pack, label
 * returns: the CoreEntry the interactivity wiring hangs off
 */
function coreNode(root: Container, pure: { x: number; y: number }, key: string, anchor: { x: number; y: number }, hue: number, pack: ContextPack, label: Text): CoreEntry {
  const pos = placedAt(key, anchor, pure);
  const view = new Container();
  // Plan step 5 D "The core context row matches": the same banded shaded-sphere
  // body at the pack hue, radius unchanged.
  const body = new Sprite(planetTexture(hue, 55, PLANET_TEX_PX, bandsFor(key)));
  body.anchor.set(0.5);
  body.setSize(CORE_NODE_R * 2);
  const glow = new Sprite(glowTexture(pack.color));
  glow.anchor.set(0.5);
  glow.blendMode = "add";
  glow.alpha = 0.5;
  glow.setSize(44);
  boundGlow(glow);
  view.addChild(glow, body, label);
  view.position.set(pos.x, pos.y);
  root.addChild(view);
  return { view, body, label, pack, hue };
}
