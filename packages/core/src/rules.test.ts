import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildContextPack } from "./context.js";
import { initVault } from "./init.js";
import { readVaultRules, writeVaultRules } from "./rules.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-rules-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("vault rules", () => {
  test("reads and writes editable vault rules used by context packs", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const initial = await readVaultRules({ root });
    expect(initial.path).toBe("notva.md");
    expect(initial.body).toContain("Notva Wiki Maintenance Rules");

    const updatedBody = [
      "# Personal Rule Set",
      "",
      "- Prefer short Chinese section titles.",
      "- Keep execution notes separate from durable claims."
    ].join("\n");
    const updated = await writeVaultRules({ root, body: updatedBody });

    expect(updated.path).toBe("notva.md");
    expect(updated.body).toBe(`${updatedBody}\n`);
    expect((await readVaultRules({ root })).body).toBe(`${updatedBody}\n`);

    const pack = await buildContextPack({ root, query: "rules" });
    expect(pack.rules).toContain("Personal Rule Set");
    expect(pack.rules).toContain("Prefer short Chinese section titles");
  });

  test("rejects unsafe vault rule paths", async () => {
    const root = await tempRoot();
    await initVault({ root });

    await expect(readVaultRules({ root, path: "../outside.md" })).rejects.toThrow("Rule path must stay inside schema/");
    await expect(writeVaultRules({ root, path: "/tmp/outside.md", body: "# Bad" })).rejects.toThrow("Rule path must stay inside schema/");
  });
});
