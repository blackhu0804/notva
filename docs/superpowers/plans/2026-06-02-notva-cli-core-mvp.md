# Notva CLI/Core MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Notva CLI/Core MVP with local vault initialization, source ingestion, reviewable wiki proposals, query, lint, and reindex.

**Architecture:** Implement a TypeScript monorepo where `packages/core` owns vault behavior and `packages/cli` is a thin command interface. Persist raw sources and wiki pages on disk while using a local SQLite database for sources, proposals, page metadata, and FTS search.

**Tech Stack:** TypeScript, Node.js 24, pnpm workspaces, Vitest, Node built-in `node:sqlite`, Markdown files, SQLite FTS5.

---

## File Structure

Create these files:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
.gitignore
README.md

packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/types.ts
packages/core/src/paths.ts
packages/core/src/state.ts
packages/core/src/init.ts
packages/core/src/ingest.ts
packages/core/src/review.ts
packages/core/src/query.ts
packages/core/src/lint.ts
packages/core/src/reindex.ts
packages/core/src/init.test.ts
packages/core/src/ingest-review-query.test.ts
packages/core/src/lint.test.ts

packages/cli/package.json
packages/cli/tsconfig.json
packages/cli/src/main.ts
packages/cli/src/main.test.ts
```

Responsibilities:

```text
types.ts
  Shared core types for vault paths, sources, proposals, pages, query results, and lint issues.

paths.ts
  Resolve vault paths, locate an existing vault, create slugs, and create deterministic IDs.

state.ts
  Own SQLite schema, migrations, CRUD helpers, and FTS search.

init.ts
  Create a vault layout and default schema files.

ingest.ts
  Capture a file, URL, or text into raw/ and create a pending wiki proposal.

review.ts
  List proposals and apply accepted proposals to wiki/.

query.ts
  Search indexed wiki pages and return cited evidence.

lint.ts
  Report broken wiki links, pages with no source references, pending proposals, and raw sources with no accepted wiki coverage.

reindex.ts
  Rebuild page metadata and FTS rows from wiki/.

main.ts
  Parse CLI commands and call core functions.
```

## Task 1: Scaffold Workspace And Test Harness

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/main.ts`

- [ ] **Step 1: Write workspace config**

Create `package.json`:

```json
{
  "name": "notva",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b packages/core packages/cli",
    "test": "vitest run",
    "typecheck": "tsc -b packages/core packages/cli",
    "notva": "tsx packages/cli/src/main.ts"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@notva/core": ["packages/core/src/index.ts"]
    }
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@notva/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url))
    }
  }
});
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.worktrees/
*.tsbuildinfo
```

- [ ] **Step 2: Write package skeletons**

Create `packages/core/package.json`:

```json
{
  "name": "@notva/core",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run src"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "tsBuildInfoFile": "dist/core.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/core/src/index.ts`:

```ts
export {};
```

Create `packages/cli/package.json`:

```json
{
  "name": "notva",
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "notva": "./dist/main.js"
  },
  "dependencies": {
    "@notva/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run src"
  }
}
```

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "references": [{ "path": "../core" }],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "tsBuildInfoFile": "dist/cli.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/cli/src/main.ts`:

```ts
#!/usr/bin/env node

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  if (!command || command === "help" || command === "--help") {
    console.log("Usage: notva <init|ingest|review|query|lint|reindex> [args]");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
pnpm install
```

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 4: Run baseline checks**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: both commands pass with no tests found or zero failing tests.

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vitest.config.ts .gitignore packages
git commit -m "chore: scaffold notva workspace"
```

Expected: a commit is created for the workspace scaffold.

## Task 2: Vault Initialization

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/src/state.ts`
- Create: `packages/core/src/init.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/init.test.ts`

- [ ] **Step 1: Write failing init test**

Create `packages/core/src/init.test.ts`:

```ts
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-init-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("initVault", () => {
  test("creates the local-first vault layout and default schema", async () => {
    const root = await tempRoot();

    const result = await initVault({ root });

    await expect(stat(join(root, ".notva", "config.json"))).resolves.toBeTruthy();
    await expect(stat(join(root, ".notva", "state.db"))).resolves.toBeTruthy();
    await expect(stat(join(root, "raw"))).resolves.toBeTruthy();
    await expect(stat(join(root, "wiki"))).resolves.toBeTruthy();
    await expect(stat(join(root, "schema", "notva.md"))).resolves.toBeTruthy();
    await expect(stat(join(root, "index"))).resolves.toBeTruthy();

    const schema = await readFile(join(root, "schema", "notva.md"), "utf8");
    expect(schema).toContain("Notva Wiki Maintenance Rules");
    expect(result.paths.root).toBe(root);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/core/src/init.test.ts
```

Expected: FAIL because `./init.js` does not exist or `initVault` is not implemented.

- [ ] **Step 3: Implement types, paths, state, and init**

Create `packages/core/src/types.ts`:

```ts
export interface VaultPaths {
  root: string;
  notva: string;
  raw: string;
  wiki: string;
  schema: string;
  index: string;
  queue: string;
  logs: string;
  stateDb: string;
  config: string;
}

export interface InitVaultOptions {
  root: string;
}

export interface InitVaultResult {
  paths: VaultPaths;
}

export interface NotvaConfig {
  version: 1;
  createdAt: string;
}

export interface SourceRecord {
  id: string;
  kind: "file" | "url" | "text";
  title: string;
  rawPath: string;
  originalRef: string;
  createdAt: string;
  sha256: string;
}

export interface ProposalChange {
  type: "create_page" | "update_page";
  path: string;
  title: string;
  content: string;
}

export interface ProposalRecord {
  id: string;
  sourceId: string;
  status: "pending" | "accepted" | "rejected";
  summary: string;
  changes: ProposalChange[];
  createdAt: string;
  updatedAt: string;
}

export interface PageRecord {
  path: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface QueryHit {
  path: string;
  title: string;
  snippet: string;
}

export interface QueryResult {
  question: string;
  answer: string;
  hits: QueryHit[];
}

export interface LintIssue {
  code: string;
  message: string;
  path?: string;
}
```

Create `packages/core/src/paths.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { VaultPaths } from "./types.js";

export function resolveVaultPaths(root: string): VaultPaths {
  const notva = join(root, ".notva");
  return {
    root,
    notva,
    raw: join(root, "raw"),
    wiki: join(root, "wiki"),
    schema: join(root, "schema"),
    index: join(root, "index"),
    queue: join(notva, "queue"),
    logs: join(notva, "logs"),
    stateDb: join(notva, "state.db"),
    config: join(notva, "config.json")
  };
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortId(input: string | Buffer): string {
  return sha256(input).slice(0, 12);
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

export function titleFromPath(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled";
}
```

Create `packages/core/src/state.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import type { PageRecord, ProposalChange, ProposalRecord, QueryHit, SourceRecord } from "./types.js";

interface SourceRow {
  id: string;
  kind: SourceRecord["kind"];
  title: string;
  raw_path: string;
  original_ref: string;
  created_at: string;
  sha256: string;
}

interface ProposalRow {
  id: string;
  source_id: string;
  status: ProposalRecord["status"];
  summary: string;
  changes_json: string;
  created_at: string;
  updated_at: string;
}

interface PageRow {
  path: string;
  title: string;
  body: string;
  updated_at: string;
}

export class NotvaState {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        raw_path TEXT NOT NULL,
        original_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sha256 TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        changes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES sources(id)
      );

      CREATE TABLE IF NOT EXISTS pages (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(path, title, body);
    `);
  }

  close(): void {
    this.db.close();
  }

  insertSource(source: SourceRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sources (id, kind, title, raw_path, original_ref, created_at, sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(source.id, source.kind, source.title, source.rawPath, source.originalRef, source.createdAt, source.sha256);
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRow | undefined;
    return row ? mapSource(row) : undefined;
  }

  listSources(): SourceRecord[] {
    return (this.db.prepare("SELECT * FROM sources ORDER BY created_at ASC").all() as SourceRow[]).map(mapSource);
  }

  insertProposal(proposal: ProposalRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO proposals (id, source_id, status, summary, changes_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposal.id,
      proposal.sourceId,
      proposal.status,
      proposal.summary,
      JSON.stringify(proposal.changes),
      proposal.createdAt,
      proposal.updatedAt
    );
  }

  getProposal(id: string): ProposalRecord | undefined {
    const row = this.db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as ProposalRow | undefined;
    return row ? mapProposal(row) : undefined;
  }

  listPendingProposals(): ProposalRecord[] {
    return (this.db.prepare("SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at ASC").all() as ProposalRow[])
      .map(mapProposal);
  }

  markProposalStatus(id: string, status: ProposalRecord["status"], updatedAt: string): void {
    this.db.prepare("UPDATE proposals SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id);
  }

  upsertPage(page: PageRecord): void {
    this.db.prepare(`
      INSERT INTO pages (path, title, body, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        updated_at = excluded.updated_at
    `).run(page.path, page.title, page.body, page.updatedAt);

    this.db.prepare("DELETE FROM page_fts WHERE path = ?").run(page.path);
    this.db.prepare("INSERT INTO page_fts (path, title, body) VALUES (?, ?, ?)").run(page.path, page.title, page.body);
  }

  listPages(): PageRecord[] {
    return (this.db.prepare("SELECT * FROM pages ORDER BY path ASC").all() as PageRow[]).map(mapPage);
  }

  searchPages(query: string, limit = 5): QueryHit[] {
    const match = toFtsQuery(query);
    if (!match) return [];
    const rows = this.db.prepare(`
      SELECT path, title, snippet(page_fts, 2, '[', ']', '...', 16) AS snippet
      FROM page_fts
      WHERE page_fts MATCH ?
      LIMIT ?
    `).all(match, limit) as QueryHit[];
    return rows;
  }
}

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    rawPath: row.raw_path,
    originalRef: row.original_ref,
    createdAt: row.created_at,
    sha256: row.sha256
  };
}

function mapProposal(row: ProposalRow): ProposalRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    summary: row.summary,
    changes: JSON.parse(row.changes_json) as ProposalChange[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPage(row: PageRow): PageRecord {
  return {
    path: row.path,
    title: row.title,
    body: row.body,
    updatedAt: row.updated_at
  };
}

function toFtsQuery(query: string): string {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    .slice(0, 8)
    .map((token) => `${token}*`)
    .join(" OR ");
}
```

Create `packages/core/src/init.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { ensureDir, fileExists, resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { InitVaultOptions, InitVaultResult, NotvaConfig } from "./types.js";

const DEFAULT_SCHEMA = `# Notva Wiki Maintenance Rules

- Preserve raw sources as the source of truth.
- Prefer reviewable proposals over silent wiki edits.
- Every wiki page should cite its source IDs.
- Mark uncertainty and conflicts instead of hiding them.
- Keep page titles short, searchable, and stable.
`;

export async function initVault(options: InitVaultOptions): Promise<InitVaultResult> {
  const paths = resolveVaultPaths(options.root);

  await Promise.all([
    ensureDir(paths.notva),
    ensureDir(paths.raw),
    ensureDir(paths.wiki),
    ensureDir(paths.schema),
    ensureDir(paths.index),
    ensureDir(paths.queue),
    ensureDir(paths.logs)
  ]);

  if (!(await fileExists(paths.config))) {
    const config: NotvaConfig = { version: 1, createdAt: new Date().toISOString() };
    await writeFile(paths.config, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  const schemaPath = `${paths.schema}/notva.md`;
  if (!(await fileExists(schemaPath))) {
    await writeFile(schemaPath, DEFAULT_SCHEMA, "utf8");
  }

  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
  } finally {
    state.close();
  }

  return { paths };
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./init.js";
export * from "./paths.js";
export * from "./state.js";
export * from "./types.js";
```

- [ ] **Step 4: Run init test to verify it passes**

Run:

```bash
pnpm vitest run packages/core/src/init.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all checks**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit vault initialization**

Run:

```bash
git add packages/core/src
git commit -m "feat: initialize notva vaults"
```

Expected: a commit is created for vault initialization.

## Task 3: Ingest, Review, And Query Core Flow

**Files:**
- Create: `packages/core/src/ingest.ts`
- Create: `packages/core/src/review.ts`
- Create: `packages/core/src/query.ts`
- Create: `packages/core/src/ingest-review-query.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing ingest/review/query test**

Create `packages/core/src/ingest-review-query.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { queryVault } from "./query.js";
import { applyProposal, listPendingProposals } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-flow-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("ingest/review/query", () => {
  test("captures a file, creates a pending proposal, applies it, and queries the wiki", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "article.md");
    await writeFile(sourcePath, "# Retrieval Assisted Action\n\nNotva searches the wiki before executing user tasks.", "utf8");

    const ingest = await ingestSource({ root, target: sourcePath });

    expect(ingest.source.title).toBe("article");
    expect(ingest.proposal.status).toBe("pending");
    expect(await listPendingProposals({ root })).toHaveLength(1);

    const queryBeforeReview = await queryVault({ root, question: "retrieval action" });
    expect(queryBeforeReview.hits).toHaveLength(0);

    await applyProposal({ root, proposalId: ingest.proposal.id });

    const wikiPage = await readFile(join(root, "wiki", ingest.proposal.changes[0].path), "utf8");
    expect(wikiPage).toContain("Retrieval Assisted Action");
    expect(wikiPage).toContain(ingest.source.id);

    const result = await queryVault({ root, question: "retrieval action" });
    expect(result.hits[0]?.title).toContain("Retrieval Assisted Action");
    expect(result.answer).toContain("Retrieval Assisted Action");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/core/src/ingest-review-query.test.ts
```

Expected: FAIL because ingest, review, and query modules do not exist.

- [ ] **Step 3: Implement ingest**

Create `packages/core/src/ingest.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { ensureDir, resolveVaultPaths, shortId, slugify, titleFromPath, sha256 } from "./paths.js";
import { NotvaState } from "./state.js";
import type { ProposalRecord, SourceRecord } from "./types.js";

export interface IngestSourceOptions {
  root: string;
  target: string;
  kind?: "file" | "url" | "text";
}

export interface IngestSourceResult {
  source: SourceRecord;
  proposal: ProposalRecord;
}

export async function ingestSource(options: IngestSourceOptions): Promise<IngestSourceResult> {
  const paths = resolveVaultPaths(options.root);
  const now = new Date().toISOString();
  const parsed = await readTarget(options);
  const id = shortId(`${parsed.kind}:${parsed.originalRef}:${parsed.content}`);
  const datedRawDir = join(paths.raw, now.slice(0, 10));
  await mkdir(datedRawDir, { recursive: true });
  const rawFileName = `${slugify(parsed.title)}-${id}${parsed.extension}`;
  const rawPath = join(datedRawDir, rawFileName);
  await writeFile(rawPath, parsed.content, "utf8");

  const source: SourceRecord = {
    id,
    kind: parsed.kind,
    title: parsed.title,
    rawPath,
    originalRef: parsed.originalRef,
    createdAt: now,
    sha256: sha256(parsed.content)
  };

  const pageTitle = extractTitle(parsed.content, parsed.title);
  const pagePath = `${slugify(pageTitle)}.md`;
  const content = renderWikiPage({
    title: pageTitle,
    source,
    body: parsed.content,
    createdAt: now
  });

  const proposal: ProposalRecord = {
    id: shortId(`proposal:${source.id}:${pagePath}`),
    sourceId: source.id,
    status: "pending",
    summary: `Create wiki page "${pageTitle}" from source "${source.title}".`,
    changes: [{ type: "create_page", path: pagePath, title: pageTitle, content }],
    createdAt: now,
    updatedAt: now
  };

  await ensureDir(paths.queue);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    state.insertSource(source);
    state.insertProposal(proposal);
  } finally {
    state.close();
  }

  return { source, proposal };
}

async function readTarget(options: IngestSourceOptions): Promise<{
  kind: "file" | "url" | "text";
  title: string;
  content: string;
  originalRef: string;
  extension: string;
}> {
  if (options.kind === "text") {
    return {
      kind: "text",
      title: firstTextTitle(options.target),
      content: options.target,
      originalRef: "inline:text",
      extension: ".md"
    };
  }

  if (options.kind === "url" || /^https?:\/\//.test(options.target)) {
    const response = await fetch(options.target);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${options.target}: ${response.status} ${response.statusText}`);
    }
    const content = await response.text();
    return {
      kind: "url",
      title: new URL(options.target).hostname,
      content,
      originalRef: options.target,
      extension: ".html"
    };
  }

  const content = await readFile(options.target, "utf8");
  return {
    kind: "file",
    title: titleFromPath(options.target),
    content,
    originalRef: options.target,
    extension: extname(options.target) || ".txt"
  };
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, "").trim();
  return fallback || "Untitled";
}

function firstTextTitle(text: string): string {
  return text.split(/\s+/).slice(0, 6).join(" ") || "inline note";
}

function renderWikiPage(input: { title: string; source: SourceRecord; body: string; createdAt: string }): string {
  const excerpt = input.body.replace(/\s+/g, " ").trim().slice(0, 600);
  return `---
title: "${input.title.replaceAll('"', '\\"')}"
sources:
  - ${input.source.id}
created: ${input.createdAt}
---

# ${input.title}

## Summary

${excerpt || "No textual content extracted."}

## Sources

- ${input.source.id}: ${basename(input.source.rawPath)}
`;
}
```

- [ ] **Step 4: Implement review**

Create `packages/core/src/review.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { ProposalRecord } from "./types.js";

export interface ListPendingProposalsOptions {
  root: string;
}

export interface ApplyProposalOptions {
  root: string;
  proposalId: string;
}

export async function listPendingProposals(options: ListPendingProposalsOptions): Promise<ProposalRecord[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return state.listPendingProposals();
  } finally {
    state.close();
  }
}

export async function applyProposal(options: ApplyProposalOptions): Promise<ProposalRecord> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const proposal = state.getProposal(options.proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${options.proposalId}`);
    if (proposal.status !== "pending") throw new Error(`Proposal is not pending: ${options.proposalId}`);

    for (const change of proposal.changes) {
      const pagePath = join(paths.wiki, change.path);
      await mkdir(dirname(pagePath), { recursive: true });
      await writeFile(pagePath, change.content, "utf8");
      state.upsertPage({
        path: change.path,
        title: change.title,
        body: change.content,
        updatedAt: new Date().toISOString()
      });
    }

    state.markProposalStatus(proposal.id, "accepted", new Date().toISOString());
    return { ...proposal, status: "accepted" };
  } finally {
    state.close();
  }
}
```

- [ ] **Step 5: Implement query**

Create `packages/core/src/query.ts`:

```ts
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { QueryResult } from "./types.js";

export interface QueryVaultOptions {
  root: string;
  question: string;
  limit?: number;
}

export async function queryVault(options: QueryVaultOptions): Promise<QueryResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const hits = state.searchPages(options.question, options.limit ?? 5);
    const answer = hits.length === 0
      ? "No matching Notva wiki pages were found."
      : `Found ${hits.length} Notva wiki page(s): ${hits.map((hit) => `${hit.title} (${hit.path})`).join(", ")}.`;
    return { question: options.question, answer, hits };
  } finally {
    state.close();
  }
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./ingest.js";
export * from "./init.js";
export * from "./lint.js";
export * from "./paths.js";
export * from "./query.js";
export * from "./reindex.js";
export * from "./review.js";
export * from "./state.js";
export * from "./types.js";
```

- [ ] **Step 6: Run flow test to verify it passes**

Run:

```bash
pnpm vitest run packages/core/src/ingest-review-query.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run all checks**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit ingest/review/query**

Run:

```bash
git add packages/core/src
git commit -m "feat: add ingest review and query flow"
```

Expected: a commit is created for the core knowledge flow.

## Task 4: Reindex And Lint

**Files:**
- Create: `packages/core/src/reindex.ts`
- Create: `packages/core/src/lint.ts`
- Create: `packages/core/src/lint.test.ts`

- [ ] **Step 1: Write failing lint test**

Create `packages/core/src/lint.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";
import { lintVault } from "./lint.js";
import { reindexVault } from "./reindex.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-lint-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("lintVault", () => {
  test("reports missing sources and broken wiki links", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await mkdir(join(root, "wiki"), { recursive: true });
    await writeFile(join(root, "wiki", "orphan.md"), "# Orphan\n\nThis links to [[Missing Page]].", "utf8");

    await reindexVault({ root });
    const issues = await lintVault({ root });

    expect(issues.some((issue) => issue.code === "missing_sources")).toBe(true);
    expect(issues.some((issue) => issue.code === "broken_wiki_link")).toBe(true);
  });
});
```

- [ ] **Step 2: Run lint test to verify it fails**

Run:

```bash
pnpm vitest run packages/core/src/lint.test.ts
```

Expected: FAIL because lint and reindex modules are not implemented.

- [ ] **Step 3: Implement reindex**

Create `packages/core/src/reindex.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";

export interface ReindexVaultOptions {
  root: string;
}

export async function reindexVault(options: ReindexVaultOptions): Promise<number> {
  const paths = resolveVaultPaths(options.root);
  const files = await listMarkdownFiles(paths.wiki);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    for (const file of files) {
      const body = await readFile(file, "utf8");
      state.upsertPage({
        path: relative(paths.wiki, file),
        title: extractTitle(body, relative(paths.wiki, file)),
        body,
        updatedAt: new Date().toISOString()
      });
    }
    return files.length;
  } finally {
    state.close();
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function extractTitle(body: string, fallback: string): string {
  const title = body.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return title ? title.replace(/^#\s+/, "").trim() : fallback.replace(/\.md$/, "");
}
```

- [ ] **Step 4: Implement lint**

Create `packages/core/src/lint.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { LintIssue, PageRecord } from "./types.js";

export interface LintVaultOptions {
  root: string;
}

export async function lintVault(options: LintVaultOptions): Promise<LintIssue[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const pages = state.listPages();
    const issues: LintIssue[] = [];
    const pageTitles = new Set(pages.map((page) => page.title.toLowerCase()));
    const pageSlugs = new Set(pages.map((page) => page.path.replace(/\.md$/, "").toLowerCase()));

    for (const page of pages) {
      if (!/sources:\s*\n\s*-\s+/m.test(page.body)) {
        issues.push({ code: "missing_sources", path: page.path, message: `${page.path} has no source references.` });
      }
      for (const link of extractWikiLinks(page.body)) {
        const normalized = link.toLowerCase();
        if (!pageTitles.has(normalized) && !pageSlugs.has(normalized.replace(/\s+/g, "-"))) {
          issues.push({ code: "broken_wiki_link", path: page.path, message: `${page.path} links to missing page "${link}".` });
        }
      }
    }

    for (const proposal of state.listPendingProposals()) {
      issues.push({ code: "pending_proposal", message: `Proposal ${proposal.id} is pending review.` });
    }

    for (const source of state.listSources()) {
      if (!pages.some((page) => page.body.includes(source.id))) {
        issues.push({ code: "source_without_page", message: `Source ${source.id} has no accepted wiki coverage.` });
      }
    }

    return issues;
  } finally {
    state.close();
  }
}

function extractWikiLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
}
```

- [ ] **Step 5: Run lint test to verify it passes**

Run:

```bash
pnpm vitest run packages/core/src/lint.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all checks**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit lint and reindex**

Run:

```bash
git add packages/core/src
git commit -m "feat: add reindex and lint"
```

Expected: a commit is created for maintenance commands.

## Task 5: CLI Commands

**Files:**
- Create: `packages/cli/src/main.test.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Write failing CLI integration test**

Create `packages/cli/src/main.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { main } from "./main.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-cli-"));
  roots.push(root);
  return root;
}

async function capture(argv: string[]): Promise<{ stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = vi.spyOn(console, "log").mockImplementation((message) => stdout.push(String(message)));
  const err = vi.spyOn(console, "error").mockImplementation((message) => stderr.push(String(message)));
  try {
    await main(argv);
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return { stdout, stderr };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("notva CLI", () => {
  test("runs init, ingest, review, query, and lint against a vault", async () => {
    const root = await tempRoot();
    const source = join(root, "source.md");
    await writeFile(source, "# Local Knowledge Vault\n\nNotva keeps durable Markdown wiki pages.", "utf8");

    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture(["ingest", source, "--vault", root])).stdout[0]).toContain("Created proposal");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("pending proposal");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied");

    const wikiPage = await readFile(join(root, "wiki", "local-knowledge-vault.md"), "utf8");
    expect(wikiPage).toContain("Notva keeps durable Markdown wiki pages");

    expect((await capture(["query", "durable markdown", "--vault", root])).stdout[0]).toContain("Local Knowledge Vault");
    expect((await capture(["lint", "--vault", root])).stdout[0]).toContain("No lint issues");
  });
});
```

- [ ] **Step 2: Run CLI test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/src/main.test.ts
```

Expected: FAIL because CLI commands are not implemented.

- [ ] **Step 3: Implement CLI commands**

Modify `packages/cli/src/main.ts`:

```ts
#!/usr/bin/env node

import {
  applyProposal,
  ingestSource,
  initVault,
  lintVault,
  listPendingProposals,
  queryVault,
  reindexVault
} from "@notva/core";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "init") {
    const root = args.positional[0] ?? process.cwd();
    await initVault({ root });
    console.log(`Initialized Notva vault at ${root}`);
    return;
  }

  const root = String(args.flags.get("vault") ?? process.cwd());

  if (command === "ingest") {
    const text = args.flags.get("text");
    const target = text === true ? args.positional.join(" ") : args.positional[0];
    if (!target) throw new Error("Usage: notva ingest <file|url> [--vault path] or notva ingest --text \"content\"");
    const result = await ingestSource({ root, target, kind: text === true ? "text" : undefined });
    console.log(`Created proposal ${result.proposal.id} from source ${result.source.id}`);
    return;
  }

  if (command === "review") {
    const apply = args.flags.get("apply");
    const pending = await listPendingProposals({ root });
    if (apply === "all") {
      for (const proposal of pending) {
        await applyProposal({ root, proposalId: proposal.id });
      }
      console.log(`Applied ${pending.length} proposal(s).`);
      return;
    }
    if (typeof apply === "string") {
      await applyProposal({ root, proposalId: apply });
      console.log(`Applied proposal ${apply}.`);
      return;
    }
    if (pending.length === 0) {
      console.log("No pending proposals.");
      return;
    }
    console.log(`${pending.length} pending proposal(s):\n${pending.map((proposal) => `- ${proposal.id}: ${proposal.summary}`).join("\n")}`);
    return;
  }

  if (command === "query") {
    const question = args.positional.join(" ");
    if (!question) throw new Error("Usage: notva query \"question\" [--vault path]");
    const result = await queryVault({ root, question });
    console.log(`${result.answer}\n${result.hits.map((hit) => `- ${hit.title}: ${hit.snippet}`).join("\n")}`.trim());
    return;
  }

  if (command === "lint") {
    const issues = await lintVault({ root });
    if (issues.length === 0) {
      console.log("No lint issues.");
      return;
    }
    console.log(issues.map((issue) => `${issue.code}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`).join("\n"));
    return;
  }

  if (command === "reindex") {
    const count = await reindexVault({ root });
    console.log(`Reindexed ${count} wiki page(s).`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp(): void {
  console.log(`Usage: notva <command> [args]

Commands:
  init [path]
  ingest <file|url> [--vault path]
  ingest --text "content" [--vault path]
  review [--vault path] [--apply all|proposal-id]
  query "question" [--vault path]
  lint [--vault path]
  reindex [--vault path]`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run CLI test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/src/main.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit CLI**

Run:

```bash
git add packages/cli/src packages/cli/package.json packages/cli/tsconfig.json
git commit -m "feat: add notva cli commands"
```

Expected: a commit is created for CLI commands.

## Task 6: README And MVP Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:

```md
# Notva

Notva is an AI-maintained personal knowledge vault. It follows the LLM Wiki pattern: keep raw sources, maintain a durable Markdown wiki, and retrieve from that wiki before answering questions or executing tasks.

## Status

Notva is early. The first milestone is a local CLI/Core MVP.

## Commands

```bash
notva init
notva ingest <file|url>
notva ingest --text "content"
notva review
notva review --apply all
notva query "question"
notva lint
notva reindex
```

## Vault Layout

```text
.notva/
  config.json
  state.db
  queue/
  logs/
raw/
wiki/
schema/
index/
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run a manual CLI smoke test**

Run:

```bash
tmpdir="$(mktemp -d)"
pnpm notva init "$tmpdir"
printf '# Smoke Test\n\nNotva can ingest and query local knowledge.\n' > "$tmpdir/source.md"
pnpm notva ingest "$tmpdir/source.md" --vault "$tmpdir"
pnpm notva review --vault "$tmpdir" --apply all
pnpm notva query "local knowledge" --vault "$tmpdir"
pnpm notva lint --vault "$tmpdir"
```

Expected:

```text
Initialized Notva vault at ...
Created proposal ...
Applied 1 proposal(s).
Found 1 Notva wiki page(s): Smoke Test (smoke-test.md).
No lint issues.
```

- [ ] **Step 4: Commit README and verification-ready MVP**

Run:

```bash
git add README.md
git commit -m "docs: add notva readme"
```

Expected: a commit is created for README documentation.

## Self-Review

Spec coverage:

```text
Notva project and CLI name: covered by package names, bin name, README, CLI tests.
CLI/core-first build: covered by packages/core and packages/cli.
Web App roadmap preserved: covered in the design spec; not implemented in this MVP plan.
Durable local Markdown wiki: covered by init, ingest, review, query tests.
Raw sources, wiki, schema, index, state separation: covered by init test.
AI-generated changes through review: represented as proposal-first ingest and apply-review flow.
Future retrieval and agent workflows: preserved by core boundaries; embeddings and Web UI remain later phases.
```

Placeholder scan:

```text
No TBD, TODO, "implement later", or unexpanded placeholder steps are present.
```

Type consistency:

```text
The plan consistently uses initVault, ingestSource, listPendingProposals, applyProposal, queryVault, lintVault, and reindexVault.
```
