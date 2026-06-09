import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AgentPlatform = "codex";
export type AgentInstallScope = "user" | "project";

export interface InstallAgentInstructionsOptions {
  root: string;
  platform: AgentPlatform;
  project?: boolean;
  codexHome?: string;
}

export interface AgentInstallResult {
  platform: AgentPlatform;
  scope: AgentInstallScope;
  path: string;
  gitAddHint?: string;
}

const PROJECT_START = "<!-- notva:codex:start -->";
const PROJECT_END = "<!-- notva:codex:end -->";

export async function installAgentInstructions(options: InstallAgentInstructionsOptions): Promise<AgentInstallResult> {
  if (options.platform !== "codex") {
    throw new Error(`Unsupported agent platform: ${options.platform}`);
  }
  return options.project ? installProjectCodexInstructions(options.root) : installUserCodexSkill(options);
}

async function installUserCodexSkill(options: InstallAgentInstructionsOptions): Promise<AgentInstallResult> {
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const path = join(codexHome, "skills", "notva", "SKILL.md");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderCodexSkill(), "utf8");
  return { platform: "codex", scope: "user", path };
}

async function installProjectCodexInstructions(root: string): Promise<AgentInstallResult> {
  const path = join(root, "AGENTS.md");
  const current = await readOptional(path);
  const next = upsertMarkedSection(current, renderProjectInstructions());
  await writeFile(path, next, "utf8");
  return { platform: "codex", scope: "project", path, gitAddHint: "git add AGENTS.md" };
}

function renderCodexSkill(): string {
  return `---
name: notva
description: Query a Notva local wiki and graph before broad raw-file reads or downstream agent actions.
---

# Notva

Use Notva as the first evidence layer for projects or vaults that contain Notva data.

${renderInstructionBody()}
`;
}

function renderProjectInstructions(): string {
  return `${PROJECT_START}
## Notva

${renderInstructionBody()}
${PROJECT_END}`;
}

function renderInstructionBody(): string {
  return `If this vault has Notva graph/wiki data, run notva context before broad raw-file reads or downstream actions. Use notva query, notva explain, or notva path for narrower follow-up checks.

Use reviewed wiki pages and graph edges as the first evidence set.

Treat INFERRED and AMBIGUOUS relationships as lower-confidence context.

Useful commands:

\`\`\`bash
notva context "<question-or-task>" --vault <vault>
notva context "<question-or-task>" --json --vault <vault>
notva query "<question>" --vault <vault>
notva explain "<page-or-concept>" --vault <vault>
notva path "<from>" "<to>" --vault <vault>
notva graph export --vault <vault>
notva report --vault <vault>
\`\`\`

Prefer targeted Notva commands before scanning large raw folders. When Notva returns no useful evidence, continue with ordinary file inspection and mention that Notva had no matching context.`;
}

function upsertMarkedSection(current: string, section: string): string {
  const start = current.indexOf(PROJECT_START);
  const end = current.indexOf(PROJECT_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = current.slice(0, start).trimEnd();
    const after = current.slice(end + PROJECT_END.length).trimStart();
    return joinBlocks([before, section, after]);
  }
  return joinBlocks([current.trimEnd(), section]);
}

function joinBlocks(blocks: string[]): string {
  return `${blocks.filter((block) => block.length > 0).join("\n\n")}\n`;
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
