import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { actVault, listActRuns, proposeActRun, readActRun } from "./act.js";
import { ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { applyProposal, listPendingProposals, rejectProposal } from "./review.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-act-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("actVault", () => {
  test("retrieves wiki evidence before producing a task output", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "web.md");
    await writeFile(sourcePath, "# Web Workbench\n\nNotva uses a local web workbench for review and query.", "utf8");
    const ingest = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: ingest.proposal.id });

    const result = await actVault({ root, task: "Draft a next step for the local web workbench" });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].title).toBe("Web Workbench");
    expect(result.context.graph.neighborhoods[0].node.label).toBe("Web Workbench");
    expect(result.execution.status).toBe("ready");
    expect(result.execution.actions).toEqual([]);
    expect(result.execution.summary).toContain("Reviewed wiki evidence is available");
    expect(result.output).toContain("Web Workbench");
    expect(result.output).toContain("Evidence");
    expect(result.output).toContain(`sources: ${ingest.source.id} (${sourcePath})`);
    expect(result.output).toContain("Graph Neighborhoods");
    expect(result.output).toContain("## Execution Plan");
    expect(result.output).toContain("Status: ready");
    expect(result.output).toContain("Execution Guidance");
  });

  test("uses matching raw sources as weak context when reviewed wiki evidence is missing", async () => {
    const root = await tempRoot();
    await initVault({ root });
    await ingestSource({
      root,
      kind: "text",
      target: "# Raw Action Context\n\nRaw-only Orion instruction should inform the next action."
    });

    const result = await actVault({ root, task: "Use Orion instruction" });

    expect(result.evidence).toHaveLength(0);
    expect(result.context.sourceHits[0].source.title).toBe("Raw Action Context");
    expect(result.execution.status).toBe("needs_maintenance");
    expect(result.execution.actions.map((action) => action.command)).toContain(`notva source propose --uncovered --vault ${root}`);
    expect(result.execution.summary).toContain("maintenance actions");
    expect(result.context.actions.map((action) => action.command)).toContain(`notva source propose --uncovered --vault ${root}`);
    expect(result.output).toContain("Raw Source Evidence");
    expect(result.output).toContain("Suggested Actions");
    expect(result.output).toContain("## Execution Plan");
    expect(result.output).toContain("Status: needs_maintenance");
    expect(result.output).toContain("notva review");
    expect(result.output).toContain(`notva source propose --uncovered --vault ${root}`);
    expect(result.output).toContain("Review or promote raw source matches");
  });

  test("marks tasks without reviewed or raw context as missing context", async () => {
    const root = await tempRoot();
    await initVault({ root });

    const result = await actVault({ root, task: "Use missing Polaris context" });

    expect(result.evidence).toHaveLength(0);
    expect(result.context.sourceHits).toHaveLength(0);
    expect(result.execution.status).toBe("missing_context");
    expect(result.execution.actions).toEqual([]);
    expect(result.execution.summary).toContain("No reviewed wiki or raw source evidence matched");
    expect(result.output).toContain("## Execution Plan");
    expect(result.output).toContain("Status: missing_context");
    expect(result.output).toContain("Add or review relevant sources first");
  });

  test("can run suggested maintenance actions before returning a refreshed execution plan", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Run Actions Source\n\nRun-actions Atlas detail should be promoted before final execution."
    });
    await rejectProposal({ root, proposalId: ingest.proposal.id });

    const result = await actVault({ root, task: "Use Atlas detail", runActions: true });

    expect(result.actionResults.map((action) => action.kind)).toContain("source_propose_uncovered");
    expect(result.actionResults.some((action) => action.changed)).toBe(true);
    expect(result.output).toContain("## Maintenance Actions Run");
    expect(result.output).toContain("Proposed 1 uncovered source");
    expect((await listPendingProposals({ root })).map((proposal) => proposal.sourceId)).toContain(ingest.source.id);
    expect(result.execution.status).toBe("needs_maintenance");
    expect(result.execution.actions.map((action) => action.command)).toContain(`notva review --vault ${root}`);
  });

  test("persists act runs as local history with output logs", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "history.md");
    await writeFile(sourcePath, "# Act History\n\nNotva should preserve act runs for later review.", "utf8");
    const ingest = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: ingest.proposal.id });

    const result = await actVault({ root, task: "Review act history" });

    expect(result.run.task).toBe("Review act history");
    expect(result.run.status).toBe("ready");
    expect(result.run.evidenceCount).toBe(1);
    expect(result.run.actionCount).toBe(0);
    expect(result.run.outputPath).toContain(".notva/logs/act-");

    const runs = await listActRuns({ root });
    expect(runs).toEqual([result.run]);

    const detail = await readActRun({ root, id: result.run.id });
    expect(detail.id).toBe(result.run.id);
    expect(detail.output).toContain("## Execution Plan");
    expect(detail.evidence[0].title).toBe("Act History");
    expect(detail.actionResults).toEqual([]);
    expect(detail.output).toContain("Notva should preserve act runs");
  });

  test("creates a reviewable wiki proposal from an act run", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "act-proposal.md");
    await writeFile(sourcePath, "# Act Proposal Evidence\n\nAct run results should be reviewable knowledge.", "utf8");
    const ingest = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: ingest.proposal.id });
    const act = await actVault({ root, task: "Summarize reusable act proposal guidance" });

    const proposed = await proposeActRun({ root, id: act.run.id });

    expect(proposed.created).toBe(true);
    expect(proposed.source.originalRef).toBe(`act:${act.run.id}`);
    expect(proposed.source.kind).toBe("text");
    expect(proposed.source.title).toBe("Act Result: Summarize reusable act proposal guidance");
    expect(proposed.proposal.status).toBe("pending");
    expect(proposed.proposal.sourceId).toBe(proposed.source.id);
    expect(proposed.proposal.summary).toContain("Act Result");
    expect(proposed.proposal.changes[0].title).toBe("Act Result: Summarize reusable act proposal guidance");
    expect(proposed.proposal.changes[0].path).toBe("act-result-summarize-reusable-act-proposal-guidance.md");
    expect(proposed.proposal.changes[0].content).toContain(`act run ${act.run.id}`);
    expect(proposed.proposal.changes[0].content).toContain("Act Proposal Evidence");
    expect(proposed.proposal.changes[0].content).toContain(`sources: ${ingest.source.id} (${sourcePath})`);
    expect(proposed.proposal.changes[0].content).toContain("Use the cited Notva wiki evidence");

    const reused = await proposeActRun({ root, id: act.run.id });
    expect(reused.created).toBe(false);
    expect(reused.source.id).toBe(proposed.source.id);
    expect(reused.proposal.id).toBe(proposed.proposal.id);
    expect((await listPendingProposals({ root })).filter((proposal) => proposal.sourceId === proposed.source.id)).toHaveLength(1);
  });
});
