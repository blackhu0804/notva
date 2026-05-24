import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initVault } from "./init.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-init-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("initVault", () => {
  test("creates the local-first vault layout and default schema", async () => {
    const root = await tempRoot();

    const result = await initVault({ root });

    await expect(stat(join(root, ".notva", "config.json"))).resolves.toBeTruthy();
    await expect(stat(join(root, ".notva", "state.db"))).resolves.toBeTruthy();
    await expect(stat(join(root, "raw"))).resolves.toBeTruthy();
    await expect(stat(join(root, "wiki"))).resolves.toBeTruthy();
    await expect(stat(join(root, "schema", "notva.md"))).resolves.toBeTruthy();
    await expect(stat(join(root, "index"))).resolves.toBeTruthy();

    const schema = await readFile(join(root, "schema", "notva.md"), "utf8");
    expect(schema).toContain("Notva Wiki Maintenance Rules");
    expect(result.paths.root).toBe(root);
  });
});
