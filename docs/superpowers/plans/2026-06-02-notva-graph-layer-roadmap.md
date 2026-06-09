# Notva Graph Layer Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Graphify-inspired relationship layer to Notva without changing Notva's wiki-first product shape. The graph should make the knowledge base easier to explain, audit, query, and use before downstream actions.

**Reference:** `safishamsi/graphify` at commit `47042beb05d1f6dd2186c0c499ae2840ce604ead`.

**Principle:** The reviewed Markdown wiki remains the durable human-facing artifact. The graph is a structured machine-facing artifact derived from reviewed sources, wiki pages, citations, links, and explicit extraction results.

---

## Target Artifacts

Add these graph outputs inside a vault:

```text
.notva/
  graph.json
  graph.html
  graph-report.md
  cache/
index/
  graph.sqlite
```

`graph.json` is the portable machine-readable export. `graph.html` is the portable offline viewer with embedded graph data. The MVP stores queryable graph records in `.notva/state.db` alongside other vault metadata; a separate `index/graph.sqlite` can be split out later if graph storage grows. `graph-report.md` is a human-readable audit report.

## Graph Schema

Add shared core types:

```ts
export type RelationConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export interface GraphNodeRecord {
  id: string;
  label: string;
  kind: "source" | "page" | "concept" | "claim" | "citation";
  path?: string;
  sourceId?: string;
}

export interface GraphEdgeRecord {
  source: string;
  target: string;
  relation: string;
  confidence: RelationConfidence;
  confidenceScore?: number;
  evidence?: string;
  sourceId?: string;
}
```

Initial extracted relations should stay conservative:

```text
source -> page: supports
page -> page: links_to
page -> source: cites
page -> concept: mentions
claim -> source: evidenced_by
```

For the MVP, `page -> concept: mentions` is derived only from explicit unresolved wiki links such as `[[Loose Concept]]`. Notva should not infer concepts from ordinary prose until that inference can be reviewed.

Only deterministic relationships should be marked `EXTRACTED`. LLM-generated or heuristic relationships must be `INFERRED` or `AMBIGUOUS` and should appear in review/report surfaces.

---

## Task 1: Add Graph Data Model

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/state.ts`
- Create: `packages/core/src/graph.ts`
- Create: `packages/core/src/graph.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write graph schema tests**

Create tests that initialize a vault, insert graph nodes and edges, then export a stable `graph.json` shape with deterministic ordering.

- [x] **Step 2: Add SQLite tables**

Add `graph_nodes` and `graph_edges` tables. Store node and edge ids deterministically so repeated reindexing does not create duplicates.

- [x] **Step 3: Implement graph helpers**

Implement:

```ts
export async function rebuildGraph(options: { root: string }): Promise<GraphBuildResult>
export async function exportGraphJson(options: { root: string }): Promise<GraphExport>
export async function listGraphNeighbors(options: { root: string; id: string }): Promise<GraphNeighborhood>
```

- [x] **Step 4: Verify**

Run:

```bash
pnpm vitest run packages/core/src/graph.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

## Task 2: Derive Relations From Reviewed Wiki

**Files:**
- Modify: `packages/core/src/review.ts`
- Modify: `packages/core/src/reindex.ts`
- Modify: `packages/core/src/wiki.ts`
- Modify: `packages/core/src/graph.ts`
- Create or modify focused tests under `packages/core/src/`

- [x] **Step 1: Capture source-page edges when proposals are applied**

When `applyProposal` writes or updates a wiki page, create a `source supports page` edge with `EXTRACTED` confidence.

- [x] **Step 2: Capture wiki link edges during reindex**

Parse `[[Wiki Links]]` and Markdown links to wiki pages. Store `page links_to page` edges with `EXTRACTED` confidence.

- [x] **Step 3: Capture citation edges**

When a page contains a Notva source citation, store `page cites source` with `EXTRACTED` confidence.

- [x] **Step 4: Keep rebuild idempotent**

Repeated `notva reindex` must not duplicate nodes or edges.

## Task 3: Add Graph Queries

**Files:**
- Modify: `packages/core/src/graph.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/main.test.ts`

- [x] **Step 1: Add explain**

Implement:

```bash
notva explain <page-or-concept>
```

It should return the matched node, direct neighbors, supporting sources, citations, and uncertain relations.

- [x] **Step 2: Add path**

Implement:

```bash
notva path <from> <to>
```

Use breadth-first search over graph edges and show the shortest explainable route.

- [x] **Step 3: Add graph export**

Implement:

```bash
notva graph export
notva graph html
```

It should write `.notva/graph.json` and print node/edge counts.

`notva graph html` should write `.notva/graph.html` and print node/edge counts for the embedded graph.

## Task 4: Add Knowledge Graph Report

**Files:**
- Create: `packages/core/src/report.ts`
- Create: `packages/core/src/report.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/main.ts`

- [x] **Step 1: Compute graph health**

Report:

```text
most-connected pages and concepts
orphan pages
sources with no wiki coverage
ambiguous or inferred relationships
surprising cross-page links
suggested questions
```

- [x] **Step 2: Add CLI command**

Implement:

```bash
notva report
```

It should write `.notva/graph-report.md` and print the most important findings.

## Task 5: Add Web Graph Surfaces

**Files:**
- Modify: `packages/server/src/http.ts`
- Modify: `packages/server/src/http.test.ts`
- Modify: `packages/web/static/app.js`
- Modify: `packages/web/static/styles.css`
- Modify: `packages/web/static/index.html`

- [x] **Step 1: Add graph APIs**

Expose:

```text
GET  /api/graph?vault=<path>
POST /api/explain
POST /api/path
POST /api/report
```

- [x] **Step 2: Add UI panels**

Add compact panels for graph report, explain, and path. Keep the current local workbench dense and utilitarian.

- [x] **Step 3: Verify layout**

Run automated tests and use the in-app browser to verify desktop and mobile layouts.

## Task 6: Add Agent Install Workflow

**Files:**
- Create: `packages/core/src/agent-install.ts`
- Create: `packages/core/src/agent-install.test.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `README.md`

- [x] **Step 1: Add install command**

Implement:

```bash
notva install --platform codex
notva install --platform codex --project
```

- [x] **Step 2: Write Codex instruction file**

The generated instruction should tell agents:

```text
If this vault has Notva graph/wiki data, run notva query, notva explain, or notva path before broad raw-file reads.
Use reviewed wiki pages and graph edges as the first evidence set.
Treat INFERRED and AMBIGUOUS relationships as lower-confidence context.
```

- [x] **Step 3: Preserve local-first behavior**

User-scoped installs should land in the user's config directory. Project-scoped installs should write only into the current project and print a `git add` hint.

## Task 7: Add Portable HTML Graph Viewer

**Files:**
- Modify: `packages/core/src/graph.ts`
- Modify: `packages/core/src/graph.test.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/main.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write failing graph HTML tests**

Require `exportGraphHtml` to write `.notva/graph.html` with embedded graph data and require `notva graph html` to expose it through the CLI.

- [x] **Step 2: Implement offline viewer**

Render a self-contained HTML file with summary counts, node list, relationship list, and a lightweight SVG graph.

- [x] **Step 3: Document command**

Document `notva graph html` in README and the graph-layer design notes.

## Task 8: Add Interactive HTML Graph Exploration

**Files:**
- Modify: `packages/core/src/graph.ts`
- Modify: `packages/core/src/graph.test.ts`
- Modify: `README.md`
- Modify: `docs/readme.test.ts`

- [x] **Step 1: Write failing HTML interaction assertions**

Require the generated HTML to include search, type filters, visible counts, node/edge data attributes, and focus logic.

- [x] **Step 2: Implement search and type filters**

Filter rendered SVG nodes, relationship lines, node list rows, and relationship rows using a local search input and node kind checkboxes.

- [x] **Step 3: Implement node focus**

Clicking a node focuses that node, direct neighbors, and related edges. The clear button restores the full graph.

- [x] **Step 4: Verify in browser**

Use the local HTTP-served graph page to verify search, filtering, and focus interactions.

## Verification

Each task should end with:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Manual smoke test:

```bash
tmpdir="$(mktemp -d)"
pnpm notva init "$tmpdir"
pnpm notva ingest --vault "$tmpdir" --text "Notva is a personal knowledge vault. It stores reviewed wiki pages."
pnpm notva review --vault "$tmpdir" --apply all
pnpm notva reindex --vault "$tmpdir"
pnpm notva graph export --vault "$tmpdir"
pnpm notva graph html --vault "$tmpdir"
pnpm notva explain "Notva" --vault "$tmpdir"
pnpm notva report --vault "$tmpdir"
```

Expected:

```text
graph export writes .notva/graph.json
graph html writes .notva/graph.html
explain returns a matched page or concept with evidence
report writes .notva/graph-report.md
all automated verification passes
```
