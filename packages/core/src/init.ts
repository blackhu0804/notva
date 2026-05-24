import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, fileExists, resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { InitVaultOptions, InitVaultResult, NotvaConfig } from "./types.js";

const DEFAULT_SCHEMA = `# Notva Wiki Maintenance Rules

- Preserve raw sources as the source of truth.
- Prefer reviewable proposals over silent wiki edits.
- Every wiki page should cite its source IDs.
- Mark uncertainty and conflicts instead of hiding them.
- Keep page titles short, searchable, and stable.
`;

export async function initVault(options: InitVaultOptions): Promise<InitVaultResult> {
  const paths = resolveVaultPaths(options.root);

  await Promise.all([
    ensureDir(paths.notva),
    ensureDir(paths.raw),
    ensureDir(paths.wiki),
    ensureDir(paths.schema),
    ensureDir(paths.index),
    ensureDir(paths.queue),
    ensureDir(paths.logs)
  ]);

  if (!(await fileExists(paths.config))) {
    const config: NotvaConfig = { version: 1, createdAt: new Date().toISOString() };
    await writeFile(paths.config, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  const schemaPath = join(paths.schema, "notva.md");
  if (!(await fileExists(schemaPath))) {
    await writeFile(schemaPath, DEFAULT_SCHEMA, "utf8");
  }

  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
  } finally {
    state.close();
  }

  return { paths };
}
