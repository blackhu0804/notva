import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { listPendingProposalDetails } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-review-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("review proposal details", () => {
  test("includes source metadata and raw preview with pending proposals", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Review Evidence\n\nReview cards should show source evidence before approval."
    });

    const details = await listPendingProposalDetails({ root });

    expect(details).toHaveLength(1);
    expect(details[0].id).toBe(ingest.proposal.id);
    expect(details[0].sourceEvidence?.source.id).toBe(ingest.source.id);
    expect(details[0].sourceEvidence?.source.title).toBe("Review Evidence");
    expect(details[0].sourceEvidence?.source.originalRef).toBe("inline:text");
    expect(details[0].sourceEvidence?.preview).toContain("Review cards should show source evidence");
  });
});
