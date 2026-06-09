import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { pageNodeId, rebuildGraph, sourceNodeId } from "./graph.js";
import { NotvaState } from "./state.js";
import type { ProposalDetail, ProposalRecord, SourceRecord } from "./types.js";

export interface ListPendingProposalsOptions {
  root: string;
}

export interface ApplyProposalOptions {
  root: string;
  proposalId: string;
}

export interface RejectProposalOptions {
  root: string;
  proposalId: string;
}

export interface UpdateProposalChangeOptions {
  root: string;
  proposalId: string;
  path: string;
  content: string;
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

export async function listPendingProposalDetails(options: ListPendingProposalsOptions): Promise<ProposalDetail[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  let proposals: ProposalRecord[];
  const sources = new Map<string, SourceRecord>();
  try {
    state.initialize();
    proposals = state.listPendingProposals();
    for (const proposal of proposals) {
      const source = state.getSource(proposal.sourceId);
      if (source) sources.set(proposal.sourceId, source);
    }
  } finally {
    state.close();
  }

  return Promise.all(proposals.map(async (proposal) => {
    const source = sources.get(proposal.sourceId);
    if (!source) return proposal;
    return {
      ...proposal,
      sourceEvidence: {
        source,
        preview: await readSourcePreview(source)
      }
    };
  }));
}

export async function applyProposal(options: ApplyProposalOptions): Promise<ProposalRecord> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  let accepted: ProposalRecord | undefined;
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
      const source = state.getSource(proposal.sourceId);
      if (source) {
        state.upsertGraphNode({
          id: sourceNodeId(source.id),
          label: source.title,
          kind: "source",
          sourceId: source.id
        });
        state.upsertGraphNode({
          id: pageNodeId(change.path),
          label: change.title,
          kind: "page",
          path: change.path
        });
        state.upsertGraphEdge({
          source: sourceNodeId(source.id),
          target: pageNodeId(change.path),
          relation: "supports",
          confidence: "EXTRACTED",
          sourceId: source.id
        });
      }
    }

    const updatedAt = new Date().toISOString();
    state.markProposalStatus(proposal.id, "accepted", updatedAt);
    accepted = { ...proposal, status: "accepted", updatedAt };
  } finally {
    state.close();
  }
  await rebuildGraph({ root: options.root });
  if (!accepted) throw new Error(`Proposal was not accepted: ${options.proposalId}`);
  return accepted;
}

export async function rejectProposal(options: RejectProposalOptions): Promise<ProposalRecord> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const proposal = state.getProposal(options.proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${options.proposalId}`);
    if (proposal.status !== "pending") throw new Error(`Proposal is not pending: ${options.proposalId}`);

    const updatedAt = new Date().toISOString();
    state.markProposalStatus(proposal.id, "rejected", updatedAt);
    return { ...proposal, status: "rejected", updatedAt };
  } finally {
    state.close();
  }
}

export async function updateProposalChange(options: UpdateProposalChangeOptions): Promise<ProposalRecord> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const proposal = state.getProposal(options.proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${options.proposalId}`);
    if (proposal.status !== "pending") throw new Error(`Proposal is not pending: ${options.proposalId}`);
    if (options.content.trim().length === 0) throw new Error("Proposal content is required.");

    const changeIndex = proposal.changes.findIndex((change) => change.path === options.path);
    if (changeIndex === -1) throw new Error(`Proposal change not found: ${options.path}`);

    const changes = [...proposal.changes];
    const current = changes[changeIndex];
    changes[changeIndex] = {
      ...current,
      title: extractMarkdownTitle(options.content, current.title),
      content: options.content
    };

    const updatedAt = new Date().toISOString();
    state.updateProposalChanges(proposal.id, changes, updatedAt);
    return { ...proposal, changes, updatedAt };
  } finally {
    state.close();
  }
}

function extractMarkdownTitle(content: string, fallback: string): string {
  const heading = content.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() || fallback : fallback;
}

async function readSourcePreview(source: SourceRecord): Promise<string> {
  const body = await readFile(source.rawPath, "utf8");
  const normalized = body
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length > 600 ? `${normalized.slice(0, 600).trimEnd()}...` : normalized;
}
