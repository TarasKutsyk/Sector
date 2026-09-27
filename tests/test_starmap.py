"""Tests for server.py -- the starmap's data + write layer.

Build a tiny fake Sector tree in a temp dir, point the server module's adapter
at it, and check the
contracts the UI depends on: tree building (chains, run-dir collapsing,
stranded clustering, live/played flags, core row), submit-plan writes, and the
path-escape guard.

Runnable both ways (from the starmap package dir):
    python -m pytest tests/test_starmap.py
    python tests/test_starmap.py
"""

import json
import importlib.util
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import sector_adapter  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "starmap_server", ROOT / "server.py")
srv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(srv)


CARD = """---
branch: demo
title: "Demo branch"
status: active
updated: 2026-07-01
depends_on: []
required_context: [env]
live_docs:
  - plans/current_plan.md
  - reports/head_v2.md:
      - reports/rundir/fig.png
  - reports/rundir/summary.md
check-me: [reports/rundir/fig.png]
---
## Now
state
"""

PLAN = """---
kind: plan
date: 2026-06-30
status: head
supersedes: null
superseded_by: null
---
# Current plan
"""

HEAD_V2 = """---
kind: report
date: 2026-07-01
status: head
supersedes: head_v1.md
superseded_by: null
look_at: [reports/rundir/fig.png]
---
# Head report v2
"""

HEAD_V1 = """---
kind: report
date: 2026-06-20
status: superseded
supersedes: null
superseded_by: head_v2.md
---
# Head report v1
"""

GAME = """---
game: sabotage
source_report: reports/head_v2.md
---
sealed stuff
"""

CFG = {
    "max_branch_slots": 6,
    "branch_slots": ["demo", "ghost_branch"],
    "plan_stub_template": ("---\nkind: plan\ndate: {DATE}\nstatus: draft\n"
                           "required_context: {REQUIRED_CONTEXT}\n---\n"
                           "## TO-READ (in order)\n{TO_READ}\n\n## Task\n{TASK}\n"),
}


def write_config(root: Path, config: dict | None = None) -> Path:
    path = root / "sector-map.config.json"
    path.write_text(json.dumps(config or {"preset": "research_notes"}, indent=2),
                    encoding="utf-8")
    return path


def make_tree(root: Path) -> Path:
    notes = root / "notes"
    (notes / "demo" / "plans").mkdir(parents=True)
    (notes / "demo" / "reports" / "rundir").mkdir(parents=True)
    (notes / "demo" / "DEMO.md").write_text(CARD, encoding="utf-8")
    (notes / "demo" / "plans" / "current_plan.md").write_text(PLAN, encoding="utf-8")
    (notes / "demo" / "reports" / "head_v2.md").write_text(HEAD_V2, encoding="utf-8")
    (notes / "demo" / "reports" / "head_v1.md").write_text(HEAD_V1, encoding="utf-8")
    (notes / "demo" / "reports" / "stray_2026-01-05.md").write_text(
        "# Old stray note\n", encoding="utf-8")
    (notes / "demo" / "reports" / "rundir" / "summary.md").write_text(
        "# Run summary\n", encoding="utf-8")
    (notes / "demo" / "reports" / "rundir" / "fig.png").write_bytes(b"png")
    (notes / "core" / "env").mkdir(parents=True)
    (notes / "core" / "env" / "INDEX.md").write_text("# Env index\n", encoding="utf-8")
    (notes / "core" / "env" / "env_main.md").write_text("# Env main\n", encoding="utf-8")
    (notes / "_games" / "demo").mkdir(parents=True)
    (notes / "_games" / "demo" / "game1.md").write_text(GAME, encoding="utf-8")
    write_config(root)
    return notes


def with_tree(fn, config: dict | None = None):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()  # expand Windows 8.3 short temp-dir paths
        notes = make_tree(root)
        if config is not None:
            write_config(root, config)
        old = srv.ADAPTER
        srv.set_adapter(sector_adapter.load_adapter(
            repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json"))
        try:
            fn(root, notes)
        finally:
            srv.set_adapter(old)


def _demo(tree):
    return next(b for b in tree["branches"] if b["branch"] == "demo")


def sat(path: str, **flags) -> dict:
    """The expected satellite dict for one path, written out key by key.

    Spelled here rather than borrowed from the server so a change to the
    contract the frontend routes on (plan step 2 item 6) fails a test instead
    of quietly agreeing with itself.
    args: path (repo-relative), flags (overrides: is_image, check_me, missing,
          is_page, provenance)
    returns: {path, name, is_image, check_me, missing, is_page, provenance, ext}
    """
    ext = path.rsplit(".", 1)[-1] if "." in path.rsplit("/", 1)[-1] else ""
    return {"path": path, "name": path.rsplit("/", 1)[-1],
            "is_image": ext in ("png", "jpg", "jpeg", "gif", "svg", "webp"),
            "check_me": False, "missing": False, "is_page": False,
            "provenance": False, "ext": ext, **flags}


def test_tree_slots_and_card():
    """Ghost slots are dropped; card metadata (check-me, live_docs) surfaces."""
    def body(root, notes):
        tree = srv.build_tree(CFG)
        assert tree["slots"] == ["demo"]
        assert tree["all_branches"] == ["demo"]
        d = _demo(tree)
        assert d["card"]["check_me"] == ["notes/demo/reports/rundir/fig.png"]
        assert d["card"]["title"] == "Demo branch"
    with_tree(body)


def test_nodes_chain_cluster_satellites_played():
    """The load-bearing scene facts: chain edges resolve to node ids, the
    run-dir collapses to one node with satellites, the stray doc lands in the
    stranded cluster, live/played flags are set, and a report's nested
    live_docs artifacts ride as its satellites with the check-me mark."""
    def body(root, notes):
        d = _demo(srv.build_tree(CFG))
        by_id = {n["id"]: n for n in d["nodes"]}
        v2 = by_id["notes/demo/reports/head_v2.md"]
        assert v2["supersedes"] == "notes/demo/reports/head_v1.md"
        assert v2["live"] and v2["played"]
        assert v2["satellites"] == [sat("notes/demo/reports/rundir/fig.png", check_me=True)]
        v1 = by_id["notes/demo/reports/head_v1.md"]
        assert v1["superseded_by"] == "notes/demo/reports/head_v2.md"
        run = by_id["notes/demo/reports/rundir/summary.md"]
        assert run["live"] and run["status"] == "stranded"  # live via card, no fm
        # check-me is a card-level fact about a FILE, so it marks that file on
        # every planet it hangs off, not only where the card nested it.
        assert run["satellites"] == [sat("notes/demo/reports/rundir/fig.png", check_me=True)]
        assert not run["at_root"] and not v2["at_root"]  # subfolder docs
        assert d["cluster"]["count"] == 1
        assert d["cluster"]["items"][0]["id"] == "notes/demo/reports/stray_2026-01-05.md"
        assert d["cluster"]["items"][0]["date"] == "2026-01-05"
    with_tree(body)


# ---------------- plan step 2: proofs merged from every declaration ----------

def card_text(live_docs: str, check_me: str = "[]") -> str:
    """The demo card with a custom live_docs block.
    args: live_docs (the indented YAML list body), check_me (inline YAML list)
    returns: the full card text
    """
    return ('---\nbranch: demo\ntitle: "Demo branch"\nstatus: active\n'
            "updated: 2026-07-01\ndepends_on: []\nrequired_context: [env]\n"
            f"live_docs:\n{live_docs}check-me: {check_me}\n---\n## Now\nstate\n")


def doc_text(front: str) -> str:
    """A stamped report carrying the given extra front-matter lines."""
    return f"---\nkind: report\ndate: 2026-07-02\nstatus: head\n{front}---\n# A report\n"


def proofs_of(notes: Path, card_live: str, docs: dict, check_me: str = "[]") -> dict:
    """Rewrite the demo card and its docs, build the branch, read the proofs back.

    Every plan step 2 proof case is the same experiment: declare proofs one
    way, build the branch, assert the satellite list of the planet.
    args: notes (sector root), card_live (live_docs body), docs ({branch-relative
          path: text}), check_me (the card's check-me list)
    returns: {node id: satellite list} plus "__ids" (every node id) and
             "__nodes" ({node id: the whole node})
    """
    (notes / "demo" / "DEMO.md").write_text(card_text(card_live, check_me), encoding="utf-8")
    for relpath, text in docs.items():
        target = notes / "demo" / relpath
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    branch = srv.build_branch("demo")
    out = {n["id"]: n["satellites"] for n in branch["nodes"]}
    out["__ids"] = [n["id"] for n in branch["nodes"]]
    out["__nodes"] = {n["id"]: n for n in branch["nodes"]}
    return out


def test_proofs_from_look_at_only():
    """A report whose proofs live only in its own look_at: the card nests
    nothing, and the satellite still appears."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        got = proofs_of(notes, "  - reports/look_only.md\n",
                        {"reports/look_only.md": doc_text("look_at: [artifacts/fig_a.png]\n")})
        assert got["notes/demo/reports/look_only.md"] == [sat("notes/demo/artifacts/fig_a.png")]
    with_tree(body)


def test_proofs_from_nested_card_entry_only():
    """The pre-existing path: the card nests an artifact under a report that
    declares nothing itself."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        got = proofs_of(notes,
                        "  - reports/nested_only.md:\n      - artifacts/fig_a.png\n",
                        {"reports/nested_only.md": doc_text("")},
                        check_me="[artifacts/fig_a.png]")
        assert got["notes/demo/reports/nested_only.md"] == [
            sat("notes/demo/artifacts/fig_a.png", check_me=True)]
    with_tree(body)


def test_proof_declared_twice_is_one_satellite():
    """Card-nested AND look_at name the same file: one satellite, deduplicated
    by resolved path, with the card's check-me mark surviving the merge."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        got = proofs_of(notes,
                        "  - reports/both.md:\n      - artifacts/fig_a.png\n",
                        {"reports/both.md": doc_text("look_at: [artifacts/fig_a.png]\n")},
                        check_me="[artifacts/fig_a.png]")
        assert got["notes/demo/reports/both.md"] == [
            sat("notes/demo/artifacts/fig_a.png", check_me=True)]
    with_tree(body)


def test_html_page_takes_the_planet_and_its_stub_is_not_drawn():
    """live_docs names reports/paged.html with reports/paged.md next to it: the
    page is the planet, it wears the stub's fields and proofs, and the stub is
    not drawn a second time."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        got = proofs_of(notes, "  - reports/paged.html\n",
                        {"reports/paged.html": "<h1>the page</h1>\n",
                         "reports/paged.md": doc_text("look_at: [artifacts/fig_a.png]\n")})
        page = "notes/demo/reports/paged.html"
        assert got[page] == [sat("notes/demo/artifacts/fig_a.png")]
        assert "notes/demo/reports/paged.md" not in got["__ids"]
        node = got["__nodes"][page]
        assert (node["kind"], node["date"], node["stamped"]) == ("report", "2026-07-02", True)
    with_tree(body)


def test_stub_planet_carries_its_page_as_first_satellite():
    """The reverse case, which is this repo's real shape: live_docs names the
    stub, so the stub stays the planet, its page: leads the satellite list
    marked is_page, and provenance entries follow flagged as provenance."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        (notes / "demo" / "artifacts" / "run.txt").write_text("log", encoding="utf-8")
        got = proofs_of(notes, "  - reports/paged.md\n",
                        {"reports/paged.html": "<h1>the page</h1>\n",
                         "reports/paged.md": doc_text(
                             "page: reports/paged.html\n"
                             "look_at: [artifacts/fig_a.png]\n"
                             "provenance: [artifacts/run.txt]\n")})
        assert got["notes/demo/reports/paged.md"] == [
            sat("notes/demo/reports/paged.html", is_page=True),
            sat("notes/demo/artifacts/fig_a.png"),
            sat("notes/demo/artifacts/run.txt", provenance=True),
        ]
    with_tree(body)


def test_directory_proof_expands_to_light_files_and_caps():
    """A folder entry, how this host's legacy proofs are written, expands to
    its files in name order, skips anything over 5 MB, skips .md files that are
    planets in their own right, and reports the 24-satellite cap."""
    def body(root, notes):
        shots = notes / "demo" / "artifacts" / "shots"
        shots.mkdir(parents=True)
        for i in range(26):
            (shots / f"{i:02d}_shot.png").write_bytes(b"png")
        (shots / "huge.bin").write_bytes(b"0" * (srv.PROOF_MAX_BYTES + 1))
        got = proofs_of(notes, "  - reports/folder.md\n",
                        {"reports/folder.md": doc_text("look_at: [artifacts/shots/]\n")})
        sats = got["notes/demo/reports/folder.md"]
        assert len(sats) == srv.SAT_CAP
        assert got["__nodes"]["notes/demo/reports/folder.md"]["satellites_truncated"]
        assert [s["name"] for s in sats[:3]] == ["00_shot.png", "01_shot.png", "02_shot.png"]
        assert not any(s["name"] == "huge.bin" for s in sats)
        # A folder holding docs that are planets themselves contributes none of them.
        got = proofs_of(notes, "  - reports/folder.md\n",
                        {"reports/folder.md": doc_text("look_at: [reports/]\n")})
        assert got["notes/demo/reports/folder.md"] == []
    with_tree(body)


def test_missing_proof_is_still_a_satellite():
    """A declared proof that is not on disk is never dropped: it rides as a
    satellite flagged missing, which is what the map draws hollow."""
    def body(root, notes):
        got = proofs_of(notes, "  - reports/gone.md\n",
                        {"reports/gone.md": doc_text("look_at: [artifacts/nope.png]\n")})
        assert got["notes/demo/reports/gone.md"] == [
            sat("notes/demo/artifacts/nope.png", missing=True)]
    with_tree(body)


def test_legacy_proof_of_work_field_is_read_when_look_at_is_absent():
    """Older reports in this repo declare their proofs as proof_of_work. Same
    semantics, and look_at wins when a doc carries both."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"png")
        (notes / "demo" / "artifacts" / "fig_b.png").write_bytes(b"png")
        got = proofs_of(notes, "  - reports/legacy.md\n",
                        {"reports/legacy.md": doc_text("proof_of_work: [artifacts/fig_a.png]\n")})
        assert got["notes/demo/reports/legacy.md"] == [sat("notes/demo/artifacts/fig_a.png")]
        got = proofs_of(notes, "  - reports/legacy.md\n",
                        {"reports/legacy.md": doc_text(
                            "look_at: [artifacts/fig_b.png]\n"
                            "proof_of_work: [artifacts/fig_a.png]\n")})
        assert got["notes/demo/reports/legacy.md"] == [sat("notes/demo/artifacts/fig_b.png")]
    with_tree(body)


def test_api_file_types_by_suffix():
    """The reader routes on `type`: markdown, a page for the iframe, plain
    text, and binary for everything else instead of decoded bytes as text."""
    def body(root, notes):
        (notes / "demo" / "artifacts").mkdir(parents=True, exist_ok=True)
        (notes / "demo" / "artifacts" / "fig_a.png").write_bytes(b"\x89PNG binary")
        (notes / "demo" / "artifacts" / "run.txt").write_text("log", encoding="utf-8")
        (notes / "demo" / "reports" / "paged.html").write_text("<h1>p</h1>", encoding="utf-8")
        assert srv.read_file("notes/demo/DEMO.md")["type"] == "markdown"
        assert srv.read_file("notes/demo/reports/paged.html")["type"] == "html"
        assert srv.read_file("notes/demo/artifacts/run.txt") == {
            "path": "notes/demo/artifacts/run.txt", "type": "text", "content": "log"}
        binary = srv.read_file("notes/demo/artifacts/fig_a.png")
        assert binary["type"] == "binary" and binary["size"] == 11 and "content" not in binary
    with_tree(body)


def test_core_row():
    def body(root, notes):
        core = srv.build_core()
        assert len(core) == 1 and core[0]["pack"] == "env"
        names = {v["name"]: v["is_index"] for v in core[0]["variants"]}
        assert names == {"INDEX": True, "env_main": False}
    with_tree(body)


def test_submit_plan_writes_stub_and_updates_card():
    """Submit-plan writes the draft stub, prepends it to live_docs, bumps
    `updated:`, and refuses a duplicate slug on the same day."""
    def body(root, notes):
        payload = {"branch": "demo", "slug": "Gemma Transfer!",
                   "task": "port it",
                   "to_read": [{"path": "notes/core/env/env_main.md",
                                "title": "Env main"}],
                   "context_packs": ["env"]}
        out = srv.submit_plan(CFG, payload)
        plan = root / out["plan_path"]
        assert plan.exists() and out["implement_line"].startswith("Implement notes/demo/plans/gemma_transfer_")
        text = plan.read_text(encoding="utf-8")
        assert "status: draft" in text and "port it" in text
        assert "1. notes/core/env/env_main.md — Env main" in text
        card = (notes / "demo" / "DEMO.md").read_text(encoding="utf-8")
        assert card.splitlines()[card.splitlines().index("live_docs:") + 1].strip() \
            == f"- plans/{plan.name}"
        assert "updated: 2026-07-01" not in card
        try:
            srv.submit_plan(CFG, payload)
            raise AssertionError("duplicate slug not refused")
        except ValueError:
            pass
    with_tree(body)


def test_submit_plan_creates_new_branch():
    """A seed placed in empty space births a branch: folder + minimal forming
    card, then the plan stub lands in it and registers on the new card."""
    def body(root, notes):
        out = srv.submit_plan(CFG, {"branch": "Fresh Idea", "slug": "first_probe",
                                    "task": "explore", "to_read": [],
                                    "context_packs": [], "new_branch": True})
        card = notes / "fresh_idea" / "FRESH_IDEA.md"
        assert card.exists()
        text = card.read_text(encoding="utf-8")
        assert "status: forming" in text
        assert (root / out["plan_path"]).exists()
        assert text.splitlines()[text.splitlines().index("live_docs:") + 1].strip() \
            .startswith("- plans/first_probe_")
        assert "fresh_idea" in srv.all_card_branches()
    with_tree(body)


def test_index_covers_inactive_branches_core_and_artifacts():
    """The Ctrl+P index reaches everything the map does not draw: a branch with
    no slot, a context pack file, an artifact. The games dir stays out of it."""
    def body(root, notes):
        (notes / "attic" / "artifacts").mkdir(parents=True)
        (notes / "attic" / "ATTIC.md").write_text(CARD, encoding="utf-8")
        (notes / "attic" / "artifacts" / "proof_2026-05-04.txt").write_text(
            "evidence", encoding="utf-8")
        by_path = {e["path"]: e for e in srv.build_index()}
        assert by_path["notes/attic/ATTIC.md"]["kind"] == "card"
        assert by_path["notes/attic/ATTIC.md"]["branch"] == "attic"
        art = by_path["notes/attic/artifacts/proof_2026-05-04.txt"]
        assert (art["kind"], art["date"], art["name"]) == (
            "artifact", "2026-05-04", "proof_2026-05-04.txt")
        core = by_path["notes/core/env/env_main.md"]
        assert (core["kind"], core["branch"]) == ("core", "core")
        assert by_path["notes/demo/plans/current_plan.md"]["kind"] == "plan"
        # front-matter date wins for markdown, filename pattern for the rest
        assert by_path["notes/demo/reports/head_v2.md"]["date"] == "2026-07-01"
        assert "notes/_games/demo/game1.md" not in by_path
        dates = [e["date"] for e in srv.build_index()]
        assert dates == sorted(dates, reverse=True)  # newest first for an empty query
    with_tree(body)


def test_open_in_editor_resolution_and_error_shape():
    """Editor launching is resolved before it is attempted: a missing
    executable answers with the actionable error instead of a silent ok."""
    def body(root, notes):
        fake = root / "bin" / "code.cmd"  # never launched: Popen is mocked
        launched = []
        old_popen = srv.subprocess.Popen
        srv.subprocess.Popen = lambda argv, *a, **k: launched.append(argv)
        old_which = srv.shutil.which
        srv.shutil.which = lambda cmd: str(fake) if cmd == "code" else None
        try:
            cfg = {"editor_cmd": ["code", "-g", "{path}"]}
            assert srv.open_in_editor(cfg, "notes/demo/DEMO.md") == {"ok": True}
            assert launched == [[str(fake), "-g", str(notes / "demo" / "DEMO.md")]]
            missing = srv.open_in_editor({"editor_cmd": ["nosucheditor", "{path}"]},
                                         "notes/demo/DEMO.md")
            assert missing == {"ok": False, "error": srv.EDITOR_MISSING}
            srv.shutil.which = lambda cmd: None
            assert srv.resolve_editor("nosucheditor") is None
        finally:
            srv.subprocess.Popen = old_popen
            srv.shutil.which = old_which
    with_tree(body)


def test_safe_repo_path_guard():
    def body(root, notes):
        assert srv.safe_repo_path("notes/demo/DEMO.md").name == "DEMO.md"
        for bad in ("../outside.md", "notes/demo/nope.md"):
            try:
                srv.safe_repo_path(bad)
                raise AssertionError(f"accepted bad path: {bad}")
            except ValueError:
                pass
    with_tree(body)


def make_programming_tree(root: Path) -> Path:
    cfg = {
        "preset": "programming_sector",
        "branch_slots": ["demo"],
        "default_selected": [".sector/core/env/env_main.md"],
        "sector": {
            "new_branch_required_context": ["env.testing"],
        },
        "plan_stub_template": CFG["plan_stub_template"],
    }
    write_config(root, cfg)
    sector = root / ".sector"
    workstreams = sector / "workstreams"
    demo = workstreams / "demo"
    (demo / "plans").mkdir(parents=True)
    (demo / "reports" / "rundir").mkdir(parents=True)
    (demo / "DEMO.md").write_text(CARD,
                                  encoding="utf-8")
    (demo / "plans" / "current_plan.md").write_text(PLAN, encoding="utf-8")
    (demo / "reports" / "head_v2.md").write_text(
        HEAD_V2, encoding="utf-8")
    (demo / "reports" / "head_v1.md").write_text(HEAD_V1, encoding="utf-8")
    (demo / "reports" / "rundir" / "summary.md").write_text(
        "# Run summary\n", encoding="utf-8")
    (demo / "reports" / "rundir" / "fig.png").write_bytes(b"png")
    (sector / "core" / "env").mkdir(parents=True)
    (sector / "core" / "env" / "INDEX.md").write_text("# Env index\n", encoding="utf-8")
    (sector / "core" / "env" / "env_main.md").write_text("# Env main\n", encoding="utf-8")
    (sector / "_games" / "demo").mkdir(parents=True)
    (sector / "_games" / "demo" / "game1.md").write_text(
        GAME, encoding="utf-8")
    return workstreams


def with_programming_tree(fn):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        workstreams = make_programming_tree(root)
        old = srv.ADAPTER
        srv.set_adapter(sector_adapter.load_adapter(
            repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json"))
        try:
            fn(root, workstreams)
        finally:
            srv.set_adapter(old)


def test_programming_preset_core_reports_derived_card():
    """Portable schema knobs preserve the frontend contract."""
    def body(root, workstreams):
        cfg = srv.load_config()
        tree = srv.build_tree(cfg)
        assert tree["slots"] == ["demo"]
        assert tree["core"][0]["pack"] == "env"
        d = _demo(tree)
        by_id = {n["id"]: n for n in d["nodes"]}
        v2 = by_id[".sector/workstreams/demo/reports/head_v2.md"]
        assert v2["kind"] == "report"
        assert v2["live"] and v2["played"]
        run = by_id[".sector/workstreams/demo/reports/rundir/summary.md"]
        assert run["satellites"] == [
            sat(".sector/workstreams/demo/reports/rundir/fig.png", check_me=True)]
        out = srv.submit_plan(cfg, {"branch": "Fresh Idea", "slug": "first_probe",
                                    "task": "explore", "to_read": [],
                                    "context_packs": ["env.testing"],
                                    "new_branch": True})
        card = workstreams / "fresh_idea" / "FRESH_IDEA.md"
        assert card.exists()
        assert (root / out["plan_path"]).exists()
        assert out["plan_path"].startswith(".sector/workstreams/fresh_idea/plans/")
        assert "required_context: [\"env.testing\"]" in card.read_text(encoding="utf-8")
    with_programming_tree(body)


def test_legacy_report_folder_config():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        make_programming_tree(root)
        demo = root / ".sector/workstreams/demo"
        (demo / "reports").rename(demo / "reviews")
        card = demo / "DEMO.md"
        card.write_text(CARD.replace("reports/", "reviews/"), encoding="utf-8")
        write_config(root, {"preset": "programming_sector",
                            "sector": {"reviews_dir": "reviews"}})
        adapter = sector_adapter.load_adapter(repo=root, starmap_dir=ROOT)
        assert adapter.reports_dir == "reviews"
        assert (adapter.sector_root / "demo" / adapter.reports_dir / "head_v2.md").exists()
        write_config(root, {"preset": "programming_sector",
                            "sector": {"reviews_dir": "reviews", "reports_dir": "reports"}})
        assert sector_adapter.load_adapter(repo=root, starmap_dir=ROOT).reports_dir == "reports"


def test_no_config_defaults_to_programming_preset():
    """A repo with NO sector-map.config.json boots on pure built-in defaults:
    programming preset, empty slots, port 8377 — never someone else's config."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        adapter = sector_adapter.load_adapter(repo=root, starmap_dir=ROOT)
        assert adapter.sector["preset"] == "programming_sector"
        assert adapter.sector_root == root / ".sector" / "workstreams"
        cfg = adapter.runtime_config()
        assert cfg["branch_slots"] == [] and cfg["port"] == 8377
        old = srv.ADAPTER
        srv.set_adapter(adapter)
        try:
            tree = srv.build_tree(cfg)
            assert tree["slots"] == [] and tree["branches"] == [] and tree["core"] == []
        finally:
            srv.set_adapter(old)


def test_local_overlay_overrides_without_mutating_tracked_config():
    def body(root, notes):
        (root / ".sector-map.local.json").write_text(json.dumps({
            "branch_slots": ["demo"],
            "default_selected": ["notes/core/env/env_main.md"],
            "port": 9001,
        }), encoding="utf-8")
        srv.set_adapter(sector_adapter.load_adapter(
            repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json"))
        cfg = srv.load_config()
        assert cfg["branch_slots"] == ["demo"]
        assert cfg["port"] == 9001
        srv.save_config({**cfg, "branch_slots": ["demo"], "editor_cmd": ["codium", "{path}"]})
        tracked = json.loads((root / "sector-map.config.json").read_text(encoding="utf-8"))
        local = json.loads((root / ".sector-map.local.json").read_text(encoding="utf-8"))
        assert tracked == {"preset": "research_notes"}
        assert local["editor_cmd"] == ["codium", "{path}"]
    with_tree(body)


def test_layout_offsets_round_trip_in_the_local_overlay():
    """Plan step 4 "Persistence": a posted `layout` map comes back on the tree,
    a second post REPLACES it, and the overlay file holds local keys only."""
    def body(root, notes):
        srv.set_adapter(sector_adapter.load_adapter(
            repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json"))
        assert srv.build_tree(srv.load_config())["config"]["layout"] == {}
        first = {"notes/demo/DEMO.md": [12.5, -30.0], "notes/demo/plans/current_plan.md": [-8.0, 4.5]}
        srv.save_config({**srv.load_config(), "layout": first})
        srv.set_adapter(sector_adapter.load_adapter(
            repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json"))
        assert srv.build_tree(srv.load_config())["config"]["layout"] == first
        srv.save_config({**srv.load_config(), "layout": {"notes/demo/DEMO.md": [1.0, 2.0]}})
        local = json.loads((root / ".sector-map.local.json").read_text(encoding="utf-8"))
        assert local["layout"] == {"notes/demo/DEMO.md": [1.0, 2.0]}
        assert set(local) <= sector_adapter.LOCAL_KEYS
        tracked = json.loads((root / "sector-map.config.json").read_text(encoding="utf-8"))
        assert "layout" not in tracked
    with_tree(body)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
    print("all starmap tests passed")
