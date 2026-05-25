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
