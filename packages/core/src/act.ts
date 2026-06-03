import { queryVault } from "./query.js";
import type { ActResult } from "./types.js";

export interface ActVaultOptions {
  root: string;
  task: string;
  limit?: number;
}

export async function actVault(options: ActVaultOptions): Promise<ActResult> {
  const result = await queryVault({
    root: options.root,
    question: options.task,
    limit: options.limit ?? 5
  });

  const output = result.hits.length === 0
    ? `Task: ${options.task}\n\nEvidence\nNo matching Notva wiki pages were found.\n\nOutput\nI could not ground this task in the current vault. Add or review relevant sources first.`
    : `Task: ${options.task}\n\nEvidence\n${result.hits.map((hit, index) => `${index + 1}. ${hit.title} (${hit.path})\n${hit.snippet}`).join("\n\n")}\n\nOutput\nUse the cited Notva wiki evidence above before continuing with this task.`;

  return {
    task: options.task,
    output,
    evidence: result.hits
  };
}
