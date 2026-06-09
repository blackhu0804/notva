import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { exportGraphHtml, exportGraphJson, findGraphPath, listGraphNeighbors, rebuildGraph } from "./graph.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { resolveVaultPaths } from "./paths.js";
import { reindexVault } from "./reindex.js";
import { applyProposal } from "./review.js";
import { NotvaState } from "./state.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-graph-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("graph layer", () => {
  test("stores graph records and exports a stable graph json shape", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const state = new NotvaState(resolveVaultPaths(root).stateDb);

    try {
      state.initialize();
      state.upsertGraphNode({ id: "page:beta", label: "Beta", kind: "page", path: "beta.md" });
      state.upsertGraphNode({ id: "source:alpha", label: "Alpha Source", kind: "source", sourceId: "alpha" });
      state.upsertGraphNode({ id: "page:alpha", label: "Alpha", kind: "page", path: "alpha.md" });
      state.upsertGraphEdge({
        source: "page:alpha",
        target: "page:beta",
        relation: "links_to",
        confidence: "EXTRACTED",
        evidence: "[[Beta]]"
      });
      state.upsertGraphEdge({
        source: "source:alpha",
        target: "page:alpha",
        relation: "supports",
        confidence: "EXTRACTED",
        sourceId: "alpha"
      });
    } finally {
      state.close();
    }

    const exported = await exportGraphJson({ root });

    expect(exported).toEqual({
      schemaVersion: 1,
      nodes: [
        { id: "page:alpha", label: "Alpha", kind: "page", path: "alpha.md" },
        { id: "page:beta", label: "Beta", kind: "page", path: "beta.md" },
        { id: "source:alpha", label: "Alpha Source", kind: "source", sourceId: "alpha" }
      ],
      edges: [
        {
          source: "page:alpha",
          target: "page:beta",
          relation: "links_to",
          confidence: "EXTRACTED",
          evidence: "[[Beta]]"
        },
        {
          source: "source:alpha",
          target: "page:alpha",
          relation: "supports",
          confidence: "EXTRACTED",
          sourceId: "alpha"
        }
      ]
    });

    const neighbors = await listGraphNeighbors({ root, id: "page:alpha" });

    expect(neighbors.node).toEqual({ id: "page:alpha", label: "Alpha", kind: "page", path: "alpha.md" });
    expect(neighbors.neighbors.map((node) => node.id)).toEqual(["page:beta", "source:alpha"]);
    expect(neighbors.edges.map((edge) => `${edge.source} ${edge.relation} ${edge.target}`)).toEqual([
      "page:alpha links_to page:beta",
      "source:alpha supports page:alpha"
    ]);
  });

  test("derives source, citation, and wiki-link relations from reviewed wiki pages", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha keeps evidence and links to [[Beta Page]]."
    });
    const beta = await ingestSource({
      root,
      kind: "text",
      target: "# Beta Page\n\nBeta is another reviewed page."
    });

    await applyProposal({ root, proposalId: alpha.proposal.id });
    await applyProposal({ root, proposalId: beta.proposal.id });

    const graphAfterApply = await exportGraphJson({ root });
    expect(graphAfterApply.edges).toContainEqual({
      source: `source:${alpha.source.id}`,
      target: "page:alpha-page.md",
      relation: "supports",
      confidence: "EXTRACTED",
      sourceId: alpha.source.id
    });

    await reindexVault({ root });
    const graphAfterReindex = await exportGraphJson({ root });
    expect(graphAfterReindex.edges).toContainEqual({
      source: "page:alpha-page.md",
      target: "page:beta-page.md",
      relation: "links_to",
      confidence: "EXTRACTED",
      evidence: "[[Beta Page]]"
    });
    expect(graphAfterReindex.edges).toContainEqual({
      source: "page:alpha-page.md",
      target: `source:${alpha.source.id}`,
      relation: "cites",
      confidence: "EXTRACTED",
      evidence: alpha.source.id,
      sourceId: alpha.source.id
    });

    const firstBuild = await rebuildGraph({ root });
    const firstExport = await exportGraphJson({ root });
    const secondBuild = await rebuildGraph({ root });
    const secondExport = await exportGraphJson({ root });

    expect(firstBuild).toEqual(secondBuild);
    expect(firstExport).toEqual(secondExport);
    expect(firstExport.nodes).toContainEqual({
      id: "page:alpha-page.md",
      label: "Alpha Page",
      kind: "page",
      path: "alpha-page.md"
    });
    expect(firstExport.nodes).toContainEqual({
      id: `source:${alpha.source.id}`,
      label: alpha.source.title,
      kind: "source",
      sourceId: alpha.source.id
    });
    expect(firstExport.edges).toContainEqual({
      source: "page:alpha-page.md",
      target: "page:beta-page.md",
      relation: "links_to",
      confidence: "EXTRACTED",
      evidence: "[[Beta Page]]"
    });
    expect(firstExport.edges).toContainEqual({
      source: "page:alpha-page.md",
      target: `source:${alpha.source.id}`,
      relation: "cites",
      confidence: "EXTRACTED",
      evidence: alpha.source.id,
      sourceId: alpha.source.id
    });
    expect(firstExport.edges).toContainEqual({
      source: `source:${alpha.source.id}`,
      target: "page:alpha-page.md",
      relation: "supports",
      confidence: "EXTRACTED",
      sourceId: alpha.source.id
    });
  });

  test("turns unresolved wiki links into explicit concept mentions", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha names [[Loose Concept]] before a page exists."
    });

    await applyProposal({ root, proposalId: alpha.proposal.id });
    await rebuildGraph({ root });

    const graph = await exportGraphJson({ root });
    expect(graph.nodes).toContainEqual({
      id: "concept:loose-concept",
      label: "Loose Concept",
      kind: "concept"
    });
    expect(graph.edges).toContainEqual({
      source: "page:alpha-page.md",
      target: "concept:loose-concept",
      relation: "mentions",
      confidence: "EXTRACTED",
      evidence: "[[Loose Concept]]"
    });

    const path = await findGraphPath({ root, from: "Alpha Page", to: "Loose Concept" });
    expect(path.nodes.map((node) => node.id)).toEqual(["page:alpha-page.md", "concept:loose-concept"]);
    expect(path.edges.map((edge) => edge.relation)).toEqual(["mentions"]);
  });

  test("writes a portable graph html viewer", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha links to [[Beta Page]]."
    });
    const beta = await ingestSource({
      root,
      kind: "text",
      target: "# Beta Page\n\nBeta is linked knowledge."
    });

    await applyProposal({ root, proposalId: alpha.proposal.id });
    await applyProposal({ root, proposalId: beta.proposal.id });

    const result = await exportGraphHtml({ root });
    const html = await readFile(join(root, ".notva", "graph.html"), "utf8");

    expect(result.path).toBe(join(root, ".notva", "graph.html"));
    expect(result.graph.nodes.map((node) => node.label)).toContain("Alpha Page");
    expect(result.graph.edges.map((edge) => edge.relation)).toContain("links_to");
    expect(html).toBe(result.html);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Notva Graph</title>");
    expect(html).toContain("window.NOTVA_GRAPH =");
    expect(html).toContain("\"label\":\"Alpha Page\"");
    expect(html).toContain("\"relation\":\"links_to\"");
    expect(html).toContain("id=\"graph-search\"");
    expect(html).toContain("id=\"visible-count\"");
    expect(html).toContain("data-kind=\"page\"");
    expect(html).toContain("data-kind=\"source\"");
    expect(html).toContain("data-kind=\"concept\"");
    expect(html).toContain("data-node-id");
    expect(html).toContain("data-edge-index");
    expect(html).toContain("let selectedNodeId = null");
    expect(html).toContain("function applyGraphFilters()");
  });
});
