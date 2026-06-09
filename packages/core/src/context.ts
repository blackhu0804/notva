import { explainGraphNode, rebuildGraph } from "./graph.js";
import { findMissingWikiLinkSuggestions } from "./links.js";
import { lintVault } from "./lint.js";
import { resolveVaultPaths } from "./paths.js";
import { queryVault } from "./query.js";
import { readAllVaultRules } from "./rules.js";
import { searchSources } from "./source.js";
import { NotvaState } from "./state.js";
import type { ContextAction, ContextPack, GraphNeighborhood, GraphNodeRecord, SourceRecord } from "./types.js";

export interface BuildContextPackOptions {
  root: string;
  query: string;
  limit?: number;
}

export async function buildContextPack(options: BuildContextPackOptions): Promise<ContextPack> {
  const result = await queryVault({
    root: options.root,
    question: options.query,
    limit: options.limit ?? 5
  });

  await rebuildGraph({ root: options.root });

  const neighborhoods: GraphNeighborhood[] = [];
  const seen = new Set<string>();
  for (const hit of result.hits) {
    const neighborhood = await explainGraphNode({ root: options.root, query: hit.path });
    if (seen.has(neighborhood.node.id)) continue;
    seen.add(neighborhood.node.id);
    neighborhoods.push(neighborhood);
  }
  const sourceHits = await searchSources({
    root: options.root,
    query: options.query,
    limit: options.limit ?? 5
  });
  const actions = await suggestContextActions(options.root, sourceHits);
  const rules = await readAllVaultRules({ root: options.root });

  return {
    query: options.query,
    answer: result.answer,
    hits: result.hits,
    sourceHits,
    sources: await collectContextSources(options.root, neighborhoods),
    graph: { neighborhoods },
    actions,
    rules,
    instructions: [
      "Use reviewed Notva wiki pages first.",
      "Raw source matches are secondary evidence; verify or promote them through review before treating them as durable knowledge.",
      "Use graph relationships to identify supporting sources, cited pages, and open concepts.",
      "Treat INFERRED and AMBIGUOUS graph edges as lower-confidence context.",
      "Follow the vault rules before answering or acting.",
      "If the context is thin or empty, ingest and review more source material before acting."
    ].join(" ")
  };
}

export function renderContextPackMarkdown(pack: ContextPack): string {
  return [
    "# Notva Context Pack",
    "",
    `Query: ${pack.query}`,
    "",
    "## Answer",
    pack.answer,
    "",
    "## Evidence",
    ...formatEvidence(pack),
    "",
    "## Raw Source Evidence",
    ...formatRawSourceEvidence(pack.sourceHits),
    "",
    "## Sources",
    ...formatSources(pack.sources),
    "",
    "## Graph Neighborhoods",
    ...formatNeighborhoods(pack.graph.neighborhoods),
    "",
    "## Suggested Actions",
    ...formatActions(pack.actions),
    "",
    "## Vault Rules",
    ...formatRules(pack.rules),
    "",
    "## Execution Guidance",
    pack.instructions
  ].join("\n");
}

function formatEvidence(pack: ContextPack): string[] {
  if (pack.hits.length === 0) return ["No reviewed wiki evidence matched this query."];
  return pack.hits.map((hit, index) => [
    `${index + 1}. ${hit.title} (${hit.path})`,
    normalizeSnippet(hit.snippet),
    formatRetrieval(hit),
    formatReviewedEvidenceSources(hit.sources)
  ].join("\n"));
}

function formatRetrieval(hit: ContextPack["hits"][number]): string {
  return [
    `retrieval: ${hit.retrieval.method}`,
    `lexical: ${hit.retrieval.lexicalScore.toFixed(3)}`,
    `vector: ${hit.retrieval.vectorScore.toFixed(3)}`,
    `rerank: ${hit.retrieval.rerankScore.toFixed(3)}`
  ].join(", ");
}

export function formatReviewedEvidenceSources(sources: SourceRecord[] | undefined): string {
  if (!sources || sources.length === 0) return "sources: none";
  return `sources: ${sources.map((source) => `${source.id} (${source.originalRef})`).join(", ")}`;
}

function formatRawSourceEvidence(sourceHits: ContextPack["sourceHits"]): string[] {
  if (sourceHits.length === 0) return ["No raw source evidence matched this query."];
  return sourceHits.map((hit, index) => [
    `${index + 1}. ${hit.source.id}: ${hit.source.title}`,
    `kind: ${hit.source.kind}`,
    `raw: ${hit.source.rawPath}`,
    `original: ${hit.source.originalRef}`,
    normalizeSnippet(hit.snippet)
  ].join("\n"));
}

function formatSources(sources: SourceRecord[]): string[] {
  if (sources.length === 0) return ["No source provenance was linked to this context."];
  return sources.map((source, index) => [
    `${index + 1}. ${source.id}: ${source.title}`,
    `kind: ${source.kind}`,
    `raw: ${source.rawPath}`,
    `original: ${source.originalRef}`
  ].join("\n"));
}

function formatNeighborhoods(neighborhoods: GraphNeighborhood[]): string[] {
  if (neighborhoods.length === 0) return ["No graph neighborhoods were available for the matched evidence."];
  return neighborhoods.flatMap((neighborhood) => {
    const nodes = new Map<string, GraphNodeRecord>([
      [neighborhood.node.id, neighborhood.node],
      ...neighborhood.neighbors.map((node) => [node.id, node] as const)
    ]);
    const edges = neighborhood.edges.length === 0
      ? ["- No direct graph relationships."]
      : neighborhood.edges.map((edge) => {
        const source = nodes.get(edge.source);
        const target = nodes.get(edge.target);
        return `- ${source?.label ?? edge.source} --${edge.relation}--> ${target?.label ?? edge.target} [${edge.confidence}]`;
      });
    return [
      `### ${formatNode(neighborhood.node)}`,
      ...edges
    ];
  });
}

function formatActions(actions: ContextAction[]): string[] {
  if (actions.length === 0) return ["No immediate Notva maintenance actions."];
  return actions.map((action, index) => [
    `${index + 1}. ${action.label}`,
    `Command: ${action.command}`,
    `Reason: ${action.reason}`
  ].join("\n"));
}

function formatRules(rules: string): string[] {
  return rules.trim() ? [rules.trim()] : ["No vault rules were found."];
}

function formatNode(node: GraphNodeRecord): string {
  return `${node.label} (${node.kind}${node.path ? `: ${node.path}` : ""})`;
}

async function suggestContextActions(root: string, sourceHits: ContextPack["sourceHits"]): Promise<ContextAction[]> {
  const actions = new Map<string, ContextAction>();
  const { issues, coveredSourceIds } = await inspectActionState(root);
  const issueCodes = new Set(issues.map((issue) => issue.code));
  const missingLinks = await missingWikiLinkCount(root);
  const hasUncoveredRawMatches = sourceHits.some((hit) => !coveredSourceIds.has(hit.source.id));

  if (hasUncoveredRawMatches || issueCodes.has("source_without_page")) {
    addAction(actions, {
      label: "Promote uncovered raw sources",
      command: `notva source propose --uncovered --vault ${root}`,
      reason: hasUncoveredRawMatches
        ? "Raw source evidence matched this task but is not durable reviewed wiki knowledge yet."
        : "Some raw sources have no accepted wiki coverage."
    });
  }

  if (issueCodes.has("open_concept")) {
    addAction(actions, {
      label: "Propose pages for open concepts",
      command: `notva concepts propose --vault ${root}`,
      reason: "Reviewed wiki pages mention unresolved explicit concepts."
    });
  }

  if (missingLinks > 0) {
    addAction(actions, {
      label: "Propose missing wiki links",
      command: `notva links propose --vault ${root}`,
      reason: `${missingLinks} reviewed page${missingLinks === 1 ? "" : "s"} mention existing pages without explicit wiki links.`
    });
  }

  if (hasUncoveredRawMatches || issueCodes.has("pending_proposal") || issueCodes.has("open_concept") || issueCodes.has("source_without_page") || missingLinks > 0) {
    addAction(actions, {
      label: "Review pending proposals",
      command: `notva review --vault ${root}`,
      reason: "Review is required before proposed knowledge changes become durable wiki evidence."
    });
  }

  return [...actions.values()];
}

async function inspectActionState(root: string): Promise<{
  issues: Awaited<ReturnType<typeof lintVault>>;
  coveredSourceIds: Set<string>;
}> {
  const issues = await lintVault({ root });
  const paths = resolveVaultPaths(root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const pages = state.listPages();
    const coveredSourceIds = new Set(
      state.listSources()
        .filter((source) => pages.some((page) => page.body.includes(source.id)))
        .map((source) => source.id)
    );
    return { issues, coveredSourceIds };
  } finally {
    state.close();
  }
}

function addAction(actions: Map<string, ContextAction>, action: ContextAction): void {
  actions.set(action.command, action);
}

async function missingWikiLinkCount(root: string): Promise<number> {
  const paths = resolveVaultPaths(root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return findMissingWikiLinkSuggestions(state.listPages()).length;
  } finally {
    state.close();
  }
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
}

async function collectContextSources(root: string, neighborhoods: GraphNeighborhood[]): Promise<SourceRecord[]> {
  const sourceIds = new Set<string>();
  for (const neighborhood of neighborhoods) {
    if (neighborhood.node.sourceId) sourceIds.add(neighborhood.node.sourceId);
    for (const neighbor of neighborhood.neighbors) {
      if (neighbor.sourceId) sourceIds.add(neighbor.sourceId);
    }
    for (const edge of neighborhood.edges) {
      if (edge.sourceId) sourceIds.add(edge.sourceId);
    }
  }

  const paths = resolveVaultPaths(root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const sources = state.listSources();
    return sources.filter((source) => sourceIds.has(source.id));
  } finally {
    state.close();
  }
}
