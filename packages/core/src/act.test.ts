import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { actVault } from "./act.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { applyProposal } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-act-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("actVault", () => {
  test("retrieves wiki evidence before producing a task output", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "web.md");
    await writeFile(sourcePath, "# Web Workbench\n\nNotva uses a local web workbench for review and query.", "utf8");
    const ingest = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: ingest.proposal.id });

    const result = await actVault({ root, task: "Draft a next step for the local web workbench" });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].title).toBe("Web Workbench");
    expect(result.output).toContain("Web Workbench");
    expect(result.output).toContain("Evidence");
  });
});
