import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { actVault } from "./act.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { queryVault } from "./query.js";
import { applyProposal } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-chinese-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("Chinese content support", () => {
  test("keeps Chinese page titles and retrieves Chinese wiki evidence", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "中文资料.md");
    await writeFile(sourcePath, "# 本地知识库\n\nNotva 可以整理中文资料，并在执行任务前检索知识库。", "utf8");

    const ingest = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: ingest.proposal.id });

    expect(ingest.proposal.changes[0].path).toBe("本地知识库.md");
    const wikiPage = await readFile(join(root, "wiki", "本地知识库.md"), "utf8");
    expect(wikiPage).toContain("# 本地知识库");

    const query = await queryVault({ root, question: "知识库" });
    expect(query.hits[0]?.title).toBe("本地知识库");

    const act = await actVault({ root, task: "基于知识库规划下一步" });
    expect(act.evidence[0]?.title).toBe("本地知识库");
    expect(act.output).toContain("本地知识库");
  });
});
