import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { exportGraphJson, rebuildGraph } from "./graph.js";
import { ingestDirectory, ingestSource } from "./ingest.js";
import { initVault } from "./init.js";
import { queryVault } from "./query.js";
import { applyProposal, listPendingProposals, rejectProposal, updateProposalChange } from "./review.js";

const roots: string[] = [];
const servers: Server[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "notva-flow-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("ingest/review/query", () => {
  test("captures a file, creates a pending proposal, applies it, and queries the wiki", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "article.md");
    await writeFile(sourcePath, "# Retrieval Assisted Action\n\nNotva searches the wiki before executing user tasks.", "utf8");

    const ingest = await ingestSource({ root, target: sourcePath });

    expect(ingest.source.title).toBe("article");
    expect(ingest.proposal.status).toBe("pending");
    expect(await listPendingProposals({ root })).toHaveLength(1);

    const queryBeforeReview = await queryVault({ root, question: "retrieval action" });
    expect(queryBeforeReview.hits).toHaveLength(0);

    await applyProposal({ root, proposalId: ingest.proposal.id });

    const wikiPage = await readFile(join(root, "wiki", ingest.proposal.changes[0].path), "utf8");
    expect(wikiPage).toContain("Retrieval Assisted Action");
    expect(wikiPage).toContain(ingest.source.id);

    const result = await queryVault({ root, question: "retrieval action" });
    expect(result.hits[0]?.title).toContain("Retrieval Assisted Action");
    expect(result.answer).toContain("Retrieval Assisted Action");
  });

  test("keeps raw URL HTML while proposing readable wiki text", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const url = await serveHtml(`<!doctype html>
      <html>
        <head>
          <title>URL Knowledge Article</title>
          <style>body { color: red; }</style>
          <script>window.noisy = true;</script>
        </head>
        <body>
          <h1>URL Knowledge Article</h1>
          <p>Notva should extract readable web text &amp; preserve the raw source.</p>
          <p>Graph-aware notes stay useful after review.</p>
        </body>
      </html>`);

    const ingest = await ingestSource({ root, target: url });

    expect(ingest.source.kind).toBe("url");
    expect(ingest.source.title).toBe("URL Knowledge Article");
    expect(ingest.proposal.changes[0].title).toBe("URL Knowledge Article");
    expect(ingest.proposal.changes[0].content).toContain("Notva should extract readable web text & preserve the raw source.");
    expect(ingest.proposal.changes[0].content).toContain("Graph-aware notes stay useful after review.");
    expect(ingest.proposal.changes[0].content).not.toContain("window.noisy");
    expect(ingest.proposal.changes[0].content).not.toContain("body { color: red; }");

    const raw = await readFile(ingest.source.rawPath, "utf8");
    expect(raw).toContain("<script>window.noisy = true;</script>");
    expect(raw).toContain("<style>body { color: red; }</style>");
  });

  test("deduplicates repeated content without reopening accepted proposals", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const sourcePath = join(root, "repeat.md");
    await writeFile(sourcePath, "# Repeat Note\n\nNotva should not reopen accepted proposals for identical content.", "utf8");

    const first = await ingestSource({ root, target: sourcePath });
    await applyProposal({ root, proposalId: first.proposal.id });

    const duplicate = await ingestSource({ root, target: sourcePath });

    expect(duplicate.source.id).toBe(first.source.id);
    expect(duplicate.proposal.id).toBe(first.proposal.id);
    expect(duplicate.proposal.status).toBe("accepted");
    expect(await listPendingProposals({ root })).toHaveLength(0);
  });

  test("adds related wiki links to new proposals when source text mentions reviewed pages", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const alpha = await ingestSource({
      root,
      kind: "text",
      target: "# Project Alpha\n\nProject Alpha is the reviewed planning page."
    });
    await applyProposal({ root, proposalId: alpha.proposal.id });

    const meeting = await ingestSource({
      root,
      kind: "text",
      target: "# Meeting Notes\n\nThese notes discuss Project Alpha milestones and do not mention Project Beta."
    });

    expect(meeting.proposal.changes[0].content).toContain("## Related Wiki Pages");
    expect(meeting.proposal.changes[0].content).toContain("- [[Project Alpha]] (project-alpha.md)");
    expect(meeting.proposal.changes[0].content).not.toContain("[[Meeting Notes]]");
    expect(meeting.proposal.changes[0].content).not.toContain("[[Project Beta]]");

    await applyProposal({ root, proposalId: meeting.proposal.id });
    await rebuildGraph({ root });
    const graph = await exportGraphJson({ root });
    expect(graph.edges).toContainEqual({
      source: "page:meeting-notes.md",
      target: "page:project-alpha.md",
      relation: "links_to",
      confidence: "EXTRACTED",
      evidence: "[[Project Alpha]]"
    });
  });

  test("recursively ingests supported text files from a directory", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const notesDir = join(root, "notes");
    await mkdir(join(notesDir, "nested"), { recursive: true });
    await writeFile(join(notesDir, "alpha.md"), "# Directory Alpha\n\nAlpha should become a proposal.", "utf8");
    await writeFile(join(notesDir, "nested", "beta.txt"), "# Directory Beta\n\nBeta should also become a proposal.", "utf8");
    await writeFile(join(notesDir, "nested", "ignore.bin"), "binary-ish data", "utf8");

    const batch = await ingestDirectory({ root, target: notesDir });

    expect(batch.results).toHaveLength(2);
    expect(batch.results.map((result) => result.proposal.changes[0].title)).toEqual([
      "Directory Alpha",
      "Directory Beta"
    ]);
    expect(batch.skipped.map((entry) => entry.reason)).toContain("unsupported_extension");
    expect(await listPendingProposals({ root })).toHaveLength(2);

    for (const result of batch.results) {
      await applyProposal({ root, proposalId: result.proposal.id });
    }

    const alphaQuery = await queryVault({ root, question: "Alpha proposal" });
    const betaQuery = await queryVault({ root, question: "Beta proposal" });
    expect(alphaQuery.hits.map((hit) => hit.title)).toContain("Directory Alpha");
    expect(betaQuery.hits.map((hit) => hit.title)).toContain("Directory Beta");
  });

  test("recursively ingests code notes and chat logs from a directory", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const notesDir = join(root, "mixed-notes");
    await mkdir(join(notesDir, "sessions"), { recursive: true });
    await writeFile(join(notesDir, "workflow.ts"), [
      "export function retrieveBeforeAct() {",
      "  return 'Retrieve Notva wiki context before agent actions.';",
      "}"
    ].join("\n"), "utf8");
    await writeFile(join(notesDir, "sessions", "chat.json"), JSON.stringify([
      { role: "user", content: "How should Notva handle chat logs?" },
      { role: "assistant", content: "Turn chat logs into reviewable wiki proposals." }
    ], null, 2), "utf8");
    await writeFile(join(notesDir, "sessions", "ops.log"), [
      "2026-06-03 Notva import logs",
      "Operational notes should be available for review."
    ].join("\n"), "utf8");
    await writeFile(join(notesDir, "image.png"), "not really an image", "utf8");

    const batch = await ingestDirectory({ root, target: notesDir });

    expect(batch.results).toHaveLength(3);
    expect(batch.results.map((result) => result.source.originalRef).sort()).toEqual([
      join(notesDir, "sessions", "chat.json"),
      join(notesDir, "sessions", "ops.log"),
      join(notesDir, "workflow.ts")
    ].sort());
    expect(batch.skipped).toEqual([{ path: join(notesDir, "image.png"), reason: "unsupported_extension" }]);

    const proposals = batch.results.map((result) => result.proposal.changes[0]);
    expect(proposals.map((proposal) => proposal.title).sort()).toEqual([
      "chat",
      "ops",
      "workflow"
    ]);
    const chatProposal = proposals.find((proposal) => proposal.path === "chat.md");
    expect(chatProposal?.content).toContain("## Conversation");
    expect(chatProposal?.content).toContain("**user:** How should Notva handle chat logs?");
    expect(chatProposal?.content).toContain("**assistant:** Turn chat logs into reviewable wiki proposals.");
    expect(chatProposal?.content).not.toContain("\"role\"");
    expect(proposals.find((proposal) => proposal.path === "workflow.md")?.content)
      .toContain("Retrieve Notva wiki context before agent actions.");
    expect(proposals.find((proposal) => proposal.path === "ops.md")?.content)
      .toContain("Operational notes should be available for review.");
  });

  test("rejects a pending proposal without writing wiki content", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Rejected Note\n\nThis proposal should stay out of the reviewed wiki."
    });

    const rejected = await rejectProposal({ root, proposalId: ingest.proposal.id });

    expect(rejected.status).toBe("rejected");
    expect(await listPendingProposals({ root })).toHaveLength(0);
    await expect(applyProposal({ root, proposalId: ingest.proposal.id })).rejects.toThrow("Proposal is not pending");

    const result = await queryVault({ root, question: "rejected note" });
    expect(result.hits).toHaveLength(0);
  });

  test("updates pending proposal content before applying it", async () => {
    const root = await tempRoot();
    await initVault({ root });
    const ingest = await ingestSource({
      root,
      kind: "text",
      target: "# Draft Note\n\nThis draft should be edited before review."
    });

    const editedContent = [
      "---",
      "title: \"Edited Note\"",
      "---",
      "",
      "# Edited Note",
      "",
      "This edited content should be the final wiki page."
    ].join("\n");

    const updated = await updateProposalChange({
      root,
      proposalId: ingest.proposal.id,
      path: ingest.proposal.changes[0].path,
      content: editedContent
    });

    expect(updated.status).toBe("pending");
    expect(updated.changes[0].title).toBe("Edited Note");
    expect(updated.changes[0].content).toBe(editedContent);

    await applyProposal({ root, proposalId: ingest.proposal.id });

    const wikiPage = await readFile(join(root, "wiki", ingest.proposal.changes[0].path), "utf8");
    expect(wikiPage).toContain("# Edited Note");
    expect(wikiPage).toContain("This edited content should be the final wiki page.");

    const result = await queryVault({ root, question: "final wiki page" });
    expect(result.hits[0]?.title).toBe("Edited Note");
  });
});

async function serveHtml(html: string): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");
  return `http://127.0.0.1:${address.port}/article`;
}
