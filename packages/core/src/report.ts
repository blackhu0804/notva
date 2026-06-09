import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportGraphJson, rebuildGraph } from "./graph.js";
import { resolveVaultPaths } from "./paths.js";
import type { GraphEdgeRecord, GraphExport, GraphNodeRecord } from "./types.js";

export interface GenerateGraphReportOptions {
  root: string;
  graph?: GraphExport;
}

export interface GraphReportLink {
  source: string;
  sourceLabel: string;
  target: string;
  targetLabel: string;
  relation: string;
  confidence: GraphEdgeRecord["confidence"];
  evidence?: string;
}

export interface GraphReportAnalysis {
  nodeCount: number;
  edgeCount: number;
  mostConnected: GraphNodeRecord[];
  orphanPages: GraphNodeRecord[];
  openConcepts: GraphNodeRecord[];
  uncoveredSources: GraphNodeRecord[];
  uncertainEdges: GraphReportLink[];
  crossPageLinks: GraphReportLink[];
  suggestedQuestions: string[];
}

export interface GraphReportResult {
  path: string;
  markdown: string;
  analysis: GraphReportAnalysis;
}

export async function generateGraphReport(options: GenerateGraphReportOptions): Promise<GraphReportResult> {
  const paths = resolveVaultPaths(options.root);
  const graph = options.graph ?? await freshGraph(options.root);
  const analysis = analyzeGraph(graph);
  const markdown = renderGraphReport(analysis);
  const path = join(paths.notva, "graph-report.md");
  await writeFile(path, markdown, "utf8");
  return { path, markdown, analysis };
}

export function analyzeGraph(graph: GraphExport): GraphReportAnalysis {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));

  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const mostConnected = graph.nodes
    .filter((node) => node.kind === "page" || node.kind === "concept")
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))
    .slice(0, 8);

  const pageLinkEdges = graph.edges.filter((edge) => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    return edge.relation === "links_to" && source?.kind === "page" && target?.kind === "page";
  });
  const pageIdsWithPageLinks = new Set(pageLinkEdges.flatMap((edge) => [edge.source, edge.target]));
  const orphanPages = graph.nodes
    .filter((node) => node.kind === "page" && !pageIdsWithPageLinks.has(node.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  const openConcepts = graph.nodes
    .filter((node) => node.kind === "concept")
    .sort((a, b) => a.label.localeCompare(b.label));

  const coveredSourceIds = new Set(graph.edges
    .filter((edge) => edge.relation === "supports" && nodesById.get(edge.source)?.kind === "source")
    .map((edge) => edge.source));
  const uncoveredSources = graph.nodes
    .filter((node) => node.kind === "source" && !coveredSourceIds.has(node.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  const uncertainEdges = graph.edges
    .filter((edge) => edge.confidence === "INFERRED" || edge.confidence === "AMBIGUOUS")
    .map((edge) => mapReportLink(edge, nodesById))
    .sort(compareReportLinks);

  const crossPageLinks = pageLinkEdges
    .map((edge) => mapReportLink(edge, nodesById))
    .sort(compareReportLinks);

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    mostConnected,
    orphanPages,
    openConcepts,
    uncoveredSources,
    uncertainEdges,
    crossPageLinks,
    suggestedQuestions: suggestedQuestions({ mostConnected, orphanPages, openConcepts, uncoveredSources, crossPageLinks })
  };
}

export function renderGraphReport(analysis: GraphReportAnalysis): string {
  return [
    "# Notva Graph Report",
    "",
    `Nodes: ${analysis.nodeCount}`,
    `Edges: ${analysis.edgeCount}`,
    "",
    "## Most Connected Pages And Concepts",
    renderNodeList(analysis.mostConnected),
    "",
    "## Orphan Pages",
    renderNodeList(analysis.orphanPages),
    "",
    "## Open Concepts",
    renderNodeList(analysis.openConcepts),
    "",
    "## Sources With No Wiki Coverage",
    renderNodeList(analysis.uncoveredSources),
    "",
    "## Inferred Or Ambiguous Relationships",
    renderLinkList(analysis.uncertainEdges),
    "",
    "## Surprising Cross-Page Links",
    renderLinkList(analysis.crossPageLinks),
    "",
    "## Suggested Questions",
    renderQuestionList(analysis.suggestedQuestions),
    ""
  ].join("\n");
}

async function freshGraph(root: string): Promise<GraphExport> {
  await rebuildGraph({ root });
  return exportGraphJson({ root });
}

function mapReportLink(edge: GraphEdgeRecord, nodesById: Map<string, GraphNodeRecord>): GraphReportLink {
  return {
    source: edge.source,
    sourceLabel: nodesById.get(edge.source)?.label ?? edge.source,
    target: edge.target,
    targetLabel: nodesById.get(edge.target)?.label ?? edge.target,
    relation: edge.relation,
    confidence: edge.confidence,
    evidence: edge.evidence
  };
}

function renderNodeList(nodes: GraphNodeRecord[]): string {
  if (nodes.length === 0) return "- None.";
  return nodes.map((node) => `- ${node.label}${node.path ? ` (${node.path})` : ""}`).join("\n");
}

function renderLinkList(links: GraphReportLink[]): string {
  if (links.length === 0) return "- None.";
  return links.map((link) => {
    const evidence = link.evidence ? ` evidence: ${link.evidence}` : "";
    return `- ${link.sourceLabel} -> ${link.targetLabel} (${link.relation}, ${link.confidence}${evidence})`;
  }).join("\n");
}

function renderQuestionList(questions: string[]): string {
  if (questions.length === 0) return "- What should Notva connect next?";
  return questions.map((question) => `- ${question}`).join("\n");
}

function suggestedQuestions(input: {
  mostConnected: GraphNodeRecord[];
  orphanPages: GraphNodeRecord[];
  openConcepts: GraphNodeRecord[];
  uncoveredSources: GraphNodeRecord[];
  crossPageLinks: GraphReportLink[];
}): string[] {
  const questions: string[] = [];
  const top = input.mostConnected[0];
  if (top) questions.push(`How does ${top.label} connect to the rest of this vault?`);
  const link = input.crossPageLinks[0];
  if (link) questions.push(`Why does ${link.sourceLabel} connect to ${link.targetLabel}?`);
  const orphan = input.orphanPages[0];
  if (orphan) questions.push(`What should ${orphan.label} link to?`);
  const concept = input.openConcepts[0];
  if (concept) questions.push(`Should ${concept.label} become a reviewed wiki page?`);
  const source = input.uncoveredSources[0];
  if (source) questions.push(`Should ${source.label} become a reviewed wiki page?`);
  return questions.slice(0, 5);
}

function compareReportLinks(a: GraphReportLink, b: GraphReportLink): number {
  return a.sourceLabel.localeCompare(b.sourceLabel)
    || a.targetLabel.localeCompare(b.targetLabel)
    || a.relation.localeCompare(b.relation);
}
