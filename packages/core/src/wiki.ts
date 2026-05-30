import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { PageRecord } from "./types.js";

export interface ListWikiPagesOptions {
  root: string;
}

export interface ReadWikiPageOptions {
  root: string;
  path: string;
}

export async function listWikiPages(options: ListWikiPagesOptions): Promise<PageRecord[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return state.listPages();
  } finally {
    state.close();
  }
}

export async function readWikiPage(options: ReadWikiPageOptions): Promise<PageRecord> {
  const paths = resolveVaultPaths(options.root);
  const safePath = safeRelativePath(options.path);
  const body = await readFile(join(paths.wiki, safePath), "utf8");
  return {
    path: safePath,
    title: extractTitle(body, safePath),
    body,
    updatedAt: new Date().toISOString()
  };
}

function safeRelativePath(path: string): string {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`Wiki page path must be relative: ${path}`);
  }
  return normalized;
}

function extractTitle(body: string, fallback: string): string {
  const title = body.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return title ? title.replace(/^#\s+/, "").trim() : fallback.replace(/\.md$/, "");
}
