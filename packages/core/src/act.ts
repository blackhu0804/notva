import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { runMaintenanceAction } from "./actions.js";
import { buildContextPack, formatReviewedEvidenceSources, renderContextPackMarkdown } from "./context.js";
import { ensureDir, resolveVaultPaths, sha256, shortId, slugify } from "./paths.js";
import { NotvaState } from "./state.js";
import type {
  ActExecutionPlan,
  ActResult,
  ActRunDetail,
  ActRunRecord,
  ContextAction,
  ContextPack,
  MaintenanceActionResult,
  PageRecord,
  ProposalRecord,
  SourceRecord
} from "./types.js";

export interface ActVaultOptions {
  root: string;
  task: string;
  limit?: number;
  runActions?: boolean;
}

export interface ListActRunsOptions {
  root: string;
}

export interface ReadActRunOptions {
  root: string;
  id: string;
}

export interface ProposeActRunOptions {
  root: string;
  id: string;
}

export interface ProposeActRunResult {
  run: ActRunDetail;
  source: SourceRecord;
  proposal: ProposalRecord;
  created: boolean;
}

export async function actVault(options: ActVaultOptions): Promise<ActResult> {
  let context = await buildContextPack({
    root: options.root,
    query: options.task,
    limit: options.limit ?? 5
  });
  let execution = planExecution(context);
  const actionResults: MaintenanceActionResult[] = [];

  if (options.runActions && execution.actions.length > 0) {
    for (const action of execution.actions) {
      actionResults.push(await runMaintenanceAction({ root: options.root, command: action.command }));
    }
    context = await buildContextPack({
      root: options.root,
      query: options.task,
      limit: options.limit ?? 5
    });
    execution = planExecution(context);
  }

  const output = context.hits.length > 0
    ? `${renderContextPackMarkdown(context)}\n\n${renderMaintenanceActionResults(actionResults)}${renderExecutionPlan(execution)}\n\n## Output\nUse the cited Notva wiki evidence and graph relationships above before continuing with this task.`
    : context.sourceHits.length > 0
      ? `${renderContextPackMarkdown(context)}\n\n${renderMaintenanceActionResults(actionResults)}${renderExecutionPlan(execution)}\n\n## Output\nReview or promote raw source matches into wiki pages before treating this task as fully grounded.`
      : `${renderContextPackMarkdown(context)}\n\n${renderMaintenanceActionResults(actionResults)}${renderExecutionPlan(execution)}\n\n## Output\nI could not ground this task in the current vault. Add or review relevant sources first.`;

  const run = await persistActRun({
    root: options.root,
    task: options.task,
    output,
    context,
    execution,
    actionResults
  });

  return {
    task: options.task,
    output,
    evidence: context.hits,
    context,
    execution,
    actionResults,
    run
  };
}

export async function listActRuns(options: ListActRunsOptions): Promise<ActRunRecord[]> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    return state.listActRuns();
  } finally {
    state.close();
  }
}

export async function readActRun(options: ReadActRunOptions): Promise<ActRunDetail> {
  const paths = resolveVaultPaths(options.root);
  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    const run = state.getActRun(options.id);
    if (!run) throw new Error(`Act run not found: ${options.id}`);
    return {
      ...run,
      output: await readFile(run.outputPath, "utf8")
    };
  } finally {
    state.close();
  }
}

export async function proposeActRun(options: ProposeActRunOptions): Promise<ProposeActRunResult> {
  const run = await readActRun(options);
  const paths = resolveVaultPaths(options.root);
  const now = new Date().toISOString();
  const content = renderActRunProposalSource(run);
  const sourceId = shortId(`act-run-source:${run.id}`);

  const state = new NotvaState(paths.stateDb);
  let relatedPages: PageRecord[];
  try {
    state.initialize();
    const existingSource = state.getSource(sourceId);
    if (existingSource) {
      const pending = state.listProposalsForSource(existingSource.id).find((proposal) => proposal.status === "pending");
      if (pending) {
        return { run, source: existingSource, proposal: pending, created: false };
      }
    }
    relatedPages = state.listPages();
  } finally {
    state.close();
  }

  const datedRawDir = join(paths.raw, now.slice(0, 10));
  await ensureDir(datedRawDir);
  const source: SourceRecord = {
    id: sourceId,
    kind: "text",
    title: actRunSourceTitle(run.task),
    rawPath: join(datedRawDir, `${slugify(`act-${run.id}-${run.task}`)}-${sourceId}.md`),
    originalRef: `act:${run.id}`,
    createdAt: now,
    sha256: sha256(content)
  };
  await writeFile(source.rawPath, content, "utf8");

  const proposal = buildActRunProposal({
    run,
    source,
    createdAt: now,
    relatedPages
  });

  const insertState = new NotvaState(paths.stateDb);
  try {
    insertState.initialize();
    insertState.insertSource(source);
    insertState.insertProposal(proposal);
  } finally {
    insertState.close();
  }

  return { run, source, proposal, created: true };
}

async function persistActRun(input: {
  root: string;
  task: string;
  output: string;
  context: ContextPack;
  execution: ActExecutionPlan;
  actionResults: MaintenanceActionResult[];
}): Promise<ActRunRecord> {
  const paths = resolveVaultPaths(input.root);
  await ensureDir(paths.logs);
  const createdAt = new Date().toISOString();
  const id = shortId(`${createdAt}\0${input.task}\0${input.output}`);
  const outputPath = join(paths.logs, `act-${createdAt.replace(/[:.]/g, "-")}-${id}.md`);
  const log = renderActRunLog({
    id,
    task: input.task,
    status: input.execution.status,
    createdAt,
    output: input.output
  });

  const detail: ActRunDetail = {
    id,
    task: input.task,
    status: input.execution.status,
    summary: input.execution.summary,
    outputPath,
    evidenceCount: input.context.hits.length,
    sourceHitCount: input.context.sourceHits.length,
    actionCount: input.actionResults.length,
    createdAt,
    output: log,
    evidence: input.context.hits,
    sourceHits: input.context.sourceHits,
    actionResults: input.actionResults
  };

  await writeFile(outputPath, log, "utf8");

  const state = new NotvaState(paths.stateDb);
  try {
    state.initialize();
    state.insertActRun(detail);
  } finally {
    state.close();
  }

  const { output: _output, evidence: _evidence, sourceHits: _sourceHits, actionResults: _actionResults, ...record } = detail;
  return record;
}

function renderActRunLog(input: {
  id: string;
  task: string;
  status: ActExecutionPlan["status"];
  createdAt: string;
  output: string;
}): string {
  return [
    "# Notva Act Run",
    "",
    `id: ${input.id}`,
    `task: ${input.task}`,
    `status: ${input.status}`,
    `createdAt: ${input.createdAt}`,
    "",
    input.output
  ].join("\n");
}

function renderActRunProposalSource(run: ActRunDetail): string {
  const evidence = run.evidence.length > 0
    ? run.evidence.map((hit) => [
        `- ${hit.title} (${hit.path}): ${hit.snippet}`,
        `  ${formatReviewedEvidenceSources(hit.sources)}`
      ].join("\n")).join("\n")
    : "- No reviewed wiki evidence was attached.";
  const sourceHits = run.sourceHits.length > 0
    ? run.sourceHits.map((hit) => `- ${hit.source.id}: ${hit.source.title}: ${hit.snippet}`).join("\n")
    : "- No raw source evidence was attached.";
  const actions = run.actionResults.length > 0
    ? run.actionResults.map((action) => `- ${action.kind}: ${action.message}`).join("\n")
    : "- No maintenance actions were run.";

  return [
    `# ${actRunSourceTitle(run.task)}`,
    "",
    `This source was generated from act run ${run.id}. Review it before applying it to the wiki.`,
    "",
    "## Task",
    "",
    run.task,
    "",
    "## Execution Status",
    "",
    `Status: ${run.status}`,
    "",
    run.summary,
    "",
    "## Reviewed Wiki Evidence",
    "",
    evidence,
    "",
    "## Raw Source Evidence",
    "",
    sourceHits,
    "",
    "## Maintenance Actions",
    "",
    actions,
    "",
    "## Captured Output",
    "",
    run.output
  ].join("\n");
}

function buildActRunProposal(input: {
  run: ActRunDetail;
  source: SourceRecord;
  createdAt: string;
  relatedPages: PageRecord[];
}): ProposalRecord {
  const title = input.source.title;
  const path = `${slugify(title)}.md`;
  const content = renderActRunWikiPage(input.run, input.source, input.createdAt, input.relatedPages);
  return {
    id: shortId(`proposal:${input.source.id}:${path}:${input.createdAt}`),
    sourceId: input.source.id,
    status: "pending",
    summary: `Create wiki page "${title}" from act run ${input.run.id}.`,
    changes: [{ type: "create_page", path, title, content }],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

function renderActRunWikiPage(run: ActRunDetail, source: SourceRecord, createdAt: string, relatedPages: PageRecord[]): string {
  const related = relatedPages
    .filter((page) => run.evidence.some((hit) => hit.path === page.path || hit.title === page.title))
    .map((page) => `- [[${page.title}]] (${page.path})`);
  return [
    "---",
    `title: "${source.title.replaceAll('"', '\\"')}"`,
    "sources:",
    `  - ${source.id}`,
    `created: ${createdAt}`,
    "---",
    "",
    `# ${source.title}`,
    "",
    "## Summary",
    "",
    `Generated from act run ${run.id}. Review this result before applying it to the durable wiki.`,
    "",
    "## Task",
    "",
    run.task,
    "",
    "## Execution Status",
    "",
    `Status: ${run.status}`,
    "",
    run.summary,
    "",
    "## Reviewed Wiki Evidence",
    "",
    formatActEvidence(run),
    "",
    "## Raw Source Evidence",
    "",
    formatActSourceHits(run),
    "",
    "## Maintenance Actions",
    "",
    formatActActionResults(run),
    "",
    ...(related.length > 0 ? ["## Related Wiki Pages", "", ...related, ""] : []),
    "## Captured Output",
    "",
    run.output,
    "",
    "## Sources",
    "",
    `- ${source.id}: ${basename(source.rawPath)}`
  ].join("\n");
}

function actRunSourceTitle(task: string): string {
  return `Act Result: ${task}`;
}

function formatActEvidence(run: ActRunDetail): string {
  if (run.evidence.length === 0) return "- No reviewed wiki evidence was attached.";
  return run.evidence.map((hit) => `- ${hit.title} (${hit.path}): ${hit.snippet}`).join("\n");
}

function formatActSourceHits(run: ActRunDetail): string {
  if (run.sourceHits.length === 0) return "- No raw source evidence was attached.";
  return run.sourceHits.map((hit) => `- ${hit.source.id}: ${hit.source.title}: ${hit.snippet}`).join("\n");
}

function formatActActionResults(run: ActRunDetail): string {
  if (run.actionResults.length === 0) return "- No maintenance actions were run.";
  return run.actionResults.map((action) => `- ${action.kind}: ${action.message}`).join("\n");
}

function planExecution(context: ContextPack): ActExecutionPlan {
  if (context.actions.length > 0) {
    return {
      status: "needs_maintenance",
      summary: "Run the suggested maintenance actions before final execution, then review any resulting proposals.",
      actions: context.actions
    };
  }

  if (context.hits.length > 0) {
    return {
      status: "ready",
      summary: "Reviewed wiki evidence is available; continue using the cited pages and graph relationships.",
      actions: []
    };
  }

  if (context.sourceHits.length > 0) {
    return {
      status: "needs_maintenance",
      summary: "Only raw source evidence matched; promote or review relevant sources before final execution.",
      actions: []
    };
  }

  return {
    status: "missing_context",
    summary: "No reviewed wiki or raw source evidence matched this task.",
    actions: []
  };
}

function renderExecutionPlan(execution: ActExecutionPlan): string {
  return [
    "## Execution Plan",
    `Status: ${execution.status}`,
    execution.summary,
    "",
    ...formatExecutionActions(execution.actions)
  ].join("\n").trim();
}

function renderMaintenanceActionResults(results: MaintenanceActionResult[]): string {
  if (results.length === 0) return "";
  return [
    "## Maintenance Actions Run",
    ...results.map((result, index) => [
      `${index + 1}. ${result.kind}`,
      `Command: ${result.command}`,
      `Changed: ${result.changed ? "yes" : "no"}`,
      result.message
    ].join("\n")),
    ""
  ].join("\n");
}

function formatExecutionActions(actions: ContextAction[]): string[] {
  if (actions.length === 0) return ["Actions: none"];
  return [
    "Actions:",
    ...actions.map((action, index) => `${index + 1}. ${action.command}\n   reason: ${action.reason}`)
  ];
}
