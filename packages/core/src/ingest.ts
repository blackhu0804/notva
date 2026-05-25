import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { ensureDir, resolveVaultPaths, sha256, shortId, slugify, titleFromPath } from "./paths.js";
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
