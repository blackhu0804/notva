#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  actVault,
  applyProposal,
  buildContextPack,
  defaultVaultRoot,
  explainGraphNode,
  exportGraphHtml,
  exportGraphJson,
  fileExists,
  findGraphPath,
  generateGraphReport,
  getVaultStatus,
  ingestDirectory,
  ingestSource,
  initVault,
  installAgentInstructions,
  lintVault,
  listActRuns,
  listWikiPages,
  listPendingProposalDetails,
  listSources,
  proposeActRun,
  proposeOpenConceptPages,
  proposeQueryResult,
  proposeSource,
  proposeUncoveredSources,
  proposeMissingWikiLinks,
  queryVault,
  readActRun,
  readVaultRules,
  readSource,
  readWikiPage,
  rebuildGraph,
  rejectProposal,
  reindexVault,
  renderContextPackMarkdown,
  resolveVaultPaths,
  runMaintenanceAction,
  updateProposalChange,
  writeVaultRules,
  writeWikiPage,
  type GraphEdgeRecord,
  type GraphNodeRecord
} from "@notva/core";
import { listenNotvaServer } from "@notva/server";

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
    const root = args.positional[0] ?? defaultVaultRoot();
    await initVault({ root });
    console.log(`Initialized Notva vault at ${root}`);
    return;
  }

  const root = String(args.flags.get("vault") ?? defaultVaultRoot());

  if (command === "ingest") {
    const text = args.flags.get("text");
    const target = typeof text === "string" ? text : text === true ? args.positional.join(" ") : args.positional[0];
    if (!target) throw new Error("Usage: notva ingest <file|directory|url> [--vault path] or notva ingest --text \"content\"");
    if (!text && await isDirectory(target)) {
      const result = await ingestDirectory({ root, target });
      console.log(`Created ${result.results.length} proposal(s) from directory ${target}. Skipped ${result.skipped.length} item(s).`);
      return;
    }
    const result = await ingestSource({ root, target, kind: text ? "text" : undefined });
    console.log(`Created proposal ${result.proposal.id} from source ${result.source.id}`);
    return;
  }

  if (command === "review") {
    const apply = args.flags.get("apply");
    const reject = args.flags.get("reject");
    const show = args.flags.get("show");
    const update = args.flags.get("update");
    const changePath = args.flags.get("path");
    const contentFile = args.flags.get("content-file");
    const contentFlag = args.flags.get("content");
    const pending = await listPendingProposalDetails({ root });
    if (typeof update === "string") {
      if (typeof changePath !== "string") throw new Error("Usage: notva review --update proposal-id --path page.md --content-file file [--vault path]");
      const content = typeof contentFile === "string"
        ? await readFile(contentFile, "utf8")
        : typeof contentFlag === "string"
          ? contentFlag
          : undefined;
      if (content === undefined) throw new Error("Usage: notva review --update proposal-id --path page.md --content-file file [--vault path]");
      await updateProposalChange({ root, proposalId: update, path: changePath, content });
      console.log(`Updated proposal ${update} change ${changePath}.`);
      return;
    }
    if (typeof reject === "string") {
      await rejectProposal({ root, proposalId: reject });
      console.log(`Rejected proposal ${reject}.`);
      return;
    }
    if (typeof show === "string") {
      const proposal = pending.find((candidate) => candidate.id === show);
      if (!proposal) throw new Error(`Pending proposal not found: ${show}`);
      console.log(formatProposalDetails(proposal));
      return;
    }
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
    console.log(`${pending.length} pending proposal(s):\n${pending.map(formatProposalSummary).join("\n")}`);
    return;
  }

  if (command === "page") {
    const subcommand = args.positional[0];
    if (subcommand === "list") {
      const pages = await listWikiPages({ root });
      if (pages.length === 0) {
        console.log("No wiki pages.");
        return;
      }
      console.log(pages.map((page) => `- ${page.path}: ${page.title}`).join("\n"));
      return;
    }
    if (subcommand === "show") {
      const path = args.positional[1];
      if (!path) throw new Error("Usage: notva page show <path> [--vault path]");
      const page = await readWikiPage({ root, path });
      console.log(page.body);
      return;
    }
    if (subcommand === "save") {
      const path = args.positional[1];
      const contentFile = args.flags.get("content-file");
      const contentFlag = args.flags.get("content");
      if (!path) throw new Error("Usage: notva page save <path> --content-file file [--vault path]");
      const body = typeof contentFile === "string"
        ? await readFile(contentFile, "utf8")
        : typeof contentFlag === "string"
          ? contentFlag
          : undefined;
      if (body === undefined) throw new Error("Usage: notva page save <path> --content-file file [--vault path]");
      const page = await writeWikiPage({ root, path, body });
      console.log(`Saved page ${page.path} (${page.title}).`);
      return;
    }
    throw new Error("Usage: notva page list|show|save ...");
  }

  if (command === "source") {
    const subcommand = args.positional[0];
    if (subcommand === "list") {
      const sources = await listSources({ root });
      if (sources.length === 0) {
        console.log("No sources.");
        return;
      }
      console.log(sources.map((source) => `- ${source.id}: ${source.title} [${source.kind}] ${source.originalRef}`).join("\n"));
      return;
    }
    if (subcommand === "show") {
      const id = args.positional[1];
      if (!id) throw new Error("Usage: notva source show <id> [--vault path]");
      const result = await readSource({ root, id });
      console.log([
        `# ${result.source.id}: ${result.source.title}`,
        "",
        `kind: ${result.source.kind}`,
        `raw: ${result.source.rawPath}`,
        `original: ${result.source.originalRef}`,
        "",
        result.body
      ].join("\n"));
      return;
    }
    if (subcommand === "propose") {
      if (args.flags.has("uncovered")) {
        const result = await proposeUncoveredSources({ root });
        const created = result.results.filter((entry) => entry.created).length;
        const reused = result.results.length - created;
        console.log(`Proposed ${result.results.length} uncovered source(s): ${created} created, ${reused} reused pending, ${result.skipped.length} skipped covered.`);
        return;
      }
      const id = args.positional[1];
      if (!id) throw new Error("Usage: notva source propose <id> [--vault path]");
      const result = await proposeSource({ root, id });
      console.log(`${result.created ? "Created" : "Reused pending"} proposal ${result.proposal.id} from source ${result.source.id}.`);
      return;
    }
    throw new Error("Usage: notva source list|show|propose ...");
  }

  if (command === "query") {
    const question = args.positional.join(" ");
    if (!question) throw new Error("Usage: notva query \"question\" [--vault path]");
    if (args.flags.has("propose")) {
      const result = await proposeQueryResult({ root, question });
      console.log(`${result.created ? "Created" : "Reused pending"} query proposal ${result.proposal.id}: ${result.proposal.changes[0].title}.`);
      return;
    }
    const result = await queryVault({ root, question });
    console.log(formatQueryResult(result));
    return;
  }

  if (command === "context") {
    const query = args.positional.join(" ");
    if (!query) throw new Error("Usage: notva context \"question or task\" [--json] [--vault path]");
    const pack = await buildContextPack({ root, query });
    console.log(args.flags.has("json") ? JSON.stringify(pack, null, 2) : renderContextPackMarkdown(pack));
    return;
  }

  if (command === "rules") {
    const subcommand = args.positional[0];
    if (subcommand === "show") {
      const rules = await readVaultRules({ root });
      console.log(rules.body.trimEnd());
      return;
    }
    if (subcommand === "save") {
      const contentFile = args.flags.get("content-file");
      const contentFlag = args.flags.get("content");
      const body = typeof contentFile === "string"
        ? await readFile(contentFile, "utf8")
        : typeof contentFlag === "string"
          ? contentFlag
          : undefined;
      if (body === undefined) throw new Error("Usage: notva rules save --content-file file [--vault path]");
      const rules = await writeVaultRules({ root, body });
      console.log(`Saved vault rules ${rules.path}.`);
      return;
    }
    throw new Error("Usage: notva rules show|save ...");
  }

  if (command === "status") {
    const status = await getVaultStatus({ root });
    console.log(formatVaultStatus(status));
    return;
  }

  if (command === "doctor") {
    console.log(await formatDoctor(root));
    return;
  }

  if (command === "act") {
    if (args.positional[0] === "list") {
      const runs = await listActRuns({ root });
      console.log(formatActRuns(runs));
      return;
    }
    if (args.positional[0] === "show") {
      const id = args.positional[1];
      if (!id) throw new Error("Usage: notva act show <id> [--vault path]");
      const run = await readActRun({ root, id });
      console.log(run.output);
      return;
    }
    if (args.positional[0] === "propose") {
      const id = args.positional[1];
      if (!id) throw new Error("Usage: notva act propose <id> [--vault path]");
      const result = await proposeActRun({ root, id });
      console.log(`${result.created ? "Created" : "Reused pending"} proposal ${result.proposal.id} from act run ${result.run.id} (source ${result.source.id}).`);
      return;
    }
    const task = args.positional.join(" ");
    if (!task) throw new Error("Usage: notva act \"task\" [--json] [--run-actions] [--propose] [--vault path]");
    const result = await actVault({ root, task, runActions: args.flags.has("run-actions") });
    if (args.flags.has("propose")) {
      const proposed = await proposeActRun({ root, id: result.run.id });
      if (args.flags.has("json")) {
        console.log(JSON.stringify({
          ...result,
          proposal: proposed.proposal,
          proposalSource: proposed.source,
          proposalCreated: proposed.created
        }, null, 2));
        return;
      }
      console.log([
        result.output,
        "",
        `${proposed.created ? "Created" : "Reused pending"} proposal ${proposed.proposal.id} from act run ${proposed.run.id} (source ${proposed.source.id}).`
      ].join("\n"));
      return;
    }
    console.log(args.flags.has("json") ? JSON.stringify(result, null, 2) : result.output);
    return;
  }

  if (command === "action") {
    const subcommand = args.positional[0];
    if (subcommand !== "run") throw new Error("Usage: notva action run --command \"notva ...\" [--json] [--vault path]");
    const actionCommand = args.flags.get("command");
    if (typeof actionCommand !== "string") throw new Error("Usage: notva action run --command \"notva ...\" [--json] [--vault path]");
    const result = await runMaintenanceAction({ root, command: actionCommand });
    console.log(args.flags.has("json") ? JSON.stringify(result, null, 2) : result.message);
    return;
  }

  if (command === "graph") {
    const subcommand = args.positional[0];
    if (subcommand === "export") {
      await rebuildGraph({ root });
      const graph = await exportGraphJson({ root });
      const outPath = join(resolveVaultPaths(root).notva, "graph.json");
      await writeFile(outPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
      console.log(`Exported graph to ${outPath} (${graph.nodes.length} node(s), ${graph.edges.length} edge(s)).`);
      return;
    }
    if (subcommand === "html") {
      const result = await exportGraphHtml({ root });
      console.log(`Exported graph HTML to ${result.path} (${result.graph.nodes.length} node(s), ${result.graph.edges.length} edge(s)).`);
      return;
    }
    throw new Error("Usage: notva graph export|html [--vault path]");
  }

  if (command === "explain") {
    const query = args.positional.join(" ");
    if (!query) throw new Error("Usage: notva explain <page-or-concept> [--vault path]");
    await rebuildGraph({ root });
    const explanation = await explainGraphNode({ root, query });
    console.log(formatGraphExplanation(explanation.node, explanation.neighbors, explanation.edges));
    return;
  }

  if (command === "path") {
    const [from, to] = args.positional;
    if (!from || !to) throw new Error("Usage: notva path <from> <to> [--vault path]");
    await rebuildGraph({ root });
    const path = await findGraphPath({ root, from, to });
    console.log(formatGraphPath(path.nodes, path.edges));
    return;
  }

  if (command === "report") {
    const report = await generateGraphReport({ root });
    console.log(`Wrote graph report to ${report.path} (${report.analysis.nodeCount} node(s), ${report.analysis.edgeCount} edge(s)).`);
    return;
  }

  if (command === "concepts") {
    const subcommand = args.positional[0];
    if (subcommand !== "propose") throw new Error("Usage: notva concepts propose [--vault path]");
    const result = await proposeOpenConceptPages({ root });
    const concepts = result.created.map((record) => record.concept).join(", ");
    console.log([
      `Created ${result.created.length} open concept proposal(s).`,
      concepts ? `Concepts: ${concepts}.` : "",
      result.skipped.length > 0 ? `Skipped existing: ${result.skipped.join(", ")}.` : ""
    ].filter(Boolean).join(" "));
    return;
  }

  if (command === "links") {
    const subcommand = args.positional[0];
    if (subcommand !== "propose") throw new Error("Usage: notva links propose [--vault path]");
    const result = await proposeMissingWikiLinks({ root });
    if (!result.proposal) {
      console.log("No missing wiki links to propose.");
      return;
    }
    console.log(`${result.created ? "Created" : "Reused pending"} missing-link proposal ${result.proposal.id} for ${result.suggestions.length} page(s).`);
    return;
  }

  if (command === "install") {
    const platform = args.flags.get("platform");
    if (platform !== "codex") throw new Error("Usage: notva install --platform codex [--project] [--vault path]");
    const result = await installAgentInstructions({
      root,
      platform,
      project: args.flags.has("project"),
      codexHome: typeof args.flags.get("codex-home") === "string" ? String(args.flags.get("codex-home")) : undefined
    });
    console.log([
      `Installed Notva Codex instructions at ${result.path}.`,
      result.gitAddHint ? `Run ${result.gitAddHint}.` : ""
    ].filter(Boolean).join(" "));
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

  if (command === "serve") {
    const portValue = Number(args.flags.get("port") ?? 4321);
    if (!Number.isInteger(portValue) || portValue < 0 || portValue > 65535) {
      throw new Error("Port must be an integer between 0 and 65535.");
    }
    const running = await listenNotvaServer({ port: portValue, defaultVault: root });
    console.log(`Notva web workbench: ${running.url} (vault: ${root})`);
    if (process.env.VITEST) {
      await running.close();
    }
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

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function printHelp(): void {
  console.log(`Usage: notva <command> [args]

Default vault: ~/Notva (override with --vault or NOTVA_VAULT).

Commands:
  init [path]
  ingest <file|directory|url> [--vault path]
  ingest --text "content" [--vault path]
  review [--vault path] [--apply all|proposal-id] [--reject proposal-id]
  review [--vault path] [--show proposal-id]
  review --update proposal-id --path page.md --content-file file [--vault path]
  page list [--vault path]
  page show <path> [--vault path]
  page save <path> --content-file file [--vault path]
  source list [--vault path]
  source show <id> [--vault path]
  source propose <id> [--vault path]
  source propose --uncovered [--vault path]
  query "question" [--vault path]
  query "question" --propose [--vault path]
  context "question or task" [--json] [--vault path]
  rules show [--vault path]
  rules save --content-file file [--vault path]
  status [--vault path]
  doctor [--vault path]
  act "task" [--json] [--run-actions] [--propose] [--vault path]
  act list [--vault path]
  act show <id> [--vault path]
  act propose <id> [--vault path]
  action run --command "notva ..." [--json] [--vault path]
  lint [--vault path]
  reindex [--vault path]
  graph export [--vault path]
  graph html [--vault path]
  explain <page-or-concept> [--vault path]
  path <from> <to> [--vault path]
  report [--vault path]
  concepts propose [--vault path]
  links propose [--vault path]
  install --platform codex [--project] [--vault path]
  serve [--vault path] [--port 4321]`);
}

function formatGraphExplanation(node: GraphNodeRecord, neighbors: GraphNodeRecord[], edges: GraphEdgeRecord[]): string {
  const nodeById = new Map([[node.id, node], ...neighbors.map((neighbor) => [neighbor.id, neighbor] as const)]);
  const edgeLines = edges.map((edge) => {
    const source = formatGraphNodeRef(nodeById.get(edge.source), edge.source);
    const target = formatGraphNodeRef(nodeById.get(edge.target), edge.target);
    return `- ${source} --${edge.relation}--> ${target} [${edge.confidence}]`;
  });
  return [
    `${node.label} (${node.kind}${node.path ? `: ${node.path}` : ""})`,
    ...edgeLines
  ].join("\n");
}

function formatActRuns(runs: Awaited<ReturnType<typeof listActRuns>>): string {
  if (runs.length === 0) return "No act runs.";
  return runs.map((run) => [
    `${run.id}: ${run.task}`,
    `  status ${run.status}`,
    `  evidence ${run.evidenceCount}`,
    `  raw ${run.sourceHitCount}`,
    `  actions ${run.actionCount}`,
    `  output ${run.outputPath}`
  ].join("\n")).join("\n\n");
}

async function formatDoctor(root: string): Promise<string> {
  const paths = resolveVaultPaths(root);
  const initialized = await fileExists(paths.config) && await fileExists(paths.stateDb);
  if (!initialized) {
    return [
      "# Notva Doctor",
      `vault ${root}`,
      "initialized no",
      "health missing_vault",
      `next notva init ${root}`
    ].join("\n");
  }

  const [status, graphJson, graphHtml, graphReport] = await Promise.all([
    getVaultStatus({ root }),
    fileExists(join(paths.notva, "graph.json")),
    fileExists(join(paths.notva, "graph.html")),
    fileExists(join(paths.notva, "graph-report.md"))
  ]);

  return [
    "# Notva Doctor",
    `vault ${root}`,
    "initialized yes",
    `health ${status.health}`,
    `sources ${status.sourceCount}`,
    `pages ${status.pageCount}`,
    `pending proposals ${status.pendingProposalCount}`,
    `lint issues ${status.lintIssueCount}`,
    `act runs ${status.actRunCount}`,
    `graph json ${yesNo(graphJson)}`,
    `graph html ${yesNo(graphHtml)}`,
    `graph report ${yesNo(graphReport)}`,
    `next ${doctorNextStep(root, status, { graphJson, graphHtml, graphReport })}`
  ].join("\n");
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function doctorNextStep(
  root: string,
  status: Awaited<ReturnType<typeof getVaultStatus>>,
  artifacts: { graphJson: boolean; graphHtml: boolean; graphReport: boolean }
): string {
  if (status.pendingProposalCount > 0) return `notva review --vault ${root}`;
  if (status.issueCounts.source_without_page) return `notva source propose --uncovered --vault ${root}`;
  if (status.issueCounts.open_concept) return `notva concepts propose --vault ${root}`;
  if (status.sourceCount === 0 && status.pageCount === 0) return `notva ingest --vault ${root} --text "content"`;
  if (!artifacts.graphJson) return `notva graph export --vault ${root}`;
  if (!artifacts.graphHtml) return `notva graph html --vault ${root}`;
  if (!artifacts.graphReport) return `notva report --vault ${root}`;
  if (status.lintIssueCount > 0) return `notva lint --vault ${root}`;
  return "ready for local use";
}

function formatVaultStatus(status: Awaited<ReturnType<typeof getVaultStatus>>): string {
  const lastAct = status.lastActRun ? status.lastActRun.task : "none";
  const issueLines = Object.entries(status.issueCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => `  ${code} ${count}`);
  return [
    "Vault Status",
    `root ${status.root}`,
    `health ${status.health}`,
    `sources ${status.sourceCount}`,
    `pages ${status.pageCount}`,
    `pending proposals ${status.pendingProposalCount}`,
    `lint issues ${status.lintIssueCount}`,
    `act runs ${status.actRunCount}`,
    `last act ${lastAct}`,
    "issue counts",
    ...(issueLines.length > 0 ? issueLines : ["  none"])
  ].join("\n");
}

function formatGraphPath(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string {
  if (nodes.length === 0) return "No graph path.";
  const segments: string[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const edge = edges[index];
    if (edge.source === from.id && edge.target === to.id) {
      segments.push(`${from.label} --${edge.relation}--> ${to.label}`);
    } else {
      segments.push(`${from.label} <--${edge.relation}-- ${to.label}`);
    }
  }
  return segments.length > 0 ? segments.join("\n") : nodes[0].label;
}

function formatGraphNodeRef(node: GraphNodeRecord | undefined, fallback: string): string {
  return node ? `${node.label} (${node.kind})` : fallback;
}

function formatQueryResult(result: Awaited<ReturnType<typeof queryVault>>): string {
  const hitLines = result.hits.map((hit) => {
    const sources = hit.sources.length > 0
      ? [
          `  sources: ${hit.sources.map((source) => source.id).join(", ")}`,
          ...hit.sources.map((source) => `  original ${source.originalRef}`)
        ]
      : ["  sources: none"];
    return [
      `- ${hit.title}: ${hit.snippet}`,
      ...sources
    ].join("\n");
  });
  return [result.answer, ...hitLines].join("\n").trim();
}

function formatProposalSummary(proposal: Awaited<ReturnType<typeof listPendingProposalDetails>>[number]): string {
  const changeLines = proposal.changes.map((change) => `  - ${change.type} ${change.path} (${change.title})`);
  const sourceLines = proposal.sourceEvidence
    ? [
        `  source ${proposal.sourceEvidence.source.id}: ${proposal.sourceEvidence.source.title}`,
        `  original ${proposal.sourceEvidence.source.originalRef}`,
        `  preview ${proposal.sourceEvidence.preview}`
      ]
    : [];
  return [
    `- ${proposal.id}: ${proposal.summary}`,
    ...sourceLines,
    ...changeLines
  ].join("\n");
}

function formatProposalDetails(proposal: Awaited<ReturnType<typeof listPendingProposalDetails>>[number]): string {
  const blocks = proposal.changes.map((change) => [
    `## ${change.type} ${change.path} (${change.title})`,
    change.content
  ].join("\n\n"));
  const sourceBlock = proposal.sourceEvidence
    ? [
        "## Source Evidence",
        `source ${proposal.sourceEvidence.source.id}: ${proposal.sourceEvidence.source.title}`,
        `kind ${proposal.sourceEvidence.source.kind}`,
        `original ${proposal.sourceEvidence.source.originalRef}`,
        "",
        proposal.sourceEvidence.preview
      ].join("\n")
    : "";
  return [
    `Proposal ${proposal.id}: ${proposal.summary}`,
    sourceBlock,
    ...blocks
  ].filter(Boolean).join("\n\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
