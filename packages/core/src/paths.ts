import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { VaultPaths } from "./types.js";

export function defaultVaultRoot(): string {
  return process.env.NOTVA_VAULT ?? join(process.env.NOTVA_HOME ?? homedir(), "Notva");
}

export function resolveVaultPaths(root: string): VaultPaths {
  const notva = join(root, ".notva");
  return {
    root,
    notva,
    raw: join(root, "raw"),
    wiki: join(root, "wiki"),
    schema: join(root, "schema"),
    index: join(root, "index"),
    queue: join(notva, "queue"),
    logs: join(notva, "logs"),
    stateDb: join(notva, "state.db"),
    config: join(notva, "config.json")
  };
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortId(input: string | Buffer): string {
  return sha256(input).slice(0, 12);
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

export function titleFromPath(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled";
}
