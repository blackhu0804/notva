const state = {
  vault: localStorage.getItem("notva:vault") || "",
  selectedPage: "",
  selectedSource: "",
  selectedRun: "",
  selectedGraphNode: "",
  highlightedPath: emptyGraphPathHighlight(),
  proposals: [],
  pages: [],
  sources: [],
  graph: {
    nodes: [],
    edges: []
  }
};

const els = {
  vaultForm: document.querySelector("#vault-form"),
  vault: document.querySelector("#vault"),
  status: document.querySelector("#status"),
  statusHealth: document.querySelector("#status-health"),
  statusSources: document.querySelector("#status-sources"),
  statusPages: document.querySelector("#status-pages"),
  statusPending: document.querySelector("#status-pending"),
  statusIssues: document.querySelector("#status-issues"),
  statusRuns: document.querySelector("#status-runs"),
  ingestForm: document.querySelector("#ingest-form"),
  sourceKind: document.querySelector("#source-kind"),
  sourceTarget: document.querySelector("#source-target"),
  proposalList: document.querySelector("#proposal-list"),
  proposalFilter: document.querySelector("#proposal-filter"),
  applyFiltered: document.querySelector("#apply-filtered"),
  rejectFiltered: document.querySelector("#reject-filtered"),
  applyAll: document.querySelector("#apply-all"),
  queryForm: document.querySelector("#query-form"),
  question: document.querySelector("#question"),
  proposeQuery: document.querySelector("#propose-query"),
  answer: document.querySelector("#answer"),
  actForm: document.querySelector("#act-form"),
  task: document.querySelector("#task"),
  runActPropose: document.querySelector("#run-act-propose"),
  runActActions: document.querySelector("#run-act-actions"),
  contextPack: document.querySelector("#context-pack"),
  actionOutput: document.querySelector("#action-output"),
  executionActions: document.querySelector("#execution-actions"),
  contextOutput: document.querySelector("#context-output"),
  refreshRuns: document.querySelector("#refresh-runs"),
  proposeActRun: document.querySelector("#propose-act-run"),
  runList: document.querySelector("#run-list"),
  runBody: document.querySelector("#run-body"),
  pageList: document.querySelector("#page-list"),
  pageFilter: document.querySelector("#page-filter"),
  pageBody: document.querySelector("#page-body"),
  savePage: document.querySelector("#save-page"),
  refreshPages: document.querySelector("#refresh-pages"),
  sourceList: document.querySelector("#source-list"),
  sourceFilter: document.querySelector("#source-filter"),
  sourceBody: document.querySelector("#source-body"),
  proposeSource: document.querySelector("#propose-source"),
  proposeUncoveredSources: document.querySelector("#propose-uncovered-sources"),
  refreshSources: document.querySelector("#refresh-sources"),
  rulesBody: document.querySelector("#rules-body"),
  saveRules: document.querySelector("#save-rules"),
  refreshRules: document.querySelector("#refresh-rules"),
  runLint: document.querySelector("#run-lint"),
  lintList: document.querySelector("#lint-list"),
  exportGraph: document.querySelector("#export-graph"),
  writeGraphHtml: document.querySelector("#write-graph-html"),
  writeReport: document.querySelector("#write-report"),
  proposeConcepts: document.querySelector("#propose-concepts"),
  proposeLinks: document.querySelector("#propose-links"),
  graphHtmlLink: document.querySelector("#graph-html-link"),
  explainQuery: document.querySelector("#explain-query"),
  runExplain: document.querySelector("#run-explain"),
  pathFrom: document.querySelector("#path-from"),
  pathTo: document.querySelector("#path-to"),
  runPath: document.querySelector("#run-path"),
  graphSearch: document.querySelector("#graph-search"),
  graphKindFilter: document.querySelector("#graph-kind-filter"),
  graphRelationFilter: document.querySelector("#graph-relation-filter"),
  refreshGraphMap: document.querySelector("#refresh-graph-map"),
  graphMap: document.querySelector("#graph-map"),
  graphDetail: document.querySelector("#graph-detail"),
  graphOpenSelected: document.querySelector("#graph-open-selected"),
  graphSetPathFrom: document.querySelector("#graph-set-path-from"),
  graphSetPathTo: document.querySelector("#graph-set-path-to"),
  graphOutput: document.querySelector("#graph-output")
};

els.vault.value = state.vault;

const SVG_NS = "http://www.w3.org/2000/svg";

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function vault() {
  const value = els.vault.value.trim();
  if (!value) throw new Error("知识库路径不能为空。");
  state.vault = value;
  localStorage.setItem("notva:vault", value);
  return value;
}

function setStatus(message) {
  els.status.textContent = message;
}

function formatVaultHealth(health) {
  return health === "ready" ? "就绪" : "待审核";
}

function formatSourceKind(kind) {
  const labels = {
    text: "文本",
    file: "文件",
    directory: "文件夹",
    url: "URL"
  };
  return labels[kind] || kind;
}

function formatActRunStatus(status) {
  const labels = {
    ready: "就绪",
    needs_maintenance: "需要整理",
    missing_context: "缺少上下文"
  };
  return labels[status] || status;
}

function renderList(container, items, renderItem, emptyText) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  for (const item of items) {
    container.append(renderItem(item));
  }
}

async function initVault() {
  await fetchJson("/api/init", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  setStatus(`已初始化 ${state.vault}`);
  await refreshAll();
  await loadRules();
}

async function loadVaultStatus() {
  const data = await fetchJson(`/api/status?vault=${encodeURIComponent(vault())}`);
  els.statusHealth.textContent = formatVaultHealth(data.status.health);
  els.statusSources.textContent = String(data.status.sourceCount);
  els.statusPages.textContent = String(data.status.pageCount);
  els.statusPending.textContent = String(data.status.pendingProposalCount);
  els.statusIssues.textContent = String(data.status.lintIssueCount);
  els.statusRuns.textContent = String(data.status.actRunCount);
}

async function ingestSource() {
  const kind = els.sourceKind.value;
  const target = els.sourceTarget.value.trim();
  const data = await fetchJson("/api/ingest", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), kind, target })
  });
  els.sourceTarget.value = "";
  if (kind === "directory") {
    setStatus(`已创建 ${data.results.length} 个提案，跳过 ${data.skipped.length} 项。`);
  } else {
    setStatus("已创建待审核提案。");
  }
  await Promise.all([loadProposals(), loadSources()]);
}

async function loadProposals() {
  const data = await fetchJson(`/api/proposals?vault=${encodeURIComponent(vault())}`);
  state.proposals = data.proposals;
  renderProposals();
}

function renderProposals() {
  const proposals = filteredProposals();
  els.applyFiltered.disabled = !proposalFilterQuery() || proposals.length === 0;
  els.rejectFiltered.disabled = !proposalFilterQuery() || proposals.length === 0;
  renderList(els.proposalList, proposals, (proposal) => {
    const item = document.createElement("article");
    item.className = "item";
    const id = document.createElement("strong");
    id.textContent = proposal.id;
    const summary = document.createElement("small");
    summary.textContent = proposal.summary;
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "应用";
    apply.setAttribute("aria-label", `应用 ${proposal.id}`);
    apply.addEventListener("click", withErrors(() => applyProposal(proposal.id)));
    const reject = document.createElement("button");
    reject.className = "secondary-button";
    reject.type = "button";
    reject.textContent = "拒绝";
    reject.setAttribute("aria-label", `拒绝 ${proposal.id}`);
    reject.addEventListener("click", withErrors(() => rejectProposal(proposal.id)));
    actions.append(apply, reject);
    item.append(id, summary, renderProposalSourceEvidence(proposal), renderProposalPreview(proposal), actions);
    return item;
  }, state.proposals.length === 0 ? "没有待审核提案。" : "没有匹配的待审提案。");
}

function proposalFilterQuery() {
  return els.proposalFilter.value.trim().toLocaleLowerCase();
}

function filteredProposals() {
  const query = proposalFilterQuery();
  return state.proposals.filter((proposal) => proposalMatchesFilter(proposal, query));
}

function proposalMatchesFilter(proposal, query) {
  return matchesListFilter(proposalFilterFields(proposal), query);
}

function proposalFilterFields(proposal) {
  const sourceEvidence = proposal.sourceEvidence;
  return [
    proposal.id,
    proposal.summary,
    proposal.sourceId,
    ...(proposal.changes || []).flatMap((change) => [
      change.type,
      change.path,
      change.title,
      change.content
    ]),
    sourceEvidence?.source.id,
    sourceEvidence?.source.title,
    sourceEvidence ? formatSourceKind(sourceEvidence.source.kind) : "",
    sourceEvidence?.source.kind,
    sourceEvidence?.source.originalRef,
    sourceEvidence ? proposalSourceTypeLabel(proposal.sourceEvidence.source) : "",
    sourceEvidence?.preview
  ];
}

function renderProposalSourceEvidence(proposal) {
  const section = document.createElement("section");
  section.className = "proposal-source";
  const header = document.createElement("div");
  header.className = "proposal-source-meta";
  const title = document.createElement("strong");
  title.textContent = "来源证据";
  header.append(title);
  section.append(header);

  const evidence = proposal.sourceEvidence;
  if (!evidence) {
    const missing = document.createElement("small");
    missing.textContent = `没有找到来源记录 ${proposal.sourceId}。`;
    section.append(missing);
    return section;
  }

  const sourceType = document.createElement("span");
  sourceType.className = "proposal-source-type";
  sourceType.textContent = proposalSourceTypeLabel(evidence.source);
  header.append(sourceType);

  const meta = document.createElement("small");
  meta.textContent = `${evidence.source.id} · ${formatSourceKind(evidence.source.kind)} · ${evidence.source.originalRef}`;
  const sourceTitle = document.createElement("small");
  sourceTitle.textContent = evidence.source.title;
  const actions = document.createElement("div");
  actions.className = "proposal-source-actions";
  const openSource = document.createElement("button");
  openSource.className = "secondary-button";
  openSource.type = "button";
  openSource.textContent = "打开来源";
  openSource.setAttribute("aria-label", `打开来源 ${evidence.source.title}`);
  openSource.addEventListener("click", withErrors(() => openProposalSource(evidence)));
  actions.append(openSource);
  const runId = proposalActRunId(evidence.source);
  if (runId) {
    const openRun = document.createElement("button");
    openRun.className = "secondary-button";
    openRun.type = "button";
    openRun.textContent = "打开执行记录";
    openRun.setAttribute("aria-label", `打开执行记录 ${runId}`);
    openRun.addEventListener("click", withErrors(() => openProposalActRun(runId)));
    actions.append(openRun);
  }
  const preview = document.createElement("pre");
  preview.className = "proposal-source-preview";
  preview.textContent = evidence.preview;
  section.append(meta, sourceTitle, actions, preview);
  return section;
}

function proposalSourceTypeLabel(source) {
  if (source.originalRef.startsWith("act:")) return "执行结果";
  if (source.originalRef.startsWith("query:")) return "查询结果";
  return "原始资料";
}

function proposalActRunId(source) {
  return source.originalRef.startsWith("act:") ? source.originalRef.slice("act:".length) : "";
}

async function openProposalSource(evidence) {
  await selectSource(evidence.source.id);
  setStatus(`已打开提案来源 ${evidence.source.title}。`);
}

async function openProposalActRun(runId) {
  await selectActRun(runId);
  setStatus(`已打开提案执行记录 ${runId}。`);
}

function renderProposalPreview(proposal) {
  const preview = document.createElement("details");
  preview.className = "proposal-preview";
  const header = document.createElement("summary");
  const count = proposal.changes.length;
  header.textContent = `预览 ${count} 个变更`;
  preview.append(header);
  for (const change of proposal.changes) {
    const section = document.createElement("section");
    const path = document.createElement("div");
    path.className = "proposal-change-path";
    path.textContent = `${change.title} · ${change.path}`;
    const editor = document.createElement("textarea");
    editor.className = "proposal-change-editor";
    editor.spellcheck = false;
    editor.value = change.content;
    const actions = document.createElement("div");
    actions.className = "proposal-change-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "保存编辑";
    save.addEventListener("click", withErrors(() => saveProposalChange(proposal.id, change.path, editor.value)));
    actions.append(save);
    section.append(path, editor, actions);
    preview.append(section);
  }
  return preview;
}

async function applyAll() {
  const data = await fetchJson("/api/review/apply", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), proposalId: "all" })
  });
  setStatus(`已应用 ${data.applied} 个提案。`);
  await refreshAll();
}

async function applyProposal(proposalId) {
  const data = await fetchJson("/api/review/apply", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), proposalId })
  });
  await refreshAll();
  await openAppliedProposalPage(data, proposalId);
}

async function applyFilteredProposals() {
  const proposals = filteredProposals();
  if (proposals.length === 0) {
    setStatus("没有匹配的待审提案。");
    return;
  }

  let firstApplied;
  for (const proposal of proposals) {
    const data = await fetchJson("/api/review/apply", {
      method: "POST",
      body: JSON.stringify({ vault: vault(), proposalId: proposal.id })
    });
    firstApplied ||= { data, proposalId: proposal.id };
  }

  await refreshAll();
  const openedPath = firstApplied ? await openAppliedProposalPage(firstApplied.data, firstApplied.proposalId) : "";
  if (openedPath) {
    setStatus(`已应用 ${proposals.length} 个筛选提案，并打开 ${openedPath}。`);
  } else {
    setStatus(`已应用 ${proposals.length} 个筛选提案。`);
  }
}

async function openAppliedProposalPage(data, proposalId) {
  const appliedPath = data.proposal?.changes?.[0]?.path;
  if (!appliedPath) {
    setStatus(`已应用 ${proposalId}。`);
    return "";
  }
  await selectPage(appliedPath);
  setStatus(`已应用并打开 ${appliedPath}。`);
  return appliedPath;
}

async function rejectProposal(proposalId) {
  await fetchJson("/api/review/reject", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), proposalId })
  });
  setStatus(`已拒绝 ${proposalId}。`);
  await loadProposals();
}

async function rejectFilteredProposals() {
  const proposals = filteredProposals();
  if (proposals.length === 0) {
    setStatus("没有匹配的待审提案。");
    return;
  }

  for (const proposal of proposals) {
    await fetchJson("/api/review/reject", {
      method: "POST",
      body: JSON.stringify({ vault: vault(), proposalId: proposal.id })
    });
  }
  setStatus(`已拒绝 ${proposals.length} 个筛选提案。`);
  await loadProposals();
  await loadVaultStatus();
}

async function saveProposalChange(proposalId, path, content) {
  await fetchJson("/api/review/update", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), proposalId, path, content })
  });
  setStatus(`已保存 ${path} 的编辑。`);
  await loadProposals();
}

async function queryVault() {
  const question = els.question.value.trim();
  const data = await fetchJson("/api/query", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), question })
  });
  renderQueryResult(data);
}

function renderQueryResult(data) {
  els.answer.innerHTML = "";
  const answer = document.createElement("p");
  answer.className = "query-answer";
  answer.textContent = data.answer;
  els.answer.append(answer);

  if (data.hits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "query-hit empty";
    empty.textContent = "没有匹配的 Wiki 页面。";
    els.answer.append(empty);
    return;
  }

  for (const hit of data.hits) {
    const item = document.createElement("article");
    item.className = "query-hit";
    const pageButton = document.createElement("button");
    pageButton.className = "query-hit-page";
    pageButton.type = "button";
    pageButton.textContent = `${hit.title} · ${hit.path}`;
    pageButton.setAttribute("aria-label", `打开查询页面 ${hit.title}`);
    pageButton.addEventListener("click", withErrors(() => openQueryHitPage(hit)));
    const snippet = document.createElement("small");
    snippet.textContent = hit.snippet;
    item.append(pageButton, snippet, renderQueryHitSources(hit));
    els.answer.append(item);
  }
}

async function openQueryHitPage(hit) {
  await selectPage(hit.path);
  setStatus(`已打开查询页面 ${hit.title}。`);
}

function renderQueryHitSources(hit) {
  const section = document.createElement("div");
  section.className = "query-hit-sources";
  const sources = hit.sources || [];
  if (sources.length === 0) {
    const empty = document.createElement("span");
    empty.className = "query-hit-source empty";
    empty.textContent = "来源：未关联";
    section.append(empty);
    return section;
  }
  for (const source of sources) {
    const sourceButton = document.createElement("button");
    sourceButton.className = "query-hit-source";
    sourceButton.type = "button";
    sourceButton.textContent = `来源 ${source.id} · ${source.title} · ${source.originalRef}`;
    sourceButton.setAttribute("aria-label", `打开查询来源 ${source.title}`);
    sourceButton.addEventListener("click", withErrors(() => openQueryHitSource(source)));
    section.append(sourceButton);
  }
  return section;
}

async function openQueryHitSource(source) {
  await selectSource(source.id);
  setStatus(`已打开查询来源 ${source.title}。`);
}

async function proposeQueryResult() {
  const question = els.question.value.trim();
  const data = await fetchJson("/api/query/propose", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), question })
  });
  setStatus(`${data.created ? "已创建查询结果提案" : "已复用查询结果提案"} ${data.proposal.id}。`);
  await Promise.all([loadProposals(), loadVaultStatus()]);
}

async function actVault() {
  await runAct({ runActions: false, propose: false });
}

async function runActAndPropose() {
  await runAct({ runActions: false, propose: true });
}

async function runActWithActions() {
  await runAct({ runActions: true, propose: false });
}

async function runAct({ runActions, propose }) {
  const task = els.task.value.trim();
  const data = await fetchJson("/api/act", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), task, runActions, propose })
  });
  els.actionOutput.textContent = data.output;
  renderExecutionActions(data.execution?.actions || []);
  if (propose) {
    const proposalId = data.proposal?.id || "";
    setStatus(`${data.proposalCreated ? "已创建执行结果提案" : "已复用执行结果提案"} ${proposalId}。`);
  }
  await refreshAll();
}

function renderExecutionActions(actions) {
  els.executionActions.innerHTML = "";
  if (actions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "execution-action empty";
    empty.textContent = "没有待执行的整理动作。";
    els.executionActions.append(empty);
    return;
  }

  const title = document.createElement("strong");
  title.textContent = "执行整理";
  els.executionActions.append(title);
  for (const action of actions) {
    const row = document.createElement("div");
    row.className = "execution-action";
    const detail = document.createElement("span");
    detail.textContent = `${action.label} · ${action.reason}`;
    const run = document.createElement("button");
    run.type = "button";
    run.textContent = "执行";
    run.setAttribute("aria-label", `执行整理 ${action.label}`);
    run.addEventListener("click", withErrors(() => runExecutionAction(action.command)));
    row.append(detail, run);
    els.executionActions.append(row);
  }
}

async function runExecutionAction(command) {
  const data = await fetchJson("/api/action/run", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), command })
  });
  setStatus(data.message);
  await refreshAll();
}

async function loadActRuns() {
  const data = await fetchJson(`/api/act/runs?vault=${encodeURIComponent(vault())}`);
  const visibleRunIds = new Set(data.runs.map((run) => run.id));
  if (!visibleRunIds.has(state.selectedRun)) {
    state.selectedRun = "";
    els.proposeActRun.disabled = true;
  }
  renderList(els.runList, data.runs, (run) => {
    const button = document.createElement("button");
    button.className = "run-button";
    button.type = "button";
    button.textContent = `${run.task} · ${formatActRunStatus(run.status)}`;
    button.title = `${run.id} · 证据 ${run.evidenceCount} · 原始来源 ${run.sourceHitCount} · 整理动作 ${run.actionCount}`;
    button.addEventListener("click", () => selectActRun(run.id));
    return button;
  }, "还没有执行记录。");
}

async function selectActRun(id) {
  state.selectedRun = id;
  els.proposeActRun.disabled = false;
  const data = await fetchJson(`/api/act/run?vault=${encodeURIComponent(vault())}&id=${encodeURIComponent(id)}`);
  els.runBody.textContent = data.run.output;
}

async function proposeSelectedActRun() {
  if (!state.selectedRun) {
    setStatus("先选择一条执行记录。");
    return;
  }
  const data = await fetchJson("/api/act/propose", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), id: state.selectedRun })
  });
  setStatus(`${data.created ? "已创建" : "已复用"}执行结果提案 ${data.proposal.id}。`);
  await refreshAll();
}

async function loadContextPack() {
  const query = els.task.value.trim();
  const data = await fetchJson("/api/context", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), query })
  });
  els.contextOutput.textContent = formatContextPack(data);
  setStatus("已生成上下文包。");
}

async function loadRules() {
  const data = await fetchJson(`/api/rules?vault=${encodeURIComponent(vault())}`);
  els.rulesBody.value = data.rules.body;
}

async function saveRules() {
  const data = await fetchJson("/api/rules", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), body: els.rulesBody.value })
  });
  els.rulesBody.value = data.rules.body;
  setStatus(`已保存知识库规则 ${data.rules.path}。`);
}

async function loadPages() {
  const data = await fetchJson(`/api/pages?vault=${encodeURIComponent(vault())}`);
  state.pages = data.pages;
  renderPages();
}

function renderPages() {
  const query = els.pageFilter.value.trim().toLocaleLowerCase();
  const pages = state.pages.filter((page) => matchesListFilter([
    page.title,
    page.path
  ], query));
  renderList(els.pageList, pages, (page) => {
    const button = document.createElement("button");
    button.className = "page-button";
    button.type = "button";
    button.textContent = page.title;
    button.addEventListener("click", () => selectPage(page.path));
    return button;
  }, state.pages.length === 0 ? "还没有 Wiki 页面。" : "没有匹配的 Wiki 页面。");
}

async function selectPage(path) {
  state.selectedPage = path;
  const data = await fetchJson(`/api/page?vault=${encodeURIComponent(vault())}&path=${encodeURIComponent(path)}`);
  els.pageBody.value = data.page.body;
}

async function savePage() {
  if (!state.selectedPage) throw new Error("请先选择一个 Wiki 页面。");
  const data = await fetchJson("/api/page", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), path: state.selectedPage, body: els.pageBody.value })
  });
  els.pageBody.value = data.page.body;
  setStatus(`已保存页面 ${data.page.path}。`);
  await Promise.all([loadPages(), runLint()]);
}

async function loadSources() {
  const data = await fetchJson(`/api/sources?vault=${encodeURIComponent(vault())}`);
  state.sources = data.sources;
  renderSources();
}

function renderSources() {
  const query = els.sourceFilter.value.trim().toLocaleLowerCase();
  const sources = state.sources.filter((source) => matchesListFilter([
    source.id,
    source.title,
    formatSourceKind(source.kind),
    source.kind,
    source.originalRef
  ], query));
  renderList(els.sourceList, sources, (source) => {
    const button = document.createElement("a");
    const label = document.createElement("span");
    button.className = "source-button";
    button.href = "#";
    button.setAttribute("role", "button");
    button.title = `${source.id}: ${source.originalRef}`;
    label.className = "source-button-label";
    label.textContent = `${source.title} · ${formatSourceKind(source.kind)}`;
    button.append(label);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectSource(source.id);
    });
    return button;
  }, state.sources.length === 0 ? "还没有原始来源。" : "没有匹配的来源。");
}

function matchesListFilter(fields, query) {
  if (!query) return true;
  return fields
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

async function selectSource(id) {
  state.selectedSource = id;
  const data = await fetchJson(`/api/source?vault=${encodeURIComponent(vault())}&id=${encodeURIComponent(id)}`);
  els.sourceBody.textContent = [
    `${data.source.id}: ${data.source.title}`,
    `类型：${formatSourceKind(data.source.kind)}`,
    `原始文件：${data.source.rawPath}`,
    `原始引用：${data.source.originalRef}`,
    "",
    data.body
  ].join("\n");
}

async function proposeSelectedSource() {
  if (!state.selectedSource) throw new Error("请先选择一个来源。");
  const data = await fetchJson("/api/source/propose", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), id: state.selectedSource })
  });
  setStatus(data.created
    ? `已创建来源提案 ${data.proposal.id}。`
    : `已复用待审核提案 ${data.proposal.id}。`);
  await loadProposals();
}

async function proposeUncoveredSources() {
  const data = await fetchJson("/api/sources/propose-uncovered", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  const created = data.results.filter((entry) => entry.created).length;
  const reused = data.results.length - created;
  setStatus(`已补全 ${data.results.length} 个未覆盖来源：${created} 新建，${reused} 复用，${data.skipped.length} 已覆盖跳过。`);
  await Promise.all([loadProposals(), runLint()]);
}

async function runLint() {
  const data = await fetchJson(`/api/lint?vault=${encodeURIComponent(vault())}`);
  renderList(els.lintList, data.issues, (issue) => {
    const lintIssue = formatLintIssue(issue);
    const item = document.createElement("article");
    item.className = "item issue";
    const title = document.createElement("strong");
    title.textContent = lintIssue.title;
    const detail = document.createElement("small");
    detail.textContent = lintIssue.detail;
    item.append(title, detail);
    return item;
  }, "没有健康检查问题。");
}

function formatLintIssue(issue) {
  const lintIssue = {
    title: lintIssueTitle(issue.code),
    detail: lintIssueDetail(issue)
  };
  return {
    title: issue.path ? `${issue.path}：${lintIssue.title}` : lintIssue.title,
    detail: lintIssue.detail
  };
}

function lintIssueTitle(code) {
  const titles = {
    missing_sources: "缺少来源",
    broken_wiki_link: "断开的 Wiki 链接",
    open_concept: "开放概念",
    pending_proposal: "待审提案",
    source_without_page: "未覆盖来源"
  };
  return titles[code] || code;
}

function lintIssueDetail(issue) {
  const sourceMatch = issue.message.match(/Source ([^ ]+) has no accepted wiki coverage\./);
  if (sourceMatch) return `来源 ${sourceMatch[1]} 还没有对应的已审核 Wiki 页面。`;

  const pendingProposalMatch = issue.message.match(/Proposal ([^ ]+) is pending review\./);
  if (pendingProposalMatch) return `提案 ${pendingProposalMatch[1]} 正在等待审核。`;

  const brokenLinkMatch = issue.message.match(/(.+) links to missing page "(.+)"\./);
  if (brokenLinkMatch) return `${brokenLinkMatch[1]} 链接到不存在的页面“${brokenLinkMatch[2]}”。`;

  const openConceptMatch = issue.message.match(/(.+) mentions open concept "(.+)"\./);
  if (openConceptMatch) return `${openConceptMatch[1]} 提到了尚未建页的概念“${openConceptMatch[2]}”。`;

  if (issue.code === "missing_sources" && issue.path) return `${issue.path} 没有关联来源。`;
  return issue.message;
}

async function loadGraphMap() {
  const data = await fetchJson(`/api/graph?vault=${encodeURIComponent(vault())}`);
  state.graph = data.graph;
  if (!state.graph.nodes.some((node) => node.id === state.selectedGraphNode)) {
    state.selectedGraphNode = "";
  }
  renderGraphMap();
  return data.graph;
}

async function exportGraph() {
  const data = await fetchJson(`/api/graph?vault=${encodeURIComponent(vault())}`);
  state.graph = data.graph;
  renderGraphMap();
  const lines = [
    `节点 ${data.graph.nodes.length} · 关系 ${data.graph.edges.length}`,
    "",
    ...data.graph.nodes.slice(0, 8).map((node) => `- ${formatNode(node)}`),
    data.graph.nodes.length > 8 ? `- 还有 ${data.graph.nodes.length - 8} 个节点` : ""
  ].filter(Boolean);
  els.graphOutput.textContent = lines.join("\n");
  setStatus("图谱已刷新。");
}

function filteredGraphNodes() {
  const query = els.graphSearch.value.trim().toLocaleLowerCase();
  const kind = els.graphKindFilter.value;
  return state.graph.nodes.filter((node) => {
    if (kind !== "all" && node.kind !== kind) return false;
    if (!query) return true;
    return [
      node.id,
      node.label,
      node.kind,
      node.path,
      node.sourceId
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
  });
}

function filteredGraphEdges(visibleIds) {
  const relation = els.graphRelationFilter.value;
  return state.graph.edges.filter((edge) => {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
    if (relation !== "all" && edge.relation !== relation) return false;
    return true;
  });
}

function graphNodesVisibleForEdges(nodes, edges) {
  if (els.graphRelationFilter.value === "all") return nodes;
  const edgeNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return nodes.filter((node) => edgeNodeIds.has(node.id));
}

function renderGraphMap() {
  els.graphMap.replaceChildren();
  els.graphMap.setAttribute("viewBox", "0 0 720 420");

  const filteredNodes = filteredGraphNodes();
  const filteredIds = new Set(filteredNodes.map((node) => node.id));
  const edges = filteredGraphEdges(filteredIds);
  const nodes = graphNodesVisibleForEdges(filteredNodes, edges);
  const visibleIds = new Set(nodes.map((node) => node.id));
  clearHiddenGraphSelection(visibleIds);
  const positions = layoutGraphNodes(nodes);
  const neighborhood = graphNeighborhoodForSelection(edges);

  if (nodes.length === 0) {
    const empty = svgElement("text", {
      x: "360",
      y: "210",
      class: "graph-empty",
      "text-anchor": "middle"
    });
    empty.textContent = state.graph.nodes.length === 0 ? "还没有图谱节点" : "没有匹配的图谱节点";
    els.graphMap.append(empty);
    updateGraphDetail(nodes, edges);
    return;
  }

  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const isPathEdge = state.highlightedPath.edgeKeys.has(graphPathEdgeKey(edge));
    const edgeClasses = ["graph-edge", edge.confidence.toLocaleLowerCase()];
    if (isPathEdge) edgeClasses.push("path");
    if (state.selectedGraphNode) {
      edgeClasses.push(edge.source === state.selectedGraphNode || edge.target === state.selectedGraphNode
        ? "related"
        : isPathEdge ? "path-related" : "dimmed");
    }
    const line = svgElement("line", {
      class: edgeClasses.join(" "),
      x1: String(source.x),
      y1: String(source.y),
      x2: String(target.x),
      y2: String(target.y)
    });
    const title = svgElement("title");
    title.textContent = `${formatGraphRelation(edge.relation)} · ${formatGraphConfidence(edge.confidence)}`;
    line.append(title);
    els.graphMap.append(line);
  }

  for (const node of nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const isPathNode = state.highlightedPath.nodeIds.has(node.id);
    const nodeClasses = ["graph-node", node.kind];
    if (isPathNode) nodeClasses.push("path");
    if (state.selectedGraphNode === node.id) {
      nodeClasses.push("selected");
    } else if (state.selectedGraphNode) {
      nodeClasses.push(neighborhood.relatedNodeIds.has(node.id) ? "related" : isPathNode ? "path-related" : "dimmed");
    }
    const group = svgElement("g", {
      class: nodeClasses.join(" "),
      role: "button",
      tabindex: "0",
      "aria-label": `选择 ${node.label}`
    });
    const circle = svgElement("circle", {
      cx: String(position.x),
      cy: String(position.y),
      r: node.kind === "page" ? "18" : node.kind === "source" ? "15" : "13"
    });
    const label = svgElement("text", {
      x: String(position.x),
      y: String(position.y + 33),
      "text-anchor": "middle"
    });
    label.textContent = shortGraphLabel(node.label);
    const title = svgElement("title");
    title.textContent = formatNode(node);
    group.append(circle, label, title);
    group.addEventListener("click", () => selectGraphNode(node.id));
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectGraphNode(node.id);
    });
    els.graphMap.append(group);
  }

  updateGraphDetail(nodes, edges);
}

function formatGraphOverview(nodes, edges) {
  const lines = [
    `显示 ${nodes.length} 个节点、${edges.length} 条关系。选择节点查看关系。`
  ];
  const centralNodes = centralGraphNodes(nodes, edges);
  if (centralNodes.length > 0) {
    lines.push(
      "",
      "中心节点",
      ...centralNodes.map((entry) => `- ${formatNode(entry.node)} · ${entry.degree} 条关系`)
    );
  }
  return lines.join("\n");
}

function renderGraphOverviewDetail(nodes, edges) {
  els.graphDetail.replaceChildren();
  const summary = document.createElement("p");
  summary.className = "graph-detail-summary";
  summary.textContent = `显示 ${nodes.length} 个节点、${edges.length} 条关系。选择节点查看关系。`;
  els.graphDetail.append(summary);

  const centralNodes = centralGraphNodes(nodes, edges);
  if (centralNodes.length === 0) return;

  const heading = document.createElement("strong");
  heading.className = "central-node-heading";
  heading.textContent = "中心节点";
  const list = document.createElement("div");
  list.className = "central-node-list";
  for (const entry of centralNodes) {
    const button = document.createElement("button");
    button.className = "central-node-button";
    button.type = "button";
    button.textContent = `${formatNode(entry.node)} · ${entry.degree} 条关系`;
    button.setAttribute("aria-label", `选择中心节点 ${entry.node.label}`);
    button.addEventListener("click", () => selectGraphNode(entry.node.id));
    list.append(button);
  }
  els.graphDetail.append(heading, list);
}

function centralGraphNodes(nodes, edges, limit = 3) {
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const degreeByNodeId = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (visibleNodeIds.has(edge.source)) {
      degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) || 0) + 1);
    }
    if (visibleNodeIds.has(edge.target)) {
      degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) || 0) + 1);
    }
  }
  return nodes
    .map((node) => ({ node, degree: degreeByNodeId.get(node.id) || 0 }))
    .filter((entry) => entry.degree > 0)
    .sort((left, right) => right.degree - left.degree || left.node.label.localeCompare(right.node.label))
    .slice(0, limit);
}

function clearHiddenGraphSelection(visibleIds) {
  if (!state.selectedGraphNode || visibleIds.has(state.selectedGraphNode)) return;
  const hiddenNode = state.graph.nodes.find((candidate) => candidate.id === state.selectedGraphNode);
  if (hiddenNode && els.explainQuery.value === hiddenNode.label) {
    els.explainQuery.value = "";
  }
  state.selectedGraphNode = "";
}

function graphNeighborhoodForSelection(edges) {
  const relatedNodeIds = new Set();
  if (!state.selectedGraphNode) return { relatedNodeIds };
  relatedNodeIds.add(state.selectedGraphNode);
  for (const edge of edges) {
    if (edge.source === state.selectedGraphNode || edge.target === state.selectedGraphNode) {
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
    }
  }
  return { relatedNodeIds };
}

function emptyGraphPathHighlight() {
  return {
    nodeIds: new Set(),
    edgeKeys: new Set()
  };
}

function graphPathHighlight(path) {
  return {
    nodeIds: new Set(path.nodes.map((node) => node.id)),
    edgeKeys: new Set(path.edges.map(graphPathEdgeKey))
  };
}

function graphPathEdgeKey(edge) {
  return [
    edge.source,
    edge.target,
    edge.relation,
    edge.confidence,
    edge.sourceId || ""
  ].join("\u001f");
}

function layoutGraphNodes(nodes) {
  const positions = new Map();
  if (nodes.length === 0) return positions;
  if (nodes.length === 1) {
    positions.set(nodes[0].id, { x: 360, y: 210 });
    return positions;
  }

  const ordered = [...nodes].sort((a, b) => {
    const kindOrder = { page: 0, concept: 1, source: 2 };
    const kindDelta = (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3);
    return kindDelta || a.label.localeCompare(b.label);
  });
  const radiusX = ordered.length > 8 ? 292 : 250;
  const radiusY = ordered.length > 8 ? 154 : 132;
  for (let index = 0; index < ordered.length; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / ordered.length;
    positions.set(ordered[index].id, {
      x: Math.round(360 + Math.cos(angle) * radiusX),
      y: Math.round(198 + Math.sin(angle) * radiusY)
    });
  }
  return positions;
}

function selectGraphNode(id) {
  state.selectedGraphNode = id;
  const node = state.graph.nodes.find((candidate) => candidate.id === id);
  if (node) {
    els.explainQuery.value = node.label;
  }
  renderGraphMap();
}

function renderSelectedGraphNodeDetail(node, relatedEdges, nodeById, relatedNodeIds) {
  els.graphDetail.replaceChildren();
  const title = document.createElement("strong");
  title.className = "graph-selected-node";
  title.textContent = formatNode(node);
  const summary = document.createElement("small");
  summary.className = "graph-detail-summary";
  summary.textContent = `一跳邻居 ${relatedNodeIds.size} 个 · 关系 ${relatedEdges.length} 条`;
  els.graphDetail.append(title, summary);

  if (relatedEdges.length === 0) return;

  const list = document.createElement("div");
  list.className = "graph-neighbor-list";
  for (const edge of relatedEdges) {
    const neighborId = edge.source === node.id ? edge.target : edge.source;
    const neighbor = nodeById.get(neighborId);
    const button = document.createElement("button");
    button.className = "graph-neighbor-button";
    button.type = "button";
    button.textContent = formatNeighborButtonLabel(edge, neighbor);
    button.title = formatEdge(edge, nodeById);
    button.setAttribute("aria-label", `选择相邻节点 ${neighbor ? neighbor.label : neighborId}`);
    button.addEventListener("click", () => selectGraphNode(neighborId));
    list.append(button);
  }
  els.graphDetail.append(list);
}

function formatNeighborButtonLabel(edge, neighbor) {
  if (!neighbor) return formatGraphRelation(edge.relation);
  return `${formatGraphRelation(edge.relation)} · ${formatNode(neighbor)}`;
}

function updateGraphDetail(visibleNodes, visibleEdges) {
  const node = state.graph.nodes.find((candidate) => candidate.id === state.selectedGraphNode);
  if (!node) {
    if (visibleNodes.length === 0) {
      els.graphDetail.textContent = "没有可显示的图谱节点。";
    } else {
      renderGraphOverviewDetail(visibleNodes, visibleEdges);
    }
    els.graphOpenSelected.disabled = true;
    els.graphSetPathFrom.disabled = true;
    els.graphSetPathTo.disabled = true;
    return;
  }

  const nodeById = new Map(state.graph.nodes.map((candidate) => [candidate.id, candidate]));
  const relatedEdges = state.graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const relatedNodeIds = new Set(relatedEdges.map((edge) => edge.source === node.id ? edge.target : edge.source));
  renderSelectedGraphNodeDetail(node, relatedEdges, nodeById, relatedNodeIds);
  els.graphOpenSelected.disabled = !node.path && !node.sourceId;
  els.graphSetPathFrom.disabled = false;
  els.graphSetPathTo.disabled = false;
}

async function openSelectedGraphNode() {
  const node = state.graph.nodes.find((candidate) => candidate.id === state.selectedGraphNode);
  if (!node) throw new Error("请先选择一个图谱节点。");
  if (node.path) {
    await selectPage(node.path);
    setStatus(`已打开图谱页面 ${node.label}。`);
    return;
  }
  if (node.sourceId) {
    await selectSource(node.sourceId);
    setStatus(`已打开图谱来源 ${node.label}。`);
    return;
  }
  setStatus("图谱节点没有可直接打开的页面或来源。");
}

function setSelectedGraphNodeAsPathEndpoint(endpoint) {
  const node = state.graph.nodes.find((candidate) => candidate.id === state.selectedGraphNode);
  if (!node) throw new Error("请先选择一个图谱节点。");
  if (endpoint === "from") {
    els.pathFrom.value = node.label;
    setStatus(`已将 ${node.label} 设为路径起点。`);
    return;
  }
  els.pathTo.value = node.label;
  setStatus(`已将 ${node.label} 设为路径终点。`);
}

function shortGraphLabel(label) {
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

async function writeReport() {
  const data = await fetchJson("/api/report", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  els.graphOutput.textContent = data.markdown;
  setStatus(`已写入 ${data.path}`);
}

async function writeGraphHtml() {
  const data = await fetchJson("/api/graph/html", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  els.graphHtmlLink.href = data.url;
  els.graphHtmlLink.hidden = false;
  els.graphOutput.textContent = [
    `已生成 HTML 图谱。`,
    `路径：${data.path}`,
    `节点 ${data.graph.nodes.length} · 关系 ${data.graph.edges.length}`
  ].join("\n");
  setStatus("已生成 HTML 图谱。");
}

async function proposeConcepts() {
  const data = await fetchJson("/api/concepts/propose", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  const concepts = data.created.map((record) => record.concept);
  const lines = [
    `已创建 ${data.created.length} 个开放概念提案。`,
    concepts.length ? `概念：${concepts.join("、")}` : "",
    data.skipped.length ? `已跳过：${data.skipped.join("、")}` : ""
  ].filter(Boolean);
  els.graphOutput.textContent = lines.join("\n");
  setStatus("已生成开放概念提案。");
  await loadProposals();
}

async function proposeLinks() {
  const data = await fetchJson("/api/links/propose", {
    method: "POST",
    body: JSON.stringify({ vault: vault() })
  });
  if (!data.proposal) {
    els.graphOutput.textContent = "没有缺失的 Wiki 链接。";
    setStatus("没有缺失的 Wiki 链接。");
    return;
  }
  const lines = [
    `${data.created ? "已创建补链提案" : "已复用补链提案"} ${data.proposal.id}。`,
    `页面：${data.suggestions.length}`,
    ...data.suggestions.map((suggestion) => `- ${suggestion.title}: ${suggestion.targets.map((target) => target.title).join("、")}`)
  ];
  els.graphOutput.textContent = lines.join("\n");
  setStatus(`${data.created ? "已创建补链提案" : "已复用补链提案"} ${data.proposal.id}。`);
  await loadProposals();
}

async function explainGraph() {
  const query = els.explainQuery.value.trim();
  const data = await fetchJson("/api/explain", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), query })
  });
  const nodes = new Map([[data.node.id, data.node], ...data.neighbors.map((node) => [node.id, node])]);
  els.graphOutput.textContent = [
    formatNode(data.node),
    "",
    ...data.edges.map((edge) => `- ${formatEdge(edge, nodes)}`)
  ].join("\n");
}

async function findGraphPath() {
  const from = els.pathFrom.value.trim();
  const to = els.pathTo.value.trim();
  state.highlightedPath = emptyGraphPathHighlight();
  renderGraphMap();
  const data = await fetchJson("/api/path", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), from, to })
  });
  state.highlightedPath = graphPathHighlight(data.path);
  els.graphOutput.textContent = formatPath(data.path.nodes, data.path.edges);
  renderGraphMap();
}

async function refreshAll() {
  await Promise.all([loadVaultStatus(), loadProposals(), loadPages(), loadSources(), loadActRuns(), runLint(), loadGraphMap()]);
}

function withErrors(fn) {
  return async (event) => {
    event.preventDefault();
    try {
      await fn();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
}

els.vaultForm.addEventListener("submit", withErrors(initVault));
els.ingestForm.addEventListener("submit", withErrors(ingestSource));
els.applyFiltered.addEventListener("click", withErrors(applyFilteredProposals));
els.rejectFiltered.addEventListener("click", withErrors(rejectFilteredProposals));
els.applyAll.addEventListener("click", withErrors(applyAll));
els.queryForm.addEventListener("submit", withErrors(queryVault));
els.proposeQuery.addEventListener("click", withErrors(proposeQueryResult));
els.actForm.addEventListener("submit", withErrors(actVault));
els.runActPropose.addEventListener("click", withErrors(runActAndPropose));
els.runActActions.addEventListener("click", withErrors(runActWithActions));
els.contextPack.addEventListener("click", withErrors(loadContextPack));
els.refreshRuns.addEventListener("click", withErrors(loadActRuns));
els.proposeActRun.addEventListener("click", withErrors(proposeSelectedActRun));
els.savePage.addEventListener("click", withErrors(savePage));
els.proposalFilter.addEventListener("input", renderProposals);
els.pageFilter.addEventListener("input", renderPages);
els.refreshPages.addEventListener("click", withErrors(loadPages));
els.proposeSource.addEventListener("click", withErrors(proposeSelectedSource));
els.proposeUncoveredSources.addEventListener("click", withErrors(proposeUncoveredSources));
els.sourceFilter.addEventListener("input", renderSources);
els.refreshSources.addEventListener("click", withErrors(loadSources));
els.saveRules.addEventListener("click", withErrors(saveRules));
els.refreshRules.addEventListener("click", withErrors(async () => {
  await loadRules();
  setStatus("已刷新知识库规则。");
}));
els.runLint.addEventListener("click", withErrors(runLint));
els.exportGraph.addEventListener("click", withErrors(exportGraph));
els.refreshGraphMap.addEventListener("click", withErrors(async () => {
  await loadGraphMap();
  setStatus("图谱已刷新。");
}));
els.graphSearch.addEventListener("input", renderGraphMap);
els.graphKindFilter.addEventListener("change", renderGraphMap);
els.graphRelationFilter.addEventListener("change", renderGraphMap);
els.graphOpenSelected.addEventListener("click", withErrors(openSelectedGraphNode));
els.graphSetPathFrom.addEventListener("click", withErrors(() => setSelectedGraphNodeAsPathEndpoint("from")));
els.graphSetPathTo.addEventListener("click", withErrors(() => setSelectedGraphNodeAsPathEndpoint("to")));
els.writeGraphHtml.addEventListener("click", withErrors(writeGraphHtml));
els.writeReport.addEventListener("click", withErrors(writeReport));
els.proposeConcepts.addEventListener("click", withErrors(proposeConcepts));
els.proposeLinks.addEventListener("click", withErrors(proposeLinks));
els.runExplain.addEventListener("click", withErrors(explainGraph));
els.runPath.addEventListener("click", withErrors(findGraphPath));

bootstrap().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));

async function bootstrap() {
  const health = await fetchJson("/api/health");
  if (!state.vault && health.defaultVault) {
    state.vault = health.defaultVault;
    els.vault.value = health.defaultVault;
    localStorage.setItem("notva:vault", health.defaultVault);
  }
  if (state.vault) {
    await Promise.all([refreshAll(), loadRules()]);
  }
}

function formatNode(node) {
  const detail = node.path || node.sourceId || node.id;
  return `${node.label} (${formatGraphKind(node.kind)}${detail ? ` · ${detail}` : ""})`;
}

function formatEdge(edge, nodes) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  return `${source ? formatNode(source) : edge.source} --${formatGraphRelation(edge.relation)}--> ${target ? formatNode(target) : edge.target} [${formatGraphConfidence(edge.confidence)}]`;
}

function formatPath(nodes, edges) {
  if (nodes.length === 0) return "没有路径。";
  const lines = [];
  for (let index = 0; index < edges.length; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const edge = edges[index];
    const forward = edge.source === from.id && edge.target === to.id;
    const relation = formatGraphRelation(edge.relation);
    lines.push(forward
      ? `${formatNode(from)} --${relation}--> ${formatNode(to)}`
      : `${formatNode(from)} <--${relation}-- ${formatNode(to)}`);
  }
  return lines.length ? lines.join("\n") : formatNode(nodes[0]);
}

function formatGraphKind(kind) {
  const labels = {
    page: "页面",
    source: "来源",
    concept: "概念",
    claim: "主张",
    citation: "引用"
  };
  return labels[kind] || kind;
}

function formatGraphRelation(relation) {
  const labels = {
    supports: "支持",
    links_to: "链接到",
    cites: "引用",
    mentions: "提及",
    evidenced_by: "由证据支持"
  };
  return labels[relation] || relation;
}

function formatGraphConfidence(confidence) {
  const labels = {
    EXTRACTED: "已提取",
    INFERRED: "推断",
    AMBIGUOUS: "有歧义"
  };
  return labels[confidence] || confidence;
}

function formatContextPack(pack) {
  const evidence = formatContextEvidence(pack.hits || []);
  const rawSourceEvidence = formatRawSourceHits(pack.sourceHits || []);
  const sources = formatContextSources(pack.sources || []);
  const neighborhoods = pack.graph.neighborhoods.length
    ? pack.graph.neighborhoods.map(formatContextNeighborhood).join("\n\n")
    : "没有可用的图谱邻居。";
  const actions = formatContextActions(pack.actions || []);
  const rules = pack.rules?.trim() || "没有找到知识库规则。";
  return [
    `查询：${pack.query}`,
    "",
    "已审核 Wiki 证据",
    evidence,
    "",
    "原始来源证据",
    rawSourceEvidence,
    "",
    "关联来源",
    sources,
    "",
    "图谱邻居",
    neighborhoods,
    "",
    "建议整理动作",
    actions,
    "",
    "知识库规则",
    rules,
    "",
    "执行指引",
    pack.instructions
  ].join("\n");
}

function formatContextEvidence(hits) {
  if (hits.length === 0) return "没有匹配的已审核 Wiki 证据。";
  return hits.map((hit, index) => [
    `${index + 1}. ${hit.title} (${hit.path})`,
    hit.snippet,
    formatContextEvidenceSources(hit.sources)
  ].join("\n")).join("\n\n");
}

function formatContextEvidenceSources(sources) {
  if (!sources || sources.length === 0) return "来源：无";
  return `来源：${sources.map((source) => `${source.id} (${source.originalRef})`).join(", ")}`;
}

function formatContextActions(actions) {
  if (actions.length === 0) return "没有需要立即运行的 Notva 整理命令。";
  return actions.map((action, index) => [
    `${index + 1}. ${action.label}`,
    `命令：${action.command}`,
    `原因：${action.reason}`
  ].join("\n")).join("\n\n");
}

function formatRawSourceHits(sourceHits) {
  if (sourceHits.length === 0) return "没有匹配的原始来源证据。";
  return sourceHits.map((hit, index) => [
    `${index + 1}. ${hit.source.id}: ${hit.source.title}`,
    `类型：${formatSourceKind(hit.source.kind)}`,
    `原始文件：${hit.source.rawPath}`,
    `原始引用：${hit.source.originalRef}`,
    hit.snippet
  ].join("\n")).join("\n\n");
}

function formatContextSources(sources) {
  if (sources.length === 0) return "没有关联的原始来源。";
  return sources.map((source, index) => [
    `${index + 1}. ${source.id}: ${source.title}`,
    `类型：${formatSourceKind(source.kind)}`,
    `原始文件：${source.rawPath}`,
    `原始引用：${source.originalRef}`
  ].join("\n")).join("\n\n");
}

function formatContextNeighborhood(neighborhood) {
  const nodes = new Map([[neighborhood.node.id, neighborhood.node], ...neighborhood.neighbors.map((node) => [node.id, node])]);
  const edges = neighborhood.edges.length
    ? neighborhood.edges.map((edge) => `- ${formatEdge(edge, nodes)}`).join("\n")
    : "- 没有直接关系。";
  return `${formatNode(neighborhood.node)}\n${edges}`;
}
