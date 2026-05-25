import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { QueryResult } from "./types.js";

export interface QueryVaultOptions {
  root: string;
  question: string;
  limit?: number;
}

export async function queryVault(options: QueryVaultOptions): Promise<QueryResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const hits = state.searchPages(options.question, options.limit ?? 5);
    const answer = hits.length === 0
      ? "No matching Notva wiki pages were found."
      : `Found ${hits.length} Notva wiki page(s): ${hits.map((hit) => `${hit.title} (${hit.path})`).join(", ")}.`;
    return { question: options.question, answer, hits };
  } finally {
    state.close();
  }
}
