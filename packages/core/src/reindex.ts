import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { rebuildGraph } from "./graph.js";
import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";

export interface ReindexVaultOptions {
  root: string;
}

export async function reindexVault(options: ReindexVaultOptions): Promise<number> {
  const paths = resolveVaultPaths(options.root);
  const files = await listMarkdownFiles(paths.wiki);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    for (const file of files) {
      const body = await readFile(file, "utf8");
      state.upsertPage({
        path: relative(paths.wiki, file),
        title: extractTitle(body, relative(paths.wiki, file)),
        body,
        updatedAt: new Date().toISOString()
      });
    }
  } finally {
    state.close();
  }
  await rebuildGraph({ root: options.root });
  return files.length;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractTitle(body: string, fallback: string): string {
  const title = body.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return title ? title.replace(/^#\s+/, "").trim() : fallback.replace(/\.md$/, "");
}
