import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";
import { queryVault } from "./query.js";
import { reindexVault } from "./reindex.js";
import { listWikiPages, readWikiPage, writeWikiPage } from "./wiki.js";

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

  test("writes a wiki page and refreshes the searchable index", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await mkdir(join(root, "wiki"), { recursive: true });
    await writeFile(join(root, "wiki", "editable.md"), "# Editable\n\nOld indexed text.", "utf8");
    await reindexVault({ root });

    const updated = await writeWikiPage({
      root,
      path: "editable.md",
      body: "# Edited Wiki Page\n\nFresh searchable page body."
    });

    expect(updated.title).toBe("Edited Wiki Page");
    expect(await readFile(join(root, "wiki", "editable.md"), "utf8")).toContain("Fresh searchable page body.");

    const result = await queryVault({ root, question: "fresh searchable" });
    expect(result.hits[0]?.title).toBe("Edited Wiki Page");
  });
});
