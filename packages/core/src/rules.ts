import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { ensureDir, resolveVaultPaths } from "./paths.js";

const DEFAULT_RULE_PATH = "notva.md";

export interface ReadVaultRulesOptions {
  root: string;
  path?: string;
}

export interface WriteVaultRulesOptions extends ReadVaultRulesOptions {
  body: string;
}

export interface VaultRulesResult {
  path: string;
  body: string;
  absolutePath: string;
}

export async function readVaultRules(options: ReadVaultRulesOptions): Promise<VaultRulesResult> {
  const paths = resolveVaultPaths(options.root);
  const rulePath = safeRulePath(options.path);
  const absolutePath = join(paths.schema, rulePath);
  return {
    path: rulePath,
    body: await readFile(absolutePath, "utf8"),
    absolutePath
  };
}

export async function writeVaultRules(options: WriteVaultRulesOptions): Promise<VaultRulesResult> {
  const paths = resolveVaultPaths(options.root);
  const rulePath = safeRulePath(options.path);
  const absolutePath = join(paths.schema, rulePath);
  await ensureDir(paths.schema);
  await writeFile(absolutePath, ensureTrailingNewline(options.body), "utf8");
  return readVaultRules({ root: options.root, path: rulePath });
}

export async function readAllVaultRules(options: { root: string }): Promise<string> {
  const paths = resolveVaultPaths(options.root);
  let entries: string[];
  try {
    entries = await readdir(paths.schema);
  } catch {
    return "";
  }

  const markdownFiles = entries
    .filter((entry) => extname(entry).toLocaleLowerCase() === ".md")
    .sort((a, b) => a.localeCompare(b));
  const bodies = await Promise.all(markdownFiles.map(async (entry) => {
    const rulePath = safeRulePath(entry);
    const body = await readFile(join(paths.schema, rulePath), "utf8");
    return body.trim();
  }));
  return bodies.filter(Boolean).join("\n\n");
}

function safeRulePath(path = DEFAULT_RULE_PATH): string {
  const normalized = normalize(path);
  if (
    isAbsolute(path) ||
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    extname(normalized).toLocaleLowerCase() !== ".md"
  ) {
    throw new Error("Rule path must stay inside schema/");
  }

  const relativePath = relative(".", normalized);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Rule path must stay inside schema/");
  }
  return normalized;
}

function ensureTrailingNewline(body: string): string {
  return body.endsWith("\n") ? body : `${body}\n`;
}
