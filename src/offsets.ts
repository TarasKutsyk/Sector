// Plan step 4 "Drag and keep the layout": the saved half of dragging.
//
// One map, `config.layout` in the PERSONAL overlay (`.sector-map.local.json`),
// keyed by the repo-relative path of the thing moved and holding a world-unit
// VECTOR FROM THAT THING'S PARENT ANCHOR:
//
//   star        from its column anchor (cx, rootY)
//   planet      from its own star
//   moon        from its planet (the focus slot)
//   "+older"    from its star
//   core node   from its pack anchor
//
//   layoutBranch / layoutCore (pure)        saved vector
//            |                                   |
//            +--> no entry: the computed spot     +--> pos = anchor + vector
//
// Owner request 3b B: a saved entry is that vector, full stop, and applying it
// means "put the node exactly there" whatever the pure layout would now compute.
// Block 4 stored `computed + offset` instead, which agreed with the anchor rule
// only while the layout kept the node on the same level: adding a document or
// changing the row order moved every dragged planet with its row (Block 4
// Confession 1). Now only UNDRAGGED nodes flow with the layout.
//
// The map is repo-personal state, never repo truth: the doc's "Do not persist
// layout positions as the source of truth" rule still holds, which is why this
// lives next to `branch_slots` in the ignored overlay and nowhere else.

import { post } from "./data";
import type { Placed } from "./layout";

export type Offset = [number, number];

let offsets: Record<string, Offset> = {};

/** The cluster marker has no file of its own, so it is keyed off its branch
 *  folder: `.sector/workstreams/atlas_app/+older`.
 *  args: cardPath (the branch card's repo-relative path)
 *  returns: the layout key for that branch's "+N older" marker */
export function clusterKey(cardPath: string): string {
  return `${cardPath.split("/").slice(0, -1).join("/")}/+older`;
}

/** Adopt the map the server sent on `/api/tree` (called once, before the scene
 *  is built). */
export function loadOffsets(map: Record<string, Offset> | undefined) {
  offsets = { ...(map ?? {}) };
}

/** The whole map, for the driver and for the POST body. */
export function allOffsets(): Record<string, Offset> {
  return offsets;
}

export function hasOffsets(): boolean {
  return Object.keys(offsets).length > 0;
}

/**
 * Where to draw one thing: its saved vector from its parent anchor if it has
 * one, otherwise the position the pure layout computed for it.
 *
 * A path with no entry gets its computed spot untouched, which is what makes a
 * new file appear on the ladder without rearranging anything already saved.
 * args: key (layout key), anchor (the parent anchor the vector starts from),
 *       pure (the computed position, used when nothing was saved)
 * returns: {x, y} to draw at
 */
export function placedAt(key: string, anchor: Placed, pure: Placed): Placed {
  const o = offsets[key];
  return o ? { x: anchor.x + o[0], y: anchor.y + o[1] } : pure;
}

/** The saved offset of one thing, or null when it sits where the layout put it.
 *  args: key (layout key)
 *  returns: [dx, dy] in world units, or null */
export function offsetOf(key: string): Offset | null {
  return offsets[key] ?? null;
}

/** Remember one dragged placement, as the vector from its parent anchor. The
 *  layout code never writes here: only a drag end and the reset button do. */
export function setOffset(key: string, dx: number, dy: number) {
  offsets[key] = [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
}

export function clearOffsets() {
  offsets = {};
}

/** Push the whole map to the overlay (one write per drag end, as the plan asks:
 *  "on drag end, POST /api/config with the whole map"). */
export function saveOffsets(): Promise<unknown> {
  return post("/api/config", { layout: offsets });
}
