"""Thin host-repo adapter for the portable Sector starmap.

Rebuild Plan §Phase 1: keep the starmap server/frontend shape intact and
isolate every host-repo assumption here. The server asks this adapter where
the Sector root, context packs, games, cards, plans, and report docs live; it
never knows whether the host uses the research-style `notes/` layout or the
programming-style `.sector/` one.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError as e:  # the one dependency; every card and stub is YAML front-matter
    raise SystemExit("Sector needs PyYAML to read card front-matter: pip install pyyaml") from e


CARD_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*\.md$")
CARD_NAME_EXCLUDE = {"README.md", "INDEX.md"}

# Rebuild Plan §Phase 1: the two first-class modes. `context_colors` is what
# the core row paints packs with (unknown packs get the fallback grey in
# server.build_core); hosts override any of this under config `sector:`.
DEFAULT_CONTEXT_COLORS = {"env": "#5b9bd5", "goal": "#e39ddb",
                          "lens": "#7fd6a4", "style": "#66c7c7",
                          "security": "#d58f5b"}

RESEARCH_SECTOR = {
    "preset": "research_notes",
    "sector_root": "notes",
    "context_dir": "core",
    "games_dir": "_games",
    "plans_dir": "plans",
    "reports_dir": "reports",
    "artifacts_dir": "artifacts",
    "non_workstream_dirs": ["core", "_games"],
    "new_branch_required_context": ["env"],
    "context_colors": DEFAULT_CONTEXT_COLORS,
    "atlas_path": "notes/ATLAS.md",
}

PRESETS = {
    "research_notes": RESEARCH_SECTOR,
    "programming_sector": {
        **RESEARCH_SECTOR,
        "preset": "programming_sector",
        "sector_root": ".sector/workstreams",
        "context_dir": ".sector/core",
        "games_dir": ".sector/_games",
        "reports_dir": "reports",
        "non_workstream_dirs": [],
        "atlas_path": ".sector/ATLAS.md",
    },
}

DEFAULT_UI = {
    "port": 8377,
    "max_branch_slots": 6,
    "branch_slots": [],
    "default_selected": [],
    "editor_cmd": ["code", "-g", "{path}"],
    # Plan step 4: path -> [dx, dy] world-unit offset from that thing's parent
    # anchor. Empty means "every node sits where the pure layout puts it".
    "layout": {},
    # Owner minibatch 6: the three preferences the starmap's Layout window (B)
    # writes. They live in this same config pair -- host defaults in
    # `sector-map.config.json`, personal overlay in `.sector-map.local.json` --
    # which IS the settings file; the starmap has no separate one.
    #   layout_style   "spread" (plans left of each arc, reports right) or
    #                  "coupled" (each pair a tight couple)
    #   arc_max_nodes  nodes one arc may hold before a date group carries over,
    #                  a pair counting as two
    #   core_slots     the context packs the core row draws; empty means all
    "layout_style": "spread",
    "arc_max_nodes": 12,
    "core_slots": [],
    "handover_template": (
        "We're continuing a Sector-enabled project; this prompt was assembled "
        "from the starmap.\n\nREAD IN FULL, IN ORDER:\n{TO_READ}\n"
    ),
    "plan_stub_template": (
        "---\nkind: plan\ndate: {DATE}\nstatus: draft\nsupersedes: null\n"
        "superseded_by: null\nrequired_context: {REQUIRED_CONTEXT}\n---\n\n"
        "> AGENT INSTRUCTION: this is a draft task brief submitted from the starmap. At kickoff: read the TO-READ context below, start the planning op with the user, then overwrite this file with the full local plan template, renaming to whatever name best matches the user-agreed task.\n\n"
        "## TO-READ (in order)\n{TO_READ}\n\n## Task\n{TASK}\n"
    ),
    "game_prompt_template": (
        "I want to play a game: {GAME}, anchored on the report `{REPORT}` "
        "(branch: {BRANCH}).\nTime I have for playing: {BUDGET}.\n{NOTES}\n"
    ),
}

# Plan step 4 "Placement survives everything": dragged positions are PERSONAL
# overlay state, never repo truth (docs/STARMAP.md "Do not persist layout
# positions as the source of truth"), so `layout` lives here with the slots.
LOCAL_KEYS = {"port", "branch_slots", "default_selected", "editor_cmd", "layout",
              "layout_style", "arc_max_nodes", "core_slots"}


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def parse_front_matter(path: Path) -> tuple[dict[str, Any], str]:
    """Return `(front_matter, body)` for one Markdown file."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", text, flags=re.DOTALL)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    return (meta if isinstance(meta, dict) else {}), m.group(2)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")


@dataclass
class SectorAdapter:
    repo: Path
    starmap_dir: Path
    config_path: Path
    local_config_path: Path
    base_config: dict[str, Any]
    local_config: dict[str, Any]
    sector: dict[str, Any]
    sector_root: Path
    context_root: Path
    games_root: Path
    plans_dir: str
    reports_dir: str
    artifacts_dir: str
    non_workstream_dirs: set[str] = field(default_factory=set)

    def runtime_config(self) -> dict[str, Any]:
        """Merged UI config exposed to the existing frontend unchanged."""
        return _deep_merge(self.base_config, self.local_config)

    def save_local_config(self, merged_config: dict[str, Any]) -> None:
        """Persist personal/session state to `.sector-map.local.json` only."""
        local = dict(self.local_config)
        for key in LOCAL_KEYS:
            if key in merged_config:
                local[key] = merged_config[key]
        self.local_config_path.write_text(json.dumps(local, indent=2), encoding="utf-8")
        self.local_config = local

    def parse_front_matter(self, path: Path) -> tuple[dict[str, Any], str]:
        return parse_front_matter(path)

    def find_card(self, branch_dir: Path) -> Path | None:
        """
        Find the one card at a branch root. The card is named after its branch,
        in ALL CAPS — `permit_check/PERMIT_CHECK.md` — so the address is
        computable from the directory name alone, with no listing:

        ```text
        branch_dir = <sector_root>/permit_check
              |
              v
        PERMIT_CHECK.md exists? -----yes----> that's the card
              |no
              v
        legacy fallback: exactly ONE ALLCAPS *.md at the root
        (minus README/INDEX) --------yes----> that's the card
              |no / ambiguous
              v
        None  (branch reads as cardless: adopt-on-touch)
        ```

        The fallback exists only for branches adopted before the naming was
        unified; new cards are always written at the derived name.

        Return: the card `Path`, or `None` if the branch has no unambiguous one.
        """
        derived = branch_dir / f"{branch_dir.name.upper()}.md"
        if derived.exists():
            return derived
        matches = [
            p for p in branch_dir.glob("*.md")
            if CARD_NAME_RE.match(p.name) and p.name not in CARD_NAME_EXCLUDE
        ]
        return matches[0] if len(matches) == 1 else None

    def branch_dirs(self) -> list[Path]:
        if not self.sector_root.is_dir():
            return []
        return sorted(
            d for d in self.sector_root.iterdir()
            if d.is_dir() and d.name not in self.non_workstream_dirs
        )

    @property
    def atlas_path(self) -> Path:
        """Where `atlas.py build` writes the generated map (repo-relative config key)."""
        return self.repo / self.sector["atlas_path"]

    def context_color(self, pack: str) -> str:
        """Core-row color for one context pack; unknown packs get the fallback grey."""
        return self.sector.get("context_colors", {}).get(pack, "#8fa3c8")

    def doc_ref_regex(self) -> re.Pattern:
        """Regex matching in-repo doc references inside game files.

        Game files cite the report they were generated from either
        repo-relative (`notes/demo/reports/x.md`, `.sector/workstreams/...`)
        or branch-relative (`reports/x.md`, or a configured custom folder). The alternation
        is built from THIS host's configured names, so the same code matches
        both layouts without hardcoding either:

        ```text
        sector_root first part  ("notes" | ".sector")   -> repo-relative refs
        plans/reports/artifacts dir names               -> branch-relative refs
        ```
        """
        first = self.sector_root.relative_to(self.repo).parts[0]
        names = sorted({first, self.plans_dir, self.reports_dir, self.artifacts_dir})
        return re.compile(r"(?:" + "|".join(re.escape(n) for n in names) + r")/[\w./-]+\.md")

    def resolve_repo_path(self, path: str) -> Path:
        target = (self.repo / path).resolve()
        if not target.is_relative_to(self.repo) or not target.exists():
            raise ValueError(f"bad path: {path}")
        return target

    def branch_dir(self, branch: str) -> Path:
        return self.sector_root / slugify(branch)

    def new_card_path(self, branch_dir: Path, branch: str) -> Path:
        """
        Where a new branch's card is written: `<BRANCH_NAME>.md` at the branch
        root, ALL CAPS. Mirrors `find_card`'s derived name — the two must agree
        or a freshly seeded branch reads as cardless.
        args: branch_dir (Path), branch (str, the un-slugified branch name)
        returns: Path
        """
        return branch_dir / f"{slugify(branch).upper()}.md"

    def new_card_text(self, branch: str, today: str) -> str:
        required = json.dumps(self.sector.get("new_branch_required_context", ["env"]))
        template = self.sector.get("new_card_template")
        if template:
            return template.format(BRANCH=branch, TITLE=branch, DATE=today, REQUIRED_CONTEXT=required)
        return (
            f"---\nbranch: {branch}\ntitle: \"{branch}\"\nstatus: forming\n"
            f"updated: {today}\ndepends_on: []\nrequired_context: {required}\n"
            f"live_docs:\ncheck-me: []\n---\n\n"
            f"## Now\n\n(new branch, seeded from the starmap)\n\n"
            f"## Results\n\n(none yet)\n\n## Landmines\n\n(none)\n\n"
            f"## Graveyard\n\n(empty)\n"
        )

    def live_doc_entries(self, meta: dict[str, Any]) -> list[tuple[str, list[str]]]:
        """
        Flatten a card's `live_docs` tree into (doc, artifacts) pairs, in card
        order. Plain entries carry no artifacts; a report entry written as a
        one-key mapping carries the artifacts nested under it.
        args: meta (the card's front-matter)
        returns: [(doc_path, [artifact_path, ...]), ...]
        """
        out = []
        for entry in meta.get("live_docs") or []:
            if isinstance(entry, dict):
                doc, arts = next(iter(entry.items()))
                out.append((str(doc), [str(a) for a in (arts or [])]))
            else:
                out.append((str(entry), []))
        return out

    def plan_path(self, branch_dir: Path, fname: str) -> Path:
        return branch_dir / self.plans_dir / fname

    def live_doc_ref(self, fname: str) -> str:
        return f"{self.plans_dir}/{fname}"


def _resolve_path(repo: Path, sector_root: Path, value: str) -> Path:
    p = Path(value)
    if p.is_absolute():
        return p
    if p.parts and (len(p.parts) > 1 or value.startswith(".")):
        return repo / p
    return sector_root / p


def load_adapter(
    *,
    repo: str | Path | None = None,
    starmap_dir: str | Path | None = None,
    config_path: str | Path | None = None,
    local_config_path: str | Path | None = None,
) -> SectorAdapter:
    """Load host config + local overlay and return the path/schema adapter."""
    repo_path = Path(repo or Path.cwd()).resolve()
    starmap = Path(starmap_dir or Path(__file__).resolve().parent).resolve()
    cfg_path = Path(config_path).resolve() if config_path else repo_path / "sector-map.config.json"
    local_path = Path(local_config_path).resolve() if local_config_path else repo_path / ".sector-map.local.json"

    # No host config -> pure built-in defaults (programming preset, empty
    # slots). A host that wants the research layout ships a config saying so.
    raw_base = _read_json(cfg_path)
    preset = raw_base.get("preset") or raw_base.get("sector", {}).get("preset") or "programming_sector"
    if preset not in PRESETS:
        raise ValueError(f"unknown preset '{preset}' — expected one of {sorted(PRESETS)}")
    overrides = dict(raw_base.get("sector", {}))
    # Existing installations may still configure the old folder key.
    if "reviews_dir" in overrides:
        overrides.setdefault("reports_dir", overrides.pop("reviews_dir"))
    sector = _deep_merge(PRESETS[preset], overrides)
    base = _deep_merge(DEFAULT_UI, raw_base)
    base["sector"] = sector
    local = _read_json(local_path)

    sector_root = (repo_path / sector["sector_root"]).resolve()
    context_root = _resolve_path(repo_path, sector_root, sector["context_dir"]).resolve()
    games_root = _resolve_path(repo_path, sector_root, sector["games_dir"]).resolve()
    return SectorAdapter(
        repo=repo_path,
        starmap_dir=starmap,
        config_path=cfg_path,
        local_config_path=local_path,
        base_config=base,
        local_config=local,
        sector=sector,
        sector_root=sector_root,
        context_root=context_root,
        games_root=games_root,
        plans_dir=sector["plans_dir"],
        reports_dir=sector["reports_dir"],
        artifacts_dir=sector["artifacts_dir"],
        non_workstream_dirs=set(sector.get("non_workstream_dirs", [])),
    )
