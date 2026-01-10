import { describe, it, expect } from "vitest";
import { embeddingManager } from "../src/embeddings.js";

describe("Embedding Manager", () => {
  it("should generate an embedding of correct dimension", async () => {
    const text = "Hello world";
    const embedding = await embeddingManager.generateEmbedding(text);
    
    expect(Array.isArray(embedding)).toBe(true);
    // all-MiniLM-L6-v2 typically has 384 dimensions
    expect(embedding.length).toBe(384);
  }, 30000); // Higher timeout for model download/loading
});
