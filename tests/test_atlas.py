"""Tests for atlas.py — build/check/gist against both preset fixtures.

Reuses the synthetic Sector trees from test_starmap.py (research-style
`notes/` and programming-style `.sector/`) and checks the three subcommands'
contracts: build writes the map at the preset's atlas_path, check is green on
a healthy tree and flags planted violations, gist assembles read-order +
card sections verbatim.

Runnable both ways (from the starmap package dir):
    python -m pytest tests/test_atlas.py
    python tests/test_atlas.py
"""

import io
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
import atlas  # noqa: E402
import sector_adapter  # noqa: E402
from test_starmap import make_tree, make_programming_tree  # noqa: E402


def adapter_for(root: Path):
    return sector_adapter.load_adapter(
        repo=root, starmap_dir=ROOT, config_path=root / "sector-map.config.json")


def run(fn, *args):
    """Call one atlas subcommand, returning (exit_code, captured_stdout)."""
    buf = io.StringIO()
    with redirect_stdout(buf):
        code = fn(*args)
    return code, buf.getvalue()


def test_check_green_and_build_research():
    """A healthy research tree: 0 violations; build writes notes/ATLAS.md
    listing the demo card under its status group."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        make_tree(root)
        adapter = adapter_for(root)
        code, _ = run(atlas.check, adapter)
        assert code == 0
        code, _ = run(atlas.build, adapter)
        assert code == 0
        text = (root / "notes" / "ATLAS.md").read_text(encoding="utf-8")
        assert "## Active" in text and "**demo**" in text and "Demo branch" in text


def test_check_flags_violations():
    """Planted drift is caught: a live_docs target deleted, a one-way
    supersession stamp, and a required_context entry with no file."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        notes = make_tree(root)
        (notes / "demo" / "plans" / "current_plan.md").unlink()      # dead live_doc
        v1 = notes / "demo" / "reports" / "head_v1.md"
        v1.write_text(v1.read_text(encoding="utf-8").replace(
            "superseded_by: head_v2.md", "superseded_by: null"), encoding="utf-8")
        card = notes / "demo" / "DEMO.md"
        card.write_text(card.read_text(encoding="utf-8").replace(
            "required_context: [env]", "required_context: [env, lens:freeform]"),
            encoding="utf-8")
        code, text = run(atlas.check, adapter_for(root))
        assert code == 1
        assert "live_docs target missing: plans/current_plan.md" in text
        assert "superseded_by back-stamp" in text
        assert "required_context target missing: lens:freeform" in text


def test_check_and_build_programming():
    """The programming preset: dotted context entries resolve through
    .sector/core, check is green, build writes .sector/ATLAS.md."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        make_programming_tree(root)
        adapter = adapter_for(root)  # config on disk selects the preset
        assert adapter.sector["preset"] == "programming_sector"
        code, text = run(atlas.check, adapter)
        assert code == 0, text
        code, _ = run(atlas.build, adapter)
        assert code == 0
        assert (root / ".sector" / "ATLAS.md").exists()


def test_gist_research():
    """Gist reads: card first, live_docs in order, required context resolved,
    card one-liners verbatim."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        make_tree(root)
        code, text = run(atlas.gist, adapter_for(root), "demo")
        assert code == 0
        assert "CONTEXT GIST: demo" in text
        assert "1. notes/demo/DEMO.md" in text
        assert "2. notes/demo/plans/current_plan.md" in text
        assert "notes/core/env/INDEX.md" in text
        assert "CONFIRM by restating" in text


def test_gist_repo_relative_live_doc():
    """A live_doc outside the branch dir resolves repo-relative in the gist,
    matching what check() accepts and what the server renders."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td).resolve()
        make_tree(root)
        (root / "refs").mkdir()
        (root / "refs" / "bibliography.md").write_text("# Refs\n", encoding="utf-8")
        card = root / "notes" / "demo" / "DEMO.md"
        card.write_text(
            card.read_text(encoding="utf-8").replace(
                "  - plans/current_plan.md",
                "  - plans/current_plan.md\n  - refs/bibliography.md"),
            encoding="utf-8")
        assert run(atlas.check, adapter_for(root))[0] == 0
        code, text = run(atlas.gist, adapter_for(root), "demo")
        assert code == 0
        assert "refs/bibliography.md" in text
        assert "notes/demo/refs/bibliography.md" not in text


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
    print("all atlas tests passed")
