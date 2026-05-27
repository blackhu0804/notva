import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { main } from "./main.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-cli-"));
  roots.push(root);
  return root;
}

async function capture(argv: string[]): Promise<{ stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = vi.spyOn(console, "log").mockImplementation((message) => stdout.push(String(message)));
  const err = vi.spyOn(console, "error").mockImplementation((message) => stderr.push(String(message)));
  try {
    await main(argv);
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return { stdout, stderr };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("notva CLI", () => {
  test("runs init, ingest, review, query, and lint against a vault", async () => {
    const root = await tempRoot();
    const source = join(root, "source.md");
    await writeFile(source, "# Local Knowledge Vault\n\nNotva keeps durable Markdown wiki pages.", "utf8");

    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture(["ingest", source, "--vault", root])).stdout[0]).toContain("Created proposal");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("pending proposal");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied");

    const wikiPage = await readFile(join(root, "wiki", "local-knowledge-vault.md"), "utf8");
    expect(wikiPage).toContain("Notva keeps durable Markdown wiki pages");

    expect((await capture(["query", "durable markdown", "--vault", root])).stdout[0]).toContain("Local Knowledge Vault");
    expect((await capture(["lint", "--vault", root])).stdout[0]).toContain("No lint issues");
  });
});
