import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ensureDir, resolveVaultPaths, sha256, shortId, slugify } from "./paths.js";
import { NotvaState } from "./state.js";
import type { PageRecord, ProposalRecord, QueryHit, QueryResult, QueryRetrievalMetadata, SourceRecord } from "./types.js";

export interface QueryVaultOptions {
  root: string;
  question: string;
  limit?: number;
}

export interface ProposeQueryResultOptions extends QueryVaultOptions {}

export interface ProposeQueryResultResult {
  query: QueryResult;
  source: SourceRecord;
  proposal: ProposalRecord;
  created: boolean;
}

export async function queryVault(options: QueryVaultOptions): Promise<QueryResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const hits = attachSourceProvenance({
      hits: hybridSearchPages({
        question: options.question,
        pages: state.listPages(),
        lexicalHits: state.searchPages(options.question, Math.max((options.limit ?? 5) * 4, 20)),
        limit: options.limit ?? 5
      }),
      pages: state.listPages(),
      sources: state.listSources()
    });
    const answer = hits.length === 0
      ? "No matching Notva wiki pages were found."
      : `Found ${hits.length} Notva wiki page(s) with hybrid retrieval and reranking: ${hits.map(formatHitSummary).join(", ")}.`;
    return { question: options.question, answer, hits };
  } finally {
    state.close();
  }
}

export async function proposeQueryResult(options: ProposeQueryResultOptions): Promise<ProposeQueryResultResult> {
  const query = await queryVault(options);
  if (query.hits.length === 0) {
    throw new Error("Query proposal requires reviewed wiki evidence.");
  }

  const paths = resolveVaultPaths(options.root);
  const now = new Date().toISOString();
  const sourceContent = renderQueryProposalSource(query);
  const sourceId = shortId(`query-source:${query.question}:${sha256(sourceContent)}`);

  const state = new NotvaState(paths.stateDb);
  let existingSource: SourceRecord | undefined;
  let pages: PageRecord[] = [];
  try {
    state.initialize();
    existingSource = state.getSource(sourceId);
    if (existingSource) {
      const pending = state.listProposalsForSource(existingSource.id).find((proposal) => proposal.status === "pending");
      if (pending) return { query, source: existingSource, proposal: pending, created: false };
    }
    pages = state.listPages();
  } finally {
    state.close();
  }

  const source = existingSource ?? await writeQuerySource({
    root: options.root,
    sourceId,
    question: query.question,
    content: sourceContent,
    createdAt: now
  });
  const proposal = buildQueryResultProposal({
    query,
    source,
    createdAt: now,
    pages
  });

  const insertState = new NotvaState(paths.stateDb);
  try {
    insertState.initialize();
    insertState.insertSource(source);
    insertState.insertProposal(proposal);
  } finally {
    insertState.close();
  }

  return { query, source, proposal, created: true };
}

async function writeQuerySource(input: {
  root: string;
  sourceId: string;
  question: string;
  content: string;
  createdAt: string;
}): Promise<SourceRecord> {
  const paths = resolveVaultPaths(input.root);
  const datedRawDir = join(paths.raw, input.createdAt.slice(0, 10));
  await ensureDir(datedRawDir);
  const rawPath = join(datedRawDir, `${slugify(queryResultTitle(input.question))}-${input.sourceId}.md`);
  await writeFile(rawPath, input.content, "utf8");
  return {
    id: input.sourceId,
    kind: "text",
    title: queryResultTitle(input.question),
    rawPath,
    originalRef: `query:${input.question}`,
    createdAt: input.createdAt,
    sha256: sha256(input.content)
  };
}

function buildQueryResultProposal(input: {
  query: QueryResult;
  source: SourceRecord;
  createdAt: string;
  pages: PageRecord[];
}): ProposalRecord {
  const title = input.source.title;
  const path = `${slugify(title)}.md`;
  const content = renderQueryWikiPage(input.query, input.source, input.createdAt, input.pages);
  return {
    id: shortId(`proposal:${input.source.id}:${path}:${input.createdAt}`),
    sourceId: input.source.id,
    status: "pending",
    summary: `Create wiki page "${title}" from query result.`,
    changes: [{ type: "create_page", path, title, content }],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

function renderQueryProposalSource(query: QueryResult): string {
  return [
    `# ${queryResultTitle(query.question)}`,
    "",
    "This source was generated from a Notva query result. Review it before applying it to the wiki.",
    "",
    "## Question",
    "",
    query.question,
    "",
    "## Answer",
    "",
    query.answer,
    "",
    "## Reviewed Wiki Evidence",
    "",
    formatQueryEvidence(query.hits)
  ].join("\n");
}

function renderQueryWikiPage(query: QueryResult, source: SourceRecord, createdAt: string, pages: PageRecord[]): string {
  const relatedPages = pages
    .filter((page) => query.hits.some((hit) => hit.path === page.path || hit.title === page.title))
    .map((page) => `- [[${page.title}]] (${page.path})`);
  return [
    "---",
    `title: "${source.title.replaceAll('"', '\\"')}"`,
    "sources:",
    `  - ${source.id}`,
    `created: ${createdAt}`,
    "---",
    "",
    `# ${source.title}`,
    "",
    "## Summary",
    "",
    "Generated from a Notva query result. Review this answer before applying it to the durable wiki.",
    "",
    "## Question",
    "",
    query.question,
    "",
    "## Answer",
    "",
    query.answer,
    "",
    "## Reviewed Wiki Evidence",
    "",
    formatQueryEvidence(query.hits),
    "",
    ...(relatedPages.length > 0 ? ["## Related Wiki Pages", "", ...relatedPages, ""] : []),
    "## Sources",
    "",
    `- ${source.id}: ${basename(source.rawPath)}`
  ].join("\n");
}

function formatQueryEvidence(hits: QueryHit[]): string {
  if (hits.length === 0) return "- No reviewed wiki evidence matched this query.";
  return hits.map((hit) => {
    const sources = hit.sources.length > 0
      ? `\n  sources: ${hit.sources.map((source) => `${source.id} (${source.originalRef})`).join(", ")}`
      : "";
    return `- ${hit.title} (${hit.path}): ${hit.snippet}${sources}`;
  }).join("\n");
}

function queryResultTitle(question: string): string {
  return `Query Result: ${question}`;
}

function attachSourceProvenance(input: {
  hits: QueryHit[];
  pages: PageRecord[];
  sources: SourceRecord[];
}): QueryHit[] {
  const pagesByPath = new Map(input.pages.map((page) => [page.path, page]));
  return input.hits.map((hit) => {
    const page = pagesByPath.get(hit.path);
    if (!page) return { ...hit, sources: [] };
    return {
      ...hit,
      sources: input.sources.filter((source) => page.body.includes(source.id))
    };
  });
}

function formatHitSummary(hit: QueryHit): string {
  const sourceIds = hit.sources.map((source) => source.id);
  const sources = sourceIds.length > 0 ? `; sources: ${sourceIds.join(", ")}` : "";
  return `${hit.title} (${hit.path}; ${hit.retrieval.method} ${hit.retrieval.rerankScore.toFixed(2)}${sources})`;
}

function hybridSearchPages(input: {
  question: string;
  pages: PageRecord[];
  lexicalHits: QueryHit[];
  limit: number;
}): QueryHit[] {
  const queryVector = embedText(input.question);
  const queryTerms = tokenize(input.question);
  const lexicalByPath = new Map(input.lexicalHits.map((hit, index) => [hit.path, { hit, index }] as const));

  return input.pages
    .map((page) => {
      const text = `${page.title}\n${page.body}`;
      const lexical = lexicalByPath.get(page.path);
      const overlapScore = termOverlapScore(queryTerms, tokenize(text));
      const lexicalScore = lexical ? Math.max(1 / (lexical.index + 1), overlapScore) : overlapScore;
      const vectorScore = cosineSimilarity(queryVector, embedText(text));
      const titleBoost = termOverlapScore(queryTerms, tokenize(page.title)) * 0.15;
      const rerankScore = lexicalScore * 0.6 + vectorScore * 0.35 + titleBoost;
      const retrieval = retrievalMetadata({ lexicalScore, vectorScore, rerankScore });
      return {
        path: page.path,
        title: page.title,
        snippet: lexical?.hit.snippet ?? makeSnippet(page.body, queryTerms),
        sources: [],
        retrieval
      };
    })
    .filter((hit) => hit.retrieval.lexicalScore > 0 || hit.retrieval.vectorScore > 0)
    .sort((left, right) => right.retrieval.rerankScore - left.retrieval.rerankScore || left.title.localeCompare(right.title))
    .slice(0, input.limit);
}

function retrievalMetadata(scores: {
  lexicalScore: number;
  vectorScore: number;
  rerankScore: number;
}): QueryRetrievalMetadata {
  const method = scores.lexicalScore > 0 && scores.vectorScore > 0
    ? "hybrid"
    : scores.vectorScore > 0
      ? "semantic"
      : "lexical";
  return {
    method,
    lexicalScore: roundScore(scores.lexicalScore),
    vectorScore: roundScore(scores.vectorScore),
    rerankScore: roundScore(scores.rerankScore)
  };
}

function tokenize(text: string): string[] {
  const normalized = text.toLocaleLowerCase();
  const latin = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const cjk = [...normalized.matchAll(/[\p{Script=Han}]/gu)].map((match) => match[0]);
  return [...latin, ...cjk].filter((term) => term.length > 1 || /[\p{Script=Han}]/u.test(term));
}

function embedText(text: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const term of expandTerms(tokenize(text))) {
    vector.set(term, (vector.get(term) ?? 0) + 1);
  }
  return vector;
}

function expandTerms(terms: string[]): string[] {
  const expanded: string[] = [];
  for (const term of terms) {
    expanded.push(term);
    for (const synonym of semanticNeighbors(term)) expanded.push(synonym);
  }
  return expanded;
}

function semanticNeighbors(term: string): string[] {
  const neighbors: Record<string, string[]> = {
    tune: ["dial", "dialing", "adjust", "recipe"],
    tuning: ["dial", "dialing", "adjust", "recipe"],
    espresso: ["coffee", "brewing", "extraction", "grind", "dose", "pressure"],
    recipe: ["process", "steps", "method"],
    retrieve: ["search", "query", "context"],
    retrieval: ["search", "query", "context"],
    wiki: ["knowledge", "page", "note"],
    knowledge: ["wiki", "page", "note"]
  };
  return neighbors[term] ?? [];
}

function termOverlapScore(queryTerms: string[], pageTerms: string[]): number {
  if (queryTerms.length === 0 || pageTerms.length === 0) return 0;
  const pageSet = new Set(pageTerms);
  const matches = new Set(queryTerms.filter((term) => pageSet.has(term)));
  return matches.size / new Set(queryTerms).size;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const value of left.values()) leftMagnitude += value * value;
  for (const value of right.values()) rightMagnitude += value * value;
  for (const [term, value] of left) dot += value * (right.get(term) ?? 0);
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function makeSnippet(body: string, queryTerms: string[]): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  const lower = normalized.toLocaleLowerCase();
  const firstMatch = queryTerms
    .map((term) => lower.indexOf(term.toLocaleLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  return normalized.slice(Math.max(0, firstMatch - 40), firstMatch + 160);
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}
