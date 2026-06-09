import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { exportGraphJson } from "./graph.js";
import { initVault } from "./init.js";
import { proposeMissingWikiLinks } from "./links.js";
import { applyProposal, listPendingProposals } from "./review.js";
import { writeWikiPage } from "./wiki.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-links-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("wiki link proposals", () => {
  test("creates reviewable update proposals for reviewed pages that mention each other without links", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "project-alpha.md",
      body: "# Project Alpha\n\nProject Alpha is the reviewed planning page."
    });
    await writeWikiPage({
      root,
      path: "meeting-notes.md",
      body: "# Meeting Notes\n\nThese notes discuss Project Alpha milestones without a wiki link."
    });
    await writeWikiPage({
      root,
      path: "already-linked.md",
      body: "# Already Linked\n\nThis page already links to [[Project Alpha]]."
    });

    const result = await proposeMissingWikiLinks({ root });

    expect(result.created).toBe(true);
    expect(result.suggestions).toEqual([
      {
        path: "meeting-notes.md",
        title: "Meeting Notes",
        targets: [{ path: "project-alpha.md", title: "Project Alpha" }]
      }
    ]);
    expect(result.proposal?.summary).toBe("Add missing wiki links to 1 reviewed page.");
    expect(result.proposal?.changes).toHaveLength(1);
    expect(result.proposal?.changes[0]).toMatchObject({
      type: "update_page",
      path: "meeting-notes.md",
      title: "Meeting Notes"
    });
    expect(result.proposal?.changes[0].content).toContain("## Related Wiki Pages");
    expect(result.proposal?.changes[0].content).toContain("- [[Project Alpha]] (project-alpha.md)");
    expect(result.proposal?.changes[0].content).not.toContain("[[Meeting Notes]]");

    const pending = await listPendingProposals({ root });
    expect(pending.map((proposal) => proposal.id)).toContain(result.proposal?.id);

    await applyProposal({ root, proposalId: String(result.proposal?.id) });
    const graph = await exportGraphJson({ root });
    expect(graph.edges).toContainEqual({
      source: "page:meeting-notes.md",
      target: "page:project-alpha.md",
      relation: "links_to",
      confidence: "EXTRACTED",
      evidence: "[[Project Alpha]]"
    });
  });

  test("reuses an existing pending missing-link proposal", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await writeWikiPage({
      root,
      path: "project-alpha.md",
      body: "# Project Alpha\n\nProject Alpha is a reviewed page."
    });
    await writeWikiPage({
      root,
      path: "meeting-notes.md",
      body: "# Meeting Notes\n\nMeeting notes mention Project Alpha."
    });

    const first = await proposeMissingWikiLinks({ root });
    const second = await proposeMissingWikiLinks({ root });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.proposal?.id).toBe(first.proposal?.id);
    expect(await listPendingProposals({ root })).toHaveLength(1);
  });
});
