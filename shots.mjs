// Self-review harness: boots the Python server, drives the page through its
// key states via the window.__starmap driver, and dumps PNGs to shots/ for
// the agent (or a human) to inspect. Also prints the label-overlap report.
//
//   node shots.mjs            -> shots/01_default.png ... + overlap report

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

// python serves BOTH the built dist/ and the API; override the port when a
// live starmap already occupies 8377 (SECTOR_PORT=8461 npm run shot).
const PY_PORT = Number(process.env.SECTOR_PORT ?? 8377);
const procs = [];
const PYTHON = process.env.PYTHON ?? "python";

// Playwright's own Chromium by default (`npx playwright install chromium`).
// CHROMIUM_PATH points at another build, for machines where the matching one
// cannot be installed.
const CHROMIUM = process.env.CHROMIUM_PATH;

function findHostRepo() {
  if (process.env.SECTOR_REPO) return resolve(process.env.SECTOR_REPO);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "sector-map.config.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: "pipe", shell: process.platform === "win32", ...opts });
  p.stderr.on("data", (d) => console.log(`[${cmd}]`, d.toString().trim()));
  p.stdout.on("data", (d) => console.log(`[${cmd}]`, d.toString().trim()));
  procs.push(p);
  return p;
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  mkdirSync("shots", { recursive: true });
  run(PYTHON, ["server.py", "--repo", findHostRepo(), "--port", String(PY_PORT)]);
  await waitFor(`http://127.0.0.1:${PY_PORT}/api/tree`);

  // Headless GPU: force a real WebGL2 path (SwiftShader), otherwise Pixi's
  // batch shaders fail to compile and every textured sprite vanishes.
  const browser = await chromium.launch({
    ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1720, height: 980 } });
  page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(`http://127.0.0.1:${PY_PORT}/?debug=1`);
  await page.waitForFunction("window.__starmap?.ready === true", null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const shot = (name) => page.screenshot({ path: `shots/${name}.png` });
  const drive = (js) => page.evaluate(js);

  await shot("01_default");

  // Pick demo branches from the DATA, not by name: busiest branch for the
  // pin/cluster shots, any branch with a supersession chain for the chain shot.
  const slots = await drive("window.__starmap.state().slots");
  const tree = await (await fetch(`http://127.0.0.1:${PY_PORT}/api/tree`)).json();
  const byNodes = [...tree.branches].sort((a, z) => z.nodes.length - a.nodes.length);
  const busy = byNodes[0]?.branch ?? slots[0];
  const chained = tree.branches.find((b) => b.nodes.some((n) => n.supersedes))?.branch ?? busy;
  await drive(`window.__starmap.pin(${JSON.stringify(busy)})`);
  await page.waitForTimeout(600);
  await shot("02_pinned_busy_branch");

  await drive(`window.__starmap.openCluster(${JSON.stringify(busy)})`);
  await page.waitForTimeout(400);
  await shot("03_cluster_list");
  await page.keyboard.press("Escape");

  await drive(`window.__starmap.pin(${JSON.stringify(chained)})`);
  await page.waitForTimeout(600);
  await shot("04_chain");

  // reader panel on the first live node of the pinned branch
  await drive(`
    (() => {
      const s = window.__starmap;
      fetch('/api/tree').then(r=>r.json()).then(t => {
        const b = t.branches.find(x=>x.branch===${JSON.stringify(chained)});
        const n = b.nodes.find(x=>x.live) ?? b.nodes[0];
        s.openNode(n.id);
      });
    })()`);
  await page.waitForTimeout(1000);
  await shot("05_reader");
  await page.keyboard.press("Escape");

  await drive("window.__starmap.unpin(); window.__starmap.enterSelect()");
  await page.waitForTimeout(400);
  await shot("06_select_mode");

  await drive("window.__starmap.lockIn()");
  await page.waitForTimeout(500);
  await shot("07_composer");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await drive(`
    fetch('/api/tree').then(r=>r.json()).then(t => {
      const n = t.branches.flatMap(b=>b.nodes).find(x=>x.significance==='high')
             ?? t.branches.flatMap(b=>b.nodes)[0];
      window.__starmap.openGame(n.id);
    })`);
  await page.waitForTimeout(600);
  await shot("08_game_dialog");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // focus mode: a node with satellites — settled ring + labels + Artifacts panel
  await drive(`
    fetch('/api/tree').then(r=>r.json()).then(t => {
      const n = t.branches.flatMap(b=>b.nodes)
        .sort((a,z)=>z.satellites.length-a.satellites.length)[0];
      window.__starmap.focusNode(n.id);
    })`);
  await page.waitForTimeout(2200);
  await shot("09_focus_satellites");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // coral net: seed placed in a branch, defaults + one extra threaded
  const seedBranch = slots[0];
  await drive(`window.__starmap.demoSeed(${JSON.stringify(seedBranch)})`);
  await page.waitForTimeout(900);
  await shot("10_coral_net");
  await page.keyboard.press("Escape");

  // Overlap report must run PER PINNED BRANCH — node labels only exist on the
  // active system, so a no-pin sweep sees nothing (learned the hard way).
  let total = 0;
  for (const slot of slots) {
    await drive(`window.__starmap.pin(${JSON.stringify(slot)})`);
    await page.waitForTimeout(250);
    // The driver now reports label-over-planet intersections next to the
    // label-label ones (plan step 3 B), so both counts are printed.
    const o = await drive("window.__starmap.overlapReport()");
    total += o.labelLabel.length + o.labelPlanet.length;
    console.log(`overlaps[${slot}]: labels ${o.labelLabel.length}, over planets ${o.labelPlanet.length}`);
    o.labelLabel.slice(0, 8).forEach((x) => console.log("   ", x.a, "<->", x.b));
    o.labelPlanet.slice(0, 8).forEach((x) => console.log("   ", x.label, "over", x.node));
  }
  console.log(`label overlaps total: ${total}`);

  await browser.close();
  procs.forEach((p) => p.kill());
  console.log("shots written to shots/");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  procs.forEach((p) => p.kill());
  process.exit(1);
});
