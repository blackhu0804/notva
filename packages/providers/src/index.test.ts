import { describe, expect, test } from "vitest";
import {
  createLocalProviderRegistry,
  createNoopEmbeddingProvider,
  createRuleBasedLlmProvider,
  createSubstringSearchProvider,
  type EmbeddingProvider,
  type LlmProvider,
  type ParserProvider,
  type SearchProvider,
  type StorageProvider
} from "./index.js";

describe("provider adapters", () => {
  test("exposes provider interfaces for LLM, embedding, parser, search, and storage adapters", () => {
    const llm: LlmProvider = createRuleBasedLlmProvider();
    const embedding: EmbeddingProvider = createNoopEmbeddingProvider();
    const search: SearchProvider = createSubstringSearchProvider();
    const parser: ParserProvider = {
      id: "test-parser",
      kind: "parser",
      parse: async (input) => ({ text: input.content, metadata: { source: input.source } })
    };
    const storage: StorageProvider = {
      id: "test-storage",
      kind: "storage",
      read: async () => "stored",
      write: async () => undefined
    };

    expect(llm.kind).toBe("llm");
    expect(embedding.kind).toBe("embedding");
    expect(search.kind).toBe("search");
    expect(parser.kind).toBe("parser");
    expect(storage.kind).toBe("storage");
  });

  test("provides local defaults that avoid hard-coding a remote model vendor", async () => {
    const registry = createLocalProviderRegistry();

    expect(registry.llm.id).toBe("local-rule-based");
    expect(registry.embedding.id).toBe("local-noop-embedding");
    expect(registry.search.id).toBe("local-substring-search");

    const completion = await registry.llm.complete({
      prompt: "Summarize Notva",
      context: ["Notva preserves local raw sources.", "Notva maintains reviewed wiki pages."]
    });
    expect(completion.text).toContain("Notva preserves local raw sources.");
    expect(completion.providerId).toBe("local-rule-based");

    const vector = await registry.embedding.embed("Notva local vault");
    expect(vector.providerId).toBe("local-noop-embedding");
    expect(vector.dimensions).toBeGreaterThan(0);
    expect(vector.values).toHaveLength(vector.dimensions);

    const results = await registry.search.search({
      query: "vault",
      documents: [
        { id: "a", text: "Notva local vault" },
        { id: "b", text: "Other note" }
      ]
    });
    expect(results.map((result) => result.id)).toEqual(["a"]);
  });
});
