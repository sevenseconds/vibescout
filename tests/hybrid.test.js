import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";
import { clearDatabase } from "../src/db.js";
import { handleIndexFolder, handleSearchCode } from "../src/core.js";
import path from "path";
import fs from "fs-extra";

vi.mock("../src/embeddings.js", () => ({
  embeddingManager: {
    generateEmbedding: vi.fn(async (text) => {
      // Deterministic vector: high values for authentication-related content
      if (text.toLowerCase().includes("authentication") || 
          text.toLowerCase().includes("sign in") || 
          text.includes("ZYX_UNIQUE_KEYWORD")) {
        return new Array(384).fill(0.9);
      }
      return new Array(384).fill(0.1);
    }),
    getModel: () => "mock-model",
    setModel: vi.fn()
  },
  rerankerManager: {
    rerank: vi.fn(async (query, docs) => docs.map(d => ({ ...d, rerankScore: 0.99 })))
  },
  summarizerManager: {
    summarize: vi.fn(async () => "Mocked Summary"),
    modelName: "mock-summarizer"
  },
  configureEnvironment: vi.fn()
}));

vi.spyOn(process, "exit").mockImplementation(() => {});

describe("Hybrid Search", () => {
  const testDir = path.join(process.cwd(), "temp_hybrid_test");

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await fs.remove(testDir);
    await clearDatabase();
  });

  it("should find results via both conceptual and exact keyword search", async () => {
    await fs.ensureDir(testDir);
    const filePath = path.join(testDir, "test.ts");
    await fs.writeFile(filePath, `
      /**
       * Handles user authentication logic
       */
      export function login() {
        const secret = "ZYX_UNIQUE_KEYWORD";
        return true;
      }
    `);

    await handleIndexFolder(testDir, "HybridProj");

    // Test exact keyword (FTS)
    const res1 = await handleSearchCode("ZYX_UNIQUE_KEYWORD");
    expect(res1.content[0].text).toContain("test.ts");

    // Test conceptual (Vector)
    const res2 = await handleSearchCode("How to sign in users?");
    expect(res2.content[0].text).toContain("test.ts");
  }, 10000);
});
