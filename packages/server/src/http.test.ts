import { mkdtemp, rm } from "node:fs/promises";
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
  test("serves local APIs and the web workbench", async () => {
    const vault = await tempRoot();
    const running = await listenNotvaServer({ port: 0 });
    try {
      const health = await json<{ ok: boolean; name: string }>(`${running.url}/api/health`);
      expect(health).toEqual({ ok: true, name: "Notva" });

      await json(`${running.url}/api/init`, {
        method: "POST",
        body: JSON.stringify({ vault })
      });

      const ingest = await json<{ proposal: { id: string } }>(`${running.url}/api/ingest`, {
        method: "POST",
        body: JSON.stringify({
          vault,
          kind: "text",
          target: "# Server Note\n\nNotva serves a local web workbench."
        })
      });

      const proposals = await json<{ proposals: Array<{ id: string }> }>(`${running.url}/api/proposals?vault=${encodeURIComponent(vault)}`);
      expect(proposals.proposals).toHaveLength(1);
      expect(proposals.proposals[0].id).toBe(ingest.proposal.id);

      await json(`${running.url}/api/review/apply`, {
        method: "POST",
        body: JSON.stringify({ vault, proposalId: "all" })
      });

      const query = await json<{ answer: string }>(`${running.url}/api/query`, {
        method: "POST",
        body: JSON.stringify({ vault, question: "local web workbench" })
      });
      expect(query.answer).toContain("Server Note");

      const pages = await json<{ pages: Array<{ title: string }> }>(`${running.url}/api/pages?vault=${encodeURIComponent(vault)}`);
      expect(pages.pages[0].title).toBe("Server Note");

      const lint = await json<{ issues: unknown[] }>(`${running.url}/api/lint?vault=${encodeURIComponent(vault)}`);
      expect(lint.issues).toHaveLength(0);

      const home = await fetch(running.url);
      expect(await home.text()).toContain("Notva");
    } finally {
      await running.close();
    }
  });
});
