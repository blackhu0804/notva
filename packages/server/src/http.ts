import {
  actVault,
  applyProposal,
  buildContextPack,
  explainGraphNode,
  exportGraphHtml,
  exportGraphJson,
  findGraphPath,
  generateGraphReport,
  getVaultStatus,
  ingestDirectory,
  ingestSource,
  initVault,
  lintVault,
  listActRuns,
  listPendingProposalDetails,
  listPendingProposals,
  listSources,
  listWikiPages,
  proposeActRun,
  proposeOpenConceptPages,
  proposeQueryResult,
  proposeSource,
  proposeUncoveredSources,
  proposeMissingWikiLinks,
  queryVault,
  rebuildGraph,
  rejectProposal,
  readActRun,
  readVaultRules,
  readSource,
  readWikiPage,
  runMaintenanceAction,
  updateProposalChange,
  writeVaultRules,
  writeWikiPage
} from "@notva/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export interface CreateNotvaServerOptions {
  staticRoot?: string;
  defaultVault?: string;
}

export interface ListenNotvaServerOptions extends CreateNotvaServerOptions {
  port: number;
  host?: string;
}

export interface RunningNotvaServer {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_STATIC_ROOT = fileURLToPath(new URL("../../web/static/", import.meta.url));

export function createNotvaServer(options: CreateNotvaServerOptions = {}): Server {
  const staticRoot = options.staticRoot ?? DEFAULT_STATIC_ROOT;
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, { staticRoot, defaultVault: options.defaultVault });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

export async function listenNotvaServer(options: ListenNotvaServerOptions): Promise<RunningNotvaServer> {
  const host = options.host ?? "127.0.0.1";
  const server = createNotvaServer(options);
  await new Promise<void>((resolve) => {
    server.listen(options.port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Notva server did not expose a TCP address.");
  }
  return {
    server,
    url: `http://${host}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: { staticRoot: string; defaultVault?: string }
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://notva.local");
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, name: "Notva", defaultVault: options.defaultVault ?? "" });
    return;
  }

  if (method === "GET" && url.pathname === "/api/status") {
    const status = await getVaultStatus({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { status });
    return;
  }

  if (method === "POST" && url.pathname === "/api/init") {
    const body = await readJson<{ vault: string }>(request);
    const result = await initVault({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/ingest") {
    const body = await readJson<{ vault: string; target: string; kind?: "file" | "url" | "text" | "directory" }>(request);
    if (body.kind === "directory") {
      const result = await ingestDirectory({
        root: requireVault(body.vault),
        target: requireText(body.target, "target"),
        kind: "directory"
      });
      sendJson(response, 200, result);
      return;
    }
    const result = await ingestSource({
      root: requireVault(body.vault),
      target: requireText(body.target, "target"),
      kind: body.kind
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/proposals") {
    const proposals = await listPendingProposalDetails({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { proposals });
    return;
  }

  if (method === "POST" && url.pathname === "/api/review/apply") {
    const body = await readJson<{ vault: string; proposalId: string }>(request);
    const root = requireVault(body.vault);
    if (body.proposalId === "all") {
      const proposals = await listPendingProposals({ root });
      for (const proposal of proposals) {
        await applyProposal({ root, proposalId: proposal.id });
      }
      sendJson(response, 200, { applied: proposals.length });
      return;
    }
    const proposal = await applyProposal({ root, proposalId: requireText(body.proposalId, "proposalId") });
    sendJson(response, 200, { applied: 1, proposal });
    return;
  }

  if (method === "POST" && url.pathname === "/api/review/reject") {
    const body = await readJson<{ vault: string; proposalId: string }>(request);
    const proposal = await rejectProposal({
      root: requireVault(body.vault),
      proposalId: requireText(body.proposalId, "proposalId")
    });
    sendJson(response, 200, { rejected: 1, proposal });
    return;
  }

  if (method === "POST" && url.pathname === "/api/review/update") {
    const body = await readJson<{ vault: string; proposalId: string; path: string; content: string }>(request);
    const proposal = await updateProposalChange({
      root: requireVault(body.vault),
      proposalId: requireText(body.proposalId, "proposalId"),
      path: requireText(body.path, "path"),
      content: requireText(body.content, "content")
    });
    sendJson(response, 200, { proposal });
    return;
  }

  if (method === "POST" && url.pathname === "/api/query") {
    const body = await readJson<{ vault: string; question: string }>(request);
    const result = await queryVault({
      root: requireVault(body.vault),
      question: requireText(body.question, "question")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/query/propose") {
    const body = await readJson<{ vault: string; question: string }>(request);
    const result = await proposeQueryResult({
      root: requireVault(body.vault),
      question: requireText(body.question, "question")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/context") {
    const body = await readJson<{ vault: string; query: string }>(request);
    const result = await buildContextPack({
      root: requireVault(body.vault),
      query: requireText(body.query, "query")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/rules") {
    const rules = await readVaultRules({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { rules });
    return;
  }

  if (method === "POST" && url.pathname === "/api/rules") {
    const body = await readJson<{ vault: string; path?: string; body: string }>(request);
    const rules = await writeVaultRules({
      root: requireVault(body.vault),
      path: typeof body.path === "string" && body.path.trim() ? body.path : undefined,
      body: requireText(body.body, "body")
    });
    sendJson(response, 200, { rules });
    return;
  }

  if (method === "POST" && url.pathname === "/api/act") {
    const body = await readJson<{ vault: string; task: string; runActions?: boolean; propose?: boolean }>(request);
    const result = await actVault({
      root: requireVault(body.vault),
      task: requireText(body.task, "task"),
      runActions: body.runActions === true
    });
    if (body.propose === true) {
      const proposed = await proposeActRun({
        root: requireVault(body.vault),
        id: result.run.id
      });
      sendJson(response, 200, {
        ...result,
        proposal: proposed.proposal,
        proposalSource: proposed.source,
        proposalCreated: proposed.created
      });
      return;
    }
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/act/runs") {
    const runs = await listActRuns({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { runs });
    return;
  }

  if (method === "GET" && url.pathname === "/api/act/run") {
    const run = await readActRun({
      root: requireVault(url.searchParams.get("vault")),
      id: requireText(url.searchParams.get("id"), "id")
    });
    sendJson(response, 200, { run });
    return;
  }

  if (method === "POST" && url.pathname === "/api/act/propose") {
    const body = await readJson<{ vault: string; id: string }>(request);
    const result = await proposeActRun({
      root: requireVault(body.vault),
      id: requireText(body.id, "id")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/action/run") {
    const body = await readJson<{ vault: string; command: string }>(request);
    const result = await runMaintenanceAction({
      root: requireVault(body.vault),
      command: requireText(body.command, "command")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/sources") {
    const sources = await listSources({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { sources });
    return;
  }

  if (method === "POST" && url.pathname === "/api/sources/propose-uncovered") {
    const body = await readJson<{ vault: string }>(request);
    const result = await proposeUncoveredSources({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/source") {
    const source = await readSource({
      root: requireVault(url.searchParams.get("vault")),
      id: requireText(url.searchParams.get("id"), "id")
    });
    sendJson(response, 200, source);
    return;
  }

  if (method === "POST" && url.pathname === "/api/source/propose") {
    const body = await readJson<{ vault: string; id: string }>(request);
    const result = await proposeSource({
      root: requireVault(body.vault),
      id: requireText(body.id, "id")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/lint") {
    const issues = await lintVault({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { issues });
    return;
  }

  if (method === "GET" && url.pathname === "/api/graph") {
    const root = requireVault(url.searchParams.get("vault"));
    await rebuildGraph({ root });
    const graph = await exportGraphJson({ root });
    sendJson(response, 200, { graph });
    return;
  }

  if (method === "GET" && url.pathname === "/api/graph/html") {
    const result = await exportGraphHtml({ root: requireVault(url.searchParams.get("vault")) });
    sendHtml(response, 200, result.html);
    return;
  }

  if (method === "POST" && url.pathname === "/api/graph/html") {
    const body = await readJson<{ vault: string }>(request);
    const root = requireVault(body.vault);
    const result = await exportGraphHtml({ root });
    sendJson(response, 200, {
      path: result.path,
      url: `/api/graph/html?vault=${encodeURIComponent(root)}`,
      graph: result.graph
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/explain") {
    const body = await readJson<{ vault: string; query: string }>(request);
    const root = requireVault(body.vault);
    await rebuildGraph({ root });
    const explanation = await explainGraphNode({
      root,
      query: requireText(body.query, "query")
    });
    sendJson(response, 200, explanation);
    return;
  }

  if (method === "POST" && url.pathname === "/api/path") {
    const body = await readJson<{ vault: string; from: string; to: string }>(request);
    const root = requireVault(body.vault);
    await rebuildGraph({ root });
    const path = await findGraphPath({
      root,
      from: requireText(body.from, "from"),
      to: requireText(body.to, "to")
    });
    sendJson(response, 200, { path });
    return;
  }

  if (method === "POST" && url.pathname === "/api/report") {
    const body = await readJson<{ vault: string }>(request);
    const result = await generateGraphReport({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/concepts/propose") {
    const body = await readJson<{ vault: string }>(request);
    const result = await proposeOpenConceptPages({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/links/propose") {
    const body = await readJson<{ vault: string }>(request);
    const result = await proposeMissingWikiLinks({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/pages") {
    const pages = await listWikiPages({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { pages });
    return;
  }

  if (method === "GET" && url.pathname === "/api/page") {
    const page = await readWikiPage({
      root: requireVault(url.searchParams.get("vault")),
      path: requireText(url.searchParams.get("path"), "path")
    });
    sendJson(response, 200, { page });
    return;
  }

  if (method === "POST" && url.pathname === "/api/page") {
    const body = await readJson<{ vault: string; path: string; body: string }>(request);
    const page = await writeWikiPage({
      root: requireVault(body.vault),
      path: requireText(body.path, "path"),
      body: requireText(body.body, "body")
    });
    sendJson(response, 200, { page });
    return;
  }

  if (method === "GET") {
    await serveStatic(response, options.staticRoot, url.pathname);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(text) as T;
}

function requireVault(value: string | null | undefined): string {
  return requireText(value, "vault");
}

function requireText(value: string | null | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

async function serveStatic(response: ServerResponse, staticRoot: string, pathname: string): Promise<void> {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const safePath = safeRelativePath(relativePath);
  try {
    const bytes = await readFile(join(staticRoot, safePath));
    response.writeHead(200, { "Content-Type": contentType(safePath) });
    response.end(bytes);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

function safeRelativePath(path: string): string {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`Static path must be relative: ${path}`);
  }
  return normalized;
}

function contentType(path: string): string {
  const ext = extname(path);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
