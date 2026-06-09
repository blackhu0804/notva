import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("web workbench layout CSS", () => {
  test("uses explicit grid areas so localized labels do not scramble card placement", async () => {
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(css).toContain("grid-template-areas");
    expect(css).toContain('"source query pages"');
    expect(css).toContain('"review act pages"');
    expect(css).toContain('"lint act pages"');
    expect(css).toContain('"graph graph pages"');
    expect(css).toContain(".source-panel");
    expect(css).toContain("grid-area: source");
    expect(css).toContain("grid-area: review");
    expect(css).toContain("grid-area: query");
    expect(css).toContain("grid-area: act");
    expect(css).toContain("grid-area: pages");
    expect(css).toContain("grid-area: lint");
    expect(css).toContain("grid-area: graph");
    expect(css).toContain(".panel-head h2");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain(".panel-head select");
    expect(css).toContain("width: auto");
  });

  test("includes a compact vault status overview", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"vault-overview\"");
    expect(html).toContain("id=\"status-health\"");
    expect(html).toContain("id=\"status-sources\"");
    expect(html).toContain("id=\"status-pages\"");
    expect(html).toContain("id=\"status-pending\"");
    expect(html).toContain("id=\"status-issues\"");
    expect(html).toContain("id=\"status-runs\"");
    expect(js).toContain("/api/status");
    expect(js).toContain("loadVaultStatus");
    expect(js).toContain("els.statusHealth");
    expect(css).toContain(".vault-overview");
    expect(css).toContain(".metric");
  });

  test("localizes vault health labels in the Chinese workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("function formatVaultHealth(health)");
    expect(js).toContain("els.statusHealth.textContent = formatVaultHealth(data.status.health)");
    expect(js).toContain("health === \"ready\" ? \"就绪\" : \"待审核\"");
    expect(js).not.toContain("? \"ready\" : \"needs review\"");
  });

  test("includes graph controls in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("graph-panel");
    expect(html).toContain("图谱");
    expect(html).toContain("id=\"export-graph\"");
    expect(html).toContain("id=\"write-graph-html\"");
    expect(html).toContain("id=\"write-report\"");
    expect(html).toContain("id=\"propose-concepts\"");
    expect(html).toContain("id=\"propose-links\"");
    expect(html).toContain("id=\"explain-query\"");
    expect(html).toContain("id=\"path-from\"");
    expect(html).toContain("id=\"path-to\"");
    expect(html).toContain("id=\"graph-output\"");
    expect(js).toContain("/api/graph");
    expect(js).toContain("/api/graph/html");
    expect(js).toContain("/api/report");
    expect(js).toContain("/api/concepts/propose");
    expect(js).toContain("/api/links/propose");
    expect(js).toContain("proposeLinks");
    expect(js).toContain("已创建补链提案");
    expect(js).toContain("/api/explain");
    expect(js).toContain("/api/path");
  });

  test("embeds an interactive graph map in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"graph-search\"");
    expect(html).toContain("id=\"graph-kind-filter\"");
    expect(html).toContain("id=\"refresh-graph-map\"");
    expect(html).toContain("id=\"graph-map\"");
    expect(html).toContain("id=\"graph-detail\"");
    expect(html).toContain("aria-label=\"知识图谱画布\"");
    expect(js).toContain("loadGraphMap");
    expect(js).toContain("renderGraphMap");
    expect(js).toContain("selectGraphNode");
    expect(js).toContain("state.graph");
    expect(js).toContain("els.graphSearch");
    expect(js).toContain("els.graphKindFilter");
    expect(js).toContain("els.graphMap");
    expect(js).toContain("els.graphDetail");
    expect(js).toContain("filteredGraphNodes");
    expect(css).toContain(".graph-map-shell");
    expect(css).toContain("#graph-map");
    expect(css).toContain(".graph-node");
    expect(css).toContain(".graph-detail");
    expect(css).toContain(".graph-toolbar");
  });

  test("filters the interactive graph by relationship type", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"graph-relation-filter\"");
    expect(html).toContain("aria-label=\"图谱关系类型\"");
    expect(html).toContain("<option value=\"all\">全部关系</option>");
    expect(html).toContain("<option value=\"links_to\">链接到</option>");
    expect(html).toContain("<option value=\"cites\">引用</option>");
    expect(html).toContain("<option value=\"supports\">支持</option>");
    expect(html).toContain("<option value=\"mentions\">提及</option>");
    expect(html).toContain("<option value=\"evidenced_by\">由证据支持</option>");
    expect(js).toContain("graphRelationFilter: document.querySelector(\"#graph-relation-filter\")");
    expect(js).toContain("function filteredGraphEdges(visibleIds)");
    expect(js).toContain("const relation = els.graphRelationFilter.value");
    expect(js).toContain("relation !== \"all\" && edge.relation !== relation");
    expect(js).toContain("function graphNodesVisibleForEdges(nodes, edges)");
    expect(js).toContain("const nodes = graphNodesVisibleForEdges(filteredNodes, edges)");
    expect(js).toContain("els.graphRelationFilter.addEventListener(\"change\", renderGraphMap)");
    expect(css).toContain("#graph-relation-filter");
  });

  test("summarizes central graph nodes in the Chinese graph detail", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("function formatGraphOverview(nodes, edges)");
    expect(js).toContain("function centralGraphNodes(nodes, edges, limit = 3)");
    expect(js).toContain("function renderGraphOverviewDetail(nodes, edges)");
    expect(js).toContain("degreeByNodeId");
    expect(js).toContain("中心节点");
    expect(js).toContain("`- ${formatNode(entry.node)} · ${entry.degree} 条关系`");
    expect(js).toContain("button.className = \"central-node-button\"");
    expect(js).toContain("button.addEventListener(\"click\", () => selectGraphNode(entry.node.id))");
    expect(js).toContain("renderGraphOverviewDetail(visibleNodes, visibleEdges)");
    expect(css).toContain(".central-node-list");
    expect(css).toContain(".central-node-button");
  });

  test("localizes graph labels in the Chinese workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("function formatGraphKind(kind)");
    expect(js).toContain("page: \"页面\"");
    expect(js).toContain("source: \"来源\"");
    expect(js).toContain("concept: \"概念\"");
    expect(js).toContain("claim: \"主张\"");
    expect(js).toContain("citation: \"引用\"");
    expect(js).toContain("function formatGraphRelation(relation)");
    expect(js).toContain("supports: \"支持\"");
    expect(js).toContain("links_to: \"链接到\"");
    expect(js).toContain("cites: \"引用\"");
    expect(js).toContain("mentions: \"提及\"");
    expect(js).toContain("evidenced_by: \"由证据支持\"");
    expect(js).toContain("function formatGraphConfidence(confidence)");
    expect(js).toContain("EXTRACTED: \"已提取\"");
    expect(js).toContain("INFERRED: \"推断\"");
    expect(js).toContain("AMBIGUOUS: \"有歧义\"");
    expect(js).toContain("formatGraphKind(node.kind)");
    expect(js).toContain("formatGraphRelation(edge.relation)");
    expect(js).toContain("formatGraphConfidence(edge.confidence)");
    expect(js).not.toContain("edge.relation} · ${edge.confidence}");
    expect(js).not.toContain("--${edge.relation}-->");
    expect(js).not.toContain("[${edge.confidence}]");
  });

  test("lets graph nodes open their backing wiki page or raw source", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("id=\"graph-open-selected\"");
    expect(html).toContain("打开节点");
    expect(js).toContain("graphOpenSelected");
    expect(js).toContain("openSelectedGraphNode");
    expect(js).toContain("selectPage(node.path)");
    expect(js).toContain("selectSource(node.sourceId)");
    expect(js).toContain("图谱节点没有可直接打开的页面或来源。");
    expect(js).toContain("els.graphOpenSelected.disabled");
  });

  test("lets selected graph nodes fill path endpoints", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("id=\"graph-set-path-from\"");
    expect(html).toContain("设为起点");
    expect(html).toContain("id=\"graph-set-path-to\"");
    expect(html).toContain("设为终点");
    expect(js).toContain("graphSetPathFrom");
    expect(js).toContain("graphSetPathTo");
    expect(js).toContain("setSelectedGraphNodeAsPathEndpoint");
    expect(js).toContain("els.pathFrom.value = node.label");
    expect(js).toContain("els.pathTo.value = node.label");
    expect(js).toContain("els.graphSetPathFrom.disabled");
    expect(js).toContain("els.graphSetPathTo.disabled");
  });

  test("clears selected graph node when search or type filters hide it", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("clearHiddenGraphSelection");
    expect(js).toContain("visibleIds.has(state.selectedGraphNode)");
    expect(js).toContain("state.selectedGraphNode = \"\";");
    expect(js).toContain("clearHiddenGraphSelection(visibleIds)");
  });

  test("clears auto-filled graph explain query when filters hide the selected node", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("const hiddenNode = state.graph.nodes.find");
    expect(js).toContain("els.explainQuery.value === hiddenNode.label");
    expect(js).toContain("els.explainQuery.value = \"\";");
  });

  test("highlights selected graph node neighborhoods in the static workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("graphNeighborhoodForSelection");
    expect(js).toContain("relatedNodeIds");
    expect(js).toContain("edge.source === state.selectedGraphNode || edge.target === state.selectedGraphNode");
    expect(js).toContain("class: edgeClasses.join(\" \")");
    expect(js).toContain("class: nodeClasses.join(\" \")");
    expect(js).toContain("一跳邻居 ${relatedNodeIds.size} 个");
    expect(css).toContain(".graph-edge.related");
    expect(css).toContain(".graph-edge.dimmed");
    expect(css).toContain(".graph-node.related circle");
    expect(css).toContain(".graph-node.dimmed");
  });

  test("lets selected graph node detail traverse one-hop neighbors", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("function renderSelectedGraphNodeDetail(node, relatedEdges, nodeById, relatedNodeIds)");
    expect(js).toContain("const neighborId = edge.source === node.id ? edge.target : edge.source");
    expect(js).toContain("button.className = \"graph-neighbor-button\"");
    expect(js).toContain("button.textContent = formatNeighborButtonLabel(edge, neighbor)");
    expect(js).toContain("button.title = formatEdge(edge, nodeById)");
    expect(js).toContain("button.addEventListener(\"click\", () => selectGraphNode(neighborId))");
    expect(js).toContain("function formatNeighborButtonLabel(edge, neighbor)");
    expect(js).toContain("return `${formatGraphRelation(edge.relation)} · ${formatNode(neighbor)}`");
    expect(js).not.toContain("button.textContent = formatEdge(edge, nodeById)");
    expect(js).toContain("renderSelectedGraphNodeDetail(node, relatedEdges, nodeById, relatedNodeIds)");
    expect(css).toContain(".graph-neighbor-list");
    expect(css).toContain(".graph-neighbor-button");
  });

  test("highlights graph paths after running a path query", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("highlightedPath: emptyGraphPathHighlight()");
    expect(js).toContain("state.highlightedPath.edgeKeys.has(graphPathEdgeKey(edge))");
    expect(js).toContain("state.highlightedPath.nodeIds.has(node.id)");
    expect(js).toContain("state.highlightedPath = graphPathHighlight(data.path)");
    expect(js).toContain("function graphPathHighlight(path)");
    expect(js).toContain("function graphPathEdgeKey(edge)");
    expect(css).toContain(".graph-edge.path");
    expect(css).toContain(".graph-node.path circle");
    expect(css).toContain(".graph-node.path text");
  });

  test("includes proposal reject controls in the static workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("rejectProposal");
    expect(js).toContain("/api/review/reject");
    expect(js).toContain("拒绝");
    expect(css).toContain(".item-actions");
    expect(css).toContain(".secondary-button");
  });

  test("localizes proposal terminology in the Chinese workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("placeholder=\"筛选待审提案\"");
    expect(html).toContain("aria-label=\"筛选待审提案\"");
    expect(js).toContain("已创建 ${data.results.length} 个提案");
    expect(js).toContain("已创建待审核提案。");
    expect(js).toContain("没有待审核提案。");
    expect(js).toContain("没有匹配的待审提案。");
    expect(js).toContain("已打开提案来源");
    expect(js).toContain("已打开提案执行记录");
    expect(js).toContain("已应用 ${data.applied} 个提案。");
    expect(js).toContain("已应用 ${proposals.length} 个筛选提案");
    expect(js).toContain("已拒绝 ${proposals.length} 个筛选提案。");
    expect(js).toContain("已创建查询结果提案");
    expect(js).toContain("已复用查询结果提案");
    expect(js).toContain("已创建执行结果提案");
    expect(js).toContain("已复用执行结果提案");
    expect(js).toContain("已创建来源提案");
    expect(js).toContain("已复用待审核提案");
    expect(js).toContain("已创建 ${data.created.length} 个开放概念提案。");
    expect(js).toContain("已生成开放概念提案。");
    expect(js).toContain("已创建补链提案");
    expect(js).toContain("已复用补链提案");
    expect(html).not.toContain("待审 proposal");
    expect(js).not.toContain("待审核 proposal");
    expect(js).not.toContain("筛选 proposal");
    expect(js).not.toContain("结果 proposal");
    expect(js).not.toContain("来源 proposal");
    expect(js).not.toContain("概念 proposal");
    expect(js).not.toContain("补链 proposal");
  });

  test("includes per-proposal apply controls in the static workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("applyProposal");
    expect(js).toContain("/api/review/apply");
    expect(js).toContain("应用");
    expect(js).toContain("aria-label\", `应用 ${proposal.id}`");
  });

  test("applies only the currently filtered proposal review cards", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("id=\"apply-filtered\"");
    expect(html).toContain("应用筛选");
    expect(js).toContain("applyFiltered: document.querySelector(\"#apply-filtered\")");
    expect(js).toContain("function filteredProposals()");
    expect(js).toContain("function applyFilteredProposals()");
    expect(js).toContain("els.applyFiltered.disabled");
    expect(js).toContain("for (const proposal of proposals)");
    expect(js).toContain("proposalId: proposal.id");
    expect(js).toContain("已应用 ${proposals.length} 个筛选提案");
    expect(js).toContain("els.applyFiltered.addEventListener(\"click\", withErrors(applyFilteredProposals))");
  });

  test("rejects only the currently filtered proposal review cards", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("id=\"reject-filtered\"");
    expect(html).toContain("拒绝筛选");
    expect(js).toContain("rejectFiltered: document.querySelector(\"#reject-filtered\")");
    expect(js).toContain("els.rejectFiltered.disabled");
    expect(js).toContain("function rejectFilteredProposals()");
    expect(js).toContain("/api/review/reject");
    expect(js).toContain("for (const proposal of proposals)");
    expect(js).toContain("proposalId: proposal.id");
    expect(js).toContain("已拒绝 ${proposals.length} 个筛选提案");
    expect(js).toContain("await loadVaultStatus()");
    expect(js).not.toContain("await loadStatus()");
    expect(js).toContain("els.rejectFiltered.addEventListener(\"click\", withErrors(rejectFilteredProposals))");
  });

  test("opens the applied wiki page after applying one proposal", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("openAppliedProposalPage");
    expect(js).toContain("data.proposal?.changes?.[0]?.path");
    expect(js).toContain("selectPage(appliedPath)");
    expect(js).toContain("已应用并打开");
  });

  test("includes proposal change previews in the static workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("renderProposalPreview");
    expect(js).toContain("proposal.changes");
    expect(js).toContain("预览");
    expect(js).toContain("proposal-change-path");
    expect(css).toContain(".proposal-preview");
    expect(css).toContain(".proposal-change-path");
    expect(css).toContain(".proposal-preview pre");
  });

  test("shows source evidence on proposal review cards", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("renderProposalSourceEvidence");
    expect(js).toContain("proposal.sourceEvidence");
    expect(js).toContain("来源证据");
    expect(js).toContain("originalRef");
    expect(css).toContain(".proposal-source");
    expect(css).toContain(".proposal-source-preview");
  });

  test("lets proposal review cards open their raw source or act run", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("proposalSourceTypeLabel");
    expect(js).toContain("执行结果");
    expect(js).toContain("查询结果");
    expect(js).toContain("原始资料");
    expect(js).toContain("openProposalSource");
    expect(js).toContain("openProposalActRun");
    expect(js).toContain("selectSource(evidence.source.id)");
    expect(js).toContain("selectActRun(runId)");
    expect(js).toContain("打开来源");
    expect(js).toContain("打开执行记录");
    expect(css).toContain(".proposal-source-meta");
    expect(css).toContain(".proposal-source-actions");
    expect(css).toContain(".proposal-source-type");
  });

  test("includes proposal edit controls in the static workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("saveProposalChange");
    expect(js).toContain("/api/review/update");
    expect(js).toContain("保存编辑");
    expect(js).toContain("proposal-change-editor");
    expect(js).toContain("textarea");
    expect(css).toContain(".proposal-change-editor");
    expect(css).toContain(".proposal-change-actions");
  });

  test("includes wiki page edit controls in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"save-page\"");
    expect(html).toContain("id=\"page-body\"");
    expect(js).toContain("savePage");
    expect(js).toContain("POST");
    expect(js).toContain("/api/page");
    expect(js).toContain("已保存页面");
    expect(css).toContain(".page-editor");
    expect(css).toContain(".page-actions");
  });

  test("filters wiki page and raw source browsers in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"page-filter\"");
    expect(html).toContain("placeholder=\"筛选 Wiki 页面\"");
    expect(html).toContain("id=\"source-filter\"");
    expect(html).toContain("placeholder=\"筛选来源\"");
    expect(js).toContain("pages: []");
    expect(js).toContain("sources: []");
    expect(js).toContain("pageFilter: document.querySelector(\"#page-filter\")");
    expect(js).toContain("sourceFilter: document.querySelector(\"#source-filter\")");
    expect(js).toContain("function renderPages()");
    expect(js).toContain("function renderSources()");
    expect(js).toContain("matchesListFilter");
    expect(js).toContain("没有匹配的 Wiki 页面。");
    expect(js).toContain("没有匹配的来源。");
    expect(js).toContain("els.pageFilter.addEventListener(\"input\", renderPages)");
    expect(js).toContain("els.sourceFilter.addEventListener(\"input\", renderSources)");
    expect(css).toContain(".list-filter");
  });

  test("filters pending proposal review cards in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("id=\"proposal-filter\"");
    expect(html).toContain("placeholder=\"筛选待审提案\"");
    expect(js).toContain("proposals: []");
    expect(js).toContain("proposalFilter: document.querySelector(\"#proposal-filter\")");
    expect(js).toContain("function renderProposals()");
    expect(js).toContain("proposalMatchesFilter");
    expect(js).toContain("proposalFilterFields");
    expect(js).toContain("proposalSourceTypeLabel(proposal.sourceEvidence.source)");
    expect(js).toContain("没有匹配的待审提案。");
    expect(js).toContain("els.proposalFilter.addEventListener(\"input\", renderProposals)");
  });

  test("includes context pack controls for downstream actions", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"context-pack\"");
    expect(html).toContain("上下文");
    expect(html).toContain("id=\"context-output\"");
    expect(js).toContain("loadContextPack");
    expect(js).toContain("/api/context");
    expect(js).toContain("查询：${pack.query}");
    expect(js).toContain("已审核 Wiki 证据");
    expect(js).toContain("关联来源");
    expect(js).toContain("formatContextSources");
    expect(js).toContain("formatContextEvidence");
    expect(js).toContain("formatContextEvidenceSources");
    expect(js).toContain("hit.sources");
    expect(js).toContain("来源：无");
    expect(js).toContain("原始来源证据");
    expect(js).toContain("formatRawSourceHits");
    expect(js).toContain("图谱邻居");
    expect(js).toContain("建议整理动作");
    expect(js).toContain("formatContextActions");
    expect(js).toContain("知识库规则");
    expect(js).toContain("pack.rules");
    expect(js).toContain("命令：${action.command}");
    expect(js).toContain("原因：${action.reason}");
    expect(js).toContain("没有需要立即运行的 Notva 整理命令。");
    expect(js).toContain("执行指引");
    expect(js).not.toContain("Query: ${pack.query}");
    expect(js).not.toContain("\"Evidence\"");
    expect(js).not.toContain("\"Raw Source Evidence\"");
    expect(js).not.toContain("\"Graph Neighborhoods\"");
    expect(js).not.toContain("\"Vault Rules\"");
    expect(js).not.toContain("\"Execution Guidance\"");
    expect(css).toContain(".context-output");
    expect(css).toContain(".act-actions");
  });

  test("includes query-to-proposal controls in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"propose-query\"");
    expect(html).toContain("沉淀");
    expect(js).toContain("/api/query/propose");
    expect(js).toContain("proposeQueryResult");
    expect(js).toContain("已创建查询结果提案");
    expect(js).toContain("await Promise.all([loadProposals(), loadVaultStatus()]);");
    expect(css).toContain(".query-actions");
  });

  test("shows source provenance for query results in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("class=\"query-output\"");
    expect(js).toContain("renderQueryResult");
    expect(js).toContain("renderQueryHitSources");
    expect(js).toContain("hit.sources");
    expect(js).toContain("来源");
    expect(js).toContain("originalRef");
    expect(css).toContain(".query-output");
    expect(css).toContain(".query-hit-source");
  });

  test("lets query result hits open their wiki page or raw source", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(js).toContain("openQueryHitPage");
    expect(js).toContain("openQueryHitSource");
    expect(js).toContain("selectPage(hit.path)");
    expect(js).toContain("selectSource(source.id)");
    expect(js).toContain("pageButton.type = \"button\"");
    expect(js).toContain("sourceButton.type = \"button\"");
    expect(js).toContain("query-hit-page");
    expect(js).toContain("已打开查询页面");
    expect(js).toContain("已打开查询来源");
    expect(css).toContain(".query-hit-page");
    expect(css).toContain(".query-hit-source");
    expect(css).toMatch(/\.query-hit-page\s*\{[^}]*text-align: left/s);
  });

  test("includes clickable execution maintenance actions", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"execution-actions\"");
    expect(js).toContain("renderExecutionActions");
    expect(js).toContain("runExecutionAction");
    expect(js).toContain("/api/action/run");
    expect(js).toContain("执行整理");
    expect(js).toContain("没有待执行的整理动作。");
    expect(css).toContain(".execution-actions");
    expect(css).toContain(".execution-action");
  });

  test("localizes health check issues in the Chinese workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("function formatLintIssue(issue)");
    expect(js).toContain("function lintIssueTitle(code)");
    expect(js).toContain("missing_sources: \"缺少来源\"");
    expect(js).toContain("broken_wiki_link: \"断开的 Wiki 链接\"");
    expect(js).toContain("open_concept: \"开放概念\"");
    expect(js).toContain("pending_proposal: \"待审提案\"");
    expect(js).toContain("source_without_page: \"未覆盖来源\"");
    expect(js).toContain("formatLintIssue(issue)");
    expect(js).toContain("title.textContent = lintIssue.title");
    expect(js).toContain("detail.textContent = lintIssue.detail");
    expect(js).toContain("issue.path ? `${issue.path}：${lintIssue.title}` : lintIssue.title");
    expect(js).toContain("sourceMatch = issue.message.match(/Source ([^ ]+) has no accepted wiki coverage\\./)");
    expect(js).not.toContain("item.innerHTML = `<strong>${issue.code}</strong><small>${issue.message}</small>`");
  });

  test("includes one-click act run-actions controls", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"run-act-actions\"");
    expect(html).toContain("整理后运行");
    expect(js).toContain("runActWithActions");
    expect(js).toContain("runActions: true");
    expect(js).toContain("els.runActActions");
    expect(js).toContain("renderExecutionActions(data.execution?.actions || []);");
    expect(js).toContain("await refreshAll();");
    expect(css).toContain(".act-actions");
  });

  test("includes direct act-to-proposal controls in the static workbench", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("id=\"run-act-propose\"");
    expect(html).toContain("运行并沉淀");
    expect(js).toContain("runActAndPropose");
    expect(js).toContain("propose: true");
    expect(js).toContain("els.runActPropose");
    expect(js).toContain("已创建执行结果提案");
    expect(js).toContain("已复用执行结果提案");
    expect(js).toContain("data.proposal?.id");
    expect(css).toContain("grid-template-columns: repeat(4");
  });

  test("includes act run history controls", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("执行历史");
    expect(html).toContain("id=\"refresh-runs\"");
    expect(html).toContain("id=\"propose-act-run\"");
    expect(html).toContain("生成提案");
    expect(html).toContain("id=\"run-list\"");
    expect(html).toContain("id=\"run-body\"");
    expect(js).toContain("/api/act/runs");
    expect(js).toContain("/api/act/run");
    expect(js).toContain("/api/act/propose");
    expect(js).toContain("selectedRun: \"\"");
    expect(js).toContain("loadActRuns");
    expect(js).toContain("selectActRun");
    expect(js).toContain("proposeSelectedActRun");
    expect(js).toContain("els.proposeActRun.disabled");
    expect(js).toContain("loadActRuns(), runLint()");
    expect(css).toContain(".run-list");
    expect(css).toContain(".run-history-actions");
    expect(css).toContain("#run-body");
  });

  test("localizes act run status labels in the Chinese workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("function formatActRunStatus(status)");
    expect(js).toContain("ready: \"就绪\"");
    expect(js).toContain("needs_maintenance: \"需要整理\"");
    expect(js).toContain("missing_context: \"缺少上下文\"");
    expect(js).toContain("button.textContent = `${run.task} · ${formatActRunStatus(run.status)}`");
    expect(js).toContain("button.title = `${run.id} · 证据 ${run.evidenceCount} · 原始来源 ${run.sourceHitCount} · 整理动作 ${run.actionCount}`");
    expect(js).not.toContain("button.textContent = `${run.task} · ${run.status}`");
    expect(js).not.toContain("evidence ${run.evidenceCount}");
    expect(js).not.toContain("actions ${run.actionCount}");
  });

  test("includes directory ingestion controls", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(html).toContain("<option value=\"directory\">文件夹</option>");
    expect(html).toContain("粘贴文本、文件路径、文件夹路径或 URL。");
    expect(js).toContain("kind === \"directory\"");
    expect(js).toContain("已创建");
    expect(js).toContain("个提案");
  });

  test("includes raw source browsing controls", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("sources-panel");
    expect(html).toContain("来源");
    expect(html).toContain("id=\"source-list\"");
    expect(html).toContain("id=\"source-body\"");
    expect(html).toContain("id=\"refresh-sources\"");
    expect(html).toContain("id=\"propose-source\"");
    expect(html).toContain("id=\"propose-uncovered-sources\"");
    expect(js).toContain("loadSources");
    expect(js).toContain("selectSource");
    expect(js).toContain("proposeSelectedSource");
    expect(js).toContain("/api/source/propose");
    expect(js).toContain("已创建来源提案");
    expect(js).toContain("proposeUncoveredSources");
    expect(js).toContain("/api/sources/propose-uncovered");
    expect(js).toContain("已补全");
    expect(js).toContain("document.createElement(\"a\")");
    expect(js).toContain("role\", \"button\"");
    expect(js).toContain("preventDefault");
    expect(js).toContain("source-button");
    expect(js).toContain("source-button-label");
    expect(js).toContain("/api/sources");
    expect(js).toContain("/api/source");
    expect(js).toContain("类型：${formatSourceKind(data.source.kind)}");
    expect(js).toContain("原始文件：${data.source.rawPath}");
    expect(js).toContain("原始引用：${data.source.originalRef}");
    expect(js).not.toContain("kind: ${data.source.kind}");
    expect(js).not.toContain("raw: ${data.source.rawPath}");
    expect(js).not.toContain("original: ${data.source.originalRef}");
    expect(css).toContain(".sources-panel");
    expect(css).toContain("grid-area: sources");
    expect(css).toContain("#source-list");
    expect(css).toMatch(/#source-list\s*\{[^}]*display: flex/s);
    expect(css).toMatch(/#source-list\s*\{[^}]*flex-direction: column/s);
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain(".source-button");
    expect(css).toContain("appearance: none");
    expect(css).toMatch(/\.source-button\s*\{[^}]*display: block/s);
    expect(css).toMatch(/\.source-button\s*\{[^}]*height: max-content/s);
    expect(css).toMatch(/\.source-button\s*\{[^}]*flex: 0 0 auto/s);
    expect(css).toContain(".source-button-label");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("word-break: break-word");
  });

  test("localizes source kind labels in the Chinese workbench", async () => {
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");

    expect(js).toContain("function formatSourceKind(kind)");
    expect(js).toContain("text: \"文本\"");
    expect(js).toContain("file: \"文件\"");
    expect(js).toContain("directory: \"文件夹\"");
    expect(js).toContain("url: \"URL\"");
    expect(js).toContain("formatSourceKind(evidence.source.kind)");
    expect(js).toContain("formatSourceKind(source.kind)");
    expect(js).toContain("formatSourceKind(sourceEvidence.source.kind)");
    expect(js).toContain("类型：${formatSourceKind(data.source.kind)}");
    expect(js).toContain("类型：${formatSourceKind(hit.source.kind)}");
    expect(js).toContain("类型：${formatSourceKind(source.kind)}");
    expect(js).not.toContain("· ${evidence.source.kind}");
    expect(js).not.toContain("· ${source.kind}");
    expect(js).not.toContain("类型：${data.source.kind}");
    expect(js).not.toContain("类型：${hit.source.kind}");
    expect(js).not.toContain("类型：${source.kind}");
  });

  test("includes editable vault rules controls", async () => {
    const html = await readFile(new URL("../../web/static/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../../web/static/app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(html).toContain("rules-panel");
    expect(html).toContain("id=\"rules-body\"");
    expect(html).toContain("id=\"save-rules\"");
    expect(html).toContain("id=\"refresh-rules\"");
    expect(html).toContain("规则");
    expect(js).toContain("/api/rules");
    expect(js).toContain("loadRules");
    expect(js).toContain("saveRules");
    expect(js).toContain("rulesBody: document.querySelector(\"#rules-body\")");
    expect(js).toContain("已保存知识库规则");
    expect(css).toContain(".rules-panel");
    expect(css).toContain(".rules-editor");
    expect(css).toContain("grid-area: rules");
  });
});
