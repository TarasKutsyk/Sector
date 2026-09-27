// Sprite factory — plan §Node styling. Glow is done with generated
// radial-gradient canvas textures + additive blending (agent-filled decision
// #1: no pixi-filters dependency, version-proof). Every planet is a small
// container:
//
//   NodeView (Container)
//     ├── glow    (additive sprite, color = kind hue / gold when live, bounded
//     │            against the camera by applyCameraLook)
//     ├── body    (banded gas-giant texture, per-file variation)
//     ├── rim     (Graphics: the warm gold rim of a live doc, its width and
//     │            alpha bounded against the camera too)
//     ├── ring    (Graphics: selection ring / played laurel / pulse)
//     └── label   (cropped faint Text, full on hover)

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { DocNode } from "./data";
import { DocClass, LABEL_GAP, docClass, hueJitter } from "./layout";

const texCache = new Map<string, Texture>();

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = Texture.from(c);
  texCache.set(key, t);
  return t;
}

/** Soft radial glow disc — the workhorse for stars, auras and nebula blobs. */
export function glowTexture(color: string, size = 256): Texture {
  return canvasTexture(`glow:${color}:${size}`, size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.35, colorWithAlpha(color, 0.35));
    g.addColorStop(1, colorWithAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Plan step 5 C: the deep-space vertical gradient the whole map sits on, as a
 *  two-stop texture a screen-sized sprite stretches.
 *  args: top, bottom (css colours)
 *  returns: a 4 x 256 Texture, cached per colour pair */
export function verticalGradientTexture(top: string, bottom: string): Texture {
  const key = `vgrad:${top}:${bottom}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = Texture.from(c);
  texCache.set(key, t);
  return t;
}

/** Stable hash of a repo path: the one source of every per-file variation
 *  (moon tint, gas bands), so a file always looks like itself. */
function pathHash(path: string): number {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 33 + path.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Plan step 5 A "3 to 5 soft horizontal bands": the band pattern of one gas
 *  giant. `phase` slides the waviness, `tilt` leans the band axis. */
export interface Bands {
  count: number;
  phase: number;
  tilt: number;
}

const BAND_TILT_MAX = (12 * Math.PI) / 180; // plan step 5 A: "within plus or minus 12 degrees"

/**
 * Plan step 5 A "One deterministic variation per file from the path hash".
 *
 * ```text
 * repo path -> pathHash -> count 3..5
 *                       -> phase  (where the wavy edges sit)
 *                       -> tilt   (+/- 12 degrees of band axis)
 * ```
 * args: id (repo path)
 * returns: Bands -- {count, phase in radians, tilt in radians}
 */
export function bandsFor(id: string): Bands {
  const h = pathHash(id);
  return {
    count: 3 + (h % 3),
    phase: ((h >> 3) % 64) / 64 * Math.PI * 2,
    tilt: (((h >> 9) % 64) / 64 - 0.5) * 2 * BAND_TILT_MAX,
  };
}

/**
 * Plan step 5 A "gas bands": low-contrast wavy stripes across the disc, in the
 * planet's own hue, drawn BEFORE the shading so the lighting lands on them.
 *
 * Band edges are shared: boundary j is one curve, the bottom of band j-1 and the
 * top of band j, so bands can never leave a seam.
 *
 * ```text
 * boundary j:  y = -r + j*h  +  0.13r (x/r)^2      <- bows down near the limbs,
 *                            +  0.05r sin(phase       so the stripe follows the
 *                                 + 1.7j + 2.4x/r)    sphere instead of the frame
 * ```
 * args: ctx, c (disc centre in canvas px), r (disc radius), hue, sat, b (bands)
 * returns: nothing; the stripes are filled into the already-clipped disc
 */
function drawBands(ctx: CanvasRenderingContext2D, c: number, r: number, hue: number, sat: number, b: Bands) {
  const h = (2 * r) / b.count;
  const edgeY = (x: number, j: number) =>
    -r + j * h + 0.13 * r * (x / r) ** 2 + 0.05 * r * Math.sin(b.phase + j * 1.7 + (2.4 * x) / r);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(b.tilt);
  const x0 = -1.4 * r;
  const x1 = 1.4 * r;
  const steps = 16;
  // one band past each end, so the bow and the tilt cannot expose the base fill
  for (let j = -1; j <= b.count; j++) {
    // plan step 5 A: "band contrast around 12 percent of lightness"
    ctx.fillStyle = `hsl(${hue} ${sat}% ${((j % 2) + 2) % 2 ? 58 : 46}%)`;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      i === 0 ? ctx.moveTo(x, edgeY(x, j)) : ctx.lineTo(x, edgeY(x, j));
    }
    for (let i = steps; i >= 0; i--) {
      const x = x0 + ((x1 - x0) * i) / steps;
      ctx.lineTo(x, edgeY(x, j + 1));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Plan step 5 A "Planets are small gas giants": a banded, shaded ball.
 *
 * ```text
 * clip to the disc
 *   -> flat base fill in the file's own hue
 *   -> gas bands (skipped when `bands` is null: the moons of block 2 stay
 *      plain, and so does the seed)
 *   -> highlight from the upper left
 *   -> limb darkening, deepest at the lower right
 * ```
 * args: hue, sat (the class hue), size (texture px), bands (per-file variation)
 * returns: a Texture, cached per hue, saturation, size and band variation
 */
export function planetTexture(hue: number, sat: number, size = 96, bands: Bands | null = null): Texture {
  const variant = bands ? `${bands.count}:${bands.phase.toFixed(2)}:${bands.tilt.toFixed(3)}` : "plain";
  const key = `planet:${Math.round(hue)}:${sat}:${size}:${variant}`;
  return canvasTexture(key, size, (ctx, s) => {
    const c = s / 2;
    const r = c - 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = `hsl(${hue} ${sat}% 52%)`;
    ctx.fillRect(0, 0, s, s);
    if (bands) drawBands(ctx, c, r, hue, sat, bands);
    const lit = ctx.createRadialGradient(s * 0.34, s * 0.32, r * 0.06, s * 0.34, s * 0.32, r * 1.5);
    lit.addColorStop(0, "rgba(255,255,255,0.46)");
    lit.addColorStop(0.4, "rgba(255,255,255,0.11)");
    lit.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, s, s);
    const dark = hslToHex(hue, sat + 8, 13);
    const limb = ctx.createRadialGradient(s * 0.58, s * 0.6, r * 0.25, s * 0.58, s * 0.6, r * 1.32);
    limb.addColorStop(0, colorWithAlpha(dark, 0));
    limb.addColorStop(0.55, colorWithAlpha(dark, 0.2));
    limb.addColorStop(1, colorWithAlpha(dark, 0.94));
    ctx.fillStyle = limb;
    ctx.fillRect(0, 0, s, s);
    ctx.restore();
  });
}

/** Plan step 5 B "Branch stars are suns": near white at the centre, pale gold at
 *  the edge. One texture for every star, so this costs nothing per branch. */
export function sunTexture(size = 128): Texture {
  return canvasTexture(`sun:${size}`, size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2 - 2);
    g.addColorStop(0, "#fffdf3");
    g.addColorStop(0.5, "#fff0cb");
    g.addColorStop(1, "#f2c878");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Owner decoration: one soft nebula sheet, layered value noise shaped by a
 *  radial falloff, so it reads as gas rather than a flat blob. Deterministic
 *  from `seed`, generated once and cached like every other texture.
 *
 *  ```text
 *  hash(x, y, seed) -> smooth value noise -> 5 octaves summed (fBm)
 *        |
 *        v
 *  alpha = (noise - floor)^1.6 * radialFalloff^2   (dense wisps in the middle,
 *                                                   nothing at the edges)
 *  ```
 *  Return: a `size` x `size` RGBA texture in `color`, alpha carries the shape. */
export function nebulaTexture(color: string, seed: number, size = 384): Texture {
  return canvasTexture(`nebula:${color}:${seed}:${size}`, size, (ctx, s) => {
    const n = parseInt(color.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const hash = (x: number, y: number) => {
      let h = (x * 374761393 + y * 668265263 + seed * 1013904223) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const noise = (x: number, y: number) => {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = smooth(x - x0), fy = smooth(y - y0);
      const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * fx;
      const bot = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * fx;
      return top + (bot - top) * fy;
    };
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let v = 0, amp = 0.5, f = 3 / s;
        for (let o = 0; o < 5; o++) { v += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; }
        const dx = x / s - 0.5, dy = y / s - 0.5;
        const fall = Math.max(0, 1 - Math.hypot(dx, dy) * 2.1);
        const a = Math.pow(Math.max(0, v - 0.3) * 2.2, 1.35) * fall * fall;
        const i = (y * s + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function colorWithAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Plan step 3 C "Type is readable without colour": three classes, three hues
// far apart, and a two-letter tag in front of the label so a colour-blind
// reader tells them apart without the hue at all.
const CLASS_LOOK: Record<DocClass, { hue: number; sat: number; tag: string }> = {
  plan: { hue: 210, sat: 55, tag: "PL" },
  report: { hue: 28, sat: 60, tag: "RP" },
  doc: { hue: 260, sat: 22, tag: "DOC" },
};

/** The planet colour for one doc: its class hue, jittered by at most plus or
 *  minus 6 so a plan never drifts toward the report amber.
 *  args: kind (front-matter kind), id (repo path, for the stable jitter)
 *  returns: {hue, sat} for planetTexture */
export function kindHue(kind: string, id: string): { hue: number; sat: number } {
  const look = CLASS_LOOK[docClass(kind)];
  return { hue: look.hue + hueJitter(id), sat: look.sat };
}

/** Plan step 3 C: the label's two-letter type tag, PL / RP / DOC.
 *  args: kind (front-matter kind)
 *  returns: the tag string */
export function typeTag(kind: string): string {
  return CLASS_LOOK[docClass(kind)].tag;
}

/** The one word the reader chips and the palette rows use for a kind, so the
 *  map, the panel and the finder all say plan, report or doc (plan step 3 C). */
export function kindWord(kind: string): string {
  return docClass(kind);
}

// Artifacts are moons, not sparks (owner steer, 2026-09-12): a small shaded
// disc picked deterministically from the file's own path so one proof always
// wears the same moon. Owner steer 2026-09-23: the four grey-browns read as one
// brown mess, so the set spans the wheel instead, kept at low saturation so a
// moon still never competes with the plan blue or the report amber.
const MOON_TINTS = [
  { hue: 205, sat: 24 }, // steel
  { hue: 165, sat: 22 }, // sage
  { hue: 95, sat: 20 },  // moss
  { hue: 42, sat: 30 },  // sand
  { hue: 12, sat: 30 },  // dusty rose
  { hue: 325, sat: 20 }, // mauve
  { hue: 270, sat: 20 }, // lavender
  { hue: 30, sat: 4 },   // stone
];

/**
 * The moon one artifact always wears.
 * args: path (repo-relative)
 * returns: {hue, sat} for moonTexture, plus `css` for the reader's row dot
 */
export function moonTint(path: string): { hue: number; sat: number; css: string } {
  const t = MOON_TINTS[pathHash(path) % MOON_TINTS.length];
  return { ...t, css: `hsl(${t.hue} ${t.sat}% 60%)` };
}

/** One moon sprite texture: the planet ball, at moon colour, cached per tint.
 *  Plan step 5 A: no bands, and 64 texture px against a 24 px focused moon. */
export function moonTexture(path: string): Texture {
  const { hue, sat } = moonTint(path);
  return planetTexture(hue, sat, MOON_TEX_PX);
}

// Plan step 5 A "Texture resolution": a focused planet is drawn at
// FOCUS_PLANET_PX (128) screen radius and the active branch at ACTIVE_SCALE
// (1.07), so its body is 2 * 128 * 1.07 = 274 screen px across whatever its
// world radius is. 288 texture px covers that at one texture pixel per screen
// pixel, with 5 percent to spare.
export const PLANET_TEX_PX = 288;
export const MOON_TEX_PX = 64;

// Plan step 5 A "Glow is bounded on screen". Every glow sprite registers here
// with the scale its size gave it, and the ticker multiplies that by
// min(1, GLOW_CAM_CAP / cameraScale): the halo stops growing with the camera, so
// a focused planet keeps a rim of light instead of a haze the size of the
// viewport. The live doc's gold rim rides the same factor, since a 1.5-unit
// stroke at focus zoom is a 16 px band that reads as the border of a coin.
// Both are registered once at build time; planet views live for the page.
const boundedGlows: { sprite: Sprite; base: number }[] = [];
const boundedRims: { g: Graphics; radius: number }[] = [];
const cameraLabels: Text[] = [];
export const GLOW_CAM_CAP = 1.6;
let labelResAt = 0; // the camera scale the label rasters were last rebuilt at
let labelRes = 0; // and the resolution they were rebuilt at, for labels born later
let rimW = 0; // the live-doc rim as last drawn, in world units, and its alpha
let rimAlpha = 0;

/** Register one glow sprite for camera bounding. Call AFTER its setSize, since
 *  the size is what the base scale is read from. */
export function boundGlow(sprite: Sprite) {
  boundedGlows.push({ sprite, base: sprite.scale.x });
}

/**
 * Hold the camera-dependent parts of the look at their bounded size.
 *
 * ```text
 * f = min(1, 1.6 / cameraScale)          one factor, three consumers
 *   |
 *   +-- glow sprites   scale = base * f        (halo stops growing with zoom)
 *   +-- live-doc rims  width = 1.5 * f         (about 1.5 world units at fit
 *   |                  alpha = 0.55 + 0.30 * f  camera, 2 to 3 screen px and
 *   |                                           dimmer at focus)
 *   +-- every Text     resolution = min(rendererResolution * cameraScale, 4),
 *       rebuilt only when the scale moved more than 10 percent since the last
 *       rebuild, because setting it re-rasterizes the glyph atlas
 * ```
 * args: cameraScale (world.scale.x), textureRes (the renderer's own resolution,
 *   i.e. the device pixel ratio the canvas is drawn at)
 * returns: the factor applied, so the harness can quote it
 */
export function applyCameraLook(cameraScale: number, textureRes: number): number {
  const f = Math.min(1, GLOW_CAM_CAP / cameraScale);
  for (const g of boundedGlows) g.sprite.scale.set(g.base * f);
  rimW = LIVE_RIM_W * f;
  rimAlpha = LIVE_RIM_ALPHA_FOCUS + LIVE_RIM_ALPHA_SPAN * f;
  for (const r of boundedRims)
    r.g.clear()
      .circle(0, 0, r.radius - rimW / 2)
      .stroke({ width: rimW, color: GOLD, alpha: rimAlpha });
  if (Math.abs(cameraScale - labelResAt) > 0.1 * labelResAt) {
    // Never BELOW the renderer's own resolution: at fit camera (scale 0.775)
    // a plain multiply would rasterize the glyphs coarser than they were before
    // this block, and the fit camera is the view he looks at most.
    labelRes = Math.min(textureRes * Math.max(cameraScale, 1), LABEL_RES_MAX);
    // Moon labels come and go with the active branch, so dead ones are dropped
    // here rather than re-rasterized forever.
    for (let i = cameraLabels.length - 1; i >= 0; i--) {
      const t = cameraLabels[i];
      if (t.destroyed) cameraLabels.splice(i, 1);
      else t.resolution = labelRes;
    }
    labelResAt = cameraScale;
  }
  return f;
}

/** The live-doc rim as last drawn, so the gate quotes the stroke rather than
 *  re-deriving it: {width in world units, alpha}. */
export function rimBound(): { width: number; alpha: number } {
  return { width: rimW, alpha: rimAlpha };
}

/** The label resolution the driver reports, so the sharpness gate quotes what
 *  the glyphs were actually rasterized at. */
export function labelResolution(): { at: number; resolution: number; labels: number } {
  return { at: labelResAt, resolution: labelRes, labels: cameraLabels.length };
}

// Plan step 5 B: the corona and the diffraction spikes of a branch sun.
export const STAR_GOLD = "#ffe3a6";
export const GOLD = "#ffcf6e";
export const SELECT_CYAN = "#5ff2ff";

export interface NodeView {
  root: Container;
  node: DocNode;
  body: Sprite;
  glow: Sprite;
  ring: Graphics;
  label: Text;
  baseScale: number;
  radius: number;
}

export const LABEL_FONT = "Segoe UI, system-ui, sans-serif";
export const LABEL_PX = 11;
export const LABEL_SPACING = 0.8;

/** Every Text on the map is built here, which is also what makes the
 *  camera-following resolution of `applyCameraLook` cover all of them: planet
 *  and moon labels, branch names, status lines, the cluster marker and the core
 *  row. */
export function makeLabel(text: string, size = LABEL_PX): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: LABEL_FONT,
      fontSize: size,
      letterSpacing: LABEL_SPACING,
      fill: 0xbfd0ee,
      align: "center",
    },
  });
  // A label born after the camera settled (a moon label, on the next branch
  // activation) starts at the resolution the rest already carry.
  if (labelRes) t.resolution = labelRes;
  cameraLabels.push(t);
  return t;
}

export function crop(s: string, n = 16): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Bidirectional middle-ellipsis crop (the naming discipline):
 *  cropMid("cool_plot_2026_stacked_bars.png", 22) -> "cool_plot…acked_bars.png" —
 *  both the distinctive head and the extension survive. */
export function cropMid(s: string, max = 22): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) * 0.5);
  const tail = max - 1 - head;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

// The gold a live doc wears. Plan step 3 C dropped the glow from 0.9 to 0.6 so
// it stopped swamping the class hue; plan step 5 A takes it to 0.45 over a
// halo of 2.2 body radii and moves the signal onto a 1.5-unit rim on the body
// edge: "the eye should find live docs by the rim and the slightly larger,
// brighter body, not by a halo the size of five planets".
export const LIVE_GLOW_ALPHA = 0.45;
export const GLOW_ALPHA = 0.35;
const LIVE_GLOW_RADII = 2.2; // halo radius, in body radii (was 2.6)
const GLOW_RADII = 2.0;
// The rim's width at fit camera, in world units. It is bounded on screen by the
// same factor as the glow (applyCameraLook), because a 1.5-unit stroke on a
// planet drawn at 137 screen px radius is a 16 px band: a drawn border rather
// than a rim light. Alpha travels with it, 0.85 at fit camera to 0.55 at focus.
const LIVE_RIM_W = 1.5;
const LIVE_RIM_ALPHA_FOCUS = 0.55;
const LIVE_RIM_ALPHA_SPAN = 0.3;
// Plan step 5 "labels stay sharp at zoom": a Pixi Text is a bitmap rasterized
// once, so a label upscales with the camera unless its resolution follows. The
// cap keeps the glyph atlas of a 5x view from growing without end.
const LABEL_RES_MAX = 4;

/** The label one planet carries: the type tag, then the on-disk filename,
 *  middle-ellipsized at 22 characters. One Text object, so the overlap gates
 *  measure the tag too (plan step 3 C).
 *  args: node (the doc)
 *  returns: the label string, e.g. "RP · review_2026…h_batch.md" -- the dot is
 *  there because "RP  review_..." reads as one word at 11px */
export function nodeLabelText(node: { kind: string; path: string }): string {
  return `${typeTag(node.kind)} · ${cropMid(fileName(node.path))}`;
}

// Owner request 3b A: "Compute the needed arc length from the real label widths,
// not from a fixed per-arc count." The arc capacity is decided BEFORE any Pixi
// text exists (the world box is sized from the level count), so the width is
// measured on a bare canvas with the same font Pixi will use, and cached per
// string.
const LABEL_MEASURE_PAD = 3; // covers the difference between this and Pixi's own metrics
const labelWidths = new Map<string, number>();
const measureCtx = (() => {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${LABEL_PX}px ${LABEL_FONT}`;
  // Chromium measures letter spacing for us; Pixi uses the same property.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${LABEL_SPACING}px`;
  return ctx;
})();

/**
 * World-unit width of the label one node will wear.
 *
 * ```text
 * node -> nodeLabelText (the exact string the planet gets)
 *      -> canvas measureText at 11px Segoe UI with 0.8 letter spacing
 *      -> + 3 units of slack, so the LAYOUT's box is never narrower than the
 *         rendered text (the harness gates on that slack being positive)
 * ```
 * args: node (kind and path, the two fields the label text is built from)
 * returns: the width in world units
 */
export function labelWidth(node: { kind: string; path: string }): number {
  const text = nodeLabelText(node);
  const hit = labelWidths.get(text);
  if (hit !== undefined) return hit;
  const w = measureCtx.measureText(text).width + LABEL_MEASURE_PAD;
  labelWidths.set(text, w);
  return w;
}

/**
 * Build one planet view for a doc node (root stars are built in scene.ts).
 *
 * Plan step 5 A "Planets are small gas giants": the body is the banded texture,
 * the halo is bounded against the camera, and a live doc's signal is the gold
 * rim on its edge rather than the old five-planet-wide glow. Sizes are
 * unchanged (plan 11, live report 13, otherwise 10).
 *
 * Plan step 3 B "Labels sit beside their node": the label is anchored on the
 * node's own side and vertically centred on the planet, so a name can never be
 * mistaken for its neighbour's. The side itself comes from the layout, which is
 * the only place that knows which arc the node landed on.
 *
 * args: node (the doc), radius (override, used for the dim stranded docs)
 * returns: NodeView -- {root, node, body, glow, ring, label, baseScale, radius}
 */
export function makeNodeView(node: DocNode, radius = node.kind === "plan" ? 11 : node.live ? 13 : 10): NodeView {
  const root = new Container();
  const { hue, sat } = kindHue(node.kind, node.id);

  const glow = new Sprite(glowTexture(node.live ? GOLD : hslToHex(hue, 70, 60)));
  glow.anchor.set(0.5);
  glow.blendMode = "add";
  glow.alpha = node.live ? LIVE_GLOW_ALPHA : GLOW_ALPHA;
  glow.setSize(radius * 2 * (node.live ? LIVE_GLOW_RADII : GLOW_RADII));
  boundGlow(glow);

  const body = new Sprite(planetTexture(hue, node.status === "stranded" ? 24 : sat, PLANET_TEX_PX, bandsFor(node.id)));
  body.anchor.set(0.5);
  body.setSize(radius * 2);

  // Plan step 5 A "a live doc keeps a warm rim light instead of the large gold
  // glow": on the body's own edge, so it reads at every zoom and never spills
  // over a neighbour the way the old halo did.
  const rim = new Graphics();
  if (node.live) boundedRims.push({ g: rim, radius });

  const ring = new Graphics();
  const label = makeLabel(nodeLabelText(node));
  label.anchor.set(0, 0.5);
  label.position.set(radius + LABEL_GAP, 0);
  label.alpha = 0.55;

  root.addChild(glow, body, rim, ring, label);
  return { root, node, body, glow, ring, label, baseScale: 1, radius };
}

/** Put a label on its node's side of the branch centre line: a plan's name is
 *  right-aligned to its left edge, a report's left-aligned to its right edge
 *  (plan step 3 B). */
export function placeLabel(v: NodeView, side: "left" | "right") {
  v.label.anchor.set(side === "left" ? 1 : 0, 0.5);
  v.label.position.set(side === "left" ? -(v.radius + LABEL_GAP) : v.radius + LABEL_GAP, 0);
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((c * 255) / 100)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
