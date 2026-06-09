import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { actVault } from "./act.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { applyProposal } from "./review.js";
import { getVaultStatus } from "./status.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-status-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("vault status", () => {
  test("summarizes the current vault health and activity", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "status.md");
    await writeFile(sourcePath, "# Status Page\n\nStatus summaries should include reviewed pages.", "utf8");
    const applied = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: applied.proposal.id });
    await ingestSource({
      root,
      kind: "text",
      target: "# Pending Status Source\n\nPending status proposals should be counted."
    });
    await actVault({ root, task: "Review status summaries" });

    const status = await getVaultStatus({ root });

    expect(status.root).toBe(root);
    expect(status.sourceCount).toBe(2);
    expect(status.pageCount).toBe(1);
    expect(status.pendingProposalCount).toBe(1);
    expect(status.lintIssueCount).toBe(2);
    expect(status.issueCounts.pending_proposal).toBe(1);
    expect(status.issueCounts.source_without_page).toBe(1);
    expect(status.actRunCount).toBe(1);
    expect(status.lastActRun?.task).toBe("Review status summaries");
    expect(status.health).toBe("needs_review");
  });
});
