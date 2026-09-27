// Deterministic layout. Every position is a pure function of the tree and the
// expanded/collapsed toggle, so the map never reshuffles between sessions and
// screenshots are reproducible.
//
// Owner request 3b "same-date tuples on one arc" replaced plan step 3's
// one-row-per-tuple ladder: a TUPLE is a plan and its report (or a lone doc),
// every tuple of the same date shares one arched LEVEL, and the tuples of a
// level are laid along the whole arc.
//
// Owner minibatch 6 then took the capacity rule off three tuples per level: a
// level holds EVERY tuple of its date up to `arc_max_nodes` nodes, because the
// arc CLIMBS, so two tuples may share an x range once it has carried them a
// label box apart vertically. Each level owns its own elevation band and may
// grow its radius to make room; a group only carries over when the node cap or
// the neighbouring system stops it.
//
//   column i (one branch)                    world
//   ┌────────────────────────────────┐   ┌──────────────────────────┐
//   │        (cluster)               │   │  col0    col1    col2    │
//   │  plan ○ ·······__·······  ○ rp │   │                          │
//   │   ·· ○ plan  ○ rp   doc ○ ··   │   │    core row (bottom)     │
//   │  ·plan ○ ····· ○ rp·           │   └──────────────────────────┘
//   │            ★ root              │   one level = one date, laid along a
//   └────────────────────────────────┘   real arc that fans out per level
//
// An arc is a circle about the star, of at least ROOT_R + i * LEVEL_STEP, cut
// where its own elevation band ends, so the levels read as nested arches. One
// edge leaves the star per TUPLE, aimed at the tuple's midpoint.

import type { Branch, ClusterItem, ContextPack, DocNode } from "./data";

export interface Placed {
  x: number;
  y: number;
}

export type Side = "left" | "right";
export type DocClass = "plan" | "report" | "doc";

/** One member of a tuple: a doc node, or a stranded "+N older" item dressed as
 *  one. The layout only ever reads these three fields. */
export interface Item {
  id: string;
  path: string;
  kind: string;
}

/** The label width the arc capacity is computed from, in world units, measured
 *  from the real label string rather than assumed per arc. */
export type LabelWidth = (n: Item) => number;

/** The faint guide drawn behind one level: its radius, the horizontal span it
 *  covers either side of the branch centre line, and whether it CONTINUES the
 *  level below it (the same date group, carried over because the level filled
 *  up) so the eye reads "same day, continued". */
export interface LevelArc {
  r: number;
  x0: number;
  x1: number;
  carry: boolean;
}

export interface BranchLayout {
  cx: number; // column center
  rootY: number;
  nodePos: Map<string, Placed>;
  side: Map<string, Side>; // which side of its planet the node's label takes
  level: Map<string, number>; // level index, 0 = the level nearest the star
  pairOf: Map<string, string>; // node id -> pair id, set on BOTH members of a pair
  ties: [string, string][]; // [plan id, report id] per pair, for the dotted tie
  clusterItemPos: Map<string, Placed>; // the "+N older" docs, placed whether shown or not
  clusterItemSide: Map<string, Side>;
  clusterPos: Placed;
  levels: number; // level count, the expansion levels included
  arcs: LevelArc[]; // one per level, in level order
  // Owner request 3b: one star edge per TUPLE, so these are the member ids the
  // spoke's midpoint is computed from (one or two ids, stranded docs excluded).
  tuples: string[][];
  tuplesPerLevel: number[];
  // Owner minibatch 6 A: a level may grow past its base radius to hold its whole
  // date group, so the radii are data rather than i * LEVEL_STEP.
  levelRadii: number[];
  levelElevs: number[]; // and the elevation band each level's arc ends at
  topR: number; // the outermost level's radius, which is what the world is sized from
}

export const CORE_Y_FROM_BOTTOM = 96;
export const ROOT_Y_FROM_BOTTOM = 300;

// Plan step 3 F "Branch star surroundings": the first level sits this far out,
// so nothing lands in the band under the star where the name and status live.
export const ROOT_R = 142;

export const LABEL_H = 16; // the Pixi line box of makeLabel(11); the harness asserts it
export const LABEL_GAP = 8; // planet edge to label edge
export const LABEL_W_MAX = 200; // "DOC " plus a 22-character crop at 11px
export const NODE_R_MAX = 13;
export const CLUSTER_GAP = 96;
export const TOP_PAD = 60;
// The active branch is drawn at this scale around its own star, so the world
// has to hold the grown version or the cluster marker leaves the canvas.
export const ACTIVE_SCALE = 1.07;

// Plan step 3 E "tidy moon rings": the focused planet's moon rings stay inside
// this fraction of the nearest neighbour distance, and a ring has to clear the
// planet body plus a moon. Both numbers feed the level step below, because two
// planets one level apart are the nearest neighbours in the common case.
export const MOON_RING_FRACTION = 0.45;
export const MOON_RING_PAD = 8;
// Owner request 3b C: and the ring never grows past this, however far a planet
// was dragged from its siblings (Block 4 Confession 7: 0.45 of a 300-unit gap
// is a 135-unit ring, which leaves the viewport at focus zoom).
export const MOON_RING_MAX = 36;

/**
 * Vertical distance between two levels.
 *
 * Two terms, the larger wins:
 *
 * ```text
 * LABEL_H + 6                       two consecutive levels stack labels on the
 *                                   same vertical, so their line boxes need the
 *                                   label height plus a gap
 * (NODE_R_MAX + MOON_RING_PAD)      plan step 3 E: the level step is the nearest
 *   / MOON_RING_FRACTION            neighbour distance, and 0.45 of it must
 *                                   still clear the biggest planet plus a moon
 * ```
 *
 * The moon term dominates at these sizes (46.7 against 22), which is why the
 * ladder is airier than the label rule alone would ask for.
 */
export const LEVEL_STEP = Math.max(
  LABEL_H + 6,
  (NODE_R_MAX + MOON_RING_PAD) / MOON_RING_FRACTION,
);

// Owner minibatch 6 B "Two layout styles": `spread` is the style blocks 3b to 5
// shipped (plans fill the left of each arc, reports the right, a lone pair's tie
// stretches across the middle) and `coupled` sits every pair as a tight couple,
// plan then report, with couples and lone docs spread evenly along the arc.
export type LayoutStyle = "spread" | "coupled";

/** The two layout preferences the Layout window writes (owner minibatch 6 C).
 *  `arcMaxNodes` counts NODES, so a pair counts as two. */
export interface LayoutPrefs {
  style: LayoutStyle;
  arcMaxNodes: number;
}

export const DEFAULT_PREFS: LayoutPrefs = { style: "spread", arcMaxNodes: 12 };

// Owner request 3b A: inside a tuple the plan sits left of its report, this far
// apart, with the dotted tie across the gap. Both labels point OUTWARD (plan's
// to the left, report's to the right), so nothing but the tie is between them.
export const TUPLE_INNER = 56;
// Owner minibatch 6 B "coupled": "plan then report with a 2.5-radius gap and a
// short tie", measured centre to centre off the biggest planet radius.
export const COUPLE_INNER = 2.5 * NODE_R_MAX;
// The clearance between two tuples on one arc. Each tuple's box already
// CONTAINS its two outward labels, so this is the gap between tuple k's report
// label and tuple k+1's plan label, which is why it satisfies the brief's "at
// least the wider of their two outward labels plus 12" with room to spare.
// It is 40 rather than 12 because a label has to read as belonging to its own
// planet: its own planet's edge is LABEL_GAP (8) away, so the nearest FOREIGN
// planet has to be much further than that, and at 12 the two were 21 and 25
// world units, which the eye cannot tell apart.
export const TUPLE_GAP = 40;
// Owner request 3b A: "a level's usable width is the branch column width minus
// a 40-unit margin on each side".
export const LEVEL_MARGIN = 40;
// Owner minibatch 6 A "the arc may extend past the branch column, stopping only
// where it would overlap the neighbouring system's drawn extent with a 30-unit
// margin". Two neighbouring stars are one column apart and both systems extend
// symmetrically, so each may reach half a column minus half the margin.
export const NEIGHBOUR_MARGIN = 30;
// Owner minibatch 6 A: two planets may share an x range as long as the arc has
// carried them this far apart vertically, which is what lets a whole date group
// climb one arch instead of carrying over. It has to clear the worst case of a
// label box over a planet BODY, so it is a half label plus the biggest radius
// plus a margin (8 + 13 + 5), not just a label height. The same number separates
// two neighbouring levels' elevation bands, so the guarantee is one constant.
export const ARC_STACK_V = LABEL_H / 2 + NODE_R_MAX + 5;
export const BODY_STEP = 2 * NODE_R_MAX + 6;
// Owner minibatch 6 A "Level radii can grow to make room": a level that cannot
// hold its date group at the base radius is pushed out in these increments (and
// every level above it follows), until it fits or until the arc has reached the
// full horizontal room, beyond which a bigger radius buys nothing.
const RADIUS_GROW_STEP = LEVEL_STEP / 2;

const TUPLE_SPAN_MAX = 2 * (NODE_R_MAX + LABEL_GAP + LABEL_W_MAX) + TUPLE_INNER;
const LONE_SPAN_MAX = 2 * NODE_R_MAX + LABEL_GAP + LABEL_W_MAX;
/**
 * The usable width one level is sized for: a full plan-report tuple beside a
 * lone doc, both carrying labels at the LABEL_W_MAX cap (498 + 12 + 234 = 744).
 *
 * This is what fixes the column width, which is the reverse of plan step 3,
 * where the column followed the outermost radius. It has to be that way round:
 * the arc capacity decides how many levels a branch needs, so a capacity read
 * back off the level count would be circular.
 */
export const LEVEL_WIDTH = TUPLE_SPAN_MAX + TUPLE_GAP + LONE_SPAN_MAX;
/** One branch column: a level, its two margins, and room for the 1.07 the
 *  active branch is drawn at. */
export const COLUMN_W = (LEVEL_WIDTH + 2 * LEVEL_MARGIN) * ACTIVE_SCALE;

// How high above the star the ENDS of the innermost arc sit. Keeps level 0 out
// of the star's halo and out of the band where its name and status live.
export const ARC_ELEV_0 = 100;
// Block 3b's elevation ladder: every arc further out ends this much higher than
// the one inside it. `spread` keeps it, because its shape IS block 3b's (the
// owner's words), and because a mirrored pair always sits near the top of its
// own arc, so a band computed from the highest planet would push every level out
// by a whole radius and undo the one-arc-per-date packing.
export const ARC_ELEV_STEP = LABEL_H + 6;

/**
 * Owner minibatch 6 A: how far out along x a level whose arc ENDS sit at
 * elevation `e` may reach, at radius `r`.
 *
 * Block 3b tied the elevation to the level index. It cannot stay that way once a
 * whole date group climbs one arc: a level's planets then use a BAND of
 * elevations rather than only the two ends, and two levels whose bands overlap
 * put content at the same height at different x, which is precisely how a label
 * slides under its neighbour (block 3b Confession 1). So each level now owns a
 * band: its ends sit one label box above the highest planet of the level below
 * it, and `packLevels` computes that as it goes.
 *
 * ```text
 *        _-----_          level i+1: ends at e(i+1) = maxElev(i) + ARC_STACK_V
 *      _-  ___  -_
 *     /  _-   -_  \       level i:   ends at e(i), planets anywhere from e(i)
 *    |  /       \  |                 up to maxElev(i)
 *    ★ the star
 * ```
 * args: r (the level radius), e (its end elevation above the star)
 * returns: the largest |dx| a planet on that level may take
 */
export function arcHalfAt(r: number, e: number): number {
  return Math.sqrt(Math.max(r * r - e * e, 1));
}

/**
 * How far either side of its star one branch system may draw (owner minibatch
 * 6 A). The arc is free to leave the branch column: what stops it is the
 * neighbouring system, whose own extent is the mirror image of this one, so the
 * boundary is the midpoint between the two stars less half the margin.
 *
 * ```text
 * star i                   midpoint                   star i+1
 *   |<------- reach ------->|<-30->|<------- reach ------->|
 *   |<------------------- colW ---------------------------->|
 * ```
 * args: colW (one branch column's width in world units)
 * returns: the half width in world units
 */
export function branchReach(colW: number): number {
  return colW / 2 - NEIGHBOUR_MARGIN / 2;
}

/**
 * The y of a point on one level's arc: a plain circle about the star, which is
 * what makes the levels nest without ever crossing.
 * args: rootY (the star's y), r (the level radius), dx (offset from the centre line)
 * returns: the world y
 */
export function arcY(rootY: number, r: number, dx: number): number {
  return rootY - Math.sqrt(Math.max(r * r - dx * dx, 1));
}

/** Stable tiny jitter from a path hash: organic, never random between runs. */
export function jitter(id: string, amp = 8): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000 - 0.5) * 2 * amp;
}

/** Plan step 3 C: hue jitter is kept to plus or minus 6 so a plan never drifts
 *  toward the report amber. */
export function hueJitter(id: string, amp = 6): number {
  return jitter(id + "#hue", amp);
}

const REPORT_KINDS = new Set(["report", "review"]);

/**
 * The three visual classes plan step 3 C recognizes.
 * args: kind (the front-matter kind the server read)
 * returns: "plan" | "report" | "doc" -- everything unrecognized is a doc
 */
export function docClass(kind: string): DocClass {
  if (kind === "plan") return "plan";
  return REPORT_KINDS.has(kind) ? "report" : "doc";
}

/** Which side of its planet a LONE doc's label takes: a plan reads leftward,
 *  a report or doc rightward, exactly as plan step 3 B had it. */
export function sideOf(kind: string): Side {
  return docClass(kind) === "plan" ? "left" : "right";
}

/**
 * The stem two halves of one pair share.
 *
 * Plan step 3 A: a report pairs with its plan through its own `plan:` link
 * first; this is the fallback convention the owner's repo already follows.
 *
 * ```text
 * plan_2026-07-27_crash_safety_and_modal_exits.md   -> 2026-07-27_crash_safety_and_modal_exits
 * review_2026-07-27_crash_safety_and_modal_exits.md -> 2026-07-27_crash_safety_and_modal_exits
 * 2026-09-12_starmap-demo-plan.md                   -> 2026-09-12_starmap-demo
 * ```
 * args: path (repo-relative)
 * returns: the bare stem, leading kind word and trailing kind word removed
 */
export function pairKey(path: string): string {
  const stem = (path.split("/").pop() ?? path).replace(/\.[a-z]+$/i, "");
  return stem.replace(/^(?:plan|review|report)_/, "").replace(/[-_](?:plan|report|review)$/, "");
}

function fileOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/** One tuple: the plan half, the report half, or just one of them. `order` is
 *  the filename the left-to-right order inside a level is taken from. */
interface Tuple {
  left: Item | null;
  right: Item | null;
  tie: boolean; // a real pair, so the two get the dotted tie between them
  order: string;
}

/** One level: the tuples that share it, the radius it settled at (owner
 *  minibatch 6 A lets a level grow past its base radius to make room), where
 *  each tuple's leftmost planet sits along the arc, whether it continues the
 *  date group below it, and whether it holds stranded "+N older" docs. */
interface Level {
  tuples: Tuple[];
  r: number;
  e: number; // the elevation its arc ends at, i.e. the bottom of its own band
  slots: Slot[];
  carry: boolean;
  stranded: boolean;
}

/** Where one tuple's two members sit on their level, as offsets from the branch
 *  centre line. `null` on a side the tuple has no member on. In `spread` the two
 *  are mirrored (-d and +d); in `coupled` they are a couple's two ends. */
interface Slot {
  left: number | null;
  right: number | null;
}

/**
 * The horizontal box one tuple occupies, in world units.
 *
 * ```text
 *  |<-- leftPad -->|<- inner ->|<-- rightPad -->|
 *  [ plan label ] (plan) ···· (report) [ report label ]
 * ```
 * A lone tuple has no `inner` and no label on its empty side. Owner minibatch
 * 6 B "coupled": a pair's inner gap is the tight couple gap in that style.
 * args: t (the tuple), labelW (measured label widths), prefs (the layout style)
 * returns: {leftPad, inner, rightPad, width} -- leftPad is the distance from
 *          the box's left edge to the LEFTMOST planet's centre
 */
function tupleGeom(t: Tuple, labelW: LabelWidth, prefs: LayoutPrefs) {
  const leftPad = NODE_R_MAX + (t.left ? LABEL_GAP + labelW(t.left) : 0);
  const rightPad = NODE_R_MAX + (t.right ? LABEL_GAP + labelW(t.right) : 0);
  const inner = t.left && t.right ? (prefs.style === "coupled" ? COUPLE_INNER : TUPLE_INNER) : 0;
  return { leftPad, inner, rightPad, width: leftPad + inner + rightPad };
}

/** How high above the star one point of a level's arc sits. The whole
 *  same-date-on-one-arc rule rests on this: the arc climbs, so two tuples whose
 *  labels share an x range can still be a label box apart vertically.
 *  args: dx (offset from the centre line), r (the level radius)
 *  returns: the height above the star, in world units */
function arcHeight(dx: number, r: number): number {
  return Math.sqrt(Math.max(r * r - dx * dx, 1));
}

/**
 * Owner minibatch 6 A: the next x along one arc that is ARC_STACK_V above or
 * below `x0`, which is where the NEXT tuple may sit even though its neighbour's
 * label still covers that x.
 *
 * ```text
 *            ___(3)___          the arc climbs, so stepping right from (1)
 *        (2)/         \         raises the planet by dy; once dy is a label
 *       (1)/           \(4)     box the two labels cannot touch, and the
 *         /             \       horizontal gap may be as small as BODY_STEP
 *   left flank        right flank
 *
 * x0 < 0 (left flank)   climbing: h grows, so x1 = -sqrt(r^2 - (h0 + V)^2)
 * x0 >= 0 (right flank) falling:  h shrinks, so x1 = +sqrt(r^2 - (h0 - V)^2)
 * near the top the left flank runs out of climb, and the step lands on the
 * right flank at the same height minus V, which is the mirror x
 * ```
 * args: x0 (the previous planet's x), r (the level radius)
 * returns: the earliest x that clears x0 vertically, or Infinity if the arc
 *          cannot deliver the clearance at all
 */
function nextByHeight(x0: number, r: number): number {
  const h0 = arcHeight(x0, r);
  if (x0 < 0) {
    const up = h0 + ARC_STACK_V;
    if (up < r) return Math.max(-Math.sqrt(r * r - up * up), x0 + BODY_STEP);
  }
  const down = h0 - ARC_STACK_V;
  if (down <= 0) return Infinity;
  return Math.max(Math.sqrt(r * r - down * down), x0 + BODY_STEP);
}

/**
 * Does one placement keep every pair of tuples apart, by width OR by height?
 *
 * This is the gate the packer is built against, checked over ALL pairs rather
 * than neighbours only, because the slack spreading below can slide a tuple
 * over the top of the arc, where climbing turns into falling and a pair that
 * was 22 units apart can close up again.
 *
 * args: xs (each tuple's leftmost planet x), geo (their boxes), r (the radius)
 * returns: true when every pair clears either horizontally or vertically
 */
function clearanceOk(xs: number[], geo: { leftPad: number; inner: number; rightPad: number }[], r: number): boolean {
  for (let k = 0; k < xs.length; k++) {
    for (let j = k + 1; j < xs.length; j++) {
      const a = xs[k] + geo[k].inner; // k's RIGHTMOST planet
      const b = xs[j]; // j's LEFTMOST planet
      const dx = b - a;
      if (dx >= geo[k].rightPad + geo[j].leftPad + TUPLE_GAP) continue;
      if (dx >= BODY_STEP && Math.abs(arcHeight(a, r) - arcHeight(b, r)) >= ARC_STACK_V) continue;
      return false;
    }
  }
  return true;
}

/**
 * The interval a level's planets may occupy: the arc's own reach, and the
 * system's reach, which owner minibatch 6 A widened from the branch column to
 * the neighbour boundary.
 *
 * args: run, r (the level radius), e (its end elevation), reach (the system's
 *       half width), labelW, prefs
 * returns: {lo, hi} for the leftmost and the rightmost planet centre
 */
function levelBounds(run: Tuple[], r: number, e: number, reach: number, labelW: LabelWidth, prefs: LayoutPrefs) {
  const a = arcHalfAt(r, e);
  const lo = Math.max(-a, -reach + tupleGeom(run[0], labelW, prefs).leftPad);
  const hi = Math.min(a, reach - tupleGeom(run[run.length - 1], labelW, prefs).rightPad);
  return { lo, hi };
}

/**
 * Lay one run of tuples along one arc, packed as tightly as the width-or-height
 * rule allows and then spread into whatever room is left over.
 *
 * ```text
 * greedy from lo:  next x = min(horizontal gap, next height step)
 *       |
 *       v
 * last planet past hi?  -> the run does not fit this arc, carry over
 *       |
 *       v
 * spread the leftover evenly across the gaps, largest share first, and fall
 * back to a tighter share (or to the tight packing) if spreading would slide a
 * tuple over the top of the arc into its neighbour
 * ```
 * args: run, r (the level radius), e (its end elevation), reach, labelW, prefs
 * returns: each tuple's leftmost planet x, or null when the run does not fit
 */
/**
 * Owner minibatch 6 B, corrected: `spread` is block 3b's shape, strictly.
 *
 * ALL plans take the left half of the arc and ALL reports the right half, each
 * half ordered by filename OUTWARD from the centre, and a pair's two members sit
 * at mirrored angles with the dotted tie across the centre. That is one ladder
 * of distances shared by the two halves, walked tuple by tuple:
 *
 * ```text
 *      plan2   plan1  (plan0 ···· report0)  report1   report2
 *        |       |       |            |        |         |
 *      -d2     -d1     -d0    ★      +d0      +d1       +d2
 *                       tie crosses the centre line
 *
 * d0 = TUPLE_INNER / 2, so the innermost pair's tie is 56 units long
 * dk = the smallest distance that clears rank k-1 ON EACH OCCUPIED SIDE, either
 *      by width (the inner label points outward, so it is the inner member's
 *      label plus the outer member's radius plus TUPLE_GAP) or by the arc's own
 *      climb (ARC_STACK_V of height, bodies at least BODY_STEP apart)
 * ```
 * A rank with no member on one side simply does not advance that side, which is
 * how a level of one plan and six reports still packs: the plan sits at -d0 and
 * the reports walk +d0 to +d5 down the right flank.
 *
 * args: run (the level's tuples, in filename order), r (the level radius), e (its
 *       end elevation), reach (the system half width), labelW
 * returns: one Slot per tuple, or null when the level cannot hold the run
 */
function laySpread(run: Tuple[], r: number, e: number, reach: number, labelW: LabelWidth, prior: Perch[]): Slot[] | null {
  const a = arcHalfAt(r, e);
  const outward = (it: Item) => NODE_R_MAX + LABEL_GAP + labelW(it);
  // The next distance outward that clears `d` by a whole label box of climb.
  const byClimb = (d: number) => {
    const h = arcHeight(d, r) - ARC_STACK_V;
    return h > 0 ? Math.max(Math.sqrt(Math.max(r * r - h * h, 1)), d + BODY_STEP) : Infinity;
  };
  const placed: { left: { d: number; it: Item } | null; right: { d: number; it: Item } | null } = { left: null, right: null };
  const out: Slot[] = [];
  // A pair ALONE on its level stretches to the ends of the arc, which is the old
  // block 3 row: plan far left, report far right, the tie across the whole
  // middle. Every other rank starts at half the tuple gap, so the innermost
  // pair's tie is 56 units and the halves read outward from there.
  const lone = run.length === 1 && run[0].left && run[0].right;
  let d = lone
    ? Math.min(a, reach - Math.max(outward(run[0].left!), outward(run[0].right!)))
    : TUPLE_INNER / 2;
  run.forEach((t, k) => {
    if (k > 0) {
      const need: number[] = [d];
      for (const side of ["left", "right"] as const) {
        const prev = placed[side];
        if (!t[side] || !prev) continue;
        need.push(Math.min(prev.d + outward(prev.it) + NODE_R_MAX + TUPLE_GAP, byClimb(prev.d)));
      }
      d = Math.max(...need);
    }
    out.push({ left: t.left ? -d : null, right: t.right ? d : null });
    if (t.left) placed.left = { d, it: t.left };
    if (t.right) placed.right = { d, it: t.right };
  });
  // The outermost member of each half has to keep its outward label inside the
  // arc and inside the system's reach; otherwise the level carries over.
  for (const side of ["left", "right"] as const) {
    const last = placed[side];
    if (last && (last.d > a || last.d + outward(last.it) > reach)) return null;
  }
  if (!spreadSidesOk(run, out, r, labelW)) return null;
  // ... and against the levels already placed inside this one. `spread` keeps
  // block 3b's elevation ladder, which separates two levels' ENDS but not their
  // middles: level 2's outermost report climbed to the height of level 1's
  // report and slid its label under it (the one overlap the first strict-spread
  // build had). So the packer checks the real perches, and a level that cannot
  // clear them grows its radius or carries over.
  const mine = perchesOf(run, out, r, labelW);
  for (const a of mine)
    for (const b of prior) {
      if (a.side !== b.side) continue;
      if (Math.abs(a.h - b.h) >= ARC_STACK_V) continue;
      const inner = a.d < b.d ? a : b;
      const outer = a.d < b.d ? b : a;
      if (outer.d - inner.d >= inner.pad + NODE_R_MAX + TUPLE_GAP) continue;
      return null;
    }
  return out;
}

/** One placed member, in the form the cross-level check needs: which half it is
 *  on, how far from the centre line, how high above the star, and how far its
 *  outward label reaches. */
interface Perch {
  side: Side;
  d: number;
  h: number;
  pad: number;
}

/** The perches of one placed level, for the cross-level check.
 *  args: run, slots, r (the level radius), labelW
 *  returns: one Perch per drawn member */
function perchesOf(run: Tuple[], slots: Slot[], r: number, labelW: LabelWidth): Perch[] {
  const out: Perch[] = [];
  run.forEach((t, k) => {
    for (const side of ["left", "right"] as const) {
      const it = t[side];
      const dx = slots[k][side];
      if (!it || dx === null) continue;
      out.push({ side, d: Math.abs(dx), h: arcHeight(dx, r), pad: NODE_R_MAX + LABEL_GAP + labelW(it) });
    }
  });
  return out;
}

/**
 * The same all-pairs check `clearanceOk` does, one half at a time: two members of
 * the same half clear either by width or by the arc's climb.
 * args: run, slots, r (the level radius), labelW
 * returns: true when both halves are clean
 */
function spreadSidesOk(run: Tuple[], slots: Slot[], r: number, labelW: LabelWidth): boolean {
  for (const side of ["left", "right"] as const) {
    const mine = run
      .map((t, k) => ({ it: t[side], d: Math.abs(slots[k][side] ?? 0) }))
      .filter((m): m is { it: Item; d: number } => !!m.it)
      .sort((x, z) => x.d - z.d);
    for (let i = 0; i < mine.length; i++)
      for (let j = i + 1; j < mine.length; j++) {
        const gap = mine[j].d - mine[i].d;
        const need = NODE_R_MAX + LABEL_GAP + labelW(mine[i].it) + NODE_R_MAX + TUPLE_GAP;
        if (gap >= need) continue;
        if (gap >= BODY_STEP && arcHeight(mine[i].d, r) - arcHeight(mine[j].d, r) >= ARC_STACK_V) continue;
        return false;
      }
  }
  return true;
}

function layCoupled(run: Tuple[], r: number, e: number, reach: number, labelW: LabelWidth, prefs: LayoutPrefs): number[] | null {
  const geo = run.map((t) => tupleGeom(t, labelW, prefs));
  const { lo, hi } = levelBounds(run, r, e, reach, labelW, prefs);
  if (hi < lo) return null;
  if (run.length === 1) {
    const t = run[0];
    // Owner minibatch 6 B: in `spread` a lone pair still stretches its tie
    // across the centre line; in `coupled` a pair is always a tight couple, so
    // it is centred instead.
    if (t.left && t.right)
      return prefs.style === "spread" ? [lo] : [-geo[0].inner / 2];
    // A lone tuple goes to the END of its own side: a plan to the left, a
    // report or doc to the right, never on the centre line (block 3b
    // Confession 2: the end of the side is where two neighbouring levels are a
    // level step apart vertically, and an intermediate angle is not).
    return [t.left ? lo : hi];
  }
  const xs: number[] = [lo];
  for (let k = 1; k < run.length; k++) {
    const prevRight = xs[k - 1] + geo[k - 1].inner;
    const byWidth = prevRight + geo[k - 1].rightPad + geo[k].leftPad + TUPLE_GAP;
    xs.push(Math.min(byWidth, nextByHeight(prevRight, r)));
  }
  const last = xs[xs.length - 1] + geo[geo.length - 1].inner;
  if (last > hi) return null;
  const step = (hi - last) / (run.length - 1);
  for (const share of [1, 0.5, 0.25]) {
    const spread = xs.map((x, k) => x + k * step * share);
    if (clearanceOk(spread, geo, r)) return spread;
  }
  return clearanceOk(xs, geo, r) ? xs : null;
}

/**
 * One level's placement, in whichever style is in force.
 * args: run, r, e, reach, labelW, prefs, prior (the members of the levels already
 *       placed inside this one, which `spread` also has to clear)
 * returns: one Slot per tuple, or null when the run does not fit this arc
 */
function layRun(run: Tuple[], r: number, e: number, reach: number, labelW: LabelWidth, prefs: LayoutPrefs, prior: Perch[]): Slot[] | null {
  if (prefs.style === "spread") return laySpread(run, r, e, reach, labelW, prior);
  const xs = layCoupled(run, r, e, reach, labelW, prefs);
  if (!xs) return null;
  return run.map((t, k) => {
    const inner = tupleGeom(t, labelW, prefs).inner;
    return { left: t.left ? xs[k] : null, right: t.right ? xs[k] + (t.left ? inner : 0) : null };
  });
}

/** Owner minibatch 6 A: `arc_max_nodes` counts NODES on the arc, so a pair
 *  counts as two. */
function nodeCount(run: Tuple[]): number {
  return run.reduce((n, t) => n + (t.left ? 1 : 0) + (t.right ? 1 : 0), 0);
}

/**
 * Owner minibatch 6 A "Level radii can grow to make room": try the run on the
 * level's base radius, then further out, and stop growing once the arc has all
 * the horizontal room the system allows, since a bigger radius buys nothing
 * past that (and flattens the arc, which the height rule lives off).
 *
 * args: run, e (the level's end elevation), minR (base radius, never inside the
 *       level below), reach, labelW, prefs
 * returns: {r, slots, maxElev} for the radius that held the run, or null.
 *          `maxElev` is the highest planet of the run, which is where the NEXT
 *          level's band starts.
 */
function placeRun(run: Tuple[], e: number, minR: number, reach: number, labelW: LabelWidth, prefs: LayoutPrefs, prior: Perch[]): { r: number; slots: Slot[]; maxElev: number } | null {
  for (let r = minR; ; r += RADIUS_GROW_STEP) {
    const slots = layRun(run, r, e, reach, labelW, prefs, prior);
    if (slots) {
      const planets = slots.flatMap((sl) => [sl.left, sl.right].filter((x): x is number => x !== null));
      return { r, slots, maxElev: Math.max(...planets.map((x) => arcHeight(x, r))) };
    }
    if (arcHalfAt(r, e) >= reach) return null;
  }
}

/** One batch of tuples that wants consecutive levels: a date group, one
 *  generation of chain ancestors, or the stranded docs. */
interface Batch {
  tuples: Tuple[];
  markCarry: boolean; // continuation levels of a DATE group read "same day, continued"
  stranded: boolean;
}

/**
 * Owner minibatch 6 A "Put same-date reports on the same arc unless
 * ARC_MAX_NODES is met, or unless it would literally overlap with
 * adjacent-branch nodes". The three-tuple carry-over of block 3b is gone: a
 * level now takes every tuple of its date until one of those two walls.
 *
 * ```text
 * for each tuple of the batch
 *   |
 *   +-- run + tuple within arc_max_nodes AND placeable on this level -> keep it
 *   +-- otherwise -> close the level, carry the tuple over to the next one
 * ```
 * args: batches (in level order), labelW, reach, prefs
 * returns: the levels, innermost first, each with the radius it settled at
 */
function packLevels(batches: Batch[], labelW: LabelWidth, reach: number, prefs: LayoutPrefs): Level[] {
  const out: Level[] = [];
  // The next level's arc ends one clearance above the highest planet already
  // placed, so no two levels ever put content at the same height.
  // `spread` uses block 3b's fixed ladder; `coupled` lets its content climb the
  // whole arc, so it needs the band that keeps two levels out of each other's
  // heights (see arcHalfAt).
  const ladder = (i: number) => ARC_ELEV_0 + i * ARC_ELEV_STEP;
  let nextE = ARC_ELEV_0;
  // Every member already placed, for the cross-level check of `spread`.
  const prior: Perch[] = [];
  for (const b of batches) {
    const start = out.length;
    let run: Tuple[] = [];
    let placed: { r: number; slots: Slot[]; maxElev: number } | null = null;
    const minR = () => Math.max(
      ROOT_R + out.length * LEVEL_STEP,
      nextE + LEVEL_STEP,
      out.length ? out[out.length - 1].r + LEVEL_STEP : 0,
    );
    const close = () => {
      out.push({
        tuples: run, r: placed!.r, e: nextE, slots: placed!.slots,
        carry: b.markCarry && out.length > start, stranded: b.stranded,
      });
      prior.push(...perchesOf(run, placed!.slots, placed!.r, labelW));
      nextE = prefs.style === "spread"
        ? ladder(out.length)
        : Math.max(nextE + ARC_STACK_V, placed!.maxElev + ARC_STACK_V);
      run = [];
      placed = null;
    };
    for (const t of b.tuples) {
      const grown = [...run, t];
      const fit = nodeCount(grown) <= prefs.arcMaxNodes
        ? placeRun(grown, nextE, minR(), reach, labelW, prefs, prior)
        : null;
      if (fit) {
        run = grown;
        placed = fit;
        continue;
      }
      if (run.length) close();
      run = [t];
      // A single tuple always fits somewhere: the fallback is the base radius
      // with the tuple on the centre line.
      placed = placeRun(run, nextE, minR(), reach, labelW, prefs, prior)
        ?? { r: minR(), slots: [{ left: t.left ? 0 : null, right: t.right ? 0 : null }], maxElev: minR() };
    }
    if (run.length) close();
  }
  return out;
}

/**
 * The left-to-right order of the tuples that share one level.
 *
 * Owner minibatch 6 A, the bug in the owner's sector_ship shot: the lone plan
 * `2026-09-12_starmap-demo-plan.md` sat on the RIGHT among reports, because
 * block 3b ordered a level by filename alone and this branch's reports carry no
 * `review_` prefix, so the plan sorted after them. Ordering by KIND first makes
 * the rule hold on every level whatever the filenames are: lone plans, then
 * pairs (whose plan is its left member), then reports and docs.
 *
 * ```text
 * spread   filename only: the two HALVES carry the kind, so a lone plan can
 *          never land among the reports whatever the filenames are, and each
 *          half reads outward from the centre in filename order
 * coupled  lone plan (0) | pair (1) | lone report or doc (2) | then filename,
 *          so couples stay side by side as "plan1 report1 plan2 report2"
 * ```
 * args: prefs (the layout style)
 * returns: an Array.sort comparator over tuples
 */
function order(prefs: LayoutPrefs): (a: Tuple, z: Tuple) => number {
  const rank = (t: Tuple) => (t.tie ? 1 : t.left ? 0 : 2);
  return (a, z) =>
    (prefs.style === "coupled" ? rank(a) - rank(z) : 0) || a.order.localeCompare(z.order);
}

const lone = (n: Item): Tuple => {
  const s = sideOf(n.kind);
  return { left: s === "left" ? n : null, right: s === "right" ? n : null, tie: false, order: fileOf(n.path) };
};

/**
 * Turn a branch's nodes into arched levels, newest date on the lowest level.
 *
 * ```text
 * anchors (nothing supersedes them)
 *   |
 *   +-- report + its plan -> one TUPLE (link first, filename stem second)
 *   +-- anything else     -> one lone tuple, label on the side of its kind
 *   |
 *   v
 * tuples grouped BY DATE (the report's date, else the plan's), newest first
 *   |
 *   +-- inside a group: ordered by filename, then packed into levels and SPREAD
 *   |   across each level's arc; a group that overflows carries over, and the
 *   |   carried level is marked so its arc guide can be drawn dimmer
 *   +-- then the group's `supersedes` ancestors take their own levels beyond
 *       it, on the side of their head, exactly as plan step 3 A had them
 * ```
 * args: b (one branch of /api/tree)
 * returns: {batches (in level order), pairOf (node id -> pair id, both members)}
 */
function buildLevels(b: Branch, prefs: LayoutPrefs): { batches: Batch[]; pairOf: Map<string, string> } {
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  const anchors = b.nodes.filter((n) => !n.superseded_by);
  const planByKey = new Map<string, DocNode>();
  for (const p of anchors) {
    if (docClass(p.kind) !== "plan") continue;
    const k = pairKey(p.path);
    if (!planByKey.has(k)) planByKey.set(k, p);
  }

  const claimed = new Set<string>();
  const pairOf = new Map<string, string>();
  const dated: { date: string; t: Tuple }[] = [];

  for (const r of anchors) {
    if (docClass(r.kind) !== "report") continue;
    const linked = r.plan ? byId.get(r.plan) : undefined;
    const partner = linked && docClass(linked.kind) === "plan" && !claimed.has(linked.id)
      ? linked
      : planByKey.get(pairKey(r.path));
    if (!partner || claimed.has(partner.id)) continue;
    claimed.add(partner.id);
    claimed.add(r.id);
    const pid = `pair:${pairKey(r.path)}`;
    pairOf.set(partner.id, pid);
    pairOf.set(r.id, pid);
    // Owner request 3b A: "Its date is the report's date if it has one, else
    // the plan's" -- the report closes the work, so it dates the tuple.
    dated.push({
      date: r.date || partner.date,
      t: { left: partner, right: r, tie: true, order: fileOf(partner.path) },
    });
  }
  for (const n of anchors) {
    if (!claimed.has(n.id)) dated.push({ date: n.date, t: lone(n) });
  }

  const batches: Batch[] = [];
  const dates = [...new Set(dated.map((x) => x.date))].sort().reverse();
  for (const date of dates) {
    const group = dated.filter((x) => x.date === date).map((x) => x.t).sort(order(prefs));
    batches.push({ tuples: group, markCarry: true, stranded: false });
    // The chain walk: one generation of ancestors per pass, each on the side of
    // the head it hangs off, so a chain never lands on a level its head owns.
    let heads = group;
    for (;;) {
      const ancestors: Tuple[] = [];
      for (const t of heads) {
        for (const s of ["left", "right"] as Side[]) {
          const head = t[s] ? byId.get(t[s]!.id) : undefined;
          const a = head?.supersedes ? byId.get(head.supersedes) : undefined;
          if (a) ancestors.push({ left: s === "left" ? a : null, right: s === "right" ? a : null, tie: false, order: fileOf(a.path) });
        }
      }
      if (!ancestors.length) break;
      batches.push({ tuples: ancestors.sort(order(prefs)), markCarry: false, stranded: false });
      heads = ancestors;
    }
  }
  return { batches, pairOf };
}

/** Plan step 3 D: the stranded "+N older" docs, newest first, on the levels
 *  beyond the outermost one. */
function expansionBatch(items: ClusterItem[]): Batch {
  const tuples = [...items]
    .sort((a, z) => (a.date === z.date ? a.id.localeCompare(z.id) : a.date < z.date ? 1 : -1))
    .map((it) => lone({ id: it.id, path: it.id, kind: it.kind }));
  return { tuples, markCarry: false, stranded: true };
}

/** Every level of a branch, the expansion levels included. */
function allLevels(b: Branch, labelW: LabelWidth, reach: number, prefs: LayoutPrefs): { levels: Level[]; pairOf: Map<string, string> } {
  const { batches, pairOf } = buildLevels(b, prefs);
  batches.push(expansionBatch(b.cluster.items));
  return { levels: packLevels(batches, labelW, reach, prefs), pairOf };
}

/**
 * How far one branch reaches: its level count and the radius of its outermost
 * level. Owner minibatch 6 A made the second number a real one, since a level
 * may grow past `ROOT_R + i * LEVEL_STEP` to hold its whole date group, and the
 * world height is measured from the outermost radius rather than from the count.
 * args: b (branch), labelW, reach (the system half width), prefs
 * returns: {levels, topR} in world units
 */
export function branchExtent(b: Branch, labelW: LabelWidth, reach: number, prefs: LayoutPrefs): { levels: number; topR: number } {
  const { levels } = allLevels(b, labelW, reach, prefs);
  return { levels: levels.length, topR: levels.length ? levels[levels.length - 1].r : ROOT_R };
}

/**
 * Place one branch: the arched levels, the chain levels, the stranded docs and
 * the cluster marker.
 *
 * ```text
 * level i          radius packLevels settled on (>= ROOT_R + i * LEVEL_STEP)
 *   tuples         at the x each one was packed to along that arc
 *   tuple k        y = arcY(rootY, r, dx): a plain circle about the star
 * ```
 * No jitter and no physics: the zero-overlap gates are arithmetic on the level
 * step and the elevation bands (vertical) and on the packing rule (horizontal).
 *
 * args: b (branch), cx (column centre), rootY (the star's y), reach (how far the
 *       system may draw either side of its star), labelW (measured label
 *       widths), prefs (the layout style and the arc node cap)
 * returns: BranchLayout -- positions per node id, the label side, the pair ids,
 *          the dotted ties, the arc guides, the stranded-doc positions and the
 *          cluster marker
 */
export function layoutBranch(b: Branch, cx: number, rootY: number, reach: number, labelW: LabelWidth, prefs: LayoutPrefs): BranchLayout {
  const { levels, pairOf } = allLevels(b, labelW, reach, prefs);

  const nodePos = new Map<string, Placed>();
  const side = new Map<string, Side>();
  const level = new Map<string, number>();
  const clusterItemPos = new Map<string, Placed>();
  const clusterItemSide = new Map<string, Side>();
  const arcs: LevelArc[] = [];
  const ties: [string, string][] = [];
  const tuples: string[][] = [];

  levels.forEach((lv, i) => {
    const r = lv.r;
    let lowest = Infinity;
    let highest = -Infinity;
    lv.tuples.forEach((t, k) => {
      const slot = lv.slots[k];
      const place = (it: Item | null, dx: number | null, sd: Side) => {
        if (!it || dx === null) return;
        (lv.stranded ? clusterItemPos : nodePos).set(it.id, { x: cx + dx, y: arcY(rootY, r, dx) });
        (lv.stranded ? clusterItemSide : side).set(it.id, sd);
        level.set(it.id, i);
        lowest = Math.min(lowest, dx);
        highest = Math.max(highest, dx);
      };
      place(t.left, slot.left, "left");
      place(t.right, slot.right, "right");
      if (t.tie) ties.push([t.left!.id, t.right!.id]);
      if (!lv.stranded) tuples.push([t.left?.id, t.right?.id].filter((x): x is string => !!x));
    });
    // Owner request 3b: the guide runs from the first tuple to the last of the
    // level, 20 units past each, and stays on the arc it is drawing.
    const edge = Math.min(arcHalfAt(r, lv.e) + 20, r - 2);
    arcs.push({
      r, carry: lv.carry,
      x0: Math.max(-edge, lowest - 20), x1: Math.min(edge, highest + 20),
    });
  });

  // Safety net: a mid-chain oddity the level walk never reached drops near the root.
  b.nodes.forEach((n, i) => {
    if (nodePos.has(n.id)) return;
    nodePos.set(n.id, { x: cx + jitter(n.id, 40), y: rootY - 100 - (i % 3) * 40 });
    side.set(n.id, sideOf(n.kind));
    level.set(n.id, -1);
  });

  // Plan step 3 F: the cluster stays on the centre line above the outermost
  // level, and it is computed from the EXPANDED depth so the toggle never
  // moves it.
  const topR = levels.length ? levels[levels.length - 1].r : ROOT_R;
  const clusterPos = { x: cx, y: rootY - topR - CLUSTER_GAP };
  return {
    cx, rootY, nodePos, side, level, pairOf, ties, clusterItemPos, clusterItemSide,
    clusterPos, levels: levels.length, arcs, tuples,
    tuplesPerLevel: levels.map((lv) => lv.tuples.length),
    levelRadii: levels.map((lv) => Math.round(lv.r * 10) / 10),
    levelElevs: levels.map((lv) => Math.round(lv.e * 10) / 10),
    topR,
  };
}

export interface CoreLayout {
  packAnchors: Map<string, Placed>; // pack name -> anchor
  variantPos: Map<string, Placed>; // node id -> position
  packOf: Map<string, string>; // node id -> its pack name, so a drag knows its anchor
  // Owner minibatch 6 C: the row may need two or three rails, so the rail is one
  // span per row rather than one line under the whole thing.
  rails: { from: number; to: number; y: number }[];
}

// The core row keeps this span whatever the world width is, and is centred in
// it. Plan step 3 grew the world to fit the branch ladders, and stretching the
// row with it pushed one pack's last variant label onto the next pack's first
// one: the row is not part of step 3, so its geometry is held still instead.
const CORE_SPAN = 1220;
// One pack's own files strung to the right of its anchor, and the gap from the
// anchor to the first of them. The lead is one full step, so a pack's NAME under
// its anchor cannot reach the first file's label (WORKFLOW against orchestrator
// is the widest such pair on this host).
const CORE_FILE_STEP = 88;
const CORE_FILE_LEAD = 88;
// Every core label hangs this far under its node.
export const CORE_LABEL_DY = 22;
// Owner minibatch 6 C: a further rail sits BELOW the row above it and its
// labels, not 40 units under the rail itself: a label hangs 22 units down and is
// 16 tall, so the next rail starts at 38 and a node's 9-unit radius plus a
// margin puts it at 60. At 40 the second row's bodies were drawn on top of the
// first row's pack names.
const CORE_ROW_STEP = CORE_LABEL_DY + LABEL_H + 22;

/**
 * The two halves of one pack on the rail (owner minibatch 6 D): the file its
 * ANCHOR node opens, and the files strung to the right of the anchor.
 *
 * ```text
 * files  every non-index file, each drawn as its own node with its own label
 * index  the pack's INDEX.md if it has one, else undefined; the anchor opens it,
 *        and a pack whose ONLY file is the index is reachable through the anchor
 *        alone (owner_fit here)
 * ```
 * A file is never both: the anchor is its own node, so drawing the first file as
 * the anchor as well would put two nodes on one repo path.
 * args: p (the pack)
 * returns: {index, files}
 */
export function packParts(p: ContextPack): { index: ContextPack["variants"][number] | undefined; files: ContextPack["variants"] } {
  const files = p.variants.filter((v) => !v.is_index);
  return { index: p.variants.find((v) => v.is_index), files };
}

/**
 * The width one pack needs on the rail: the lead to its first file, one step per
 * file after that, and one step of room for the last file's own label.
 * args: p (the pack)
 * returns: the width in world units
 */
function packWidth(p: ContextPack): number {
  const shown = packParts(p).files.length;
  return CORE_FILE_LEAD + Math.max(shown - 1, 0) * CORE_FILE_STEP + CORE_FILE_STEP;
}

/**
 * Core row: the selected packs spaced across a fixed span, each pack's files
 * strung to the right of its anchor, overflowing onto further rows.
 *
 * Owner minibatch 6 C: the row used to divide the span evenly by pack count,
 * which put `style` (six files) on top of the pack after it and left the
 * one-file packs with empty room. Now the span is dealt out by what each pack
 * actually needs, and whatever does not fit starts a new row 40 units below.
 *
 * ```text
 * packs, in order -> measure packWidth each
 *   |
 *   +-- fits in the row's remaining span? -> same row
 *   +-- otherwise                         -> next row, 40 units below, own rail
 *   |
 *   v
 * within a row: the leftover span is shared evenly between the packs, so a row
 * with one wide pack does not stretch its files apart
 * ```
 * args: core (the packs to draw, already filtered by `core_slots`), width (the
 *       world width), y (the first row's y)
 * returns: CoreLayout -- anchors, file positions, the pack of each file, rails
 */
export function layoutCore(core: ContextPack[], width: number, y: number): CoreLayout {
  const packAnchors = new Map<string, Placed>();
  const variantPos = new Map<string, Placed>();
  const packOf = new Map<string, string>();
  const pad = 140;
  const span = Math.min(width - pad * 2, CORE_SPAN);
  const left = (width - span) / 2;

  const rows: ContextPack[][] = [];
  let used = 0;
  for (const p of core) {
    const w = packWidth(p);
    if (!rows.length || (used + w > span && rows[rows.length - 1].length)) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(p);
    used += w;
  }

  const rails = rows.map((row, ri) => {
    const rowY = y + ri * CORE_ROW_STEP;
    const need = row.reduce((a, p) => a + packWidth(p), 0);
    const slack = Math.max(0, span - need) / row.length;
    let x = left + 40;
    for (const p of row) {
      packAnchors.set(p.pack, { x, y: rowY });
      packParts(p).files.forEach((v, j) => {
        variantPos.set(v.id, { x: x + CORE_FILE_LEAD + j * CORE_FILE_STEP, y: rowY + jitter(v.id, 5) });
        packOf.set(v.id, p.pack);
      });
      x += packWidth(p) + slack;
    }
    return { from: left, to: left + span + 60, y: rowY };
  });
  return { packAnchors, variantPos, packOf, rails };
}
