export interface VaultPaths {
  root: string;
  notva: string;
  raw: string;
  wiki: string;
  schema: string;
  index: string;
  queue: string;
  logs: string;
  stateDb: string;
  config: string;
}

export interface InitVaultOptions {
  root: string;
}

export interface InitVaultResult {
  paths: VaultPaths;
}

export interface NotvaConfig {
  version: 1;
  createdAt: string;
}

export interface SourceRecord {
  id: string;
  kind: "file" | "url" | "text";
  title: string;
  rawPath: string;
  originalRef: string;
  createdAt: string;
  sha256: string;
}

export interface ProposalChange {
  type: "create_page" | "update_page";
  path: string;
  title: string;
  content: string;
}

export interface ProposalRecord {
  id: string;
  sourceId: string;
  status: "pending" | "accepted" | "rejected";
  summary: string;
  changes: ProposalChange[];
  createdAt: string;
  updatedAt: string;
}

export interface PageRecord {
  path: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface QueryHit {
  path: string;
  title: string;
  snippet: string;
}

export interface QueryResult {
  question: string;
  answer: string;
  hits: QueryHit[];
}

export interface ActResult {
  task: string;
  output: string;
  evidence: QueryHit[];
}

export interface LintIssue {
  code: string;
  message: string;
  path?: string;
}
