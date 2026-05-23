#!/usr/bin/env node

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  if (!command || command === "help" || command === "--help") {
    console.log("Usage: notva <init|ingest|review|query|lint|reindex> [args]");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
