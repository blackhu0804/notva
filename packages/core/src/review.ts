import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { ProposalRecord } from "./types.js";

export interface ListPendingProposalsOptions {
  root: string;
}

export interface ApplyProposalOptions {
  root: string;
  proposalId: string;
}

export async function listPendingProposals(options: ListPendingProposalsOptions): Promise<ProposalRecord[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return state.listPendingProposals();
  } finally {
    state.close();
  }
}

export async function applyProposal(options: ApplyProposalOptions): Promise<ProposalRecord> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const proposal = state.getProposal(options.proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${options.proposalId}`);
    if (proposal.status !== "pending") throw new Error(`Proposal is not pending: ${options.proposalId}`);

    for (const change of proposal.changes) {
      const pagePath = join(paths.wiki, change.path);
      await mkdir(dirname(pagePath), { recursive: true });
      await writeFile(pagePath, change.content, "utf8");
      state.upsertPage({
        path: change.path,
        title: change.title,
        body: change.content,
        updatedAt: new Date().toISOString()
      });
    }

    state.markProposalStatus(proposal.id, "accepted", new Date().toISOString());
    return { ...proposal, status: "accepted" };
  } finally {
    state.close();
  }
}
