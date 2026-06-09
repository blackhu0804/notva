import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildContextPack, renderContextPackMarkdown } from "./context.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { applyProposal } from "./review.js";
import { writeWikiPage } from "./wiki.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-context-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("context pack", () => {
  test("combines query hits with graph neighborhoods for agent tasks", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha links to [[Beta Page]] and explains project context."
    });
    const beta = await ingestSource({
      root,
      kind: "text",
      target: "# Beta Page\n\nBeta contains execution guidance for downstream agent tasks."
    });
    await applyProposal({ root, proposalId: alpha.proposal.id });
    await applyProposal({ root, proposalId: beta.proposal.id });

    const pack = await buildContextPack({ root, query: "Beta Page execution guidance", limit: 3 });

    expect(pack.query).toBe("Beta Page execution guidance");
    expect(pack.answer).toContain("Notva wiki page");
    expect(pack.hits.map((hit) => hit.path)).toContain("beta-page.md");
    expect(pack.graph.neighborhoods.map((neighborhood) => neighborhood.node.label)).toContain("Beta Page");
    expect(pack.graph.neighborhoods.flatMap((neighborhood) => neighborhood.edges.map((edge) => edge.relation)))
      .toContain("links_to");
    const betaHit = pack.hits.find((hit) => hit.path === "beta-page.md");
    expect(betaHit?.sources.map((source) => source.id)).toEqual([beta.source.id]);
    expect(betaHit?.sources[0].originalRef).toBe("inline:text");
    expect(pack.sources.map((source) => source.id)).toContain(beta.source.id);
    expect(pack.sources.find((source) => source.id === beta.source.id)?.rawPath).toBe(beta.source.rawPath);
    expect(pack.sources.find((source) => source.id === beta.source.id)?.originalRef).toBe("inline:text");
    expect(pack.instructions).toContain("Use reviewed Notva wiki pages first");
    expect(pack.actions).toEqual([]);

    const markdown = renderContextPackMarkdown(pack);
    expect(markdown).toContain("# Notva Context Pack");
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain("Beta Page (beta-page.md)");
    expect(markdown).toContain("retrieval: hybrid");
    expect(markdown).toContain("rerank:");
    expect(markdown).toContain(`sources: ${beta.source.id} (inline:text)`);
    expect(markdown).toContain("## Sources");
    expect(markdown).toContain(`${beta.source.id}: Beta Page`);
    expect(markdown).toContain(beta.source.rawPath);
    expect(markdown).toContain("## Graph Neighborhoods");
    expect(markdown).toContain("Alpha Page --links_to--> Beta Page");
    expect(markdown).toContain("## Suggested Actions");
    expect(markdown).toContain("No immediate Notva maintenance actions.");
    expect(markdown).toContain("## Execution Guidance");
  });

  test("includes vault schema rules in context packs", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeFile(join(root, "schema", "notva.md"), [
      "# Personal Wiki Rules",
      "",
      "- Keep durable pages concise.",
      "- Use Chinese section titles for Chinese sources."
    ].join("\n"), "utf8");

    const pack = await buildContextPack({ root, query: "schema rules" });

    expect(pack.rules).toContain("Personal Wiki Rules");
    expect(pack.rules).toContain("Use Chinese section titles");
    expect(pack.instructions).toContain("Follow the vault rules before answering or acting");

    const markdown = renderContextPackMarkdown(pack);
    expect(markdown).toContain("## Vault Rules");
    expect(markdown).toContain("# Personal Wiki Rules");
    expect(markdown).toContain("- Keep durable pages concise.");
    expect(markdown).toContain("## Execution Guidance");
  });

  test("adds matching raw sources as secondary evidence when wiki coverage is thin", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const raw = await ingestSource({
      root,
      kind: "text",
      target: "# Unreviewed Source\n\nRaw-only Zephyr detail should still be visible before an agent acts."
    });

    const pack = await buildContextPack({ root, query: "Zephyr detail", limit: 3 });

    expect(pack.hits).toHaveLength(0);
    expect(pack.sourceHits.map((hit) => hit.source.id)).toContain(raw.source.id);
    expect(pack.sourceHits[0].snippet).toContain("Zephyr detail");
    expect(pack.instructions).toContain("Raw source matches are secondary evidence");
    expect(pack.actions.map((action) => action.command)).toContain(`notva source propose --uncovered --vault ${root}`);
    expect(pack.actions.map((action) => action.command)).toContain(`notva review --vault ${root}`);

    const markdown = renderContextPackMarkdown(pack);
    expect(markdown).toContain("## Raw Source Evidence");
    expect(markdown).toContain(`${raw.source.id}: Unreviewed Source`);
    expect(markdown).toContain("Raw-only Zephyr detail");
    expect(markdown).toContain("## Suggested Actions");
    expect(markdown).toContain(`notva source propose --uncovered --vault ${root}`);
    expect(markdown).toContain(`notva review --vault ${root}`);
  });

  test("suggests link-proposal commands when reviewed pages mention each other without wiki links", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "project-alpha.md",
      body: "# Project Alpha\n\nProject Alpha is reviewed context."
    });
    await writeWikiPage({
      root,
      path: "meeting-notes.md",
      body: "# Meeting Notes\n\nMeeting notes mention Project Alpha milestones."
    });

    const pack = await buildContextPack({ root, query: "Meeting Notes", limit: 3 });

    expect(pack.actions.map((action) => action.command)).toContain(`notva links propose --vault ${root}`);
    expect(renderContextPackMarkdown(pack)).toContain(`notva links propose --vault ${root}`);
  });
});
