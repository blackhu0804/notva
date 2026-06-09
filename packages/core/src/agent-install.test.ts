import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { installAgentInstructions } from "./agent-install.js";

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("agent install", () => {
  test("installs a user-scoped Codex skill under the Codex config directory", async () => {
    const vault = await tempRoot("notva-install-vault-");
    const codexHome = await tempRoot("notva-codex-home-");

    const result = await installAgentInstructions({
      root: vault,
      platform: "codex",
      codexHome
    });

    expect(result).toEqual({
      platform: "codex",
      scope: "user",
      path: join(codexHome, "skills", "notva", "SKILL.md")
    });

    const skill = await readFile(result.path, "utf8");
    expect(skill).toContain("name: notva");
    expect(skill).toContain("notva context");
    expect(skill).toContain("notva query");
    expect(skill).toContain("notva explain");
    expect(skill).toContain("notva path");
    expect(skill).toContain("If this vault has Notva graph/wiki data");
    expect(skill).toContain("Treat INFERRED and AMBIGUOUS relationships as lower-confidence context.");
  });

  test("installs project-scoped Codex instructions into AGENTS.md idempotently", async () => {
    const project = await tempRoot("notva-install-project-");
    const agentsPath = join(project, "AGENTS.md");
    await writeFile(agentsPath, "# Existing Instructions\n\nKeep this line.\n", "utf8");

    const first = await installAgentInstructions({
      root: project,
      platform: "codex",
      project: true
    });
    const second = await installAgentInstructions({
      root: project,
      platform: "codex",
      project: true
    });

    expect(first).toEqual({
      platform: "codex",
      scope: "project",
      path: agentsPath,
      gitAddHint: "git add AGENTS.md"
    });
    expect(second).toEqual(first);

    const agents = await readFile(agentsPath, "utf8");
    expect(agents).toContain("Keep this line.");
    expect(agents).toContain("<!-- notva:codex:start -->");
    expect(agents).toContain("notva context");
    expect(agents).toContain("notva report");
    expect(agents).toContain("Use reviewed wiki pages and graph edges as the first evidence set.");
    expect(agents.match(/<!-- notva:codex:start -->/g)).toHaveLength(1);
  });
});
