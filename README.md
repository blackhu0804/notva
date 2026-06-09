# Notva

[中文 README](./README.zh-CN.md)

Notva is an AI-maintained personal knowledge vault. It follows the LLM Wiki pattern: keep raw sources, maintain a durable Markdown wiki, and retrieve from that wiki before answering questions or executing tasks.

## Status

Notva is early. The first milestone is a local CLI/Core MVP.

## Core Workflow

```text
capture raw source
-> create a reviewable wiki proposal
-> apply accepted changes into Markdown pages
-> query reviewed wiki evidence
-> build a context pack with reviewed wiki and matching raw-source evidence before downstream actions
-> follow suggested maintenance actions when context reveals thin or stale knowledge
-> use graph/report/explain/path to audit relationships
```

Notva keeps raw inputs in `raw/`, reviewed knowledge in `wiki/`, and operational metadata in `.notva/state.db`.

The default vault path is `~/Notva`, so `notva init`, `notva ingest`, `notva query`, `notva act`, and `notva serve` work from a user-owned directory even when you run them outside a project folder. Pass `--vault /path/to/vault` for one command, or set `NOTVA_VAULT=/path/to/vault` to change the default.

URL ingestion keeps raw HTML in `raw/` while proposing readable wiki text extracted from the page title and visible body content.

Directory ingestion recursively reads common text files, code notes, logs, structured text, and chat logs. Supported directory imports include Markdown/text/HTML, JSON chat logs, JSONL logs, CSV/TSV, YAML/TOML/INI/env files, common programming languages, shell scripts, SQL, CSS/XML, and `.log` files. Notva preserves raw files as captured sources and creates one reviewable proposal per supported file.

Repeated ingestion reuses existing sources and proposals for identical content, so accepted reviews are not reopened as pending work.

When new source text explicitly mentions an existing reviewed wiki page title, Notva adds a `Related Wiki Pages` section with a `[[Wiki Link]]` in the reviewable proposal. This keeps newly captured notes connected to the graph without making fuzzy inferences.

Use `notva links propose` to scan reviewed wiki pages for missing wiki links and create a reviewable update proposal.

Use `notva source list` and `notva source show <id>` to inspect preserved raw sources when you need to verify where a reviewed wiki page came from. Use `notva source propose <id>` to promote a preserved raw source back into the review queue when raw evidence should become durable wiki knowledge. Use `notva source propose --uncovered` to promote every raw source without accepted wiki coverage.

During review, CLI output and Web review cards show the source evidence attached to each pending proposal, including the source ID, original reference, and a raw preview.

## Commands

```bash
notva init
notva ingest <file|directory|url>
notva ingest /path/to/notes
notva ingest --text "content"
notva review
notva review --apply all
notva page list
notva page show <path>
notva page save <path> --content-file file
notva links propose
notva source list
notva source show <id>
notva source propose <id>
notva source propose --uncovered
notva query "question"
notva query "question" --propose
notva context "question or task"
notva context "question or task" --json
notva rules show
notva rules save --content-file file
notva status
notva doctor
notva act "task"
notva act "task" --json
notva act "task" --run-actions --json
notva act "task" --propose
notva act list
notva act show <id>
notva act propose <id>
notva action run --command "notva source propose --uncovered --vault /path/to/vault"
notva lint
notva reindex
notva graph export
notva graph html
notva explain <page-or-concept>
notva path <from> <to>
notva report
notva concepts propose
notva install --platform codex
notva install --platform codex --project
notva serve
```

## Graph Layer

Notva derives a local graph from reviewed pages, citations, sources, and wiki links. This gives agents and users a compact structure to inspect before reading broad raw folders.

Resolved wiki links become page-to-page relationships. Explicit unresolved wiki links like `[[Loose Concept]]` become open concept nodes, which helps reveal pages that should be created later.

Applying accepted proposals refreshes derived graph relationships, so `notva explain`, `notva path`, reports, and context packs can use newly reviewed links without a separate reindex step.

```bash
notva graph export --vault /path/to/vault
notva graph html --vault /path/to/vault
notva explain <page-or-concept> --vault /path/to/vault
notva path <from> <to> --vault /path/to/vault
notva report --vault /path/to/vault
```

`notva context "question or task"` builds a context pack for downstream agent work. It combines reviewed wiki search hits, matching raw source evidence, source provenance, graph neighborhoods for the matched pages, suggested maintenance actions, Vault Rules loaded from `schema/*.md`, and execution guidance. Add `--json` when another tool should consume the pack programmatically.

Use `notva rules show` to inspect the default vault rule file at `schema/notva.md`, and `notva rules save --content-file file` to update it from the CLI. These editable Vault Rules are included in every context pack so downstream actions can follow your local citation, naming, and maintenance preferences.

Use `notva status` for a vault status overview with source, page, pending proposal, lint issue, and act run counts. Use `notva doctor` for onboarding and release smoke checks: it verifies whether the vault is initialized, summarizes health and graph artifacts, and prints the next Notva command to run. The Web workbench shows the same overview as a compact metric strip near the top of the page.

Raw source matches are included as secondary evidence. They are useful when wiki coverage is thin, but they should be reviewed or promoted into wiki pages before being treated as durable knowledge.

Suggested actions can include commands such as `notva source propose --uncovered --vault /path/to/vault`, `notva links propose --vault /path/to/vault`, `notva concepts propose --vault /path/to/vault`, and `notva review --vault /path/to/vault`. These commands make retrieve-then-act workflows explicit: the agent can see which maintenance step should happen before treating the current context as complete.

Use `notva query "question" --propose` to turn a useful query result into a reviewable wiki proposal. Notva preserves the generated query result as a raw source first, then places the proposed page in the normal review queue.

Regular query results show source provenance for each reviewed wiki hit, including the supporting source IDs and original references, so you can verify where an answer came from before acting on it.

Query and context results use hybrid retrieval and reranking over reviewed wiki pages. The current local semantic baseline combines lexical page matches with lightweight vector similarity and exposes lexical, vector, and rerank scores beside each evidence item. Provider-backed embeddings can replace this baseline later without changing the retrieve-then-act contract.

The context and act outputs repeat source provenance beside each reviewed evidence item, so downstream agents can connect every retrieved wiki hit to its original source without cross-reading the separate source list first.

`notva act "task"` retrieves a context pack and returns an execution plan before the task output. The execution plan status is `ready`, `needs_maintenance`, or `missing_context`. Use `notva act "task" --json` when another agent or tool should inspect the status and action commands programmatically. Use `notva act "task" --run-actions --json` to run suggested actions and return a refreshed execution plan in one command. Use `notva act "task" --propose` to run a task and immediately create a reviewable wiki proposal from that act result.

Every act run is saved as local act run history in `.notva/state.db` with a Markdown log under `.notva/logs/`. Use `notva act list` to inspect recent runs and `notva act show <id>` to read a saved context, execution plan, and output again later. Use `notva act propose <id>` to turn a useful act run into a reviewable wiki proposal without silently writing to the durable wiki.

The Web workbench can run supported maintenance actions from the execution plan, such as source promotion, missing-link proposals, open-concept proposals, and review queue refreshes. Its act panel also has a `运行并沉淀` control that runs a task and immediately creates a reviewable wiki proposal from the act result, plus a `整理后运行` control that runs suggested maintenance actions first and then returns a refreshed execution plan. In the execution history panel, select a run and click `生成提案` to create a reviewable wiki proposal from that run. CLI can run the same allowlisted actions with `notva action run --command "notva ..." --vault /path/to/vault`. This runner is allowlisted and does not execute arbitrary shell commands.

Graph edges carry confidence labels:

```text
EXTRACTED
INFERRED
AMBIGUOUS
```

`notva report` writes `.notva/graph-report.md` with connected pages, orphan pages, open concepts, sources without wiki coverage, cross-page links, uncertain relationships, and suggested questions.

`notva graph html` writes `.notva/graph.html`, a portable offline viewer with embedded graph data, node lists, relationship lists, a lightweight SVG map, and controls to search, filter, and focus graph nodes.

`notva lint` also surfaces explicit open concepts so ordinary health checks can reveal missing future pages.

To turn open concepts into reviewable wiki page proposals:

```bash
notva concepts propose --vault /path/to/vault
notva review --vault /path/to/vault
notva review --vault /path/to/vault --apply all
```

## Provider Adapters

`@notva/providers` defines provider adapter boundaries for future LLM, embedding, parser, search, and storage integrations. The current MVP ships local defaults so the core does not hard-code a remote model vendor: `local-rule-based` for deterministic LLM-style completions, `local-noop-embedding` for placeholder vectors, and `local-substring-search` for local search behavior.

## Publishing Boundaries

The repository root stays private as a workspace guard; it is the monorepo entry point for development scripts, not the npm artifact users install.

The publishable CLI package lives in `packages/cli` as `notva` and exposes the `notva` bin. `@notva/core`, `@notva/server`, and `@notva/providers` are typed workspace packages with `dist` exports, while `@notva/web` remains private until the web app has a separate distribution story.

Notva is MIT-licensed. Keep `LICENSE` and package `license` fields aligned before publishing the public repository or npm packages.

## Agent Instructions

Install context-first Codex instructions so future agent sessions check Notva before broad file reads:

```bash
notva install --platform codex
notva install --platform codex --project
```

User-scoped install writes a Notva skill under the Codex config directory. Project-scoped install writes an `AGENTS.md` block and prints a `git add AGENTS.md` hint.

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

## Local Web Workbench

```bash
pnpm notva serve --vault /path/to/vault --port 4321
```

Then open the printed local URL.

The workbench includes an editable Vault Rules panel for `schema/notva.md`, with save and refresh controls. Saved rules immediately appear in context packs and act execution plans.

The graph panel can refresh graph data, generate `.notva/graph.html`, write a graph report, propose pages for open concepts, explain a page or concept, and find a path between two graph nodes.
