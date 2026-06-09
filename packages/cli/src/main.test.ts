import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { main } from "./main.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-cli-"));
  roots.push(root);
  return root;
}

async function capture(argv: string[]): Promise<{ stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = vi.spyOn(console, "log").mockImplementation((message) => stdout.push(String(message)));
  const err = vi.spyOn(console, "error").mockImplementation((message) => stderr.push(String(message)));
  try {
    await main(argv);
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return { stdout, stderr };
}

async function seedAppliedPage(root: string, title: string, body: string): Promise<void> {
  expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
  expect((await capture(["ingest", "--text", `# ${title}\n\n${body}`, "--vault", root])).stdout[0])
    .toContain("Created proposal");
  expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("notva CLI", () => {
  test("uses a user-directory default vault when no vault is provided", async () => {
    const home = await tempRoot();
    const cwd = await tempRoot();
    const previousHome = process.env.NOTVA_HOME;
    const previousCwd = process.cwd();
    process.env.NOTVA_HOME = home;
    process.chdir(cwd);
    try {
      const defaultRoot = join(home, "Notva");
      expect((await capture(["init"])).stdout[0]).toContain(`Initialized Notva vault at ${defaultRoot}`);
      expect((await capture(["ingest", "--text", "# Home Default Vault\n\nDefault vaults should live under the user directory."])).stdout[0])
        .toContain("Created proposal");
      expect((await capture(["review", "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");
      expect((await capture(["query", "user directory"])).stdout[0]).toContain("Home Default Vault");

      const serve = await capture(["serve", "--port", "0"]);
      expect(serve.stdout[0]).toContain(`vault: ${defaultRoot}`);

      await expect(readFile(join(cwd, ".notva", "config.json"), "utf8")).rejects.toThrow();
      expect(await readFile(join(defaultRoot, ".notva", "config.json"), "utf8")).toContain("\"version\": 1");
    } finally {
      if (previousHome === undefined) {
        delete process.env.NOTVA_HOME;
      } else {
        process.env.NOTVA_HOME = previousHome;
      }
      process.chdir(previousCwd);
    }
  });

  test("runs init, ingest, review, query, and lint against a vault", async () => {
    const root = await tempRoot();
    const source = join(root, "source.md");
    await writeFile(source, "# Local Knowledge Vault\n\nNotva keeps durable Markdown wiki pages.", "utf8");

    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture(["ingest", source, "--vault", root])).stdout[0]).toContain("Created proposal");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("pending proposal");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied");

    const wikiPage = await readFile(join(root, "wiki", "local-knowledge-vault.md"), "utf8");
    expect(wikiPage).toContain("Notva keeps durable Markdown wiki pages");

    expect((await capture(["query", "durable markdown", "--vault", root])).stdout[0]).toContain("Local Knowledge Vault");
    expect((await capture(["act", "Draft next step for durable markdown", "--vault", root])).stdout[0]).toContain("Evidence");
    expect((await capture(["lint", "--vault", root])).stdout[0]).toContain("No lint issues");
  });

  test("shows source evidence while reviewing pending proposals", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Review Evidence\n\nCLI review cards should include source evidence.",
      "--vault",
      root
    ]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();

    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain(`source ${sourceId}`);
    expect(review.stdout[0]).toContain("original inline:text");
    expect(review.stdout[0]).toContain("CLI review cards should include source evidence");
  });

  test("creates a reviewable proposal from a query result", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Query Proposal", "CLI query proposals should become reviewed wiki knowledge after approval.");

    const output = await capture(["query", "CLI query proposals", "--propose", "--vault", root]);

    expect(output.stdout[0]).toContain("Created query proposal");
    expect(output.stdout[0]).toContain("Query Result: CLI query proposals");
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("Query Result: CLI query proposals");
    expect(review.stdout[0]).toContain("pending proposal");
  });

  test("shows source provenance for query hits", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Query Provenance\n\nCLI query output should cite the raw source behind each reviewed hit.",
      "--vault",
      root
    ]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");

    const output = await capture(["query", "raw source behind", "--vault", root]);

    expect(output.stdout[0]).toContain("CLI Query Provenance");
    expect(output.stdout[0]).toContain(`sources: ${sourceId}`);
    expect(output.stdout[0]).toContain("original inline:text");
  });

  test("ingests supported files from a directory", async () => {
    const root = await tempRoot();
    const notes = join(root, "notes");
    await mkdir(join(notes, "nested"), { recursive: true });
    await writeFile(join(notes, "alpha.md"), "# CLI Directory Alpha\n\nDirectory ingestion should batch alpha.", "utf8");
    await writeFile(join(notes, "nested", "beta.txt"), "# CLI Directory Beta\n\nDirectory ingestion should batch beta.", "utf8");

    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const output = await capture(["ingest", notes, "--vault", root]);

    expect(output.stdout[0]).toContain("Created 2 proposal");
    expect(output.stdout[0]).toContain("directory");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("CLI Directory Alpha");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("CLI Directory Beta");
  });

  test("starts the local web workbench", async () => {
    const root = await tempRoot();
    const output = await capture(["serve", "--vault", root, "--port", "0"]);

    expect(output.stdout[0]).toContain("Notva web workbench");
    expect(output.stdout[0]).toContain("http://127.0.0.1:");
  });

  test("rejects pending proposals from the CLI review flow", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture(["ingest", "--text", "# Reject Me\n\nThis page should not enter the wiki.", "--vault", root]);
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(proposalId).toBeTruthy();

    const reject = await capture(["review", "--vault", root, "--reject", String(proposalId)]);
    expect(reject.stdout[0]).toContain(`Rejected proposal ${proposalId}`);
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("No pending proposals");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 0 proposal");
  });

  test("updates pending proposals from a content file before applying them", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture(["ingest", "--text", "# CLI Edit Draft\n\nThis draft should change before review.", "--vault", root]);
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(proposalId).toBeTruthy();

    const editedPath = join(root, "edited.md");
    await writeFile(editedPath, "# CLI Edit Final\n\nThis edited Markdown should be applied from the CLI.", "utf8");

    const update = await capture([
      "review",
      "--vault", root,
      "--update", String(proposalId),
      "--path", "cli-edit-draft.md",
      "--content-file", editedPath
    ]);
    expect(update.stdout[0]).toContain(`Updated proposal ${proposalId}`);
    expect(update.stdout[0]).toContain("cli-edit-draft.md");

    expect((await capture(["review", "--vault", root, "--apply", String(proposalId)])).stdout[0])
      .toContain(`Applied proposal ${proposalId}`);

    const wikiPage = await readFile(join(root, "wiki", "cli-edit-draft.md"), "utf8");
    expect(wikiPage).toContain("# CLI Edit Final");
    expect(wikiPage).toContain("This edited Markdown should be applied from the CLI.");
  });

  test("lists applied wiki pages from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Page", "This applied page should be listed.");

    const list = await capture(["page", "list", "--vault", root]);

    expect(list.stdout[0]).toContain("cli-page.md");
    expect(list.stdout[0]).toContain("CLI Page");
  });

  test("shows applied wiki page bodies from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Page", "This applied page should be readable.");

    const show = await capture(["page", "show", "cli-page.md", "--vault", root]);

    expect(show.stdout[0]).toContain("# CLI Page");
    expect(show.stdout[0]).toContain("This applied page should be readable.");
  });

  test("saves applied wiki page edits from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Page", "This applied page should change.");
    const editedPath = join(root, "edited-page.md");
    await writeFile(editedPath, "# CLI Page Edited\n\nSaved content should update the wiki index.", "utf8");

    const save = await capture(["page", "save", "cli-page.md", "--content-file", editedPath, "--vault", root]);

    expect(save.stdout[0]).toContain("Saved page cli-page.md");
    const wikiPage = await readFile(join(root, "wiki", "cli-page.md"), "utf8");
    expect(wikiPage).toContain("# CLI Page Edited");
    expect(wikiPage).toContain("Saved content should update the wiki index.");
    expect((await capture(["query", "saved content", "--vault", root])).stdout[0]).toContain("CLI Page Edited");
  });

  test("lists and shows preserved raw sources from the CLI", async () => {
    const root = await tempRoot();
    const source = join(root, "cli-source.md");
    await writeFile(source, "# CLI Source\n\nRaw source content should be inspectable.", "utf8");
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture(["ingest", source, "--vault", root]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();

    const list = await capture(["source", "list", "--vault", root]);
    expect(list.stdout[0]).toContain(String(sourceId));
    expect(list.stdout[0]).toContain("cli-source");
    expect(list.stdout[0]).toContain("file");

    const show = await capture(["source", "show", String(sourceId), "--vault", root]);
    expect(show.stdout[0]).toContain(`# ${sourceId}: cli source`);
    expect(show.stdout[0]).toContain(source);
    expect(show.stdout[0]).toContain("# CLI Source");
    expect(show.stdout[0]).toContain("Raw source content should be inspectable.");
  });

  test("promotes preserved raw sources from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Promote Source\n\nCLI source promotion should reopen a reviewable wiki proposal.",
      "--vault",
      root
    ]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();
    expect(proposalId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--reject", String(proposalId)])).stdout[0])
      .toContain(`Rejected proposal ${proposalId}`);

    const promote = await capture(["source", "propose", String(sourceId), "--vault", root]);

    expect(promote.stdout[0]).toContain("Created proposal");
    expect(promote.stdout[0]).toContain(String(sourceId));
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("CLI Promote Source");
    expect(review.stdout[0]).toContain("cli-promote-source.md");
  });

  test("promotes uncovered raw sources from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const covered = await capture(["ingest", "--text", "# CLI Covered Source\n\nCovered source already has a page.", "--vault", root]);
    const coveredProposalId = covered.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(coveredProposalId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--apply", String(coveredProposalId)])).stdout[0])
      .toContain(`Applied proposal ${coveredProposalId}`);
    const rejected = await capture(["ingest", "--text", "# CLI Rejected Source\n\nRejected source should be reopened.", "--vault", root]);
    const rejectedProposalId = rejected.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(rejectedProposalId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--reject", String(rejectedProposalId)])).stdout[0])
      .toContain(`Rejected proposal ${rejectedProposalId}`);
    expect((await capture(["ingest", "--text", "# CLI Pending Source\n\nPending source should be reused.", "--vault", root])).stdout[0])
      .toContain("Created proposal");

    const promote = await capture(["source", "propose", "--uncovered", "--vault", root]);

    expect(promote.stdout[0]).toContain("Proposed 2 uncovered source");
    expect(promote.stdout[0]).toContain("1 created");
    expect(promote.stdout[0]).toContain("1 reused pending");
    expect(promote.stdout[0]).toContain("1 skipped covered");
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("CLI Rejected Source");
    expect(review.stdout[0]).toContain("CLI Pending Source");
    expect(review.stdout[0]).not.toContain("CLI Covered Source");
  });

  test("proposes missing wiki links from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Project Alpha", "CLI Project Alpha is reviewed knowledge.");
    const meeting = await capture([
      "ingest",
      "--text",
      "# CLI Meeting Notes\n\nCLI Meeting Notes discuss CLI Project Alpha milestones.",
      "--vault",
      root
    ]);
    const meetingProposalId = meeting.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(meetingProposalId).toBeTruthy();
    expect((await capture([
      "review",
      "--vault", root,
      "--update", String(meetingProposalId),
      "--path", "cli-meeting-notes.md",
      "--content", "# CLI Meeting Notes\n\nCLI Meeting Notes discuss CLI Project Alpha milestones."
    ])).stdout[0]).toContain(`Updated proposal ${meetingProposalId}`);
    expect((await capture(["review", "--vault", root, "--apply", String(meetingProposalId)])).stdout[0])
      .toContain(`Applied proposal ${meetingProposalId}`);

    const output = await capture(["links", "propose", "--vault", root]);

    expect(output.stdout[0]).toContain("Created missing-link proposal");
    expect(output.stdout[0]).toContain("1 page");
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("Add missing wiki links");
    expect(review.stdout[0]).toContain("cli-meeting-notes.md");
  });

  test("prints a context pack for downstream agent work", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Context\n\nContext packs should give agents reviewed evidence before execution.",
      "--vault",
      root
    ]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");

    const markdown = await capture(["context", "CLI Context execution", "--vault", root]);

    expect(markdown.stdout[0]).toContain("# Notva Context Pack");
    expect(markdown.stdout[0]).toContain("CLI Context (cli-context.md)");
    expect(markdown.stdout[0]).toContain(`sources: ${sourceId} (inline:text)`);
    expect(markdown.stdout[0]).toContain("## Sources");
    expect(markdown.stdout[0]).toContain("## Graph Neighborhoods");
    expect(markdown.stdout[0]).toContain("## Suggested Actions");
    expect(markdown.stdout[0]).toContain("No immediate Notva maintenance actions.");
    expect(markdown.stdout[0]).toContain("## Execution Guidance");

    const json = await capture(["context", "CLI Context execution", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);
    expect(parsed.query).toBe("CLI Context execution");
    expect(parsed.hits[0].path).toBe("cli-context.md");
    expect(parsed.hits[0].sources[0].id).toBe(sourceId);
    expect(parsed.sources[0].originalRef).toBe("inline:text");
    expect(parsed.actions).toEqual([]);
    expect(parsed.instructions).toContain("Use reviewed Notva wiki pages first");
  });

  test("shows and saves vault rules from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");

    const show = await capture(["rules", "show", "--vault", root]);
    expect(show.stdout[0]).toContain("Notva Wiki Maintenance Rules");

    const rulesPath = join(root, "rules.md");
    await writeFile(rulesPath, "# CLI Rules\n\n- Keep CLI saved rules visible in context packs.", "utf8");
    const save = await capture(["rules", "save", "--content-file", rulesPath, "--vault", root]);
    expect(save.stdout[0]).toContain("Saved vault rules");
    expect(save.stdout[0]).toContain("notva.md");

    const context = await capture(["context", "CLI saved rules", "--json", "--vault", root]);
    const parsed = JSON.parse(context.stdout[0]);
    expect(parsed.rules).toContain("CLI Rules");
    expect(parsed.rules).toContain("Keep CLI saved rules visible");
  });

  test("prints raw source matches in context packs before agent work", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Raw Context\n\nRaw-only Aurora evidence should be available before agent execution.",
      "--vault",
      root
    ]);
    const sourceId = ingest.stdout[0].match(/from source ([a-f0-9]+)/)?.[1];
    expect(sourceId).toBeTruthy();

    const markdown = await capture(["context", "Aurora evidence", "--vault", root]);

    expect(markdown.stdout[0]).toContain("No reviewed wiki evidence matched this query.");
    expect(markdown.stdout[0]).toContain("## Raw Source Evidence");
    expect(markdown.stdout[0]).toContain(`${sourceId}: CLI Raw Context`);
    expect(markdown.stdout[0]).toContain("Raw-only Aurora evidence");
    expect(markdown.stdout[0]).toContain("## Suggested Actions");
    expect(markdown.stdout[0]).toContain(`notva source propose --uncovered --vault ${root}`);

    const json = await capture(["context", "Aurora evidence", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);
    expect(parsed.sourceHits[0].source.id).toBe(sourceId);
    expect(parsed.sourceHits[0].snippet).toContain("Aurora evidence");
    expect(parsed.actions.map((action: { command: string }) => action.command)).toContain(`notva source propose --uncovered --vault ${root}`);
  });

  test("prints structured execution plans for act json output", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    await capture([
      "ingest",
      "--text",
      "# CLI Act Raw\n\nRaw-only Vega instruction should produce maintenance actions before execution.",
      "--vault",
      root
    ]);

    const json = await capture(["act", "Use Vega instruction", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);

    expect(parsed.task).toBe("Use Vega instruction");
    expect(parsed.execution.status).toBe("needs_maintenance");
    expect(parsed.execution.actions.map((action: { command: string }) => action.command))
      .toContain(`notva source propose --uncovered --vault ${root}`);
    expect(parsed.output).toContain("## Execution Plan");
  });

  test("prints a vault status summary from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Status Page", "Status should count reviewed pages.");
    await capture([
      "ingest",
      "--text",
      "# CLI Pending Status\n\nStatus should count pending proposals.",
      "--vault",
      root
    ]);
    await capture(["act", "CLI status summary", "--vault", root]);

    const status = await capture(["status", "--vault", root]);

    expect(status.stdout[0]).toContain("Vault Status");
    expect(status.stdout[0]).toContain("health needs_review");
    expect(status.stdout[0]).toContain("sources 2");
    expect(status.stdout[0]).toContain("pages 1");
    expect(status.stdout[0]).toContain("pending proposals 1");
    expect(status.stdout[0]).toContain("lint issues 2");
    expect(status.stdout[0]).toContain("pending_proposal 1");
    expect(status.stdout[0]).toContain("source_without_page 1");
    expect(status.stdout[0]).toContain("act runs 1");
    expect(status.stdout[0]).toContain("last act CLI status summary");
  });

  test("prints doctor guidance for onboarding and release smoke checks", async () => {
    const root = await tempRoot();

    const missing = await capture(["doctor", "--vault", root]);
    expect(missing.stdout[0]).toContain("# Notva Doctor");
    expect(missing.stdout[0]).toContain(`vault ${root}`);
    expect(missing.stdout[0]).toContain("initialized no");
    expect(missing.stdout[0]).toContain(`next notva init ${root}`);

    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture([
      "ingest",
      "--text",
      "# CLI Doctor Pending\n\nDoctor should surface review work before release.",
      "--vault",
      root
    ])).stdout[0]).toContain("Created proposal");

    const pending = await capture(["doctor", "--vault", root]);
    expect(pending.stdout[0]).toContain("initialized yes");
    expect(pending.stdout[0]).toContain("health needs_review");
    expect(pending.stdout[0]).toContain("pending proposals 1");
    expect(pending.stdout[0]).toContain(`next notva review --vault ${root}`);

    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");
    expect((await capture(["graph", "export", "--vault", root])).stdout[0]).toContain("Exported graph");
    expect((await capture(["graph", "html", "--vault", root])).stdout[0]).toContain("Exported graph HTML");
    expect((await capture(["report", "--vault", root])).stdout[0]).toContain("Wrote graph report");

    const ready = await capture(["doctor", "--vault", root]);
    expect(ready.stdout[0]).toContain("health ready");
    expect(ready.stdout[0]).toContain("graph json yes");
    expect(ready.stdout[0]).toContain("graph html yes");
    expect(ready.stdout[0]).toContain("graph report yes");
    expect(ready.stdout[0]).toContain("next ready for local use");
  });

  test("lists and shows persisted act runs from the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Act History", "Persisted act runs should be visible later.");

    const json = await capture(["act", "Review CLI act history", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);
    const runId = parsed.run.id;

    const list = await capture(["act", "list", "--vault", root]);
    expect(list.stdout[0]).toContain(runId);
    expect(list.stdout[0]).toContain("Review CLI act history");
    expect(list.stdout[0]).toContain("ready");
    expect(list.stdout[0]).toContain("evidence 1");

    const show = await capture(["act", "show", runId, "--vault", root]);
    expect(show.stdout[0]).toContain("# Notva Act Run");
    expect(show.stdout[0]).toContain("Review CLI act history");
    expect(show.stdout[0]).toContain("CLI Act History");
    expect(show.stdout[0]).toContain("## Execution Plan");
  });

  test("creates a reviewable proposal from a persisted act run in the CLI", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Act Proposal", "Act proposal output should return to review.");
    const json = await capture(["act", "Summarize CLI act proposal", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);
    const runId = parsed.run.id;

    const propose = await capture(["act", "propose", runId, "--vault", root]);

    expect(propose.stdout[0]).toContain("Created proposal");
    expect(propose.stdout[0]).toContain(runId);
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("Act Result: Summarize CLI act proposal");
    expect(review.stdout[0]).toContain("act-result-summarize-cli-act-proposal.md");
  });

  test("creates a reviewable proposal directly from an act command", async () => {
    const root = await tempRoot();
    await seedAppliedPage(root, "CLI Act Inline Proposal", "Inline act proposals should return to review.");

    const act = await capture(["act", "Summarize CLI act inline proposal", "--propose", "--vault", root]);

    expect(act.stdout[0]).toContain("Created proposal");
    expect(act.stdout[0]).toContain("from act run");
    const review = await capture(["review", "--vault", root]);
    expect(review.stdout[0]).toContain("Act Result: Summarize CLI act inline proposal");
    expect(review.stdout[0]).toContain("act-result-summarize-cli-act-inline-proposal.md");
  });

  test("can run suggested act maintenance actions from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Act Run Source\n\nCLI act run-actions should create a fresh proposal.",
      "--vault",
      root
    ]);
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(proposalId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--reject", String(proposalId)])).stdout[0])
      .toContain(`Rejected proposal ${proposalId}`);

    const json = await capture(["act", "CLI act run-actions", "--run-actions", "--json", "--vault", root]);
    const parsed = JSON.parse(json.stdout[0]);

    expect(parsed.actionResults.map((action: { kind: string }) => action.kind)).toContain("source_propose_uncovered");
    expect(parsed.output).toContain("## Maintenance Actions Run");
    expect(parsed.output).toContain("Proposed 1 uncovered source");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("CLI Act Run Source");
  });

  test("runs allowlisted maintenance actions from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture([
      "ingest",
      "--text",
      "# CLI Action Raw\n\nCLI action runner should recreate review proposals.",
      "--vault",
      root
    ]);
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(proposalId).toBeTruthy();
    expect((await capture(["review", "--vault", root, "--reject", String(proposalId)])).stdout[0])
      .toContain(`Rejected proposal ${proposalId}`);

    const output = await capture([
      "action",
      "run",
      "--command", `notva source propose --uncovered --vault ${root}`,
      "--vault", root
    ]);

    expect(output.stdout[0]).toContain("Proposed 1 uncovered source");
    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("CLI Action Raw");

    const json = await capture([
      "action",
      "run",
      "--command", `notva review --vault ${root}`,
      "--json",
      "--vault", root
    ]);
    const parsed = JSON.parse(json.stdout[0]);
    expect(parsed.kind).toBe("review");
    expect(parsed.changed).toBe(false);
    expect(parsed.message).toContain("1 pending proposal");
  });

  test("rejects unsupported action-run commands from the CLI", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");

    await expect(main(["action", "run", "--command", "rm -rf /", "--vault", root]))
      .rejects.toThrow("Unsupported Notva maintenance action: rm -rf /");
  });

  test("shows pending proposal change paths and full proposed content", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    const ingest = await capture(["ingest", "--text", "# Show Me\n\nThis proposed page should be inspectable from the CLI.", "--vault", root]);
    const proposalId = ingest.stdout[0].match(/Created proposal ([a-f0-9]+)/)?.[1];
    expect(proposalId).toBeTruthy();

    const list = await capture(["review", "--vault", root]);
    expect(list.stdout[0]).toContain("show-me.md");
    expect(list.stdout[0]).toContain("Show Me");

    const show = await capture(["review", "--vault", root, "--show", String(proposalId)]);
    expect(show.stdout[0]).toContain(`Proposal ${proposalId}`);
    expect(show.stdout[0]).toContain("show-me.md");
    expect(show.stdout[0]).toContain("# Show Me");
    expect(show.stdout[0]).toContain("This proposed page should be inspectable from the CLI.");
  });

  test("exports and queries the knowledge graph", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture(["ingest", "--text", "# Alpha Page\n\nAlpha links to [[Beta Page]].", "--vault", root])).stdout[0])
      .toContain("Created proposal");
    expect((await capture(["ingest", "--text", "# Beta Page\n\nBeta is linked knowledge.", "--vault", root])).stdout[0])
      .toContain("Created proposal");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 2 proposal");

    const graphOutput = await capture(["graph", "export", "--vault", root]);
    expect(graphOutput.stdout[0]).toContain("Exported graph");

    const graphJson = await readFile(join(root, ".notva", "graph.json"), "utf8");
    expect(graphJson).toContain("\"schemaVersion\": 1");
    expect(graphJson).toContain("\"relation\": \"links_to\"");

    const graphHtmlOutput = await capture(["graph", "html", "--vault", root]);
    expect(graphHtmlOutput.stdout[0]).toContain("Exported graph HTML");

    const graphHtml = await readFile(join(root, ".notva", "graph.html"), "utf8");
    expect(graphHtml).toContain("<title>Notva Graph</title>");
    expect(graphHtml).toContain("\"label\":\"Alpha Page\"");
    expect(graphHtml).toContain("\"relation\":\"links_to\"");

    const explainOutput = await capture(["explain", "Alpha Page", "--vault", root]);
    expect(explainOutput.stdout[0]).toContain("Alpha Page");
    expect(explainOutput.stdout[0]).toContain("Alpha Page (page) --links_to--> Beta Page (page)");
    expect(explainOutput.stdout[0]).toContain("Alpha Page (source) --supports--> Alpha Page (page)");

    const pathOutput = await capture(["path", "Alpha Page", "Beta Page", "--vault", root]);
    expect(pathOutput.stdout[0]).toContain("Alpha Page --links_to--> Beta Page");

    const reportOutput = await capture(["report", "--vault", root]);
    expect(reportOutput.stdout[0]).toContain("Wrote graph report");

    const graphReport = await readFile(join(root, ".notva", "graph-report.md"), "utf8");
    expect(graphReport).toContain("# Notva Graph Report");
    expect(graphReport).toContain("Alpha Page -> Beta Page");
  });

  test("proposes wiki pages for open concepts", async () => {
    const root = await tempRoot();
    expect((await capture(["init", root])).stdout[0]).toContain("Initialized Notva vault");
    expect((await capture(["ingest", "--text", "# Alpha Page\n\nAlpha mentions [[Loose Concept]].", "--vault", root])).stdout[0])
      .toContain("Created proposal");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");

    const output = await capture(["concepts", "propose", "--vault", root]);
    expect(output.stdout[0]).toContain("Created 1 open concept proposal");
    expect(output.stdout[0]).toContain("Loose Concept");

    expect((await capture(["review", "--vault", root])).stdout[0]).toContain("Loose Concept");
    expect((await capture(["review", "--vault", root, "--apply", "all"])).stdout[0]).toContain("Applied 1 proposal");

    const page = await readFile(join(root, "wiki", "loose-concept.md"), "utf8");
    expect(page).toContain("# Loose Concept");
    expect(page).toContain("[[Alpha Page]]");
  });

  test("installs Codex query-first instructions", async () => {
    const root = await tempRoot();
    const codexHome = await tempRoot();

    const userInstall = await capture(["install", "--platform", "codex", "--codex-home", codexHome, "--vault", root]);
    expect(userInstall.stdout[0]).toContain("Installed Notva Codex instructions");

    const skill = await readFile(join(codexHome, "skills", "notva", "SKILL.md"), "utf8");
    expect(skill).toContain("notva query");
    expect(skill).toContain("If this vault has Notva graph/wiki data");

    const projectInstall = await capture(["install", "--platform", "codex", "--project", "--vault", root]);
    expect(projectInstall.stdout[0]).toContain("Installed Notva Codex instructions");
    expect(projectInstall.stdout[0]).toContain("git add AGENTS.md");

    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- notva:codex:start -->");
    expect(agents).toContain("notva explain");
  });
});
