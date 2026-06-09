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

export interface ProposalSourceEvidence {
  source: SourceRecord;
  preview: string;
}

export interface ProposalDetail extends ProposalRecord {
  sourceEvidence?: ProposalSourceEvidence;
}

export interface PageRecord {
  path: string;
  title: string;
  body: string;
  updatedAt: string;
}

export type RelationConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type GraphNodeKind = "source" | "page" | "concept" | "claim" | "citation";

export interface GraphNodeRecord {
  id: string;
  label: string;
  kind: GraphNodeKind;
  path?: string;
  sourceId?: string;
}

export interface GraphEdgeRecord {
  source: string;
  target: string;
  relation: string;
  confidence: RelationConfidence;
  confidenceScore?: number;
  evidence?: string;
  sourceId?: string;
}

export interface GraphExport {
  schemaVersion: 1;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

export interface GraphNeighborhood {
  node: GraphNodeRecord;
  neighbors: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

export interface GraphBuildResult {
  nodeCount: number;
  edgeCount: number;
}

export interface QueryHit {
  path: string;
  title: string;
  snippet: string;
  sources: SourceRecord[];
  retrieval: QueryRetrievalMetadata;
}

export interface SourceHit {
  source: SourceRecord;
  snippet: string;
}

export type QueryRetrievalMethod = "lexical" | "semantic" | "hybrid";

export interface QueryRetrievalMetadata {
  method: QueryRetrievalMethod;
  lexicalScore: number;
  vectorScore: number;
  rerankScore: number;
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
  context: ContextPack;
  execution: ActExecutionPlan;
  actionResults: MaintenanceActionResult[];
  run: ActRunRecord;
}

export interface ActRunRecord {
  id: string;
  task: string;
  status: ActExecutionStatus;
  summary: string;
  outputPath: string;
  evidenceCount: number;
  sourceHitCount: number;
  actionCount: number;
  createdAt: string;
}

export interface ActRunDetail extends ActRunRecord {
  output: string;
  evidence: QueryHit[];
  sourceHits: SourceHit[];
  actionResults: MaintenanceActionResult[];
}

export type MaintenanceActionKind =
  | "source_propose_uncovered"
  | "links_propose"
  | "concepts_propose"
  | "review";

export interface MaintenanceActionResult {
  command: string;
  kind: MaintenanceActionKind;
  changed: boolean;
  message: string;
  data: unknown;
}

export type ActExecutionStatus = "ready" | "needs_maintenance" | "missing_context";

export interface ActExecutionPlan {
  status: ActExecutionStatus;
  summary: string;
  actions: ContextAction[];
}

export interface ContextAction {
  label: string;
  command: string;
  reason: string;
}

export interface ContextPack {
  query: string;
  answer: string;
  hits: QueryHit[];
  sourceHits: SourceHit[];
  sources: SourceRecord[];
  graph: {
    neighborhoods: GraphNeighborhood[];
  };
  actions: ContextAction[];
  rules: string;
  instructions: string;
}

export interface LintIssue {
  code: string;
  message: string;
  path?: string;
}

export type VaultHealth = "ready" | "needs_review";

export interface VaultStatus {
  root: string;
  health: VaultHealth;
  sourceCount: number;
  pageCount: number;
  pendingProposalCount: number;
  lintIssueCount: number;
  actRunCount: number;
  issueCounts: Record<string, number>;
  lastActRun?: ActRunRecord;
}
