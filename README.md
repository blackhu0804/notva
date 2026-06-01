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
notva serve
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

## Local Web Workbench

```bash
pnpm notva serve --vault /path/to/vault --port 4321
```

Then open the printed local URL.
