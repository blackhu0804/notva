# Notva Design

Date: 2026-06-02

## Summary

Notva is a local-first, AI-maintained personal knowledge vault. It implements the LLM Wiki pattern: preserve raw sources, maintain a durable Markdown wiki, and use that wiki as retrieval context before answering questions or executing downstream tasks.

The project starts with a CLI-first workflow and grows into a Web App later. The CLI, Web App, and future agent workflows all reuse the same core engine so early technical work remains useful after the interface expands.

## Product Positioning

Notva is not only a RAG chat app. RAG retrieves context from existing material at query time. Notva also turns incoming material into a maintained knowledge base over time.

The user flow is:

```text
User feeds Notva content
-> Notva stores the original source
-> Notva proposes wiki updates
-> User reviews and applies changes
-> User asks questions or gives tasks
-> Notva searches the wiki and relevant sources first
-> Notva answers or acts with citations
-> Valuable results can become new wiki proposals
```

Tagline:

```text
AI-maintained personal knowledge vault
```

## Naming

Project name: Notva

Meaning: Notva compresses "note" and "vault". The name communicates a personal knowledge store without locking the project to one implementation of the LLM Wiki pattern.

Primary CLI binary:

```bash
notva
```

The project should avoid using `llm-wiki` as the command name. `LLM Wiki` is the pattern Notva implements, not the product identity.

## Goals

- Preserve user-owned knowledge assets as local files.
- Store raw sources separately from AI-maintained wiki pages.
- Generate wiki proposals instead of silently overwriting knowledge.
- Support CLI-first usage before building the Web App.
- Reuse core logic across CLI, local server, Web App, and agent workflows.
- Support provider-agnostic LLM and embedding integrations.
- Keep the first implementation small enough to ship while preserving a path to a full open-source product.

## Non-Goals For The First Version

- Multi-user collaboration.
- Cloud sync.
- Hosted SaaS.
- Rich graph visualization.
- Plugin marketplace.
- Complex permission models.
- Full Obsidian feature parity.

These can be added later if Notva's local-first core proves useful.

## Architecture

Notva should be implemented as a TypeScript monorepo:

```text
notva/
  packages/
    core/
    cli/
    server/
    web/
    providers/
  docs/
  examples/
```

Responsibilities:

```text
packages/core
  ingest, query, review, lint, act, indexing orchestration

packages/cli
  notva command-line interface

packages/server
  local API server used by the Web App

packages/web
  future local Web App workspace

packages/providers
  LLM, embedding, parser, search, and storage provider adapters
```

The dependency direction is:

```text
CLI -> core
Web -> server -> core
Agent workflows -> core
```

Core must not depend on CLI or Web UI code.

## Vault Layout

A Notva vault is a local directory with this structure:

```text
.notva/
  config.json
  state.db
  queue/
  logs/

raw/
  original user-provided sources

wiki/
  AI-maintained Markdown knowledge pages

schema/
  rules, templates, naming conventions, citation policy

index/
  search and vector indexes
```

`raw/` is the source of truth. Notva should preserve original source files whenever possible.

`wiki/` contains durable Markdown pages that users can browse, edit, version, and migrate.

`schema/` tells Notva how to classify content, create pages, update existing pages, format citations, and maintain links.

`.notva/state.db` stores operational metadata, including source records, ingest runs, proposal status, page-source mappings, index status, and review history.

## CLI Workflow

Initial commands:

```bash
notva init
notva ingest <file|url|text>
notva review
notva query "question"
notva lint
notva reindex
notva serve
```

MVP priority:

```text
init -> ingest -> review -> query -> lint
```

`notva serve` can exist later as the bridge into the local Web App.

## Ingestion

Ingestion has four stages:

```text
capture source
-> parse source into normalized content
-> retrieve related wiki pages
-> generate wiki update proposal
```

Ingestion should not directly overwrite wiki content. It creates proposals:

```text
create page
update page
add citation
add backlink
update index page
mark conflict
```

The user applies accepted proposals through `notva review`.

## Review

Review is the quality gate between AI output and durable knowledge.

Review should show:

```text
source summary
affected wiki pages
proposed diff
citations
confidence or uncertainty notes
detected conflicts
```

Accepted proposals update `wiki/` and metadata in `.notva/state.db`. Rejected proposals remain in history so Notva can explain prior decisions and avoid repeating obvious bad updates.

## Query

Query flow:

```text
user question
-> search wiki
-> optionally search raw sources
-> build evidence set
-> answer with citations
-> optionally create wiki proposal from valuable answer
```

The first version should use:

```text
SQLite FTS5
Markdown frontmatter
wiki links
source-page mappings
```

Later retrieval can add:

```text
embedding search
hybrid search
reranking
query decomposition
raw + wiki dual retrieval
```

## Lint And Maintenance

`notva lint` checks knowledge base health:

```text
orphan pages
broken wiki links
missing citations
duplicate concepts
stale index entries
conflicting claims
unapplied proposal backlog
sources with no wiki coverage
```

Lint should report issues first. Automatic fixes should be proposed as reviewable changes, not silently applied.

## Web App Plan

The Web App is the Notva workspace, not a separate product.

It should call the local server, which calls core:

```text
Web UI -> local API server -> core -> vault
```

Initial Web App screens:

```text
source upload
ingest queue
review diff
wiki browser
search
knowledge chat
source citation viewer
settings
```

The Web App should not require cloud hosting. The default mode is local.

## Agent Workflows

Notva's agent workflows must retrieve from the vault before acting.

Examples:

```text
write a summary using my notes
draft a project plan from existing wiki pages
compare two topics using saved sources
generate code with project-specific context
prepare a reading list from my knowledge base
```

Each workflow should expose what knowledge it used and whether it created follow-up wiki proposals.

## Provider Strategy

Notva should support provider adapters instead of hard-coding one model vendor.

Provider categories:

```text
LLM providers
embedding providers
parser providers
search providers
storage providers
```

The first version can support one practical LLM provider and one local search backend, while keeping interfaces open for future providers.

## Open-Source Roadmap

Phase 0: Identity and release foundation

```text
confirm package availability
choose license
write README positioning
define contribution guidelines
define project structure
```

Phase 1: CLI/Core MVP

```text
notva init
notva ingest
notva review
notva query
notva lint
Markdown wiki
SQLite metadata and FTS
```

Phase 2: Better ingestion

```text
web pages
PDF
Markdown
plain text
code notes
chat logs
source normalization
```

Phase 3: Retrieval upgrade

```text
embeddings
hybrid search
reranking
citation tracing
query-to-wiki proposals
```

Phase 4: Web App

```text
notva serve
local Web UI
upload
review
browse
search
chat
settings
```

Phase 5: Agent workflows

```text
retrieval-before-action
writing workflows
planning workflows
summarization workflows
coding workflows
wiki proposal generation
```

Phase 6: Ecosystem

```text
provider plugins
parser plugins
vault templates
Homebrew package
npm package
PyPI package if Python tooling is added
community examples
```

## Risks

Knowledge quality can degrade if AI writes directly into the wiki. Mitigation: proposal-first review flow.

Retrieval can become unreliable as the vault grows. Mitigation: start with FTS, then add hybrid retrieval and reranking.

Parsing many file types can expand scope quickly. Mitigation: begin with Markdown, text, and URLs, then add PDFs and richer formats later.

Open-source naming can collide with existing products. Mitigation: reserve exact package names early and run a deeper trademark and registry check before public launch.

Web UI can distract from the core. Mitigation: build CLI/core first and make Web App reuse the same core API.

## Acceptance Criteria For The Design

The design is accepted when:

```text
Notva is the project and CLI name.
The first build is CLI/core-first.
The Web App remains part of the technical roadmap.
The vault stores durable local Markdown knowledge.
Raw sources, wiki pages, schema, index, and state are separate.
AI-generated changes go through review before becoming durable wiki content.
Future retrieval and agent workflows are preserved in the architecture.
```
