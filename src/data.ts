// Types mirror tools/sector/server.py build_tree() exactly — the server is
// the single source of truth; the frontend never derives repo facts itself.

export interface Satellite {
  path: string;
  name: string;
  is_image: boolean;
  check_me: boolean; // listed in the card's check-me: still waiting for the owner's eyes
  missing: boolean; // declared as a proof but not on disk: drawn hollow, struck through
  is_page: boolean; // the doc's own `page:` (a report page next to its markdown stub)
  provenance: boolean; // declared under `provenance:`: listed separately, dimmer
  ext: string; // lowercase suffix without the dot; the reader routes viewers on this
}

export interface DocNode {
  id: string;
  path: string;
  at_root: boolean; // sits next to the card on disk -> level-1 privilege
  kind: string; // plan | report | walkthrough | handover | deck | audit | file
  status: string; // head | superseded | draft | reference | stranded
  stamped: boolean;
  date: string;
  title: string;
  look_at: string[]; // a report's user-facing proofs (look_at, else the legacy proof_of_work)
  provenance: string[]; // files to open only when checking something
  page: string | null; // the HTML page this markdown doc is the stub of
  supersedes: string | null;
  superseded_by: string | null;
  plan: string | null;
  satellites: Satellite[];
  satellites_truncated: boolean; // more proofs than the 24 the planet can carry
  live: boolean;
  played: boolean;
}

export interface ClusterItem {
  id: string;
  title: string;
  date: string;
  kind: string;
}

export interface Branch {
  branch: string;
  error?: string;
  card: {
    path: string;
    title: string;
    status: string;
    updated: string;
    check_me: string[];
    required_context: string[];
    depends_on: string[];
    // what the card says to read: live docs, then required context
    read_list: { path: string; required?: string }[];
  };
  nodes: DocNode[];
  cluster: { count: number; items: ClusterItem[] };
}

export interface ContextPack {
  pack: string;
  color: string;
  variants: { id: string; path: string; name: string; is_index: boolean; title: string }[];
}

export interface Tree {
  generated_at: string;
  slots: string[];
  branches: Branch[];
  all_branches: string[];
  core: ContextPack[];
  config: {
    default_selected: string[];
    max_branch_slots: number;
    handover_template: string;
    game_prompt_template: string;
    // Plan step 4: path -> [dx, dy] offset from the parent anchor, personal
    // overlay state (see src/offsets.ts). Absent on an overlay-less host.
    layout?: Record<string, [number, number]>;
    // Owner minibatch 6: the three preferences the Layout window writes. They
    // live in the same config pair as the slots (sector-map.config.json for the
    // host defaults, .sector-map.local.json for this user's overlay), which is
    // why there is no separate settings file.
    layout_style?: string; // "spread" | "coupled"
    arc_max_nodes?: number; // nodes one arc may hold before a date group carries over
    core_slots?: string[]; // the packs drawn in the core row; empty means all
  };
}

export async function fetchTree(): Promise<Tree> {
  const r = await fetch("/api/tree");
  if (!r.ok) throw new Error(`tree fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchFile(
  path: string,
): Promise<{ type: "markdown" | "html" | "text" | "binary"; content?: string; size?: number }> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  return r.json();
}

export async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
