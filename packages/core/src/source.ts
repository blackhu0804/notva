import { readFile } from "node:fs/promises";
import { buildProposalFromSourceContent, contentForSourceProposal } from "./ingest.js";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { ProposalRecord, SourceHit, SourceRecord } from "./types.js";

export interface ListSourcesOptions {
  root: string;
}

export interface ReadSourceOptions {
  root: string;
  id: string;
}

export interface ReadSourceResult {
  source: SourceRecord;
  body: string;
}

export interface SearchSourcesOptions {
  root: string;
  query: string;
  limit?: number;
}

export interface ProposeSourceOptions {
  root: string;
  id: string;
}

export interface ProposeSourceResult {
  source: SourceRecord;
  proposal: ProposalRecord;
  created: boolean;
}

export interface ProposeUncoveredSourcesOptions {
  root: string;
}

export interface ProposeUncoveredSourcesResult {
  results: ProposeSourceResult[];
  skipped: SourceRecord[];
}

export async function listSources(options: ListSourcesOptions): Promise<SourceRecord[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return state.listSources();
  } finally {
    state.close();
  }
}

export async function readSource(options: ReadSourceOptions): Promise<ReadSourceResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const source = state.getSource(options.id);
    if (!source) throw new Error(`Source not found: ${options.id}`);
    return {
      source,
      body: await readFile(source.rawPath, "utf8")
    };
  } finally {
    state.close();
  }
}

export async function proposeSource(options: ProposeSourceOptions): Promise<ProposeSourceResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const source = state.getSource(options.id);
    if (!source) throw new Error(`Source not found: ${options.id}`);

    const pending = state.listProposalsForSource(source.id).find((proposal) => proposal.status === "pending");
    if (pending) {
      return { source, proposal: pending, created: false };
    }

    const now = new Date().toISOString();
    const rawContent = await readFile(source.rawPath, "utf8");
    const proposal = buildProposalFromSourceContent({
      source,
      content: contentForSourceProposal(source, rawContent),
      createdAt: now,
      proposalIdSalt: now,
      relatedPages: state.listPages()
    });
    state.insertProposal(proposal);
    return { source, proposal, created: true };
  } finally {
    state.close();
  }
}

export async function proposeUncoveredSources(options: ProposeUncoveredSourcesOptions): Promise<ProposeUncoveredSourcesResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  let sources: SourceRecord[];
  let coveredSourceIds: Set<string>;
  try {
    state.initialize();
    sources = state.listSources();
    const pages = state.listPages();
    coveredSourceIds = new Set(sources
      .filter((source) => pages.some((page) => page.body.includes(source.id)))
      .map((source) => source.id));
  } finally {
    state.close();
  }

  const results: ProposeSourceResult[] = [];
  const skipped: SourceRecord[] = [];
  for (const source of sources) {
    if (coveredSourceIds.has(source.id)) {
      skipped.push(source);
    } else {
      results.push(await proposeSource({ root: options.root, id: source.id }));
    }
  }
  return { results, skipped };
}

export async function searchSources(options: SearchSourcesOptions): Promise<SourceHit[]> {
  const terms = searchTerms(options.query);
  if (terms.length === 0) return [];

  const sources = await listSources({ root: options.root });
  const candidates = await Promise.all(sources.map(async (source) => {
    try {
      const body = await readFile(source.rawPath, "utf8");
      const haystack = `${source.title}\n${source.originalRef}\n${body}`.toLocaleLowerCase();
      const matchedTerms = terms.filter((term) => haystack.includes(term));
      return matchedTerms.length > 0
        ? { source, body, matchedTerms }
        : undefined;
    } catch {
      return undefined;
    }
  }));

  return candidates
    .filter((candidate): candidate is { source: SourceRecord; body: string; matchedTerms: string[] } => candidate !== undefined)
    .sort((a, b) => {
      const byScore = b.matchedTerms.length - a.matchedTerms.length;
      return byScore !== 0 ? byScore : a.source.createdAt.localeCompare(b.source.createdAt);
    })
    .slice(0, options.limit ?? 5)
    .map(({ source, body, matchedTerms }) => ({
      source,
      snippet: snippetFor(body, matchedTerms[0])
    }));
}

function searchTerms(query: string): string[] {
  const tokens = unicodeTokens(query);
  const cjkGrams = [...query.matchAll(/[\p{Script=Han}]{2,}/gu)]
    .flatMap((match) => bigrams(match[0].toLocaleLowerCase()));
  return [...new Set([...tokens, ...cjkGrams])].filter((term) => term.length > 1);
}

function unicodeTokens(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .match(/[\p{Letter}\p{Number}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function bigrams(input: string): string[] {
  const chars = [...input];
  const grams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return grams;
}

function snippetFor(body: string, term: string): string {
  const lowerBody = body.toLocaleLowerCase();
  const index = lowerBody.indexOf(term);
  if (index === -1) return body.replace(/\s+/g, " ").slice(0, 220);
  const start = Math.max(0, index - 56);
  const end = Math.min(body.length, index + term.length + 128);
  return `${start > 0 ? "..." : ""}${body.slice(start, end).replace(/\s+/g, " ")}${end < body.length ? "..." : ""}`;
}
