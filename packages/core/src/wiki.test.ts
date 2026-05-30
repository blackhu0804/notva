import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";
import { reindexVault } from "./reindex.js";
import { listWikiPages, readWikiPage } from "./wiki.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-wiki-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("wiki helpers", () => {
  test("lists indexed pages and reads a page body from the wiki directory", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await mkdir(join(root, "wiki"), { recursive: true });
    await writeFile(join(root, "wiki", "local-vault.md"), "# Local Vault\n\nNotva keeps wiki pages on disk.", "utf8");

    await reindexVault({ root });

    const pages = await listWikiPages({ root });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ path: "local-vault.md", title: "Local Vault" });

    const page = await readWikiPage({ root, path: "local-vault.md" });
    expect(page.title).toBe("Local Vault");
    expect(page.body).toContain("Notva keeps wiki pages on disk.");
  });
});
