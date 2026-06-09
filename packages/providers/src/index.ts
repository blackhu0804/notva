export type ProviderKind = "llm" | "embedding" | "parser" | "search" | "storage";

export interface NotvaProvider {
  id: string;
  kind: ProviderKind;
}

export interface LlmCompletionRequest {
  prompt: string;
  context?: string[];
}

export interface LlmCompletion {
  text: string;
  providerId: string;
}

export interface LlmProvider extends NotvaProvider {
  kind: "llm";
  complete(request: LlmCompletionRequest): Promise<LlmCompletion>;
}

export interface EmbeddingResult {
  values: number[];
  dimensions: number;
  providerId: string;
}

export interface EmbeddingProvider extends NotvaProvider {
  kind: "embedding";
  embed(input: string): Promise<EmbeddingResult>;
}

export interface ParserInput {
  source: string;
  content: string;
  mediaType?: string;
}

export interface ParserOutput {
  text: string;
  metadata: Record<string, string>;
}

export interface ParserProvider extends NotvaProvider {
  kind: "parser";
  parse(input: ParserInput): Promise<ParserOutput>;
}

export interface SearchDocument {
  id: string;
  text: string;
  metadata?: Record<string, string>;
}

export interface SearchRequest {
  query: string;
  documents: SearchDocument[];
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, string>;
}

export interface SearchProvider extends NotvaProvider {
  kind: "search";
  search(request: SearchRequest): Promise<SearchResult[]>;
}

export interface StorageProvider extends NotvaProvider {
  kind: "storage";
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

export interface ProviderRegistry {
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  search: SearchProvider;
  parser?: ParserProvider;
  storage?: StorageProvider;
}

export function createRuleBasedLlmProvider(): LlmProvider {
  return {
    id: "local-rule-based",
    kind: "llm",
    async complete(request) {
      const context = request.context?.filter((entry) => entry.trim()) ?? [];
      const text = context.length > 0
        ? context.join("\n")
        : `No reviewed Notva context was provided for: ${request.prompt}`;
      return {
        text,
        providerId: "local-rule-based"
      };
    }
  };
}

export function createNoopEmbeddingProvider(dimensions = 8): EmbeddingProvider {
  return {
    id: "local-noop-embedding",
    kind: "embedding",
    async embed(input) {
      const values = Array.from({ length: dimensions }, (_, index) => {
        const code = input.charCodeAt(index % Math.max(input.length, 1)) || 0;
        return Number(((code % 97) / 97).toFixed(6));
      });
      return {
        values,
        dimensions,
        providerId: "local-noop-embedding"
      };
    }
  };
}

export function createSubstringSearchProvider(): SearchProvider {
  return {
    id: "local-substring-search",
    kind: "search",
    async search(request) {
      const terms = request.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const scored = request.documents
        .map((document) => ({
          document,
          score: substringScore(document.text, terms)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
        .slice(0, request.limit ?? request.documents.length);
      return scored.map(({ document, score }) => ({
        id: document.id,
        score,
        text: document.text,
        metadata: document.metadata
      }));
    }
  };
}

export function createLocalProviderRegistry(): ProviderRegistry {
  return {
    llm: createRuleBasedLlmProvider(),
    embedding: createNoopEmbeddingProvider(),
    search: createSubstringSearchProvider()
  };
}

function substringScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLocaleLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
