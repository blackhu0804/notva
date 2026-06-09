import { listActRuns } from "./act.js";
import { lintVault } from "./lint.js";
import { listPendingProposals } from "./review.js";
import { listSources } from "./source.js";
import type { VaultStatus } from "./types.js";
import { listWikiPages } from "./wiki.js";

export interface GetVaultStatusOptions {
  root: string;
}

export async function getVaultStatus(options: GetVaultStatusOptions): Promise<VaultStatus> {
  const [sources, pages, proposals, issues, runs] = await Promise.all([
    listSources({ root: options.root }),
    listWikiPages({ root: options.root }),
    listPendingProposals({ root: options.root }),
    lintVault({ root: options.root }),
    listActRuns({ root: options.root })
  ]);

  const issueCounts: Record<string, number> = {};
  for (const issue of issues) {
    issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
  }

  return {
    root: options.root,
    health: issues.length > 0 || proposals.length > 0 ? "needs_review" : "ready",
    sourceCount: sources.length,
    pageCount: pages.length,
    pendingProposalCount: proposals.length,
    lintIssueCount: issues.length,
    actRunCount: runs.length,
    issueCounts,
    lastActRun: runs[0]
  };
}
