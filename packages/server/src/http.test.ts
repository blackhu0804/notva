import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { listenNotvaServer } from "./http.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-server-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  expect(response.ok).toBe(true);
  return await response.json() as T;
}

describe("Notva HTTP server", () => {
  test("returns query hit source provenance through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const ingested = await json<{ source: { id: string; originalRef: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# HTTP Query Provenance\n\nHTTP query responses should include the source behind reviewed hits."
        })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: ingested.proposal.id })
      });

      const result = await json<{
        answer: string;
        hits: Array<{ title: string; sources: Array<{ id: string; originalRef: string }> }>;
      }>(`${running.url}/api/query`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "source behind reviewed" })
      });

      expect(result.answer).toContain("HTTP Query Provenance");
      expect(result.answer).toContain(`sources: ${ingested.source.id}`);
      expect(result.hits[0].sources).toEqual([
        expect.objectContaining({
          id: ingested.source.id,
          originalRef: ingested.source.originalRef
        })
      ]);
    } finally {
      await running.close();
    }
  });

  test("returns source evidence with pending proposal listings", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const ingested = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# HTTP Review Evidence\n\nHTTP proposal listings should show raw source evidence."
        })
      });

      const proposals = await json<{
        proposals: Array<{
          id: string;
          sourceEvidence?: {
            source: { id: string; title: string; originalRef: string };
            preview: string;
          };
        }>;
      }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);

      expect(proposals.proposals[0].id).toBe(ingested.proposal.id);
      expect(proposals.proposals[0].sourceEvidence?.source.id).toBe(ingested.source.id);
      expect(proposals.proposals[0].sourceEvidence?.source.title).toBe("HTTP Review Evidence");
      expect(proposals.proposals[0].sourceEvidence?.source.originalRef).toBe("inline:text");
      expect(proposals.proposals[0].sourceEvidence?.preview).toContain("HTTP proposal listings should show raw source evidence");
    } finally {
      await running.close();
    }
  });

  test("promotes uncovered sources through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const covered = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Covered Source\n\nCovered source already has a page." })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: covered.proposal.id })
      });
      const rejected = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Rejected Source\n\nRejected source should be reopened." })
      });
      await json(`${running.url}/api/review/reject`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: rejected.proposal.id })
      });
      const pending = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Pending Source\n\nPending source should be reused." })
      });

      const promoted = await json<{
        results: Array<{ created: boolean; source: { id: string }; proposal: { id: string; sourceId: string } }>;
        skipped: Array<{ id: string }>;
      }>(`${running.url}/api/sources/propose-uncovered`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });

      expect(promoted.skipped.map((source) => source.id)).toEqual([covered.source.id]);
      expect(promoted.results.map((entry) => entry.source.id)).toEqual([rejected.source.id, pending.source.id]);
      expect(promoted.results.map((entry) => entry.created)).toEqual([true, false]);
      expect(promoted.results[0].proposal.id).not.toBe(rejected.proposal.id);
      expect(promoted.results[1].proposal.id).toBe(pending.proposal.id);
    } finally {
      await running.close();
    }
  });

  test("runs suggested maintenance actions through a safe API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const raw = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Action Raw\n\nHTTP action runner should recreate proposals." })
      });
      await json(`${running.url}/api/review/reject`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: raw.proposal.id })
      });

      const action = await json<{
        kind: string;
        changed: boolean;
        message: string;
        data: { results: Array<{ source: { id: string } }> };
      }>(`${running.url}/api/action/run`, {
        method: "POST",
        body: JSON.stringify({ vault, command: `notva source propose --uncovered --vault ${vault}` })
      });

      expect(action.kind).toBe("source_propose_uncovered");
      expect(action.changed).toBe(true);
      expect(action.message).toContain("Proposed 1 uncovered source");
      expect(action.data.results.map((entry) => entry.source.id)).toContain(raw.source.id);

      const proposals = await json<{ proposals: Array<{ sourceId: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(proposals.proposals.map((proposal) => proposal.sourceId)).toContain(raw.source.id);

      const unsupported = await fetch(`${running.url}/api/action/run`, {
        method: "POST",
        body: JSON.stringify({ vault, command: "rm -rf /" })
      });
      expect(unsupported.ok).toBe(false);
      expect(await unsupported.json()).toMatchObject({ error: "Unsupported Notva maintenance action: rm -rf /" });
    } finally {
      await running.close();
    }
  });

  test("reads and saves vault rules through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });

      const initial = await json<{ rules: { path: string; body: string } }>(
        `${running.url}/api/rules?vault=${encodeURIComponent(vault)}`
      );
      expect(initial.rules.path).toBe("notva.md");
      expect(initial.rules.body).toContain("Notva Wiki Maintenance Rules");

      const saved = await json<{ rules: { path: string; body: string } }>(`${running.url}/api/rules`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          body: "# HTTP Rules\n\n- Keep HTTP saved rules in context packs."
        })
      });
      expect(saved.rules.path).toBe("notva.md");
      expect(saved.rules.body).toContain("HTTP Rules");

      const context = await json<{ rules: string }>(`${running.url}/api/context`, {
        method: "POST",
        body: JSON.stringify({ vault, query: "HTTP saved rules" })
      });
      expect(context.rules).toContain("HTTP Rules");
      expect(context.rules).toContain("Keep HTTP saved rules");
    } finally {
      await running.close();
    }
  });

  test("creates reviewable proposals from query results through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const ingested = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# HTTP Query Proposal\n\nHTTP query proposals should be reusable wiki material."
        })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: ingested.proposal.id })
      });

      const proposed = await json<{
        created: boolean;
        source: { id: string; originalRef: string };
        proposal: { id: string; summary: string; changes: Array<{ content: string }> };
      }>(`${running.url}/api/query/propose`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "HTTP query proposals" })
      });

      expect(proposed.created).toBe(true);
      expect(proposed.source.originalRef).toBe("query:HTTP query proposals");
      expect(proposed.proposal.summary).toContain("Query Result: HTTP query proposals");
      expect(proposed.proposal.changes[0].content).toContain("HTTP Query Proposal");

      const proposals = await json<{ proposals: Array<{ id: string; summary: string }> }>(
        `${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`
      );
      expect(proposals.proposals.map((proposal) => proposal.id)).toContain(proposed.proposal.id);
    } finally {
      await running.close();
    }
  });

  test("runs act maintenance actions through the API before returning a refreshed plan", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const raw = await json<{ source: { id: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Act Run Raw\n\nHTTP act run-actions should create a proposal." })
      });
      await json(`${running.url}/api/review/reject`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: raw.proposal.id })
      });

      const act = await json<{
        output: string;
        run: { id: string; task: string; status: string; evidenceCount: number; actionCount: number };
        actionResults: Array<{ kind: string; changed: boolean; message: string }>;
        execution: { status: string; actions: Array<{ command: string }> };
      }>(`${running.url}/api/act`, {
        method: "POST",
        body: JSON.stringify({ vault, task: "HTTP act run-actions", runActions: true })
      });

      expect(act.actionResults.map((action) => action.kind)).toContain("source_propose_uncovered");
      expect(act.actionResults.some((action) => action.changed)).toBe(true);
      expect(act.output).toContain("## Maintenance Actions Run");
      expect(act.output).toContain("Proposed 1 uncovered source");
      expect(act.execution.status).toBe("needs_maintenance");
      expect(act.execution.actions.map((action) => action.command)).toContain(`notva review --vault ${vault}`);
      expect(act.run.task).toBe("HTTP act run-actions");
      expect(act.run.status).toBe("needs_maintenance");
      expect(act.run.actionCount).toBeGreaterThan(0);

      const proposals = await json<{ proposals: Array<{ sourceId: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(proposals.proposals.map((proposal) => proposal.sourceId)).toContain(raw.source.id);

      const runs = await json<{ runs: Array<{ id: string; task: string; status: string; evidenceCount: number }> }>(
        `${running.url}/api/act/runs?vault=${encodeURIComponent(vault)}`
      );
      expect(runs.runs[0]).toMatchObject({
        id: act.run.id,
        task: "HTTP act run-actions",
        status: "needs_maintenance"
      });

      const run = await json<{
        run: { id: string; output: string; actionResults: Array<{ kind: string }> };
      }>(`${running.url}/api/act/run?vault=${encodeURIComponent(vault)}&id=${encodeURIComponent(act.run.id)}`);
      expect(run.run.id).toBe(act.run.id);
      expect(run.run.output).toContain("# Notva Act Run");
      expect(run.run.output).toContain("## Maintenance Actions Run");
      expect(run.run.actionResults.map((action) => action.kind)).toContain("source_propose_uncovered");
    } finally {
      await running.close();
    }
  });

  test("creates reviewable proposals from act runs through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const seed = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Act Proposal\n\nHTTP act results should become reviewable wiki proposals." })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: seed.proposal.id })
      });
      const act = await json<{
        run: { id: string; task: string };
      }>(`${running.url}/api/act`, {
        method: "POST",
        body: JSON.stringify({ vault, task: "Summarize HTTP act proposal" })
      });

      const proposed = await json<{
        created: boolean;
        source: { id: string; title: string; originalRef: string };
        proposal: { id: string; sourceId: string; changes: Array<{ path: string; title: string; content: string }> };
      }>(`${running.url}/api/act/propose`, {
        method: "POST",
        body: JSON.stringify({ vault, id: act.run.id })
      });

      expect(proposed.created).toBe(true);
      expect(proposed.source.originalRef).toBe(`act:${act.run.id}`);
      expect(proposed.source.title).toBe("Act Result: Summarize HTTP act proposal");
      expect(proposed.proposal.sourceId).toBe(proposed.source.id);
      expect(proposed.proposal.changes[0].path).toBe("act-result-summarize-http-act-proposal.md");
      expect(proposed.proposal.changes[0].content).toContain(`act run ${act.run.id}`);
      expect(proposed.proposal.changes[0].content).toContain("HTTP Act Proposal");

      const reused = await json<{
        created: boolean;
        proposal: { id: string };
      }>(`${running.url}/api/act/propose`, {
        method: "POST",
        body: JSON.stringify({ vault, id: act.run.id })
      });
      expect(reused.created).toBe(false);
      expect(reused.proposal.id).toBe(proposed.proposal.id);

      const proposals = await json<{ proposals: Array<{ sourceId: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(proposals.proposals.filter((proposal) => proposal.sourceId === proposed.source.id)).toHaveLength(1);
    } finally {
      await running.close();
    }
  });

  test("creates reviewable proposals directly while running act through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const seed = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# HTTP Act Inline Proposal\n\nHTTP inline act proposals should return to review immediately."
        })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: seed.proposal.id })
      });

      const act = await json<{
        output: string;
        run: { id: string; task: string };
        proposalCreated: boolean;
        proposalSource: { id: string; originalRef: string; title: string };
        proposal: { id: string; sourceId: string; changes: Array<{ path: string; title: string; content: string }> };
      }>(`${running.url}/api/act`, {
        method: "POST",
        body: JSON.stringify({ vault, task: "Summarize HTTP inline act proposal", propose: true })
      });

      expect(act.output).toContain("HTTP Act Inline Proposal");
      expect(act.proposalCreated).toBe(true);
      expect(act.proposalSource.originalRef).toBe(`act:${act.run.id}`);
      expect(act.proposalSource.title).toBe("Act Result: Summarize HTTP inline act proposal");
      expect(act.proposal.sourceId).toBe(act.proposalSource.id);
      expect(act.proposal.changes[0].title).toBe("Act Result: Summarize HTTP inline act proposal");
      expect(act.proposal.changes[0].path).toBe("act-result-summarize-http-inline-act-proposal.md");
      expect(act.proposal.changes[0].content).toContain(`act run ${act.run.id}`);

      const proposals = await json<{ proposals: Array<{ sourceId: string; summary: string }> }>(
        `${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`
      );
      expect(proposals.proposals).toContainEqual(expect.objectContaining({
        sourceId: act.proposalSource.id,
        summary: expect.stringContaining("Act Result: Summarize HTTP inline act proposal")
      }));
    } finally {
      await running.close();
    }
  });

  test("proposes missing wiki links through the API", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      const alpha = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Project Alpha\n\nHTTP Project Alpha is reviewed knowledge." })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: alpha.proposal.id })
      });
      const meeting = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "text", target: "# HTTP Meeting Notes\n\nHTTP Meeting Notes discuss HTTP Project Alpha milestones." })
      });
      await json(`${running.url}/api/review/update`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          proposalId: meeting.proposal.id,
          path: "http-meeting-notes.md",
          content: "# HTTP Meeting Notes\n\nHTTP Meeting Notes discuss HTTP Project Alpha milestones."
        })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: meeting.proposal.id })
      });

      const result = await json<{
        created: boolean;
        suggestions: Array<{ path: string; targets: Array<{ title: string; path: string }> }>;
        proposal: { changes: Array<{ type: string; path: string; content: string }> };
      }>(`${running.url}/api/links/propose`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });

      expect(result.created).toBe(true);
      expect(result.suggestions).toEqual([{
        path: "http-meeting-notes.md",
        title: "HTTP Meeting Notes",
        targets: [{ path: "http-project-alpha.md", title: "HTTP Project Alpha" }]
      }]);
      expect(result.proposal.changes[0].type).toBe("update_page");
      expect(result.proposal.changes[0].content).toContain("[[HTTP Project Alpha]]");
    } finally {
      await running.close();
    }
  });

  test("serves local APIs and the web workbench", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0, defaultVault: vault });
    try {
      const health = await json<{ ok: boolean; name: string; defaultVault: string }>(`${running.url}/api/health`);
      expect(health).toEqual({ ok: true, name: "Notva", defaultVault: vault });

      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });

      const ingest = await json<{ source: { id: string; title: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Server Note\n\nNotva serves a local web workbench and links to [[Linked Note]]."
        })
      });

      const sources = await json<{ sources: Array<{ id: string; title: string; kind: string }> }>(
        `${running.url}/api/sources?vault=${encodeURIComponent(vault)}`
      );
      expect(sources.sources.map((source) => `${source.kind}:${source.title}`)).toContain("text:Server Note");

      const source = await json<{ source: { id: string; rawPath: string; originalRef: string }; body: string }>(
        `${running.url}/api/source?vault=${encodeURIComponent(vault)}&id=${encodeURIComponent(ingest.source.id)}`
      );
      expect(source.source.id).toBe(ingest.source.id);
      expect(source.source.rawPath).toContain("/raw/");
      expect(source.source.originalRef).toBe("inline:text");
      expect(source.body).toContain("# Server Note");

      const rawPromotionCandidate = await json<{ source: { id: string; title: string }; proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# HTTP Raw Promote\n\nHTTP source promotion should create a fresh review proposal."
        })
      });
      await json(`${running.url}/api/review/reject`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: rawPromotionCandidate.proposal.id })
      });
      const promotedSource = await json<{
        created: boolean;
        source: { id: string; title: string };
        proposal: { id: string; status: string; sourceId: string; changes: Array<{ path: string; content: string }> };
      }>(`${running.url}/api/source/propose`, {
        method: "POST",
        body: JSON.stringify({ vault, id: rawPromotionCandidate.source.id })
      });
      expect(promotedSource.created).toBe(true);
      expect(promotedSource.source.id).toBe(rawPromotionCandidate.source.id);
      expect(promotedSource.proposal.id).not.toBe(rawPromotionCandidate.proposal.id);
      expect(promotedSource.proposal.status).toBe("pending");
      expect(promotedSource.proposal.sourceId).toBe(rawPromotionCandidate.source.id);
      expect(promotedSource.proposal.changes[0].path).toBe("http-raw-promote.md");
      expect(promotedSource.proposal.changes[0].content).toContain("HTTP source promotion should create a fresh review proposal.");
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: promotedSource.proposal.id })
      });

      await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Linked Note\n\nLinked Note receives graph context."
        })
      });

      const proposals = await json<{
        proposals: Array<{
          id: string;
          changes: Array<{ path: string; title: string; content: string }>;
        }>;
      }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(proposals.proposals).toHaveLength(2);
      expect(proposals.proposals[0].id).toBe(ingest.proposal.id);
      expect(proposals.proposals[0].changes[0].path).toBe("server-note.md");
      expect(proposals.proposals[0].changes[0].title).toBe("Server Note");
      expect(proposals.proposals[0].changes[0].content).toContain("Notva serves a local web workbench");

      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: "all" })
      });

      const query = await json<{ answer: string }>(`${running.url}/api/query`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "local web workbench" })
      });
      expect(query.answer).toContain("Server Note");

      const act = await json<{ output: string; execution: { status: string; actions: unknown[]; summary: string } }>(`${running.url}/api/act`, {
        method: "POST",
        body: JSON.stringify({ vault, task: "Draft a next step for the local web workbench" })
      });
      expect(act.execution.status).toBe("ready");
      expect(act.execution.actions).toEqual([]);
      expect(act.execution.summary).toContain("Reviewed wiki evidence is available");
      expect(act.output).toContain("Evidence");
      expect(act.output).toContain("Execution Plan");
      expect(act.output).toContain("Graph Neighborhoods");

      const status = await json<{
        status: {
          root: string;
          sourceCount: number;
          pageCount: number;
          pendingProposalCount: number;
          lintIssueCount: number;
          actRunCount: number;
          health: string;
          lastActRun?: { task: string };
        };
      }>(`${running.url}/api/status?vault=${encodeURIComponent(vault)}`);
      expect(status.status).toMatchObject({
        root: vault,
        sourceCount: 3,
        pageCount: 3,
        pendingProposalCount: 0,
        lintIssueCount: 0,
        actRunCount: 1,
        health: "ready"
      });
      expect(status.status.lastActRun?.task).toBe("Draft a next step for the local web workbench");

      const context = await json<{
        query: string;
        hits: Array<{ title: string; path: string }>;
        sources: Array<{ id: string; title: string; rawPath: string; originalRef: string }>;
        graph: { neighborhoods: Array<{ node: { label: string }; edges: Array<{ relation: string }> }> };
        instructions: string;
      }>(`${running.url}/api/context`, {
        method: "POST",
        body: JSON.stringify({ vault, query: "local web workbench graph context" })
      });
      expect(context.query).toBe("local web workbench graph context");
      expect(context.hits.map((hit) => hit.title)).toContain("Server Note");
      expect(context.graph.neighborhoods.map((neighborhood) => neighborhood.node.label)).toContain("Server Note");
      expect(context.graph.neighborhoods.flatMap((neighborhood) => neighborhood.edges.map((edge) => edge.relation)))
        .toContain("links_to");
      expect(context.sources.map((source) => source.title)).toContain("Server Note");
      expect(context.sources[0].rawPath).toContain("/raw/");
      expect(context.instructions).toContain("Use reviewed Notva wiki pages first");

      const pages = await json<{ pages: Array<{ title: string }> }>(`${running.url}/api/pages?vault=${encodeURIComponent(vault)}`);
      expect(pages.pages.map((page) => page.title)).toContain("Server Note");

      const lint = await json<{ issues: unknown[] }>(`${running.url}/api/lint?vault=${encodeURIComponent(vault)}`);
      expect(lint.issues).toHaveLength(0);

      const graph = await json<{
        graph: {
          nodes: Array<{ label: string; kind: string }>;
          edges: Array<{ source: string; target: string; relation: string }>;
        };
      }>(`${running.url}/api/graph?vault=${encodeURIComponent(vault)}`);
      expect(graph.graph.nodes.map((node) => `${node.kind}:${node.label}`)).toContain("page:Server Note");
      expect(graph.graph.nodes.map((node) => `${node.kind}:${node.label}`)).toContain("page:Linked Note");
      expect(graph.graph.edges.map((edge) => edge.relation)).toContain("links_to");

      const explanation = await json<{
        node: { label: string };
        neighbors: Array<{ label: string }>;
        edges: Array<{ relation: string }>;
      }>(`${running.url}/api/explain`, {
        method: "POST",
        body: JSON.stringify({ vault, query: "Server Note" })
      });
      expect(explanation.node.label).toBe("Server Note");
      expect(explanation.neighbors.map((node) => node.label)).toContain("Linked Note");
      expect(explanation.edges.map((edge) => edge.relation)).toContain("links_to");

      const path = await json<{
        path: {
          nodes: Array<{ label: string }>;
          edges: Array<{ relation: string }>;
        };
      }>(`${running.url}/api/path`, {
        method: "POST",
        body: JSON.stringify({ vault, from: "Server Note", to: "Linked Note" })
      });
      expect(path.path.nodes.map((node) => node.label)).toEqual(["Server Note", "Linked Note"]);
      expect(path.path.edges.map((edge) => edge.relation)).toEqual(["links_to"]);

      const report = await json<{
        path: string;
        markdown: string;
        analysis: { crossPageLinks: Array<{ sourceLabel: string; targetLabel: string }> };
      }>(`${running.url}/api/report`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      expect(report.path).toContain(".notva/graph-report.md");
      expect(report.markdown).toContain("# Notva Graph Report");
      expect(report.analysis.crossPageLinks.map((link) => `${link.sourceLabel} -> ${link.targetLabel}`))
        .toContain("Server Note -> Linked Note");

      const graphHtml = await json<{
        path: string;
        url: string;
        graph: { nodes: Array<{ label: string }>; edges: Array<{ relation: string }> };
      }>(`${running.url}/api/graph/html`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      expect(graphHtml.path).toContain(".notva/graph.html");
      expect(graphHtml.url).toContain("/api/graph/html?vault=");
      expect(graphHtml.graph.nodes.map((node) => node.label)).toContain("Server Note");
      expect(graphHtml.graph.edges.map((edge) => edge.relation)).toContain("links_to");

      const servedGraphHtml = await fetch(`${running.url}${graphHtml.url}`);
      expect(servedGraphHtml.ok).toBe(true);
      expect(servedGraphHtml.headers.get("content-type")).toContain("text/html");
      const servedGraphHtmlText = await servedGraphHtml.text();
      expect(servedGraphHtmlText).toContain("<title>Notva Graph</title>");
      expect(servedGraphHtmlText).toContain("\"label\":\"Server Note\"");
      expect(servedGraphHtmlText).toContain("\"relation\":\"links_to\"");

      await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Open Note\n\nOpen Note names [[Loose Concept]]."
        })
      });
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: "all" })
      });

      const conceptProposal = await json<{
        created: Array<{ concept: string; proposal: { summary: string } }>;
        skipped: string[];
      }>(`${running.url}/api/concepts/propose`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });
      expect(conceptProposal.created.map((record) => record.concept)).toContain("Loose Concept");
      expect(conceptProposal.created[0].proposal.summary).toContain("Loose Concept");

      const conceptProposals = await json<{ proposals: Array<{ summary: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(conceptProposals.proposals.map((proposal) => proposal.summary)).toContain("Create wiki page for open concept \"Loose Concept\".");

      const rejectCandidate = await json<{ proposal: { id: string; status: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Reject Candidate\n\nThis proposal should be rejected through the API."
        })
      });
      const rejected = await json<{ rejected: 1; proposal: { id: string; status: string } }>(`${running.url}/api/review/reject`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: rejectCandidate.proposal.id })
      });
      expect(rejected.rejected).toBe(1);
      expect(rejected.proposal.status).toBe("rejected");
      const afterReject = await json<{ proposals: Array<{ id: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(afterReject.proposals.map((proposal) => proposal.id)).not.toContain(rejectCandidate.proposal.id);

      const applyCandidate = await json<{ proposal: { id: string; status: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Apply Candidate\n\nThis proposal should be applied one at a time through the API."
        })
      });
      const appliedOne = await json<{ applied: 1; proposal: { id: string; status: string } }>(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: applyCandidate.proposal.id })
      });
      expect(appliedOne.applied).toBe(1);
      expect(appliedOne.proposal.status).toBe("accepted");
      const pagesAfterSingleApply = await json<{ pages: Array<{ title: string }> }>(`${running.url}/api/pages?vault=${encodeURIComponent(vault)}`);
      expect(pagesAfterSingleApply.pages.map((page) => page.title)).toContain("Apply Candidate");
      const afterSingleApply = await json<{ proposals: Array<{ id: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(afterSingleApply.proposals.map((proposal) => proposal.id)).not.toContain(applyCandidate.proposal.id);

      const editCandidate = await json<{ proposal: { id: string; changes: Array<{ path: string }> } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Edit Candidate\n\nThis proposal should be edited through the API."
        })
      });
      const editedContent = "# Edited Candidate\n\nThis edited body should be applied through the API.";
      const edited = await json<{ proposal: { id: string; changes: Array<{ title: string; content: string }> } }>(`${running.url}/api/review/update`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          proposalId: editCandidate.proposal.id,
          path: editCandidate.proposal.changes[0].path,
          content: editedContent
        })
      });
      expect(edited.proposal.changes[0].title).toBe("Edited Candidate");
      expect(edited.proposal.changes[0].content).toBe(editedContent);
      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: editCandidate.proposal.id })
      });
      const editedQuery = await json<{ answer: string }>(`${running.url}/api/query`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "edited body applied" })
      });
      expect(editedQuery.answer).toContain("Edited Candidate");

      const savedPage = await json<{ page: { path: string; title: string; body: string } }>(`${running.url}/api/page`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          path: "server-note.md",
          body: "# Server Note Edited\n\nThe web workbench can save edited wiki pages."
        })
      });
      expect(savedPage.page.path).toBe("server-note.md");
      expect(savedPage.page.title).toBe("Server Note Edited");
      expect(savedPage.page.body).toContain("save edited wiki pages");

      const editedPageQuery = await json<{ answer: string }>(`${running.url}/api/query`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "save edited wiki pages" })
      });
      expect(editedPageQuery.answer).toContain("Server Note Edited");

      const apiNotes = join(vault, "api-notes");
      await mkdir(join(apiNotes, "nested"), { recursive: true });
      await writeFile(join(apiNotes, "alpha.md"), "# API Directory Alpha\n\nThe HTTP API should ingest directory alpha.", "utf8");
      await writeFile(join(apiNotes, "nested", "beta.txt"), "# API Directory Beta\n\nThe HTTP API should ingest directory beta.", "utf8");
      const directoryIngest = await json<{
        results: Array<{ proposal: { changes: Array<{ title: string }> } }>;
        skipped: Array<{ reason: string }>;
      }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({ vault, kind: "directory", target: apiNotes })
      });
      expect(directoryIngest.results.map((result) => result.proposal.changes[0].title)).toEqual([
        "API Directory Alpha",
        "API Directory Beta"
      ]);

      const home = await fetch(running.url);
      const homeText = await home.text();
      expect(homeText).toContain("Notva");
      expect(homeText).toContain("本地知识库工作台");

      const styles = await fetch(`${running.url}/styles.css`);
      expect(await styles.text()).toContain(".workspace");

      const script = await fetch(`${running.url}/app.js`);
      const scriptText = await script.text();
      expect(scriptText).toContain("fetchJson");
      expect(scriptText).toContain("知识库路径不能为空。");
      expect(scriptText).toContain("/api/context");
    } finally {
      await running.close();
    }
  });
});
