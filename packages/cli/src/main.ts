#!/usr/bin/env node

import {
  applyProposal,
  ingestSource,
  initVault,
  lintVault,
  listPendingProposals,
  queryVault,
  reindexVault
} from "@notva/core";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "init") {
    const root = args.positional[0] ?? process.cwd();
    await initVault({ root });
    console.log(`Initialized Notva vault at ${root}`);
    return;
  }

  const root = String(args.flags.get("vault") ?? process.cwd());

  if (command === "ingest") {
    const text = args.flags.get("text");
    const target = text === true ? args.positional.join(" ") : args.positional[0];
    if (!target) throw new Error("Usage: notva ingest <file|url> [--vault path] or notva ingest --text \"content\"");
    const result = await ingestSource({ root, target, kind: text === true ? "text" : undefined });
    console.log(`Created proposal ${result.proposal.id} from source ${result.source.id}`);
    return;
  }

  if (command === "review") {
    const apply = args.flags.get("apply");
    const pending = await listPendingProposals({ root });
    if (apply === "all") {
      for (const proposal of pending) {
        await applyProposal({ root, proposalId: proposal.id });
      }
      console.log(`Applied ${pending.length} proposal(s).`);
      return;
    }
    if (typeof apply === "string") {
      await applyProposal({ root, proposalId: apply });
      console.log(`Applied proposal ${apply}.`);
      return;
    }
    if (pending.length === 0) {
      console.log("No pending proposals.");
      return;
    }
    console.log(`${pending.length} pending proposal(s):\n${pending.map((proposal) => `- ${proposal.id}: ${proposal.summary}`).join("\n")}`);
    return;
  }

  if (command === "query") {
    const question = args.positional.join(" ");
    if (!question) throw new Error("Usage: notva query \"question\" [--vault path]");
    const result = await queryVault({ root, question });
    console.log(`${result.answer}\n${result.hits.map((hit) => `- ${hit.title}: ${hit.snippet}`).join("\n")}`.trim());
    return;
  }

  if (command === "lint") {
    const issues = await lintVault({ root });
    if (issues.length === 0) {
      console.log("No lint issues.");
      return;
    }
    console.log(issues.map((issue) => `${issue.code}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`).join("\n"));
    return;
  }

  if (command === "reindex") {
    const count = await reindexVault({ root });
    console.log(`Reindexed ${count} wiki page(s).`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp(): void {
  console.log(`Usage: notva <command> [args]

Commands:
  init [path]
  ingest <file|url> [--vault path]
  ingest --text "content" [--vault path]
  review [--vault path] [--apply all|proposal-id]
  query "question" [--vault path]
  lint [--vault path]
  reindex [--vault path]`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
