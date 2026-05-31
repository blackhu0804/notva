import {
  applyProposal,
  ingestSource,
  initVault,
  lintVault,
  listPendingProposals,
  listWikiPages,
  queryVault,
  readWikiPage
} from "@notva/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export interface CreateNotvaServerOptions {
  staticRoot?: string;
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
      await routeRequest(request, response, staticRoot);
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

async function routeRequest(request: IncomingMessage, response: ServerResponse, staticRoot: string): Promise<void> {
  const url = new URL(request.url ?? "/", "http://notva.local");
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, name: "Notva" });
    return;
  }

  if (method === "POST" && url.pathname === "/api/init") {
    const body = await readJson<{ vault: string }>(request);
    const result = await initVault({ root: requireVault(body.vault) });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/ingest") {
    const body = await readJson<{ vault: string; target: string; kind?: "file" | "url" | "text" }>(request);
    const result = await ingestSource({
      root: requireVault(body.vault),
      target: requireText(body.target, "target"),
      kind: body.kind
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/proposals") {
    const proposals = await listPendingProposals({ root: requireVault(url.searchParams.get("vault")) });
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

  if (method === "POST" && url.pathname === "/api/query") {
    const body = await readJson<{ vault: string; question: string }>(request);
    const result = await queryVault({
      root: requireVault(body.vault),
      question: requireText(body.question, "question")
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/lint") {
    const issues = await lintVault({ root: requireVault(url.searchParams.get("vault")) });
    sendJson(response, 200, { issues });
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

  if (method === "GET") {
    await serveStatic(response, staticRoot, url.pathname);
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
