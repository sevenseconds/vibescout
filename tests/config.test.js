import { describe, it, expect, beforeEach } from "vitest";
import { EmbeddingManager } from "../src/embeddings.js";

describe("Embedding Manager Configuration", () => {
  beforeEach(() => {
    delete process.env.EMBEDDING_MODEL;
  });

  it("should use the model specified in environment variables", () => {
    process.env.EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
    const manager = new EmbeddingManager();
    expect(manager.getModel()).toBe("Xenova/bge-small-en-v1.5");
  });

  it("should use default model if environment variable is not set", () => {
    const manager = new EmbeddingManager();
    expect(manager.getModel()).toBe("Xenova/bge-small-en-v1.5");
  });

  it("should allow changing the model at runtime", async () => {
    const manager = new EmbeddingManager();
    expect(manager.getModel()).toBe("Xenova/bge-small-en-v1.5");
    
    await manager.setModel("Xenova/all-MiniLM-L6-v2");
    expect(manager.getModel()).toBe("Xenova/all-MiniLM-L6-v2");
    expect(manager.pipe).toBeNull();
  });
});
