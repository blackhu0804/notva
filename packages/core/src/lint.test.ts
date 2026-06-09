import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";
import { lintVault } from "./lint.js";
import { reindexVault } from "./reindex.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-lint-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("lintVault", () => {
  test("reports missing sources and broken wiki links", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await mkdir(join(root, "wiki"), { recursive: true });
    await writeFile(join(root, "wiki", "orphan.md"), "# Orphan\n\nThis links to [[Missing Page]].", "utf8");

    await reindexVault({ root });
    const issues = await lintVault({ root });

    expect(issues.some((issue) => issue.code === "missing_sources")).toBe(true);
    expect(issues.some((issue) => issue.code === "broken_wiki_link")).toBe(true);
  });

  test("reports unresolved wiki links as open concepts", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await mkdir(join(root, "wiki"), { recursive: true });
    await writeFile(
      join(root, "wiki", "alpha.md"),
      "---\nsources:\n  - manual\n---\n\n# Alpha\n\nAlpha mentions [[Loose Concept]] explicitly.",
      "utf8"
    );

    await reindexVault({ root });
    const issues = await lintVault({ root });

    expect(issues).toContainEqual({
      code: "open_concept",
      path: "alpha.md",
      message: "alpha.md mentions open concept \"Loose Concept\"."
    });
  });
});
