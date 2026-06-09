import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { proposeQueryResult, queryVault } from "./query.js";
import { applyProposal, listPendingProposals } from "./review.js";
import { writeWikiPage } from "./wiki.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-query-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("query proposals", () => {
  test("hybrid retrieval finds semantic matches and explains reranking", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "coffee-brewing.md",
      body: "# Coffee Brewing\n\nEspresso dialing captures grind size, dose, pressure, and extraction time."
    });
    await writeWikiPage({
      root,
      path: "garden-plan.md",
      body: "# Garden Plan\n\nTomato seedlings need light, water, and soil temperature notes."
    });

    const result = await queryVault({ root, question: "how should I tune an espresso recipe", limit: 1 });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].path).toBe("coffee-brewing.md");
    expect(result.hits[0].retrieval.method).toBe("hybrid");
    expect(result.hits[0].retrieval.vectorScore).toBeGreaterThan(0);
    expect(result.hits[0].retrieval.rerankScore).toBeGreaterThan(0);
    expect(result.answer).toContain("hybrid");
  });

  test("attaches source provenance to reviewed wiki hits", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Query Provenance\n\nQuery results should show which raw source supports the reviewed page."
    });
    await applyProposal({ root, proposalId: ingest.proposal.id });

    const result = await queryVault({ root, question: "raw source supports" });

    expect(result.hits[0].title).toBe("Query Provenance");
    expect(result.hits[0].sources).toEqual([{
      id: ingest.source.id,
      kind: "text",
      title: "Query Provenance",
      rawPath: ingest.source.rawPath,
      originalRef: "inline:text",
      createdAt: ingest.source.createdAt,
      sha256: ingest.source.sha256
    }]);
    expect(result.answer).toContain(`sources: ${ingest.source.id}`);
  });

  test("turns a useful query answer into a reviewable wiki proposal", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "query-seed.md",
      body: "# Query Seed\n\nQuery proposal evidence should be reusable."
    });

    const result = await proposeQueryResult({ root, question: "query proposal evidence" });

    expect(result.created).toBe(true);
    expect(result.query.hits[0].path).toBe("query-seed.md");
    expect(result.source.originalRef).toBe("query:query proposal evidence");
    expect(await readFile(result.source.rawPath, "utf8")).toContain("Found 1 Notva wiki page");
    expect(result.proposal.summary).toContain("Create wiki page");
    expect(result.proposal.summary).toContain("Query Result: query proposal evidence");
    expect(result.proposal.changes[0].content).toContain("## Question");
    expect(result.proposal.changes[0].content).toContain("query proposal evidence");
    expect(result.proposal.changes[0].content).toContain("## Reviewed Wiki Evidence");
    expect(result.proposal.changes[0].content).toContain("Query Seed (query-seed.md)");
    expect(result.proposal.changes[0].content).toContain(result.source.id);

    const pending = await listPendingProposals({ root });
    expect(pending.map((proposal) => proposal.id)).toEqual([result.proposal.id]);
  });

  test("reuses an existing pending proposal for the same query result", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "stable-query.md",
      body: "# Stable Query\n\nStable query proposal reuse should avoid duplicate pending work."
    });

    const first = await proposeQueryResult({ root, question: "stable query proposal reuse" });
    const second = await proposeQueryResult({ root, question: "stable query proposal reuse" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.source.id).toBe(first.source.id);
    expect(second.proposal.id).toBe(first.proposal.id);
    expect(await listPendingProposals({ root })).toHaveLength(1);
  });
});
