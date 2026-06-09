import { resolveVaultPaths } from "./paths.js";
import { NotvaState } from "./state.js";
import type { LintIssue } from "./types.js";

export interface LintVaultOptions {
  root: string;
}

export async function lintVault(options: LintVaultOptions): Promise<LintIssue[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const pages = state.listPages();
    const issues: LintIssue[] = [];
    const pageTitles = new Set(pages.map((page) => page.title.toLowerCase()));
    const pageSlugs = new Set(pages.map((page) => page.path.replace(/\.md$/, "").toLowerCase()));

    for (const page of pages) {
      if (!/sources:\s*\n\s*-\s+/m.test(page.body)) {
        issues.push({ code: "missing_sources", path: page.path, message: `${page.path} has no source references.` });
      }
      for (const link of extractWikiLinks(page.body)) {
        const normalized = link.toLowerCase();
        if (!pageTitles.has(normalized) && !pageSlugs.has(normalized.replace(/\s+/g, "-"))) {
          issues.push({ code: "broken_wiki_link", path: page.path, message: `${page.path} links to missing page "${link}".` });
          issues.push({ code: "open_concept", path: page.path, message: `${page.path} mentions open concept "${link}".` });
        }
      }
    }

    for (const proposal of state.listPendingProposals()) {
      issues.push({ code: "pending_proposal", message: `Proposal ${proposal.id} is pending review.` });
    }

    for (const source of state.listSources()) {
      if (!pages.some((page) => page.body.includes(source.id))) {
        issues.push({ code: "source_without_page", message: `Source ${source.id} has no accepted wiki coverage.` });
      }
    }

    return issues;
  } finally {
    state.close();
  }
}

function extractWikiLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
}
