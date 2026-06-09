import { proposeOpenConceptPages } from "./concepts.js";
import { proposeMissingWikiLinks } from "./links.js";
import { listPendingProposals } from "./review.js";
import { proposeUncoveredSources } from "./source.js";
import type { MaintenanceActionResult } from "./types.js";

export interface RunMaintenanceActionOptions {
  root: string;
  command: string;
}

export async function runMaintenanceAction(options: RunMaintenanceActionOptions): Promise<MaintenanceActionResult> {
  const tokens = commandTokensWithoutVault(options.command);
  const key = tokens.join(" ");

  if (key === "notva source propose --uncovered") {
    const result = await proposeUncoveredSources({ root: options.root });
    const created = result.results.filter((entry) => entry.created).length;
    const reused = result.results.length - created;
    return {
      command: options.command,
      kind: "source_propose_uncovered",
      changed: created > 0,
      message: `Proposed ${result.results.length} uncovered source(s): ${created} created, ${reused} reused pending, ${result.skipped.length} skipped covered.`,
      data: result
    };
  }

  if (key === "notva links propose") {
    const result = await proposeMissingWikiLinks({ root: options.root });
    return {
      command: options.command,
      kind: "links_propose",
      changed: result.created,
      message: result.proposal
        ? `${result.created ? "Created" : "Reused pending"} missing-link proposal ${result.proposal.id} for ${result.suggestions.length} page(s).`
        : "No missing wiki links to propose.",
      data: result
    };
  }

  if (key === "notva concepts propose") {
    const result = await proposeOpenConceptPages({ root: options.root });
    const concepts = result.created.map((record) => record.concept).join(", ");
    return {
      command: options.command,
      kind: "concepts_propose",
      changed: result.created.length > 0,
      message: [
        `Created ${result.created.length} open concept proposal(s).`,
        concepts ? `Concepts: ${concepts}.` : "",
        result.skipped.length > 0 ? `Skipped existing: ${result.skipped.join(", ")}.` : ""
      ].filter(Boolean).join(" "),
      data: result
    };
  }

  if (key === "notva review") {
    const proposals = await listPendingProposals({ root: options.root });
    return {
      command: options.command,
      kind: "review",
      changed: false,
      message: `${proposals.length} pending proposal(s) available for review.`,
      data: { proposals }
    };
  }

  throw new Error(`Unsupported Notva maintenance action: ${options.command}`);
}

function commandTokensWithoutVault(command: string): string[] {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error("Unsupported Notva maintenance action: ");

  const vaultIndex = tokens.indexOf("--vault");
  if (vaultIndex === -1) return tokens;
  if (vaultIndex !== tokens.length - 2) {
    throw new Error(`Unsupported Notva maintenance action: ${command}`);
  }
  return tokens.slice(0, vaultIndex);
}
