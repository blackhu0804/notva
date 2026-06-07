const state = {
  vault: localStorage.getItem("notva:vault") || "",
  selectedPage: ""
};

const els = {
  vaultForm: document.querySelector("#vault-form"),
  vault: document.querySelector("#vault"),
  status: document.querySelector("#status"),
  ingestForm: document.querySelector("#ingest-form"),
  sourceKind: document.querySelector("#source-kind"),
  sourceTarget: document.querySelector("#source-target"),
  proposalList: document.querySelector("#proposal-list"),
  applyAll: document.querySelector("#apply-all"),
  queryForm: document.querySelector("#query-form"),
  question: document.querySelector("#question"),
  answer: document.querySelector("#answer"),
  actForm: document.querySelector("#act-form"),
  task: document.querySelector("#task"),
  actionOutput: document.querySelector("#action-output"),
  pageList: document.querySelector("#page-list"),
  pageBody: document.querySelector("#page-body"),
  refreshPages: document.querySelector("#refresh-pages"),
  runLint: document.querySelector("#run-lint"),
  lintList: document.querySelector("#lint-list")
};

els.vault.value = state.vault;

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
}

async function ingestSource() {
  const kind = els.sourceKind.value;
  const target = els.sourceTarget.value.trim();
  await fetchJson("/api/ingest", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), kind, target })
  });
  els.sourceTarget.value = "";
  setStatus("已创建待审核 proposal。");
  await loadProposals();
}

async function loadProposals() {
  const data = await fetchJson(`/api/proposals?vault=${encodeURIComponent(vault())}`);
  renderList(els.proposalList, data.proposals, (proposal) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `<strong>${proposal.id}</strong><small>${proposal.summary}</small>`;
    return item;
  }, "没有待审核 proposal。");
}

async function applyAll() {
  const data = await fetchJson("/api/review/apply", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), proposalId: "all" })
  });
  setStatus(`已应用 ${data.applied} 个 proposal。`);
  await refreshAll();
}

async function queryVault() {
  const question = els.question.value.trim();
  const data = await fetchJson("/api/query", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), question })
  });
  const hits = data.hits.map((hit) => `- ${hit.title}: ${hit.snippet}`).join("\n");
  els.answer.textContent = `${data.answer}\n${hits}`.trim();
}

async function actVault() {
  const task = els.task.value.trim();
  const data = await fetchJson("/api/act", {
    method: "POST",
    body: JSON.stringify({ vault: vault(), task })
  });
  els.actionOutput.textContent = data.output;
}

async function loadPages() {
  const data = await fetchJson(`/api/pages?vault=${encodeURIComponent(vault())}`);
  renderList(els.pageList, data.pages, (page) => {
    const button = document.createElement("button");
    button.className = "page-button";
    button.type = "button";
    button.textContent = page.title;
    button.addEventListener("click", () => selectPage(page.path));
    return button;
  }, "还没有 Wiki 页面。");
}

async function selectPage(path) {
  state.selectedPage = path;
  const data = await fetchJson(`/api/page?vault=${encodeURIComponent(vault())}&path=${encodeURIComponent(path)}`);
  els.pageBody.textContent = data.page.body;
}

async function runLint() {
  const data = await fetchJson(`/api/lint?vault=${encodeURIComponent(vault())}`);
  renderList(els.lintList, data.issues, (issue) => {
    const item = document.createElement("article");
    item.className = "item issue";
    item.innerHTML = `<strong>${issue.code}</strong><small>${issue.message}</small>`;
    return item;
  }, "没有健康检查问题。");
}

async function refreshAll() {
  await Promise.all([loadProposals(), loadPages(), runLint()]);
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
els.applyAll.addEventListener("click", withErrors(applyAll));
els.queryForm.addEventListener("submit", withErrors(queryVault));
els.actForm.addEventListener("submit", withErrors(actVault));
els.refreshPages.addEventListener("click", withErrors(loadPages));
els.runLint.addEventListener("click", withErrors(runLint));

bootstrap().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));

async function bootstrap() {
  const health = await fetchJson("/api/health");
  if (!state.vault && health.defaultVault) {
    state.vault = health.defaultVault;
    els.vault.value = health.defaultVault;
    localStorage.setItem("notva:vault", health.defaultVault);
  }
  if (state.vault) {
    await refreshAll();
  }
}
