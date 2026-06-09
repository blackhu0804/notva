import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVaultPaths, slugify } from "./paths.js";
import { NotvaState } from "./state.js";
import type {
  GraphBuildResult,
  GraphEdgeRecord,
  GraphExport,
  GraphNeighborhood,
  GraphNodeRecord,
  PageRecord,
  SourceRecord
} from "./types.js";

export interface ExportGraphJsonOptions {
  root: string;
}

export interface ExportGraphHtmlOptions {
  root: string;
  graph?: GraphExport;
}

export interface GraphHtmlExport {
  path: string;
  html: string;
  graph: GraphExport;
}

export interface ListGraphNeighborsOptions {
  root: string;
  id: string;
}

export interface RebuildGraphOptions {
  root: string;
}

export interface ExplainGraphNodeOptions {
  root: string;
  query: string;
}

export interface FindGraphPathOptions {
  root: string;
  from: string;
  to: string;
}

export interface GraphPathResult {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

export async function rebuildGraph(options: RebuildGraphOptions): Promise<GraphBuildResult> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const sources = state.listSources();
    const pages = state.listPages();
    const graph = deriveGraphRecords(sources, pages);
    state.replaceGraph(graph.nodes, graph.edges);
    return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
  } finally {
    state.close();
  }
}

export async function exportGraphJson(options: ExportGraphJsonOptions): Promise<GraphExport> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return {
      schemaVersion: 1,
      nodes: state.listGraphNodes(),
      edges: state.listGraphEdges()
    };
  } finally {
    state.close();
  }
}

export async function exportGraphHtml(options: ExportGraphHtmlOptions): Promise<GraphHtmlExport> {
  const paths = resolveVaultPaths(options.root);
  const graph = options.graph ?? await freshGraph(options.root);
  const html = renderGraphHtml(graph);
  const path = join(paths.notva, "graph.html");
  await writeFile(path, html, "utf8");
  return { path, html, graph };
}

export async function listGraphNeighbors(options: ListGraphNeighborsOptions): Promise<GraphNeighborhood> {
  const exported = await exportGraphJson({ root: options.root });
  const node = exported.nodes.find((candidate) => candidate.id === options.id);
  if (!node) throw new Error(`Graph node not found: ${options.id}`);

  const edges = exported.edges.filter((edge) => edge.source === options.id || edge.target === options.id);
  const neighborIds = new Set(edges.map((edge) => edge.source === options.id ? edge.target : edge.source));
  const neighbors = exported.nodes.filter((candidate) => neighborIds.has(candidate.id));

  return { node, neighbors, edges };
}

async function freshGraph(root: string): Promise<GraphExport> {
  await rebuildGraph({ root });
  return exportGraphJson({ root });
}

export async function explainGraphNode(options: ExplainGraphNodeOptions): Promise<GraphNeighborhood> {
  const exported = await exportGraphJson({ root: options.root });
  const node = findGraphNode(exported.nodes, options.query);
  if (!node) throw new Error(`Graph node not found: ${options.query}`);
  return listGraphNeighbors({ root: options.root, id: node.id });
}

export async function findGraphPath(options: FindGraphPathOptions): Promise<GraphPathResult> {
  const exported = await exportGraphJson({ root: options.root });
  const start = findGraphNode(exported.nodes, options.from);
  if (!start) throw new Error(`Graph node not found: ${options.from}`);
  const goal = findGraphNode(exported.nodes, options.to);
  if (!goal) throw new Error(`Graph node not found: ${options.to}`);

  const nodeById = new Map(exported.nodes.map((node) => [node.id, node]));
  const adjacent = new Map<string, GraphEdgeRecord[]>();
  for (const edge of exported.edges) {
    adjacent.set(edge.source, [...(adjacent.get(edge.source) ?? []), edge]);
    adjacent.set(edge.target, [...(adjacent.get(edge.target) ?? []), edge]);
  }

  const queue = [start.id];
  const seen = new Set([start.id]);
  const previous = new Map<string, { nodeId: string; edge: GraphEdgeRecord }>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === goal.id) break;
    for (const edge of adjacent.get(current) ?? []) {
      const next = edge.source === current ? edge.target : edge.source;
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, { nodeId: current, edge });
      queue.push(next);
    }
  }

  if (!seen.has(goal.id)) throw new Error(`No graph path found from "${options.from}" to "${options.to}".`);

  const pathNodeIds = [goal.id];
  const pathEdges: GraphEdgeRecord[] = [];
  let cursor = goal.id;
  while (cursor !== start.id) {
    const step = previous.get(cursor);
    if (!step) throw new Error(`No graph path found from "${options.from}" to "${options.to}".`);
    pathEdges.unshift(step.edge);
    pathNodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }

  return {
    nodes: pathNodeIds.map((id) => {
      const node = nodeById.get(id);
      if (!node) throw new Error(`Graph node not found while building path: ${id}`);
      return node;
    }),
    edges: pathEdges
  };
}

export function sourceNodeId(sourceId: string): string {
  return `source:${sourceId}`;
}

export function pageNodeId(path: string): string {
  return `page:${path}`;
}

export function conceptNodeId(label: string): string {
  return `concept:${slugify(label)}`;
}

function deriveGraphRecords(sources: SourceRecord[], pages: PageRecord[]): { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] } {
  const nodes = new Map<string, GraphNodeRecord>();
  const edges = new Map<string, GraphEdgeRecord>();
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const pagesByPath = new Map(pages.map((page) => [page.path, page]));
  const pagePathBySlug = new Map(pages.map((page) => [slugify(page.title), page.path]));

  for (const source of sources) {
    nodes.set(sourceNodeId(source.id), {
      id: sourceNodeId(source.id),
      label: source.title,
      kind: "source",
      sourceId: source.id
    });
  }

  for (const page of pages) {
    nodes.set(pageNodeId(page.path), {
      id: pageNodeId(page.path),
      label: page.title,
      kind: "page",
      path: page.path
    });
  }

  for (const page of pages) {
    const pageId = pageNodeId(page.path);
    for (const source of sourcesById.values()) {
      if (!page.body.includes(source.id)) continue;
      addEdge(edges, {
        source: pageId,
        target: sourceNodeId(source.id),
        relation: "cites",
        confidence: "EXTRACTED",
        evidence: source.id,
        sourceId: source.id
      });
      addEdge(edges, {
        source: sourceNodeId(source.id),
        target: pageId,
        relation: "supports",
        confidence: "EXTRACTED",
        sourceId: source.id
      });
    }

    for (const link of extractWikiLinks(page.body)) {
      const targetPath = resolveWikiTarget(link.target, pagePathBySlug, pagesByPath);
      if (!targetPath) {
        const conceptId = conceptNodeId(link.target);
        nodes.set(conceptId, {
          id: conceptId,
          label: link.target,
          kind: "concept"
        });
        addEdge(edges, {
          source: pageId,
          target: conceptId,
          relation: "mentions",
          confidence: "EXTRACTED",
          evidence: link.evidence
        });
        continue;
      }
      if (targetPath === page.path) continue;
      addEdge(edges, {
        source: pageId,
        target: pageNodeId(targetPath),
        relation: "links_to",
        confidence: "EXTRACTED",
        evidence: link.evidence
      });
    }

    for (const link of extractMarkdownLinks(page.body)) {
      const targetPath = resolveMarkdownTarget(link.target, page.path, pagesByPath);
      if (!targetPath || targetPath === page.path) continue;
      addEdge(edges, {
        source: pageId,
        target: pageNodeId(targetPath),
        relation: "links_to",
        confidence: "EXTRACTED",
        evidence: link.evidence
      });
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort(compareEdges)
  };
}

function extractWikiLinks(body: string): Array<{ target: string; evidence: string }> {
  return [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => {
    const rawTarget = match[1].split("|")[0].split("#")[0].trim();
    return { target: rawTarget, evidence: match[0] };
  }).filter((link) => link.target.length > 0);
}

function extractMarkdownLinks(body: string): Array<{ target: string; evidence: string }> {
  return [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => {
    const target = match[1].split("#")[0].trim();
    return { target, evidence: match[0] };
  }).filter((link) => link.target.length > 0);
}

function resolveWikiTarget(target: string, pagePathBySlug: Map<string, string>, pagesByPath: Map<string, PageRecord>): string | undefined {
  const withExtension = target.endsWith(".md") ? target : `${slugify(target)}.md`;
  return pagesByPath.has(withExtension) ? withExtension : pagePathBySlug.get(slugify(target));
}

function resolveMarkdownTarget(target: string, currentPath: string, pagesByPath: Map<string, PageRecord>): string | undefined {
  if (/^[a-z]+:\/\//i.test(target)) return undefined;
  const cleanTarget = target.replace(/^\.\//, "");
  if (pagesByPath.has(cleanTarget)) return cleanTarget;
  const siblingTarget = currentPath.includes("/")
    ? `${currentPath.slice(0, currentPath.lastIndexOf("/") + 1)}${cleanTarget}`
    : cleanTarget;
  return pagesByPath.has(siblingTarget) ? siblingTarget : undefined;
}

function addEdge(edges: Map<string, GraphEdgeRecord>, edge: GraphEdgeRecord): void {
  edges.set(edgeKey(edge), edge);
}

function edgeKey(edge: GraphEdgeRecord): string {
  return [
    edge.source,
    edge.target,
    edge.relation,
    edge.confidence,
    edge.confidenceScore ?? "",
    edge.evidence ?? "",
    edge.sourceId ?? ""
  ].join("\0");
}

function compareEdges(a: GraphEdgeRecord, b: GraphEdgeRecord): number {
  return edgeKey(a).localeCompare(edgeKey(b));
}

function findGraphNode(nodes: GraphNodeRecord[], query: string): GraphNodeRecord | undefined {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return undefined;
  return nodes.find((node) => node.id.toLocaleLowerCase() === normalized)
    ?? nodes.find((node) => node.path?.toLocaleLowerCase() === normalized)
    ?? nodes.find((node) => node.label.toLocaleLowerCase() === normalized)
    ?? nodes.find((node) => node.label.toLocaleLowerCase().includes(normalized))
    ?? nodes.find((node) => node.path?.toLocaleLowerCase().includes(normalized));
}

function renderGraphHtml(graph: GraphExport): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Notva Graph</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #fbfaf5;
      --ink: #17201b;
      --muted: #5d6861;
      --line: #d9d1bf;
      --green: #247a57;
      --source: #b66a27;
      --concept: #8b3f70;
      --claim: #4f5c9a;
      --citation: #65707a;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        linear-gradient(var(--line) 1px, transparent 1px),
        linear-gradient(90deg, var(--line) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    header,
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
    }

    header {
      padding: 32px 0 18px;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 54px);
      line-height: 0.95;
      letter-spacing: 0;
    }

    .subhead {
      margin: 10px 0 0;
      color: var(--muted);
    }

    .summary {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 18px;
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(260px, max-content) max-content max-content;
      gap: 10px;
      align-items: center;
      margin-top: 14px;
    }

    .search-box {
      display: grid;
      gap: 5px;
    }

    label,
    legend {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    input[type="search"] {
      min-height: 38px;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.72);
      font: inherit;
    }

    fieldset {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
      margin: 0;
      border: 0;
      padding: 0;
    }

    .kind-filter {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 9px;
      background: rgba(255, 255, 255, 0.68);
      color: var(--ink);
      font-size: 14px;
      font-weight: 700;
      text-transform: none;
    }

    button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.72);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button:hover {
      border-color: var(--green);
      color: var(--green);
    }

    .pill {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.68);
      border-radius: 8px;
      padding: 7px 10px;
      font-weight: 700;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      gap: 16px;
      padding-bottom: 28px;
    }

    section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.76);
    }

    .graph-card {
      padding: 14px;
    }

    svg {
      width: 100%;
      height: min(62vh, 620px);
      min-height: 420px;
      display: block;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: rgba(251, 250, 245, 0.85);
    }

    .lists {
      display: grid;
      gap: 16px;
    }

    .list {
      padding: 14px;
      max-height: 42vh;
      overflow: auto;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 17px;
      letter-spacing: 0;
    }

    ol,
    ul {
      margin: 0;
      padding-left: 20px;
    }

    li + li {
      margin-top: 7px;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
    }

    .kind {
      color: var(--muted);
    }

    .node-row button {
      width: 100%;
      min-height: 0;
      border: 0;
      border-radius: 6px;
      padding: 4px 6px;
      background: transparent;
      text-align: left;
      font-weight: 400;
    }

    .node-row button:hover {
      background: rgba(36, 122, 87, 0.08);
    }

    .node-row.is-selected button {
      background: rgba(36, 122, 87, 0.14);
      color: var(--green);
      font-weight: 800;
    }

    .edge-row.is-related {
      color: var(--green);
      font-weight: 700;
    }

    .graph-node {
      cursor: pointer;
    }

    .graph-node circle {
      transition: r 160ms ease, stroke-width 160ms ease, opacity 160ms ease;
    }

    .graph-edge {
      transition: opacity 160ms ease, stroke-width 160ms ease;
    }

    .is-dim {
      opacity: 0.16;
    }

    .graph-node.is-selected circle {
      r: 24px;
      stroke: var(--ink);
      stroke-width: 5px;
    }

    .graph-edge.is-related {
      stroke: var(--green);
      stroke-width: 4px;
    }

    @media (max-width: 860px) {
      .toolbar {
        grid-template-columns: 1fr;
      }

      .workspace {
        grid-template-columns: 1fr;
      }

      svg {
        min-height: 360px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Notva Graph</h1>
    <p class="subhead">Portable map of reviewed wiki pages, sources, open concepts, and explicit relationships.</p>
    <div class="summary">
      <span class="pill" id="node-count"></span>
      <span class="pill" id="edge-count"></span>
      <span class="pill" id="page-count"></span>
      <span class="pill" id="concept-count"></span>
      <span class="pill" id="visible-count"></span>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <label for="graph-search">Search</label>
        <input id="graph-search" type="search" autocomplete="off" placeholder="Find pages, concepts, sources, paths">
      </div>
      <fieldset aria-label="Node type filters">
        <legend>Types</legend>
        <label class="kind-filter"><input type="checkbox" data-kind="page" checked> Pages</label>
        <label class="kind-filter"><input type="checkbox" data-kind="source" checked> Sources</label>
        <label class="kind-filter"><input type="checkbox" data-kind="concept" checked> Concepts</label>
        <label class="kind-filter"><input type="checkbox" data-kind="claim" checked> Claims</label>
        <label class="kind-filter"><input type="checkbox" data-kind="citation" checked> Citations</label>
      </fieldset>
      <button id="clear-selection" type="button">Clear Focus</button>
    </div>
  </header>
  <main class="workspace">
    <section class="graph-card" aria-label="Graph visualization">
      <svg id="graph-svg" viewBox="0 0 960 560" role="img" aria-label="Notva knowledge graph"></svg>
    </section>
    <div class="lists">
      <section class="list">
        <h2>Nodes</h2>
        <ol id="nodes-list"></ol>
      </section>
      <section class="list">
        <h2>Relationships</h2>
        <ul id="edges-list"></ul>
      </section>
    </div>
  </main>
  <script>
    window.NOTVA_GRAPH = ${toScriptJson(graph)};

    const graph = window.NOTVA_GRAPH;
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const counts = graph.nodes.reduce((acc, node) => {
      acc[node.kind] = (acc[node.kind] || 0) + 1;
      return acc;
    }, {});

    document.querySelector("#node-count").textContent = graph.nodes.length + " nodes";
    document.querySelector("#edge-count").textContent = graph.edges.length + " relationships";
    document.querySelector("#page-count").textContent = (counts.page || 0) + " pages";
    document.querySelector("#concept-count").textContent = (counts.concept || 0) + " open concepts";
    const visibleCount = document.querySelector("#visible-count");
    const searchInput = document.querySelector("#graph-search");
    const kindInputs = [...document.querySelectorAll("[data-kind]")];
    const clearSelection = document.querySelector("#clear-selection");
    let selectedNodeId = null;

    const nodesList = document.querySelector("#nodes-list");
    for (const node of graph.nodes) {
      const item = document.createElement("li");
      item.className = "node-row";
      item.dataset.nodeId = node.id;
      item.dataset.nodeKind = node.kind;
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = "<strong></strong> <span class=\\"kind\\"></span>";
      button.querySelector("strong").textContent = node.label;
      button.querySelector(".kind").textContent = "(" + node.kind + (node.path ? ", " + node.path : "") + ")";
      button.addEventListener("click", () => selectNode(node.id));
      item.append(button);
      nodesList.append(item);
    }

    const edgesList = document.querySelector("#edges-list");
    graph.edges.forEach((edge, index) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      const item = document.createElement("li");
      item.className = "edge-row";
      item.dataset.edgeIndex = String(index);
      item.dataset.source = edge.source;
      item.dataset.target = edge.target;
      item.textContent = (source ? source.label : edge.source) + " -" + edge.relation + "-> " + (target ? target.label : edge.target) + " [" + edge.confidence + "]";
      edgesList.append(item);
    });

    const svg = document.querySelector("#graph-svg");
    const width = 960;
    const height = 560;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(120, Math.min(width, height) / 2 - 74);
    const positions = new Map();
    const palette = {
      page: "#247a57",
      source: "#b66a27",
      concept: "#8b3f70",
      claim: "#4f5c9a",
      citation: "#65707a"
    };

    graph.nodes.forEach((node, index) => {
      const angle = graph.nodes.length === 1 ? -Math.PI / 2 : (index / graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    });

    graph.edges.forEach((edge, index) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) return;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("graph-edge");
      line.dataset.edgeIndex = String(index);
      line.dataset.source = edge.source;
      line.dataset.target = edge.target;
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
      line.setAttribute("stroke", "#b8ad99");
      line.setAttribute("stroke-width", edge.confidence === "EXTRACTED" ? "2" : "1");
      line.setAttribute("stroke-dasharray", edge.confidence === "EXTRACTED" ? "" : "5 5");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = edge.relation + " [" + edge.confidence + "]";
      line.append(title);
      svg.append(line);
    });

    for (const node of graph.nodes) {
      const position = positions.get(node.id) || { x: centerX, y: centerY };
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("graph-node");
      group.dataset.nodeId = node.id;
      group.dataset.nodeKind = node.kind;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", position.x);
      circle.setAttribute("cy", position.y);
      circle.setAttribute("r", node.kind === "page" ? "18" : "14");
      circle.setAttribute("fill", palette[node.kind] || "#65707a");
      circle.setAttribute("stroke", "#fbfaf5");
      circle.setAttribute("stroke-width", "3");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", position.x);
      label.setAttribute("y", position.y + 34);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "12");
      label.setAttribute("font-family", "ui-sans-serif, system-ui, sans-serif");
      label.setAttribute("fill", "#17201b");
      label.textContent = node.label.length > 24 ? node.label.slice(0, 23) + "..." : node.label;
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = node.label + " (" + node.kind + ")";
      group.append(circle, label, title);
      group.addEventListener("click", () => selectNode(node.id));
      svg.append(group);
    }

    searchInput.addEventListener("input", applyGraphFilters);
    for (const input of kindInputs) input.addEventListener("change", applyGraphFilters);
    clearSelection.addEventListener("click", () => selectNode(null));
    applyGraphFilters();

    function selectNode(nodeId) {
      selectedNodeId = selectedNodeId === nodeId ? null : nodeId;
      applyGraphFilters();
    }

    function applyGraphFilters() {
      const query = normalize(searchInput.value);
      const activeKinds = new Set(kindInputs.filter((input) => input.checked).map((input) => input.dataset.kind));
      const connected = new Set();
      if (selectedNodeId) {
        connected.add(selectedNodeId);
        for (const edge of graph.edges) {
          if (edge.source === selectedNodeId) connected.add(edge.target);
          if (edge.target === selectedNodeId) connected.add(edge.source);
        }
      }

      const visibleNodes = new Set(graph.nodes
        .filter((node) => nodeMatches(node, query, activeKinds))
        .filter((node) => !selectedNodeId || connected.has(node.id))
        .map((node) => node.id));

      for (const row of document.querySelectorAll("[data-node-id]")) {
        const visible = visibleNodes.has(row.dataset.nodeId);
        row.hidden = !visible;
        row.classList.toggle("is-selected", row.dataset.nodeId === selectedNodeId);
        row.classList.toggle("is-dim", Boolean(selectedNodeId) && row.dataset.nodeId !== selectedNodeId && visible);
        if (row instanceof SVGElement) row.style.display = visible ? "" : "none";
      }

      for (const row of document.querySelectorAll("[data-edge-index]")) {
        const visible = visibleNodes.has(row.dataset.source) && visibleNodes.has(row.dataset.target);
        const related = Boolean(selectedNodeId) && (row.dataset.source === selectedNodeId || row.dataset.target === selectedNodeId);
        row.hidden = !visible;
        row.classList.toggle("is-related", related && visible);
        row.classList.toggle("is-dim", Boolean(selectedNodeId) && !related && visible);
        if (row instanceof SVGElement) row.style.display = visible ? "" : "none";
      }

      visibleCount.textContent = visibleNodes.size + " visible";
      clearSelection.disabled = !selectedNodeId;
    }

    function nodeMatches(node, query, activeKinds) {
      if (!activeKinds.has(node.kind)) return false;
      if (!query) return true;
      return [node.label, node.kind, node.path, node.sourceId, node.id]
        .filter(Boolean)
        .some((value) => normalize(value).includes(query));
    }

    function normalize(value) {
      return String(value || "").trim().toLocaleLowerCase();
    }
  </script>
</body>
</html>
`;
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
