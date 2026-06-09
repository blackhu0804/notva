import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { lintVault } from "./lint.js";
import { proposeOpenConceptPages } from "./concepts.js";
import { applyProposal, listPendingProposals } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-concepts-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("open concept proposals", () => {
  test("creates a reviewable wiki page proposal for unresolved explicit concepts", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha mentions [[Loose Concept]] as a future page."
    });
    await applyProposal({ root, proposalId: alpha.proposal.id });

    expect((await lintVault({ root })).map((issue) => issue.code)).toContain("open_concept");

    const result = await proposeOpenConceptPages({ root });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].concept).toBe("Loose Concept");
    expect(result.created[0].proposal.changes[0]).toMatchObject({
      type: "create_page",
      path: "loose-concept.md",
      title: "Loose Concept"
    });
    expect(result.created[0].proposal.changes[0].content).toContain("[[Alpha Page]]");

    const pending = await listPendingProposals({ root });
    expect(pending.map((proposal) => proposal.summary)).toContain("Create wiki page for open concept \"Loose Concept\".");

    await applyProposal({ root, proposalId: result.created[0].proposal.id });

    const conceptPage = await readFile(join(root, "wiki", "loose-concept.md"), "utf8");
    expect(conceptPage).toContain("# Loose Concept");
    expect(conceptPage).toContain("[[Alpha Page]]");
    expect((await lintVault({ root })).map((issue) => issue.code)).not.toContain("open_concept");
  });

  test("does not recreate a proposal for an open concept that already has one", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Alpha Page\n\nAlpha mentions [[Loose Concept]]."
    });
    await applyProposal({ root, proposalId: alpha.proposal.id });

    const first = await proposeOpenConceptPages({ root });
    const second = await proposeOpenConceptPages({ root });

    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toContain("Loose Concept");
  });
});
