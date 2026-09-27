// DOM panels — everything that is text-heavy lives in HTML overlays, not in
// the WebGL scene (plan §Feel: minimal text clutter on the map itself).
//
//   #panel      right sidebar: reader / cluster list / composer
//   #modal-root centered modals: game dialog, slot picker
//   #toast      transient confirmations ("copied", "plan written")

import { marked } from "marked";
import type { ClusterItem, DocNode, Satellite, Tree } from "./data";
import { fetchFile, post } from "./data";
import { attachAtMenu } from "./finder";
import { fileName, kindWord, moonTint } from "./nodes";

const panel = () => document.getElementById("panel")!;
const modalRoot = () => document.getElementById("modal-root")!;

export function toast(msg: string) {
  const t = document.getElementById("toast")!;
  t.textContent = msg;
  t.classList.remove("hidden");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

/**
 * Open one repo file in the editor and report honestly.
 *
 * Plan step 1 "shows actionable failures": /api/open answers
 * {ok: false, error} when it cannot find VS Code, and that error is what the
 * toast shows instead of a cheerful "Opened in editor".
 * args: path (repo-relative)
 * returns: nothing; the outcome is a toast
 */
export function openInEditor(path: string) {
  post("/api/open", { path }).then((r) => toast(r.ok ? "Opened in editor" : r.error));
}

// Owner steer 2026-09-23 "working Back button": each reader/image view records
// how to redraw itself; opening an artifact from a view hands that redraw to
// the artifact's panel as its `← Back`. Back chains, so report -> page ->
// image steps back one view at a time.
let currentView: (() => void) | null = null;
let pendingBack: (() => void) | null = null;

/** Take the Back target handed over by openArtifact, and register `redraw` as
 *  the view now on screen (restoring the same Back when it is redrawn).
 *  returns: the Back action for this view, or null when opened from the map */
function enterView(redraw: () => void): (() => void) | null {
  const back = pendingBack;
  pendingBack = null;
  currentView = () => {
    pendingBack = back;
    redraw();
  };
  return back;
}

/** The miniature `← Back` in the top-left of a panel, when there is a back. */
const backBtn = (back: (() => void) | null) => (back ? `<button class="back-btn" id="pn-back">← Back (Esc)</button>` : "");
const wireBack = (p: HTMLElement, back: (() => void) | null) =>
  p.querySelector("#pn-back")?.addEventListener("click", () => back!());

/** Esc's first job while an artifact panel has a Back: press it.
 *  returns: true when it stepped back, false when there was no Back */
export function goBack(): boolean {
  const b = document.getElementById("pn-back");
  b?.click();
  return !!b;
}

export function closePanel() {
  currentView = null;
  panel().classList.add("hidden");
  panel().innerHTML = "";
}

export function closeModal() {
  modalRoot().classList.add("hidden");
  modalRoot().innerHTML = "";
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  toast("Copied to clipboard");
}

function el(html: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

/** Markdown -> HTML with repo-relative images/links routed through the server. */
function renderMarkdown(md: string, filePath: string): string {
  const dir = filePath.split("/").slice(0, -1).join("/");
  const resolve = (href: string) => {
    if (/^(https?:|data:|#)/.test(href)) return href;
    const rel = href.startsWith("notes/") || href.startsWith("tools/")
      ? href
      : `${dir}/${href}`.replace(/\/\.\//g, "/");
    return `/raw?path=${encodeURIComponent(rel)}`;
  };
  // marked 12 calls renderer methods with POSITIONAL args (href, title, text);
  // the token-object form belongs to marked 13+ and silently yielded empty
  // src/href attributes here, so every reader image was broken.
  const renderer = new marked.Renderer();
  renderer.image = (href, _title, text) => `<img src="${resolve(href)}" alt="${text}" />`;
  renderer.link = (href, _title, text) =>
    `<a href="${resolve(href)}" target="_blank" rel="noopener">${text}</a>`;
  return marked.parse(md, { renderer, async: false }) as string;
}

// ---------------- plan step 2 B: opening a proof by its type ----------------

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);
const PAGE_EXTS = new Set(["html", "htm"]);
// Text the reader panel can show as characters. Everything outside this and
// the two sets above is offered as a file, never rendered.
const READABLE_EXTS = new Set(["md", "txt", "tex", "json", "csv", "log", "yaml", "yml",
  "toml", "cfg", "ini", "py", "ts", "tsx", "js", "mjs", "jsx", "css", "sh", "ps1",
  "bat", "sql", "diff", "patch"]);

export const rawUrl = (path: string) => `/raw?path=${encodeURIComponent(path)}`;
const extOf = (path: string) => (path.includes(".") ? path.split(".").pop()!.toLowerCase() : "");
const openTab = (path: string) => window.open(rawUrl(path), "_blank", "noopener");

/**
 * Open one proof the way its type deserves, from the artifact list or from a
 * satellite click on the map.
 *
 * Plan step 2 B "Opening a proof does the right thing for its type": the old
 * code had exactly two answers, image panel or editor, so a plan page opened
 * in VS Code and a PDF pasted its bytes into the panel.
 *
 * ```text
 * ext
 *  +-- missing on disk        -> toast "Not on disk: <path>", nothing opens
 *  +-- the doc's own page:     -> the reader, in its iframe (it IS the report,
 *  |                              not an artifact of it)
 *  +-- png jpg jpeg gif svg webp -> image panel (+ its full-size link)
 *  +-- html htm pdf           -> new browser tab through /raw
 *  +-- md txt json csv ...    -> the reader panel (markdown rendered)
 *  +-- anything else          -> new tab through /raw; the row also offers the editor
 * ```
 * args: a ({path, name, ext, missing, is_page}) -- a Satellite passes as is
 * returns: nothing; one panel, tab or toast happens
 */
export function openArtifact(
  a: { path: string; name?: string; ext?: string; missing?: boolean; is_page?: boolean },
) {
  const ext = a.ext ?? extOf(a.path);
  const name = a.name ?? fileName(a.path);
  if (a.missing) return toast(`Not on disk: ${a.path}`);
  pendingBack = currentView; // only a panel view consumes it; a new tab leaves it unused
  if (a.is_page) {
    openReader({ path: a.path, title: name });
    return;
  }
  if (IMAGE_EXTS.has(ext)) return openImage(a.path, name);
  if (READABLE_EXTS.has(ext)) {
    openReader({ path: a.path, title: name });
    return;
  }
  pendingBack = null;
  openTab(a.path); // pages, PDFs and every unknown format
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// The fields worth a chip. All five are one-line scalars in every plan and
// report template, which is why a line regex is enough here and no YAML
// parser is pulled into the frontend.
const CHIP_FIELDS = ["kind", "status", "date", "plan", "page"];

/**
 * Split a doc's YAML front-matter off the body it is glued to.
 *
 * Plan step 2 "strip the YAML front-matter block from the rendered markdown
 * and show its fields as chips instead": marked renders the block as one bold
 * paragraph of `kind: report status: head ...`, which every reader saw first.
 *
 * ```text
 * "---\nkind: report\nlook_at:\n  - a.png\n---\n# Title"
 *   -> fields [["kind","report"]]        (nested lines are skipped)
 *      body   "# Title"
 * ```
 * args: md (the raw file)
 * returns: {fields: [key, value] pairs in CHIP_FIELDS order of appearance,
 *           body: the markdown after the block}
 */
function splitFrontMatter(md: string): { fields: [string, string][]; body: string } {
  const m = FRONT_MATTER.exec(md);
  if (!m) return { fields: [], body: md };
  const fields: [string, string][] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):[ \t]*(\S.*)$/.exec(line);
    if (kv && CHIP_FIELDS.includes(kv[1]) && kv[2].trim() !== "null")
      fields.push([kv[1], kv[2].trim().replace(/^["']|["']$/g, "")]);
  }
  return { fields, body: md.slice(m[0].length) };
}

/** Resolve a front-matter doc reference against its own branch root, which is
 *  where `plan: plans/x.md` and `page: reviews/x.html` are written from.
 *  args: docPath (repo-relative doc), entry (the front-matter value)
 *  returns: a repo-relative path */
function branchRelative(docPath: string, entry: string): string {
  const parts = docPath.split("/");
  return [...parts.slice(0, -2), entry].join("/");
}

/** One chip; `href` makes it a click target that opens the referenced doc. */
function chip(text: string, path?: string): string {
  return path
    ? `<span class="chip link" data-chip="${path}">${escapeHtml(text)}</span>`
    : `<span class="chip">${escapeHtml(text)}</span>`;
}

/** The chip row of a doc: what the map already knows, then what the file's own
 *  front-matter adds, deduplicated by the text shown so nothing reads twice. */
function chipRow(known: string[], fields: [string, string][], docPath: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of known) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(chip(k));
  }
  for (const [key, value] of fields) {
    // Plan step 3 C: the front-matter kind goes through the same three words,
    // so a file whose front matter says "review" does not add a second chip
    // next to the "report" the map already knows.
    const text = key === "kind" ? kindWord(value) : value;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(key === "plan" || key === "page"
      ? chip(`${key}: ${fileName(value)}`, branchRelative(docPath, value))
      : chip(text));
  }
  return out.join("");
}

/** One artifact row: the name, its tags, and the secondary actions on the
 *  right (never a second click target on the name itself). */
function artRow(s: Satellite): string {
  const tags = [
    s.check_me ? `<span class="art-tag gold">check me</span>` : "",
    s.is_page ? `<span class="art-tag">page</span>` : "",
    s.missing ? `<span class="art-tag warn">missing on disk</span>` : "",
  ].join("");
  const acts = s.missing
    ? ""
    : `${IMAGE_EXTS.has(s.ext) || s.ext === "md" ? "" : `<button class="art-act" data-act="raw">raw</button>`}
       <button class="art-act" data-act="editor">✎</button>`;
  // The row dot is the file's own moon, the same tint the map gives it, so a
  // proof is recognisable in both places. Type is not a colour any more.
  const moon = s.missing ? "" : `style="background:${moonTint(s.path).css}"`;
  return `<div class="art-row ${s.missing ? "gone" : ""}" data-path="${s.path}" data-ext="${s.ext}"
       data-missing="${s.missing}" data-page="${s.is_page}">
      <span class="art-dot ${s.missing ? "gone" : ""} ${s.check_me ? "check" : ""}" ${moon}></span>
      <span class="art-name">${escapeHtml(s.name)}</span>${tags}
      <span class="art-acts">${acts}</span></div>`;
}

/** Proofs first, provenance under its own dimmer heading (plan step 2 item 5). */
function artSections(sats: Satellite[], truncated: boolean): string {
  const proofs = sats.filter((s) => !s.provenance);
  const prov = sats.filter((s) => s.provenance);
  const head = (label: string, n: number, cls = "") =>
    `<div class="art-head ${cls}">${label} (${n}${truncated && !cls ? ", capped" : ""})</div>`;
  return [
    proofs.length ? head("Artifacts", proofs.length) + `<div class="art-list">${proofs.map(artRow).join("")}</div>` : "",
    prov.length ? head("Provenance", prov.length, "dim") + `<div class="art-list dim">${prov.map(artRow).join("")}</div>` : "",
  ].join("");
}

export interface ReaderOpts {
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPlay: ((node: DocNode) => void) | null;
  onList: (() => void) | null; // plan step 3 D: back to the full older-docs list
  satellites: Satellite[];
  truncated: boolean;
}

let lastReaderPath: string | null = null;
export const getLastReaderPath = () => lastReaderPath;

export async function openReader(
  node: { path: string; title: string; kind?: string; status?: string; date?: string; played?: boolean },
  opts: Partial<ReaderOpts> = {},
) {
  lastReaderPath = node.path;
  const back = enterView(() => openReader(node, opts));
  const p = panel();
  p.classList.remove("hidden");
  // Plan step 3 C: the chips say plan, report or doc, the same three words the
  // map's type tags and the palette rows use.
  const known = [node.kind ? kindWord(node.kind) : "", node.status, node.date,
                 node.played ? "played ✓" : ""].filter(Boolean) as string[];
  const sats = opts.satellites ?? [];
  const isPage = PAGE_EXTS.has(extOf(node.path));
  p.innerHTML = `
    ${backBtn(back)}
    <div class="panel-head">
      <div class="panel-title">${escapeHtml(node.title)}</div>
      <button class="icon-btn" id="rd-close">✕</button>
    </div>
    <div class="panel-path">${escapeHtml(node.path)}</div>
    <div class="chips" id="rd-chips">${chipRow(known, [], node.path)}</div>
    <div class="panel-actions">
      ${isPage ? `<button id="rd-tab">Open in tab</button>` : ""}
      <button id="rd-open">Open in editor</button>
      <button id="rd-copy">Copy path</button>
      ${opts.selectMode ? `<button id="rd-select">${opts.selected ? "✓ Selected" : "Select"}</button>` : ""}
      ${opts.onPlay ? `<button id="rd-play" class="gold">▶ Play</button>` : ""}
      ${opts.onList ? `<button id="rd-list">list</button>` : ""}
    </div>
    ${artSections(sats, !!opts.truncated)}
    <div class="panel-body" id="rd-body">loading…</div>`;
  wireArtRows(p);
  wireBack(p, back);
  p.querySelector("#rd-close")!.addEventListener("click", closePanel);
  p.querySelector("#rd-tab")?.addEventListener("click", () => openTab(node.path));
  p.querySelector("#rd-open")!.addEventListener("click", () => openInEditor(node.path));
  p.querySelector("#rd-copy")!.addEventListener("click", () => copyText(node.path));
  p.querySelector("#rd-select")?.addEventListener("click", () => {
    opts.onToggleSelect?.(node.path);
    closePanel();
  });
  p.querySelector("#rd-play")?.addEventListener("click", () => opts.onPlay?.(node as DocNode));
  p.querySelector("#rd-list")?.addEventListener("click", () => opts.onList?.());

  const body = p.querySelector("#rd-body")! as HTMLElement;
  // Plan step 2 "a plan page is readable in place": a page is an iframe over
  // /raw, not a fetch, so its own CSS renders and its links keep working.
  if (isPage) {
    body.innerHTML = `<iframe class="page-frame" sandbox="allow-same-origin" src="${rawUrl(node.path)}"></iframe>`;
    return;
  }
  try {
    const f = await fetchFile(node.path);
    // Opening a second doc while this fetch was in flight must not repaint the
    // panel that now belongs to the other doc: `#rd-chips` is looked up live,
    // so without this guard a page opened from an artifact row wore the chips
    // of the report it was opened from.
    if (lastReaderPath !== node.path) return;
    if (f.type === "binary") {
      body.innerHTML = `<div class="bin-note">Not a text file (${f.size} bytes). Open it raw in a new tab, or in the editor.</div>`;
    } else if (f.type === "markdown") {
      const { fields, body: md } = splitFrontMatter(f.content ?? "");
      p.querySelector("#rd-chips")!.innerHTML = chipRow(known, fields, node.path);
      wireChips(p);
      body.innerHTML = renderMarkdown(md, node.path);
    } else {
      body.innerHTML = `<pre>${escapeHtml(f.content ?? "")}</pre>`;
    }
  } catch (e) {
    body.textContent = `failed to load: ${e}`;
  }
}

/** Artifact rows: the name opens the proof by type, the right-hand buttons are
 *  the secondary actions (raw tab, editor). */
function wireArtRows(root: HTMLElement) {
  root.querySelectorAll(".art-row").forEach((r) =>
    r.addEventListener("click", (ev) => {
      const row = r as HTMLElement;
      const act = (ev.target as HTMLElement).dataset?.act;
      if (act === "raw") return void openTab(row.dataset.path!);
      if (act === "editor") return openInEditor(row.dataset.path!);
      openArtifact({
        path: row.dataset.path!,
        ext: row.dataset.ext!,
        missing: row.dataset.missing === "true",
        is_page: row.dataset.page === "true",
      });
    }),
  );
}

/** A plan/page chip opens what it names, in the reader or in a tab. */
function wireChips(root: HTMLElement) {
  root.querySelectorAll(".chip.link").forEach((c) =>
    c.addEventListener("click", () => openArtifact({ path: (c as HTMLElement).dataset.chip! })),
  );
}

export function openImage(path: string, name: string) {
  const back = enterView(() => openImage(path, name));
  const p = panel();
  p.classList.remove("hidden");
  // Plan step 2 B "Open full size": the panel is 560 px wide, so every
  // screenshot in it is downscaled; the link is the way back to real pixels.
  p.innerHTML = `
    ${backBtn(back)}
    <div class="panel-head"><div class="panel-title">${escapeHtml(name)}</div>
      <button class="icon-btn" id="im-close">✕</button></div>
    <div class="panel-actions">
      <a class="btn-link" id="im-full" href="${rawUrl(path)}" target="_blank" rel="noopener">Open full size</a>
      <button id="im-open">Open in editor</button></div>
    <div class="panel-body"><img src="${rawUrl(path)}" /></div>`;
  wireBack(p, back);
  p.querySelector("#im-close")!.addEventListener("click", closePanel);
  p.querySelector("#im-open")!.addEventListener("click", () => openInEditor(path));
}

export function openClusterList(branch: string, items: ClusterItem[], onPick: (id: string, title: string) => void) {
  const p = panel();
  p.classList.remove("hidden");
  const rows = items
    .map((i) => `<div class="row" data-id="${i.id}" data-title="${escapeHtml(i.title)}">
        <span class="row-date">${i.date}</span><span class="row-kind">${i.kind}</span>
        <span class="row-title">${escapeHtml(fileName(i.id))}</span></div>`)
    .join("");
  p.innerHTML = `
    <div class="panel-head"><div class="panel-title">${branch} — older docs (${items.length})</div>
      <button class="icon-btn" id="cl-close">✕</button></div>
    <div class="panel-body list">${rows}</div>`;
  p.querySelector("#cl-close")!.addEventListener("click", closePanel);
  p.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => onPick((r as HTMLElement).dataset.id!, (r as HTMLElement).dataset.title!)),
  );
}

// ---------------- composer (plan §Functionality 1+2) ----------------

type ToReadItem = {
  path: string; title: string; date: string;
  readList?: { path: string; required?: string }[];
};

export interface ComposerCtx {
  toRead: ToReadItem[];
  branches: string[];
  defaultBranch: string;
  handoverTemplate: string;
  contextPacks: string[]; // pack:variant tokens derived from selection
  newBranch: boolean; // seed placed in empty space -> name a brand-new branch
  // Plan step 4 C "New plans keep the seed's spot": called with the path the
  // server wrote, BEFORE the reload, so the caller can save the seed's offset.
  onSubmitted?: (planPath: string, branch: string) => Promise<void>;
}

let composerTask: HTMLTextAreaElement | null = null;
export function composerInsertRef(path: string): boolean {
  if (!composerTask || panel().classList.contains("hidden")) return false;
  const t = composerTask;
  const at = t.selectionStart ?? t.value.length;
  // Plan step 1 "@ references": a map click and the @ menu produce the same
  // plain-text form, so the copied prompt reads identically either way.
  t.value = `${t.value.slice(0, at)}@${path} ${t.value.slice(at)}`;
  t.focus();
  t.selectionStart = t.selectionEnd = at + path.length + 2;
  return true;
}

/**
 * The READ IN FULL list of the handover, with every selected card expanded.
 *
 * Owner steer 2026-09-23: a branch card in the selection brings its live docs
 * and its required context as nested bullets under it (artifacts are left
 * out). A file already on the list is never repeated, so a live doc selected
 * on its own keeps its own number.
 *
 * ```text
 * 1. .sector/workstreams/x/X.md — X title
 *    - .sector/workstreams/x/reviews/r.md
 *    - .sector/core/style/INDEX.md (required context: style)
 * 2. .sector/workstreams/y/plans/p.md — p title
 * ```
 * args: items (the selection, core packs first, then by date)
 * returns: the numbered list as plain text
 */
function toReadList(items: ToReadItem[]): string {
  const seen = new Set(items.map((r) => r.path));
  const lines: string[] = [];
  items.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.path}${r.title ? ` — ${r.title}` : ""}`);
    for (const d of r.readList ?? []) {
      if (seen.has(d.path)) continue;
      seen.add(d.path);
      lines.push(`   - ${d.path}${d.required ? ` (required context: ${d.required})` : ""}`);
    }
  });
  return lines.join("\n");
}

export function openComposer(ctx: ComposerCtx) {
  const p = panel();
  p.classList.remove("hidden");
  const toReadText = toReadList(ctx.toRead);
  const handover = ctx.handoverTemplate.replace("{TO_READ}", toReadText).trimEnd();
  const options = ctx.branches.map((b) => `<option ${b === ctx.defaultBranch ? "selected" : ""}>${b}</option>`).join("");
  p.innerHTML = `
    <div class="panel-head"><div class="panel-title">Handover composer</div>
      <button class="icon-btn" id="cp-close">✕</button></div>
    <div class="cp-label">Generated handover (editable) — ${ctx.toRead.length} nodes</div>
    <textarea id="cp-handover" spellcheck="false"></textarea>
    <div class="cp-label">Task: type @ to reference a file, or click any node on the map</div>
    <textarea id="cp-task" spellcheck="false" placeholder="Describe the task exactly as you would in a Claude Code / Codex chat…"></textarea>
    <div class="cp-row">
      <label>slug <input id="cp-slug" placeholder="gemma_transfer" /></label>
      ${ctx.newBranch
        ? `<label>new branch <input id="cp-newbranch" placeholder="fresh_idea" /></label>`
        : `<label>branch <select id="cp-branch">${options}</select></label>`}
    </div>
    <div class="panel-actions">
      <button id="cp-copy">Copy full prompt</button>
      <button id="cp-submit" class="gold">Submit plan →</button>
    </div>
    <div id="cp-result" class="cp-result hidden"></div>`;
  const handoverTa = p.querySelector("#cp-handover") as HTMLTextAreaElement;
  handoverTa.value = handover;
  composerTask = p.querySelector("#cp-task") as HTMLTextAreaElement;
  attachAtMenu(composerTask);
  p.querySelector("#cp-close")!.addEventListener("click", () => {
    composerTask = null;
    closePanel();
  });
  p.querySelector("#cp-copy")!.addEventListener("click", () =>
    copyText(`${handoverTa.value}\n\n## Task\n${composerTask!.value}`));
  p.querySelector("#cp-submit")!.addEventListener("click", async () => {
    const branch = ctx.newBranch
      ? (p.querySelector("#cp-newbranch") as HTMLInputElement).value
      : (p.querySelector("#cp-branch") as HTMLSelectElement).value;
    const slug = (p.querySelector("#cp-slug") as HTMLInputElement).value || "starmap_task";
    const res = await post("/api/submit-plan", {
      branch,
      new_branch: ctx.newBranch,
      slug,
      task: composerTask!.value,
      to_read: ctx.toRead,
      to_read_text: toReadText, // the plan stub carries the same expanded list
      context_packs: ctx.contextPacks,
    });
    const box = p.querySelector("#cp-result") as HTMLElement;
    box.classList.remove("hidden");
    if (res.error) {
      box.textContent = `✗ ${res.error}`;
      return;
    }
    box.innerHTML = `✓ wrote <b>${res.plan_path}</b><br/>clipboard: <code>${res.implement_line}</code><br/>reloading the map…`;
    await ctx.onSubmitted?.(res.plan_path, branch);
    await copyText(res.implement_line);
    setTimeout(() => location.reload(), 1800); // the real plan planet appears
  });
}

// ---------------- game dialog (plan §Functionality 3) ----------------

export function openGameDialog(node: DocNode, branch: string, template: string) {
  const m = modalRoot();
  m.classList.remove("hidden");
  m.innerHTML = `
  <div class="modal">
    <div class="panel-head"><div class="panel-title">▶ Play a game</div>
      <button class="icon-btn" id="gm-close">✕</button></div>
    <div class="gm-report">on <b>${node.title}</b><br/><code>${node.path}</code></div>
    <label class="cp-label">Game type
      <select id="gm-type">
        <option>sabotage hunt</option><option>quiz</option>
        <option>refactor court</option><option>queen's move</option><option>check my summary</option>
      </select></label>
    <label class="cp-label">Time budget <input id="gm-budget" value="20 min" /></label>
    <label class="cp-label">Notes <input id="gm-notes" placeholder="optional" /></label>
    <div class="panel-actions"><button id="gm-go" class="gold">Generate prompt → clipboard</button></div>
  </div>`;
  m.querySelector("#gm-close")!.addEventListener("click", closeModal);
  m.querySelector("#gm-go")!.addEventListener("click", async () => {
    const val = (id: string) => (m.querySelector(id) as HTMLInputElement | HTMLSelectElement).value;
    const prompt = template
      .replaceAll("{GAME}", val("#gm-type"))
      .replaceAll("{REPORT}", node.path)
      .replaceAll("{BRANCH}", branch)
      .replaceAll("{BUDGET}", val("#gm-budget"))
      .replaceAll("{NOTES}", val("#gm-notes") ? `Extra notes: ${val("#gm-notes")}.` : "");
    await copyText(prompt);
    closeModal();
  });
}

// ---------------- the Layout window (B) ----------------

/**
 * Owner minibatch 6 C: the B window is no longer only a slot picker. It stacks
 * the three things that decide what the map draws and how, and one Save writes
 * all of them in a single POST and reloads.
 *
 * ```text
 * Workstream slots   which branches get a column          branch_slots
 * Core packs         which context packs the core row      core_slots
 *                    draws (none ticked = all of them)
 * Layout style       spread or coupled, plus the number    layout_style,
 *                    of nodes one arc may hold             arc_max_nodes
 *   |
 *   v
 * Save -> POST /api/config with all four keys -> reload
 * ```
 * args: tree, prefs (the style and node cap currently in force), onSave (called
 *       with the config patch)
 * returns: nothing; the modal owns the rest
 */
export function openLayoutWindow(
  tree: Tree,
  prefs: { style: string; arcMaxNodes: number },
  onSave: (patch: Record<string, unknown>) => void,
) {
  const m = modalRoot();
  m.classList.remove("hidden");
  const slots = new Set(tree.slots);
  const picked = tree.config.core_slots ?? [];
  const packOn = (pack: string) => picked.length === 0 || picked.includes(pack);
  const box = (group: string, value: string, on: boolean) =>
    `<label class="slot-row"><input type="checkbox" data-group="${group}" value="${value}" ${on ? "checked" : ""}/> ${value}</label>`;
  m.innerHTML = `
  <div class="modal">
    <div class="panel-head"><div class="panel-title">Layout</div>
      <button class="icon-btn" id="sp-close">✕</button></div>
    <div class="cp-label">Workstream slots (max ${tree.config.max_branch_slots})</div>
    <div class="slot-list">${tree.all_branches.map((b) => box("slot", b, slots.has(b))).join("")}</div>
    <div class="cp-label">Core packs</div>
    <div class="slot-list">${tree.core.map((p) => box("pack", p.pack, packOn(p.pack))).join("")}</div>
    <div class="cp-label">Layout style</div>
    <div class="lay-styles">
      <label class="slot-row"><input type="radio" name="lay-style" value="spread" ${prefs.style === "spread" ? "checked" : ""}/>
        <span>spread<span class="lay-note">plans fill the left of each branch arc, reports the right</span></span></label>
      <label class="slot-row"><input type="radio" name="lay-style" value="coupled" ${prefs.style === "coupled" ? "checked" : ""}/>
        <span>coupled<span class="lay-note">each pair sits as a tight couple, plan then report, spread evenly along the arc</span></span></label>
      <label class="slot-row">nodes per arc
        <input id="lay-max" type="number" min="2" max="40" value="${prefs.arcMaxNodes}" />
        <span class="lay-note">a date group larger than this carries over to the next arc; a pair counts as two</span></label>
    </div>
    <div class="panel-actions"><button id="sp-save" class="gold">Save &amp; reload</button></div>
  </div>`;
  m.querySelector("#sp-close")!.addEventListener("click", closeModal);
  m.querySelector("#sp-save")!.addEventListener("click", () => {
    const checked = (group: string) =>
      [...m.querySelectorAll(`input[data-group="${group}"]:checked`)].map((i) => (i as HTMLInputElement).value);
    const packs = checked("pack");
    onSave({
      branch_slots: checked("slot").slice(0, tree.config.max_branch_slots),
      // All packs ticked is stored as the empty list, so a host that later gains
      // a pack draws it instead of hiding it.
      core_slots: packs.length === tree.core.length ? [] : packs,
      layout_style: (m.querySelector("input[name=lay-style]:checked") as HTMLInputElement).value,
      arc_max_nodes: Number((m.querySelector("#lay-max") as HTMLInputElement).value),
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
