// Plan step 1 "Find and open anything": one server-side index feeding two
// surfaces: the Ctrl+P palette and the composer's @ reference menu. Both use
// the same matching, the same ranking and the same row shape, so a path found
// one way looks identical the other way.
//
//   GET /api/index (once per page life)
//     |
//     v
//   searchIndex(query)                 literal words, or /regex/
//     |                                filename hits rank above path-only hits
//     +--> openPalette()   Ctrl+P  -> onPick(entry) -> main.ts reveal
//     +--> attachAtMenu(ta) @word   -> inserts "@<path> " at the caret

import { cropMid, kindWord } from "./nodes";

export interface IndexEntry {
  path: string;
  name: string;
  branch: string; // branch name, or "core" for a context pack file
  kind: string; // card | plan | report | artifact | core | file
  date: string;
}

const EMPTY_ROWS = 12; // an empty query shows the newest dozen
const MAX_ROWS = 200; // the list scrolls; 12 rows are visible at a time

let index: IndexEntry[] | null = null;

/** Fetch the file index once and keep it for the page's lifetime. */
export async function loadIndex(): Promise<IndexEntry[]> {
  if (!index) index = await (await fetch("/api/index")).json();
  return index!;
}

/**
 * Rank the index against one query, VS Code style.
 *
 * ```text
 * query
 *   |
 *   +-- ""        -> newest EMPTY_ROWS entries
 *   +-- /re/      -> JavaScript regex, case-insensitive, tested on the path
 *   |                (invalid -> {rows: [], error: "invalid regex"})
 *   +-- "a b c"   -> every word must occur somewhere in the path, any order
 *   |
 *   v
 * group 1: the FILENAME matches       \ each group: newest date first,
 * group 2: only the directory matches /  then alphabetical by path
 * ```
 * args: entries (the loaded index), query (raw input text)
 * returns: {rows, error}, where error is a message to render instead of rows
 */
export function searchIndex(entries: IndexEntry[], query: string): { rows: IndexEntry[]; error: string | null } {
  const q = query.trim();
  if (!q) return { rows: entries.slice(0, EMPTY_ROWS), error: null };

  let hit: (text: string) => boolean;
  if (q.length > 1 && q.startsWith("/") && q.endsWith("/")) {
    let re: RegExp;
    try {
      re = new RegExp(q.slice(1, -1), "i");
    } catch {
      return { rows: [], error: "invalid regex" };
    }
    hit = (text) => re.test(text);
  } else {
    const words = q.toLowerCase().split(/\s+/);
    hit = (text) => words.every((w) => text.toLowerCase().includes(w));
  }
  const rows = entries.filter((e) => hit(e.path));
  const rank = (e: IndexEntry) => (hit(e.name) ? 0 : 1);
  rows.sort((a, b) =>
    rank(a) - rank(b) || b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
  return { rows: rows.slice(0, MAX_ROWS), error: null };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One result line: bright filename, dim middle-ellipsized directory, kind tag, branch. */
function rowHtml(e: IndexEntry, i: number, sel: number): string {
  const dir = e.path.slice(0, Math.max(0, e.path.length - e.name.length - 1));
  return `<div class="fd-row${i === sel ? " sel" : ""}" data-i="${i}">
    <span class="fd-name">${esc(e.name)}</span>
    <span class="fd-dir">${esc(cropMid(dir, 52))}</span>
    <span class="fd-kind">${esc(kindWord(e.kind))}</span>
    <span class="fd-branch">${esc(e.branch)}</span>
  </div>`;
}

/**
 * Move the highlight without touching the rows.
 *
 * Re-rendering on hover would swap the DOM node between a real mousedown and
 * its mouseup, and the browser then fires no click at all, so moving the
 * highlight NEVER rebuilds the list.
 */
function highlight(list: HTMLElement, sel: number) {
  list.querySelectorAll(".fd-row").forEach((r, i) => r.classList.toggle("sel", i === sel));
  (list.querySelector(".fd-row.sel") as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
}

/**
 * Render a result list from scratch: only when the rows themselves change.
 * args: list (the container), rows, sel (highlighted row index), error
 * returns: nothing; the caller owns rows/sel
 */
function paint(list: HTMLElement, rows: IndexEntry[], sel: number, error: string | null) {
  list.innerHTML = error
    ? `<div class="fd-empty">${esc(error)}</div>`
    : rows.length
      ? rows.map((e, i) => rowHtml(e, i, sel)).join("")
      : `<div class="fd-empty">no match</div>`;
  highlight(list, sel);
}

/** Arrow-key movement inside a result list, clamped at both ends. */
function moveSel(sel: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, sel + delta));
}

/**
 * Open the Ctrl+P palette. Esc closes, arrows move, Enter or a click picks;
 * the picked entry goes to `onPick`, which reveals it on the map.
 */
export async function openPalette(onPick: (e: IndexEntry) => void) {
  document.getElementById("finder")?.remove();
  const box = document.createElement("div");
  box.id = "finder";
  box.innerHTML = `<div class="fd-box">
    <input id="fd-input" placeholder="find a file: words in any order, or /regex/" spellcheck="false" autocomplete="off" />
    <div class="fd-list" id="fd-list"></div>
  </div>`;
  document.body.appendChild(box);
  const input = box.querySelector("#fd-input") as HTMLInputElement;
  const list = box.querySelector("#fd-list") as HTMLElement;
  const close = () => box.remove();

  let rows: IndexEntry[] = [];
  let sel = 0;
  const entries = await loadIndex();
  const refresh = () => {
    const r = searchIndex(entries, input.value);
    rows = r.rows;
    sel = 0;
    paint(list, rows, sel, r.error);
  };
  const pick = () => {
    const e = rows[sel];
    if (!e) return;
    close();
    onPick(e);
  };

  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      sel = moveSel(sel, ev.key === "ArrowDown" ? 1 : -1, rows.length);
      highlight(list, sel);
    } else if (ev.key === "Enter") pick();
    else if (ev.key === "Escape") close();
  });
  list.addEventListener("mouseover", (ev) => {
    const row = (ev.target as HTMLElement).closest(".fd-row") as HTMLElement | null;
    if (!row) return;
    sel = Number(row.dataset.i);
    highlight(list, sel);
  });
  list.addEventListener("click", (ev) => {
    const row = (ev.target as HTMLElement).closest(".fd-row") as HTMLElement | null;
    if (!row) return;
    sel = Number(row.dataset.i);
    pick();
  });
  box.addEventListener("mousedown", (ev) => {
    if (ev.target === box) close(); // click outside the box
  });
  refresh();
  input.focus();
}

/**
 * Wire the composer's @ references onto one textarea.
 *
 * ```text
 * typing "... @clean_st" -> /@([^\s@]*)$/ on the text before the caret
 *   |                                       (a space, Esc or a pick ends it)
 *   v
 * menu under the caret's line, same rows as the palette
 *   |
 *   +-- Enter / Tab / click -> replace "@query" with "@<repo path> "
 *   +-- arrows              -> move the highlight, caret stays put
 * ```
 * The inserted reference is plain text, exactly like a Claude Code file
 * reference, so Backspace erases it character by character and the copied
 * prompt carries it verbatim.
 */
export function attachAtMenu(ta: HTMLTextAreaElement) {
  let menu: HTMLElement | null = null;
  let rows: IndexEntry[] = [];
  let sel = 0;
  let start = -1; // index of the "@" being completed

  const hide = () => {
    menu?.remove();
    menu = null;
    start = -1;
  };

  const show = (rowsIn: IndexEntry[], error: string | null) => {
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "fd-menu";
      document.body.appendChild(menu);
      menu.addEventListener("mousedown", (ev) => {
        const row = (ev.target as HTMLElement).closest(".fd-row") as HTMLElement | null;
        if (!row) return;
        ev.preventDefault(); // keep the textarea focused
        insert(rows[Number(row.dataset.i)]);
      });
    }
    rows = rowsIn;
    paint(menu, rows, sel, error);
    // stay attached to the textarea: one line height per line typed, clamped
    // to just under the box (caret geometry is not worth measuring exactly)
    const r = ta.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    const line = ta.value.slice(0, start).split("\n").length - 1;
    menu.style.left = `${r.left}px`;
    menu.style.width = `${r.width}px`;
    menu.style.top = `${Math.min(r.top + (line + 1) * lh + 6, r.bottom + 4)}px`;
  };

  const insert = (e: IndexEntry | undefined) => {
    if (!e) return;
    const at = ta.selectionStart ?? ta.value.length;
    ta.value = `${ta.value.slice(0, start)}@${e.path} ${ta.value.slice(at)}`;
    const caret = start + e.path.length + 2;
    hide();
    ta.focus();
    ta.selectionStart = ta.selectionEnd = caret;
  };

  ta.addEventListener("input", async () => {
    const before = ta.value.slice(0, ta.selectionStart ?? 0);
    const m = /@([^\s@]*)$/.exec(before);
    if (!m) return hide();
    start = m.index;
    sel = 0;
    const r = searchIndex(await loadIndex(), m[1]);
    show(r.rows, r.error);
  });

  ta.addEventListener("keydown", (ev) => {
    if (!menu) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); // the highlight moves, the caret does not
      sel = moveSel(sel, ev.key === "ArrowDown" ? 1 : -1, rows.length);
      highlight(menu, sel);
    } else if (ev.key === "Enter" || ev.key === "Tab") {
      ev.preventDefault();
      insert(rows[sel]);
    } else if (ev.key === "Escape") {
      ev.stopPropagation(); // closes the menu, not the composer
      hide();
    }
  });
  ta.addEventListener("blur", hide);
}
