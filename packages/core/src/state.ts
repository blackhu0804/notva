import { DatabaseSync } from "node:sqlite";
import type { PageRecord, ProposalChange, ProposalRecord, QueryHit, SourceRecord } from "./types.js";

interface SourceRow {
  id: string;
  kind: SourceRecord["kind"];
  title: string;
  raw_path: string;
  original_ref: string;
  created_at: string;
  sha256: string;
}

interface ProposalRow {
  id: string;
  source_id: string;
  status: ProposalRecord["status"];
  summary: string;
  changes_json: string;
  created_at: string;
  updated_at: string;
}

interface PageRow {
  path: string;
  title: string;
  body: string;
  updated_at: string;
}

export class NotvaState {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        raw_path TEXT NOT NULL,
        original_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sha256 TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        changes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES sources(id)
      );

      CREATE TABLE IF NOT EXISTS pages (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(path, title, body);
    `);
  }

  close(): void {
    this.db.close();
  }

  insertSource(source: SourceRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sources (id, kind, title, raw_path, original_ref, created_at, sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(source.id, source.kind, source.title, source.rawPath, source.originalRef, source.createdAt, source.sha256);
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRow | undefined;
    return row ? mapSource(row) : undefined;
  }

  listSources(): SourceRecord[] {
    return (this.db.prepare("SELECT * FROM sources ORDER BY created_at ASC").all() as unknown as SourceRow[]).map(mapSource);
  }

  insertProposal(proposal: ProposalRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO proposals (id, source_id, status, summary, changes_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposal.id,
      proposal.sourceId,
      proposal.status,
      proposal.summary,
      JSON.stringify(proposal.changes),
      proposal.createdAt,
      proposal.updatedAt
    );
  }

  getProposal(id: string): ProposalRecord | undefined {
    const row = this.db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as ProposalRow | undefined;
    return row ? mapProposal(row) : undefined;
  }

  listPendingProposals(): ProposalRecord[] {
    return (this.db.prepare("SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at ASC").all() as unknown as ProposalRow[])
      .map(mapProposal);
  }

  markProposalStatus(id: string, status: ProposalRecord["status"], updatedAt: string): void {
    this.db.prepare("UPDATE proposals SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id);
  }

  upsertPage(page: PageRecord): void {
    this.db.prepare(`
      INSERT INTO pages (path, title, body, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        updated_at = excluded.updated_at
    `).run(page.path, page.title, page.body, page.updatedAt);

    this.db.prepare("DELETE FROM page_fts WHERE path = ?").run(page.path);
    this.db.prepare("INSERT INTO page_fts (path, title, body) VALUES (?, ?, ?)").run(page.path, page.title, page.body);
  }

  listPages(): PageRecord[] {
    return (this.db.prepare("SELECT * FROM pages ORDER BY path ASC").all() as unknown as PageRow[]).map(mapPage);
  }

  searchPages(query: string, limit = 5): QueryHit[] {
    const match = toFtsQuery(query);
    const hits: QueryHit[] = [];
    if (match) {
      try {
        hits.push(...this.db.prepare(`
          SELECT path, title, snippet(page_fts, 2, '[', ']', '...', 16) AS snippet
          FROM page_fts
          WHERE page_fts MATCH ?
          LIMIT ?
        `).all(match, limit) as unknown as QueryHit[]);
      } catch {
        // FTS5 tokenization is not enough for all languages; fallback search below keeps Unicode content searchable.
      }
    }

    if (hits.length >= limit) return hits.slice(0, limit);

    const seen = new Set(hits.map((hit) => hit.path));
    const fallback = fallbackSearch(query, this.listPages(), limit - hits.length, seen);
    return [...hits, ...fallback];
  }
}

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    rawPath: row.raw_path,
    originalRef: row.original_ref,
    createdAt: row.created_at,
    sha256: row.sha256
  };
}

function mapProposal(row: ProposalRow): ProposalRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    summary: row.summary,
    changes: JSON.parse(row.changes_json) as ProposalChange[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPage(row: PageRow): PageRecord {
  return {
    path: row.path,
    title: row.title,
    body: row.body,
    updatedAt: row.updated_at
  };
}

function toFtsQuery(query: string): string {
  return unicodeTokens(query)
    .slice(0, 8)
    .map((token) => `${token}*`)
    .join(" OR ");
}

function fallbackSearch(query: string, pages: PageRecord[], limit: number, seen: Set<string>): QueryHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  return pages
    .filter((page) => !seen.has(page.path))
    .map((page) => {
      const haystack = `${page.title}\n${page.path}\n${page.body}`.toLocaleLowerCase();
      const matchedTerms = terms.filter((term) => haystack.includes(term));
      return { page, matchedTerms };
    })
    .filter((candidate) => candidate.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length)
    .slice(0, limit)
    .map(({ page, matchedTerms }) => ({
      path: page.path,
      title: page.title,
      snippet: snippetFor(page.body, matchedTerms[0])
    }));
}

function searchTerms(query: string): string[] {
  const tokens = unicodeTokens(query);
  const cjkGrams = [...query.matchAll(/[\p{Script=Han}]{2,}/gu)]
    .flatMap((match) => bigrams(match[0].toLocaleLowerCase()));
  return [...new Set([...tokens, ...cjkGrams])].filter((term) => term.length > 1);
}

function unicodeTokens(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .match(/[\p{Letter}\p{Number}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function bigrams(input: string): string[] {
  const chars = [...input];
  const grams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return grams;
}

function snippetFor(body: string, term: string): string {
  const lowerBody = body.toLocaleLowerCase();
  const index = lowerBody.indexOf(term);
  if (index === -1) return body.replace(/\s+/g, " ").slice(0, 160);
  const start = Math.max(0, index - 48);
  const end = Math.min(body.length, index + term.length + 96);
  return `${start > 0 ? "..." : ""}${body.slice(start, end).replace(/\s+/g, " ")}${end < body.length ? "..." : ""}`;
}
