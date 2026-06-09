import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { generateGraphReport } from "./report.js";
import { applyProposal } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-report-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("graph report", () => {
  test("writes an audit report with graph health, cross-page links, and suggested questions", async () => {
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
      target: "# Beta Page\n\nBeta receives graph context."
    });
    const orphan = await ingestSource({
      root,
      kind: "text",
      target: "# Orphan Page\n\nThis page is reviewed but disconnected from other wiki pages."
    });
    await ingestSource({
      root,
      kind: "text",
      target: "# Uncovered Source\n\nThis source remains pending and has no wiki coverage."
    });

    await applyProposal({ root, proposalId: alpha.proposal.id });
    await applyProposal({ root, proposalId: beta.proposal.id });
    await applyProposal({ root, proposalId: orphan.proposal.id });

    const result = await generateGraphReport({ root });
    const report = await readFile(join(root, ".notva", "graph-report.md"), "utf8");

    expect(result.path).toBe(join(root, ".notva", "graph-report.md"));
    expect(result.analysis.nodeCount).toBe(7);
    expect(result.analysis.edgeCount).toBe(7);
    expect(result.analysis.mostConnected[0]?.label).toBe("Alpha Page");
    expect(result.analysis.orphanPages.map((page) => page.label)).toContain("Orphan Page");
    expect(result.analysis.uncoveredSources.map((source) => source.label)).toContain("Uncovered Source");
    expect(result.analysis.crossPageLinks.map((link) => `${link.sourceLabel} -> ${link.targetLabel}`)).toContain("Alpha Page -> Beta Page");
    expect(report).toContain("# Notva Graph Report");
    expect(report).toContain("## Most Connected Pages And Concepts");
    expect(report).toContain("Alpha Page");
    expect(report).toContain("## Orphan Pages");
    expect(report).toContain("Orphan Page");
    expect(report).toContain("## Sources With No Wiki Coverage");
    expect(report).toContain("Uncovered Source");
    expect(report).toContain("## Surprising Cross-Page Links");
    expect(report).toContain("Alpha Page -> Beta Page");
    expect(report).toContain("## Suggested Questions");
  });

  test("suggests promoting explicit unresolved concepts into wiki pages", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha mentions [[Loose Concept]] explicitly."
    });
    await applyProposal({ root, proposalId: alpha.proposal.id });

    const result = await generateGraphReport({ root });

    expect(result.analysis.openConcepts.map((concept) => concept.label)).toContain("Loose Concept");
    expect(result.markdown).toContain("## Open Concepts");
    expect(result.markdown).toContain("Loose Concept");
    expect(result.markdown).toContain("Should Loose Concept become a reviewed wiki page?");
  });

  test("reports when the graph has uncertain relationships", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeFile(join(root, ".notva", "graph-report.md"), "", "utf8");

    const result = await generateGraphReport({
      root,
      graph: {
        schemaVersion: 1,
        nodes: [
          { id: "page:alpha.md", label: "Alpha", kind: "page", path: "alpha.md" },
          { id: "page:beta.md", label: "Beta", kind: "page", path: "beta.md" }
        ],
        edges: [
          {
            source: "page:alpha.md",
            target: "page:beta.md",
            relation: "possibly_related_to",
            confidence: "AMBIGUOUS",
            evidence: "same wording"
          }
        ]
      }
    });

    expect(result.analysis.uncertainEdges).toHaveLength(1);
    expect(result.markdown).toContain("## Inferred Or Ambiguous Relationships");
    expect(result.markdown).toContain("Alpha -> Beta");
    expect(result.markdown).toContain("AMBIGUOUS");
  });
});
