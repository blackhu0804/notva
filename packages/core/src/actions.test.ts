import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runMaintenanceAction } from "./actions.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { listPendingProposals, rejectProposal } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-actions-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("maintenance actions", () => {
  test("runs supported source-promotion actions without shell execution", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Action Raw Source\n\nRaw action source should become a proposal."
    });
    await rejectProposal({ root, proposalId: ingest.proposal.id });

    const result = await runMaintenanceAction({
      root,
      command: `notva source propose --uncovered --vault ${root}`
    });

    expect(result.kind).toBe("source_propose_uncovered");
    expect(result.changed).toBe(true);
    expect(result.message).toContain("Proposed 1 uncovered source");
    expect((await listPendingProposals({ root })).map((proposal) => proposal.sourceId)).toContain(ingest.source.id);
  });

  test("reports review actions without applying proposals", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Review Action Source\n\nReview action should keep the proposal pending."
    });

    const result = await runMaintenanceAction({
      root,
      command: `notva review --vault ${root}`
    });

    expect(result.kind).toBe("review");
    expect(result.changed).toBe(false);
    expect(result.message).toContain("1 pending proposal");
    expect((await listPendingProposals({ root })).map((proposal) => proposal.id)).toContain(ingest.proposal.id);
  });

  test("rejects unsupported commands instead of running arbitrary shell", async () => {
    const root = await tempRoot();
    await initVault({ root });

    await expect(runMaintenanceAction({ root, command: "rm -rf /" }))
      .rejects.toThrow("Unsupported Notva maintenance action");
  });
});
