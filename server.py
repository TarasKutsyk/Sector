"""Starmap server -- the Sector's map data + write layer, stdlib only.

The starmap UI (dist/index.html, built from src/) is a pure
renderer; this server is its only data source and its only hand that can
touch the repo. One parsing brain is shared with the validator:

```text
host Sector tree --(sector_adapter.py)--> build_tree()
                                             |
        GET /api/tree  <- scene JSON (slot branches, nodes, chains,
        |                  stranded clusters, satellites, core row)
        GET /api/index <- flat file list for the Ctrl+P palette and @ refs
        GET /api/file  <- markdown/text content for the reader panel
        GET /raw       <- image/pdf bytes (plots inline in the reader)
        POST /api/open        -> editor_cmd (VS Code / Windsurf)
        POST /api/submit-plan -> writes plans/<slug>_<date>.md draft stub
                                 + prepends it to the branch card live_docs
        GET/POST /api/config  -> host config + local overlay (slot picker)
```

Run: python tools/sector/server.py --repo . [--port 8377]
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STARMAP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(STARMAP_DIR))
import sector_adapter
from atlas import resolve_context_entry

DIST_DIR = STARMAP_DIR / "dist"

# No adapter loads at import time — main() and the tests install one through
# set_adapter(). Calling any tree/config function before that fails loudly.
ADAPTER = None
REPO = None
NOTES = None


def set_adapter(adapter: sector_adapter.SectorAdapter | None) -> None:
    """Install the host-repo adapter the whole module reads through."""
    global ADAPTER, REPO, NOTES
    ADAPTER = adapter
    REPO = adapter.repo if adapter else None
    NOTES = adapter.sector_root if adapter else None

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
        ".pdf": "application/pdf", ".html": "text/html", ".js": "text/javascript",
        ".css": "text/css", ".json": "application/json"}

# Plan step 2 "Open images, HTML and text appropriately; offer other formats as
# file links": the reader only ever renders these as characters. Everything
# else answers `{type: "binary"}` so the frontend routes by extension instead
# of pasting decoded bytes into the panel.
TEXT_EXTS = {".md", ".txt", ".tex", ".json", ".csv", ".log", ".yaml", ".yml",
             ".toml", ".cfg", ".ini", ".py", ".ts", ".tsx", ".js", ".mjs",
             ".jsx", ".css", ".sh", ".ps1", ".bat", ".sql", ".diff", ".patch"}
PAGE_EXTS = {".html", ".htm"}

# Plan step 2 "Every look_at artifact of a live report appears and opens": a
# declared folder expands to its light files only, and one planet never grows
# an unreadable swarm of them.
PROOF_MAX_BYTES = 5 * 1024 * 1024
SAT_CAP = 24

DATE_PATTERNS = [
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})"), lambda m: f"{m[1]}-{m[2]}-{m[3]}"),
    (re.compile(r"(\d{2})_(\d{2})_(\d{4})"), lambda m: f"{m[3]}-{m[2]}-{m[1]}"),
]


def load_config() -> dict:
    return ADAPTER.runtime_config()


def save_config(cfg: dict) -> None:
    ADAPTER.save_local_config(cfg)


def doc_date(path: Path, meta: dict) -> str:
    """Best-effort date: front-matter `date:` -> filename pattern -> file mtime."""
    if meta.get("date"):
        return str(meta["date"])
    for pattern, fmt in DATE_PATTERNS:
        m = pattern.search(path.name)
        if m:
            return fmt(m)
    return datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()


def doc_title(body: str, path: Path) -> str:
    """First H1 — skipping ALL-CAPS banner headings (some legacy docs open
    with a shouted rule like '# HARD RULE: ...', which is a rule, not a
    title). Falls back to the filename."""
    h1s = [l[2:].strip() for l in body.splitlines() if l.startswith("# ")]
    for t in h1s:
        if t and not t.isupper():
            return t
    return h1s[0] if h1s else path.stem.replace("_", " ")


def rel(path: Path) -> str:
    return path.relative_to(REPO).as_posix()


def satellite(path: str, **flags) -> dict:
    """One satellite row of a planet: a declared proof, a page, a run-dir file.

    Plan step 2 item 6 fixes the shape the frontend routes on, so the reader
    can pick a viewer without asking the server a second question:
    ```text
    ".../ui_reference/08_card_sheet.png"
      -> {path, name: "08_card_sheet.png", is_image: true, ext: "png",
          check_me: false, missing: false, is_page: false, provenance: false}
    ```
    args: path (repo-relative, posix), flags (any of the booleans above)
    returns: the satellite dict, with `ext` the lowercase suffix minus the dot
    """
    suffix = Path(path).suffix.lower()
    return {"path": path, "name": path.rsplit("/", 1)[-1],
            "is_image": suffix in IMAGE_EXTS, "check_me": False,
            "missing": False, "is_page": False, "provenance": False,
            "ext": suffix.lstrip("."), **flags}


def resolve_proof(entry: str, branch_dir: Path, doc_dir: Path) -> tuple[Path, bool] | None:
    """Find the file or folder one declared proof entry names.

    Plan step 2 "merge with nested card artifacts and deduplicate by resolved
    path": every proof list in this repo is written branch-relative by
    convention, but a doc-relative or repo-relative entry happens, so all three
    bases are tried in that fixed order.

    ```text
    "artifacts/ui_reference/"
      |
      +--> <branch>/artifacts/ui_reference/   exists? --> (that, True)
      +--> <doc dir>/artifacts/ui_reference/  exists? --> (that, True)
      +--> <repo>/artifacts/ui_reference/     exists? --> (that, True)
      +--> nothing exists -> (branch-relative candidate, False)   # missing: true
    ```
    Return: (path, exists), or None when the entry escapes the repo entirely.
    """
    for base in (branch_dir, doc_dir, REPO):
        cand = (base / entry).resolve()
        if cand.exists() and cand.is_relative_to(REPO):
            return cand, True
    declared = (branch_dir / entry).resolve()
    return (declared, False) if declared.is_relative_to(REPO) else None


def expand_proof(entry: str, branch_dir: Path, doc_dir: Path, node_ids: set) -> list[dict]:
    """One declared proof entry -> the satellites it stands for.

    A file is itself; a folder (`artifacts/polish_2026-09-08/`, how this host's
    legacy `proof_of_work` names its proofs) becomes its files, sorted by name,
    light and human-inspectable only; a path that is not on disk still becomes
    one satellite, flagged `missing`, because the plan asks for a visible
    missing-file indication rather than a silent drop.

    ```text
    entry --resolve_proof--> file      --> [satellite]
                         \\-> folder    --> [satellite per file, name order,
                         \\                 skipping >5 MB and .md files that
                         \\                 are drawn as planets themselves]
                         \\-> not found --> [satellite(missing=True)]
    ```
    args: entry (the declared string), branch_dir, doc_dir (the declaring doc's
          own folder), node_ids (repo-relative paths already drawn as planets)
    returns: list of satellite dicts, possibly empty
    """
    found = resolve_proof(entry, branch_dir, doc_dir)
    if found is None:
        return []
    path, exists = found
    if not exists:
        return [satellite(rel(path), missing=True)]
    if path.is_file():
        return [satellite(rel(path))]
    out = []
    for f in sorted(path.iterdir()):
        if not f.is_file() or f.stat().st_size > PROOF_MAX_BYTES:
            continue
        if f.suffix == ".md" and rel(f) in node_ids:
            continue
        out.append(satellite(rel(f)))
    return out


def attach_proofs(node: dict, branch_dir: Path, nested: list, check_me: set,
                  node_ids: set) -> None:
    """Give one planet every proof anyone declared for it, in one merged list.

    Plan step 2 "Every look_at artifact of a live report appears and opens".
    The map used to show only the artifacts the CARD nested under a report, so
    a report's own `look_at` and the legacy `proof_of_work` were invisible.
    Merge order fixes which declaration wins a duplicate, and the card's
    `check-me` marks whatever it names wherever it ended up:

    ```text
    the doc's own `page:`  (is_page, the report page next to its stub)
      + nested card artifacts
      + `look_at:`, else legacy `proof_of_work:`
      + `provenance:`                      (provenance: true, dimmer in the reader)
      + run-dir files found on disk
      |
      v
    dedupe by resolved repo-relative path, first declaration wins
      |
      v
    cap at 24 -> satellites_truncated: true when the cap fired
    ```
    args: node (mutated in place), branch_dir, nested (card-nested paths for
          this node), check_me (repo-relative paths from the card), node_ids
    returns: nothing; sets node["satellites"] and node["satellites_truncated"]
    """
    doc_dir = (REPO / node["id"]).parent
    declared = []
    if node["page"]:
        declared += [{**s, "is_page": True}
                     for s in expand_proof(str(node["page"]), branch_dir, doc_dir, node_ids)]
    declared += [satellite(p) for p in nested]
    for entry in node["look_at"]:
        declared += expand_proof(str(entry), branch_dir, doc_dir, node_ids)
    for entry in node["provenance"]:
        declared += [{**s, "provenance": True}
                     for s in expand_proof(str(entry), branch_dir, doc_dir, node_ids)]
    declared += node["satellites"]

    merged = {}
    for s in declared:
        s["check_me"] = s["path"] in check_me
        merged.setdefault(s["path"], s)
    sats = list(merged.values())
    node["satellites"] = sats[:SAT_CAP]
    node["satellites_truncated"] = len(sats) > SAT_CAP


def make_node(main_md: Path, branch_dir: Path, sub: str, satellites: list) -> dict:
    """One planet: a top-level doc, or a report run-dir collapsed onto its main md.

    kind falls back to the folder (plans/ -> plan, reports/ -> report) when the
    doc carries no front-matter; such docs are `stranded` and end up in the
    branch's faded cluster unless the card lists them as live.
    """
    meta, body = ADAPTER.parse_front_matter(main_md)
    return {
        "id": rel(main_md),
        "path": rel(main_md),
        "at_root": main_md.parent == branch_dir,  # sits next to the card on disk
        "kind": meta.get("kind") or ("plan" if sub == ADAPTER.plans_dir else "report"),
        "status": meta.get("status") or ("stranded" if not meta else "head"),
        "stamped": bool(meta),
        "date": doc_date(main_md, meta),
        "title": doc_title(body, main_md),
        # Plan step 2 "Resolve look_at from the report stub": the legacy
        # `proof_of_work:` carries the same meaning on older hosts and is read
        # only when `look_at:` is absent, so a doc never declares proofs twice.
        "look_at": meta.get("look_at") or meta.get("proof_of_work") or [],
        "provenance": meta.get("provenance") or [],
        "page": meta.get("page"),
        "supersedes": meta.get("supersedes"),
        "superseded_by": meta.get("superseded_by"),
        "plan": meta.get("plan"),
        "satellites": satellites,
        "satellites_truncated": False,
    }


def collect_nodes(branch_dir: Path) -> list:
    """All planets of a branch: top-level plans/reports mds + collapsed run-dirs.

    A reports/<subdir>/ becomes ONE node (its summary.md, else the last .md
    in name order — date-suffixed filenames make that the newest); every
    other file inside it becomes a satellite of that node.
    """
    nodes = []
    # Branch-root docs (legacy handovers, stamped version chains, adopted
    # READMEs) — everything except the card itself and INDEX.md.
    card = ADAPTER.find_card(branch_dir)
    for p in sorted(branch_dir.glob("*.md")):
        if p == card or p.name == "INDEX.md":
            continue
        nodes.append(make_node(p, branch_dir, ADAPTER.reports_dir, []))
    for sub in (ADAPTER.plans_dir, ADAPTER.reports_dir):
        d = branch_dir / sub
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.md")):
            nodes.append(make_node(p, branch_dir, sub, []))
        for rd in sorted(p for p in d.iterdir() if p.is_dir()):
            mds = sorted(rd.rglob("*.md"))
            if not mds:
                continue
            main = next((m for m in mds if m.name == "summary.md"), mds[-1])
            sats = [satellite(rel(f)) for f in sorted(rd.rglob("*"))
                    if f.is_file() and f != main]
            nodes.append(make_node(main, branch_dir, sub, sats))
    return nodes


def resolve_chain_edges(nodes: list, branch_dir: Path) -> None:
    """Rewrite supersedes/superseded_by values into node ids (or drop them).

    Stamp paths are branch-root-relative by convention, but doc-relative also
    occurs — accept both, exactly like `atlas.py check` does.
    """
    by_id = {n["id"]: n for n in nodes}

    def resolve(node, target):
        if not target:
            return None
        own_dir = (REPO / node["id"]).parent
        for base in (own_dir, branch_dir):
            cand = (base / str(target)).resolve()
            try:
                cid = cand.relative_to(REPO).as_posix()
            except ValueError:
                continue
            if cid in by_id:
                return cid
        return None

    for n in nodes:
        n["supersedes"] = resolve(n, n["supersedes"])
        n["superseded_by"] = resolve(n, n["superseded_by"])


def played_reports(branch: str) -> set:
    """Report paths referenced by any game file under the configured games dir."""
    played = set()
    branch_dir = ADAPTER.branch_dir(branch)
    gdir = ADAPTER.games_root / branch
    if not gdir.is_dir():
        return played
    doc_ref = ADAPTER.doc_ref_regex()
    for g in gdir.rglob("*.md"):
        meta, body = ADAPTER.parse_front_matter(g)
        src = meta.get("source_report")
        if src:
            played.add((branch_dir / str(src)).resolve())
        for line in body.splitlines():
            for m in doc_ref.finditer(line):
                token = m.group(0)
                for base in (REPO, branch_dir):
                    cand = (base / token).resolve()
                    if cand.exists():
                        played.add(cand)
    return {p.relative_to(REPO).as_posix() for p in played
            if p.is_relative_to(REPO)}


def build_branch(name: str) -> dict:
    """One star system: card front-matter + live/stamped planets + stranded cluster."""
    branch_dir = ADAPTER.branch_dir(name)
    card = ADAPTER.find_card(branch_dir)
    if card is None:
        return {"branch": name, "error": "no unique card"}
    meta, body = ADAPTER.parse_front_matter(card)
    nodes = collect_nodes(branch_dir)

    def resolve_live(d: str) -> str | None:
        """Branch-relative first, then repo-relative; None if outside the repo."""
        cand = (branch_dir / d).resolve()
        if not cand.exists():
            cand = (REPO / d).resolve()
        return cand.relative_to(REPO).as_posix() if cand.is_relative_to(REPO) else None

    # SHIP_TODOS T13 (4): live_docs is a tree. A report entry carries its
    # user-facing artifacts nested beneath it; they become that planet's
    # satellites. `check-me` names the ones still waiting for the owner's eyes.
    live, artifacts_of = set(), {}
    # Owner steer 2026-09-23: the composer expands a selected card into what
    # the card says to read -- live docs in card order, then the resolved
    # required_context -- the `atlas.py gist` read list minus its proofs.
    read_list = []
    for doc, arts in ADAPTER.live_doc_entries(meta):
        lid = resolve_live(doc)
        if lid is None:
            continue
        live.add(lid)
        artifacts_of[lid] = [a for a in map(resolve_live, arts) if a]
        read_list.append({"path": lid})
    for entry in meta.get("required_context") or []:
        target = resolve_context_entry(ADAPTER, entry)
        if target.is_relative_to(REPO):
            read_list.append({"path": target.relative_to(REPO).as_posix(), "required": str(entry)})
    check_me = {a for a in map(resolve_live, map(str, meta.get("check-me") or [])) if a}
    # Plan step 2 item 3 "HTML-page/stub pairs": when live_docs names a
    # report's page (`reviews/x.html`) and its Markdown stub sits next to it,
    # the PAGE is the planet and reads every field off the stub, so the stub's
    # proofs hang off the page. The stub is then not drawn as a second planet:
    # two planets for one report is the duplicate the owner notices first.
    for lid in sorted(live):
        page = REPO / lid
        stub = page.with_suffix(".md")
        if page.suffix.lower() not in PAGE_EXTS or not page.exists() or not stub.exists():
            continue
        node = make_node(stub, branch_dir, ADAPTER.reports_dir, [])
        node["id"] = node["path"] = lid
        node["page"] = None  # this planet IS the page; no page satellite
        nodes = [n for n in nodes if n["id"] != rel(stub)]
        nodes.append(node)
    resolve_chain_edges(nodes, branch_dir)
    # Guarantee every live_docs target renders, wherever it lives (nested dirs
    # like latex/main.tex, non-md files): synthesize a node if none matched.
    have = {n["id"] for n in nodes}
    for lid in sorted(live - have):
        p = REPO / lid
        if not p.exists():
            continue
        if p.suffix == ".md":
            nodes.append(make_node(p, branch_dir, ADAPTER.reports_dir, []))
        else:
            nodes.append({"id": lid, "path": lid, "at_root": False,
                          "kind": "file", "status": "head", "stamped": False,
                          "date": doc_date(p, {}), "title": p.name,
                          "look_at": [], "provenance": [], "page": None,
                          "supersedes": None, "superseded_by": None,
                          "plan": None, "satellites": [],
                          "satellites_truncated": False})
    played = played_reports(name)
    node_ids = {n["id"] for n in nodes}
    for n in nodes:
        n["live"] = n["id"] in live
        n["played"] = n["id"] in played
        attach_proofs(n, branch_dir, artifacts_of.get(n["id"], []), check_me, node_ids)

    shown = [n for n in nodes if n["stamped"] or n["live"]]
    stranded = [n for n in nodes if not (n["stamped"] or n["live"])]
    return {
        "branch": name,
        "card": {
            "path": rel(card),
            "title": meta.get("title", name),
            "status": meta.get("status", "unknown"),
            "updated": str(meta.get("updated", "")),
            "check_me": sorted(check_me),
            "required_context": meta.get("required_context") or [],
            "depends_on": meta.get("depends_on") or [],
            "read_list": read_list,
        },
        "nodes": shown,
        "cluster": {
            "count": len(stranded),
            "items": [{"id": n["id"], "title": n["title"], "date": n["date"],
                       "kind": n["kind"]} for n in
                      sorted(stranded, key=lambda n: n["date"], reverse=True)],
        },
    }


def build_core() -> list:
    """The always-active context row: one entry per pack, variants as nodes."""
    core = []
    core_dir = ADAPTER.context_root
    if not core_dir.is_dir():
        return core
    for pack_dir in sorted(p for p in core_dir.iterdir() if p.is_dir()):
        variants = []
        for f in sorted(pack_dir.glob("*.md")):
            meta, body = ADAPTER.parse_front_matter(f)
            variants.append({"id": rel(f), "path": rel(f), "name": f.stem,
                             "is_index": f.name == "INDEX.md",
                             "title": doc_title(body, f)})
        core.append({"pack": pack_dir.name,
                    "color": ADAPTER.context_color(pack_dir.name),
                    "variants": variants})
    return core


def all_card_branches() -> list:
    names = []
    for d in ADAPTER.branch_dirs():
        card = ADAPTER.find_card(d)
        if card is not None:
            names.append(d.name)
    return names


def build_tree(cfg: dict) -> dict:
    available = all_card_branches()
    slots = [b for b in cfg.get("branch_slots", []) if b in available]
    slots = slots[: cfg.get("max_branch_slots", 6)]
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "slots": slots,
        "branches": [build_branch(b) for b in slots],
        "all_branches": available,
        "core": build_core(),
        # Plan step 4 "Persistence": `layout` rides along as personal overlay
        # state (path -> [dx, dy] from the parent anchor), defaulting to {}.
        # Owner minibatch 6: `layout_style`, `arc_max_nodes` and `core_slots`
        # ride along the same way, so the Layout window reads the merged config
        # and writes it back through POST /api/config.
        "config": {k: cfg[k] for k in
                   ("default_selected", "max_branch_slots", "handover_template",
                    "game_prompt_template", "layout", "layout_style",
                    "arc_max_nodes", "core_slots") if k in cfg},
    }


# Plan step 1 "Find and open anything": the palette indexes the whole Sector
# tree, not just the drawn planets, so an inactive branch's artifact is
# findable. Build output and caches are never interesting to search.
INDEX_SKIP_DIRS = {"node_modules", "__pycache__"}
INDEX_MAX_BYTES = 5 * 1024 * 1024


def index_files(root: Path) -> list:
    """Every indexable file under one root: no dotfiles, no caches, nothing huge.

    ```text
    root/**/*  --> file?           no --> skip
               --> any path segment dotted or in INDEX_SKIP_DIRS --> skip
               --> size > 5 MB     --> skip
               --> keep
    ```
    Return: sorted list of Paths.
    """
    out = []
    for p in sorted(root.rglob("*")):
        parts = p.relative_to(root).parts
        if any(s.startswith(".") or s in INDEX_SKIP_DIRS for s in parts):
            continue
        if p.is_file() and p.stat().st_size <= INDEX_MAX_BYTES:
            out.append(p)
    return out


def index_kind(p: Path, branch_dir: Path, card: Path | None) -> str:
    """Palette kind tag for one file, read off its folder.
    args: p (the file), branch_dir (its branch root), card (that branch's card)
    returns: "card" | "plan" | "report" | "artifact" | "file"
    """
    if p == card:
        return "card"
    top = p.relative_to(branch_dir).parts[0]
    return {ADAPTER.plans_dir: "plan", ADAPTER.reports_dir: "report",
            ADAPTER.artifacts_dir: "artifact"}.get(top, "file")


def index_entry(p: Path, branch: str, kind: str) -> dict:
    """One palette row.
    args: p (the file), branch (branch name, or "core"), kind (index_kind tag)
    returns: {path, name, branch, kind, date}. The date comes from front-matter for
             markdown, else the filename date pattern, else mtime (doc_date)
    """
    meta = ADAPTER.parse_front_matter(p)[0] if p.suffix == ".md" else {}
    return {"path": rel(p), "name": p.name, "branch": branch,
            "kind": kind, "date": doc_date(p, meta)}


def build_index() -> list:
    """Flat searchable list of every Sector file: all branches (active or not)
    plus the context packs. Newest first, ties by path, which is exactly what
    the palette shows for an empty query. The games dir is never indexed: it
    holds planted errors, not project evidence.
    """
    entries = []
    for branch_dir in ADAPTER.branch_dirs():
        card = ADAPTER.find_card(branch_dir)
        for p in index_files(branch_dir):
            entries.append(index_entry(p, branch_dir.name,
                                       index_kind(p, branch_dir, card)))
    if ADAPTER.context_root.is_dir():
        for p in index_files(ADAPTER.context_root):
            entries.append(index_entry(p, "core", "core"))
    entries.sort(key=lambda e: e["path"])
    entries.sort(key=lambda e: e["date"], reverse=True)
    return entries


def submit_plan(cfg: dict, payload: dict) -> dict:
    """Write the draft plan stub and register it on the branch card.

    ```text
    payload {branch, slug, task, to_read: [{path,title,date}], context_packs: [..]}
      |
      +--> <sector>/<branch>/<plans>/<slug>_<today>.md   (from plan_stub_template;
      |      carries the OVERWRITE-with-real-plan agent instruction)
      +--> card live_docs: prepend "plans/<file>" + bump `updated:`
      v
    {plan_path, implement_line}
    ```
    """
    branch = sector_adapter.slugify(payload["branch"])
    slug = sector_adapter.slugify(payload["slug"])
    if not slug or not branch:
        raise ValueError("empty slug or branch")
    branch_dir = ADAPTER.branch_dir(branch)
    # Seed placed in empty space -> a brand-new branch: create the folder and
    # a minimal forming card (mirrors adopt-on-touch; keeps validation green).
    if payload.get("new_branch") and ADAPTER.find_card(branch_dir) is None:
        branch_dir.mkdir(parents=True, exist_ok=True)
        card_path = ADAPTER.new_card_path(branch_dir, branch)
        if not card_path.exists():
            card_path.write_text(
                ADAPTER.new_card_text(branch, date.today().isoformat()),
                encoding="utf-8",
            )
    card = ADAPTER.find_card(branch_dir)
    if card is None:
        raise ValueError(f"no unique card for branch {branch}")

    fname = f"{slug}_{date.today().isoformat()}.md"
    plan_path = ADAPTER.plan_path(branch_dir, fname)
    if plan_path.exists():
        raise ValueError(f"already exists: {rel(plan_path)}")

    to_read = "\n".join(f"{i}. {item['path']} — {item.get('title', '')}".rstrip(" —")
                        for i, item in enumerate(payload.get("to_read", []), 1))
    stub = cfg["plan_stub_template"].format(
        DATE=date.today().isoformat(),
        REQUIRED_CONTEXT=json.dumps(payload.get("context_packs", [])),
        TO_READ=payload.get("to_read_text") or to_read or "(none selected)",
        TASK=payload.get("task", "").strip(),
    )
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    plan_path.write_text(stub, encoding="utf-8")

    # Card update: textual, format-preserving — insert right after `live_docs:`
    # and bump `updated:`. The card is rewritten in place per the workflow.
    text = card.read_text(encoding="utf-8")
    live_ref = ADAPTER.live_doc_ref(fname)
    if re.search(r"^live_docs:\s*$", text, flags=re.M):
        text = re.sub(r"^live_docs:\s*$", f"live_docs:\n  - {live_ref}",
                      text, count=1, flags=re.M)
    else:  # live_docs: []  (empty inline list)
        text = re.sub(r"^live_docs:.*$", f"live_docs:\n  - {live_ref}",
                      text, count=1, flags=re.M)
    text = re.sub(r"^updated:.*$", f"updated: {date.today().isoformat()}",
                  text, count=1, flags=re.M)
    card.write_text(text, encoding="utf-8")

    return {"plan_path": rel(plan_path),
            "implement_line": f"Implement {rel(plan_path)}"}


VSCODE_FALLBACKS = (r"%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd",
                    r"%ProgramFiles%\Microsoft VS Code\bin\code.cmd")
EDITOR_MISSING = ("VS Code not found: put `code` on PATH or set editor_cmd in "
                  "sector-map.config.json")


def resolve_editor(cmd: str) -> str | None:
    """Find the editor executable `editor_cmd[0]` names.

    Plan step 1 "Open-in-editor launches the configured editor on the exact
    file and shows actionable failures". The old code shelled out blind, so a
    server whose PATH has no `code` reported success while nothing opened.

    ```text
    editor_cmd[0]
      |
      v
    shutil.which() -------------found------> that absolute path
      |not found
      +-- bare "code" -> %LOCALAPPDATA%\\Programs\\Microsoft VS Code\\bin\\code.cmd
      |                  %ProgramFiles%\\Microsoft VS Code\\bin\\code.cmd
      +-- anything else (a deliberate override) -> None, no guessing
    ```
    Return: absolute executable path, or None when nothing was found.
    """
    exe = shutil.which(cmd)
    if exe or cmd != "code":
        return exe
    for pattern in VSCODE_FALLBACKS:
        cand = Path(os.path.expandvars(pattern))
        if cand.exists():
            return str(cand)
    return None


def open_in_editor(cfg: dict, path: str) -> dict:
    """Launch the editor on one repo file and say whether it could start.

    The file path travels as its own argv entry (no shell, no re-quoting), so
    `Report (final).pdf` arrives intact. `-g` from editor_cmd
    keeps VS Code's goto behaviour.
    args: cfg (runtime config, for editor_cmd), path (repo-relative)
    returns: {ok: True} | {ok: False, error: EDITOR_MISSING}
    """
    target = safe_repo_path(path)
    exe = resolve_editor(cfg["editor_cmd"][0])
    if exe is None:
        return {"ok": False, "error": EDITOR_MISSING}
    args = [a.replace("{path}", str(target)) for a in cfg["editor_cmd"][1:]]
    if "{path}" not in "".join(cfg["editor_cmd"]):
        args.append(str(target))
    subprocess.Popen([exe, *args])
    return {"ok": True}


def safe_repo_path(path: str) -> Path:
    """Resolve a repo-relative path and refuse anything escaping the repo."""
    return ADAPTER.resolve_repo_path(path)


def read_file(path: str) -> dict:
    """What the reader panel needs to show one file, by kind rather than by luck.

    Plan step 2: a PDF or a PNG used to come back as decoded bytes and land in
    the panel as mojibake. Now only real text carries `content`; a page says so
    (the reader gives it an iframe) and anything else is `binary`, which the
    frontend opens through /raw or hands to the editor.

    ```text
    .md               -> {type: "markdown", content}
    .html .htm        -> {type: "html", content}      # rendered in an iframe
    TEXT_EXTS         -> {type: "text", content}
    anything else     -> {type: "binary", path, size}
    ```
    args: path (repo-relative)
    returns: one of the four shapes above, always carrying `path`
    """
    target = safe_repo_path(path)
    suffix = target.suffix.lower()
    if suffix in PAGE_EXTS:
        kind = "html"
    elif suffix == ".md":
        kind = "markdown"
    elif suffix in TEXT_EXTS:
        kind = "text"
    else:
        return {"path": path, "type": "binary", "size": target.stat().st_size}
    return {"path": path, "type": kind,
            "content": target.read_text(encoding="utf-8", errors="replace")}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        pass

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _bytes(self, data: bytes, ctype: str):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        # A rebuilt dist/index.html must show on a plain refresh, never a cached copy.
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        try:
            if url.path == "/api/tree":
                self._json(build_tree(load_config()))
            elif url.path == "/api/index":
                self._json(build_index())
            elif url.path == "/api/config":
                self._json(load_config())
            elif url.path == "/api/file":
                self._json(read_file(q["path"][0]))
            elif url.path == "/raw":
                target = safe_repo_path(q["path"][0])
                ctype = MIME.get(target.suffix.lower(), "application/octet-stream")
                self._bytes(target.read_bytes(), ctype)
            else:  # static frontend from dist/
                name = "index.html" if url.path == "/" else url.path.lstrip("/")
                f = (DIST_DIR / name)
                if f.is_file() and f.resolve().is_relative_to(DIST_DIR):
                    self._bytes(f.read_bytes(),
                                MIME.get(f.suffix.lower(), "text/html"))
                else:
                    self._json({"error": "not found (build the frontend: "
                                "cd tools/sector && npm install && npm run build)"},
                               404)
        except Exception as e:  # surface, don't crash the server
            self._json({"error": str(e)}, 400)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/open":
                self._json(open_in_editor(load_config(), payload["path"]))
            elif self.path == "/api/submit-plan":
                self._json(submit_plan(load_config(), payload))
            elif self.path == "/api/config":
                cfg = load_config()
                cfg.update(payload)
                save_config(cfg)
                self._json(cfg)
            else:
                self._json({"error": "unknown endpoint"}, 404)
        except Exception as e:
            self._json({"error": str(e)}, 400)


def main(argv):
    repo = Path.cwd()
    config_path = None
    if "--repo" in argv:
        repo = Path(argv[argv.index("--repo") + 1])
    if "--config" in argv:
        config_path = Path(argv[argv.index("--config") + 1])
    set_adapter(sector_adapter.load_adapter(
        repo=repo, starmap_dir=STARMAP_DIR, config_path=config_path))
    port = load_config().get("port", 8377)
    if "--port" in argv:
        port = int(argv[argv.index("--port") + 1])
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"starmap: http://localhost:{port}  (repo: {REPO})")
    server.serve_forever()


if __name__ == "__main__":
    main(sys.argv[1:])
