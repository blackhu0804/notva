import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { exportGraphJson, rebuildGraph } from "./graph.js";
import { resolveVaultPaths, sha256, shortId, slugify } from "./paths.js";
import { NotvaState } from "./state.js";
import type { GraphEdgeRecord, GraphNodeRecord, ProposalRecord, SourceRecord } from "./types.js";

export interface ProposeOpenConceptPagesOptions {
  root: string;
}

export interface ConceptProposalRecord {
  concept: string;
  proposal: ProposalRecord;
}

export interface ProposeOpenConceptPagesResult {
  created: ConceptProposalRecord[];
  skipped: string[];
}

export async function proposeOpenConceptPages(options: ProposeOpenConceptPagesOptions): Promise<ProposeOpenConceptPagesResult> {
  const paths = resolveVaultPaths(options.root);
  await rebuildGraph({ root: options.root });
  const graph = await exportGraphJson({ root: options.root });
  const pagesById = new Map(graph.nodes.filter((node) => node.kind === "page").map((node) => [node.id, node]));
  const mentionEdges = graph.edges.filter((edge) => edge.relation === "mentions");
  const created: ConceptProposalRecord[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    for (const concept of graph.nodes.filter((node) => node.kind === "concept").sort((a, b) => a.label.localeCompare(b.label))) {
      const mentions = mentionEdges
        .filter((edge) => edge.target === concept.id)
        .map((edge) => ({ edge, page: pagesById.get(edge.source) }))
        .filter((mention): mention is { edge: GraphEdgeRecord; page: GraphNodeRecord } => Boolean(mention.page));
      const pagePath = `${slugify(concept.label)}.md`;
      const source = renderConceptSource(concept, mentions.map((mention) => mention.page));
      const sourceId = shortId(`open-concept-source:${concept.id}:${source}`);
      const proposalId = shortId(`open-concept-proposal:${concept.id}:${pagePath}`);
      if (state.getProposal(proposalId)) {
        skipped.push(concept.label);
        continue;
      }

      const rawDir = join(paths.raw, now.slice(0, 10));
      await mkdir(rawDir, { recursive: true });
      const rawPath = join(rawDir, `open-concept-${slugify(concept.label)}-${sourceId}.md`);
      await writeFile(rawPath, source, "utf8");

      const sourceRecord: SourceRecord = {
        id: sourceId,
        kind: "text",
        title: `Open concept: ${concept.label}`,
        rawPath,
        originalRef: `notva:open-concept:${concept.label}`,
        createdAt: now,
        sha256: sha256(source)
      };
      const proposal: ProposalRecord = {
        id: proposalId,
        sourceId,
        status: "pending",
        summary: `Create wiki page for open concept "${concept.label}".`,
        changes: [{
          type: "create_page",
          path: pagePath,
          title: concept.label,
          content: renderConceptPage(concept, mentions.map((mention) => mention.page), sourceRecord, now)
        }],
        createdAt: now,
        updatedAt: now
      };
      state.insertSource(sourceRecord);
      state.insertProposal(proposal);
      created.push({ concept: concept.label, proposal });
    }
  } finally {
    state.close();
  }

  return { created, skipped };
}

function renderConceptSource(concept: GraphNodeRecord, pages: GraphNodeRecord[]): string {
  return [
    `# Open concept: ${concept.label}`,
    "",
    "This source was generated from explicit unresolved Notva wiki links.",
    "",
    "Mentioned by:",
    ...pages.map((page) => `- ${page.label}${page.path ? ` (${page.path})` : ""}`),
    ""
  ].join("\n");
}

function renderConceptPage(concept: GraphNodeRecord, pages: GraphNodeRecord[], source: SourceRecord, createdAt: string): string {
  return `---
title: "${concept.label.replaceAll('"', '\\"')}"
sources:
  - ${source.id}
created: ${createdAt}
---

# ${concept.label}

## Summary

This page was proposed because ${concept.label} was mentioned as an unresolved wiki link.

## Mentions

${pages.map((page) => `- [[${page.label}]]${page.path ? ` (${page.path})` : ""}`).join("\n") || "- No page mentions recorded."}

## Sources

- ${source.id}: ${basename(source.rawPath)}
`;
}
