import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { applyProposal, listPendingProposals, rejectProposal } from "./review.js";
import { listSources, proposeSource, proposeUncoveredSources, readSource } from "./source.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-source-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("sources", () => {
  test("lists source metadata and reads preserved raw content", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "raw-note.md");
    await writeFile(sourcePath, "# Raw Source Note\n\nOriginal source content should stay readable.", "utf8");

    const ingest = await ingestSource({ root, target: sourcePath });

    const sources = await listSources({ root });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual(ingest.source);

    const raw = await readSource({ root, id: ingest.source.id });
    expect(raw.source).toEqual(ingest.source);
    expect(raw.body).toContain("# Raw Source Note");
    expect(raw.body).toContain("Original source content should stay readable.");

    const savedRaw = await readFile(ingest.source.rawPath, "utf8");
    expect(raw.body).toBe(savedRaw);
  });

  test("promotes a preserved raw source into a fresh reviewable proposal", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Promote Raw Source\n\nRaw source promotion should create a new wiki proposal."
    });
    await rejectProposal({ root, proposalId: ingest.proposal.id });

    const promoted = await proposeSource({ root, id: ingest.source.id });

    expect(promoted.created).toBe(true);
    expect(promoted.source).toEqual(ingest.source);
    expect(promoted.proposal.id).not.toBe(ingest.proposal.id);
    expect(promoted.proposal.status).toBe("pending");
    expect(promoted.proposal.sourceId).toBe(ingest.source.id);
    expect(promoted.proposal.summary).toContain("Promote Raw Source");
    expect(promoted.proposal.changes[0].content).toContain("Raw source promotion should create a new wiki proposal.");

    const pending = await listPendingProposals({ root });
    expect(pending.map((proposal) => proposal.id)).toContain(promoted.proposal.id);
  });

  test("reuses an existing pending proposal when promoting the same source twice", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Pending Raw Source\n\nRaw source promotion should not duplicate pending work."
    });

    const promoted = await proposeSource({ root, id: ingest.source.id });

    expect(promoted.created).toBe(false);
    expect(promoted.proposal.id).toBe(ingest.proposal.id);
    expect((await listPendingProposals({ root })).filter((proposal) => proposal.sourceId === ingest.source.id))
      .toHaveLength(1);
  });

  test("promotes uncovered sources while skipping accepted wiki coverage", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const covered = await ingestSource({
      root,
      kind: "text",
      target: "# Covered Source\n\nThis source already has accepted wiki coverage."
    });
    await applyProposal({ root, proposalId: covered.proposal.id });
    const rejected = await ingestSource({
      root,
      kind: "text",
      target: "# Rejected Source\n\nThis source needs a fresh proposal after rejection."
    });
    await rejectProposal({ root, proposalId: rejected.proposal.id });
    const pending = await ingestSource({
      root,
      kind: "text",
      target: "# Pending Source\n\nThis source already has a pending proposal."
    });

    const result = await proposeUncoveredSources({ root });

    expect(result.skipped.map((source) => source.id)).toEqual([covered.source.id]);
    expect(result.results.map((entry) => entry.source.id)).toEqual([rejected.source.id, pending.source.id]);
    expect(result.results.map((entry) => entry.created)).toEqual([true, false]);
    expect(result.results[0].proposal.id).not.toBe(rejected.proposal.id);
    expect(result.results[1].proposal.id).toBe(pending.proposal.id);
    const pendingBySource = (await listPendingProposals({ root })).map((proposal) => proposal.sourceId);
    expect(pendingBySource).toContain(rejected.source.id);
    expect(pendingBySource).toContain(pending.source.id);
    expect(pendingBySource).not.toContain(covered.source.id);
  });
});
