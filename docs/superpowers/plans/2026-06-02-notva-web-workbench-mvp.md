# Notva Web Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Web workbench that reuses the existing Notva core through a local server and is launched with `notva serve`.

**Architecture:** Create `packages/server` as a Node HTTP server that exposes JSON APIs and serves static assets from `packages/web`. Keep all vault behavior in `packages/core`; the server translates HTTP requests into core calls, and the Web UI remains a static local client.

**Tech Stack:** TypeScript, Node.js `http`, Node.js `fs`, Vitest, static HTML/CSS/JS, existing Notva core.

---

## File Structure

Create these files:

```text
packages/server/package.json
packages/server/tsconfig.json
packages/server/src/index.ts
packages/server/src/http.ts
packages/server/src/http.test.ts
packages/web/package.json
packages/web/static/index.html
packages/web/static/styles.css
packages/web/static/app.js
```

Modify these files:

```text
package.json
tsconfig.base.json
packages/cli/package.json
packages/cli/tsconfig.json
packages/cli/src/main.ts
packages/cli/src/main.test.ts
packages/core/src/index.ts
packages/core/src/wiki.ts
README.md
```

## Task 1: Add Core Wiki Listing

**Files:**
- Create: `packages/core/src/wiki.ts`
- Create: `packages/core/src/wiki.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/wiki.test.ts` with a test that initializes a vault, writes one wiki page, calls `reindexVault`, then expects `listWikiPages` to return that page and `readWikiPage` to return its Markdown body.

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm vitest run packages/core/src/wiki.test.ts
```

Expected: FAIL because `wiki.ts` does not exist.

- [ ] **Step 3: Implement wiki helpers**

Create `packages/core/src/wiki.ts` exporting:

```ts
export interface ListWikiPagesOptions { root: string; }
export interface ReadWikiPageOptions { root: string; path: string; }
export async function listWikiPages(options: ListWikiPagesOptions): Promise<PageRecord[]>
export async function readWikiPage(options: ReadWikiPageOptions): Promise<PageRecord>
```

`listWikiPages` reads from `NotvaState.listPages()`. `readWikiPage` ensures the requested path is relative, reads from `wiki/`, extracts a title from the first `#` heading, and returns a `PageRecord`.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm vitest run packages/core/src/wiki.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src
git commit -m "feat: add wiki page helpers"
```

## Task 2: Add Local HTTP Server

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/http.ts`
- Create: `packages/server/src/http.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Write failing HTTP test**

Create `packages/server/src/http.test.ts` with a test that starts the server on port `0`, initializes a temp vault through the API, ingests inline text, lists pending proposals, applies all proposals, queries the vault, lints the vault, and fetches `/` to verify the static app is served.

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm vitest run packages/server/src/http.test.ts
```

Expected: FAIL because `packages/server` is not implemented.

- [ ] **Step 3: Implement server package**

Create `packages/server` with `createNotvaServer` and `listenNotvaServer`. The server must expose:

```text
GET  /api/health
POST /api/init
POST /api/ingest
GET  /api/proposals?vault=<path>
POST /api/review/apply
POST /api/query
GET  /api/lint?vault=<path>
GET  /api/pages?vault=<path>
GET  /api/page?vault=<path>&path=<page>
GET  /
GET  /styles.css
GET  /app.js
```

All API responses should be JSON. Static responses should serve files from `packages/web/static`.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm vitest run packages/server/src/http.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json tsconfig.base.json packages/server
git commit -m "feat: add local notva server"
```

## Task 3: Add Static Web Workbench

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/static/index.html`
- Create: `packages/web/static/styles.css`
- Create: `packages/web/static/app.js`
- Modify: `packages/server/src/http.test.ts`

- [ ] **Step 1: Write failing static asset assertions**

Extend `packages/server/src/http.test.ts` to fetch `/`, `/styles.css`, and `/app.js`, asserting that the HTML contains `Notva`, the CSS contains `.workspace`, and the JS contains `fetchJson`.

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm vitest run packages/server/src/http.test.ts
```

Expected: FAIL until static files exist and are served.

- [ ] **Step 3: Implement Web UI**

Build a single-screen workbench with:

```text
vault path input
init button
source input for file path, URL, or inline text
ingest button
pending proposal list
apply all button
query input
answer/evidence panel
wiki page list
selected page preview
lint status panel
```

Use a quiet, utilitarian, local-console aesthetic with stable dimensions, responsive layout, no landing page, no hero, no decorative orbs, and no purple gradient theme.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm vitest run packages/server/src/http.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/web packages/server/src/http.test.ts
git commit -m "feat: add web workbench"
```

## Task 4: Wire `notva serve`

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsconfig.json`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/main.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing CLI serve test**

Extend `packages/cli/src/main.test.ts` to call `main(["serve", "--vault", root, "--port", "0"])` and assert that output contains `Notva web workbench`.

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm vitest run packages/cli/src/main.test.ts
```

Expected: FAIL because `serve` is not implemented.

- [ ] **Step 3: Implement CLI serve**

Add `@notva/server` as a CLI dependency, add a TypeScript project reference to `../server`, and wire `notva serve --vault <path> --port <number>`. When port is `0`, start the server, print the actual local URL, then close immediately in test mode when `process.env.VITEST` is set.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm vitest run packages/cli/src/main.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/cli README.md package.json pnpm-lock.yaml
git commit -m "feat: wire notva serve"
```

## Task 5: End-To-End Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full automated verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 2: Run HTTP smoke test**

Run a temp-vault script that starts `listenNotvaServer({ port: 0 })`, calls the API with `fetch`, ingests and applies a note, queries it, confirms `/` returns HTML, and closes the server.

- [ ] **Step 3: Commit final README updates if needed**

Run:

```bash
git add README.md
git commit -m "docs: document web workbench"
```

Expected: commit only if README changed after Task 4.

## Self-Review

Spec coverage:

```text
Web App remains part of the roadmap: implemented as local workbench.
CLI/Core remains reusable: server calls core, CLI calls server for serve.
Local-first default: server runs locally and serves static files.
Upload/input, review, browse, search/chat, lint: covered by Web UI controls and API endpoints.
No separate SaaS or cloud dependency: preserved.
```

Placeholder scan:

```text
The plan contains no unassigned project names or open implementation placeholders.
```

Type consistency:

```text
Server APIs consistently use initVault, ingestSource, listPendingProposals, applyProposal, queryVault, lintVault, listWikiPages, and readWikiPage.
```
